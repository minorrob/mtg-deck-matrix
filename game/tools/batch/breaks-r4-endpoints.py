# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
SUITES = ['tests/board-r4-caption-fit.mjs', 'tests/board-r4-folded-slot.mjs']
BREAKS = [
 ('game HUD caption falls below scaled floor', 'crankmagic-stage.css', '.cm-stage-priority,#matrix-v2 .cm-board .cm-board-turn{font-size:calc(var(--text-hud-caption)*var(--hud-scale,1))', '.cm-stage-priority,#matrix-v2 .cm-board .cm-board-turn{font-size:calc(10px*var(--hud-scale,1))'),
 ('enlarged phase strip exceeds its real group', 'crankmagic-stage.css', '.cm-stage-top .cm-board-ribbon li{padding-left:3px;padding-right:3px}', '.cm-stage-top .cm-board-ribbon li{padding-left:16px;padding-right:16px}'),
 ('light phone chrome inherits mat-white ink', 'crankmagic-stage.css', '.cm-phone-pill,#matrix-v2 .cm-board[data-phone] .cm-phone-icon{background:var(--color-panel);color:var(--color-ink);', '.cm-phone-pill,#matrix-v2 .cm-board[data-phone] .cm-phone-icon{background:var(--color-panel);color:var(--mat-ink);'),
 ('folded phone decision falls behind its Boards sheet', 'crankmagic-stage.css', '.cm-phone-ask:has(.cm-decision-slot:not([hidden])){position:relative;z-index:32}', '.cm-phone-ask:has(.cm-decision-slot:not([hidden])){position:relative;z-index:0}'),
]
