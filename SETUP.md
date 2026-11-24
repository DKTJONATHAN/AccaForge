# AccaForge deployment and operations

## Runtime architecture

AccaForge is deployed as a **Cloudflare Worker with static assets**, not Cloudflare Pages. The configuration lives in `wrangler.jsonc`:

- Worker entry point: `src/worker.ts`
- Built frontend assets: `dist/`
- D1 binding: `DB` (database name: `accaforge`)
- R2 binding: `MEDIA` (bucket: `accaforge-media`)
- Custom domain: `accaforge.co.ke`

Do not create or edit a `wrangler.toml`; it is not the active configuration. Keep the deployed D1 database ID and existing bindings intact when changing `wrangler.jsonc`.

## Cloudflare setup

1. Confirm the `accaforge` D1 database exists and that the ID in `wrangler.jsonc` points to it.
2. Confirm the Worker has the `DB` D1 binding and the `MEDIA` R2 binding.
3. Confirm the `accaforge.co.ke` custom domain is attached to the Worker.
4. Add the Cloudflare API token as a GitHub Actions secret named `CLOUDFLARE_API_TOKEN`. It must have the permissions needed to deploy Workers and access the configured account resources.
5. Add `CLOUDFLARE_ACCOUNT_ID` as a GitHub Actions secret.
6. The deploy workflow runs `npm ci`, builds the Vite application and deploys with `npx wrangler@4 deploy`.

The daily generator talks to D1 through the Cloudflare D1 REST API, so it also requires the D1 database ID as `D1_DATABASE_ID`. The Worker itself receives D1 through its `DB` binding. The application schema is tracked in `migrations/0001_initial_schema.sql`; the generator creates/upgrades its daily snapshot, research and generation tables.

## GitHub Actions secrets

In GitHub → AccaForge → Settings → Secrets and variables → Actions, configure:

| Secret | Purpose |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Cloudflare token used by deployment and D1 generation |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account identifier |
| `D1_DATABASE_ID` | ID of the existing AccaForge D1 database |
| `ODDS_API_KEY` | Primary The Odds API key |
| `ODDS_API_KEY1` … `ODDS_API_KEY8` | Additional Odds API key slots |
| `ODDSAPI_KEY`, `ODDSAPI_KEY1` … `ODDSAPI_KEY3` | Supported legacy Odds API key aliases |
| `GEMINI_API_KEY` … `GEMINI_API_KEY4` | Legacy-named secrets whose values are Groq API keys |

**Important:** Keep the Groq secrets under their existing `GEMINI_API_KEY` names. The workflows map them to `GROQ_API_KEY` through `GROQ_API_KEY4`; do not rename the GitHub secrets. Never print, commit or expose secret values.

Optional GitHub Actions variables:

- `GROQ_MODEL` — defaults to `openai/gpt-oss-120b`.
- `ODDS_REGIONS` — defaults to `uk`.
- `ODDS_MARKETS` — defaults to `h2h,totals,btts,double_chance,draw_no_bet`.
- `ODDS_FALLBACK_MARKETS` — defaults to `btts,double_chance,draw_no_bet,alternate_totals`.

Do not add a `VITE_` prefix to server-side secrets.

## Daily generation pipeline

- `.github/workflows/refresh-results.yml` refreshes previous match results.
- `.github/workflows/generate-safe-picks.yml` starts the daily fixture collection, research and distillation pipeline at 09:00 Africa/Nairobi.
- The chained product workflows run **Super 5 → Super 10 → All-Matches** after the initial 10-Leg Accumulator generation.
- A product may be deliberately withheld without preventing the remaining product workflows from running.
- Product workflows support manual dispatch with an optional `publish_date` in `YYYY-MM-DD` format. Use the same date when resuming a checkpointed run.
- The enrichment workflow is separately scheduled; inspect its current Actions schedule before changing pipeline timing.
- GitHub scheduled workflows are best-effort and may start later during platform load.

The generator discovers fixtures on the requested Africa/Nairobi calendar date from the active soccer competitions available to the Odds API account. The event-list endpoint is used to discover fixture IDs before odds are requested for those exact fixtures. Coverage is limited by the competitions and markets available in the Odds API subscription.

The generator researches fixtures, distils supplied bookmaker markets, and asks the model to choose among those candidates. Candidate IDs, fixture identity, market price and product rules are validated locally before publishing. Research and product batches are checkpointed in D1 so an interrupted run can resume without unnecessarily repeating completed work.

The Odds API market-credit cost depends on the number of competitions, regions and markets requested. A fallback scan can consume additional credits. Check remaining usage in workflow logs and in the Odds API account. Multiple Groq keys in one organisation do not increase that organisation's shared token quota; the pipeline rate-limits requests and rotates configured credentials.

## Product validation rules

- All products use fixtures scheduled on the full Africa/Nairobi calendar date.
- The minimum published individual price is 1.20.
- **10-Leg Accumulator:** exactly ten different fixtures, one selection per fixture, individual prices 1.20–1.50. The product is withheld if ten defensible selections cannot be produced under its configured validation rules.
- **Super 5:** exactly five different fixtures, one selection per fixture, individual prices 1.50–2.00.
- **Super 10:** exactly ten different fixtures, one selection per fixture, individual prices 1.50–2.00.
- **All-Matches Challenge:** exactly one defensible priced selection for every eligible fixture. A single PASS, missing decision, duplicate, invalid candidate or fixture without a usable market withholds the entire edition. No fixture is silently skipped and no arbitrary fallback market is selected.
- Goal-total market guards restrict the allowed goal lines; do not bypass `scripts/lib/market-guards.mjs`.
- Probabilities are estimates informed by de-vigged bookmaker consensus and supplied match research, not guarantees.
- Combined odds are calculated from verified individual prices; Super 5 and Super 10 do not target a preset combined price.
- Settlement is handled by `src/settlement.mjs`. Unsupported or ambiguous result payloads must remain pending rather than being guessed.

## Verify a deployment or generation run

1. Open GitHub Actions and inspect the relevant workflow run and every chained product workflow.
2. Confirm the build and unit-test workflows pass.
3. Open the live site and check `/api/health` for database connectivity.
4. Check `/api/accas?days=3` for the latest published editions.
5. Confirm an All-Matches edition has exactly the same number of selections as eligible fixtures, with one unique fixture per selection and no PASS records.
6. Check the live track-record page after results have been refreshed.

## Premium membership

The proposed paid membership is documented in [PREMIUM.md](./PREMIUM.md). The current application does not yet implement user accounts, subscription billing or Premium entitlements. Do not collect payments or display paid-access claims until verified payment callbacks and server-side entitlement checks are implemented.

## Responsible use

AccaForge is for adults aged 18+ and provides football information for entertainment. Accumulators can lose in full. No prediction or return is guaranteed. Keep the 18+ gate and responsible-play information visible, and obtain local legal review before offering paid services in each jurisdiction.
