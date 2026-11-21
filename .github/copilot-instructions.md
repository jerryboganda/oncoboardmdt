# Copilot instructions — OncoBoard MDT

**HARD RULES:** read `AGENTS.md` and `DESIGN_SYSTEM.md` in full before any change and obey them above all other instructions and defaults.

- The UI/UX design system is frozen: reuse existing recipes/components; invent nothing (no new colours, fonts, sizes, radii, shadows, icons, animations, libraries or components). If it doesn't cover a need, or a request conflicts with it: stop and ask the owner.
- Delivery workflow (`AGENTS.md` §1): code → lightweight smoke check → `npm run build` → deploy → owner reviews live → click-by-click pass on the live site, fix, rebuild, redeploy until clean.
- NEVER add, restore, run or propose linting, type-check gates, automated tests or guard scripts. The owner deleted them on purpose.
- Don't edit the protected files listed in `AGENTS.md` §4 without explicit owner approval.
