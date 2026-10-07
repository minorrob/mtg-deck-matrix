# Train B continuation proof, October 7, 2026

Branch: `claude/admiring-franklin-58cxy4`, continuing `d8774b32` in PR #669.
The B4, B6 and B3 saved patches are applied. Generated files were rebuilt rather than
merged. No unfinished B5 work or unfinished card drafts are claimed as completed.

## Changes and regressions

The patches add 25 card definitions and their scenarios. Twenty-two dedicated suites
cover attack restrictions and requirements, ability permissions, sacrifice amounts,
linked and hidden exile, last-known information, copied abilities, card choices,
transforming, life exchange, per-creature damage, connive, preparation, monstrosity,
triggers and target constraints. README lists each suite.

The continuation also fixed four problems found while proving the patches:

- A player who controlled a hideaway source lost permission to look after losing control.
  Entitlement now persists in state; projecting a view remains read-only.
- A replacement redirecting a manifested card to exile incorrectly kept it face down.
  The intended and actual destinations now determine face-down status and public events.
- The pilots could fill a capped planeswalker's attack slot with an optional attack and
  fail a mandatory attack. They now solve requirements together and retain compatible
  optional choices.
- Capped attacks counted creatures rather than separate requirements. Nested requirement
  tiers now enforce the maximum while leaving every tied legal choice to the player.

## Verification

Executed on Personal-HP with Node 22.23.3. The complete repository gate belongs to Actions;
the local aggregate was restricted to the affected engine, game and room suites plus all
36 Commander companion suites. The CPU-sensitive room-games suite is run alone.

| Check | Result |
| --- | --- |
| All `tests/engine-*.mjs`, `tests/game-*.mjs`, `tests/room-*.mjs` except room-games, plus `game/tests/*.test.mjs` | 282 suites passed |
| `node --stack-size=4000 game/tools/batch/check-cards.mjs` | 1,681 definitions; 2,747 scenarios; zero failures |
| `python game/tools/batch/breaks.py game/tools/batch/breaks-b4-permissions.py` | Green baseline; all 35 deliberate faults caught and restored |
| `python game/tools/batch/breaks.py game/tools/batch/train-b6-breaks.py` | Green baseline; all 28 deliberate faults caught and restored |
| `python game/tools/batch/breaks.py game/tools/batch/breaks-x11-b3.py` | Green baseline; all 34 deliberate faults caught and restored |
| `node tests/data-integrity.mjs` | Passed; README names all 360 Node suites |
| `node tools/data-inventory.mjs --check` | Passed, 77 artifacts |
| `node tests/asset-versions.mjs` | Passed, 119 assets; no changed pinned browser assets |
| `node tests/feature-wiring.mjs` | 124 checks passed |
| `node tests/engine-catalog.mjs` | 39 checks passed |
| `node tests/engine-room-games.mjs` alone | 58 checks; all ten four-seat games finished; CPU and derivation budgets passed |
| `node --check` on every changed JavaScript module; `git diff --check HEAD` | Passed |

Set `NODE` to the Node 22 executable before the Python fault runner. Run fault specifications
serially, with no other engine tests or edits, because each briefly changes and restores a
source file. The final B4 run includes the weighted-requirement regressions. There are 97
faults in total, including guards, behavior branches and construct credits.

The first broad run found five failures: one new test still being authored, three stale
construct-credit expectations, and the manifest replacement regression. The final 282-suite
aggregate passed after those corrections. No failed first run is counted as a pass.

The final standalone performance check initially failed: seed 4 used about 30 seconds of
CPU and exceeded its 25-yardstick budget. Removing weighted attack requirements still
failed the overall budget (9.5 against 9), so that experiment was restored. The hideaway
checkpoint was deriving controllers for public linked exile, where no look entitlement is
needed. It now visits only face-down cards; attack caps are also computed only when a
requirement needs them and reused across tiers. The unchanged gate then passed all ten
games, with seed 4 at 17.1 seconds elapsed and 14.2 yardsticks per thousand events. The
attack-requirement and hidden-exile regressions passed after these changes. Budgets were
not raised. The games still include survived pilot refusals (seed 4 has 18); this is not a
claim that real-deck games are refusal-free.

The repository has no separate TypeScript or package-based lint pipeline; syntax, schema,
catalog, wiring, integrity and behavior checks are the applicable local checks.

## Limits

These results do not establish production readiness. The seven committed decks have
423 of 477 confirmed definitions. Fifty-three cards have no playable definition; Tegwyll,
Duke of Splendor has only a provisional definition and is not confirmed for seating.
The inventory's empty blocker list is not proof that every required rule is implemented.

Full Actions results, the pre-push scan and the exact commit are recorded in the PR and
the session report. Workers Builds preview failures are tracked separately as D8. Live
staging identities, real-network latency, the complete real-deck journeys and production
release acceptance remain separate gates in `production-readiness-2026-10-07.md`.
