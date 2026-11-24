export function settleSelection(row,home,away){
 const market=String(row.market_key||"").toLowerCase();
 const pick=String(row.selection_name||"").trim();
 const total=home+away;
 const result=(outcome,note)=>({outcome,note});
 if(row.selection_status==="PASS"||pick.toUpperCase()==="PASS")return result("PASS","No selection was published for this fixture.");
 if(!Number.isInteger(home)||!Number.isInteger(away)||home<0||away<0)return result("PENDING","A valid full-time score is not available.");
 if(["h2h","moneyline","match_winner"].includes(market)){
  const winner=home>away?row.home_team:away>home?row.away_team:"Draw";
  const value=pick.toLowerCase();
  const won=value===String(winner).toLowerCase()||(["1","home"].includes(value)&&home>away)||(["2","away"].includes(value)&&away>home)||(["x","draw"].includes(value)&&home===away);
  const recognised=won||value===String(row.home_team).toLowerCase()||value===String(row.away_team).toLowerCase()||["1","2","x","home","away","draw"].includes(value);
  return recognised?result(won?"WON":"LOST","Full-time result: "+home+"–"+away+"."):result("PENDING","Match-result selection could not be interpreted safely.");
 }
 if(["btts","both_teams_to_score"].includes(market)){
  const yes=home>0&&away>0;
  const wantsYes=/\byes\b|both teams to score/i.test(pick);
  const wantsNo=/\bno\b|neither team/i.test(pick);
  if(wantsYes===wantsNo)return result("PENDING","BTTS selection could not be interpreted safely.");
  return result(yes===wantsYes?"WON":"LOST","Full-time score: "+home+"–"+away+".");
 }
 if(["totals","alternate_totals"].includes(market)){
  const line=Number((pick+" "+row.market_name).match(/\b(\d+(?:\.\d+)?)\b/)?.[1]);
  const isOver=/\bover\b/i.test(pick),isUnder=/\bunder\b/i.test(pick);
  if(!Number.isFinite(line)||isOver===isUnder||Math.abs(line*2-Math.round(line*2))>1e-8)return result("PENDING","Only clearly labelled half-goal totals can be settled automatically.");
  if(total===line)return result("VOID","The total landed exactly on the line; the selection is void.");
  return result((isOver?total>line:total<line)?"WON":"LOST","Full-time total: "+total+" goals.");
 }
 if(market==="double_chance"){
  const value=pick.toLowerCase().replace(/\s/g,"");
  const won=value==="1x"?(home>=away):value==="x2"?(away>=home):value==="12"?(home!==away):null;
  return won===null?result("PENDING","Double-chance selection could not be interpreted safely."):result(won?"WON":"LOST","Full-time result: "+home+"–"+away+".");
 }
 if(market==="draw_no_bet"){
  const selectedHome=pick.toLowerCase()===String(row.home_team).toLowerCase();
  const selectedAway=pick.toLowerCase()===String(row.away_team).toLowerCase();
  if(home===away)return result("VOID","Match finished level; draw-no-bet selection is void.");
  if(!selectedHome&&!selectedAway)return result("PENDING","Team selection could not be identified safely.");
  return result((selectedHome?home>away:away>home)?"WON":"LOST","Full-time result: "+home+"–"+away+".");
 }
 // Asian quarter-lines, handicaps and team totals are deliberately not guessed.
 return result("PENDING","This market is not enabled for automatic settlement; no outcome has been guessed.");
}

export function calculateEdition(rows){
 const picks=rows.filter(row=>row.selection_status!=="PASS"&&String(row.selection_name||"").trim().toUpperCase()!=="PASS");
 const counts={legs:picks.length,won:0,lost:0,void:0,pending:0,pass:rows.length-picks.length};
 for(const row of picks){
  const outcome=String(row.outcome||"PENDING").toUpperCase();
  if(outcome==="WON")counts.won++;
  else if(outcome==="LOST")counts.lost++;
  else if(outcome==="VOID")counts.void++;
  else counts.pending++;
 }
 if(!counts.legs)return {...counts,outcome:"NO_SELECTION",effectiveOdds:null,profit:0,note:"No active selections in this edition."};
 const effectiveOdds=picks.filter(row=>row.outcome==="WON").reduce((product,row)=>product*Number(row.odds),1);
 if(counts.lost)return {...counts,outcome:"LOST",effectiveOdds:null,profit:-1,note:"At least one active leg lost; the accumulator is lost."};
 if(counts.pending)return {...counts,outcome:"PENDING",effectiveOdds:null,profit:null,note:"One or more active legs are still awaiting settlement."};
 if(counts.won===0)return {...counts,outcome:"VOID",effectiveOdds:1,profit:0,note:"All active legs were void; the stake is returned."};
 return {...counts,outcome:"WON",effectiveOdds,profit:effectiveOdds-1,note:"All active legs won; void legs were removed from the combined odds."};
}
