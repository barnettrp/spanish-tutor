import { verifySession } from "./_lib/util.js";

// Force Node runtime so 'crypto' in util.js is supported
export const config = { runtime: "nodejs" };

function parseCookieHeader(req) {
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

export default async function handler(req, res) {
  try {
    const cookies = parseCookieHeader(req);

    const secret = process.env.PARTY_JWT_SECRET;
    if (!secret) {
      return res
        .status(500)
        .json({ error: "Missing environment variable PARTY_JWT_SECRET" });
    }

    const sess = verifySession(cookies["party_session"], secret);
    if (!sess) return res.status(401).json({});

    return res.status(200).json({ name: sess.name });
  } catch (e) {
    console.error("api/me error:", e);
    return res.status(500).json({ error: "Server error" });
  }
}
