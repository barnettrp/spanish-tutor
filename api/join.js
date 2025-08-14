// api/join.js
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const { name, code } = req.body || {};
  if (!name || !code) return res.status(400).json({ error: "Missing name or code" });

  const token = "tok_" + Math.random().toString(36).slice(2);

  res.setHeader("Set-Cookie", [
    `party_token=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 7}`,
    `party_name=${encodeURIComponent(name)}; Path=/; SameSite=Lax; Max-Age=${60 * 60 * 24 * 7}`,
    `party_code=${encodeURIComponent(code)}; Path=/; SameSite=Lax; Max-Age=${60 * 60 * 24 * 7}`,
  ]);

  return res.status(200).json({ ok: true, token });
}
