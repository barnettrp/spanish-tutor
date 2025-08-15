// chat.js — hard lock against iOS keyboard scroll, plus your existing chat features

// ================== 1) Viewport & layout hard-fix ==================
(function viewportAndLayout() {
  const root = document.documentElement;
  const chatScroll = () => document.getElementById('chatScroll');
  const headerEl   = () => document.querySelector('.app__header');
  const composerEl = () => document.getElementById('composer');

  // Compute exact chat list height so nothing else needs to scroll
  function applyLayout() {
    const vv = window.visualViewport;
    const vh = vv ? vv.height : window.innerHeight;

    // expose vars for CSS (some themes use them)
    root.style.setProperty('--vhpx', vh + 'px');
    root.style.setProperty('--vh', (window.innerHeight * 0.01) + 'px');

    const headerH   = (headerEl()?.getBoundingClientRect().height || 0);
    const composerH = (composerEl()?.getBoundingClientRect().height || 0);

    // padding from your .container/.card (give ourselves a small buffer)
    const gutters = 16 + 16; // rough vertical padding inside the card/container

    const usable = Math.max(0, vh - headerH - composerH - gutters);
    const scroll = chatScroll();
    if (scroll) {
      scroll.style.height = usable + 'px';
      scroll.style.maxHeight = usable + 'px';
      scroll.style.overflowY = 'auto';
      scroll.style.webkitOverflowScrolling = 'touch';
    }

    // keep page pinned at top so Safari can't bounce the document
    window.scrollTo(0, 0);
    document.body.scrollTop = 0;
    document.documentElement.scrollTop = 0;
  }

  // Lock the page when input is focused (iOS likes to move the root)
  function lockPage() {
    // store current scroll just in case (should be 0)
    const y = window.scrollY || 0;
    document.body.dataset.lockY = String(y);
    document.body.style.position = 'fixed';
    document.body.style.top = `-${y}px`;
    document.body.style.left = '0';
    document.body.style.right = '0';
    document.body.style.width = '100%';
  }
  function unlockPage() {
    const y = parseInt(document.body.dataset.lockY || '0', 10) || 0;
    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.left = '';
    document.body.style.right = '';
    document.body.style.width = '';
    window.scrollTo(0, y);
  }

  // Prevent body from scrolling via touch; allow only the chat list to scroll
  function blockBodyTouch(e) {
    const target = e.target;
    const scroll = chatScroll();
    // Allow touches that start inside the chat list
    if (scroll && (scroll === target || scroll.contains(target))) return;
    e.preventDefault();
  }

  // Wire it up
  const apply = () => applyLayout();
  apply();
  if (window.visualViewport) {
    visualViewport.addEventListener('resize', apply);
    visualViewport.addEventListener('scroll', apply);
  }
  window.addEventListener('resize', apply);
  window.addEventListener('orientationchange', apply);

  // Focus/blur lock for the composer input
  function composerFocusLock() {
    const input = document.getElementById('text');
    if (!input) return;
    input.addEventListener('focus', () => { lockPage(); applyLayout(); setTimeout(applyLayout, 50); });
    input.addEventListener('blur',  () => { unlockPage(); setTimeout(applyLayout, 50); });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { composerFocusLock(); applyLayout(); }, { once: true });
  } else {
    composerFocusLock(); applyLayout();
  }

  // Block body touch scroll; allow chat list to scroll
  window.addEventListener('touchmove', blockBodyTouch, { passive: false });
})();

// ================== 2) Popup helpers ==================
window.showTranslation = window.showTranslation || function (html) {
  const el = document.getElementById('translate-pop');
  if (!el) return;
  el.innerHTML = html;
  el.hidden = false;
  void el.offsetWidth; // reflow
  el.classList.add('is-open');
};
window.hideTranslation = window.hideTranslation || function () {
  const el = document.getElementById('translate-pop');
  if (!el) return;
  el.classList.remove('is-open');
  setTimeout(() => { el.hidden = true; }, 200);
};

// ================== 3) Chat app logic (unchanged behavior) ==================
const $ = (id) => document.getElementById(id);
const HISTORY_KEY = "party_history";
const SYSTEM_PROMPT =
  "You are a helpful Spanish tutor. Be concise, friendly, and focus on A1–A2 level explanations unless the user asks for more depth.";

function trimHistory(full, maxPairs = 12) {
  const sys = full.find(m => m.role === "system") || { role: "system", content: SYSTEM_PROMPT };
  const rest = full.filter(m => m.role !== "system");
  const kept = rest.slice(-maxPairs * 2);
  return [sys, ...kept];
}
function loadHistory() {
  try {
    const arr = JSON.parse(sessionStorage.getItem(HISTORY_KEY) || "[]");
    if (!arr.length || arr[0]?.role !== "system") arr.unshift({ role: "system", content: SYSTEM_PROMPT });
    return arr;
  } catch { return [{ role: "system", content: SYSTEM_PROMPT }]; }
}
function saveHistory(h) { sessionStorage.setItem(HISTORY_KEY, JSON.stringify(h)); }
function escapeHtml(s) {
  return String(s)
    .replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
    .replaceAll('"',"&quot;").replaceAll("'","&#039;");
}

// Elements
const connStatus  = $("connStatus");
const userBadge   = $("userBadge");
const chatScroll  = $("chatScroll");
const bootMsg     = $("bootMsg");
const composer    = $("composer");
const inputEl     = $("text");
const leaveBtn    = $("leaveBtn");
const sendBtn     = $("send");
const limitBanner = $("limitBanner");

// Auth/status (same as before)
const token = localStorage.getItem("party_token");
const name  = localStorage.getItem("party_name") || "Guest";
const code  = localStorage.getItem("party_code") || "";
if (userBadge) userBadge.textContent = `${name}${code ? " · " + code : ""}`;
function redirectToJoin() { location.replace("join.html"); }
if (!token) { redirectToJoin(); throw new Error("No party_token present"); }
(async () => {
  if (!connStatus) return;
  connStatus.textContent = "validating…";
  try {
    const res = await fetch("/api/me", { credentials: "include" });
    if (res.status === 404) { connStatus.textContent = "connected"; return; }
    if (!res.ok) { connStatus.textContent = "unauthorized"; redirectToJoin(); return; }
    connStatus.textContent = "connected";
  } catch { connStatus.textContent = "offline (still usable)"; }
})();

// History & render
let history = loadHistory();
function addBubble(text, who = "you", meta = "") {
  const div = document.createElement("div");
  div.className = `msg ${who}`;
  div.appendChild(document.createTextNode(text));
  if (meta) {
    const small = document.createElement("div");
    small.style.opacity = "0.6";
    small.style.fontSize = "0.8rem";
    small.style.marginTop = "4px";
    small.textContent = meta;
    div.appendChild(small);
  }
  chatScroll.appendChild(div);
  chatScroll.scrollTop = chatScroll.scrollHeight;
}
function addMsg(text, who = "you", skipSave = false, meta = "") {
  addBubble(text, who, meta);
  if (!skipSave) {
    history.push({ role: (who === "me" ? "user" : "assistant"), content: text });
    saveHistory(history);
  }
}
function addError(text) { addBubble(text, "err"); }
for (const m of history) {
  if (m.role === "user") addMsg(m.content, "me", true);
  if (m.role === "assistant") addMsg(m.content, "you", true);
}
if (bootMsg) { bootMsg.textContent = `Welcome, ${name}!`; setTimeout(() => bootMsg.remove(), 800); }

// Limit banner
function showLimitBanner(msg) {
  if (!limitBanner) return;
  limitBanner.style.display = "block";
  limitBanner.innerHTML = `<strong>Rate/usage limit:</strong> ${msg || "You’ve hit a limit. Try again later."}`;
}
function hideLimitBanner() { if (limitBanner) limitBanner.style.display = "none"; }

// Send flow
let inFlight = false;
let cooldown = false;

composer.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (inFlight || cooldown) return;
  cooldown = true; setTimeout(() => (cooldown = false), 900);

  const msg = (inputEl?.value || "").trim();
  if (!msg) return;

  addMsg(msg, "me");
  if (inputEl) { inputEl.value = ""; inputEl.focus(); }

  if (sendBtn) { sendBtn.disabled = true; sendBtn.textContent = "Sending…"; }
  inFlight = true;

  try {
    const messages = trimHistory(history);

    const r = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages })
    });

    const text = await r.text();
    let data = null;
    try { data = JSON.parse(text); } catch {}

    if (!r.ok || !data?.ok) {
      const detail = (data && data.error) ? data.error : `HTTP ${r.status}: ${text.slice(0,200)}`;
      if (/insufficient[_\s-]?quota/i.test(detail)) {
        showLimitBanner("You’ve reached your usage quota for today/month. Check billing or raise your cap.");
      } else if (/rate.?limit/i.test(detail) || r.status === 429) {
        showLimitBanner("Too many requests. Please wait a moment and try again.");
      } else {
        hideLimitBanner();
      }
      addError(`(error) ${detail}`);
      return;
    }

    hideLimitBanner();
    const reply = (data.reply || "").trim();
    const modelMeta = data.model_used ? `model: ${data.model_used}` : "";
    addMsg(reply || "(no reply)", "you", false, modelMeta);
  } catch (err) {
    addError(`(network error) ${err?.message || err}`);
  } finally {
    inFlight = false;
    if (sendBtn) { sendBtn.disabled = false; sendBtn.textContent = "Send"; }
  }
});

// Leave party
if (leaveBtn) {
  leaveBtn.addEventListener("click", () => {
    try {
      localStorage.removeItem("party_token");
      localStorage.removeItem("party_name");
      localStorage.removeItem("party_code");
      sessionStorage.removeItem(HISTORY_KEY);
    } finally { redirectToJoin(); }
  });
}

// Translation (cheap mini path)
async function translateSelection() {
  if (inFlight) return;
  let sel = (window.getSelection?.().toString() || "").trim();
  if (!sel) {
    const msgs = Array.from(document.querySelectorAll("#chatScroll .msg.you"));
    sel = msgs.length ? (msgs[msgs.length - 1].firstChild?.textContent || "") : "";
  }
  if (!sel) {
    window.showTranslation?.(`<div style="color:#e5e7eb">No text selected to translate.</div>`);
    return;
  }

  try {
    inFlight = true;
    const r = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [
          {
            role: "system",
            content:
              "Translate the user's text. Detect language. If Spanish → concise natural English. " +
              "If English → simple natural Spanish (A1–A2). Return ONLY the translation, ≤ 60 words."
          },
          { role: "user", content: sel }
        ],
        _purpose: "translate"
      })
    });

    const text = await r.text();
    let data = null;
    try { data = JSON.parse(text); } catch {}

    if (!r.ok || !data?.ok) {
      const detail = (data && data.error) ? data.error : `HTTP ${r.status}: ${text.slice(0,200)}`;
      if (/insufficient[_\s-]?quota/i.test(detail)) {
        showLimitBanner("You’ve reached your usage quota for today/month. Check billing or raise your cap.");
      } else if (/rate.?limit/i.test(detail) || r.status === 429) {
        showLimitBanner("Too many requests. Please wait a moment and try again.");
      }
      window.showTranslation?.(`<div style="color:#ffb4b4">Translation error: ${escapeHtml(detail)}</div>`);
      return;
    }

    hideLimitBanner();
    const translated = (data.reply || "").trim();
    window.showTranslation?.(`
      <div style="font-weight:700; margin-bottom:6px;">Traducción</div>
      <div>${escapeHtml(translated)}</div>
      <div style="margin-top:10px; display:flex; gap:8px;">
        <button type="button" onclick="hideTranslation()" style="padding:6px 10px; border-radius:8px; border:1px solid rgba(255,255,255,.15); background:#111827; color:#fff;">Cerrar</button>
      </div>
    `);
  } catch (err) {
    window.showTranslation?.(`<div style="color:#ffb4b4">Network error: ${escapeHtml(err?.message || String(err))}</div>`);
  } finally {
    inFlight = false;
  }
}
document.addEventListener("keydown", (e) => {
  if (e.altKey && e.key.toLowerCase() === "t") { e.preventDefault(); translateSelection().catch(()=>{}); }
});
window.translateSelection = translateSelection;

// Focus the input on load
document.getElementById('text')?.focus();
