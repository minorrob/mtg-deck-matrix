"""A post-delete navigation must not overwrite its persistent, transaction-bound Undo receipt."""
SUITES = ['tests/shell-r3.mjs']
BREAKS = [
    ('delete navigation re-emits an ordinary duplicate receipt', 'crankmagic-decks.js',
     "if(location.hash!=='#decks')go('decks');else await C.render();",
     "if(location.hash!=='#decks')go('decks');else{await C.render();C.notice('Deleted a deck.');}"),
]
