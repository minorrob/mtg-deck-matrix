/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* M4 PHASE 3, BATCH 79 (THE CATALOG'S ORDER): REMEMBERING WHAT AN EFFECT MOVED (Forge's RememberChanged) -- the forms
 * that need no random stream -- and what its cards needed beside it.
 *
 * "The top card of each player's library" and "the top X cards" (moveZone's `fromTop`, every library `who` names, an
 * amount); "each player exiles all creature cards from their graveyard ... then puts all cards they exiled this way onto
 * the battlefield" (moveZoneAll remembers); "you may cast any number of spells from among them" (play's `anyNumber`,
 * asked again after each cast); "you may return another creature you control to its owner's hand" (a permanent chosen as
 * the effect resolves, chooseCard on the battlefield); "exile it, then return it ... if that creature is a Bird, Frog,
 * Otter, or Rat" (a flicker remembers what came back; a condition's `anyOf`); commander ninjutsu (CR 702.49d); and "spells
 * your opponents cast cost {2} more until your next turn" (a cost increase for a while). RememberChanged itself stays
 * uncredited: its random-order, any-order and "exiled with this" forms are not built, and the catalog says so.
 */
import assert from "node:assert/strict";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {advance, awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";
import {legalActions} from "../game/engine/rules/actions.mjs";
import {costIncrease} from "../game/engine/rules/statics.mjs";
import {beginResolution} from "../game/engine/script/resolution.mjs";
import {runEffects} from "../game/engine/script/effects/index.mjs";
import {conditionHolds, conditionProblems} from "../game/engine/script/condition.mjs";
import {isKeyword} from "../game/engine/vocabulary.mjs";
import {compileScript} from "../game/engine/cards/index.mjs";
import {missingFor} from "../game/tools/engine-constructs.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {createRng} from "../game/engine/rng.mjs";

let checks = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const cards = loadCardIndex();
const at = (seat, zone, ...names) => ({seat, zone, cards: names});
const creature = (cost, subtypes, power, more = {}) => ({types: ["Creature"], subtypes, manaCost: cost, colors: ["G"], power, toughness: power, ...more});
const FIX = {Bear: creature("{1}{G}", ["Bear"], 2), Ogre: creature("{2}{R}", ["Ogre"], 3), Elf: creature("{G}", ["Elf"], 1), Giant: creature("{4}{G}", ["Giant"], 5),
  Rat: creature("{B}", ["Rat"], 1), Rogue: creature("{1}{B}", ["Rogue"], 2), Spark: {types: ["Instant"], manaCost: "{R}", colors: ["R"]},
  Walker: {types: ["Planeswalker"], subtypes: ["Test"], manaCost: "{3}", colors: []}};
const play = (setup, seats = 2, more = {}) => runScenario({name: "batch 79", seats, setup, steps: [], expect: [], ...more}, cards.definition, FIX).state;
const named = (s, name, zone = "battlefield") => Object.keys(s.objects).map(Number).filter((id) => s.objects[id].card === name && s.objects[id].zone === zone);
const cardsIn = (s, zone, seat) => (zone === "battlefield" || zone === "exile" ? s.zones[zone].filter((id) => s.objects[id].owner === seat) : s.zones[zone][seat]).map((id) => s.objects[id].card).sort();
const rng = createRng("batch 79");
const answer = (s, labels) => {
  const choice = awaitingChoice(s);
  return resolveAwaiting(s, labels.map((label) => { const o = choice.options.find((x) => x.label === label); assert.ok(o, `no option ${label}`); return o.index; }), null, rng);
};

/* ---- the top of each library, an amount of them ---- */
{
  /* Three seats: "exile the top X cards of each player's library" with X = 2 -- every library, two each -- and what moved,
     remembered, all of it ("put them into their owners' graveyards"). */
  const s = play([], 3, {library: ["Ogre", "Elf", "Bear", "Giant"]});
  /* The first player drew on turn 1 (three players, CR 103.8a), so each library's top two are read as they are now. */
  const before = [0, 1, 2].map((seat) => [s.zones.library[seat].slice(0, 2).map((id) => s.objects[id].card).sort(), s.zones.library[seat].length - 2]);
  beginResolution(s, [{effect: "moveZone", fromTop: "X", who: "each", to: "exile", remember: true}, {effect: "moveZone", targets: "remembered", to: "graveyard"}], {controller: 0, x: 2});
  eq([0, 1, 2].map((seat) => [cardsIn(s, "graveyard", seat), s.zones.library[seat].length]), before,
    "the top X of each of three libraries, X = 2, remembered: each owner's two in its own graveyard");
  eq(before.map(([top]) => top.length), [2, 2, 2], "two from each");
  eq(s.zones.exile.length, 0, "and nothing left in exile");
}
{
  /* "That player": one library only. */
  const s = play([], 3, {library: ["Ogre"]});
  const sizes = [0, 1, 2].map((seat) => s.zones.library[seat].length);
  runEffects(s, [{effect: "moveZone", fromTop: 1, who: [2], to: "exile"}], {controller: 0});
  eq([0, 1, 2].map((seat) => sizes[seat] - s.zones.library[seat].length), [0, 0, 1], "one player named: only that library");
}

/* ---- every one a selector fits, remembered (Living Death) ---- */
{
  /* Three seats: each graveyard's creature cards exiled at once, then put onto the battlefield -- each under its owner. */
  const s = play([at(0, "graveyard", "Ogre", "Forest"), at(1, "graveyard", "Giant"), at(2, "graveyard", "Elf", "Bear")], 3);
  const context = {controller: 1};
  runEffects(s, [{effect: "moveZoneAll", selector: {what: "card", zone: "graveyard", types: ["Creature"]}, to: "exile", remember: true}], context);
  eq(context.remembered.map((id) => [s.objects[id].card, s.objects[id].zone]).sort(), [["Bear", "exile"], ["Elf", "exile"], ["Giant", "exile"], ["Ogre", "exile"]],
    "moveZoneAll remembers every card it moved, as the cards in exile they became");
  runEffects(s, [{effect: "moveZone", targets: context.remembered, to: "battlefield"}], context);
  eq([0, 1, 2].map((seat) => s.zones.battlefield.filter((id) => s.objects[id].controller === seat).map((id) => s.objects[id].card).sort()),
    [["Ogre"], ["Giant"], ["Bear", "Elf"]], "and back, each under its owner's control, whoever's effect it was");
  eq(cardsIn(s, "graveyard", 0), ["Forest"], "the land in the graveyard was never moved");
  const quiet = {controller: 0};
  runEffects(s, [{effect: "moveZoneAll", selector: {what: "card", zone: "graveyard", types: ["Creature"]}, to: "exile"}], quiet);
  eq(quiet.remembered, undefined, "without `remember`, nothing is remembered");
}

/* ---- any number of spells, asked again (Etali, Villainous Wealth) ---- */
{
  const s = play([at(0, "exile", "Ogre", "Elf", "Giant", "Forest")]);
  const pool = ["Ogre", "Elf", "Giant", "Forest"].map((name) => named(s, name, "exile")[0]);
  beginResolution(s, [{effect: "play", from: "targets", targets: pool, free: true, anyNumber: true, manaValueAtMost: 3}], {controller: 0});
  const first = awaitingChoice(s);
  eq([first.title, first.options.map((o) => o.label).sort()], ["Cast a spell?", ["Don't cast", "Elf", "Ogre"]], "first: what can be cast, at most mana value 3 -- not the Giant (5), not the land");
  answer(s, ["Ogre"]);
  const second = awaitingChoice(s);
  eq([second.title, second.options.map((o) => o.label).sort(), second.id !== first.id], ["Cast another spell?", ["Don't cast", "Elf"], true],
    "then asked again, of what is left, as a question of its own");
  answer(s, ["Elf"]);
  eq([s.awaiting, s.resolving, s.stack.map((e) => s.objects[e.objectId].card)], [null, null, ["Ogre", "Elf"]],
    "nothing left that may be cast: not asked again, and both are on the stack, the last on top");
}
{
  /* Without `anyNumber`, one spell and done (Mind's Dilation, Descendants' Path). */
  const s = play([at(0, "exile", "Ogre", "Elf")]);
  beginResolution(s, [{effect: "play", from: "targets", targets: [named(s, "Ogre", "exile")[0], named(s, "Elf", "exile")[0]], free: true}], {controller: 0});
  answer(s, ["Ogre"]);
  eq([s.awaiting, s.stack.length], [null, 1], "one cast, and the question is not asked again");
}

/* ---- a permanent chosen as the effect resolves (Temur Sabertooth) ---- */
{
  const s = play([at(0, "battlefield", "Temur Sabertooth", "Elf"), at(1, "battlefield", "Bear")]);
  const sabertooth = named(s, "Temur Sabertooth")[0], bear = named(s, "Bear")[0];
  s.objects[bear].controller = 0;
  beginResolution(s, [{effect: "chooseCard", zone: "battlefield", selector: {types: ["Creature"], controller: "you", another: true}, to: "hand", remember: true}], {controller: 0, source: sabertooth});
  const asked = awaitingChoice(s);
  eq([asked.title, asked.min, asked.options.map((o) => o.label).sort()], ["Choose a permanent", 1, ["Bear", "Elf"]],
    "not a search: a creature he controls must be chosen, not this one, and Maya's Bear he controls is one");
  answer(s, ["Bear"]);
  eq([cardsIn(s, "hand", 1), cardsIn(s, "hand", 0)], [["Bear"], []], "the stolen Bear goes to its owner's hand");
}
{
  const s = play([at(0, "battlefield", "Temur Sabertooth"), at(1, "battlefield", "Bear")]);
  beginResolution(s, [{effect: "chooseCard", zone: "battlefield", selector: {types: ["Creature"], controller: "you", another: true}, to: "hand"}], {controller: 0, source: named(s, "Temur Sabertooth")[0]});
  eq([s.awaiting, s.resolving], [null, null], "none of his own but this one: nothing to choose, nobody asked");
}

/* ---- a flicker remembers what came back (Splash Portal) ---- */
{
  const s = play([at(0, "battlefield", "Rat", "Bear")]);
  const rat = named(s, "Rat")[0], bear = named(s, "Bear")[0];
  const now = {controller: 0};
  runEffects(s, [{effect: "moveZone", targets: [rat], to: "exile", andReturn: true, remember: true}], now);
  eq(now.remembered.map((id) => [s.objects[id].card, s.objects[id].zone, id !== rat]), [["Rat", "battlefield", true]], "returned at once: what is remembered is the creature that came back, a new object");
  const later = {controller: 0};
  runEffects(s, [{effect: "moveZone", targets: [bear], to: "exile", andReturn: "end step", remember: true}], later);
  eq(later.remembered.map((id) => [s.objects[id].card, s.objects[id].zone]), [["Bear", "exile"]], "returned at the end step: the card in exile, until then");
}
{
  /* A flicker that does not remember leaves what an earlier effect remembered alone. */
  const s = play([at(0, "battlefield", "Rat", "Bear")]);
  const context = {controller: 0, remembered: [named(s, "Bear")[0]]};
  runEffects(s, [{effect: "moveZone", targets: [named(s, "Rat")[0]], to: "exile", andReturn: true}], context);
  eq(context.remembered.map((id) => s.objects[id].card), ["Bear"], "a flicker without `remember`: the Bear an earlier effect remembered is still what is remembered");
}

/* ---- a condition's `anyOf` ---- */
{
  const s = play([at(0, "battlefield", "Rat", "Bear")]);
  const rat = named(s, "Rat")[0], bear = named(s, "Bear")[0];
  const either = {about: "remembered", is: {types: ["Creature"], anyOf: [{subtypes: ["Bird"]}, {subtypes: ["Frog"]}, {subtypes: ["Otter"]}, {subtypes: ["Rat"]}]}};
  eq([conditionHolds(s, either, {controller: 0, remembered: [rat]}), conditionHolds(s, either, {controller: 0, remembered: [bear]}), conditionHolds(s, either, {controller: 0, remembered: []})],
    [true, false, false], "a Bird, Frog, Otter or Rat: the Rat is one, the Bear is not, nothing is not");
  eq(conditionHolds(s, {about: "remembered", is: {types: ["Land"], anyOf: [{subtypes: ["Rat"]}]}}, {controller: 0, remembered: [rat]}), false, "what the choices share is asked too");
  eq([conditionProblems(either), conditionProblems({about: "remembered", is: {anyOf: []}}).length > 0, conditionProblems({about: "remembered", is: {anyOf: [{subtype: ["Rat"]}]}}).length > 0],
    [[], true, true], "the schema takes a choice, and refuses an empty one or a bad selector in it");
}

/* ---- commander ninjutsu (CR 702.49d) ---- */
{
  eq([isKeyword("commander ninjutsu"), compileScript({schema: "CrankCardScript@1", identity: {name: "T", oracleId: "t", types: ["Creature"], colors: []}, oracleText: "",
    abilities: [{kind: "keyword", text: "Commander ninjutsu {U}", keyword: "commander ninjutsu", cost: [{atom: "mana", cost: "{U}"}]}]}).definition.abilities[0].alsoCommand], [true, true],
  "commander ninjutsu: a keyword, compiled as ninjutsu that also works from the command zone");
  const unblocked = (commander) => runScenario({name: "ninjutsu", setup: [at(0, "command", commander), at(0, "battlefield", "Rogue", "Island", "Swamp")],
    steps: [{attack: ["Rogue"]}, {to: {turn: 1, phase: "COMBAT_DECLARE_BLOCKERS"}}, {tap: "Island"}, {tap: "Swamp"}], expect: []}, cards.definition, FIX).state;
  const offered = (s, name) => legalActions(s, 0).filter((a) => a.kind === "activate" && a.label === name).length;
  eq(offered(unblocked("Yuriko, the Tiger's Shadow"), "Yuriko, the Tiger's Shadow"), 1, "Yuriko, a commander in the command zone: its ninjutsu offered");
  eq(offered(unblocked("Ingenious Infiltrator"), "Ingenious Infiltrator"), 0, "plain ninjutsu, in the command zone: not offered (only from the hand)");
}

/* ---- spells cost more, for a while (Elspeth Conquers Death) ---- */
{
  const s = play([at(1, "hand", "Spark", "Ogre"), at(0, "hand", "Spark")]);
  const [mine] = named(s, "Spark", "hand").filter((id) => s.objects[id].owner === 0), [theirs] = named(s, "Spark", "hand").filter((id) => s.objects[id].owner === 1);
  const ogre = named(s, "Ogre", "hand")[0];
  runEffects(s, [{effect: "effectUntil", rule: "spells-cost-more", affects: {nonTypes: ["Creature"]}, apply: {amount: 2, caster: "opponent"}, until: "your-next-turn"}], {controller: 0, source: null});
  eq([costIncrease(s, 1, theirs), costIncrease(s, 1, ogre), costIncrease(s, 0, mine)], [2, 0, 0], "her noncreature spell costs 2 more; her creature spell, and his own, do not");
  runEffects(s, [{effect: "effectUntil", rule: "spells-cost-more", affects: {}, apply: {amount: 1}, until: "your-next-turn"}], {controller: 0, source: null});
  eq([costIncrease(s, 1, theirs), costIncrease(s, 0, mine)], [3, 1], "a second, anyone's: they add");
  runEffects(s, [{effect: "effectUntil", rule: "spells-cost-more", affects: {}, apply: {amount: 4, caster: "you"}, until: "your-next-turn"}], {controller: 0, source: null});
  eq([costIncrease(s, 1, theirs), costIncrease(s, 0, mine)], [3, 5], "a third, the effect's controller's own spells only: his, not hers");
  for (let n = 0; n < 400 && !(s.turn === 3 && s.phase === "UPKEEP"); n += 1) {
    if (s.awaiting) resolveAwaiting(s, []); else if (s.priorityPlayer === null) advance(s); else if (passPriority(s).outcome === "step-ends") advance(s);
  }
  eq([s.turn, costIncrease(s, 1, theirs), costIncrease(s, 0, mine)], [3, 0, 0], "gone as his next turn begins");
}

/* ---- Elspeth Conquers Death III: a planeswalker card gets a loyalty counter, not a +1/+1 counter ---- */
{
  const s = play([at(0, "graveyard", "Walker", "Bear")]);
  const third = cards.definition("Elspeth Conquers Death").abilities.find((a) => a.trigger?.chapter === 3);
  for (const [name, counters] of [["Walker", {loyalty: 1}], ["Bear", {"+1/+1": 1}]]) {
    beginResolution(s, third.effects, {controller: 0, targets: [{kind: "object", id: named(s, name, "graveyard")[0]}]});
    eq(s.objects[named(s, name)[0]].counters, counters, `III: ${name} returned with ${Object.keys(counters)[0]}`);
  }
}

/* ---- the catalog ---- */
{
  eq(missingFor({options: ["RememberChanged"]}).map((m) => `${m.kind}:${m.name}`), ["option:RememberChanged"],
    "RememberChanged is not credited: its random-order, any-order and \"exiled with this\" forms are not built");
  eq(["Living Death", "Etali, Primal Storm", "Villainous Wealth", "Yuriko, the Tiger's Shadow", "Temur Sabertooth", "Splash Portal", "Spelunking", "Mind's Dilation", "Elspeth Conquers Death"]
    .map((name) => cards.resolve(name)?.playable === true), Array(9).fill(true), "the batch's nine cards are defined and playable");
}

console.log(`engine-moved-this-way: ${checks} checks passed — the top of each library and X of them, every one a selector fits remembered, any number of spells cast, a permanent chosen as it resolves, a flicker's return remembered, a choice in a condition, commander ninjutsu, and a cost increase for a while.`);
