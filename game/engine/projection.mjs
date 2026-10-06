/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* WHAT A SEAT MAY SEE.
 *
 * `docs/engine/PLAN.md` §3.2.2 — "the engine holds one authoritative state; every seat, every pilot
 * and every report reads through `projection.mjs`, which decides visibility from ONE function. No
 * caller ever receives an engine object." And §3.8: "seat visibility is enforced inside the engine,
 * not by the host, so a cloud host that serves many tables cannot leak a hand by a routing
 * mistake." The phase 1 gate's third clause is this file: no hidden card in any seat projection.
 *
 * WHY VISIBILITY IS DECIDED HERE AND NOWHERE ELSE. A projection is what crosses every boundary —
 * the browser seat, the guest gateway, an API pilot, and eventually a network. If each caller
 * decided what to include, every caller would be a place to get it wrong, and the one that got it
 * wrong would show somebody else's hand. Deciding it once means a routing mistake in the host can
 * lose a game but cannot leak one.
 *
 * A COUNT IS NOT A CARD. An opponent's hand is a number and a library is a number; the board draws
 * both, and neither carries what the cards are. The realistic failure here is not a deliberate leak
 * but a zone serialized wholesale because it was convenient, with the UI happening not to render
 * it — which is why `engine-projection` checks every string anywhere in the document rather than
 * the zones somebody thought to look at.
 *
 * A LIBRARY IS HIDDEN FROM ITS OWNER TOO (CR 401.2). That is the case an engine forgets, because
 * "your own zones" is the obvious rule and it is the wrong one.
 *
 * THE SHAPE IS `CommanderProbeProjection@1`, which `crankmagic-game.js` and `game/ui/*` already
 * render. It is pinned in §12.1 and reproduced here, not designed.
 */

import {characteristicsOf, deriving} from "./rules/layers.mjs";
import {commanderKeyOf} from "./state/index.mjs";

export const PROJECTION_SCHEMA = "CommanderProbeProjection@1";

/* The zone names the board uses. The engine's own keys are lower case; this is the boundary. */
const ZONE_NAMES = {
  library: "Library", hand: "Hand", battlefield: "Battlefield",
  graveyard: "Graveyard", exile: "Exile", command: "Command",
};

/* Who may see the cards in a zone.
 *
 *   public   everybody (CR 400.2)
 *   owner    only the zone's player
 *   nobody   not even its owner, until something looks (CR 401.2)
 *
 * The command zone is public: a commander sitting there is known to the table (CR 903.6). */
const VISIBILITY = {
  battlefield: "public",
  graveyard: "public",
  exile: "public",
  command: "public",
  hand: "owner",
  library: "nobody",
};

/* One card, as a viewer may see it. A face-down permanent is present — everyone can see that
   SOMETHING is there — but carries no name, because that is the whole of what face-down means.
   What it is face down IS public: a 2/2 creature with no name (CR 708.2a), and whatever effects have made of it, so the
   board draws that. What card it is, only its controller may look at (CR 708.5): `faceDownName`, in that seat's view
   alone. Everyone else learns it as it turns face up or leaves the battlefield (708.8, 708.9). */
function cardFor(state, id, canSeeFace, viewer = null) {
  const object = state.objects[id];
  if (!object) return null;
  const faceDown = object.faceDown === true;
  const named = canSeeFace && !faceDown;
  const shown = named || (canSeeFace && faceDown && object.zone === "battlefield");
  const current = object.zone === "battlefield" ? characteristicsOf(state, id) : object;
  const controller = object.zone === "battlefield" ? current.controller : object.controller;
  return {
    cardId: object.id,
    name: named ? object.card : null,
    faceDown,
    /* CR 708.5: its controller, and nobody else, may look at it. */
    ...(faceDown && viewer !== null && viewer === controller && object.faceDownCard?.card ? {faceDownName: object.faceDownCard.card} : {}),
    owner: object.owner,
    controller,
    tapped: object.tapped,
    damage: object.damage,
    counters: {...object.counters},
    /* CURRENT characteristics for anything on the battlefield, so the board draws the creature a
       player is actually looking at rather than what was printed on the card. Elsewhere there is
       nothing to derive: a card in a graveyard is its printed self. */
    types: shown ? [...current.types] : [],
    power: shown ? current.power : null,
    toughness: shown ? current.toughness : null,
    keywords: shown ? [...current.keywords] : [],
    /* A Class's level (CR 716.2a), a designation anyone can see (716.2b); none is level 1 (716.2d). */
    ...(Number.isInteger(object.level) ? {level: object.level} : {}),
    commander: object.commander === true,
    /* Which commander (state/index.mjs, commanderKeyOf): the key its damage is kept under in every player's
       `health.commanderDamage`, the same in every zone, so the board can say whose commander dealt it. */
    ...(object.commander === true ? {commanderKey: commanderKeyOf(object)} : {}),
  };
}

/* THE TOP OF A LIBRARY, when a permanent its owner controls says so (rules/statics.mjs): "play with the top card of
   your library revealed" shows it to everyone (CR 401.4), "you may look at the top card of your library any time" to
   its owner alone. Never more than that one card, and never without such a permanent. */
function topSeenBy(state, owner, viewer) {
  let revealed = false, looked = false;
  for (const id of state.zones.battlefield) {
    const holder = state.objects[id];
    if (holder.controller !== owner) continue;
    for (const ability of holder.abilities ?? []) {
      if (ability.kind !== "static") continue;
      if (ability.rule === "top-revealed") revealed = true;
      if (ability.rule === "look-at-top") looked = true;
    }
  }
  return revealed || (looked && viewer === owner);
}

/* THE TOP OF A LIBRARY A PLAYER HAS LOOKED AT (CR 701.20e; effects/zones.mjs, peekAndReveal): "look at the top card of
   target player's library" -- shown to that player alone, and only while those cards are still that library's top, in
   that order: a draw, a shuffle or a card put on top ends it (CR 701.20d). How many of the top cards the viewer knows --
   a look's cards are that library's own objects, so no other library's top can match them. */
function topLookedAtBy(state, viewer, ids) {
  let known = 0;
  for (const look of state.looks ?? []) {
    if (look.viewer !== viewer) continue;
    if (look.ids.every((id, i) => ids[i] === id)) known = Math.max(known, look.ids.length);
  }
  return known;
}

function zoneFor(state, zone, owner, viewer) {
  const ids = zone === "battlefield" || zone === "exile"
    ? state.zones[zone].filter((id) => state.objects[id].owner === owner)
    : state.zones[zone][owner];
  const rule = VISIBILITY[zone];
  const visible = rule === "public" || (rule === "owner" && viewer === owner);
  const looked = zone === "library" ? topLookedAtBy(state, viewer, ids) : 0;
  const cards = visible ? ids.map((id) => cardFor(state, id, true, viewer)).filter(Boolean)
    : zone === "library" && ids.length && (looked || topSeenBy(state, owner, viewer)) ? ids.slice(0, Math.max(1, looked)).map((id) => cardFor(state, id, true)).filter(Boolean) : [];
  return {
    count: ids.length,
    /* Said outright rather than left to be inferred from count minus cards.length, because a
       reader that infers it will infer it wrong the first time a face-down card is in the list. */
    hiddenCount: ids.length - cards.filter((card) => card.name !== null).length,
    cards,
  };
}

function playerFor(state, player, viewer) {
  const zones = {};
  for (const [key, name] of Object.entries(ZONE_NAMES)) zones[name] = zoneFor(state, key, player.id, viewer);
  return {
    playerId: player.id,
    name: player.name,
    life: player.life,
    health: {
      life: player.life,
      poison: player.poison,
      status: player.lost ? "lost" : "active",
      lossReason: player.lostTo ?? null,
      /* CR 903.10a is per commander, so the largest single tally is the number that matters — and
         it is the number the board shows beside a seat. */
      commanderDamageMax: Object.values(player.commanderDamage).reduce((a, b) => Math.max(a, b), 0),
      commanderDamage: {...player.commanderDamage},
    },
    counters: {...player.counters},
    /* A mana pool is public: the board shows it, and so does a table. */
    mana: Object.entries(player.manaPool).filter(([, n]) => n > 0).map(([color, amount]) => ({color, amount})),
    landsPlayed: player.landsPlayed,
    zones,
  };
}

/**
 * The game as one seat sees it.
 *
 * @param {object} state
 * @param {?number} viewer  the seat, or null for a spectator — who sees no hand at all, which is
 *                          the safe default for anyone not in a seat
 */
export function projectFor(state, viewer) {
  /* It only reads: every object it derives, derived once (rules/layers.mjs, deriving). */
  return deriving(state, () => project(state, viewer));
}
function project(state, viewer) {
  if (viewer !== null && !state.players[viewer])
    throw new Error(`There is no seat ${viewer} at this table to project for`);

  return {
    schema: PROJECTION_SCHEMA,
    viewerSeatId: viewer,
    turn: state.turn,
    turnPlayerId: state.activePlayer,
    priorityPlayerId: state.priorityPlayer,
    phase: state.phase,
    players: state.players.map((player) => playerFor(state, player, viewer)),
    combat: state.combat
      ? {
        attackingPlayerId: state.combat.attackingPlayerId,
        defenders: [...state.combat.defenders],
        attacks: state.combat.attacks.map((a) => ({
          attacker: a.attacker, defender: a.defender, ...(a.planeswalker !== undefined ? {planeswalker: a.planeswalker} : {}), blocked: a.blocked, blockers: [...a.blockers],
        })),
      }
      : null,
    /* The stack is public and so is what is on it: casting a spell reveals it (CR 601.2a). */
    stack: state.stack.map((entry) => ({
      stackId: entry.stackId,
      abilityId: entry.abilityId,
      cardId: entry.cardId,
      name: entry.faceDown ? null : entry.name,
      faceDown: entry.faceDown,
      playerId: entry.playerId,
      kind: entry.kind,
      stage: entry.stage,
      targets: structuredClone(entry.targets ?? []),
    })),
    stackSize: state.stack.length,
    gameOver: state.outcomeReported ? {reason: "game over"} : null,
  };
}
