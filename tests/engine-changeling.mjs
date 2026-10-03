/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* M4 PHASE 3, BATCH 74 (THE CATALOG'S ORDER): CHANGELING (CR 702.73a) -- "this object is every creature type".
 *
 * A characteristic-defining ability that works everywhere (CR 604.3): a changeling card in a hand is an Elf card, a
 * changeling creature is a Goblin a lord pumps, "non-Elf" leaves it out, and as it dies it is still every creature type.
 * Every creature type and only those, from the list the oracle data gives (keywords/creature-types.mjs): never a Forest,
 * an Equipment or an Aura. And "gain all creature types" (Mirror Entity), a type change in layer 4 (CR 613.1d), which a
 * lord's +1/+1 in layer 7 then sees.
 */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {lastKnown, characteristicsOf} from "../game/engine/rules/layers.mjs";
import {compileSelector, matchesLastKnown} from "../game/engine/script/filter.mjs";
import {CREATURE_TYPES} from "../game/engine/keywords/creature-types.mjs";
import {creatureTypesFrom, moduleText} from "../game/tools/engine-creature-types.mjs";
import {missingFor} from "../game/tools/engine-constructs.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";

let checks = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const cards = loadCardIndex();
const at = (seat, zone, ...names) => ({seat, zone, cards: names});
const FIX = {Bear: {types: ["Creature"], subtypes: ["Bear"], manaCost: "{1}{G}", colors: ["G"], power: 2, toughness: 2},
  Blob: {types: ["Creature"], manaCost: "{1}", colors: [], power: 1, toughness: 1}};
const scenario = (setup) => runScenario({name: "changeling", seats: 2, setup, steps: [], expect: []}, cards.definition, FIX).state;
const named = (s, name, zone = "battlefield") => Object.values(s.objects).filter((o) => o.card === name && o.zone === zone).map((o) => o.id);
const is = (selector) => compileSelector(selector);

{
  eq(missingFor({keywords: ["Changeling"]}), [], "Changeling has behavior");
}
{
  /* The list is the oracle data's, and the committed module says exactly that. */
  const oracle = JSON.parse(readFileSync(new URL("../data/engine/oracle.json", import.meta.url), "utf8"));
  eq(creatureTypesFrom(oracle), [...CREATURE_TYPES], "keywords/creature-types.mjs is what the oracle data gives");
  eq(readFileSync(new URL("../game/engine/keywords/creature-types.mjs", import.meta.url), "utf8"), moduleText([...CREATURE_TYPES]), "and is the generator's text");
  eq(["Elf", "Goblin", "Shapeshifter", "Forest", "Equipment", "Aura", "Food"].map((t) => CREATURE_TYPES.includes(t)), [true, true, true, false, false, false, false],
    "creature types, never a land's, an Equipment's, an Aura's or a Food's");
}
{
  /* Every creature type, in every zone; never another kind of subtype; "non-Elf" leaves it out. */
  const s = scenario([at(0, "hand", "Universal Automaton"), at(0, "battlefield", "Taurean Mauler", "Bear")]);
  const [card] = named(s, "Universal Automaton", "hand"), [mauler] = named(s, "Taurean Mauler"), [bear] = named(s, "Bear");
  eq([is({what: "card", zone: "hand", subtypes: ["Elf", "Goblin"]})(s, card, {controller: 0}), is({what: "card", zone: "hand", subtypes: ["Equipment"]})(s, card, {controller: 0})],
    [true, false], "in his hand: an Elf Goblin card, not an Equipment");
  eq([is({subtypes: ["Merfolk"]})(s, mauler, {controller: 0}), is({subtypes: ["Forest"]})(s, mauler, {controller: 0}),
    is({types: ["Creature"], nonSubtypes: ["Elf"]})(s, mauler, {controller: 0}), is({types: ["Creature"], nonSubtypes: ["Elf"]})(s, bear, {controller: 0})],
  [true, false, false, true], "on the battlefield: a Merfolk, not a Forest; non-Elf, it is not -- the Bear is");
  /* As it last was: "whenever another Elf you control dies" sees it. */
  eq([matchesLastKnown({subtypes: ["Elf"]}, lastKnown(s, mauler)), matchesLastKnown({nonSubtypes: ["Elf"]}, lastKnown(s, mauler)), matchesLastKnown({subtypes: ["Elf"]}, lastKnown(s, bear))],
    [true, false, false], "its last known information is every creature type");
  /* It keeps them when it loses its abilities: the type change happened in layer 4, before layer 6 (CR 613.1d, 613.1f). */
  s.effects = [...(s.effects ?? []), {id: "silence", layer: 6, affects: {ids: [mauler]}, apply: {removeAllAbilities: true}, until: null, sourceController: 1, timestamp: s.nextTimestamp++}];
  eq([characteristicsOf(s, mauler).keywords.includes("Changeling"), is({subtypes: ["Elf"]})(s, mauler, {controller: 0})], [false, true], "abilities gone, still every creature type");
}
{
  /* "Shares a creature type": a changeling with anything that has one, and anything with one with a changeling; a creature
     with no creature type has none to share. */
  const shares = (s, id) => is({what: "card", zone: "hand", sharesCreatureType: {types: ["Creature"], controller: "you"}})(s, id, {controller: 0});
  const a = scenario([at(0, "hand", "Bear"), at(0, "battlefield", "Taurean Mauler")]);
  const b = scenario([at(0, "hand", "Universal Automaton"), at(0, "battlefield", "Bear")]);
  const c = scenario([at(0, "hand", "Universal Automaton"), at(0, "battlefield", "Taurean Mauler")]);
  const d = scenario([at(0, "hand", "Universal Automaton"), at(0, "battlefield", "Blob")]);
  /* A creature of no type given all creature types (Mirror Entity's effect, layer 4) shares with a changeling. */
  const e = scenario([at(0, "hand", "Universal Automaton"), at(0, "battlefield", "Blob")]);
  e.effects = [...(e.effects ?? []), {id: "mirror", layer: 4, affects: {ids: named(e, "Blob")}, apply: {allCreatureTypes: true}, until: "end-of-turn", sourceController: 0, timestamp: e.nextTimestamp++}];
  eq(shares(e, named(e, "Universal Automaton", "hand")[0]), true, "every creature type, with no subtype of its own: shares with a changeling");
  eq([shares(a, named(a, "Bear", "hand")[0]), shares(b, named(b, "Universal Automaton", "hand")[0]), shares(c, named(c, "Universal Automaton", "hand")[0]),
    shares(d, named(d, "Universal Automaton", "hand")[0])], [true, true, true, false], "Bear with a changeling, a changeling with a Bear, two changelings; nothing to share with a creature of no type");
}

console.log(`engine-changeling: ${checks} checks passed`);
