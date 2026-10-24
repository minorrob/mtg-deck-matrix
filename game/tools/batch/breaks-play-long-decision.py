# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""A long decision in Full screen can be finished (2026-10-19). With a search across most of a library -- Gamble, Gifts
Ungiven, Fauna Shaman, Diabolic Tutor, Curse-Marred Demon, Goblin Recruiter in Rob's six decks -- the floated decision ran
below the window, and nothing scrolled it: the table's region clips (`overflow:hidden`) and the box was pinned top and
bottom. Now the box is no taller than the table, its title and foot stay on screen and its options scroll between them
(crankmagic-stage.css, `.cm-stage-region .cm-board-ask`). tests/table-tabletop.mjs renders 60 and 150 options at
1024x768, 1280x720 and 1400x900, scrolls the list with the wheel and presses the last option and Confirm where a person
sees them, hit-tested by elementFromPoint.

A browser suite, so Playwright must be there; GEOMETRY_REQUIRED=1 makes its absence a failure rather than a pass. Run
from the repository root, with nothing else editing the worktree:

    GEOMETRY_REQUIRED=1 python3 -u game/tools/batch/breaks.py game/tools/batch/breaks-play-long-decision.py
"""
SUITES = ['tests/table-tabletop.mjs']
CSS = 'crankmagic-stage.css'
ASK = '.cm-stage-region .cm-board-ask{z-index:12;max-width:80%;left:50%;transform:translateX(-50%);max-height:calc(100% - 12px)}\n'
COLUMN = '.cm-stage-region .cm-board-ask>#cm-board-decision{display:flex;flex-direction:column;min-height:0}\n'
LIST = '.cm-stage-region .cm-board-ask>#cm-board-decision>.cm-board-options{overflow-y:auto;padding:3px;margin:-3px}\n'
BREAKS = [
    ('the fix removed: the box pinned top and bottom, nothing scrolls', CSS,
     ASK + COLUMN + '/* 3px inside the scroll keeps a chosen option\'s outline (2px, 1px out) whole at the list\'s edges */\n' + LIST,
     '.cm-stage-region .cm-board-ask{z-index:12;max-width:80%;left:50%;transform:translateX(-50%);bottom:4px}\n'),
    ('the box stretched to the foot of the table again, over the table under it', CSS,
     'translateX(-50%);max-height:calc(100% - 12px)}',
     'translateX(-50%);max-height:calc(100% - 12px);bottom:4px}'),
    ('the box as tall as the list, past the table', CSS,
     'translateX(-50%);max-height:calc(100% - 12px)}', 'translateX(-50%)}'),
    ('the decision kept as tall as its options', CSS,
     '.cm-stage-region .cm-board-ask>#cm-board-decision{display:flex;flex-direction:column;min-height:0}',
     '.cm-stage-region .cm-board-ask>#cm-board-decision{display:flex;flex-direction:column}'),
    ('the decision not a column, so its list has no height to scroll in', CSS,
     '.cm-stage-region .cm-board-ask>#cm-board-decision{display:flex;flex-direction:column;min-height:0}',
     '.cm-stage-region .cm-board-ask>#cm-board-decision{min-height:0}'),
    ('the options never scroll', CSS,
     '>.cm-board-options{overflow-y:auto;padding:3px;margin:-3px}', '>.cm-board-options{padding:3px;margin:-3px}'),
    ('a chosen option\'s outline cut at the list\'s edge', CSS,
     '>.cm-board-options{overflow-y:auto;padding:3px;margin:-3px}', '>.cm-board-options{overflow-y:auto}'),
    ('the options set in from the title', CSS,
     '>.cm-board-options{overflow-y:auto;padding:3px;margin:-3px}', '>.cm-board-options{overflow-y:auto;padding:3px}'),
]
