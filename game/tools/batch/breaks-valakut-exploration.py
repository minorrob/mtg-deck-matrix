# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
import runpy

# Add the reported-card witness to the complete existing W3 permission reader union.
SUITES = ['tests/engine-valakut-exploration.mjs'] + runpy.run_path('game/tools/batch/breaks-load100-w0-w3-graveyard.py')['SUITES']
BREAKS = [
    ('Valakut exile casts retain physical source funding', 'game/engine/rules/actions.mjs',
     '["hand", "command", "exile", "graveyard", "library"].includes(from)',
     '["hand", "command", "graveyard", "library"].includes(from)'),
]
