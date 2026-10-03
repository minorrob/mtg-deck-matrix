/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* M4 PHASE 3, BATCH 58 (THE CATALOG'S ORDER): STATION (CR 702.184, 721).
 *
 * "Tap another untapped creature you control: Put a number of charge counters on this permanent equal to the tapped
 * creature's power. Activate only as a sorcery." One offer per creature it may tap -- a summoning-sick one too -- and the
 * counters are its power as the ability resolves. "N+ | ..." is what the permanent has as long as it has N or more charge
 * counters (721.2a): an ability, a keyword, being a creature with its printed power and toughness (721.2b).
 */
import assert from "node:assert/strict";
import {createState, addObject} from "../game/engine/state/index.mjs";
import {beginGame, advance} from "../game/engine/rules/turn.mjs";
import {legalActions, applyAction} from "../game/engine/rules/actions.mjs";
import {resolveTop} from "../game/engine/rules/stack.mjs";
import {characteristicsOf, keywordsOf} from "../game/engine/rules/layers.mjs";
import {runEffects} from "../game/engine/script/effects/index.mjs";
import {conditionProblems} from "../game/engine/script/condition.mjs";
import {compileScript} from "../game/engine/cards/index.mjs";
import {missingFor} from "../game/tools/engine-constructs.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";

let checks = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const cards = loadCardIndex();
const card = (name) => ({...cards.definition(name), card: name});
const WASTES = {card: "Wastes", types: ["Land"], supertypes: ["Basic"], abilities: [{id: "a0", kind: "mana", tapSelf: true, produces: {C: 1}}]};
const creature = (name, power, more = {}) => ({card: name, types: ["Creature"], power, toughness: power, ...more});
function table() {
  const s = createState({matchId: "m", seed: "station", players: [{name: "Rob"}, {name: "Maya"}]});
  for (let seat = 0; seat < 2; seat += 1) for (let i = 0; i < 12; i += 1) addObject(s, {...WASTES, owner: seat, controller: seat}, "library", seat);
  beginGame(s);
  for (let n = 0; n < 50 && !(s.phase === "MAIN1" && s.priorityPlayer === 0); n += 1) advance(s);
  return s;
}
const put = (s, o, seat = 0) => addObject(s, {...o, owner: seat, controller: seat}, "battlefield", null);
const stations = (s, id) => legalActions(s, 0).filter((a) => a.kind === "activate" && a.objectId === id && a.costChoice?.tap !== undefined);
const station = (s, id, tapped) => { applyAction(s, 0, stations(s, id).find((a) => a.costChoice.tap === tapped)); resolveTop(s); };

{
  /* One offer per creature it may tap: his untapped ones, a summoning-sick one among them; not a tapped one, not Maya's. */
  const s = table();
  const craft = put(s, card("Uthros Research Craft"));
  const ogre = put(s, creature("Ogre", 3)), sick = put(s, creature("Pup", 1)), tired = put(s, creature("Wolf", 2));
  s.objects[sick].controlledSinceTurn = s.turn; s.objects[tired].tapped = true;
  put(s, creature("Giant", 7), 1);
  eq(stations(s, craft).map((a) => s.objects[a.costChoice.tap].card).sort(), ["Ogre", "Pup"], "the Ogre or the summoning-sick Pup; not the tapped Wolf or Maya's Giant");
  /* Its power as it resolves: the Ogre pumped +2 in response, five counters. */
  applyAction(s, 0, stations(s, craft).find((a) => a.costChoice.tap === ogre));
  eq([s.objects[ogre].tapped, s.stack.length], [true, 1], "the Ogre tapped as the cost, the ability on the stack");
  runEffects(s, [{effect: "pump", targets: [ogre], power: 2, toughness: 2}], {controller: 0, source: ogre});
  resolveTop(s);
  eq(s.objects[craft].counters.charge, 5, "five charge counters: the Ogre's power as it resolved");
}
{
  /* Only as a sorcery: not with something on the stack. */
  const s = table();
  const craft = put(s, card("Uthros Research Craft"));
  put(s, creature("Ogre", 3)); put(s, creature("Elf", 1));
  applyAction(s, 0, stations(s, craft)[0]);
  eq(stations(s, craft).length, 0, "one on the stack: no other station offered");
  /* A Spacecraft that is a creature does not tap itself: "another" (CR 702.184a). */
  const t = table();
  const ship = put(t, card("Uthros Research Craft")), elf = put(t, creature("Elf", 1));
  t.objects[ship].counters = {charge: 12};
  eq(stations(t, ship).map((a) => a.costChoice.tap), [elf], "a 12-counter creature Spacecraft: the Elf only, not itself");
}
{
  /* 721.2: below twelve, not a creature and no flying; at twelve, a 0/8 flying artifact creature, +1/+0 for its artifact. */
  const s = table();
  const craft = put(s, card("Uthros Research Craft")), colossus = put(s, creature("Colossus", 11));
  station(s, craft, colossus);
  eq([characteristicsOf(s, craft).types.includes("Creature"), keywordsOf(s, craft).includes("Flying")], [false, false], "eleven counters: an artifact, no flying");
  s.objects[craft].counters.charge = 12;
  eq([characteristicsOf(s, craft).types, characteristicsOf(s, craft).power, characteristicsOf(s, craft).toughness, keywordsOf(s, craft).includes("Flying")],
    [["Artifact", "Creature"], 1, 8, true], "twelve: a flying 1/8 artifact creature");
}
{
  /* A mana ability at N+ (The Eternity Elevator, 20+): not offered below, offered at twenty, that many of a color. */
  const s = table();
  const elevator = put(s, card("The Eternity Elevator"));
  const manaOffers = () => legalActions(s, 0).filter((a) => a.kind === "activate-mana" && a.objectId === elevator).map((a) => JSON.stringify(a.mana));
  eq(manaOffers(), ['{"C":3}'], "no counters: its {C}{C}{C} alone");
  s.objects[elevator].counters = {charge: 20};
  eq(manaOffers().length, 6, "twenty: and twenty of any one color, five more offers");
  /* A trigger at N+ (Uthros Research Craft, 3+): an artifact spell draws only at three. */
  const t = table();
  const craft = put(t, card("Uthros Research Craft"));
  addObject(t, {card: "Trinket", types: ["Artifact"], manaCost: "{0}", colors: [], owner: 0, controller: 0}, "hand", 0);
  addObject(t, {card: "Trinket", types: ["Artifact"], manaCost: "{0}", colors: [], owner: 0, controller: 0}, "hand", 0);
  const cast = () => applyAction(t, 0, legalActions(t, 0).find((a) => a.kind === "cast" && a.label === "Trinket"));
  cast();
  const before = (t.pendingTriggers ?? []).length + t.stack.filter((e) => e.kind === "trigger").length;
  resolveTop(t);
  t.objects[craft].counters = {charge: 3};
  cast();
  eq([before, (t.pendingTriggers ?? []).length + t.stack.filter((e) => e.kind === "trigger").length], [0, 1], "no counters: no trigger; three: it triggers");
}
{
  /* "Other tapped legendary creatures you control have indestructible" (The Seriema at 7+): tapped, legendary, his, not itself. */
  const s = table();
  const seriema = put(s, card("The Seriema"));
  s.objects[seriema].counters = {charge: 7};
  const tappedHero = put(s, creature("Hero", 2, {supertypes: ["Legendary"]})), untapped = put(s, creature("Sage", 2, {supertypes: ["Legendary"]})), plain = put(s, creature("Bear", 2));
  s.objects[tappedHero].tapped = true; s.objects[plain].tapped = true; s.objects[seriema].tapped = true;
  eq([tappedHero, untapped, plain, seriema].map((id) => keywordsOf(s, id).includes("Indestructible")), [true, false, false, false], "the tapped legendary Hero only");
}
{
  /* "You may play an additional land this turn" (Hearthhull): two land plays this turn, not three; the next turn one. */
  const s = table();
  const hull = put(s, card("Hearthhull, the Worldseed"));
  for (let i = 0; i < 3; i += 1) addObject(s, {...WASTES, owner: 0, controller: 0}, "hand", 0);
  runEffects(s, [{effect: "effectUntil", rule: "extra-land-drop", affects: {what: "player", who: "you"}}], {controller: 0, source: hull});
  const play = () => applyAction(s, 0, legalActions(s, 0).find((a) => a.kind === "play-land"));
  play(); play();
  eq(legalActions(s, 0).some((a) => a.kind === "play-land"), false, "two lands played: no third");
  eq((s.effects ?? []).filter((e) => e.rule === "extra-land-drop").length, 1, "the extra land drop is an effect for the turn");
}
{
  /* Refused: station on a card that is neither a Spacecraft nor a Planet; a counters condition without its number. */
  const cart = compileScript({schema: "CrankCardScript@1", identity: {name: "Cart", oracleId: "x", types: ["Artifact"], subtypes: [], manaCost: "{1}", colors: [], colorIdentity: []},
    oracleText: "Station", source: "hand", abilities: [{kind: "keyword", text: "Station", keyword: "station"}]});
  eq(cart.problems.some((p) => /station on a card that is not a Spacecraft or a Planet/.test(p)), true, "station on a plain artifact: refused");
  eq([conditionProblems({selfCounters: {counter: "charge", atLeast: 12}}).length, conditionProblems({selfCounters: {counter: "charge"}}).length], [0, 1], "a counters condition needs its number");
  eq(missingFor({keywords: ["Station"]}), [], "the catalog credits Station");
}

console.log(`engine-station: ${checks} checks passed — one offer per creature it may tap, sick ones too; its power as it resolves; only as a sorcery; what it has at N+: an ability, a keyword, a creature with its printed numbers; a land more this turn.`);
