/* LAST KNOWN INFORMATION: WHAT THE ENGINE REMEMBERS ABOUT A THING THAT NO LONGER EXISTS.
 *
 * CR 113.7a — "if the source is no longer in the zone it's expected to be in at that time, its last
 * known information is used." CR 400.7 makes a moved object a NEW object with no memory of the old
 * one, and CR 111.7 removes a token from any zone but the battlefield outright. So by the time
 * anything asks about the creature that just died, there is nothing left to ask: the answer has to
 * have been written down before it left.
 *
 * WHAT THIS SUITE EXISTS TO STOP COMING BACK. The snapshot used to be five fields — id, name,
 * owner, controller, abilities. That is enough for "whenever this creature dies" to find its own
 * trigger and nothing more. It is not enough for the far more common shape, "whenever a creature
 * you control dies, each opponent loses life equal to ITS POWER", because power was never recorded
 * and cannot be recovered afterwards. Nor "if it was a Goblin". Nor "return it with the counters it
 * had". Every one of those would have compiled, run, and quietly produced zero.
 *
 * IT IS THE CHARACTERISTICS, NOT THE PRINTED VALUES. This is the part a thinner fix would get
 * wrong. A 2/2 wearing two +1/+1 counters under an anthem dies as a 5/5, and 5 is the number the
 * trigger is owed — so the snapshot runs the layers rather than reading the object's own fields.
 * Recording `object.power` would pass a naive test and be wrong on every real board.
 */
import assert from "node:assert/strict";
import {createState, addObject, cardsIn} from "../game/engine/state/index.mjs";
import {beginGame} from "../game/engine/rules/turn.mjs";
import {lastKnown} from "../game/engine/rules/layers.mjs";
import {checkStateBasedActions} from "../game/engine/rules/sba.mjs";
import {collectTriggers} from "../game/engine/rules/trigger.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const pod = {matchId: "m", seed: "s", players: [{name: "Rob"}, {name: "Krenko"}, {name: "Atraxa"}, {name: "Shadrix"}]};

function started() {
  const s = createState(pod);
  for (let seat = 0; seat < 4; seat += 1)
    for (let i = 0; i < 60; i += 1)
      addObject(s, {card: `L${seat}-${i}`, owner: seat, controller: seat}, "library", seat);
  beginGame(s);
  return s;
}

const DIES = {id: "on-death", kind: "triggered", text: "Whenever this creature dies, …",
  trigger: {on: "GameEventCardChangeZone", who: "self", from: "Battlefield", to: "Graveyard"}};
const WATCHES = {id: "on-any-death", kind: "triggered", text: "Whenever a creature dies, …",
  trigger: {on: "GameEventCardChangeZone", who: "any", from: "Battlefield", to: "Graveyard"}};

/* ---- the snapshot is the characteristics, counters and anthems included ---- */
{
  const s = started();
  const bear = addObject(s, {card: "Bear", types: ["Creature", "Goblin"], power: 2, toughness: 2,
    owner: 0, controller: 0}, "battlefield");
  s.objects[bear].counters["+1/+1"] = 2;
  s.effects = [{id: "anthem", layer: 7, sublayer: "c", timestamp: 1,
    affects: {ids: [bear]}, apply: {power: 1, toughness: 1}}];

  const known = lastKnown(s, bear);
  eq(known.power, 5,
    "a 2/2 with two +1/+1 counters under a +1/+1 anthem died as a 5/5 — the layers, not the printed 2");
  eq(known.toughness, 5, "and its toughness by the same route");
  eq(known.counters["+1/+1"], 2, "the counters it had are part of the record (CR 121)");
  ok(known.types.includes("Goblin"), "and its types, for \"if it was a Goblin\"");
  eq(known.name, "Bear", "with enough to name it");
}

/* ---- power is null for a thing that never had one, not zero ---- */
{
  const s = started();
  const ring = addObject(s, {card: "Sol Ring", types: ["Artifact"], owner: 0, controller: 0}, "battlefield");
  eq(lastKnown(s, ring).power, null,
    "a dying Sol Ring is not a 0/0 — null and zero are different answers and an effect that adds power can tell");
  eq(lastKnown(s, 99999), null, "and an object that was never there has no last known information");
}

/* ---- the controller is the one at the moment of death, not the owner ---- */
{
  const s = started();
  const stolen = addObject(s, {card: "Stolen Bear", types: ["Creature"], power: 2, toughness: 2,
    owner: 1, controller: 1}, "battlefield");
  s.effects = [{id: "mind-control", layer: 2, timestamp: 1, affects: {ids: [stolen]}, apply: {controller: 0}}];

  const known = lastKnown(s, stolen);
  eq(known.controller, 0, "a stolen creature dies under the thief — layer 2 decides that (CR 613.1b)");
  eq(known.owner, 1, "while its owner is unchanged and recorded separately, for the cards that ask");
}

/* ---- a real death carries it all the way to the event ---- */
{
  const s = started();
  const bear = addObject(s, {card: "Bear", types: ["Creature"], power: 4, toughness: 2,
    owner: 0, controller: 0, abilities: [DIES]}, "battlefield");
  s.objects[bear].damage = 2;

  const events = checkStateBasedActions(s);
  eq(cardsIn(s, "graveyard", 0).length, 1, "the creature died");
  const gone = events.find((e) => e.kind === "GameEventCardChangeZone")?.data?.fields?.leftBehind;
  ok(gone, "and the event carries what left");
  eq(gone.power, 4,
    "INCLUDING ITS POWER — this is the whole point: \"each opponent loses life equal to its power\" has a 4 to read");
  ok(gone.abilities.some((a) => a.id === "on-death"),
    "and still its abilities, which is what the five-field version was for");
}

/* ---- and a watching permanent's trigger gets it as the cause ---- */
{
  const s = started();
  const witness = addObject(s, {card: "Witness", types: ["Creature"], power: 1, toughness: 1,
    owner: 0, controller: 0, abilities: [WATCHES]}, "battlefield");
  const bear = addObject(s, {card: "Bear", types: ["Creature"], power: 7, toughness: 1,
    owner: 0, controller: 0}, "battlefield");
  s.objects[bear].damage = 3;

  const events = checkStateBasedActions(s);
  collectTriggers(s, events);
  const trigger = s.pendingTriggers.find((t) => t.abilityId === "on-any-death");
  ok(trigger, "the watcher triggered on someone else's death");
  eq(trigger.cause.power, 7,
    "and \"that creature\" is the full record, not the bare identity reference — the power is there to be read");
  eq(trigger.source.cardId, witness, "while the source is still the permanent that owns the ability");
}

/* ---- a token records that it was one, before it ceases to exist ---- */
{
  const s = started();
  const goblin = addObject(s, {card: "Goblin", types: ["Creature"], power: 1, toughness: 1,
    owner: 0, controller: 0, token: true}, "battlefield");
  s.objects[goblin].damage = 1;

  const events = checkStateBasedActions(s);
  const gone = events.find((e) => e.kind === "GameEventCardChangeZone")?.data?.fields?.leftBehind;
  ok(gone?.token, "the record says it was a token");
  eq(gone.power, 1, "with the power it had, which is the only copy left of that number");
  /* CR 111.7: it reached the graveyard first -- that is what the trigger saw -- and only then was
     swept. Both halves matter, and an engine that skipped the zone change would break every
     sacrifice payoff in the format. */
  eq(cardsIn(s, "graveyard", 0).length, 0,
    "and it is gone from the graveyard, because a token in any zone but the battlefield ceases to exist (CR 111.7)");
  eq(s.objects[goblin], undefined, "the object itself is gone too");
}

console.log(`engine-lki: ${checks} checks passed — the look-back records the characteristics a dying permanent actually had, counters and anthems and stolen control included, and hands them to the trigger as the cause.`);
