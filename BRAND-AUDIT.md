# Brand Audit — ZB Automations Umbrella

Exhaustive inventory of every branding touchpoint across the two repos that make up the product family, done as the first task of Plan 2 (Full Brand Kit). Read this before touching any asset — several items below are **not** what the original TODO.md Plan 2 draft assumed.

Repos covered: `matrix-dash` (Matrix Dashboard, `github.com/ZachBoyd1912/matrix-dash`) and `bolt.new-custom` (Matrix Builder, `github.com/ZachBoyd1912/bolt.new-custom`, a fork of StackBlitz's open-source `bolt.new`). There is **no separate zbautomations.ie repo** — that landing page lives at `matrix-dash/deploy/landing/index.html` and is deployed to a static file root on the same VM via Caddy. Confirmed no other candidate repo exists under `~/Desktop`.

---

## 0. The headline finding

Checksum-diffed every asset in `bolt.new-custom/public/` and `bolt.new-custom/icons/` against the pristine, unmodified StackBlitz `bolt.new` source (kept locally at `~/Desktop/bolt.new original/bolt.new` for reference). **8 files are byte-identical to stock StackBlitz — zero rebranding has happened at the asset level**, despite `package.json` already saying `"name": "matrix-builder"`:

| File | Used where | Byte-identical to stock? |
|---|---|---|
| `public/favicon.svg` | Browser tab icon — `app/root.tsx` `links()`, `rel: 'icon'` | ✅ yes — **highest visibility, zero code change needed to fix** |
| `public/social_preview_index.jpg` | GitHub/social link-unfurl image, embedded in README.md | ✅ yes |
| `public/project-visibility.jpg` | Referenced from docs | ✅ yes |
| `public/logo.svg` | Not currently referenced by any component (see §2) | ✅ yes |
| `icons/logo.svg` | UnoCSS icon collection `bolt:logo` — **not referenced anywhere in app code**, dead | ✅ yes |
| `icons/logo-text.svg` | Same collection, `bolt:logo-text` — also dead/unreferenced | ✅ yes |
| `icons/chat.svg` | `bolt:chat` icon class | ✅ yes |
| `icons/stars.svg` | `bolt:stars` icon class | ✅ yes |

**Acceptance test for "done" on this repo:** re-run the same `cmp` diff against `bolt.new original/bolt.new` — zero identical files remaining.

---

## 1. Matrix Builder (`bolt.new-custom`) — full inventory

### 1a. Visual assets (real vs. assumed priority)
The original TODO.md assumed the in-app workbench header needed rebranding and that a PWA manifest existed to update. Neither is true:
- **`app/components/header/Header.tsx`** (the actual persistent header shown on every route, both pre-chat and mid-build) already renders **"Matrix" + " Builder"** as plain text — correctly branded already. It uses a generic Phosphor `i-ph:cube-duotone` icon, not a custom mark. This is a polish upgrade (give it a real mark), not a correctness fix.
- **No PWA manifest file exists at all** in this repo (`find` for `manifest*.json`/`*.webmanifest` came back empty) — "update manifest icons" from the original plan doesn't apply; adding a manifest is a stretch goal, not a rebrand requirement.
- `icons/logo.svg` and `icons/logo-text.svg` are **dead code** — grepped for `i-bolt-logo`/`bolt:logo` usage anywhere in `app/`, zero hits. Safe to either delete or replace; no runtime risk either way.
- Landing/pre-chat route (`app/routes/_index.tsx`) already sets `meta: { title: 'Matrix Builder' }` — correct, no change needed.

### 1b. Text/copy still saying "bolt.new" / "StackBlitz"
Per-file mention counts (case-insensitive, `bolt.new` or `stackblitz`):

| File | Count | Note |
|---|---|---|
| `README.md` | 8 | Title is literally `# bolt.new — custom`; opening image `alt="Bolt.new Custom..."`; explicitly describes itself as "a heavily customised fork of StackBlitz's bolt.new"; footer line `Built on [bolt.new](https://github.com/stackblitz/bolt.new)` |
| `docs/CONTRIBUTING.md` | 8 | Not yet read in detail — needs the same rewrite pass as README |
| `CHANGELOG.md` | 4 | Historical entries — leave past entries alone, don't rewrite history |
| `REVERT_DEPLOY.md` | 2 | Internal ops doc — low priority |
| `LICENSE` | 1 | **This is the legitimate MIT attribution to the upstream project — do not remove.** Open-source etiquette (and likely the license terms themselves) expects this credit to stay. |

The README's closing line `Built on [bolt.new](...) · Powered by [Google Gemini](...) · Deployed on [Firebase](...)` is the same kind of legitimate fork-attribution as the LICENSE mention — recommend keeping a small, honest "built on StackBlitz's open-source bolt.new" credit somewhere (e.g. footer or a Credits section) even after the primary branding changes, same pattern as matrix-dash's own Odysseus attribution (§4).

README also already uses the shields.io badge "pills" style the user wants replicated elsewhere:
```
[![Deploy](...)] [![Model](...)] [![Framework](...)] [![Runtime](...)] [![License](...)]
```
This is the reference pattern for matrix-dash's README (§3).

### 1c. The AI persona is named "Bolt" — bigger than an asset swap
This is not in the original TODO.md at all. The in-product AI assistant refers to **itself** as "Bolt" throughout live, user-facing chat UI copy — not just docs:

- `app/lib/.server/llm/prompts.ts` — system prompt construction, e.g. *"Bolt generates a single, substantial text block for each response..."*, *"the UI injects... 'Let Bolt decide'..."* — likely dozens more lines in this file (not fully read, this file is the system-prompt source of truth).
- `app/components/chat/AskUserDialog.tsx` — user-visible dialog copy: *"(delegated) Let Bolt decide..."*, *"Tell Bolt exactly what to do instead"*, placeholder text *"Tell Bolt what to do instead"*.
- `app/lib/chat-chips/chip-tone.ts`, `chip-quality.ts`, `chip-brand.ts`, `chip-references.ts` — chip descriptions shown in the chat UI: *"Bolt will adapt typography, palette, motion..."*, *"apply Bolt-default quality standards..."*, *"Bolt will call `open_design_system`..."*, *"Bolt will browse URLs..."*
- `app/lib/chat-chips/formatters.ts` and two `__tests__/*.spec.ts` files assert on the literal string `"Let Bolt decide"` — a rename requires updating tests too.
- `app/lib/.server/persistence/desktop-persistence.server.ts` — hardcodes save path `~/Desktop/Bolt-Projects`. **This folder exists on disk right now with real saved projects in it** (confirmed: `~/Desktop/Bolt-Projects`, 28 items). Renaming this constant changes where new projects save; it does not move existing ones.

**This is a product-identity decision, not a mechanical fix — see Decision 3 below.**

### 1d. Metadata / GitHub-level
- `package.json`: `name: "matrix-builder"`, `description: "Matrix Builder — AI website & dashboard builder"` — good. **No `repository`, `homepage`, `author`, or `bugs` fields at all.**
- Git remote confirmed: `github.com/ZachBoyd1912/bolt.new-custom` — the **repo slug itself is still `bolt.new-custom`**, independent of anything in-app. Renaming a GitHub repo changes clone URLs, breaks any existing bookmarks/CI references — see Decision 2.
- `.github/workflows/` (ci.yaml, deploy.yml, semantic-pr.yaml) and `.github/ISSUE_TEMPLATE/*` — generic names, not yet checked for body-text mentions of bolt.new. Low priority, worth a quick pass.
- `uno.config.ts` — the entire internal design-token naming convention is StackBlitz's own: custom icon collection is literally named `'bolt'` (→ classes like `i-bolt-chat`), and every CSS custom property is namespaced `--bolt-elements-*` (borderColor, background depths, button states, etc.) — **this is invisible internal plumbing, not user-facing branding.** Recommend leaving these identifier names alone (renaming would be a massive, purely-cosmetic, high-risk mechanical refactor of a live app for zero visible payoff) and only revisiting the actual color *values* if the new palette differs from today's.

### 1e. Working-tree state — handle with care
`git status` in `bolt.new-custom` shows a large set of **pre-existing uncommitted changes** (the Firebase→Cloudflare migration — matches memory of implemented-but-uncommitted work from 02/07/2026): modified auth/persistence files, deleted Firestore files, etc. Any branding edits here must land on top of this state without touching those files, and — per standing preference — **nothing gets committed in this repo; edits are left uncommitted for the user to review and commit themselves.**

---

## 2. Matrix Dashboard (`matrix-dash`) — full inventory

### 2a. Existing brand system (better than expected — build from this, don't replace it)
- **`components/layout/logo.tsx`** exports `LogoMark` — an original, hand-authored SVG: rounded square with an emerald（`#34d399`）→ sky（`#38bdf8`）gradient border/fill and a stylized "M" glyph. Not a stock asset. Already uses the exact same two accent colors as `globals.css`.
- **`app/globals.css`** defines a real, small token system: `--color-bg-base #050505`, `--color-emerald-accent #34d399`, `--color-sky-accent #38bdf8`, `--color-amber-accent #fbbf24`, `--color-rose-accent #f43f5e`, plus a radius/shadow/font scale. This sits underneath a **16-named-theme system + theme studio** (`lib/themes.ts`) — any brand-color work must slot into this as the default theme, not bypass it.
- **`deploy/landing/index.html`** is already a fully-built, polished, on-brand marketing page (title "ZB Automations — AI Automation Studio", full OG tags except image, Space Grotesk/Inter/JetBrains Mono type system) with its own hand-authored mark: a rounded dark square containing a 3-node/2-line "network" glyph (two emerald dots + one sky dot), paired with wordmark "ZB·Automations". The CSS comment here is where "Aurora Spatial" (referenced in old session memory) actually comes from — it's this page's own name for its emerald-accent/near-black/glassmorphism/aurora-gradient visual language, not a separate hidden system.
- **So there are already two distinct, deliberate marks**: the "M" glyph (Matrix Dashboard) and the 3-node network glyph (ZB Automations, the parent). Matrix Builder has no equivalent mark of its own yet (see Decision 1).
- `public/claude-logo.svg`, `public/clawd.svg`, `public/logo.png` (765KB raster) appear to be unrelated/legacy files — not referenced by `LogoMark`. Need a quick "is this referenced anywhere" grep before deleting, but they are not part of the active brand system.

### 2b. Gaps
- **`app/layout.tsx`**: sets `title: "Matrix Dashboard"` and a description, plus a `google-site-verification` meta — but **no favicon `<link>`, no `apple-touch-icon`, no OG/Twitter tags at all.** Because `public/icon.svg` lives in `public/` rather than Next's `app/` metadata-file convention, it is **not** auto-wired by Next.js — the browser tab currently shows no custom icon.
- **`app/manifest.ts`** exists (Next.js file-based PWA manifest) — auto-wires a manifest link, but need to verify the icon paths it declares actually resolve to real files (TODO.md previously flagged `icon-192.png`/`icon-512.png` as referenced-but-missing).
- **`README.md`**: solid, substantive content, but **zero shields.io badges, no header/hero image, no table of contents** — the exact gap the user wants closed to match the `bolt.new-custom` reference style. Also contains a real, must-preserve **AGPL-3.0 attribution to the Odysseus project** (theme system + Cookbook) — do not lose this crediting when adding badges/header.
- **`package.json`**: `name: "matrix-dash"` only — **no `description`, `repository`, `homepage`, `author`, or `keywords`.**
- **`docs/index.html`**: a separate, minimal Privacy Policy / ToS page (own `google-site-verification` tag, different from the one in `app/layout.tsx` — both are presumably legitimate, for different verification purposes). Its H1 uses an emerald→**violet** gradient, the only place violet is used as a primary accent instead of sky — small palette inconsistency, low priority.
- **`deploy/landing/index.html`**: no `og:image` at all (real gap — needs a generated social preview), and no explicit favicon `<link>` (relies on Caddy's `file_server` serving whatever exists at the static root, which today is nothing — zbautomations.ie currently shows no favicon).

---

## 3. Cross-cutting: docs, badges, metadata

| | matrix-dash | bolt.new-custom |
|---|---|---|
| README header/hero image | ❌ none | ✅ `social_preview_index.jpg` (stock, needs replacing) |
| README badges/pills | ❌ none | ✅ 5 shields.io badges (reference style to copy) |
| README table of contents | ❌ none | ✅ yes |
| `package.json` description | ❌ missing | ✅ present |
| `package.json` repository/homepage/author | ❌ missing | ❌ missing |
| Open-source attribution | ✅ Odysseus (AGPL-3.0), in README | ✅ StackBlitz bolt.new (MIT), in README + footer |

No pre-existing "brand kit" artifacts were found anywhere in either repo (searched both for brand/design-system/design-tokens/style-guide files). The extensive `bolt.new-custom/app/lib/.server/llm/open-design/design-systems/*/DESIGN.md` library (140+ files: stripe, linear-app, apple, notion, glassmorphism, dashboard, mission-control, etc.) and the equally large `skills/` library are **Matrix Builder's own product feature** — reference material its AI uses to design apps *for end users* — not this product's own brand identity. Worth reading `glassmorphism/DESIGN.md`, `dashboard/DESIGN.md`, and `mission-control/DESIGN.md` as free, well-written inspiration prose when writing the brand brief, since they describe close cousins of the aesthetic already in use, but they are not a substitute for defining our own.

---

## 4. Decisions needed before producing any new asset

Three things below change what gets built — locking them now avoids redoing work:

1. **Mark hierarchy for Matrix Builder.** Recommended default: keep the existing hierarchy (ZB Automations = 3-node network mark, Matrix Dashboard = "M" glyph) and give Matrix Builder a new sibling mark in the same emerald→sky glass language, replacing the generic Phosphor cube icon. This reuses what already works instead of inventing a whole new system.
2. **Rename the `bolt.new-custom` GitHub repo?** Renaming breaks the existing clone URL and any bookmarks/CI links. Default: leave the repo slug as-is (rebrand everything inside it) unless told otherwise — this is disruptive enough to warrant an explicit yes.
3. **Rename the AI persona from "Bolt"?** Real work either way — a "yes" means editing `prompts.ts` (system prompt), `AskUserDialog.tsx`, four `chip-*.ts` files, `formatters.ts`, two test files, and the `Bolt-Projects` save-folder constant (existing folder on disk keeps its name; only new projects would use a new path unless explicitly migrated). A "no" means the assistant keeps calling itself "Bolt" in conversation even after every visible asset says "Matrix Builder."

---

## 5. Asset-generation mechanism (resolved)

Neither `/design` nor `/design-sync` exists as a local skill or command (checked `~/.claude/skills`, `~/.claude/commands`, and this project's `.claude/`). The real, available mechanism is the **`DesignSync` tool** (confirmed schema): it syncs local files to a claude.ai Design-System project for visual review — it does not generate artwork itself. Concrete plan:
- **Vector marks, favicons, icons**: hand-authored SVG, matching the precedent already set by `LogoMark` and the landing page's node mark — same gradient, same geometry language, no external generator needed.
- **Raster OG/social preview images**: build a small on-brand HTML template (reusing the landing page's exact fonts/colors/aurora background), render it at 1200×630 in Chrome via the browser tools already available in this session, and screenshot it. Produces on-brand previews "like bolt.new has" without reusing anyone else's imagery.
- **Review loop**: publish the finished set (marks, color/type spec, key previews) to a Claude Design-System project via `DesignSync` so it's reviewable in the claude.ai UI before final rollout, per the original plan's intent.
- Canva's design-generation tool (`design_type: 'logo'`) is available as a fallback if hand-authored SVG doesn't hit the mark, not the primary path.

**Verification/"done" signal:** re-run the checksum diff from §0 (zero stock-StackBlitz files remaining), plus a full-repo grep for `bolt.new`/`StackBlitz`/standalone `Bolt` outside legitimate attribution lines, in both repos.
