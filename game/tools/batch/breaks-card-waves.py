# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""Waves review the candidates, demand first (card load step 6; Linear ROB-92): game/tools/card-waves.mjs.

Run from the repository root, with nothing else editing the worktree:

    python3 game/tools/batch/breaks.py game/tools/batch/breaks-card-waves.py
"""
SUITES = ['tests/card-waves.mjs']
BREAKS = [
    ("demand ignored", 'game/tools/card-waves.mjs',
     '  return [...cards].sort((a, b) => of(b).decks - of(a).decks || of(b).asked - of(a).asked\n    || ', '  return [...cards].sort((a, b) => '),
    ("times asked ignored", 'game/tools/card-waves.mjs',
     ' || of(b).asked - of(a).asked\n', '\n'),
    ("card-demand's written shape not read", 'game/tools/card-waves.mjs',
     '{decks: d.demand?.decks ?? d.decks ?? 0, asked: d.demand?.asked ?? d.asked ?? 0}', '{decks: d.decks ?? 0, asked: d.asked ?? 0}'),
    ("the best evidenced not first", 'game/tools/card-waves.mjs',
     '    || b.confidence.fewestCards - a.confidence.fewestCards || ', '    || '),
    ("life left out of the draft", 'game/tools/card-waves.mjs',
     '    expect.push({seat, life: view.players[seat].life});\n', ''),
    ("zones left out of the draft", 'game/tools/card-waves.mjs',
     '    for (const [zone, key] of ZONES) expect.push(', '    for (const [zone, key] of []) expect.push('),
    ("keywords left out of the draft", 'game/tools/card-waves.mjs',
     '  if (standing?.keywords.length) expect.push(', '  if (false) expect.push('),
    ("a broken smoke game drafted anyway", 'game/tools/card-waves.mjs',
     '  try { ({state} = runScenario(scenario, cards, fixtures)); } catch { return null; }', '  ({state} = runScenario({...scenario, setup: []}, cards, fixtures));'),
    ("promoted without review's mark", 'game/tools/card-waves.mjs',
     '    write(card, JSON.stringify({...e.script, source: "hand"}, null, 2) + "\\n");', '    write(card, JSON.stringify(e.script, null, 2) + "\\n");'),
    ("promoted without a draft", 'game/tools/card-waves.mjs',
     '    if (!e.draft) throw new Error', '    if (false) throw new Error'),
    ("promoted over a file that exists", 'game/tools/card-waves.mjs',
     '    if (existsSync(card)) throw new Error', '    if (false) throw new Error'),
    ("accents kept in a file name", 'game/tools/card-waves.mjs',
     'String(name).normalize("NFKD").replace(/[\\u0300-\\u036f]/g, "").toLowerCase()', 'String(name).toLowerCase()'),
    ("the sheet without the templates' teachers", 'game/tools/card-waves.mjs',
     '    const taught = c.templates.map((id) => `\\`${id}\\` (${teachers(id)})`);', '    const taught = c.templates.map((id) => `\\`${id}\\``);'),
]
