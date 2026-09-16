/* Free Local AI enhancer bridge.
 * Connects the web editor to local_ai_server.py on the creator's own PC.
 * No paid API or cloud key is required. Neural super-resolution is used when
 * Real-ESRGAN ncnn-vulkan is installed locally; otherwise the server reports
 * that it is using the FFmpeg fallback instead of pretending it is AI.
 */
(() => {
  "use strict";

  const BASE = "http://127.0.0.1:8765";
  const $ = (id) => document.getElementById(id);
  let lastOutputUrl = "";
  let lastOutputName = "enhanced-clip.mp4";

  function setStatus(text, tone = "") {
    const el = $("local-ai-status");
    if (!el) return;
    el.textContent = text;
    el.style.color = tone === "good" ? "#7ee7b5" : tone === "bad" ? "#ff8b8b" : "";
  }

  function setBusy(busy) {
    const b = $("btn-local-ai-enhance");
    if (b) b.disabled = busy;
    const c = $("btn-local-ai-check");
    if (c) c.disabled = busy;
  }

  async function checkEngine(silent = false) {
    try {
      const r = await fetch(BASE + "/health", { cache: "no-store" });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const d = await r.json();
      const neural = !!d.realesrgan;
      const msg = neural
        ? `✓ Local AI ready · Real-ESRGAN GPU engine found${d.ffmpeg ? " · FFmpeg ready" : ""}`
        : `Local helper connected, but Real-ESRGAN was not found. Enhancement will use the FFmpeg fallback until the free GPU engine is installed.`;
      setStatus(msg, neural ? "good" : "");
      return d;
    } catch (e) {
      if (!silent) setStatus("Local AI is offline. Run: python local_ai_server.py", "bad");
      return null;
    }
  }

  function currentSettings() {
    return {
      tier: $("local-ai-tier")?.value || "pro",
      content: $("local-ai-content")?.value || "auto",
      scale: $("local-ai-scale")?.value || "2",
      fps60: !!$("local-ai-60")?.checked,
    };
  }

  async function enhanceCurrentClip() {
    const bridge = window.RankingAppBridge;
    if (!bridge || typeof bridge.getCurrentClipFile !== "function") {
      setStatus("Editor bridge is not ready. Refresh the page once the latest deployment is live.", "bad");
      return;
    }
    const file = await bridge.getCurrentClipFile();
    if (!file) {
      setStatus("Add/select a video clip first, then run Local AI Enhance.", "bad");
      return;
    }

    const health = await checkEngine(true);
    if (!health) {
      setStatus("Local AI is offline. Start local_ai_server.py on this PC first.", "bad");
      return;
    }

    const s = currentSettings();
    const q = new URLSearchParams({
      tier: s.tier,
      content: s.content,
      scale: s.scale,
      fps: s.fps60 ? "60" : "original",
    });
    setBusy(true);
    setStatus(`${s.tier === "max" ? "Local AI Max" : "Local AI Pro"} is processing on your PC… keep this tab open.`);
    try {
      const r = await fetch(`${BASE}/enhance?${q}`, {
        method: "POST",
        headers: {
          "Content-Type": file.type || "video/mp4",
          "X-Filename": encodeURIComponent(file.name || "clip.mp4"),
        },
        body: file,
      });
      if (!r.ok) {
        let detail = "";
        try { detail = (await r.json()).error || ""; } catch (_) { detail = await r.text().catch(() => ""); }
        throw new Error(detail || `Local AI HTTP ${r.status}`);
      }
      const blob = await r.blob();
      if (!blob.size) throw new Error("Local enhancer returned an empty video.");
      const engine = r.headers.get("X-Enhancer-Engine") || "local enhancer";
      const suffix = s.fps60 ? "-60fps" : "";
      lastOutputName = `${(file.name || "clip").replace(/\.[^.]+$/, "")}-ai-${s.scale}x${suffix}.mp4`;
      const out = new File([blob], lastOutputName, { type: blob.type || "video/mp4" });
      await bridge.replaceCurrentClip(out, `${file.name || "clip"} · Local AI ${s.scale}×`);

      if (lastOutputUrl) URL.revokeObjectURL(lastOutputUrl);
      lastOutputUrl = URL.createObjectURL(blob);
      const dl = $("btn-local-ai-download");
      if (dl) dl.classList.remove("hidden");
      setStatus(`✓ Enhanced clip replaced in the editor · ${engine} · ${s.scale}×${s.fps60 ? " · 60 FPS" : ""}.`, "good");
    } catch (e) {
      setStatus("Enhancement failed: " + (e && e.message ? e.message : e), "bad");
    } finally {
      setBusy(false);
    }
  }

  function downloadLast() {
    if (!lastOutputUrl) return;
    const a = document.createElement("a");
    a.href = lastOutputUrl;
    a.download = lastOutputName;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function injectUi() {
    if ($("panel-local-ai")) return;
    const exp = $("panel-export");
    if (!exp) return;
    const sec = document.createElement("section");
    sec.className = "panel editor-only collapsed";
    sec.id = "panel-local-ai";
    sec.innerHTML = `
      <button type="button" class="panel-head">
        <span class="panel-badge">🧠</span>
        <span class="panel-name">Local AI Enhance · FREE</span>
        <span class="chev">▾</span>
      </button>
      <div class="panel-body">
        <p class="hint" style="margin-top:0">Runs on your own PC — no Topaz key, no paid API and no per-video credits. Real neural upscale is enabled when the free Real-ESRGAN GPU engine is installed locally.</p>
        <div class="row compact-row">
          <label class="mini-field">Enhancer
            <select id="local-ai-tier"><option value="pro" selected>Local AI Pro</option><option value="max">Local AI Max</option></select>
          </label>
          <label class="mini-field">Content
            <select id="local-ai-content">
              <option value="auto" selected>Auto</option>
              <option value="real">Real footage</option>
              <option value="cartoon">Cartoon / animation</option>
              <option value="faces">Faces · gentle detail</option>
              <option value="compressed">Old / compressed</option>
            </select>
          </label>
          <label class="mini-field">AI upscale
            <select id="local-ai-scale"><option value="2" selected>2×</option><option value="4">4× · can reach 4K/8K from good sources</option></select>
          </label>
        </div>
        <div class="row compact-row" style="margin-top:10px">
          <label class="check-field"><input type="checkbox" id="local-ai-60"> Smooth motion to 60 FPS <span class="soft">(very heavy)</span></label>
        </div>
        <div class="row compact-row" style="margin-top:10px">
          <button class="btn btn-primary btn-small" id="btn-local-ai-enhance">🧠 Enhance current clip</button>
          <button class="btn btn-ghost btn-small" id="btn-local-ai-check">Check local AI</button>
          <button class="btn btn-ghost btn-small hidden" id="btn-local-ai-download">⬇ Download enhanced clip</button>
        </div>
        <p class="hint" id="local-ai-status">Checking local AI…</p>
        <p class="hint" style="margin-bottom:0"><b>Pro</b> uses conservative cleanup + neural upscale. <b>Max</b> uses stronger restoration and a slower final encode. This is a free local alternative, not Topaz's proprietary model, so identical Topaz results are not guaranteed.</p>
      </div>`;
    exp.parentElement.insertBefore(sec, exp);

    $("btn-local-ai-check")?.addEventListener("click", () => checkEngine(false));
    $("btn-local-ai-enhance")?.addEventListener("click", enhanceCurrentClip);
    $("btn-local-ai-download")?.addEventListener("click", downloadLast);
    checkEngine(true).then((d) => { if (!d) setStatus("Local AI is offline. Run: python local_ai_server.py", "bad"); });
  }

  window.addEventListener("DOMContentLoaded", injectUi);
})();
