---
name: accaforge-ui-ux
description: "Design, audit, and implement AccaForge's football-analysis product experience: homepage, daily editions, picks, match analysis, results, track record, competitions, responsive behavior, and accessibility."
---

# AccaForge Product UI/UX

## Product context
AccaForge is an evidence-led football analysis and daily-picks platform with four products: Safe Picks, Super 5, Super 10, and the All-Matches Challenge. Users must understand each format, inspect fixture and market evidence, compare estimated probability with bookmaker-implied probability, and distinguish PICK from PASS. The service is informational and entertainment-only for adults 18+; no outcome is guaranteed.

## Non-negotiable principles
1. Evidence before excitement. Never imply certainty, guaranteed wins, risk-free returns, or guaranteed profit.
2. Treat odds, percentages, dates, scores, and sample sizes as first-class content: explicit labels, consistent precision, tabular numerals, and clear units.
3. Keep estimated probability and bookmaker-implied probability separately labelled; never present them as equivalent or as a verified edge.
4. PASS is a valid analytical outcome, not an error or an empty slot. Never rely on color alone to communicate PICK/PASS.
5. Keep teams, competition, kick-off time (Africa/Nairobi where displayed), market, selection, price, bookmaker, and rationale easy to scan.
6. Preserve 18+ and responsible-play notices. Avoid urgency, countdown pressure, celebratory loss framing, or manipulative engagement patterns.
7. Protect product truth: do not alter prediction generation, fixture identity, odds validation, probability calculations, result settlement, publication rules, or API contracts during a visual redesign unless separately requested.

## Visual direction
Use DESIGN.md as the source of truth. The intended character is a premium football data desk: deep forest green and navy anchors, restrained emerald for active/positive states, warm neutral surfaces, crisp editorial typography, fine rules, and disciplined information density. Avoid generic sportsbook neon, purple gradients, glossy glassmorphism, excessive pills, decorative emoji, and interchangeable card grids.

## Workflow
1. Inspect the actual route, component tree, data model, styles, and real content before proposing a redesign.
2. Identify the user's primary task and rank content by decision importance.
3. Preserve product semantics, routes, data contracts, SEO content, and responsible-play language.
4. Use shared tokens and reusable patterns; prefer deliberate surfaces over nested cards.
5. Specify loading, populated, empty, unavailable, error, PICK, PASS, selected, expanded, focus, and mobile-navigation states.
6. Design mobile first at 320–390 px, then tablet and desktop. Check long team/market names, multi-digit odds, large percentages, and dense tables.
7. Use semantic HTML, accessible names, visible focus, keyboard-operable controls, and reduced-motion support.
8. Keep interactions predictable: clear tap targets, immediate feedback, no hover-only information, and no accidental nested-control navigation.
9. Implement scoped UI changes. Keep data fetching and business logic untouched unless explicitly in scope.
10. Verify typecheck/build and, when browser tooling is available, inspect desktop/mobile routes and keyboard use. Report only checks actually performed.

## Component guidance
- Edition navigation: exact product names and concise format explanations; never call Safe Picks guaranteed or risk-free.
- Fixture rows: distinguish home/away teams at narrow widths; show competition and Nairobi-local kick-off context; do not rely on logos alone.
- Selection details: label market, selection, estimated chance, bookmaker-implied chance, decimal odds, and bookmaker distinctly. Keep PASS explanation visible.
- Combined odds: treat as a price-derived combined figure, not a probability or expected return.
- Results/track record: state sample window and settled/pending/void/PASS treatment; keep methodology close to metrics and show denominators.
- Freshness: distinguish updated-at time from fixture kick-off.
- Mobile navigation: preserve access to core routes and account for safe-area insets and fixed docks.

## Review checklist
- [ ] Primary task is clear in the first viewport.
- [ ] Product formats are differentiated accurately.
- [ ] Odds and probabilities have explicit labels and consistent precision.
- [ ] PICK/PASS are understandable without color.
- [ ] No guarantee, urgency, or misleading betting language was introduced.
- [ ] Team names, fixture times, and prices do not clip at 320 px.
- [ ] Navigation and controls work with keyboard and touch.
- [ ] Focus, contrast, and text resizing are usable.
- [ ] Reduced motion is respected.
- [ ] Loading, empty, error, and populated states are considered.
- [ ] SEO headings, metadata, links, and crawlable content are preserved.
- [ ] Typecheck/build and actual browser checks are reported honestly.

## Deliverables
Route-specific UX diagnosis, proposed hierarchy and interaction model, token/component changes, scoped implementation, verification notes, and prioritized follow-up. Separate observed defects from design hypotheses.
