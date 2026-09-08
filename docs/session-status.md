# CrankMagic — current state and handoff

Last updated 8 September 2026. Written so the next session can start work without
reading a transcript.

## Where things stand

The app is a zero-dependency static site on GitHub Pages at
https://minorrob.github.io/mtg-deck-matrix/. It is tested live by its owner, and the
standing instruction is **merge any clear fix directly** rather than queuing it.

`bash runtests.sh -q` runs **44 Node suites** and all of them pass on `main`.

### Shipped in the most recent run of work

| What | Where |
|---|---|
| Directed graph relations (causes→triggers, makes→multiplies, grants→extends) and hover-to-name | `crankmagic-graph.js`, `card-classify.js` |
| Lowest-cost paper printing, fetched live when a card is inspected | `card-catalog.js` |
| iPhone share fix; Send Feedback button | `crankmagic-app.js` |
| Collection: colour grouping, inline row actions, like-for-like replacement with a side-by-side compare | `crankmagic-collection.js` |
| Flavour names — 513 of them, so "SpongeBob SquarePants" finds Jodah offline | `data/flavor-names.json`, `tools/flavor-names.mjs` |
| Three-way filters (include / exclude / off) on Discover and the graph | `crankmagic-facets.js`, `crankmagic-discover.js` |
| Deck Lab: opens fresh, a Clear button, skippable archive and delete confirmations | `crankmagic-lab.js`, `crankmagic-decks.js` |
| **Deck Lab loop rebuilt** — see below | `crankmagic-lab.js`, `crankmagic-sim.js`, `sim-engine.js`, `deck-measure.js` |

### The Deck Lab loop, in detail

Reported as "0 swaps found in under a second on a deck winning 0.94%". Three faults,
all fixed:

1. **The candidate pool could be empty in silence.** Candidates are ranked by
   `CrankGraph.relate` against the commander, and the graph is a 7 MB fetch the Lab
   started without waiting for. It now waits, says so, and refuses out loud if the
   pool is still empty.
2. **It was bounded by work, not time** — twelve slots, first candidate that won. A
   round is now 30 seconds and spends them: 14 candidates screened per weak slot, best
   two confirmed.
3. **The acceptance bar was noise.** A one-seed run has a standard error of exactly
   zero, so the bar was a flat quarter point against a measurement whose real spread
   is two or three. Cheap runs now only rank; the decision is made on the new
   **`refine` protocol — 3 seeds × 4,000 games** — by more than twice that run's own
   error.

It also now stops on **targets**, not just on "nothing changed". The targets are a
declared convention written beside the code: win rate against the 25% share every seat
of a four-player pod has, scaled by the Deck Definition's competitiveness; winning turn
from its speed; screw, flood and dead cards from `sim/config.json`.

Verified in Chromium: Krenko at competitiveness 3 — 2 rounds, 3 swaps kept from 44
screened, every target met, no console errors.

### The per-card readout

"Half the cards cast 99-100%, half cast 0%" was two accounting bugs and one real
limit.

- A **land** was added to the cast set when played (so it never counted as dead) but
  the counter was never incremented. All 36 lands read 0% cast, 0% dead.
- The **commander** is cast in a branch that returns before the bookkeeping, so the one
  card the header reported at 99.98% read 0% in the table under it.
- `castRate` divided cast **events** by **games drawn**, so a row standing for 36
  Mountains divided five plays a game by one game.

All three fixed. The remaining 100%s are real and are documented in
`docs/simulator-enhancement-plan.md` item 1: nothing in this model can stop a spell, so
a drawn card is a cast card. The loop now ranks on **stranded at turn eight** instead,
which varies.

**No published number moved.** `cardStats` is a readout and has never fed a score.

## What is next, in the owner's stated order

1. **Engine fidelity** — `docs/simulator-enhancement-plan.md` is the plan. Start at
   its item 3 (typed, exclusive mana payment) and item 5 (spend the held answer);
   they are the same area and the best correctness-per-hour in the document.
2. **Non-AI how-to-play generator** — largely superseded by `guide-measured.js`, but
   still on the owner's list.
3. **Full-app sweep and hardening** — explicitly to be done after everything else is
   merged.

Open and unstarted:

- **Deck Lab "Start from" an existing deck or Collection group.** The fresh-open and
  Clear halves shipped; re-evaluating a deck you already have did not.
- **The refresh plug-in itself.** The specification is written and complete in
  `docs/crankmagic-refresh.md`; nobody has built the plug-in.
- **Salvage Yard variant-assignment dropdown.**
- A written point-by-point answer to `design/crankmagic/simulation-fidelity-plan.md`.

## House rules that bite

- **Versioning.** Every asset is fetched with a `?v=`. One file, one version,
  everywhere. Change a file and its version must move, in every page that names it.
  The cascade is `data/*.json` → `crankmagic-assets.js` → `crankmagic-app.js` →
  `crankmagic-sw.js`, and the service worker's registration line lives inside
  `crankmagic-app.js`. Record with `node tests/asset-versions.mjs --update`. If you
  edit a file **after** bumping it, rebase the fixture:
  `git checkout origin/main -- tests/fixtures/asset-versions.json && node tests/asset-versions.mjs --update`.
- **44 suites.** `README.md` states the count and `tests/data-integrity.mjs` checks
  that it matches. Adding a suite means editing the README.
- **A score is a claim about a protocol and an exact hundred.** Never carry a result
  across an engine generation, never reweight to make an average look right, and never
  publish anything measured on `preview` or `refine`.
- **Merging.** Push, open a **draft** PR, flip it out of draft, squash-merge, then
  `git fetch origin main && git reset --hard origin/main`.

## Where the useful files are

| File | What it is |
|---|---|
| `docs/simulator-enhancement-plan.md` | What the engine cannot measure, and the order to fix it |
| `docs/crankmagic-refresh.md` | How to refresh the eight data files; the plug-in specification |
| `design/crankmagic/simulation-fidelity-plan.md` | The long-run architecture argument |
| `crankmagic-lab.js` | The Deck Lab: draft, measure, refine, loop, report |
| `crankmagic-sim.js` | The only place that asks the simulator anything; protocols live here |
| `sim-engine.js` | The engine. 1,700 lines, no dependencies, runs in Node and a worker |
| `card-classify.js` | The one shared vocabulary for "what does this card do" |
| `crankmagic-graph.js` | Directed relations and the Discover canvas |
