interface Env { DB: D1Database }
interface AccaRow { id:string; target_odds:number; actual_odds:number; status:string; headline:string; analysis_note:string; publish_date:string; created_at:string }
interface SelectionRow { id:string; acca_id:string; event_id:string; sport_key:string; commence_time:string; home_team:string; away_team:string; market_key:string; market_name:string; selection_name:string; odds:number; bookmaker:string; note:string; sort_order:number }

export const onRequestGet: PagesFunction<Env> = async ({request,env}) => {
 try {
  const url=new URL(request.url);
  const requested=Number(url.searchParams.get("days")||3);
  const days=Number.isFinite(requested)?Math.min(3,Math.max(1,Math.floor(requested))):3;
  const cutoff = new Date(new Intl.DateTimeFormat("en-CA", {timeZone:"Africa/Nairobi",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date())+"T12:00:00Z");
  cutoff.setUTCDate(cutoff.getUTCDate()-(days-1));
  const cutoffDate=cutoff.toISOString().slice(0,10);
  const rows=(await env.DB.prepare("SELECT * FROM accas WHERE publish_date >= ? ORDER BY publish_date DESC,target_odds ASC").bind(cutoffDate).all<AccaRow>()).results||[];
  if(!rows.length) return Response.json({accas:[],updatedAt:null});
  const selections=(await env.DB.prepare("SELECT s.* FROM selections s JOIN accas a ON a.id=s.acca_id WHERE a.publish_date >= ? ORDER BY a.publish_date DESC,a.target_odds ASC,s.sort_order ASC").bind(cutoffDate).all<SelectionRow>()).results||[];
  const grouped=new Map<string,SelectionRow[]>();
  for(const item of selections){const list=grouped.get(item.acca_id)||[];list.push(item);grouped.set(item.acca_id,list);}
  const accas=rows.map(row=>({...row,selections:grouped.get(row.id)||[]}));
  return Response.json({accas,updatedAt:rows[0]?.created_at||null},{headers:{"Cache-Control":"public, max-age=60, s-maxage=120, stale-while-revalidate=300"}});
 } catch(error){console.error("AccaForge read error",error);return Response.json({error:"Results are temporarily unavailable."},{status:500});}
};