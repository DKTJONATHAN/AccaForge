import { createHash } from "node:crypto";

const env = process.env;
const accountId = (env.CLOUDFLARE_ACCOUNT_ID || "").trim();
const databaseId = (env.D1_DATABASE_ID || "").trim();
const cloudflareToken = (env.CLOUDFLARE_API_TOKEN || "").trim();
const sportsDbKey = (env.THESPORTSDB_API_KEY || "123").trim();
if (!accountId || !databaseId || !cloudflareToken) {
  throw new Error("Missing CLOUDFLARE_ACCOUNT_ID, D1_DATABASE_ID or CLOUDFLARE_API_TOKEN GitHub secret.");
}

const d1Endpoint = "https://api.cloudflare.com/client/v4/accounts/" + accountId + "/d1/database/" + databaseId + "/query";
async function d1(sql, params = []) {
  const response = await fetch(d1Endpoint, {
    method: "POST",
    headers: { Authorization: "Bearer " + cloudflareToken, "Content-Type": "application/json" },
    body: JSON.stringify({ sql, params }),
    signal: AbortSignal.timeout(30000)
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.success !== true) {
    throw new Error("Cloudflare D1 query failed (HTTP " + response.status + "): " + JSON.stringify(payload?.errors || payload).slice(0, 900));
  }
  const result = payload.result?.[0];
  if (result?.success === false) throw new Error("Cloudflare D1 SQL failed: " + JSON.stringify(result.meta || result).slice(0, 900));
  return result?.results || [];
}
const clean = (value, max = 180) => String(value ?? "").replace(/[<>\u0000-\u001f]/g, "").replace(/\s+/g, " ").trim().slice(0, max);
const normalize = value => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
  .replace(/\b(football club|fc|afc|cf|sc|cfc|club)\b/g, " ").replace(/&/g, " and ")
  .replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
const aliases = {
  "man utd": "manchester united", "man united": "manchester united", "manchester utd": "manchester united",
  "man city": "manchester city", "spurs": "tottenham hotspur", "wolves": "wolverhampton wanderers",
  "west ham": "west ham united", "newcastle": "newcastle united", "brighton": "brighton and hove albion",
  "athletico madrid": "atletico madrid", "internazionale": "inter", "inter milan": "inter"
};
const seededCompetitions = {
  soccer_epl: ["English Premier League", "Premier League"],
  soccer_england_championship: ["English League Championship", "EFL Championship", "Championship"],
  soccer_england_league_one: ["English League One", "League One"],
  soccer_england_league_two: ["English League Two", "League Two"],
  soccer_uefa_champs_league: ["UEFA Champions League", "Champions League"],
  soccer_uefa_europa_league: ["UEFA Europa League", "Europa League"],
  soccer_uefa_europa_conference_league: ["UEFA Europa Conference League", "Europa Conference League"],
  soccer_uefa_nations_league: ["UEFA Nations League", "Nations League"],
  soccer_spain_la_liga: ["Spanish La Liga", "La Liga"],
  soccer_germany_bundesliga: ["German Bundesliga", "Bundesliga"],
  soccer_italy_serie_a: ["Italian Serie A", "Serie A"],
  soccer_france_ligue_one: ["French Ligue 1", "Ligue 1"],
  soccer_netherlands_eredivisie: ["Dutch Eredivisie", "Eredivisie"],
  soccer_portugal_primeira_liga: ["Portuguese Primeira Liga", "Primeira Liga"],
  soccer_scotland_premiership: ["Scottish Premiership", "Premiership"],
  soccer_belgium_first_div: ["Belgian Pro League", "Belgian First Division A", "Pro League"],
  soccer_turkey_super_league: ["Turkish Super Lig", "Super Lig"],
  soccer_usa_mls: ["American Major League Soccer", "Major League Soccer"],
  soccer_brazil_campeonato: ["Brazilian Serie A", "Campeonato Brasileiro Serie A"],
  soccer_brazil_serie_b: ["Brazilian Serie B", "Campeonato Brasileiro Serie B"],
  soccer_australia_aleague: ["Australian A-League Men", "A-League Men"],
  soccer_japan_j_league: ["Japanese J1 League", "J1 League"],
  soccer_mexico_ligamx: ["Mexican Liga MX", "Liga MX"],
  soccer_argentina_primera_division: ["Argentine Primera Division", "Liga Profesional"]
};
const teamKey = value => aliases[normalize(value)] || normalize(value);
const hash = value => createHash("sha256").update(value).digest("hex");
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
function nairobiDate(offsetDays = 0) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Nairobi", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const date = new Date(parts + "T12:00:00Z");
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

await d1("CREATE TABLE IF NOT EXISTS result_selections (selection_id TEXT PRIMARY KEY,acca_id TEXT NOT NULL,product_type TEXT NOT NULL,headline TEXT NOT NULL,publish_date TEXT NOT NULL,event_id TEXT NOT NULL,sport_key TEXT NOT NULL,commence_time TEXT NOT NULL,home_team TEXT NOT NULL,away_team TEXT NOT NULL,market_key TEXT NOT NULL,market_name TEXT NOT NULL,selection_name TEXT NOT NULL,odds REAL NOT NULL,selection_status TEXT NOT NULL DEFAULT 'PENDING',home_score INTEGER,away_score INTEGER,outcome TEXT NOT NULL DEFAULT 'PENDING',settled_at TEXT,result_note TEXT NOT NULL DEFAULT '')");
await d1("CREATE TABLE IF NOT EXISTS team_badges (team_name TEXT PRIMARY KEY,normalized_name TEXT NOT NULL,image_key TEXT NOT NULL,source_url TEXT NOT NULL,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
await d1("CREATE TABLE IF NOT EXISTS sports_leagues (sport_key TEXT PRIMARY KEY,league_id INTEGER NOT NULL,season INTEGER NOT NULL,league_name TEXT NOT NULL,country TEXT NOT NULL DEFAULT '',logo_url TEXT NOT NULL DEFAULT '',logo_key TEXT NOT NULL DEFAULT '',standings_json TEXT NOT NULL DEFAULT '[]',last_attempt_date TEXT NOT NULL DEFAULT '',last_enriched_date TEXT NOT NULL DEFAULT '',last_error TEXT NOT NULL DEFAULT '',updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");

const today = nairobiDate(0);
const yesterday = nairobiDate(-1);
// Build a league inventory from every competition represented in published AccaForge editions,
 // not just the teams playing today. One recent fixture per competition is enough to resolve its
 // canonical league ID; the provider's league roster endpoint then supplies every club badge.
const fixtures = await d1(
  "SELECT DISTINCT s.sport_key,s.home_team,s.away_team FROM selections s JOIN accas a ON a.id=s.acca_id WHERE a.status='published' " +
  "UNION SELECT DISTINCT sport_key,home_team,away_team FROM result_selections"
);
const names = [...new Set(fixtures.flatMap(row => [clean(row.home_team), clean(row.away_team)]).filter(Boolean))];
const representatives = new Map();
for (const row of fixtures) if (row.sport_key && !representatives.has(row.sport_key)) representatives.set(row.sport_key, row);
if (!names.length) console.log("No published fixture teams found; running the configured competition catalogue only.");

let requestCount = 0;
let matchedTeams = 0;
let savedTeamLogos = 0;
let savedLeagueLogos = 0;
let missing = 0;
let lastRequestAt = 0;
const leagueCache = new Map();
const leagueTeamsCache = new Map();

async function sportsDb(path, params) {
  const elapsed = Date.now() - lastRequestAt;
  if (elapsed < 2200) await wait(2200 - elapsed);
  lastRequestAt = Date.now();
  const url = new URL("https://www.thesportsdb.com/api/v1/json/" + encodeURIComponent(sportsDbKey) + "/" + path);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
  for (let attempt = 0; attempt < 3; attempt++) {
    requestCount++;
    const response = await fetch(url, {
      headers: { "User-Agent": "AccaForge/1.0 (+https://accaforge.co.ke)", "X-API-KEY": sportsDbKey },
      signal: AbortSignal.timeout(20000)
    });
    if (response.status === 429) {
      const delay = 65000 * (attempt + 1);
      console.warn("TheSportsDB free-tier rate limit reached; waiting " + Math.round(delay / 1000) + " seconds.");
      if (attempt < 2) { await wait(delay); continue; }
      throw new Error("TheSportsDB rate limit persisted after retries.");
    }
    if (!response.ok) throw new Error("TheSportsDB " + path + " returned HTTP " + response.status + ".");
    return await response.json();
  }
  throw new Error("TheSportsDB request failed after retries.");
}

function seasonStart(value) {
  const match = String(value || "").match(/(19|20)\d{2}/);
  return match ? Number(match[0]) : Number(nairobiDate().slice(0, 4));
}

function leagueForCompetition(team, sportKey) {
  const slug = sportKey.replace(/^soccer_/, "").toLowerCase();
  const aliases = {
    epl: ["premier league", "english premier league"],
    spain_la_liga: ["la liga", "primera division"],
    germany_bundesliga: ["bundesliga"],
    italy_serie_a: ["serie a"],
    france_ligue_one: ["ligue 1"],
    netherlands_eredivisie: ["eredivisie"],
    portugal_primeira_liga: ["primeira liga"],
    usa_mls: ["major league soccer", "mls"],
    england_championship: ["championship"],
    england_league_one: ["league one", "english league one"],
    england_league_two: ["league two", "english league two"],
    uefa_champs_league: ["uefa champions league", "champions league"],
    uefa_europa_league: ["uefa europa league", "europa league"],
    uefa_europa_conference_league: ["uefa europa conference league", "conference league"],
    uefa_nations_league: ["uefa nations league"],
    fifa_world_cup: ["fifa world cup", "world cup"],
    fa_cup: ["fa cup"],
    brazil_campeonato: ["serie a", "campeonato brasileiro serie a"],
    brazil_serie_b: ["serie b", "campeonato brasileiro serie b"],
    australia_aleague: ["a-league", "a-league men"],
    japan_j_league: ["j1 league", "j league"],
    turkey_super_league: ["super lig", "super league"],
    scotland_premiership: ["scottish premiership", "premiership"],
    belgium_first_div: ["pro league", "first division a"],
    mexico_ligamx: ["liga mx"],
    argentina_primera_division: ["liga profesional", "primera division"],
    chile_campeonato: ["primera division"],
    norway_eliteserien: ["eliteserien"]
  };
  const parts = slug.split("_");
  const inferred = [slug.replace(/_/g, " ")];
  if (parts.length > 2) inferred.push(parts.slice(1).join(" "));
  const expected = [...(aliases[slug] || []), ...inferred];
  for (let index = 1; index <= 10; index++) {
    const name = team["strLeague" + (index === 1 ? "" : index)];
    const id = team["idLeague" + (index === 1 ? "" : index)];
    if (!name || !id) continue;
    const normalized = normalize(name);
    if (expected.some(alias => normalized === normalize(alias) || normalized.includes(normalize(alias)) || normalize(alias).includes(normalized))) {
      return { id: Number(id), name: clean(name) };
    }
  }
  return null;
}

async function findProviderLeague(sportKey) {
  const candidates = seededCompetitions[sportKey] || [];
  for (const candidateName of candidates) {
    const payload = await sportsDb("searchleague.php", { l: candidateName });
    const leagues = Array.isArray(payload.leagues) ? payload.leagues : [];
    const exact = leagues.find(item =>
      item.strSport === "Soccer" &&
      normalize(item.strLeague) === normalize(candidateName)
    );
    if (exact?.idLeague) {
      return {
        strLeague: clean(exact.strLeague),
        idLeague: Number(exact.idLeague),
        strCountry: clean(exact.strCountry || "")
      };
    }
  }
  return null;
}

async function saveLeague(team, sportKey, runDate) {
  const selected = leagueForCompetition(team, sportKey);
  if (!selected?.id) return false;
  let details = leagueCache.get(selected.id);
  if (!details) {
    try {
      const data = await sportsDb("lookupleague.php", { id: selected.id });
      const league = Array.isArray(data.leagues) ? data.leagues[0] : null;
      details = {
        name: clean(league?.strLeague || selected.name),
        country: clean(league?.strCountry || team.strCountry || ""),
        logo: String(league?.strBadge || league?.strLogo || league?.strPoster || ""),
        season: seasonStart(league?.strCurrentSeason || "")
      };
    } catch (error) {
      console.warn("League details lookup failed for " + selected.name + ": " + String(error));
      details = { name: selected.name, country: clean(team.strCountry), logo: "", season: seasonStart("") };
    }
    leagueCache.set(selected.id, details);
  }
  const existing = (await d1("SELECT standings_json,logo_key,logo_url FROM sports_leagues WHERE sport_key=?", [sportKey]))[0];
  await d1(
    "INSERT INTO sports_leagues (sport_key,league_id,season,league_name,country,logo_url,logo_key,standings_json,last_attempt_date,last_enriched_date,last_error,updated_at) " +
    "VALUES (?,?,?,?,?,?, '', '[]',?,?, '',CURRENT_TIMESTAMP) " +
    "ON CONFLICT(sport_key) DO UPDATE SET league_id=excluded.league_id,season=excluded.season,league_name=excluded.league_name,country=excluded.country," +
    "logo_key=CASE WHEN excluded.logo_url<>'' AND sports_leagues.logo_url<>excluded.logo_url THEN '' ELSE sports_leagues.logo_key END," +
    "logo_url=CASE WHEN excluded.logo_url<>'' THEN excluded.logo_url ELSE sports_leagues.logo_url END," +
    "last_attempt_date=excluded.last_attempt_date,last_enriched_date=excluded.last_enriched_date,last_error='',updated_at=CURRENT_TIMESTAMP",
    [sportKey, selected.id, details.season, details.name, details.country, details.logo, runDate, runDate]
  );
  if (details.logo && !existing?.logo_url) savedLeagueLogos++;

  // Expand this competition into its complete club roster. Store source URLs in D1;
  // the existing Worker media-cache task downloads the bytes into R2 and writes image_key.
  if (!leagueTeamsCache.has(selected.id)) {
    try {
      const roster = await sportsDb("search_all_teams.php", { l: details.name });
      const clubs = Array.isArray(roster.teams) ? roster.teams : [];
      const leagueName = normalize(details.name);
      const safeClubs = clubs.filter(club =>
        club.strSport === "Soccer" &&
        (!club.strLeague || normalize(club.strLeague) === leagueName)
      );
      let saved = 0;
      for (const club of safeClubs) {
        const clubName = clean(club.strTeam);
        const badge = String(club.strBadge || club.strTeamBadge || club.strLogo || "");
        if (!clubName || !badge.toLowerCase().startsWith("https://")) continue;
        await d1(
          "INSERT INTO team_badges (team_name,normalized_name,image_key,source_url,updated_at) VALUES (?,?, '',?,CURRENT_TIMESTAMP) " +
          "ON CONFLICT(team_name) DO UPDATE SET normalized_name=excluded.normalized_name," +
          "image_key=CASE WHEN team_badges.source_url<>excluded.source_url THEN '' ELSE team_badges.image_key END," +
          "source_url=excluded.source_url," +
          "updated_at=CURRENT_TIMESTAMP",
          [clubName, teamKey(clubName), badge]
        );
        saved++;
      }
      leagueTeamsCache.set(selected.id, saved);
      savedTeamLogos += saved;
      console.log("League roster discovered: " + details.name + " (" + saved + " club badges)");
    } catch (error) {
      console.warn("Full club roster lookup failed for " + details.name + ": " + String(error));
      leagueTeamsCache.set(selected.id, 0);
    }
  }
  return true;
}

const teamLookupCache = new Map();
async function findProviderTeam(name) {
  if (teamLookupCache.has(name)) return teamLookupCache.get(name);
  const payload = await sportsDb("searchteams.php", { t: name });
  const candidates = Array.isArray(payload.teams) ? payload.teams : [];
  const team = candidates.find(item => item.strSport === "Soccer" && teamKey(item.strTeam) === teamKey(name)) || null;
  teamLookupCache.set(name, team);
  return team;
}

const resolvedLeagues = new Set();
console.log("TheSportsDB enrichment starting for " + names.length + " historical published club names across " + representatives.size + " competitions.");
// Seed the core competition catalogue independently of published fixtures. This ensures
// major competitions such as the Championship and UEFA tournaments are enriched even on
// days when they have no published selections.
for (const sportKey of Object.keys(seededCompetitions)) {
  try {
    const league = await findProviderLeague(sportKey);
    if (!league) {
      console.warn("No exact Soccer league match in TheSportsDB for configured competition " + sportKey);
      continue;
    }
    await saveLeague(league, sportKey, today);
    resolvedLeagues.add(sportKey);
    console.log("Configured competition enriched: " + sportKey + " -> " + league.strLeague);
  } catch (error) {
    console.warn("Configured competition lookup failed for " + sportKey + ": " + String(error));
  }
}

// Resolve one representative club for every additional competition found in published history.
for (const [sportKey, row] of representatives) {
  let resolved = false;
  for (const candidate of [clean(row.home_team), clean(row.away_team)].filter(Boolean)) {
    try {
      const team = await findProviderTeam(candidate);
      if (!team || !leagueForCompetition(team, sportKey)) continue;
      await saveLeague(team, sportKey, today);
      resolvedLeagues.add(sportKey);
      resolved = true;
      break;
    } catch (error) {
      console.warn("Competition discovery failed for " + sportKey + " using " + candidate + ": " + String(error));
    }
  }
  if (!resolved) console.warn("No safe representative team-to-league match for " + sportKey);
}

for (const name of names) {
  try {
    const existing = (await d1("SELECT source_url FROM team_badges WHERE team_name=?", [name]))[0];
    if (existing?.source_url) continue;
    const team = await findProviderTeam(name);
    if (!team) {
      missing++;
      console.log("No safe exact TheSportsDB match for: " + name);
      continue;
    }
    matchedTeams++;
    const badge = String(team.strBadge || team.strTeamBadge || team.strLogo || "");
    if (badge && /^https:\/\//i.test(badge)) {
      await d1(
        "INSERT INTO team_badges (team_name,normalized_name,image_key,source_url,updated_at) VALUES (?,?, '',?,CURRENT_TIMESTAMP) " +
        "ON CONFLICT(team_name) DO UPDATE SET normalized_name=excluded.normalized_name," +
        "image_key=CASE WHEN team_badges.source_url<>excluded.source_url THEN '' ELSE team_badges.image_key END," +
        "source_url=excluded.source_url,updated_at=CURRENT_TIMESTAMP",
        [name, teamKey(name), badge]
      );
      savedTeamLogos++;
    }
    const relevantRows = fixtures.filter(row => teamKey(row.home_team) === teamKey(name) || teamKey(row.away_team) === teamKey(name));
    for (const row of relevantRows) {
      if (resolvedLeagues.has(row.sport_key)) continue;
      try {
        await saveLeague(team, row.sport_key, today);
        resolvedLeagues.add(row.sport_key);
      } catch (error) {
        console.warn("Competition artwork save failed for " + row.sport_key + ": " + String(error));
      }
    }
    console.log(JSON.stringify({ team: name, matched: team.strTeam, country: clean(team.strCountry), league: clean(team.strLeague), teamBadge: Boolean(badge) }));
  } catch (error) {
    console.error("TheSportsDB lookup failed for " + name + ": " + String(error));
  }
}
console.log("TheSportsDB enrichment complete: " + JSON.stringify({
  today, yesterday, publishedFixturesAndResults: fixtures.length, distinctHistoricalClubs: names.length, publishedCompetitions: representatives.size, seededCompetitions: Object.keys(seededCompetitions).length, resolvedCompetitions: [...resolvedLeagues], matchedTeams, rosterLookups: leagueTeamsCache.size,
  savedTeamLogos, savedLeagueLogos, unmatchedTeams: missing, apiRequests: requestCount,
  metadataDestination: "Cloudflare D1 (team_badges and sports_leagues)", cacheDestination: "Cloudflare R2 via the scheduled Worker media-cache task"
}));
