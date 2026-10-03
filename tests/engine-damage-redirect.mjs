/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* M4 PHASE 3, BATCH 71 (THE CATALOG'S ORDER): DAMAGE REPLACED (Forge's DamageDone), ITS REMAINING FORMS -- and what three
 * of its cards needed besides.
 *
 * Prevention with what follows (CR 615.5): "prevent that damage and each opponent mills that many cards" (The
 * Mindskinner), "put a +1/+1 counter on that creature for each 1 damage prevented this way" (Vigor's) -- done immediately
 * after the damage event, about what the damage would have been dealt to, "that many" the damage stopped. Redirection
 * (CR 614.9): "all damage that would be dealt to you is dealt to enchanted creature instead" (Pariah) -- the same damage,
 * which the other replacements then see where it now goes. Damage to a player only (`toPlayer`). Besides: "you have
 * hexproof" (CR 702.11c), and "discard two cards" as a cost.
 */
import assert from "node:assert/strict";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {applyReplacements} from "../game/engine/rules/replacement.mjs";
import {legalActions, applyAction} from "../game/engine/rules/actions.mjs";
import {characteristicsOf} from "../game/engine/rules/layers.mjs";
import {runEffects} from "../game/engine/script/effects/index.mjs";
import {amountProblems} from "../game/engine/script/amount.mjs";
import {validateScript} from "../game/engine/script/schema.mjs";
import {compileScript} from "../game/engine/cards/index.mjs";
import {missingFor} from "../game/tools/engine-constructs.mjs";
import {loadCardIndex, loadCardScripts} from "../game/tools/engine-cards.mjs";

let checks = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const cards = loadCardIndex();
const at = (seat, zone, ...names) => ({seat, zone, cards: names});
const creature = (cost, power, more = {}) => ({types: ["Creature"], manaCost: cost, colors: ["G"], power, toughness: power, ...more});
const replacement = (text, watches, change) => ({id: "r", kind: "replacement", text, watches, change});
/* Vigor's replacement, on a fixture: "If damage would be dealt to another creature you control, prevent that damage. Put
   a +1/+1 counter on that creature for each 1 damage prevented this way." */
const SHIELD = replacement("Vigor's", {event: "damage", toCard: {types: ["Creature"], controller: "you", another: true}},
  {prevent: true, then: [{effect: "putCounter", targets: "that card", counter: "+1/+1", count: {damagePrevented: true}}]});
/* A prevention whose consequence counts nothing: "prevent that damage and you gain 1 life". */
const WARD = replacement("Warding", {event: "damage", toPlayer: "you"}, {prevent: true, then: [{effect: "gainLife", amount: 1}]});
const FIX = {
  Bear: creature("{1}{G}", 2), Ogre: creature("{2}{R}", 3), Elf: creature("{G}", 1),
  Spark: {types: ["Instant"], manaCost: "{R}", colors: ["R"], spell: {id: "s", text: "Deal 2 damage to any target.",
    targets: [{anyOf: [{what: "permanent", types: ["Creature"]}, {what: "player"}]}], effects: [{effect: "dealDamage", amount: 2, targets: {target: 0}, who: {target: 0}}]}},
  Thopter: creature("{1}", 1, {types: ["Artifact", "Creature"], colors: []}),
  Keeper: creature("{3}{G}", 6, {abilities: [SHIELD]}), Warden: creature("{1}{W}", 1, {abilities: [WARD]}), Warden2: creature("{1}{W}", 1, {abilities: [WARD]}),
};
const scenario = (setup, steps = [], seats = 2) => runScenario({name: "damage redirect", seats, setup, steps, expect: []}, cards.definition, FIX).state;
const named = (s, name, zone = "battlefield") => Object.values(s.objects).filter((o) => o.card === name && o.zone === zone).map((o) => o.id);
const deal = (s, by, to, amount, source = null) => runEffects(s, [{effect: "dealDamage", amount, ...(to.player !== undefined ? {toPlayer: to.player} : {targets: [to.card]})}], {controller: by, source});

{
  /* The catalog's credit. */
  eq(missingFor({replacements: ["DamageDone"]}), [], "DamageDone is built");
}
{
  /* Losheel: combat damage to an attacking artifact creature of Rob's is prevented; not noncombat damage, not a creature
     that is not attacking. */
  const s = scenario([at(0, "battlefield", "Losheel, Clockwork Scholar", "Thopter", "Thopter")], [{attack: ["Thopter"]}]);
  const [attacking, home] = named(s, "Thopter").sort((a, b) => (s.combat.attacks.some((x) => x.attacker === a) ? -1 : 1));
  const after = (to, combat) => applyReplacements(s, {event: "damage", toCard: to, amount: 3, sourceId: null, combat}).proposal;
  eq([after(attacking, true).prevented, after(attacking, false).amount, after(home, true).amount], [true, 3, 3], "combat damage to the attacker prevented; nothing else");
}
{
  /* Prevention with what follows: Vigor's -- 3 to Rob's Bear prevented, and three +1/+1 counters on it; to the Keeper itself,
     dealt ("another"). */
  const s = scenario([at(0, "battlefield", "Keeper", "Bear")], [], 2);
  const [bear] = named(s, "Bear"), [keeper] = named(s, "Keeper");
  const events = deal(s, 1, {card: bear}, 3);
  eq([s.objects[bear].damage, s.objects[bear].counters["+1/+1"], characteristicsOf(s, bear).power], [0, 3, 5], "no damage; three counters: a 5/5");
  eq(events.some((e) => e.kind === "GameEventCardDamaged"), false, "a prevented event does not happen (CR 615.4)");
  deal(s, 1, {card: keeper}, 2);
  eq(s.objects[keeper].damage, 2, "the Keeper's own damage is dealt");
  /* In combat too: the follow-up runs where combat damage is dealt. */
  const t = scenario([at(1, "battlefield", "Keeper", "Elf"), at(0, "battlefield", "Ogre")], [{attack: ["Ogre"]}]);
  const ogre = named(t, "Ogre")[0];
  eq(applyReplacements(t, {event: "damage", toCard: named(t, "Elf")[0], amount: 3, sourceId: ogre, combat: true}).proposal.followUps.length, 1,
    "combat damage to Maya's Elf: prevented, with its follow-up waiting for the damage step");
}
{
  /* Nothing left to prevent, nothing follows: two Wardens, one damage event -- the first prevents it, the second sees none. */
  const s = scenario([at(0, "battlefield", "Warden", "Warden2")], [], 2);
  deal(s, 1, {player: 0}, 4);
  eq(s.players[0].life, 41, "4 prevented, 1 life gained, once");
}
{
  /* Redirection, then the replacements as the damage now is: Rob's Pariah on his own Elf, and his Crystal Barricade
     preventing noncombat damage to his other creatures -- Maya's 2 at Rob go to the Elf, and are prevented there. */
  const s = scenario([at(0, "hand", "Pariah"), at(0, "battlefield", "Plains", "Wastes", "Wastes", "Elf", "Crystal Barricade")],
    [{tap: "Plains"}, {tap: "Wastes"}, {tap: "Wastes"}, {cast: "Pariah", targets: [{card: "Elf"}]}, {resolve: true}]);
  const [elf] = named(s, "Elf"), [pariah] = named(s, "Pariah");
  deal(s, 1, {player: 0}, 2);
  eq([s.players[0].life, s.objects[elf].damage], [40, 0], "redirected to the Elf, then prevented there");
  deal(s, 0, {player: 1}, 3);
  eq([s.players[1].life, s.objects[elf].damage], [37, 0], "damage to Maya is hers: \"dealt to you\" is Rob's only");
  /* An Aura that enchants nothing (its creature gone, before the state-based action): the damage stays Rob's. */
  s.objects[elf].attachments = [];
  s.objects[pariah].attachedTo = null;
  deal(s, 1, {player: 0}, 2);
  eq(s.players[0].life, 38, "enchanting nothing, it redirects nothing");
}
{
  /* "You have hexproof": not a target for Maya's spells -- and still for Rob's own. */
  const s = scenario([at(0, "battlefield", "Crystal Barricade", "Mountain"), at(0, "hand", "Spark")], [{tap: "Mountain"}]);
  eq(legalActions(s, 0).filter((a) => a.kind === "cast").map((a) => a.targetNames.join("")).sort(), ["Crystal Barricade", "Maya", "Rob"], "Rob may aim his own Spark at himself");
}
{
  /* "Discard two cards": one offer per pair, both discarded -- two discards, each seen as one. One card is not enough. */
  const s = scenario([at(0, "battlefield", "Solphim, Mayhem Dominus", "Wastes"), at(0, "hand", "Bear", "Ogre")], [{tap: "Wastes"}]);
  const offers = legalActions(s, 0).filter((a) => a.kind === "activate");
  eq(offers.map((a) => a.costNames), [["Bear", "Ogre"]], "two cards in hand: one pair");
  const events = applyAction(s, 0, offers[0]);
  eq([events.filter((e) => e.data?.fields?.discarded === true).length, named(s, "Bear", "graveyard").length + named(s, "Ogre", "graveyard").length], [2, 2], "both discarded, each a discard");
  const t = scenario([at(0, "battlefield", "Solphim, Mayhem Dominus", "Wastes"), at(0, "hand", "Bear")], [{tap: "Wastes"}]);
  eq(legalActions(t, 0).filter((a) => a.kind === "activate").length, 0, "one card: it can't be activated");
}
{
  /* The grammar: what follows a prevention is effects, after a prevention only, nothing that asks; a redirection goes to
     what the holder enchants; "that many" prevented is an amount. */
  const pariah = structuredClone(loadCardScripts().find(({script}) => script.identity.name === "Pariah").script);
  const mind = structuredClone(loadCardScripts().find(({script}) => script.identity.name === "The Mindskinner").script);
  eq([validateScript(pariah).valid, validateScript(mind).valid], [true, true], "Pariah and The Mindskinner as written");
  pariah.abilities[1].change.redirect = "you";
  delete mind.abilities[1].change.prevent;
  eq([validateScript(pariah).errors.some((e) => e.path.endsWith("change.redirect")), validateScript(mind).errors.some((e) => e.path.endsWith("change.then"))],
    [true, true], "a redirection elsewhere, and a follow-up with no prevention: refused");
  const sloppy = structuredClone(loadCardScripts().find(({script}) => script.identity.name === "The Mindskinner").script);
  sloppy.abilities[1].change.then = [{effect: "millCards", count: 1}];
  eq(validateScript(sloppy).errors.some((e) => e.path.includes("change.then[0]")), true, "a follow-up held to the effect grammar: no primitive millCards");
  const asking = structuredClone(loadCardScripts().find(({script}) => script.identity.name === "The Mindskinner").script);
  asking.abilities[1].change.then = [{effect: "scry", count: 1}];
  eq(compileScript(asking).problems.some((p) => p.includes("scry follows a prevention")), true, "a follow-up that would ask: not playable");
  eq(amountProblems({damagePrevented: true}), [], "\"that many\" prevented is an amount");
}

console.log(`engine-damage-redirect: ${checks} checks passed`);
