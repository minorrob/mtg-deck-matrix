# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""The anchors check (game/tools/batch/anchors.py), broken one way at a time; tests/engine-breaks-anchors.mjs must catch
each:

    python3 game/tools/batch/breaks.py game/tools/batch/breaks-anchors.py
"""
SUITES = [
    'tests/engine-breaks-anchors.mjs',
]

TOOL = 'game/tools/batch/anchors.py'

BREAKS = [
    ('not once: an anchor found nowhere', TOOL, '        if n != 1:\n', '        if n > 1:\n'),
    ('not once: an anchor found twice', TOOL, '        if n != 1:\n', '        if n == 0:\n'),
    ('not once: how many times', TOOL, "'target': target, 'found': n})", "'target': target, 'found': 1})"),
    ('no change: reported', TOOL, '        if find == replace:\n', '        if False:\n'),
    ('no file: reported', TOOL, "            problems.append({'kind': 'no file', 'file': rel, 'label': label, 'target': target})\n", ''),
    ('no suite: reported', TOOL, "            problems.append({'kind': 'no suite', 'file': rel, 'suite': suite})\n", '            pass\n'),
    ('bad shape: reported', TOOL, "            problems.append({'kind': 'bad shape', 'file': rel, 'entry': repr(entry)[:120]})\n", ''),
    ('tools/ read too', TOOL, "DIRS = ('game/tools/batch', 'tools')", "DIRS = ('game/tools/batch',)"),
    ('every entry counted', TOOL, '        count += 1\n', ''),
    ('fails when anything is reported', TOOL, 'sys.exit(1 if problems else 0)', 'sys.exit(0)'),
]
