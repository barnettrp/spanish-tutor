// chat.js (ES module) — client-side logic for chat.html

// ---------- Small helpers ----------
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const HISTORY_KEY = "party_history";
const SYSTEM_PROMPT =
  "You are a helpful Spanish tutor. Be concise, friendly, and focus on A1–A2 level explanations unless the user asks for more depth.";

function $(id) { return document.getElementById(id); }

function trimHistory(full, maxPairs = 12) {
  const sys = full.find(m => m.role === "system") || { role: "system", content: SYSTEM_PROMPT };
  const rest = full.filter(m => m.role !== "system");
  const kept = rest.slice(-maxPairs * 2);
  return [sys, ...kept];
}

function loadHistory() {
  try {
    const arr = JSON.parse(sessionStorage.getItem(HISTORY_KEY) || "[]");
    // ensure system prompt (index 0)
    if (!arr.length || arr[0]?.role !== "system") {
      arr.unshift({ role: "system", content: SYSTEM_PROMPT });
    }
    return arr;
  } catch {
    return [{ role: "system", content: SYSTEM_PROMPT }];
  }
}

function saveHistory(h) {
  sessionStorage.setItem(HISTORY_KEY, JSON.stringify(h));
}

// ---------- Element refs ----------
const connStatus = $("connStatus");
const userBadge  = $("userBadge");
const chatScroll = $("chatScroll");
const bootMsg    = $("bootMsg");
const composer   = $("composer");
const inputEl    = $("text");
const leaveBtn   = $("leaveBtn");
const sendBtn    = $("send");

// ---------- Auth guard (lightweight; mirrors your previous inline script) ----------
const token = localStorage.getItem("party_token");
const name  = localStorage.getItem("party_name") || "Guest";
const code  = localStorage.getItem("party_code") || "";
userBadge.textContent = `${name}${code ? " · " + code : ""}`;

function redirectToJoin() { location.replace("join.html"); }

if (!token) {
  redirectToJoin();
  throw new Error("No party_token present");
}

// Optional: validate session if /api/me exists (safe if it doesn't)
(async () => {
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

// ---------- History & render ----------
let history = loadHistory();

function addMsg(text, who = "you", skipSave = false) {
  const div = document.createElement("div");
  div.className = `msg ${who}`;
  div.textContent = text;
  chatScroll.appendChild(div);
  chatScroll.scrollTop = chatScroll.scrollHeight;

  if (!skipSave) {
    history.push({ role: (who === "me" ? "user" : "assistant"), content: text });
    saveHistory(history);
  }
}

function addError(text) {
  const div = document.createElement("div");
  div.className = "msg err";
  div.textContent = text;
  chatScroll.appendChild(div);
  chatScroll.scrollTop = chatScroll.scrollHeight;
}

// Rehydrate (skip system msg)
for (const m of history) {
  if (m.role === "user") addMsg(m.content, "me", true);
  if (m.role === "assistant") addMsg(m.content, "you", true);
}
if (bootMsg) {
  bootMsg.textContent = `Welcome, ${name}!`;
  setTimeout(() => bootMsg.remove(), 800);
}

// ---------- Send flow ----------
composer.addEventListener("submit", async (e) => {
  e.preventDefault();
  const msg = (inputEl.value || "").trim();
  if (!msg) return;

  addMsg(msg, "me");
  inputEl.value = "";
  inputEl.focus();

  sendBtn.disabled = true;
  sendBtn.textContent = "Sending…";

  try {
    // Always include a system prompt + last N pairs (prevents empty-array errors)
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
      addError(`(error) ${detail}`);
      return;
    }

    const reply = (data.reply || "").trim();
    addMsg(reply || "(no reply)");
  } catch (err) {
    addError(`(network error) ${err?.message || err}`);
  } finally {
    sendBtn.disabled = false;
    sendBtn.textContent = "Send";
  }
});

// ---------- Leave flow ----------
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

// ---------- Translation: translate any selected text (Alt+T) ----------
async function translateSelection(direction = "auto") {
  // Get selected text (fallback: last assistant msg)
  let sel = (window.getSelection?.().toString() || "").trim();
  if (!sel) {
    const msgs = Array.from(chatScroll.querySelectorAll(".msg.you"));
    sel = msgs.length ? msgs[msgs.length - 1].textContent : "";
  }
  if (!sel) {
    showTranslation(`<div style="color:#e5e7eb">No text selected to translate.</div>`);
    return;
  }

  // Build a one-off message set so this doesn't pollute your main history
  const translateSystem =
    "You are a translator for a Spanish-learning app. Detect the language. " +
    "If the text is Spanish, translate to clear, natural English. " +
    "If the text is English, translate to simple, natural Spanish (A1–A2). " +
    "Do not add commentary—return only the translation.";

  const messages = [
    { role: "system", content: translateSystem },
    { role: "user", content: sel }
  ];

  // Call the same /api/chat endpoint
  try {
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
      showTranslation(`<div style="color:#ffb4b4">Translation error: ${escapeHtml(detail)}</div>`);
      return;
    }

    const translated = (data.reply || "").trim();
    showTranslation(`
      <div style="font-weight:700; margin-bottom:6px;">Traducción</div>
      <div>${escapeHtml(translated)}</div>
      <div style="margin-top:10px; display:flex; gap:8px;">
        <button type="button" onclick="hideTranslation()" style="padding:6px 10px; border-radius:8px; border:1px solid rgba(255,255,255,.15); background:#111827; color:#fff;">Cerrar</button>
      </div>
    `);
  } catch (err) {
    showTranslation(`<div style="color:#ffb4b4">Network error: ${escapeHtml(err?.message || String(err))}</div>`);
  }
}

// Keyboard shortcut: Alt+T to translate current selection
document.addEventListener("keydown", (e) => {
  if (e.altKey && e.key.toLowerCase() === "t") {
    e.preventDefault();
    translateSelection().catch(() => {});
  }
});

// Expose if you want to trigger from buttons elsewhere
window.translateSelection = translateSelection;

// ---------- Tiny util ----------
function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// QoL
inputEl.focus();
