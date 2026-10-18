# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""Every control of the lobby in reach, at any window size (Rob, 2026-10-13: an invited player, her window not maximized,
had no Ready). The table keeps its 2x2 only while every seat's card, reading and controls lie inside what clips them;
otherwise, and always on a phone, the seats stack, each as tall as what it holds (crankmagic-seat-art.js, fitSeats;
crankmagic.css, `.cm-cloud-table`). The seats keep clear of the rules panel by construction, `max(24%,132px)`.

A browser suite, so Playwright must be there; GEOMETRY_REQUIRED=1 makes its absence a failure rather than a pass. Run
from the repository root, with nothing else editing the worktree:

    GEOMETRY_REQUIRED=1 python3 game/tools/batch/breaks.py game/tools/batch/breaks-lobby-reach.py
"""
SUITES = ['tests/table-lobby.mjs']
ART = 'crankmagic-seat-art.js'
CSS = 'crankmagic.css'
BREAKS = [
    # Whether the seats fit, and the choice it makes.
    ('the table never stacks for want of room', ART,
     "if (window.matchMedia('(max-width: 900px)').matches || !seatsFit(table)) table.classList.add('is-stacked');",
     "if (window.matchMedia('(max-width: 900px)').matches) table.classList.add('is-stacked');"),
    ('the table always stacks', ART,
     "|| !seatsFit(table)) table.classList.add('is-stacked');",
     "|| true) table.classList.add('is-stacked');"),
    ('sizing the table does not ask whether the seats fit', ART,
     "    fitSeats(table);\n  }",
     "  }"),
    ('only the quadrant clips, not the seat inside it', ART,
     "const r = part.getBoundingClientRect(), box = clipOf(part, table);",
     "const r = part.getBoundingClientRect(), box = part.closest('.cm-seat-q').getBoundingClientRect();"),
    ('the clip read across, not down', ART,
     "if (st.overflowY !== 'visible') { c.top = Math.max(c.top, r.top); c.bottom = Math.min(c.bottom, r.bottom); }",
     ""),
    # The CSS.
    ('the seats keep clear of 24% only, not of the panel\'s floor', CSS,
     ".cm-cloud-table .cm-q-br .cm-seat-figure,.cm-cloud-table .cm-q-tr .cm-seat-figure{right:max(24%,132px)}\n"
     ".cm-cloud-table .cm-q-bl .cm-seat-figure,.cm-cloud-table .cm-q-tl .cm-seat-figure{left:max(24%,132px)}\n",
     ""),
    ('a stacked seat\'s figure out of the flow', CSS,
     ".cm-cloud-table.is-stacked .cm-seat-q .cm-seat-figure{position:relative;inset:auto;margin:46px 12px 10px}\n",
     ""),
    ('the stacked panel hands its gear stamp to the table', CSS,
     ".cm-cloud-table.is-stacked .cm-table-center{position:relative;inset:auto;transform:none;",
     ".cm-cloud-table.is-stacked .cm-table-center{position:static;transform:none;"),
    ('the stacked table keeps its two columns', CSS,
     ".cm-cloud-table.is-stacked{grid-template-columns:minmax(0,1fr);grid-template-rows:none;aspect-ratio:auto;width:100%}\n",
     ""),
]
