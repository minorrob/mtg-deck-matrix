# The brief for the executing session (Opus), 2026-10-03

Rob, 2026-10-03: the model of the review session changes to Opus and begins the merge and fix work in the same session.
This file is that session's working brief: what to do first, in what order, with what proof, and what this container can
and cannot do. It is operational; the reasoning is in `docs/plan-review-2026-10-03.md`, the order and the decisions in
`docs/plan-execution-2026-10-03.md`. Read `AGENTS.md` and `docs/ACTIVE.md` before anything, as always.

**Standing assumption, stated once:** Rob's word "begin executing the merge and fix work" is taken as his go for the
merges and for the fix steps in order, with the execution plan's recommended answers to D1-D12 wherever he has not
written another. Say so in the first PR. If he answers a decision differently, that answer wins from then on.

## 0. This container, and how to work in it

| | |
| --- | --- |
| Clone | `/home/user/mtg-deck-matrix`, shallow. The fetch refspec covers `main` only: to see another branch, `git fetch origin <branch>:refs/remotes/origin/<branch>`. Branch new work from `origin/main` after fetching it. |
| Toolchain | Node 22.22.0; Playwright 1.56.0 installed in the repository's git-ignored `node_modules`, Chromium at `/opt/pw-browsers`; `openpyxl` installed; 4 cores. `tools/local-ci.sh <ref> 1` takes about 16 minutes here; `2` about 33. Run it in the background and keep working. |
| Git identity | none is configured: commit with `git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit ...`, and end every commit message with the attribution trailers this session's reminder gives. |
| The Comprehensive Rules | fetched to a scratch folder, not committed (Wizards' text): `MagicCompRules-20260925.txt` under this session's scratchpad `rules/` folder (re-fetch with the URL in `game/tools/check-citations.mjs` if the folder is gone). Grep it to check a rule before citing its number; never copy its text into the repository. |
| GitHub | the `mcp__github__*` tools (no `gh`): `pull_request_read`, `merge_pull_request` (method `merge`), `update_pull_request` (to retarget a base), `add_issue_comment`. Every comment ends with the Claude Code footer. |
| Cannot do here | merge if the permission check refuses the tool (say so and stop at that point); deploy (wrangler's asset upload is refused under the proxy's token, 401); a phone, Firefox, Forge or the JDK. |
| Suites | engine suites with `node --stack-size=4000 tests/engine-<name>.mjs`; the board suite needs `GEOMETRY_REQUIRED=1`; before a push, `tools/quick-check.sh <touched suites>` (the scan, the merge with main, the suites). Never the whole gate twice on a whim: once per PR head, in the background. |
| Ratchets | US English (`tests/feature-wiring.mjs`); every engine file carries Rob's copyright header (`tests/engine-headers.mjs`); a new suite is listed in `README.md` ("There are N Node suites here", N and the list) and `tests/data-integrity.mjs` knows it; a new effect primitive goes in `game/engine/vocabulary.mjs`, `docs/engine/PLAN.md` §12.2 and `tests/engine-vocabulary.mjs`'s count; a served file that changes moves its pin (`tools/bump-pins.mjs`, then the chain it names, then `node tests/asset-versions.mjs --update`). Engine modules under `game/` are bundled into the Worker at release and carry no pin. |
| Proof | a test red first, then green; a break per guard (`python3 game/tools/batch/breaks.py <file>` after a green baseline; check `git diff` for a leftover break afterward); the touched suites; the gate on the head; the PASS block on the PR; `docs/ACTIVE.md` updated and pushed at the end of every session. |

## 1. Phase A -- the merges, in this order

Base unmoved: `main` is eb149397 and nothing has been pushed to the repository since the handoff except
`claude/plan-review-2026-10-03`. Each merge is a **merge commit** (never a squash), made after reading the PR's head,
its mergeable state and the PASS block that covers it. Post the PASS block as a comment where the PR does not carry it
yet (the footer on every comment).

| Order | PR | Head | Base now | Gate that covers it | Before merging |
| --- | --- | --- | --- | --- | --- |
| 1 | #571 Skip to end race | d8a2fdba | main | its own PASS on d8a2fdba, posted on #571 | -- |
| 2 | #572 Coach ⋯ menu | f8aa981b (contains #571) | main | the merge spot 18c07644 (#572's head merged with #574's) passed `local-ci 18c07644 2`: 2 × 272 suites and 262 game tests | post the merge-spot PASS block on #572 |
| 3 | #573 batch 79 | e84417dc | main | the same merge spot | post the merge-spot PASS block on #573 |
| 4 | #574 batch 80 | e2e40314 | `claude/cards-batch-79` | the same merge spot | **retarget to `main`** (`update_pull_request`, base `main`) once #573 is in, then post the block |
| 5 | #575 the handoff record and plans | 849845bf (the merge spot plus docs) | main | its own PASS on #575, and the review session's `local-ci 849845bf 1` (PASS, 272 suites, 988 s) | -- |
| 6 | #576 the plan review | d96cac27 (849845bf plus three docs) | `claude/handoff-2026-10-03` | none yet | start `tools/local-ci.sh d96cac27 2` in the background at the very beginning of the session; **retarget to `main`** once #575 is in; post the PASS block; merge |

After all six: `git fetch origin main` and check `git rev-parse origin/main^{tree}` equals `git rev-parse d96cac27^{tree}`.
Every head contains the one before it, so the trees must be equal; if they are not, stop, say what differs, and do not
release or build on it.

If `merge_pull_request` is refused by the permission check, say so to Rob in one line (which PR, the error), leave the
merges to him in this order, and go on to Phase C on a branch from 849845bf (the tree main will have), as #575 and #576
did; rebase onto `main` once he has merged.

## 2. Phase B -- the releases (Rob's, from Personal-HP)

This container cannot deploy. Say once, after the merges: staging and production release from a detached `origin/main`
checkout on Personal-HP, as `docs/ACTIVE.md`'s previous record (Questions 0) and `docs/release-pages.md` say; Workers
Builds and their previews off for both Workers (execution plan, D8). Do not wait on it; begin Phase C.

## 3. Phase C -- the fixes, one PR at a time, in this order

Each PR: its own `claude/<topic>` branch from `origin/main` (or from 849845bf while the merges wait), a draft PR when
pushed, the gate on its head in the background, the PASS block on the PR, merged on the gate, `docs/ACTIVE.md` updated at
the end of the session. The commit message says what changed, why, and the proof, in the repository's own style.

### C1 = X1, the commander layer (branch `claude/engine-commander-identity`)

What is wrong, and where (each played in the review, Part 6, probes P1-P5):

1. `game/engine/rules/commander.mjs` keys the tax by the object id (`commanderCasts[objectId]`) and
   `game/engine/rules/sba.mjs` keys the damage tally the same way; `state/index.mjs` `moveObject` makes a new object on
   every zone change (CR 400.7), so both forget the commander the first time it leaves the battlefield.
2. `game/engine/rules/combat.mjs` `combatDamage.deal` sends a player's damage through `changeLife`; `dealCommanderDamage`
   (`sba.mjs`), the only writer of the tally, is reached by nothing in the game.
3. Only `sba.mjs`'s death path asks the owner about the command zone, and it asks **before** the card moves; every other
   path (`game/engine/script/effects/zones.mjs` `moveOne`: exile, destroy, bounce, mill, sacrifice) never asks.
4. `game/room/table.mjs` `readDeck` accepts any two legendary creatures as commanders.

Build it so:

- **Identity.** When the room adds a commander (`game/room/room.mjs` `start`, `addObject(..., commander: true)`) and when
  the scenario runner puts a card in the command zone, give the object a `commanderKey` (the owner and a stable index or
  the card's name: `${owner}:${name}`); `moveObject` carries `commanderKey` with `commander`, as it carries `owner`.
  `commanderTax`, `recordCommanderCast` and the tally use the key. The projection (`game/engine/projection.mjs`
  `commanderDamage`) keeps a shape the board can draw a bar per commander from: read how `crankmagic-board.js` consumes
  it before changing the keys, and keep its contract or extend it (`commanders: [{key, owner, name}]`).
- **The tally.** In `combatDamage.deal`, damage to a player from a commander records the tally whether the damage is life
  loss or, with infect, poison (CR 702.90b: it is still damage dealt). Reuse `dealCommanderDamage` or route both through
  one function; the loss check in `lossReason` stays per commander, never pooled (CR 903.10a).
- **CR 903.9a as a state-based action.** Remove the pre-move question from the death path, so the card reaches the
  graveyard and "whenever a creature dies" and its own "when this dies" see it. In `checkStateBasedActions`, for each
  object with `commander` in a graveyard or in exile that arrived there since the last check (track arrivals: a flag on
  the object set by `moveObject` for commanders, cleared once asked), set `state.awaiting = {kind: "commander-replacement",
  player: owner, objectId, to: the zone it is in}` and return; `finishCommanderReplacement` moves it from where it is to
  the command zone on "yes", and on "no" clears the flag and leaves it. Ask once per arrival. The house pilot answers yes
  (it already answers `boolean` with index 0); the scenario runner's `routine()` may answer it the same way.
- **CR 903.9b** (a commander that would go to its owner's hand or library may go to the command zone instead) is a
  replacement effect: build it only where the resolution machinery can pause before the move (an `effect-choice` from
  the effect that moves it); where it cannot, leave 903.9b named as deferred in `commander.mjs`'s header and in the PR,
  and do not fake it with a question after the card has been seen in hand.
- **Partner and background** at `readDeck`: two commanders only when both definitions carry partner (read how the
  definitions record keywords and `canBeCommander`), or one has "Choose a Background" and the other is a legendary
  Background, or they name each other with "Partner with"; otherwise refuse with the instruction, in the room's and the
  table's wording (AGENTS.md: the action is refused and the refusal says what is wrong and what to do instead).

Proof, written first, red, in `tests/engine-commander.mjs` and `tests/engine-sba.mjs` (through `runScenario` with the
engine's fixtures; the review's probe shapes, each expecting the **right** behavior):

```
P1  seat 0: command ["Boss"] ({R} 11/3 haste legendary fixture), battlefield Mountain x3; seat 1: battlefield Plains, hand
    Swords to Plowshares. tap Mountain, cast Boss, resolve; pass 1; seat 1 taps Plains, casts Swords at Boss, resolves.
    EXPECT the owner (seat 0) asked "commander-replacement"; after "yes", Boss in the command zone.
P2  the same with Terminate (Swamp + Mountain for seat 1). EXPECT the question; "no" leaves it in the graveyard.
P3  Zulaport Cutthroat on seat 0's battlefield; Boss bolted by seat 1 on turn 2. EXPECT Zulaport's trigger (seat 1 at 28
    after it resolves) AND the question, in that order: the death first, the state-based question after.
P4  after P3 and "yes": turn 3, seat 0 taps one Mountain. EXPECT cast Boss offered 0 ways (the tax is {2}); with three
    Mountains tapped, offered 1 way.
P5  Boss attacks for 11 on turn 1, dies on turn 2, returns, is recast on turn 3 and attacks again. EXPECT seat 1 lost to
    "commander-damage" with a tally of 22 under one key.
P6  readDeck with two legendary creatures that are not partners. EXPECT a 422 that names both and says why.
```

Then a break per guard (`game/tools/batch/breaks.py`), the engine suites, `tests/game-room.mjs`, `tests/table-lobby.mjs`,
`tests/table-board.mjs` (the bars toward 21 now move; add the check, remove none), and the gate.

### C2 = X2, the rules a player checks (branch `claude/engine-rules-player-checks`)

- **The legend rule** (CR 704.5j) in `checkStateBasedActions`: legendary permanents with the same name under one
  controller; more than one is a question for that controller (`awaiting: {kind: "legend-rule", player, objectIds}`,
  mode `one`: which to keep); the rest go to their owners' graveyards through `moveOne` (not destroyed: indestructible
  does not save them, dies triggers see them). Add the choice to `awaitingChoice` and `resolveAwaiting` in
  `rules/turn.mjs`; the house pilot keeps the first; the runner's `routine()` likewise.
- **CR 704.5q** in the same check: a permanent with both +1/+1 and -1/-1 counters loses N of each, N the smaller.
- **CR 510.1c** in `game/engine/controller.mjs` `validateCombatDamage`: no lethal-first order among blockers; amounts
  whole, each at most the total, summing to the total; damage to the player option (`defender: true`, tramplers only)
  only when every blocker has at least its lethal (CR 702.19b). Read `rules/combat.mjs` `combatDamage.choice` and
  `keywords/combat.mjs` `trampleOver` and keep them consistent; update the comment that cites CR 509.2 (that number is now
  the priority rule). The house pilot's lethal-first answer stays legal. `tests/engine-combat.mjs` and the board's damage
  dialog in `tests/table-board.mjs`.
- **Two exceptions a table reaches** (review, 2.11): `rules/combat.mjs` `blockers.choice` and `blockers.open` consider
  only attackers still on the battlefield (CR 506.4; remove a departed attacker from `state.combat.attacks` where it
  leaves, or filter with the `stillThere` test `combatDamage.deal` already uses); the house pilot never declares a single
  blocker on a creature with menace (read the attacker's keywords from its projection); and `game/room/room.mjs` `drive`
  catches a pilot's answer the engine refuses, logs it to the history, and answers with the minimal legal answer
  (no blocks, the first options up to `min`) rather than throwing out of `start` or `act`. Reproduce both first: seeds 10
  and 11 of the review's probe R are four house pilots on random definitions; a scenario that sacrifices an attacker
  after attackers are declared, and one where the pilot faces a menace attacker with one creature, are the direct tests.
- **CR 101.4** for "each player sacrifices / discards" (`script/effects/asking.mjs` `sacrifice.apply` and the discard's
  equivalent): collect every player's choice in APNAP order, then move all at once; the review's P8b is the red test
  (seat 0's Bear still on the battlefield while seat 1 is asked).
- **Which mana pays an "unless" cost or an attack tax** (`rules/mana.mjs` `payGeneric`): when `paymentOptions` finds more
  than one way, ask the payer (an `effect-choice`, the same shape as a cast's payment); pay automatically when one.
- **Several damage replacement effects** (`rules/replacement.mjs`, `leastFirst`): ask the affected player when the
  orders differ in outcome; keep the automatic answer only when every order gives the same amount (CR 616.1).

### C3 = X3, the conformance suite (branch `claude/engine-rules-conformance`)

`tests/engine-rules-conformance.mjs`: the review's Part 4, A4 lists the forty situations; each cites its rule by number
in its check's words, is written from the Comprehensive Rules (never from Forge), and was red before its rule was right
(the C1 and C2 cases move here or are referenced). Invariants over the harness's games follow in the same suite. Add it to
`README.md`'s count and list and to `tests/data-integrity.mjs`'s knowledge. G1's wording in `docs/plan-to-done-2026-09-30.md`
Part 7 gains "and the conformance suite green" (D4).

### C4 = X4, M5: the definitions at the table (branch `claude/table-serves-definitions`)

`cloud/game-room.mjs` takes `cards`; hand it the directory. `tools/release-pages.mjs` `workerModules` bundles the engine's
modules; add the definitions as one generated module (1.4 MB of JSON before compression; the scenarios are not needed) or
KV with the bundle as the fallback. Change deck shows "87 of 100 known · 13 to learn" per deck and seats a deck when it is
whole; the basic lands test deck stays. Turn the review's probe R into `tests/engine-room-games.mjs` (seeded four-seat
house-pilot games on random definitions, zero exceptions, a time budget per game); `tests/uat/play-e2e.mjs` with a
wholly defined deck at a playtest table; `tests/release-pages.mjs` for the bundle.

### Then X5 onward, as `docs/plan-execution-2026-10-03.md` orders them

D5 Shadrix Aristocrats whole (the "up to N targets" axis first), CI on the runner (Rob's registration), releases by
script, the board's one-click cast and the 1280 captions, the room's budget (`characteristicsOf` cached per object,
invalidated on change; the review's 2.12 has the profile), the measured velocity pilot, the other six decks one at a
time, G1, the gates.

## 4. How to work so the work holds

- Read the module's header comment before changing it; the engine's comments are its design, and most say what is
  deferred and why. Keep that habit: every deferral named, never silent.
- One question at a time to the engine's players; where the rules leave no choice, say so in a comment with the rule's
  number. Where you find the code deciding for a player, that is a defect to fix or to name, not a shortcut to keep.
- Never a Forge script, source or data read for anything but counting (ADR-001). The Comprehensive Rules and the card's
  oracle text are the only sources; cite numbers, never text.
- A test that cannot fail is a comment: break the guard, watch the suite go red, restore it, and say so in the commit.
- Do not widen a PR. A finding outside the step goes to `docs/ACTIVE.md`'s "named and not built" list or the next step.
- Say what was proven and what was assumed in the same words AGENTS.md uses, and name the command for each claim.
- When blocked on something only Rob can do (a merge refused, a deploy, a decision answered otherwise), say it in one
  line and keep going on the next thing that does not depend on it.
