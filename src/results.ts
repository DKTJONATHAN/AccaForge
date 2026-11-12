export interface ResultsEnv { DB: D1Database; ODDSAPI_KEY?: string; ODDSAPI_KEY1?: string; ODDSAPI_KEY2?: string; ODDSAPI_KEY3?: string; ODDS_API_KEY?: string }
type PickRow={selection_id:string;acca_id:string;product_type:string;headline:string;publish_date:string;event_id:string;sport_key:string;commence_time:string;home_team:string;away_team:string;market_key:string;market_name:string;selection_name:string;odds:number;selection_status:string};
type ScoreEvent={id:string;sport_key:string;home_team:string;away_team:string;completed:boolean;scores?:Array<{name:string;score:string|null}>};
const resultSchema=[
"CREATE TABLE IF NOT EXISTS result_selections (selection_id TEXT PRIMARY KEY, acca_id TEXT NOT NULL, product_type TEXT NOT NULL, headline TEXT NOT NULL, publish_date TEXT NOT NULL, event_id TEXT NOT NULL, sport_key TEXT NOT NULL, commence_time TEXT NOT NULL, home_team TEXT NOT NULL, away_team TEXT NOT NULL, market_key TEXT NOT NULL, market_name TEXT NOT NULL, selection_name TEXT NOT NULL, odds REAL NOT NULL, selection_status TEXT NOT NULL DEFAULT 'PENDING', home_score INTEGER, away_score INTEGER, outcome TEXT NOT NULL DEFAULT 'PENDING', settled_at TEXT, result_note TEXT NOT NULL DEFAULT '')",
"CREATE INDEX IF NOT EXISTS idx_result_selections_date ON result_selections(publish_date,product_type)",
"CREATE INDEX IF NOT EXISTS idx_result_selections_event ON result_selections(event_id)"
];
async function ensureResultsSchema(env:ResultsEnv){for(const sql of resultSchema)await env.DB.prepare(sql).run();}
function oddsApiKeys(env:ResultsEnv){return [...new Set([env.ODDSAPI_KEY,env.ODDSAPI_KEY1,env.ODDSAPI_KEY2,env.ODDSAPI_KEY3,env.ODDS_API_KEY].map(key=>key?.trim()).filter((key):key is string=>Boolean(key)))];}
async function fetchScoresWithRotation(env:ResultsEnv,sportKey:string):Promise<ScoreEvent[]|null>{
 const keys=oddsApiKeys(env);
 for(let index=0;index<keys.length;index++){
  const endpoint=new URL("https://api.the-odds-api.com/v4/sports/"+encodeURIComponent(sportKey)+"/scores");
  endpoint.searchParams.set("daysFrom","3");endpoint.searchParams.set("dateFormat","iso");endpoint.searchParams.set("apiKey",keys[index]);
  try{
   const response=await fetch(endpoint,{headers:{"User-Agent":"AccaForge/1.0"}});
   if(response.ok)return await response.json() as ScoreEvent[];
   console.error("Results feed key slot",index+1,"failed for",sportKey,"with HTTP",response.status);
   if(![401,403,429].includes(response.status))return null;
  }catch(error){console.error("Results feed request failed for",sportKey,"on key slot",index+1,error);}
 }
 return null;
}
function yesterdayNairobi(){const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"Africa/Nairobi",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());const date=new Date(parts+"T12:00:00Z");date.setUTCDate(date.getUTCDate()-1);return date.toISOString().slice(0,10);}
function scoreMap(event:ScoreEvent){const scores=event.scores||[];const home=Number(scores.find(item=>item.name===event.home_team)?.score);const away=Number(scores.find(item=>item.name===event.away_team)?.score);return Number.isFinite(home)&&Number.isFinite(away)?{home,away}:null;}
function settle(row:PickRow,home:number,away:number){
 const market=row.market_key.toLowerCase(),pick=row.selection_name.trim(),total=home+away;
 if(row.selection_status==="PASS"||pick.toUpperCase()==="PASS")return {outcome:"PASS",note:"No selection was published for this fixture."};
 if(["h2h","moneyline","match_winner"].includes(market)){
  const winner=home>away?row.home_team:away>home?row.away_team:"Draw";
  const won=pick.toLowerCase()===winner.toLowerCase()||((pick.toLowerCase()==="1"||pick.toLowerCase()==="home")&&home>away)||((pick.toLowerCase()==="2"||pick.toLowerCase()==="away")&&away>home)||((pick.toLowerCase()==="x"||pick.toLowerCase()==="draw")&&home===away);
  return {outcome:won?"WON":"LOST",note:"Full-time result: "+home+"–"+away+"."};
 }
 if(market==="btts"||market==="both_teams_to_score"){
  const yes=home>0&&away>0;const wantsYes=/yes|both teams to score/i.test(pick);const wantsNo=/no|not/i.test(pick);
  if(!wantsYes&&!wantsNo)return {outcome:"PENDING",note:"Market selection could not be interpreted safely."};
  return {outcome:yes===wantsYes?"WON":"LOST",note:"Full-time score: "+home+"–"+away+"."};
 }
 if(market==="totals"||market==="alternate_totals"){
  const line=Number((pick+" "+row.market_name).match(/\b(\d+(?:\.\d+)?)\b/)?.[1]);
  const isOver=/over/i.test(pick),isUnder=/under/i.test(pick);
  if(!Number.isFinite(line)||(!isOver&&!isUnder))return {outcome:"PENDING",note:"Goal line could not be interpreted safely."};
  const won=isOver?total>line:total<line;
  if(total===line)return {outcome:"VOID",note:"The total landed exactly on the line; selection is treated as a push."};
  return {outcome:won?"WON":"LOST",note:"Full-time total: "+total+" goals."};
 }
 if(market==="double_chance"){
  const draw=home===away,homeWin=home>away,awayWin=away>home;
  const value=pick.toLowerCase().replace(/\s/g,"");
  const won=value.includes("1x")?(homeWin||draw):value.includes("x2")?(awayWin||draw):value.includes("12")?(homeWin||awayWin):false;
  if(!/1x|x2|12/.test(value))return {outcome:"PENDING",note:"Double-chance selection could not be interpreted safely."};
  return {outcome:won?"WON":"LOST",note:"Full-time result: "+home+"–"+away+"."};
 }
 if(market==="draw_no_bet"){
  const selectedHome=pick.toLowerCase()===row.home_team.toLowerCase();
  const selectedAway=pick.toLowerCase()===row.away_team.toLowerCase();
  if(home===away)return {outcome:"VOID",note:"Match finished level; draw-no-bet selection is void."};
  if(!selectedHome&&!selectedAway)return {outcome:"PENDING",note:"Team selection could not be identified safely."};
  return {outcome:(selectedHome?home>away:away>home)?"WON":"LOST",note:"Full-time result: "+home+"–"+away+"."};
 }
 return {outcome:"PENDING",note:"This market needs a specialist result feed; no outcome has been guessed."};
}
export async function refreshYesterdayResults(env:ResultsEnv){
 await ensureResultsSchema(env);
 const date=yesterdayNairobi();
 await env.DB.prepare("INSERT OR IGNORE INTO result_selections (selection_id,acca_id,product_type,headline,publish_date,event_id,sport_key,commence_time,home_team,away_team,market_key,market_name,selection_name,odds,selection_status,outcome) SELECT s.id,a.id,a.product_type,a.headline,a.publish_date,s.event_id,s.sport_key,s.commence_time,s.home_team,s.away_team,s.market_key,s.market_name,s.selection_name,s.odds,CASE WHEN s.selection_status='PASS' THEN 'PASS' ELSE 'PENDING' END,CASE WHEN s.selection_status='PASS' THEN 'PASS' ELSE 'PENDING' END FROM selections s JOIN accas a ON a.id=s.acca_id WHERE a.status='published' AND a.publish_date=?").bind(date).run();
 const pending=(await env.DB.prepare("SELECT DISTINCT sport_key FROM result_selections WHERE publish_date >= date(?, '-2 days') AND outcome='PENDING'").bind(date).all<{sport_key:string}>()).results||[];
 if(!oddsApiKeys(env).length)return {date,fixtures:pending.length,settled:0,needsOddsApiSecret:true};
 let settled=0;
 for(const item of pending){
  const events=await fetchScoresWithRotation(env,item.sport_key);
  if(!events)continue;
  for(const event of events||[]){
   if(!event.completed)continue;
   const score=scoreMap(event);if(!score)continue;
   const picks=(await env.DB.prepare("SELECT selection_id,acca_id,product_type,headline,publish_date,event_id,sport_key,commence_time,home_team,away_team,market_key,market_name,selection_name,odds,selection_status FROM result_selections WHERE event_id=? AND outcome='PENDING' AND publish_date >= date(?, '-2 days')").bind(event.id,date).all<PickRow>()).results||[];
   for(const pick of picks){
    const result=settle(pick,score.home,score.away);
    await env.DB.prepare("UPDATE result_selections SET home_score=?,away_score=?,outcome=?,settled_at=CURRENT_TIMESTAMP,result_note=? WHERE selection_id=?").bind(score.home,score.away,result.outcome,result.note,pick.selection_id).run();
    if(result.outcome!=="PENDING")settled++;
   }
  }
 }
 const counts=await env.DB.prepare("SELECT outcome,COUNT(*) AS count FROM result_selections WHERE publish_date=? GROUP BY outcome").bind(date).all<{outcome:string;count:number}>();
 return {date,settled,counts:counts.results||[],needsOddsApiSecret:false};
}
export async function getYesterdayResults(env:ResultsEnv){
 await ensureResultsSchema(env);
 const date=yesterdayNairobi();
 await env.DB.prepare("INSERT OR IGNORE INTO result_selections (selection_id,acca_id,product_type,headline,publish_date,event_id,sport_key,commence_time,home_team,away_team,market_key,market_name,selection_name,odds,selection_status,outcome) SELECT s.id,a.id,a.product_type,a.headline,a.publish_date,s.event_id,s.sport_key,s.commence_time,s.home_team,s.away_team,s.market_key,s.market_name,s.selection_name,s.odds,CASE WHEN s.selection_status='PASS' THEN 'PASS' ELSE 'PENDING' END,CASE WHEN s.selection_status='PASS' THEN 'PASS' ELSE 'PENDING' END FROM selections s JOIN accas a ON a.id=s.acca_id WHERE a.status='published' AND a.publish_date=?").bind(date).run();
 const rows=(await env.DB.prepare("SELECT * FROM result_selections WHERE publish_date = ? ORDER BY CASE product_type WHEN 'safe_picks' THEN 1 WHEN 'super_5' THEN 2 WHEN 'super_10' THEN 3 ELSE 4 END,commence_time,acca_id").bind(date).all<any>()).results||[];
 const summary={total:rows.length,won:rows.filter(row=>row.outcome==="WON").length,lost:rows.filter(row=>row.outcome==="LOST").length,pending:rows.filter(row=>row.outcome==="PENDING").length,void:rows.filter(row=>row.outcome==="VOID").length,pass:rows.filter(row=>row.outcome==="PASS").length};
 const accuracy=summary.won+summary.lost?Math.round(summary.won/(summary.won+summary.lost)*100):null;
 const marketSummary=(await env.DB.prepare("SELECT market_key,market_name,COUNT(*) AS total,SUM(CASE WHEN outcome='WON' THEN 1 ELSE 0 END) AS won,SUM(CASE WHEN outcome='LOST' THEN 1 ELSE 0 END) AS lost,SUM(CASE WHEN outcome='PENDING' THEN 1 ELSE 0 END) AS pending FROM result_selections WHERE publish_date = ? GROUP BY market_key,market_name ORDER BY total DESC,market_name").bind(date).all<{market_key:string;market_name:string;total:number;won:number;lost:number;pending:number}>()).results||[];
 return {date,rows,summary,accuracy,marketSummary,windowDays:1,needsOddsApiSecret:!oddsApiKeys(env).length};
}

type TrackAggregate={group_key:string;label:string;total:number;won:number;lost:number;void:number;pending:number;pass:number;profit:number;settled:number;average_odds:number|null;first_date:string|null;last_date:string|null};
function trackRow(row:TrackAggregate){
 const settled=Number(row.won||0)+Number(row.lost||0);
 return {key:row.group_key,label:row.label,total:Number(row.total||0),won:Number(row.won||0),lost:Number(row.lost||0),void:Number(row.void||0),pending:Number(row.pending||0),pass:Number(row.pass||0),settled,averageOdds:row.average_odds===null?null:Number(row.average_odds),profit:Number(row.profit||0),roi:settled?Number(row.profit||0)/settled*100:null,firstDate:row.first_date,lastDate:row.last_date};
}
export async function getTrackRecord(env:ResultsEnv){
 await ensureResultsSchema(env);
 const aggregate="COUNT(*) AS total,SUM(CASE WHEN outcome='WON' THEN 1 ELSE 0 END) AS won,SUM(CASE WHEN outcome='LOST' THEN 1 ELSE 0 END) AS lost,SUM(CASE WHEN outcome='VOID' THEN 1 ELSE 0 END) AS void,SUM(CASE WHEN outcome='PENDING' THEN 1 ELSE 0 END) AS pending,SUM(CASE WHEN outcome='PASS' THEN 1 ELSE 0 END) AS pass,SUM(CASE WHEN outcome='WON' THEN odds-1 WHEN outcome='LOST' THEN -1 ELSE 0 END) AS profit,SUM(CASE WHEN outcome IN ('WON','LOST') THEN 1 ELSE 0 END) AS settled,AVG(CASE WHEN outcome IN ('WON','LOST') THEN odds END) AS average_odds,MIN(publish_date) AS first_date,MAX(publish_date) AS last_date";
 const overall=await env.DB.prepare("SELECT "+aggregate+" FROM result_selections").first<any>();
 const formats=(await env.DB.prepare("SELECT product_type AS group_key,product_type AS label,"+aggregate+" FROM result_selections GROUP BY product_type ORDER BY product_type").all<TrackAggregate>()).results||[];
 const markets=(await env.DB.prepare("SELECT market_key AS group_key,market_name AS label,"+aggregate+" FROM result_selections GROUP BY market_key,market_name ORDER BY settled DESC,total DESC").all<TrackAggregate>()).results||[];
 const months=(await env.DB.prepare("SELECT substr(publish_date,1,7) AS group_key,substr(publish_date,1,7) AS label,"+aggregate+" FROM result_selections GROUP BY substr(publish_date,1,7) ORDER BY group_key DESC LIMIT 24").all<TrackAggregate>()).results||[];
 const summary=trackRow({group_key:"all",label:"All recorded selections",...overall} as TrackAggregate);
 const history=await env.DB.prepare("SELECT COUNT(DISTINCT publish_date) AS tracked_days,MAX(settled_at) AS last_settled_at FROM result_selections").first<{tracked_days:number;last_settled_at:string|null}>();
 return {summary,byFormat:formats.map(trackRow),byMarket:markets.map(trackRow),byMonth:months.map(trackRow),coverage:{firstDate:overall?.first_date||null,lastDate:overall?.last_date||null,trackedDays:Number(history?.tracked_days||0),lastSettledAt:history?.last_settled_at||null},methodology:{stake:1,profit:"A flat 1-unit stake per WON or LOST selection; a win returns odds minus 1 unit profit, a loss loses 1 unit, and void/pending/PASS selections are excluded from ROI.",roi:"Net flat-stake profit divided by the number of settled WON and LOST selections. Void, pending and PASS selections are excluded from the denominator.",accuracy:"WON divided by WON plus LOST. Void, pending and PASS selections are excluded.",scope:"Only selections present in the AccaForge results database are counted. The date range shown is the available recorded history, not a claim of complete lifetime coverage."}};
}
export async function trackRecordApi(env:ResultsEnv){try{return Response.json(await getTrackRecord(env),{headers:{"Cache-Control":"public, max-age=120, s-maxage=300, stale-while-revalidate=900"}});}catch(error){console.error("AccaForge track record read failed",error);return Response.json({error:"Track record is temporarily unavailable."},{status:500});}}

export async function resultsApi(env:ResultsEnv){try{return Response.json(await getYesterdayResults(env),{headers:{"Cache-Control":"public, max-age=60, s-maxage=180, stale-while-revalidate=600"}});}catch(error){console.error("AccaForge results read failed",error);return Response.json({error:"Results are temporarily unavailable."},{status:500});}}
