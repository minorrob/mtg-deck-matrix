# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""Variance on the win rate (2026-10-18, Linear ROB-116 step 3): tests/deck-measure.mjs and tests/crankmagic-sim.mjs
hold the win rate's between-seed error and the figures the evidence pack names. These breaks prove the checks can
fail: the error computed from one seed's binomial spread instead of between seeds, the error dropped from the pack,
and the end-turn histogram left unsummed. tests/deck-measure.mjs re-measures the six published decks, so a run is a
minute or two. From the repository root:

    python3 game/tools/batch/breaks.py game/tools/batch/breaks-sim-variance.py
"""
SUITES = ['tests/deck-measure.mjs', 'tests/crankmagic-sim.mjs']
BREAKS = [
    ('the win-rate error not between seeds', 'deck-measure.js',
     '      winRateSe: round(Math.sqrt(runs.reduce((sum, r) => sum + (r.winRate - mean((x) => x.winRate)) ** 2, 0) / Math.max(1, runs.length - 1) / runs.length), 4),',
     '      winRateSe: round(Math.sqrt(mean((r) => r.winRate) * (1 - mean((r) => r.winRate)) / (games * seeds.length)), 4),'),
    ('the error dropped from the pack', 'crankmagic-sim.js',
     '        winRateStandardError: {value: result.winRateSe == null ? null : pct(result.winRateSe), unit: "%"},',
     '        winRateStandardError: {value: null, unit: "%"},'),
    ('the end-turn histogram unsummed', 'deck-measure.js',
     '        runs.forEach((run) => (run.endTurnCounts || []).forEach((row) => { if (row && row.games > 0) total.set(row.turn, (total.get(row.turn) || 0) + row.games); }));',
     '        (runs[0].endTurnCounts || []).forEach((row) => { if (row && row.games > 0) total.set(row.turn, row.games); });'),
]
