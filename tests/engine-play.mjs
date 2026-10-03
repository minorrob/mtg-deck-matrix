/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* M4 PHASE 3, BATCH 61 (THE CATALOG'S ORDER): "YOU MAY CAST A SPELL ... WITHOUT PAYING ITS MANA COST" (CR 608.2g; Forge's
 * Play).
 *
 * As the effect resolves its controller may cast one card -- from their hand within a mana value, their commander from the
 * command zone, a card it targets in a graveyard -- free (a commander's tax still paid), or for its mana value in any mana.
 * Timing does not matter; what is owed is paid from the pool and plain sources; a card they cannot pay for, a land or an
 * Aura is not offered, and with nothing to cast nobody is asked. The spell is cast -- "whenever you cast" sees it -- and a
 * permanent spell enters under its caster's control (CR 608.3a).
 */
import assert from "node:assert/strict";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {createState, addObject} from "../game/engine/state/index.mjs";
import {ASKING} from "../game/engine/script/effects/asking.mjs";
import {missingFor} from "../game/tools/engine-constructs.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";

let checks = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const cards = loadCardIndex();
const at = (seat, zone, ...names) => ({seat, zone, cards: names});
const creature = (cost, more = {}) => ({types: ["Creature"], manaCost: cost, colors: ["G"], power: 2, toughness: 2, ...more});
const WATCH = [{id: "w", kind: "triggered", text: "Whenever you cast a spell, you gain 1 life.", trigger: {on: "GameEventSpellAbilityCast", caster: "you"}, effects: [{effect: "gainLife", amount: 1}]}];
const F = {Bear: creature("{1}{G}"), Titan: creature("{5}{G}", {power: 6, toughness: 6}), Elf: creature("{G}", {power: 1, toughness: 1}),
  Ritual: {types: ["Sorcery"], manaCost: "{1}", colors: [], spell: {id: "s", text: "You gain 3 life.", targets: [], effects: [{effect: "gainLife", amount: 3}]}},
  Halo: {types: ["Enchantment"], subtypes: ["Aura"], manaCost: "{W}", colors: ["W"], enchant: {what: "permanent", types: ["Creature"]}},
  Offering: {types: ["Sorcery"], manaCost: "{1}", colors: [], spell: {id: "s", text: "As an additional cost to cast this spell, sacrifice a creature. Draw two cards.", targets: [],
    additionalCost: [{atom: "sacrifice", selector: {types: ["Creature"]}}], effects: [{effect: "draw", count: 2}]}},
  Watcher: {types: ["Enchantment"], manaCost: "{1}", colors: [], abilities: WATCH}};
const run = (setup, steps, fixtures = F) => runScenario({name: "play", setup, steps, expect: []}, cards.definition, fixtures);
const EXPERTISE = ["Forest", "Forest", "Wastes", "Wastes", "Wastes", "Wastes"];
const cast = [...EXPERTISE.map((l) => ({tap: l})), {cast: "Rishkar's Expertise"}, {resolve: true}];

{
  /* Offered: the Bear (2) and the Ritual (1) -- a sorcery, timing does not matter -- not the Titan (6), the Forest or the Aura. */
  const {state: s} = run([at(0, "battlefield", ...EXPERTISE, "Bear"), at(0, "hand", "Rishkar's Expertise", "Bear", "Titan", "Ritual", "Forest", "Halo", "Offering")], cast);
  eq(s.awaiting.choices.map((c) => s.objects[c.objectId].card).sort(), ["Bear", "Ritual"], "the Bear and the Ritual; not the Titan, a land, an Aura, or a spell with an additional cost");
  /* Cast free: nothing spent; it is cast -- the Watcher sees it -- and on the stack above, resolving after. */
  const {state: t} = run([at(0, "battlefield", ...EXPERTISE, "Bear", "Watcher"), at(0, "hand", "Rishkar's Expertise", "Bear")], [...cast, {resolve: true}, {choose: ["Bear"]}]);
  eq([t.stack.map((e) => e.name), Object.values(t.players[0].manaPool).reduce((a, b) => a + b, 0)], [["Bear", "Watcher"], 0], "the Bear on the stack (bottom first), the Watcher's trigger above it; nothing paid");
  /* Declined: nothing cast. Nothing castable: nobody asked. */
  const {state: u} = run([at(0, "battlefield", ...EXPERTISE, "Bear"), at(0, "hand", "Rishkar's Expertise", "Bear")], [...cast, {choose: ["Don't cast"]}]);
  eq([u.stack.length, u.zones.hand[0].some((id) => u.objects[id].card === "Bear")], [0, true], "declined: the Bear still in hand");
  const {state: v} = run([at(0, "battlefield", ...EXPERTISE, "Bear"), at(0, "hand", "Rishkar's Expertise", "Titan")], cast);
  eq(v.awaiting ?? null, null, "only the Titan: nothing asked");
}
{
  /* The commander from the command zone, free (its tax, none yet, still owed). */
  const setup = (lands) => [at(0, "battlefield", "Geode Golem", ...lands), at(0, "command", "Bear")];
  const steps = [{attack: ["Geode Golem"]}, {to: {turn: 1, phase: "COMBAT_DAMAGE"}}, {resolve: true}];
  const {state: s} = run(setup(["Wastes", "Wastes"]), steps);
  eq(s.awaiting?.choices?.map((c) => s.objects[c.objectId].card), ["Bear"], "its commander offered, no tax yet");
  /* Cast once before: {2} owed -- offered with two lands untapped, not with one. */
  const taxed = (lands) => {
    const t = createState({matchId: "m", seed: "tax", players: [{name: "Rob"}, {name: "Maya"}]});
    const bear = addObject(t, {card: "Bear", ...F.Bear, owner: 0, controller: 0, commander: true}, "command", 0);
    for (let i = 0; i < lands; i += 1) addObject(t, {card: "Wastes", types: ["Land"], abilities: [{id: "a0", kind: "mana", tapSelf: true, produces: {C: 1}}], owner: 0, controller: 0}, "battlefield", null);
    t.players[0].commanderCasts = {[bear]: 1};
    return ASKING.play.open(t, {from: "command", free: true}, {controller: 0, source: null}) ? t.awaiting.choices.map((c) => c.owed) : [];
  };
  eq([taxed(2), taxed(1)], [[2], []], "its tax of {2}: owed, and payable with two lands, not one");
}
{
  /* For its mana value in any mana (Tinybones): Maya's {1}{R} Ogre from her graveyard with two Wastes -- and it enters
     under his control (CR 608.3a), hers still. With one Wastes, nothing offered. */
  const fix = {...F, Ogre: creature("{1}{R}", {colors: ["R"], power: 3, toughness: 3})};
  const steps = [{attack: ["Tinybones, the Pickpocket"]}, {to: {turn: 1, phase: "COMBAT_DAMAGE"}}, {choose: ["Ogre"]}, {resolve: true}];
  const {state: s} = run([at(0, "battlefield", "Tinybones, the Pickpocket", "Wastes", "Wastes"), at(1, "graveyard", "Ogre")], [...steps, {choose: ["Ogre"]}, {resolve: true}], fix);
  const ogre = s.zones.battlefield.find((id) => s.objects[id].card === "Ogre");
  eq([s.objects[ogre]?.controller, s.objects[ogre]?.owner, s.zones.battlefield.filter((id) => s.objects[id].card === "Wastes").every((id) => s.objects[id].tapped)], [0, 1, true],
    "his Ogre, hers by ownership, his two Wastes tapped for it");
  const {state: t} = run([at(0, "battlefield", "Tinybones, the Pickpocket", "Wastes"), at(1, "graveyard", "Ogre")], steps, fix);
  eq([t.awaiting ?? null, t.zones.graveyard[1].some((id) => t.objects[id].card === "Ogre")], [null, true], "one Wastes: nothing offered, the Ogre stays");
}
{
  /* What an earlier effect moved: "exile the top card of your library; you may cast it without paying its mana cost". */
  const WONDER = {types: ["Sorcery"], manaCost: "{1}", colors: [], spell: {id: "s", text: "Exile the top card of your library. You may cast it without paying its mana cost.", targets: [],
    effects: [{effect: "moveZone", fromTop: 1, to: "exile", remember: true}, {effect: "play", from: "targets", targets: "remembered", free: true}]}};
  const {state: s} = runScenario({name: "wonder", library: ["Bear"], setup: [at(0, "battlefield", "Wastes"), at(0, "hand", "Wonder")],
    steps: [{tap: "Wastes"}, {cast: "Wonder"}, {resolve: true}, {choose: ["Bear"]}, {resolve: true}], expect: []}, cards.definition, {...F, Wonder: WONDER});
  eq(s.zones.battlefield.some((id) => s.objects[id].card === "Bear"), true, "the exiled Bear cast, and on the battlefield");
  eq(missingFor({apis: ["Play"]}), [], "the catalog credits Play");
}

console.log(`engine-play: ${checks} checks passed — a card within the mana value, free, cast whatever the timing; a commander from the command zone, its tax paid; a target for its mana value in any mana, under its caster's control; nothing to cast, nothing asked.`);
