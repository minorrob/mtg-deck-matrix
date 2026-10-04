/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* THE GAME STATE: PLAIN DATA, ONE OBJECT IN ONE ZONE.
 *
 * `docs/engine/PLAN.md` §3.1 (state/) and §3.2.4 — game state is plain data, so a checkpoint is
 * `structuredClone(state)` and resume from any decision is a first-class feature. Nothing here is
 * a class, nothing holds a function, and nothing is shared between two states.
 *
 * Comprehensive Rules this file implements:
 *   CR 108.3   a card's owner is the player it started under, whatever zone it reaches
 *   CR 109     objects, and what an object is
 *   CR 400     zones; which are shared and which each player has their own of
 *   CR 400.7   A CARD THAT CHANGES ZONES BECOMES A NEW OBJECT. This is the rule most worth
 *              getting right: a creature that dies and comes back does not remember its counters,
 *              is not what "exile it until this leaves" was tracking, and is not the same object
 *              for any effect that was watching it. Modeling a move as "same object, new zone" is
 *              the defect that produces boards nobody can explain.
 *   CR 613.7   timestamps, which layers will order by in 1.8
 *   CR 903.7   Commander starts at 40 life
 *
 * `moveObject` therefore returns a NEW id, and every caller must use the returned one.
 */

/** Zones each player has their own of (CR 400.1). */
export const PER_PLAYER = ["library", "hand", "graveyard", "command"];
/* The public zones (CR 400.2). What a card became in one of these can be found by an ability that triggered on the move
   (CR 400.7e) -- "return that card to its owner's hand" -- so every move to one names it (`becomes`). */
export const PUBLIC_ZONES = Object.freeze(["battlefield", "graveyard", "exile", "stack", "command"]);
/** Zones shared by the table. */
export const SHARED = ["battlefield", "stack", "exile"];
/** Every zone, in no significant order. */
export const ZONES = [...PER_PLAYER, ...SHARED];

const STARTING_LIFE = 40;

/**
 * A new game state.
 *
 * @param {{matchId: string, seed: string, players: Array<{name: string}>, startingLife?: number, drawBeat?: boolean}} pod
 */
export function createState(pod) {
  const seats = pod?.players ?? [];
  if (seats.length < 2) throw new Error("A game needs at least two players");
  if (seats.length > 4) throw new Error("A table seats at most four players");
  /* CR 903.7 starts a Commander game at 40 life; a table's host may set another as a house rule (Rob, 2026-09-30), and
     the pod carries it. Anything but a whole number from 1 to 999 is refused rather than guessed at. */
  const life = pod?.startingLife ?? STARTING_LIFE;
  if (!Number.isInteger(life) || life < 1 || life > 999) throw new Error("A game starts each player at a whole number of life from 1 to 999");

  const zones = {};
  for (const zone of PER_PLAYER) zones[zone] = seats.map(() => []);
  for (const zone of SHARED) zones[zone] = [];

  return {
    schema: "CrankEngineState@1",
    matchId: pod.matchId ?? null,
    seed: pod.seed ?? null,
    /* Turn zero means "before the first turn"; the turn structure moves it to 1 in 1.2. */
    turn: 0,
    phase: null,
    step: null,
    activePlayer: null,
    priorityPlayer: null,
    /* A turn-based action that needs an answer, or null. The engine runs until it needs a decision,
       records what it needs here and returns; the driver offers it and hands back the answer. */
    awaiting: null,
    /* CR 117.4 counts passes IN SUCCESSION, so this is consecutive passes since the last action or
       resolution, never a running total. It lives in the state because a checkpoint taken part way
       through a round has to resume part way through it. */
    passes: 0,
    /* The draw as its own beat (Rob, 2026-09-30; docs/plan-to-done-2026-09-30.md, item 13): a table that asks for it
       holds the draw step's draw until its player says Draw a card. Only a pod that asks carries the key, so every
       game made before it hashes, checkpoints and replays exactly as it did. */
    ...(pod?.drawBeat === true ? {drawBeat: true} : {}),
    players: seats.map((seat, id) => ({
      id,
      name: seat.name ?? `Seat ${id + 1}`,
      life,
      poison: 0,
      /* Commander damage is per commander, so it is a map keyed by the commander's key (`commanderKeyOf`), which
         a zone change keeps -- not by its object id, which a zone change replaces (CR 400.7) -- and read per
         commander by whatever reads it: a seat with partners has two rows. */
      commanderDamage: {},
      /* CR 106.4: a mana pool empties at the end of each step and phase. One counter per color
         plus colorless; kept as a flat object so the state stays plain. */
      manaPool: {W: 0, U: 0, B: 0, R: 0, G: 0, C: 0},
      counters: {},
      /* CR 402.2. Seven unless an effect says otherwise; the cleanup step reads it. */
      maxHandSize: 7,
      landsPlayed: 0,
      /* CR 302.6 reads "since their most recent turn began": the turn number at which this player's latest turn
         started, 0 before their first. Summoning sickness compares with it (keywords/timing.mjs). */
      turnBegan: 0,
      lost: false,
      lostTo: null,
    })),
    zones,
    /* THE STACK IS TWO THINGS AND THEY ARE NOT THE SAME LIST. `zones.stack` holds the cards
       physically on the stack, because a spell's card really is in the stack zone (CR 405.1) and
       the one-object-one-zone invariant covers it. `stack` holds the ENTRIES — a spell, an
       activated ability, a trigger — in resolution order, and an ability has no card at all. They
       are appended and popped together, and `engine-stack` pins that they never drift. */
    stack: [],
    nextStackId: 1,
    objects: {},
    /* Monotonic, and part of the state so a replay assigns the same ids and the same order. */
    nextObjectId: 1,
    nextTimestamp: 1,
  };
}

function assertZone(state, zone, player) {
  if (!ZONES.includes(zone)) throw new Error(`There is no zone called ${JSON.stringify(zone)}`);
  if (PER_PLAYER.includes(zone)) {
    if (!Number.isInteger(player) || player < 0 || player >= state.players.length)
      throw new Error(`The ${zone} zone belongs to a player; pass which one`);
  }
}

const listFor = (state, zone, player) => (PER_PLAYER.includes(zone) ? state.zones[zone][player] : state.zones[zone]);

/**
 * Put a new object into a zone. Returns its id.
 *
 * `card` is the definition's name or id; the engine never stores card TEXT in the state, only a
 * reference, so a state stays small and the card directory stays the one place text lives.
 */
/* A modal double-faced card's face (CR 712.8): its characteristics, from the card's own two. */
const FACE_KEYS = ["card", "types", "subtypes", "supertypes", "manaCost", "colors", "power", "toughness", "loyalty", "keywords", "abilities", "spell", "enchant"];
function faceOf(mdfc, face) {
  const side = face === "back" ? mdfc.back : mdfc.front;
  return Object.fromEntries(FACE_KEYS.map((key) => [key, side[key]]));
}

/** Turn a modal double-faced card in a player's hand to the face it is played with (CR 712.12): before it moves, so how
    it enters is that face's own "as this land enters". */
export function showFace(state, id, face) {
  const object = state.objects[id];
  if (!object?.mdfc) return;
  Object.assign(object, faceOf(object.mdfc, face));
  if (face === "back") object.face = "back"; else delete object.face;
}

export function addObject(state, object, zone, player = null) {
  assertZone(state, zone, player);
  /* A MODAL DOUBLE-FACED CARD (CR 712.8): the characteristics of the face that is up -- its front, unless it was played
     with its back face up (`face`), which only a permanent can be (rules/actions.mjs). */
  if (object.mdfc) object = {...object, ...faceOf(object.mdfc, object.face), mdfc: object.mdfc, face: object.face === "back" ? "back" : undefined};
  const id = state.nextObjectId;
  state.nextObjectId += 1;
  const owner = Number.isInteger(object.owner) ? object.owner : player;
  state.objects[id] = {
    id,
    card: object.card ?? null,
    /* The card's PRINTED types (CR 109.3). What an object's types currently are is the layer
       system's answer (CR 613, phase 1.8); this is the base it starts from, and it comes from the
       card definition once the directory exists in phase 2. */
    types: Array.isArray(object.types) ? [...object.types] : [],
    /* The printed mana cost, as text, and the abilities the card grants. Both come from the card
       definition once `CrankCardScript@1` exists in phase 2; the kernel's tests set them directly,
       which is how the field names get shaped by real cards before the schema is written. */
    manaCost: object.manaCost ?? null,
    abilities: Array.isArray(object.abilities) ? structuredClone(object.abilities) : [],
    /* Printed power and toughness, and the printed keywords. Null P/T is right for everything that
       is not a creature; the layer system (CR 613, 1.8) decides what they currently are. */
    power: Number.isInteger(object.power) ? object.power : null,
    toughness: Number.isInteger(object.toughness) ? object.toughness : null,
    /* A planeswalker's printed loyalty (CR 306.5a); on the battlefield its loyalty is its loyalty counters (306.5c). */
    ...(Number.isInteger(object.loyalty) ? {loyalty: object.loyalty} : {}),
    keywords: Array.isArray(object.keywords) ? [...object.keywords] : [],
    /* CR 302.6, summoning sickness: the turn this object came under its controller's control. A
       zone change makes a new object, so an entering permanent gets the current turn and a creature
       that has been out since an earlier one does not. Blank until a turn has begun. */
    controlledSinceTurn: state.turn,
    /* The turn it arrived in this zone: "destroy all creatures that entered this turn" (Force of Despair). A change of
       control does not touch it (effects/permanents.mjs gainControl). */
    arrivedTurn: state.turn,
    owner,
    controller: Number.isInteger(object.controller) ? object.controller : (object.owner ?? player),
    zone,
    zonePlayer: PER_PLAYER.includes(zone) ? player : null,
    tapped: false,
    counters: {},
    /* What is attached TO this object (auras, equipment), and what this one is attached to. */
    attachments: [],
    attachedTo: null,
    damage: 0,
    timestamp: state.nextTimestamp,
    /* Set by whatever created it; a token ceases to exist as a state-based action (CR 704.5d). */
    token: object.token === true,
    /* A copy of a spell (CR 707.10): a spell on the stack that is no card. Anywhere else it ceases to exist (CR 704.5e). */
    ...(object.copy === true ? {copy: true} : {}),
    /* CR 903.3: a card designated as a commander stays one wherever it goes, so this survives every
       zone change along with the card's own characteristics. Three modules read it — the tax, the
       command-zone replacement and the 21-damage tally — and for a while none of them could,
       because it was read everywhere and written nowhere. */
    commander: object.commander === true,
    /* WHICH commander, for as long as the game lasts. The tax (CR 903.8) counts the times a player cast it from the
       command zone "that game", and the damage (CR 903.10a) is dealt by the same commander "over the course of the
       game" -- across every zone change, each of which makes a new object (CR 400.7). Keyed by the object id they
       were the tally of the object, and the second cast was the first again. Given once, when the card is first made
       a commander; every move carries it. */
    ...(object.commander === true ? {commanderKey: object.commanderKey ?? `${owner}:${id}`} : {}),
    /* From the card script (cards/index.mjs, phase 2.4): what the card does as a spell, which stack.mjs resolves,
       and its printed subtypes, which a selector may ask about. Present only on a card that has them, so an object
       made from a bare kernel definition is the shape it always was. */
    ...(object.spell ? {spell: structuredClone(object.spell)} : {}),
    /* An Aura's Enchant (CR 702.5): what it may be attached to, a selector the state-based actions read (CR 704.5m). */
    ...(object.enchant ? {enchant: structuredClone(object.enchant)} : {}),
    ...(Array.isArray(object.subtypes) && object.subtypes.length ? {subtypes: [...object.subtypes]} : {}),
    ...(Array.isArray(object.supertypes) && object.supertypes.length ? {supertypes: [...object.supertypes]} : {}),
    /* CR 903.4a: a card's color identity is established before the game and goes with it everywhere; "any color in
       your commander's color identity" reads it off the commander (rules/actions.mjs). */
    ...(Array.isArray(object.colorIdentity) ? {colorIdentity: [...object.colorIdentity]} : {}),
    /* The card's printed colors (CR 105.2), the base the layers start from: "a red spell", "white creatures you
       control" and a token's own color read them. Present only on a card that has one, as with subtypes. */
    ...(Array.isArray(object.colors) && object.colors.length ? {colors: [...object.colors]} : {}),
    ...(object.mdfc ? {mdfc: structuredClone(object.mdfc), ...(object.face === "back" ? {face: "back"} : {})} : {}),
  };
  state.nextTimestamp += 1;
  listFor(state, zone, player).push(id);
  return id;
}

/** Which commander an object is (CR 903.3): the key its tax and its damage are kept under, the same in every zone. */
export function commanderKeyOf(object) {
  return object.commanderKey ?? `${object.owner}:${object.id}`;
}

/** An object that ceases to exist (CR 704.5d, 704.5e): out of its zone and out of the game, with no zone change. */
export function removeObject(state, id) {
  const object = state.objects[id];
  if (!object) return;
  const list = listFor(state, object.zone, object.zonePlayer);
  const at = list.indexOf(id);
  if (at >= 0) list.splice(at, 1);
  delete state.objects[id];
}

/** Which zone an object is in, or null if it is gone. */
export function zoneOf(state, id) {
  return state.objects[id]?.zone ?? null;
}

/** The object ids in a zone, in order. A library's order is its order; do not sort it. */
export function cardsIn(state, zone, player = null) {
  assertZone(state, zone, player);
  return listFor(state, zone, player).slice();
}

/**
 * Move a card to another zone.
 *
 * RETURNS A NEW ID (CR 400.7). The object that arrives is not the object that left: no counters,
 * no damage, no attachments, and nothing that was tracking the old one is tracking this. Callers
 * must use the returned id; the old one stops existing.
 */
/* "ACTIVATE ONLY ONCE EACH TURN" (CR 602.5b) AND "THIS ABILITY TRIGGERS ONLY ONCE EACH TURN": counted on the object
   itself, so the limit stays with it when its controller changes (602.5b), and a new object (CR 400.7) starts afresh --
   moveObject carries no count across. `key` is the ability's id (an activation) or "trigger:" and its id. */
export function usesThisTurn(state, id, key) {
  const used = state.objects[id]?.used;
  return used && used.turn === state.turn ? used.counts[key] ?? 0 : 0;
}
export function recordUse(state, id, key) {
  const object = state.objects[id];
  if (!object) return;
  if (!object.used || object.used.turn !== state.turn) object.used = {turn: state.turn, counts: {}};
  object.used.counts[key] = (object.used.counts[key] ?? 0) + 1;
}

export function moveObject(state, id, zone, player = null) {
  const current = state.objects[id];
  if (!current) throw new Error(`There is no object ${id} to move`);
  /* A permanent that became a copy moves as itself (CR 400.7; effects/permanents.mjs, becomeCopy). */
  const from = current.uncopied ? {...current, ...current.uncopied} : current;
  assertZone(state, zone, player);

  const fromList = listFor(state, from.zone, from.zonePlayer);
  const at = fromList.indexOf(id);
  if (at >= 0) fromList.splice(at, 1);
  delete state.objects[id];
  /* Revolt's "if a permanent left the battlefield under your control this turn" (Hidden Stockpile): counted for its
     controller as it left -- every departure moves through here (script/amount.mjs, permanentsLeftThisTurn; cleared as a
     turn begins, rules/turn.mjs). */
  if (from.zone === "battlefield" && state.players[from.controller]) state.players[from.controller].leftThisTurn = (state.players[from.controller].leftThisTurn ?? 0) + 1;

  /* Only what the CARD says survives the move: its identity, its printed types and its owner. The
     owner does (CR 108.3): a card goes to its OWNER's graveyard however long someone else
     controlled it. Counters, damage, attachments and control do not — that is CR 400.7. */
  return addObject(state, {
    /* A double-faced card keeps the face that was up only onto the battlefield, where it was put that way; anywhere else
       it is its front (CR 712.8a). */
    ...(from.mdfc ? {mdfc: from.mdfc, face: zone === "battlefield" && from.face === "back" ? "back" : undefined} : {}),
    card: from.card, types: from.types, manaCost: from.manaCost, abilities: from.abilities,
    power: from.power, toughness: from.toughness, loyalty: from.loyalty, keywords: from.keywords,
    owner: from.owner, controller: from.owner, token: from.token, copy: from.copy, commander: from.commander,
    commanderKey: from.commander === true ? commanderKeyOf(from) : undefined,
    spell: from.spell, subtypes: from.subtypes, supertypes: from.supertypes, colorIdentity: from.colorIdentity, colors: from.colors,
    enchant: from.enchant,
  }, zone, player);
}
