# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""Wave 4a, lane h3: an object an effect remembers, referred to later by the same card (Spark Double; Mistrise Village;
Hunter's Insight; Koma, Cosmos Serpent; Goblin Welder; Secret Tunnel; Taunt from the Rampart; Summon: Fenrir; Legolas's Quick
Reflexes; Whirler Rogue; Lightning, Army of One; Ziatora, the Incinerator; Bria, Riptide Rogue; Thassa, God of the Sea; Minas
Morgul, Dark Fortress; Basim Ibn Ishaq; Selective Obliteration; Together Forever; Slip Through Space). One break for each
engine change they needed -- each guard, each branch -- and the suite that catches it:

    python3 game/tools/batch/breaks.py game/tools/batch/breaks-wave4a-h3.py
"""
SUITES = [
    'tests/engine-wave4a-h3.mjs',
    'tests/engine-cards.mjs',
]

ENTERING = 'game/engine/rules/entering.mjs'
REPLACEMENT = 'game/engine/rules/replacement.mjs'
TRIGGER = 'game/engine/rules/trigger.mjs'
ACTIONS = 'game/engine/rules/actions.mjs'
MANA = 'game/engine/rules/mana.mjs'
LAYERS = 'game/engine/rules/layers.mjs'
COMBAT = 'game/engine/keywords/combat.mjs'
STATE = 'game/engine/state/index.mjs'
VOCAB = 'game/engine/vocabulary.mjs'
PERMANENTS = 'game/engine/script/effects/permanents.mjs'
ASKING = 'game/engine/script/effects/asking.mjs'
RESOLUTION = 'game/engine/script/resolution.mjs'
FILTER = 'game/engine/script/filter.mjs'
BIND = 'game/engine/script/bind.mjs'
SCHEMA = 'game/engine/script/schema.mjs'
CONDITION = 'game/engine/script/condition.mjs'

# Each Koma guard shares its line with Grand Abolisher's (wave 4b, j4): a break takes Koma's away and leaves the other.
KOMA_OFFERS = '''    /* "Its activated abilities can't be activated this turn" (Koma, Cosmos Serpent; CR 602.5; state/index.mjs), and "during
       your turn, your opponents can't activate abilities of artifacts, creatures, or enchantments" (Grand Abolisher). */
    if (activationsForbidden(state, id) || permanentActivationForbidden(state, id)) continue;
'''
KOMA_MANA = '''    /* A mana ability is an activated ability (CR 605.1a): "its activated abilities can't be activated" (Koma) stops it too,
       and so does "your opponents can't activate abilities of artifacts, creatures, or enchantments" (Grand Abolisher). */
    if (activationsForbidden(state, id) || permanentActivationForbidden(state, id)) continue;
'''
KOMA_PLAIN = '''    /* Its mana abilities can't be activated (Koma, Cosmos Serpent; Grand Abolisher's opponents, during its controller's turn;
       CR 602.5, 605.1a): it pays for nothing. */
    if (activationsForbidden(state, id) || permanentActivationForbidden(state, id)) continue;
'''


def NOT_KOMA(anchor):
    return anchor.replace('if (activationsForbidden(state, id) || ', 'if (')


OWN_LOYALTY = '''  if ((types ?? []).includes("Planeswalker") && Number.isInteger(loyalty)) counters.loyalty = (counters.loyalty ?? 0) + loyalty;
  return {tapped: proposal.tapped === true, counters, asks: withChoiceCounters(proposal)};'''
COPY_KEYS = '"abilities", "power", "toughness", "loyalty", "spell", "enchant"]);'
RELATED = '''  return Boolean(first) && !Array.isArray(first) && first.kind === "object" && state.objects[first.id]?.zone === "battlefield"
    && candidate?.kind === "object" && state.objects[candidate.id]?.owner === controllerOf(state, first.id);'''

BREAKS = [
    # Spark Double (CR 707.9a, 614.1c): the exception's counters, by what it entered as, said as counters put on.
    ('spark: extra counters', ENTERING, '          counters[extra.counter] = (counters[extra.counter] ?? 0) + extra.count;\n',
     '          counters[extra.counter] = counters[extra.counter] ?? 0;\n'),
    ('spark: only if it is that', ENTERING,
     '        if (matchesSelector({...(extra.if ?? {}), what: "permanent"}, state, awaiting.objectId, {controller: object.controller, source: awaiting.objectId}))\n',
     '        if (true)\n'),
    ('spark: counters said', ENTERING, '        if (object.counters[counter] > was) events.push(', '        if (false) events.push('),
    # A planeswalker copied: its loyalty a copiable value (CR 707.2), and that many counters as it enters (CR 306.5b).
    ('copied planeswalker: loyalty counters', REPLACEMENT, OWN_LOYALTY, '  return {tapped: proposal.tapped === true, counters, asks: withChoiceCounters(proposal)};'),
    ('copiable: loyalty', PERMANENTS, '    ...(Number.isInteger(object.loyalty) ? {loyalty: object.loyalty} : {}),\n    ...(object.spell', '    ...(object.spell'),
    ('COPY_KEYS: loyalty', STATE, COPY_KEYS, '"abilities", "power", "toughness", "spell", "enchant"]);'),
    ('last known copiable: loyalty', LAYERS, COPY_KEYS, '"abilities", "power", "toughness", "spell", "enchant"]);'),
    # Hunter's Insight: a delayed trigger waits on the damage's source (CR 603.7c).
    ('delayed watch: the damage source', TRIGGER,
     '      const watched = d.on.on === "GameEventPlayerDamaged" ? event.data?.fields?.source?.cardId : event.data?.fields?.card?.cardId;',
     '      const watched = event.data?.fields?.card?.cardId;'),
    # Koma, Cosmos Serpent (CR 602.5, 605.1a).
    ('koma: forbidden', STATE,
     '  return (state.effects ?? []).some((effect) => effect.rule === ACTIVATIONS_FORBIDDEN && (effect.affects?.ids ?? []).includes(id));',
     '  return false;'),
    ('koma: no activation offered', ACTIONS, KOMA_OFFERS, NOT_KOMA(KOMA_OFFERS)),
    ('koma: no mana ability offered', ACTIONS, KOMA_MANA, NOT_KOMA(KOMA_MANA)),
    ('koma: no unasked payment', MANA, KOMA_PLAIN, NOT_KOMA(KOMA_PLAIN)),
    # The replacements a resolution remembers (CR 614.1, 614.5, 616.1).
    ('fenrir: enters with counters', REPLACEMENT,
     '  if (effect.rule === "enters-with-counters" && proposal.event === "enters" && (effect.affects?.ids ?? []).includes(proposal.objectId))\n',
     '  if (false)\n'),
    ('lightning: doubled', REPLACEMENT, '  if (effect.rule === "damage-doubled" && proposal.event === "damage") {', '  if (false) {'),
    ('lightning: a permanent that player controls', REPLACEMENT,
     '    const whose = toPlayer !== null ? toPlayer : state.objects[proposal.toCard] ? controllerOf(state, proposal.toCard) : null;',
     '    const whose = toPlayer;'),
    ('lightning: that player only', REPLACEMENT, '    if (whose !== null && (effect.players ?? []).includes(whose))', '    if (whose !== null)'),
    ('remembered replacements: candidates', REPLACEMENT,
     '    if (ability && !(proposal.appliedBy ?? []).includes(appliedKey(null, ability))) found.push({holderId: null, ability});',
     '    if (false) found.push({holderId: null, ability});'),
    ('remembered replacements: once each', REPLACEMENT,
     '    if (ability && !(proposal.appliedBy ?? []).includes(appliedKey(null, ability))) found.push({holderId: null, ability});',
     '    if (ability) found.push({holderId: null, ability});'),
    ('lightning: an order to choose', REPLACEMENT, '  n += (state.effects ?? []).filter((e) => e.rule === "damage-doubled").length;\n', ''),
    ('lightning: the players remembered', PERMANENTS, '"no-maximum-hand-size", "damage-doubled", "look-at-top", "player-hexproof"]', '"no-maximum-hand-size", "look-at-top", "player-hexproof"]'),
    ('lightning: named', PERMANENTS,
     '    ...(params.rule === "damage-doubled" ? {name: state.objects[context.source]?.card ?? context.lastKnown?.name ?? "An effect"} : {}),\n', ''),
    ('fenrir: the counters kept', PERMANENTS,
     '    ...(params.rule === "enters-with-counters" ? {counters: {counter: params.counter, count: params.count ?? 1}} : {}),\n', ''),
    # Ziatora: the reflexive trigger reads what was sacrificed as it last was (CR 608.2h).
    ('ziatora: last known', PERMANENTS, 'card: context.remembered[0], ...(was ? {lastKnown: structuredClone(was)} : {})}', 'card: context.remembered[0]}'),
    ('ziatora: one snapshot for each', PERMANENTS,
     '(context.movedWas ?? []).length === (context.remembered ?? []).length ? context.movedWas?.[0] : undefined', 'context.movedWas?.[0]'),
    # Shadow (CR 702.28b) and its counter (CR 122.1b).
    ('shadow: counter', LAYERS, '  "shadow": "Shadow"});', '});'),
    ('shadow: blocking', COMBAT, '  if (has(state, attackerId, "Shadow") !== has(state, blockerId, "Shadow")) return false;\n', ''),
    ('shadow: a keyword with behavior', COMBAT, '    "Shadow"]),', '    ]),'),
    ('shadow: declared', VOCAB, '  "shadow",\n', ''),
    # Selective Obliteration: each player's color, and whose it is.
    ('obliteration: that player chooses', ASKING,
     'effect: "chooseColor", player: Number.isInteger(params.chooser) ? params.chooser : context.controller,',
     'effect: "chooseColor", player: context.controller,'),
    ('obliteration: whose color', ASKING, 'chosenColor: picked[0], colorChooser: awaiting.player}', 'chosenColor: picked[0]}'),
    ('obliteration: colors kept', RESOLUTION,
     '    state.resolving.context.chosenColors = {...(state.resolving.context.chosenColors ?? {}), [outcome.colorChooser]: outcome.chosenColor};',
     '    state.resolving.context.chosenColors = {};'),
    ('obliteration: only the chosen color', FILTER,
     '      if ((chosen !== undefined && colors.length === 1 && colors[0] === chosen) !== selector.onlyChosenColor) return false;', '      if (false) return false;'),
    ('obliteration: only one color', FILTER, '(chosen !== undefined && colors.length === 1 && colors[0] === chosen)', '(chosen !== undefined && colors[0] === chosen)'),
    ('obliteration: grammar', FILTER,
     '  if (selector.onlyChosenColor !== undefined && typeof selector.onlyChosenColor !== "boolean") throw new Error(', '  if (false) throw new Error('),
    ('obliteration: the key', FILTER, '  "onlyChosenColor",\n]);', ']);'),
    # Goblin Welder: "in that player's graveyard" (CR 115.1, 608.2b), "if both targets are still legal".
    ('welder: spec key', BIND, '"share", "forEach", "ownedByControllerOf"]);', '"share", "forEach"]);'),
    ('welder: related', BIND, RELATED, '  return true;'),
    ('welder: the ways to aim it', BIND,
     '      if (!otherThan(spec, chosen).some((o) => sameTarget(o, candidate)) && relatedLegal(state, spec, chosen, candidate)) next.push([...chosen, candidate]);',
     '      if (!otherThan(spec, chosen).some((o) => sameTarget(o, candidate))) next.push([...chosen, candidate]);'),
    ('welder: a candidate after the first', BIND,
     '        && (!Number.isInteger(spec?.ownedByControllerOf) || !Array.isArray(context?.chosenTargets) || relatedLegal(state, spec, context.chosenTargets, {kind, id}))) found.push({kind, id});',
     '        ) found.push({kind, id});'),
    ('welder: rechecked', BIND,
     '    if (Number.isInteger(spec?.ownedByControllerOf) && targets[index] && !relatedLegal(state, spec, targets, targets[index])) { targets[index] = null; legal -= 1; }',
     '    if (false) { targets[index] = null; legal -= 1; }'),
    ('welder: schema', SCHEMA, '    if (ownedByControllerOf !== undefined && !(', '    if (false && !('),
    ('welder: both legal', CONDITION,
     '  if (condition.targetsLegal === true && !(Array.isArray(targets) && targets.length > 0 && targets.every((t) => t !== null && t !== undefined))) return false;',
     '  if (false) return false;'),
    ('welder: none at all', CONDITION, 'Array.isArray(targets) && targets.length > 0 && targets.every(', 'Array.isArray(targets) && targets.every('),
    ('welder: condition key', CONDITION, '  "targetsLegal",\n', ''),
    ('welder: condition problems', CONDITION, '  if ("targetsLegal" in condition && condition.targetsLegal !== true) problems.push(', '  if (false) problems.push('),
    # Summon: Fenrir's "the creature with the greatest power or tied" (CR 208.1).
    ('fenrir: greatest power', CONDITION,
     '    if (!creatures.some((id, at) => controllerOf(state, id) === controller && powers[at] === most)) return false;', '    if (false) return false;'),
    ('fenrir: a power below zero', CONDITION, 'most = Math.max(...powers);', 'most = Math.max(0, ...powers);'),
    ('fenrir: yours', CONDITION, 'creatures.some((id, at) => controllerOf(state, id) === controller && powers[at] === most)', 'creatures.some((id, at) => powers[at] === most)'),
    ('fenrir: condition key', CONDITION, '  "greatestPower",\n', ''),
    ('fenrir: condition problems', CONDITION, '  if ("greatestPower" in condition && condition.greatestPower !== "you") problems.push(', '  if (false) problems.push('),
]
