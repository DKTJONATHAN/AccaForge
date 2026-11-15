import test from "node:test";
import assert from "node:assert/strict";
import { normalizeAllMatchesBatch } from "./all-matches.mjs";

const fixtures = [{ id: "e1" }, { id: "e2" }, { id: "e3" }];
const candidates = [["c1", "e1"], ["c2", "e2"]];

test("preserves valid PICK and explicit PASS entries in fixture order", () => {
  const result = normalizeAllMatchesBatch(fixtures, [
    { event_id: "e1", status: "PICK", candidate_id: "c1", probability: 63, note: "Evidence-backed pick" },
    { event_id: "e2", status: "PASS", note: "Insufficient evidence" }
  ], candidates);
  assert.deepEqual(result.map((row) => row.event_id), ["e1", "e2", "e3"]);
  assert.equal(result[0].status, "PICK");
  assert.equal(result[0].candidate_id, "c1");
  assert.equal(result[1].status, "PASS");
  assert.equal(result[2].status, "PASS");
});

test("fills omitted fixtures with PASS and ignores unknown or duplicate fixture rows", () => {
  const result = normalizeAllMatchesBatch(fixtures, [
    { event_id: "unknown", status: "PICK", candidate_id: "c1", probability: 70 },
    { event_id: "e1", status: "PICK", candidate_id: "c1", probability: 70 },
    { event_id: "e1", status: "PASS", note: "duplicate" }
  ], candidates);
  assert.equal(result.length, 3);
  assert.deepEqual(result.map((row) => row.status), ["PICK", "PASS", "PASS"]);
  assert.equal(new Set(result.map((row) => row.event_id)).size, 3);
});

test("converts invalid candidate IDs and invalid probabilities to PASS", () => {
  const result = normalizeAllMatchesBatch(fixtures, [
    { event_id: "e1", status: "PICK", candidate_id: "c2", probability: 70 },
    { event_id: "e2", status: "PICK", candidate_id: "c2", probability: 100 },
    { event_id: "e3", status: "PICK", candidate_id: "c3", probability: 55 }
  ], candidates);
  assert.deepEqual(result.map((row) => row.status), ["PASS", "PASS", "PASS"]);
});

test("malformed model output safely produces a complete PASS slate", () => {
  const result = normalizeAllMatchesBatch(fixtures, null, candidates);
  assert.equal(result.length, fixtures.length);
  assert.ok(result.every((row) => row.status === "PASS" && row.candidate_id === null));
});
