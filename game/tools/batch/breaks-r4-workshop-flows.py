"""Workshop transaction, account-race and table-setup guards must catch broken behavior."""
SUITES = ['tests/table-setup.mjs', 'tests/lock-feedback.mjs', 'tests/admin-ui.mjs']
BREAKS = [
    ('AI decks before configured rules', 'crankmagic-table.js',
     "try{await api('POST',`${tableUrl(table.tableId)}/rules`,{startingLife:Number(v.startingLife),bracketLimit:v.bracketLimit?Number(v.bracketLimit):null});}",
     "try{await autoDeckAI(table);await api('POST',`${tableUrl(table.tableId)}/rules`,{startingLife:Number(v.startingLife),bracketLimit:v.bracketLimit?Number(v.bracketLimit):null});}"),
    ('unsupported precon assigned', 'crankmagic-table.js',
     "candidates=lists.filter(d=>[...d.commander,...d.cards].every(name=>!unknown.has(name)));", "candidates=lists;"),
    ('repeat setup creates another table', 'crankmagic-table.js',
     "if(creatingTables.has(form))return;", ""),
    ('Leave forgets resumable seat', 'crankmagic-table.js',
     "const id=el.dataset.table;C.board?.close();actions.close();", "const id=el.dataset.table;C.board?.close();keepSeat(null);actions.close();"),
    ('stale toast undoes a later change', 'crankmagic-app.js',
     "run:()=>actions.undo({expectedRevision})", "run:()=>actions.undo()"),
    ('repeated lock checks race', 'crankmagic-decks.js',
     "if(el.getAttribute('aria-busy')==='true')return;", ""),
    ('old Admin response wins after return', 'crankmagic-admin.js',
     "active=()=>render===generation&&C.route().view==='admin'", "active=()=>C.route().view==='admin'"),
]
