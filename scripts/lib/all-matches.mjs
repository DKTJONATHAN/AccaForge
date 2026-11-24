export function normalizeAllMatchesBatch(fixtures, entries, candidateRows) {
  const expected = new Set(fixtures.map((fixture) => fixture.id));
  const candidateToEvent = new Map(candidateRows.map((row) => [row[0], row[1]]));
  const normalizedByEvent = new Map();
  const cleanNote = (value) => String(value ?? "").replace(/[<>\u0000-\u001f]/g, "").replace(/\s+/g, " ").trim().slice(0, 260);

  if (!Array.isArray(entries)) {
    throw new Error("All-Matches AI response is missing its fixture decisions; refusing to invent selections.");
  }
  for (const entry of entries) {
    const eventId = entry?.event_id;
    if (!expected.has(eventId) || normalizedByEvent.has(eventId)) {
      throw new Error("All-Matches AI response contains an unknown or duplicate fixture.");
    }
    const note = cleanNote(entry.note);
    if (entry.status === "PASS") {
      throw new Error("All-Matches edition withheld: fixture " + eventId + " has no defensible priced selection. PASS is not publishable; no arbitrary market will be substituted.");
    }
    if (entry.status !== "PICK" || candidateToEvent.get(entry.candidate_id) !== eventId) {
      throw new Error("All-Matches AI response contains an invalid decision or candidate ID for " + eventId + ".");
    }
    if (note.length < 40) {
      throw new Error("Every PICK requires a specific evidence-based rationale (at least 40 characters).");
    }
    const probability = Number(entry.probability);
    if (!Number.isFinite(probability) || probability <= 0 || probability >= 100) {
      throw new Error("Every PICK requires a valid AI probability estimate.");
    }
    normalizedByEvent.set(eventId, {
      event_id: eventId,
      status: "PICK",
      candidate_id: entry.candidate_id,
      probability,
      note
    });
  }
  if (normalizedByEvent.size !== expected.size) {
    throw new Error("All-Matches AI response must explicitly assess every fixture exactly once; no deterministic fallback is permitted.");
  }
  return fixtures.map((fixture) => normalizedByEvent.get(fixture.id));
}
