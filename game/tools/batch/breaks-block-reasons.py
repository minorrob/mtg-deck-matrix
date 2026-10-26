# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""A block tile's restriction and draft refusal come from the same engine that checks the declaration."""
SUITES = ['tests/room-block-check.mjs']
BREAKS = [
 ('menace restriction hidden', 'game/engine/rules/combat.mjs',
  '...(hasNow(state, attacker, "Menace") ? ["Menace: needs two or more blockers"] : []),', ''),
 ('flying restriction hidden', 'game/engine/rules/combat.mjs',
  '...(hasNow(state, attacker, "Flying") ? ["Flying: needs flying or reach"] : []),', ''),
 ('room drops attacker refusals', 'game/room/room.mjs',
  '...(checked?.byAttacker?.length ? {byAttacker: checked.byAttacker} : {})', '{}'),
]
