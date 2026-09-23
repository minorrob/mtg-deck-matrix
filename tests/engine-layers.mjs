/* CONTINUOUS EFFECTS AND LAYERS: WHAT AN OBJECT ACTUALLY IS RIGHT NOW.
 *
 * `docs/engine/PLAN.md` §3.3 (continuous effects and layers, CR 611 to 613) — "the layer system
 * with timestamps and dependency (613.8)".
 *
 * THE STATE HOLDS PRINTED VALUES; THIS DERIVES CURRENT ONES. That separation is the point. An
 * engine that applies an anthem by adding one to a creature's power in the state has no way to
 * remove it when the anthem leaves, no way to order it against a later effect, and no way to answer
 * "what is this creature without the anthem" — which is what every later effect needs to ask.
 *
 * LAYERS ARE NOT PRIORITIES, THEY ARE CATEGORIES (CR 613.1). Everything in layer 4 happens before
 * anything in layer 6, whatever the timestamps, because a type change decides what the
 * ability-granting effect even applies to. Within one layer, timestamp order (CR 613.7).
 *
 * POWER AND TOUGHNESS HAVE SUBLAYERS AND THE ORDER IS COUNTERINTUITIVE (CR 613.4). An effect that
 * SETS power to 1 applies in 7b; an effect that ADDS +2/+2 applies in 7c; counters apply in 7d. So
 * "becomes 1/1" followed by "+2/+2" is a 3/3 whatever order they were played in, and a +1/+1
 * counter on a creature set to 1/1 makes it 2/2. Getting the sublayers backwards produces boards
 * that are wrong in a way players notice immediately and cannot explain.
 *
 * DEPENDENCY BEATS TIMESTAMP (CR 613.8). If applying one effect would change what another applies
 * to, the dependent one waits, however old it is. Timestamp order alone gets this wrong exactly
 * when two effects in the same layer interact, which is when it matters.
 */
import assert from "node:assert/strict";
import {createState, addObject} from "../game/engine/state/index.mjs";
import {beginGame} from "../game/engine/rules/turn.mjs";
import {characteristicsOf, powerOf, toughnessOf, LAYERS} from "../game/engine/rules/layers.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const pod = {matchId: "m", seed: "s", players: [{name: "Rob"}, {name: "Krenko"}, {name: "Atraxa"}, {name: "Shadrix"}]};
const creature = (over) => ({types: ["Creature"], power: 2, toughness: 2, ...over});
const started = () => { const s = createState(pod); beginGame(s); return s; };

/* A continuous effect is data: which layer, what it applies to, what it does. Static abilities of
   permanents carry the same shape, which is what phase 2's card script will compile to. */
const anthem = (over = {}) => ({id: "anthem", kind: "static", layer: 7, sublayer: "c",
  text: "Creatures you control get +1/+1.",
  affects: {types: ["Creature"], controller: "self"}, apply: {power: 1, toughness: 1}, ...over});

/* ---- the layers are the ones CR 613.1 lists ---- */
{
  eq(LAYERS, [1, 2, 3, 4, 5, 6, 7], "seven layers, in order (CR 613.1)");
}

/* ---- nothing applied: an object is what is printed on it ---- */
{
  const s = started();
  const bear = addObject(s, creature({card: "Bear", owner: 0, controller: 0}), "battlefield");
  eq(powerOf(s, bear), 2, "a 2/2 with no effects around is a 2/2");
  eq(toughnessOf(s, bear), 2, "in both directions");
  eq(characteristicsOf(s, bear).types, ["Creature"], "and is what its type line says");
}

/* ---- layer 7c: an anthem adds, and is not written into the state ---- */
{
  const s = started();
  addObject(s, {card: "Glorious Anthem", types: ["Enchantment"], owner: 0, controller: 0,
    abilities: [anthem()]}, "battlefield");
  const mine = addObject(s, creature({card: "Mine", owner: 0, controller: 0}), "battlefield");
  const theirs = addObject(s, creature({card: "Theirs", owner: 1, controller: 1}), "battlefield");

  eq(powerOf(s, mine), 3, "your creature gets the anthem");
  eq(powerOf(s, theirs), 2, "and an opponent's does not — 'creatures you control' means the effect's controller");
  eq(s.objects[mine].power, 2,
    "THE STATE STILL SAYS TWO. An engine that writes the anthem into the creature cannot take it back when the anthem leaves, and cannot answer what the creature is without it");
}
{
  const s = started();
  const source = addObject(s, {card: "Glorious Anthem", types: ["Enchantment"], owner: 0, controller: 0,
    abilities: [anthem()]}, "battlefield");
  const mine = addObject(s, creature({card: "Mine", owner: 0, controller: 0}), "battlefield");
  eq(powerOf(s, mine), 3, "while the anthem is out");
  s.zones.battlefield.splice(s.zones.battlefield.indexOf(source), 1);
  delete s.objects[source];
  eq(powerOf(s, mine), 2, "and back to two the moment it leaves, with nothing to undo");
}

/* ---- the sublayers of layer 7, in the order CR 613.4 gives (not the order they were played) ---- */
{
  const s = started();
  const bear = addObject(s, creature({card: "Bear", owner: 0, controller: 0}), "battlefield");
  /* The +2/+2 is OLDER than the "becomes 1/1", and still applies after it, because 7b comes
     before 7c whatever the timestamps say. */
  s.effects = [
    {id: "pump", layer: 7, sublayer: "c", timestamp: 1, affects: {ids: [bear]}, apply: {power: 2, toughness: 2}},
    {id: "shrink", layer: 7, sublayer: "b", timestamp: 2, affects: {ids: [bear]}, apply: {setPower: 1, setToughness: 1}},
  ];
  eq(powerOf(s, bear), 3, "set to 1/1 and then +2/+2 is a 3/3, whichever was played first (CR 613.4)");
  eq(toughnessOf(s, bear), 3, "in both directions");
}
{
  const s = started();
  const bear = addObject(s, creature({card: "Bear", owner: 0, controller: 0}), "battlefield");
  s.objects[bear].counters = {"+1/+1": 1};
  s.effects = [{id: "shrink", layer: 7, sublayer: "b", timestamp: 1, affects: {ids: [bear]}, apply: {setPower: 1, setToughness: 1}}];
  eq(powerOf(s, bear), 2, "a +1/+1 counter on a creature set to 1/1 makes it 2/2 — counters are 7d, after the setting");
  eq(toughnessOf(s, bear), 2, "the same both ways");
}
{
  const s = started();
  const bear = addObject(s, creature({card: "Bear", owner: 0, controller: 0}), "battlefield");
  s.objects[bear].counters = {"+1/+1": 3, "-1/-1": 1};
  eq(powerOf(s, bear), 4, "three plus counters and one minus is a net of two on a 2/2");
  eq(toughnessOf(s, bear), 4, "both ways");
}

/* ---- layer 2 before layer 7: control decides who an anthem applies to ---- */
{
  const s = started();
  addObject(s, {card: "Glorious Anthem", types: ["Enchantment"], owner: 0, controller: 0,
    abilities: [anthem()]}, "battlefield");
  const stolen = addObject(s, creature({card: "Stolen", owner: 1, controller: 1}), "battlefield");
  eq(powerOf(s, stolen), 2, "before it is stolen it is not yours");
  s.effects = [{id: "mind-control", layer: 2, timestamp: 5, affects: {ids: [stolen]}, apply: {controller: 0}}];
  eq(characteristicsOf(s, stolen).controller, 0, "gaining control is layer 2");
  eq(powerOf(s, stolen), 3,
    "and because layer 2 is applied before layer 7, the anthem sees it as yours — which is why layers are categories and not priorities");
}

/* ---- layer 4 and layer 6 ---- */
{
  const s = started();
  const land = addObject(s, {card: "Island", types: ["Land"], owner: 0, controller: 0}, "battlefield");
  s.effects = [{id: "awaken", layer: 4, timestamp: 1, affects: {ids: [land]},
    apply: {addTypes: ["Creature"], setPower: 1, setToughness: 1}}];
  eq(characteristicsOf(s, land).types, ["Land", "Creature"],
    "'becomes a creature in addition to its other types' adds rather than replaces (CR 613.1d)");
  eq(powerOf(s, land), 1, "with the power it was given");
}
{
  const s = started();
  const bear = addObject(s, creature({card: "Bear", owner: 0, controller: 0, keywords: ["Vigilance"]}), "battlefield");
  s.effects = [{id: "wings", layer: 6, timestamp: 1, affects: {ids: [bear]}, apply: {addKeywords: ["Flying"]}}];
  eq(characteristicsOf(s, bear).keywords, ["Vigilance", "Flying"], "layer 6 grants an ability");
  s.effects.push({id: "humble", layer: 6, timestamp: 2, affects: {ids: [bear]}, apply: {removeAllAbilities: true}});
  eq(characteristicsOf(s, bear).keywords, [],
    "and a later effect in the same layer that removes all abilities removes the granted one too — timestamp order within a layer (CR 613.7)");
}
{
  const s = started();
  const bear = addObject(s, creature({card: "Bear", owner: 0, controller: 0}), "battlefield");
  s.effects = [
    {id: "humble", layer: 6, timestamp: 1, affects: {ids: [bear]}, apply: {removeAllAbilities: true}},
    {id: "wings", layer: 6, timestamp: 2, affects: {ids: [bear]}, apply: {addKeywords: ["Flying"]}},
  ];
  eq(characteristicsOf(s, bear).keywords, ["Flying"],
    "the other way round, the grant comes after the removal and survives — which is the whole reason timestamps matter");
}

/* ---- dependency beats timestamp (CR 613.8) ---- */
{
  const s = started();
  const island = addObject(s, {card: "Island", types: ["Land"], owner: 0, controller: 0}, "battlefield");
  /* Both in layer 4. The zombie effect is OLDER, so timestamp order would apply it first — at which
     point the Island is not a creature and it does nothing. But applying the awaken effect first
     changes WHAT THE ZOMBIE EFFECT APPLIES TO, so the zombie effect depends on it and waits. */
  s.effects = [
    {id: "zombies", layer: 4, timestamp: 1, affects: {types: ["Creature"]}, apply: {addTypes: ["Zombie"]}},
    {id: "awaken", layer: 4, timestamp: 2, affects: {ids: [island]}, apply: {addTypes: ["Creature"]}},
  ];
  const types = characteristicsOf(s, island).types;
  ok(types.includes("Creature"), "the land became a creature");
  ok(types.includes("Zombie"),
    "and the OLDER effect applied after it, because applying the newer one changed what the older one applies to (CR 613.8)");
}
{
  const s = started();
  const bear = addObject(s, creature({card: "Bear", owner: 0, controller: 0}), "battlefield");
  /* No dependency: neither changes what the other applies to, so plain timestamp order. */
  s.effects = [
    {id: "a", layer: 7, sublayer: "c", timestamp: 2, affects: {ids: [bear]}, apply: {power: 1, toughness: 0}},
    {id: "b", layer: 7, sublayer: "c", timestamp: 1, affects: {ids: [bear]}, apply: {power: 3, toughness: 0}},
  ];
  eq(powerOf(s, bear), 6, "independent effects in one layer all apply, and adding is adding whatever the order");
}

/* ---- an effect applies only to what it says ---- */
{
  const s = started();
  const bear = addObject(s, creature({card: "Bear", owner: 0, controller: 0}), "battlefield");
  const rock = addObject(s, {card: "Rock", types: ["Artifact"], owner: 0, controller: 0}, "battlefield");
  s.effects = [{id: "anthem", layer: 7, sublayer: "c", timestamp: 1,
    affects: {types: ["Creature"]}, apply: {power: 1, toughness: 1}}];
  eq(powerOf(s, bear), 3, "a creature gets it");
  eq(powerOf(s, rock), 0, "and an artifact with no printed power has none to modify");
  eq(characteristicsOf(s, rock).power, null,
    "which is reported as null rather than zero — a thing with no power is not a thing with zero power");
}

/* ---- it is a derivation, not a mutation ---- */
{
  const s = started();
  const bear = addObject(s, creature({card: "Bear", owner: 0, controller: 0}), "battlefield");
  s.effects = [{id: "pump", layer: 7, sublayer: "c", timestamp: 1, affects: {ids: [bear]}, apply: {power: 5, toughness: 5}}];
  const first = characteristicsOf(s, bear);
  const second = characteristicsOf(s, bear);
  eq(first, second, "asking twice gives the same answer");
  first.types.push("Nonsense");
  eq(characteristicsOf(s, bear).types, ["Creature"],
    "and a caller that edits the answer has not edited the game");
  eq(s.objects[bear].power, 2, "the printed value is untouched, which is what makes an effect leaving free");
}

console.log(`engine-layers: ${checks} checks passed — printed values stay printed, layers are categories rather than priorities, 7b comes before 7c whatever the timestamps, and dependency beats timestamp.`);
