/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* M4 PHASE 3, BATCH 59 (THE CATALOG'S ORDER): "YOU MAY HAVE THIS CREATURE ENTER AS A COPY OF ..." (CR 614.1c, 614.12a,
 * 707.9; Forge's ETBReplacement, its copy form), AND FEAR (CR 702.36).
 *
 * Asked as it enters: each other permanent it may copy, or none. Its arrival waits for the answer, so it arrives as what
 * it became -- the copied card's "when this enters" triggers, and what watches creatures enter sees the copy -- and the
 * copied card's own "as this enters" applies: tapped, counters, a choice. "Except" sets or adds types and keywords and
 * keeps its own abilities; "until end of turn" ends. Nothing to copy, nothing asked. Fear: only an artifact creature or
 * a black creature blocks it.
 */
import assert from "node:assert/strict";
import {createState, addObject} from "../game/engine/state/index.mjs";
import {characteristicsOf, keywordsOf} from "../game/engine/rules/layers.mjs";
import {canBlockAttacker} from "../game/engine/keywords/combat.mjs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {oracleClauses} from "../game/engine/cards/compile.mjs";
import {missingFor} from "../game/tools/engine-constructs.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";

let checks = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const cards = loadCardIndex();
const card = (name) => ({...cards.definition(name), card: name});
const at = (seat, zone, ...names) => ({seat, zone, cards: names});
const creature = (cost, subtypes, more = {}) => ({types: ["Creature"], subtypes, manaCost: cost, colors: ["G"], power: 2, toughness: 2, ...more});
const DRAWS = [{id: "t", kind: "triggered", text: "When this creature enters, draw a card.", trigger: {on: "GameEventCardChangeZone", to: "Battlefield", who: "self"}, effects: [{effect: "draw", count: 1}]}];
const WATCHER = [{id: "w", kind: "triggered", text: "Whenever another creature enters, you gain 1 life.", trigger: {on: "GameEventCardChangeZone", to: "Battlefield", who: "any", filter: {types: ["Creature"], another: true}},
  effects: [{effect: "gainLife", amount: 1}]}];
const FIXTURES = {Seer: creature("{1}{U}", ["Human"], {colors: ["U"], abilities: DRAWS}), Bear: creature("{1}{G}", ["Bear"]), Warden: creature("{W}", ["Human"], {colors: ["W"], abilities: WATCHER}),
  Raptor: creature("{3}{G}", ["Dinosaur"], {power: 4, toughness: 4}),
  Tapland: {types: ["Land"], abilities: [{id: "r", kind: "replacement", text: "This land enters tapped.", watches: {event: "enters", who: "self"}, change: {entersTapped: true}}]}};
const IMPERSONATE = [{tap: "Island"}, {tap: "Island"}, {tap: "Wastes"}, {tap: "Wastes"}, {cast: "Clever Impersonator"}, {resolve: true}];
const play = (setup, steps, fixtures = FIXTURES) => runScenario({name: "copy", setup, steps, expect: []}, cards.definition, fixtures).state;
const named = (s, name) => s.zones.battlefield.filter((id) => s.objects[id].card === name);

{
  /* Asked: each other nonland permanent, or none -- the lands and the Impersonator itself not among them. Its arrival waits:
     nothing has triggered yet, not even the Warden's "another creature enters". */
  const s = play([at(0, "battlefield", "Island", "Island", "Wastes", "Wastes", "Seer", "Warden"), at(0, "hand", "Clever Impersonator")], IMPERSONATE);
  eq(s.awaiting?.copyOf?.map((id) => s.objects[id].card).sort(), ["Seer", "Warden"], "the Seer or the Warden; no land, not itself");
  eq([(s.pendingTriggers ?? []).length, s.stack.length], [0, 0], "waiting for the answer: nothing triggered yet");
  /* Copied: it arrives as the Seer -- its "when this enters" triggers -- and the Warden sees a creature enter. */
  const t = play([at(0, "battlefield", "Island", "Island", "Wastes", "Wastes", "Seer", "Warden"), at(0, "hand", "Clever Impersonator")], [...IMPERSONATE, {choose: ["Seer"]}]);
  eq([(t.pendingTriggers ?? []).map((p) => p.source.name).sort(), t.awaiting?.kind], [["Seer", "Warden"], "order-triggers"],
    "copied: the Seer's own arrival trigger and the Warden's, his to order");
  eq([named(t, "Seer").length, named(t, "Clever Impersonator").length], [2, 0], "two Seers, no Impersonator");
}
{
  /* Not copied: it arrives as itself, a 0/0 that the next state-based check puts in the graveyard; the Warden still saw it. */
  const s = play([at(0, "battlefield", "Island", "Island", "Wastes", "Wastes", "Warden"), at(0, "hand", "Clever Impersonator")], [...IMPERSONATE, {choose: ["No copy"]}]);
  eq([named(s, "Clever Impersonator").length, s.zones.graveyard[0].some((id) => s.objects[id].card === "Clever Impersonator"), s.stack.length], [0, true, 1],
    "no copy: a 0/0, gone to the graveyard; the Warden's trigger on the stack");
  /* Nothing to copy: nobody is asked, and it arrives at once (the Sculpting Steel with no artifact out). */
  const t = play([at(0, "battlefield", "Wastes", "Wastes", "Wastes", "Warden"), at(0, "hand", "Sculpting Steel")], [{tap: "Wastes"}, {tap: "Wastes"}, {tap: "Wastes"}, {cast: "Sculpting Steel"}, {resolve: true}]);
  eq([t.awaiting ?? null, named(t, "Sculpting Steel").length], [null, 1], "no artifact to copy: nothing asked, a Sculpting Steel");
  /* A copy of a card that itself enters as a copy is not asked again: Mirrormade as a Sculpting Steel stays one. */
  const u = play([at(0, "battlefield", "Island", "Island", "Wastes", "Sculpting Steel", "Trinket"), at(0, "hand", "Mirrormade")],
    [{tap: "Island"}, {tap: "Island"}, {tap: "Wastes"}, {cast: "Mirrormade"}, {resolve: true}, {choose: ["Sculpting Steel"]}], {...FIXTURES, Trinket: {types: ["Artifact"], manaCost: "{2}", colors: []}});
  eq([u.awaiting ?? null, named(u, "Sculpting Steel").length], [null, 2], "Mirrormade a Sculpting Steel, nothing more asked");
  /* Only its own "as this enters" applies to the copy: what another permanent's replacement did as it entered is not done
     twice ("each creature you control enters with an additional +1/+1 counter"). */
  const GIFT = {types: ["Enchantment"], abilities: [{id: "g", kind: "replacement", text: "Each creature you control enters with an additional +1/+1 counter on it.",
    watches: {event: "enters", filter: {types: ["Creature"], controller: "you"}}, change: {entersWithCounters: {counter: "+1/+1", count: 1}}}]};
  const v = play([at(0, "battlefield", "Island", "Island", "Wastes", "Wastes", "Bear", "Gift"), at(0, "hand", "Clever Impersonator")], [...IMPERSONATE, {choose: ["Bear"]}], {...FIXTURES, Gift: GIFT});
  const bear = named(v, "Bear").find((id) => v.objects[id].uncopied);
  eq(v.objects[bear].counters["+1/+1"], 1, "the copied Bear has one counter, not two");
  /* A creature with nothing it may copy arrives at once: Deceptive Frostkite beside a 2-power Warden -- nothing asked, and
     the Warden sees a creature enter. */
  const w = play([at(0, "battlefield", "Island", "Island", "Warden"), at(0, "hand", "Deceptive Frostkite")],
    [{tap: "Island"}, {tap: "Island"}, {cast: "Deceptive Frostkite"}, {resolve: true}]);
  eq([w.awaiting ?? null, w.stack.length, named(w, "Deceptive Frostkite").length], [null, 1, 1], "nothing to copy: nothing asked, the Warden's trigger on the stack, a Frostkite");
}
{
  /* "Except": an artifact as well (Phyrexian Metamorph); a Ninja as well (Sakashima's Student); a Vehicle artifact with its
     own crew, no other card type (Imposter Mech) -- not a creature until crewed. */
  const m = play([at(0, "battlefield", "Wastes", "Wastes", "Wastes", "Bear"), at(0, "hand", "Phyrexian Metamorph")], [{tap: "Wastes"}, {tap: "Wastes"}, {tap: "Wastes"}, {cast: "Phyrexian Metamorph"}, {resolve: true}, {choose: ["Bear"]}]);
  const copy = named(m, "Bear").find((id) => m.objects[id].uncopied);
  eq(characteristicsOf(m, copy).types.sort(), ["Artifact", "Creature"], "the Metamorph: an artifact Bear");
  const mech = play([at(0, "battlefield", "Island", "Wastes", "Bear"), at(0, "hand", "Imposter Mech"), at(1, "battlefield", "Raptor")],
    [{tap: "Island"}, {tap: "Wastes"}, {cast: "Imposter Mech"}, {resolve: true}]);
  eq(mech.awaiting.copyOf.map((id) => mech.objects[id].card), ["Raptor"], "Imposter Mech: Maya's Raptor only, not his Bear");
  const made = play([at(0, "battlefield", "Island", "Wastes", "Bear"), at(0, "hand", "Imposter Mech"), at(1, "battlefield", "Raptor")],
    [{tap: "Island"}, {tap: "Wastes"}, {cast: "Imposter Mech"}, {resolve: true}, {choose: ["Raptor"]}]);
  const raptor = made.zones.battlefield.find((id) => made.objects[id].card === "Raptor" && made.objects[id].controller === 0);
  eq([characteristicsOf(made, raptor).types, made.objects[raptor].subtypes, made.objects[raptor].abilities.map((a) => a.text)], [["Artifact"], ["Dinosaur", "Vehicle"], ["Crew 3"]],
    "a Dinosaur Vehicle artifact, no creature, with its own Crew 3");
}
{
  /* Vesuva enters tapped as a copy; a copy of a land that enters tapped enters tapped, its arrival saying so. */
  const v = play([at(0, "battlefield", "Forest"), at(0, "hand", "Vesuva")], [{play: "Vesuva"}, {choose: ["Forest"]}]);
  const forests = named(v, "Forest");
  eq(forests.map((id) => v.objects[id].tapped === true).sort(), [false, true], "Vesuva a Forest, tapped; the other Forest untapped");
  const u = runScenario({name: "tapland", setup: [at(0, "battlefield", "Tapland"), at(0, "hand", "Vesuva")], steps: [{play: "Vesuva"}, {choose: ["Tapland"]}], expect: []}, cards.definition, FIXTURES);
  const arrival = u.events.find((e) => e.kind === "GameEventCardChangeZone" && e.data.fields.to?.zoneType === "Battlefield");
  eq(arrival?.data.fields.enteredTapped, true, "its arrival entered tapped");
}
{
  /* The copied card's own "as this enters, choose a creature type" is asked next (Clever Impersonator as Patchwork Banner). */
  const s = play([at(0, "battlefield", "Island", "Island", "Wastes", "Wastes", "Patchwork Banner", "Bear"), at(0, "hand", "Clever Impersonator")], [...IMPERSONATE, {choose: ["Patchwork Banner"]}]);
  eq([s.awaiting?.kind, s.awaiting?.choose?.includes("Bear")], ["entering-choice", true], "a Patchwork Banner now, asking for a creature type");
  /* "Until end of turn" (Cursed Mirror): an Ogre with haste, then the Mirror again. */
  const fix = {...FIXTURES, Ogre: creature("{1}{R}", ["Ogre"], {colors: ["R"], power: 3, toughness: 3})};
  const m = play([at(0, "battlefield", "Mountain", "Wastes", "Wastes", "Ogre"), at(0, "hand", "Cursed Mirror")], [{tap: "Mountain"}, {tap: "Wastes"}, {tap: "Wastes"}, {cast: "Cursed Mirror"}, {resolve: true}, {choose: ["Ogre"]}], fix);
  const mirror = named(m, "Ogre").find((id) => m.objects[id].uncopied);
  eq(keywordsOf(m, mirror).includes("Haste"), true, "the Mirror an Ogre with haste");
  const later = play([at(0, "battlefield", "Mountain", "Wastes", "Wastes", "Ogre"), at(0, "hand", "Cursed Mirror")],
    [{tap: "Mountain"}, {tap: "Wastes"}, {tap: "Wastes"}, {cast: "Cursed Mirror"}, {resolve: true}, {choose: ["Ogre"]}, {to: {turn: 2, phase: "UPKEEP"}}], fix);
  eq(named(later, "Cursed Mirror").length, 1, "the turn over: Cursed Mirror again");
}
{
  /* Fear (CR 702.36b): an artifact creature or a black creature blocks it; a green one does not. */
  const s = createState({matchId: "m", seed: "fear", players: [{name: "Rob"}, {name: "Maya"}]});
  const put = (o, seat) => addObject(s, {...o, owner: seat, controller: seat}, "battlefield", null);
  const shade = put({card: "Shade", types: ["Creature"], colors: ["B"], keywords: ["Fear"], power: 2, toughness: 2}, 0);
  const golem = put({card: "Golem", types: ["Artifact", "Creature"], colors: [], power: 2, toughness: 2}, 1);
  const knight = put({card: "Knight", types: ["Creature"], colors: ["B"], power: 2, toughness: 2}, 1), elf = put({card: "Elf", types: ["Creature"], colors: ["G"], power: 1, toughness: 1}, 1);
  eq([golem, knight, elf].map((id) => canBlockAttacker(s, id, shade)), [true, true, false], "the Golem and the black Knight block it; the green Elf does not");
  /* Cover of Darkness on Elf: every Elf has fear -- Maya's too. */
  const cover = addObject(s, {...card("Cover of Darkness"), owner: 0, controller: 0}, "battlefield", null);
  s.objects[cover].chosen = "Elf";
  const hers = put({card: "Elf", types: ["Creature"], subtypes: ["Elf"], colors: ["G"], power: 1, toughness: 1}, 1);
  eq(keywordsOf(s, hers).includes("Fear"), true, "Maya's Elf has fear");
}
{
  /* The Phyrexian mana reminder claims nothing; a basic land's reminder is still its ability. Entering replacements are credited. */
  eq([oracleClauses("({U/P} can be paid with either {U} or 2 life.)\nFlying"), oracleClauses("({T}: Add {G}.)")], [["Flying"], ["{T}: Add {G}."]], "Metamorph's reminder skipped; a Forest's kept");
  eq([missingFor({keywords: ["ETBReplacement"]}), missingFor({keywords: ["Fear"]})], [[], []], "entering replacements, including entering as a copy, and Fear are credited");
}

console.log(`engine-enter-copy: ${checks} checks passed — asked as it enters, each other permanent or none; it arrives as the copy, triggers and all; the copied card's own entering applies; except, until end of turn; fear.`);
