# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""Askable native entry counter replacements and single-use internal results, with original reader unions."""
import runpy
from pathlib import Path

SUITES = ['tests/engine-entry-counter-order.mjs', 'tests/engine-intrinsic-entry.mjs', 'tests/engine-battles.mjs',
          'tests/engine-counters-replaced.mjs', 'tests/engine-counters-doubled.mjs']
ENTRY = 'game/engine/rules/pre-entry.mjs'
STATICS = 'game/engine/rules/statics.mjs'
RESULT = 'game/engine/rules/entry-characteristics.mjs'
STACK = 'game/engine/rules/stack.mjs'
ZONE = 'game/engine/rules/zone-operation.mjs'
MOVE = 'game/engine/script/effects/zones.mjs'
TOKEN = 'game/engine/script/effects/permanents.mjs'
BREAKS = [
    ('Compleated replacement omitted', ENTRY, 'counter === "loyalty" && frame.phyrexianLife > 0 && current.keywords.includes("Compleated")', 'false'),
    ('Compleated subtracts the wrong loyalty', ENTRY, 'plus: -2 * frame.phyrexianLife', 'plus: -1 * frame.phyrexianLife'),
    ('counter order defaults instead of asking', ENTRY, 'entering: true, askable: true, extraCandidates, applied:', 'entering: true, askable: false, extraCandidates, applied:'),
    ('explicit counter answer forgotten', ENTRY, 'const orders = frame.answer ? [frame.options[frame.answer.indices[0]]] : [];', 'const orders = [];'),
    ('applied counter prefix is not excluded', STATICS, '.filter(candidate => !applied.includes(counterEffectKey(candidate))), n = count, used = 0;', ', n = count, used = 0;'),
    ('applied counter prefix keys forgotten', ENTRY, '    (frame.applied[counter] ??= []).push(...(placed.applied ?? []));\n', ''),
    ('partial counter count not saved before waiting', ENTRY, 'frame.counts[counter] = placed.count;', 'if (!placed.question) frame.counts[counter] = placed.count;'),
    ('native prefix reporting not requested', ENTRY, 'orders, reportApplied: true', 'orders'),
    ('prospective self-only counter modifier omitted', STATICS, '  for (const holderId of holders) {', '  for (const holderId of state.zones.battlefield) {'),
    ('native public counter question identity reused', ENTRY, 'frame.generation = (frame.generation ?? 0) + 1;', 'frame.generation = 1;'),
    ('counter result accepts another entry', RESULT, 'result.objectId !== objectId || ', ''),
    ('counter result accepts another controller', RESULT, 'result.player !== player || !allowPartial', 'false || !allowPartial'),
    ('counter result accepts altered returned counters', RESULT,
     '    || Object.keys(raw).length !== Object.keys(result.counters).length\n    || Object.entries(result.counters).some(([counter, count]) => raw[counter] !== count)', ''),
    ('counter result is reusable', RESULT, '  if (consume) delete operation.entryCounterResults[prepared.counterResult];\n', ''),
    ('zero counter result treated as absent', RESULT,
     '  if (consume) delete operation.entryCounterResults[prepared.counterResult];\n  return counters;',
     '  if (consume) delete operation.entryCounterResults[prepared.counterResult];\n  return Object.keys(counters).length ? counters : null;'),
    ('stack counters replaced a second time', STACK,
     'const placed = entryCounterValues === null ? enteringCountersPlaced(state, arrived, counter, count, entry.playerId) : entryCounterValues[counter] ?? 0;',
     'const placed = enteringCountersPlaced(state, arrived, counter, count, entry.playerId);'),
    ('move counters replaced a second time', MOVE,
     'const placed = nativeCounterValues === null ? enteringCountersPlaced(state, moved, counter, count, state.objects[moved].controller) : nativeCounterValues[counter] ?? 0;',
     'const placed = enteringCountersPlaced(state, moved, counter, count, state.objects[moved].controller);'),
    ('independent movement counters omitted', ZONE, '        additionalCounters: options.counters ?? {},\n', ''),
    ('movement counter receipt is not forwarded', ZONE, 'preparedCounterResult: frame.preparedCounterResult ?? null, ', ''),
    ('independent token counters omitted', TOKEN, 'additionalCounters: batch.params.entersWithCounters ?? {}', 'additionalCounters: {}'),
    ('token counter planning starts before sibling choices', TOKEN, 'deferCounters: true, additionalCounters:', 'deferCounters: false, additionalCounters:'),
    ('token child result bypasses its bound receipt', TOKEN,
     'entry.counters = entryCounterResult(state, entry.prepared, entry.virtualId, batch.controller, {consume: true});',
     'entry.counters = entry.prepared.entering.counters;'),
    ('token counter answer writes the wrong sibling', TOKEN,
     'const entry = frame.entries[frame.counterIndex];', 'const entry = frame.entries[0];'),
]

# Moved probes retain every original suite; the new native reader is additive.
for filename, labels in [
    ('breaks-load100-w0-w1-intrinsic-entry.py', {'native intrinsic counters omitted', 'native Compleated reads removed printed keyword', 'intrinsic counters erase independent grants'}),
    ('breaks-pre-entry.py', {'tokens count simultaneous siblings as replacement sources'}),
    ('breaks-wave4a-h4.py', {'counters: cost and entering passed on', 'entering: as a spell resolves', 'entering: put onto the battlefield by an effect'}),
]:
    original = runpy.run_path(str(Path(__file__).with_name(filename)))
    for suite in original['SUITES']:
        if suite not in SUITES:
            SUITES.append(suite)
    BREAKS.extend((f'{filename}: {label}', target, anchor, replacement)
                  for label, target, anchor, replacement in original['BREAKS'] if label in labels)

# Every original suite remains in the green baseline; focused readers catch native mutations before long global checks.
global_checks = ['tests/engine-cards.mjs', 'tests/generators.mjs']
SUITES = [suite for suite in SUITES if suite not in global_checks] + [suite for suite in global_checks if suite in SUITES]
