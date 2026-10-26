# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
SUITES = ['tests/board-coach-context.mjs','tests/board-r4-views.mjs']
BREAKS = [
 ('Coach accepts a stale account/table/match reply', 'crankmagic-board.js', 'if(JSON.stringify([coachKey(),view?.matchId])!==requestKey)', 'if(false)'),
 ('Coach ignores availability', 'crankmagic-board.js', 'available:coachGate.available,thread:', 'available:true,thread:'),
 ('Coach rebuilds actual textarea', 'crankmagic-board.js', 'replacement.replaceWith(input);', 'replacement.value=input.value;'),
 ('Other seats renders full mats instead of compact counts', 'crankmagic-board.js', '${controlledCards(x.playerId).length} permanents', '${mat(x)}${controlledCards(x.playerId).length} permanents'),
]
