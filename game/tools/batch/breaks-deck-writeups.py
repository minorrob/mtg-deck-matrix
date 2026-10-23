# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""The deck write-ups (Decks requirements DPG-1 to DPG-9, 2026-10-23): description and How to play on the deck, Apply deck
write-ups, and the backup builder writing them instead of the Excel notes. Each break must turn a suite red."""
SUITES = ['tests/deck-writeups.mjs', 'tests/live-load.mjs']
BREAKS = [
    ('description limit widened', 'collection-model.js',
     'const DESCRIPTION_MAX=300,', 'const DESCRIPTION_MAX=400,'),
    ('three steps allowed', 'collection-model.js',
     'STEPS_MIN=4,', 'STEPS_MIN=3,'),
    ('a long step allowed', 'collection-model.js',
     'for(const [i,x] of v.entries())ensure(x.length<=STEP_MAX,', 'for(const [i,x] of v.entries())ensure(true||x.length<=STEP_MAX,'),
    ('a stored deck not checked', 'collection-model.js',
     'defaultDefinition(d.definition);writeup(d);', 'defaultDefinition(d.definition);'),
    ('editDeck drops the write-up', 'collection-model.js',
     'd.notes=text(c.notes,5000);Object.assign(d,writeup(c));', 'd.notes=text(c.notes,5000);'),
    ('edited notes cleared too', 'collection-model.js',
     'clear=notes&&!!hashes?.decks?.[id]&&hashes.decks[id]===noteHash?.get(d.id);', 'clear=notes;'),
    ('no match by name', 'collection-model.js',
     'if(named.length===1)d=named[0];else{', 'if(false)d=named[0];else{'),
    ('archived deck written', 'collection-model.js',
     "if(d.archived){unmatched.push({id,name:w.name,why:`${d.name} is archived.`});continue;}", ''),
    ('applied twice', 'collection-model.js',
     "const todo=matched.filter(m=>!m.same||m.clearNotes)", "const todo=matched"),
    ('builder writes the Excel text again', 'tools/build-live-load.mjs',
     "      notes:'',...(written[id]?", "      notes:referenceText(ref),...(written[id]?"),
    ('builder drops the write-ups', 'tools/build-live-load.mjs',
     "...(written[id]?{description:written[id].description,howToPlay:[...written[id].howToPlay]}:{}),", ''),
    ('state builder drops the write-ups', 'tools/live-load.js',
     "...(d.description!==undefined?{description:d.description}:{}),", ''),
    ('reference hashes of other text', 'tools/build-live-load.mjs',
     "return [d.id,sha(referenceNotes(d.id,ref,describedUnder))];", "return [d.id,sha(referenceNotes(d.id,ref,describedUnder).toLowerCase())];"),
    ('a deck of another commander written over', 'collection-model.js',
     "if(Array.isArray(w.commanders)&&w.commanders.length&&", "if(false&&"),
]
