# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""Native Battle damage and atomic SBA continuations, retaining every inherited reader union."""
import runpy
from pathlib import Path

SUITES = ['tests/engine-battle-damage-sba.mjs', 'tests/engine-sba.mjs', 'tests/engine-lki.mjs',
          'tests/engine-lki-dies.mjs', 'tests/engine-deaths.mjs', 'tests/engine-regenerate.mjs',
          'tests/engine-x11-umbra-armor.mjs', 'tests/engine-exile-until.mjs', 'tests/engine-source-remains.mjs',
          'tests/engine-source-memory.mjs', 'tests/engine-trigger.mjs', 'tests/engine-trigger-targets.mjs',
          'tests/engine-triggers-again.mjs', 'tests/engine-priority.mjs', 'tests/engine-turn.mjs',
          'tests/engine-zone-costs.mjs', 'tests/engine-zone-action-operations.mjs']
R = 'game/engine/script/effects/resources.mjs'
S = 'game/engine/rules/sba.mjs'
L = 'game/engine/rules/sba-move-results.mjs'
Z = 'game/engine/script/effects/zones.mjs'
O = 'game/engine/rules/zone-operation.mjs'
T = 'game/engine/rules/turn.mjs'
TR = 'game/engine/rules/trigger.mjs'

BREAKS = [
 ('Battle damage leaves defense unchanged', R, 'object.counters.defense = Math.max(0, before - amount);', 'object.counters.defense = before;'),
 ('pure Battle receives creature marked damage', R, '  if (types.includes("Battle") && !types.includes("Creature")) return;\n', ''),
 ('Battle excess threshold omitted', R, '  if (types.includes("Battle")) excess = Math.max(excess, amount - (object.counters?.defense ?? 0));\n', ''),
 ('Battle damage prevents other applicable type results', R, '  if (types.includes("Planeswalker")) {\n    const before = object.counters.loyalty', '  if (types.includes("Battle")) return;\n  if (types.includes("Planeswalker")) {\n    const before = object.counters.loyalty'),
 ('zero Siege ignores pending printed triggers', S, '(state.pendingTriggers ?? []).some(trigger => trigger.source?.cardId === id && !state.players[trigger.controller]?.lost)', 'false'),
 ('zero Siege waits for ordinary activations', S, 'entry.kind === "trigger" && entry.cardId === id', 'entry.cardId === id'),
 ('zero Siege waits for another source identity', S, 'entry.kind === "trigger" && entry.cardId === id', 'entry.kind === "trigger"'),
 ('protector repair chooses first opponent silently', S, 'const selected = frame.answer ? frame.options[frame.answer.indices[0]] : undefined;', 'const selected = repair.eligible[0];'),
 ('live non-Siege protector forced to controller', S, '(!siege || protector !== player)', '(siege ? protector !== player : protector === player)'),
 ('cohort bypasses saved replacement preparation', O, '  if (frame.prepareOnly) {\n    const preparedMove = savePreparedSbaMove', '  if (false) {\n    const preparedMove = savePreparedSbaMove'),
 ('cohort ignores frozen departure characteristics', Z, 'const leftBehind = prepared?.leftBehind ?? (from === "battlefield" ? lastKnown(state, id) : undefined);', 'const leftBehind = from === "battlefield" ? lastKnown(state, id) : undefined;'),
 ('cohort ignores its prepared replacement proposal', Z, '  const proposal = preparedProposal ?? applyReplacements(state, {', '  const proposal = applyReplacements(state, {'),
 ('prepared receipts survive successful consumption', L, '  delete operation.sbaPreparedMoves[token];\n', ''),
 ('applied proposals never recheck newly live modifiers', S, 'if (recheck) {\n      const child = reopenSbaPreparation', 'if (false) {\n      const child = reopenSbaPreparation'),
 ('concession loses applied follow-up source memory', S, '  refreshPendingSbaSources(state);\n', ''),
 ('dying replacement source loses frozen power', S, '...(cohort.snapshots[follow.context.source] ? {lastKnown: cohort.snapshots[follow.context.source].leftBehind} : {})', '...{}'),
 ('replacement follow-ups execute before all base moves', Z, 'if (!prepared && destination === proposal.to) events.push(...runFollowUps(state, proposal));', 'if (destination === proposal.to) events.push(...runFollowUps(state, proposal));'),
 ('departure cleanup loses linked return entries', Z, '  return due.map(link => link.exiled).filter(exiled => state.objects[exiled]?.zone === "exile" && !state.players[state.objects[exiled].owner]?.lost);', '  return [];'),
 ('departed controlled siblings retain obsolete records', Z, '  state.effects = (state.effects ?? []).filter(effect => !(effect.rule === "control-returns" && departedIds.includes(effect.affects.ids[0])));\n', ''),
 ('returned watcher sees earlier base deaths', S, '    markSbaTriggerBatch(state, frame, events);\n    collectTriggers(state, events);', '    markSbaTriggerBatch(state, frame, events);'),
 ('outer collection replays already collected cohort', TR, '  events = uncollectedSbaTriggerEvents(state, events);\n', ''),
 ('next cohort restamps a collected prefix', L, 'const fresh = events.filter(event => !matchingSbaTriggerReceipt(state, event));', 'const fresh = events;'),
 ('saved callback clears receipts before final collection', L, '  if (state.ruleOperation) return;\n', ''),
 ('card flag alone suppresses actual triggers', L, '    if (!matched) return true;', '    if (!matched) return !event.sbaTriggerReceipt;'),
 ('native umbra moves a modifier before planning siblings', Z, 'if (deferredMoves) {if (!deferredMoves.includes(pick.aura)) deferredMoves.push(pick.aura);}', 'if (deferredMoves) moveOne(state, pick.aura, "graveyard", events);'),
 ('nested umbra choices skip recursive preflight', S, 'destructionAsks(state,destroyed,frame.answers,{recursive:true})', 'destructionAsks(state,destroyed,frame.answers)'),
 ('native destruction answer uses first semantic key', S, 'const chosen = options[frame.answer.indices[0]];', 'const chosen = options[0];'),
 ('destruction prefix events silently dropped', S, '    frame.prefix.push(...events);\n', ''),
 ('state-based resume grants priority before next check', T, '    collectTriggers(state, outcome.all);\n    const sba = checkStateBasedActions(state);', '    collectTriggers(state, outcome.all);\n    const sba = [];'),
]

# Every original reader is retained, including the complete entry/intrinsic/counter, W4 and zone unions.
for filename in ['breaks-load100-w0-w1-entry-counter-order.py', 'breaks-outside-damage.py', 'breaks-zone-operations.py']:
    original = runpy.run_path(str(Path(__file__).with_name(filename)))
    for suite in original['SUITES']:
        if suite not in SUITES:
            SUITES.append(suite)
    if filename == 'breaks-outside-damage.py':
        keep = {'departure refreshes pending LKI', 'damage source filter reads matching LKI', 'mana LKI must match original ID'}
        BREAKS.extend((f'{filename}: {label}', target, anchor, replacement)
                      for label, target, anchor, replacement in original['BREAKS'] if label in keep)

global_checks = ['tests/engine-cards.mjs', 'tests/generators.mjs']
SUITES = [suite for suite in SUITES if suite not in global_checks] + [suite for suite in global_checks if suite in SUITES]
