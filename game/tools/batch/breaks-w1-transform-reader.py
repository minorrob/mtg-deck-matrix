# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
SUITES = ['tests/engine-transform.mjs']
PERMANENTS = 'game/engine/script/effects/permanents.mjs'
BREAKS = [
    ('token copying loses both faces', PERMANENTS, 'function copiedTokenFaces(original, except) {\n', 'function copiedTokenFaces(original, except) {\n  return {};\n'),
    ('single-faced tokens gain invented other faces', PERMANENTS,
     '  if (!original.mdfc || original.merged || original.faceDown === true) return {};',
     '  if (!original.mdfc) return {mdfc: {front: copiable(original, except), back: copiable(original, except), transforming: true}};\n  if (original.merged || original.faceDown === true) return {};'),
    ('single-faced back copy uses original mana cost', 'game/engine/state/index.mjs', '  return object.manaCost ?? null;', '  return object.uncopied?.manaCost ?? object.manaCost ?? null;'),
]
