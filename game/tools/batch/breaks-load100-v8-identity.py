# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""Independent printed identity and whole-face fidelity checks; original compiler readers retained."""
import runpy
SUITES = [
    'tests/card-oracle-defense.mjs', 'tests/card-face-fidelity.mjs', 'tests/engine-smoke-artifacts.mjs', 'tests/card-check-cli.mjs',
    'tests/engine-cards.mjs', 'tests/engine-compile.mjs', 'tests/card-compiler.mjs',
    'tests/engine-adventure.mjs', 'tests/engine-class.mjs', 'tests/engine-learned.mjs',
    'tests/engine-battles.mjs', 'tests/engine-enter-copy.mjs', 'tests/engine-event-triggers.mjs',
    'tests/engine-ingest.mjs', 'tests/engine-phasing.mjs', 'tests/engine-transform.mjs',
    'tests/engine-x11-costs.mjs', 'tests/engine-x11-counts-triggers.mjs', 'tests/load100-w7-compiler.mjs',
]
funding = runpy.run_path('game/tools/batch/breaks-load100-w0-w5-disjoint.py')
SUITES = list(dict.fromkeys(['tests/card-oracle-defense.mjs', 'tests/card-face-fidelity.mjs',
    'tests/engine-smoke-artifacts.mjs', 'tests/engine-x11-costs.mjs', 'tests/engine-load100-mana.mjs',
    *SUITES, *funding['SUITES']]))
# Keep both expensive whole-directory readers, after the native readers so a baseline failure is located sooner.
SUITES = [suite for suite in SUITES if suite not in ['tests/engine-cards.mjs', 'tests/engine-compile.mjs']] + [
    'tests/engine-cards.mjs', 'tests/engine-compile.mjs']
ORACLE = 'game/tools/oracle-defense.mjs'
COMPILE = 'game/engine/cards/compile.mjs'
BREAKS = [
    ('completed source funding reopens before the exile cost', 'game/engine/rules/actions.mjs',
     '\n    && (state.sourceChoices !== true || fundingChoiceNeeded(state, player, action))', ''),
    ('a longer sentence claims a distinct shorter prefix', COMPILE,
     'return !claimedClauses.has(c) && !covered(c);', 'return !texts.some((t) => t && t.includes(c)) && !covered(c);'),
    ('artifact smoke chooses an ineligible sorcery target', COMPILE,
     ': wants((o) => (o.types ?? []).includes("Artifact")) ? "Smoke Artifact Spell"', ': wants((o) => (o.types ?? []).includes("Artifact")) ? "Smoke Sorcery"'),
    ('the artifact smoke target is not an artifact', COMPILE,
     '"Smoke Artifact Spell": {types: ["Artifact"], manaCost: "{0}"}', '"Smoke Artifact Spell": {types: ["Enchantment"], manaCost: "{0}"}'),
    ('another positive defense is accepted', ORACLE, 'if (actual !== expected) problems.push(', 'if (false) problems.push('),
    ('missing committed Oracle is accepted', ORACLE, '  if (!oracle) return [`${name}: no committed Oracle identity`];\n', '  if (!oracle) return [];\n'),
    ('a whole card outer number replaces its front', ORACLE, 'const front = hasFaces ? oracle.faces[0] : oracle;', 'const front = oracle;'),
    ('back printed defense is not compared', ORACLE,
     'if (hasFaces || script?.back || script?.adventure || script?.prepare)', 'if (false)'),
    ('zero is treated as no printed characteristic', ORACLE, 'if (printed != null) {', 'if (printed) {'),
    ('negative Oracle defense is accepted', ORACLE,
     'if (!Number.isSafeInteger(expected) || expected < 0)', 'if (!Number.isSafeInteger(expected))'),
    ('checker omits independent printed identity', 'game/tools/batch/check-cards.mjs',
     'const defense = oracleDefenseProblems(script, oracle.get(name));', 'const defense = [];'),
    ('back face is skipped', COMPILE,
     '[script.back, script.adventure, script.prepare]', '[script.adventure, script.prepare]'),
    ('Adventure face is skipped', COMPILE,
     '[script.back, script.adventure, script.prepare]', '[script.back, script.prepare]'),
    ('prepare face is skipped', COMPILE,
     '[script.back, script.adventure, script.prepare]', '[script.back, script.adventure]'),
    ('only the front determines whole card success', COMPILE,
     'ok: own.ok && faces.every(face => face.ok)', 'ok: own.ok'),
    ('invented back text is hidden', COMPILE,
     '...faces.flatMap(face => face.invented)', '...[]'),
    ('all transform reminder names are ignored', COMPILE,
     'line.trim() !== reminder', '!/^\\(Transforms from .+\\.\\)$/.test(line.trim())'),
    ('unparenthesized transform text is ignored', COMPILE,
     'line.trim() !== reminder', 'line.trim() !== reminder && line.trim() !== reminder.slice(1, -1)'),
    ('modal backs can hide transform text', COMPILE,
     'face === script.back && script.layout === "transform"', 'face === script.back'),
]
BREAKS += [change for change in funding['BREAKS'] if change[0] == 'nonmana tappers precede mana choices']
