# AccaForge Premium — package and rollout

## Launch package

Premium is a paid football-research membership for adults 18+. It sells deeper recorded reasoning and convenient historical access—not guaranteed outcomes, “sure bets” or promises of profit.

| Plan | Price | Access window |
|---|---:|---:|
| Monthly Premium | **KSh 499** | 30-day edition archive |
| Quarterly Premium | **KSh 1,299** | 90-day edition archive |
| Annual Premium | **KSh 4,499** | 365-day edition archive |

Quarterly and annual discounts reward longer commitments without making the monthly entry price inaccessible. These are launch hypotheses, not researched market averages; review conversion, refunds and retention before treating them as final.

## What is included at launch

- All four published formats: 10-Leg Accumulator, Super 5, Super 10 and All-Matches.
- Full edition reasoning and selection notes (free visitors see a short locked-content message).
- Private historical archive: 30, 90 or 365 days according to the active plan.
- Published results and the transparent public track record.
- M-Pesa STK Push checkout for Kenyan subscribers.

The free product keeps the latest three days of editions and the public results/track-record pages. The daily editions themselves remain visible; Premium is not a promise of more accurate predictions.

## Planned Premium upgrades — not included in the current launch offer

These are roadmap items and must not be advertised as available until their APIs and UI are implemented and tested:

1. **Deep Match Reports:** expanded tactical matchups, verified availability, source-quality notes and explicit comparison of candidate markets.
2. **Market Intelligence:** stored price snapshots, opening-versus-latest comparisons and price-change alerts.
3. **Personal Match Centre:** saved teams, leagues and fixtures, custom filters and opt-in reminders.
4. **Advanced Performance Lab:** historical filters, separate selection/accumulator performance, sample sizes and CSV export.
5. **Premium Research Desk:** daily editorial briefings and weekly reviews of notable misses as well as wins.

## Payment and entitlement design

### M-Pesa
- Create a server-side payment intent from an active plan and normalized Safaricom phone number.
- Store a hash of a high-entropy polling token; never expose the Supabase service-role key.
- Treat callback JSON as untrusted. Verify the matching checkout directly through Daraja STK Query before activation.
- If callback metadata is present, compare amount, phone and receipt with the original payment intent.
- Activate through one Postgres transaction. A duplicate callback returns the original entitlement and cannot extend it again.
- Status GET requests are read-only. A browser cannot claim a successful payment without the matching polling token and Safaricom verification.
- Apply per-phone attempt throttling and same-origin checks to browser POST requests.

### International payments
PayPal is not implemented in this release. It requires server-side order capture, webhook signature verification, idempotent provider-event handling and refund/chargeback states before being enabled.

## Current technical boundaries

- Premium membership is currently phone-based, with a random bearer session token. It is not yet linked to a full user account/login system.
- The Worker/API gates the daily editions endpoint: free access is limited to three days and masks full reasoning; active members receive the archive period defined by their plan.
- Public results and track-record endpoints remain public.
- Refunds, chargebacks, subscription cancellation/auto-renewal, account recovery and PayPal are not implemented.
- The new Supabase migration must be applied to the AccaForge database before the hardened settlement flow can work.
- Cloudflare must have the Supabase URL/service-role key and Daraja credentials configured. Keep Daraja in sandbox until end-to-end sandbox payments pass.
- Do not collect live payments until the database migration, secret configuration, sandbox callback/verification, expiry, duplicate-event and unauthorized-access tests all pass.

## Rollout sequence

1. Apply and verify the Supabase settlement migration.
2. Confirm Cloudflare secrets and Daraja sandbox configuration.
3. Test successful, cancelled, timed-out, delayed-callback, duplicate-callback and mismatched-metadata cases.
4. Test free versus monthly/quarterly/annual archive access directly against the API.
5. Add account identity, recovery, cancellation/refund/chargeback handling and PayPal before scaling.
6. Build the planned reports, watchlists, price history, notifications and performance tools only after the core paid entitlement path is stable.
