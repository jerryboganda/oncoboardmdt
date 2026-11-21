# OncoBoard MDT — UI/UX Design System (FROZEN)

**Version 1.2 · 2026-11-21 · Authority: the project owner only.**
This file is the single source of truth for every pixel, word, and motion in the app. It was extracted from the shipped code (not invented). If code and this file disagree, **this file wins for all new work**.
*v1.1 (owner-approved): global keyboard-focus rules, semantic neutral tokens (`bg-panel`, `text-ink`, …) wired to the `index.css` variables, organ hues reserved to `organPalette.ts`, `text-[13px]` removed.*
*v1.2 (owner decision): all linting, automated tests and the design-guard script were deleted. Every rule in this file still applies; compliance is by agent diligence plus the owner's live review (see `AGENTS.md` §1).*

**Audit basis:** `src/index.css`, `index.html`, `App`, `Sidebar`, `TopBar`, `ToastProvider`, `MotionPrimitives`, `organPalette`, `DashboardView`, `CommandPalette`, `NewCaseModal`, `AiAssistPanel`, `CaseDossierView` (header/tabs), `ClinicalAnalyticsView` (palette/tooltip), plus codebase-wide pattern counts across all 17 components and the reference screenshots in `.aistudio/artifacts/**` and `implementation_plan.md`.

---

## 1. Product principles (why it looks like this)

1. **Clinical cockpit, not a marketing site.** Dense, calm, flat, fast. Used by oncologists during live tumour boards.
2. **Speed over spectacle.** Motion settles in ≤ 220 ms. Nothing decorative blocks work.
3. **60-30-10 neutral canvas.** ~60% canvas, ~30% panels, ~10% accent/semantic colour. Colour carries meaning (organ board, urgency, status), never decoration.
4. **Flat by default.** Borders create hierarchy. No gradients, no card shadows, no glassmorphism (except the 2 px scrim blur and TopBar blur).
5. **Data is monospace.** Clinical values (MRN, TNM, genes, HU, mm, counts, times) are `font-mono tabular-nums`.
6. **The Top Bar stays uncluttered:** breadcrumb left; theme switch + exactly one global primary action ("New Patient Case") right. Discoverability extras (e.g. ⌘K) live in the Sidebar.
7. **Diagnostic canvas is sacred.** The DICOM `<canvas>` has zero motion wrappers and zero lag; only the chrome around it animates.
8. **Accessible by default** (WCAG AA, keyboard, reduced motion, screen-reader labels).
9. **De-identified data only.** MRN + initials. Never full patient names.

---

## 2. Stack & where the tokens live

| Concern | Source of truth | Rule |
|---|---|---|
| Styling | Tailwind CSS **v4**, CSS-first config in `src/index.css` (`@theme`, `@custom-variant dark`). **No `tailwind.config.*`.** | Utility classes in JSX only. No CSS modules, no styled-components, no inline style for colour. |
| Theme switch | `.dark` class on `<html>` (set in `App.tsx`) | Every coloured utility needs its `dark:` pair — except the semantic neutral tokens (§3.2), which switch themselves. |
| Organ colours | `src/lib/organPalette.ts` | Only via `getOrganBoardTheme()` / `getOrganBoardHex()`. |
| Motion | `src/components/MotionPrimitives.tsx` + `motion/react` | Import from `motion/react` — **never** `framer-motion`. |
| Toasts | `src/components/ToastProvider.tsx` → `useToast().pushToast()` | No other notification mechanism. |
| Icons | `lucide-react` | No other icon set, no emoji. |
| Charts | `recharts` | No other chart library. |
| Fonts | `index.html` Google Fonts link + `@theme` in `index.css` | Exactly 3 families (§4). |

---

## 3. Colour

### 3.1 Themes
- **Clinical Light** (daylight consultation) and **Dark Radiology** (low-glare reading room). These two names are canonical in UI copy, toasts, aria-labels, and the command palette. Default theme on load: Dark Radiology.
- `index.css` is the single definition of the theme-switching neutrals: `--surface-canvas`, `--surface-panel`, `--border-hairline`, `--text-primary`, `--text-secondary` (light in `:root`, dark in `.dark`) plus `--accent-clinical` (focus colour). `@theme inline` exposes them as the utilities below. **Use the utilities, never the raw variables or hex.**

### 3.2 Neutral recipes (copy exactly)

**Semantic neutral tokens (preferred; no `dark:` pair needed):**

| Token | Light → Dark | Use |
|---|---|---|
| `bg-canvas` | slate-50 → `#080C14` | App background |
| `bg-panel` (`bg-panel/95` on TopBar) | `#FFFFFF` → `#0F172A` | Cards, sidebar, topbar, modals, toasts |
| `border-hairline` · `divide-hairline` | slate-200 → slate-800 | Card borders, dividers |
| `text-ink` | slate-900 → slate-100 | Headings, values, primary text |
| `text-ink-muted` | slate-600 → slate-400 | Secondary body text |

**Palette pairs (still valid where no token exists):**

| Role | Light | Dark |
|---|---|---|
| Inset / input / table head | `bg-slate-50` · head `bg-slate-50/70` | `dark:bg-slate-900` · head `dark:bg-slate-900/50` |
| Segmented-control track | `bg-slate-100` | `dark:bg-slate-900` |
| Control border (inputs, secondary buttons) | `border-slate-200` | `dark:border-slate-700` |
| Row hover | `hover:bg-slate-50/90` | `dark:hover:bg-slate-800/45` |
| Overlay scrim | `bg-slate-950/60 backdrop-blur-[2px]` | (same) |
| Selection | `selection:bg-blue-600/20` (on `<body>`) | |

**Text ladder:**

| Use | Class |
|---|---|
| Headings, values, primary text | `text-ink` |
| Form labels, strong body | `text-slate-700 dark:text-slate-300` |
| Secondary body | `text-ink-muted` (or `text-slate-600 dark:text-slate-300` for denser reading blocks) |
| Meta, captions, table headers, nav group labels | `text-slate-500 dark:text-slate-400` |
| Icons-as-affordance, placeholders | `text-slate-400` / `placeholder:text-slate-400` |

**Allowed Tailwind colour families, period:** `slate` (neutral), `blue`, `sky` (accent), `emerald`, `rose`, `amber` (semantic), `violet`, `pink` (**organ boards only — these two hues appear only in `organPalette.ts`**). Nothing else (no gray/zinc/neutral/red/green/orange/yellow/teal/cyan/indigo/purple).

**Raw hex is allowed only in:** `src/index.css` (theme values), `organPalette.ts`, the Recharts palette in `ClinicalAnalyticsView.tsx` (incl. the tooltip's `bg-[#0B1120]`), and the DICOM canvas/surfaces in `DicomViewer.tsx` (`bg-[#05070B]`, `bg-[#090D16]`). Everywhere else: tokens/palette classes.

### 3.3 Accent (interactive)
| Use | Light | Dark |
|---|---|---|
| Primary fill | `bg-blue-700 hover:bg-blue-800` | `dark:bg-sky-500 dark:hover:bg-sky-400` |
| On-primary text | `text-white` | `dark:text-slate-950` |
| Link / hover text | `hover:text-blue-700` | `dark:hover:text-sky-400` |
| Keyboard focus (global, automatic) | `--accent-clinical` = blue-700 | sky-400 |
| Active nav surface | `bg-blue-50 border-blue-200/70 text-blue-800` | `dark:bg-sky-500/12 dark:border-sky-500/25 dark:text-sky-300` |

### 3.4 Semantic status (text colour on transparent — **no filled pills/badges**)
Light uses `-700`, dark uses `-400` (AA contrast). Status is always also a **text label**, never colour alone.

| Meaning | Class |
|---|---|
| Urgent / error / critical / SLA breach | `text-rose-700 dark:text-rose-400 font-semibold` |
| Priority / Scheduled / warning / disclaimer | `text-amber-700 dark:text-amber-400 font-medium` |
| Consensus Reached / Live / success / quorum | `text-emerald-700 dark:text-emerald-400 font-medium` (`font-semibold` for "Live") |
| In Review / info | `text-sky-700 dark:text-sky-400 font-medium` |
| Routine / Intake / neutral | `text-ink-muted` |
| Connection dot | `h-2 w-2 rounded-full bg-emerald-500` (connected) / `bg-amber-500` (reconnecting) |

**Alert boxes** (`role="alert"` for errors):
- Error: `p-3 rounded-md bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300`
- Success: `p-3 rounded-md bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-800 dark:text-emerald-300`
- Warning/disclaimer: plain `text-[11px] text-amber-700 dark:text-amber-400` line under a `border-t`.

**KPI strip colours (swatch + value):** queue = neutral (`bg-slate-500 dark:bg-slate-400`, value `text-ink`) · urgent = rose · biomarkers = accent (`bg-blue-700 dark:bg-sky-400`, value `text-blue-700 dark:text-sky-400`) · consensus = emerald. Never use an organ hue (violet/pink) for a non-organ meaning.

### 3.5 Organ-board palette (identity colours)
Always from `organPalette.ts`. Never hand-write these classes; `violet-*`/`pink-*` classes may not appear outside that file (the guard enforces it). Do not use a row of organ hues to decorate unrelated items (e.g. table counts).

| Board | Light hex | Dark hex | Hue |
|---|---|---|---|
| Thoracic | `#0284C7` | `#38BDF8` | sky |
| Neuro | `#7C3AED` | `#A78BFA` | violet |
| Breast | `#DB2777` | `#F472B6` | pink |
| GI | `#D97706` | `#FBBF24` | amber |
| Heme | `#059669` | `#34D399` | emerald |
| Multi-Organ / All | `#1D4ED8` | `#38BDF8` | cobalt / sky |

Token fields and their one job each: `swatchClass` (marker square, progress bar), `textClass` (board name text), `softBgClass` + `borderClass` (active segmented/tab highlight), `hoverBorderClass` (card hover), `activeSurfaceClass`, `topRuleClass` (hairline bar atop a board-scoped card/modal). `getOrganBoardHex(board, isDark)` feeds Recharts/canvas only.

**Expression of organ colour (the only allowed ways):** 8 px swatch square; 2 px top rule on a card; active tab/segment tint; board-name text; chart series. **Not allowed:** coloured card backgrounds, thick left-edge bars, filled colour badges.

Adding/changing a board = edit `types.ts` + `organPalette.ts` together, keeping each board's hex unique and its classes light/dark paired.

### 3.6 Chart palette (Recharts; hex because SVG attrs can't take classes)
Computed in-component from `theme`: grid `#1E293B`/`#E2E8F0`; axis text `#94A3B8`/`#475569`; cases `#38BDF8`/`#1D4ED8`; consensus `#34D399`/`#059669`; sessions line `#FBBF24`/`#D97706`; SLA line + breach `#FB7185`/`#DC2626`; SLA nominal `#38BDF8`/`#0284C7`; muted bar `#334155`/`#CBD5E1`; cursor fill `rgba(56,189,248,.08)`/`rgba(29,78,216,.06)`. Organ series use `getOrganBoardHex`.

### 3.7 DICOM reading-room surfaces (always dark, even in Clinical Light)
Frame `bg-[#05070B] border border-slate-800`; toolbars/slider bars `bg-[#090D16] border-slate-800`. Canvas overlays: target lesion `#38BDF8`, non-target `#F59E0B`, in-progress measurement `#22C55E` / text `#4ADE80`. HUD text is mono, 11–12 px, slate/sky.

---

## 4. Typography

| Family | Role | Loaded weights | Applied via |
|---|---|---|---|
| **Plus Jakarta Sans** | Display — all `h1–h4`, brand, card/section titles | 500 / 600 / 700 | automatic on `h1–h4`; `font-display` elsewhere (also `text-wrap: balance`) |
| **Public Sans** | Body/UI (default on `html`) | 400 / 500 / 600 | default |
| **JetBrains Mono** | All data: MRN, TNM, stage, gene/variant, HU, mm, counts, times, KPI numerals, `kbd`, DICOM HUD | 400 / 500 / 600 | `font-mono` (+ `tabular-nums` for changing/aligned numbers) |

**Scale (this is the complete list):**

| Class | Px | Used for |
|---|---|---|
| `text-[10px]` | 10 | `kbd` glyph chips only |
| `text-[11px]` | 11 | secondary table line, captions, palette category/hints, toast description, disclaimers |
| `text-xs` | 12 | **default UI size**: labels, buttons, inputs, table cells, nav meta, helper text |
| `text-sm` | 14 | nav items, section titles (`font-display text-sm font-semibold`), narrative body, empty-state title |
| `text-base` | 16 | page/card titles (`font-display text-base font-semibold`), brand |
| `text-lg` / `sm:text-lg` / `sm:text-xl` / `sm:text-2xl` | 18–24 | top-of-view titles (with `font-display font-bold`) |
| `text-2xl font-mono font-semibold` | 24 | KPI numerals |

Nothing above `text-2xl`. The only arbitrary px sizes allowed are `text-[10px]` and `text-[11px]`.

**Weights:** 400 body · `font-medium` (500) labels/nav/buttons · `font-semibold` (600) headings/values/primary buttons · `font-bold` (700) **only together with `font-display`** (view titles, brand). Never thin/light/extrabold/black (not loaded).
**Leading/tracking:** `leading-relaxed` for paragraphs, `leading-snug|tight` for titles, `tracking-tight` only on large display titles.
**Case:** Sentence/Title Case. **No `uppercase`, no letter-spaced eyebrow labels, no small-caps.** Group labels are `text-xs font-medium text-slate-500 dark:text-slate-400`.
**Truncation:** `min-w-0` on flex children + `truncate`/`line-clamp-1`; add `title=` when truncating data.

---

## 5. Layout, spacing, shape

**App shell:** `min-h-screen flex` → Sidebar (`hidden lg:block w-[248px] shrink-0 h-screen sticky top-0`) + column (`flex-1 flex flex-col min-w-0`) → TopBar (`sticky top-0 z-30 h-16 px-4 sm:px-6`, `bg-panel/95 backdrop-blur border-b`) → `<main class="flex-1 min-w-0">` wrapped in `PageTransition`.
**Mobile drawer:** `w-[264px] max-w-[85vw]`, slides from `x:-272` with `CLINICAL_SPRING`; trigger shown `lg:hidden`.
**Page container:** `p-4 sm:p-6 max-w-[1440px] mx-auto space-y-6`.
**Grids:** dossier/detail `grid grid-cols-1 lg:grid-cols-12 gap-5` with `lg:col-span-8` / `lg:col-span-4` (`xl:` for compact DICOM); card groups `grid-cols-1 md:grid-cols-3 gap-4`.
**Breakpoints used:** `sm` (page padding, labels appear) · `md` (strip → row, 3-col) · `lg` (sidebar, 12-col) · `xl` (toolbars go single row). Must work at 390×844.

**Spacing (4 px grid; these are the real working values):**
- Controls: `px-3 py-2` (inputs/selects) · buttons `px-4 py-2` (global primary), `px-3.5 py-2`, `px-3 py-1.5`, `px-2.5 py-1.5` (compact).
- Cards: `p-5` default · `p-4 sm:p-5` strips · `p-3.5` inner tiles · modal header `px-6 py-4`, body `p-6`.
- Gaps: `gap-1`/`gap-1.5` tight inline · `gap-2`/`gap-2.5` icon+label & control groups · `gap-3`/`gap-4`/`gap-5` layout.
- Vertical rhythm: page `space-y-6` · inside cards `space-y-2.5/3/4`.

**Radius (complete list):** `rounded-xs` 2 px swatches/markers · `rounded` 4 px segmented items, chips, icon buttons · `rounded-md` 6 px buttons, inputs, nav items, inner tiles, alerts · `rounded-lg` 8 px cards, sections, modals, toasts, palette, DICOM frame · `rounded-full` **only** connection dots and progress tracks. Nothing larger than `lg`. No pill badges.
**Borders:** 1 px hairlines. Accent hairline = `h-0.5` top rule (`h-1` on modals). **No `border-l-*` accent bars.**
**Elevation:** none on cards. `shadow-xs` selected segment pill · `shadow-sm` chart tooltip · `shadow-lg` toast · `shadow-2xl` modals/palette/drawer. No coloured shadows, no `ring-*`.
**Z-index:** `z-10` content above `SlidingHighlight` · `z-30` TopBar · `z-50` modals/palette/drawer · `z-[60]` toast stack.

---

## 6. Iconography
- `lucide-react` only. Decorative icons get `aria-hidden="true"`; icon-only buttons get `aria-label`.
- Sizes: `h-3.5 w-3.5` default inside controls/labels · `h-4 w-4` nav, primary buttons, topbar, search · `h-5 w-5` menu/close in modal & drawer · `h-8 w-8 rounded-md` tile for brand/avatar (icon `h-4 w-4`).
- Colour: inherits text; affordance chevrons `text-slate-400`; Sun `text-amber-400`, Moon `text-slate-600`.
- Keyboard glyph text (⌘ ↑ ↓ ↵) is allowed in `kbd`/hints. **No emoji anywhere.**
- Existing mapping to reuse: Case Registry `ClipboardList`, Analytics `BarChart3`, Schedule `CalendarClock`, Live Room `Radio`, Audit `Database`, Search `Search`, Close `X`, Delete `Trash2`, Success `CheckCircle2`, Info `Info`, Warning `AlertTriangle`, Next `ChevronRight`/`ArrowRight`, Export `Download`, AI `Sparkles`, Add `Plus`, Theme `Sun`/`Moon`.

---

## 7. Motion (`motion/react`)

Root: `<MotionConfig reducedMotion="user">` in `App.tsx` — never remove. **Animate only `transform` and `opacity`** (plus `layoutId` glides and `scaleX` progress). Never animate width/height/top/left/margin/colour-with-keyframes.

**Constants (import from `MotionPrimitives`, never redefine):**
`CLINICAL_SPRING` {spring, 460 / 36 / 0.75} · `GLIDE_SPRING` {spring, 520 / 38 / 0.7} · `VIEW_TRANSITION` {0.2 s, ease [0.16,1,0.3,1]}.

| Interaction | Spec |
|---|---|
| View / tab-content change | `AnimatePresence mode="wait" initial={false}`; in `{opacity:0,y:6}` → `{1,0}`; out `{0,y:-4}` (dossier tabs 5 / -3); `VIEW_TRANSITION`. Use `PageTransition`. |
| Segmented/tab/nav active indicator | `<SlidingHighlight layoutId="…"/>` — **unique `layoutId` per group**; prefix when a group renders twice (`desktop-`/`mobile-`). Existing: `sidebar workspace/organ`, `dashboard-organ-tab`, `analytics-timeframe`, `analytics-organ-scope`, `analytics-turnaround-mode`, `analytics-trend-mode`, `dossier-subtab`, `auth-mode-tab`, `dicom-tool-*`, `live-stage-tab`. |
| Press | `whileTap` scale **0.97** default · 0.96 small/inline · 0.985 full-width/list rows · 0.98 brand/cards |
| Hover lift | `whileHover={{y:-2}}` on session cards · `y:-1` on CTA. Nothing else lifts. |
| Table rows | enter `{opacity:0,y:4}`→`{1,0}`, 0.16 s, delay `min(idx*0.025, 0.15)` |
| Chevron/arrow nudge | `group` + `group-hover:translate-x-0.5 transition-transform duration-150` |
| Theme icon swap | rotate ±45°, scale 0.7→1, opacity, 0.16 s, `AnimatePresence mode="wait"` |
| Modal | scrim fade 0.16 s; panel `{opacity:0,scale:.96,y:10}`→`{1,1,0}`, `CLINICAL_SPRING`; exit `{0,.97,6}`. Use `SpringModal`. |
| Command palette | scrim 0.14 s; panel from `y:-8`, `CLINICAL_SPRING` |
| Toast | in `{0,y:18,scale:.96}`; out `{0,x:24,scale:.96}`; `CLINICAL_SPRING`; progress bar `scaleX 1→0` linear over `durationMs` |
| KPI numbers | `<AnimatedNumber/>` (380 ms cubic ease-out, `tabular-nums`, honours reduced motion) |
| Hover colour | `transition-colors` (default); transforms get `duration-150` |

**Forbidden:** `transition-all`, durations ≥ 300 ms (except `AnimatedNumber`), `animate-bounce|ping|spin`, parallax, looping decorative animation, spinners (loading = skeleton `animate-pulse` or a busy label like "Thinking...").
**DICOM rule:** no `motion.*`/CSS transition on or around the `<canvas>` or its pointer handlers.

---

## 8. Component recipes (copy verbatim, then fill content)

### 8.1 Card / section
`<section aria-label="…" className="rounded-lg bg-panel border border-hairline p-5 space-y-4">` (`overflow-hidden` when it holds a table or top rule).
Title: `font-display text-sm font-semibold text-ink`; subtitle `text-xs text-slate-500 dark:text-slate-400`.
Board-scoped top rule (first child): `<div className={`h-0.5 w-full ${token.topRuleClass}`} aria-hidden="true" />`.

### 8.2 KPI strip
Wrapper: `grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-hairline rounded-lg bg-panel border border-hairline` · cell `p-4 sm:p-5` · label `text-xs font-medium text-slate-500 dark:text-slate-400` (optional `h-2 w-2 rounded-xs` swatch before it) · value `mt-1.5 text-2xl font-mono font-semibold` with `<AnimatedNumber/>` · caption `mt-1 text-xs text-slate-500 dark:text-slate-400`.

### 8.3 Segmented control (filter/toggle)
Track `role="tablist" aria-label="…"` `flex items-center gap-1 p-1 rounded-md bg-slate-100 dark:bg-slate-900 overflow-x-auto`.
Item `role="tab" aria-selected` `relative inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors whitespace-nowrap shrink-0`; active `text-ink`, inactive `text-ink-muted hover:text-slate-900 dark:hover:text-slate-200`.
Highlight `<SlidingHighlight layoutId="…" className="bg-white dark:bg-slate-800 shadow-xs" />`; item contents `relative z-10`; organ swatch `h-2 w-2 rounded-xs` before label.
**Organ-tinted tab row** (dossier): no track, `border-t … pt-3`, item `px-3.5 py-2 rounded-md`, active text `token.textClass`, highlight `${token.softBgClass} border ${token.borderClass} rounded-md`, inactive hover `hover:bg-slate-100/70 dark:hover:bg-slate-800/50`.

### 8.4 Sidebar navigation
Row `relative w-full flex items-center justify-between px-3 py-2.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap`; active `text-blue-800 dark:text-sky-300` + `SlidingHighlight` `bg-blue-50 dark:bg-sky-500/12 border border-blue-200/70 dark:border-sky-500/25 rounded-md`; inactive `text-slate-700 dark:text-slate-300 hover:bg-slate-100/80 dark:hover:bg-slate-800/60`. Meta count `font-mono text-xs tabular-nums` (`Live` = emerald semibold). Group label `px-2.5 pb-1 text-xs font-medium text-slate-500 dark:text-slate-400`. Organ rows: `px-3 py-2 text-sm`, swatch `h-2 w-2 rounded-xs`, label "`<Board>` Oncology".

### 8.5 Buttons (always `type="button"`/`"submit"`; interactive ones are `motion.button` with `whileTap`)
| Variant | Classes | Use |
|---|---|---|
| **Primary-Blue** | `inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-blue-700 hover:bg-blue-800 dark:bg-sky-500 dark:hover:bg-sky-400 text-white dark:text-slate-950 text-xs font-semibold transition-colors whitespace-nowrap disabled:opacity-50` | Global "New Patient Case", modal submit, empty-state create, "Save to Chart" |
| **Primary-Ink** | same but `bg-slate-900 hover:bg-slate-800` in light (dark identical to Primary-Blue) | In-page CTA: "Enter Live Board Room", "Ask" |
| **Positive** | `rounded-md bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold disabled:opacity-50` | Sign-off / ratify consensus / populate sign-off |
| **Secondary** | `inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap` | Export, Reset, Discard, theme switch |
| **Row action** | Secondary at `px-2.5 py-1.5` + `hover:border-blue-600 hover:text-blue-700 dark:hover:border-sky-400 dark:hover:text-sky-300` + trailing `ChevronRight h-3.5 w-3.5 text-slate-400` nudge | "Open Dossier" |
| **Text link** | `inline-flex items-center gap-1 text-slate-600 dark:text-slate-300 hover:text-blue-700 dark:hover:text-sky-400 font-medium transition-colors` | "Registry" back-link |
| **Icon** | `p-1.5 rounded text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 transition-colors` + `aria-label` (close `X h-5 w-5`, in palette/toast `h-4`/`h-3.5`) | Close, dismiss |
| **Destructive icon** | `p-1 rounded text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors` + `Trash2 h-3.5 w-3.5` + `aria-label="Delete …"` | Delete measurement |

**Exactly one filled Primary per surface** (view, modal, card). Busy state: change the label ("Thinking...", "Saving...") + `disabled:opacity-50`.

### 8.6 Form controls
- Label: `<label htmlFor>` `block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1` (required → trailing ` *`) or `sr-only` when a visible label would be redundant. **Every control has a label.**
- Input/select/textarea: `w-full px-3 py-2 rounded-md text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-ink placeholder:text-slate-400` + `transition-colors`. Focus is global (§10) — **do not add per-field focus classes.** IDs/numerics add `font-mono` (+`tabular-nums`).
- Native `<select>` only (styled as above). No custom dropdown/combobox libs.
- Search: wrapper `relative`, icon `absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none`, input `type="search"` `pl-9`.
- Form layout: `<form className="p-6 space-y-4">`, rows `grid grid-cols-1 sm:grid-cols-N gap-3`; error alert (§3.4) as first child.
- Validation copy: one specific sentence ("Patient age must be a valid number between 1 and 120.").

### 8.7 Data table (inside a card)
Toolbar `p-4 border-b border-hairline flex flex-col xl:flex-row xl:items-center justify-between gap-3` → segmented control left, search + selects right.
`<div className="overflow-x-auto"><table className="w-full text-left border-collapse">`; head row `border-b border-hairline bg-slate-50/70 dark:bg-slate-900/50 text-xs font-medium text-slate-500 dark:text-slate-400`, `th py-3 px-3 whitespace-nowrap`; body `divide-y divide-hairline text-xs`; row `group hover:bg-slate-50/90 dark:hover:bg-slate-800/45 transition-colors` (animated per §7); `td py-3 px-3 align-top`; action column `text-right`.
Cell pattern: line 1 `font-mono text-xs font-semibold tabular-nums text-ink` (or `text-slate-900` regular); line 2 `text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate`. Board swatch precedes the MRN. Status/urgency = semantic text (§3.4).
**Loading:** 4 skeleton rows `animate-pulse`, bars `h-4 w-N bg-slate-200 dark:bg-slate-800 rounded`. **Empty:** `py-12 px-6 text-center` → title `text-sm font-medium` + helper `mt-1 text-xs text-slate-500 dark:text-slate-400` + Secondary "Reset Filters" + Primary create.

### 8.8 Modal — `SpringModal` only
`<SpringModal open onClose labelledBy="…-title" maxWidthClass="max-w-2xl">`. Optional organ top rule `h-1 w-full ${token.topRuleClass}`. Header `flex items-center justify-between px-6 py-4 border-b border-hairline`: title `h2#id font-display text-base font-semibold` (optional `h-2.5 w-2.5 rounded-xs` swatch), subtitle `text-xs text-slate-500 dark:text-slate-400 mt-0.5`, close `Icon` button. Body `p-6 space-y-4`. Esc and backdrop-click close (built in). Never hand-roll another modal.

### 8.9 Command palette
`CommandPalette` is the only palette. New navigable things are added through `lib/commandSearch.ts` (`buildCommandItems`). Panel `max-w-2xl rounded-lg … shadow-2xl`, opens at `pt-[12vh]`, category label `px-4 py-1.5 text-[11px] font-medium text-slate-500`, row `px-4 py-2.5`, selected `bg-slate-100 dark:bg-slate-800/80`, footer hint row mono `text-[11px]`. Keys: ⌘/Ctrl+K toggle, ↑ ↓ Enter Esc.

### 8.10 Toast — `useToast().pushToast({ title, description?, variant?, organBoard?, durationMs? })`
Stack fixed `bottom-4 right-4 z-[60] max-w-sm`, max 3 visible, `aria-live="polite"`, default 4.2 s (2.6 s for non-mutating info like theme). Variants: `success` (default, `CheckCircle2` emerald), `info` (`Info` sky), `warning` (`AlertTriangle` amber). Pass `organBoard` for board-scoped events (swatch + progress bar take its colour).
**Every successful clinical mutation fires a toast**: case registered, RECIST saved/deleted, vote cast, consensus signed off, DICOM slice broadcast, session scheduled/launched, CSV exported / report copied, clinician switched, theme toggled.
Copy: title = what happened, past tense/state ("Registered ONC-2026-4290"); description = one short sentence.

### 8.11 Empty / loading / error
Loading → skeleton (§8.7), never a spinner or blocking overlay. Empty → centred message + next action. Error → rose alert (§3.4), `role="alert"`; boot failure = centred card `max-w-xl` with `border-rose-300 dark:border-rose-800` and `font-display text-base font-semibold text-rose-700 dark:text-rose-400`.

### 8.12 Charts (Recharts)
Card per §8.1 with header (title `font-display text-base font-semibold`, subtitle `text-xs`, optional segmented toggle with its own `layoutId`). `ResponsiveContainer width="100%" height="100%"`, `CartesianGrid strokeDasharray="3 3" vertical={false}`, colours from §3.6, tooltip = `ClinicalChartTooltip` (`rounded-md bg-white dark:bg-[#0B1120] border border-slate-200 dark:border-slate-700 px-3 py-2.5 shadow-sm text-xs`, `rounded-xs` swatch, values `font-mono font-semibold tabular-nums`), SLA = dashed rose `ReferenceLine`, legend swatches `rounded-xs`. Pass `theme`; never read the DOM class.

### 8.13 DICOM Studio
Toolbar = segmented tool rail (`SlidingHighlight`, id `dicom-tool-*`) + secondary buttons; AI action is Primary-Blue with `Sparkles`. Viewport per §3.7; HUD overlay mono; slice slider bar `bg-[#090D16]`; side column = cards (RECIST summary, "Save Calibrated Measurement" form, "Saved Lesion Measurements" list with destructive icon). RECIST/measurement numbers `font-mono tabular-nums`. Canvas: §7 DICOM rule.

### 8.14 AI output panels
Always labelled ("AI Decision Support", "AI-Drafted …") and always end with the disclaimer line (amber `text-[11px]`). Copilot bubbles: user `p-3 rounded-md text-xs leading-relaxed bg-slate-100 dark:bg-slate-800/80 ml-8`; assistant `… bg-slate-50 dark:bg-slate-900/60 border border-hairline mr-8`; speaker label `text-[11px] font-semibold text-slate-500 dark:text-slate-400`. Preset prompts = compact secondary chips (`px-2.5 py-1.5 rounded border … text-xs`). AI never auto-commits clinical decisions; the human clicks Positive/Primary.

### 8.15 Misc atoms
- `kbd`: `font-mono text-[10px] px-1.5 py-0.5 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-300`.
- Marker swatch: `h-2 w-2 rounded-xs shrink-0 ${token.swatchClass}` + `aria-hidden` (`h-2.5 w-2.5` in TopBar/modal header).
- Progress track: `h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden`.
- Brand tile: `h-8 w-8 rounded-md bg-blue-700 dark:bg-sky-500/15 text-white dark:text-sky-400` + `Activity` icon.

---

## 9. Content & voice
- **British clinical spelling**: "Tumour", "Oncology". Sentence-case helper text; Title Case for buttons/tabs/headings.
- **Canonical names:** Case Registry · Clinical Analytics · Board Schedule · Live Board Room · Audit & Database · Patient Dossier · Clinical Workspaces · Organ Tumour Boards · New Patient Case · Clinical Light · Dark Radiology · Consensus Reached. Boards read "<Organ> Oncology" in nav/filters and "<Organ> Board" in labels.
- Buttons are verb-first ("Open Dossier", "Enter Live Board Room", "Save to Chart", "Export EHR Report"). No exclamation marks, no emoji, no marketing tone.
- Clinical data formats stay as in the app: `ONC-2026-4102`, `AJCC T2b N2 M0 (Stage IIIA) · ECOG 1`, `EGFR p.Leu858Arg`, `PD-L1 65% TPS`, `24.5 mm · -103 HU`.

---

## 10. Accessibility (non-negotiable)
Landmarks (`header`, `aside`, `nav aria-label`, `main`, `section aria-label`) · tabs use `tablist/tab/aria-selected` · dialogs `role="dialog" aria-modal aria-labelledby` · toasts `aria-live="polite"` · icon-only buttons `aria-label` · decorative `aria-hidden` · every input labelled · colour never the only signal · text colours `-700` on light / `-400` on dark (≥ 4.5:1) · Esc closes overlays · ⌘/Ctrl+K global · `reducedMotion="user"` · `no-print` on chrome.
**Keyboard focus is global and automatic — `index.css` owns it; never re-implement it per element and never remove it (`outline-none` on a button is forbidden):**
- Buttons, links, tabs, `summary`, range/checkbox/radio: `:focus-visible` → 2 px `--accent-clinical` outline (blue-700 light / sky-400 dark), 2 px offset (tabs: inset `-2px` because tab rows clip overflow).
- Text inputs, selects, textareas: `:focus` → no outline, border becomes `--accent-clinical`.
- The only exception: the borderless, auto-focused search field inside `CommandPalette` (it is the sole field in its dialog and shows a caret).
- Any new focusable element type (e.g. `tabindex`, `role="button"`) must be added to the selector list in `index.css` in the same change.

## 11. Responsive
Mobile-first utilities; verify 390×844, tablet 768, desktop 1440. Tables scroll inside `overflow-x-auto`; tab/segment rows `overflow-x-auto` with `shrink-0` items; secondary text labels use `hidden sm:inline`; sidebar becomes drawer below `lg`.

## 12. Printing
Chrome (`TopBar`, `Sidebar`, toasts) carries `no-print` (`@media print { .no-print { display:none !important } }`). Keep this on any new chrome.

## 13. Change protocol (how this file may change)
1. Only the project owner can approve a design-system change, in chat, explicitly.
2. Edit **this file first**, then the code (`organPalette.ts`, `MotionPrimitives.tsx`, `index.css`) — all in the same change.
3. No exceptions "just this once". A one-off is a design-system change.

## 14. Notes (deliberate; do not "fix")
1. Tailwind v4 prefers `outline-hidden` over `outline-none` for forced-colours; the codebase (and `index.css`) uses `outline: none` on text fields — stay consistent until the owner decides.
2. Bare `rounded` (4 px) is a v4 backward-compat alias; keep using it for the "chip/segment" radius.
3. Semantic status colours deliberately reuse the sky/amber/emerald hues that Thoracic/GI/Heme also use. Organ identity is always shown as swatch + board name together; never rely on hue alone.
4. The v1.0 legacy gaps (inconsistent focus rings, unused CSS variables, organ hues reused on KPI/Audit counters, one-off `text-[13px]`) were fixed in v1.1; do not reintroduce them.

## 15. Pre-deploy self-check (run it in your head before every deploy; mention only deviations)
- [ ] Read this file in full; every new element is a §8 recipe or a composition of them
- [ ] Only tokens from §3–§5 (colour families, text scale, radius, shadow, z-index)
- [ ] Light **and** Dark Radiology pairs on every coloured utility
- [ ] Organ colours via `organPalette`; chart colours via §3.6
- [ ] Motion per §7 (constants imported, transform/opacity only, unique `layoutId`, DICOM canvas untouched)
- [ ] Icons: lucide only, labelled/aria-hidden correctly; no emoji
- [ ] Focus visible, labels present, keyboard path works, reduced motion respected
- [ ] Copy follows §9; mutations fire a toast (§8.10); AI output has label + disclaimer
- [ ] `npm run build` passes
- [ ] Smoke-checked the changed screens in both themes and at 390×844 (or state what was not checked)
