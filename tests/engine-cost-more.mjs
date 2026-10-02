/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* M4 PHASE 3, BATCH 50 (THE CATALOG'S ORDER): SPELLS THAT COST MORE (Forge's RaiseCost, untargeted) AND MANA A LAND COULD
 * PRODUCE (Forge's ManaReflected).
 *
 * "Noncreature spells cost {1} more": anyone's, unless it says yours or an opponent's; added before any reduction (CR
 * 601.2f), so Thalia and a Medallion cancel out; and paid on an alternative cost or a free cast too (CR 118.9d). "Any
 * color that a land an opponent controls could produce": what their own mana abilities could add, now -- colorless only
 * for "any type", and never another such ability's (CR 106.7). "Any color among legendary creatures you control": their
 * colors, now; a count may be counted ("three mana of that type instead").
 */
import assert from "node:assert/strict";
import {createState, addObject} from "../game/engine/state/index.mjs";
import {beginGame, advance} from "../game/engine/rules/turn.mjs";
import {legalActions} from "../game/engine/rules/actions.mjs";
import {costIncrease} from "../game/engine/rules/statics.mjs";
import {missingFor} from "../game/tools/engine-constructs.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";

let checks = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const cards = loadCardIndex();
const card = (name) => ({...cards.definition(name), card: name});
const land = (name, produces) => ({card: name, types: ["Land"], abilities: [{id: "m", kind: "mana", tapSelf: true, produces}]});
const WASTES = land("Wastes", {C: 1});
const GIFT = {card: "Gift", types: ["Instant"], manaCost: "{C}", spell: {id: "s", text: "You gain 1 life.", targets: [], effects: [{effect: "gainLife", amount: 1}]}};
const BEAR = {card: "Bear", types: ["Creature"], manaCost: "{1}{G}", colors: ["G"], power: 2, toughness: 2};
function table() {
  const s = createState({matchId: "m", seed: "cost-more", players: [{name: "Rob"}, {name: "Maya"}]});
  for (let seat = 0; seat < 2; seat += 1) for (let i = 0; i < 12; i += 1) addObject(s, {...WASTES, owner: seat, controller: seat}, "library", seat);
  beginGame(s);
  for (let n = 0; n < 50 && !(s.phase === "MAIN1" && s.priorityPlayer === 0); n += 1) advance(s);
  return s;
}
const put = (s, o, seat, zone) => addObject(s, {...o, owner: seat, controller: seat}, zone, ["battlefield"].includes(zone) ? null : seat);
const casts = (s, name) => legalActions(s, 0).filter((a) => a.kind === "cast" && a.label === name);
const taps = (s, id) => legalActions(s, 0).filter((a) => a.kind === "activate-mana" && a.objectId === id).map((a) => a.mana);

{
  /* Whose spells: Thalia's, anyone's; God-Pharaoh's Statue's, an opponent's. What it describes: noncreature. */
  const s = table();
  const gift = put(s, GIFT, 0, "hand"), bear = put(s, BEAR, 0, "hand"), hers = put(s, GIFT, 1, "hand");
  put(s, card("Thalia, Guardian of Thraben"), 1, "battlefield");
  eq([costIncrease(s, 0, gift), costIncrease(s, 0, bear), costIncrease(s, 1, hers)], [1, 0, 1], "Maya's Thalia: Rob's Gift {1} more, his Bear not, and her own Gift too");
  const t = table();
  const mine = put(t, GIFT, 0, "hand"), theirs = put(t, GIFT, 1, "hand");
  put(t, card("God-Pharaoh's Statue"), 0, "battlefield");
  eq([costIncrease(t, 0, mine), costIncrease(t, 1, theirs)], [0, 2], "Rob's Statue: his own Gift nothing, Maya's {2} more");
}
{
  /* Before reductions: Thalia's {1} more and a {1}-less permanent cancel out. A free cast still pays it. */
  const s = table();
  put(s, GIFT, 0, "hand");
  put(s, card("Thalia, Guardian of Thraben"), 1, "battlefield");
  s.players[0].manaPool.C = 1;
  eq(casts(s, "Gift").length, 0, "Thalia: Gift costs {1}{C}, and one colorless is not enough");
  put(s, {card: "Medallion", types: ["Artifact"], abilities: [{id: "l", kind: "static", text: "Instant spells you cast cost {1} less.", rule: "spells-cost-less", affects: {what: "spell", types: ["Instant"]}, amount: 1}]}, 0, "battlefield");
  eq(casts(s, "Gift").length, 1, "with a Medallion: {1} more, {1} less -- {C} again");
  const t = table();
  put(t, GIFT, 0, "hand");
  put(t, card("Thalia, Guardian of Thraben"), 1, "battlefield");
  put(t, {card: "Spigot", types: ["Artifact"], abilities: [{id: "f", kind: "static", text: "You may cast spells without paying their mana costs.", rule: "cast-without-paying", affects: {}}]}, 0, "battlefield");
  const free = () => casts(t, "Gift").filter((a) => a.free);
  eq(free().length, 0, "without paying its mana cost, Thalia's {1} is still owed, and Rob has nothing");
  t.players[0].manaPool.C = 1;
  eq(free().length, 1, "with one mana: the free cast, paying {1}");
}
{
  /* Reflected: Maya's lands' colors -- not colorless, unless "any type"; two Reflecting Pools alone, nothing. */
  const s = table();
  const orchard = put(s, card("Exotic Orchard"), 0, "battlefield");
  put(s, land("Island", {U: 1}), 1, "battlefield"); put(s, WASTES, 1, "battlefield");
  put(s, {card: "City", types: ["Land"], abilities: [{id: "c", kind: "mana", tapSelf: true, anyColor: true}]}, 1, "battlefield");
  eq(taps(s, orchard).length, 5, "Maya's City of five colors: all five -- and her Wastes adds no colorless");
  const t = table();
  const pool = put(t, card("Reflecting Pool"), 0, "battlefield");
  put(t, card("Reflecting Pool"), 0, "battlefield");
  eq(taps(t, pool), [], "two Reflecting Pools, nothing else: nothing (CR 106.7)");
  put(t, WASTES, 0, "battlefield");
  eq(taps(t, pool), [{C: 1}], "and a Wastes: colorless, \"any type\"");
}
{
  /* Among: legendary creatures' colors, a multicolored one each of its colors. */
  const s = table();
  const mox = put(s, card("Mox Amber"), 0, "battlefield");
  put(s, {card: "Duo", types: ["Creature"], supertypes: ["Legendary"], colors: ["W", "B"], power: 1, toughness: 1}, 0, "battlefield");
  put(s, {...BEAR, card: "Elf"}, 0, "battlefield");
  eq(taps(s, mox), [{W: 1}, {B: 1}], "a white and black legend: white or black -- not the green Elf, who is not legendary");
  /* Counted: Incubation Druid's three with a +1/+1 counter. */
  const t = table();
  const druid = put(t, card("Incubation Druid"), 0, "battlefield");
  t.objects[druid].controlledSinceTurn = -1;  /* his since before this turn: not summoning sick */
  put(t, land("Forest", {G: 1}), 0, "battlefield");
  eq(taps(t, druid), [{G: 1}], "no counter: one");
  t.objects[druid].counters["+1/+1"] = 1;
  eq(taps(t, druid), [{G: 3}], "a +1/+1 counter: three of that type");
}
{
  eq([missingFor({apis: ["ManaReflected"]}), missingFor({statics: ["RaiseCost"]})], [[], [{kind: "static", name: "RaiseCost", why: "no engine support yet"}]],
    "the catalog credits reflected mana, and keeps RaiseCost unbuilt: \"spells that target this cost more\" waits");
}

console.log(`engine-cost-more: ${checks} checks passed — anyone's or an opponent's spells cost more, before reductions, free casts too; a land's colors reflected, any type, never another's; colors among legends; counted.`);
