import {
  getDarajaAccessToken, stkPush, normalizePhone, type DarajaEnv
} from "../../src/daraja";

const SUPABASE_PUBLIC_AUTH_KEY = "sb_publishable_YhJkd-V8k6TjyS1OnAZpbQ_6hg8ueNg";
interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  SUPABASE_ANON_KEY?: string;
  DARAJA_CONSUMER_KEY: string;
  DARAJA_CONSUMER_SECRET: string;
  DARAJA_SHORTCODE: string;
  DARAJA_TILL_NUMBER: string;
  DARAJA_PASSKEY: string;
  DARAJA_ENV: string;
  DARAJA_CALLBACK_URL: string;
}
interface AuthUser { id: string; email?: string | null; phone?: string | null; phone_confirmed_at?: string | null; user_metadata?: Record<string, unknown> }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "Content-Type": "application/json", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" }
});
const db = (env: Env, path: string, init: RequestInit = {}) => {
  const headers = new Headers(init.headers);
  headers.set("apikey", env.SUPABASE_SERVICE_ROLE_KEY);
  if (!env.SUPABASE_SERVICE_ROLE_KEY.startsWith("sb_secret_")) headers.set("Authorization", `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`);
  headers.set("Content-Type", "application/json");
  return fetch(`${env.SUPABASE_URL}${path}`, { ...init, headers });
};
const daraja = (env: Env): DarajaEnv => ({
  DARAJA_CONSUMER_KEY: env.DARAJA_CONSUMER_KEY,
  DARAJA_CONSUMER_SECRET: env.DARAJA_CONSUMER_SECRET,
  DARAJA_SHORTCODE: env.DARAJA_SHORTCODE,
  DARAJA_PASSKEY: env.DARAJA_PASSKEY,
  DARAJA_ENV: env.DARAJA_ENV,
  DARAJA_CALLBACK_URL: env.DARAJA_CALLBACK_URL
});
async function authenticate(request: Request, env: Env): Promise<AuthUser | null> {
  const token = request.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!token || token.length > 8192) return null;
  const response = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${token}` }
  });
  if (!response.ok) return null;
  const user = await response.json() as AuthUser;
  return user?.id ? user : null;
}
async function verifiedPhones(env: Env, user: AuthUser): Promise<string[]> {
  const response = await db(env, `/rest/v1/user_phones?user_id=eq.${encodeURIComponent(user.id)}&verified_at=not.is.null&select=phone,is_primary&order=is_primary.desc,created_at.asc`);
  if (!response.ok) throw new Error("Could not load verified account phone numbers.");
  const rows = await response.json() as Array<{ phone: string; is_primary: boolean }>;
  const phones = rows.map(row => row.phone);
  // A phone confirmed by Supabase Auth is also a verified ownership signal.
  if (user.phone && user.phone_confirmed_at) {
    const normalized = normalizePhone(user.phone);
    if (normalized && !phones.includes(normalized)) {
      const saved = await db(env, "/rest/v1/user_phones?on_conflict=user_id,phone", {
        method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({ user_id: user.id, phone: normalized, is_primary: phones.length === 0, verified_at: user.phone_confirmed_at, verification_method: "supabase_phone_otp" })
      });
      if (!saved.ok) throw new Error("Could not save the verified phone number.");
      phones.unshift(normalized);
    }
  }
  return [...new Set(phones)];
}
function validOrigin(request: Request): boolean {
  const origin = request.headers.get("Origin");
  if (!origin) return true;
  try { return new URL(origin).host === new URL(request.url).host; } catch { return false; }
}
export const onRequestPost = async ({ request, env }: { request: Request; env: Env }) => {
  if (!validOrigin(request)) return json({ error: "Invalid request origin." }, 403);
  const path = new URL(request.url).pathname.replace(/\/$/, "");
  try {
    if (path === "/api/premium/account/subscribe") {
      const user = await authenticate(request, env);
      if (!user) return json({ error: "Sign in to your AccaForge account before subscribing." }, 401);
      const body = await request.json() as { phone?: string; plan_id?: string };
      const phones = await verifiedPhones(env, user);
      const phone = body.phone ? normalizePhone(body.phone) : phones[0] || null;
      if (!phone || !phones.includes(phone)) return json({ error: "Verify this phone number in your account before using it for M-PESA." }, 403);
      if (!body.plan_id || !/^[0-9a-f-]{36}$/i.test(body.plan_id)) return json({ error: "Select a valid subscription plan." }, 400);
      const planResponse = await db(env, `/rest/v1/subscription_plans?id=eq.${body.plan_id}&is_active=eq.true&select=id,name,price_ksh,duration_days`);
      if (!planResponse.ok) throw new Error("Could not load the selected plan.");
      const plans = await planResponse.json() as Array<{ id: string; name: string; price_ksh: number; duration_days: number }>;
      const plan = plans[0];
      if (!plan || plan.price_ksh < 1 || plan.duration_days < 1) return json({ error: "The selected plan is unavailable." }, 400);
      const recent = await db(env, `/rest/v1/payments?user_id=eq.${user.id}&created_at=gte.${encodeURIComponent(new Date(Date.now() - 15 * 60_000).toISOString())}&select=id&limit=4`);
      if (!recent.ok) throw new Error("Could not check recent payment attempts.");
      if ((await recent.json() as unknown[]).length >= 3) return json({ error: "Too many payment attempts. Please wait 15 minutes." }, 429);
      const required = ["DARAJA_CONSUMER_KEY","DARAJA_CONSUMER_SECRET","DARAJA_SHORTCODE","DARAJA_TILL_NUMBER","DARAJA_PASSKEY","DARAJA_CALLBACK_URL"];
      if (required.some(key => !String((env as unknown as Record<string, unknown>)[key] || "").trim())) return json({ error: "M-PESA payment service is not configured." }, 503);
      const accessToken = await getDarajaAccessToken(daraja(env));
      const pushed = await stkPush(daraja(env), accessToken, {
        phoneNumber: phone, amount: plan.price_ksh, accountReference: "AccaForge Premium",
        transactionDesc: `Premium renewal - ${plan.name}`, callbackUrl: env.DARAJA_CALLBACK_URL,
        tillNumber: env.DARAJA_TILL_NUMBER
      });
      if (!pushed.success || !pushed.checkoutRequestId) return json({ error: pushed.errorMessage || "Could not send the M-PESA prompt. Please try again." }, 502);
      const pollToken = crypto.randomUUID() + crypto.randomUUID();
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(pollToken));
      const pollHash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
      const created = await db(env, "/rest/v1/payments", {
        method: "POST", headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          checkout_request_id: pushed.checkoutRequestId, member_phone: phone, plan_id: plan.id,
          amount_ksh: plan.price_ksh, status: "pending", poll_token_hash: pollHash,
          user_id: user.id, renewal_mode: "manual", metadata: { source: "account_checkout" }
        })
      });
      if (!created.ok) {
        console.error("Account Premium payment intent could not be stored:", created.status, (await created.text()).slice(0, 200));
        return json({ error: "The payment prompt was sent, but its secure record could not be saved. Contact support before retrying." }, 503);
      }
      await db(env, "/rest/v1/billing_events", {
        method: "POST", headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ user_id: user.id, event_type: "payment_started", details: { plan_id: plan.id, amount_ksh: plan.price_ksh, checkout_request_id: pushed.checkoutRequestId } })
      });
      return json({ checkout_request_id: pushed.checkoutRequestId, poll_token: pollToken, message: "M-PESA prompt sent. Enter your PIN to approve this payment." });
    }
    return json({ error: "Not found." }, 404);
  } catch (error) {
    console.error("Premium account POST error:", error instanceof Error ? error.message : "unknown");
    return json({ error: "Premium account service is temporarily unavailable." }, 500);
  }
};
export const onRequestGet = async ({ request, env }: { request: Request; env: Env }) => {
  const path = new URL(request.url).pathname.replace(/\/$/, "");
  try {
    if (path === "/api/premium/account/config") {
      return json({ supabase_url: env.SUPABASE_URL, supabase_anon_key: env.SUPABASE_ANON_KEY?.trim() || SUPABASE_PUBLIC_AUTH_KEY });
    }
    const user = await authenticate(request, env);
    if (!user) return json({ error: "Sign in to view your Premium account." }, 401);
    if (path === "/api/premium/account/me") {
      const [phones, subscriptionsResponse, paymentsResponse, profileResponse] = await Promise.all([
        verifiedPhones(env, user),
        db(env, `/rest/v1/subscriptions?user_id=eq.${user.id}&select=id,plan_id,phone,status,starts_at,expires_at,auto_renew_enabled,created_at&order=created_at.desc&limit=20`),
        db(env, `/rest/v1/payments?user_id=eq.${user.id}&select=id,plan_id,amount_ksh,status,mpesa_receipt,result_desc,created_at,expires_at&order=created_at.desc&limit=50`),
        db(env, `/rest/v1/profiles?id=eq.${user.id}&select=display_name,email,avatar_url`)
      ]);
      if (!subscriptionsResponse.ok || !paymentsResponse.ok || !profileResponse.ok) throw new Error("Could not load account billing details.");
      const subscriptions = await subscriptionsResponse.json();
      const payments = await paymentsResponse.json();
      const profiles = await profileResponse.json() as Array<{ display_name: string | null; email: string | null; avatar_url: string | null }>;
      const active = (subscriptions as Array<{ status: string; expires_at: string; plan_id: string }>).find(item => item.status === "active" && Date.parse(item.expires_at) > Date.now());
      return json({
        account: { id: user.id, email: user.email || null, display_name: profiles[0]?.display_name || String(user.user_metadata?.full_name || ""), avatar_url: profiles[0]?.avatar_url || null },
        verified_phones: phones,
        subscriptions, payments,
        entitlement: active ? { is_premium: true, expires_at: active.expires_at, plan_id: active.plan_id } : { is_premium: false, expires_at: null, plan_id: null }
      });
    }
    return json({ error: "Not found." }, 404);
  } catch (error) {
    console.error("Premium account GET error:", error instanceof Error ? error.message : "unknown");
    return json({ error: "Premium account service is temporarily unavailable." }, 500);
  }
};
