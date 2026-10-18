# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
# Run with: python game/tools/batch/breaks.py game/tools/batch/breaks-card-status.py
# The card status Rob approved on 2026-10-18 (docs/card-states.md): Use, Ownership and Play from one cardState; the
# Library scoped to a deck lists The hundred's records and no Bench; Reserve turns the card it replaces into the
# Substitute holding its seat, an Upgrade changes nothing; a Reserved card put in brings its substitute out.
# card-states runs first, in Node, so the model's breaks are caught in seconds; the browser suites catch the screens'.
SUITES = ['tests/card-states.mjs', 'tests/card-states-screens.mjs', 'tests/card-status-flows.mjs']
MODEL, LIB, DECKS = 'collection-model.js', 'crankmagic-collection.js', 'crankmagic-decks.js'
BREAKS = [
    ("the list's own card in its box is not Final", MODEL,
     "if(a&&a.deckId===loc.deckId&&purpose==='main')return st('final'",
     "if(false&&a&&a.deckId===loc.deckId&&purpose==='main')return st('final'"),
    ("Reserve leaves the replaced card free instead of standing in", MODEL,
     "for(const l of released){if(c.substitute&&",
     "for(const l of released){if(false&&c.substitute&&"),
    ("a copy claimed from another deck is not that deck's Reserved card", MODEL,
     "if(perspective&&a&&a.deckId===perspective)return seat(a.deckId,a.slotId,'own',{from:loc.deckId});",
     ""),
    ("the deck total counts what is loading", MODEL,
     "deckTotal=final+substitute,locked=",
     "deckTotal=final+substitute+loading,locked="),
    ("the Library scoped to a deck adds every Bench copy again", LIB,
     "((opts.bench||benchToo)&&r.kind==='lot'",
     "((true)&&r.kind==='lot'"),
    ("putting a Reserved card in leaves its substitute in the box", LIB,
     "...(sub?[{type:'place',lotId:sub.id,quantity:sub.quantity,confirmed:true}]:[])];",
     "];"),
    ("an offered copy's Ownership reads Own, not the automatic To sell", LIB,
     "const auto=r.kind==='lot'&&r.source==='owned'&&(r.offer||'none')!=='none';",
     "const auto=false;"),
    ("The hundred lists Upgrades under Reserved", DECKS,
     "upgrades=ds.rows.filter(x=>x.st.use==='upgrade');",
     "upgrades=[];"),
]
