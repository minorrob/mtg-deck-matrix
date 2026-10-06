/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* "EACH PLAYER PUTS A VOW COUNTER ON A CREATURE THEY CONTROL AND SACRIFICES THE REST. EACH OF THOSE CREATURES CAN'T ATTACK YOU
 * OR PLANESWALKERS YOU CONTROL FOR AS LONG AS IT HAS A VOW COUNTER ON IT" (Promise of Loyalty; AI 3's Teysa deck).
 *
 * `sacrifice` with `keep` and `keepExactly` (script/effects/asking.mjs): a creature, never none, asked of each player with
 * more than one in turn order from the active player (CR 101.4) -- one with one or none is not asked -- then the vow counters
 * (`keptCounter`) and every sacrifice at once; `rememberKept`, every player's kept creature. And a restriction on attacking
 * for a while (effects/permanents.mjs effectUntil, rules/statics.mjs cantAttack): `defender: "you"` its controller and
 * `planeswalkers` theirs (CR 506.3), and `whileCounter`, each creature's own duration (CR 611.2b). The card scenarios play
 * the card; this suite holds four players, the refusals, and the restriction itself.
 */
import assert from "node:assert/strict";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {cantAttack} from "../game/engine/rules/statics.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };
const throws = (fn, pattern, m) => { assert.throws(fn, pattern, m); checks += 1; };

const cards = loadCardIndex();
const N = "Promise of Loyalty";
const C = (sub, p = 2) => ({types: ["Creature"], subtypes: [sub], manaCost: "{1}{G}", colors: ["G"], power: p, toughness: p});
const FIX = {Bear: C("Bear"), Elf: C("Elf", 1), Ogre: C("Ogre", 3), Wolf: C("Wolf"),
  Walker: {types: ["Planeswalker"], subtypes: ["Jace"], manaCost: "{2}{U}", colors: ["U"], loyalty: 3, abilities: []}};
const at = (seat, zone, ...list) => ({seat, zone, cards: list});
const LANDS = ["Plains", "Wastes", "Wastes", "Wastes", "Wastes"];
const CAST = [{tap: "Plains"}, ...Array(4).fill({tap: "Wastes"}), {cast: N}, {resolve: true}];
const named = (s, name, seat) => s.zones.battlefield.find((id) => s.objects[id].card === name && (seat === undefined || s.objects[id].controller === seat));

/* ---- four players: asked in turn order, the one with one creature not at all ---- */
{
  const {state: s} = runScenario({name: "vow four", seats: 4,
    setup: [at(0, "battlefield", ...LANDS, "Bear", "Elf"), at(0, "hand", N), at(1, "battlefield", "Ogre"), at(2, "battlefield", "Wolf", "Bear"), at(3, "battlefield", "Elf", "Ogre", "Walker")],
    steps: CAST}, cards.definition, FIX);
  eq(s.awaiting.player, 0, "Rob, the active player, is asked first");
  const choose = (label) => { const c = awaitingChoice(s); return resolveAwaiting(s, [c.options.find((o) => o.label === label).index]); };
  throws(() => resolveAwaiting(s, []), /Invalid selection/, "keeping none is refused: a creature, not up to one");
  throws(() => resolveAwaiting(s, [0, 1]), /Invalid selection/, "and keeping two");
  choose("Bear");
  eq(s.awaiting.player, 2, "then Trey -- Maya, with one creature, has nothing to choose");
  eq(s.zones.graveyard[0].map((id) => s.objects[id].card), [], "and nothing is sacrificed while others choose");
  choose("Wolf");
  eq([s.awaiting.player, awaitingChoice(s).options.map((o) => o.label)], [3, ["Elf", "Ogre"]], "then Sam, of his creatures only -- his Walker is no creature");
  choose("Ogre");
  eq(s.awaiting, null, "every player has chosen");
  const vows = s.zones.battlefield.filter((id) => (s.objects[id].counters.vow ?? 0) > 0).map((id) => `${s.objects[id].card}:${s.objects[id].controller}`).sort();
  eq(vows, ["Bear:0", "Ogre:1", "Ogre:3", "Wolf:2"], "a vow counter on each kept creature, Maya's only one among them");
  eq([0, 1, 2, 3].map((p) => s.zones.graveyard[p].map((id) => s.objects[id].card).sort()), [["Elf", N], [], ["Bear"], ["Elf"]], "the rest sacrificed");

  /* ---- the restriction: Rob, or a planeswalker of his; anyone else they may ---- */
  const mayaOgre = named(s, "Ogre", 1), samWalker = named(s, "Walker", 3), trey = named(s, "Wolf", 2);
  eq([cantAttack(s, mayaOgre, 0), cantAttack(s, mayaOgre, 2), cantAttack(s, mayaOgre, 3), cantAttack(s, mayaOgre, 3, samWalker)], [true, false, false, false],
    "Maya's Ogre can't attack Rob; Trey, Sam and Sam's Walker it may");
  const robsWalker = s.objects[samWalker];
  robsWalker.controller = 0;
  eq(cantAttack(s, trey, 0, samWalker), true, "nor a planeswalker Rob controls (CR 506.3)");
  s.objects[mayaOgre].counters.vow = 0;
  eq(cantAttack(s, mayaOgre, 0), false, "its vow counter gone, the restriction is over (CR 611.2b)");
}

/* ---- the restriction is the kept creatures', not a creature that came later ---- */
{
  const {state: s} = runScenario({name: "vow later", setup: [at(0, "battlefield", ...LANDS), at(0, "hand", N), at(1, "battlefield", "Ogre"), at(1, "hand", "Wolf")],
    steps: CAST}, cards.definition, FIX);
  const effect = (s.effects ?? []).find((e) => e.rule === "cant-attack");
  eq([effect.affects.ids.map((id) => s.objects[id].card), effect.defender, effect.planeswalkers, effect.whileCounter, effect.until], [["Ogre"], "you", true, "vow", null],
    "one effect: the kept Ogre, \"you\" and your planeswalkers, while it has a vow counter, no other end");
  ok(s.objects[effect.affects.ids[0]].counters.vow === 1, "and the Ogre has its vow counter");
}

console.log(`engine-vow: ${checks} checks passed -- each player keeps exactly one creature with a vow counter, in turn order, and those creatures can't attack its caster or their planeswalkers while the counter stays.`);
