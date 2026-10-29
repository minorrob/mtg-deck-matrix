# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
SUITES = ['tests/engine-load100-mana.mjs']
ACTIONS = 'game/engine/rules/actions.mjs'
TOKENS = 'game/engine/script/effects/permanents.mjs'
BREAKS = [
    ('graveyard cards extend affordable X', ACTIONS,
     'C: (pool.C ?? 0) + delveMana', 'C: (pool.C ?? 0)'),
    ('X spells may delve', ACTIONS,
     'const delvers = hasDelve(state, id) ? delvable(state, player, id) : [];',
     'const delvers = X === null && hasDelve(state, id) ? delvable(state, player, id) : [];'),
    ('delve checks the announced X total', ACTIONS,
     'cost: xCounted(anyTypeCost(reckoned.cost, permission), action.x ?? 0)',
     'cost: anyTypeCost(reckoned.cost, permission)'),
    ('delve reckons reduction after X is announced', ACTIONS,
     'action.extraMana ?? "", action.targets, action.x);\n  return {cost: xCounted',
     'action.extraMana ?? "", action.targets);\n  return {cost: xCounted'),
    ('flashback may be funded before floating mana', ACTIONS,
     '&& (xMana === null || tapsForX) && !tapsAny',
     '&& (xMana === null || tapsForX) && !back && !tapsAny'),
    ('created shock tokens use native entry choices', TOKENS,
     'if (!["createToken", "copyPermanent", "investigate", "incubate"].includes(effect.effect)) return null;',
     'if (!["copyPermanent", "investigate", "incubate"].includes(effect.effect)) return null;'),
    ('copied shock tokens use native entry choices', TOKENS,
     'if (!["createToken", "copyPermanent", "investigate", "incubate"].includes(effect.effect)) return null;',
     'if (!["createToken", "investigate", "incubate"].includes(effect.effect)) return null;'),
]
