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
      /* Commander damage is per source, so it is a map keyed by the commander's object id and
         summed per player by whatever reads it — a seat with partners has two rows. */
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
export function addObject(state, object, zone, player = null) {
  assertZone(state, zone, player);
  const id = state.nextObjectId;
  state.nextObjectId += 1;
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
    keywords: Array.isArray(object.keywords) ? [...object.keywords] : [],
    /* CR 302.6, summoning sickness: the turn this object came under its controller's control. A
       zone change makes a new object, so an entering permanent gets the current turn and a creature
       that has been out since an earlier one does not. Blank until a turn has begun. */
    controlledSinceTurn: state.turn,
    owner: Number.isInteger(object.owner) ? object.owner : player,
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
    /* CR 903.3: a card designated as a commander stays one wherever it goes, so this survives every
       zone change along with the card's own characteristics. Three modules read it — the tax, the
       command-zone replacement and the 21-damage tally — and for a while none of them could,
       because it was read everywhere and written nowhere. */
    commander: object.commander === true,
    /* From the card script (cards/index.mjs, phase 2.4): what the card does as a spell, which stack.mjs resolves,
       and its printed subtypes, which a selector may ask about. Present only on a card that has them, so an object
       made from a bare kernel definition is the shape it always was. */
    ...(object.spell ? {spell: structuredClone(object.spell)} : {}),
    ...(Array.isArray(object.subtypes) && object.subtypes.length ? {subtypes: [...object.subtypes]} : {}),
    ...(Array.isArray(object.supertypes) && object.supertypes.length ? {supertypes: [...object.supertypes]} : {}),
    /* CR 903.4a: a card's color identity is established before the game and goes with it everywhere; "any color in
       your commander's color identity" reads it off the commander (rules/actions.mjs). */
    ...(Array.isArray(object.colorIdentity) ? {colorIdentity: [...object.colorIdentity]} : {}),
  };
  state.nextTimestamp += 1;
  listFor(state, zone, player).push(id);
  return id;
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
export function moveObject(state, id, zone, player = null) {
  const from = state.objects[id];
  if (!from) throw new Error(`There is no object ${id} to move`);
  assertZone(state, zone, player);

  const fromList = listFor(state, from.zone, from.zonePlayer);
  const at = fromList.indexOf(id);
  if (at >= 0) fromList.splice(at, 1);
  delete state.objects[id];

  /* Only what the CARD says survives the move: its identity, its printed types and its owner. The
     owner does (CR 108.3): a card goes to its OWNER's graveyard however long someone else
     controlled it. Counters, damage, attachments and control do not — that is CR 400.7. */
  return addObject(state, {
    card: from.card, types: from.types, manaCost: from.manaCost, abilities: from.abilities,
    power: from.power, toughness: from.toughness, keywords: from.keywords,
    owner: from.owner, controller: from.owner, token: from.token, commander: from.commander,
    spell: from.spell, subtypes: from.subtypes, supertypes: from.supertypes, colorIdentity: from.colorIdentity,
  }, zone, player);
}
