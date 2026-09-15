#!/usr/bin/env python3
"""generate.py — sample novel ranking-shorts concepts from ai/model_params.json.

The model is a set of per-niche interpolated bigram (Markov) chains over title
and rank-label word sequences, plus learned categorical distributions for
emoji, num_ranks, reveal_order, number-color-per-position and accent-word
placement. Everything here is Python 3 stdlib only.

CLI:
    python3 ai/generate.py --niche fails --ranks 6 --count 5
    python3 ai/generate.py --count 10 --seed 42
    python3 ai/generate.py --app-bank app/model.json --per-niche 5 --embed-params

train.py imports the sampling functions from this module so that held-out
validation exercises the exact code path used at generation time.
"""

import argparse
import json
import os
import random
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_PARAMS = os.path.join(HERE, "model_params.json")

START = "<s>"
END = "</s>"

# ---------------------------------------------------------------------------
# Core sampling primitives
# ---------------------------------------------------------------------------

def weighted_choice(dist, rng):
    """dist: {item: weight}. Returns an item sampled proportionally."""
    total = sum(dist.values())
    r = rng.random() * total
    acc = 0.0
    for item, w in dist.items():
        acc += w
        if r <= acc:
            return item
    return next(iter(dist))  # float fallback


def build_avoid(train_labels):
    """Prefix index over the FULL training-label corpus, used to steer the
    sampler off verbatim reproductions at branch points."""
    prefixes, full = set(), set()
    for lab in train_labels:
        toks = lab.split()
        full.add(lab)
        for i in range(1, len(toks) + 1):
            prefixes.add(" ".join(toks[:i]))
    return {"prefixes": prefixes, "full": full}


def sample_sequence(niche_bigrams, global_bigrams, rng, min_len, max_len,
                    avoid=None, explore=0.75):
    """Walk the bigram chain from <s> until </s>; returns a token list.

    Strict niche-first backoff (QA bug AI-2): the global model is consulted
    ONLY when the niche model has never seen the current context token, so
    labels/titles stay on-niche instead of being cross-niche interpolations.

    Off-rail exploration (QA bug AI-1): when `avoid` (a training-label prefix
    index) is given, at each branch point the sampler prefers, with
    probability `explore`, continuations that stop the sequence from staying
    a verbatim prefix of any training label — every transition is still a
    niche-observed bigram, so results stay coherent but recombine.
    """
    tok = START
    out = []
    while len(out) < max_len:
        dist = niche_bigrams.get(tok) or global_bigrams.get(tok)
        if not dist:
            break
        use = dist
        if avoid and len(dist) > 1 and rng.random() < explore:
            cur = " ".join(out).casefold()
            off = {}
            for w, c in dist.items():
                if w == END:
                    # never steer INTO an early stop: bare 1-word stubs read
                    # as junk, so off-rail END needs 2+ tokens on the page
                    if len(out) >= max(min_len, 2) and cur not in avoid["full"]:
                        off[w] = c
                else:
                    cand = (cur + " " + w.casefold()).strip()
                    if cand not in avoid["prefixes"]:
                        off[w] = c
            if off:
                use = off
        nxt = weighted_choice(use, rng)
        if nxt == END:
            if len(out) >= min_len:
                break
            trimmed = {w: p for w, p in dist.items() if w != END}
            if not trimmed:
                break
            nxt = weighted_choice(trimmed, rng)
        out.append(nxt)
        tok = nxt
    return out


# ---------------------------------------------------------------------------
# Concept-level generation
# ---------------------------------------------------------------------------

TITLE_STARTERS = ("ranking", "top", "the")


def title_well_formed(tokens):
    if not (4 <= len(tokens) <= 9):
        return False
    if tokens[0].lower() not in TITLE_STARTERS:
        return False
    if tokens[-1].lower() in FUNCTION_WORDS:  # truncated ("... Breaks the")
        return False
    return all(END not in t and START not in t for t in tokens)


def label_ok(tokens):
    if not (1 <= len(tokens) <= 5) or any(t in (START, END) for t in tokens):
        return False
    content = [t.casefold() for t in tokens if t.casefold() not in FUNCTION_WORDS]
    return len(set(content)) == len(content)  # no "Experiment vs Experiment"


def mutate_sequence(toks, nb, gb, rng, max_len=5):
    """Bigram-consistent mutation: pick a position, swap in an alternative
    continuation of its predecessor, regrow the suffix along the chain.
    Every transition stays a niche-observed bigram, so the result reads
    coherently but breaks off the verbatim rail."""
    idxs = list(range(len(toks)))
    rng.shuffle(idxs)
    for i in idxs:
        prev = toks[i - 1] if i > 0 else START
        dist = nb.get(prev) or gb.get(prev) or {}
        alts = {w: c for w, c in dist.items() if w != END and w != toks[i]}
        if not alts:
            continue
        seq = toks[:i] + [weighted_choice(alts, rng)]
        tok = seq[-1]
        while len(seq) < max_len:
            d = nb.get(tok) or gb.get(tok)
            if not d:
                break
            nxt = weighted_choice(d, rng)
            if nxt == END:
                break
            seq.append(nxt)
            tok = nxt
        return seq
    return toks


FUNCTION_WORDS = {"the", "a", "an", "of", "in", "on", "for", "to", "got",
                  "gets", "get", "is", "was", "he", "she", "it", "this",
                  "that", "really", "like", "said", "with", "and", "vs",
                  "after", "over", "no", "not", "at", "by", "so", "his",
                  "her", "went", "goes", "had", "chose"}


def positional_swap(niche_labels, rng, train_labels, used, tries=15):
    """Last-resort novelty for niches whose label graphs are pure tries (no
    shared interior words, so bigram recombination is impossible): swap one
    word with the word at the same position in another same-length label of
    the SAME niche. Stays on-niche and keeps the label's rhythm."""
    labels = [l.split() for l in niche_labels if 2 <= len(l.split()) <= 5]
    for _ in range(tries):
        if len(labels) < 2:
            return None
        a = rng.choice(labels)
        # only exchange content-word positions — swapping function words
        # ("the", "got", "in", ...) produces ungrammatical junk
        slots = [i for i, w in enumerate(a) if w.casefold() not in FUNCTION_WORDS]
        if not slots:
            continue
        i = rng.choice(slots)
        donors = [l for l in labels
                  if len(l) == len(a) and l[i].casefold() != a[i].casefold()
                  and l[i].casefold() not in FUNCTION_WORDS]
        if not donors:
            continue
        cand = a[:]
        cand[i] = rng.choice(donors)[i]
        if i == 0 and cand[0][0].islower():
            cand[0] = cand[0][0].upper() + cand[0][1:]
        words = [w.casefold() for w in cand]
        if len(set(words)) != len(words):
            continue  # e.g. "Experiment vs Experiment"
        label = " ".join(cand)
        key = label.casefold()
        if key not in train_labels and key not in used:
            return label
    return None


def sample_label(nm, gm, rng, train_labels, used, avoid=None, tries=20):
    """Sample a 1-5 word label, preferring ones NOT verbatim anywhere in the
    FULL training data (all niches) and not already used in this concept.
    `train_labels` must be a casefolded set spanning ALL niches."""
    nb, gb = nm["label_bigrams"], gm["label_bigrams"]
    best = None
    for _ in range(tries):
        toks = sample_sequence(nb, gb, rng, 1, 5, avoid)
        if not label_ok(toks):
            continue
        label = " ".join(toks)
        key = label.casefold()
        if key in used:
            continue
        if best is None:
            best = label
        if key not in train_labels:
            return label, False
    # resampling kept landing on verbatim training labels (deterministic
    # chain) — force novelty via bigram-consistent mutation
    if best is not None:
        for _ in range(10):
            toks = mutate_sequence(best.split(), nb, gb, rng)
            if not label_ok(toks):
                continue
            label = " ".join(toks)
            key = label.casefold()
            if key not in train_labels and key not in used:
                return label, False
    # trie-shaped niche graph — recombine by positional word exchange
    swapped = positional_swap(nm.get("train_labels", []), rng, train_labels, used)
    if swapped:
        return swapped, False
    if best is None:
        best = "Instant regret"  # ultra-rare structural fallback
    return best, best.casefold() in train_labels


ACCENT_STOPWORDS = {"the", "a", "of", "from", "to", "best", "worst", "ever",
                    "most", "ranking", "top", "craziest", "funniest", "until"}


def accent_ok(span):
    """Accent must contain at least one content word and not start on a
    function/comparative word (avoids accents like 'the Best')."""
    if not span or span[0].lower() in ACCENT_STOPWORDS:
        return False
    return any(t.lower() not in ACCENT_STOPWORDS for t in span)


def sample_title_and_accent(nm, gm, rng, tries=8):
    """Sample a title, then place the accent word using the learned
    (accent_len, tokens_after_accent) placement distribution."""
    toks = None
    for _ in range(tries):
        cand = sample_sequence(nm["title_bigrams"], gm["title_bigrams"], rng, 3, 9)
        if title_well_formed(cand):
            toks = cand
            break
    if toks is None:
        toks = cand if cand else ["Ranking", "Best", "Moments"]

    placements = nm.get("accent_placement") or gm.get("accent_placement") or {"2|0": 1}
    for _ in range(8):
        klen, after = (int(x) for x in weighted_choice(placements, rng).split("|"))
        end = len(toks) - after
        start = end - klen
        if start >= 1 and end <= len(toks):
            span = toks[start:end]
            accent = " ".join(span)
            if accent_ok(span):
                return " ".join(toks), accent
    # fallback: longest trailing run of content words
    tail = []
    for t in reversed(toks[1:]):
        if t.lower() in ACCENT_STOPWORDS:
            break
        tail.insert(0, t)
    return " ".join(toks), " ".join(tail) if tail else toks[-1]


def fix_title_number(title, accent, num_ranks):
    """QA bug AI-4: make numbered titles ('Top 5 ...') agree with num_ranks."""
    swap = lambda t: str(num_ranks) if t.isdigit() else t
    return (" ".join(swap(t) for t in title.split()),
            " ".join(swap(t) for t in accent.split()))


def sample_emoji(nm, gm, rng, used):
    freq = dict(nm.get("emoji_freq") or gm.get("emoji_freq") or {"🔥": 1})
    for e in used:
        freq.pop(e, None)
    if not freq:
        freq = dict(nm.get("emoji_freq") or {"🔥": 1})
    return weighted_choice(freq, rng)


def sample_number_colors(nm, gm, rng, n):
    per_pos = nm.get("color_pos_freq") or gm.get("color_pos_freq") or []
    cycle = ["gold", "white", "red"]
    colors = []
    for i in range(n):
        dist = per_pos[i] if i < len(per_pos) and per_pos[i] else None
        colors.append(weighted_choice(dist, rng) if dist else cycle[i % 3])
    return colors


def resolve_niche(params, niche_query, rng):
    niches = params["niches"]
    if niche_query:
        q = niche_query.strip().lower()
        if q in niches:
            return q
        for name in niches:
            if q in name or name in q:
                return name
    return rng.choice(sorted(niches))


def generate_concept(params, niche=None, num_ranks=None, rng=None):
    """Returns (concept_dict, novelty_flags) where novelty_flags is a list of
    booleans marking which labels were verbatim training copies."""
    rng = rng or random.Random()
    gm = params["global"]
    name = resolve_niche(params, niche, rng)
    nm = params["niches"][name]

    if not num_ranks:
        dist = {int(k): v for k, v in nm["num_ranks_dist"].items()}
        num_ranks = weighted_choice({str(k): v for k, v in dist.items()}, rng)
        num_ranks = int(num_ranks)
    num_ranks = max(3, min(10, int(num_ranks)))

    title, accent = sample_title_and_accent(nm, gm, rng)
    title, accent = fix_title_number(title, accent, num_ranks)
    # QA bug AI-1: novelty must be judged against the FULL dataset, not just
    # this niche's labels — the union below is what "verbatim copy" means.
    train_labels = {l.casefold() for l in nm.get("train_labels", [])} | \
                   {l.casefold() for l in gm.get("train_labels", [])}
    avoid = build_avoid(train_labels)

    used_labels, used_emoji, ranks, copied = set(), set(), [], []
    tail_counts = {}
    for pos in range(1, num_ranks + 1):
        for attempt in range(4):  # keep tail-words varied within a concept
            label, was_copy = sample_label(nm, gm, rng, train_labels, used_labels, avoid)
            tail = label.split()[-1].casefold()
            if tail_counts.get(tail, 0) < 2:
                break
        tail_counts[tail] = tail_counts.get(tail, 0) + 1
        used_labels.add(label.casefold())
        emoji = sample_emoji(nm, gm, rng, used_emoji)
        used_emoji.add(emoji)
        ranks.append({"position": pos, "label": label, "emoji": emoji})
        copied.append(was_copy)

    concept = {
        "niche": name,
        "title": title,
        "accent_word": accent,
        "ranks": ranks,
        "style": {"number_colors": sample_number_colors(nm, gm, rng, num_ranks)},
    }
    return concept, copied


# ---------------------------------------------------------------------------
# Concept-bank export for the app (app/model.json)
# ---------------------------------------------------------------------------

VALID_COLORS = {"gold", "white", "red"}


def validate_concept(c):
    errs = []
    if not isinstance(c.get("title"), str) or not c["title"].strip():
        errs.append("missing title")
    if not isinstance(c.get("accent_word"), str) or c["accent_word"] not in c.get("title", ""):
        errs.append("accent_word not a substring of title")
    ranks = c.get("ranks")
    if not isinstance(ranks, list) or not ranks:
        errs.append("missing ranks")
    else:
        for i, r in enumerate(ranks):
            if r.get("position") != i + 1:
                errs.append("positions not 1..N")
                break
        for r in ranks:
            n = len(str(r.get("label", "")).split())
            if not (1 <= n <= 5):
                errs.append("label '%s' not 1-5 words" % r.get("label"))
            if not r.get("emoji"):
                errs.append("missing emoji")
    nc = (c.get("style") or {}).get("number_colors")
    if nc is not None:
        if len(nc) != len(ranks or []) or any(x not in VALID_COLORS for x in nc):
            errs.append("bad number_colors")
    return errs


def build_app_bank(params, per_niche, seed=None, embed_params=False):
    rng = random.Random(seed)
    concepts, total_labels, copied_labels = [], 0, 0
    for name in sorted(params["niches"]):
        seen_titles = set()
        for _ in range(per_niche):
            for _try in range(10):
                c, copied = generate_concept(params, name, None, rng)
                if c["title"] not in seen_titles:
                    break
            seen_titles.add(c["title"])
            errs = validate_concept(c)
            if errs:
                raise ValueError("invalid concept for %s: %s" % (name, errs))
            concepts.append(c)
            total_labels += len(copied)
            copied_labels += sum(copied)
    bank = {"concepts": concepts}
    if embed_params:
        bank["params"] = slim_params(params)
    stats = {
        "concepts": len(concepts),
        "labels": total_labels,
        "verbatim_labels": copied_labels,
        "verbatim_pct": round(100.0 * copied_labels / max(1, total_labels), 1),
    }
    return bank, stats


def slim_params(params):
    """Params subset shipped to the browser sampler (drops duration stats
    and train_titles; keeps label lists for novelty resampling/swaps plus
    everything sampling needs)."""
    keep = ("label_bigrams", "title_bigrams", "emoji_freq", "num_ranks_dist",
            "color_pos_freq", "accent_placement", "reveal_order_dist",
            "train_labels")  # labels needed for novelty resampling + swaps
    slim = {"global": {k: params["global"][k] for k in keep if k in params["global"]},
            "niches": {}}
    for name, nm in params["niches"].items():
        slim["niches"][name] = {k: nm[k] for k in keep if k in nm}
    return slim


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main():
    ap = argparse.ArgumentParser(description="Generate ranking-shorts concepts from the trained model.")
    ap.add_argument("--params", default=DEFAULT_PARAMS)
    ap.add_argument("--niche", default=None, help="one of the trained niches (e.g. fails, nba, food)")
    ap.add_argument("--ranks", type=int, default=None, help="number of ranks (3-10); learned prior if omitted")
    ap.add_argument("--count", type=int, default=3)
    ap.add_argument("--seed", type=int, default=None)
    ap.add_argument("--app-bank", default=None, metavar="PATH",
                    help="instead of printing concepts, write an app model.json concept bank to PATH")
    ap.add_argument("--per-niche", type=int, default=5, help="concepts per niche for --app-bank")
    ap.add_argument("--embed-params", action="store_true",
                    help="with --app-bank: embed slim sampler params for live in-browser generation")
    args = ap.parse_args()

    with open(args.params, "r", encoding="utf-8") as f:
        params = json.load(f)

    if args.app_bank:
        bank, stats = build_app_bank(params, args.per_niche, args.seed, args.embed_params)
        with open(args.app_bank, "w", encoding="utf-8") as f:
            json.dump(bank, f, ensure_ascii=False, indent=1)
        print("Wrote %s: %d concepts across %d niches (%d labels, %.1f%% verbatim-from-training)"
              % (args.app_bank, stats["concepts"], len(params["niches"]),
                 stats["labels"], stats["verbatim_pct"]))
        return

    rng = random.Random(args.seed)
    total, copied = 0, 0
    for i in range(args.count):
        c, flags = generate_concept(params, args.niche, args.ranks, rng)
        total += len(flags)
        copied += sum(flags)
        errs = validate_concept(c)
        print(json.dumps(c, ensure_ascii=False, indent=1))
        if errs:
            print("  !! schema errors: %s" % errs, file=sys.stderr)
    print("\n[%d concepts | %d labels | %.1f%% verbatim copies of full-dataset training labels]"
          % (args.count, total, 100.0 * copied / max(1, total)), file=sys.stderr)


if __name__ == "__main__":
    main()
