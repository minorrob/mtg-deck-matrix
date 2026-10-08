# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""Run from the repository root with breaks.py; each mutation must be caught and restored."""
SUITES = [
    'tests/engine-exchange-life.mjs',
    'tests/engine-damage-each.mjs',
    'tests/engine-designations.mjs',
    'tests/engine-prepare.mjs',
    'tests/engine-connive-memory.mjs',
    'tests/engine-block-designation-triggers.mjs',
    'tests/engine-target-constraints.mjs',
    'tests/engine-mana-value-count-cap.mjs',
]
RES = 'game/engine/script/effects/resources.mjs'
ATTR = 'game/engine/script/effects/attributes.mjs'
BIND = 'game/engine/script/bind.mjs'
TRIG = 'game/engine/rules/trigger.mjs'
BREAKS = [
    ('exchange layers', RES, 'apply: {setToughness: life}', 'apply: {setToughness: 1}'),
    ('exchange both players', RES, 'changeLife(state, other, mine - theirs, events);', '/* fault: other life not exchanged */'),
    ('exchange all or nothing', RES, 'if (!lifeMayBecome(state, player, theirs) || !lifeMayBecome(state, other, mine)) return events;', '/* fault: skip both permissions */'),
    ('exchange no gain guard', RES, 'return !(value > life && cantGainLife(state, player));', 'return true;'),
    ('exchange creature guard', RES, '!typesOf(state, creature).includes("Creature")', 'false'),
    ('damage each amount', RES, 'amountOf(state, params.dealt ?? 0, {...context, about})', '1'),
    ('damage each source', RES, 'calls.push([{amount, ...to, from: [id],', 'calls.push([{amount, ...to, from: [],'),
    ('damage each union', RES, 'const dealers = Array.isArray(anyOf) ? [...new Set(anyOf.flatMap((one) => selectMatching(state, {...shared, ...one}, context)))]', 'const dealers = Array.isArray(anyOf) ? anyOf.flatMap((one) => selectMatching(state, {...shared, ...one}, context))'),
    ('monstrous once', ATTR, 'if (params.value === false || object.monstrous === true) continue;', 'if (params.value === false) continue;'),
    ('monstrous X', ATTR, 'if (n !== null) object.monstrosityX = n;', 'if (n !== null) object.monstrosityX = 0;'),
    ('monstrous permanent only', ATTR, 'if (object?.zone !== "battlefield") continue;', 'if (!object) continue;'),
    ('prepare once', ATTR, '|| !object.preparation || object.prepared === true', '|| !object.preparation'),
    ('unprepare removes copy', ATTR, 'if (!keepCopy && copy !== undefined && state.objects[copy]?.zone === "exile" && state.objects[copy].prepareOf === id) removeObject(state, copy);', '/* fault: leave unprepared copy */'),
    ('prepare entering replacement', 'game/engine/rules/replacement.mjs', 'if (ability.change?.entersPrepared === true)', 'if (false && ability.change?.entersPrepared === true)'),
    ('prepare copy survives SBA', 'game/engine/rules/sba.mjs', '!(zone === "exile" && preparedCopyStays(state, id))', 'true'),
    ('prepare cast unprepares', 'game/engine/rules/actions.mjs', 'if (preparedBy !== undefined) unprepare(state, preparedBy, events, {keepCopy: true});', '/* fault: retain prepared designation */'),
    ('convoke memory', 'game/engine/rules/actions.mjs', '{convoked: [...convoke.ids]}', '{convoked: []}'),
    ('connive nonland counters', 'game/engine/script/resolution.mjs', 'addCounters(state, effect.card, "+1/+1", nonland, events, effect.controller);', '/* fault: no connive counters */'),
    ('connive APNAP', 'game/engine/script/resolution.mjs', '(p - (state.activePlayer ?? 0) + seats) % seats', 'p'),
    ('connive zero', 'game/engine/script/resolution.mjs', 'const n = Math.max(0, effect.count ?? 1);', 'const n = Math.max(1, effect.count ?? 1);'),
    ('blocks once', TRIG, '[...new Set(blocks.map((b) => b.card.cardId))]', 'blocks.map((b) => b.card.cardId)'),
    ('blocks each attacker', TRIG, 'if (condition.eachBlocked) return blocks.map', 'if (false && condition.eachBlocked) return blocks.map'),
    ('monstrous trigger guard', TRIG, 'if (fields.attribute !== condition.attribute || fields.value !== true) return [];', '/* fault: every attribute triggers */'),
    ('target distinct objects', BIND, 'if (!otherThan(spec, chosen).some((o) => sameTarget(o, candidate))) next.push', 'if (true) next.push'),
    ('target conditional', BIND, 'if (!required(state, spec, context))', 'if (false && !required(state, spec, context))'),
    ('target controller cap', BIND, '[p, 1]', '[p, 2]'),
    ('target different controllers refused', BIND, 'if (spec?.differentControllers !== true) return null;', 'return null;'),
    ('mana value dynamic cap', 'game/engine/script/filter.mjs', 'amountOf(state, rule.max, context) : rule.max', '0 : rule.max'),
]
