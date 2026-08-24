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

### The four rungs

Every variant is published at four rungs, and each one is answering a different
question rather than spending a different amount of money.

| Rung | Question | How it is built |
|---|---|---|
| **Base** | What does the entry price buy? | The cheapest hundred that is still this deck — placeholders you sleeve up while the real cards are on the shop list. Constructed by `tools/sim/build-base.mjs`, measured once, never optimized. |
| **Tuned** | How well can this deck win? | Hill-climbed on the performance vector at Tier 2, $60 a card. |
| **Pod Fun** | Does the table get a game? | The same hundred asked a different question: win rate held **under 45%** as a hard constraint, the pod-experience metric weighted, and a floor on power so it can never come out the stronger build. |
| **Max** | What does Tier 3 add? | Hill-climbed on the performance vector again, starting from Tuned's final hundred, at Tier 3 and $100 a card. |

Each rung starts from the hundred the rung below it finished at. That is not a
detail: two independent hill-climbs from the same list land in different local
optima, which is how a Tier 3 Max rung with twice the budget once came out
*weaker* than the Tuned rung it is meant to be an upgrade of.

Two things protect a deck from being optimized into a different deck. A **role
census** stops the search trading away a whole job — it cannot cut its way below
two board wipes or eight ramp pieces. And a **strategy floor** holds how much of
the deck's own plan the hundred still carries, measured against the phrases the
deck itself repeats rather than against its declared mechanics label. The label
was tried first and is too coarse: "Control / Interaction" does not describe a
theft deck, so a census built on it scored every one of that deck's actual theft
cards as off-theme.

```
node tools/sim/sweep.mjs                     # all fifty variants, four rungs each
node tools/sim/bake-ladders.mjs --write      # measured hundreds back into the buy plans
node tools/sim/reprice.mjs --write           # cost figures re-summed from the cards
node tools/sim/bake-sweep.mjs --write        # the published numbers, with caveats
```

`bake-ladders` will refuse to write unless composing every rung through
`lineup-model.js` reproduces the exact hundred the sweep measured, because a
published score belonging to a deck other than the one printed underneath it is
the failure this whole pipeline exists to avoid.

### Simulating one deck from the page

Every variant — curated or generated — has a **Simulate** button. It plays the
deck's Tuned build against randomized opponents thousands of times, finds where
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

Convergence is "keep going until the improvements are negligible", where
negligible means smaller than the sampling noise or under 5% of the score
already reached, whichever is larger. It is measured over a window of the best
score rather than one iteration at a time, so three consecutive one-point gains
count as progress on an eighty-point deck even though no single one of them
clears the bar. The noise figure is measured, not assumed: at two thousand games
the same deck scores within about ±0.7 points across seeds.

`maxLedgerSimulations` is a budget, not a safety property, and it has been
raised once — from five million to fifteen — to pay for the four-rung rebuild of
all fifty variants. The engine runs about 42,000 games a second, so the whole
cap is a few minutes of compute; the ledger exists so that spend is visible and
deliberate, not so that it is impossible.

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
that restriction — with its toughness as the damage when an Arcades-style
effect says so), and the fun/participation score is one reasonable take on a
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
