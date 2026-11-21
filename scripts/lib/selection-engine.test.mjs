import test from "node:test";
import assert from "node:assert/strict";
import { candidateScore, enrichMarketProbabilities, rankCandidates, selectBestLegs } from "./selection-engine.mjs";
const candidate = (id, event, odds, probability, edge = 0, books = 3) => ({ candidate_id:id,event_id:event,odds,market_probability:probability,value_edge:edge,bookmaker_count:books });

test("de-vigs bookmaker consensus across outcomes in the same market", () => {
 const rows=enrichMarketProbabilities([
  {candidate_id:"h",event_id:"e1",odds:2,market_group:"g",bookmaker_prices:[{price:2},{price:2.1}]},
  {candidate_id:"d",event_id:"e1",odds:3.2,market_group:"g",bookmaker_prices:[{price:3.2},{price:3.1}]},
  {candidate_id:"a",event_id:"e1",odds:4,market_group:"g",bookmaker_prices:[{price:4},{price:3.9}]}
 ]);
 assert.ok(Math.abs(rows.reduce((sum,row)=>sum+row.market_probability,0)-100)<0.1);
 assert.ok(rows[0].market_probability>rows[1].market_probability);
 assert.equal(rows[0].bookmaker_count,2);
});
test("ranks likely and value-supported outcomes above high-odds longshots",()=>{
 assert.ok(candidateScore(candidate("likely","e1",1.55,68,3))>candidateScore(candidate("longshot","e2",1.98,51,0)));
});
test("selects one market per distinct fixture within the permitted price band",()=>{
 const picks=selectBestLegs([candidate("a1","e1",1.8,65,5),candidate("a2","e1",1.9,60,2),candidate("b","e2",1.7,62,4),candidate("c","e3",2.2,70,5),candidate("d","e4",1.4,75,4)],2,1.5,2);
 assert.deepEqual(picks.map(x=>x.candidate_id),["a1","b"]);
 assert.equal(new Set(picks.map(x=>x.event_id)).size,2);
});
test("keeps multiple market options per fixture while preserving diversity",()=>{
 const rows=[candidate("a1","e1",1.7,65,4),candidate("a2","e1",1.8,62,3),candidate("a3","e1",1.9,58,1),candidate("b","e2",1.6,67,3),candidate("c","e3",1.8,60,2)];
 const ranked=rankCandidates(rows,{minOdds:1.5,maxOdds:2,limit:4,perFixture:2});
 assert.equal(ranked.length,4);
 assert.equal(ranked.filter(x=>x.event_id==="e1").length,2);
 assert.ok(ranked.every(x=>x.odds>=1.5&&x.odds<=2));
});
test("refuses to manufacture legs when too few fixtures qualify",()=>{
 assert.throws(()=>selectBestLegs([candidate("a","e1",1.8,60)],2,1.5,2),/distinct fixtures/);
});
