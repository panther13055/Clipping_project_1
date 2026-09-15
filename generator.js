/* =========================================================================
 * generator.js — AI-assist module for Ranking Shorts Maker
 * =========================================================================
 * INTERFACE CONTRACT (for the AI Developer):
 *
 *   window.RankingGenerator.generateRankingConcept(niche?) -> Promise<Concept>
 *
 *   Concept = {
 *     title:       string,          // e.g. "Ranking Best Pool Fails"
 *     accent_word: string,          // phrase inside title to color red
 *     ranks: [                      // one entry per rank, position 1 = best
 *       { position: number,        // 1..N
 *         label:    string,        // short punchy text, e.g. "Aaaah"
 *         emoji:    string }       // one emoji, e.g. "💀"
 *     ],
 *     style: {                      // optional; app falls back to defaults
 *       number_colors?: string[],  // per-position: "gold" | "white" | "red"
 *       title_scale?:  number,     // 0.5 .. 2.0
 *       side_scale?:   number      // 0.5 .. 2.0
 *     }
 *   }
 *
 * DROP-IN MODEL:
 *   Place your trained model output at  app/model.json . On first call this
 *   module fetches it; if present it is used INSTEAD of the built-in
 *   templates. Two accepted shapes for model.json:
 *
 *   1) A "concept bank":   { "concepts": [ Concept, Concept, ... ] }
 *      -> a concept is picked at random (filtered by `niche` matching the
 *         concept's optional "niche" field, if given).
 *
 *   2) A custom module: replace window.RankingGenerator.generateRankingConcept
 *      entirely from your own script — the app only calls that one function
 *      and awaits its result, so any implementation (fetch to a local
 *      inference server, onnx in the browser, etc.) works.
 *
 * NOTE: the generator produces text/structure only. It cannot source video
 * clips — the app will always ask the user to supply their own clips.
 * ========================================================================= */
(function () {
  "use strict";

  // ---- Built-in placeholder templates (work before the model lands) ----
  const TEMPLATES = [
    {
      niche: "pool fails",
      title: "Ranking Best Pool Fails",
      accent_word: "Pool Fails",
      ranks: [
        { position: 1, label: "GOATED", emoji: "🐐" },
        { position: 2, label: "Insane", emoji: "🤯" },
        { position: 3, label: "Aaaah", emoji: "💀" },
        { position: 4, label: "Ouch", emoji: "😬" },
        { position: 5, label: "Bruh", emoji: "🤡" },
        { position: 6, label: "Mid", emoji: "😐" },
      ],
      style: { number_colors: ["gold", "white", "red", "white", "gold", "red"] },
    },
    {
      niche: "gym fails",
      title: "Ranking Worst Gym Fails",
      accent_word: "Gym Fails",
      ranks: [
        { position: 1, label: "R.I.P ego", emoji: "💀" },
        { position: 2, label: "Snapped", emoji: "😱" },
        { position: 3, label: "No spotter", emoji: "⚠️" },
        { position: 4, label: "Form??", emoji: "🤨" },
        { position: 5, label: "Almost", emoji: "😬" },
        { position: 6, label: "Warm-up", emoji: "🥱" },
      ],
      style: { number_colors: ["red", "gold", "white", "red", "white", "gold"] },
    },
    {
      niche: "goals",
      title: "Ranking Craziest Goals Ever",
      accent_word: "Goals",
      ranks: [
        { position: 1, label: "IMPOSSIBLE", emoji: "👑" },
        { position: 2, label: "Rocket", emoji: "🚀" },
        { position: 3, label: "Filthy", emoji: "🔥" },
        { position: 4, label: "Clean", emoji: "✨" },
        { position: 5, label: "Decent", emoji: "👍" },
        { position: 6, label: "Lucky", emoji: "🍀" },
      ],
      style: { number_colors: ["gold", "gold", "red", "white", "white", "red"] },
    },
    {
      niche: "cat moments",
      title: "Ranking Funniest Cat Moments",
      accent_word: "Cat Moments",
      ranks: [
        { position: 1, label: "CINEMA", emoji: "🎬" },
        { position: 2, label: "Chaos", emoji: "😹" },
        { position: 3, label: "Zoomies", emoji: "⚡" },
        { position: 4, label: "Sneaky", emoji: "🙈" },
        { position: 5, label: "Dramatic", emoji: "🎭" },
        { position: 6, label: "Sleepy", emoji: "😴" },
      ],
      style: { number_colors: ["gold", "white", "red", "gold", "white", "red"] },
    },
  ];

  // Extra labels used when a concept needs padding to N ranks
  const FILLER = [
    ["Wild", "🔥"], ["Nope", "🙅"], ["Sheesh", "🥶"], ["Certified", "💯"],
    ["Down bad", "📉"], ["Clip it", "🎥"], ["Cursed", "😳"], ["Legend", "🫡"],
  ];

  /* =====================================================================
   * LIVE STATISTICAL SAMPLER (AI Developer)
   * ---------------------------------------------------------------------
   * ai/train.py learns per-niche bigram Markov chains (titles + labels)
   * and categorical distributions (emoji, num_ranks, number colors,
   * accent placement) from data/ranking_shorts_dataset.json. Those params
   * are embedded in model.json under "params" (written by
   * `python3 ai/generate.py --app-bank app/model.json --embed-params`).
   * When present, concepts are sampled LIVE here — infinite variety —
   * mirroring ai/generate.py. Fallback chain stays intact:
   * params sampler -> model.json concept bank -> built-in TEMPLATES.
   * ===================================================================== */
  const START = "<s>", END = "</s>";
  const ACCENT_STOP = new Set(["the", "a", "of", "from", "to", "best", "worst",
    "ever", "most", "ranking", "top", "craziest", "funniest", "until"]);
  const TITLE_STARTERS = new Set(["ranking", "top", "the"]);

  function weightedChoice(dist) {
    let total = 0;
    for (const k in dist) total += dist[k];
    let r = Math.random() * total;
    let last = null;
    for (const k in dist) {
      last = k;
      r -= dist[k];
      if (r <= 0) return k;
    }
    return last;
  }

  const FUNCTION_WORDS = new Set(["the", "a", "an", "of", "in", "on", "for",
    "to", "got", "gets", "get", "is", "was", "he", "she", "it", "this",
    "that", "really", "like", "said", "with", "and", "vs", "after", "over",
    "no", "not", "at", "by", "so", "his", "her", "went", "goes", "had",
    "chose"]);

  // Prefix index over the FULL training-label corpus (all niches), used to
  // steer sampling off verbatim reproductions and to verify novelty.
  function buildAvoid(trainLabels) {
    const prefixes = new Set(), full = new Set();
    for (const lab of trainLabels) {
      const low = lab.toLowerCase();
      full.add(low);
      const toks = low.split(" ");
      for (let i = 1; i <= toks.length; i++) prefixes.add(toks.slice(0, i).join(" "));
    }
    return { prefixes, full };
  }

  // Strict niche-first backoff: the global model is consulted ONLY when the
  // niche model has never seen the current context token, so generated
  // labels/titles stay on-niche (no cross-niche interpolation). With
  // `avoid`, branch points prefer continuations that break away from
  // verbatim training-label prefixes (probability `explore`).
  function sampleSequence(nicheBg, globalBg, minLen, maxLen, avoid, explore) {
    let tok = START;
    const out = [];
    while (out.length < maxLen) {
      const dist = nicheBg[tok] || globalBg[tok];
      if (!dist || !Object.keys(dist).length) break;
      let use = dist;
      if (avoid && Object.keys(dist).length > 1 && Math.random() < (explore || 0.75)) {
        const cur = out.join(" ").toLowerCase();
        const off = {};
        for (const w in dist) {
          if (w === END) {
            if (out.length >= Math.max(minLen, 2) && !avoid.full.has(cur)) off[w] = dist[w];
          } else if (!avoid.prefixes.has((cur + " " + w.toLowerCase()).trim())) {
            off[w] = dist[w];
          }
        }
        if (Object.keys(off).length) use = off;
      }
      let nxt = weightedChoice(use);
      if (nxt === END) {
        if (out.length >= minLen) break;
        const trimmed = {};
        for (const k in use) if (k !== END) trimmed[k] = use[k];
        if (!Object.keys(trimmed).length) break;
        nxt = weightedChoice(trimmed);
      }
      out.push(nxt);
      tok = nxt;
    }
    return out;
  }

  function labelOk(toks) {
    if (toks.length < 1 || toks.length > 5) return false;
    if (toks.some((t) => t === START || t === END)) return false;
    const content = toks.map((t) => t.toLowerCase()).filter((t) => !FUNCTION_WORDS.has(t));
    return new Set(content).size === content.length;
  }

  // Bigram-consistent mutation: swap in an alternative continuation at a
  // random position and regrow the suffix along the niche chain.
  function mutateSequence(toks, nb, gb) {
    const idxs = toks.map((_, i) => i).sort(() => Math.random() - 0.5);
    for (const i of idxs) {
      const prev = i > 0 ? toks[i - 1] : START;
      const dist = nb[prev] || gb[prev] || {};
      const alts = {};
      for (const w in dist) if (w !== END && w !== toks[i]) alts[w] = dist[w];
      if (!Object.keys(alts).length) continue;
      const seq = toks.slice(0, i);
      seq.push(weightedChoice(alts));
      let tok = seq[seq.length - 1];
      while (seq.length < 5) {
        const d = nb[tok] || gb[tok];
        if (!d || !Object.keys(d).length) break;
        const nxt = weightedChoice(d);
        if (nxt === END) break;
        seq.push(nxt);
        tok = nxt;
      }
      return seq;
    }
    return toks;
  }

  // Last-resort novelty for trie-shaped niches: exchange one content word
  // with the same position of another same-length label of the SAME niche.
  function positionalSwap(nicheLabels, avoid, used) {
    const labels = nicheLabels.map((l) => l.split(" "))
      .filter((l) => l.length >= 2 && l.length <= 5);
    for (let t = 0; t < 15; t++) {
      if (labels.length < 2) return null;
      const a = labels[Math.floor(Math.random() * labels.length)];
      const slots = a.map((_, i) => i)
        .filter((i) => !FUNCTION_WORDS.has(a[i].toLowerCase()));
      if (!slots.length) continue;
      const i = slots[Math.floor(Math.random() * slots.length)];
      const donors = labels.filter((l) => l.length === a.length &&
        l[i].toLowerCase() !== a[i].toLowerCase() &&
        !FUNCTION_WORDS.has(l[i].toLowerCase()));
      if (!donors.length) continue;
      const cand = a.slice();
      cand[i] = donors[Math.floor(Math.random() * donors.length)][i];
      if (i === 0) cand[0] = cand[0][0].toUpperCase() + cand[0].slice(1);
      if (!labelOk(cand)) continue;
      const label = cand.join(" ");
      const key = label.toLowerCase();
      if (!avoid.full.has(key) && !used.has(key)) return label;
    }
    return null;
  }

  // 1-5 word label, novel vs the FULL training corpus when possible.
  function sampleLabelJS(nm, gm, avoid, used) {
    const nb = nm.label_bigrams || {}, gb = gm.label_bigrams || {};
    let best = null;
    for (let t = 0; t < 20; t++) {
      const toks = sampleSequence(nb, gb, 1, 5, avoid);
      if (!labelOk(toks)) continue;
      const label = toks.join(" ");
      const key = label.toLowerCase();
      if (used.has(key)) continue;
      if (!best) best = label;
      if (!avoid.full.has(key)) return label;
    }
    if (best) {
      for (let t = 0; t < 10; t++) {
        const toks = mutateSequence(best.split(" "), nb, gb);
        if (!labelOk(toks)) continue;
        const key = toks.join(" ").toLowerCase();
        if (!avoid.full.has(key) && !used.has(key)) return toks.join(" ");
      }
    }
    return positionalSwap(nm.train_labels || [], avoid, used) || best;
  }

  function titleWellFormed(toks) {
    return toks.length >= 4 && toks.length <= 9 &&
      TITLE_STARTERS.has(toks[0].toLowerCase()) &&
      !FUNCTION_WORDS.has(toks[toks.length - 1].toLowerCase()) &&
      toks.every((t) => t !== START && t !== END);
  }

  function accentOk(span) {
    return span.length > 0 && !ACCENT_STOP.has(span[0].toLowerCase()) &&
      span.some((t) => !ACCENT_STOP.has(t.toLowerCase()));
  }

  function sampleTitleAndAccent(nm, gm) {
    let toks = null;
    for (let i = 0; i < 8 && !toks; i++) {
      const cand = sampleSequence(nm.title_bigrams, gm.title_bigrams, 3, 9);
      if (titleWellFormed(cand)) toks = cand;
    }
    if (!toks) toks = ["Ranking", "Best", "Viral", "Moments"];
    const placements = nm.accent_placement || gm.accent_placement || { "2|0": 1 };
    for (let i = 0; i < 8; i++) {
      const [klen, after] = weightedChoice(placements).split("|").map(Number);
      const end = toks.length - after, start = end - klen;
      if (start >= 1 && end <= toks.length) {
        const span = toks.slice(start, end);
        if (accentOk(span)) return [toks.join(" "), span.join(" ")];
      }
    }
    const tail = [];
    for (let i = toks.length - 1; i >= 1; i--) {
      if (ACCENT_STOP.has(toks[i].toLowerCase())) break;
      tail.unshift(toks[i]);
    }
    return [toks.join(" "), tail.length ? tail.join(" ") : toks[toks.length - 1]];
  }

  // ---- Catchy, on-topic titles ----------------------------------------
  // The Markov title chain can drift ("Ranking Funniest Ego Lifts" for nba),
  // so titles come from curated per-niche subjects + clickable patterns. The
  // accent phrase is the subject, which always appears in the title.
  const NICHE_TITLES = {
    fails: ["Pool Fails", "Gym Fails", "Skateboard Fails", "Trampoline Fails", "Wet Floor Fails", "Parkour Fails", "Bike Fails", "Slip and Slide Fails"],
    football: ["Goals", "Free Kicks", "Bicycle Kicks", "Goalkeeper Saves", "Skill Moves", "World Cup Goals", "Last Minute Winners"],
    nba: ["Buzzer Beaters", "Dunks", "Crossovers", "Game Winners", "Poster Dunks", "Ankle Breakers", "Clutch Shots"],
    food: ["Street Food", "Desserts", "Snacks", "Fast Food Hacks", "Pizza Moments", "Candy Creations", "Food Combos"],
    memes: ["Viral Memes", "Brainrot Moments", "Internet Moments", "Meme Trends", "Cursed Clips"],
    gaming: ["Clutch Plays", "Gaming Fails", "Speedrun Moments", "Minecraft Builds", "Game Glitches", "Rage Moments"],
    animals: ["Cat Moments", "Dog Fails", "Animal Reactions", "Puppy Moments", "Zoo Moments", "Pet Fails"],
    celebrity: ["Celebrity Moments", "Red Carpet Fails", "Interview Moments", "Fan Interactions", "Award Show Moments"],
    satisfying: ["Satisfying Moments", "Oddly Satisfying Clips", "ASMR Moments", "Perfect Loops", "Clean Cuts"],
    science: ["Science Experiments", "Chemistry Reactions", "Physics Moments", "Lab Fails", "Explosive Experiments"],
    cars: ["Drift Moments", "Supercar Sounds", "Car Fails", "Launch Control Moments", "Burnouts"],
    gym: ["Ego Lifts", "Gym Fails", "PR Attempts", "Deadlift Moments", "Pre-Workout Moments", "Spotter Fails"],
    extreme: ["Stunts", "Cliff Jumps", "Parkour Moments", "Close Calls", "Wingsuit Moments", "Backflips"],
    school: ["Teacher Moments", "Exam Fails", "Classroom Moments", "School Pranks", "Detention Stories"],
    wholesome: ["Reunions", "Surprise Moments", "Heartwarming Clips", "Proposal Reactions", "Rescue Moments"],
  };
  const TITLE_PATTERNS = [
    "Ranking the Best {S}",
    "Ranking the Craziest {S}",
    "Ranking {S} From Worst to Best",
    "Ranking the Most Insane {S}",
    "Ranking the Wildest {S} Ever",
    "The Best {S} Ranked",
    "Ranking {S} You Won't Believe",
    "Ranking the Funniest {S}",
  ];
  function catchyTitle(niche) {
    const subjects = NICHE_TITLES[niche] || ["Viral Moments", "Internet Clips", "Crazy Moments", "Unreal Moments"];
    const S = pick(subjects);
    return { title: pick(TITLE_PATTERNS).replace("{S}", S), accent: S };
  }

  function sampleFromParams(params, niche, numRanks) {
    const niches = params.niches || {};
    let names = Object.keys(niches);
    if (!names.length) return null;
    let name = null;
    if (niche) {
      const q = String(niche).toLowerCase().trim();
      name = names.find((n) => n === q) ||
             names.find((n) => n.includes(q) || q.includes(n)) || null;
    }
    if (!name) name = names[Math.floor(Math.random() * names.length)];
    const nm = niches[name];
    const gm = params.global || {};

    let n = numRanks;
    if (!n) n = Number(weightedChoice(nm.num_ranks_dist || { 6: 1 }));
    n = Math.max(3, Math.min(10, n | 0));

    const ct = catchyTitle(name);
    let title = ct.title, accent = ct.accent;
    // make numbered titles ("Top 5 ...") agree with the actual rank count
    const fixNum = (s) => s.split(" ").map((t) => (/^\d+$/.test(t) ? String(n) : t)).join(" ");
    title = fixNum(title);
    accent = fixNum(accent);

    // full-dataset training labels (all niches) for novelty enforcement
    const avoid = buildAvoid((nm.train_labels || []).concat(gm.train_labels || []));
    const usedLabels = new Set(), usedEmoji = new Set(), ranks = [];
    const tailCounts = {};
    for (let pos = 1; pos <= n; pos++) {
      let label = null;
      for (let a = 0; a < 4; a++) { // keep tail-words varied within a concept
        label = sampleLabelJS(nm, gm, avoid, usedLabels);
        if (!label) break;
        const tail = label.split(" ").pop().toLowerCase();
        if ((tailCounts[tail] || 0) < 2) break;
      }
      if (!label) label = FILLER[pos % FILLER.length][0];
      const tail = label.split(" ").pop().toLowerCase();
      tailCounts[tail] = (tailCounts[tail] || 0) + 1;
      usedLabels.add(label.toLowerCase());
      const freq = Object.assign({}, nm.emoji_freq || gm.emoji_freq || { "🔥": 1 });
      usedEmoji.forEach((e) => delete freq[e]);
      const emoji = Object.keys(freq).length
        ? weightedChoice(freq)
        : weightedChoice(nm.emoji_freq || { "🔥": 1 });
      usedEmoji.add(emoji);
      ranks.push({ position: pos, label, emoji });
    }

    const perPos = nm.color_pos_freq || gm.color_pos_freq || [];
    const cycle = ["gold", "white", "red"];
    const colors = [];
    for (let i = 0; i < n; i++) {
      const d = perPos[i];
      colors.push(d && Object.keys(d).length ? weightedChoice(d) : cycle[i % 3]);
    }

    return {
      niche: name,
      title,
      accent_word: accent,
      ranks,
      style: { number_colors: colors },
    };
  }

  let modelPromise = null; // lazy, cached fetch of model.json

  function loadModel() {
    if (!modelPromise) {
      modelPromise = fetch("model.json")
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null);
    }
    return modelPromise;
  }

  function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function normalize(concept, numRanks) {
    const c = JSON.parse(JSON.stringify(concept));
    c.ranks = (c.ranks || []).slice().sort((a, b) => a.position - b.position);
    // pad or trim to requested rank count
    if (numRanks) {
      while (c.ranks.length < numRanks) {
        const f = FILLER[c.ranks.length % FILLER.length];
        c.ranks.push({ position: c.ranks.length + 1, label: f[0], emoji: f[1] });
      }
      c.ranks = c.ranks.slice(0, numRanks);
      c.ranks.forEach((r, i) => (r.position = i + 1));
    }
    c.style = c.style || {};
    return c;
  }

  /**
   * Generate a ranking concept.
   * @param {string} [niche]     optional topic hint, e.g. "pool fails"
   * @param {number} [numRanks]  optional rank count to pad/trim to
   * @returns {Promise<Concept>}
   */
  async function generateRankingConcept(niche, numRanks) {
    const model = await loadModel();
    // 1) live statistical sampler (trained params embedded in model.json)
    if (model && model.params && model.params.niches) {
      try {
        const c = sampleFromParams(model.params, niche, numRanks);
        if (c) return normalize(c, numRanks);
      } catch (e) {
        /* fall through to concept bank / templates */
      }
    }
    // 2) pregenerated concept bank, 3) built-in templates
    let bank = TEMPLATES;
    if (model && Array.isArray(model.concepts) && model.concepts.length) {
      bank = model.concepts;
    }
    let pool = bank;
    if (niche) {
      const q = String(niche).toLowerCase();
      const hits = bank.filter(
        (c) =>
          (c.niche && c.niche.toLowerCase().includes(q)) ||
          (c.title && c.title.toLowerCase().includes(q))
      );
      if (hits.length) pool = hits;
    }
    return normalize(pick(pool), numRanks);
  }

  window.RankingGenerator = { generateRankingConcept };
})();
