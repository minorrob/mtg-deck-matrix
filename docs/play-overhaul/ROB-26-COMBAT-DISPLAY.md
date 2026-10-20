# ROB-26, first slice: the confirmed combat picture

Branch: `codex/play-combat-display`, PR #799, created from main `d7eadfe1`
with #798 integrated as its pending dependency.

Show the room's confirmed attackers, attacked player or planeswalker, and
assigned blockers together, grouped by defender and keyed by object ID. Keep
the existing blocker decision as the input until the direct-assignment slice.
Only the room's combat projection is public; a player's unfinished draft must
never be presented as a confirmed block.

Verify multiplayer grouping, same-name objects, face-down identities, removed
objects, awaiting versus confirmed blocks, and cleanup when combat ends.
The strip must fit desktop and phone, preserve the decision's pointer reach,
and offer inspection without sending a game action.

The shared header reserves 130px for combat in all three desktop views; the
existing phone gets the same strip beneath its turn pill, with battlefield
padding reserved below it. Defenders are side
by side, attackers are separate rows with visible object IDs, and the strip
scrolls when crowded. A room refresh keeps its position. Clicking a thumbnail
opens inspection only. Card art can fall back to a back with the name and ID
still readable.

The strip reads only `state.combat` and battlefield objects. Same-name cards
remain distinct; face-down objects stay unnamed even during inspection. A
removed target is labeled by its object ID without looking in private zones.
A blocked attacker remains blocked when its blockers leave the battlefield.
The contract does not distinguish an unanswered block assignment from a
confirmed empty assignment, so those rows say **No blocks confirmed**, without
promising damage. The existing list remains the blocker input; direct selection
and server draft validation are the next ROB-26 slice.

`tests/board-combat-display.mjs` uses explicit synthetic socket views for a
defending seat. It checks Full/Table/Focus, phone, private draft selection,
inspection without an answer frame, grouping, target IDs, face-down cards,
removal, cleanup and scroll retention. Mouse coordinates are hit-tested with
`document.elementFromPoint` at 1024x768, 1280x720 and 1400x900, including both
blockers and the planeswalker target. All eleven deliberate regressions in
`breaks-combat-display.py` are caught, with `missed: []`: ten in the main run,
then the added phone-space regression after review found the strip covering the
defending creature. The final baseline and that regression both exercise the
creature's actual pointer target on the phone.

Screenshots carry stable label C26 and object IDs:

- [1280x720](screenshots/rob-26-combat-1280x720.png)
- [390x844](screenshots/rob-26-combat-390x844.png)

Art is stubbed in this suite; the screenshots prove the fallback. The phone is
still the existing rotated baseline pending approved ROB-18. Physical-phone
interaction and hardware WebGL remain unproven.

The whole-game harness compares rendered attacker, target and blocker IDs with
the real room at held human decisions and requires a comparison per game.
`GAMES=1 python game/tools/batch/breaks.py game/tools/batch/breaks-combat-journey.py`
passes its baseline and catches the missing-display regression.

Local browser proof uses `GEOMETRY_REQUIRED=1`, `REAL_DECKS_REQUIRED=1` for the
journey, and installed Chrome:

- Board: 281; accessibility: 298; Settings: 68; shared shell and tabletop pass.
- `node tests/uat/solo-vs-ai.mjs`: 42 checks, three games ending on turns 38/34/41,
  all six Shared decks represented, 78 actual combat projections compared
  (22/25/31), 585 replay visibility checks across 598 browser frames, identical
  replays and no AI refusals. The ROB-166 early-end banner still reproduces in
  the first two games; its room reason remains requested from Engine.
- Wiring: 124; readout: 1091; data integrity and the breaks-anchor scan pass.
- Read-only review's phone-space finding is fixed and has its own caught break.

Final pins, exact-head CI and Engine-owned staging acceptance remain outstanding.

For the next slice: map `legalBlocks` pairs back to the room's existing option
indices; keep an accessible list; make reassignment and clearing explicit.
The `checked` reply carries a choice ID but no draft ID, so serialize check
requests and discard results if the draft or authoritative decision changed.
Only the current accepted draft enables Confirm. No blocks is an explicit
empty-index answer, never a local life change.
