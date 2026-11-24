/**
 * Premium subscription API.
 * A Daraja callback is untrusted until the matching STK transaction is queried
 * directly with Safaricom and its callback amount, phone and receipt match the
 * immutable payment intent. Subscription activation is atomic and idempotent
 * inside Postgres (finalize_premium_payment).
 */
import {
  getDarajaAccessToken,
  stkPush,
  parseStkCallback,
  normalizePhone,
  queryStkStatus,
  type DarajaEnv,
} from "../../src/daraja";

interface PremiumEnv {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  DARAJA_CONSUMER_KEY: string;
  DARAJA_CONSUMER_SECRET: string;
  DARAJA_SHORTCODE: string;
  DARAJA_TILL_NUMBER: string;
  DARAJA_PASSKEY: string;
  DARAJA_ENV: string;
  DARAJA_CALLBACK_URL: string;
}
interface Plan { id: string; name: string; price_ksh: number; duration_days: number }
interface Payment {
  status: string;
  member_phone: string;
  plan_id: string;
  amount_ksh: number;
  poll_token_hash: string | null;
  session_token: string | null;
  expires_at: string | null;
  result_code?: number | null;
  result_desc?: string | null;
}
const json = (body: unknown, status = 200, extra: Record<string, string> = {}) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...extra },
});
const supabaseFetch = (env: PremiumEnv, path: string, options: RequestInit = {}) => {
  const apiKey = env.SUPABASE_SERVICE_ROLE_KEY;
  // New sb_secret_* keys are opaque API keys, not JWTs. They must be sent
  // only through apikey; putting one in Authorization makes Supabase reject
  // the request as an invalid JWT. Keep Bearer auth for legacy service_role JWTs.
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");
  headers.set("apikey", apiKey);
  if (apiKey.startsWith("sb_secret_")) headers.delete("Authorization");
  else headers.set("Authorization", `Bearer ${apiKey}`);
  return fetch(`${env.SUPABASE_URL}${path}`, { ...options, headers });
};
const darajaEnv = (env: PremiumEnv): DarajaEnv => ({
  DARAJA_CONSUMER_KEY: env.DARAJA_CONSUMER_KEY,
  DARAJA_CONSUMER_SECRET: env.DARAJA_CONSUMER_SECRET,
  DARAJA_SHORTCODE: env.DARAJA_SHORTCODE,
  DARAJA_PASSKEY: env.DARAJA_PASSKEY,
  DARAJA_ENV: env.DARAJA_ENV,
  DARAJA_CALLBACK_URL: env.DARAJA_CALLBACK_URL,
});
async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}
async function safeEqualToken(token: string, expectedHash: string): Promise<boolean> {
  const actualHash = await sha256(token);
  if (!/^[a-f0-9]{64}$/i.test(expectedHash)) return false;
  let diff = 0;
  for (let i = 0; i < actualHash.length; i++) diff |= actualHash.charCodeAt(i) ^ expectedHash.charCodeAt(i);
  return diff === 0;
}
async function fetchPlan(env: PremiumEnv, id: string): Promise<Plan | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const res = await supabaseFetch(env, `/rest/v1/subscription_plans?id=eq.${id}&is_active=eq.true&select=id,name,price_ksh,duration_days`);
  if (!res.ok) throw new Error("Could not load subscription plan.");
  const rows = await res.json() as Plan[];
  return rows[0] || null;
}
async function fetchPayment(env: PremiumEnv, checkoutId: string): Promise<Payment | null> {
  const res = await supabaseFetch(env, `/rest/v1/payments?checkout_request_id=eq.${encodeURIComponent(checkoutId)}&select=status,member_phone,plan_id,amount_ksh,poll_token_hash,session_token,expires_at,result_code,result_desc`);
  if (!res.ok) throw new Error("Could not load payment.");
  const rows = await res.json() as Payment[];
  return rows[0] || null;
}
async function createPayment(env: PremiumEnv, data: {
  checkout_request_id: string; member_phone: string; plan_id: string; amount_ksh: number; poll_token_hash: string;
}): Promise<void> {
  const res = await supabaseFetch(env, "/rest/v1/payments", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ ...data, status: "pending" }),
  });
  if (!res.ok) throw new Error("Could not persist payment intent.");
}
async function verifyAndActivate(
  env: PremiumEnv,
  checkoutId: string,
  callback?: { amount?: number; phoneNumber?: string; mpesaReceipt?: string; resultCode: number; resultDesc: string },
  pollToken?: string,
): Promise<void> {
  const payment = await fetchPayment(env, checkoutId);
  if (!payment || payment.status !== "pending") return;
  // Browser verification requires the unguessable token returned with this payment.
  if (pollToken && (!payment.poll_token_hash || !(await safeEqualToken(pollToken, payment.poll_token_hash)))) return;
  // When callback metadata is available, cross-check all three values against
  // the immutable STK intent. Without a callback, STK Query is still bound to
  // the checkout created with the stored amount and phone number.
  if (callback?.resultCode === 0 && (!callback.mpesaReceipt ||
      callback.amount !== payment.amount_ksh ||
      normalizePhone(String(callback.phoneNumber || "")) !== payment.member_phone)) return;
  if (!callback && !pollToken) return;

  const token = await getDarajaAccessToken(darajaEnv(env));
  const result = await queryStkStatus(darajaEnv(env), token, checkoutId);
  if (result.checkoutRequestId && result.checkoutRequestId !== checkoutId) return;
  if (result.resultCode === undefined) return;
  if (result.resultCode !== 0) {
    const status = result.resultCode === 1032 ? "cancelled" : result.resultCode === 1037 ? "timeout" : "failed";
    await supabaseFetch(env, `/rest/v1/payments?checkout_request_id=eq.${encodeURIComponent(checkoutId)}&status=eq.pending`, {
      method: "PATCH",
      body: JSON.stringify({ status, result_code: result.resultCode, result_desc: result.resultDescription || "Safaricom confirmed the payment did not complete.", callback_received: !!callback, updated_at: new Date().toISOString() }),
    });
    return;
  }
  // A failed callback alone cannot settle a payment. If STK Query reports success,
  // let the authenticated browser verification path complete settlement.
  if (callback && callback.resultCode !== 0) return;

  const res = await supabaseFetch(env, "/rest/v1/rpc/finalize_premium_payment", {
    method: "POST",
    body: JSON.stringify({
      p_checkout_request_id: checkoutId,
      p_amount_ksh: callback?.amount ?? payment.amount_ksh,
      p_member_phone: callback ? normalizePhone(String(callback.phoneNumber)) : payment.member_phone,
      p_mpesa_receipt: callback?.mpesaReceipt ?? null,
      p_result_code: result.resultCode,
      p_result_desc: result.resultDescription || callback?.resultDesc || "Safaricom STK Query confirmed payment.",
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error("Premium activation rejected:", res.status, detail.slice(0, 300));
  }
}
function sessionToken(request: Request): string | null {
  const auth = request.headers.get("Authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice(7).trim();
  const cookie = request.headers.get("Cookie") || "";
  const match = cookie.match(/(?:^|;\s*)accaforge_premium=([a-f0-9]{64})/i);
  return match?.[1] || null;
}
function validOrigin(request: Request): boolean {
  const origin = request.headers.get("Origin");
  if (!origin) return true; // provider callbacks do not send browser Origin
  try { return new URL(origin).host === new URL(request.url).host; } catch { return false; }
}

export const onRequestPost = async ({ request, env }: { request: Request; env: PremiumEnv }) => {
  const path = new URL(request.url).pathname.replace(/\/$/, "");
  if (!validOrigin(request)) return json({ error: "Invalid request origin." }, 403);
  let subscribeStage = "request";
  try {
    if (path === "/api/premium/subscribe") {
      const requiredConfig = [
        "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY",
        "DARAJA_CONSUMER_KEY", "DARAJA_CONSUMER_SECRET",
        "DARAJA_SHORTCODE", "DARAJA_TILL_NUMBER", "DARAJA_PASSKEY", "DARAJA_CALLBACK_URL",
      ] as const;
      const missingConfig = requiredConfig.filter((key) =>
        !String((env as unknown as Record<string, unknown>)[key] ?? "").trim()
      );
      if (missingConfig.length) {
        console.error("Premium subscribe configuration missing:", missingConfig.join(", "));
        return json({
          error: "Payment service is not fully configured.",
          code: "PREMIUM_CONFIG_MISSING",
          missing: missingConfig,
        }, 503);
      }
      subscribeStage = "request_validation";
      const body = await request.json() as { phone?: string; plan_id?: string };
      const phone = body.phone ? normalizePhone(body.phone) : null;
      if (!phone) return json({ error: "Enter a valid Safaricom phone number." }, 400);
      if (!body.plan_id) return json({ error: "Select a subscription plan." }, 400);
      subscribeStage = "plan_lookup";
      const plan = await fetchPlan(env, body.plan_id);
      if (!plan || !Number.isInteger(plan.price_ksh) || plan.price_ksh < 1 || plan.duration_days < 1)
        return json({ error: "The selected plan is unavailable." }, 400);
      subscribeStage = "recent_attempt_check";
      const recent = await supabaseFetch(env, `/rest/v1/payments?member_phone=eq.${phone}&created_at=gte.${encodeURIComponent(new Date(Date.now() - 15 * 60_000).toISOString())}&select=id&limit=4`);
      if (!recent.ok) throw new Error("Could not check recent payment attempts.");
      const recentAttempts = await recent.json() as Array<{ id: string }>;
      if (recentAttempts.length >= 3) return json({ error: "Too many payment attempts. Please wait 15 minutes before trying again." }, 429);

      subscribeStage = "daraja_oauth";
      const token = await getDarajaAccessToken(darajaEnv(env));
      subscribeStage = "stk_push";
      const pushed = await stkPush(darajaEnv(env), token, {
        phoneNumber: phone,
        amount: plan.price_ksh,
        accountReference: "AccaForge Premium",
        transactionDesc: `Premium subscription - ${plan.name}`,
        callbackUrl: env.DARAJA_CALLBACK_URL,
        tillNumber: env.DARAJA_TILL_NUMBER,
      });
      if (!pushed.success || !pushed.checkoutRequestId) {
        console.error("Premium STK push rejected:", {
          responseCode: pushed.responseCode || "not_provided",
          responseDescription: pushed.responseDescription || pushed.errorMessage || "No provider description",
        });
        return json({
          error: pushed.errorMessage || "Could not send the M-Pesa prompt.",
          code: "PREMIUM_SUBSCRIBE_STK_PUSH_REJECTED",
          provider_code: pushed.responseCode || null,
        }, 502);
      }

      subscribeStage = "payment_persistence";
      const pollToken = crypto.randomUUID() + crypto.randomUUID();
      await createPayment(env, {
        checkout_request_id: pushed.checkoutRequestId,
        member_phone: phone,
        plan_id: plan.id,
        amount_ksh: plan.price_ksh,
        poll_token_hash: await sha256(pollToken),
      });
      subscribeStage = "complete";
      return json({
        checkout_request_id: pushed.checkoutRequestId,
        poll_token: pollToken,
        message: "Check your phone for the M-Pesa prompt and enter your PIN.",
      });
    }

    if (path === "/api/premium/verify") {
      const body = await request.json() as { checkout_request_id?: string; poll_token?: string };
      if (!body.checkout_request_id || !body.poll_token || body.poll_token.length < 40) {
        return json({ error: "Invalid payment verification request." }, 400);
      }
      await verifyAndActivate(env, body.checkout_request_id, undefined, body.poll_token);
      return json({ ok: true });
    }

    if (path === "/api/premium/callback") {
      const raw = await request.json();
      const parsed = parseStkCallback(raw);
      // A forged callback cannot activate access: the payment is independently
      // queried with Safaricom and all callback metadata must match the intent.
      await verifyAndActivate(env, parsed.checkoutRequestId, parsed);
      return json({ ok: true });
    }
    return json({ error: "Not found." }, 404);
  } catch (error) {
    console.error("Premium API error:", subscribeStage, error instanceof Error ? error.message : "unknown");
    if (path === "/api/premium/subscribe") {
      return json({
        error: "Payment service is temporarily unavailable. Please try again.",
        code: `PREMIUM_SUBSCRIBE_${subscribeStage.toUpperCase()}_FAILED`,
      }, 502);
    }
    return json({ error: "Payment service is temporarily unavailable. Please try again." }, 500);
  }
};

export const onRequestGet = async ({ request, env }: { request: Request; env: PremiumEnv }) => {
  const path = new URL(request.url).pathname.replace(/\/$/, "");
  try {
    if (path === "/api/premium/me") {
      const token = sessionToken(request);
      if (!token || token.length > 256) return json({ member: null });
      const res = await supabaseFetch(env, `/rest/v1/members?session_token=eq.${encodeURIComponent(token)}&select=phone,status,expires_at`);
      if (!res.ok) throw new Error("Could not load member.");
      const rows = await res.json() as Array<{ phone: string; status: string; expires_at: string | null }>;
      const member = rows[0];
      const active = !!member && member.status === "active" && !!member.expires_at && Date.parse(member.expires_at) > Date.now();
      const maxAge = active && member?.expires_at ? Math.max(0, Math.floor((Date.parse(member.expires_at) - Date.now()) / 1000)) : 0;
      const cookie = active
        ? `accaforge_premium=${token}; Max-Age=${maxAge}; Path=/; HttpOnly; Secure; SameSite=Lax`
        : "accaforge_premium=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax";
      return json({ member: member ? {
        phone: member.phone,
        status: active ? "active" : "expired",
        expires_at: member.expires_at,
        is_premium: active,
      } : null }, 200, { "Set-Cookie": cookie });
    }

    const statusMatch = path.match(/^\/api\/premium\/status\/([A-Za-z0-9_-]{8,160})$/);
    if (statusMatch) {
      const checkoutId = statusMatch[1];
      const pollToken = new URL(request.url).searchParams.get("token") || "";
      if (pollToken.length < 40 || pollToken.length > 256) return json({ error: "Payment not found." }, 404);
      const payment = await fetchPayment(env, checkoutId);
      if (!payment || !payment.poll_token_hash || !(await safeEqualToken(pollToken, payment.poll_token_hash))) {
        return json({ error: "Payment not found." }, 404);
      }
      return json({
        status: payment.status,
        result_code: payment.result_code ?? null,
        result_desc: payment.result_desc ?? null,
        session_token: payment.status === "success" ? payment.session_token : null,
        expires_at: payment.status === "success" ? payment.expires_at : null,
      });
    }

    if (path === "/api/premium/plans") {
      // Return safe diagnostic codes so configuration and upstream failures can
      // be distinguished without exposing credentials or raw provider responses.
      const missing = [
        !env.SUPABASE_URL?.trim() ? "SUPABASE_URL" : null,
        !env.SUPABASE_SERVICE_ROLE_KEY?.trim() ? "SUPABASE_SERVICE_ROLE_KEY" : null,
      ].filter((name): name is string => !!name);
      if (missing.length) {
        console.error("Premium plans configuration missing:", missing.join(", "));
        return json({ error: "Premium service is temporarily unavailable.", code: "PREMIUM_CONFIG_MISSING", missing }, 503);
      }

      let supabaseUrl: URL;
      try {
        supabaseUrl = new URL(env.SUPABASE_URL);
      } catch {
        console.error("Premium plans configuration has an invalid SUPABASE_URL.");
        return json({ error: "Premium service is temporarily unavailable.", code: "PREMIUM_CONFIG_INVALID" }, 503);
      }
      if (supabaseUrl.protocol !== "https:" || !supabaseUrl.hostname.endsWith(".supabase.co")) {
        console.error("Premium plans configuration has an unsupported SUPABASE_URL host.");
        return json({ error: "Premium service is temporarily unavailable.", code: "PREMIUM_CONFIG_INVALID" }, 503);
      }

      let res: Response;
      try {
        res = await supabaseFetch(env, "/rest/v1/subscription_plans?is_active=eq.true&order=sort_order.asc&select=id,name,price_ksh,duration_days,description,features");
      } catch (error) {
        console.error("Premium plans Supabase network error:", error instanceof Error ? error.message : "unknown");
        return json({ error: "Premium service is temporarily unavailable.", code: "SUPABASE_NETWORK_ERROR" }, 503);
      }
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        console.error("Premium plans Supabase response:", res.status, detail.slice(0, 300));
        return json({ error: "Premium service is temporarily unavailable.", code: `SUPABASE_HTTP_${res.status}` }, 503);
      }
      try {
        return json({ plans: await res.json() });
      } catch {
        console.error("Premium plans Supabase response was not valid JSON.");
        return json({ error: "Premium service is temporarily unavailable.", code: "SUPABASE_INVALID_RESPONSE" }, 503);
      }
    }
    return json({ error: "Not found." }, 404);
  } catch (error) {
    console.error("Premium API read error:", error instanceof Error ? error.message : "unknown");
    return json({ error: "Premium service is temporarily unavailable." }, 500);
  }
};
