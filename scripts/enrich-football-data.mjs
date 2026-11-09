import { createHash } from "node:crypto";

const env = process.env;
const accountId = (env.CLOUDFLARE_ACCOUNT_ID || "").trim();
const databaseId = (env.D1_DATABASE_ID || "").trim();
const cloudflareToken = (env.CLOUDFLARE_API_TOKEN || "").trim();
const footballKey = (env.API_FOOTBALL_KEY || "").trim();
if (!accountId || !databaseId || !cloudflareToken) throw new Error("Missing CLOUDFLARE_ACCOUNT_ID, D1_DATABASE_ID or CLOUDFLARE_API_TOKEN GitHub secret.");
if (!footballKey) throw new Error("Missing API_FOOTBALL_KEY GitHub secret. Copy the same API-Football key currently configured in Cloudflare.");

const d1Endpoint = "https://api.cloudflare.com/client/v4/accounts/" + accountId + "/d1/database/" + databaseId + "/query";
async function d1(sql, params = []) {
  const response = await fetch(d1Endpoint, { method: "POST", headers: { Authorization: "Bearer " + cloudflareToken, "Content-Type": "application/json" }, body: JSON.stringify({ sql, params }), signal: AbortSignal.timeout(30000) });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.success !== true) throw new Error("Cloudflare D1 query failed (HTTP " + response.status + "): " + JSON.stringify(payload?.errors || payload).slice(0, 900));
  const result = payload.result?.[0];
  if (result?.success === false) throw new Error("Cloudflare D1 SQL failed: " + JSON.stringify(result.meta || result).slice(0, 900));
  return result?.results || [];
}
const clean = (value, max = 180) => String(value ?? "").replace(/[<>\u0000-\u001f]/g, "").replace(/\s+/g, " ").trim().slice(0, max);
const normalize = value => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\b(football club|fc|afc|cf|sc|cfc|club)\b/g, " ").replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
const hash = value => createHash("sha256").update(value).digest("hex");
const nairobiDate = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Nairobi", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const utcDate = () => new Date().toISOString().slice(0, 10);
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

const competitions = {
  soccer_epl: ["Premier League", "England"],
  soccer_uefa_champs_league: ["UEFA Champions League", ""],
  soccer_uefa_europa_league: ["UEFA Europa League", ""],
  soccer_uefa_europa_conference_league: ["UEFA Europa Conference League", ""],
  soccer_uefa_nations_league: ["UEFA Nations League", ""],
  soccer_fifa_world_cup: ["FIFA World Cup", ""],
  soccer_spain_la_liga: ["La Liga", "Spain"],
  soccer_germany_bundesliga: ["Bundesliga", "Germany"],
  soccer_germany_bundesliga_women: ["Frauen-Bundesliga", "Germany"],
  soccer_italy_serie_a: ["Serie A", "Italy"],
  soccer_france_ligue_one: ["Ligue 1", "France"],
  soccer_netherlands_eredivisie: ["Eredivisie", "Netherlands"],
  soccer_portugal_primeira_liga: ["Primeira Liga", "Portugal"],
  soccer_usa_mls: ["Major League Soccer", "USA"],
  soccer_england_championship: ["Championship", "England"],
  soccer_fa_cup: ["FA Cup", "England"],
  soccer_brazil_campeonato: ["Serie A", "Brazil"],
  soccer_brazil_serie_b: ["Serie B", "Brazil"],
  soccer_australia_aleague: ["A-League Men", "Australia"],
  soccer_japan_j_league: ["J1 League", "Japan"],
  soccer_turkey_super_league: ["Super Lig", "Turkey"],
  soccer_scotland_premiership: ["Premiership", "Scotland"],
  soccer_belgium_first_div: ["Pro League", "Belgium"],
  soccer_mexico_ligamx: ["Liga MX", "Mexico"],
  soccer_argentina_primera_division: ["Liga Profesional", "Argentina"],
  soccer_chile_campeonato: ["Primera División", "Chile"],
  soccer_norway_eliteserien: ["Eliteserien", "Norway"]
};

const aliases = { "man utd": "manchester united", "man united": "manchester united", "manchester utd": "manchester united", "man city": "manchester city", "spurs": "tottenham hotspur", "wolves": "wolverhampton wanderers", "west ham": "west ham united", "newcastle": "newcastle united", "brighton": "brighton and hove albion", "athletico madrid": "atletico madrid", "internazionale": "inter", "inter milan": "inter" };
const normTeam = value => aliases[normalize(value)] || normalize(value);
const flatten = value => (value || []).flatMap(group => Array.isArray(group) ? group : []);
const calendarSeasonKeys = new Set(["soccer_usa_mls", "soccer_brazil_campeonato", "soccer_brazil_serie_b", "soccer_japan_j_league"]);

await d1("CREATE TABLE IF NOT EXISTS sports_leagues (sport_key TEXT PRIMARY KEY,league_id INTEGER NOT NULL,season INTEGER NOT NULL,league_name TEXT NOT NULL,country TEXT NOT NULL DEFAULT '',logo_url TEXT NOT NULL DEFAULT '',logo_key TEXT NOT NULL DEFAULT '',standings_json TEXT NOT NULL DEFAULT '[]',last_attempt_date TEXT NOT NULL DEFAULT '',last_enriched_date TEXT NOT NULL DEFAULT '',last_error TEXT NOT NULL DEFAULT '',updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
await d1("CREATE TABLE IF NOT EXISTS sports_api_usage (utc_date TEXT PRIMARY KEY,requests INTEGER NOT NULL DEFAULT 0)");
await d1("CREATE TABLE IF NOT EXISTS sports_api_rate_state (id INTEGER PRIMARY KEY CHECK(id=1),last_request_at TEXT NOT NULL)");
await d1("CREATE TABLE IF NOT EXISTS sports_data_sync (publish_date TEXT PRIMARY KEY,status TEXT NOT NULL,competitions INTEGER NOT NULL DEFAULT 0,teams INTEGER NOT NULL DEFAULT 0,api_requests INTEGER NOT NULL DEFAULT 0,started_at TEXT NOT NULL,completed_at TEXT,error TEXT)");
await d1("CREATE TABLE IF NOT EXISTS team_badges (team_name TEXT PRIMARY KEY,normalized_name TEXT NOT NULL,image_key TEXT NOT NULL,source_url TEXT NOT NULL,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");

let localLastRequest = 0;
async function footballApi(path, params) {
  const day = utcDate();
  const url = new URL("https://v3.football.api-sports.io/" + path);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  let lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    const usage = await d1("SELECT requests FROM sports_api_usage WHERE utc_date=?", [day]);
    if (Number(usage[0]?.requests || 0) >= 75) throw new Error("Daily safety cap reached (75 API-Football requests).");
    const stored = await d1("SELECT last_request_at FROM sports_api_rate_state WHERE id=1");
    const persisted = stored[0]?.last_request_at ? Date.parse(stored[0].last_request_at) : 0;
    const elapsed = Date.now() - Math.max(localLastRequest, persisted);
    if (elapsed < 7200) await wait(7200 - elapsed);
    const now = new Date().toISOString();
    localLastRequest = Date.now();
    await d1("INSERT INTO sports_api_rate_state (id,last_request_at) VALUES (1,?) ON CONFLICT(id) DO UPDATE SET last_request_at=excluded.last_request_at", [now]);
    await d1("INSERT INTO sports_api_usage (utc_date,requests) VALUES (?,1) ON CONFLICT(utc_date) DO UPDATE SET requests=requests+1", [day]);
    const response = await fetch(url, { headers: { "x-apisports-key": footballKey, "User-Agent": "AccaForge/1.0" }, signal: AbortSignal.timeout(20000) });
    const payload = await response.json().catch(() => ({}));
    if (response.status === 429 || payload?.errors?.rateLimit) {
      const delay = 65000 * (attempt + 1);
      console.warn("API-Football minute limit reached; waiting " + Math.round(delay / 1000) + " seconds before retry.");
      lastError = "API-Football minute request limit reached after retries.";
      if (attempt < 2) await wait(delay);
      continue;
    }
    if (!response.ok) throw new Error("API-Football " + path + " returned HTTP " + response.status + ".");
    if (payload?.errors && Object.keys(payload.errors).length) throw new Error("API-Football rejected " + path + ": " + JSON.stringify(payload.errors).slice(0, 350));
    return Array.isArray(payload.response) ? payload.response : [];
  }
  throw new Error(lastError || "API-Football request failed.");
}

async function resolveLeague(sportKey, expectedSeason) {
  const mapping = competitions[sportKey];
  if (!mapping) throw new Error("No explicit API-Football competition mapping for " + sportKey + ".");
  const [searchName, expectedCountry] = mapping;
  // API-Football does not allow country and search in the same request. Search first,
  // then match the returned country locally to avoid selecting a similarly named league.
  const items = await footballApi("leagues", { search: searchName });
  const candidates = items.filter(item => item.league && (!expectedCountry || normalize(item.country || item.league.country) === normalize(expectedCountry)));
  const exact = candidates.find(item => normalize(item.league.name) === normalize(searchName)) || candidates.find(item => normalize(item.league.name).includes(normalize(searchName)));
  if (!exact?.league?.id) throw new Error("Could not safely match " + searchName + (expectedCountry ? " (" + expectedCountry + ")" : "") + " in API-Football.");
  const seasons = Array.isArray(exact.seasons) ? exact.seasons : [];
  const season = seasons.find(item => Number(item.year) === expectedSeason) || seasons.find(item => item.current) || seasons.sort((a, b) => Number(b.year) - Number(a.year))[0];
  if (!season?.year) throw new Error("No available season for " + searchName + ".");
  return { id: Number(exact.league.id), name: clean(exact.league.name), country: clean(exact.country || expectedCountry), logo: String(exact.league.logo || ""), season: Number(season.year) };
}

function normalizeStandings(payload) {
  const league = payload[0]?.league;
  const rows = flatten(league?.standings || []);
  return {
    leagueName: clean(league?.name), country: clean(league?.country), logo: String(league?.logo || ""),
    rows: rows.map(row => ({
      position: Number(row.rank || 0), team: clean(row.team?.name), played: Number(row.all?.played || 0),
      won: Number(row.all?.win || 0), drawn: Number(row.all?.draw || 0), lost: Number(row.all?.lose || 0),
      goalsFor: Number(row.all?.goals?.for || 0), goalsAgainst: Number(row.all?.goals?.against || 0),
      goalDifference: Number(row.goalsDiff || 0), points: Number(row.points || 0), form: clean(row.form || "", 24),
      teamLogo: String(row.team?.logo || "")
    })).filter(row => row.team && row.position > 0)
  };
}
function matchTeam(teams, name) {
  const key = normTeam(name);
  return teams.find(team => normTeam(team.name) === key) || teams.find(team => key.length > 7 && (normTeam(team.name).includes(key) || key.includes(normTeam(team.name))));
}

const date = nairobiDate();
const existingSync = await d1("SELECT status FROM sports_data_sync WHERE publish_date=?", [date]);
if (existingSync[0]?.status === "completed") {
  console.log("Sports enrichment already completed for " + date + "; no API calls made.");
  process.exit(0);
}
const fixtures = await d1("SELECT DISTINCT s.sport_key,s.home_team,s.away_team FROM selections s JOIN accas a ON a.id=s.acca_id WHERE a.status='published' AND a.publish_date=? ORDER BY s.sport_key,s.home_team,s.away_team", [date]);
const grouped = new Map();
for (const row of fixtures) {
  if (!grouped.has(row.sport_key)) grouped.set(row.sport_key, { teams: new Set(), fixtures: [] });
  grouped.get(row.sport_key).teams.add(row.home_team);
  grouped.get(row.sport_key).teams.add(row.away_team);
  grouped.get(row.sport_key).fixtures.push(row);
}
if (!grouped.size) {
  console.log("No published fixtures found for " + date + "; no sports data calls made.");
  process.exit(0);
}
await d1("INSERT INTO sports_data_sync (publish_date,status,started_at) VALUES (?,'running',?) ON CONFLICT(publish_date) DO UPDATE SET status='running',started_at=excluded.started_at,error=NULL", [date, new Date().toISOString()]);
console.log("GitHub is enriching " + grouped.size + " published competitions for " + date + " and writing directly to Cloudflare D1.");

let success = 0, failed = 0, matchedTotal = 0, requestCountStart = Number((await d1("SELECT requests FROM sports_api_usage WHERE utc_date=?", [utcDate()]))[0]?.requests || 0);
for (const [sportKey, group] of grouped) {
  try {
    const [year, month] = date.split("-").map(Number);
    const expectedSeason = calendarSeasonKeys.has(sportKey) ? year : (month >= 7 ? year : year - 1);
    const old = (await d1("SELECT league_id,season,league_name,country,logo_url,last_enriched_date FROM sports_leagues WHERE sport_key=?", [sportKey]))[0];
    const league = old?.league_id && Number(old.season) === expectedSeason
      ? { id: Number(old.league_id), name: old.league_name, country: old.country, logo: old.logo_url, season: Number(old.season) }
      : await resolveLeague(sportKey, expectedSeason);
    const teamItems = await footballApi("teams", { league: String(league.id), season: String(league.season) });
    const standingsItems = await footballApi("standings", { league: String(league.id), season: String(league.season) });
    const teams = teamItems.map(item => ({ id: Number(item.team?.id), name: clean(item.team?.name), logo: String(item.team?.logo || "") })).filter(team => team.id && team.name);
    const table = normalizeStandings(standingsItems);
    const logoUrl = String(table.logo || league.logo || "");
    await d1("INSERT INTO sports_leagues (sport_key,league_id,season,league_name,country,logo_url,logo_key,standings_json,last_attempt_date,last_enriched_date,last_error,updated_at) VALUES (?,?,?,?,?,?,'',?,?,?, '',CURRENT_TIMESTAMP) ON CONFLICT(sport_key) DO UPDATE SET league_id=excluded.league_id,season=excluded.season,league_name=excluded.league_name,country=excluded.country,logo_url=excluded.logo_url,logo_key='',standings_json=excluded.standings_json,last_attempt_date=excluded.last_attempt_date,last_enriched_date=excluded.last_enriched_date,last_error='',updated_at=CURRENT_TIMESTAMP",
      [sportKey, league.id, league.season, table.leagueName || league.name, table.country || league.country, logoUrl, JSON.stringify(table.rows), date, date]);
    let matched = 0;
    for (const name of group.teams) {
      const team = matchTeam(teams, name);
      if (!team?.logo) continue;
      await d1("INSERT INTO team_badges (team_name,normalized_name,image_key,source_url,updated_at) VALUES (?,?, '',?,CURRENT_TIMESTAMP) ON CONFLICT(team_name) DO UPDATE SET normalized_name=excluded.normalized_name,source_url=excluded.source_url,updated_at=CURRENT_TIMESTAMP",
        [name, normTeam(name), team.logo]);
      matched++;
    }
    for (const row of flatten(standingsItems[0]?.league?.standings || [])) {
      if (!row.team?.name || !row.team?.logo) continue;
      await d1("INSERT INTO team_badges (team_name,normalized_name,image_key,source_url,updated_at) VALUES (?,?, '',?,CURRENT_TIMESTAMP) ON CONFLICT(team_name) DO UPDATE SET normalized_name=excluded.normalized_name,source_url=excluded.source_url,updated_at=CURRENT_TIMESTAMP",
        [clean(row.team.name), normTeam(row.team.name), String(row.team.logo)]);
    }
    success++;
    matchedTotal += matched;
    console.log(JSON.stringify({ sportKey, league: table.leagueName || league.name, teams: teams.length, matchedFixtures: matched, standings: table.rows.length, savedDirectlyToD1: true }));
  } catch (error) {
    failed++;
    const message = clean(error instanceof Error ? error.message : error, 450);
    await d1("INSERT INTO sports_leagues (sport_key,league_id,season,league_name,last_attempt_date,last_error) VALUES (?,0,0,?,?,?) ON CONFLICT(sport_key) DO UPDATE SET last_attempt_date=excluded.last_attempt_date,last_error=excluded.last_error,updated_at=CURRENT_TIMESTAMP",
      [sportKey, competitions[sportKey]?.[0] || sportKey, date, message]);
    console.error(JSON.stringify({ sportKey, failed: true, error: message }));
  }
}
const requestCountEnd = Number((await d1("SELECT requests FROM sports_api_usage WHERE utc_date=?", [utcDate()]))[0]?.requests || 0);
const status = failed ? (success ? "partial" : "failed") : "completed";
const errorSummary = failed ? (await d1("SELECT sport_key,last_error FROM sports_leagues WHERE last_attempt_date=? AND last_error<>''", [date])).map(row => row.sport_key + ": " + row.last_error).join("; ").slice(0, 1500) : null;
await d1("INSERT INTO sports_data_sync (publish_date,status,competitions,teams,api_requests,started_at,completed_at,error) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(publish_date) DO UPDATE SET status=excluded.status,competitions=excluded.competitions,teams=excluded.teams,api_requests=excluded.api_requests,completed_at=excluded.completed_at,error=excluded.error",
  [date, status, success, matchedTotal, requestCountEnd - requestCountStart, new Date().toISOString(), new Date().toISOString(), errorSummary]);
console.log("Sports enrichment summary: " + JSON.stringify({ date, status, competitions: success, failed, teams: matchedTotal, apiRequests: requestCountEnd - requestCountStart }));
if (failed) process.exitCode = 1;
