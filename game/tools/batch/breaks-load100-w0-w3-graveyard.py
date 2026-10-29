# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
SUITES = ['tests/engine-play-from-zones.mjs', 'tests/engine-load100-w3-graveyard.mjs', 'tests/engine-may-play.mjs', 'tests/engine-play-from.mjs']
BREAKS = [
    ('permission resource choice retained', 'game/engine/rules/actions.mjs',
     'JSON.stringify([permissionDoes(permission.ability), unlimited(permission.ability) ? null : permission.source])',
     'permissionDoes(permission.ability)'),
    ('unlimited equivalent permissions stay equivalent', 'game/engine/rules/actions.mjs',
     'unlimited(permission.ability) ? null : permission.source', 'permission.source'),
]
