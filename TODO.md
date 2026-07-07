<style>
/* ═══════════════════════════════════════════════════════
   MATRIX TODO — Glassmorphism Implementation Dashboard
   Renders in: VS Code preview · Obsidian · Typora · Marked
   Fallback: pure markdown below is fully readable
   ═══════════════════════════════════════════════════════ */
:root{--bg:#08080a;--surface:#0f0f14;--border:#1e1e2e;--emerald:#10b981;--emerald-glow:rgba(16,185,129,.15);--sky:#0ea5e9;--sky-glow:rgba(14,165,233,.1);--text:#e2e8f0;--muted:#64748b;--rose:#f43f5e;--amber:#f59e0b;--violet:#8b5cf6;--radius:.85rem;--font-mono:'SF Mono','Fira Code','Cascadia Code','JetBrains Mono',monospace;--font-sans:'SF Pro Display',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--text);font-family:var(--font-sans);line-height:1.6;-webkit-font-smoothing:antialiased;max-width:100%;overflow-x:hidden}
/* ── HERO ── */
.todo-hero{position:relative;padding:3.5rem 2rem 2.5rem;text-align:center;overflow:hidden;border-bottom:1px solid var(--border)}
.todo-hero::before{content:'';position:absolute;inset:0;background:radial-gradient(ellipse 70% 50% at 50% 0%,var(--emerald-glow),transparent 70%),radial-gradient(ellipse 35% 35% at 85% 90%,var(--sky-glow),transparent 70%);pointer-events:none}
.todo-hero::after{content:'';position:absolute;top:0;left:0;right:0;height:1px;background:linear-gradient(90deg,transparent,var(--emerald),var(--sky),transparent);opacity:.6}
.todo-hero h1{position:relative;font-size:2.6rem;font-weight:800;letter-spacing:-.025em;background:linear-gradient(135deg,var(--emerald) 0%,var(--sky) 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;margin-bottom:.4rem;line-height:1.15}
.todo-hero .subtitle{position:relative;color:var(--muted);font-size:.9rem;font-family:var(--font-mono);letter-spacing:.02em}
.todo-hero .subtitle span{color:var(--emerald);font-weight:600}
/* ── ORB DECORATION ── */
.todo-orb{position:absolute;border-radius:50%;filter:blur(80px);opacity:.12;pointer-events:none}
.todo-orb-1{width:300px;height:300px;background:var(--emerald);top:-80px;left:-60px;animation:orbFloat 12s ease-in-out infinite}
.todo-orb-2{width:200px;height:200px;background:var(--sky);bottom:-60px;right:-40px;animation:orbFloat 15s ease-in-out infinite reverse}
@keyframes orbFloat{0%,100%{transform:translate(0,0) scale(1)}33%{transform:translate(30px,-20px) scale(1.08)}66%{transform:translate(-20px,15px) scale(.94)}}
/* ── STATS ── */
.todo-stats{display:flex;gap:.85rem;padding:1.5rem 2rem;flex-wrap:wrap;justify-content:center;border-bottom:1px solid var(--border);background:linear-gradient(180deg,var(--surface),transparent)}
.todo-stat{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:1rem 1.6rem;text-align:center;min-width:110px;transition:all .25s;position:relative;overflow:hidden}
.todo-stat::before{content:'';position:absolute;inset:0;border-radius:var(--radius);opacity:0;transition:opacity .25s}
.todo-stat:hover{transform:translateY(-3px);border-color:var(--emerald);box-shadow:0 8px 30px rgba(0,0,0,.3)}
.todo-stat:hover::before{opacity:.06;background:var(--emerald)}
.todo-stat .stat-num{font-size:2rem;font-weight:800;background:linear-gradient(135deg,var(--emerald),var(--sky));-webkit-background-clip:text;-webkit-text-fill-color:transparent;line-height:1.1}
.todo-stat .stat-label{font-size:.7rem;color:var(--muted);text-transform:uppercase;letter-spacing:.1em;margin-top:.3rem;font-family:var(--font-mono)}
.todo-stat.critical-stat .stat-num{background:linear-gradient(135deg,var(--rose),var(--amber));-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.todo-stat.critical-stat:hover{border-color:var(--rose)}
.todo-stat.critical-stat:hover::before{background:var(--rose)}
/* ── FILTER PILLS ── */
.todo-filters{display:flex;gap:.5rem;padding:1.2rem 2rem;flex-wrap:wrap;justify-content:center}
.todo-pill{background:var(--surface);border:1px solid var(--border);color:var(--muted);padding:.45rem 1.1rem;border-radius:2rem;font-size:.78rem;cursor:pointer;transition:all .2s;font-family:var(--font-mono);letter-spacing:.02em;user-select:none}
.todo-pill:hover{color:var(--text);border-color:var(--muted)}
.todo-pill.active{color:var(--emerald);border-color:var(--emerald);background:var(--emerald-glow);font-weight:600}
.todo-pill .count{font-size:.65rem;opacity:.5;margin-left:.2rem}
/* ── PLAN GRID ── */
.todo-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(370px,1fr));gap:1rem;padding:1rem 2rem 3rem}
/* ── PLAN CARD ── */
.todo-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;transition:all .35s cubic-bezier(.4,0,.2,1);animation:cardEnter .55s ease both;position:relative}
.todo-card::after{content:'';position:absolute;inset:0;border-radius:var(--radius);opacity:0;transition:opacity .35s;pointer-events:none;background:radial-gradient(ellipse at 50% 0%,var(--emerald-glow),transparent 60%)}
.todo-card:hover{border-color:rgba(16,185,129,.35);box-shadow:0 0 40px var(--emerald-glow),0 12px 40px rgba(0,0,0,.45);transform:translateY(-3px)}
.todo-card:hover::after{opacity:1}
.todo-card .card-header{padding:1.3rem 1.3rem .5rem;display:flex;align-items:flex-start;gap:.7rem}
.todo-card .card-emoji{font-size:2rem;line-height:1;flex-shrink:0;filter:drop-shadow(0 2px 8px var(--emerald-glow))}
.todo-card .card-title{font-size:.98rem;font-weight:700;color:var(--text);line-height:1.35;letter-spacing:-.01em}
.todo-card .card-subtitle{font-size:.7rem;color:var(--muted);margin-top:.2rem;font-family:var(--font-mono)}
.todo-card .card-badges{display:flex;flex-wrap:wrap;gap:.4rem;padding:.3rem 1.3rem .6rem}
.todo-card .badge{font-size:.65rem;padding:.25rem .7rem;border-radius:1rem;font-family:var(--font-mono);font-weight:600;letter-spacing:.03em;text-transform:uppercase}
.badge-critical{background:rgba(244,63,94,.1);color:var(--rose);border:1px solid rgba(244,63,94,.2)}
.badge-high{background:rgba(245,158,11,.1);color:var(--amber);border:1px solid rgba(245,158,11,.18)}
.badge-medium{background:rgba(14,165,233,.08);color:var(--sky);border:1px solid rgba(14,165,233,.15)}
.badge-category{background:rgba(139,92,246,.08);color:var(--violet);border:1px solid rgba(139,92,246,.15)}
.todo-card .card-body{padding:.2rem 1.3rem .6rem;font-size:.8rem;color:var(--muted);line-height:1.55}
.todo-card .card-goal{color:var(--text);margin-bottom:.35rem;font-weight:500;line-height:1.45}
.todo-card .card-goal::before{content:'🎯 '}
.todo-card .card-skills{display:flex;flex-wrap:wrap;gap:.35rem;padding:.2rem 1.3rem .6rem}
.todo-card .skill-tag{font-size:.66rem;padding:.18rem .55rem;background:rgba(16,185,129,.06);color:var(--emerald);border-radius:.3rem;font-family:var(--font-mono);border:1px solid rgba(16,185,129,.12);transition:all .15s}
.todo-card .skill-tag:hover{background:rgba(16,185,129,.14);border-color:rgba(16,185,129,.25)}
.todo-card .card-files,.todo-card .tasks-summary{padding:.2rem 1.3rem .8rem;font-size:.7rem}
.todo-card .card-files>summary,.todo-card .tasks-summary>summary{color:var(--muted);cursor:pointer;font-family:var(--font-mono);font-weight:500;transition:color .2s;list-style:none;display:flex;align-items:center;gap:.3rem}
.todo-card .card-files>summary::-webkit-details-marker,.todo-card .tasks-summary>summary::-webkit-details-marker{display:none}
.todo-card .card-files>summary::before{content:'📁 ';font-size:.75rem}
.todo-card .tasks-summary>summary::before{content:'✅ ';font-size:.75rem}
.todo-card .card-files>summary:hover,.todo-card .tasks-summary>summary:hover{color:var(--emerald)}
.todo-card .file-list{margin-top:.45rem;font-family:var(--font-mono);font-size:.68rem;line-height:1.9;padding:.5rem .6rem;background:rgba(0,0,0,.2);border-radius:.4rem}
.todo-card .file-new{color:var(--emerald)}
.todo-card .file-edit{color:var(--sky)}
.todo-card .tasks-summary ul{padding-left:1rem;margin-top:.35rem;font-size:.7rem;line-height:1.8;list-style:none}
.todo-card .tasks-summary li{position:relative;padding-left:.2rem}
.todo-card .tasks-summary input[type=checkbox]{accent-color:var(--emerald);margin-right:.4rem;width:.75rem;height:.75rem;pointer-events:none;vertical-align:middle}
.todo-card.completed{text-decoration:line-through}
/* ── ANIMATIONS ── */
@keyframes cardEnter{from{opacity:0;transform:translateY(22px) scale(.97)}to{opacity:1;transform:translateY(0) scale(1)}}
.todo-card:nth-child(1){animation-delay:.04s}.todo-card:nth-child(2){animation-delay:.08s}.todo-card:nth-child(3){animation-delay:.12s}.todo-card:nth-child(4){animation-delay:.16s}.todo-card:nth-child(5){animation-delay:.20s}.todo-card:nth-child(6){animation-delay:.24s}.todo-card:nth-child(7){animation-delay:.28s}.todo-card:nth-child(8){animation-delay:.32s}.todo-card:nth-child(9){animation-delay:.36s}.todo-card:nth-child(10){animation-delay:.40s}.todo-card:nth-child(11){animation-delay:.44s}.todo-card:nth-child(12){animation-delay:.48s}.todo-card:nth-child(13){animation-delay:.52s}.todo-card:nth-child(14){animation-delay:.56s}.todo-card:nth-child(15){animation-delay:.60s}.todo-card:nth-child(16){animation-delay:.64s}.todo-card:nth-child(17){animation-delay:.68s}.todo-card:nth-child(18){animation-delay:.72s}
/* ── RESPONSIVE ── */
@media(max-width:768px){.todo-grid{grid-template-columns:1fr;padding:1rem}.todo-hero{padding:2.5rem 1rem 1.8rem}.todo-hero h1{font-size:1.6rem}.todo-stats{padding:1rem;gap:.5rem}.todo-stat{padding:.7rem 1rem;min-width:75px}.todo-stat .stat-num{font-size:1.4rem}.todo-filters{padding:.8rem 1rem}.todo-pill{font-size:.7rem;padding:.35rem .8rem}}
@media(prefers-reduced-motion:reduce){.todo-card{animation:none!important}.todo-orb{display:none}}
/* ── RENDERED MARKDOWN ── */
.markdown-body{max-width:900px;margin:2rem auto;padding:0 2rem 3rem;font-size:.88rem;line-height:1.75;color:var(--text)}
.markdown-body h1{font-size:1.8rem;font-weight:800;margin:2rem 0 1rem;background:linear-gradient(135deg,var(--emerald),var(--sky));-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
.markdown-body h2{font-size:1.3rem;font-weight:700;margin:1.8rem 0 .6rem;color:var(--emerald)}
.markdown-body h3{font-size:1.05rem;font-weight:600;margin:1.2rem 0 .4rem;color:var(--sky)}
.markdown-body p{margin:.5rem 0}
.markdown-body strong{color:var(--sky)}
.markdown-body table{border-collapse:collapse;width:100%;margin:1rem 0}
.markdown-body td,.markdown-body th{border:1px solid var(--border);padding:.5rem .8rem;text-align:left;font-size:.8rem}
.markdown-body th{background:var(--surface);color:var(--emerald);font-family:var(--font-mono);font-weight:600}
.markdown-body code{background:var(--surface);padding:.15rem .4rem;border-radius:.25rem;font-family:var(--font-mono);font-size:.8em;color:var(--sky)}
.markdown-body ul,.markdown-body ol{padding-left:1.5rem;margin:.5rem 0}
.markdown-body li{margin:.2rem 0}
.markdown-body input[type=checkbox]{accent-color:var(--emerald);pointer-events:none;margin-right:.4rem}
.markdown-body hr{border:none;border-top:1px solid var(--border);margin:2rem 0}
.markdown-body blockquote{border-left:3px solid var(--emerald);margin:1rem 0;padding:.4rem 1rem;background:var(--emerald-glow);border-radius:0 .5rem .5rem 0}
</style>

<div class="todo-hero">
  <div class="todo-orb todo-orb-1"></div>
  <div class="todo-orb todo-orb-2"></div>
  <h1>Matrix Dashboard &amp; Builder — Implementation Plans</h1>
  <p class="subtitle"><span>19</span> plans · <span>8</span> completed · <span>0</span> in progress · Last updated 07/07/2026 @ 05:18:14 IST</p>
</div>

<div class="todo-stats">
  <div class="todo-stat"><div class="stat-num">19</div><div class="stat-label">Total Plans</div></div>
  <div class="todo-stat"><div class="stat-num">8</div><div class="stat-label">Completed</div></div>
  <div class="todo-stat"><div class="stat-num">0</div><div class="stat-label">In Progress</div></div>
  <div class="todo-stat critical-stat"><div class="stat-num">5</div><div class="stat-label">Critical</div></div>
</div>

<div class="todo-filters">
  <span class="todo-pill active" onclick="try{document.querySelectorAll('.todo-pill').forEach(p=>p.classList.remove('active'));this.classList.add('active');document.querySelectorAll('.todo-card').forEach(c=>c.style.display='')}catch(e){}">All <span class="count">19</span></span>
  <span class="todo-pill" onclick="try{document.querySelectorAll('.todo-pill').forEach(p=>p.classList.remove('active'));this.classList.add('active');document.querySelectorAll('.todo-card').forEach(c=>c.style.display=c.querySelector('.badge-critical')?'':'none')}catch(e){}">Critical <span class="count">5</span></span>
  <span class="todo-pill" onclick="try{document.querySelectorAll('.todo-pill').forEach(p=>p.classList.remove('active'));this.classList.add('active');document.querySelectorAll('.todo-card').forEach(c=>c.style.display=c.dataset.category==='ai'?'':'none')}catch(e){}">AI/LLM</span>
  <span class="todo-pill" onclick="try{document.querySelectorAll('.todo-pill').forEach(p=>p.classList.remove('active'));this.classList.add('active');document.querySelectorAll('.todo-card').forEach(c=>c.style.display=c.dataset.category==='code-quality'?'':'none')}catch(e){}">Quality</span>
  <span class="todo-pill" onclick="try{document.querySelectorAll('.todo-pill').forEach(p=>p.classList.remove('active'));this.classList.add('active');document.querySelectorAll('.todo-card').forEach(c=>c.style.display=c.dataset.category==='performance'?'':'none')}catch(e){}">Perf</span>
  <span class="todo-pill" onclick="try{document.querySelectorAll('.todo-pill').forEach(p=>p.classList.remove('active'));this.classList.add('active');document.querySelectorAll('.todo-card').forEach(c=>c.style.display=c.dataset.category==='security'?'':'none')}catch(e){}">Security</span>
  <span class="todo-pill" onclick="try{document.querySelectorAll('.todo-pill').forEach(p=>p.classList.remove('active'));this.classList.add('active');document.querySelectorAll('.todo-card').forEach(c=>c.style.display=c.dataset.category==='ux'?'':'none')}catch(e){}">UX</span>
  <span class="todo-pill" onclick="try{document.querySelectorAll('.todo-pill').forEach(p=>p.classList.remove('active'));this.classList.add('active');document.querySelectorAll('.todo-card').forEach(c=>c.style.display=c.dataset.category==='feature'?'':'none')}catch(e){}">Features</span>
  <span class="todo-pill" onclick="try{document.querySelectorAll('.todo-pill').forEach(p=>p.classList.remove('active'));this.classList.add('active');document.querySelectorAll('.todo-card').forEach(c=>c.style.display=c.dataset.category==='branding'?'':'none')}catch(e){}">Branding</span>
</div>

<div class="todo-grid">

<!-- PLAN 1 -->
<div class="todo-card completed" data-category="branding" data-priority="medium">
  <div class="card-header">
    <span class="card-emoji">🔧</span>
    <div>
      <div class="card-title">Plan 1: Custom Zip Filename for Matrix Builder Downloads</div>
      <div class="card-subtitle">ideated by claude-sonnet-4 · 3 files · low complexity</div>
    </div>
  </div>
  <div class="card-badges">
    <span class="badge badge-category">Branding</span>
    <span class="badge badge-medium">Medium</span>
  </div>
  <div class="card-body">
    <div class="card-goal">Replace hardcoded project.zip with sanitized slug from artifact title.</div>
    <div>bolt.new-custom always outputs project.zip — users lose track of multiple named projects.</div>
  </div>
  <div class="card-skills">
    <span class="skill-tag">@senior-frontend</span>
    <span class="skill-tag">@frontend-dev-guidelines</span>
    <span class="skill-tag">@brainstorming</span>
  </div>
  <details class="card-files">
    <summary>3 files</summary>
    <div class="file-list">
      <div><span class="file-new">+ new</span> bolt.new-custom/app/utils/slug.ts</div>
      <div><span class="file-edit">~ edit</span> bolt.new-custom/app/lib/download.ts</div>
      <div><span class="file-edit">~ edit</span> bolt.new-custom/app/components/workbench/Workbench.client.tsx</div>
    </div>
  </details>
  <details class="tasks-summary">
    <summary>4/4 tasks ✅</summary>
    <ul>
      <li><input type="checkbox" checked> Create slugify utility with edge-case handling</li>
      <li><input type="checkbox" checked> Update downloadProject() to accept title parameter</li>
      <li><input type="checkbox" checked> Plumb artifact title from workbench store</li>
      <li><input type="checkbox" checked> Verify: test with emoji, special chars, long titles</li>
    </ul>
  </details>
</div>

<!-- PLAN 2 -->
<div class="todo-card completed" data-category="branding" data-priority="medium">
  <div class="card-header">
    <span class="card-emoji">🎨</span>
    <div>
      <div class="card-title">Plan 2: Full Brand Kit — ZB Automations Umbrella</div>
      <div class="card-subtitle">ideated by claude-sonnet-4 · 30+ files across 2 repos · high complexity</div>
    </div>
  </div>
  <div class="card-badges">
    <span class="badge badge-category">Branding</span>
    <span class="badge badge-medium">Medium</span>
  </div>
  <div class="card-body">
    <div class="card-goal">Create complete brand identity: logos, icons, favicons, PWA assets, social cards, colors, typography.</div>
    <div>Brand is fragmented — inline SVG logo only, missing PWA icons, no favicons, different landing page logo.</div>
  </div>
  <div class="card-skills">
    <span class="skill-tag">@frontend-design</span>
    <span class="skill-tag">@senior-frontend</span>
    <span class="skill-tag">@senior-architect</span>
  </div>
  <details class="card-files">
    <summary>30+ files</summary>
    <div class="file-list">
      <div><span class="file-new">+ new</span> public/icon.svg, icon-192.png, icon-512.png, favicon.ico, apple-touch-icon.png, og-image.png</div>
      <div><span class="file-edit">~ edit</span> app/layout.tsx, app/manifest.ts, components/layout/logo.tsx, sidebar.tsx, topbar.tsx</div>
      <div><span class="file-edit">~ edit</span> bolt.new-custom: favicons, entry.server.tsx, root.tsx, uno.config.ts</div>
      <div><span class="file-edit">~ edit</span> deploy/landing/index.html, README.md, CHANGELOG.md</div>
    </div>
  </details>
  <details class="tasks-summary">
    <summary>18/18 tasks ✅</summary>
    <ul>
      <li><input type="checkbox" checked> Phase 1: Claude Design generates full brand kit</li>
      <li><input type="checkbox" checked> Phase 2: Apply to Matrix Dashboard (public assets, HTML head, PWA, logo)</li>
      <li><input type="checkbox" checked> Phase 3: Apply to Matrix Builder (favicons, HTML, UnoCSS, workbench)</li>
      <li><input type="checkbox" checked> Phase 4: Apply to zbautomations.ie landing page</li>
    </ul>
  </details>
</div>

<!-- PLAN 3 -->
<div class="todo-card" data-category="ux" data-priority="medium">
  <div class="card-header">
    <span class="card-emoji">🖌️</span>
    <div>
      <div class="card-title">Plan 3: Full UI Redesign — Dashboard → Builder Aesthetic</div>
      <div class="card-subtitle">ideated by claude-sonnet-4 · 40+ files · epic complexity</div>
    </div>
  </div>
  <div class="card-badges">
    <span class="badge badge-category">UX / Design</span>
    <span class="badge badge-medium">Medium</span>
  </div>
  <div class="card-body">
    <div class="card-goal">Redesign all dashboard UI to match Matrix Builder landing page aesthetic for cohesive product family.</div>
    <div>Dashboard and Builder look like completely different products — terminal/dark vs modern prompt-centric.</div>
  </div>
  <div class="card-skills">
    <span class="skill-tag">@frontend-design</span>
    <span class="skill-tag">@senior-frontend</span>
    <span class="skill-tag">@antigravity-design-expert</span>
    <span class="skill-tag">@senior-architect</span>
  </div>
  <details class="card-files">
    <summary>40+ files across 6 tiers</summary>
    <div class="file-list">
      <div><span class="file-edit">~ edit</span> app/globals.css, lib/themes.ts (Tier 1: Theme Foundation)</div>
      <div><span class="file-edit">~ edit</span> components/layout/* (Tier 2: Layout Shell)</div>
      <div><span class="file-edit">~ edit</span> components/ui/* (Tier 3: 11 UI Primitives)</div>
      <div><span class="file-edit">~ edit</span> app/dashboard/page.tsx, chat/* (Tier 4: Key Pages)</div>
      <div><span class="file-edit">~ edit</span> 14 remaining dashboard pages (Tier 5: Consistency)</div>
    </div>
  </details>
  <details class="tasks-summary">
    <summary>6 tiers · 30+ tasks</summary>
    <ul>
      <li><input type="checkbox"> Tier 1: Theme Foundation (CSS variables, Tailwind v4, dark/light)</li>
      <li><input type="checkbox"> Tier 2: Layout Shell (sidebar, topbar, mobile-nav, shell)</li>
      <li><input type="checkbox"> Tier 3: UI Primitives (button, card, input, tabs, dialog, toast, etc.)</li>
      <li><input type="checkbox"> Tier 4: Key Pages (overview, chat, settings)</li>
      <li><input type="checkbox"> Tier 5: Remaining Pages (14 pages consistency sweep)</li>
      <li><input type="checkbox"> Tier 6: Verification (typecheck, visual QA, dark mode, mobile, a11y)</li>
    </ul>
  </details>
</div>

<!-- PLAN 4 -->
<div class="todo-card completed" data-category="code-quality" data-priority="critical">
  <div class="card-header">
    <span class="card-emoji">🧪</span>
    <div>
      <div class="card-title">Plan 4: Test Infrastructure — Unit, Integration &amp; E2E</div>
      <div class="card-subtitle">ideated by deepseek v4 pro · 5+ test suites · medium complexity</div>
    </div>
  </div>
  <div class="card-badges">
    <span class="badge badge-critical">Code Quality</span>
    <span class="badge badge-critical">Critical</span>
  </div>
  <div class="card-body">
    <div class="card-goal">Establish complete testing: vitest + React Testing Library + DB test helpers + CI.</div>
    <div>Zero test infrastructure. 90+ API routes, 30+ components, 19 services — all untested.</div>
  </div>
  <div class="card-skills">
    <span class="skill-tag">@testing-patterns</span>
    <span class="skill-tag">@javascript-testing-patterns</span>
    <span class="skill-tag">@nodejs-best-practices</span>
  </div>
  <details class="card-files">
    <summary>6 file groups</summary>
    <div class="file-list">
      <div><span class="file-new">+ new</span> vitest.config.ts, vitest.setup.ts</div>
      <div><span class="file-new">+ new</span> lib/test-utils.tsx, lib/test-db.ts</div>
      <div><span class="file-new">+ new</span> __tests__/api/, __tests__/components/, __tests__/lib/</div>
      <div><span class="file-edit">~ edit</span> package.json (test scripts)</div>
    </div>
  </details>
  <details class="tasks-summary">
    <summary>7/7 tasks ✅</summary>
    <ul>
      <li><input type="checkbox" checked> Install vitest, @testing-library/react, jsdom</li>
      <li><input type="checkbox" checked> Configure vitest with jsdom + path aliases</li>
      <li><input type="checkbox" checked> Create test setup with jest-dom matchers + DB mocks (mocked db-path → isolated temp dir; window.matchMedia polyfill)</li>
      <li><input type="checkbox" checked> Build test utilities (ThemeProvider render wrapper, real-schema test DB helper)</li>
      <li><input type="checkbox" checked> Write API tests — thin pass: notifications route (GET/PATCH/DELETE) proves the pattern; chat/memories/auth/provider-registry deferred to when those routes are next touched</li>
      <li><input type="checkbox" checked> Write component tests — thin pass: Button (render/click/disabled/variants) proves the pattern; chat-input/sidebar/tool-call-block deferred</li>
      <li><input type="checkbox" checked> Write lib tests — crypto (AES round-trip + tamper detection) and wiki-link parser edge cases (no slug.ts exists in this repo — that's Plan 1's bolt.new-custom utility — substituted wiki.ts); daemon.ts deferred, too side-effectful (cron/DB/email) for a thin first pass</li>
    </ul>
  </details>
</div>

<!-- PLAN 5 -->
<div class="todo-card completed" data-category="devops" data-priority="high">
  <div class="card-header">
    <span class="card-emoji">🔧</span>
    <div>
      <div class="card-title">Plan 5: Dev Tooling — ESLint, Prettier, Editor Config &amp; Hooks</div>
      <div class="card-subtitle">ideated by deepseek v4 pro · 6 config files · low complexity</div>
    </div>
  </div>
  <div class="card-badges">
    <span class="badge badge-category">DevOps / Tooling</span>
    <span class="badge badge-high">High</span>
  </div>
  <div class="card-body">
    <div class="card-goal">Add linting, formatting, editor consistency, and pre-commit guards beyond TypeScript.</div>
    <div>Zero linting, zero formatting. Team/AI agents produce inconsistent code. No commit guardrails.</div>
  </div>
  <div class="card-skills">
    <span class="skill-tag">@cc-skill-coding-standards</span>
    <span class="skill-tag">@nodejs-best-practices</span>
    <span class="skill-tag">@typescript-expert</span>
  </div>
  <details class="card-files">
    <summary>6 files</summary>
    <div class="file-list">
      <div><span class="file-new">+ new</span> eslint.config.mjs (flat config with Next.js + TS + a11y)</div>
      <div><span class="file-new">+ new</span> .prettierrc, .prettierignore, .editorconfig</div>
      <div><span class="file-new">+ new</span> .husky/pre-commit (lint-staged hook)</div>
      <div><span class="file-edit">~ edit</span> package.json (lint/format scripts + lint-staged config)</div>
    </div>
  </details>
  <details class="tasks-summary">
    <summary>7/7 tasks ✅</summary>
    <ul>
      <li><input type="checkbox" checked> Install ESLint + Next.js + React + a11y plugins</li>
      <li><input type="checkbox" checked> Create eslint.config.mjs with flat config presets</li>
      <li><input type="checkbox" checked> Install & configure Prettier (2-space, double quotes to match existing convention, 100 width)</li>
      <li><input type="checkbox" checked> Create .editorconfig (UTF-8, LF, 2-space)</li>
      <li><input type="checkbox" checked> Install husky + lint-staged for pre-commit hooks</li>
      <li><input type="checkbox" checked> Bulk format + lint fix entire codebase (184 files; excluded .netlify build cache, .agent and vscode-extension sub-projects, deploy/landing SEO site)</li>
      <li><input type="checkbox" checked> Verify: pnpm lint passes zero errors (60 pre-existing no-explicit-any warnings deliberately deferred as a ratchet item)</li>
    </ul>
  </details>
</div>

<!-- PLAN 6 -->
<div class="todo-card completed" data-category="code-quality" data-priority="high">
  <div class="card-header">
    <span class="card-emoji">🛡️</span>
    <div>
      <div class="card-title">Plan 6: Error Boundaries — React Resilience</div>
      <div class="card-subtitle">ideated by deepseek v4 pro · 7 files · low complexity</div>
    </div>
  </div>
  <div class="card-badges">
    <span class="badge badge-category">Code Quality</span>
    <span class="badge badge-high">High</span>
  </div>
  <div class="card-body">
    <div class="card-goal">Add ErrorBoundary components to prevent crashes from whitescreening the entire app.</div>
    <div>Zero ErrorBoundary exists. Any component render error crashes the full React tree to blank page.</div>
  </div>
  <div class="card-skills">
    <span class="skill-tag">@systematic-debugging</span>
    <span class="skill-tag">@error-diagnostics-smart-debug</span>
    <span class="skill-tag">@react-best-practices</span>
  </div>
  <details class="card-files">
    <summary>7 files</summary>
    <div class="file-list">
      <div><span class="file-new">+ new</span> components/ui/error-fallback.tsx</div>
      <div><span class="file-new">+ new</span> components/layout/error-boundary.tsx</div>
      <div><span class="file-new">+ new</span> app/dashboard/error.tsx, chat/error.tsx, settings/error.tsx</div>
      <div><span class="file-new">+ new</span> lib/utils/api-error.ts</div>
      <div><span class="file-edit">~ edit</span> app/layout.tsx (wrap in GlobalErrorBoundary)</div>
    </div>
  </details>
  <details class="tasks-summary">
    <summary>6/6 tasks ✅</summary>
    <ul>
      <li><input type="checkbox" checked> Create ErrorFallback with retry + home navigation</li>
      <li><input type="checkbox" checked> Create GlobalErrorBoundary class component</li>
      <li><input type="checkbox" checked> Wrap root layout in GlobalErrorBoundary</li>
      <li><input type="checkbox" checked> Add per-page error.tsx files (dashboard, chat, settings)</li>
      <li><input type="checkbox" checked> Create API error normalization utility (not retrofitted into existing routes — future sweep)</li>
      <li><input type="checkbox" checked> Verify: threw in a temporary route via a live pnpm dev + browser check — fallback rendered, shell stayed intact, retry/home both worked</li>
    </ul>
  </details>
</div>

<!-- PLAN 7 -->
<div class="todo-card completed" data-category="security" data-priority="critical">
  <div class="card-header">
    <span class="card-emoji">🔒</span>
    <div>
      <div class="card-title">Plan 7: Security Hardening — Rate Limiting, CSRF &amp; Sanitization</div>
      <div class="card-subtitle">ideated by deepseek v4 pro · 7 files + 30+ schema audits · medium complexity</div>
    </div>
  </div>
  <div class="card-badges">
    <span class="badge badge-critical">Security</span>
    <span class="badge badge-critical">Critical</span>
  </div>
  <div class="card-body">
    <div class="card-goal">Add rate limiting, CSRF protection, XSS sanitization, and Zod schema length hardening.</div>
    <div>Zero rate limiting, no CSRF, no input sanitization, Zod schemas lack .max() constraints.</div>
  </div>
  <div class="card-skills">
    <span class="skill-tag">@api-security-best-practices</span>
    <span class="skill-tag">@backend-security-coder</span>
    <span class="skill-tag">@cc-skill-security-review</span>
    <span class="skill-tag">@cso</span>
  </div>
  <details class="card-files">
    <summary>7 files + 30 schema audits</summary>
    <div class="file-list">
      <div><span class="file-new">+ new</span> middleware.ts (rate limiting + CSRF)</div>
      <div><span class="file-new">+ new</span> lib/utils/sanitize.ts (DOMPurify wrapper)</div>
      <div><span class="file-edit">~ edit</span> lib/services/web.ts, lib/stores/use-app-store.ts</div>
      <div><span class="file-edit">~ edit</span> next.config.ts (body size limits)</div>
      <div><span class="file-edit">~ audit</span> 30+ API route files (Zod .max() + sanitization)</div>
    </div>
  </details>
  <details class="tasks-summary">
    <summary>6/6 tasks ✅</summary>
    <ul>
      <li><input type="checkbox" checked> Create middleware.ts: IP sliding window, 100 req/60s API, 20 req/60s for /api/hooks (this app has no "auth" routes at all — genuinely local-first/trust-the-machine, so the stricter tier targets the one externally-reachable webhook endpoint instead)</li>
      <li><input type="checkbox" checked> CSRF via Origin/Referer same-origin check (not per-request tokens — 128 mutation fetch() call sites across 46 files made per-call header injection impractical, per this session's own roadmap decision); /api/hooks/[token] exempted (external, token-authed callers)</li>
      <li><input type="checkbox" checked> Install isomorphic-dompurify, create sanitize.ts wrapper (stripHtml/sanitizeHtml) — not wired anywhere yet, no dangerouslySetInnerHTML/rehype-raw sink exists in this app today</li>
      <li><input type="checkbox" checked> Audited 54 Zod-schema route files (found via `grep -rl "z.object("`, more than the "30+" estimate): 48 got .max() added, 6 needed no changes (verified genuinely bound-free-string-free). A workflow review pass caught and fixed 4 cross-file create/update max-value mismatches</li>
      <li><input type="checkbox" checked> Body size limits: 1MB default, 10MB for /api/ai/chat + /api/images + /api/uploads + /api/workspace/file (via middleware Content-Length check — Next's serverActions.bodySizeLimit doesn't apply since this app uses Route Handlers, not Server Actions)</li>
      <li><input type="checkbox" checked> Verify: live dev-server testing (not just typecheck) — rate limiting (105-request burst → exactly 100 allowed/5 blocked accounting for prior test traffic), CSRF (same-origin 200, forged Origin 403, webhook exemption confirmed), body size (1.6MB → 413), and a fresh audited-route validation round-trip (400 on oversized field, 200 on valid payload)</li>
    </ul>
  </details>
</div>

<!-- PLAN 8 -->
<div class="todo-card completed" data-category="ai" data-priority="critical">
  <div class="card-header">
    <span class="card-emoji">📊</span>
    <div>
      <div class="card-title">Plan 8: AI Cost &amp; Token Tracking</div>
      <div class="card-subtitle">ideated by deepseek v4 pro · 8 files · medium complexity</div>
    </div>
  </div>
  <div class="card-badges">
    <span class="badge badge-critical">AI / LLM</span>
    <span class="badge badge-critical">Critical</span>
  </div>
  <div class="card-body">
    <div class="card-goal">Track token usage per request, session, provider, lifetime. Show cost dashboard.</div>
    <div>Usage event type defined but never emitted. Zero visibility into spend across 20+ providers.</div>
  </div>
  <div class="card-skills">
    <span class="skill-tag">@ai-engineer</span>
    <span class="skill-tag">@llm-ops</span>
    <span class="skill-tag">@backend-dev-guidelines</span>
  </div>
  <details class="card-files">
    <summary>8 files</summary>
    <div class="file-list">
      <div><span class="file-new">+ new</span> lib/ai/pricing.ts, lib/ai/cost.ts</div>
      <div><span class="file-new">+ new</span> app/api/usage/route.ts, app/api/usage/session/[id]/route.ts</div>
      <div><span class="file-edit">~ edit</span> lib/db/schema.ts, lib/db/client.ts, app/api/ai/chat/route.ts</div>
      <div><span class="file-edit">~ edit</span> app/dashboard/settings/diagnostics/page.tsx</div>
    </div>
  </details>
  <details class="tasks-summary">
    <summary>7/7 tasks ✅</summary>
    <ul>
      <li><input type="checkbox" checked> Capture usage — not via <code>onFinish</code> (Plan 10's fallback cascade calls <code>streamText()</code> once per candidate, so an <code>onFinish</code> registered at call-time is ambiguous about which attempt it belongs to). Instead awaits <code>attempt.result.totalUsage</code> — the documented Promise accessor on <code>StreamTextResult</code> — inside the stream's <code>finally</code>, after the winning candidate's stream has fully drained</li>
      <li><input type="checkbox" checked> Add DB columns — <code>inputTokens</code>, <code>outputTokens</code>, and (deviation from spec) <code>providerKind</code> denormalized onto each row at write time, so lifetime/per-provider cost survives a provider later being deleted rather than silently vanishing via a join</li>
      <li><input type="checkbox" checked> Create pricing table — <code>lib/ai/pricing.ts</code>: curated per-model USD/1M-token rates matched by regex against a normalized model ID (strips OpenRouter-style vendor prefixes and trailing date suffixes, since real IDs are rarely the bare catalog default), falling back to a per-provider-kind rate for the other ~20 provider kinds. Figures are estimates, not billing-accurate, and said so in the UI</li>
      <li><input type="checkbox" checked> Build cost calculator — <code>lib/ai/cost.ts</code>: <code>estimateCost</code>, <code>getSessionCost</code>, <code>getCostSince</code>, <code>getLifetimeCost</code>, <code>getTopSessions</code>. Returns <code>cost: null</code> (not <code>0</code>) when nothing could be priced, so the UI can show "unknown" instead of a misleading "$0.00"</li>
      <li><input type="checkbox" checked> Add usage APIs — <code>GET /api/usage</code> (lifetime + this-month + today + per-provider + top 10 sessions), <code>GET /api/usage/session/[id]</code></li>
      <li><input type="checkbox" checked> Build cost dashboard — new "AI usage &amp; cost" card on the existing Diagnostics page (today/month/lifetime stat row, per-provider breakdown, top 5 sessions), matching its existing Card/Row visual pattern rather than a separate page</li>
      <li><input type="checkbox" checked> Verify — live dev-server + real DB: confirmed DeepSeek's streaming response does report usage (853 input / 2 output tokens for a test turn), and the persisted row's cost matched the hand-computed rate exactly (853×0.27/1M + 2×1.1/1M = $0.00023251). Verified lifetime/month/today/per-provider/top-sessions all correctly reflected the one test row, then cleaned up (deleted the test session, which cascade-deleted its message; restored <code>autoExtract</code>). No browser extension available in this session to visually confirm the new dashboard card's layout — confirmed only that the page route responds 200 with no server-error markers, not a substitute for an actual visual check</li>
    </ul>
  </details>
</div>

<!-- PLAN 9 -->
<div class="todo-card" data-category="ai" data-priority="critical">
  <div class="card-header">
    <span class="card-emoji">🪟</span>
    <div>
      <div class="card-title">Plan 9: Context Window Management</div>
      <div class="card-subtitle">ideated by deepseek v4 pro · 6 files · high complexity</div>
    </div>
  </div>
  <div class="card-badges">
    <span class="badge badge-critical">AI / LLM</span>
    <span class="badge badge-critical">Critical</span>
  </div>
  <div class="card-body">
    <div class="card-goal">Token-aware context: counting, per-model limits, auto-summarization, UI progress bar.</div>
    <div>Zero token counting. 500-msg sessions send full history — silently fail at context limits.</div>
  </div>
  <div class="card-skills">
    <span class="skill-tag">@ai-engineer</span>
    <span class="skill-tag">@llm-ops</span>
    <span class="skill-tag">@performance-engineer</span>
  </div>
  <details class="card-files">
    <summary>6 files</summary>
    <div class="file-list">
      <div><span class="file-new">+ new</span> lib/ai/tokens.ts, lib/ai/summarizer.ts</div>
      <div><span class="file-edit">~ edit</span> lib/ai/models.ts, app/api/ai/chat/route.ts</div>
      <div><span class="file-edit">~ edit</span> components/chat/chat-interface.tsx, lib/chat/slash-commands.ts</div>
    </div>
  </details>
  <details class="tasks-summary">
    <summary>8 tasks</summary>
    <ul>
      <li><input type="checkbox"> Install tiktoken or use AI SDK countTokens()</li>
      <li><input type="checkbox"> Build token counter with model-aware context limits</li>
      <li><input type="checkbox"> Add contextWindow field to all model entries</li>
      <li><input type="checkbox"> Create auto-summarizer (trigger at 80% context usage)</li>
      <li><input type="checkbox"> Integrate into chat route: count before building messages</li>
      <li><input type="checkbox"> Add context progress bar to chat UI (green→yellow→red)</li>
      <li><input type="checkbox"> Implement /compact slash command server-side</li>
      <li><input type="checkbox"> Verify: long conversation triggers summarization, bar updates</li>
    </ul>
  </details>
</div>

<!-- PLAN 10 -->
<div class="todo-card completed" data-category="ai" data-priority="critical">
  <div class="card-header">
    <span class="card-emoji">🔄</span>
    <div>
      <div class="card-title">Plan 10: AI Provider Fallback &amp; Retry Logic</div>
      <div class="card-subtitle">ideated by deepseek v4 pro · 12 files · medium complexity</div>
    </div>
  </div>
  <div class="card-badges">
    <span class="badge badge-critical">AI / LLM</span>
    <span class="badge badge-critical">Critical</span>
  </div>
  <div class="card-body">
    <div class="card-goal">Auto failover, exponential backoff retry, and circuit breaker for AI providers.</div>
    <div>Single active provider — any outage breaks all chat. No retry for transient failures.</div>
  </div>
  <div class="card-skills">
    <span class="skill-tag">@ai-engineer</span>
    <span class="skill-tag">@backend-dev-guidelines</span>
    <span class="skill-tag">@nodejs-best-practices</span>
  </div>
  <details class="card-files">
    <summary>12 files</summary>
    <div class="file-list">
      <div><span class="file-new">+ new</span> lib/ai/fallback.ts, lib/ai/retry.ts, lib/ai/circuit-breaker.ts</div>
      <div><span class="file-new">+ new</span> components/settings/fallback-order.tsx</div>
      <div><span class="file-edit">~ edit</span> types/settings.ts, lib/db/settings.ts, lib/ai/registry.ts</div>
      <div><span class="file-edit">~ edit</span> lib/chat/blocks.ts, app/api/ai/chat/route.ts</div>
      <div><span class="file-edit">~ edit</span> app/dashboard/settings/page.tsx (not integrations/page.tsx — see notes)</div>
      <div><span class="file-edit">~ edit</span> components/chat/chat-interface.tsx, components/chat/message-bubble.tsx</div>
    </div>
  </details>
  <details class="tasks-summary">
    <summary>7/7 tasks ✅</summary>
    <ul>
      <li><input type="checkbox" checked> Add ranked fallback provider list to settings — lives on <code>app/dashboard/settings/page.tsx</code> (the real AI Providers page) via new <code>FallbackOrder</code> component, not <code>settings/integrations/page.tsx</code> (a link-hub for unrelated services). Stored as a JSON-encoded provider-id array under the existing generic key/value settings table — no schema/migration needed</li>
      <li><input type="checkbox" checked> Build fallback wrapper — <code>lib/ai/fallback.ts</code>'s <code>streamWithFallback()</code> tries each candidate in rank order, skipping circuit-open ones, cascading on failure</li>
      <li><input type="checkbox" checked> Implement retry with jittered exponential backoff (1s/2s/4s) — generic <code>withBackoff()</code> in <code>lib/ai/retry.ts</code>; the cascade calls it with 2 attempts per candidate (immediate + one ~1s backoff) rather than the full 4-attempt ladder, a deliberate latency tradeoff so one dead provider doesn't stall an interactive chat request for 7+ seconds before falling back</li>
      <li><input type="checkbox" checked> Build circuit breaker (open after 3 failures, 60s cooldown) — <code>lib/ai/circuit-breaker.ts</code>, same in-module Map pattern as middleware.ts's rate limiter; live-verified to open and correctly skip a dead provider on request 4</li>
      <li><input type="checkbox" checked> Integrate into chat route — the streamText() + cascade now runs <em>inside</em> the ReadableStream's <code>start()</code>, not before it, since a provider only "wins" once real content arrives (streamText() surfaces failures as stream parts, not thrown exceptions, confirmed against the AI SDK v5 docs). Response headers can't reflect the eventual winner (the Response is constructed before the cascade runs), so "X-Provider-Used" became a <code>provider_used</code> NDJSON stream event instead — the correct signal for a streaming response</li>
      <li><input type="checkbox" checked> Add fallback indicator to chat UI + toast on failover — <code>toast.info()</code> on switch, plus a persistent caption under the assistant bubble (<code>message-bubble.tsx</code>) naming which provider actually replied</li>
      <li><input type="checkbox" checked> Verify: live dev-server + real DB testing (not just typecheck) caught two real bugs before this worked — (1) the AI SDK emits a lifecycle <code>{type:"start"}</code> part immediately, before the network call resolves; the cascade was treating that as success and committing to a dead provider instantly — fixed by skipping known lifecycle-only part types (start/start-step/finish-step) before deciding a winner; (2) the existing "fold system prompt into user turn for non-OpenAI openai-compat providers" workaround was computed once from the originally-requested provider's kind, so falling back to a different provider kind sent the wrong message shape and got rejected — fixed by recomputing per-candidate. Also disabled the SDK's own internal <code>maxRetries</code> (default 2) since it was compounding with this app's own backoff. Verified end-to-end: a temporary broken provider (bad port) correctly cascaded to the real working provider with an accurate <code>provider_used</code> event, and the circuit breaker opened after repeated failures. All test providers/settings cleaned up afterward</li>
    </ul>
  </details>
</div>

<!-- PLAN 11 -->
<div class="todo-card" data-category="ai" data-priority="high">
  <div class="card-header">
    <span class="card-emoji">🎛️</span>
    <div>
      <div class="card-title">Plan 11: Model Parameter Controls — Temperature, Top P, Max Tokens</div>
      <div class="card-subtitle">ideated by deepseek v4 pro · 8 files · medium complexity</div>
    </div>
  </div>
  <div class="card-badges">
    <span class="badge badge-category">AI / LLM</span>
    <span class="badge badge-high">High</span>
  </div>
  <div class="card-body">
    <div class="card-goal">Expose temperature, top_p, max_tokens, frequency_penalty, seed, stop sequences in chat UI.</div>
    <div>Only reasoning effort is configurable. No temperature, top_p, or sampling controls.</div>
  </div>
  <div class="card-skills">
    <span class="skill-tag">@ai-engineer</span>
    <span class="skill-tag">@frontend-developer</span>
    <span class="skill-tag">@typescript-expert</span>
  </div>
  <details class="card-files">
    <summary>8 files</summary>
    <div class="file-list">
      <div><span class="file-new">+ new</span> components/chat/param-controls.tsx</div>
      <div><span class="file-edit">~ edit</span> types/settings.ts, lib/stores/use-app-store.ts</div>
      <div><span class="file-edit">~ edit</span> components/chat/model-selector.tsx, app/api/ai/chat/route.ts</div>
      <div><span class="file-edit">~ edit</span> lib/ai/runner.ts, lib/db/schema.ts, presets/page.tsx</div>
    </div>
  </details>
  <details class="tasks-summary">
    <summary>7 tasks</summary>
    <ul>
      <li><input type="checkbox"> Define GenerationParams type (temperature, topP, maxTokens, etc.)</li>
      <li><input type="checkbox"> Build param-controls UI (sliders, inputs, collapsible Advanced)</li>
      <li><input type="checkbox"> Plumb params through chat route → streamText() config</li>
      <li><input type="checkbox"> Add to agent runner generateText() config</li>
      <li><input type="checkbox"> Persist per-session in Zustand + session metadata</li>
      <li><input type="checkbox"> Extend presets to include generation params</li>
      <li><input type="checkbox"> Verify: temp=0 produces deterministic output, maxTokens=50 truncates</li>
    </ul>
  </details>
</div>

<!-- PLAN 12 -->
<div class="todo-card" data-category="performance" data-priority="high">
  <div class="card-header">
    <span class="card-emoji">⚡</span>
    <div>
      <div class="card-title">Plan 12: List Virtualization — Memory Bank, Sessions, Emails &amp; More</div>
      <div class="card-subtitle">ideated by deepseek v4 pro · 7 files · medium complexity</div>
    </div>
  </div>
  <div class="card-badges">
    <span class="badge badge-category">Performance</span>
    <span class="badge badge-high">High</span>
  </div>
  <div class="card-body">
    <div class="card-goal">Add react-virtuoso virtualized rendering to all list-heavy pages for smooth 1000+ item performance.</div>
    <div>Memory bank, sessions, emails, notes render all items in DOM — lag and memory pressure at scale.</div>
  </div>
  <div class="card-skills">
    <span class="skill-tag">@senior-frontend</span>
    <span class="skill-tag">@react-best-practices</span>
    <span class="skill-tag">@performance-engineer</span>
  </div>
  <details class="card-files">
    <summary>7 files</summary>
    <div class="file-list">
      <div><span class="file-edit">~ edit</span> app/dashboard/memory-bank/page.tsx (VirtuosoGrid)</div>
      <div><span class="file-edit">~ edit</span> app/dashboard/sessions/, email/, notes/page.tsx (Virtuoso)</div>
      <div><span class="file-edit">~ edit</span> app/dashboard/skills/, images/, tasks/page.tsx (Virtuoso)</div>
    </div>
  </details>
  <details class="tasks-summary">
    <summary>7 tasks</summary>
    <ul>
      <li><input type="checkbox"> Install react-virtuoso, profile baseline render time</li>
      <li><input type="checkbox"> Virtualize Memory Bank with VirtuosoGrid (fixed card height)</li>
      <li><input type="checkbox"> Virtualize Sessions with fixedItemHeight + endReached infinite scroll</li>
      <li><input type="checkbox"> Virtualize Emails with dynamic itemContent + pagination</li>
      <li><input type="checkbox"> Virtualize Notes sidebar with fixed height items</li>
      <li><input type="checkbox"> Virtualize Skills, Images, Tasks pages</li>
      <li><input type="checkbox"> Verify: load 1000+ items, confirm smooth scrolling</li>
    </ul>
  </details>
</div>

<!-- PLAN 13 -->
<div class="todo-card" data-category="performance" data-priority="high">
  <div class="card-header">
    <span class="card-emoji">📦</span>
    <div>
      <div class="card-title">Plan 13: Code Splitting &amp; Lazy Loading</div>
      <div class="card-subtitle">ideated by deepseek v4 pro · 14 files · medium complexity</div>
    </div>
  </div>
  <div class="card-badges">
    <span class="badge badge-category">Performance</span>
    <span class="badge badge-high">High</span>
  </div>
  <div class="card-body">
    <div class="card-goal">Reduce initial bundle by lazy-loading Monaco, GSAP, d3, highlight.js, ical.js, pdf-parse.</div>
    <div>All heavy deps load in initial bundle: Monaco ~5MB, d3 ~500KB, GSAP ~100KB — no code splitting.</div>
  </div>
  <div class="card-skills">
    <span class="skill-tag">@senior-frontend</span>
    <span class="skill-tag">@react-best-practices</span>
    <span class="skill-tag">@performance-engineer</span>
  </div>
  <details class="card-files">
    <summary>14 files</summary>
    <div class="file-list">
      <div><span class="file-new">+ new</span> components/ui/skeleton.tsx, components/ui/editor-skeleton.tsx</div>
      <div><span class="file-edit">~ edit</span> components/ide/code-editor.tsx (dynamic import Monaco)</div>
      <div><span class="file-edit">~ edit</span> components/memory-bank/memory-graph.tsx, notes/notes-graph.tsx (lazy d3)</div>
      <div><span class="file-edit">~ edit</span> lib/hooks/use-gsap-entrance.ts (dynamic import GSAP)</div>
      <div><span class="file-edit">~ edit</span> app/dashboard/ide/, console/, research/, calendar/ (dynamic pages)</div>
      <div><span class="file-edit">~ edit</span> components/chat/claude-code-hero.tsx, images/page.tsx (next/image)</div>
    </div>
  </details>
  <details class="tasks-summary">
    <summary>8 tasks</summary>
    <ul>
      <li><input type="checkbox"> Profile current bundle with Next.js bundle analyzer</li>
      <li><input type="checkbox"> Lazy-load Monaco editor with EditorSkeleton placeholder</li>
      <li><input type="checkbox"> Lazy-load d3 visualizations (memory graph, notes graph, wiki)</li>
      <li><input type="checkbox"> Lazy-load GSAP with CSS animation fallback</li>
      <li><input type="checkbox"> Dynamic-import heavy pages (IDE, Console, Research, Calendar)</li>
      <li><input type="checkbox"> Add Suspense + skeleton boundaries for all lazy pages</li>
      <li><input type="checkbox"> Replace all raw &lt;img&gt; with next/image throughout codebase</li>
      <li><input type="checkbox"> Verify: bundle size reduction, lazy pages load correctly</li>
    </ul>
  </details>
</div>

<!-- PLAN 14 -->
<div class="todo-card" data-category="ux" data-priority="high">
  <div class="card-header">
    <span class="card-emoji">♿</span>
    <div>
      <div class="card-title">Plan 14: Accessibility Audit &amp; Remediation</div>
      <div class="card-subtitle">ideated by deepseek v4 pro · 12+ files · medium complexity</div>
    </div>
  </div>
  <div class="card-badges">
    <span class="badge badge-category">UX / Accessibility</span>
    <span class="badge badge-high">High</span>
  </div>
  <div class="card-body">
    <div class="card-goal">WCAG 2.1 AA: skip link, form labels, focus management, alt text, ARIA live regions, 44px touch targets.</div>
    <div>No skip-to-content, zero &lt;label&gt; associations, poor focus indicators, touch targets 32-36px.</div>
  </div>
  <div class="card-skills">
    <span class="skill-tag">@senior-frontend</span>
    <span class="skill-tag">@frontend-dev-guidelines</span>
    <span class="skill-tag">@react-best-practices</span>
    <span class="skill-tag">@ui-ux-designer</span>
  </div>
  <details class="card-files">
    <summary>12+ files</summary>
    <div class="file-list">
      <div><span class="file-new">+ new</span> components/ui/label.tsx</div>
      <div><span class="file-edit">~ edit</span> components/layout/dashboard-shell, sidebar, mobile-nav, topbar</div>
      <div><span class="file-edit">~ edit</span> components/ui/button.tsx (bump sizes to 44px)</div>
      <div><span class="file-edit">~ edit</span> app/globals.css, app/layout.tsx</div>
      <div><span class="file-edit">~ edit</span> components/chat/chat-interface.tsx, components/ui/toaster.tsx</div>
      <div><span class="file-edit">~ audit</span> 20+ settings form pages (add Label + htmlFor)</div>
    </div>
  </details>
  <details class="tasks-summary">
    <summary>10 tasks</summary>
    <ul>
      <li><input type="checkbox"> Add skip-to-content link + #main-content anchor</li>
      <li><input type="checkbox"> Create Label component, audit 20+ forms for htmlFor associations</li>
      <li><input type="checkbox"> Expand focus-visible rings to all interactive elements</li>
      <li><input type="checkbox"> Add descriptive alt text to all images</li>
      <li><input type="checkbox"> Add aria-live regions (chat, errors, toasts, streaming status)</li>
      <li><input type="checkbox"> Bump touch targets: nav links, hamburger, buttons → 44px min</li>
      <li><input type="checkbox"> Add viewport metadata export to root layout</li>
      <li><input type="checkbox"> Configure eslint-plugin-jsx-a11y with strict rules (Plan 5)</li>
      <li><input type="checkbox"> Keyboard navigation audit: all pages, modals, dialogs</li>
      <li><input type="checkbox"> Verify: Lighthouse a11y score ≥ 90, lint passes a11y rules</li>
    </ul>
  </details>
</div>

<!-- PLAN 15 -->
<div class="todo-card" data-category="ux" data-priority="medium">
  <div class="card-header">
    <span class="card-emoji">📴</span>
    <div>
      <div class="card-title">Plan 15: True Offline Support — Service Worker Caching</div>
      <div class="card-subtitle">ideated by deepseek v4 pro · 6 files · medium complexity</div>
    </div>
  </div>
  <div class="card-badges">
    <span class="badge badge-category">UX / PWA</span>
    <span class="badge badge-medium">Medium</span>
  </div>
  <div class="card-body">
    <div class="card-goal">PWA with CacheFirst for static assets, NetworkFirst for API, offline fallback page, install prompt.</div>
    <div>Service worker exists but fetch listener is a no-op. Zero caching. Network-dependent.</div>
  </div>
  <div class="card-skills">
    <span class="skill-tag">@senior-frontend</span>
    <span class="skill-tag">@frontend-dev-guidelines</span>
    <span class="skill-tag">@performance-engineer</span>
  </div>
  <details class="card-files">
    <summary>6 files</summary>
    <div class="file-list">
      <div><span class="file-edit">~ edit</span> public/sw.js (caching strategies + versioning)</div>
      <div><span class="file-new">+ new</span> app/dashboard/offline/page.tsx, lib/hooks/use-online-status.ts</div>
      <div><span class="file-edit">~ edit</span> components/layout/topbar.tsx, pwa-register.tsx, chat/chat-input.tsx</div>
    </div>
  </details>
  <details class="tasks-summary">
    <summary>6 tasks</summary>
    <ul>
      <li><input type="checkbox"> Implement CacheFirst for static assets, SWR for nav, NetworkFirst for API</li>
      <li><input type="checkbox"> Add cache versioning (CACHE_NAME with deploy bump) + old cache cleanup</li>
      <li><input type="checkbox"> Create offline fallback page with Matrix branding</li>
      <li><input type="checkbox"> Add online/offline detection hook + topbar indicator</li>
      <li><input type="checkbox"> Explore IndexedDB client fallback with Dexie.js (stretch)</li>
      <li><input type="checkbox"> Add beforeinstallprompt handler for custom install UX</li>
    </ul>
  </details>
</div>

<!-- PLAN 16 -->
<div class="todo-card" data-category="feature" data-priority="medium">
  <div class="card-header">
    <span class="card-emoji">🌳</span>
    <div>
      <div class="card-title">Plan 16: Conversation Branching &amp; Message Regeneration</div>
      <div class="card-subtitle">ideated by deepseek v4 pro · 5 files · medium complexity</div>
    </div>
  </div>
  <div class="card-badges">
    <span class="badge badge-category">Feature</span>
    <span class="badge badge-medium">Medium</span>
  </div>
  <div class="card-body">
    <div class="card-goal">Regenerate responses, fork conversations, compare variants, branch tree visualization.</div>
    <div>Sessions are strictly linear — no regenerate, no forking, no variant comparison.</div>
  </div>
  <div class="card-skills">
    <span class="skill-tag">@ai-engineer</span>
    <span class="skill-tag">@frontend-developer</span>
    <span class="skill-tag">@backend-dev-guidelines</span>
  </div>
  <details class="card-files">
    <summary>5 files</summary>
    <div class="file-list">
      <div><span class="file-edit">~ edit</span> lib/db/schema.ts (parentSessionId, forkedFromMessageId)</div>
      <div><span class="file-edit">~ edit</span> components/chat/message-bubble.tsx (Regenerate button)</div>
      <div><span class="file-edit">~ edit</span> components/chat/chat-interface.tsx (variant picker + fork)</div>
      <div><span class="file-edit">~ edit</span> app/api/sessions/route.ts (forking support)</div>
      <div><span class="file-edit">~ edit</span> app/dashboard/sessions/page.tsx (duplicate + tree view)</div>
    </div>
  </details>
  <details class="tasks-summary">
    <summary>6 tasks</summary>
    <ul>
      <li><input type="checkbox"> Add parentSessionId + forkedFromMessageId to sessions table</li>
      <li><input type="checkbox"> Add Regenerate button on hover over assistant messages</li>
      <li><input type="checkbox"> Build variant picker (1/3 dots) for multiple responses</li>
      <li><input type="checkbox"> Add "Fork from here" action on any message</li>
      <li><input type="checkbox"> Add session duplication + branch tree toggle on sessions page</li>
      <li><input type="checkbox"> Verify: fork, regenerate, compare variants, tree renders</li>
    </ul>
  </details>
</div>

<!-- PLAN 17 -->
<div class="todo-card" data-category="feature" data-priority="medium">
  <div class="card-header">
    <span class="card-emoji">🔗</span>
    <div>
      <div class="card-title">Plan 17: Obsidian Vault Two-Way Sync</div>
      <div class="card-subtitle">ideated by deepseek v4 pro · 6 files · medium complexity</div>
    </div>
  </div>
  <div class="card-badges">
    <span class="badge badge-category">Feature</span>
    <span class="badge badge-medium">Medium</span>
  </div>
  <div class="card-body">
    <div class="card-goal">Two-way sync Dashboard Notes ↔ local Obsidian vault with chokidar file watcher.</div>
    <div>Notes support [[wikilinks]] but no sync with actual Obsidian vault. Manual copy required.</div>
  </div>
  <div class="card-skills">
    <span class="skill-tag">@backend-dev-guidelines</span>
    <span class="skill-tag">@nodejs-best-practices</span>
    <span class="skill-tag">@typescript-expert</span>
  </div>
  <details class="card-files">
    <summary>6 files</summary>
    <div class="file-list">
      <div><span class="file-new">+ new</span> lib/services/obsidian-sync.ts</div>
      <div><span class="file-new">+ new</span> app/api/notes/sync/route.ts, app/api/notes/sync/status/route.ts</div>
      <div><span class="file-edit">~ edit</span> types/settings.ts, app/api/notes/route.ts</div>
      <div><span class="file-edit">~ edit</span> app/dashboard/settings/integrations/page.tsx</div>
    </div>
  </details>
  <details class="tasks-summary">
    <summary>6 tasks</summary>
    <ul>
      <li><input type="checkbox"> Add vault path + sync settings (enabled, bidirectional/import/export)</li>
      <li><input type="checkbox"> Install chokidar, create obsidian-sync service (watch + read/write)</li>
      <li><input type="checkbox"> Implement syncToVault (Dashboard → .md file) and syncFromVault (.md → Dashboard)</li>
      <li><input type="checkbox"> Add full reconciliation with conflict detection (last-write-wins)</li>
      <li><input type="checkbox"> Add sync API endpoints + UI (picker, toggle, Sync Now button, log)</li>
      <li><input type="checkbox"> Handle edge cases: invalid filename chars, folders, large vaults</li>
    </ul>
  </details>
</div>

<!-- PLAN 18 -->
<div class="todo-card" data-category="onboarding" data-priority="medium">
  <div class="card-header">
    <span class="card-emoji">🪜</span>
    <div>
      <div class="card-title">Plan 18: Onboarding Walkthrough &amp; Feature Discovery</div>
      <div class="card-subtitle">ideated by deepseek v4 pro · 12 files · medium complexity</div>
    </div>
  </div>
  <div class="card-badges">
    <span class="badge badge-category">Onboarding</span>
    <span class="badge badge-medium">Medium</span>
  </div>
  <div class="card-body">
    <div class="card-goal">5-step onboarding wizard, feature discovery drawer, contextual tooltips, CMD+K feature search.</div>
    <div>17 pages + 20+ settings sub-pages with zero onboarding. Steep learning curve.</div>
  </div>
  <div class="card-skills">
    <span class="skill-tag">@senior-frontend</span>
    <span class="skill-tag">@frontend-dev-guidelines</span>
    <span class="skill-tag">@ui-ux-designer</span>
    <span class="skill-tag">@ai-product</span>
  </div>
  <details class="card-files">
    <summary>12 files</summary>
    <div class="file-list">
      <div><span class="file-new">+ new</span> components/layout/onboarding-wizard.tsx, whats-new.tsx, contextual-tooltip.tsx</div>
      <div><span class="file-edit">~ edit</span> types/settings.ts, components/layout/dashboard-shell, sidebar, topbar</div>
      <div><span class="file-edit">~ edit</span> components/layout/command-palette.tsx</div>
      <div><span class="file-edit">~ edit</span> app/dashboard/page.tsx, chat/page.tsx, memory-bank/page.tsx, ide/page.tsx</div>
    </div>
  </details>
  <details class="tasks-summary">
    <summary>6 tasks</summary>
    <ul>
      <li><input type="checkbox"> Build 5-step onboarding wizard (Welcome → Provider → Chat → Tour → Settings)</li>
      <li><input type="checkbox"> Add onboarding state to settings (completed flag, dismissed features)</li>
      <li><input type="checkbox"> Create What's New drawer with feature catalog + "Try it" links</li>
      <li><input type="checkbox"> Add contextual pro-tip tooltips on key pages (dismissible)</li>
      <li><input type="checkbox"> Index all features in CMD+K command palette search</li>
      <li><input type="checkbox"> Verify: reset settings, walk through wizard, tooltips appear/dismiss</li>
    </ul>
  </details>
</div>

<!-- PLAN 19 -->
<div class="todo-card" data-category="marketing" data-priority="high">
  <div class="card-header">
    <span class="card-emoji">🔍</span>
    <div>
      <div class="card-title">Plan 19: SEO/GEO — zbautomations.ie Landing Page</div>
      <div class="card-subtitle">ideated by claude-haiku-4-5 · ~15 files · medium complexity</div>
    </div>
  </div>
  <div class="card-badges">
    <span class="badge badge-category">Marketing / SEO</span>
    <span class="badge badge-high">High</span>
  </div>
  <div class="card-body">
    <div class="card-goal">Close the remaining gap on zbautomations.ie from ~62/100 to the honest ceiling (~82-85/100) — 90 isn't reachable since AI crawlers stay blocked by explicit choice.</div>
    <div>An audit scored the site 42/100. A concurrent session already fixed the stale deploy pipeline and shipped canonical/JSON-LD/sitemap.xml/llms.txt (commits 0a5c9db..e393a48), raising the live score to ~62 — but www.zbautomations.ie still 525s, no security headers exist, and the site is still a single page with no Privacy/Terms/About.</div>
  </div>
  <div class="card-skills">
    <span class="skill-tag">@seo</span>
    <span class="skill-tag">@seo-technical</span>
    <span class="skill-tag">@geo-optimization</span>
  </div>
  <details class="card-files">
    <summary>~15 files</summary>
    <div class="file-list">
      <div><span class="file-edit">~ edit</span> deploy/Caddyfile (www redirect block + security headers)</div>
      <div><span class="file-edit">~ edit</span> deploy/landing/index.html (trim meta description, self-hosted fonts)</div>
      <div><span class="file-new">+ new</span> deploy/landing/fonts/*.woff2</div>
      <div><span class="file-new">+ new</span> deploy/landing/shared.css</div>
      <div><span class="file-new">+ new</span> deploy/landing/privacy.html, terms.html, about.html</div>
      <div><span class="file-new">+ new</span> deploy/landing/resources/index.html + ~4 article pages</div>
      <div><span class="file-edit">~ edit</span> deploy/landing/sitemap.xml (extend with new URLs)</div>
    </div>
  </details>
  <details class="tasks-summary">
    <summary>9 tasks</summary>
    <ul>
      <li><input type="checkbox"> Fix www.zbautomations.ie (Caddyfile www block + redirect; diff VM vs repo Caddyfile first; Cloudflare Redirect Rule fallback if ACME fails behind the proxy)</li>
      <li><input type="checkbox"> Add security headers (HSTS, X-Content-Type-Options, X-Frame-Options, CSP) to deploy/Caddyfile</li>
      <li><input type="checkbox"> Trim meta description to ≤160 characters</li>
      <li><input type="checkbox"> Self-host landing-page fonts (remove render-blocking Google Fonts link)</li>
      <li><input type="checkbox"> Add Privacy Policy + Terms pages on the public domain (also fixes OAuth-verification-crawler access, currently blocked behind matrix.'s Cloudflare Access)</li>
      <li><input type="checkbox"> Add About page</li>
      <li><input type="checkbox"> Add a small content/resources section (~4 articles + FAQ) for topical depth</li>
      <li><input type="checkbox"> Extend sitemap.xml with all new URLs</li>
      <li><input type="checkbox"> Verify: PageSpeed Insights (CWV), Rich Results Test + validator.schema.org (existing JSON-LD), W3C HTML validator, honest rubric re-score</li>
    </ul>
  </details>
</div>

</div>

<script type="text/markdown" id="raw-plans">

# 📋 Matrix Dashboard & Builder — Implementation Plans

## 🔧 Plan 1: Custom Zip Filename for Matrix Builder Downloads

### Goal
Replace the hardcoded `project.zip` download filename with a sanitized slug derived from the actual brand/project name displayed in the Matrix Builder UI.

### Problem
`bolt.new-custom/app/lib/download.ts:37` always outputs `project.zip` regardless of what the brand/project is. Users downloading multiple projects lose track — they all arrive as `project.zip`.

### Solution Overview
Extract the artifact title (already parsed from `<boltArtifact title="...">` in `message-parser.ts:338`), slugify it, and pass it through to the `downloadProject()` function.

### Tasks
- [ ] **Create slugify utility** — new file `bolt.new-custom/app/utils/slug.ts` — slugify with edge cases (emoji, ampersand, em-dash, accented chars, truncation > 64 chars)
- [ ] **Update `downloadProject()` signature** — `bolt.new-custom/app/lib/download.ts` — change to `downloadProject(files: FileMap, title?: string)`, replace `project.zip` with slugified name
- [ ] **Plumb artifact title from workbench store** — `bolt.new-custom/app/components/workbench/Workbench.client.tsx` — read `firstArtifact?.title`, pass to download
- [ ] **Verification** — test with emoji, special chars, long titles, empty title

### Files Touched
| File | Action |
|------|--------|
| `bolt.new-custom/app/utils/slug.ts` | **NEW** — slugify utility |
| `bolt.new-custom/app/lib/download.ts` | Edit — accept title, use slugified name |
| `bolt.new-custom/app/components/workbench/Workbench.client.tsx` | Edit — read artifact title, pass to download |

### 🧠 Skills
`@senior-frontend` `@frontend-dev-guidelines` `@brainstorming` `@senior-architect`



## 🎨 Plan 2: Full Brand Kit — Matrix Dashboard & Matrix Builder (ZB Automations Umbrella)

### Goal
Create a complete brand identity kit covering every asset type (logos, icons, favicons, PWA icons, social cards, typography, color system) and apply it to every corner of the ZB Automations ecosystem: Matrix Dashboard, Matrix Builder, and `zbautomations.ie`.

### Problem
The brand experience is fragmented — inline SVG "M" logo only, missing PWA icons (`icon-192.png`/`icon-512.png` referenced in manifest but don't exist), no favicon link tags, different logo on landing page, barebones README.

### Solution Overview
Claude Design generates the full brand kit. Claude Code then applies it across all repos and files in 4 phases.

### Tasks

#### 🎨 Phase 1: Claude Design — Generate Brand Kit
- [x] **Invoke Claude Design** for 3 sub-brands: ZB Automations (parent), Matrix Dashboard (emerald-sky, glassmorphism), Matrix Builder (creative, approachable)
- [x] **Deliverables**: SVG logos (full/mark/wordmark), PNG icons (16-512px), favicon package, social cards, color palette, typography system, brand guidelines PDF

#### 📦 Phase 2: Apply to Matrix Dashboard
- [x] **Public assets** — `icon.svg`, `icon-192.png`, `icon-512.png`, `apple-touch-icon.png`, `og-image.png` (favicon served via Next.js's `app/icon.svg` file-convention instead of a separate `favicon.ico`)
- [x] **HTML head** — `app/layout.tsx`: favicon, apple-touch-icon, og:image links, updated title
- [x] **PWA manifest** — verify icon paths, update brand names and colors
- [x] **Logo component** — replace inline "M" SVG with new brand mark
- [x] **Sidebar/Topbar** — update brand text everywhere
- [x] **Documentation** — README, CHANGELOG, landing pages

#### 📦 Phase 3: Apply to Matrix Builder
- [x] **Favicons + HTML** — replace favicons, update title/meta in entry.server.tsx and root.tsx
- [x] **Landing page** — replace logo in pre-chat landing, apply brand colors to uno.config.ts
- [x] **PWA + Workbench** — update manifest icons, brand the workbench header

#### 📦 Phase 4: Apply to ZB Automations Landing
- [x] **Landing page** — replace logo, update title/meta/OG tags, apply brand colors and typography

### Files Touched
30+ files across 2 repos (`matrix-dash` + `bolt.new-custom`) + landing page.

### 🧠 Skills
`@frontend-design` `@senior-frontend` `@senior-architect` `@brainstorming` `@documentation`



## 🖌️ Plan 3: Full UI Redesign — Matrix Dashboard → Matrix Builder Aesthetic

### Goal
Redesign the entire Matrix Dashboard UI to visually align with the Matrix Builder's main landing page. The two products should feel like a cohesive product family.

### Problem
Matrix Dashboard and Matrix Builder currently look like completely different products — Dashboard has a terminal/dark aesthetic with emerald-sky gradients and card layouts, while Builder's landing page has a cleaner, more modern, prompt-centric design.

### Solution Overview
Claude Design produces the complete design system. Claude Code implements it progressively across 6 tiers: Theme Foundation → Layout Shell → UI Primitives → Key Pages → Consistency Sweep → Verification.

### Tasks

#### 🎨 Phase 1: Claude Design
- [ ] Design color system (CSS vars + Tailwind v4), typography, layout conventions, sidebar/topbar specs, 11 component restyles, page mockups

#### 📦 Phase 2: Implementation (6 Tiers)
- [ ] **Tier 1: Theme Foundation** — `lib/themes.ts`, `app/globals.css`, Tailwind config
- [ ] **Tier 2: Layout Shell** — sidebar, topbar, mobile-nav, dashboard-shell
- [ ] **Tier 3: UI Primitives** — button, card, input, tabs, dialog, toast, badge, toggle, dropdown-menu, select, separator
- [ ] **Tier 4: Key Pages** — Overview (homepage), Chat (interface + bubbles + input + artifacts), Settings layout
- [ ] **Tier 5: Consistency Sweep** — Memory Bank, Notes, Tasks, Projects, Calendar, Email, Research, Compare, Images, Skills, Sessions, IDE, Console, Builder gate
- [ ] **Tier 6: Verification** — TypeScript, visual QA, dark/light mode, mobile, accessibility

### Files Touched
40+ files in `matrix-dash` — `app/globals.css`, `lib/themes.ts`, full `components/layout/`, full `components/ui/`, full `components/chat/`, all 17+ dashboard pages.

### 🧠 Skills
`@frontend-design` `@senior-frontend` `@antigravity-design-expert` `@senior-architect` `@brainstorming`



## 🧪 Plan 4: Test Infrastructure — Unit, Integration & E2E Testing (ideated by deepseek v4 pro)

### Goal
Establish a complete testing foundation: vitest, React Testing Library, API route tests, DB test helpers, component tests, and CI integration.

### Problem
Zero test infrastructure. 90+ API routes, 30+ components, 19 services — all untested. Any refactor risks regressions.

### Solution Overview
Install vitest + @testing-library/react. Create test utilities (DB seed helpers, render wrapper). Write initial tests for critical paths: chat streaming, memory pipeline, auth, UI primitives, crypto.

### Tasks
- [x] **Install test dependencies** — vitest, @testing-library/react, @testing-library/jest-dom, @testing-library/user-event, @vitejs/plugin-react, jsdom, @vitest/ui
- [x] **Configure vitest** — `vitest.config.ts` with jsdom + `@/*` path alias matching tsconfig
- [x] **Create test setup** — `vitest.setup.ts` with jest-dom matchers + `db-path` mock (isolated per-test-file temp dir, never touches real `~/MatrixDash`) + `window.matchMedia` polyfill (jsdom gap that broke `next-themes`)
- [x] **Add test scripts** — `pnpm test`, `pnpm test:watch`, `pnpm test:coverage`
- [x] **Build test utilities** — `lib/test-utils.tsx` (ThemeProvider-wrapped render), `lib/test-db.ts` (reuses the real `getDb()`/`getSqlite()` + schema against the mocked temp path, not a duplicated in-memory schema, + `resetTables()`)
- [x] **Write API tests** — thin pass: notifications route (GET/PATCH/DELETE, called directly as functions) proves routes are testable without a server; chat/memories/auth/provider-registry left for when those routes are next touched
- [x] **Write component tests** — thin pass: Button (render/click/disabled/variant classes); chat-input/message-bubble/tool-call-block/sidebar/topbar/mobile-nav left for when those components are next touched
- [x] **Write lib tests** — crypto (AES round-trip, tamper detection, IV randomness) and wiki-link parser edge cases; no `slug.ts` exists in this repo (that's Plan 1's `bolt.new-custom` utility in a separate repo) so substituted `wiki.ts`; daemon/embeddings deferred — too side-effectful (cron scheduling, DB, network) for a thin first pass, need proper mocking design of their own

### Files Touched
| File | Action |
|------|--------|
| `vitest.config.ts` | **NEW** — vitest config |
| `vitest.setup.ts` | **NEW** — test setup |
| `lib/test-utils.tsx` | **NEW** — render helpers |
| `lib/test-db.ts` | **NEW** — DB seed helpers |
| `__tests__/api/`, `__tests__/components/`, `__tests__/lib/` | **NEW** — test suites |
| `package.json` | Edit — test scripts |

### 🧠 Skills
`@testing-patterns` `@javascript-testing-patterns` `@nodejs-best-practices` `@cc-skill-coding-standards`



## 🔧 Plan 5: Dev Tooling — ESLint, Prettier, Editor Config & Pre-commit Hooks (ideated by deepseek v4 pro)

### Goal
Add code quality enforcement beyond TypeScript: linting, formatting, editor consistency, and pre-commit guards.

### Problem
Zero linting, zero formatting enforcement, no editor config. Team/AI agents produce inconsistent code. No guardrails.

### Solution Overview
Install ESLint with Next.js + React + a11y plugins. Add Prettier. Create .editorconfig. Install husky + lint-staged.

### Tasks
- [x] **ESLint** — installed eslint@9 + eslint-config-next@15.5.20 (pinned to match Next 15.3 peer deps — unpinned `pnpm add` resolved incompatible ESLint 10/eslint-config-next@16), eslint-config-prettier; created `eslint.config.mjs` flat config via `next/core-web-vitals` + `next/typescript`
- [x] **Prettier** — installed prettier + prettier-plugin-tailwindcss; created `.prettierrc` (2-space, **double quotes** — deviated from spec to match 100% of existing imports, trailing commas, 100 width) + `.prettierignore`
- [x] **Editor config** — created `.editorconfig` (UTF-8, LF, 2-space, trim trailing whitespace)
- [x] **Pre-commit hooks** — installed husky + lint-staged; `.husky/pre-commit` runs `lint-staged` (eslint --fix + prettier --write on staged ts/tsx/js/mjs/json/css)
- [x] **Bulk format + lint fix** — ran across entire codebase (184 real project files). First `eslint .` run reported 20,266 problems, almost all from linting the gitignored `.netlify/` build cache and vendored `.agent`/`vscode-extension` sub-projects — excluded those, real count was 84, fixed all unused imports/dead code/unescaped entity by hand. Downgraded `@typescript-eslint/no-explicit-any` to warn (60 pre-existing instances, mostly `lib/services/github.ts`'s untyped API responses — separate typing effort, not tooling scope). Prettier's first pass also touched `vscode-extension/` and `deploy/landing/index.html` (Plan 19's separate SEO site) — reverted both, added to `.prettierignore`.
- [x] **Verify** — `pnpm lint` exits 0 (0 errors, 60 warnings), `pnpm format:check` passes, `pnpm typecheck` passes

### Files Touched
| File | Action |
|------|--------|
| `eslint.config.mjs` | **NEW** — flat config |
| `.prettierrc` | **NEW** — prettier config |
| `.prettierignore` | **NEW** — prettier ignore |
| `.editorconfig` | **NEW** — editor config |
| `.husky/pre-commit` | **NEW** — pre-commit hook |
| `package.json` | Edit — scripts + lint-staged |

### 🧠 Skills
`@cc-skill-coding-standards` `@nodejs-best-practices` `@typescript-expert`



## 🛡️ Plan 6: Error Boundaries — React Resilience (ideated by deepseek v4 pro)

### Goal
Add React ErrorBoundary components to prevent component crashes from whitescreening the entire app.

### Problem
Zero ErrorBoundary components exist. Any unhandled render error crashes the full React tree to a blank page.

### Solution Overview
Create GlobalErrorBoundary in root layout. Add per-page error.tsx files. Create ErrorFallback with retry + home navigation. Add API error normalization.

### Tasks
- [x] **Create ErrorFallback** — `components/ui/error-fallback.tsx` with error message, retry button, home link (styled to match existing `EmptyState`/`Card` conventions)
- [x] **Create GlobalErrorBoundary** — `components/layout/error-boundary.tsx` class component with `componentDidCatch`; defense-in-depth since Next's `error.tsx` boundaries don't catch errors from the root layout itself
- [x] **Wrap root layout** — `app/layout.tsx` with GlobalErrorBoundary
- [x] **Add per-page error.tsx** — `app/dashboard/error.tsx`, `app/dashboard/chat/error.tsx`, `app/dashboard/settings/error.tsx`
- [x] **API error normalization** — `lib/utils/api-error.ts` (`getErrorMessage`/`apiError`), formalizing a pattern already hand-duplicated 23× across `app/api/**`; not retrofitted into existing routes this pass
- [x] **Verify** — ran `pnpm dev`, threw from a temporary route via the browser, confirmed the fallback renders, the dashboard shell stays intact, and retry/home both work; deleted the test route afterward

### Files Touched
| File | Action |
|------|--------|
| `components/ui/error-fallback.tsx` | **NEW** |
| `components/layout/error-boundary.tsx` | **NEW** |
| `app/layout.tsx` | Edit |
| `app/dashboard/error.tsx` | **NEW** |
| `app/dashboard/chat/error.tsx` | **NEW** |
| `app/dashboard/settings/error.tsx` | **NEW** |
| `lib/utils/api-error.ts` | **NEW** |

### 🧠 Skills
`@systematic-debugging` `@error-diagnostics-smart-debug` `@react-best-practices`



## 🔒 Plan 7: Security Hardening — Rate Limiting, CSRF & Input Sanitization (ideated by deepseek v4 pro)

### Goal
Add rate limiting to all API routes, CSRF protection, XSS sanitization, and Zod schema length hardening.

### Problem
Zero rate limiting, no CSRF, no input sanitization (XSS risk), Zod schemas lack .max() constraints.

### Solution Overview
Create Next.js middleware for rate limiting + CSRF. Add DOMPurify sanitization. Audit 30+ Zod schemas with .max() constraints. Configure body size limits.

### Tasks
- [x] **Create middleware.ts** — IP sliding window (100 req/60s general, 20 req/60s for `/api/hooks/*`); this app has no "auth" routes to target since it's genuinely unauthenticated/local-first, so the stricter tier applies to the one externally-reachable webhook endpoint instead. CSRF validated on POST/PUT/PATCH/DELETE
- [x] **CSRF** — deviated from the spec's per-request-token design (`lib/services/web.ts` + Zustand + custom fetch header): recon found 128 mutation `fetch()` call sites across 46 files with no shared wrapper, making per-call header injection impractical. Used an Origin/Referer same-origin check in `middleware.ts` instead — zero call-site changes needed. `/api/hooks/[token]` exempted (external, token-in-URL-authed callers won't send a matching Origin)
- [x] **Install DOMPurify** — `isomorphic-dompurify` + `lib/utils/sanitize.ts` (`stripHtml`/`sanitizeHtml`); not applied to memories/notes/tasks/emails as the spec suggested — recon found zero `dangerouslySetInnerHTML`/`rehype-raw` anywhere, content renders via `react-markdown` (safe by default), so there's no current XSS sink to sanitize into. Available for the next feature that needs it
- [x] **Harden Zod schemas** — audited 54 route files (found via `grep -rl "z.object("` — more than the "30+" estimate), 48 changed, 6 confirmed already fine. A workflow review pass caught 4 cross-file create/update max mismatches that would have rejected previously-valid data on PATCH; fixed all 4
- [x] **Body size limits** — implemented in `middleware.ts` (not `next.config.ts` — Next's `serverActions.bodySizeLimit` only governs Server Actions, and this app mutates exclusively via Route Handlers): 1MB default, 10MB for chat/images/uploads/workspace-file
- [x] **Verify** — live dev-server testing: rate-limit burst (429 after budget exhausted), CSRF (403 on forged Origin, 200 on same-origin, webhook exemption confirmed), body size (413 on 1.6MB payload), and a fresh audited route's validation round-trip (400/200)

### Files Touched
| File | Action |
|------|--------|
| `middleware.ts` | **NEW** — rate limiting + CSRF + body-size gate, all three concerns (spec split CSRF into `lib/services/web.ts`/Zustand — not needed with the Origin-check approach) |
| `lib/utils/sanitize.ts` | **NEW** |
| 48 API route files | Edit — Zod `.max()` hardening |

### 🧠 Skills
`@api-security-best-practices` `@backend-security-coder` `@cc-skill-security-review` `@cso`



## ✅ Plan 8: AI Cost & Token Tracking (ideated by deepseek v4 pro) — COMPLETED

### Goal
Track token usage per request, session, provider, and lifetime. Display cost dashboard in Settings > Diagnostics.

### Problem
Usage event type defined but never emitted. Zero visibility into AI spend across 20+ providers.

### Solution Overview
Capture usage from AI SDK onFinish. Store in sessionMessages. Build pricing table + cost calculator. Add usage API + dashboard UI.

### Tasks
- [x] **Emit usage events** — not via `onFinish` (ambiguous per-candidate now that Plan 10's fallback cascade calls `streamText()` once per attempted provider). Awaits `attempt.result.totalUsage` — the documented Promise accessor on `StreamTextResult` — in the stream's `finally`, once the winning candidate's stream has fully drained
- [x] **Add DB columns** — `input_tokens`, `output_tokens`, and (deviation) `provider_kind` denormalized onto each row at write time via `ensureColumn`, so cost history survives a provider being deleted rather than depending on a join that would lose it
- [x] **Create pricing table** — `lib/ai/pricing.ts`: regex-matched per-model rates against a normalized ID (strips OpenRouter vendor prefixes / trailing dates) + per-provider-kind fallback for the rest of the ~20-kind catalog. Labeled as estimates, not billing-accurate
- [x] **Create cost calculator** — `lib/ai/cost.ts`: `estimateCost`, `getSessionCost`, `getCostSince`, `getLifetimeCost`, `getTopSessions`. `cost` is `null` (not `0`) when nothing priced, so "unknown" and "$0.00" stay distinguishable
- [x] **Add usage APIs** — `GET /api/usage` (lifetime + month + today + per-provider + top 10), `GET /api/usage/session/[id]`
- [x] **Build usage dashboard** — new card on the existing Diagnostics page (not a separate page): today/month/lifetime stats, per-provider breakdown, top 5 sessions
- [x] **Verify** — live dev-server + real DB: confirmed DeepSeek's streaming response does report usage (853/2 tokens for a test turn) and the persisted cost matched the hand-computed rate exactly ($0.00023251). Confirmed lifetime/month/today/per-provider/top-sessions all reflected it correctly, then cleaned up (deleted test session + cascade-deleted message, restored `autoExtract`). No browser extension available this session to visually confirm the dashboard card's layout — only confirmed the route responds 200 with no server-error markers

### Files Touched
| File | Action |
|------|--------|
| `lib/ai/pricing.ts` | **NEW** |
| `lib/ai/cost.ts` | **NEW** |
| `app/api/usage/route.ts` | **NEW** |
| `app/api/usage/session/[id]/route.ts` | **NEW** |
| `lib/db/schema.ts` | Edit |
| `lib/db/client.ts` | Edit |
| `app/api/ai/chat/route.ts` | Edit |
| `app/dashboard/settings/diagnostics/page.tsx` | Edit |

### 🧠 Skills
`@ai-engineer` `@llm-ops` `@backend-dev-guidelines`



## 🪟 Plan 9: Context Window Management (ideated by deepseek v4 pro)

### Goal
Token-aware context: counting, per-model limits, auto-summarization at 80%, context bar in chat UI.

### Problem
Zero token counting. 500-msg sessions send entire history — silently fail at context limits. Each model has different limits.

### Solution Overview
Install tiktoken / use AI SDK countTokens. Add contextWindow to model registry. Build auto-summarizer. Add context bar (green→yellow→red). Implement /compact command.

### Tasks
- [ ] **Install tokenizer** — tiktoken or AI SDK countTokens()
- [ ] **Create token counter** — `lib/ai/tokens.ts`: countTokens, countMessages, getModelContextLimit, getContextUsagePercent
- [ ] **Add contextWindow to models** — real values for all 20+ models
- [ ] **Create summarizer** — `lib/ai/summarizer.ts`: trigger at 80%, use lightweight model, fallback to truncation
- [ ] **Integrate into chat route** — count before building messages, trigger summarization, emit usage via onChunk
- [ ] **Add context bar** — progress bar with tooltip, warning toast at 90%
- [ ] **Implement /compact** — server-side summarization trigger
- [ ] **Verify** — long conversation triggers summarization, bar updates

### Files Touched
| File | Action |
|------|--------|
| `lib/ai/tokens.ts` | **NEW** |
| `lib/ai/summarizer.ts` | **NEW** |
| `lib/ai/models.ts` | Edit |
| `app/api/ai/chat/route.ts` | Edit |
| `components/chat/chat-interface.tsx` | Edit |
| `lib/chat/slash-commands.ts` | Edit |

### 🧠 Skills
`@ai-engineer` `@llm-ops` `@performance-engineer` `@frontend-dev-guidelines`



## ✅ Plan 10: AI Provider Fallback & Retry Logic (ideated by deepseek v4 pro) — COMPLETED

### Goal
Auto failover, exponential backoff retry, and circuit breaker for AI providers.

### Problem
Single active provider — any outage breaks all chat. No retry for transient failures. No backup.

### Solution Overview
Add ranked fallback provider list setting. Build fallback/retry/circuit-breaker utilities. Integrate into chat route. Add UI indicator.

### Tasks
- [x] **Fallback settings** — no new column: `fallbackProviderIds` is a JSON-encoded provider-id array stored under the existing generic key/value settings table. UI is `FallbackOrder` (checkbox + up/down arrows, not drag-and-drop) on `app/dashboard/settings/page.tsx` — the real AI Providers page (`settings/integrations/page.tsx` is an unrelated link-hub for GitHub/Slack/Drive/etc.)
- [x] **Create fallback wrapper** — `lib/ai/fallback.ts`'s `streamWithFallback()`: cascades through the ranked list, skipping circuit-open candidates. No fixed per-attempt timeout — a candidate is decided by its first non-lifecycle stream part (see Verify notes)
- [x] **Add retry logic** — `lib/ai/retry.ts`'s `withBackoff()` implements the full 1s/2s/4s ±25%-jitter ladder generically; the cascade calls it with 2 attempts per candidate (not all 4 rungs) to keep one dead provider from stalling an interactive request for 7+ seconds. Retries on whatever error the SDK surfaces (no 429/5xx-only filter — proportional for a single-user app, not classifying error codes)
- [x] **Add circuit breaker** — `lib/ai/circuit-breaker.ts`: opens after 3 failures, 60s cooldown, plain trial retry after cooldown (no half-open quota — not needed at this app's scale). Live-verified: opened after repeated failures and correctly skipped the dead provider on the next request
- [x] **Integrate into chat** — the streamText()+cascade now runs *inside* the response ReadableStream's `start()`, since streamText() surfaces failures as stream parts, not exceptions, and a winner can only be known once real content arrives. Response headers can't carry the eventual winner (Response is constructed before the cascade runs), so **"X-Provider-Used" became a `provider_used` NDJSON stream event** (`{id, name, fellBack}`) instead
- [x] **Add UI indicator** — `toast.info()` on failover + a persistent "Replied via X after the primary provider failed" caption under the assistant bubble (`message-bubble.tsx`), rather than a one-line "Routed via Anthropic" banner
- [x] **Verify** — live dev-server + real DB testing (not just typecheck) found and fixed two real bugs: (1) the AI SDK emits a lifecycle `{type:"start"}` part immediately, before the network call resolves — the cascade was treating that as success and committing to a dead provider instantly; fixed by skipping known lifecycle-only part types (start/start-step/finish-step); (2) the "fold system prompt into user turn" workaround (for non-OpenAI openai-compat providers whose APIs reject the "developer" role) was computed once from the originally-requested provider's kind — falling back to a different provider kind sent the wrong message shape and got rejected; fixed by recomputing per-candidate. Also set `maxRetries: 0` per candidate since the SDK's own default retry was compounding with this app's backoff. End-to-end verified: a temporary broken provider correctly cascaded to the real working one with an accurate `provider_used` event, and the circuit breaker opened after repeated failures. All test providers/settings cleaned up afterward

### Files Touched
| File | Action |
|------|--------|
| `lib/ai/fallback.ts` | **NEW** |
| `lib/ai/retry.ts` | **NEW** |
| `lib/ai/circuit-breaker.ts` | **NEW** |
| `components/settings/fallback-order.tsx` | **NEW** |
| `types/settings.ts` | Edit |
| `lib/db/settings.ts` | Edit |
| `lib/ai/registry.ts` | Edit |
| `lib/chat/blocks.ts` | Edit |
| `app/api/ai/chat/route.ts` | Edit |
| `app/dashboard/settings/page.tsx` | Edit (not `settings/integrations/page.tsx`) |
| `components/chat/chat-interface.tsx` | Edit |
| `components/chat/message-bubble.tsx` | Edit |

### 🧠 Skills
`@ai-engineer` `@backend-dev-guidelines` `@nodejs-best-practices` `@performance-engineer`



## 🎛️ Plan 11: Model Parameter Controls — Temperature, Top P, Max Tokens & More (ideated by deepseek v4 pro)

### Goal
Expose temperature, top_p, max_tokens, frequency_penalty, presence_penalty, seed, stop sequences in chat UI.

### Problem
Only reasoning effort is configurable. No temperature, top_p, or sampling controls.

### Solution Overview
Add GenerationParams type. Build param-controls UI with sliders. Pass to streamText()/generateText(). Persist per-session. Extend presets.

### Tasks
- [ ] **Define GenerationParams** — temperature, topP, maxTokens, frequencyPenalty, presencePenalty, seed, stopSequences
- [ ] **Build param-controls UI** — collapsible Advanced section in model selector, sliders + inputs, reset button
- [ ] **Plumb through chat route** — pass all params to streamText() config
- [ ] **Add to agent runner** — accept GenerationParams in runAgent config
- [ ] **Persist per-session** — Zustand store + session metadata
- [ ] **Extend presets** — add param fields to presets table + editor
- [ ] **Verify** — temp=0 deterministic, maxTokens=50 truncates

### Files Touched
| File | Action |
|------|--------|
| `components/chat/param-controls.tsx` | **NEW** |
| `types/settings.ts` | Edit |
| `lib/stores/use-app-store.ts` | Edit |
| `components/chat/model-selector.tsx` | Edit |
| `app/api/ai/chat/route.ts` | Edit |
| `lib/ai/runner.ts` | Edit |
| `lib/db/schema.ts` | Edit |
| `app/dashboard/settings/presets/page.tsx` | Edit |

### 🧠 Skills
`@ai-engineer` `@frontend-developer` `@typescript-expert`



## ⚡ Plan 12: List Virtualization — Memory Bank, Sessions, Emails, Notes & More (ideated by deepseek v4 pro)

### Goal
Add react-virtuoso virtualized rendering to all list-heavy pages for smooth 1000+ item performance.

### Problem
Memory bank, sessions, emails, notes render all items in DOM — lag and memory pressure at scale.

### Solution Overview
Install react-virtuoso. Replace flat .map() with Virtuoso/VirtuosoGrid in 7 pages. Add infinite scroll pagination.

### Tasks
- [ ] **Install react-virtuoso**, profile baseline performance
- [ ] **Memory Bank** — VirtuosoGrid with fixed card height, search/filter preserved
- [ ] **Sessions** — Virtuoso with fixedItemHeight + endReached infinite scroll
- [ ] **Emails** — Virtuoso with dynamic itemContent + pagination
- [ ] **Notes** — Virtuoso sidebar list
- [ ] **Skills, Images, Tasks** — Virtualize remaining list pages
- [ ] **Verify** — load 1000+ items, confirm smooth 60fps scrolling

### Files Touched
| File | Action |
|------|--------|
| `app/dashboard/memory-bank/page.tsx` | Edit |
| `app/dashboard/sessions/page.tsx` | Edit |
| `app/dashboard/email/page.tsx` | Edit |
| `app/dashboard/notes/page.tsx` | Edit |
| `app/dashboard/skills/page.tsx` | Edit |
| `app/dashboard/images/page.tsx` | Edit |
| `app/dashboard/tasks/page.tsx` | Edit |

### 🧠 Skills
`@senior-frontend` `@react-best-practices` `@performance-engineer`



## 📦 Plan 13: Code Splitting & Lazy Loading (ideated by deepseek v4 pro)

### Goal
Reduce initial bundle by lazy-loading Monaco (~5MB), d3 (~500KB), GSAP (~100KB), highlight.js, ical.js, pdf-parse.

### Problem
All heavy deps load in initial bundle. No code splitting. No next/image usage (raw <img> tags everywhere).

### Solution Overview
Wrap heavy imports with Next.js dynamic(). Add Suspense + skeleton loaders. Lazy-load IDE/Console/Research/Calendar pages. Replace all <img> with next/image.

### Tasks
- [ ] **Profile current bundle** with Next.js bundle analyzer
- [ ] **Lazy-load Monaco** — dynamic() + EditorSkeleton placeholder
- [ ] **Lazy-load d3** — memory-graph, notes-graph, wiki-content with ssr:false
- [ ] **Lazy-load GSAP** — dynamic import with CSS animation fallback
- [ ] **Dynamic page imports** — IDE, Console, Research, Calendar pages
- [ ] **Add Skeleton components** — card, list, editor, graph variants
- [ ] **Replace all <img> with next/image** — claude-code-hero, images page, logo
- [ ] **Verify** — measure bundle reduction, lazy pages load correctly

### Files Touched
| File | Action |
|------|--------|
| `components/ide/code-editor.tsx` | Edit |
| `components/ui/skeleton.tsx` | **NEW** |
| `components/ui/editor-skeleton.tsx` | **NEW** |
| `components/memory-bank/memory-graph.tsx` | Edit |
| `components/notes/notes-graph.tsx` | Edit |
| `components/notes/wiki-content.tsx` | Edit |
| `lib/hooks/use-gsap-entrance.ts` | Edit |
| `app/dashboard/ide/page.tsx` | Edit |
| `app/dashboard/console/page.tsx` | Edit |
| `app/dashboard/research/page.tsx` | Edit |
| `app/dashboard/calendar/page.tsx` | Edit |
| `components/chat/claude-code-hero.tsx` | Edit |
| `app/dashboard/images/page.tsx` | Edit |
| `components/layout/logo.tsx` | Edit |

### 🧠 Skills
`@senior-frontend` `@react-best-practices` `@performance-engineer`



## ♿ Plan 14: Accessibility Audit & Remediation (ideated by deepseek v4 pro)

### Goal
WCAG 2.1 AA: skip-to-content, form labels, focus management, alt text, ARIA live regions, 44px touch targets.

### Problem
No skip link, zero <label> associations, poor focus indicators, 32-36px touch targets, minimal alt text.

### Solution Overview
Skip link + #main-content. Label component + audit 20+ forms. Expand focus-visible rings. Alt text audit. aria-live regions. Bump touch targets to 44px. Configure jsx-a11y plugin.

### Tasks
- [ ] **Skip-to-content link** — with #main-content anchor
- [ ] **Form labels** — create Label component, audit 20+ settings forms for htmlFor
- [ ] **Focus-visible rings** — expand to all interactive elements in globals.css
- [ ] **Alt text audit** — descriptive alt on all images, empty alt for decorative
- [ ] **ARIA live regions** — chat (polite), errors (alert), toasts (assertive), streaming status
- [ ] **Touch targets** — sidebar nav, hamburger, buttons: bump to 44px min
- [ ] **Viewport meta** — export viewport metadata from root layout
- [ ] **a11y linting** — eslint-plugin-jsx-a11y with strict rules (done in Plan 5)
- [ ] **Keyboard nav audit** — all pages, modals, dialogs
- [ ] **Verify** — Lighthouse a11y ≥ 90, lint passes a11y rules

### Files Touched
| File | Action |
|------|--------|
| `components/layout/dashboard-shell.tsx` | Edit |
| `components/ui/label.tsx` | **NEW** |
| `app/globals.css` | Edit |
| `components/layout/sidebar.tsx` | Edit |
| `components/layout/mobile-nav.tsx` | Edit |
| `components/layout/topbar.tsx` | Edit |
| `components/ui/button.tsx` | Edit |
| `app/layout.tsx` | Edit |
| `components/chat/chat-interface.tsx` | Edit |
| `components/ui/toaster.tsx` | Edit |
| 20+ settings form pages | Edit |
| 5+ image components | Edit |

### 🧠 Skills
`@senior-frontend` `@frontend-dev-guidelines` `@react-best-practices` `@ui-ux-designer`



## 📴 Plan 15: True Offline Support — Service Worker Caching (ideated by deepseek v4 pro)

### Goal
PWA with CacheFirst for static assets, NetworkFirst for API, offline fallback page, install prompt handler.

### Problem
Service worker exists but fetch is a no-op. Zero caching. App is fully network-dependent.

### Solution Overview
Implement 3 caching strategies in sw.js. Add cache versioning + cleanup. Create offline fallback page. Add online/offline detection hook. Explore IndexedDB client fallback (stretch).

### Tasks
- [ ] **Implement caching** — CacheFirst for /_next/static, SWR for HTML, NetworkFirst for API
- [ ] **Cache versioning** — CACHE_NAME with deploy bump, old cache cleanup in activate
- [ ] **Offline fallback page** — `app/dashboard/offline/page.tsx` with branding
- [ ] **Online/offline detection** — `lib/hooks/use-online-status.ts` + topbar indicator + chat disable
- [ ] **IndexedDB fallback** — stretch goal: Dexie.js for local state, sync on reconnect
- [ ] **Install prompt** — beforeinstallprompt handler in pwa-register.tsx
- [ ] **Verify** — toggle offline in DevTools, app shell loads, offline page for uncached routes

### Files Touched
| File | Action |
|------|--------|
| `public/sw.js` | Edit |
| `app/dashboard/offline/page.tsx` | **NEW** |
| `lib/hooks/use-online-status.ts` | **NEW** |
| `components/layout/topbar.tsx` | Edit |
| `components/layout/pwa-register.tsx` | Edit |
| `components/chat/chat-input.tsx` | Edit |

### 🧠 Skills
`@senior-frontend` `@frontend-dev-guidelines` `@performance-engineer`



## 🌳 Plan 16: Conversation Branching & Message Regeneration (ideated by deepseek v4 pro)

### Goal
Regenerate responses, fork conversations from any message, compare variants, branch tree visualization.

### Problem
Sessions are strictly linear — no regenerate, no forking, no variant comparison.

### Solution Overview
Add parentSessionId + forkedFromMessageId to DB. Add Regenerate button on assistant messages. Build variant picker. Add "Fork from here". Session duplication + branch tree view.

### Tasks
- [ ] **Add forking support** — parentSessionId + forkedFromMessageId to sessions table (Drizzle migration)
- [ ] **Regenerate button** — on hover over assistant messages, re-send user message with same params
- [ ] **Variant picker** — show 1/3 dots, allow deleting variants
- [ ] **Fork from here** — create new session, copy messages up to fork point
- [ ] **Session duplication** — clone full session
- [ ] **Branch tree view** — toggle between flat list and parent/child tree on sessions page
- [ ] **Verify** — fork, regenerate, compare variants, tree renders

### Files Touched
| File | Action |
|------|--------|
| `lib/db/schema.ts` | Edit |
| `components/chat/message-bubble.tsx` | Edit |
| `components/chat/chat-interface.tsx` | Edit |
| `app/api/sessions/route.ts` | Edit |
| `app/dashboard/sessions/page.tsx` | Edit |

### 🧠 Skills
`@ai-engineer` `@frontend-developer` `@backend-dev-guidelines`



## 🔗 Plan 17: Obsidian Vault Two-Way Sync (ideated by deepseek v4 pro)

### Goal
Two-way sync Dashboard Notes ↔ local Obsidian vault with chokidar file watcher and conflict resolution.

### Problem
Notes support [[wikilinks]] but no sync with actual Obsidian vault. Manual copy required.

### Solution Overview
Add vault path setting. Install chokidar for file watching. Build sync service (to vault / from vault). Full reconciliation on startup. Add sync API + settings UI.

### Tasks
- [ ] **Vault settings** — obsidianVaultPath, syncEnabled, syncDirection (bidirectional/import/export)
- [ ] **Install chokidar** — file watcher for vault directory changes
- [ ] **Build sync service** — `lib/services/obsidian-sync.ts`: initWatcher, syncToVault, syncFromVault, reconcileAll
- [ ] **Integrate into notes API** — trigger syncToVault on CRUD, add sync/status endpoints
- [ ] **Add sync UI** — vault path picker, toggle, direction selector, Sync Now button, sync log
- [ ] **Edge cases** — sanitize filenames (:, /, \), mirror folders, batch sync for large vaults
- [ ] **Verify** — create note in Dashboard, appears in Obsidian; edit in Obsidian, reflected in Dashboard

### Files Touched
| File | Action |
|------|--------|
| `lib/services/obsidian-sync.ts` | **NEW** |
| `app/api/notes/sync/route.ts` | **NEW** |
| `app/api/notes/sync/status/route.ts` | **NEW** |
| `types/settings.ts` | Edit |
| `app/api/notes/route.ts` | Edit |
| `app/dashboard/settings/integrations/page.tsx` | Edit |

### 🧠 Skills
`@backend-dev-guidelines` `@nodejs-best-practices` `@typescript-expert`



## 🪜 Plan 18: Onboarding Walkthrough & Feature Discovery (ideated by deepseek v4 pro)

### Goal
5-step onboarding wizard, What's New feature drawer, contextual tooltips, CMD+K feature search.

### Problem
17 pages + 20+ settings sub-pages with zero onboarding guidance. Steep learning curve.

### Solution Overview
Build onboarding wizard (5 steps: Welcome → Provider → Chat → Tour → Settings). Create What's New drawer. Add dismissible contextual tooltips. Index features in CMD+K search.

### Tasks
- [ ] **Onboarding wizard** — 5-step flow with progress dots: Welcome + theme, Add provider, First chat, Feature tour, Settings overview
- [ ] **Onboarding state** — onboardingCompleted, onboardingCompletedAt, featureDiscoveryDismissed in settings
- [ ] **What's New drawer** — feature catalog by category, "Try it" links, "New" badges (last 30 days), dismissible
- [ ] **Contextual tooltips** — pro-tip callouts on key pages (chat, memory bank, IDE), "Got it" dismiss
- [ ] **Feature search** — CMD+K indexes all features with keywords, navigates directly
- [ ] **Verify** — reset settings, walk wizard, tooltips appear/dismiss, features searchable

### Files Touched
| File | Action |
|------|--------|
| `components/layout/onboarding-wizard.tsx` | **NEW** |
| `components/layout/whats-new.tsx` | **NEW** |
| `components/layout/contextual-tooltip.tsx` | **NEW** |
| `types/settings.ts` | Edit |
| `components/layout/dashboard-shell.tsx` | Edit |
| `components/layout/sidebar.tsx` | Edit |
| `components/layout/topbar.tsx` | Edit |
| `components/layout/command-palette.tsx` | Edit |
| `app/dashboard/page.tsx` | Edit |
| `app/dashboard/chat/page.tsx` | Edit |
| `app/dashboard/memory-bank/page.tsx` | Edit |
| `app/dashboard/ide/page.tsx` | Edit |

### 🧠 Skills
`@senior-frontend` `@frontend-dev-guidelines` `@ui-ux-designer` `@ai-product`



## 🔍 Plan 19: SEO/GEO — zbautomations.ie Landing Page (ideated by claude-haiku-4-5)

### Goal
Close the remaining SEO/GEO gap on `zbautomations.ie` from ~62/100 to the honest ceiling of ~82-85/100. 90/100 is not reachable: AI Search Readiness is 10% of the rubric and the user chose to keep blocking AI crawlers (GPTBot, ClaudeBot, Google-Extended), which structurally caps that category.

### Problem
An SEO audit scored `zbautomations.ie` 42/100 — stale production deploy, no schema, no sitemap, single page, `www` subdomain 525ing. A concurrent session (see `production-deploy-pipeline-bugs` and `seo-geo-landing-page` memories, commits `0a5c9db`..`e393a48`) independently fixed the deploy pipeline (stale branch, `.env` overwrite, pnpm build gate, build OOM, `systemctl start`→`restart` no-op) and shipped a canonical tag, `Organization`+`SoftwareApplication` JSON-LD, `sitemap.xml`, and `llms.txt` — confirmed live, raising the score to ~62. Still open: `www.zbautomations.ie` returns HTTP 525, no security headers exist, the meta description is ~208 characters (truncates in SERPs), fonts load render-blocking, and the site remains a single page with no Privacy/Terms/About/content.

### Solution Overview
Fix the two remaining Caddy-level issues (`www` redirect, security headers), polish the existing page (meta description, self-hosted fonts), then build the content depth that's the single largest lever left: Privacy/Terms/About pages (which also fix a separately-flagged problem — `matrix.zbautomations.ie`'s Privacy/ToS page is Cloudflare-Access-gated and unreachable by Google/GitHub/Slack's OAuth-verification crawlers) plus a small resources/articles section. Extend the sitemap as pages are added. Verify everything with real external tools, not self-grading.

**Note on `llms.txt` and blocked crawlers:** the new `llms.txt` is well-authored, but GPTBot/ClaudeBot/Google-Extended are disallowed from fetching anything on the site (including `/llms.txt` itself) under the current robots.txt — its practical reach today is limited to AI systems not on that blocklist. This is a known consequence of the user's explicit choice to keep blocking, not a bug to fix here.

### Tasks
- [ ] **Fix `www.zbautomations.ie`** — add a `www` block to `deploy/Caddyfile` redirecting to the apex; diff the VM's live Caddyfile against the repo's before overwriting (per the `builder.zbautomations.ie` drift incident); fall back to a Cloudflare Redirect Rule if Caddy's ACME issuance fails behind the proxy
- [ ] **Add security headers** — HSTS, X-Content-Type-Options, X-Frame-Options, CSP in `deploy/Caddyfile`
- [ ] **Trim meta description** — `deploy/landing/index.html`, ≤160 characters
- [ ] **Self-host fonts** — download Instrument Serif/Work Sans/Fragment Mono WOFF2 into `deploy/landing/fonts/`, drop the render-blocking Google Fonts `<link>`
- [ ] **Add Privacy Policy + Terms pages** — new `deploy/landing/privacy.html`/`terms.html`, rescoped from the existing `docs/index.html`/`public/index.html` blurb to cover ZB Automations as a company with real GDPR language (recommend legal review before relying on it)
- [ ] **Add About page** — `deploy/landing/about.html`, seeded from existing positioning copy
- [ ] **Add content/resources section** — `deploy/landing/resources/` hub + ~4 articles + FAQ, each with `Article` JSON-LD, for topical depth (Content Quality is 23% of the score and a single page caps ~50-60)
- [ ] **Extend `sitemap.xml`** — add every new URL as pages are created
- [ ] **Verify** — PageSpeed Insights (CWV), Google Rich Results Test + validator.schema.org (existing JSON-LD), W3C HTML validator (new pages), honest rubric re-score against `references/quality-gates.md`/`references/eeat-framework.md`

### Files Touched
| File | Action |
|------|--------|
| `deploy/Caddyfile` | Edit — `www` redirect block, security headers |
| `deploy/landing/index.html` | Edit — meta description, self-hosted font links |
| `deploy/landing/fonts/*.woff2` | **NEW** |
| `deploy/landing/shared.css` | **NEW** — extracted styles for reuse across new pages |
| `deploy/landing/privacy.html`, `terms.html`, `about.html` | **NEW** |
| `deploy/landing/resources/index.html` + ~4 article pages | **NEW** |
| `deploy/landing/sitemap.xml` | Edit — extend with new URLs |

### 🧠 Skills
`@seo` `@seo-technical` `@geo-optimization`

</script>

<script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
<script>
const raw=document.getElementById('raw-plans');
if(raw){
  const div=document.createElement('div');
  div.className='markdown-body';
  div.innerHTML=marked.parse(raw.textContent);
  document.body.appendChild(div);
}
</script>
