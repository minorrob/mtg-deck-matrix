# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""Train E, wave 2, worker f2: fifteen of Rob's v43 library cards (Chrome Companion; Cost of Brilliance; Cryoshatter; Dack Fayden,
Helping Hand; Deluge Virtuoso; Depressurize; EPF Point Squad; Edgar, Moonlit Sovereign; Efflorescence; Elemental Mascot; Embrace the
Paradox; End of the Hunt; Environmental Scientist; Faller's Faithful; Fateshaper Aspirant). One break for each engine change they
needed -- each guard, each branch -- and the suite that catches it:

    python3 game/tools/batch/breaks.py game/tools/batch/breaks-train-e-f2.py
"""
SUITES = [
    'tests/engine-different-opponents.mjs',
    'tests/engine-cards.mjs',
    'tests/engine-goad.mjs',
    'tests/engine-control.mjs',
    'tests/engine-schema.mjs',
]

ASKING = 'game/engine/script/effects/asking.mjs'
PERM = 'game/engine/script/effects/permanents.mjs'
RESOLUTION = 'game/engine/script/resolution.mjs'
SCHEMA = 'game/engine/script/schema.mjs'

GREATEST = '''  if (!greatest) return ids;
  const value = greatestBy[greatest], most = Math.max(...ids.map((id) => value(state, id)));
  return ids.filter((id) => value(state, id) === most);'''
SCHEMA_GREATEST = '''if (effect.greatest !== undefined && !(["power", "manaValue"].includes(effect.greatest) && (name === "sacrifice" || (name === "chooseCard" && effect.zone === "battlefield"))))'''
SCHEMA_TO_EACH = '''if (effect.toEach !== undefined && (name !== "gainControl" || effect.toEach !== "different opponent" || effect.until !== undefined || effect.toPlayer !== undefined
    || effect.selector !== undefined || effect.targets === undefined))'''
SCHEMA_GOAD = 'if (name === "goad" && effect.until !== undefined && effect.until !== "game")'
GOAD = 'until: params.until === "game" ? "game" : "your-next-turn"'
OPPONENTS = 'const opponents = state.players.filter((p) => p.id !== context.controller && !p.lost).map((p) => p.id);\n    return giveEachAway('
PERMANENTS = 'const permanents = [...new Set(params.then.targets ?? [])].filter((id) => state.objects[id]?.zone === "battlefield");'
LOOP = '''  while (given.length < awaiting.permanents.length) {
    const left = unchosenOpponents(awaiting, given);
    if (left.length > 1) {
      state.awaiting = {...awaiting, given};
      return true;
    }
    if (!left.length) break;
    given = [...given, left[0]];
  }'''
GIVE = 'for (const [i, player] of given.entries()) gainControl(state, {targets: [awaiting.permanents[i]], toPlayer: player}, {controller: awaiting.player, source: awaiting.source});'
ANSWER = 'const player = Array.isArray(indices) && indices.length === 1 ? unchosenOpponents(awaiting, awaiting.given)[indices[0]] : undefined;'
REWRITE = '''    else if (effect?.effect === "gainControl" && effect.toEach === "different opponent")
      resolving.queue[0] = {effect: "controlToOpponents", then: effect};'''

BREAKS = [
    # End of the Hunt: "a creature or planeswalker they control with the greatest mana value among creatures and planeswalkers they
    # control" (effects/asking.mjs, chooseCard's `greatest`, greatestOf).
    ('greatest: applied to a chooseCard', ASKING, 'const fitting = greatestOf(state, params.greatest, pool.filter(fits));', 'const fitting = pool.filter(fits);'),
    ('greatest: unsaid, everything that fits', ASKING, GREATEST, GREATEST.replace('  if (!greatest) return ids;\n', '')),
    ('greatest: the most, not the least', ASKING, GREATEST, GREATEST.replace('Math.max(...ids.map(', 'Math.min(...ids.map(')),
    ('greatest: a tie, every one of them', ASKING, GREATEST, GREATEST.replace('=== most);', '=== most).slice(0, 1);')),
    ('greatest: by what it names', ASKING, GREATEST, GREATEST.replace('greatestBy[greatest]', 'greatestBy.manaValue')),
    ('schema greatest: checked', SCHEMA, SCHEMA_GREATEST, SCHEMA_GREATEST.replace('if (effect.greatest !== undefined && !(', 'if (false && !(')),
    ('schema greatest: power or mana value', SCHEMA, SCHEMA_GREATEST, SCHEMA_GREATEST.replace('["power", "manaValue"].includes(effect.greatest) && ', '')),
    ('schema greatest: a sacrifice\'s', SCHEMA, SCHEMA_GREATEST, SCHEMA_GREATEST.replace('(name === "sacrifice" ||', '(false ||')),
    ('schema greatest: a chooseCard\'s', SCHEMA, SCHEMA_GREATEST, SCHEMA_GREATEST.replace('(name === "chooseCard" && effect.zone', '(effect.zone')),
    ('schema greatest: on the battlefield', SCHEMA, SCHEMA_GREATEST, SCHEMA_GREATEST.replace(' && effect.zone === "battlefield"))))', '))))')),

    # Dack Fayden, Helping Hand: "they're goaded for the rest of the game" (effects/permanents.mjs, goad's `until: "game"`).
    ('goad: for the rest of the game', PERM, GOAD, 'until: "your-next-turn"'),
    ('goad: otherwise until its controller\'s next turn', PERM, GOAD, 'until: "game"'),
    ('schema goad: checked', SCHEMA, SCHEMA_GOAD, 'if (false)'),
    ('schema goad: for the game allowed', SCHEMA, SCHEMA_GOAD, 'if (name === "goad" && effect.until !== undefined)'),

    # Dack Fayden, Helping Hand: "for each of those permanents, choose a different opponent. Each opponent gains control of the
    # permanent for which they were chosen" (script/resolution.mjs; effects/asking.mjs, controlToOpponents; effects/permanents.mjs,
    # gainControl's refusal).
    ('toEach: asked by the resolution', RESOLUTION, REWRITE + '\n', ''),
    ('toEach: what it is about', RESOLUTION, REWRITE, REWRITE.replace('then: effect}', 'then: {}}')),
    ('toEach: refused run directly', PERM,
     '  if (params.toEach !== undefined) throw new Error("gainControl\'s toEach asks its controller whose each permanent becomes: run it through the resolution (script/resolution.mjs)");\n', ''),
    ('toEach: only what is on the battlefield', ASKING, PERMANENTS, PERMANENTS.replace('.filter((id) => state.objects[id]?.zone === "battlefield")', '')),
    ('toEach: each permanent once', ASKING, PERMANENTS, PERMANENTS.replace('[...new Set(params.then.targets ?? [])]', '(params.then.targets ?? [])')),
    ('toEach: opponents, never its controller', ASKING, OPPONENTS, OPPONENTS.replace('p.id !== context.controller && ', '')),
    ('toEach: opponents still in the game', ASKING, OPPONENTS, OPPONENTS.replace(' && !p.lost', '')),
    ('toEach: as many as there are permanents', ASKING, LOOP, LOOP.replace('while (given.length < awaiting.permanents.length) {', 'for (;;) {')),
    ('toEach: asked with two or more left', ASKING, LOOP, LOOP.replace('if (left.length > 1) {', 'if (left.length > 99) {')),
    ('toEach: asked, the question stays', ASKING, LOOP, LOOP.replace('state.awaiting = {...awaiting, given};\n', '')),
    ('toEach: none left, the rest stay', ASKING, LOOP, LOOP.replace('    if (!left.length) break;\n', '')),
    ('toEach: one left, it is that one', ASKING, LOOP, LOOP.replace('given = [...given, left[0]];', 'break;')),
    ('toEach: each to whom it was given', ASKING, GIVE, GIVE.replace('toPlayer: player}', 'toPlayer: awaiting.player}')),
    ('toEach: each its own permanent', ASKING, GIVE, GIVE.replace('targets: [awaiting.permanents[i]]', 'targets: [awaiting.permanents[0]]')),
    ('toEach: the question about the next permanent', ASKING, '`Choose an opponent to gain control of ${state.objects[id]?.card ?? "that permanent"}`',
     '`Choose an opponent to gain control of ${state.objects[awaiting.permanents[0]]?.card ?? "that permanent"}`'),
    ('toEach: offered the opponents not yet chosen', ASKING, 'options: unchosenOpponents(awaiting, awaiting.given).map((player, index)', 'options: awaiting.opponents.map((player, index)'),
    ('toEach: the answer among those offered', ASKING, ANSWER, ANSWER.replace('unchosenOpponents(awaiting, awaiting.given)[indices[0]]', 'awaiting.opponents[indices[0]]')),
    ('toEach: one answer', ASKING, ANSWER, ANSWER.replace(' && indices.length === 1', '')),
    ('toEach: no answer refused', ASKING, '    if (player === undefined) throw new Error("Invalid selection");\n    const outcome = giveEachAway(', '    const outcome = giveEachAway('),
    ('toEach: answered, the next asked', ASKING, 'return outcome === true ? {events: [], again: true} : outcome;', 'return outcome === true ? {events: []} : outcome;'),
    ('toEach: its controller gone', ASKING, 'and nobody gains anything. */\n  left() {\n    return {events: []};\n  },', 'and nobody gains anything. */\n  left(state, awaiting) {\n    return {another: awaiting};\n  },'),
    ('schema toEach: checked', SCHEMA, SCHEMA_TO_EACH, SCHEMA_TO_EACH.replace('if (effect.toEach !== undefined && (', 'if (false && (')),
    ('schema toEach: a gainControl\'s', SCHEMA, SCHEMA_TO_EACH, SCHEMA_TO_EACH.replace('name !== "gainControl" || ', '')),
    ('schema toEach: a different opponent', SCHEMA, SCHEMA_TO_EACH, SCHEMA_TO_EACH.replace('effect.toEach !== "different opponent" || ', '')),
    ('schema toEach: for good', SCHEMA, SCHEMA_TO_EACH, SCHEMA_TO_EACH.replace('effect.until !== undefined || ', '')),
    ('schema toEach: to no one player', SCHEMA, SCHEMA_TO_EACH, SCHEMA_TO_EACH.replace(' || effect.toPlayer !== undefined', '')),
    ('schema toEach: never a selector', SCHEMA, SCHEMA_TO_EACH, SCHEMA_TO_EACH.replace('effect.selector !== undefined || ', '')),
    ('schema toEach: of its targets', SCHEMA, SCHEMA_TO_EACH, SCHEMA_TO_EACH.replace(' || effect.targets === undefined', '')),
]
