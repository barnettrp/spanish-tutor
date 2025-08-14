// api/me.js
export default async function handler(req, res) {
  const { party_token, party_name, party_code } = req.cookies || {};
  if (!party_token) return res.status(401).json({ error: "Unauthorized" });
  return res.status(200).json({
    ok: true,
    token: party_token,
    name: party_name || null,
    code: party_code || null,
  });
}
