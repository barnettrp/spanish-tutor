// api/chat.js — Vercel Node Serverless (NOT Edge)

// ---- helpers ----
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function formatErr(e) { return typeof e === "string" ? e : (e?.message || "Unknown error"); }

function trimHistory(history, maxPairs = 12) {
  const sys = history.filter(m => m.role === "system");
  const rest = history.filter(m => m.role !== "system");
  const kept = rest.slice(-maxPairs * 2);
  return [...sys.slice(0, 1), ...kept];
}

// Simple heuristic: boost when inputs are long/complex
function shouldBoost(messages) {
  const lastUser = [...messages].reverse().find(m => m.role === "user");
  const text = (lastUser?.content || "").toLowerCase();

  const longInput = (lastUser?.content?.length || 0) >= 600;    // long user prompt
  const totalChars = messages.reduce((n, m) => n + (m?.content?.length || 0), 0);
  const bigPrompt = totalChars >= 12000;                        // ~3k tokens proxy

  const complexCue = /\b(explain|why|analy[sz]e|step[- ]?by[- ]?step|compare|contrast|design|refactor|optimi[sz]e|lesson|curriculum|grammar|syntax|reason|walk me through|break down|examples?)\b/.test(text);

  return longInput || bigPrompt || complexCue;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ ok: false, error: "OPENAI_API_KEY is not set" });
    }

    // Allow env overrides if you ever want to swap quickly
    const BASE_MODEL       = process.env.OPENAI_MODEL || "gpt-5-mini";
    const BOOST_MODEL      = process.env.OPENAI_MODEL_BOOST || "gpt-5";
    const TRANSLATE_MODEL  = process.env.OPENAI_TRANSLATE_MODEL || "gpt-5-mini";

    // ---- parse body safely ----
    let body = req.body;
    if (typeof body === "string") { try { body = JSON.parse(body || "{}"); } catch { body = {}; } }
    if (!body || typeof body !== "object") body = {};

    // Accept {messages} or {message}
    let incoming = [];
    if (Array.isArray(body.messages)) {
      incoming = body.messages;
    } else if (typeof body.message === "string" && body.message.trim()) {
      incoming = [
        { role: "system", content: "You are a helpful Spanish tutor. Be concise." },
        { role: "user", content: body.message.trim() }
      ];
    }
    if (!Array.isArray(incoming) || incoming.length === 0) {
      return res.status(400).json({ ok: false, error: "No messages provided" });
    }

    const isTranslate = body._purpose === "translate";

    // For normal chat, trim history; for translate, send exactly what client provided
    const messages = isTranslate ? incoming : trimHistory(incoming);

    // ---- choose model automatically ----
    let model = BASE_MODEL;
    if (isTranslate) {
      model = TRANSLATE_MODEL;                // always mini for popup translations
    } else if (shouldBoost(messages)) {
      model = BOOST_MODEL;                    // auto-boost to gpt-5 for complex asks
    }

    // ---- payload budgets ----
    const payload = {
      model,
      messages,
      max_tokens: isTranslate ? 100 : 500,
      temperature: isTranslate ? 0 : 0.4,
    };

    // ---- OpenAI call with light backoff for 429 ----
    let attempt = 0;
    while (true) {
      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
        },
        body: JSON.stringify(payload)
      });

      const text = await r.text();

      if (r.ok) {
        let json;
        try { json = JSON.parse(text); }
        catch { return res.status(502).json({ ok: false, error: `OpenAI JSON parse failed: ${text.slice(0,200)}` }); }

        const reply = json?.choices?.[0]?.message?.content ?? "";
        return res.status(200).json({ ok: true, reply: String(reply).trim(), model_used: model });
      }

      const is429 = r.status === 429 || /rate.?limit/i.test(text);
      if (is429 && attempt < 3) {
        await sleep(500 * Math.pow(2, attempt)); // 500ms → 1s → 2s
        attempt++;
        continue;
      }

      return res.status(r.status).json({ ok: false, error: `OpenAI ${r.status}: ${text.slice(0, 500)}` });
    }
  } catch (err) {
    console.error("[/api/chat] error:", err);
    return res.status(500).json({ ok: false, error: formatErr(err) });
  }
}
