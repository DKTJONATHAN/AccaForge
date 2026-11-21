export function normalizeAllMatchesBatch(fixtures, entries, candidateRows) {
  const expected = new Set(fixtures.map((fixture) => fixture.id));
  const candidateToEvent = new Map(candidateRows.map((row) => [row[0], row[1]]));
  const candidatesByEvent = new Map();
  for (const row of candidateRows) {
    if (!candidatesByEvent.has(row[1])) candidatesByEvent.set(row[1], []);
    candidatesByEvent.get(row[1]).push(row);
  }
  const normalizedByEvent = new Map();
  const cleanNote = (value) => String(value ?? "").replace(/[<>\u0000-\u001f]/g, "").replace(/\s+/g, " ").trim().slice(0, 260);
  const bestCandidate = (eventId) => {
    const options = candidatesByEvent.get(eventId) || [];
    options.sort((a, b) =>
      Number(b[7] || (100 / Number(b[6]))) - Number(a[7] || (100 / Number(a[6]))) ||
      Number(b[8] || 0) - Number(a[8] || 0) ||
      Number(b[9] || 0) - Number(a[9] || 0)
    );
    return options[0];
  };

  for (const entry of Array.isArray(entries) ? entries : []) {
    const eventId = entry?.event_id;
    if (!expected.has(eventId) || normalizedByEvent.has(eventId)) continue;
    if (entry.status === "PICK" && candidateToEvent.get(entry.candidate_id) === eventId) {
      const row = candidatesByEvent.get(eventId)?.find((item) => item[0] === entry.candidate_id);
      const probability = Number(entry.probability);
      normalizedByEvent.set(eventId, {
        event_id: eventId,
        status: "PICK",
        candidate_id: entry.candidate_id,
        probability: Number.isFinite(probability) && probability > 0 && probability < 100 ? probability : Number(row?.[7]) || (100 / Number(row?.[6])),
        note: cleanNote(entry.note)
      });
    }
  }

  return fixtures.map((fixture) => {
    const selected = normalizedByEvent.get(fixture.id);
    if (selected) return selected;
    const fallback = bestCandidate(fixture.id);
    if (!fallback) throw new Error("All-Matches cannot skip " + fixture.id + ": no priced market candidate was collected for this fixture.");
    return {
      event_id: fixture.id,
      status: "PICK",
      candidate_id: fallback[0],
      probability: Number(fallback[7]) || (100 / Number(fallback[6])),
      note: "Selected from the strongest available bookmaker-market consensus for this fixture."
    };
  });
}
