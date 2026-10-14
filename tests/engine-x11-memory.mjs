/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* TRAIN B (X11), THE MEMORY AXIS: the engine pieces the last ten of its cards needed, each at its edges, with four
 * players where the card text reaches across a table, and every new question answered by both pilots.
 *
 *   - "You may discard UP TO two cards. If you do, draw that many" (Fable of the Mirror-Breaker; CR 701.9a): discard's
 *     `upTo`, none to that many, the discarder's to say -- and a plain discard still exactly that many.
 *   - "Remove all charge counters from this artifact. Add one mana of any color for each charge counter removed this way"
 *     (Coalition Relic; CR 106.3, 608.2c): removeCounter's `all` of one kind, the amount `countersRemovedThisWay`, and the
 *     color of each mana asked of its controller as the ability resolves (effects/asking.mjs, manaColors).
 *   - "Whenever one or more cards are put into exile from your library and/or your graveyard" (Laelia, the Blade Reforged;
 *     CR 400.3, 603.2c): the trigger `exiled` with `from` a list of zones, about whose cards they were.
 *   - "Spells you cast from anywhere other than your hand cost {2} less to cast" (Advanced Reconstruction; CR 601.2f).
 *   - "For each card exiled this way, copy it, and you may cast the copy" (Mizzix's Mastery; CR 707.12, 707.10a): play's
 *     `copies`; and Overload (CR 702.96) credited (game/tools/engine-constructs.mjs).
 *   - "Put each creature card exiled with this artifact onto the battlefield" (Ghost Vacuum; CR 607.2a, 406.3a): a linked
 *     move's `linkedOnly`.
 *   - And the cards that use landed pieces at their edges: Getaway Barrel (chooseCard `random` among what was revealed),
 *     Settle the Wreckage, Currency Converter.
 *   - And two bugs found on the way: animate's subtypes added as card types (now subtypes, CR 205.1b), and an adventurer
 *     card's offer leaving its absent characteristics behind (asking what may be done changes nothing).
 */
import assert from "node:assert/strict";
import {createState, addObject} from "../game/engine/state/index.mjs";
import {beginResolution, answerResolution} from "../game/engine/script/resolution.mjs";
import {runEffect} from "../game/engine/script/effects/index.mjs";
import {awaitingChoice} from "../game/engine/rules/turn.mjs";
import {legalActions} from "../game/engine/rules/actions.mjs";
import {collectTriggers, openTriggers} from "../game/engine/rules/trigger.mjs";
import {moveOne} from "../game/engine/script/effects/zones.mjs";
import {checkStateBasedActions} from "../game/engine/rules/sba.mjs";
import {costReduction} from "../game/engine/rules/statics.mjs";
import {characteristicsOf} from "../game/engine/rules/layers.mjs";
import {amountOf, amountProblems} from "../game/engine/script/amount.mjs";
import {validateScript} from "../game/engine/script/schema.mjs";
import {compileScript} from "../game/engine/cards/index.mjs";
import {projectFor} from "../game/engine/projection.mjs";
import {hashState} from "../game/engine/journal.mjs";
import {housePilot} from "../game/engine/pilots/house-pilot.mjs";
import {randomLegalPilot} from "../game/engine/pilots/random-legal.mjs";
import {createRng} from "../game/engine/rng.mjs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex, loadCardScripts} from "../game/tools/engine-cards.mjs";
import {keywordBuilt, missingFor} from "../game/tools/engine-constructs.mjs";

let checks = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const throws = (fn, re, m) => { assert.throws(fn, re, m); checks += 1; };

const index = loadCardIndex();
const scripts = new Map(loadCardScripts().map(({script}) => [script.identity.name, script]));
const table = (seats = 4) => createState({matchId: "x11-memory", seed: "memory", players: ["Rob", "Maya", "Trey", "Sam"].slice(0, seats).map((name) => ({name}))});
const put = (s, card, zone = "battlefield", owner = 0) => addObject(s, {...card, owner, controller: owner}, zone, ["battlefield", "exile"].includes(zone) ? null : owner);
const card = (name, over = {}) => ({card: name, types: ["Creature"], subtypes: ["Bear"], manaCost: "{1}{G}", colors: ["G"], power: 2, toughness: 2, ...over});
const SORCERY = (name, effects = [{effect: "draw", count: 1}], manaCost = "{U}") => ({card: name, types: ["Sorcery"], manaCost, colors: ["U"],
  spell: {id: "s", text: name, targets: [], effects}});
const names = (s, ids) => ids.map((id) => s.objects[id]?.card ?? null);
const run = (scenario, fixtures = {}) => runScenario(scenario, index.definition, fixtures);
const at = (seat, zone, ...cards) => ({seat, zone, cards});
/* Both pilots, each answering exactly what it is offered (game/engine/pilots), the way tests/engine-room-games.mjs plays. */
const pilotsAnswer = (s, seat) => {
  const choice = awaitingChoice(s);
  return [housePilot({seat}).answer(projectFor(s, seat), choice), randomLegalPilot(createRng(`x11-${checks}`)).answer(choice)];
};
const legal = (choice, answer) => {
  const picked = answer.indices ?? [];
  return picked.length >= (choice.min ?? 0) && picked.length <= (choice.max ?? picked.length) && new Set(picked).size === picked.length
    && picked.every((i) => Number.isInteger(i) && i >= 0 && i < choice.options.length);
};

/* ---- discard UP TO (Fable of the Mirror-Breaker, chapter II) ---- */
{
  const fresh = () => {
    const s = table();
    for (const name of ["Ash", "Birch", "Cedar"]) put(s, card(name), "hand");
    for (let i = 0; i < 5; i += 1) put(s, card(`Draw ${i}`), "library");
    beginResolution(s, [{effect: "discard", count: 2, upTo: true, remember: true}, {effect: "draw", count: {rememberedCount: true}}], {controller: 0, source: null});
    return s;
  };
  const s = fresh(), choice = awaitingChoice(s);
  eq([choice.title, choice.mode, choice.min, choice.max], ["Discard up to 2 cards", "many", 0, 2], "up to two: none to two, the discarder's to say");
  for (const answer of pilotsAnswer(s, 0)) ok(legal(choice, answer), `each pilot answers "up to" within it (${JSON.stringify(answer.indices)})`);
  answerResolution(s, []);
  eq([s.zones.hand[0].length, s.zones.graveyard[0].length, s.zones.library[0].length], [3, 0, 5], "none discarded: none drawn");
  const two = fresh();
  answerResolution(two, [0, 2]);
  eq([names(two, two.zones.graveyard[0]).sort(), two.zones.hand[0].length, two.zones.library[0].length], [["Ash", "Cedar"], 3, 3], "two discarded: two drawn, that many");
  throws(() => answerResolution(fresh(), [0, 1, 2]), /Invalid selection/, "never more than it says");
  throws(() => answerResolution(fresh(), [1, 1]), /Invalid selection/, "each card once");
  const plain = table();
  for (const name of ["Ash", "Birch", "Cedar"]) put(plain, card(name), "hand");
  beginResolution(plain, [{effect: "discard", count: 2}], {controller: 0, source: null});
  eq([awaitingChoice(plain).min, awaitingChoice(plain).title], [2, "Discard 2 cards"], "without \"up to\", exactly that many");
  throws(() => answerResolution(plain, [0]), /Invalid selection/, "and fewer is refused");
  const one = table();
  put(one, card("Ash"), "hand");
  beginResolution(one, [{effect: "discard", count: 1, upTo: true}], {controller: 0, source: null});
  eq([awaitingChoice(one).mode, awaitingChoice(one).min, awaitingChoice(one).max], ["many", 0, 1], "up to one: a pick of none or one, not a forced one");
}

/* ---- remove all charge counters, and a mana of any color for each (Coalition Relic) ---- */
{
  const s = table(), relic = put(s, {card: "Relic", types: ["Artifact"], manaCost: "{3}", colors: []});
  s.objects[relic].counters = {charge: 3, "+1/+1": 1};
  const ctx = {controller: 0, source: relic};
  runEffect(s, {effect: "removeCounter", targets: [relic], counter: "charge", all: true}, ctx);
  eq([s.objects[relic].counters.charge, s.objects[relic].counters["+1/+1"], ctx.countersRemoved, amountOf(s, {countersRemovedThisWay: true}, ctx)], [0, 1, 3, 3],
    "all of that kind removed, the other kind kept, and how many counted for \"removed this way\"");
  runEffect(s, {effect: "removeCounter", targets: [relic], counter: "charge", all: true}, ctx);
  eq(ctx.countersRemoved, 0, "none left: none removed this way");
  ok(amountProblems({countersRemovedThisWay: 1}).length > 0 && amountProblems({countersRemovedThisWay: true}).length === 0, "the amount's grammar: true, nothing else");

  /* Three removed: three questions, one mana each, the colors the controller's. */
  s.objects[relic].counters.charge = 3;
  beginResolution(s, [{effect: "removeCounter", targets: [relic], counter: "charge", all: true}, {effect: "addMana", anyColor: true, count: {countersRemovedThisWay: true}}], {controller: 0, source: relic});
  const first = awaitingChoice(s);
  eq([first.title, first.options.map((o) => o.label), first.min, first.max], ["Relic: add one mana of any color (1 of 3)", ["White", "Blue", "Black", "Red", "Green"], 1, 1],
    "the color of each mana is asked, one at a time");
  for (const answer of pilotsAnswer(s, 0)) ok(legal(first, answer), "each pilot names a color");
  throws(() => answerResolution(structuredClone(s), []), /Choose one color/, "a color must be named");
  answerResolution(s, [3]);
  eq(awaitingChoice(s).title, "Relic: add one mana of any color (2 of 3)", "and asked again for the next");
  answerResolution(s, [4]);
  answerResolution(s, [4]);
  eq([s.awaiting, s.players[0].manaPool.R, s.players[0].manaPool.G], [null, 1, 2], "each its own: one red and two green, added together");
  const none = table(), empty = put(none, {card: "Relic", types: ["Artifact"], manaCost: "{3}", colors: []});
  beginResolution(none, [{effect: "removeCounter", targets: [empty], counter: "charge", all: true}, {effect: "addMana", anyColor: true, count: {countersRemovedThisWay: true}}], {controller: 0, source: empty});
  eq([none.awaiting, Object.values(none.players[0].manaPool).reduce((a, b) => a + b, 0)], [null, 0], "no counters: no mana, and nobody asked");
  const fixed = table();
  beginResolution(fixed, [{effect: "addMana", mana: {G: 2}}], {controller: 2, source: null});
  eq([fixed.awaiting, fixed.players[2].manaPool.G], [null, 2], "a fixed mana is added as it always was, nobody asked -- for whichever player");
}

/* ---- "put into exile from your library and/or your graveyard" (Laelia) ---- */
{
  const laelia = index.definition("Laelia, the Blade Reforged");
  const watch = laelia.abilities.find((a) => a.trigger?.fromZones);
  eq(watch.trigger, {on: "GameEventCardChangeZone", to: "Exile", fromZones: ["Library", "Graveyard"], owner: "you", batch: true}, "the trigger compiled: those zones, its controller's cards, one or more at once");
  const script = structuredClone(scripts.get("Laelia, the Blade Reforged"));
  const at2 = script.abilities.findIndex((a) => a.trigger?.on === "exiled");
  for (const [label, from, more] of [["from a hand", ["library", "hand"], {}], ["with a filter", ["graveyard"], {filter: {types: ["Creature"]}}], ["from no zone", [], {}]]) {
    const changed = structuredClone(script);
    changed.abilities[at2].trigger = {on: "exiled", from, batch: true, ...more};
    ok(compileScript(changed).problems.some((p) => /does not watch for/.test(p)), `not built ${label}: refused, not read as something else`);
  }
  const s = table(), source = put(s, {...structuredClone(laelia), card: "Laelia, the Blade Reforged"});
  const exile = (owner, zone, opts = {}) => {
    const id = put(s, card(`${zone} card of ${owner}`), zone, owner);
    s.pendingTriggers = [];
    collectTriggers(s, runEffect(s, {effect: "moveZone", targets: [id], to: "exile", ...opts}, {controller: owner, source: null}));
    return s.pendingTriggers.filter((t) => t.source.cardId === source).length;
  };
  eq([exile(0, "library"), exile(0, "graveyard"), exile(0, "hand")], [1, 1, 0], "from Rob's library or graveyard it triggers; from his hand it does not");
  eq([exile(1, "library"), exile(2, "graveyard"), exile(3, "library")], [0, 0, 0], "another player's cards, whoever's at a four-player table: no");
  /* Face down, from the library (hideaway; CR 406.3): a card put into exile all the same. */
  const hidden = put(s, card("Hidden"), "library", 0);
  s.pendingTriggers = [];
  const events = [];
  moveOne(s, hidden, "exile", events, {faceDown: true, lookers: [0]});
  collectTriggers(s, events);
  eq(s.pendingTriggers.filter((t) => t.source.cardId === source).length, 1, "exiled face down from the library: it triggers");
  /* And what it is about stays hidden (CR 406.3): on the stack, the card's name reaches no other seat. */
  openTriggers(s);
  eq([0, 1, 2, 3].map((seat) => JSON.stringify(projectFor(s, seat)).includes("Hidden")), [true, false, false, false],
    "the trigger on the stack about a face-down card: only the player who may look sees its name");
  s.stack.length = 0;
  /* Two from the library and two from the graveyard in one action: once. */
  s.pendingTriggers = [];
  const four = [put(s, card("L1"), "library"), put(s, card("L2"), "library"), put(s, card("G1"), "graveyard"), put(s, card("G2"), "graveyard")];
  collectTriggers(s, runEffect(s, {effect: "moveZone", targets: four, to: "exile"}, {controller: 0}));
  const mine = s.pendingTriggers.filter((t) => t.source.cardId === source);
  eq([mine.length, mine[0]?.about?.cards?.length], [1, 4], "four cards at once, from both zones: one trigger, about all four");
}

/* ---- spells cast from anywhere other than your hand cost {2} less (Advanced Reconstruction, level 3) ---- */
{
  const s = table();
  const holder = put(s, {card: "Reconstruction", types: ["Enchantment"], manaCost: "{3}{R}", colors: ["R"],
    abilities: [{id: "a5", kind: "static", rule: "spells-cost-less", amount: 2, affects: {}, fromAnywhereButHand: true}]});
  const where = {hand: put(s, card("In hand"), "hand"), graveyard: put(s, card("In graveyard"), "graveyard"), exile: put(s, card("In exile"), "exile"),
    library: put(s, card("In library"), "library"), command: put(s, {...card("Commander"), commander: true}, "command")};
  eq(Object.fromEntries(Object.entries(where).map(([zone, id]) => [zone, costReduction(s, 0, id)])), {hand: 0, graveyard: 2, exile: 2, library: 2, command: 2},
    "{2} less from a graveyard, exile, a library or the command zone -- never from a hand");
  eq(costReduction(s, 1, where.exile), 0, "spells its controller casts: not Maya's");
  delete s.objects[holder].abilities[0].fromAnywhereButHand;
  eq(costReduction(s, 0, where.hand), 2, "without the words, a spell from a hand would be reduced too: they are what keep it out");
  /* The card: had at level 3, not before (CR 716.2a). */
  const t = table(), recon = put(t, {...structuredClone(index.definition("Advanced Reconstruction")), card: "Advanced Reconstruction"}), exiled = put(t, card("Ogre"), "exile");
  const at3 = [1, 2, 3].map((level) => { t.objects[recon].level = level; return costReduction(t, 0, exiled); });
  eq(at3, [0, 0, 2], "Advanced Reconstruction's reduction at level 3 only");
}

/* ---- copy each card, and cast the copies (Mizzix's Mastery; CR 707.12) ---- */
{
  const s = table(), insight = put(s, SORCERY("Insight"), "exile"), foresight = put(s, SORCERY("Foresight"), "exile");
  for (let i = 0; i < 6; i += 1) put(s, card(`Draw ${i}`), "library");
  beginResolution(s, [{effect: "play", from: "targets", targets: [insight, foresight], copies: true, free: true, anyNumber: true}], {controller: 0, source: null});
  const copies = s.zones.exile.filter((id) => s.objects[id].copy === true);
  eq([names(s, copies).sort(), copies.map((id) => s.objects[id].controller)], [["Foresight", "Insight"], [0, 0]], "each card copied where it is, the copy its caster's");
  const choice = awaitingChoice(s);
  eq(choice.options.filter((o) => o.cardId !== undefined).map((o) => o.cardId).sort(), [...copies].sort(), "the copies are what may be cast, not the cards");
  for (const answer of pilotsAnswer(s, 0)) ok(legal(choice, answer), "each pilot answers which copy to cast");
  answerResolution(s, [choice.options.find((o) => o.cardId !== undefined && s.objects[o.cardId].card === "Insight").index]);
  const again = awaitingChoice(s);
  eq([again.title, again.options.map((o) => o.label)], ["Cast another spell?", ["Foresight", "Don't cast"]], "each copy chosen for itself (CR 707.12a): asked again of the other");
  answerResolution(s, [again.options.length - 1]);
  checkStateBasedActions(s);
  eq([names(s, s.zones.exile).sort(), s.stack.length], [["Foresight", "Insight"], 1], "the copy not cast ceases to exist (CR 707.10a); the cards stay in exile; one copy on the stack");
  /* Copied in the zone the card is in (CR 707.12) -- a graveyard, here -- and the copy its caster's, whoever owns the card. */
  const t = table(), mine = put(t, SORCERY("Recall"), "graveyard", 0), hers = put(t, SORCERY("Her insight"), "exile", 1);
  beginResolution(t, [{effect: "play", from: "targets", targets: [mine, hers], copies: true, free: true}], {controller: 0, source: null});
  const made = Object.values(t.objects).filter((o) => o.copy === true);
  eq(made.map((o) => [o.card, o.zone, o.owner, o.controller]).sort(), [["Her insight", "exile", 0, 0], ["Recall", "graveyard", 0, 0]],
    "a copy of a card in a graveyard is in that graveyard; a copy of Maya's card is Rob's");
  const u = table(), there = put(u, {card: "Relic", types: ["Artifact"], manaCost: "{3}", colors: []});
  beginResolution(u, [{effect: "play", from: "targets", targets: [there], copies: true, free: true}], {controller: 0, source: null});
  eq([Object.values(u.objects).filter((o) => o.copy === true).length, u.awaiting], [0, null], "a permanent on the battlefield is not copied to be cast: nothing made, nobody asked");
}

/* ---- each creature card exiled with it, and only those (Ghost Vacuum; CR 607.2a) ---- */
{
  const s = table(), source = put(s, {card: "Ghost Vacuum", types: ["Artifact"], manaCost: "{1}", colors: []});
  const bear = put(s, card("Bear"), "exile", 1), insight = put(s, SORCERY("Insight"), "exile", 0);
  const hidden = moveOne(s, put(s, card("Hidden Bear"), "library", 2), "exile", [], {faceDown: true, lookers: [2]});
  const stranger = put(s, card("Stranger"), "exile", 3);
  /* And one it exiled that has left exile since: a new object elsewhere (CR 400.7), nothing to move. */
  const gone = put(s, card("Gone Bear"), "exile", 1);
  runEffect(s, {effect: "moveZone", targets: [gone], to: "graveyard"}, {controller: 1});
  s.links = {[source]: [bear, gone, insight, hidden]};
  beginResolution(s, structuredClone(index.definition("Ghost Vacuum").abilities.find((a) => a.timing === "sorcery").effects), {controller: 0, source});
  const back = s.zones.battlefield.filter((id) => s.objects[id].card === "Bear");
  eq([back.length, s.objects[back[0]].controller, s.objects[back[0]].owner, s.objects[back[0]].counters.flying], [1, 0, 1, 1],
    "only the creature card: Maya's Bear, under Rob's control, a flying counter on it");
  const now = characteristicsOf(s, back[0]);
  eq([now.power, now.toughness, now.subtypes.includes("Spirit"), now.subtypes.includes("Bear"), now.keywords.includes("Flying")], [1, 1, true, true, true],
    "a 1/1 Spirit in addition to its other types, flying from its counter");
  eq(now.types, ["Creature"], "Spirit is a creature type it gains, not a card type (CR 205.1b, 205.3m)");
  eq([s.links[source], s.objects[stranger].zone, names(s, s.zones.graveyard[1])], [[insight, hidden], "exile", ["Gone Bear"]],
    "the others are still exiled with it -- a face-down card has no characteristics (CR 406.3a), so it is no creature card -- one gone from exile is forgotten, and a card exiled otherwise is not touched");
  runEffect(s, {effect: "moveZone", linked: true, to: "graveyard"}, {controller: 0, source});
  eq(s.links[source], undefined, "a linked move without `linkedOnly` spends the whole link, as before");
  const script = structuredClone(scripts.get("Ghost Vacuum"));
  const move = script.abilities.find((a) => a.timing === "sorcery").effects[0];
  delete move.linked;
  ok(validateScript(script).errors.some((e) => /linkedOnly narrows a linked move/.test(e.message)), "linkedOnly without linked is refused at the schema");
  move.linked = true; move.linkedOnly = {hue: ["G"]};
  ok(!validateScript(script).valid, "and a selector it cannot read, too");
}

/* ---- Overload, credited (CR 702.96; game/tools/engine-constructs.mjs) ---- */
eq([keywordBuilt("Overload"), missingFor({keywords: ["Overload"]})], [true, []], "Overload is a built way of casting: it holds no card back");

/* ---- Getaway Barrel at four players: its controller's library alone, a creature card from it at random ---- */
{
  const barrel = (library) => run({name: "x11 getaway barrel", seats: 4, library,
    setup: [at(0, "battlefield", "Getaway Barrel", "Mountain"), at(0, "hand", "Shatter")],
    steps: [{tap: "Mountain"}, {cast: "Shatter", targets: [{card: "Getaway Barrel"}]}, {resolve: true}, {resolve: true}]},
  {Shatter: {types: ["Instant"], manaCost: "{R}", colors: ["R"], spell: {id: "s", text: "Destroy target artifact.", targets: [{what: "permanent", types: ["Artifact"]}],
    effects: [{effect: "destroy", targets: {target: 0}}]}}, Bear: card("Bear"), Ogre: card("Ogre", {subtypes: ["Ogre"], manaCost: "{2}{R}", power: 3, toughness: 3})});
  /* At four seats the first player draws on turn 1 (CR 103.8c; only a two-player game skips it, 103.8a): one more on top. */
  const LIBRARY = ["Wastes", "Wastes", "Wastes", "Bear", "Wastes", "Ogre", ...Array(8).fill("Wastes"), "Island"];
  const r = barrel(LIBRARY).state;
  const entered = r.zones.battlefield.filter((id) => ["Bear", "Ogre"].includes(r.objects[id].card));
  const other = entered.length === 1 ? (r.objects[entered[0]].card === "Bear" ? "Ogre" : "Bear") : null;
  eq([entered.length, r.zones.library[0].length, names(r, r.zones.library[0].slice(-12)).includes(other), r.objects[r.zones.library[0][0]].card],
    [1, 18, true, "Island"], "one of the two creature cards, at random; the other among the twelve now at the bottom; the fourteenth card on top");
  eq([1, 2, 3].map((seat) => [r.zones.library[seat].length, r.zones.battlefield.filter((id) => r.objects[id].controller === seat).length]), [[20, 0], [20, 0], [20, 0]],
    "nobody else's library is touched");
  const again = barrel(LIBRARY).state;
  eq(again.zones.battlefield.map((id) => again.objects[id].card), r.zones.battlefield.map((id) => r.objects[id].card), "and the same game picks the same card: the game's random stream, replayable");
}

/* ---- Settle the Wreckage: she may find fewer than that many (CR 701.23b) ---- */
{
  const settled = run({name: "x11 settle fewer", library: ["Wastes", "Plains", "Forest", "Island"],
    setup: [at(0, "battlefield", "Plains", "Plains", "Wastes", "Wastes"), at(0, "hand", "Settle the Wreckage"), at(1, "battlefield", "Bear", "Cub")],
    steps: [{to: {turn: 2, phase: "MAIN1"}}, {attack: ["Bear", "Cub"], seat: 1}, {pass: 1}, {tap: "Plains"}, {tap: "Plains"}, {tap: "Wastes"}, {tap: "Wastes"},
      {cast: "Settle the Wreckage", seat: 0, targets: [{player: 1}]}, {resolve: true}, {choose: ["Search"]}]},
  {Bear: card("Bear"), Cub: card("Cub", {power: 1, toughness: 1, manaCost: "{G}"})});
  const choice = awaitingChoice(settled.state);
  eq([choice.min, choice.max, settled.state.awaiting.player], [0, 2, 1], "two exiled: up to two basic lands, Maya's own search, and she may find fewer");
  answerResolution(settled.state, [0], {}, createRng("x11 settle"));
  eq(settled.state.zones.battlefield.filter((id) => settled.state.objects[id].controller === 1).length, 1, "one found, one land");
}

/* ---- Currency Converter: "a card exiled with this artifact", not any card in exile ---- */
{
  const loot = {types: ["Sorcery"], manaCost: "{U}", colors: ["U"], spell: {id: "s", text: "Draw a card, then discard a card.", targets: [], effects: [{effect: "draw", count: 1}, {effect: "discard", count: 1}]}};
  const r = run({name: "x11 converter", library: ["Wastes"],
    setup: [at(0, "battlefield", "Currency Converter", "Island"), at(0, "hand", "Loot", "Bear"), at(1, "exile", "Ogre"), at(0, "exile", "Cub")],
    steps: [{tap: "Island"}, {cast: "Loot"}, {resolve: true}, {choose: ["Bear"]}, {resolve: true}, {choose: ["Yes"]},
      {activate: "Currency Converter", ability: "a2"}, {resolve: true}]}, {Loot: loot, Bear: card("Bear"), Ogre: card("Ogre"), Cub: card("Cub")});
  eq(awaitingChoice(r.state).options.map((o) => o.label), ["Bear"], "only the card it exiled is offered: not Maya's Ogre, not Rob's Cub exiled some other way");
}

/* ---- asking what may be done changes nothing: an adventurer card shown as its Adventure for the offer, and put back ----
   (found by tests/engine-derive-once.mjs once these cards changed the decks it draws: Bofur's offers left `spell`, `loyalty` and
   `enchant` behind on the card as nothing, state/index.mjs showAdventure) */
{
  /* Concerted Care is {1}{W}, at an artifact or creature of Rob's: two Plains and a Bear. */
  const s = run({name: "x11 adventure offers", setup: [at(0, "battlefield", "Plains", "Plains", "Bear"), at(0, "hand", "Bofur, Reliable Guardian // Concerted Care")], steps: []},
    {Bear: card("Bear")}).state;
  const [bofur] = s.zones.hand[0];
  const keys = Object.keys(s.objects[bofur]).sort(), before = hashState(s);
  const offers = legalActions(s, 0).filter((a) => a.objectId === bofur);
  eq([offers.some((a) => a.adventure === true), hashState(s) === before, Object.keys(s.objects[bofur]).sort()], [true, true, keys],
    "its Adventure offered, and the card left exactly as it was");
}

console.log(`engine-x11-memory: ${checks} checks passed -- discard up to; counters removed and a color per mana; exiled from a library or graveyard; reductions off the hand; copies cast; each creature card exiled with it; Overload; and four-player edges.`);
