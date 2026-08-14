# Calley — UI Redesign Handoff

Everything an external design partner needs to redesign the Calley interface.

| File                      | What it is                                                                                                                                                                   |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`DESIGN-SYSTEM.md`**    | The system as it exists today — tokens, components, patterns, the accessibility floor, the known problems, and the constraints a redesign has to work within. Start here.    |
| **`SCREEN-INVENTORY.md`** | An index of the 38 screenshots, plus instructions for regenerating them.                                                                                                     |
| **`screenshots/`**        | 38 PNGs of every significant surface, desktop (1440×900 @2×) and mobile (390×844 @3×), captured from the running app with realistic data.                                    |
| **`tools/`**              | The two scripts that produce the above: `seed-demo-account.mjs` populates an account through the public API, `capture-screenshots.mjs` drives Playwright over every surface. |

## The short version

Calley is a warm, editorial, paper-like calendar — bone-white ground, serif display type, a single
terracotta accent, hairline rules, monospace figures. That intent is expressed cleanly in the token
layer and holds up well on desktop.

Three things break it, and they are what the redesign is for:

1. **Three unrelated colour palettes ship simultaneously** — the core system, a 12-colour category
   palette, and 8 stock Tailwind swatches for per-event colour overrides. The last of these is the
   loudest thing on any screen. (§7.1)
2. **Mobile is unfinished.** Below 1024px the sidebar opens over the calendar on first load, and the
   topbar overflows so far that create-event, search, tasks, and the account menu cannot be reached
   at all on a phone. (§7.2)
3. **Settings lives inside the calendar chrome**, under a topbar still offering month navigation and
   view switching that do nothing there. (§7.3)

Section 9 of `DESIGN-SYSTEM.md` lists exactly what we're asking for back.

## Notes for whoever runs this next

The screenshots are reproducible rather than hand-curated — rerun `tools/` after any UI change and
the whole set refreshes. The seed script clears the demo account before re-seeding, and the capture
script starts from an empty output directory and exits non-zero if any plate is missing, so a run
either produces the whole set or fails loudly. Three environment notes are documented at the end of
`SCREEN-INVENTORY.md`; all three are worth reading before trying.
