export function hasUnverifiedExtraTime(sportKey:string):boolean;
export function isAutoSettleableMarket(key:string):boolean;
export type SettlementOutcome="WON"|"LOST"|"VOID"|"PENDING"|"PASS";
export function settleSelection(row:{market_key:string;market_name:string;selection_name:string;selection_status?:string;sport_key?:string;home_team:string;away_team:string},home:number,away:number):{outcome:SettlementOutcome;note:string};
export function calculateEdition(rows:Array<{selection_status?:string;selection_name:string;outcome:string;odds:number}>):{legs:number;won:number;lost:number;void:number;pending:number;pass:number;outcome:"WON"|"LOST"|"VOID"|"PENDING"|"NO_SELECTION";effectiveOdds:number|null;profit:number|null;note:string};
