/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* "WHEN YOU CYCLE THIS CARD" (Rob's Priority Batch 10.3, its twenty-seventh slice: Shark Typhoon, the 102nd card of Rob's
 * list).
 *
 * CR 702.29a: cycling is an ability of the card in its owner's hand -- pay the cost and discard the card, and draw a card.
 * 702.29c: "when you cycle this card" triggers when this card is discarded to pay a cycling cost, and works from the zone the
 * card went to. 702.29d: "cycles or discards" triggers once for a cycle. 702.29f: typecycling is cycling.
 *
 * A cycling ability says so (`cycling: true`, cards/index.mjs, which holds every definition to it), and its discard is the
 * card being cycled (rules/actions.mjs): the event carries `cycled`, and the X paid ("Cycling {X}{1}{U}"). The `cycled`
 * trigger (rules/trigger.mjs) is "this card" (`who: "self"`) -- collected from where the card went, alone -- or "a card"
 * (`who: "any"`), a permanent's, `cycler` you, opponent or any. A hand ability with {X} is offered once for each X the pool
 * can pay.
 *
 * The card scenarios play the cards (Shark Typhoon, Agonasaur Rex, Vizier of Tumbling Sands, Fractured Sanity, Escape
 * Protocol). This suite holds the edges: whose card and whose cycle, a discard that is not a cycle, "cycles or discards"
 * once, the X, the compiler, and the catalog.
 */
import assert from "node:assert/strict";
import {legalActions} from "../game/engine/rules/actions.mjs";
import {compileScript} from "../game/engine/cards/index.mjs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {missingFor} from "../game/tools/engine-constructs.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const at = (seat, zone, ...cards) => ({seat, zone, cards});
const later = (seat, zone, ...cards) => ({seat, zone, cards, sick: true});
/* A fixture's abilities as a card script says them, compiled (cards/index.mjs) -- a trigger's words become the event it waits for. */
const compiled = (name, identity, abilities, more = {}) => {
  const {definition, problems} = compileScript({schema: "CrankCardScript@1", identity: {name, oracleId: "00000000-0000-4000-8000-000000000000", ...identity},
    oracleText: abilities.map((a) => a.text).join("\n"), source: "hand", abilities, ...more});
  assert.deepEqual(problems, [], `${name} compiles`);
  return definition;
};
const watcher = (name, trigger) => compiled(name, {types: ["Enchantment"], manaCost: "{1}", colors: []},
  [{kind: "triggered", text: "Whenever a card is cycled, you gain 1 life.", trigger, effects: [{effect: "gainLife", amount: 1}]}]);
const FIX = {
  Bear: {types: ["Creature"], subtypes: ["Bear"], manaCost: "{1}{G}", colors: ["G"], power: 2, toughness: 2},
  /* "Whenever you cycle a card" (Escape Protocol's), "whenever an opponent cycles a card", "whenever a player cycles a card". */
  "Your Watcher": watcher("Your Watcher", {on: "cycled", who: "any", cycler: "you"}),
  "Rival Watcher": watcher("Rival Watcher", {on: "cycled", who: "any", cycler: "opponent"}),
  "Any Watcher": watcher("Any Watcher", {on: "cycled", who: "any", cycler: "any"}),
  /* A discard to pay a cost that is not cycling: "{1}, Discard this card: Draw a card." */
  Lesson: compiled("Lesson", {types: ["Sorcery"], manaCost: "{2}{U}", colors: ["U"]}, [{kind: "spell", text: "Draw two cards.", targets: [], effects: [{effect: "draw", count: 2}]},
    {kind: "activated", text: "{1}, Discard this card: Draw a card.", zone: "hand", cost: [{atom: "mana", cost: "{1}"}, {atom: "discard", self: true}], effects: [{effect: "draw", count: 1}]}]),
};
const play = (setup, steps, more = {}) => runScenario({name: "cycling", setup, steps, ...more}, index.definition, FIX).state;
const life = (s) => s.players.map((p) => p.life);

/* ---- whose cycle, and whose card ---- */
{
  const setup = [at(0, "battlefield", "Your Watcher", "Rival Watcher", "Any Watcher", "Island", "Wastes"), at(0, "hand", "Fractured Sanity")];
  const s = play(setup, [{tap: "Island"}, {tap: "Wastes"}, {activate: "Fractured Sanity"}, {answer: [0, 1, 2]}, {resolve: true}, {resolve: true}, {resolve: true}, {resolve: true}],
    {library: ["Forest"]});
  eq(life(s), [42, 40], "Rob cycles: Rob's \"whenever you cycle\" and \"whenever a player cycles\" trigger, \"whenever an opponent cycles\" does not");
}
{
  const setup = [at(0, "battlefield", "Your Watcher", "Rival Watcher", "Any Watcher"), later(1, "battlefield", "Island", "Wastes"), at(1, "hand", "Fractured Sanity")];
  const s = play(setup, [{to: {turn: 2, phase: "MAIN1"}}, {tap: "Island", seat: 1}, {tap: "Wastes", seat: 1}, {activate: "Fractured Sanity", seat: 1}, {answer: [0, 1]},
    {settle: true}], {library: ["Forest", "Plains"]});
  eq(life(s), [42, 40], "Maya cycles: Rob's \"whenever an opponent cycles\" and \"whenever a player cycles\" trigger, \"whenever you cycle\" does not");
}
{
  /* "When you cycle this card" is the cycled card's alone: a Shark Typhoon on the battlefield does not make a Shark when Rob
     cycles another card -- its own cycle trigger is about itself (CR 702.29c). */
  const setup = [at(0, "battlefield", "Shark Typhoon", "Island", "Wastes"), at(0, "hand", "Fractured Sanity")];
  const s = play(setup, [{tap: "Island"}, {tap: "Wastes"}, {activate: "Fractured Sanity"}], {library: ["Forest"]});
  eq(s.stack.map((e) => [e.kind, e.name, e.abilityId]), [["ability", "Fractured Sanity", "a1"], ["trigger", "Fractured Sanity", "a2"]],
    "Rob cycles Fractured Sanity: the cycling ability, and above it the card's own trigger -- nothing of the Shark Typhoon's");
  eq(s.objects[s.stack[1].cardId]?.zone, "graveyard", "the trigger's source is the card where it wound up, the graveyard (CR 702.29c)");
}
{
  /* From where it went, only "when you cycle this card": Archfiend of Ifnir cycled is in the graveyard, where its "whenever
     you cycle or discard another card" does not work (CR 113.6). */
  const setup = [at(0, "battlefield", "Island", "Wastes"), at(0, "hand", "Archfiend of Ifnir"), later(1, "battlefield", "Bear")];
  const s = play(setup, [{tap: "Island"}, {tap: "Wastes"}, {activate: "Archfiend of Ifnir"}], {library: ["Forest"]});
  eq(s.stack.map((e) => [e.kind, e.name]), [["ability", "Archfiend of Ifnir"]], "Rob cycles Archfiend of Ifnir: its cycling ability alone, no trigger of its own from the graveyard");
}
{
  /* A discard that pays a cost but is not cycling is a discard, not a cycle: "whenever you discard" sees it, "whenever you
     cycle" does not. */
  const setup = [at(0, "battlefield", "Your Watcher", "Archfiend of Ifnir", "Wastes"), at(0, "hand", "Lesson"), later(1, "battlefield", "Bear")];
  const s = play(setup, [{tap: "Wastes"}, {activate: "Lesson"}, {settle: true}], {library: ["Forest"]});
  eq([life(s)[0], s.objects[Object.values(s.objects).find((o) => o.card === "Bear" && o.zone === "battlefield").id].counters?.["-1/-1"]], [40, 1],
    "Rob discards Lesson to pay its cost: the Archfiend's \"cycle or discard\" triggers; \"whenever you cycle\" does not");
}
{
  /* "Whenever you cycle or discard another card" triggers once for a cycle (CR 702.29d). */
  const setup = [at(0, "battlefield", "Archfiend of Ifnir", "Island", "Wastes"), at(0, "hand", "Fractured Sanity"), later(1, "battlefield", "Bear")];
  const s = play(setup, [{tap: "Island"}, {tap: "Wastes"}, {activate: "Fractured Sanity"}, {answer: [0, 1]}, {settle: true}], {library: ["Forest"]});
  const bear = Object.values(s.objects).find((o) => o.card === "Bear" && o.zone === "battlefield");
  eq(bear.counters?.["-1/-1"], 1, "Rob cycles Fractured Sanity: the Archfiend of Ifnir puts one -1/-1 counter on Maya's Bear, not two (CR 702.29d)");
}
{
  /* Typecycling is cycling (CR 702.29f). */
  const setup = [at(0, "battlefield", "Your Watcher", "Wastes"), at(0, "hand", "Ash Barrens")];
  const s = play(setup, [{tap: "Wastes"}, {activate: "Ash Barrens"}, {resolve: true}, {resolve: true}, {choose: ["Forest"]}], {library: ["Forest", "Island"]});
  eq(life(s)[0], 41, "Rob basic-landcycles Ash Barrens: \"whenever you cycle a card\" triggers");
}

/* ---- the X paid ---- */
{
  const setup = [at(0, "battlefield", "Island", "Wastes", "Wastes", "Wastes"), at(0, "hand", "Shark Typhoon")];
  const tapped = play(setup, [{tap: "Island"}, {tap: "Wastes"}, {tap: "Wastes"}, {tap: "Wastes"}], {library: ["Forest"]});
  const cycles = legalActions(tapped, 0).filter((a) => a.kind === "activate" && a.label === "Shark Typhoon");
  eq(cycles.map((a) => a.x), [0, 1, 2], "four mana for {X}{1}{U}: the cycling is offered with X of 0, 1 and 2");
  const zero = [{tap: "Island"}, {tap: "Wastes"}, {activate: "Shark Typhoon", x: 0}];
  eq(play(setup, zero, {library: ["Forest"]}).stack.map((e) => e.x), [0, 0], "X of 0 is an X: the cycling ability and its trigger carry 0");
  eq(Object.values(play(setup, [...zero, {resolve: true}], {library: ["Forest"]}).objects).filter((o) => o.card === "Shark" && o.zone === "battlefield").length, 0,
    "and the 0/0 Shark is gone as state-based actions are checked");
  const three = play([at(0, "battlefield", "Island", "Wastes", "Wastes", "Wastes", "Wastes"), at(0, "hand", "Shark Typhoon")],
    [{tap: "Island"}, {tap: "Wastes"}, {tap: "Wastes"}, {tap: "Wastes"}, {tap: "Wastes"}, {activate: "Shark Typhoon", x: 3}], {library: ["Forest"]});
  eq(three.stack.map((e) => e.x), [3, 3], "X of 3: the cycling ability and its trigger both carry it");
  const plain = play([at(0, "battlefield", "Island", "Wastes"), at(0, "hand", "Fractured Sanity")], [{tap: "Island"}, {tap: "Wastes"}, {activate: "Fractured Sanity"}], {library: ["Forest"]});
  eq(plain.stack.map((e) => e.x ?? null), [null, null], "a cycling cost without X: no X anywhere");
}

/* ---- the compiler ---- */
{
  const script = (abilities, text = "Cycling {2}") => ({schema: "CrankCardScript@1", identity: {name: "Test", oracleId: "00000000-0000-4000-8000-000000000000", types: ["Sorcery"],
    manaCost: "{1}", colors: []}, oracleText: text, source: "hand", abilities: [{kind: "spell", text: "Draw a card.", targets: [], effects: [{effect: "draw", count: 1}]}, ...abilities]});
  const cycling = (more = {}) => ({kind: "activated", text: "Cycling {2}", zone: "hand", cycling: true, cost: [{atom: "mana", cost: "{2}"}, {atom: "discard", self: true}],
    effects: [{effect: "draw", count: 1}], ...more});
  const trigger = (t) => ({kind: "triggered", text: "When you cycle this card, draw a card.", trigger: t, effects: [{effect: "draw", count: 1}]});
  eq(compileScript(script([cycling(), trigger({on: "cycled", who: "self"})])).problems, [], "a cycling ability and \"when you cycle this card\"");
  eq(compileScript(script([cycling(), trigger({on: "cycled", who: "any", cycler: "opponent"})])).problems, [], "\"whenever an opponent cycles a card\"");
  ok(compileScript(script([cycling(), trigger({on: "cycled", who: "another"})])).problems.length > 0, "a cycle trigger is about this card or any card");
  ok(compileScript(script([cycling(), trigger({on: "cycled", who: "any", filter: {types: ["Creature"]}})])).problems.length > 0,
    "not yet \"whenever you cycle a creature card\": a filter is a problem, not ignored");
  ok(compileScript(script([cycling({cycling: undefined})])).problems.some((p) => p.includes("cycling: true")), "a cycling ability that does not say so is a problem");
  ok(compileScript(script([cycling({text: "Basic landcycling {2}", cycling: undefined})])).problems.some((p) => p.includes("cycling: true")), "typecycling too (CR 702.29f)");
  ok(compileScript(script([cycling({text: "{2}, Discard this card: Draw a card."})])).problems.some((p) => p.includes("cycling: true")), "and an ability not named cycling is not one");
  ok(compileScript(script([cycling({zone: undefined})])).problems.some((p) => p.includes("CR 702.29a")), "cycling is an ability of the card in hand");
  ok(compileScript(script([cycling({cost: [{atom: "mana", cost: "{2}"}]})])).problems.some((p) => p.includes("CR 702.29a")), "its cost discards the card");
}

eq(missingFor({triggers: ["Cycled"], keywords: ["Cycling"]}), [], "the catalog credits the trigger (Forge's Cycled)");
for (const name of ["Shark Typhoon", "Agonasaur Rex", "Vizier of Tumbling Sands", "Fractured Sanity", "Escape Protocol"]) ok(index.resolve(name)?.playable === true, `${name} is defined and playable`);

console.log(`engine-cycle-triggers: ${checks} checks passed -- "when you cycle this card" from where it went, "whenever you cycle a card" for you, an opponent or anyone; a discard that is not a cycle; "cycles or discards" once; typecycling; the X; the compiler; the catalog.`);
