# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""Wave 4c, lane k3: tokens and counters, Classes and dice -- the small rules the lane's most-played cards needed (The Reaver
Cleaver; Maskwood Nexus; Bitterblossom; Caretaker's Talent; Ancient Copper Dragon; Sai, Master Thopterist; Chasm Skulker; Steel
Overseer; Coruscation Mage; Saw in Half; Pact of Negation; Loyal Apprentice; Terrasymbiosis; Urza, Lord High Artificer; Wizard
Class; Revitalizing Repast // Old-Growth Grove; Banner of Kinship; Setessan Champion). One break for each engine change they
needed -- each guard, each branch -- and the suite that catches it:

    python3 game/tools/batch/breaks.py game/tools/batch/breaks-wave4c-k3.py
"""
SUITES = [
    'tests/engine-wave4c-k3.mjs',
    'tests/engine-vocabulary.mjs',
    'tests/engine-cards.mjs',
]

INDEX = 'game/engine/cards/index.mjs'
ACTIONS = 'game/engine/rules/actions.mjs'
ENTERING = 'game/engine/rules/entering.mjs'
REPLACEMENT = 'game/engine/rules/replacement.mjs'
SBA = 'game/engine/rules/sba.mjs'
STACK = 'game/engine/rules/stack.mjs'
TRIGGER = 'game/engine/rules/trigger.mjs'
AMOUNT = 'game/engine/script/amount.mjs'
CONDITION = 'game/engine/script/condition.mjs'
EFFECTS = 'game/engine/script/effects/index.mjs'
PERMANENTS = 'game/engine/script/effects/permanents.mjs'
RESOURCES = 'game/engine/script/effects/resources.mjs'
SCHEMA = 'game/engine/script/schema.mjs'
VOCAB = 'game/engine/vocabulary.mjs'
HISTORY = 'game/room/history.mjs'
PLAN = 'docs/engine/PLAN.md'

ANNIHILATE = '''    for (const id of state.zones.battlefield) {
      const counters = state.objects[id].counters ?? {};
      const n = Math.min(counters["+1/+1"] ?? 0, counters["-1/-1"] ?? 0);
      if (n <= 0) continue;
      for (const kind of ["+1/+1", "-1/-1"]) {
        const before = counters[kind];
        counters[kind] = before - n;
        events.push(event("GameEventCardCounters", state, {card: cardRef(state, id), type: kind, oldValue: before, newValue: counters[kind]}));
      }
      acted = true;
    }

    /* CR 714.4: a Saga whose lore counters'''
LEVEL_TRIGGER = '''  "becomes level": (t) => ((t.who ?? "self") === "self" && Number.isInteger(t.level) && t.level >= 2 ? {on: "GameEventCardLevel", who: "self", level: t.level} : null),'''
LEVEL_SUBJECT = '''  if (condition.on === "GameEventCardLevel") return fields.card?.cardId === sourceId && fields.newValue === condition.level && (fields.oldValue ?? 1) < condition.level ? [{card: sourceId}] : [];'''
OFFSPRING_TRIGGER = '''    abilities.push({id: offspring.id, kind: "triggered", text: offspring.text, trigger: TRIGGERS.enters({who: "self"}), condition: {offspringPaid: true},
      effects: [{effect: "copyPermanent", targets: "self", lastKnown: true, except: {setPower: 1, setToughness: 1}}]});'''
OFFSPRING_CONDITION = '''    && ((offspring ?? (source !== null && source !== undefined ? state.objects[source]?.offspring : undefined)) === true) !== condition.offspringPaid) return false;'''
CHOICE_COUNTERS = '''    const n = amountOf(state, withChosen(count, option.chosen), {controller: chooser.controller, source: awaiting.objectId});'''
MOVED = '''    original: was.copiable ?? state.objects[id], except: {...(params.except ?? {}), ...(params.halfStats === true ? {setPower: half(was.power), setToughness: half(was.toughness)} : {})}}));'''

BREAKS = [
    # CR 704.5q, at once with the other state-based actions (CR 704.3): last in the pass, so a creature dies with both kinds.
    ('annihilation: before the deaths again', SBA, '    /* CR 704.5m: an Aura attached to nothing', ANNIHILATE.replace('\n\n    /* CR 714.4: a Saga whose lore counters', '\n\n') + '    /* CR 704.5m: an Aura attached to nothing'),
    ('annihilation: none', SBA, ANNIHILATE, '\n    /* CR 714.4: a Saga whose lore counters'),

    # "When this Class becomes level 2" (CR 716.2a): the trigger the compiler builds, and what it is about.
    ('level trigger: level 2 or more', INDEX, LEVEL_TRIGGER, LEVEL_TRIGGER.replace('t.level >= 2', 't.level >= 1')),
    ('level trigger: this one only', INDEX, LEVEL_TRIGGER, LEVEL_TRIGGER.replace('(t.who ?? "self") === "self" && ', '')),
    ('level trigger: its level', INDEX, LEVEL_TRIGGER, LEVEL_TRIGGER.replace('Number.isInteger(t.level) && t.level >= 2', 'true')),
    ('level subject: its own permanent', TRIGGER, LEVEL_SUBJECT, LEVEL_SUBJECT.replace('fields.card?.cardId === sourceId && ', '')),
    ('level subject: that level', TRIGGER, LEVEL_SUBJECT, LEVEL_SUBJECT.replace('fields.newValue === condition.level && ', '')),
    ('level subject: from below', TRIGGER, LEVEL_SUBJECT, LEVEL_SUBJECT.replace(' && (fields.oldValue ?? 1) < condition.level', '')),
    ('level subject: none', TRIGGER, LEVEL_SUBJECT, ''),
    ('vocabulary: becomes level', VOCAB, '  "becomes level",\n', ''),

    # A die rolled (CR 706).
    ('die: one to its sides', RESOURCES, '  const result = rng.int(params.sides) + 1;', '  const result = rng.int(params.sides);'),
    ('die: kept for what follows', RESOURCES, '  context.rolled = result;\n', ''),
    ('die: a die with sides', RESOURCES, '''  if (!(Number.isInteger(params.sides) && params.sides >= 2)) return [];\n''', ''),
    ('die: never without the stream', RESOURCES, '''  if (!rng) throw new Error("A die roll needs the game's random stream");\n''', ''),
    ('die: said', RESOURCES, 'sides: params.sides, result})];', 'sides: params.sides})];'),
    ('die: the registry', EFFECTS, '  rollDie,\n});', '});'),
    ('die: the vocabulary', VOCAB, '    "rollDie",\n', ''),
    ('die: the plan', PLAN, '`rollDie` ("roll a d20"', 'rollDie ("roll a d20"'),
    ('die: its sides, refused', SCHEMA, '''  if (name === "rollDie" && !(Number.isInteger(effect.sides) && effect.sides >= 2))''', '''  if (name === "rollDie" && !(effect.sides !== undefined))'''),
    ('die: the result counted', AMOUNT, '  else if ("dieRolled" in value) n = context.rolled ?? 0;', '  else if ("dieRolled" in value) n = 1;'),
    ('die: the amount kind', AMOUNT, '''  "dieRolled"]);''', '''  ]);'''),
    ('die: dieRolled is true', AMOUNT, '''  if ("dieRolled" in value && value.dieRolled !== true) problems.push''', '''  if (false) problems.push'''),
    ('die: the history', HISTORY, '''      return line(`${who(f.player.playerId)} rolled a d${f.sides}: ${f.result}`);''', '''      return [];'''),

    # Offspring (CR 702.175a): its cost, its offers, the permanent marked, its trigger's condition kept as it triggered.
    ('offspring: two variants', ACTIONS, '''      variants = variants.flatMap((v) => [v, {...v, mana: v.mana + (atom.cost ?? ""), offspring: true}]);''', '''      variants = variants.flatMap((v) => [v]);'''),
    ('offspring: its mana', ACTIONS, '''{...v, mana: v.mana + (atom.cost ?? ""), offspring: true}''', '''{...v, offspring: true}'''),
    ('offspring: on the offer', ACTIONS, ''' ...(variant.offspring ? {offspring: true} : {}),''', ''),
    ('offspring: another action', ACTIONS, '''  && (a.offspring === true) === (b.offspring === true)\n''', ''),
    ('offspring: on the stack entry', ACTIONS, '''    if (action.offspring === true) entry.offspring = true;\n''', ''),
    ('offspring: the permanent marked', STACK, '''    if (to === "battlefield" && entry.offspring === true) state.objects[arrived].offspring = true;\n''', ''),
    ('offspring: kept as it triggers', TRIGGER, '''            ...(object.offspring === true ? {offspring: true} : {}),\n''', ''),
    ('offspring: onto the stack', TRIGGER, '''      offspring: trigger.offspring === true,\n''', ''),
    ('offspring: on the ability', STACK, '''  if (offspring === true) entry.offspring = true;\n''', ''),
    ('offspring: asked again with it', STACK, '''...(entry.offspring ? {offspring: true} : {}),''', ''),
    ('offspring: the condition', CONDITION, OFFSPRING_CONDITION, OFFSPRING_CONDITION.replace(' !== condition.offspringPaid) return false;', ' !== condition.offspringPaid) return true;')),
    ('offspring: the condition as it triggered', CONDITION, OFFSPRING_CONDITION, OFFSPRING_CONDITION.replace('(offspring ?? (source', '((source')),
    ('offspring: the condition key', CONDITION, '''  "giftPromised",\n  /* Offspring's "if its offspring cost was paid" (CR 702.175a; wave 4c). */\n  "offspringPaid"];''', '''  "giftPromised"];'''),
    ('offspring: offspringPaid is true or false', CONDITION, '''  if ("offspringPaid" in condition && typeof condition.offspringPaid !== "boolean") problems.push''', '''  if (false) problems.push'''),
    ('offspring: a mana cost', INDEX, '''      if (!parsed || !parsed.symbols.length || parsed.variable > 0) problems.push(`${ability.text}: offspring is a mana cost`);''', ''),
    ('offspring: a creature', INDEX, '''      if (!(identity.types ?? []).includes("Creature")) problems.push(`${ability.text}: offspring on a card that is not a creature`);''', ''),
    ('offspring: once', INDEX, '''      if (offspring !== null) problems.push(`${ability.text}: a second offspring is not built`);''', ''),
    ('offspring: the keyword', INDEX, '''      keywords.push("Offspring");\n''', ''),
    ('offspring: the additional cost', INDEX, '''additionalCost: [...(spell?.additionalCost ?? []), {atom: "offspring", cost: offspring.cost}]};''', '''additionalCost: [...(spell?.additionalCost ?? [])]};'''),
    ('offspring: the trigger', INDEX, OFFSPRING_TRIGGER, ''),
    ('offspring: if paid', INDEX, OFFSPRING_TRIGGER, OFFSPRING_TRIGGER.replace(' condition: {offspringPaid: true},', '')),
    ('offspring: 1/1', INDEX, OFFSPRING_TRIGGER, OFFSPRING_TRIGGER.replace('except: {setPower: 1, setToughness: 1}', 'except: {}')),
    ('offspring: as it last existed', INDEX, OFFSPRING_TRIGGER, OFFSPRING_TRIGGER.replace('lastKnown: true, ', '')),
    ('vocabulary: offspring', VOCAB, '''  "offspring"];''', '''  ];'''),

    # Copies of what an effect moved, halved (Saw in Half), and a copy's characteristic-defining ability (CR 707.9d).
    ('moved copies: halved, rounded up', PERMANENTS, '  const half = (n) => Math.ceil((n ?? 0) / 2) + 0;', '  const half = (n) => Math.floor((n ?? 0) / 2) + 0;'),
    ('moved copies: as it was copying', PERMANENTS, MOVED, MOVED.replace('original: was.copiable ?? state.objects[id]', 'original: state.objects[id]')),
    ('moved copies: its controller', PERMANENTS, '''({id, controller: was.controller,''', '''({id, controller: context.controller,'''),
    ('moved copies: halfStats', PERMANENTS, MOVED, MOVED.replace('params.halfStats === true', 'false')),
    ('moved copies: the branch', PERMANENTS, '''  if (params.of === "moved") {\n''', '''  if (false) {\n'''),
    ('moved copies: its order asked', PERMANENTS, '''  if (effect?.effect === "copyPermanent" && effect.of === "moved") {''', '''  if (false) {'''),
    ('moved copies: its controller asked', PERMANENTS, '''      const asked = ask(one.controller, effect.count ?? 1, copiable(one.original, one.except), String(one.id));''',
     '''      const asked = ask(controller, effect.count ?? 1, copiable(one.original, one.except), String(one.id));'''),
    ('moved copies: the answer found', PERMANENTS, '''(id.key !== undefined ? String(id.key) : "lastKnown")''', '''"lastKnown"'''),
    ('copy: a defining ability not copied', PERMANENTS, '''(object.abilities ?? []).filter((a) => !definesSetStats(a, except))''', '''(object.abilities ?? [])'''),
    ('copy: only one that sets it', PERMANENTS, '''  && ((except.setPower !== undefined && ability.apply?.setPower !== undefined) || (except.setToughness !== undefined && ability.apply?.setToughness !== undefined));''',
     '''  && true;'''),
    ('schema: of moved, no targets', SCHEMA, '''effect.of === "moved" && effect.targets === undefined && effect.selector === undefined))''', '''effect.of === "moved"))'''),
    ('schema: of on a copyPermanent', SCHEMA, '''  if (effect.of !== undefined && !(name === "copyPermanent" && ''', '''  if (effect.of !== undefined && !(true && '''),
    ('schema: halfStats beside of', SCHEMA, '''  if (effect.halfStats !== undefined && !(effect.halfStats === true && effect.of === "moved"))''', '''  if (false)'''),

    # A mana ability that taps an artifact with no {T} of its own (Urza, Lord High Artificer).
    ('mana: no {T} of its own', INDEX, '''    || (a?.atom === "tapCreature" && (a.count ?? 1) === 1 && Boolean(a.selector) && typeof a.selector === "object")''',
     '''    || (a?.atom === "tapCreature" && (a.count ?? 1) === 1 && Boolean(a.selector) && typeof a.selector === "object" && cost.some((t) => t?.atom === "{T}"))'''),
    ('mana: its source among them', ACTIONS, '''(!tapsSelf || id !== sourceId) && !state.objects[id].tapped''', '''id !== sourceId && !state.objects[id].tapped'''),
    ('mana: whether it taps itself', ACTIONS, '''manaTappers(state, player, id, ability.tapCreature, ability.tapSelf === true)''', '''manaTappers(state, player, id, ability.tapCreature, false)'''),
    ('mana: whether it taps itself, always not', ACTIONS, '''manaTappers(state, player, id, ability.tapCreature, ability.tapSelf === true)''', '''manaTappers(state, player, id, ability.tapCreature, true)'''),

    # Counters a choice counts, as it enters (Banner of Kinship).
    ('chosen counters: kept beside the choice', REPLACEMENT, '''  if (ability.change?.entersWithCounters && namesChosen(ability.change.entersWithCounters.count)) {''', '''  if (false) {'''),
    ('chosen counters: on the question', REPLACEMENT, '''  return at < 0 ? asks : asks.map((ask, i) => (i === at ? {...ask, chosenCounters: proposal.chosenCounters} : ask));''', '''  return asks;'''),
    ('chosen counters: a copy entering', REPLACEMENT, '''  return {tapped: proposal.tapped === true, counters, asks: withChoiceCounters(proposal)};''', '''  return {tapped: proposal.tapped === true, counters, asks: proposal.asks ?? []};'''),
    ('chosen counters: counted with the choice', ENTERING, CHOICE_COUNTERS, CHOICE_COUNTERS.replace('withChosen(count, option.chosen)', 'count')),
    ('chosen counters: doubled as they enter', ENTERING, '''    chooser.counters[counter] = was + enteringCountersPlaced(state, awaiting.objectId, counter, n, chooser.controller);''', '''    chooser.counters[counter] = was + n;'''),
    ('chosen counters: said', ENTERING, '''fields: {card: eventCard(state, awaiting.objectId), type: counter, oldValue: was, newValue: chooser.counters[counter], by: chooser.controller}}});''',
     '''fields: {card: eventCard(state, awaiting.objectId), type: counter, oldValue: was, newValue: chooser.counters[counter]}}});'''),
    ('chosen counters: none put', ENTERING, '''  if (option.chosen !== undefined && chooser) for (const {counter, count} of asked?.chosenCounters ?? []) {''', '''  if (false) for (const {counter, count} of asked?.chosenCounters ?? []) {'''),
]
