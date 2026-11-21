const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function enrichMarketProbabilities(candidates) {
  const groups = new Map();
  const rawProbabilities = new Map();
  for (const candidate of candidates) {
    const odds = Number(candidate.odds);
    if (!Number.isFinite(odds) || odds <= 1) continue;
    const offers = Array.isArray(candidate.bookmaker_prices) ? candidate.bookmaker_prices : [];
    const values = offers.map((offer) => Number(offer.price)).filter((price) => Number.isFinite(price) && price > 1).map((price) => 1 / price);
    const raw = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 1 / odds;
    const group = candidate.market_group || [candidate.event_id, candidate.market_key].join("|");
    groups.set(group, (groups.get(group) || 0) + raw);
    rawProbabilities.set(candidate.candidate_id, raw);
  }
  return candidates.map((candidate) => {
    const odds = Number(candidate.odds);
    const raw = rawProbabilities.get(candidate.candidate_id) ?? (1 / odds);
    const group = candidate.market_group || [candidate.event_id, candidate.market_key].join("|");
    const marketProbability = clamp((raw / (groups.get(group) || raw)) * 100, 1, 99);
    const impliedProbability = 100 / odds;
    const bookmakerCount = Array.isArray(candidate.bookmaker_prices) ? candidate.bookmaker_prices.length : Number(candidate.bookmaker_count || 1);
    const { bookmaker_prices, market_group, ...publicCandidate } = candidate;
    return { ...publicCandidate, market_probability: Number(marketProbability.toFixed(2)), implied_probability: Number(impliedProbability.toFixed(2)), value_edge: Number((marketProbability - impliedProbability).toFixed(2)), bookmaker_count: bookmakerCount };
  });
}

export function candidateScore(candidate) {
  const odds = Number(candidate?.odds);
  if (!Number.isFinite(odds) || odds <= 1) return Number.NEGATIVE_INFINITY;
  const probability = Number(candidate.market_probability) || 100 / odds;
  const edge = Number.isFinite(Number(candidate.value_edge)) ? Number(candidate.value_edge) : probability - 100 / odds;
  const coverage = Math.min(5, Math.max(1, Number(candidate.bookmaker_count) || 1)) * 0.12;
  return probability + edge * 1.25 + coverage;
}

export function rankCandidates(candidates, options = {}) {
  const minOdds = Number(options.minOdds ?? 1.2);
  const maxOdds = Number(options.maxOdds ?? Number.POSITIVE_INFINITY);
  const limit = Number(options.limit ?? 48);
  const perFixture = Math.max(1, Number(options.perFixture ?? 2));
  const grouped = new Map();
  for (const candidate of candidates || []) {
    const odds = Number(candidate?.odds);
    if (!candidate?.event_id || !Number.isFinite(odds) || odds < minOdds || odds > maxOdds) continue;
    if (!grouped.has(candidate.event_id)) grouped.set(candidate.event_id, []);
    grouped.get(candidate.event_id).push(candidate);
  }
  const ranked = [];
  for (const items of grouped.values()) {
    items.sort((a, b) => candidateScore(b) - candidateScore(a) || String(a.candidate_id).localeCompare(String(b.candidate_id)));
    ranked.push(...items.slice(0, perFixture));
  }
  ranked.sort((a, b) => candidateScore(b) - candidateScore(a) || Number(b.market_probability || 0) - Number(a.market_probability || 0) || Date.parse(a.commence_time || 0) - Date.parse(b.commence_time || 0) || String(a.candidate_id).localeCompare(String(b.candidate_id)));
  return ranked.slice(0, Number.isFinite(limit) ? limit : undefined);
}

export function selectBestLegs(candidates, count, minOdds = 1.5, maxOdds = 2.0) {
  const ranked = rankCandidates(candidates, { minOdds, maxOdds, limit: Number.POSITIVE_INFINITY, perFixture: 1 });
  if (ranked.length < count) throw new Error("Only " + ranked.length + " distinct fixtures have defensible prices between " + minOdds.toFixed(2) + " and " + maxOdds.toFixed(2) + "; " + count + " are required.");
  return ranked.slice(0, count);
}
