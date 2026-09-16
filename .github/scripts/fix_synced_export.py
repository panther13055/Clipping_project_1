from pathlib import Path

p = Path('app.js')
s = p.read_text(encoding='utf-8')

# Keep high-resolution bitrates high-quality but realistic for browser encoders.
for old, new in [
    ('"8K":    { width: 4320, height: 7680, videoBitrate: 85_000_000, codec: "avc1.64003e", fps: 24, renderFps: 24 }', '"8K":    { width: 4320, height: 7680, videoBitrate: 52_000_000, codec: "avc1.64003e", fps: 24, renderFps: 24 }'),
    ('"8K":    { width: 4320, height: 7680, videoBitrate: 52_000_000, codec: "avc1.64003e", fps: 24, renderFps: 24 }', '"8K":    { width: 4320, height: 7680, videoBitrate: 52_000_000, codec: "avc1.64003e", fps: 24, renderFps: 24 }'),
    ('"4K":    { width: 2160, height: 3840, videoBitrate: 38_000_000, codec: "avc1.640033", fps: 30, renderFps: 30 }', '"4K":    { width: 2160, height: 3840, videoBitrate: 30_000_000, codec: "avc1.640033", fps: 30, renderFps: 30 }'),
    ('"2K":    { width: 1440, height: 2560, videoBitrate: 20_000_000, codec: "avc1.640032", fps: 30, renderFps: 30 }', '"2K":    { width: 1440, height: 2560, videoBitrate: 18_000_000, codec: "avc1.640032", fps: 30, renderFps: 30 }'),
]:
    s = s.replace(old, new)

# Idempotent replacement: replace the previous stable-export block if present,
# otherwise replace only the old exportVideo function.
marker = '  function recorderFormatChoice() {'
start = s.index(marker) if marker in s else s.index('  async function exportVideo() {')
end = s.index('\n  // ---------------------------------------------- save / load a whole project', start)

new_block = r'''  function recorderFormatChoice(profile) {
    const preferWebm = profile && profile.width >= 4000;
    const mp4 = [
      ['video/mp4', 'mp4'],
      ['video/mp4;codecs="avc1.42E01E,mp4a.40.2"', 'mp4'],
    ];
    const webm = [
      ['video/webm;codecs=vp9,opus', 'webm'],
      ['video/webm;codecs=vp8,opus', 'webm'],
      ['video/webm', 'webm'],
    ];
    const candidates = preferWebm ? [...webm, ...mp4] : [...mp4, ...webm];
    return candidates.find(([m]) => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || ['', 'webm'];
  }

  // 2K/4K/8K use a synchronized two-pass pipeline:
  // pass 1 records the full composition at a stable 1080p/30fps with audio;
  // pass 2 only scales that already-synchronized file. Heavy high-res work can
  // therefore repeat/drop a visual frame under load but can no longer alter
  // media speed or make the audio clock drift away from the video clock.
  async function upscaleSyncedMaster(masterBlob, profile, quality) {
    if (!window.MediaRecorder) throw new Error('MediaRecorder is required for stable high-resolution export.');
    const srcUrl = URL.createObjectURL(masterBlob);
    const v = document.createElement('video');
    v.playsInline = true; v.preload = 'auto'; v.src = srcUrl; v.volume = 1;
    await new Promise((resolve, reject) => {
      const ok = () => { cleanup(); resolve(); };
      const bad = () => { cleanup(); reject(new Error('Could not load the synchronized master for high-resolution scaling.')); };
      const cleanup = () => { v.removeEventListener('loadeddata', ok); v.removeEventListener('error', bad); };
      v.addEventListener('loadeddata', ok); v.addEventListener('error', bad); v.load();
    });

    exportCanvas.width = profile.width; exportCanvas.height = profile.height;
    exportCtx.setTransform(1,0,0,1,0,0);
    exportCtx.imageSmoothingEnabled = true; exportCtx.imageSmoothingQuality = 'high';
    exportCtx.fillStyle = '#000'; exportCtx.fillRect(0,0,profile.width,profile.height);
    try { exportCtx.drawImage(v, 0, 0, profile.width, profile.height); } catch (_) {}

    const fps = profile.fps || 30;
    const outStream = exportCanvas.captureStream(fps);

    // Route master audio into a MediaStreamDestination instead of recapturing
    // the original live AudioContext graph. Audio and video now both originate
    // from the SAME finished master file, so their timestamps cannot diverge.
    if (!audioCtx) ensureAudioGraph();
    if (audioCtx && audioCtx.state === 'suspended') await audioCtx.resume().catch(() => {});
    const masterSource = audioCtx.createMediaElementSource(v);
    const masterAudioDest = audioCtx.createMediaStreamDestination();
    masterSource.connect(masterAudioDest); // intentionally not connected to speakers
    masterAudioDest.stream.getAudioTracks().forEach((t) => outStream.addTrack(t));

    const [mime, ext] = recorderFormatChoice(profile);
    const opts = { videoBitsPerSecond: profile.videoBitrate };
    if (mime) opts.mimeType = mime;
    let rec;
    try { rec = new MediaRecorder(outStream, opts); }
    catch (e) {
      try { masterSource.disconnect(); } catch (_) {}
      outStream.getTracks().forEach((t) => t.stop());
      URL.revokeObjectURL(srcUrl);
      throw new Error(`This browser/GPU cannot start ${quality} encoding: ${e.message || e}`);
    }
    const chunks = [];
    let recErr = null;
    rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    rec.onerror = (e) => { recErr = e.error || new Error('High-resolution recorder failed.'); };
    const done = new Promise((resolve) => { rec.onstop = resolve; });

    let stopped = false, rvfc = 0, raf = 0, progressTimer = 0;
    const draw = () => {
      if (stopped) return;
      try {
        exportCtx.setTransform(1,0,0,1,0,0);
        exportCtx.imageSmoothingEnabled = true; exportCtx.imageSmoothingQuality = 'high';
        exportCtx.drawImage(v, 0, 0, profile.width, profile.height);
      } catch (_) {}
      if (typeof v.requestVideoFrameCallback === 'function') rvfc = v.requestVideoFrameCallback(draw);
      else raf = requestAnimationFrame(draw);
    };

    const vis = () => {
      if (document.hidden) {
        if (!v.paused) v.pause();
        if (rec.state === 'recording') try { rec.pause(); } catch (_) {}
        const st = $('export-status'); if (st) st.textContent = `High-res ${quality} paused — return to this tab.`;
      } else {
        if (rec.state === 'paused') try { rec.resume(); } catch (_) {}
        if (!v.ended) v.play().catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', vis);

    rec.start(500);
    draw();
    progressTimer = setInterval(() => {
      const pct = v.duration ? Math.min(100, Math.max(0, (v.currentTime / v.duration) * 100)) : 0;
      $('export-bar').style.width = `${50 + Math.round(pct * 0.5)}%`;
      $('export-status').textContent = `Pass 2/2 · synchronized ${quality} scaling · ${profile.width}×${profile.height} · ${fps}fps`;
    }, 250);

    try {
      await v.play();
      await new Promise((resolve, reject) => {
        v.addEventListener('ended', resolve, { once:true });
        v.addEventListener('error', () => reject(new Error('Master playback failed during high-resolution scaling.')), { once:true });
      });
      await new Promise((r) => setTimeout(r, 150));
    } finally {
      stopped = true;
      clearInterval(progressTimer);
      if (rvfc && typeof v.cancelVideoFrameCallback === 'function') try { v.cancelVideoFrameCallback(rvfc); } catch (_) {}
      if (raf) cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', vis);
      if (rec.state !== 'inactive') rec.stop();
      await done;
      try { masterSource.disconnect(); } catch (_) {}
      outStream.getTracks().forEach((t) => t.stop());
      v.pause(); v.removeAttribute('src'); v.load();
      URL.revokeObjectURL(srcUrl);
    }
    if (recErr) throw recErr;
    const blob = new Blob(chunks, { type: ext === 'mp4' ? 'video/mp4' : 'video/webm' });
    if (!blob.size) throw new Error('High-resolution pass produced an empty file.');
    return { blob, ext };
  }

  async function exportVideo() {
    if (engine.running || engine.recording) return;
    ensureAudioGraph();
    const quality = $('export-quality') ? $('export-quality').value : '1080p';
    const requested = EXPORT_PROFILES[quality] || EXPORT_PROFILES['1080p'];
    const highRes = quality === '2K' || quality === '4K' || quality === '8K';
    const masterProfile = highRes
      ? { ...EXPORT_PROFILES['1080p'], width:1080, height:1920, fps:30, renderFps:30, videoBitrate:12_000_000 }
      : requested;

    engine.running = true; engine.recording = true; engine.stopFlag = false;
    engine.exportProfile = masterProfile; engine.exportFrameReady = false; engine.exportLastRenderMs = 0; engine.exportDroppedFrames = 0;
    engine.pauseAccumMs = 0; engine.pauseStarted = 0; engine.exportPaused = false;
    $('btn-export').disabled = true; $('btn-play').disabled = true;
    $('export-progress').classList.remove('hidden'); $('export-bar').style.width = '0%';

    let rec = null, seqErr = null, masterBlob = null;
    try {
      // Prefer MediaRecorder: its canvas and audio tracks share the same real-time
      // clock. The old WebCodecs path is retained only as a compatibility fallback.
      try { rec = startMediaRecorderPath(masterProfile); } catch (_) { rec = null; }
      if (!rec) rec = await startWebCodecsRecorder(masterProfile);
      if (!rec) throw new Error('No supported synchronized recorder is available in this browser.');
      $('export-status').textContent = highRes
        ? `Pass 1/2 · creating synchronized 1080p master · 30fps · ${rec.label}`
        : `Exporting ${quality} · ${requested.width}×${requested.height} · ${requested.fps || 30}fps · ${rec.label}`;
      await runSequence((i, n) => {
        const pct = Math.round((i / Math.max(1,n)) * (highRes ? 50 : 100));
        $('export-bar').style.width = pct + '%';
      });
    } catch (e) { seqErr = e; }

    try { if (rec) masterBlob = await rec.stop(); } catch (e) { seqErr = seqErr || e; }
    engine.running = false; engine.recording = false; engine.exportPaused = false;
    engine.exportProfile = null; engine.exportFrameReady = false;

    let finalBlob = masterBlob, finalExt = rec ? rec.ext : 'mp4';
    if (!seqErr && !engine.stopFlag && highRes && masterBlob && masterBlob.size) {
      try {
        $('export-bar').style.width = '50%';
        const scaled = await upscaleSyncedMaster(masterBlob, requested, quality);
        finalBlob = scaled.blob; finalExt = scaled.ext;
      } catch (e) { seqErr = e; }
    }

    $('btn-export').disabled = false; $('btn-play').disabled = false;
    if (seqErr) {
      $('export-status').textContent = 'Export error: ' + (seqErr.message || seqErr) + (highRes && masterBlob && masterBlob.size ? ' · Your synchronized master was created correctly; this device may not support the selected high-res encoder.' : '');
    } else if (!engine.stopFlag && finalBlob && finalBlob.size > 0) {
      $('export-bar').style.width = '100%';
      const a = document.createElement('a'), href = URL.createObjectURL(finalBlob);
      a.href = href;
      const base = state.title.replace(/[^\w]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'ranking';
      a.download = `${base}-${quality}.${finalExt}`; a.click();
      setTimeout(() => URL.revokeObjectURL(href), 60_000);
      $('export-status').textContent = `Saved ${quality} · ${requested.width}×${requested.height} · ${requested.fps || 30}fps · synchronized audio/video master · ${(finalBlob.size / 1e6).toFixed(1)} MB .${finalExt}`;
    }
    renderStatic();
  }
'''

s = s[:start] + new_block + s[end:]
p.write_text(s, encoding='utf-8')

ip = Path('index.html')
h = ip.read_text(encoding='utf-8')
needle = '<p class="hint" id="export-status"></p>'
if needle in h and 'two-pass synchronized master' not in h:
    h = h.replace(needle, '<p class="hint" style="margin-top:6px">2K / 4K / 8K use a two-pass synchronized master for correct speed and audio sync. High-res export takes roughly 2× the video length.</p>\n        ' + needle)
    ip.write_text(h, encoding='utf-8')
