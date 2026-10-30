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

import {characteristicsOf, deriving, staticAbilities} from "./rules/layers.mjs";
import {conditionHolds} from "./script/condition.mjs";
import {commanderKeyOf} from "./state/index.mjs";
import {commanderTax} from "./rules/commander.mjs";

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
/* WHO MAY LOOK AT A FACE-DOWN CARD. On the battlefield, its controller (CR 708.5). In exile, nobody unless an instruction
   allows it (CR 406.3): hideaway's "the player who controls the permanent that exiled this card may look at this card"
   (702.75a) -- `lookers`, each player who has been allowed to, and who goes on being able to until it leaves exile (406.3)
   -- and never its owner merely for owning it. And the one answer the rules ask too: a card exiled face down is played
   only by a player who may look at it (CR 406.3b; rules/actions.mjs), so an offer naming it is never made to anyone else. */
export function mayLookAt(state, object, viewer, controller = null) {
  if (object.zone === "battlefield") return viewer === controller;
  if (object.zone === "exile") {
    const by = object.exiledBy !== undefined ? state.objects[object.exiledBy] : null;
    return (object.lookers ?? []).includes(viewer) || (by?.zone === "battlefield" && characteristicsOf(state, by.id).controller === viewer);
  }
  return false;
}
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
    ...(faceDown && viewer !== null && object.faceDownCard?.card && mayLookAt(state, object, viewer, controller) ? {faceDownName: object.faceDownCard.card} : {}),
    owner: object.owner,
    controller,
    tapped: object.tapped,
    damage: object.damage,
    counters: {...object.counters},
    /* Physical battlefield facts are public even when a face is hidden. Keep current reciprocal attachments only:
       a zone change makes a new object, and an Aura in a hidden zone must never gain an identity through its old host. */
    ...(object.zone === "battlefield" ? {
      ...(object.token === true ? {token: true} : {}),
      /* WHICH FACE IS UP (ROB-207; the UI's request #5): the back face of a double-faced permanent, said with its name. A name
         cannot say which side of one picture to draw (a modal double-faced land played as its back face, Mistgate Pathway).
         The front is the default and says nothing; `face` is only ever "back" here (an adventure's face is not a permanent's). */
      ...(named && object.face === "back" ? {face: "back"} : {}),
      attachments: (object.attachments ?? []).filter(id => state.objects[id]?.zone === "battlefield" && state.objects[id].attachedTo === object.id),
    } : {}),

    /* CURRENT characteristics for anything on the battlefield, so the board draws the creature a
       player is actually looking at rather than what was printed on the card. Elsewhere there is
       nothing to derive: a card in a graveyard is its printed self. */
    types: shown ? [...current.types] : [],
    power: shown ? current.power : null,
    toughness: shown ? current.toughness : null,
    /* CR 310.4, 310.9: a visible battlefield Battle's defense and protector are public. Printed identity stays hidden
       for face-down cards; a copied Battle reports its copied defense, not its original card's number. */
    ...(named && object.zone === "battlefield" && current.types.includes("Battle") ? {
      ...(Number.isInteger(current.printedDefense) ? {printedDefense: current.printedDefense} : {}), defense: current.defense,
      ...(Number.isInteger(object.protector) ? {protector: object.protector} : {}),
    } : {}),
    keywords: shown ? [...current.keywords] : [],
    ...(object.zone === "battlefield" && object.merged ? {components: object.merged.map(part => ({
      name: part.faceDown && viewer !== controller ? null : part.physical.card, faceDown: part.faceDown === true,
      commander: part.physical.commander === true})), mutations: object.mutations ?? 0,
      text: (current.abilities ?? object.abilities ?? []).map(a => a.text).filter(Boolean).join("\n")} : {}),
    ...(object.zone === "battlefield" && state.players.some(p => p.ring?.bearer === id && p.id === controller) ? {ringBearer: true} : {}),
    /* A Class's level (CR 716.2a), a designation anyone can see (716.2b); none is level 1 (716.2d). */
    ...(Number.isInteger(object.level) ? {level: object.level} : {}),
    /* Monstrous (CR 701.37b) and prepared (CR 722.3a): designations, which anyone can see (script/effects/attributes.mjs). */
    ...(object.monstrous === true ? {monstrous: true} : {}),
    ...(object.prepared === true ? {prepared: true} : {}),
    /* The inset spell is a distinct copy in public exile, not another activation of the creature (CR 722.3c).
       Its identity lets the board associate that legal cast with the prepared card without inventing an action. */
    ...(named && object.prepared === true && state.objects[object.preparedCopy]?.zone === "exile" && !state.objects[object.preparedCopy].faceDown
      ? {preparedSpell: {cardId: object.preparedCopy, name: state.objects[object.preparedCopy].card, manaCost: state.objects[object.preparedCopy].manaCost ?? null}} : {}),
    /* Solved (CR 719.3b): a Case's designation, which anyone can see. */
    ...(object.solved === true ? {solved: true} : {}),
    commander: object.commander === true,
    /* An emblem (CR 114), public in the command zone: what it does, its abilities' words, for the board to show. */
    ...(object.emblem === true ? {emblem: true, text: object.emblemOracleText ?? (object.abilities ?? []).map((a) => a.text).filter(Boolean).join("\n")} : {}),
    /* A candidate (card load step 5, Rob's decision 2): written by the card compiler, not yet reviewed, so the board labels
       it and offers "report a wrong card". Said only of a card this seat can name, as its name is. */
    ...(named && object.candidate === true ? {candidate: true} : {}),
    /* Which commander (state/index.mjs, commanderKeyOf): the key its damage is kept under in every player's
       `health.commanderDamage`, the same in every zone, so the board can say whose commander dealt it. */
    ...(object.commander === true ? {commanderKey: commanderKeyOf(object)} : {}),
    /* What casting it from the command zone costs more (CR 903.8): two for each time its owner has cast it from there,
       public as the number of times it has been cast is. */
    ...(object.commander === true && object.zone === "command" && named ? {commanderTax: commanderTax(state, object.owner, id)} : {}),
  };
}

/* THE TOP OF A LIBRARY, when a permanent its owner controls says so (rules/statics.mjs): "play with the top card of
   your library revealed" shows it to everyone (CR 401.5), "you may look at the top card of your library any time" to
   its owner alone. Never more than that one card, and never without such a permanent. */
function topSeenBy(state, owner, viewer) {
  let revealed = false, looked = false;
  /* Its abilities as they are after layer 6 (CR 613.1f): one that lost them all shows nothing. */
  const held = staticAbilities(state);
  for (const id of state.zones.battlefield) {
    const holder = state.objects[id];
    if (holder.controller !== owner) continue;
    for (const ability of held(id)) {
      if (ability.kind !== "static") continue;
      if (ability.rule === "top-revealed") revealed = true;
      /* "Solved -- You may look at the top card of your library any time" (Case of the Locked Hothouse): while its condition holds. */
      if (ability.rule === "look-at-top" && conditionHolds(state, ability.condition, {controller: owner, source: id})) looked = true;
    }
  }
  /* And for a while, by an effect of theirs: "until end of turn, you may look at the top card of your library any time"
     (Gwenom, Remorseless; script/effects/permanents.mjs, effectUntil). */
  if ((state.effects ?? []).some((e) => e.rule === "look-at-top" && (e.players ?? []).includes(owner))) looked = true;
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

/* A HAND REVEALED (CR 701.20a; effects/asking.mjs, discard's `handRevealed`): "target opponent reveals their hand. You
   choose a nonland card from it" (Render Speechless) -- each card of it shown to every player while the card is chosen, and
   to nobody once the question is gone, however it goes: those of this hand's cards the question revealed. */
/* And a card revealed from an opening hand (CR 103.6b): until the first turn begins. */
/* And A HAND LOOKED AT (CR 701.20e; effects/asking.mjs, handLook): "look at target player's hand" (Gitaxian Probe) -- shown to
   its looker alone (`handLookedBy`), while they look. */
function handShown(state, ids, viewer) {
  const asking = state.awaiting;
  const opening = state.stepIndex === undefined ? state.mulligan?.revealed ?? [] : [];
  return ids.filter((id) => (asking?.handRevealed === true && asking.cards.includes(id)) || (asking?.handLookedBy === viewer && asking.cards.includes(id)) || opening.includes(id));
}

function zoneFor(state, zone, owner, viewer) {
  const ids = zone === "battlefield" || zone === "exile"
    ? state.zones[zone].filter((id) => state.objects[id].owner === owner)
    : state.zones[zone][owner];
  const rule = VISIBILITY[zone];
  const visible = rule === "public" || (rule === "owner" && viewer === owner);
  const looked = zone === "library" ? topLookedAtBy(state, viewer, ids) : 0;
  const cards = visible ? ids.map((id) => cardFor(state, id, true, viewer)).filter(Boolean)
    : zone === "hand" ? handShown(state, ids, viewer).map((id) => cardFor(state, id, true)).filter(Boolean)
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
    /* The monarch (CR 725): a designation of the game's, public, one player's at most (725.3) -- said only of that player. */
    ...(state.monarch === player.id ? {monarch: true} : {}),
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
    /* Where the turn is in the game, for the table's labels (Linear ROB-76; rules/turn.mjs, nextRound): `turn` counts
       every turn taken, an extra one too. `round` and `turnInRound` are null for a game saved before rounds were kept. */
    round: Number.isInteger(state.round) ? state.round : null,
    turnInRound: Number.isInteger(state.turnInRound) ? state.turnInRound : null,
    turnId: state.turn > 0 ? `turn:${state.turn}` : null,
    extraTurn: state.extraTurn === true,
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
