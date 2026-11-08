interface Env { DB:D1Database }
export const onRequestGet: PagesFunction<Env> = async ({env}) => {
 try { await env.DB.prepare("SELECT 1 AS ok").first(); return Response.json({status:"ok",database:"connected"}); }
 catch { return Response.json({status:"degraded",database:"unavailable"},{status:503}); }
};