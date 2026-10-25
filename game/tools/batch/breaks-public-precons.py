# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""Public precons in the table's deck chooser, and Rob's decks no longer bundled for everyone (Rob, 2026-10-25):
one break for each piece of crankmagic-table.js and crankmagic-stage.css that serves it.

Run from the repository root, with nothing else editing the worktree:

    python -u game/tools/batch/breaks.py game/tools/batch/breaks-public-precons.py
"""
SUITES = ['tests/table-lobby.mjs']
T = 'crankmagic-table.js'
S = 'crankmagic-stage.css'
BREAKS = [
    # A deck bundled for everyone again, where nothing is shared with the player.
    ('a bundled deck when nothing is shared', T,
     '    availableSharedDecks = C.sharingAvailable?.() && C.sharedDecks ? await C.sharedDecks() : [];',
     '    availableSharedDecks = C.sharingAvailable?.() && C.sharedDecks ? await C.sharedDecks() : [{id: "shared:D6", name: "D6 Krenko", commander: ["Krenko, Mob Boss"], cards: []}];'),
    # One precon of the six left out.
    ('a precon left out', T,
     '    return latest.decks.map((p) => lists.get(p.id))',
     '    return latest.decks.slice(1).map((p) => lists.get(p.id))'),
    # A precon's quantities dropped: thirty-two Plains become one.
    ('quantities dropped', T,
     '.flatMap(([n, q]) => Array(q).fill(n))};',
     '.map(([n]) => n)};'),
    # The precons never checked against the table, so never enabled.
    ('precons not checked', T,
     '      for (const [d, attr] of [...availablePrecons.map((d) => [d, "data-precon-status"]), ...availableSharedDecks',
     '      for (const [d, attr] of [...availableSharedDecks'),
    # Playable no longer puts away a precon the table cannot play.
    ('Playable keeps an unplayable precon', S,
     ',\n.cm-table-deck-choose.is-playable-only li:has(>.cm-table-deck[data-precon]:disabled){display:none}',
     '{display:none}'),
]
