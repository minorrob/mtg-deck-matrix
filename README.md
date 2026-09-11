# CrankMagic

**An Intelligent MtG: Commander Deck Creator & Card Libary**

A private Commander deck workshop and card library. Plan a deck, review its composition
and commander, track exactly which prints you own, reserve copies, receive orders,
assemble deck boxes, explore card relationships, and manage Sell / Trade records.

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

- **My Decks**: plans and assembly status; commander image/rules, composition, strategy,
  structural SWOT, recommendations, game history, compare, finalize, lock and archive.
- **Collection**: exact printing lots, requirements, groups and planned lists. Source,
  purpose, reservation and physical location are separate. Clear filters leaves the deck
  flow and shows all collection records. Every row's **Actions → Status** fly-out carries
  the ladder a card climbs before it is in hand — *Watching* (keeping an eye on it),
  *Wanted* (on the to-buy list), *Ordered* or *Incoming trade*, *Owned* — with the current
  rung marked and *Delete* at the bottom. On a copy record it changes the source; on a
  deck's *To buy* requirement, a draft deck's *Draft list* row or a group's planned card it
  creates the copy at that rung, filed with the deck or group and reserved to its slot once
  the deck is finalized. Above Owned the ladder continues as placement: *Bench* (an owned
  copy's default), *Reserved* to a deck, and *In deck box* once it is physically sleeved.
  Moving an owned copy back down clears its box and, below Ordered, its reservation, and
  asks first. Every row carries its one obvious verb as a button — *Bought* / *Ordered* on
  a To buy row, *Arrived* on an ordered copy, *Put in Dn box* on an owned copy reserved but
  not in its box, *Reserve…* on an unassigned bench copy, nothing on a copy already in its
  box — and the menu behind *Actions* is four sections: Status, Where it is, Plan, Record,
  with Sell / Trade under the rule. The same ladder runs over ticked rows (*Set status*) and over a whole deck
  from its page (*Card status*). Every deck has a collection group, made with it; a deck
  saved from the Lab arrives as a draft whose cards sit in that group at *Draft list* until
  their status is set. Group-by band headers fold, and the toolbar filters by group.
- **Discover**: navigable metadata/co-play graph, mouse-wheel zoom, keyboard neighbors,
  pan, back trail, card inspection and supplemental catalog lookup.
- **Deck Lab**: any legal catalog commander by name or mechanics/EDHREC commander rank;
  optional second commander; an existing list/group; separate Deck Definition; real
  initial construction under price/copy limits. The user reviews and finalizes the list.
- **Shop**: the buy list with money on it — price, cap (sheet price under $2, 110% above,
  local store first at $5 and over), vendor, deck and paid on every row at every width; a
  strip above the table with the count, the total at sheet prices, what is ordered and
  unpaid and what is left of the season's pool, then the three price bands; rows grouped
  by deck with a subtotal per band. A card moves *buy → ordered → arrived* from the row:
  **Bought** and **Ordered** on a To buy row, **Arrived** on an ordered copy, one tap each,
  stamping the sheet price as what was paid (marked *catalog* until a receipt says
  otherwise). Export carries price, cap, vendor and the subtotals; *Print buy list* prints
  it by deck. **Deck assembly** opens a deck's pull sheet. Tick rows and **Ordered…** takes
  one dialog (vendor, reference, shipping spread across the lines, expected date) for the
  whole order; **Bought in store** does the same with the store as vendor and the copies
  arriving at once; **Arrived** lands ticked ordered copies. The **Orders** tab
  (`#shop?tab=orders`) is one row per order — paid including shipping, arrived count, the
  house-rule markers (over $30, over the 110% cap, ≥ $5 not local) as counts — with
  *Arrived → bench* (one change, one undo, reservations kept), *Paste receipt* (an order
  confirmation or CSV, matched by name, applied to the lines it names and marked *receipt*;
  also Import list → *Order confirmation*), *Edit* and *Lines*.
- **Pull sheet** (`#pull?deck=`): one deck's reserved copies grouped by where they are —
  pull from bench, move from another box, remove from this box — colour then name inside
  each, with *In box* / *Move here* / *To bench* per row, a tick that records the walk as
  it happens, *Mark all found in box*, Print (black on white, boxes to tick) and Export.
  The deck page's stat row shows In box · To pull · Ordered · To buy and $ to finish against
  the cap, with a readiness bar; *Pull sheet (n)* leads the action row when there is
  anything to pull. The **Upgrade Path** panel under SWOT lists the deck's linked upgrades
  as *Add · Replaces · Tier · Price · Why · Promote* with *Tuned only* and *Under $2*
  (D5–D6: $1.50) filters, `$X to Max` and `GC k / 2` in its header; *Promote* is the
  existing accept-option review, which asks first when it would be a third Game Changer.
  A **budget card** under the hero — `$ to finish (base)`, `Paid so far`, `Market value · %
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

### Load Live

`data/live-load.json` is the owner's collection written as a file a person can edit: the
six deck targets, what is physically in each deck box, the bench, orders in flight, the
outstanding buy list with prices, and the Upgrade Path cards with the slot each replaces
(double-faced cards use their full `Front // Back` Scryfall name). `node
tools/build-live-state.mjs` turns it into `data/live-state.json`, a complete CrankMagic
backup in the app's own format, built through the collection model and validated: in-box
copies reserved to their deck, bench and ordered copies reserved to whichever deck still
needs them, upgrades filed under an "Upgrade Path" group and attached to the slot they
replace, and the buy list checked against the shortfalls the model derives. **User
Functions → Load Live** asks for the load password (`treycmload1`, a latch against
accidents, not a lock: the file and the word are both public), fetches that file fresh,
and runs the normal restore path on it; Undo restores the previous library. The same
file also restores through **Restore from a backup file** with no password.

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
connectivity. New installations of the offline cache wait for old tabs to close.

EDHREC commander ranks are a separately dated [Top Commanders](https://edhrec.com/commanders)
**Past 2 Years** snapshot, distinct from Scryfall card rank. `tools/commander-ranks.mjs`
refreshes it. The glossary has one authority: `data/commander-glossary.json`.
Public card requests go to Scryfall; private library records, backups and games are not
uploaded. See the [architecture and schema handover](docs/crankmagic-architecture.md)
for modules, invariants, services, formats, migrations, offline limits and provenance.

## Verify before pushing

```sh
bash runtests.sh -q
node tools/check-glossary.mjs
node tools/build-live-state.mjs --check   # after editing data/live-load.json
# With the server above still running and Playwright available:
node tests/uat/journeys.mjs
```

`UAT_PLAYWRIGHT` can point to Playwright's index.js; `UAT_CHROMIUM` can select a browser
binary. The browser runner executes the production assembly/recovery journeys and the
retained 459-check legacy suite at desktop and phone widths. It fails rather than
reporting a pass when a browser or server is missing. Node tests need no runtime package
installation. Workbook tests optionally use `XLSX_PYTHON` with openpyxl for independent
spreadsheet verification. See [tests/uat/README.md](tests/uat/README.md).

Changed assets require a new `?v=` everywhere referenced, then
`node tests/asset-versions.mjs --update`. There are 52 Node suites:

- `asset-versions` — `tests/asset-versions.mjs`
- `assignment-model` — `tests/assignment-model.mjs`
- `browser-geometry` — `tests/browser-geometry.mjs`
- `card-classify` — `tests/card-classify.mjs`
- `card-images` — `tests/card-images.mjs`
- `card-link` — `tests/card-link.mjs`
- `card-resolve` — `tests/card-resolve.mjs`
- `card-table` — `tests/card-table.mjs`
- `collection-exchange` — `tests/collection-exchange.mjs`
- `collection-model` — `tests/collection-model.mjs`
- `combat` — `tests/combat.mjs`
- `compliance-model` — `tests/compliance-model.mjs`
- `crankmagic-core` — `tests/crankmagic-core.mjs`
- `copy-merge` — `tests/copy-merge.mjs`
- `crankmagic-facets` — `tests/crankmagic-facets.mjs`
- `crankmagic-graph` — `tests/crankmagic-graph.mjs`
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
- `guide-agent` — `tests/guide-agent.mjs`
- `guide-measured` — `tests/guide-measured.mjs`
- `inventory-import` — `tests/inventory-import.mjs`
- `lab-report` — `tests/lab-report.mjs`
- `lineup-compliance` — `tests/lineup-compliance.mjs`
- `live-load` — `tests/live-load.mjs`
- `manual-cards` — `tests/manual-cards.mjs`
- `manual-rung` — `tests/manual-rung.mjs`
- `master-regenerates` — `tests/master-regenerates.mjs`
- `measure-report` — `tests/measure-report.mjs`
- `pilot-policy` — `tests/pilot-policy.mjs`
- `service-worker` — `tests/service-worker.mjs`
- `scryfall-timeout` — `tests/scryfall-timeout.mjs`
- `crankmagic-rules` — `tests/crankmagic-rules.mjs`
- `shop-export` — `tests/shop-export.mjs`
- `sim-engine` — `tests/sim-engine.mjs`
- `sim-lenses` — `tests/sim-lenses.mjs`
- `slot-model` — `tests/slot-model.mjs`
- `tour` — `tests/tour.mjs`
- `user-state` — `tests/user-state.mjs`
- `xlsx-writer` — `tests/xlsx-writer.mjs`

## Design and execution record

- [Current implementation status](docs/crankmagic-build-status.md)
- [Architecture](docs/crankmagic-architecture.md)
- [Keeping the catalog current](docs/crankmagic-refresh.md) — what a periodic refresh regenerates, in what order, and what it must never do
- [Approved plan and standalone mock](design/crankmagic/README.md)
- [Astra's simulator/application evaluations](design/crankmagic/evaluations.md)
- [Held simulator improvement plan](design/crankmagic/simulation-fidelity-plan.md)
- [Original project map and design history](docs/handover-index.md)

Work stays on a branch. Release review uses a draft pull request; nothing merges into main
automatically. Application test success is not a claim of human-calibrated simulation.
