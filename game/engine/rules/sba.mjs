/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* STATE-BASED ACTIONS: CR 704, AND THE COMMANDER LOSS RULES OF CR 903.10.
 *
 * `docs/engine/PLAN.md` §3.3, sixth row: "the loss conditions the Java `RulesProbe` asserted,
 * ported red-first". Those assertions were written against Forge and pinned several things about
 * Commander that are easy to assume and wrong. Carrying them across as claims about THIS engine is
 * the only way the port means anything, so `engine-sba` states each of them again.
 *
 * NOBODY CHOOSES ANY OF THIS. State-based actions are checked whenever a player would receive
 * priority (CR 704.3); they all happen at once, and then they are checked again until none apply.
 * The repetition is not a detail: a creature dying can put a player to zero life, and a check that
 * ran once would leave that player sitting at zero until somebody next passed.
 *
 * THE COMMANDER RULES, each of which is a common misremembering:
 *
 *   Damage from two different commanders is NOT pooled (CR 903.10a). Eleven from one and ten from
 *   another is eleven, and ten. It is not twenty-one and it is not a loss.
 *
 *   Gaining life does not erase commander damage. The tally is damage DEALT, not life lost, so a
 *   player at eighty life still dies to the twenty-first point from the same commander.
 *
 *   NONCOMBAT damage from a commander does not add to the tally. CR 903.10a is about combat damage;
 *   a commander that pings you for three has cost you three life and moved you no closer to losing.
 *
 * AN EMPTY LIBRARY IS NOT A LOSS (CR 704.5b). ATTEMPTING TO DRAW from one is. A player can sit at
 * zero cards for the rest of the game and be fine until their next draw step.
 *
 * WHAT IS DEFERRED AND NAMED: the legend rule (CR 704.5j) and planeswalker loyalty (CR 704.5i) need
 * card types and supertypes that arrive with the card directory in phase 2; "can't lose" effects,
 * which the Java probe also pinned, need continuous effects (1.8). Each is a rule this file will
 * grow, not one it silently ignores — an unimplemented rule that looks implemented is worse than a
 * missing one.
 */

import {moveObject} from "../state/index.mjs";

const POISON_TO_LOSE = 10;
/** CR 903.10a. Twenty-one from ONE commander, counted per commander. */
const COMMANDER_DAMAGE_TO_LOSE = 21;

const event = (kind, state, fields) => ({kind, data: {turn: state.turn, phase: state.phase, fields}});

const cardRef = (state, id) => {
  const o = state.objects[id];
  return o ? {cardId: o.id, name: o.card, owner: o.owner, controller: o.controller, faceDown: false} : null;
};

const isCreature = (object) => (object.types ?? []).includes("Creature");

/**
 * Deal damage to a player from a source, keeping the commander tally.
 *
 * The tally moves only for COMBAT damage from an object that is a commander (CR 903.10a). Every
 * other combination costs life and nothing else, which is the distinction the Java probe pinned and
 * the one an engine is most likely to blur.
 */
export function dealCommanderDamage(state, player, sourceId, amount, {combat = true} = {}) {
  const events = [];
  const before = state.players[player].life;
  state.players[player].life -= amount;
  if (combat && state.objects[sourceId]?.commander === true) {
    const tally = state.players[player].commanderDamage;
    tally[sourceId] = (tally[sourceId] ?? 0) + amount;
  }
  events.push(event("GameEventPlayerLivesChanged", state, {
    player: {playerId: player, name: state.players[player].name},
    oldLives: before, newLives: state.players[player].life,
  }));
  return events;
}

/* Why this player is out, or null. Checked in the order the rules list them; the first reason found
   is the one reported, because the board shows one. */
function lossReason(state, player) {
  if (player.lost) return null;
  if (player.life <= 0) return "life";                                    /* CR 704.5a */
  if (player.drewFromEmpty === true) return "empty-library";              /* CR 704.5b */
  if (player.poison >= POISON_TO_LOSE) return "poison";                   /* CR 704.5c */
  /* CR 903.10a, per commander — NOT summed across commanders. */
  for (const amount of Object.values(player.commanderDamage)) {
    if (amount >= COMMANDER_DAMAGE_TO_LOSE) return "commander-damage";
  }
  return null;
}

/* CR 800.4a: when a player leaves the game, their permanents, spells and cards leave with it. A
   board that keeps a dead player's creatures is a board nobody can read, and every later rule that
   counts permanents would count theirs. */
function removePlayerFromBoard(state, playerId, events) {
  for (const id of [...state.zones.battlefield]) {
    if (state.objects[id].owner !== playerId) continue;
    const card = cardRef(state, id);
    const at = state.zones.battlefield.indexOf(id);
    state.zones.battlefield.splice(at, 1);
    delete state.objects[id];
    events.push(event("GameEventCardChangeZone", state, {
      card,
      from: {zoneType: "Battlefield", player: {playerId}},
      to: {zoneType: null, player: {playerId}},
      leftTheGame: true,
    }));
  }
}

/**
 * Check every state-based action, repeatedly, until none applies (CR 704.3).
 *
 * @returns {Array} events for the caller to journal
 */
export function checkStateBasedActions(state) {
  const events = [];
  /* A creature dying can put a player to zero, and that player leaving can empty a zone. Ten passes
     is far more than any real position needs; reaching it would mean two actions were undoing each
     other, which is a bug worth an exception rather than an infinite loop. */
  for (let pass = 0; pass < 10; pass += 1) {
    let acted = false;

    /* CR 704.5d: a token that has left the battlefield ceases to exist. */
    for (const zone of ["graveyard", "hand", "library", "exile", "command"]) {
      state.zones[zone].forEach((list, owner) => {
        for (const id of [...list]) {
          if (state.objects[id]?.token !== true) continue;
          list.splice(list.indexOf(id), 1);
          delete state.objects[id];
          acted = true;
          void owner;
        }
      });
    }

    for (const id of [...state.zones.battlefield]) {
      const object = state.objects[id];
      if (!isCreature(object)) continue;
      /* CR 704.5f: toughness zero or less is PUT INTO the graveyard — not destroyed, so nothing
         that replaces destruction saves it. CR 704.5g: lethal damage destroys. Both end in the
         OWNER's graveyard (CR 108.3), which is why a borrowed creature dying goes home. */
      const toughness = object.toughness ?? 0;
      if (toughness <= 0 || (object.damage > 0 && object.damage >= toughness)) {
        const card = cardRef(state, id);
        /* WHAT DIED, INCLUDING ITS ABILITIES. A "whenever this creature dies" trigger has to be
           found after the creature is gone, and a zone change makes a new object (CR 400.7), so by
           then nothing on the board carries those abilities. This snapshot is the look-back CR
           603.10a describes; without it the trigger simply never fires and nothing reports why. */
        const leftBehind = {
          cardId: id, name: object.card, controller: object.controller, owner: object.owner,
          abilities: structuredClone(object.abilities ?? []),
        };
        moveObject(state, id, "graveyard", object.owner);
        events.push(event("GameEventCardChangeZone", state, {
          card,
          leftBehind,
          from: {zoneType: "Battlefield", player: {playerId: object.controller}},
          to: {zoneType: "Graveyard", player: {playerId: object.owner}},
        }));
        acted = true;
      }
    }

    for (const player of state.players) {
      const reason = lossReason(state, player);
      if (!reason) continue;
      player.lost = true;
      player.lostTo = reason;
      events.push(event("GameEventPlayerLivesChanged", state, {
        player: {playerId: player.id, name: player.name},
        oldLives: player.life, newLives: player.life, lost: true, lossReason: reason,
      }));
      removePlayerFromBoard(state, player.id, events);
      acted = true;
    }

    if (!acted) break;
    if (pass === 9) throw new Error("State-based actions did not settle; two of them are undoing each other");
  }

  const outcome = gameOver(state);
  if (outcome && !state.outcomeReported) {
    state.outcomeReported = true;
    events.push(event("GameEventGameOutcome", state, outcome));
  }
  return events;
}

/**
 * Whether the game is over, and who won.
 *
 * CR 104.2a: a player still in a game all of whose opponents have left wins. CR 104.4a: if every
 * player leaves at once, the game is a draw — which is a real outcome with a real report, not a
 * crash and not an arbitrary winner.
 */
export function gameOver(state) {
  const alive = state.players.filter((p) => !p.lost);
  if (alive.length === 1) return {winner: alive[0].id, reason: "last player standing"};
  if (alive.length === 0) return {winner: null, reason: "all players lost"};
  return null;
}
