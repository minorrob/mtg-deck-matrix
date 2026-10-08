/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* CONVOKE (CR 702.51), FOR ROB'S PRIORITY LIST: WHAT THE CARDS' SCENARIOS CANNOT REACH.
 *
 * "Each creature you tap while casting this spell pays for {1} or one mana of that creature's color." Not an additional or
 * alternative cost (CR 702.51b): it pays part of the total cost -- a commander's tax among it -- and the pool pays the
 * rest. A convoke spell is offered, beside the cast the pool pays alone, when the pool and its caster's untapped creatures
 * could pay it together (rules/actions.mjs); once that offer is taken, the caster picks the creatures (`choose-cost`), a
 * summoning-sick one among them, since tapping it is not its own {T} (CR 302.6). Picks that cannot pay are refused with
 * what to do instead, and nothing is tapped or moved. Picks that leave the pool more than one way to pay the rest are
 * followed by the payment question (the plan's X8b, CR 601.2g-h): which mana stays in the pool is the caster's to decide,
 * never the engine's -- at a four-player table too, as the live fuzz found it with Lethal Scheme -- and the house and
 * random-legal pilots answer it. A spell with {X} is not convoked (named).
 */
import assert from "node:assert/strict";
import {awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {legalActions, applyAction} from "../game/engine/rules/actions.mjs";
import {recordCommanderCast} from "../game/engine/rules/commander.mjs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {offerDetails} from "../game/room/room.mjs";
import {housePilot} from "../game/engine/pilots/house-pilot.mjs";
import {projectFor} from "../game/engine/projection.mjs";
import {randomLegalPilot} from "../game/engine/pilots/random-legal.mjs";
import {createRng} from "../game/engine/rng.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";
import {convokePayments, parseManaCost, paymentKey, PAY_CHOICES} from "../game/engine/rules/mana.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const at = (seat, zone, ...cards) => ({seat, zone, cards});
const sick = (seat, zone, ...cards) => ({seat, zone, cards, sick: true});
const creature = (subtype, colors, more = {}) => ({types: ["Creature"], subtypes: [subtype], manaCost: "{1}", colors, power: 2, toughness: 2, ...more});
const FIX = {"White Pal": creature("Human", ["W"]), Bear: creature("Bear", ["G"]), Wolf: creature("Wolf", ["G"]), Elk: creature("Elk", ["G"]), Cat: creature("Cat", ["G"]),
  Lynx: creature("Cat", ["G"]), Ogre: creature("Ogre", ["R"]),
  /* The white and black 2/1 flying Inkling token a Strixhaven card makes. */
  Inkling: creature("Inkling", ["W", "B"], {manaCost: "", power: 2, toughness: 1, keywords: ["Flying"]}),
  /* A legendary creature with convoke, to be a commander, and a sorcery with {X} and convoke. */
  "Convoke Lord": {types: ["Creature"], subtypes: ["Elf"], supertypes: ["Legendary"], manaCost: "{3}{G}", colors: ["G"], power: 3, toughness: 3, keywords: ["Convoke"]},
  "X Convoke": {types: ["Sorcery"], manaCost: "{X}{G}", colors: ["G"], keywords: ["Convoke"], spell: {id: "s", text: "Draw X cards.", targets: [], effects: [{effect: "draw", count: "X"}]}}};
const play = (name, setup, steps = []) => runScenario({name, setup, steps}, index.definition, FIX).state;
const named = (s, card) => Object.values(s.objects).filter((o) => o.card === card && o.zone === "battlefield").map((o) => o.id);
const offers = (s, card) => legalActions(s, 0).filter((a) => a.kind === "cast" && s.objects[a.objectId]?.card === card);
const convokeOffer = (s, card) => offers(s, card).find((a) => a.convoke === true);
const pick = (s, labels) => { const c = awaitingChoice(s); return labels.map((l) => c.options.find((o) => o.label === l).index); };
const tapped = (s, card) => s.objects[named(s, card)[0]].tapped === true;

/* ---- the question ---- */
{
  /* Sun-Dappled Celebrant ({4}{W}{W}) with two Plains tapped: Rob's untapped creatures, the sick one too, and not the tapped
     Elk or Maya's Lynx -- at least one, since the pool cannot pay it all, and at most all four. */
  const s = play("the question", [at(0, "battlefield", "Plains", "Plains", "Bear", "Wolf", "Cat", "Elk"), sick(0, "battlefield", "White Pal"), at(0, "hand", "Sun-Dappled Celebrant"),
    at(1, "battlefield", "Lynx")], [{tap: "Plains"}, {tap: "Plains"}]);
  s.objects[named(s, "Elk")[0]].tapped = true;
  const offer = convokeOffer(s, "Sun-Dappled Celebrant");
  ok(offer && offers(s, "Sun-Dappled Celebrant").length === 1, "with two Plains, only the convoke offer: the pool alone cannot pay it");
  applyAction(s, 0, offer);
  const choice = awaitingChoice(s);
  eq([s.awaiting.kind, choice.cost, choice.options.map((o) => o.label).sort(), choice.min, choice.max], ["choose-cost", "convoke", ["Bear", "Cat", "White Pal", "Wolf"], 1, 4],
    "Rob picks among Rob's untapped creatures, summoning-sick or not: one to four of them");
  eq([Object.values(s.objects).some((o) => o.card === "Sun-Dappled Celebrant" && o.zone === "hand"), s.stack.length, s.players[0].manaPool.W], [true, 0, 2],
    "and nothing has moved or been paid while it asks");
}
{
  /* With the pool able to pay all of it, the convoke offer asks for none at least. */
  const s = play("none needed", [at(0, "battlefield", "Plains", "Plains", "Wastes", "Wastes", "Wastes", "Wastes", "Bear"), at(0, "hand", "Sun-Dappled Celebrant")],
    [{tap: "Plains"}, {tap: "Plains"}, {tap: "Wastes"}, {tap: "Wastes"}, {tap: "Wastes"}, {tap: "Wastes"}]);
  eq(offers(s, "Sun-Dappled Celebrant").length, 2, "both offers: the pool alone, and convoked");
  /* The table says which is which (room/room.mjs). */
  const words = offerDetails(s, 0, offers(s, "Sun-Dappled Celebrant"));
  eq(words.map((w) => w.includes("convoking, tapping creatures you choose")), [false, true], "the table words the convoke offer, and only it");
  applyAction(s, 0, convokeOffer(s, "Sun-Dappled Celebrant"));
  eq([awaitingChoice(s).min, awaitingChoice(s).max], [0, 1], "convoked, it may tap none");
  resolveAwaiting(s, pick(s, ["Bear"]));
  eq([s.stack.length, tapped(s, "Bear"), s.players[0].manaPool.C], [1, true, 1], "the Bear paid {1}: one Wastes' {C} stays in the pool");
}

/* ---- refused, with what to do instead; nothing tapped or moved ---- */
{
  /* Appeal to Eirdu ({3}{W}) with the Plains' {W}: two creatures leave {1} unpaid. */
  const s = play("too few", [at(0, "battlefield", "Plains", "Bear", "Wolf", "Elk"), at(0, "hand", "Appeal to Eirdu")], [{tap: "Plains"}]);
  const offer = convokeOffer(s, "Appeal to Eirdu");
  applyAction(s, 0, {...offer, targets: [[{kind: "object", id: named(s, "Bear")[0]}]]});
  assert.throws(() => resolveAwaiting(s, pick(s, ["Bear", "Wolf"])), /cannot pay for Appeal to Eirdu: each creature pays \{1\} or one mana of its color/); checks += 1;
  eq([tapped(s, "Bear"), tapped(s, "Wolf"), s.stack.length, s.players[0].manaPool.W, s.awaiting, s.priorityPlayer], [false, false, 0, 1, null, 0],
    "nothing tapped, nothing cast, the {W} still in the pool, and Rob holds priority again");
}

/* ---- which mana pays the rest, asked (the plan's X8b; tools/fuzz-live.mjs found it refused at a live table) ---- */
{
  /* {W}, {U} and {B} in the pool and the white creature among three for Appeal to Eirdu ({3}{W}): it pays the {W} and the
     green two {1} each, and the {1} left is paid with the {W}, the {U} or the {B} -- or it pays {1}, and the {W} pays the
     {W}. Which mana stays is Rob's to say (CR 601.2g-h), so once the creatures are picked he is asked, before anything is
     tapped or paid, never told to pick other creatures. */
  const asked = () => {
    const s = play("which mana", [at(0, "battlefield", "Plains", "Island", "Swamp", "White Pal", "Bear", "Wolf"), at(0, "hand", "Appeal to Eirdu")],
      [{tap: "Plains"}, {tap: "Island"}, {tap: "Swamp"}]);
    applyAction(s, 0, {...convokeOffer(s, "Appeal to Eirdu"), targets: [[{kind: "object", id: named(s, "Bear")[0]}]]});
    resolveAwaiting(s, pick(s, ["White Pal", "Bear", "Wolf"]));
    return s;
  };
  const s = asked(), choice = awaitingChoice(s), appeal = Object.values(s.objects).find((o) => o.card === "Appeal to Eirdu").id;
  eq([s.awaiting.kind, s.awaiting.player, choice.cost, choice.mode, choice.min, choice.max, choice.title, choice.options.map((o) => o.label)],
    ["choose-cost", 0, "pool", "one", 1, 1, "Appeal to Eirdu: which mana pays the rest", ["{W}", "{U}", "{B}"]],
    "the creatures picked, Rob is asked which mana pays the {1} left: each of the three, in words");
  eq([choice.id, choice.options.map((o) => o.key)], [`choose-cost:${appeal}:pool`, ["1,0,0,0,0,0|0", "0,1,0,0,0,0|0", "0,0,1,0,0,0|0"]],
    "named by its keys, under an id of its own: a board that kept the creatures' picks does not carry them into it");
  eq([tapped(s, "White Pal"), tapped(s, "Bear"), tapped(s, "Wolf"), s.stack.length, {...s.players[0].manaPool}],
    [false, false, false, 0, {W: 1, U: 1, B: 1, R: 0, G: 0, C: 0}], "and nothing is tapped, cast or paid while it asks");
  resolveAwaiting(s, pick(s, ["{U}"]));
  eq([s.stack.length, s.objects[s.stack[0].objectId].card, [s.players[0].manaPool.W, s.players[0].manaPool.U, s.players[0].manaPool.B], tapped(s, "White Pal"), tapped(s, "Bear"), tapped(s, "Wolf")],
    [1, "Appeal to Eirdu", [1, 0, 1], true, true, true], "Rob's {U} pays: cast, the three creatures tapped, and the {W} and the {B} stay in the pool");
  eq(s.objects[s.stack[0].objectId].spent, {U: 1}, "and the spell was spent the {U}, no more (CR 601.2h; the creatures paid no mana)");
  const w = asked();
  resolveAwaiting(w, pick(w, ["{W}"]));
  eq([w.players[0].manaPool.W, w.players[0].manaPool.U, w.players[0].manaPool.B], [0, 1, 1], "picked the other way, the {W} pays and the {U} stays: the answer is the payment");

  /* The pilots answer it: the house pilot with the first way that spends no life (pilots/house-pilot.mjs, "pool"), and the
     random-legal pilot -- the fuzz harness's person -- with any one of them, which the rules then take. */
  const h = asked();
  const house = housePilot({seat: 0, cards: () => null}).answer(projectFor(h, 0), awaitingChoice(h));
  resolveAwaiting(h, house.indices);
  eq([house.indices, h.stack.length, h.players[0].manaPool.W, h.awaiting], [[0], 1, 0, null], "the house pilot answers with the {W}, and it is cast");
  const seen = new Set();
  for (const seed of ["r1", "r2", "r3", "r4", "r5", "r6"]) {
    const r = asked(), answer = randomLegalPilot(createRng(seed)).answer(awaitingChoice(r));
    const label = awaitingChoice(r).options[answer.indices[0]]?.label;
    resolveAwaiting(r, answer.indices);
    ok(r.stack.length === 1 && r.awaiting === null && ["W", "U", "B"].filter((k) => r.players[0].manaPool[k] === 1).length === 2, `the random-legal pilot's answer (${label}) is taken`);
    seen.add(label);
  }
  ok(seen.size > 1, `and it does not always answer the same way (${[...seen].join(", ")}): any way offered is an answer`);

  /* A way named outright that the pool cannot pay is refused, saying what to do instead, before anything is tapped. */
  const t = play("not a way", [at(0, "battlefield", "Plains", "Island", "Swamp", "White Pal", "Bear", "Wolf"), at(0, "hand", "Appeal to Eirdu")], [{tap: "Plains"}, {tap: "Island"}, {tap: "Swamp"}]);
  const outright = {...convokeOffer(t, "Appeal to Eirdu"), targets: [[{kind: "object", id: named(t, "Bear")[0]}]], convokeTap: ["White Pal", "Bear", "Wolf"].map((c) => named(t, c)[0]), payWith: "0,0,0,0,2,0|0"};
  assert.throws(() => applyAction(t, 0, outright), /That mana no longer pays the rest of Appeal to Eirdu with those creatures: cast it again, and choose which mana pays/); checks += 1;
  eq([tapped(t, "White Pal"), t.stack.length, t.players[0].manaPool.U], [false, 0, 1], "and nothing is tapped or paid");
  applyAction(t, 0, {...outright, payWith: "0,0,1,0,0,0|0"});
  eq([t.stack.length, t.players[0].manaPool.B, t.players[0].manaPool.W], [1, 0, 1], "a way it can pay, named outright, is the payment");
}

{
  /* As many ways as the pool's own question offers at most (PAY_CHOICES), never more: one of each mana and a white and blue
     creature for {2}{W}{U} -- the creature paying the {W} leaves ten ways, paying the {U} ten more, sixteen in all. */
  const ways = convokePayments({W: 1, U: 1, B: 1, R: 1, G: 1, C: 1}, parseManaCost("{2}{W}{U}"), [{id: 1, colors: ["W", "U"]}]);
  eq([ways.length, new Set(ways.map(paymentKey)).size], [PAY_CHOICES, PAY_CHOICES], `sixteen ways, the first ${PAY_CHOICES} offered, each another`);
  /* And found at once: twelve white creatures for {10} and eight {W}, with twenty mana in the pool, could be assigned tens of
     millions of ways; the first assignment already leaves the pool more than PAY_CHOICES ways to pay, and the search stops. */
  const began = Date.now();
  const many = convokePayments({W: 4, U: 4, B: 4, R: 4, G: 4}, parseManaCost(`{10}${"{W}".repeat(8)}`), Array.from({length: 12}, (_, id) => ({id, colors: ["W"]})));
  eq(many.length, PAY_CHOICES, `twelve creatures and a rich pool: ${PAY_CHOICES} ways, found in ${Date.now() - began} ms`);
}

/* ---- four players, as the fuzz found it (tools/fuzz-live.mjs, D3 to D6, turn 29) ---- */
{
  /* Rob's {W}{U}{B} and Lethal Scheme ({2}{B}{B}), convoked by Berta, Wise Extrapolator (green and blue) and an Inkling (white
     and black), aimed at Trey's Ogre across a four-player table: the Inkling pays a {B}, Berta a {1}, and the pool the {1}{B}
     left with the {W} or the {U}. The table refused that cast before; Rob is asked. */
  const s = runScenario({name: "four players", seats: 4, library: ["Island", "Forest", "Swamp"],
    setup: [at(0, "battlefield", "Plains", "Island", "Swamp", "Berta, Wise Extrapolator", "Inkling"), at(0, "hand", "Lethal Scheme"),
      at(1, "battlefield", "Bear"), at(2, "battlefield", "Ogre"), at(3, "battlefield", "Wolf")],
    steps: [{tap: "Plains"}, {tap: "Island"}, {tap: "Swamp"}]}, index.definition, FIX).state;
  const ogre = named(s, "Ogre")[0], berta = named(s, "Berta, Wise Extrapolator")[0], inkling = named(s, "Inkling")[0];
  eq([s.players.length, s.objects[ogre].controller], [4, 2], "four players, and the Ogre is Trey's");
  const offer = offers(s, "Lethal Scheme").find((a) => a.convoke === true && a.targets?.[0]?.id === ogre);
  ok(offer, "Lethal Scheme is offered convoked, aimed at Trey's Ogre");
  applyAction(s, 0, offer);
  resolveAwaiting(s, pick(s, ["Berta, Wise Extrapolator", "Inkling"]));
  const choice = awaitingChoice(s);
  eq([choice.cost, choice.title, choice.options.map((o) => o.label)], ["pool", "Lethal Scheme: which mana pays the rest", ["{W}{B}", "{U}{B}"]],
    "Rob is asked which mana pays the {1}{B} left: the {W} or the {U} beside the {B}");
  resolveAwaiting(s, pick(s, ["{U}{B}"]));
  const entry = s.stack.find((e) => s.objects[e.objectId]?.card === "Lethal Scheme");
  eq([Boolean(entry), entry?.cast?.convoked, s.objects[berta].tapped, s.objects[inkling].tapped, s.players[0].manaPool.W, s.players[0].manaPool.U, s.players[0].manaPool.B],
    [true, [berta, inkling], true, true, 1, 0, 0], "cast with the {U}{B}: Berta and the Inkling convoked it, and the {W} stays");
  /* And the game goes on: every question answered with its first legal answer, every player passing, until the stack is
     empty -- Berta's increment and mana, the Ogre destroyed, and each creature that convoked it conniving (CR 701.50). */
  const rng = createRng("four");
  for (let i = 0; i < 400 && (s.stack.length || s.awaiting); i += 1) {
    if (s.awaiting) { const c = awaitingChoice(s); resolveAwaiting(s, c.options.slice(0, Math.max(c.min ?? 0, c.mode === "one" || c.mode === "boolean" ? 1 : 0)).map((o) => o.index), null, rng); continue; }
    passPriority(s, null, rng);
  }
  const graveyard = (seat) => s.zones.graveyard[seat].map((id) => s.objects[id].card);
  /* Rob's hand held the Island drawn before the main phase (cards/scenario.mjs); the two connives drew the Forest and the
     Swamp, and each discarded the first card offered. */
  eq([s.stack.length, s.awaiting, graveyard(2), graveyard(0), s.zones.hand[0].map((id) => s.objects[id].card), s.objects[berta].counters["+1/+1"]],
    [0, null, ["Ogre"], ["Island", "Forest", "Lethal Scheme"], ["Swamp"], 1],
    "it resolves: Trey's Ogre destroyed, Berta and the Inkling each drew and discarded a land (no counter for it), and Berta's increment counter stands");
}
{
  /* A creature pays {1} or one mana of its OWN color: Sun-Dappled Celebrant ({4}{W}{W}) is offered -- the white creature and
     the Plains' {W} could pay {W}{W} -- but five green creatures with the {W} cannot: the fifth has nothing left it may pay. */
  const s = play("colors", [at(0, "battlefield", "Plains", "White Pal", "Bear", "Wolf", "Elk", "Cat", "Lynx"), at(0, "hand", "Sun-Dappled Celebrant")], [{tap: "Plains"}]);
  applyAction(s, 0, convokeOffer(s, "Sun-Dappled Celebrant"));
  assert.throws(() => resolveAwaiting(s, pick(s, ["Bear", "Wolf", "Elk", "Cat", "Lynx"])), /cannot pay for Sun-Dappled Celebrant/); checks += 1;
  applyAction(s, 0, convokeOffer(s, "Sun-Dappled Celebrant"));
  resolveAwaiting(s, pick(s, ["White Pal", "Bear", "Wolf", "Elk", "Cat"]));
  eq([s.stack.length, s.players[0].manaPool.W, tapped(s, "Lynx")], [1, 0, false], "with the white one among them it is cast, and the Lynx stays untapped");
}
{
  /* Named outright, a creature Rob does not control is refused too. */
  const s = play("not Rob's", [at(0, "battlefield", "Plains", "Bear", "Wolf", "Elk"), at(0, "hand", "Appeal to Eirdu"), at(1, "battlefield", "Wolf")], [{tap: "Plains"}]);
  const offer = {...convokeOffer(s, "Appeal to Eirdu"), targets: [[{kind: "object", id: named(s, "Bear")[0]}]]};
  const mayas = Object.values(s.objects).find((o) => o.card === "Wolf" && o.controller === 1).id;
  assert.throws(() => applyAction(s, 0, {...offer, convokeTap: [named(s, "Bear")[0], named(s, "Elk")[0], mayas]}), /not untapped creatures you control/); checks += 1;
}

/* ---- a commander's tax is part of the total cost ---- */
{
  /* Convoke Lord ({3}{G}) from the command zone, cast once before: {2} more. A Forest and five creatures pay {5}{G}. */
  const s = play("tax", [at(0, "command", "Convoke Lord"), at(0, "battlefield", "Forest", "Bear", "Wolf", "Elk", "White Pal"), sick(0, "battlefield", "Bear")], [{tap: "Forest"}]);
  const lord = Object.values(s.objects).find((o) => o.card === "Convoke Lord").id;
  recordCommanderCast(s, 0, lord);
  const offer = convokeOffer(s, "Convoke Lord");
  ok(offer, "with its tax of {2}, the Forest and five creatures can pay it");
  applyAction(s, 0, offer);
  eq(awaitingChoice(s).max, 5, "five creatures may help: {3} and its {2} of tax");
  const all = awaitingChoice(s).options.map((o) => o.index);
  resolveAwaiting(s, all);
  eq([s.stack.length, s.objects[s.stack[0].objectId].card], [1, "Convoke Lord"], "cast, its tax paid by creatures");
}

/* ---- the house pilot never convokes ---- */
{
  /* Only the convoke offer casts Sun-Dappled Celebrant here: the pilot leaves it, as it plays what the pool or its lands pay. */
  const s = play("pilot", [at(0, "battlefield", "Plains", "Plains", "Bear", "Wolf", "Cat", "Elk"), at(0, "hand", "Sun-Dappled Celebrant")], [{tap: "Plains"}, {tap: "Plains"}]);
  const actions = legalActions(s, 0);
  ok(actions.some((a) => a.convoke === true), "the convoke offer is there");
  const chosen = housePilot({seat: 0, cards: (name) => (name === "Sun-Dappled Celebrant" ? {manaValue: 6, types: ["Creature"], power: 5, toughness: 6} : null)}).choose(projectFor(s, 0), actions);
  ok(!(chosen.kind === "cast" && chosen.convoke === true), "and the house pilot does not take it");
}

/* ---- named: {X} is not convoked ---- */
{
  const s = play("x", [at(0, "battlefield", "Forest", "Bear", "Wolf"), at(0, "hand", "X Convoke")], [{tap: "Forest"}]);
  eq([offers(s, "X Convoke").length > 0, offers(s, "X Convoke").some((a) => a.convoke === true)], [true, false], "a spell with {X} is cast from the pool, never convoked");
}

console.log(`engine-convoke: ${checks} checks passed -- convoke (CR 702.51): offered beside the pool's cast, the creatures picked, summoning-sick ones too, a commander's tax among what they pay, a pick that cannot pay refused before anything moves, and one that leaves the pool more than one way followed by which mana pays (X8b), at four players too.`);
