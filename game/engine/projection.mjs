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

import {characteristicsOf} from "./rules/layers.mjs";

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
   SOMETHING is there — but carries no name, because that is the whole of what face-down means. */
function cardFor(state, id, canSeeFace) {
  const object = state.objects[id];
  if (!object) return null;
  const faceDown = object.faceDown === true;
  const named = canSeeFace && !faceDown;
  const current = object.zone === "battlefield" ? characteristicsOf(state, id) : object;
  return {
    cardId: object.id,
    name: named ? object.card : null,
    faceDown,
    owner: object.owner,
    controller: object.zone === "battlefield" ? current.controller : object.controller,
    tapped: object.tapped,
    damage: object.damage,
    counters: {...object.counters},
    /* CURRENT characteristics for anything on the battlefield, so the board draws the creature a
       player is actually looking at rather than what was printed on the card. Elsewhere there is
       nothing to derive: a card in a graveyard is its printed self. */
    types: named ? [...current.types] : [],
    power: named ? current.power : null,
    toughness: named ? current.toughness : null,
    keywords: named ? [...current.keywords] : [],
    commander: object.commander === true,
  };
}

function zoneFor(state, zone, owner, viewer) {
  const ids = zone === "battlefield" || zone === "exile"
    ? state.zones[zone].filter((id) => state.objects[id].owner === owner)
    : state.zones[zone][owner];
  const rule = VISIBILITY[zone];
  const visible = rule === "public" || (rule === "owner" && viewer === owner);
  const cards = visible ? ids.map((id) => cardFor(state, id, true)).filter(Boolean) : [];
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
          attacker: a.attacker, defender: a.defender, blocked: a.blocked, blockers: [...a.blockers],
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
