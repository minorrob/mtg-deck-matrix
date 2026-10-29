# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""Preserve the complete inherited union and every original control, with direct native witnesses first."""
import runpy
from pathlib import Path

SUITES = ['tests/engine-battle-linked-returns.mjs', 'tests/engine-entry-counter-order.mjs',
          'tests/engine-intrinsic-entry.mjs', 'tests/engine-battles.mjs',
          'tests/engine-battle-damage-sba.mjs', 'tests/engine-chulane-completion.mjs']
BREAKS = []
for filename in ['breaks-load100-w0-w1-linked-return-progress.py',
                 'breaks-load100-w0-w1-entry-counter-order.py',
                 'breaks-load100-w0-w1-battle-runtime.py',
                 'breaks-load100-w0-w1-battle-readiness.py',
                 'breaks-chulane-completion.py']:
    original = runpy.run_path(str(Path(__file__).with_name(filename)))
    for suite in original['SUITES']:
        if suite not in SUITES:
            SUITES.append(suite)
    BREAKS.extend((f'{filename}: {label}', target, anchor, replacement)
                  for label, target, anchor, replacement in original['BREAKS']
                  if filename != 'breaks-chulane-completion.py' or label == 'aura host uses owner')

# Both broad readers remain mandatory in the full unbroken baseline and every mutation's union.
BROAD = ['tests/engine-cards.mjs', 'tests/generators.mjs']
SUITES = [suite for suite in SUITES if suite not in BROAD] + [suite for suite in BROAD if suite in SUITES]
