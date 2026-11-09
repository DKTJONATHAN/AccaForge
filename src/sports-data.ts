import type { ContentEnv } from "./content";

export interface SportsDataEnv extends ContentEnv {
  API_FOOTBALL_KEY?: string;
}

type FixtureTeam = { home_team:string; away_team:string };
type LeagueInfo = { id:number; name:string; country:string; logo:string; season:number };
type TeamInfo = { id:number; name:string; logo:string };

const wait=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
const clean=(value:unknown,max=180)=>String(value??"").replace(/[<>\u0000-\u001f]/g,"").replace(/\s+/g," ").trim().slice(0,max);
export const normalizeTeamName=(value:string)=>value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase()
  .replace(/\b(football club|fc|afc|cf|sc|cfc|club)\b/g," ")
  .replace(/&/g," and ").replace(/[^a-z0-9]+/g," ").trim().replace(/\s+/g," ");

const aliases:Record<string,string>={
  "man utd":"manchester united","man united":"manchester united","manchester utd":"manchester united",
  "man city":"manchester city","spurs":"tottenham hotspur","wolves":"wolverhampton wanderers",
  "west ham":"west ham united","newcastle":"newcastle united","brighton":"brighton and hove albion",
  "athletico madrid":"atletico madrid","internazionale":"inter","inter milan":"inter",
  "paris saint germain":"paris saint germain","psg":"paris saint germain"
};
function normalized(value:string){const key=normalizeTeamName(value);return aliases[key]||key;}
async function hash(value:string){const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));return [...new Uint8Array(bytes)].map(byte=>byte.toString(16).padStart(2,"0")).join("");}
function nairobiDate(){return new Intl.DateTimeFormat("en-CA",{timeZone:"Africa/Nairobi",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());}
function utcDate(){return new Date().toISOString().slice(0,10);}

const leagueSearch:Record<string,{name:string;country?:string}>={
  soccer_epl:{name:"Premier League",country:"England"},
  soccer_uefa_champs_league:{name:"UEFA Champions League"},
  soccer_uefa_europa_league:{name:"UEFA Europa League"},
  soccer_spain_la_liga:{name:"La Liga",country:"Spain"},
  soccer_germany_bundesliga:{name:"Bundesliga",country:"Germany"},
  soccer_italy_serie_a:{name:"Serie A",country:"Italy"},
  soccer_france_ligue_one:{name:"Ligue 1",country:"France"},
  soccer_netherlands_eredivisie:{name:"Eredivisie",country:"Netherlands"},
  soccer_portugal_primeira_liga:{name:"Primeira Liga",country:"Portugal"},
  soccer_usa_mls:{name:"Major League Soccer",country:"USA"},
  soccer_england_championship:{name:"Championship",country:"England"},
  soccer_brazil_campeonato:{name:"Serie A",country:"Brazil"},
  soccer_australia_aleague:{name:"A-League Men",country:"Australia"},
  soccer_japan_j_league:{name:"J1 League",country:"Japan"},
  soccer_turkey_super_league:{name:"Super Lig",country:"Turkey"},
  soccer_scotland_premiership:{name:"Premiership",country:"Scotland"},
  soccer_belgium_first_div:{name:"Pro League",country:"Belgium"},
  soccer_mexico_ligamx:{name:"Liga MX",country:"Mexico"},
  soccer_argentina_primera_division:{name:"Liga Profesional",country:"Argentina"}
};

async function ensureSportsSchema(env:SportsDataEnv){
  await env.DB.batch([
    env.DB.prepare("CREATE TABLE IF NOT EXISTS sports_leagues (sport_key TEXT PRIMARY KEY,league_id INTEGER NOT NULL,season INTEGER NOT NULL,league_name TEXT NOT NULL,country TEXT NOT NULL DEFAULT '',logo_url TEXT NOT NULL DEFAULT '',logo_key TEXT NOT NULL DEFAULT '',standings_json TEXT NOT NULL DEFAULT '[]',last_attempt_date TEXT NOT NULL DEFAULT '',last_enriched_date TEXT NOT NULL DEFAULT '',last_error TEXT NOT NULL DEFAULT '',updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS sports_api_usage (utc_date TEXT PRIMARY KEY,requests INTEGER NOT NULL DEFAULT 0)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS sports_data_sync (publish_date TEXT PRIMARY KEY,status TEXT NOT NULL,competitions INTEGER NOT NULL DEFAULT 0,teams INTEGER NOT NULL DEFAULT 0,api_requests INTEGER NOT NULL DEFAULT 0,started_at TEXT NOT NULL,completed_at TEXT,error TEXT)")
  ]);
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS team_badges (team_name TEXT PRIMARY KEY,normalized_name TEXT NOT NULL,image_key TEXT NOT NULL,source_url TEXT NOT NULL,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
}
async function cacheImage(env:SportsDataEnv,url:string,folder:"teams"|"leagues"){
  if(!url||!/^https:\/\//i.test(url))return "";
  const digest=await hash(url);
  const extension=/\.svg(?:\?|$)/i.test(url)?"svg":/\.webp(?:\?|$)/i.test(url)?"webp":/\.jpe?g(?:\?|$)/i.test(url)?"jpg":"png";
  const key=folder+"/"+digest+"."+extension;
  const existing=await env.MEDIA.head(key);
  if(existing)return key;
  try{
    const response=await fetch(url,{headers:{"User-Agent":"AccaForge/1.0"},signal:AbortSignal.timeout(10000)});
    if(!response.ok)return "";
    const type=response.headers.get("content-type")||"";
    if(!type.startsWith("image/"))return "";
    const bytes=await response.arrayBuffer();
    if(bytes.byteLength<200||bytes.byteLength>1_500_000)return "";
    await env.MEDIA.put(key,bytes,{httpMetadata:{contentType:type,cacheControl:"public, max-age=31536000, immutable"}});
    return key;
  }catch(error){console.warn("Could not cache sports logo",url,error);return "";}
}

async function footballApi(env:SportsDataEnv,path:string,params:Record<string,string>){
  const key=(env.API_FOOTBALL_KEY||"").trim();
  if(!key)throw new Error("Missing API_FOOTBALL_KEY Cloudflare Worker secret.");
  const day=utcDate();
  const usage=await env.DB.prepare("SELECT requests FROM sports_api_usage WHERE utc_date=?").bind(day).first<{requests:number}>();
  const count=Number(usage?.requests||0);
  if(count>=75)throw new Error("Daily safety cap reached: AccaForge stops at 75 of the free 100 API-Football requests.");
  const last=await env.DB.prepare("SELECT last_request_at FROM sports_api_rate_state WHERE id=1").first<{last_request_at:string}>();
  if(last?.last_request_at){
    const elapsed=Date.now()-Date.parse(last.last_request_at);
    if(elapsed<6500)await wait(6500-elapsed);
  }
  const now=new Date().toISOString();
  await env.DB.prepare("INSERT INTO sports_api_rate_state (id,last_request_at) VALUES (1,?) ON CONFLICT(id) DO UPDATE SET last_request_at=excluded.last_request_at").bind(now).run();
  await env.DB.prepare("INSERT INTO sports_api_usage (utc_date,requests) VALUES (?,1) ON CONFLICT(utc_date) DO UPDATE SET requests=requests+1").bind(day).run();
  const url=new URL("https://v3.football.api-sports.io/"+path);
  for(const [name,value] of Object.entries(params))url.searchParams.set(name,value);
  const response=await fetch(url,{headers:{"x-apisports-key":key,"User-Agent":"AccaForge/1.0"},signal:AbortSignal.timeout(15000)});
  const remaining=Number(response.headers.get("x-ratelimit-requests-remaining"));
  if(response.status===429)throw new Error("API-Football rate limit reached; no rapid retry was attempted.");
  if(!response.ok)throw new Error("API-Football "+path+" returned HTTP "+response.status+".");
  const payload=await response.json() as {response?:any[];errors?:unknown};
  if(payload.errors&&Object.keys(payload.errors as object).length)throw new Error("API-Football rejected "+path+": "+JSON.stringify(payload.errors).slice(0,300));
  return {items:Array.isArray(payload.response)?payload.response:[],remaining:Number.isFinite(remaining)?remaining:null};
}

async function resolveLeague(env:SportsDataEnv,sportKey:string):Promise<LeagueInfo>{
  const known=leagueSearch[sportKey];
  if(!known)throw new Error("No safe API-Football competition mapping for "+sportKey+".");
  const query:Record<string,string>={search:known.name};
  if(known.country)query.country=known.country;
  const result=await footballApi(env,"leagues",query);
  const matches=result.items.map(item=>item.league).filter(Boolean);
  const exact=matches.find((item:any)=>normalized(item.name)===normalized(known.name))||matches[0];
  if(!exact?.id)throw new Error("API-Football does not list "+known.name+" in its current free data.");
  const parent=result.items.find(item=>Number(item.league?.id)===Number(exact.id));
  const seasons=Array.isArray(parent?.seasons)?parent.seasons:[];
  const current=seasons.find((item:any)=>item.current)||seasons.sort((a:any,b:any)=>Number(b.year)-Number(a.year))[0];
  if(!current?.year)throw new Error("No current season is available for "+known.name+".");
  return {id:Number(exact.id),name:clean(exact.name),country:clean(exact.country||known.country||""),logo:String(exact.logo||""),season:Number(current.year)};
}

function flattenStandings(value:any[]):any[]{return value.flatMap(group=>Array.isArray(group)?group:[]);}
function normalizeTable(payload:any[]){
  const league=payload[0]?.league;
  const rows=flattenStandings(league?.standings||[]);
  return {leagueName:clean(league?.name),country:clean(league?.country),logo:String(league?.logo||""),rows:rows.map((row:any)=>({
    position:Number(row.rank||0),team:clean(row.team?.name),played:Number(row.all?.played||0),
    won:Number(row.all?.win||0),drawn:Number(row.all?.draw||0),lost:Number(row.all?.lose||0),
    goalsFor:Number(row.all?.goals?.for||0),goalsAgainst:Number(row.all?.goals?.against||0),
    goalDifference:Number(row.goalsDiff||0),points:Number(row.points||0),form:clean(row.form||"",24),
    teamLogo:String(row.team?.logo||"")
  })).filter((row:any)=>row.team&&row.position>0)};
}
function findTeam(teams:TeamInfo[],name:string){
  const key=normalized(name);
  return teams.find(team=>normalized(team.name)===key)
    ||teams.find(team=>key.length>7&&(normalized(team.name).includes(key)||key.includes(normalized(team.name))));
}

export async function prepareFootballEnrichment(env:SportsDataEnv){
  await ensureSportsSchema(env);
  const date=nairobiDate();
  const rows=(await env.DB.prepare("SELECT DISTINCT s.sport_key,s.home_team,s.away_team FROM selections s JOIN accas a ON a.id=s.acca_id WHERE a.status='published' AND a.publish_date=? ORDER BY s.sport_key,s.home_team,s.away_team").bind(date).all< {sport_key:string;home_team:string;away_team:string} >()).results||[];
  const grouped=new Map<string,Set<string>>();
  for(const row of rows){if(!grouped.has(row.sport_key))grouped.set(row.sport_key,new Set());grouped.get(row.sport_key)!.add(row.home_team);grouped.get(row.sport_key)!.add(row.away_team);}
  const existing=await env.DB.prepare("SELECT status,competitions,teams,api_requests FROM sports_data_sync WHERE publish_date=?").bind(date).first<any>();
  if(existing?.status==="completed")return {date,alreadyCompleted:true,sportKeys:[],summary:existing};
  await env.DB.prepare("INSERT INTO sports_data_sync (publish_date,status,started_at) VALUES (?,'running',?) ON CONFLICT(publish_date) DO UPDATE SET status='running',error=NULL").bind(date,new Date().toISOString()).run();
  return {date,alreadyCompleted:false,sportKeys:[...grouped.keys()],teamNames:Object.fromEntries([...grouped].map(([key,names])=>[key,[...names]]))};
}

export async function enrichFootballLeague(env:SportsDataEnv,sportKey:string,date:string){
  await ensureSportsSchema(env);
  const sync=await env.DB.prepare("SELECT status FROM sports_data_sync WHERE publish_date=?").bind(date).first<{status:string}>();
  if(!sync||sync.status==="completed")return {sportKey,skipped:true,reason:"No active enrichment run."};
  const existing=await env.DB.prepare("SELECT last_attempt_date,last_enriched_date FROM sports_leagues WHERE sport_key=?").bind(sportKey).first<{last_attempt_date:string;last_enriched_date:string}>();
  if(existing?.last_attempt_date===date)return {sportKey,skipped:true,reason:existing.last_enriched_date===date?"Already enriched today":"Already attempted today; no repeat API calls."};
  const fixtureRows=(await env.DB.prepare("SELECT DISTINCT s.home_team,s.away_team FROM selections s JOIN accas a ON a.id=s.acca_id WHERE a.status='published' AND a.publish_date=? AND s.sport_key=?").bind(date,sportKey).all<FixtureTeam>()).results||[];
  if(!fixtureRows.length)return {sportKey,skipped:true,reason:"No published fixtures for this competition."};
  const names=[...new Set(fixtureRows.flatMap(row=>[row.home_team,row.away_team]))];
  await env.DB.prepare("INSERT INTO sports_leagues (sport_key,league_id,season,league_name,last_attempt_date) VALUES (?,0,0,? ,?) ON CONFLICT(sport_key) DO UPDATE SET last_attempt_date=excluded.last_attempt_date,last_error=''").bind(sportKey,leagueSearch[sportKey]?.name||sportKey,date).run();
  try{
    const league=await resolveLeague(env,sportKey);
    const [teamResult,tableResult]=await Promise.all([
      footballApi(env,"teams",{league:String(league.id),season:String(league.season)}),
      footballApi(env,"standings",{league:String(league.id),season:String(league.season)})
    ]);
    const teams:TeamInfo[]=teamResult.items.map((item:any)=>({id:Number(item.team?.id),name:clean(item.team?.name),logo:String(item.team?.logo||"")})).filter(team=>team.id&&team.name);
    const table=normalizeTable(tableResult.items);
    const tableTeams=flattenStandings(tableResult.items[0]?.league?.standings||[]);
    const logoUrl=String(table.logo||league.logo||"");
    const leagueLogoKey=await cacheImage(env,logoUrl,"leagues");
    await env.DB.prepare("INSERT INTO sports_leagues (sport_key,league_id,season,league_name,country,logo_url,logo_key,standings_json,last_attempt_date,last_enriched_date,last_error,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?, '',CURRENT_TIMESTAMP) ON CONFLICT(sport_key) DO UPDATE SET league_id=excluded.league_id,season=excluded.season,league_name=excluded.league_name,country=excluded.country,logo_url=excluded.logo_url,logo_key=excluded.logo_key,standings_json=excluded.standings_json,last_attempt_date=excluded.last_attempt_date,last_enriched_date=excluded.last_enriched_date,last_error='',updated_at=CURRENT_TIMESTAMP")
      .bind(sportKey,league.id,league.season,table.leagueName||league.name,table.country||league.country,logoUrl,leagueLogoKey,JSON.stringify(table.rows),date,date).run();
    let matched=0;
    for(const name of names){
      const team=findTeam(teams,name);
      if(!team)continue;
      const imageKey=await cacheImage(env,team.logo,"teams");
      if(!imageKey)continue;
      await env.DB.prepare("INSERT INTO team_badges (team_name,normalized_name,image_key,source_url,updated_at) VALUES (?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(team_name) DO UPDATE SET normalized_name=excluded.normalized_name,image_key=excluded.image_key,source_url=excluded.source_url,updated_at=CURRENT_TIMESTAMP")
        .bind(name,normalized(name),imageKey,team.logo).run();
      matched++;
    }
    // Standings can contain a team absent from the current fixtures. Save its crest too
    // so the league table can render with the same club identity.
    const standingsTeams=tableTeams.map((row:any)=>row.team).filter(Boolean);
    for(const row of standingsTeams){
      const team=teams.find(item=>item.id===Number(row.id))||{id:Number(row.id),name:clean(row.name),logo:String(row.logo||"")};
      if(!team.logo)continue;
      const imageKey=await cacheImage(env,team.logo,"teams");
      if(!imageKey)continue;
      await env.DB.prepare("INSERT INTO team_badges (team_name,normalized_name,image_key,source_url,updated_at) VALUES (?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(team_name) DO UPDATE SET normalized_name=excluded.normalized_name,image_key=excluded.image_key,source_url=excluded.source_url,updated_at=CURRENT_TIMESTAMP")
        .bind(team.name,normalized(team.name),imageKey,team.logo).run();
    }
    return {sportKey,league:table.leagueName||league.name,teams:teams.length,matchedFixtures:matched,standings:table.rows.length,apiRequests:2+(existing?.last_attempt_date?0:1),logoCached:Boolean(leagueLogoKey)};
  }catch(error){
    const message=clean(error instanceof Error?error.message:error,400);
    await env.DB.prepare("UPDATE sports_leagues SET last_error=? WHERE sport_key=?").bind(message,sportKey).run();
    console.error("AccaForge sports enrichment failed for",sportKey,message);
    return {sportKey,failed:true,error:message};
  }
}

export async function finishFootballEnrichment(env:SportsDataEnv,date:string){
  await ensureSportsSchema(env);
  const rows=(await env.DB.prepare("SELECT sport_key,league_name,last_enriched_date,last_error FROM sports_leagues WHERE last_attempt_date=?").bind(date).all<any>()).results||[];
  const completed=rows.filter(row=>row.last_enriched_date===date).length;
  const failed=rows.filter(row=>row.last_enriched_date!==date).length;
  const teams=await env.DB.prepare("SELECT COUNT(*) AS count FROM team_badges").first<{count:number}>();
  const usage=await env.DB.prepare("SELECT requests FROM sports_api_usage WHERE utc_date=?").bind(utcDate()).first<{requests:number}>();
  const status=failed?"partial":"completed";
  await env.DB.prepare("INSERT INTO sports_data_sync (publish_date,status,competitions,teams,api_requests,started_at,completed_at,error) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(publish_date) DO UPDATE SET status=excluded.status,competitions=excluded.competitions,teams=excluded.teams,api_requests=excluded.api_requests,completed_at=excluded.completed_at,error=excluded.error")
    .bind(date,status,completed,Number(teams?.count||0),Number(usage?.requests||0),new Date().toISOString(),new Date().toISOString(),failed?rows.filter(row=>row.last_error).map(row=>row.sport_key+": "+row.last_error).join("; ").slice(0,1000):null).run();
  return {date,status,competitions:completed,failed,teams:Number(teams?.count||0),apiRequests:Number(usage?.requests||0),details:rows};
}
