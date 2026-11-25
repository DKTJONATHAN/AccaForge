import test from "node:test";
import assert from "node:assert/strict";
import { buildOddsCandidates, normalizeMarketName, summarizeTeamForm, validatePremiumPick } from "./premium-engine.mjs";
import { OddsPapiClient } from "./oddspapi.mjs";

test("normalizes only automatically settleable API-Football markets", () => {
  assert.equal(normalizeMarketName("Match Winner"), "h2h");
  assert.equal(normalizeMarketName("Both Teams Score"), "btts");
  assert.equal(normalizeMarketName("Goals Over/Under"), "totals");
  assert.equal(normalizeMarketName("Double Chance"), "double_chance");
  assert.equal(normalizeMarketName("Correct Score"), null);
});

test("builds actual odds candidates and rejects total lines above 3.5", () => {
  const payload = { response: [{ bookmakers: [{ name: "Book A", bets: [
    { name: "Match Winner", values: [{ value: "Home", odd: "1.80" }, { value: "Draw", odd: "3.50" }] },
    { name: "Goals Over/Under", values: [{ value: "Over 2.5", odd: "1.95" }, { value: "Over 4.5", odd: "6.0" }] },
    { name: "Correct Score", values: [{ value: "2:1", odd: "8.0" }] }
  ] }] }] };
  const candidates = buildOddsCandidates(payload, "Home FC", "Away FC");
  assert.equal(candidates.length, 3);
  assert.ok(candidates.some(item => item.selection_name === "Home FC"));
  assert.ok(candidates.some(item => item.selection_name === "Over 2.5"));
  assert.ok(!candidates.some(item => item.selection_name.includes("4.5")));
  assert.ok(!candidates.some(item => item.market_key === "correct_score"));
});

test("uses the strongest bookmaker price for the same market and outcome", () => {
  const payload = { response: [{ bookmakers: [
    { name: "A", bets: [{ name: "Match Winner", values: [{ value: "Home", odd: "1.70" }] }] },
    { name: "B", bets: [{ name: "Match Winner", values: [{ value: "Home", odd: "1.82" }] }] }
  ] }] };
  const candidates = buildOddsCandidates(payload, "Home FC", "Away FC");
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].odds, 1.82);
  assert.equal(candidates[0].bookmaker, "B");
});

test("summarizes the team's last five completed matches only", () => {
  const fixtures = { response: [
    ...[1,2,3,4,5].map((id) => ({ fixture: { id, status: { short: "FT" } }, teams: { home: { id: 10 }, away: { id: 20 } }, goals: { home: 2, away: 1 } })),
    { fixture: { id: 6, status: { short: "NS" } }, teams: { home: { id: 10 }, away: { id: 20 } }, goals: { home: null, away: null } }
  ] };
  const form = summarizeTeamForm(fixtures, 10);
  assert.equal(form.matches, 5);
  assert.equal(form.form, "W W W W W");
  assert.equal(form.goals_scored, 10);
});

test("withholds picks without a real candidate, enough edge, confidence or evidence", () => {
  const candidates = [{ candidate_id: "candidate-1", market_key: "h2h", market_name: "Match Winner", selection_name: "Home FC", odds: 1.8, bookmaker: "A" }];
  const base = { decision: "pick", candidate_id: "candidate-1", estimated_probability: 65, confidence_score: 80, reasoning: "This is a sufficiently detailed explanation based on the available team form and match context.", evidence: ["Home team won four of its last five completed matches.", "Away team conceded in four of its last five completed matches."] };
  assert.equal(validatePremiumPick(base, candidates).ok, true);
  assert.equal(validatePremiumPick({ ...base, candidate_id: "invented" }, candidates).reason, "unknown_candidate");
  assert.equal(validatePremiumPick({ ...base, estimated_probability: 50 }, candidates).reason, "insufficient_price_edge");
  assert.equal(validatePremiumPick({ ...base, confidence_score: 50 }, candidates).reason, "confidence_below_threshold");
  assert.equal(validatePremiumPick({ ...base, evidence: ["Only one evidence item is available here."] }, candidates).reason, "insufficient_evidence");
});

test("discovers odds-backed fixtures across a configurable forward window", async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl;
  globalThis.fetch = async input => {
    requestedUrl = new URL(String(input));
    return new Response(JSON.stringify([
      { fixtureId: "in-window", tournamentId: 17, statusId: 0, startTime: "2026-11-27T18:00:00.000Z", hasOdds: true, participant1Id: 1, participant2Id: 2, participant1Name: "Home", participant2Name: "Away", tournamentSlug: "premier-league", tournamentName: "Premier League" },
      { fixtureId: "outside-window", tournamentId: 17, statusId: 0, startTime: "2026-12-03T18:00:00.000Z", hasOdds: true, participant1Id: 3, participant2Id: 4, participant1Name: "Other", participant2Name: "Side", tournamentSlug: "premier-league", tournamentName: "Premier League" }
    ]), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  try {
    const client = new OddsPapiClient(["test-key"]);
    const rows = await client.getFixturesForWindow("2026-11-25", 7, [{ tournamentId: 17, tournamentSlug: "premier-league", tournamentName: "Premier League" }]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].fixture.id, "in-window");
    assert.equal(requestedUrl.pathname, "/v4/fixtures");
    assert.equal(requestedUrl.searchParams.get("tournamentId"), "17");
    assert.equal(requestedUrl.searchParams.get("statusId"), "0");
    assert.equal(requestedUrl.searchParams.get("hasOdds"), "true");
    assert.equal(requestedUrl.searchParams.get("from"), "2026-11-24T21:00:00.000Z");
    assert.equal(requestedUrl.searchParams.get("to"), "2026-12-01T21:00:00.000Z");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("parses bookmaker prices from the documented OddsPapi odds response", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    fixtureId: "fixture-1",
    bookmakerOdds: {
      pinnacle: {
        bookmakerIsActive: true,
        markets: {
          "101": {
            marketActive: true,
            outcomes: {
              "101": { players: { "0": { active: true, price: 1.82 } } },
              "102": { players: { "0": { active: true, price: 3.4 } } },
              "103": { players: { "0": { active: true, price: 4.2 } } }
            }
          }
        }
      }
    }
  }), { status: 200, headers: { "Content-Type": "application/json" } });
  try {
    const client = new OddsPapiClient(["test-key"]);
    const marketCatalog = new Map([["101", {
      marketName: "Full Time Result",
      playerProp: false,
      handicap: 0,
      outcomes: [
        { outcomeId: 101, outcomeName: "1" },
        { outcomeId: 102, outcomeName: "X" },
        { outcomeId: 103, outcomeName: "2" }
      ]
    }]]);
    const payload = await client.getOddsPayload("fixture-1", marketCatalog);
    const candidates = buildOddsCandidates(payload, "Home FC", "Away FC");
    assert.equal(candidates.length, 3);
    assert.equal(candidates.find(item => item.selection_name === "Home FC").odds, 1.82);
    assert.equal(candidates.find(item => item.selection_name === "Draw").odds, 3.4);
    assert.equal(candidates.find(item => item.selection_name === "Away FC").odds, 4.2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
