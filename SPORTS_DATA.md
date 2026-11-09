# AccaForge football data enrichment

AccaForge enriches fixtures already published for the current Africa/Nairobi date with club crests, competition crests and league standings.

## Processing architecture

GitHub Actions performs the complete enrichment job. It reads the published fixtures, calls API-Football, and writes the resulting team badge URLs and league tables directly to Cloudflare D1 through Cloudflare's D1 REST API. The Cloudflare Worker only serves the website and reads the saved data; no visitor request or scheduler proxy triggers sports API calls.

## One-time setup

1. Create a free account at https://dashboard.api-football.com/register.
2. In the API-Football dashboard, open **Account → My Access** and copy the API key.
3. In the GitHub repository, open **Settings → Secrets and variables → Actions → New repository secret**.
4. Add `API_FOOTBALL_KEY` and paste the API key. This key belongs in GitHub Actions because the enrichment runner executes there; it is no longer read from a Cloudflare Worker secret.
5. Ensure these existing GitHub Actions secrets are present:
   - `CLOUDFLARE_API_TOKEN` — Cloudflare API token with permission to query and edit the AccaForge D1 database.
   - `CLOUDFLARE_ACCOUNT_ID`
   - `D1_DATABASE_ID`

Never commit API keys to the repository or put them in frontend code.

## Daily sequence

The 9:00 AM Africa/Nairobi GitHub Actions job:
1. Fetches the day's football fixtures and odds directly from The Odds API.
2. Performs the shared match research and generates the daily editions directly through Groq.
3. Publishes the completed editions and snapshots directly to Cloudflare D1.
4. Runs `scripts/enrich-football-data.mjs`, which reads those newly published fixtures, calls API-Football and saves team/league image URLs and standings JSON directly into D1.

The runner:
- Reads only fixtures in today's published D1 editions.
- Groups fixtures by competition and fetches team and standings data in batches, not one request per team.
- Stores provider image URLs and league tables in D1. The website displays those saved URLs; it does not call API-Football.
- Reuses competition IDs and season mappings from D1 on later days.
- Paces API requests and stops at 75 data requests per UTC day, leaving a safety margin below the free 100-request quota.
- Records the daily run and skips a date already marked completed.
- Does not make sports API calls from visitor page views.

## Manual run

In GitHub, open **Actions → AccaForge Scheduled Jobs → Run workflow** and choose `enrich`, or open **Actions → AccaForge Football Logos & Standings** and run that workflow. Both execute directly on GitHub and write to D1; neither calls the Cloudflare Worker scheduler.

## Coverage

The job enriches competitions that API-Football can resolve and serve for the current season. If a competition is unavailable or cannot be safely matched, AccaForge retains its existing fallback presentation rather than assigning the wrong club crest or standings.
