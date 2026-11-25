import { buildOddsCandidates, summarizeTeamForm, validatePremiumPick } from "./lib/premium-engine.mjs";
import { OddsPapiClient } from "./lib/oddspapi.mjs";

export async function runPremiumResearch(env) {
const SUPABASE_URL = (env.SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_KEY = (env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
const FOOTBALL_KEYS = ["PREMIUM_FOOTBALL_KEY", "PREMIUM_FOOTBALL_KEY1", "PREMIUM_FOOTBALL_KEY2"].map(name => (env[name] || "").trim()).filter(Boolean);
const GROQ_KEYS = [...new Set([
  ...(env.GEMINI_API_KEYS || "").split(/[;,\s]+/),
  ...["GROQ_API_KEY", "GROQ_API_KEY1", "GROQ_API_KEY2", "GROQ_API_KEY3", "GROQ_API_KEY4",
      "GEMINI_API_KEY", "GEMINI_API_KEY1", "GEMINI_API_KEY2", "GEMINI_API_KEY3", "GEMINI_API_KEY4"].map(name => env[name] || "")
].map(value => String(value).trim()).filter(Boolean))];
const oddsPapi = new OddsPapiClient(FOOTBALL_KEYS);
const GROQ_MODEL = (env.PREMIUM_GROQ_MODEL || "openai/gpt-oss-120b").trim();
const MAX_FIXTURES = Math.min(12, Math.max(1, Number(env.PREMIUM_MAX_FIXTURES || 5)));
const FIXTURE_WINDOW_DAYS = Math.min(9, Math.max(1, Number(env.PREMIUM_FIXTURE_WINDOW_DAYS || 7)));
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
    const choice = payload.choices?.[0] || {};
    const content = choice.message?.content || "";
    const usage = payload.usage || {};
    console.log("Premium Groq response: finish_reason="+String(choice.finish_reason||"unknown")+", completion_tokens="+String(usage.completion_tokens??"unknown")+", reasoning_tokens="+String(usage.completion_tokens_details?.reasoning_tokens??"unknown")+", content_chars="+content.length+".");
    if (!content) { lastError = new Error("Groq returned empty content (finish_reason="+String(choice.finish_reason||"unknown")+", completion_tokens="+String(usage.completion_tokens??"unknown")+")."); continue; }
    try {
      const parsed = JSON.parse(content);
      return parsed;
    } catch {
      lastError = new Error("Groq returned invalid JSON (finish_reason="+String(choice.finish_reason||"unknown")+", completion_tokens="+String(usage.completion_tokens??"unknown")+", content_preview="+content.slice(0,240)+").");
    }
  }
  throw lastError || new Error("All Premium Groq keys failed.");
}
async function updateRun(status, summary = {}, failureCode = null) {
  apiCalls.football = oddsPapi.requestCount;
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
  const activeRuns = await supabase("/rest/v1/premium_workflow_runs?workflow_name=eq.premium-generate&status=eq.running&select=id,started_at&order=started_at.asc&limit=20");
  const nowMs = Date.now();
  for (const active of activeRuns || []) {
    const ageMs = nowMs - Date.parse(active.started_at || "");
    if (Number.isFinite(ageMs) && ageMs > 20 * 60 * 1000) {
      await supabase("/rest/v1/premium_workflow_runs?id=eq."+encodeURIComponent(active.id), {
        method: "PATCH", headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ status: "failed", failure_code: "PREMIUM_RUN_STALE", summary: { reason: "Run exceeded the 20-minute execution lease and was marked stale before retry." }, finished_at: new Date().toISOString() })
      });
      console.warn("Marked stale Premium run "+active.id+" as failed after "+Math.round(ageMs/60000)+" minutes.");
    } else {
      console.log("Skipping overlapping Premium generation; active run "+active.id+" is still within its execution lease.");
      return { status: "skipped", reason: "active_run" };
    }
  }
  const runRows = await supabase("/rest/v1/premium_workflow_runs", {
    method: "POST", headers: { Prefer: "return=representation" },
    body: JSON.stringify({ workflow_name: "premium-generate", publication_date: publicationDate, status: "running", summary: { provider: PROVIDER, model: GROQ_MODEL } })
  });
  runId = runRows?.[0]?.id;
  if (!runId) throw new Error("Could not create Premium workflow run record.");

  const tournamentRows = await oddsPapi.getTournaments();
  const returnedSlugs = tournamentRows.map(item => String(item.tournamentSlug || "").toLowerCase()).filter(Boolean);
  const tournaments = tournamentRows.filter(item => LEAGUE_SLUGS.has(String(item.tournamentSlug || "").toLowerCase())).slice(0, 10);
  console.log("Premium tournament discovery: returned="+tournamentRows.length+", configured_matches="+tournaments.length+", configured="+[...LEAGUE_SLUGS].join(",")+", returned_slugs="+returnedSlugs.slice(0,30).join(",")+".");
  if (!tournaments.length) throw new Error("OddsPapi returned "+tournamentRows.length+" tournaments but none matched PREMIUM_TOURNAMENT_SLUGS. Configured: "+[...LEAGUE_SLUGS].join(",")+"; returned: "+returnedSlugs.slice(0,30).join(",")+".");
  const allFixtures = await oddsPapi.getFixturesForWindow(publicationDate, FIXTURE_WINDOW_DAYS, tournaments);
  const eligibleFixtures = [...new Map(allFixtures.filter(isEligibleFixture).map(item => [String(item.fixture?.id), item])).values()]
    .sort((a, b) => String(a.fixture.date).localeCompare(String(b.fixture.date)));
  const unique = eligibleFixtures.slice(0, MAX_FIXTURES);
  console.log("Premium fixture shortlist: returned=" + allFixtures.length + ", eligible=" + eligibleFixtures.length + ", selected=" + unique.length + ", window_days=" + FIXTURE_WINDOW_DAYS + ".");
  const marketCatalog = await oddsPapi.getMarketCatalog();

  const validated = [];
  const diagnostics = {
    fixtures_returned: allFixtures.length,
    fixtures_eligible: eligibleFixtures.length,
    fixtures_selected: unique.length,
    odds_fetch_failed: 0,
    insufficient_candidates: 0,
    insufficient_form: 0,
    groq_failed: 0,
    ai_passed: 0,
    validation_rejections: {}
  };
  let discovered = 0;
  for (const item of unique) {
    discovered++;
    const fixtureId = await storeFixture(item);
    const home = item.teams.home;
    const away = item.teams.away;
    let oddsPayload, homeForm, awayForm;
    try {
      [oddsPayload, homeForm, awayForm] = await Promise.all([
        oddsPapi.getOddsPayload(item.fixture.id, marketCatalog),
        getForm(home.id),
        getForm(away.id)
      ]);
    } catch (error) {
      diagnostics.odds_fetch_failed++;
      console.warn("Premium provider data unavailable for " + home.name + " vs " + away.name + ": " + String(error?.message || error).slice(0, 220));
      continue;
    }
    const candidates = buildOddsCandidates(oddsPayload, home.name, away.name);
    if (candidates.length < 3) {
      diagnostics.insufficient_candidates++;
      console.log("Premium skipped " + home.name + " vs " + away.name + ": only " + candidates.length + " supported odds candidates were returned.");
      continue;
    }
    if (homeForm.matches < 3 || awayForm.matches < 3) {
      diagnostics.insufficient_form++;
      console.log("Premium skipped " + home.name + " vs " + away.name + ": recent form sample below three completed matches.");
      continue;
    }

    const context = {
      home_team: home.name, away_team: away.name, competition: item.league.name,
      commence_time: item.fixture.date, home_form: homeForm, away_form: awayForm, candidates
    };
    let ai;
    try {
      ai = await analyzeFixture(context);
    } catch (error) {
      diagnostics.groq_failed++;
      console.warn("Premium AI analysis unavailable for " + home.name + " vs " + away.name + ": " + String(error?.message || error).slice(0, 220));
      continue;
    }
    const decision = validatePremiumPick(ai, candidates);
    if (!decision.ok) {
      diagnostics.ai_passed++;
      diagnostics.validation_rejections[decision.reason] = (diagnostics.validation_rejections[decision.reason] || 0) + 1;
      continue;
    }

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
    await updateRun("withheld", { provider: PROVIDER, fixtures_discovered: discovered, predictions_validated: 0, predictions_published: 0, api_calls: apiCalls, reason: "No fixture passed evidence, odds and confidence validation. No Premium picks were published.", diagnostics });
    console.log(JSON.stringify({ status: "withheld", provider: PROVIDER, fixtures: discovered, picks: 0, diagnostics, api_calls: apiCalls }));
    return;
  }

  const published = await supabase("/rest/v1/premium_predictions?id=in.(" + validated.join(",") + ")&status=eq.validated", {
    method: "PATCH", headers: { Prefer: "return=representation" },
    body: JSON.stringify({ status: "published", published_at: new Date().toISOString(), updated_at: new Date().toISOString() })
  });
  await updateRun("succeeded", { provider: PROVIDER, fixtures_discovered: discovered, predictions_validated: validated.length, predictions_published: published?.length || validated.length, api_calls: apiCalls });
  console.log(JSON.stringify({ status: "succeeded", provider: PROVIDER, football_keys_available: FOOTBALL_KEYS.length, groq_keys_available: GROQ_KEYS.length, fixtures: discovered, picks: validated.length, diagnostics, api_calls: apiCalls }));
}
return main().catch(async error => {
  console.error("Premium generation failed:", error instanceof Error ? error.message : "unknown error");
  try { await updateRun("failed", { api_calls: apiCalls, error: String(error?.message || "unknown error").slice(0, 300) }, "PREMIUM_GENERATION_FAILED"); } catch { /* preserve the original failure */ }
  throw error;
  });
}

if (typeof process !== "undefined" && process.argv?.[1]?.endsWith("/generate-premium.mjs")) {
  runPremiumResearch(process.env).catch(error => { console.error("Premium generation failed:", error instanceof Error ? error.message : "unknown error"); process.exitCode = 1; });
}
