/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* AN EXTRA TURN (CR 500.7; Forge's AddTurn; Train B, X11): "take an extra turn after this one" (the [-12] Ichormoon
 * Gauntlet gives planeswalkers).
 *
 * `addTurn` adds a turn for each player `who` names (you, unless it says), `count` of them, directly after the current
 * turn: kept in `state.extraTurns` in the order they were created, and taken by rules/turn.mjs as this turn ends -- the
 * most recently created first (500.7), so an extra turn made during an extra turn is taken before those already waiting.
 * Several for one player are added one at a time; several players' in APNAP order (500.7, 101.4), so the last of that
 * order, made last, is taken first.
 *
 * IT IS NOT A CHOICE. Whose turn comes next, and in what order the extra turns are taken, is the rules' (CR 500.7): nobody
 * is asked anything, and the turn simply begins. And it is plain state -- a list of players -- so a game with an extra
 * turn waiting saves, resumes and replays like any other (tests/engine-x11-turns-counters.mjs).
 */

import {event, playersFor} from "./zones.mjs";

/* The players an effect names, in APNAP order from the active player (CR 101.4). */
function apnap(state, players) {
  const seats = state.players.length, from = state.activePlayer ?? 0;
  return [...players].sort((a, b) => ((a - from + seats) % seats) - ((b - from + seats) % seats));
}

export function addTurn(state, params, context) {
  const events = [];
  const count = Number.isInteger(params.count) ? Math.max(0, params.count) : 1;
  for (const player of apnap(state, playersFor(state, params.who ?? "you", context.controller))) {
    for (let n = 0; n < count; n += 1) {
      (state.extraTurns ??= []).push({player, madeOnTurn: state.turn});
      events.push(event("GameEventExtraTurn", state, {player: {playerId: player, name: state.players[player].name}}));
    }
  }
  return events;
}
