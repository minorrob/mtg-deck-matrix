# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""Breaks for the precon load, lane E (Wretched Ranks; the card load of 2026-10-25): one per engine change, each guard and
each branch. Run from the repository root:
python -u game/tools/batch/breaks.py game/tools/batch/breaks-precons-e-zombies.py"""

SUITES = ['tests/engine-precons-e.mjs']

ACTIONS = 'game/engine/rules/actions.mjs'
REPLACEMENT = 'game/engine/rules/replacement.mjs'
SBA = 'game/engine/rules/sba.mjs'
STACK = 'game/engine/rules/stack.mjs'
TRIGGER = 'game/engine/rules/trigger.mjs'
COND = 'game/engine/script/condition.mjs'
ASKING = 'game/engine/script/effects/asking.mjs'
ZONES = 'game/engine/script/effects/zones.mjs'
SCHEMA = 'game/engine/script/schema.mjs'
INDEX = 'game/engine/cards/index.mjs'

BREAKS = [
    # Kalitas, Traitor of Ghet: "instead exile that card and create a 2/2 black Zombie creature token" (CR 614.1a, 614.6).
    ('kalitas follow-up made', REPLACEMENT,
     '  if (proposal.event === "zone-change" && Array.isArray(ability.change?.then) && state.objects[holderId])\n', '  if (false)\n'),
    ('kalitas token is its controller\'s', REPLACEMENT,
     '{effects: structuredClone(ability.change.then), context: {controller: controllerOf(state, holderId), source: holderId}}];\n',
     '{effects: structuredClone(ability.change.then), context: {controller: 0, source: holderId}}];\n'),
    ('zone-change follow-ups not compared', REPLACEMENT,
     'counted: p.event === "damage" ? (p.followUps ?? []).map((f) => f.context.about?.amount ?? null) : []});',
     'counted: (p.followUps ?? []).map((f) => f.context.about?.amount ?? null)});'),
    ('follow-ups run by moveOne', ZONES, '  if (destination === proposal.to) events.push(...runFollowUps(state, proposal));\n', ''),
    ('follow-ups run by lethal damage', SBA, '        events.push(...runFollowUps(state, proposal));\n', ''),
    ('then beside a new destination', SCHEMA,
     '    const besideMove = ability.watches?.event === "zone-change" && typeof ability.change?.to === "string";\n',
     '    const besideMove = false;\n'),
    ('then beside nothing refused', SCHEMA,
     '    if (then !== undefined && ((ability.change.prevent !== true && !besideMove) || !Array.isArray(then) || then.length === 0))\n',
     '    if (then !== undefined && (!Array.isArray(then) || then.length === 0))\n'),
    ('sacrifice cost shares another', ACTIONS,
     '  const matches = (Array.isArray(anyOf) ? anyOf.map((one) => ({...shared, ...one})) : [selector ?? {}])\n',
     '  const matches = (Array.isArray(anyOf) ? anyOf : [selector ?? {}])\n'),

    # Josu Vess, Lich Knight: "when Josu Vess enters, if he was kicked" (CR 702.33d, 603.4).
    ('kicked kept on the permanent', STACK, '    if (to === "battlefield" && entry.kicked) state.objects[arrived].kicked = entry.kicked;\n', ''),
    ('kicked kept on the trigger', TRIGGER, '            ...(Number.isInteger(object.kicked) && object.kicked > 0 ? {kicked: object.kicked} : {}),\n', ''),
    ('kicked passed to the stack', TRIGGER, '      kicked: trigger.kicked ?? 0,\n', ''),
    ('kicked on the ability entry', STACK, '  if (Number.isInteger(kicked) && kicked > 0) entry.sourceKicked = kicked;\n', ''),
    ('kicked asked as it resolves', STACK, '    ...(entry.sourceKicked ? {kicked: entry.sourceKicked} : {}),\n', ''),
    ('kicked condition', COND, '  if (condition.kicked !== undefined\n', '  if (false\n'),
    ('kicked a condition key', COND, 'the precon load E). */\n  "kicked",\n', 'the precon load E). */\n'),
    ('kicked problem', COND, '  if ("kicked" in condition && typeof condition.kicked !== "boolean") problems.push', '  if (false) problems.push'),

    # Syphon Flesh: "for each creature sacrificed this way", by every player.
    ('sacrifice remembers each', ASKING, 'remember: params.remember === "each" ? "each" : context.controller,', 'remember: context.controller,'),
    ('each player\'s sacrifice kept', ASKING, 'theirs = awaiting.remember === player || awaiting.remember === "each";', 'theirs = awaiting.remember === player;'),

    # Consumed by Greed: what it targets and does with its gift promised (CR 601.2c, 702.174a).
    ('promised script compiled', INDEX,
     '        ...(ability.promised ? {promised: {targets: ability.promised.targets ?? [], effects: ability.promised.effects ?? []}} : {})};\n', '        };\n'),
    ('promised needs effects', INDEX,
     '      if (ability.promised && (modal || !(ability.promised.effects ?? []).length)) problems.push', '      if (false) problems.push'),
    ('promised needs gift', INDEX, '  if (spell?.promised && gift === null) problems.push', '  if (false) problems.push'),
    ('the gift given first, promised', INDEX,
     '      ...(spell.promised ? {promised: {...spell.promised, effects: [...given, ...spell.promised.effects]}} : {})};\n', '      };\n'),
    ('promised targets offered', ACTIONS,
     '          : gift !== undefined && object.spell?.promised ? object.spell.promised : object.spell), {controller',
     '          : object.spell), {controller'),
    ('promised script resolves', STACK, '    if (entry.gift !== undefined && spell?.promised) return spell.promised;\n', ''),
]
