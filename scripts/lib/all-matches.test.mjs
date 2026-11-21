import test from "node:test";
import assert from "node:assert/strict";
import { normalizeAllMatchesBatch } from "./all-matches.mjs";
const fixtures=[{id:"e1"},{id:"e2"},{id:"e3"}];
const candidates=[
 ["c1","e1","soccer_test","Home vs Away","Match result","Home",1.8,62,4,3],
 ["c2","e2","soccer_test","Home vs Away","Double chance","Home or draw",1.7,68,5,3],
 ["c3","e3","soccer_test","Home vs Away","Both teams to score","No",1.9,57,4,2]
];
test("keeps one valid PICK for every fixture",()=>{
 const result=normalizeAllMatchesBatch(fixtures,[{event_id:"e1",status:"PICK",candidate_id:"c1",probability:63},{event_id:"e2",status:"PICK",candidate_id:"c2",probability:69}],candidates);
 assert.deepEqual(result.map(x=>x.event_id),["e1","e2","e3"]);
 assert.ok(result.every(x=>x.status==="PICK"));
 assert.equal(result[2].candidate_id,"c3");
});
test("replaces PASS, omitted and duplicate rows with the best priced market",()=>{
 const result=normalizeAllMatchesBatch(fixtures,[{event_id:"e1",status:"PICK",candidate_id:"c1",probability:70},{event_id:"e2",status:"PASS"},{event_id:"e1",status:"PASS"}],candidates);
 assert.deepEqual(result.map(x=>x.candidate_id),["c1","c2","c3"]);
 assert.ok(result.every(x=>x.status==="PICK"));
});
test("replaces invalid candidate IDs with the best priced market",()=>{
 const result=normalizeAllMatchesBatch(fixtures,[{event_id:"e1",status:"PICK",candidate_id:"c2",probability:70},{event_id:"e2",status:"PICK",candidate_id:"c2",probability:100},{event_id:"e3",status:"PICK",candidate_id:"c3",probability:55}],candidates);
 assert.deepEqual(result.map(x=>x.candidate_id),["c1","c2","c3"]);
});
test("refuses to skip a fixture with no collected market prices",()=>{
 assert.throws(()=>normalizeAllMatchesBatch(fixtures,null,candidates.slice(0,2)),/cannot skip e3/);
});
