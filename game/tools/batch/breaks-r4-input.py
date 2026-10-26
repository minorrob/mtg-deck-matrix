# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
SUITES = ['tests/board-offer-context.mjs', 'tests/board-r4-input.mjs']
BREAKS = [
 ('untap ignores revision', 'crankmagic-board.js', "Number(data.revision)!==view.revision", 'false'),
 ('untap ignores physical card', 'crankmagic-board.js', "o.cardId===Number(data.card) && ", ''),
 ('native second click has no activation', 'crankmagic-board.js', "if(event?.detail>=2) {", "if(false) {"),
 ('Undo drawer always visible', 'crankmagic-stage.css', 'opacity:0;clip-path:inset(100% 0 0)', 'opacity:1;clip-path:inset(0)'),
]
