/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* COMBAT: CR 506 TO 511.
 *
 * `docs/engine/PLAN.md` §3.3, and §6's phase 1 gate, which names "combat with multiple defenders
 * and damage assignment".
 *
 * MULTIPLE DEFENDERS IS THE WHOLE POINT, and it is the thing that cannot be retrofitted. In a
 * four-player Commander game each attacking creature chooses its own defender, one creature at a
 * time; two creatures at one seat and a third at another is an ordinary turn, not an edge case. An
 * engine written around "the defending player" looks correct until that turn and then has to be
 * rewritten from the state shape outward. So an attack here is `{attacker, defender, blocked,
 * blockers}` from the first line — which is also the shape `CommanderProbeProjection@1` already
 * gives the board's combat panel.
 *
 * SUMMONING SICKNESS IS ABOUT CONTROL, NOT ENTERING (CR 302.6). A creature may attack if its
 * controller has controlled it continuously since their most recent turn began. Because a zone
 * change makes a new object (CR 400.7), the turn a permanent arrived is the turn it came under
 * control, and on its controller's turn the test is simply "not this turn".
 *
 * THESE ARE TURN-BASED ACTIONS (CR 508.1, 509.1), not things done with priority. They happen as the
 * step begins, before anybody can respond, which is why an instant cast in the declare attackers
 * step is cast at creatures that are already attacking and already tapped. The engine stops at
 * `state.awaiting` and asks; nobody holds priority until it has an answer.
 *
 * LETHAL BEFORE THE DAMAGE MOVES ON (CR 510.1c). An attacker facing two blockers may not assign
 * past the first until the first has lethal. `controller.mjs` already enforces exactly that in
 * `damage` mode — the same validator the board has always used — so the engine offers that record
 * rather than deciding for the player.
 *
 * WHAT IS DEFERRED AND NAMED RATHER THAN FAKED: first and double strike (CR 702.7, 702.4) need the
 * extra damage step, which the turn table already carries as a condition; trample, deathtouch,
 * lifelink, infect and protection are keyword families for phase 2; planeswalkers and battles as
 * defenders arrive with those card types. Creatures dying to lethal damage is a state-based action
 * and belongs to 1.5 — this file marks damage and does not destroy anything.
 */

import {cardsIn} from "../state/index.mjs";

const event = (kind, state, fields) => ({kind, data: {turn: state.turn, phase: state.phase, fields}});

const cardRef = (state, id) => {
  const o = state.objects[id];
  return o ? {cardId: o.id, name: o.card, owner: o.owner, controller: o.controller, faceDown: false} : null;
};

const isCreature = (object) => (object.types ?? []).includes("Creature");
const has = (object, keyword) => (object.keywords ?? []).includes(keyword);

/** CR 302.6: controlled continuously since the controller's most recent turn began. */
const summoningSick = (state, object) => object.controlledSinceTurn >= state.turn;

/** CR 508.1a: untapped, not sick, no defender, and yours. */
export function canAttack(state, id, player) {
  const object = state.objects[id];
  return isCreature(object)
    && object.controller === player
    && !object.tapped
    && !summoningSick(state, object)
    && !has(object, "Defender");
}

/** CR 509.1a: untapped, yours, and you are the one being attacked. */
export function canBlock(state, id, player) {
  const object = state.objects[id];
  return isCreature(object) && object.controller === player && !object.tapped;
}

/** Everyone still in the game who is not the attacking player (CR 506.2). */
const defendersFor = (state, player) =>
  state.players.filter((p) => p.id !== player && !p.lost).map((p) => p.id);

/* ---- declare attackers ---- */

export const attackers = {
  /** Whether this step has anything to ask. Called by the turn structure as the step begins. */
  open(state) {
    const candidates = state.zones.battlefield.filter((id) => canAttack(state, id, state.activePlayer));
    /* CR 508.1: the active player declares attackers whether or not they have any. With no legal
       attacker there is nothing to decide, so nothing is asked and the step simply proceeds. */
    if (candidates.length === 0) return false;
    state.awaiting = {kind: "declare-attackers", player: state.activePlayer};
    return true;
  },

  /* One option per creature per legal defender. Three opponents and one bear is three options, and
     the engine refuses a pair of them that names the same creature twice. */
  choice(state, awaiting) {
    const options = [];
    const defenders = defendersFor(state, awaiting.player);
    for (const id of state.zones.battlefield) {
      if (!canAttack(state, id, awaiting.player)) continue;
      for (const defender of defenders) {
        options.push({
          index: options.length,
          label: `${state.objects[id].card} → ${state.players[defender].name}`,
          cardId: id,
          defenderId: defender,
        });
      }
    }
    return {
      id: `declare-attackers:${state.turn}`,
      title: "Declare attackers",
      mode: "many",
      /* CR 508.1a: attacking is optional, and no creature may attack twice, so the most attacks
         possible is one per creature. */
      min: 0,
      max: new Set(options.map((o) => o.cardId)).size,
      options,
    };
  },

  resolve(state, awaiting, indices) {
    const choice = attackers.choice(state, awaiting);
    const picked = indices.map((index) => {
      const option = choice.options[index];
      if (!option) throw new Error("Invalid selection");
      return option;
    });
    /* A creature attacks once. Two options naming the same creature is the obvious way for a pilot
       to produce an impossible board, and it is refused rather than deduplicated: silently keeping
       one of the two would be answering a different question than the one that was asked. */
    if (new Set(picked.map((o) => o.cardId)).size !== picked.length)
      throw new Error("A creature can attack only once; the same creature was declared twice");

    const events = [];
    if (picked.length === 0) {
      /* CR 506.5: with no attackers, the declare blockers and combat damage steps do not happen.
         `combat` stays null, which is what the turn table's condition reads. */
      state.awaiting = null;
      return events;
    }

    state.combat = {
      attackingPlayerId: awaiting.player,
      defenders: [...new Set(picked.map((o) => o.defenderId))],
      attacks: picked.map((o) => ({attacker: o.cardId, defender: o.defenderId, blocked: false, blockers: []})),
      /* Read by the turn table to decide whether the first-strike damage step happens (CR 510.4).
         No creature has first strike until phase 2 gives them keywords. */
      firstStrike: false,
    };

    /* CR 508.1f: attacking creatures become tapped. CR 702.20b: vigilance does not. */
    for (const attack of state.combat.attacks) {
      const object = state.objects[attack.attacker];
      if (has(object, "Vigilance")) continue;
      object.tapped = true;
      events.push(event("GameEventCardTapped", state, {card: cardRef(state, attack.attacker), tapped: true}));
    }

    events.push(event("GameEventAttackersDeclared", state, {
      player: {playerId: awaiting.player, name: state.players[awaiting.player].name},
      attackers: state.combat.attacks.map((a) => ({
        card: cardRef(state, a.attacker),
        defender: {playerId: a.defender, name: state.players[a.defender].name},
      })),
    }));
    state.awaiting = null;
    return events;
  },
};

/* ---- declare blockers ---- */

/* Each defending player declares separately, in turn order starting after the attacking player, so
   the sequence is the same every replay. */
const nextDefenderToDeclare = (state, after = null) => {
  const order = state.combat.defenders.slice().sort((a, b) => a - b);
  const from = after === null ? -1 : order.indexOf(after);
  for (let i = from + 1; i < order.length; i += 1) {
    if (!state.players[order[i]].lost) return order[i];
  }
  return null;
};

export const blockers = {
  open(state) {
    if (!state.combat) return false;
    const player = nextDefenderToDeclare(state);
    if (player === null) return false;
    state.awaiting = {kind: "declare-blockers", player};
    return true;
  },

  choice(state, awaiting) {
    const options = [];
    /* Only the attacks aimed at THIS player. A creature cannot block an attack on somebody else
       (CR 509.1a), and offering it would let a seat defend a rival by accident. */
    const mine = state.combat.attacks.filter((a) => a.defender === awaiting.player);
    for (const id of state.zones.battlefield) {
      if (!canBlock(state, id, awaiting.player)) continue;
      for (const attack of mine) {
        options.push({
          index: options.length,
          label: `${state.objects[id].card} blocks ${state.objects[attack.attacker].card}`,
          cardId: id,
          attackerId: attack.attacker,
        });
      }
    }
    return {
      id: `declare-blockers:${state.turn}:${awaiting.player}`,
      title: "Declare blockers",
      mode: "many",
      min: 0,
      max: new Set(options.map((o) => o.cardId)).size,
      options,
    };
  },

  resolve(state, awaiting, indices) {
    const choice = blockers.choice(state, awaiting);
    const picked = indices.map((index) => {
      const option = choice.options[index];
      if (!option) throw new Error("Invalid selection");
      return option;
    });
    /* CR 509.1a: one creature blocks one attacker, unless an effect says otherwise. */
    if (new Set(picked.map((o) => o.cardId)).size !== picked.length)
      throw new Error("A creature can block only one attacker; the same blocker was declared twice");

    const events = [];
    for (const option of picked) {
      const attack = state.combat.attacks.find((a) => a.attacker === option.attackerId);
      attack.blocked = true;                              /* CR 509.1h */
      attack.blockers.push(option.cardId);
    }
    if (picked.length > 0) {
      events.push(event("GameEventBlockersDeclared", state, {
        player: {playerId: awaiting.player, name: state.players[awaiting.player].name},
        blockers: picked.map((o) => ({
          card: cardRef(state, o.cardId), blocking: cardRef(state, o.attackerId),
        })),
      }));
    }

    /* The next defending player, if there is one; otherwise the step is done. */
    const next = nextDefenderToDeclare(state, awaiting.player);
    state.awaiting = next === null ? null : {kind: "declare-blockers", player: next};
    return events;
  },
};

/* ---- combat damage ---- */

const power = (state, id) => state.objects[id].power ?? 0;
/** What it takes to kill it now: its toughness less the damage already marked (CR 510.1a). */
const lethalFor = (state, id) => Math.max(0, (state.objects[id].toughness ?? 0) - state.objects[id].damage);

export const combatDamage = {
  /* Only an attacker facing more than one blocker has a decision: with one blocker all its damage
     goes there, and with none it all goes to the player. */
  open(state) {
    if (!state.combat) return false;
    const attack = state.combat.attacks.find((a) => a.blockers.length > 1 && !a.assigned);
    if (!attack) return false;
    state.awaiting = {kind: "assign-combat-damage", player: state.combat.attackingPlayerId, attacker: attack.attacker};
    return true;
  },

  choice(state, awaiting) {
    const attack = state.combat.attacks.find((a) => a.attacker === awaiting.attacker);
    return {
      id: `assign-damage:${state.turn}:${awaiting.attacker}`,
      title: `Assign ${power(state, awaiting.attacker)} damage`,
      mode: "damage",
      min: 0,
      max: 0,
      total: power(state, awaiting.attacker),
      maySkip: false,
      divide: false,
      /* CR 510.1c applies in the order the blockers are listed, which is the order they were
         declared. Letting the attacking player reorder them is CR 509.2 and arrives with the
         ordering choice; until then the declared order is the assignment order. */
      overrideOrder: false,
      options: attack.blockers.map((id, index) => ({
        index,
        label: state.objects[id].card,
        cardId: id,
        lethal: lethalFor(state, id),
        defender: false,
      })),
    };
  },

  resolve(state, awaiting, amounts) {
    const attack = state.combat.attacks.find((a) => a.attacker === awaiting.attacker);
    if (!Array.isArray(amounts) || amounts.length !== attack.blockers.length)
      throw new Error("Assign damage to each listed recipient");
    attack.assignment = amounts.slice();
    attack.assigned = true;
    state.awaiting = null;
    return [];
  },

  /**
   * Deal all combat damage at once (CR 510.2).
   *
   * Simultaneity is not a detail: a 2/2 blocking a 2/2 kills it AND dies, and dealing one side's
   * damage first would let the first to die deal nothing.
   */
  deal(state) {
    if (!state.combat) return [];
    const events = [];
    const pending = [];

    for (const attack of state.combat.attacks) {
      const attackPower = power(state, attack.attacker);
      if (!attack.blocked) {
        /* CR 510.1a: an unblocked attacker assigns its damage to the player it is attacking. */
        if (attackPower > 0) pending.push({toPlayer: attack.defender, amount: attackPower, source: attack.attacker});
      } else if (attack.blockers.length === 1) {
        if (attackPower > 0) pending.push({toCard: attack.blockers[0], amount: attackPower, source: attack.attacker});
      } else if (attack.blockers.length > 1) {
        const assignment = attack.assignment ?? [];
        attack.blockers.forEach((id, index) => {
          const amount = assignment[index] ?? 0;
          if (amount > 0) pending.push({toCard: id, amount, source: attack.attacker});
        });
      }
      /* CR 510.1d: each blocking creature assigns its damage to the creature it is blocking. */
      for (const blocker of attack.blockers) {
        const blockPower = power(state, blocker);
        if (blockPower > 0) pending.push({toCard: attack.attacker, amount: blockPower, source: blocker});
      }
    }

    /* Everything was computed from the board as it was; only now is any of it applied. */
    for (const hit of pending) {
      if (hit.toPlayer !== undefined) {
        const before = state.players[hit.toPlayer].life;
        state.players[hit.toPlayer].life -= hit.amount;
        events.push(event("GameEventPlayerDamaged", state, {
          source: cardRef(state, hit.source),
          target: {playerId: hit.toPlayer, name: state.players[hit.toPlayer].name},
          amount: hit.amount, combat: true, infect: false,
        }));
        events.push(event("GameEventPlayerLivesChanged", state, {
          player: {playerId: hit.toPlayer, name: state.players[hit.toPlayer].name},
          oldLives: before, newLives: state.players[hit.toPlayer].life,
        }));
      } else {
        state.objects[hit.toCard].damage += hit.amount;
        events.push(event("GameEventCardDamaged", state, {
          card: cardRef(state, hit.toCard), source: cardRef(state, hit.source), amount: hit.amount,
        }));
      }
    }
    /* Creatures with lethal damage die as a state-based action (CR 704.5g), which is 1.5. Nothing
       is destroyed here, and that omission is the reason this comment exists. */
    return events;
  },
};

/** CR 511.3: combat ends and everything stops being an attacker or a blocker. */
export function endCombat(state) {
  state.combat = null;
  return [];
}
