"""Breaks for Add cards paste path (ROB-105, O4).

Each break is a real mutation of crankmagic-exchange-ui.js that the add-cards-paste suite
must catch. The suite fails when any of these changes passes undetected.
"""

SUITES = ['tests/add-cards-paste.mjs']

BREAKS = [
    ('accept held cards without checking confidence', 'crankmagic-exchange-ui.js',
     "if(!r.held&&r.card)return {card:C.catalog.get(r.card.name)||r.card,error:''};",
     "return {card:C.catalog.get(r.card.name)||r.card||{name:r.name,id:'fake'},error:''};"),
    ('skip card-resolve.js and accept all names', 'crankmagic-exchange-ui.js',
     'const flavor=await(await fetch',
     'const flavor={cards:[]};if(false){const x=await(await fetch'),
    ('drop error instructions for held cards', 'crankmagic-exchange-ui.js',
     "const inst=r.says||'Could not resolve this card name.';return {card:null,error:inst};",
     "return {card:null,error:''};"),
    ('allow import when cards are unresolved', 'crankmagic-exchange-ui.js',
     '${unresolved.length?\'disabled\':\'\'}',
     ''),
    ('drop the undo action from the success notice', 'crankmagic-exchange-ui.js',
     "C.notice(`Imported ${data.resolved.length} rows. Press Undo to reverse this import.`,false,{action:'undo',label:'Undo'});",
     "C.notice(`Imported ${data.resolved.length} rows.`,false,{undo:false});"),
    ('use network resolver even for pasted text', 'crankmagic-exchange-ui.js',
     "if(!pending.text||pending.text.trim()===''){",
     "if(true){"),
]
