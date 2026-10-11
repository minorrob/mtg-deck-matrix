/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* "FOR EACH PLAYER, YOU CHOOSE A CREATURE THAT PLAYER CONTROLS. THEN EACH PLAYER SACRIFICES ALL OTHER CREATURES THEY CONTROL
 * THAT DON'T SHARE A CREATURE TYPE WITH THE CHOSEN CREATURE THEY CONTROL" (Winnowing; Train C phase 2, w2a-selectors;
 * CR 205.3m, 702.73a, 701.21a).
 *
 * `exceptSharing: "creature type"` on sacrificeAll (effects/zones.mjs), beside `except: "remembered"`: besides the creatures
 * chosen, each that shares a creature type with the chosen creature its controller controls is spared -- each as it now is,
 * through the layers, a changeling sharing every one (script/filter.mjs, shareCreatureType). The choosing is The Eternal
 * Wanderer's (a repetition for each player, each choice remembered beside the others). The card's scenarios play Winnowing;
 * this suite holds a table of four, another player's creature that shares a type and is not spared for it, a type given by
 * an effect, a changeling chosen, what is not a creature, and the grammar.
 */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createState, addObject} from "../game/engine/state/index.mjs";
import {runEffect} from "../game/engine/script/effects/index.mjs";
import {shareCreatureType} from "../game/engine/script/filter.mjs";
import {validateScript} from "../game/engine/script/schema.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const fresh = (seats = 4) => createState({matchId: "m", seed: "winnow", players: ["Rob", "Maya", "Trey", "Sam"].slice(0, seats).map((name) => ({name}))});
const put = (s, card, seat, subtypes = [], extra = {}) => addObject(s, {card, types: ["Creature"], subtypes, power: 1, toughness: 1, owner: seat, controller: seat, ...extra}, "battlefield");
const SPARE = {effect: "sacrificeAll", who: "each", selector: {types: ["Creature"]}, except: "remembered", exceptSharing: "creature type"};
const left = (s) => s.zones.battlefield.map((id) => `${s.objects[id].card}:${s.objects[id].controller}`);

/* ---- a table of four: each player's chosen creature spares its own kin, and only its controller's ---- */
{
  const s = fresh();
  const elf = put(s, "Elf", 0, ["Elf", "Druid"]);
  put(s, "Elf Warrior", 0, ["Elf", "Warrior"]);
  put(s, "Goblin", 0, ["Goblin"]);
  /* Maya's Elf shares a type with Rob's chosen Elf -- but not with the creature chosen for her, her Bear. */
  const bear = put(s, "Bear", 1, ["Bear"]);
  put(s, "Maya's Elf", 1, ["Elf"]);
  put(s, "Bear Cub", 1, ["Bear"]);
  /* Trey's chosen Mimic, a changeling, shares a creature type with every creature that has one; his Construct has none. */
  const mimic = put(s, "Mimic", 2, [], {keywords: ["Changeling"]});
  put(s, "Rat", 2, ["Rat"]);
  put(s, "Construct", 2, [], {types: ["Artifact", "Creature"]});
  /* Sam controls no creature: nothing is chosen for him, and his land is no creature. */
  addObject(s, {card: "Forest", types: ["Land"], subtypes: ["Forest"], owner: 3, controller: 3}, "battlefield");
  runEffect(s, SPARE, {controller: 0, source: null, remembered: [elf, bear, mimic]});
  eq(left(s), ["Elf:0", "Elf Warrior:0", "Bear:1", "Bear Cub:1", "Mimic:2", "Rat:2", "Forest:3"],
    "Rob keeps his Elves, Maya her Bears (her Elf shares only with Rob's Elf), Trey all but the Construct, Sam his Forest");
}

{
  /* Without exceptSharing, as The Eternal Wanderer's: only what was chosen is spared, kin or not. */
  const s = fresh(2);
  const elf = put(s, "Elf", 0, ["Elf"]);
  put(s, "Other Elf", 0, ["Elf"]);
  const {exceptSharing: _none, ...wanderer} = SPARE;
  runEffect(s, wanderer, {controller: 0, source: null, remembered: [elf]});
  eq(left(s), ["Elf:0"], "the other Elf is sacrificed: nothing spares it but being chosen");
}

/* ---- through the layers: a type an effect gave is shared ---- */
{
  const s = fresh(2);
  const elf = put(s, "Elf", 0, ["Elf"]);
  const land = addObject(s, {card: "Treetop", types: ["Land"], owner: 0, controller: 0}, "battlefield");
  runEffect(s, {effect: "animate", targets: [land], subtypes: ["Elf"], power: 2, toughness: 2, until: "end-of-turn"}, {controller: 0, source: null});
  put(s, "Ooze", 0, ["Ooze"]);
  runEffect(s, SPARE, {controller: 0, source: null, remembered: [elf]});
  eq(left(s), ["Elf:0", "Treetop:0"], "the land made an Elf creature this turn shares Elf with the chosen Elf and stays; the Ooze goes");
}
{
  /* Nothing chosen for a player (no creature of theirs was): theirs are sacrificed as The Eternal Wanderer's are -- none
     remembered is none spared. */
  const s = fresh(2);
  put(s, "Elf", 1, ["Elf"]);
  runEffect(s, SPARE, {controller: 0, source: null, remembered: []});
  eq(left(s), [], "nothing chosen: nothing spared");
}
{
  /* The chosen creature gone before the sacrifice: nothing is kin to what is no longer there. */
  const s = fresh(2);
  const elf = put(s, "Elf", 0, ["Elf"]);
  put(s, "Other Elf", 0, ["Elf"]);
  s.zones.battlefield = s.zones.battlefield.filter((id) => id !== elf);
  delete s.objects[elf];
  runEffect(s, SPARE, {controller: 0, source: null, remembered: [elf]});
  eq(left(s), [], "the chosen Elf gone: the other Elf shares with nothing there");
}

/* ---- sharing a creature type ---- */
{
  const s = fresh(2);
  const [elf, elfRogue, rogue, mimic, other, wall] = [["Elf"], ["Elf", "Rogue"], ["Rogue"], [], [], []].map((sub, n) => put(s, `C${n}`, 0, sub, n === 3 || n === 4 ? {keywords: ["Changeling"]} : {}));
  ok(shareCreatureType(s, [elf, elfRogue]) && shareCreatureType(s, [elfRogue, rogue]), "an Elf Rogue shares with an Elf and with a Rogue");
  ok(!shareCreatureType(s, [elf, rogue]), "an Elf and a Rogue share nothing");
  ok(!shareCreatureType(s, [elf, elfRogue, rogue]), "the three have no one type in common");
  ok(shareCreatureType(s, [mimic, rogue]) && shareCreatureType(s, [mimic, other]), "a changeling shares with a Rogue, and with another changeling");
  ok(!shareCreatureType(s, [mimic, wall]), "but not with a creature that has no creature type");
}

/* ---- the grammar ---- */
{
  const winnowing = JSON.parse(readFileSync(new URL("../game/engine/cards/w/winnowing.json", import.meta.url), "utf8"));
  eq(validateScript(winnowing).valid, true, "Winnowing's definition is a valid script");
  const errors = (change) => { const copy = structuredClone(winnowing); change(copy.abilities[1].effects[1]); return validateScript(copy).errors.map((e) => e.message).join(" | "); };
  ok(/exceptSharing/.test(errors((e) => { delete e.except; })), "exceptSharing beside except remembered");
  ok(/exceptSharing/.test(errors((e) => { e.exceptSharing = "color"; })), "a creature type, nothing else");
  ok(/exceptSharing/.test(errors((e) => { e.effect = "destroyAll"; })), "on sacrificeAll alone");
}

console.log(`engine-sacrifice-sparing: ${checks} checks passed`);
