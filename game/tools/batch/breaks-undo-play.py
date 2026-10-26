# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""A private undo snapshot is offered only while it can put back exactly the same safe play."""
SUITES = ['tests/room-undo-play.mjs']
BREAKS = [
 ('information exposure ignored', 'game/engine/rules/undo-play.mjs',
  'if (!SAFE_EVENTS.has(event.kind)) play.valid = false;', ''),
 ('random outcome ignored', 'game/engine/rules/undo-play.mjs',
  'hashState(rng) !== hashState(play.rng) || ', ''),
 ('snapshot integrity ignored', 'game/engine/rules/undo-play.mjs',
  ' || hashState(play.before) !== play.beforeHash', ''),
 ('undo not saved', 'game/room/room.mjs',
  'playBack = undoLastPlay && record.playBack === true ? JSON.parse(await storage.get(PLAY_KEY) || "null") : null;',
  'playBack = null;'),
 ('mana taps not restored', 'game/engine/rules/undo-play.mjs',
  'while (run) run = untapTaken(before, run, run.takes[run.takes.length - 1].objectId).run;', ''),
 ('room skips undo window', 'game/room/room.mjs',
  '      const actions = legalActions(state, seat);',
  '      if (playBack?.autoPass) {apply(seat, {kind: "pass"}, "cast"); continue;}\n      const actions = legalActions(state, seat);'),
]
