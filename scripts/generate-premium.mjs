import { buildOddsCandidates, summarizeTeamForm, validatePremiumPick } from "./lib/premium-engine.mjs";
import { OddsPapiClient } from "./lib/oddspapi.mjs";

const env = process.env;
const SUPABASE_URL = (env.SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_KEY = (env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
const FOOTBALL_KEYS = ["PREMIUM_FOOTBALL_KEY", "PREMIUM_FOOTBALL_KEY1", "PREMIUM_FOOTBALL_KEY2"].map(name => (env[name] || "").trim()).filter(Boolean);
const GROQ_KEYS = ["GROQ_API_KEY", "GROQ_API_KEY1", "GROQ_API_KEY2", "GROQ_API_KEY3", "GROQ_API_KEY4"].map(name => (env[name] || "").trim()).filter(Boolean);
const oddsPapi = new OddsPapiClient(FOOTBALL_KEYS);
const GROQ_MODEL = (env.PREMIUM_GROQ_MODEL || "openai/gpt-oss-120b").trim();
const MAX_FIXTURES = Math.min(12, Math.max(1, Number(env.PREMIUM_MAX_FIXTURES || 10)));
const LEAGUE_SLUGS = new Set((env.PREMIUM_TOURNAMENT_SLUGS || "premier-league,laliga,serie-a,bundesliga,ligue-1").split(",").map(value => value.trim().toLowerCase()).filter(Boolean));
const PROVIDER = "oddspapi";
const now = new Date();
const publicationDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Nairobi", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
const apiCalls = { football: 0, groq: 0 };
const groqLastUsed = new Map(GROQ_KEYS.map(key => [key, 0]));
let groqCursor = 0;
let runId = null;

if (!SUPABASE_URL || !SUPABASE_KEY || !FOOTBALL_KEYS.length || !GROQ_KEYS.length) {
  throw new Error("Missing required Premium configuration: Supabase credentials, at least one PREMIUM_FOOTBALL_KEY[1..2], and at least one existing GROQ_API_KEY[1..4] credential.");
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const supabaseHeaders = () => {
  const headers = new Headers({ apikey: SUPABASE_KEY, "Content-Type": "application/json" });
  if (!SUPABASE_KEY.startsWith("sb_secret_")) headers.set("Authorization", "Bearer " + SUPABASE_KEY);
  return headers;
};
async function supabase(path, init = {}) {
  const headers = new Headers(init.headers);
  for (const [key, value] of supabaseHeaders()) if (!headers.has(key)) headers.set(key, value);
  const response = await fetch(SUPABASE_URL + path, { ...init, headers, signal: AbortSignal.timeout(30000) });
  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 500);
    throw new Error("Supabase request failed (" + response.status + "): " + detail);
  }
  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}
function addDays(date, days) {
  const value = new Date(date + "T12:00:00+03:00");
  value.setDate(value.getDate() + days);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Nairobi", year: "numeric", month: "2-digit", day: "2-digit" }).format(value);
}
function isEligibleFixture(item) {
  const league = item.league || {};
  return item.fixture?.status?.short === "NS" &&
    LEAGUE_SLUGS.has(String(league.slug || "").toLowerCase()) &&
    !/(cup|copa|coupe|pokal|beker|knockout|champions league|europa league)/i.test(String(league.name || ""));
}
function sportKey(league) {
  return "soccer_" + String(league.name || "football").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}
async function storeFixture(item) {
  const fixture = item.fixture || {};
  const league = item.league || {};
  const payload = {
    provider: PROVIDER,
    provider_event_id: String(fixture.id),
    sport_key: sportKey(league),
    competition: String(league.name || "Football"),
    commence_time: fixture.date,
    home_team: String(item.teams?.home?.name || "Home"),
    away_team: String(item.teams?.away?.name || "Away"),
    raw_snapshot: item,
    fixture_status: "scheduled",
    fetched_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  const rows = await supabase("/rest/v1/premium_fixtures?on_conflict=provider,provider_event_id", {
    method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify(payload)
  });
  const id = rows?.[0]?.id;
  if (!id) throw new Error("Premium fixture upsert did not return an ID.");
  return id;
}
async function getForm(teamId) {
  const data = await oddsPapi.getTeamForm(teamId);
  return summarizeTeamForm(data, teamId);
}
function systemPrompt() {
  return [
    "You are AccaForge Premium's football market research analyst.",
    "Your job is to decide whether the evidence justifies one market from the supplied real bookmaker candidates, or to PASS.",
    "Never invent a market, selection, bookmaker, price, statistic, injury, lineup, or team news. Candidate IDs and odds are immutable source data.",
    "Do not select a market merely because it exists. Compare the available outcomes and choose only when the team-form evidence supports a genuine price edge.",
    "Use the two teams' recent completed-match form, goals scored/conceded, competition context and the actual bookmaker price. Explain uncertainty honestly.",
    "Never select goal totals above 3.5. Avoid speculative longshots and do not assume that a high price means value.",
    "If the evidence is weak, contradictory, incomplete or the price is not justified, return decision=pass.",
    "Return JSON only with: decision (pick|pass), candidate_id (or null), estimated_probability (percentage 1-99), confidence_score (0-100), reasoning (at least two clear sentences), evidence (at least two concrete evidence strings).",
    "Probability is an analytical estimate, not a guarantee. Do not claim certainty."
  ].join(" ");
}
async function nextGroqKey() {
  let selected = null;
  let selectedTime = Infinity;
  for (let offset = 0; offset < GROQ_KEYS.length; offset++) {
    const index = (groqCursor + offset) % GROQ_KEYS.length;
    const key = GROQ_KEYS[index];
    const last = groqLastUsed.get(key) || 0;
    if (last < selectedTime) { selected = key; selectedTime = last; groqCursor = (index + 1) % GROQ_KEYS.length; }
  }
  const wait = Math.max(0, 60000 - (Date.now() - selectedTime));
  if (wait) await sleep(wait);
  groqLastUsed.set(selected, Date.now());
  return selected;
}
async function analyzeFixture(context) {
  const prompt = [
    "Fixture: " + context.home_team + " vs " + context.away_team,
    "Competition: " + context.competition,
    "Kickoff: " + context.commence_time,
    "Home recent form: " + JSON.stringify(context.home_form),
    "Away recent form: " + JSON.stringify(context.away_form),
    "Available real bookmaker candidates (choose only a candidate_id): " + JSON.stringify(context.candidates),
    "Return one justified pick or PASS. The implied probability for each candidate is 100 / decimal odds."
  ].join("\n\n");
  let lastError = null;
  for (let attempt = 0; attempt < GROQ_KEYS.length; attempt++) {
    const key = await nextGroqKey();
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: GROQ_MODEL,
        temperature: 0.1,
        max_completion_tokens: 2000,
        reasoning_effort: "high",
        response_format: { type: "json_object" },
        messages: [{ role: "system", content: systemPrompt() }, { role: "user", content: prompt }]
      }),
      signal: AbortSignal.timeout(60000)
    });
    apiCalls.groq++;
    if (response.status === 429 || response.status >= 500) { lastError = new Error("Groq key temporarily rate-limited or unavailable."); continue; }
    if (!response.ok) { lastError = new Error("Groq analysis request rejected (" + response.status + ")."); continue; }
    const payload = await response.json();
    const content = payload.choices?.[0]?.message?.content;
    if (!content) { lastError = new Error("Groq returned an empty analysis."); continue; }
    try {
      const parsed = JSON.parse(content);
      return parsed;
    } catch {
      lastError = new Error("Groq returned invalid JSON.");
    }
  }
  throw lastError || new Error("All Premium Groq keys failed.");
}
async function updateRun(status, summary = {}, failureCode = null) {
  if (!runId) return;
  await supabase("/rest/v1/premium_workflow_runs?id=eq." + runId, {
    method: "PATCH", headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      status, failure_code: failureCode,
      fixtures_discovered: Number(summary.fixtures_discovered || 0),
      predictions_validated: Number(summary.predictions_validated || 0),
      predictions_published: Number(summary.predictions_published || 0),
      summary, finished_at: new Date().toISOString()
    })
  });
}
async function main() {
  const runRows = await supabase("/rest/v1/premium_workflow_runs", {
    method: "POST", headers: { Prefer: "return=representation" },
    body: JSON.stringify({ workflow_name: "premium-generate", publication_date: publicationDate, status: "running", summary: { provider: PROVIDER, model: GROQ_MODEL } })
  });
  runId = runRows?.[0]?.id;
  if (!runId) throw new Error("Could not create Premium workflow run record.");

  const tournamentRows = await oddsPapi.getTournaments();
  const tournaments = tournamentRows.filter(item => LEAGUE_SLUGS.has(String(item.tournamentSlug || "").toLowerCase()));
  if (!tournaments.length) throw new Error("OddsPapi returned no configured football tournaments. Check PREMIUM_TOURNAMENT_SLUGS and account coverage.");
  const dates = [publicationDate, addDays(publicationDate, 1)];
  const allFixtures = [];
  for (const date of dates) allFixtures.push(...await oddsPapi.getFixturesForDate(date, tournaments));
  const unique = [...new Map(allFixtures.filter(isEligibleFixture).map(item => [String(item.fixture?.id), item])).values()]
    .sort((a, b) => String(a.fixture.date).localeCompare(String(b.fixture.date)))
    .slice(0, MAX_FIXTURES);
  const marketCatalog = await oddsPapi.getMarketCatalog();

