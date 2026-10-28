# Loaded art replaces fallback paint without losing the accessible card name or error fallback.
SUITES = ['tests/board-r3-zone-navigation.mjs']
BREAKS = [
    ('phone cannot scroll beyond a zone', 'crankmagic-board.js', "phone.scrollTop+=event.deltaY*unit;", "phone.scrollTop+=0;"),
    ('loaded artwork keeps painting its fallback name', 'crankmagic-board.js',
     "img.dataset.cardLoaded='true';", "img.dataset.cardLoaded='false';"),
]
