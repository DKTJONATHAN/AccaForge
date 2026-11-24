# AccaForge Premium — product and rollout proposal

## Positioning

**AccaForge Premium** is a paid football research and match-following membership for adults 18+. It sells deeper context, better tools and less manual work—not guaranteed outcomes, "sure bets" or a promise of profit.

The free experience remains useful and transparent. Premium should feel like a meaningful upgrade rather than making the free product artificially unusable.

## Recommended launch offer

| Offer | Proposed price | Effective monthly price |
|---|---:|---:|
| Monthly | **KSh 499 / month** | KSh 499 |
| Quarterly | **KSh 1,299 / 3 months** | About KSh 433 |
| Annual | **KSh 4,499 / year** | About KSh 375 |

These are target pricing hypotheses for a Kenya-first launch, not researched market averages. The current Supabase migration actually seeds an introductory **KSh 199 / 30-day** plan. Keep that as a clearly labelled limited beta offer if desired; align the database plan rows and checkout display before switching to the target prices above. Start with monthly and quarterly checkout; introduce annual billing only after retention and refund behaviour are understood. Test willingness to pay before treating any price as final.

## Premium feature bundle

### 1. Deep Match Reports
- Expanded fixture-by-fixture analysis, beyond the short public rationale.
- Tactical matchup, recent form, home/away splits, table context and match importance.
- Verified team availability, injury/suspension and referee context where credible data exists.
- Explicit uncertainty and source-quality notes; unavailable information must be labelled unknown.
- Explain why the chosen market is more defensible than the other supplied markets.

### 2. Market Intelligence
- Side-by-side comparison of eligible markets and bookmaker prices.
- Price movement history and opening-versus-latest price where snapshots are actually collected.
- Value/consensus indicators with plain-language explanations.
- Alerts when a tracked market price changes materially, once a reliable polling/snapshot pipeline exists.
- Never imply that a shorter price is automatically a better bet or that historical movement predicts the result.

### 3. Personal Match Centre
- Follow teams, leagues and fixtures.
- Saved fixtures and a personal watchlist.
- Kick-off reminders and match-status notifications.
- Custom filters for leagues, markets and kickoff windows.
- Email/web push preferences with clear opt-in and unsubscribe controls.

### 4. Advanced Performance Lab
- Full historical selection and accumulator record, with filters by product, league, market and date.
- Separate selection hit rate from accumulator win rate.
- Show sample size, settled/pending/void counts and transparent methodology.
- Download personal watchlist and performance data as CSV.
- No cherry-picked time windows or unsupported "AI accuracy" claims.

### 5. Premium Research Desk
- A daily editorial briefing highlighting the most interesting fixtures and material uncertainties.
- A short list of matches worth watching, including matches where the correct decision is no selection.
- Weekly review of market performance and notable misses, not just wins.
- Early access to new analysis tools and research formats.

## Free vs Premium boundary

| Capability | Free | Premium |
|---|---|---|
| Daily 10-Leg, Super 5, Super 10 and All-Matches editions | Yes | Yes |
| Public selection rationale and listed price | Yes | Yes |
| Public settled results and core track record | Yes | Yes |
| Expanded match reports | Summary | Full report |
| Market comparison and price history | Current published price | Expanded comparison and history when captured |
| Team/league watchlists | Limited or none at launch | Personal watchlists |
| Match and price alerts | No | Opt-in alerts |
| Advanced historical filters and CSV export | Basic public view | Full analysis tools |
| Daily Premium Research Desk | No | Yes |

Do not launch a paywall until the paid features above exist and entitlement checks are enforced by the Worker/API, not merely hidden in React.

## Payments and entitlement architecture

### Kenya
- M-Pesa Daraja STK Push as the primary checkout.
- Verify the callback signature/credentials and transaction result server-side.
- Match callback amount, currency, merchant reference, phone and checkout request to a pending invoice.
- Make callback processing idempotent; never activate Premium from a browser redirect or an unverified client response.

### International
- PayPal checkout as the secondary option.
- Verify webhook signatures with PayPal before granting or extending access.
- Store provider transaction IDs and normalized payment state, not card or wallet credentials.

### Data model (proposed)
- `users`: stable account identity and verified contact details.
- `plans`: plan code, billing interval, currency, amount and active flag.
- `invoices`: user, plan, amount, currency, provider, provider reference, status and timestamps.
- `subscriptions`: user, plan, status, starts_at, expires_at, cancel_at_period_end and provider reference.
- `payment_events`: provider event ID, payload hash, processing status and received_at for idempotent webhook handling.
- `entitlements`: user, feature key, active state and expiry; alternatively derive access from a single active subscription if there are no add-ons.

### Access rules
- The Worker resolves the authenticated user and subscription from trusted server-side state.
- Premium API responses require an active entitlement; expired, refunded, disputed or chargeback payments revoke access.
- Payment callbacks are public endpoints but must be authenticated using provider verification and strict payload validation.
- Use prepared SQL statements, rate limits, audit logs and replay protection.
- Do not store passwords in plaintext. Use a maintained identity provider or secure password hashing/session implementation.
- Support cancellation, expiry, payment failure, refund and renewal states before launch.

## Rollout plan

1. **Foundation:** choose identity/authentication, create D1 migrations, account settings, invoices and subscription state. Add webhook endpoints and payment sandbox tests.
2. **Paid value:** implement Deep Match Reports, saved watchlists and advanced performance filters. Keep every premium API protected server-side.
3. **Notifications:** add opt-in email/web-push preferences, price snapshots and scheduled alerts with rate limits.
4. **Launch:** soft-launch monthly and quarterly plans, monitor conversion, failed payments, cancellations, support volume and 30/60-day retention.
5. **Optimize:** test price points and annual billing only with actual retention data.

## Launch acceptance criteria

- A successful, verified payment activates the correct plan exactly once.
- A duplicate callback cannot extend a subscription twice.
- A forged callback or browser-only success state cannot activate Premium.
- Expired/refunded/disputed subscriptions lose paid API access.
- Free users cannot retrieve Premium-only report fields by calling endpoints directly.
- Users can see renewal/expiry details and cancel renewal without losing already-paid access.
- All payment and account flows work on mobile and handle network retries safely.
- Premium content is clearly labelled as analysis, not financial advice or guaranteed outcomes.

## Current implementation status

The current AccaForge repository has a public React/Worker application and D1-backed football editions, but no account identity, login/session system, subscription tables or payment callback endpoints. Therefore this document defines the package and secure implementation target; it does not claim that Premium checkout or paid access is live. Do not collect money until the end-to-end payment and entitlement acceptance criteria pass.
