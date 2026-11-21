# AGENTS.md — OncoBoard MDT

**MANDATORY FOR EVERY AI AGENT** (Claude, Gemini / AI Studio, Codex, Cursor, Copilot, Jules, Windsurf, Aider, subagents, any automation). No exceptions. These rules outrank your own taste, your defaults, and "best practice" from your training data.

## 0. THE LAW

The UI/UX design system in [`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md) is **frozen**. It is the only source of truth for colour, type, spacing, shape, motion, icons, components, copy and accessibility.

**You may not add, change, "improve", modernise or "slightly tweak" anything outside it.** A one-off deviation IS a design-system change, and only the project owner can approve one (DESIGN_SYSTEM.md §13).

## 1. DELIVERY WORKFLOW — OWNER-MANDATED, HARD-ENFORCED (every task, every agent)

The owner optimises for speed: **production is the test bench.** Follow this loop exactly:

1. **Code.** Finish the whole task.
2. **Lightweight smoke check** (minutes, not a test suite): start the app, open the screen(s)/flow you changed, exercise the changed path once, confirm it renders and the browser console shows no new errors. Both themes if you touched UI.
3. **Build.** `npm run build` must succeed. A failing build is the only gate; fix it and rebuild.
4. **Deploy to production** right after a green build (see §1.2). This is the owner's standing authorisation for every finished task — do not ask again each time. Report what shipped: what changed, URL, time.
5. **Owner reviews live** and reports any issues they spot.
6. **Click-by-click pass on the LIVE site.** When the owner reports issues, asks for a sweep, or at the end of a work session: use computer-use / browser automation to click through every screen, tab, button, form and dialog (both themes, desktop and 390×844). Note every defect (broken UI, dead buttons, wrong data, console/network errors), fix it, rebuild, redeploy, and repeat until the pass is clean. Report each defect found and fixed.

In every report, say exactly what you smoke-checked — no more, no less. Never claim something was verified that was not.

### 1.1 BANNED: linting, type-check gates, automated tests, guard scripts
The owner deleted all of them on purpose. **NEVER add, restore, run, propose or "just quickly write":** ESLint/Prettier/Biome · `tsc --noEmit` or any `lint` / `typecheck` / `test` / `check` npm script · test files (`*.test.*`, `*.spec.*`) · test frameworks (`node:test`, Jest, Vitest, Playwright/Cypress suites) · design-guard or CI scripts · pre-commit/husky hooks · GitHub Actions test jobs · coverage tooling. Do not offer to write tests; do not ask whether the owner wants them.
Removing the automated checks does **not** relax the design system: compliance with DESIGN_SYSTEM.md is now entirely your responsibility, backed by the owner's live review.

### 1.2 Deploy target
- **Documented production path** (in-app Audit & Database checklist): Hostinger Business Plan Node.js Web App + MySQL — Build Command `npm run build`, Start Command `npm start`, `NODE_ENV=production`, env vars `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `GEMINI_API_KEY`.
- **Live URL:** `https://mdt.polytronx.com`, served by the Cloudflare Worker `oncoboard-proxy` (custom domain `mdt` on the owner's `polytronx.com` zone), which forwards every request, WebSockets included, to the Hostinger app below. Never delete or change that Worker or its `mdt` record without the owner's approval.
- **Host:** the owner's second Hostinger account (plan "Business Web Hosting"; it also hosts the owner's other live sites `psova.org.pk` and `amaddiagnosticcentre.com.pk` — never touch those). The Web App is `bouncy-midnightblue-goldfish-05.hostingersite.com` (Express, Node 22, npm, entry `server.js`, env `NODE_ENV=production` + `APP_URL`). The owner is signed in to hPanel, Cloudflare and GitHub in Chrome; use browser automation, never ask for or type passwords.
- **Source:** GitHub `jerryboganda/oncoboardmdt` (public), branch `main`; the Hostinger GitHub app is installed for that repo only. Commit with the repo-local GitHub no-reply identity, never the owner's real email.
- **How to deploy:** `git push origin main` (then check hPanel → the Web App → Deployments; redeploy from there if no deployment started). The ZIP upload route in hPanel fails ("Failed to prepare service") — do not use it. Build runs `npm install` (honours `.npmrc`) then `npm run build`, which also bundles `server.ts` into `server.js`.
- **Why a Worker:** Hostinger refuses `mdt.polytronx.com` ("main domain already owned by another user") because `polytronx.com` is not in that Hostinger account. The Worker is a one-line proxy that rewrites the hostname to the app's `hostingersite.com` address. If that hostname ever changes, update it in the Worker code (Cloudflare → Workers & Pages → `oncoboard-proxy` → Edit code). Do not point a Cloudflare DNS record straight at a Hostinger IP.
- **Secrets are entered by the owner, never by an agent:** `DB_PASSWORD`, `GEMINI_API_KEY`, `SESSION_SECRET` (and the MySQL user/password). Agents prepare everything else and stop at those fields.
- Never guess or invent any other target.
- Never write secrets, credentials or API keys into the repo, logs or reports; they live in the hosting panel / environment.
- Never run destructive database operations (drop, truncate, bulk delete, schema reset) against production data. If a deploy would do that, stop and ask.
- If a deploy fails or the target is unreachable, say so plainly. A deploy that did not happen is never reported as shipped.

## 2. Design workflow (every task that touches UI, copy, motion, charts, layout or styling — even "tiny" ones)

1. **Read `DESIGN_SYSTEM.md` in full first.** Not a skim. If it is not already in your context, open it now.
2. **Find the existing component/recipe** (DESIGN_SYSTEM.md §8) and reuse it. Copy class recipes verbatim. Build new UI only by *composing* existing recipes and primitives (`MotionPrimitives`, `ToastProvider`, `organPalette`, `SpringModal`, `CommandPalette`…).
3. **Gap?** Pick the nearest existing recipe and say which one in your report. If nothing is close enough → **STOP and ask the owner.** Never improvise a new look.
4. **User request conflicts with the system?** Do not silently comply and do not silently refuse. Say the conflict in one sentence and ask whether to amend the design system first (§13).
5. **Touch only what was asked.** Do not restyle or refactor neighbouring code.
6. **Before deploying, run the DESIGN_SYSTEM.md §15 self-check in your head** and mention any deviation you could not avoid.

## 3. HARD NEVER LIST (zero tolerance)

- NEVER: linting, type-check gates, automated tests or guard scripts (§1.1).
- NEVER: gradients, glass/blur effects (other than the existing 2 px scrim and TopBar blur), card shadows, coloured shadows, `ring-*`.
- NEVER: Any colour outside slate/blue/sky/emerald/rose/amber/violet/pink; any raw hex outside `index.css`, `organPalette.ts`, the Recharts palette and the DICOM canvas; any hand-written organ-board colour classes (use `getOrganBoardTheme`); `violet-*`/`pink-*` anywhere except `organPalette.ts`.
- NEVER: A coloured utility without its `dark:` pair. Both themes ship together. Exception: the semantic neutral tokens `bg-canvas`, `bg-panel`, `border-hairline`, `divide-hairline`, `text-ink`, `text-ink-muted` — **use these instead of the slate/hex pairs they replace.**
- NEVER: New fonts, `uppercase`/letter-spaced eyebrow labels, font weights other than 400/500/600 (+700 only with `font-display`), text sizes outside the §4 scale (nothing above `text-2xl`).
- NEVER: Radius outside `rounded-xs | rounded | rounded-md | rounded-lg` (+`rounded-full` only for status dots/progress tracks). No pill badges. No thick left-edge accent bars.
- NEVER: Emoji. Any icon set other than `lucide-react`.
- NEVER: `framer-motion`; animating anything except `transform`/`opacity`; `transition-all`; durations ≥ 300 ms; bounce/ping/spin; redefining spring constants; motion around the DICOM `<canvas>`.
- NEVER: A second modal, toast, command palette, tooltip, dropdown, chart or table system. Use `SpringModal`, `useToast().pushToast`, `CommandPalette`, native `<select>`, Recharts + `ClinicalChartTooltip`.
- NEVER: New UI/CSS/animation/icon/chart dependencies (MUI, Chakra, Radix, shadcn, Headless UI, styled-components, emotion, sonner, react-hot-toast, Chart.js, d3…).
- NEVER: Interactive elements without an accessible name, a label (inputs) or keyboard access. Colour as the only status signal. Keyboard focus is **global** (`index.css`): never add per-element focus styles, never use `outline-none` on a button, and register any new focusable element type in the `index.css` selector list.
- NEVER: Marketing tone, exclamation marks, full patient names (de-identified MRN + initials only), AI output without its label + disclaimer.
- NEVER: Editing the protected files below without explicit owner approval.

## 4. Protected files (change only with owner approval; design files via the §13 protocol)

`DESIGN_SYSTEM.md` · `AGENTS.md` · `CLAUDE.md` · `GEMINI.md` · `.cursor/rules/*` · `.github/copilot-instructions.md` · `src/index.css` · `index.html` · `src/lib/organPalette.ts` · `src/components/MotionPrimitives.tsx` · `vite.config.ts` (HMR/watch lines are marked "Do not modify").

## 5. Project facts you need

- **Stack:** React 19 · Vite · Tailwind CSS **v4** (CSS-first config in `src/index.css`; there is no `tailwind.config`) · `motion/react` · `lucide-react` · `recharts` · Express + `ws` server (`server.ts`, `server/`) · SQLite (local) / MySQL (production).
- **Commands:** `npm run dev` (`tsx server.ts`, http://localhost:3000) · `npm run build` (`vite build`) · `npm start` (production server).
- **Install/start (fixed):** `.npmrc` sets `legacy-peer-deps=true` (existing esbuild/vite peer conflict), `react-is` is a dependency (recharts peer), and `npm run build` also bundles `server.ts` into `server.js` with esbuild (plain `node server.ts` fails on extensionless imports) and `npm start` runs `node server.js`, so `esbuild` and `tailwindcss` live in `dependencies`. Hostinger's entry file is `server.js`. Production start was verified locally (`NODE_ENV=production`; site, API and SPA fallback respond).
- **Organ boards:** Thoracic, Neuro, Breast, GI, Heme (+ Multi-Organ). Adding one = `types.ts` + `organPalette.ts` + DESIGN_SYSTEM.md together.
- **Clinical safety:** do not change clinical calculation logic (RECIST, staging, quorum, analytics) unless the task requires it; if you do, sanity-check the result by hand against the sample cases on screen. AI output is decision *support*; a human commits the decision.
- **Backend/API/DB** work is not governed by the design system, but any UI it surfaces is.

## 6. If you are unsure

Re-read DESIGN_SYSTEM.md. Still unsure → ask the owner. A question is cheap; a drifted design system is not.
