/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* WAVE 4A, LANE H1: "YOU MAY PLAY / CAST THAT CARD" FROM ANOTHER ZONE, IN THE FORMS THE MOST-PLAYED CARDS ASK (Forge's MayPlay).
 *
 * Eighteen cards' scenarios show each card's own abilities; this is what they cannot reach. A permission kept by permanent type
 * (Muldrotha, the Gravetide: one land and one spell of each type, a card of two types cast as the one its player names -- and
 * a forged answer refused); a permission's additional cost (Exploration Broodship), which is no cost of the spell's own; "mana
 * of any type can be spent" (Tinybones, Bauble Burglar; CR 118.14, 609.4b) for colored and hybrid symbols, not Phyrexian ones, and
 * with more than one way to pay; a permission an effect gives for a zone's cards (Chainer, Nightmare Adept's `count`),
 * spent only when nothing unlimited would do; each that does something different its own offer; an alternative cost of life a
 * permanent gives (Demon of Fate's Design), never more than its player has; an effect on a spell that follows it onto the
 * battlefield (CR 400.7a) when it changed a characteristic, and one that changed a rule that does not; "if you didn't cast it
 * from your hand"; a Case's solved designation, seen by everyone (CR 719.3b); the nontoken permanents sacrificed this turn;
 * counters a card is exiled with; where the schema and the definitions let each be said; and the scenario runner's blockers.
 */
import assert from "node:assert/strict";
import {createState, addObject, usesThisTurn} from "../game/engine/state/index.mjs";
import {beginGame, advance, awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {legalActions, applyAction} from "../game/engine/rules/actions.mjs";
import {resolveTop} from "../game/engine/rules/stack.mjs";
import {runEffect} from "../game/engine/script/effects/index.mjs";
import {sacrificeOne} from "../game/engine/script/effects/zones.mjs";
import {conditionHolds} from "../game/engine/script/condition.mjs";
import {validateScript, SCRIPT_SCHEMA} from "../game/engine/script/schema.mjs";
import {createCardIndex} from "../game/engine/cards/index.mjs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {projectFor} from "../game/engine/projection.mjs";
import {abilitiesOf} from "../game/engine/rules/layers.mjs";
import {missingFor} from "../game/tools/engine-constructs.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";

let checks = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };
const ok = (c, m) => { assert.ok(c, m); checks += 1; };

const cards = loadCardIndex();
const card = (name) => ({...cards.definition(name), card: name});
const WASTES = {card: "Wastes", types: ["Land"], supertypes: ["Basic"], abilities: [{id: "a0", kind: "mana", tapSelf: true, produces: {C: 1}}]};
const creature = (name, cost, extra = {}) => ({card: name, types: ["Creature"], manaCost: cost, colors: [], power: 2, toughness: 2, ...extra});
function table() {
  const s = createState({matchId: "m", seed: "play-from-zones", players: [{name: "Rob"}, {name: "Maya"}]});
  for (let seat = 0; seat < 2; seat += 1) for (let i = 0; i < 12; i += 1) addObject(s, {...WASTES, owner: seat, controller: seat}, "library", seat);
  beginGame(s);
  for (let n = 0; n < 50 && !(s.phase === "MAIN1" && s.priorityPlayer === 0); n += 1) advance(s);
  return s;
}
const put = (s, o, seat, zone) => addObject(s, {...o, owner: seat, controller: seat}, zone, ["battlefield", "exile"].includes(zone) ? null : seat);
const pool = (s, seat, mana) => Object.assign(s.players[seat].manaPool, mana);
const casts = (s, name, seat = 0) => legalActions(s, seat).filter((a) => a.kind === "cast" && a.label === name);
const lands = (s, seat = 0) => legalActions(s, seat).filter((a) => a.kind === "play-land");

/* ---- MANA OF ANY TYPE (Tinybones; CR 118.14, 609.4b): each colored and hybrid symbol paid by one mana of any type; a Phyrexian
   one still its color or 2 life; and more than one way to pay, its player's to say. */
{
  const s = table();
  put(s, card("Tinybones, Bauble Burglar"), 0, "battlefield");
  const stashed = (o) => { const id = put(s, o, 1, "exile"); s.objects[id].counters.stash = 1; return id; };
  stashed(creature("Hybrid Hound", "{R/G}{R/G}"));
  stashed(creature("Compleat Crawler", "{B/P}"));
  stashed(creature("Twin Reaver", "{2/R}{2/R}"));
  pool(s, 0, {C: 2});
  eq(casts(s, "Hybrid Hound").length, 1, "two hybrid symbols, paid with two colorless mana");
  eq(casts(s, "Twin Reaver").map((a) => a.payment?.mana?.C ?? null), [2], "two {2/R}: one mana of any type each, not two");
  const crawler = casts(s, "Compleat Crawler");
  eq(crawler.map((a) => a.payment?.life ?? null), [2], "a Phyrexian symbol still asks its color or 2 life: 2 life, the colorless mana left");
  /* Not Maya's cards by any other permission: a Bear in his own hand asks its green. */
  put(s, creature("Bear", "{1}{G}"), 0, "hand");
  eq(casts(s, "Bear").length, 0, "his own Bear from his hand: its {G} is not paid with colorless mana");
}
{
  const s = table();
  put(s, card("Tinybones, Bauble Burglar"), 0, "battlefield");
  const ogre = put(s, creature("Ogre", "{2}{R}"), 1, "exile");
  s.objects[ogre].counters.stash = 1;
  /* No red at all: only mana of any type pays its {R}, and the ways asked are the ways to pay that. */
  pool(s, 0, {G: 2, C: 2});
  const [offer] = casts(s, "Ogre");
  eq(offer?.payWays, true, "{G}{G}{C}{C} for a cost of any three mana: more than one way, so it is asked");
  applyAction(s, 0, offer);
  const choice = awaitingChoice(s);
  ok(choice.options.length >= 2, `which mana pays it, each way an answer (${choice.options.map((o) => o.label).join(" | ")})`);
  resolveAwaiting(s, [0]);
  eq([s.stack.length, Object.values(s.players[0].manaPool).reduce((a, b) => a + b, 0)], [1, 1], "cast, three of the four spent");
}

/* ---- KEPT BY TYPE (Muldrotha): a forged answer refused; a land is one land, whatever its land drops. */
{
  const s = table();
  put(s, card("Muldrotha, the Gravetide"), 0, "battlefield");
  put(s, {card: "Golem", types: ["Artifact", "Creature"], manaCost: "{1}", colors: [], power: 2, toughness: 2}, 0, "graveyard");
  pool(s, 0, {C: 1});
  const offers = casts(s, "Golem");
  eq(offers.map((a) => a.asType).sort(), ["Artifact", "Creature"], "an artifact creature: one offer for each of its permanent types");
  assert.throws(() => applyAction(s, 0, {...offers[0], asType: "Planeswalker"}), /not a legal action/, "a type it is not: refused");
  assert.throws(() => applyAction(s, 0, {...offers[0], asType: undefined}), /not a legal action/, "no type named: refused");
  checks += 2;
}
{
  const s = table();
  const mul = put(s, card("Muldrotha, the Gravetide"), 0, "battlefield");
  put(s, WASTES, 0, "graveyard"); put(s, WASTES, 0, "graveyard"); put(s, WASTES, 0, "hand");
  s.players[0].landAllowance = 3;
  eq(lands(s).filter((a) => a.from === "graveyard").length, 2, "three land drops: either land in his graveyard is offered");
  applyAction(s, 0, lands(s).find((a) => a.from === "graveyard"));
  eq([lands(s).filter((a) => a.from === "graveyard").length, lands(s).filter((a) => a.from === undefined).length, usesThisTurn(s, mul, "play-from:a0:Land")],
    [0, 1, 1], "one played: no second land from his graveyard, his hand's still is -- the land's use spent");
}

/* ---- WHICH PERMISSION: each that asks or allows something different its own offer; an unlimited one used before one spent by
   use (a type's, so many cards'). */
{
  const s = table();
  put(s, card("Muldrotha, the Gravetide"), 0, "battlefield");
  put(s, card("Exploration Broodship"), 0, "battlefield");
  put(s, WASTES, 0, "battlefield"); put(s, WASTES, 0, "battlefield");
  put(s, creature("Cub", "{1}"), 0, "graveyard");
  pool(s, 0, {C: 1});
  const offers = casts(s, "Cub");
  eq(offers.map((a) => `${a.viaName}${a.costNames ? `: ${a.costNames.join(", ")}` : ""}`).sort(),
    ["Exploration Broodship: Wastes", "Exploration Broodship: Wastes", "Muldrotha, the Gravetide"], "Muldrotha's for nothing more, the Broodship's with a land: different offers");
  applyAction(s, 0, offers.find((a) => a.viaName === "Exploration Broodship"));
  eq([s.stack.at(-1).cast.additionalPaid, s.zones.graveyard[0].map((id) => s.objects[id].card)], [undefined, ["Wastes"]],
    "the land the Broodship asks is sacrificed, and is no additional cost of the Cub's own to ask after");
}
{
  const s = table();
  const stashedOgre = put(s, creature("Ogre", "{2}{R}"), 1, "exile");
  s.objects[stashedOgre].counters.stash = 1;
  put(s, card("Tinybones, Bauble Burglar"), 0, "battlefield");
  runEffect(s, {effect: "mayPlay", targets: [stashedOgre]}, {controller: 0, source: null});
  pool(s, 0, {R: 1, C: 2});
  eq(casts(s, "Ogre").map((a) => a.viaName ?? null).sort(), ["Effect", "Tinybones, Bauble Burglar"], "any mana, or as it is: each its own offer");
}
{
  const s = table();
  const mul = put(s, card("Muldrotha, the Gravetide"), 0, "battlefield");
  put(s, {card: "Grave Gate", types: ["Artifact"], abilities: [{id: "g", kind: "static", text: "You may cast creature spells from your graveyard.", rule: "play-from",
    affects: {what: "player", who: "you"}, zone: "graveyard", spells: {types: ["Creature"]}}]}, 0, "battlefield");
  put(s, creature("Cub", "{1}"), 0, "graveyard");
  pool(s, 0, {C: 1});
  const offers = casts(s, "Cub");
  eq(offers.map((a) => a.asType ?? null), [null], "alike, one offer -- through the Gate, which nothing spends");
  applyAction(s, 0, offers[0]);
  eq(usesThisTurn(s, mul, "play-from:a0:Creature"), 0, "Muldrotha's creature unspent");
}
{
  const s = table();
  runEffect(s, {effect: "mayPlay", from: "graveyard", spellsOnly: true, spells: {types: ["Creature"]}, count: 1}, {controller: 0, source: null});
  runEffect(s, {effect: "mayPlay", from: "graveyard", spellsOnly: true, spells: {types: ["Creature"]}}, {controller: 0, source: null});
  put(s, creature("Cub", "{1}"), 0, "graveyard"); put(s, creature("Cub", "{1}"), 0, "graveyard");
  pool(s, 0, {C: 2});
  applyAction(s, 0, casts(s, "Cub")[0]);
  eq(s.effects.filter((e) => e.rule === "may-play").map((e) => e.count ?? null), [1, null], "a permission for one creature spell kept, the unlimited one used");
  resolveTop(s);
  applyAction(s, 0, casts(s, "Cub")[0]);
  eq(s.effects.filter((e) => e.rule === "may-play").length, 2, "and again: still both");
}

{
  /* Each such permission its own: one gone, the next made is not taken for another still there. */
  const s = table();
  const give = () => runEffect(s, {effect: "mayPlay", from: "graveyard", spellsOnly: true, count: 1}, {controller: 0, source: null});
  give(); give();
  s.effects.splice(0, 1);
  give();
  const ids = s.effects.filter((e) => e.rule === "may-play").map((e) => e.id);
  eq(new Set(ids).size, 2, `two permissions, two names (${ids.join(", ")})`);
  /* Named for what gave it, as an offer through it says (`viaName`): its source, or its source as it last was. */
  const chainer = put(s, card("Chainer, Nightmare Adept"), 0, "battlefield");
  runEffect(s, {effect: "mayPlay", from: "graveyard", spellsOnly: true, count: 1}, {controller: 0, source: chainer});
  runEffect(s, {effect: "mayPlay", from: "graveyard", spellsOnly: true, count: 1}, {controller: 0, source: null, lastKnown: {name: "Gone Adept"}});
  eq(s.effects.filter((e) => e.rule === "may-play").slice(-2).map((e) => e.name), ["Chainer, Nightmare Adept", "Gone Adept"], "named for its source");
}
{
  /* "Until the end of your next turn" from a zone: kept through this turn and the next player's, over as his next ends. */
  const s = table();
  runEffect(s, {effect: "mayPlay", from: "library-top", until: "your-next-end"}, {controller: 0, source: null});
  const kept = () => (s.effects ?? []).some((e) => e.rule === "may-play" && e.from === "library-top");
  const through = (turn) => { for (let n = 0; n < 400 && s.turn < turn; n += 1) { if (s.awaiting) resolveAwaiting(s, awaitingChoice(s).options.slice(0, awaitingChoice(s).min ?? 0).map((o) => o.index)); else advance(s); } };
  through(2);
  eq(kept(), true, "his turn over: still his");
  through(3);
  eq(kept(), true, "Maya's over: still his");
  through(4);
  eq(kept(), false, "his next over: gone");
}

/* ---- LIFE FOR MANA (Demon of Fate's Design): never more than its player has. */
{
  const at = (life) => {
    const s = table();
    put(s, card("Demon of Fate's Design"), 0, "battlefield");
    put(s, {card: "Shrine", types: ["Enchantment"], manaCost: "{2}{W}", colors: ["W"]}, 0, "hand");
    s.players[0].life = life;
    return casts(s, "Shrine").map((a) => a.lifeInstead ?? null);
  };
  eq(at(2), [], "at 2 life, a mana value 3 enchantment is not offered for life");
  eq(at(3), [3], "at 3, it is: 3 life");
}

/* ---- CR 400.7a: an effect that changed the spell's characteristics follows it onto the battlefield; one that changed a rule
   about it does not. */
{
  const s = table();
  const bear = put(s, creature("Bear", "{1}"), 0, "hand");
  pool(s, 0, {C: 1});
  applyAction(s, 0, casts(s, "Bear")[0]);
  const spell = s.stack.at(-1).objectId;
  ok(spell !== bear, "on the stack, a new object");
  runEffect(s, {effect: "pump", targets: [spell], keywords: ["Flying"], until: "ever"}, {controller: 0, source: null});
  runEffect(s, {effect: "effectUntil", rule: "exile-if-dies", targets: [spell]}, {controller: 0, source: null});
  resolveTop(s);
  const permanent = s.zones.battlefield.find((id) => s.objects[id].card === "Bear");
  eq([s.effects.find((e) => e.layer === 7)?.affects.ids, s.effects.find((e) => e.rule === "exile-if-dies")?.affects.ids], [[permanent], [spell]],
    "the gained flying is the permanent's; the rule about the spell stays the spell's");
  ok(projectFor(s, 0).players[0].zones.Battlefield.cards.find((c) => c.name === "Bear").keywords.includes("Flying"), "it flies");
}

/* ---- "If you didn't cast it from your hand": cast by its controller, from their hand -- not by another player. */
{
  const s = table();
  const id = put(s, creature("Bear", "{1}"), 0, "battlefield");
  const asked = (castFrom) => { s.objects[id].castFrom = castFrom; return conditionHolds(s, {castFromYourHand: true}, {controller: 0, source: null, about: {card: id}}); };
  eq([asked({zone: "hand", by: 0}), asked({zone: "hand", by: 1}), asked({zone: "graveyard", by: 0}), asked(undefined)], [true, false, false, false],
    "his own cast from his hand only");
}

/* ---- A Case's solved designation, seen by every seat (CR 719.3b). */
{
  const s = table();
  const id = put(s, card("Case of the Locked Hothouse"), 0, "battlefield");
  const shown = (seat) => projectFor(s, seat).players[0].zones.Battlefield.cards.find((c) => c.name === "Case of the Locked Hothouse").solved ?? false;
  eq([shown(0), shown(1)], [false, false], "not solved: nothing shown");
  const first = runEffect(s, {effect: "alterAttribute", targets: [id], attribute: "solved"}, {controller: 0, source: id});
  eq([shown(0), shown(1), s.objects[id].solved], [true, true, true], "solved: both seats see it");
  const again = runEffect(s, {effect: "alterAttribute", targets: [id], attribute: "solved"}, {controller: 0, source: id});
  eq([first.filter((e) => e.kind === "GameEventCardAttribute").length, again.length], [1, 0], "solved once: told once, and not again (CR 719.3b)");
}

/* ---- The nontoken permanents sacrificed this turn: a token is none, and a new turn starts with none. */
{
  const s = table();
  const token = put(s, {...creature("Thopter", "{0}"), token: true}, 0, "battlefield");
  const bear = put(s, creature("Bear", "{1}"), 0, "battlefield");
  const held = () => conditionHolds(s, {sacrificedNontokenThisTurn: true}, {controller: 0, source: null});
  sacrificeOne(s, token, []);
  eq(held(), false, "a token sacrificed: no");
  sacrificeOne(s, bear, []);
  eq([held(), conditionHolds(s, {sacrificedNontokenThisTurn: true}, {controller: 1, source: null})], [true, false], "the Bear: yes -- Rob's, not Maya's");
  for (let n = 0; n < 60 && s.turn < 2; n += 1) { if (s.awaiting) resolveAwaiting(s, awaitingChoice(s).options.slice(0, awaitingChoice(s).min ?? 0).map((o) => o.index)); else advance(s); }
  eq(held(), false, "a new turn: none yet");
}

/* ---- Counters a card is exiled with (Tinybones's stash): there, as it arrives; not on a card put into a graveyard. */
{
  const s = table();
  const id = put(s, creature("Ogre", "{2}{R}"), 1, "graveyard");
  runEffect(s, {effect: "moveZone", targets: [id], to: "exile", withCounters: {stash: 1}}, {controller: 0, source: null});
  eq(s.zones.exile.map((x) => s.objects[x].counters.stash ?? 0), [1], "exiled with a stash counter");
  const index = createCardIndex([{script: {schema: SCRIPT_SCHEMA, identity: {name: "Grave Robber", oracleId: "g", types: ["Sorcery"], subtypes: [], manaCost: "{B}", colors: ["B"], colorIdentity: ["B"], power: null, toughness: null},
    oracleText: "Put target creature card from a graveyard into its owner's graveyard with a stash counter on it.",
    abilities: [{kind: "spell", text: "Put target creature card from a graveyard into its owner's graveyard with a stash counter on it.", targets: [{what: "card", zone: "graveyard", types: ["Creature"]}],
      effects: [{effect: "moveZone", targets: {target: 0}, to: "graveyard", withCounters: {stash: 1}}]}]}, source: "hand"}]);
  ok(index.resolve("Grave Robber").problems.some((p) => /withCounters/.test(p)), "into a graveyard with counters: not a definition");
}

/* ---- What the schema lets each be said. */
{
  const script = (abilities) => ({schema: SCRIPT_SCHEMA, identity: {name: "Test", oracleId: "t", types: ["Enchantment"], subtypes: [], manaCost: "{1}", colors: [], colorIdentity: [], power: null, toughness: null},
    oracleText: "", abilities: abilities.map((a) => ({text: "x", ...a}))});
  const bad = (abilities, pattern, m) => {
    const result = validateScript(script(abilities));
    ok(!result.valid && result.errors.some((e) => pattern.test(e.message)), `${m} -- ${JSON.stringify(result.errors)}`);
  };
  const good = (abilities, m) => { const result = validateScript(script(abilities)); ok(result.valid, `${m} -- ${JSON.stringify(result.errors)}`); };
  const act = (effects) => [{kind: "activated", cost: [{atom: "{T}"}], effects}];
  const play = (more) => [{kind: "static", rule: "play-from", affects: {what: "player", who: "you"}, zone: "graveyard", ...more}];
  good(act([{effect: "mayPlay", from: "graveyard", spellsOnly: true, spells: {types: ["Creature"]}, count: 1}]), "a creature spell from the graveyard this turn");
  good(act([{effect: "mayPlay", from: "library-top", payLife: "manaValue"}]), "cards from the top for life");
  bad(act([{effect: "mayPlay", from: "hand"}]), /graveyard" or "library-top/, "mayPlay from a hand: no");
  bad(act([{effect: "mayPlay", from: "graveyard", targets: "remembered"}]), /names no cards/, "a zone and named cards: no");
  bad(act([{effect: "mayPlay", from: "graveyard", zone: "exile"}]), /names no cards/, "a zone and a card's zone: no");
  bad(act([{effect: "mayPlay", from: "graveyard", onlyIf: {yourTurn: true}}]), /names no cards/, "a zone and a condition on named cards: no");
  bad(act([{effect: "mayPlay", from: "graveyard", spells: {hue: "R"}}]), /hue/, "an unknown selector key: no");
  bad(act([{effect: "mayPlay", from: "graveyard", payLife: 3}]), /payLife is "manaValue"/, "life other than its mana value: no");
  bad(act([{effect: "mayPlay", from: "graveyard", count: 0}]), /count is how many/, "a count of none: no");
  bad(act([{effect: "mayPlay", targets: "remembered", count: 1}]), /from a zone/, "a count on named cards: no");
  bad(act([{effect: "mayPlay", targets: "remembered", spells: {types: ["Creature"]}}]), /from a zone/, "a selector on named cards: no");
  bad(act([{effect: "mayPlay", targets: "remembered", payLife: "manaValue"}]), /from a zone/, "life for named cards: no");
  good(play({lands: true, spells: true, perType: true, yourTurn: true}), "Muldrotha's");
  bad(play({spells: true, perType: "yes"}), /perType is true/, "perType: true or nothing");
  bad(play({spells: true, perType: true, limit: 1}), /no other limit/, "kept by type and limited besides: no");
  bad(play({spells: true, anyMana: 1}), /anyMana is true/, "anyMana: true or nothing");
  good(play({spells: true, limit: 1, additionalCost: [{atom: "sacrifice", selector: {types: ["Land"]}}]}), "the Broodship's");
  /* Retrace's land card (CR 702.81a; Six, card load w4d L2): a discard of a card the selector describes. */
  good(play({spells: true, yourTurn: true, additionalCost: [{atom: "discard", selector: {types: ["Land"]}}]}), "Six's retrace");
  bad(play({spells: true, additionalCost: [{atom: "payLife", amount: 2}]}), /sacrifices or discards of one each/, "an additional cost other than a sacrifice or a discard: not built");
  bad(play({spells: true, additionalCost: []}), /sacrifices or discards of one each/, "an additional cost of nothing: no");
  bad(play({spells: true, additionalCost: [{atom: "sacrifice", selector: {types: ["Land"]}, count: 2}]}), /sacrifices or discards of one each/, "a sacrifice of two: not built");
  bad(play({spells: true, additionalCost: [{atom: "sacrifice", selector: {hue: "R"}}]}), /hue/, "its sacrifice's selector, held to the grammar");
  bad(play({lands: true, spells: true, additionalCost: [{atom: "sacrifice", selector: {types: ["Land"]}}]}), /a spell's/, "an additional cost for a land played: no");
  good([{kind: "static", rule: "cast-without-paying", affects: {types: ["Enchantment"]}, limit: 1, payLife: "manaValue"}], "the Demon's");
  bad([{kind: "static", rule: "cast-without-paying", affects: {}, payLife: "all"}], /payLife is "manaValue"/, "the Demon's life is its mana value");
  good(act([{effect: "effectUntil", rule: "cant-cast", who: "you", allSpells: true}]), "Conduit's");
  bad(act([{effect: "effectUntil", rule: "cant-cast", who: "you", allSpells: true, named: "Bear"}]), /named.*or forbids every one/, "every spell and a name: no");
  bad(act([{effect: "effectUntil", rule: "cant-cast", who: "you", named: "Bear", allSpells: false}]), /named.*or forbids every one/, "allSpells: true or nothing");
  bad(act([{effect: "effectUntil", rule: "cant-cast", who: "you"}]), /named.*or forbids every one/, "neither: no");
  good(act([{effect: "alterAttribute", targets: "self", attribute: "solved"}]), "solved");
  bad(act([{effect: "alterAttribute", targets: "self", attribute: "solved", value: false}]), /stays solved/, "unsolved: no");
  bad([{kind: "triggered", trigger: {on: "end step"}, condition: {solved: "no"}, effects: []}], /solved is true or false/, "solved: true or false");
  bad([{kind: "triggered", trigger: {on: "enters"}, condition: {castFromYourHand: 1}, effects: []}], /castFromYourHand is true or false/, "castFromYourHand: true or false");
  bad(play({spells: true, condition: {sacrificedNontokenThisTurn: false}}), /sacrificedNontokenThisTurn is true/, "sacrificedNontokenThisTurn: true");
}

/* ---- The scenario runner's blockers, a check that can fail. */
{
  const scenario = (blockers) => ({name: "blockers", setup: [{seat: 0, zone: "battlefield", cards: ["Gravecrawler", "Bear"]}, {seat: 1, zone: "battlefield", cards: ["Ogre"]}],
    steps: [{to: {turn: 2, phase: "MAIN1"}}, {attack: ["Ogre"]}, {block: [], blockers}]});
  const fix = {Bear: {types: ["Creature"], manaCost: "{1}", colors: [], power: 2, toughness: 2}, Ogre: {types: ["Creature"], manaCost: "{2}", colors: [], power: 3, toughness: 3}};
  runScenario(scenario(["Bear"]), cards.definition, fix);
  assert.throws(() => runScenario(scenario(["Bear", "Gravecrawler"]), cards.definition, fix), /may block are \["Bear"\]/, "Gravecrawler among them: the scenario fails");
  checks += 2;
}

{
  eq(missingFor({options: ["MayPlay"]}), [{kind: "option", name: "MayPlay", why: "not built"}],
    "MayPlay stays unbuilt in the catalog: a replacement's exile kept against its source, from anywhere (Valgavoth), a permission's additional cost other than a sacrifice (Quilled Greatwurm) and a card castable from one zone only (Haakon) are not built");
}

console.log(`engine-play-from-zones: ${checks} checks passed -- a permission kept by type, a forged one refused; a permission's own additional cost; mana of any type, but not for Phyrexian symbols; an effect's permission for a zone's cards, spent last; life for mana within a player's life; an effect on a spell onto the battlefield (CR 400.7a); "if you didn't cast it from your hand"; solved; nontoken sacrifices this turn; exiled with counters; the schema; the runner's blockers.`);
