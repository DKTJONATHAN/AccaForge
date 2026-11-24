/**
 * Premium subscription API endpoints.
 *
 * These run as Cloudflare Pages Functions and proxy all payment operations
 * through Supabase using the service_role key. The browser never sees
 * member or payment data directly — it only gets a session token after
 * a successful M-Pesa payment.
 *
 * Routes handled:
 *   POST /api/premium/subscribe  — initiate STK push
 *   GET  /api/premium/status/:id — poll payment status
 *   GET  /api/premium/me         — check current member session
 *   POST /api/premium/callback   — Daraja STK push callback (no auth)
 */

import {
  getDarajaAccessToken,
  stkPush,
  parseStkCallback,
  normalizePhone,
  type DarajaEnv,
} from "../../src/daraja";

interface PremiumEnv {
  DB: D1Database;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  DARAJA_CONSUMER_KEY: string;
  DARAJA_CONSUMER_SECRET: string;
  DARAJA_SHORTCODE: string;
  DARAJA_PASSKEY: string;
  DARAJA_ENV: string;
  DARAJA_CALLBACK_URL: string;
}

const json = (body: unknown, status = 200, extra?: Record<string, string>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...(extra || {}),
    },
  });

async function supabaseFetch(env: PremiumEnv, path: string, options: RequestInit = {}): Promise<Response> {
  const url = `${env.SUPABASE_URL}${path}`;
  return fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      ...options.headers,
    },
  });
}

async function fetchPlan(env: PremiumEnv, planId: string): Promise<{ id: string; name: string; price_ksh: number; duration_days: number } | null> {
  const res = await supabaseFetch(env, `/rest/v1/subscription_plans?id=eq.${planId}&is_active=eq.true&select=id,name,price_ksh,duration_days`);
  if (!res.ok) return null;
  const rows = await res.json() as Array<{ id: string; name: string; price_ksh: number; duration_days: number }>;
  return rows[0] || null;
}

async function createPayment(env: PremiumEnv, data: { checkout_request_id: string; member_phone: string; plan_id: string; amount_ksh: number }): Promise<void> {
  await supabaseFetch(env, "/rest/v1/payments", {
    method: "POST",
    body: JSON.stringify({
      checkout_request_id: data.checkout_request_id,
      member_phone: data.member_phone,
      plan_id: data.plan_id,
      amount_ksh: data.amount_ksh,
      status: "pending",
    }),
  });
}

async function updatePayment(env: PremiumEnv, checkoutRequestId: string, data: { status: string; mpesa_receipt?: string; result_code?: number; result_desc?: string; callback_received: boolean }): Promise<void> {
  await supabaseFetch(env, `/rest/v1/payments?checkout_request_id=eq.${encodeURIComponent(checkoutRequestId)}`, {
    method: "PATCH",
    body: JSON.stringify({
      ...data,
      updated_at: new Date().toISOString(),
    }),
  });
}

async function fetchPaymentByCheckout(env: PremiumEnv, checkoutRequestId: string): Promise<{ status: string; member_phone: string; plan_id: string; amount_ksh: number } | null> {
  const res = await supabaseFetch(env, `/rest/v1/payments?checkout_request_id=eq.${encodeURIComponent(checkoutRequestId)}&select=status,member_phone,plan_id,amount_ksh`);
  if (!res.ok) return null;
  const rows = await res.json() as Array<{ status: string; member_phone: string; plan_id: string; amount_ksh: number }>;
  return rows[0] || null;
}

async function upsertMember(env: PremiumEnv, phone: string, planId: string, durationDays: number): Promise<{ session_token: string; expires_at: string } | null> {
  const expiresAt = new Date(Date.now() + durationDays * 86400000).toISOString();
  const sessionToken = crypto.randomUUID();

  const existingRes = await supabaseFetch(env, `/rest/v1/members?phone=eq.${encodeURIComponent(phone)}&select=id`);
  const existing = await existingRes.json() as Array<{ id: string }>;

  if (existing.length > 0) {
    const updateRes = await supabaseFetch(env, `/rest/v1/members?id=eq.${existing[0].id}`, {
      method: "PATCH",
      body: JSON.stringify({
        plan_id: planId,
        status: "active",
        session_token: sessionToken,
        expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      }),
    });
    if (!updateRes.ok) return null;
  } else {
    const insertRes = await supabaseFetch(env, "/rest/v1/members", {
      method: "POST",
      body: JSON.stringify({
        phone,
        plan_id: planId,
        status: "active",
        session_token: sessionToken,
        expires_at: expiresAt,
      }),
    });
    if (!insertRes.ok) return null;
  }

  return { session_token: sessionToken, expires_at: expiresAt };
}

async function fetchMemberByToken(env: PremiumEnv, token: string): Promise<{ id: string; phone: string; status: string; expires_at: string; plan_id: string } | null> {
  const res = await supabaseFetch(env, `/rest/v1/members?session_token=eq.${encodeURIComponent(token)}&select=id,phone,status,expires_at,plan_id`);
  if (!res.ok) return null;
  const rows = await res.json() as Array<{ id: string; phone: string; status: string; expires_at: string; plan_id: string }>;
  if (!rows.length) return null;
  const member = rows[0];
  if (member.expires_at && new Date(member.expires_at).getTime() < Date.now()) {
    await supabaseFetch(env, `/rest/v1/members?id=eq.${member.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "expired", updated_at: new Date().toISOString() }),
    });
    member.status = "expired";
  }
  return member;
}

function getSessionToken(request: Request): string | null {
  const auth = request.headers.get("Authorization");
  if (auth && auth.startsWith("Bearer ")) return auth.slice(7).trim();
  return null;
}

export const onRequestPost = async ({ request, env }: { request: Request; env: PremiumEnv }) => {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/$/, "");

  try {
    if (path === "/api/premium/subscribe") {
      const body = await request.json() as { phone?: string; plan_id?: string };
      const phone = body.phone ? normalizePhone(body.phone) : null;
      if (!phone) return json({ error: "Please enter a valid Safaricom phone number (e.g. 0712345678)." }, 400);
      if (!body.plan_id) return json({ error: "Please select a subscription plan." }, 400);

      const plan = await fetchPlan(env, body.plan_id);
      if (!plan) return json({ error: "The selected plan is not available." }, 400);

      const darajaEnv: DarajaEnv = {
        DARAJA_CONSUMER_KEY: env.DARAJA_CONSUMER_KEY,
        DARAJA_CONSUMER_SECRET: env.DARAJA_CONSUMER_SECRET,
        DARAJA_SHORTCODE: env.DARAJA_SHORTCODE,
        DARAJA_PASSKEY: env.DARAJA_PASSKEY,
        DARAJA_ENV: env.DARAJA_ENV,
        DARAJA_CALLBACK_URL: env.DARAJA_CALLBACK_URL,
      };

      const accessToken = await getDarajaAccessToken(darajaEnv);
      const result = await stkPush(darajaEnv, accessToken, {
        phoneNumber: phone,
        amount: plan.price_ksh,
        accountReference: "AccaForge Premium",
        transactionDesc: `Premium subscription - ${plan.name}`,
        callbackUrl: env.DARAJA_CALLBACK_URL,
      });

      if (!result.success || !result.checkoutRequestId) {
        return json({ error: result.errorMessage || "Could not send the M-Pesa payment prompt. Please try again." }, 502);
      }

      await createPayment(env, {
        checkout_request_id: result.checkoutRequestId,
        member_phone: phone,
        plan_id: plan.id,
        amount_ksh: plan.price_ksh,
      });

      return json({
        checkout_request_id: result.checkoutRequestId,
        message: "Check your phone for the M-Pesa payment prompt. Enter your M-Pesa PIN to complete the subscription.",
      });
    }

    if (path === "/api/premium/callback") {
      const raw = await request.json();
      const parsed = parseStkCallback(raw);

      const payment = await fetchPaymentByCheckout(env, parsed.checkoutRequestId);
      if (!payment) return json({ ok: true });

      if (parsed.success) {
        await updatePayment(env, parsed.checkoutRequestId, {
          status: "success",
          mpesa_receipt: parsed.mpesaReceipt,
          result_code: parsed.resultCode,
          result_desc: parsed.resultDesc,
          callback_received: true,
        });

        const plan = await fetchPlan(env, payment.plan_id);
        if (plan) {
          await upsertMember(env, payment.member_phone, payment.plan_id, plan.duration_days);
        }
      } else {
        const status = parsed.resultCode === 1032 ? "cancelled" : parsed.resultCode === 1037 ? "timeout" : "failed";
        await updatePayment(env, parsed.checkoutRequestId, {
          status,
          result_code: parsed.resultCode,
          result_desc: parsed.resultDesc,
          callback_received: true,
        });
      }

      return json({ ok: true });
    }

    return json({ error: "Not found." }, 404);
  } catch (error) {
    console.error("Premium API error:", error);
    return json({ error: "Something went wrong. Please try again." }, 500);
  }
};

export const onRequestGet = async ({ request, env }: { request: Request; env: PremiumEnv }) => {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/$/, "");

  try {
    if (path === "/api/premium/me") {
      const token = getSessionToken(request);
      if (!token) return json({ member: null });
      const member = await fetchMemberByToken(env, token);
      if (!member) return json({ member: null });
      const isActive = member.status === "active" && member.expires_at && new Date(member.expires_at).getTime() > Date.now();
      return json({
        member: {
          phone: member.phone,
          status: isActive ? "active" : member.status,
          expires_at: member.expires_at,
          is_premium: isActive,
        },
      });
    }

    const statusMatch = path.match(/^\/api\/premium\/status\/(.+)$/);
    if (statusMatch) {
      const checkoutRequestId = decodeURIComponent(statusMatch[1]);
      const payment = await fetchPaymentByCheckout(env, checkoutRequestId);
      if (!payment) return json({ error: "Payment not found." }, 404);

      let memberSession: { session_token: string; expires_at: string } | null = null;
      if (payment.status === "success") {
        const plan = await fetchPlan(env, payment.plan_id);
        if (plan) {
          memberSession = await upsertMember(env, payment.member_phone, payment.plan_id, plan.duration_days);
        }
      }

      return json({
        status: payment.status,
        session_token: memberSession?.session_token || null,
        expires_at: memberSession?.expires_at || null,
      });
    }

    if (path === "/api/premium/plans") {
      const res = await supabaseFetch(env, "/rest/v1/subscription_plans?is_active=eq.true&order=sort_order.asc&select=id,name,price_ksh,duration_days,description,features");
      if (!res.ok) return json({ plans: [] });
      const plans = await res.json();
      return json({ plans });
    }

    return json({ error: "Not found." }, 404);
  } catch (error) {
    console.error("Premium API error:", error);
    return json({ error: "Something went wrong." }, 500);
  }
};
