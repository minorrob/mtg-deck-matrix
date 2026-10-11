# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""Playing a card exiled face down (Gandalf, Goblins' Bane // Flameshape; CR 406.3a): one break per guard.

Run from the repository root, with nothing else editing the worktree:

    python3 game/tools/batch/breaks.py game/tools/batch/breaks-flameshape.py
"""
SUITES = [
    'tests/engine-face-down-play.mjs',
    'tests/engine-hidden-exile.mjs',
    'tests/engine-adventure.mjs',
    'tests/engine-manifest.mjs',
    'tests/board-choices.mjs',
]
IDENTITY = '((s, i, f) => f())'
BREAKS = [
    # The card face down keeps the whole card, its Adventure too (state/index.mjs).
    ('adventurer not kept face down', 'game/engine/state/index.mjs',
     '"mdfc", "preparation", "adventurer"];', '"mdfc", "preparation"];'),
    ('shown face up shows nothing', 'game/engine/state/index.mjs',
     'return {...rest, ...structuredClone(object.faceDownCard ?? {})};', 'return {...rest};'),
    # Weighed face up for the length of a question, and only in exile (rules/actions.mjs, withFaceUp).
    ('face up anywhere face down', 'game/engine/rules/actions.mjs',
     'if (card?.faceDown !== true || card.zone !== "exile") return fn();', 'if (card?.faceDown !== true) return fn();'),
    ('never face down again after asking', 'game/engine/rules/actions.mjs',
     'finally { if (state.objects[id] === shown) state.objects[id] = card; }', 'finally { }'),
    ('face down again after it was played', 'game/engine/rules/actions.mjs',
     'finally { if (state.objects[id] === shown) state.objects[id] = card; }', 'finally { state.objects[id] = card; }'),
    ('a cast question weighs it face down', 'game/engine/rules/actions.mjs',
     'const asCast = (state, action, fn) => withFaceUp(state, action?.objectId, () => (',
     'const asCast = (state, action, fn) => ' + IDENTITY + '(state, action?.objectId, () => ('),
    # The permission: its condition, its player, the card it names (permissionOpen, permits, allPlayPermissions).
    ('permission condition never asked', 'game/engine/rules/actions.mjs',
     '\n  && conditionHolds(state, ability.condition, {controller: player, source});', ';'),
    ('onlyIf not carried to the permission', 'game/engine/rules/actions.mjs',
     ', ...(e.onlyIf !== undefined ? {condition: e.onlyIf} : {})', ''),
    ('a named permission played while closed', 'game/engine/rules/actions.mjs',
     'if (ability.ids && permissionOpen(state, player, ability, source))', 'if (ability.ids)'),
    ('offered to a player who may not look', 'game/engine/rules/actions.mjs',
     '  if (state.objects[id]?.faceDown === true && !mayLookAt(state, state.objects[id], player)) return false;\n', ''),
    ('permission weighs the face-down card', 'game/engine/rules/actions.mjs',
     'return withFaceUp(state, id, () => permitsShown(state, player, ability, id, kind, source));',
     'return permitsShown(state, player, ability, id, kind, source);'),
    # The offers and the play (offers, idle, perform).
    ('land offered face down', 'game/engine/rules/actions.mjs',
     'actions.push(...withFaceUp(state, id, () => permissionWays(state, player, id, "land")',
     'actions.push(...' + IDENTITY + '(state, id, () => permissionWays(state, player, id, "land")'),
    ('cast offered face down', 'game/engine/rules/actions.mjs',
     'actions.push(...withFaceUp(state, entry.id, () => castOffers(state, player, entry, tappable)));',
     'actions.push(...castOffers(state, player, entry, tappable));'),
    ('adventure offered face down', 'game/engine/rules/actions.mjs',
     'for (const id of adventurers) actions.push(...withFaceUp(state, id, () => {',
     'for (const id of adventurers) actions.push(...' + IDENTITY + '(state, id, () => {'),
    ('nothing to do read face down', 'game/engine/rules/actions.mjs',
     'return !spells.some((id) => withFaceUp(state, id, () => castableNow(id)',
     'return !spells.some((id) => ' + IDENTITY + '(state, id, () => castableNow(id)'),
    ('a land played face down', 'game/engine/rules/actions.mjs',
     'if (action?.kind === "cast" || action?.kind === "play-land") return asCast(', 'if (action?.kind === "cast") return asCast('),
    ('a spell cast face down', 'game/engine/rules/actions.mjs',
     'if (action?.kind === "cast" || action?.kind === "play-land") return asCast(', 'if (action?.kind === "play-land") return asCast('),
    # The effects (script/effects/zones.mjs).
    ('onlyIf not recorded', 'game/engine/script/effects/zones.mjs',
     ' ...(params.onlyIf !== undefined ? {onlyIf: structuredClone(params.onlyIf)} : {}),', ''),
    ('exiled face up', 'game/engine/script/effects/zones.mjs',
     '\n      ...(params.faceDown === true ? {faceDown: true, lookers: params.look === true ? [context.controller] : []} : {})});', '});'),
    ('the look forgotten', 'game/engine/script/effects/zones.mjs',
     'lookers: params.look === true ? [context.controller] : []', 'lookers: []'),
    ('a look nobody took', 'game/engine/script/effects/zones.mjs',
     'lookers: params.look === true ? [context.controller] : []', 'lookers: [context.controller]'),
    # The table's words for the offer (game/room/room.mjs, offerDetails).
    ('the table reads the face-down card', 'game/room/room.mjs',
     'return o?.faceDown === true && o.zone === "exile" ? shownFaceUp(o) : o; };', 'return o; };'),
    ('the table reads face-down modes', 'game/room/room.mjs',
     'card(a.objectId)?.spell?.modal;', 'state.objects[a.objectId]?.spell?.modal;'),
    ('the table reads a face-down alternative cost', 'game/room/room.mjs',
     'card(a.objectId)?.abilities?.[a.alternative];', 'state.objects[a.objectId]?.abilities?.[a.alternative];'),
    # The compiler and the schema.
    ('onlyIf without cards compiles', 'game/engine/cards/index.mjs',
     'if (effect.onlyIf !== undefined && effect.targets === undefined) problems.push(', 'if (false) problems.push('),
    ('face down onto the battlefield compiles', 'game/engine/cards/index.mjs',
     'if (effect.effect === "moveZone" && effect.faceDown !== undefined && !(effect.faceDown === true && effect.to === "exile"))', 'if (false)'),
    ('a look without the exile compiles', 'game/engine/cards/index.mjs',
     'if (effect.effect === "moveZone" && effect.look !== undefined && !(effect.look === true && effect.faceDown === true))', 'if (false)'),
    ('onlyIf condition unchecked', 'game/engine/script/schema.mjs',
     'if (name === "mayPlay") for (const message of conditionProblems(effect.onlyIf))', 'if (false) for (const message of conditionProblems(effect.onlyIf))'),
    # The scenario runner's new expectations (cards/scenario.mjs).
    ('another seat\'s zone read as its own', 'game/engine/cards/scenario.mjs',
     'const whose = e.of ?? e.seat,', 'const whose = e.seat,'),
    ('face-down names never seen', 'game/engine/cards/scenario.mjs',
     '.map((c) => c.faceDownName ?? null)', '.map(() => null)'),
    ('face-down expectation never fails', 'game/engine/cards/scenario.mjs',
     'if (JSON.stringify(got) !== JSON.stringify(want)) fail(`the face-down cards of', 'if (false) fail(`the face-down cards of'),
]
