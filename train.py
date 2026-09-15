#!/usr/bin/env python3
"""train.py — trains the ranking-shorts concept model. Python 3 stdlib only.

Reads  data/ranking_shorts_dataset.json  and  data/niches.json  and LEARNS:
  * per-niche (+ global backoff) bigram Markov chains over title token
    sequences and rank-label token sequences,
  * per-niche categorical distributions: emoji frequency, num_ranks,
    reveal_order priors, number-color-per-position frequencies,
    accent-word placement (length + offset from title end),
  * duration mean/std per rank position.

Validation: stratified 85/15 split per niche. A model trained only on the
train split is scored on the held-out split (label & title perplexity,
emoji/num_ranks coverage) and via generation metrics (label length validity,
novelty vs training data, emoji validity, title well-formedness) using the
exact sampler from generate.py. The shipped ai/model_params.json is then
re-fit on 100% of the data (metrics stay from the held-out run, recorded in
meta).

Usage:  python3 ai/train.py [--seed 7] [--holdout 0.15]
"""

import argparse
import json
import math
import os
import random
import re
import sys
from collections import Counter, defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)

import generate as G  # noqa: E402  (the shared sampler)

DATASET = os.path.join(ROOT, "data", "ranking_shorts_dataset.json")
NICHES = os.path.join(ROOT, "data", "niches.json")
OUT_PARAMS = os.path.join(HERE, "model_params.json")

START, END = G.START, G.END


# ---------------------------------------------------------------------------
# Counting / model fitting
# ---------------------------------------------------------------------------

def bigram_count(sequences):
    """sequences: iterable of token lists -> {tok: {next_tok: count}}"""
    table = defaultdict(Counter)
    for toks in sequences:
        chain = [START] + list(toks) + [END]
        for a, b in zip(chain, chain[1:]):
            table[a][b] += 1
    return {a: dict(c) for a, c in table.items()}


def tokens(text):
    return text.split()


def accent_placement(entry):
    """Learn where accent_word sits in the title: (len, tokens_after) key."""
    tt = tokens(entry["title"])
    at = tokens(entry["accent_word"])
    for i in range(len(tt) - len(at) + 1):
        if tt[i:i + len(at)] == at:
            return "%d|%d" % (len(at), len(tt) - (i + len(at)))
    return None


def synth_titles(niches_meta, niche_name):
    """Augment the title corpus with expansions of the Researcher's
    per-niche + global title templates (low weight: one pass each)."""
    meta = next((n for n in niches_meta["niches"] if n["name"] == niche_name), None)
    if not meta:
        return []
    templates = list(meta.get("title_templates", [])) + niches_meta.get("global_title_templates", [])
    subjects = meta.get("subjects", ["Moments"])
    adjectives = [a.replace("-", " ").title() for a in meta.get("adjectives", ["Crazy"])]
    out = []
    for t in templates:
        for subj in subjects:
            s = t
            s = s.replace("{X}", subj)
            s = s.replace("{ADJ}", random.Random(hash(t + subj) & 0xFFFF).choice(adjectives))
            s = s.replace("{N}", random.Random(hash(subj) & 0xFFFF).choice(["5", "7", "10"]))
            s = re.sub(r"\{[A-Z]+\}", subj, s)  # {ANIMAL}, {GAME}, {VERB}...
            out.append(tokens(s))
    return out


def synth_labels(niches_meta, niche_name):
    """Augment the label corpus with expansions of the Researcher's
    per-niche label_patterns filled from the same niche's subject/adjective
    banks. Adds on-niche bigram branching so the sampler can recombine
    instead of reproducing dataset labels verbatim. These synthetic labels
    go ONLY into the bigram tables — never into train_labels, so novelty is
    still measured against real dataset labels only."""
    meta = next((n for n in niches_meta["niches"] if n["name"] == niche_name), None)
    if not meta:
        return []
    patterns = meta.get("label_patterns", [])
    generic = {"moment", "moments", "ever", "video", "videos", "fail", "fails",
               "reaction", "reactions", "sound", "sounds", "run", "runs",
               "slow", "motion", "thing", "things"}
    subjects = []
    for s in meta.get("subjects", []):
        cands = [t for t in s.split() if singular(t).lower() not in generic]
        if cands:
            subjects.append(singular(cands[-1]))
    adjectives = [a.replace("-", " ").title() for a in meta.get("adjectives", [])]
    rng = random.Random(sum(ord(c) for c in niche_name))
    out = []
    for p in patterns:
        if "{" not in p:
            out.append(tokens(p))
            continue
        if re.search(r"\{(verb|onomatopoeia|emotion)", p, re.I):
            continue  # can't fill verb/interjection slots with noun banks
        fills = adjectives if re.search(r"\{adj", p, re.I) else subjects
        if not fills:
            continue
        for _ in range(min(6, len(fills))):  # cap expansions so patterns
            s = p                            # don't swamp real labels
            s = re.sub(r"\{N\}", lambda m: rng.choice(["5", "10", "50", "100"]), s)
            n_ph = len(re.findall(r"\{[^}]+\}", s))
            for w in rng.sample(fills, min(n_ph, len(fills))):
                s = re.sub(r"\{[^}]+\}", w, s, count=1)
            toks = tokens(s)
            if 1 <= len(toks) <= 5 and all(
                    a.lower() != b.lower() for a, b in zip(toks, toks[1:])):
                out.append(toks)
    return out


def singular(w):
    lw = w.lower()
    if lw.endswith(("ches", "shes", "sses", "xes")):
        return w[:-2]
    if lw.endswith("s") and not lw.endswith(("ss", "ies")):
        return w[:-1]
    return w


def fit(entries, niches_meta, augment_titles=True):
    """Fit full parameter set from a list of dataset entries."""
    by_niche = defaultdict(list)
    for e in entries:
        by_niche[e["niche"]].append(e)

    params = {"global": {}, "niches": {}}

    def collect(es, niche_name=None):
        m = {}
        titles = [tokens(e["title"]) for e in es]
        if augment_titles and niche_name:
            titles = titles + synth_titles(niches_meta, niche_name)
        m["title_bigrams"] = bigram_count(titles)
        labels = [tokens(r["label"]) for e in es for r in e["ranks"]]
        if niche_name:
            labels = labels + synth_labels(niches_meta, niche_name)
        m["label_bigrams"] = bigram_count(labels)
        m["emoji_freq"] = dict(Counter(r["emoji"] for e in es for r in e["ranks"]))
        m["num_ranks_dist"] = {str(k): v for k, v in Counter(e["num_ranks"] for e in es).items()}
        m["reveal_order_dist"] = dict(Counter(e.get("reveal_order", "worst_to_best") for e in es))
        placements = Counter(p for p in (accent_placement(e) for e in es) if p)
        m["accent_placement"] = dict(placements)
        # number colors per position index
        pos_colors = defaultdict(Counter)
        for e in es:
            for i, c in enumerate((e.get("style") or {}).get("number_colors", [])):
                if c in G.VALID_COLORS:
                    pos_colors[i][c] += 1
        m["color_pos_freq"] = [dict(pos_colors[i]) for i in range(max(pos_colors, default=-1) + 1)]
        # duration stats per position
        dur = defaultdict(list)
        for e in es:
            for r in e["ranks"]:
                dur[r["position"]].append(r["duration_sec"])
        m["duration_by_pos"] = {
            str(p): {"mean": round(sum(v) / len(v), 2),
                     "std": round(math.sqrt(sum((x - sum(v) / len(v)) ** 2 for x in v) / len(v)), 2),
                     "n": len(v)}
            for p, v in sorted(dur.items())}
        m["train_labels"] = sorted({r["label"] for e in es for r in e["ranks"]})
        m["train_titles"] = sorted({e["title"].casefold() for e in es})
        return m

    params["global"] = collect(entries, None)
    for name, es in by_niche.items():
        params["niches"][name] = collect(es, name)
    return params


# ---------------------------------------------------------------------------
# Held-out evaluation
# ---------------------------------------------------------------------------

def seq_logprob(toks, niche_bg, global_bg, k=0.25, mix=0.30):
    """Interpolated add-k bigram log-prob; vocab from both tables."""
    vocab = set()
    for tbl in (niche_bg, global_bg):
        for a, nxt in tbl.items():
            vocab.add(a)
            vocab.update(nxt)
    V = max(len(vocab), 1) + 1  # +1 for <unk>
    lp, n = 0.0, 0
    chain = [START] + list(toks) + [END]
    for a, b in zip(chain, chain[1:]):
        p = 0.0
        for tbl, w in ((niche_bg, 1.0 - mix), (global_bg, mix)):
            nxt = tbl.get(a, {})
            tot = sum(nxt.values())
            p += w * ((nxt.get(b, 0) + k) / (tot + k * V))
        lp += math.log(p)
        n += 1
    return lp, n


def perplexity(seqs_by_niche, params, table_key):
    lp, n = 0.0, 0
    for niche, seqs in seqs_by_niche.items():
        nm = params["niches"].get(niche, params["global"])
        for toks in seqs:
            l, c = seq_logprob(toks, nm[table_key], params["global"][table_key])
            lp += l
            n += c
    return math.exp(-lp / max(n, 1))


def evaluate(train_params, heldout, rng):
    rep = {}
    # --- intrinsic: perplexity + coverage on held-out data ---
    labels_by_niche = defaultdict(list)
    titles_by_niche = defaultdict(list)
    emoji_hits = emoji_total = ranks_hits = ranks_total = 0
    for e in heldout:
        titles_by_niche[e["niche"]].append(tokens(e["title"]))
        nm = train_params["niches"].get(e["niche"], train_params["global"])
        for r in e["ranks"]:
            labels_by_niche[e["niche"]].append(tokens(r["label"]))
            emoji_total += 1
            emoji_hits += r["emoji"] in nm["emoji_freq"]
        ranks_total += 1
        ranks_hits += str(e["num_ranks"]) in nm["num_ranks_dist"]
    rep["heldout_entries"] = len(heldout)
    rep["heldout_labels"] = sum(len(v) for v in labels_by_niche.values())
    rep["label_perplexity"] = round(perplexity(labels_by_niche, train_params, "label_bigrams"), 1)
    rep["title_perplexity"] = round(perplexity(titles_by_niche, train_params, "title_bigrams"), 1)
    rep["emoji_coverage_pct"] = round(100.0 * emoji_hits / max(emoji_total, 1), 1)
    rep["num_ranks_coverage_pct"] = round(100.0 * ranks_hits / max(ranks_total, 1), 1)

    # --- generation quality via the real sampler ---
    # QA bug AI-1: novelty is measured against the FULL training corpus
    # (all niches), not just the concept's own niche.
    all_train_labels = {l.casefold() for l in train_params["global"]["train_labels"]}
    all_train_titles = set(train_params["global"]["train_titles"])
    n_lab = n_valid_len = n_novel = n_emoji_ok = 0
    n_title = n_title_ok = n_title_novel = 0
    for niche, nm in train_params["niches"].items():
        valid_emoji = set(nm["emoji_freq"]) | set(train_params["global"]["emoji_freq"])
        for _ in range(6):
            c, copied = G.generate_concept(train_params, niche, None, rng)
            for r, was_copy in zip(c["ranks"], copied):
                n_lab += 1
                n_valid_len += 1 <= len(r["label"].split()) <= 5
                n_novel += r["label"].casefold() not in all_train_labels
                n_emoji_ok += r["emoji"] in valid_emoji
            n_title += 1
            n_title_ok += G.title_well_formed(tokens(c["title"])) and c["accent_word"] in c["title"]
            n_title_novel += c["title"].casefold() not in all_train_titles
    rep["gen_labels_sampled"] = n_lab
    rep["gen_label_len_valid_pct"] = round(100.0 * n_valid_len / n_lab, 1)
    rep["gen_label_novel_pct"] = round(100.0 * n_novel / n_lab, 1)
    rep["gen_label_verbatim_pct"] = round(100.0 - 100.0 * n_novel / n_lab, 1)
    rep["gen_emoji_valid_pct"] = round(100.0 * n_emoji_ok / n_lab, 1)
    rep["gen_titles_sampled"] = n_title
    rep["gen_title_wellformed_pct"] = round(100.0 * n_title_ok / n_title, 1)
    rep["gen_title_novel_pct"] = round(100.0 * n_title_novel / n_title, 1)
    return rep


# ---------------------------------------------------------------------------
# Pipeline
# ---------------------------------------------------------------------------

def stratified_split(entries, holdout_frac, rng):
    by_niche = defaultdict(list)
    for e in entries:
        by_niche[e["niche"]].append(e)
    train, held = [], []
    for niche in sorted(by_niche):
        es = by_niche[niche][:]
        rng.shuffle(es)
        k = max(1, round(len(es) * holdout_frac))
        held += es[:k]
        train += es[k:]
    return train, held


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--holdout", type=float, default=0.15)
    ap.add_argument("--out", default=OUT_PARAMS)
    args = ap.parse_args()
    rng = random.Random(args.seed)

    with open(DATASET, "r", encoding="utf-8") as f:
        dataset = json.load(f)
    with open(NICHES, "r", encoding="utf-8") as f:
        niches_meta = json.load(f)
    entries = dataset["entries"]
    n_labels = sum(len(e["ranks"]) for e in entries)
    niches = sorted({e["niche"] for e in entries})

    print("=" * 66)
    print("RANKING-SHORTS MODEL TRAINING")
    print("=" * 66)
    print("dataset: %d entries | %d rank labels | %d niches" % (len(entries), n_labels, len(niches)))

    # --- split, fit on train, evaluate on held-out ---
    train, held = stratified_split(entries, args.holdout, rng)
    print("split:   %d train / %d held-out (stratified %d%%/%d%% by niche)"
          % (len(train), len(held), round(100 * (1 - args.holdout)), round(100 * args.holdout)))
    train_params = fit(train, niches_meta)
    metrics = evaluate(train_params, held, random.Random(args.seed + 1))

    print("-" * 66)
    print("HELD-OUT VALIDATION (model fit on train split only)")
    print("  label bigram perplexity : %8.1f   (per-token, add-k smoothed)" % metrics["label_perplexity"])
    print("  title bigram perplexity : %8.1f" % metrics["title_perplexity"])
    print("  emoji coverage          : %7.1f%%  (held-out emoji seen in niche model)" % metrics["emoji_coverage_pct"])
    print("  num_ranks coverage      : %7.1f%%" % metrics["num_ranks_coverage_pct"])
    print("GENERATION METRICS (sampler on train-split model, %d labels / %d titles)"
          % (metrics["gen_labels_sampled"], metrics["gen_titles_sampled"]))
    print("  labels 1-5 words        : %7.1f%%" % metrics["gen_label_len_valid_pct"])
    print("  labels novel vs FULL set: %7.1f%%   (verbatim vs whole dataset: %.1f%% — target < 30%%)"
          % (metrics["gen_label_novel_pct"], metrics["gen_label_verbatim_pct"]))
    print("  emoji validity          : %7.1f%%" % metrics["gen_emoji_valid_pct"])
    print("  titles well-formed      : %7.1f%%" % metrics["gen_title_wellformed_pct"])
    print("  titles novel            : %7.1f%%" % metrics["gen_title_novel_pct"])

    # --- refit on 100% of data for the shipped model ---
    final_params = fit(entries, niches_meta)
    final_params["meta"] = {
        "trained_on": {"entries": len(entries), "labels": n_labels, "niches": niches},
        "split_seed": args.seed,
        "holdout_frac": args.holdout,
        "heldout_metrics": metrics,
        "architecture": "per-niche interpolated bigram Markov chains (titles + labels) "
                        "with global backoff, plus learned categorical distributions "
                        "(emoji, num_ranks, reveal_order, number-color-per-position, "
                        "accent placement) and per-position duration stats",
    }
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(final_params, f, ensure_ascii=False, indent=1)
    size_kb = os.path.getsize(args.out) / 1024.0
    print("-" * 66)
    print("shipped model refit on 100%% of data -> %s (%.0f KB)" % (args.out, size_kb))
    print("done.")


if __name__ == "__main__":
    main()
