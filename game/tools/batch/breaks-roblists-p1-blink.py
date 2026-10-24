# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""Rob's priority lists, lane P1 (blink), 2026-10-24: prove each engine change can fail."""
SUITES = ['tests/engine-roblists-p1.mjs']
PERMANENTS = 'game/engine/script/effects/permanents.mjs'
ZONES = 'game/engine/script/effects/zones.mjs'
ASKING = 'game/engine/script/effects/asking.mjs'
EFFECTS = 'game/engine/script/effects/index.mjs'
RESOURCES = 'game/engine/script/effects/resources.mjs'
ATTRIBUTES = 'game/engine/script/effects/attributes.mjs'
CONDITION = 'game/engine/script/condition.mjs'
RESOLUTION = 'game/engine/script/resolution.mjs'
SCHEMA = 'game/engine/script/schema.mjs'
STATICS = 'game/engine/rules/statics.mjs'
TURN = 'game/engine/rules/turn.mjs'
TRIGGER = 'game/engine/rules/trigger.mjs'
ACTIONS = 'game/engine/rules/actions.mjs'
STACK = 'game/engine/rules/stack.mjs'
INDEX = 'game/engine/cards/index.mjs'
BREAKS = [
 # Niko, Light of Hope: Shards copies until the next end step.
 ('copies end as an end step begins', TURN, '  if (state.phase === "END_OF_TURN") endCopies(state, "next-end-step");\n', ''),
 ('only the copies of that duration end', PERMANENTS, '    if (!(object.copyEffects ?? []).some((c) => c.until === until)) continue;', '    if (!(object.copyEffects ?? []).some((c) => c.until === "end-of-turn")) continue;'),
 # Portal to Phyrexia: a subtype added as the card returns.
 ('a Phyrexian in addition', PERMANENTS, '  if (params.addSubtypes) pushEffect(state, {id: `subtypes:${context.source ?? "effect"}`', '  if (false) pushEffect(state, {id: `subtypes:${context.source ?? "effect"}`'),
 # Preston, the Vanisher: a 0/1 white Illusion.
 ('its creature types replaced', PERMANENTS, '.filter((t) => !except.setCreatureTypes || !isCreatureType(t))', '.filter((t) => !except.setCreatureTypes || true)'),
 ('the Illusion type added', PERMANENTS, ', ...(except.setCreatureTypes ?? [])])],', '])],'),
 ('if it wasn\'t cast', CONDITION, "    if ((id !== null && id !== undefined && state.objects[id]?.castFrom !== undefined) !== condition.wasCast) return false;", "    if (false) return false;"),
 # Y'shtola Rhul: an additional end step, the first end step of the turn.
 ('an end step may be added', PERMANENTS, '  "end step": ["END_OF_TURN"],\n', ''),
 ('added after this step, not this phase', PERMANENTS, 'const after = (params.phases ?? []).includes("end step") ? state.phase : endOfPhase(state.phase);', 'const after = endOfPhase(state.phase);'),
 ('the first end step only', CONDITION, '  if (condition.firstEndStep === true && (state.endStepsThisTurn ?? 0) !== 1) return false;', '  if (condition.firstEndStep === true && (state.endStepsThisTurn ?? 0) > 2) return false;'),
 ('end steps counted as each begins', TURN, '  if (state.phase === "END_OF_TURN") state.endStepsThisTurn = (state.endStepsThisTurn ?? 0) + 1;\n', ''),
 ('end steps counted afresh each turn', TURN, '    if (state.endStepsThisTurn) state.endStepsThisTurn = 0;\n', ''),
 # Avatar's Wrath: opponents can't cast from anywhere but a hand until your next turn; all other creatures; exiled as it resolves.
 ('the effect made', PERMANENTS, '  if (params.rule === "cant-cast" && params.fromAnywhereButHand === true) {', '  if (false) {'),
 ('the effect says from anywhere but a hand', PERMANENTS, 'rule: "cant-cast", players: [...forbidden], spells: {}, fromAnywhereButHand: true,', 'rule: "cant-cast", players: [...forbidden], spells: {},'),
 ('a spell from a hand is not forbidden', STATICS, '    if (effect.fromAnywhereButHand === true && object.zone === "hand") continue;\n', ''),
 ('the target spared', ZONES, "  const spared = Number.isInteger(params.exceptTarget) ? [].concat(context.targets?.[params.exceptTarget] ?? []).map((t) => (t?.kind === \"object\" ? t.id : t)) : [];", '  const spared = [];'),
 ('exiled as it resolves', STACK, '  const exiles = paradigm !== null || (!fizzled && state.objects[entry.objectId]?.spell?.exileAsResolves === true);', '  const exiles = paradigm !== null;'),
 ('exileAsResolves compiled', INDEX, '        ...(ability.exileAsResolves === true ? {exileAsResolves: true} : {}),\n', ''),
 # Airbend: its owner may cast it for {2} rather than its mana cost.
 ("the owner's permission", ZONES, '    for (const id of ids) mayPlay(state, {...params, owner: false, targets: [id], player: state.objects[id].owner}, context);', '    for (const id of ids) mayPlay(state, {...params, owner: false, targets: [id]}, context);'),
 ('the {2} kept on the permission', ZONES, '    ...(typeof params.manaInstead === "string" ? {manaInstead: params.manaInstead} : {}),\n', ''),
 ('the {2} read from the permission', ACTIONS, '      ...(typeof e.manaInstead === "string" ? {manaInstead: e.manaInstead} : {}),\n', ''),
 ('the {2} offered', ACTIONS, '  const reckoned = castCost(state, player, id, tax, freely, paidLife !== null ? "" : back ? back.mana : fled ? fled.mana : way ? way.mana : manaInstead, variant.mana, aim);', '  const reckoned = castCost(state, player, id, tax, freely, paidLife !== null ? "" : back ? back.mana : fled ? fled.mana : way ? way.mana : null, variant.mana, aim);'),
 ('the {2} paid', ACTIONS, '  const manaInstead = !way && !free && lifeCost === null && typeof permission?.ability.manaInstead === "string" ? permission.ability.manaInstead : null;', '  const manaInstead = null;'),
 ('no other alternative cost', ACTIONS, ' : flashback || escape || lifeCost !== null || manaInstead !== null || permit?.ability.free ? []', ' : flashback || escape || lifeCost !== null || permit?.ability.free ? []'),
 ('not face down', ACTIONS, '  if (disguise && (lifeCost !== null || permit?.ability.free || manaInstead !== null)) return actions;', '  if (disguise && (lifeCost !== null || permit?.ability.free)) return actions;'),
 ('a card with no mana cost', ACTIONS, '  if (manaInstead !== null && !disguise) { /* airbended', '  if (false) { /* airbended'),
 ('two permissions alike or not', ACTIONS, ' ability.graveyardToLibraryBottom === true, ability.manaInstead ?? null,\n', ' ability.graveyardToLibraryBottom === true,\n'),
 # Aerial Extortionist: a spell cast from anywhere other than a hand.
 ('not from a hand, matched', TRIGGER, '    if (condition.notCastFrom && fields.castFrom === condition.notCastFrom) return [];\n', ''),
 ('not from a hand, compiled', INDEX, '    ...(t.notFrom ? {notCastFrom: t.notFrom} : {}),\n', ''),
 # Dour Port-Mage: leave the battlefield without dying.
 ('without dying, matched', TRIGGER, '    if (condition.notTo && fields.to?.zoneType === condition.notTo) return false;\n', ''),
 ('without dying, compiled', INDEX, ' ...(t.notTo === "graveyard" ? {notTo: "Graveyard"} : {}),', ''),
 # Elesh Norn, Mother of Machines: opponents' entering triggers suppressed.
 ('entering triggers nothing of theirs', TRIGGER, '            && ruleChanged(state, "entering-doesnt-trigger", id)) continue;', '            && false) continue;'),
 # Fear of Sleep Paralysis: stun counters that stay.
 ('stun counters stay', RESOURCES, '      if (kind === "stun" && before > 0 && object.zone === "battlefield" && ruleChanged(state, "stun-counters-stay", id)) continue;\n', ''),
 # Getaway Glamer: no other creature with greater power.
 ('a tie is no greater power', CONDITION, '(characteristicsOf(state, other).power ?? 0) > power)) return false;', '(characteristicsOf(state, other).power ?? 0) >= power)) return false;'),
 # Lae'zel's Acrobatics: the die read by a branch; an entering trigger of a permanent gone again.
 ('the die to the branch', RESOLUTION, ' cast: resolving.context.cast, rolled: resolving.context.rolled,\n', ' cast: resolving.context.cast,\n'),
 ('the die counted', CONDITION, '      ...(rolled !== undefined ? {rolled} : {}),\n', ''),
 ('gone again, its entering trigger', TRIGGER, '    if (goneAgain && !enteringSuppressedGone(state, goneAgain)) for (const own of goneAgain.abilities ?? []) {', '    if (false) for (const own of goneAgain.abilities ?? []) {'),
 ('gone again, Elesh Norn', TRIGGER, '  && matchesLastKnown(a.affects ?? {}, gone, {controller: state.objects[holderId].controller, source: holderId})));', '  && false));'),
 ('gone again, Panharmonicon', TRIGGER, '    return Boolean(gone) && matchesLastKnown(cause.filter ?? {}, gone, context);', '    return false;'),
 # The Mind Stone: harness and its ∞ ability.
 ('harnessed given', ATTRIBUTES, '      object.harnessed = true;\n', ''),
 ('the ∞ ability inactive until harnessed', TRIGGER, '          if (ability.harnessed === true && object.harnessed !== true) continue;\n', ''),
 ('the ∞ ability compiled', INDEX, '        ...(ability.harnessed === true ? {harnessed: true} : {}),\n', ''),
 # Trouble in Pairs: extra turns skipped; attacks at you counted.
 ("an opponent's extra turn skipped", TURN, ' && playerRuleChanged(state, "skip-extra-turns", extra.player)) continue;', ' && false) continue;'),
 ('attacks at you counted', TRIGGER, '(condition.attacksYou ? attacks.filter((a) => a.defender?.playerId === controller && !a.defender.planeswalker) : attacks).length', 'attacks.length'),
 ('attacks at you, compiled', INDEX, '    ...(t.attacksYou === true ? {attacksYou: true} : {}),\n', ''),
 # Battle Angels of Tyr: myriad, and "more than each other player".
 ('myriad: other opponents', EFFECTS, ' && player !== context.about?.player).map((player) => ({player}));', ').map((player) => ({player}));'),
 ('myriad: that player or their planeswalker', PERMANENTS, '    const places = attackPlaces(state, controller).filter((place) => place.player === context.about?.player);', '    const places = attackPlaces(state, controller);'),
 ('myriad: the places asked', ASKING, 'places: params.places ?? attackPlaces(state, params.player)};', 'places: attackPlaces(state, params.player)};'),
 ('myriad: every token kept', PERMANENTS, '  if (params.rememberMore) context.remembered = [...(context.remembered ?? []), ...made];\n', ''),
 ('myriad: no tokens, no trigger', INDEX, ' condition: {compare: {count: {rememberedCount: true}, atLeast: 1}},', ''),
 ('more than each other player, a tie is not', CONDITION, '!p.lost && measure(p.id) >= measure(them.id))) return false;', '!p.lost && measure(p.id) > measure(them.id))) return false;'),
 # The grammar that lets the cards say it: a refused key is an unplayable card.
 ('harnessed is a designation', SCHEMA, ' && effect.attribute !== "harnessed")', ')'),
 ('a cast forbidden from anywhere but a hand', SCHEMA, 'effect.rule === "cant-cast" && effect.fromAnywhereButHand === undefined && ((effect.named', 'effect.rule === "cant-cast" && ((effect.named'),
 ('the new conditions declared', CONDITION, '  "noGreaterPower", "wasCast", "firstEndStep",\n', '  "wasCast", "firstEndStep",\n'),
 ('stun counters stay, declared', STATICS, '  "stun-counters-stay": "script/effects/resources.mjs",\n', ''),
 ('myriad declared', 'game/engine/vocabulary.mjs', '  "myriad",\n', ''),
 # Riptide Gearhulk's one target per opponent and third from the top are the engine's already (bind.mjs `forEach`, zones.mjs
 # `position`): nothing built, nothing to break.
]
