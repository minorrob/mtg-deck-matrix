# ROB-26, first slice: the confirmed combat picture

Branch: `codex/play-combat-display`, created from main `d7eadfe1` with #798
integrated as its pending dependency.

Show the room's confirmed attackers, attacked player or planeswalker, and
assigned blockers together, grouped by defender and keyed by object ID. Keep
the existing blocker decision as the input until the direct-assignment slice.
Only the room's combat projection is public; a player's unfinished draft must
never be presented as a confirmed block.

Verify multiplayer grouping, same-name objects, face-down identities, removed
objects, awaiting versus confirmed blocks, and cleanup when combat ends.
The strip must fit desktop and phone, preserve the decision's pointer reach,
and offer inspection without sending a game action.

Implementation, browser proof, deliberate breaks, screenshots, asset pins,
exact-head CI and Engine-owned staging acceptance remain outstanding.
