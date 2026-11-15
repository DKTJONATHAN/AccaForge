export function findSuper10Combinations(rows, minOdds = 9.5, maxOdds = 10.5, limit = 4) {
  const candidates = [];
  const seen = new Set();
  for (const row of rows) {
    const candidateId = row?.[0];
    const eventId = row?.[1];
    const odds = Number(row?.[6]);
    if (!candidateId || !eventId || seen.has(candidateId) || !Number.isFinite(odds) || odds <= 1) continue;
    seen.add(candidateId);
    candidates.push({ candidate_id: candidateId, event_id: eventId, odds });
  }
  candidates.sort((a, b) => b.odds - a.odds);

  const combinations = [];
  const visit = (start, product, chosen, usedEvents) => {
    if (chosen.length >= 2 && product >= minOdds && product <= maxOdds) {
      combinations.push({
        candidate_ids: chosen.map((item) => item.candidate_id),
        combined_odds: Number(product.toFixed(4))
      });
      return;
    }
    if (chosen.length >= 5 || product >= maxOdds || combinations.length >= limit) return;

    for (let index = start; index < candidates.length; index += 1) {
      const candidate = candidates[index];
      if (usedEvents.has(candidate.event_id)) continue;
      const nextProduct = product * candidate.odds;
      if (nextProduct > maxOdds) continue;
      const nextEvents = new Set(usedEvents);
      nextEvents.add(candidate.event_id);
      visit(index + 1, nextProduct, [...chosen, candidate], nextEvents);
      if (combinations.length >= limit) return;
    }
  };

  visit(0, 1, [], new Set());
  return combinations;
}
