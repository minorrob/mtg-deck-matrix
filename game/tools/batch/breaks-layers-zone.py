# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""A permanent's static ability affects permanents only, unless it names another zone (CR 109.2; Linear ROB-81, found by
wave 4c's k3 lane): an anthem made a 2/2 creature card in hand report power 3. game/engine/rules/layers.mjs (affects,
`zone`), and Maskwood Nexus's explicit every-zone form.

Run from the repository root, with nothing else editing the worktree:

    python3 game/tools/batch/breaks.py game/tools/batch/breaks-layers-zone.py
"""
SUITES = ['tests/engine-layers.mjs', 'tests/engine-wave4c-k3.mjs']
BREAKS = [
    ('a static read in every zone again', 'game/engine/rules/layers.mjs',
     '  if (!rule.ids && !inZone(rule.zone, state.objects[current.id]?.zone)) return false;\n',
     ''),
    ('a named zone ignored: the battlefield only, whatever the static says', 'game/engine/rules/layers.mjs',
     'const inZone = (wanted, zone) => wanted === "any" || (wanted === "elsewhere" ? zone !== "battlefield" : (wanted ?? "battlefield") === zone);',
     'const inZone = (wanted, zone) => zone === "battlefield";'),
    ('"any" not read as every zone', 'game/engine/rules/layers.mjs',
     'const inZone = (wanted, zone) => wanted === "any" || (wanted === "elsewhere" ? zone !== "battlefield" : (wanted ?? "battlefield") === zone);',
     'const inZone = (wanted, zone) => (wanted === "elsewhere" ? zone !== "battlefield" : (wanted ?? "battlefield") === zone);'),
    ('Maskwood Nexus without its every-zone form', 'game/engine/cards/m/maskwood-nexus.json',
     '        "controller": "you",\n        "zone": "any"\n',
     '        "controller": "you"\n'),
]
