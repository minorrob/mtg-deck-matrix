# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""The backstop, gap-only (card load step 4; Linear ROB-90): the writer handed what the sentence library already wrote.

Run from the repository root, with nothing else editing the worktree:

    python3 game/tools/batch/breaks.py game/tools/batch/breaks-card-backstop.py
"""
SUITES = ['tests/engine-compile.mjs']
BREAKS = [
    ("the writer not told what is already written", 'game/engine/cards/compile.mjs',
     '  ...(assist ? {alreadyWritten: assist.known, writeOnly: assist.write.map((w) => w.text)} : {}),\n', ''),
    ("the library's sentences dropped from the card", 'game/engine/cards/compile.mjs',
     '  return [...known, ...(Array.isArray(written) ? written : [])]', '  return [...(Array.isArray(written) ? written : [])]'),
    ("merged out of the card's order", 'game/engine/cards/compile.mjs',
     '.sort((x, y) => at(x.a) - at(y.a) || x.i - y.i)', '.sort((x, y) => y.i - x.i)'),
    ("a sentence written twice kept", 'game/engine/cards/compile.mjs',
     '    if (again.length) return', '    if (false) return'),
    ("the writer handed nothing to finish", 'game/tools/engine-compile.mjs',
     '    const assist = job.assist ? job.assist(card) : null;', '    const assist = null;'),
    ("the writer's answer checked without the library's sentences", 'game/tools/engine-compile.mjs',
     '      checked = checkAnswer(card, answer ?? {}, WRITER_MODEL, assist?.known ?? null);', '      checked = checkAnswer(card, answer ?? {}, WRITER_MODEL);'),
    ("a candidate asked of the writer", 'game/tools/engine-compile.mjs',
     '    if (job.candidates?.has(name)) { results.push({name, outcome: "a candidate"}); continue; }\n', ''),
    ("a distrusted sentence kept as written", 'game/engine/cards/sentences.mjs',
     '  const trusted = spans.filter((s) => keep(s.id));', '  const trusted = spans;'),
    ("a spell half written", 'game/engine/cards/sentences.mjs',
     '  const kept = whole ? trusted : trusted.filter((s) => !s.spell);', '  const kept = trusted;'),
    ("the sample's scenarios not played", 'game/tools/engine-compile.mjs',
     '    try { for (const scenario of file.scenarios) runScenario(scenario, cards, file.fixtures ?? {}); }\n    catch (error) { row("failed", `plays:', '    try { }\n    catch (error) { row("failed", `plays:'),
    ("the sample past its cap", 'game/tools/engine-compile.mjs',
     '    if (cost >= maxCost) { stopped = `the sample reached', '    if (false) { stopped = `the sample reached'),
    ("the demand list not read", 'game/tools/engine-compile.mjs',
     '  if (flag("--demand") !== null) {', '  if (false) {'),
]
