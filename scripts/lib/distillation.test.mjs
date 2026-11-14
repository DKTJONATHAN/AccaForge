import test from "node:test";
import assert from "node:assert/strict";
import { shardFixtures, validateDistillationChunk, mergeDistillationChunks } from "./distillation.mjs";

const events = Array.from({ length: 8 }, (_, i) => ({
  id: "event-" + i, sport_key: "soccer_test", commence_time: "2026-11-14T10:00:00Z",
  home_team: "Home " + i, away_team: "Away " + i
}));
const candidates = events.flatMap((event, i) => [0, 1].map((n) => ({
  event_id: event.id, candidate_id: event.id + "-candidate-" + n, odds: 1.2 + n,
  market_name: "Market", selection_name: "Selection " + n, bookmaker: "Book"
})));

function accepted(shard) {
  return validateDistillationChunk({
    fixtures: shard.fixtures.map((fixture) => ({
      event_id: fixture.event_id,
      status: fixture.candidates.length ? "RETAINED" : "REJECTED",
      candidates: fixture.candidates.length ? [{
        candidate_id: fixture.candidates[0].candidate_id, confidence: 80, rationale: "Supported by the available evidence"
      }] : [],
      reason: ""
    }))
  }, shard);
}

test("sharding covers every fixture once and retains fixtures with no prices", () => {
  const shards = shardFixtures(events, candidates.filter((item) => item.event_id !== "event-3"), { size: 3 });
  assert.equal(shards.length, 3);
  assert.deepEqual(shards.flatMap((shard) => shard.fixtures.map((fixture) => fixture.event_id)), events.map((event) => event.id));
  assert.equal(shards.flatMap((shard) => shard.fixtures).find((fixture) => fixture.event_id === "event-3").candidates.length, 0);
});

test("distillation accepts only candidate IDs belonging to the same fixture", () => {
  const shard = shardFixtures(events.slice(0, 2), candidates, { size: 2 })[0];
  const payload = accepted(shard);
  assert.equal(payload.fixtures.length, 2);
  const invalid = { fixtures: [{ event_id: "event-0", status: "RETAINED", candidates: [{ candidate_id: "event-1-candidate-0", confidence: 80 }] }, { event_id: "event-1", status: "REJECTED", candidates: [] }] };
  assert.throws(() => validateDistillationChunk(invalid, shard), /outside its fixture shard/);
});

test("distillation rejects missing, duplicate and unknown fixture rows", () => {
  const shard = shardFixtures(events.slice(0, 2), candidates, { size: 2 })[0];
  assert.throws(() => validateDistillationChunk({ fixtures: [] }, shard), /omitted/);
  const duplicate = accepted(shard).fixtures;
  assert.throws(() => validateDistillationChunk({ fixtures: [duplicate[0], duplicate[0]] }, shard), /more than once/);
  assert.throws(() => validateDistillationChunk({ fixtures: [{ event_id: "outside", status: "REJECTED", candidates: [] }] }, shard), /unknown fixture/);
});

test("global merge deduplicates candidates and preserves complete fixture coverage", () => {
  const shards = shardFixtures(events, candidates, { size: 3 });
  const results = shards.map(accepted);
  const merged = mergeDistillationChunks(results, events, candidates);
  assert.equal(merged.fixtures.length, events.length);
  assert.equal(merged.candidates.length, events.length);
  assert.ok(merged.candidates.every((candidate) => candidate.distillation_confidence === 80));
  assert.throws(() => mergeDistillationChunks(results.slice(0, 1), events, candidates), /every fixture/);
});

test("token-aware sharding splits oversized fixture groups without losing coverage", () => {
  const largeCandidates = events.flatMap((event) => [0, 1, 2].map((n) => ({
    event_id: event.id, candidate_id: event.id + "-large-" + n, odds: 1.2 + n,
    market_name: "M".repeat(180), selection_name: "S".repeat(180), bookmaker: "B".repeat(40)
  })));
  const shards = shardFixtures(events, largeCandidates, {
    size: 6, maxCandidatesPerFixture: 3, maxEstimatedTotalTokens: 1500,
    reservedTokens: 300, promptOverheadTokens: 300
  });
  assert.ok(shards.length > 2);
  assert.deepEqual(shards.flatMap((shard) => shard.fixtures.map((fixture) => fixture.event_id)), events.map((event) => event.id));
});

test("retained candidates must include a non-empty evidence rationale", () => {
  const shard = shardFixtures(events.slice(0, 1), candidates, { size: 1 })[0];
  assert.throws(() => validateDistillationChunk({
    fixtures: [{
      event_id: "event-0", status: "RETAINED",
      candidates: [{ candidate_id: "event-0-candidate-0", confidence: 75, rationale: " " }]
    }]
  }, shard), /evidence rationale/);
});

test("fixtures without any priced candidates are deterministically rejected", () => {
  const shard = shardFixtures(events.slice(0, 1), [], { size: 1 })[0];
  const normalized = validateDistillationChunk({
    fixtures: [{ event_id: "event-0", status: "RETAINED", candidates: [], reason: "" }]
  }, shard);
  assert.equal(normalized.fixtures[0].status, "REJECTED");
  assert.deepEqual(normalized.fixtures[0].candidates, []);
});
