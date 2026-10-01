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
import {attackers, blockers, combatDamage, endCombat} from "./combat.mjs";
import {checkStateBasedActions, gameOver, finishCommanderReplacement} from "./sba.mjs";
import {commanderChoice} from "./commander.mjs";
import {mulliganChoice, resolveMulligan} from "./mulligan.mjs";
import {answerResolution, resolutionChoice} from "../script/resolution.mjs";
import {finishResolving} from "./stack.mjs";
import {playerRuleChanged} from "./statics.mjs";
import {askEntering, enteringChoice, resolveEnteringChoice} from "./entering.mjs";
import {collectTriggers, openTriggers, triggerChoice, resolveTriggerOrder, triggerTargetsChoice, resolveTriggerTargets} from "./trigger.mjs";

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

/* Whether a conditional step happens at all this turn. Predicates over state rather than flags, so
   a rule that decides a step lives in one place. */
const CONDITIONS = {
  /* CR 506.5: no attackers, no declare blockers step and no combat damage step. */
  attackers: (state) => (state.combat?.attacks?.length ?? 0) > 0,
  /* CR 510.4: the first-strike damage step exists only if a creature in combat has first or double
     strike. `combat.firstStrike` is set when attackers are declared and stays false until phase 2
     gives creatures keywords, so for now the step never happens — which is correct, not deferred. */
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

/* CR 514.1 and 514.2, which happen simultaneously: the active player discards down to their
   maximum hand size, and all damage wears off. Without the second, damage accumulates across turns
   and every creature eventually dies to a scratch it took ten turns ago.
 *
 * THE DISCARD IS A DECISION, SO THE ENGINE STOPS HERE AND ASKS. It does not pick cards. `awaiting`
 * is how a turn-based action that needs an answer reaches the driver: the engine runs until it
 * needs one, records what it needs, and returns. Declaring attackers and blockers (CR 508.1, 509.1)
 * are the same shape and arrive in 1.4 through the same field.
 *
 * What is NOT here: CR 514.3a's second cleanup step, which happens when something triggers during
 * cleanup or a state-based action is performed. There are no triggers until 1.6, so there is
 * nothing that could cause one; it is named so the omission is visible rather than forgotten. */
function cleanup(state, events) {
  /* CR 514.2, as one event: all damage is removed from permanents AND every "until end of turn" effect ends. Without
     the second half, a Giant Growth's +3/+3, Heroic Intervention's indestructible and Craterhoof's +X/+X lasted the
     rest of the game -- and the scenarios, which look within a turn, never saw it. */
  for (const id of state.zones.battlefield) {
    if (state.objects[id].damage !== 0) state.objects[id].damage = 0;
  }
  if ((state.effects ?? []).some((effect) => effect.until === "end-of-turn")) state.effects = state.effects.filter((effect) => effect.until !== "end-of-turn");
  const player = state.players[state.activePlayer];
  /* CR 800.4: a turn whose active player has left the game runs to its end without them, so nobody discards. */
  /* CR 402.2: seven, unless a static ability says the player has no maximum hand size. */
  const limit = playerRuleChanged(state, "no-maximum-hand-size", state.activePlayer) ? Infinity : (player.maxHandSize ?? 7);
  const over = player.lost ? 0 : cardsIn(state, "hand", state.activePlayer).length - limit;
  if (over > 0) state.awaiting = {kind: "discard-to-hand-size", player: state.activePlayer, count: over};
  void events;
}

/**
 * The choice record for whatever turn-based action the engine is waiting on (§12.1).
 *
 * Returns null when nothing is pending. The driver offers this to the controller, takes the answer
 * and hands it to `resolveAwaiting`.
 */
export function awaitingChoice(state) {
  const awaiting = state.awaiting;
  if (!awaiting) return null;
  if (awaiting.kind === "mulligan-decision" || awaiting.kind === "mulligan-bottom")
    return mulliganChoice(state, awaiting);
  if (awaiting.kind === "effect-choice") return resolutionChoice(state, awaiting);
  if (awaiting.kind === "commander-replacement") return commanderChoice(state, awaiting);
  if (awaiting.kind === "order-triggers") return triggerChoice(state, awaiting);
  if (awaiting.kind === "trigger-targets") return triggerTargetsChoice(state, awaiting);
  if (awaiting.kind === "entering-choice") return enteringChoice(state, awaiting);
  if (awaiting.kind === "declare-attackers") return attackers.choice(state, awaiting);
  if (awaiting.kind === "declare-blockers") return blockers.choice(state, awaiting);
  if (awaiting.kind === "assign-combat-damage") return combatDamage.choice(state, awaiting);
  /* The held draw (item 13): one thing to do, and nothing else happens until it is done. */
  if (awaiting.kind === "draw-card")
    return {id: `draw:${state.turn}`, title: "Draw a card", kind: "draw", mode: "one", min: 1, max: 1, options: [{index: 0, label: "Draw a card"}]};
  if (awaiting.kind === "discard-to-hand-size") {
    const hand = cardsIn(state, "hand", awaiting.player);
    return {
      id: `cleanup-discard:${state.turn}`,
      title: `Discard ${awaiting.count} card${awaiting.count === 1 ? "" : "s"}`,
      mode: awaiting.count === 1 ? "one" : "many",
      min: awaiting.count,
      max: awaiting.count,
      options: hand.map((id, index) => ({index, label: state.objects[id].card, cardId: id})),
    };
  }
  throw new Error(`No choice is defined for the turn-based action ${awaiting.kind}`);
}

/**
 * Apply the answer to the pending turn-based action.
 *
 * @param {Array<number>} indices  positions in the choice's options, as the controller validated
 * @returns {Array} events for the caller to journal
 */
export function resolveAwaiting(state, indices, amounts = null, rng = null, extra = {}) {
  const awaiting = state.awaiting;
  if (!awaiting) throw new Error("The engine is not waiting on anything");

  /* The mulligan is the one decision that consumes randomness, because keeping or not decides
     whether a library is shuffled. A generator is a closure and game state is plain data (§3.2.4),
     so the stream is handed in rather than held. */
  if (awaiting.kind === "mulligan-decision" || awaiting.kind === "mulligan-bottom")
    return resolveMulligan(state, awaiting, indices, rng);

  /* A card effect that stopped half way through. `extra` carries what generic indices cannot --
     scry's `toBottom`, for instance -- and the choice record says which fields it expects. */
  if (awaiting.kind === "effect-choice") {
    const outcome = answerResolution(state, indices, extra, rng);
    /* A spell that stopped to ask leaves the stack once its last effect has run (stack.mjs), and only then does
       anyone receive priority -- after state-based actions and triggers, as after any resolution (CR 117.5). */
    const events = outcome.status === "done" ? [...outcome.events, ...finishResolving(state)] : outcome.events;
    grantStepPriority(state, events);
    return events;
  }

  if (awaiting.kind === "commander-replacement") {
    const events = finishCommanderReplacement(state, awaiting, indices);
    grantStepPriority(state, events);
    return events;
  }
  if (awaiting.kind === "order-triggers") {
    const events = resolveTriggerOrder(state, awaiting, indices);
    grantStepPriority(state, events);
    return events;
  }
  if (awaiting.kind === "trigger-targets") {
    const events = resolveTriggerTargets(state, awaiting, indices);
    grantStepPriority(state, events);
    return events;
  }
  if (awaiting.kind === "entering-choice") {
    const events = resolveEnteringChoice(state, awaiting, indices);
    grantStepPriority(state, events);
    return events;
  }
  if (awaiting.kind === "declare-attackers") {
    const events = attackers.resolve(state, awaiting, indices);
    grantStepPriority(state, events);
    return events;
  }
  if (awaiting.kind === "declare-blockers") {
    /* Each defending player declares in turn; `blockers.resolve` names the next one, or clears the
       wait once the last has answered. */
    const events = blockers.resolve(state, awaiting, indices);
    grantStepPriority(state, events);
    return events;
  }
  if (awaiting.kind === "draw-card") {
    if (!Array.isArray(indices) || indices.length !== 1 || indices[0] !== 0) throw new Error("Invalid selection");
    const events = [];
    state.awaiting = null;
    draw(state, awaiting.player, events);
    grantStepPriority(state, events);
    return events;
  }
  if (awaiting.kind === "assign-combat-damage") {
    const events = combatDamage.resolve(state, awaiting, amounts ?? indices);
    /* Another attacker may also face several blockers; each gets its own question, and only once
       the last is answered is any damage dealt — CR 510.2, all of it at the same time. */
    if (!combatDamage.open(state)) events.push(...combatDamage.deal(state));
    grantStepPriority(state, events);
    return events;
  }

  const choice = awaitingChoice(state);
  if (!Array.isArray(indices) || indices.length !== awaiting.count)
    throw new Error(`This step needs exactly ${awaiting.count} card${awaiting.count === 1 ? "" : "s"}`);

  const events = [];
  /* Resolve every index to a card id BEFORE moving anything: each move makes a new object and
     rewrites the hand, so positions taken from the offered record would drift under us. */
  const chosen = indices.map((index) => {
    const option = choice.options[index];
    if (!option) throw new Error("Invalid selection");
    return option.cardId;
  });
  if (new Set(chosen).size !== chosen.length) throw new Error("Invalid selection");

  for (const id of chosen) {
    const card = cardRef(state, id);
    const owner = state.objects[id].owner;
    moveObject(state, id, "graveyard", owner);
    events.push(event("GameEventCardChangeZone", state, {
      card,
      from: {zoneType: ZONE_LABEL.hand, player: {playerId: awaiting.player}},
      to: {zoneType: ZONE_LABEL.graveyard, player: {playerId: owner}},
      discarded: true,
    }));
  }
  state.awaiting = null;
  grantStepPriority(state, events);
  return events;
}

function arrive(state, events) {
  events.push(event("GameEventTurnPhase", state, {
    phase: state.phase,
    playerTurn: {playerId: state.activePlayer, name: state.players[state.activePlayer].name},
  }));
  if (state.phase === "UNTAP") untap(state, events);
  if (state.phase === "DRAW" && !skipsFirstDraw(state) && !state.players[state.activePlayer].lost) {
    /* CR 504.1 makes the draw a turn-based action, not a choice. A table that asks for the beat (item 13) holds it
       until the player's click: the same card, at the player's moment, and priority after it (CR 504.2). */
    if (state.drawBeat) state.awaiting = {kind: "draw-card", player: state.activePlayer};
    else draw(state, state.activePlayer, events);
  }
  /* The combat steps' turn-based actions (CR 508.1, 509.1, 510.1) each stop the game and ask.
     `open` returns false when there is nothing to decide, and the step just proceeds. */
  if (state.phase === "COMBAT_DECLARE_ATTACKERS") attackers.open(state);
  if (state.phase === "COMBAT_DECLARE_BLOCKERS") blockers.open(state);
  /* CR 510.4: the first-strike step deals its own damage, and then the regular step deals the rest.
     Double strike is in both, which is why the two calls are the same code with a different step. */
  if (state.phase === "COMBAT_FIRST_STRIKE_DAMAGE" && !combatDamage.open(state))
    events.push(...combatDamage.deal(state, {step: "first"}));
  if (state.phase === "COMBAT_DAMAGE" && !combatDamage.open(state))
    events.push(...combatDamage.deal(state, {step: "regular"}));
  if (state.phase === "COMBAT_END") events.push(...endCombat(state));
  if (state.phase === "CLEANUP") cleanup(state, events);
  state.passes = 0;
  grantStepPriority(state, events);
}

/* CR 117.1a: the active player receives priority at the beginning of most steps — but AFTER that
   step's turn-based actions (CR 508.2, 509.3, 510.3). While the engine is waiting on one, nobody
   holds priority, which is why an instant cast in the declare attackers step is cast at creatures
   that are already attacking and already tapped.
 *
 * CR 704.3: state-based actions are checked WHENEVER A PLAYER WOULD RECEIVE PRIORITY, which makes
 * this the right and only place for it in the turn structure. Combat damage is dealt as this step
 * begins, so the creatures it killed are already gone by the time anybody could respond. */
function grantStepPriority(state, events = []) {
  if (hasPriority(state) && !state.awaiting) {
    /* What just happened triggers now (CR 603.2). A permanent that entered asking is then answered before anything
       else happens (rules/entering.mjs). */
    collectTriggers(state, events);
    if (!askEntering(state)) {
      const sba = checkStateBasedActions(state);
      events.push(...sba);
      /* CR 603.3: waiting triggers go on the stack the next time a player would receive priority —
         which is here, after state-based actions, so a trigger sees a board where the dead are
         already gone. `openTriggers` returns true when a player has more than one and has to be
         asked for the order, and that question holds priority off until it is answered. */
      collectTriggers(state, sba);
      openTriggers(state);
    }
  }
  /* Re-read after the above: a player can lose during their own turn, and ordering triggers can
     have set a new wait. Either way priority goes to nobody. */
  const active = state.players[state.activePlayer];
  state.priorityPlayer = hasPriority(state) && !state.awaiting && active && !active.lost
    ? state.activePlayer : null;
  return events;
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
  state.players[startingPlayer].turnBegan = 1;
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
  /* A turn-based action that needs an answer holds the game here until it has one. Advancing past
     it would silently skip the discard, or in 1.4 the attack, and leave a turn that never happened
     looking exactly like one that did. */
  if (state.awaiting) throw new Error(`The ${state.awaiting.kind} decision has to be answered before the game moves on`);
  /* A finished game has no next step, and saying so here is worth a line: without it the failure
     surfaces from `nextLivingPlayer` as "every player has lost", which is true and tells a caller
     nothing about what they did wrong. */
  const over = gameOver(state);
  if (over) throw new Error(`The game is over (${over.reason}); there is no next step`);
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
    state.players[state.activePlayer].turnBegan = state.turn;   /* CR 302.6, keywords/timing.mjs */
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
