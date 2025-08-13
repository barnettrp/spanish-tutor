import crypto from "crypto";
export function signSession(payload, secret){const b=Buffer.from(JSON.stringify(payload)).toString("base64url");const sig=crypto.createHmac("sha256",secret).update(b).digest("base64url");return b+"."+sig;}
export function verifySession(token, secret){if(!token)return null;const [b,sig]=token.split(".");if(!b||!sig)return null;const exp=crypto.createHmac("sha256",secret).update(b).digest("base64url");if(exp!==sig)return null;try{return JSON.parse(Buffer.from(b,"base64url").toString());}catch{return null;}}
export function parseCookies(req){const hdr=req.headers.get?.("cookie")||req.headers.cookie||"";const out={};hdr.split(/; */).forEach(kv=>{const i=kv.indexOf("=");if(i>0)out[kv.slice(0,i)]=decodeURIComponent(kv.slice(i+1));});return out;}
