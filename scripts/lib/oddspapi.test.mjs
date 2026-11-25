import test from "node:test";
import assert from "node:assert/strict";
import { OddsPapiClient } from "./oddspapi.mjs";

test("treats OddsPapi FIXTURE_NOT_FOUND as an empty tournament date", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({
    error: { code: "FIXTURE_NOT_FOUND", message: "No fixtures found for the specified criteria." }
  }), { status: 404, headers: { "Content-Type": "application/json" } }));
  const client = new OddsPapiClient(["test-key"]);
  const rows = await client.getFixturesForDate("2026-11-25", [
    { tournamentId: 1, tournamentSlug: "premier-league", tournamentName: "Premier League" }
  ]);
  assert.deepEqual(rows, []);
});
