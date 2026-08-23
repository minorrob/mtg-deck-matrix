# MtG Deck Matrix

A mobile-first static app with one private browser-local flow:

0. **Choose** — describe a deck you want and generate up to five complete variants for it.
1. **Compare** — choose one variant for each deck role.
2. **Buy Picks** — include required tune-ups and optionally select Enhance or Max cards.
3. **Shop List** — search, filter, deduplicate, and mark cards or precons as found.
4. **Live Decks** — track what you own, what you paid, and whether each deck is legal and ready.

The source data is normalized from the two legacy HTML files kept in the parent project folder. Run `tools/extract_data.py` after those source files change.

## Current catalog coverage

All 30 Compare variants are normalized and connected to Buy Picks. The six complete profiles from the original Shopping Guide retain their audited shopping plans. The other variants promote their own published precon seed, key-upgrade table, upgrade ladder, and Bracket 3 route into variant-specific purchase profiles; verified shared precons reuse their full 100-card shell, while incomplete source lists remain visibly modeled rather than being presented as audited decklists.

## Step 0 · Choose

Six placeholders take any mix of colors, mechanics, a play style, a budget, a
preferred set, a commander by TCGplayer link or name, and TCGplayer links for
cards you want included. Each one queries live Scryfall and builds complete,
Tier 3 legal, exactly-100-card variants with the same Base / Tuned / Maxed
ladder the curated decks use, so they flow through Buy Picks, Shop List and
Live Decks unchanged.

Generated decks live in this browser's `localStorage` and are merged into the
catalog in memory when the page renders. `data/*.json` is never written to.

## Simulation and optimization

Every variant — curated or generated — has a **Simulate** button. It plays the
deck's Tuned build against randomised opponents thousands of times, finds where
the build actually loses, proposes swaps, and re-measures. The games run on your
own computer; no API key is needed and nothing is uploaded.

```
python3 -m http.server 8000                        # so the page can watch the run
node tools/sim/run-batch.mjs --variants 5o         # request, pool, baseline, optimize
node tools/sim/run-batch.mjs --all                 # every variant in the catalog
claude "/simulate-deck 5o"                         # let a local Claude session pick the swaps
```

The Simulate screen polls `sim/status.json` every two seconds while a run is in
progress and loads the result when it finishes. Away from localhost it shows the
command and takes the result file through a file picker instead. **Update
variant** applies the optimized 100 as an overlay, and **Revert** puts the
original list back; neither touches the catalog on disk. To ship an optimized
list with the site instead, use `node tools/sim/bake-result.mjs --result <file>`.

### What the runner will and will not do

`tools/sim/run-sim.mjs` owns every stop condition — the per-request game cap in
`sim/sim-ledger.json`, a wall-clock budget, an iteration limit, and a
convergence test — and returns the best list it measured on every stop path. A
`--games` argument can lower a limit but never raise one. Delete
`sim/sim-ledger.json` to reset the cumulative count.

Two guards keep the output honest rather than model-shaped. Role floors stop the
optimizer trading away a whole job (it cannot cut its way below two board wipes
or eight ramp pieces), and a card only becomes a cut candidate when the
simulation caught it stranded in hand, cast too late for its cost, or never cast
— never when the games it was cast in were measurably the games that were won.

Every run finishes by replaying both the original and the optimized list on
seeds the optimizer never saw. Only that comparison decides the verdict, so a
gain that exists solely on the tuned seeds is reported as `not-confirmed`.

### What it cannot see

The engine is a model, not a rules engine. Combat and repeatable drain are the
only routes to victory it knows, opponents are nine archetype curves (three
power tiers, six playstyles) rather than real decks, there is no stack and no
real blocking assignment (a toughness-weighted reduction stands in for it, and
a Defender creature contributes no attack power unless the deck itself lifts
that restriction), and the fun/participation score is one reasonable take on a
subjective idea, not a settled definition. The full list is in `sim-engine.js`
and is copied into every result file. Read the numbers as a comparison between
two versions of one deck, never as absolute odds.

## Tests

```
node tests/data-integrity.mjs      # the baked catalog and the app source patterns it depends on
node tests/lineup-compliance.mjs   # the 100-card lineup model across all 30 plans
node tests/compliance-model.mjs    # the shared Commander bracket rules
node tests/deck-generator.mjs      # Step 0 generation against a stubbed Scryfall
node tests/sim-engine.mjs          # the simulation engine and the runner's caps
```

No dependencies, no build step: the tests use only Node built-ins, and the site
is plain HTML, CSS and JavaScript served as files.
