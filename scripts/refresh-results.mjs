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
const keys=[...new Set(["ODDS_API_KEY","ODDSAPI_KEY","ODDSAPI_KEY1","ODDSAPI_KEY2","ODDSAPI_KEY3"].flatMap(name=>(env[name]||"").split(",")).map(value=>value.trim()).filter(Boolean))];
const schema=[
"CREATE TABLE IF NOT EXISTS result_selections (selection_id TEXT PRIMARY KEY, acca_id TEXT NOT NULL, product_type TEXT NOT NULL, headline TEXT NOT NULL, publish_date TEXT NOT NULL, event_id TEXT NOT NULL, sport_key TEXT NOT NULL, commence_time TEXT NOT NULL, home_team TEXT NOT NULL, away_team TEXT NOT NULL, market_key TEXT NOT NULL, market_name TEXT NOT NULL, selection_name TEXT NOT NULL, odds REAL NOT NULL, selection_status TEXT NOT NULL DEFAULT 'PENDING', home_score INTEGER, away_score INTEGER, outcome TEXT NOT NULL DEFAULT 'PENDING', settled_at TEXT, result_note TEXT NOT NULL DEFAULT '')",
"CREATE INDEX IF NOT EXISTS idx_result_selections_date ON result_selections(publish_date,product_type)",
"CREATE INDEX IF NOT EXISTS idx_result_selections_event ON result_selections(event_id)"
];
for(const sql of schema)await d1(sql);
function yesterdayNairobi(){const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"Africa/Nairobi",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());const date=new Date(parts+"T12:00:00Z");date.setUTCDate(date.getUTCDate()-1);return date.toISOString().slice(0,10);}
function scoreMap(event){const scores=event.scores||[];const home=Number(scores.find(item=>item.name===event.home_team)?.score);const away=Number(scores.find(item=>item.name===event.away_team)?.score);return Number.isFinite(home)&&Number.isFinite(away)?{home,away}:null;}
function settle(row,home,away){
 const market=row.market_key.toLowerCase(),pick=row.selection_name.trim(),total=home+away;
 if(row.selection_status==="PASS"||pick.toUpperCase()==="PASS")return {outcome:"PASS",note:"No selection was published for this fixture."};
 if(["h2h","moneyline","match_winner"].includes(market)){
  const winner=home>away?row.home_team:away>home?row.away_team:"Draw";
  const won=pick.toLowerCase()===winner.toLowerCase()||((pick.toLowerCase()==="1"||pick.toLowerCase()==="home")&&home>away)||((pick.toLowerCase()==="2"||pick.toLowerCase()==="away")&&away>home)||((pick.toLowerCase()==="x"||pick.toLowerCase()==="draw")&&home===away);
  return {outcome:won?"WON":"LOST",note:"Full-time result: "+home+"–"+away+"."};
 }
 if(market==="btts"||market==="both_teams_to_score"){
  const yes=home>0&&away>0,wantsYes=/yes|both teams to score/i.test(pick),wantsNo=/no|not/i.test(pick);
  if(!wantsYes&&!wantsNo)return {outcome:"PENDING",note:"Market selection could not be interpreted safely."};
  return {outcome:yes===wantsYes?"WON":"LOST",note:"Full-time score: "+home+"–"+away+"."};
 }
 if(market==="totals"||market==="alternate_totals"){
  const line=Number((pick+" "+row.market_name).match(/\b(\d+(?:\.\d+)?)\b/)?.[1]),isOver=/over/i.test(pick),isUnder=/under/i.test(pick);
  if(!Number.isFinite(line)||(!isOver&&!isUnder))return {outcome:"PENDING",note:"Goal line could not be interpreted safely."};
  if(total===line)return {outcome:"VOID",note:"The total landed exactly on the line; selection is treated as a push."};
  return {outcome:(isOver?total>line:total<line)?"WON":"LOST",note:"Full-time total: "+total+" goals."};
 }
 if(market==="double_chance"){
  const draw=home===away,homeWin=home>away,awayWin=away>home,value=pick.toLowerCase().replace(/\s/g,"");
  const won=value.includes("1x")?(homeWin||draw):value.includes("x2")?(awayWin||draw):value.includes("12")?(homeWin||awayWin):false;
  if(!/1x|x2|12/.test(value))return {outcome:"PENDING",note:"Double-chance selection could not be interpreted safely."};
  return {outcome:won?"WON":"LOST",note:"Full-time result: "+home+"–"+away+"."};
 }
 if(market==="draw_no_bet"){
  const selectedHome=pick.toLowerCase()===row.home_team.toLowerCase(),selectedAway=pick.toLowerCase()===row.away_team.toLowerCase();
  if(home===away)return {outcome:"VOID",note:"Match finished level; draw-no-bet selection is void."};
  if(!selectedHome&&!selectedAway)return {outcome:"PENDING",note:"Team selection could not be identified safely."};
  return {outcome:(selectedHome?home>away:away>home)?"WON":"LOST",note:"Full-time result: "+home+"–"+away+"."};
 }
 return {outcome:"PENDING",note:"This market needs a specialist result feed; no outcome has been guessed."};
}
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
   const result=settle(pick,score.home,score.away);
   await d1("UPDATE result_selections SET home_score=?,away_score=?,outcome=?,settled_at=CURRENT_TIMESTAMP,result_note=? WHERE selection_id=?",[score.home,score.away,result.outcome,result.note,pick.selection_id]);
   if(result.outcome!=="PENDING")settled++;
  }
 }
}
const counts=await d1("SELECT outcome,COUNT(*) AS count FROM result_selections WHERE publish_date=? GROUP BY outcome",[date]);
console.log("Results refresh complete: "+JSON.stringify({date,settled,counts}));
