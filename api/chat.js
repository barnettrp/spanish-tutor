// api/chat.js — Vercel Node Serverless (NOT Edge)

// Small helpers
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function formatErr(e) { return typeof e === "string" ? e : (e?.message || "Unknown error"); }

function trimHistory(history, maxPairs = 12) {
  const sys = history.filter(m => m.role === "system");
  const rest = history.filter(m => m.role !== "system");
  const kept = rest.slice(-maxPairs * 2);
  return [...sys.slice(0, 1), ...kept];
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    // ---- 1) Ensure API key ----
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ ok: false, error: "OPENAI_API_KEY is not set" });
    }

    // ---- 2) Parse JSON body safely ----
    let body = req.body;
    if (typeof body === "string") {
      try { body = JSON.parse(body || "{}"); } catch { body = {}; }
    }
    if (!body || typeof body !== "object") body = {};

    // Accept either {messages: [...]} or {message: "text"}
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

    // Optional: trim history to keep payload small
    const messages = trimHistory(incoming);
    const totalChars = messages.reduce((n, m) => n + (m?.content?.length || 0), 0);
    if (totalChars > 20000) {
      return res.status(400).json({ ok: false, error: "Request too large after trimming" });
    }

    // ---- 3) Build OpenAI payload ----
    const payload = {
      model: "gpt-4o-mini",
      messages,
      max_tokens: 500,
      temperature: 0.4
    };

    // ---- 4) Call OpenAI with light backoff for 429s ----
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
        catch {
          return res.status(502).json({ ok: false, error: `OpenAI JSON parse failed: ${text.slice(0, 200)}` });
        }
        const reply = json?.choices?.[0]?.message?.content ?? "";
        return res.status(200).json({ ok: true, reply: String(reply).trim() });
      }

      const is429 = r.status === 429 || /rate.?limit/i.test(text);
      if (is429 && attempt < 3) {
        await sleep(500 * Math.pow(2, attempt)); // 500ms → 1s → 2s
        attempt++;
        continue;
      }

      // Bubble up OpenAI’s error so you can see it in the UI
      return res.status(r.status).json({ ok: false, error: `OpenAI ${r.status}: ${text.slice(0, 500)}` });
    }
  } catch (err) {
    console.error("[/api/chat] error:", err);
    return res.status(500).json({ ok: false, error: formatErr(err) });
  }
}
