# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""CH-56's facts must describe the actual legal question, without changing it."""
SUITES = ['tests/engine-decision-facts.mjs']
BREAKS = [
 ('counted targets lose controllers', 'game/engine/script/bind.mjs',
  '...targetFacts(state, c, effectForTarget(effects, targetIndex))', '{}'),
 ('effect group index ignored', 'game/engine/script/decision.mjs',
  'const effect = effectForTarget(effects, index);', 'const effect = effectForTarget(effects, 0);'),
 ('mandatory modes gain decline', 'game/room/decision.mjs',
  'const may = awaiting?.optional === true || (awaiting?.effect === "modal" && awaiting.choose === 1 && awaiting.modes.some(m => !(m.effects ?? []).length));',
  'const may = true;'),
 ('room omits desk facts', 'game/room/room.mjs',
  'describeDecision(state, combatWords(state, structuredClone(controller.pending)), pendingActions)',
  'combatWords(state, structuredClone(controller.pending))'),
]
