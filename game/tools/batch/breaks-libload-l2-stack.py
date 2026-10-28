# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""Library load L2 (2026-10-21): the stack and control -- "can't cast spells this turn" for your opponents or every player
(Silence, Bilbo's Gambit), a spell that targets a permanent you control (Rebuff the Wicked), creatures attacking you and/or
planeswalkers you control (Mangara, the Diplomat), "those creatures" a control change gained (Mob Rule), spree (CR 702.172a;
Explosive Derailment), and "as though it had flash if it targets a commander" (Timely Ward). One break for each engine
change -- each guard, each branch -- and the suite that catches it:

    python3 game/tools/batch/breaks.py game/tools/batch/breaks-libload-l2-stack.py
"""
SUITES = [
    'tests/engine-libload-stack.mjs',
    'tests/engine-vocabulary.mjs',
    'tests/engine-cards.mjs',
]

PERMANENTS = 'game/engine/script/effects/permanents.mjs'
FILTER = 'game/engine/script/filter.mjs'
ACTIONS = 'game/engine/rules/actions.mjs'
INDEX = 'game/engine/cards/index.mjs'
SCHEMA = 'game/engine/script/schema.mjs'
STATICS = 'game/engine/rules/statics.mjs'
TIMING = 'game/engine/keywords/timing.mjs'
VOCAB = 'game/engine/vocabulary.mjs'

BREAKS = [
    # "Your opponents can't cast spells this turn" (Silence): the players a word names, not the caster.
    ('cant-cast: opponents named', PERMANENTS,
     '    const who = typeof params.who === "string" ? playersFor(state, params.who, context.controller) : params.who;\n',
     '    const who = params.who === "you" ? [context.controller] : params.who;\n'),
    ('cant-cast: the word is the caster', PERMANENTS,
     'typeof params.who === "string" ? playersFor(state, params.who, context.controller) : params.who;',
     'typeof params.who === "string" ? [context.controller] : params.who;'),
    # "Untap those creatures" (Mob Rule): what the control change gained.
    ('gainControl remembers', PERMANENTS,
     '  if (params.remember) context.remembered = ids.slice();\n  for (const id of ids) {\n    const object = state.objects[id];\n    /* Kept even for good',
     '  for (const id of ids) {\n    const object = state.objects[id];\n    /* Kept even for good'),
    # "Target spell that targets a permanent you control" (Rebuff the Wicked).
    ('targeting matched', FILTER,
     '    if (selector.targeting && !(state.stack.find((e) => e.objectId === id)?.targets ?? []).flat()\n',
     '    if (false && !(state.stack.find((e) => e.objectId === id)?.targets ?? []).flat()\n'),
    ('targeting reads the target, not any permanent', FILTER,
     '.some((t) => t?.kind === "object" && state.objects[t.id] && matchesSelector({...selector.targeting, what: "permanent"}, state, t.id, context))) return false;',
     '.some((t) => t?.kind === "object" && state.objects[t.id] && matchesSelector({...selector.targeting, what: "permanent", controller: undefined}, state, t.id, context))) return false;'),
    ('targeting grammar', FILTER,
     '    if (selector.what !== "spell" || !selector.targeting || typeof selector.targeting !== "object" || ![undefined, "permanent"].includes(selector.targeting.what))\n',
     '    if (false)\n'),
    # "Attacking you and/or planeswalkers you control" (Mangara, the Diplomat).
    ('attacking you matched', FILTER,
     '    if (selector.attacking === "you" && !(state.combat?.attacks ?? []).some((attack) => attack.attacker === id && (attack.planeswalker !== undefined\n',
     '    if (false && !(state.combat?.attacks ?? []).some((attack) => attack.attacker === id && (attack.planeswalker !== undefined\n'),
    ('attacking you: a planeswalker of yours', FILTER,
     '      ? state.objects[attack.planeswalker]?.zone === "battlefield" && controllerOf(state, attack.planeswalker) === context.controller\n',
     '      ? false\n'),
    ('attacking you: you, the player', FILTER,
     '      : attack.defender === context.controller))) return false;',
     '      : true))) return false;'),
    ('attacking grammar', FILTER,
     '  if (selector.attacking !== undefined && ![true, "you", "you directly"].includes(selector.attacking))\n    throw',
     '  if (false)\n    throw'),
    # Spree (CR 702.172a): each set of modes a cast of its own, their costs added.
    ('spree costs added', ACTIONS,
     'mana: v.mana + modes.map((i) => costs[i]).join(""), spree: modes',
     'mana: v.mana, spree: modes'),
    ('spree: one or more modes', ACTIONS,
     '      for (let mask = 1; mask < 1 << costs.length; mask += 1)',
     '      for (let mask = 0; mask < 1 << costs.length; mask += 1)'),
    ('spree: those modes alone', ACTIONS,
     '  else if (Array.isArray(only)) picks.push([...only]);\n', ''),
    ('spree: the variant\'s modes cast', ACTIONS,
     'variant.spree ?? variant.tier ?? null)', 'variant.tier ?? null)'),
    ('spree keyword', INDEX, '      spree = true;\n      keywords.push("Spree");\n', '      keywords.push("Spree");\n'),
    ('spree: one or more, any of its modes', INDEX,
     '  if (spree && !(oneOrMore && spell.modal.upTo === spell.modal.modes.length && spell.modal.more === undefined && !spell.modal.sameMode))\n',
     '  if (false)\n'),
    ('spree: each mode its mana', INDEX,
     '  else if (spree && !modeCosts.every(manaOnly)) problems.push', '  else if (false) problems.push'),
    ('a mode\'s cost is tiered\'s or spree\'s', INDEX,
     '  if (!tiered && !spree && modeCosts.some((cost) => cost !== undefined))', '  if (!tiered && modeCosts.some((cost) => cost !== undefined))'),
    ('spree a pay keyword', TIMING, '"Tiered", "Spree", "Disguise",', '"Tiered", "Disguise",'),
    ('spree a keyword', VOCAB, '  "spree",\n', ''),
    # "As though it had flash if it targets a commander" (Timely Ward).
    ('flash if it targets: offered', ACTIONS,
     '  const flashIf = timely ? null : flashIfTargets(object);\n', '  const flashIf = null;\n'),
    ('flash if it targets: not refused for the time', ACTIONS,
     '  if (!timely && !sneaking && !flashIf) return actions;\n', '  if (!timely && !sneaking) return actions;\n'),
    ('flash if it targets: only those aims', ACTIONS,
     '  .filter((aim) => aim.flat().some((t) => t?.kind === "object" && matchesSelector({...targeting, what: "permanent"}, state, t.id, context)));\n',
     ';\n'),
    ('flash if it targets: a static rule', STATICS, '  "flash-if-targets": "rules/actions.mjs",\n', ''),
    ('flash if it targets: says what', SCHEMA,
     '      if (!ability.targeting || typeof ability.targeting !== "object") errors.push', '      if (false) errors.push'),
    ('flash if it targets: targets chosen as offered', INDEX,
     '  if (abilities.some((a) => a.kind === "static" && a.rule === "flash-if-targets") && (!spell || spell.modal',
     '  if (false && (!spell || spell.modal'),
]
