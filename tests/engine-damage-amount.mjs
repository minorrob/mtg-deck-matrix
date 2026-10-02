/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* M4 PHASE 3, BATCH 46 (THE CATALOG'S ORDER): THE DAMAGE DEALT, COUNTED (Forge's DamageAmount) -- "THAT MUCH", "THAT MANY".
 *
 * Batch 26 read it from one damage event. Here it is all of an action's damage together: Enrage's "create that many" for
 * two hits at once is one trigger of their sum, and "one or more creatures deal combat damage to a player" adds them up.
 * "Whenever a Dragon you control is dealt damage, it deals that much damage" is about the creature dealt it -- each
 * creature its own trigger, "that creature's controller" its controller, even when the damage was lethal. And a token's
 * size may be counted: "an X/X ... where X is the amount of damage".
 */
import assert from "node:assert/strict";
import {createState, addObject} from "../game/engine/state/index.mjs";
import {collectTriggers} from "../game/engine/rules/trigger.mjs";
import {runEffects} from "../game/engine/script/effects/index.mjs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {missingFor} from "../game/tools/engine-constructs.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";

let checks = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const cards = loadCardIndex();
const card = (name) => ({...cards.definition(name), card: name});
const table = () => createState({matchId: "m", seed: "damage-amount", players: [{name: "Rob"}, {name: "Maya"}]});
const on = (s, o, seat) => addObject(s, {...o, owner: seat, controller: seat}, "battlefield", null);
const triggered = (s, events) => { s.pendingTriggers = []; collectTriggers(s, events); return s.pendingTriggers; };
const hit = (s, targets, amount = 1) => ({effect: "dealDamage", targets, amount});
const WYRM = {card: "Wyrm", types: ["Creature"], subtypes: ["Dragon"], power: 3, toughness: 3};
const BEAR = {card: "Bear", types: ["Creature"], power: 2, toughness: 2};

{
  /* Enrage: two hits in one action are one trigger, about their sum. */
  const s = table();
  const nest = on(s, card("Hornet Nest"), 0);
  const once = triggered(s, runEffects(s, [hit(s, [nest]), hit(s, [nest])], {controller: 1, source: null}));
  eq([once.length, once[0].about.amount], [1, 2], "Hornet Nest dealt 1 and 1 in one action: one trigger, that many is 2");
  const body = on(s, {...card("Body of Knowledge")}, 0);
  eq(triggered(s, runEffects(s, [hit(s, [body], 3)], {controller: 1, source: null}))[0].about.amount, 3, "one hit of 3: 3");
}
{
  /* About the creature dealt it: each Dragon its own trigger, with its own damage; not Maya's Dragon, not a Bear. */
  const s = table();
  on(s, card("Wrathful Red Dragon"), 0);
  const a = on(s, WYRM, 0), b = on(s, WYRM, 0), hers = on(s, WYRM, 1), bear = on(s, BEAR, 0);
  const each = triggered(s, runEffects(s, [hit(s, [a], 1), hit(s, [b], 2), hit(s, [a], 1), hit(s, [hers], 1), hit(s, [bear], 1)], {controller: 1, source: null}));
  eq(each.map((t) => [t.about.card, t.about.amount]).sort(), [[a, 2], [b, 2]].sort(), "two of his Dragons dealt damage: one trigger each, about it and its own damage -- not Maya's Dragon, not the Bear");
  eq(each.map((t) => t.about.player), [0, 0], "\"that creature's controller\": Rob");
}
{
  /* Repercussion: "that creature's controller" is the damaged creature's, not the source's. */
  const s = table();
  on(s, card("Repercussion"), 0);
  const bear = on(s, BEAR, 1);
  const source = on(s, {...BEAR, card: "Ogre"}, 0);
  eq(triggered(s, runEffects(s, [hit(s, [bear], 2)], {controller: 0, source}))[0].about.player, 1, "Rob's Ogre deals 2 to Maya's Bear: about Maya");
  /* "Whenever this creature is dealt damage" is as it was: about the source and its controller ("that source's
     controller sacrifices that many"). */
  const nest = on(s, card("Hornet Nest"), 1);
  const self = triggered(s, runEffects(s, [hit(s, [nest], 1)], {controller: 0, source}));
  eq(self.filter((t) => t.source.name === "Hornet Nest").map((t) => [t.about.card, t.about.player]), [[source, 0]], "Hornet Nest's own trigger: about the Ogre and Rob");
}
{
  /* "Whenever enchanted creature is dealt damage": only that creature. */
  const s = table();
  const bear = on(s, BEAR, 0), other = on(s, BEAR, 0);
  const aura = on(s, {card: "Ward of Pain", types: ["Enchantment"], subtypes: ["Aura"], abilities: [{id: "p", kind: "triggered", text: "Whenever enchanted creature is dealt damage, you gain that much life.",
    trigger: {on: "GameEventCardDamaged", to: "enchanted", batch: true}, effects: [{effect: "gainLife", amount: {damageDealt: true}}]}]}, 0);
  s.objects[aura].attachedTo = bear; s.objects[bear].attachments = [aura];
  eq(triggered(s, runEffects(s, [hit(s, [other], 1)], {controller: 1, source: null})).length, 0, "the other Bear dealt damage: nothing");
  eq(triggered(s, runEffects(s, [hit(s, [bear], 1)], {controller: 1, source: null})).map((t) => t.about.card), [bear], "the enchanted Bear: it triggers, about it");
}
{
  /* Lethal: Wrathful Red Dragon dealt 5 dies, and still deals 5 -- the trigger was collected before it died. */
  const fixtures = {Blast: {types: ["Instant"], manaCost: "{R}", colors: ["R"], spell: {id: "s", text: "Blast deals 5 damage to target creature.", targets: [{what: "permanent", types: ["Creature"]}],
    effects: [{effect: "dealDamage", amount: 5, targets: {target: 0}}]}}};
  const {passed} = runScenario({name: "lethal", setup: [{seat: 0, zone: "battlefield", cards: ["Wrathful Red Dragon", "Mountain"]}, {seat: 0, zone: "hand", cards: ["Blast"]}],
    steps: [{tap: "Mountain"}, {cast: "Blast", targets: [{card: "Wrathful Red Dragon"}]}, {resolve: true}, {choose: ["Maya"]}, {resolve: true}],
    expect: [{seat: 0, zone: "graveyard", cards: ["Blast", "Wrathful Red Dragon"]}, {seat: 1, life: 35}]}, cards.definition, fixtures);
  eq(passed.length, 2, "dealt 5, it dies -- and deals 5 to Maya");
}
{
  /* A token's size, counted as it is made. */
  const s = table();
  runEffects(s, [{effect: "createToken", token: {name: "Dinosaur Beast", types: ["Creature"], power: {damageDealt: true}, toughness: {damageDealt: true}}}], {controller: 0, source: null, about: {amount: 4}});
  const made = s.zones.battlefield.map((id) => s.objects[id]).find((o) => o.card === "Dinosaur Beast");
  eq([made.power, made.toughness], [4, 4], "\"an X/X ... where X is the amount of damage\": 4/4 for 4");
}
{
  eq(missingFor({counts: ["DamageAmount"]}), [], "the catalog credits the count");
}

console.log(`engine-damage-amount: ${checks} checks passed — that much, all of an action's damage together; about the creature dealt it, each its own; its controller; lethal still counts; a token sized by it.`);
