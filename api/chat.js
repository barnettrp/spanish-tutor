// api/chat.js
import { createClient } from "@supabase/supabase-js";
import { verifySession } from "./_lib/util.js";

export const config = { runtime: "nodejs" };

/** Read JSON body for Vercel Node serverless functions */
async function readJson(req) {
  return await new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      try { resolve(JSON.parse(data || "{}")); } catch (e) { reject(e); }
    });
    req.on("error", reject);
  });
}

/** Minimal cookie parser (Node runtime) */
function parseCookies(req) {
  const raw = (req?.headers && req.headers.cookie) || "";
  const out = {};
  for (const part of raw.split(/; */)) {
    if (!part) continue;
    const i = part.indexOf("=");
    if (i === -1) continue;
    const k = part.slice(0, i);
    const v = decodeURIComponent(part.slice(i + 1));
    out[k] = v;
  }
  return out;
}

/** System prompt tailored per mode */
function systemPrompt(mode){
  const shared = `You are "Spanish Tutor" for Mexican Spanish. Spanish-first replies; do NOT translate entire sentences unless asked. After replying, append a compact JSON object with this schema: {"corrections":[{"original":string,"corrected":string,"note_en":string}],"recap":{"new_words":[{"word":string,"meaning_en":string}],"grammar_point":string,"homework":string}} Keep arrays short (1–3 items). The UI hyperlinks each Spanish word; keep Spanish as plain text.`;
  const conv = `MODE: Conversation. Use mostly Spanish with short sentences (A1–B1). If the user writes in English, suggest a simple Spanish version they can repeat. Correct gently with a rewrite + simple explanation + 1 example.`;
  const imm  = `MODE: Immersion. Use only Spanish unless the user asks for English. Keep vocab simple. Correct inline briefly. Prefer simplifying in Spanish rather than translating.`;
  const voice= `MODE: Voice. Use short, slow Spanish sentences (5–8 words). After the user speaks, if correct, repeat naturally; if incorrect, correct gently and ask them to try again.`;
  return [shared, mode==="immersion" ? imm : mode==="voice" ? voice : conv].join("\n\n");
}

export default async function handler(req, res){
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // ---- Session check (must have joined first) ----
    const cookies = parseCookies(req);
    const token = cookies["party_session"];
    if (!token) return res.status(401).json({ error: "Please join first." });

    const secret = process.env.PARTY_JWT_SECRET;
    if (!secret) return res.status(500).json({ error: "Missing environment variable PARTY_JWT_SECRET" });

    const sess = verifySession(token, secret);
    if (!sess) return res.status(401).json({ error: "Please join first." });

    // ---- Read request body (patched) ----
    const body = await readJson(req);
    const { message, mode, useBoost } = body || {};
    if (!message) return res.status(400).json({ error: "Message required" });

    // ---- DB + quota ----
    const supaUrl = process.env.SUPABASE_URL;
    const supaKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supaUrl || !supaKey) return res.status(500).json({ error: "Missing Supabase configuration" });

    const supa = createClient(supaUrl, supaKey);
    const today = new Date().toISOString().slice(0,10);

    const { data: todays, error: tErr } = await supa
      .from("events")
      .select("messages")
      .eq("member_id", sess.member_id)
      .eq("day", today);

    if (tErr) return res.status(500).json({ error: "Server error" });

    const used = (todays || []).reduce((a,b) => a + (b.messages || 0), 0);
    const limit = parseInt(process.env.DAILY_MSG_LIMIT || "100", 10);
    if (used >= limit) {
      return res.status(429).json({ error: `Daily limit reached (${limit} messages).` });
    }

    // ---- Pick model (Smart Boost per-request) ----
    const modelBase  = process.env.OPENAI_MODEL || "gpt-5-mini";
    const modelBoost = process.env.OPENAI_MODEL_BOOST || "gpt-5";
    const chosenModel = useBoost ? modelBoost : modelBase;

    // ---- Call OpenAI ----
    const payload = {
      model: chosenModel,
      messages: [
        { role: "system", content: systemPrompt(mode || "conversation") },
        { role: "user", content: message }
      ],
      temperature: 0.7
    };

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + process.env.OPENAI_API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!r.ok) {
      const errText = await r.text().catch(() => "API error");
      return res.status(500).json({ error: "AI error", details: errText.slice(0, 200) });
    }

    const data = await r.json();
    const content = data?.choices?.[0]?.message?.content || "";
    const usage = data?.usage || { prompt_tokens: 0, completion_tokens: 0 };

    const inputTokens  = usage.prompt_tokens     ?? usage.input_tokens     ?? 0;
    const outputTokens = usage.completion_tokens ?? usage.output_tokens    ?? 0;

    // Extract compact JSON meta (if assistant appended it)
    const metaMatch = content.match(/\{[\s\S]*\}$/);
    let replyText = content.trim();
    let meta = null;
    if (metaMatch) {
      try {
        meta = JSON.parse(metaMatch[0]);
        replyText = content.slice(0, metaMatch.index).trim();
      } catch {
        // ignore bad meta
      }
    }

    // ---- Cost estimation (env-configurable rates) ----
    const inRate  = parseFloat(process.env.GPT5_INPUT_PER_M  || "1.25"); // $/1M input
    const outRate = parseFloat(process.env.GPT5_OUTPUT_PER_M || "10.00"); // $/1M output
    const costUsd = (inputTokens/1e6)*inRate + (outputTokens/1e6)*outRate;

    // ---- Log usage ----
    await supa.from("events").insert({
      party_code:   sess.party_code,
      member_id:    sess.member_id,
      day:          today,
      model:        chosenModel,
      input_tokens: inputTokens,
      output_tokens:outputTokens,
      messages:     1,
      cost_usd:     costUsd
    });

    // ---- Return to client ----
    return res.status(200).json({
      reply: replyText || "(sin respuesta)",
      meta:  meta || {},
      usage: {
        input_tokens:  inputTokens,
        output_tokens: outputTokens,
        cost_usd:      costUsd,
        model:         chosenModel
      }
    });

  } catch (e) {
    console.error("api/chat error:", e);
    return res.status(500).json({ error: "Server error" });
  }
}
