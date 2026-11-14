import test from "node:test";
import assert from "node:assert/strict";
import { apiKeys } from "./api-keys.mjs";

test("loads all configured key slots and ignores empty values", () => {
  const keys = apiKeys(
    ["GROQ_API_KEY", "GROQ_API_KEY1", "GROQ_API_KEY2", "GROQ_API_KEY3", "GROQ_API_KEY4"],
    { GROQ_API_KEY: " key-a ", GROQ_API_KEY1: "key-b", GROQ_API_KEY2: "key-c", GROQ_API_KEY3: "key-d", GROQ_API_KEY4: "key-e" }
  );
  assert.deepEqual(keys, ["key-a", "key-b", "key-c", "key-d", "key-e"]);
});

test("splits comma-separated values, trims whitespace and deduplicates", () => {
  assert.deepEqual(apiKeys(["A", "B"], { A: "one, two", B: " two, ,three " }), ["one", "two", "three"]);
});

test("returns an empty list when no keys are configured", () => {
  assert.deepEqual(apiKeys(["A", "B"], {}), []);
});
