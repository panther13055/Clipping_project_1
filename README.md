# Ranking Shorts Maker

A local, no-build web app that creates vertical **1080×1920 “ranking” shorts**:
the footage sits in a middle band with the **title in the top bar** and a
numbered list running down the left over the video. The top & bottom bars are
filled with a **blurred, zoomed “blur-fill” of the clip** (an aspect-correct
soft continuation of the video, not solid black). Wide/landscape clips are
shown **whole** as a centered strip with the blur filling above and below;
portrait clips fill the band. Clip-less ranks keep a black letterbox with their
generated background. Each rank’s label (text + emoji) is
revealed the moment its clip starts playing. Every video is a Shorts-ready
**≤ 120 seconds**, with per-clip trim controls (see “Trim” below).

**Undo/redo:** Ctrl/Cmd+Z (Shift, or Ctrl/Cmd+Y, to redo), or the ↶ ↷ buttons
in the top bar. Rapid edits coalesce into one undo step. When the AI invents a
title (empty title field), it now uses curated, catchy, on-topic titles keyed
to the niche.

**One click → complete video.** “🎬 Generate full video” writes labels (your
typed title is always kept — see below), then sources footage per rank down
this chain, first hit wins. **Press it again for a different video** — it
re-rolls the AI title/labels and re-sources footage, keeping anything you
typed or uploaded yourself. Long labels auto-shrink to fit on their own.

1. **Your own clip** — always wins, add/replace anytime. This includes
   **🔗 Add clip from link**: paste an Instagram / TikTok / YouTube / Twitter-X /
   Vimeo video URL and a section is imported as that rank's clip (needs
   `python3 server.py`). **These clips are NOT license-cleared** — they're
   copyrighted by their creators; the app labels them so (rank status + a
   warning block in Attributions), and using/posting them is your call and
   responsibility. There's no topic search for these sites, so it's link-only,
   and Instagram often blocks downloads unless you're logged in.
2. **YouTube raw clips — Creative Commons ONLY** (needs `python3 server.py`).
   Raw clips keep their **audio**. The helper verifies every video’s license
   via full yt-dlp metadata — twice (at search and again before download) —
   and standard-license videos are never returned or fetched. Attribution is
   captured automatically. Search is **context-driven**: it queries your topic
   with real-world modifiers (`compilation`, `shorts`, `moments`, `clips`,
   `caught on camera`). **Compilation mode:** when one long on-topic CC video is
   found, different **sections** of it are sliced across the ranks, so every
   clip is on-topic. **Relevance-gated:** candidates from every search are
   pooled and each must be *about* your topic — its title has to contain your
   core subject words (both words of a two-word topic, a majority for longer
   ones). Clips that only loosely match are skipped and the rank falls through
   to on-topic stock rather than pulling something unrelated; stock search is
   likewise anchored to your clean topic. Clips download at **up to 1080p H.264 with
   AAC audio** (best stream, merged via ffmpeg). Each rank shows the clip's
   **real video title** (shown
   right under its thumbnail), not a generic label. **English only** — the
   helper biases the search to English and rejects any video whose declared
   audio language isn't English (or, when none is declared, whose title is
   mostly non-Latin script).
3. **Pexels stock** (free API key) — portrait, height ≥ 960, usually silent.
4. **Pixabay stock** (free API key) — same selection logic.
5. **Generated animated background** — always available, offline, per-rank
   distinct. Nothing ever fails to produce a video.

**Your topic always wins.** If you typed a title (e.g. “Ranking Aura Loss
Moments”), Generate keeps your title and accent exactly, infers the closest
niche from your title’s keywords to generate labels for empty ranks only
(typed labels are never overwritten), and builds footage search queries from
*your* title words + each label. Only an empty title lets the AI invent the
whole concept.

## Run it

```sh
cd app
python3 server.py          # serves the app AND enables YouTube-CC sourcing
# open http://localhost:8000
```

`python3 -m http.server 8000` still works as a fallback — everything runs
except YouTube sourcing, which greys out with a hint. YouTube sourcing also
needs `yt-dlp` (and `ffmpeg`) on PATH.

Plain HTML/CSS/JS — no dependencies, no build step. The only bundled library
is `vendor/mp4-muxer.js` (MIT, local file — nothing is loaded from a CDN).
Chrome/Edge/Brave recommended.

### Your API keys (`config.local.js` / ⚙️ Settings)

API keys live in the **⚙️ Settings** panel (top bar) — masked inputs, never
shown on the main screen — and/or in `config.local.js`, your **private local
config**. Don’t share that file, commit it, or include it when sending the app
to someone else. Deleting it is safe; a key pasted in Settings is stored in
your browser and wins over the file. Free keys:
<https://www.pexels.com/api/> and <https://pixabay.com/api/docs/> (the app
fetches sequentially and politely). No key is needed for YouTube-CC sourcing.

### Attribution (required for CC clips)

YouTube clips are **Creative Commons Attribution** licensed: you must credit
the creators in your posted video’s description. The app builds this for you —
open **“Attributions”** in the Clips panel and press **📋 Copy attributions**
to get ready-to-paste credits (uploader, title, URL per clip, plus stock
provider credits).

## How to use

The controls are **collapsible panels** — click a panel's header to expand or
collapse it, so only what you're working on is open. Numbered badges show the
rough order.

**Save / open your work.** The top bar has **💾 Save** and **📂 Open**. Save
writes a single **`.rankproj`** file containing everything — all clips (the
actual video bytes), trims, cover boxes, labels, colors, layout, playback
order, and audio (music + settings) — so you never lose a project or have to
re-source it. **Open** restores it exactly, on any machine, no server or keys
needed. (The file embeds the clips, so it's as large as your footage.)

1. **Project** — title, red accent word(s), number of ranks (3–10), optional
   Pexels key. Then either:
   - **🎬 Generate full video** — concept + footage in one click, or
   - **✨ Auto-generate concept** — text only, or **Create project** for
     fully manual work.
2. **Clips & labels** — clips are optional: any rank without one gets a
   distinct generated animated background (seeded per rank, niche-tinted).
   Assign your own clip per rank (click the thumbnail or drag a file onto it,
   or bulk-drop several files), and use **🔎 Find clips automatically** to
   fill empty ranks via the sourcing chain (YouTube-CC → Pexels → Pixabay).
   Each rank shows its source (“YouTube (CC): uploader” / “Stock footage:
   Pexels/Pixabay”). Each rank row stays clean — just the number, thumbnail,
   label (😀 opens a grouped emoji panel that inserts at the cursor; Esc or
   outside click closes) and a status line. Everything else lives behind a
   per-rank **⚙ Adjust** disclosure: pick the number and label color from
   swatches (gold/white/red + orange, lime, cyan, pink, purple, blue, black) or
   any custom color, resize just that rank's text with **SIZE A− / A+**
   (50–160%), move clips between ranks with ↑/↓, import a clip from a **🔗 link**,
   trim the clip, and add cover boxes (below).
   **Trim — keep exactly the part you want.** Every rank with a clip has a
   **✂ keep** control: two slider handles set the in/out points, with a live
   `2.0–8.0s · 6.0s` readout (start–end · length). Drag them to keep any
   section; the preview poster jumps to the frame you're setting. **✨ best**
   auto-picks the most action-packed window of that clip (it scans frame-to-
   frame motion and moves the keep-window there, same length — the button
   shows “scanning…” for a second on long clips). Newly added clips ≤ 8s play
   whole; longer clips default to a centered slice you can then drag or
   auto-pick. Per-clip lengths are fully **variable** — clip 1 can be 15s and
   clip 2 30s; there's no forced equal split.
   **120-second project cap.** A live **⏱ Total X / 120s** readout sits under
   the Find/Link buttons. The made video **never exceeds 120s** — preview and
   export both hard-stop at the 120s boundary. If your trims total over 120 the
   readout turns red and a **Fit into 120s** button appears that proportionally
   shrinks every clip to fit while preserving each one's relative share. All
   trims are undoable (Ctrl/Cmd+Z) and saved with the project.
   **Cover boxes — hide part of a clip.** In a rank's **⚙ Adjust**, under
   **▨ cover**, add a box, then drag it over whatever you want to hide on the
   preview and drag its bottom-right corner to resize. Three kinds: **Blur** =
   frosted glass, the footage underneath blurred in place; **Blend** = filled
   with the blurred background so the region disappears into it; **Solid** = a
   flat color you pick. Toggle a box between the three anytime, or 🗑 remove it.
   Boxes are **per-rank** — each one only affects that rank's clip —
   and the preview shows whichever rank you're editing (the **Previewing rank
   N** badge under the canvas). Boxes sit under the title/ranks so text stays
   readable, render identically in preview and export, and the edit
   outline/handle show only while editing, never in the exported video.
3. **Playback order** — drag rows (or ↑/↓) to set play order; default is
   countdown (highest number first, ending on #1).
4. **Text style & size** — title and accent colors (same swatch + custom
   picker), plus two independent 50–200% size sliders (title / side texts).
   Auto-layout always keeps text inside the platform-safe box
   (x:[60,888], y:[288,1250]) — at large sizes text shrinks to fit rather
   than leaving the safe area.
   **Free positioning:** drag the title or any rank row directly on the
   preview. While dragging you’ll see the dashed guide box + the letterbox
   edges; the element outlines red if you place it out of bounds (allowed —
   your placement wins). Tick **Move ranks as one group** to drag the whole
   rank list at once instead of one row. **Reset layout positions** restores
   auto-layout. Custom positions are used identically in preview and export.
5. **Audio** — stock clips are usually silent, so the Audio panel keeps videos
   alive: **🎵 Add music** (mp3/m4a/wav) loops under the whole video, is
   trimmed to its length, has a volume slider, and automatically **ducks to
   ~35%** under clips that carry their own sound (YouTube clips do); plus
   synthesized **reveal SFX** (pop per rank, big hit for #1) with an on/off
   toggle and volume. Both are mixed into the export on every path. If all
   ranks are silent and no music is set, a hint near Export suggests adding
   music.
6. **Preview** — ▶ plays the full composition (clips + generated backgrounds)
   with progressive label reveal. Preview and export share the exact same
   frame renderer.
7. **Export** — records the sequence in real time and downloads the file.
   Format is chosen automatically, best first:

   | Priority | Path | Container | Video | Audio |
   |---|---|---|---|---|
   | 1 | WebCodecs + bundled muxer | **.mp4** | H.264 | AAC (or none if the browser can’t encode AAC) |
   | 2 | MediaRecorder `video/mp4` | .mp4 | browser codec | browser codec |
   | 3 | MediaRecorder webm (last resort, clearly labeled) | .webm | VP9/VP8 | Opus |

   The file extension always matches the real container. webm → mp4 by hand:
   `ffmpeg -i ranking.webm -c:v libx264 -pix_fmt yuv420p -c:a aac ranking.mp4`

## generator.js — interface contract (for the AI Developer)

The app calls exactly one function:

```js
window.RankingGenerator.generateRankingConcept(niche?, numRanks?) // -> Promise<Concept>
```

* `niche` *(string, optional)* — topic hint. The app currently passes
  `undefined` (random concept); implementations must handle both.
* `numRanks` *(number, optional)* — result should have exactly this many
  ranks (the shipped implementation pads/trims automatically).

```ts
Concept = {
  title:       string,            // "Ranking Best Pool Fails"
  accent_word: string,            // phrase inside title rendered in accent color
  niche?:      string,            // topic tag; used for stock search + bg palettes
  ranks: Array<{
    position:      number,        // 1..N   (1 = best)
    label:         string,        // short punchy text, e.g. "Aaaah"
    emoji:         string,        // one emoji, e.g. "💀" (may be "")
    clip_desc?:    string,        // visual description; used as stock-search query
    duration_sec?: number         // rank duration when no clip (capped at 8s)
  }>,
  style?: {                       // optional — app has defaults
    number_colors?: ("gold"|"white"|"red")[],  // indexed by position-1
    title_scale?: number,         // 0.5..2.0
    side_scale?:  number          // 0.5..2.0
  }
}
```

Named `number_colors` still work — the app maps them to hex internally
(users can then recolor with the full palette).

### Dropping in your trained model

1. **`app/model.json` concept bank** *(zero code)*: `{ "concepts":
   [ Concept, ... ] }` (each concept may carry `"niche"` for matching).
   `generator.js` fetches it lazily and prefers it over built-in templates.
2. **Replace the function**: load your own script after `generator.js` and
   overwrite `window.RankingGenerator.generateRankingConcept`.

The generator produces text/structure only. Footage then comes from, in
priority order per rank: the user’s clip → YouTube (Creative Commons only,
with audio) → Pexels stock → Pixabay stock → generated animated background.
Nothing fails if a source is missing — that chain is core behavior.

## Known limitations

* Export records in real time (one playthrough); keep the tab visible.
* YouTube sourcing needs `python3 server.py` + `yt-dlp` + internet; the CC
  filter is strict, so some niches have few raw-clip results (the chain then
  falls through to stock/backgrounds). Downloads are capped to short sections
  (~12 s) and cached in `app/.cache/yt/`.
* Stock sourcing needs a Pexels/Pixabay key + internet; stock APIs don’t
  expose whether files have audio, so stock clips are assumed silent (use the
  music layer). Everything else is offline.
* One clip per rank. In-app trimming is per-clip (**✂ keep** + **✨ best**);
  the whole video is hard-capped at **120 s**. **✨ best** seeks the clip
  frame-by-frame, so it takes a second or two on a long source.
* Emoji glyphs render via the OS emoji font; appearance varies by platform.
* Safari: WebCodecs H.264 support varies and MediaRecorder is weaker —
  Chromium-based browsers recommended for export.
