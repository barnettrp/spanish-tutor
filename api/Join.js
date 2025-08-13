
import { createClient } from "@supabase/supabase-js";
import { signSession } from "./_lib/util.js";
export const config = { runtime: "nodejs" };
export default async function handler(req, res){
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try{
    const { name, code } = req.body || {};
    if(!name || !code) return res.status(400).json({ error: "Name and code required" });
    const PARTY_CODE = process.env.PARTY_CODE;
    const PARTY_SEATS = parseInt(process.env.PARTY_SEATS || "5", 10);
    if(code !== PARTY_CODE) return res.status(401).json({ error: "Invalid code" });
    const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const { data: members } = await supa.from("members").select("id,name").eq("party_code", PARTY_CODE);
    const existing = (members||[]).find(m => (m.name||"").toLowerCase() === String(name).toLowerCase());
    if(existing){
      const token = signSession({ member_id: existing.id, name, party_code: PARTY_CODE }, process.env.PARTY_JWT_SECRET);
      res.setHeader("Set-Cookie", `party_session=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=2592000`);
      return res.status(200).json({ ok: true });
    }
    if((members||[]).length >= PARTY_SEATS) return res.status(403).json({ error: "Party is full" });
    const { data: ins } = await supa.from("members").insert({ party_code: PARTY_CODE, name }).select().single();
    const token = signSession({ member_id: ins.id, name, party_code: PARTY_CODE }, process.env.PARTY_JWT_SECRET);
    res.setHeader("Set-Cookie", `party_session=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=2592000`);
    return res.status(200).json({ ok: true });
  }catch(e){ return res.status(500).json({ error: "Server error" }); }
}
