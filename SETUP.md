# AccaForge deployment setup

## Cloudflare D1
1. Open Cloudflare Dashboard → Storage & databases → D1 SQL Database.
2. Create a database named **accaforge** and copy its database ID.
3. In Cloudflare Pages → AccaForge → Settings → Functions → D1 database bindings, add variable name **DB** and select this database.
4. Replace the placeholder database UUID `00000000-0000-0000-0000-000000000000` in `wrangler.toml` with the real D1 database ID.
5. Redeploy the Pages project after saving the binding.

The daily workflow creates the required tables and indexes if missing. The matching migration is checked in at `migrations/0001_initial_schema.sql`.

## Cloudflare Pages
1. Create a Pages project connected to `DKTJONATHAN/AccaForge`.
2. Framework preset: **Vite**.
3. Build command: `npm run build`.
4. Build output directory: `dist`.
5. Deploy. The `functions/` directory is deployed alongside the static site.

## GitHub Actions secrets
In GitHub → AccaForge → Settings → Secrets and variables → Actions, add:

| Secret | Value |
|---|---|
| `ODDS_API_KEY` | Your existing/current The Odds API key (keep this configured) |
| `ODDSAPI_KEY1` | Additional Odds API key 1 |
| `ODDSAPI_KEY2` | Additional Odds API key 2 |
| `ODDSAPI_KEY3` | Additional Odds API key 3 |
| `GEMINI_API_KEY` | Your Groq API key (legacy secret name; value must be a Groq key) |
| `GEMINI_API_KEY1` | Optional second Groq API key (same legacy naming) |
| `GEMINI_API_KEY2` | Optional third Groq API key (same legacy naming) |
| `GEMINI_API_KEY3` | Optional fourth Groq API key (same legacy naming) |
| `GEMINI_API_KEY4` | Optional fifth Groq API key (same legacy naming) |
| `CLOUDFLARE_API_TOKEN` | Cloudflare API token with Account D1 Edit permission |
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare account ID |
| `D1_DATABASE_ID` | The ID of the accaforge D1 database |

Optional Actions variables:
- `GROQ_MODEL` (default `openai/gpt-oss-120b`; supports Groq built-in browser search and structured JSON output)
- `ODDS_REGIONS` (default `uk`)
- `ODDS_MARKETS` (default `h2h,totals,btts,double_chance,draw_no_bet,spreads,team_totals`)
- `ODDS_FALLBACK_MARKETS` (default `btts,double_chance,draw_no_bet,team_totals,spreads,alternate_totals,alternate_spreads`; checked across the fixture slate when the primary market request is unsupported or the candidate pool is too small)

The daily generator discovers every active soccer competition exposed by your Odds API account. It first lists all fixtures on the requested Africa/Nairobi calendar date using the quota-free `/events` endpoint, then fetches odds for those exact event IDs. It does not impose a rolling-hour or multi-day lookahead and does not restrict discovery to a hand-picked league list. The Odds API can only return competitions and fixtures included in your subscription tier and current feed.

Odds API market credits depend on the number of active soccer competitions and markets returned. The event-list endpoint used to discover the full daily slate does not consume usage credits. Primary odds requests consume credits per market and region; if the combined primary market request is unsupported, or fewer than 24 eligible prices / 12 distinct fixtures are found, the fallback scan checks additional markets across the fixture slate and can consume substantially more credits. A successful broad primary-market request avoids this extra scan. Monitor the `x-requests-remaining` logs before enabling broad fallback scans on a low-quota account. Groq browser search is performed in the AI research stage and is subject to Groq model/tool usage limits. The generation pipeline persists six-fixture research shards, then runs a separate candidate-distillation pass over the full fixture universe. Distillation results are validated against the original event and candidate IDs, checkpointed in D1 and globally deduplicated before product-specific allocation. All-Matches generation also checkpoints each six-fixture product batch so a rerun can resume completed work. Failed shards are retried; incomplete distillation is never published. Up to five Groq credentials can be configured through the legacy `GEMINI_API_KEY` through `GEMINI_API_KEY4` secret names. Multiple keys in the same Groq organisation do not increase the organisation TPM quota; the generator retains a shared 65-second request interval and rotates credentials for authentication failures only. See the [Odds API v4 guide](https://the-odds-api.com/liveapi/guides/v4/index.html).

Never use `VITE_` prefixes for secrets and never commit API keys.

## Schedule
The only workflow, `.github/workflows/daily-accas.yml`, runs at **09:00 Africa/Nairobi** every day. It can also be started manually from GitHub Actions. GitHub scheduled jobs are best-effort and can start a little later during high platform load.

## Apply the product-board database update without using API credits
After deploying this version, open GitHub → Actions → **AccaForge Daily Accumulators** → **Run workflow**. Set **migrate_only** to **true**, then start the workflow. This applies the D1 columns needed for product types, PASS rows and probability estimates, then exits before any Groq or Odds API request. The existing daily schedule continues to generate the actual editions normally.

## Verify
- Open GitHub Actions and run **AccaForge Daily Accumulators** manually.
- Confirm that the job completes successfully.
- Open the deployed site and check `/api/health` reports a connected database.
- Check `/api/accas?days=3` for the latest stored editions.

## Data safeguards
- Fixtures are restricted to the complete Africa/Nairobi calendar date, across active soccer competitions exposed by your Odds API account.
- The market collector keeps every valid decimal price from 1.01 upward without imposing an odds ceiling, so Super 5 and All-Matches can consider any available price. The default primary request includes match result, totals, BTTS, double chance, draw no bet, spreads and team totals; configured fallback markets can expand coverage if needed.
- Safe Picks requires exactly 10 different fixtures, individual odds from 1.01 to 1.50, and combined odds of at least 10.00. If ten defensible selections cannot meet all three conditions, Safe Picks is withheld.
- Super 5 requires exactly five different fixtures and combined odds of at least 30.00. Prices above 2.00 are allowed when the research supports the selection.
- All-Matches Challenge includes every eligible fixture exactly once. Each fixture is a PICK or PASS. A club is not repeated across picked fixtures; conflicting fixtures are passed.
- Groq browser research considers recent form, home/away performance, league context, team availability, schedule and credible current reporting. Unverified information must be treated as uncertain.
- Groq may select only candidate IDs supplied by the server-side collector. Prices and fixture identity are checked again locally before storage.
- Every PICK stores an AI-estimated probability and a simple bookmaker implied probability calculated from decimal odds. These are informational estimates, not calibrated guarantees.
- Combined odds are recalculated from verified individual prices for Safe Picks and Super 5. All-Matches is a fixture-by-fixture challenge, not a single accumulator.
- Existing legacy 10/15/20 editions are marked as legacy and excluded from the new product board.
- On a successful run, records older than the latest three Kenyan calendar days are deleted. If validation fails, previously published editions are not replaced.

## Responsible use
Keep the 18+ gate and responsible-play notice visible. No outcome or return is guaranteed. Obtain local legal review before offering the service in any jurisdiction.
