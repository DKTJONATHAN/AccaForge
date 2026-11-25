# AccaForge football artwork and standings

AccaForge maintains a reusable football artwork catalogue for every competition represented in its published editions. The enrichment workflow discovers each competition from the published fixture history, resolves its canonical league through TheSportsDB, and imports the full club roster for that league. Metadata is stored in Cloudflare D1; image bytes are downloaded by the existing Worker media-cache task into the `accaforge-media` R2 bucket and served as immutable cached URLs.

## Providers and credentials

- **TheSportsDB V1 public API** supplies soccer team records, league metadata, club badges and competition artwork.
- Its public key is `123`; no sports-data API secret is required.
- The free service documents a 30-request-per-minute limit. The enrichment script spaces requests, retries rate-limit responses with a delay, and uses a single representative fixture per published competition to discover the league roster rather than searching every historical fixture team separately.
- TheSportsDB is community-maintained; exact sport and league checks are required before saving a badge.

## Processing sequence

1. The enrichment workflow starts only after **AccaForge Generate All Matches** succeeds on `main`, then waits **10 minutes** before discovery. Manual dispatch uses the same delay.
2. It reads every distinct competition key represented in published AccaForge editions, not just today's fixtures.
3. For each competition, it resolves a representative club to the correct soccer league and retrieves the league details and full club roster through TheSportsDB.
4. It saves competition metadata and all available club badge source URLs to D1 (`sports_leagues` and `team_badges`). Existing R2 object keys are retained where possible; uncertain or unmatched clubs are not assigned guessed artwork.
5. The Cloudflare Worker media-cache task downloads pending league and club images into the existing `accaforge-media` R2 bucket, stores their object keys in D1, and serves them through `/media-cache/...` with immutable cache headers.
6. The public `/api/content` response reads these D1 records. Visitor requests do not perform provider searches or download artwork.

This catalogue covers the leagues that AccaForge has actually published. It does not claim to mirror every football league in TheSportsDB or leagues that have never appeared in AccaForge editions.

## Manual run

In GitHub, open **Actions → AccaForge Enrich Football Data → Run workflow**. The workflow performs the full published-league roster discovery. The Worker then copies pending image files into R2 on its scheduled media-cache run.

## Coverage and safety

TheSportsDB's free catalogue may omit clubs or artwork. AccaForge accepts only Soccer records and checks that returned teams belong to the resolved competition. Missing or ambiguous artwork remains blank rather than showing the wrong club's badge. Existing standings data is preserved; roster enrichment does not overwrite league-table data.

## Existing GitHub secrets

Keep the existing secrets used by the daily workflow:
- `CLOUDFLARE_API_TOKEN` — Cloudflare API token with permission to query and edit the AccaForge D1 database.
- `CLOUDFLARE_ACCOUNT_ID`
- `D1_DATABASE_ID`
- The existing Odds API and Groq secrets used by generation and results refresh.

No new sports-data API secret is required. The Worker already uses the configured D1 binding and `MEDIA` R2 binding.

## Manual run

In GitHub, open **Actions → AccaForge Enrich Football Data → Run workflow**. A manual run also observes the 10-minute wait before processing today's fixtures and yesterday's results. The Worker then caches the actual image files in R2 on its next scheduled run.

## Coverage and safety

TheSportsDB is community-maintained and does not contain every team or competition. Its free search endpoint returns a limited result set. AccaForge therefore accepts only exact normalized team matches and competition matches supported by the team's competition list. Unmatched items remain without a crest rather than displaying another club's artwork. Competition standings already saved in D1 remain intact.
