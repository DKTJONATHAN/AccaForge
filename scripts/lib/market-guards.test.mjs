import test from "node:test";
import assert from "node:assert/strict";
import { filterAllowedGoalTotals, isDisallowedGoalTotal } from "./market-guards.mjs";

test("allows Over/Under totals at 3.5 and below", () => {
  for (const selection_name of ["Over 0.5", "Over 1.5", "Over 2.5", "Over 3.5", "Under 3.5"]) {
    assert.equal(isDisallowedGoalTotal({ market_key: "totals", selection_name }), false, selection_name);
  }
});

test("blocks goal-total lines above 3.5, including alternate and team totals", () => {
  for (const [market_key, selection_name] of [
    ["totals", "Over 4.5"],
    ["totals", "Over 6.5"],
    ["alternate_totals", "Over 5.5"],
    ["team_totals", "Over (Arsenal) 4.5"],
    ["alternate_team_totals", "Under (Chelsea) 6.5"]
  ]) {
    assert.equal(isDisallowedGoalTotal({ market_key, selection_name }), true, market_key + " " + selection_name);
  }
});

test("does not block non-total markets", () => {
  assert.equal(isDisallowedGoalTotal({ market_key: "h2h", selection_name: "Over 6.5" }), false);
  assert.equal(isDisallowedGoalTotal({ market_key: "btts", selection_name: "Yes" }), false);
});

test("filters high total lines from the complete candidate pool", () => {
  const input = [
    { market_key: "totals", selection_name: "Over 2.5" },
    { market_key: "totals", selection_name: "Over 6.5" },
    { market_key: "h2h", selection_name: "Home" }
  ];
  assert.deepEqual(filterAllowedGoalTotals(input), [input[0], input[2]]);
});
