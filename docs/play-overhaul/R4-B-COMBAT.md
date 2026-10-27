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

Browser baseline: `node tests/board-r4-combat.mjs` passes 89 checks in the full matrix.
It also verifies one-press native planeswalker inspection, pointer hit-testing for Send and
sibling participant inspection buttons rather than nested interactive controls. Phone Camera/Table
remain in their top row during combat and no longer cover Send. Mutation proof remains pending. The coordinator's phone inset fix is merged before browser proof; the general 15px/HUD
caption audit remains with the final C/D2 pass.

Browser fixture: tests/board-r4-combat.mjs covers two attackers, movement, independent settlement,
exact indexes once, no early act, stale send revision, server refusals/global attribution, multiple
blockers and nine-attacker scrolling across Table/Focus/3D/phone and representative skins.

Coordinator owns completion of three legacy migrations and canonical mutation proof. The current
board-combat-display and board-person adaptations are handed over with syntax checks only; they
are not claimed green. board-direct-blocking is still the old fixture at this checkpoint. Existing
serial-check, stale-response, privacy, capacity and real pointer assertions must be retained.

Mutation runner: `python game/tools/batch/breaks.py game/tools/batch/breaks-r4-combat.py`.
Screenshots: r4-combat-<view>-<width>.png in the same task evidence directory as A/D1.

## Canonical acceptance

The coordinator proved board-r4-combat (96), board-direct-blocking (8 layouts, including tall text and crowded choices) and board-combat-display (6 layouts). Legacy privacy, serial/stale validation, reconnect retry, keyboard and real pointer checks were migrated rather than dropped. They exposed and proved fixes for a missing Check again control, the phone attacker opener, and a clipped attacked-permanent reference. All seven meaningful mutations were caught. The selected-color mutation targets the winning shared !important rule; changing only a redundant tile declaration had no rendered effect. Final combined HUD endpoints, C/D2 and staging remain separate gates.
