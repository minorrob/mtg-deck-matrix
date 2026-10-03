/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* M4 PHASE 3, BATCH 24 (THE CATALOG'S ORDER): DAMAGE TO EACH.
 *
 * `damageAll` deals its damage to each permanent its description fits and each player it names, in one event; the dying
 * is a state-based action afterwards (CR 704.5g). Its source is the spell, or a creature the spell names ("target creature
 * you control deals damage equal to its power to each other creature"), and then that creature's deathtouch and lifelink
 * apply -- as they do to any damage a source deals, not only combat damage (CR 702.2b, 702.15b). Prevention applies to
 * each piece of it.
 */
import assert from "node:assert/strict";
import {createState, addObject} from "../game/engine/state/index.mjs";
import {beginGame, advance} from "../game/engine/rules/turn.mjs";
import {checkStateBasedActions} from "../game/engine/rules/sba.mjs";
import {beginResolution} from "../game/engine/script/resolution.mjs";

let checks = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const WASTES = {card: "Wastes", types: ["Land"], supertypes: ["Basic"], abilities: [{id: "a0", kind: "mana", tapSelf: true, produces: {C: 1}}]};
const creature = (name, power = 2, extra = {}) => ({card: name, types: ["Creature"], manaCost: "{1}", power, toughness: power, ...extra});
const pod = {matchId: "m", seed: "damage-all", players: [{name: "Rob"}, {name: "Maya"}, {name: "Trey"}]};
function table() {
  const s = createState(pod);
  for (let seat = 0; seat < 3; seat += 1) for (let i = 0; i < 12; i += 1) addObject(s, {...WASTES, owner: seat, controller: seat}, "library", seat);
  return s;
}
const on = (s, o, seat) => addObject(s, {...o, owner: seat, controller: seat}, "battlefield", null);
function main(s) { beginGame(s); for (let n = 0; n < 50 && !(s.phase === "MAIN1" && s.priorityPlayer === 0); n += 1) advance(s); return s; }
const alive = (s, ids) => ids.map((id) => Boolean(s.objects[id]));
const lives = (s) => s.players.map((p) => p.life);
const run = (s, effect, source = null, targets = []) => { beginResolution(s, [effect], {controller: 0, source, targets}); checkStateBasedActions(s); };

{
  const s = table();
  const bear = on(s, creature("Bear"), 0), ogre = on(s, creature("Ogre", 3), 1), wurm = on(s, creature("Wurm", 6), 2);
  main(s);
  run(s, {effect: "damageAll", amount: 3, selector: {what: "permanent", types: ["Creature"]}});
  eq([alive(s, [bear, ogre, wurm]), s.objects[wurm].damage, lives(s)], [[false, false, true], 3, [40, 40, 40]],
    "3 damage to each creature, every player's: the 2/2 and 3/3 die, the 6/6 is marked 3; no player is dealt any");
}
{
  const s = table();
  const mine = on(s, creature("Elf", 1), 0), hers = on(s, creature("Elf", 1), 1), his = on(s, creature("Elf", 1), 2);
  main(s);
  run(s, {effect: "damageAll", amount: 1, who: "opponent", selector: {what: "permanent", types: ["Creature"], controller: "opponent"}});
  eq([alive(s, [mine, hers, his]), lives(s)], [[true, false, false], [40, 39, 39]], "each opponent and each creature they control: Maya's and Trey's, not Rob's");
}
{
  /* From a creature: deathtouch and lifelink are its. */
  const s = table();
  const asp = on(s, creature("Asp", 1, {keywords: ["Deathtouch", "Lifelink"]}), 0), mine = on(s, creature("Cub"), 0);
  const wurm = on(s, creature("Wurm", 6), 1), ogre = on(s, creature("Ogre", 3), 2);
  main(s);
  run(s, {effect: "damageAll", amount: 1, from: [asp], exceptSource: true, who: "opponent", selector: {what: "permanent", types: ["Creature"]}}, null);
  eq([alive(s, [asp, mine, wurm, ogre]), lives(s)], [[true, false, false, false], [45, 39, 39]],
    "a 1/1 with deathtouch and lifelink deals 1 to each other creature and each opponent: deathtouch kills the 6/6 too (CR 702.2b); Rob gains 5 -- three creatures and two players (CR 702.15b); the Asp spares itself");
}
{
  /* Any damage from a lifelink source, not only damageAll: a plain "deals 2 damage to any target". */
  const s = table();
  const priest = on(s, creature("Priest", 1, {keywords: ["Lifelink"]}), 0);
  main(s);
  beginResolution(s, [{effect: "dealDamage", amount: 2, who: [1]}], {controller: 0, source: priest});
  eq(lives(s), [42, 38, 40], "a lifelink creature's ability deals 2 to Maya: Rob gains 2 as it is dealt");
}
{
  /* Counted as it resolves; prevented creature by creature. */
  const s = table();
  const a = on(s, creature("Bear"), 0), b = on(s, creature("Cub"), 1), c = on(s, creature("Pup"), 2);
  main(s);
  beginResolution(s, [{effect: "effectUntil", rule: "prevent-damage", targets: [b], apply: {to: true}, until: "end-of-turn"}], {controller: 1, source: null});
  run(s, {effect: "damageAll", amount: {count: {types: ["Creature"]}}, selector: {what: "permanent", types: ["Creature"]}});
  eq([alive(s, [a, b, c]), s.objects[b].damage], [[false, true, false], 0], "X = the creatures on the battlefield, 3: each takes 3, but damage to the protected Cub is prevented");
}
{
  const s = table();
  const elf = on(s, creature("Elf", 1), 1), walker = on(s, {card: "Walker", types: ["Planeswalker"], manaCost: "{1}"}, 1), rock = on(s, {card: "Rock", types: ["Artifact"], manaCost: "{1}"}, 1);
  main(s);
  s.objects[walker].counters.loyalty = 3;
  run(s, {effect: "damageAll", amount: 1, selector: {what: "permanent", controller: "opponent", anyOf: [{types: ["Creature"]}, {types: ["Planeswalker"]}]}});
  eq([alive(s, [elf, rock]), s.objects[walker]?.damage ?? "gone"], [[false, true], 1], "\"each creature and planeswalker they control\": the Elf and the Walker are dealt damage, the Rock is not");
}

console.log(`engine-damage-all: ${checks} checks passed — damage to each creature and each opponent in one event, from the spell or a creature (its deathtouch and lifelink, on any damage), counted as it resolves, prevented piece by piece.`);
