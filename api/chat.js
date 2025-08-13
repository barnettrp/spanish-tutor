// add near top
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

// inside handler:
const body = await readJson(req);
const { message, mode, useBoost } = body || {};
if (!message) return res.status(400).json({ error: "Message required" });
