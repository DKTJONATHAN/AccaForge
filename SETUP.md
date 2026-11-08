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
| `GEMINI_API_KEY` | Your Google Gemini API key |
| `CLOUDFLARE_API_TOKEN` | Cloudflare API token with Account D1 Edit permission |
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare account ID |
| `D1_DATABASE_ID` | The ID of the accaforge D1 database |

Optional Actions variables:
- `GEMINI_MODEL` (default `gemini-3.8-flash`; supports Google Search grounding)
- `ODDS_REGIONS` (default `uk`)
- `ODDS_MARKETS` (default `h2h,totals`)
- `ODDS_EXTRA_MARKETS` (default `btts,double_chance`, fetched on a capped set of individual fixtures)
- `ODDS_EXTRA_EVENT_LIMIT` (default `8`, maximum 30)
- `ODDS_FALLBACK_MARKETS` (default `btts,double_chance,draw_no_bet,team_totals`; checked across every fixture when the primary markets do not provide enough eligible prices)

The daily generator discovers every active soccer competition exposed by your Odds API account. It first lists all fixtures on the requested Africa/Nairobi calendar date using the quota-free `/events` endpoint, then fetches odds for those exact event IDs. It does not impose a rolling-hour or multi-day lookahead and does not restrict discovery to a hand-picked league list. The Odds API can only return competitions and fixtures included in your subscription tier and current feed.

Odds API market credits depend on the number of active soccer competitions and markets returned. The event-list endpoint used to discover the full daily slate does not consume usage credits. Primary odds requests consume credits per market and region; if fewer than 24 eligible prices or fewer than 12 distinct fixtures are found, the fallback scan checks additional markets on every fixture and can consume substantially more credits. Monitor the `x-requests-remaining` logs before enabling broad fallback scans on a low-quota account. Gemini Google Search grounding may also incur separate Gemini search-grounding charges. See the [Odds API v4 guide](https://the-odds-api.com/liveapi/guides/v4/index.html).

Never use `VITE_` prefixes for secrets and never commit API keys.

## Schedule
The only workflow, `.github/workflows/daily-accas.yml`, runs at **02:00 Africa/Nairobi** every day. It can also be started manually from GitHub Actions. GitHub scheduled jobs are best-effort and can start a little later during high platform load.

## Verify
- Open GitHub Actions and run **AccaForge Daily Accumulators** manually.
- Confirm that the job completes successfully.
- Open the deployed site and check `/api/health` reports a connected database.
- Check `/api/accas?days=3` for the latest stored editions.

## Data safeguards
- Football fixtures are restricted to the complete Africa/Nairobi calendar date being generated (00:00 inclusive to the next midnight exclusive), across every active soccer competition exposed by the Odds API account. Per-competition fixture counts are logged.
- If primary markets do not yield at least 24 eligible prices, the generator automatically scans configured fallback markets across every fixture on that date before deciding whether there is enough evidence to publish.
- Gemini uses Google Search grounding to research recent form, home/away performance, relevant head-to-head history, league context, injuries, suspensions, likely line-ups, rest/travel, tactical matchups and credible current team news. Unverified social-media gossip is not treated as fact.
- Gemini can select only candidate IDs supplied by the server-side collector; the collector only supplies individual prices from 1.20 to 1.90.
- Each accumulator must contain 4-10 different fixtures across at least 3 leagues.
- A fixture or club/team cannot appear in more than one of the 10, 15 and 20 odds accumulators.
- The workflow rejects invented candidate IDs, duplicate fixtures/teams, out-of-range prices and invalid leg counts.
- Combined decimal odds are recalculated from the individual verified prices.
- Each accumulator must land within 5% of its target to be published.
- If generation or validation fails, existing published results are not replaced.
- On a successful run, records older than the latest three Kenyan calendar days are deleted.

## Responsible use
Keep the 18+ gate and responsible-play notice visible. No outcome or return is guaranteed. Obtain local legal review before offering the service in any jurisdiction.
