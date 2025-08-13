
import { createClient } from "@supabase/supabase-js";
export const config = { runtime: "nodejs" };
export default async function handler(req, res){
  const key = req.headers["x-admin-key"] || req.query.key;
  if (key !== process.env.ADMIN_KEY) return res.status(401).json({ error: "Unauthorized" });
  const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const since = new Date(Date.now() - 30*24*60*60*1000).toISOString().slice(0,10);
  const { data: members } = await supa.from("members").select("id,name,party_code");
  const { data: evs } = await supa.from("events").select("member_id,input_tokens,output_tokens,messages,cost_usd").gte("day", since);
  const byUser=new Map();let totIn=0,totOut=0,totMsg=0,totCost=0;for(const e of evs||[]){totIn+=e.input_tokens||0;totOut+=e.output_tokens||0;totMsg+=e.messages||0;totCost+=parseFloat(e.cost_usd||0);const u=byUser.get(e.member_id)||{input:0,output:0,messages:0,cost:0};u.input+=e.input_tokens||0;u.output+=e.output_tokens||0;u.messages+=e.messages||0;u.cost+=parseFloat(e.cost_usd||0);byUser.set(e.member_id,u);}
  const users=(members||[]).map(m=>({name:m.name,input_tokens:(byUser.get(m.id)?.input||0),output_tokens:(byUser.get(m.id)?.output||0),messages:(byUser.get(m.id)?.messages||0),cost_usd:(byUser.get(m.id)?.cost||0)}));
  const pricing={model:process.env.OPENAI_MODEL||"gpt-5-mini",input_per_million:parseFloat(process.env.GPT5_INPUT_PER_M||"1.25"),output_per_million:parseFloat(process.env.GPT5_OUTPUT_PER_M||"10.00")};
  return res.status(200).json({pricing,totals:{input_tokens:totIn,output_tokens:totOut,messages:totMsg,cost_usd:totCost},users});
}
