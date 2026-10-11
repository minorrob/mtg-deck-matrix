/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* TRAIN C, PHASE 2 (p1-bugs): AN ABILITY'S COSTS ARE OFFERED, CHOSEN AND PAID WHEREVER IT WORKS FROM (CR 602.2).
 *
 * Eldrazi Ravager's "Sacrifice two Eldrazi: Return this card from your graveyard to your hand" was offered with only a
 * Bear on the battlefield and returned the card sacrificing nothing: the graveyard's abilities were offered for their mana
 * alone, and only a permanent's offers carried the choices its costs ask (CR 602.2b, 601.2h) -- the permanents to
 * sacrifice, the cards to discard, the creatures to tap. One function now makes an activated ability's offers wherever it
 * works from, a permanent's or a card's in a hand, the command zone or a graveyard (rules/actions.mjs, abilityOffers);
 * a cost with nothing to pay it with makes none (CR 118.3).
 */
import assert from "node:assert/strict";
import {createState, addObject} from "../game/engine/state/index.mjs";
import {beginGame, advance} from "../game/engine/rules/turn.mjs";
import {legalActions, applyAction} from "../game/engine/rules/actions.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";

let checks = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const cards = loadCardIndex();
const card = (name) => ({...cards.definition(name), card: name});
const WASTES = {card: "Wastes", types: ["Land"], supertypes: ["Basic"], abilities: [{id: "a0", kind: "mana", tapSelf: true, produces: {C: 1}}]};
const being = (name, subtypes, more = {}) => ({card: name, types: ["Creature"], subtypes, manaCost: "{1}", colors: [], power: 1, toughness: 1, ...more});
const SPAWN = being("Spawn", ["Eldrazi", "Spawn"]), DRONE = being("Drone", ["Eldrazi", "Drone"]), BEAR = being("Bear", ["Bear"]);
function table(seats = 2) {
  const s = createState({matchId: "m", seed: "zone-costs", players: ["Rob", "Maya", "Trey", "Sam"].slice(0, seats).map((name) => ({name}))});
  for (let seat = 0; seat < seats; seat += 1) for (let i = 0; i < 12; i += 1) addObject(s, {...WASTES, owner: seat, controller: seat}, "library", seat);
  return s;
}
const main = (s) => { beginGame(s); for (let n = 0; n < 60 && !(s.phase === "MAIN1" && s.priorityPlayer === 0); n += 1) advance(s); return s; };
const put = (s, o, zone = "battlefield", seat = 0) => addObject(s, {...o, owner: seat, controller: seat}, zone, zone === "battlefield" ? null : seat);
const offers = (s, id) => legalActions(s, 0).filter((a) => a.kind === "activate" && a.objectId === id);
const names = (s, ids) => ids.map((id) => s.objects[id].card).sort();

{
  /* Eldrazi Ravager, three players: one offer for each pair of Rob's Eldrazi -- never Maya's or Trey's, never his Bear --
     and the pair it names sacrificed as it is activated, each a death "whenever a creature you control dies" sees. */
  const s = table(3);
  const ravager = put(s, card("Eldrazi Ravager"), "graveyard");
  const spawn = put(s, SPAWN), drone = put(s, DRONE), second = put(s, SPAWN);
  put(s, BEAR); put(s, DRONE, "battlefield", 1); put(s, SPAWN, "battlefield", 2);
  put(s, {card: "Watcher", types: ["Enchantment"], abilities: [{id: "w", kind: "triggered", text: "Whenever a creature you control dies, you gain 1 life.",
    trigger: {on: "GameEventCardChangeZone", from: "Battlefield", to: "Graveyard", who: "any", filter: {types: ["Creature"], controller: "you"}}, effects: [{effect: "gainLife", amount: 1}]}]});
  main(s);
  const found = offers(s, ravager);
  eq(found.map((a) => [...a.costChoice.sacrifice].sort((x, y) => x - y)).sort(), [[spawn, drone], [spawn, second], [drone, second]].map((p) => p.sort((x, y) => x - y)).sort(),
    "three offers, each a pair of his three Eldrazi");
  const events = applyAction(s, 0, found.find((a) => a.costChoice.sacrifice.includes(spawn) && a.costChoice.sacrifice.includes(second)));
  eq([names(s, s.zones.battlefield.filter((id) => s.objects[id].controller === 0)), s.stack.length], [["Bear", "Drone", "Watcher"], 1],
    "the two Spawns sacrificed, the Drone and Bear kept; the ability on the stack");
  eq(events.filter((e) => e.kind === "GameEventCardChangeZone" && e.data.fields.from?.zoneType === "Battlefield").length, 2, "two left the battlefield, as the cost was paid");
  eq([s.awaiting?.kind, (s.pendingTriggers ?? []).length], ["order-triggers", 2], "the Watcher triggered twice, its two triggers to order");
}
{
  /* With one Eldrazi of his own -- and Maya's two -- nothing to pay it with: not offered (CR 118.3). */
  const s = table();
  const ravager = put(s, card("Eldrazi Ravager"), "graveyard");
  put(s, SPAWN); put(s, BEAR); put(s, DRONE, "battlefield", 1); put(s, SPAWN, "battlefield", 1);
  main(s);
  eq(offers(s, ravager).length, 0, "one Eldrazi of his: no offer");
}
{
  /* A card's ability in a hand with a cost to choose: "{1}, Discard another card: Draw two cards" -- one offer for each
     other card in his hand, never the card itself, and the card chosen discarded. */
  const s = table();
  const scholar = put(s, being("Scholar", ["Human"], {abilities: [{id: "h", kind: "activated", zone: "hand", text: "{1}, Discard another card: Draw two cards.",
    cost: [{atom: "mana", cost: "{1}"}, {atom: "discard"}], effects: [{effect: "draw", count: 2}]}]}), "hand");
  const bear = put(s, BEAR, "hand"), spawn = put(s, SPAWN, "hand");
  put(s, WASTES);
  main(s);
  applyAction(s, 0, legalActions(s, 0).find((a) => a.kind === "activate-mana"));
  const found = offers(s, scholar);
  eq(found.map((a) => a.costChoice.discard).sort(), [bear, spawn].sort(), "one offer for each other card in his hand");
  const events = applyAction(s, 0, found.find((a) => a.costChoice.discard === spawn));
  eq([s.objects[scholar]?.zone, s.zones.graveyard[0].map((id) => s.objects[id].card)], ["hand", ["Spawn"]], "the Spawn discarded; the Scholar still in his hand, its ability on the stack");
  eq(events.some((e) => e.data?.fields?.discarded === true), true, "a discard, as \"whenever you discard\" sees it");
}
{
  /* A graveyard ability with a creature to tap: "Tap an untapped creature you control: Return this card from your
     graveyard to your hand" -- one offer for each, and the one chosen tapped. */
  const s = table();
  const echo = put(s, being("Echo", ["Spirit"], {abilities: [{id: "g", kind: "activated", zone: "graveyard", text: "Tap an untapped creature you control: Return this card from your graveyard to your hand.",
    cost: [{atom: "tapCreature", selector: {types: ["Creature"]}}], effects: [{effect: "moveZone", targets: "self", to: "hand"}]}]}), "graveyard");
  const bear = put(s, BEAR), drone = put(s, DRONE);
  main(s);
  const found = offers(s, echo);
  eq(found.map((a) => a.costChoice.tap).sort(), [bear, drone].sort(), "one offer for each untapped creature of his");
  applyAction(s, 0, found.find((a) => a.costChoice.tap === drone));
  eq([s.objects[drone].tapped, s.objects[bear].tapped === true], [true, false], "the Drone tapped, the Bear not");
}
{
  /* And nothing changes for a cost the card pays itself: cycling, offered once, the card discarded. */
  const s = table();
  const ravager = put(s, card("Eldrazi Ravager"), "hand");
  put(s, WASTES); put(s, WASTES);
  main(s);
  for (const id of s.zones.battlefield) applyAction(s, 0, legalActions(s, 0).find((a) => a.kind === "activate-mana" && a.objectId === id));
  eq(offers(s, ravager).map((a) => a.costChoice ?? null), [null], "cycling: one offer, nothing to choose");
  applyAction(s, 0, offers(s, ravager)[0]);
  eq(s.zones.graveyard[0].map((id) => s.objects[id].card), ["Eldrazi Ravager"], "cycled: in his graveyard");
}

console.log(`engine-zone-costs: ${checks} checks passed -- an ability's costs are offered, chosen and paid wherever it works from: a graveyard's sacrifice and tap, a hand's discard; none to pay with, none offered.`);
