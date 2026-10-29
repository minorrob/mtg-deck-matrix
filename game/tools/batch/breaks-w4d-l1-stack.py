# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""The card load of 2026-10-23, lane L1 (the stack, walkers and two-faced cards): one break per engine change.

Emblems with a static ability in a layer (rules/layers.mjs, cards/index.mjs: Liliana of the Dark Realms); flash for cards
anywhere but the battlefield (rules/layers.mjs: Teferi, Mage of Zhalfir); mobilize (cards/index.mjs, vocabulary.mjs: Voice of
Victory); each opponent keeping their own of each type (effects/asking.mjs: Liliana, Dreadhorde General); boast and boasting
twice, mana kept until end of turn, and a modal double-faced card cast as its back face (cards/index.mjs, rules/actions.mjs,
rules/statics.mjs, effects/resources.mjs, rules/turn.mjs, state/index.mjs: Birgi, God of Storytelling); copies of abilities
(script/filter.mjs, rules/stack.mjs, effects/asking.mjs, room/history.mjs: Strionic Resonator, Return the Favor); what
proliferate put counters on (effects/asking.mjs: Ripples of Potential); a token linked to an exiled card (effects/permanents.mjs:
Ugin, the Ineffable); a token multiplier for creature tokens alone (rules/statics.mjs: Ojer Taq); and a number chosen at
random, a different name, another player casting, the exiled cards (effects/resources.mjs, effects/zones.mjs, script/bind.mjs,
effects/asking.mjs, room/history.mjs: Tibalt's Trickery).

Run from the repository root, with nothing else editing the worktree:

    python3 game/tools/batch/breaks.py game/tools/batch/breaks-w4d-l1-stack.py
"""
SUITES = ['tests/engine-w4d-stack.mjs', 'tests/engine-cards.mjs']
LAYERS = 'game/engine/rules/layers.mjs'
INDEX = 'game/engine/cards/index.mjs'
ASKING = 'game/engine/script/effects/asking.mjs'
ACTIONS = 'game/engine/rules/actions.mjs'
BREAKS = [
    # Teferi, Mage of Zhalfir
    ('a card elsewhere is a card on the battlefield', LAYERS,
     '(wanted === "elsewhere" ? zone !== "battlefield" :', '(wanted === "elsewhere" ? zone === "battlefield" :'),
    # Liliana of the Dark Realms' emblem
    ("an emblem's static ability in a layer gathered by nothing", LAYERS,
     '      found.push({...ability, sourceId: id, sourceController: holder.controller, timestamp: ability.timestamp ?? holder.timestamp});\n', ''),
    ("an emblem's static never counted as giving abilities", LAYERS,
     '...(state.zones.graveyard ?? []).flat(), ...emblemsIn(state)];', '...(state.zones.graveyard ?? []).flat()];'),
    ("an emblem's static in a layer refused by the compiler", INDEX,
     '        || (ability?.kind === "static" && ability.rule === undefined && Number.isInteger(ability.layer))))', '        || false)))'),
    # Voice of Victory
    ('mobilize makes one Warrior', INDEX,
     'effects: [{effect: "createToken", count: ability.amount ?? 1, tapped: true, attacking: true, atEndStep: "sacrifice",',
     'effects: [{effect: "createToken", count: 1, tapped: true, attacking: true, atEndStep: "sacrifice",'),
    ('mobilize no keyword the engine accepts', 'game/engine/vocabulary.mjs', '  "mobilize",\n', ''),
    # Liliana, Dreadhorde General
    ("the effect's controller chooses what each opponent keeps", ASKING,
     '...(awaiting.keptByEach && at < awaiting.steps.length ? {player: awaiting.steps[at].player} : {})', '...({})'),
    ('keptByEach never carried to the question', ASKING,
     '...(params.keptByEach === true ? {keptByEach: true} : {}), keepTypes:', 'keepTypes:'),
    # Birgi, God of Storytelling // Harnfel, Horn of Bounty
    ('boast compiled as a plain ability', INDEX,
     '...(ability.boast === true ? {boast: true, limit: 1, condition: ability.condition', '...(false ? {boast: true, limit: 1, condition: ability.condition'),
    ('boast with no "attacked this turn"', INDEX,
     '          : {present: {what: "permanent", self: true, attackedThisTurn: true}}} : {})});', '          : {}} : {})});'),
    ('boast twice never', ACTIONS,
     '  && playerRuleChanged(state, "boast-twice", state.objects[id].controller) ? 2 : ability.limit);', '  && false ? 2 : ability.limit);'),
    ("boast twice in another player's turn", ACTIONS,
     'ability.boast === true && state.objects[id]?.controller === state.activePlayer\n', 'ability.boast === true\n'),
    ('boast-twice no rule', 'game/engine/rules/statics.mjs', '  "boast-twice": "rules/actions.mjs",\n', ''),
    ("Birgi's mana lost as the step ends", 'game/engine/script/effects/resources.mjs',
     '  if (params.untilEndOfTurn === true) {', '  if (false) {'),
    ("Birgi's mana kept into the next turn", 'game/engine/rules/turn.mjs',
     '    const turnKept = player.turnMana?.turn === state.turn', '    const turnKept = player.turnMana !== undefined'),
    ('a back face never offered to cast', ACTIONS,
     'for (const entry of castable) if (["hand", "command"].includes(entry.from) && backSpell(state.objects[entry.id]))',
     'for (const entry of castable) if (false)'),
    ('a back face cast weighed as its front', ACTIONS,
     ': action?.kind === "cast" && action?.face === "back" ? withBackFace(state, action.objectId, fn)', ': false ? withBackFace(state, action.objectId, fn)'),
    ('a back face cast not said', ACTIONS, '        ...(face === "back" ? {face: "back"} : {})};', '        ...({})};'),
    ('a land back face offered as a spell', ACTIONS,
     'object.face !== "back" && !(object.mdfc.back.types ?? []).includes("Land");', 'object.face !== "back";'),
    ("a transforming card's back face offered as a spell", ACTIONS,
     'const backSpell = (object) => object?.mdfc !== undefined && object.mdfc.transforming !== true && object.face',
     'const backSpell = (object) => object?.mdfc !== undefined && object.face'),
    ('a back face left up in the hand', ACTIONS,
     '  finally { if (state.objects[id]?.face === "back") showFace(state, id, "front"); }', '  finally { }'),
    ('a back face cast arrives on the stack as its front', 'game/engine/state/index.mjs',
     '      || (zone === "stack" && from.face === "back" && from.mdfc.transforming !== true) ? "back" : undefined} : {}),', '      ? "back" : undefined} : {}),'),
    # Strionic Resonator, Return the Favor
    ('any ability a triggered one', 'game/engine/script/filter.mjs',
     '    if (selector.abilityKind === "triggered" && entry.kind !== "trigger") return false;\n', ''),
    ('abilityKind no selector key', 'game/engine/script/filter.mjs',
     '"singleTarget", "abilityKind", "goaded",', '"singleTarget", "goaded",'),
    ("an ability's copy controlled by the original's controller", 'game/engine/rules/stack.mjs',
     'stackId: state.nextStackId, playerId: controller, stage: "waiting", copy: true};', 'stackId: state.nextStackId, playerId: original.playerId, stage: "waiting", copy: true};'),
    ("an ability's copy never on the stack", 'game/engine/rules/stack.mjs',
     '  state.nextStackId += 1;\n  state.stack.push(entry);\n  return entry;\n}\n\n/* What an entry does', '  state.nextStackId += 1;\n  return entry;\n}\n\n/* What an entry does'),
    ('copySpell copies nothing by its stack entry', ASKING,
     '...(Array.isArray(params.stack) ? params.stack.map((id) => state.stack.find((e) => e.stackId === id)) : [])]', '...[]]'),
    ("an ability's copy keeps its targets", ASKING,
     '        if (params.newTargets === true) copy.targets.forEach((t, index) => { if (!Array.isArray(t) || t.length) questions.push({stackId: copy.stackId, index}); });\n        continue;',
     '        continue;'),
    ("an ability's copy not said", ASKING,
     '        events.push(event("GameEventAbilityCopied", state, {name: original.name, playerId: context.controller, stackId: copy.stackId, original: original.stackId}));\n', ''),
    ('the history silent on an ability copied', 'game/room/history.mjs', '    case "GameEventAbilityCopied":\n', ''),
    # Ripples of Potential
    ('proliferate remembers nothing', ASKING,
     '    return awaiting.remember ? {events, remembered: chosen.filter((id) => typeof id !== "object" && state.objects[id]?.zone === "battlefield")} : events;',
     '    return events;'),
    # Ugin, the Ineffable
    ('the Spirit linked to nothing', 'game/engine/script/effects/permanents.mjs',
     '  if (params.linkRemembered === true) for (const id of made) if (state.objects[id])', '  if (false) for (const id of made) if (state.objects[id])'),
    # Ojer Taq, Deepest Foundation
    ('every token tripled, not creature tokens alone', 'game/engine/rules/statics.mjs',
     'event.map((g) => (multiplies(ability, g.token) ? {...g, count: g.count * ability.times} : g));', 'event.map((g) => ({...g, count: g.count * ability.times}));'),
    # Tibalt's Trickery
    ('the same name found', 'game/engine/script/effects/zones.mjs',
     '        && (params.differentName === undefined || state.objects[id]?.card !== params.differentName)) hits.push(id);', ') hits.push(id);'),
    ('the cards passed over not remembered', 'game/engine/script/effects/zones.mjs',
     '    if (params.exile && params.rest === undefined) dug.push(...taken);\n', ''),
    ('the exiled cards remembered by nothing', 'game/engine/script/effects/zones.mjs',
     '  if (params.rememberAll === true) context.exiledThisWay', '  if (false) context.exiledThisWay'),
    ('"the exiled cards" names nothing', 'game/engine/script/bind.mjs',
     '  if (value === "the exiled cards") return (context.exiledThisWay ?? []).slice();\n', ''),
    ('a number at random rolled as a die', 'game/engine/script/effects/resources.mjs',
     '  if (params.atRandom === true) return [event("GameEventNumberChosen"', '  if (false) return [event("GameEventNumberChosen"'),
    ('the history silent on a number chosen', 'game/room/history.mjs', '    case "GameEventNumberChosen":\n', ''),
    ('the caster casts, not the spell\'s controller', ASKING,
     '    const player = Array.isArray(params.who) ? params.who[0] : context.controller;', '    const player = context.controller;'),
]
