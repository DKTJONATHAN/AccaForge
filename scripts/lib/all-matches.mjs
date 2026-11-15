export function normalizeAllMatchesBatch(fixtures, entries, candidateRows) {
  const expected = new Set(fixtures.map((fixture) => fixture.id));
  const candidateToEvent = new Map(candidateRows.map((row) => [row[0], row[1]]));
  const normalizedByEvent = new Map();
  const cleanNote = (value) => String(value ?? "")
    .replace(/[<>\u0000-\u001f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 260);

  for (const entry of Array.isArray(entries) ? entries : []) {
    const eventId = entry?.event_id;
    if (!expected.has(eventId) || normalizedByEvent.has(eventId)) continue;

    if (entry.status === "PASS") {
      normalizedByEvent.set(eventId, {
        event_id: eventId,
        status: "PASS",
        candidate_id: null,
        probability: 0,
        note: cleanNote(entry.note) || "No sufficiently defensible market was identified."
      });
      continue;
    }

    const probability = Number(entry.probability);
    if (
      entry.status === "PICK" &&
      candidateToEvent.get(entry.candidate_id) === eventId &&
      Number.isFinite(probability) &&
      probability > 0 &&
      probability < 100
    ) {
      normalizedByEvent.set(eventId, {
        event_id: eventId,
        status: "PICK",
        candidate_id: entry.candidate_id,
        probability,
        note: cleanNote(entry.note)
      });
    }
  }

  return fixtures.map((fixture) => normalizedByEvent.get(fixture.id) || ({
    event_id: fixture.id,
    status: "PASS",
    candidate_id: null,
    probability: 0,
    note: "No valid recommendation was returned for this fixture; passed safely."
  }));
}
