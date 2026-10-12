# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""An AI on Claude and the deck advisor, switched on at staging once Rob approved what privacy.html says each sends
(2026-10-12): tools/release-pages.mjs's staging profile, and the policy's two paragraphs.

Run from the repository root, with nothing else editing the worktree:

    python3 game/tools/batch/breaks.py game/tools/batch/breaks-ai-staging-on.py
"""
SUITES = ['tests/release-pages.mjs']
BREAKS = [
    ('staging seats no AI on Claude', 'tools/release-pages.mjs',
     'coachCapCents: 150, pilot: true, pilotGameCents: 25, advise: true},',
     'coachCapCents: 150, advise: true},'),
    ('staging offers no deck advisor', 'tools/release-pages.mjs',
     'coachCapCents: 150, pilot: true, pilotGameCents: 25, advise: true},',
     'coachCapCents: 150, pilot: true, pilotGameCents: 25},'),
    ('each game uncapped', 'tools/release-pages.mjs',
     'pilot: true, pilotGameCents: 25, advise: true},',
     'pilot: true, pilotGameCents: 0, advise: true},'),
    ('the policy says nothing of an AI on Claude', 'privacy.html',
     '<p><strong>AI players on Claude.</strong>',
     '<p><strong>AI players.</strong>'),
    ('the policy says nothing of the advisor', 'privacy.html',
     '<p><strong>The deck advisor.</strong>',
     '<p><strong>Advice.</strong>'),
    ('the policy no longer says what the seat never sends', 'privacy.html',
     "It never sends a\n  person's hand, the order of any library, or anyone's name",
     "It sends a\n  person's hand"),
]
