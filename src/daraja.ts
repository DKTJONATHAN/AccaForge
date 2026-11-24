/**
 * Daraja 3.0 M-Pesa API integration helpers.
 * All calls run server-side (Cloudflare Worker or Supabase Edge Function).
 * Secret keys are read from environment variables and never reach the browser.
 */

export interface DarajaEnv {
  DARAJA_CONSUMER_KEY: string;
  DARAJA_CONSUMER_SECRET: string;
  DARAJA_SHORTCODE: string;
  DARAJA_PASSKEY: string;
  DARAJA_ENV?: string;
  DARAJA_CALLBACK_URL: string;
}

export type DarajaEnvironment = "sandbox" | "production";

const SANDBOX_BASE = "https://sandbox.safaricom.co.ke";
const PRODUCTION_BASE = "https://api.safaricom.co.ke";

export function darajaBaseUrl(env: DarajaEnv): string {
  return env.DARAJA_ENV === "production" ? PRODUCTION_BASE : SANDBOX_BASE;
}

export function timestampNow(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    now.getUTCFullYear().toString() +
    pad(now.getUTCMonth() + 1) +
    pad(now.getUTCDate()) +
    pad(now.getUTCHours()) +
    pad(now.getUTCMinutes()) +
    pad(now.getUTCSeconds())
  );
}

export function generatePassword(shortcode: string, passkey: string, timestamp: string): string {
  const raw = shortcode + passkey + timestamp;
  return btoa(raw);
}

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  errorMessage?: string;
}

export async function getDarajaAccessToken(env: DarajaEnv): Promise<string> {
  const base = darajaBaseUrl(env);
  const url = `${base}/oauth/v1/generate?grant_type=client_credentials`;
  const credentials = btoa(`${env.DARAJA_CONSUMER_KEY}:${env.DARAJA_CONSUMER_SECRET}`);
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Basic ${credentials}`,
    },
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Daraja OAuth failed (${response.status}): ${text}`);
  }
  const data: TokenResponse = await response.json();
  if (!data.access_token) {
    throw new Error("Daraja OAuth returned no access token");
  }
  return data.access_token;
}

export interface StkPushParams {
  phoneNumber: string;
  amount: number;
  accountReference: string;
  transactionDesc: string;
  callbackUrl: string;
}

interface StkPushResponse {
  errorMessage?: string;
  ResponseDescription?: string;
  ResponseCode?: string;
  CheckoutRequestID?: string;
  MerchantRequestID?: string;
}

export interface StkPushResult {
  success: boolean;
  checkoutRequestId?: string;
  merchantRequestId?: string;
  responseCode?: string;
  responseDescription?: string;
  errorMessage?: string;
}

export async function stkPush(env: DarajaEnv, accessToken: string, params: StkPushParams): Promise<StkPushResult> {
  const base = darajaBaseUrl(env);
  const timestamp = timestampNow();
  const password = generatePassword(env.DARAJA_SHORTCODE, env.DARAJA_PASSKEY, timestamp);
  const body = {
    BusinessShortCode: env.DARAJA_SHORTCODE,
    Password: password,
    Timestamp: timestamp,
    TransactionType: "CustomerPayBillOnline",
    Amount: params.amount,
    PartyA: params.phoneNumber,
    PartyB: env.DARAJA_SHORTCODE,
    PhoneNumber: params.phoneNumber,
    CallBackURL: params.callbackUrl,
    AccountReference: params.accountReference,
    TransactionDesc: params.transactionDesc,
  };
  const response = await fetch(`${base}/mpesa/stkpush/v1/processrequest`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({})) as StkPushResponse;
  if (!response.ok) {
    return {
      success: false,
      errorMessage: data.errorMessage || data.ResponseDescription || `STK push failed (${response.status})`,
    };
  }
  if (data.ResponseCode === "0") {
    return {
      success: true,
      checkoutRequestId: data.CheckoutRequestID,
      merchantRequestId: data.MerchantRequestID,
      responseCode: data.ResponseCode,
      responseDescription: data.ResponseDescription,
    };
  }
  return {
    success: false,
    errorMessage: data.errorMessage || data.ResponseDescription || "STK push was not accepted",
    responseCode: data.ResponseCode,
    responseDescription: data.ResponseDescription,
  };
}

export interface StkCallbackBody {
  Body: {
    stkCallback: {
      MerchantRequestID: string;
      CheckoutRequestID: string;
      ResultCode: number;
      ResultDesc: string;
      CallbackMetadata?: {
        Item: Array<{ Name: string; Value: string | number }>;
      };
    };
  };
}

export interface ParsedCallback {
  checkoutRequestId: string;
  resultCode: number;
  resultDesc: string;
  success: boolean;
  amount?: number;
  mpesaReceipt?: string;
  phoneNumber?: string;
}

export function parseStkCallback(raw: unknown): ParsedCallback {
  const body = raw as StkCallbackBody;
  const cb = body?.Body?.stkCallback;
  if (!cb) throw new Error("Invalid STK callback structure");
  const metadata = cb.CallbackMetadata?.Item || [];
  const findItem = (name: string): string | number | undefined =>
    metadata.find((item) => item.Name === name)?.Value;
  return {
    checkoutRequestId: cb.CheckoutRequestID,
    resultCode: cb.ResultCode,
    resultDesc: cb.ResultDesc,
    success: cb.ResultCode === 0,
    amount: findItem("Amount") as number | undefined,
    mpesaReceipt: findItem("MpesaReceiptNumber") as string | undefined,
    phoneNumber: findItem("PhoneNumber") as string | undefined,
  };
}

export function normalizePhone(input: string): string | null {
  let phone = input.replace(/[\s\-()]/g, "");
  if (phone.startsWith("+")) phone = phone.slice(1);
  if (phone.startsWith("0")) phone = "254" + phone.slice(1);
  if (phone.startsWith("7") && phone.length === 9) phone = "254" + phone;
  if (!/^2547\d{8}$/.test(phone) && !/^2541\d{8}$/.test(phone)) return null;
  return phone;
}


export interface StkQueryResult {
  responseCode?: string;
  responseDescription?: string;
  resultCode?: number;
  resultDescription?: string;
  checkoutRequestId?: string;
  merchantRequestId?: string;
}

export async function queryStkStatus(
  env: DarajaEnv,
  accessToken: string,
  checkoutRequestId: string,
): Promise<StkQueryResult> {
  const timestamp = timestampNow();
  const password = generatePassword(env.DARAJA_SHORTCODE, env.DARAJA_PASSKEY, timestamp);
  const response = await fetch(`${darajaBaseUrl(env)}/mpesa/stkpushquery/v1/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      BusinessShortCode: env.DARAJA_SHORTCODE,
      Password: password,
      Timestamp: timestamp,
      CheckoutRequestID: checkoutRequestId,
    }),
  });
  const data = await response.json().catch(() => ({})) as {
    ResponseCode?: string;
    ResponseDescription?: string;
    ResultCode?: string | number;
    ResultDesc?: string;
    CheckoutRequestID?: string;
    MerchantRequestID?: string;
  };
  if (!response.ok || data.ResponseCode !== "0") {
    throw new Error(data.ResponseDescription || `Daraja STK query failed (${response.status})`);
  }
  const resultCode = data.ResultCode === undefined ? undefined : Number(data.ResultCode);
  return {
    responseCode: data.ResponseCode,
    responseDescription: data.ResponseDescription,
    resultCode: Number.isFinite(resultCode) ? resultCode : undefined,
    resultDescription: data.ResultDesc,
    checkoutRequestId: data.CheckoutRequestID,
    merchantRequestId: data.MerchantRequestID,
  };
}
