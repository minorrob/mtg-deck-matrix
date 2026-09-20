# CrankMagic — design intake: how the Claude Design handoff lands

**Date:** 2026-09-20
**Why:** Rob is not happy with the build's visual aesthetics and has a new design coming from
Claude Design (wireframes and handoff materials). This is the receiving end: what the app's
visual layer is today, what the handoff needs to contain to be applied, where it lands, how it
maps onto the code, and the track that carries the work. It also answers the question asked with
it: there was no design-focused step in the queue; there is now (§6, Track V).

---

## 1. The visual layer as it stands

Two stylesheets and a shell, measured on `main` at `2005987`:

| Layer | What it is | Size |
|---|---|---|
| `crankmagic-design.css` | The approved token and component layer: nine tokens on `#matrix-v2` (`--v-bg`, `--v-panel`, `--v-ink`, `--v-muted`, `--v-line`, `--v-accent`, `--v-on`, `--v-soft`, `--v-warm`, each `light-dark()`), Satoshi at 400/500/700, and the `v-` components (`v-button`, `v-panel`, `v-dialog`, `v-field`, `v-data-table`, `v-nav`, `v-brand`, `v-row-menu`, `v-cover`, ...) | 288 lines, 44 KB |
| `crankmagic.css` | Everything page-specific, by feature prefix: `cm-tt` (table view, 307 rules), `cm-lobby` (142), `cm-table`, `cm-facet`, `cm-card`, `cm-deck`, `cm-sheet`, `cm-change`, `cm-list`, `cm-trace`, `cm-how`, `cm-stage`, `cm-graph`, `cm-pull`... | 2,113 lines, 211 KB |
| `index.html` / `crankmagic.html` | The shell: header (`v-top`: logo, wordmark with the aether canvas from `crankmagic-brand.js`, subline, Tour / Share / Feedback / User Functions), sidebar (`cm-sidebar`: nav in a sticky track, then the library note), `#cm-main`, legal footer | |
| `game/ui/*.css` | CrankMagic Online's own pages (guest lobby, host setup, review table, playmats), a separate palette | |

**The number that matters:** `crankmagic.css` carries **852 hex colors, 381 distinct**, against
**163 uses of the design tokens** and 14 of its own `--cm-` variables. The page layer does not draw
from the token layer; it draws in its own colors. That is why the build looks assembled rather
than designed, and it is the first thing a redesign has to change: the handoff's palette must
become tokens, and the page layer must read them.

Everything a page shows is built as a template string in a feature file through a small
component API in `crankmagic-app.js`: `pageHead(name, controls, help)`, `button(label, action,
data, primary, {caret, cls})`, `pill(text, kind)`, `note(text, warn)`, `field`, `select`, `form`,
`modal`, `readinessBar(r)`, `colors(ci)`, `mana(cost)`. A redesign that respects that API changes
what those helpers emit and the CSS, and most pages follow without a rewrite. A redesign that
needs new primitives (a card, a stat tile, a segmented control, a drawer) adds them to that API
first, so no page invents its own.

## 2. What the handoff needs to contain

For each of these, the app has a place to put it and a check that holds it:

| Handoff item | Where it lands | What holds it |
|---|---|---|
| **Tokens**: color (light and dark), type scale, spacing, radii, elevation, motion | `crankmagic-design.css` `#matrix-v2` block, one `--v-*` (or renamed `--cm-*`) per token; dark and light through `light-dark()` as today | a token audit check: no new hex in `crankmagic.css` outside the token block (§5) |
| **Components** with states: buttons (primary, secondary, quiet, danger, compact), pills and status chips, cards and tiles, panels, tables and rows, dialogs, forms and fields, the notice, menus, tabs, the readiness bar, empty states | the `v-` component layer plus the helpers in `crankmagic-app.js` | `tests/browser-geometry.mjs` (tap targets, row heights, no sideways scroll, dialogs), `tests/page-budget.mjs` |
| **The shell**: header, wordmark treatment (keep, restyle or drop the aether animation), sidebar, footer, phone layout | `index.html`, `crankmagic.html`, the `v-top` / `cm-sidebar` rules | geometry at 320, 375, 390, 430, 768, 1400 |
| **Wireframes per surface**, at desktop and phone: Decks home, the deck page (its five tabs), the Library (list, sheet, table views, To buy), the Lab, Explore, Play lobby, the pull sheet, Make the change, dialogs (card, compare, help, tour) | `docs/design/2026-09-xx/` as the files Claude Design produces (HTML previews, images, or both), one file per surface, named for the route | `tools/render-routes.mjs` (§4) renders the same routes from the live library for side-by-side review |
| **Copy rules** the design assumes: label lengths, number formats, one name per concept (Explore, not Discover / Trace) | `docs/glossary.md` and the page budgets | `tests/page-budget.mjs` word and control counts |
| **What does not change**: the data model, the routes, the actions, the command names, the component API's contract | | the 96 suites |

Missing pieces are not blockers; they are questions back to the designer, listed in the intake
PR rather than guessed.

## 3. How the handoff arrives

Three channels, in order of preference:

1. **Claude Design → "Send to Claude Code"** into this workspace: the design-system project
   lands as files; `/design-sync` keeps a local component library in step with it, one component
   at a time. The `DesignSync` tool needs a one-time `/design-login` from an interactive Claude
   Code session on this machine; this session is non-interactive and could not run it. **Rob:
   run `/design-login` once, or use "Send to Claude Code Web".**
2. **Files handed over directly** (a zip or folder of HTML previews, tokens JSON or CSS, images):
   they go under `docs/design/<date>/` untouched, and the intake work reads from there.
3. **Screenshots only**: usable for wireframes, not for tokens; tokens are then read off the
   images and written down in the intake PR as a proposal for the designer to correct.

## 4. What is prepared here

- `tools/render-routes.mjs` renders every workshop route from the committed live library at
  390, 1136 and 1400 px into a folder, so any design change is reviewed as before-and-after
  images of the real pages rather than described. The first run is the baseline of the build
  Rob is unhappy with; it is kept beside the wireframes when they arrive.
- `docs/design/` is the landing folder (this document says what goes in it; nothing is there
  yet).
- The token audit (§5) is written as the check that will hold the redesign's discipline; it
  is listed as a test to add in the first design PR, not added now, because on today's
  stylesheet it would be red by 852.

## 5. The rules a redesign keeps

Everything in `AGENTS.md` and the plan's §7, and four of its own:

1. **Tokens, not hex.** After the redesign, `crankmagic.css` and `game/ui/*.css` draw colors,
   type and spacing from the token block. A test counts raw hex outside it and holds the
   count at zero (or at the small allow-list the design names, such as mana symbol colors).
2. **One component, one place.** A new primitive goes into `crankmagic-app.js`'s helpers and
   the `v-` layer before any page uses it.
3. **The budgets and the geometry stand** unless the design changes them on purpose, in the
   diff, where a reviewer sees it (`tests/page-budget.mjs` says how).
4. **Every visual change is rendered for Rob** before it is called done (Rob's rule of
   2026-09-19), with `tools/render-routes.mjs` for whole pages and a targeted script for a
   dialog or a component.

## 6. Track V — the visual redesign, in the queue

There was no design-focused step in the queue; the walkthrough's and UAT's P1/P2 findings are
flow and copy, applied one at a time. Track V is the visual redesign as one body of work, and it
absorbs every visual finding from both reviews (B-05, B-10, B-22, M-05, M-12, M-13 done, the
Discover panel width, the tile menu, the User Functions split, the help style).

| Step | Work | Proof |
|---|---|---|
| **V.0** | Intake: the handoff under `docs/design/<date>/`; the baseline renders; a gap list back to the designer (what the wireframes do not cover, what the app needs that they do not show) | this document updated; the baseline folder |
| **V.1** | Tokens: the new palette, type scale, spacing and radii as `--v-*` tokens with light and dark; `crankmagic.css` and `game/ui/*.css` converted to read them, page by page, no visual change intended yet beyond what the tokens imply | the token audit test red-then-green; renders before and after |
| **V.2** | Components: the `v-` layer and the helpers restyled to the design's states; dialogs, tables, tiles, forms, notices | geometry pass; page budgets; renders per component |
| **V.3** | The shell: header, wordmark, sidebar, footer, phone layout | geometry at six widths; renders |
| **V.4** | Surfaces, one PR each in the order Rob reads them: Decks home → deck page → Library → Lab → Explore → Play lobby → pull sheet and Make the change → dialogs | renders per surface, before and after, at 390 and 1136 |
| **V.5** | Online pages (`game/ui`) brought onto the same tokens and components | renders of the guest lobby, host setup and table |
| **V.5b (backlog)** | **The Game Host.** A host personality for the live game's announcements, in the spirit of the round announcer in the Dungeon Crawler Carl books: loud, in your face, video-game-like at the moments that call for it ("Now Player X is on their draw phase!", "Up next is Player Y!"), and pulling back once play is under way. It shapes the Up Next and Current Actions copy and the narration around play; a small punch on the announcements, not a running commentary. To be defined separately (Rob, 2026-09-20). | the copy set and its tone rules, reviewed in chat before any of it ships |

**Where it sits:** Track V starts at V.0 the moment the handoff lands and runs ahead of W.4
through W.7 for anything visual; W.4 (one number per concept) and the Online tracks (E.4, C.6)
continue beside it because they do not touch the look.

## 7. Questions for the designer, to send with the intake

1. Light and dark, or dark only? (Today's tokens carry both; most pages only ever ran dark.)
2. Does the wordmark keep its animated aether, get a still treatment, or go?
3. One palette for the workshop and the Online pages, or two deliberately?
4. Phone: the same layout compressed, or a different navigation (the sidebar becomes a top
   bar at 760 px today)?
5. Card art: how much of it, where, and at what size (tiles, the deck hero, dialogs, the
   Explore graph, the Play seats)?
6. The status vocabulary's colors: the design decides the tones for owned, ordered, to buy,
   watched, bench, reserved, draft, substitute; the app has eleven words and the UAT asked for
   fewer.
