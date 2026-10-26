# The r4 foundation must fail if a palette, a face, the wordmark, or the first paint drifts.
SUITES = ['tests/design-tokens.mjs', 'tests/feature-wiring.mjs']
BREAKS = [
    ('governing dark ground drifts', 'crankmagic-design.css',
     '--color-bg:#090c12;', '--color-bg:#ffffff;'),
    ('display face falls back to Georgia', 'crankmagic-design.css',
     '--font-display:Cinzel,', '--font-display:Georgia,'),
    ('wordmark loses its Oxanium mark', 'crankmagic-design.css',
     '#matrix-v2 .v-brand{font-family:CrankOxanium,Lato,sans-serif',
     '#matrix-v2 .v-brand{font-family:Lato,sans-serif'),
    ('compatibility entry paints the retired palette', 'crankmagic.html',
     '<div id="matrix-v2" aria-label="CrankMagic" data-palette="sapphire-obsidian"',
     '<div id="matrix-v2" aria-label="CrankMagic" data-palette="moss-iron"'),
]
