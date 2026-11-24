# AccaForge

**Evidence-led football analysis and daily picks**

AccaForge publishes four distinct daily football products:

- **10-Leg Accumulator:** exactly 10 different fixtures, one selection per match, with individual decimal odds from 1.20 to 1.50. All 10 active legs must win; this format is not risk-free. If 10 defensible selections are not available, the edition is withheld rather than padded.
- **Super 5:** exactly five different fixtures, one selection per match, with every individual price between 1.50 and 2.00. Combined odds are an outcome, not a target.
- **Super 10:** exactly ten different fixtures, one selection per match, with every individual price between 1.50 and 2.00. It does not chase a 10.00 combined-odds target.
- **All-Matches Challenge:** exactly one priced market selection for every eligible fixture on the daily slate. No fixture is marked PASS or silently skipped; if any fixture has no usable market prices, the edition is withheld.

Every selection displays its market, best listed bookmaker price, a probability estimate calibrated against de-vigged bookmaker consensus, and a concise rationale. Price edge and bookmaker coverage help rank candidate markets. Probabilities are estimates, not guarantees.

## Platform
- React + TypeScript + Vite, hosted on Cloudflare Pages
- Cloudflare Pages Functions for the public read API
- Cloudflare D1 for structured predictions and a rolling three-day archive
- GitHub Actions for daily generation at 09:00 Africa/Nairobi
- The Odds API for fixtures and available bookmaker markets
- Groq for web research and analytical recommendations

## Getting started
Follow [SETUP.md](./SETUP.md) to configure D1, Cloudflare Pages and the existing GitHub Actions secrets.

## Daily process
The workflow discovers the Nairobi-date fixture slate, gathers bookmaker markets, researches every fixture, ranks markets using de-vigged bookmaker consensus probability, price edge and bookmaker coverage, validates every candidate ID and price locally, and stores the editions in D1. Super 5 and Super 10 use fixed individual price bands rather than combined-odds targets. All-Matches requires a priced PICK for every eligible fixture and is withheld if the odds feed supplies no usable market for any fixture. Each product is validated independently, so an unavailable or invalid product does not block other valid products from publishing. Failed products retain their previous same-day edition.

## Responsible use
AccaForge is for adults aged 18+ and provides information for entertainment only. Football outcomes are uncertain. Accumulators can lose in full. Never stake money you cannot afford to lose. No prediction is guaranteed.

## Design credits
Project-level design guidance from Unslop, No AI Slop UI Skill and Impeccable is included under `.agents/skills/`. Read [THIRD_PARTY_LICENSES.md](./THIRD_PARTY_LICENSES.md) for attribution and licence information.


## Edition settlement

Selection-level hit rate and accumulator-level results are reported separately. An edition wins only when every active leg wins. A losing leg makes the accumulator a loss; void legs are excluded from effective combined odds; pending legs keep an otherwise-unsettled edition pending. Markets without verified settlement logic are excluded from generation. Cup and tournament fixtures remain pending when the score feed does not expose a regulation-time score separately from extra time.
