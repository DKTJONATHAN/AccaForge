# AccaForge

**Precision Football Accumulators**

AccaForge is a football-only analysis website publishing three daily multi-market accumulators targeting combined decimal odds of 10.00, 15.00 and 20.00.

## Platform
- React + TypeScript + Vite, hosted on Cloudflare Pages
- Cloudflare Pages Functions for the public read API
- Cloudflare D1 for structured predictions and a rolling three-day archive
- One GitHub Actions workflow at 02:00 Africa/Nairobi for daily generation
- The Odds API for fixtures and bookmaker markets
- Gemini API for structured analytical recommendations

## Getting started
Follow [SETUP.md](./SETUP.md) to create the D1 database, connect Cloudflare Pages and add the required GitHub Actions secrets.

## Daily process
The workflow collects upcoming football fixtures and prices, requests structured recommendations, validates every selection against the collected market data, calculates combined odds itself and stores only complete published editions. A failed generation does not replace the previous published board.

## Responsible use
AccaForge is for adults aged 18+ and provides information for entertainment only. Football outcomes are uncertain. Accumulators can lose in full. Never stake money you cannot afford to lose. No prediction is guaranteed.

## Design credits
Project-level design guidance from Unslop, No AI Slop UI Skill and Impeccable is included under `.agents/skills/`. Read [THIRD_PARTY_LICENSES.md](./THIRD_PARTY_LICENSES.md) for attribution and licence information.
