from pathlib import Path

APP=Path('app.js'); HTML=Path('index.html'); CSS=Path('style.css')
s=APP.read_text(encoding='utf-8')
h=HTML.read_text(encoding='utf-8')
css=CSS.read_text(encoding='utf-8')

if 'premium-custom-rank-colors' in h and 'rankPremiumCustomColors' in s:
    raise SystemExit('premium custom colors already present')

def need(old,label):
    if old not in s:
        raise SystemExit('missing app target: '+label)

def rep(old,new,label,count=1):
    global s
    need(old,label)
    s=s.replace(old,new,count)

# State defaults.
rep('''    rankPremiumPalette: "reference",\n    rankPremiumStrength: 100,''','''    rankPremiumPalette: "reference",\n    rankPremiumStrength: 100,\n    rankPremiumCustomColors: ["#4f5dff","#e6495f","#dfe5ff","#f5c518","#22c55e","#a855f7","#06b6d4","#ff8c00","#ff2e93","#ffffff"],\n    rankPremiumCenterColor: "#ffffff",\n    rankPremiumOuterColor: "#050505",''','state custom premium')

# Custom mode uses independently selected color per rank.
rep('''  function premiumRankColor(pos) {\n    const key = state.rankPremiumPalette || "reference";\n    const pal = PREMIUM_RANK_PALETTES[key] || PREMIUM_RANK_PALETTES.reference;\n    return pal[(Math.max(1, pos) - 1) % pal.length];\n  }''','''  function premiumRankColor(pos) {\n    const key = state.rankPremiumPalette || "reference";\n    const idx = Math.max(1, pos) - 1;\n    if (key === "custom") {\n      const custom = state.rankPremiumCustomColors || [];\n      return custom[idx] || PREMIUM_RANK_PALETTES.reference[idx % PREMIUM_RANK_PALETTES.reference.length];\n    }\n    const pal = PREMIUM_RANK_PALETTES[key] || PREMIUM_RANK_PALETTES.reference;\n    return pal[idx % pal.length];\n  }''','premium color resolver')
rep('''    c.strokeStyle = "#050505"; c.lineWidth = outer; c.strokeText(text, x, y);''','''    c.strokeStyle = state.rankPremiumOuterColor || "#050505"; c.lineWidth = outer; c.strokeText(text, x, y);''','outer color')
rep('''    c.fillStyle = "#ffffff"; c.fillText(text, x, y);''','''    c.fillStyle = state.rankPremiumCenterColor || "#ffffff"; c.fillText(text, x, y);''','center color')

# Persist custom premium settings anywhere the existing premium state is serialized.
old='''rankNumberStyle: state.rankNumberStyle || "standard", rankPremiumPalette: state.rankPremiumPalette || "reference", rankPremiumStrength: state.rankPremiumStrength || 100,'''
new='''rankNumberStyle: state.rankNumberStyle || "standard", rankPremiumPalette: state.rankPremiumPalette || "reference", rankPremiumStrength: state.rankPremiumStrength || 100, rankPremiumCustomColors: (state.rankPremiumCustomColors || []).slice(), rankPremiumCenterColor: state.rankPremiumCenterColor || "#ffffff", rankPremiumOuterColor: state.rankPremiumOuterColor || "#050505",'''
if old not in s: raise SystemExit('missing serialization target')
s=s.replace(old,new)
old2='''state.rankNumberStyle = s.rankNumberStyle || "standard"; state.rankPremiumPalette = s.rankPremiumPalette || "reference"; state.rankPremiumStrength = Number(s.rankPremiumStrength) || 100;'''
new2='''state.rankNumberStyle = s.rankNumberStyle || "standard"; state.rankPremiumPalette = s.rankPremiumPalette || "reference"; state.rankPremiumStrength = Number(s.rankPremiumStrength) || 100; state.rankPremiumCustomColors = (s.rankPremiumCustomColors || ["#4f5dff","#e6495f","#dfe5ff","#f5c518","#22c55e","#a855f7","#06b6d4","#ff8c00","#ff2e93","#ffffff"]).slice(); state.rankPremiumCenterColor = s.rankPremiumCenterColor || "#ffffff"; state.rankPremiumOuterColor = s.rankPremiumOuterColor || "#050505";'''
if old2 not in s: raise SystemExit('missing restore target')
s=s.replace(old2,new2)

# Replace preview helper with dynamic rank preview + custom editor.
old_preview='''  function syncPremiumRankPreview() {\n    const host = $("premium-rank-preview");\n    if (!host) return;\n    const pal = PREMIUM_RANK_PALETTES[state.rankPremiumPalette || "reference"] || PREMIUM_RANK_PALETTES.reference;\n    [...host.querySelectorAll(".premium-rank-sample")].forEach((el, i) => el.style.setProperty("--premium-accent", pal[i % pal.length]));\n    host.classList.toggle("is-off", (state.rankNumberStyle || "standard") !== "premium");\n  }'''
new_preview=r'''  let premiumCustomEditPos = 1;
  const PREMIUM_CUSTOM_SWATCHES = [
    "#4f5dff","#315cff","#2563eb","#38bdf8","#22d3ee","#06b6d4","#00e5ff","#67e8f9",
    "#e6495f","#ef4444","#dc2626","#be123c","#ff2e93","#ff4fa3","#ec4899","#d946ef",
    "#7c3aed","#8b5cf6","#a855f7","#c026d3","#39ff14","#22c55e","#10b981","#84cc16",
    "#f5c518","#ffee32","#ffd166","#f59e0b","#ff8c00","#f97316","#fb923c","#d97706",
    "#ffffff","#e2e8f0","#cbd5e1","#94a3b8","#64748b","#334155","#111827","#000000"
  ];
  function ensurePremiumCustomColors() {
    const base = PREMIUM_RANK_PALETTES.reference;
    const arr = (state.rankPremiumCustomColors || []).slice();
    for (let i=0;i<Math.max(10,state.numRanks);i++) if (!arr[i]) arr[i]=base[i % base.length];
    state.rankPremiumCustomColors = arr;
    premiumCustomEditPos = clamp(premiumCustomEditPos,1,state.numRanks || 1);
    return arr;
  }
  function rebuildPremiumCustomEditor() {
    const host = $("premium-custom-rank-colors");
    const box = $("premium-custom-editor");
    if (!host || !box) return;
    const customMode = (state.rankPremiumPalette || "reference") === "custom";
    box.classList.toggle("hidden", !customMode);
    const colors = ensurePremiumCustomColors();
    host.innerHTML = "";

    const targets = document.createElement("div"); targets.className = "premium-rank-targets";
    for (let pos=1; pos<=state.numRanks; pos++) {
      const b=document.createElement("button"); b.type="button"; b.className="premium-rank-target" + (pos===premiumCustomEditPos ? " active" : "");
      b.textContent=pos+"."; b.style.setProperty("--rank-ring", colors[pos-1]);
      b.title=`Edit premium color for rank ${pos}`;
      b.addEventListener("click",()=>{ premiumCustomEditPos=pos; rebuildPremiumCustomEditor(); });
      targets.appendChild(b);
    }
    host.appendChild(targets);

    const title=document.createElement("div"); title.className="premium-custom-caption"; title.innerHTML=`Choose ring color for <b>Rank ${premiumCustomEditPos}</b>`; host.appendChild(title);
    const palette=document.createElement("div"); palette.className="premium-custom-swatches";
    PREMIUM_CUSTOM_SWATCHES.forEach((hex)=>{
      const b=document.createElement("button"); b.type="button"; b.className="premium-custom-swatch"; b.style.background=hex; b.title=hex;
      if (String(colors[premiumCustomEditPos-1]).toLowerCase()===hex.toLowerCase()) b.classList.add("selected");
      b.addEventListener("click",()=>{ colors[premiumCustomEditPos-1]=hex; state.rankPremiumCustomColors=colors; syncPremiumRankPreview(); rebuildPremiumCustomEditor(); scheduleCommit(); scheduleStatic(); });
      palette.appendChild(b);
    });
    host.appendChild(palette);

    const row=document.createElement("div"); row.className="row compact-row premium-custom-actions";
    const pickLabel=document.createElement("label"); pickLabel.className="mini-field premium-native-picker"; pickLabel.append("Any custom color ");
    const pick=document.createElement("input"); pick.type="color"; pick.value=colors[premiumCustomEditPos-1] || "#4f5dff";
    pick.addEventListener("input",()=>{ colors[premiumCustomEditPos-1]=pick.value; state.rankPremiumCustomColors=colors; syncPremiumRankPreview(); scheduleCommit(); scheduleStatic(); });
    pickLabel.appendChild(pick); row.appendChild(pickLabel);
    const same=document.createElement("button"); same.type="button"; same.className="btn btn-ghost btn-small"; same.textContent="Apply this color to all";
    same.addEventListener("click",()=>{ const c=colors[premiumCustomEditPos-1]; for(let i=0;i<state.numRanks;i++) colors[i]=c; state.rankPremiumCustomColors=colors; rebuildPremiumCustomEditor(); syncPremiumRankPreview(); commitHistory(); renderStatic(); }); row.appendChild(same);
    const rainbow=document.createElement("button"); rainbow.type="button"; rainbow.className="btn btn-ghost btn-small"; rainbow.textContent="🌈 Rainbow ranks";
    rainbow.addEventListener("click",()=>{ const r=["#4f5dff","#e6495f","#22d3ee","#f5c518","#22c55e","#a855f7","#ff8c00","#ff2e93","#06b6d4","#ffffff"]; for(let i=0;i<state.numRanks;i++) colors[i]=r[i%r.length]; state.rankPremiumCustomColors=colors; rebuildPremiumCustomEditor(); syncPremiumRankPreview(); commitHistory(); renderStatic(); }); row.appendChild(rainbow);
    host.appendChild(row);
  }
  function syncPremiumRankPreview() {
    const host = $("premium-rank-preview");
    if (!host) return;
    host.innerHTML="";
    const max=Math.min(10,state.numRanks || 5);
    for(let pos=1;pos<=max;pos++) {
      const el=document.createElement("span"); el.className="premium-rank-sample"; el.textContent=pos+".";
      el.style.setProperty("--premium-accent", premiumRankColor(pos));
      el.style.setProperty("--premium-center", state.rankPremiumCenterColor || "#ffffff");
      el.style.setProperty("--premium-outer", state.rankPremiumOuterColor || "#050505");
      host.appendChild(el);
    }
    host.classList.toggle("is-off", (state.rankNumberStyle || "standard") !== "premium");
    const cc=$("inp-premium-center-color"); if(cc) cc.value=state.rankPremiumCenterColor || "#ffffff";
    const oc=$("inp-premium-outer-color"); if(oc) oc.value=state.rankPremiumOuterColor || "#050505";
    rebuildPremiumCustomEditor();
  }'''
if old_preview not in s: raise SystemExit('missing preview helper target')
s=s.replace(old_preview,new_preview,1)

# Palette listener additionally toggles custom editor.
old_listener='''  const premiumPalette = $("inp-premium-rank-palette"); if (premiumPalette) premiumPalette.addEventListener("change", (e) => { state.rankPremiumPalette = e.target.value || "reference"; syncPremiumRankPreview(); commitHistory(); renderStatic(); });'''
new_listener='''  const premiumPalette = $("inp-premium-rank-palette"); if (premiumPalette) premiumPalette.addEventListener("change", (e) => { state.rankPremiumPalette = e.target.value || "reference"; ensurePremiumCustomColors(); syncPremiumRankPreview(); commitHistory(); renderStatic(); });\n  const premiumCenter = $("inp-premium-center-color"); if (premiumCenter) premiumCenter.addEventListener("input", (e) => { state.rankPremiumCenterColor=e.target.value || "#ffffff"; syncPremiumRankPreview(); scheduleCommit(); scheduleStatic(); });\n  const premiumOuter = $("inp-premium-outer-color"); if (premiumOuter) premiumOuter.addEventListener("input", (e) => { state.rankPremiumOuterColor=e.target.value || "#050505"; syncPremiumRankPreview(); scheduleCommit(); scheduleStatic(); });'''
rep(old_listener,new_listener,'premium palette listener')

# Number of ranks can change; refresh target buttons.
old_num='''    setNumRanks(parseInt(e.target.value, 10));\n    renderRanksUI(); renderOrderUI(); scheduleCommit(); scheduleStatic();'''
new_num='''    setNumRanks(parseInt(e.target.value, 10));\n    ensurePremiumCustomColors(); rebuildPremiumCustomEditor(); syncPremiumRankPreview();\n    renderRanksUI(); renderOrderUI(); scheduleCommit(); scheduleStatic();'''
rep(old_num,new_num,'rank count refresh')

# Sync custom color inputs on undo/load.
old_sync='''    const prs = $("inp-premium-rank-strength"); if (prs) { prs.value = String(state.rankPremiumStrength || 100); const rd=$("val-premium-rank-strength"); if(rd) rd.textContent = String(state.rankPremiumStrength || 100) + "%"; }\n    syncPremiumRankPreview();'''
new_sync='''    const prs = $("inp-premium-rank-strength"); if (prs) { prs.value = String(state.rankPremiumStrength || 100); const rd=$("val-premium-rank-strength"); if(rd) rd.textContent = String(state.rankPremiumStrength || 100) + "%"; }\n    const pcc=$("inp-premium-center-color"); if(pcc) pcc.value=state.rankPremiumCenterColor || "#ffffff";\n    const poc=$("inp-premium-outer-color"); if(poc) poc.value=state.rankPremiumOuterColor || "#050505";\n    syncPremiumRankPreview();'''
rep(old_sync,new_sync,'sync custom premium controls')

APP.write_text(s,encoding='utf-8')

# HTML: custom option + editor + center/outer colors.
if '<option value="custom">Custom · choose each rank</option>' not in h:
    h=h.replace('''                <option value="fireice">Fire & Ice</option>''','''                <option value="fireice">Fire & Ice</option>\n                <option value="custom">Custom · choose each rank</option>''',1)

anchor='''          <div class="premium-rank-preview" id="premium-rank-preview" aria-label="Premium rank style preview">\n            <span class="premium-rank-sample">1.</span><span class="premium-rank-sample">2.</span><span class="premium-rank-sample">3.</span><span class="premium-rank-sample">4.</span><span class="premium-rank-sample">5.</span>\n          </div>'''
if anchor not in h: raise SystemExit('missing premium preview html target')
extra='''          <div class="premium-rank-preview" id="premium-rank-preview" aria-label="Premium rank style preview"></div>\n          <div class="row compact-row" style="margin-top:10px">\n            <label class="mini-field">Centre fill <input type="color" id="inp-premium-center-color" value="#ffffff"></label>\n            <label class="mini-field">Outer edge <input type="color" id="inp-premium-outer-color" value="#050505"></label>\n          </div>\n          <div class="premium-custom-editor hidden" id="premium-custom-editor">\n            <div class="premium-custom-heading">🎨 Custom premium colors</div>\n            <p class="hint" style="margin:4px 0 8px">Pick any rank, then choose from lots of premium colors or use the custom color picker.</p>\n            <div id="premium-custom-rank-colors"></div>\n          </div>'''
h=h.replace(anchor,extra,1)
HTML.write_text(h,encoding='utf-8')

if '/* ---- premium custom per-rank colors ---- */' not in css:
    css += r'''

/* ---- premium custom per-rank colors ---- */
.premium-custom-editor { margin-top:10px; padding:11px; border:1px solid rgba(91,214,255,.23); border-radius:10px; background:rgba(3,7,14,.45); }
.premium-custom-heading { font-size:12px; font-weight:900; letter-spacing:.45px; text-transform:uppercase; color:#8be9ff; }
.premium-rank-targets { display:flex; gap:7px; flex-wrap:wrap; margin-bottom:10px; }
.premium-rank-target { --rank-ring:#4f5dff; min-width:42px; height:38px; padding:0 8px; border-radius:9px; cursor:pointer; background:#05070d; color:#fff; font:900 18px/1 -apple-system,"Segoe UI",Arial,sans-serif; border:2px solid var(--rank-ring); box-shadow:0 0 0 1px #000,0 0 10px color-mix(in srgb,var(--rank-ring) 25%,transparent); }
.premium-rank-target.active { outline:2px solid #fff; outline-offset:2px; transform:translateY(-1px); }
.premium-custom-caption { color:var(--muted); font-size:12px; margin-bottom:7px; }
.premium-custom-swatches { display:flex; flex-wrap:wrap; gap:7px; }
.premium-custom-swatch { width:25px; height:25px; border-radius:50%; border:2px solid rgba(255,255,255,.16); cursor:pointer; box-shadow:0 1px 4px rgba(0,0,0,.55); }
.premium-custom-swatch:hover { transform:scale(1.12); border-color:#fff; }
.premium-custom-swatch.selected { border-color:#fff; box-shadow:0 0 0 2px #5bd6ff,0 2px 8px rgba(0,0,0,.7); }
.premium-custom-actions { margin-top:10px; }
.premium-native-picker { display:flex; align-items:center; gap:8px; }
.premium-native-picker input[type="color"], #inp-premium-center-color, #inp-premium-outer-color { width:42px; height:34px; padding:2px; border:1px solid var(--panel-edge-2); border-radius:7px; background:var(--bg2); cursor:pointer; }
.premium-rank-sample { color:var(--premium-center,#fff); filter:drop-shadow(0 0 1px var(--premium-outer,#000)) drop-shadow(1px 2px 0 var(--premium-outer,#000)) drop-shadow(-1px -1px 0 var(--premium-outer,#000)); }
'''
CSS.write_text(css,encoding='utf-8')
print('premium custom per-rank colors added')
