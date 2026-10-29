# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""Prove the new appearance cutoff and final-only scope accounting can fail."""
SUITES = ['tests/engine-load-scope.mjs']
BREAKS = [
    ('stop at the old eighty percent', 'tools/card-load-scope.mjs',
     'topCards({graph, played, share: 0.95})', 'topCards({graph, played, share: 0.8})'),
    ('count undefined cards as final', 'tools/card-load-scope.mjs',
     'required.filter((c) => !definition(c.name))', 'required.filter((c) => false)'),
]
