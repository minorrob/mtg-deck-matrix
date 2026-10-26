# Session E · Engine (Claude · Engine lane)

Repo minorrob/mtg-deck-matrix. Branch `claude/r4-e-engine` from `integration/r4`. PR against `integration/r4`; do not merge. Starts when S0 has merged. Its PR should be the first one M merges, because A and C build on it.

Read first: `00-task-list.md`, `01-unified-change-set.md` §0–§2 and §3.7, `AGENTS.md`, `docs/ACTIVE.md` (the Requests table), `game/engine/script/bind.mjs` (`countedChoice`, targets as part of the offer), `game/engine/rules/untap-mana.mjs`, `game/room/room.mjs` (`takeBackLand`, `untapMana`, decisions), `game/engine/rules/actions.mjs`.

## Scope

CH-55, CH-56, CH-57, CH-58, CH-59, CH-60. Files: `game/**`, `cloud/game-room.mjs`, engine tests, `docs/ACTIVE.md`. The UI reads `CrankRoomView@1`; every field you add is additive and documented in the view's contract.

## Change

1. **CH-55 Prepared (bug, P1).** For every card with Prepared in the card data (Studious First-Year is the reported case): after the creature half resolves prepared, the player is offered to cast the copy exactly as the Oracle text allows (timing, cost, how often). The copy is a spell, never a permanent, unless the rules say otherwise. Confirm the rule from the repo's Oracle text, not memory. Find the fault: the card model (halves not separate), the room (no option offered) or the board's timing; fix at the source. Breaks script that turns the test red.
2. **CH-56 Option fields for the desk.** On every decision option that is a target or an effect choice: `controllerId` (today only on counted targets: add it everywhere a permanent or player is offered), `effect` (the engine's verb for what reaches this target: Destroy, Exile, Return, Tap, Counter, Copy, Gain control of…, from the script's effect name), `affected` (the card id the question is about, when it differs from the acting card), `optional: true` when the effect is a "may" (so the board offers Don't [verb]). Names in the view contract; a fixture decision with three effect groups and five targets in one group for the board's tests (W02–W04).
3. **CH-57 Undo window (house rule).** Key `houseRules.undoLastPlay`, on by default until the house-rules screen exists. A play made this step is undoable while: no other player has had priority since, nothing else went on the stack (its own triggers included), no card was drawn or revealed, no random outcome happened. Undo rewinds the play (a game restored from a copy, checked by hash, on `takeBackLand`'s pattern), restores the land drop for a land, untaps the mana tapped for it (`untapMana`), and writes "undone" to the log for every seat. The view exposes `undoable: true` on the play and `canUndo` on the seat. Undoing a card untaps the lands it used (D5).
4. **CH-58 Untap a just-tapped land.** A room action that untaps a land tapped this step for mana while that mana is unspent (D5: the player double-clicks the tapped card again). Privacy checks pass; no hidden information moves.
5. **CH-59 Game-over record.** When a game ends, file one record under each human seat's deck: date, outcome, finish turn, pod size, bracket, opponents' commanders, seat; expose it on the view for the results panel (F2 builds the panel).
6. **CH-60 Block refusal reasons.** `legalBlocks` results carry `reasons[]` strings per attacker ("Menace: needs two blockers", "Can't block flyers") for the refused tile state (B's W07).

Do not: change rules beyond these; touch any UI file.

## Acceptance

- CH-55: a scenario test casts Studious First-Year as a creature, resolves prepared, and asserts the copy offer with its timing; a second asserts the copy resolves as a sorcery.
- CH-56: every target option in a fixture has `controllerId`; options for a three-effect spell carry three distinct `effect` values; a "may" effect carries `optional`.
- CH-57: undo after a land play restores the land drop and the land to hand; undo after a mana-tapped cast untaps those lands; undo is refused once an opponent has acted, a card was drawn, or a trigger went on the stack; the log shows "undone" to every seat; hash check passes.
- CH-58: tap, untap-again, tap again, spend; untap refused once spent.
- CH-59: a finished two-seat AI game writes one record under the human deck.
- Breaks scripts for each.

Test: engine suites + `tests/game-room.mjs`; `tools/local-ci.sh`; one green Actions run. PR title `r4 E: Prepared fix, option fields, undo window, untap-again, game record, block reasons`. List the view fields added. Stop.
