const env=process.env;
const account=(env.CLOUDFLARE_ACCOUNT_ID||"").trim(),database=(env.D1_DATABASE_ID||"").trim(),token=(env.CLOUDFLARE_API_TOKEN||"").trim();
const apiKey=(env.API_FOOTBALL_KEY||"").trim();
if(!account||!database||!token)throw new Error("Missing Cloudflare D1 GitHub secrets: CLOUDFLARE_ACCOUNT_ID, D1_DATABASE_ID, CLOUDFLARE_API_TOKEN.");
if(!apiKey)throw new Error("Missing API_FOOTBALL_KEY GitHub secret.");
const endpoint="https://api.cloudflare.com/client/v4/accounts/"+account+"/d1/database/"+database+"/query";
async function d1(sql,params=[]){
 const r=await fetch(endpoint,{method:"POST",headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},body:JSON.stringify({sql,params}),signal:AbortSignal.timeout(30000)});
 const p=await r.json().catch(()=>null);if(!r.ok||p?.success!==true)throw new Error("D1 HTTP "+r.status+": "+JSON.stringify(p?.errors||p).slice(0,700));
 const q=p.result?.[0];if(q?.success===false)throw new Error("D1 SQL error: "+JSON.stringify(q).slice(0,700));return q?.results||[];
}
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const clean=(v,max=180)=>String(v??"").replace(/[<>\u0000-\u001f]/g,"").replace(/\s+/g," ").trim().slice(0,max);
const norm=v=>String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/\b(football club|fc|afc|cf|sc|cfc|club)\b/g," ").replace(/&/g," and ").replace(/[^a-z0-9]+/g," ").trim().replace(/\s+/g," ");
const aliases={"man utd":"manchester united","man united":"manchester united","manchester utd":"manchester united","man city":"manchester city","spurs":"tottenham hotspur","wolves":"wolverhampton wanderers","west ham":"west ham united","newcastle":"newcastle united","brighton":"brighton and hove albion","athletico madrid":"atletico madrid","internazionale":"inter","inter milan":"inter","psg":"paris saint germain"};
const normalized=v=>aliases[norm(v)]||norm(v);
const date=()=>new Intl.DateTimeFormat("en-CA",{timeZone:"Africa/Nairobi",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
const utc=()=>new Date().toISOString().slice(0,10);
const leagueMap={
 soccer_epl:["Premier League","England"],soccer_uefa_champs_league:["UEFA Champions League",""],soccer_uefa_europa_league:["UEFA Europa League",""],soccer_uefa_europa_conference_league:["UEFA Europa Conference League",""],soccer_uefa_nations_league:["UEFA Nations League",""],soccer_fifa_world_cup:["FIFA World Cup",""],
 soccer_spain_la_liga:["La Liga","Spain"],soccer_germany_bundesliga:["Bundesliga","Germany"],soccer_italy_serie_a:["Serie A","Italy"],soccer_france_ligue_one:["Ligue 1","France"],soccer_netherlands_eredivisie:["Eredivisie","Netherlands"],soccer_portugal_primeira_liga:["Primeira Liga","Portugal"],soccer_usa_mls:["Major League Soccer","USA"],soccer_england_championship:["Championship","England"],soccer_brazil_campeonato:["Serie A","Brazil"],soccer_australia_aleague:["A-League Men","Australia"],soccer_japan_j_league:["J1 League","Japan"],soccer_turkey_super_league:["Super Lig","Turkey"],soccer_scotland_premiership:["Premiership","Scotland"],soccer_belgium_first_div:["Pro League","Belgium"],soccer_mexico_ligamx:["Liga MX","Mexico"],soccer_argentina_primera_division:["Liga Profesional","Argentina"]
};
const countryNames={england:"England",spain:"Spain",germany:"Germany",italy:"Italy",france:"France",netherlands:"Netherlands",portugal:"Portugal",usa:"USA",brazil:"Brazil",australia:"Australia",japan:"Japan",turkey:"Turkey",scotland:"Scotland",belgium:"Belgium",mexico:"Mexico",argentina:"Argentina",sweden:"Sweden",norway:"Norway",denmark:"Denmark",switzerland:"Switzerland",austria:"Austria",greece:"Greece",poland:"Poland",ireland:"Ireland",wales:"Wales",finland:"Finland",romania:"Romania",ukraine:"Ukraine",croatia:"Croatia",serbia:"Serbia",egypt:"Egypt",morocco:"Morocco",india:"India",china:"China",south_korea:"South Korea",saudi_arabia:"Saudi Arabia",south_africa:"South Africa"};
async function football(path,params){
 const day=utc(),usage=await d1("SELECT requests FROM sports_api_usage WHERE utc_date=?",[day]),count=Number(usage[0]?.requests||0);
 if(count>=75)throw new Error("Daily API-Football safety cap reached (75/100).");
 const last=await d1("SELECT last_request_at FROM sports_api_rate_state WHERE id=1");
 if(last[0]?.last_request_at){const elapsed=Date.now()-Date.parse(last[0].last_request_at);if(elapsed<6500)await wait(6500-elapsed);}
 const now=new Date().toISOString();
 await d1("INSERT INTO sports_api_rate_state (id,last_request_at) VALUES (1,?) ON CONFLICT(id) DO UPDATE SET last_request_at=excluded.last_request_at",[now]);
 await d1("INSERT INTO sports_api_usage (utc_date,requests) VALUES (?,1) ON CONFLICT(utc_date) DO UPDATE SET requests=requests+1",[day]);
 const url=new URL("https://v3.football.api-sports.io/"+path);for(const [k,v] of Object.entries(params))url.searchParams.set(k,v);
 const response=await fetch(url,{headers:{"x-apisports-key":apiKey,"User-Agent":"AccaForge/1.0"},signal:AbortSignal.timeout(20000)});
 if(response.status===429)throw new Error("API-Football rate limit reached; stopped without rapid retry.");
 if(!response.ok)throw new Error("API-Football "+path+" returned HTTP "+response.status);
 const payload=await response.json();if(payload.errors&&Object.keys(payload.errors).length)throw new Error("API-Football rejected "+path+": "+JSON.stringify(payload.errors).slice(0,300));
 return payload.response||[];
}
async function resolveLeague(sportKey){
 const known=leagueMap[sportKey];let name,country;
 if(known){[name,country]=known;}else{const parts=sportKey.replace(/^soccer_/,"").split("_"),c=parts.shift(),suffix=parts.join("_");country=countryNames[c];name=suffix.split("_").map(x=>x[0]?.toUpperCase()+x.slice(1)).join(" ");}
 if(!name||!country)throw new Error("No safe API-Football mapping for "+sportKey);
 const items=await football("leagues",country?{search:name,country}:{search:name});
 const exact=items.find(x=>normalized(x.league?.name)===normalized(name))||items[0],league=exact?.league;
 if(!league?.id)throw new Error("API-Football does not list "+name);
 const seasons=Array.isArray(exact.seasons)?exact.seasons:[],current=seasons.find(x=>x.current)||seasons.sort((a,b)=>Number(b.year)-Number(a.year))[0];
 if(!current?.year)throw new Error("No current season for "+name);
 return {id:Number(league.id),name:clean(league.name),country:clean(league.country||country),logo:league.logo||"",season:Number(current.year)};
}
const flatten=groups=>(groups||[]).flatMap(group=>Array.isArray(group)?group:[]);
const findTeam=(teams,name)=>{const key=normalized(name);return teams.find(t=>normalized(t.name)===key)||teams.find(t=>key.length>7&&(normalized(t.name).includes(key)||key.includes(normalized(t.name))));};
async function main(){
 const publishDate=date();
 for(const sql of [
 "CREATE TABLE IF NOT EXISTS sports_leagues (sport_key TEXT PRIMARY KEY,league_id INTEGER NOT NULL,season INTEGER NOT NULL,league_name TEXT NOT NULL,country TEXT NOT NULL DEFAULT '',logo_url TEXT NOT NULL DEFAULT '',logo_key TEXT NOT NULL DEFAULT '',standings_json TEXT NOT NULL DEFAULT '[]',last_attempt_date TEXT NOT NULL DEFAULT '',last_enriched_date TEXT NOT NULL DEFAULT '',last_error TEXT NOT NULL DEFAULT '',updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
 "CREATE TABLE IF NOT EXISTS sports_api_usage (utc_date TEXT PRIMARY KEY,requests INTEGER NOT NULL DEFAULT 0)",
 "CREATE TABLE IF NOT EXISTS sports_api_rate_state (id INTEGER PRIMARY KEY CHECK(id=1),last_request_at TEXT NOT NULL)",
 "CREATE TABLE IF NOT EXISTS sports_data_sync (publish_date TEXT PRIMARY KEY,status TEXT NOT NULL,competitions INTEGER NOT NULL DEFAULT 0,teams INTEGER NOT NULL DEFAULT 0,api_requests INTEGER NOT NULL DEFAULT 0,started_at TEXT NOT NULL,completed_at TEXT,error TEXT)",
 "CREATE TABLE IF NOT EXISTS team_badges (team_name TEXT PRIMARY KEY,normalized_name TEXT NOT NULL,image_key TEXT NOT NULL,source_url TEXT NOT NULL,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"
 ])await d1(sql);
 const picks=await d1("SELECT DISTINCT s.sport_key,s.home_team,s.away_team FROM selections s JOIN accas a ON a.id=s.acca_id WHERE a.status='published' AND a.publish_date=? ORDER BY s.sport_key,s.home_team,s.away_team",[publishDate]);
 const groups=new Map();for(const row of picks){if(!groups.has(row.sport_key))groups.set(row.sport_key,new Set());groups.get(row.sport_key).add(row.home_team);groups.get(row.sport_key).add(row.away_team);}
 const existing=await d1("SELECT status FROM sports_data_sync WHERE publish_date=?",[publishDate]);
 if(existing[0]?.status==="completed"){console.log("Sports data already completed for "+publishDate);return;}
 await d1("INSERT INTO sports_data_sync (publish_date,status,started_at) VALUES (?,'running',?) ON CONFLICT(publish_date) DO UPDATE SET status='running',error=NULL",[publishDate,new Date().toISOString()]);
 console.log("Direct GitHub enrichment: "+groups.size+" competitions; "+picks.length+" published fixture records.");
 let completed=0;const failed=[];
 for(const [sportKey,names] of groups){
  const previous=await d1("SELECT last_attempt_date,last_enriched_date,league_id,season,league_name,country,logo_url FROM sports_leagues WHERE sport_key=?",[sportKey]);
  if(previous[0]?.last_attempt_date===publishDate){if(previous[0].last_enriched_date===publishDate)completed++;else failed.push(sportKey+": already attempted today");continue;}
  await d1("INSERT INTO sports_leagues (sport_key,league_id,season,league_name,last_attempt_date) VALUES (?,0,0,?,?) ON CONFLICT(sport_key) DO UPDATE SET last_attempt_date=excluded.last_attempt_date,last_error=''",[sportKey,leagueMap[sportKey]?.[0]||sportKey,publishDate]);
  try{
   const [year,month]=publishDate.split("-").map(Number),calendar=new Set(["soccer_usa_mls","soccer_brazil_campeonato","soccer_japan_j_league"]),expected=calendar.has(sportKey)?year:(month>=7?year:year-1);
   const league=previous[0]?.league_id&&Number(previous[0].season)===expected?{id:Number(previous[0].league_id),name:previous[0].league_name,country:previous[0].country,logo:previous[0].logo_url,season:Number(previous[0].season)}:await resolveLeague(sportKey);
   const teamRows=await football("teams",{league:String(league.id),season:String(league.season)});
   const tableRows=await football("standings",{league:String(league.id),season:String(league.season)});
   const teams=teamRows.map(x=>({id:Number(x.team?.id),name:clean(x.team?.name),logo:String(x.team?.logo||"")})).filter(x=>x.id&&x.name);
   const leagueData=tableRows[0]?.league,standings=flatten(leagueData?.standings||[]).map(row=>({position:Number(row.rank||0),team:clean(row.team?.name),played:Number(row.all?.played||0),won:Number(row.all?.win||0),drawn:Number(row.all?.draw||0),lost:Number(row.all?.lose||0),goalsFor:Number(row.all?.goals?.for||0),goalsAgainst:Number(row.all?.goals?.against||0),goalDifference:Number(row.goalsDiff||0),points:Number(row.points||0),form:clean(row.form||"",24),teamLogo:String(row.team?.logo||"")})).filter(row=>row.team&&row.position>0);
   const logo=String(leagueData?.logo||league.logo||"");
   await d1("INSERT INTO sports_leagues (sport_key,league_id,season,league_name,country,logo_url,logo_key,standings_json,last_attempt_date,last_enriched_date,last_error,updated_at) VALUES (?,?,?,?,?,?,'',?,?,?,'',CURRENT_TIMESTAMP) ON CONFLICT(sport_key) DO UPDATE SET league_id=excluded.league_id,season=excluded.season,league_name=excluded.league_name,country=excluded.country,logo_url=excluded.logo_url,logo_key='',standings_json=excluded.standings_json,last_attempt_date=excluded.last_attempt_date,last_enriched_date=excluded.last_enriched_date,last_error='',updated_at=CURRENT_TIMESTAMP",[sportKey,league.id,league.season,clean(leagueData?.name||league.name),clean(leagueData?.country||league.country),logo,JSON.stringify(standings),publishDate,publishDate]);
   let matched=0;
   for(const name of names){const team=findTeam(teams,name);if(!team?.logo)continue;await d1("INSERT INTO team_badges (team_name,normalized_name,image_key,source_url,updated_at) VALUES (?,?,?, ?,CURRENT_TIMESTAMP) ON CONFLICT(team_name) DO UPDATE SET normalized_name=excluded.normalized_name,image_key='',source_url=excluded.source_url,updated_at=CURRENT_TIMESTAMP",[name,normalized(name),"",team.logo]);matched++;}
   for(const row of standings){const team=teams.find(t=>t.name===row.team);if(!team?.logo)continue;await d1("INSERT INTO team_badges (team_name,normalized_name,image_key,source_url,updated_at) VALUES (?,?,?, ?,CURRENT_TIMESTAMP) ON CONFLICT(team_name) DO UPDATE SET normalized_name=excluded.normalized_name,image_key='',source_url=excluded.source_url,updated_at=CURRENT_TIMESTAMP",[team.name,normalized(team.name),"",team.logo]);}
   console.log(JSON.stringify({sportKey,league:leagueData?.name||league.name,teams:teams.length,matchedFixtures:matched,standings:standings.length}));completed++;
  }catch(error){const message=clean(error?.message||error,400);await d1("UPDATE sports_leagues SET last_error=? WHERE sport_key=?",[message,sportKey]);failed.push(sportKey+": "+message);console.error("Enrichment failed",sportKey,message);}
 }
 const teamCount=await d1("SELECT COUNT(*) AS count FROM team_badges"),usage=await d1("SELECT requests FROM sports_api_usage WHERE utc_date=?",[utc()]);
 const status=failed.length?"partial":"completed";
 await d1("INSERT INTO sports_data_sync (publish_date,status,competitions,teams,api_requests,started_at,completed_at,error) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(publish_date) DO UPDATE SET status=excluded.status,competitions=excluded.competitions,teams=excluded.teams,api_requests=excluded.api_requests,completed_at=excluded.completed_at,error=excluded.error",[publishDate,status,completed,Number(teamCount[0]?.count||0),Number(usage[0]?.requests||0),new Date().toISOString(),new Date().toISOString(),failed.join("; ").slice(0,1000)||null]);
 console.log("Enrichment summary: "+JSON.stringify({date:publishDate,status,competitions:completed,failed,teams:Number(teamCount[0]?.count||0),apiRequests:Number(usage[0]?.requests||0)}));
 if(failed.length===groups.size&&groups.size)throw new Error("All sports competitions failed enrichment.");
}
main().catch(error=>{console.error("Sports enrichment failed:",error);process.exitCode=1;});
