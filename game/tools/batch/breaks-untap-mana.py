# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""Untap, its mana unspent (Rob's playtest notes, 2026-10-11: "I should also be able to click the card to untap it again"):
game/engine/rules/untap-mana.mjs and the room's seventh beat, `untapMana`.

Run from the repository root, with nothing else editing the worktree:

    python3 game/tools/batch/breaks.py game/tools/batch/breaks-untap-mana.py
"""
SUITES = ['tests/room-untap-mana.mjs']
BREAKS = [
    ('a tap that did more taken back', 'game/engine/rules/untap-mana.mjs',
     '  if (hashState(copy) !== before.hash) return null;\n',
     ''),
    ('the round of passes not part of the proof', 'game/engine/rules/untap-mana.mjs',
     '  copy.passes = before.passes;\n',
     ''),
    ('only the last tap of a run', 'game/engine/rules/untap-mana.mjs',
     'const continues = run && run.after === before.hash;',
     'const continues = false;'),
    ('a run continued across anything', 'game/engine/rules/untap-mana.mjs',
     'const continues = run && run.after === before.hash;',
     'const continues = !!run;'),
    ('untapped whatever happened since', 'game/engine/rules/untap-mana.mjs',
     'export const untappable = (state, run) => !!run && hashState(state) === run.after;',
     'export const untappable = (state, run) => !!run;'),
    ('its mana left in the pool', 'game/engine/rules/untap-mana.mjs',
     '  for (const [key, n] of Object.entries(take.mana)) pool[key] -= n;\n',
     ''),
    ('the round of passes not put back', 'game/engine/rules/untap-mana.mjs',
     '  if (!takes.length) state.passes = run.passes;\n',
     ''),
    ('the run\'s other taps lost with one untapped', 'game/engine/rules/untap-mana.mjs',
     'return {events, run: takes.length ? {...run, takes, after: hashState(state)} : null};',
     'return {events, run: null};'),
    ('the untap not in the journal', 'game/engine/rules/untap-mana.mjs',
     'const events = [event("GameEventCardTapped", state, {card: cardRef(state, objectId), tapped: false})];',
     'const events = [];'),
    ('passed for in the middle of it', 'game/room/room.mjs',
     'const asked = untaps.length > 0 || (',
     'const asked = ('),
    ('the history does not say so', 'game/room/room.mjs',
     '      note(`${seats[seat].name} untapped ${action.name}, its mana unspent`);\n',
     ''),
    ('not kept with the room', 'game/room/room.mjs',
     '...(untapMana ? {untapMana, taken} : {}), ',
     '...(untapMana ? {untapMana} : {}), '),
    ('the beat not asked for by the pod', 'game/room/room.mjs',
     'untapMana = beats.untapMana === true;',
     'untapMana = false;'),
    ('the fuzz harness\'s person untaps', 'tools/fuzz-live.mjs',
     'let a = pilot.answer(untaps ? {...decision, options: decision.options.filter((o) => o.act !== "undo-mana")} : decision);',
     'let a = pilot.answer(decision);'),
]
