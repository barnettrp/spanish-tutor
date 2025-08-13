import { createClient } from "@supabase/supabase-js";
export const config = { runtime: "nodejs" };
export default async function handler(req, res){
  const out = {};
  function has(name){ out[name] = !!process.env[name]; return out[name]; }
  has("SUPABASE_URL");
  has("SUPABASE_SERVICE_ROLE_KEY");
  has("PARTY_JWT_SECRET");
  has("PARTY_CODE");
  try {
    if (out.SUPABASE_URL && out.SUPABASE_SERVICE_ROLE_KEY) {
      const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
      const { error } = await supa.from("members").select("id").limit(1);
      out.db_ok = !error;
    } else {
      out.db_ok = false;
    }
  } catch {
    out.db_ok = false;
  }
  return res.status(200).json(out);
}
