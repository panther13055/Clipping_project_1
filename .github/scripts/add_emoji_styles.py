from pathlib import Path

APP = Path('app.js')
CSS = Path('style.css')
s = APP.read_text(encoding='utf-8')

# 1) Add persistent emoji style preference next to recents storage.
needle = '  const EMOJI_RECENTS_LS = "ranking_shorts_recent_emojis_v2";'
replacement = '''  const EMOJI_RECENTS_LS = "ranking_shorts_recent_emojis_v2";
  const EMOJI_STYLE_LS = "ranking_shorts_emoji_style_v1";
  const TWEMOJI_BASE = "https://cdn.jsdelivr.net/gh/jdecked/twemoji@latest/assets/svg/";

  // Extra Unicode emoji so the picker covers a much broader set than the old
  // small curated catalog. Native rendering uses the device's own emoji font
  // (Apple artwork on iPhone/iPad/Mac, system artwork elsewhere).
  EMOJI_GROUPS.push(
    ["People", ["🧑","👨","👩","🧒","👦","👧","👶","🧓","👴","👵","🧔","👱","👮","👷","💂","🕵️","👩‍⚕️","👨‍⚕️","👩‍🎓","👨‍🎓","👩‍🏫","👨‍🏫","👩‍⚖️","👨‍⚖️","👩‍🌾","👨‍🌾","👩‍🍳","👨‍🍳","👩‍🔧","👨‍🔧","👩‍🏭","👨‍🏭","👩‍💼","👨‍💼","👩‍🔬","👨‍🔬","👩‍💻","👨‍💻","👩‍🎤","👨‍🎤","👩‍🎨","👨‍🎨","👩‍✈️","👨‍✈️","👩‍🚀","👨‍🚀","🧑‍🚒","🦸","🦹","🧙","🧚","🧛","🧜","🧝","🧞","🧟"]],
    ["Gestures", ["👋","🤚","🖐️","✋","🖖","🫱","🫲","🫳","🫴","🫷","🫸","👌","🤌","🤏","✌️","🤞","🫰","🤟","🤘","🤙","👈","👉","👆","👇","☝️","🫵","👍","👎","✊","👊","🤛","🤜","👏","🙌","🫶","👐","🤲","🤝","🙏","✍️","💅","🤳"]],
    ["Hearts", ["❤️","🧡","💛","💚","💙","🩵","💜","🩷","🤎","🖤","🩶","🤍","💔","❤️‍🔥","❤️‍🩹","❣️","💕","💞","💓","💗","💖","💘","💝","💟"]],
    ["Nature", ["🌱","🌿","☘️","🍀","🎍","🪴","🎋","🍃","🍂","🍁","🌾","🌺","🌻","🌹","🥀","🌷","🌼","🌸","💐","🍄","🌰","🪻","🌵","🌴","🌳","🌲","🪵","🪨","☀️","🌤️","⛅","🌥️","☁️","🌦️","🌧️","⛈️","🌩️","🌨️","❄️","☃️","⛄","🌬️","💨","🌪️","🌫️","🌈","☔","⚡","🔥","💧","🌊"]],
    ["Travel", ["🚗","🚕","🚙","🚌","🚎","🏎️","🚓","🚑","🚒","🚐","🛻","🚚","🚛","🚜","🏍️","🛵","🚲","🛴","🛹","🛼","🚨","🚔","🚍","🚘","🚖","🚡","🚠","🚟","🚃","🚋","🚞","🚝","🚄","🚅","🚈","🚂","🚆","🚇","🚊","🚉","✈️","🛫","🛬","🛩️","💺","🛰️","🚀","🛸","🚁","🛶","⛵","🚤","🛥️","🛳️","⛴️","🚢","⚓","🛟"]],
    ["Places", ["🏠","🏡","🏢","🏣","🏤","🏥","🏦","🏨","🏪","🏫","🏬","🏭","🏯","🏰","💒","🗼","🗽","⛪","🕌","🛕","🕍","⛩️","🕋","⛲","⛺","🌁","🌃","🏙️","🌄","🌅","🌆","🌇","🌉","♨️","🎠","🛝","🎡","🎢","💈","🎪"]],
    ["Activities", ["🎃","🎄","🎆","🎇","🧨","✨","🎈","🎉","🎊","🎋","🎍","🎎","🎏","🎐","🎀","🎁","🎟️","🎫","🏆","🏅","🥇","🥈","🥉","⚽","⚾","🥎","🏀","🏐","🏈","🏉","🎾","🥏","🎳","🏏","🏑","🏒","🥍","🏓","🏸","🥊","🥋","🥅","⛳","⛸️","🎣","🤿","🎽","🎿","🛷","🥌","🎯","🪀","🪁","🔫","🎱","🔮","🪄","🎮","🕹️","🎰","🎲","🧩","♟️","🎭","🎨"]],
    ["Tech", ["⌚","📱","📲","💻","⌨️","🖥️","🖨️","🖱️","🖲️","💽","💾","💿","📀","🧮","🎥","🎞️","📽️","🎬","📺","📷","📸","📹","📼","🔍","🔎","🕯️","💡","🔦","🏮","🪔","📔","📕","📖","📗","📘","📙","📚","📓","📒","📃","📜","📄","📰","🗞️","📑","🔖","🏷️","💰","🪙","💳","💎","⚖️","🧰","🔧","🔨","⚒️","🛠️","⛏️","🪛","⚙️","🧱","⛓️","🧲","🔬","🔭","📡","💉","🩹","🩺"]],
    ["Food+", ["🍏","🍎","🍐","🍊","🍋","🍌","🍉","🍇","🍓","🫐","🍈","🍒","🍑","🥭","🍍","🥥","🥝","🍅","🍆","🥑","🥦","🫛","🥬","🥒","🌶️","🫑","🌽","🥕","🫒","🧄","🧅","🥔","🍠","🫘","🥐","🥯","🍞","🥖","🥨","🧀","🥚","🍳","🧈","🥞","🧇","🥓","🥩","🍗","🍖","🌭","🍔","🍟","🍕","🫓","🥪","🥙","🧆","🌮","🌯","🫔","🥗","🥘","🫕","🥫","🍝","🍜","🍲","🍛","🍣","🍱","🥟","🦪","🍤","🍙","🍚","🍘","🍥","🥠","🥮","🍢","🍡","🍧","🍨","🍦","🥧","🧁","🍰","🎂","🍮","🍭","🍬","🍫","🍿","🍩","🍪","🌰","🥜","🍯","🥛","☕","🫖","🍵","🧃","🥤","🧋","🍶","🍺","🍻","🥂","🍷","🥃","🍸","🍹","🧉","🍾"]],
    ["Symbols+", ["💢","💬","👁️‍🗨️","🗨️","🗯️","💭","💤","💮","♨️","💈","🛑","🕛","🆘","❌","⭕","🚫","🔞","📵","❗","❕","❓","❔","‼️","⁉️","💯","🔅","🔆","〽️","⚠️","🚸","🔱","⚜️","🔰","♻️","✅","❎","🌐","💠","Ⓜ️","🌀","💤","🏁","🚩","🎌","🏴","🏳️","🏳️‍🌈","🏳️‍⚧️","🏴‍☠️"]]
  );'''
if needle in s and 'EMOJI_STYLE_LS' not in s:
    s = s.replace(needle, replacement)

# 2) Replace the emoji picker support block with style-aware rendering.
old = '''  let emojiPop = null, emojiTarget = null, emojiSearch = "", emojiBody = null;
  function recentEmojis() { try { return JSON.parse(localStorage.getItem(EMOJI_RECENTS_LS) || "[]"); } catch (_) { return []; } }
  function rememberEmoji(em) {
    const list = recentEmojis().filter((x) => x !== em); list.unshift(em);
    localStorage.setItem(EMOJI_RECENTS_LS, JSON.stringify(list.slice(0, 24)));
  }'''
new = '''  let emojiPop = null, emojiTarget = null, emojiSearch = "", emojiBody = null, emojiStyleSelect = null;
  function recentEmojis() { try { return JSON.parse(localStorage.getItem(EMOJI_RECENTS_LS) || "[]"); } catch (_) { return []; } }
  function emojiStyle() { try { return localStorage.getItem(EMOJI_STYLE_LS) || "native"; } catch (_) { return "native"; } }
  function setEmojiStyle(style) {
    try { localStorage.setItem(EMOJI_STYLE_LS, style || "native"); } catch (_) {}
    if (emojiStyleSelect) emojiStyleSelect.value = style || "native";
    renderEmojiBody();
  }
  function emojiAssetCode(em) {
    // Twemoji filenames are lowercase Unicode code points joined by '-'.
    // FE0F presentation selectors are omitted from asset names.
    return Array.from(String(em || ""))
      .map((ch) => ch.codePointAt(0))
      .filter((cp) => cp !== 0xfe0f)
      .map((cp) => cp.toString(16))
      .join("-");
  }
  function ensureNotoEmojiFont() {
    if (document.getElementById("noto-color-emoji-css")) return;
    const link = document.createElement("link");
    link.id = "noto-color-emoji-css"; link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Noto+Color+Emoji&display=swap";
    document.head.appendChild(link);
  }
  function renderEmojiButtonContent(button, em, style) {
    button.innerHTML = "";
    button.dataset.emojiStyle = style;
    if (style === "twemoji") {
      const img = document.createElement("img");
      img.className = "emoji-art"; img.alt = em; img.draggable = false;
      img.src = TWEMOJI_BASE + emojiAssetCode(em) + ".svg";
      img.addEventListener("error", () => { button.textContent = em; }, { once: true });
      button.appendChild(img);
    } else {
      button.textContent = em;
      if (style === "noto") {
        ensureNotoEmojiFont();
        button.style.fontFamily = '\"Noto Color Emoji\", \"Segoe UI Emoji\", sans-serif';
      } else {
        button.style.fontFamily = '\"Apple Color Emoji\", \"Segoe UI Emoji\", \"Noto Color Emoji\", sans-serif';
      }
    }
  }
  function rememberEmoji(em) {
    const list = recentEmojis().filter((x) => x !== em); list.unshift(em);
    localStorage.setItem(EMOJI_RECENTS_LS, JSON.stringify(list.slice(0, 32)));
  }'''
if old in s:
    s = s.replace(old, new)

old_render = '''      list.forEach((em) => {
        const b = document.createElement("button"); b.type = "button"; b.className = "emoji-btn"; b.textContent = em; b.title = group; b.addEventListener("click", () => insertEmoji(em)); grid.appendChild(b);
      });'''
new_render = '''      const style = emojiStyle();
      list.forEach((em) => {
        const b = document.createElement("button"); b.type = "button"; b.className = "emoji-btn"; b.title = group + " · " + em;
        renderEmojiButtonContent(b, em, style);
        b.addEventListener("click", () => insertEmoji(em)); grid.appendChild(b);
      });'''
if old_render in s:
    s = s.replace(old_render, new_render)

old_panel = '''  function buildEmojiPanel() {
    emojiPop = document.createElement("div");
    emojiPop.id = "emoji-pop";
    emojiPop.className = "hidden";
    const search = document.createElement("input");
    search.type = "text"; search.placeholder = "Search group or paste emoji"; search.className = "emoji-search";
    search.addEventListener("input", () => { emojiSearch = search.value; renderEmojiBody(); });
    emojiPop.appendChild(search);'''
new_panel = '''  function buildEmojiPanel() {
    emojiPop = document.createElement("div");
    emojiPop.id = "emoji-pop";
    emojiPop.className = "hidden";

    const styleRow = document.createElement("div");
    styleRow.className = "emoji-style-row";
    const styleLabel = document.createElement("span");
    styleLabel.className = "emoji-style-label"; styleLabel.textContent = "Emoji style";
    emojiStyleSelect = document.createElement("select");
    emojiStyleSelect.className = "emoji-style-select";
    emojiStyleSelect.innerHTML = '<option value="native">Native · Apple on iPhone/Mac</option><option value="twemoji">Twemoji · same on every device</option><option value="noto">Noto Emoji · Google style</option>';
    emojiStyleSelect.value = emojiStyle();
    emojiStyleSelect.addEventListener("change", () => setEmojiStyle(emojiStyleSelect.value));
    styleRow.appendChild(styleLabel); styleRow.appendChild(emojiStyleSelect);
    emojiPop.appendChild(styleRow);

    const styleHint = document.createElement("div");
    styleHint.className = "emoji-style-hint";
    styleHint.textContent = "Native uses Apple emoji automatically on Apple devices. Twemoji/Noto change the picker preview; inserted emoji remains standard Unicode so projects stay portable.";
    emojiPop.appendChild(styleHint);

    const search = document.createElement("input");
    search.type = "text"; search.placeholder = "Search category or paste emoji"; search.className = "emoji-search";
    search.addEventListener("input", () => { emojiSearch = search.value; renderEmojiBody(); });
    emojiPop.appendChild(search);'''
if old_panel in s:
    s = s.replace(old_panel, new_panel)

APP.write_text(s, encoding='utf-8')

css = CSS.read_text(encoding='utf-8')
block = r'''

/* Emoji picker style selector */
.emoji-style-row{display:flex;align-items:center;gap:10px;margin-bottom:7px;position:sticky;top:0;z-index:3;background:rgba(7,14,26,.98);padding:2px 0 4px}
.emoji-style-label{font-size:11px;font-weight:800;color:#8fa6c7;text-transform:uppercase;letter-spacing:.08em;white-space:nowrap}
.emoji-style-select{flex:1;min-width:0;background:#091322;color:#e9f2ff;border:1px solid #263b58;border-radius:9px;padding:7px 9px;font-size:12px}
.emoji-style-hint{font-size:10px;line-height:1.35;color:#7186a5;margin:0 0 8px}
.emoji-btn{display:flex!important;align-items:center;justify-content:center;overflow:hidden}
.emoji-btn .emoji-art{width:28px;height:28px;display:block;pointer-events:none;object-fit:contain}
'''
if '/* Emoji picker style selector */' not in css:
    css += block
CSS.write_text(css, encoding='utf-8')

print('emoji style patch applied')
