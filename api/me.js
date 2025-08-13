
import { verifySession, parseCookies } from "./_lib/util.js";
export const config = { runtime: "edge" };
export default async function handler(req){
  const cookies = parseCookies(req);
  const sess = verifySession(cookies["party_session"], process.env.PARTY_JWT_SECRET);
  if(!sess) return new Response(JSON.stringify({}), { status: 401, headers: { "content-type":"application/json" } });
  return new Response(JSON.stringify({ name: sess.name }), { headers: { "content-type":"application/json" } });
}
