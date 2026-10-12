# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""Train E, worker f3: sixteen of Rob's v43 library cards (Feed the Flames; Flamebraider; Forum of Amity; Fractal Mascot;
Fractalize; Frontline War-Rager; Fungal Colossus; Gallia, Tragic Host; Gallia, the Merrymaker; Gardenize; General Traag,
Heart of Stone; Gideon the Oathless; Gigastorm Titan; Graduation Day; Graft Surgeon; Gravelgill Scoundrel). One engine
change: the amount `differentNames` (script/amount.mjs), for Fungal Colossus. One break for each guard and branch of it,
and the suite that catches it:

    python3 game/tools/batch/breaks.py game/tools/batch/breaks-train-e-f3.py
"""
SUITES = [
    'tests/engine-counts-among.mjs',
    'tests/engine-cards.mjs',
]

AMOUNT = 'game/engine/script/amount.mjs'
NAMES = ('  else if ("differentNames" in value) n = new Set(matching(state, value.differentNames, who)'
         '.map((id) => state.objects[id].card).filter((name) => typeof name === "string" && name)).size;\n')

BREAKS = [
    # Fungal Colossus: "where X is the number of differently named lands you control" (script/amount.mjs, differentNames).
    ('differentNames: a kind of amount', AMOUNT, '  "differentNames",\n', ''),
    ('differentNames: counted', AMOUNT, NAMES, ''),
    ('differentNames: each name once', AMOUNT, NAMES,
     NAMES.replace('n = new Set(matching(', 'n = (matching(').replace('&& name)).size;', '&& name)).length;')),
    ('differentNames: what the selector matches', AMOUNT, NAMES,
     NAMES.replace('matching(state, value.differentNames, who)', 'matching(state, {what: "permanent"}, who)')),
    ('differentNames: a face-down one has no name', AMOUNT, NAMES,
     NAMES.replace('.filter((name) => typeof name === "string" && name)', '.map((name) => name ?? "face down")')),
    ('differentNames: its selector held to the grammar', AMOUNT,
     '"differentPowers", "differentNames", "planeswalkerTypesAmong"', '"differentPowers", "planeswalkerTypesAmong"'),
]
