import test from "node:test";
import assert from "node:assert/strict";
import { buildOddsCandidates, normalizeMarketName, summarizeTeamForm, validatePremiumPick } from "./premium-engine.mjs";

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
