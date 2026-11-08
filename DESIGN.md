# AccaForge design system

## Art direction
A football analysis desk after the evening team-sheet drop: quiet, exact, editorial and instrument-like. The interface should feel closer to a well-made match programme and a pricing terminal than a generic betting template.

## Visual direction
- Background: deep green-black (#07110f), with restrained lifted surfaces (#0d1916 and #11211c).
- Light theme: neutral paper-white (#f4f7f4) with dark ink (#122019).
- Accent: emerald (#63d69d dark theme; #087b4a light theme). Use it for selected states, one key figure and meaningful status only.
- Borders: quiet neutral hairlines. Avoid coloured glow, hue gradients, glass effects and ornamental blobs.
- Typography: Barlow Condensed for large football/editorial headings, DM Sans for interface text, IBM Plex Mono for odds and numeric values.
- Numeric values use tabular alignment and consistent decimal precision.
- Icons: Lucide, restrained, consistent stroke and size. No emoji icons.

## Layout
- Desktop content width around 1184px with generous section spacing.
- Mobile-first reflow; no horizontal scrolling at 320–375px.
- Navigation becomes a working menu on mobile.
- Accumulator cards prioritize actual combined odds, target comparison and fixture rows.
- Rows align fixture names, market details and prices consistently.
- Use a deliberate asymmetric hero rather than a centered generic SaaS hero.

## Components and interaction
- Reuse the same button, target tab, selection row, archive row, status dot and notice treatments.
- Use subtle border and surface changes for hover/selected states.
- Keep transitions short and avoid layout animation.
- Provide visible keyboard focus and 44px minimum touch targets where practical.
- Respect prefers-reduced-motion.
- Loading, error and empty states must explain what happened and what the visitor can do next.

## Content
- Use short, specific, calm copy.
- Do not use hype, certainty language or unsupported performance claims.
- Never imply a prediction is guaranteed.
- Keep 18+ and responsible-play messaging visible.
