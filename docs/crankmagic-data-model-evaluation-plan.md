# CrankMagic data model and data architecture: the evaluation plan

Rob's instruction of 14 September 2026: before the two major enhancements (the Trace
animation, the Tabletop view), make sure the application has a **clean, intelligent,
flexible, reliable and defined** data model. This is the plan for evaluating what is there,
naming what is missing, and sequencing the fixes. It evaluates; it changes nothing. Each
finding it produces becomes a PR of its own with a test that pins it.

## 1. What "the data model" is, in this application

Seven layers, each with an owner module, a shipped artefact, and (mostly) a test:

| Layer | Owner | Artefact | Pinned by |
|---|---|---|---|
| **Library state** — decks, slots, lots, groups, reports, games, advice, imports, preferences | `collection-model.js` (pure; `VERSION` 2, `migrate`, `apply`, `validate`, `projection`, `readiness`, `matrix`) | IndexedDB `crankmagic-library` (schema 1: state, journal, meta, cache) via `collection-repository.js` | `tests/collection-model.mjs`, `assignment-model`, `slot-model`, `user-state`, `deck-store` |
| **Exchange** — backups, imports, exports | `collection-exchange.js`, `inventory-import.js`, `xlsx-*`, `docx-writer.js` | `crankmagic-backup` v1 (SHA-256), Library sheets, CSV/TSV | `collection-exchange`, `inventory-import`, `xlsx-writer`, `docx-writer` |
| **Card identity and facts** | `card-catalog.js` (`key`, `folded`, `normalize`), `card-resolve.js`, `card-link.js`, `scryfall-client.js`, `card-classify.js` | `data/cards.json`, `data/card-facts.json`, `data/flavor-names.json`, per-card `roles/causes/…` | `card-resolve`, `card-link`, `card-classify`, `manual-cards`, `card-images` |
| **The graph** | `graph-payload.js`, `crankmagic-graph.js` (`relateTerms` at draw time), `crankmagic-loops.js`, `crankmagic-facets.js` | `data/graph.json` (format 2: 31,830 cards, 701,916 co-play pairs, 21 roles, events, supplies) | `graph-payload`, `crankmagic-graph`, `crankmagic-loops`, `crankmagic-facets` |
| **Live load** — the Master workbook's truth | `tools/build-live-load.mjs`, `tools/build-live-state.mjs`, `crankmagic-workbook.js` | `data/live-load.json` (format/version), `data/live-state.json` (a backup) | `live-load`, `crankmagic-workbook`, `master-regenerates`, `data-integrity` |
| **Simulation** | `sim-engine.js`, `deck-measure.js`, `measure-report.js`, `sim-lenses.js`, `compliance-model.js`, `lineup-model.js` | `sim/config.json`, `sim/opponents.json`, `data/simulation-summary.json`, `data/deck-ratings.json`, reports in state | `sim-engine`, `deck-measure`, `measure-report`, `sim-lenses`, `compliance-model`, `lineup-compliance` |
| **Shipped reference data and versioning** | `crankmagic-assets.js`, `crankmagic-sw.js`, `tests/asset-versions.mjs` | every `data/*.json` and every served file with `?v=` | `asset-versions`, `data-integrity`, `service-worker` |

Plus the legacy layer (`data/active-state.json`, `data/buy-plans.json`, `data/my-load.json`,
`data/base-rebuild.json`, `data/pull-list.json`, `data/archive/*`, `prototype/`) whose page
readers were retired with the old pages; the files stay in the repo as inputs to tools and tests.

## 2. The five words, as tests

Each of Rob's five adjectives becomes a question the evaluation answers with evidence, not
opinion.

**Defined.** Is every entity's shape written down in one place, with its invariants, and
does the code enforce them? Today: `docs/crankmagic-architecture.md` states the collection
invariants in prose; `validate()` enforces some; the graph card shape, the live-load shape
and the report shape are defined only by their producers. *Measure:* for each artefact, a
JSON Schema (or a `validate` function) exists, is run in a test on the committed file, and
the doc links to it. Gap count = artefacts without one.

**Clean.** Is each fact stored once, named once, and read from one place? Known
duplications: the status vocabulary lives in `statusOf` (Cards page), `PILL_KIND` (app
shell), the readiness bar's segments and now the deck page's Cards tab; `graph.json` carries
`own / ordered / bench` fields that are stale by design (the facets read the state instead);
`roles` exist both in `state.cards[*].roles` (catalog) and `graph.cards[*].roles`
(re-derived), with the classifier as a third source at render time; three `deckMechanics`
readers. *Measure:* a table of every fact with more than one home, and which is
authoritative.

**Intelligent.** Does the model know what the app knows? Derived facts should be computed
from rules, not typed: Primary Purpose (ladder), loops (cycle finder), readiness (model),
legality (model) already are; strategies per commander (Trace), grouping definitions
(Tabletop), the join → strategy mapping and the status vocabulary are not yet. *Measure:*
the list of facts still hand-maintained that a rule could derive, with the rule.

**Flexible.** Can the model take a new deck, a new user, a new status, a new grouping, a
new data source without a schema break? Evidence for: `apply` is command-based and
versioned; groups are generic; `SOURCES/PLANNED/CHANNELS/PURPOSES` are closed lists in one
place. Evidence against: `cheapLine()` hard-codes `D5/D6`; `art()` hard-codes four commander
files; `GC_LIMIT` is a constant in a view module; the deck-page composition type list is a
literal; `hero` art and the tile's fan know Rob's decks. *Measure:* grep for deck ids,
commander names and literal thresholds outside `data/` and `crankmagic-rules.js`; each is a
finding.

**Reliable.** Does the data survive: migrations, quota failures, concurrent tabs, a damaged
record, a stale cache, a version bump missed? Evidence for: revision-checked commits, undo
snapshots, checksummed backups, the asset-version manifest, the 10,000-lot validation check,
the journeys' quota-abort and concurrency steps. Open: no property-based test of `apply`
(random command sequences must keep `validate` true and `readiness` totals conserved); no
round-trip test state → backup → import → state on every command type; no test that
`migrate` from schema 1 fixtures reaches the same state the builder produces; cache
invalidation of `data/graph.json` relies on a manual bump. *Measure:* each of those tests
exists or is a finding.

## 3. Method

1. **Inventory** (one session). A generated table of every artefact: file, size, producer
   tool, consumers (grep), version field, schema/validator, tests that read it, last
   regenerated. Script it (`tools/data-inventory.mjs`) so it stays true. Include the legacy
   files and mark each *serve · archive · delete*.
2. **Entity catalogue** (one session). For state, graph card, live-load deck/card, report,
   game, group entry: every field, its type, its source (typed · imported · derived · cached),
   its invariants, its readers. Written as JSON Schema drafts under `schema/` and rendered
   into the architecture doc. Where two schemas disagree (catalog card vs graph card vs
   live-load card), say which is canonical and how the others derive.
3. **Invariant sweep** (one session). Turn the prose invariants of the architecture doc
   into a checklist; for each, point at the test that pins it or write the missing one
   (property-based `apply` sequences; conservation of copies across every command; the
   readiness bar's segments summing to the hundred; projection ⇄ matrix ⇄ readiness
   agreement, which `tests/collection-model.mjs` already checks in part).
4. **Duplication and hard-coding sweep** (half a session). The clean/flexible greps of §2,
   with a proposed single home for each duplicated fact and a rule or config entry for each
   literal.
5. **Failure drills** (one session, browser). Quota abort mid-commit, two tabs racing,
   restoring a backup from schema 1, a damaged native record, a stale service-worker shell
   with a new `graph.json`, offline start. The journeys cover four; write the other two.
6. **Report** (`docs/data-model-evaluation-2026-09.md`): findings ranked by risk × reach,
   each with the fix, its size, and the test that will pin it; then the sequence.

## 4. Fixes already visible, to be confirmed by the sweep

Named now so the evaluation checks them rather than rediscovers them:

- **One status vocabulary** in the model (`M.STATUS`: id, label, tone, order, `placementOf`
  / `statusOf`), read by the Cards list, the pills, the readiness bar, the deck page, and
  later the Tabletop. Removes three copies.
- **One groupings module** (`crankmagic-groupings.js`: key, label, sub-group rule, order)
  shared by the sheet's *Group rows by*, the list's bands and the Tabletop's dropdown.
- **`crankmagic-rules.js` absorbs the literals**: `GC_LIMIT` per bracket, the "cheap line",
  the per-card and deck caps (already there), the composition type order, the loop-length
  cap. Deck-specific art moves to data (`definition.art` or the commander's catalog image).
- **Schemas under `schema/`** for state, backup, live-load, graph card, report, game, with a
  `tests/schemas.mjs` that validates the committed files and a sample state; the
  architecture doc links each.
- **`graph.json` drops `own / ordered / bench`** (stale by design; the facets read the
  state) and gains a `schema` field; the amplifiers tool writes `amplifiersAt` already.
- **Card identity**: one documented rule for `card:` ids (base64url of the NFKC-folded
  name), flavor names and double-faced names, with the resolver's tests as the spec; the
  graph, the catalog and the live-load builder all cite it.
- **Legacy files**: `active-state.json`, `buy-plans.json` (8 MB), `my-load.json`,
  `base-rebuild.json`, `pull-list.json`, `game-history.json`, `lenses.json` and
  `data/archive/*` are fetched by no served module (checked 14 September: their only
  readers are `slot-model.js` and `sim-lenses.js`, which the pages do not load, and the
  Node tools and tests). The service worker does not precache them, so they cost nothing
  at page load; they cost clone size and clarity. Decide per file: keep as a tool input
  (say so in `data/README`), move under `data/archive/`, or delete with the commit that
  records where it came from — and update the tests that still read it
  (`lineup-compliance`, `master-regenerates`, `data-integrity`) in the same PR.
- **Reliability tests**: property-based `apply`; backup round trip per command type;
  migrate-from-schema-1 fixture; a service-worker test that a `graph.json` bump evicts the
  old data cache.

## 4a. Progress

- **E0 shipped (14 September, PR #174):** `tools/data-inventory.mjs` generates
  `docs/data-inventory.md` and the generators suite checks it; the findings and the ranked
  recommendations (critical changes, improvements, the one-record-many-lenses simplification,
  scalability and flexibility) are in `docs/data-model-evaluation-2026-09.md` §1–§3.
- **Critical 6 shipped (PR #175):** the journeys answer Scryfall from the shipped catalog; the
  gate no longer depends on a third party.
- **Critical 3 shipped (PR #177):** `data/graph.json` is out of the precache and split from
  the co-play pairs (`data/graph-played.json`); both load on the first Discover visit behind a
  status line and are kept by the worker on demand. The install precaches 5.1 MB of data
  instead of 41.6 MB.

## 5. Sequence and sizing

E0 inventory → E1 entity catalogue and schemas → E2 invariant sweep and the reliability
tests → E3 the two vocabularies (status, groupings) and the rules absorption → E4 graph and
legacy-file hygiene → E5 the report. Five to six sessions at the pace of Phases A–C, each
its own PR, each leaving every suite green. The Trace and Tabletop plans both list the
items they depend on (E3 for the Tabletop, the edge and node properties in the Trace plan
for the Trace); those land inside this sequence, not before it.

## 6. What this plan does not do

It does not change storage technology (IndexedDB stays; the persistent-app plan covers a
server), does not re-open the simulator's protocol, and does not touch the Master workbook.
