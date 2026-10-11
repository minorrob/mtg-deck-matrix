/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* TRAIN C, W2D: COPIES OF A SET, AND OF A CARD FROM AMONG THOSE THAT LEFT A GRAVEYARD (CR 707.2, 611.2c, 400.7e, 608.2h,
 * 704.5p, 301.5c).
 *
 *   1. "Each nonland permanent you control becomes a copy of target non-Aura permanent" (Mirrorform): becomeCopy's `selector`
 *      (effects/permanents.mjs), each permanent it matches as the effect begins (CR 611.2c) becoming a copy of the target --
 *      the target among them a copy of itself, which changes nothing. One that arrives later is not among them.
 *   2. What that leaves attached (rules/sba.mjs): a creature attached to anything, or a permanent neither an Aura nor an
 *      Equipment, becomes unattached (CR 704.5p) -- an Equipment or an Aura that became a copy of a creature -- and an
 *      Equipment that is also a creature equips nothing (CR 301.5c).
 *   3. "Become a copy of an artifact or creature card from among those cards" (Spirit of Resilience): chooseCard's `zone:
 *      "any"` beside `among`, each card wherever it went that a leaving trigger can find (CR 400.7e), read as it is there
 *      (CR 608.2h) -- a card in exile, a permanent copying something -- and a face-down card is no artifact or creature
 *      card.
 */
import assert from "node:assert/strict";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {compileScript} from "../game/engine/cards/index.mjs";
import {characteristicsOf} from "../game/engine/rules/layers.mjs";
import {runEffects} from "../game/engine/script/effects/index.mjs";
import {beginResolution} from "../game/engine/script/resolution.mjs";
import {awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {checkStateBasedActions} from "../game/engine/rules/sba.mjs";
import {addObject, moveObject} from "../game/engine/state/index.mjs";

let checks = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const creature = (subtypes, p, t, more = {}) => ({types: ["Creature"], subtypes, manaCost: "{1}{G}", colors: ["G"], power: p, toughness: t, ...more});
const FIX = {
  Bear: creature(["Bear"], 2, 2), Ogre: creature(["Ogre"], 3, 3), Elk: creature(["Elk"], 4, 4),
  Relic: {types: ["Artifact"], subtypes: [], manaCost: "{2}", colors: []},
  "Ward Charm": {types: ["Enchantment"], subtypes: ["Aura"], manaCost: "{W}", colors: ["W"], enchant: {what: "permanent", types: ["Creature"]}},
};
const table = (setup) => runScenario({name: "copy-set", setup, steps: []}, index.definition, FIX).state;
const ids = (s, name) => s.zones.battlefield.filter((id) => s.objects[id].card === name);
const idOf = (s, name) => ids(s, name)[0];
const look = (s, id) => { const c = characteristicsOf(s, id); return [s.objects[id].card, c.types, c.power, c.toughness]; };
/* An Aura put onto the battlefield enchanting `host` (it enters attached, CR 303.4f). */
const enchanting = (s, host) => {
  const id = addObject(s, {...FIX["Ward Charm"], card: "Ward Charm", owner: 0, controller: 0}, "battlefield");
  s.objects[id].attachedTo = host;
  s.objects[host].attachments = [...(s.objects[host].attachments ?? []), id];
  return id;
};
const MIRROR = (target) => [{effect: "becomeCopy", selector: {what: "permanent", nonTypes: ["Land"], controller: "you"}, targets: [target]}];

/* ---- 1. each of a set ---- */
{
  const s = table([{seat: 0, zone: "battlefield", cards: ["Bear", "Relic", "Forest"]}, {seat: 1, zone: "battlefield", cards: ["Ogre"]}]);
  const [bear, relic, forest] = ["Bear", "Relic", "Forest"].map((n) => idOf(s, n));
  runEffects(s, MIRROR(idOf(s, "Ogre")), {controller: 0, source: null});
  eq([look(s, bear), look(s, relic), s.objects[forest].card], [["Ogre", ["Creature"], 3, 3], ["Ogre", ["Creature"], 3, 3], "Forest"], "the Bear and the Relic are Ogres; the Forest is a Forest");
  eq(look(s, ids(s, "Ogre").find((id) => s.objects[id].controller === 1)), ["Ogre", ["Creature"], 3, 3], "Maya's Ogre itself unchanged");
}
{
  /* The set is fixed as it begins (CR 611.2c): one put onto the battlefield after is itself. The target among them: itself. */
  const s = table([{seat: 0, zone: "battlefield", cards: ["Bear", "Elk"]}]);
  runEffects(s, MIRROR(idOf(s, "Elk")), {controller: 0, source: null});
  const late = addObject(s, {...FIX.Bear, card: "Bear", owner: 0, controller: 0}, "battlefield");
  eq([ids(s, "Elk").length, look(s, late)], [2, ["Bear", ["Creature"], 2, 2]], "Bear and Elk are both Elks; the Bear put there later is a Bear");
}

/* ---- 2. what that leaves attached ---- */
{
  /* Rob's Warhammer equips his Bear and his Ward Charm enchants it; both become copies of Maya's Ogre: creatures, unattached
     (CR 704.5p) -- the Warhammer stays on the battlefield, as does the Charm, an Aura no longer. */
  const s = table([{seat: 0, zone: "battlefield", cards: ["Bear", "Loxodon Warhammer"]}, {seat: 1, zone: "battlefield", cards: ["Ogre"]}]);
  const [bear, hammer] = ["Bear", "Loxodon Warhammer"].map((n) => idOf(s, n));
  runEffects(s, [{effect: "attach", source: hammer, targets: [bear]}], {controller: 0, source: hammer});
  const charm = enchanting(s, bear);
  checkStateBasedActions(s);
  eq([s.objects[hammer].attachedTo, s.objects[charm].attachedTo], [bear, bear], "before: the Warhammer equips the Bear, the Charm enchants it");
  runEffects(s, [{effect: "becomeCopy", targets: [ids(s, "Ogre").find((id) => s.objects[id].controller === 1)], selector: {what: "permanent", types: ["Artifact"], controller: "you"}}], {controller: 0, source: null});
  runEffects(s, [{effect: "becomeCopy", targets: [ids(s, "Ogre").find((id) => s.objects[id].controller === 1)], selector: {what: "permanent", types: ["Enchantment"], controller: "you"}}], {controller: 0, source: null});
  checkStateBasedActions(s);
  eq([s.objects[hammer].attachedTo ?? null, s.objects[charm].attachedTo ?? null, s.objects[bear].attachments, s.objects[hammer].zone, s.objects[charm].zone],
    [null, null, [], "battlefield", "battlefield"], "after: both creatures, unattached and on the battlefield");
}
{
  /* An Equipment that is also a creature equips nothing (CR 301.5c): one animated is unattached. An Aura still legal stays. */
  const s = table([{seat: 0, zone: "battlefield", cards: ["Bear", "Loxodon Warhammer"]}]);
  const [bear, hammer] = ["Bear", "Loxodon Warhammer"].map((n) => idOf(s, n));
  runEffects(s, [{effect: "attach", source: hammer, targets: [bear]}], {controller: 0, source: hammer});
  const charm = enchanting(s, bear);
  checkStateBasedActions(s);
  eq(s.objects[charm].attachedTo, bear, "a legal Aura stays attached");
  runEffects(s, [{effect: "animate", targets: [hammer], power: 3, toughness: 3}], {controller: 0, source: null});
  checkStateBasedActions(s);
  eq([s.objects[hammer].attachedTo ?? null, s.objects[charm].attachedTo], [null, bear], "the Warhammer, now a creature, equips nothing; the Charm stays");
}
{
  /* Neither an Aura nor an Equipment (CR 704.5p): the Warhammer a copy of a Relic, a noncreature artifact, is unattached too. */
  const s = table([{seat: 0, zone: "battlefield", cards: ["Bear", "Loxodon Warhammer", "Relic"]}]);
  const [bear, hammer, relic] = ["Bear", "Loxodon Warhammer", "Relic"].map((n) => idOf(s, n));
  runEffects(s, [{effect: "attach", source: hammer, targets: [bear]}], {controller: 0, source: hammer});
  runEffects(s, [{effect: "becomeCopy", targets: [relic]}], {controller: 0, source: hammer});
  checkStateBasedActions(s);
  eq([s.objects[hammer].card, s.objects[hammer].attachedTo ?? null, s.objects[hammer].zone], ["Relic", null, "battlefield"], "a Relic now, attached to nothing, still there");
}

/* ---- 3. a card from among those that left a graveyard, wherever it went ---- */
const among = (s, cards, until = "end-of-turn") => beginResolution(s, [
  {effect: "chooseCard", zone: "any", among: "those cards", selector: {anyOf: [{types: ["Artifact"]}, {types: ["Creature"]}]}, upTo: true, to: "stay", remember: true},
  {effect: "becomeCopy", targets: "remembered", until}], {controller: 0, source: idOf(s, "Spirit of Resilience"), about: {cards}});
{
  /* An Ogre card in exile, a Bear card returned to the battlefield as a copy of an Elk, a face-down card in exile: each
     where it is now; the face-down one no artifact or creature card (CR 708.2). */
  const s = table([{seat: 0, zone: "battlefield", cards: ["Spirit of Resilience", "Elk"]}, {seat: 0, zone: "exile", cards: ["Ogre"]}, {seat: 0, zone: "graveyard", cards: ["Relic"]}]);
  const ogre = s.zones.exile.find((id) => s.objects[id].card === "Ogre");
  const relic = moveObject(s, s.zones.graveyard[0][0], "exile", null, {faceDown: true});
  const bear = addObject(s, {...FIX.Bear, card: "Bear", owner: 0, controller: 0}, "battlefield");
  runEffects(s, [{effect: "becomeCopy", targets: [idOf(s, "Elk")]}], {controller: 0, source: bear});
  among(s, [ogre, relic, bear]);
  eq(awaitingChoice(s).options.map((o) => o.label), ["Ogre", "Elk"], "the Ogre in exile, the Bear card on the battlefield as the Elk it copies; not the face-down card");
  eq(awaitingChoice(s).title, "Choose a card from among them", "chosen, not searched for");
  const spirit = idOf(s, "Spirit of Resilience");
  resolveAwaiting(s, [1]);
  eq(look(s, spirit), ["Elk", ["Creature"], 4, 4], "and the Spirit is an Elk -- the copy's copiable values (CR 707.3), not the Bear card's");
}
{
  /* A card that moved again since is a new object (CR 400.7): no longer one of them. None left that fit, nobody asked. */
  const s = table([{seat: 0, zone: "battlefield", cards: ["Spirit of Resilience"]}, {seat: 0, zone: "exile", cards: ["Ogre"]}]);
  const ogre = s.zones.exile[0];
  moveObject(s, ogre, "graveyard", 0);
  const out = among(s, [ogre]);
  eq([out.status, s.objects[idOf(s, "Spirit of Resilience")].card], ["done", "Spirit of Resilience"], "the Ogre moved on: nothing to choose, and the Spirit is itself");
}

{
  const compiled = (effect) => compileScript({schema: "CrankCardScript@1",
    identity: {name: "Odd Spirit", oracleId: "x", types: ["Creature"], subtypes: ["Spirit"], manaCost: "{R}", colors: ["R"], colorIdentity: ["R"], power: 1, toughness: 1},
    oracleText: "x", source: "hand", abilities: [{kind: "triggered", text: "x", trigger: {on: "left graveyard", batch: true}, effects: [{effect: "chooseCard", to: "stay", ...effect}]}]}).problems;
  eq(compiled({zone: "any", among: "those cards"}), [], "any zone, among those cards: compiles");
  eq(compiled({zone: "any"}).some((p) => p.includes("any zone is among cards named before it")), true, "any zone with nothing to be among: refused, never a search");
}

console.log(`engine-copy-set: ${checks} checks passed -- each of a set a copy, fixed as it begins; what it leaves attached unattached; a card from among those that left a graveyard, where it is now.`);
