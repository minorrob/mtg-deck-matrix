# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
SUITES = ['tests/engine-replacement-steps.mjs']
R = 'game/engine/rules/replacement.mjs'
BREAKS = [
    ('supported step types enforced', R, 'if (!["zone-change", "enters"].includes(proposal.event))', 'if (false)'),
    ('candidate metadata isolated', R, 'ability: structuredClone(candidate.ability), label:', 'ability: candidate.ability, label:'),
    ('chosen live replacement applied', R, 'candidateKey(candidate) === key);\n  if (!candidate) throw new Error("That replacement no longer applies");', 'true);\n  if (!candidate) throw new Error("That replacement no longer applies");'),
    ('replacement actually changes proposal', R, '  return applyOne(state, candidate, proposal);\n}', '  return proposal;\n}'),
]
