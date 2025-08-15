// chat.js — Client-side logic (drop-in)

// ---------------------- Viewport & keyboard-safe height ----------------------
(function setupViewportVars() {
  const root = document.documentElement;

  function applyHeights() {
    const vv = window.visualViewport;
    const vhPx = vv ? vv.height : window.innerHeight;       // exact visible height in px
    root.style.setProperty('--vhpx', vhPx + 'px');           // primary, used by .app { height: var(--vhpx) }
    root.style.setProperty('--vh', (window.innerHeight * 0.01) + 'px'); // fallback
  }

  applyHeights();
  if (window.visualViewport) {
    visualViewport.addEventListener('resize', applyHeights);
    visualViewport.addEventListener('scroll', applyHeights); // iOS fires on keyboard open/close
  }
  window.addEventListener('resize', applyHeights);
  window.addEventListener('orientationchange', applyHeights);
})();

// ---------------------- Track composer height for popup docking ----------------------
(function trackComposerHeight(){
  const root = document.documentElement;
  const set = () => {
    const c = document.getElementById('composer');
    root.style.setProperty('--composer-h', (c ? c.offsetHeight : 64) + 'px');
  };
  const ready = () => {
    set();
    const c = document.getElementById('composer');
    if (c && window.ResizeObserver) new ResizeObserver(set).observe(c);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready, { once:true });
  else ready();
  window.addEventListener('resize', set);
  window.addEventListener('orientationchange', set);
})();

// ---------------------- Translation popup helpers (inline safety) ----------------------
window.showTranslation = window.showTranslation || function (html) {
  const el = document.getElementById('translate-pop');
  if (!el) return;
  el.innerHTML = html;
  el.hidden = false;
  void el.offsetWidth; // reflow so transition plays
  el.classList.add('is-open');
};
window.hideTranslation = window.hideTranslation || function () {
  const el = document.getElementById('translate-pop');
  if (!el) return;
  el.classList.remove('is-open');
  setTimeout(() => { el.hidden = true; }, 200);
};

// ---------------------- Small helpers ----------------------
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

// ---------------------- Element refs ----------------------
const connStatus  = $("connStatus");
const userBadge   = $("userBadge");
const chatScroll  = $("chatScroll");
const bootMsg     = $("bootMsg");
const composer    = $("composer");
const inputEl     = $("text");
const leaveBtn    = $("leaveBtn");
const sendBtn     = $("send");
const limitBanner = $("limitBanner");

// ---------------------- Auth header badges (non-blocking) ----------------------
const token = localStorage.getItem("party_token");
const name  = localStorage.getItem("party_name") || "Guest";
const code  = localStorage.getItem("party_code") || "";
if (userBadge) userBadge.textContent = `${name}${code ? " · " + code : ""}`;
function redirectToJoin() { location.replace("join.html"); }
if (!token) { redirectToJoin(); throw new Error("No party_token present"); }

// Optional: validate session if /api/me exists
(async () => {
  if (!connStatus) return;
  connStatus.textContent = "validating…";
  try {
    const res = await fetch("/api/me", { credentials: "include" });
    if (res.status === 404) { connStatus.textContent = "connected"; return; }
    if (!res.ok) { connStatus.textContent = "unauthorized"; redirectToJoin(); return; }
    connStatus.textContent = "connected";
  } catch {
    connStatus.textContent = "offline (still usable)";
  }
})();

// ---------------------- History & render ----------------------
let history = loadHistory();

function addBubble(text, who = "you", meta = "") {
  const div = document.createElement("div");
  div.className = `msg ${who}`;
  // Use a first child text node so we can append a meta line below
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

// Rehydrate (skip system)
for (const m of history) {
  if (m.role === "user") addMsg(m.content, "me", true);
  if (m.role === "assistant") addMsg(m.content, "you", true);
}
if (bootMsg) { bootMsg.textContent = `Welcome, ${name}!`; setTimeout(() => bootMsg.remove(), 800); }

// ---------------------- Limit banner helpers ----------------------
function showLimitBanner(msg) {
  if (!limitBanner) return;
  limitBanner.style.display = "block";
  limitBanner.innerHTML = `<strong>Rate/usage limit:</strong> ${msg || "You’ve hit a limit. Try again later."}`;
}
function hideLimitBanner() {
  if (!limitBanner) return;
  limitBanner.style.display = "none";
}

// ---------------------- Network call guards ----------------------
let inFlight = false;
let cooldown = false;

// ---------------------- Send flow ----------------------
composer.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (inFlight || cooldown) return;
  cooldown = true; setTimeout(() => (cooldown = false), 900);

  const msg = (inputEl?.value || "").trim();
  if (!msg) return;

  addMsg(msg, "me");
  if (inputEl) {
    inputEl.value = "";
    inputEl.focus();
  }

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

// ---------------------- Leave flow ----------------------
if (leaveBtn) {
  leaveBtn.addEventListener("click", () => {
    try {
      localStorage.removeItem("party_token");
      localStorage.removeItem("party_name");
      localStorage.removeItem("party_code");
      sessionStorage.removeItem(HISTORY_KEY);
    } finally {
      redirectToJoin();
    }
  });
}

// ---------------------- Translation: Translate selection (cheaper) ----------------------
async function translateSelection() {
  if (inFlight) return; // avoid parallel calls

  // Prefer selected text; fallback to last assistant msg
  let sel = (window.getSelection?.().toString() || "").trim();
  if (!sel) {
    const msgs = Array.from(chatScroll.querySelectorAll(".msg.you"));
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
              "Translate the user's text. Detect the language. If Spanish → concise, natural English. " +
              "If English → simple, natural Spanish (A1–A2). Return ONLY the translation, ≤ 60 words."
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

// Keyboard shortcut: Alt+T to translate current selection
document.addEventListener("keydown", (e) => {
  if (e.altKey && e.key.toLowerCase() === "t") {
    e.preventDefault();
    translateSelection().catch(() => {});
  }
});

// Expose globally for the composer button
window.translateSelection = translateSelection;

// ---------------------- QoL ----------------------
inputEl?.focus();
