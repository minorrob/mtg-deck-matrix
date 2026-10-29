# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""ROB-205: Rob's explicit reversible-action/mandatory-effect boundary, on actual engine and room flows."""
SUITES = ['tests/engine-cancel-decision.mjs', 'tests/room-cancel-decision.mjs']
C = 'game/engine/rules/cancel.mjs'
T = 'game/engine/rules/turn.mjs'
R = 'game/room/room.mjs'
BREAKS = [
    ('ordinary actions never capture their reversible proposal', 'game/engine/rules/actions.mjs',
     'const proposal = beforeProposal(state, player, action);', 'const proposal = null;'),
    ('proposal prefix ignores silent state mutations', C,
     'facts(state) === proposal.hash', 'true'),
    ('proposal prefix ignores committed information events', C,
     'events.length === 0', 'true'),
    ('cancel ignores mutations after the proposal was saved', C,
     'facts(state) === p.hash', 'true'),
    ('invalidated continuation keeps an old cancellation proof', C,
     '  else if (state.awaiting?.precommit) delete state.awaiting.precommit;\n', ''),
    ('Cancel does not abandon the actual action', T,
     'if (cancel.kind === "abandon-action") return abandonProposal(state);', ''),
    ('Cancel never restores the actor priority', C,
     'state.priorityPlayer = p.priorityPlayer;', 'state.priorityPlayer = null;'),
    ('Cancel loses the original pass count', C,
     'state.passes = p.passes;', 'state.passes = 0;'),
    ('numeric stage loses the original multi-stage proposal proof', T,
     'return retainProposal(state, awaiting.precommit, resolveChooseTargets(state, awaiting, indices));',
     'return retainProposal(state, null, resolveChooseTargets(state, awaiting, indices));'),
    ('later payment stage loses the original proposal proof', T,
     'return retainProposal(state, awaiting.precommit, resolveCastCost(state, awaiting, indices, amounts));',
     'return retainProposal(state, null, resolveCastCost(state, awaiting, indices, amounts));'),
    ('old optional target proposal commits instead of refusing Cancel', C,
     'if (proposalChoice(state)) return {...base, allowed: false,', 'if (false) return {...base, allowed: false,'),
    ('mandatory Cancel proceeds as an unvalidated answer', T,
     'if (!cancel.allowed) throw new Error(cancel.reason);', ''),
    ('Cancel does not expose its server permission to controllers', T,
     'return choice ? {...choice, cancellation: cancellationFor(state, choice)} : choice;', 'return choice;'),
    ('controller refuses the explicit server-authorized Cancel', 'game/engine/controller.mjs',
     'choice.cancellation?.allowed !== true && choice.maySkip !== true', 'choice.maySkip !== true'),
    ('numeric Cancel incorrectly requires payment amounts', 'game/engine/controller.mjs',
     '(pending.mode !== "text" && pending.cancellation?.allowed !== true)', '(pending.mode !== "text")'),
    ('abandoned cast still auto-passes the actor through the phase', R,
     'if (cancelledProposal) {castBy = null; heldBy = null; playBack = null;}', ''),
]
