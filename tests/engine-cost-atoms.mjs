/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* TRAIN C, PHASE 2 (p3-costs): THREE COST ATOMS THE ENGINE LACKED (CR 602.2b, 601.2f-h).
 *
 * "Remove a +1/+1 counter from a creature you control" (Bolrac-Clan Crusher): removeCountersAmong of one kind, from a creature
 * its player picks once the activation is taken. "Flashback--{1}{U/R}{U/R}, Discard a card" (Twinned Vision; CR 702.34a): a
 * discard among a flashback cost's atoms, each card its own offer. "Pay life equal to the number of colors in your commanders'
 * color identity" (War Room; CR 903.4): life counted as the cost is paid, unpayable without a commander (903.4f), and never
 * more than its player has (119.4). What the scenarios cannot reach: the edges, partners, and what the compiler refuses.
 */
import assert from "node:assert/strict";
import {createState, addObject} from "../game/engine/state/index.mjs";
import {beginGame, advance, awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {legalActions, applyAction, flashbackCost, costAtomBuilt} from "../game/engine/rules/actions.mjs";
import {amountOf, amountProblems, commanderless} from "../game/engine/script/amount.mjs";
import {compileScript} from "../game/engine/cards/index.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {missingFor} from "../game/tools/engine-constructs.mjs";

let checks = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };
const ok = (v, m) => { assert.ok(v, m); checks += 1; };

const cards = loadCardIndex();
const card = (name) => ({...cards.definition(name), card: name});
const land = (name, produces) => ({card: name, types: ["Land"], abilities: [{id: "m", kind: "mana", tapSelf: true, produces}]});
const WASTES = land("Wastes", {C: 1});
const creature = (name, more = {}) => ({card: name, types: ["Creature"], manaCost: "{1}", colors: ["G"], power: 2, toughness: 2, ...more});

function table(seats = 2) {
  const s = createState({matchId: "m", seed: "cost-atoms", players: ["Rob", "Maya", "Trey", "Sam"].slice(0, seats).map((name) => ({name}))});
  for (let seat = 0; seat < seats; seat += 1) for (let i = 0; i < 12; i += 1) addObject(s, {...WASTES, owner: seat, controller: seat}, "library", seat);
  beginGame(s);
  for (let n = 0; n < 50 && !(s.phase === "MAIN1" && s.priorityPlayer === 0); n += 1) advance(s);
  return s;
}
const put = (s, o, seat, zone) => addObject(s, {...o, owner: seat, controller: seat}, zone, zone === "battlefield" ? null : seat);
const activations = (s, id, seat = 0) => legalActions(s, seat).filter((a) => a.kind === "activate" && a.objectId === id);
const casts = (s, name, seat = 0) => legalActions(s, seat).filter((a) => a.kind === "cast" && a.label === name);

{
  /* Bolrac-Clan Crusher: a +1/+1 counter, of that kind only, on a creature of Rob's -- never a -1/-1 counter, a +1/+1 counter on
     Maya's creature, or one on an artifact of his. The question names the kind, and a pick of another kind is refused. */
  const s = table();
  const crusher = put(s, card("Bolrac-Clan Crusher"), 0, "battlefield");
  s.objects[crusher].controlledSinceTurn = -1;
  const shrunk = put(s, creature("Shrunk"), 0, "battlefield"), hers = put(s, creature("Hers"), 1, "battlefield");
  const relic = put(s, {card: "Relic", types: ["Artifact"]}, 0, "battlefield");
  s.objects[shrunk].counters["-1/-1"] = 1; s.objects[hers].counters["+1/+1"] = 2; s.objects[relic].counters["+1/+1"] = 1;
  eq(activations(s, crusher).length, 0, "no +1/+1 counter on a creature Rob controls: not offered");
  s.objects[shrunk].counters["+1/+1"] = 1;
  const offer = activations(s, crusher).find((a) => a.targets[0].kind === "player" && a.targets[0].id === 1);
  ok(offer && offer.countersLater === 1, "now one: offered, the counter picked once it is taken");
  applyAction(s, 0, offer);
  const choice = awaitingChoice(s);
  eq([choice.title, choice.options.map((o) => [o.cardId, o.counter])], ["Bolrac-Clan Crusher: remove one +1/+1 counter", [[shrunk, "+1/+1"]]], "the one +1/+1 counter it may be");
  resolveAwaiting(s, [0]);
  eq([s.objects[shrunk].counters["+1/+1"], s.objects[shrunk].counters["-1/-1"], s.objects[crusher].tapped], [0, 1, true], "its +1/+1 counter removed, the -1/-1 kept, and the Crusher tapped");
  ok(costAtomBuilt({atom: "removeCountersAmong", count: 1, counter: "+1/+1", selector: {types: ["Creature"]}}) && !costAtomBuilt({atom: "removeCountersAmong", count: 1, counter: 1, selector: {types: ["Creature"]}}),
    "a kind is a counter's name");
  /* Tekuthal's "three counters from among ..." is still any kind. */
  const t = table();
  const tekuthal = put(t, {card: "Taker", types: ["Artifact"], abilities: [{id: "take", kind: "activated", text: "Remove two counters from among creatures you control: Draw a card.",
    cost: [{atom: "removeCountersAmong", count: 2, selector: {types: ["Creature"]}}], targets: [], effects: [{effect: "draw", count: 1}]}]}, 0, "battlefield");
  const mixed = put(t, creature("Mixed"), 0, "battlefield");
  t.objects[mixed].counters["-1/-1"] = 1; t.objects[mixed].counters.charge = 1;
  eq(activations(t, tekuthal).length, 1, "no kind named: a -1/-1 and a charge counter are two counters");
}
{
  /* Twinned Vision's flashback: its cost's discard is an extra atom, one offer for each card in the hand -- the discard a
     discard ("whenever you discard a card" sees it) -- and none with an empty hand. Two cards drawn, cast from a graveyard. */
  const s = table();
  const vision = put(s, card("Twinned Vision"), 0, "graveyard");
  eq(flashbackCost(s, 0, vision), {mana: "{1}{U/R}{U/R}", life: 0, extra: [{atom: "discard"}]}, "its flashback cost: the mana, and a card to discard");
  Object.assign(s.players[0].manaPool, {U: 1, R: 1, C: 1});
  eq(casts(s, "Twinned Vision").length, 0, "an empty hand: nothing to discard, no flashback");
  const a = put(s, creature("Alpha"), 0, "hand"), b = put(s, creature("Beta"), 0, "hand");
  const offers = casts(s, "Twinned Vision");
  eq(offers.map((o) => o.costChoice.discard).sort(), [a, b].sort(), "one offer per card in the hand");
  const events = applyAction(s, 0, offers.find((o) => o.costChoice.discard === b));
  ok(events.some((e) => e.kind === "GameEventCardChangeZone" && e.data.fields.discarded === true && e.data.fields.card?.name === "Beta"), "Beta discarded, as a discard");
  eq(s.players[0].manaPool, {W: 0, U: 0, B: 0, R: 0, G: 0, C: 0}, "and the mana paid");
}
{
  /* War Room's life: the colors of every commander its player owns, together (CR 702.124c, 903.4), wherever the commander is;
     none and the cost is unpayable (903.4f); never more than the player has (119.4). */
  const s = table();
  const room = put(s, card("War Room"), 0, "battlefield");
  const draw = () => activations(s, room).filter((a) => a.text?.startsWith("{3}"));
  s.players[0].manaPool.C = 3;
  eq(draw().length, 0, "no commander: unpayable");
  put(s, {...creature("Azorius", {manaCost: "{W}{U}", colors: ["W", "U"]}), commander: true}, 0, "command");
  eq(draw().map((a) => a.payment.life), [2], "a white-blue commander: 2 life");
  put(s, {...creature("Dimir", {manaCost: "{U}{B}", colors: ["U", "B"]}), commander: true}, 0, "exile");
  eq(draw().map((a) => a.payment.life), [3], "a blue-black partner too, in exile: white, blue and black, 3 life");
  eq([amountOf(s, {commanderColors: "you"}, {controller: 1}), commanderless(s, {commanderColors: "you"}, {controller: 1}), commanderless(s, {commanderColors: "you"}, {controller: 0})], [0, true, false],
    "Maya has no commander of her own -- Rob's are his: none counted, and a cost of it hers unpayable");
  eq(commanderless(s, {count: {what: "card", zone: "hand", controller: "you"}}, {controller: 1}), false, "another count is defined for her: only a commander's quality is undefined");
  s.players[0].life = 2;
  eq(draw().length, 0, "at 2 life, 3 is too much to pay (CR 119.4)");
  s.players[0].life = 3;
  eq(draw().length, 1, "at 3 life, exactly enough");
  s.players[0].life = 5;
  applyAction(s, 0, draw()[0]);
  eq([s.players[0].life, s.objects[room].tapped, s.stack.length], [2, true, 1], "at 5 life: 3 paid, and the draw on the stack");
  eq([amountProblems({commanderColors: "you"}), amountProblems({commanderColors: "that player"}).length > 0], [[], true], "commanderColors is \"you\"");
  ok(costAtomBuilt({atom: "payLife", amount: {commanderColors: "you"}}) && !costAtomBuilt({atom: "payLife", amount: {commanderColors: "them"}}) && !costAtomBuilt({atom: "payLife", amount: -1}),
    "an activated ability's life: a number, or a count the grammar knows");
  const notBuilt = missingFor({counts: ["ColorsColorIdentity"]});
  eq(notBuilt, [], "Forge's ColorsColorIdentity count is built");
}
{
  /* What the compiler refuses: a counted life anywhere but an activated ability's cost -- a flashback, an evoke, an
     alternative cost, a mana ability -- and a flashback discard of a kind of card, or of the card itself. */
  const id = (types) => ({name: "Odd", oracleId: "x", types, subtypes: [], manaCost: "{1}{U}", colors: ["U"], colorIdentity: ["U"]});
  const life = {atom: "payLife", amount: {commanderColors: "you"}};
  const spell = {kind: "spell", text: "Draw a card.", targets: [], effects: [{effect: "draw", count: 1}]};
  const script = (types, abilities) => ({schema: "CrankCardScript@1", identity: id(types), oracleText: abilities.map((a) => a.text).join("\n"), abilities});
  const problems = (s) => compileScript(s).problems;
  const flashback = (cost) => script(["Instant"], [spell, {kind: "keyword", text: "Flashback", keyword: "flashback", cost}]);
  ok(problems(flashback([{atom: "mana", cost: "{1}"}, life])).some((p) => /flashback cost/.test(p)), "flashback: a counted life refused");
  ok(problems(flashback([{atom: "mana", cost: "{1}"}, {atom: "discard", selector: {types: ["Creature"]}}])).some((p) => /flashback cost/.test(p)), "flashback: a discard of a kind refused");
  ok(problems(flashback([{atom: "mana", cost: "{1}"}, {atom: "discard", self: true}])).some((p) => /flashback cost/.test(p)), "flashback: discarding itself refused");
  ok(problems(flashback([{atom: "mana", cost: "{1}"}, {atom: "discard", count: 0}])).some((p) => /flashback cost/.test(p)), "flashback: a discard of no cards refused");
  eq(problems(flashback([{atom: "mana", cost: "{1}"}, {atom: "discard", count: 2}, {atom: "payLife", amount: 2}])), [], "flashback: two cards and 2 life, built");
  ok(problems(script(["Creature"], [{kind: "keyword", text: "Evoke", keyword: "evoke", cost: [life]}])).some((p) => /evoke cost/.test(p)), "evoke: a counted life refused");
  ok(problems(script(["Instant"], [spell, {kind: "static", text: "Rather than pay.", rule: "alternative-cost", affects: {what: "card", self: true}, cost: [life]}]))
    .some((p) => /alternative cost of payLife/.test(p)), "an alternative cost: a counted life refused");
  ok(problems(script(["Land"], [{kind: "activated", text: "{T}, Pay life: Add {C}.", cost: [{atom: "{T}"}, life], effects: [{effect: "addMana", mana: {C: 1}}]}]))
    .some((p) => /mana ability the engine cannot run/.test(p)), "a mana ability: a counted life refused");
  eq(problems(script(["Land"], [{kind: "activated", text: "{T}, Pay 1 life: Add {C}.", cost: [{atom: "{T}"}, {atom: "payLife", amount: 1}], effects: [{effect: "addMana", mana: {C: 1}}]}])), [],
    "a mana ability's 1 life, built");
}
{
  /* Two cards discarded for a flashback (a cost of two): each pair its own offer, as an additional cost's are. */
  const TWICE = {card: "Twice", types: ["Sorcery"], manaCost: "{U}", colors: ["U"], abilities: [{id: "fb", kind: "static", rule: "flashback", text: "Flashback", affects: {what: "card", self: true},
    cost: [{atom: "mana", cost: "{U}"}, {atom: "discard", count: 2}]}], spell: {id: "s", text: "Draw a card.", targets: [], effects: [{effect: "draw", count: 1}]}};
  const s = table();
  put(s, TWICE, 0, "graveyard");
  for (const name of ["A", "B", "C"]) put(s, creature(name), 0, "hand");
  s.players[0].manaPool.U = 1;
  eq(casts(s, "Twice").map((o) => o.costNames.length), [2, 2, 2], "three cards, three pairs");
}

console.log(`engine-cost-atoms: ${checks} checks passed`);
