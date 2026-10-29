# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""Prove the wave-0 modified-instruction and per-source replacement-history repair."""
SUITES = ['tests/engine-draw-instructions.mjs', 'tests/engine-draws-replaced.mjs', 'tests/engine-load100-w7-spells.mjs']
ZONES = 'game/engine/script/effects/zones.mjs'
ASKING = 'game/engine/script/effects/asking.mjs'
BREAKS = [
    ('doubled instruction bypasses batch replacements', ASKING,
     'if (selected.kind === "more") return {events, splice: [{effect: "draw", who: [awaiting.player], count: selected.count,\n      drawReplaced: [...awaiting.replaced, selected.key]}]};',
     'if (selected.kind === "more") return {events, splice: Array.from({length: selected.count}, () => ({effect: "dredgeDraw", player: awaiting.player, replaced: [...awaiting.replaced, selected.key]}))};'),
    ('direct doubler bypasses batch replacements', ZONES,
     'events.push(...draw(state, {who: [player], count: more.count, drawReplaced: [...replaced, more.key]}, {controller: player}));',
     'for (let i = 0; i < more.count; i++) drawOne(state, player, events, [...replaced, more.key]);'),
    ('used Collector can apply again', 'game/engine/rules/statics.mjs',
     'if (!replaced.includes(`${holderId}:${ability.id}`))', 'if (true)'),
    ('Collector history lost on descendants', ZONES,
     'replaced: [...replaced, chosen.key]', 'replaced: [...replaced]'),
    ('prior history lost on ordinary single draw', ZONES,
     'draws.push({player, replaced: [...replaced]})', 'draws.push({player, replaced: []})'),
    ('resolution discards applied history', 'game/engine/script/resolution.mjs',
     '({effect: "dredgeDraw", player, replaced})', '({effect: "dredgeDraw", player})'),
    ('two abilities collapse by controller', 'game/engine/rules/statics.mjs',
     'if (!replaced.includes(`${holderId}:${ability.id}`))', 'if (!replaced.includes(`${holderId}:${ability.id}`) && !found.some(e => e.controller === holder.controller))'),
    ('source option loses its reference', ASKING,
     '{cardId: option.sourceId}', '{cardId: 0}'),
    ('answer loses selected replacement identity', ASKING,
     '[awaiting.player]: chosen.key ?? chosen', '[awaiting.player]: "missing-replacement"'),
    ('question offers already applied effects', ZONES,
     'drawInsteadEffects(state, player, effect.count ?? 1, effect.drawReplaced ?? [])', 'drawInsteadEffects(state, player, effect.count ?? 1)'),
]
