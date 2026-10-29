# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
SUITES = ['tests/library-engine-pool.mjs']
BREAKS = [
    ('least-played names enter loading lanes', 'tools/library-engine-pool.mjs',
     'return (name) => names.has(canonicalName(name));', 'return (name) => true;'),
    ('exempt names enter promotion review', 'tools/library-engine-pool.mjs',
     'scope.cards.filter((c) => !c.exempt).map((c) => c.name)', 'scope.cards.map((c) => c.name)'),
    ('front-name aliases lose their included card identity', 'tools/library-engine-pool.mjs',
     'names.has(canonicalName(name))', 'names.has(name)'),
    ('a different popularity cutoff is accepted', 'tools/library-engine-pool.mjs',
     'scope.share !== 0.95 || ', ''),
]
