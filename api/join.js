import { createClient } from "@supabase/supabase-js";
import { signSession } from "./_lib/util.js";

export const config = { runtime: "nodejs" };

// Read JSON body for Vercel Node functions
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

function need(name) {
  if (!process.env[name]) throw new Error(`MISSING_ENV:${name}`);
  return process.env[name];
}

export default async function handler(req, res){
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = await readJson(req);                  // <-- parse body
    const { name, code } = body || {};
    if (!name || !code) return res.status(400).json({ error: "Name and code required" });

    const PARTY_CODE   = need("PARTY_CODE");
    const PARTY_SEATS  = parseInt(process.env.PARTY_SEATS || "5", 10);
    const JWT_SECRET   = need("PARTY_JWT_SECRET");
    const SUPABASE_URL = need("SUPABASE_URL");
    const SUPA_KEY     = need("SUPABASE_SERVICE_ROLE_KEY");

    if (code !== PARTY_CODE) return res.status(401).json({ error: "Invalid code" });

    const supa = createClient(SUPABASE_URL, SUPA_KEY);

    const { data: members, error: mErr } = await supa
      .from("members").select("id,name").eq("party_code", PARTY_CODE);
    if (mErr) return res.status(500).json({ error: "Database error (members)" });

    const existing = (members || []).find(
      m => (m.name || "").toLowerCase() === String(name).toLowerCase()
    );

    if (existing) {
      const token = signSession({ member_id: existing.id, name, party_code: PARTY_CODE }, JWT_SECRET);
      res.setHeader("Set-Cookie", `party_session=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=2592000`);
      return res.status(200).json({ ok: true });
    }

    if ((members || []).length >= PARTY_SEATS) {
      return res.status(403).json({ error: "Party is full" });
    }

    const { data: ins, error: iErr } = await supa
      .from("members").insert({ party_code: PARTY_CODE, name }).select().single();
    if (iErr) return res.status(500).json({ error: "Database error (insert)" });

    const token = signSession({ member_id: ins.id, name, party_code: PARTY_CODE }, JWT_SECRET);
    res.setHeader("Set-Cookie", `party_session=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=2592000`);
    return res.status(200).json({ ok: true });

  } catch (e) {
    const msg = String(e?.message || "");
    if (msg.startsWith("MISSING_ENV:")) {
      return res.status(500).json({ error: `Missing environment variable ${msg.split(":")[1]}` });
    }
    return res.status(500).json({ error: "Server error" });
  }
}
