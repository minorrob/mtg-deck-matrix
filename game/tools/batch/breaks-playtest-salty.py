# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""ROB-211: native multi-turn combat and saved public provocation, not synthetic pilot views alone."""
SUITES = ['tests/engine-salty-pilot.mjs', 'tests/room-pilot-provocation.mjs']
P = 'game/engine/pilots/scored-pilot.mjs'
M = 'game/engine/pilots/provocation.mjs'
R = 'game/room/room.mjs'
BREAKS = [
    ('low-life denominator restores unprovoked focus fire', P,
     '(grudge > 0 ? referenceLife : Math.max(1, life))', 'Math.max(1, life)'),
    ('recent pressure never changes normal attacks', P,
     '+ W.damage * grudge * effect * pressure(p.playerId)', '+ 0'),
    ('received damage cannot provoke retaliation', M,
     'taken[opponent] = age(hits?.[seat]?.[opponent], turn, seats);', 'taken[opponent] = 0;'),
    ('normal ignores available lethal', P,
     '(lethal ? W.lethal : 0)', '0'),
    ('damage event blames raw controller after a steal', 'game/engine/script/effects/resources.mjs',
     ': {...cardRef(state,source),controller:controllerOf(state,source)};',
     ': cardRef(state,source);'),
    ('source owner blamed instead of its controller', M,
     'source = f?.source?.controller;', 'source = f?.source?.owner;'),
    ('duplicate damage counted again', M,
     'sequence <= current.lastEvent', 'sequence < current.lastEvent'),
    ('grudges never decay', M,
     'Math.max(0, turn - (hit?.turn ?? turn))', '0'),
    ('self damage remembered as opponent provocation', M,
     ' || source === target', ''),
    ('room never observes committed damage', R,
     'pilotCombatMemory = rememberDamage(pilotCombatMemory, e, id, seats.length);', ''),
    ('room fails to save damage memory', R,
     '...(pilotCombatMemory?.lastEvent > 0 ? {pilotCombatMemory} : {}),', ''),
    ('room forgets memory on reopen', R,
     'pilotCombatMemory = record.pilotCombatMemory ?? null;', 'pilotCombatMemory = null;'),
    ('room recreates pilots without public damage facts', R,
     'pilotCombat: combatMemoryFor(pilotCombatMemory, seat, state.turn, seats.length)', 'pilotCombat: undefined'),
    ('historical Salty silently switches its untaped policy', R,
     'given && !provocation ? {...given,grudge:0} : given', 'given'),
    ('new matches lose their pilot policy flag', R,
     '...(pod?.pilotProvocation === true ? {pilotProvocation: true} : {}),', ''),
    ('saved matches lose their pilot policy flag', R,
     '...(pilotProvocation ? {pilotProvocation: true} : {}),', ''),
    ('reopened matches lose their pilot policy flag', R,
     'pilotProvocation = record.pilotProvocation === true;', 'pilotProvocation = false;'),
]
