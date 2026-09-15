# QA Report — Ranking Shorts Maker

QA date: 2026-07-21. Tested on macOS (Darwin 27), Python 3.11, Node, headless Google Chrome.
Method: static analysis + scripted validation of all data files, `node --check`, live HTTP serve + headless-Chrome smoke test that drives the real UI (Create -> Auto-generate -> canvas frame capture), `python3 ai/train.py` run, `python3 ai/generate.py` runs across 5 niches, a Node harness exercising `generateRankingConcept` with and without model.json, and novelty/coherence greps against the dataset. No project files were modified; all harnesses lived in a scratchpad.

## Verdict summary

| Agent | Deliverable | Verdict |
|---|---|---|
| Researcher | `data/` | **PASS (with 1 minor data bug)** |
| Main Developer | `app/` | **PASS functionally / FAIL on safe-zone compliance** |
| AI Developer | `ai/` + `app/model.json` + generator integration | **PASS mechanically / QUALITY WARNING on coherence & novelty** |

---

## A) Researcher — `data/`

| Check | Result | Evidence |
|---|---|---|
| JSON parses | PASS | `ranking_shorts_dataset.json` loads; top-level `{format, description, generated, entry_count, entries}` |
| Entry count = 152 | PASS | 152 entries; `entry_count` field agrees |
| Total rank items = 942 | PASS | counted 942 |
| 15 niches | PASS | fails 11, football 11, nba/food/memes/gaming/animals/celebrity/satisfying/science/cars/gym/extreme/school/wholesome 10 each — good diversity |
| Schema per entry | PASS | all 152 have `id,title,accent_word,niche,num_ranks,ranks,reveal_order,style,engagement_notes`; ranks have `position,label,emoji,clip_desc,duration_sec` |
| Unique ids | PASS | 152 unique, no dups |
| `num_ranks == len(ranks)` | PASS | 0 mismatches |
| Positions are 1..num_ranks | PASS (with note) | Position **set** is exactly {1..N} in all 152 entries. The **array order** is descending (N..1) in 137 entries — this deliberately matches `reveal_order: "worst_to_best"` (137 descending / 15 ascending, perfectly correlated with the 137/15 reveal_order split). Consumers must sort by `position`, which `generator.js normalize()` does. |
| Labels 1–5 words | PASS | 0 violations across 942 labels |
| Durations 2–6 s | PASS | 0 violations |
| Emoji present | PASS | 0 empty |
| accent_word appears in title | **FAIL — 11/152 entries** | Bug DR-1 below |
| `niches.json` substantive | PASS | 15 niches, each with `title_templates, subjects, adjectives, emoji_set, label_patterns, hashtags`, plus global templates/patterns/hashtags |
| `format_research.md` substantive | PASS | 123 lines: visual anatomy, styling spec (fonts/strokes/colors), safe zones with explicit numbers, hashtags, sources, and a concrete implementation style guide |

### Bug DR-1 (Minor) — 11 accent_words are not substrings of their titles
`data/ranking_shorts_dataset.json`, ids 39, 44, 78, 97, 99, 104, 109, 146, 148, 150, 152. Plural/singular or paraphrase drift, e.g. id 39 `accent_word: "Desserts"` vs title "Ranking Best **Dessert** Creations"; id 44 "Reactions" vs "…Reaction Videos"; id 78 "Fan Moments" vs "…Fan Interactions". Impact: the app's accent highlighter (`app.js titleWords()`) and `ai/train.py`'s accent-placement learner both rely on the accent occurring in the title; these 11 entries silently contribute no/wrong accent placement. Fix: make each accent_word an exact word-sequence of its title.

---

## B) Main Developer — `app/`

| Check | Result | Evidence |
|---|---|---|
| `node --check` app.js, generator.js | PASS | clean |
| 1080×1920 canvas | PASS | `index.html:94` `<canvas width="1080" height="1920">`; `app.js:9` `W=1080,H=1920` |
| Title + red accent rendering | PASS | `app.js:64-110` word-level accent matching (punctuation-tolerant, multi-word), red `#e33333` fill, black stroke ≈18% of size. Confirmed visually in headless render. |
| Left numbered list, progressive reveal | PASS | `app.js:112-133` draws `N.` always, label+emoji only when `revealed.has(pos)`; `runSequence` (`app.js:210-230`) adds each position as its clip starts |
| Gold/white/red numbers | PASS | `app.js:10` COLORS; per-rank color cycle + per-rank color picker (`app.js:414-421`) |
| Drag-and-drop reorder | PASS | order list rows draggable with dragstart/dragover/drop (`app.js:464-473`); clips also droppable per-rank (`app.js:374-379`) and bulk dropzone (`app.js:544-557`) |
| Button-based reorder | PASS | ↑/↓ per order row (`app.js:452-462`), ↑ clip/↓ clip per rank (`app.js:424-430`), Reset-to-countdown button |
| Per-rank label/emoji/color editing | PASS | label input, 16-emoji quick row, 3 color buttons per rank (`app.js:386-421`) |
| Two independent size sliders | PASS | `index.html:71-78` `#inp-title-size` + `#inp-side-size` (50–200%); wired to `state.titleScale` / `state.sideScale` (`app.js:523-532`) which feed the two font sizes |
| Shared drawFrame preview/export | PASS | single `drawFrame` (`app.js:145-151`) used by preview loop, idle render, and export (export records the same canvas via `captureStream`) |
| MediaRecorder export with audio | PASS (static) | `app.js:262-303`: `canvas.captureStream(30)` + `MediaStreamDestination` audio tracks, vp9/vp8+opus fallback, 12 Mbps, webm download + ffmpeg mp4 hint. Not exercised end-to-end (needs real user clips + non-headless media). |
| "Add your clips" empty-state fallback | PASS | `index.html:51-55` empty state; `app.js:238/264` block play/export with "Add clips first"; auto-generate status explicitly says the AI "can't source footage — add your clips" (verified live in harness) |
| Serve + load | PASS | `python3 -m http.server` from app/: index/app.js/generator.js/style.css/model.json all HTTP 200 |
| Headless smoke test | PASS | Headless Chrome: setup screen renders; harness drove Create -> Auto-generate; canvas produced a correct-looking frame (title + red accent + 6 revealed rows, gold/white/red numbers); zero page errors |
| **Safe-zone compliance (x:[60,888], y:[288,1250])** | **FAIL** | Bugs MD-1..MD-3 below. The researcher's own style guide (`data/format_research.md` §8: "first baseline ~y 300; wrap at 900 px; rank rows left x=70; Never place text right of x=888 or below y=1250") was not followed. |

### Bug MD-1 (Major) — Title drawn inside the top platform-UI zone
`app/app.js:100`: `let y = 150 + size * 0.2;` → first baseline ≈ y168 at default 92 px (glyph tops ≈ y100). Required: text starts at y ≥ 288 (research: first baseline ~y300, top 240 px title-free). Measured in the headless canvas capture: title tops at ≈ y96. On a real phone the title collides with the Shorts search/camera UI. Fix: start baseline at ~300 (and keep `drawRanks`' `titleBottom` offset logic).

### Bug MD-2 (Major) — Title lines extend into the right 190 px UI column (and 15 px past the left bound)
`app/app.js:85`: `const maxW = W - 90;` (990 px) with centered lines → a full line spans x45..x1035, past the x=888 limit (like/comment/share buttons overlap the title). Confirmed visually: "Ranking Ladder From" reached ≈ x1014. Research spec: wrap at 900 px max width — but note centered 900 px still spans 90..990; to honor x ≤ 888 the title needs `maxW ≤ ~656` or left-shifted centering within [60,888]. Fix: wrap/center within the [60,888] box.

### Bug MD-3 (Moderate) — Rank list can exceed the bottom safe line; no right-edge clamp; x=56 < 60
`app/app.js:116-119`: list x=56 (spec ≥60, research says 70); vertical span capped at `bottom = H - 260` = y1660, but safe zone ends at y1250 — with 8–10 ranks or the side-size slider ≥ ~135% the lower rows sit under the caption/handle UI (e.g. 10 ranks → last baseline y1660). Labels are also drawn with no max-width, so a long label at 200% scale crosses x=888. Fix: `bottom = 1250`, `x = 70`, and ellipsize/scale labels to fit `888 - x`.

### Bug MD-4 (Minor) — `rank.emoji` state field is dead
`app/app.js:390-393`: the label input handler sets `r.label = label.value; r.emoji = ""` — emoji picked via the emoji row are folded into the label string and `emoji` is always emptied. Rendering works (emoji ride along inside the label), but the separate `emoji` field/`makeRank` cycle is vestigial and the concept semantics (label vs emoji) are lost after any edit. Cosmetic/code-hygiene.

### Bug MD-5 (Minor) — Auto-generate uses the accent phrase as the niche query
`app/app.js:483`: `const niche = state.accent` — "Pool Fails" happens to fuzzy-match the "fails" niche via substring logic in `generator.js`, but accents like "Reunions" match nothing and silently fall back to a random niche. A dedicated niche selector would be more predictable. Works, so Minor.

Also verified: `style.css` gives the preview a 9/16 aspect box; `README.md` is accurate and matches actual behavior (including the countdown default and the two sliders).

---

## C) AI Developer — `ai/`, `app/model.json`, generator integration

| Check | Result | Evidence |
|---|---|---|
| `python3 ai/train.py` runs | PASS | Prints dataset stats (152/942/15), stratified 122/30 split, held-out perplexities (label 46.6, title 19.4), coverage (emoji 99.4%, num_ranks 90%), generation metrics, rewrites `ai/model_params.json` |
| Metrics computed, not hardcoded | PASS | `ai/train.py:167-226`: real add-k perplexity over held-out sequences, real coverage counts, and generation metrics computed by importing and running the actual sampler (`G.generate_concept`) 6×/niche. No canned prose. |
| `generate.py --niche fails --ranks 6 --count 5` | PASS | 5 valid concepts; also ran food, nba, wholesome, gaming ×2. All schema-valid: positions 1..6, labels 1–5 words (48/48), exactly one emoji each, accent_word substring of title (self-validated at `ai/generate.py:239-261`) |
| `app/model.json` valid | PASS | Parses; **75 concepts** (≥60); all have `title/accent_word/ranks{position,label,emoji}/style`; positions 1..N; accent in title; **all 15 niches present** (5 concepts each); embedded `params` for 15 niches |
| `generator.js` contract | PASS | `node --check` clean. Node harness (scratchpad): with model.json, two calls (fails / science) both returned schema-valid 6-rank concepts, differed from each other, and two same-niche calls differed → live sampling confirmed. In-browser harness (headless Chrome) reproduced this through the real `fetch` path and the real app UI. |
| Fallback chain | PASS | Harness simulated missing model.json (fetch rejects): built-in TEMPLATES returned a valid "gym fails" concept, and padding to 8 ranks via FILLER worked (`generator.js:282-296`). Chain params-sampler -> concept bank -> templates intact (`generator.js:304-331`). |
| Label novelty | **QUALITY WARNING** | Bug AI-1 below — self-reported 8.2–8.3% verbatim is misleading; measured **67% (32/48)** of generated labels are verbatim copies from the dataset when checked across ALL niches. |
| Niche coherence | **QUALITY WARNING** | Bug AI-2 below — heavy cross-niche contamination. |
| Title grammar | Minor issues | Markov artifacts: "Ranking Most Coldest Glitches", "Ranking Luckiest Snipes Snipes Moments", "Ranking Best Wedding From Worst Treadmill", truncated "Ranking Most Painful Trampoline". Most titles are fine; ~20–30% read as awkward. |

### Bug AI-1 (Major) — Novelty metric only checks the concept's own niche, understating verbatim copying ~8×
`ai/generate.py:209` (`train_labels = set(nm.get("train_labels", []))`) and `ai/train.py:204` compare generated labels only against the **same niche's** training labels. But `sample_label` mixes in the **global** bigram model (mix=0.18), so the sampler frequently reproduces other niches' labels verbatim — which the metric then counts as "novel". Self-reported: 8.2% verbatim. Measured against the full dataset: **32/48 = 67%** of labels in my generated samples were exact dataset labels (e.g. "Creeper ambush", "Own goal horror", "Deaf baby hears mom", "Keeper had a nap"). The reported "91.8% novel" is not an honest picture. Fix: compare against the union of all niches' labels.

### Bug AI-2 (Major) — Cross-niche contamination makes many concepts incoherent
Same root cause (global mixing at `ai/generate.py:99` mix=0.18 and `app/generator.js:233` mix=0.18). Judged ~10 concepts: a **food** concept contained "Creeper ambush" (gaming), "Bench went nuclear" / "Poster dunk" (nba), "Magnet levitation" (science); an **nba** concept was titled "Ranking Funniest **Ego Lifts**" (gym) with "Own goal horror" (football) and "Deaf baby hears mom" (wholesome); a **gaming** concept had "Grandpa reps out" (gym) and "Wheelie truck" (cars). Roughly 40–60% of labels in the samples were off-niche. "wholesome" and "science" were noticeably more coherent. A user picking "food" will regularly get non-food rows. Fix: lower/zero the global mix for labels (use it only as an empty-distribution fallback), or restrict global mixing to function words.

### Bug AI-3 (Minor) — `generate.py` prints a non-JSON footer to stdout
`ai/generate.py:345`: the summary line `[N concepts | M labels | X% verbatim...]` goes to **stdout** after the JSON concepts (and its verbatim % suffers from AI-1). Piping output to a JSON parser fails. Fix: `file=sys.stderr` like the schema-error line at `ai/generate.py:344`.

### Bug AI-4 (Trivial) — Forced rank count can contradict the sampled title
Passing `--ranks 6` (or the app's numRanks) can pair a "Top 5 ..." title with 6 ranks (observed: "Top 5 Fast Food Combos" with 6 ranks). Fix: resample or rewrite the numeral when a count is forced.

---

## Bug index by severity

- **Major**: MD-1 (title in top UI zone), MD-2 (title crosses x=888), AI-1 (novelty metric ~8× understated), AI-2 (cross-niche incoherence)
- **Moderate**: MD-3 (rank list bottom/right/left safe-zone bounds)
- **Minor**: DR-1 (11 accent/title mismatches), MD-4 (dead emoji field), MD-5 (accent-as-niche), AI-3 (stdout footer), AI-4 (Top-5 title vs 6 ranks)

## Top 3 issues to fix first

1. **Safe-zone layout (MD-1/MD-2/MD-3)** — the researcher shipped exact numbers (title baseline ~y300, x∈[60,888], y≤1250, list x=70) and the app ignored them (title baseline y≈168, lines to x≈1035, list bottom bound y1660). Every exported video currently puts the title under the platform's top UI and the right side under the like/share buttons.
2. **Generator coherence (AI-2)** — cut the 0.18 global label-mix in both `ai/generate.py` and `app/generator.js`; ~half the labels in a niche concept don't belong to that niche.
3. **Honest novelty accounting (AI-1)** — measure verbatim copies against the whole dataset; the current 92%-novel claim hides a 67% copy rate and will mislead anyone tuning the model.

## Cleanup
Both QA HTTP servers (8642, 8643) were killed and confirmed down. No project files were modified; harnesses/screenshots live only in the session scratchpad.

---

# Re-verification round (2026-07-22)

Focused re-test of every previously failed/warned item after the developers' fixes and the coordinator's DR-1 patch. Method: same independent tooling as round 1 — headless-Chrome harness driving the real UI plus a **pixel-scan bounding-box check** on the live canvas (scans ImageData for any pixel with a channel > 16 on the black background), fresh `ai/train.py` run, fresh `generate.py` runs for 5 niches, full-dataset verbatim greps done by QA (not trusting self-reported numbers), model.json re-validation, and the Node generator harness re-run. Servers killed after.

## Re-verification results

| Item | Round-1 status | Re-test result | Evidence |
|---|---|---|---|
| DR-1 accent_word in title | FAIL (11/152) | **PASS** | 0/152 mismatches, even case-sensitive |
| MD-1 title top safe zone | FAIL (y≈96) | **PASS** | `app.js:13` `SAFE={x1:60,x2:888,y1:288,y2:1250}`; `app.js:119` first baseline anchored below y1+stroke. Pixel scan, defaults (6 ranks/100%): y1=301 |
| MD-2 title right/left bounds | FAIL (x→1035) | **PASS** | Shrink-to-fit + wrap + centering inside the safe box (`app.js:96-121`). Pixel scans: x∈[62,878] worst observed |
| MD-3 rank list bounds | FAIL (bottom y1660) | **PASS** | List shrink-to-fit into [top, y2] (`app.js:146-156`), left stroke clamp (`app.js:152`), emoji-safe `ellipsize` with right clamp at x=888 (`app.js:131-137,169`). Pixel scan at the claimed worst case — **10 ranks, both sliders 200%, very long labels**: bounds x:[62,863] y:[310,1245] → PASS. Defaults: x:[67,871] y:[301,1205] → PASS. Auto-generated concept: x:[67,878] y:[301,1227] → PASS. |
| MD-4 dead emoji field | Minor | **PASS** | `emoji` field removed from rank state (`app.js:25-32`); label carries text+emoji as one string throughout |
| MD-5 accent-as-niche | Minor | **PASS** | `app.js:527` now calls `generateRankingConcept(undefined, state.numRanks)` with an explanatory comment |
| `node --check` app.js/generator.js | PASS | **PASS** | clean |
| App serves & functions | PASS | **PASS** | Create project → Auto-generate → canvas renders correct frame in headless Chrome; zero page errors; autogen status text intact |
| AI-1 novelty honesty | FAIL (67% real vs 8.2% claimed) | **PASS** | train.py now prints "labels novel vs FULL set: 100.0% (verbatim vs whole dataset: 0.0%)" and QA independently measured: **0/60 (0.0%)** verbatim in fresh `generate.py` output across 5 niches; **0/450 (0.0%)** in `app/model.json`'s concept bank; **0/300 (0.0%)** across live JS-sampled labels from `generator.js` over 10 niches. Claim of 0% full-dataset verbatim independently confirmed. |
| AI-2 niche coherence | FAIL (~50% off-niche) | **PASS** | Judged 60 labels across fails/food/nba/wholesome/gaming: every label fits its niche (fails: "Slide goes wrong", "Backyard betrayed him"; food: "Burger waterfall", "Cheese pull infinite"-style; gaming: "Zero HP speedrun", "Creeper clutch"; nba: "Poster shimmy", "Granny shot airball"; wholesome: "Soldier surprise box", "Stranger paid it all"). Zero cross-niche contamination observed. |
| AI-3 stdout purity | Minor FAIL | **PASS** | All 5 niche runs: stdout parses as pure concatenated JSON; the stats footer now arrives on stderr |
| AI-4 title numbers | Minor FAIL | **PASS** | No "Top N"/count-vs-ranks mismatches in 10 fresh concepts or in any of the 75 bank concepts (checked `top (\d+)` against rank counts; "#1" in titles like "…Until #1 Breaks" refers to the top rank, not a count — not a defect) |
| generator.js contract + fallback | PASS | **PASS (no regression)** | Node harness: model-backed calls schema-valid, differ per call (live sampling), differ across niches; simulated-missing-model.json fallback to built-in templates still returns valid concepts incl. padding to 8 ranks |
| train.py metrics computed | PASS | **PASS (no regression)** | Fresh run: perplexities 45.0/19.2, coverage 99.4%/90.0%, generation metrics from the real sampler |
| model.json | PASS | **PASS (no regression)** | 75 concepts, 15 niches (params: 15 niches too), 0 schema issues, accents case-sensitively in titles |

## New/residual findings

### MD-6 (Minor, new edge case) — Very long title at high title-scale can still overflow the bottom safe line
The title block has no **vertical** shrink-to-fit. A 13-word / ~95-char title at **200% title scale** wraps into enough lines to push past y=1250 and shove the rank list below it (pixel scan: y2=1652; reproduced with only 3 ranks, so it is purely title-driven). At **100% scale the same 13-word title passes** (y2≤1246), and the developer's claimed worst case (10 ranks / 200% both sliders / long labels / normal-length title) genuinely passes — their fix works for everything except the long-title × high-scale combination. Recommended fix: after wrapping in `drawTitle` (`app/app.js:107-116`), if `lines.length * size * 1.12` exceeds a title height budget (e.g. y ≤ ~700), reduce `size` and re-wrap; or cap lines at 3 with ellipsis. Not shipping-blocking: requires a deliberately extreme title AND a maxed slider.

### Residual Markov clunkiness (noted, not failed)
Some generated text still reads awkwardly: titles like "Ranking the Most Weirdest Fast Food Combos", "Ranking Blocks From Worst Trick Shots"; labels like "Wedding won", "Pull waterfall", "Loot quit down". Also 2/10 fresh titles were verbatim dataset titles (short generic ones like "Ranking Best Proposal Reactions"; train.py honestly reports 97.8% title novelty), and within-concept labels can be repetitive ("Burger heaven" / "Food heaven" / "Hack heaven" in one concept). Acceptable for a bigram model; a human skim of generated titles before publishing is still advisable.

## Final verdicts

| Agent | Final verdict |
|---|---|
| Researcher | **PASS** (DR-1 patched and verified) |
| Main Developer | **PASS** (all round-1 failures fixed and independently pixel-verified; one minor new edge case MD-6) |
| AI Developer | **PASS** (novelty and coherence fixed and independently verified at 0% verbatim; residual style clunkiness noted) |

**Overall ship verdict: SHIP.** All majors are closed with independent evidence. Remaining items — MD-6 (extreme-title vertical overflow at ≥~150% title scale) and generated-text polish — are minor, documented, and non-blocking.

## Cleanup (round 2)
QA servers on port 8643 killed and confirmed down (connection refused). No project files modified by QA in this round either; only `QA_REPORT.md` was updated.

---

# Batch 2 — Main Developer feature batch (2026-07-22)

Scope: app.js grew to ~1150 lines; new `app/config.local.js` and `app/vendor/mp4-muxer.js`. `generator.js` and `model.json` untouched (mtimes predate the batch; contract re-verified anyway). Method: full code read; three headless-Chrome harness runs driving the real UI with an instrumented `fetch` (every request URL + Authorization header logged), mocked Pexels responses, download interception (blob capture, `a.click` stubbed), pixel scans of the live canvas, a real-time export roundtrip, ffprobe/ffmpeg analysis of the produced file, a byte-level MP4 box parse, and exactly ONE live Pexels API call.

## New-feature results

| # | Feature | Verdict | Evidence |
|---|---|---|---|
| 1 | One-click "Generate full video", no key/network | **PASS** | With localStorage key cleared, `APP_CONFIG` deleted, and all https fetches mocked to fail: concept generated, editor opened, status = "Video ready: generated animated backgrounds will play for every rank…". Procedural background (seeded animated gradient + glow blobs, `app.js:287-312`, drawn inside `drawFrame`) confirmed on canvas (colored pixel at 980,1750). Playable/exportable — see #3. "Find clips automatically" fills only empty ranks: second invocation with all ranks filled issued **0** new API requests. |
| 2 | Pexels sourcing | **PASS** | Mocked run: query = user-topic/label + niche, emoji stripped ("Hello gym", "minecraft glitches MY CUSTOM LABEL"); URL carries `orientation=portrait&size=medium&per_page=8` (`app.js:1030-1031`); from candidate heights [720,2560,960,1080] it picked **960** = smallest ≥960, all three times; sequential with 400 ms spacing (3 ranks ≈ 1.4 s total); per-rank status states ("finding…", "Searching Pexels stock video…", failed → "animated background" fallback, `app.js:862-866` region); "Stock footage: Pexels" attribution unhidden once a Pexels clip lands. Key priority localStorage > config.local.js verified (mock key was sent, not the file key). Missing config.local.js is harmless (`onerror` + guarded access). **One** live call made: HTTP 200 — the real key still authenticates. |
| 3 | MP4 export chain | **PASS** | Real roundtrip in headless Chrome (3 procedural ranks, no clips): result label "MP4 · H.264 + AAC (WebCodecs)", downloaded blob 5.6 MB `video/mp4`, filename ext `.mp4` = container. Byte-level parse: `ftyp isom/avc1/mp41`, `moov` + `mdat`, **2 tracks, 291 video samples / 10.5 s (~28 fps)**, 359 AAC frames; ffprobe: h264 1080x1920 + aac. Fallback order verified in code: WebCodecs (`app.js:484-556`) → MediaRecorder `video/mp4` → webm with convert notice; `rec.ext` drives both blob type and filename in every path (`app.js:558-586, 617`). |
| 4 | Drag text + safe-zone overlay | **PASS** | Pointer-drag on the preview moves the title (pixel bounds y1 350→467 after a 500 px drag); hit-testing runs off `hitBoxes` rebuilt by every `drawFrame`. Gold dashed safe-rect present **during** drag, absent after drop; a frame decoded from the exported MP4 contains **0** overlay pixels (and text is present — 23k white pixels), plus code guards (`dragUI()` requires `!engine.recording`; `pointerdown` ignored while recording, `app.js:349, 1155`). "Reset layout positions" restored bounds exactly (y1/y2 within 0 px of pre-drag). Undragged safe-zone re-scan (black background forced): 6 ranks/100% → x:[67,871] y:[350,1001] PASS; 10 ranks/200%/long labels → x:[67,834] y:[357,1236] PASS. |
| 5 | Colors | **PASS** | Per rank: 2 swatch rows (number, label); title panel: 2 rows (title, accent); each row = 10 swatches + native custom color input; hex stored internally, generator named colors mapped via `NAMED` (`app.js:1004-1006`). Readability: set every text color to #111111 → strokes flip to white (`strokeColorFor`, luminance < 80, `app.js:24-30`); canvas scan found 107k bright stroke pixels — dark text clearly readable on dark footage. |
| 6 | Emoji panel | **PASS** | Old hotbar gone (`.emoji-row` absent). 😀 button opens popover: exactly 100 emoji in 10 labeled groups; click inserts at the cursor ("Hello" + caret at end → "Hello😂"); Esc closes (verified), outside-pointerdown close wired (`app.js:736-741`). |

## Regression results

| Check | Verdict | Evidence |
|---|---|---|
| node --check (app.js, generator.js, config.local.js, vendor/mp4-muxer.js) | PASS | all clean |
| Setup flow / create project | PASS | harness drives it in every run |
| Clip upload (drop) + per-rank replace | PASS | DataTransfer drop assigned a stub clip |
| Reorder: buttons AND drag | PASS | buttons: 3-2-1 → 2-3-1; HTML5 drag li0→li2: 6.5.4.3.2.1 → 5.4.6.3.2.1 |
| Sliders (both, 50–200%) | PASS | exercised at 100% and 200% in bounds scans |
| Shared drawFrame preview=export | PASS | single renderer; export records the same canvas; decoded export frame matches overlay-free preview rendering |
| Generator contract + fallback chain | PASS | Node harness re-run against current files: live sampling (same-niche calls differ), niches differ, simulated-missing-model.json falls back to built-in templates incl. 8-rank padding |
| Safe zones (undragged) | PASS | see feature #4 row |

## Security sanity

- **API key egress**: fetch instrumentation across the entire harness session logged every request; the Authorization header appeared **only** on `https://api.pexels.com/videos/search` requests. No other request (model.json, stock file downloads) carried the key. `key-only-to-pexels: true`.
- **vendor/mp4-muxer.js**: header identifies it as the jsDelivr/Terser build of `mp4-muxer@5.2.1`; grep for `fetch|XMLHttpRequest|WebSocket|import(` found no network code; exports only ArrayBufferTarget/StreamTarget/FileSystemWritableFileStreamTarget/Muxer; LICENSE file vendored alongside.
- config.local.js carries a clear do-not-commit/do-not-share warning; deleting it is safe (verified: key field guarded, script tag has onerror).

## New bugs found in Batch 2

### Bug MD-7 (Moderate) — Pre-filled title/accent inputs are lies: state starts empty but the DOM still hardcodes values
A late change (`app/app.js:50-51`, "starts clean — placeholders only") makes `state.title`/`state.accent` start empty and `autoGenerate` now branches on whether the USER typed a title (`app.js:971-975`). But `app/index.html:26,30` still ships `value="Ranking Best Pool Fails"` / `value="Pool Fails"`, and init (`app.js:1221-1225`) never syncs state from the DOM. Verified live: on a fresh load the field displays "Ranking Best Pool Fails" while the canvas draws NO title, and clicking Auto-generate treats the project as untitled and silently **overwrites the displayed title** (observed: → "Ranking Most Funniest Cursed Videos"). Fix (one line each): drop the two `value=` attributes (keep `placeholder=`), or read the inputs into state at init.

Aside from MD-7, the new user-title flow itself verified correct: typed title preserved verbatim through Auto-generate, accent auto-filled from niche vocabulary ("Minecraft Glitches"), user-typed labels never overwritten, stock queries led by the user's title keywords.

### Notes (not failed)
- Export progress bar advances only at clip boundaries (cosmetic).
- Stock queries append the full rank label, which can get noisy ("minecraft glitches The sigma ending"); Pexels tolerates it but hit-rate may suffer.
- MD-6 from round 2 (extreme title × 200% overflow) is **fixed** in this batch: `drawTitle` now has a height budget (`app.js:146,167-168`); the 200%/10-rank/long-label scan passes.

## Batch 2 verdict

**Main Developer: PASS with one moderate bug (MD-7).** All six new features verified working with real evidence (including a genuine H.264+AAC MP4 produced in-browser), all regression checks green, MD-6 fixed, security posture clean. **Ship after the two-line MD-7 fix** — it sits on the default path every new user walks (load → Auto-generate) and misrepresents what will render.

## Cleanup (Batch 2)
QA server (8645) and headless Chrome instances killed; port confirmed refusing connections. QA modified no project files; harnesses, captured export, and decoded frames live only in the session scratchpad.

---

# Post-Batch-2 verification (2026-07-22)

Scope: the batch of changes made AFTER Batch 2 (implemented directly, not by the
dev agent, never QA'd): UI declutter, letterbox layout, undo/redo, group-move,
per-rank text size, label auto-shrink, catchy/curated titles, regenerate-differs,
plus regression spot-checks. app.js is now ~1720 lines; `app/README.md` (new,
10 KB) absorbs the removed in-UI narration; `generator.js` gained
`NICHE_TITLES` + `TITLE_PATTERNS` + `catchyTitle`.

Method: full re-read of index.html/app.js/generator.js/style.css/README.md/
server.py/config.local.js; `node --check` on all touched JS; a **pure-Node CDP
client** (no puppeteer/ws dependency available — hand-rolled WebSocket + DevTools
protocol) driving the REAL app in headless Chrome across 9 harness runs;
**pixel-scans of the live 1080×1920 canvas** (ImageData bounding boxes, black-
background forced via an invalid-clip drop so text stands out); a real in-browser
**MP4 export roundtrip** decoded with ffprobe + a raw-RGB frame scan; a Node `vm`
harness exercising `generateRankingConcept` with mocked model.json for the full
fallback chain; **exactly one** live Pexels call and **one** live YouTube-CC
search. `fetch` was mocked (network blocked except local model.json) for every
in-browser run except the two sanctioned live calls. Every headless run reported
**zero page errors**. Server on :8000 was reused, never restarted.

## Results

| # | Feature | Verdict | Evidence |
|---|---|---|---|
| 1 | UI declutter | **PASS** | Removed narration confirmed gone from index.html+app.js (grep: "kept exactly as you type", "One click makes a complete watchable video…", drag/export "explainer" paragraphs — 0 hits). Functional bits all present: field labels (Title / Accent word(s) / Number of ranks), per-rank source badges (`rank-status`: "YouTube (CC): …" / "Stock footage: Pexels/Pixabay", app.js:1010-1018), music tip `#music-hint` (index.html:126), CC one-liner "Paste these credits… required by the CC-BY license" (index.html:71), both "get a free key" links (index.html:152,159). Details now in `app/README.md`. **No dead IDs**: all 52 `$()`/getElementById IDs in app.js exist in index.html (defined-but-unreferenced `panel-*` are CSS/structural, not JS refs). |
| 2 | Letterbox layout | **PASS** | `BAR_TOP=BAR_BOT=320`, `VID` band, `TITLE_BOX{y1:96,y2:302}` bottom-aligned, `LIST_BOX x2:888`. Pixel scans on the live canvas (AI concept, 6 ranks): (a) bottom bar y[1600,1920] = **0** non-black; top bar black except title; (b) title text bbox y[110,290] — entirely inside the top bar (<320); (c) rank text bbox **x[67,866] ⊂ [60,888]**, y inside the band. Background clipped to the band: at rest the bottom bar is 0 non-black while the band is fully colored; the clip boundary is exact (y318 left-strip black, y322 left-strip colored across full width). Export match: the decoded MP4 frame's **bottom bar is pure black (maxChannel 0)** and carries **no drag-guide overlay** — `dragUI()` returns undefined while `engine.recording`, and `pointerdown` early-returns during recording (app.js:397,1570). |
| 3 | Undo/redo | **PASS** | 6 distinct committed edits (label text, number color, per-rank size, title, reorder, canvas drag) each undo/redo cleanly; DOM re-syncs via `syncInputsFromState` (title/labels/size readouts/colors/order all restored). **350 ms debounce coalescing verified**: two rapid A+ clicks became **one** undo step (120%→100% in a single undo). Undo of a label edit restores the AI label; ↶ disables at history start, ↷ disables at the forward end; Ctrl+Z works; a title **drag** is one undo step and its layout offset is restored (title minX 273→123 on undo). `snapshot()` captures every state field incl. `layout`, `groupMove`, `sizeScale`, `labelFromUser`, `titleFromUser` (app.js:1397-1409) — cross-checked against `state`; **no missing field**. Clips kept by reference — `assignClip` no longer revokes old URLs (app.js:751 comment + code). |
| 4 | Move ranks as a group | **PASS** | `#inp-group-move` → `state.groupMove`. Group ON: dragging one rank **rigidly translated the whole block** by exactly (+120,+120) (bbox shifted, pixel count identical 121298). Group OFF: same drag moved **only** that row (block minX stayed 67; only that row's maxX grew). Offset lives in `state.layout.ranksGroup`, added to every row in `drawRanks` and shared by preview+export (single `drawFrame`). `boxForDrag("ranksGroup")` union highlight (app.js:338-347) + guide overlay confirmed present during a held drag and gone after release. |
| 5 | Per-rank text size | **PASS** | A−/A+ = `rank.sizeScale`. A+ ×2 on rank 3 grew **only** row 3's glyphs (number-column height 57→69 px) while rows 1,2,4,5,6 stayed 56 px. Clamp verified live: 20×A+ → **160%** (1.6 cap), 30×A− → **50%** (0.5 floor). Persists through undo (item 3). |
| 6 | Label auto-shrink | **PASS** | A long label auto-shrank to **height 49 px** vs a normal label's **72–83 px** (i.e. genuinely smaller font, *not* an immediate ellipsis) while spanning the full width to maxX 857. Normal labels unaffected. An extreme 120-char label shrank to the floor and then ellipsized with the **right edge clamped at 858 ≤ 888**. Composes with `sizeScale` (shrink loop starts from `rs`, which already folds in `sizeScale`, app.js:256) and with group/individual offsets (drawn inside the translated context). |
| 7 | Catchy / accurate titles | **PASS** | `catchyTitle` (NICHE_TITLES × TITLE_PATTERNS) replaces the Markov title in `sampleFromParams` (generator.js:371). Across 10 niches × 6 calls (Node harness on real generator.js+model.json): **60/60 titles contain the accent_word** (accent = the curated subject `S`), **60/60 schema-valid**, **5–6 unique of 6** per niche (8/8 for random niche). All titles read cleanly and on-niche ("Ranking the Best Goalkeeper Saves", "Ranking Buzzer Beaters You Won't Believe", "The Best Candy Creations Ranked", "Ranking the Most Insane PR Attempts") — the old Markov garble ("Ranking Most Coldest Glitches") is gone. Labels remain on-niche and schema-valid (label pipeline unchanged). |
| 8 | Regenerate-differs | **PASS** | (a) empty title → two Auto-generate presses give **different** title AND labels. (b) typed title "Ranking My Skateboard Fails Compilation" is **kept verbatim** through Generate while labels regenerate; accent auto-fills correctly ("Fails") from a clean state via the inferred niche. (c) a user-typed label ("MY KEPT LABEL 123") is **kept** while the other 5 regenerate (as on-niche fails labels). (d) a dropped **user** clip (source "user") **survives** a full re-Generate (thumb "loading…" persists), and the clearing predicate `clip.source && clip.source!=="user"` (app.js:1367) yields KEPT / CLEARED / CLEARED / CLEARED for user / pexels / youtube / pixabay. Mechanism (`titleFromUser`, per-rank `labelFromUser`, AI-clip clearing) all behave as designed. |
| 9 | Regressions | **PASS** | **Real MP4 export** (headless, 3 procedural ranks): 4.4 MB `video/mp4`, `ftyp isom/avc1/mp41`, **H.264 1080×1920, 301 frames / 10.49 s**, AAC stereo 48 kHz (WebCodecs path); letterbox present in output (bottom bar maxChannel 0, band colored, title in top bar). Emoji panel: old `.emoji-row` gone, popover = **100 emoji in 10 groups**, click inserts at cursor ("Hello"→"Hello😂"), Esc closes. Playback: status "Playing rank #6 (1/6)", correct play/stop button states. Generator **fallback chain intact**: params-sampler (catchy, differs per call) → concept bank (returns the bank concept, pads to N) → built-in TEMPLATES on missing model.json ("Ranking Worst Gym Fails", padded to 8, FILLER "Legend"). `node --check` clean on app.js/generator.js/config.local.js/vendor/mp4-muxer.js. Pexels key loads from config.local.js (56 chars) and the Authorization header goes **only** to api.pexels.com (grep: sole usage app.js:1186); **one live Pexels call = HTTP 200** (2 portrait videos). **One live YouTube-CC search = HTTP 200**, both results "Creative Commons Attribution license" (CC filter honored). |

## Batch-2 open item resolved

- **MD-7 (was Moderate, Batch 2) — FIXED.** index.html:31,35 now ship **placeholder-only** (no hardcoded `value=`) for `#inp-title`/`#inp-accent`, and init reads any browser-restored field values into state (app.js:1706-1711, with the explicit "QA MD-7" comment). Fresh load now draws the same title the field shows (empty by default), so Auto-generate no longer silently overwrites a phantom title. Verified live: fresh load → both fields empty, canvas titleless, Auto-generate produces a coherent concept.

## New / residual findings (non-blocking)

- **PB-1 (Minor, UX quirk)** — There is no `accentFromUser` flag. Once the accent box holds any non-empty value — including an accent the AI generated on a *previous* Auto-generate press — a subsequent user-title Generate **preserves** it instead of re-deriving from the new title's niche (`autoGenerate` only refills when `!state.accent.trim()`, app.js:1132). Observed: after an AI press left accent "Clutch Shots", typing a Skateboard-Fails title and pressing Generate kept "Clutch Shots" as the accent. From a genuinely clean state the auto-fill is correct ("Fails"). The accent field is visible and editable, so this is defensible ("the box wins") and low-impact; a one-line fix would be to also refill when the current accent isn't a substring of the (new) title. Pre-existing pattern, not introduced by the letterbox/undo work.
- **Residual generated-label clunkiness** (unchanged bigram label pipeline, already noted round 2 / Batch 2): occasional slightly-off label such as "Wedding won" inside a *fails* concept, or "Cow baby mode". Titles are now clean; labels are still on-niche and schema-valid but a human skim before publishing remains advisable. Not a regression.

## Ship verdict

**SHIP.** All nine post-Batch-2 items PASS with independent, concrete evidence
(pixel-verified letterbox, a genuine H.264+AAC MP4 with the letterbox burned in,
a full undo/redo walk, rigid group translation, per-rank size + label auto-shrink
measured on the canvas, 60/60 accurate curated titles, all four regenerate-differs
paths, and the fallback chain). The Batch-2 blocker MD-7 is fixed. Only two minor,
documented, non-blocking items remain (PB-1 accent-preserve quirk; residual label
style). Security posture unchanged: Pexels key egresses only to api.pexels.com;
YouTube sourcing returns CC-only.

## Cleanup (Post-Batch-2)
All 9 headless-Chrome instances and QA Node harnesses terminated; no lingering
`scratchpad/chrome-*` processes. The **existing `python3 server.py` on :8000 was
reused and left running** (verified HTTP 200 + `/yt/ping` ok after cleanup) — not
restarted. QA modified only `QA_REPORT.md`; all harnesses, the captured export,
and decoded frames live solely in the session scratchpad.
