# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
SUITES = ['tests/card-check-cli.mjs', 'tests/ability-proof.mjs']
CHECK = 'game/tools/batch/check-cards.mjs'
POLICY = 'game/tools/card-check-policy.mjs'
BREAKS = [
    ('no ledger still passes', CHECK, '  if (!ledger) return 1;\n', ''),
    ('default omits runtime removal', CHECK, 'cards: index.definition, ledger, counterfactual: true,', 'cards: index.definition, ledger, counterfactual: false,'),
    ('unknown options are ignored', POLICY, 'throw new Error(`Unknown card-check option: ${flag}`);', 'continue;'),
    ('custom or selected ledgers pass canonical gate', POLICY,
     'ledger.scope?.directory !== true || ledger.scope?.canonical !== true || ledger.scope?.selected', 'false'),
    ('incomplete measurement is accepted', POLICY, 'measurement?.complete !== true || ', ''),
    ('failed scenarios and definitions are ignored', POLICY, 'measurement?.problems !== 0 || measurement?.failed !== 0', 'false'),
    ('stale source revision is accepted', POLICY, ' || ledger.source?.revision !== source.revision', ''),
    ('raw unreached behavior passes', POLICY,
     '    if (!summary.scenarioComplete) problems.push(`${summary.abilities - summary.scenarioReached} abilities have no passing-scenario behavior proof`);\n', ''),
    ('missing scenarios pass zero ability cards', CHECK,
     '    if (!files.some(file => file.card === name && file.scenarios.length)) {problems += 1; console.log("MISSING SCENARIOS", name);}\n', ''),
    ('Actions ability step can be nonfatal', '.github/workflows/tests.yml',
     '      - name: Prove every final card ability\n', '      - name: Prove every final card ability\n        continue-on-error: true\n'),
    ('verifier executable ignores rejected evidence', 'game/tools/batch/verify-card-ledger.mjs',
     'if (problems.length) process.exitCode = 1;', 'if (false) process.exitCode = 1;'),
    ('legacy source choice is current evidence', POLICY,
     '  if (files.some(file => file.scenarios.some(scenario => scenario.sourceChoices === false)))\n    problems.push("Legacy source-choice scenarios cannot supply the current canonical gate");\n', ''),
]
