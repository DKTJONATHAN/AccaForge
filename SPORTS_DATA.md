# AccaForge football artwork and standings

AccaForge discovers team crests and competition artwork for the current Kenya/Africa-Nairobi publication day and the previous day's results. Discovery runs in GitHub Actions and saves source metadata to Cloudflare D1. Cloudflare Workers then copy the images into the existing `accaforge-media` R2 bucket and serve immutable cached URLs to every visitor.

## Providers and credentials

- **TheSportsDB V1 public API** supplies team records, country/competition metadata, team badges and league artwork.
- Its public key is `123`; it requires no account, payment, API secret or manual approval.
- The free service documents a 30-request-per-minute limit and endpoint-specific result limits. The workflow paces requests and only performs lookups for fixture teams that do not already have a cached R2 image.
- API-Football is no longer used by the logo enrichment workflow. The `API_FOOTBALL_KEY` GitHub secret is no longer required.

## Processing sequence

The GitHub Actions workflow performs discovery after both daily stages:
1. At 3:00 AM Africa/Nairobi, it refreshes yesterday's match results, then discovers artwork for teams in yesterday's result records and today's already-published fixtures.
2. At 9:00 AM Africa/Nairobi, it generates and publishes today's editions, then runs discovery again so newly loaded teams are captured immediately.
3. The discovery script matches each team by its normalized full name and confirms that TheSportsDB identifies it as Soccer. It reads the team's country and competition IDs from the returned record, then looks up the relevant competition artwork. It does not assign a badge when the team match or competition match is uncertain.
4. Team badge URLs and competition artwork URLs are written to D1. Existing standings JSON is preserved; the free API's limited league-table coverage is not used to overwrite standings.
5. The Cloudflare Worker runs a five-minute scheduled task. It downloads newly discovered image files into the existing `accaforge-media` R2 bucket, saves the R2 object keys in D1 and serves them through `/media-cache/...` with immutable cache headers.
6. The public `/api/content` response reads the saved D1 records. Visitor requests do not perform TheSportsDB lookups or initiate logo downloads.

## Existing GitHub secrets

Keep the existing secrets used by the daily workflow:
- `CLOUDFLARE_API_TOKEN` — Cloudflare API token with permission to query and edit the AccaForge D1 database.
- `CLOUDFLARE_ACCOUNT_ID`
- `D1_DATABASE_ID`
- The existing Odds API and Groq secrets used by generation and results refresh.

No new sports-data API secret is required. The Worker already uses the configured D1 binding and `MEDIA` R2 binding.

## Manual run

In GitHub, open **Actions → AccaForge Scheduled Jobs → Run workflow** and choose `enrich`. The job processes both today's fixtures and yesterday's results and writes discovery metadata directly to D1. The Worker then caches the actual image files in R2 on its next scheduled run.

## Coverage and safety

TheSportsDB is community-maintained and does not contain every team or competition. Its free search endpoint returns a limited result set. AccaForge therefore accepts only exact normalized team matches and competition matches supported by the team's competition list. Unmatched items remain without a crest rather than displaying another club's artwork. Competition standings already saved in D1 remain intact.
