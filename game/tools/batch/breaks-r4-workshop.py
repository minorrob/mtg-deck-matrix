# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""Define the Deck rejects invalid drafts at the field before any save."""
SUITES = ['tests/new-deck-flow.mjs']
BREAKS = [
    ('blank deck name accepted', 'crankmagic-newdeck.js',
     "if(!F.name)x.missing.push({section:'General',field:'name',says:'Name the deck.'});", ''),
    ('invalid field never focused', 'crankmagic-newdeck.js',
     "d.querySelector('[aria-invalid=true]')?.focus();", ''),
]
