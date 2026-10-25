# Tiny opponent mats must not shrink the library count below readable text size.
SUITES = ['tests/board-r3-zone-navigation.mjs']
BREAKS = [
    ('compact pile counts lose their readable minimum', 'crankmagic-stage.css',
     '.cm-bcard-count{font-size:max(10px,calc(var(--bc)*.3));',
     '.cm-bcard-count{font-size:calc(var(--bc)*.3);'),
]
