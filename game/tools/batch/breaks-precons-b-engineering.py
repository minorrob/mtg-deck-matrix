# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""The precon load of 2026-10-25, lane B (Keen Engineering): one break for each engine change.

- "Unless that player is the monarch" (Fall from Favor; CR 725): a selector's `monarch`, script/filter.mjs.
- The players a creature dealt combat damage to this turn (Steel Hellkite; CR 510.2): rules/combat.mjs keeps them on the
  source, rules/layers.mjs `lastKnown` carries them, and a selector's `controllerDealtCombatDamageBy`, script/filter.mjs.
- Imprint's power, toughness and creature types of the last creature card exiled (Duplicant; CR 607.2a, 613.1d, 613.4b):
  rules/layers.mjs `linkedCreatureGrant` and `counted`'s `countedAs`; its compiler check, cards/index.mjs.
- "When this artifact enters during the declare attackers step" (Misleading Signpost): script/condition.mjs `duringStep`.
- What an attacking creature attacks, reselected (Misleading Signpost; CR 508.7): script/effects/asking.mjs
  `reselectAttack`, declared in script/effects/index.mjs and game/engine/vocabulary.mjs.

Run from the repository root, with nothing else editing the worktree:

    python -u game/tools/batch/breaks.py game/tools/batch/breaks-precons-b-engineering.py
"""
SUITES = ['tests/engine-precons-b.mjs', 'tests/engine-vocabulary.mjs']
FI = 'game/engine/script/filter.mjs'
CB = 'game/engine/rules/combat.mjs'
LA = 'game/engine/rules/layers.mjs'
IX = 'game/engine/cards/index.mjs'
CO = 'game/engine/script/condition.mjs'
AS = 'game/engine/script/effects/asking.mjs'
EI = 'game/engine/script/effects/index.mjs'
VO = 'game/engine/vocabulary.mjs'
BREAKS = [
    # Fall from Favor
    ('the monarch selector ignored', FI,
     'if (selector.monarch !== undefined && ((state.monarch ?? null) === controllerOf(state, id)) !== selector.monarch) return false;', ''),
    ('the monarch selector unchecked at compile', FI,
     'if (selector.monarch !== undefined && typeof selector.monarch !== "boolean") throw',
     'if (false && selector.monarch !== undefined && typeof selector.monarch !== "boolean") throw'),
    # Steel Hellkite
    ('no record of the players a source dealt combat damage', CB,
     'state.objects[hit.source].combatDamaged = {turn: state.turn,', 'state.objects[hit.source].combatDamagedOff = {turn: state.turn,'),
    ('a second combat forgets the first', CB,
     '...(record?.turn === state.turn ? record.players : []), hit.toPlayer', 'hit.toPlayer'),
    ('an earlier turn\'s players kept', CB,
     'record?.turn === state.turn ? record.players : []', 'record ? record.players : []'),
    ('the record not carried as it last was', LA,
     '...(object.combatDamaged ? {combatDamaged: structuredClone(object.combatDamaged)} : {}),', ''),
    ('the dealt-combat-damage selector ignored', FI,
     'if (!record || record.turn !== state.turn || !record.players.includes(controllerOf(state, id))) return false;', 'if (false) return false;'),
    ('the dealt-combat-damage selector reads any turn', FI,
     'record.turn !== state.turn || !record.players', '!record.players'),
    ('the source gone, its last known record unread', FI,
     'state.objects[context.source]?.combatDamaged) || context.lastKnown?.combatDamaged;', 'state.objects[context.source]?.combatDamaged);'),
    ('the dealt-combat-damage selector unchecked at compile', FI,
     'if (selector.controllerDealtCombatDamageBy !== undefined && selector.controllerDealtCombatDamageBy !== "self")',
     'if (false && selector.controllerDealtCombatDamageBy !== undefined && selector.controllerDealtCombatDamageBy !== "self")'),
    # Duplicant
    ('linkedCreature never read', LA,
     ': ability.apply?.linkedCreature !== undefined ? linkedCreatureGrant(state, id, ability) : ability;', ': ability;'),
    ('nothing exiled, read anyway', LA, 'if (!linked.length) return null;', 'if (false) return null;'),
    ('a noncreature card read as one', LA,
     '&& (state.objects[id].types ?? []).includes("Creature"));\n  if (!linked.length)', ');\n  if (!linked.length)'),
    ('creature types never set', LA, 'if (what === "creature types") return', 'if (what === "creature typesX") return'),
    ('a land type read as a creature type', LA,
     '...(card.subtypes ?? []).filter(isCreatureType), ...plusCreatureTypes', '...(card.subtypes ?? []), ...plusCreatureTypes'),
    ('no longer a Shapeshifter', LA, ', ...plusCreatureTypes])],', '])],'),
    ('a changeling card\'s every type lost', LA, '...(everyCreatureType(card.keywords) ? {allCreatureTypes: true} : {})}};', '}};'),
    ('a printed power and toughness not read', LA, 'if (Number.isInteger(card[key])) return card[key];', ''),
    ('a star read as nothing', LA, 'return defining ? defining.apply[set] : 0;', 'return 0;'),
    ('a star counted for Duplicant\'s controller', LA,
     'const context = effect.countedAs ? {...effect.countedAs, x: 0, affected}', 'const context = false ? {...effect.countedAs, x: 0, affected}'),
    ('a star counted with no card to count for', LA, 'countedAs: {controller: card.owner, source: cardId}};', 'countedAsOff: {controller: card.owner, source: cardId}};'),
    ('linkedCreature unchecked at compile', IX,
     'if (!(typesOk || statsOk) || Object.keys(rest).length || ability.affects?.self !== true)', 'if (false)'),
    # Misleading Signpost
    ('entering in any step triggers', CO, 'if (condition.duringStep !== undefined && state.phase !== condition.duringStep) return false;', ''),
    ('duringStep unchecked at compile', CO,
     'if ("duringStep" in condition && condition.duringStep !== "COMBAT_DECLARE_ATTACKERS")', 'if (false)'),
    ('no attack, reselected anyway', AS,
     'if (!attack) return false;\n    const places = attackPlaces', 'const places = attackPlaces'),
    ('what it attacks now offered again', AS,
     '.filter((p) => !(p.player === attack.defender && p.planeswalker === attack.planeswalker));', ';'),
    ('nothing else to attack, asked anyway', AS,
     'if (!places.length) return false;\n    state.awaiting = {kind: "effect-choice", effect: "reselectAttack"',
     'state.awaiting = {kind: "effect-choice", effect: "reselectAttack"'),
    ('leaving it reselects', AS, 'if (option.keep || !attack) return {events: []};', 'if (!attack) return {events: []};'),
    ('a planeswalker chosen is not attacked', AS,
     'if (option.planeswalkerId !== undefined) attack.planeswalker = option.planeswalkerId; else delete attack.planeswalker;', 'delete attack.planeswalker;'),
    ('a player chosen, the planeswalker still attacked', AS,
     'if (option.planeswalkerId !== undefined) attack.planeswalker = option.planeswalkerId; else delete attack.planeswalker;',
     'if (option.planeswalkerId !== undefined) attack.planeswalker = option.planeswalkerId;'),
    ('the new defender does not defend', AS, 'state.combat.defenders = [...new Set(state.combat.attacks.map((a) => a.defender))];', ''),
    ('its chooser gone, something reselected', AS,
     'nothing is reselected. */\n  left() {\n    return [];', 'nothing is reselected. */\n  left() {\n    return null;'),
    ('reselectAttack not declared as asking', EI, '  "reselectAttack"]);', '  ]);'),
    ('reselectAttack not in the vocabulary', VO, '    "reselectAttack",\n', ''),
]
