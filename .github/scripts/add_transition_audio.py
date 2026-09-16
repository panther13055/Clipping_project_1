from pathlib import Path

APP = Path('app.js')
INDEX = Path('index.html')
CSS = Path('style.css')
s = APP.read_text(encoding='utf-8')
html = INDEX.read_text(encoding='utf-8')

if 'function playTransitionAudio' in s:
    raise SystemExit('transition audio already present')

def rep(text, old, new, label):
    if old not in text:
        raise SystemExit(f'missing patch target: {label}')
    return text.replace(old, new, 1)

# Count the selected transition segment in the project duration. Function
# declarations are hoisted; transitionAudio itself is initialized before UI use.
s = rep(s,
'''  const totalDuration = () => state.ranks.reduce((s, r) => s + clipLen(r), 0);''',
'''  const totalDuration = () => state.ranks.reduce((s, r) => s + clipLen(r), 0) + transitionTotalDuration();''',
'total duration')

# Global transition audio state lives beside the existing audio settings.
s = rep(s,
'''  const audio = { musicName: "", musicVol: 0.7, sfxOn: true, sfxVol: 0.6 };\n  const hasMusic = () => !!musicEl.getAttribute("src");''',
'''  const audio = { musicName: "", musicVol: 0.7, sfxOn: true, sfxVol: 0.6 };\n  const transitionAudio = { enabled:false, name:"", url:"", mediaType:"", sourceDuration:0, trimStart:0, trimEnd:null, volume:1, fadeIn:0, fadeOut:0, _buffer:null };\n  const hasMusic = () => !!musicEl.getAttribute("src");\n  const hasTransitionAudio = () => !!transitionAudio.url;\n  function transitionSegmentDuration() {\n    if (!transitionAudio.enabled || !hasTransitionAudio()) return 0;\n    const full = Math.max(0, Number(transitionAudio.sourceDuration) || (transitionAudio._buffer && transitionAudio._buffer.duration) || 0);\n    if (!full) return 0;\n    const a = clamp(Number(transitionAudio.trimStart) || 0, 0, full);\n    const b = clamp(transitionAudio.trimEnd == null ? full : Number(transitionAudio.trimEnd), a, full);\n    return Math.max(0, b - a);\n  }\n  function transitionTotalDuration() {\n    const d = transitionSegmentDuration();\n    return d > 0 ? Math.max(0, state.ranks.length - 1) * d : 0;\n  }''',
'global transition state')

# Playback helpers use the same AudioContext/custom SFX output as uploaded clip
# SFX, so preview and export share a single master clock.
marker = '''  // Plays only the [start,end] window of a clip: seeks in, then stops the moment'''
if marker not in s:
    raise SystemExit('missing playClip marker')
helpers = r'''  async function ensureTransitionAudioBuffer() {
    if (!transitionAudio.enabled || !transitionAudio.url) return null;
    try {
      const buf = await ensureCustomSfxBuffer(transitionAudio);
      transitionAudio.sourceDuration = buf.duration || transitionAudio.sourceDuration || 0;
      if (transitionAudio.trimEnd == null || transitionAudio.trimEnd > transitionAudio.sourceDuration) transitionAudio.trimEnd = transitionAudio.sourceDuration;
      syncTransitionAudioUI();
      return buf;
    } catch (e) {
      console.warn("Transition audio could not be decoded", e);
      return null;
    }
  }

  async function playTransitionAudio(maxDuration) {
    if (!transitionAudio.enabled || !transitionAudio.url || engine.stopFlag) return 0;
    const buf = await ensureTransitionAudioBuffer();
    if (!buf || engine.stopFlag) return 0;
    if (audioCtx.state === "suspended") await audioCtx.resume().catch(() => {});
    const full = buf.duration || 0;
    const st = clamp(Number(transitionAudio.trimStart) || 0, 0, Math.max(0, full - 0.001));
    const en = clamp(transitionAudio.trimEnd == null ? full : Number(transitionAudio.trimEnd), st + 0.001, full);
    const allowed = Math.max(0, Number(maxDuration) || (en - st));
    const dur = Math.min(en - st, allowed);
    if (!(dur > 0.01)) return 0;
    const effect = { ...transitionAudio, _buffer:buf, active:true, playAt:0, trimStart:st, trimEnd:st + dur };
    startCustomSfxEffect(effect, audioCtx.currentTime + 0.015, dur);
    const t0 = sequenceNow();
    while ((sequenceNow() - t0) < dur * 1000 && !engine.stopFlag) await sleep(20);
    return dur;
  }

  async function previewTransitionAudio() {
    if (!transitionAudio.url) return;
    const old = transitionAudio.enabled;
    transitionAudio.enabled = true;
    await ensureTransitionAudioBuffer();
    transitionAudio.enabled = old;
    if (transitionAudio._buffer) {
      const full = transitionAudio._buffer.duration || 0;
      const st = clamp(Number(transitionAudio.trimStart) || 0, 0, Math.max(0, full - 0.001));
      const en = clamp(transitionAudio.trimEnd == null ? full : Number(transitionAudio.trimEnd), st + 0.001, full);
      const copy = { ...transitionAudio, _buffer:transitionAudio._buffer, active:true, playAt:0, trimStart:st, trimEnd:en };
      startCustomSfxEffect(copy, audioCtx.currentTime + 0.02, en - st);
    }
  }

'''
s = s.replace(marker, helpers + marker, 1)

# Insert transition after each sequence item except the last. The next clip does
# not begin until the selected transition segment finishes. For procedural ranks
# keep their last frame visible while the transition plays.
s = rep(s,
'''          while (sequenceNow() - t0 < durMs && !engine.stopFlag) await sleep(40);\n          engine.current = null;\n        }\n      }''',
'''          while (sequenceNow() - t0 < durMs && !engine.stopFlag) await sleep(40);\n        }\n        if (i < seq.length - 1 && !engine.stopFlag && transitionAudio.enabled && transitionAudio.url) {\n          const transBudget = Math.max(0, MAX_TOTAL_SECONDS - (sequenceNow() - seqStart) / 1000);\n          if (transBudget > 0.02) await playTransitionAudio(transBudget);\n        }\n        engine.current = null;\n      }''',
'run sequence transition')

# Save transition metadata in the project audio block.
s = rep(s,
'''        audio: { musicName: audio.musicName, musicVol: audio.musicVol, sfxOn: audio.sfxOn, sfxVol: audio.sfxVol },''',
'''        audio: {\n          musicName: audio.musicName, musicVol: audio.musicVol, sfxOn: audio.sfxOn, sfxVol: audio.sfxVol,\n          transition: { enabled:!!transitionAudio.enabled, name:transitionAudio.name || "", mediaType:transitionAudio.mediaType || "", sourceDuration:transitionAudio.sourceDuration || 0, trimStart:Number(transitionAudio.trimStart)||0, trimEnd:transitionAudio.trimEnd == null ? null : Number(transitionAudio.trimEnd), volume:transitionAudio.volume == null ? 1 : Number(transitionAudio.volume), fadeIn:Number(transitionAudio.fadeIn)||0, fadeOut:Number(transitionAudio.fadeOut)||0 }\n        },''',
'project audio metadata')

# Embed the transition file bytes so .rankproj stays self-contained.
s = rep(s,
'''      if (hasMusic()) {\n        projStatus("Saving project… packing music");\n        const { b64, type } = await blobUrlToBase64(musicEl.src);\n        proj.audio.data = b64; proj.audio.dataType = type;\n      }\n      const blob = new Blob([JSON.stringify(proj)], { type: "application/json" });''',
'''      if (hasMusic()) {\n        projStatus("Saving project… packing music");\n        const { b64, type } = await blobUrlToBase64(musicEl.src);\n        proj.audio.data = b64; proj.audio.dataType = type;\n      }\n      if (hasTransitionAudio()) {\n        projStatus("Saving project… packing transition audio");\n        const packed = await blobUrlToBase64(transitionAudio.url);\n        proj.audio.transition.data = packed.b64;\n        proj.audio.transition.mediaType = packed.type || transitionAudio.mediaType || "audio/mpeg";\n      }\n      const blob = new Blob([JSON.stringify(proj)], { type: "application/json" });''',
'pack transition audio')

# Restore transition audio when opening projects; older projects remain valid.
s = rep(s,
'''      $("inp-sfx-vol").value = Math.round(audio.sfxVol * 100);\n      $("val-sfx-vol").textContent = Math.round(audio.sfxVol * 100) + "%";\n\n      document.body.classList.remove("setup-mode");''',
'''      $("inp-sfx-vol").value = Math.round(audio.sfxVol * 100);\n      $("val-sfx-vol").textContent = Math.round(audio.sfxVol * 100) + "%";\n      restoreTransitionAudio(a.transition || null);\n\n      document.body.classList.remove("setup-mode");''',
'restore transition project')

# Add transition controller logic just before the existing Audio panel handlers.
marker2 = '''  // ---- audio panel ----'''
if marker2 not in s:
    raise SystemExit('missing audio panel marker')
logic = r'''  // ---- custom transition audio (Creative tools) ----
  function transitionAudioFile(file) {
    if (transitionAudio.url && String(transitionAudio.url).startsWith("blob:")) { try { URL.revokeObjectURL(transitionAudio.url); } catch (_) {} }
    transitionAudio._buffer = null;
    if (!file) {
      transitionAudio.name = ""; transitionAudio.url = ""; transitionAudio.mediaType = ""; transitionAudio.sourceDuration = 0;
      transitionAudio.trimStart = 0; transitionAudio.trimEnd = null;
      transitionAudio.enabled = false;
      syncTransitionAudioUI(); updateTotalUI(); return;
    }
    transitionAudio.url = URL.createObjectURL(file);
    transitionAudio.name = file.name || "Transition audio";
    transitionAudio.mediaType = file.type || "audio/mpeg";
    transitionAudio.enabled = true;
    ensureTransitionAudioBuffer().then(() => { syncTransitionAudioUI(); updateTotalUI(); });
    syncTransitionAudioUI();
  }

  function restoreTransitionAudio(saved) {
    if (transitionAudio.url && String(transitionAudio.url).startsWith("blob:")) { try { URL.revokeObjectURL(transitionAudio.url); } catch (_) {} }
    Object.assign(transitionAudio, { enabled:false, name:"", url:"", mediaType:"", sourceDuration:0, trimStart:0, trimEnd:null, volume:1, fadeIn:0, fadeOut:0, _buffer:null });
    if (saved) {
      transitionAudio.enabled = !!saved.enabled;
      transitionAudio.name = saved.name || "Transition audio";
      transitionAudio.mediaType = saved.mediaType || "audio/mpeg";
      transitionAudio.sourceDuration = Number(saved.sourceDuration) || 0;
      transitionAudio.trimStart = Number(saved.trimStart) || 0;
      transitionAudio.trimEnd = saved.trimEnd == null ? null : Number(saved.trimEnd);
      transitionAudio.volume = saved.volume == null ? 1 : Number(saved.volume);
      transitionAudio.fadeIn = Number(saved.fadeIn) || 0;
      transitionAudio.fadeOut = Number(saved.fadeOut) || 0;
      if (saved.data) transitionAudio.url = URL.createObjectURL(base64ToBlob(saved.data, transitionAudio.mediaType));
    }
    if (!transitionAudio.url) transitionAudio.enabled = false;
    syncTransitionAudioUI(); updateTotalUI();
  }

  function syncTransitionAudioUI() {
    const en=$("inp-transition-audio-enabled"), name=$("transition-audio-name"), add=$("btn-transition-audio"), rm=$("btn-transition-audio-remove");
    if (!en) return;
    en.checked = !!transitionAudio.enabled;
    en.disabled = !hasTransitionAudio();
    if (name) name.textContent = transitionAudio.name || "No transition audio selected";
    if (add) add.textContent = hasTransitionAudio() ? "🔁 Replace transition audio" : "＋ Add transition audio";
    if (rm) rm.classList.toggle("hidden", !hasTransitionAudio());
    const full = Math.max(0, Number(transitionAudio.sourceDuration)||0);
    const st=$("inp-transition-start"), ed=$("inp-transition-end"), vol=$("inp-transition-volume"), fi=$("inp-transition-fadein"), fo=$("inp-transition-fadeout");
    if (st) { st.max=String(full || 600); st.value=String(transitionAudio.trimStart || 0); st.disabled=!hasTransitionAudio(); }
    if (ed) { ed.max=String(full || 600); ed.value=String(transitionAudio.trimEnd == null ? full : transitionAudio.trimEnd); ed.disabled=!hasTransitionAudio(); }
    if (vol) { vol.value=String(Math.round((transitionAudio.volume == null ? 1 : transitionAudio.volume)*100)); vol.disabled=!hasTransitionAudio(); }
    if ($("val-transition-volume")) $("val-transition-volume").textContent=Math.round((transitionAudio.volume == null ? 1 : transitionAudio.volume)*100)+"%";
    if (fi) { fi.value=String(transitionAudio.fadeIn || 0); fi.disabled=!hasTransitionAudio(); }
    if (fo) { fo.value=String(transitionAudio.fadeOut || 0); fo.disabled=!hasTransitionAudio(); }
    const dur=$("transition-duration-read"); if (dur) dur.textContent=hasTransitionAudio() ? `Selected transition: ${transitionSegmentDuration().toFixed(2)}s · plays between every clip` : "Upload one audio file; the same selected section will play after each clip except the last.";
  }

  function setupTransitionAudioUI() {
    const add=$("btn-transition-audio"); if (!add) return;
    add.addEventListener("click", () => { const inp=document.createElement("input"); inp.type="file"; inp.accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.webm"; inp.onchange=()=>inp.files[0]&&transitionAudioFile(inp.files[0]); inp.click(); });
    $("btn-transition-audio-remove").addEventListener("click", () => transitionAudioFile(null));
    $("btn-transition-audio-preview").addEventListener("click", () => previewTransitionAudio());
    $("inp-transition-audio-enabled").addEventListener("change", (e) => { transitionAudio.enabled=!!e.target.checked && hasTransitionAudio(); syncTransitionAudioUI(); updateTotalUI(); scheduleCommit(); });
    $("inp-transition-start").addEventListener("input", (e) => { const full=Math.max(0.01,transitionAudio.sourceDuration||600); transitionAudio.trimStart=clamp(Number(e.target.value)||0,0,Math.max(0,full-0.01)); if (transitionAudio.trimEnd!=null && transitionAudio.trimEnd<=transitionAudio.trimStart) transitionAudio.trimEnd=Math.min(full,transitionAudio.trimStart+0.05); syncTransitionAudioUI(); updateTotalUI(); scheduleCommit(); });
    $("inp-transition-end").addEventListener("input", (e) => { const full=Math.max(0.01,transitionAudio.sourceDuration||600); transitionAudio.trimEnd=clamp(Number(e.target.value)||full,(transitionAudio.trimStart||0)+0.01,full); syncTransitionAudioUI(); updateTotalUI(); scheduleCommit(); });
    $("inp-transition-volume").addEventListener("input", (e) => { transitionAudio.volume=clamp(Number(e.target.value)/100,0,2); $("val-transition-volume").textContent=e.target.value+"%"; scheduleCommit(); });
    $("inp-transition-fadein").addEventListener("input", (e) => { transitionAudio.fadeIn=clamp(Number(e.target.value)||0,0,5); scheduleCommit(); });
    $("inp-transition-fadeout").addEventListener("input", (e) => { transitionAudio.fadeOut=clamp(Number(e.target.value)||0,0,5); scheduleCommit(); });
    syncTransitionAudioUI();
  }

'''
s = s.replace(marker2, logic + marker2, 1)

# Initialize Creative-tools transition UI with the rest of the page.
s = rep(s,
'''  // ---- audio panel ----\n  // "Every rank silent" heuristic:''',
'''  setupTransitionAudioUI();\n\n  // ---- audio panel ----\n  // "Every rank silent" heuristic:''',
'initialize transition UI')

# Health check catches a stale toggle/file mismatch.
s = rep(s,
'''    if (clipsAssigned() && !hasMusic()) issues.push("No background music added.");''',
'''    if (clipsAssigned() && !hasMusic()) issues.push("No background music added.");\n    if (transitionAudio.enabled && !hasTransitionAudio()) issues.push("Transition audio is enabled but no transition file is loaded.");''',
'health transition')

APP.write_text(s, encoding='utf-8')

# Creative Tools card.
card_target = '''        <div class="tool-card">\n          <div class="tool-card-title">Project helpers</div>'''
card = '''        <div class="tool-card transition-audio-card">\n          <div class="tool-card-title">🔁 Audio transition between clips</div>\n          <label class="check-field"><input type="checkbox" id="inp-transition-audio-enabled" disabled> Enable custom transition audio</label>\n          <div class="row compact-row" style="margin-top:8px">\n            <button class="btn btn-primary btn-small" id="btn-transition-audio" type="button">＋ Add transition audio</button>\n            <button class="btn btn-ghost btn-small hidden" id="btn-transition-audio-remove" type="button">Remove</button>\n            <button class="btn btn-ghost btn-small" id="btn-transition-audio-preview" type="button">▶ Preview</button>\n            <span class="hint transition-audio-name" id="transition-audio-name" style="margin:0">No transition audio selected</span>\n          </div>\n          <div class="row compact-row transition-audio-controls" style="margin-top:10px">\n            <label class="mini-field">Audio start (sec)<input type="number" id="inp-transition-start" min="0" step="0.05" value="0" disabled></label>\n            <label class="mini-field">Audio end (sec)<input type="number" id="inp-transition-end" min="0.01" step="0.05" value="0" disabled></label>\n            <label class="mini-field">Fade in<input type="number" id="inp-transition-fadein" min="0" max="5" step="0.05" value="0" disabled></label>\n            <label class="mini-field">Fade out<input type="number" id="inp-transition-fadeout" min="0" max="5" step="0.05" value="0" disabled></label>\n          </div>\n          <label class="field slider-field" style="margin-top:10px">\n            <span>Transition volume <b id="val-transition-volume">100%</b></span>\n            <input type="range" id="inp-transition-volume" min="0" max="200" value="100" disabled>\n          </label>\n          <p class="hint" id="transition-duration-read" style="margin-bottom:0">Upload one audio file; the same selected section will play after each clip except the last.</p>\n          <p class="hint" style="margin-bottom:0"><b>Flow:</b> Clip 1 → transition audio → Clip 2 → transition audio → Clip 3. The next clip waits until the transition finishes.</p>\n        </div>\n\n        <div class="tool-card">\n          <div class="tool-card-title">Project helpers</div>'''
html = rep(html, card_target, card, 'Creative Tools transition card')
INDEX.write_text(html, encoding='utf-8')

css = CSS.read_text(encoding='utf-8')
if '/* ---- transition audio ---- */' not in css:
    css += r'''

/* ---- transition audio ---- */
.transition-audio-card { border-color: rgba(139,124,255,.36); background: linear-gradient(180deg, rgba(139,124,255,.07), rgba(0,0,0,.08)); }
.transition-audio-name { flex: 1 1 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.transition-audio-controls .mini-field { flex: 1 1 120px; min-width: 110px; }
.transition-audio-controls input[type="number"] { margin-top: 4px; }
'''
CSS.write_text(css, encoding='utf-8')
print('custom between-clip transition audio patch applied')
