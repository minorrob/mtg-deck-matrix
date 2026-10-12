/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* TRAIN C, P4-REPLACEMENTS: TOKENS CREATED, REPLACED (CR 614.1a, 111.1) -- Anointed Procession and Draconic Visitor.
 *
 * rules/statics.mjs, tokensCreated, read wherever tokens are made (script/effects/permanents.mjs: createToken and a token
 * copy's makeCopies): `more-tokens` ("it creates twice that many of those tokens instead"), for the player its `affects`
 * names; `tokens-instead` ("if one or more artifact tokens would be created under your control, that many 5/5 red Dragon
 * creature tokens with flying are created instead"), its controller's, the tokens it replaces told by their card types.
 * They end the same in either order (CR 616.1). Here: two Processions, whose control a token is made under, the effect's
 * own words (tapped, remembered, haste) on what is made instead, investigate, the turn's record, four players, the schema.
 *
 * Train E: `tokens-plus` (Queen Allenal of Ruadach, "those tokens plus a 1/1 white Soldier creature token are created
 * instead"), whose order beside a doubler changes what is made -- asked of the tokens' controller in a resolution
 * (effects/asking.mjs, orderTokens), the most where nothing can ask -- the Soldier given none of the effect's words, the
 * Visitor's Dragons first, two adders, whose, a copy, the house pilot, the schema.
 */
import assert from "node:assert/strict";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {compileScript} from "../game/engine/cards/index.mjs";
import {runEffects} from "../game/engine/script/effects/index.mjs";
import {keywordsOf} from "../game/engine/rules/layers.mjs";
import {beginResolution} from "../game/engine/script/resolution.mjs";
import {awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {housePilot} from "../game/engine/pilots/house-pilot.mjs";
import {projectFor} from "../game/engine/projection.mjs";
import {ASKING} from "../game/engine/script/effects/asking.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const AP = "Anointed Procession", DV = "Draconic Visitor";
const FIX = {Relic: {types: ["Artifact"], subtypes: [], manaCost: "{2}", colors: []},
  Thopter: {types: ["Artifact", "Creature"], subtypes: ["Thopter"], manaCost: "{1}", colors: [], power: 1, toughness: 1, keywords: ["Flying"]},
  /* "If an effect would create one or more tokens under your control, it creates three times that many of those tokens instead." */
  Trebler: {types: ["Enchantment"], subtypes: [], manaCost: "{3}{W}", colors: ["W"], abilities: [{id: "t", kind: "static", text: "x", rule: "more-tokens", affects: {who: "you"}, times: 3}]}};
const at = (seat, zone, ...cards) => ({seat, zone, cards});
const table = (setup, seats = 2) => runScenario({name: "tokens-replaced", seats, setup, steps: []}, index.definition, FIX).state;
const named = (s, name, seat = 0) => s.zones.battlefield.filter((id) => s.objects[id].card === name && s.objects[id].controller === seat);
const SOLDIER = {name: "Soldier", types: ["Creature"], subtypes: ["Soldier"], colors: ["W"], power: 1, toughness: 1};
const make = (s, params, controller = 0) => { const context = {controller, source: null}; runEffects(s, [{effect: "createToken", count: 1, ...params}], context); return context; };

{
  const s = table([at(0, "battlefield", AP, AP)]);
  make(s, {token: SOLDIER});
  eq([named(s, "Soldier").length, s.players[0].tokensThisTurn], [4, 4], "two Processions: four times as many -- and four counted as made this turn");
  const t = table([at(0, "battlefield", "Trebler")]);
  make(t, {token: SOLDIER});
  eq(named(t, "Soldier").length, 3, "times 3: three times as many");
}
{
  /* "Target player creates": the tokens are made under that player's control, and that player's Procession is the one. */
  const s = table([at(0, "battlefield", AP), at(1, "battlefield", AP)]);
  make(s, {token: SOLDIER, controller: 1});
  eq([named(s, "Soldier", 1).length, named(s, "Soldier", 0).length], [2, 0], "Rob's effect, Maya's tokens: her Procession doubles them, his does not");
}
{
  /* What the effect says of the tokens holds for those made instead: tapped, haste, remembered. */
  const s = table([at(0, "battlefield", DV, AP)]);
  const context = make(s, {token: {predefined: "Treasure"}, tapped: true, gainsUntilEndOfTurn: ["Haste"], remember: true});
  const dragons = named(s, "Dragon");
  eq([dragons.length, named(s, "Treasure").length, dragons.every((id) => s.objects[id].tapped), dragons.every((id) => keywordsOf(s, id).includes("Haste")), context.remembered],
    [2, 0, true, true, dragons], "a tapped Treasure with haste: two tapped Dragons with haste, remembered for what follows");
}
{
  const s = table([at(0, "battlefield", DV)]);
  runEffects(s, [{effect: "investigate", count: 2}], {controller: 0, source: null});
  eq([named(s, "Dragon").length, named(s, "Clue").length], [2, 0], "investigate twice: two Dragons, no Clues (a Clue is an artifact token)");
}
{
  /* A copy of an artifact creature would be an artifact token. */
  const s = table([at(0, "battlefield", DV, "Thopter")]);
  const [thopter] = named(s, "Thopter");
  runEffects(s, [{effect: "copyPermanent", targets: [thopter]}], {controller: 0, source: null});
  eq([named(s, "Thopter").length, named(s, "Dragon").length], [1, 1], "a token copy of the Thopter: a Dragon instead");
}
{
  const s = table([at(0, "battlefield", AP), at(1, "battlefield", DV), at(2, "battlefield", AP, DV)], 4);
  for (const seat of [0, 1, 2, 3]) make(s, {token: {predefined: "Treasure"}}, seat);
  eq([0, 1, 2, 3].map((seat) => [named(s, "Treasure", seat).length, named(s, "Dragon", seat).length]), [[2, 0], [0, 1], [0, 2], [1, 0]],
    "four players: each permanent its own controller's -- Rob two Treasures, Maya a Dragon, Trey two Dragons, Sam a Treasure");
}
/* ---- `tokens-plus`: "those tokens plus a 1/1 white Soldier creature token are created instead" (Queen Allenal of Ruadach) ---- */
const QA = "Queen Allenal of Ruadach";
const GOBLIN = {name: "Goblin", types: ["Creature"], subtypes: ["Goblin"], colors: ["R"], power: 1, toughness: 1};
/* Two that may stand side by side (the Queen is legendary, CR 704.5j): the same replacement, on enchantments. */
FIX.Banner = {types: ["Enchantment"], subtypes: [], manaCost: "{W}", colors: ["W"], abilities: [{id: "b", kind: "static", text: "x", rule: "tokens-plus", affects: {types: ["Creature"]}, token: SOLDIER}]};
/* One that adds to artifact tokens: "those tokens plus a 1/1 white Soldier creature token", of a Treasure. */
FIX.Foundry = {types: ["Enchantment"], subtypes: [], manaCost: "{W}", colors: ["W"], abilities: [{id: "f", kind: "static", text: "x", rule: "tokens-plus", affects: {types: ["Artifact"]}, token: SOLDIER}]};
const resolve = (s, effect, controller = 0) => beginResolution(s, [effect], {controller, source: null});
const answer = (s, label) => {
  const q = awaitingChoice(s), option = q.options.find((o) => o.label === label);
  assert.ok(option, `no option ${label}: ${q.options.map((o) => o.label).join(", ")}`);
  return resolveAwaiting(s, [option.index]);
};
{
  const s = table([at(0, "battlefield", QA)]);
  const context = make(s, {token: GOBLIN, tapped: true, gainsUntilEndOfTurn: ["Haste"], remember: true});
  const [goblin] = named(s, "Goblin"), [soldier] = named(s, "Soldier");
  eq([named(s, "Goblin").length, named(s, "Soldier").length, s.players[0].tokensThisTurn], [1, 1, 2], "a Goblin: that Goblin plus a Soldier, both counted as made this turn");
  eq([s.objects[goblin].tapped, keywordsOf(s, goblin).includes("Haste"), s.objects[soldier].tapped === true, keywordsOf(s, soldier).includes("Haste")], [true, true, false, false],
    "the effect's words are the Goblin's alone: the Soldier is untapped and gains no haste");
  eq(context.remembered, [goblin, soldier], "and both are what the effect made, for what follows (CR 614.6)");
  make(s, {token: {predefined: "Treasure"}});
  eq([named(s, "Treasure").length, named(s, "Soldier").length], [1, 1], "a Treasure is no creature token: no Soldier");
  make(s, {token: GOBLIN, count: 0});
  eq([named(s, "Goblin").length, named(s, "Soldier").length], [1, 1], "no Goblin made, none added to");
}
{
  const s = table([at(0, "battlefield", QA, "Foundry")]);
  make(s, {token: {predefined: "Treasure"}});
  eq([named(s, "Treasure").length, named(s, "Soldier").length], [1, 2], "an adder of artifact tokens adds a Soldier to a Treasure, and the Queen, a creature token now made, adds hers (CR 616.1e)");
}
{
  /* Nothing can stop to ask (an effect run outside a resolution): the order that makes the most -- the Queen first, though
     the Procession is the first of them on the battlefield. */
  const s = table([at(0, "battlefield", AP, QA)]);
  make(s, {token: GOBLIN});
  eq([named(s, "Goblin").length, named(s, "Soldier").length], [2, 2], "unasked, the Queen before the Procession: two Goblins and two Soldiers");
}
{
  /* In a resolution the order is asked of the tokens' controller (CR 616.1), each option saying where it leads. */
  const s = table([at(0, "battlefield", QA, AP)]);
  eq(resolve(s, {effect: "createToken", count: 1, token: GOBLIN}).status, "waiting", "a Goblin with the Queen and the Procession: the resolution stops to ask");
  const q = awaitingChoice(s);
  eq([s.awaiting.player, q.options.map((o) => o.label).sort(), q.options.map((o) => o.makes).sort()],
    [0, ["Anointed Procession first: 3 tokens", "Queen Allenal of Ruadach first: 4 tokens"], [3, 4]], "Rob is asked which first: 3 tokens or 4");
  ok(q.id.startsWith("order-tokens:"), "an order-tokens question");
  const pilot = housePilot({seat: 0, cards: index.definition});
  const p = table([at(0, "battlefield", AP, QA)]);
  resolve(p, {effect: "createToken", count: 1, token: GOBLIN});
  const pq = awaitingChoice(p);
  eq([pq.options[0].makes, pq.options[pilot.answer(projectFor(p, 0), pq).indices[0]].makes], [3, 4], "the house pilot takes the order that makes the most, not the first offered");
  const out = ASKING.orderTokens.left(p, p.awaiting);
  eq([out.splice?.[0]?.effect, out.splice?.[0]?.tokenOrders], ["createToken", {}], "asked of a player who has left: the effect again, as it stands, nothing more asked of them");
  answer(s, "Anointed Procession first: 3 tokens");
  eq([s.awaiting, named(s, "Goblin").length, named(s, "Soldier").length], [null, 2, 1], "the Procession first: two Goblins, then one Soldier added");
  const t = table([at(0, "battlefield", QA, AP)]);
  resolve(t, {effect: "createToken", count: 1, token: GOBLIN});
  answer(t, "Queen Allenal of Ruadach first: 4 tokens");
  eq([named(t, "Goblin").length, named(t, "Soldier").length], [2, 2], "the Queen first: the Goblin and the Soldier, both doubled");
}
{
  /* Draconic Visitor's Dragons come first -- they change what, never how many -- and are creature tokens the Queen adds to. */
  const s = table([at(0, "battlefield", QA, DV)]);
  eq(resolve(s, {effect: "createToken", count: 1, token: {predefined: "Treasure"}}).status, "done", "a Treasure with the Visitor and the Queen: nobody is asked");
  eq([named(s, "Treasure").length, named(s, "Dragon").length, named(s, "Soldier").length], [0, 1, 1], "a Dragon instead, and a Soldier beside it");
  const t = table([at(0, "battlefield", QA, DV, AP)]);
  resolve(t, {effect: "createToken", count: 1, token: {predefined: "Treasure"}});
  eq(awaitingChoice(t).options.map((o) => o.label).sort(), ["Anointed Procession first: 3 tokens", "Queen Allenal of Ruadach first: 4 tokens"],
    "with the Procession too: still the Procession's order and the Queen's, the Visitor's asked of nobody");
  answer(t, "Anointed Procession first: 3 tokens");
  eq([named(t, "Dragon").length, named(t, "Soldier").length], [2, 1], "two Dragons, one Soldier");
  const u = table([at(0, "battlefield", QA, AP)]);
  eq(resolve(u, {effect: "createToken", count: 1, token: {predefined: "Treasure"}}).status, "done", "a Treasure with the Queen and the Procession, no Visitor: the Queen never applies, nobody is asked");
  eq([named(u, "Treasure").length, named(u, "Soldier").length], [2, 0], "two Treasures");
}
{
  /* Adders alone end the same in any order; with a doubler they do not, and the question comes again while it matters. */
  const s = table([at(0, "battlefield", "Banner", "Banner")]);
  eq(resolve(s, {effect: "createToken", count: 1, token: GOBLIN}).status, "done", "two adders and no doubler: nobody is asked");
  eq([named(s, "Goblin").length, named(s, "Soldier").length], [1, 2], "each adds its Soldier once (CR 614.5)");
  const t = table([at(0, "battlefield", "Banner", "Banner", AP)]);
  resolve(t, {effect: "createToken", count: 1, token: GOBLIN});
  eq(awaitingChoice(t).options.map((o) => o.label).sort(), ["Anointed Procession first: 4 tokens", "Rob's Banner first: 5 to 6 tokens (1)", "Rob's Banner first: 5 to 6 tokens (2)"],
    "two Banners and the Procession: three to choose from, each with where it can lead");
  answer(t, "Rob's Banner first: 5 to 6 tokens (1)");
  eq(awaitingChoice(t).options.map((o) => o.label).sort(), ["Anointed Procession first: 5 tokens", "Banner first: 6 tokens"], "asked again, of the two left");
  answer(t, "Banner first: 6 tokens");
  eq([t.awaiting, named(t, "Goblin").length, named(t, "Soldier").length], [null, 2, 4], "both Banners, then the doubling: two Goblins and four Soldiers");
}
{
  /* Whose: a token made under Maya's control is hers to have a Soldier added to, by her Queen -- not by Rob's. */
  const s = table([at(0, "battlefield", QA), at(1, "battlefield", QA)]);
  make(s, {token: GOBLIN, controller: 1});
  eq([named(s, "Goblin", 1).length, named(s, "Soldier", 1).length, named(s, "Soldier", 0).length], [1, 1, 0], "Rob's effect, Maya's Goblin: her Queen's Soldier, none of Rob's");
}
{
  /* A token copy of a creature is a creature token, asked about by the original it copies. */
  const s = table([at(0, "battlefield", QA, AP, "Thopter")]);
  const [thopter] = named(s, "Thopter");
  resolve(s, {effect: "copyPermanent", targets: [thopter]});
  answer(s, "Queen Allenal of Ruadach first: 4 tokens");
  eq([named(s, "Thopter").length, named(s, "Soldier").length], [3, 2], "a copy of the Thopter: two copies and two Soldiers");
  /* A copy of this creature as it last existed (Colorstorm Stallion's, its source gone): asked the same way. */
  const t = table([at(0, "battlefield", QA, AP)]);
  const copiable = {card: "Stallion", types: ["Creature"], subtypes: ["Horse"], colors: ["R"], keywords: [], abilities: [], power: 3, toughness: 3, manaCost: "{1}{U}{R}"};
  eq(beginResolution(t, [{effect: "copyPermanent", targets: [], lastKnown: true}], {controller: 0, source: null, lastKnown: {cardId: 9999, copiable}}).status, "waiting",
    "a copy of a source gone: the order asked");
  answer(t, "Anointed Procession first: 3 tokens");
  eq([named(t, "Stallion").length, named(t, "Soldier").length], [2, 1], "two Stallion copies and a Soldier");
}
{
  /* "The exiled card's owner creates an X/X blue Illusion" (linkedTokens): made under Maya's control, by her board -- Rob's
     Queen and Procession are no question of his. */
  const s = table([at(0, "battlefield", QA, AP), at(1, "exile", "Relic")]);
  const [queen] = named(s, QA), relic = s.zones.exile.find((id) => s.objects[id].card === "Relic");
  s.links = {[queen]: [relic]};
  const illusion = {name: "Illusion", types: ["Creature"], subtypes: ["Illusion"], colors: ["U"], power: "X", toughness: "X"};
  eq(beginResolution(s, [{effect: "createToken", linked: true, token: illusion}], {controller: 0, source: queen}).status, "done", "linked tokens: nobody is asked");
  eq([named(s, "Illusion", 1).map((id) => s.objects[id].power), named(s, "Illusion", 0).length, named(s, "Soldier", 0).length], [[2], 0, 0],
    "Maya's 2/2 Illusion, and nothing of Rob's");
}
{
  const problems = (fields) => compileScript({schema: "CrankCardScript@1",
    identity: {name: "Odd Banner", oracleId: "x", types: ["Enchantment"], subtypes: [], manaCost: "{W}", colors: ["W"], colorIdentity: ["W"]},
    oracleText: "x", source: "hand", abilities: [{kind: "static", text: "x", ...fields}]}).problems;
  eq(problems({rule: "tokens-plus", affects: {types: ["Creature"]}, token: SOLDIER}), [], "tokens-plus compiles");
  ok(problems({rule: "tokens-plus", affects: {subtypes: ["Goblin"]}, token: SOLDIER}).some((p) => p.includes("told by their card types")), "tokens-plus told by anything but card types is refused");
  ok(problems({rule: "tokens-plus", affects: {types: ["Creature"]}, token: {power: 1}}).some((p) => p.includes("What is added is a token")), "and one adding no token");
}
{
  const problems = (fields) => compileScript({schema: "CrankCardScript@1",
    identity: {name: "Odd Procession", oracleId: "x", types: ["Enchantment"], subtypes: [], manaCost: "{W}", colors: ["W"], colorIdentity: ["W"]},
    oracleText: "x", source: "hand", abilities: [{kind: "static", text: "x", ...fields}]}).problems;
  eq([problems({rule: "more-tokens", affects: {who: "you"}, times: 2}), problems({rule: "tokens-instead", affects: {types: ["Artifact"]}, token: SOLDIER})], [[], []], "both compile");
  ok(problems({rule: "more-tokens", affects: {who: "you"}}).some((p) => p.includes("More tokens instead says how many times")), "more-tokens without times is refused");
  ok(problems({rule: "tokens-instead", affects: {types: ["Artifact"], subtypes: ["Treasure"]}, token: SOLDIER}).some((p) => p.includes("told by their card types")), "tokens-instead by subtype is refused");
  ok(problems({rule: "tokens-instead", affects: {types: ["Artifact"]}, token: {power: 5}}).some((p) => p.includes("What is made instead is a token")), "and a token without a name or types");
}

console.log(`engine-tokens-replaced: ${checks} checks passed -- twice that many tokens, Dragons instead of artifact tokens, and a Soldier beside creature tokens: whose control, the effect's words on what is made instead, the order asked where it matters, copies, investigate, four seats, the schema.`);
