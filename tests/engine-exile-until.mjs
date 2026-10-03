/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* EXILE UNTIL THIS LEAVES THE BATTLEFIELD (the plan's X5, D5 Shadrix Aristocrats: Ossification; X5k).
 *
 * "When this Aura enters, exile target creature or planeswalker an opponent controls until this Aura leaves the
 * battlefield." A one-shot effect that moves an object "until" an event creates, immediately after that event, a second
 * one that returns it (CR 610.3) -- not a trigger: nothing goes on the stack, and nothing can respond in between. It
 * returns under its owner's control (610.3c) as a new object (CR 400.7). If the event happens first -- the Aura gone
 * before its trigger resolves -- nothing is exiled at all (610.3b). The engine links each card exiled to its source as it
 * was on the battlefield (script/effects/zones.mjs, exileUntil), and every departure from the battlefield returns what
 * its permanent exiled: an effect moving it, an Aura falling off, a creature dying, a player leaving the game (rules/sba.mjs).
 */
import assert from "node:assert/strict";
import {checkStateBasedActions, concede} from "../game/engine/rules/sba.mjs";
import {moveOne} from "../game/engine/script/effects/zones.mjs";
import {validateScript} from "../game/engine/script/schema.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";
import {compileScript} from "../game/engine/cards/index.mjs";
import {summoningSick} from "../game/engine/keywords/timing.mjs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const OS = "Ossification";
const BEAR = {types: ["Creature"], subtypes: ["Bear"], manaCost: "{1}{G}", colors: ["G"], power: 2, toughness: 2};
/* A creature that does it too ("Banisher Priest"): its departure is a death, a state-based action. */
const BANISHER = compileScript({schema: "CrankCardScript@1", identity: {name: "Banisher", oracleId: "00000000-0000-4000-8000-000000000001", types: ["Creature"], manaCost: "{1}{W}{W}", colors: ["W"], power: 2, toughness: 2},
  oracleText: "When this creature enters, exile target creature an opponent controls until this creature leaves the battlefield.", source: "hand",
  abilities: [{kind: "triggered", text: "When this creature enters, exile target creature an opponent controls until this creature leaves the battlefield.", trigger: {on: "enters"},
    targets: [{what: "permanent", types: ["Creature"], controller: "opponent"}], effects: [{effect: "exileUntil", targets: {target: 0}, until: "this leaves"}]}]});
const FIX = {Bear: BEAR, Banisher: BANISHER.definition};
const at = (seat, zone, ...cards) => ({seat, zone, cards});
const play = (name, setup, steps, more = {}) => runScenario({name, setup, steps, ...more}, index.definition, FIX).state;
const named = (s, card, zone = "battlefield") => [s.zones[zone]].flat(2).filter((id) => s.objects[id]?.card === card);
const ENTER = [{tap: "Plains"}, {tap: "Wastes"}, {cast: OS, targets: [{card: "Island", seat: 0}]}, {resolve: true}, {choose: ["Bear"]}, {resolve: true}];
const exiling = (more = {}, setup = []) => play("Ossification", [at(0, "battlefield", "Plains", "Wastes", "Island"), at(0, "hand", OS), at(1, "battlefield", "Bear"), ...setup], ENTER, more);

{
  /* Exiled, linked to the Aura as it is on the battlefield; destroyed by an effect, and the Bear is back -- a new object,
     Maya's, summoning sick. */
  const s = exiling();
  const [aura] = named(s, OS), [bear] = named(s, "Bear", "exile");
  eq([named(s, "Bear").length, s.exiledUntil], [0, [{source: aura, exiled: bear}]], "the Bear is in exile, linked to the Ossification that exiled it");
  const events = [];
  moveOne(s, aura, "graveyard", events);
  const [back] = named(s, "Bear");
  eq([s.objects[back]?.controller, s.zones.exile.length, s.exiledUntil], [1, 0, []], "Ossification destroyed: the Bear is back, under Maya's control, at once");
  ok(back !== bear && summoningSick(s, back), "a new object (CR 400.7): summoning sick");
  eq(events.map((e) => [e.data.fields.from.zoneType, e.data.fields.to.zoneType]), [["Battlefield", "Graveyard"], ["Exile", "Battlefield"]], "the return immediately after the departure, nothing between");
}
{
  /* Its owner's control (CR 610.3c): a Bear of Maya's that Trey controlled when Rob exiled it comes back to Maya. */
  const s = play("stolen", [at(0, "battlefield", "Plains", "Wastes", "Island"), at(0, "hand", OS), at(2, "battlefield", "Bear")],
    [{tap: "Plains"}, {tap: "Wastes"}, {cast: OS, targets: [{card: "Island", seat: 0}]}, {resolve: true}, {choose: ["Bear"]}, {resolve: true}], {seats: 3});
  const [aura] = named(s, OS);
  /* Trey's Bear, owned by Maya: as if Trey had taken it before Rob exiled it. */
  const [bear] = named(s, "Bear", "exile");
  s.objects[bear].owner = 1;
  moveOne(s, aura, "hand", []);
  const [back] = named(s, "Bear");
  eq([s.objects[back]?.controller, s.objects[back]?.owner], [1, 1], "returned to the hand, Ossification lets go of Trey's Bear, and it comes back under Maya's control, its owner's");
}
{
  /* The land it enchants destroyed: Ossification is put into the graveyard by a state-based action (CR 704.5m), and the
     Bear is back. */
  const s = exiling();
  const [island] = named(s, "Island");
  moveOne(s, island, "graveyard", []);
  ok(named(s, OS).length === 1 && named(s, "Bear").length === 0, "the Island gone, Ossification is still there until the state-based actions");
  checkStateBasedActions(s);
  eq([named(s, OS).length, named(s, OS, "graveyard").length, named(s, "Bear").length], [0, 1, 1], "then it falls off, and the Bear is back");
  eq(s.zones.graveyard[0].map((id) => s.objects[id].card).sort(), ["Island", OS], "both in Rob's graveyard");
}
{
  /* A creature that does it, dying (CR 704.5g): the Bear is back. */
  const s = play("Banisher", [at(0, "battlefield", "Plains", "Plains", "Wastes"), at(0, "hand", "Banisher"), at(1, "battlefield", "Bear")],
    [{tap: "Plains"}, {tap: "Plains"}, {tap: "Wastes"}, {cast: "Banisher"}, {resolve: true}, {choose: ["Bear"]}, {resolve: true}]);
  const [banisher] = named(s, "Banisher");
  eq(named(s, "Bear", "exile").length, 1, "the Banisher exiles the Bear");
  s.objects[banisher].damage = 2;
  checkStateBasedActions(s);
  eq([named(s, "Banisher").length, named(s, "Bear").length], [0, 1], "it dies to lethal damage, and the Bear is back");
}
{
  /* Rob leaves the game (CR 800.4a): his Ossification leaves with him, and Maya's Bear is back. */
  const s = exiling({seats: 3});
  concede(s, 0);
  eq([named(s, OS).length, named(s, "Bear").length, s.objects[named(s, "Bear")[0]]?.controller], [0, 1, 1], "Rob concedes: Ossification is gone, and the Bear is back, Maya's");
}
{
  /* Maya leaves the game: her Bear in exile is no longer hers to have back; Ossification leaving later returns nothing. */
  const s = exiling({seats: 3});
  concede(s, 1);
  const [aura] = named(s, OS);
  moveOne(s, aura, "graveyard", []);
  eq([named(s, "Bear").length, s.exiledUntil], [0, []], "Maya gone: when Ossification leaves, nothing comes back");
}
{
  /* A card that has left exile since is a new object, and stays where it went. */
  const s = exiling();
  const [aura] = named(s, OS), [bear] = named(s, "Bear", "exile");
  moveOne(s, bear, "graveyard", []);
  moveOne(s, aura, "graveyard", []);
  eq([named(s, "Bear").length, named(s, "Bear", "graveyard").length], [0, 1], "the Bear moved from exile to Maya's graveyard first: it stays there");
}
{
  /* Ossification gone before its trigger resolves (CR 610.3b): nothing is exiled. */
  const s = play("gone first", [at(0, "battlefield", "Plains", "Wastes", "Island"), at(0, "hand", OS), at(1, "battlefield", "Bear")],
    [{tap: "Plains"}, {tap: "Wastes"}, {cast: OS, targets: [{card: "Island", seat: 0}]}, {resolve: true}, {choose: ["Bear"]}]);
  const [aura] = named(s, OS);
  moveOne(s, aura, "graveyard", []);
  eq([s.stack.length, named(s, "Bear").length], [1, 1], "Ossification destroyed with its trigger on the stack");
  for (let n = 0; n < 4 && s.stack.length; n += 1) passPriority(s);
  eq([s.stack.length, named(s, "Bear").length, named(s, "Bear", "exile").length, s.exiledUntil ?? []], [0, 1, 0, []], "the trigger resolves, and the Bear is not exiled at all");
}
{
  /* Two of them: each lets go of its own. */
  const s = play("two", [at(0, "battlefield", "Plains", "Wastes", "Plains", "Wastes", "Island"), at(0, "hand", OS, OS), at(1, "battlefield", "Bear", "Bear")],
    [{tap: "Plains"}, {tap: "Wastes"}, {cast: OS, targets: [{card: "Island", seat: 0}]}, {resolve: true}, {choose: ["Bear"]}, {resolve: true},
      {tap: "Plains"}, {tap: "Wastes"}, {cast: OS, targets: [{card: "Island", seat: 0}]}, {resolve: true}, {choose: ["Bear"]}, {resolve: true}]);
  const auras = named(s, OS);
  eq([auras.length, named(s, "Bear", "exile").length, s.exiledUntil.length], [2, 2, 2], "two Ossifications, a Bear each");
  moveOne(s, auras[0], "graveyard", []);
  eq([named(s, "Bear").length, named(s, "Bear", "exile").length], [1, 1], "one destroyed: one Bear back, the other still exiled");
}
{
  /* A token exiled ceases to exist (CR 704.5d): nothing to return. */
  const s = exiling();
  const [aura] = named(s, OS), [bear] = named(s, "Bear", "exile");
  s.objects[bear].token = true;
  checkStateBasedActions(s);
  moveOne(s, aura, "graveyard", []);
  eq([named(s, "Bear").length, s.exiledUntil], [0, []], "a token exiled is gone; Ossification leaving returns nothing");
}
{
  /* The schema: the one "until" the engine returns from. */
  const card = (until) => ({schema: "CrankCardScript@1", identity: {name: "Test", oracleId: "00000000-0000-4000-8000-000000000002", types: ["Enchantment"], manaCost: "{W}"}, oracleText: "x", source: "hand",
    abilities: [{kind: "triggered", text: "x", trigger: {on: "enters"}, targets: [{what: "permanent"}], effects: [{effect: "exileUntil", targets: {target: 0}, ...(until ? {until} : {})}]}]});
  eq(validateScript(card("this leaves")).errors, [], "until this leaves: valid");
  ok(validateScript(card("end of turn")).errors.length > 0 && validateScript(card(null)).errors.length > 0, "another until, or none: refused");
}
ok(index.resolve(OS)?.playable === true, `${OS} is defined and playable`);

console.log(`engine-exile-until: ${checks} checks passed -- exiled until its source leaves the battlefield, and back at once under its owner's control as a new object, whichever way it leaves; nothing exiled if it left first; a token or a card gone elsewhere does not come back.`);
