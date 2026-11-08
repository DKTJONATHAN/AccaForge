# AccaForge

**Evidence-led football analysis and daily picks**

AccaForge publishes three distinct daily football products:

- **Safe Picks:** exactly 10 different fixtures, one selection per match, with individual decimal odds from 1.01 to 1.50. If 10 defensible selections are not available, this edition is withheld rather than padded.
- **Super 5:** exactly five different fixtures, with no fixed combined-odds target. Individual prices may exceed 2.00 when the evidence supports the selection.
- **All-Matches Challenge:** one entry for every eligible fixture on the daily slate. The strongest supported market is selected, or the fixture is marked PASS when no defensible pick is available. A club appears in no more than one picked fixture in this product.

Every PICK displays its market, bookmaker price, AI-estimated probability and evidence-based rationale. Probabilities are estimates, not guarantees; bookmaker implied probability is shown separately as a simple price-derived comparison.

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
The workflow discovers the Nairobi-date fixture slate, gathers bookmaker markets, researches every fixture, proposes all three products, validates every candidate ID and price locally, calculates combined odds for Safe Picks and Super 5, and stores the editions in D1. All-Matches includes explicit PASS rows. Failed validation does not replace the previously published board.

## Responsible use
AccaForge is for adults aged 18+ and provides information for entertainment only. Football outcomes are uncertain. Accumulators can lose in full. Never stake money you cannot afford to lose. No prediction is guaranteed.

## Design credits
Project-level design guidance from Unslop, No AI Slop UI Skill and Impeccable is included under `.agents/skills/`. Read [THIRD_PARTY_LICENSES.md](./THIRD_PARTY_LICENSES.md) for attribution and licence information.
