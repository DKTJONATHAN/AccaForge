import { buildOddsCandidates, summarizeTeamForm, validatePremiumPick } from "./lib/premium-engine.mjs";

const env = process.env;
const SUPABASE_URL = (env.SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_KEY = (env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
const FOOTBALL_KEY = (env.PREMIUM_FOOTBALL_API_KEY || "").trim();
const GROQ_KEYS = Array.from({ length: 5 }, (_, i) => (env["PREMIUM_API_KEY" + (i + 1)] || "").trim()).filter(Boolean);
const GROQ_MODEL = (env.PREMIUM_GROQ_MODEL || "openai/gpt-oss-120b").trim();
const MAX_FIXTURES = Math.min(12, Math.max(1, Number(env.PREMIUM_MAX_FIXTURES || 10)));
const LEAGUE_IDS = new Set((env.PREMIUM_LEAGUE_IDS || "39,140,78,135,61,88,94,276").split(",").map(Number).filter(Number.isFinite));
const PROVIDER = "api-football";
const API_BASE = "https://v3.football.api-sports.io";
const now = new Date();
const publicationDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Nairobi", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
const apiCalls = { football: 0, groq: 0 };
const groqLastUsed = new Map(GROQ_KEYS.map(key => [key, 0]));
let groqCursor = 0;
let runId = null;

if (!SUPABASE_URL || !SUPABASE_KEY || !FOOTBALL_KEY || !GROQ_KEYS.length) {
  throw new Error("Missing required Premium pipeline configuration: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, PREMIUM_FOOTBALL_API_KEY and PREMIUM_API_KEY1..5.");
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
async function football(path, params = {}) {
  const url = new URL(API_BASE + path);
  for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
  const response = await fetch(url, { headers: { "x-apisports-key": FOOTBALL_KEY }, signal: AbortSignal.timeout(25000) });
  apiCalls.football++;
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload || (payload.errors && Object.keys(payload.errors).length)) {
    throw new Error("Premium football data request failed (" + response.status + ").");
  }
  return payload;
}
function addDays(date, days) {
  const value = new Date(date + "T12:00:00+03:00");
  value.setDate(value.getDate() + days);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Nairobi", year: "numeric", month: "2-digit", day: "2-digit" }).format(value);
}
function isEligibleFixture(item) {
  const league = item.league || {};
  const status = item.fixture?.status?.short;
  const leagueType = String(league.type || "").toLowerCase();
  const name = String(league.name || "").toLowerCase();
  return status === "NS" && LEAGUE_IDS.has(Number(league.id)) &&
    (!leagueType || leagueType === "league") &&
    !/(cup|copa|coupe|pokal|beker|knockout|champions league|europa league)/i.test(name);
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
  const data = await football("/fixtures", { team: teamId, last: 5, status: "FT", timezone: "Africa/Nairobi" });
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

  const dates = [publicationDate, addDays(publicationDate, 1)];
  const allFixtures = [];
  for (const date of dates) {
    const payload = await football("/fixtures", { date, timezone: "Africa/Nairobi" });
    allFixtures.push(...(payload.response || []).filter(isEligibleFixture));
  }
  const unique = [...new Map(allFixtures.map(item => [String(item.fixture?.id), item])).values()]
    .sort((a, b) => String(a.fixture.date).localeCompare(String(b.fixture.date)))
    .slice(0, MAX_FIXTURES);

  const validated = [];
  let discovered = 0;
  for (const item of unique) {
    discovered++;
    const fixtureId = await storeFixture(item);
    const home = item.teams.home;
    const away = item.teams.away;
    const [oddsPayload, homeForm, awayForm] = await Promise.all([
      football("/odds", { fixture: item.fixture.id }),
      getForm(home.id),
      getForm(away.id)
    ]);
    const candidates = buildOddsCandidates(oddsPayload, home.name, away.name);
    if (candidates.length < 3 || homeForm.matches < 3 || awayForm.matches < 3) continue;

    const context = {
      home_team: home.name, away_team: away.name, competition: item.league.name,
      commence_time: item.fixture.date, home_form: homeForm, away_form: awayForm, candidates
    };
    const ai = await analyzeFixture(context);
    const decision = validatePremiumPick(ai, candidates);
    if (!decision.ok) continue;

    const evidence = {
      provider: PROVIDER,
      provider_fixture_id: item.fixture.id,
      fetched_at: new Date().toISOString(),
      home_form: homeForm,
      away_form: awayForm,
      selected_candidate_id: decision.candidate.candidate_id,
      implied_probability: decision.implied_probability,
      edge_percentage_points: decision.edge_percentage_points,
      ai_evidence: decision.evidence
    };
    const row = {
      fixture_id: fixtureId,
      publication_date: publicationDate,
      market_key: decision.candidate.market_key,
      market_name: decision.candidate.market_name,
      selection_name: decision.candidate.selection_name,
      odds: decision.candidate.odds,
      bookmaker: decision.candidate.bookmaker,
      estimated_probability: decision.estimated_probability,
      confidence_score: decision.confidence_score,
      reasoning: decision.reasoning,
      evidence,
      status: "validated",
      updated_at: new Date().toISOString()
    };
    const saved = await supabase("/rest/v1/premium_predictions?on_conflict=fixture_id,publication_date,market_key,selection_name", {
      method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify(row)
    });
    if (saved?.[0]?.id) validated.push(saved[0].id);
  }

  if (!validated.length) {
    await updateRun("withheld", { provider: PROVIDER, fixtures_discovered: discovered, predictions_validated: 0, predictions_published: 0, api_calls: apiCalls, reason: "No fixture passed evidence, odds and confidence validation. No Premium picks were published." });
    console.log(JSON.stringify({ status: "withheld", fixtures: discovered, picks: 0, api_calls: apiCalls }));
    return;
  }

  const published = await supabase("/rest/v1/premium_predictions?publication_date=eq." + publicationDate + "&status=eq.validated", {
    method: "PATCH", headers: { Prefer: "return=representation" },
    body: JSON.stringify({ status: "published", published_at: new Date().toISOString(), updated_at: new Date().toISOString() })
  });
  await updateRun("succeeded", { provider: PROVIDER, fixtures_discovered: discovered, predictions_validated: validated.length, predictions_published: published?.length || validated.length, api_calls: apiCalls });
  console.log(JSON.stringify({ status: "succeeded", fixtures: discovered, picks: validated.length, api_calls: apiCalls }));
}
main().catch(async error => {
  console.error("Premium generation failed:", error instanceof Error ? error.message : "unknown error");
  try { await updateRun("failed", { api_calls: apiCalls }, "PREMIUM_GENERATION_FAILED"); } catch { /* preserve the original failure */ }
  process.exitCode = 1;
});
