# CrankMagic

**An Intelligent MtG: Commander Deck Creator & Card Libary**

A private Commander deck workshop and card library. Plan a deck, review its composition
and commander, track exactly which prints you own, reserve copies, receive orders,
assemble physical decks, explore card relationships, and manage Sell / Trade records.

Dark blue/graphite, Satoshi, a local wand/gear logo and animated aether mist. Semantic
left-aligned tables support sorting, filtering, grouping, chosen columns and compact
Actions menus. Navigation remains reachable while scrolling and on a phone.

Plain HTML, CSS and JavaScript. No package.json, build step, runtime framework,
application server or account. User records live in transactional browser IndexedDB;
full JSON backups, reviewed CSV/text/XLSX imports and enriched Excel exports give the
user control of their data. Loading a plan never asserts ownership.

## Run

```sh
python3 -m http.server 8790
```

Open `http://localhost:8790/`. Serve the same files on HTTPS for production. Opening
application HTML as `file://` does not provide the required origin/fetch/storage behavior.
The approved standalone mockup remains under `design/crankmagic/` for design reference.

## Application

Every page opens on its name, with one primary action and at most three beside it; the
rest of a page's actions sit under **More**, and what the page does and how its figures are
counted sit behind its **?**. The nav reads **Decks · Cards · Build · Discover**: Collection
and Shop are one page, **Cards**, with tabs *Library · To buy · Orders* and the Spreadsheet as
its *Sheet* view; `#collection` and `#shop` still open it. The nav opens the page you are on:
under **Cards** its four sub-pages (Library · To buy · Orders · Sheet, with counts), under
**Decks** your decks and the How page, the current one marked. Glossary underlines in rules text are off until **Show term
definitions** (deck page More menu, card pop-up) turns them on for the library.

- **Decks** (`#decks`): plans and assembly status. A deck page is five tabs on the route
  (`#decks?deck=…&tab=cards|guide|upgrades|history`): **Overview** — the hero, the Progress and
  Cost card and one *Next:* line in the order the work happens; **Cards** — the hundred by type
  with where each copy stands, the composition at its head; **Guide** — the commander, the
  strategy and structural SWOT; **Upgrades** — the working list and the Upgrade Path;
  **History** — the game record and every measured run. The hero row is the work (Ready to
  add, Buy list, Log a game, Measure, More); on a phone the three work actions are a fixed bar
  at the foot of the screen. Compare, finalize, lock and archive as before. Each
  tile wears its stage — Defining, Building, Playable, Complete — and one caption that says
  each figure once. A plain link on the page, **How a deck comes together** (`#how`), is a one-screen
  map: six steps as a flow (the first split between building one in Build and
  bringing a list you already have, meeting at Test), each title opening where that step
  begins, and the card status ladder in order with what each word means.
- **Cards → Library** (`#cards`): exact printing lots, requirements, groups and planned lists.
  **Status** is one column — *Physical deck · Substitute · Reserved · Bench* for owned copies,
  *Ordered*, *Watched*, *To buy*, *Draft list · Suggestion · Planned* for rows that are not
  copies yet — where Source and Allocation were two (both stay in the Columns dialog); the
  colour is the state. Each row carries the one verb its status calls for (Bought, Arrived,
  Put in, To bench, Reserve…) and ⋯ for the rest. Purpose and physical location are separate. The counts row reads, in the order
  a deck is built and each under its state's colour, *Reserved · Owned · Substitutes ·
  Physical Deck · Ordered · To Buy · Watched*; on every deck Reserved = Owned + Ordered + To
  Buy, Owned counts reserved copies, the Bench (owned copies no deck has reserved) is the
  table itself and the caption under the row, and Sell / Trade is a Bench flag, never a
  count held against a deck (the equation itself is behind the page's **?**). Five filters
  are in view — type, mana, colour, status, deck — with search and group beside them, and **More filters** folds
  subtype, mechanic, flags, offers, mana value and price, opening itself whenever one of
  them is set. Clear filters leaves the deck
  flow and shows all collection records. Every row's **Actions → Status** fly-out carries
  the ladder a card climbs before it is in hand — *Watched* (considering it), *Ordered*
  (bought, or a trade arranged; the record carries the channel), *Owned* — with the current
  rung marked and *Delete* at the bottom. On a copy record it changes the source; on a
  deck's *To buy* requirement, a draft deck's *Draft list* row or a group's planned card it
  creates the copy at that rung, filed with the deck or group and reserved to its slot once
  the deck is finalized. Above Owned the ladder continues as placement: *Bench* (an owned
  copy's default), *Reserved* to a deck, and *Physical deck* once it is physically sleeved.
  Moving an owned copy back down clears its box and, below Ordered, its reservation, and
  asks first. Every row carries its one obvious verb as a button — *Bought* / *Ordered* on
  a To buy row, *Arrived* on an ordered copy, *Put in Dn* on an owned copy reserved but
  not in its box, *Reserve…* on an unassigned bench copy, nothing on a copy already in its
  box — and the menu behind *Actions* is four sections: Status, Where it is, Plan, Record,
  with Sell / Trade under the rule. Active filters show as removable chips under the search
  with *Clear all*; the Columns dialog also holds *One row per card* (the Shop's default: a
  card three decks want is one line, `×3 · D2, D3, D5`, and *Bought* on it buys for all
  three) and the page size (60 / 120 / All), remembered with the columns. Rows are 56 px
  with the purpose as an inline chip, the card art appears beside the name on hover instead
  of a thumbnail, and pagination repeats above any table longer than one page. The same ladder runs over ticked rows (*Set status*) and over a whole deck
  from its page (*Card status*). Every deck has a collection group, made with it; a deck
  saved from the Lab arrives as a draft whose cards sit in that group at *Draft list* until
  their status is set. Group-by band headers fold, and the toolbar filters by group. A deck card's row also carries the two slot flags: **Pin** keeps it whatever the Lab or a swap suggests; **Flag as option** marks it as the first to come out when a card has to leave the hundred (the row wears an *Option* chip, the deck page lists them under *Working list*, the Lab drops them first, and a filter finds them). Setting one clears the other; neither moves a copy. The filter panel's **Mana** select narrows rows to mana rocks, dorks, lands, basics or ramp spells, by the same reading Discover uses.
- **Cards → Library → Sheet** (`#cards?view=sheet`): the Master sheet read from the library. One row per card;
  Own, Ordered, Bench and To buy across it; for every deck a *T* column (how many the list
  wants) and an *A* column (how many are physically in its box, with a small *+n* where more
  are reserved than sleeved). Click a number and type the new one: a plain raise of Own or
  Ordered saves on the spot, and anything that takes a copy from somewhere goes through the
  review dialog first. A raised *T* reserves free copies and takes reserved ones from other
  decks (they stay in their boxes until pulled, and those decks' Ready to add lists say so); an *A*
  typed to 1 releases the copy from wherever it was, reserves it here and puts it in this
  box, recording a new owned copy when the library holds none. The copies rule holds
  throughout: one of a card per deck except basics and the cards whose text allows more.
  *T* is what the deck's list claims (Reserved), *A* is what is physically in the deck; a
  small *ˢn* on an *A* cell counts that card's substitutes there, Bench counts copies in no
  physical deck at all, and *Show → Substitutes in a physical deck* lists them. Enter commits and moves down,
  Tab moves right, Escape puts the number back, the arrow keys walk the cells, and *Export
  CSV* writes the rows in the Master's column order, *A* being what is physically in the box,
  substitutes included, like the Master's Actual.
- **Discover**: navigable metadata/co-play graph, mouse-wheel zoom, keyboard neighbors,
  pan, back trail, card inspection and supplemental catalog lookup. The pane beside the
  graph has two tabs: **Card Info** (the focused card, its terms, *Add/Buy*) and **List**
  — every card the focus reaches at the widest depth and breadth, whatever the sliders say,
  under the same filters; sortable by its headers, paged, a tick per row for *Add selected
  to a group* or a draft deck, *Add/Buy* on each row, and a row click opens the card in
  Card Info without moving the graph. In Inspect mode a tap on a node opens the **card
  pop-up** beside it: the picture at large size, type, cost, rarity, set and price, the
  Primary Purpose chip and *Joined to ‹focus› by* — its full term list is under **Inspect
  card** as *Terms the graph reads*. In Card Info, the pop-ups and a List row's detail, the
  term with the **gold ring** is the card's *Primary Purpose* — the one job it is in a deck
  for, decided by a fixed ladder in `card-classify.js` (`purposeOf`: finisher, extra turn,
  board wipe, multiplier, untap engine, copier, blink, team quality, tutor, sacrifice outlet,
  removal, draw, ramp, token maker, payoff, … body, tribe). The loop vocabulary — roles
  `untap`, `copy`, `blink`, `counter-removal`, `extra-turn`, `cost-reduction` and the
  `tap-ability` mechanic — is read from rules text like every other term and re-derived over
  the whole graph with `node tools/graph-amplifiers.mjs --all`. A filter dialog's counts are what the filters already applied leave
  (`CrankFacets.narrowedCounts`), the whole-graph figure on the hover; the **Yours** filters
  wear the owned green, picking a deck there puts its commander in focus, and dragging the
  divider grows the card picture up to 70 %. **Loops only** (on by default when a deck is
  picked under Yours) walks only the joins that continue or pay off a loop — an untap, copy or
  blink onto a tap ability worth another go, a repeatable supply into a demand, an event one card
  causes and another fires on — and **Loops this card is in** lists every cycle of four cards or
  fewer through the focus (`crankmagic-loops.js`), each step named, missing pieces dashed, with
  the cards that pay it off. Sol Ring is on no loop: a rock's tap makes mana and nothing a loop
  feeds on, and mana loops wait for cost accounting. The pane widens while List is open; in presentation
  mode the list keeps name, type and mana. The **Filters** bar groups the facets by what they ask about — Card (type, color, mana value, mana: rocks, dorks, lands, basics, ramp spells, rarity), Rules, Lands, Yours — and each opens its options in a dialog over the page, A to Z with a search box, so picking a filter never shifts the page; *Lands only* is a toggle in the bar; the badge on a facet counts its picks.
- **Build** (the Deck Lab, `#lab`): any legal catalog commander by name or mechanics/EDHREC commander rank;
  optional second commander; an existing list/group; separate Deck Definition; real
  initial construction under price/copy limits. The user reviews and finalizes the list.
- **Cards → To buy** (`#cards?tab=buy`): the buy list with money on it — price, cap (sheet price under $2, 110% above,
  local store first at $5 and over), vendor, deck and paid on every row at every width; a
  strip above the table with the count, the total at sheet prices, what is ordered and
  unpaid and what is left of the season's pool, then the three price bands; rows grouped
  by deck with a subtotal per band. A card moves *buy → ordered → arrived* from the row:
  **Bought** on a To buy row, **Arrived** on an ordered copy, one tap each (Ordered is in the
  row's Status ladder and the ticked-rows bar),
  stamping the sheet price as what was paid (marked *catalog* until a receipt says
  otherwise). Export carries price, cap, vendor and the subtotals; *Print buy list* prints
  it by deck. **Ready to add** opens a deck's Ready to add list. Tick rows and **Ordered…** takes
  one dialog (vendor, reference, shipping spread across the lines, expected date) for the
  whole order; **Bought in store** does the same with the store as vendor and the copies
  arriving at once; **Arrived** lands ticked ordered copies. The **Orders** tab
  (`#cards?tab=orders`) is one row per order — paid including shipping, arrived count, the
  house-rule markers (over $30, over the 110% cap, ≥ $5 not local) as counts — with
  *Arrived → bench* (one change, one undo, reservations kept), *Paste receipt* (an order
  confirmation or CSV, matched by name, applied to the lines it names and marked *receipt*;
  also Import list → *Order confirmation*), *Edit* and *Lines*.
- **Ready to add** (`#pull?deck=`): one deck's reserved copies grouped by where they are —
  pull from bench, move from another deck — plus the **substitutes** in this deck, colour then
  name inside each, with *In box* / *Move here* / *To bench* per row, a tick that records
  the walk as it happens, *Select all* beside a group's count (the whole group in one
  revision), *Mark all added*, Print (black on white, boxes to tick) and
  Export. A substitute is any owned copy physically in a deck that the list does not call
  for: it fills a seat while the real card is bought or on its way, so the deck is playable
  before it is finished. Nothing marks it; being in the box without a reservation is what it
  is. The sheet says how many can come out now (a real copy is ready to take the seat, or the
  deck holds more substitutes than empty seats) and which fill seats until their cards arrive;
  *Mark all found* puts the ready copies in and takes exactly that many substitutes out. The
  Collection puts a copy in as a substitute from **Actions → Put in a physical deck as a substitute**
  (a copy the list does call for is reserved on the way in instead), the *Allocation* filter
  has *Substitute*, tiles read *Playable · n substitutes* once the physical deck holds a
  hundred, and the readiness bar hatches the seats substitutes cover. Tiles wear their stage
  as a border: green while *Defining*, blue while *Building*, purple once *Playable*, gold
  when *Complete*. The deck page's Overview shows In
  physical deck · Substitutes · Ready to add · Ordered · To buy and $ to finish against the cap,
  with a readiness bar and the *Next:* line; *Ready to add (n)* leads the action row when there is
  anything ready to add. The **Upgrade Path** panel on the Upgrades tab lists the deck's linked upgrades
  as *Add · Replaces · Tier · Price · Why · Promote* with *Tuned only* and *Under $2*
  (D5–D6: $1.50) filters, `$X to Max` and `GC k / 2` in its header; *Promote* is the
  existing accept-option review, which asks first when it would be a third Game Changer.
  A **budget card** under the hero — `$ to finish (base)`, `Paid so far` (≈ when an owned copy has no
  recorded price and the list price stands in), `Market value · %
  of cap` with a bar (amber past 90 %, red past 100 %), `Game Changers k / 2`, lines paid
  over the 110 % cap — reads the same lots and prices as the Shop strip. Deck Definition
  shows the standing caps ($225 total, $30 a card) as placeholders and writes them when the
  field is left blank. **Log a game** records the date, finish in a pod of n, bracket, the
  card that won it and the dead card in hand (pickers limited to the deck); the **Record**
  card reads it back — W–L, win rate with its n, paid per win, the Wilson interval from
  `game-record.js` ("too few games to tell" under eight decided games) and the last ten
  games — and tiles carry `3–1` once games exist.
- **User Functions**: backup/restore, Load Live, enriched workbook export, legacy
  reconciliation, history/undo, comparison reset, optional mirror file and explicit Clear all.
- **Simulation reports carry their hundred.** A report filed from the Lab or the deck page
  records the exact list it measured. In the Lab, a draft that started from an existing deck
  offers *File report with <deck>* after measuring: the report joins that deck's history and
  any measured card the deck neither lists nor holds physically becomes a planned card in the
  deck's group (Watched, nothing more). On the deck page, a report's *Spin off as a new deck*
  makes that hundred a finalized deck of its own with the same commander, the report copied
  with it; the original deck is untouched.
- **Share** (beside Take a Tour): *Subscribe to updates* opens a mail draft to the maintainer
  asking to be added to the update list, *Share by e-mail* opens a draft with the subject and
  body written and the To line left blank, and *Show a QR code* draws the app link as a QR
  code in the page (`crankmagic-qr.js`, no network, checked module for module against segno
  in `tests/qr.mjs`) for a phone to scan at the table.

### Load Live

`data/live-load.json` is the owner's collection written as a file a person can read: the
six deck targets, what is physically in each deck, the bench, orders in flight, the
outstanding buy list with prices, the Upgrade Path cards with the slot each replaces, and
per deck the two working lists — `options`, cards in the hundred flagged as the first to
swap out, and `planned`, cards meant to come in that are not in the hundred yet (double-faced
cards use their full `Front // Back` Scryfall name). It is **built from the Master
workbook**, not edited by hand: `node tools/build-live-load.mjs data/source/<Master>.xlsx`
reads the Master sheet by header name (`Own`, `Buy Count`, `Ordered`, `$ Each`, `D1-T…D6-T`,
`D1-A…D6-A`), the Deck Lists sheet for commanders, the Upgrade Path sheet, and an optional
`CrankMagic Plans` sheet (Deck, Kind, Card, Why) for the two working lists; names,
definitions, notes and the working lists are carried over from the committed file for any
deck the workbook does not restate. It prints the per-deck delta against the committed
file and refuses a workbook whose deck targets do not sum to 100 or whose names the
catalog cannot resolve. `data/source/CrankMagic-Load-Live-template.xlsx` is the same
layout with nothing else on it, for a collection kept somewhere other than the Master.

`node tools/build-live-state.mjs [--scryfall cache.json]` then turns the file into
`data/live-state.json`, a complete CrankMagic backup in the app's own format, built through
the collection model and validated: every deck owns a collection group, in-box copies are
reserved to their deck, bench and ordered copies are reserved to whichever deck still needs
them, options become slot flags, planned cards become entries in the deck's group (or file
a free copy there), upgrades are filed under an "Upgrade Path" group and attached to the
slot they replace with their tier, price and reason, the buy list is checked against the
shortfalls the model derives, and every price the committed state already held is kept.
`node tools/scryfall-cache.mjs` fetches the rules text, prices and images the bundled
catalog lacks for those cards. **Actions → Load Live** on GitHub runs all of it by hand on
the newest workbook under `data/source/` and commits both files. **User Functions → Load
Live** in the app asks for the load password (`treycmload1`, a latch against accidents, not
a lock: the file and the word are both public), fetches that file fresh, and runs the
normal restore path on it; Undo restores the previous library. The same file also restores
through **Restore from a backup file** with no password.

`index.html` is the main shell; `crankmagic.html` is the same compatibility entry.
`graph.html` opens Discover. Those three are the whole app.

The earlier measurement workspace — `matrix.html`, `legacy-decks.html` and
`legacy-graph.html`, with `app.js`, `viewer.js`, `graph-page.js` and `shop-page.js`
behind them — was retired once CrankMagic covered its ground; nothing linked to it and
it had stopped being tested against the live data. Its historical guide is
[docs/legacy-readme.md](docs/legacy-readme.md), and the browser records it left behind
are still folded into every backup by `user-state.js`, so an old library is not stranded.

## Simulator hold and evidence

**The simulator is being developed in another session. Its engine, policies, protocol,
inputs and baked measurements are unchanged by this application build.** The new Lab
creates an initial metadata-based draft; it does not claim optimized or simulated scores.
Later simulation steps visibly wait for integration. Bracket, playstyle, saltiness and
custom restrictions remain review targets during the hold; price/copy constraints are
applied to initial construction and price limits are checked again on final acceptance.

Reports can be imported for the current or a retained version of a deck. They keep exact
list/protocol/version provenance; comparison deltas require matching declared conditions.
Historical swap suggestions and structural alternatives are labeled with their evidence.
They are proposals, not a guarantee of improvement. Advice uses exported request/imported
response packs; no key, paid call or recurring token spend is required.

For the retained engine only, `node tests/sim-engine.mjs` checks its existing behavior.
Its batch runner is `tools/run-batch.mjs`; see the legacy README and simulator handover
for its invocation. Do not launch or change simulator development during the current hold.

## Data and reliability

Owned, ordered and incoming lots are distinct from derived To buy requirements. A physical
copy has one current allocation and one last-confirmed location. Accepting a replacement
can re-reserve the released owned copy to another deck, while still showing its old box.
Archive releases allocations but preserves the plan and physical history. Sell / Trade
membership does not dispose of a card. Explicit sale/trade-out does.

Multi-tab revisions, atomic writes/undo, import previews, duplicate-batch checks, checksummed
backups and a separate damaged-record recovery path protect against silent inventory drift.
A backup is still necessary: browser deletion/eviction is outside the app's control.
The app works offline after its public assets are cached; uncached lookups/images require
connectivity. The graph (about 37 MB: the card terms and the co-play pairs) is not part of the
install: Discover fetches it on its first visit behind a status line, and the worker keeps it. New installations of the offline cache wait for old tabs to close.

EDHREC commander ranks are a separately dated [Top Commanders](https://edhrec.com/commanders)
**Past 2 Years** snapshot, distinct from Scryfall card rank. `tools/commander-ranks.mjs`
refreshes it. The glossary has one authority: `data/commander-glossary.json`. Its
underlines are off by default (`preferences.terms`); the text is the same either way.
Public card requests go to Scryfall; private library records, backups and games are not
uploaded. See the [architecture and schema handover](docs/crankmagic-architecture.md)
for modules, invariants, services, formats, migrations, offline limits and provenance.

## Verify before pushing

```sh
bash runtests.sh -q
node tools/check-glossary.mjs
node tools/build-live-load.mjs --check    # newest data/source/*Master*.xlsx → live-load, report only
node tools/build-live-state.mjs --check   # live-load → live-state, report only
# With the server above still running and Playwright available:
node tests/uat/journeys.mjs
```

`UAT_PLAYWRIGHT` can point to Playwright's index.js; `UAT_CHROMIUM` can select a browser
binary. The browser runner executes the production assembly/recovery journeys and the
retained 459-check legacy suite at desktop and phone widths. `tests/page-budget.mjs` holds
every page to a word, control and explainer budget before its first table or list, on the
committed live library at 1400 and 390 (`PAGE_BUDGET_REPORT=1` prints the measurements). It fails rather than
reporting a pass when a browser or server is missing. Node tests need no runtime package
installation. Workbook tests optionally use `XLSX_PYTHON` with openpyxl for independent
spreadsheet verification. See [tests/uat/README.md](tests/uat/README.md).

`data/cards.json` is the Card record set — one entry per card with its identity, printed facts, shown
printing, one dated price and the classifier's terms — and `tools/build-card-records.mjs` is its one
producer (`--add "Name"` fetches a card from Scryfall; `--check` proves the committed files are what a
rebuild would write); `data/card-facts.json` and the graph's card block derive from it. The library
(schema 3) references the record: a card the record set carries is stored as its identity alone and
read through the catalog, so a change to the record reaches every library; a card the record set
does not carry is kept whole, because the library is the only copy.
Every data file under `data/` and `sim/` opens with `{schema, stamp, generator, count}`;
`schema/index.mjs` registers each one with its producer and the tool whose `--check` vouches for
it, `schema/*.json` describes its shape, and readers pass what they fetch through
`CrankAssets.expect()`. Changed assets require a new `?v=` everywhere referenced, then
`node tests/asset-versions.mjs --update`. There are 59 Node suites:

- `asset-versions` — `tests/asset-versions.mjs`
- `assignment-model` — `tests/assignment-model.mjs`
- `browser-geometry` — `tests/browser-geometry.mjs`
- `card-classify` — `tests/card-classify.mjs`
- `card-records` — `tests/card-records.mjs`
- `card-images` — `tests/card-images.mjs`
- `card-link` — `tests/card-link.mjs`
- `card-resolve` — `tests/card-resolve.mjs`
- `card-table` — `tests/card-table.mjs`
- `collection-exchange` — `tests/collection-exchange.mjs`
- `collection-model` — `tests/collection-model.mjs`
- `combat` — `tests/combat.mjs`
- `compliance-model` — `tests/compliance-model.mjs`
- `copy-merge` — `tests/copy-merge.mjs`
- `crankmagic-core` — `tests/crankmagic-core.mjs`
- `crankmagic-facets` — `tests/crankmagic-facets.mjs`
- `crankmagic-graph` — `tests/crankmagic-graph.mjs`
- `crankmagic-loops` — `tests/crankmagic-loops.mjs`
- `crankmagic-rules` — `tests/crankmagic-rules.mjs`
- `crankmagic-sim` — `tests/crankmagic-sim.mjs`
- `crankmagic-workbook` — `tests/crankmagic-workbook.mjs`
- `data-integrity` — `tests/data-integrity.mjs`
- `deck-audit` — `tests/deck-audit.mjs`
- `deck-build` — `tests/deck-build.mjs`
- `deck-generator` — `tests/deck-generator.mjs`
- `deck-import` — `tests/deck-import.mjs`
- `deck-measure` — `tests/deck-measure.mjs`
- `deck-sources` — `tests/deck-sources.mjs`
- `deck-store` — `tests/deck-store.mjs`
- `docx-writer` — `tests/docx-writer.mjs`
- `edhrec-client` — `tests/edhrec-client.mjs`
- `friends-deck` — `tests/friends-deck.mjs`
- `game-record` — `tests/game-record.mjs`
- `generators` — `tests/generators.mjs`
- `graph-payload` — `tests/graph-payload.mjs`
- `guide-agent` — `tests/guide-agent.mjs`
- `guide-measured` — `tests/guide-measured.mjs`
- `inventory-import` — `tests/inventory-import.mjs`
- `lab-report` — `tests/lab-report.mjs`
- `library-references` — `tests/library-references.mjs`
- `lineup-compliance` — `tests/lineup-compliance.mjs`
- `live-load` — `tests/live-load.mjs`
- `manual-cards` — `tests/manual-cards.mjs`
- `manual-rung` — `tests/manual-rung.mjs`
- `master-regenerates` — `tests/master-regenerates.mjs`
- `measure-report` — `tests/measure-report.mjs`
- `page-budget` — `tests/page-budget.mjs`
- `pilot-policy` — `tests/pilot-policy.mjs`
- `qr` — `tests/qr.mjs`
- `scryfall-timeout` — `tests/scryfall-timeout.mjs`
- `schemas` — `tests/schemas.mjs`
- `service-worker` — `tests/service-worker.mjs`
- `shop-export` — `tests/shop-export.mjs`
- `sim-engine` — `tests/sim-engine.mjs`
- `sim-lenses` — `tests/sim-lenses.mjs`
- `slot-model` — `tests/slot-model.mjs`
- `tour` — `tests/tour.mjs`
- `user-state` — `tests/user-state.mjs`
- `xlsx-writer` — `tests/xlsx-writer.mjs`

## Design and execution record

- [Current implementation status](docs/crankmagic-build-status.md)
- [The persistent-app plan](docs/crankmagic-persistent-plan.md) — accounts, per-user sync and crankmagic.com on a hosted runtime; plan only, not started
- [The Discover / loop plan](docs/crankmagic-discover-loop-plan.md) — Primary Purpose, loop vocabulary, loop edges and loop-mode depth, the role lens; PR A and B shipped, C–D planned
- [Loop patterns](docs/crankmagic-loop-patterns.md) — the combo, loop, stacking and blink shapes the graph should recognise, in the classifier's vocabulary
- [Architecture](docs/crankmagic-architecture.md)
- [Keeping the catalog current](docs/crankmagic-refresh.md) — what a periodic refresh regenerates, in what order, and what it must never do
- [Approved plan and standalone mock](design/crankmagic/README.md)
- [Astra's simulator/application evaluations](design/crankmagic/evaluations.md)
- [Held simulator improvement plan](design/crankmagic/simulation-fidelity-plan.md)
- [Original project map and design history](docs/handover-index.md)

Work stays on a branch. Release review uses a draft pull request; nothing merges into main
automatically. Application test success is not a claim of human-calibrated simulation.
