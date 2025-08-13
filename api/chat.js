import { createClient } from "@supabase/supabase-js";
import { verifySession } from "./_lib/util.js";
export const config = { runtime: "nodejs" };

function systemPrompt(mode){
  const shared = `You are "Spanish Tutor" for Mexican Spanish. Spanish-first replies; do NOT translate entire sentences unless asked. After replying, append a compact JSON object with this schema: {"corrections":[{"original":string,"corrected":string,"note_en":string}],"recap":{"new_words":[{"word":string,"meaning_en":string}],"grammar_point":string,"homework":string}} Keep arrays short (1–3 items). The UI hyperlinks each Spanish word; keep Spanish as plain text.`;
  const conv = `MODE: Conversation. Use mostly Spanish with short sentences (A1–B1). If the user writes in English, suggest a simple Spanish version they can repeat. Correct gently with a rewrite + simple explanation + 1 example.`;
  const imm = `MODE: Immersion. Use only Spanish unless the user asks for English. Keep vocab simple. Correct inline briefly. Prefer simplifying in Spanish rather than translating.`;
  const voice = `MODE: Voice. Use short, slow Spanish sentences (5–8 words). After the user speaks, if correct, repeat naturally; if incorrect, correct gently and ask them to try again.`;
  return [shared, mode==="conversation"?conv:mode==="immersion"?imm:voice].join("\n\n");
}

export default async function handler(req, res){
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  // session
  const cookie = (req.headers.cookie||"").split(/; */).reduce((a,k)=>{const i=k.indexOf("="); if(i>0)a[k.slice(0,i)]=decodeURIComponent(k.slice(i+1)); return a;},{});
  const token = cookie["party_session"]; if(!token) return res.status(401).json({ error: "Please join first." });
  const util = await import("./_lib/util.js");
  const sess = util.verifySession(token, process.env.PARTY_JWT_SECRET);
  if(!sess) return res.status(401).json({ error: "Please join first." });

  const { message, mode, useBoost } = req.body || {};
  if(!message) return res.status(400).json({ error: "Message required" });

  // quota
  const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const today = new Date().toISOString().slice(0,10);
  const { data: todays } = await supa.from("events").select("messages").eq("member_id", sess.member_id).eq("day", today);
  const used = (todays||[]).reduce((a,b)=>a+(b.messages||0),0);
  const limit = parseInt(process.env.DAILY_MSG_LIMIT || "100", 10);
  if (used >= limit) return res.status(429).json({ error: `Daily limit reached (${limit} messages).` });

  // model selection
  const modelBase  = process.env.OPENAI_MODEL || "gpt-5-mini";
  const modelBoost = process.env.OPENAI_MODEL_BOOST || "gpt-5";
  const chosenModel = useBoost ? modelBoost : modelBase;

  // call OpenAI
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
    headers: { "Authorization": "Bearer " + process.env.OPENAI_API_KEY, "Content-Type":"application/json" },
    body: JSON.stringify(payload)
  });
  if(!r.ok){ const err = await r.text().catch(()=> "API error"); return res.status(500).json({ error: "AI error", details: err.slice(0,200) }); }
  const data = await r.json();
  const content = data?.choices?.[0]?.message?.content || "";
  const usage = data?.usage || { prompt_tokens: 0, completion_tokens: 0 };
  const input = usage.prompt_tokens || usage.input_tokens || 0;
  const output = usage.completion_tokens || usage.output_tokens || 0;

  const m = content.match(/\{[\s\S]*\}$/); let main = content.trim(), meta=null; if(m){ try{ meta=JSON.parse(m[0]); main=content.slice(0, m.index).trim(); }catch{} }
  const inRate = parseFloat(process.env.GPT5_INPUT_PER_M || "1.25");
  const outRate = parseFloat(process.env.GPT5_OUTPUT_PER_M || "10.00");
  const cost = (input/1e6)*inRate + (output/1e6)*outRate;

  await supa.from("events").insert({ party_code: sess.party_code, member_id: sess.member_id, day: today, model: chosenModel, input_tokens: input, output_tokens: output, messages: 1, cost_usd: cost });

  return res.status(200).json({ reply: main, meta: meta || {}, usage: { input_tokens: input, output_tokens: output, cost_usd: cost, model: chosenModel } });
}
