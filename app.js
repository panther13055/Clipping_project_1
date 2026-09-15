/* =========================================================================
 * app.js — Ranking Shorts Maker
 * Preview and export share the same draw function (drawFrame), so what you
 * see in the preview is exactly what gets burned into the exported video.
 * ========================================================================= */
(function () {
  "use strict";

  const W = 1080, H = 1920;
  // Platform-UI safe zone (data/format_research.md §3): ALL text must stay
  // inside this box. Right ~190px = like/share rail, top = search/camera UI,
  // bottom = caption/handle UI.
  const SAFE = { x1: 60, x2: 888, y1: 288, y2: 1250 };
  // Letterbox layout: solid black bars top & bottom, the video reframed into
  // the middle band, the TITLE sits in the top bar, the bottom bar stays empty.
  const BAR_TOP = 320, BAR_BOT = 320;
  const VID = { x1: 0, y1: BAR_TOP, x2: W, y2: H - BAR_BOT };          // video band
  const TITLE_BOX = { x1: 60, x2: W - 60, y1: 96, y2: BAR_TOP - 18 };  // title, bottom-aligned in the top bar
  const LIST_BOX = { x1: 60, x2: SAFE.x2, y1: BAR_TOP + 46, y2: H - BAR_BOT - 46 }; // ranks over video, clear of the right rail
  // Named colors kept for the generator contract ("gold"|"white"|"red");
  // internally every color is stored as hex.
  const NAMED = { gold: "#f5c518", white: "#ffffff", red: "#e33333" };
  // Creator-friendly quick palette; custom color inputs still allow any color.
  const SWATCHES = [
    NAMED.gold, NAMED.white, NAMED.red, "#000000", "#64748b", "#94a3b8",
    "#ff8c00", "#ff6b35", "#ffd166", "#ffee32", "#32cd32", "#39ff14",
    "#00e676", "#00e5ff", "#22d3ee", "#38bdf8", "#2979ff", "#2563eb",
    "#4338ca", "#7c3aed", "#a259ff", "#c026d3", "#ff2e93", "#ff4fa3",
    "#fb7185", "#ef4444", "#dc2626", "#be123c", "#f97316", "#f59e0b",
    "#84cc16", "#14b8a6", "#06b6d4", "#0ea5e9", "#6366f1", "#8b5cf6",
    "#d946ef", "#ec4899", "#fecdd3", "#fed7aa", "#fef08a", "#bbf7d0",
    "#bae6fd", "#ddd6fe", "#f5d0fe", "#334155", "#1e293b", "#111827",
  ];
  const toHex = (c) => NAMED[c] || c || "#ffffff";
  // Dark fills get a WHITE stroke so text stays readable on any footage.
  function strokeColorFor(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
    if (!m) return "#000";
    const v = parseInt(m[1], 16);
    const lum = 0.2126 * (v >> 16 & 255) + 0.7152 * (v >> 8 & 255) + 0.0722 * (v & 255);
    return lum < 80 ? "#fff" : "#000";
  }

  // Curated emoji catalog for the picker, with many more choices.
  const EMOJI_GROUPS = [
    ["Recent", []],
    ["Faces", ["😀","😃","😄","😁","😆","😅","😂","🤣","🙂","🙃","😉","😊","😇","🥰","😍","🤩","😘","😋","😎","🤓","🧐","🤠","🥳","😏","😒","😞","😔","😟","😕","🙁","☹️","😣","😖","😫","🥺","😢","😭","😤","😠","😡"]],
    ["Shock", ["😳","😨","😰","😱","🫢","😮","😲","🤯","😵","🥴","😬","😶‍🌫️","🫨","😯","😧","😦"]],
    ["Laughs", ["😂","🤣","😹","😆","😅","😜","🤪","😝","😛","😋","🙈","🙉","🙊","😏","😹","🫠"]],
    ["Hype", ["🔥","💯","⚡","🚀","🎯","🏆","👑","💥","✨","🌟","⭐","🎉","🙌","🫡","🥶","😤","📈","🐐","💎","🧠"]],
    ["Dark", ["💀","☠️","😈","👻","🤡","⚠️","🧨","💣","🔪","🕳️","🥀","🩸","👹","👺","😵‍💫","🫣"]],
    ["Hands", ["👀","👍","👎","👏","🙌","💪","🤝","✌️","🤞","👌","🤌","🫶","🫡","☝️","👇","👉","👈","✍️"]],
    ["Sports", ["⚽","🏀","🏈","⚾","🎾","🏐","🏉","🥊","🏋️","🤸","🏊","🎿","⛳","🏁","🥇","🥈","🥉","🏅","🎽","🤾"]],
    ["Cartoons", ["🐭","🐰","🦊","🐻","🐼","🐵","🦁","🐯","🐸","🐤","🦆","🐺","🐷","🐧","🦄","🐲","⭐","🌀","🎬","📺"]],
    ["Animals", ["🐐","🐶","🐱","🐵","🦁","🐍","🦅","🐢","🦈","🐒","🐸","🐻","🐼","🦊","🐺","🐯","🦄","🐝","🦋","🐬"]],
    ["Objects", ["🎬","🎥","🎮","🎵","🎧","📱","💻","⌚","🎤","📣","💡","📸","🧲","🛸","🧩","🎲"]],
    ["Food", ["🍕","🍔","🌭","🍟","🍿","🌮","🍜","🍣","🍩","🍪","🧁","🍫","🍓","🍉","🥤","☕"]],
    ["Symbols", ["❤️","💔","💖","✔️","❌","‼️","⁉️","✅","🔴","🟡","🟢","🔵","🟣","⚫","⚪","🔞","🔝","🔁","📌","🧿"]],
    ["Flags", ["🇮🇳","🇺🇸","🇬🇧","🇯🇵","🇰🇷","🇫🇷","🇧🇷","🇦🇷","🇪🇸","🇩🇪"]],
  ];
  const EMOJI_RECENTS_LS = "ranking_shorts_recent_emojis_v2";


  const EXPORT_PROFILES = {
    "1080p": { width: 1080, height: 1920, videoBitrate: 10_000_000 },
    "720p":  { width: 720,  height: 1280, videoBitrate: 5_000_000 },
    "480p":  { width: 480,  height: 854,  videoBitrate: 2_500_000 },
  };
  const exportCanvas = document.createElement("canvas");
  const exportCtx = exportCanvas.getContext("2d", { alpha: false });
  function copyEditorFrameToExportCanvas(profile) {
    if (exportCanvas.width !== profile.width || exportCanvas.height !== profile.height) {
      exportCanvas.width = profile.width; exportCanvas.height = profile.height;
    }
    exportCtx.imageSmoothingEnabled = true;
    exportCtx.imageSmoothingQuality = "high";
    exportCtx.clearRect(0, 0, profile.width, profile.height);
    exportCtx.drawImage(canvas, 0, 0, profile.width, profile.height);
  }

  const DEFAULT_CLIP_SECONDS = 3.5; // procedural-background rank duration
  const MAX_TOTAL_SECONDS = 120;    // project/export cap
  const DEFAULT_TRIM_SECONDS = 6;   // default kept length when an added clip is long
  const FULL_IF_UNDER = 8;          // clips this short or shorter default to their whole length

  // Effective on-screen duration of a rank: a trimmed clip's window, else the
  // procedural background duration. Used for the 120s budget + playback.
  function clipLen(r) {
    if (r.clip && r.clip.srcDuration) {
      const a = r.clip.trimStart || 0, b = (r.clip.trimEnd != null ? r.clip.trimEnd : r.clip.srcDuration);
      return Math.max(0.3, b - a);
    }
    if (r.clip) return DEFAULT_CLIP_SECONDS; // clip still measuring
    return r.duration || DEFAULT_CLIP_SECONDS;
  }
  const totalDuration = () => state.ranks.reduce((s, r) => s + clipLen(r), 0);

  // ------------------------------------------------------------------ state
  const state = {
    title: "",           // starts clean — placeholders only until the user types or generates
    titleFromUser: false, // true once the user types a title; AI never overwrites it, but re-Generate replaces an AI title
    accent: "",
    niche: "",           // topic hint from the generator concept (for stock search + palettes)
    topic: "",           // keywords from the USER'S title; drives stock search when set
    numRanks: 6,
    titleColor: "#ffffff",
    accentColor: NAMED.red,
    titleScale: 1,
    sideScale: 1,
    // ranks[i] => rank position i+1
    ranks: [],           // { label, color, clip: {url, name, thumb, source} | null,
                         //   sourcing: null|"loading"|"failed", query, duration }
                         // label holds text + emoji as one string
    order: [],           // playback order as rank positions, e.g. [6,5,4,3,2,1]
    groupMove: false,    // when true, dragging any rank moves the whole list
    // custom drag offsets in canvas coords; null/absent = auto layout.
    // Applied as a translation of the auto-layout position, so the sliders
    // still scale each element around its own (possibly moved) anchor.
    // ranksGroup moves the whole rank list at once.
    layout: { title: null, ranks: {}, ranksGroup: null },   // {dx,dy} per element
    locks: { title: false, ranks: {} },
    freeTexts: [], // {id,text,x,y,color,size,opacity,fontFamily,locked} — draggable anywhere on canvas
    aiOptions: { wordLimit: 0, emojiMode: "auto" },
    watermark: { enabled: false, text: "@yourhandle", x: W - 180, y: H - 120, color: "#ffffff", size: 42, opacity: 0.35, fontFamily: "system", locked: false },
    hook: { enabled: false, text: "" },
    outro: { enabled: false, text: "" },
    features: { healthCheck: true, autosave: true },
    pacingMode: "balanced",
    // Cover boxes live per-rank (rank.boxes). editRank is the rank currently
    // shown in the idle preview so its boxes can be positioned on the canvas.
    editRank: 1,
  };
  const AUTOSAVE_LS = "ranking_shorts_autosave_v2";
  const autosaveMeta = { timer: 0, muting: false, restored: false };
  let boxSeq = 0;        // monotonic id source for cover boxes
  let freeTextSeq = 0;

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const editPos = () => clamp(state.editRank || 1, 1, state.ranks.length || 1);
  const rankBoxes = (pos) => { const r = state.ranks[pos - 1]; return r ? (r.boxes || (r.boxes = [])) : []; };

  // Bounding boxes of the last drawn frame's text elements (canvas coords),
  // rebuilt by every drawFrame — used for pointer hit-testing on the preview.
  let hitBoxes = [];

  function makeRank(pos) {
    const cycle = [NAMED.gold, NAMED.white, NAMED.red];
    return {
      label: "", labelFromUser: false, color: cycle[(pos - 1) % 3], labelColor: "#ffffff", sizeScale: 1,
      clip: null, sourcing: null, query: "", duration: null,
      boxes: [], // per-rank cover boxes: { id, x, y, w, h, type:"blur"|"blend" }
    };
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const stripEmoji = (s) => String(s || "").replace(/[^\p{L}\p{N}\s]/gu, "").replace(/\s+/g, " ").trim();
  const escapeHtml = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const firstEmoji = (s) => { const m = String(s || "").match(/\p{Extended_Pictographic}/u); return m ? m[0] : ""; };

  // Turn a real clip/video title into a SHORT punchy on-video label so each
  // rank's caption reflects the actual footage that was pulled (not a generic
  // AI word). "Epic Swimming Pool Fails - Pool Fails Compilation 2017 | Only
  // Best" -> "Swimming Pool Fails".
  const LABEL_STOP = new Set(("official video hd 4k uhd 1080p 720p 60fps full the a an and or of to in on for with " +
    "compilation compil montage moments moment shorts short clip clips caught camera try not laugh funny best top " +
    "vol volume part episode ep season new latest amazing awesome insane crazy epic ultimate must watch reaction " +
    "review vlog gameplay tiktok youtube subscribe like").split(/\s+/));
  function labelFromClipTitle(raw) {
    let t = String(raw || "");
    // keep only the first meaningful segment (drop "| Channel", "- extra")
    t = t.split(/[|►•·:—–\-]/)[0];
    t = t.replace(/\p{Extended_Pictographic}/gu, " ")
         .replace(/[#@]\w+/g, " ")
         .replace(/[^\p{L}\p{N}\s]/gu, " ")
         .replace(/\b\d{4}\b/g, " ")            // stray years
         .replace(/\s+/g, " ").trim();
    let words = t.split(" ").filter((w) => w && !LABEL_STOP.has(w.toLowerCase()));
    if (!words.length) words = t.split(" ").filter(Boolean); // all-stopword fallback
    words = words.slice(0, 3);
    let label = words.join(" ").replace(/\b\p{L}/gu, (c) => c.toUpperCase());
    if (label.length > 24) label = label.slice(0, 24).replace(/\s+\S*$/, "").trim();
    return label;
  }
  // Set a rank's on-video label from the actual clip title, unless the user
  // typed their own label (that always wins). Keeps the AI's chosen emoji.
  function applyDerivedLabel(pos, rawTitle) {
    const r = state.ranks[pos - 1];
    if (!r || r.labelFromUser) return;
    const derived = labelFromClipTitle(rawTitle);
    if (!derived) return;
    const emoji = firstEmoji(r.label);
    r.label = (derived + (emoji ? " " + emoji : "")).trim();
  }

  function setNumRanks(n) {
    n = Math.max(1, Math.min(10, n));
    while (state.ranks.length < n) state.ranks.push(makeRank(state.ranks.length + 1));
    state.ranks.length = n;
    state.numRanks = n;
    if (state.editRank > n) state.editRank = 1;
    resetOrder();
  }

  function resetOrder() {
    state.order = [];
    for (let i = state.numRanks; i >= 1; i--) state.order.push(i);
  }

  // ------------------------------------------------------------- DOM refs
  const $ = (id) => document.getElementById(id);
  const canvas = $("canvas");
  const ctx = canvas.getContext("2d");
  const player = $("player");

  // ------------------------------------------------------- drawing helpers
  function strokedText(c, text, x, y, font, fill, strokeW, align) {
    c.font = font;
    c.textAlign = align || "left";
    c.textBaseline = "alphabetic";
    c.lineJoin = "round";
    c.miterLimit = 2;
    c.strokeStyle = strokeColorFor(fill);
    c.lineWidth = strokeW;
    c.strokeText(text, x, y);
    c.fillStyle = fill;
    c.fillText(text, x, y);
  }

  // Split title into words, marking which words belong to the accent phrase.
  function titleWords() {
    const words = state.title.split(/\s+/).filter(Boolean);
    const accent = state.accent.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const flags = words.map(() => false);
    if (accent.length) {
      const lower = words.map((w) => w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, ""));
      for (let i = 0; i + accent.length <= lower.length; i++) {
        let ok = true;
        for (let j = 0; j < accent.length; j++) {
          if (lower[i + j] !== accent[j].replace(/[^\p{L}\p{N}]/gu, "")) { ok = false; break; }
        }
        if (ok) for (let j = 0; j < accent.length; j++) flags[i + j] = true;
      }
    }
    return words.map((w, i) => ({ text: w, red: flags[i] }));
  }

  function fontFamilyFor(name) {
    if (name === "impact") return 'Impact, Haettenschweiler, "Arial Narrow Bold", sans-serif';
    if (name === "serif") return 'Georgia, "Times New Roman", serif';
    if (name === "mono") return 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
    return '-apple-system, "Segoe UI", Arial, sans-serif';
  }
  const fontFor = (size, family = "system") => `900 ${size}px ${fontFamilyFor(family)}`;

  function drawTitle(c) {
    const words = titleWords();
    const boxW = TITLE_BOX.x2 - TITLE_BOX.x1;
    let size = Math.round(92 * state.titleScale);

    // shrink-to-fit: the longest single word (plus its stroke bleed) must fit
    // the safe-box width, and the wrapped block must fit a height budget so a
    // long title can't push the rank list (or itself) out of the safe zone.
    const heightBudget = TITLE_BOX.y2 - TITLE_BOX.y1;
    let strokeW, lines;
    for (;;) {
      strokeW = Math.max(4, size * 0.18);
      c.font = fontFor(size);
      const widest = Math.max(0, ...words.map((w) => c.measureText(w.text).width));
      if (widest + strokeW > boxW && size > 24) { size -= 4; continue; }

      // wrap into lines at this size
      const maxW = boxW - strokeW; // keep the stroke inside x:[60,888] too
      const space = c.measureText(" ").width;
      lines = [];
      let line = [], lineW = 0;
      for (const w of words) {
        const ww = c.measureText(w.text).width;
        if (line.length && lineW + space + ww > maxW) { lines.push({ words: line, w: lineW }); line = []; lineW = 0; }
        if (line.length) lineW += space;
        line.push(w); lineW += ww;
      }
      if (line.length) lines.push({ words: line, w: lineW });

      const blockH = strokeW + size * 0.78 + (lines.length - 1) * size * 1.12 + size * 0.25;
      if (blockH <= heightBudget || size <= 24) break;
      size -= 4;
    }
    const font = fontFor(size);
    const space = c.measureText(" ").width;
    const off = state.layout.title || { dx: 0, dy: 0 };

    // bottom-align the wrapped block inside the top bar (just above the video)
    const blockH = strokeW + size * 0.78 + (lines.length - 1) * size * 1.12 + size * 0.25;
    const topY = TITLE_BOX.y2 - blockH;
    c.save();
    c.translate(off.dx, off.dy);
    let y = topY + strokeW / 2 + size * 0.78;
    for (const ln of lines) {
      let x = TITLE_BOX.x1 + (boxW - ln.w) / 2; // centered within the title box
      for (const w of ln.words) {
        strokedText(c, w.text, x, y, font, w.red ? toHex(state.accentColor) : toHex(state.titleColor), strokeW, "left");
        x += c.measureText(w.text).width + space;
      }
      y += size * 1.12;
    }
    c.restore();
    const maxLineW = Math.max(0, ...lines.map((l) => l.w));
    hitBoxes.push({
      id: "title",
      x: TITLE_BOX.x1 + (boxW - maxLineW) / 2 - strokeW / 2 + off.dx,
      y: topY + off.dy,
      w: maxLineW + strokeW,
      h: blockH,
    });
  }

  // Trim text (by code point, emoji-safe) until it fits maxW; adds an ellipsis.
  function ellipsize(c, text, maxW) {
    if (c.measureText(text).width <= maxW) return text;
    const cps = Array.from(text);
    while (cps.length > 1 && c.measureText(cps.join("") + "…").width > maxW) cps.pop();
    return cps.join("") + "…";
  }

  function drawRanks(c, revealed) {
    const n = state.numRanks;
    const top = LIST_BOX.y1, bottom = LIST_BOX.y2;

    // base size from the side-size slider, shrunk so all rows fit the band
    let size = Math.round(78 * state.sideScale);
    const fits = (s) => s * 0.85 + (n - 1) * s * 1.1 + s * 0.35 <= bottom - top;
    if (!fits(size)) size = Math.max(20, Math.floor((bottom - top) / (1.2 + (n - 1) * 1.1)));

    const firstY = top + size * 0.85;
    const lastY = bottom - size * 0.3;
    const gap = n > 1 ? Math.min(size * 1.5, (lastY - firstY) / (n - 1)) : 0;
    const gOff = state.layout.ranksGroup || { dx: 0, dy: 0 }; // whole-list move

    for (let i = 0; i < n; i++) {
      const pos = i + 1;
      const r = state.ranks[i];
      const y = firstY + gap * i;
      const off = state.layout.ranks[pos] || { dx: 0, dy: 0 };
      const dx = gOff.dx + off.dx, dy = gOff.dy + off.dy;
      // per-rank size: shrink or grow ONE row's text individually
      const rs = size * (r.sizeScale || 1);
      const font = fontFor(rs);
      const strokeW = Math.max(4, rs * 0.16);
      const x = LIST_BOX.x1 + strokeW / 2;      // stroke bleed stays right of x=60
      c.save();
      c.translate(dx, dy);
      strokedText(c, pos + ".", x, y, font, toHex(r.color), strokeW, "left");
      c.font = font;
      const numW = c.measureText(pos + ".").width;
      let rowW = numW;
      if (revealed.has(pos)) {
        const label = r.label.trim();
        if (label) {
          const lx = x + numW + rs * 0.3;
          const maxW = LIST_BOX.x2 - strokeW / 2 - lx; // right clamp at x=888
          if (maxW > 24) {
            // auto-shrink a long label so it fits the width on its own; only
            // ellipsize if it's still too long at the smallest readable size
            let ls = rs, lf = font;
            c.font = lf;
            const floor = Math.max(26, rs * 0.45);
            while (c.measureText(label).width > maxW && ls > floor) {
              ls -= 4; lf = fontFor(ls); c.font = lf;
            }
            const shown = c.measureText(label).width > maxW ? ellipsize(c, label, maxW) : label;
            const lStroke = Math.max(4, ls * 0.16);
            strokedText(c, shown, lx, y, lf, toHex(r.labelColor), lStroke, "left");
            rowW = numW + rs * 0.3 + c.measureText(shown).width;
          }
        }
      }
      c.restore();
      hitBoxes.push({
        id: "rank" + pos,
        x: x - strokeW / 2 + dx,
        y: y - rs * 0.85 - strokeW / 2 + dy,
        w: rowW + strokeW,
        h: rs * 1.15 + strokeW,
      });
    }
  }

  function drawFreeTexts(c) {
    for (const t of state.freeTexts || []) {
      const text = String(t.text || "").trim();
      if (!text) continue;
      const size = clamp(Number(t.size) || 64, 20, 220);
      const font = fontFor(size, t.fontFamily || "system");
      const strokeW = Math.max(3, size * 0.14);
      c.font = font;
      const maxW = W - 80;
      const shown = c.measureText(text).width > maxW ? ellipsize(c, text, maxW) : text;
      const w = c.measureText(shown).width;
      const x = clamp(Number(t.x) || W / 2, 20 + w / 2, W - 20 - w / 2);
      const y = clamp(Number(t.y) || H / 2, 30 + size, H - 30);
      c.save();
      c.globalAlpha = clamp(Number(t.opacity) || 1, 0.1, 1);
      strokedText(c, shown, x, y, font, toHex(t.color || "#ffffff"), strokeW, "center");
      c.restore();
      hitBoxes.push({ id: "free:" + t.id, x: x - w / 2 - strokeW / 2, y: y - size * 0.9 - strokeW / 2, w: w + strokeW, h: size * 1.2 + strokeW });
    }
  }

  function drawWatermark(c) {
    const w = state.watermark || {};
    if (!w.enabled || !String(w.text || "").trim()) return;
    const size = clamp(Number(w.size) || 42, 18, 140);
    const font = fontFor(size, w.fontFamily || "system");
    const strokeW = Math.max(2, size * 0.12);
    c.font = font;
    const shown = ellipsize(c, String(w.text).trim(), W * 0.65);
    const mw = c.measureText(shown).width;
    const x = clamp(Number(w.x) || (W - 180), mw / 2 + 20, W - mw / 2 - 20);
    const y = clamp(Number(w.y) || (H - 120), size + 20, H - 20);
    c.save();
    c.globalAlpha = clamp(Number(w.opacity) || 0.35, 0.05, 1);
    strokedText(c, shown, x, y, font, toHex(w.color || "#ffffff"), strokeW, "center");
    c.restore();
    hitBoxes.push({ id: "watermark", x: x - mw / 2 - strokeW / 2, y: y - size * 0.9 - strokeW / 2, w: mw + strokeW, h: size * 1.15 + strokeW });
  }

  function drawSequencePrompts(c) {
    if (!engine.seqTimeSec && !engine.running && !engine.recording) return;
    const text = (engine.seqTimeSec <= 1.8 && state.hook && state.hook.enabled && state.hook.text)
      ? state.hook.text
      : ((engine.expectedTotalSec && engine.seqTimeSec >= Math.max(0, engine.expectedTotalSec - 1.8) && state.outro && state.outro.enabled && state.outro.text)
        ? state.outro.text : "");
    if (!text) return;
    const size = text.length > 42 ? 42 : 52;
    const font = fontFor(size, "system");
    c.font = font;
    const padX = 34, padY = 22;
    const words = String(text).trim().split(/\s+/);
    const lines = [];
    const maxW = W - 150;
    let cur = "";
    for (const w of words) {
      const cand = cur ? cur + " " + w : w;
      if (cur && c.measureText(cand).width > maxW) { lines.push(cur); cur = w; }
      else cur = cand;
    }
    if (cur) lines.push(cur);
    const boxW = Math.min(maxW + padX * 2, W - 90);
    const boxH = lines.length * size * 1.04 + padY * 2;
    const x = W / 2 - boxW / 2, y = H - BAR_BOT + 46;
    c.save();
    c.fillStyle = "rgba(4,10,18,.72)";
    c.strokeStyle = "rgba(91,214,255,.55)";
    c.lineWidth = 2;
    const r = 24;
    c.beginPath();
    c.moveTo(x+r,y); c.arcTo(x+boxW,y,x+boxW,y+boxH,r); c.arcTo(x+boxW,y+boxH,x,y+boxH,r); c.arcTo(x,y+boxH,x,y,r); c.arcTo(x,y,x+boxW,y,r); c.closePath(); c.fill(); c.stroke();
    let ty = y + padY + size * 0.82;
    for (const line of lines) { strokedText(c, line, W/2, ty, font, "#ffffff", Math.max(3, size*0.1), "center"); ty += size*1.04; }
    c.restore();
  }

  // Draw a video frame into the middle band. WIDE (landscape) clips are
  // *contained* — shown whole as a centered strip, with the blurred background
  // filling above/below (the "blur fill" look). TALL/portrait clips *cover* the
  // band (fill it, minimal crop) since they already fit the vertical frame.
  function drawVideoCover(c, video, crop) {
    const vw = video.videoWidth, vh = video.videoHeight;
    if (!vw || !vh) return;
    const bw = VID.x2 - VID.x1, bh = VID.y2 - VID.y1;
    const mode = (crop && crop.mode) || (((vw / vh) > (bw / bh)) ? "fit" : "fill");
    const base = mode === "fit" ? Math.min(bw / vw, bh / vh) : Math.max(bw / vw, bh / vh);
    const zoom = clamp((crop && Number(crop.zoom)) || 1, 1, 3);
    const s = base * zoom;
    const dw = vw * s, dh = vh * s;
    let ox = (bw - dw) / 2 + ((crop && Number(crop.x)) || 0);
    let oy = (bh - dh) / 2 + ((crop && Number(crop.y)) || 0);
    if (dw >= bw) ox = clamp(ox, bw - dw, 0); else ox = (bw - dw) / 2;
    if (dh >= bh) oy = clamp(oy, bh - dh, 0); else oy = (bh - dh) / 2;
    c.drawImage(video, VID.x1 + ox, VID.y1 + oy, dw, dh);
  }

  // "Blur fill": fill the WHOLE 1080×1920 frame with a zoomed, blurred copy of
  // the current video frame — so the top & bottom bars show a soft, aspect-
  // correct continuation of the clip instead of solid black. Rendered by
  // cover-fitting into a tiny offscreen canvas and upscaling with a blur, which
  // is both cheap (keeps export realtime) and gives a smooth glassy look.
  const _blurCv = document.createElement("canvas");
  _blurCv.width = 108; _blurCv.height = 192; // 9:16, tiny
  const _blurCtx = _blurCv.getContext("2d");
  function drawBlurBackground(c, video) {
    const vw = video.videoWidth, vh = video.videoHeight;
    if (!vw || !vh) return false;
    const bw = _blurCv.width, bh = _blurCv.height;
    const s = Math.max(bw / vw, bh / vh); // cover the tiny 9:16 buffer
    const dw = vw * s, dh = vh * s;
    _blurCtx.clearRect(0, 0, bw, bh);
    _blurCtx.drawImage(video, (bw - dw) / 2, (bh - dh) / 2, dw, dh);
    c.save();
    c.filter = "blur(32px)";
    c.imageSmoothingEnabled = true;
    c.drawImage(_blurCv, 0, 0, W, H);
    c.restore();
    return true;
  }

  // Normalize a possibly negative-size box to positive w/h.
  function normBox(b) {
    let { x, y, w, h } = b;
    if (w < 0) { x += w; w = -w; }
    if (h < 0) { y += h; h = -h; }
    return { x, y, w, h };
  }

  // Cover boxes: hide part of the footage. Drawn AFTER the background but
  // BEFORE the title/ranks, so text always stays on top and readable.
  // - "blur":  frosted glass — the underlying footage, blurred in place.
  // - "blend": filled with the ambient blur-fill so the region disappears
  //            into the background ("replaced with something related").
  const _sampCv = document.createElement("canvas");
  _sampCv.width = 216; _sampCv.height = 384; // low-res snapshot of the frame
  const _sampCtx = _sampCv.getContext("2d");
  function drawCoverBoxes(c, blurReady, editable, pos) {
    const boxes = rankBoxes(pos);
    if (!boxes || !boxes.length) return;
    // one low-res snapshot of the current background for frosted-glass blur
    _sampCtx.clearRect(0, 0, _sampCv.width, _sampCv.height);
    _sampCtx.drawImage(c.canvas, 0, 0, _sampCv.width, _sampCv.height);
    const ss = _sampCv.width / W;
    for (const raw of boxes) {
      const { x, y, w, h } = normBox(raw);
      hitBoxes.push({ id: raw.id, x, y, w, h });
      if (w < 4 || h < 4) continue;
      c.save();
      c.beginPath(); c.rect(x, y, w, h); c.clip();
      if (raw.type === "solid") {
        c.fillStyle = raw.color || "#000000";       // flat color fill
        c.fillRect(x, y, w, h);
      } else if (raw.type === "blend" && blurReady) {
        c.filter = "blur(22px)"; c.imageSmoothingEnabled = true;
        c.drawImage(_blurCv, 0, 0, W, H);           // ambient background match
      } else {
        c.filter = "blur(9px)"; c.imageSmoothingEnabled = true;
        c.drawImage(_sampCv, x * ss, y * ss, w * ss, h * ss, x, y, w, h); // frosted glass
      }
      c.restore();
      if (editable) {
        c.save();
        c.setLineDash([9, 7]); c.lineWidth = 2;
        c.strokeStyle = "rgba(255,255,255,.7)";
        c.strokeRect(x, y, w, h);
        // resize grip (bottom-right)
        c.setLineDash([]);
        c.fillStyle = "rgba(245,197,24,.95)";
        c.fillRect(x + w - BOX_GRIP, y + h - BOX_GRIP, BOX_GRIP, BOX_GRIP);
        c.restore();
      }
    }
  }
  const BOX_GRIP = 34; // px size of the corner resize handle (canvas coords)

  // ----------------------------------------- procedural background renderer
  // Seeded per-rank animated gradient + drifting glow blobs, used whenever a
  // rank has no clip. Lives inside drawFrame so preview = export.
  function hashStr(s) {
    let h = 2166136261;
    for (const ch of String(s)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function drawProceduralBg(c, pos, t) {
    // niche-tinted base hue, rotated per rank so every rank looks distinct
    const baseHue = (hashStr(state.niche || state.title) % 360 + pos * 47) % 360;
    const hue = (baseHue + t * 6) % 360; // slow hue drift
    const g = c.createLinearGradient(0, 0, W * 0.3, H);
    g.addColorStop(0, `hsl(${hue} 60% 24%)`);
    g.addColorStop(0.55, `hsl(${(hue + 40) % 360} 55% 15%)`);
    g.addColorStop(1, `hsl(${(hue + 80) % 360} 65% 10%)`);
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);

    const rnd = mulberry32(hashStr("blobs" + pos + (state.niche || "")));
    for (let i = 0; i < 7; i++) {
      const bx = rnd() * W, by = rnd() * H;
      const r = 200 + rnd() * 300;
      const sp = 0.12 + rnd() * 0.3, ph = rnd() * Math.PI * 2;
      const x = bx + Math.sin(t * sp + ph) * 200;
      const y = by + Math.cos(t * sp * 0.8 + ph) * 240;
      const bh = (hue + 20 + i * 30) % 360;
      const rg = c.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, `hsla(${bh} 85% 62% / 0.32)`);
      rg.addColorStop(1, `hsla(${bh} 85% 62% / 0)`);
      c.fillStyle = rg;
      c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
    }
  }

  function outsideBox(b, box) {
    return b.x < box.x1 || b.x + b.w > box.x2 || b.y < box.y1 || b.y + b.h > box.y2;
  }
  // Bounding box of the currently dragged element (union of rows for a group).
  function boxForDrag(id) {
    if (id === "ranksGroup") {
      const rs = hitBoxes.filter((hb) => hb.id.indexOf("rank") === 0);
      if (!rs.length) return null;
      const x1 = Math.min(...rs.map((b) => b.x)), y1 = Math.min(...rs.map((b) => b.y));
      const x2 = Math.max(...rs.map((b) => b.x + b.w)), y2 = Math.max(...rs.map((b) => b.y + b.h));
      return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
    }
    return hitBoxes.find((hb) => hb.id === id) || null;
  }

  // THE shared frame renderer: background + full overlay.
  // bg: HTMLVideoElement | { proc: rankPos, t: seconds } | null
  // ui (PREVIEW ONLY — export never passes it): { dragId } shows the
  // safe-zone rectangle and highlights the dragged element red when it
  // leaves the safe zone (warn, don't block — user placement wins).
  function drawFrame(bg, revealed, ui, pos) {
    hitBoxes = [];
    if (pos == null) pos = editPos();
    let blurReady = false;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);
    if (bg && bg.proc != null) {
      // procedural background: soft gradient clipped to the middle band, bars black
      ctx.save();
      ctx.beginPath();
      ctx.rect(VID.x1, VID.y1, VID.x2 - VID.x1, VID.y2 - VID.y1);
      ctx.clip();
      drawProceduralBg(ctx, bg.proc, bg.t);
      ctx.restore();
    } else if (bg) {
      // video: blurred zoomed copy fills the whole frame (incl. the bars), a
      // gentle scrim keeps the title/ranks readable, then the sharp aspect-
      // correct clip is drawn in the middle band on top.
      blurReady = drawBlurBackground(ctx, bg);
      if (blurReady) { ctx.fillStyle = "rgba(0,0,0,0.22)"; ctx.fillRect(0, 0, W, H); }
      ctx.save();
      ctx.beginPath();
      ctx.rect(VID.x1, VID.y1, VID.x2 - VID.x1, VID.y2 - VID.y1);
      ctx.clip();
      const clipCrop = (((state.ranks || [])[pos - 1] || {}).clip || {}).crop || null;
      drawVideoCover(ctx, bg, clipCrop);
      ctx.restore();
    }
    // cover boxes hide part of THIS rank's footage; handles show only while editing
    drawCoverBoxes(ctx, blurReady, !engine.recording && !engine.running, pos);
    drawTitle(ctx);
    drawRanks(ctx, revealed);
    drawFreeTexts(ctx);
    drawWatermark(ctx);
    drawSequencePrompts(ctx);

    if (ui && (ui.dragId || ui.selectedId)) {
      ctx.save();
      const activeId = ui.dragId || ui.selectedId;
      const guide = activeId === "title" ? TITLE_BOX : (activeId && activeId.startsWith("free:") ? SAFE : LIST_BOX);
      if (ui.dragId) {
        ctx.setLineDash([18, 14]);
        ctx.lineWidth = 4;
        ctx.strokeStyle = "rgba(91,214,255,.9)";
        ctx.strokeRect(guide.x1, guide.y1, guide.x2 - guide.x1, guide.y2 - guide.y1);
      }
      // letterbox edges, so the user can see the bar boundaries while placing
      ctx.setLineDash([6, 10]);
      ctx.lineWidth = 2;
      ctx.strokeStyle = "rgba(255,255,255,.35)";
      ctx.beginPath();
      ctx.moveTo(0, VID.y1); ctx.lineTo(W, VID.y1);
      ctx.moveTo(0, VID.y2); ctx.lineTo(W, VID.y2);
      ctx.stroke();
      if (ui.guides && ui.guides.length) {
        ctx.setLineDash([8, 10]); ctx.lineWidth = 3; ctx.strokeStyle = "rgba(91,214,255,.95)";
        for (const g of ui.guides) {
          ctx.beginPath();
          if (g.axis === "x") { ctx.moveTo(g.value, 0); ctx.lineTo(g.value, H); }
          else { ctx.moveTo(0, g.value); ctx.lineTo(W, g.value); }
          ctx.stroke();
        }
      }
      const b = boxForDrag(activeId);
      if (b) {
        ctx.setLineDash([10, 8]);
        ctx.lineWidth = 4;
        ctx.strokeStyle = ui.dragId && outsideBox(b, guide) ? "rgba(255,93,108,.95)" : "rgba(255,255,255,.8)";
        ctx.strokeRect(b.x - 10, b.y - 10, b.w + 20, b.h + 20);
      }
      ctx.restore();
    }
  }

  // Active canvas drag (free text positioning); null when not dragging.
  let drag = null;
  let selectedTextId = null;
  let activeGuides = [];
  const dragUI = () => (!engine.recording && (drag || selectedTextId) ? { dragId: drag && drag.id, selectedId: selectedTextId, guides: activeGuides } : undefined);

  // Idle render (no playback): show everything revealed so text can be tuned.
  // The backdrop is the rank currently being edited (state.editRank) so its
  // cover boxes can be positioned on the canvas.
  function renderStatic() {
    if (engine.running) return;
    const all = new Set(state.ranks.map((_, i) => i + 1));
    const pos = editPos();
    const r = state.ranks[pos - 1];
    if (r && !r.clip) drawFrame({ proc: pos, t: 1.2 }, all, dragUI(), pos);
    else drawFrame(idlePoster.video, all, dragUI(), pos);
  }

  // Keep a paused video loaded as the idle backdrop (the rank being edited).
  const idlePoster = { url: null, video: null };
  function updateIdlePoster() {
    const pos = editPos();
    const first = state.ranks[pos - 1] || null;
    const url = first && first.clip ? first.clip.url : null;
    if (url === idlePoster.url) { renderStatic(); return; }
    idlePoster.url = url;
    idlePoster.video = null;
    if (!url) { renderStatic(); return; }
    const v = document.createElement("video");
    v.muted = true; v.preload = "auto"; v.src = url;
    v.addEventListener("loadeddata", () => {
      const startAt = first.clip.trimStart != null ? first.clip.trimStart : Math.min(0.1, (v.duration || 1) / 2);
      v.currentTime = Math.max(0, Math.min(startAt, (v.duration || 1) - 0.05));
      idlePoster.video = v;
      v.addEventListener("seeked", renderStatic, { once: true });
      renderStatic();
    }, { once: true });
  }

  // -------------------------------------------------------- playback engine
  const engine = { running: false, recording: false, stopFlag: false, raf: 0 };
  let audioCtx = null, audioSource = null, audioDest = null;
  let musicGain = null, sfxGain = null, duckAnalyser = null, duckData = null;

  // Background music element (looped under the whole video, stops with it).
  const musicEl = new Audio();
  musicEl.loop = true;
  const audio = { musicName: "", musicVol: 0.7, sfxOn: true, sfxVol: 0.6 };
  const hasMusic = () => !!musicEl.getAttribute("src");

  function ensureAudioGraph() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      audioSource = audioCtx.createMediaElementSource(player);
      audioDest = audioCtx.createMediaStreamDestination();
      audioSource.connect(audioCtx.destination); // hear it in preview
      audioSource.connect(audioDest);            // record it in export

      // music path (own gain so it can be ducked under clip audio)
      musicGain = audioCtx.createGain();
      musicGain.gain.value = audio.musicVol;
      const musicSource = audioCtx.createMediaElementSource(musicEl);
      musicSource.connect(musicGain);
      musicGain.connect(audioCtx.destination);
      musicGain.connect(audioDest);

      // synthesized SFX path
      sfxGain = audioCtx.createGain();
      sfxGain.gain.value = audio.sfxVol;
      sfxGain.connect(audioCtx.destination);
      sfxGain.connect(audioDest);

      // analyser on the CLIP audio, used to duck music under audible clips
      duckAnalyser = audioCtx.createAnalyser();
      duckAnalyser.fftSize = 512;
      audioSource.connect(duckAnalyser);
      duckData = new Float32Array(duckAnalyser.fftSize);
    }
    if (audioCtx.state === "suspended") audioCtx.resume();
  }

  // Called each preview/export frame: duck music to ~35% while the current
  // clip is actually making noise; float back up over silent/stock ranks.
  function updateDucking() {
    if (!musicGain || !hasMusic() || musicEl.paused) return;
    duckAnalyser.getFloatTimeDomainData(duckData);
    let sum = 0;
    for (let i = 0; i < duckData.length; i++) sum += duckData[i] * duckData[i];
    const rms = Math.sqrt(sum / duckData.length);
    const target = audio.musicVol * (rms > 0.03 ? 0.35 : 1);
    musicGain.gain.setTargetAtTime(target, audioCtx.currentTime, 0.25);
  }

  // Short synthesized reveal sounds (no assets): pop per rank, big hit for #1.
  function playRevealSfx(isTop) {
    if (!audio.sfxOn || !audioCtx || !sfxGain) return;
    const t = audioCtx.currentTime;
    const tone = (type, f0, f1, start, dur, peak) => {
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f0, start);
      o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), start + dur);
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(peak, start + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
      o.connect(g); g.connect(sfxGain);
      o.start(start); o.stop(start + dur + 0.05);
    };
    if (isTop) {
      tone("sine", 160, 55, t, 0.35, 0.9);          // thump
      tone("triangle", 660, 660, t + 0.05, 0.5, 0.5); // chord ding
      tone("triangle", 990, 990, t + 0.09, 0.5, 0.4);
      tone("triangle", 1320, 1320, t + 0.13, 0.55, 0.35);
    } else {
      tone("sine", 700, 1400, t, 0.09, 0.6);        // pop
      tone("triangle", 1600, 1600, t + 0.04, 0.16, 0.25);
    }
  }

  // Plays only the [start,end] window of a clip: seeks in, then stops the moment
  // currentTime reaches `end` (or the clip naturally ends). end=null → play to end.
  function playClip(url, start = 0, end = null) {
    return new Promise((resolve, reject) => {
      let done = false, raf = 0;
      const cleanup = () => {
        cancelAnimationFrame(raf);
        player.removeEventListener("ended", onEnd);
        player.removeEventListener("error", onErr);
        player.removeEventListener("loadeddata", onReady);
      };
      const stop = (ok, err) => { if (done) return; done = true; cleanup(); ok ? resolve() : reject(err); };
      const onEnd = () => stop(true);
      const onErr = () => stop(false, new Error("Could not play clip"));
      const watch = () => {
        if (done) return;
        if (engine.stopFlag) { player.pause(); return stop(true); }
        if (end != null && player.currentTime >= end - 0.02) { player.pause(); return stop(true); }
        raf = requestAnimationFrame(watch);
      };
      const onReady = () => {
        try { if (start > 0) player.currentTime = start; } catch (_) {}
        player.play().then(watch).catch(onErr);
      };
      player.addEventListener("ended", onEnd);
      player.addEventListener("error", onErr);
      player.addEventListener("loadeddata", onReady, { once: true });
      player.src = url;
      player.load();
    });
  }

  // Logical sequence clock. During export, background-tab time is excluded.
  function sequenceNow() {
    const now = performance.now();
    const livePause = engine.exportPaused && engine.pauseStarted ? (now - engine.pauseStarted) : 0;
    return now - (engine.pauseAccumMs || 0) - livePause;
  }

  // Plays EVERY rank in order: real clips via <video>, clipless ranks as
  // timed procedural backgrounds — so a zero-upload project still yields a
  // complete watchable video.
  async function runSequence(onClipStart) {
    const revealed = new Set();
    const seq = state.order.slice();
    engine.current = null; // null => draw the <video>; {proc,start} => procedural bg
    engine.pos = seq[0] || 1;
    engine.pauseAccumMs = 0; engine.pauseStarted = 0; engine.exportPaused = false;
    const loop = () => {
      engine.seqTimeSec = Math.max(0, (sequenceNow() - seqStart) / 1000);
      const cur = engine.current;
      if (cur) drawFrame({ proc: cur.proc, t: (sequenceNow() - cur.start) / 1000 }, revealed, dragUI(), engine.pos);
      else drawFrame(player.readyState >= 2 ? player : null, revealed, dragUI(), engine.pos);
      updateDucking();
      if (engine.running) engine.raf = requestAnimationFrame(loop);
    };
    engine.raf = requestAnimationFrame(loop);
    if (hasMusic()) {
      if (musicGain) musicGain.gain.setValueAtTime(audio.musicVol, audioCtx.currentTime);
      musicEl.currentTime = 0;
      musicEl.play().catch(() => {});
    }
    const seqStart = sequenceNow();
    engine.seqTimeSec = 0; engine.expectedTotalSec = Math.min(MAX_TOTAL_SECONDS, totalDuration());
    try {
      for (let i = 0; i < seq.length; i++) {
        if (engine.stopFlag) break;
        // Project cap: never let the produced video exceed MAX_TOTAL_SECONDS.
        const budget = MAX_TOTAL_SECONDS - (sequenceNow() - seqStart) / 1000;
        if (budget <= 0.15) break;
        const pos = seq[i];
        const r = state.ranks[pos - 1];
        engine.pos = pos; // which rank's cover boxes to draw this frame
        revealed.add(pos);
        playRevealSfx(pos === 1);
        if (onClipStart) onClipStart(i, seq.length, pos);
        if (r.clip) {
          engine.current = null;
          const s = r.clip.trimStart || 0;
          let e = r.clip.trimEnd != null ? r.clip.trimEnd : (r.clip.srcDuration || null);
          if (e != null && (e - s) > budget) e = s + budget; // trim the tail to fit the project cap
          await playClip(r.clip.url, s, e);
        } else {
          engine.current = { proc: pos, start: sequenceNow() };
          const durMs = Math.min(clipLen(r), budget) * 1000;
          const t0 = sequenceNow();
          while (sequenceNow() - t0 < durMs && !engine.stopFlag) await sleep(40);
          engine.current = null;
        }
      }
    } finally {
      cancelAnimationFrame(engine.raf);
      player.pause();
      musicEl.pause(); // music is trimmed to the video's length
      engine.current = null;
      engine.seqTimeSec = 0;
      engine.expectedTotalSec = 0;
    }
  }

  function clipsAssigned() {
    return state.ranks.filter((r) => r.clip).length;
  }

  async function playPreview() {
    if (engine.running) return;
    ensureAudioGraph();
    engine.running = true; engine.stopFlag = false;
    $("btn-play").disabled = true; $("btn-stop").disabled = false;
    $("play-status").textContent = "";
    try {
      await runSequence((i, n, pos) => { $("play-status").textContent = `Playing rank #${pos} (${i + 1}/${n})`; });
    } catch (e) {
      $("play-status").textContent = "Playback error: " + e.message;
    }
    engine.running = false;
    $("btn-play").disabled = false; $("btn-stop").disabled = true;
    if (!engine.stopFlag) $("play-status").textContent = "Done.";
    renderStatic();
  }

  function stopPlayback() {
    engine.stopFlag = true;
    player.pause();
    // force 'ended' style resolution
    player.dispatchEvent(new Event("ended"));
  }

  // ---------------------------------------------------------------- export
  // Priority: 1) WebCodecs H.264 (+AAC if supported) muxed to real .mp4 by
  // the vendored mp4-muxer; 2) MediaRecorder 'video/mp4'; 3) MediaRecorder
  // webm. The canvas sequence itself is identical in all three paths.

  function setExportPaused(paused) {
    if (!engine.recording || engine.exportPaused === paused) return;
    if (paused) {
      engine.exportPaused = true;
      engine.pauseStarted = performance.now();
      engine.resumePlayer = !player.paused;
      engine.resumeMusic = hasMusic() && !musicEl.paused;
      if (engine.resumePlayer) player.pause();
      if (engine.resumeMusic) musicEl.pause();
      if (audioCtx && audioCtx.state === "running") audioCtx.suspend().catch(() => {});
      const st = $("export-status"); if (st) st.textContent = "Export paused — return to this tab to continue.";
    } else {
      const now = performance.now();
      if (engine.pauseStarted) engine.pauseAccumMs = (engine.pauseAccumMs || 0) + (now - engine.pauseStarted);
      engine.pauseStarted = 0;
      engine.exportPaused = false;
      if (audioCtx && audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
      if (engine.resumePlayer && player.src) player.play().catch(() => {});
      if (engine.resumeMusic && hasMusic()) musicEl.play().catch(() => {});
      engine.resumePlayer = false; engine.resumeMusic = false;
      const st = $("export-status"); if (st) st.textContent = "Export resumed.";
    }
  }

  async function startWebCodecsRecorder(profile) {
    if (!window.VideoEncoder || !window.Mp4Muxer) return null;
    copyEditorFrameToExportCanvas(profile);
    const vconf = { codec: "avc1.640028", width: profile.width, height: profile.height, bitrate: profile.videoBitrate, framerate: 30 };
    const vsup = await VideoEncoder.isConfigSupported(vconf).catch(() => null);
    if (!vsup || !vsup.supported) return null;

    const sampleRate = audioCtx.sampleRate;
    const aconf = { codec: "mp4a.40.2", sampleRate, numberOfChannels: 2, bitrate: 128_000 };
    let audioOk = false;
    if (window.AudioEncoder && window.AudioData && audioCtx.createScriptProcessor) {
      const asup = await AudioEncoder.isConfigSupported(aconf).catch(() => null);
      audioOk = !!(asup && asup.supported);
    }

    const muxer = new Mp4Muxer.Muxer({
      target: new Mp4Muxer.ArrayBufferTarget(),
      video: { codec: "avc", width: profile.width, height: profile.height },
      audio: audioOk ? { codec: "aac", sampleRate, numberOfChannels: 2 } : undefined,
      fastStart: "in-memory", firstTimestampBehavior: "offset",
    });
    let encErr = null;
    const venc = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: (e) => (encErr = e) });
    venc.configure(vconf);

    let aenc = null, capNode = null, capSink = null;
    const pcmL = [], pcmR = []; let pcmLen = 0;
    if (audioOk) {
      aenc = new AudioEncoder({ output: (chunk, meta) => muxer.addAudioChunk(chunk, meta), error: (e) => (encErr = e) });
      aenc.configure(aconf);
      capNode = audioCtx.createScriptProcessor(4096, 2, 2);
      capNode.onaudioprocess = (e) => {
        if (engine.exportPaused) return;
        const b = e.inputBuffer, L = b.getChannelData(0), R = b.numberOfChannels > 1 ? b.getChannelData(1) : L;
        pcmL.push(new Float32Array(L)); pcmR.push(new Float32Array(R)); pcmLen += b.length;
      };
      audioSource.connect(capNode); musicGain.connect(capNode); sfxGain.connect(capNode);
      capSink = audioCtx.createGain(); capSink.gain.value = 0;
      capNode.connect(capSink); capSink.connect(audioCtx.destination);
    }

    let frameIdx = 0, timer = null;
    const frameDurationUs = 1_000_000 / vconf.framerate;
    const encodeFrame = () => {
      if (engine.exportPaused || encErr || venc.state !== "configured") return;
      copyEditorFrameToExportCanvas(profile);
      const timestamp = Math.round(frameIdx * frameDurationUs);
      const frame = new VideoFrame(exportCanvas, { timestamp, duration: Math.round(frameDurationUs) });
      venc.encode(frame, { keyFrame: frameIdx % 60 === 0 });
      frame.close(); frameIdx++;
    };
    const startTimer = () => { if (!timer) timer = setInterval(encodeFrame, 1000 / 30); };
    const stopTimer = () => { if (timer) { clearInterval(timer); timer = null; } };
    const visibilityHandler = () => {
      if (!engine.recording) return;
      if (document.hidden) { stopTimer(); setExportPaused(true); }
      else { setExportPaused(false); startTimer(); }
    };
    document.addEventListener("visibilitychange", visibilityHandler);
    startTimer();

    return {
      label: audioOk ? "MP4 · H.264 + AAC (WebCodecs)" : "MP4 · H.264 (browser AAC unavailable)", ext: "mp4", mime: "video/mp4",
      async stop() {
        stopTimer(); document.removeEventListener("visibilitychange", visibilityHandler);
        if (engine.exportPaused) setExportPaused(false);
        if (encErr) throw encErr;
        await venc.flush();
        if (aenc && aenc.state === "configured") {
          try { audioSource.disconnect(capNode); musicGain.disconnect(capNode); sfxGain.disconnect(capNode); capNode.disconnect(); capSink.disconnect(); } catch (_) {}
          capNode.onaudioprocess = null;
          const L = new Float32Array(pcmLen), R = new Float32Array(pcmLen); let o = 0;
          for (let k = 0; k < pcmL.length; k++) { L.set(pcmL[k], o); R.set(pcmR[k], o); o += pcmL[k].length; }
          const CH = 1024; let ts = 0;
          for (let off = 0; off < pcmLen; off += CH) {
            const n = Math.min(CH, pcmLen - off), data = new Float32Array(n * 2);
            data.set(L.subarray(off, off + n), 0); data.set(R.subarray(off, off + n), n);
            const ad = new AudioData({ format: "f32-planar", sampleRate, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round(ts), data });
            aenc.encode(ad); ad.close(); ts += (n / sampleRate) * 1e6;
          }
          await aenc.flush();
        }
        if (encErr) throw encErr;
        muxer.finalize();
        const buf = muxer.target && muxer.target.buffer;
        if (!buf || !buf.byteLength) throw new Error("MP4 finalization produced an empty file.");
        try { if (venc.state !== "closed") venc.close(); } catch (_) {}
        try { if (aenc && aenc.state !== "closed") aenc.close(); } catch (_) {}
        return new Blob([buf], { type: "video/mp4" });
      },
    };
  }

  function startMediaRecorderPath(profile) {
    if (!window.MediaRecorder) throw new Error("This browser does not support MediaRecorder.");
    copyEditorFrameToExportCanvas(profile);
    const stream = exportCanvas.captureStream(30);
    audioDest.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
    const candidates = [
      ['video/mp4;codecs="avc1.42E01E,mp4a.40.2"', "mp4"], ["video/mp4", "mp4"],
      ["video/webm;codecs=vp9,opus", "webm"], ["video/webm;codecs=vp8,opus", "webm"], ["video/webm", "webm"],
    ];
    const found = candidates.find(([m]) => MediaRecorder.isTypeSupported(m)) || ["", "webm"];
    const ext = found[1];
    const opts = { videoBitsPerSecond: profile.videoBitrate };
    if (found[0]) opts.mimeType = found[0];
    const rec = new MediaRecorder(stream, opts), chunks = [];
    rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    let recError = null; rec.onerror = (e) => { recError = e.error || new Error("MediaRecorder failed"); };
    const done = new Promise((res) => (rec.onstop = res));
    let copyTimer = null;
    const startCopyLoop = () => { if (!copyTimer) copyTimer = setInterval(() => { if (!engine.exportPaused) copyEditorFrameToExportCanvas(profile); }, 1000 / 30); };
    const stopCopyLoop = () => { if (copyTimer) { clearInterval(copyTimer); copyTimer = null; } };
    const mrVisibilityHandler = () => {
      if (!engine.recording) return;
      if (document.hidden) {
        stopCopyLoop(); setExportPaused(true);
        if (rec.state === "recording") try { rec.pause(); } catch (_) {}
      } else {
        setExportPaused(false);
        if (rec.state === "paused") try { rec.resume(); } catch (_) {}
        startCopyLoop();
      }
    };
    document.addEventListener("visibilitychange", mrVisibilityHandler);
    rec.start(250); startCopyLoop();
    return {
      label: ext === "mp4" ? "MP4 (MediaRecorder)" : "WebM (MediaRecorder fallback)", ext, mime: ext === "mp4" ? "video/mp4" : "video/webm",
      async stop() {
        stopCopyLoop(); document.removeEventListener("visibilitychange", mrVisibilityHandler);
        if (engine.exportPaused) setExportPaused(false);
        if (rec.state !== "inactive") rec.stop();
        await done; stream.getTracks().forEach((t) => t.stop());
        if (recError) throw recError;
        const blob = new Blob(chunks, { type: ext === "mp4" ? "video/mp4" : "video/webm" });
        if (!blob.size) throw new Error("Recorder produced an empty file.");
        return blob;
      },
    };
  }

  async function exportVideo() {
    if (engine.running || engine.recording) return;
    ensureAudioGraph();
    const quality = $("export-quality") ? $("export-quality").value : "1080p";
    const profile = EXPORT_PROFILES[quality] || EXPORT_PROFILES["1080p"];
    engine.running = true; engine.recording = true; engine.stopFlag = false;
    engine.pauseAccumMs = 0; engine.pauseStarted = 0; engine.exportPaused = false;
    $("btn-export").disabled = true; $("btn-play").disabled = true;
    $("export-progress").classList.remove("hidden"); $("export-bar").style.width = "0%";

    let rec = null, seqErr = null;
    try { rec = await startWebCodecsRecorder(profile); } catch (_) { rec = null; }
    if (!rec) rec = startMediaRecorderPath(profile);
    $("export-status").textContent = `Exporting ${quality} · ${profile.width}×${profile.height} · ${rec.label}`;
    try {
      await runSequence((i, n) => { $("export-bar").style.width = Math.round((i / Math.max(1, n)) * 100) + "%"; });
      $("export-bar").style.width = "100%";
    } catch (e) { seqErr = e; }

    let blob = null;
    try { blob = await rec.stop(); } catch (e) { seqErr = seqErr || e; }
    engine.running = false; engine.recording = false; engine.exportPaused = false;
    $("btn-export").disabled = false; $("btn-play").disabled = false;

    if (seqErr) {
      $("export-status").textContent = "Export error: " + (seqErr.message || seqErr);
    } else if (!engine.stopFlag && blob && blob.size > 0) {
      const a = document.createElement("a"), href = URL.createObjectURL(blob);
      a.href = href;
      const base = state.title.replace(/[^\w]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase() || "ranking";
      a.download = `${base}-${quality}.${rec.ext}`; a.click();
      setTimeout(() => URL.revokeObjectURL(href), 30_000);
      $("export-status").textContent = `Saved ${quality} · ${(blob.size / 1e6).toFixed(1)} MB .${rec.ext}`;
    }
    renderStatic();
  }

  // ---------------------------------------------- save / load a whole project
  // A .rankproj file is self-contained JSON: all state + the actual clip and
  // music bytes (base64), so a saved project reopens exactly — clips, trims,
  // cover boxes, layout, colors, audio and all — with nothing to re-source.
  const PROJECT_VERSION = 1;
  const projStatus = (msg) => { const el = $("project-status"); if (el) el.textContent = msg || ""; };

  async function blobUrlToBase64(url) {
    const resp = await fetch(url);
    const type = resp.headers.get("content-type") || "";
    const u8 = new Uint8Array(await resp.arrayBuffer());
    let bin = ""; const CH = 0x8000;
    for (let i = 0; i < u8.length; i += CH) bin += String.fromCharCode.apply(null, u8.subarray(i, i + CH));
    return { b64: btoa(bin), type };
  }
  function base64ToBlob(b64, type) {
    const bin = atob(b64);
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return new Blob([u8], { type: type || "application/octet-stream" });
  }

  async function exportProject() {
    if (engine.running) return;
    const btn = $("btn-save-project"); if (btn) btn.disabled = true;
    projStatus("Saving project…");
    try {
      const proj = {
        app: "ranking-shorts-maker", version: PROJECT_VERSION,
        savedAt: new Date().toISOString(),
        state: {
          title: state.title, titleFromUser: state.titleFromUser, accent: state.accent,
          niche: state.niche, topic: state.topic, numRanks: state.numRanks,
          titleColor: state.titleColor, accentColor: state.accentColor,
          titleScale: state.titleScale, sideScale: state.sideScale, groupMove: state.groupMove,
          editRank: state.editRank, order: state.order.slice(),
          layout: JSON.parse(JSON.stringify(state.layout)),
          locks: JSON.parse(JSON.stringify(state.locks || { title:false, ranks:{} })),
          freeTexts: (state.freeTexts || []).map((t) => ({ ...t })),
          aiOptions: { ...(state.aiOptions || { wordLimit:0, emojiMode:"auto" }) },
          watermark: { ...(state.watermark || {}) },
          hook: { ...(state.hook || {}) },
          outro: { ...(state.outro || {}) },
          features: { ...(state.features || {}) },
          pacingMode: state.pacingMode || "balanced",
          ranks: state.ranks.map((r) => ({
            label: r.label, labelFromUser: r.labelFromUser, color: r.color, labelColor: r.labelColor,
            sizeScale: r.sizeScale, duration: r.duration, boxes: (r.boxes || []).map((b) => ({ ...b })),
            clip: r.clip ? {
              name: r.clip.name, source: r.clip.source, thumb: r.clip.thumb || null,
              attribution: r.clip.attribution || null, srcDuration: r.clip.srcDuration || null,
              trimStart: r.clip.trimStart != null ? r.clip.trimStart : null,
              trimEnd: r.clip.trimEnd != null ? r.clip.trimEnd : null,
              crop: r.clip.crop ? { ...r.clip.crop } : null,
            } : null,
          })),
        },
        audio: { musicName: audio.musicName, musicVol: audio.musicVol, sfxOn: audio.sfxOn, sfxVol: audio.sfxVol },
      };
      // embed the actual clip bytes
      for (let i = 0; i < state.ranks.length; i++) {
        const r = state.ranks[i];
        if (r.clip) {
          projStatus(`Saving project… packing clip ${i + 1}`);
          const { b64, type } = await blobUrlToBase64(r.clip.url);
          proj.state.ranks[i].clip.data = b64;
          proj.state.ranks[i].clip.mediaType = type;
        }
      }
      // embed music
      if (hasMusic()) {
        projStatus("Saving project… packing music");
        const { b64, type } = await blobUrlToBase64(musicEl.src);
        proj.audio.data = b64; proj.audio.dataType = type;
      }
      const blob = new Blob([JSON.stringify(proj)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = (state.title.replace(/[^\w]+/g, "-").toLowerCase() || "ranking") + ".rankproj";
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 30_000);
      projStatus(`Saved (${(blob.size / 1e6).toFixed(1)} MB)`);
      setTimeout(() => projStatus(""), 4000);
    } catch (e) {
      projStatus("Save failed: " + e.message);
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function importProject(file) {
    if (engine.running) stopPlayback();
    projStatus("Opening project…");
    try {
      const proj = JSON.parse(await file.text());
      if (!proj || proj.app !== "ranking-shorts-maker" || !proj.state) {
        throw new Error("not a Ranking Shorts project file");
      }
      const s = proj.state;
      state.title = s.title || ""; state.titleFromUser = !!s.titleFromUser;
      state.accent = s.accent || ""; state.niche = s.niche || ""; state.topic = s.topic || "";
      state.numRanks = s.numRanks || (s.ranks ? s.ranks.length : 6);
      state.titleColor = s.titleColor || "#ffffff"; state.accentColor = s.accentColor || NAMED.red;
      state.titleScale = s.titleScale || 1; state.sideScale = s.sideScale || 1;
      state.groupMove = !!s.groupMove; state.editRank = s.editRank || 1;
      state.order = (s.order && s.order.length) ? s.order.slice() : [];
      state.layout = s.layout ? JSON.parse(JSON.stringify(s.layout)) : { title: null, ranks: {}, ranksGroup: null };
      state.locks = s.locks ? JSON.parse(JSON.stringify(s.locks)) : { title:false, ranks:{} };
      state.freeTexts = (s.freeTexts || []).map((t) => ({ id: t.id || ("txt" + (++freeTextSeq)), text: t.text || "Text", x: Number(t.x) || W/2, y: Number(t.y) || H/2, color: t.color || "#ffffff", size: clamp(Number(t.size)||64,20,220), opacity: clamp(Number(t.opacity)||1,0.1,1), fontFamily: t.fontFamily || "system", locked: !!t.locked }));
      state.aiOptions = { wordLimit: Number((s.aiOptions||{}).wordLimit) || 0, emojiMode: ((s.aiOptions||{}).emojiMode || "auto") };
      state.watermark = Object.assign({ enabled:false, text:"@yourhandle", x:W-180, y:H-120, color:"#ffffff", size:42, opacity:0.35, fontFamily:"system", locked:false }, s.watermark || {});
      state.hook = Object.assign({ enabled:false, text:"" }, s.hook || {});
      state.outro = Object.assign({ enabled:false, text:"" }, s.outro || {});
      state.features = Object.assign({ healthCheck:true, autosave:true }, s.features || {});
      state.pacingMode = s.pacingMode || "balanced";
      state.freeTexts.forEach((t) => { const n = parseInt(String(t.id).replace(/\D/g,""),10); if (Number.isFinite(n)) freeTextSeq = Math.max(freeTextSeq,n); });
      state.ranks = (s.ranks || []).map((r) => {
        const rank = {
          label: r.label || "", labelFromUser: !!r.labelFromUser,
          color: r.color || NAMED.gold, labelColor: r.labelColor || "#ffffff",
          sizeScale: r.sizeScale || 1, clip: null, sourcing: null, query: "",
          duration: r.duration != null ? r.duration : null,
          boxes: (r.boxes || []).map((b) => ({ ...b })),
        };
        if (r.clip && r.clip.data) {
          const url = URL.createObjectURL(base64ToBlob(r.clip.data, r.clip.mediaType));
          rank.clip = {
            url, name: r.clip.name || "clip", source: r.clip.source || "user",
            thumb: r.clip.thumb || null, attribution: r.clip.attribution || null,
            srcDuration: r.clip.srcDuration || null,
            trimStart: r.clip.trimStart != null ? r.clip.trimStart : null,
            trimEnd: r.clip.trimEnd != null ? r.clip.trimEnd : null,
            crop: r.clip.crop ? { ...r.clip.crop } : (r.clip.crop || null),
          };
        }
        return rank;
      });
      if (!state.order.length) resetOrder();

      // audio
      const a = proj.audio || {};
      audio.musicVol = a.musicVol != null ? a.musicVol : 0.7;
      audio.sfxOn = a.sfxOn != null ? a.sfxOn : true;
      audio.sfxVol = a.sfxVol != null ? a.sfxVol : 0.6;
      if (a.data) setMusic(new File([base64ToBlob(a.data, a.dataType)], a.musicName || "music"));
      else setMusic(null);
      $("inp-music-vol").value = Math.round(audio.musicVol * 100);
      $("val-music-vol").textContent = Math.round(audio.musicVol * 100) + "%";
      $("inp-sfx").checked = audio.sfxOn;
      $("inp-sfx-vol").value = Math.round(audio.sfxVol * 100);
      $("val-sfx-vol").textContent = Math.round(audio.sfxVol * 100) + "%";

      document.body.classList.remove("setup-mode");
      syncInputsFromState(); updateEditBadge();
      renderRanksUI(); renderOrderUI(); updateIdlePoster(); renderStatic();
      history.length = 0; histIndex = -1; commitHistory();
      projStatus("Project opened");
      setTimeout(() => projStatus(""), 4000);
    } catch (e) {
      projStatus("Open failed: " + e.message);
    }
  }

  // ------------------------------------------------------------- clips UI
  // file: File or Blob (Blob for stock downloads); source: "user" | "pexels"
  function assignClip(pos, file, source, displayName) {
    const r = state.ranks[pos - 1];
    // (old clip URL intentionally not revoked, so undo can restore it)
    const url = URL.createObjectURL(file);
    // name reflects the ACTUAL sourced clip (real YouTube title / search term),
    // not a static filename
    r.clip = { url, name: (displayName || file.name || "clip"), thumb: null, source: source || "user", crop: { mode: "fill", zoom: 1, x: 0, y: 0 } };
    r.sourcing = null;
    // thumbnail
    const v = document.createElement("video");
    v.muted = true; v.preload = "auto"; v.src = url;
    v.addEventListener("loadeddata", () => {
      // Measure the source and pick a sensible default keep-window. Short clips
      // play whole; long clips default to a centered DEFAULT_TRIM_SECONDS slice
      // (skips intro/outro) — the user can drag it anywhere or hit "✨ best".
      const dur = isFinite(v.duration) && v.duration > 0 ? v.duration : DEFAULT_CLIP_SECONDS;
      if (r.clip && r.clip.url === url) {
        r.clip.srcDuration = dur;
        if (r.clip.trimStart == null || r.clip.trimEnd == null) {
          if (dur <= FULL_IF_UNDER) { r.clip.trimStart = 0; r.clip.trimEnd = dur; }
          else {
            const s = Math.max(0, Math.min((dur - DEFAULT_TRIM_SECONDS) / 2, dur - DEFAULT_TRIM_SECONDS));
            r.clip.trimStart = s; r.clip.trimEnd = s + DEFAULT_TRIM_SECONDS;
          }
        }
        updateTotalUI();
      }
      v.currentTime = Math.min(0.5, (v.duration || 1) / 2);
      v.addEventListener("seeked", () => {
        const tc = document.createElement("canvas");
        tc.width = 148; tc.height = 148;
        const t = tc.getContext("2d");
        const s = Math.max(tc.width / v.videoWidth, tc.height / v.videoHeight);
        t.drawImage(v, (tc.width - v.videoWidth * s) / 2, (tc.height - v.videoHeight * s) / 2,
          v.videoWidth * s, v.videoHeight * s);
        r.clip.thumb = tc.toDataURL("image/jpeg", 0.7);
        v.src = "";
        renderRanksUI(); renderOrderUI();
      }, { once: true });
    }, { once: true });
    renderRanksUI(); renderOrderUI(); updateIdlePoster(); scheduleCommit();
  }

  function moveClip(pos, dir) {
    const j = pos - 1 + dir;
    if (j < 0 || j >= state.numRanks) return;
    const a = state.ranks[pos - 1], b = state.ranks[j];
    [a.clip, b.clip] = [b.clip, a.clip];
    renderRanksUI(); updateIdlePoster(); scheduleCommit();
  }

  // ---------------------------------------------------- per-clip trim (120s cap)
  // Live total-duration readout + a “Fit to 120s” escape hatch. Playback/export use the same cap.
  function updateTotalUI() {
    const el = $("total-note");
    if (el) {
      const total = totalDuration();
      const over = total > MAX_TOTAL_SECONDS + 0.05;
      el.innerHTML = `⏱ Total <b>${total.toFixed(1)}s</b> / ${MAX_TOTAL_SECONDS}s`
        + (over ? ` — <span class="over">${(total - MAX_TOTAL_SECONDS).toFixed(1)}s over (the end will be cut)</span>` : "");
      el.classList.toggle("over-total", over);
      const fit = $("btn-fit60");
      if (fit) fit.classList.toggle("hidden", !over);
    }
  }

  // Proportionally shrink every rank's window so the whole video fits in 120s,
  // preserving each clip's relative share (no forced equal splits).
  function fitTo60() {
    const total = totalDuration();
    if (total <= MAX_TOTAL_SECONDS) return;
    const scale = MAX_TOTAL_SECONDS / total;
    state.ranks.forEach((r) => {
      if (r.clip && r.clip.srcDuration) {
        const len = (clipLen(r)) * scale;
        let s = r.clip.trimStart || 0;
        if (s + len > r.clip.srcDuration) s = Math.max(0, r.clip.srcDuration - len);
        r.clip.trimStart = s; r.clip.trimEnd = s + len;
      } else if (!r.clip) {
        r.duration = (r.duration || DEFAULT_CLIP_SECONDS) * scale;
      }
    });
    renderRanksUI(); scheduleStatic(); scheduleCommit();
  }

  // Scan a clip for its most action-packed window (max frame-to-frame motion)
  // and return the start time for a `want`-second slice. Samples a tiny 32×18
  // frame every ~0.5s (capped to ~120 samples) — all clips are same-origin
  // object URLs, so getImageData never taints.
  function scanBestSegment(url, dur, want) {
    return new Promise((resolve, reject) => {
      const v = document.createElement("video");
      v.muted = true; v.preload = "auto"; v.src = url;
      const W = 32, H = 18;
      const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
      const ctx = cv.getContext("2d", { willReadFrequently: true });
      const step = Math.max(0.5, dur / 120);
      const times = []; for (let t = 0.1; t < dur; t += step) times.push(t);
      const motion = new Array(times.length).fill(0);
      let prev = null, i = 0, guard = 0;
      const done = () => {
        const win = Math.max(1, Math.round(want / step));
        const pre = [0]; for (let k = 0; k < motion.length; k++) pre.push(pre[k] + motion[k]);
        let best = 0, bestSum = -1;
        for (let s = 0; s + win <= motion.length; s++) {
          const sum = pre[s + win] - pre[s];
          if (sum > bestSum) { bestSum = sum; best = s; }
        }
        v.src = ""; clearTimeout(guard);
        let startT = best * step;
        startT = Math.max(0, Math.min(startT, Math.max(0, dur - want)));
        resolve(startT);
      };
      const seekNext = () => { if (i >= times.length) return done(); try { v.currentTime = times[i]; } catch (_) { done(); } };
      v.addEventListener("error", () => { v.src = ""; clearTimeout(guard); reject(new Error("scan error")); });
      v.addEventListener("loadeddata", seekNext, { once: true });
      v.addEventListener("seeked", () => {
        try {
          ctx.drawImage(v, 0, 0, W, H);
          const d = ctx.getImageData(0, 0, W, H).data;
          if (prev) { let s = 0; for (let k = 0; k < d.length; k += 4) s += Math.abs((d[k] + d[k + 1] + d[k + 2]) - (prev[k] + prev[k + 1] + prev[k + 2])); motion[i] = s; }
          prev = d;
        } catch (_) {}
        i++; seekNext();
      });
      guard = setTimeout(done, 20000); // never hang the UI
    });
  }

  async function autoPickBest(pos, btn) {
    const r = state.ranks[pos - 1], c = r && r.clip;
    if (!c || !c.srcDuration) return;
    const want = Math.min(clipLen(r), c.srcDuration);
    const old = btn.textContent; btn.disabled = true; btn.textContent = "scanning…";
    try {
      const start = await scanBestSegment(c.url, c.srcDuration, want);
      c.trimStart = start; c.trimEnd = Math.min(c.srcDuration, start + want);
      renderRanksUI(); scheduleStatic(); scheduleCommit(); updateTotalUI();
    } catch (_) {
      btn.textContent = "scan failed"; setTimeout(() => { btn.disabled = false; btn.textContent = old; }, 1400);
    }
  }

  // Build the per-rank trim widget (two range handles + length + "best").
  function buildTrimCtl(r, pos) {
    const wrap = document.createElement("div");
    wrap.className = "trim-ctl";
    const c = r.clip;
    if (!c) return wrap;
    const tag = document.createElement("span");
    tag.className = "swatch-tag"; tag.textContent = "✂ keep";
    wrap.appendChild(tag);
    if (!c.srcDuration) { const m = document.createElement("span"); m.className = "soft"; m.textContent = "measuring…"; wrap.appendChild(m); return wrap; }
    const dur = c.srcDuration;
    if (c.trimStart == null) c.trimStart = 0;
    if (c.trimEnd == null) c.trimEnd = dur;
    const sliders = document.createElement("div");
    sliders.className = "trim-sliders";
    const mk = () => { const s = document.createElement("input"); s.type = "range"; s.min = 0; s.max = dur.toFixed(2); s.step = 0.1; return s; };
    const startR = mk(), endR = mk();
    startR.value = c.trimStart; endR.value = c.trimEnd;
    const read = document.createElement("span");
    read.className = "trim-read";
    const upd = () => { read.textContent = `${c.trimStart.toFixed(1)}–${c.trimEnd.toFixed(1)}s · ${(c.trimEnd - c.trimStart).toFixed(1)}s`; };
    startR.addEventListener("input", () => {
      c.trimStart = Math.min(+startR.value, c.trimEnd - 0.3);
      startR.value = c.trimStart; upd(); previewFrameAt(pos); scheduleStatic(); scheduleCommit(); updateTotalUI();
    });
    endR.addEventListener("input", () => {
      c.trimEnd = Math.max(+endR.value, c.trimStart + 0.3);
      endR.value = c.trimEnd; upd(); previewFrameAt(pos, true); scheduleStatic(); scheduleCommit(); updateTotalUI();
    });
    sliders.appendChild(startR); sliders.appendChild(endR);
    wrap.appendChild(sliders);
    wrap.appendChild(read);
    const best = document.createElement("button");
    best.type = "button"; best.className = "btn btn-ghost btn-small";
    best.textContent = "✨ best";
    best.title = "Auto-pick the most action-packed part of this clip (keeps the same length)";
    best.addEventListener("click", () => autoPickBest(pos, best));
    wrap.appendChild(best);
    upd();
    return wrap;
  }


  function buildCropCtl(r, pos) {
    const wrap = document.createElement("div");
    wrap.className = "box-ctl";
    const c = r.clip;
    if (!c) return wrap;
    c.crop = c.crop || { mode: "fill", zoom: 1, x: 0, y: 0 };
    const head = document.createElement("div");
    head.className = "box-ctl-head";
    head.innerHTML = `<span class="swatch-tag">crop</span><span class="soft">Reframe this clip inside the center video band.</span>`;
    wrap.appendChild(head);
    const row1 = document.createElement("div");
    row1.className = "trim-ctl";
    const mode = document.createElement("select");
    mode.innerHTML = `<option value="fill">Fill band</option><option value="fit">Show whole clip</option>`;
    mode.value = c.crop.mode || "fill";
    mode.addEventListener("change", () => { c.crop.mode = mode.value; scheduleStatic(); scheduleCommit(); });
    row1.appendChild(mode);
    const reset = document.createElement("button");
    reset.type = "button"; reset.className = "btn btn-ghost btn-small"; reset.textContent = "Reset crop";
    reset.addEventListener("click", () => { c.crop = { mode: "fill", zoom: 1, x: 0, y: 0 }; zoom.value = 100; panX.value = 0; panY.value = 0; mode.value = "fill"; read(); scheduleStatic(); scheduleCommit(); });
    row1.appendChild(reset);
    wrap.appendChild(row1);
    const readout = document.createElement("span");
    readout.className = "trim-read";
    const sliders = document.createElement("div");
    sliders.className = "row compact-row";
    const mkRange = (min,max,step,val,label) => {
      const lab = document.createElement("label"); lab.className = "mini-field"; lab.textContent = label;
      const inp = document.createElement("input"); inp.type = "range"; inp.min = min; inp.max = max; inp.step = step; inp.value = val; lab.appendChild(inp); sliders.appendChild(lab); return inp;
    };
    const zoom = mkRange(100, 300, 1, Math.round((c.crop.zoom || 1) * 100), "Zoom");
    const panX = mkRange(-500, 500, 1, Math.round(c.crop.x || 0), "Pan X");
    const panY = mkRange(-700, 700, 1, Math.round(c.crop.y || 0), "Pan Y");
    const read = () => { readout.textContent = `zoom ${(Number(zoom.value)/100).toFixed(2)}× · x ${panX.value}px · y ${panY.value}px`; };
    [zoom, panX, panY].forEach((inp) => inp.addEventListener("input", () => {
      c.crop.zoom = Number(zoom.value) / 100; c.crop.x = Number(panX.value); c.crop.y = Number(panY.value); read(); scheduleStatic(); scheduleCommit();
    }));
    read();
    wrap.appendChild(sliders);
    wrap.appendChild(readout);
    return wrap;
  }

  // When the first-in-order clip's window changes, refresh the idle poster to
  // that frame so the preview reflects the trim.
  function previewFrameAt(pos, atEnd) {
    if (state.order[0] !== pos) return;
    const c = state.ranks[pos - 1] && state.ranks[pos - 1].clip;
    const v = idlePoster.video;
    if (!c || !v) return;
    const t = atEnd ? c.trimEnd : c.trimStart;
    try { v.currentTime = Math.max(0, Math.min(t || 0, (v.duration || 1) - 0.05)); } catch (_) {}
  }

  // ---- shared UI widgets: color swatch row + emoji popover ----

  // A row of clickable color dots (+ native custom picker). Manages its own
  // selection ring so callers don't need to re-render.
  function swatchRow(labelText, getCur, onPick) {
    const wrap = document.createElement("div");
    wrap.className = "swatch-row";
    if (labelText) {
      const tag = document.createElement("span");
      tag.className = "swatch-tag";
      tag.textContent = labelText;
      wrap.appendChild(tag);
    }
    const dots = [];
    const refresh = () => {
      const cur = toHex(getCur()).toLowerCase();
      dots.forEach((d) => d.classList.toggle("sel", d.dataset.hex === cur));
    };
    SWATCHES.forEach((hex) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "swatch";
      b.dataset.hex = hex.toLowerCase();
      b.style.background = hex;
      b.title = hex;
      b.addEventListener("click", () => { onPick(hex); refresh(); });
      wrap.appendChild(b);
      dots.push(b);
    });
    const custom = document.createElement("input");
    custom.type = "color";
    custom.className = "swatch-custom";
    custom.title = "Custom color";
    custom.value = toHex(getCur());
    custom.addEventListener("input", () => { onPick(custom.value); refresh(); });
    wrap.appendChild(custom);
    refresh();
    return wrap;
  }

  // One shared emoji popover, repositioned next to whichever 😀 button opened
  // it. Search + recents make inserting emojis much faster.
  let emojiPop = null, emojiTarget = null, emojiSearch = "", emojiBody = null;
  function recentEmojis() { try { return JSON.parse(localStorage.getItem(EMOJI_RECENTS_LS) || "[]"); } catch (_) { return []; } }
  function rememberEmoji(em) {
    const list = recentEmojis().filter((x) => x !== em); list.unshift(em);
    localStorage.setItem(EMOJI_RECENTS_LS, JSON.stringify(list.slice(0, 24)));
  }
  function insertEmoji(em) {
    if (!emojiTarget) return;
    const inp = emojiTarget.input;
    const s = inp.selectionStart ?? inp.value.length;
    const e2 = inp.selectionEnd ?? s;
    inp.value = inp.value.slice(0, s) + em + inp.value.slice(e2);
    const caret = s + em.length;
    inp.focus();
    inp.setSelectionRange(caret, caret);
    emojiTarget.onChange(inp.value);
    rememberEmoji(em);
    renderEmojiBody();
  }
  function renderEmojiBody() {
    if (!emojiBody) return;
    emojiBody.innerHTML = "";
    const q = emojiSearch.trim();
    const groups = EMOJI_GROUPS.map(([g, list]) => [g, g === "Recent" ? recentEmojis() : list]);
    const visible = q
      ? groups.map(([g, list]) => [g, list.filter((em) => g.toLowerCase().includes(q.toLowerCase()) || em.includes(q))]).filter(([,list]) => list.length)
      : groups;
    visible.forEach(([group, list]) => {
      if (!list.length) return;
      const h = document.createElement("div"); h.className = "emoji-group"; h.textContent = group; emojiBody.appendChild(h);
      const grid = document.createElement("div"); grid.className = "emoji-grid";
      list.forEach((em) => {
        const b = document.createElement("button"); b.type = "button"; b.className = "emoji-btn"; b.textContent = em; b.title = group; b.addEventListener("click", () => insertEmoji(em)); grid.appendChild(b);
      });
      emojiBody.appendChild(grid);
    });
    if (!emojiBody.children.length) {
      const empty = document.createElement("div"); empty.className = "hint"; empty.textContent = "No emojis match that search."; emojiBody.appendChild(empty);
    }
  }
  function buildEmojiPanel() {
    emojiPop = document.createElement("div");
    emojiPop.id = "emoji-pop";
    emojiPop.className = "hidden";
    const search = document.createElement("input");
    search.type = "text"; search.placeholder = "Search group or paste emoji"; search.className = "emoji-search";
    search.addEventListener("input", () => { emojiSearch = search.value; renderEmojiBody(); });
    emojiPop.appendChild(search);
    emojiBody = document.createElement("div");
    emojiPop.appendChild(emojiBody);
    renderEmojiBody();
    document.body.appendChild(emojiPop);
    document.addEventListener("pointerdown", (e) => {
      if (!emojiPop.classList.contains("hidden") && !emojiPop.contains(e.target) && !(emojiTarget && emojiTarget.anchor.contains(e.target))) closeEmojiPanel();
    });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeEmojiPanel(); });
  }
  function closeEmojiPanel() {
    if (emojiPop) emojiPop.classList.add("hidden");
    emojiTarget = null; emojiSearch = "";
    const s = emojiPop && emojiPop.querySelector(".emoji-search"); if (s) s.value = "";
  }
  function toggleEmojiPanel(anchor, input, onChange) {
    if (!emojiPop) buildEmojiPanel();
    if (emojiTarget && emojiTarget.anchor === anchor) { closeEmojiPanel(); return; }
    emojiTarget = { anchor, input, onChange };
    renderEmojiBody();
    emojiPop.classList.remove("hidden");
    const r = anchor.getBoundingClientRect();
    const pw = 324, ph = Math.min(460, window.innerHeight - 40);
    emojiPop.style.maxHeight = ph + "px";
    emojiPop.style.left = Math.max(8, Math.min(r.left, window.innerWidth - pw - 8)) + "px";
    const below = r.bottom + 6, above = r.top - 6;
    if (below + ph <= window.innerHeight || above < ph) emojiPop.style.top = Math.min(below, window.innerHeight - ph - 8) + "px";
    else emojiPop.style.top = Math.max(8, above - ph) + "px";
  }

  // ------------------------------------- cover boxes (hide part of a rank clip)
  // Boxes are per-rank; the preview shows state.editRank so a box can be
  // positioned on the canvas. Which rank rows have their "Adjust" panel open is
  // remembered across re-renders so box edits don't collapse it.
  const advOpen = new Set();
  function updateEditBadge() {
    const b = $("edit-rank-badge");
    if (b) b.textContent = "Previewing rank " + editPos();
  }
  function setEditRank(pos) {
    state.editRank = clamp(pos, 1, state.ranks.length || 1);
    updateEditBadge();
    renderRanksUI();
    updateIdlePoster(); // reloads the backdrop for that rank + renders
  }
  function addBox(pos, type) {
    state.editRank = clamp(pos, 1, state.ranks.length || 1);
    advOpen.add(pos);
    const w = 340, h = 210;
    const t = (type === "blend" || type === "solid") ? type : "blur";
    rankBoxes(pos).push({
      id: "box" + (++boxSeq),
      type: t,
      color: "#000000", // used by "solid" boxes
      x: Math.round((W - w) / 2),
      y: Math.round(VID.y1 + ((VID.y2 - VID.y1) - h) / 2),
      w, h,
    });
    updateEditBadge(); renderRanksUI(); scheduleCommit(); updateIdlePoster();
  }
  function removeBox(pos, id) {
    const r = state.ranks[pos - 1];
    if (r) r.boxes = (r.boxes || []).filter((b) => b.id !== id);
    renderRanksUI(); scheduleCommit(); renderStatic();
  }
  function setBoxType(pos, id, type) {
    const b = rankBoxes(pos).find((x) => x.id === id);
    if (b) { b.type = type; renderRanksUI(); scheduleCommit(); renderStatic(); }
  }

  // The per-rank cover-box controls, shown inside a rank's Adjust panel.
  function buildBoxCtl(r, pos) {
    const wrap = document.createElement("div");
    wrap.className = "box-ctl";
    const head = document.createElement("div");
    head.className = "box-ctl-head";
    const t = document.createElement("span");
    t.className = "swatch-tag"; t.textContent = "▨ cover";
    head.appendChild(t);
    const addBlur = document.createElement("button");
    addBlur.type = "button"; addBlur.className = "btn btn-ghost btn-small";
    addBlur.textContent = "＋ Blur"; addBlur.title = "Frosted-glass box: the footage underneath, blurred";
    addBlur.addEventListener("click", () => addBox(pos, "blur"));
    const addBlend = document.createElement("button");
    addBlend.type = "button"; addBlend.className = "btn btn-ghost btn-small";
    addBlend.textContent = "＋ Blend"; addBlend.title = "Box filled with the blurred background so the area disappears";
    addBlend.addEventListener("click", () => addBox(pos, "blend"));
    const addSolid = document.createElement("button");
    addSolid.type = "button"; addSolid.className = "btn btn-ghost btn-small";
    addSolid.textContent = "＋ Solid"; addSolid.title = "Box filled with a flat color you choose";
    addSolid.addEventListener("click", () => addBox(pos, "solid"));
    head.appendChild(addBlur); head.appendChild(addBlend); head.appendChild(addSolid);
    wrap.appendChild(head);
    const boxes = r.boxes || [];
    if (boxes.length) {
      if (pos !== editPos()) {
        const focus = document.createElement("button");
        focus.type = "button"; focus.className = "btn btn-ghost btn-small box-focus";
        focus.textContent = "👁 Show this rank in preview to edit";
        focus.addEventListener("click", () => setEditRank(pos));
        wrap.appendChild(focus);
      }
      boxes.forEach((b, i) => {
        const row = document.createElement("div");
        row.className = "box-row";
        const tag = document.createElement("span");
        tag.className = "box-tag"; tag.textContent = "Box " + (i + 1);
        row.appendChild(tag);
        [["blur", "Blur"], ["blend", "Blend"], ["solid", "Solid"]].forEach(([val, txt]) => {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "btn btn-small " + (b.type === val ? "btn-primary" : "btn-ghost");
          btn.textContent = txt;
          btn.addEventListener("click", () => setBoxType(pos, b.id, val));
          row.appendChild(btn);
        });
        if (b.type === "solid") {
          const col = document.createElement("input");
          col.type = "color"; col.className = "box-color";
          col.value = b.color || "#000000";
          col.title = "Box color";
          col.addEventListener("input", () => {
            b.color = col.value; scheduleCommit(); renderStatic();
          });
          row.appendChild(col);
        }
        const del = document.createElement("button");
        del.type = "button"; del.className = "btn btn-ghost btn-small"; del.textContent = "🗑";
        del.title = "Remove this box"; del.style.marginLeft = "auto";
        del.addEventListener("click", () => removeBox(pos, b.id));
        row.appendChild(del);
        wrap.appendChild(row);
      });
    }
    return wrap;
  }

  function renderRanksUI() {
    closeEmojiPanel();
    const list = $("ranks-list");
    list.innerHTML = "";
    $("empty-state").classList.toggle("hidden", clipsAssigned() > 0);
    $("pexels-note").classList.toggle("hidden", !state.ranks.some((r) => r.clip && r.clip.source === "pexels"));
    updateMusicHint();
    updateAttributionsUI();
    state.ranks.forEach((r, i) => {
      const pos = i + 1;
      const row = document.createElement("div");
      row.className = "rank-row" + (pos === editPos() ? " focused" : "");

      const num = document.createElement("div");
      num.className = "rank-num";
      num.style.color = toHex(r.color);
      num.textContent = pos + ".";
      row.appendChild(num);

      // thumbnail / clip picker
      const thumb = document.createElement("div");
      thumb.className = "rank-thumb";
      thumb.title = r.clip ? r.clip.name + " — click to replace" : "Click to choose a clip";
      if (r.clip && r.clip.thumb) {
        const img = document.createElement("img");
        img.src = r.clip.thumb;
        thumb.appendChild(img);
        const sh = document.createElement("div");
        sh.className = "swap-hint";
        sh.textContent = r.clip.source === "pexels" ? "Pexels · replace" : "replace";
        thumb.appendChild(sh);
      } else if (r.sourcing === "loading") {
        thumb.textContent = "finding…";
      } else {
        thumb.textContent = r.clip ? "loading…" : "+ clip";
      }
      thumb.addEventListener("click", () => {
        const inp = document.createElement("input");
        inp.type = "file"; inp.accept = "video/*";
        inp.onchange = () => inp.files[0] && assignClip(pos, inp.files[0]);
        inp.click();
      });
      thumb.addEventListener("dragover", (e) => e.preventDefault());
      thumb.addEventListener("drop", (e) => {
        e.preventDefault();
        const f = [...e.dataTransfer.files].find((f) => f.type.startsWith("video"));
        if (f) assignClip(pos, f);
      });
      row.appendChild(thumb);

      // label + emoji + tools
      const main = document.createElement("div");
      main.className = "rank-main";

      const labelRow = document.createElement("div");
      labelRow.className = "label-row";
      const label = document.createElement("input");
      label.type = "text";
      label.placeholder = `Label for #${pos} (e.g. "Aaaah")`;
      label.value = r.label;
      label.addEventListener("input", () => {
        r.label = label.value;
        r.labelFromUser = label.value.trim().length > 0; // user-owned → kept on re-Generate
        scheduleCommit(); scheduleStatic();
      });
      labelRow.appendChild(label);
      const emojiBtn = document.createElement("button");
      emojiBtn.type = "button";
      emojiBtn.className = "btn btn-ghost btn-small emoji-toggle";
      emojiBtn.textContent = "😀";
      emojiBtn.title = "Insert emoji";
      emojiBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        toggleEmojiPanel(emojiBtn, label, (v) => { r.label = v; r.labelFromUser = true; scheduleCommit(); scheduleStatic(); });
      });
      labelRow.appendChild(emojiBtn);
      main.appendChild(labelRow);

      // footage status (kept visible — it's informative, not clutter)
      const st = document.createElement("div");
      st.className = "rank-status";
      if (r.sourcing === "loading") { st.classList.add("loading"); st.textContent = "Searching for footage…"; }
      else if (r.sourcing === "failed") { st.classList.add("failed"); st.textContent = "No footage match — an animated background will be generated."; }
      else if (r.clip) {
        // Show the ACTUAL clip title (varies per clip) as the primary line,
        // with the source/provider as a muted suffix — not a static label.
        const clipTitle = (r.clip.name || "clip").replace(/\s+/g, " ").trim();
        const shown = clipTitle.length > 52 ? clipTitle.slice(0, 51) + "…" : clipTitle;
        let src = "";
        if (r.clip.source === "youtube") src = "YouTube CC · " + ((r.clip.attribution && r.clip.attribution.uploader) || "unknown");
        else if (r.clip.source === "pexels") src = "Pexels";
        else if (r.clip.source === "pixabay") src = "Pixabay";
        else if (r.clip.source === "user") src = "your upload";
        else if (r.clip.source === "link") src = siteLabel(r.clip.attribution && r.clip.attribution.site) + " · ⚠ not license-cleared";
        st.innerHTML = `🎬 <b>${escapeHtml(shown)}</b>` + (src ? ` <span class="soft">— ${escapeHtml(src)}</span>` : "");
        if (r.clip.source === "link") st.classList.add("failed"); // amber-ish warning tone
        st.title = clipTitle;
      }
      else st.textContent = "No clip — animated background will be generated.";
      main.appendChild(st);

      // Advanced per-rank controls tucked into a disclosure so the row stays
      // clean: colors, size, link/move, trim, and cover boxes.
      const adv = document.createElement("details");
      adv.className = "rank-adv";
      adv.open = advOpen.has(pos);
      adv.addEventListener("toggle", () => { adv.open ? advOpen.add(pos) : advOpen.delete(pos); });
      const sum = document.createElement("summary");
      sum.textContent = "⚙ Adjust — colors · size · trim · cover boxes";
      adv.appendChild(sum);

      const tools = document.createElement("div");
      tools.className = "rank-tools";
      tools.appendChild(swatchRow("№", () => r.color, (hex) => {
        r.color = hex; num.style.color = hex; renderOrderUI(); scheduleCommit(); scheduleStatic();
      }));
      tools.appendChild(swatchRow("label", () => r.labelColor, (hex) => {
        r.labelColor = hex; scheduleCommit(); scheduleStatic();
      }));

      // per-rank text size: shrink/grow just this rank's text
      const sizeCtl = document.createElement("div");
      sizeCtl.className = "size-ctl";
      const sTag = document.createElement("span");
      sTag.className = "swatch-tag"; sTag.textContent = "size";
      sizeCtl.appendChild(sTag);
      const readout = document.createElement("span");
      readout.className = "size-val";
      const setReadout = () => { readout.textContent = Math.round((r.sizeScale || 1) * 100) + "%"; };
      const stepBtn = (txt, d) => {
        const b = document.createElement("button");
        b.type = "button"; b.className = "btn btn-ghost btn-small"; b.textContent = txt;
        b.title = d < 0 ? "Make this rank's text smaller" : "Make this rank's text bigger";
        b.addEventListener("click", () => {
          r.sizeScale = Math.max(0.5, Math.min(1.6, +(((r.sizeScale || 1) + d).toFixed(2))));
          setReadout(); scheduleCommit(); scheduleStatic();
        });
        return b;
      };
      sizeCtl.appendChild(stepBtn("A−", -0.1));
      sizeCtl.appendChild(readout);
      sizeCtl.appendChild(stepBtn("A+", 0.1));
      setReadout();
      tools.appendChild(sizeCtl);
      const swap = document.createElement("div");
      swap.className = "clip-swap-btns";
      // per-rank: import a clip straight from a pasted video link
      const linkBtn = document.createElement("button");
      linkBtn.type = "button"; linkBtn.className = "btn btn-ghost btn-small";
      linkBtn.textContent = "🔗 link";
      linkBtn.title = "Import this rank's clip from an Instagram / TikTok / YouTube / etc. link (not license-cleared)";
      linkBtn.addEventListener("click", () => importLinkToRank(pos));
      swap.appendChild(linkBtn);
      [["↑ clip", -1], ["↓ clip", 1]].forEach(([txt, dir]) => {
        const b = document.createElement("button");
        b.type = "button"; b.className = "btn btn-ghost btn-small"; b.textContent = txt;
        b.title = "Move this clip to the rank " + (dir < 0 ? "above" : "below");
        b.addEventListener("click", () => moveClip(pos, dir));
        swap.appendChild(b);
      });
      tools.appendChild(swap);
      adv.appendChild(tools);

      // per-clip trim: choose exactly what part of the clip to keep
      if (r.clip) { adv.appendChild(buildTrimCtl(r, pos)); adv.appendChild(buildCropCtl(r, pos)); }
      // per-rank cover boxes: hide part of this clip
      adv.appendChild(buildBoxCtl(r, pos));
      main.appendChild(adv);

      row.appendChild(main);
      list.appendChild(row);
    });
    updateTotalUI();
  }

  // ------------------------------------------------------ playback order UI
  let dragIdx = null;
  function renderOrderUI() {
    const ul = $("order-list");
    ul.innerHTML = "";
    state.order.forEach((pos, idx) => {
      const r = state.ranks[pos - 1];
      const li = document.createElement("li");
      li.draggable = true;
      li.innerHTML = `<span class="grip">⠿</span><span class="o-num" style="color:${toHex(r.color)}">${pos}.</span>` +
        `<span class="o-label">${r.clip ? r.clip.name : "no clip"}</span>`;
      const btns = document.createElement("span");
      btns.className = "o-btns";
      [["↑", -1], ["↓", 1]].forEach(([txt, dir]) => {
        const b = document.createElement("button");
        b.className = "btn btn-ghost btn-small"; b.textContent = txt;
        b.addEventListener("click", () => {
          const j = idx + dir;
          if (j < 0 || j >= state.order.length) return;
          [state.order[idx], state.order[j]] = [state.order[j], state.order[idx]];
          renderOrderUI(); updateIdlePoster(); scheduleCommit();
        });
        btns.appendChild(b);
      });
      li.appendChild(btns);
      li.addEventListener("dragstart", () => { dragIdx = idx; li.classList.add("dragging"); });
      li.addEventListener("dragend", () => { dragIdx = null; li.classList.remove("dragging"); });
      li.addEventListener("dragover", (e) => e.preventDefault());
      li.addEventListener("drop", (e) => {
        e.preventDefault();
        if (dragIdx === null || dragIdx === idx) return;
        const [moved] = state.order.splice(dragIdx, 1);
        state.order.splice(idx, 0, moved);
        renderOrderUI(); updateIdlePoster(); scheduleCommit();
      });
      ul.appendChild(li);
    });
  }

  // ------------------------------------------------------------ generator
  // ---- topic inference: map the USER'S title to the closest model niche ----
  const RANKER_STOPWORDS = new Set([
    "ranking", "rank", "top", "best", "worst", "most", "the", "a", "an", "of",
    "ever", "all", "time", "funniest", "craziest", "wildest", "insane", "epic",
  ]);
  // Topic-neutral reaction labels: used when the user typed a topic we can't
  // confidently map to a niche, so we never impose an off-topic niche's words
  // (e.g. "road rage" must not get "faceplant"/"wipeout" fails labels).
  const NEUTRAL_LABELS = [
    ["No way", "😱"], ["Insane", "🔥"], ["How?!", "🤯"], ["Respect", "🫡"],
    ["Painful", "😬"], ["Too clean", "✨"], ["Chaos", "💀"], ["Wait what", "👀"],
    ["Legend", "👑"], ["Nope", "🙅"], ["Yikes", "😵"], ["Unreal", "🐐"],
  ];
  const NICHE_VOCAB = {
    fails: ["fail", "fails", "fall", "falls", "faceplant", "wipeout", "loss", "fumble", "embarrassing", "aura", "cringe"],
    football: ["football", "soccer", "goal", "goals", "keeper", "penalty", "freekick", "worldcup"],
    nba: ["nba", "basketball", "dunk", "dunks", "buzzer", "hoop", "hoops"],
    food: ["food", "foods", "snack", "snacks", "dessert", "desserts", "recipe", "eating", "pizza", "burger"],
    memes: ["meme", "memes", "viral", "trend", "trends", "brainrot"],
    gaming: ["gaming", "game", "games", "gamer", "minecraft", "fortnite", "clutch", "speedrun", "glitch", "glitches"],
    animals: ["animal", "animals", "cat", "cats", "dog", "dogs", "pet", "pets", "kitten", "puppy"],
    celebrity: ["celebrity", "celebrities", "celeb", "famous", "interview", "interviews"],
    satisfying: ["satisfying", "asmr", "oddly", "relaxing"],
    science: ["science", "experiment", "experiments", "physics", "chemistry", "reaction", "reactions"],
    cars: ["car", "cars", "drift", "drifts", "engine", "supercar", "supercars", "truck", "trucks"],
    gym: ["gym", "lift", "lifts", "deadlift", "bench", "workout", "workouts", "fitness", "ego"],
    extreme: ["extreme", "stunt", "stunts", "parkour", "cliff", "skydive", "downhill"],
    school: ["school", "teacher", "teachers", "class", "exam", "exams", "homework"],
    wholesome: ["wholesome", "heartwarming", "cute", "reunion", "reunions", "surprise", "surprises"],
  };
  const titleTokens = (t) => stripEmoji(t).toLowerCase().split(/\s+/).filter(Boolean);
  function topicKeywords(title) {
    const kept = titleTokens(title).filter((w) => !RANKER_STOPWORDS.has(w));
    return (kept.length ? kept : titleTokens(title)).join(" ");
  }
  function inferNiche(title) {
    const words = titleTokens(title);
    let best = null, bestScore = 0;
    for (const [niche, vocab] of Object.entries(NICHE_VOCAB)) {
      const score = words.reduce((s, w) => s + (vocab.includes(w) ? 2 : vocab.some((v) => v.length > 3 && w.includes(v)) ? 1 : 0), 0);
      if (score > bestScore) { best = niche; bestScore = score; }
    }
    return best; // null when confidence is zero — caller falls back
  }
  // Default accent for a user title that has none: the niche-matched words,
  // else the last two non-stopword words.
  function defaultAccentFrom(title, niche) {
    const words = stripEmoji(title).split(/\s+/).filter(Boolean);
    if (niche) {
      const vocab = NICHE_VOCAB[niche];
      const hit = words.filter((w) => vocab.includes(w.toLowerCase()));
      if (hit.length) return hit.join(" ");
    }
    const content = words.filter((w) => !RANKER_STOPWORDS.has(w.toLowerCase()));
    return content.slice(-2).join(" ");
  }

  function applyAiLabelOptions(label, emoji) {
    const rawLabel = String(label || "").trim();
    const wordLimit = Number(state.aiOptions && state.aiOptions.wordLimit) || 0;
    let clean = stripEmoji(rawLabel).replace(/\s+/g, " ").trim();
    if (wordLimit > 0) clean = clean.split(" ").slice(0, wordLimit).join(" ");
    const mode = (state.aiOptions && state.aiOptions.emojiMode) || "auto";
    const pickedEmoji = String(emoji || "").trim();
    if (mode === "none") return clean;
    if (mode === "one") return [clean, pickedEmoji || "🔥"].filter(Boolean).join(" ").trim();
    return [clean, pickedEmoji].filter(Boolean).join(" ").trim();
  }
  function makeHookText() {
    const lead = ["Wait for #1", "You won't expect #1", "This ranking gets wild", "The ending is insane", "Agree or not?"];
    const topic = state.title || state.accent || "this ranking";
    return `${lead[Math.floor(Math.random() * lead.length)]} — ${topic}`;
  }
  function makeOutroText() {
    const ctas = ["Comment your ranking", "Follow for more rankings", "Which one is your #1?", "Disagree? Drop yours below"];
    return `${ctas[Math.floor(Math.random() * ctas.length)]} 👇`;
  }

  // USER INPUT ALWAYS WINS: a typed title/accent/label is never overwritten.
  // With a user title, the generator only fills what's missing (labels for
  // empty ranks, from the closest inferred niche) and stock search is driven
  // by the user's title keywords instead of the generated concept.
  async function autoGenerate() {
    const status = $("autogen-status");
    status.textContent = "Generating…";
    try {
      // Only a USER-TYPED title is kept; an AI-written title is regenerated,
      // so pressing Generate again yields a fresh, different concept.
      const userHasTitle = state.titleFromUser && state.title.trim().length > 0;
      const inferred = userHasTitle ? inferNiche(state.title) : null;
      // When the user gave a topic we can't confidently place in a niche, use
      // topic-neutral reaction labels instead of hijacking it into "fails".
      const useNeutralLabels = userHasTitle && !inferred;
      const c = await window.RankingGenerator.generateRankingConcept(
        userHasTitle ? (inferred || undefined) : undefined, state.numRanks);
      const neutralStart = Math.floor(Math.random() * NEUTRAL_LABELS.length);
      if (userHasTitle) {
        // keep the user's title + accent exactly; remember their topic words
        state.niche = inferred || "";
        state.topic = topicKeywords(state.title);
        if (!state.accent.trim()) {
          state.accent = defaultAccentFrom(state.title, inferred);
          $("inp-accent").value = state.accent;
        }
      } else {
        state.title = c.title || "";
        state.accent = c.accent_word || "";
        state.titleFromUser = false;
        $("inp-title").value = state.title;
        $("inp-accent").value = state.accent;
        state.niche = c.niche || "";
        state.topic = "";
      }
      (c.ranks || []).forEach((cr, idx) => {
        const r = state.ranks[cr.position - 1];
        if (!r) return;
        // replace AI labels on every press; keep labels the USER typed
        if (!r.labelFromUser) {
          if (useNeutralLabels) {
            const [lw, le] = NEUTRAL_LABELS[(neutralStart + idx) % NEUTRAL_LABELS.length];
            r.label = applyAiLabelOptions(lw, ((state.aiOptions && state.aiOptions.emojiMode)==="none") ? "" : le);
          } else {
            r.label = applyAiLabelOptions(cr.label || "", cr.emoji || "");
          }
        }
        // generated clip_desc only steers stock search when the concept owns
        // the topic; with a user title, queries come from the title keywords
        r.query = userHasTitle ? "" : (cr.clip_desc || "");
        r.duration = cr.duration_sec > 0 ? Math.min(8, cr.duration_sec) : null;
      });
      const st = c.style || {};
      if (Array.isArray(st.number_colors)) {
        // contract colors are named ("gold"|"white"|"red"); store as hex
        st.number_colors.forEach((cn, i) => { if (state.ranks[i] && NAMED[cn]) state.ranks[i].color = NAMED[cn]; });
      }
      if (st.title_scale) { state.titleScale = st.title_scale; $("inp-title-size").value = Math.round(st.title_scale * 100); $("val-title-size").textContent = Math.round(st.title_scale * 100) + "%"; }
      if (st.side_scale) { state.sideScale = st.side_scale; $("inp-side-size").value = Math.round(st.side_scale * 100); $("val-side-size").textContent = Math.round(st.side_scale * 100) + "%"; }
      renderRanksUI(); renderOrderUI(); renderStatic(); scheduleCommit();
      status.textContent = clipsAssigned()
        ? "Concept generated — labels & title updated."
        : "Concept generated. Ranks without clips get generated animated backgrounds — or add your own clips / use 🔎 Find clips.";
      return true;
    } catch (e) {
      status.textContent = "Generator failed (" + e.message + ") — using manual entry.";
      return false;
    }
  }

  // --------------------------------------------- stock footage (Pexels API)
  const PEXELS_KEY_LS = "rsm_pexels_key";
  // Priority: key typed in settings (localStorage) > config.local.js default.
  const getPexelsKey = () =>
    (localStorage.getItem(PEXELS_KEY_LS) || "").trim() ||
    ((window.APP_CONFIG && window.APP_CONFIG.pexelsKey) || "").trim();

  // Search Pexels for one portrait clip matching `query`; resolves to a File.
  async function fetchStockClip(query, used) {
    used = used || new Set();
    const url = "https://api.pexels.com/videos/search?query=" + encodeURIComponent(query) +
      "&orientation=portrait&size=medium&per_page=20";
    const res = await fetch(url, { headers: { Authorization: getPexelsKey() } });
    if (!res.ok) throw new Error("Pexels HTTP " + res.status);
    const data = await res.json();
    for (const v of data.videos || []) {
      if (used.has("px" + v.id)) continue; // never repeat a clip across ranks
      // smallest portrait file with height >= 960 keeps downloads polite
      const files = (v.video_files || [])
        .filter((f) => f.height >= 960 && (!f.file_type || /mp4/i.test(f.file_type)))
        .sort((a, b) => a.height - b.height);
      const f = files[0];
      if (!f) continue;
      const blob = await (await fetch(f.link)).blob();
      used.add("px" + v.id);
      return new File([blob], "pexels-" + v.id + ".mp4", { type: "video/mp4" });
    }
    throw new Error("no portrait result");
  }

  // ---- Pixabay Videos: second stock provider (optional key) ----
  const PIXABAY_KEY_LS = "rsm_pixabay_key";
  const getPixabayKey = () =>
    (localStorage.getItem(PIXABAY_KEY_LS) || "").trim() ||
    ((window.APP_CONFIG && window.APP_CONFIG.pixabayKey) || "").trim();

  async function fetchPixabayClip(query, used) {
    used = used || new Set();
    const res = await fetch("https://pixabay.com/api/videos/?key=" + encodeURIComponent(getPixabayKey()) +
      "&q=" + encodeURIComponent(query) + "&per_page=20&safesearch=true");
    if (!res.ok) throw new Error("Pixabay HTTP " + res.status);
    const data = await res.json();
    // same selection logic as Pexels: height >= 960, portrait preferred,
    // smallest qualifying file for polite downloads, never repeat a clip
    const cands = [];
    for (const h of data.hits || []) {
      if (used.has("pb" + h.id)) continue;
      let pick = null;
      for (const v of Object.values(h.videos || {})) {
        if (v && v.url && v.height >= 960) {
          if (!pick || (v.height > v.width) > (pick.height > pick.width) || v.height < pick.height) pick = v;
        }
      }
      if (pick) cands.push({ id: h.id, v: pick, portrait: pick.height > pick.width ? 1 : 0 });
    }
    cands.sort((a, b) => (b.portrait - a.portrait) || (a.v.height - b.v.height));
    if (!cands.length) throw new Error("no result");
    used.add("pb" + cands[0].id);
    const blob = await (await fetch(cands[0].v.url)).blob();
    return new File([blob], "pixabay-" + cands[0].id + ".mp4", { type: "video/mp4" });
  }

  // ---- YouTube raw clips, CREATIVE COMMONS ONLY (local helper server) ----
  // The helper (server.py) verifies per-video that YouTube reports the
  // Creative Commons Attribution license — both at search and again before
  // download. Raw clips keep their AUDIO, unlike stock footage.
  let ytAvailable = false;
  async function detectHelper() {
    try {
      const r = await fetch("yt/ping");
      const j = r.ok ? await r.json() : null;
      ytAvailable = !!(j && j.ok && j.ytdlp);
    } catch (_) { ytAvailable = false; }
    $("yt-note").textContent = ytAvailable
      ? "✓ YouTube CC clips available (with audio)."
      : "For YouTube clips with audio, run: python3 server.py";
  }

  // In-page cache of search results per query — repeat queries (common across
  // ranks that share topic words) cost nothing; the server also caches each
  // video's yt-dlp metadata, so retried candidates are cheap.
  const ytSearchCache = new Map();
  async function ytSearch(query) {
    if (ytSearchCache.has(query)) return ytSearchCache.get(query);
    const res = await fetch("yt/search?q=" + encodeURIComponent(query) + "&max=8");
    const results = res.ok ? ((await res.json()).results || []) : [];
    ytSearchCache.set(query, results);
    return results;
  }

  // Download a specific SECTION [start, end] of a CC video as an mp4 clip.
  async function ytDownloadSection(hit, start, end) {
    const dl = await fetch("yt/download", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: hit.id, start, end }),
    });
    if (!dl.ok) throw new Error("yt download HTTP " + dl.status);
    const info = await dl.json();
    const blob = await (await fetch(info.url)).blob();
    return {
      file: new File([blob], "yt-" + info.id + "-" + Math.round(start) + ".mp4", { type: "video/mp4" }),
      attribution: {
        source: "youtube", id: info.id, title: info.title, uploader: info.uploader,
        url: info.webpage_url, license: info.license,
      },
    };
  }
  // Download one candidate: a short section taken a bit into the video (skip intro).
  async function ytDownload(hit) {
    const dur = hit.duration || 0;
    const start = dur > 30 ? Math.min(10, Math.round(dur * 0.2)) : 0;
    return ytDownloadSection(hit, start, start + 8);
  }

  // ---- Import a clip from a pasted LINK (Instagram / TikTok / YouTube / …) ----
  // These are NOT license-cleared (copyrighted); labelled as such everywhere.
  const SITE_LABELS = { instagram: "Instagram", tiktok: "TikTok", youtube: "YouTube",
    twitter: "Twitter/X", facebook: "Facebook", vimeo: "Vimeo" };
  function siteLabel(s) {
    s = (s || "").toLowerCase();
    for (const k in SITE_LABELS) if (s.includes(k)) return SITE_LABELS[k];
    return "Link";
  }
  async function mediaImportLink(url, pos, start, end) {
    const res = await fetch("media/import", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, start, end }),
    });
    if (!res.ok) {
      let msg = "import failed (HTTP " + res.status + ")";
      try { msg = (await res.json()).error || msg; } catch (_) {}
      throw new Error(msg);
    }
    const info = await res.json();
    const blob = await (await fetch(info.url)).blob();
    const file = new File([blob], "link-" + Date.now() + ".mp4", { type: "video/mp4" });
    const who = info.uploader ? "@" + info.uploader : (info.title || "clip");
    assignClip(pos, file, "link", who + " · " + siteLabel(info.extractor));
    state.ranks[pos - 1].clip.attribution = {
      source: "link", site: info.extractor, title: info.title,
      uploader: info.uploader, url: info.webpage_url, licenseCleared: false,
    };
    return info;
  }

  // Prompt for (or accept) a link and import it into a SPECIFIC rank. Shared by
  // the per-rank 🔗 button and the panel-level "Add clip from link" button.
  async function importLinkToRank(pos, urlArg) {
    const note = (t) => { const el = $("link-note"); if (el) el.textContent = t; };
    if (!ytAvailable) { note("“Add clip from link” needs the local server. Run: python3 server.py"); return; }
    const url = (urlArg != null ? urlArg : window.prompt(
      "Paste an Instagram / TikTok / YouTube / Twitter-X / Vimeo video link for rank #" + pos + ".\n\n" +
      "⚠ These clips are NOT license-cleared — they belong to their creators. " +
      "You're responsible for having the right to use them.") || "").trim();
    if (!url) return;
    state.ranks[pos - 1].sourcing = "loading"; renderRanksUI();
    note("Importing clip for rank #" + pos + "… (can take 10–30s)");
    try {
      await mediaImportLink(url, pos);
      state.ranks[pos - 1].sourcing = null;
      renderRanksUI(); renderStatic(); scheduleCommit();
      note("Imported to rank #" + pos + ". ⚠ Not license-cleared — using it is your call.");
    } catch (e) {
      state.ranks[pos - 1].sourcing = null; renderRanksUI();
      note("Couldn't import that link: " + e.message +
        (/instagram/i.test(url) ? " — Instagram often blocks downloads unless you're logged in; try another link." : ""));
    }
  }

  // Context-driven YouTube query variants for one rank. Leads with the topic +
  // real-world modifiers ("road rage compilation", "road rage shorts") so the
  // clips actually match the main title, then narrows to this rank's label.
  const YT_MODIFIERS = ["compilation", "moments", "clips", "caught on camera", "shorts"];
  function ytQueryVariants(r, q) {
    const label = stripEmoji(r.label);
    const topic = state.topic || state.niche || stripEmoji(state.accent);
    const base = topic || topicKeywords(state.title);
    // Every variant stays anchored to the TOPIC so results stay on-subject;
    // bare label / single-word searches (which drift off-topic) are dropped.
    const list = [
      [base, label].filter(Boolean).join(" "),          // topic + this rank's label
      ...YT_MODIFIERS.map((m) => (base ? base + " " + m : "")), // topic + real-world modifier
      base && r.query ? base + " " + r.query : "",      // topic + generated clip_desc
      q,                                                // caller's composed query
      base,                                             // topic alone (last resort)
    ];
    return [...new Set(list.map((v) => (v || "").trim()).filter(Boolean))];
  }

  const usedYtIds = () => new Set(state.ranks
    .map((r) => r.clip && r.clip.attribution && r.clip.attribution.id)
    .filter(Boolean));

  // Meaningful lowercased words of a string (drop ranking filler + tiny words).
  const keyTokens = (s) => titleTokens(s).filter((w) => w.length >= 3 && !RANKER_STOPWORDS.has(w));
  // Do two words refer to the same thing? Handles plurals/verb forms via a
  // shared prefix (winners/winning, dunk/dunks, drift/drifting).
  function tokenMatch(a, b) {
    if (a === b) return true;
    if (a.length > 3 && b.length > 3 && (a.includes(b) || b.includes(a))) return true;
    if (a.length >= 5 && b.length >= 5) {
      let k = 0; const m = Math.min(a.length, b.length);
      while (k < m && a[k] === b[k]) k++;
      if (k >= 4) return true; // "winn|ers" ~ "winn|ing"
    }
    return false;
  }
  // How many of `tokens` appear in a title.
  function countHits(title, tokens) {
    if (!tokens.length) return 0;
    const have = keyTokens(title);
    let hits = 0;
    for (const w of tokens) {
      if (have.some((x) => tokenMatch(x, w))) hits++;
    }
    return hits;
  }
  // How many CORE subject words a title must contain to count as "about" the
  // topic: short topics (1-2 words) must match ALL of them; longer topics need
  // a clear majority. This is what keeps clips relatable to what was asked.
  function requiredTopicHits(topicTokens) {
    const n = topicTokens.length;
    if (n === 0) return 0;
    if (n <= 2) return n;                       // "road rage" → both words required
    return Math.max(2, Math.ceil(n * 0.6));     // longer → 60%, at least 2
  }
  // Relevance of a video to the rank's topic (+label). Gate on topicHits; the
  // returned score ranks the survivors (phrase match & label match break ties).
  function scoreCandidate(title, topicTokens, labelTokens, topicStr) {
    const topicHits = countHits(title, topicTokens);
    const labelHits = countHits(title, labelTokens);
    const phrase = topicStr && title.toLowerCase().includes(topicStr.toLowerCase()) ? 1 : 0;
    return { topicHits, score: topicHits * 3 + phrase * 4 + labelHits };
  }
  const relevanceScore = (title, tokens) => countHits(title, tokens); // used by compilation gate

  // YouTube-CC footage for ONE rank. Candidates from all query variants are
  // POOLED and each is required to be ABOUT the topic (core subject words must
  // appear in the title) — only relatable clips are used, best match first.
  // Returns "youtube" or null (no stock here — stock is a separate later pass
  // so we exhaust YouTube first). YouTube is what the user actually wants.
  async function sourceRankYouTube(i, q, say) {
    if (!ytAvailable) return null;
    const pos = i + 1;
    const r = state.ranks[i];
    const topicStr = (state.topic || topicKeywords(state.title) || "").trim();
    const used = usedYtIds();
    const topicTokens = keyTokens(topicStr);
    const labelTokens = keyTokens(stripEmoji(r.label));
    const need = requiredTopicHits(topicTokens);
    const pool = new Map(); // id -> {hit, ...score}
    for (const v of ytQueryVariants(r, q)) {
      say(`Rank #${pos}: YouTube CC “${v}”…`);
      let results = [];
      try { results = await ytSearch(v); } catch (_) {}
      for (const hit of results) {
        if (used.has(hit.id) || pool.has(hit.id)) continue; // no reuse / no dup
        pool.set(hit.id, { hit, ...scoreCandidate(hit.title, topicTokens, labelTokens, topicStr) });
      }
      // stop early once we already hold a fully on-topic candidate
      if ([...pool.values()].some((c) => c.topicHits >= need)) break;
      await sleep(200); // polite spacing between search variants
    }
    // KEEP ONLY clips that are actually about the topic; best match first.
    const ranked = [...pool.values()]
      .filter((c) => c.topicHits >= need)
      .sort((a, b) => b.score - a.score
        || (b.hit.preferred === true) - (a.hit.preferred === true)
        || (a.hit.duration || 9999) - (b.hit.duration || 9999));
    for (const c of ranked) {
      try {
        const { file, attribution } = await ytDownload(c.hit);
        assignClip(pos, file, "youtube", attribution.title); // real clip title
        state.ranks[i].clip.attribution = attribution;
        applyDerivedLabel(pos, attribution.title); // on-video label matches this clip
        return "youtube";
      } catch (_) {}
    }
    return null; // nothing on-topic on YouTube for this rank
  }

  // Stock fallback for ONE rank — used only after YouTube + compilation are
  // exhausted. `usedStock` guarantees a DIFFERENT clip per rank (no repeats).
  async function sourceRankStock(i, q, say, usedStock) {
    const pos = i + 1;
    const stockQ = (state.topic || topicKeywords(state.title) || q || "abstract").trim();
    if (getPexelsKey()) {
      say(`Rank #${pos}: searching Pexels…`);
      try { assignClip(pos, await fetchStockClip(stockQ, usedStock), "pexels", stockQ + " · Pexels"); return "pexels"; } catch (_) {}
    }
    if (getPixabayKey()) {
      say(`Rank #${pos}: searching Pixabay…`);
      try { assignClip(pos, await fetchPixabayClip(stockQ, usedStock), "pixabay", stockQ + " · Pixabay"); return "pixabay"; } catch (_) {}
    }
    return null;
  }

  // COMPILATION MODE: find ONE long on-topic Creative-Commons video and slice
  // different sections of it across the clipless ranks — the "search 'road rage
  // compilation' and take parts of it" idea. Every clip is then on-topic + has
  // audio. Falls through (returns) when no suitable compilation is found.
  async function tryCompilationFill(say) {
    if (!ytAvailable) return 0;
    const base = state.topic || state.niche || stripEmoji(state.accent) || topicKeywords(state.title);
    if (!base) return 0;
    const empty = state.ranks.map((r, i) => i).filter((i) => !state.ranks[i].clip);
    if (empty.length < 1) return 0;
    for (const query of [base + " compilation", base + " highlights", base + " best moments", base + " montage", base]) {
      say(`Searching a compilation for “${query}”…`);
      let results = [];
      try { results = await ytSearch(query); } catch (_) {}
      // only on-topic compilations: title must contain a topic word, and be
      // long enough to slice distinct sections from.
      const wantTokens = keyTokens(base);
      const pool = results
        .filter((v) => (v.duration || 0) >= 45 && relevanceScore(v.title, wantTokens) >= 1)
        .sort((a, b) => (b.duration || 0) - (a.duration || 0)).slice(0, 3);
      const comp = pool[Math.floor(Math.random() * pool.length)] || null;
      if (!comp) continue;
      const seg = 8;
      const usable = Math.max(seg, (comp.duration || MAX_TOTAL_SECONDS) - seg - 4);
      let filled = 0;
      for (let k = 0; k < empty.length; k++) {
        const idx = empty[k], pos = idx + 1;
        // evenly spaced windows across the video (skip first ~4s), small jitter
        const spread = (usable - 4) * (k / empty.length);
        const start = Math.min(usable, Math.max(0, 4 + Math.round(spread + Math.random() * 3)));
        state.ranks[idx].sourcing = "loading"; renderRanksUI();
        say(`Rank #${pos}: clip ${k + 1} from “${comp.title}”…`);
        try {
          const { file, attribution } = await ytDownloadSection(comp, start, start + seg);
          assignClip(pos, file, "youtube", (comp.title || "clip") + " · part " + (k + 1));
          state.ranks[idx].clip.attribution = attribution;
          state.ranks[idx].sourcing = null;
          filled++;
        } catch (_) { state.ranks[idx].sourcing = null; }
        renderRanksUI();
        await sleep(300);
      }
      if (filled) return filled;
    }
    return 0;
  }

  // Fill every clipless rank, YouTube-FIRST (that's what the user wants; stock
  // is a last resort). Three ordered passes:
  //   1. Per-rank distinct YouTube video (own real title → own on-video label).
  //   2. Compilation: slice ONE long on-topic YouTube video across the ranks
  //      still empty — keeps everything on-topic and from YouTube.
  //   3. Stock (Pexels/Pixabay), ONLY for whatever is still empty, and always
  //      a DIFFERENT clip per rank (usedStock) so nothing repeats.
  async function sourceAllClips(statusEl) {
    const say = (t) => { if (statusEl) statusEl.textContent = t; };
    if (!ytAvailable && !getPexelsKey() && !getPixabayKey()) {
      say("No footage sources — ranks without clips use generated backgrounds. Run python3 server.py or add a key in ⚙️ Settings.");
      return;
    }
    const buildQ = (r) => (state.topic
      ? [state.topic, stripEmoji(r.label)]
      : [r.query || stripEmoji(r.label), state.niche || stripEmoji(state.accent)]
    ).filter(Boolean).join(" ") || topicKeywords(state.title) || "abstract";

    // PASS 1 — per-rank distinct YouTube
    if (ytAvailable) {
      for (let i = 0; i < state.numRanks; i++) {
        const r = state.ranks[i];
        if (r.clip) continue;
        r.sourcing = "loading"; renderRanksUI();
        await sourceRankYouTube(i, buildQ(r), say);
        r.sourcing = null; // ranks still empty are picked up by later passes
        renderRanksUI(); renderStatic();
        await sleep(300);
      }
    }
    // PASS 2 — compilation-slice one on-topic YouTube video across the rest
    if (ytAvailable && state.ranks.some((r) => !r.clip)) {
      say("Looking for one on-topic compilation to slice across the rest…");
      try { await tryCompilationFill(say); } catch (_) {}
      renderRanksUI(); renderStatic();
    }
    // PASS 3 — stock, only for what's still empty, never repeating a clip
    if (getPexelsKey() || getPixabayKey()) {
      const usedStock = new Set();
      for (let i = 0; i < state.numRanks; i++) {
        const r = state.ranks[i];
        if (r.clip) continue;
        r.sourcing = "loading"; renderRanksUI();
        const src = await sourceRankStock(i, buildQ(r), say, usedStock);
        r.sourcing = src ? null : "failed";
        renderRanksUI(); renderStatic();
        await sleep(300);
      }
    }
    state.ranks.forEach((r) => { if (!r.clip && r.sourcing === "loading") r.sourcing = "failed"; });
    renderRanksUI(); renderStatic();
    updateIdlePoster();
    const filledCount = state.ranks.filter((r) => r.clip).length;
    const ytCount = state.ranks.filter((r) => r.clip && r.clip.source === "youtube").length;
    const empty = state.numRanks - filledCount;
    say(`Footage ready: ${filledCount} clip(s) (${ytCount} from YouTube)` +
        (empty ? `, ${empty} rank(s) use generated backgrounds.` : "."));
  }

  // One click -> complete watchable video: concept + footage.
  async function generateFullVideo() {
    const status = $("autogen-status");
    $("btn-fullgen").disabled = true;
    try {
      // re-press = a fresh, different video: drop AI-sourced clips (keep the
      // user's own uploads) and clear the search cache so new footage is pulled
      state.ranks.forEach((r) => { if (r.clip && r.clip.source && r.clip.source !== "user") r.clip = null; });
      ytSearchCache.clear();
      const ok = await autoGenerate();
      document.body.classList.remove("setup-mode");
      renderRanksUI(); renderOrderUI(); updateIdlePoster(); renderStatic();
      if (!ok) return;
      if (ytAvailable || getPexelsKey() || getPixabayKey()) {
        await sourceAllClips(status);
        status.textContent += " Your video is ready — press ▶ Play, then Export.";
      } else {
        status.textContent = "Video ready with generated backgrounds. Press ▶ Play, then Export. (For real footage: run python3 server.py or add a key in ⚙️ Settings.)";
      }
    } finally {
      $("btn-fullgen").disabled = false;
    }
  }

  // -------------------------------------------------------------- wire up
  let staticTimer = 0;
  function scheduleStatic() {
    clearTimeout(staticTimer);
    staticTimer = setTimeout(renderStatic, 60);
  }

  // -------------------------------------------------------------- undo/redo
  // History of document snapshots. Clips are kept by reference (cheap, and
  // their object URLs stay valid on undo). Rapid edits — typing, slider
  // drags — coalesce via a debounce, so one gesture is one undo step.
  const history = [];
  let histIndex = -1, restoring = false, commitTimer = 0;

  function snapshot() {
    return {
      title: state.title, titleFromUser: state.titleFromUser, accent: state.accent, niche: state.niche, topic: state.topic,
      numRanks: state.numRanks, titleColor: state.titleColor, accentColor: state.accentColor,
      titleScale: state.titleScale, sideScale: state.sideScale, groupMove: state.groupMove,
      ranks: state.ranks.map((r) => ({
        label: r.label, labelFromUser: r.labelFromUser, color: r.color, labelColor: r.labelColor, sizeScale: r.sizeScale,
        clip: r.clip, sourcing: r.sourcing, query: r.query, duration: r.duration,
        trimStart: r.clip ? r.clip.trimStart : null, trimEnd: r.clip ? r.clip.trimEnd : null,
        crop: r.clip && r.clip.crop ? { ...r.clip.crop } : null,
        boxes: (r.boxes || []).map((b) => ({ ...b })),
      })),
      order: state.order.slice(),
      layout: JSON.parse(JSON.stringify(state.layout)),
      locks: JSON.parse(JSON.stringify(state.locks || { title:false, ranks:{} })),
      freeTexts: (state.freeTexts || []).map((t) => ({ ...t })),
      aiOptions: { ...(state.aiOptions || { wordLimit:0, emojiMode:"auto" }) },
      watermark: { ...(state.watermark || {}) },
      hook: { ...(state.hook || {}) },
      outro: { ...(state.outro || {}) },
      features: { ...(state.features || {}) },
      pacingMode: state.pacingMode || "balanced",
      editRank: state.editRank,
    };
  }
  // Serializable projection for equality (clip → its url) so identical states
  // don't pile up redundant history entries.
  function snapKey(s) {
    return JSON.stringify({
      ...s, ranks: s.ranks.map((r) => ({ ...r, clip: r.clip ? r.clip.url : null })),
    });
  }
  function commitHistory() {
    clearTimeout(commitTimer); commitTimer = 0;
    const snap = snapshot();
    if (histIndex >= 0 && snapKey(history[histIndex]) === snapKey(snap)) return;
    history.splice(histIndex + 1);           // drop any redo tail
    history.push(snap);
    if (history.length > 60) history.shift();
    histIndex = history.length - 1;
    updateUndoButtons();
  }
  function scheduleCommit() {
    if (restoring) return;
    clearTimeout(commitTimer);
    commitTimer = setTimeout(commitHistory, 350);
  }
  function applySnapshot(s) {
    restoring = true;
    state.title = s.title; state.titleFromUser = s.titleFromUser; state.accent = s.accent; state.niche = s.niche; state.topic = s.topic;
    state.numRanks = s.numRanks; state.titleColor = s.titleColor; state.accentColor = s.accentColor;
    state.titleScale = s.titleScale; state.sideScale = s.sideScale; state.groupMove = s.groupMove;
    state.ranks = s.ranks.map((r) => {
      // clips are kept by reference across snapshots, so restore the trim
      // primitives back onto the shared clip object to make trims undoable.
      if (r.clip) {
        if (r.trimStart != null) r.clip.trimStart = r.trimStart;
        if (r.trimEnd != null) r.clip.trimEnd = r.trimEnd;
        r.clip.crop = r.crop ? { ...r.crop } : (r.clip.crop || { mode:"fill", zoom:1, x:0, y:0 });
      }
      return { label: r.label, labelFromUser: r.labelFromUser, color: r.color, labelColor: r.labelColor, sizeScale: r.sizeScale,
        clip: r.clip, sourcing: r.sourcing, query: r.query, duration: r.duration,
        boxes: (r.boxes || []).map((b) => ({ ...b })) };
    });
    state.order = s.order.slice();
    state.layout = JSON.parse(JSON.stringify(s.layout));
    state.locks = s.locks ? JSON.parse(JSON.stringify(s.locks)) : { title:false, ranks:{} };
    state.freeTexts = (s.freeTexts || []).map((t) => ({ ...t }));
    state.aiOptions = Object.assign({ wordLimit:0, emojiMode:"auto" }, s.aiOptions || {});
    state.watermark = Object.assign({ enabled:false, text:"@yourhandle", x:W-180, y:H-120, color:"#ffffff", size:42, opacity:0.35, fontFamily:"system", locked:false }, s.watermark || {});
    state.hook = Object.assign({ enabled:false, text:"" }, s.hook || {});
    state.outro = Object.assign({ enabled:false, text:"" }, s.outro || {});
    state.features = Object.assign({ healthCheck:true, autosave:true }, s.features || {});
    state.pacingMode = s.pacingMode || "balanced";
    state.editRank = s.editRank || 1;
    syncInputsFromState();
    updateEditBadge();
    renderRanksUI(); renderOrderUI(); updateIdlePoster(); renderStatic();
    restoring = false;
  }
  function undo() {
    if (commitTimer) commitHistory();        // capture the in-flight edit first
    if (histIndex <= 0) return;
    histIndex--; applySnapshot(history[histIndex]); updateUndoButtons();
  }
  function redo() {
    if (histIndex >= history.length - 1) return;
    histIndex++; applySnapshot(history[histIndex]); updateUndoButtons();
  }
  function updateUndoButtons() {
    const u = $("btn-undo"), r = $("btn-redo");
    if (u) u.disabled = histIndex <= 0;
    if (r) r.disabled = histIndex >= history.length - 1;
  }
  // Push all state fields back into the DOM controls after an undo/redo.
  function syncInputsFromState() {
    $("inp-title").value = state.title;
    $("inp-accent").value = state.accent;
    $("inp-numranks").value = String(state.numRanks);
    $("inp-title-size").value = Math.round(state.titleScale * 100);
    $("val-title-size").textContent = Math.round(state.titleScale * 100) + "%";
    $("inp-side-size").value = Math.round(state.sideScale * 100);
    $("val-side-size").textContent = Math.round(state.sideScale * 100) + "%";
    const gm = $("inp-group-move"); if (gm) gm.checked = state.groupMove;
    rebuildTitleColors();
  }
  function rebuildTitleColors() {
    const host = $("title-colors");
    host.innerHTML = "";
    host.appendChild(swatchRow("title", () => state.titleColor, (hex) => {
      state.titleColor = hex; scheduleCommit(); scheduleStatic();
    }));
    host.appendChild(swatchRow("accent", () => state.accentColor, (hex) => {
      state.accentColor = hex; scheduleCommit(); scheduleStatic();
    }));
  }

  $("inp-title").addEventListener("input", (e) => {
    state.title = e.target.value;
    // a typed title is user-owned: kept on Generate; an AI title is replaced
    state.titleFromUser = state.title.trim().length > 0;
    // typing the title makes it the user's topic (drives stock search)
    state.topic = state.title.trim() ? topicKeywords(state.title) : "";
    scheduleCommit(); scheduleStatic();
  });
  $("inp-accent").addEventListener("input", (e) => { state.accent = e.target.value; scheduleCommit(); scheduleStatic(); });
  $("inp-word-limit").addEventListener("change", (e) => { state.aiOptions.wordLimit = Number(e.target.value) || 0; scheduleCommit(); });
  $("inp-emoji-mode").addEventListener("change", (e) => { state.aiOptions.emojiMode = e.target.value || "auto"; scheduleCommit(); });
  $("inp-watermark-enabled").addEventListener("change", (e) => { state.watermark.enabled = e.target.checked; commitHistory(); renderStatic(); updateSelectionControls(); });
  $("inp-watermark-text").addEventListener("input", (e) => { state.watermark.text = e.target.value; scheduleCommit(); scheduleStatic(); });
  $("inp-watermark-color").addEventListener("input", (e) => { state.watermark.color = e.target.value; scheduleCommit(); scheduleStatic(); });
  $("inp-watermark-size").addEventListener("input", (e) => { state.watermark.size = clamp(Number(e.target.value)||42,18,140); scheduleCommit(); scheduleStatic(); });
  $("inp-watermark-opacity").addEventListener("input", (e) => { state.watermark.opacity = clamp((Number(e.target.value)||35)/100,0.05,1); scheduleCommit(); scheduleStatic(); });
  $("inp-watermark-font").addEventListener("change", (e) => { state.watermark.fontFamily = e.target.value || "system"; scheduleCommit(); scheduleStatic(); });
  $("inp-watermark-lock").addEventListener("change", (e) => { state.watermark.locked = e.target.checked; commitHistory(); renderStatic(); updateSelectionControls(); });
  $("inp-hook-enabled").addEventListener("change", (e) => { state.hook.enabled = e.target.checked; commitHistory(); renderStatic(); });
  $("inp-hook-text").addEventListener("input", (e) => { state.hook.text = e.target.value; scheduleCommit(); renderStatic(); });
  $("inp-outro-enabled").addEventListener("change", (e) => { state.outro.enabled = e.target.checked; commitHistory(); renderStatic(); });
  $("inp-outro-text").addEventListener("input", (e) => { state.outro.text = e.target.value; scheduleCommit(); renderStatic(); });
  $("inp-pacing-mode").addEventListener("change", (e) => { state.pacingMode = e.target.value || "balanced"; scheduleCommit(); });
  $("inp-health-enabled").addEventListener("change", (e) => { state.features.healthCheck = e.target.checked; scheduleCommit(); });
  $("inp-autosave-enabled").addEventListener("change", (e) => { state.features.autosave = e.target.checked; scheduleCommit(); if (state.features.autosave) scheduleAutosave(); });
  $("inp-numranks").addEventListener("change", (e) => {
    setNumRanks(parseInt(e.target.value, 10));
    renderRanksUI(); renderOrderUI(); scheduleCommit(); scheduleStatic();
  });
  $("inp-title-size").addEventListener("input", (e) => {
    state.titleScale = e.target.value / 100;
    $("val-title-size").textContent = e.target.value + "%";
    scheduleCommit(); scheduleStatic();
  });
  $("inp-side-size").addEventListener("input", (e) => {
    state.sideScale = e.target.value / 100;
    $("val-side-size").textContent = e.target.value + "%";
    scheduleCommit(); scheduleStatic();
  });
  $("btn-create").addEventListener("click", () => {
    document.body.classList.remove("setup-mode");
    renderRanksUI(); renderOrderUI(); renderStatic();
  });
  $("btn-autogen").addEventListener("click", async () => {
    const ok = await autoGenerate();
    if (ok) {
      document.body.classList.remove("setup-mode"); // show the generated concept
      renderRanksUI(); renderOrderUI(); renderStatic();
    }
  });
  $("btn-fullgen").addEventListener("click", generateFullVideo);
  $("btn-find-clips").addEventListener("click", () => sourceAllClips($("autogen-status")));
  $("btn-link-clip").addEventListener("click", () => {
    if (!ytAvailable) { $("link-note").textContent = "“Add clip from link” needs the local server. Run: python3 server.py"; return; }
    // target the next empty rank, else ask which to replace
    let pos = state.ranks.findIndex((r) => !r.clip) + 1;
    if (pos === 0) {
      const ans = window.prompt("All ranks already have a clip. Which rank number (1–" + state.numRanks + ") should this replace?", "1");
      pos = parseInt(ans, 10);
      if (!(pos >= 1 && pos <= state.numRanks)) return;
    }
    importLinkToRank(pos);
  });
  $("inp-pexels-key").value = getPexelsKey();
  $("inp-pexels-key").addEventListener("input", (e) => localStorage.setItem(PEXELS_KEY_LS, e.target.value.trim()));
  $("inp-pixabay-key").value = getPixabayKey();
  $("inp-pixabay-key").addEventListener("input", (e) => localStorage.setItem(PIXABAY_KEY_LS, e.target.value.trim()));
  $("btn-pixkey-reveal").addEventListener("click", () => {
    const inp = $("inp-pixabay-key");
    inp.type = inp.type === "password" ? "text" : "password";
    $("btn-pixkey-reveal").textContent = inp.type === "password" ? "👁" : "🙈";
  });
  $("btn-reset-layout").addEventListener("click", () => {
    state.layout = { title: null, ranks: {}, ranksGroup: null };
    scheduleCommit();
    renderStatic(); updateSelectionControls();
  });
  $("btn-reset-order").addEventListener("click", () => { resetOrder(); renderOrderUI(); updateIdlePoster(); scheduleCommit(); });

  // group-move toggle: when on, dragging any rank moves the whole list at once
  const grp = $("inp-group-move");
  if (grp) grp.addEventListener("change", (e) => { state.groupMove = e.target.checked; scheduleCommit(); });

  // undo / redo — Ctrl/Cmd+Z (Shift or Ctrl/Cmd+Y to redo) + toolbar buttons
  $("btn-undo").addEventListener("click", undo);
  $("btn-redo").addEventListener("click", redo);
  document.addEventListener("keydown", (e) => {
    if (!(e.metaKey || e.ctrlKey)) return;
    const k = e.key.toLowerCase();
    if (k !== "z" && k !== "y") return;
    // let a focused text field keep its own native undo
    const tag = (document.activeElement && document.activeElement.tagName) || "";
    if (tag === "INPUT" || tag === "TEXTAREA") return;
    e.preventDefault();
    if (k === "y" || (k === "z" && e.shiftKey)) redo();
    else undo();
  });

  // ---- canvas text selection + precision dragging ----
  function canvasPoint(e) {
    const rect = canvas.getBoundingClientRect();
    return { x: (e.clientX - rect.left) * (W / rect.width), y: (e.clientY - rect.top) * (H / rect.height) };
  }
  const isTextId = (id) => id === "title" || id === "watermark" || id === "ranksGroup" || id.startsWith("rank") || id.startsWith("free:");
  const freeTextById = (id) => state.freeTexts.find((t) => "free:" + t.id === id) || null;
  function isLocked(id) {
    if (id === "title") return !!(state.locks && state.locks.title);
    if (id === "watermark") return !!(state.watermark && state.watermark.locked);
    if (id.startsWith("rank")) return !!(state.locks && state.locks.ranks && state.locks.ranks[Number(id.slice(4))]);
    if (id.startsWith("free:")) { const t = freeTextById(id); return !!(t && t.locked); }
    return false;
  }
  function hitTest(p) {
    const pri = (b) => (b.id.startsWith("free:") ? 0 : b.id.indexOf("rank") === 0 ? 1 : b.id === "title" ? 2 : 3);
    const ordered = [...hitBoxes].sort((a, b) => pri(a) - pri(b));
    return ordered.find((b) => {
      const pad = isTextId(b.id) ? 28 : 0; // generous text hit area
      return p.x >= b.x - pad && p.x <= b.x + b.w + pad && p.y >= b.y - pad && p.y <= b.y + b.h + pad;
    }) || null;
  }
  function getOffset(id) {
    if (id === "title") return state.layout.title || { dx: 0, dy: 0 };
    if (id === "ranksGroup") return state.layout.ranksGroup || { dx: 0, dy: 0 };
    if (id.startsWith("rank")) return state.layout.ranks[Number(id.slice(4))] || { dx: 0, dy: 0 };
    return { dx: 0, dy: 0 };
  }
  function setOffset(id, off) {
    if (id === "title") state.layout.title = off;
    else if (id === "ranksGroup") state.layout.ranksGroup = off;
    else if (id.startsWith("rank")) state.layout.ranks[Number(id.slice(4))] = off;
  }
  function onBoxGrip(p, hb) {
    return p.x >= hb.x + hb.w - BOX_GRIP && p.x <= hb.x + hb.w && p.y >= hb.y + hb.h - BOX_GRIP && p.y <= hb.y + hb.h;
  }
  function updateSelectionControls() {
    const id = selectedTextId, hb = id ? boxForDrag(id) : null;
    const xInp = $("inp-pos-x"), yInp = $("inp-pos-y"), reset = $("btn-reset-selected"), selLock = $("inp-selected-lock");
    const free = id && id.startsWith("free:") ? freeTextById(id) : null;
    const ft = $("inp-free-text"), fc = $("inp-free-color"), fs = $("inp-free-size"), fo = $("inp-free-opacity"), ff = $("inp-free-font"), fl = $("inp-free-lock"), del = $("btn-delete-text");
    const has = !!(id && hb && isTextId(id) && id !== "ranksGroup");
    if (xInp) { xInp.disabled = !has; xInp.value = has ? Math.round(hb.x) : ""; }
    if (yInp) { yInp.disabled = !has; yInp.value = has ? Math.round(hb.y) : ""; }
    if (reset) reset.disabled = !has;
    if (selLock) { selLock.disabled = !has; selLock.checked = has ? isLocked(id) : false; }
    for (const el of [ft, fc, fs, fo, ff, fl, del]) if (el) el.disabled = !free;
    if (free) {
      ft.value = free.text; fc.value = toHex(free.color); fs.value = Math.round(free.size); if (fo) fo.value = Math.round((free.opacity || 1) * 100); if (ff) ff.value = free.fontFamily || "system"; fl.checked = !!free.locked;
    } else if (ft) { ft.value = ""; if (fl) fl.checked = false; if (fo) fo.value = 100; if (ff) ff.value = "system"; }
    if (id === "watermark") {
      $("inp-watermark-enabled").checked = !!state.watermark.enabled;
      $("inp-watermark-text").value = state.watermark.text || "";
      $("inp-watermark-color").value = toHex(state.watermark.color || "#ffffff");
      $("inp-watermark-size").value = Math.round(state.watermark.size || 42);
      $("inp-watermark-opacity").value = Math.round((state.watermark.opacity || 0.35) * 100);
      $("inp-watermark-font").value = state.watermark.fontFamily || "system";
      $("inp-watermark-lock").checked = !!state.watermark.locked;
    }
  }
  function selectText(id) {
    selectedTextId = id && isTextId(id) && id !== "ranksGroup" ? id : null;
    activeGuides = [];
    renderStatic();
    updateSelectionControls();
  }
  function moveTextId(id, dx, dy) {
    if (!id || isLocked(id)) return;
    if (id === "watermark") {
      state.watermark.x = clamp((state.watermark.x || (W - 180)) + dx, 0, W);
      state.watermark.y = clamp((state.watermark.y || (H - 120)) + dy, 0, H);
    } else if (id.startsWith("free:")) {
      const t = freeTextById(id); if (!t) return;
      t.x = clamp(t.x + dx, 0, W); t.y = clamp(t.y + dy, 0, H);
    } else {
      const o = getOffset(id); setOffset(id, { dx: o.dx + dx, dy: o.dy + dy });
    }
  }
  function setSelectedAbsolute(axis, value) {
    if (!selectedTextId || isLocked(selectedTextId)) return;
    renderStatic();
    const hb = boxForDrag(selectedTextId); if (!hb) return;
    const v = Number(value); if (!Number.isFinite(v)) return;
    moveTextId(selectedTextId, axis === "x" ? v - hb.x : 0, axis === "y" ? v - hb.y : 0);
    scheduleCommit(); renderStatic(); updateSelectionControls();
  }
  function snappedDelta(id, box, dx, dy) {
    const guides = [], threshold = 14;
    let sx = dx, sy = dy;
    const px = box.x + dx, py = box.y + dy, cx = px + box.w / 2, cy = py + box.h / 2;
    const xTargets = [
      { kind: "center", delta: W / 2 - cx, value: W / 2 },
      { kind: "safe-left", delta: SAFE.x1 - px, value: SAFE.x1 },
      { kind: "safe-right", delta: SAFE.x2 - (px + box.w), value: SAFE.x2 },
    ];
    if (id.startsWith("rank")) {
      for (const other of hitBoxes.filter((b) => b.id.startsWith("rank") && b.id !== id)) xTargets.push({ kind: "rank", delta: other.x - px, value: other.x });
    }
    const bestX = xTargets.sort((a,b) => Math.abs(a.delta)-Math.abs(b.delta))[0];
    if (bestX && Math.abs(bestX.delta) <= threshold) { sx += bestX.delta; guides.push({ axis:"x", value:bestX.value }); }
    const yTargets = [{ delta: H/2 - cy, value:H/2 }, { delta: SAFE.y1 - py, value:SAFE.y1 }, { delta: SAFE.y2 - (py+box.h), value:SAFE.y2 }];
    const bestY = yTargets.sort((a,b) => Math.abs(a.delta)-Math.abs(b.delta))[0];
    if (bestY && Math.abs(bestY.delta) <= threshold) { sy += bestY.delta; guides.push({ axis:"y", value:bestY.value }); }
    activeGuides = guides;
    return { dx:sx, dy:sy };
  }

  canvas.addEventListener("pointerdown", (e) => {
    if (engine.recording) return;
    const p = canvasPoint(e), hb = hitTest(p);
    if (!hb) { if (!engine.running) selectText(null); return; }
    e.preventDefault();
    if (hb.id.indexOf("box") === 0) {
      if (engine.running) return;
      const bx = rankBoxes(editPos()).find((b) => b.id === hb.id); if (!bx) return;
      const resize = onBoxGrip(p, hb);
      drag = { id: hb.id, box: bx, mode: resize ? "resize" : "move", startX:p.x, startY:p.y, ox:bx.x, oy:bx.y, ow:bx.w, oh:bx.h };
      try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
      canvas.style.cursor = resize ? "nwse-resize" : "grabbing"; renderStatic(); return;
    }
    selectText(hb.id);
    if (isLocked(hb.id)) { canvas.style.cursor = "not-allowed"; return; }
    const id = (state.groupMove && hb.id.indexOf("rank") === 0) ? "ranksGroup" : hb.id;
    const o = getOffset(id), initialBox = boxForDrag(id) || hb;
    const free = id.startsWith("free:") ? freeTextById(id) : null;
    const wm = id === "watermark" ? state.watermark : null;
    drag = { id, startX:p.x, startY:p.y, baseDx:o.dx, baseDy:o.dy, baseX:(free && free.x) || (wm && wm.x), baseY:(free && free.y) || (wm && wm.y), initialBox:{...initialBox} };
    activeGuides = [];
    try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
    canvas.style.cursor = "grabbing"; renderStatic();
  });

  canvas.addEventListener("pointermove", (e) => {
    const p = canvasPoint(e);
    if (drag && drag.box) {
      const dx = p.x-drag.startX, dy=p.y-drag.startY;
      if (drag.mode === "resize") { drag.box.w=Math.max(24,drag.ow+dx); drag.box.h=Math.max(24,drag.oh+dy); }
      else { drag.box.x=drag.ox+dx; drag.box.y=drag.oy+dy; }
      renderStatic();
    } else if (drag) {
      let d = snappedDelta(drag.id, drag.initialBox, p.x-drag.startX, p.y-drag.startY);
      if (drag.id === "watermark") {
        state.watermark.x = clamp((drag.baseX || state.watermark.x) + d.dx, 0, W);
        state.watermark.y = clamp((drag.baseY || state.watermark.y) + d.dy, 0, H);
      } else if (drag.id.startsWith("free:")) {
        const t=freeTextById(drag.id); if (t) { t.x=clamp(drag.baseX+d.dx,0,W); t.y=clamp(drag.baseY+d.dy,0,H); }
      } else setOffset(drag.id,{dx:drag.baseDx+d.dx,dy:drag.baseDy+d.dy});
      renderStatic(); updateSelectionControls();
    } else if (!engine.running) {
      const hb=hitTest(p);
      canvas.style.cursor = hb ? (hb.id.indexOf("box")===0 && onBoxGrip(p,hb) ? "nwse-resize" : isLocked(hb.id) ? "not-allowed" : "grab") : "default";
    }
  });
  const endDrag = (e) => {
    if (!drag) return;
    drag=null; activeGuides=[]; canvas.style.cursor="default";
    try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}
    commitHistory(); renderStatic(); updateSelectionControls();
  };
  canvas.addEventListener("pointerup",endDrag); canvas.addEventListener("pointercancel",endDrag);

  // free text overlay controls
  $("btn-add-text").addEventListener("click", () => {
    const t={id:"txt"+(++freeTextSeq),text:"Your text",x:W/2,y:H/2,color:"#ffffff",size:64,opacity:1,fontFamily:"system",locked:false};
    state.freeTexts.push(t); selectedTextId="free:"+t.id; commitHistory(); renderStatic(); updateSelectionControls();
    $("inp-free-text").focus(); $("inp-free-text").select();
  });
  $("btn-delete-text").addEventListener("click", () => {
    if (!selectedTextId || !selectedTextId.startsWith("free:")) return;
    const t=freeTextById(selectedTextId); if (!t) return;
    state.freeTexts=state.freeTexts.filter((x)=>x!==t); selectedTextId=null; commitHistory(); renderStatic(); updateSelectionControls();
  });
  $("inp-free-text").addEventListener("input", (e) => { const t=selectedTextId&&freeTextById(selectedTextId); if(t){t.text=e.target.value;scheduleCommit();scheduleStatic();} });
  $("inp-free-color").addEventListener("input", (e) => { const t=selectedTextId&&freeTextById(selectedTextId); if(t){t.color=e.target.value;scheduleCommit();scheduleStatic();} });
  $("inp-free-size").addEventListener("input", (e) => { const t=selectedTextId&&freeTextById(selectedTextId); if(t){t.size=clamp(Number(e.target.value)||64,20,220);scheduleCommit();scheduleStatic();} });
  $("inp-free-opacity").addEventListener("input", (e) => { const t=selectedTextId&&freeTextById(selectedTextId); if(t){t.opacity=clamp((Number(e.target.value)||100)/100,0.1,1);scheduleCommit();scheduleStatic();} });
  $("inp-free-font").addEventListener("change", (e) => { const t=selectedTextId&&freeTextById(selectedTextId); if(t){t.fontFamily=e.target.value||"system";scheduleCommit();scheduleStatic();} });
  $("inp-free-lock").addEventListener("change", (e) => { const t=selectedTextId&&freeTextById(selectedTextId); if(t){t.locked=e.target.checked;commitHistory();renderStatic();} });
  $("inp-pos-x").addEventListener("change", (e) => setSelectedAbsolute("x", e.target.value));
  $("inp-pos-y").addEventListener("change", (e) => setSelectedAbsolute("y", e.target.value));

  $("inp-selected-lock").addEventListener("change", (e) => {
    const id=selectedTextId; if(!id) return;
    if(id==="title") state.locks.title=e.target.checked;
    else if(id==="watermark") state.watermark.locked=e.target.checked;
    else if(id.startsWith("rank")) state.locks.ranks[Number(id.slice(4))]=e.target.checked;
    else if(id.startsWith("free:")){const t=freeTextById(id);if(t)t.locked=e.target.checked;}
    commitHistory();renderStatic();updateSelectionControls();
  });
  $("btn-reset-selected").addEventListener("click", () => {
    const id=selectedTextId; if(!id) return;
    if(id==="title") state.layout.title=null;
    else if(id==="watermark") { state.watermark.x=W-180; state.watermark.y=H-120; }
    else if(id.startsWith("rank")) delete state.layout.ranks[Number(id.slice(4))];
    else if(id.startsWith("free:")){const t=freeTextById(id);if(t){t.x=W/2;t.y=H/2;}}
    commitHistory();renderStatic();updateSelectionControls();
  });

  function alignRanks(mode) {
    renderStatic();
    for (let pos=1; pos<=state.numRanks; pos++) {
      const id="rank"+pos, hb=hitBoxes.find((b)=>b.id===id); if(!hb) continue;
      let target=SAFE.x1;
      if(mode==="center") target=(SAFE.x1+SAFE.x2-hb.w)/2;
      else if(mode==="right") target=SAFE.x2-hb.w;
      const o=getOffset(id); state.layout.ranks[pos]={dx:o.dx+(target-hb.x),dy:o.dy};
    }
    commitHistory();renderStatic();updateSelectionControls();
  }
  $("btn-align-left").addEventListener("click",()=>alignRanks("left"));
  $("btn-align-center").addEventListener("click",()=>alignRanks("center"));
  $("btn-align-right").addEventListener("click",()=>alignRanks("right"));
  $("btn-distribute-ranks").addEventListener("click",()=>{
    renderStatic(); const boxes=[];
    for(let pos=1;pos<=state.numRanks;pos++){const hb=hitBoxes.find((b)=>b.id==="rank"+pos);if(hb)boxes.push({pos,hb});}
    if(boxes.length>1){
      const maxH=Math.max(...boxes.map((it)=>it.hb.h));
      const first=LIST_BOX.y1, last=LIST_BOX.y2-maxH;
      boxes.forEach((it,i)=>{const target=first+(last-first)*(i/(boxes.length-1));const o=getOffset("rank"+it.pos);state.layout.ranks[it.pos]={dx:o.dx,dy:o.dy+(target-it.hb.y)};});
      commitHistory();renderStatic();updateSelectionControls();
    }
  });


  function runHealthCheck() {
    const issues = [];
    if (!state.title.trim()) issues.push("Add a title before exporting.");
    const filled = state.ranks.filter((r) => r.label.trim()).length;
    if (filled < state.numRanks) issues.push(`Only ${filled}/${state.numRanks} ranks have labels.`);
    const total = totalDuration();
    if (total > MAX_TOTAL_SECONDS + 0.05) issues.push(`Video is ${(total - MAX_TOTAL_SECONDS).toFixed(1)}s over the 120s cap.`);
    if (!clipsAssigned()) issues.push("No clips added yet — empty ranks will use generated backgrounds.");
    if (clipsAssigned() && !hasMusic()) issues.push("No background music added.");
    state.ranks.forEach((r, i) => {
      if (!r.label.trim()) issues.push(`Rank #${i + 1} is missing a label.`);
      if (r.clip && r.clip.srcDuration && clipLen(r) < 0.35) issues.push(`Rank #${i + 1} trim is extremely short.`);
    });
    const box = $("health-report");
    if (box) box.innerHTML = issues.length ? issues.map((x) => `• ${x}`).join("<br>") : "✅ Looks good. No obvious problems found.";
    return issues;
  }
  function applySmartPacing() {
    const mode = state.pacingMode || "balanced";
    const target = mode === "fast" ? 2.8 : mode === "cinematic" ? 4.8 : 3.6;
    state.ranks.forEach((r) => {
      if (r.clip && r.clip.srcDuration) {
        const dur = r.clip.srcDuration;
        const want = Math.min(Math.max(1.2, target), dur);
        const curStart = r.clip.trimStart != null ? r.clip.trimStart : Math.max(0, (dur - want) / 2);
        r.clip.trimStart = clamp(curStart, 0, Math.max(0, dur - want));
        r.clip.trimEnd = r.clip.trimStart + want;
      } else if (!r.clip) {
        r.duration = target;
      }
    });
    fitTo60();
    renderRanksUI(); scheduleCommit(); renderStatic();
  }
  function applyViralPreset() {
    state.titleScale = 1.1; state.sideScale = 1.08;
    state.accentColor = "#ff3b3b";
    if (!state.hook.text.trim()) state.hook.text = makeHookText();
    if (!state.outro.text.trim()) state.outro.text = makeOutroText();
    state.hook.enabled = true; state.outro.enabled = true;
    if (!state.watermark.text.trim() || state.watermark.text === "@yourhandle") state.watermark.text = "@yourpage";
    renderRanksUI(); syncInputsFromState(); commitHistory(); renderStatic();
  }
  function downloadThumbnail() {
    renderStatic();
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = (state.title.replace(/[^\w]+/g, "-").toLowerCase() || "thumbnail") + "-thumbnail.png";
    a.click();
  }
  function scheduleAutosave() {
    if (autosaveMeta.muting || !(state.features && state.features.autosave)) return;
    clearTimeout(autosaveMeta.timer);
    autosaveMeta.timer = setTimeout(() => {
      try {
        const draft = { savedAt: Date.now(), title: state.title, accent: state.accent, numRanks: state.numRanks, data: snapshotState() };
        localStorage.setItem(AUTOSAVE_LS, JSON.stringify(draft));
      } catch (_) {}
    }, 700);
  }
  function tryRestoreAutosave() {
    if (autosaveMeta.restored) return;
    autosaveMeta.restored = true;
    try {
      const raw = localStorage.getItem(AUTOSAVE_LS); if (!raw) return;
      const draft = JSON.parse(raw); if (!draft || !draft.data) return;
      if (!confirm("Restore the last autosaved draft? (Clips already loaded in the current tab stay available.)")) return;
      applySnapshot(draft.data);
      document.body.classList.remove("setup-mode");
    } catch (_) {}
  }

  document.addEventListener("keydown",(e)=>{
    if(!selectedTextId || engine.running || isLocked(selectedTextId)) return;
    const tag=(document.activeElement&&document.activeElement.tagName)||""; if(tag==="INPUT"||tag==="TEXTAREA"||tag==="SELECT") return;
    const step=e.shiftKey?10:2; let dx=0,dy=0;
    if(e.key==="ArrowLeft")dx=-step; else if(e.key==="ArrowRight")dx=step; else if(e.key==="ArrowUp")dy=-step; else if(e.key==="ArrowDown")dy=step; else return;
    e.preventDefault(); moveTextId(selectedTextId,dx,dy); scheduleCommit();renderStatic();updateSelectionControls();
  });

  $("btn-play").addEventListener("click", playPreview);
  $("btn-run-health").addEventListener("click", () => runHealthCheck());
  $("btn-hook-generate").addEventListener("click", () => { state.hook.text = makeHookText(); state.hook.enabled = true; syncInputsFromState(); commitHistory(); renderStatic(); });
  $("btn-outro-generate").addEventListener("click", () => { state.outro.text = makeOutroText(); state.outro.enabled = true; syncInputsFromState(); commitHistory(); renderStatic(); });
  $("btn-apply-pacing").addEventListener("click", () => applySmartPacing());
  $("btn-viral-preset").addEventListener("click", () => applyViralPreset());
  $("btn-make-thumbnail").addEventListener("click", () => downloadThumbnail());
  $("btn-stop").addEventListener("click", stopPlayback);
  $("btn-export").addEventListener("click", async () => {
    if (state.features && state.features.healthCheck) {
      const issues = runHealthCheck();
      if (issues.some((x) => /missing|over the 120s cap/i.test(x)) && !confirm("Health check found some issues. Export anyway?")) return;
    }
    exportVideo();
  });
  $("export-quality").addEventListener("change", (e) => {
    const q=e.target.value, p=EXPORT_PROFILES[q]||EXPORT_PROFILES["1080p"];
    $("btn-export").textContent=`⬇ Export ${q} (${p.width}×${p.height})`;
  });
  { const fit = $("btn-fit60"); if (fit) fit.addEventListener("click", fitTo60); }
  window.addEventListener("beforeunload", scheduleAutosave);

  // ---- attributions (CC-BY requires crediting in the posted description) ----
  function attributionText() {
    const lines = [];
    const seen = new Set();
    for (const r of state.ranks) {
      const a = r.clip && r.clip.attribution;
      if (a && a.source === "youtube" && !seen.has(a.url)) {
        seen.add(a.url);
        lines.push(`"${a.title}" by ${a.uploader} — ${a.url} (${a.license})`);
      }
    }
    if (state.ranks.some((r) => r.clip && r.clip.source === "pexels")) lines.push("Stock footage from Pexels (https://www.pexels.com)");
    if (state.ranks.some((r) => r.clip && r.clip.source === "pixabay")) lines.push("Stock footage from Pixabay (https://pixabay.com)");
    // Imported-link clips: list them AND warn — they are not license-cleared.
    const linkSeen = new Set();
    const linkLines = [];
    for (const r of state.ranks) {
      const a = r.clip && r.clip.attribution;
      if (a && a.source === "link" && !linkSeen.has(a.url)) {
        linkSeen.add(a.url);
        linkLines.push(`${siteLabel(a.site)}: ${a.uploader ? "@" + a.uploader + " — " : ""}${a.url}`);
      }
    }
    let out = lines.length ? "Credits:\n" + lines.map((l) => "• " + l).join("\n") : "";
    if (linkLines.length) {
      out += (out ? "\n\n" : "") +
        "⚠ NOT LICENSE-CLEARED — the clips below are copyrighted by their\n" +
        "creators. You are responsible for getting permission before posting:\n" +
        linkLines.map((l) => "• " + l).join("\n");
    }
    return out;
  }
  function updateAttributionsUI() {
    const txt = attributionText();
    $("attributions").classList.toggle("hidden", !txt);
    $("attribution-list").textContent = txt;
  }
  $("btn-copy-attr").addEventListener("click", async () => {
    const txt = attributionText();
    if (!txt) return;
    try { await navigator.clipboard.writeText(txt); $("btn-copy-attr").textContent = "✓ Copied — paste into your video description"; }
    catch (_) { window.prompt("Copy the credits below:", txt); }
    setTimeout(() => { $("btn-copy-attr").textContent = "📋 Copy attributions"; }, 2500);
  });

  // ---- audio panel ----
  // "Every rank silent" heuristic: stock clips are usually mute and
  // procedural ranks always are — only user uploads can carry sound.
  function updateMusicHint() {
    const allSilent = state.ranks.every((r) => !r.clip || r.clip.source === "pexels");
    $("music-hint").classList.toggle("hidden", hasMusic() || !allSilent);
  }
  function setMusic(file) {
    if (hasMusic()) URL.revokeObjectURL(musicEl.src);
    if (file) {
      musicEl.src = URL.createObjectURL(file);
      audio.musicName = file.name;
    } else {
      musicEl.removeAttribute("src");
      audio.musicName = "";
    }
    $("music-name").textContent = audio.musicName;
    $("btn-music-remove").classList.toggle("hidden", !file);
    $("btn-music").textContent = file ? "🎵 Replace music" : "🎵 Add music";
    updateMusicHint();
  }
  $("btn-music").addEventListener("click", () => {
    const inp = document.createElement("input");
    inp.type = "file";
    inp.accept = "audio/*,.mp3,.m4a,.wav";
    inp.onchange = () => inp.files[0] && setMusic(inp.files[0]);
    inp.click();
  });
  $("btn-music-remove").addEventListener("click", () => setMusic(null));
  $("inp-music-vol").addEventListener("input", (e) => {
    audio.musicVol = e.target.value / 100;
    $("val-music-vol").textContent = e.target.value + "%";
    if (musicGain) musicGain.gain.setTargetAtTime(audio.musicVol, audioCtx.currentTime, 0.05);
  });
  $("inp-sfx").addEventListener("change", (e) => { audio.sfxOn = e.target.checked; });
  $("inp-sfx-vol").addEventListener("input", (e) => {
    audio.sfxVol = e.target.value / 100;
    $("val-sfx-vol").textContent = e.target.value + "%";
    if (sfxGain) sfxGain.gain.setTargetAtTime(audio.sfxVol, audioCtx.currentTime, 0.05);
  });

  // ---- settings modal (Pexels key lives here, masked by default) ----
  const openSettings = (show) => $("settings-modal").classList.toggle("hidden", !show);
  $("btn-settings").addEventListener("click", () => openSettings(true));
  $("btn-settings-close").addEventListener("click", () => openSettings(false));

  // save / open project
  $("btn-save-project").addEventListener("click", exportProject);
  $("btn-open-project").addEventListener("click", () => {
    const inp = document.createElement("input");
    inp.type = "file"; inp.accept = ".rankproj,application/json,.json";
    inp.onchange = () => inp.files[0] && importProject(inp.files[0]);
    inp.click();
  });

  // collapsible accordion panels: clicking a panel header toggles its body
  document.querySelectorAll(".panel-head").forEach((h) => {
    h.addEventListener("click", () => h.parentElement.classList.toggle("collapsed"));
  });
  $("settings-modal").addEventListener("click", (e) => { if (e.target === $("settings-modal")) openSettings(false); });
  $("btn-key-reveal").addEventListener("click", () => {
    const inp = $("inp-pexels-key");
    inp.type = inp.type === "password" ? "text" : "password";
    $("btn-key-reveal").textContent = inp.type === "password" ? "👁" : "🙈";
  });

  // bulk dropzone: assign files to ranks that lack clips, in rank order
  const dz = $("dropzone");
  dz.addEventListener("dragover", (e) => { e.preventDefault(); dz.classList.add("dragover"); });
  dz.addEventListener("dragleave", () => dz.classList.remove("dragover"));
  dz.addEventListener("drop", (e) => {
    e.preventDefault(); dz.classList.remove("dragover");
    const files = [...e.dataTransfer.files].filter((f) => f.type.startsWith("video"));
    let pos = 1;
    for (const f of files) {
      while (pos <= state.numRanks && state.ranks[pos - 1].clip) pos++;
      if (pos > state.numRanks) break;
      assignClip(pos, f);
      pos++;
    }
  });

  // title + accent color pickers (Text style panel)
  rebuildTitleColors();

  // ------------------------------------------------------------------ init
  // Sync any browser-restored field values into state so the fields never
  // display a title the canvas doesn't draw (QA MD-7).
  state.title = $("inp-title").value.trim();
  state.titleFromUser = !!state.title;
  state.accent = $("inp-accent").value.trim();
  state.topic = state.title ? topicKeywords(state.title) : "";

  setNumRanks(6);
  syncInputsFromState();
  tryRestoreAutosave();
  renderRanksUI();
  renderOrderUI();
  updateEditBadge();
  renderStatic();
  commitHistory(); // seed the undo history with the initial state
  detectHelper(); // async; enables YouTube-CC sourcing when server.py serves us
})();
