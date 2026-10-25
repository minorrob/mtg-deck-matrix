# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""The integration of Rob's four priority lists (2026-10-24): one break for each change it made to the engine's tools.

- Fidelity: the abilities inside a clause claim it only when together they are all of it but connectives (Gandalf the
  White's Flash is not its flash-granting sentence), and an all-reminder line is claimed by an ability inside it
  (CR 207.2a, Dryad Arbor): game/engine/cards/compile.mjs, faceFidelity.

Run from the repository root, with nothing else editing the worktree:

    python -u game/tools/batch/breaks.py game/tools/batch/breaks-roblists-integration.py
"""
SUITES = ['tests/engine-compile.mjs']
CO = 'game/engine/cards/compile.mjs'
BREAKS = [
    ('fidelity: an ability inside a clause claims it all', CO,
     '    return rest.replace(/[\\s,.;:"\'()-]+/g, " ").replace(/\\b(and|or|then)\\b/g, " ").trim() === "";',
     '    return true;'),
    ('fidelity: an all-reminder line claimed only whole', CO,
     '    if (reminder.has(c)) return true;\n', ''),
]
