import { createHash } from "node:crypto";

const env=process.env;
const accountId=(env.CLOUDFLARE_ACCOUNT_ID||"").trim();
const databaseId=(env.D1_DATABASE_ID||"").trim();
const cloudflareToken=(env.CLOUDFLARE_API_TOKEN||"").trim();
if(!accountId||!databaseId||!cloudflareToken)throw new Error("Missing CLOUDFLARE_ACCOUNT_ID, D1_DATABASE_ID or CLOUDFLARE_API_TOKEN GitHub secret.");
const d1Endpoint="https://api.cloudflare.com/client/v4/accounts/"+accountId+"/d1/database/"+databaseId+"/query";
async function d1(sql,params=[]){
 const response=await fetch(d1Endpoint,{method:"POST",headers:{Authorization:"Bearer "+cloudflareToken,"Content-Type":"application/json"},body:JSON.stringify({sql,params}),signal:AbortSignal.timeout(30000)});
 const payload=await response.json().catch(()=>null);
 if(!response.ok||payload?.success!==true)throw new Error("Cloudflare D1 query failed (HTTP "+response.status+"): "+JSON.stringify(payload?.errors||payload).slice(0,1000));
 const result=payload.result?.[0];
 if(result?.success===false)throw new Error("Cloudflare D1 SQL failed: "+JSON.stringify(result.meta||result).slice(0,1000));
 return result?.results||[];
}
function apiKeys(names){return [...new Set(names.flatMap(name=>(env[name]||"").split(",")).map(value=>value.trim()).filter(Boolean))];}
const oddsKeys=apiKeys(["ODDS_API_KEY","ODDSAPI_KEY","ODDSAPI_KEY1","ODDSAPI_KEY2","ODDSAPI_KEY3"]);
const groqKeys=apiKeys(["GROQ_API_KEY","GROQ_API_KEY1","GROQ_API_KEY2","GEMINI_API_KEY","GEMINI_API_KEY1","GEMINI_API_KEY2"]);
if(!oddsKeys.length)throw new Error("No Odds API keys were supplied to GitHub Actions.");
if(!groqKeys.length)throw new Error("No Groq API keys were supplied to GitHub Actions.");
console.log("ERROR: Full script restore incomplete - contact needed. This is a truncated restore.");
process.exit(1);
