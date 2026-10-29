# W1 battle continuation at the context checkpoint

No Battle final definition was loaded or promoted. This is unfinished wave-0 debt, not a passed gate or an ignore.
The root requested a clean published checkpoint before large battle runtime edits. No battle engine edits have begun.

- Preserved behavioral RED witness: `W1-battle-protector-red.mjs.txt`, the exact test originally run as `tests/engine-battles.mjs`.
- Restore the fixture to that test path before implementing; it expects a public cast Siege to ask for its protector while still on the stack.
- Measured RED: `node tests/engine-battles.mjs` failed: resolving a Siege asks its controller to choose an opponent as protector; actual undefined, expected rule-operation.
- The witness then requires every eligible opponent, JSON reload, an explicit protector answer, four defense counters, actual arrived identity and resolved entering life gain.
- W4 handed combat ownership to W1 after source `89bfae71`; root authorized and W1 merged full checkpoint `ae9e3daa`.
- Current W1 also merged exact W5 `5a004e44`; W5 owns generic cost/funding work. No actions/asking edits were made by W1.

## Required native seams, read from the local CR

1. CR 310.4: defense characteristic in schema/compiler/state/front-back/copiable values; entry defense counters through both native and legacy entry readers, with replacement ordering intact.
2. CR 310.9a, 310.12a: controller explicitly chooses a Siege opponent as protector before entry. The no-battle-type rule determines its controller without a choice.
3. CR 310.5, 310.9b-d: a battle is attacked as an object; its protector is the defending player and sole blocker controller, independent of its controller. Its controller may attack it.
4. Combat `battleId`/`battle` target identity must propagate through choice, declaration, saved assignment, events and projection. Leaving combat must never redirect damage to a player.
5. CR 120.3h, 310.6: combat and noncombat damage remove defense counters; multiple relevant permanent types each get their own damage results.
6. CR 310.7-8, 704.5v-w: zero-defense battles go to the graveyard with the Siege waiting-trigger exception.
7. CR 310.11, 704.5x-y: protector departure/invalidity requires an explicit replacement choice; account for a battle currently attacked and no legal protector.
8. CR 310.10: battles cannot stay attached. Copying a battle does not copy its protector; an existing protector survives copying/type loss (310.9g).
9. CR 310.12b: native Siege last-defense trigger exiles that exact battle, then offers optional free transformed casting; leaving/reentering identity, declined casting, back-face targets/additional costs and tokens need actual public witnesses.
10. W5 explicitly cleared W1 to add a transformed flag to effect-paid `play`/cast-choice and stack-face preservation after synchronization, without changing generic funding logic. W1 has not implemented that seam.

The other remaining generic emblem audits are Daretti's owner-graveyard delayed return and Teferi, Who Slows the Sunset's native untap/draw actions. Their public rulings are cached in the task scratch folder; no undefined final may be promoted before wave 0 closes.
