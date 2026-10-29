# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""Wave 4b, lane j4: activations forbidden, costs raised, imprint, the attackers declared -- and the small pieces beside them
that twenty-eight of the most-played Commander cards needed (Bojuka Bog; Toxic Deluge; Swan Song; Black Market Connections;
City of Brass; Syr Konrad, the Grim; Flooded Grove; Inventors' Fair; Damn; The Ozolith; Twilight Mire; Chrome Mox; Orcish
Bowmasters; Command Beacon; Grand Abolisher; Loran of the Third Path; Bedevil; Toski, Bearer of Secrets; Land Tax; Tropical
Island; Academy Ruins; Minas Tirith; Terror of the Peaks; Selvala, Heart of the Wilds; Volcanic Island; Massacre Wurm;
Damnation; Scavenger Grounds). One break for each engine change they needed -- each guard, each branch, each credit -- and
the suite that catches it:

    python3 game/tools/batch/breaks.py game/tools/batch/breaks-wave4b-j4.py
"""
SUITES = [
    'tests/engine-costs-activations-4b.mjs',
    'tests/engine-cards.mjs',
    'tests/engine-catalog.mjs',
    'tests/engine-attacks-alone.mjs',
]

ACTIONS = 'game/engine/rules/actions.mjs'
STATICS = 'game/engine/rules/statics.mjs'
MANA = 'game/engine/rules/mana.mjs'
TRIGGER = 'game/engine/rules/trigger.mjs'
COMBAT = 'game/engine/rules/combat.mjs'
TURN = 'game/engine/rules/turn.mjs'
STATE = 'game/engine/state/index.mjs'
ZONES = 'game/engine/script/effects/zones.mjs'
ASKING = 'game/engine/script/effects/asking.mjs'
RES = 'game/engine/script/effects/resources.mjs'
BIND = 'game/engine/script/bind.mjs'
COND = 'game/engine/script/condition.mjs'
AMOUNT = 'game/engine/script/amount.mjs'
SCHEMA = 'game/engine/script/schema.mjs'
CARDS = 'game/engine/cards/index.mjs'
PILOT = 'game/engine/pilots/house-pilot.mjs'
CONSTRUCTS = 'game/tools/engine-constructs.mjs'

ABOLISHED = '    if (activationsForbidden(state, id) || permanentActivationForbidden(state, id)) continue;'
KOMA_ONLY = '    if (activationsForbidden(state, id)) continue;'
MANA_NOTE = 'and so does "your opponents can\'t activate abilities of artifacts, creatures, or enchantments" (Grand Abolisher). */\n'
LOOP_NOTE = 'your turn, your opponents can\'t activate abilities of artifacts, creatures, or enchantments" (Grand Abolisher). */\n'
OF_ONLY = '      if (ability.kind !== "static" || ability.rule !== "cant-activate" || ability.of === undefined) continue;'
OF_AFFECTS = '''      if (!compileSelector({what: "player", ...(ability.affects ?? {})})(state, player, context)) continue;
      if (!conditionHolds(state, ability.condition, context)) continue;
      if (compileSelector({...ability.of, what: "permanent"})(state, id, context)) return true;'''
OF_CONDITION = '''      if (!conditionHolds(state, ability.condition, context)) continue;
      if (compileSelector({...ability.of, what: "permanent"})(state, id, context)) return true;'''
OF_MATCH = '      if (compileSelector({...ability.of, what: "permanent"})(state, id, context)) return true;'
TARGETING = '      if (ability.targeting !== undefined && !targetsFit(state, ability.targeting, (targets ?? []).flat(), context)) continue;\n'
OWED_CHECK = 'if (owedLife > 0 && (lifeCost ?? 0) + (back?.life ?? 0) + (way?.life ?? 0) + owedLife > state.players[player].life)'
CAST_WAS = '      ...(castFrom === "graveyard" ? {wasCard: {types: [...(object.types ?? [])], subtypes: [...(object.subtypes ?? [])], supertypes: [...(object.supertypes ?? [])]}} : {}),\n'
MOVE_WAS = '    ...(from === "graveyard" ? {wasCard: {types: [...(object.types ?? [])], subtypes: [...(object.subtypes ?? [])], supertypes: [...(object.supertypes ?? [])]}} : {}),\n'
ATTACKED_PUSH = '  for (const attack of state.combat.attacks) if (!attackedWith.ids.includes(attack.attacker)) attackedWith.ids.push(attack.attacker);\n'
DRAW_STEP = 'if (state.phase !== "DRAW" || state.activePlayer !== player) return null;'
LEFT_OWNER = '''    if (condition.leftGraveyard) {
      if (!whoseIs(condition.owner ?? "you", fields.card?.owner, controller)) return false;'''
LEFT_FILTER = '      return Boolean(was) && matchesLastKnown(condition.filter, was, {controller, source: sourceId});'
LEFT_BECAME = '      const was = fields.wasCard ?? (became ? {types: [...(became.types ?? [])], subtypes: [...(became.subtypes ?? [])], supertypes: [...(became.supertypes ?? [])]} : null);'
POWER_BLOCK = '  if (condition.powerAboveOthers === "that card") {'
POWER_LKI = 'const power = here ? characteristicsOf(state, id).power : about?.lastKnown?.power;'
POWER_NONE = '    if (power === null || power === undefined) return false;\n'
POWER_TIE = '(characteristicsOf(state, other).power ?? 0) >= power)) return false;'
POWER_VALID = '  if ("powerAboveOthers" in condition && condition.powerAboveOthers !== "that card") problems.push('
CANT_ACTIVATE_FORMS = '''    if (ability.rule === "cant-activate" && !(ofPermanents ? [undefined, true].includes(ability.duringYourTurn) && ability.duringCombat === undefined
      : ability.duringCombat === true && ability.duringYourTurn === undefined))'''
OF_MISUSE = '    if (ability.of !== undefined && ability.rule !== "cant-activate") errors.push('
OF_SELECTOR = '    if (ofPermanents) checkSelector(ability.of, `${path}.of`, errors, {choice: true});\n'
TARGETING_SELECTOR = '    if (ability.rule === "spells-cost-more" && ability.targeting !== undefined) checkSelector(ability.targeting, `${path}.targeting`, errors);\n'
LIFE_VALID = 'if (ability.life !== undefined && !(ability.rule === "spells-cost-more" && ability.amount === undefined && Number.isInteger(ability.life) && ability.life >= 1))'
UPTO_TRIGGERED = '    const triggeredOne = ability.kind === "triggered" && effect.choose !== 0 && effect.sameMode === undefined;'
MOVE_ALL_VALID = '    if (effect.counter === "all" && (effect.count !== undefined || effect.onto !== undefined))'
PAYLIFE_VALID = '          if (atom.amount !== "X" || manaX) problems.push('
PUT_INTO = '  "put into graveyard": (t) => (["you", "opponent", "any"].includes(t.owner ?? "you") && [undefined, "battlefield"].includes(t.notFrom)'
LEFT_COMPILED = 'leftGraveyard: true, owner: t.owner ?? "you", ...(t.filter ? {filter: t.filter} : {})} : null),'
DRAWN_COMPILE = ' && [undefined, true].includes(t.exceptFirstInDrawStep)'

BREAKS = [
    # Grand Abolisher: an activation forbidden of some permanents (rules/statics.mjs, permanentActivationForbidden).
    ('abolisher: mana abilities offered', ACTIONS, MANA_NOTE + ABOLISHED, MANA_NOTE + KOMA_ONLY),
    ('abolisher: activated abilities offered', ACTIONS, LOOP_NOTE + ABOLISHED, LOOP_NOTE + KOMA_ONLY),
    ('abolisher: unless paid with its sources', MANA, ABOLISHED, KOMA_ONLY),
    ('abolisher: only a static of some permanents', STATICS, OF_ONLY, '      if (ability.kind !== "static" || ability.rule !== "cant-activate") continue;'),
    ('abolisher: during its controller\'s turn', STATICS, '      if (ability.duringYourTurn && state.activePlayer !== holder.controller) continue;\n', ''),
    ('abolisher: the players it binds', STATICS, OF_AFFECTS, OF_CONDITION),
    ('abolisher: while its condition holds', STATICS, OF_CONDITION, OF_MATCH),
    ('abolisher: of the permanents it names', STATICS, OF_MATCH, '      return true;'),
    ('schema: cant-activate forms', SCHEMA, CANT_ACTIVATE_FORMS, '    if (false)'),
    ('schema: of, not during combat', SCHEMA, '[undefined, true].includes(ability.duringYourTurn) && ability.duringCombat === undefined\n', '[undefined, true].includes(ability.duringYourTurn)\n'),
    ('schema: of, during your turn true or absent', SCHEMA, '[undefined, true].includes(ability.duringYourTurn) && ability.duringCombat', 'true && ability.duringCombat'),
    ('schema: during your turn only with of', SCHEMA, ': ability.duringCombat === true && ability.duringYourTurn === undefined))', ': ability.duringCombat === true))'),
    ('schema: of on cant-activate alone', SCHEMA, OF_MISUSE, '    if (false) errors.push('),
    ('schema: of is a selector', SCHEMA, OF_SELECTOR, ''),

    # Terror of the Peaks: a spell's life raised for what it targets (rules/statics.mjs, increasesOn and lifeIncrease).
    ('cost: targeting read', STATICS, TARGETING, ''),
    ('cost: a counted target\'s choices', STATICS, '(targets ?? []).flat()', '(targets ?? [])'),
    ('cost: a life increase is no mana', STATICS, '    if (ability.life !== undefined) continue;\n', ''),
    ('cost: mana increase reads targets', ACTIONS, '  cost.generic += costIncrease(state, player, id, targets);', '  cost.generic += costIncrease(state, player, id);'),
    ('cost: each aim costed', ACTIONS, '  || costsReadTargets(state) ? targetChoices', '  ? targetChoices'),
    ('cost: the aim\'s life off what is left', ACTIONS, ' - (paidLife ?? 0) - aimLife;', ' - (paidLife ?? 0);'),
    ('cost: an aim it cannot afford', ACTIONS, '.filter(affordable));', ');'),
    ('cost: refused as it is cast', ACTIONS, OWED_CHECK, 'if (false)'),
    ('cost: the payment\'s life budget', ACTIONS, ' - (lifeCost ?? 0) - owedLife, x: x + (action.x ?? 0) * cost.variable}, action.payWith);', ' - (lifeCost ?? 0), x: x + (action.x ?? 0) * cost.variable}, action.payWith);'),
    ('cost: the life paid', ACTIONS, '    if (owedLife) changeLife(state, player, -owedLife, events);\n', ''),
    ('schema: targeting a selector', SCHEMA, TARGETING_SELECTOR, ''),
    ('schema: life beside no amount', SCHEMA, ' && ability.amount === undefined && Number.isInteger(ability.life)', ' && Number.isInteger(ability.life)'),
    ('schema: life 1 or more', SCHEMA, ' && ability.life >= 1))', '))'),
    ('schema: life a spells-cost-more static\'s', SCHEMA, '!(ability.rule === "spells-cost-more" && ability.amount === undefined', '!(ability.amount === undefined'),

    # Toxic Deluge: X paid in life (rules/actions.mjs, lifeXAtom).
    ('x life: one offer for each X', ACTIONS, 'const xs = lifeX ? Array.from({length: lifeLeft + 1}, (_, i) => i) :', 'const xs = false ? Array.from({length: lifeLeft + 1}, (_, i) => i) :'),
    ('x life: not a cost to pick', ACTIONS, ' && a !== beholds && a !== lifeX);', ' && a !== beholds);'),
    ('x life: its lands tapped for it', ACTIONS, ': poolSize(pool) === 0) && (xMana === null || tapsForX) && !tapsAny', ': poolSize(pool) === 0) && (X === null || tapsForX) && !tapsAny'),
    ('x life: tap plans for it', ACTIONS, '(action.x === undefined || action.payLifeX === true || xTaps(state))', '(action.x === undefined || xTaps(state))'),
    ('x life: said on the offer', ACTIONS, '        ...(lifeX ? {payLifeX: true} : {}), ', '        '),
    ('x life: paid', ACTIONS, ' + (lifeXAtom(object?.spell?.additionalCost) ? action.x ?? 0 : 0);', ';'),
    ('x life: allowed', CARDS, '        if (atom?.atom === "payLife") {', '        if (false) {'),
    ('x life: X alone', CARDS, PAYLIFE_VALID, '          if (manaX) problems.push('),
    ('x life: no X in its mana cost', CARDS, PAYLIFE_VALID, '          if (atom.amount !== "X") problems.push('),
    ('pilot: never all its life', PILOT, '\n        && !(a.payLifeX === true && a.x >= self.life));', ');'),
    ('pilot: the least X of life', PILOT, '(a.payLifeX === true ? 0 : a.x ?? 0)', '(a.x ?? 0)'),

    # Minas Tirith: the creatures attacked with this turn (rules/combat.mjs, script/amount.mjs).
    ('attacked: recorded', COMBAT, ATTACKED_PUSH, ''),
    ('attacked: each once', COMBAT, 'if (!attackedWith.ids.includes(attack.attacker)) attackedWith.ids.push', 'attackedWith.ids.push'),
    ('attacked: kept through the turn', COMBAT, 'state.players[player].attackedWith?.turn === state.turn ? state.players[player].attackedWith : (', '('),
    ('attacked: this turn only', AMOUNT, 'n = attacked?.turn === state.turn ? attacked.ids.length : 0;', 'n = attacked ? attacked.ids.length : 0;'),
    ('attacked: you or that player', AMOUNT, ', "cardsDiscardedThisTurn", "creaturesAttackedWithThisTurn"]) if', ', "cardsDiscardedThisTurn"]) if'),
    ('attacked: credited', CONSTRUCTS, 'AttackersDeclared: {name: "Attackers declared", status: "built"', 'AttackersDeclared: {name: "Attackers declared", status: "missing"'),

    # Black Market Connections: a triggered ability's "choose one or more".
    ('modal: one or more ways', TRIGGER, 'n <= Math.min(modal.upTo ?? modal.choose, modal.modes.length)', 'n <= Math.min(modal.choose, modal.modes.length)'),
    ('modal: asked in its words', TRIGGER, '${modal.upTo ? " or more" : ""}', ''),
    ('modal: compiled', CARDS, '          ...(lone.chooseUpTo ? {upTo: lone.chooseUpTo} : {}),\n', ''),
    ('schema: a triggered ability may', SCHEMA, '(ability.kind === "spell" || triggeredOne)', '(ability.kind === "spell")'),
    ('schema: never none', SCHEMA, UPTO_TRIGGERED, '    const triggeredOne = ability.kind === "triggered" && effect.sameMode === undefined;'),
    ('schema: never one mode twice', SCHEMA, UPTO_TRIGGERED, '    const triggeredOne = ability.kind === "triggered" && effect.choose !== 0;'),

    # Syr Konrad, the Grim: from anywhere but the battlefield; a creature card leaving your graveyard.
    ('graveyard: not from the battlefield', TRIGGER, '      if (condition.notFrom && fields.from?.zoneType === condition.notFrom) return false;\n', ''),
    ('graveyard: notFrom compiled', CARDS, '      ...(t.notFrom === "battlefield" ? {notFrom: "Battlefield"} : {})} : null),', '      } : null),'),
    ('graveyard: notFrom the battlefield or nothing', CARDS, PUT_INTO, '  "put into graveyard": (t) => (["you", "opponent", "any"].includes(t.owner ?? "you")'),
    ('left graveyard: whose', TRIGGER, LEFT_OWNER, '    if (condition.leftGraveyard) {'),
    ('left graveyard: what it was', TRIGGER, LEFT_FILTER, '      return true;'),
    ('left graveyard: the card it became', TRIGGER, LEFT_BECAME, '      const was = fields.wasCard ?? null;'),
    ('left graveyard: filter compiled', CARDS, LEFT_COMPILED, 'leftGraveyard: true, owner: t.owner ?? "you"} : null),'),
    ('left graveyard: a move\'s snapshot', ZONES, MOVE_WAS, ''),
    ('left graveyard: a cast\'s snapshot', ACTIONS, CAST_WAS, ''),

    # Orcish Bowmasters: except the first one they draw in each of their draw steps.
    ('draw step: the first not', TRIGGER, '    if (condition.exceptFirstInDrawStep && fields.drawStepNumber === 1) return [];\n', ''),
    ('draw step: compiled', CARDS, ', ...(t.exceptFirstInDrawStep ? {exceptFirstInDrawStep: true} : {})} : null,', '} : null,'),
    ('draw step: true or absent', CARDS, DRAWN_COMPILE, ''),
    ('draw step: in the draw step only', STATE, DRAW_STEP, 'if (state.activePlayer !== player) return null;'),
    ('draw step: the drawer\'s own', STATE, DRAW_STEP, 'if (state.phase !== "DRAW") return null;'),
    ('draw step: counted each turn', STATE, 'if (who.drawStepDraws?.turn !== state.turn) who.drawStepDraws = {turn: state.turn, count: 0};', 'who.drawStepDraws ??= {turn: state.turn, count: 0};'),
    ('draw step: the step\'s draw', TURN, '    ...drawStep(state, player),\n', ''),
    ('draw step: an effect\'s draw', ZONES, '    if (inStep !== null) fields.drawStepNumber = inStep;', ''),

    # The Ozolith: the counters that card had; all counters moved.
    ('counters: those it had', RES, '  if (params.countersOf === "that card")', '  if (false)'),
    ('counters: that card allowed', CARDS, '["self", "that card"].includes(effect.countersOf)', 'effect.countersOf === "self"'),
    ('counters: all moved', RES, '  if (params.counter === "all") {', '  if (false) {'),
    ('schema: all, no count', SCHEMA, MOVE_ALL_VALID, '    if (false)'),

    # Selvala, Heart of the Wilds: greater than each other creature's power; its controller chooses.
    ('power: compared', COND, POWER_BLOCK, '  if (false) {'),
    ('power: as it last existed', COND, POWER_LKI, 'const power = here ? characteristicsOf(state, id).power : undefined;'),
    ('power: none, none greater', COND, POWER_NONE, ''),
    ('power: a tie is not greater', COND, POWER_TIE, '(characteristicsOf(state, other).power ?? 0) > power)) return false;'),
    ('power: about that card', COND, POWER_VALID, '  if (false) problems.push('),
    ('chooser: that card\'s controller', BIND, ' || bound.chooser === "that player" || bound.chooser === "that card\'s controller") {', ' || bound.chooser === "that player") {'),

    # Massacre Wurm: the controller a creature had as it died.
    ('controller: as it last existed', BIND, '    return Number.isInteger(was) ? [was] : [];', '    return [];'),

    # Command Beacon: the command zone is public.
    ('command: no failing to find', ASKING, ' || zone === "exile" || zone === "command" || (zone', ' || zone === "exile" || (zone'),
    ('command: asked in its words', ASKING, '        : awaiting.zone === "command" ? "Choose a card in your command zone"\n', ''),
]
