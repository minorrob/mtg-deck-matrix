/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* M4 PHASE 3, BATCH 7: DEATHS WATCHED FOR, "SACRIFICE A CREATURE", AND "YOU MAY".
 *
 * Blood Artist, Zulaport Cutthroat, Skullclamp, Ashnod's Altar and Viscera Seer are the most-played cards of the decks
 * that win by creatures dying. What died is judged as it last existed (CR 603.10a, 608.2h): by then it is a new object
 * in a graveyard (CR 400.7), so "another creature you control dies" reads the snapshot taken as it left -- its types,
 * its controller, whether it was a token, what was attached to it. Everything one action sends from the battlefield is
 * one moment, so Blood Artist dying in a wipe sees every death in it. "Sacrifice a creature" is a cost chosen as the
 * ability is activated (CR 602.2b), one offer per creature, a mana ability's off the stack. And "you may" (CR 603.5) is
 * asked as the trigger resolves: the card's sentence, Yes or No.
 */
import assert from "node:assert/strict";
import {createState, addObject} from "../game/engine/state/index.mjs";
import {beginGame, advance, awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {legalActions, applyAction} from "../game/engine/rules/actions.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";
import {lastKnown} from "../game/engine/rules/layers.mjs";
import {matchesLastKnown} from "../game/engine/script/filter.mjs";
import {housePilot} from "../game/engine/pilots/house-pilot.mjs";
import {projectFor} from "../game/engine/projection.mjs";
import {createRng} from "../game/engine/rng.mjs";
import {compileScript} from "../game/engine/cards/index.mjs";
import {loadCardIndex, loadCardScripts} from "../game/tools/engine-cards.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };
const throws = (f, re, m) => { assert.throws(f, re, m); checks += 1; };

const cards = loadCardIndex();
const card = (name) => ({...cards.definition(name), card: name});
const script = (name) => structuredClone(loadCardScripts().find((e) => e.script.identity.name === name).script);
const WASTES = {card: "Wastes", types: ["Land"], supertypes: ["Basic"], abilities: [{id: "a0", kind: "mana", tapSelf: true, produces: {C: 1}}]};
const FOREST = {card: "Forest", types: ["Land"], supertypes: ["Basic"], subtypes: ["Forest"], abilities: [{id: "a0", kind: "mana", tapSelf: true, produces: {G: 1}}]};
const bear = (name, extra = {}) => ({card: name, types: ["Creature"], manaCost: "{1}{G}", power: 2, toughness: 2, ...extra});
const spell = (name, effects, targets = []) => ({card: name, types: ["Instant"], manaCost: "{C}", spell: {id: "s", text: name, targets, effects}});
const MURDER = spell("Murder", [{effect: "destroy", targets: {target: 0}}], [{what: "permanent", types: ["Creature"]}]);
const WRATH = spell("Wrath", [{effect: "destroyAll", selector: {what: "permanent", types: ["Creature"]}}]);
const SPIRITS = spell("Spirits", [{effect: "createToken", count: 1, token: {name: "Spirit", types: ["Creature"], power: 1, toughness: 1}}]);

const pod = {matchId: "m", seed: "deaths", players: [{name: "Rob"}, {name: "Maya"}]};
function table(library = [WASTES]) {
  const s = createState(pod);
  for (let seat = 0; seat < 2; seat += 1) for (let i = 0; i < 10; i += 1) for (const c of library) addObject(s, {...c, owner: seat, controller: seat}, "library", seat);
  return s;
}
const on = (s, o, seat, zone = "battlefield") => addObject(s, {...o, owner: seat, controller: seat}, zone, ["battlefield", "exile"].includes(zone) ? null : seat);
function main(s) { beginGame(s); for (let n = 0; n < 50 && !(s.phase === "MAIN1" && s.priorityPlayer === 0); n += 1) advance(s); return s; }
const offers = (s, kind, name, seat = 0) => legalActions(s, seat).filter((a) => a.kind === kind && a.label === name);
const tapAll = (s, seat = 0) => { for (let a; (a = legalActions(s, seat).find((x) => x.kind === "activate-mana" && x.label === "Wastes"));) applyAction(s, seat, a); };
const resolve = (s) => { passPriority(s); return passPriority(s); };
const cast = (s, name, targetName) => applyAction(s, 0, offers(s, "cast", name).find((a) => !targetName || (a.targetNames ?? []).join() === targetName));
const zoneOf = (s, name) => Object.values(s.objects).filter((o) => o.card === name).map((o) => o.zone).join();

/* ---- last known information ---- */
{
  const s = table();
  const clamp = on(s, card("Skullclamp"), 0);
  const elf = on(s, bear("Elf", {subtypes: ["Elf"], supertypes: ["Legendary"]}), 0);
  s.objects[elf].attachments = [clamp]; s.objects[clamp].attachedTo = elf;
  const lki = lastKnown(s, elf);
  eq([lki.types, lki.subtypes, lki.supertypes, lki.attachments, lki.controller, lki.token], [["Creature"], ["Elf"], ["Legendary"], [clamp], 0, false],
    "the snapshot taken as a permanent leaves carries its types, subtypes, supertypes, what is attached to it, its controller and whether it is a token");
  const m = (sel, ctx = {controller: 0, source: clamp}) => matchesLastKnown(sel, lki, ctx);
  eq([m({types: ["Creature"], controller: "you"}), m({types: ["Creature"], controller: "opponent"}), m({token: false}), m({token: true}), m({subtypes: ["Elf"]}), m({subtypes: ["Goblin"]}),
    m({supertypes: ["Legendary"]}), m({nonTypes: ["Creature"]}), m({another: true}, {controller: 0, source: elf}), m({attachedBy: "self"}), m({attachedBy: "self"}, {controller: 0, source: 999}),
    m({anyOf: [{types: ["Planeswalker"]}, {types: ["Creature"]}], controller: "you"}), m({anyOf: [{types: ["Planeswalker"]}], controller: "you"})],
    [true, false, true, false, true, false, true, false, false, true, false, true, false],
    "a departure's filter reads it as it was: whose, a token or not, its types, not itself for another, what was attached, a choice of types");
  throws(() => m({manaValue: 2}), /cannot use `manaValue`/, "a key the snapshot cannot answer is refused, not guessed");
  eq(matchesLastKnown({types: ["Creature"]}, null), false, "and nothing matches no snapshot");
}

/* ---- "whenever another creature you control dies": read as it last existed ---- */
{
  const s = table();
  on(s, card("Zulaport Cutthroat"), 0);
  on(s, bear("Grizzly Bears"), 0);
  on(s, bear("Their Bear"), 1);
  on(s, WASTES, 0); on(s, WASTES, 0);
  on(s, MURDER, 0, "hand"); on(s, {...MURDER, card: "Murder Two"}, 0, "hand");
  main(s);
  tapAll(s);
  cast(s, "Murder", "Their Bear");
  resolve(s);
  eq([s.stack.length, s.players[1].life], [0, 40], "a creature an opponent controls dies: Zulaport does not trigger, the creature read as theirs as it died");
  applyAction(s, 0, offers(s, "cast", "Murder Two").find((a) => a.targetNames.join() === "Grizzly Bears"));
  resolve(s);
  eq([s.stack.length, s.stack[0]?.kind], [1, "trigger"], "one of its own dies: it triggers, though the Bears are a new object in the graveyard (CR 400.7)");
  resolve(s);
  eq([s.players[1].life, s.players[0].life], [39, 41], "each opponent loses 1, and its controller gains 1");
}

/* ---- one wipe, one moment: Blood Artist sees every death, its own too (CR 603.10a) ---- */
{
  const s = table();
  on(s, card("Blood Artist"), 0);
  on(s, bear("Grizzly Bears"), 0);
  on(s, bear("Their Bear"), 1);
  on(s, WASTES, 0);
  on(s, WRATH, 0, "hand");
  main(s);
  tapAll(s);
  cast(s, "Wrath");
  resolve(s);
  eq([s.awaiting?.kind, awaitingChoice(s).options.length], ["order-triggers", 3], "three creatures died at once, Blood Artist with them: three triggers, its controller asked their order (CR 603.3b)");
  resolveAwaiting(s, [0, 1, 2]);
  for (let i = 0; i < 3; i += 1) { eq(awaitingChoice(s).options.map((o) => o.label), ["Rob", "Maya"], `trigger ${i + 1} asks for its target player`); resolveAwaiting(s, [1]); }
  for (let i = 0; i < 3; i += 1) resolve(s);
  eq([s.players[1].life, s.players[0].life, s.stack.length], [37, 43, 0], "Maya loses 3 and Rob gains 3: every death in the wipe seen");
}

/* ---- "whenever equipped creature dies": the Equipment was attached to it as it died ---- */
{
  const s = table();
  on(s, card("Skullclamp"), 0);
  on(s, bear("Elf", {power: 1, toughness: 1}), 0);
  on(s, bear("Grizzly Bears"), 0);
  on(s, WASTES, 0); on(s, WASTES, 0);
  on(s, MURDER, 0, "hand");
  main(s);
  tapAll(s);
  cast(s, "Murder", "Grizzly Bears");
  resolve(s);
  eq(s.stack.length, 0, "a creature it is not attached to dies: no trigger");
  applyAction(s, 0, offers(s, "activate", "Skullclamp").find((a) => a.targetNames.join() === "Elf"));
  resolve(s);
  eq([zoneOf(s, "Elf"), s.stack.length], ["graveyard", 1], "clamped, the 1/1 is a 2/0 and dies to state-based actions (CR 704.5f); the Skullclamp, unattached by then, still saw it");
  const hand = projectFor(s, 0).players[0].zones.Hand.count;
  resolve(s);
  eq(projectFor(s, 0).players[0].zones.Hand.count, hand + 2, "two cards");
}

/* ---- "Sacrifice a creature": a cost chosen as it is activated ---- */
{
  const s = table();
  on(s, card("Viscera Seer"), 0);
  on(s, bear("Grizzly Bears"), 0);
  on(s, bear("Their Bear"), 1);
  on(s, card("Zulaport Cutthroat"), 0);
  main(s);
  eq(offers(s, "activate", "Viscera Seer").map((a) => a.costNames.join()).sort(), ["Grizzly Bears", "Viscera Seer", "Zulaport Cutthroat"],
    "one offer per creature its controller has -- itself included, never an opponent's (CR 701.21a)");
  const forged = {...offers(s, "activate", "Viscera Seer")[0], costChoice: {sacrifice: s.zones.battlefield.find((id) => s.objects[id].card === "Their Bear")}, costNames: ["Their Bear"]};
  throws(() => applyAction(s, 0, forged), /not a legal action/, "an offer to sacrifice an opponent's creature is refused");
  applyAction(s, 0, offers(s, "activate", "Viscera Seer").find((a) => a.costNames.join() === "Grizzly Bears"));
  eq([zoneOf(s, "Grizzly Bears"), s.stack.map((e) => e.kind).sort()], ["graveyard", ["ability", "trigger"].sort()],
    "the Bears are sacrificed as it is activated, the scry on the stack -- and the sacrifice is a death Zulaport sees (CR 700.4)");
}
{
  const s = table();
  on(s, card("Yahenni, Undying Partisan"), 0);
  on(s, bear("Grizzly Bears"), 0);
  main(s);
  eq(offers(s, "activate", "Yahenni, Undying Partisan").map((a) => a.costNames.join()), ["Grizzly Bears"], "\"Sacrifice another creature\": never the source itself");
}

/* ---- a mana ability that sacrifices a creature ---- */
{
  const s = table();
  on(s, card("Ashnod's Altar"), 0);
  main(s);
  eq(offers(s, "activate-mana", "Ashnod's Altar").length, 0, "with no creature, Ashnod's Altar offers nothing");
  on(s, bear("Grizzly Bears"), 0); on(s, bear("Runeclaw Bear"), 0);
  eq(offers(s, "activate-mana", "Ashnod's Altar").map((a) => a.costNames.join()).sort(), ["Grizzly Bears", "Runeclaw Bear"], "with two, two offers");
  applyAction(s, 0, offers(s, "activate-mana", "Ashnod's Altar").find((a) => a.costNames.join() === "Runeclaw Bear"));
  eq([s.players[0].manaPool.C, zoneOf(s, "Runeclaw Bear"), s.stack.length], [2, "graveyard", 0], "{C}{C} in the pool, the chosen creature sacrificed, nothing on the stack (CR 605.3a)");
  const altar = compileScript(script("Phyrexian Altar")).definition.abilities[0];
  eq([altar.kind, altar.sacrifice, altar.anyColor], ["mana", {types: ["Creature"]}, true], "the directory compiles \"Sacrifice a creature: Add one mana of any color\" to a mana ability whose sacrifice is chosen");
}
{
  /* The house pilot taps a source for a spell it could then cast -- never one whose cost is a creature. */
  const facts = (name) => (name === "Giant" ? {manaValue: 1, types: ["Creature"]} : null);
  const giant = {card: "Giant", types: ["Creature"], manaCost: "{1}", power: 5, toughness: 5};
  const control = table();
  on(control, WASTES, 0);
  on(control, giant, 0, "hand");
  main(control);
  eq(housePilot({seat: 0, cards: facts}).choose(projectFor(control, 0), legalActions(control, 0)).label, "Wastes",
    "with a land for the mana, the house pilot taps it for the Giant it could then cast");
  const s = table();
  on(s, card("Ashnod's Altar"), 0);
  on(s, bear("Grizzly Bears"), 0);
  on(s, giant, 0, "hand");
  main(s);
  const pick = housePilot({seat: 0, cards: facts}).choose(projectFor(s, 0), legalActions(s, 0));
  eq(pick.kind, "pass", "with only Ashnod's Altar for mana, the house pilot passes rather than trade its Bears for a spell");
}

/* ---- "you may" (CR 603.5) ---- */
{
  const s = table([FOREST, WASTES]);
  on(s, card("Solemn Simulacrum"), 0, "hand");
  for (let i = 0; i < 4; i += 1) on(s, WASTES, 0);
  main(s);
  tapAll(s);
  cast(s, "Solemn Simulacrum");
  resolve(s);
  const library = JSON.stringify(s.zones.library[0]);
  resolve(s);
  eq([awaitingChoice(s).title, awaitingChoice(s).options.map((o) => o.label)], ["When this creature enters, you may search your library for a basic land card, put that card onto the battlefield tapped, then shuffle.", ["Yes", "No"]],
    "as the trigger resolves, its controller is asked in the card's words: Yes or No");
  resolveAwaiting(s, [1], null, createRng("x"));
  eq([JSON.stringify(s.zones.library[0]), s.stack.length, s.awaiting], [library, 0, null], "No: nothing at all -- no search, and no shuffle");
}
{
  const s = table([FOREST, WASTES]);
  on(s, card("Solemn Simulacrum"), 0, "hand");
  for (let i = 0; i < 4; i += 1) on(s, WASTES, 0);
  main(s);
  tapAll(s);
  cast(s, "Solemn Simulacrum");
  resolve(s); resolve(s);
  resolveAwaiting(s, [0], null, createRng("x"));
  eq(s.awaiting?.effect, "chooseCard", "Yes: the search");
  resolveAwaiting(s, [awaitingChoice(s).options.findIndex((o) => o.label === "Forest")], null, createRng("x"));
  ok(s.zones.battlefield.some((id) => s.objects[id].card === "Forest" && s.objects[id].tapped), "and the basic land it found, tapped");
}
{
  const compiled = compileScript(script("Solemn Simulacrum")).definition.abilities;
  eq(compiled.map((a) => a.effects[0].effect), ["modal", "modal"], "the directory compiles each \"you may\" to a question with Yes and No");
  /* Batch 8 read every trigger's filter as a possible choice: an arrival's compiles now, and a choice naming a key the
     grammar has not got is still refused. */
  const arrival = compileScript({...script("Blood Artist"), abilities: [{kind: "triggered", text: "x", trigger: {on: "enters", who: "another", filter: {anyOf: [{types: ["Creature"]}, {types: ["Planeswalker"]}]}}, effects: [{effect: "gainLife", amount: 1}]}]});
  eq(arrival.problems, [], "a choice of types in an arrival's filter compiles");
  const bad = compileScript({...script("Blood Artist"), abilities: [{kind: "triggered", text: "x", trigger: {on: "enters", who: "another", filter: {anyOf: [{types: ["Creature"]}, {kind: "elf"}]}}, effects: [{effect: "gainLife", amount: 1}]}]});
  ok(bad.definition === null && bad.problems.some((p) => /no key "kind"/.test(p)), "and an alternative with a key the grammar has not got is refused");
}

console.log(`engine-deaths: ${checks} checks passed — a death read as the thing last existed, a wipe seen whole, "equipped creature dies", a creature sacrificed as a cost chosen and a mana ability's off the stack, and "you may" asked.`);
