# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""Callouts that keep up with the game, and the game's end said plainly (Oct 21, Rob's one-person, three-AI table; the
solo run's last screen showed "YOUR TURN · Turn 33" on turn 38 over the game-over panel). Stale callouts passed over when
a newer view's come, a KO never; the game's end clears the queue and the screen; the pass button reads Game over; a seat
out of the game says so on its empty mat; and the callouts never lie over a question asked of you. tests/board-callouts.mjs,
tests/board-ending-rematch.mjs, tests/board-callouts-place.mjs, tests/table-board.mjs.

    python3 game/tools/batch/breaks.py game/tools/batch/breaks-callouts-keep-up.py
"""
SUITES = ['tests/board-callouts.mjs', 'tests/board-ending-rematch.mjs', 'tests/board-callouts-place.mjs', 'tests/table-board.mjs']
B = 'crankmagic-board.js'
BREAKS = [
    ('stale callouts kept', B,
     '[...queue.filter((c) => c.big || now - c.at <= CALLOUT_STALE_MS), ...stamped]',
     '[...queue, ...stamped]'),
    ('a KO passed over as stale', B,
     'queue.filter((c) => c.big || now - c.at <= CALLOUT_STALE_MS)',
     'queue.filter((c) => now - c.at <= CALLOUT_STALE_MS)'),
    ('the end not clearing the queue', B,
     '    if (list.some((c) => c.final)) return {queue: stamped, clear: true};\n',
     ''),
    ('the end not final', B,
     'big: true, final: true});',
     'big: true});'),
    ('the pass button still naming a spell at the end', B,
     '    if (view.status === "finished") return "Game over";\n',
     ''),
    ('a seat out of the game said to have no permanents yet', B,
     '${p.health.status === "lost" || departed(i) ? "Out of the game." : "No permanents yet."}',
     'No permanents yet.'),
    ('the end not clearing the screen', B,
     '      if (layer) layer.replaceChildren();\n',
     ''),
]
BREAKS += [
    ('callouts laid over a question', B,
     '    if (!ask || !layer.children.length) return;\n',
     '    return;\n'),
    ('callouts left where a question was', B,
     '    layer.style.top = "";\n    layer.classList.remove("is-hidden");\n',
     '    layer.classList.remove("is-hidden");\n'),
    ('callouts under the phone board', 'crankmagic.css',
     '.cm-board[data-phone]~.cm-board-callouts{z-index:61;top:30%}',
     ''),
]
