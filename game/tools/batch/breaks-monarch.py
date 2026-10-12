# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""Train E: a creature removed from combat as its controller changes (CR 506.4), and the monarch (CR 725) -- for Ginger, Queen
of Sweets and Tamiyo, Upriser Crowned of Rob's v43 library. One break for each engine change -- each guard, each branch, each
credit -- and the suite that catches it:

    python3 game/tools/batch/breaks.py game/tools/batch/breaks-monarch.py
"""
SUITES = [
    'tests/engine-monarch.mjs',
    'tests/engine-vocabulary.mjs',
    'tests/engine-cards.mjs',
]

COMBAT = 'game/engine/rules/combat.mjs'
PERM = 'game/engine/script/effects/permanents.mjs'
RES = 'game/engine/script/effects/resources.mjs'
SBA = 'game/engine/rules/sba.mjs'
TRIGGER = 'game/engine/rules/trigger.mjs'
STACK = 'game/engine/rules/stack.mjs'
CONDITION = 'game/engine/script/condition.mjs'
INDEX = 'game/engine/cards/index.mjs'
SCHEMA = 'game/engine/script/schema.mjs'
EFFECTS = 'game/engine/script/effects/index.mjs'
VOCAB = 'game/engine/vocabulary.mjs'
CONSTRUCTS = 'game/tools/engine-constructs.mjs'
PROJECTION = 'game/engine/projection.mjs'
HISTORY = 'game/room/history.mjs'
SCENARIO = 'game/engine/cards/scenario.mjs'
PLAN = 'docs/engine/PLAN.md'

GAIN = '''    if (object.controller !== to) {
      object.controlledSinceTurn = state.turn;
      removeFromCombat(state, id);
    }
'''
HEIR = 'Array.from({length: seats}, (_, step) => (state.activePlayer + step) % seats).find((id) => !state.players[id].lost)'

BREAKS = [
    # CR 506.4: out of combat (rules/combat.mjs removeFromCombat).
    ('506.4: its attack gone', COMBAT, '  state.combat.attacks = state.combat.attacks.filter((attack) => attack.attacker !== id);\n', ''),
    ('506.4: its block gone', COMBAT,
     '  for (const attack of state.combat.attacks) if (attack.blockers.includes(id)) attack.blockers = attack.blockers.filter((blocker) => blocker !== id);\n', ''),
    ('506.4: no combat, nothing to leave', COMBAT, '  if (!state.combat) return;\n  state.combat.attacks', '  state.combat.attacks'),
    # ... as its controller changes (effects/permanents.mjs).
    ('506.4: a steal takes it out', PERM, GAIN, '    if (object.controller !== to) object.controlledSinceTurn = state.turn;\n'),
    ('506.4: only when its controller changes', PERM, GAIN, '    if (object.controller !== to) object.controlledSinceTurn = state.turn;\n    removeFromCombat(state, id);\n'),
    ('506.4: given back, out of combat', PERM, '       held, given back mid-combat as its source leaves, attacks or blocks no longer. */\n    removeFromCombat(state, id);\n',
     '       held, given back mid-combat as its source leaves, attacks or blocks no longer. */\n'),
    ('506.4: phased out, out of combat', PERM, '    (state.phasedOut ??= []).push(id);\n    removeFromCombat(state, id);\n', '    (state.phasedOut ??= []).push(id);\n'),
    # The monarch: the designation (effects/resources.mjs crown).
    ('crown: the monarch set', RES, '  state.monarch = player;\n', ''),
    ('crown: said', RES, '  events.push(event("GameEventBecomeMonarch", state, {player: {playerId: player, name: state.players[player].name}}));\n', ''),
    ('crown: the monarch already', RES, ' || state.monarch === player) return events;', ') return events;'),
    ('crown: not a player who left', RES, 'if (state.players[player].lost || state.monarch', 'if (state.monarch'),
    ('becomeMonarch: who', RES, 'const [player] = playersFor(state, params.who ?? "you", context.controller);\n  return player === undefined ? [] : crown(',
     'const [player] = playersFor(state, "you", context.controller);\n  return player === undefined ? [] : crown('),
    ('becomeMonarch: nobody bound', RES, 'return player === undefined ? [] : crown(state, player);', 'return crown(state, player);'),
    # Ginger's Gingerbrute: a token with the mana cost its effect gives it (CR 111.3; effects/permanents.mjs makeToken).
    ('token: its mana cost', PERM, '    ...(spec.manaCost ? {manaCost: spec.manaCost} : {}),\n', ''),
    # The monarch leaves the game (rules/sba.mjs monarchLeft, CR 725.4).
    ('725.4: only a monarch who left', SBA, ' || !state.players[state.monarch].lost) return events;', ') return events;'),
    ('725.4: the active player first', SBA, HEIR, HEIR.replace('state.activePlayer + step', 'state.activePlayer + step + 1')),
    ('725.4: still in the game', SBA, HEIR, HEIR.replace('.find((id) => !state.players[id].lost)', '.find(() => true)')),
    ('725.4: nobody left, no monarch', SBA, '  if (heir === undefined) delete state.monarch;\n', '  if (heir === undefined) void 0;\n'),
    ('725.4: asked as the check finds them gone', SBA, '    monarchLeft(state, events);\n', ''),
    ('725.4: asked as an effect makes them lose', RES, '  return monarchLeft(state, events);\n', '  return events;\n'),
    # The condition (script/condition.mjs).
    ('condition: if you are the monarch', CONDITION, '  if (condition.monarch === "you" && state.monarch !== controller) return false;\n', ''),
    ('condition: its key', CONDITION, '  /* "If you\'re the monarch" (CR 725). */\n  "monarch",\n', '\n'),
    ('condition: monarch is "you"', CONDITION, '  if ("monarch" in condition && condition.monarch !== "you") problems.push(', '  if (false) problems.push('),
    # "While you're the monarch" (Tamiyo; rules/trigger.mjs, cards/index.mjs).
    ('while the monarch: read', TRIGGER, '    if (condition.monarch === "you" && state.monarch !== controller) return [];\n', ''),
    ('while the monarch: compiled', INDEX, '...(t.monarch === "you" && t.to === "you" ? {monarch: "you"} : {})', '...{}'),
    ('while the monarch: damage to you alone', INDEX, '...(t.monarch === "you" && t.to === "you" ? {monarch: "you"} : {})', '...(t.monarch === "you" ? {monarch: "you"} : {})'),
    ('while the monarch: refused elsewhere', INDEX, '''        problems.push(`${ability.text}: "while you're the monarch" is monarch: "you", on damage dealt to you`);''', '        void 0;'),
    # The game's own triggers (rules/trigger.mjs, CR 725.2).
    ('725.2: read with every event', TRIGGER, '    inherentTriggers(state, event);\n', ''),
    ("725.2: the monarch's own end step", TRIGGER, 'phase: "END_OF_TURN", yourTurn: true}', 'phase: "END_OF_TURN"}'),
    ('725.2: that player draws', TRIGGER, 'effects: [{effect: "draw", count: 1}]}', 'effects: []}'),
    ('725.2: combat damage alone', TRIGGER, 'to: "you", combat: true}, effects: [{effect: "becomeMonarch"', 'to: "you"}, effects: [{effect: "becomeMonarch"'),
    ('725.2: damage to the monarch alone', TRIGGER, 'who: "any", to: "you", combat: true}', 'who: "any", to: "player", combat: true}'),
    ('725.2: its controller becomes the monarch', TRIGGER, '{effect: "becomeMonarch", who: "that card\'s controller"}', '{effect: "becomeMonarch"}'),
    ('725.2: its controller as it dealt the damage', TRIGGER, '...(Number.isInteger(dealer) ? {controller: dealer} : {})', '...{}'),
    ('725.2: named on the stack', TRIGGER, '      ...(trigger.inherent ? {name: trigger.source.name} : {}),\n', ''),
    ('725.2: marked as the game\'s', TRIGGER, '      cause: null, optional: false, inherent: true, about:', '      cause: null, optional: false, about:'),
    ('725.2: a sourceless ability\'s name', STACK, 'name: source ? source.card : name,', 'name: source ? source.card : null,'),
    # The view and the history.
    ('view: the monarch', PROJECTION, '    ...(state.monarch === player.id ? {monarch: true} : {}),\n', ''),
    ('view: the monarch alone', PROJECTION, '...(state.monarch === player.id ? {monarch: true} : {})', '...(state.monarch !== undefined ? {monarch: true} : {})'),
    ('history: became the monarch', HISTORY, '''    case "GameEventBecomeMonarch":
      return line(`${who(f.player.playerId)} became the monarch`);
''', ''),
    ('scenarios: the monarch checked', SCENARIO, '        if (got !== e.monarch) fail(', '        if (false) fail('),
    # The words: schema, registry, vocabulary, plan, credits.
    ('schema: one player becomes the monarch', SCHEMA, 'if (name === "becomeMonarch" && effect.who !== undefined', 'if (false && effect.who !== undefined'),
    ('registry: becomeMonarch', EFFECTS, '  becomeMonarch,\n  /* Wave 4c', '  /* Wave 4c'),
    ('vocabulary: becomeMonarch', VOCAB, '"empowerJace", "becomeMonarch",', '"empowerJace",'),
    ('plan: becomeMonarch in 12.2', PLAN, '`becomeMonarch` ("you become the monarch",', 'becomeMonarch ("you become the monarch",'),
    ('credit: BecomeMonarch', CONSTRUCTS, '  BecomeMonarch: "becomeMonarch",\n', ''),
    ('credit: the Monarch count', CONSTRUCTS, '  Monarch: {name: "The monarch", status: "built",', '  Monarch: {name: "The monarch", status: "missing",'),
]
