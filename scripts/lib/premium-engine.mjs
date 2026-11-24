const TOTAL_LINE = /\b(\d+(?:\.\d+)?)\b/;
export function normalizeMarketName(value) {
  const name = String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (/both teams? (to )?score|btts/.test(name)) return "btts";
  if (/double chance/.test(name)) return "double_chance";
  if (/over under|goals total|total goals|goals over/.test(name)) return "totals";
  if (/match winner|full.?time result|1x2|match result/.test(name)) return "h2h";
  return null;
}
function normalizedSelection(market, raw, home, away) {
  const value = String(raw || "").trim();
  const lower = value.toLowerCase();
  if (market === "h2h") {
    if (/^(home|1)$/.test(lower)) return home;
    if (/^(away|2)$/.test(lower)) return away;
    if (/^(draw|tie|x)$/.test(lower)) return "Draw";
    if (lower === home.toLowerCase() || lower === away.toLowerCase()) return value;
  }
  if (market === "btts") {
    if (/^(yes|y)$/.test(lower)) return "Yes";
    if (/^(no|n)$/.test(lower)) return "No";
  }
  if (market === "double_chance") {
    if (/home\s*\/\s*draw|1x/i.test(value)) return "1X";
    if (/draw\s*\/\s*away|x2/i.test(value)) return "X2";
    if (/home\s*\/\s*away|12/i.test(value)) return "12";
  }
  if (market === "totals") {
    const match = value.match(/\b(over|under)\s*(\d+(?:\.\d+)?)/i);
    if (!match) return null;
    const line = Number(match[2]);
    if (!Number.isFinite(line) || line > 3.5 || Math.abs(line * 2 - Math.round(line * 2)) > 1e-8) return null;
    return (match[1].toLowerCase() === "over" ? "Over " : "Under ") + line.toFixed(1).replace(/\.0$/, ".0");
  }
  return null;
}
export function buildOddsCandidates(oddsPayload, home, away, options = {}) {
  const minOdds = Number(options.minOdds ?? 1.2);
  const maxOdds = Number(options.maxOdds ?? 4.5);
  const best = new Map();
  for (const bookmaker of oddsPayload?.response?.[0]?.bookmakers || []) {
    for (const bet of bookmaker.bets || []) {
      const market = normalizeMarketName(bet.name);
      if (!market) continue;
      for (const outcome of bet.values || []) {
        const odds = Number(outcome.odd);
        if (!Number.isFinite(odds) || odds < minOdds || odds > maxOdds) continue;
        const selection = normalizedSelection(market, outcome.value, home, away);
        if (!selection) continue;
        const key = market + "|" + selection;
        const current = best.get(key);
        if (!current || odds > current.odds) {
          best.set(key, {
            candidate_id: "candidate-" + (best.size + 1),
            market_key: market,
            market_name: String(bet.name || market),
            selection_name: selection,
            odds,
            bookmaker: String(bookmaker.name || "Unknown bookmaker")
          });
        }
      }
    }
  }
  return [...best.values()].map((item, index) => ({ ...item, candidate_id: "candidate-" + (index + 1) }));
}
export function summarizeTeamForm(fixtures, teamId) {
  const rows = (fixtures?.response || []).filter(item => {
    const status = item.fixture?.status?.short;
    return status === "FT" && Number.isInteger(item.goals?.home) && Number.isInteger(item.goals?.away);
  }).slice(0, 5);
  const outcomes = [];
  let scored = 0, conceded = 0, points = 0;
  for (const item of rows) {
    const isHome = Number(item.teams?.home?.id) === Number(teamId);
    const own = Number(isHome ? item.goals.home : item.goals.away);
    const opp = Number(isHome ? item.goals.away : item.goals.home);
    scored += own; conceded += opp;
    const result = own > opp ? "W" : own === opp ? "D" : "L";
    outcomes.push(result); points += result === "W" ? 3 : result === "D" ? 1 : 0;
  }
  return {
    matches: rows.length,
    form: outcomes.join(" ") || "No recent completed matches",
    goals_scored: scored,
    goals_conceded: conceded,
    points: rows.length ? points : null,
    source_fixture_ids: rows.map(item => item.fixture?.id).filter(Boolean)
  };
}
export function validatePremiumPick(pick, candidates, options = {}) {
  if (!pick || String(pick.decision || "").toLowerCase() !== "pick") return { ok: false, reason: "model_passed" };
  const candidate = candidates.find(item => item.candidate_id === pick.candidate_id);
  if (!candidate) return { ok: false, reason: "unknown_candidate" };
  const odds = Number(candidate.odds);
  const probability = Number(pick.estimated_probability);
  const confidence = Number(pick.confidence_score);
  const minConfidence = Number(options.minConfidence ?? 70);
  const minEdge = Number(options.minEdgePercentagePoints ?? 3);
  if (!Number.isFinite(probability) || probability < 1 || probability > 99) return { ok: false, reason: "invalid_probability" };
  if (!Number.isFinite(confidence) || confidence < minConfidence || confidence > 100) return { ok: false, reason: "confidence_below_threshold" };
  const implied = 100 / odds;
  if (probability < implied + minEdge) return { ok: false, reason: "insufficient_price_edge" };
  const reasoning = String(pick.reasoning || "").trim();
  if (reasoning.length < 60) return { ok: false, reason: "insufficient_reasoning" };
  const evidence = Array.isArray(pick.evidence) ? pick.evidence.map(value => String(value || "").trim()).filter(value => value.length >= 12) : [];
  if (evidence.length < 2) return { ok: false, reason: "insufficient_evidence" };
  if (candidate.market_key === "totals") {
    const line = Number(String(candidate.selection_name).match(TOTAL_LINE)?.[1]);
    if (!Number.isFinite(line) || line > 3.5 || Math.abs(line * 2 - Math.round(line * 2)) > 1e-8) return { ok: false, reason: "unsafe_goal_total" };
  }
  return {
    ok: true,
    candidate,
    estimated_probability: probability,
    implied_probability: Number(implied.toFixed(2)),
    edge_percentage_points: Number((probability - implied).toFixed(2)),
    confidence_score: confidence,
    reasoning,
    evidence
  };
}
