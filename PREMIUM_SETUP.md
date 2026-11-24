# AccaForge Premium setup

Premium is an independent prediction product. Its fixtures, predictions, publication runs and result settlement are stored separately from the public editions.

## GitHub Actions secrets

Add these under **Repository → Settings → Secrets and variables → Actions → Secrets**:

| Secret | Value / purpose |
|---|---|
| `SUPABASE_URL` | The AccaForge Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service-role secret used only by server-side workflows |
| `PREMIUM_FOOTBALL_API_KEY` | Dedicated API-Football API key |
| `PREMIUM_API_KEY1` | Premium Groq key 1 |
| `PREMIUM_API_KEY2` | Premium Groq key 2 |
| `PREMIUM_API_KEY3` | Premium Groq key 3 |
| `PREMIUM_API_KEY4` | Premium Groq key 4 |
| `PREMIUM_API_KEY5` | Premium Groq key 5 |

**Important:** `PREMIUM_API_KEY1` through `PREMIUM_API_KEY5` must contain Groq credentials. They are a separate pool and do not replace or rename the existing public-edition `GEMINI_API_KEY*` secrets (which continue to contain the public workflows' Groq credentials).

Add a Cloudflare Worker variable named `PREMIUM_SUPPORT_WHATSAPP` containing the support WhatsApp number in international digits-only format (for example, country code followed by subscriber number, without `+`). The account dashboard shows the WhatsApp support link only when this variable is configured.\n\nThe Supabase publishable key is public and is bundled as the default browser Auth key. An optional Cloudflare Worker variable/secret named `SUPABASE_ANON_KEY` can override it when rotating the public key. Never put the service-role key in frontend code.

## Football data provider

The dedicated Premium pipeline uses API-Football:

- API base: `https://v3.football.api-sports.io`
- Authentication header: `x-apisports-key`
- Fixture discovery: daily fixtures in the `Africa/Nairobi` timezone
- Odds: pre-match bookmaker markets for each eligible fixture
- Form: each team's last five completed matches

The default league filter is `39,140,78,135,61,88,94,276`. To change it, add a GitHub Actions **variable** named `PREMIUM_LEAGUE_IDS` containing comma-separated API-Football league IDs. The research job caps a run at 10 fixtures and makes two date-discovery calls plus odds/form lookups; the results job checks completed fixtures separately. API-Football's free plan currently advertises 100 requests per day, so the pipeline deliberately caps its workload. Competition/season coverage and odds availability still depend on the provider's coverage flags and plan.

## Groq model

Premium uses `openai/gpt-oss-120b` on Groq with JSON output and high reasoning effort. The model may only select a candidate that exists in the bookmaker response. The deterministic validator rejects unknown candidates, weak confidence, insufficient evidence, insufficient price edge, unsupported markets and goal-total lines above 3.5.

If the model passes, provider odds are missing, or the evidence fails validation, the workflow withholds the pick. It never falls back to a public edition or invents a market.

## Workflow schedule

- **Premium Research:** daily at 05:15 Africa/Nairobi; can also be run manually from GitHub Actions.
- **Premium Results:** daily at 10:00 Africa/Nairobi; can also be run manually.

The research workflow publishes only validated rows in `premium_predictions`. The results workflow settles those rows against API-Football full-time scores using the same supported-market settlement rules as the public engine.

## Authentication setup

In Supabase → Authentication:

1. Enable Email/password authentication.
2. Enable Google as an OAuth provider and enter the Google OAuth Client ID and Client Secret.
3. Set the Supabase Site URL to `https://accaforge.co.ke`.
4. Add `https://accaforge.co.ke/premium` to the redirect URL allow-list.
5. In Google Cloud Console, configure the Supabase callback URL shown by the Supabase Google provider settings as an authorized redirect URI.
6. Configure an SMS provider for Supabase Phone Auth so customers can verify the mobile number that receives their M-PESA prompt.

The browser Auth flow uses PKCE. Premium API routes validate the Supabase access token server-side. A phone number must be verified on the signed-in account before it can be used for STK checkout.

## M-PESA renewal behavior

All new purchases and renewals use customer-initiated Buy Goods STK Push. The server chooses the configured `DARAJA_TILL_NUMBER`, sends the prompt to the verified account phone and verifies the result with Daraja before activating or extending Premium.

There is no Ratiba integration, no saved recurring debit authorization and no automatic charge. The customer approves each payment on their phone.
