# The data model, evaluated — September 2026

The report `docs/crankmagic-data-model-evaluation-plan.md` asked for, written phase by phase.
**E0 (the inventory) is done**; E1–E5 append to this file as they land. Everything here is
measured on the repository at the date of the section; the inventory table itself is
generated (`docs/data-inventory.md`, `tools/data-inventory.mjs`, checked by the generators
suite) so it cannot go stale without the suite saying so.

Rob's question for this report, asked on 14 September: *what are the critical changes, the
recommended improvements — including simplification along the lines of one record, many
lenses — and how do we strengthen scalability and flexibility?* §3 answers it, ranked.

---

## 1. E0 — what the inventory found (14 September)

36 tracked artefacts under `data/` and `sim/`: 28 JSON, 8 workbooks and documents, 57.4 MB.

| Finding | Measured | Why it matters |
|---|---|---|
| **The worker precaches 41.6 MB of data on every install**, 36.4 MB of it `data/graph.json`. | `crankmagic-sw.js` DATA list; inventory *Precached* column | A first visit on a phone downloads the whole graph before Discover is ever opened; a bump of `graph.json` re-downloads it. The comment in the worker still says "7.1 MB". *Fixed in #177: the worker precaches 5.1 MB of data; the graph (15.8 MB of card terms) and the co-play pairs (`data/graph-played.json`, 20.6 MB) are fetched on the first Discover visit behind a status line, then kept in the data cache.* |
| **Card facts live in four shapes**: `data/cards.json` (2,025 catalog records), `data/card-facts.json`, the 31,830 `graph.json` cards, and `state.cards` inside every library. | inventory rows; `tests/…` readers | Each is produced by a different tool on a different day and none references the others. |
| **They already disagree.** Catalog records carry **no roles** (the graph carries them for all 31,830, so the app re-derives at render through `card-classify.js`); **1,656 of 2,025** cards priced in both files show a **different price** (catalog stamped 09-10, graph 09-11); the live library's cards disagree with the graph on roles for **40 of 752** (baked before the loop vocabulary of #168 — `copy`, `cost-reduction` are missing). | `scratchpad/drift.cjs` over the committed files | A deck page's Ramp count, a Cards table price and Discover's chips can each be right by their own file and wrong by another's. Phase D's role lens would count from the stale set. *Fixed in #179: the record carries the classifier's terms, derived once by the builder with the bake's own call, and the graph's terms equal them for all 2,131 records.* *Fixed in #180: a library card the record set carries is stored as a reference (schema 3) and its facts are read off the record; the drift cannot recur.* |
| **Every library duplicates the catalog.** `state.cards` holds 48 fields per card including the rules text: 122 KB of oracle text in the six-deck backup. | `data/live-state.json` payload | A ban-list, price or vocabulary change has to be re-applied inside every user's state; backups carry facts that are not the user's. |
| **12 JSON files carry no version field, 9 no timestamp**, among them the served `cards.json`, `card-facts.json`, `commander-ranks.json`, `commander-universe.json`, `flavor-names.json`. | inventory summary | A reader cannot tell what shape it has, or how old it is; "Card data 3 days old" in the sidebar is read from one file's stamp. *Fixed in #178: all seventeen registered files open with `{schema, stamp, generator, count}` and validate against `schema/*.json`; the five left without a version field are the archive and the stub recommendation 10 removes.* |
| **106 of the 668 `card-facts.json` entries name cards `cards.json` does not carry** (and 5 more name a double-faced card by its front face). | `tools/build-card-records.mjs --check` (#178) | The two files were never one record: the facts file was keyed by the legacy viewer and kept cards the catalog never took in, so a name can open a picture pop-up and still be unknown to the Lab and the Cards page. Critical 1 builds both from one record; until then the check reports the count on every run. *Fixed in #179: adopted as records; the facts table is now a projection the builder writes.* |
| **Producers were not declared.** The scan finds a writing tool for 9 of the 15 served files by proximity of a write call; six (`deck-guides`, `deck-ratings`, `simulation-summary`, `live-state`, `sim/*`) write through a `--write` flag and a variable path or are kept by hand, and had to be declared in the inventory tool to appear at all; `deck-swaps.json` has none. Of 68 tools, 7 have a check mode the generators suite can run. | inventory *Producer* column; `tests/generators.mjs` CHECKABLE | The generators suite exists because a committed number whose generator cannot run is a number nobody can reproduce; most served files are still in that state. *Fixed in #178: `schema/index.mjs` names the producer and the checking tool of every registered file, `generator` is written into each file, and the generators suite runs every check.* |
| **Five legacy files sit beside the live ones** (`active-state.json`, `buy-plans.json` 7.9 MB, `my-load.json`, `base-rebuild.json`, `pull-list.json`) and one served file is an empty stub (`deck-swaps.json`, 152 bytes, precached). | inventory dispositions | Clone weight, and a reader has to know which of two similar names is live. |
| **The journeys hit the real Scryfall API.** No stub was installed; a full run saw a 429 and every deck-page render waited the client's 10 s timeout. *Fixed in #175: the journeys use the walks' stub; 180 checks in 132 s instead of ten minutes.* | #171's diagnosis | The gate that guards every PR depended on a third party's rate limit. |

Read against Rob's five words: the model is **reliable** where it is command-based and
pinned (the library state, its journal, the backups, the asset manifest) and **not yet
defined, clean or flexible** where facts are copied: the card record has no owner, no schema
and no single producer, and the views compensate by re-deriving.

## 2. One record, many lenses — the simplification

The principle: **a fact is stored once, in one record with one producer and one schema;
everything else is a lens** — an index, a projection or a format over that record — and a
lens never stores a fact. Applied to CrankMagic there are exactly four records:

| Record | One producer | Today's copies (to become lenses) |
|---|---|---|
| **Card** — identity (`oracleId`, name, folded name, flavor names, faces), printings (set, collector, image, price snapshot with its date), facts (type line, rules text, cost, colours, keywords, P/T, rarity, legalities, Game Changer), derived terms (roles, mechanics, tribes, causes, triggers, produces, requires, multiplies, grants, extends, wants, makes, stats, purpose), rank | one builder, one file set, one stamp | `cards.json`, `card-facts.json`, `graph.json` cards, `state.cards`, the classifier at render, `commander-universe.json`'s identities |
| **Library** — the user's decks, slots, lots, groups, games, reports, preferences | the command log (`collection-model.js` `apply`) | already one record; its `cards` map becomes references to Card by `oracleId` plus the user's own fields (printing, paid) |
| **Deck definition and its measurements** — the definition, rung lists, ratings, guides, swaps | the Lab and the simulator | `deck-ratings.json`, `simulation-summary.json`, `deck-guides.json`, `deck-swaps.json`, `lenses.json`, `data/archive/*` |
| **Co-play** — EDHREC ranks, themes and the 701,916 pairs | `tools/commander-ranks.mjs`, the graph builder | `commander-ranks.json`, `graph.json` `played` |

And the lenses over the Card record, each of which exists today as a module and keeps its
job, losing only its private copy of the facts:

- **catalog lens** (`card-catalog.js`): search, resolve, exact, cheapest — an index by folded
  name and `oracleId` over the record; `details()` refreshes the record, not a private card.
- **graph lens** (`graph-payload.js`, `crankmagic-graph.js`): the term sets and the co-play
  pairs — reads terms from the record; `relateTerms` unchanged.
- **facets lens** (`crankmagic-facets.js`): posting lists term → ids built once at load.
- **classifier lens** (`card-classify.js`): `purposeOf` and the ladder over the record's
  derived terms; derivation itself runs in the builder, once, not in every render.
- **library lens**: a lot or a slot names an `oracleId`; the page joins to the record at read
  time. The user's fields (printing, paid, notes, location) stay on the lot where they belong.
- **sim lens** (`sim-engine.js`'s card model), **export lens** (sheet columns), **Trace
  lens** (the plan's edge `serves` and node `strategies` — computed over the record's terms).

The same shape applies to the Deck: one deck record; tiles, page tabs, readiness, the pull
sheet, the buy list, the export, the guide and the Trace are lenses over it, which is
already how `readiness()` and `projection()` work — the deck page is the model the rest
should follow.

What changes for the reader: nothing visible. What changes for the code: one builder to run
when Scryfall changes, one schema to check, one price on every page, one vocabulary in the
library and the graph, and a backup that is the user's, not the catalog's.

## 3. Recommendations, ranked

**Critical** — a correctness or reliability risk today; each is its own PR in E1–E3.

1. **Give the Card record one producer and one schema** (E1). `tools/build-card-records.mjs`
   merges `cards.json`, `card-facts.json` and the graph's per-card terms into one versioned
   record set with `schema`, `generatedAt`, `source` and the price snapshot date; `cards.json`
   and `card-facts.json` become outputs of that builder (or are retired) and the graph's
   card block is generated from the same records. Test: every record validates; the graph's
   terms equal the record's terms; one price per card. *Shipped in #179: `data/cards.json` is
   `cards@2`, 2,131 records with identity, facts, printing, one dated price and terms;
   `tools/build-card-records.mjs` is the one producer (`--check`, `--add`); the facts table and
   the graph's card block derive from it; the four hand-writers are retired;
   `tests/card-records.mjs` pins the derivations.*
2. **Stop copying the catalog into the library** (E2, schema 3). `state.cards[id]` keeps
   identity, the user's overrides and nothing else; facts are joined by `oracleId` at read
   time; `migrate()` strips the copied facts and re-keys. The 40-card role drift disappears
   by construction, backups shrink, and a vocabulary change reaches every library on the
   next load. Test: property-based `apply` sequences keep `validate` true; a schema-2
   fixture migrates to the same `readiness` totals. *Shipped in #180: schema 3 — a shipped card
   is stored as `{id, name, oracleId, shipped}`; the catalog is the join (`overlay()` keeps the
   record's facts and the copy's identity); the app files one `reconcileCards` command at boot
   for a schema-2 library; every module reads a card through `C.card(id)`;
   `data/live-state.json` shrinks from 2.1 MB to 0.8 MB; `tests/library-references.mjs`.*
3. **Take `graph.json` out of the precache and split it** (E4). Shell precached; data cache
   first-visit lazy with a progress line on Discover; the card terms block separate from the
   co-play pairs (the 701,916 pairs are the weight), pairs sharded or loaded on first graph
   draw. Test: the worker's DATA list has no file over a stated size; the service-worker
   suite asserts the split. *Shipped in #177: `graph-payload.js` `split`/`unpackPlayed`, the
   worker's RUNTIME list (cache-first on demand, kept under the data cache key), `card-catalog.js`
   `loadPlayed`, the Discover status line, the inventory's "on demand" column; the payload suite
   round-trips the split and refuses a pairs file baked against a different card count.*
4. **Envelope every generated file** (E1): `{schema, generatedAt, generator, count, …}`;
   readers check `schema`; the sidebar's "card data age" reads the Card record's stamp.
   Test: `tests/schemas.mjs` validates each committed file against `schema/*.json`. *Shipped in
   #178: every served or workflow-written file opens with `{schema, stamp, generator, count}`;
   `schema/index.mjs` is the registry, `schema/validate.mjs` the dependency-free validator,
   `tools/lib/envelope.mjs` the stamp every producer writes; the asset map's `expect()` is the
   check each reader makes.*
5. **Every served file has a declared producer with a `--check`** (E1/E4): add the check
   mode to the builders of `deck-guides`, `deck-ratings`, `simulation-summary`,
   `live-state` (exists), `sim/*`; declare hand-maintained files as such in the inventory's
   OVERRIDES. Test: the generators suite's CHECKABLE grows to cover every *serve* row. *Shipped
   in #178: `--check` on `commander-ranks`, `commander-universe`, `generate-guides`,
   `sim/rate-decks` (ratings and summary) and the new `build-card-records` (the Card record's
   declared producer, check-only until Critical 1); the generators suite asserts every
   registered file's `checkedBy` is a tool it runs.*
6. **Stub Scryfall in the journeys** (E2): the same stub the walks use, so the gate never
   depends on a third party's rate limit; one deliberate live-network test stays, marked.

**Recommended** — clean and flexible; E3.

7. **One status vocabulary** in the model (`M.STATUS`: id, label, tone, order,
   `placementOf`), read by the Cards list, the pills, the readiness bar, the deck page and
   later the Tabletop (four copies today). *Shipped in #182: `M.STATUS`, `statusOf`,
   `statusOrder`, `statusTone`; the Cards module, the pills and the deck page read them (the
   deck page's Reserved pill had drifted to the watch tone).*
8. **One groupings module** (`crankmagic-groupings.js`) for the sheet's *Group rows by*,
   the list's bands and the Tabletop's dropdown. *Shipped in #182: `crankmagic-groupings.js`
   (choices, colour piles, label and order) with the caller's column reader passed in.*
9. **`crankmagic-rules.js` absorbs the literals**: `GC_LIMIT` per bracket, the "cheap line"
   (`/^D[56]/` in `crankmagic-decks.js`), the composition type order, the loop-length cap;
   deck art moves to the deck definition or the commander's record. *Shipped in #182:
   `GC_LIMIT`, `UPGRADE_CHEAP_LINE` (a deck may set `definition.upgradeLine`; the D5/D6 regex is
   gone), `TYPE_ORDER`, `LOOP_MAX_LEN` and `DECK_ART`/`deckArt` on `crankmagic-rules.js`.*
10. **Archive the five legacy files and delete the stub** (E4): move them under
    `data/archive/` with their tools and tests repointed in the same PR; drop
    `deck-swaps.json` from the asset map and the worker. *Shipped in #183: the five are under
    `data/archive/` with every tool and test repointed; the stub, its asset entry, its worker
    entry and the advisor's read of it are gone.*
11. **Memoise the projections per revision.** `M.projection(C.state)` is recomputed on
    every render that needs it (the new deck-page Cards tab calls it twice); key a cache on
    `state.revision` inside the model so the Tabletop and the Trace can call it freely.
    *Shipped in #182: one computation per state and revision; callers get fresh rows.*

**Scalability and flexibility** — for the persistent plan, the Trace and the Tabletop; E3–E4
and the plans that follow.

12. **`oracleId` is the join key; the name key is an alias.** `card:` ids are base64 of the
    folded name today (`CrankCatalog.key`); names change with errata and flavor names, oracle
    ids do not. Every record and every lot carries `oracleId`; the resolver keeps the name
    key as a lens for links and typed input. *Shipped in #184: the catalog indexes by oracle
    id (`get()` answers for a graph node's id as well as the name key; `oracle(id)` is the
    direct lookup); `crankmagic-facets.js` joins the library to the graph on the oracle id with
    the name as the fallback, written once (`owns(state)` and the two personal facets), and
    Discover's focus-by-card, deck pick, gold band and loop list read it; `reconcileCards`
    fills a reference that lacks the record's oracle id, and the app names those at boot. A
    lot or slot reaches the id through its `cardId`, which is the normalised form: "every lot
    carries it" is read as every library card identity carries it.*
13. **Posting lists for the facets.** `narrowedCounts` scans 31,830 cards per dialog; a
    Map term → Set of ids built once at load makes every count proportional to the selection
    and gives the Trace its adjacency for free. *Shipped in #184: the facets module indexes
    each card list once (term → positions, per card facet); `apply` and `narrowedCounts` are
    set arithmetic over the lists, the two personal facets probed on the survivors; and
    `postings(cards)` exposes the lists (`cardsWith`, `termsOf`, `values`) for the Trace.
    Measured on the 31,830 cards: a count under two picks 1.9 ms against 255 ms by the scan, a
    personal-only pick 53 ms, the index 264 ms once per list. `tests/crankmagic-facets.mjs`
    holds seventeen kinds of pick to `matches()`, the card-by-card rule.*
14. **A generated `data/manifest.json`** (the inventory's data, machine-readable): per file
    the schema, stamp, hash and generator; the worker's DATA list and the sidebar's data-age
    line read it, `asset-versions` compares against it, and a future server serves it.
    *Shipped in #183: `tools/data-manifest.mjs` writes `data/manifest.json` (schema, stamp,
    generator, size, SHA-256, served version and cache class per registered file) with a
    `--check` the generators suite runs; `tests/data-manifest.mjs` holds the asset map and the
    worker's lists to it. The worker and the sidebar still carry their own lists; reading the
    manifest there is the step after.*
15. **Commands as the exchange format.** The library already has a journal and revision
    checks; the persistent plan's sync should ship commands, not states, so two devices merge
    by replay and the backup format stays the one that exists. *Shipped in #184 as a section
    of `docs/crankmagic-persistent-plan.md` ("Commands are the exchange format"): the wire
    carries commands; a state travels only at first sign-in and as the backup file that
    exists; a commit that is behind is answered with the commands it missed; replay is
    idempotent by command id.*
16. **Sharding rule for the static site**: no served data file over 5 MB; anything larger is
    split by a stable key (first letter of the folded name for card records; commander for
    co-play) and loaded on demand. The Card record set and the co-play pairs are the two files
    that need it. *Shipped as a rule in #183: `tests/data-manifest.mjs` fails a precached data
    file over 5 MB, and a served file over 5 MB that is not on demand and named `large` in the
    registry; the two graph files are the named exceptions (15.8 and 20.6 MB, on demand), to be
    split by the folded name's first letter and by commander when the Trace needs them. The
    Card record set is 3.9 MB and needs no split yet.*

## 4. Sequence

E1 (Card record + schemas + envelopes + producers declared) → E2 (library references the
record; property tests; journeys stub) → E3 (vocabularies and rules) → E4 (precache split,
sharding, archive, manifest) → E5 (this report finished, the plans re-read against it).
Each phase its own PR, every suite green, this file appended.
