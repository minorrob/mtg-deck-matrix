/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* WAVE 4B, LANE J2: THE TOP OF A LIBRARY PUT BACK IN ANY ORDER, AN AMOUNT A DELAYED TRIGGER REMEMBERS, AND WHAT CAME WITH
 * THE REST OF THE LANE'S CARDS.
 *
 * What the cards' scenarios cannot reach, each against the rule it follows:
 *   - rearrangeTop (effects/asking.mjs; Ponder, Sensei's Divining Top): a library of one card or none, another player's
 *     library, a card gone before the answer, a looker who left, and what each seat sees of the library after;
 *   - a spell's mana value on the stack counts X as chosen (CR 202.3e): the facts a resolution reads (script/bind.mjs) and an
 *     amount (script/amount.mjs) -- Mana Drain's "that spell's mana value";
 *   - "lose hexproof" (Shadowspear; rules/layers.mjs removeKeywords): a keyword counter put on since keeps its keyword, and
 *     a "hexproof from" ability given before is lost with hexproof (rules/protection.mjs);
 *   - a basic land type given by an effect brings its mana ability (CR 305.7; rules/layers.mjs intrinsicMana): once a type,
 *     however many effects give it, and lost with "loses all abilities";
 *   - a token enters tapped when a replacement says so (Authority of the Consuls; CR 111.1, 614.12): never by its own ability
 *     for others; its own "unless you pay" asks before entry;
 *   - "change a target ... to this creature" (Spellskite; effects/asking.mjs changeTargets `to: "self"`) is in its scenarios;
 *   - the catalog's credits (game/tools/engine-constructs.mjs).
 */
import assert from "node:assert/strict";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex, loadCardScenarios} from "../game/tools/engine-cards.mjs";
import {tableCards} from "../cloud/game-room.mjs";
import {beginResolution} from "../game/engine/script/resolution.mjs";
import {awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {ASKING} from "../game/engine/script/effects/asking.mjs";
import {NEEDS_A_DECISION, isBuilt} from "../game/engine/script/effects/index.mjs";
import {projectFor} from "../game/engine/projection.mjs";
import {keywordsOf, abilitiesOf} from "../game/engine/rules/layers.mjs";
import {hexproofFrom} from "../game/engine/rules/protection.mjs";
import {amountOf} from "../game/engine/script/amount.mjs";
import {factsOf} from "../game/engine/script/bind.mjs";
import {xOnStack, moveObject} from "../game/engine/state/index.mjs";
import {isPrimitive} from "../game/engine/vocabulary.mjs";
import {FORGE_API, FORGE_TRIGGER, missingFor} from "../game/tools/engine-constructs.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const creature = (cost, subtypes, colors, p, t, more = {}) => ({types: ["Creature"], subtypes, manaCost: cost, colors, power: p, toughness: t, ...more});
const FIX = {
  Alpha: creature("{5}", ["Horror"], ["B"], 1, 1), Bravo: creature("{5}", ["Horror"], ["B"], 1, 1), Charlie: creature("{5}", ["Horror"], ["B"], 1, 1),
  Delta: creature("{5}", ["Horror"], ["B"], 1, 1),
  "Shrouded Beast": creature("{1}{G}", ["Beast"], ["G"], 2, 2, {keywords: ["Hexproof"]}),
  "Blue Wisp": creature("{U}", ["Spirit"], ["U"], 1, 1),
  Blaze: {types: ["Sorcery"], manaCost: "{X}{R}", colors: ["R"], spell: {id: "s", text: "Blaze deals X damage to any target.",
    targets: [{anyOf: [{what: "permanent", types: ["Creature"]}, {what: "player"}]}], effects: [{effect: "dealDamage", amount: "X", targets: {target: 0}, who: {target: 0}}]}},
};
const at = (seat, zone, ...cards) => ({seat, zone, cards});
const table = (setup, {library = [], steps = [], seats = 2, at: when} = {}) =>
  runScenario({name: "4b-j2", setup, library, steps, seats, ...(when ? {at: when} : {})}, index.definition, FIX).state;
const idOf = (s, card, seat = 0) => s.zones.battlefield.find((id) => s.objects[id].card === card && s.objects[id].owner === seat);
const names = (s, ids) => ids.map((id) => s.objects[id].card);
const libraryTop = (s, seat, n) => names(s, s.zones.library[seat].slice(0, n));
const seen = (s, viewer, owner) => projectFor(s, viewer).players[owner].zones.Library.cards.map((c) => c.name);
const run = (s, effects, controller = 0, extra = {}) => beginResolution(s, effects, {controller, source: null, ...extra});
const ABCD = ["Alpha", "Bravo", "Charlie", "Delta"];

/* ---- rearrangeTop ---- */
{
  ok(isPrimitive("rearrangeTop") && isBuilt("rearrangeTop") && NEEDS_A_DECISION.includes("rearrangeTop"), "rearrangeTop is declared, built, and asks");
  ok(["open", "choice", "apply", "left"].every((k) => typeof ASKING.rearrangeTop[k] === "function"), "with every part an asking primitive has");
}
{
  const s = table([], {library: ABCD});
  eq(run(s, [{effect: "rearrangeTop", count: 3}]).status, "waiting", "the top three of Rob's library: he is asked their order");
  const q = awaitingChoice(s);
  eq([s.awaiting.player, q.mode, q.min, q.max, q.options.map((o) => o.label)], [0, "order", 3, 3, ["Alpha", "Bravo", "Charlie"]], "one question, an order of all three");
  ok(/your library/.test(q.title), "his own library, said as his");
  eq(seen(s, 1, 0), [], "nothing is revealed: Maya sees none of them");
  resolveAwaiting(s, [2, 0, 1]);
  eq([libraryTop(s, 0, 4), s.zones.library[0].length, s.awaiting], [["Charlie", "Alpha", "Bravo", "Delta"], 20, null], "put back Charlie, Alpha, Bravo, the first chosen on top; the fourth where it was");
  eq([seen(s, 0, 0), seen(s, 1, 0)], [["Charlie", "Alpha", "Bravo"], []], "Rob knows the top three as they now are; Maya still nothing");
}
{
  const s = table([], {library: ABCD});
  s.zones.library[0] = s.zones.library[0].slice(0, 1);
  eq([run(s, [{effect: "rearrangeTop", count: 3}]).status, s.awaiting], ["done", null], "a library of one card: no order to choose, nobody is asked");
  eq(seen(s, 0, 0), ["Alpha"], "and the card is looked at all the same");
  s.zones.library[0] = [];
  const looksBefore = structuredClone(s.looks ?? []);
  eq([run(s, [{effect: "rearrangeTop", count: 3}]).status, s.looks ?? []], ["done", looksBefore], "an empty library: nothing to look at, nothing happens");
}
{
  const s = table([], {library: ABCD});
  run(s, [{effect: "rearrangeTop", count: 2, who: [1]}]);
  const q = awaitingChoice(s);
  eq([s.awaiting.player, q.options.map((o) => o.label)], [0, ["Alpha", "Bravo"]], "another player's library (`who`): its top two, Rob the one who orders them");
  ok(/Maya's library/.test(q.title), "said as Maya's library");
  resolveAwaiting(s, [1, 0]);
  eq([libraryTop(s, 1, 2), libraryTop(s, 0, 2), seen(s, 0, 1), seen(s, 1, 1)], [["Bravo", "Alpha"], ["Alpha", "Bravo"], ["Bravo", "Alpha"], []],
    "Maya's library is the one changed; Rob knows its top, Maya does not");
}
{
  const s = table([], {library: ABCD});
  run(s, [{effect: "rearrangeTop", count: 3}]);
  const bravo = s.zones.library[0][1];
  moveObject(s, bravo, "graveyard", 0);
  resolveAwaiting(s, [1, 2, 0]);
  eq([libraryTop(s, 0, 3), names(s, s.zones.graveyard[0]), s.zones.library[0].length], [["Charlie", "Alpha", "Delta"], ["Bravo"], 19],
    "a card gone from the library before the answer is left where it went; the others are put back as answered");
}
{
  const s = table([], {library: ABCD});
  run(s, [{effect: "rearrangeTop", count: 3}]);
  eq([ASKING.rearrangeTop.left(s, s.awaiting), libraryTop(s, 0, 3)], [[], ["Alpha", "Bravo", "Charlie"]], "asked of a player who has left: the cards stay as they were");
}
{
  const s = table([], {library: ABCD});
  eq([run(s, [{effect: "rearrangeTop", count: 3, who: []}]).status, s.awaiting, libraryTop(s, 0, 3)], ["done", null, ["Alpha", "Bravo", "Charlie"]],
    "a library of nobody's (a target player gone): nothing looked at, nobody asked");
}

/* ---- a spell's mana value on the stack (CR 202.3e) ---- */
{
  const s = table([at(1, "battlefield", "Mountain", "Wastes", "Wastes", "Wastes"), at(1, "hand", "Blaze")],
    {at: {turn: 2, phase: "MAIN1"}, steps: [{tap: "Mountain", seat: 1}, {tap: "Wastes", seat: 1}, {tap: "Wastes", seat: 1}, {tap: "Wastes", seat: 1},
      {cast: "Blaze", seat: 1, x: 3, targets: [{player: 0}]}]});
  const blaze = s.stack[s.stack.length - 1].objectId;
  eq([xOnStack(s, blaze), amountOf(s, {manaValueOf: "that card"}, {about: {card: blaze}}), factsOf(s, [{kind: "object", id: blaze}])[0].manaValueOf], [3, 4, 4],
    "Blaze with X 3 on the stack: mana value 4, as an amount and as a fact a resolution reads");
  const card = moveObject(s, blaze, "graveyard", 1);
  s.stack.pop();
  eq([xOnStack(s, card), amountOf(s, {manaValueOf: "that card"}, {about: {card}}), factsOf(s, [{kind: "object", id: card}])[0].manaValueOf], [0, 1, 1],
    "anywhere else X is 0: the card in the graveyard is mana value 1");
}

/* ---- "lose hexproof and indestructible" (Shadowspear) ---- */
const SHADOW = {effect: "effectUntil", layer: 6, selector: {what: "permanent", controller: "opponent"}, apply: {removeKeywords: ["Hexproof", "Indestructible"]}, until: "end-of-turn"};
{
  const s = table([at(1, "battlefield", "Shrouded Beast")]);
  const beast = idOf(s, "Shrouded Beast", 1);
  run(s, [SHADOW]);
  ok(!keywordsOf(s, beast).includes("Hexproof"), "the Beast's printed hexproof is gone");
  run(s, [{effect: "putCounter", targets: [beast], counter: "hexproof", count: 1}], 1);
  ok(keywordsOf(s, beast).includes("Hexproof"), "a hexproof counter put on it since gives hexproof again (CR 122.1b, 613.7)");
}
{
  const s = table([at(1, "battlefield", "Shrouded Beast")]);
  const beast = idOf(s, "Shrouded Beast", 1);
  run(s, [{effect: "putCounter", targets: [beast], counter: "indestructible", count: 1}], 1);
  ok(keywordsOf(s, beast).includes("Indestructible"), "an indestructible counter: indestructible");
  run(s, [SHADOW]);
  ok(!keywordsOf(s, beast).includes("Indestructible") && !keywordsOf(s, beast).includes("Hexproof"), "put on before the effect: taken away with the printed hexproof");
}
{
  const s = table([at(0, "battlefield", "Blue Wisp"), at(1, "battlefield", "Shrouded Beast")]);
  const beast = idOf(s, "Shrouded Beast", 1), wisp = idOf(s, "Blue Wisp", 0);
  run(s, [{effect: "effectUntil", rule: "hexproof-from", colors: ["U"], targets: [beast]}], 1);
  ok(hexproofFrom(s, beast, 0, wisp), "the Beast has hexproof from blue, against Rob's blue Wisp");
  run(s, [SHADOW]);
  ok(!hexproofFrom(s, beast, 0, wisp), "lost with hexproof: a hexproof from ability is a hexproof ability (CR 702.11d)");
  run(s, [{effect: "effectUntil", rule: "hexproof-from", colors: ["U"], targets: [beast]}], 1);
  ok(hexproofFrom(s, beast, 0, wisp), "given again after the effect: it has it (CR 613.7)");
}

/* ---- a basic land type given brings its mana ability (CR 305.7) ---- */
const manaOf = (s, id) => abilitiesOf(s, id).filter((a) => a.kind === "mana").map((a) => Object.keys(a.produces ?? {}).join("")).sort();
{
  const s = table([at(0, "battlefield", "Dryad of the Ilysian Grove", "Dryad of the Ilysian Grove", "Wastes", "Plains")]);
  eq(manaOf(s, idOf(s, "Wastes")), ["B", "C", "G", "R", "U", "W"], "two Dryads: the Wastes has each type's mana ability once");
  eq(manaOf(s, idOf(s, "Plains")), ["B", "G", "R", "U", "W"], "a Plains its own {W} and the four it gained");
  run(s, [{effect: "effectUntil", layer: 6, targets: [idOf(s, "Wastes")], apply: {removeAllAbilities: true}}]);
  eq(manaOf(s, idOf(s, "Wastes")), [], "a Wastes that then loses all abilities loses those too (CR 613.1f)");
}

/* ---- a token enters tapped (CR 111.1, 614.12) ---- */
const SOLDIER = {name: "Soldier", types: ["Creature"], subtypes: ["Soldier"], colors: ["W"], power: 1, toughness: 1};
const tokenIds = (s, name) => s.zones.battlefield.filter((id) => s.objects[id].token && s.objects[id].card === name);
{
  const s = table([]);
  const warden = {...SOLDIER, name: "Warden", abilities: [{id: "w", kind: "replacement", text: "Creatures you control enter tapped.", watches: {event: "enters", filter: {types: ["Creature"], controller: "you"}}, change: {entersTapped: true}}]};
  run(s, [{effect: "createToken", count: 1, token: warden}]);
  eq(tokenIds(s, "Warden").map((id) => s.objects[id].tapped), [false], "a token's own \"creatures you control enter tapped\" is not about itself");
  run(s, [{effect: "createToken", count: 1, token: SOLDIER}]);
  eq(tokenIds(s, "Soldier").map((id) => s.objects[id].tapped), [true], "the next token Rob makes enters tapped by it");
  run(s, [{effect: "createToken", count: 1, token: SOLDIER}], 1);
  eq(tokenIds(s, "Soldier").filter((id) => s.objects[id].controller === 1).map((id) => s.objects[id].tapped), [false], "Maya's does not");
}
{
  const shock = {...SOLDIER, name: "Vent", abilities: [{id: "v", kind: "replacement", text: "As this enters, you may pay 2 life. If you don't, it enters tapped.", watches: {event: "enters", who: "self"}, change: {entersTapped: true, unlessPay: {life: 2}}}]};
  const tapland = {...SOLDIER, name: "Tapper", abilities: [{id: "t", kind: "replacement", text: "This enters tapped.", watches: {event: "enters", who: "self"}, change: {entersTapped: true}}]};
  for (const pay of [false, true]) {
    let s = table([]);
    eq(run(s, [{effect: "createToken", count: 1, token: shock}, {effect: "createToken", count: 1, token: tapland}]).status, "waiting", "the native entry operation waits for the life payment");
    eq([tokenIds(s, "Vent"), tokenIds(s, "Tapper"), s.players[0].life], [[], [], 40], "no token or later instruction is committed before the answer");
    eq(awaitingChoice(s).options.map(option => option.pay), [true, false], "paying and declining are both explicit legal choices");
    s = JSON.parse(JSON.stringify(s));
    const before = structuredClone(s);
    assert.throws(() => resolveAwaiting(s, [99]), /Select the required rule options/); checks++;
    eq(s, before, "invalid answer leaves the reloaded state untouched");
    resolveAwaiting(s, [pay ? 0 : 1]);
    eq([tokenIds(s, "Vent").map((id) => s.objects[id].tapped), tokenIds(s, "Tapper").map((id) => s.objects[id].tapped), s.players[0].life], [[!pay], [true], pay ? 38 : 40],
      "the chosen life payment controls Vent's tapped entry; the following Tapper still enters tapped");
    eq([s.awaiting, s.ruleOperation ?? null, s.resolving ?? null], [null, null, null], "both token instructions finish exactly once");
  }
}

/* ---- the catalog's credits ---- */
{
  eq([FORGE_API.RearrangeTopOfLibrary, FORGE_TRIGGER.SpellCastOrCopy, FORGE_API.ChangeTargets], ["rearrangeTop", "spell cast", "changeTargets"],
    "RearrangeTopOfLibrary is rearrangeTop; SpellCastOrCopy the spell cast trigger; ChangeTargets changeTargets");
  eq([missingFor({apis: ["RearrangeTopOfLibrary", "Draw"]}), missingFor({apis: ["Draw"], triggers: ["SpellCastOrCopy"]}), missingFor({apis: ["ChangeTargets"]})], [[], [], []],
    "Ponder, Archmage Emeritus and Spellskite have every rule, by the catalog");
}

/* ---- the table playing the lane's cards ---- */
{
  const MINE = ["Deflecting Swat", "Teferi's Protection", "Mana Drain", "Herald's Horn", "Ponder", "Storm-Kiln Artist", "Rhythm of the Wild", "Growth Spiral",
    "Archmage Emeritus", "Malakir Rebirth // Malakir Mire", "Golgari Rot Farm", "Dryad of the Ilysian Grove", "Bloom Tender", "Sensei's Divining Top",
    "Untimely Malfunction", "Baleful Strix", "Exploration", "Authority of the Consuls", "Diabolic Intent", "Gruul Turf", "Shadowspear", "Ripples of Undeath",
    "Rakdos Carnarium", "Tundra", "Snakeskin Veil", "Badlands", "Selesnya Sanctuary", "Puresteel Paladin",
    /* And the cards that prove the constructs: "to this creature", the third rearranging card. */
    "Spellskite", "Hydroelectric Specimen // Hydroelectric Laboratory", "Halimar Depths"];
  eq(MINE.filter((name) => !tableCards(name)), [], "the table can play all thirty-one");
  /* Their scenarios, with those of the cards whose constructs they extend -- tests/engine-cards.mjs plays every card's; here, the
     lane's alone, so a break of what they read is caught in seconds (game/tools/batch/breaks-wave4b-j2.py). */
  const LANE = new Set([...MINE, "Bolt Bend", "Wild Ricochet", "Imp's Mischief", "Teferi's Reproach", "Song of the Dryads", "Archon of Emeria", "Skrelv, Defector Mite"]);
  const files = loadCardScenarios().filter(({scenarios: file}) => LANE.has(file.card));
  eq(files.length, LANE.size, "a scenario file for each");
  for (const {scenarios: file} of files) for (const scenario of file.scenarios) { runScenario(scenario, index.definition, file.fixtures ?? {}); checks += 1; }
}

console.log(`engine-rearrange-copies-4b: ${checks} checks passed -- the top of a library put back in any order (one card, none, another's, a card gone, a looker gone), X on the stack, hexproof lost and had again, a basic land type's mana, a token entering tapped, the credits, the table.`);
