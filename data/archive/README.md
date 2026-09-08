# Archived deck data

These files were the app's default data set until the clean start. They are kept here,
in the repository, so nothing is lost and any of them can be recovered or moved back —
but nothing in CrankMagic loads them any more.

| File | What it holds |
|---|---|
| `master-v2.json` | The six reference decks: every card, its target count per deck, and prices |
| `variants.json` | The fifty commander variants across ten deck roles |
| `rung-lists.json` | The pinned Base / Tuned / Fun / Max hundred for all 200 rungs |
| `deck-guides.json` | The written how-to-play guide for each of the six decks |
| `deck-swaps.json` | Measured card-swap deltas for the six decks |

## Why they moved

An app whose first screen shows six decks you did not build is a demo, not a workshop.
CrankMagic now opens empty: no decks, no variants, no pre-loaded plans. The card library
(`data/cards.json`, `graph.json`, `commander-universe.json`, `commander-ranks.json`,
`commander-glossary.json`, `card-facts.json`) is **not** archived — that is the catalog
the builder searches and the simulator reads, and a deck builder without a card catalog
cannot build anything.

`data/deck-guides.json` and `data/deck-swaps.json` still exist at their original paths
and still load, but hold no decks. Both features stay wired and simply find nothing
until there is something to find; regenerate guides with `tools/generate-guides.mjs`.

## What still reads them

The engine's regression net and the tooling that produced these files, by their archive
paths — `tests/deck-measure.mjs` measures `master-v2.json`'s six hundreds and requires
the published ratings back, which is what proves the engine has not drifted. Archiving
the data must not cost that check, so the archive stays reachable from `tests/` and
`tools/`. The retained legacy pages (`matrix.html`, `legacy-decks.html`,
`legacy-graph.html`) read them too, and keep working.

## Recovering one

They are ordinary files at ordinary paths. To put the reference decks back in front of
the app, point `crankmagic-assets.js` at `data/archive/master-v2.json` and restore the
`load-default` action in `crankmagic-decks.js` — both were removed in the same commit
that created this directory, so `git log --diff-filter=D` will show them.
