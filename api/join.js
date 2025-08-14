// /api/join.js  (Vercel Serverless Function for static sites)
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  try {
    const { name, code } = req.body || {};
    if (!name || !code) return res.status(400).json({ error: "Missing name or code" });

    // TODO: validate code, create session, etc.
    return res.status(200).json({ ok: true, message: `Welcome, ${name}!` });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Server error" });
  }
}
