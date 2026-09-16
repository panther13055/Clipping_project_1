from pathlib import Path

APP = Path('app.js')
HTML = Path('index.html')
CSS = Path('style.css')
s = APP.read_text(encoding='utf-8')

if 'PREMIUM_RANK_PALETTES' in s:
    raise SystemExit('premium rank styles already present')

def rep(old, new, label):
    global s
    if old not in s:
        raise SystemExit(f'missing patch target: {label}')
    s = s.replace(old, new, 1)

# State.
rep(
'''    titleStyle: "viral",\n    titleWordColors: {},''',
'''    titleStyle: "viral",\n    titleWordColors: {},\n    rankNumberStyle: "standard",\n    rankPremiumPalette: "reference",\n    rankPremiumStrength: 100,''',
'state premium rank fields')

# Premium number renderer: white fill + coloured inner outline + black outer
# outline, matching the supplied reference look while keeping readability over
# any footage.
insert_before = '''  function drawRanks(c, revealed) {'''
if insert_before not in s:
    raise SystemExit('missing patch target: drawRanks')
premium_helpers = r'''  const PREMIUM_RANK_PALETTES = {
    reference: ["#4f5dff", "#e6495f", "#dfe5ff", "#f5c518", "#22c55e", "#a855f7", "#06b6d4", "#ff8c00", "#ff2e93", "#ffffff"],
    neon:     ["#00e5ff", "#ff2e93", "#b6ff00", "#8b5cf6", "#ff8c00", "#00e676", "#2979ff", "#ffee32", "#d946ef", "#ffffff"],
    medals:   ["#f5c518", "#cbd5e1", "#d97706", "#f5c518", "#cbd5e1", "#d97706", "#f5c518", "#cbd5e1", "#d97706", "#ffffff"],
    candy:    ["#ff4fa3", "#7c3aed", "#22d3ee", "#f59e0b", "#10b981", "#fb7185", "#6366f1", "#84cc16", "#d946ef", "#ffffff"],
    fireice:  ["#3b82f6", "#ef4444", "#e0f2fe", "#f97316", "#60a5fa", "#dc2626", "#67e8f9", "#fb923c", "#2563eb", "#ffffff"],
  };
  function premiumRankColor(pos) {
    const key = state.rankPremiumPalette || "reference";
    const pal = PREMIUM_RANK_PALETTES[key] || PREMIUM_RANK_PALETTES.reference;
    return pal[(Math.max(1, pos) - 1) % pal.length];
  }
  function drawPremiumRankNumber(c, text, x, y, font, size, pos, fallbackFill) {
    if ((state.rankNumberStyle || "standard") !== "premium") {
      strokedText(c, text, x, y, font, toHex(fallbackFill), Math.max(4, size * 0.16), "left");
      return;
    }
    const accent = premiumRankColor(pos);
    const strength = clamp(Number(state.rankPremiumStrength) || 100, 60, 170) / 100;
    const outer = Math.max(7, size * 0.22 * strength);
    const inner = Math.max(4, size * 0.115 * strength);
    c.save();
    c.font = font; c.textAlign = "left"; c.textBaseline = "alphabetic";
    c.lineJoin = "round"; c.miterLimit = 2;
    c.shadowColor = "rgba(0,0,0,.45)"; c.shadowBlur = Math.max(2, size * 0.035); c.shadowOffsetY = Math.max(1, size * 0.02);
    // Black outside border.
    c.strokeStyle = "#050505"; c.lineWidth = outer; c.strokeText(text, x, y);
    // Coloured premium ring.
    c.shadowColor = "transparent";
    c.strokeStyle = accent; c.lineWidth = inner; c.strokeText(text, x, y);
    // Crisp white centre, as in the user's reference image.
    c.fillStyle = "#ffffff"; c.fillText(text, x, y);
    c.restore();
  }

'''
s = s.replace(insert_before, premium_helpers + insert_before, 1)

# Use premium renderer only for rank numbers; labels keep their existing colours.
rep(
'''      strokedText(c, pos + ".", x, y, font, toHex(r.color), strokeW, "left");''',
'''      drawPremiumRankNumber(c, pos + ".", x, y, font, rs, pos, r.color);''',
'draw premium rank number')

# Undo/redo snapshot.
rep(
'''      titleStyle: state.titleStyle, titleWordColors: { ...(state.titleWordColors || {}) },''',
'''      titleStyle: state.titleStyle, titleWordColors: { ...(state.titleWordColors || {}) },\n      rankNumberStyle: state.rankNumberStyle || "standard", rankPremiumPalette: state.rankPremiumPalette || "reference", rankPremiumStrength: state.rankPremiumStrength || 100,''',
'snapshot premium rank fields')
rep(
'''    state.titleStyle = s.titleStyle || "viral"; state.titleWordColors = { ...(s.titleWordColors || {}) };''',
'''    state.titleStyle = s.titleStyle || "viral"; state.titleWordColors = { ...(s.titleWordColors || {}) };\n    state.rankNumberStyle = s.rankNumberStyle || "standard"; state.rankPremiumPalette = s.rankPremiumPalette || "reference"; state.rankPremiumStrength = Number(s.rankPremiumStrength) || 100;''',
'apply snapshot premium fields')

# Sync controls after undo/load.
rep(
'''    const ts = $("inp-title-style"); if (ts) ts.value = state.titleStyle || "viral";''',
'''    const ts = $("inp-title-style"); if (ts) ts.value = state.titleStyle || "viral";\n    const pre = $("inp-premium-ranks"); if (pre) pre.checked = (state.rankNumberStyle || "standard") === "premium";\n    const prp = $("inp-premium-rank-palette"); if (prp) prp.value = state.rankPremiumPalette || "reference";\n    const prs = $("inp-premium-rank-strength"); if (prs) { prs.value = String(state.rankPremiumStrength || 100); const rd=$("val-premium-rank-strength"); if(rd) rd.textContent = String(state.rankPremiumStrength || 100) + "%"; }\n    syncPremiumRankPreview();''',
'sync premium controls')

# Project save/load persistence.
rep(
'''          titleStyle: state.titleStyle, titleWordColors: { ...(state.titleWordColors || {}) },''',
'''          titleStyle: state.titleStyle, titleWordColors: { ...(state.titleWordColors || {}) },\n          rankNumberStyle: state.rankNumberStyle || "standard", rankPremiumPalette: state.rankPremiumPalette || "reference", rankPremiumStrength: state.rankPremiumStrength || 100,''',
'project save premium fields')
rep(
'''      state.titleStyle = s.titleStyle || "viral"; state.titleWordColors = { ...(s.titleWordColors || {}) };''',
'''      state.titleStyle = s.titleStyle || "viral"; state.titleWordColors = { ...(s.titleWordColors || {}) };\n      state.rankNumberStyle = s.rankNumberStyle || "standard"; state.rankPremiumPalette = s.rankPremiumPalette || "reference"; state.rankPremiumStrength = Number(s.rankPremiumStrength) || 100;''',
'project load premium fields')

# UI preview helpers + listeners near title-style controls.
needle = '''  $("inp-title-style").addEventListener("change", (e) => { state.titleStyle = e.target.value || "viral"; scheduleCommit(); scheduleStatic(); });'''
if needle not in s:
    raise SystemExit('missing patch target: title style listener')
listeners = r'''  function syncPremiumRankPreview() {
    const host = $("premium-rank-preview");
    if (!host) return;
    const pal = PREMIUM_RANK_PALETTES[state.rankPremiumPalette || "reference"] || PREMIUM_RANK_PALETTES.reference;
    [...host.querySelectorAll(".premium-rank-sample")].forEach((el, i) => el.style.setProperty("--premium-accent", pal[i % pal.length]));
    host.classList.toggle("is-off", (state.rankNumberStyle || "standard") !== "premium");
  }
'''
s = s.replace(needle, listeners + needle + r'''
  const premiumRanks = $("inp-premium-ranks"); if (premiumRanks) premiumRanks.addEventListener("change", (e) => { state.rankNumberStyle = e.target.checked ? "premium" : "standard"; syncPremiumRankPreview(); commitHistory(); renderStatic(); });
  const premiumPalette = $("inp-premium-rank-palette"); if (premiumPalette) premiumPalette.addEventListener("change", (e) => { state.rankPremiumPalette = e.target.value || "reference"; syncPremiumRankPreview(); commitHistory(); renderStatic(); });
  const premiumStrength = $("inp-premium-rank-strength"); if (premiumStrength) premiumStrength.addEventListener("input", (e) => { state.rankPremiumStrength = clamp(Number(e.target.value) || 100, 60, 170); const rd=$("val-premium-rank-strength"); if(rd) rd.textContent = Math.round(state.rankPremiumStrength) + "%"; scheduleCommit(); scheduleStatic(); });
''', 1)

APP.write_text(s, encoding='utf-8')

# Add a separate Premium card under title styling.
h = HTML.read_text(encoding='utf-8')
if 'id="inp-premium-ranks"' not in h:
    anchor = '''        <label class="field slider-field">\n          <span>Title size <b id="val-title-size">100%</b></span>'''
    if anchor not in h:
        raise SystemExit('missing HTML premium insertion target')
    card = r'''        <div class="tool-card premium-rank-card">
          <div class="tool-card-title">💎 Premium rank number colors</div>
          <label class="check-field"><input type="checkbox" id="inp-premium-ranks"> Enable premium double-outline numbers</label>
          <p class="hint" style="margin:7px 0 8px">Reference style = white centre + colored ring + black outer edge, like the 1 / 2 / 3 style you shared.</p>
          <div class="row compact-row">
            <label class="mini-field">Premium palette
              <select id="inp-premium-rank-palette">
                <option value="reference" selected>Reference · Blue / Red / Ice</option>
                <option value="neon">Neon mix</option>
                <option value="medals">Gold / Silver / Bronze</option>
                <option value="candy">Candy pop</option>
                <option value="fireice">Fire & Ice</option>
              </select>
            </label>
            <label class="mini-field" style="flex:1 1 220px">Outline strength <b id="val-premium-rank-strength">100%</b>
              <input type="range" id="inp-premium-rank-strength" min="60" max="170" value="100">
            </label>
          </div>
          <div class="premium-rank-preview" id="premium-rank-preview" aria-label="Premium rank style preview">
            <span class="premium-rank-sample">1.</span><span class="premium-rank-sample">2.</span><span class="premium-rank-sample">3.</span><span class="premium-rank-sample">4.</span><span class="premium-rank-sample">5.</span>
          </div>
        </div>

'''
    h = h.replace(anchor, card + anchor, 1)
    HTML.write_text(h, encoding='utf-8')

css = CSS.read_text(encoding='utf-8')
if '/* ---- premium rank numbers ---- */' not in css:
    css += r'''

/* ---- premium rank numbers ---- */
.premium-rank-card { border-color: rgba(245,197,24,.28); background: linear-gradient(180deg, rgba(245,197,24,.035), rgba(91,214,255,.018)); }
.premium-rank-preview { display:flex; align-items:center; gap:14px; margin-top:10px; padding:10px 12px; border:1px solid var(--panel-edge); border-radius:10px; background:#03060c; overflow:auto; }
.premium-rank-preview.is-off { opacity:.48; }
.premium-rank-sample { --premium-accent:#4f5dff; color:#fff; font:900 30px/1 -apple-system,"Segoe UI",Arial,sans-serif; letter-spacing:-1px; -webkit-text-stroke:3px var(--premium-accent); paint-order:stroke fill; filter:drop-shadow(0 0 1px #000) drop-shadow(1px 2px 0 #000) drop-shadow(-1px -1px 0 #000); min-width:34px; }
'''
    CSS.write_text(css, encoding='utf-8')

print('premium rank number styles added')
