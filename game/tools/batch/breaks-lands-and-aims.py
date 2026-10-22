# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""Rob's fullscreen notes (Oct 21; room.mjs `landAnyStep`, `takeBackLand`, `askAimed`, and the `askStack` way of playing):
a person's land in any step of their own turn, a land taken back with nothing since, asked about what is aimed at them, and
asked about anything on the stack when they turn Skip my priority if no response possible off. tests/room-lands-and-aims.mjs,
tests/game-table.mjs.

    python3 game/tools/batch/breaks.py game/tools/batch/breaks-lands-and-aims.py

"Nothing since" is held twice -- any action applied clears the land kept (`apply`), and the game's hash must be the one the
land left -- so breaking either alone is caught by the other, and neither is listed here.
"""
SUITES = ['tests/room-lands-and-aims.mjs', 'tests/game-table.mjs']
A = 'game/engine/rules/actions.mjs'
R = 'game/room/room.mjs'
T = 'game/room/table.mjs'
BREAKS = [
    ('a land in a main phase only', A,
     '&& (MAIN_PHASES.includes(state.phase) || landAnyStep(state, player))',
     '&& MAIN_PHASES.includes(state.phase)'),
    ('a land outside a main phase stopping the step', A,
     '!(a.kind === "play-land" && outsideMain)',
     'true'),
    ('the AI seats given it too', R,
     '(s.pilot === "house" ? [] : [seat])',
     '[seat]'),
    ('the take-back not offered', R,
     'const backs = landBack && landBack.player === seat && hashState(state) === landBack.after ?',
     'const backs = false ?'),
    ('the take-back not asked for', R,
     'untaps.length > 0 || backs.length > 0 ||',
     'untaps.length > 0 ||'),
    ('the take-back lost on reopening', R,
     '    landBack = takeBackLand && record.landBack === true ? JSON.parse(await storage.get(LAND_KEY) || "null") : null;\n',
     '    landBack = null;\n'),
    ('the land kept in play when taken back', R,
     '      state = landBack.before;\n',
     ''),
    ('aimed-at not asked', R,
     'const asked = held || aimed ||',
     'const asked = held ||'),
    ('a spell aimed at its caster asking another', R,
     '    if (t?.kind === "player") return t.id === seat;\n',
     '    if (t?.kind === "player") return true;\n'),
    ('a permanent of theirs not counted', R,
     '    if (object.zone === "battlefield") return deriving(state, () => controllerOf(state, t.id)) === seat;\n',
     '    if (object.zone === "battlefield") return false;\n'),
    ('askAimed in a match launched before', R,
     'const aimed = askAimed && aimedAt(state, seat);',
     'const aimed = aimedAt(state, seat);'),
    ('askStack ignored', R,
     '{stack: passStack && prefs[seats[seat].seatId]?.askStack !== true}',
     '{stack: passStack}'),
    ('askStack not taped', R,
     ', ...(typeof askStack === "boolean" ? {askStack: ask} : {})});',
     '});'),
    ('askStack forgotten by a prefer without it', R,
     'const ask = typeof askStack === "boolean" ? askStack : was.askStack === true;',
     'const ask = askStack === true;'),
    ('a table launching without the keys', T,
     '      landAnyStep: true, takeBackLand: true, askAimed: true,\n',
     ''),
]
