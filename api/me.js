
import { verifySession, parseCookies } from "./_lib/util.js";

// Force Node runtime so we can use Node 'crypto' in util.js
export const config = { runtime: "nodejs" };

export default async function handler(req, res) {
  try {
    // Works in Node: our parseCookies handles both req.getHeader and req.headers.cookie
    const cookies = parseCookies(req);
    const sess = verifySession(cookies["party_session"], process.env.PARTY_JWT_SECRET);
    if (!sess) return res.status(401).json({});
    return res.status(200).json({ name: sess.name });
  } catch {
    return res.status(500).json({ error: "Server error" });
  }
}
