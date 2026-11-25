# AccaForge Premium setup

Premium is an independent prediction product. Its fixtures, predictions, publication runs and result settlement are stored separately from the public editions.

## Cloudflare Worker secrets

Configure these as server-side secrets on the production Cloudflare Worker. Do not put them in browser-visible variables or `VITE_` values:

| Secret | Value / purpose |
|---|---|
| `SUPABASE_URL` | The AccaForge Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service-role secret used only by server-side workflows |
| `PREMIUM_FOOTBALL_KEY` | Primary OddsPapi key |
| `PREMIUM_FOOTBALL_KEY1` | OddsPapi key 2 |
| `PREMIUM_FOOTBALL_KEY2` | OddsPapi key 3 |
| `GEMINI_API_KEYS` | Existing comma-separated Groq key pool already used by your Cloudflare setup (if configured under this name) |
| `GEMINI_API_KEY` … `GEMINI_API_KEY4` | Existing Groq keys, reused unchanged when configured individually |

**Important:** Premium reuses the existing Groq credential pool. The Premium runtime accepts the existing `GEMINI_API_KEYS` comma-separated pool and the existing individual `GEMINI_API_KEY`…`GEMINI_API_KEY4` names. It also accepts `GROQ_API_KEY`…`GROQ_API_KEY4` aliases. Keys are deduplicated and never logged. Do not create a separate Premium Groq pool or rename your existing keys.

Add a Cloudflare Worker variable named `PREMIUM_SUPPORT_WHATSAPP` containing the support WhatsApp number in international digits-only format (for example, country code followed by subscriber number, without `+`). The account dashboard shows the WhatsApp support link only when this variable is configured.\n\n## Cloudflare Worker configuration

Confirm these bindings exist in the production Worker environment:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (server-only secret; never expose it to browser code)
- Existing Daraja secrets: `DARAJA_CONSUMER_KEY`, `DARAJA_CONSUMER_SECRET`, `DARAJA_SHORTCODE`, `DARAJA_TILL_NUMBER`, `DARAJA_PASSKEY`, `DARAJA_CALLBACK_URL`, and `DARAJA_ENV=production`
- Optional public variable `SUPABASE_ANON_KEY` if you need to override the publishable key bundled with the app
- `PREMIUM_SUPPORT_WHATSAPP` for the account-dashboard WhatsApp support link

The STK checkout uses the configured Buy Goods Till. Customers do not need to know or enter the Till number; they receive the Safaricom prompt and approve it with their PIN.

The Supabase publishable key is public and is bundled as the default browser Auth key. An optional Cloudflare Worker variable/secret named `SUPABASE_ANON_KEY` can override it when rotating the public key. Never put the service-role key in frontend code.

## Football data provider

The dedicated Premium pipeline uses OddsPapi v4:

- API base: `https://api.oddspapi.io/v4`
- Authentication: `apiKey` query parameter; the client rotates the three configured football keys and keeps them server-side
- Football sport ID: `10`; tournament discovery is dynamic
- Fixture discovery: upcoming fixtures in the `Africa/Nairobi` publication window
- Odds: bookmaker prices from `/odds`, normalized using `/markets` metadata
- Form: each team's last five completed fixtures and scores from OddsPapi

The default tournament slugs are `premier-league,laliga,serie-a,bundesliga,ligue-1`. To change them, add a Cloudflare Worker **variable** named `PREMIUM_TOURNAMENT_SLUGS` with comma-separated OddsPapi tournament slugs. The Worker caps a run at 10 fixtures. The client respects OddsPapi endpoint cooldowns and rotates keys when a key is throttled or a provider request fails. Competition coverage, bookmaker availability and request quotas depend on your OddsPapi plan.

## Groq model

Premium uses `openai/gpt-oss-120b` on Groq with JSON output and high reasoning effort. The model may only select a candidate that exists in the bookmaker response. The deterministic validator rejects unknown candidates, weak confidence, insufficient evidence, insufficient price edge, unsupported markets and goal-total lines above 3.5.

If the model passes, provider odds are missing, or the evidence fails validation, the workflow withholds the pick. It never falls back to a public edition or invents a market.

## Cloudflare schedule

- **Premium Research:** Cloudflare Cron Trigger `15 2 * * *` (05:15 Africa/Nairobi).
- **Premium Results:** Cloudflare Cron Trigger `0 7 * * *` (10:00 Africa/Nairobi).
- Both jobs execute inside the AccaForge Worker and read the existing Cloudflare Worker secrets directly. GitHub Actions is no longer used to schedule or run Premium jobs.

The research workflow publishes only validated rows in `premium_predictions`. The results workflow settles those rows against OddsPapi final-period scores using the same supported-market settlement rules as the public engine.

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
