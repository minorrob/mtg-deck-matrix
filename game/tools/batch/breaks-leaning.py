# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""Whose side an offer is on (Rob, 2026-10-12: Valorous Stance's indestructible aimed at an opponent's creature should be
marked as helping them): game/room/room.mjs `leaning`, and the board's mark (crankmagic-board.js `sayHtml`).

Browser suite: run with GEOMETRY_REQUIRED=1, from the repository root, with nothing else editing the worktree:

    GEOMETRY_REQUIRED=1 python3 game/tools/batch/breaks.py game/tools/batch/breaks-leaning.py
"""
SUITES = ['tests/board-choices.mjs']
BREAKS = [
    ('a help at an opponent not said', 'game/room/room.mjs',
     '    if (HELPS(e) && holder !== seat) return',
     '    if (false) return'),
    ('a harm at your own not said', 'game/room/room.mjs',
     '    if (HARMS(e) && holder === seat) return',
     '    if (false) return'),
    ('indestructible not a help', 'game/room/room.mjs',
     '((e.power ?? 0) > 0 || (e.toughness ?? 0) > 0 || (e.keywords ?? []).length > 0))',
     '((e.power ?? 0) > 0 || (e.toughness ?? 0) > 0))'),
    ('a chosen mode not read', 'game/room/room.mjs',
     '  if (Array.isArray(a.modes) && source.modal?.modes) {',
     '  if (false) {'),
    ('every mode read, not the chosen one', 'game/room/room.mjs',
     '    for (const i of a.modes) {const mode = source.modal.modes[i];',
     '    for (const i of source.modal.modes.keys()) {const mode = source.modal.modes[i];'),
    ('damage at you said as at your own', 'game/room/room.mjs',
     'return t.kind === "player" ? "against you" : "against your own";',
     'return "against your own";'),
    ('the option does not carry it', 'game/room/room.mjs',
     '        ...((lean) => (lean ? {lean} : {}))(state ? leaning(state, seat, a) : "")}))};',
     '        }))};'),
    ('the board does not mark it', 'crankmagic-board.js',
     '  const sayHtml = (o) => (o.lean ? e(sayFor(o)).replace(',
     '  const sayHtml = (o) => (false ? e(sayFor(o)).replace('),
]
