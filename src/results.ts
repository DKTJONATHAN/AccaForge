import { calculateEdition, settleSelection } from "./settlement.mjs";
export interface ResultsEnv { DB: D1Database; ODDSAPI_KEY?: string; ODDSAPI_KEY1?: string; ODDSAPI_KEY2?: string; ODDSAPI_KEY3?: string; ODDS_API_KEY?: string }
type PickRow={selection_id:string;acca_id:string;product_type:string;headline:string;publish_date:string;event_id:string;sport_key:string;commence_time:string;home_team:string;away_team:string;market_key:string;market_name:string;selection_name:string;odds:number;selection_status:string};
type ScoreEvent={id:string;sport_key:string;home_team:string;away_team:string;completed:boolean;scores?:Array<{name:string;score:string|null}>};
const resultSchema=[
"CREATE TABLE IF NOT EXISTS result_selections (selection_id TEXT PRIMARY KEY, acca_id TEXT NOT NULL, product_type TEXT NOT NULL, headline TEXT NOT NULL, publish_date TEXT NOT NULL, event_id TEXT NOT NULL, sport_key TEXT NOT NULL, commence_time TEXT NOT NULL, home_team TEXT NOT NULL, away_team TEXT NOT NULL, market_key TEXT NOT NULL, market_name TEXT NOT NULL, selection_name TEXT NOT NULL, odds REAL NOT NULL, selection_status TEXT NOT NULL DEFAULT 'PENDING', home_score INTEGER, away_score INTEGER, outcome TEXT NOT NULL DEFAULT 'PENDING', settled_at TEXT, result_note TEXT NOT NULL DEFAULT '')",
"CREATE INDEX IF NOT EXISTS idx_result_selections_date ON result_selections(publish_date,product_type)",
"CREATE INDEX IF NOT EXISTS idx_result_selections_event ON result_selections(event_id)",
"CREATE TABLE IF NOT EXISTS edition_results (acca_id TEXT PRIMARY KEY, product_type TEXT NOT NULL, headline TEXT NOT NULL, publish_date TEXT NOT NULL, leg_count INTEGER NOT NULL DEFAULT 0, won_legs INTEGER NOT NULL DEFAULT 0, lost_legs INTEGER NOT NULL DEFAULT 0, void_legs INTEGER NOT NULL DEFAULT 0, pending_legs INTEGER NOT NULL DEFAULT 0, pass_legs INTEGER NOT NULL DEFAULT 0, outcome TEXT NOT NULL DEFAULT 'PENDING', effective_odds REAL, profit REAL, result_note TEXT NOT NULL DEFAULT '', settled_at TEXT)"
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
function scoreMap(event:ScoreEvent){const scores=event.scores||[];const homeValue=scores.find(item=>item.name===event.home_team)?.score;const awayValue=scores.find(item=>item.name===event.away_team)?.score;if(homeValue===null||homeValue===undefined||awayValue===null||awayValue===undefined)return null;const home=Number(homeValue),away=Number(awayValue);return Number.isInteger(home)&&Number.isInteger(away)&&home>=0&&away>=0?{home,away}:null;}

async function recalculateEdition(env:ResultsEnv,accaId:string){
 const rows=(await env.DB.prepare("SELECT selection_status,selection_name,outcome,odds FROM result_selections WHERE acca_id=? ORDER BY selection_id").bind(accaId).all()).results||[];
 const edition=calculateEdition(rows);
 const meta=await env.DB.prepare("SELECT product_type,headline,publish_date FROM result_selections WHERE acca_id=? LIMIT 1").bind(accaId).first();
 if(!meta)return;
 const sql=`INSERT INTO edition_results (acca_id,product_type,headline,publish_date,leg_count,won_legs,lost_legs,void_legs,pending_legs,pass_legs,outcome,effective_odds,profit,result_note,settled_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,CASE WHEN ? IN ('WON','LOST','VOID','NO_SELECTION') THEN CURRENT_TIMESTAMP ELSE NULL END) ON CONFLICT(acca_id) DO UPDATE SET product_type=excluded.product_type,headline=excluded.headline,publish_date=excluded.publish_date,leg_count=excluded.leg_count,won_legs=excluded.won_legs,lost_legs=excluded.lost_legs,void_legs=excluded.void_legs,pending_legs=excluded.pending_legs,pass_legs=excluded.pass_legs,outcome=excluded.outcome,effective_odds=excluded.effective_odds,profit=excluded.profit,result_note=excluded.result_note,settled_at=CASE WHEN excluded.outcome IN ('WON','LOST','VOID','NO_SELECTION') THEN COALESCE(edition_results.settled_at,CURRENT_TIMESTAMP) ELSE NULL END`;
 await env.DB.prepare(sql).bind(accaId,meta.product_type,meta.headline,meta.publish_date,edition.legs,edition.won,edition.lost,edition.void,edition.pending,edition.pass,edition.outcome,edition.effectiveOdds,edition.profit,edition.note,edition.outcome).run();
}
async function syncEditionResults(env:ResultsEnv){
 const editions=(await env.DB.prepare("SELECT DISTINCT r.acca_id FROM result_selections r LEFT JOIN edition_results e ON e.acca_id=r.acca_id WHERE e.acca_id IS NULL").all()).results||[];
 for(const edition of editions)await recalculateEdition(env,edition.acca_id);
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
    const result=settleSelection(pick,score.home,score.away);
    await env.DB.prepare("UPDATE result_selections SET home_score=?,away_score=?,outcome=?,settled_at=CURRENT_TIMESTAMP,result_note=? WHERE selection_id=?").bind(score.home,score.away,result.outcome,result.note,pick.selection_id).run();
    if(result.outcome!=="PENDING")settled++;
    await recalculateEdition(env,pick.acca_id);
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
 await syncEditionResults(env);
 const editionRows=(await env.DB.prepare("SELECT * FROM edition_results WHERE publish_date=?").bind(date).all<any>()).results||[];
 const rows=(await env.DB.prepare("SELECT * FROM result_selections WHERE publish_date = ? ORDER BY CASE product_type WHEN 'safe_picks' THEN 1 WHEN 'super_5' THEN 2 WHEN 'super_10' THEN 3 ELSE 4 END,commence_time,acca_id").bind(date).all<any>()).results||[];
 const summary={total:rows.length,won:rows.filter(row=>row.outcome==="WON").length,lost:rows.filter(row=>row.outcome==="LOST").length,pending:rows.filter(row=>row.outcome==="PENDING").length,void:rows.filter(row=>row.outcome==="VOID").length,pass:rows.filter(row=>row.outcome==="PASS").length};
 const accuracy=summary.won+summary.lost?Math.round(summary.won/(summary.won+summary.lost)*100):null;
 const marketSummary=(await env.DB.prepare("SELECT market_key,market_name,COUNT(*) AS total,SUM(CASE WHEN outcome='WON' THEN 1 ELSE 0 END) AS won,SUM(CASE WHEN outcome='LOST' THEN 1 ELSE 0 END) AS lost,SUM(CASE WHEN outcome='PENDING' THEN 1 ELSE 0 END) AS pending FROM result_selections WHERE publish_date = ? GROUP BY market_key,market_name ORDER BY total DESC,market_name").bind(date).all<{market_key:string;market_name:string;total:number;won:number;lost:number;pending:number}>()).results||[];
 return {date,rows,summary,accuracy,marketSummary,editions:editionRows,windowDays:1,needsOddsApiSecret:!oddsApiKeys(env).length};
}

type TrackAggregate={group_key:string;label:string;total:number;won:number;lost:number;void:number;pending:number;pass:number;profit:number;settled:number;average_odds:number|null;first_date:string|null;last_date:string|null};
function trackRow(row:TrackAggregate){
 const settled=Number(row.won||0)+Number(row.lost||0);
 return {key:row.group_key,label:row.label,total:Number(row.total||0),won:Number(row.won||0),lost:Number(row.lost||0),void:Number(row.void||0),pending:Number(row.pending||0),pass:Number(row.pass||0),settled,averageOdds:row.average_odds===null?null:Number(row.average_odds),profit:Number(row.profit||0),roi:settled?Number(row.profit||0)/settled*100:null,firstDate:row.first_date,lastDate:row.last_date};
}
export async function getTrackRecord(env:ResultsEnv){
 await ensureResultsSchema(env);
 await syncEditionResults(env);
 const aggregate="COUNT(*) AS total,SUM(CASE WHEN outcome='WON' THEN 1 ELSE 0 END) AS won,SUM(CASE WHEN outcome='LOST' THEN 1 ELSE 0 END) AS lost,SUM(CASE WHEN outcome='VOID' THEN 1 ELSE 0 END) AS void,SUM(CASE WHEN outcome='PENDING' THEN 1 ELSE 0 END) AS pending,SUM(CASE WHEN outcome='PASS' THEN 1 ELSE 0 END) AS pass,SUM(CASE WHEN outcome='WON' THEN odds-1 WHEN outcome='LOST' THEN -1 ELSE 0 END) AS profit,SUM(CASE WHEN outcome IN ('WON','LOST') THEN 1 ELSE 0 END) AS settled,AVG(CASE WHEN outcome IN ('WON','LOST') THEN odds END) AS average_odds,MIN(publish_date) AS first_date,MAX(publish_date) AS last_date";
 const overall=await env.DB.prepare("SELECT "+aggregate+" FROM result_selections").first<any>();
 const formats=(await env.DB.prepare("SELECT product_type AS group_key,product_type AS label,"+aggregate+" FROM result_selections GROUP BY product_type ORDER BY product_type").all<TrackAggregate>()).results||[];
 const markets=(await env.DB.prepare("SELECT market_key AS group_key,market_name AS label,"+aggregate+" FROM result_selections GROUP BY market_key,market_name ORDER BY settled DESC,total DESC").all<TrackAggregate>()).results||[];
 const months=(await env.DB.prepare("SELECT substr(publish_date,1,7) AS group_key,substr(publish_date,1,7) AS label,"+aggregate+" FROM result_selections GROUP BY substr(publish_date,1,7) ORDER BY group_key DESC LIMIT 24").all<TrackAggregate>()).results||[];
 const editionAggregate="COUNT(*) AS total,SUM(CASE WHEN outcome='WON' THEN 1 ELSE 0 END) AS won,SUM(CASE WHEN outcome='LOST' THEN 1 ELSE 0 END) AS lost,SUM(CASE WHEN outcome='VOID' THEN 1 ELSE 0 END) AS void,SUM(CASE WHEN outcome='PENDING' THEN 1 ELSE 0 END) AS pending,SUM(CASE WHEN outcome='NO_SELECTION' THEN 1 ELSE 0 END) AS pass,SUM(CASE WHEN outcome IN ('WON','LOST') THEN COALESCE(profit,0) ELSE 0 END) AS profit,SUM(CASE WHEN outcome IN ('WON','LOST') THEN 1 ELSE 0 END) AS settled,AVG(CASE WHEN outcome='WON' THEN effective_odds END) AS average_odds,MIN(publish_date) AS first_date,MAX(publish_date) AS last_date";
 const editionOverall=await env.DB.prepare("SELECT "+editionAggregate+" FROM edition_results").first<any>();
 const editionFormats=(await env.DB.prepare("SELECT product_type AS group_key,product_type AS label,"+editionAggregate+" FROM edition_results GROUP BY product_type ORDER BY product_type").all<TrackAggregate>()).results||[];
 const editionMonths=(await env.DB.prepare("SELECT substr(publish_date,1,7) AS group_key,substr(publish_date,1,7) AS label,"+editionAggregate+" FROM edition_results GROUP BY substr(publish_date,1,7) ORDER BY group_key DESC LIMIT 24").all<TrackAggregate>()).results||[];
 const editionSummary=trackRow({group_key:"all",label:"All recorded editions",...editionOverall} as TrackAggregate);
 const summary=trackRow({group_key:"all",label:"All recorded selections",...overall} as TrackAggregate);
 const history=await env.DB.prepare("SELECT COUNT(DISTINCT publish_date) AS tracked_days,MAX(settled_at) AS last_settled_at FROM result_selections").first<{tracked_days:number;last_settled_at:string|null}>();
 return {summary,byFormat:formats.map(trackRow),byMarket:markets.map(trackRow),byMonth:months.map(trackRow),editions:{summary:editionSummary,byFormat:editionFormats.map(trackRow),byMonth:editionMonths.map(trackRow)},coverage:{firstDate:overall?.first_date||null,lastDate:overall?.last_date||null,trackedDays:Number(history?.tracked_days||0),lastSettledAt:history?.last_settled_at||null},methodology:{stake:1,profit:"A flat 1-unit stake per WON or LOST selection; a win returns odds minus 1 unit profit, a loss loses 1 unit, and void/pending/PASS selections are excluded from ROI.",roi:"Net flat-stake profit divided by the number of settled WON and LOST selections. Void, pending and PASS selections are excluded from the denominator.",accuracy:"WON divided by WON plus LOST. Void, pending and PASS selections are excluded.",scope:"Only selections present in the AccaForge results database are counted. The date range shown is the available recorded history, not a claim of complete lifetime coverage."}};
}
export async function trackRecordApi(env:ResultsEnv){try{return Response.json(await getTrackRecord(env),{headers:{"Cache-Control":"public, max-age=120, s-maxage=300, stale-while-revalidate=900"}});}catch(error){console.error("AccaForge track record read failed",error);return Response.json({error:"Track record is temporarily unavailable."},{status:500});}}

export async function resultsApi(env:ResultsEnv){try{return Response.json(await getYesterdayResults(env),{headers:{"Cache-Control":"public, max-age=60, s-maxage=180, stale-while-revalidate=600"}});}catch(error){console.error("AccaForge results read failed",error);return Response.json({error:"Results are temporarily unavailable."},{status:500});}}
