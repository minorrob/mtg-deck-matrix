# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
import runpy
# Preserve the original seventeen payment readers, then exercise the affected resolving-play callers.
SUITES = ['tests/engine-effect-play-refresh.mjs'] + list(runpy.run_path('game/tools/batch/breaks-load100-w0-w5-payload-kinds.py')['SUITES'])
for suite in ['tests/engine-pay-mana-play.mjs', 'tests/engine-free-cast.mjs', 'tests/engine-discover.mjs',
              'tests/engine-roblists-p1.mjs', 'tests/engine-cast-stages.mjs', 'tests/room-cast-stages.mjs']:
    if suite not in SUITES:
        SUITES.append(suite)
ASKING = 'game/engine/script/effects/asking.mjs'
BREAKS = [
    ('live variants must be rederived rather than filtered from cached indices', ASKING,
     'const choices = playable(state, awaiting.player, pool, {...origin.terms, lands: awaiting.lands === true,\n    most: origin?.most ?? Infinity});',
     'const choices = structuredClone(awaiting.choices);'),
    ('live variant changes advance the native question generation', ASKING,
     '(awaiting.playGeneration ?? 0) + (changed ? 1 : 0)', '(awaiting.playGeneration ?? 0)'),
    ('stale variant indices refuse before native casting mutations', ASKING,
     'live.changed || (live.generation > 0 || extra.choiceId !== undefined) && extra.choiceId !== live.choiceId',
     '(live.generation > 0 || extra.choiceId !== undefined) && extra.choiceId !== live.choiceId'),
    ('old generation identifiers cannot answer a refreshed question', ASKING,
     'live.changed || (live.generation > 0 || extra.choiceId !== undefined) && extra.choiceId !== live.choiceId',
     'live.changed || live.generation > 0 && extra.choiceId === undefined'),
    ('untagged old indices cannot answer after authoritative reindex', ASKING,
     '(live.generation > 0 || extra.choiceId !== undefined) && extra.choiceId !== live.choiceId',
     'extra.choiceId !== undefined && extra.choiceId !== live.choiceId'),
    ('authoritative refresh saves the live native variants', ASKING,
     'state.awaiting.choices = structuredClone(derived.choices);', ''),
    ('the resolving mana-value limit survives refresh', ASKING,
     'most: origin?.most ?? Infinity});', 'most: Infinity});'),
    ('projection cannot edit the authoritative native question', ASKING,
     'const live = deriveEffectPlay(state, awaiting), choices = live?.choices ?? awaiting.choices;',
     'refreshEffectPlay(state); const live = deriveEffectPlay(state, awaiting), choices = live?.choices ?? awaiting.choices;'),
    ('counted-target children cannot reopen the original casting permission', ASKING,
     '|| awaiting.funding || awaiting.targeting || awaiting.planning || awaiting.paying || awaiting.playLocked',
     '|| awaiting.funding || awaiting.planning || awaiting.paying'),
    ('explicit refresh publishes a generation-bound question identifier', ASKING,
     'state.awaiting.playGeneration = derived.generation;', ''),
    ('the explicit native epoch is persisted in current state', 'game/engine/state/index.mjs',
     '...(pod?.effectPlayVersion === 1 ? {effectPlayVersion: 1} : {}),', ''),
    ('unsupported native epochs cannot opt out of the current contract', 'game/engine/state/index.mjs',
     '  if (pod.effectPlayVersion !== undefined && pod.effectPlayVersion !== 1) throw new Error("Unsupported native effect-play version");', ''),
    ('canonical scenarios force the current play epoch', 'game/engine/cards/scenario.mjs',
     '    effectPlayVersion: 1,', ''),
    ('source identities do not imply the native play epoch for historical games', ASKING,
     'if (state.effectPlayVersion === 1) {', 'if (state.sourceChoices === true) {'),
    ('the current fuzz pod records the play epoch', 'tools/fuzz-live.mjs',
     'pilotProvocation: true, effectPlayVersion: 1, xTaps: true,', 'pilotProvocation: true, xTaps: true,'),
    ('live origin selectors retain the original source LKI', ASKING,
     'context: structuredClone(context)} : {})}});', 'context: {...structuredClone(context), lastKnown: null}} : {})}});'),
]
original_fuzz = runpy.run_path('game/tools/batch/breaks-x-taps.py')
for suite in original_fuzz['SUITES']:
    if suite not in SUITES:
        SUITES.append(suite)
SUITES.remove('tests/game-leave.mjs')
SUITES.insert(1, 'tests/game-leave.mjs')
BREAKS += [entry for entry in original_fuzz['BREAKS'] if entry[0] == 'the G1 harness launching its games otherwise than the table']
