import test from "node:test";
import assert from "node:assert/strict";
import { OddsPapiClient } from "./oddspapi.mjs";

test("treats OddsPapi FIXTURE_NOT_FOUND as an empty tournament date without rotating through keys", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    return new Response(JSON.stringify({
      error: { code: "FIXTURE_NOT_FOUND", message: "No fixtures found for the specified criteria." }
    }), { status: 404, headers: { "Content-Type": "application/json" } });
  });
  const client = new OddsPapiClient(["test-key-1", "test-key-2", "test-key-3"]);
  const rows = await client.getFixturesForDate("2026-11-25", [
    { tournamentId: 1, tournamentSlug: "premier-league", tournamentName: "Premier League" }
  ]);
  assert.deepEqual(rows, []);
  assert.equal(calls, 1, "a missing fixture must not be retried with every API key");
});
