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
  flow and shows all collection records.
- **Discover**: navigable metadata/co-play graph, mouse-wheel zoom, keyboard neighbors,
  pan, back trail, card inspection and supplemental catalog lookup.
- **Play Lab**: any legal catalog commander by name or mechanics/EDHREC commander rank;
  optional second commander; an existing list/group; separate Deck Definition; real
  initial construction under price/copy limits. The user reviews and finalizes the list.
- **Shop**: acquisition and assembly views, partial orders/receipts, source corrections,
  deck placement, donor-copy review and export of the filtered list.
- **User Functions**: backup/restore, enriched workbook export, legacy reconciliation,
  history/undo, comparison reset, optional mirror file and explicit Clear all.

`index.html` is the main shell; `crankmagic.html` is the same compatibility entry.
`graph.html` opens Discover. `matrix.html`, `legacy-decks.html` and `legacy-graph.html`
retain the earlier measurement workspace and its separate browser records during the
simulator hold. Its historical guide is [docs/legacy-readme.md](docs/legacy-readme.md).

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
`node tests/asset-versions.mjs --update`. There are 39 Node suites:

- `asset-versions` — `tests/asset-versions.mjs`
- `assignment-model` — `tests/assignment-model.mjs`
- `card-classify` — `tests/card-classify.mjs`
- `card-images` — `tests/card-images.mjs`
- `card-link` — `tests/card-link.mjs`
- `card-resolve` — `tests/card-resolve.mjs`
- `card-table` — `tests/card-table.mjs`
- `collection-exchange` — `tests/collection-exchange.mjs`
- `collection-model` — `tests/collection-model.mjs`
- `compliance-model` — `tests/compliance-model.mjs`
- `crankmagic-core` — `tests/crankmagic-core.mjs`
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
- `guide-agent` — `tests/guide-agent.mjs`
- `import-wiring` — `tests/import-wiring.mjs`
- `inventory-import` — `tests/inventory-import.mjs`
- `lineup-compliance` — `tests/lineup-compliance.mjs`
- `manual-cards` — `tests/manual-cards.mjs`
- `manual-rung` — `tests/manual-rung.mjs`
- `master-regenerates` — `tests/master-regenerates.mjs`
- `measure-report` — `tests/measure-report.mjs`
- `pilot-policy` — `tests/pilot-policy.mjs`
- `shop-export` — `tests/shop-export.mjs`
- `sim-engine` — `tests/sim-engine.mjs`
- `sim-lenses` — `tests/sim-lenses.mjs`
- `slot-model` — `tests/slot-model.mjs`
- `user-state` — `tests/user-state.mjs`
- `xlsx-writer` — `tests/xlsx-writer.mjs`

## Design and execution record

- [Current implementation status](docs/crankmagic-build-status.md)
- [Architecture](docs/crankmagic-architecture.md)
- [Approved plan and standalone mock](design/crankmagic/README.md)
- [Astra's simulator/application evaluations](design/crankmagic/evaluations.md)
- [Held simulator improvement plan](design/crankmagic/simulation-fidelity-plan.md)
- [Original project map and design history](docs/handover-index.md)

Work stays on a branch. Release review uses a draft pull request; nothing merges into main
automatically. Application test success is not a claim of human-calibrated simulation.
