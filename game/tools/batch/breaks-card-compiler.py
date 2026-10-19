# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""The card compiler (card load step 3; Linear ROB-88): game/tools/card-compiler.mjs and its candidates.

Run from the repository root, with nothing else editing the worktree:

    python3 game/tools/batch/breaks.py game/tools/batch/breaks-card-compiler.py
"""
SUITES = ['tests/card-compiler.mjs']
BREAKS = [
    ("another layout translated anyway", 'game/tools/card-compiler.mjs',
     '  if (record.layout !== "normal" || (record.faces && record.faces !== "None")) return {...base, status: "structure", layout: record.layout};\n', ''),
    ("a distrusted template trusted", 'game/tools/card-compiler.mjs',
     '  if (distrusted.length) return {...base, status: "vetoed", why: distrusted.map((v) => `${v.id}: ${v.why}`)};\n', ''),
    ("a rule not built passed as a candidate", 'game/tools/card-compiler.mjs',
     '  if (problems.length) return {...base, status: "blocked", why: problems};\n', ''),
    ("the smoke game skipped", 'game/tools/card-compiler.mjs',
     '  if (!smoke.ok) return {...base, status: "refused", why: [`smoke: ${smoke.error ?? smoke.problems[0]}`]};\n', ''),
    ("no minimum count trusted", 'game/tools/card-compiler.mjs',
     '    if (minimum === null) return {ok: false, why: "no minimum count: the calibration set none", cards: t.cards, band};\n', ''),
    ("a calibration failure forgiven", 'game/tools/card-compiler.mjs',
     '    if (rate && rate.passed < rate.tried) return', '    if (false) return'),
    ("banned cards compiled", 'game/tools/card-compiler.mjs',
     'deckCard(c) && !banned.has(c.name) && !index.resolve(c.name)', 'deckCard(c) && !index.resolve(c.name)'),
    ("defined cards compiled again", 'game/tools/card-compiler.mjs',
     'deckCard(c) && !banned.has(c.name) && !index.resolve(c.name)', 'deckCard(c) && !banned.has(c.name)'),
    ("tokens in the pool", 'game/tools/card-compiler.mjs',
     "export const deckCard = (card) => !/^(Basic Land|Token)/.test(card.type || \"\") && ", "export const deckCard = (card) => "),
    ("the next sentences counting cards two short", 'game/tools/card-compiler.mjs',
     '    if (r.status !== "unknown" || r.gaps.length !== 1) continue;', '    if (r.status !== "unknown") continue;'),
]
