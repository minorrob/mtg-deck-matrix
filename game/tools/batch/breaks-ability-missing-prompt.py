# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
# Each mutation must make an actual entry-choice omission incorrectly earn a proof, not merely change a generic fixture.
SUITES = ['tests/ability-missing-prompt.mjs']
BREAKS = [
    ('actual missing prompt cannot earn classifier credit', 'game/tools/ability-proof.mjs',
     'error instanceof Error && !offerOnly', 'error instanceof Error'),
    ('actual missing prompt retains its availability tag', 'game/engine/cards/scenario.mjs',
     'if (!choice) fail("nothing is being asked", {kind: "question-offer"});',
     'if (!choice) fail("nothing is being asked");'),
]
