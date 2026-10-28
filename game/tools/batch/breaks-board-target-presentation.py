# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
SUITES = ['tests/board-target-presentation.mjs']
BREAKS = [
    ('ability stack id resolves in object namespace', 'crankmagic-board.js',
     't.kind === "ability" ? namedFace(findCard(abilityTarget(t)?.cardId)) : ', ''),
    ('ability id collides with casting source', 'crankmagic-board.js',
     't.kind!=="ability" && (t.affected ?? t.id) === source?.cardId',
     '(t.affected ?? t.id) === source?.cardId'),
]
