/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* THE LONDON MULLIGAN: CR 103.4.
 *
 * `docs/engine/PLAN.md` §3.3, last row, and the last piece of phase 1.
 *
 * YOU ALWAYS DRAW SEVEN. That is what makes it the London mulligan: a player taking their third
 * mulligan still sees seven cards and then puts three of them on the bottom. Drawing six, then
 * five, is the Paris mulligan, replaced in 2019 — and it changes which hands are keepable, so it is
 * not the kind of difference anybody would mistake for a rounding error.
 *
 * THE BOTTOMING HAPPENS ON KEEPING, NOT ON MULLIGANING. A player who mulligans twice and keeps the
 * third hand bottoms two cards FROM THAT HAND, so the choice has to come after the decision to keep
 * and has to be over the seven they actually kept.
 *
 * WHICH CARDS GO IS THE PLAYER'S CHOICE, and it is the most consequential decision in the opening.
 * An engine that bottoms the last N cards drawn is not bottoming, it is punishing.
 *
 * EVERY SEAT DECIDES BEFORE ANYONE REDRAWS (CR 103.4a). The decisions of a round happen together.
 * Resolving one seat completely before asking the next would let a later seat's shuffle depend on
 * an earlier seat's choice, and the game would stop being reproducible from its pod and seed alone
 * — which is the promise everything else here is built on.
 *
 * THE RNG IS PASSED IN, NOT HELD. A generator is a closure and game state is plain data (§3.2.4),
 * so the only way a shuffle can happen inside a decision is for the caller to hand the stream over.
 * That is why `resolveAwaiting` takes an rng: this is the one decision that consumes randomness.
 */

import {cardsIn, moveObject} from "../state/index.mjs";

/** CR 103.2, and the Commander rules do not change it. */
const STARTING_HAND = 7;

const event = (kind, state, fields) => ({kind, data: {turn: state.turn, phase: state.phase, fields}});

const cardRef = (state, id) => {
  const o = state.objects[id];
  return o ? {cardId: o.id, name: o.card, owner: o.owner, controller: o.controller, faceDown: false} : null;
};

/* Shuffle a player's library through the game's own stream, so the opening hand is reproducible
   from the seed. `rng.shuffle` returns a new array rather than mutating, so the zone is replaced. */
function shuffleLibrary(state, player, rng, events) {
  state.zones.library[player] = rng.shuffle(state.zones.library[player]);
  events.push(event("GameEventShuffle", state, {player: {playerId: player, name: state.players[player].name}}));
}

function drawOpening(state, player, events) {
  for (let i = 0; i < STARTING_HAND; i += 1) {
    const library = cardsIn(state, "library", player);
    if (library.length === 0) break;
    const card = cardRef(state, library[0]);
    moveObject(state, library[0], "hand", player);
    events.push(event("GameEventCardChangeZone", state, {
      card,
      from: {zoneType: "Library", player: {playerId: player}},
      to: {zoneType: "Hand", player: {playerId: player}},
    }));
  }
}

/* Everyone still deciding, in turn order from the starting player. */
const decidingOrder = (state) => {
  const count = state.players.length;
  const from = state.mulligan.startingPlayer;
  const order = [];
  for (let step = 0; step < count; step += 1) order.push((from + step) % count);
  return order;
};

/* The next question, or null when the mulligans are over. Decisions first, for every seat in the
   round; only then does anybody bottom, which keeps a round's decisions independent of each other. */
function nextQuestion(state) {
  const m = state.mulligan;
  for (const player of decidingOrder(state)) {
    if (m.deciding.includes(player) && m.answered[player] === undefined)
      return {kind: "mulligan-decision", player};
  }
  for (const player of decidingOrder(state)) {
    if (m.toBottom[player] > 0) return {kind: "mulligan-bottom", player, count: m.toBottom[player]};
  }
  return null;
}

/* End of a round: everybody who mulliganed shuffles back and draws seven again. Done together, so
   one seat's decision cannot affect another's cards. */
function closeRound(state, rng, events) {
  const m = state.mulligan;
  const again = [];
  for (const player of decidingOrder(state)) {
    if (m.answered[player] === undefined) continue;
    if (m.answered[player] === "keep") {
      /* CR 103.4: on keeping, bottom one card per mulligan taken — but never more cards than the
         player has. Seven mulligans keeps a hand of nothing, and an eighth still keeps a hand of
         nothing; asking for eight cards out of seven is a question with no legal answer, which
         stops a game rather than losing one. The fuzz at a thousand seeds is what found it. */
      const hand = cardsIn(state, "hand", player).length;
      m.toBottom[player] = Math.min(m.taken[player] ?? 0, hand);
      continue;
    }
    again.push(player);
  }
  for (const player of again) {
    for (const id of cardsIn(state, "hand", player)) moveObject(state, id, "library", player);
    shuffleLibrary(state, player, rng, events);
    drawOpening(state, player, events);
    m.taken[player] = (m.taken[player] ?? 0) + 1;
  }
  m.deciding = again;
  m.answered = {};
}

/**
 * Shuffle every library, deal seven to everyone, and ask the first seat.
 *
 * @param {object} state
 * @param {object} rng   the game's own stream (§3.2.1)
 * @param {number} startingPlayer  who decides first, and whose turn one will be
 * @returns {Array} events for the caller to journal
 */
export function beginMulligans(state, rng, startingPlayer = 0) {
  if (state.mulligan) throw new Error("The mulligans are already under way");
  const events = [];
  state.mulligan = {
    startingPlayer,
    deciding: state.players.map((p) => p.id),
    answered: {},
    taken: {},
    toBottom: {},
    done: false,
  };
  for (const player of decidingOrder(state)) {
    shuffleLibrary(state, player, rng, events);
    drawOpening(state, player, events);
  }
  state.awaiting = nextQuestion(state);
  return events;
}

/** Whether the opening is settled and the first turn can begin. */
export const mulligansDone = (state) => state.mulligan?.done === true;

/** The choice (§12.1) for whichever mulligan question is pending. */
export function mulliganChoice(state, awaiting) {
  if (awaiting.kind === "mulligan-decision") {
    const taken = state.mulligan.taken[awaiting.player] ?? 0;
    return {
      id: `mulligan:${awaiting.player}:${taken}`,
      title: taken === 0 ? "Keep this hand?" : `Keep this hand? You would put ${taken} on the bottom.`,
      mode: "boolean",
      min: 1,
      max: 1,
      options: [
        {index: 0, label: "Keep"},
        {index: 1, label: "Mulligan"},
      ],
    };
  }
  const hand = cardsIn(state, "hand", awaiting.player);
  return {
    id: `mulligan-bottom:${awaiting.player}`,
    title: `Put ${awaiting.count} card${awaiting.count === 1 ? "" : "s"} on the bottom of your library`,
    mode: "many",
    min: awaiting.count,
    max: awaiting.count,
    options: hand.map((id, index) => ({index, label: state.objects[id].card, cardId: id})),
  };
}

/**
 * Answer the pending mulligan question.
 *
 * @returns {Array} events for the caller to journal
 */
export function resolveMulligan(state, awaiting, indices, rng) {
  const m = state.mulligan;
  if (!m) throw new Error("The mulligans have not begun");
  const events = [];

  if (awaiting.kind === "mulligan-decision") {
    if (!Array.isArray(indices) || indices.length !== 1)
      throw new Error("Answer yes or no: keep this hand, or take a mulligan");
    m.answered[awaiting.player] = indices[0] === 0 ? "keep" : "mulligan";
    /* Everybody in this round has now answered, so the round closes together. */
    if (m.deciding.every((player) => m.answered[player] !== undefined)) {
      if (!rng) throw new Error("A mulligan round needs the game's rng to shuffle with");
      closeRound(state, rng, events);
    }
  } else {
    const choice = mulliganChoice(state, awaiting);
    if (!Array.isArray(indices) || indices.length !== awaiting.count)
      throw new Error(`Choose exactly ${awaiting.count} card${awaiting.count === 1 ? "" : "s"}`);
    if (new Set(indices).size !== indices.length) throw new Error("Invalid selection");
    /* Resolve to ids before moving anything: each move makes a new object and rewrites the hand. */
    const chosen = indices.map((index) => {
      if (!choice.options[index]) throw new Error("Invalid selection");
      return choice.options[index].cardId;
    });
    for (const id of chosen) {
      const card = cardRef(state, id);
      moveObject(state, id, "library", awaiting.player);
      events.push(event("GameEventCardChangeZone", state, {
        card,
        from: {zoneType: "Hand", player: {playerId: awaiting.player}},
        to: {zoneType: "Library", player: {playerId: awaiting.player}},
        toBottom: true,
      }));
    }
    m.toBottom[awaiting.player] = 0;
  }

  const next = nextQuestion(state);
  state.awaiting = next;
  if (!next) m.done = true;
  return events;
}
