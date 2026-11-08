# AccaForge

**Precision Football Accumulators**

AccaForge is a football-only analysis website publishing three daily multi-market accumulators targeting combined decimal odds of 10.00, 15.00 and 20.00.

## Platform
- React + TypeScript + Vite, hosted on Cloudflare Pages
- Cloudflare Pages Functions for the public read API
- Cloudflare D1 for structured predictions and the rolling three-day archive
- One GitHub Actions workflow at 02:00 Africa/Nairobi for the daily generation pipeline
- The Odds API for fixtures and bookmaker markets
- Gemini API for structured analytical recommendations

## Setup
See [SETUP.md](./SETUP.md) for Cloudflare, GitHub Secrets, D1 and deployment setup.

## Responsible use
AccaForge is for adults aged 18+ and provides information for entertainment only. Football outcomes are uncertain. Never stake money you cannot afford to lose. No prediction is guaranteed.

## Design credits
The project includes adapted design guidance from:
- [Unslop](https://github.com/heydamir/unslop) by Damir Sokolovsky, CC BY 4.0
- [Unslop UI Skill](https://github.com/claudiusararu/unslop-ui-skill), MIT
- [Impeccable](https://github.com/pbakaus/impeccable), Apache-2.0

See [THIRD_PARTY_LICENSES.md](./THIRD_PARTY_LICENSES.md).
