/* Social-first enhancement for the hosted Ranking Shorts Maker.
 * Loaded before app.js; installs UI/event hooks after DOMContentLoaded.
 * Public Instagram/TikTok discovery is best-effort and never bypasses login
 * or private content. Imported social clips are NOT license-cleared.
 */
(() => {
  "use strict";

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const usedSocialUrls = new Set();
  let bypassFind = false;
  let bypassFull = false;
  let busy = false;

  async function jsonFetch(url, options) {
    const r = await fetch(url, options);
    let body = null;
    try { body = await r.json(); } catch (_) {}
    if (!r.ok) throw new Error((body && body.error) || `HTTP ${r.status}`);
    return body || {};
  }

  function titleText() {
    const t = document.getElementById("inp-title");
    return (t && t.value || "").trim();
  }

  function labelTexts() {
    const list = document.getElementById("ranks-list");
    if (!list) return [];
    return [...list.querySelectorAll('input[type="text"]')]
      .map((x) => (x.value || "").trim())
      .filter((x) => x.length < 120);
  }

  function note(text, tone) {
    const el = document.getElementById("social-note");
    if (!el) return;
    el.textContent = text;
    el.style.color = tone === "bad" ? "#ff8b8b" : tone === "good" ? "#7ee7b5" : "";
  }

  async function socialSearch(source, query) {
    const u = `/social/search?source=${encodeURIComponent(source)}&q=${encodeURIComponent(query)}&max=10`;
    const data = await jsonFetch(u);
    return data.results || [];
  }

  async function importSocialHit(hit, rankNo) {
    const info = await jsonFetch("/media/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: hit.url }),
    });
    const media = await fetch(info.url);
    if (!media.ok) throw new Error(`media HTTP ${media.status}`);
    const blob = await media.blob();
    const source = hit.source || "social";
    return new File([blob], `${source}-rank-${rankNo}-${Date.now()}.mp4`, { type: blob.type || "video/mp4" });
  }

  async function oneRank(rankIndex, sources, topic, labels) {
    const label = labels[rankIndex] || "";
    const query = [topic, label].filter(Boolean).join(" ").trim() || topic;
    for (const source of sources) {
      let results = [];
      try {
        note(`Rank #${rankIndex + 1}: searching ${source === "instagram" ? "Instagram" : "TikTok"}…`);
        results = await socialSearch(source, query);
      } catch (_) { continue; }
      for (const hit of results) {
        if (!hit || !hit.url || usedSocialUrls.has(hit.url)) continue;
        usedSocialUrls.add(hit.url);
        try {
          note(`Rank #${rankIndex + 1}: importing ${source === "instagram" ? "Instagram" : "TikTok"} clip…`);
          return await importSocialHit(hit, rankIndex + 1);
        } catch (_) {}
      }
    }
    return null;
  }

  async function socialFirst(mode) {
    const topic = titleText();
    if (!topic) return 0;
    const n = Math.max(1, Number(document.getElementById("inp-numranks")?.value || 1));
    const labels = labelTexts();
    const sources = mode === "instagram" ? ["instagram"] : mode === "tiktok" ? ["tiktok"] : ["instagram", "tiktok"];
    usedSocialUrls.clear();
    note(`Social-first search started: ${sources.map((s) => s === "instagram" ? "Instagram" : "TikTok").join(" → ")}…`);

    const results = new Array(n).fill(null);
    let next = 0;
    async function worker() {
      while (true) {
        const i = next++;
        if (i >= n) return;
        results[i] = await oneRank(i, sources, topic, labels);
      }
    }
    await Promise.all([worker(), worker()]);
    const files = results.filter(Boolean);
    if (!files.length) {
      note("No public Instagram/TikTok clip could be imported. Auto mode will continue with YouTube/stock.", "bad");
      return 0;
    }

    const dz = document.getElementById("dropzone");
    if (!dz || typeof DataTransfer === "undefined") {
      note("Social clips were found, but this browser could not hand them to the editor.", "bad");
      return 0;
    }
    const dt = new DataTransfer();
    files.forEach((f) => dt.items.add(f));
    dz.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: dt }));
    note(`✓ Imported ${files.length} public social clip(s) first. ⚠ They are not license-cleared; use only footage you have rights to use.`, "good");
    await sleep(250);
    return files.length;
  }

  function selectedMode() {
    return document.getElementById("inp-clip-source")?.value || "auto";
  }

  function fireOriginal(button, which) {
    if (which === "find") bypassFind = true;
    else bypassFull = true;
    try { button.click(); }
    finally {
      setTimeout(() => {
        if (which === "find") bypassFind = false;
        else bypassFull = false;
      }, 0);
    }
  }

  async function waitForConcept() {
    const auto = document.getElementById("btn-autogen");
    if (!auto) return;
    auto.click();
    const start = Date.now();
    while (Date.now() - start < 6000) {
      await sleep(180);
      if (!auto.disabled && titleText()) break;
    }
  }

  function installUi() {
    const find = document.getElementById("btn-find-clips");
    const link = document.getElementById("btn-link-clip");
    if (!find || !link || document.getElementById("inp-clip-source")) return;

    find.title = "Search Instagram first, then TikTok, then YouTube Creative Commons and stock";
    const picker = document.createElement("label");
    picker.className = "mini-field source-picker";
    picker.style.minWidth = "190px";
    picker.innerHTML = `Sources
      <select id="inp-clip-source">
        <option value="auto" selected>Auto · IG → TikTok → YouTube → Stock</option>
        <option value="instagram">Instagram only</option>
        <option value="tiktok">TikTok only</option>
        <option value="youtube">YouTube / stock</option>
      </select>`;
    link.parentElement.appendChild(picker);

    const social = document.createElement("p");
    social.className = "hint";
    social.id = "social-note";
    social.style.marginTop = "0";
    social.textContent = "Auto mode tries public Instagram first, then TikTok, then the existing YouTube/stock fallback. Social clips are not license-cleared.";
    const yt = document.getElementById("yt-note");
    (yt?.parentElement || link.parentElement.parentElement).insertBefore(social, yt?.nextSibling || null);
  }

  function installHooks() {
    const find = document.getElementById("btn-find-clips");
    const full = document.getElementById("btn-fullgen");
    if (find) find.addEventListener("click", async (e) => {
      if (bypassFind) return;
      const mode = selectedMode();
      if (mode === "youtube") return;
      e.preventDefault(); e.stopImmediatePropagation();
      if (busy) return;
      busy = true; find.disabled = true;
      try {
        await socialFirst(mode);
        if (mode === "auto") fireOriginal(find, "find");
      } finally {
        find.disabled = false; busy = false;
      }
    }, true);

    if (full) full.addEventListener("click", async (e) => {
      if (bypassFull) return;
      const mode = selectedMode();
      if (mode === "youtube") return;
      e.preventDefault(); e.stopImmediatePropagation();
      if (busy) return;
      busy = true; full.disabled = true;
      try {
        if (!titleText()) await waitForConcept();
        await socialFirst(mode);
        if (mode === "auto") fireOriginal(full, "full");
        else {
          await waitForConcept();
          note("Social-only generation finished. Missing ranks keep animated backgrounds.", "good");
        }
      } finally {
        full.disabled = false; busy = false;
      }
    }, true);
  }

  window.addEventListener("DOMContentLoaded", () => {
    installUi();
    installHooks();
  });
})();


/* Ranking video enhancement module v1
 * Local GPU-assisted cleanup/sharpen/color enhancement for preview + export.
 * This improves perceived quality but cannot recreate detail missing from the source.
 */
(() => {
  "use strict";

  const KEY = "ranking_video_enhancement_v1";
  const DEFAULTS = {
    enabled: false,
    preset: "light",
    denoise: true,
    sharpen: true,
    deblock: true,
    colorBoost: true,
    hqUpscale: true,
    preserveDetail: true,
    smooth60: false,
  };
  let settings = load();
  let settingsVersion = 1;

  function load() {
    try { return Object.assign({}, DEFAULTS, JSON.parse(localStorage.getItem(KEY) || "{}")); }
    catch (_) { return { ...DEFAULTS }; }
  }
  function save() {
    settingsVersion++;
    try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch (_) {}
    requestRedraw();
    syncStatus();
  }
  function requestRedraw() {
    const el = document.getElementById("inp-side-size");
    if (el) el.dispatchEvent(new Event("input", { bubbles: true }));
  }
  function active() { return !!settings.enabled && settings.preset !== "off"; }

  // ------------------------------- GPU video-frame processor (WebGL)
  const processors = new WeakMap();
  class GpuProcessor {
    constructor(video) {
      this.video = video;
      this.canvas = document.createElement("canvas");
      this.gl = this.canvas.getContext("webgl", { alpha:false, antialias:false, preserveDrawingBuffer:false });
      this.failed = !this.gl;
      this.lastTime = -999;
      this.lastKey = "";
      if (!this.failed) this.init();
    }
    shader(type, src) {
      const gl = this.gl, sh = gl.createShader(type);
      gl.shaderSource(sh, src); gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) || "shader compile failed");
      return sh;
    }
    init() {
      try {
        const gl = this.gl;
        const vs = this.shader(gl.VERTEX_SHADER, `
          attribute vec2 aPos;
          varying vec2 vUv;
          void main(){
            gl_Position = vec4(aPos,0.0,1.0);
            vUv = vec2((aPos.x+1.0)*0.5, 1.0-(aPos.y+1.0)*0.5);
          }`);
        const fs = this.shader(gl.FRAGMENT_SHADER, `
          precision mediump float;
          uniform sampler2D uTex;
          uniform vec2 uTexel;
          uniform float uDenoise;
          uniform float uSharpen;
          uniform float uDeblock;
          uniform float uContrast;
          uniform float uSaturation;
          uniform float uBrightness;
          varying vec2 vUv;
          void main(){
            vec3 c = texture2D(uTex,vUv).rgb;
            vec3 l = texture2D(uTex,vUv-vec2(uTexel.x,0.0)).rgb;
            vec3 r = texture2D(uTex,vUv+vec2(uTexel.x,0.0)).rgb;
            vec3 u = texture2D(uTex,vUv-vec2(0.0,uTexel.y)).rgb;
            vec3 d = texture2D(uTex,vUv+vec2(0.0,uTexel.y)).rgb;
            vec3 avg = (l+r+u+d)*0.25;
            vec3 cleaned = mix(c, avg, clamp(uDenoise + uDeblock*0.35, 0.0, 0.34));
            vec3 sharp = cleaned + (cleaned-avg) * uSharpen * 1.8;
            vec3 col = mix(cleaned, sharp, clamp(uSharpen,0.0,0.65));
            float y = dot(col, vec3(0.2126,0.7152,0.0722));
            col = mix(vec3(y), col, uSaturation);
            col = (col-0.5)*uContrast+0.5;
            col *= uBrightness;
            gl_FragColor = vec4(clamp(col,0.0,1.0),1.0);
          }`);
        const prog = gl.createProgram();
        gl.attachShader(prog,vs); gl.attachShader(prog,fs); gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog,gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog)||"shader link failed");
        gl.useProgram(prog);
        const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER,buf);
        gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]),gl.STATIC_DRAW);
        const loc = gl.getAttribLocation(prog,"aPos"); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc,2,gl.FLOAT,false,0,0);
        this.program = prog;
        this.tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D,this.tex);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
        this.u = {};
        ["uTex","uTexel","uDenoise","uSharpen","uDeblock","uContrast","uSaturation","uBrightness"].forEach(n=>this.u[n]=gl.getUniformLocation(prog,n));
        gl.uniform1i(this.u.uTex,0);
      } catch (_) { this.failed = true; }
    }
    params() {
      const p = settings.preset;
      const base = p === "ai" ? {dn:.18,sh:.44,db:.14,ct:1.075,sa:1.11,br:1.005}
        : p === "strong" ? {dn:.13,sh:.32,db:.10,ct:1.055,sa:1.08,br:1.005}
        : {dn:.07,sh:.20,db:.05,ct:1.03,sa:1.045,br:1.0};
      if (!settings.denoise) base.dn = 0;
      if (!settings.sharpen) base.sh = 0;
      if (!settings.deblock) base.db = 0;
      if (!settings.colorBoost) { base.ct=1; base.sa=1; base.br=1; }
      if (settings.preserveDetail) { base.dn *= .65; base.db *= .7; base.sh *= .92; }
      return base;
    }
    desiredSize(targetCanvas) {
      const v = this.video, vw=v.videoWidth||2, vh=v.videoHeight||2;
      let scale = 1;
      if (settings.hqUpscale) scale = settings.preset === "ai" ? 2 : settings.preset === "strong" ? 1.5 : 1.2;
      const targetMax = Math.max(targetCanvas?.width||1920, targetCanvas?.height||1920);
      const presetCap = settings.preset === "ai" ? 3840 : settings.preset === "strong" ? 2560 : 1920;
      const glCap = this.gl ? this.gl.getParameter(this.gl.MAX_TEXTURE_SIZE) : 2048;
      const cap = Math.max(720, Math.min(targetMax, presetCap, glCap));
      scale = Math.min(scale, cap / Math.max(vw,vh));
      scale = Math.max(1, scale);
      return [Math.max(2,Math.round(vw*scale)), Math.max(2,Math.round(vh*scale))];
    }
    frame(targetCanvas) {
      if (this.failed || !this.video.videoWidth || this.video.readyState < 2) return null;
      const [w,h] = this.desiredSize(targetCanvas);
      const key = `${settingsVersion}|${settings.preset}|${w}x${h}`;
      const t = Number(this.video.currentTime)||0;
      if (this.lastKey === key && Math.abs(this.lastTime-t) < .002) return this.canvas;
      try {
        if (this.canvas.width!==w || this.canvas.height!==h) { this.canvas.width=w; this.canvas.height=h; }
        const gl=this.gl; gl.viewport(0,0,w,h); gl.useProgram(this.program); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D,this.tex);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
        gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,this.video);
        const p=this.params();
        gl.uniform2f(this.u.uTexel,1/Math.max(1,this.video.videoWidth),1/Math.max(1,this.video.videoHeight));
        gl.uniform1f(this.u.uDenoise,p.dn); gl.uniform1f(this.u.uSharpen,p.sh); gl.uniform1f(this.u.uDeblock,p.db);
        gl.uniform1f(this.u.uContrast,p.ct); gl.uniform1f(this.u.uSaturation,p.sa); gl.uniform1f(this.u.uBrightness,p.br);
        gl.drawArrays(gl.TRIANGLES,0,6);
        this.lastTime=t; this.lastKey=key;
        return this.canvas;
      } catch (_) { this.failed=true; return null; }
    }
  }

  const originalDrawImage = CanvasRenderingContext2D.prototype.drawImage;
  CanvasRenderingContext2D.prototype.drawImage = function(...args) {
    const src = args[0];
    if (!active() || !(src instanceof HTMLVideoElement)) return originalDrawImage.apply(this,args);
    const prevSmooth=this.imageSmoothingEnabled, prevQuality=this.imageSmoothingQuality;
    if (settings.hqUpscale) { this.imageSmoothingEnabled=true; try{this.imageSmoothingQuality="high";}catch(_){} }
    let proc=processors.get(src); if(!proc){proc=new GpuProcessor(src);processors.set(src,proc);}
    const out=proc.frame(this.canvas);
    if (!out) {
      const oldFilter=this.filter;
      if (settings.colorBoost) this.filter = `${oldFilter&&oldFilter!=="none"?oldFilter+" ":""}contrast(1.04) saturate(1.06)`;
      try { return originalDrawImage.apply(this,args); }
      finally { this.filter=oldFilter; this.imageSmoothingEnabled=prevSmooth; try{this.imageSmoothingQuality=prevQuality;}catch(_){} }
    }
    const next=args.slice(); next[0]=out;
    if (args.length===9 && (out.width!==src.videoWidth || out.height!==src.videoHeight)) {
      const sx=out.width/src.videoWidth, sy=out.height/src.videoHeight;
      next[1]*=sx; next[2]*=sy; next[3]*=sx; next[4]*=sy;
    }
    try { return originalDrawImage.apply(this,next); }
    finally { this.imageSmoothingEnabled=prevSmooth; try{this.imageSmoothingQuality=prevQuality;}catch(_){} }
  };

  // MediaRecorder/captureStream path can request 60fps. WebCodecs exports keep
  // their own deterministic timing, so this option is intentionally browser-dependent.
  if (HTMLCanvasElement.prototype.captureStream) {
    const originalCapture = HTMLCanvasElement.prototype.captureStream;
    HTMLCanvasElement.prototype.captureStream = function(rate) {
      const fps = active() && settings.smooth60 ? 60 : rate;
      return fps == null ? originalCapture.call(this) : originalCapture.call(this,fps);
    };
  }

  // ------------------------------- clean UI, inserted just above Export
  function presetDefaults(name) {
    if (name === "off") return { enabled:false };
    if (name === "light") return { enabled:true,denoise:true,sharpen:true,deblock:false,colorBoost:true,hqUpscale:true,preserveDetail:true };
    if (name === "strong") return { enabled:true,denoise:true,sharpen:true,deblock:true,colorBoost:true,hqUpscale:true,preserveDetail:true };
    return { enabled:true,denoise:true,sharpen:true,deblock:true,colorBoost:true,hqUpscale:true,preserveDetail:false };
  }
  function applyPreset(name) { settings.preset=name; Object.assign(settings,presetDefaults(name)); save(); syncUi(); }
  function syncStatus() {
    const el=document.getElementById("enhance-status"); if(!el)return;
    if(!active()) { el.textContent="Off — source video is rendered unchanged."; return; }
    const name=settings.preset==="ai"?"GPU Enhance":settings.preset[0].toUpperCase()+settings.preset.slice(1);
    el.textContent=`${name} active · high-quality scaling ${settings.hqUpscale?"on":"off"}${settings.smooth60?" · 60 FPS requested where supported":""}.`;
  }
  function syncUi() {
    const setCheck=(id,v)=>{const e=document.getElementById(id);if(e)e.checked=!!v;};
    const p=document.getElementById("enhance-preset"); if(p)p.value=settings.enabled?settings.preset:"off";
    setCheck("enhance-enabled",settings.enabled); setCheck("enhance-denoise",settings.denoise); setCheck("enhance-sharpen",settings.sharpen);
    setCheck("enhance-deblock",settings.deblock); setCheck("enhance-color",settings.colorBoost); setCheck("enhance-upscale",settings.hqUpscale);
    setCheck("enhance-preserve",settings.preserveDetail); setCheck("enhance-60",settings.smooth60); syncStatus();
  }
  function injectUi() {
    if(document.getElementById("panel-enhancement")) return;
    const exp=document.getElementById("panel-export"); if(!exp)return;
    const sec=document.createElement("section"); sec.className="panel editor-only collapsed"; sec.id="panel-enhancement";
    sec.innerHTML=`
      <button type="button" class="panel-head"><span class="panel-badge">✨</span><span class="panel-name">Video enhancement</span><span class="chev">▾</span></button>
      <div class="panel-body">
        <label class="field check-field"><input type="checkbox" id="enhance-enabled"> Enhance video quality</label>
        <div class="row compact-row">
          <label class="mini-field">Preset
            <select id="enhance-preset">
              <option value="off">Off</option><option value="light">Light · recommended</option><option value="strong">Strong · compressed clips</option><option value="ai">GPU Enhance · maximum</option>
            </select>
          </label>
        </div>
        <div class="enhance-grid">
          <label class="check-field"><input type="checkbox" id="enhance-denoise"> Denoise</label>
          <label class="check-field"><input type="checkbox" id="enhance-sharpen"> Sharpen/detail boost</label>
          <label class="check-field"><input type="checkbox" id="enhance-deblock"> Reduce compression/blockiness</label>
          <label class="check-field"><input type="checkbox" id="enhance-color"> Improve color & contrast</label>
          <label class="check-field"><input type="checkbox" id="enhance-upscale"> High-quality upscale</label>
          <label class="check-field"><input type="checkbox" id="enhance-preserve"> Preserve original detail</label>
          <label class="check-field"><input type="checkbox" id="enhance-60"> Smooth 60 FPS <span class="soft">(browser-dependent)</span></label>
        </div>
        <p class="hint" id="enhance-status"></p>
        <p class="hint" style="margin-bottom:0">Light is best for clean 1080p clips. Strong helps compressed social clips. GPU Enhance uses local GPU processing and stronger upscale/sharpen; it cannot recreate detail that never existed in the source.</p>
      </div>`;
    exp.parentElement.insertBefore(sec,exp);
    const style=document.createElement("style"); style.textContent=`
      #panel-enhancement .enhance-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px 14px;margin-top:10px}
      #panel-enhancement .panel-badge{font-size:14px}
      @media(max-width:760px){#panel-enhancement .enhance-grid{grid-template-columns:1fr}}
    `; document.head.appendChild(style);
    sec.querySelector(".panel-head").addEventListener("click",()=>sec.classList.toggle("collapsed"));
    document.getElementById("enhance-enabled").addEventListener("change",e=>{settings.enabled=e.target.checked;if(settings.enabled&&settings.preset==="off")settings.preset="light";save();syncUi();});
    document.getElementById("enhance-preset").addEventListener("change",e=>applyPreset(e.target.value));
    const wires={"enhance-denoise":"denoise","enhance-sharpen":"sharpen","enhance-deblock":"deblock","enhance-color":"colorBoost","enhance-upscale":"hqUpscale","enhance-preserve":"preserveDetail","enhance-60":"smooth60"};
    Object.entries(wires).forEach(([id,key])=>document.getElementById(id).addEventListener("change",e=>{settings[key]=e.target.checked;save();}));
    syncUi();
  }

  window.RankingVideoEnhancement={ get settings(){return {...settings};}, setPreset:applyPreset };
  window.addEventListener("DOMContentLoaded",injectUi);
})();
