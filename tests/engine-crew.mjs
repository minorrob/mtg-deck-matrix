/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* M4 PHASE 3, BATCH 55 (THE CATALOG'S ORDER): CREW (CR 702.122a).
 *
 * "Crew N: Tap any number of other untapped creatures you control with total power N or more: This Vehicle becomes an
 * artifact creature until end of turn." One offer per smallest set of crew -- other, untapped, yours, a summoning-sick
 * creature among them; "crews as though its power were 2 greater" counted. The creatures chosen are tapped as the cost; the
 * Vehicle is a creature with its printed power and toughness until the turn ends.
 */
import assert from "node:assert/strict";
import {createState, addObject} from "../game/engine/state/index.mjs";
import {beginGame, advance} from "../game/engine/rules/turn.mjs";
import {legalActions, applyAction} from "../game/engine/rules/actions.mjs";
import {resolveTop} from "../game/engine/rules/stack.mjs";
import {characteristicsOf} from "../game/engine/rules/layers.mjs";
import {compileScript} from "../game/engine/cards/index.mjs";
import {missingFor} from "../game/tools/engine-constructs.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";

let checks = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const cards = loadCardIndex();
const card = (name) => ({...cards.definition(name), card: name});
const WASTES = {card: "Wastes", types: ["Land"], abilities: [{id: "a0", kind: "mana", tapSelf: true, produces: {C: 1}}]};
const creature = (name, power) => ({card: name, types: ["Creature"], power, toughness: power});
function table() {
  const s = createState({matchId: "m", seed: "crew", players: [{name: "Rob"}, {name: "Maya"}]});
  for (let seat = 0; seat < 2; seat += 1) for (let i = 0; i < 12; i += 1) addObject(s, {...WASTES, owner: seat, controller: seat}, "library", seat);
  beginGame(s);
  for (let n = 0; n < 50 && !(s.phase === "MAIN1" && s.priorityPlayer === 0); n += 1) advance(s);
  return s;
}
const put = (s, o, seat) => addObject(s, {...o, owner: seat, controller: seat}, "battlefield", null);
const crewOffers = (s, vehicle) => legalActions(s, 0).filter((a) => a.kind === "activate" && a.objectId === vehicle).map((a) => [...a.costNames].sort().join("+")).sort();

{
  /* Crew 3: smallest sets only -- the Ogre alone, or the Bear with the Elf; never all three; not Maya's Giant, not a tapped
     creature; a summoning-sick Bear among them (it crews with no {T} of its own). */
  const s = table();
  const caravan = put(s, card("Cultivator's Caravan"), 0);
  put(s, creature("Ogre", 4), 0); put(s, creature("Bear", 2), 0); put(s, creature("Elf", 1), 0);
  const tapped = put(s, creature("Wolf", 3), 0); s.objects[tapped].tapped = true;
  put(s, creature("Giant", 7), 1);
  eq(crewOffers(s, caravan), ["Bear+Elf", "Ogre"], "the Ogre, or the Bear and the Elf: two offers");
  applyAction(s, 0, legalActions(s, 0).find((a) => a.kind === "activate" && a.objectId === caravan && a.costNames.includes("Ogre")));
  const ogre = s.zones.battlefield.find((id) => s.objects[id].card === "Ogre");
  eq([s.objects[ogre].tapped, characteristicsOf(s, caravan).types.includes("Creature")], [true, false], "the Ogre tapped as the cost; the Caravan not yet a creature -- the ability is on the stack");
  resolveTop(s);
  eq([characteristicsOf(s, caravan).types.includes("Creature"), characteristicsOf(s, caravan).power, characteristicsOf(s, caravan).toughness], [true, 5, 5], "resolved: a 5/5 artifact creature, its printed numbers");
  for (let n = 0; n < 200 && !(s.turn === 2 && s.phase === "MAIN1"); n += 1) { if (s.awaiting) break; advance(s); }
  eq(characteristicsOf(s, caravan).types.includes("Creature"), false, "the next turn: a Vehicle again");
}
{
  /* "Crews Vehicles as though its power were 2 greater": a 1/1 Pilot crews 3. The Vehicle never crews itself. */
  const s = table();
  const caravan = put(s, card("Cultivator's Caravan"), 0);
  put(s, {...creature("Pilot", 1), abilities: [{id: "p", kind: "static", text: "This token crews Vehicles as though its power were 2 greater.", rule: "crews-with-more", amount: 2}]}, 0);
  eq(crewOffers(s, caravan), ["Pilot"], "the Pilot alone: 1 + 2 is 3");
  /* An Elf before an Ogre: "Elf and Ogre" has the power too, but the Ogre alone does -- the Elf need not be tapped. */
  const u = table();
  const cart = put(u, card("Cultivator's Caravan"), 0);
  put(u, creature("Elf", 1), 0); put(u, creature("Ogre", 4), 0);
  eq(crewOffers(u, cart), ["Ogre"], "the Ogre alone, not the Elf with it");
  const t = table();
  const other = put(t, card("Cultivator's Caravan"), 0), crewed = put(t, card("Esika's Chariot"), 0);
  t.objects[crewed].types = [...t.objects[crewed].types, "Creature"];
  eq(crewOffers(t, crewed), [], "a crewed Vehicle beside another, no creature but itself: it cannot crew itself");
  void other;
}
{
  const notVehicle = compileScript({schema: "CrankCardScript@1", identity: {name: "Cart", oracleId: "x", types: ["Artifact"], subtypes: [], manaCost: "{1}", colors: [], colorIdentity: [], power: 1, toughness: 1},
    oracleText: "Crew 1", source: "hand", abilities: [{kind: "keyword", text: "Crew 1", keyword: "crew", amount: 1}]});
  eq(notVehicle.problems.some((p) => /crew on a card that is not a Vehicle/.test(p)), true, "crew on a plain artifact: refused");
  eq(missingFor({keywords: ["Crew"]}), [], "the catalog credits Crew");
}

console.log(`engine-crew: ${checks} checks passed — the smallest sets of other untapped creatures, yours, sick ones too; the Pilot's 2 more; tapped as the cost; a creature with its printed numbers until the turn ends; only on a Vehicle.`);
