/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* TRAIN D: "LOSES ALL ABILITIES" SWITCHES OFF A PERMANENT'S OWN STATIC ABILITIES AND REPLACEMENT EFFECTS (CR 613.1f).
 *
 *   1. The layers (rules/layers.mjs): a static ability its permanent has lost makes no effect in layers 6 and 7, whatever
 *      the timestamps (CR 613.8a: its effect depends on the one that takes it away); one whose effect began to apply in an
 *      earlier layer carries on (CR 613.6); a permanent whose own ability takes its abilities away keeps that one ability's
 *      effect (Humility made a creature); and a layer-4 change of creature types only (`setCreatureTypes`, CR 205.1a).
 *   2. Every rule a static ability changes, and every replacement effect, is read from a permanent's abilities as they are
 *      after layer 6 (rules/statics.mjs, rules/replacement.mjs, and the readers beside them): each reader, with a permanent
 *      whose static changes it, before and after the permanent loses all its abilities.
 *   3. What it costs: nothing is derived to read a board's rules when no effect takes abilities away, and only the
 *      permanents such an effect can reach are derived when one does.
 *   4. `exchangeControl` (Oko, Thief of Crowns' -5; CR 701.12a-b) and the schema's word on it.
 * The cards' scenarios play the rest: Song of the Dryads, Infinite Coursework, Enchanted River's Grasp, Abigale, Day of
 * Black Sun, Retched Wretch, Vraska, Betrayal's Sting, Ultima, Origin of Oblivion, Oko and Retro-Mutation.
 */
import assert from "node:assert/strict";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {compileScript} from "../game/engine/cards/index.mjs";
import {runEffects} from "../game/engine/script/effects/index.mjs";
import {characteristicsOf, powerOf, toughnessOf, typesOf, subtypesOf, keywordsOf, everyCreatureTypeOf, controllerOf, deriving, deriveMemo, staticAbilities} from "../game/engine/rules/layers.mjs";
import {freeCast, castForbidden, activationForbidden, cantGainLife, tokensCreated, cantBeSacrificed, drawsInstead, lifeGained, countersPlaced, cantAttack,
  defenderLifted, attacksEachCombat, attackTax, cantBeCountered, cantBeBlockedBy, playerStatics, costReduction, costIncrease, proliferateTimes,
  abilityCostIncrease, playerRuleChanged, ruleChanged} from "../game/engine/rules/statics.mjs";
import {applyReplacements, damageChoicesPossible} from "../game/engine/rules/replacement.mjs";
import {protectedFrom} from "../game/engine/rules/protection.mjs";
import {projectFor} from "../game/engine/projection.mjs";
import {playerRuled} from "../game/engine/rules/sba.mjs";
import {compileSelector} from "../game/engine/script/filter.mjs";
import {orderDraws} from "../game/engine/script/effects/asking.mjs";
import {flashbackCost, escapeWays, legalActions} from "../game/engine/rules/actions.mjs";
import {exchangeControl} from "../game/engine/script/effects/permanents.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const creature = (cost, subtypes, p, t, abilities = [], more = {}) => ({types: ["Creature"], subtypes, manaCost: cost, colors: ["G"], power: p, toughness: t, abilities, ...more});
const stat = (id, text, more) => ({id, kind: "static", text, ...more});
const OTHERS = {what: "permanent", types: ["Creature"], controller: "you", another: true};
const ANTHEM = stat("a0", "Other creatures you control get +1/+1.", {layer: 7, sublayer: "c", affects: OTHERS, apply: {power: 1, toughness: 1}});
const HUMBLE_TEXT = "All creatures lose all abilities and have base power and toughness 1/1.";
const FIX = {
  Bear: creature("{1}{G}", ["Bear"], 2, 2),
  "Elf Lord": creature("{1}{G}", ["Elf"], 2, 2, [ANTHEM]),
  "Other Lord": creature("{1}{G}", ["Elf"], 2, 2, [ANTHEM]),
  "Wing Lord": creature("{1}{G}", ["Bird"], 2, 2, [stat("a0", "Other creatures you control have flying.", {layer: 6, affects: OTHERS, apply: {addKeywords: ["Flying"]}})]),
  /* Humility, made a creature: its one ability, in layers 6 and 7b, takes its own abilities away -- and an anthem beside it. */
  "Humble One": creature("{2}{W}", ["Cleric"], 3, 3, [
    stat("a0", HUMBLE_TEXT, {layer: 6, affects: {what: "permanent", types: ["Creature"]}, apply: {removeAllAbilities: true}}),
    stat("a1", HUMBLE_TEXT, {layer: 7, sublayer: "b", affects: {what: "permanent", types: ["Creature"]}, apply: {setPower: 1, setToughness: 1}}),
    ANTHEM]),
  "Grove Shepherd": creature("{2}{G}", ["Dryad"], 2, 2, [
    stat("a0", "Forests you control are 1/1 creatures that are still lands.", {layer: 4, affects: {what: "permanent", types: ["Land"], subtypes: ["Forest"], controller: "you"}, apply: {addTypes: ["Creature"]}}),
    stat("a1", "Forests you control are 1/1 creatures that are still lands.", {layer: 7, sublayer: "b", affects: {what: "permanent", types: ["Land"], subtypes: ["Forest"], controller: "you"}, apply: {setPower: 1, setToughness: 1}})]),
  Shapeshifter: creature("{2}{U}", [], 2, 2, [], {keywords: ["Changeling"]}),
  "Dryad Grove": {types: ["Land", "Creature"], subtypes: ["Forest", "Dryad"], manaCost: null, colors: ["G"], power: 1, toughness: 1},
  Rock: {types: ["Artifact"], manaCost: "{1}", colors: []},
  Zap: {types: ["Instant"], manaCost: "{R}", colors: ["R"], spell: {id: "s", text: "Zap deals 2 damage to target player.", targets: [{what: "player"}], effects: [{effect: "dealDamage", amount: 2, who: {target: 0}}]}},
  Cart: {types: ["Artifact"], subtypes: ["Vehicle"], manaCost: "{3}", colors: [], power: 3, toughness: 3, keywords: ["Crew"],
    abilities: [{id: "a1", kind: "activated", text: "Crew 3", cost: [{atom: "crew", power: 3}], effects: [{effect: "animate", targets: "self", addTypes: ["Creature"], until: "end-of-turn"}]}]},
};
/* A creature whose one static changes `rule`, for the readers. */
const holding = (name, more) => { FIX[name] = creature("{1}{W}", ["Human"], 3, 3, [stat("a0", name, more)]); return name; };
const R = {
  free: holding("Free Caster", {rule: "cast-without-paying", affects: {types: ["Creature"]}}),
  handOnly: holding("Hand Warden", {rule: "cant-cast", affects: {what: "player"}, fromAnywhereButHand: true}),
  combatLock: holding("Combat Warden", {rule: "cant-activate", affects: {what: "player"}, duringCombat: true}),
  noLife: holding("Life Thief", {rule: "cant-gain-life", affects: {what: "player", who: "opponent"}}),
  tokens: holding("Token Doubler", {rule: "more-tokens", affects: {who: "you"}, times: 2}),
  dragons: holding("Dragon Maker", {rule: "tokens-instead", affects: {types: ["Artifact"]}, token: {name: "Dragon", types: ["Creature"], subtypes: ["Dragon"], colors: ["R"], power: 5, toughness: 5}}),
  unsacrificed: holding("Unbreakable", {rule: "cant-be-sacrificed", affects: {what: "permanent", self: true}}),
  alms: holding("Alms Elder", {rule: "draws-instead", affects: {who: "opponent"}}),
  almsToo: holding("Alms Younger", {rule: "draws-instead", affects: {who: "opponent"}}),
  life: holding("Life Doubler", {rule: "more-life", affects: {who: "you"}, times: 2}),
  counters: holding("Counter Doubler", {rule: "more-counters", affects: {types: ["Creature"], controller: "you"}, counter: "+1/+1", times: 2}),
  fog: holding("Fog Sentry", {rule: "cant-attack", affects: {types: ["Creature"]}, defender: "you"}),
  lifts: holding("Wall Captain", {rule: "attacks-despite-defender", affects: {what: "permanent", types: ["Creature"], controller: "you", keywords: ["Defender"]}}),
  eager: holding("Eager One", {rule: "attacks-each-combat", affects: {what: "permanent", self: true}}),
  tax: holding("Toll Keeper", {rule: "attack-tax", amount: 2}),
  uncounterable: holding("Spell Shield", {rule: "cant-be-countered", affects: {what: "spell", types: ["Creature"]}}),
  bigBlocks: holding("Brute Captain", {rule: "cant-be-blocked-by", affects: {what: "permanent", types: ["Creature"], controller: "you"}, byPowerBelowSource: true}),
  lands: holding("Land Scout", {rule: "extra-land-drop", affects: {what: "player", who: "you"}}),
  cheaper: holding("Cost Imp", {rule: "spells-cost-less", affects: {what: "spell", types: ["Creature"]}, amount: 1}),
  dearer: holding("Tax Warden", {rule: "spells-cost-more", affects: {what: "spell", nonTypes: ["Creature"]}, amount: 1}),
  twice: holding("Proliferator", {rule: "proliferate-twice", affects: {what: "player", who: "you"}}),
  abilityTax: holding("Ability Taxer", {rule: "abilities-cost-more", affects: {what: "player", who: "opponent"}, amount: 1}),
  handSize: holding("Tower Sage", {rule: "no-maximum-hand-size", affects: {what: "player", who: "you"}}),
  unblockable: holding("Sneak", {rule: "cant-be-blocked", affects: {what: "permanent", self: true}}),
  warded: holding("Warded One", {rule: "protection", affects: {self: true}, from: "everything"}),
  revealed: holding("Open Book", {rule: "top-revealed", affects: {what: "player", who: "you"}}),
  undying: holding("Undying One", {rule: "cant-lose", affects: {self: true}}),
  shrouded: holding("Shroud Keeper", {rule: "player-hexproof", affects: {what: "player", who: "you"}}),
  flashback: holding("Lier", {rule: "flashback", affects: {types: ["Instant"], controller: "you"}}),
  escape: holding("Breach", {rule: "escape", affects: {what: "card", zone: "graveyard", controller: "you", nonTypes: ["Land"]}, cost: [{atom: "exileFromGraveyard", count: 1}]}),
};
FIX.Pilot = creature("{W}", ["Pilot"], 1, 1, [stat("p", "This creature crews Vehicles as though its power were 2 greater.", {rule: "crews-with-more", amount: 2})]);
FIX.Wall = creature("{1}{W}", ["Wall"], 0, 4, [], {keywords: ["Defender"]});
FIX["Grave Warden"] = creature("{1}{B}", ["Spirit"], 1, 1, [{id: "a0", kind: "replacement", text: "If a creature an opponent controls would die, exile it instead.",
  watches: {event: "zone-change", from: "battlefield", to: "graveyard", filter: {types: ["Creature"], controller: "opponent"}}, change: {to: "exile"}}]);
/* "As long as this card is in your graveyard, creatures lose all abilities": a static that works from a graveyard (CR 113.6b). */
FIX["Grave Hush"] = creature("{2}{B}", ["Spirit"], 2, 2, [stat("a0", "As long as this card is in your graveyard, creatures lose all abilities.",
  {worksFrom: "graveyard", layer: 6, affects: {what: "permanent", types: ["Creature"]}, apply: {removeAllAbilities: true}})]);
FIX["Null Aura"] = {types: ["Enchantment"], subtypes: ["Aura"], manaCost: "{U}", colors: ["U"],
  abilities: [stat("a0", "Enchanted creature loses all abilities.", {layer: 6, affects: {what: "permanent", attachedBy: "self"}, apply: {removeAllAbilities: true}})]};
FIX["Twin Pyre"] = creature("{1}{R}", ["Elemental"], 1, 1, [{id: "a0", kind: "replacement", text: "Double it.", watches: {event: "damage", source: {controller: "you"}}, change: {multiply: 2}}]);

const table = (setup, seats = 2, steps = []) => runScenario({name: "ability-loss", seats, setup, steps}, index.definition, FIX).state;
const on = (seat, ...cards) => ({seat, zone: "battlefield", cards});
const inHand = (seat, ...cards) => ({seat, zone: "hand", cards});
const idOf = (s, name, seat = null) => Object.keys(s.objects).map(Number).find((id) => s.objects[id].card === name && (seat === null || s.objects[id].owner === seat));
/* An Aura from a hand put onto the battlefield enchanting `host`, with nothing else happening (no state-based action is
   checked): Retro-Mutation on Maya's Elf Lord. */
const enchant = (s, aura, host) => {
  const id = idOf(s, aura);
  for (const hand of s.zones.hand) if (hand.includes(id)) hand.splice(hand.indexOf(id), 1);
  s.zones.battlefield.push(id);
  Object.assign(s.objects[id], {zone: "battlefield", attachedTo: host, timestamp: (s.nextTimestamp += 1)});
  (s.objects[host].attachments ??= []).push(id);
  return id;
};
/* "Loses all abilities" for good, as Abigale's and Oko's +1 say it (an effect fixed on the object, CR 611.2c). */
const lose = (s, id) => runEffects(s, [{effect: "effectUntil", layer: 6, targets: [id], apply: {removeAllAbilities: true}, until: "ever"}], {controller: 1, source: null});

/* ---- 1. the layers ---- */
{
  const s = table([on(0, "Elf Lord", "Bear")]);
  const [lord, bear] = [idOf(s, "Elf Lord"), idOf(s, "Bear")];
  eq(powerOf(s, bear), 3, "an Elf Lord's anthem: the Bear a 3/3");
  lose(s, lord);
  eq([powerOf(s, bear), toughnessOf(s, bear)], [2, 2], "the lord loses all abilities: its anthem makes no effect in layer 7 (CR 613.1f)");
  s.objects[lord].timestamp = 10_000;
  eq(powerOf(s, bear), 2, "whatever the timestamps: with the lord newer than the effect that took its abilities, still none (CR 613.8a, existence)");
}
{
  const s = table([on(0, "Wing Lord", "Bear")]);
  const [lord, bear] = [idOf(s, "Wing Lord"), idOf(s, "Bear")];
  ok(keywordsOf(s, bear).includes("Flying"), "a lord's grant in layer 6: the Bear flies");
  lose(s, lord);
  ok(!keywordsOf(s, bear).includes("Flying"), "the lord loses its abilities: its grant is gone from layer 6 too");
}
{
  /* CR 613.6: an effect that began in layer 4 carries on in layer 7b though its ability is gone by then. */
  const s = table([on(1, "Grove Shepherd", "Forest", "Forest")]);
  const forest = idOf(s, "Forest");
  lose(s, idOf(s, "Grove Shepherd"));
  ok(typesOf(s, forest).includes("Creature"), "the Shepherd lost its abilities in layer 6: its layer-4 effect has made the Forest a creature already");
  eq([powerOf(s, forest), toughnessOf(s, forest)], [1, 1], "and, begun in layer 4, the same effect makes it 1/1 in layer 7b (CR 613.6)");
  /* A pump left behind beside it: an effect no permanent's ability made is never one of a permanent's lost ones. */
  runEffects(s, [{effect: "pump", targets: [forest], power: 1, toughness: 0}], {controller: 1, source: null});
  eq(powerOf(s, forest), 2, "a pump on it applies as ever");
}
{
  /* Humility made a creature: its one ability takes its own abilities away, and goes on applying (CR 613.6); its anthem is gone. */
  const s = table([on(0, "Humble One", "Bear")]);
  const [one, bear] = [idOf(s, "Humble One"), idOf(s, "Bear")];
  eq([powerOf(s, one), toughnessOf(s, one), powerOf(s, bear), toughnessOf(s, bear)], [1, 1, 1, 1],
    "it and the Bear are 1/1 with no abilities: its own ability applies to itself too, and its anthem, another ability it lost, pumps nothing");
  runEffects(s, [{effect: "pump", targets: [bear], power: 2, toughness: 2}], {controller: 0, source: null});
  eq(powerOf(s, bear), 3, "and a pump on the Bear (7c) after its base 1/1 (7b): a 3/3");
}
{
  /* setCreatureTypes (CR 205.1a): Oko's Elk and Retro-Mutation's Turtle. */
  const s = table([on(0, "Bear", "Shapeshifter", "Dryad Grove")]);
  const [bear, shifter, grove] = [idOf(s, "Bear"), idOf(s, "Shapeshifter"), idOf(s, "Dryad Grove")];
  runEffects(s, [{effect: "createToken", token: {predefined: "Food"}}], {controller: 0, source: null});
  const food = idOf(s, "Food");
  const elk = (id) => runEffects(s, [{effect: "effectUntil", layer: 4, targets: [id], apply: {addTypes: ["Creature"], setCreatureTypes: ["Elk"]}, until: "ever"}], {controller: 0, source: null});
  for (const id of [bear, shifter, grove, food]) elk(id);
  eq(subtypesOf(s, bear), ["Elk"], "a Bear made an Elk: an Elk only");
  eq([subtypesOf(s, food), typesOf(s, food)], [["Food", "Elk"], ["Artifact", "Creature"]], "a Food made an Elk creature: still a Food, still an artifact");
  ok(!everyCreatureTypeOf(s, shifter) && subtypesOf(s, shifter).includes("Elk"), "a changeling made an Elk: no longer every creature type");
  eq(subtypesOf(s, grove), ["Forest", "Elk"], "a land creature made an Elk: its land type kept");
  const t = table([on(0, "Bear", "Rock")]);
  runEffects(t, [{effect: "effectUntil", layer: 4, targets: [idOf(t, "Bear")], apply: {addTypes: ["Creature"], setCreatureTypes: ["Elk"]}, until: "ever"},
    {effect: "effectUntil", layer: 4, targets: [idOf(t, "Rock")], apply: {addTypes: ["Creature"]}, until: "ever"}], {controller: 0, source: null});
  deriveMemo.reset();
  characteristicsOf(t, idOf(t, "Bear"));
  eq(deriveMemo.trials(), 0, "setCreatureTypes is a write the dependency pruning knows (layers.mjs WRITES): no trial for it beside a layer-4 effect it cannot touch");
}

/* ---- 2. every reader of a permanent's rules, before and after it loses all its abilities ---- */
const flips = (label, setup, ask, {seats = 2, steps = [], holder} = {}) => {
  const s = table(setup, seats, steps);
  const before = ask(s);
  lose(s, idOf(s, holder));
  const after = ask(s);
  ok(JSON.stringify(before) !== JSON.stringify(after), `${label}: ${JSON.stringify(before)} with its abilities, ${JSON.stringify(after)} without`);
  return {before, after};
};
eq(flips("freeCast (cast-without-paying)", [on(0, R.free), inHand(0, "Bear")], (s) => freeCast(s, 0, idOf(s, "Bear")) !== null, {holder: R.free}).after, false,
  "a creature spell free no longer");
eq(flips("castForbidden (cant-cast)", [on(1, R.handOnly), {seat: 0, zone: "graveyard", cards: ["Bear"]}], (s) => castForbidden(s, 0, idOf(s, "Bear")), {holder: R.handOnly}).after, false,
  "a card cast from a graveyard allowed again");
eq(flips("activationForbidden (cant-activate)", [on(1, R.combatLock)], (s) => { s.phase = "COMBAT_BEGIN"; return activationForbidden(s, 0); }, {holder: R.combatLock}).after, false,
  "abilities activated during combat again");
eq(flips("cantGainLife (cant-gain-life)", [on(1, R.noLife)], (s) => cantGainLife(s, 0), {holder: R.noLife}).after, false, "Rob gains life again");
eq(flips("tokensCreated (more-tokens)", [on(0, R.tokens)], (s) => tokensCreated(s, 0, 1, {types: ["Creature"]}).groups[0].count, {holder: R.tokens}).after, 1, "one token, not two");
eq(flips("tokensCreated (tokens-instead)", [on(0, R.dragons)], (s) => { const [made] = tokensCreated(s, 0, 1, {types: ["Artifact"]}).groups; return made.own ? null : made.token.name; }, {holder: R.dragons}).after, null,
  "a Treasure, not a Dragon");
eq(flips("cantBeSacrificed", [on(0, R.unsacrificed)], (s) => cantBeSacrificed(s, idOf(s, R.unsacrificed)), {holder: R.unsacrificed}).after, false, "it can be sacrificed");
eq(flips("drawsInstead (draws-instead)", [on(1, R.alms)], (s) => drawsInstead(s, 0, 2), {holder: R.alms}).after, [], "Rob draws his two");
eq(flips("lifeGained (more-life)", [on(0, R.life)], (s) => lifeGained(s, 0, 3), {holder: R.life}).after, 3, "3 life, not 6");
eq(flips("countersPlaced (more-counters)", [on(0, R.counters, "Bear")], (s) => countersPlaced(s, idOf(s, "Bear"), "+1/+1", 1, 0), {holder: R.counters}).after, 1, "one counter, not two");
eq(flips("cantAttack (cant-attack)", [on(0, "Bear"), on(1, R.fog)], (s) => cantAttack(s, idOf(s, "Bear"), 1), {holder: R.fog}).after, false, "the Bear may attack Maya");
eq(flips("defenderLifted (attacks-despite-defender)", [on(0, R.lifts, "Wall")], (s) => defenderLifted(s, idOf(s, "Wall")), {holder: R.lifts}).after, false, "the Wall can't attack");
eq(flips("attacksEachCombat (attacks-each-combat)", [on(0, R.eager)], (s) => attacksEachCombat(s, idOf(s, R.eager)).length, {holder: R.eager}).after, 0, "nothing required of it");
eq(flips("attackTax (attack-tax)", [on(1, R.tax)], (s) => attackTax(s, [{defenderId: 1}]), {holder: R.tax}).after, 0, "no {2} to attack Maya");
eq(flips("cantBeCountered (cant-be-countered)", [on(0, R.uncounterable, "Forest", "Forest"), inHand(0, "Bear")],
  (s) => cantBeCountered(s, s.stack[0].objectId), {holder: R.uncounterable, steps: [{tap: "Forest"}, {tap: "Forest"}, {cast: "Bear"}]}).after, false, "the Bear spell can be countered");
eq(flips("cantBeBlockedBy (cant-be-blocked-by)", [on(0, R.bigBlocks, "Bear"), on(1, "Elf Lord")], (s) => cantBeBlockedBy(s, idOf(s, "Bear"), idOf(s, "Elf Lord", 1)), {holder: R.bigBlocks}).after, false,
  "Maya's 2-power lord may block");
eq(flips("playerStatics (extra-land-drop)", [on(0, R.lands)], (s) => playerStatics(s, "extra-land-drop", 0).length, {holder: R.lands}).after, 0, "one land a turn");
eq(flips("costReduction (spells-cost-less)", [on(0, R.cheaper), inHand(0, "Bear")], (s) => costReduction(s, 0, idOf(s, "Bear")), {holder: R.cheaper}).after, 0, "the Bear at full price");
eq(flips("costIncrease (spells-cost-more)", [on(1, R.dearer), inHand(0, "Rock")], (s) => costIncrease(s, 0, idOf(s, "Rock")), {holder: R.dearer}).after, 0, "the Rock at its price");
eq(flips("proliferateTimes (proliferate-twice)", [on(0, R.twice)], (s) => proliferateTimes(s, 0), {holder: R.twice}).after, 1, "once");
eq(flips("abilityCostIncrease (abilities-cost-more)", [on(1, R.abilityTax)], (s) => abilityCostIncrease(s, 0), {holder: R.abilityTax}).after, 0, "no {1} more");
eq(flips("playerRuleChanged (no-maximum-hand-size)", [on(0, R.handSize)], (s) => playerRuleChanged(s, "no-maximum-hand-size", 0), {holder: R.handSize}).after, false, "seven cards again");
eq(flips("ruleChanged (cant-be-blocked)", [on(0, R.unblockable)], (s) => ruleChanged(s, "cant-be-blocked", idOf(s, R.unblockable)), {holder: R.unblockable}).after, false, "it can be blocked");
eq(flips("applicable (a replacement effect)", [on(0, "Grave Warden"), on(1, "Bear")],
  (s) => applyReplacements(s, {event: "zone-change", objectId: idOf(s, "Bear"), from: "battlefield", to: "graveyard"}, {dry: true}).proposal.to, {holder: "Grave Warden"}).after, "graveyard",
  "Maya's Bear dies into her graveyard, not exile (CR 614.1a)");
eq(flips("damageChoicesPossible", [on(0, "Twin Pyre", "Twin Pyre")], (s) => damageChoicesPossible(s), {holder: "Twin Pyre"}).after, false, "one damage effect left: no order to choose");
eq(flips("protectedFrom (protection)", [on(0, R.warded), on(1, "Bear")], (s) => protectedFrom(s, {card: idOf(s, R.warded)}, idOf(s, "Bear")), {holder: R.warded}).after, false, "no protection");
eq(flips("the projection (top-revealed)", [on(0, R.revealed)], (s) => projectFor(s, 1).players[0].zones.Library.cards.length, {holder: R.revealed}).after, 0, "Maya sees no card of Rob's library");
eq(flips("playerRuled (cant-lose)", [on(0, R.undying)], (s) => playerRuled(s, "cant-lose", 0), {holder: R.undying}).after, false, "Rob can lose");
eq(flips("a player's hexproof (player-hexproof)", [on(0, R.shrouded)], (s) => compileSelector({what: "player", target: true})(s, 0, {controller: 1}), {holder: R.shrouded}).after, true,
  "Maya may target Rob");
eq(flips("orderDraws (whose Alms Collector)", [on(0, R.alms, R.almsToo), on(2, R.alms)], (s) => orderDraws.choice(s, {player: 1, count: 2, options: [0, 2]}).options[0].label,
  {seats: 3, holder: R.alms}).after, "Rob's Alms Younger: Rob and Maya each draw a card", "the one of Rob's that still has it is named");
eq(flips("flashbackCost (flashback given)", [on(0, R.flashback), {seat: 0, zone: "graveyard", cards: ["Zap"]}], (s) => flashbackCost(s, 0, idOf(s, "Zap")) !== null, {holder: R.flashback}).after, false,
  "the Zap has no flashback");
eq(flips("escapeWays (escape given)", [on(0, R.escape), {seat: 0, zone: "graveyard", cards: ["Bear", "Rock"]}], (s) => escapeWays(s, 0, idOf(s, "Bear")).length, {holder: R.escape}).after, 0,
  "the Bear has no escape");
eq(flips("crew (crews-with-more)", [on(0, "Pilot", "Cart")], (s) => legalActions(s, 0).filter((a) => a.kind === "activate" && a.label === "Cart").length, {holder: "Pilot"}).after, 0,
  "the 1/1 Pilot crews Crew 3 no more");
{
  /* Retro-Mutation on Maya's Elf Lord: a 0/1 Turtle with no abilities, and "it can't attack" -- the Aura's own restriction,
     which binds a creature with no abilities of its own. */
  const s = table([on(1, "Elf Lord", "Bear"), inHand(0, "Retro-Mutation")]);
  const [lord, bear] = [idOf(s, "Elf Lord"), idOf(s, "Bear")];
  ok(!cantAttack(s, lord, 0), "the lord may attack Rob");
  enchant(s, "Retro-Mutation", lord);
  eq([powerOf(s, lord), toughnessOf(s, lord), subtypesOf(s, lord), powerOf(s, bear)], [0, 1, ["Turtle"], 2], "a 0/1 Turtle, and the Bear a 2/2: the lord's anthem gone");
  ok(cantAttack(s, lord, 0), "and it can't attack (CR 508.1c)");
  ok(!cantAttack(s, bear, 0), "the Bear still may");
}

/* ---- 3. what reading a board's rules costs ---- */
const made = (fn) => { deriveMemo.reset(); fn(); return deriveMemo.count(); };
{
  const s = table([on(0, "Elf Lord", "Bear", R.cheaper), on(1, "Other Lord", "Bear")]);
  const ids = [...s.zones.battlefield];
  eq(made(() => { const held = staticAbilities(s); for (const id of ids) held(id); }), 0, "no effect takes abilities away: a board's rules are read with nothing derived");
  lose(s, idOf(s, "Elf Lord"));
  const lord = idOf(s, "Elf Lord");
  eq(made(() => { const held = staticAbilities(s); for (const id of ids) if (id !== lord) held(id); }), 0, "one takes the lord's: every other permanent read with nothing derived");
  const held = staticAbilities(s);
  ok(made(() => held(lord)) > 0, "and the lord itself derived");
  eq([made(() => held(lord)), held(lord)], [0, []], "once: read again by the same reader, nothing is derived, and it has no abilities");
  ok(deriving(s, () => staticAbilities(s) === staticAbilities(s)) && staticAbilities(s) !== staticAbilities(s), "inside one question, one reader (onceAQuestion); outside, a fresh one each time");
  const bear = idOf(s, "Bear", 0);
  eq(made(() => deriving(s, () => powerOf(s, bear))), 2, "the Bear's power: it, and the lord through layer 6 to know its anthem gone -- never Maya's lord, which nothing can have taken from");
}
{
  /* An Aura's: only what it enchants. A kind of permanent ("all creatures"): every one -- on the battlefield. */
  const s = table([on(0, "Elf Lord", "Bear"), inHand(0, "Null Aura", R.cheaper)]);
  const [lord, bear] = [idOf(s, "Elf Lord"), idOf(s, "Bear")];
  enchant(s, "Null Aura", lord);
  eq(staticAbilities(s)(lord), [], "an Aura's \"loses all abilities\": the lord it enchants read without them");
  eq(made(() => staticAbilities(s)(bear)), 0, "and the Bear with nothing derived");
  s.objects[idOf(s, "Null Aura")].attachedTo = null;
  eq(made(() => staticAbilities(s)(lord)), 0, "enchanting nothing, it reaches no one");
  const h = table([on(0, "Humble One", "Bear"), inHand(0, R.cheaper)]);
  eq(staticAbilities(h)(idOf(h, "Bear")), [], "\"all creatures lose all abilities\": each creature derived, and read without them");
  eq(staticAbilities(h)(idOf(h, R.cheaper)).length, 1, "but a creature card in a hand keeps its own: only a permanent loses them");
}
{
  /* From a graveyard: a static that works there takes abilities away (CR 113.6b); one that does not, does nothing. */
  const g = table([on(0, R.cheaper), {seat: 0, zone: "graveyard", cards: ["Grave Hush"]}, inHand(0, "Bear")]);
  eq(costReduction(g, 0, idOf(g, "Bear")), 0, "a static working from a graveyard takes the Cost Imp's abilities, and its reduction with them");
  const n = table([on(0, R.cheaper, "Bear"), {seat: 0, zone: "graveyard", cards: ["Humble One"]}]);
  eq(made(() => staticAbilities(n)(idOf(n, R.cheaper))), 0, "a card in a graveyard whose static works only on the battlefield reaches no one");
}
{
  /* Which of its abilities a permanent has lost is derived through layer 6 alone, and kept apart from what it is: with
     "all creatures lose all abilities" older than two lords that each give the other flying, each lord's own derivation
     through layer 6 sees the other's grant before it knows the other has lost it -- and none of that is what either is. */
  const s = table([on(0, "Humble One", "Wing Lord", "Bear"), on(0, "Wing Lord")]);
  const [one, two] = s.zones.battlefield.filter((id) => s.objects[id].card === "Wing Lord");
  eq(deriving(s, () => [powerOf(s, idOf(s, "Bear")), keywordsOf(s, one), keywordsOf(s, two)]), [1, [], []], "the Bear a 1/1, and neither lord flying");
  /* Through layer 6 only: no layer-7 dependency trial for a permanent asked about only for that. */
  const t = table([on(0, "Elf Lord", "Bear")]);
  const lord = idOf(t, "Elf Lord");
  lose(t, lord);
  runEffects(t, [{effect: "effectUntil", layer: 7, sublayer: "b", targets: [lord], apply: {setPower: 3, setToughness: 3}, until: "ever"},
    {effect: "effectUntil", layer: 7, sublayer: "b", targets: [lord], apply: {setPower: 0, setToughness: 1}, until: "ever"}], {controller: 1, source: null});
  deriveMemo.reset();
  deriving(t, () => powerOf(t, idOf(t, "Bear")));
  eq(deriveMemo.trials(), 1, "the Bear's power: one trial of the two 7b effects, for the Bear -- none for the lord, derived through layer 6 to know its anthem gone");
}

/* ---- 4. exchangeControl (CR 701.12a-b) ---- */
{
  const s = table([on(0, "Rock", "Bear"), on(1, "Elf Lord"), on(2, "Other Lord")], 3);
  const [rock, bear, lord, other] = [idOf(s, "Rock"), idOf(s, "Bear"), idOf(s, "Elf Lord"), idOf(s, "Other Lord")];
  const ctx = {controller: 0, source: null};
  exchangeControl(s, {from: [rock], targets: [lord]}, ctx);
  eq([controllerOf(s, rock), controllerOf(s, lord)], [1, 0], "Rob's Rock for Maya's lord: each controls the other's");
  eq(s.effects.filter((e) => e.rule === "control-returns").map((e) => [e.affects.ids[0], e.to, e.until ?? "for good"]), [[rock, 1, "for good"], [lord, 0, "for good"]],
    "two control changes for good, each with its record (CR 800.4a gives them back if a player leaves)");
  exchangeControl(s, {targets: [bear, other]}, ctx);
  eq([controllerOf(s, bear), controllerOf(s, other)], [2, 0], "\"two target creatures\" (no `from`): the two of `targets`");
  const before = JSON.stringify(s.effects);
  exchangeControl(s, {from: [lord], targets: [other]}, ctx);
  eq([controllerOf(s, lord), controllerOf(s, other), JSON.stringify(s.effects)], [0, 0, before], "both one player's: nothing (CR 701.12b)");
  exchangeControl(s, {from: [lord], targets: []}, ctx);
  exchangeControl(s, {from: [], targets: [rock]}, ctx);
  exchangeControl(s, {from: [rock], targets: [rock]}, ctx);
  eq([controllerOf(s, lord), controllerOf(s, rock), JSON.stringify(s.effects)], [0, 1, before], "one of them no longer a legal target, or the same one twice: no part of it (CR 701.12a)");
  const gone = s.zones.battlefield.indexOf(bear);
  s.zones.battlefield.splice(gone, 1);
  s.objects[bear].zone = "graveyard";
  exchangeControl(s, {from: [lord], targets: [bear]}, ctx);
  eq([controllerOf(s, lord), JSON.stringify(s.effects)], [0, before], "one gone from the battlefield: nothing");
  const refused = (effect) => compileScript({schema: "CrankCardScript@1", identity: {name: "Probe", oracleId: "ability-loss-probe", types: ["Sorcery"], subtypes: [],
    manaCost: "{1}", colors: [], colorIdentity: []}, oracleText: "x", source: "hand",
    abilities: [{kind: "spell", text: "x", targets: [{what: "permanent"}, {what: "permanent"}], effects: [{effect: "exchangeControl", ...effect}]}]}).problems;
  eq(refused({from: {target: 0}, targets: {target: 1}}), [], "the schema takes `from` and `targets`");
  ok(refused({from: {target: 0}}).some((p) => p.includes("exchangeControl")), "and refuses it with nothing to exchange with");
  ok(refused({from: {target: 0}, targets: {target: 1}, until: "end-of-turn"}).some((p) => p.includes("exchangeControl")), "or for a while: it is for good");
}

console.log(`engine-ability-loss: ${checks} checks passed -- "loses all abilities" switches off a permanent's own statics in layers 6 and 7 (CR 613.1f, 613.8a), carries on what began earlier (613.6), and takes every rule and replacement effect of its own with them; reading a board's rules derives only what such an effect can reach; control exchanged, both or nothing (701.12).`);
