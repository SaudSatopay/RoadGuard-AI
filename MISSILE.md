# Missile log: RoadGuard AI

status: stage=1 iteration=1 verdict=CONTINUE updated=2026-10-04T16:50:52.721Z
mode: full flight (existing project, revamp + rename)
branch: missile/20261004
url: none
max_iterations: 4

## Target

- One-liner: RoadGuard AI turns a citizen's road photo into a verified, prioritised, evidence-backed repair order that a municipal inspector can act on, and that the public can watch to closure.
- Audience: Municipal road inspectors and ward engineers (console); citizens and dashcam volunteers (citizen app); project judges and examiners (landing page, README, model card).
- Signature moment: The Inspector's Mark, see DESIGN.md.
- Direction: see DESIGN.md
- Scope: the plan below.
- User's direction: Pull the CrackWatch hackathon repo and revamp it as "RoadGuard AI". Improve the models, the frontend and everything else that can be improved. One .bat file launches the whole project in one click. Use the missile's frontend beautification elements (design rules, signature moment catalog, effects) where they directly improve the frontend; do not run the whole missile ceremony for its own sake. No AI slop: the current landing page and dashboard read as AI slop and must become unique and artistic.
- Protected: the user's `docs/` folder (untracked, never touched); the backend API contracts used by the WhatsApp webhook; demo logins (admin/admin123, saud/123); the git history of the original repo.
- Out of scope: production deployment, a real database and auth system, Twilio/ngrok setup, Norway/China_Drone subsets of RDD2022.
- Definition of done: every rubric dimension at 9 or above, mean 9.5 or above, README, local tagged release, one-click launcher verified from a fresh clone. A hosted URL is out of scope (Python + GPU backend); recorded under Decisions.

## Recon

```
# Recon report
## Verdict
existing-fragile: both frontends build, but root lint fails with 69 errors, there are no tests, no CI and no deploy config, and the backend only reaches phones through self-signed certs and an ngrok tunnel that need manual setup.

## Stack
- Dashboard (root): React 19.2, Vite 8.0.8, Tailwind 4.2 via @tailwindcss/vite, framer-motion 12, shadcn 4 with base-ui 1.4, lucide-react 1.8, recharts 3.8, leaflet/react-leaflet 5, JavaScript only (jsconfig.json, no TypeScript). Alias `@` is `src`.
- Citizen PWA (public-app): React 19.2.5, Vite 8.0.8, Tailwind 4.2, framer-motion 12, leaflet-routing-machine 3.2, lucide-react 1.8, JavaScript only. Not a real PWA: no manifest, service worker or public/ folder. Sets type: commonjs while its vite config uses ESM and __dirname.
- Backend: FastAPI 0.115, uvicorn 0.30, ultralytics 8.3.0 (YOLO), opencv-python-headless 4.10, pillow 10.4, twilio 9.3, httpx, python-dotenv. Local Python 3.10.0.
- Models: backend/model/best.pt (89.6 MB, YOLOv8s, 4 classes, trained on RDD Japan+India, checkpoint metrics mAP50 0.548 / mAP50-95 0.254, includes optimizer state) and crack_seg.pt (23.9 MB, YOLOv8s-seg on Ultralytics crack-seg, mask mAP50 0.634), both committed.
- npm in all three packages.

## Commands
- Root: dev, build (PASS, 1,013 kB chunk), lint (FAIL, 69 errors), preview. typecheck and test missing.
- public-app: dev (5175), build (PASS, 1,150 kB chunk), preview. lint, typecheck, test missing.
- Backend: no script; README runs uvicorn twice (HTTPS 8000 with mkcert certs, HTTP 8001 for ngrok).

## Routes and screens
No router; both apps switch views with activeTab state.
- Dashboard: Login → Hero (landing shown only after login) → Dashboard (stats, scan, charts with hard-coded fake data), scan, video/live, reports map, repair plan, analytics (wall of shame, priority, forecast, city health), settings.
- Citizen app: login, map, report, rewards, stats; NavigatePage and LiveScanPage mounted but unreachable.

## Design system
- Stitch "Sovereign Intelligence": emerald #4edea3 + cyan #5de6ff on #131315, Space Grotesk + Inter/Geist, glassmorphism, gradient buttons, gradient text (HeroPage.jsx:416, :426). Dark only, no reduced-motion handling.
- ~300 hard-coded hex/rgba colors in components; 154 emoji used as icons.

## Quality
- Tests: none. Lint: 69 errors (root), none configured (citizen). Oversized single chunks. main.py is 1,430 lines.

## Deploy and story
- No deploy config, no CI. README is 635 lines, emoji-heavy. No OG metadata.

## Risks
- HTTPS certs needed for phone camera/GPS; Vite looks for certs/, backend for backend/*.pem.
- `.env.example` says https://localhost:8000 while code defaults to http.
- Nothing launches the three processes together.
- Startup loads shared_store.json if present, else 8 hardcoded reports without images (seed script points at a path on the original author's laptop).

## Arsenal
- Present: frontend-design, taste-skill, impeccable, emil animate, web-design-guidelines, hallmark, uipro, superpowers, ralph-loop, playwright-cli 0.1.22, Python Playwright + Chromium, MCP context7/shadcn/watermelon/chrome-devtools/vercel/figma, ffmpeg, vercel CLI (logged in), gh.
- Machine: RTX 5060 Ti 16 GB, torch 2.11.0+cu128, ultralytics 8.4.78, onnx + onnxruntime, scikit-learn 1.7.
```

Main-session findings added after reading the code:
- `inference.py` keys its class metadata by `D00/D10/D20/D40`, but the model's class names are display names (`Longitudinal Crack`, ..., `Potholes`). Every detection therefore misses its category/risk/repair text, `severity.py` falls back to a 0.5 type weight for every class, and `cost_engine.py` prices every pothole as a longitudinal crack (the display-name cost tables were accidentally nested inside `IGNORE_MULTIPLIER`).
- The OpenCV "supplementary detector" labels any bright patch as spalling, any blue patch (sky) as a water leak, any orange patch as corrosion and any dark round blob as a pipe break, and these are merged into road results.
- CARTO basemap tiles now render an "API KEY REQUIRED" watermark across every map.
- The landing page shows invented numbers (99.2% accuracy, 47 countries, 12,847 scans).

## Scoreboard

<!-- scoreboard:start -->
| dimension | baseline | it1 | target |
|---|---|---|---|
| first_impression | 4 | 7 | 9+ |
| design_system | 4 | 8 | 9+ |
| layout | 3 | 7 | 9+ |
| motion | 3 | 7 | 9+ |
| ux_completeness | 4 | 7 | 9+ |
| accessibility | 4 | 8 | 9+ |
| performance | 4 | 8 | 9+ |
| code_health | 4 | 8 | 9+ |
| story | 5 | 7 | 9+ |
| shipped | 2 | 4 | 9+ |
| **mean** | 3.7 | 7.1 | 9.5+ |
<!-- scoreboard:end -->

## Plan

Effort: S under 30 min, M under 2 h, L more. Each item names the rubric dimension it moves and its acceptance test.

**Foundations** (code_health, shipped)
- [ ] F1 [M] Rename CRACKWATCH to RoadGuard AI everywhere (UI, API title, README, storage keys, WhatsApp copy, package names). Test: `git grep -i crackwatch` returns only CHANGELOG history lines.
- [ ] F2 [M] `RoadGuard.bat` one-click launcher: checks Node and Python, creates `backend/.venv` (system site packages, CUDA torch reused, GPU torch installed when an NVIDIA card has none), installs npm deps once, starts API + console + citizen app, waits for `/health`, opens the browser. Test: double-click from a fresh clone reaches the landing page.
- [ ] F3 [S] Vite dev proxy `/api` → `127.0.0.1:8000` in both apps; one shared `api.js` per app. Removes the HTTPS/CORS/mixed-content trap. Test: apps work with no `.env` and no certs.
- [ ] F4 [M] Backend correctness: class names mapped to D00/D10/D20/D40 metadata, cost tables fixed (potholes priced as potholes), severity weights applied, PyJWT and scikit-learn in requirements, OpenCV colour "detectors" removed from road scans. Test: pytest on severity/cost/mapping.
- [ ] F5 [M] Lint green in both apps, Vitest in both apps, pytest for the backend; `typecheck` via `tsc --noEmit` on JSDoc-free JS is skipped (JS project) and recorded. Test: `npm run lint && npm test && npm run build` green in both; `pytest` green.

**Models** (story, first_impression, ux_completeness)
- [ ] M1 [L] Fine-tune YOLO26s on RDD2022 (5 countries, 24,482 train / 1,667 val / 1,674 held-out test). Test: `training/evaluate.py` reports test mAP50 above the legacy model overall and per country, saved in `training/results/`.
- [ ] M2 [S] Export ONNX next to the `.pt`; backend picks CUDA `.pt` when a GPU exists, ONNX on CPU otherwise. Test: `/model` endpoint reports runtime and metrics.
- [ ] M3 [M] Crack geometry from the segmentation model (coverage %, skeleton length in px and estimated metres) feeds severity. Test: unit test on a synthetic mask.
- [ ] M4 [M] DBSCAN (haversine, 25 m) merges duplicate reports into hazards. Test: pytest with synthetic duplicates.
- [ ] M5 [M] Severity = defect type × damaged area × road class (expressway, arterial, collector, local); explanation lists each factor. Test: pytest.
- [ ] M6 [M] Complaint letter drafter grounded in a small local knowledge base of grievance routes (template; Claude when `ANTHROPIC_API_KEY` is set). Test: `/reports/{id}/complaint` returns a letter citing the report's evidence.

**Design system** (design_system)
- [ ] D1 [M] One token file shared by both apps (`shared/tokens.css`), OKLCH, light-first with a designed dark mode for the console; three faces self-hosted via fontsource. Test: zero hex literals in components (`rg "#[0-9a-fA-F]{3,8}" src public-app/src` hits only token files and map marker SVG strings built from tokens).

**Signature moment** (first_impression, motion)
- [ ] S1 [M] The Inspector's Mark on the landing hero: real RDD2022 India photo, real detections from the new model sprayed on, drag handle before/after, chainage ruler, drop-your-own-photo when the API is up; static poster without JS. Test: works at 390 and 1440, reduced motion shows the final marks.

**Screens** (layout, ux_completeness, accessibility)
- [ ] V1 [L] Landing page at `/` (public): hero, how it works as a chainage of milestones, measured model numbers, live public ledger, two doors (citizen, inspector), credits.
- [ ] V2 [L] Inspector Console: Today (summary strip, priority worklist, map), Scan (evidence sheet), Hazards map (status workflow, heat, merged duplicates, complaint letter), Accountability (wards, contractors, SLA), Model card, Settings. Responsive with a drawer under 768 px.
- [ ] V3 [L] Citizen app restyle: report in three steps, map, my reports, rewards, public ledger; real PWA manifest; no padding reset bug.
- [ ] V4 [M] Every screen's loading, empty, error and offline state designed; copy rewritten from the user's side.

**Story and ship** (story, shipped)
- [ ] T1 [M] README for a judge with screenshots, model table, Mermaid diagram, one-click run steps; OG image; titles and descriptions.
- [ ] T2 [M] Seed data: 24 reports built from RDD2022 India test images (CC BY 4.0) run through the new model, spread over real Mumbai and Navi Mumbai locations.
- [ ] T3 [S] Local tag `v4.0.0-roadguard`. No hosted deploy: the backend needs Python + a model; a frontend-only deploy would show a broken app (recorded under Decisions).

**Guidance loop**: up to 4 critic iterations after the build.

## Iteration log

<!-- iterations:start -->
### Iteration 0 · 2026-10-04T14:44:30.310Z
- mean 3.7, min 2, verdict **CONTINUE**
- url: http://localhost:5173 (dashboard + landing), http://localhost:5175 (citizen app)
- screens: landing, staff login, dashboard, reports map, analytics, repair plan, citizen login, citizen map, citizen report, citizen rewards, citizen stats
- next fixes:
  - [S] layout: Delete the unlayered `* { margin: 0; padding: 0 }` reset in public-app/src/index.css (or move it into @layer base) so Tailwind padding utilities apply on every citizen screen (public-app/src/index.css)
  - [S] ux_completeness: Replace the CARTO dark_all tile URL with a source that renders without an API key (or add the key from an env var) so the citizen and staff maps stop showing 'API KEY REQUIRED' (public-app/src/pages/MapPage.jsx, public-app/src/pages/NavigatePage.jsx, src/components/GovtMap.jsx)
  - [S] motion: Wrap both app roots in <MotionConfig reducedMotion="user">, add a prefers-reduced-motion CSS block, and cut HeroPage to one sub-1 s entrance with no infinite loops (src/main.jsx, public-app/src/main.jsx, src/components/HeroPage.jsx, src/index.css, public-app/src/index.css)
  - [M] first_impression: Show HeroPage at / before login, replace fake stats with real model and seed numbers, remove gradient text, swap the abstract cards for a real detection image, and fix the 390 px nav collision (src/App.jsx, src/components/HeroPage.jsx, src/components/LoginPage.jsx)
  - [M] layout: Make the dashboard sidebar an off-canvas drawer below 768 px, and fix whatever makes the staff login and dashboard render blank at 1440 (src/components/Sidebar.jsx, src/App.jsx, src/components/LoginPage.jsx)
  - [S] accessibility: Remove user-scalable=no, add <main> landmarks, raise muted text tokens to 4.5:1, and add a global :focus-visible ring in both apps (public-app/index.html, src/App.jsx, public-app/src/App.jsx, src/index.css, public-app/src/index.css)
  - [M] code_health: Fix the 69 root lint errors, add PyJWT to backend/requirements.txt, and write three tests covering severity/cost, the /detect endpoint, and the citizen report flow (eslint.config.js, backend/requirements.txt, backend/severity.py, backend/cost_engine.py)

### Iteration 1 · 2026-10-04T16:50:52.721Z
- mean 7.1, min 4, verdict **CONTINUE**
- url: http://localhost:4173 (landing + console), http://localhost:4175 (citizen app), http://127.0.0.1:8000 (API)
- screens: landing, console login, console today, console hazards, console hazard detail, console scan (empty), console scan result, console accountability, console model card, console settings, citizen onboarding, citizen map, citizen report (photo, where, result), citizen my reports, citizen rewards, citizen ledger
- next fixes:
  - [S] first_impression: Remove the '—' placeholders from the hero stat row (show the labelled legacy figures or drop the cells), and below 640 px move the compare figure directly under the headline so the marked photo is in the first viewport (src/landing/Hero.jsx, src/landing/facts.json)
  - [S] story: Add the missing assets/readme/landing.png and a 1200×630 public/og.png built from the tokens; add og tags to the citizen index.html (README.md, assets/readme/landing.png, public/og.png, public-app/index.html)
  - [S] performance: Preload a sized AVIF/WebP hero photo with fetchpriority=high and lazy-split the console bundle off /login to get LCP under 2.5 s on all three routes (src/landing/Hero.jsx, src/App.jsx, public/showcase)
  - [L] shipped: Deploy both frontends as static sites and the FastAPI backend on a CPU host with the legacy weights, wire the API URL through env vars, and tag v4.0.0 (backend/main.py, vite.config.js, public-app/vite.config.js, .env.example)
  - [M] ux_completeness: Read backlog, acted-on and counts from one backend aggregate on the landing, console and citizen ledger, and make the Model card show the legacy detector's measured metrics instead of '—' and 'No evaluation file found' (src/landing/Ledger.jsx, src/landing/ModelFacts.jsx, src/console/views/ModelCard.jsx, src/console/data.js)
  - [S] accessibility: Re-run the keyboard walk and Lighthouse after the marker-name and file-input fixes, and fix the landing contrast element and the label-name mismatch on landing and login (src/landing/Hero.jsx, src/console/Login.jsx, shared/tokens.css)
  - [M] layout: At 390, render the Accountability scorecard as stacked rows with the health bar visible, let hazard-row titles wrap so days-open never truncates, and fix the empty sixth KPI cell on Today (src/console/views/Accountability.jsx, src/console/ui.jsx, src/console/views)

<!-- iterations:end -->

## Decisions

- 2026-10-04: Cloned the repo into the session folder root and branched `missile/20261004` from `master` (44a4902). The user's `docs/` folder stays untracked.
- 2026-10-04: Backend runs from `backend/.venv` created with `--system-site-packages`, so the machine's CUDA torch 2.11 and ultralytics 8.4 are reused instead of downloading 2.5 GB again; only PyJWT was installed into the venv.
- 2026-10-04: RDD2022 is one 13.3 GB stored zip with one inner zip per country. `training/download_rdd2022.py` reads its central directory over HTTP range requests and downloads only India, Japan, Czech, United_States and China_MotorBike (2.5 GB). Norway (10.6 GB, high-res) and China_Drone (top-down view) are skipped. Data lives in `training/data/` (gitignored). License CC BY 4.0.

## Remaining gaps

(filled at Impact, or on stall)
