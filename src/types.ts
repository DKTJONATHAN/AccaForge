export type ProductType = "safe_picks" | "super_5" | "all_matches";
export interface Selection {
 id:string; acca_id:string; event_id:string; sport_key:string; commence_time:string;
 home_team:string; away_team:string; market_key:string; market_name:string;
 selection_name:string; odds:number; bookmaker:string; note:string; sort_order:number;
 selection_status:"PICK"|"PASS"; probability:number; implied_probability:number;
}
export interface Acca {
 id:string; target_odds:number; actual_odds:number; status:string; headline:string;
 analysis_note:string; publish_date:string; created_at:string; product_type:ProductType; selections:Selection[];
}
export interface AccasResponse { accas:Acca[]; updatedAt:string|null; error?:string }