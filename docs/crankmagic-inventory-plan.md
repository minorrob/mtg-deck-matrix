# CrankMagic app inventory plan — wireframes of every page, and the feature register

*Written 14 September 2026 at `main` = `795f873` (PR #203 merged). For a separate session to
execute. Rob's brief, verbatim: "create a plan that will execute to create the wire frames of
every page and a list of every feature group and then feature that exists within this app …
it will be the defining and gathering of a comprehensive view of all of the elements of this
build as there are now many components and elements and I may end up rationalizing a
streamlined new variation of the app, but for now … information gathering."*

This is a gathering step, not a design step. Its output is a true, complete, navigable record
of what the app is today — every surface a reader can reach and every feature on it — with the
facts a later rationalisation needs (where a feature lives, how it is reached, what it commits,
what covers it, what else does the same job). It decides nothing. Nothing in it changes a
served file, a data file or the live library.

---

## 0. Read first, and the rules that hold

1. `README.md` (the feature paragraphs are the closest thing to a typed feature list today),
   `docs/crankmagic-architecture.md`, `docs/session-status.md` (the last section tells you
   how the two sessions share the branch and the PR flow), and the header comment of every
   file you open. The repository keeps its reasoning in module headers and its decision log
   in commit messages; write in that voice.
2. The app is `index.html` (and `crankmagic.html`, the same shell) on one hash router:
   `route()` in `crankmagic-app.js` maps `#<view>?<params>` onto `views[view]`; every feature
   module registers `views.<name>` and `actions['<key>']` through
   `(globalThis.CrankFeatures ||= []).push(function (C) { … })`. Every clickable thing in the
   app is a `data-action="<key>"` button, a `data-nav` link, a form field or a plain anchor.
   That is what makes this inventory generatable rather than typed.
3. Ground truth for screenshots and wireframes is the committed live library
   (`data/live-state.json`, Rob's six decks) restored through `loadLiveState` in
   `tests/uat/browser-runner.mjs`, plus the fresh-library state for the surfaces that differ
   without one (the Decks showcase). Scryfall is answered from the shipped catalog through
   `tests/uat/scryfall-stub.mjs`, as every walk does.
4. Rules: no redesign, no removal, no recommendation — facts only (an *overlaps* file states
   where two features answer the same question, with the evidence, and stops there). No
   served file changes, so no `?v=` cascade; if a tool needs a hook the app does not expose,
   read the DOM instead. Never edit `data/live-state.json` or `data/live-load.json`. Never run
   a browser walk while the gates are running. Generated files are regenerated, never
   hand-edited; judgement lives in one annotation file with the reason beside each entry,
   the way `tools/data-inventory.mjs` keeps `OVERRIDES`.
5. Rob's standing instruction is *merge when done*: branch, PR, gates green, squash-merge,
   reset the branch onto `main`. The gates are `GEOMETRY_REQUIRED=1 PAGE_BUDGET_REQUIRED=1
   bash runtests.sh -q` and `node tests/uat/crankmagic-journeys.mjs` with the Playwright
   environment exported (`UAT_PLAYWRIGHT`, `UAT_CHROME`, `UAT_BASE`); a README suite count
   line (`There are N Node suites:`) and the suite list are checked and must move with any
   new suite.

---

## 1. Deliverables

All under `docs/app-inventory/`, plus two tools and one test.

| File | What it is | Made by |
|---|---|---|
| `docs/app-inventory/README.md` | The index: the surface catalogue (every page and overlay, with links to its page file and wireframes), the feature-group table with counts, the method, the head hash and date it was generated at, how to regenerate | generated skeleton, typed prose |
| `docs/app-inventory/pages/<surface>.md` | One file per surface (§3): purpose in a sentence, route and parameters, how it is reached (every entry point), regions (the wireframe's legend), the controls on it, the states it has (fresh library · live library · phone · empty/scoped), the dialogs and menus it opens, its features (links into the register), the modules that draw it and their size, the tests that cover it, its help entry and tour steps | generated from `pages.json`, typed purpose line |
| `docs/app-inventory/wireframes/<surface>-<width>.svg` | The wireframe: labelled grey boxes drawn from the DOM's regions and controls at 1400 and 390 px, one per surface state | `tools/wireframes.mjs` |
| `docs/app-inventory/wireframes/<surface>-<width>.png` | The screenshot the wireframe was drawn from, beside it for reference (viewport, not full page, so each stays under ~250 KB) | `tools/wireframes.mjs` |
| `docs/app-inventory/pages.json` | The outline every wireframe and page file is drawn from: per surface, the regions and controls with labels, roles, boxes and order | `tools/wireframes.mjs` |
| `docs/app-inventory/features.md` | The feature register (§4): feature group → feature → one row per action key, route or overlay, with the columns in §4.2 | `tools/app-inventory.mjs` |
| `docs/app-inventory/features.json` | The same register, machine-readable | `tools/app-inventory.mjs` |
| `docs/app-inventory/overlaps.md` | Where two or more features answer the same question, each with the evidence (shared model commands, shared rows, shared route), no recommendation | typed, from the register |
| `tools/app-inventory.mjs` | Scans the registries (§4.1), joins the annotation file, writes `features.md` and `features.json`; `--check` fails on drift | new |
| `tools/app-inventory.groups.json` | The annotation file: every action key, view and overlay filed under a group with a feature name and a one-line note; `--check` fails when a key in the code has no entry or an entry names a key the code no longer has | new, typed (this is the judgement pass) |
| `tools/wireframes.mjs` | Opens every surface in Chromium at both widths, harvests the outline, draws the SVGs, saves the PNGs; `--check` re-harvests and compares region and control labels in order (never pixels) | new |
| `tests/app-inventory.mjs` | Holds the record to the code (§6) | new; README count 58 → 59 and the suite list |

Add both tools' `--check` to `tests/generators.mjs` (the list at its top, next to
`tools/data-inventory.mjs`), so a feature added without filing shows up red in the gate.

---

## 2. Method

Two harvests, one join, then judgement — in that order, because the judgement pass is the
only manual step and it should start from a complete list.

### 2.1 Static harvest (the registries) — `tools/app-inventory.mjs`

Read every script the pages load (the `<script src>` list of `index.html`, the way
`tools/data-inventory.mjs` finds the served set) and collect:

- **Views.** `views.<name> =` and `views['<name>'] =` — the routes. Today: `decks`, `how`,
  `pull`, `change`, `cards` (registered twice: `crankmagic-collection.js` and
  `crankmagic-orders.js`, the second wrapping the first for `tab=orders`), `collection` and
  `shop` (redirects into `cards`), `lab`, `discover`, `trade`. `NAV_GROUP` in
  `crankmagic-app.js` says which navigation entry each belongs to; `C.SUBNAV.<group>` gives
  the side navigation's sub-entries.
- **Actions.** `actions['<key>'] =` and `actions.<key> =` — 171 keys at this head, by module:
  collection 61, decks 33, app 24, lab 15, advisor 7, tour 6, orders 6, exchange-ui 6,
  pull 5, change-ui 4, plan-editor 3, evidence 1. Discover, graph, tabletop, trade, brand
  and the model modules handle their clicks inside their own listeners, so the static list
  is necessary but not sufficient — the runtime harvest (§2.2) is what completes it.
- **Shell actions** in `index.html` (`data-action` on the header and the menus): `tour`,
  `share-qr`, `share-trade`, `send-feedback`, `backup`, `share-export`, `mirror`, `restore`,
  `load-live`, `export-excel`, `undo`, `history`, `confirm-skips`, `reset-picks`, `clear`,
  the tour's own four.
- **Dialogs, modals and menus.** Every `form(`, `modal(`, `C.review(`, `popMenu(` and
  `popAt(` call with the title string that follows it (the first template literal or string
  argument). Today by module: app 5 forms · 8 modals; collection 15 · 1 · 7 menus; decks 9 ·
  2 · 3 menus; exchange-ui 6 · 2; discover 3 · 1; plan-editor 3; trade 1 · 3; orders 2 · 1;
  advisor 1 · 2; lab 0 · 2; evidence 1 · 1; brand 1; graph 1; tour 0 · 1.
- **Commands committed.** Inside each action's source text, the `type:'<command>'` strings
  passed to `commit(` / `C.commit(` / `review(` / `{type:'batch',commands:[…]}` — the
  model commands (`collection-model.js` `apply` switch) the feature writes. Approximate by
  construction (a string search over the action body up to the next `actions[`), and say so
  in the column header.
- **Help and tour.** `C.HELP.<key>` (today: `cards`, `change`, `deck`, `decks`, `lab`;
  Discover's is set inside its view function) and the tour's seven journeys in
  `crankmagic-tour.js` (`build`, `refine`, `discover`, `collect`, `perform`, `acquire`,
  `portable`) with the `data-action` / route each step targets.
- **Coverage.** For each action key and route: the journey lines that click its label or
  navigate its route (`tests/uat/crankmagic-journeys.mjs`, `tests/page-budget.mjs`,
  `tests/browser-geometry.mjs`), the unit suites that test the module behind it (by file
  name), and the README paragraph that names its label (bold or italic text match). Zero
  hits is a finding, printed as a dash.
- **Weight and age.** Lines of the module(s) behind the feature (from `wc`), and the date of
  the last commit touching the action's source lines (`git log -L` is slow; `git blame
  --line-porcelain` on the module, taking the newest date among the action's lines, is
  enough). Nothing else reads git.
- **Used by.** Which other modules reference the action key or the route (`go('<view>'`,
  `data-action="<key>"`, `'#<view>'`) — the consumers a removal would break.

### 2.2 Runtime harvest (the surfaces) — `tools/wireframes.mjs`

Built on `openBrowser({name: 'wireframes', flag: 'WIREFRAMES_REQUIRED'})` and
`loadLiveState` from `tests/uat/browser-runner.mjs`, at 1400×900 and 390×780 (the repository's
walk widths; the page budget and geometry suites use the same). For each surface in the
catalogue (§3) — a route plus an optional `prepare(page)` step that opens a tab, a menu, a
dialog or a pane — the tool:

1. navigates, waits for the surface's boundary selector (the same selectors
   `tests/page-budget.mjs` uses where one exists), runs `prepare`, waits 400 ms;
2. harvests the outline: walks `#matrix-v2`, keeping as **regions** the elements that
   frame the page — `header`, `nav`, `aside`, `main`, `section`, `article`, `form`, `table`,
   `dialog[open]`, `[popover]:popover-open`, `[role=tablist]`, `[role=group]`, `[role=menu]`,
   `.v-panel`, `.cm-page-head`, `.cm-toolbar`, `.cm-actions`, `.cm-deck-hero`,
   `.cm-batch-bar`, `.cm-pane-tabs`, `.cm-facet-bar`, `canvas` — with a label (in order of
   preference: `aria-label`, the first heading inside, the `<p>` menu title, the first class
   name), and as **controls** every visible `button`, `a[href]`, `select`, `input`,
   `textarea`, `[role=tab]`, with its accessible name and `data-action`; records for each
   its box, depth and document order; drops regions smaller than 40×24 and wrappers whose
   box equals their parent's;
3. draws the SVG: the viewport at the width (height = the page's scroll height, capped at
   three screens, with a "continues" mark), regions as 1 px grey boxes with the label at the
   top-left, controls as small rounded chips with their name, one shade darker per depth,
   a legend of the region labels under the frame — greys only, monospace labels, no card
   art, no colour, so it reads as a wireframe and not a screenshot;
4. saves the PNG beside it (viewport only) and appends the outline to `pages.json`.

`--check` re-harvests and compares, per surface and width, the ordered list of region
labels and control names with the committed `pages.json` — never boxes or pixels, which
move with fonts. A difference is a feature that appeared or went without the record
moving.

Surfaces that need a state: the Decks showcase is harvested before `loadLiveState`; the
Cards batch bar needs two rows ticked; the Discover trace needs `#discover?deck=<D6>&trace=1`
with `.cm-trace-head` waited for; the review dialog is opened from Make the change → Do all
available on D2 and cancelled; the card inspector from any `data-action="card"` name; the
tour from *Take a Tour*, first journey, first step; the User Functions and Share menus by
clicking their buttons. Every `prepare` leaves the library unchanged (cancel, never confirm).

### 2.3 The join and the judgement — `tools/app-inventory.groups.json`

The static harvest gives every key; the runtime harvest says where each is actually drawn
(the surface and region whose control carries that `data-action`). The tool joins them and
writes one row per key. The annotation file then files each row under a **feature group**
and a **feature** with a one-line note:

```json
{"deck-change": {"group": "E", "feature": "Make the change", "note": "opens #change for the deck; hero, Cards More menu, Discover trace pane"},
 "change-all":  {"group": "E", "feature": "Make the change", "note": "every ready row in one revision through the review dialog"}}
```

Keys with no entry fail `--check` with the list of what is unfiled; entries whose key the
code no longer has fail it too. Group ids are the letters in §4.3; a feature name repeats
across the keys that make it up, so the register can roll keys up into features and
features into groups with counts.

---

## 3. The surface catalogue (seed — verify, then extend)

Confirmed against the code at `795f873`. `S` = a state of the same route that reads
differently and gets its own wireframe. Boundary selectors in the last column are the wait
targets.

| Id | Route / how reached | What is on it (regions) | Boundary |
|---|---|---|---|
| `shell` | every page | Header: brand block, *Take a Tour*, *Share ▾* (Subscribe to updates · Share by e-mail · Show a QR code · Publish your To Trade list), *Send Feedback*, *User Functions ▾* (save status and data dates; Back up and restore: Save a backup file · E-mail the export… · Keep a file up to date automatically… · Restore from a backup file · Load Live · Export as Excel; Undo: Undo last change · See every change…; Start over: Confirmations… · Reset comparison picks · Clear all data). Sidebar: Decks · Cards · Build · Discover with the active entry's sub-navigation. Toast, review dialog, tour layer, glossary popovers | `.v-top` |
| `decks` S1 fresh | `#decks` with an empty library | the showcase: card fan, "Build it. Make it yours.", Create a deck · Build a deck · Import a list · Import a backup | `.cm-showcase` |
| `decks` S2 live | `#decks` | page head (Create a deck · Build a deck · Compare selected), toolbar (How a deck comes together · Show archived), the deck tiles (art, name, commander, pips row, stage border, badges, compare tick, per-deck menu) | `.cm-deck-grid` |
| `deck` ×5 tabs | `#decks?deck=<id>[&tab=overview|cards|guide|upgrades|history]` | hero (crumb, name, commander, badges, mechanics; Ready to add (n) · Buy list (n) · Log a game — or Edit card list · Finalize & reserve — · Measure · Trace · Make the change (n) · More ▾ · ?), the five tabs; Overview: progress and cost card, readiness bar, Next line, *The hundred at a glance*; Cards: the hundred by type with a status per copy and per-card actions, Options, Planned; Guide: commander, strategy, SWOT, how to play; Upgrades: working list and the Upgrade Path panel with filters and Promote; History: games and measured runs; the phone action bar. More ▾ menu: group, reserve, lock, Upgrades, Role lens, Edit definition, Export deck list, Archive, the status ladder, Recommendations, Reports & advice, term definitions | `.cm-deck-summary` |
| `how` | `#how` | the six-step map, each step opening where it begins | `main h1` |
| `pull` | `#pull?deck=` | Ready to add: counts, actions (Open deck · Print · Export · Mark all added), groups Add from the Bench · Move from another deck · Substitutes in this deck with Select all and per-row ticks, Waiting | `.cm-pull` |
| `change` | `#change?deck=` | Make the change: counts, actions (Open deck · Ready to add · Export Excel · Print · Do all available · ?), the formula line, four readings, the numbered swap rows with ticks, substitutes that stay | `.cm-change` |
| `cards` S1 library | `#cards` (`tab=library`, `view=table`) | page head with the seven count chips, Add cards · Import list · More ▾ (export, group actions, Ready to add for…, Make the change for…), tab row Library · To buy · Orders with the view switch List · Sheet · Table · Tabletop, search, five filters + More filters, group, the table (sortable, column chooser, group headers, paging and fold), row Actions ⋯ (Status fly-out, Substitute fly-out, Delete), row ticks | `#cm-roster-table table` |
| `cards` S2 batch | two rows ticked | the batch bar: Set status ▾ · Ordered… · Bought in store · … · Flags · Move to group · Clear | `.cm-batch-bar` |
| `cards` S3 to buy | `#cards?tab=buy` | the strip (what finishing costs, the cap), grouped by deck, Bought / Arrived on the row, buy channels, export | `#cm-roster-table table, .cm-shop-strip` |
| `cards` S4 orders | `#cards?tab=orders` | one row per order, Arrived → bench, Paste receipt, Edit, Lines | `#cm-roster-table table` |
| `cards` S5 sheet | `#cards?view=sheet` | the Master spreadsheet read from the library, T and A cells editable, Export CSV | `#cm-sheet-table table` |
| `cards` S6 tabletop | `#cards?view=tabletop` | the mat: status piles, Bench ledge, group piles, grouping dropdown, search and filters, card size; a pile laid out (rows and columns, pages, select, drag to a pile); the single-card stage with its size control, card info, next/previous | `.cm-tt-mat` |
| `lab` | `#lab` | Build: Starting point (a commander · an existing deck), Matching commanders with Inspect commander, Deck Definition, the numbered gated run pane, results and the report (per-card, coverage, how the list was built), Save this deck / spin off a variant, the simulator hold notice | `#cm-lab-results` |
| `discover` S1 | `#discover` | Filters pane (facet bar: Yours, colours, types, purposes, mechanics…, deck pick, Loops only, Lens), the graph canvas (Navigate · Inspect · Select, depth, zoom, presentation mode, node and edge pop-ups, gold band), the card pane tabs Card Info · List · Trace, the divider | `#cm-graph` |
| `discover` S2 card | `#discover?card=<id>` | Card Info: the picture, chips, Inspect card, group and deck actions, focus | `#cm-card-view` |
| `discover` S3 list | pane tab List | the sortable neighbourhood rows, an expanded row, ticks and pick actions | `.cm-list-table` |
| `discover` S4 trace | `#discover?deck=<id>&trace=1` | the score strip, strategy ticks, the three limit sliders, the transport, the grouped lit list, This deck · What it could be · Make the change, add to a group | `.cm-trace-head` |
| `discover` S5 lens | `#discover?deck=<id>&lens=Removal` | the role lens: the deck's cards in the role beside the graph's candidates, counts against the floors, one swap action | `.cm-lens-head` |
| `discover` S6 pop-up | a node clicked in Inspect mode | the node pop-up: picture at the inspector's size, buttons stacked left, mana beside the type line | `.cm-graph-pop` |
| `trade` | `#trade?d=<packed>` (Share → Publish your To Trade list, then open the link) | the published list as a visitor sees it: pictures, ask-about buttons, the owner's note | `.cm-trade-grid` |
| overlays | User Functions menu · Share menu · page help (?) · the card inspector (`data-action="card"`) · the review dialog (`C.review`) · a form dialog (Create a deck) · Import list → Map file columns → Resolve → Review import · the tour chooser and a tour step · a glossary popover · the Inspect commander pop-up (Build) · the Discover node pop-up | one wireframe each at 1400 (menus and dialogs are the same at 390 except the tour) | `#cm-dialog[open]`, `[popover]:popover-open` |

Every boundary selector above was checked against the code at this head. Add any surface the runtime harvest reaches that this table does not name — the
harvest is the authority, the table is the seed.

---

## 4. The feature register

### 4.1 Grain

One row per **action key**, **route** or **overlay**, rolled up into **features** (a named
thing a reader would recognise: "Make the change", "Row Actions → Status fly-out") and
**feature groups** (§4.3). 171 action keys, 10 views, the shell's 16 actions and the
dialogs, modals and menus of §2.1 are the population; the runtime harvest adds the
listener-driven controls the static scan cannot see (Discover, the graph, the Tabletop,
Trade, the brand strip).

### 4.2 Columns

| Column | Source | Why it is there |
|---|---|---|
| Group · Feature · Key | annotation file | the roll-up |
| Surface · Region | runtime harvest | where it is drawn |
| Reached by | runtime harvest | the control's visible label(s), and how many surfaces carry one — the reach |
| Route | static | for views and `go()` targets |
| Module · Lines | static | where it lives and what it weighs |
| Commands | static (approximate) | the model commands it commits — what it changes |
| Reads | static | the data files or model queries it depends on (`M.readiness`, `M.projection`, `data/…`) |
| Used by | static | other modules that reach it — what a removal breaks |
| Journeys · Suites | static | the tests that cover it (a dash is a finding) |
| README · Help · Tour | static | whether it is explained anywhere |
| Last touched | git blame | age |
| Note | annotation file | one line, and the overlap tag if any |

### 4.3 Feature groups (seed taxonomy — file everything, then argue the names)

| Id | Group | What belongs |
|---|---|---|
| A | Shell and navigation | header, sidebar and sub-navigation, routes and redirects, page help, glossary and term definitions, toast, offline behaviour, the service worker and versions, data ages |
| B | Library persistence and portability | IndexedDB revisions, undo and history, backup and restore, the file mirror, Load Live, Excel export and the reviewed edited import, e-mail export, Clear all data, confirmations and skips |
| C | Decks index | the showcase, tiles, compare, archived decks, Create a deck |
| D | Deck page | hero and work buttons, the five tabs, the Overview figures and *The hundred at a glance*, per-card actions on the Cards tab, Guide, Upgrades and the Upgrade Path, History, the More menu and the status ladder, lock, export deck list, edit definition |
| E | Assembling the physical deck | Ready to add, Make the change, substitutes, the Tabletop's drag to a pile, the readiness vocabulary (Physical deck · Substitute · Reserved · Bench) |
| F | Cards library | the table (sort, filters, columns, groups, search, paging, fold), the count chips, row Actions and the Status and Substitute fly-outs, ticks and the batch bar, Add cards, Import list (mapping, resolving, review), the count stepper, price and quantity in place, collapse prints, hover preview, collection groups and planned entries |
| G | Buying and orders | To buy tab and strip, buy channels and links, Bought and Arrived, Orders (receipts, edit, lines), the buy list per deck, price checks and the cap |
| H | Lenses | List, Sheet, Table and Tabletop on Cards; Graph and List on Discover; the Tabletop's lay-out, selection, single-card stage, keyboard model and print |
| I | Build (Deck Lab) | starting point, commander picker and Inspect commander, Deck Definition, the gated run pane, draft and the measure loop, the report, Save this deck and variants |
| J | Simulation and measurement | Measure on the deck page, reports and history, guide generation, the engine hold and "cannot see the win" notices, the lab report figures |
| K | Discover | filters and facets, graph modes and depth, presentation mode, node and edge pop-ups, the card pane, the role lens, loops and *Loops this card is in*, the trace and its limits, group and deck actions from Discover |
| L | Sharing and trade | Share menu (subscribe, e-mail, QR), Publish your To Trade list and the visitor page, Send Feedback, Sell / Trade flags |
| M | Guidance | the tour and its seven journeys, How a deck comes together, help entries, the glossary |

Thirteen groups; if a key fits none, add a group rather than force it, and say why in the
annotation note.

---

## 5. Execution order

Three PRs, each green on the gates before the next starts, each merged when done.

**PR 1 — the register.** `tools/app-inventory.mjs`, `tools/app-inventory.groups.json`
(every key filed — this is the judgement pass, budget two to three hours for 171 keys plus
the overlays), `docs/app-inventory/features.md` and `.json`, `tests/app-inventory.mjs`,
`tests/generators.mjs` running the check, README (the suite count and list; a paragraph
under *Design and execution record* linking `docs/app-inventory/README.md`), session status.

**PR 2 — the wireframes.** `tools/wireframes.mjs`, the surface catalogue as its table,
`docs/app-inventory/pages.json`, the SVGs and PNGs, the page files, the index README; the
check added to `tests/generators.mjs` and `tests/app-inventory.mjs` extended (§6). Walk the
output at both widths and look at every wireframe once: a region with no label or a control
with no name is a harvest bug to fix in the tool, not in the SVG.

**PR 3 — the reading.** `docs/app-inventory/overlaps.md` from the register's Commands, Reads
and Used-by columns (candidates to start from: Ready to add · Make the change · Tabletop drag
all commit `place`; List · Sheet · Table · Tabletop all draw `M.projection`; the deck page's
Cards tab and `#cards?deck=` both list a deck's copies; Buy list on the deck page and the To
buy tab; Guide and How a deck comes together; Recommendations and the Discover role lens),
the index README's method and counts, and a final pass of `docs/session-status.md`.

Keep the PRs to the inventory. A bug found on the way is a note in the page file and a task
for Rob, not a fix in the same PR.

---

## 6. Acceptance — what "done" is held to

`tests/app-inventory.mjs` asserts, on the committed files:

1. every `views.<name>` and every `actions['<key>']` in the served modules, and every
   `data-action` in `index.html`, has a row in `features.json` with a group and a feature;
2. every row's key exists in the code (no stale rows);
3. every surface in the catalogue has a wireframe SVG and PNG at both widths, and an entry
   in `pages.json` whose control list is non-empty;
4. every `data-action` seen by the runtime harvest is in the register (the listener-driven
   controls included);
5. the group table in `docs/app-inventory/README.md` states the same counts as the
   register;
6. `tools/app-inventory.mjs --check` and `tools/wireframes.mjs --check` pass (the second
   is skipped without a browser and required in CI, the way `tests/browser-geometry.mjs`
   is), and both are listed in `tests/generators.mjs`.

And by reading: every page file has its purpose line typed; the overlaps file cites evidence
for every entry and recommends nothing; the index says the head hash the record was made
at and how to remake it in one command each.

---

## 7. What already exists, so nothing is made twice

- `docs/data-inventory.md` and `tools/data-inventory.mjs` — the data side of the same
  question (every artefact, its producer and consumers). This plan is the UI side; the
  index README should point at both as the two halves of the whole.
- `docs/crankmagic-build-status.md` — the scope checklist of what was delivered, by area.
- `docs/screens/*` — earlier screenshots by topic (`p0`, `list`, `orders`, `upgrades`, …),
  `docs/ux-review-2026-09-11/*` — the September walkthrough (16 views at 1400 and 390) and
  the gap review with mock-ups, `docs/mockups/*.html` — the tabletop and trace mock-ups,
  `design/crankmagic/*` — the approved plan, standalone mock and evaluations. Link them from
  the page files where they show a surface's history; do not copy them.
- `tests/page-budget.mjs` — the boundary selectors and the words/controls counts per page;
  `tests/browser-geometry.mjs` — the six widths and the geometry rules; reuse both lists.
- The tour (`crankmagic-tour.js`) is a typed walk of seven use cases with the control each
  step targets — the nearest thing to a feature map the app already carries; the register's
  Tour column comes from it.

---

## 8. Estimate

| Piece | Effort |
|---|---|
| `tools/app-inventory.mjs` and the test | half a day |
| the annotation pass (171 keys, ten views, the overlays) | two to three hours |
| `tools/wireframes.mjs`, the catalogue, the harvest fixed until every wireframe reads | a day |
| page files and the index | half a day |
| overlaps and the reading | two hours |

Two to three sessions of work, three PRs. The gates run about five minutes each; the
wireframe harvest about three minutes at both widths.
