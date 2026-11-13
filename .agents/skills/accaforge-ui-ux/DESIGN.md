# AccaForge Design System

## Direction
**Premium football data desk:** editorial rather than casino-like; confident rather than loud; analytical rather than promotional. Forest green and navy anchor the brand; emerald marks active/positive states; warm light surfaces support long reading sessions.

## Color roles
| Role | Value | Use |
|---|---|---|
| Forest | #073B2B | Brand anchor, hero |
| Forest deep | #05291F | Deep brand surfaces |
| Emerald | #087B4A | Active links, positive state |
| Emerald dark | #075F3A | Text on light surfaces |
| Navy | #07111F | Structural contrast, headings |
| Page | #F5F7FA | App canvas |
| Surface | #FFFFFF | Main content |
| Raised | #EDF1F5 | Secondary/hover surface |
| Ink | #152231 | Primary text |
| Secondary | #465568 | Supporting text |
| Muted | #667487 | Metadata; review contrast at small sizes |
| Line | #D9E0E8 | Borders and separators |

Color is never the only status signal. Pair status colors with text or explicit labels.

## Typography
- UI/body: DM Sans, system sans-serif fallback.
- Display/headings: Barlow Condensed, DM Sans fallback.
- Numeric data: IBM Plex Mono, monospace fallback.
- Use tabular numerals for odds, percentages, scores, dates, and statistical tables.
- Keep essential instructions readable; avoid tiny uppercase tracking.

## Spacing and shape
Use a 4 px base scale: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64. Use 8–14 px radii for controls and surfaces; avoid pill-shaped everything. Prefer fine borders and restrained shadows. Separate fixture rows instead of enclosing every datum in a card.

## Layout
- Wide content max: about 1280 px; header max: about 1440 px.
- Desktop: editorial page heading and clear primary content column.
- Mobile: 320 px minimum, single-column flow, safe-area-aware fixed dock, no horizontal page scrolling.
- Dense selection data may stack on mobile; preserve labels and reading order.

## Interaction and accessibility
- Comfortable touch target: 44 × 44 px where practical.
- Visible focus: 3 px emerald outline with offset; never remove focus without replacement.
- Hover is enhancement only; all functionality works on touch and keyboard.
- Respect prefers-reduced-motion.
- Use semantic buttons/links and labelled controls; never communicate status by color alone.

## Data presentation
- Odds: decimal format, usually two decimal places.
- Percentages: one decimal place where source supports it.
- Times: Africa/Nairobi timezone and EAT label where displayed.
- Keep estimated probability distinct from bookmaker-implied probability.
- Explain denominator and sample window beside track-record metrics.
