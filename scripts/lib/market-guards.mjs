const GOAL_TOTAL_MARKET = /(?:^|_)(?:alternate_)?(?:team_)?totals(?:_|$)/i;

export function isDisallowedGoalTotal(candidate, maximumLine = 3.5) {
  if (!GOAL_TOTAL_MARKET.test(String(candidate?.market_key || ""))) return false;
  const selection = String(candidate?.selection_name || "");
  const match = selection.match(/(-?\d+(?:\.\d+)?)\s*$/);
  if (!match) return false;
  const line = Number(match[1]);
  return Number.isFinite(line) && line > maximumLine;
}

export function filterAllowedGoalTotals(candidates, maximumLine = 3.5) {
  return (candidates || []).filter((candidate) => !isDisallowedGoalTotal(candidate, maximumLine));
}
