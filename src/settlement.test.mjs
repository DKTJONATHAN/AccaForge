import test from "node:test";
import assert from "node:assert/strict";
import {settleSelection,calculateEdition,isAutoSettleableMarket,hasUnverifiedExtraTime} from "./settlement.mjs";
const row=(market_key,selection_name,market_name="")=>({market_key,selection_name,market_name,home_team:"Arsenal",away_team:"Chelsea"});
test("settles match result including draw",()=>{
 assert.equal(settleSelection(row("h2h","Arsenal"),2,0).outcome,"WON");
 assert.equal(settleSelection(row("h2h","Draw"),1,1).outcome,"WON");
 assert.equal(settleSelection(row("h2h","Chelsea"),2,0).outcome,"LOST");
});
test("settles BTTS yes and no",()=>{
 assert.equal(settleSelection(row("btts","Yes"),1,1).outcome,"WON");
 assert.equal(settleSelection(row("btts","No"),2,0).outcome,"WON");
});
test("settles half-goal totals and pushes whole-goal totals",()=>{
 assert.equal(settleSelection(row("totals","Over 2.5"),2,1).outcome,"WON");
 assert.equal(settleSelection(row("totals","Under 2.5"),2,1).outcome,"LOST");
 assert.equal(settleSelection(row("alternate_totals","Over 3.0"),2,1).outcome,"VOID");
});
test("settles double chance and draw no bet",()=>{
 assert.equal(settleSelection(row("double_chance","1X"),1,1).outcome,"WON");
 assert.equal(settleSelection(row("double_chance","Home or Draw"),1,0).outcome,"WON");
 assert.equal(settleSelection(row("double_chance","Draw or Away"),1,0).outcome,"LOST");
 assert.equal(settleSelection(row("double_chance","12"),0,0).outcome,"LOST");
 assert.equal(settleSelection(row("draw_no_bet","Arsenal"),1,1).outcome,"VOID");
});
test("does not guess unsupported or ambiguous markets",()=>{
 assert.equal(settleSelection(row("spreads","Arsenal -1.5"),2,0).outcome,"PENDING");
 assert.equal(settleSelection(row("team_totals","Over (Arsenal) 1.5"),2,0).outcome,"PENDING");
 assert.equal(settleSelection(row("totals","Over 2.25"),2,0).outcome,"PENDING");
 assert.equal(settleSelection(row("btts","maybe"),2,0).outcome,"PENDING");
});
test("edition wins only when every active leg wins; void legs drop out of odds",()=>{
 const result=calculateEdition([{selection_name:"Arsenal",outcome:"WON",odds:1.8},{selection_name:"Over 2.5",outcome:"VOID",odds:1.9},{selection_name:"Yes",outcome:"WON",odds:2}]);
 assert.equal(result.outcome,"WON");
 assert.equal(result.effectiveOdds,3.6);
 assert.equal(result.profit,2.6);
 assert.equal(result.void,1);
});
test("one losing leg loses the accumulator even if other legs are pending",()=>{
 assert.equal(calculateEdition([{selection_name:"A",outcome:"LOST",odds:1.8},{selection_name:"B",outcome:"PENDING",odds:2}]).outcome,"LOST");
});
test("pending legs keep edition pending; all void legs make edition void",()=>{
 assert.equal(calculateEdition([{selection_name:"A",outcome:"WON",odds:2},{selection_name:"B",outcome:"PENDING",odds:2}]).outcome,"PENDING");
 assert.equal(calculateEdition([{selection_name:"A",outcome:"VOID",odds:2}]).outcome,"VOID");
});
test("PASS rows do not count as accumulator legs",()=>{
 const result=calculateEdition([{selection_name:"PASS",outcome:"PASS",selection_status:"PASS",odds:1},{selection_name:"A",outcome:"WON",odds:2}]);
 assert.equal(result.legs,1);assert.equal(result.pass,1);assert.equal(result.outcome,"WON");
});

test("market allowlist excludes markets without automatic settlement",()=>{
 for(const key of ["spreads","alternate_spreads","team_totals","alternate_team_totals","spreads_h1"])assert.equal(isAutoSettleableMarket(key),false);
 for(const key of ["h2h","totals","alternate_totals","btts","double_chance","draw_no_bet"])assert.equal(isAutoSettleableMarket(key),true);
});

test("cup scores without regulation-time breakdown stay pending",()=>{
 assert.equal(hasUnverifiedExtraTime("soccer_england_fa_cup"),true);
 assert.equal(settleSelection({...row("h2h","Arsenal"),sport_key:"soccer_uefa_champions_league"},2,0).outcome,"PENDING");
 assert.equal(hasUnverifiedExtraTime("soccer_england_premier_league"),false);
});
