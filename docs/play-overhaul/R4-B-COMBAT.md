# r4 B combat checkpoint

The strip is one scrollable row. Each own attacker has a local unsettled/ready/refused state;
Confirm in the desk settles only that attacker, and Don't block clears only its pairs. Send
blockers is the one binding control and requires all own attackers settled plus a current valid
server check. The original one-check-in-flight key and stale-response behavior remain.

A blocker moves away from another attacker only when decision.exclusiveBy says cardId. Expanded
capacity remains the engine's choice; absence of that metadata does not invent exclusivity.
Only current byAttacker reasons or explicit refused-blocker facts set a per-attacker refusal.
Global reasons are shown separately as a Draft check, never assigned to unrelated attackers.

The per-attacker desk shows legal blocker tiles, current derived P/T and twin letters. Click
again unpicks; selected tiles invert to ink. Hover/focus highlights the exact current object on
the mat. Visible object numbers, the old blocker-first selection and All block options are removed.

Initial implementation checkpoint: browser acceptance and mutation proof pending. Syntax checks
passed. The coordinator's phone inset fix is merged before browser proof; the general 15px/HUD
caption audit remains with the final C/D2 pass.

Browser fixture: tests/board-r4-combat.mjs covers two attackers, movement, independent settlement,
exact indexes once, no early act, stale send revision, server refusals/global attribution, multiple
blockers and nine-attacker scrolling across Table/Focus/3D/phone and representative skins.
