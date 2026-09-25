from pathlib import Path

APP = Path("app.js")
CSS = Path("style.css")
s = APP.read_text(encoding="utf-8")
css = CSS.read_text(encoding="utf-8")

if "SAFE_SELECT_UI_V1" in s:
    raise SystemExit("safe select UI already installed")

marker = '''  // ------------------------------------------------------------------ init
  // Sync any browser-restored field values into state so the fields never'''
if marker not in s:
    raise SystemExit("init marker not found")

code = r'''  // SAFE_SELECT_UI_V1
  // Chromium/Windows can occasionally paint a native <select> popup as a huge
  // white compositor surface over dark, GPU-heavy pages. The editor has many
  // selects (setup, sourcing, text, premium colors, export, plus dynamic crop
  // and emoji selects), so use one consistent in-page picker instead of the
  // OS/native popup. The original <select> stays as the source of truth and all
  // existing change listeners keep working unchanged.
  const safeSelectUI = (() => {
    let menu = null, active = null, activeButton = null, outsideBound = false;

    function optionLabel(sel) {
      const opt = sel.options && sel.selectedIndex >= 0 ? sel.options[sel.selectedIndex] : null;
      return opt ? opt.textContent : "";
    }

    function syncOne(sel) {
      if (!sel || sel.dataset.safeSelect !== "1") return;
      const shell = sel.closest(".safe-select-shell");
      const btn = shell && shell.querySelector(".safe-select-button");
      if (!btn) return;
      const label = optionLabel(sel);
      if (btn.querySelector(".safe-select-value").textContent !== label) {
        btn.querySelector(".safe-select-value").textContent = label;
      }
      btn.disabled = !!sel.disabled;
      btn.setAttribute("aria-disabled", sel.disabled ? "true" : "false");
    }

    function close(refocus = false) {
      if (!menu) return;
      menu.classList.add("hidden");
      menu.replaceChildren();
      if (activeButton) activeButton.setAttribute("aria-expanded", "false");
      const btn = activeButton;
      active = null; activeButton = null;
      if (refocus && btn) btn.focus({ preventScroll: true });
    }

    function positionMenu(btn) {
      if (!menu || !btn) return;
      const r = btn.getBoundingClientRect();
      const gap = 6;
      const width = Math.min(Math.max(r.width, 180), Math.max(180, window.innerWidth - 16));
      menu.style.width = Math.round(width) + "px";
      menu.style.maxWidth = "calc(100vw - 16px)";
      menu.style.maxHeight = Math.min(320, Math.max(150, window.innerHeight - 24)) + "px";
      menu.style.left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8)) + "px";

      // Temporarily show to measure its real height, then pick above/below.
      menu.classList.remove("hidden");
      const mh = Math.min(menu.scrollHeight, parseFloat(menu.style.maxHeight) || 320);
      const below = window.innerHeight - r.bottom - gap;
      const above = r.top - gap;
      if (below >= Math.min(mh, 180) || below >= above) {
        menu.style.top = Math.min(window.innerHeight - mh - 8, r.bottom + gap) + "px";
      } else {
        menu.style.top = Math.max(8, r.top - mh - gap) + "px";
      }
    }

    function choose(sel, opt, btn) {
      if (!sel || !opt || opt.disabled) return;
      const old = sel.value;
      sel.value = opt.value;
      syncOne(sel);
      close(false);
      if (sel.value !== old) sel.dispatchEvent(new Event("change", { bubbles: true }));
      else sel.dispatchEvent(new Event("change", { bubbles: true }));
      btn.focus({ preventScroll: true });
    }

    function open(sel, btn, keyboardIndex = null) {
      if (!menu || !sel || sel.disabled) return;
      if (active === sel && !menu.classList.contains("hidden")) { close(true); return; }
      close(false);
      active = sel; activeButton = btn;
      btn.setAttribute("aria-expanded", "true");
      menu.replaceChildren();

      [...sel.options].forEach((opt, i) => {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "safe-select-option";
        item.dataset.index = String(i);
        item.setAttribute("role", "option");
        item.setAttribute("aria-selected", i === sel.selectedIndex ? "true" : "false");
        item.disabled = !!opt.disabled;
        if (i === sel.selectedIndex) item.classList.add("selected");
        const check = document.createElement("span");
        check.className = "safe-select-check";
        check.textContent = i === sel.selectedIndex ? "✓" : "";
        const text = document.createElement("span");
        text.className = "safe-select-option-text";
        text.textContent = opt.textContent;
        item.append(check, text);
        item.addEventListener("click", (e) => { e.preventDefault(); choose(sel, opt, btn); });
        menu.appendChild(item);
      });

      positionMenu(btn);
      const items = [...menu.querySelectorAll(".safe-select-option:not(:disabled)")];
      if (keyboardIndex != null && items.length) {
        const target = items[Math.max(0, Math.min(items.length - 1, keyboardIndex))];
        target.focus({ preventScroll: true });
      }
    }

    function enhance(sel) {
      if (!sel || sel.dataset.safeSelect === "1" || sel.multiple || Number(sel.size) > 1) return;
      if (!sel.parentNode) return;

      const shell = document.createElement("div");
      shell.className = "safe-select-shell";
      sel.parentNode.insertBefore(shell, sel);
      shell.appendChild(sel);
      sel.dataset.safeSelect = "1";
      sel.classList.add("safe-select-native");

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "safe-select-button";
      btn.setAttribute("aria-haspopup", "listbox");
      btn.setAttribute("aria-expanded", "false");
      const value = document.createElement("span");
      value.className = "safe-select-value";
      const arrow = document.createElement("span");
      arrow.className = "safe-select-arrow";
      arrow.setAttribute("aria-hidden", "true");
      arrow.textContent = "⌄";
      btn.append(value, arrow);
      shell.appendChild(btn);

      btn.addEventListener("click", (e) => { e.preventDefault(); open(sel, btn); });
      btn.addEventListener("keydown", (e) => {
        if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          const selected = Math.max(0, [...sel.options].filter((o) => !o.disabled).findIndex((o) => o === sel.options[sel.selectedIndex]));
          open(sel, btn, selected);
        }
      });
      sel.addEventListener("change", () => syncOne(sel));

      const mo = new MutationObserver(() => {
        syncOne(sel);
        if (active === sel && !menu.classList.contains("hidden")) open(sel, btn);
      });
      mo.observe(sel, { childList: true, subtree: true, attributes: true, attributeFilter: ["disabled", "label", "selected"] });
      syncOne(sel);
    }

    function scan(root = document) {
      if (root.matches && root.matches("select")) enhance(root);
      if (root.querySelectorAll) root.querySelectorAll("select").forEach(enhance);
    }

    function install() {
      if (document.getElementById("safe-select-menu")) return;
      menu = document.createElement("div");
      menu.id = "safe-select-menu";
      menu.className = "safe-select-menu hidden";
      menu.setAttribute("role", "listbox");
      document.body.appendChild(menu);

      scan(document);

      const obs = new MutationObserver((changes) => {
        for (const change of changes) {
          change.addedNodes.forEach((node) => {
            if (node && node.nodeType === 1) scan(node);
          });
        }
      });
      obs.observe(document.body, { childList: true, subtree: true });

      if (!outsideBound) {
        outsideBound = true;
        document.addEventListener("pointerdown", (e) => {
          if (menu && !menu.classList.contains("hidden") && !menu.contains(e.target) && !(activeButton && activeButton.contains(e.target))) close(false);
        }, true);
        document.addEventListener("keydown", (e) => {
          if (e.key === "Escape" && menu && !menu.classList.contains("hidden")) { e.preventDefault(); close(true); }
        });
        menu.addEventListener("keydown", (e) => {
          const items = [...menu.querySelectorAll(".safe-select-option:not(:disabled)")];
          const idx = items.indexOf(document.activeElement);
          if (e.key === "ArrowDown" && items.length) { e.preventDefault(); items[(idx + 1 + items.length) % items.length].focus(); }
          else if (e.key === "ArrowUp" && items.length) { e.preventDefault(); items[(idx - 1 + items.length) % items.length].focus(); }
          else if ((e.key === "Enter" || e.key === " ") && idx >= 0) { e.preventDefault(); items[idx].click(); }
          else if (e.key === "Home" && items.length) { e.preventDefault(); items[0].focus(); }
          else if (e.key === "End" && items.length) { e.preventDefault(); items[items.length - 1].focus(); }
        });
        window.addEventListener("resize", () => close(false), { passive: true });
        window.addEventListener("scroll", () => close(false), { passive: true, capture: true });
      }

      // Existing code sometimes assigns select.value programmatically (project
      // load, undo/redo, reset). Keep the visual button in sync without forcing
      // those code paths to know about this UI wrapper.
      setInterval(() => document.querySelectorAll('select[data-safe-select="1"]').forEach(syncOne), 500);
    }

    return { install, scan, syncOne, close };
  })();

'''
s = s.replace(marker, code + marker, 1)

# Install after initial UI/state has been restored, so button labels start right.
needle = '''  renderStatic();
  commitHistory(); // seed the undo history with the initial state
  detectHelper(); // async; enables YouTube-CC sourcing when server.py serves us'''
replacement = '''  renderStatic();
  safeSelectUI.install();
  commitHistory(); // seed the undo history with the initial state
  detectHelper(); // async; enables YouTube-CC sourcing when server.py serves us'''
if needle not in s:
    raise SystemExit("init install target not found")
s = s.replace(needle, replacement, 1)

APP.write_text(s, encoding="utf-8")

if "/* ---- safe custom selects ---- */" not in css:
    css += r'''

/* ---- safe custom selects ----
   Replaces native Chromium/Windows select popups, which can sometimes paint a
   giant white compositor rectangle over this dark GPU-heavy editor. */
html { color-scheme: dark; }
select option { background:#09111e; color:#dbeafe; }

.safe-select-shell {
  position: relative;
  display: block;
  width: 100%;
  min-width: 0;
}
.safe-select-native {
  position: absolute !important;
  width: 1px !important;
  height: 1px !important;
  min-width: 0 !important;
  padding: 0 !important;
  margin: 0 !important;
  opacity: 0 !important;
  pointer-events: none !important;
  clip: rect(0 0 0 0) !important;
  clip-path: inset(50%) !important;
  overflow: hidden !important;
}
.safe-select-button {
  width: 100%;
  min-width: 0;
  min-height: 40px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 9px 12px;
  border: 1px solid #253750;
  border-radius: 9px;
  background: #09111e;
  color: #dbeafe;
  font: inherit;
  font-size: 14px;
  line-height: 1.35;
  text-align: left;
  cursor: pointer;
  outline: none;
  transition: border-color .14s, box-shadow .14s, background .14s;
}
.safe-select-button:hover { border-color:#3a5578; background:#0b1627; }
.safe-select-button:focus-visible,
.safe-select-button[aria-expanded="true"] {
  border-color:#5bd6ff;
  box-shadow:0 0 0 3px rgba(91,214,255,.12);
}
.safe-select-button:disabled { opacity:.45; cursor:not-allowed; }
.safe-select-value {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.safe-select-arrow {
  flex: 0 0 auto;
  color:#8fa6c7;
  font-size:16px;
  line-height:1;
  transform: translateY(-1px);
}
.safe-select-button[aria-expanded="true"] .safe-select-arrow { transform: rotate(180deg) translateY(1px); }

.safe-select-menu {
  position: fixed;
  z-index: 100000;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 6px;
  background: rgba(7,13,24,.995);
  border: 1px solid #315071;
  border-radius: 11px;
  box-shadow: 0 18px 50px rgba(0,0,0,.58), 0 0 0 1px rgba(91,214,255,.06);
  color:#dbeafe;
}
.safe-select-option {
  width: 100%;
  min-height: 38px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color:#dbeafe;
  font: inherit;
  font-size:13px;
  text-align:left;
  cursor:pointer;
  outline:none;
}
.safe-select-option:hover,
.safe-select-option:focus-visible { background:#13243a; color:#fff; }
.safe-select-option.selected { background:linear-gradient(135deg,rgba(70,102,255,.34),rgba(0,184,217,.22)); color:#fff; }
.safe-select-option:disabled { opacity:.4; cursor:not-allowed; }
.safe-select-check { width:16px; flex:0 0 16px; color:#72e6ff; font-weight:900; }
.safe-select-option-text { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }

.mini-field > .safe-select-shell,
.field > .safe-select-shell { width:100%; }
.trim-ctl > .safe-select-shell { flex:1 1 220px; width:auto; min-width:150px; }
.emoji-style-row > .safe-select-shell { flex:1 1 auto; width:auto; min-width:0; }
.source-picker > .safe-select-shell { min-width:250px; }
#panel-export .safe-select-button { min-height:42px; }

@media (max-width: 900px) {
  .source-picker > .safe-select-shell { min-width:0; }
  .safe-select-menu { max-width:calc(100vw - 16px)!important; }
}
'''
CSS.write_text(css, encoding="utf-8")
print("safe custom select UI installed for all static and dynamic dropdowns")
