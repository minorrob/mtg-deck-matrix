"""The joined native-browser journey must detect cross-screen styling and action regressions."""
SUITES = ['tests/uat/r4-workshop-journey.mjs']
BREAKS = [
    ('Play competes with outstanding acquisition work', 'crankmagic-table.js',
     'b("Play this deck", "deck-play", {deck: d.id}, playPrimary,',
     'b("Play this deck", "deck-play", {deck: d.id}, true,'),
    ('canvas selection wears loop gold', 'crankmagic-graph.js',
     'ctx.fillStyle = P.ink; ctx.beginPath(); ctx.arc(n.x + n.r * .7',
     'ctx.fillStyle = P.loop; ctx.beginPath(); ctx.arc(n.x + n.r * .7'),
    ('graph focus uses the primary action accent', 'crankmagic.css',
     '#matrix-v2 .cm-graph:focus-visible{outline:var(--focus-width) solid var(--color-aether)',
     '#matrix-v2 .cm-graph:focus-visible{outline:var(--focus-width) solid var(--color-accent)'),
    ('valid setup fields wear error strips', 'crankmagic.css',
     '#matrix-v2 :is(.cm-table-field-error,#cm-table-new-error):empty{background:transparent;padding:0;border:0;box-shadow:none}',
     ''),
]
