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

/** A successful draw's ordinal this turn (CR 121.2): each card of a multi-card draw is separate.
 * Stored on the event as well as the player so later draws in one resolution cannot change it. */
export function recordDraw(state, player) {
  const who = state.players[player];
  who.drawnThisTurn = (who.drawnThisTurn ?? 0) + 1;
  return who.drawnThisTurn;
}

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

/* A phased-out permanent's list is `phasedOut` (effects/permanents.mjs, phaseOut): it is in no zone a player sees (CR 702.26b),
   and still leaves one when its owner leaves the game or it is exiled (CR 702.26k, 800.4a). */
const listFor = (state, zone, player) => (PER_PLAYER.includes(zone) ? state.zones[zone][player] : zone === "phased" ? state.phasedOut : state.zones[zone]);

/**
 * Put a new object into a zone. Returns its id.
 *
 * `card` is the definition's name or id; the engine never stores card TEXT in the state, only a
 * reference, so a state stays small and the card directory stays the one place text lives.
 */
/* A double-faced card's face (CR 712.8): its characteristics, from the card's own two. `mdfc` holds both faces of any
   double-faced card -- a modal one, or a nonmodal one (`transforming`, CR 712.2) that transforms. */
const FACE_KEYS = ["card", "types", "subtypes", "supertypes", "manaCost", "colors", "power", "toughness", "loyalty", "keywords", "abilities", "spell", "enchant"];
function faceOf(mdfc, face) {
  const side = face === "back" ? mdfc.back : mdfc.front;
  return Object.fromEntries(FACE_KEYS.map((key) => [key, side[key]]));
}

/**
 * TO TRANSFORM A PERMANENT (CR 701.27a): turn it over, so its other face is up -- the same object (CR 712.18), every effect
 * on it still applying, with only the characteristics of the face now up (712.8d, 712.8e) and a new timestamp (613.7g).
 * Only a permanent represented by a double-faced card transforms (701.27c, 712.9) -- a nonmodal one, or a modal one told to
 * (712.3) -- not a copy that is no double-faced card, and not one face down, whose faces are hidden beside it (712.15a;
 * moveObject). Into an instant or sorcery face, nothing happens (701.27d, 712.10). A
 * permanent that is a copy of something else keeps showing the copy (CR 707.2, 712.9's second example): it is its own
 * values, kept beside the copy's, that turn over (effects/permanents.mjs, copyOnto). `transforms` counts the times, for
 * "only if it hasn't transformed since" (701.27f; effects/permanents.mjs, setState).
 *
 * @returns {boolean} whether it transformed
 */
export function transformObject(state, id) {
  const object = state.objects[id];
  if (!object?.mdfc) return false;
  const to = object.face === "back" ? "front" : "back";
  if ((object.mdfc[to].types ?? []).some((type) => type === "Instant" || type === "Sorcery")) return false;
  const values = faceOf(object.mdfc, to);
  const onto = object.uncopied ?? object;
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete onto[key];
    else onto[key] = structuredClone(value);
  }
  if (to === "back") object.face = "back"; else delete object.face;
  object.transforms = (object.transforms ?? 0) + 1;
  object.timestamp = state.nextTimestamp;
  state.nextTimestamp += 1;
  return true;
}

/**
 * THE MANA COST AN OBJECT'S MANA VALUE IS FIGURED FROM (CR 202.3): its own -- but a nonmodal double-faced permanent or
 * spell with its back face up has its front face's (202.3b, 712.8e), and a copy of that back face is no double-faced card
 * and has its own, none (202.3b). A face-down permanent has no mana cost (708.2a). Null for none.
 */
export function valueCostOf(object) {
  if (!object) return null;
  if (object.mdfc?.transforming === true && object.face === "back" && !object.uncopied) return object.mdfc.front.manaCost ?? null;
  return object.manaCost ?? null;
}

/* A FACE-DOWN PERMANENT'S CHARACTERISTICS (CR 708.2a, 701.40a): a nameless 2/2 creature, textless, without subtypes or a
   mana cost -- and so colorless, with no supertype -- its copiable values while it is face down. */
const FACE_DOWN = Object.freeze({card: null, types: ["Creature"], subtypes: [], supertypes: [], manaCost: null, colors: [], power: 2, toughness: 2, keywords: [], abilities: []});
/* A CARD EXILED FACE DOWN (CR 406.3a): no characteristics at all -- no name, no types, no cost, nothing. */
const FACE_DOWN_EXILED = Object.freeze({card: null, types: [], subtypes: [], supertypes: [], manaCost: null, colors: [], power: null, toughness: null, keywords: [], abilities: []});
/* What the card is, kept beside a face-down permanent's own (`faceDownCard`): seen by its controller (CR 708.5,
   projection.mjs), and what it becomes as it is turned face up (708.8) or leaves the battlefield (708.9). */
/* A permanent's copiable values (CR 707.2): what a copy effect writes onto it (effects/permanents.mjs, becomeCopy), its own
   kept beside them as `uncopied` -- only the values it has, so it is the same object woken from storage as in memory. */
export const COPY_KEYS = Object.freeze(["card", "manaCost", "types", "subtypes", "supertypes", "colors", "keywords", "abilities", "power", "toughness", "spell", "enchant"]);
const CARD_KEYS = ["card", "types", "subtypes", "supertypes", "manaCost", "colors", "power", "toughness", "loyalty", "keywords", "abilities", "spell", "enchant", "mdfc", "preparation"];

/**
 * TO TURN A FACE-DOWN PERMANENT FACE UP (CR 708.8): its copiable values go back to the card's own -- a double-faced card's
 * front face (712.15a), as it was kept -- every effect on it still applying, nothing about entering the battlefield
 * happening again, and a new timestamp (613.7f). The same object: its counters, damage and attachments stay.
 */
export function turnFaceUp(state, id) {
  const object = state.objects[id];
  const real = object.faceDownCard;
  delete object.faceDown;
  delete object.faceDownCard;
  for (const key of CARD_KEYS) {
    if (real[key] === undefined) delete object[key];
    else object[key] = structuredClone(real[key]);
  }
  object.timestamp = state.nextTimestamp;
  state.nextTimestamp += 1;
}

/** Turn a modal double-faced card in a player's hand to the face it is played with (CR 712.12): before it moves, so how
    it enters is that face's own "as this land enters". */
export function showFace(state, id, face) {
  const object = state.objects[id];
  if (!object?.mdfc) return;
  Object.assign(object, faceOf(object.mdfc, face));
  if (face === "back") object.face = "back"; else delete object.face;
}

/* AN ADVENTURER CARD (CR 715): two sets of characteristics, its own (`main`) and its Adventure's (`adventure`) -- an instant
   or sorcery with the subtype Adventure (715.2). It has the Adventure's only while it is cast as one and on the stack as one
   (715.3a-b); anywhere else, its own alone (715.4). */
const adventureSide = (adventurer, shown) => Object.fromEntries(FACE_KEYS.map((key) => [key, (shown ? adventurer.adventure : adventurer.main)[key]]));

/** Show an adventurer card as its Adventure (`shown`), or as itself again: what is weighed as it is cast as an Adventure
    (CR 715.3a) -- rules/actions.mjs shows it for the offer and the cast, and puts it back unless the cast moved it. What
    the side shown lacks, the object lacks too, so a look leaves it as it was. */
export function showAdventure(state, id, shown) {
  const object = state.objects[id];
  if (!object?.adventurer) return;
  /* A characteristic the side shown has not (a creature's spell, an Adventure's power) is absent, not present as nothing:
     shown and put back for an offer, the card is exactly as it was -- asking what may be done changes no state. */
  for (const [key, value] of Object.entries(adventureSide(object.adventurer, shown))) {
    if (value === undefined) delete object[key];
    else object[key] = value;
  }
  if (shown) object.face = "adventure"; else delete object.face;
}

export function addObject(state, object, zone, player = null) {
  assertZone(state, zone, player);
  /* A MODAL DOUBLE-FACED CARD (CR 712.8): the characteristics of the face that is up -- its front, unless it was played
     with its back face up (`face`), which only a permanent can be (rules/actions.mjs). */
  if (object.mdfc) object = {...object, ...faceOf(object.mdfc, object.face), mdfc: object.mdfc, face: object.face === "back" ? "back" : undefined};
  /* An adventurer card: the Adventure's characteristics when it arrives shown as one -- on the stack, cast as one (CR 715.3b;
     moveObject keeps the face for the stack alone) -- and its own everywhere else (715.4). */
  const adventuring = Boolean(object.adventurer) && object.face === "adventure";
  if (object.adventurer) object = {...object, ...adventureSide(object.adventurer, adventuring), adventurer: object.adventurer, face: adventuring ? "adventure" : undefined};
  const id = state.nextObjectId;
  state.nextObjectId += 1;
  const owner = Number.isInteger(object.owner) ? object.owner : player;
  state.objects[id] = {
    id,
    /* A preparation card is called by its own name alone, in every zone (CR 722.4): "Goblin Glasswright", not the pair. */
    card: object.preparation?.of ?? object.card ?? null,
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
    ...(object.adventurer ? {adventurer: structuredClone(object.adventurer), ...(adventuring ? {face: "adventure"} : {})} : {}),
    /* A preparation card's prepare spell (CR 722.2): alternative characteristics it has in every zone and never uses there
       (722.4) -- the characteristics of the copy it makes in exile as it becomes prepared (722.3c; effects/attributes.mjs). */
    ...(object.preparation ? {preparation: structuredClone(object.preparation)} : {}),
    /* Face down (CR 708.2): what the card is, beside the face-down characteristics it has (moveObject). */
    ...(object.faceDown === true ? {faceDown: true, faceDownCard: structuredClone(object.faceDownCard ?? {})} : {}),
  };
  state.nextTimestamp += 1;
  listFor(state, zone, player).push(id);
  return id;
}

/** What an event says of a card (CommanderProbeEvent@1, journal.mjs): which object, its name, and whose -- every rules
    module's `cardRef`. A face-down permanent has no name (CR 708.2a) -- its `card` is null while it is one -- and says it
    is face down, so nothing that reads the event (the table's history, the audio) names it (CR 708.5). */
export function eventCard(state, id) {
  const o = state.objects[id];
  return o ? {cardId: o.id, name: o.card, owner: o.owner, controller: o.controller, faceDown: o.faceDown === true} : null;
}

/** What a player is shown as an object's name in a choice: its name -- or, face down and with none (CR 708.2a), that it is
    face down, the same for every seat (its controller learns more from their own view, projection.mjs). */
export const shownName = (object) => object?.card ?? (object?.faceDown === true ? (object.zone === "exile" ? "A face-down card" : "A face-down permanent") : "");

/* Hideaway's later controllers retain permission to look after losing control or the source leaving (CR 406.3,
   702.75a). Record entitlement at state transitions, never while projecting a viewer's read-only state. */
export function rememberExileLooker(state, source, controller) {
  if (!Number.isInteger(controller)) return;
  for (const id of state.zones.exile) {
    const card = state.objects[id];
    if (card?.faceDown === true && card.exiledBy === source)
      card.lookers = [...new Set([...(card.lookers ?? []), controller])];
  }
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

/* `transformed` (CR 712.14a): a double-faced card put onto the battlefield with its back face up. */
export function moveObject(state, id, zone, player = null, {faceDown = false, transformed = false} = {}) {
  const current = state.objects[id];
  if (!current) throw new Error(`There is no object ${id} to move`);
  /* A face-down permanent leaving is revealed, and moves as the card it is (CR 708.9). */
  const revealed = current.faceDown === true ? {...current, ...current.faceDownCard} : current;
  /* A permanent that became a copy moves as itself (CR 400.7; effects/permanents.mjs, becomeCopy): every copiable value
     its own, and one it never had -- absent from `uncopied` -- none, not the copy's. */
  const from = revealed.uncopied ? {...revealed, ...Object.fromEntries(COPY_KEYS.map((key) => [key, revealed.uncopied[key]]))} : revealed;
  assertZone(state, zone, player);

  const fromList = listFor(state, from.zone, from.zonePlayer);
  const at = fromList.indexOf(id);
  if (at >= 0) fromList.splice(at, 1);
  delete state.objects[id];
  /* Revolt's "if a permanent left the battlefield under your control this turn" (Hidden Stockpile): counted for its
     controller as it left -- every departure moves through here (script/amount.mjs, permanentsLeftThisTurn; cleared as a
     turn begins, rules/turn.mjs). */
  if (from.zone === "battlefield" && state.players[from.controller]) state.players[from.controller].leftThisTurn = (state.players[from.controller].leftThisTurn ?? 0) + 1;
  /* "If a card left your graveyard this turn" (Primary Research, Relic Retriever): counted for the player whose graveyard it
     left, wherever it went -- a card only, never a token (CR 108.2b) -- as revolt's count is (script/amount.mjs,
     cardsLeftGraveyardThisTurn; cleared as a turn begins, rules/turn.mjs). */
  if (from.zone === "graveyard" && from.token !== true) state.players[from.zonePlayer].leftGraveyardThisTurn = (state.players[from.zonePlayer].leftGraveyardThisTurn ?? 0) + 1;

  /* Only what the CARD says survives the move: its identity, its printed types and its owner. The
     owner does (CR 108.3): a card goes to its OWNER's graveyard however long someone else
     controlled it. Counters, damage, attachments and control do not — that is CR 400.7. */
  const kept = {owner: from.owner, controller: from.owner, token: from.token, copy: from.copy, commander: from.commander,
    commanderKey: from.commander === true ? commanderKeyOf(from) : undefined, colorIdentity: from.colorIdentity};
  /* PUT ONTO THE BATTLEFIELD FACE DOWN (manifest, CR 701.40a): turned face down before it enters (708.3), so it arrives
     with the face-down characteristics and nothing of its own -- the card it is kept beside them, as it was where it came
     from: a double-faced card's front face (712.8a, 712.15). */
  if (faceDown && zone === "battlefield") {
    const faceDownCard = Object.fromEntries(CARD_KEYS.filter((key) => from[key] !== undefined).map((key) => [key, from[key]]));
    return addObject(state, {...FACE_DOWN, ...kept, faceDown: true, faceDownCard}, zone, player);
  }
  /* EXILED FACE DOWN (hideaway, CR 702.75a): a card with no characteristics there (406.3a) -- not even a face-down
     permanent's 2/2 -- what it is kept beside it, as onto the battlefield; as it leaves exile it moves as the card it is
     (above). */
  if (faceDown && zone === "exile") {
    const faceDownCard = Object.fromEntries(CARD_KEYS.filter((key) => from[key] !== undefined).map((key) => [key, from[key]]));
    return addObject(state, {...FACE_DOWN_EXILED, ...kept, faceDown: true, faceDownCard}, zone, player);
  }
  return addObject(state, {
    /* A double-faced card keeps the face that was up only onto the battlefield, where it was put that way; anywhere else
       it is its front (CR 712.8a). */
    ...(from.mdfc ? {mdfc: from.mdfc, face: zone === "battlefield" && (from.face === "back" || transformed === true) ? "back" : undefined} : {}),
    /* An adventurer card goes to the stack as its Adventure when it was shown as one to be cast (CR 715.3b), and leaves it --
       countered, resolved, wherever it goes -- as itself (715.4). */
    ...(from.adventurer ? {adventurer: from.adventurer, face: zone === "stack" && from.face === "adventure" ? "adventure" : undefined} : {}),
    /* A prepare spell is part of the card wherever it goes (CR 722.2a); being prepared is not -- a designation of the
       permanent, gone with it (CR 400.7). */
    ...(from.preparation ? {preparation: from.preparation} : {}),
    card: from.card, types: from.types, manaCost: from.manaCost, abilities: from.abilities,
    power: from.power, toughness: from.toughness, loyalty: from.loyalty, keywords: from.keywords,
    ...kept,
    spell: from.spell, subtypes: from.subtypes, supertypes: from.supertypes, colors: from.colors,
    enchant: from.enchant,
  }, zone, player);
}
