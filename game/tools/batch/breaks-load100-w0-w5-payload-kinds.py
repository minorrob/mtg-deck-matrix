# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
import runpy
# Retain the full original W5 disjoint-cost reader union, including the historical pooled readers.
SUITES = runpy.run_path('game/tools/batch/breaks-load100-w0-w5-disjoint.py')['SUITES']
MANA = 'game/engine/rules/mana.mjs'
ACTIONS = 'game/engine/rules/actions.mjs'
BREAKS = [
    ('normal raw solver retains full payload identity', MANA,
     'return planSources(units, pool, cost, limit, acceptTaps, false);',
     'return planSources(units, pool, cost, limit, acceptTaps, true);'),
    ('equal output labels cannot collapse different amounts', MANA,
     'export const sourceKindKey = unit => JSON.stringify([...new Set(Object.values(sourceOutputs(unit)).map(manaPayloadKey))].sort());',
     'export const sourceKindKey = unit => Object.keys(sourceOutputs(unit)).sort().join("/");'),
    ('equivalent output arrays align by payload', MANA,
     'const outputs = ordered.map((u) => historical ? Object.entries(u.outputs) : payloadOutputs(u));',
     'const outputs = ordered.map((u) => Object.entries(u.outputs));'),
    ('current physical kinds ignore presentation labels', ACTIONS,
     '  const kind = sourceKindKey;',
     '  const kind = unit => [...unit.colors].sort().join("/");'),
    ('selected physical bundles use their actual activation labels', ACTIONS,
     'color = Object.keys(sourceOutputs(unit)).find(color => manaPayloadKey(sourceOutputs(unit)[color]) === group.payload);',
     'color = group.color;'),
    ('reserved witnesses remap to their actual activation labels', ACTIONS,
     'return {id: unit.id, color: Object.keys(unit.outputs).find(color => manaPayloadKey(unit.outputs[color]) === payload)};',
     'return {id: unit.id, color: tap.color};'),
    ('historical source keys use the saved compatibility path', ACTIONS,
     'const build = state.sourceChoices === true ? quickTapPlan : historicalQuickTapPlan;',
     'const build = quickTapPlan;'),
]
# The same current quick/search deduplication contract now has semantic keys on both paths. Bypassing it still must fail;
# merely comparing those keys is now correct, so the original presentation-key mutation would no longer break behavior.
BREAKS += [entry for entry in runpy.run_path('game/tools/batch/breaks-load100-w0-w5-output-colors.py')['BREAKS']
           if entry[0] == 'current quick and search patterns deduplicate by output']
