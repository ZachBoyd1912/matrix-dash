# Monetization Plan — zbautomations.ie

> Status: **planned, not yet implemented** · Drafted 07/07/2026
> Decision: client-services funnel first; passive income (blueprint sales) deferred to a follow-up.

## Context

zbautomations.ie currently has **zero monetization surface**: no contact form, no services page, no pricing, no email capture — "Contact" routes to the GitHub repo. The business (ZB Automations, solo AI Automation Studio, Ireland) sells bespoke automation builds, but a prospect has no way to enquire or pay. This plan adds a services page with named packages (no public prices) and a fully self-hosted enquiry form (on-brand: no third-party SaaS), wired into the existing static landing bundle and GCE/Caddy deploy.

Decisions made:
1. **Direction:** client-services funnel (bespoke automation builds) before productizing anything.
2. **Contact:** self-hosted form → tiny endpoint on the VM → own SMTP. No third-party form SaaS.
3. **Pricing:** named productized packages with scope described, **no public prices** (price on enquiry).

## Verified ground truth

- Landing site = static bundle `deploy/landing/` (index, about, resources/, privacy, terms, shared.css, sitemap.xml, llms.txt), served from `/var/www/landing` by Caddy (`deploy/Caddyfile`) on the GCE e2-micro VM. Cloudflare-proxied.
- Apex CSP already has `connect-src 'self'` — a same-origin fetch POST to `/api/contact` needs **no CSP change**.
- `deploy/setup-server.sh` copies the repo Caddyfile over `/etc/caddy/Caddyfile` on every run → the new route MUST be committed to the repo Caddyfile (the builder-525 incident was exactly this trap).
- Env bootstrap pattern: copy from template **only if missing** (setup-server.sh lines 48–51) — replicate for the contact service env.
- SMTP precedent: `lib/services/email.ts` uses nodemailer `createTransport({host, port, secure: port===465, auth})` — mirror in the new service.
- Brand tokens in `deploy/landing/shared.css`: rust `--accent: #a8461f`, paper `--bg-base: #f4ecdd`, Instrument Serif italic display, Fragment Mono eyebrows; reuse `.card`, `.bento`, `.btn-primary/.btn-ghost`, `.cta-band`, `.eyebrow`, `.tags`.
- Deploy hazards (CHANGELOG-documented): exit 0 ≠ live change → curl-verify everything; never mutate the live standalone app dir; do NOT run full `setup-server.sh` (it git-pulls and rebuilds the app) — targeted rsync only.

## Part 1 — Services page: `deploy/landing/services.html` (new)

Single page: positioning → packages → enquiry form (`#enquire`).

- Head/nav/footer identical patterns to `about.html`; canonical `https://zbautomations.ie/services.html`.
- Hero: eyebrow "Client Services · Ireland & remote"; serif-italic heading ("Bespoke automation, built and run for you."); lede reusing the private/local-first philosophy.
- Four packages as `.card`s in the `.bento` grid, Fragment Mono numbered eyebrows 01–04, scope bullets + deliverables `.tags` + `btn-ghost` "Enquire →" anchoring to `#enquire` (pre-selects package via `data-package`):
  1. **Automation Audit** — workflow mapping, prioritized roadmap; deliverables: written audit + walkthrough call.
  2. **Custom AI Pipeline** — Make.com scenarios / AI pipelines wired into existing tools; deliverables: built+tested scenarios, docs, handover.
  3. **Dashboard & Internal Tool Build** — bespoke self-hosted tools (Matrix portfolio as proof); deliverables: deployed tool, source, runbook.
  4. **Automation Retainer** — monthly build allocation, monitoring, priority support.
  - Each card ends "Scoped and priced on enquiry." No prices anywhere.
- Enquiry form in the `.cta-band` shell: `name` (≤100), `email` (≤200), `package` (select: 4 packages + "Not sure yet"), `message` (textarea, maxlength 4000), honeypot field `website` (off-screen), hidden `ts` (epoch ms set by JS). Submit via `fetch('/api/contact')`, inline `aria-live` success/failure (mailto fallback shown only on failure). No page reload.
- JSON-LD: `ProfessionalService` (areaServed IE + remote, founder Zach Boyd) with `hasOfferCatalog` → 4 `Offer`s, each `itemOffered: Service`, **no price property**. Validate JSON parses + tag balance (Plan 19 precedent).
- `shared.css`: append one section — input/select/textarea styles from existing tokens, `.form-status` colors, `.pkg-num`, honeypot off-screen class.

## Part 2 — Contact endpoint: `deploy/contact-service/` (new dir)

Standalone single-file Node service (no framework) + nodemailer, systemd unit, Caddy reverse-proxy. Rationale: the Next.js app is behind Cloudflare Access (public POST can't reach it without a bypass rule) and app rebuilds are high-risk on this VM — cheap isolation wins.

- **`server.mjs`** (~120 lines): `node:http` on `127.0.0.1:3002` (verify free with `ss -ltn`; 3000=matrix, 5001=builder). Routes: `POST /api/contact`, `GET /api/contact/health` → `{ok:true}`; else 404.
  - Validation: JSON only; body >16KB → 413; field caps as above; `package` enum-checked; message ≥20 chars; email regex. User input never reaches headers except validated `Reply-To`.
  - Spam defense (no captcha): honeypot non-empty → 200 + silent drop; `now − ts < 3000ms` → 200 + silent drop; in-memory rate limit 3/10min per IP (from `CF-Connecting-IP`, fallback XFF first hop, then socket) → 429; global cap 20/hour.
  - Delivery: `From: CONTACT_FROM` (authenticated SMTP identity so SPF/DKIM pass), `To: CONTACT_TO`, `Reply-To: submitter`, plain text. SMTP failure → 502 `{ok:false}`. Log to journal only (no message bodies — privacy brand).
- **`package.json`**: nodemailer only, `"private": true`, **no prepare script** (husky trap).
- **`contact-form.service`**: systemd unit — `EnvironmentFile=/etc/contact-form.env`, `Restart=always`, `MemoryMax=96M`, `NoNewPrivileges`, `ProtectSystem=strict`, `ProtectHome`, `PrivateTmp`.
- **`contact-form.env.example`**: `CONTACT_SMTP_HOST/PORT/USER/PASS`, `CONTACT_TO`, `CONTACT_FROM`, `CONTACT_PORT=3002`. Real file hand-created at `/etc/contact-form.env`, chmod 600, never committed, never overwritten by scripts.

### Caddyfile change (`deploy/Caddyfile`, apex block — same commit as the service)

```caddyfile
handle /api/contact* {
    reverse_proxy localhost:3002
}
handle {
    root * /var/www/landing
    file_server
}
```

`caddy validate` before copying.

### setup-server.sh amendment (same commit)

New step between 6 and 7: rsync `deploy/contact-service/` → `/opt/contact-form/`, `npm install --omit=dev`, bootstrap `/etc/contact-form.env` from example **only if missing** (mirror lines 48–51 pattern), install + enable unit. Prevents a future full run from wiping the service.

## Part 3 — Nav/CTA rewiring (all 5 existing pages)

- `index.html`: add `Services` nav link; swap ghost hero button → "Work with me →" (`/services.html`); repoint bottom `.cta-band` primary button → `/services.html#enquire`; footer Company group: add Services + Contact; extend Organization JSON-LD with `contactPoint` (sales → `/services.html#enquire`).
- `about.html`: "Get in touch" section now leads with the enquiry form; GitHub demoted to "source lives at…".
- `resources/index.html`, `privacy.html`, `terms.html`: add Services to nav + footer (footer markup duplicated per page — update each).
- `privacy.html`: add one line — enquiry data is emailed to the operator, not stored server-side (GDPR + brand story).

## Part 4 — SEO/GEO registration

- `sitemap.xml`: add services.html (priority 0.9, monthly, lastmod = deploy date).
- `llms.txt`: add `## Services` section (4 packages, pricing on enquiry); **amend "Important context"** — currently asserts there is no form at all, which would make AI engines tell prospects there's no way to hire Zach; update `## Contact` (form first, GitHub second) and `## Pages`.

## Part 5 — Deploy (targeted; do NOT run full setup-server.sh, no git pull/build on VM)

1. Pre-flight on VM (`gcloud compute ssh`): `free -h`, `ss -ltn` (3002 free), services green.
2. rsync `deploy/contact-service/` → VM `/opt/contact-form/`; `npm install --omit=dev` there.
3. Hand-create `/etc/contact-form.env` with real SMTP creds (chmod 600). **User must supply SMTP creds.**
4. Install unit → `systemctl enable --now contact-form`; check journal + `curl localhost:3002/api/contact/health`.
5. `caddy validate` → copy Caddyfile → `systemctl reload caddy` (reload, not restart).
6. `sudo rsync -a --delete <staged>/landing/ /var/www/landing/`.
7. Never touch `/opt/matrix-dash` or the standalone dir.

## Part 6 — Verification (curl everything; exit 0 proves nothing)

1. `curl -sI https://zbautomations.ie/services.html` → 200 + security headers.
2. All prior pages still 200; `matrix.`/`builder.` still 302 (Access untouched).
3. `curl -s https://zbautomations.ie/ | grep services.html` — rewiring live.
4. Endpoint from outside: valid POST → 200 **and email arrives with working Reply-To** (the test that matters); honeypot → 200 no email; fast `ts` → 200 no email; 4 rapid posts → 429; 20KB → 413; bad fields → 400.
5. Real browser end-to-end: package pre-select, submit, inline success, delivery confirmed.
6. JSON-LD via Rich Results test; resubmit sitemap in Search Console.
7. VM health: `free -h`, all services green, journal clean.

## Risks

- e2-micro RAM: service is idle-light, `MemoryMax=96M`; don't rebuild the app in the same session.
- Cloudflare Bot Fight Mode may challenge POSTs — test from a clean network; optionally add the free-tier WAF rate rule on `/api/contact` as an outer layer.
- Deliverability: if SMTP host is Gmail, app password required.

## Implementation order

1. `deploy/contact-service/*` (testable locally with real SMTP cred first)
2. `shared.css` additions + `services.html`
3. Nav/footer/CTA edits across 5 pages
4. `sitemap.xml`, `llms.txt`, `privacy.html` line
5. `deploy/Caddyfile` + `setup-server.sh` amendments (same commit as 1)
6. Deploy (Part 5), verify (Part 6)

## Deferred follow-up: passive income — blueprint sales

Decided but explicitly OUT of this plan's scope ("funnel now, passive later"):

- Package 3–5 existing Make.com blueprints as sellable products on **Gumroad** and/or the **n8n creator marketplace** (marketplaces bring their own discovery — key while site traffic is low).
- Add a "Blueprints" page to the landing site linking to listings.
- Zach creates the Gumroad/n8n accounts; Claude drafts listings/docs.
- Other passive streams considered and not selected for now: Make/n8n affiliate links (Make pays 35% of referred payments for 12 months), GitHub Sponsors, faceless-YouTube research via NexLev.
