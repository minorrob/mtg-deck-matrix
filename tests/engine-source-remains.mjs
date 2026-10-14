/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* "FOR AS LONG AS THIS SAGA REMAINS ON THE BATTLEFIELD" (Old Fat Spider Can't See Me; Train C phase 2, w3-last; CR 611.2b).
 *
 * effectUntil's `until: "this leaves"` (script/effects/permanents.mjs): an effect kept with its source -- a layer's ("target
 * creature you control gains hexproof") or a rule's ("prevent all damage that would be dealt by up to one target
 * creature") -- that ends as the source leaves the battlefield, however it goes (effects/zones.mjs, returnExiledUntil,
 * every departure: a spell's, a state-based action's, its owner leaving the game), and does not come back with it (CR
 * 400.7). With its source gone before it resolves, the duration never starts and the effect does nothing. Not ended by
 * a turn's end, nor by another permanent leaving. The compiler keeps the duration where it is built. The card scenarios
 * play the Saga; this suite holds the edges.
 */
import assert from "node:assert/strict";
import {runEffect} from "../game/engine/script/effects/index.mjs";
import {moveOne} from "../game/engine/script/effects/zones.mjs";
import {keywordsOf} from "../game/engine/rules/layers.mjs";
import {concede} from "../game/engine/rules/sba.mjs";
import {applyReplacements} from "../game/engine/rules/replacement.mjs";
import {compileScript} from "../game/engine/cards/index.mjs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const FIX = {
  Bear: {types: ["Creature"], subtypes: ["Bear"], manaCost: "{1}{G}", colors: ["G"], power: 2, toughness: 2},
  Ogre: {types: ["Creature"], subtypes: ["Ogre"], manaCost: "{2}{R}", colors: ["R"], power: 3, toughness: 3},
  Charm: {types: ["Enchantment"], manaCost: "{1}", colors: []},
};
const table = (setup, seats = 2) => runScenario({name: "source-remains", seats, setup, steps: []}, index.definition, FIX).state;
const idOf = (s, name, seat = 0) => s.zones.battlefield.find((id) => s.objects[id].card === name && s.objects[id].controller === seat);
const HEXPROOF = (target) => ({effect: "effectUntil", layer: 6, targets: [target], apply: {addKeywords: ["Hexproof"]}, until: "this leaves"});
const SHIELD = (target) => ({effect: "effectUntil", rule: "prevent-damage", targets: [target], apply: {by: true, to: false}, until: "this leaves"});
const lasting = (s) => (s.effects ?? []).filter((e) => e.until === "this leaves");
const damage = (s, from, toPlayer) => applyReplacements(s, {event: "damage", sourceId: from, toPlayer, amount: 3}, {dry: true}).proposal.amount;

/* ---- kept with its source, ended as it leaves ---- */
{
  const s = table([{seat: 0, zone: "battlefield", cards: ["Charm", "Bear"]}]);
  const charm = idOf(s, "Charm"), bear = idOf(s, "Bear");
  runEffect(s, HEXPROOF(bear), {controller: 0, source: charm});
  eq(lasting(s).map((e) => [e.source, e.affects.ids, e.layer]), [[charm, [bear], 6]], "the effect keeps its source, the Charm, and what it affects, the Bear, in layer 6");
  ok(keywordsOf(s, bear).includes("Hexproof"), "the Bear has hexproof");
  s.turn += 5;
  ok(keywordsOf(s, bear).includes("Hexproof"), "turns go by and it stays: no turn's end ends it");
  moveOne(s, charm, "graveyard", []);
  eq([lasting(s).length, keywordsOf(s, bear).includes("Hexproof")], [0, false], "the Charm put into the graveyard: the effect is over, the Bear without hexproof");
}
{
  /* However it goes: exiled, returned to the hand -- and back again it is a new object, and the effect does not return. */
  for (const to of ["exile", "hand", "library"]) {
    const s = table([{seat: 0, zone: "battlefield", cards: ["Charm", "Bear"]}]);
    const charm = idOf(s, "Charm"), bear = idOf(s, "Bear");
    runEffect(s, HEXPROOF(bear), {controller: 0, source: charm});
    const gone = moveOne(s, charm, to, []);
    eq(lasting(s).length, 0, `the Charm put into its owner's ${to}: over`);
    if (to !== "library") {
      moveOne(s, gone, "battlefield", []);
      ok(!keywordsOf(s, bear).includes("Hexproof"), `and put back onto the battlefield from the ${to}, a new object: the Bear's hexproof does not come back (CR 400.7)`);
    }
  }
}
{
  /* Another permanent leaving is nothing to it; nor is the affected creature's leaving any other effect's end. */
  const s = table([{seat: 0, zone: "battlefield", cards: ["Charm", "Charm", "Bear", "Bear"]}]);
  const [charm, other] = s.zones.battlefield.filter((id) => s.objects[id].card === "Charm");
  const [bear, second] = s.zones.battlefield.filter((id) => s.objects[id].card === "Bear");
  runEffect(s, HEXPROOF(bear), {controller: 0, source: charm});
  runEffect(s, HEXPROOF(second), {controller: 0, source: other});
  moveOne(s, other, "graveyard", []);
  eq([lasting(s).map((e) => e.source), keywordsOf(s, bear).includes("Hexproof"), keywordsOf(s, second).includes("Hexproof")], [[charm], true, false],
    "the second Charm leaves: its own effect ends, the first Charm's goes on");
}

/* ---- a duration that never starts ---- */
{
  const s = table([{seat: 0, zone: "battlefield", cards: ["Charm", "Bear"]}]);
  const charm = idOf(s, "Charm"), bear = idOf(s, "Bear");
  runEffect(s, HEXPROOF(bear), {controller: 0, source: null});
  eq(lasting(s).length, 0, "its source gone before it resolves (the stack leaves it null): no effect at all");
  const gone = moveOne(s, charm, "graveyard", []);
  runEffect(s, HEXPROOF(bear), {controller: 0, source: gone});
  eq([lasting(s).length, keywordsOf(s, bear).includes("Hexproof")], [0, false], "nor with a source in a graveyard: it never was on the battlefield for the while");
}

/* ---- a rule's effect: the prevention, ended as its source leaves, by its owner leaving the game too ---- */
{
  const s = table([{seat: 0, zone: "battlefield", cards: ["Charm"]}, {seat: 1, zone: "battlefield", cards: ["Ogre"]}], 3);
  const charm = idOf(s, "Charm"), ogre = idOf(s, "Ogre", 1);
  runEffect(s, SHIELD(ogre), {controller: 0, source: charm});
  eq([damage(s, ogre, 2), damage(s, ogre, 0)], [0, 0], "all damage the Ogre would deal is prevented: to the third player, to Rob");
  concede(s, 0);
  eq([s.players[0].lost, s.objects[charm], lasting(s).length], [true, undefined, 0], "Rob concedes: his Charm leaves the game with him (CR 800.4a), and the prevention ends");
  eq(damage(s, ogre, 2), 3, "the Ogre's damage to the third player is dealt again");
}
{
  const s = table([{seat: 0, zone: "battlefield", cards: ["Charm"]}, {seat: 1, zone: "battlefield", cards: ["Ogre"]}]);
  const charm = idOf(s, "Charm"), ogre = idOf(s, "Ogre", 1);
  runEffect(s, SHIELD(ogre), {controller: 0, source: charm});
  ok(damage(s, ogre, 0) === 0, "prevented while the Charm remains");
  moveOne(s, charm, "exile", []);
  eq(damage(s, ogre, 0), 3, "the Charm exiled: dealt again");
}

/* ---- where the compiler builds it ---- */
{
  const script = (effect) => ({schema: "CrankCardScript@1", identity: {name: "Test", oracleId: "00000000-0000-4000-8000-000000000000", types: ["Enchantment"], manaCost: "{U}", colors: ["U"]},
    oracleText: "When this enchantment enters, target creature gains hexproof for as long as this enchantment remains on the battlefield.", source: "hand",
    abilities: [{kind: "triggered", text: "When this enchantment enters, target creature gains hexproof for as long as this enchantment remains on the battlefield.",
      trigger: {on: "enters", who: "self"}, targets: [{what: "permanent", types: ["Creature"]}], effects: [effect]}]});
  eq(compileScript(script({effect: "effectUntil", layer: 6, targets: {target: 0}, apply: {addKeywords: ["Hexproof"]}, until: "this leaves"})).problems, [], "effectUntil until \"this leaves\" compiles");
  ok(compileScript(script({effect: "pump", targets: {target: 0}, keywords: ["Hexproof"], until: "this leaves"})).problems.some((p) => p.includes("this leaves")),
    "a pump until \"this leaves\" is refused: a pump keeps no source, and would last for good");
  ok(compileScript(script({effect: "effectUntil", rule: "cant-cast", named: "Bear", who: {target: 0}, until: "this leaves"})).problems.some((p) => p.includes("this leaves")),
    "and so is a rule changed for players' casting, which keeps none");
}
ok(index.resolve("Old Fat Spider Can't See Me")?.playable === true, "Old Fat Spider Can't See Me is defined and playable");

console.log(`engine-source-remains: ${checks} checks passed -- "for as long as this remains on the battlefield" kept with its source, over as it leaves however it goes, never back with it, never started without it.`);
