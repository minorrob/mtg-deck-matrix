# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
SUITES = ['tests/board-account-keyboard.mjs','tests/board-seat-lifecycle.mjs','tests/board-coach-context.mjs','tests/board-r4-views.mjs']
BREAKS = [
 ('account menu permits board hotkeys', 'crankmagic-board.js', "    if(C.accountMenuOpen?.() || document.querySelector('#cm-user-menu:popover-open'))return;", ''),
 ('seat lifecycle disappears', 'crankmagic-board.js', "if(departed(i) || p.health.status==='lost' || away.get(i))return flag;", 'if(false)return flag;'),
 ('Coach accepts a stale account/table/match reply', 'crankmagic-board.js', 'if(JSON.stringify([coachKey(),view?.matchId])!==requestKey)', 'if(false)'),
 ('Coach ignores availability', 'crankmagic-board.js', 'available:coachGate.available,thread:', 'available:true,thread:'),
 ('Coach rebuilds actual textarea', 'crankmagic-board.js', 'replacement.replaceWith(input);', 'replacement.value=input.value;'),
 ('Other seats renders full mats instead of compact counts', 'crankmagic-board.js', '${controlledCards(x.playerId).length} permanents', '${mat(x)}${controlledCards(x.playerId).length} permanents'),
 ('Settings Coach handoff runs before dialog restoration', 'crankmagic-board.js', 'if(leaving&&!leaving.closed)leaving.afterClose=arm;else arm();', 'arm();'),
 ('same-control pointer intent leaves late Coach focus armed', 'crankmagic-board.js', "if(coachFocusRequest?.armed&&!event.target.closest?.('#cm-board-coach'))coachFocusRequest=null;", ''),
]
