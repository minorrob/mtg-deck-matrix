# Handover index

*What a new reader — human or model — needs in order to evaluate this app, explain it, and
keep building it without breaking it.*

**Production application update (September 7):** The CrankMagic non-simulator build is now implemented. Start with [crankmagic-architecture.md](crankmagic-architecture.md) and [crankmagic-build-status.md](crankmagic-build-status.md) for its modules, entries, persistence and current validation. The map below describes the retained legacy application and design history. Simulator changes remain on hold.

**Historical review-branch note (September 7):** this index is a dated architectural snapshot; several
counts and open-PR statements below predate the later commits. The current CrankMagic review
package is mapped in [`design/crankmagic/README.md`](../design/crankmagic/README.md). It includes
the final standalone mockup, plans, editable sources and fresh verification. Upstream
`118fe39` is merged on the review branch; production execution was subsequently authorized.

Written 2026-09-07 by reading the repository at commit `8f0a0c0` on branch
`claude/mtg-deck-matrix-ui-fixes-f7om91`. Every path below was checked to exist and every
claim about a file's contents came from opening it. Where something could not be verified
it says so.

---

## 1 · What this project is

A Commander (Magic: the Gathering) deck-planning site for one person, published as a static
site and usable by anyone who opens it. It answers three questions that a spreadsheet used
to answer badly: *what are my decks and how far from finished are they*, *which version of
each deck should I build and what does it cost*, and *what card should go in this slot*.

Three pages, three jobs:

| Page | Title on screen | What it is for |
|---|---|---|
| `index.html` | **My Decks** | The front door. Every deck you have, what it does, what it still needs. Three tabs — Decks, Bench, Upgrades. Add a deck by pasting one, build one from a commander, or upload what you own as csv/xlsx. |
| `matrix.html` | **Deck Matrix** | Build-and-buy. Four steps — Compare (pick one variant per deck slot out of fifty), Deck (turn the pick into an exact hundred, slot by slot, at a chosen rung), Shop (everything still owed, with a Store view for a phone at a vendor's booth), Game Log (what actually happened, read back against what the simulation predicted). |
| `graph.html` | **Card Graph** | 7,764 Commander-legal cards, what connects them, and a Copilot that says which twenty are worth a look. Any of the 31,830 legal cards can be typed in and looked up live. |

### The constraints that explain everything else

These are not preferences. Every awkward-looking decision downstream follows from one of
them, so read them first.

- **Zero dependencies, no `package.json`, no build step.** Verified: no `package.json`
  exists anywhere in the tree. The Node test suites use only built-ins. The one runtime
  library on any page is Cytoscape, loaded from cdnjs by `graph.html` and explicitly
  optional — the page renders and says so without it.
- **Static files only.** No server, no account, no session. This is why there is nowhere
  to keep an API key, which is the single fact that decides how any AI feature could ever
  be built here (`docs/claude-api-evaluation.md` §1).
- **UMD modules.** Every shared module wraps itself so it attaches to `globalThis` in a
  browser *and* answers `module.exports` under Node. That is what lets `tests/*.mjs`
  `require()` browser code with no harness, and it is why the `<script>` tags in each page
  are in dependency order with `defer` — `defer` preserves document order, so a module
  that reads `window.MtgSimEngine` at load time must be listed after it.
- **`?v=` cache versioning.** Every script, stylesheet and data file is fetched with a
  `?v=N` query and through the browser cache. The rule is: *a changed file must get a new
  version*. It has broken twice; `tests/asset-versions.mjs` now guards it against
  `tests/fixtures/asset-versions.json`, which stores a content hash per asset.
- **`localStorage` is the only store.** `data/*.json` is the app's content — the card
  catalog, the deck plans, the graph — and the app never writes to it. Everything about
  *you* lives in the browser, under keys enumerated one by one in `user-state.js`.
- **Mobile first.** The target device is a phone at a card shop. This is why the header
  folds, why the Shop has a Store view, and why the fonts and the graph library load
  without blocking first paint (an unreachable CDN once cost 12.7 seconds of blank page;
  the comments in `index.html` and `graph.html` record the measurement).

### Two catalogs, and they are not the same thing

This trips people up. The app carries two independent descriptions of "six decks":

- **The 50-variant catalog** (`data/variants.json`, `data/buy-plans.json`) — ten deck
  *slots*, five competing variants each, ids `1a`…`10e`. This is what `matrix.html` reads.
  Six of the fifty carry a ★ My Build ribbon; that set comes from
  `data/active-state.json`'s `state.compareSelections`, currently
  `{1: 1b, 2: 2c, 3: 3o, 4: 4e, 5: 5o, 7: 7e}` — Betor, Atraxa, Purphoros, Chulane,
  Quintorius, Shadrix.
- **The six real decks** (`data/master-v2.json`) — D1 Quintorius, D2 Chulane, D3 Atraxa,
  D4 Felothar, D5 Shadrix, D6 Krenko, generated from a workbook. This is what `index.html`
  reads through `viewer.js`.

Four commanders overlap. Two do not: the Matrix's picks include Betor and Purphoros where
the workbook has Felothar and Krenko. The workbook is the newer of the two (the
2026-09-05 six-deck rebuild, per `tools/import_master_v2.py`'s header), so the Matrix side
appears to be behind. **Not verified** whether that divergence is deliberate.

---

## 2 · The reading order

Read these in order and the system makes sense. Roughly two hours.

1. **`README.md`** — the whole app in the author's own voice, including the four rungs, the
   simulation protocol and what the engine cannot see. Everything below is detail under it.
2. **`index.html`** — read the `<script>` block, not the body. The comments beside each tag
   say *why* that module exists and what breaks without it. Same for `matrix.html` and
   `graph.html`. This is the fastest map of the module graph in the repo.
3. **`lineup-model.js`** (329 lines) — the bottom of the data model. Twelve named arrays per
   deck plan, chained by `replaces`, resolved into slot groups. Nothing above it makes sense
   until this does.
4. **`slot-model.js`** (901 lines) — the one projection the Deck page and the Shop page both
   read. Turns lineup groups into rows, collapses twelve storage keys into the five rungs a
   person sees, and owns the price bands and ownership vocabulary.
5. **`sim-engine.js`** (1,482 lines) — start with the `SIMPLIFICATIONS` array at the top.
   Fourteen numbered admissions of what the model does not do. Read them before reading any
   score anywhere in this app.
6. **`deck-measure.js`** (259 lines) — the protocol. Two tiers (preview: one seed, 2,000
   games; full: six seeds, 20,000 games each) and why only one of them may be recorded.
7. **`user-state.js`** (225 lines) — every localStorage key with the module that owns it and
   one line on what is lost with it. The shortest complete answer to "what does this app
   remember".
8. **`deck-store.js`** (330 lines) — the record format for a deck somebody added, and the
   merge into the catalog every other view reads. The comment explains why the merge copies.
9. **`card-resolve.js`** + **`card-link.js`** (333 + 299 lines) — what happens when a pasted
   card name is not a card. The four-rung ladder, then the link, then the manual card. This
   is the most recent design work in the repo and the clearest example of its house style.
10. **`BACKLOG.md`** — six deferred decisions, each with the gap, what it would take, and
    why it is not minor. Item 2 is marked shipped.
11. **`tests/uat/README.md`** — the three personas and what each browser journey caught.
    Reads as a bug archaeology of the UI.
12. **`docs/mechanics-design-v2.2.md`** — how counters and combat keywords were modeled and
    why, including the ones deliberately left out.

Skip `app.js` (9,189 lines) and `viewer.js` (2,957 lines) on a first pass. They are page
controllers; read them when you need to change a page.

---

## 3 · Every source module

37 JavaScript files and 5 stylesheets at the repository root. The "Loaded by" column was
derived by parsing the `<script src=…>` tags out of the three pages — every one of the 37
is loaded by at least one page; none is dead.

### Page shells and controllers

| File | Lines | Global | Owns | Loaded by |
|---|---|---|---|---|
| `viewer.js` | 2,957 | *(IIFE)* | My Decks: the three tabs, the deck cards, the bench, upgrades, archive/delete, inventory upload | index |
| `app.js` | 9,189 | *(IIFE)* | The Matrix: Compare, the tour, the dialogs, state persistence, the game log | matrix |
| `graph-page.js` | 1,479 | *(IIFE)* | The card graph: one filter state driving a list view and an ego-centric graph view, plus the Copilot | graph |
| `deck-page.js` | 976 | `MtgDeckPage` | The Deck step: one row per slot, expanding in place into its rung ladder | matrix |
| `shop-page.js` | 738 | `MtgShopPage` | The Shop step: the same slots re-keyed by card name and merged across decks | matrix |
| `import-panel.js` | 584 | `MtgImportPanel` | "Add a deck": read → resolve → preview → measure, and the only place that knows that order | index |
| `build-panel.js` | 498 | `MtgBuildPanel` | "Build a deck": describe → generate → choose → preview | index |
| `admin-menu.js` | 168 | `MtgAdminMenu` | The Admin popup — Export, Import, Load Active, Undo, Load default, Clear session. No page knowledge; each page hands it a list | index, matrix |
| `shop-filters.js` | 282 | *(IIFE)* | The extra Shop filter strip (color, price, rarity, location, sort) and its own storage key | matrix |

### Data model — the shared vocabulary

| File | Lines | Global | Owns | Loaded by |
|---|---|---|---|---|
| `lineup-model.js` | 329 | `MtgLineupModel` | The twelve ladder arrays, `replaces` resolution, selection canonicalization, name normalization. Exports `ARRAY_KEYS`, `normalizeName`, `buildModel`, `applyChoice`, `selectedEntries`, `quantity`, and 10 more | index, matrix |
| `slot-model.js` | 901 | `MtgSlotModel` | Rungs, price bands, ownership state, roles, `slotFit`, `deckSlots`, `shopRows`, `withPullList` | matrix |
| `compliance-model.js` | 121 | `MtgComplianceModel` | Commander bracket rules, shared between the page and the simulator. Exports `deriveComplianceTags`, `evaluateCardList`, `TIER3_EARLY_COMBO_PAIRS` | index, matrix |
| `custom-model.js` | 508 | `MtgCustomModel` | Decks built on the retired Choose step: storage, card pool, slot variants, overlays | matrix |
| `deck-store.js` | 330 | `MtgDeckStore` | The record format for an added deck, its browser storage, and the merge into the catalog. Exports `toRecord`, `merge`, `catalogRow`, `problems`, `measurable` | index |
| `card-classify.js` | 254 | `MtgCardClassify` | The one copy of "what does this card do", read off rules text — events caused and fired on, resources made and needed, what a card multiplies, what quality it grants and what extends one. Shared with `graph/ingest/02-build-csv.mjs` so a card typed on the graph is read by the rules the corpus was baked with | graph |
| `user-state.js` | 225 | `MtgUserState` | Every localStorage key by name, plus backup/restore/clear and the catalog-source flag | index, matrix, graph |

### Simulation

| File | Lines | Global | Owns | Loaded by |
|---|---|---|---|---|
| `sim-engine.js` | 1,482 | `MtgSimEngine` | The Monte Carlo model itself. Exports `SIMPLIFICATIONS`, `DEFAULT_WEIGHTS`, `classifyCard`, `prepareDeck`, `playGame`, `simulateGames`, `compositeScore`, `scoreParts`, `analyzeGaps`. Takes an optional `config.policy`; with none it is the pilot it has always been | index, matrix |
| `pilot-policy.js` | 527 | `MtgPilotPolicy` | The person holding the cards. Five decisions as data, three named answers (`BALANCED` is a strict no-op), five measurable ablations, and `advise()`, which turns the gap between two runs into sentences. Exports `POLICIES`, `ABLATIONS`, `without`, `allocateCombatDamage`, `heldBackCreatures`, `manaToReserve`, `partDeltas`, `advise` | index, matrix |
| `deck-measure.js` | 378 | `MtgDeckMeasure` | Running the engine in a browser on the published protocol. Exports `measure`, `measureLens`, `hydrate`, `seedsFor`, `lineupHash`, `FULL`, `PREVIEW`, `LENS_PLAN`. Throws at load without the engine, and refuses a lens on cards with no printed text | index, matrix |
| `measure-report.js` | 275 | `MtgMeasureReport` | What the score is made of: the nine weighted parts, the receipt (games/seeds/ms/games-per-second), which cards carried the deck, and a before/after comparison. Newest module in the repo | index |
| `deck-audit.js` | 248 | `MtgDeckAudit` | Whether the number on screen still describes the deck on screen — and the rule that a locally measured score is never subtracted from a published one | matrix |
| `sim-lenses.js` | 260 | `MtgSimLenses` | Copilot findings derived from `data/deck-ratings.json` deltas — including the negative delta, an upgrade that measures worse than what you have | graph |
| `game-record.js` | 282 | `MtgGameRecord` | Reading the Game Log back against the prediction, gated on a Wilson score interval so twelve games never becomes a claim | matrix |

### Import, resolution and external data

| File | Lines | Global | Owns | Loaded by |
|---|---|---|---|---|
| `scryfall-client.js` | 362 | `MtgScryfall` | The only Scryfall client. Request queue at 120 ms, 4 attempts with exponential backoff, 24-hour sessionStorage cache, the required User-Agent. Exports `createClient`, `parseTcgplayerUrl`, `normalizeCard` | index, matrix, graph |
| `deck-import.js` | 312 | `MtgDeckImport` | Parsing somebody's decklist paste. The parse is the blank line — Moxfield puts the command zone in its own trailing block and does not label it | index |
| `deck-sources.js` | 201 | `MtgDeckSources` | Loading a deck from the site it lives on. Archidekt is fetchable; Moxfield and Deckstats are not, and the module says so rather than pretending | index |
| `card-resolve.js` | 333 | `MtgCardResolve` | The four-rung ladder for a name that is not a card: autocomplete, autocomplete-before-the-comma, fuzzy named, word search. Capped at five candidates, each carrying why | index |
| `card-link.js` | 299 | `MtgCardLink` | Reading a URL for whatever it will give — exact printing, embedded search, TCGplayer product id, slug guess — and turning a link that resolves to nothing into a manual card | index |
| `manual-cards.js` | 161 | `MtgManualCards` | The population of cards Scryfall does not have yet. One `/cards/collection` request for all of them, exact matches only, promotion written back into every deck holding one | index |
| `edhrec-client.js` | 180 | `MtgEdhrec` | Per-commander inclusion and synergy from `json.edhrec.com`. Optional by design: no page means the generator ranks the way it always did | index |
| `deck-generator.js` | 983 | `MtgDeckGenerator` | Building a hundred from nothing: role quotas, Scryfall queries per role, theme and playstyle scoring, basics allocation, a three-rung ladder, Tier 3 repair | index, matrix |
| `deck-build.js` | 247 | `MtgDeckBuild` | Mapping what the generator produced onto the flat record `deck-store.js` defines. Refuses anything that is not a hundred cards with a commander | index |
| `inventory-import.js` | 309 | `MtgInventoryImport` | Reading what you own out of csv, a table, or free text, and allocating it copy by copy across decks. The allocation is the hard part, not the parse | index |
| `xlsx-reader.js` | 188 | `MtgXlsxReader` | Reading a real .xlsx: a ZIP central-directory walk plus `DecompressionStream("deflate-raw")`, and the shared-strings table | index |

### Export and shared UI

| File | Lines | Global | Owns | Loaded by |
|---|---|---|---|---|
| `docx-writer.js` | 204 | `MtgDocxWriter` | A .docx written by hand — a stored-entry ZIP plus three XML parts, about eighty lines, no CDN | index, matrix |
| `xlsx-writer.js` | 187 | `MtgXlsxWriter` | A .xlsx the same way, borrowing the ZIP builder from `docx-writer`. Inline strings, no shared table. Handles the sheet-name rules Excel will refuse | index, matrix |
| `shop-export.js` | 301 | `MtgShopExport` | The three lists you leave the house with: To Buy (printed), Order (TCGplayer Mass Entry), In hand (checked against the shelf) | matrix |
| `card-table.js` | 299 | `MtgCardTable` | One filter/sort/group-by engine behind the bench, Upgrades and the Shop. Facet counts computed against what the *other* filters already allow. Pure — no DOM, no storage, no fetch | index |

### Stylesheets

| File | Lines | Loaded by |
|---|---|---|
| `header.css` | 215 | index, matrix, graph — the shared header, nav and fold |
| `viewer.css` | 1,282 | index |
| `card-table.css` | 200 | index |
| `app.css` | 2,531 | matrix, graph |
| `graph-page.css` | 396 | graph |

### The fourth HTML file

`import-quintorius-owned.html` is a standalone one-shot page that writes a fixed list of
~100 photographed card names into `mtg-deck-matrix-state-v1` as Bought. Nothing links to
it — grep found no reference in any page, module or doc. It is a historical migration
artifact kept for a browser that never ran it.

---

## 4 · Every data file

Everything under `data/` is committed content the app reads and never writes. 18 JSON files
plus six source workbooks. Counts below were computed, not estimated.

| Path | Size | What it holds | Generated by | Read by |
|---|---|---|---|---|
| `data/buy-plans.json` | 8.1 MB | The 50 purchase plans — starting shell plus twelve ladder arrays each — with the card audit, salvage, 99 owned extras and price-bound audit. The largest file in the repo | `tools/extract_data.py`, then patched by `tools/import_budget_plan.py`, `tools/sim/bake-ladders.mjs`, `tools/sim/build-base.mjs`, `tools/sim/promote-tier3.mjs`, `tools/sim/reprice.mjs` | `app.js` |
| `data/graph.json` | 7.1 MB | 7,764 cards with rules-derived edges, EDHREC co-play (10,315 `playedWith` pairs), prices, ownership, facets, and the 6 deck overlays. `multiplies`/`grants`/`extends` are added on top of the Neo4j export | `graph/ingest/07-export-app.mjs --commanders`, then `tools/graph-amplifiers.mjs` | `graph-page.js`, `crankmagic-graph.js` |
| `data/cards.json` | 2.9 MB | 1,972 audited cards from Scryfall's collection API — name, mana cost, type line, oracle text, keywords, colour identity, legalities, rarity, set, image, price, TCGplayer URL. 0 missing | `tools/audit-cards.mjs` → `tools/apply-card-audit.mjs`; Game Changer flags by `tools/sim/sync-game-changers.mjs` | `app.js` |
| `data/commander-universe.json` | 1.6 MB | 31,830 Commander-legal cards, 3,411 of them legal commanders. Seven flat fields each (name, ci, rarity, mv, type, rank, commander) — the registry, not the corpus | `tools/commander-universe.mjs` | `graph-page.js`, `viewer.js` |
| `data/variants.json` | 1.2 MB | 10 deck slots, 50 variants: commander, tags, summaries, stage notes, costs, brackets, ranks, facts, rarity, 12 scores, mechanics, pre-rendered detail HTML | `tools/extract_data.py`; kept in sync by `tools/sim/reprice.mjs` and `tools/sim/resync-compare.mjs` | `app.js` |
| `data/rung-lists.json` | 1.2 MB | The exact hundred measured for each of 50 variants × 4 rungs (Base, Tuned, Pod Fun, Max), as name+quantity entries summing to 100 | `tools/sim/bake-ladders.mjs`, `promote-tier3.mjs`, `repair-tier2.mjs` | tests only (`data-integrity`, `lineup-compliance`, `slot-model`, `measure-report`) |
| `data/master-v2.json` | 572 KB | The six real decks (D1–D6) and 648 card rows, generated from `Treys_MtG_Master_v3.xlsx` | `tools/import_master_v2.py` | `viewer.js`, `graph-page.js` |
| `data/card-facts.json` | 466 KB | 668 trimmed Scryfall facts — only the names `master-v2` uses, only the fields the card popup shows. Exists because `cards.json` is 2.9 MB and covers the wrong set | `tools/build_card_facts.py` | `viewer.js` |
| `data/active-state.json` | 451 KB | A full app export used as the "Load Active" payload and as the UAT seed. `state` carries 27 keys including `compareSelections` (which drives the ★ My Build ribbon), `owned`, `deckHolds`, `manualCards`, `gameLog` | `tools/apply-deck-master.mjs` / `apply-current-state.mjs` / `apply-app-handoff.mjs` / `import-pull-list.mjs` / `seed-manual-rung.py` | `app.js`, and `tests/uat/journeys.mjs` as its seed |
| `data/deck-ratings.json` | 391 KB | Measured scores for the six real decks, 6 seeds × 20,000 games, with per-part score breakdowns, standard errors and a 3-entry ranking | `tools/sim/rate-decks.mjs` | `viewer.js`, `graph-page.js` |
| `data/my-load.json` | 398 KB | The "Load default" payload: a browser snapshot in the app's own export format, so the file the app writes is the file this reads | `tools/build-my-load.mjs` | `viewer.js` |
| `data/simulation-summary.json` | 160 KB | The published numbers: 50 variants × 4 rungs, engine v2.4, with score weights, the win-rate band, 47 alt-commander cases, and three caveat blocks (6 inversions, 15 pod-fun-over-ceiling entries) | `tools/sim/bake-sweep.mjs`; also `tools/import_summary_metrics.py` historically | `app.js` |
| `data/deck-guides.json` | 39 KB | Hand-written play guides for 6 decks, each with an arithmetic `shape` block | Prose by hand; `shape` by `tools/build_guide_shapes.py` | `viewer.js` |
| `data/base-rebuild.json` | 38 KB | The Base-rung rebuild record for all 50 variants at a $2 per-card cap | `tools/sim/build-base.mjs` | `tests/lineup-compliance.mjs` |
| `data/deck-swaps.json` | 38 KB | The optimizer's recommended swaps for the 6 decks, trimmed to what the viewer shows. Deliberately *not* applied to `master-v2.json` | `tools/build_deck_swaps.py`, from a `six-optimized.json` that is not in this repo | `viewer.js` |
| `data/pull-list.json` | 38 KB | A written shopping document — 68 cards, 70 copies, $124.67 budget, dated 2026-09-06 rev 2. Not derived from anything; most of its cards belong to builds the app does not track | `tools/import-pull-list.mjs`, from the .docx in `data/source/` | `app.js` (through `Slot.withPullList`) |
| `data/lenses.json` | 19 KB | 10 Copilot lenses — graph queries about what a deck is short of, what you own that nothing uses, what the field plays that you do not have | `graph/ingest/08-build-lenses.mjs` | `graph-page.js` |
| `data/game-history.json` | 245 B | The cumulative game record. **Currently empty**: 0 games, 0 source files | `tools/compile-game-logs.mjs`, run by the GitHub Actions workflow | `app.js` (not verified at runtime — the file is empty) |
| `data/game-logs/` | — | Drop zone for exported game-log JSON. Holds only `README.md` today | — | — |

### `data/source/` — the workbooks

Six files, all committed. `MtG_Deck_Flat.xlsx` and `MtG_Deck_Master_v2.xlsx` are mode `600`
where the rest are `644`; **not verified** whether that is deliberate.

| Path | Size | Read by |
|---|---|---|
| `Treys_MtG_Master_v3.xlsx` | 299 KB | `tools/import_master_v2.py` → `data/master-v2.json`. The current authority on the six real decks |
| `MTGDeckDecisionMatrix.xlsx` | 190 KB | `tools/import_budget_plan.py`, `tools/import_summary_metrics.py` |
| `MtG_Deck_Master_v2.xlsx` | 244 KB | `tools/import_master_v2.py` (superseded by v3) |
| `MtG_Deck_Flat.xlsx` | 107 KB | `tools/import_master_v2.py` — carries the resolved formula columns the v2 workbook leaves blank |
| `Robs_MtG_Current_State.xlsx` | 41 KB | `tools/apply-current-state.mjs` |
| `CardPullList-2026-09-06-rev2.docx` | 19 KB | `tools/import-pull-list.mjs` |

---

## 5 · The simulation

### What it is

`sim-engine.js` is a Monte Carlo model of a four-player Commander game. It is not a rules
engine, and the file says so in its own header — a `SIMPLIFICATIONS` array of fourteen
entries that is copied into every result file the pipeline writes. The headline ones:

- No stack. Spells resolve when cast; counterspells are generic interaction.
- No blocking assignment. Combat damage is total attacking power weighted by a per-creature
  connect rate (0.85 flying/menace, 0.78 trample, 0.70 otherwise), reduced by a
  toughness-weighted estimate plus flat deathtouch (2) and first-strike (1) deterrence.
- Opponents are nine parameterised archetype curves — three power tiers (starter-precon,
  upgraded-casual, tuned-bracket3) and six playstyles (combo, stax, aristocrats, voltron,
  tokens, group-hug) — not simulated decks. Each seat samples a profile from a table mix and
  jitters every number.
- Tokens are extra power on their maker, not separate bodies. Tutors draw the best of three.
  Alternate win conditions score as a large threat, not an instant win.
- The fun/participation score is *one reasonable operationalization of a subjective idea*.

`docs/mechanics-design-v2.2.md` (117 lines) is the methodology write-up for the counters and
combat-keyword work: why each mechanic was modeled the way it was, how keywords are detected
(`card.keywords` first, then a first-line-only oracle-text regex, with the exact false
positive that motivated it), and what was deliberately left out (counter storage/transfer,
vigilance, ward, hexproof).

`docs/simulation-refresh-instructions.md` (118 lines) is a historical brief: a self-contained
hand-off asking for a uniform re-measurement of 30 variants on engine v2.1. The catalog is
50 variants on v2.4 now, so read it as a record of how the protocol was specified, not as
current instructions.

### The protocol

| Thing | Value | Where |
|---|---|---|
| Seeds (published) | `20260904, 20268823, 20276742, 20284661, 20292580, 20300499` | `data/deck-ratings.json` |
| Games per seed | 20,000 | `data/deck-ratings.json`, `deck-measure.js` `FULL` |
| Preview | 1 seed, 2,000 games | `deck-measure.js` `PREVIEW` |
| Opponent table | `mixed-pod` | `sim/config.json`, `sim/opponents.json` |
| Max turns / mulligans | 16 / 3 | `sim/config.json` |
| Land floor / ceiling | 33 / 42 | `sim/config.json` |
| Max swap-in price | $60 | `sim/config.json` |
| Holdout games | 5,000, on seeds the optimizer never saw | `sim/config.json` |
| Ledger backstop | 15,000,000 games | `sim/config.json` `maxLedgerSimulations` |
| Wall clock | 300,000 ms per invocation | `sim/config.json` |
| Convergence | noise margin 1.0, relative gain 5%, patience 6 | `sim/config.json` |

### The score

A 0–100 composite of nine weighted parts, **not** a win percentage. There are three
different weight sets and they are easy to confuse:

| Weight set | winRate | screw | flood | commander | interaction | clock | deadCards | fun | podFun |
|---|---|---|---|---|---|---|---|---|---|
| `sim-engine.js` `DEFAULT_WEIGHTS` | 0.30 | 0.15 | 0.10 | 0.10 | 0.10 | 0.10 | 0.05 | 0.10 | — |
| `sim/config.json` `scoreWeights` (Tuned, Max) | 0.35 | 0.15 | 0.10 | 0.10 | 0.10 | 0.10 | 0.05 | 0.05 | — |
| `sim/config.json` `podFunRungScoreWeights` | 0.20 | 0.15 | 0.10 | 0.10 | 0.10 | 0.10 | 0.05 | 0.00 | 0.20 |

The engine's defaults are the fallback when nothing overrides them; the published numbers
were measured with the config's, which is what `data/simulation-summary.json` and
`data/deck-ratings.json` both report. `sim/config.json` also carries a fourth set,
`funRungScoreWeights`, matching the engine defaults.

Pod Fun additionally holds win rate inside a band — floor 0.30, ceiling 0.45 — with the
ceiling enforced as a hard constraint, and is floored at 75% of its own Tuned power
(`powerFloorRatio: 0.75`).

One more thing to know before trusting any of these figures: **no creature's real power or
toughness went into them.** `data/cards.json` has no such fields, so the engine estimated
every body from mana value. See *Open threads* §12.

### Where the published numbers live

| File | Covers | Engine |
|---|---|---|
| `data/simulation-summary.json` | 50 variants × 4 rungs, plus 47 alt-commander cases | v2.4 |
| `data/deck-ratings.json` | The 6 real decks, per-part breakdowns and standard errors | `sim-engine.js`, seeds and protocol recorded in-file |
| `data/rung-lists.json` | The exact hundred behind every published rung | — |

`data/simulation-summary.json`'s `engineBoundaryNote` is explicit that v2.4 figures are not
comparable with anything published before it, "because the win-rate band alone moves a
dominant deck's score by ten points or more, and that is a change of question rather than a
change of answer." `deck-audit.js` encodes the same rule in code: a score measured in the
browser is never subtracted from a published one.

### The four rungs

Base (cheapest hundred that is still this deck, measured never optimized), Tuned (hill-climbed
for power at Tier 2, $60/card), Pod Fun (same hundred, different question — win rate under 45%
as a hard constraint), Max (hill-climbed again from Tuned's finish at Tier 3, $100/card). Each
rung starts from the hundred the rung below finished at, because two independent hill-climbs
from one list land in different local optima — that is how a Tier 3 Max rung with twice the
budget once came out weaker than the Tuned rung it upgrades.

### The pipeline

```
node tools/sim/sweep.mjs                     # all fifty variants, four rungs each
node tools/sim/bake-ladders.mjs --write      # measured hundreds back into the buy plans
node tools/sim/reprice.mjs --write           # cost figures re-summed from the cards
node tools/sim/bake-sweep.mjs --write        # the published numbers, with caveats
```

`bake-ladders` refuses to write unless composing every rung through `lineup-model.js`
reproduces the exact hundred the sweep measured.

### Runtime files under `sim/`

Only four things are tracked: `sim/config.json`, `sim/opponents.json`, `sim/status.json`
(an idle placeholder), and four `.gitkeep` files. Everything a run produces is ignored. The
working copy currently holds 320 requests, 3,960 results, 1,214 cache entries, 310 sweep
files and a 42 KB `sim-ledger.json` — none of it committed, and a fresh clone will have
none of it.

---

## 6 · Tests

32 Node suites under `tests/`, using only Node built-ins. `runtests.sh` runs them all.

```sh
./runtests.sh -q             # one line per suite, non-zero exit if any fail
./runtests.sh                # the same, with every suite's own output
node tests/sim-engine.mjs    # or one, while working on it
```

Use the script, not a shell loop. The script's own header explains why: `for f in
tests/*.mjs; do node "$f" || echo FAIL; done` exits 0 whatever happens, because the exit
code belongs to the last `echo`. That happened once and something got pushed on the strength
of it.

| Suite | Lines | What it guards |
|---|---|---|
| `asset-versions` | 127 | One `?v=` per file across every page, and a changed file gets a changed version |
| `assignment-model` | 272 | Active vs Assigned: choosing a rung changes Active and nothing else |
| `card-classify` | 160 | The one card vocabulary, re-derived from `cards.json` and checked field-for-field against what `graph.json` already committed |
| `card-link` | 224 | What a link is worth, in what order, and that a link worth nothing still becomes a card |
| `card-resolve` | 244 | The three shapes of a bad name — a typo, an invention, and not-a-card — each answered differently |
| `card-table` | 176 | Faceted counts that never promise rows a click cannot produce; stable tie ordering; no double-counted bands |
| `compliance-model` | 108 | The bracket rules, against the real buy plans and the audited card set |
| `data-integrity` | 1,730 | The baked catalog and the source patterns the app depends on. By far the largest suite |
| `deck-audit` | 200 | Staleness: an edited deck, a rung with no published score, and never cross-engine subtraction |
| `deck-build` | 208 | Generator output mapped onto a store record — driven by the real generator, not a hand-written fixture |
| `deck-generator` | 429 | Quotas, queries, scoring, basics, Tier 3 repair, against the shared Scryfall stub |
| `deck-import` | 190 | The parser, against a genuine 100-card Moxfield export (77 rows, 99 cards, blank line, commander) |
| `deck-measure` | 132 | The in-browser path reproduces the published `deck-ratings.json` numbers exactly, not approximately |
| `deck-sources` | 179 | Archidekt's real response shape; Moxfield's `fetchable: false` and the advice that names the button |
| `deck-store` | 213 | Isolation: the six decks look the same after a merge as before one |
| `docx-writer` | 146 | The ZIP parses, the three OOXML parts are named exactly, two-column section props survive |
| `edhrec-client` | 167 | Inclusion vs synergy field names, against a real trimmed Atraxa response, and the no-page case |
| `friends-deck` | 123 | A real handed-over 100-card export: every real name in the registry and on the graph, and the one non-card answered with real candidates |
| `game-record` | 256 | Restraint — the Wilson interval, and wording that says "cannot tell" rather than printing a difference |
| `import-wiring` | 292 | Which modules each page loads. Browser failures a browser would never throw on |
| `inventory-import` | 274 | The two quiet wrongs: a name truncated at a comma, and a copy allocated twice |
| `lineup-compliance` | 384 | The rungs across all fifty plans, ladder prerequisites, early-combo pairs |
| `manual-cards` | 139 | One request for all of them, exact matches only, promotion into every deck holding one |
| `manual-rung` | 209 | Hand-added cards grafted onto a plan at runtime still compose to a hundred |
| `master-regenerates` | 133 | `master-v2.json` is still a build artifact of the workbook, not a hand-edited document |
| `measure-report` | 202 | The breakdown adds up to the score; rounding never moves it; a re-run says whether the change is real before replacing anything |
| `shop-export` | 171 | Price bands with no gap and no overlap; no empty heading; names a vendor's matcher accepts |
| `sim-engine` | 493 | The engine, its caps, and (line 428) an assertion that the browser never calls an API to simulate |
| `sim-lenses` | 208 | Every figure a lens prints traced back to `deck-ratings.json` |
| `slot-model` | 716 | Price bands, rungs, ownership, `slotFit`, `deckSlots`, `shopRows` against the real plans |
| `user-state` | 231 | A backup covers what a clear destroys, and nothing writes a key the clear would miss |
| `xlsx-writer` | 245 | The workbook opens in openpyxl where available; byte-level checks otherwise |

Shared fixtures: `tests/helpers/stub-scryfall.mjs` (a stand-in Scryfall answering enough
query grammar for the generator to build a real hundred), and under `tests/fixtures/` —
`scryfall/cards.json` (650 KB), `archidekt-deck.json`, `edhrec-atraxa.json`,
`moxfield-mono-red.txt`, `splinter-deck.txt` (the friend's deck), `budget-plan-configs.json`
(215 KB), and `asset-versions.json` (the `?v=` content hashes).

### Browser journeys

`tests/uat/journeys.mjs` (99 KB) drives three personas — a first-timer with empty storage,
somebody a year in with ten added decks and 3,200 cards, and somebody leaving with their
data — across **21 distinct journey labels** at two screen sizes (1400×950 and 390×780).
Every step of every journey is additionally checked for four things: no horizontal overflow,
nothing under a 9.5px type floor, no control without an accessible name, and nothing that
looks selected without saying so.

```sh
python3 -m http.server 8790
node tests/uat/journeys.mjs                  # add --headed to watch it
```

It **skips rather than fails** when Playwright or the server is missing — a missing browser
is a missing tool, not a failing app. `UAT_PLAYWRIGHT` points at a Playwright install
elsewhere, `UAT_BASE` overrides the URL, `UAT_CHROMIUM` the binary. It seeds
`data/active-state.json`'s `state` into localStorage for the returning personas, stubs
Scryfall with real recorded answers from `tests/uat/fixtures/`, and writes screenshots to
`tests/uat/shots/` (git-ignored).

`tests/uat/README.md` is worth reading on its own — it lists, journey by journey, the bugs
each one caught, and explains why testing with a pre-seeded collection had made all of them
invisible.

**Documentation drift found here, and fixed in the commit that added this file:**
`tests/uat/README.md` said "twelve journeys" and `journeys.mjs`'s own header said "six"; the
file contains 21. Both also said "twenty-three suites". Both now say what is true.

---

## 7 · Tools

31 scripts in `tools/` (20 `.mjs`, 11 `.py`) and 19 in `tools/sim/`. **Anything marked ⚠
writes a committed data file** — run it deliberately, review the diff, and re-run the tests.

### `tools/` — importers and one-off migrations

| Script | What it does | When you would run it |
|---|---|---|
| ⚠ `extract_data.py` | Normalizes the two legacy single-file HTML apps into `data/variants.json` and `data/buy-plans.json`. 51 KB, the original extractor | Never again — its inputs are absent (see §11) |
| ⚠ `import_master_v2.py` | `Treys_MtG_Master_v3.xlsx` → `data/master-v2.json` (and touches `card-facts`) | After every workbook change; `tests/master-regenerates.mjs` fails otherwise |
| ⚠ `import_budget_plan.py` | The Win/Fun/Alt ladders out of `MTGDeckDecisionMatrix.xlsx` into `buy-plans.json`; writes the test fixture too | When the decision matrix workbook changes |
| ⚠ `import_summary_metrics.py` | The Summary sheet's per-build simulation results into `simulation-summary.json` | Superseded by `tools/sim/bake-sweep.mjs` |
| ⚠ `import-pull-list.mjs` | The .docx pull list → `data/pull-list.json` (+ `active-state.json`) | When a new pull list is written |
| ⚠ `build_card_facts.py` | Trimmed Scryfall facts for the names `master-v2` uses → `data/card-facts.json` | After a master rebuild |
| ⚠ `build_deck_swaps.py` | Optimizer recommendations trimmed for the viewer → `data/deck-swaps.json` | When new optimizer output arrives |
| ⚠ `build_guide_shapes.py` | Recomputes the arithmetic `shape` block of every deck guide | After a master rebuild — the prose stays hand-written |
| ⚠ `build-my-load.mjs` | The "Load default" payload → `data/my-load.json`, from `active-state.json` or `--from backup.json` | When the shipped default should change |
| ⚠ `commander-universe.mjs` | Rebuilds `data/commander-universe.json`; `--repair` also corrects `graph.json` and backfills rarity onto `master-v2.json` | After a Scryfall bulk refresh |
| ⚠ `compile-game-logs.mjs` | Merges `data/game-logs/*.json` into `data/game-history.json`. Idempotent. `--check` verifies without writing | Run automatically by GitHub Actions |
| ⚠ `apply-deck-master.mjs` | Rewrites `active-state.json` from the Deck Master workbook: which hundred each deck is, and what you own | On a physical audit |
| ⚠ `apply-current-state.mjs` | Rewrites the ownership half of `active-state.json` from the Current State sheet | On an ownership audit |
| ⚠ `apply-deck-truth.mjs` | Rewrites `active-state.json` from an audited "Deck Truth" sheet | Superseded by `apply-deck-master` |
| ⚠ `apply-app-handoff.mjs` | Imports the "App Assignment Handoff" workbook: Active + Assigned + up to five alternatives per slot | On a reviewed rebuild |
| ⚠ `apply-actual-prices.mjs` | Writes the master sheet's Cost column into the paid-price ledger, quantity-weighted | When prices paid change |
| ⚠ `apply-owned-extras.mjs` | The photographed-cards owned list into `buy-plans.json` | Historical one-off |
| ⚠ `apply-card-audit.mjs` | Applies a card audit back into `buy-plans.json` (legality fixes, wrong types) | Paired with `audit-cards.mjs` |
| ⚠ `audit-cards.mjs` | Re-fetches and refreshes every card referenced anywhere in `buy-plans.json` | Periodic full refresh |
| ⚠ `hydrate_new_ladder_cards.mjs` | Narrower than the above: hydrates only the seven newer ladder categories | After an `import_budget_plan` run |
| ⚠ `fix_ambiguous_replaces.mjs` | Neutralizes a `replaces` name that is ambiguous across categories | After an `import_budget_plan` run |
| ⚠ `normalize-price-bounds.mjs` | Fixes a ceiling price that landed below its floor | Rarely |
| ⚠ `resolve-flexible-shells.mjs` | Resolves flexible shell entries in `buy-plans.json` | Historical |
| ⚠ `add-salvage-cards.mjs` | Adds newly acquired cards to the Salvage yard and offers them on slots where they'd do a job (gated on colour identity, not-in-hand, `Slot.slotFit`, shared role) | On acquiring cards |
| ⚠ `reshell-basic-swap.mjs` | Trades one basic land in a variant's starting shell for a real card | When a handoff asks for it |
| ⚠ `seed-manual-rung.py` | Seeds `active-state.json`'s `manualCards`. Needs network | Historical one-off |
| `read-sheet-rows.py` | Dumps one worksheet as JSON rows so a Node tool can read a workbook | As a helper inside other flows |
| `extract_icon_sheet.py` / `extract_rarity_sheet.py` | Split design sprites into `assets/icons/*.png`. Need Pillow | Never, unless the icons change |
| `claude-api-cost.mjs` | Costs three possible Claude features against the real shipped prompts. Estimates tokens; no key needed | To reproduce `docs/claude-api-evaluation.md` |
| `claude-api-grounding.mjs` | Checks offline whether an invented card name can reach the screen, against the 31,830-card registry | Same |

### `tools/sim/` — the simulation pipeline

| Script | What it does | When |
|---|---|---|
| `lib.mjs` | Shared loaders and helpers; `require`s `lineup-model`, `compliance-model`, `sim-engine`, `deck-generator` from the repo root | Imported by all the rest |
| `run-sim.mjs` | **The runner.** Owns every stop condition. Exit codes: 0 continue · 2 swaps rejected · 10 converged · 11 sim cap · 12 iteration limit · 13 wall clock. `--games` may lower a limit, never raise one | The core loop |
| `run-batch.mjs` | Request → pool → baseline → optimize, over several variants | `--variants 5o,1o` or `--all` |
| `make-request.mjs` | Builds a request from a baked variant at one rung | Before a run |
| `fetch-candidates.mjs` | The pool a run may swap in. Scryfall online; the variant's own ladders plus `cards.json` offline | Once per request |
| `sweep.mjs` | Every variant, every rung. `--resume`, `--offline`, `--variant`, `--decks` | The full rebuild |
| ⚠ `bake-ladders.mjs` | Measured hundreds → `buy-plans.json` + `rung-lists.json`. Refuses to write unless composition reproduces the measured list | After a sweep |
| ⚠ `bake-sweep.mjs` | Sweep records → `data/simulation-summary.json`. A null means "not measured", never "assume" | After a sweep |
| ⚠ `bake-result.mjs` | One optimized list → `buy-plans.json`, so it ships instead of living in a browser | After a single-deck run worth keeping |
| ⚠ `build-base.mjs` | Rebuilds every Base rung as the cheapest hundred that is still the deck. `--cap` sets the per-card ceiling | When Base has drifted |
| ⚠ `build-capability.mjs` | Builds the two rungs the sweep could not produce, because at Tier 2 the convergence bar rejected everything | When Enhance/Max render empty |
| ⚠ `promote-tier3.mjs` | Turns Max into an actual Tier 3 build by promoting Game Changers, and measures the cost | When Max composes identical to Tuned |
| ⚠ `repair-tier2.mjs` | Removes Game Changers from rungs published as Tier 2, and re-measures the replacement | After a Game Changer flag correction |
| ⚠ `sync-game-changers.mjs` | Reconciles `cards.json`'s Game Changer flags against Wizards' list (Scryfall `is:gamechanger`, 53 cards) | Periodically; 20 were wrong on first run |
| ⚠ `reprice.mjs` | Re-sums every variant's cost from the cards it actually contains | After any ladder change |
| ⚠ `resync-compare.mjs` | Brings Compare's per-stage counts and notes back in line with the composed hundreds | After `promote-tier3` |
| ⚠ `remeasure-variant.mjs` | Measures what a reviewed shell swap did, without re-optimizing the other 99 slots | After `reshell-basic-swap` |
| `report.mjs` | A readable per-deck report from a batch of results: what was measured, what it recommends, the evidence, and what the model could not see | After a batch |

There is also a `simulate-deck` skill at `.claude/skills/simulate-deck/SKILL.md` that drives
this loop and states the rules a session must not break — chiefly, never edit
`sim/config.json` or `sim/sim-ledger.json` to buy more games, and never re-invoke the runner
after exit code 10–13.

---

## 8 · History and decisions

**This repository keeps its reasoning in prose, and most of it is not in `docs/`.** That is
unusual enough to say plainly: if you want to know why something is the way it is, the
answer is very likely in a module header comment or a commit message, and reading the code
without them will leave you thinking a deliberate choice was an accident.

Four places, in the order worth checking:

1. **Module header comments.** Most files open with 15–30 lines that state the problem, the
   options, the measurement, and what was rejected. `card-resolve.js` explains why not
   TCGplayer (OAuth, no server, nowhere for a secret). `deck-sources.js` records that
   Moxfield answers 403 "to a server and to a browser alike" — measured, not assumed.
   `docx-writer.js` explains why a ZIP writer was hand-rolled. `xlsx-reader.js` explains why
   "just export as CSV" is asking the user to do the app's job.
2. **`BACKLOG.md`** — six deferred decisions, each with the gap, what it would take, and
   *why it is not minor*. Ordered by how much they would change a build night.
3. **`docs/`** — three files: `claude-api-evaluation.md` (311 lines, what an AI feature would
   cost and why a key cannot live in the browser), `mechanics-design-v2.2.md` (117 lines,
   the mechanics modeling rationale), `simulation-refresh-instructions.md` (118 lines, a
   historical protocol brief).
4. **`git log` itself.** 208 commits on `origin/main`. Sixty-seven carry a PR number in
   the subject, of which only **20** are actual merge commits — the rest arrived as squash
   merges, which is why `--merges` undercounts the history badly. Commit bodies are long and
   explanatory — `8f0a0c0` quotes the user complaint that
   motivated the change verbatim before describing the fix.

### Merged PRs

Sixty-seven PR numbers appear in `origin/main` subjects: **#9–#53, #55–#69, #71–#76**, plus
one that is not a pull request at all. Three things to know:

- **#54** is still **open and marked draft** ("Stop the engine reading reminder text as
  rules text"). Its work reached `main` as **#53** instead. Do not read its absence as lost
  work — but do read its body, which is one of the most detailed measurement write-ups in
  the project and contains a live finding (see *Open threads* below).
- **#70** merged without a numbered merge commit: it is `e25d882`, "Build decks from
  nothing…".
- **#80 is not a pull request.** `GET /pulls/80` returns 404. The `(#80)` on `756e4bb`
  ("Make Max a real Tier 3 build instead of a label over Tuned") is a TASK number that ended
  up in a commit subject. Do not go looking for the PR; read the commit.

PRs #1–#8 predate the numbered convention and appear as
`Merge pull request #N from minorrob/claude/...` lines.

⚠ **Local `main` is stale.** `main` points at `f519b8e` (#71) while `origin/main` is at
`c0686fe` (#76). Use `origin/main` or fetch first, or you will conclude that five merged PRs
do not exist.

### The arc of the last ten

Read bottom-up, this is roughly one week of work in which the app grew a second and third
page and then hardened them.

| # | Title | What changed |
|---|---|---|
| **#67** | Add the copilot layer: findings that hand you a filter | The graph stopped being a browser and started making recommendations — lenses over the graph plus deltas read off `deck-ratings.json`. |
| **#68** | Fix three extraction gaps, and the colour filter that hid every artifact | Follow-up bug fixes to the graph's own extraction; a colour filter was excluding every colourless card. |
| **#69** | Guard master-v2.json as a build artifact | Two sessions were editing this repo and a patch crossing between them changed 23,203 lines of generated JSON around 96 lines of decisions. The rule became: exchange the workbook and the code, never the generated JSON — enforced by `tests/master-regenerates.mjs`. |
| **#70** | Build decks from nothing, and hold up on the first visit, at collection scale, and on the way out | The generator, dead since the Choose tab was retired, was wired back in behind a Build panel. In the same PR the browser journey harness arrived, and with it the first-visit and 3,200-card personas that exposed the dead ends the UAT README lists. |
| **#71** | Reconcile the collection, scope the Shop to what is owed, and put the pull list in it | Ownership allocation copy-by-copy, the Shop scoped to shortfall rather than to everything, and the written pull list carried as its own kind of thing rather than pretended to be derived. |
| **#72** | Name the card you came to look at, and read the Copilot for tonight | Focus-by-name on the graph over all 31,830 legal cards, with a card outside the corpus fetched, checked for legality and classified by the same rules the corpus was baked with. Copilot filters by deck, kind and source — folding, never hiding. |
| **#73** | Three doors above My Decks, and a way to put a deck down | Add / Build / Explore moved above the deck list (they held at six decks and stopped holding at sixteen), and Archive arrived — a deck leaves the list and its cards leave the buy total without being deleted. |
| **#74** | One header, one table, and a browser that starts empty | `header.css` and `card-table.js` extracted so three lists stopped giving three answers to "show me the rares I still owe", and Clear session became a real clear — every key enumerated in `user-state.js`. |
| **#75** | Compare is a shelf you stock, and a bad card name is a question | `card-resolve.js`: an unmatched name became a question with candidates instead of a dead end that saved a 99-card deck. |
| **#76** | A link is an answer, a clear stays cleared, and a friend's deck goes in clean | `card-link.js` and `manual-cards.js`: when none of the five guesses is right, a URL becomes the answer — and a card no lookup can place is kept as a manual card and re-asked about later. `tests/friends-deck.mjs` pins a real handed-over export end to end. |

Current branch `claude/mtg-deck-matrix-ui-fixes-f7om91` is one commit ahead of
`origin/main`: `8f0a0c0` "The score, and what it is made of" — `measure-report.js` and
`tests/measure-report.mjs`, breaking the composite score into its nine parts with a timing
receipt. **PR #77 is open** and carries it.

---

## 9 · External references

Every host below was found by grepping the source, not from memory.

### Scryfall — the only card database this app can reach without a key

| Endpoint | Used by | For |
|---|---|---|
| `GET /cards/named?exact=` / `?fuzzy=` | `scryfall-client.js` | One card by name; also `format=image` for art crops and card images |
| `GET /cards/autocomplete?q=` | `scryfall-client.js`, `card-resolve.js` | Name suggestions — rungs 1 and 2 of the resolve ladder |
| `GET /cards/search?q=&order=&unique=&dir=&page=` | `scryfall-client.js`, `deck-generator.js` | Role and theme pools; `is:gamechanger` for the Game Changer list |
| `POST /cards/collection` | `scryfall-client.js`, `manual-cards.js` | Up to 75 identifiers per request — one call for a whole deck |
| `GET /cards/{set}/{collector}` | `scryfall-client.js`, `card-link.js` | An exact printing from a Scryfall card-page URL |
| `GET /cards/tcgplayer/{id}` | `scryfall-client.js`, `card-link.js` | A card from a TCGplayer product id |
| `GET /bulk-data` | `graph/ingest/01-fetch.mjs` | The oracle-cards bulk feed (~30 MB) that the graph corpus is baked from |

**Constraints, all implemented in `scryfall-client.js`:**
- A `User-Agent` is required. The client sends
  `MtgDeckMatrix/1.0 (+https://github.com/minorrob/mtg-deck-matrix)`. **Verified in this
  container:** a request without one returns HTTP 400.
- Requests are serialized through a promise chain with a 120 ms minimum gap.
- 429 and 5xx are retried up to 4 times with exponential backoff (250 ms × 2ⁿ). 404 is a
  result, not an error.
- Answers are cached 24 hours under `mtg-scryfall:` in `sessionStorage`, falling back to an
  in-memory Map when storage is unavailable.

`svgs.scryfall.io/card-symbols/*.svg` supplies mana symbols (`app.js`, `deck-page.js`).
`cards.scryfall.io` appears only in `tests/slot-model.mjs` as image-URL fixtures.

### TCGplayer — link shapes only, no API

The app builds `https://www.tcgplayer.com/product/{id}?page=1` and
`https://www.tcgplayer.com/search/magic/product?q=…` links, and an affiliate wrapper
`https://partner.tcgplayer.com/c/4931599/1830156/21018?subId1=api&u=…`. It reads TCGplayer
product ids *from Scryfall*, never from TCGplayer.

Why no API, stated in `card-resolve.js`: their API needs a client id, a secret and an OAuth
exchange, and this is a static site with no server and no place to keep a secret. That is a
consequence of the architecture, not an oversight.

### EDHREC

`https://json.edhrec.com/pages/commanders/{slug}.json` — per-commander inclusion and synergy
numbers. Used by `edhrec-client.js` (browser, for the generator) and
`graph/ingest/04-fetch-edhrec.mjs` (bake). A commander with no page 404s, which is treated as
"this signal is unavailable", not an error. `edhrec.com/cards/{slug}` is recognised by
`card-link.js` as a slug source.

### Deck sites — measured, not assumed

| Site | Fetchable | Detail |
|---|---|---|
| **Archidekt** | **Yes** | `GET https://archidekt.com/api/decks/{id}/` answers 200 with the full deck, every card carrying its own `oracleCard`. A deck loaded this way needs no name matching and no second round trip. |
| **Moxfield** | **No** | The same request answers 403 — to a server and to a browser alike, not an origin-header problem. There is no URL path; the app recognises the link and gives the export-and-paste instructions instead. |
| **Deckstats** | **No** | No open deck endpoint. Export → Plain text and paste. |

`card-link.js` additionally *recognises* URLs from Card Kingdom, Cardmarket, Moxfield,
CoolStuffInc and EDHREC — for the name in the slug only. It never fetches them.

### GitHub

- Repository: `github.com/minorrob/mtg-deck-matrix`, also the User-Agent's contact URL.
- **GitHub Pages:** `https://minorrob.github.io/mtg-deck-matrix/` appears in the OG/Twitter
  image tags of `index.html` and `matrix.html`, and `.nojekyll` is present with the comment
  "Static site; no Jekyll build required." Pages is clearly the intended host. **Not
  verified** that it is currently serving.
- **Actions:** one workflow, `.github/workflows/compile-game-logs.yml`. Triggers on pushes
  touching `data/game-logs/**.json`, `tools/compile-game-logs.mjs` or the workflow itself,
  plus `workflow_dispatch`. Runs Node 22, executes `tools/compile-game-logs.mjs`, and commits
  `data/game-history.json` back as `github-actions[bot]` if it changed. `contents: write`.

### Others

- `cdnjs.cloudflare.com/ajax/libs/cytoscape/3.30.2/cytoscape.min.js` — the only external
  script on any page, loaded `async` on `graph.html`. The comment records why: a deferred
  script blocks every deferred script after it, and an unreachable CDN once held the whole
  page for 12.7 seconds.
- `fonts.googleapis.com` / `fonts.gstatic.com` — Fraunces and Inter, loaded via
  `media="print"` + `onload` so they never block first paint. Both stacks name real system
  fallbacks. Measured at 12.5 seconds of blank page when loaded the ordinary way on a
  connection that could not reach Google.
- `magic.wizards.com` — referenced in prose for the Game Changer list and bracket rules.
- `api.anthropic.com` — discussed in `docs/claude-api-evaluation.md` only, and
  `tests/sim-engine.mjs:428` asserts the app source never mentions it.
- `neo4j:5.26-community` with the APOC plugin — `graph/docker-compose.yml`, local only, at
  `:7474` / `:7687` with credentials `neo4j / mtggraph`. The graph runs on your machine; the
  app consumes an export of it.

---

## 10 · Environment notes

### Serving the app locally

```sh
python3 -m http.server 8790        # what tests/uat/journeys.mjs expects (UAT_BASE overrides)
python3 -m http.server 8000        # what the Simulate screen polls sim/status.json from
```

Any static server at the repository root will do. `file://` will not — the pages fetch
`data/*.json`.

### Node and Python

Verified present here: Node **v22.22.2**, Python **3.11.15**. The Node suites need nothing
else. Two Python tools (`extract_icon_sheet.py`, `extract_rarity_sheet.py`) need Pillow;
`tests/xlsx-writer.mjs` uses openpyxl when available and falls back to byte-level checks.

### Playwright

Verified present at `/opt/node22/lib/node_modules/playwright/index.js`, with a Chromium build
at `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`.

```sh
python3 -m http.server 8790 &
UAT_PLAYWRIGHT=/opt/node22/lib/node_modules/playwright/index.js node tests/uat/journeys.mjs
```

`journeys.mjs` finds the container Chromium by scanning `/opt/pw-browsers` for
`chromium-<number>` rather than pinning a build, deliberately, so an image bump does not
quietly turn "the browser moved" into "the app is fine".

### Network, in a sandboxed container

Two different rules, and mixing them up wastes an hour.

**Chromium cannot reach the outside world.** Verified by launching the container Chromium and
`fetch`-ing from a page: `api.scryfall.com`, `fonts.googleapis.com` and
`cdnjs.cloudflare.com` all threw *Failed to fetch*. So in this environment the UAT journeys
see no card images, no web fonts and no Cytoscape — which is exactly why the graph loads
Cytoscape `async` and says so when it is missing, and why the journeys stub Scryfall from
`tests/uat/fixtures/`. A journey that failed because somebody else's site was slow would be
a journey people learn to ignore.

**Node reaches the outside world through the agent proxy**, and needs two variables plus a
User-Agent. All three verified:

```sh
NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt node tools/...
```

| What was run | Result |
|---|---|
| `fetch` with both variables + User-Agent | 200, real card back |
| `fetch` with neither variable | **403** from the proxy |
| `fetch` with both variables, no User-Agent | **400** from Scryfall |

Never disable TLS verification or unset `HTTPS_PROXY`; see `/root/.ccr/README.md`.

### The Neo4j graph

`docker compose -f graph/docker-compose.yml up -d`, run **from the repository root** because
the ingest scripts read `data/master-v2.json` by relative path. About five minutes end to
end, most of it the Scryfall bulk download. `graph/README.md` has the full command sequence.
`--commanders` on the export step is not optional despite the name: without it the corpus
drops to 4,902 cards, an imported deck arrives with a commander the graph has never heard
of, and `tests/deck-import.mjs` fails.

---

## 11 · What is NOT in the repo

Verified absent. Do not go looking.

- **The original spreadsheet the whole thing started from.** `tools/extract_data.py` reads
  `../MtG - Side-by-Side.html` and `../MtG - Deck Shopping Plan.html` — one directory above
  the checkout. Both absent; the parent directory contains only this clone. So
  `data/variants.json` and `data/buy-plans.json` cannot be regenerated from scratch, only
  patched by the later tools. `payload/` (9 chunks) and `payload_v3/` (4 chunks) hold
  base64-gzip of a 1.27 MB and a 466 KB HTML page titled *"Deck Variant Matrix — All Six
  Slots"* — almost certainly those legacy apps, or an ancestor. Nothing in the repo
  references either directory.
- **Any API key, anywhere.** No `.env`, no key file, no key in any script. The two
  Claude-cost tools estimate tokens by character count precisely because there is no key to
  call `count_tokens` with, and `tests/sim-engine.mjs` asserts the app source never mentions
  `api.anthropic.com` or `ANTHROPIC_API_KEY`.
- **`package.json`, `node_modules`, any lockfile.** By design.
- **The raw sweep output.** `sim/requests/`, `sim/results/`, `sim/cache/`, `sim/sweep/` and
  `sim/sim-ledger.json` are all git-ignored; only `.gitkeep` files are tracked. A fresh clone
  gets `sim/config.json`, `sim/opponents.json` and an idle `sim/status.json` and nothing
  else. The published numbers in `data/` are the durable record.
- **`six-optimized.json`**, named as the source of `data/deck-swaps.json`. Absent. Its
  generator comment says the full lists "stay in the scratchpad deliverable for anyone
  rebuilding" — that scratchpad is not here.
- **Game logs.** `data/game-logs/` holds only its README, and `data/game-history.json` is an
  empty shell: 0 games, 0 source files. The Game Log's read-back path has never had real
  data to read.
- **UAT screenshots.** `tests/uat/shots/` is git-ignored and regenerated every run.
- **Neo4j's database.** `graph/.data/`, `graph/.import/` and `graph/.cache/` are ignored by
  `graph/.gitignore`. They exist in this working copy but are not part of the repository.
- **A CLAUDE.md or contributor guide.** There is none. The house style has to be read off
  the code and the commit messages.

---

## 12 · Open threads

### Explicitly deferred — `BACKLOG.md`

Six items, ordered by how much they would change a build night rather than by effort. Item 2
is struck through as shipped.

1. **Autosave to a file you can see.** Everything lives in localStorage until Export is
   pressed, and Export is a habit that fails on the night you were concentrating. The File
   System Access API would let the file *be* the state — but Safari and Firefox do not
   support it, and it changes where the truth lives, so Load Active, Import and Reset all
   have to mean something coherent against a continuously written file. Shipped in the
   meantime: a one-shot undo for a load, and a header chip saying how long since the last
   export.
2. ~~**"Three cards you own could fill this slot"**~~ — **shipped.** `Slot.slotFit` ranks a
   candidate on type, then what the card is FOR, then cost, with colour identity as a gate
   rather than a score. Still open inside it: it ranks against the loose pool only, and does
   not consider what removing a card does to the curve or the colour sources (see item 5).
3. **A pull sheet for building at the table.** The Deck page is organised by the deck's
   structure; physically pulling a hundred cards wants them ordered the way they are sitting
   in boxes. Needs a new view with print styles and a second way of ticking that agrees with
   the first.
4. **Copies as things, not counts.** Ownership is a number per card name. Which four Sol
   Rings, what condition, which is foil, which box, which is lent out — none of it can be
   said. Every count in the app reads a number today; making copies real means every one of
   them reads a list.
5. **Curve and role coverage in the readiness strip.** The strip answers *is it legal* and
   *can it cast itself*, not *is it a functioning deck*. `sim-engine.js` already classifies
   every card into roles and `tests/lineup-compliance.mjs` already asserts floors against
   them — the numbers are computed and nothing shows them. The obstacle is that sim-engine is
   a Node-oriented module of 1,370 lines, so it means shipping it to the browser or
   maintaining a second copy, and this repo has already paid for one of those.
6. **What changed since I last sleeved this deck.** Needs a remembered "as sleeved" snapshot
   per deck, which is new state with its own lifecycle: when is it taken, when is it stale,
   what happens when a card leaves the collection.

### In flight

- **PR #77, "The score, and what it is made of"**, is open and is the current branch's one
  commit ahead of `origin/main`. It adds `measure-report.js` and `tests/measure-report.mjs`.
- **`docs/claude-api-evaluation.md` §6** proposes a concrete next step that has not been
  taken: write `tools/build-deck-guides.mjs`, generate guides for the 44 variants that have
  none (six of fifty have one today), about $1, reviewed as a diff. `guideFor()` already
  renders them; nothing else would change.

### One live finding, recorded only inside an unmerged PR body

PR #54's description flags something that is still true and is not written down anywhere
else in the repository. **Verified today:**

- `data/cards.json` carries **power and toughness for none of its 1,972 cards** — the fields
  simply are not in the schema.
- `sim-engine.js` therefore falls back to `estimatePower` / `estimateToughness`
  (lines 177–192), which guess a creature's body from its mana value:
  `max(1, round(cmc × 0.9))`, +1 for trample/double strike/menace, −2 power and +2 toughness
  for defender.
- So **every published measurement in this repo — the fifty-variant sweep, the ladders, the
  six deck ratings — estimated every creature's size rather than reading it.**

`data/card-facts.json` does carry real printed figures, but only partially: **62 rows** in it
have `power`/`toughness` populated, and only **60** of those are creatures — the other two are
Vehicles (Rocketeer Boostbuggy, Unlicensed Hearse), which have a printed body and become
creatures when crewed. Against 326 creatures in the file, that is under a fifth. (PR #54's body says the facts file
has the figures "for all 579 names the six decks use"; that is not what the file holds
today.) Feeding real bodies into the engine would be a genuine improvement and would move
every number for a second reason at once, which is exactly why it was deliberately left
alone. Anyone planning to touch scoring should decide about this first.

### Drift and inconsistencies found while writing this

None of these break anything. All are worth knowing before you trust a number in prose.

Everything marked **fixed** was corrected in the commits that landed this file; it is kept
here so the next reader can see what kind of thing goes stale in this repository, and check
whether it has again.

| Where | Said | Actually | State |
|---|---|---|---|
| `README.md`, `tests/uat/README.md`, `tests/import-wiring.mjs`, `graph/README.md` | the graph corpus is **7,710** cards | `data/graph.json` `counts.cards` is **7,764** | **fixed** |
| `tests/uat/README.md`, `journeys.mjs` header | "twelve journeys" / "six journeys", "twenty-three suites" | 21 journey labels; 33 suites | **fixed** |
| `data/simulation-summary.json` `caveats.note` | "The six decks **My** actually plays…" | a find-and-replace artifact where a name should be | **fixed** |
| `og.png` | "Compare · Buy Picks · Shop List" | those two tabs were retired in PR #14. It is the `og:image` on both `index.html` and `matrix.html`, so every share of the site shows them. `tests/data-integrity.mjs` forbids the names in prose and cannot see inside an image | **open** — needs the image regenerating |
| `README.md` | Pod Fun over the 45% ceiling is "all six" ★ builds | `caveats.podFunOverCeiling` has **15** entries, of which the six are a subset | open |
| The two catalogs | — | The Matrix's ★ picks include Betor (1b) and Purphoros (3o); `master-v2.json` has Felothar (D4) and Krenko (D6). Four of six commanders agree; two do not | open, and not verified as a bug rather than a deliberate divergence |
| local `main` | at #71 | `origin/main` was at #76 when this was written. Read `origin/main`, not `main` | a trap, not a bug |

`data/deck-swaps.json` also names a source file (`six-optimized.json`) that is not in the
repository, and `data/game-history.json` is an empty shell that no committed game log has
ever filled. Neither is a fault — they are places where the record stops.

## Review-branch addition · September 7, 2026

Prepared for the CrankMagic design review. Production application integration is
now authorized; simulator work is explicitly on hold. See
`docs/crankmagic-build-status.md` for the implementation boundary and remaining work.

| Path | Ownership and provenance |
|---|---|
| `data/commander-glossary.json` | Single editable glossary authority: 335 term definitions and aliases, rule references, revision metadata, and separately labeled subjective workbook ratings. Seeded from the user's glossary workbook, corrected/expanded against Wizards' rules. Edit directly; no source/override merge or automatic re-import. |
| `docs/glossary.md` | Editorial authority, consumers, contextual term matching, hover/focus/touch behavior, asset provenance and integration boundary. |
| `tools/check-glossary.mjs` | Node-only structural validation for IDs, aliases, source references and the single-authority contract. Run directly; not yet added to the production suite runner. |
| `assets/mana/{W,U,B,R,G,2,3}.svg` | Unmodified Scryfall mana symbols prepared for offline display. Not yet referenced by production pages. |
| `design/crankmagic/evaluations.md` | Astra's simulator, pilot, optimization, collection, architecture, UX and AI assessment, linked to the detailed review findings and measured verification. |
