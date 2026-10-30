# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
import runpy
SUITES = ['tests/engine-load100-mana.mjs', 'tests/engine-tap-to-cast.mjs', 'tests/room-pooled-taps.mjs', 'tests/engine-mana-riders.mjs', 'tests/engine-mana-provenance.mjs']
for suite in runpy.run_path('game/tools/batch/breaks-load100-w0-w5-reanchored.py')['SUITES']:
    if suite not in SUITES:
        SUITES.append(suite)
ACTIONS = 'game/engine/rules/actions.mjs'
BREAKS = [
    ('current output colors cannot use the collapsed solver', ACTIONS,
     'if (state.sourceChoices !== true && (!pooledTaps(state) || (empty && units.every((u) => u.colors.every((c) => MANA_KEYS.includes(c))))))',
     'if (!pooledTaps(state) || (empty && units.every((u) => u.colors.every((c) => MANA_KEYS.includes(c)))))'),
    ('every simple source output is retained', ACTIONS,
     'unit.colors.map(color => [color, {[color]: 1}])',
     'unit.colors.slice(0, 1).map(color => [color, {[color]: 1}])'),
    ('current quick and search patterns deduplicate by output', ACTIONS,
     'state.sourceChoices === true ? pattern(w) !== quickPattern : w.key !== quick.key',
     'state.sourceChoices === true ? true : w.key !== quick.key'),
    ('historical funding keys retain their old tape contract', ACTIONS,
     'state.sourceChoices === true ? pattern(w) !== quickPattern : w.key !== quick.key',
     'pattern(w) !== pattern(quick)'),
    ('payment choices name the mana actually produced', ACTIONS,
     'option.label = `${option.label}: make ${manaMadeWords(made)}; ${paymentWords(plan.payment)}`;',
     'option.label = `${option.label}: ${paymentWords(plan.payment)}`;'),
    ('identity stages name their output color', ACTIONS,
     'title: `${name}: which sources make ${identity.choice.outputLabel}`',
     'title: `${name}: which sources to tap for mana`'),
]
