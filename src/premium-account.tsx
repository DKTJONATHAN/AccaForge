import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, AlertCircle, CheckCircle2, Clock3, Crown, Download, KeyRound, Loader2, LogIn, LogOut, Mail, ShieldCheck, Smartphone, UserRound, UserPlus } from "lucide-react";
import type { SubscriptionPlan } from "./types";

type AuthConfig = { supabase_url: string; supabase_anon_key: string };
type AuthSession = { access_token: string; refresh_token: string; expires_at?: number; user?: { id: string; email?: string; phone?: string } };
type PremiumPrediction = {
  id: string; publication_date: string; market_key: string; market_name: string;
  selection_name: string; odds: number; bookmaker: string; estimated_probability: number;
  confidence_score: number; reasoning: string; status: string; result: string | null;
  fixture: { competition: string; commence_time: string; home_team: string; away_team: string; fixture_status: string } | null;
};
type AccountData = {
  account: { id: string; email: string | null; display_name: string; avatar_url: string | null };
  verified_phones: string[];
  subscriptions: Array<{ id: string; plan_id: string; phone: string; status: string; starts_at: string; expires_at: string; auto_renew_enabled: boolean }>;
  payments: Array<{ id: string; plan_id: string; amount_ksh: number; status: string; mpesa_receipt: string | null; result_desc: string | null; created_at: string; expires_at: string | null }>;
  entitlement: { is_premium: boolean; expires_at: string | null; plan_id: string | null };
};
const STORAGE_KEY = "accaforge-auth-session";
const VERIFIER_KEY = "accaforge-google-pkce";
const readSession = (): AuthSession | null => {
  try { const value = localStorage.getItem(STORAGE_KEY); return value ? JSON.parse(value) as AuthSession : null; } catch { return null; }
};
const writeSession = (value: AuthSession | null) => {
  try { if (value) localStorage.setItem(STORAGE_KEY, JSON.stringify(value)); else localStorage.removeItem(STORAGE_KEY); } catch { /* storage may be unavailable */ }
};
const base64Url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
const makeVerifier = () => base64Url(crypto.getRandomValues(new Uint8Array(48)));
const makeChallenge = async (value: string) => base64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))));
const normalizeKenyanPhone = (value: string) => {
  const digits = value.replace(/\D/g, "");
  const phone = digits.startsWith("0") ? "254" + digits.slice(1) : digits.startsWith("254") ? digits : digits;
  return /^254[17]\d{8}$/.test(phone) ? "+" + phone : null;
};
async function downloadReceipt(payment: AccountData["payments"][number], email: string | null) {
  const content = [
    "ACCAFORGE PREMIUM PAYMENT RECEIPT",
    "---------------------------------",
    "Account: " + (email || "AccaForge member"),
    "Amount: KES " + payment.amount_ksh,
    "Status: " + payment.status.toUpperCase(),
    "M-PESA receipt: " + (payment.mpesa_receipt || "Pending confirmation"),
    "Payment date: " + new Date(payment.created_at).toLocaleString("en-KE", { timeZone: "Africa/Nairobi" }),
    "Reference: " + payment.id,
    "",
    "This receipt confirms the payment record held by AccaForge. Keep your M-PESA message as the provider-issued proof of payment."
  ].join("\n");
  const url = URL.createObjectURL(new Blob([content], { type: "text/plain;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "accaforge-receipt-" + payment.id.slice(0, 8) + ".txt";
  link.click();
  URL.revokeObjectURL(url);
}
export default function PremiumAccountPanel({ plans, plansLoading }: { plans: SubscriptionPlan[]; plansLoading: boolean }) {
  const [config, setConfig] = useState<AuthConfig | null>(null);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [account, setAccount] = useState<AccountData | null>(null);
  const [predictions, setPredictions] = useState<PremiumPrediction[]>([]);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [planId, setPlanId] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [checkout, setCheckout] = useState<{ id: string; token: string } | null>(null);
  const [checkoutState, setCheckoutState] = useState<"idle" | "waiting" | "success">("idle");
  const selectedPlan = useMemo(() => plans.find(plan => plan.id === planId) || plans[0], [plans, planId]);

  const authRequest = useCallback(async (path: string, method = "GET", body?: unknown, token?: string) => {
    if (!config) throw new Error("Authentication is still loading.");
    const response = await fetch(config.supabase_url + path, {
      method, headers: { apikey: config.supabase_anon_key, "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    const data = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok) throw new Error(String(data.msg || data.message || data.error_description || data.error || "Authentication request failed."));
    return data;
  }, [config]);

  const accountRequest = useCallback(async (path: string, method = "GET", body?: unknown) => {
    if (!session?.access_token) throw new Error("Sign in to continue.");
    const response = await fetch(path, { method, headers: { Authorization: "Bearer " + session.access_token, "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const data = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok) throw new Error(String(data.error || "Could not load your Premium account."));
    return data;
  }, [session]);

  const loadAccount = useCallback(async () => {
    if (!session?.access_token) { setAccount(null); return; }
    const data = await accountRequest("/api/premium/account/me") as unknown as AccountData;
    setAccount(data);
    if (data.entitlement.is_premium) {
      const premiumData = await accountRequest("/api/premium/account/predictions") as { predictions?: PremiumPrediction[] };
      setPredictions(premiumData.predictions || []);
    } else {
      setPredictions([]);
    }
    if (!displayName && data.account.display_name) setDisplayName(data.account.display_name);
    if (!phone && data.verified_phones[0]) setPhone(data.verified_phones[0]);
  }, [accountRequest, session, phone, displayName]);



  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const configResponse = await fetch("/api/premium/account/config");
        const cfg = await configResponse.json() as AuthConfig & { error?: string };
        if (!configResponse.ok) throw new Error(cfg.error || "Authentication configuration is unavailable.");
        if (!active) return;
        setConfig(cfg);
        const url = new URL(window.location.href);
        const code = url.searchParams.get("code");
        if (code) {
          const verifier = sessionStorage.getItem(VERIFIER_KEY);
          if (!verifier) throw new Error("Google sign-in expired. Please try again.");
          const exchanged = await fetch(cfg.supabase_url + "/auth/v1/token?grant_type=pkce", {
            method: "POST", headers: { apikey: cfg.supabase_anon_key, "Content-Type": "application/json" },
            body: JSON.stringify({ auth_code: code, code_verifier: verifier })
          });
          const result = await exchanged.json() as AuthSession & { msg?: string };
          if (!exchanged.ok || !result.access_token) throw new Error(result.msg || "Google sign-in could not be completed.");
          writeSession(result); sessionStorage.removeItem(VERIFIER_KEY); url.searchParams.delete("code"); window.history.replaceState({}, "", url.toString());
          if (active) setSession(result);
        } else {
          const saved = readSession();
          if (saved) {
            const check = await fetch(cfg.supabase_url + "/auth/v1/user", { headers: { apikey: cfg.supabase_anon_key, Authorization: "Bearer " + saved.access_token } });
            if (check.ok) {
              if (active) setSession(saved);
            } else if (saved.refresh_token) {
              const refreshed = await fetch(cfg.supabase_url + "/auth/v1/token?grant_type=refresh_token", {
                method: "POST", headers: { apikey: cfg.supabase_anon_key, "Content-Type": "application/json" },
                body: JSON.stringify({ refresh_token: saved.refresh_token })
              });
              const next = await refreshed.json() as AuthSession;
              if (refreshed.ok && next.access_token) { writeSession(next); if (active) setSession(next); }
              else { writeSession(null); if (active) setSession(null); }
            } else { writeSession(null); if (active) setSession(null); }
          }
        }
      } catch (e) { if (active) setError(e instanceof Error ? e.message : "Authentication could not be initialized."); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!session?.access_token) { setAccount(null); return; }
    let active = true;
    loadAccount().catch(e => { if (active) setError(e instanceof Error ? e.message : "Could not load your account."); });
    return () => { active = false; };
  }, [session, loadAccount]);

  useEffect(() => {
    if (!checkout || checkoutState !== "waiting") return;
    let active = true;
    const poll = async () => {
      try {
        await fetch("/api/premium/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ checkout_request_id: checkout.id, poll_token: checkout.token }) });
        const response = await fetch("/api/premium/status/" + encodeURIComponent(checkout.id) + "?token=" + encodeURIComponent(checkout.token));
        const result = await response.json() as { status?: string };
        if (!active) return;
        if (result.status === "success") { setCheckoutState("success"); await loadAccount(); }
        else if (["failed", "cancelled", "timeout"].includes(result.status || "")) {
          setError("M-PESA did not complete this payment. Check your balance and try again.");
          setCheckoutState("idle"); setCheckout(null);
        }
      } catch { /* Retry until Daraja confirms a terminal status. */ }
    };
    const timer = window.setInterval(poll, 6500); void poll();
    return () => { active = false; window.clearInterval(timer); };
  }, [checkout, checkoutState, loadAccount]);

  const signIn = async () => {
    setBusy(true); setError(""); setNotice("");
    try {
      const data = await authRequest("/auth/v1/token?grant_type=password", "POST", { email: email.trim(), password }) as unknown as AuthSession;
      if (!data.access_token) throw new Error("Email or password was not accepted.");
      writeSession(data); setSession(data); setPassword("");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not sign in."); }
    finally { setBusy(false); }
  };
  const signUp = async () => {
    setBusy(true); setError(""); setNotice("");
    try {
      const data = await authRequest("/auth/v1/signup", "POST", { email: email.trim(), password }) as unknown as AuthSession;
      if (data.access_token) { writeSession(data); setSession(data); setPassword(""); }
      else setNotice("Check your email for the confirmation link, then return here to sign in.");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not create your account."); }
    finally { setBusy(false); }
  };
  const googleSignIn = async () => {
    if (!config) return;
    setBusy(true); setError("");
    try {
      const verifier = makeVerifier(); sessionStorage.setItem(VERIFIER_KEY, verifier);
      const challenge = await makeChallenge(verifier);
      const redirect = window.location.origin + "/premium";
      const target = new URL(config.supabase_url + "/auth/v1/authorize");
      target.searchParams.set("provider", "google"); target.searchParams.set("redirect_to", redirect); target.searchParams.set("apikey", config.supabase_anon_key);
      target.searchParams.set("code_challenge", challenge); target.searchParams.set("code_challenge_method", "s256");
      window.location.assign(target.toString());
    } catch (e) { setBusy(false); setError(e instanceof Error ? e.message : "Google sign-in could not start."); }
  };
  const saveProfile = async () => {
    if (!config || !session?.access_token || !account) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(config.supabase_url + "/rest/v1/profiles?id=eq." + encodeURIComponent(account.account.id), {
        method: "PATCH",
        headers: { apikey: config.supabase_anon_key, Authorization: "Bearer " + session.access_token, "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify({ display_name: displayName.trim() || null })
      });
      if (!response.ok) throw new Error("Could not update your account profile.");
      setNotice("Your profile has been updated.");
      await loadAccount();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save profile."); }
    finally { setBusy(false); }
  };
  const signOut = async () => {
    try { if (session?.access_token) await authRequest("/auth/v1/logout", "POST", undefined, session.access_token); } catch { /* local sign-out still proceeds */ }
    writeSession(null); setSession(null); setAccount(null); setCheckout(null); setCheckoutState("idle"); setNotice(""); setError("");
  };
  const requestPhoneOtp = async () => {
    const normalized = normalizeKenyanPhone(phone);
    if (!normalized) { setError("Enter a valid Kenyan mobile number, for example 0712345678."); return; }
    setBusy(true); setError(""); setNotice("");
    try {
      await authRequest("/auth/v1/user", "PUT", { phone: normalized, channel: "sms" }, session?.access_token);
      setNotice("Verification code sent to " + normalized + ". Enter the SMS code below.");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not send the verification code."); }
    finally { setBusy(false); }
  };
  const verifyPhoneOtp = async () => {
    const normalized = normalizeKenyanPhone(phone);
    if (!normalized || !/^\d{6}$/.test(otp.trim())) { setError("Enter the six-digit SMS code."); return; }
    setBusy(true); setError(""); setNotice("");
    try {
      const data = await authRequest("/auth/v1/verify", "POST", { phone: normalized, token: otp.trim(), type: "phone_change" }, session?.access_token);
      if (data.access_token) { const next = data as unknown as AuthSession; writeSession(next); setSession(next); }
      setOtp(""); setNotice("Your mobile number is verified and saved to your account."); await loadAccount();
    } catch (e) { setError(e instanceof Error ? e.message : "Phone verification failed."); }
    finally { setBusy(false); }
  };
  const claimLegacy = async () => {
    if (!session?.access_token) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const normalized = normalizeKenyanPhone(phone);
      if (!normalized) throw new Error("Add and verify the phone number used for your previous Premium purchase.");
      const response = await fetch(config!.supabase_url + "/rest/v1/rpc/claim_legacy_premium_subscription", {
        method: "POST", headers: { apikey: config!.supabase_anon_key, Authorization: "Bearer " + session.access_token, "Content-Type": "application/json" },
        body: JSON.stringify({ p_phone: normalized.replace("+", "") })
      });
      const result = await response.json() as { message?: string };
      if (!response.ok) throw new Error(result.message || "No claimable active legacy subscription was found for this verified number.");
      setNotice("Your existing Premium access has been linked to this account. No repurchase was required.");
      await loadAccount();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not link the existing subscription."); }
    finally { setBusy(false); }
  };
  const startCheckout = async () => {
    if (!selectedPlan) { setError("No active subscription plans are available."); return; }
    const normalized = normalizeKenyanPhone(phone);
    if (!normalized || !account?.verified_phones.includes(normalized.replace("+", ""))) {
      setError("Verify and save this mobile number before paying.");
      return;
    }
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/premium/account/subscribe", {
        method: "POST", headers: { Authorization: "Bearer " + session?.access_token, "Content-Type": "application/json" },
        body: JSON.stringify({ phone: normalized, plan_id: selectedPlan.id })
      });
      const data = await response.json() as { checkout_request_id?: string; poll_token?: string; error?: string };
      if (!response.ok || !data.checkout_request_id || !data.poll_token) throw new Error(data.error || "Could not start M-PESA checkout.");
      setCheckout({ id: data.checkout_request_id, token: data.poll_token }); setCheckoutState("waiting");
      setNotice("M-PESA prompt sent. Check your phone and enter your PIN to approve the payment.");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not start payment."); }
    finally { setBusy(false); }
  };

  if (loading) return <div className="premium-account-loading"><Loader2 className="animate-spin" size={22}/> Loading secure account access…</div>;
  return <section className="premium-account-panel">
    <div className="premium-account-intro"><div><span className="eyebrow">YOUR ACCAFORGE ACCOUNT</span><h2>{session ? "Premium account" : "Sign in to unlock Premium"}</h2><p>Public football editions remain free. An account is required only for Premium access, payment history and subscription recovery.</p></div><ShieldCheck size={28}/></div>
    {error && <div className="premium-account-alert is-error"><AlertCircle size={16}/><span>{error}</span></div>}
    {notice && <div className="premium-account-alert is-notice"><CheckCircle2 size={16}/><span>{notice}</span></div>}
    {!session ? <div className="premium-auth-grid">
      <div className="premium-auth-card">
        <div className="premium-auth-tabs"><button className={mode === "signin" ? "active" : ""} onClick={() => setMode("signin")}>Sign in</button><button className={mode === "signup" ? "active" : ""} onClick={() => setMode("signup")}>Create account</button></div>
        <label><Mail size={15}/> Email address<input type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com"/></label>
        <label><KeyRound size={15}/> Password<input type="password" autoComplete={mode === "signin" ? "current-password" : "new-password"} value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 8 characters"/></label>
        <button className="button button-primary premium-account-action" disabled={busy || !email.trim() || password.length < 8} onClick={mode === "signin" ? signIn : signUp}>{busy ? <Loader2 size={16} className="animate-spin"/> : mode === "signin" ? <LogIn size={16}/> : <UserPlus size={16}/>} {mode === "signin" ? "Sign in" : "Create account"}</button>
        <div className="premium-auth-divider"><span>or continue with</span></div>
        <button className="button button-secondary premium-account-action" disabled={busy} onClick={googleSignIn}><span className="google-mark">G</span> Continue with Google</button>
      </div>
      <div className="premium-auth-benefits"><h3>One account, all your devices</h3><p>Keep your Premium access, verified M-PESA number, subscription dates and payment receipts together.</p><ul><li><ShieldCheck size={15}/> Secure sign-in with Google or email</li><li><Smartphone size={15}/> Verified phone for M-PESA prompts</li><li><Clock3 size={15}/> Subscription and payment history</li><li><Download size={15}/> Downloadable payment receipts</li></ul></div>
    </div> : <>
      <div className="premium-account-toolbar"><div className="premium-account-user"><UserRound size={18}/><span>{account?.account.display_name || account?.account.email || session.user?.email || "Signed-in member"}</span></div><button className="text-link" onClick={signOut}><LogOut size={15}/> Sign out</button></div>
      <div className="premium-account-card premium-profile-card">
        <h3><UserRound size={17}/> Profile details</h3>
        <label className="premium-account-field">Display name<input value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Your name"/></label>
        <label className="premium-account-field">Email address<input value={account?.account.email || session.user?.email || ""} readOnly/></label>
        <button className="button button-secondary" disabled={busy} onClick={saveProfile}>Save profile</button>
      </div>
      {account?.entitlement.is_premium ? <div className="premium-account-entitlement"><div><span className="eyebrow">SUBSCRIPTION ACTIVE</span><h3><Crown size={19}/> Premium access is active</h3><p>Access remains active until {new Date(account.entitlement.expires_at!).toLocaleDateString("en-KE", { day: "numeric", month: "long", year: "numeric" })}. Renew any time with a new M-PESA prompt.</p></div><span className="premium-account-status">ACTIVE</span></div> : <div className="premium-account-entitlement is-inactive"><div><span className="eyebrow">SUBSCRIPTION</span><h3>Premium is not active</h3><p>Choose a plan below and approve the M-PESA prompt to unlock Premium.</p></div><span className="premium-account-status">FREE</span></div>}
      {account?.entitlement.is_premium && <div className="premium-account-card premium-predictions-card">
        <div className="premium-predictions-heading"><div><h3><Crown size={17}/> Premium predictions</h3><p>Separate Premium research. Each published pick is checked against real bookmaker odds and fixture evidence.</p></div><span>{predictions.length} picks</span></div>
        {!predictions.length ? <div className="premium-predictions-empty">No Premium picks have passed today's evidence and price checks yet. We never publish a forced selection.</div> :
          <div className="premium-predictions-list">{predictions.map(pick => <article key={pick.id}>
            <div className="premium-prediction-fixture"><small>{pick.fixture?.competition || "Football"} · {pick.fixture?.commence_time ? new Date(pick.fixture.commence_time).toLocaleString("en-KE", { timeZone: "Africa/Nairobi", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : pick.publication_date}</small><strong>{pick.fixture?.home_team || "Home"} vs {pick.fixture?.away_team || "Away"}</strong></div>
            <div className="premium-prediction-selection"><span>{pick.market_name}</span><strong>{pick.selection_name}</strong></div>
            <div className="premium-prediction-metrics"><span><small>Odds</small><strong>{Number(pick.odds).toFixed(2)}</strong></span><span><small>Model estimate</small><strong>{Number(pick.estimated_probability).toFixed(1)}%</strong></span><span><small>Confidence</small><strong>{Number(pick.confidence_score).toFixed(0)}%</strong></span><span><small>Result</small><strong>{pick.result ? pick.result.toUpperCase() : "PENDING"}</strong></span></div>
            <p>{pick.reasoning}</p><small className="premium-prediction-bookmaker">Price source: {pick.bookmaker}</small>
          </article>)}</div>}
      </div>}
      <div className="premium-account-columns">
        <div className="premium-account-card">
          <h3><Smartphone size={17}/> Verified M-PESA number</h3>
          {account?.verified_phones.length ? <p>Saved number: <strong>{account.verified_phones[0]}</strong></p> : <p>Add and verify the number that should receive your M-PESA payment prompts.</p>}
          <label className="premium-account-field">Mobile number<input type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="0712345678"/></label>
          <button className="button button-secondary" disabled={busy || !phone.trim()} onClick={requestPhoneOtp}>{busy ? "Please wait…" : "Send verification code"}</button>
          <div className="premium-account-otp"><input aria-label="SMS verification code" inputMode="numeric" maxLength={6} value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, ""))} placeholder="6-digit code"/><button className="button button-secondary" disabled={busy || otp.length !== 6} onClick={verifyPhoneOtp}>Verify number</button></div>
          <button className="text-link" onClick={claimLegacy} disabled={busy || !account?.verified_phones.length}>Recover an existing Premium subscription</button>
        </div>
        <div className="premium-account-card">
          <h3><Crown size={17}/> Renew or upgrade</h3>
          {plansLoading ? <p>Loading plans…</p> : plans.length ? <>
            <label className="premium-account-field">Subscription plan<select value={selectedPlan?.id || ""} onChange={e => setPlanId(e.target.value)}>{plans.map(plan => <option key={plan.id} value={plan.id}>{plan.name} · KES {plan.price_ksh}</option>)}</select></label>
            {selectedPlan && <p>{selectedPlan.duration_days} days · KES {selectedPlan.price_ksh}</p>}
            <button className="button button-primary premium-account-action" disabled={busy || checkoutState === "waiting" || !account?.verified_phones.length} onClick={startCheckout}>{busy ? <Loader2 size={16} className="animate-spin"/> : <Smartphone size={16}/>} Pay with M-PESA STK Push</button>
            {checkoutState === "waiting" && <div className="premium-account-waiting"><Loader2 className="animate-spin" size={18}/> Waiting for you to approve the prompt on your phone…</div>}
            {checkoutState === "success" && <div className="premium-account-alert is-notice"><CheckCircle2 size={16}/> Payment confirmed and Premium access updated.</div>}
          </> : <p>Subscription plans are temporarily unavailable.</p>}
          <small>The Till number is selected securely by AccaForge. You only approve the prompt on your phone. Renewals are customer-initiated; no recurring deductions are enabled.</small>
        </div>
      </div>
      <div className="premium-account-card premium-billing-card">
        <h3><Activity size={17}/> Billing history</h3>
        {!account?.payments.length ? <p>No payments recorded on this account yet.</p> : <div className="premium-billing-list">{account.payments.map(payment => <article key={payment.id}>
          <div><strong>KES {payment.amount_ksh.toLocaleString("en-KE")}</strong><small>{new Date(payment.created_at).toLocaleString("en-KE", { timeZone: "Africa/Nairobi" })} · {payment.mpesa_receipt || "Receipt pending"}</small></div>
          <span className={"premium-billing-status status-" + payment.status}>{payment.status}</span>
          <button className="text-link" disabled={payment.status !== "success"} onClick={() => void downloadReceipt(payment, account.account.email)}><Download size={14}/> Receipt</button>
        </article>)}</div>}
      </div>
    </>}
  </section>;
}
