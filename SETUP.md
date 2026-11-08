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
| `ODDS_API_KEY` | Your The Odds API key |
| `GEMINI_API_KEY` | Your Google Gemini API key |
| `CLOUDFLARE_API_TOKEN` | Cloudflare API token with Account D1 Edit permission |
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare account ID |
| `D1_DATABASE_ID` | The ID of the accaforge D1 database |

Optional Actions variables:
- `GEMINI_MODEL` (default `gemini-2.5-flash`)
- `ODDS_REGIONS` (default `uk`)
- `ODDS_MARKETS` (default `h2h,totals`)
- `ODDS_EXTRA_MARKETS` (default `btts,double_chance`, fetched on a capped set of individual fixtures)
- `ODDS_EXTRA_EVENT_LIMIT` (default `8`, maximum 30)
- `ODDS_MAX_SPORTS` (default `8`, maximum 20)
- `ODDS_SPORT_KEYS` (optional comma-separated sport keys to limit API usage)

Never use `VITE_` prefixes for secrets and never commit API keys.

## Schedule
The only workflow, `.github/workflows/daily-accas.yml`, runs at **02:00 Africa/Nairobi** every day. It can also be started manually from GitHub Actions. GitHub scheduled jobs are best-effort and can start a little later during high platform load.

## Verify
- Open GitHub Actions and run **AccaForge Daily Accumulators** manually.
- Confirm that the job completes successfully.
- Open the deployed site and check `/api/health` reports a connected database.
- Check `/api/accas?days=3` for the latest stored editions.

## Data safeguards
- Only football fixtures scheduled within the next 72 hours are collected.
- Gemini can select only candidate IDs supplied by the server-side collector.
- The workflow rejects invented candidate IDs, duplicate fixtures and invalid leg counts.
- Combined decimal odds are recalculated from the individual verified prices.
- Each accumulator must land within 8% of its target to be published.
- If generation or validation fails, existing published results are not replaced.
- On a successful run, records older than the latest three Kenyan calendar days are deleted.

## Responsible use
Keep the 18+ gate and responsible-play notice visible. No outcome or return is guaranteed. Obtain local legal review before offering the service in any jurisdiction.
