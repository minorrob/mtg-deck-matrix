# Sparse phone boards must keep both partner commanders reachable without scrolling the whole mat.
SUITES = ['tests/board-commander-hand.mjs']
BREAKS = [
    ('phone field pushes partners behind the hand', 'crankmagic-stage.css',
     '.cm-phone-battlefield .cm-board-field{height:auto;max-height:clamp(130px,25dvh,220px);min-height:130px}',
     '.cm-phone-battlefield .cm-board-field{height:clamp(180px,38dvh,320px);min-height:0}'),
]
