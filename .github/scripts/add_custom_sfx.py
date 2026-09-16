from pathlib import Path

APP = Path('app.js')
CSS = Path('style.css')
s = APP.read_text(encoding='utf-8')

if 'function buildCustomSfxCtl' in s:
    raise SystemExit('custom SFX already present')

def rep(old, new, label):
    global s
    if old not in s:
        raise SystemExit(f'missing patch target: {label}')
    s = s.replace(old, new, 1)

# Rank data model: optional custom SFX list per rank.
rep(
'''      clip: null, sourcing: null, query: "", duration: null,\n      boxes: [], // per-rank cover boxes: { id, x, y, w, h, type:"blur"|"blend" }''',
'''      clip: null, sourcing: null, query: "", duration: null,\n      sfxEnabled: false,\n      sfx: [], // {id,name,url,mediaType,sourceDuration,active,playAt,trimStart,trimEnd,volume,fadeIn,fadeOut}\n      boxes: [], // per-rank cover boxes: { id, x, y, w, h, type:"blur"|"blend" }''',
'makeRank custom SFX fields')

# Custom SFX audio master, separate from the built-in reveal SFX toggle.
rep(
'''  let musicGain = null, sfxGain = null, duckAnalyser = null, duckData = null;''',
'''  let musicGain = null, sfxGain = null, customSfxGain = null, duckAnalyser = null, duckData = null;\n  let customSfxSeq = 0;\n  const activeCustomSfxSources = new Set();''',
'audio graph vars')

rep(
'''      // analyser on the CLIP audio, used to duck music under audible clips''',
'''      // uploaded per-clip SFX path. Kept separate from the built-in reveal\n      // SFX toggle so disabling reveal sounds does not mute user-added audio.\n      customSfxGain = audioCtx.createGain();\n      customSfxGain.gain.value = 1;\n      customSfxGain.connect(audioCtx.destination);\n      customSfxGain.connect(audioDest);\n\n      // analyser on the CLIP audio, used to duck music under audible clips''',
'custom SFX gain')

# Precise decoded-buffer playback helpers. Scheduled against AudioContext time so
# preview/export use the same clock and high-res pass 1 captures the mix.
marker = '''  // Plays only the [start,end] window of a clip: seeks in, then stops the moment'''
if marker not in s:
    raise SystemExit('missing patch target: playClip marker')
helpers = r'''  async function ensureCustomSfxBuffer(effect) {
    if (!effect || !effect.url) throw new Error("Sound effect has no audio file.");
    ensureAudioGraph();
    if (effect._buffer) return effect._buffer;
    const resp = await fetch(effect.url);
    if (!resp.ok) throw new Error("Could not load sound effect: " + (effect.name || "audio"));
    const bytes = await resp.arrayBuffer();
    effect._buffer = await audioCtx.decodeAudioData(bytes.slice(0));
    effect.sourceDuration = effect._buffer.duration || effect.sourceDuration || 0;
    if (effect.trimEnd == null || effect.trimEnd <= 0 || effect.trimEnd > effect.sourceDuration) effect.trimEnd = effect.sourceDuration;
    return effect._buffer;
  }

  async function prepareRankCustomSfx(rank) {
    if (!rank || !rank.sfxEnabled) return;
    const items = (rank.sfx || []).filter((x) => x && x.active !== false && x.url);
    await Promise.all(items.map((x) => ensureCustomSfxBuffer(x).catch(() => null)));
  }

  function stopCustomSfxSources() {
    activeCustomSfxSources.forEach((src) => { try { src.stop(); } catch (_) {} });
    activeCustomSfxSources.clear();
  }

  function startCustomSfxEffect(effect, when, maxVisibleDuration) {
    if (!effect || effect.active === false || !effect._buffer || !customSfxGain) return;
    const buf = effect._buffer;
    const at = clamp(Number(effect.playAt) || 0, 0, Math.max(0, maxVisibleDuration || 0));
    const srcStart = clamp(Number(effect.trimStart) || 0, 0, Math.max(0, buf.duration - 0.001));
    const requestedEnd = effect.trimEnd == null ? buf.duration : Number(effect.trimEnd);
    const srcEnd = clamp(Number.isFinite(requestedEnd) ? requestedEnd : buf.duration, srcStart + 0.001, buf.duration);
    const remain = Math.max(0, (maxVisibleDuration || 0) - at);
    const dur = Math.min(srcEnd - srcStart, remain || (srcEnd - srcStart));
    if (!(dur > 0.001)) return;

    const source = audioCtx.createBufferSource();
    source.buffer = buf;
    const gain = audioCtx.createGain();
    const vol = clamp(Number(effect.volume == null ? 1 : effect.volume), 0, 2);
    const fadeIn = clamp(Number(effect.fadeIn) || 0, 0, dur / 2);
    const fadeOut = clamp(Number(effect.fadeOut) || 0, 0, dur / 2);
    const t0 = when + at;
    const t1 = t0 + dur;
    gain.gain.cancelScheduledValues(t0);
    if (fadeIn > 0) {
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.linearRampToValueAtTime(vol, t0 + fadeIn);
    } else gain.gain.setValueAtTime(vol, t0);
    if (fadeOut > 0) {
      gain.gain.setValueAtTime(vol, Math.max(t0, t1 - fadeOut));
      gain.gain.linearRampToValueAtTime(0.0001, t1);
    }
    source.connect(gain); gain.connect(customSfxGain);
    source.onended = () => { activeCustomSfxSources.delete(source); try { source.disconnect(); gain.disconnect(); } catch (_) {} };
    activeCustomSfxSources.add(source);
    source.start(t0, srcStart, dur);
  }

  function scheduleRankCustomSfx(rank, visibleDuration) {
    if (!rank || !rank.sfxEnabled || !audioCtx) return;
    const now = audioCtx.currentTime + 0.015;
    (rank.sfx || []).forEach((effect) => startCustomSfxEffect(effect, now, visibleDuration));
  }

  async function previewCustomSfx(effect) {
    try {
      const buf = await ensureCustomSfxBuffer(effect);
      if (audioCtx.state === "suspended") await audioCtx.resume();
      const srcStart = clamp(Number(effect.trimStart) || 0, 0, Math.max(0, buf.duration - 0.001));
      const srcEnd = clamp(effect.trimEnd == null ? buf.duration : Number(effect.trimEnd), srcStart + 0.001, buf.duration);
      const dur = Math.max(0.001, srcEnd - srcStart);
      const copy = { ...effect, _buffer: buf, playAt: 0 };
      startCustomSfxEffect(copy, audioCtx.currentTime + 0.02, dur);
    } catch (e) {
      alert("Could not preview SFX: " + (e.message || e));
    }
  }

'''
s = s.replace(marker, helpers + marker, 1)

# Fire SFX exactly when the clip really starts. Extend playClip with onStarted.
rep(
'''  function playClip(url, start = 0, end = null) {''',
'''  function playClip(url, start = 0, end = null, onStarted = null) {''',
'playClip callback signature')
rep(
'''        player.play().then(watch).catch(onErr);''',
'''        player.play().then(() => { try { if (onStarted) onStarted(); } catch (_) {} watch(); }).catch(onErr);''',
'playClip start callback')

# Schedule per-rank SFX for real clips and procedural ranks.
rep(
'''        if (onClipStart) onClipStart(i, seq.length, pos);\n        if (r.clip) {''',
'''        if (onClipStart) onClipStart(i, seq.length, pos);\n        await prepareRankCustomSfx(r);\n        if (r.clip) {''',
'prepare rank SFX')
rep(
'''          await playClip(r.clip.url, s, e);''',
'''          const visibleDur = Math.max(0.05, (e != null ? e - s : clipLen(r)));\n          await playClip(r.clip.url, s, e, () => scheduleRankCustomSfx(r, visibleDur));''',
'schedule clip SFX')
rep(
'''          const durMs = Math.min(clipLen(r), budget) * 1000;\n          const t0 = sequenceNow();''',
'''          const durSec = Math.min(clipLen(r), budget);\n          const durMs = durSec * 1000;\n          scheduleRankCustomSfx(r, durSec);\n          const t0 = sequenceNow();''',
'schedule procedural SFX')
rep(
'''      player.pause();\n      musicEl.pause(); // music is trimmed to the video's length''',
'''      player.pause();\n      stopCustomSfxSources();\n      musicEl.pause(); // music is trimmed to the video's length''',
'stop SFX after sequence')
rep(
'''    player.pause();\n    // force 'ended' style resolution''',
'''    player.pause();\n    stopCustomSfxSources();\n    // force 'ended' style resolution''',
'stop SFX button')

# WebCodecs fallback must capture the uploaded SFX path too.
rep(
'''      audioSource.connect(capNode); musicGain.connect(capNode); sfxGain.connect(capNode);''',
'''      audioSource.connect(capNode); musicGain.connect(capNode); sfxGain.connect(capNode); customSfxGain.connect(capNode);''',
'WebCodecs custom SFX capture')
rep(
'''          try { audioSource.disconnect(capNode); musicGain.disconnect(capNode); sfxGain.disconnect(capNode); capNode.disconnect(); capSink.disconnect(); } catch (_) {}''',
'''          try { audioSource.disconnect(capNode); musicGain.disconnect(capNode); sfxGain.disconnect(capNode); customSfxGain.disconnect(capNode); capNode.disconnect(); capSink.disconnect(); } catch (_) {}''',
'WebCodecs custom SFX disconnect')

# Per-rank UI.
ui_marker = '''  function buildCropCtl(r, pos) {'''
if ui_marker not in s:
    raise SystemExit('missing patch target: crop control marker')
ui = r'''  function buildCustomSfxCtl(r, pos) {
    r.sfx = r.sfx || [];
    const wrap = document.createElement("div");
    wrap.className = "box-ctl custom-sfx-ctl";

    const head = document.createElement("div"); head.className = "box-ctl-head";
    const tag = document.createElement("span"); tag.className = "swatch-tag"; tag.textContent = "🔊 SFX"; head.appendChild(tag);
    const enabledLab = document.createElement("label"); enabledLab.className = "check-field mini-check";
    const enabled = document.createElement("input"); enabled.type = "checkbox"; enabled.checked = !!r.sfxEnabled;
    enabled.addEventListener("change", () => { r.sfxEnabled = enabled.checked; body.classList.toggle("hidden", !r.sfxEnabled); scheduleCommit(); });
    enabledLab.appendChild(enabled); enabledLab.append(" Enable sound effects"); head.appendChild(enabledLab);

    const add = document.createElement("button"); add.type = "button"; add.className = "btn btn-ghost btn-small"; add.textContent = "＋ Add SFX";
    const picker = document.createElement("input"); picker.type = "file"; picker.accept = "audio/*,.mp3,.wav,.m4a,.aac,.ogg,.webm"; picker.className = "hidden";
    add.addEventListener("click", () => picker.click());
    picker.addEventListener("change", async () => {
      const file = picker.files && picker.files[0]; if (!file) return;
      ensureAudioGraph();
      const effect = {
        id: "sfx" + (++customSfxSeq), name: file.name, url: URL.createObjectURL(file), mediaType: file.type || "audio/mpeg",
        sourceDuration: 0, active: true, playAt: 0, trimStart: 0, trimEnd: null, volume: 1, fadeIn: 0, fadeOut: 0,
      };
      r.sfx.push(effect); r.sfxEnabled = true;
      try { await ensureCustomSfxBuffer(effect); } catch (_) {}
      advOpen.add(pos); renderRanksUI(); scheduleCommit(); picker.value = "";
    });
    head.appendChild(add); head.appendChild(picker); wrap.appendChild(head);

    const body = document.createElement("div"); body.className = r.sfxEnabled ? "custom-sfx-body" : "custom-sfx-body hidden";
    const clipDuration = Math.max(0.1, clipLen(r));
    if (!r.sfx.length) {
      const empty = document.createElement("p"); empty.className = "hint"; empty.textContent = "Add an MP3/WAV/etc., then choose exactly when it plays inside this clip."; body.appendChild(empty);
    }

    r.sfx.forEach((fx) => {
      const card = document.createElement("div"); card.className = "custom-sfx-item";
      const top = document.createElement("div"); top.className = "custom-sfx-top";
      const activeLab = document.createElement("label"); activeLab.className = "check-field mini-check";
      const active = document.createElement("input"); active.type = "checkbox"; active.checked = fx.active !== false;
      active.addEventListener("change", () => { fx.active = active.checked; scheduleCommit(); });
      activeLab.appendChild(active); activeLab.append(" Active"); top.appendChild(activeLab);
      const name = document.createElement("span"); name.className = "custom-sfx-name"; name.textContent = fx.name || "Sound effect"; name.title = fx.name || ""; top.appendChild(name);
      const preview = document.createElement("button"); preview.type = "button"; preview.className = "btn btn-ghost btn-small"; preview.textContent = "▶ SFX"; preview.addEventListener("click", () => previewCustomSfx(fx)); top.appendChild(preview);
      const del = document.createElement("button"); del.type = "button"; del.className = "btn btn-ghost btn-small"; del.textContent = "🗑";
      del.addEventListener("click", () => { try { if (String(fx.url || "").startsWith("blob:")) URL.revokeObjectURL(fx.url); } catch (_) {} r.sfx = r.sfx.filter((x) => x !== fx); advOpen.add(pos); renderRanksUI(); scheduleCommit(); }); top.appendChild(del);
      card.appendChild(top);

      const grid = document.createElement("div"); grid.className = "custom-sfx-grid";
      const num = (label, value, min, max, step, onChange) => {
        const lab = document.createElement("label"); lab.className = "mini-field"; lab.append(label);
        const input = document.createElement("input"); input.type = "number"; input.min = String(min); input.max = String(max); input.step = String(step); input.value = Number(value || 0).toFixed(step < 1 ? 2 : 0);
        input.addEventListener("input", () => onChange(Number(input.value) || 0)); lab.appendChild(input); grid.appendChild(lab); return input;
      };
      const playAt = num("Play at clip (sec)", fx.playAt || 0, 0, clipDuration, 0.05, (v) => { fx.playAt = clamp(v, 0, clipDuration); playSlider.value = String(fx.playAt); scheduleCommit(); });
      const srcDur = Math.max(0.01, fx.sourceDuration || (fx._buffer && fx._buffer.duration) || 600);
      const st = num("SFX start (sec)", fx.trimStart || 0, 0, srcDur, 0.05, (v) => { fx.trimStart = clamp(v, 0, Math.max(0, (fx.trimEnd == null ? srcDur : fx.trimEnd) - 0.01)); scheduleCommit(); });
      const en = num("SFX end (sec)", fx.trimEnd == null ? srcDur : fx.trimEnd, 0.01, srcDur, 0.05, (v) => { fx.trimEnd = clamp(v, (fx.trimStart || 0) + 0.01, srcDur); scheduleCommit(); });
      num("Fade in (sec)", fx.fadeIn || 0, 0, 5, 0.05, (v) => { fx.fadeIn = clamp(v, 0, 5); scheduleCommit(); });
      num("Fade out (sec)", fx.fadeOut || 0, 0, 5, 0.05, (v) => { fx.fadeOut = clamp(v, 0, 5); scheduleCommit(); });
      card.appendChild(grid);

      const timeline = document.createElement("div"); timeline.className = "custom-sfx-timeline";
      const playSlider = document.createElement("input"); playSlider.type = "range"; playSlider.min = "0"; playSlider.max = String(clipDuration); playSlider.step = "0.05"; playSlider.value = String(clamp(Number(fx.playAt) || 0, 0, clipDuration));
      playSlider.title = "Drag to choose where the sound starts in this clip";
      playSlider.addEventListener("input", () => { fx.playAt = Number(playSlider.value); playAt.value = Number(playSlider.value).toFixed(2); scheduleCommit(); });
      timeline.appendChild(playSlider);
      const read = document.createElement("span"); read.className = "trim-read"; read.textContent = `0s  →  ${clipDuration.toFixed(2)}s`; timeline.appendChild(read); card.appendChild(timeline);

      const volLab = document.createElement("label"); volLab.className = "mini-field custom-sfx-volume"; volLab.append("Volume ");
      const volRead = document.createElement("b"); volRead.textContent = Math.round((fx.volume == null ? 1 : fx.volume) * 100) + "%"; volLab.appendChild(volRead);
      const vol = document.createElement("input"); vol.type = "range"; vol.min = "0"; vol.max = "200"; vol.step = "1"; vol.value = String(Math.round((fx.volume == null ? 1 : fx.volume) * 100));
      vol.addEventListener("input", () => { fx.volume = Number(vol.value) / 100; volRead.textContent = vol.value + "%"; scheduleCommit(); }); volLab.appendChild(vol); card.appendChild(volLab);
      body.appendChild(card);
    });
    wrap.appendChild(body);
    return wrap;
  }

'''
s = s.replace(ui_marker, ui + ui_marker, 1)

rep(
'''      // per-clip trim: choose exactly what part of the clip to keep\n      if (r.clip) { adv.appendChild(buildTrimCtl(r, pos)); adv.appendChild(buildCropCtl(r, pos)); }''',
'''      // per-clip trim/crop + optional uploaded sound effects\n      if (r.clip) { adv.appendChild(buildTrimCtl(r, pos)); adv.appendChild(buildCropCtl(r, pos)); adv.appendChild(buildCustomSfxCtl(r, pos)); }''',
'attach SFX UI')

# Include SFX metadata in project files, then pack its actual bytes.
rep(
'''            sizeScale: r.sizeScale, duration: r.duration, boxes: (r.boxes || []).map((b) => ({ ...b })),''',
'''            sizeScale: r.sizeScale, duration: r.duration,\n            sfxEnabled: !!r.sfxEnabled,\n            sfx: (r.sfx || []).map((x) => ({ id:x.id, name:x.name, mediaType:x.mediaType || "", sourceDuration:x.sourceDuration || 0, active:x.active !== false, playAt:Number(x.playAt)||0, trimStart:Number(x.trimStart)||0, trimEnd:x.trimEnd == null ? null : Number(x.trimEnd), volume:x.volume == null ? 1 : Number(x.volume), fadeIn:Number(x.fadeIn)||0, fadeOut:Number(x.fadeOut)||0 })),\n            boxes: (r.boxes || []).map((b) => ({ ...b })),''',
'project SFX metadata')

rep(
'''        if (r.clip) {\n          projStatus(`Saving project… packing clip ${i + 1}`);\n          const { b64, type } = await blobUrlToBase64(r.clip.url);\n          proj.state.ranks[i].clip.data = b64;\n          proj.state.ranks[i].clip.mediaType = type;\n        }\n      }''',
'''        if (r.clip) {\n          projStatus(`Saving project… packing clip ${i + 1}`);\n          const { b64, type } = await blobUrlToBase64(r.clip.url);\n          proj.state.ranks[i].clip.data = b64;\n          proj.state.ranks[i].clip.mediaType = type;\n        }\n        for (let j = 0; j < (r.sfx || []).length; j++) {\n          const fx = r.sfx[j];\n          if (!fx || !fx.url || !proj.state.ranks[i].sfx || !proj.state.ranks[i].sfx[j]) continue;\n          projStatus(`Saving project… packing SFX ${j + 1} for rank ${i + 1}`);\n          const packed = await blobUrlToBase64(fx.url);\n          proj.state.ranks[i].sfx[j].data = packed.b64;\n          proj.state.ranks[i].sfx[j].mediaType = packed.type || fx.mediaType || "audio/mpeg";\n        }\n      }''',
'pack SFX bytes')

# Restore project SFX files from base64.
rep(
'''          sizeScale: r.sizeScale || 1, clip: null, sourcing: null, query: "",\n          duration: r.duration != null ? r.duration : null,\n          boxes: (r.boxes || []).map((b) => ({ ...b })),\n        };''',
'''          sizeScale: r.sizeScale || 1, clip: null, sourcing: null, query: "",\n          duration: r.duration != null ? r.duration : null,\n          sfxEnabled: !!r.sfxEnabled,\n          sfx: (r.sfx || []).map((x) => {\n            const fx = { id:x.id || ("sfx" + (++customSfxSeq)), name:x.name || "Sound effect", mediaType:x.mediaType || "audio/mpeg", sourceDuration:x.sourceDuration || 0, active:x.active !== false, playAt:Number(x.playAt)||0, trimStart:Number(x.trimStart)||0, trimEnd:x.trimEnd == null ? null : Number(x.trimEnd), volume:x.volume == null ? 1 : Number(x.volume), fadeIn:Number(x.fadeIn)||0, fadeOut:Number(x.fadeOut)||0, url:"", _buffer:null };\n            if (x.data) fx.url = URL.createObjectURL(base64ToBlob(x.data, x.mediaType || "audio/mpeg"));\n            return fx;\n          }),\n          boxes: (r.boxes || []).map((b) => ({ ...b })),\n        };''',
'restore SFX project')

# History snapshots keep SFX timing/edit state and blob URLs; decoded buffers are lazy.
rep(
'''        clip: r.clip, sourcing: r.sourcing, query: r.query, duration: r.duration,\n        trimStart: r.clip ? r.clip.trimStart : null, trimEnd: r.clip ? r.clip.trimEnd : null,''',
'''        clip: r.clip, sourcing: r.sourcing, query: r.query, duration: r.duration,\n        sfxEnabled: !!r.sfxEnabled,\n        sfx: (r.sfx || []).map((x) => ({ id:x.id, name:x.name, url:x.url, mediaType:x.mediaType || "", sourceDuration:x.sourceDuration || 0, active:x.active !== false, playAt:Number(x.playAt)||0, trimStart:Number(x.trimStart)||0, trimEnd:x.trimEnd == null ? null : Number(x.trimEnd), volume:x.volume == null ? 1 : Number(x.volume), fadeIn:Number(x.fadeIn)||0, fadeOut:Number(x.fadeOut)||0 })),\n        trimStart: r.clip ? r.clip.trimStart : null, trimEnd: r.clip ? r.clip.trimEnd : null,''',
'history SFX metadata')

# Older projects/snapshots get safe defaults during history restore.
rep(
'''    state.ranks = s.ranks.map((r) => {\n      // clips are kept by reference across snapshots, so restore the trim''',
'''    state.ranks = s.ranks.map((r) => {\n      r.sfxEnabled = !!r.sfxEnabled;\n      r.sfx = (r.sfx || []).map((x) => ({ ...x, _buffer: null }));\n      // clips are kept by reference across snapshots, so restore the trim''',
'history restore SFX defaults')

APP.write_text(s, encoding='utf-8')

css = CSS.read_text(encoding='utf-8')
if '/* ---- custom per-clip SFX ---- */' not in css:
    css += r'''

/* ---- custom per-clip SFX ---- */
.custom-sfx-ctl { border-color: rgba(91,214,255,.30); }
.custom-sfx-body { margin-top: 9px; display: flex; flex-direction: column; gap: 9px; }
.custom-sfx-item { padding: 9px; border: 1px solid var(--panel-edge); border-radius: 9px; background: rgba(8,14,25,.58); }
.custom-sfx-top { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.custom-sfx-name { flex: 1 1 180px; min-width: 100px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12.5px; font-weight: 700; }
.custom-sfx-grid { display: grid; grid-template-columns: repeat(5, minmax(110px, 1fr)); gap: 7px; margin-top: 9px; }
.custom-sfx-grid .mini-field { min-width: 0; }
.custom-sfx-grid input[type="number"] { margin-top: 4px; padding: 7px 8px; }
.custom-sfx-timeline { display: flex; gap: 9px; align-items: center; margin-top: 9px; }
.custom-sfx-timeline input[type="range"] { flex: 1; }
.custom-sfx-volume { display: block; margin-top: 8px; }
.custom-sfx-volume b { float: right; }
@media (max-width: 900px) { .custom-sfx-grid { grid-template-columns: repeat(2, minmax(110px, 1fr)); } }
'''
CSS.write_text(css, encoding='utf-8')
print('custom per-clip SFX patch applied')
