# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
SUITES = ['tests/board-r4-views.mjs']
BREAKS = [
 ('Coach ignores availability', 'crankmagic-board.js', 'available:coachGate.available,thread:', 'available:true,thread:'),
 ('Coach rebuilds actual textarea', 'crankmagic-board.js', 'replacement.replaceWith(input);', 'replacement.value=input.value;'),
 ('Other seats leaks card faces', 'crankmagic-board.js', '${controlledCards(x.playerId).length} permanents', '${mat(x)}${controlledCards(x.playerId).length} permanents'),
]
