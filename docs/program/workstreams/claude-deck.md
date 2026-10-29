# Claude · Deck intelligence: the instruction set

> **Superseded in part, 2026-10-29 (Rob: one loop for all work, in Linear).** Where this file says to read or update `docs/ACTIVE.md`, a readout feed (`docs/readout/`, `tests/readout-feeds.mjs`) or a handoff file, follow instead `AGENTS.md`, "The work is in Linear: one loop", and the Linear document "How work flows: the one loop" on initiative I-1: pick up the next Todo issue in your lane, claim it, build, then update the PR, the issue and its status. The lanes, file ownership and engineering rules in this file still hold.

*Platform: Claude, the second session (a cloud container today). Linear label `Claude · Deck intelligence`. Feed
`docs/readout/feeds/claude-deck.json`; this workstream also owns `docs/readout/north-star.json`,
`docs/readout/index.html`, `tests/readout-feeds.mjs` and `docs/program/**`. Branches `claude/deck-<topic>`. The
charter is `docs/program/README.md`; this file adds what is specific to this lane.*

## 1. What this lane is for

The models and data under the workshop's screens, and the program's record:

- **Outcome 4, deck creation from criteria** (P-ROB-4): `buildFromCriteria` with a reason per slot (ROB-109),
  commander suggestions, compliance explained (ROB-111), reasonableness measured (ROB-112).
- **Outcome 5, deck tuning** (P-ROB-5): the composition model (ROB-114), synergies and chains (ROB-115), simulation
  fidelity (ROB-116, after the audit ROB-84), swap records with evidence and measured gain (ROB-117).
- **Outcome 6, buying**, the data half (P-ROB-6): `buyPlan` (ROB-119), the scheduled price refresh (ROB-121).
- **Outcome 8, AI in action** (P-ROB-8): strategy and SWOT (ROB-128), the coaching service (ROB-129), upgrades
  (ROB-130), card resolution (ROB-131), the label-and-meter contract's feature half (ROB-132).
- **Outcome 1**, one piece: Commander legality (ROB-104). **Outcome 7**, one piece: the builder honors preferences
  (ROB-123). **Outcome 10**: the readout (ROB-138) and the launch checklist (ROB-137).

## 2. Read first, in this order

1. `AGENTS.md`. 2. `docs/ACTIVE.md`, the top and the lanes table. 3. `docs/program/README.md`. 4. This file.
   Then the latest handoff of this lane, `docs/handoff-deck-intelligence-2026-10-18.md`: its §8 is the next session's start.
5. `docs/readout/README.md`. 6. `docs/INDEX-where-things-live.md` (the catalogs the product already owns).
7. For the simulator: the header comments of `sim-engine.js`, `deck-measure.js`, `crankmagic-sim.js`;
   `docs/simulation-fidelity.md`; `docs/commander-simulator-plan-2026-09-15.md`; `.claude/skills/simulate-deck/`.
8. For the generator: `deck-generator.js`, `draft-builder.js`, `lineup-model.js`, `compliance-model.js`,
   `crankmagic-strategies.js`, `docs/crankmagic-strategy-trace-plan.md`.
9. For the graph: `crankmagic-graph.js`'s header, `crankmagic-loops.js`, `docs/crankmagic-loop-patterns.md`.

## 3. Your files

The Deck intelligence row of the charter's table (§3). The rule of the lane: **a screen never computes a number.**
You ship a pure function (UMD, like `deck-generator.js`: Node and the browser from one file) with fixtures and a
break; Codex renders it. When a screen needs a shape you have not built, the Workshop files a request; you answer
with the function first.

## 4. The order of work

| Order | Issue | Why now |
| --- | --- | --- |
| 1 | ROB-114 composition model; ROB-115 synergies and chains | The Workshop's Tune tab (ROB-113) waits on both |
| 2 | ROB-131 card resolution | Add cards (ROB-105) waits on it; the lobby's paste and ROB-86's names use it |
| 3 | ROB-109 `buildFromCriteria` | The Lab's new screen (ROB-110) waits on it |
| 4 | ROB-104 Commander legality | Small; the lobby and the Lab both call it |
| 5 | ROB-119 `buyPlan` | The priority dial (ROB-118) waits on it |
| 6 | ROB-117 swap records; ROB-111 compliance explained | Complete the tuning and creation stories |
| 7 | ROB-84 the audit, then ROB-116 simulation fidelity | The largest item; needs the engine's headless entry point (ask in ROB-11 early) |
| 8 | ROB-128, ROB-130, ROB-129 the AI features; ROB-132 with Engine | After ROB-95's settings are set by Rob |
| 9 | ROB-121 price refresh; ROB-123 preferences; ROB-112 reasonableness | As their dependencies land |
| always | ROB-138 the readout; ROB-137 the checklist once Rob approves | Keep them honest |

## 5. Seams

- **Serve the Workshop and Play:** every model ships as a function with a fixtures file under `tests/fixtures/` and
  a suite under `tests/`; the Linear issue carries the function's signature before the screen issue starts.
- **Ask the Engine:** a headless N-game entry point (ROB-116); migration numbers if an AI feature needs a table
  (ROB-132's meter is Engine's); routes in `cloud/worker.mjs`.
- **Ask Rob** through Rob's call issues mirrored in your feed: the game's name (ROB-139, filed), the launch checklist
  (ROB-137), the price schedule (ROB-121), AI spend above the caps.
- **Write Grok's packages** for bounded proof in your area (budgets ROB-136 is yours to review and merge; a fixture
  of 200 real-world card lines for ROB-131 is a good Grok task).

## 6. Decide, or surface

Decide: how a model computes, as long as the issue's acceptance holds and the evidence is shown; data refreshes
within the committed stores; fixtures; the readout's layout. Surface to Rob: any AI call outside the caps or a new
paid service; a change to an outcome's words in `north-star.json`; anything that would make the simulator's score
mean something different on screen (agree the label with the Workshop first); the format field (ROB-140) when you
next touch the deck record.

## 7. Done, and proof

Done when: merged on a green run; the function has fixtures and a break (`game/tools/batch/breaks-<topic>.py`); the
suite names what the number is not; the screen issue (if any) is unblocked in Linear and in the Workshop's feed;
evidence on the issue. Proof before a push: the suites of the files you touch, `tests/data-integrity.mjs` when a
suite or data file is added, `tests/feature-wiring.mjs` for wording, `tests/asset-versions.mjs --update` after the
pin cascade when a served file changed, `tools/local-ci.sh <head> 0`.

## 8. The readout

Yours twice over: your own feed at every merge, and the page itself. When Rob changes an outcome's words, change
`north-star.json` the same day. When a workstream's feed is stale on the page for a week, say so in ROB-11. The
validator (`tests/readout-feeds.mjs`) runs in CI; its breaks are `game/tools/batch/breaks-readout-feeds.py`.

## 9. Tools and habits for this lane

- `simulate-deck` for any measurement claim; `crankmagic-refresh` for data; `crankmagic-live-load-sync` when Rob
  asks for his decks.
- `/code-review` and `/security-review` before ready; `/simplify` on a model file before its PR.
- Subagents for parallel fixture building and card-text reading; the orchestrating context stays small.
- The Linear connector for every status and comment; the GitHub connector for PRs; never a bare `#123`.
- Model choice: mechanical steps (fixtures, data reshaping) on the cheapest model that passes the suite; design and
  rules reasoning on the strongest. Keep prompts cache-friendly: stable prefix, volatile tail.
