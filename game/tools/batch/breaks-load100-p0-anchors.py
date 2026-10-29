# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
import runpy

# Preserve each original reader union and the original four moved behaviors after room refinement extraction.
SUITES=[]
BREAKS=[]
for filename,label in [
    ('breaks-combat-words.py',"the seat's view keeps the engine's words"),
    ('breaks-decision-facts.py','room omits desk facts'),
    ('breaks-draw-card.py','an answer sent again taken as a new one'),
    ('breaks-table-events.py','a view carrying the change before it too'),
]:
    spec=runpy.run_path('game/tools/batch/'+filename)
    for suite in spec['SUITES']:
        if suite not in SUITES:
            SUITES.append(suite)
    found=[probe for probe in spec['BREAKS'] if probe[0]==label]
    assert len(found)==1
    BREAKS.extend(found)
