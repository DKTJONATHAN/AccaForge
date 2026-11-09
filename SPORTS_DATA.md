# AccaForge football data enrichment

AccaForge enriches the fixtures already published for the current Africa/Nairobi date with club crests, competition crests and league standings.

## Provider

The enrichment job uses [API-Football](https://www.api-football.com/). Its free plan currently includes 100 data API requests per day and a 10-request-per-minute limit. Team and league logo image URLs are served separately and do not count toward the daily data-request quota. Free-plan historical season availability can vary by competition.

## One-time setup

1. Create a free account at https://dashboard.api-football.com/register.
2. In the API-Football dashboard, open **Account → My Access** and copy the API key.
3. In Cloudflare, open **Workers & Pages → accaforge → Settings → Variables and Secrets**.
4. Add a secret named `API_FOOTBALL_KEY` and paste the API key as its value. Do not commit the key to GitHub or put it in frontend code.
5. Deploy the latest AccaForge Worker version so the new secret is available.

## Daily sequence

The existing 9:00 AM Africa/Nairobi GitHub Actions generation step remains unchanged. Immediately after it publishes the day's editions, the workflow runs `scripts/enrich-football-data.mjs`.

The enrichment runner:
- Reads only fixtures in today's published D1 editions.
- Groups fixtures by competition and fetches competition/team data in batches, not one request per team.
- Saves team crests and competition standings in D1; caches a small set of fixture and league crest images in R2, using the provider image CDN for other saved logo URLs.
- Reuses competition IDs and season mappings from D1 on later days.
- Waits at least 6.5 seconds between API data requests and stops at 75 data requests per UTC day, leaving a safety margin below the free 100-request quota.
- Records the daily run and skips it if already completed. A failed competition is not repeatedly requested on the same date.
- Does not call the sports API from visitor page views. The website reads the saved D1/R2 data.

## Manual run

In GitHub, open **Actions → AccaForge Scheduled Jobs → Run workflow** and choose `enrich`. This is intended for a first-time run after adding the Cloudflare secret, or to inspect the saved run status. A completed run for the same Nairobi date is skipped.

## Coverage

The job enriches competitions that API-Football can resolve and serve for the current season. If a competition is not available on the free plan or the provider cannot safely match it, AccaForge leaves its existing team initials/fallback crests in place rather than assigning the wrong club logo or standings.
