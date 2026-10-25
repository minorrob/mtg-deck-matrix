# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""The same card one stack, ×N, with how many where more than one may be chosen; and the cards another seat plays held up
beside the question, never over it (Rob, 2026-10-25): one break for each piece of crankmagic-board.js that serves them.

Run from the repository root, with nothing else editing the worktree:

    python -u game/tools/batch/breaks.py game/tools/batch/breaks-choice-stacks.py
"""
SUITES = ['tests/board-choice-stacks.mjs']
B = 'crankmagic-board.js'
BREAKS = [
    # Identity: a card on the table compared by name alone, so a tapped Goblin stacks with an untapped one.
    ('state not compared', B,
     'seen = c ? Object.fromEntries(Object.entries(c).filter(([k]) => k !== "cardId")) : "unseen";',
     'seen = c ? c.name : "unseen";'),
    # No stacks at all in a many question.
    ('many not stacked', B,
     '      body = allAt + sameStacks(d).map(stackOpt).join("");',
     '      body = allAt + d.options.map((o) => [o]).map(stackOpt).join("");'),
    # No how-many beside a stack.
    ('no how-many', B,
     '      const many = d.mode === "many" && d.max > 1,',
     '      const many = false,'),
    # How-many's limit ignores what the question still allows.
    ('room unlimited', B,
     'room = Math.min(s.length, d.max - (picked.length - k));',
     'room = s.length;'),
    # A stack's click takes one but never puts it back.
    ('click never puts back', B,
     '    setSame(ids, ids.some((i) => picked.includes(i)) ? 0 : 1);',
     '    setSame(ids, 1);'),
    # Picking past the question's most.
    ('past the most', B,
     '      if (picked.length >= d.max) break;\n      picked.push(i);',
     '      picked.push(i);'),
    # The number box does nothing.
    ('number not read', B,
     '    setSame(String(same).split(",").map(Number), Number(event.target.value));',
     '    return;'),
    # The cards held up are not moved past the question (they are put away instead, so fewer are seen).
    ('not moved past the question', B,
     '      if (left + width <= innerWidth - 8) layer.style.setProperty("--plays-left", `${left}px`);',
     '      if (false) layer.style.setProperty("--plays-left", `${left}px`);'),
    # No guard at all: a held-up card left over the question's controls.
    ('question not cleared', B,
     '    clearQuestion(layer);\n  }',
     '  }'),
]
