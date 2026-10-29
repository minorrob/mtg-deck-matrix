# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""Supplement the unchanged full-union proof with the existing native early-commit negative controls."""
import runpy
from pathlib import Path
SUITES = ['tests/engine-battle-damage-sba.mjs']
BREAKS = [
    ('SBA receipt bypasses native commit readiness', 'game/engine/rules/sba-move-results.mjs',
     '''  if (cohort.phase !== "commit" || frame?.kind !== "sba-cohort" || frame.cohortId !== cohortId || frame.stage !== "commit"
    || !prepared || prepared.operation !== operation.serial || prepared.cohortId !== cohortId || prepared.objectId !== id
    || !member || member.token !== token || member.committed || member.skipped
    || (!completed && (state.objects[id]?.zone !== prepared.from || state.objects[id]?.owner !== prepared.owner))
    || !cohort.snapshots?.[id]
    || cohort.members.some(other => !other.committed && !other.skipped && !operation.sbaPreparedMoves?.[other.token]))
    throw new Error("No ready, matching internal SBA move result");
''', ''),
]

for filename, label in [('breaks-precons-e-zombies.py', 'follow-ups run by moveOne'),
                        ('breaks-roblists-p3-counters.py', 'a shield counter replaces the state-based destruction too')]:
    original = runpy.run_path(str(Path(__file__).with_name(filename)))
    for suite in original['SUITES']:
        if suite not in SUITES:
            SUITES.append(suite)
    BREAKS.extend((f'{filename}: {name}', target, anchor, replacement)
                  for name, target, anchor, replacement in original['BREAKS'] if name == label)
