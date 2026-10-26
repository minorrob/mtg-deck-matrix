# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
SUITES = ['tests/board-r4-decisions.mjs']
BREAKS = [
 ('phone drawer covers binding action', 'crankmagic-stage.css', 'inset:auto 0 50px;width:100%;height:auto;max-height:55dvh', 'inset:auto 0 0;width:100%;height:auto;max-height:55dvh'),
 ('Next commits before C02', 'crankmagic-board.js', 'targetReviewing=true;draw();', 'targetReviewing=true;send({indices:[...picked]});draw();'),

 ('controller zero treated as absent', 'crankmagic-board.js', 'stack[0].controllerId ?? stack[0].targetGroups', 'stack[0].controllerId || stack[0].targetGroups'),
 ('decline binds destructive choice', 'crankmagic-board.js', 'picked=[o.index];draftRevision=view.revision;', 'picked=[0];draftRevision=view.revision;'),
 ('stale direct action binds', 'crankmagic-board.js', 'Number(el.dataset.revision)!==view.revision || ', ''),
 ('target stack cannot cycle', 'crankmagic-board.js', '((targetCycles.get(key)||0)+1)%Number(el.dataset.count)', '((targetCycles.get(key)||0)+0)%Number(el.dataset.count)'),
 ('unreadable actual primary', 'crankmagic-stage.css', '.cm-stage-actions .v-button.primary{color:var(--color-on-accent);background:var(--color-accent)}', '.cm-stage-actions .v-button.primary{color:#000;background:var(--color-accent)}'),
]
