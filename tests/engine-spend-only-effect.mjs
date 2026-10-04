/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* MANA AN EFFECT ADDS THAT MAY PAY FOR ONLY SOME THINGS (Rob's Priority Batch 10.3, its thirty-fourth slice: Abstract
 * Paintmage, the 301st card of Rob's list, and Resonating Lute, the 310th).
 *
 * `{effect: "addMana", spendOnly}` (script/effects/resources.mjs): what a triggered ability or a spell adds may say what
 * it pays for, as a mana ability's may (CR 106.6) -- kept beside the pool, one entry a mana, its source the effect's
 * (rules/restricted-mana.mjs), and gone with the pool. The compiler reads every addMana's restriction, a mana ability's
 * among them, where it walks an ability's effects, so a bad one is refused once; and it refuses a triggered mana ability
 * that carries one, since what that adds goes straight to the pool.
 *
 * The card scenarios play the cards: the Paintmage's {U}{R} paying for Spark and not for the Frog, the Lute's lands
 * tapping for two of a color for Rift and not for the Ogre, its draw only with seven cards in hand. This suite holds the
 * mana beside the pool, what it admits, its emptying, and the compiler.
 */
import assert from "node:assert/strict";
import {createState, addObject} from "../game/engine/state/index.mjs";
import {beginGame, advance} from "../game/engine/rules/turn.mjs";
import {legalActions, applyAction} from "../game/engine/rules/actions.mjs";
import {poolFor} from "../game/engine/rules/restricted-mana.mjs";
import {runEffects} from "../game/engine/script/effects/index.mjs";
import {compileScript} from "../game/engine/cards/index.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const cards = loadCardIndex();
const card = (name) => ({...cards.definition(name), card: name});
const INSTANTS_AND_SORCERIES = {spell: {anyOf: [{types: ["Instant"]}, {types: ["Sorcery"]}]}};
const WASTES = {card: "Wastes", types: ["Land"], supertypes: ["Basic"], abilities: [{id: "a0", kind: "mana", tapSelf: true, produces: {C: 1}}]};
const SPARK = {card: "Spark", types: ["Instant"], manaCost: "{U}{R}", colors: ["U", "R"], spell: {id: "s", text: "You gain 1 life.", targets: [], effects: [{effect: "gainLife", amount: 1}]}};
const FROG = {card: "Frog", types: ["Creature"], subtypes: ["Frog"], manaCost: "{U}{R}", colors: ["U", "R"], power: 2, toughness: 2};
function table() {
  const s = createState({matchId: "m", seed: "spend-only", players: [{name: "Rob"}, {name: "Maya"}]});
  for (let seat = 0; seat < 2; seat += 1) for (let i = 0; i < 12; i += 1) addObject(s, {...WASTES, owner: seat, controller: seat}, "library", seat);
  return s;
}
const main = (s) => { beginGame(s); for (let n = 0; n < 50 && !(s.phase === "MAIN1" && s.priorityPlayer === 0); n += 1) advance(s); return s; };
const put = (s, o, zone = "battlefield") => addObject(s, {...o, owner: 0, controller: 0}, zone, zone === "battlefield" ? null : 0);
const add = (s, source, spendOnly) => runEffects(s, [{effect: "addMana", mana: {U: 1, R: 1}, ...(spendOnly ? {spendOnly} : {})}], {controller: 0, source});
const castable = (s, name) => legalActions(s, 0).filter((a) => a.kind === "cast" && a.label === name).length;

/* ---- beside the pool ---- */
{
  const s = table();
  const mage = put(s, {card: "Mage", types: ["Creature"], power: 2, toughness: 2});
  const spark = put(s, SPARK, "hand"), frog = put(s, FROG, "hand");
  main(s);
  const events = add(s, mage, INSTANTS_AND_SORCERIES);
  const {U, R} = s.players[0].manaPool;
  eq([U ?? 0, R ?? 0, s.players[0].restrictedMana.map((e) => [e.key, e.source])], [0, 0, [["U", mage], ["R", mage]]],
    "{U}{R} that pays only for instants and sorceries: none in the pool, two entries beside it, the Mage their source");
  eq(events.map((e) => [e.kind, e.data.fields.produced]), [["GameEventManaPool", {U: 1, R: 1}]], "and it is said, as any mana added is");
  eq([poolFor(s, 0, {spell: spark}).U, poolFor(s, 0, {spell: spark}).R, poolFor(s, 0, {spell: frog}).U ?? 0], [1, 1, 0], "Spark may spend it; the Frog may not");
  eq([castable(s, "Spark"), castable(s, "Frog")], [1, 0], "so Spark is offered and the Frog is not");
  for (let n = 0; n < 20 && s.phase === "MAIN1"; n += 1) advance(s);
  eq([s.phase !== "MAIN1", s.players[0].restrictedMana?.length ?? 0], [true, 0], "the main phase over: it is gone with the pool (CR 500.4)");
}
{
  const s = table();
  main(s);
  add(s, null);
  eq([s.players[0].manaPool.U, s.players[0].manaPool.R, s.players[0].restrictedMana?.length ?? 0], [1, 1, 0], "no restriction: into the pool, as before");
}

/* ---- the compiler ---- */
const compile = (...abilities) => compileScript({schema: "CrankCardScript@1", identity: {name: "Odd Charm", oracleId: "x", types: ["Enchantment"], subtypes: [], manaCost: "{1}", colors: [], colorIdentity: []},
  oracleText: abilities.map((a) => a.text).join("\n"), source: "hand", abilities});
const MAIN_TEXT = "At the beginning of your first main phase, add {U}{R}. Spend this mana only to cast instant and sorcery spells.";
const atMain = (spendOnly) => compile({kind: "triggered", text: MAIN_TEXT, trigger: {on: "step", step: "MAIN1"}, effects: [{effect: "addMana", mana: {U: 1, R: 1}, spendOnly}]});
eq(atMain(INSTANTS_AND_SORCERIES).problems, [], "a triggered ability's restricted mana: read");
eq([atMain({}), atMain({spell: {types: ["Instant"]}, colors: ["U"]}), atMain({spell: {bogus: 1}}), atMain({spell: {types: ["Instant"]}, uncounterable: "yes"})].map((r) => r.problems.length),
  [1, 1, 1, 1], "refused: nothing named, an unknown key, a selector it cannot read, an uncounterable that is not true");
ok(atMain({}).problems[0].startsWith("addMana: a spending restriction"), "and said as the restriction it is");
{
  const TAP_TEXT = "{T}: Add one mana of any color. Spend this mana only to cast creature spells.";
  const land = compile({kind: "activated", text: TAP_TEXT, mana: true, cost: [{atom: "{T}"}], effects: [{effect: "addMana", anyColor: true, spendOnly: {}}]});
  eq(land.problems.length, 1, "a mana ability's bad restriction: refused once, where the effects are read");
}
{
  const MORE = "Whenever you tap a land for mana, add an additional {G}.";
  const more = (spendOnly) => compile({kind: "triggered", text: MORE, trigger: {on: "tapped for mana", filter: {types: ["Land"]}}, effects: [{effect: "addMana", mana: {G: 1}, ...(spendOnly ? {spendOnly} : {})}]});
  eq([more().problems.length, more({spell: {types: ["Creature"]}}).problems.length], [0, 1], "a triggered mana ability: read without a restriction, refused with one");
}

/* ---- the Lute's lands ---- */
{
  const s = table();
  put(s, card("Resonating Lute"));
  const wastes = put(s, WASTES);
  main(s);
  const offers = legalActions(s, 0).filter((a) => a.kind === "activate-mana" && a.objectId === wastes).map((a) => JSON.stringify(a.mana)).sort();
  eq(offers, ["{\"B\":2}", "{\"C\":1}", "{\"G\":2}", "{\"R\":2}", "{\"U\":2}", "{\"W\":2}"], "the Wastes: its {C}, or two of any one color");
  applyAction(s, 0, legalActions(s, 0).find((a) => a.kind === "activate-mana" && a.objectId === wastes && a.mana?.R === 2));
  eq([s.players[0].manaPool.R ?? 0, s.players[0].restrictedMana.map((e) => e.key)], [0, ["R", "R"]], "tapped for {R}{R}: beside the pool");
}

for (const name of ["Abstract Paintmage", "Resonating Lute"]) ok(cards.resolve(name)?.playable === true, `${name} is defined and playable`);

console.log(`engine-spend-only-effect: ${checks} checks passed -- an effect's restricted mana beside the pool, for what it admits, gone with the pool; every addMana's restriction read once; a triggered mana ability with one refused.`);
