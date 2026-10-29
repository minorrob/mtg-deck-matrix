# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""Actual mana activation, saved replacement choices and simultaneous prevention allocation."""
SUITES = ['tests/engine-outside-damage.mjs', 'tests/engine-rule-operations.mjs']
D = 'game/engine/rules/damage-operation.mjs'
R = 'game/engine/rules/replacement.mjs'
O = 'game/engine/rules/operations.mjs'
A = 'game/engine/rules/actions.mjs'
RES = 'game/engine/script/effects/resources.mjs'
BREAKS = [
 ('mana suffix uses saved effects', A, 'return beginRuleOperation(state,outsideEffectsFrame(ability.then,context,events),{after:{kind:"after-action",player}}).events;', 'events.push(...runEffects(state,ability.then,context)); return events;'),
 ('moving costs precede production', A, 'if (frame.stage === "costs" && frame.costs.length)', 'if (false)'),
 ('moving mana keeps exact provenance', A, 'addProvenance(state, player, produced, action.objectId, sourceWas);', 'addProvenance(state, player, produced, action.objectId);'),
 ('moving mana keeps source attribution', A, 'produced: {...produced}, source: sourceRef ?? cardRef(state, action.objectId),', 'produced: {...produced}, source: cardRef(state, action.objectId),'),
 ('moved Swamp still triggers mana', A, 'manaTriggered(state, events[events.length - 1], sourceWas)', 'manaTriggered(state, events[events.length - 1])'),
 ('mana LKI must match original ID', 'game/engine/rules/trigger.mjs', 'sourceWas?.cardId === tapped && matchesLastKnown(', 'sourceWas && matchesLastKnown('),
 ('damage event keeps live derived controller', RES, ': {...cardRef(state,source),controller:controllerOf(state,source)};', ': cardRef(state,source);'),
 ('live lifelink goes to derived controller', RES, 'changeLife(state, controllerOf(state,source), linked, events);', 'changeLife(state, state.objects[source].controller, linked, events);'),
 ('departed source infect retained', RES, 'was?.keywords?.includes("Infect") === true;', 'false;'),
 ('departed source deathtouch retained', RES, 'if (was?.keywords?.includes("Deathtouch") && state.objects[toCard])', 'if (false)'),
 ('departure refreshes pending LKI', 'game/engine/rules/sba.mjs', '  refreshPendingDamageSources(state);', ''),
 ('damage source filter reads matching LKI', R, 'if (proposal.sourceLastKnown?.cardId !== proposal.sourceId || !matchesLastKnown(watches.source,proposal.sourceLastKnown,context)) return false;', 'return false;'),
 ('redirected damage no longer hits named player', R, 'if (Number.isInteger(watches.toPlayer) && toPlayer !== watches.toPlayer) return false;', ''),
 ('saved replacements remain pure', R, 'const next = applyOne(state, candidate, proposal, true), consumption', 'const next = applyOne(state, candidate, proposal, false), consumption'),
 ('next-use shield consumed at commit', R, 'if (spent.kind === "next") state.effects = (state.effects ?? []).filter(e => e.id !== spent.effect);', ''),
 ('finite shield consumption committed', R, 'ability.prevent = Math.max(0,ability.prevent-spent.amount);', 'ability.prevent = ability.prevent;'),
 ('shared finite shield asks allocation', D, 'if (group.length>1)', 'if (false)'),
 ('simultaneous hits can be modified before shared allocation', D, 'const offers=sharedShieldOffers(state,frame,chooser(state,p));', 'const offers=null;'),
 ('allocation preserves source positions', D, 'preventAmount:answer.amounts[i]', 'preventAmount:answer.amounts[group.length-1-i]'),
 ('allocation total enforced', O, '|| amounts.reduce((sum,n) => sum+n,0) !== choice.total', '|| false'),
 ('allocation whole amounts enforced', O, '!Number.isInteger(n) || n < (choice.minEach ?? 0)', 'false || n < (choice.minEach ?? 0)'),
 ('simultaneous shield counter prevents every hit', R, 'if (!sameBatch && (state.objects[candidate.holderId]?.counters?.shield ?? 0) <= spent)', 'if ((state.objects[candidate.holderId]?.counters?.shield ?? 0) <= spent)'),
 ('saved prefix emitted once', D, 'emitRuleEvents(state,frame.prefix ?? []);delete frame.prefix;', 'delete frame.prefix;'),
 ('nested branch remains resumable', D, 'if (effect.effect === "branch")', 'if (false)'),
 ('nested repeat remains resumable', D, 'if (effect.effect === "repeatFor") return', 'if (false) return'),
 ('remaining effects advance once', D, 'frame.effects[frame.cursor++]', 'frame.effects[frame.cursor]'),
 ('prevention follow-up keeps a real saved caller', D, 'if (followUps.length) return', 'if (false) return'),
]
