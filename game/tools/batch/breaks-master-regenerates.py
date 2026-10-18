# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""data/archive/master-v2.json regenerated into the test's own temporary directory, never over the committed file
(Linear ROB-101, found on #742: pilot-policy read the file half-written while this suite rewrote it in place):
tests/master-regenerates.mjs and tools/import_master_v2.py (the second argument, the output path).

Neither break writes over the committed file: the importer is always handed the temporary path.

Run from the repository root, with nothing else editing the worktree:

    python3 game/tools/batch/breaks.py game/tools/batch/breaks-master-regenerates.py
"""
SUITES = ['tests/master-regenerates.mjs']
BREAKS = [
    ('the importer writing next to the path it was given, not to it', 'tools/import_master_v2.py',
     'dest = sys.argv[2] if len(sys.argv) > 2 else',
     'dest = sys.argv[2] + ".other" if len(sys.argv) > 2 else'),
    ('a card lost in the regeneration, still caught from the temporary copy', 'tools/import_master_v2.py',
     '        "cards": cards,\n',
     '        "cards": cards[1:],\n'),
]
