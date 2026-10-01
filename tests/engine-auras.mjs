/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* M4 PHASE 3, BATCH 12 (THE CATALOG'S ORDER): AURAS -- ENCHANT (CR 702.5, 303.4).
 *
 * An Aura spell targets what it will enchant (CR 303.4a), so it is offered once per legal aim; checked again as it
 * resolves, an illegal target means it does not resolve (CR 608.3b); it enters attached (CR 303.4f). Attached to
 * nothing, or to something its Enchant could not enchant, it is put into its owner's graveyard as a state-based action
 * (CR 704.5m) -- unlike an Equipment, which stays (704.5n). "Enchanted creature" is what it is attached to.
 */
import assert from "node:assert/strict";
import {createState, addObject} from "../game/engine/state/index.mjs";
import {beginGame, advance} from "../game/engine/rules/turn.mjs";
import {legalActions, applyAction} from "../game/engine/rules/actions.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";
import {checkStateBasedActions} from "../game/engine/rules/sba.mjs";
import {characteristicsOf} from "../game/engine/rules/layers.mjs";
import {collectTriggers} from "../game/engine/rules/trigger.mjs";
import {compileScript} from "../game/engine/cards/index.mjs";
import {housePilot} from "../game/engine/pilots/house-pilot.mjs";
import {projectFor} from "../game/engine/projection.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const cards = loadCardIndex();
const card = (name) => ({...cards.definition(name), card: name});
const land = (name, color) => ({card: name, types: ["Land"], supertypes: ["Basic"], subtypes: color === "C" ? [] : [name], abilities: [{id: "a0", kind: "mana", tapSelf: true, produces: {[color]: 1}}]});
const WASTES = land("Wastes", "C"), PLAINS = land("Plains", "W");
const creature = (name, extra = {}) => ({card: name, types: ["Creature"], manaCost: "{1}", power: 2, toughness: 2, ...extra});
const aura = (name, abilities, extra = {}) => compileScript({schema: "CrankCardScript@1", identity: {name, oracleId: name, types: ["Enchantment"], subtypes: ["Aura"], manaCost: "{W}", ...extra},
  abilities}).definition;

const pod = {matchId: "m", seed: "auras", players: [{name: "Rob"}, {name: "Maya"}]};
function table() {
  const s = createState(pod);
  for (let seat = 0; seat < 2; seat += 1) for (let i = 0; i < 12; i += 1) addObject(s, {...WASTES, owner: seat, controller: seat}, "library", seat);
  return s;
}
const on = (s, o, seat, zone = "battlefield") => addObject(s, {...o, owner: seat, controller: seat}, zone, ["battlefield", "exile"].includes(zone) ? null : seat);
function main(s) { beginGame(s); for (let n = 0; n < 50 && !(s.phase === "MAIN1" && s.priorityPlayer === 0); n += 1) advance(s); return s; }
const tap = (s, name) => applyAction(s, 0, legalActions(s, 0).find((a) => a.kind === "activate-mana" && a.label === name));
const casts = (s, name) => legalActions(s, 0).filter((a) => a.kind === "cast" && a.label === name);
const resolve = (s) => [...passPriority(s).events, ...passPriority(s).events];
const named = (s, name) => Object.keys(s.objects).map(Number).find((id) => s.objects[id].card === name && s.objects[id].zone === "battlefield");
const zoneOf = (s, name) => Object.values(s.objects).filter((o) => o.card === name).map((o) => o.zone);

/* ---- cast at what it will enchant, and enter attached ---- */
{
  const s = table();
  on(s, card("Stoneskin"), 0, "hand");
  for (const l of [WASTES, WASTES, PLAINS]) on(s, l, 0);
  const bear = on(s, creature("Bear"), 0);
  on(s, creature("Their Bear"), 1);
  main(s);
  for (const l of ["Wastes", "Wastes", "Plains"]) tap(s, l);
  eq(casts(s, "Stoneskin").map((a) => a.targetNames.join()).sort(), ["Bear", "Their Bear"], "an Aura spell is offered once per creature it could enchant -- each side's (CR 303.4a)");
  applyAction(s, 0, casts(s, "Stoneskin").find((a) => a.targetNames[0] === "Bear"));
  resolve(s);
  const skin = named(s, "Stoneskin");
  eq([s.objects[skin].attachedTo, s.objects[bear].attachments], [bear, [skin]], "it enters attached to the Bear (CR 303.4f), and the Bear knows it");
  eq([characteristicsOf(s, bear).power, characteristicsOf(s, bear).toughness], [2, 12], "and the Bear is 2/12");
}
{
  /* Its target illegal as it resolves: it does not resolve, and goes to the graveyard (CR 608.3b). */
  const s = table();
  on(s, card("Stoneskin"), 0, "hand");
  for (const l of [WASTES, WASTES, PLAINS]) on(s, l, 0);
  const bear = on(s, creature("Bear"), 0);
  main(s);
  for (const l of ["Wastes", "Wastes", "Plains"]) tap(s, l);
  applyAction(s, 0, casts(s, "Stoneskin")[0]);
  s.objects[bear].keywords = ["Shroud"];
  const events = resolve(s);
  eq(zoneOf(s, "Stoneskin"), ["graveyard"], "the Bear gained shroud in response: Stoneskin does not resolve, and goes to the graveyard");
  ok(events.some((e) => e.kind === "GameEventSpellResolved" && e.data.fields.hasFizzled === true), "reported as not resolving");
}

/* ---- the state-based action (CR 704.5m) ---- */
{
  const s = table();
  const bear = on(s, creature("Bear"), 0);
  const skin = on(s, card("Stoneskin"), 0);
  s.objects[skin].attachedTo = bear; s.objects[bear].attachments = [skin];
  const wall = on(s, {card: "Plate", types: ["Artifact"], subtypes: ["Equipment"]}, 0);
  s.objects[wall].attachedTo = bear; s.objects[bear].attachments.push(wall);
  main(s);
  checkStateBasedActions(s);
  eq(s.objects[skin]?.zone, "battlefield", "attached to a creature, it stays");
  s.objects[bear].types = ["Artifact"];   /* no longer a creature */
  const events = checkStateBasedActions(s);
  eq([zoneOf(s, "Stoneskin"), s.objects[wall].zone, s.objects[wall].attachedTo], [["graveyard"], "battlefield", null],
    "its creature no longer a creature: the Aura is put into the graveyard (704.5m), while an Equipment only comes off and stays (704.5n)");
  ok(events.some((e) => e.kind === "GameEventCardChangeZone" && e.data.fields.card?.name === "Stoneskin" && e.data.fields.leftBehind), "with its last known information, as any departure");
}
{
  const s = table();
  main(s);
  const lone = on(s, card("Stoneskin"), 0);
  checkStateBasedActions(s);
  eq(s.objects[lone], undefined, "an Aura attached to nothing is put into its owner's graveyard at once");
  eq(zoneOf(s, "Stoneskin"), ["graveyard"], "(there it is)");
}
{
  /* "Enchant creature you control": whose is read from the Aura's controller. */
  const mine = aura("Guard", [{kind: "keyword", text: "Enchant creature you control", keyword: "enchant", target: {what: "permanent", types: ["Creature"], controller: "you"}}]);
  const s = table();
  const theirs = on(s, creature("Their Bear"), 1);
  main(s);
  const g = on(s, {...mine, card: "Guard"}, 0);
  s.objects[g].attachedTo = theirs; s.objects[theirs].attachments = [g];
  checkStateBasedActions(s);
  eq(zoneOf(s, "Guard"), ["graveyard"], "attached to Maya's creature, an Aura that may enchant only Rob's goes to the graveyard");
}
{
  /* "When this Aura is put into a graveyard from the battlefield" sees the state-based action. */
  const def = aura("Echo", [{kind: "keyword", text: "Enchant creature", keyword: "enchant", target: {what: "permanent", types: ["Creature"]}},
    {kind: "triggered", text: "When this Aura is put into a graveyard from the battlefield, draw a card.", trigger: {on: "dies", who: "self"}, effects: [{effect: "draw", count: 1}]}]);
  const s = table();
  main(s);
  on(s, {...def, card: "Echo"}, 0);
  collectTriggers(s, checkStateBasedActions(s));
  eq((s.pendingTriggers ?? []).map((t) => t.source.name), ["Echo"], "its own \"put into a graveyard\" trigger fires");
}

/* ---- "enchanted creature" ---- */
{
  const s = table();
  const bear = on(s, creature("Bear"), 0);
  const freed = on(s, card("Freed from the Real"), 0);
  s.objects[freed].attachedTo = bear; s.objects[bear].attachments = [freed];
  on(s, land("Island", "U"), 0);
  main(s);
  tap(s, "Island");
  applyAction(s, 0, legalActions(s, 0).find((a) => a.kind === "activate" && a.label === "Freed from the Real" && a.abilityId === "a1"));
  resolve(s);
  eq(s.objects[bear].tapped, true, "\"{U}: Tap enchanted creature\" taps what it is attached to as it resolves");
}

/* ---- the house pilot aims a blessing at its own, a curse at an opponent's ---- */
{
  const curse = aura("Curse", [{kind: "keyword", text: "Enchant creature", keyword: "enchant", target: {what: "permanent", types: ["Creature"]}, hostile: true},
    {kind: "static", text: "Enchanted creature gets -2/-0.", layer: 7, sublayer: "c", affects: {what: "permanent", attachedBy: "self"}, apply: {power: -2, toughness: 0}}]);
  const facts = (name) => ({Stoneskin: {manaValue: 3, types: ["Enchantment"]}, Curse: {manaValue: 1, types: ["Enchantment"]}, Wastes: {manaValue: 0, types: ["Land"]}, Plains: {manaValue: 0, types: ["Land"]}})[name] ?? null;
  for (const [name, def, lands, want] of [["Stoneskin", card("Stoneskin"), [WASTES, WASTES, PLAINS], "Bear"], ["Curse", {...curse, card: "Curse"}, [PLAINS], "Their Bear"]]) {
    const s = table();
    on(s, def, 0, "hand");
    for (const l of lands) on(s, l, 0);
    on(s, creature("Bear"), 0); on(s, creature("Their Bear"), 1);
    main(s);
    for (const l of lands) tap(s, l.card);
    const choice = housePilot({seat: 0, cards: facts}).choose(projectFor(s, 0), legalActions(s, 0));
    eq([choice.label, choice.targetNames?.[0]], [name, want], `the house pilot casts ${name} at ${want}`);
  }
}

/* ---- the loader ---- */
{
  const bad = compileScript({schema: "CrankCardScript@1", identity: {name: "X", oracleId: "x", types: ["Enchantment"], manaCost: "{W}"},
    abilities: [{kind: "keyword", text: "Enchant creature", keyword: "enchant", target: {what: "permanent", types: ["Creature"]}}]});
  ok(!bad.definition && bad.problems.some((p) => /not an Aura/.test(p)), "Enchant on a card that is not an Aura is refused");
  const unaimed = compileScript({schema: "CrankCardScript@1", identity: {name: "Y", oracleId: "y", types: ["Enchantment"], subtypes: ["Aura"], manaCost: "{W}"},
    abilities: [{kind: "keyword", text: "Enchant creature", keyword: "enchant"}]});
  ok(!unaimed.definition && unaimed.problems.some((p) => /says what it may enchant/.test(p)), "and Enchant that does not say what it may enchant");
}

console.log(`engine-auras: ${checks} checks passed — an Aura cast at what it will enchant, entering attached, not resolving at an illegal target, and put into the graveyard attached to nothing legal; "enchanted creature" is what it is on.`);
