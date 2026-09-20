# V.0 intake — the "Gallery" redesign handoff, 2026-09-20

**Received:** `Deck page redesign project.zip` from Claude Design, 42 files, 588 KB, extracted
untouched into `design_handoff_crankmagic_gallery/`. Read in full: `README.md` (the brief and the
extrapolation rules), `github.md` (which repo modules each screen was built from), the design
system (`design-system/readme.md`, four token files, seven specimen cards), five hi-fi screens
(Decks, Deck page, Library, Explore entry, Explore graph), the lo-fi wireframes for nine more
pages and three Play lobby layouts, and the aether port.

**Direction:** "Gallery". Dark by default ("Brass & Slate"), light as `[data-theme="light"]`
("Felt & Cream"). Young Serif display over Satoshi body. Header bar gone; a 216 px left rail with
the wordmark and its aether mist. Commander art as the hero; each deck tinted by its commander's
first colour; one status hue per rung; one primary per view. Information architecture unchanged.

## What the handoff answers of the intake's six questions

| Question | Answer in the handoff |
|---|---|
| Light and dark? | Both, dark default, one token set with two values |
| The wordmark's aether | Kept, ported (`screens/aether.js`), moved behind the rail wordmark, blue reserved for it |
| One palette for workshop and Online? | One. Play has its own chosen direction (2b, table-first, colour-identity fans) on the same tokens |
| Phone | Rail becomes a top row under 760 px; deck page gets a sticky bottom action bar; bento cards span full width |
| Card art | Specified per surface: 3:4 poster tiles with a cropped hero, tilted physical card on the deck page, square thumbnail on Explore, fanned crops on the entry doors |
| Status colours | Six rungs: inbox, pull, ordered, buy, standin, remove; the eleven status words stay, the colours collapse to these |

## Gaps and conflicts, for the designer and for Rob

1. **Young Serif is loaded from Google Fonts.** The app's CSP is `font-src 'self' data:` and
   `style-src 'self' 'unsafe-inline'`; the `@import` will be blocked. The font is OFL, so V.1
   self-hosts it under `assets/crankmagic/` beside Satoshi. No design change; a note for the
   designer that the `fonts.css` import is not the shipping form.
2. **"Header bar removed" contradicts the geometry pass.** `tests/uat/geometry.mjs` asserts the
   wordmark, subline and header buttons exist and do not overlap at six widths. V.3 rewrites
   those checks for the rail (wordmark inside the rail, nav rows not overlapping, the phone top
   row) rather than deleting them.
3. **Three of the handoff's rules are functional, not visual,** and get their own steps with
   tests rather than riding in a restyle: sortable headers on every table; the Sheet as a true
   spreadsheet (editable cells, Enter/Tab/Escape, arrow keys); quick-look tables linking to
   their owner page. They are added to Track V as V.4x items and sized separately.
4. **"Panels grow with their rows; no inner scrollbars"** conflicts with the Library's paging
   (60 / 120 / All) only in wording; paging stays as the cap, as the handoff itself says.
5. **The page budgets** (`tests/page-budget.mjs`: words, controls and explainer text before the
   first table) were measured on the current layout. The Gallery heads are lighter (one h1, one
   sentence, at most three buttons and More), so they should pass; if a budget moves it moves in
   the diff, not by skipping.
6. **Not drawn** (the README says to extrapolate by its twelve rules): the Lab, Discover's List
   and Trace panes in full, the Tabletop view, User Functions, Tour, Share, import/export
   dialogs, phone layouts of the wireframed pages. The rules are specific enough to apply;
   renders go back to the designer for each.
7. **A land icon is missing** (the design uses a placeholder disc). Ask the designer for one, or
   V.2 draws a simple mark in the mana set's style.
8. **Deck names drop the D-number prefix in headings** with the number as an eyebrow. The
   Live Load names decks "D6 Krenko Goblins"; V.4 splits the prefix at render time and does
   not change the data.
9. **Play direction 2b** (table-first, four quadrants, in-game full-window surface, right panel
   as an overlay) is a larger change to `crankmagic-game.js` and `game/ui/review.*` than a
   restyle. It is V.5, after the workshop, and sits beside the Online tracks (C.6, E.4).

## Mapping onto the code (what each V step touches)

| Step | Handoff source | Repo files |
|---|---|---|
| V.1 tokens | `design-system/tokens/*.css` | `crankmagic-design.css` (the `#matrix-v2` block becomes the Gallery tokens: colors with `[data-theme]`, typography, shape, spacing, motion), Young Serif self-hosted in `assets/crankmagic/`, the theme remembered in preferences; then every hex in `crankmagic.css` mapped to a token, page by page, with the token audit test |
| V.2 components | `guidelines/*.html`, README "Shape", "Motion", extrapolation rules 2–5, 9, 10 | `crankmagic-app.js` helpers (`pageHead`, `button`, `pill`, `note`, `field`, `select`, `form`, `modal`, `readinessBar`), the `v-` layer, count tiles, segmented tabs, chips, empty states |
| V.3 shell | README "Shell", `screens/aether.js` | `index.html`, `crankmagic.html`, `crankmagic-brand.js`, the rail CSS, the phone top row, `Menu ▾` for Share / Feedback / User Functions; geometry checks rewritten |
| V.4 surfaces | `screens/Gallery Decks`, `Gallery Deck Page`, `Gallery Library`, `Gallery Explore Entry`, `Gallery Explore`; wireframes 1a–1i, 3a–3d, 4a–4f | `crankmagic-decks.js`, `crankmagic-collection.js`, `crankmagic-discover.js`, `crankmagic-pull.js`, `crankmagic-change-ui.js`, `crankmagic-orders.js`, `crankmagic-lab.js`, dialogs |
| V.4x behaviour | README "Interactions & state" | sortable headers, spreadsheet Sheet, quick-look links: each with a Node test |
| V.5 Play | wireframes 2a–2e, `table-sea.js` | `crankmagic-game.js`, `crankmagic-lobby.js` (any new arithmetic), `game/ui/*` |

## Order of work

V.1 first, because every later step reads the tokens, and because the token audit is the check
that stops the page layer drifting back to raw hex. Then V.2 and V.3 together (the components
and the shell are what every surface is built from), then V.4 in the order Rob reads the app:
Decks home → deck page → Library → Explore → the wireframed pages → dialogs. V.4x rides with
the surface it belongs to. V.5 last.

Every step: a red-first test where there is logic, the geometry and budget suites green, and
`node tools/render-routes.mjs` before and after, side by side, in chat.

## Baseline

Rendered on 2026-09-20 from `main` at `2005987` with `tools/render-routes.mjs` (twelve routes at
390, 1136 and 1400 px, 36 pictures) into this session's scratch folder; not committed. Regenerate
with the tool at any commit to compare against.
