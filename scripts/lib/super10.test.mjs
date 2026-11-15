import test from "node:test";
import assert from "node:assert/strict";
import { findSuper10Combinations } from "./super10.mjs";

const row = (id, event, odds) => [id, event, "soccer_test", "Home vs Away", "Match result", "Home", odds];

test("finds valid combinations within the 9.50–10.50 band", () => {
  const combinations = findSuper10Combinations([
    row("a", "e1", 3.2),
    row("b", "e2", 3.1),
    row("c", "e3", 1.8)
  ]);
  assert.ok(combinations.length > 0);
  assert.ok(combinations.every((combo) => combo.combined_odds >= 9.5 && combo.combined_odds <= 10.5));
});

test("never uses two selections from the same fixture", () => {
  const combinations = findSuper10Combinations([
    row("a", "e1", 3.2),
    row("b", "e1", 3.1),
    row("c", "e2", 3.2),
    row("d", "e3", 1.1)
  ]);
  assert.ok(combinations.length > 0);
  assert.ok(combinations.every((combo) => new Set(combo.candidate_ids).size === combo.candidate_ids.length));
  assert.ok(combinations.every((combo) => !(combo.candidate_ids.includes("a") && combo.candidate_ids.includes("b"))));
  assert.ok(combinations.every((combo) => combo.candidate_ids.length >= 2));
});

test("returns no combinations when the supplied prices cannot reach the target", () => {
  assert.deepEqual(findSuper10Combinations([
    row("a", "e1", 1.2),
    row("b", "e2", 1.3),
    row("c", "e3", 1.4)
  ]), []);
});

test("respects the maximum number of fallback combinations", () => {
  const combinations = findSuper10Combinations([
    row("a", "e1", 3.2),
    row("b", "e2", 3.1),
    row("c", "e3", 3.0),
    row("d", "e4", 2.9),
    row("e", "e5", 2.8),
    row("f", "e6", 2.7)
  ], 9.5, 10.5, 2);
  assert.ok(combinations.length <= 2);
});
