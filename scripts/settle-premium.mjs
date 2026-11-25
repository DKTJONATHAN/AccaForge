import { settleSelection } from "../src/settlement.mjs";
import { OddsPapiClient } from "./lib/oddspapi.mjs";

const env = process.env;
const SUPABASE_URL = (env.SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_KEY = (env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
const FOOTBALL_KEYS = ["PREMIUM_FOOTBALL_KEY", "PREMIUM_FOOTBALL_KEY1", "PREMIUM_FOOTBALL_KEY2"].map(name => (env[name] || "").trim()).filter(Boolean);
const oddsPapi = new OddsPapiClient(FOOTBALL_KEYS);
const PROVIDER = "oddspapi";
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Nairobi", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
let runId = null;
let settled = 0;
let checked = 0;

if (!SUPABASE_URL || !SUPABASE_KEY || !FOOTBALL_KEYS.length) throw new Error("Missing Supabase credentials or PREMIUM_FOOTBALL_KEY[1..2].");

function headers() {
  const value = new Headers({ apikey: SUPABASE_KEY, "Content-Type": "application/json" });
  if (!SUPABASE_KEY.startsWith("sb_secret_")) value.set("Authorization", "Bearer " + SUPABASE_KEY);
  return value;
}
async function db(path, init = {}) {
  const response = await fetch(SUPABASE_URL + path, { ...init, headers: new Headers([...headers(), ...new Headers(init.headers)]), signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error("Supabase settlement request failed (" + response.status + ").");
  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}
async function main() {
  const runs = await db("/rest/v1/premium_workflow_runs", {
    method: "POST", headers: { Prefer: "return=representation" },
    body: JSON.stringify({ workflow_name: "premium-settle", publication_date: today, status: "running", summary: { provider: PROVIDER } })
  });
  runId = runs?.[0]?.id;
  if (!runId) throw new Error("Could not create Premium settlement run.");

  const fixtures = await db("/rest/v1/premium_fixtures?provider=eq." + PROVIDER +
    "&fixture_status=in.(scheduled,in_play,postponed)&commence_time=lte." + encodeURIComponent(new Date().toISOString()) +
    "&select=id,provider_event_id,sport_key,competition,home_team,away_team,raw_snapshot&order=commence_time.asc&limit=20");
  for (const stored of fixtures || []) {
    checked++;
    const current = await oddsPapi.getFixture(stored.provider_event_id);
    if (!current) continue;
    const statusName = String(current.statusName || "").toLowerCase();
    const statusId = Number(current.statusId);
    const fixtureStatus = statusId === 2 || statusName === "finished" || statusName === "ended" ? "finished" :
      statusId === 1 || statusName === "in-play" || statusName === "live" ? "in_play" :
      statusId === 3 || statusName === "cancelled" ? "cancelled" : "scheduled";
    await db("/rest/v1/premium_fixtures?id=eq." + stored.id, {
      method: "PATCH", headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ fixture_status: fixtureStatus, raw_snapshot: current, updated_at: new Date().toISOString() })
    });
    if (fixtureStatus === "cancelled") {
      const rows = await db("/rest/v1/premium_predictions?fixture_id=eq." + stored.id + "&status=eq.published&result=is.null&select=id");
      for (const row of rows || []) {
        await db("/rest/v1/premium_predictions?id=eq." + row.id, {
          method: "PATCH", headers: { Prefer: "return=minimal" },
          body: JSON.stringify({ status: "settled", result: "void", updated_at: new Date().toISOString() })
        });
        settled++;
      }
      continue;
    }
    if (fixtureStatus !== "finished") continue;
    const scorePayload = await oddsPapi.getScore(stored.provider_event_id);
    const periods = scorePayload?.scores?.periods || scorePayload?.scores || {};
    const finalScore = periods.result || periods.fulltime || periods["3"] || periods["2"];
    const homeScore = Number(finalScore?.participant1Score);
    const awayScore = Number(finalScore?.participant2Score);
    if (!finalScore || !Number.isInteger(homeScore) || !Number.isInteger(awayScore)) continue;
    const predictions = await db("/rest/v1/premium_predictions?fixture_id=eq." + stored.id + "&status=eq.published&result=is.null&select=id,market_key,market_name,selection_name,odds,bookmaker");
    for (const prediction of predictions || []) {
      const outcome = settleSelection({
        ...prediction,
        sport_key: stored.sport_key,
        home_team: stored.home_team,
        away_team: stored.away_team
      }, homeScore, awayScore);
      const result = String(outcome.outcome || "PENDING").toLowerCase();
      if (!["won","lost","void","pending","push"].includes(result) || result === "pending") continue;
      await db("/rest/v1/premium_predictions?id=eq." + prediction.id, {
        method: "PATCH", headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ status: "settled", result, updated_at: new Date().toISOString() })
      });
      settled++;
    }
  }
  await db("/rest/v1/premium_workflow_runs?id=eq." + runId, {
    method: "PATCH", headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ status: "succeeded", fixtures_discovered: checked, predictions_validated: settled, predictions_published: 0, summary: { provider: PROVIDER, fixtures_checked: checked, predictions_settled: settled }, finished_at: new Date().toISOString() })
  });
  console.log(JSON.stringify({ status: "succeeded", fixtures_checked: checked, predictions_settled: settled }));
}
main().catch(async error => {
  console.error("Premium settlement failed:", error instanceof Error ? error.message : "unknown error");
  if (runId) {
    try { await db("/rest/v1/premium_workflow_runs?id=eq." + runId, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ status: "failed", failure_code: "PREMIUM_SETTLEMENT_FAILED", summary: { fixtures_checked: checked, predictions_settled: settled }, finished_at: new Date().toISOString() }) }); } catch { /* keep original error */ }
  }
  process.exitCode = 1;
});
