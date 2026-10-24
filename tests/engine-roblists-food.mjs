/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* ROB'S PRIORITY LISTS, LANE P2 (FOOD; the card load of 2026-10-24): what the cards' scenarios cannot say.
 *
 * - The rules the lane built, at their edges: a descent counted for its owner and only for this turn, a lifeless temptation
 *   counted, a life adder for its controller alone, a leftover reduction taking off a higher X, a large "sacrifice X" picked once taken, a
 *   Chatterfang beside an adder of a different token (the order asked), devour never eating itself, a linked card kept
 *   against its source alone, damage by a name that is only combat damage, and skulk's equal power.
 * - What the schema refuses of each new key, and the sentence library leaving a permanent's sentence unwritten rather than a spell.
 * - And every card the lane wrote, played through its scenarios.
 */
import assert from "node:assert/strict";
import {loadCardIndex, loadCardScenarios, loadCardScripts} from "../game/tools/engine-cards.mjs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {compileScript} from "../game/engine/cards/index.mjs";
import {legalActions} from "../game/engine/rules/actions.mjs";
import {awaitingChoice} from "../game/engine/rules/turn.mjs";
import {canBlockAttacker} from "../game/engine/keywords/combat.mjs";
import {conditionProblems} from "../game/engine/script/condition.mjs";
import {createLibrary, translate} from "../game/engine/cards/sentences.mjs";

let checks = 0;
const check = (name, fn) => { try { fn(); checks += 1; } catch (e) { e.message = `${name}: ${e.message}`; throw e; } };
const index = loadCardIndex();
const creature = (cost, subtypes, p = 1, t = 1, more = {}) => ({types: ["Creature"], subtypes, manaCost: cost, colors: ["G"], power: p, toughness: t, ...more});
const spell = (text, effects, more = {}) => ({types: ["Sorcery"], manaCost: "{C}", colors: [], spell: {id: "s", text, targets: [], effects}, ...more});
const FIXTURES = {
  Pup: creature("{G}", ["Dog"]), Bear: creature("{1}{G}", ["Bear"], 2, 2), Ogre: creature("{2}{R}", ["Ogre"], 3, 3),
  Nut: creature("{G}", ["Squirrel"]),
  Food: {types: ["Artifact"], subtypes: ["Food"], manaCost: null, colors: [], abilities: [{id: "food", kind: "activated", text: "{2}, {T}, Sacrifice this artifact: You gain 3 life.", targets: [],
    cost: [{atom: "mana", cost: "{2}"}, {atom: "{T}"}, {atom: "sacrifice", self: true}], effects: [{effect: "gainLife", amount: 3}]}]},
  "Heal Three": {types: ["Instant"], manaCost: "{W}", colors: ["W"], spell: {id: "s", text: "You gain 3 life.", targets: [], effects: [{effect: "gainLife", amount: 3}]}},
  "Tempting Trinket": spell("The Ring tempts you.", [{effect: "ringTempts"}]),
  "Food Maker": spell("Create a Food token.", [{effect: "createToken", count: 1, token: {predefined: "Food"}}]),
  "Mill One": spell("Mill a card.", [{effect: "mill", count: 1}]),
  "Toss": spell("Discard a card.", [{effect: "discard", count: 1}]),
  Sparkzap: {types: ["Instant"], manaCost: "{R}", colors: ["R"], spell: {id: "s", text: "Sparkzap deals 2 damage to any target.",
    targets: [{anyOf: [{what: "permanent", types: ["Creature"]}, {what: "player"}]}], effects: [{effect: "dealDamage", targets: {target: 0}, amount: 2}]}},
  /* A creature with devour 1 (CR 702.82a), as a compiled definition: what it may sacrifice never includes itself. */
  Gobbler: creature("{G}", ["Beast"], 1, 1, {abilities: [{id: "d", kind: "replacement", text: "Devour 1", watches: {event: "enters", who: "self"},
    change: {devour: {amount: 1, of: {types: ["Creature"]}}}}]}),
};
const play = (scenario) => runScenario({name: "roblists-food", expect: [], ...scenario}, index.definition, FIXTURES).state;
const at = (seat, zone, ...cards) => ({seat, zone, cards});
const onField = (s, name, seat = 0) => s.zones.battlefield.filter((id) => s.objects[id].card === name && s.objects[id].controller === seat);
const scriptOf = (name) => structuredClone(loadCardScripts().find((e) => e.script.identity.name === name).script);
const refused = (script) => compileScript(script).definition === null;

check("descend is counted for the card's owner, from the hand too, and only this turn", () => {
  const s = play({setup: [at(0, "battlefield", "Wastes"), at(0, "hand", "Toss", "Bear")], steps: [{tap: "Wastes"}, {cast: "Toss"}, {resolve: true}, {choose: ["Bear"]}]});
  assert.equal(s.players[0].descendedThisTurn, 1, "a creature card discarded is a permanent card put into its owner's graveyard (CR 700.11)");
  const later = play({setup: [at(0, "battlefield", "Wastes"), at(0, "hand", "Toss", "Bear")],
    steps: [{tap: "Wastes"}, {cast: "Toss"}, {resolve: true}, {choose: ["Bear"]}, {to: {turn: 2, phase: "MAIN1"}}]});
  assert.equal(later.players[0].descendedThisTurn ?? 0, 0, "a new turn begins with no descent");
});

check("Canonized in Blood: descended on turn 1 is not descended on turn 3", () => {
  const s = play({setup: [at(0, "battlefield", "Canonized in Blood", "Pup", "Mountain", "Bear"), at(0, "hand", "Sparkzap")],
    steps: [{tap: "Mountain"}, {cast: "Sparkzap", targets: [{card: "Pup"}]}, {resolve: true}, {to: {turn: 1, phase: "END_OF_TURN"}}, {choose: ["Bear"]}, {resolve: true},
      {to: {turn: 3, phase: "END_OF_TURN"}}]});
  assert.equal(s.stack.length, 0, "no trigger on turn 3");
  assert.equal(s.objects[onField(s, "Bear")[0]].counters["+1/+1"], 1);
});

check("a temptation with no creature to choose is counted all the same (CR 701.54d)", () => {
  const s = play({setup: [at(0, "battlefield", "Wastes"), at(0, "hand", "Tempting Trinket")], steps: [{tap: "Wastes"}, {cast: "Tempting Trinket"}, {resolve: true}]});
  assert.equal(s.players[0].ring.count, 1);
  assert.equal(s.players[0].ring.bearer, null);
});

check("Rob's Bilbo and Maya's: each adds 1 to its own controller's gain alone", () => {
  const two = play({setup: [at(0, "battlefield", "Bilbo, Birthday Celebrant", "Plains"), at(1, "battlefield", "Bilbo, Birthday Celebrant"), at(0, "hand", "Heal Three")],
    steps: [{tap: "Plains"}, {cast: "Heal Three"}, {resolve: true}]});
  assert.equal(two.players[0].life, 44, "Maya's Bilbo affects only her");
});

check("Banquet Guests: X as high as the pool plus what affinity leaves over, and paid that way", () => {
  const t = play({setup: [at(0, "hand", "Banquet Guests", "Food Maker", "Food Maker"), at(0, "battlefield", "Forest", "Plains", "Wastes", "Wastes", "Wastes")],
    steps: [{tap: "Wastes"}, {cast: "Food Maker"}, {resolve: true}, {tap: "Wastes"}, {cast: "Food Maker"}, {resolve: true}, {tap: "Forest"}, {tap: "Plains"}, {tap: "Wastes"}]});
  const xs = legalActions(t, 0).filter((a) => a.kind === "cast" && a.label === "Banquet Guests").map((a) => a.x).sort();
  assert.deepEqual(xs, [0, 1, 2, 3], "one generic in the pool and two Foods: X up to 3");
  const u = play({setup: [at(0, "hand", "Banquet Guests", "Food Maker", "Food Maker"), at(0, "battlefield", "Forest", "Plains", "Wastes", "Wastes", "Wastes")],
    steps: [{tap: "Wastes"}, {cast: "Food Maker"}, {resolve: true}, {tap: "Wastes"}, {cast: "Food Maker"}, {resolve: true}, {tap: "Forest"}, {tap: "Plains"}, {tap: "Wastes"},
      {cast: "Banquet Guests", x: 3}, {resolve: true}]});
  assert.equal(u.objects[onField(u, "Banquet Guests")[0]].counters["+1/+1"], 6);
  assert.equal(Object.values(u.players[0].manaPool).reduce((a, b) => a + b, 0), 0, "the pool spent exactly");
});

check("a leftover reduction under X when the pool pays more than one way, when its sources are tapped for it, and when it is convoked", () => {
  /* {X}{G}{W}, X=3, two Foods: {1}{G}{W} from G, G, W, W -- the {1} either color, so Rob is asked which (castPayments). */
  const u = play({setup: [at(0, "hand", "Banquet Guests"), at(0, "battlefield", "Forest", "Forest", "Plains", "Plains", "Food", "Food")],
    steps: [{tap: "Forest"}, {tap: "Forest"}, {tap: "Plains"}, {tap: "Plains"}, {cast: "Banquet Guests", x: 3}]});
  assert.equal(u.awaiting?.kind, "choose-cost", "which mana pays it is asked");
  const v = play({setup: [at(0, "hand", "Banquet Guests"), at(0, "battlefield", "Forest", "Forest", "Plains", "Plains", "Food", "Food")],
    steps: [{tap: "Forest"}, {tap: "Forest"}, {tap: "Plains"}, {tap: "Plains"}, {cast: "Banquet Guests", x: 3}, {answer: [0]}, {resolve: true}]});
  assert.equal(v.objects[onField(v, "Banquet Guests")[0]].counters["+1/+1"], 6);
  /* With the table's xTaps, X as high as its untapped sources pay after the reduction: X=2 for a Forest and a Plains. */
  const w = play({pooledTaps: true, xTaps: true, setup: [at(0, "hand", "Banquet Guests"), at(0, "battlefield", "Forest", "Plains", "Food", "Food")], steps: [{cast: "Banquet Guests", x: 2}, {resolve: true}]});
  assert.equal(w.objects[onField(w, "Banquet Guests")[0]].counters["+1/+1"], 4);
  /* Chord of Calling beside Emerald Medallion: {X}{G}{G}{G} with X=2 is {1}{G}{G}{G}, three Forests and one creature convoked. */
  const asked = play({setup: [at(0, "hand", "Chord of Calling"), at(0, "battlefield", "Emerald Medallion", "Forest", "Forest", "Forest", "Pup", "Nut", "Nut", "Nut", "Nut")],
    steps: [{tap: "Forest"}, {tap: "Forest"}, {tap: "Forest"}, {cast: "Chord of Calling", x: 2, convoke: true}]});
  assert.deepEqual([awaitingChoice(asked).min, awaitingChoice(asked).max], [1, 4], "of five creatures, at most four help pay {1}{G}{G}{G}: the Medallion took one of X's two");
  const c = play({library: ["Bear"], setup: [at(0, "hand", "Chord of Calling"), at(0, "battlefield", "Emerald Medallion", "Forest", "Forest", "Forest", "Pup")],
    steps: [{tap: "Forest"}, {tap: "Forest"}, {tap: "Forest"}, {cast: "Chord of Calling", x: 2, convoke: true}, {choose: ["Pup"]}, {resolve: true}, {choose: ["Bear"]}]});
  assert.equal(onField(c, "Bear").length, 1, "a creature card with mana value 2 found");
});

check("Chatterfang beside Peregrin Took: the orders end differently, so Rob is asked (CR 616.1)", () => {
  const s = play({setup: [at(0, "battlefield", "Chatterfang, Squirrel General", "Peregrin Took", "Wastes"), at(0, "hand", "Food Maker")],
    steps: [{tap: "Wastes"}, {cast: "Food Maker"}, {resolve: true}]});
  assert.equal(s.awaiting?.player, 0);
  const labels = awaitingChoice(s).options.map((o) => o.label).sort();
  assert.deepEqual(labels, ["Chatterfang, Squirrel General first: 3 tokens", "Peregrin Took first: 4 tokens"]);
});

check("sacrifice X of many Squirrels: the set picked once it is taken, X of them exactly", () => {
  const nuts = Array(8).fill("Nut");
  const s = play({setup: [at(0, "battlefield", "Chatterfang, Squirrel General", "Swamp", ...nuts), at(1, "battlefield", "Ogre")],
    steps: [{tap: "Swamp"}, {activate: "Chatterfang, Squirrel General", x: 4, targets: [{card: "Ogre"}]}]});
  assert.equal(s.awaiting?.kind, "choose-cost", "70 ways to pick four of nine: asked once taken");
  const choice = awaitingChoice(s);
  const four = choice.options.filter((o) => o.label.startsWith("Nut")).slice(0, 4).map((o) => o.index);
  assert.equal(choice.min, 4);
  const t = runScenario({name: "x4", expect: [], setup: [at(0, "battlefield", "Chatterfang, Squirrel General", "Swamp", ...nuts), at(1, "battlefield", "Ogre")],
    steps: [{tap: "Swamp"}, {activate: "Chatterfang, Squirrel General", x: 4, targets: [{card: "Ogre"}]}, {answer: four}, {resolve: true}]}, index.definition, FIXTURES).state;
  assert.equal(onField(t, "Nut").length, 4);
  assert.equal(onField(t, "Ogre", 1).length, 0, "+4/-4 kills the 3/3");
});

check("devour never eats the creature devouring, nor another player's, and takes only what it offered", () => {
  const s = play({setup: [at(0, "hand", "Gobbler"), at(0, "battlefield", "Forest", "Pup"), at(1, "battlefield", "Bear")], steps: [{tap: "Forest"}, {cast: "Gobbler"}, {resolve: true}]});
  assert.deepEqual(awaitingChoice(s).options.map((o) => o.label), ["Pup"]);
  const none = play({setup: [at(0, "hand", "Gobbler"), at(0, "battlefield", "Forest"), at(1, "battlefield", "Bear")], steps: [{tap: "Forest"}, {cast: "Gobbler"}, {resolve: true}]});
  assert.equal(none.awaiting, null, "nothing of its controller's to devour: nothing asked");
  assert.throws(() => runScenario({name: "devour", expect: [], setup: [at(0, "hand", "Gobbler"), at(0, "battlefield", "Forest", "Pup")],
    steps: [{tap: "Forest"}, {cast: "Gobbler"}, {resolve: true}, {answer: [3]}]}, index.definition, FIXTURES), /Invalid selection/);
});

check("Foods' abilities cost less by Sam's static alone: Assemble the Entmoot's anthem takes nothing off Pippin's {1}", () => {
  const s = play({setup: [at(0, "battlefield", "Assemble the Entmoot", "Pippin, Warden of Isengard")], steps: []});
  assert.equal(legalActions(s, 0).filter((a) => a.kind === "activate" && a.label === "Pippin, Warden of Isengard").length, 0);
});

check("Lobelia's exiled card is linked to her, and to nothing else (CR 607.2a)", () => {
  const s = play({library: ["Bear"], setup: [at(0, "hand", "Lobelia, Defender of Bag End"), at(0, "battlefield", "Swamp", "Wastes", "Wastes", "Food Maker")],
    steps: [{tap: "Swamp"}, {tap: "Wastes"}, {tap: "Wastes"}, {cast: "Lobelia, Defender of Bag End"}, {resolve: true}, {resolve: true}]});
  const lobelia = onField(s, "Lobelia, Defender of Bag End")[0];
  assert.equal((s.links?.[lobelia] ?? []).length, 1, "the one card she exiled is linked to her");
  const other = Object.keys(s.links ?? {}).filter((k) => Number(k) !== lobelia && (s.links[k] ?? []).length);
  assert.deepEqual(other, [], "and to nothing else");
});

check("Gollum: noncombat damage is not combat damage, and another name is not his", () => {
  const s = play({setup: [at(0, "battlefield", "Gollum, Obsessed Stalker", "Bear", "Mountain"), at(0, "hand", "Sparkzap")],
    steps: [{tap: "Mountain"}, {cast: "Sparkzap", targets: [{player: 1}]}, {resolve: true}, {attack: ["Bear"]}, {to: {turn: 1, phase: "MAIN2"}}]});
  assert.deepEqual(s.players[1].combatDamagedByNames, ["Bear"]);
});

check("skulk: a blocker of equal power may block", () => {
  const s = play({setup: [at(0, "battlefield", "Gollum, Obsessed Stalker"), at(1, "battlefield", "Pup")], steps: [{attack: ["Gollum, Obsessed Stalker"]}]});
  const gollum = onField(s, "Gollum, Obsessed Stalker")[0], pup = onField(s, "Pup", 1)[0];
  assert.equal(canBlockAttacker(s, pup, gollum), true);
});

check("the schema and the compiler refuse what the new keys do not mean", () => {
  const bilbo = scriptOf("Bilbo, Birthday Celebrant");
  bilbo.abilities[0].plus = 0;
  assert.ok(refused(bilbo), "plus 0");
  const both = scriptOf("Bilbo, Birthday Celebrant");
  both.abilities[0].times = 2;
  assert.ok(refused(both), "plus beside times");
  const chatter = scriptOf("Chatterfang, Squirrel General");
  chatter.abilities[1].thatMany = 2;
  assert.ok(refused(chatter), "thatMany is true");
  const lobelia = scriptOf("Lobelia, Defender of Bag End");
  lobelia.abilities[1].effects[0].modes[0].effects[0].linked = "yes";
  delete lobelia.abilities[1].effects[0].modes[0].effects[0].count;
  assert.ok(refused(lobelia), "linked is true");
  const lobelia2 = scriptOf("Lobelia, Defender of Bag End");
  lobelia2.abilities[1].effects[0].modes[0].effects[0].count = 0;
  assert.ok(refused(lobelia2), "a linked count is 1 or more");
  const hobbit = scriptOf("Feasting Hobbit");
  delete hobbit.abilities[0].amount;
  assert.ok(refused(hobbit), "devour needs its number");
  const sorcery = scriptOf("Feasting Hobbit");
  sorcery.identity = {...sorcery.identity, types: ["Sorcery"], power: null, toughness: null};
  sorcery.abilities = [sorcery.abilities[0]];
  assert.ok(compileScript(sorcery).problems.some((p) => /never enters the battlefield/.test(p)), "devour on a card that never enters");
  assert.ok(conditionProblems({ringBearer: false}).length > 0);
  assert.ok(conditionProblems({ringTemptedAtLeast: 0}).length > 0);
  assert.ok(conditionProblems({descended: false}).length > 0);
  assert.ok(conditionProblems({combatDamagedBy: {named: 3}}).length > 0);
  assert.equal(conditionProblems({allOf: [{ringBearer: true}, {ringTemptedAtLeast: 2}]}).length, 0);
});

check("the sentence library never translates a permanent's sentence as a spell (CR 113.3a): Pristine Talisman is left to write", () => {
  const talisman = scriptOf("Pristine Talisman");
  const library = createLibrary(loadCardScripts().map((e) => e.script));
  const tr = translate(talisman, library, {except: talisman.identity.name});
  assert.equal(tr.ok, false, "\"You gain 1 life.\" is learned from spells, and a Talisman has none");
});

/* Every card the lane wrote, through its scenarios. */
const LANE = ["Frodo, Adventurous Hobbit", "Sam, Loyal Attendant", "Agent of the Iron Throne", "Assemble the Entmoot", "Banquet Guests",
  "Bilbo, Birthday Celebrant", "Butterbur, Bree Innkeeper", "Call for Unity", "Canonized in Blood", "Chatterfang, Squirrel General", "Crypt Incursion",
  "Dawn of Hope", "Disciple of the Vault", "Farmer Cotton", "Feasting Hobbit", "Field-Tested Frying Pan", "Fumigate", "Get Lost", "Ghost Quarter",
  "Gollum, Obsessed Stalker", "Lobelia, Defender of Bag End", "Merry, Warden of Isengard", "Murmuring Bosk", "Of Herbs and Stewed Rabbit",
  "Orchard Strider", "Pick Your Poison", "Pippin, Warden of Isengard", "Pristine Talisman", "Prize Pig", "Rapacious Guest", "Rosie Cotton of South Lane",
  "Samwise Gamgee", "Savvy Hunter", "Shire Shirriff", "The Battle of Bywater", "The Gaffer", "Trading Post", "Treebeard, Gracious Host"];
const files = loadCardScenarios().filter((f) => LANE.includes(f.scenarios.card));
assert.equal(files.length, LANE.length, "each card the lane wrote has its scenarios");
for (const {scenarios: file} of files) for (const scenario of file.scenarios)
  check(`${file.card}: ${scenario.name}`, () => runScenario(scenario, index.definition, file.fixtures ?? {}));

console.log(`engine-roblists-food: ${checks} checks passed — descend, the Ring's count, life plus one, affinity under X, sacrifice X, that many Squirrels, devour, a linked card played free, damage by a name, skulk, and the lane's ${LANE.length} cards through their scenarios.`);
