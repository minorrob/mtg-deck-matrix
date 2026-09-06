# MtG Deck Matrix

A mobile-first static site — plain HTML, CSS and JavaScript served as files —
that keeps everything in the browser it is opened in. Nothing is uploaded and
there is no account.

## Three pages

**`index.html` · My Decks** is the front door: every deck you have, what it does,
how far from finished it is. Three tabs — **Decks**, **Bench** (spare copies) and
**To Buy** — plus two ways to gain a deck: paste one you already have, or
describe one and have it built. Upload what you own as csv, xlsx or a pasted
note and the collection is allocated to your decks copy by copy, the remainder
landing on the bench.

**`matrix.html` · the Matrix** is the build-and-buy half. **Compare** picks one
variant per deck role out of fifty; **Deck** turns that pick into an exact
hundred, slot by slot, at the rung you choose; **Shop** is everything still owed
in one list, with a Store view built for a phone at a vendor's booth; **Game
Log** records what actually happened and reads it back against what the
simulation predicted.

**`graph.html` · the card graph** is 7,710 Commander-legal cards, what connects
them, and a Copilot that says which twenty are worth a look.

Everything lives in `localStorage`. Export writes one file carrying the lot —
picks, boxes, Shop marks, prices, the decks you added and the collection you
uploaded — and importing it puts all of that back. `data/*.json` is never written
to by the app.

## Current catalog coverage

Fifty variants, each published at four rungs and each connected to a buy profile.
The six that carry the ★ My Build ribbon are the owner's own decks with audited
shopping plans. The rest promote their published precon seed, key-upgrade table,
upgrade ladder and Bracket 3 route into variant-specific purchase profiles;
verified shared precons reuse their full 100-card shell, while incomplete source
lists stay visibly modeled rather than being presented as audited decklists.

## Build a deck from nothing

**Build a deck**, beside **Add a deck** on My Decks, takes a commander, sixteen
themes as chips, six play styles, a budget to aim at, and any cards you want kept
in. It queries live Scryfall and builds three complete, Tier 3 legal,
exactly-100-card rungs, ranked by what people actually play with *your*
commander — EDHREC's per-commander inclusion and synergy numbers, not a global
popularity rank. A commander with no EDHREC page still builds; the weight folds
back onto the global rank instead.

The rung you keep is stored exactly the way a pasted deck is, so it is a peer of
every other deck everywhere downstream.

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

The six variants that carry the ★ My Build ribbon are the owner's own decks and
were built to a different brief. Their Pod Fun rung was searched over his own bench
at zero spend, with the win rate held **under 60%** rather than 45% — his own
instruction — so all six sit above this file's 45% ceiling and are declared as such
in `data/simulation-summary.json`'s `caveats.podFunOverCeiling`. Their Base, Tuned and
Max rungs are not hill-climbed at all: Base is the target hundred with the workbook's
Tuned swaps undone, Tuned is the target hundred itself, and Max is that hundred with
the deck's own Bracket-3 list applied.

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

Twenty-four suites, run individually or all at once. They use only Node
built-ins — there is no `package.json`, no dependency to install and no build
step.

```
for f in tests/*.mjs; do node "$f" || echo "FAIL $f"; done
```

| | |
|---|---|
| `asset-versions` | one `?v=` per file across every page, and a changed file has a changed version |
| `assignment-model` `slot-model` `lineup-compliance` | the slot projection, the hundred it composes to, and the rungs across all fifty plans |
| `compliance-model` | the Commander bracket rules, shared between the page and the simulator |
| `data-integrity` | the baked catalog and the source patterns the app depends on |
| `deck-audit` `deck-measure` `sim-engine` `sim-lenses` | the simulation engine, its caps, and the findings read off it |
| `deck-build` `deck-generator` `edhrec-client` `deck-sources` `deck-import` `deck-store` | building a deck from nothing, and adding one you already have |
| `game-record` | what the game log may claim, and the Wilson interval that gates it |
| `inventory-import` `master-regenerates` `xlsx-writer` `docx-writer` `shop-export` | reading what you own, and writing what you need |
| `import-wiring` `manual-rung` | the modules each page loads, and hand-added options |

### Journeys, in a real browser

`tests/uat/journeys.mjs` opens the pages as three people — a first-timer with
empty storage, somebody a year in with ten added decks and 3,200 cards, and
somebody leaving with their data — across ten journeys at two screen sizes. It
needs Playwright and a static server, neither of which this repo depends on, so
it **skips rather than fails** when either is missing. See `tests/uat/README.md`.

```
python3 -m http.server 8790
node tests/uat/journeys.mjs
```
