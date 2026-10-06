/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* WHICH PERMISSION A CARD IS PLAYED THROUGH, AND WHAT IT DOES WITH IT (Serra Paragon, Bolas's Citadel; AI 3's Teysa deck and
 * AI 2's Kiora deck).
 *
 * rules/actions.mjs: two permanents may let a player play the same card, and do different things -- Serra Paragon's land or
 * permanent "gains" an ability (`grants`), Bolas's Citadel's spell costs life equal to its mana value rather than its mana
 * cost (`payLife: "manaValue"`, CR 118.9; X as 0, CR 107.3b), Thundermane Dragon's gains haste. Each that does something
 * different is an offer of its own (`via`); ones that do alike are one, as before. What a permission grants is a layer-6
 * effect on the permanent for as long as it is that object (CR 611.2a, 400.7); "When this permanent is put into a graveyard
 * from the battlefield" is the trigger `leaves` with `to: "graveyard"`. The card scenarios play both cards; this suite holds
 * the offers, the refusal of an offer changed, the grant gone with a new object, a card with no mana cost, and the gains.
 */
import assert from "node:assert/strict";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {legalActions, applyAction} from "../game/engine/rules/actions.mjs";
import {abilitiesOf, keywordsOf} from "../game/engine/rules/layers.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };
const throws = (fn, pattern, m) => { assert.throws(fn, pattern, m); checks += 1; };

const cards = loadCardIndex();
const P = "Serra Paragon", CIT = "Bolas's Citadel";
const FIX = {Bear: {types: ["Creature"], subtypes: ["Bear"], manaCost: "{1}{G}", colors: ["G"], power: 2, toughness: 2},
  Giant: {types: ["Creature"], subtypes: ["Giant"], manaCost: "{3}{G}", colors: ["G"], power: 4, toughness: 4},
  Terrace: {types: ["Artifact"], manaCost: "{1}", colors: [], abilities: [{id: "q", kind: "static", text: "Once during each of your turns, you may play a land from your graveyard.",
    rule: "play-from", affects: {what: "player", who: "you"}, zone: "graveyard", lands: true, yourTurn: true, limit: 1}]},
  Pyre: {types: ["Artifact"], manaCost: "{1}", colors: [], abilities: [{id: "y", kind: "static", text: "You may cast spells from your graveyard. If a spell cast this way would be put into your graveyard, exile it instead.",
    rule: "play-from", affects: {what: "player", who: "you"}, zone: "graveyard", spells: true, graveyardToExile: true}]},
  Conduit: {types: ["Artifact"], manaCost: "{1}", colors: [], abilities: [{id: "c", kind: "static", text: "You may cast spells from your graveyard.",
    rule: "play-from", affects: {what: "player", who: "you"}, zone: "graveyard", spells: true}]},
  Gift: {types: ["Instant"], manaCost: "{1}", colors: [], spell: {id: "s", text: "You gain 1 life.", targets: [], effects: [{effect: "gainLife", amount: 1}]}},
  Vision: {types: ["Sorcery"], manaCost: "", colors: ["U"], spell: {id: "s", text: "Draw a card.", targets: [], effects: [{effect: "draw", count: 1}]}},
  Recall: {types: ["Instant"], manaCost: "{U}", colors: ["U"], spell: {id: "s", text: "Return target creature to its owner's hand.", targets: [{what: "permanent", types: ["Creature"]}],
    effects: [{effect: "moveZone", targets: {target: 0}, to: "hand"}]}}};
const at = (seat, zone, ...list) => ({seat, zone, cards: list});
const play = (scenario) => runScenario({name: "permission", ...scenario}, cards.definition, FIX).state;
const offers = (s, kind, label) => legalActions(s, 0).filter((a) => a.kind === kind && a.label === label);
const named = (s, name) => s.zones.battlefield.find((id) => s.objects[id].card === name);
const granted = (s, id) => abilitiesOf(s, id).some((a) => a.kind === "triggered" && a.text.startsWith("When this permanent is put into a graveyard"));

/* ---- two permissions that differ: each its own offer; two alike: one ---- */
{
  const setup = [at(0, "battlefield", P, "Crucible of Worlds"), at(0, "graveyard", "Mountain", "Bear")];
  const s = play({setup});
  eq(offers(s, "play-land", "Mountain").map((a) => a.viaName).sort(), ["Crucible of Worlds", P], "Crucible and Paragon: a Mountain offered through each");
  const t = play({setup: [at(0, "battlefield", "Crucible of Worlds", "Ramunap Excavator"), at(0, "graveyard", "Mountain")]});
  eq(offers(t, "play-land", "Mountain").map((a) => a.via ?? null), [null], "Crucible and Ramunap Excavator do alike: one offer, as before");
  const v = play({setup: [at(0, "battlefield", "Pyre", "Conduit", "Wastes"), at(0, "graveyard", "Gift")], steps: [{tap: "Wastes"}]});
  eq(offers(v, "cast", "Gift").map((a) => a.via ?? null), [null], "a Pyre that exiles afterward and a Conduit that does not, alike else: one offer");
  applyAction(v, 0, offers(v, "cast", "Gift")[0]);
  eq(v.stack.at(-1).graveyardToExile, undefined, "cast through the Conduit, the one with no drawback: nothing to exile");
  const w = play({setup: [at(0, "battlefield", P, "Terrace", "Crucible of Worlds"), at(0, "graveyard", "Mountain")]});
  eq(offers(w, "play-land", "Mountain").map((a) => a.viaName).sort(), ["Crucible of Worlds", P], "a once-each-turn Terrace that gives nothing is passed over for the Crucible, which does the same with no limit");
  const viaCrucible = offers(s, "play-land", "Mountain").find((a) => a.viaName === "Crucible of Worlds");
  throws(() => applyAction(s, 0, {...viaCrucible, via: 9999}), /not a legal action/, "an offer whose permission was changed is refused");
  applyAction(s, 0, viaCrucible);
  ok(!granted(s, named(s, "Mountain")), "played through the Crucible, the Mountain gains nothing");
  s.players[0].manaPool.G = 2;
  eq(offers(s, "cast", "Bear").length, 1, "and Paragon's once is left: the Bear may still be cast from the graveyard");
  const u = play({setup, steps: [{play: "Mountain", via: P}]});
  ok(granted(u, named(u, "Mountain")), "played through Paragon, it has the ability");
  u.players[0].manaPool.G = 2;
  eq(offers(u, "cast", "Bear").length, 0, "and Paragon's once is spent: no Bear");
}

/* ---- the grant lasts as long as the object: a Bear returned to hand and cast again has none ---- */
{
  const s = play({setup: [at(0, "battlefield", P, "Forest", "Forest", "Forest", "Forest", "Island"), at(0, "graveyard", "Bear"), at(0, "hand", "Recall")],
    steps: [{tap: "Forest"}, {tap: "Forest"}, {cast: "Bear"}, {resolve: true}]});
  ok(granted(s, named(s, "Bear")), "the Bear cast from the graveyard through Paragon has the ability");
  const t = play({setup: [at(0, "battlefield", P, "Forest", "Forest", "Forest", "Forest", "Island"), at(0, "graveyard", "Bear"), at(0, "hand", "Recall")],
    steps: [{tap: "Forest"}, {tap: "Forest"}, {cast: "Bear"}, {resolve: true}, {tap: "Island"}, {cast: "Recall", targets: [{card: "Bear"}]}, {resolve: true},
      {tap: "Forest"}, {tap: "Forest"}, {cast: "Bear"}, {resolve: true}]});
  ok(named(t, "Bear") !== undefined && !granted(t, named(t, "Bear")), "returned to hand and cast from there, it is a new object without it (CR 400.7)");
}

/* ---- Bolas's Citadel beside another permission for the top card: the Dragon's, paid with mana, with haste ---- */
{
  const base = {library: ["Giant"], setup: [at(0, "battlefield", CIT, "Thundermane Dragon", "Forest", "Forest", "Forest", "Forest")]};
  const s = play(base);
  eq(offers(s, "cast", "Giant").map((a) => [a.viaName, a.lifeInstead ?? null]), [[CIT, 4]], "nothing in the pool: only through the Citadel, for 4 life");
  const t = play({...base, steps: Array(4).fill({tap: "Forest"})});
  eq(offers(t, "cast", "Giant").map((a) => [a.viaName, a.lifeInstead ?? null]).sort(), [[CIT, 4], ["Thundermane Dragon", null]], "four Forests tapped: through either");
  const dragon = play({...base, steps: [...Array(4).fill({tap: "Forest"}), {cast: "Giant", via: "Thundermane Dragon"}, {resolve: true}]});
  ok(keywordsOf(dragon, named(dragon, "Giant")).includes("Haste") && dragon.players[0].life === 40 && dragon.players[0].manaPool.G === 0,
    "through the Dragon: its mana cost paid, and haste -- the gains of the permission it was cast through");
  const citadel = play({...base, steps: [...Array(4).fill({tap: "Forest"}), {cast: "Giant", via: CIT}, {resolve: true}]});
  ok(!keywordsOf(citadel, named(citadel, "Giant")).includes("Haste") && citadel.players[0].life === 36 && citadel.players[0].manaPool.G === 4,
    "through the Citadel: 4 life, the pool untouched, and no haste");
}

/* ---- a card with no mana cost: cast through the Citadel for 0 life (CR 118.6a), never from a hand ---- */
{
  const s = play({library: ["Vision"], setup: [at(0, "battlefield", CIT), at(0, "hand", "Vision")]});
  eq(offers(s, "cast", "Vision").map((a) => [a.from, a.lifeInstead]), [["library", 0]], "the Vision on top, for 0 life; the one in hand, not at all");
  const t = play({library: ["Vision"], setup: [at(0, "battlefield", CIT)], steps: [{cast: "Vision"}, {resolve: true}]});
  eq([t.players[0].life, t.zones.hand[0].length, t.zones.graveyard[0].map((id) => t.objects[id].card)], [40, 1, ["Vision"]], "cast: no life paid, a card drawn");
}

console.log(`engine-play-permission: ${checks} checks passed -- each permission that does something different its own offer, its grant on the permanent while it is that object, the Citadel's life rather than mana.`);
