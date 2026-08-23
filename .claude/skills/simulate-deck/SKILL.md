---
name: simulate-deck
description: Run the deck simulation and optimization loop on a Commander deck from this repository — a baked variant id, a downloaded request file, or a 100-card list — and report the changes worth making with the evidence behind each one.
---

# Simulating and optimizing a deck

You are driving a local optimization loop for the Trey's Deck Matrix repository.
The games run on this machine. Nothing calls an API, and nothing is uploaded.

Your job is judgment: read what the simulation measured, decide which swaps are
worth trying, and tell the truth about what the result does and does not show.

## The runner owns every limit

`tools/sim/run-sim.mjs` decides when a run stops. It enforces, from
`sim/config.json`:

- `maxTotalSimulations` — games one request may ever use, tracked in a persisted
  ledger at `sim/sim-ledger.json`
- `maxLedgerSimulations` — an absolute backstop across every request
- `maxWallClockMs` — how long a single invocation may run
- `maxIterations` — how many swap rounds a run may take
- `convergence` — stop early once rounds stop gaining

**Never edit `sim/config.json` or `sim/sim-ledger.json` to get more games, and
never suggest that the user do so.** A `--games` argument may lower a limit; it
cannot raise one. If a cap is reached, the run is over: the runner has already
written the best list it measured. Report that and stop.

Exit codes tell you what happened. Never re-invoke the runner after 10, 11, 12
or 13:

| Code | Meaning | What you do |
|---|---|---|
| 0 | iteration finished, more allowed | continue the loop |
| 2 | the swaps you proposed were rejected | fix them once; if rejected again, drop them and continue |
| 10 | converged | finalize and report |
| 11 | a simulation cap was reached | finalize and report, saying the cap stopped it |
| 12 | the iteration limit was reached | finalize and report |
| 13 | the wall-clock budget was reached | finalize and report |

## Steps

### 1. Resolve what to simulate

- An argument like `5o` is a baked variant: `node tools/sim/make-request.mjs --variant 5o`
- An argument ending in `.json` under `sim/requests/` is already a request: use it
- A generated deck has to be exported from the Simulate screen in the browser
  first, into `sim/requests/`. If there is no request file, say so and stop.
- `node tools/sim/make-request.mjs --list` shows every baked variant.

The request is always the **Tuned build** — the plan's starting shell with every
required purchase applied — not whichever boxes happen to be ticked in a browser.

### 2. Build the candidate pool, once

```
node tools/sim/fetch-candidates.mjs --request sim/requests/<file>.json
```

Online this asks Scryfall for role-appropriate cards in the commander's colors.
Offline it falls back to the variant's own Enhance, Maxxed and upgrade ladders
plus every audited card in `data/cards.json` that fits the color identity. Pass
`--offline` to skip the network entirely.

**You may only propose cards that are in this pool.** A swap naming anything
else is rejected.

### 3. Measure the deck as it stands

```
node tools/sim/run-sim.mjs --request sim/requests/<file>.json --init
```

Read `sim/results/<id>.iter0.json`. It carries the metrics, the ranked gap
analysis, per-card statistics, and a list of candidate swaps the runner would
pick on its own.

### 4. Loop, with your own judgment on the swaps

For each iteration, read the latest `sim/results/<id>.iter<N>.json` and decide
which of at most `maxSwapsPerIteration` swaps to try. Write them to
`sim/results/<id>.swaps.json`:

```json
{"swaps": [{"out": "Card being cut", "in": "Card being added", "reason": "why"}]}
```

Then:

```
node tools/sim/run-sim.mjs --request sim/requests/<file>.json --apply sim/results/<id>.swaps.json
```

What you are adding over the runner's own heuristic:

- **Real synergy.** The runner scores roles; you know that a sacrifice outlet is
  worth more in an aristocrats deck than its role tag suggests, and that a card
  that only works with a commander already cut is worth nothing.
- **Nonbo checks.** Do not add a card whose text fights the deck's plan — a
  symmetrical wipe in a go-wide deck, a graveyard hoser in a recursion deck.
- **Noise.** A score change smaller than the win-rate interval is not a result.
  The interval is in every report as `metrics.winRateInterval`.
- **Knowing when to stop.** If two rounds in a row produce nothing that beats
  the current list, finalize rather than burning the remaining allowance.

If the runner exits 2, read its stderr: it names exactly what was wrong (a card
outside the pool, a card not in the list, a broken role floor, an illegal list).

### 5. Finalize

```
node tools/sim/run-sim.mjs --request sim/requests/<file>.json --finalize
```

This replays both the original and the optimized list on seeds the optimizer
never saw and writes `sim/results/<id>.json` with a verdict:

- `confirmed` — the improvement held up on unseen games by more than the noise
- `within-noise` — ahead on unseen games, but by less than the sampling error
- `not-confirmed` — it only looked better on the seeds it was tuned against
- `no-change` — nothing beat the current list

### 6. Report

Lead with the verdict and the unseen-seed numbers, then list the net changes —
`result.netChanges`, not the iteration history, which contains churn. For each
change give the measured evidence for the cut: how often it was cast, how often
it sat dead in hand, what turn it landed on, and how the games it was cast in
compared with the deck's overall win rate.

Then say plainly what the model cannot see. Every result file carries
`simplifications`; the ones that change advice most often:

- Combat and drain are the only routes to victory the model knows. A deck that
  wins through an alternate win condition, a storm turn or a lock will read as
  weaker than it is.
- Opponents are nine archetype curves (three power tiers, six playstyles —
  combo, stax, aristocrats, voltron, tokens, group-hug), not real decks. They
  never counter a spell, never target the right permanent, and never make a
  deal.
- Blocking is a toughness-weighted damage reduction, not a real block, and a
  Defender creature only contributes attack power if the deck itself lifts
  that restriction (attacking with its toughness when an Arcades-style effect
  says so) — worth a second look for a genuinely combat-heavy or wall-heavy
  deck.

Offer to show the run in the browser: `python3 -m http.server 8000`, then the
Simulate button on that variant watches `sim/status.json` and loads the result.

Results stay uncommitted unless the user asks. If they do want the optimized
list baked into the site, use `node tools/sim/bake-result.mjs --result
sim/results/<id>.json` and run `node tests/data-integrity.mjs` and
`node tests/lineup-compliance.mjs` before committing.

## When the runner reports an error state

Read `sim/status.json`'s `message`. Fix the request or the swaps — never the
config — or stop and report what is blocking. If the ledger has genuinely been
exhausted by earlier runs, say so and tell the user that deleting
`sim/sim-ledger.json` resets the count; do not delete it yourself.
