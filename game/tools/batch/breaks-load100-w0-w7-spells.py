# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
SUITES = ['tests/load100-w7-compiler.mjs', 'tests/engine-load100-w7-spells.mjs']
COMPILER = 'game/tools/card-compiler.mjs'
COMPILE = 'game/engine/cards/compile.mjs'
ZONES = 'game/engine/script/effects/zones.mjs'
ASKING = 'game/engine/script/effects/asking.mjs'
INDEX = 'game/engine/cards/index.mjs'
TRIGGER = 'game/engine/rules/trigger.mjs'
AMOUNT = 'game/engine/script/amount.mjs'
BREAKS = [
    ('smoke must play candidate', COMPILER,
     'if (smoke.played !== true) return', 'if (false) return'),
    ('seeded permanent is not played', COMPILE,
     'const played = events.some(', 'const played = !script.identity.manaCost || events.some('),
    ('calibrated minimum is enforced', COMPILER,
     'if (t.cards < minimum) return', 'if (false) return'),
    ('draws ordered from active player', ZONES,
     'return playersFor(state, who, controller).sort((a, b) => rank(a) - rank(b));',
     'return playersFor(state, who, controller);'),
    ('actual draw uses APNAP', ZONES,
     'export function draw(state, params, context) {\n  const events = [];\n  const count = params.count ?? 1;\n  for (const player of drawingPlayers(state, params.who, context.controller))',
     'export function draw(state, params, context) {\n  const events = [];\n  const count = params.count ?? 1;\n  for (const player of playersFor(state, params.who, context.controller))'),
    ('single draws use APNAP', ZONES,
     'export function singleDraws(state, params, context) {\n  const count = params.count ?? 1, draws = [];\n  for (const player of drawingPlayers(state, params.who, context.controller))',
     'export function singleDraws(state, params, context) {\n  const count = params.count ?? 1, draws = [];\n  for (const player of playersFor(state, params.who, context.controller))'),
    ('draw questions use APNAP', ZONES,
     'for (const player of drawingPlayers(state, effect.who, context.controller))',
     'for (const player of playersFor(state, effect.who, context.controller))'),
    ('plain descendant draw keeps applied replacements', ZONES,
     'drawOne(state, player, events, params.drawReplaced ?? []);', 'drawOne(state, player, events);'),
    ('doubler applies once to descendant draw', ASKING,
     'drawsMore(state, params.player).filter((m) => !replaced.includes(m.key))', 'drawsMore(state, params.player)'),
    ('mandatory replacement cannot be declined', ASKING,
     'more.length ? more.map((m) => ({kind: "more", ...m})) : [{kind: "draw"}]',
     'false ? more.map((m) => ({kind: "more", ...m})) : [{kind: "draw"}]'),
    ('doubler expands into individual decisions', ASKING,
     'if (selected.kind === "more") return {events, splice:', 'if (false) return {events, splice:'),
    ('descendant remembers its applied doubler', ASKING,
     'replaced: [...awaiting.replaced, selected.key]', 'replaced: awaiting.replaced'),
    ('die watcher compiles', INDEX,
     '? {on: "GameEventDieRolled", roller: t.roller ?? "you"} : null,', '? null : null,'),
    ('die watcher roller selector validated', INDEX,
     '["you", "opponent", "any"].includes(t.roller ?? "you")', 'true'),
    ('die watcher sees its roller', TRIGGER,
     'whoseIs(condition.roller ?? "you", player, controller) ? [{player, rolled: fields.result, rollId: fields.rollId}]',
     'true ? [{player, rolled: fields.result, rollId: fields.rollId}]'),
    ('separate die instructions stay separate', TRIGGER,
     'ability.trigger.on === "GameEventDieRolled" ? `:${about.rollId}`',
     'ability.trigger.on === "GameEventDieRolled" ? ""'),
    ('die instructions have distinct groups', 'game/engine/script/effects/resources.mjs',
     'rollId: `roll:${state.nextTimestamp++}`', 'rollId: "roll"'),
    ('trigger counts its die result', AMOUNT,
     'context.rolled ?? context.about?.rolled ?? 0', 'context.rolled ?? 0'),
]
