# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""Train E wave 3, worker g3: fifteen of Rob's v43 library cards (Squawkroaster; Squire's Lightblade; Startled Relic Sloth;
Stingerquill Charm; Stockman, Mad Fly-entist; Subterranean Tremors; Summoned Dromedary; Sunfall; Sunset Saboteur;
Surveillance Phantasm; Tackle Artist; Teacher's Pest; Tester of the Tangential; Tethermage's Advantage; Tetsuko Umezawa,
Pursuer). One break for each engine change they needed -- each guard, each branch -- and the suite that catches it:

    python3 game/tools/batch/breaks.py game/tools/batch/breaks-train-e-g3.py
"""
SUITES = [
    'tests/engine-train-e-g3.mjs',
    'tests/engine-x11-turns-counters.mjs',
    'tests/engine-vocabulary.mjs',
    'tests/engine-equip.mjs',
    'tests/engine-cards.mjs',
]

PERM = 'game/engine/script/effects/permanents.mjs'
EFFECTS = 'game/engine/script/effects/index.mjs'
RES = 'game/engine/script/effects/resources.mjs'
TURN = 'game/engine/rules/turn.mjs'
VOCAB = 'game/engine/vocabulary.mjs'

INCUBATOR = '  Incubator: {name: "Incubator", types: ["Artifact"], subtypes: ["Incubator"], colors: [],'
TRANSFORMS = 'cost: [{atom: "mana", cost: "{2}"}], effects: [{effect: "setState", targets: "self", transform: true}]}],'
BACK = 'back: {name: "Phyrexian Token", types: ["Artifact", "Creature"], subtypes: ["Phyrexian"], colors: [], power: 0, toughness: 0}},'
MDFC = '    ...(spec.back ? {mdfc: {front: tokenFace(spec), back: tokenFace(spec.back), transforming: true}} : {}),\n'
FACE = ('const tokenFace = (spec) => ({card: spec.name ?? "Token", types: [...(spec.types ?? [])], subtypes: [...(spec.subtypes ?? [])], '
        'supertypes: [...(spec.supertypes ?? [])],')
FACE_PT = 'manaCost: null, colors: [...(spec.colors ?? [])], power: spec.power ?? null, toughness: spec.toughness ?? null, keywords: [...(spec.keywords ?? [])],'
FACE_ABILITIES = '  abilities: structuredClone(spec.abilities ?? [])});'
ENTERS_WITH = 'for (const [counter, n] of Object.entries(params.entersWithCounters ?? {})) {'
PLACED = 'const placed = enteringCountersPlaced(state, id, counter, n, controller);'
NONE_KEPT = 'if (placed > 0) state.objects[id].counters[counter] = (state.objects[id].counters[counter] ?? 0) + placed;'
COUNTED = 'entersWithCounters: {"+1/+1": params.count ?? 0}}, context);'
FIRST_STRIKE = 'firstStrike: (state) => CONDITIONS.attackers(state) && combatNeedsFirstStrike(state),'
HAS_ONE = '|| (source.counters?.[kind] ?? 0) < 1) return events;'
AS_MANY = 'const moving = Math.min(n, source.counters[kind]);'

BREAKS = [
    # Incubate (CR 701.53a; Sunfall) and the Incubator token (CR 111.10i; effects/permanents.mjs).
    ('incubate: the Incubator predefined', PERM, INCUBATOR, INCUBATOR.replace('  Incubator:', '  Incubators:')),
    ('incubate: {2} transforms it', PERM, TRANSFORMS, 'cost: [{atom: "mana", cost: "{2}"}], effects: []}],'),
    ('incubate: the back face a 0/0', PERM, BACK, BACK.replace('power: 0, toughness: 0', 'power: 1, toughness: 1')),
    ('incubate: the back face a creature', PERM, BACK, BACK.replace('types: ["Artifact", "Creature"]', 'types: ["Artifact"]')),
    ('incubate: a double-faced token', PERM, MDFC, ''),
    ('incubate: a face named', PERM, FACE, FACE.replace('card: spec.name ?? "Token"', 'card: "Token"')),
    ('incubate: a face typed', PERM, FACE, FACE.replace('types: [...(spec.types ?? [])], subtypes', 'types: [], subtypes')),
    ('incubate: a face with its subtypes', PERM, FACE, FACE.replace('subtypes: [...(spec.subtypes ?? [])]', 'subtypes: []')),
    ('incubate: a face of its colors', PERM, FACE_PT, FACE_PT.replace('colors: [...(spec.colors ?? [])]', 'colors: ["G"]')),
    ('incubate: a face with its power', PERM, FACE_PT, FACE_PT.replace('power: spec.power ?? null', 'power: 1')),
    ('incubate: a face with its toughness', PERM, FACE_PT, FACE_PT.replace('toughness: spec.toughness ?? null', 'toughness: 1')),
    ('incubate: a face with its abilities', PERM, FACE_ABILITIES, '  abilities: []});'),
    ('incubate: the counters it enters with', PERM, ENTERS_WITH, 'for (const [counter, n] of Object.entries({})) {'),
    ('incubate: put as counters are put (CR 122.6)', PERM, PLACED, 'const placed = n;'),
    ('incubate: no counter kept when none is given', PERM, NONE_KEPT, 'state.objects[id].counters[counter] = (state.objects[id].counters[counter] ?? 0) + placed;'),
    ('incubate: N counted', PERM, COUNTED, 'entersWithCounters: {"+1/+1": 1}}, context);'),
    ('incubate: none without a count', PERM, COUNTED, 'entersWithCounters: {"+1/+1": params.count ?? 1}}, context);'),
    ('incubate: run as a primitive', EFFECTS, '  incubate,\n});', '});'),
    ('incubate: in the catalog', VOCAB, '"phaseOut", "exchangeControl", "incubate",', '"phaseOut", "exchangeControl",'),
    # The first-strike damage step, decided as the combat damage step begins (CR 510.4; rules/turn.mjs, wave 2's f4, which
    # Stingerquill Charm and Squire's Lightblade play on): with no such step, their creatures deal no first-strike damage.
    ('first strike: no step after blocks', TURN, FIRST_STRIKE, 'firstStrike: (state) => false,'),
    # Counters moved, as many as there are (CR 122.5, 609.3; Tester of the Tangential).
    ('moveCounters: none of the kind, nothing moves', RES, HAS_ONE, ') return events;'),
    ('moveCounters: all or nothing again', RES, HAS_ONE, '|| (source.counters?.[kind] ?? 0) < n) return events;'),
    ('moveCounters: as many as there are', RES, AS_MANY, 'const moving = n;'),
]
