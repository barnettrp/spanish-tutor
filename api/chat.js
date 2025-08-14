// api/chat.js
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  try {
    const { messages = [] } = req.body || {};
    const trimmed = trimHistory(messages);

    const body = {
      model: "gpt-4o-mini",
      max_output_tokens: 500,
      messages: trimmed,
    };

    let attempt = 0;
    while (true) {
      try {
        const r = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
          },
          body: JSON.stringify(body),
        });
        const text = await r.text();
        if (!r.ok) throw new Error(`OpenAI ${r.status}: ${text}`);
        const json = JSON.parse(text);
        const reply = json.choices?.[0]?.message?.content ?? "";
        return res.status(200).json({ ok: true, reply });
      } catch (e) {
        const msg = String(e?.message || e);
        const is429 = msg.includes(" 429") || /rate.?limit/i.test(msg);
        if (is429 && attempt < 3) {
          await sleep(500 * Math.pow(2, attempt));
          attempt++;
          continue;
        }
        throw e;
      }
    }
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: String(e?.message || e) });
  }
}

// helpers
function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }
function trimHistory(history, maxPairs = 12) {
  const sys = history.filter(m => m.role === "system");
  const rest = history.filter(m => m.role !== "system");
  const kept = rest.slice(-maxPairs * 2);
  return [...sys.slice(0,1), ...kept];
}
