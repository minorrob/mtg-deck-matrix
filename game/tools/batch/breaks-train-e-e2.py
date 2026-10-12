# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""Train E, worker e2: warp (All-Fates Stalker, Pinnacle Emissary), void (Plasma Bolt, Roving Actuator, Temporal Intervention),
sneak (Leonardo, Leader in Blue; Splinter, Hamato Yoshi), Omnath, Locus of the Void's mana, the Emissary's Drone ("can block only
creatures with flying"), Tractor Beam's "you control enchanted permanent", and Antiquities on the Loose's "cast from anywhere
other than your hand". One break for each engine change they needed -- each guard, each branch -- and the suite that catches it:

    python3 game/tools/batch/breaks.py game/tools/batch/breaks-train-e-e2.py
"""
SUITES = [
    'tests/engine-warp-sneak.mjs',
    'tests/engine-cards.mjs',
    'tests/engine-schema.mjs',
    'tests/engine-catalog.mjs',
]

STATE = 'game/engine/state/index.mjs'
TURN = 'game/engine/rules/turn.mjs'
RM = 'game/engine/rules/restricted-mana.mjs'
STACK = 'game/engine/rules/stack.mjs'
ZONES = 'game/engine/script/effects/zones.mjs'
ACTIONS = 'game/engine/rules/actions.mjs'
CONDITION = 'game/engine/script/condition.mjs'
AMOUNT = 'game/engine/script/amount.mjs'
STATICS = 'game/engine/rules/statics.mjs'
COMBAT = 'game/engine/keywords/combat.mjs'
SCHEMA = 'game/engine/script/schema.mjs'
INDEX = 'game/engine/cards/index.mjs'
VOCAB = 'game/engine/vocabulary.mjs'
TIMING = 'game/engine/keywords/timing.mjs'
PERM = 'game/engine/script/effects/permanents.mjs'
SBA = 'game/engine/rules/sba.mjs'

IDLE_COST = '      && manaValue(parseManaCost(way.mana)) <= mana)) return true;'
IDLE_WARP = '(way.paidFor === "warp" && object.zone === "hand" && timelyHere)'
SNEAK_WHEN = '!(state.activePlayer === controller && state.phase === "COMBAT_DECLARE_BLOCKERS")'
BEAM_HOST = '    if (state.objects[host]?.zone !== "battlefield" || !controlsEnchanted(state, held, aura)) continue;'

BREAKS = [
    # Void's record (state/index.mjs, recordDeath), and its turn (rules/turn.mjs).
    ('void: a departure counted', STATE,
     '  if (was && !(was.types ?? []).includes("Land")) state.nonlandLeftThisTurn = (state.nonlandLeftThisTurn ?? 0) + 1;\n', ''),
    ('void: a land is no nonland permanent', STATE, '  if (was && !(was.types ?? []).includes("Land")) state', '  if (was) state'),
    ('void: this turn alone', TURN, '    if (state.nonlandLeftThisTurn) state.nonlandLeftThisTurn = 0;\n', ''),
    # Void, the condition (script/condition.mjs).
    ('void: read', CONDITION, '  if (condition.void === true && !(', '  if (false && !('),
    ('void: a nonland permanent left', CONDITION, '!((state.nonlandLeftThisTurn ?? 0) > 0 || state.players', '!(state.players'),
    ('void: a spell warped', CONDITION,
     ' || state.players.some((p) => (p.castThisTurn ?? []).some((cast) => cast.warped === true)))) return false;', ')) return false;'),
    ('void: true in the grammar', CONDITION, '  if ("void" in condition && condition.void !== true) problems.push("void is true");\n', ''),
    ('void and sneak: condition keys', CONDITION, '  "void", "sneak",\n', ''),
    # Warp, compiled (cards/index.mjs) and its words (vocabulary.mjs, keywords/timing.mjs).
    ('warp: compiled', INDEX, '    if (word === "warp") {', '    if (false) {'),
    ('warp: from the hand, compiled', INDEX, 'paidFor: "warp", fromHand: true,', 'paidFor: "warp",'),
    ('warp: a mana cost without X', INDEX, "problems.push(`${ability.text}: a warp cost of mana, once, without X`);", 'void 0;'),
    ('warp: a permanent card', INDEX, "problems.push(`${ability.text}: warp on a card that never becomes a permanent from the stack`);", 'void 0;'),
    ('keywords: warp and sneak declared', VOCAB, '  "warp", "sneak",\n', ''),
    ('built: Warp and Sneak', TIMING, '"Disguise", "Morph", "Warp", "Sneak"]),', '"Disguise", "Morph"]),'),
    # Warp, offered (rules/actions.mjs).
    ('warp: fromHand carried to the way', ACTIONS, '      ...(ability.fromHand === true ? {fromHand: true} : {}),\n', ''),
    ('warp: from the hand alone', ACTIONS, '.filter((w) => !w.fromHand || from === "hand");', ';'),
    ('warp: marked warped this turn', ACTIONS, ', ...(way?.paidFor === "warp" ? {warped: true} : {})});', '});'),
    ('warp: a later turn', ACTIONS, '  && (ability.afterTurn === undefined || state.turn > ability.afterTurn)\n', ''),
    ('warp: the turn carried to the permission', ACTIONS, ',\n      ...(Number.isInteger(e.afterTurn) ? {afterTurn: e.afterTurn} : {})}}))];', '}}))];'),
    # Warp, the delayed trigger (rules/stack.mjs) and the permission (effects/zones.mjs).
    ('warp: the delayed trigger', STACK, 'entry.cast?.paidFor === "warp" && state.objects[arrived])', 'false)'),
    ('warp: the exile names its turn', STACK, 'to: "exile", warped: state.turn}]', 'to: "exile"}]'),
    ('warp: the permission', ZONES, '    if (params.warped !== undefined && moved !== null && state.objects[moved]?.zone === "exile") {', '    if (false) {'),
    ('warp: only in exile', ZONES, ' && moved !== null && state.objects[moved]?.zone === "exile") {', ' && moved !== null && state.objects[moved]) {'),
    ('warp: a warped card', ZONES, '      state.objects[moved].warped = true;\n', ''),
    ('warp: its owner\'s', ZONES, 'player: owner, name: state.objects[moved].card,', 'player: context.controller, name: state.objects[moved].card,'),
    ('warp: a cast', ZONES, '        spellsOnly: true, until: "ever", afterTurn', '        until: "ever", afterTurn'),
    ('warp: after this turn', ZONES, 'until: "ever", afterTurn: params.warped, madeOnTurn', 'until: "ever", madeOnTurn'),
    # Sneak, compiled (cards/index.mjs).
    ('sneak: compiled', INDEX, '    if (word === "sneak") {', '    if (false) {'),
    ('sneak: paidFor', INDEX, 'paidFor: "sneak", sneak: true,', 'sneak: true,'),
    ('sneak: its condition', INDEX, 'sneak: true, condition: {sneak: true}, text: ability.text,', 'sneak: true, text: ability.text,'),
    ('sneak: returning a creature', INDEX,
     '        cost: [...structuredClone(cost), {atom: "returnToHand", selector: {what: "permanent", types: ["Creature"], controller: "you", attacking: true, unblocked: true}}],\n        affects',
     '        cost: structuredClone(cost),\n        affects'),
    ('sneak: an unblocked one', INDEX, 'controller: "you", attacking: true, unblocked: true}}],\n        affects', 'controller: "you", attacking: true}}],\n        affects'),
    ('sneak: a mana cost', INDEX, "problems.push(`${ability.text}: a sneak cost of mana, once, without X`);", 'void 0;'),
    # Sneak, the condition (script/condition.mjs).
    ('sneak: its controller\'s turn', CONDITION, SNEAK_WHEN, '!(state.phase === "COMBAT_DECLARE_BLOCKERS")'),
    ('sneak: the declare blockers step', CONDITION, SNEAK_WHEN, '!(state.activePlayer === controller)'),
    ('sneak: paidFor in the grammar', CONDITION, 'const PAID_FOR = ["surge", "freerunning", "sneak"];', 'const PAID_FOR = ["surge", "freerunning"];'),
    ('sneak: true in the grammar', CONDITION, '  if ("sneak" in condition && condition.sneak !== true) problems.push("sneak is true");\n', ''),
    # Sneak, offered and paid (rules/actions.mjs).
    ('sneak: carried to the way', ACTIONS, '      ...(ability.sneak === true ? {sneak: true} : {}),\n', ''),
    ('sneak: the creature returned with the cast', ACTIONS, ' || a.atom === "sacrifice" || a.atom === "returnToHand"), evoke', ' || a.atom === "sacrifice"), evoke'),
    ('sneak: each creature its own offer', ACTIONS,
     'options = state.zones.battlefield.filter((id) => matches(state, id, {controller: player})).map((id) => ({returnToHand: id}));', 'options = [];'),
    ('sneak: at an instant\'s timing', ACTIONS, '  if (!timely && !sneaking) return actions;', '  if (!timely) return actions;'),
    ('sneak: its sneak cost alone then', ACTIONS, '  if (sneaking && !way?.sneak) continue;\n', ''),
    ('sneak: no additional cost', ACTIONS, 'extraPaid.some(([kind]) => kind !== "returnToHand")', 'extraPaid.length'),
    ('sneak: to its owner\'s hand', ACTIONS, '        moveOne(state, id, "hand", events);\n        continue;\n', ''),
    ('sneak: whom it attacked', ACTIONS, '        if (way?.sneak && attack) entry.sneak', '        if (false) entry.sneak'),
    ('sneak: the planeswalker it attacked', ACTIONS,
     '{player: attack.defender, ...(attack.planeswalker !== undefined ? {planeswalker: attack.planeswalker} : {})}', '{player: attack.defender}'),
    # Sneak, entering (rules/stack.mjs).
    ('sneak: enters attacking', STACK, '    if (to === "battlefield" && entry.sneak && state.objects[arrived]) {', '    if (false) {'),
    ('sneak: enters tapped', STACK, '      state.objects[arrived].tapped = true;\n      enterAttacking(', '      enterAttacking('),
    # Nothing to do (rules/actions.mjs, idle): warp and sneak are something to do.
    ('idle: warp or sneak', ACTIONS, IDLE_COST, '      && false)) return true;'),
    ('idle: what the mana pays', ACTIONS, IDLE_COST, '      && true)) return true;'),
    ('idle: warp from the hand', ACTIONS, IDLE_WARP, '(way.paidFor === "warp" && timelyHere)'),
    ('idle: warp at its speed', ACTIONS, IDLE_WARP, '(way.paidFor === "warp" && object.zone === "hand")'),
    ('idle: sneak', ACTIONS, '|| way.sneak === true)\n', '|| false)\n'),
    # Antiquities on the Loose: "cast from anywhere other than your hand" (script/condition.mjs).
    ('notFrom: read', CONDITION, '  if (rule.notFrom !== undefined && cast.from === rule.notFrom) return false;\n', ''),
    ('notFrom: a key', CONDITION, 'const CAST_KEYS = ["from", "notFrom", "mainPhase", "additionalPaid"];', 'const CAST_KEYS = ["from", "mainPhase", "additionalPaid"];'),
    ('notFrom: a zone', CONDITION, '      if ("notFrom" in rule && !CAST_ZONES.includes(rule.notFrom)) problems.push', '      if (false) problems.push'),
    # Omnath: "for each unspent mana you have" (script/amount.mjs).
    ('manaInPool: counted', AMOUNT,
     'n = player ? Object.values(player.manaPool ?? {}).reduce((a, b) => a + b, 0) + (player.restrictedMana ?? []).length : 0;', 'n = 0;'),
    ('manaInPool: the restricted mana too', AMOUNT, ', 0) + (player.restrictedMana ?? []).length : 0;', ', 0) : 0;'),
    ('manaInPool: an amount kind', AMOUNT, '  "manaInPool",\n', ''),
    ('manaInPool: "you"', AMOUNT, 'if ("manaInPool" in value && value.manaInPool !== "you") problems.push', 'if (false) problems.push'),
    # Omnath: "that mana becomes colorless instead" (rules/statics.mjs, rules/turn.mjs, rules/restricted-mana.mjs).
    ('omnath: the rule declared', STATICS, '  "mana-becomes-colorless": "rules/turn.mjs",\n', ''),
    ('omnath: the rule read', TURN, '    if (playerRuleChanged(state, "mana-becomes-colorless", player.id)) {', '    if (false) {'),
    ('omnath: what is kept stays', TURN, '      colorlessPool(state, player.id, kept);', '      colorlessPool(state, player.id);'),
    ('omnath: kept is not lost', RM, 'Math.max(0, (p.manaPool[key] ?? 0) - (kept[key] ?? 0))', '(p.manaPool[key] ?? 0)'),
    ('omnath: restricted mana colorless', RM, '  for (const entry of p.restrictedMana ?? []) entry.key = "C";\n', ''),
    ('omnath: riders and withheld mana colorless', RM, '    for (const entry of list) if (left[entry.key] > 0) { left[entry.key] -= 1; entry.key = "C"; }\n', ''),
    ('omnath: the withheld record rewritten', RM, '  if (p.withheldMana?.length) p.withheldSeen = {...p.manaPool};\n  addPoolMana(', '  addPoolMana('),
    ('omnath: become colorless, not lost', RM, '  addPoolMana(state, player, {C: MANA_KEYS.reduce((n, key) => n + lost[key], 0)}, null, null);', '  void addPoolMana;'),
    # The Drone: "can block only creatures with flying" (rules/statics.mjs, keywords/combat.mjs, script/schema.mjs).
    ('drone: the rule declared', STATICS, '  "can-block-only": "keywords/combat.mjs",\n', ''),
    ('drone: which attackers', STATICS, ' && !matchesSelector({what: "permanent", ...(ability.attackers ?? {})}, state, attackerId, context)) return true;', ') return true;'),
    ('drone: which blockers', STATICS, 'if (matchesSelector(ability.affects, state, blockerId, context) && !matchesSelector', 'if (!matchesSelector'),
    ('drone: read as each blocker is checked', COMBAT, '  if (blocksOnlyOthers(state, blockerId, attackerId)) return false;\n', ''),
    ('drone: the grammar', SCHEMA, '    if (ability.rule === "can-block-only") {', '    if (false) {'),
    # Tractor Beam: "you control enchanted permanent" (rules/statics.mjs, effects/permanents.mjs, rules/sba.mjs).
    ('beam: the rule declared', STATICS, '  "control-enchanted": "script/effects/permanents.mjs",\n', ''),
    ('beam: applied as the game is checked', SBA, '  controlByAuras(state, events);\n', ''),
    ('beam: applied at all', PERM,
     '  if (!state.zones.battlefield.some((id) => (state.objects[id].abilities ?? []).some((a) => a.rule === "control-enchanted"))) return;', '  return;'),
    ('beam: still attached to it', PERM, 'state.objects[record.byAura]?.attachedTo === record.affects.ids[0] && controllerOf', 'controllerOf'),
    ('beam: still its controller\'s', PERM, ' && controllerOf(state, record.byAura) === record.to\n    && controlsEnchanted', '\n    && controlsEnchanted'),
    ('beam: still with the ability', PERM, '\n    && controlsEnchanted(state, held, record.byAura);', ';'),
    ('beam: ended when it no longer holds', PERM,
     '  for (let record; (record = nextRecord(state, (e) => e.byAura !== undefined && !holds(e)));) endControlChange(state, record, events);\n', ''),
    ('beam: something to enchant', PERM, BEAM_HOST, '    if (!controlsEnchanted(state, held, aura)) continue;'),
    ('beam: an Aura with the ability', PERM, BEAM_HOST, '    if (state.objects[host]?.zone !== "battlefield") continue;'),
    ('beam: once', PERM, '    if ((state.effects ?? []).some((e) => e.byAura === aura && e.affects.ids[0] === host)) continue;\n', ''),
    ('beam: its record', PERM, '.byAura = aura;', '.byAura = undefined;'),
    ('beam: as long as the Aura stays', PERM, 'gainControl(state, {targets: [host], until: "this leaves"}, {controller', 'gainControl(state, {targets: [host]}, {controller'),
]
