from pathlib import Path

APP = Path("app.js")
s = APP.read_text(encoding="utf-8")

if "ROBUST_EXPORT_AUDIO_V2" in s:
    raise SystemExit("robust export audio v2 already applied")

def rep(old, new, label):
    global s
    if old not in s:
        raise SystemExit("missing patch target: " + label)
    s = s.replace(old, new, 1)

# Mark the patch near the export section and add a fresh per-export audio destination.
needle = '''  // ---------------------------------------------------------------- export
  // Priority: 1) WebCodecs H.264 (+AAC if supported) muxed to real .mp4 by'''
if needle not in s:
    raise SystemExit("missing export section marker")

insert = '''  // ROBUST_EXPORT_AUDIO_V2
  // A MediaStreamDestination owns a live audio track. Older exports added that
  // SAME track to the recorder stream and then stopped every stream track,
  // permanently ending the shared audio track. The next export could therefore
  // be silent. Build a fresh destination before every export and only ever give
  // MediaRecorder a clone of its track.
  function rebuildExportAudioDestination() {
    if (!audioCtx || !audioSource || !musicGain || !sfxGain || !customSfxGain) return;
    if (audioDest) {
      for (const node of [audioSource, musicGain, sfxGain, customSfxGain]) {
        try { node.disconnect(audioDest); } catch (_) {}
      }
      try { audioDest.stream.getTracks().forEach((t) => t.stop()); } catch (_) {}
    }
    audioDest = audioCtx.createMediaStreamDestination();
    audioSource.connect(audioDest);
    musicGain.connect(audioDest);
    sfxGain.connect(audioDest);
    customSfxGain.connect(audioDest);
  }

'''
s = s.replace(needle, insert + needle, 1)

# Stable master/final bitrates: enough for Shorts while reducing encoder pressure.
rep(
'''    "8K":    { width: 4320, height: 7680, videoBitrate: 52_000_000, codec: "avc1.64003e", fps: 24, renderFps: 24 },
    "4K":    { width: 2160, height: 3840, videoBitrate: 30_000_000, codec: "avc1.640033", fps: 30, renderFps: 30 },
    "2K":    { width: 1440, height: 2560, videoBitrate: 18_000_000, codec: "avc1.640032", fps: 30, renderFps: 30 },''',
'''    "8K":    { width: 4320, height: 7680, videoBitrate: 42_000_000, codec: "avc1.64003e", fps: 24, renderFps: 24 },
    "4K":    { width: 2160, height: 3840, videoBitrate: 26_000_000, codec: "avc1.640033", fps: 30, renderFps: 30 },
    "2K":    { width: 1440, height: 2560, videoBitrate: 16_000_000, codec: "avc1.640032", fps: 30, renderFps: 30 },''',
"high-res bitrates")

# MediaRecorder pass: clone the audio track and never stop the shared destination.
old = '''  function startMediaRecorderPath(profile) {
    if (!window.MediaRecorder) throw new Error("This browser does not support MediaRecorder.");
    copyEditorFrameToExportCanvas(profile);
    const stream = exportCanvas.captureStream(profile.fps || 30);
    audioDest.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
    const candidates = [
      ['video/mp4;codecs="avc1.42E01E,mp4a.40.2"', "mp4"], ["video/mp4", "mp4"],
      ["video/webm;codecs=vp9,opus", "webm"], ["video/webm;codecs=vp8,opus", "webm"], ["video/webm", "webm"],
    ];
    const found = candidates.find(([m]) => MediaRecorder.isTypeSupported(m)) || ["", "webm"];
    const ext = found[1];
    const opts = { videoBitsPerSecond: profile.videoBitrate };'''
new = '''  function startMediaRecorderPath(profile) {
    if (!window.MediaRecorder) throw new Error("This browser does not support MediaRecorder.");
    copyEditorFrameToExportCanvas(profile);
    const stream = exportCanvas.captureStream(profile.fps || 30);
    const sourceAudioTrack = audioDest && audioDest.stream.getAudioTracks().find((t) => t.readyState === "live");
    if (!sourceAudioTrack) {
      stream.getVideoTracks().forEach((t) => t.stop());
      throw new Error("Export audio track is not live.");
    }
    const exportAudioTrack = sourceAudioTrack.clone();
    stream.addTrack(exportAudioTrack);

    // WebM/Opus is substantially more reliable than Chrome's newer MP4
    // MediaRecorder path for long canvas + WebAudio captures. High-res exports
    // use it as an internal synchronized master; normal 1080p still prefers MP4.
    const webm = [
      ["video/webm;codecs=vp9,opus", "webm"], ["video/webm;codecs=vp8,opus", "webm"], ["video/webm", "webm"],
    ];
    const mp4 = [
      ['video/mp4;codecs="avc1.42E01E,mp4a.40.2"', "mp4"], ["video/mp4", "mp4"],
    ];
    const candidates = profile && profile.stableMaster ? [...webm, ...mp4] : [...mp4, ...webm];
    const found = candidates.find(([m]) => MediaRecorder.isTypeSupported(m)) || ["", "webm"];
    const ext = found[1];
    const opts = { videoBitsPerSecond: profile.videoBitrate, audioBitsPerSecond: 192_000 };'''
rep(old,new,"MediaRecorder setup")

rep(
'''        if (rec.state !== "inactive") rec.stop();
        await done; stream.getTracks().forEach((t) => t.stop());
        if (recError) throw recError;''',
'''        if (rec.state !== "inactive") rec.stop();
        await done;
        // Only stop tracks created for THIS recorder. Never stop audioDest's
        // shared source track, otherwise every later export becomes silent.
        stream.getVideoTracks().forEach((t) => t.stop());
        try { exportAudioTrack.stop(); } catch (_) {}
        if (recError) throw recError;''',
"MediaRecorder stop tracks")

# For 2K/4K/8K, prefer the mature WebM path in the second pass as well.
rep(
'''  function recorderFormatChoice(profile) {
    const preferWebm = profile && profile.width >= 4000;''',
'''  function recorderFormatChoice(profile) {
    const preferWebm = !!(profile && (profile.stableMaster || profile.width > 1080));''',
"high-res format preference")

rep(
'''    const opts = { videoBitsPerSecond: profile.videoBitrate };
    if (mime) opts.mimeType = mime;''',
'''    const opts = { videoBitsPerSecond: profile.videoBitrate, audioBitsPerSecond: 192_000 };
    if (mime) opts.mimeType = mime;''',
"pass2 audio bitrate")

# More encoder drain time at the end of pass 2 prevents truncated audio tails.
rep(
'''      await new Promise((r) => setTimeout(r, 150));''',
'''      await new Promise((r) => setTimeout(r, 350));''',
"pass2 tail flush")

# Every export gets a fresh live audio track. Await AudioContext resume, rather
# than starting the recorder while resume is still pending.
rep(
'''  async function exportVideo() {
    if (engine.running || engine.recording) return;
    ensureAudioGraph();
    const quality = $('export-quality') ? $('export-quality').value : '1080p';''',
'''  async function exportVideo() {
    if (engine.running || engine.recording) return;
    ensureAudioGraph();
    if (audioCtx && audioCtx.state === "suspended") await audioCtx.resume().catch(() => {});
    rebuildExportAudioDestination();
    await sleep(40);
    const quality = $('export-quality') ? $('export-quality').value : '1080p';''',
"fresh audio track per export")

rep(
'''      ? { ...EXPORT_PROFILES['1080p'], width:1080, height:1920, fps:30, renderFps:30, videoBitrate:12_000_000 }
      : requested;''',
'''      ? { ...EXPORT_PROFILES['1080p'], width:1080, height:1920, fps:30, renderFps:30, videoBitrate:12_000_000, stableMaster:true }
      : requested;''',
"stable highres master")

# Better status text so users know the high-res file intentionally uses the stable codec.
rep(
'''      $('export-status').textContent = `Saved ${quality} · ${requested.width}×${requested.height} · ${requested.fps || 30}fps · synchronized audio/video master · ${(finalBlob.size / 1e6).toFixed(1)} MB .${finalExt}`;''',
'''      $('export-status').textContent = `Saved ${quality} · ${requested.width}×${requested.height} · ${requested.fps || 30}fps · synchronized audio + video · stable ${finalExt.toUpperCase()} · ${(finalBlob.size / 1e6).toFixed(1)} MB`;''',
"saved status")

APP.write_text(s, encoding="utf-8")
print("robust repeated export + high-res audio sync patch applied")
