/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* A PLAYER'S PREVENTION SHIELDS (CR 609.7, 615.1, 615.5, 615.8, 616.1): Inkshield's "prevent all combat damage that would be
 * dealt to you this turn. For each 1 damage prevented this way, create a 2/1 ... Inkling", and Deflecting Palm's "the next
 * time a source of your choice would deal damage to you this turn, prevent that damage. If damage is prevented this way,
 * Deflecting Palm deals that much damage to that source's controller".
 *
 * A prevention effect with a duration (effects/permanents.mjs, effectUntil's `rule: "prevent-damage"`) may shield players
 * (`who`), only from sources chosen (`from`, CR 609.7a: script/effects/asking.mjs, chooseSource), be used up by the first
 * damage it prevents (`next`, CR 615.8), and say what follows (`then`, CR 615.5) -- done by its controller, dealt by the
 * card the spell became (`dealer`, rules/stack.mjs), about the damage's source and its controller now, "that much" what it
 * stopped. A shield with more to it than preventing all is ordered with the other effects that apply, by the player dealt
 * the damage (CR 616.1; rules/replacement.mjs): a doubler first doubles what Inkshield turns into Inklings. A permanent
 * spell chosen as the source is followed to the permanent it becomes (CR 609.7a). The scenarios play both cards; this
 * suite holds the order, the source of the damage back, the choices of a source, the shield used up, and the compiler.
 */
import assert from "node:assert/strict";
import {awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {applyReplacements, damageChoicesPossible} from "../game/engine/rules/replacement.mjs";
import {compileScript} from "../game/engine/cards/index.mjs";
import {runFollowUps} from "../game/engine/script/effects/index.mjs";
import {chooseSource} from "../game/engine/script/effects/asking.mjs";
import {housePilot} from "../game/engine/pilots/house-pilot.mjs";
import {randomLegalPilot} from "../game/engine/pilots/random-legal.mjs";
import {projectFor} from "../game/engine/projection.mjs";
import {createRng} from "../game/engine/rng.mjs";
import {validateScript} from "../game/engine/script/schema.mjs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {concede} from "../game/engine/rules/sba.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const at = (seat, zone, ...cards) => ({seat, zone, cards});
const creature = (name, power, more = {}) => ({card: name, types: ["Creature"], subtypes: [], manaCost: "{C}", colors: ["R"], power, toughness: power, ...more});
const FIX = {
  Ogre: creature("Ogre", 4), Bear: creature("Bear", 2, {colors: ["G"]}),
  /* "If a source you control would deal damage to a permanent or player, it deals double that damage instead." */
  Furnace: {types: ["Enchantment"], manaCost: "{C}", colors: ["R"], abilities: [{id: "a0", kind: "replacement", text: "If a source you control would deal damage to a permanent or player, it deals double that damage instead.",
    watches: {event: "damage", source: {controller: "you"}}, change: {multiply: 2}}]},
  /* "Prevent all combat damage that would be dealt this turn" to you: a plain shield of a player's, nothing after it. */
  Haze: {types: ["Instant"], manaCost: "{C}", colors: ["W"], spell: {id: "s", text: "Prevent all combat damage that would be dealt to you this turn.", targets: [],
    effects: [{effect: "effectUntil", rule: "prevent-damage", who: "you", apply: {combat: true}, until: "end-of-turn"}]}},
  Shock: {types: ["Instant"], manaCost: "{R}", colors: ["R"], spell: {id: "s", text: "Shock deals 2 damage to any target.", targets: [{anyOf: [{what: "permanent", types: ["Creature"]}, {what: "player"}]}],
    effects: [{effect: "dealDamage", amount: 2, targets: {target: 0}, who: {target: 0}}]}},
};
const INK = ["Plains", "Swamp", "Wastes", "Wastes", "Wastes"], PALM = ["Mountain", "Plains"];
const cast = (card, lands) => [...lands.map((land) => ({tap: land, seat: 0})), {cast: card, seat: 0}, {resolve: true}];
const play = (setup, steps, seats = 2) => runScenario({name: "shields", seats, at: {turn: 2, phase: "MAIN1"}, setup, steps}, index.definition, FIX).state;
const named = (s, card, seat) => s.zones.battlefield.filter((id) => s.objects[id].card === card && s.objects[id].controller === seat).length;
const shields = (s) => (s.effects ?? []).filter((e) => e.rule === "prevent-damage");

{
  /* Inkshield beside Maya's Furnace: Rob, dealt the damage, chooses which applies first (CR 616.1). The Furnace first
     doubles the Ogre's 4 to 8, all prevented -- eight Inklings; Inkshield first, four, and nothing left to double. */
  const setup = [at(0, "hand", "Inkshield"), at(0, "battlefield", ...INK), at(1, "battlefield", "Ogre", "Furnace")];
  const before = play(setup, [{pass: 1}, ...cast("Inkshield", INK), {attack: ["Ogre"]}, {to: {turn: 2, phase: "COMBAT_DAMAGE"}}]);
  eq([before.awaiting?.kind, before.awaiting?.player], ["order-damage", 0], "Rob is asked which applies first");
  eq(awaitingChoice(before).options.map((o) => o.label).sort(), ["Furnace first: 0 damage, 8 prevented", "Inkshield first: 0 damage, 4 prevented"],
    "each said by what it leads to -- the shield by its card's name");
  eq(shields(before).length, 1, "asking spent nothing: the shield is still there");
  for (const [first, inklings] of [["Furnace", 8], ["Inkshield", 4]]) {
    const s = play(setup, [{pass: 1}, ...cast("Inkshield", INK), {attack: ["Ogre"]}, {to: {turn: 2, phase: "COMBAT_DAMAGE"}}, {choose: [`${first} first: 0 damage, ${inklings} prevented`]}]);
    eq([s.players[0].life, named(s, "Inkling", 0)], [40, inklings], `${first} first: Rob at 40, ${inklings} Inklings`);
  }
  ok(damageChoicesPossible(before), "a shield and a doubler are a choice to be asked");
}
{
  /* A plain shield beside Inkshield: before, it stopped the damage outright, and Inkshield never saw it. Now Rob orders
     them: Inkshield first makes three Inklings; the Haze first, none. */
  const setup = [at(0, "hand", "Inkshield", "Haze"), at(0, "battlefield", ...INK, "Wastes"), at(1, "battlefield", "Bear", "Bear")];
  const steps = [{pass: 1}, ...cast("Inkshield", INK), {pass: 1}, {tap: "Wastes", seat: 0}, {cast: "Haze", seat: 0}, {resolve: true}, {attack: ["Bear"]}, {to: {turn: 2, phase: "COMBAT_DAMAGE"}}];
  const s = play(setup, steps);
  eq(awaitingChoice(s).options.map((o) => o.label).sort(), ["Haze first: 0 damage", "Inkshield first: 0 damage, 2 prevented"], "the plain shield is ordered with it");
  resolveAwaiting(s, [awaitingChoice(s).options.find((o) => o.label.startsWith("Inkshield")).index]);
  eq(named(s, "Inkling", 0), 2, "Inkshield first: two Inklings");
  const t = play(setup, [...steps, {choose: ["Haze first: 0 damage"]}]);
  eq([t.players[0].life, named(t, "Inkling", 0)], [40, 0], "the Haze first: nothing left for Inkshield to prevent, and no Inkling");
  /* Alone, a plain shield is what it was: no question, the damage stopped. */
  const u = play([at(0, "hand", "Haze"), at(0, "battlefield", "Wastes"), at(1, "battlefield", "Bear", "Furnace")],
    [{pass: 1}, {tap: "Wastes", seat: 0}, {cast: "Haze", seat: 0}, {resolve: true}, {attack: ["Bear"]}, {to: {turn: 2, phase: "MAIN2"}}]);
  eq(u.players[0].life, 40, "a plain shield beside a doubler: stopped, and nobody asked");
}
{
  /* Deflecting Palm's damage back: dealt by the Palm, the card it became in Rob's graveyard -- red and white, so Maya's
     protection from red prevents it; without it, 4. */
  const setup = [at(0, "hand", "Deflecting Palm"), at(0, "battlefield", ...PALM), at(1, "battlefield", "Ogre")];
  const steps = [{pass: 1}, ...cast("Deflecting Palm", PALM), {choose: ["Ogre (Maya's)"]}];
  const s = play(setup, steps);
  const shield = shields(s)[0], palm = s.zones.graveyard[0].find((id) => s.objects[id].card === "Deflecting Palm");
  eq([shield.dealer, shield.sources, shield.players, shield.next], [palm, [s.zones.battlefield.find((id) => s.objects[id].card === "Ogre")], [0], true],
    "the shield: dealt by the Palm in Rob's graveyard, from the Ogre, to Rob, the next time");
  const {state: t, events} = runScenario({name: "back", at: {turn: 2, phase: "MAIN1"}, setup, steps: [...steps, {attack: ["Ogre"]}, {to: {turn: 2, phase: "MAIN2"}}]}, index.definition, FIX);
  eq([t.players[0].life, t.players[1].life], [40, 36], "the Ogre's 4 prevented, and 4 to Maya");
  ok(events.some((e) => e.kind === "GameEventPlayerDamaged" && e.data.fields.target.playerId === 1 && e.data.fields.source?.name === "Deflecting Palm"), "dealt by Deflecting Palm");
  const u = play(setup, steps);
  (u.effects ??= []).push({id: "pro-red", rule: "protection", players: [1], from: {colors: ["R"]}, affects: {what: "player"}, apply: {}, until: "end-of-turn", sourceController: 1});
  const {proposal} = applyReplacements(u, {event: "damage", toPlayer: 0, amount: 4, sourceId: u.zones.battlefield.find((id) => u.objects[id].card === "Ogre"), combat: true});
  eq(proposal.prevented, true, "the Ogre's damage to Rob is prevented");
  const before = u.players[1].life;
  runFollowUps(u, proposal);
  eq(u.players[1].life, before, "and Maya, with protection from red, is dealt none of it by the red Palm (CR 702.16e)");
  eq(shields(u).length, 0, "the shield is used up (CR 615.8)");
}
{
  /* Only the source chosen: damage from another is dealt, and the shield waits for its own. And beside Maya's Furnace,
     Rob orders them (CR 616.1): asking spends nothing, and the Furnace first has the Palm prevent, and deal back, 8. */
  const setup = [at(0, "hand", "Deflecting Palm"), at(0, "battlefield", ...PALM), at(1, "battlefield", "Ogre", "Bear", "Furnace")];
  const s = play(setup, [{pass: 1}, ...cast("Deflecting Palm", PALM), {choose: ["Ogre (Maya's)"]}]);
  const bear = s.zones.battlefield.find((id) => s.objects[id].card === "Bear");
  eq([applyReplacements(s, {event: "damage", toPlayer: 0, amount: 2, sourceId: bear, combat: false}).proposal.prevented === true, shields(s).length], [false, 1],
    "the Bear's damage is not the Ogre's: dealt, and the shield still there");
  const t = play(setup, [{pass: 1}, ...cast("Deflecting Palm", PALM), {choose: ["Ogre (Maya's)"]}, {attack: ["Ogre"]}, {to: {turn: 2, phase: "COMBAT_DAMAGE"}}]);
  eq([t.awaiting?.kind, shields(t).length], ["order-damage", 1], "Rob is asked the order, and the shield is not spent by asking");
  resolveAwaiting(t, [awaitingChoice(t).options.find((o) => o.label === "Furnace first: 0 damage, 8 prevented").index]);
  eq([t.players[0].life, t.players[1].life, shields(t).length], [40, 32, 0], "the Ogre's 8 prevented, 8 back to Maya, the shield used up");
  /* Each effect applies once to an event (CR 614.5). */
  const u = play([at(0, "hand", "Inkshield"), at(0, "battlefield", ...INK), at(1, "battlefield", "Ogre", "Furnace")], [{pass: 1}, ...cast("Inkshield", INK)]);
  const {applied} = applyReplacements(u, {event: "damage", toPlayer: 0, amount: 4, sourceId: u.zones.battlefield.find((id) => u.objects[id].card === "Ogre"), combat: true});
  eq(applied.filter((id) => id === shields(u)[0].id).length, 1, "Inkshield applies once");
}
{
  /* "That source's controller" is its controller now: Rob's Bear, which Maya has taken (layer 2), attacks Rob -- the Palm's
     damage goes to Maya, who controls it, not Rob, its owner. */
  const s = play([at(0, "hand", "Deflecting Palm"), at(0, "battlefield", ...PALM, "Bear")], [{pass: 1}, ...cast("Deflecting Palm", PALM), {choose: ["Bear"]}]);
  const bear = s.zones.battlefield.find((id) => s.objects[id].card === "Bear");
  s.effects.push({id: "taken", layer: 2, affects: {ids: [bear]}, apply: {controller: 1}, until: "end-of-turn", sourceController: 1});
  const {proposal} = applyReplacements(s, {event: "damage", toPlayer: 0, amount: 2, sourceId: bear, combat: true});
  runFollowUps(s, proposal);
  eq([s.players[0].life, s.players[1].life], [40, 38], "the Bear's 2 prevented, and 2 to Maya, its controller");
}
{
  /* A shield used up the first time, with nothing after it ("the next time ... prevent that damage"): it prevents once. */
  const s = play([at(1, "battlefield", "Ogre")], []);
  s.effects = [{id: "once", rule: "prevent-damage", players: [0], next: true, apply: {}, until: "end-of-turn", sourceController: 0, name: "Once"}];
  const ogre = s.zones.battlefield.find((id) => s.objects[id].card === "Ogre");
  const hit = () => applyReplacements(s, {event: "damage", toPlayer: 0, amount: 4, sourceId: ogre, combat: true}).proposal;
  eq([hit().prevented === true, shields(s).length, hit().prevented === true], [true, 0, false], "prevented once, used up, and the next damage dealt");
}
{
  /* A permanent spell chosen as the source: the shield applies to the permanent it becomes (CR 609.7a). Maya casts her
     Ogre; Rob, in answer, chooses it as it is on the stack; it resolves, and attacks. */
  const s = play([at(0, "hand", "Deflecting Palm"), at(0, "battlefield", ...PALM), at(1, "battlefield", "Wastes"), at(1, "hand", "Ogre")],
    [{tap: "Wastes", seat: 1}, {cast: "Ogre", seat: 1}, {pass: 1}, ...cast("Deflecting Palm", PALM), {choose: ["Ogre, a spell (Maya's)"]}, {resolve: true}]);
  const ogre = s.zones.battlefield.find((id) => s.objects[id].card === "Ogre");
  eq(shields(s)[0].sources, [ogre], "the shield names the Ogre permanent");
  const {proposal} = applyReplacements(s, {event: "damage", toPlayer: 0, amount: 4, sourceId: ogre, combat: true});
  eq(proposal.prevented, true, "and prevents its damage");
}
{
  /* The choices of a source (CR 609.7a): permanents, spells, what a spell on the stack targets in a graveyard, the source of
     an ability, a commander in the command zone. */
  const s = play([at(0, "hand", "Deflecting Palm"), at(0, "battlefield", ...PALM), at(1, "battlefield", "Mountain"), at(1, "hand", "Shock"), at(1, "command", "Bear")],
    [{tap: "Mountain", seat: 1}, {cast: "Shock", seat: 1, targets: [{player: 0}]}, {pass: 1}, ...cast("Deflecting Palm", PALM)]);
  eq(awaitingChoice(s).options.map((o) => o.label).sort(), ["Bear, in the command zone (Maya's)", "Deflecting Palm, a spell", "Mountain", "Mountain (Maya's)", "Plains", "Shock, a spell (Maya's)"],
    "the permanents, the spells, and Maya's commander");
  /* And what else the stack refers to (CR 609.7a): a card in a graveyard an ability on the stack comes from, a card one
     targets, and the source of a delayed trigger waiting to trigger -- two alike told apart by number. */
  const t = play([at(0, "hand", "Deflecting Palm"), at(0, "battlefield", ...PALM), at(1, "graveyard", "Ogre", "Bear", "Bear")], [{pass: 1}, ...cast("Deflecting Palm", PALM)]);
  const [ogre, bear1, bear2] = t.zones.graveyard[1];
  t.stack.unshift({stackId: 900, abilityId: "a0", objectId: null, cardId: ogre, name: "Ogre", playerId: 1, kind: "trigger", stage: "waiting", targets: [{kind: "object", id: bear1}]});
  (t.delayedTriggers ??= []).push({at: "end step", controller: 1, source: bear2, effects: []});
  chooseSource.open(t, {}, {controller: 0});
  eq(awaitingChoice(t).options.map((o) => o.label).filter((l) => /graveyard/.test(l)).sort(),
    ["Bear, in a graveyard (Maya's) (1)", "Bear, in a graveyard (Maya's) (2)", "Ogre, in a graveyard (Maya's)"], "the Ogre an ability comes from, the Bear it targets, the Bear a delayed trigger waits on");
  /* The pilots answer it with one of the sources. */
  for (const answer of [housePilot({seat: 0}).answer(projectFor(s, 0), awaitingChoice(s)), randomLegalPilot(createRng("palm")).answer(awaitingChoice(s))])
    ok(answer.indices.length === 1 && awaitingChoice(s).options[answer.indices[0]] !== undefined, "a pilot names one source");
  /* Rob leaves the game while asked: the Palm left with him, and no shield is made. */
  concede(s, 0);
  eq(shields(s), [], "its chooser gone, no shield");
}
{
  /* The compiler: what follows a shield's prevention never asks, and only a shield has it; the schema reads inside it. */
  const script = (effects) => ({schema: "CrankCardScript@1", identity: {name: "Test", oracleId: "00000000-0000-4000-8000-000000000000", types: ["Instant"], manaCost: "{W}", colors: ["W"]},
    oracleText: "Prevent all combat damage that would be dealt to you this turn.", source: "hand", abilities: [{kind: "spell", text: "Prevent all combat damage that would be dealt to you this turn.", targets: [], effects}]});
  const shield = (then, rule = "prevent-damage") => [{effect: "effectUntil", rule, who: "you", apply: {combat: true}, then, until: "end-of-turn"}];
  ok(compileScript(script(shield([{effect: "gainLife", amount: 1}]))).ok !== false, "a shield followed by an effect that does not ask compiles");
  const problems = (s) => JSON.stringify(compileScript(s).problems ?? compileScript(s).errors ?? []);
  ok(/follows a prevention/.test(problems(script(shield([{effect: "scry", count: 1}])))), "one that asks is refused");
  ok(/what follows a prevention shield/.test(problems(script(shield([{effect: "gainLife", amount: 1}], "cant-block")))), "and `then` on any other effect");
  ok(validateScript(script(shield([{effect: "noSuchThing"}]))).errors.some((e) => /noSuchThing/.test(e.message)), "the schema reads inside it");
}

console.log(`engine-prevention-shields: ${checks} checks passed -- a player's shields ordered by the player dealt the damage, a doubler first doubling what Inkshield prevents, a plain shield ordered beside one; the Palm's damage back dealt by the card it became, protection read against it; a permanent spell followed to its permanent; the choices of a source; used up once; the compiler`);
