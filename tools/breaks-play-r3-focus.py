# The contrast test must follow a tapped card's actual rotated outline.
SUITES = ['tests/a11y-board.mjs']
BREAKS = [
    ('a tapped card loses its keyboard focus ring', 'crankmagic-stage.css',
     '[data-card-section]>.cm-bcard.is-tapped{transform:rotate(30deg)}',
     '[data-card-section]>.cm-bcard.is-tapped{transform:rotate(30deg)}\n#matrix-v2 .cm-board [data-card-section]>.cm-bcard.is-tapped:focus-visible{outline:none!important;box-shadow:none!important}'),
]
