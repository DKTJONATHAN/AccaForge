const VALID_STATUSES = new Set(["RETAINED", "REJECTED", "NEEDS_REVIEW"]);

export function shardFixtures(events, candidates, options = {}) {
  const maxFixtures = Math.max(1, Number(options.size) || 6);
  const maxCandidatesPerFixture = Math.max(1, Number(options.maxCandidatesPerFixture) || 8);
  const maxEstimatedTotalTokens = Math.max(1000, Number(options.maxEstimatedTotalTokens) || 5000);
  const reservedTokens = Math.max(0, Number(options.reservedTokens) || 1100);
  const promptOverheadTokens = Math.max(0, Number(options.promptOverheadTokens) || 1200);
  const maxPayloadTokens = Math.max(200, maxEstimatedTotalTokens - reservedTokens - promptOverheadTokens);
  const byEvent = new Map();
  for (const candidate of candidates || []) {
    if (!byEvent.has(candidate.event_id)) byEvent.set(candidate.event_id, []);
    byEvent.get(candidate.event_id).push(candidate);
  }
  const shards = [];
  let current = [];
  const flush = () => {
    if (!current.length) return;
    shards.push({ chunk_index: shards.length, fixtures: current });
    current = [];
  };
  for (const event of events) {
    const fixture = {
      event_id: event.id,
      sport_key: event.sport_key,
      commence_time: event.commence_time,
      home_team: event.home_team,
      away_team: event.away_team,
      candidates: (byEvent.get(event.id) || [])
        .slice()
        .sort((a, b) => a.odds - b.odds || a.candidate_id.localeCompare(b.candidate_id))
        .slice(0, maxCandidatesPerFixture)
        .map(({ candidate_id, market_name, selection_name, odds }) => ({
          candidate_id, market_name, selection_name, odds
        }))
    };
    const proposed = [...current, fixture];
    const estimatedPayloadTokens = Math.ceil(JSON.stringify(proposed).length / 2.5);
    if (current.length && (current.length >= maxFixtures || estimatedPayloadTokens > maxPayloadTokens)) flush();
    current.push(fixture);
    if (Math.ceil(JSON.stringify(current).length / 2.5) > maxPayloadTokens) {
      throw new Error("A single fixture exceeds the configured distillation token budget; reduce candidate detail before dispatch.");
    }
  }
  flush();
  return shards;
}

export function validateDistillationChunk(payload, shard) {
  if (!Array.isArray(payload?.fixtures)) throw new Error("Distillation response must contain a fixtures array.");
  const expected = new Map(shard.fixtures.map((fixture) => [fixture.event_id, fixture]));
  const seen = new Set();
  const normalized = [];
  for (const entry of payload.fixtures) {
    const fixture = expected.get(entry?.event_id);
    if (!fixture) throw new Error("Distillation returned an unknown fixture.");
    if (seen.has(entry.event_id)) throw new Error("Distillation returned a fixture more than once.");
    seen.add(entry.event_id);
    if (!VALID_STATUSES.has(entry.status)) throw new Error("Distillation returned an invalid fixture status.");
    if (!Array.isArray(entry.candidates)) throw new Error("Each distillation fixture must include a candidates array.");
    if (fixture.candidates.length === 0) {
      if (entry.candidates.length) throw new Error("Distillation invented a candidate for a fixture with no eligible prices.");
      normalized.push({ event_id: entry.event_id, status: "REJECTED", candidates: [], reason: "No eligible market prices were collected for this fixture." });
      continue;
    }
    const allowed = new Map(fixture.candidates.map((candidate) => [candidate.candidate_id, candidate]));
    const used = new Set();
    const retained = [];
    for (const item of entry.candidates.slice(0, 3)) {
      const candidate = allowed.get(item?.candidate_id);
      if (!candidate) throw new Error("Distillation selected a candidate outside its fixture shard.");
      if (used.has(item.candidate_id)) continue;
      used.add(item.candidate_id);
      const confidence = Number(item.confidence);
      if (!Number.isFinite(confidence) || confidence < 1 || confidence > 99) {
        throw new Error("Distillation confidence must be between 1 and 99.");
      }
      const rationale = String(item.rationale || "").replace(/[<>\u0000-\u001f]/g, "").replace(/\s+/g, " ").trim().slice(0, 240);
      if (!rationale) throw new Error("Every retained candidate needs an evidence rationale.");
      retained.push({ candidate_id: candidate.candidate_id, confidence, rationale });
    }
    if (entry.status === "RETAINED" && retained.length === 0) {
      throw new Error("A retained fixture must contain at least one validated candidate.");
    }
    normalized.push({
      event_id: entry.event_id,
      status: entry.status === "RETAINED" && retained.length === 0 ? "NEEDS_REVIEW" : entry.status,
      candidates: entry.status === "RETAINED" ? retained : [],
      reason: String(entry.reason || "").replace(/[<>\u0000-\u001f]/g, "").replace(/\s+/g, " ").trim().slice(0, 240)
    });
  }
  if (seen.size !== expected.size) throw new Error("Distillation omitted one or more fixtures in its shard.");
  return { fixtures: normalized };
}

export function mergeDistillationChunks(chunks, events, candidates) {
  const candidateLookup = new Map(candidates.map((candidate) => [candidate.candidate_id, candidate]));
  const fixtureLookup = new Map(events.map((event) => [event.id, event]));
  const fixtureResults = new Map();
  const selected = new Map();
  for (const chunk of chunks) {
    for (const result of chunk.fixtures) {
      if (!fixtureLookup.has(result.event_id)) throw new Error("Distillation contains a fixture outside the daily snapshot.");
      if (fixtureResults.has(result.event_id)) throw new Error("A fixture was distilled in more than one chunk.");
      fixtureResults.set(result.event_id, result);
      if (result.status !== "RETAINED") continue;
      for (const item of result.candidates) {
        const candidate = candidateLookup.get(item.candidate_id);
        if (!candidate || candidate.event_id !== result.event_id) throw new Error("Distillation candidate provenance does not match its fixture.");
        const previous = selected.get(item.candidate_id);
        if (!previous || item.confidence > previous.confidence) {
          selected.set(item.candidate_id, { ...candidate, distillation_confidence: item.confidence, distillation_rationale: item.rationale });
        }
      }
    }
  }
  if (fixtureResults.size !== events.length || events.some((event) => !fixtureResults.has(event.id))) {
    throw new Error("Global distillation did not account for every fixture exactly once.");
  }
  return {
    fixtures: events.map((event) => fixtureResults.get(event.id)),
    candidates: [...selected.values()].sort((a, b) =>
      b.distillation_confidence - a.distillation_confidence ||
      Date.parse(a.commence_time) - Date.parse(b.commence_time) ||
      a.candidate_id.localeCompare(b.candidate_id)
    )
  };
}
