# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
SUITES = ['tests/board-coach-context.mjs']
BREAKS = [
 ('pending composer erases an unaccepted draft', 'crankmagic-board.js', '    if(!canAsk(q))return;\n    input.value = ""; ask_(q);', '    input.value = ""; ask_(q);'),
 ('old same-key capability response overwrites the current gate', 'crankmagic-board.js', 'if(coachGate!==gate || coachKey()!==key)return;\n      gate.available=result?.open===true;', 'if(coachKey()!==key)return;\n      coachGate.available=result?.open===true;'),
 ('old same-key capability rejection disables the current gate', 'crankmagic-board.js', 'if(coachGate===gate && coachKey()===key){gate.available=false;', 'if(coachKey()===key){coachGate.available=false;'),
]
