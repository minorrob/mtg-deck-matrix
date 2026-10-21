# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""Attack all (Oct 21, Rob's one-person, three-AI table): "All at <player>" and "None" on Declare attackers -- picks only, for
every creature that may attack that player, any other pick kept; Confirm alone sends. tests/board-attack-all.mjs.

    python3 game/tools/batch/breaks.py game/tools/batch/breaks-attack-all.py
"""
SUITES = ['tests/board-attack-all.mjs']
B = 'crankmagic-board.js'
BREAKS = [
    ('no All at on Declare attackers', B,
     '      const atPlayers = String(d.id).startsWith("declare-attackers:")\n',
     '      const atPlayers = false\n'),
    ('All at a planeswalker too', B,
     '.filter((o) => o.defenderId === Number(el.dataset.defender) && o.planeswalkerId === undefined);',
     '.filter((o) => o.defenderId === Number(el.dataset.defender));'),
    ('All at keeping the creatures\' old picks too', B,
     'picked = [...picked.filter((i) => !creatures.has(d.options[i].cardId)), ...at.map((o) => o.index)].slice(0, d.max);',
     'picked = [...picked, ...at.map((o) => o.index)].slice(0, d.max);'),
    ('All at sending at once', B,
     '    picked = [...picked.filter((i) => !creatures.has(d.options[i].cardId)), ...at.map((o) => o.index)].slice(0, d.max);\n    draw();\n',
     '    picked = [...picked.filter((i) => !creatures.has(d.options[i].cardId)), ...at.map((o) => o.index)].slice(0, d.max);\n    send({indices: picked});\n'),
    ('None not clearing', B,
     '    picked = [];\n    draw();\n  };',
     '    draw();\n  };'),
    ('All at on any question that picks many', B,
     '      const atPlayers = String(d.id).startsWith("declare-attackers:")\n',
     '      const atPlayers = true\n'),
]
