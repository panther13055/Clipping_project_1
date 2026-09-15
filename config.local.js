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
