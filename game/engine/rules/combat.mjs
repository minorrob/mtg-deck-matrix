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
 * THE KEYWORDS LIVE IN `keywords/combat.mjs` AND THIS FILE ASKS THEM. Evasion decides what is
 * offered as a block, menace is checked against the whole declaration because it is a rule about
 * the SET, deathtouch changes what lethal means for the assignment, trample decides what may be
 * pushed past a blocker, and first and double strike decide which of the two damage steps a
 * creature deals in. Keeping them there rather than here is what makes "which keywords does the
 * engine know" a question with a file for an answer.
 *
 * WHAT IS STILL DEFERRED AND NAMED: protection and landwalk are keywords with an ARGUMENT — "from
 * black", "Islandwalk" — and the card script has to express the quality before either can be
 * enforced. Infect and wither change what damage does rather than who may block and go with the
 * counters family. Planeswalkers and battles as defenders arrive with those card types.
 *
 * Creatures dying is still a state-based action (CR 704.5g, 704.5h) and belongs to `sba.mjs`. This
 * file marks damage and destroys nothing.
 */

import {cardsIn} from "../state/index.mjs";
import {applyReplacements} from "./replacement.mjs";
import {powerOf, toughnessOf, typesOf, keywordsOf, controllerOf} from "./layers.mjs";
import {summoningSick} from "../keywords/timing.mjs";
import {combatDamageOf, ruleChanged} from "./statics.mjs";
import {
  canBlockAttacker, blockersAreLegal, whyBlockersAreIllegal, lethalNeededFrom,
  combatNeedsFirstStrike, dealsFirstStrike, dealsRegular, trampleOver, lifelinkFrom, markDeathtouch,
} from "../keywords/combat.mjs";

const event = (kind, state, fields) => ({kind, data: {turn: state.turn, phase: state.phase, fields}});

const cardRef = (state, id) => {
  const o = state.objects[id];
  return o ? {cardId: o.id, name: o.card, owner: o.owner, controller: o.controller, faceDown: false} : null;
};

const isCreature = (object) => (object.types ?? []).includes("Creature");
const has = (object, keyword) => (object.keywords ?? []).includes(keyword);
/* Through the layers, so a creature granted vigilance or turned into one this turn is treated as
   what it currently is rather than what was printed on it. */
const isCreatureNow = (state, id) => typesOf(state, id).includes("Creature");
const hasNow = (state, id, keyword) => keywordsOf(state, id).includes(keyword);

/* CR 302.6, summoning sickness, and haste lifting it (CR 702.10b), are keywords/timing.mjs's: the same rule
   decides a creature's {T} abilities, on anyone's turn. */

/** CR 508.1a: untapped, not sick, no defender (unless it may attack as though it had none, CR 702.3b), and yours. */
export function canAttack(state, id, player) {
  const object = state.objects[id];
  return isCreatureNow(state, id)
    && controllerOf(state, id) === player
    && !object.tapped
    && !summoningSick(state, id)
    && (!hasNow(state, id, "Defender") || ruleChanged(state, "attacks-despite-defender", id));
}

/** CR 509.1a: untapped, yours, and you are the one being attacked. */
export function canBlock(state, id, player) {
  return isCreatureNow(state, id) && controllerOf(state, id) === player && !state.objects[id].tapped;
}

/** Everyone still in the game who is not the attacking player (CR 506.2). */
const defendersFor = (state, player) =>
  state.players.filter((p) => p.id !== player && !p.lost).map((p) => p.id);

/* ---- declare attackers ---- */

export const attackers = {
  /** Whether this step has anything to ask. Called by the turn structure as the step begins. */
  open(state) {
    /* CR 800.4: an active player who has left the game declares nothing; the turn runs on without them. */
    if (state.players[state.activePlayer]?.lost) return false;
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
      /* ONE OPTION PER CREATURE PER DEFENDER, so two options can name the same creature. Declaring
         that here means every answerer -- a browser seat, the house pilot, an API pilot -- is held
         to it by `controller.mjs`, rather than each being trusted to work it out. The refusal in
         `resolve` stays as the last line, but nothing should reach it. */
      exclusiveBy: "cardId",
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
         Recomputed once blockers are in, because a blocker with first strike makes the step
         happen just as an attacker with it does. */
      firstStrike: false,
    };
    /* An attacker with first strike is enough on its own; a blocker can add to it later. */
    state.combat.firstStrike = combatNeedsFirstStrike(state);

    /* CR 508.1f: attacking creatures become tapped. CR 702.20b: vigilance does not. */
    for (const attack of state.combat.attacks) {
      const object = state.objects[attack.attacker];
      if (hasNow(state, attack.attacker, "Vigilance")) continue;
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
        /* Evasion, per blocker (CR 509.1b). A block the rules forbid is not offered at all, rather
           than offered and then refused -- the same principle as legality being enumerated. */
        if (!canBlockAttacker(state, id, attack.attacker)) continue;
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
      /* One option per blocker per attacker, so the same rule applies (CR 509.1a). */
      exclusiveBy: "cardId",
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

    /* MENACE IS A RULE ABOUT THE SET (CR 702.111b), so it can only be checked once the whole
       declaration is in. Every individual blocker was legal or it would not have been offered. */
    const bySeat = new Map();
    for (const option of picked) {
      if (!bySeat.has(option.attackerId)) bySeat.set(option.attackerId, []);
      bySeat.get(option.attackerId).push(option.cardId);
    }
    for (const [attackerId, ids] of bySeat) {
      if (blockersAreLegal(state, attackerId, ids)) continue;
      throw new Error(whyBlockersAreIllegal(state, attackerId, ids));
    }

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

    /* CR 510.4: whether the extra damage step happens can only be known once the blockers are in,
       because a BLOCKER with first strike makes it happen just as an attacker with it does. */
    state.combat.firstStrike = combatNeedsFirstStrike(state);

    /* The next defending player, if there is one; otherwise the step is done. */
    const next = nextDefenderToDeclare(state, awaiting.player);
    state.awaiting = next === null ? null : {kind: "declare-blockers", player: next};
    return events;
  },
};

/* ---- combat damage ---- */

/* CURRENT power and toughness, not printed. Combat that read the printed values would ignore every
   anthem, every counter and every "becomes 1/1" on the board -- layers that nothing reads are
   layers that do not exist. And the amount a creature assigns is its power unless a static ability
   says toughness (CR 510.1a, rules/statics.mjs). */
const power = (state, id) => combatDamageOf(state, id);
/** What it takes to kill it now: its current toughness less the damage already marked (CR 510.1a). */
const lethalFor = (state, id) => Math.max(0, toughnessOf(state, id) - state.objects[id].damage);

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
  deal(state, {step = "regular"} = {}) {
    if (!state.combat) return [];
    const events = [];
    const pending = [];
    /* CR 510.4: in the first-strike step only creatures with first or double strike deal damage;
       in the regular step, everything except a first striker that is not also double. */
    const dealsNow = (id) => (step === "first" ? dealsFirstStrike(state, id) : dealsRegular(state, id));
    /* A creature that has left the battlefield deals no combat damage (CR 506.4). That is not a
       guard against a missing object, it is the rule: a blocker killed in the first-strike step is
       gone by the regular one and never hits back, which is the whole point of first strike. */
    const stillThere = (id) => state.objects[id] !== undefined && state.objects[id].zone === "battlefield";

    for (const attack of state.combat.attacks) {
      if (!stillThere(attack.attacker)) continue;
      const attackPower = power(state, attack.attacker);
      if (dealsNow(attack.attacker) && attackPower > 0) {
        if (!attack.blocked) {
          /* CR 510.1a: an unblocked attacker assigns its damage to the player it is attacking. */
          pending.push({toPlayer: attack.defender, amount: attackPower, source: attack.attacker});
        } else if (attack.blockers.length === 1 && stillThere(attack.blockers[0])) {
          /* CR 702.19b: with trample, only LETHAL has to be assigned to the blocker and the rest
             may be pushed through. Without it the excess is simply lost, which is the whole point
             of chump blocking. Lethal is asked of the SOURCE as well as the target, because
             deathtouch makes one damage lethal (CR 702.2b). */
          const lethal = Math.min(attackPower, lethalNeededFrom(state, attack.attacker, attack.blockers[0]));
          const over = trampleOver(state, attack.attacker, lethal);
          const toBlocker = over > 0 ? lethal : attackPower;
          if (toBlocker > 0) pending.push({toCard: attack.blockers[0], amount: toBlocker, source: attack.attacker});
          if (over > 0) pending.push({toPlayer: attack.defender, amount: over, source: attack.attacker});
        } else if (attack.blockers.length > 1) {
          const assignment = attack.assignment ?? [];
          let assigned = 0;
          attack.blockers.forEach((id, index) => {
            if (!stillThere(id)) return;
            const amount = assignment[index] ?? 0;
            assigned += amount;
            if (amount > 0) pending.push({toCard: id, amount, source: attack.attacker});
          });
          const over = trampleOver(state, attack.attacker, assigned);
          if (over > 0) pending.push({toPlayer: attack.defender, amount: over, source: attack.attacker});
        }
      }
      /* CR 510.1d: each blocking creature assigns its damage to the creature it is blocking. */
      for (const blocker of attack.blockers) {
        if (!stillThere(blocker)) continue;
        const blockPower = power(state, blocker);
        if (dealsNow(blocker) && blockPower > 0)
          pending.push({toCard: attack.attacker, amount: blockPower, source: blocker});
      }
    }

    /* Everything was computed from the board as it was; only now is any of it applied — and each
       hit goes through the replacement and prevention effects first (CR 615.1). A shield that stops
       all of it means the damage EVENT does not happen (CR 615.4), which is why a prevented hit is
       skipped rather than reported as zero damage. */
    for (const raw of pending) {
      const {proposal: hit} = applyReplacements(state, {
        event: "damage",
        toPlayer: raw.toPlayer,
        toCard: raw.toCard,
        amount: raw.amount,
        sourceId: raw.source,
        combat: true,
      });
      if (hit.prevented === true || hit.amount <= 0) continue;
      hit.source = raw.source;
      if (hit.toPlayer !== undefined && hit.toPlayer !== null) {
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
        /* CR 704.5h: the mark that makes state-based actions destroy it whatever its toughness. */
        markDeathtouch(state, hit.source, hit.toCard);
        events.push(event("GameEventCardDamaged", state, {
          card: cardRef(state, hit.toCard), source: cardRef(state, hit.source), amount: hit.amount,
        }));
      }

      /* CR 702.15a: lifelink is not a trigger and does not use the stack — the life is gained at
         the same time the damage is dealt, by the source's CONTROLLER, whoever the damage went to. */
      const linked = lifelinkFrom(state, hit.source, hit.amount);
      if (linked > 0) {
        const gains = state.objects[hit.source]?.controller;
        if (gains !== undefined) {
          const before = state.players[gains].life;
          state.players[gains].life += linked;
          events.push(event("GameEventPlayerLivesChanged", state, {
            player: {playerId: gains, name: state.players[gains].name},
            oldLives: before, newLives: state.players[gains].life, lifelink: true,
          }));
        }
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
