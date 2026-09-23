/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* THE TURN: CR 500 TO 514.
 *
 * `docs/engine/PLAN.md` §3.3, second row. The turn is the clock every other rule reads, and the
 * phase 1 gate — a four-player game runs to completion for 1,000 seeds — rests on it reaching the
 * next player every time. A turn that cannot end is a hang, which is a worse failure than a loss
 * because nothing in the UI can report it.
 *
 * THE PHASE NAMES ARE NOT OURS. `match-telemetry.mjs` tests the phase string against
 * `/DECLARE_ATTACKERS|DECLARE_BLOCKERS/` and renders every other one by lowercasing it;
 * `table-notices.mjs`, the audio rules and every match journal already on disk use the same set.
 * They are Forge's names, and the engine adopts them so that swapping the engine in behind
 * `CRANKMAGIC_ENGINE` does not quietly stop the board's history from reading.
 *
 * WHAT ADVANCE MEANS. `advance` moves to the next step and performs that step's turn-based actions
 * on arrival, which is the order CR 500.2 gives: a step begins, its turn-based actions happen, then
 * the active player receives priority. Callers read the state after it returns.
 *
 * EVENTS ARE RETURNED, NOT WRITTEN. Nothing here holds a journal. The caller writes what it is
 * given, which keeps the rules pure over state, lets a test read the events without a journal, and
 * means a rollback discards the events with the state rather than leaving a record of a turn that
 * did not happen.
 *
 * THREE RULES THAT ARE EASY TO GET WRONG FROM MEMORY:
 *
 *   CR 103.8a is a TWO-PLAYER rule. The player who goes first skips their first draw step in a
 *   two-player game only. In four-player Commander everyone draws on turn one. Applying it to a pod
 *   silently costs the starting seat a card in every single game.
 *
 *   CR 506.5: with no attackers declared, the declare blockers and combat damage steps DO NOT
 *   HAPPEN. Running them anyway looks harmless and is not — every "at the beginning of the declare
 *   blockers step" trigger would fire on a turn nobody attacked.
 *
 *   CR 500.4: mana pools empty at the end of every step and phase, not at end of turn.
 */

import {cardsIn, moveObject} from "../state/index.mjs";

/* The steps of a turn, CR 500.1, in order.
 *
 * `priority` is CR 117.1a: the active player receives priority at the beginning of most steps. Two
 * steps are exceptions — untap (CR 502.3) and cleanup (CR 514.3, which gains priority only if
 * something needs doing; 1.5 adds that once there are state-based actions to trigger it).
 *
 * `when` names a condition rather than hiding one in a branch, so 1.4 fills combat in one place. */
export const STEPS = Object.freeze([
  {phase: "UNTAP", priority: false},
  {phase: "UPKEEP", priority: true},
  {phase: "DRAW", priority: true},
  {phase: "MAIN1", priority: true},
  {phase: "COMBAT_BEGIN", priority: true},
  {phase: "COMBAT_DECLARE_ATTACKERS", priority: true},
  {phase: "COMBAT_DECLARE_BLOCKERS", priority: true, when: "attackers"},
  {phase: "COMBAT_FIRST_STRIKE_DAMAGE", priority: true, when: "firstStrike"},
  {phase: "COMBAT_DAMAGE", priority: true, when: "attackers"},
  {phase: "COMBAT_END", priority: true},
  {phase: "MAIN2", priority: true},
  {phase: "END_OF_TURN", priority: true},
  {phase: "CLEANUP", priority: false},
].map(Object.freeze));

export const PHASE_NAMES = Object.freeze(STEPS.map((s) => s.phase));

/* Whether a conditional step happens at all this turn.
 *
 * Both answer false for now because nothing declares attackers until 1.4. They are written as
 * predicates over state rather than as constants so that 1.4 changes this map and nothing else. */
const CONDITIONS = {
  /* CR 506.5 */
  attackers: (state) => (state.combat?.attacks?.length ?? 0) > 0,
  /* CR 510.4: the first-strike damage step exists only if a creature in combat has first or
     double strike. Until combat exists, it never does. */
  firstStrike: (state) => CONDITIONS.attackers(state) && (state.combat?.firstStrike ?? false) === true,
};

/** The step the game is in, as the name the board already reads. */
export const currentPhase = (state) => state.phase;

/** Whether anyone holds priority in the current step. */
export const hasPriority = (state) => STEPS[state.stepIndex]?.priority === true;

/**
 * The next seat still in the game, walking in seat order from `from`.
 *
 * Returns `from` when nobody else is left, so a one-player game still takes turns rather than
 * looping here forever. A pod with no living player at all would be a bug upstream; it throws.
 */
export function nextLivingPlayer(state, from) {
  const count = state.players.length;
  for (let step = 1; step <= count; step += 1) {
    const at = (from + step) % count;
    if (!state.players[at].lost) return at;
  }
  if (!state.players[from]?.lost) return from;
  throw new Error("Every player has lost; there is no next turn");
}

/* ---- events, in the envelope the existing readers expect ---- */

/* `ForgeProbe.java` nests everything under `data.fields` and puts the turn on `data`, and
   `match-telemetry.mjs` reads exactly that. The shape is theirs, not a preference. */
const event = (kind, state, fields) => ({kind, data: {turn: state.turn, phase: state.phase, fields}});

/* The capitalized zone names the projection and the telemetry use, from the engine's own. */
const ZONE_LABEL = {
  library: "Library", hand: "Hand", battlefield: "Battlefield",
  graveyard: "Graveyard", exile: "Exile", stack: "Stack", command: "Command",
};

const cardRef = (state, id) => {
  const o = state.objects[id];
  return o ? {cardId: o.id, name: o.card, owner: o.owner, controller: o.controller, faceDown: false} : null;
};

/* ---- turn-based actions, one per step that has any ---- */

/* CR 502.1. The ACTIVE PLAYER's permanents untap, and nobody else's. This is not a board-wide
   effect, and writing it as one is the kind of bug that only shows when a game is close. */
function untap(state, events) {
  for (const id of state.zones.battlefield) {
    const o = state.objects[id];
    if (o.controller !== state.activePlayer || !o.tapped) continue;
    o.tapped = false;
    events.push(event("GameEventCardTapped", state, {card: cardRef(state, id), tapped: false}));
  }
}

/* CR 121.1 and 104.3c. A draw takes the top card of the library. Drawing from an empty library does
   not throw and does not lose the game here: the player is marked, and state-based actions turn the
   mark into a loss in 1.5. Throwing would make an ordinary, legal game position into a crash. */
export function draw(state, player, events) {
  const library = cardsIn(state, "library", player);
  if (library.length === 0) {
    state.players[player].drewFromEmpty = true;
    return null;
  }
  const top = library[0];
  const card = cardRef(state, top);
  const moved = moveObject(state, top, "hand", player);
  events.push(event("GameEventCardChangeZone", state, {
    card,
    from: {zoneType: ZONE_LABEL.library, player: {playerId: player}},
    to: {zoneType: ZONE_LABEL.hand, player: {playerId: player}},
  }));
  return moved;
}

/* CR 103.8a, and note that it is a two-player rule. */
const skipsFirstDraw = (state) =>
  state.players.length === 2 && state.turn === 1 && state.activePlayer === state.startingPlayer;

/* CR 500.4. Reported only when there was something to empty: an empty pool emptying again is not
   news, and a board that announces it every step buries what matters. */
function emptyManaPools(state, events) {
  for (const player of state.players) {
    const total = Object.values(player.manaPool).reduce((a, b) => a + b, 0);
    if (total === 0) continue;
    const had = {...player.manaPool};
    for (const color of Object.keys(player.manaPool)) player.manaPool[color] = 0;
    events.push(event("GameEventManaPool", state, {player: {playerId: player.id, name: player.name}, emptied: had}));
  }
}

/* CR 514.2. Damage wears off; without this it accumulates across turns and every creature
   eventually dies to a scratch it took ten turns ago. */
function cleanup(state, events) {
  for (const id of state.zones.battlefield) {
    if (state.objects[id].damage !== 0) state.objects[id].damage = 0;
  }
  /* CR 514.1, discarding down to hand size, is a choice and belongs to the controller loop in
     1.2c. It is named here so the omission is visible rather than forgotten. */
  void events;
}

function arrive(state, events) {
  events.push(event("GameEventTurnPhase", state, {
    phase: state.phase,
    playerTurn: {playerId: state.activePlayer, name: state.players[state.activePlayer].name},
  }));
  if (state.phase === "UNTAP") untap(state, events);
  if (state.phase === "DRAW" && !skipsFirstDraw(state)) draw(state, state.activePlayer, events);
  if (state.phase === "CLEANUP") cleanup(state, events);
  state.priorityPlayer = hasPriority(state) ? state.activePlayer : null;
}

/* ---- beginning, and moving on ---- */

/**
 * Put a new state at the first step of the first turn and perform it.
 *
 * @param {object} state           from `createState`
 * @param {number} startingPlayer  which seat goes first; the mulligan step picks it in 1.9
 * @returns {Array} events for the caller to journal
 */
export function beginGame(state, startingPlayer = 0) {
  if (!Number.isInteger(startingPlayer) || !state.players[startingPlayer])
    throw new Error("The starting player must be a seat at the table");
  state.startingPlayer = startingPlayer;
  state.turn = 1;
  state.activePlayer = startingPlayer;
  state.stepIndex = 0;
  state.phase = STEPS[0].phase;
  for (const player of state.players) player.landsPlayed = 0;
  const events = [];
  arrive(state, events);
  return events;
}

/**
 * Move to the next step and perform it.
 *
 * Conditional steps are skipped here rather than entered and immediately left, because entering a
 * step is what makes its triggers fire (CR 506.5, 510.4).
 *
 * @returns {Array} events for the caller to journal
 */
export function advance(state) {
  if (state.stepIndex === undefined) throw new Error("The game has not begun; call beginGame first");
  const events = [];

  /* CR 500.4, on the way out of the step that is ending. */
  emptyManaPools(state, events);

  let next = state.stepIndex + 1;
  while (next < STEPS.length && STEPS[next].when && !CONDITIONS[STEPS[next].when](state)) next += 1;

  if (next >= STEPS.length) {
    /* CR 500.7 extra turns and CR 500.8 extra phases arrive in 1.6 with the triggers that grant
       them; until then a turn is followed by the next living player's. */
    state.activePlayer = nextLivingPlayer(state, state.activePlayer);
    state.turn += 1;
    /* CR 305.2 says "already played a land THIS TURN", so the count is per turn and resets for
       everyone, not only for whoever is about to take it. The difference shows the moment an
       effect lets somebody play a land on another player's turn: resetting only the active
       player's would carry that use forward and deny them their own land drop. */
    for (const player of state.players) player.landsPlayed = 0;
    next = 0;
  }

  state.stepIndex = next;
  state.phase = STEPS[next].phase;
  arrive(state, events);
  return events;
}
