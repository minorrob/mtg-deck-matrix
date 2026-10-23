# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""The new deck flow on screen (Decks requirements Part B, 2026-10-23): Start from, Define the Deck, the review and the
refusal's way out. Each break must turn the browser suite red. Needs Playwright and Chromium."""
SUITES = ['tests/new-deck-flow.mjs']
BREAKS = [
    ('no shell when Start from opens', 'crankmagic-newdeck.js',
     "if(!deckId){deckId='deck:'+C.uid();await commit({type:'createDeck',deckId,name:'New deck',commanders:[],slots:[]},{renderView:false});}",
     "if(!deckId){deckId='deck:'+C.uid();}"),
    ('Next before a commander', 'crankmagic-newdeck.js',
     "{label:'Next',action:'flow-next',disabled:!F.commander}", "{label:'Next',action:'flow-next',disabled:false}"),
    ('the selection lost on switching', 'crankmagic-newdeck.js',
     "actions['flow-nav']=el=>{if(!F)return;if(F.step==='start')F.method=el.dataset.to;", "actions['flow-nav']=el=>{if(!F)return;if(F.step==='start'){F.method=el.dataset.to;F.commander=null;}"),
    ('colors widen without asking', 'crankmagic-newdeck.js',
     "{colors:p.colorless?[]:p.colors,include:p.include,colorless:p.colorless}", "{colors:p.colorless?[]:p.colors,include:true,colorless:p.colorless}"),
    ('no default name', 'crankmagic-newdeck.js',
     "||`${leads.map(c=>short(c.name)).join(' + ')} deck`;", "||'New deck';"),
    ('Leave undefined waits', 'crankmagic-newdeck.js',
     "{label:'Create deck',action:'flow-create',disabled:!x.mode}", "{label:'Create deck',action:'flow-create',disabled:x.mode!=='define'}"),
    ('missing sections unmarked', 'crankmagic-newdeck.js',
     "SECTIONS.map(([id,l])=>[id,l,marks.get(id)])", "SECTIONS.map(([id,l])=>[id,l])"),
    ('Confirm does nothing', 'crankmagic-newdeck.js',
     "Object.assign(s,{card:a.name,source:a.source,price:a.price,deckId:null});", ""),
    ('Remove does nothing', 'crankmagic-newdeck.js',
     "for(const t of ticks)F.review.removed.add(t);", ""),
    ('seats saved without definitions', 'crankmagic-newdeck.js',
     "...live.map(x=>({cardId:recs.get(x.card).id,quantity:1,seat:{", "...live.map(x=>({cardId:recs.get(x.card).id,quantity:1,unseat:{"),
    ('the refusal has no way out', 'crankmagic-app.js',
     "if(/^Choose a commander first\\.$/.test(err.message)&&actions['start-from']){", "if(false){"),
    ('the phone nav stacks', 'crankmagic.css',
     "  .cm-flow-nav{flex-direction:row;overflow-x:auto;", "  .cm-flow-nav{flex-direction:column;overflow-x:auto;"),
]
