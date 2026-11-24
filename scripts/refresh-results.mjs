import { calculateEdition, settleSelection } from "../src/settlement.mjs";
const env=process.env;
const accountId=(env.CLOUDFLARE_ACCOUNT_ID||"").trim();
const databaseId=(env.D1_DATABASE_ID||"").trim();
const cloudflareToken=(env.CLOUDFLARE_API_TOKEN||"").trim();
if(!accountId||!databaseId||!cloudflareToken)throw new Error("Missing CLOUDFLARE_ACCOUNT_ID, D1_DATABASE_ID or CLOUDFLARE_API_TOKEN GitHub secret.");
const endpoint="https://api.cloudflare.com/client/v4/accounts/"+accountId+"/d1/database/"+databaseId+"/query";
async function d1(sql,params=[]){
 const response=await fetch(endpoint,{method:"POST",headers:{Authorization:"Bearer "+cloudflareToken,"Content-Type":"application/json"},body:JSON.stringify({sql,params}),signal:AbortSignal.timeout(30000)});
 const payload=await response.json().catch(()=>null);
 if(!response.ok||payload?.success!==true)throw new Error("Cloudflare D1 query failed (HTTP "+response.status+"): "+JSON.stringify(payload?.errors||payload).slice(0,900));
 const result=payload.result?.[0];
 if(result?.success===false)throw new Error("Cloudflare D1 SQL failed: "+JSON.stringify(result.meta||result).slice(0,900));
 return result?.results||[];
}
const keys=[...new Set(["ODDS_API_KEY",...Array.from({length:8},(_,index)=>"ODDS_API_KEY"+(index+1)),"ODDSAPI_KEY","ODDSAPI_KEY1","ODDSAPI_KEY2","ODDSAPI_KEY3"].flatMap(name=>(env[name]||"").split(",")).map(value=>value.trim()).filter(Boolean))];
const schema=[
"CREATE TABLE IF NOT EXISTS result_selections (selection_id TEXT PRIMARY KEY, acca_id TEXT NOT NULL, product_type TEXT NOT NULL, headline TEXT NOT NULL, publish_date TEXT NOT NULL, event_id TEXT NOT NULL, sport_key TEXT NOT NULL, commence_time TEXT NOT NULL, home_team TEXT NOT NULL, away_team TEXT NOT NULL, market_key TEXT NOT NULL, market_name TEXT NOT NULL, selection_name TEXT NOT NULL, odds REAL NOT NULL, selection_status TEXT NOT NULL DEFAULT 'PENDING', home_score INTEGER, away_score INTEGER, outcome TEXT NOT NULL DEFAULT 'PENDING', settled_at TEXT, result_note TEXT NOT NULL DEFAULT '')",
"CREATE INDEX IF NOT EXISTS idx_result_selections_date ON result_selections(publish_date,product_type)",
"CREATE INDEX IF NOT EXISTS idx_result_selections_event ON result_selections(event_id)",
"CREATE TABLE IF NOT EXISTS edition_results (acca_id TEXT PRIMARY KEY, product_type TEXT NOT NULL, headline TEXT NOT NULL, publish_date TEXT NOT NULL, leg_count INTEGER NOT NULL DEFAULT 0, won_legs INTEGER NOT NULL DEFAULT 0, lost_legs INTEGER NOT NULL DEFAULT 0, void_legs INTEGER NOT NULL DEFAULT 0, pending_legs INTEGER NOT NULL DEFAULT 0, pass_legs INTEGER NOT NULL DEFAULT 0, outcome TEXT NOT NULL DEFAULT 'PENDING', effective_odds REAL, profit REAL, result_note TEXT NOT NULL DEFAULT '', settled_at TEXT)"
];
for(const sql of schema)await d1(sql);
function yesterdayNairobi(){const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"Africa/Nairobi",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());const date=new Date(parts+"T12:00:00Z");date.setUTCDate(date.getUTCDate()-1);return date.toISOString().slice(0,10);}
function scoreMap(event){const scores=event.scores||[];const homeValue=scores.find(item=>item.name===event.home_team)?.score;const awayValue=scores.find(item=>item.name===event.away_team)?.score;if(homeValue===null||homeValue===undefined||awayValue===null||awayValue===undefined)return null;const home=Number(homeValue),away=Number(awayValue);return Number.isInteger(home)&&Number.isInteger(away)&&home>=0&&away>=0?{home,away}:null;}
async function fetchScores(sportKey){
 for(let i=0;i<keys.length;i++){
  const url=new URL("https://api.the-odds-api.com/v4/sports/"+encodeURIComponent(sportKey)+"/scores");
  url.searchParams.set("daysFrom","3");url.searchParams.set("dateFormat","iso");url.searchParams.set("apiKey",keys[i]);
  try{
   const response=await fetch(url,{headers:{"User-Agent":"AccaForge/1.0"},signal:AbortSignal.timeout(30000)});
   if(response.ok)return await response.json();
   console.warn("Odds API score request for "+sportKey+" returned HTTP "+response.status+" on key slot "+(i+1)+".");
   if(![401,403,429].includes(response.status))return null;
  }catch(error){console.warn("Score request failed for "+sportKey+": "+String(error));}
 }
 return null;
}

async function recalculateEdition(accaId){
 const rows=await d1("SELECT selection_status,selection_name,outcome,odds FROM result_selections WHERE acca_id=? ORDER BY selection_id",[accaId]);
 const edition=calculateEdition(rows);
 const meta=(await d1("SELECT product_type,headline,publish_date FROM result_selections WHERE acca_id=? LIMIT 1",[accaId]))[0];
 if(!meta)return;
 const sql="INSERT INTO edition_results (acca_id,product_type,headline,publish_date,leg_count,won_legs,lost_legs,void_legs,pending_legs,pass_legs,outcome,effective_odds,profit,result_note,settled_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,CASE WHEN ? IN ('WON','LOST','VOID','NO_SELECTION') THEN CURRENT_TIMESTAMP ELSE NULL END) ON CONFLICT(acca_id) DO UPDATE SET product_type=excluded.product_type,headline=excluded.headline,publish_date=excluded.publish_date,leg_count=excluded.leg_count,won_legs=excluded.won_legs,lost_legs=excluded.lost_legs,void_legs=excluded.void_legs,pending_legs=excluded.pending_legs,pass_legs=excluded.pass_legs,outcome=excluded.outcome,effective_odds=excluded.effective_odds,profit=excluded.profit,result_note=excluded.result_note,settled_at=CASE WHEN excluded.outcome IN ('WON','LOST','VOID','NO_SELECTION') THEN COALESCE(edition_results.settled_at,CURRENT_TIMESTAMP) ELSE NULL END";
 await d1(sql,[accaId,meta.product_type,meta.headline,meta.publish_date,edition.legs,edition.won,edition.lost,edition.void,edition.pending,edition.pass,edition.outcome,edition.effectiveOdds,edition.profit,edition.note,edition.outcome]);
}
const date=yesterdayNairobi();
await d1("INSERT OR IGNORE INTO result_selections (selection_id,acca_id,product_type,headline,publish_date,event_id,sport_key,commence_time,home_team,away_team,market_key,market_name,selection_name,odds,selection_status,outcome) SELECT s.id,a.id,a.product_type,a.headline,a.publish_date,s.event_id,s.sport_key,s.commence_time,s.home_team,s.away_team,s.market_key,s.market_name,s.selection_name,s.odds,CASE WHEN s.selection_status='PASS' THEN 'PASS' ELSE 'PENDING' END,CASE WHEN s.selection_status='PASS' THEN 'PASS' ELSE 'PENDING' END FROM selections s JOIN accas a ON a.id=s.acca_id WHERE a.status='published' AND a.publish_date=?",[date]);
const pending=await d1("SELECT DISTINCT sport_key FROM result_selections WHERE publish_date>=date(?,'-2 days') AND outcome='PENDING'",[date]);
console.log("Refreshing results for "+date+" directly from GitHub Actions into Cloudflare D1. Pending competitions: "+pending.length+".");
if(!keys.length)throw new Error("No Odds API keys configured in GitHub Actions; cannot refresh results.");
let settled=0;
for(const item of pending){
 const events=await fetchScores(item.sport_key);
 if(!events)continue;
 for(const event of events){
  if(!event.completed)continue;
  const score=scoreMap(event);if(!score)continue;
  const picks=await d1("SELECT selection_id,acca_id,product_type,headline,publish_date,event_id,sport_key,commence_time,home_team,away_team,market_key,market_name,selection_name,odds,selection_status FROM result_selections WHERE event_id=? AND outcome='PENDING' AND publish_date>=date(?,'-2 days')",[event.id,date]);
  for(const pick of picks){
   const result=settleSelection(pick,score.home,score.away);
   await d1("UPDATE result_selections SET home_score=?,away_score=?,outcome=?,settled_at=CURRENT_TIMESTAMP,result_note=? WHERE selection_id=?",[score.home,score.away,result.outcome,result.note,pick.selection_id]);
   if(result.outcome!=="PENDING")settled++;
   await recalculateEdition(pick.acca_id);
  }
 }
}
const counts=await d1("SELECT outcome,COUNT(*) AS count FROM result_selections WHERE publish_date=? GROUP BY outcome",[date]);
console.log("Results refresh complete: "+JSON.stringify({date,settled,counts}));
