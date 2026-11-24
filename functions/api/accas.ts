interface Env { DB: D1Database; SUPABASE_URL?: string; SUPABASE_SERVICE_ROLE_KEY?: string }
interface AccaRow { id:string; target_odds:number; actual_odds:number; status:string; headline:string; analysis_note:string; publish_date:string; created_at:string; product_type:string }
interface SelectionRow { id:string; acca_id:string; event_id:string; sport_key:string; commence_time:string; home_team:string; away_team:string; market_key:string; market_name:string; selection_name:string; odds:number; bookmaker:string; note:string; sort_order:number; selection_status:string; probability:number; implied_probability:number }

async function premiumArchiveDays(request: Request, env: Env): Promise<number> {
 const token=request.headers.get("Authorization")?.replace(/^Bearer\s+/i,"").trim();
 if(!token||token.length>256||!env.SUPABASE_URL||!env.SUPABASE_SERVICE_ROLE_KEY)return 0;
 const response=await fetch(`${env.SUPABASE_URL}/rest/v1/members?session_token=eq.${encodeURIComponent(token)}&select=status,expires_at,plan_id`,{
  headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:`Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`}
 });
 if(!response.ok)return 0;
 const rows=await response.json() as Array<{status:string;expires_at:string|null;plan_id:string|null}>;
 const member=rows[0];
 if(!member||member.status!=="active"||!member.expires_at||Date.parse(member.expires_at)<=Date.now()||!member.plan_id)return 0;
 const planResponse=await fetch(`${env.SUPABASE_URL}/rest/v1/subscription_plans?id=eq.${encodeURIComponent(member.plan_id)}&select=duration_days`,{
  headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:`Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`}
 });
 if(!planResponse.ok)return 0;
 const plans=await planResponse.json() as Array<{duration_days:number}>;
 return Math.min(365,Math.max(0,Math.floor(plans[0]?.duration_days||0)));
}

export const onRequestGet = async ({request,env}: {request:Request;env:Env}) => {
 try {
  const premiumDays=await premiumArchiveDays(request,env);
  const days=premiumDays||3;
  const cutoff = new Date(new Intl.DateTimeFormat("en-CA", {timeZone:"Africa/Nairobi",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date())+"T12:00:00Z");
  cutoff.setUTCDate(cutoff.getUTCDate()-(days-1));
  const cutoffDate=cutoff.toISOString().slice(0,10);
  const schema=(await env.DB.prepare("PRAGMA table_info(accas)").all<{name:string}>()).results||[];
  if(!schema.some(column=>column.name==="product_type")){
   return Response.json({accas:[],updatedAt:null,migrationPending:true},{headers:{"Cache-Control":"no-store"}});
  }
  const rows=(await env.DB.prepare("SELECT * FROM accas WHERE status='published' AND product_type IN ('safe_picks','super_5','super_10','all_matches') AND publish_date >= ? ORDER BY publish_date DESC,CASE product_type WHEN 'safe_picks' THEN 1 WHEN 'super_5' THEN 2 WHEN 'super_10' THEN 3 ELSE 4 END").bind(cutoffDate).all<AccaRow>()).results||[];
  if(!rows.length) return Response.json({accas:[],updatedAt:null,premium:premiumDays>0,archiveDays:days},{headers:{"Cache-Control":premiumDays>0?"private, no-store":"public, max-age=60, s-maxage=120, stale-while-revalidate=300"}});
  const selections=(await env.DB.prepare("SELECT s.* FROM selections s JOIN accas a ON a.id=s.acca_id WHERE a.status='published' AND a.product_type IN ('safe_picks','super_5','super_10','all_matches') AND a.publish_date >= ? ORDER BY a.publish_date DESC,CASE a.product_type WHEN 'safe_picks' THEN 1 WHEN 'super_5' THEN 2 WHEN 'super_10' THEN 3 ELSE 4 END,s.sort_order ASC").bind(cutoffDate).all<SelectionRow>()).results||[];
  const grouped=new Map<string,SelectionRow[]>();
  for(const item of selections){const list=grouped.get(item.acca_id)||[];list.push(item);grouped.set(item.acca_id,list);}
  const accas=rows.map(row=>{
   const items=grouped.get(row.id)||[];
   return premiumDays>0?{...row,selections:items}:{...row,analysis_note:"Unlock the full edition reasoning and selection rationale with AccaForge Premium.",selections:items.map(item=>({...item,note:"Premium members can view the full selection rationale."}))};
  });
  return Response.json({accas,updatedAt:rows[0]?.created_at||null,premium:premiumDays>0,archiveDays:days},{headers:{"Cache-Control":premiumDays>0?"private, no-store":"public, max-age=60, s-maxage=120, stale-while-revalidate=300"}});
 } catch(error){console.error("AccaForge read error",error);return Response.json({error:"Results are temporarily unavailable."},{status:500});}
};