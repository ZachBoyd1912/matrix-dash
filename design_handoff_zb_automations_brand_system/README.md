# Handoff: ZB Automations Brand System (4 Directions)

## Overview
Four complete, independent brand-identity directions for **ZB Automations**, the parent umbrella brand over two sibling products: **Matrix Dashboard** (local-first, self-hosted AI command center) and **Matrix Builder** (AI website/app builder). Each direction is a full system: parent mark, two product sub-marks, favicon/app-icon sets, OG banners, README treatment, color system (light+dark), type system, and applied UI mockups for both products.

Directions:
- **1a — Terminal Aurora**: dark glass-terminal, emerald→sky gradient, rounded-glass marks.
- **1b — Signal Bright**: flat light-first indigo system, no gradients, solid monogram marks.
- **1c — Deep Circuit**: true-black schematic/circuit-trace system, all-monospace type, phosphor green.
- **1d — Paper Signal**: warm editorial paper system, wax-seal ring mark, serif-italic display type.

The user has selected **1d — Paper Signal** as the preferred direction to move forward with, but all four are included for reference/comparison.

## About the Design Files
The bundled HTML file is a **design reference built in HTML** (a Design Component prototype) — it shows exact colors, type, mark construction, and applied UI, but it is not production code to copy verbatim. The task is to **recreate this design in the target codebase's real environment** (the Matrix Dashboard Next.js/TypeScript/Tailwind app, the Matrix Builder app, and each product's README/marketing assets) using each codebase's existing conventions — not to ship the HTML directly.

The file also has a small **Tweaks panel** wired in (three props: `focus`, `atmosphere`, `typeEnergy`) purely to let reviewers compare directions live in the browser — these are review affordances, not something to port into production.

## Fidelity
**High-fidelity.** Every color is a real hex value, every font is a real Google Fonts family, every mark is real SVG path/shape construction (no photographic or 3D elements) — all directly implementable.

## Recommended direction to implement: 1d — Paper Signal

### Color system
Light "paper" mode (default):
- `bg-paper` (page background): `#f4ecdd`
- `bg-card` (card/surface): `#faf5ea`
- `bg-elevated`: `#ece1cb`
- `signal` (primary/rust — links, primary buttons, active states): `#a8461f`
- `accent` (ochre — secondary highlights): `#c99a3d`
- `success`: `#3f6b3f`
- `error`: `#8c2f22`
- Ink/text: `#241c14` (headings), `#5c5142` (body)

Dark "ink" mode:
- `bg-base`: `#17120c`
- `bg-card`: `#201a12`
- `bg-elevated`: `#2a2318`
- `signal`: `#d97a52`
- `accent`: `#e0b869`
- `success`: `#6a9c6a`
- `error`: `#c96450`
- Text on dark: `#f2ead9`

### Typography
- Display / H1: **Instrument Serif**, italic, weight 400 — 42–64px
- H2: **Work Sans** 700, 26px
- Body: **Work Sans** 400/500, 16px / 13px small
- Ref/label/mono (timestamps, ref numbers, badges): **Fragment Mono**, 11px
All three are available via Google Fonts (`Instrument+Serif:ital@0;1`, `Work+Sans:wght@400;500;600;700`, `Fragment+Mono`).

### Marks
Construction logic: a **wax-seal stamp** — two concentric ink-stroked rings (outer r=14.5, inner r=10.5 on a 32×32 grid, stroke `#a8461f`, no fill, no gradients, no squares/rounded-rect containers).
- **ZB Automations parent mark**: ring + centered sunburst glyph (8 short radiating strokes from the ring's center).
- **Matrix Dashboard sub-mark**: ring + a dial/gauge glyph (arc + needle + center dot) — reads as "signal reading."
- **Matrix Builder sub-mark**: ring + a drafting-compass glyph (two legs meeting at a point + a horizontal spread base) — reads as "drafting/construction."
- Wordmark: "ZB Automations" set in Instrument Serif italic, no lockup box.
- Favicon/app icon set: same ring+glyph mark, solid-fill version (ink-on-rust or rust-on-paper) at 16/32/180/192/512px, generated for both products.

### Applied UI direction
- Matrix Dashboard: paper background, cream sidebar with a bottom-border (not pill) active-state indicator, serif-italic headline, Fragment Mono badges/labels, stat cards on `bg-card` with hairline borders (no shadows).
- Matrix Builder: centered landing layout, same paper background, prompt input box styled as a plain-bordered card (no glow/gradient), rust as the single call-to-action color.
- No drop shadows anywhere in this direction — depth comes from hairline borders and flat color steps only.

### OG banner (1200×630) copy
- Matrix Dashboard: "Read the signal, not the noise." / byline "by ZB Automations" in Fragment Mono, rust.
- Matrix Builder: "Drafted by you, built by morning." / same byline treatment.

### README badge/pill treatment
Outline pills (transparent bg, `1px solid rgba(36,28,20,0.3)`, ink text) for framework/language, solid rust pill for the primary "styling" badge, solid ochre pill for "self-hosted" — Fragment Mono, 11px, all-lowercase-with-colons label style (`framework: Next.js 15`).

## Other directions (for comparison — token summary only)
- **1a Terminal Aurora**: bg `#050505`/`#0d0d0d`, accent gradient `#34d399→#38bdf8`, warning `#fbbf24`, error `#f43f5e`. Type: Space Grotesk (display) + Inter (body) + JetBrains Mono (labels/code). Marks: rounded-glass squares (radius 9 on 32px grid) with gradient-stroke glyphs.
- **1b Signal Bright**: bg `#f7f8fb`/`#fff`, primary `#4f46e5`, accent `#f59e0b`, success `#16a34a`, error `#dc2626`. Type: Sora (display) + Manrope (body) + IBM Plex Mono (labels). Marks: flat solid-indigo squares (radius 6), no gradients — Dashboard uses vertical equalizer bars, Builder uses ascending bars.
- **1c Deep Circuit**: bg `#000000`/`#0a0a0a`, signal `#39ff88` (phosphor green), secondary `#ff8a3d`, warning `#ffb020`, error `#ff3b3b`. Type: **all-monospace** — JetBrains Mono (display/labels) + Space Mono (body). Marks: orthogonal circuit-trace squares (radius 2, hard corners only, no curves).

Full swatches, type scales, favicon sets, OG banners, and applied UI for all four directions are visible in the bundled HTML file (`ZB Automations Brand Directions.dc.html`) — open it in a browser to inspect/compare live, including the Tweaks panel (Focus / Atmosphere / Type Energy) for spotlighting one direction at a time.

## Design Tokens (1d Paper Signal — quick reference for implementation)
| Token | Value |
|---|---|
| `--bg-paper` | `#f4ecdd` |
| `--bg-card` | `#faf5ea` |
| `--bg-elevated` | `#ece1cb` |
| `--signal-rust` | `#a8461f` |
| `--accent-ochre` | `#c99a3d` |
| `--success` | `#3f6b3f` |
| `--error` | `#8c2f22` |
| `--ink-heading` | `#241c14` |
| `--ink-body` | `#5c5142` |
| `--font-display` | `'Instrument Serif', serif` (italic) |
| `--font-body` | `'Work Sans', sans-serif` |
| `--font-mono` | `'Fragment Mono', monospace` |
| Border radius (cards/panels) | `8–10px` |
| Border radius (favicons/marks) | none — circular ring construction |
| Shadows | none used in this direction (flat + hairline borders only) |

## Assets
No external logo/icon files were provided as source material — all marks in this bundle are original SVG constructions built for this project (ring + glyph geometry, real path coordinates included inline in the HTML). No photographic or generated imagery is used anywhere.

## Files
- `ZB Automations Brand Directions.dc.html` — the full reference file, all 4 directions, side-by-side. Open directly in a browser.
