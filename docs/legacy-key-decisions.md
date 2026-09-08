# The 18 unmigrated browser keys — proposed decisions

*Step 2 of [crankmagic-cutover-plan.md](crankmagic-cutover-plan.md). Written 2026-09-08
against the merge at `c2554d1`. **Proposed — awaiting a decision. No migration code has
been written.***

## What "drop" means here

Nothing is deleted. `crankmagic-legacy.js` already snapshots **every** key it finds,
lists each one under "Original records" in the Review-legacy-data dialog, and offers
"Download original snapshot" — so a dropped key stays readable and exportable forever.

- **Migrate** — read on import and turned into CrankMagic records, so it is live in the
  new app.
- **Drop** — retained in the snapshot, not carried into the model, and named on screen
  as something that was not carried over.

The distinction is only ever "does this become live state", never "is this destroyed".

## What is already migrated

`crankmagic-legacy.js` reads three of the twenty-one registered keys:
`mtg-imported-decks.v1` and `mtg-deck-matrix-custom-v1` (restored as draft decks) and
`mtg-viewer-inventory.v1` (staged as a reviewed ownership claim). The remaining eighteen
are below.

*(The cutover plan said "22 keys, 4 read". `user-state.js` registers 21;
`mtg-deck-matrix-browser-backup` is the backup file's `kind`, not a storage key. The
count of unmigrated keys — eighteen — is unchanged.)*

## The evidence this is judged against

`data/my-load.json` is a real browser backup of the live build (saved 2026-09-07). It
holds exactly one key, `mtg-deck-matrix-state-v1`, and its contents are the "In the
current export" column below. Where a key is absent from that file, it is marked so —
absent from one browser is not absent from every browser, but it does say which
decisions are urgent and which are theoretical.

## The table

| # | Key | What it holds | In the current export | Destination in CrankMagic | Proposed |
|---|---|---|---|---|---|
| 1 | `mtg-deck-matrix-state-v1` | The whole old app: builds, ownership, prices, Shop marks, game log | **433 KB, 13 populated fields** | several — [broken out below](#the-one-key-that-needs-field-by-field-decisions) | **Migrate, selectively** |
| 2 | `mtg-viewer.v1` | `picks` (cards ticked on Bench and To Buy), plus table filters/sort and a share address | absent | `lots` + `lot.allocation` | **Migrate** the picks; drop the filters |
| 3 | `mtg-viewer-archived.v1` | Which decks you put down | absent | `deck.archived` | **Migrate** |
| 4 | `mtg-manual-cards.v1` | Cards added from a link that Scryfall does not have yet | absent | `cards` with `verified:false` | **Migrate** |
| 5 | `mtg-graph-dismissed.v1` | Copilot findings you set aside | absent | `preferences.dismissedSuggestions` | **Migrate** |
| 6 | `mtg-card-images.v1` | Card pictures looked up for decks you added | absent | — (re-fetched) | **Drop** |
| 7 | `mtg-card-metadata-v2` | Card facts fetched from Scryfall | absent | — (`data/cards.json` ships 7,765) | **Drop** |
| 8 | `mtg-catalog-source.v1` | Which catalog this browser starts from | absent | — | **Drop** (registry marks it `meta`) |
| 9 | `mtg-owned-extras-import-v3` | A marker saying the one-time ownership import already ran | absent | — | **Drop** |
| 10 | `mtg-tuned-exclusions-v1` | Cards excluded from a variant's Tuned rung | absent | — (no ladder in CrankMagic) | **Drop**, named on screen |
| 11 | `mtg-variant-picks` | Compare picks from a version before `state-v1` | absent | `preferences.comparisonPicks` | **Migrate only as a fallback** when key 1 is absent |
| 12 | `mtg-graph-tonight.v1` | The deck you were playing tonight, from an older version | absent | — | **Drop** (`graph-page.js` already reads then removes it) |
| 13 | `mtg-graph-copilot-filters.v1` | Copilot filters | absent | — | **Drop** |
| 14 | `mtg-graph-visitors.v1` | Cards you looked up on the graph | absent | — | **Drop** |
| 15 | `mtg-shop-extra-filters-v1` | Extra Shop filters | absent | — | **Drop** |
| 16 | `mtg-header-collapsed-v1` | Whether the header is folded | absent | — | **Drop** |
| 17 | `mtg-last-export-v1` | When you last exported | absent | — | **Drop** (CrankMagic keeps its own) |
| 18 | `mtg-load-undo-v1` | The undo for the last file load | absent | — (CrankMagic has real undo) | **Drop** |

Eleven of the eighteen are view state, caches of a public API, or one-time markers. Four
are things a person typed and would notice losing (2, 3, 4, and the fields of 1); one is
a fallback for a shape that predates the current one.

## The one key that needs field-by-field decisions

`mtg-deck-matrix-state-v1` is not one decision, it is thirteen. These counts are from
the live backup:

| Field | What it holds | Real size | Destination | Proposed |
|---|---|---:|---|---|
| `owned` | In-hand and ordered counts per card | **549 cards** | `lots` (`source: owned` / `ordered`) | **Migrate** — this is the ownership record |
| `deckHolds` | Which deck box physically holds which copies | **6 decks** | `lot.location {kind:'deck'}` | **Migrate** — the only record of physical placement |
| `buySelections` | The Active hundred, per deck | 6 decks | `deck.slots` | **Migrate** |
| `assignedSelections` | The reviewed hundred behind Active | 6 decks | `deck.versions` | **Migrate** |
| `deckActive` | Which slots are ticked — the deck's claim on a card | 6 decks | `lot.allocation` | **Migrate** |
| `purchasePrices` | What you actually paid, typed in by hand | **314 prices** | `lot.paid` | **Migrate** — unrecoverable if dropped |
| `boughtQuantities` | How many of each card have been bought | 549 cards | folded into `lots` | **Migrate** |
| `found` | Cards marked found while shopping | 433 cards | folded into `lots` | **Migrate** |
| `manualCards` | Cards added to a deck by hand, with full card facts | **6 decks, 198 KB** | `cards` + `deck.slots` | **Migrate** |
| `liveSalvage` | The salvage pile, with full card facts | **65 cards, 75 KB** | a `group` plus bench `lots` | **Migrate** |
| `compareSelections` | Which variant is picked per deck role | 6 | `preferences.comparisonPicks` | **Migrate** |
| `gameLog` | Games played at a real table | 0 here | `games` | **Migrate** (empty now; the compile-history loop depends on it) |
| `comments` | Notes typed against cards | 0 here | deck/slot notes | **Migrate** |
| *view state* | `rankStages`, `compareFilters`, `shopFilters`, `cardFilters`, `liveFilters`, `liveOpenDecks`, `lineupHistory`, `liveTransfers`, `buyMode`, `compareLibrary`, `deckRung`, `*Seed` markers | — | — | **Drop** — they describe an interface that no longer exists |

## The one judgement call worth arguing about

Migrating `owned`, `boughtQuantities` and `found` means importing an ownership claim the
old app inferred partly from deck quantities — which is the exact bug
`collection-model.js` was written to end (*"A planned hundred is a demand, never proof of
a hundred owned cards"*).

Two ways to handle it:

- **A · Import as a reviewed claim** (what the existing inventory path already does):
  every quantity lands staged, with printing unspecified, and has to be confirmed before
  it becomes a lot. Honest, and it costs one review pass over 549 cards.
- **B · Import directly as lots**, trusting the old counts. Faster; carries the old
  model's inference into the new one on day one.

Recommendation: **A**, with `deckHolds` pre-filling the physical location so the review
is a confirmation rather than a re-entry.

## What ships with whichever decision is taken

- The migration extends `crankmagic-legacy.js` only for the keys marked Migrate.
- The app says plainly, on screen, which keys it did **not** carry over — dropping
  silently is what this document exists to prevent.
- A test fails if `user-state.js` grows a key that the migration has never heard of, so
  the list cannot rot back into being decided by omission.
