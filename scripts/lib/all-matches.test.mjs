import test from "node:test";
import assert from "node:assert/strict";
import { normalizeAllMatchesBatch } from "./all-matches.mjs";

const fixtures=[{id:"e1"},{id:"e2"}];
const rows=[
 ["c1","e1","soccer_test","Home vs Away","Match result","Home",1.8,62,4,3],
 ["c2","e1","soccer_test","Home vs Away","Goals over/under","Under 0.5",2.4,35,0,2],
 ["c3","e2","soccer_test","Home vs Away","Both teams to score","Yes",1.9,57,4,2]
];
const reason1="Home form and bookmaker consensus support this result; the price edge is positive, though lineup uncertainty remains.";
const reason2="Both teams scoring is supported by the market consensus and multiple bookmaker prices; recent team news remains limited.";

test("preserves the AI-selected market even when another market has a higher raw probability",()=>{
 const result=normalizeAllMatchesBatch(fixtures,[
  {event_id:"e1",status:"PICK",candidate_id:"c2",probability:36,note:reason1},
  {event_id:"e2",status:"PICK",candidate_id:"c3",probability:58,note:reason2}
 ],rows);
 assert.equal(result[0].candidate_id,"c2");
});

test("withholds the entire edition when any fixture has no defensible market",()=>{
 assert.throws(()=>normalizeAllMatchesBatch(fixtures,[
  {event_id:"e1",status:"PASS",note:"No market has a reliable edge because prices conflict across bookmakers and team news is unavailable."},
  {event_id:"e2",status:"PICK",candidate_id:"c3",probability:58,note:reason2}
 ],rows),/edition withheld.*PASS is not publishable/);
});

test("rejects missing or generic PICK rationales",()=>{
 assert.throws(()=>normalizeAllMatchesBatch([{id:"e1"}],[
  {event_id:"e1",status:"PICK",candidate_id:"c1",probability:62,note:"Good odds"}
 ],rows),/rationale/);
});

test("rejects unknown candidate IDs and mismatched fixture decisions",()=>{
 assert.throws(()=>normalizeAllMatchesBatch([{id:"e1"}],[
  {event_id:"e1",status:"PICK",candidate_id:"c3",probability:58,note:reason2}
 ],rows),/invalid decision or candidate ID/);
});

test("requires the AI to assess every fixture exactly once",()=>{
 assert.throws(()=>normalizeAllMatchesBatch(fixtures,[
  {event_id:"e1",status:"PASS",note:"No defensible market because the available prices conflict and reliable team news is unavailable."}
 ],rows),/assess every fixture/);
});

test("rejects an invalid AI probability estimate",()=>{
 assert.throws(()=>normalizeAllMatchesBatch([{id:"e1"}],[
  {event_id:"e1",status:"PICK",candidate_id:"c1",probability:100,note:reason1}
 ],rows),/valid AI probability/);
});
