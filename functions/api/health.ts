interface Env { DB:D1Database }
export const onRequestGet = async ({env}: {request:Request;env:Env}) => {
 try { await env.DB.prepare("SELECT 1 AS ok").first(); return Response.json({status:"ok",database:"connected"}); }
 catch { return Response.json({status:"degraded",database:"unavailable"},{status:503}); }
};