# ZB Automations Brand Spec (v1)

One-page reference so every asset produced in this rollout stays consistent. Extracted from the system that already existed in the code (`globals.css`, `LogoMark`, `deploy/landing/index.html`) plus the three gating decisions confirmed 04/07/2026: Matrix Builder gets a new sibling mark, the `bolt.new-custom` repo slug stays as-is, and the AI persona renames from "Bolt" to "Matrix."

## Color

| Token | Value | Use |
|---|---|---|
| bg-base | `#050505` | page background |
| bg-surface | `#0d0d0d` | cards, panels |
| bg-elevated | `#141414` | raised surfaces |
| text-primary | `#e8e8e8` | body text |
| text-secondary | `#8a8a8a` / `#888888` | secondary text |
| text-muted | `#555555` | least emphasis |
| **emerald** (signature accent) | `#34d399` | primary — logo gradients, links, CTAs |
| **sky** (secondary accent) | `#38bdf8` | used sparingly — gradient endpoint, secondary highlights |
| violet (ambient only) | `#a855f7` | background orbs/glow only — never a primary UI color, never a mark color |
| amber | `#fbbf24` | status/warning only |
| rose | `#f43f5e` | status/error only |

Rule: **emerald→sky gradient is the brand signature.** Every mark uses this exact two-stop gradient. Violet/amber/rose are ambient or status colors, never used in logos.

## Typography

- **Product chrome (dashboard UI, in-app)**: Geist Sans / Geist Mono — already in use, stays as-is. This is a deliberate split, not an inconsistency: dense UI needs Geist's readability at small sizes.
- **Marketing surfaces (landing pages, hero sections, README headers)**: Space Grotesk (display/headings), Inter (body), JetBrains Mono (code/labels) — already established in `deploy/landing/index.html`.

## Mark system — three sibling marks, one language

Every mark shares: a rounded-square container (viewBox 0 0 32 32, corner radius ~8-9), the emerald→sky gradient, ~2px stroke weight with round caps/joins on interior linework, and either a gradient-tinted fill or a dark fill with a subtle gradient border.

| Product | Mark | File(s) |
|---|---|---|
| **ZB Automations** (umbrella/parent) | 3-node network glyph — two emerald dots + one sky dot, joined by thin lines | inline in `deploy/landing/index.html` (nav + footer) |
| **Matrix Dashboard** | "M" glyph, drawn as a single stroked path | `LogoMark` in `components/layout/logo.tsx` |
| **Matrix Builder** (new, this rollout) | "\>_" prompt/cursor glyph — a chevron + cursor bar, echoing the landing page's terminal motif and Builder's "describe it, ship it" identity | `BuilderMark` in `components/layout/logo.tsx` (source of truth) → ported as raw SVG into `bolt.new-custom/public/favicon.svg`, `public/logo.svg`, `icons/logo.svg` |

## Voice

- Product names: **Matrix Dashboard**, **Matrix Builder**, parent brand **ZB Automations**.
- The in-product AI assistant in Matrix Builder is renamed from "Bolt" to **"Matrix"** in all user-facing copy (chat dialogs, chip descriptions, system prompt self-references). The `~/Desktop/Bolt-Projects` save-folder path is left unchanged — existing user projects live there; only the spoken persona changes this round.
- Legitimate open-source attributions are kept, not deleted: Matrix Dashboard credits **Odysseus** (AGPL-3.0) for the theme system; Matrix Builder credits **StackBlitz's bolt.new** (MIT) as the project it's forked from.

## Acceptance test

`bolt.new-custom` asset replacement is done when a checksum diff against `~/Desktop/bolt.new original/bolt.new` returns **zero** identical files (see `BRAND-AUDIT.md` §0 for the list of 8 to fix).
