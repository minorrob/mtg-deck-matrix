/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* M4 PHASE 3, BATCH 10 (THE CATALOG'S ORDER): AMOUNTS THE GAME COUNTS (game/engine/script/amount.mjs).
 *
 * X (CR 107.3, 601.2b): chosen as a spell is cast or an ability activated, one offer per value the pool can pay; paid
 * as generic mana; carried on the stack, and kept by a permanent for its own abilities (CR 107.3m). A count -- "for each
 * creature you control", devotion (CR 700.5), the greatest power -- is read once, as its effect is applied (CR 608.2h),
 * while a characteristic-defining ability's is read continuously (CR 604.3); a count inside a count does not loop.
 * "Costs {1} less for each ..." takes generic mana only (CR 601.2f). The grammar is closed at the schema.
 */
import assert from "node:assert/strict";
import {createState, addObject} from "../game/engine/state/index.mjs";
import {beginGame, advance} from "../game/engine/rules/turn.mjs";
import {legalActions, applyAction, nothingToDo} from "../game/engine/rules/actions.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";
import {characteristicsOf} from "../game/engine/rules/layers.mjs";
import {beginResolution} from "../game/engine/script/resolution.mjs";
import {amountOf, amountProblems} from "../game/engine/script/amount.mjs";
import {validateScript} from "../game/engine/script/schema.mjs";
import {housePilot} from "../game/engine/pilots/house-pilot.mjs";
import {projectFor} from "../game/engine/projection.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const cards = loadCardIndex();
const card = (name) => ({...cards.definition(name), card: name});
const land = (name, color, extra = {}) => ({card: name, types: ["Land"], supertypes: ["Basic"], subtypes: color === "C" ? [] : [name], abilities: [{id: "a0", kind: "mana", tapSelf: true, produces: {[color]: 1}}], ...extra});
const WASTES = land("Wastes", "C"), SWAMP = land("Swamp", "B"), FOREST = land("Forest", "G");
const bear = (name = "Bear", extra = {}) => ({card: name, types: ["Creature"], manaCost: "{1}{G}", colors: ["G"], power: 2, toughness: 2, ...extra});

const pod = {matchId: "m", seed: "amounts", players: [{name: "Rob"}, {name: "Maya"}]};
function table(players = pod.players) {
  const s = createState({...pod, players});
  for (let seat = 0; seat < players.length; seat += 1) for (let i = 0; i < 12; i += 1) addObject(s, {...WASTES, owner: seat, controller: seat}, "library", seat);
  return s;
}
const on = (s, o, seat, zone = "battlefield") => addObject(s, {...o, owner: seat, controller: seat}, zone, ["battlefield", "exile"].includes(zone) ? null : seat);
function main(s) { beginGame(s); for (let n = 0; n < 50 && !(s.phase === "MAIN1" && s.priorityPlayer === 0); n += 1) advance(s); return s; }
const tapAll = (s, seat = 0) => { for (let a; (a = legalActions(s, seat).find((x) => x.kind === "activate-mana" && x.label !== "Gaea's Cradle")); ) applyAction(s, seat, a); };
const resolve = (s) => { passPriority(s); return passPriority(s); };
const casts = (s, name, seat = 0) => legalActions(s, seat).filter((a) => a.kind === "cast" && a.label === name);
const ctx = (controller = 0, source = null, extra = {}) => ({controller, source, ...extra});

/* ---- X ---- */
{
  const s = table();
  on(s, card("Exsanguinate"), 0, "hand");
  for (const l of [SWAMP, SWAMP, WASTES, WASTES, WASTES]) on(s, l, 0);
  main(s);
  eq(casts(s, "Exsanguinate").length, 0, "with nothing in the pool, {X}{B}{B} is not offered at all");
  tapAll(s);
  eq(casts(s, "Exsanguinate").map((a) => a.x), [0, 1, 2, 3], "five mana, two of it black: X may be 0, 1, 2 or 3 -- one offer each (CR 107.3, 601.2b)");
  applyAction(s, 0, casts(s, "Exsanguinate").find((a) => a.x === 2));
  eq([s.stack.at(-1).x, s.players[0].manaPool.C], [2, 1], "X = 2 is carried on the stack, and paid as two generic: one colorless is left");
  resolve(s);
  eq([s.players[1].life, s.players[0].life], [38, 42], "each opponent loses X, and Rob gains the life lost this way");
}
{
  /* A refused X: an action naming an X it was not offered. */
  const s = table();
  on(s, card("Secure the Wastes"), 0, "hand");
  for (const l of [land("Plains", "W"), WASTES]) on(s, l, 0);
  main(s); tapAll(s);
  assert.throws(() => applyAction(s, 0, {kind: "cast", objectId: casts(s, "Secure the Wastes")[0].objectId, x: 5}), /not a legal action/);
  checks += 1;
}
{
  /* X on an activated ability: {X}{X} costs two for each. */
  const s = table();
  on(s, card("Treasure Vault"), 0);
  for (let i = 0; i < 5; i += 1) on(s, WASTES, 0);
  main(s);
  for (let i = 0; i < 5; i += 1) applyAction(s, 0, legalActions(s, 0).find((a) => a.kind === "activate-mana" && a.label === "Wastes"));
  eq(legalActions(s, 0).filter((a) => a.kind === "activate" && a.label === "Treasure Vault").map((a) => a.x), [0, 1, 2], "{X}{X} with five mana: X up to 2, each X symbol taking X");
  applyAction(s, 0, legalActions(s, 0).find((a) => a.kind === "activate" && a.label === "Treasure Vault" && a.x === 2));
  eq(s.players[0].manaPool.C, 1, "and paying X = 2 took four");
  resolve(s);
  eq(s.zones.battlefield.filter((id) => s.objects[id].card === "Treasure").length, 2, "two Treasures");
}
{
  /* A permanent keeps its X (CR 107.3m): The Meathook Massacre's "-X/-X" as it enters. */
  const s = table();
  on(s, card("The Meathook Massacre"), 0, "hand");
  for (const l of [SWAMP, SWAMP, WASTES]) on(s, l, 0);
  const wall = on(s, {card: "Wall", types: ["Creature"], power: 0, toughness: 3}, 1);
  main(s); tapAll(s);
  applyAction(s, 0, casts(s, "The Meathook Massacre").find((a) => a.x === 1));
  resolve(s);
  const massacre = s.zones.battlefield.find((id) => s.objects[id].card === "The Meathook Massacre");
  eq(s.objects[massacre].xPaid, 1, "the enchantment on the battlefield remembers the X it was cast for");
  resolve(s);
  eq([characteristicsOf(s, wall).power, characteristicsOf(s, wall).toughness], [-1, 2], "and its trigger gives each creature -X/-X with that X");
}
{
  /* The house pilot taps everything first, then casts the largest X -- never X = 0. */
  const s = table();
  on(s, card("Secure the Wastes"), 0, "hand");
  for (const l of [land("Plains", "W"), WASTES, WASTES]) on(s, l, 0);
  main(s);
  const facts = {"Secure the Wastes": {manaValue: 1, types: ["Instant"], x: true}, Plains: {manaValue: 0, types: ["Land"]}, Wastes: {manaValue: 0, types: ["Land"]}};
  const pilot = housePilot({seat: 0, cards: (name) => facts[name] ?? null});
  for (let n = 0; n < 6; n += 1) {
    const choice = pilot.choose(projectFor(s, 0), legalActions(s, 0));
    if (choice.kind === "pass") break;
    applyAction(s, 0, choice);
    if (choice.kind === "cast") break;
  }
  eq(s.stack.at(-1)?.x, 2, "the house pilot taps its three lands and then casts Secure the Wastes at X = 2");
}

/* ---- counted when the effect happens (CR 608.2h) ---- */
{
  const s = table();
  on(s, card("Shamanic Revelation"), 0, "hand");
  for (const l of [FOREST, FOREST, WASTES, WASTES, WASTES]) on(s, l, 0);
  on(s, bear(), 0);
  main(s); tapAll(s);
  applyAction(s, 0, casts(s, "Shamanic Revelation")[0]);
  on(s, bear("Late Bear"), 0);   /* in response, as it were: another creature before it resolves */
  on(s, bear("Big One", {power: 5, toughness: 5}), 0);
  resolve(s);
  eq([projectFor(s, 0).players[0].zones.Hand.count, s.players[0].life], [3, 44], "counted as it resolves, not as it was cast: three creatures, three cards; one with power 4 or more, 4 life");
}
{
  /* Krenko, Tin Street Kingpin: the counter first, then its power counted -- a later effect sees an earlier one. */
  const s = table();
  const krenko = on(s, card("Krenko, Tin Street Kingpin"), 0);
  main(s);
  beginResolution(s, cards.definition("Krenko, Tin Street Kingpin").abilities[0].effects, {controller: 0, source: krenko});
  eq(s.zones.battlefield.filter((id) => s.objects[id].card === "Goblin").length, 2, "a 1/2 with a counter is a 2/3: two Goblins");
}
{
  /* "Life lost this way": a player already out of the game loses nothing, so nothing is gained for them. */
  const s = table([{name: "Rob"}, {name: "Maya"}, {name: "Sam"}]);
  main(s);
  s.players[2].lost = true;
  beginResolution(s, [{effect: "loseLife", who: "opponent", amount: 3}, {effect: "gainLife", amount: {lifeLostThisWay: true}}], {controller: 0});
  eq([s.players[1].life, s.players[2].life, s.players[0].life], [37, 40, 43], "Maya loses 3, Sam (out) nothing, Rob gains 3");
}

/* ---- the kinds of count ---- */
{
  const s = table();
  const crypt = on(s, {card: "Hybrid", types: ["Creature"], manaCost: "{B/G}{B}{B/P}{2}", power: 1, toughness: 1}, 0);
  on(s, {card: "Their Black", types: ["Creature"], manaCost: "{B}{B}{B}", power: 1, toughness: 1}, 1);
  main(s);
  eq(amountOf(s, {devotion: ["B"]}, ctx()), 3, "devotion to black (CR 700.5): {B/G}, {B} and {B/P} each count, the generic does not, and Maya's permanents do not");
  eq(amountOf(s, {devotion: ["B", "G"]}, ctx()), 3, "devotion to black and green: a {B/G} hybrid counts once, not twice");
  void crypt;
  on(s, {card: "Squirrel", types: ["Creature"], subtypes: ["Squirrel", "Rat"], power: 1, toughness: 1}, 0);
  on(s, {card: "Rat", types: ["Creature"], subtypes: ["Rat"], power: 1, toughness: 1}, 0);
  eq(amountOf(s, {count: {controller: "you", anyOf: [{subtypes: ["Squirrel"]}, {subtypes: ["Rat"]}]}}, ctx()), 2, "a choice of kinds counts each thing once: a Squirrel Rat is one");
  eq(amountOf(s, {count: {types: ["Creature"], controller: "you"}, times: -1}, ctx()), -3, "times -1 is how an amount goes below nothing (\"-1/-1 for each\")");
  eq(amountOf(s, {count: {types: ["Creature"], controller: "you"}, times: 2, plus: 1}, ctx()), 7, "times and plus");
  eq(amountOf(s, {greatestPower: {types: ["Creature"], controller: "opponent", power: {min: 9}}}, ctx()), 0, "the greatest power among nothing is 0");
}
{
  /* A count of cards in a zone: "the number of cards in your hand", and in a graveyard by color. */
  const s = table();
  const crawler = on(s, card("Psychosis Crawler"), 0);
  on(s, bear(), 0, "hand"); on(s, bear(), 0, "hand");
  on(s, bear(), 1, "hand");
  main(s);
  eq(characteristicsOf(s, crawler).power, 2, "Psychosis Crawler counts Rob's hand, not Maya's");
  on(s, bear(), 0, "hand");
  eq(characteristicsOf(s, crawler).power, 3, "and is counted again whenever it is asked: a characteristic-defining ability IS the count (CR 604.3)");
}

/* ---- a count inside a count does not loop ---- */
{
  const s = table();
  const a = on(s, card("Master of Etherium"), 0);
  const b = on(s, card("Master of Etherium"), 0);
  on(s, {card: "Rock", types: ["Artifact"], manaCost: "{1}"}, 0);
  main(s);
  eq([characteristicsOf(s, a).power, characteristicsOf(s, b).power], [4, 4], "two Masters of Etherium: each counts three artifacts and gets +1/+1 from the other -- and neither asks the other forever");
}

/* ---- costs that count (CR 601.2f) ---- */
{
  const s = table();
  on(s, card("Vanquish the Horde"), 0, "hand");
  for (const l of [land("Plains", "W"), land("Plains", "W"), WASTES]) on(s, l, 0);
  for (let i = 0; i < 3; i += 1) on(s, bear(`Bear ${i}`), i % 2);
  main(s); tapAll(s);
  eq(casts(s, "Vanquish the Horde").length, 0, "{6}{W}{W} less three creatures is {3}{W}{W}: three lands cannot cast it");
  on(s, bear("Fourth"), 1); on(s, bear("Fifth"), 1);
  ok(casts(s, "Vanquish the Horde").length === 1, "with five creatures it costs {1}{W}{W}, and three lands do");
  eq(nothingToDo(s, 0), false, "so the step does not pass itself with it castable");
}
{
  /* Channel from the hand, cheaper for each legendary creature, generic only. */
  const s = table();
  on(s, card("Otawara, Soaring City"), 0, "hand");
  on(s, land("Island", "U"), 0);
  for (let i = 0; i < 4; i += 1) on(s, {card: `Legend ${i}`, types: ["Creature"], supertypes: ["Legendary"], power: 1, toughness: 1}, 0);
  on(s, bear("Their Bear"), 1);
  main(s); tapAll(s);
  ok(legalActions(s, 0).some((a) => a.kind === "activate" && a.label === "Otawara, Soaring City"), "{3}{U} less four legends is {U}: one Island pays it -- the reduction never goes below nothing nor takes the {U}");
}

/* ---- counted mana ---- */
{
  const s = table();
  on(s, card("Gaea's Cradle"), 0);
  main(s);
  eq(legalActions(s, 0).filter((a) => a.kind === "activate-mana" && a.label === "Gaea's Cradle").map((a) => a.mana), [{G: 0}], "Gaea's Cradle with no creatures adds nothing, and says so in its offer");
  on(s, bear(), 0); on(s, bear(), 0);
  eq(legalActions(s, 0).filter((a) => a.kind === "activate-mana" && a.label === "Gaea's Cradle").map((a) => a.mana), [{G: 2}], "with two, the offer counts two -- counted as offered and again as it is activated");
}

/* ---- the grammar is closed ---- */
{
  ok(amountProblems({count: {types: ["Creature"]}, perhaps: 2}).some((p) => /no key "perhaps"/.test(p)), "an amount with a key it does not know is refused");
  ok(amountProblems({count: {kinds: ["Creature"]}}).some((p) => /selector grammar has no key "kinds"/.test(p)), "what it counts is held to the selector grammar");
  ok(amountProblems({count: {}, devotion: ["B"]}).length > 0, "an amount counts one thing");
  ok(amountProblems({countersOn: "self"}).some((p) => /which kind/.test(p)), "counting counters says which kind");
  const script = {schema: "CrankCardScript@1", identity: {name: "T", oracleId: "t", types: ["Sorcery"]}, abilities: [{kind: "spell", text: "Draw.", effects: [{effect: "draw", count: {cuont: {}}}]}]};
  ok(!validateScript(script).valid, "and the schema refuses a card that misspells one");
}

console.log(`engine-amounts: ${checks} checks passed — X chosen per value the pool pays and kept by a permanent; counts read as the effect happens and continuously for a characteristic-defining ability, without looping; costs that count take generic mana only.`);
