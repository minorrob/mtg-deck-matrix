# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""The Decks page (Decks requirements Part A, 2026-10-23): the nav, the stage chips and badges, favorites, selection and
Bulk actions. Each break must turn the browser suite red. Needs Playwright and Chromium."""
SUITES = ['tests/decks-hub.mjs']
BREAKS = [
    ('Boxed is every Defined deck', 'crankmagic-decks.js',
     "boxed:x=>x.boxed,defined:", "boxed:x=>x.stage==='defined',defined:"),
    ('badge not the furthest stage', 'crankmagic-decks.js',
     "return d.archived?'Archived':x.boxed?'Boxed':x.stage==='defined'?'Defined':'Building';};", "return d.archived?'Archived':x.stage==='defined'?'Defined':'Building';};"),
    ('deck page badge its own', 'crankmagic-decks.js',
     "stageWord=d.archived?'Archived':stageNow.boxed?'Boxed':", "stageWord=d.archived?'Archived':false?'Boxed':"),
    ('favorite star hides without hover', 'crankmagic.css',
     ",.cm-deck-tile .cm-tile-tools>.cm-tile-star.is-on{opacity:1}", "{opacity:1}"),
    ('Favorites shows every deck', 'crankmagic-decks.js',
     "&&(!fav||favs.has(d.id))).sort(", ").sort("),
    ('selection survives a chip change', 'crankmagic-decks.js',
     "if(C.deckPicksView!==viewKey){", "if(false){"),
    ('Compare not greyed at one', 'crankmagic-decks.js',
     "n<2?'Select at least two decks to compare.'", "n<1?'Select at least two decks to compare.'"),
    ('Unfavorite never offered', 'crankmagic-decks.js',
     "item(allFav?'Unfavorite':'Favorite','bulk-favorite')", "item('Favorite','bulk-favorite')"),
    ('Archive not the main button', 'crankmagic-decks.js',
     '<button type="button" class="v-button primary" data-action="bulk-archive">', '<button type="button" class="v-button" data-action="bulk-archive">'),
    ('Box shows the box, not the count', 'crankmagic-decks.js',
     ": <b>${x.count}</b> to box", ": <b>${x.inBoxAfter}</b> to box"),
    ('a deck name in the nav', 'crankmagic-decks.js',
     "{label:'Create',hash:'#new',current:location.hash==='#new'}", "{label:C.state.decks[0]?.name||'Create',hash:'#new',current:location.hash==='#new'}"),
    ('an old address keeps its chip', 'crankmagic-decks.js',
     "const stage=CHIPS.some(([k])=>k===params.get('stage'))?params.get('stage'):'all'", "const stage=params.get('stage')==='complete'?'boxed':CHIPS.some(([k])=>k===params.get('stage'))?params.get('stage'):'all'"),
]
