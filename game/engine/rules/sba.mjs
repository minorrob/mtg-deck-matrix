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
 * A COMMANDER IN A GRAVEYARD OR IN EXILE MAY GO HOME (CR 903.9a, 704.6d), and its owner is asked here, once everything
 * else has settled: it died, or was exiled, like any card, and what watches for that saw it. Asked once each time it
 * arrives (rules/commander.mjs), never while the game is over.
 *
 * THE LEGEND RULE IS A CHOICE (CR 704.5j). A player with two or more legendary permanents of one name
 * keeps the one they choose, and each of the others GOES TO its owner's graveyard -- not destroyed,
 * so indestructible does not save them, and a death all the same, so "dies" sees
 * it. Asked here like the commander's question, once everything else has settled.
 *
 * +1/+1 AND -1/-1 COUNTERS ANNIHILATE (CR 704.5q): N of each go, N the smaller count.
 *
 * WHAT IS DEFERRED AND NAMED: planeswalker loyalty (CR 704.5i) waits for planeswalkers, which no
 * definition plays yet; "can't lose" effects, which the Java probe also pinned, need continuous
 * effects (1.8); a permanent that turns the legend rule off (Mirror Gallery) has no script. Each is
 * a rule this file will grow, not one it silently ignores — an unimplemented rule that looks
 * implemented is worse than a missing one.
 */

import {moveObject, PER_PLAYER, PUBLIC_ZONES, eventCard, rememberExileLooker} from "../state/index.mjs";
import {applyReplacements} from "./replacement.mjs";
import {lastKnown, toughnessOf, typesOf, keywordsOf, controllerOf, deriving} from "./layers.mjs";
import {matchesSelector} from "../script/filter.mjs";
import {commanderToAsk, resolveCommanderChoice, recordCommanderDamage} from "./commander.mjs";
import {sacrificeOne, moveOne, returnExiledUntil, leavingRef, destructionReplaced, destructionAsks} from "../script/effects/zones.mjs";
import {changeLife} from "../script/effects/resources.mjs";
import {enduringStories, citysBlessings} from "../keywords/designations.mjs";
import {preparedCopyStays} from "../script/effects/attributes.mjs";
import {protectedFrom} from "./protection.mjs";

/* The capitalized zone names the projection and the telemetry use. */
const ZONE_LABEL = {
  library: "Library", hand: "Hand", battlefield: "Battlefield",
  graveyard: "Graveyard", exile: "Exile", stack: "Stack", command: "Command",
};

const POISON_TO_LOSE = 10;
/** CR 903.10a. Twenty-one from ONE commander, counted per commander. */
const COMMANDER_DAMAGE_TO_LOSE = 21;

const event = (kind, state, fields) => ({kind, data: {turn: state.turn, phase: state.phase, fields}});

const cardRef = eventCard;

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
  changeLife(state, player, -amount, events);
  if (combat) recordCommanderDamage(state, player, sourceId, amount);
  return events;
}

/* Why this player is out, or null. Checked in the order the rules list them; the first reason found
   is the one reported, because the board shows one. */
function lossReason(state, player) {
  if (player.lost) return null;
  if (player.conceded === true) return "conceded";                        /* CR 104.3a */
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
    if (state.objects[id]?.owner !== playerId) continue;
    /* Face down, revealed as its owner leaves (CR 708.9). */
    const card = leavingRef(state, id);
    const at = state.zones.battlefield.indexOf(id);
    state.zones.battlefield.splice(at, 1);
    delete state.objects[id];
    events.push(event("GameEventCardChangeZone", state, {
      card,
      from: {zoneType: "Battlefield", player: {playerId}},
      to: {zoneType: null, player: {playerId}},
      leftTheGame: true,
    }));
    /* It left the battlefield: what it exiled "until this leaves the battlefield" comes back (CR 610.3). */
    returnExiledUntil(state, id, events);
  }
}

/**
 * Check every state-based action, repeatedly, until none applies (CR 704.3).
 *
 * @returns {Array} events for the caller to journal
 */
export function checkStateBasedActions(state) {
  /* Continuous control changes also confer hideaway's look permission (CR 406.3, 702.75a). Record it before a state-based
     action can remove the source or an effect granting control; projections only read these permissions. */
  for (const source of new Set(state.zones.exile.filter((id) => state.objects[id]?.faceDown === true)
    .map((id) => state.objects[id].exiledBy).filter((id) => state.objects[id]?.zone === "battlefield")))
    rememberExileLooker(state, source, controllerOf(state, source));
  /* Storied (CR 702.195a): "any time" its controller has three artifacts, Sagas or legendaries -- read as the game is
     checked, before the actions, which never add a permanent (keywords/designations.mjs). Ascend (CR 702.131b) the same
     way: ten permanents, and the city's blessing for the rest of the game. Both in one question, every object derived once. */
  const events = deriving(state, () => [...enduringStories(state), ...citysBlessings(state)]);
  /* A creature dying can put a player to zero, and that player leaving can empty a zone. Ten passes
     is far more than any real position needs; reaching it would mean two actions were undoing each
     other, which is a bug worth an exception rather than an infinite loop. */
  for (let pass = 0; pass < 10; pass += 1) {
    let acted = false;

    /* CR 704.5d: a token that has left the battlefield ceases to exist.
     *
     * PER-PLAYER ZONES ARE LISTS OF LISTS AND SHARED ZONES ARE ONE LIST. Treating them alike was a
     * real bug here, invisible for as long as nothing ever reached exile — the first card that did
     * made the loop try to iterate an object id. `PER_PLAYER` is the one place that distinction is
     * written down, so it is the one this reads. */
    for (const zone of ["graveyard", "hand", "library", "command", "exile", "stack"]) {
      const lists = PER_PLAYER.includes(zone) ? state.zones[zone] : [state.zones[zone]];
      for (const list of lists) {
        for (const id of [...list]) {
          /* CR 704.5e: and a copy of a spell anywhere but the stack -- returned to a hand, put into a graveyard. */
          /* Except a prepared permanent's prepare spell in exile, there for as long as that permanent is on the battlefield
             and prepared (CR 722.3c; script/effects/attributes.mjs). */
          const copyAway = state.objects[id]?.copy === true && zone !== "stack" && !(zone === "exile" && preparedCopyStays(state, id));
          if (state.objects[id]?.token !== true && !copyAway) continue;
          list.splice(list.indexOf(id), 1);
          delete state.objects[id];
          acted = true;
        }
      }
    }

    /* CR 704.5q: a permanent with both +1/+1 and -1/-1 counters loses N of each, N the smaller. */
    for (const id of state.zones.battlefield) {
      const counters = state.objects[id].counters ?? {};
      const n = Math.min(counters["+1/+1"] ?? 0, counters["-1/-1"] ?? 0);
      if (n <= 0) continue;
      for (const kind of ["+1/+1", "-1/-1"]) {
        const before = counters[kind];
        counters[kind] = before - n;
        events.push(event("GameEventCardCounters", state, {card: cardRef(state, id), type: kind, oldValue: before, newValue: counters[kind]}));
      }
      acted = true;
    }

    /* CR 704.5m: an Aura attached to nothing, or to a permanent its Enchant could not enchant, is put into its owner's
       graveyard -- through the replacements and with its last known information, so "when this Aura is put into a
       graveyard" still sees it. Unlike an Equipment, it does not stay. */
    for (const id of [...state.zones.battlefield]) {
      const object = state.objects[id];
      if (!object.enchant) continue;
      const host = object.attachedTo === null || object.attachedTo === undefined ? null : state.objects[object.attachedTo];
      if (host && host.zone === "battlefield" && host.id !== id && matchesSelector(object.enchant, state, object.attachedTo, {controller: object.controller, source: id})) continue;
      if (host) host.attachments = (host.attachments ?? []).filter((a) => a !== id);
      const card = cardRef(state, id);
      const leftBehind = lastKnown(state, id);
      const {proposal} = applyReplacements(state, {event: "zone-change", objectId: id, from: "battlefield", to: "graveyard", player: object.controller});
      const fell = moveObject(state, id, proposal.to, PER_PLAYER.includes(proposal.to) ? object.owner : null);
      events.push(event("GameEventCardChangeZone", state, {
        card, leftBehind,
        /* What it became (CR 400.7e): an Aura's "return it to its owner's hand" finds the card in the graveyard. */
        ...(PUBLIC_ZONES.includes(proposal.to) ? {becomes: fell} : {}),
        from: {zoneType: "Battlefield", player: {playerId: object.controller}},
        to: {zoneType: ZONE_LABEL[proposal.to] ?? proposal.to, player: {playerId: object.owner}},
      }));
      /* What it exiled "until this Aura leaves the battlefield", back (CR 610.3; Ossification). */
      returnExiledUntil(state, id, events, leftBehind);
      acted = true;
    }

    /* CR 704.5n: an Equipment attached to a permanent that has gone, or is no longer a creature, becomes unattached and
       stays on the battlefield. */
    for (const id of state.zones.battlefield) {
      const object = state.objects[id];
      if (object.attachedTo === null || object.attachedTo === undefined) continue;
      const host = state.objects[object.attachedTo];
      const equipment = (object.subtypes ?? []).includes("Equipment");
      if (host && host.zone === "battlefield" && (!equipment || typesOf(state, object.attachedTo).includes("Creature"))
        /* Nor enchanted or equipped by one it has protection from (CR 702.16c-d): unattached here, an Aura then put into
           its owner's graveyard by the check above, as an Aura attached to nothing (CR 704.5m). */
        && !protectedFrom(state, {card: object.attachedTo}, id)) continue;
      if (host) host.attachments = (host.attachments ?? []).filter((a) => a !== id);
      object.attachedTo = null;
      acted = true;
    }

    /* THE CHECK, THEN THE ACTIONS (CR 704.3): which creatures are at zero toughness or have lethal damage or deathtouch
       damage is read once for the whole board, every object derived once (rules/layers.mjs, deriving) -- asking it again
       for each creature derived the board once per creature. Each one found is asked again below as it is acted on; one
       that only a death in this pass brings down dies in the next check. */
    const {lethal, spent, asks} = deriving(state, () => {
      const lethal = new Set(state.zones.battlefield.filter((id) => {
        const object = state.objects[id];
        if (!typesOf(state, id).includes("Creature")) return false;
        const toughness = toughnessOf(state, id);
        return toughness <= 0 || (object.deathtouched === true && toughness > 0) || (object.damage > 0 && object.damage >= toughness);
      }));
      return {lethal,
        /* And the planeswalkers with no loyalty left (CR 704.5i), acted on below. */
        spent: state.zones.battlefield.filter((id) => typesOf(state, id).includes("Planeswalker") && (state.objects[id].counters?.loyalty ?? 0) <= 0),
        /* WHICH REPLACES A DESTRUCTION, WHEN SEVERAL WOULD (CR 616.1; two Auras with umbra armor, or one and a regeneration
           shield): asked of the creature's controller before any of these destructions happens -- they happen at once (CR
           704.3) -- and the whole check made again with the answer (finishDestructionChoice). Read in the same question, every
           object derived once. */
        asks: destructionAsks(state, [...lethal].filter((id) => toughnessOf(state, id) > 0), state.destructionAnswers ?? {})};
    });
    /* While something else is being asked (a player conceding mid-question), the choice is not made for its controller: that
       creature waits for the next check, which asks. */
    if (asks.length && !state.awaiting) { state.awaiting = {kind: "destruction-replacement", ...asks[0]}; break; }
    const undecided = new Set(asks.map((ask) => ask.objectId));
    for (const id of [...state.zones.battlefield]) {
      if (!lethal.has(id) || !state.objects[id]) continue;
      const object = state.objects[id];
      /* Through the layers: a land animated this turn is a creature and dies like one, and a
         creature set to 0 toughness by an effect dies whatever its printed toughness says. */
      if (!typesOf(state, id).includes("Creature")) continue;
      /* CR 704.5f: toughness zero or less is PUT INTO the graveyard — not destroyed, so nothing
         that replaces destruction saves it. CR 704.5g: lethal damage destroys. Both end in the
         OWNER's graveyard (CR 108.3), which is why a borrowed creature dying goes home. */
      const toughness = toughnessOf(state, id);
      /* CR 704.5h: damage from a source with deathtouch destroys whatever the toughness. That is a
         state-based action and not the assignment rule -- the assignment rule only decides how much
         has to be put on a blocker before damage may move past it. */
      const deathtouched = object.deathtouched === true && toughness > 0;
      /* CR 702.12b: lethal damage and deathtouch DESTROY, and an indestructible permanent is not destroyed -- it stays,
         damage and all. Toughness zero or less is not destruction (704.5f), so indestructible does not save it. */
      const destroyed = !(toughness <= 0) && (deathtouched || (object.damage > 0 && object.damage >= toughness));
      if (destroyed && keywordsOf(state, id).includes("Indestructible")) continue;
      if (destroyed && undecided.has(id)) continue;
      /* Or regenerated (CR 701.19a): a shield on it replaces the destruction -- or an Aura's umbra armor (CR 702.89a), the one
         its controller chose when several would (above; effects/zones.mjs, destructionReplaced). */
      if (destroyed && destructionReplaced(state, id, events, {chosen: takeDestructionAnswer(state, id)})) { acted = true; continue; }
      if (toughness <= 0 || deathtouched || (object.damage > 0 && object.damage >= toughness)) {
        /* Face down, revealed as it moves (CR 708.9). */
        const card = leavingRef(state, id);
        /* WHAT DIED, IN FULL. A "whenever this creature dies" trigger has to be found after the
           creature is gone, and a zone change makes a new object (CR 400.7), so by then nothing on
           the board carries those abilities. This snapshot is the look-back CR 603.10a describes
           and the last known information CR 113.7a requires; without it the trigger either never
           fires or fires without the numbers it is owed. `lastKnown` runs the layers, so what is
           recorded is what died — counters and anthems included. */
        const leftBehind = lastKnown(state, id);
        /* CR 614.1: the death is a PROPOSAL until the replacement effects have had it. A creature
           that would die and is exiled instead did not die, so the event reported below is the
           replaced one — reporting a death and then moving the card elsewhere would be describing
           something that never happened, and every death-watcher would believe it. */
        const {proposal} = applyReplacements(state, {
          event: "zone-change", objectId: id, from: "battlefield", to: "graveyard", player: object.controller,
        });
        /* A commander dies like any creature (CR 903.9a is a state-based action, not a replacement): its owner is
           asked below, once it is in the graveyard and everything else has settled. */
        const destination = proposal.to;
        const died = moveObject(state, id, destination, destination === "graveyard" || destination === "hand" || destination === "library"
          ? object.owner : null);
        events.push(event("GameEventCardChangeZone", state, {
          card,
          leftBehind,
          /* What it became (CR 400.7e): a creature that died to damage is returned by "return that card" like any other. */
          ...(PUBLIC_ZONES.includes(destination) ? {becomes: died} : {}),
          from: {zoneType: "Battlefield", player: {playerId: object.controller}},
          to: {zoneType: ZONE_LABEL[destination] ?? destination, player: {playerId: object.owner}},
        }));
        /* What it exiled "until this leaves the battlefield", back (CR 610.3). */
        returnExiledUntil(state, id, events, leftBehind);
        acted = true;
      }
    }

    /* CR 704.5i: a planeswalker with loyalty 0 is put into its owner's graveyard -- put, not destroyed, so indestructible
       does not keep it; through the replacements and with its last known information. Read with the lethal creatures
       above, so one that was a creature too and died is gone. */
    for (const id of spent) {
      const object = state.objects[id];
      if (!object || object.zone !== "battlefield") continue;
      const card = cardRef(state, id);
      const leftBehind = lastKnown(state, id);
      const {proposal} = applyReplacements(state, {event: "zone-change", objectId: id, from: "battlefield", to: "graveyard", player: object.controller});
      const went = moveObject(state, id, proposal.to, PER_PLAYER.includes(proposal.to) ? object.owner : null);
      events.push(event("GameEventCardChangeZone", state, {
        card, leftBehind, ...(PUBLIC_ZONES.includes(proposal.to) ? {becomes: went} : {}),
        from: {zoneType: "Battlefield", player: {playerId: object.controller}},
        to: {zoneType: ZONE_LABEL[proposal.to] ?? proposal.to, player: {playerId: object.owner}},
      }));
      returnExiledUntil(state, id, events, leftBehind);
      acted = true;
    }

    /* CR 714.4: a Saga whose lore counters have reached its final chapter, and that is the source of no chapter ability
       that has triggered and not yet left the stack, is sacrificed. */
    for (const id of [...state.zones.battlefield]) {
      const object = state.objects[id];
      const chapters = (object.abilities ?? []).filter((a) => a.kind === "triggered" && Number.isInteger(a.trigger?.chapter));
      if (!chapters.length || (object.counters?.lore ?? 0) < Math.max(...chapters.map((a) => a.trigger.chapter))) continue;
      const ids = new Set(chapters.map((a) => a.id));
      if (state.stack.some((e) => e.cardId === id && ids.has(e.abilityId)) || (state.pendingTriggers ?? []).some((p) => p.source?.cardId === id && ids.has(p.abilityId))) continue;
      if (sacrificeOne(state, id, events) !== null) acted = true;
    }

    for (const player of state.players) {
      const reason = lossReason(state, player);
      if (!reason) continue;
      /* "You can't lose the game" (Darksteel Angel; CR 104.3, 104.2b): no state-based action takes the game from its
         controller -- conceding still does (CR 104.3a). */
      if (reason !== "conceded" && playerRuled(state, "cant-lose", player.id)) continue;
      player.lost = true;
      player.lostTo = reason;
      events.push(event("GameEventPlayerLivesChanged", state, {
        player: {playerId: player.id, name: player.name},
        oldLives: player.life, newLives: player.life, lost: true, lossReason: reason,
      }));
      removePlayerFromBoard(state, player.id, events);
      acted = true;
    }

    if (!acted) {
      /* CR 903.9a: a commander put into a graveyard or exile since the last check -- its OWNER may put it into the
         command zone, so the engine stops and asks (rules/commander.mjs). Last, once the rest has settled: a player
         who lost is not asked, and a game that is over asks nobody anything. */
      if (!state.awaiting && !gameOver(state)) {
        /* Only read: every object derived once (rules/layers.mjs, deriving). */
        const ask = deriving(state, () => legendToAsk(state) ?? commanderToAsk(state));
        if (ask) state.awaiting = ask;
      }
      break;
    }
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
 * A player concedes (CR 104.3a: at any time) and leaves the game as any player who loses does (CR 800.4a),
 * through the state-based actions above, so their permanents go with them and turn order and priority skip
 * them from then on.
 *
 * WHAT THEY WERE DOING GOES WITH THEM. A decision they were being asked is withdrawn: a player who has left
 * has no discard to make and no attack to declare. If they held priority it passes to the next player still
 * in the game, and the round of passes starts again (CR 117.4 counts passes in succession, and the player
 * who would have passed is gone).
 *
 * @returns {Array} events for the caller to journal
 */
export function concede(state, playerId) {
  const player = state.players[playerId];
  if (!player) throw new Error("There is no such player to concede");
  if (player.lost) throw new Error("That player has already left the game");
  player.conceded = true;
  if (state.awaiting && state.awaiting.player === playerId) state.awaiting = null;
  const events = checkStateBasedActions(state);
  if (state.priorityPlayer === playerId) {
    const count = state.players.length;
    let next = null;
    for (let step = 1; step < count && next === null; step += 1) {
      const at = (playerId + step) % count;
      if (!state.players[at].lost) next = at;
    }
    state.priorityPlayer = gameOver(state) ? null : next;
    state.passes = 0;
  }
  return events;
}

/* ---- CR 616.1, which replaces a destruction ---- */

/* The answer its controller gave for this creature, used up. */
function takeDestructionAnswer(state, id) {
  const answer = state.destructionAnswers?.[id];
  if (answer === undefined) return undefined;
  delete state.destructionAnswers[id];
  if (!Object.keys(state.destructionAnswers).length) delete state.destructionAnswers;
  return answer;
}

/**
 * The answer to "destruction-replacement": kept for that creature, and the whole check made again, which uses it.
 *
 * @returns {Array} events for the caller to journal
 */
export function finishDestructionChoice(state, awaiting, indices) {
  const key = Array.isArray(indices) && indices.length === 1 ? awaiting.options[indices[0]] : undefined;
  if (key === undefined) throw new Error("Choose the one effect that replaces it");
  (state.destructionAnswers ??= {})[awaiting.objectId] = key;
  state.awaiting = null;
  return checkStateBasedActions(state);
}

/* ---- CR 704.5j, the legend rule ---- */

/* The first player, in turn order from the active player (CR 101.4), with two or more legendary permanents of one name:
   the question for them, or null. A face-down permanent has no name (CR 708.2), so it is in no group. */
function legendToAsk(state) {
  const count = state.players.length;
  for (let step = 0; step < count; step += 1) {
    const player = ((state.activePlayer ?? 0) + step) % count;
    /* "The 'legend rule' doesn't apply to permanents you control this turn" (Hall of Echoes): an effect of that player's
       (effectUntil's `rule: "no-legend-rule"`), for the turn. */
    if ((state.effects ?? []).some((e) => e.rule === "no-legend-rule" && e.sourceController === player)) continue;
    const byName = new Map();
    for (const id of state.zones.battlefield) {
      const object = state.objects[id];
      if (object.faceDown === true || !(object.supertypes ?? []).includes("Legendary") || controllerOf(state, id) !== player) continue;
      byName.set(object.card, [...(byName.get(object.card) ?? []), id]);
    }
    for (const [name, objectIds] of byName) if (objectIds.length > 1) return {kind: "legend-rule", player, name, objectIds};
  }
  return null;
}

/** The legend rule's question (§12.1): which one to keep. Each is told apart in words -- tapped, counters, damage, the
    turn it arrived -- and numbered only where those are the same. */
export function legendChoice(state, awaiting) {
  const ids = awaiting.objectIds.filter((id) => state.objects[id]?.zone === "battlefield");
  const describe = (id) => {
    const o = state.objects[id];
    const counters = Object.entries(o.counters ?? {}).filter(([, n]) => n > 0).map(([kind, n]) => `${n} ${kind}`);
    return [o.tapped ? "tapped" : "untapped", ...counters, ...(o.damage > 0 ? [`${o.damage} damage`] : []), `arrived turn ${o.arrivedTurn ?? 0}`].join(", ");
  };
  const words = ids.map(describe);
  return {
    id: `legend-rule:${state.turn}:${ids.join("-")}`,
    title: `The legend rule: keep which ${awaiting.name}?`,
    mode: "one",
    min: 1,
    max: 1,
    options: ids.map((id, index) => ({index, cardId: id,
      label: `Keep ${awaiting.name} (${words[index]}${words.filter((w) => w === words[index]).length > 1 ? `, #${index + 1}` : ""})`})),
  };
}

/**
 * Finish the legend rule: the one chosen stays, and each other is put into its owner's graveyard -- through the
 * replacements, with its last known information, as a death (effects/zones.mjs, moveOne). Then the whole check again.
 *
 * @returns {Array} events for the caller to journal
 */
export function finishLegendRule(state, awaiting, indices) {
  const ids = awaiting.objectIds.filter((id) => state.objects[id]?.zone === "battlefield");
  if (!Array.isArray(indices) || indices.length !== 1 || ids[indices[0]] === undefined) throw new Error("Choose the one to keep");
  const keep = ids[indices[0]];
  state.awaiting = null;
  const events = [];
  for (const id of ids) if (id !== keep) moveOne(state, id, "graveyard", events, {owner: state.objects[id].owner});
  events.push(...checkStateBasedActions(state));
  return events;
}

/**
 * Finish CR 903.9a once a commander's owner has answered: yes moves it from the graveyard or exile to the command
 * zone, no leaves it where it is.
 *
 * The move happens here rather than in `commander.mjs` because this is the module that knows what
 * event to report; that one decides only whether. Afterwards the whole check runs again: another
 * commander may be waiting to be asked about.
 *
 * @returns {Array} events for the caller to journal
 */
export function finishCommanderReplacement(state, awaiting, indices) {
  const id = awaiting.objectId;
  const object = state.objects[id];
  if (!object) throw new Error("That commander is no longer there to move");
  const home = resolveCommanderChoice(state, awaiting, indices);
  const events = [];
  if (home) {
    const card = cardRef(state, id);
    const from = object.zone;
    const moved = moveObject(state, id, "command", object.owner);
    events.push(event("GameEventCardChangeZone", state, {
      card,
      becomes: moved,
      from: {zoneType: ZONE_LABEL[from] ?? from, player: {playerId: object.owner}},
      to: {zoneType: "Command", player: {playerId: object.owner}},
    }));
  }
  events.push(...checkStateBasedActions(state));
  return events;
}

/**
 * Whether the game is over, and who won.
 *
 * CR 104.2a: a player still in a game all of whose opponents have left wins. CR 104.4a: if every
 * player leaves at once, the game is a draw — which is a real outcome with a real report, not a
 * crash and not an arbitrary winner.
 */
/* Whether a static ability of a permanent `player` controls changes this rule for them ("you can't lose the game"), or --
   `opponents` -- one of an opponent of theirs does ("your opponents can't win the game"). */
export function playerRuled(state, rule, player, {opponents = false} = {}) {
  return state.zones.battlefield.some((id) => {
    const controller = controllerOf(state, id);
    if (opponents ? controller === player : controller !== player) return false;
    return (state.objects[id].abilities ?? []).some((a) => a.kind === "static" && a.rule === rule);
  });
}

export function gameOver(state) {
  /* "You win the game" (CR 104.2b, effects/resources.mjs winGame): over at once, that player the winner -- before any
     state-based action could take it from them (CR 104.1). */
  const won = state.players.find((p) => p.won === true);
  if (won) return {winner: won.id, reason: "won by an effect"};
  const alive = state.players.filter((p) => !p.lost);
  if (alive.length === 1) return {winner: alive[0].id, reason: "last player standing"};
  if (alive.length === 0) return {winner: null, reason: "all players lost"};
  return null;
}
