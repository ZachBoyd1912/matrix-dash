# 📋 Matrix Dashboard & Builder — Implementation Plans

## 🔧 Plan 1: Custom Zip Filename for Matrix Builder Downloads

### Goal
Replace the hardcoded `project.zip` download filename with a sanitized slug derived from the actual brand/project name displayed in the Matrix Builder UI.

### Problem
`bolt.new-custom/app/lib/download.ts:37` always outputs `project.zip` regardless of what the brand/project is. Users downloading multiple projects lose track — they all arrive as `project.zip`.

### Solution Overview
Extract the artifact title (already parsed from `<boltArtifact title="...">` in `message-parser.ts:338`), slugify it, and pass it through to the `downloadProject()` function.

### Tasks

- [ ] **Create slugify utility** — new file `bolt.new-custom/app/utils/slug.ts`
  - Accept a string (e.g., `"The Greater Flaw — Band Website"`) and return a URL/filesystem-safe slug
  - Slug rules: lowercase, strip emoji, replace `&` → `and`, replace `—`/`-`/spaces → hyphens, collapse multiple hyphens, strip non-alphanumeric chars except hyphens
  - Edge cases: `"Ember&Bean"` → `"ember-and-bean"`, accented chars → ASCII equivalents, empty/`undefined` → `"project"`, titles > 64 chars truncated at word boundary
  - Export: `export function slugify(title: string): string`

- [ ] **Update `downloadProject()` signature** — `bolt.new-custom/app/lib/download.ts`
  - Change `downloadProject(files: FileMap)` → `downloadProject(files: FileMap, title?: string)`
  - At line 37: replace `anchor.download = 'project.zip'` with `anchor.download = \`${slugify(title ?? "project")}.zip\``
  - Import `slugify` from `~/utils/slug`

- [ ] **Plumb artifact title from workbench store** — `bolt.new-custom/app/components/workbench/Workbench.client.tsx`
  - At line 143 (where `downloadProject(files)` is called), read `firstArtifact?.title` from `workbenchStore.artifacts`
  - Pass title as second argument: `downloadProject(files, artifactTitle)`

- [ ] **Verification**
  - Build a test project in Matrix Builder with a known brand name (e.g., "Artisan Coffee — Foundation")
  - Click download → verify zip is named `artisan-coffee-foundation.zip` not `project.zip`
  - Test edge cases: emoji in title, special chars, very long titles, empty title

### Files Touched
| File | Action |
|------|--------|
| `bolt.new-custom/app/utils/slug.ts` | **NEW** — slugify utility |
| `bolt.new-custom/app/lib/download.ts` | Edit — accept title, use slugified name |
| `bolt.new-custom/app/components/workbench/Workbench.client.tsx` | Edit — read artifact title, pass to download |

### 🔗 Dependencies
- `fflate` (already in `bolt.new-custom/package.json`)

### 🧠 Skills
`@senior-frontend` `@frontend-dev-guidelines` `@brainstorming` `@senior-architect`



## 🎨 Plan 2: Full Brand Kit — Matrix Dashboard & Matrix Builder (ZB Automations Umbrella)

### Goal
Create a complete brand identity kit covering every asset type (logos, icons, favicons, PWA icons, social cards, typography, color system) and apply it to every corner of the ZB Automations ecosystem: Matrix Dashboard, Matrix Builder, and `zbautomations.ie`.

### Problem
The brand experience is fragmented — inline SVG "M" logo only, missing PWA icons (`icon-192.png`/`icon-512.png` referenced in manifest but don't exist), no favicon link tags, different logo on landing page, barebones README.

### Solution Overview
Claude Design generates the full brand kit. Claude Code then applies it across all repos and files.

### Tasks

#### 🎨 Phase 1: Claude Design — Generate Brand Kit

- [ ] **Invoke Claude Design** via `/design-sync` or direct prompt with these specs:
  - **ZB Automations** (parent): Modern automation/AI tools company — sleek, technical
  - **Matrix Dashboard** (sub-brand): Local-first AI command center — dark theme, emerald-sky gradient (`#10b981` → `#0ea5e9`), monospace, glassmorphism
  - **Matrix Builder** (sub-brand): Conversational website/app builder — AI-powered, creative, approachable, clean landing page
- [ ] **Deliverables from Claude Design**:
  - SVG logos: full, mark-only, wordmark — for all 3 brands
  - PNG icons: 16x16, 32x32, 180x180 (Apple touch), 192x192 (PWA), 512x512 (PWA)
  - Favicon package: `favicon.ico` (multi-size), `favicon-16x16.png`, `favicon-32x32.png`, `apple-touch-icon.png`, `android-chrome-192x192.png`, `android-chrome-512x512.png`
  - Social cards: Open Graph `og-image.png` (1200x630) for all 3 brands
  - PWA manifest icons: `icon-192.png` (maskable), `icon-512.png` (maskable)
  - Brand color palette: Hex codes, CSS variable version, Tailwind v4 config, UnoCSS config (for Matrix Builder)
  - Typography system: Heading font, body font, monospace font with fallback stacks
  - Brand guidelines PDF: Logo usage, spacing, minimum sizes, do's/don'ts

#### 📦 Phase 2: Claude Code — Apply Brand Kit to Matrix Dashboard (`matrix-dash`)

- [ ] **Public assets** — place all generated files in `public/`:
  - `icon.svg`, `icon-192.png`, `icon-512.png`, `favicon.ico`, `apple-touch-icon.png`, `og-image.png`
- [ ] **HTML head** — `app/layout.tsx`:
  - Add `<link rel="icon">` (favicon), `<link rel="apple-touch-icon">`, `<meta property="og:image">`
  - Update `<title>` from `"Matrix Dashboard"` to include ZB Automations parent branding
- [ ] **PWA manifest** — `app/manifest.ts`:
  - Verify all icon paths resolve (currently `icon-192.png` and `icon-512.png` don't exist)
  - Update `name` and `short_name` with new branding
  - Verify `background_color` and `theme_color` match brand palette
- [ ] **Logo component** — `components/layout/logo.tsx`:
  - Replace inline SVG "M" letterform with new Matrix Dashboard brand SVG
- [ ] **Sidebar brand text** — `components/layout/sidebar.tsx:39`:
  - Update brand display text
- [ ] **Topbar fallback** — `components/layout/topbar.tsx:33`:
  - Update fallback brand text
- [ ] **Landing pages** — `public/index.html` and `docs/index.html`:
  - Update `<title>`, meta description, add favicon links
- [ ] **Documentation**:
  - `README.md` — add brand header section with logo, update tech badges
  - `CHANGELOG.md` — add brand section to header

#### 📦 Phase 3: Claude Code — Apply Brand Kit to Matrix Builder (`bolt.new-custom`)

- [ ] **Favicons** — replace `public/favicon.ico` and all favicon variants
- [ ] **HTML head** — update `<title>` and meta tags in `app/entry.server.tsx` and `root.tsx`
- [ ] **Landing page header** — replace logo in pre-chat landing page
- [ ] **PWA manifest** — update icons and brand name
- [ ] **Brand colors** — apply to `uno.config.ts` (Matrix Builder uses UnoCSS, not Tailwind)
- [ ] **Workbench header** — brand the header where the download button lives
- [ ] **Documentation** — update `README.md` and `CHANGELOG.md`

#### 📦 Phase 4: Claude Code — Apply Brand Kit to ZB Automations Landing

- [ ] **`deploy/landing/index.html`**:
  - Replace 3-dot logo with new ZB Automations logo
  - Update `<title>`, all meta tags, Open Graph tags
  - Apply brand colors and typography from the brand kit

### Files Touched
30+ files across 2 repos (`matrix-dash` + `bolt.new-custom`) + landing page.

### 🧠 Skills
`@frontend-design` `@senior-frontend` `@senior-architect` `@brainstorming` `@documentation`



## 🖌️ Plan 3: Full UI Redesign — Matrix Dashboard → Matrix Builder Aesthetic

### Goal
Redesign the entire Matrix Dashboard UI to visually align with the Matrix Builder's main landing page (the pre-chat screen shown before the first message). The two products should feel like a cohesive product family.

### Problem
Matrix Dashboard and Matrix Builder currently look like completely different products — Dashboard has a terminal/dark aesthetic with emerald-sky gradients and card layouts, while Builder's landing page has a cleaner, more modern, prompt-centric design. They need a unified design language.

### Reference
Screenshot at `/Users/zach/Desktop/matrix-dash/builder-main-page-02/07/26.png` — use this as the primary visual reference.

### Solution Overview
Claude Design produces the complete design system. Claude Code implements it progressively across all dashboard components and pages.

### Tasks

#### 🎨 Phase 1: Claude Design — Design the New Dashboard UI

- [ ] **Invoke Claude Design** via `/design-sync` or direct prompt with these specs:
  - **Reference**: Screenshot at `/Users/zach/Desktop/matrix-dash/builder-main-page-02/07/26.png`
  - **What Matrix Dashboard is**: A local-first AI command center with ~17 dashboard pages + 20+ settings sub-pages. Sidebar + topbar + content layout. Built with Next.js 15, React 19, Tailwind CSS v4.
- [ ] **Deliverables from Claude Design**:
  - **Color system**: Extract exact palette from builder landing page (bg, surface, accent, text hierarchy, borders). Produce CSS variables + Tailwind v4 config overrides. Dark and light variants.
  - **Typography**: Match builder font choices (headings, body, monospace) with fallback stacks. Produce Tailwind font config.
  - **Layout conventions**: Card styles, spacing rhythm (4px base), border radius scale, shadow language, container max-widths.
  - **Sidebar design**: Colors, typography, icon style (Lucide), active state indicators, collapse behavior — matched to builder nav aesthetic.
  - **Topbar design**: Breadcrumbs, search, notification bell, theme toggle — matched to builder header style.
  - **Component library**: Full restyle spec for buttons (primary/secondary/ghost/destructive), inputs, cards, tabs, dialogs, toasts, badges, toggles, dropdown menus, command palette — all matching builder's design language.
  - **Page mockups**: Dashboard Overview (homepage), Chat interface, Settings — as visual reference for implementation.
  - **Typography scale**: Size, weight, line-height specs for each heading/body level.

#### 📦 Phase 2: Claude Code — Implement the Redesign (Progressive Rollout)

##### 🏗️ Tier 1: Theme Foundation (cascades everywhere)

- [ ] **`lib/themes.ts`** — add new builder-aligned theme entry (or update the default/primary theme)
  - Map all color tokens: `--background`, `--foreground`, `--card`, `--card-foreground`, `--primary`, `--primary-foreground`, `--secondary`, `--muted`, `--accent`, `--border`, `--ring`, `--destructive`, `--success`, `--warning`
  - Define both dark and light variants
- [ ] **`app/globals.css`** — update CSS variables to match Claude Design output
  - Ensure `@theme` blocks in Tailwind v4 style are consistent
  - Add any new utility classes needed
- [ ] **Tailwind v4 config** — if `postcss.config.mjs` or any tailwind config needs updating for brand colors/typography
- [ ] **Verify `next-themes` integration** — both `dark` and `light` class toggles work with new palette

##### 🏗️ Tier 2: Layout Shell (affects every page)

- [ ] **`components/layout/sidebar.tsx`** — full redesign:
  - Background, text colors, active nav item indicator
  - Logo area with new brand mark
  - Navigation item spacing, icon sizing, font weights
  - Collapse/expand states
  - Bottom section (settings, theme toggle area)
- [ ] **`components/layout/topbar.tsx`** — full redesign:
  - Page title/breadcrumb styling
  - Search bar (command palette trigger)
  - Notification bell
  - Theme toggle
  - Mobile hamburger
- [ ] **`components/layout/mobile-nav.tsx`** — match builder aesthetic:
  - Bottom tab bar colors, active indicator
  - Icon and label styling
- [ ] **`components/layout/dashboard-shell.tsx`** — if layout structural adjustments are needed

##### 🏗️ Tier 3: UI Primitives (cascades to all components)

- [ ] **`components/ui/button.tsx`** — variants, sizes, hover/focus/active states, loading state
- [ ] **`components/ui/card.tsx`** — shadows, borders, border-radius, padding, header/footer
- [ ] **`components/ui/input.tsx`** — input, textarea, focus rings, error states
- [ ] **`components/ui/tabs.tsx`** — tab indicator, active/inactive states, list overflow
- [ ] **`components/ui/dialog.tsx`** — backdrop blur, content panel, close button
- [ ] **`components/ui/toast.tsx`** / `toaster.tsx` — toast appearance, icon, close button
- [ ] **`components/ui/badge.tsx`** — variants (default, secondary, outline, destructive)
- [ ] **`components/ui/toggle.tsx`** — on/off states
- [ ] **`components/ui/dropdown-menu.tsx`** — item spacing, hover states, separators
- [ ] **`components/ui/select.tsx`** — trigger, content, item styling
- [ ] **`components/ui/separator.tsx`** — colors, thickness

##### 🏗️ Tier 4: Key Pages (highest traffic)

- [ ] **`app/dashboard/page.tsx`** (Overview) — the homepage:
  - Grid layout, stat cards, quick actions, recent activity
  - Match builder's card density and visual hierarchy
- [ ] **`app/dashboard/chat/page.tsx`** and chat components:
  - `components/chat/chat-interface.tsx` — message list container
  - `components/chat/message-bubble.tsx` — user vs assistant styling
  - `components/chat/chat-input.tsx` — prompt input styling (match builder landing page input!)
  - `components/chat/artifact.tsx` — artifact cards
  - `components/chat/thinking-block.tsx` — thinking/chain-of-thought blocks
  - `components/chat/model-selector.tsx` — provider/model dropdown
- [ ] **Settings pages** — `app/dashboard/settings/`:
  - Update settings layout (`layout.tsx`) sidebar styling
  - Ensure all settings sub-pages inherit new UI primitives

##### 🏗️ Tier 5: Remaining Pages (consistency sweep)

- [ ] **Memory Bank** — `app/dashboard/memory-bank/` + `components/memory-bank/`
- [ ] **Notes** — `app/dashboard/notes/` + `components/notes/`
- [ ] **Tasks** — `app/dashboard/tasks/`
- [ ] **Project Planning** — `app/dashboard/project-planning/` + `components/projects/`
- [ ] **Calendar** — `app/dashboard/calendar/`
- [ ] **Email** — `app/dashboard/email/`
- [ ] **Research** — `app/dashboard/research/`
- [ ] **Compare** — `app/dashboard/compare/`
- [ ] **Images** — `app/dashboard/images/`
- [ ] **Skills** — `app/dashboard/skills/`
- [ ] **Sessions** — `app/dashboard/sessions/`
- [ ] **IDE** — `app/dashboard/ide/` + `components/ide/`
- [ ] **Console** — `app/dashboard/console/` + `components/console/`
- [ ] **Matrix Builder gate** — `app/dashboard/matrix-builder/` + `components/matrix-builder/`

##### 🔍 Tier 6: Verification

- [ ] **TypeScript** — `pnpm typecheck` must pass with zero errors
- [ ] **Visual QA** — side-by-side comparison of Dashboard Overview vs Builder landing page reference
- [ ] **Dark mode** — toggle theme, verify all pages render correctly in both modes
- [ ] **Mobile** — verify responsive layout, sidebar collapse, mobile nav
- [ ] **Accessibility** — check color contrast ratios, focus indicators, keyboard navigation

### Files Touched
40+ files in `matrix-dash` — `app/globals.css`, `lib/themes.ts`, full `components/layout/`, full `components/ui/`, full `components/chat/`, all 17+ dashboard pages.

### 🧠 Skills
`@frontend-design` `@senior-frontend` `@antigravity-design-expert` `@senior-architect` `@brainstorming`
