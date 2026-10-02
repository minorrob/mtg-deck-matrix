/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* M4 PHASE 3, BATCH 6: EQUIP, THE PREDEFINED TOKENS, AND "AS AN ADDITIONAL COST TO CAST THIS SPELL".
 *
 * Swiftfoot Boots and Lightning Greaves are in nearly every Commander deck, and Treasure is the most-made token. Equip is
 * an activated ability: "Attach this permanent to target creature you control. Activate only as a sorcery" (CR 702.6a,
 * 701.3). What an Equipment grants is a static ability whose `affects` is `attachedBy: "self"` -- the layers read it
 * from the object it is attached to, so it moves when the Equipment moves. An Equipment whose creature has gone is
 * unattached and stays (CR 704.5n). Treasure, Food and Clue are named, not spelled out (CR 111.10). A spell's
 * additional cost is chosen as it is cast, each choice its own offer, and paid with the rest of the cost (CR 601.2b,
 * 601.2h).
 */
import assert from "node:assert/strict";
import {createState, addObject} from "../game/engine/state/index.mjs";
import {beginGame, advance, awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {legalActions, applyAction} from "../game/engine/rules/actions.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";
import {projectFor} from "../game/engine/projection.mjs";
import {runEffects} from "../game/engine/script/effects/index.mjs";
import {checkStateBasedActions} from "../game/engine/rules/sba.mjs";
import {compileSelector} from "../game/engine/script/filter.mjs";
import {PREDEFINED_TOKENS} from "../game/engine/script/effects/permanents.mjs";
import {compileScript} from "../game/engine/cards/index.mjs";
import {loadCardIndex, loadCardScripts} from "../game/tools/engine-cards.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };
const throws = (f, re, m) => { assert.throws(f, re, m); checks += 1; };

const cards = loadCardIndex();
const script = (name) => structuredClone(loadCardScripts().find((e) => e.script.identity.name === name).script);
const card = (name) => { const d = cards.definition(name); assert.ok(d, `${name} is defined`); return {...d, card: name}; };
const WASTES = {card: "Wastes", types: ["Land"], supertypes: ["Basic"], abilities: [{id: "a0", kind: "mana", tapSelf: true, produces: {C: 1}}]};
const basic = (name, color) => ({card: name, types: ["Land"], supertypes: ["Basic"], subtypes: [name], abilities: [{id: "a0", kind: "mana", tapSelf: true, produces: {[color]: 1}}]});
const bear = (name) => ({card: name, types: ["Creature"], manaCost: "{1}{G}", power: 2, toughness: 2});
const LEGEND = {card: "Legend", types: ["Creature"], supertypes: ["Legendary"], manaCost: "{2}", power: 2, toughness: 2};
const ROCK = {card: "Rock", types: ["Artifact"], manaCost: "{1}"};
const MURDER = {card: "Murder", types: ["Instant"], manaCost: "{C}", spell: {id: "s", text: "Destroy target creature.",
  targets: [{what: "permanent", types: ["Creature"]}], effects: [{effect: "destroy", targets: {target: 0}}]}};

const pod = {matchId: "m", seed: "equip", players: [{name: "Rob"}, {name: "Maya"}]};
function table() {
  const s = createState(pod);
  for (let seat = 0; seat < 2; seat += 1) for (let i = 0; i < 12; i += 1) addObject(s, {...WASTES, owner: seat, controller: seat}, "library", seat);
  return s;
}
const on = (s, o, seat, zone = "battlefield") => addObject(s, {...o, owner: seat, controller: seat}, zone, ["battlefield", "exile"].includes(zone) ? null : seat);
function main(s) { beginGame(s); for (let n = 0; n < 50 && !(s.phase === "MAIN1" && s.priorityPlayer === 0); n += 1) advance(s); return s; }
/* On to a step of the first turn, its active player holding priority: everyone passes, the step ends, the next begins;
   asked to attack, nobody does. */
function to(s, phase) {
  for (let n = 0; n < 50 && !(s.phase === phase && s.priorityPlayer === 0); n += 1) {
    if (s.awaiting) resolveAwaiting(s, []);
    else if (s.priorityPlayer === null || passPriority(s).outcome === "step-ends") advance(s);
  }
  assert.equal(s.phase, phase, `reached ${phase}`);
  return s;
}
/* Where a card is now: a card that changes zones is a new object (CR 400.7), so it is found by name, not by its old id. */
const zoneOf = (s, name) => Object.values(s.objects).filter((o) => o.card === name).map((o) => o.zone).join();
const view = (s, name, seat = 0) => projectFor(s, seat).players[seat].zones.Battlefield.cards.find((c) => c.name === name);
const offers = (s, kind, name, seat = 0) => legalActions(s, seat).filter((a) => a.kind === kind && a.label === name);
const tapAll = (s, name = "Wastes", seat = 0) => { for (let a; (a = legalActions(s, seat).find((x) => x.kind === "activate-mana" && x.label === name));) applyAction(s, seat, a); };
const resolve = (s) => { passPriority(s); return passPriority(s); };
const equipTo = (s, equipment, target) => applyAction(s, 0, offers(s, "activate", equipment).find((a) => (a.targetNames ?? []).join() === target));

/* ---- Equip ---- */
{
  const s = table();
  const boots = on(s, card("Swiftfoot Boots"), 0);
  const first = on(s, bear("Grizzly Bears"), 0);
  const second = on(s, bear("Runeclaw Bear"), 0);
  on(s, bear("Their Bear"), 1);
  on(s, WASTES, 0); on(s, WASTES, 0);
  main(s);
  eq(offers(s, "activate", "Swiftfoot Boots").length, 0, "Equip {1} is not offered with no mana to pay it");
  applyAction(s, 0, legalActions(s, 0).find((a) => a.kind === "activate-mana"));
  eq(offers(s, "activate", "Swiftfoot Boots").map((a) => a.targetNames.join()).sort(), ["Grizzly Bears", "Runeclaw Bear"],
    "with the mana, Equip is offered at each creature its controller has -- never an opponent's (CR 702.6a: \"target creature you control\")");
  equipTo(s, "Swiftfoot Boots", "Grizzly Bears");
  eq(offers(s, "activate", "Swiftfoot Boots").length, 0, "with Equip on the stack, it is not offered again: Activate only as a sorcery (CR 602.5d, 307.1)");
  resolve(s);
  eq([s.objects[boots].attachedTo, s.objects[first].attachments], [first, [boots]], "resolved: the Boots are attached to the Bears, and the Bears know it");
  ok(["Hexproof", "Haste"].every((k) => view(s, "Grizzly Bears").keywords.includes(k)), "the equipped creature has hexproof and haste, as its controller's view shows");
  eq(view(s, "Runeclaw Bear").keywords.includes("Haste"), false, "the other creature has nothing from Equipment attached elsewhere");
  applyAction(s, 0, legalActions(s, 0).find((a) => a.kind === "activate-mana"));
  equipTo(s, "Swiftfoot Boots", "Runeclaw Bear");
  resolve(s);
  eq([s.objects[boots].attachedTo, s.objects[first].attachments, s.objects[second].attachments], [second, [], [boots]],
    "equipped again, the Boots move: unattached from the first creature and attached to the second (CR 701.3a)");
  ok(view(s, "Runeclaw Bear").keywords.includes("Hexproof") && !view(s, "Grizzly Bears").keywords.includes("Hexproof"),
    "what the Equipment grants moves with it: the first creature has lost hexproof, the second has it");
}
{
  const s = table();
  const hammer = on(s, card("Loxodon Warhammer"), 0);
  const host = on(s, bear("Grizzly Bears"), 0);
  for (let i = 0; i < 3; i += 1) on(s, WASTES, 0);
  main(s);
  tapAll(s);
  equipTo(s, "Loxodon Warhammer", "Grizzly Bears");
  resolve(s);
  const v = view(s, "Grizzly Bears");
  eq([v.power, v.toughness, ["Trample", "Lifelink"].every((k) => v.keywords.includes(k))], [5, 2, true],
    "Loxodon Warhammer: +3/+0 in layer 7c and trample and lifelink in layer 6, both from one line of text");
  /* No longer a creature (as a type-changing effect would make it): the Equipment falls off and stays (CR 704.5n). */
  s.objects[host].types = ["Artifact"];
  checkStateBasedActions(s);
  eq([s.objects[hammer].attachedTo, s.objects[hammer].zone, s.objects[host].attachments, s.objects[host].zone], [null, "battlefield", [], "battlefield"],
    "its creature no longer a creature, the Warhammer is unattached and stays on the battlefield; the artifact stays too");
}
{
  /* CR 704.5n: the creature dies; the Equipment stays on the battlefield, unattached. */
  const s = table();
  const greaves = on(s, card("Lightning Greaves"), 0);
  const boots = on(s, card("Swiftfoot Boots"), 0);
  const host = on(s, bear("Grizzly Bears"), 0);
  const other = on(s, bear("Runeclaw Bear"), 0);
  for (let i = 0; i < 3; i += 1) on(s, WASTES, 0);
  on(s, MURDER, 0, "hand");
  main(s);
  const tapOne = () => applyAction(s, 0, legalActions(s, 0).find((a) => a.kind === "activate-mana"));
  tapOne();
  equipTo(s, "Swiftfoot Boots", "Grizzly Bears");
  resolve(s);
  tapOne();
  equipTo(s, "Swiftfoot Boots", "Grizzly Bears");
  const again = resolve(s);
  eq([again.outcome, again.events.some((e) => e.kind === "GameEventCardAttachment")], ["resolved", false], "Equip resolves, and attaches nothing anew");
  eq([s.objects[boots].attachedTo, s.objects[host].attachments], [host, [boots]],
    "equipped again to the creature it is on, nothing changes: still attached, listed once (CR 701.3b)");
  equipTo(s, "Lightning Greaves", "Grizzly Bears");
  resolve(s);
  eq([s.objects[greaves].attachedTo, s.objects[host].attachments.length], [host, 2], "Equip {0}: the Greaves join the Boots on the Bears");
  /* "Equipped creature" as a selector (a "destroy equipped creature", an "equipped creature deals damage" trigger). */
  const equipped = compileSelector({what: "permanent", attachedBy: "self"});
  eq([equipped(s, host, {source: greaves}), equipped(s, other, {source: greaves}), equipped(s, other, {source: boots})], [true, false, false],
    "the selector takes in the creature its source is attached to, and nothing else");
  throws(() => equipped(s, host, {}), /needs the source attached to it/, "and is refused without a source to read");
  ok(["Shroud", "Hexproof", "Haste"].every((k) => view(s, "Grizzly Bears").keywords.includes(k)), "both grant: shroud, hexproof and haste");
  tapOne();
  eq(offers(s, "activate", "Swiftfoot Boots").map((a) => a.targetNames.join()), ["Runeclaw Bear"],
    "with shroud, the Bears cannot be targeted even by their controller's Equip (CR 702.18a): the Boots may go only to the other");
  eq(offers(s, "cast", "Murder").map((a) => a.targetNames.join()), ["Runeclaw Bear"], "nor by their controller's Murder");
  equipTo(s, "Lightning Greaves", "Runeclaw Bear");
  resolve(s);
  eq([s.objects[greaves].attachedTo, s.objects[host].attachments, s.objects[other].attachments], [other, [boots], [greaves]], "the Greaves moved to the other creature");
  eq(offers(s, "cast", "Murder").map((a) => a.targetNames.join()).sort(), ["Grizzly Bears"],
    "hexproof stops only opponents (CR 702.11b): Murder may target the Bears now, not the Bear with the Greaves");
  applyAction(s, 0, offers(s, "cast", "Murder")[0]);
  resolve(s);
  eq([zoneOf(s, "Grizzly Bears"), s.objects[boots].zone, s.objects[boots].attachedTo, s.objects[greaves].attachedTo], ["graveyard", "battlefield", null, other],
    "Murder destroys the Bears: the Boots stay on the battlefield, attached to nothing (CR 704.5n), and the Greaves are untouched");
}
{
  /* The target gone before Equip resolves: the ability does nothing (CR 608.2b), and the Equipment stays where it was. */
  const s = table();
  const greaves = on(s, card("Lightning Greaves"), 0);
  on(s, bear("Grizzly Bears"), 0);
  on(s, WASTES, 0);
  on(s, MURDER, 0, "hand");
  main(s);
  equipTo(s, "Lightning Greaves", "Grizzly Bears");
  tapAll(s);
  applyAction(s, 0, offers(s, "cast", "Murder")[0]);
  eq(s.stack.length, 2, "Murder in response to Equip, on top of it");
  resolve(s);
  resolve(s);
  eq([zoneOf(s, "Grizzly Bears"), s.objects[greaves].attachedTo, s.objects[greaves].zone, s.stack.length], ["graveyard", null, "battlefield", 0],
    "Equip whose creature is gone does nothing: the Greaves are attached to nothing, still on the battlefield");
}
{
  const s = table();
  on(s, card("Lightning Greaves"), 0);
  on(s, bear("Grizzly Bears"), 0);
  main(s);
  eq(offers(s, "activate", "Lightning Greaves").length, 1, "in the main phase with the stack empty, Equip {0} is offered");
  to(s, "COMBAT_BEGIN");
  eq(offers(s, "activate", "Lightning Greaves").length, 0, "at the beginning of combat it is not: Activate only as a sorcery (CR 702.6a)");
  to(s, "MAIN2");
  eq(offers(s, "activate", "Lightning Greaves").length, 1, "and in the second main phase it is again");
}
{
  /* Mithril Coat: "When Mithril Coat enters, attach it to target legendary creature you control." */
  const s = table();
  on(s, card("Mithril Coat"), 0, "hand");
  const legend = on(s, LEGEND, 0);
  on(s, bear("Grizzly Bears"), 0);
  for (let i = 0; i < 4; i += 1) on(s, WASTES, 0);
  main(s);
  tapAll(s);
  applyAction(s, 0, offers(s, "cast", "Mithril Coat")[0]);
  resolve(s);
  eq([s.awaiting?.kind, awaitingChoice(s).options.map((o) => o.label)], ["trigger-targets", ["Legend"]],
    "its arrival trigger asks for a legendary creature its controller has: the Legend, not the Bears");
  resolveAwaiting(s, [0]);
  resolve(s);
  const coat = s.zones.battlefield.find((id) => s.objects[id].card === "Mithril Coat");
  eq([s.objects[coat].attachedTo, view(s, "Legend").keywords.includes("Indestructible"), view(s, "Grizzly Bears").keywords.includes("Indestructible")], [legend, true, false],
    "the trigger attaches it: the Legend is indestructible, the Bears are not");
}

/* ---- the predefined tokens ---- */
{
  const s = table();
  main(s);
  runEffects(s, [{effect: "createToken", count: 1, token: {predefined: "Treasure"}}, {effect: "createToken", count: 1, token: {predefined: "Food"}},
    {effect: "createToken", count: 1, token: {predefined: "Clue"}}], {controller: 0, source: null});
  eq(projectFor(s, 0).players[0].zones.Battlefield.cards.map((c) => c.name).sort(), ["Clue", "Food", "Treasure"], "a Treasure, a Food and a Clue, each from its name alone (CR 111.10)");
  eq(offers(s, "activate-mana", "Treasure").length, 5, "the Treasure taps for any one color: five offers");
  applyAction(s, 0, offers(s, "activate-mana", "Treasure").find((a) => JSON.stringify(a.mana) === JSON.stringify({G: 1})));
  eq(s.players[0].manaPool.G, 1, "tapped for green, green is in the pool");
  eq([s.zones.battlefield.some((id) => s.objects[id].card === "Treasure"), s.stack.length], [false, 0],
    "sacrificed as it is tapped, the Treasure is gone at once, and nothing went on the stack (CR 605.3a)");
  ok(!Object.values(s.objects).some((o) => o.card === "Treasure" && o.zone === "graveyard"), "a token that has left the battlefield ceases to exist (CR 704.5d)");
  eq(offers(s, "activate", "Food").length, 0, "Food's {2} is not paid by one mana");
}
{
  const s = table();
  on(s, WASTES, 0); on(s, WASTES, 0);
  main(s);
  runEffects(s, [{effect: "createToken", count: 1, token: {predefined: "Food"}}], {controller: 0, source: null});
  s.players[0].life = 30;
  tapAll(s);
  applyAction(s, 0, offers(s, "activate", "Food")[0]);
  ok(!s.zones.battlefield.some((id) => s.objects[id].card === "Food"), "Food is sacrificed as its cost is paid");
  resolve(s);
  eq(s.players[0].life, 33, "{2}, {T}, Sacrifice: you gain 3 life");
}
{
  const s = table();
  on(s, WASTES, 0); on(s, WASTES, 0);
  main(s);
  runEffects(s, [{effect: "createToken", count: 1, token: {predefined: "Clue"}}], {controller: 0, source: null});
  const before = projectFor(s, 0).players[0].zones.Hand.count;
  tapAll(s);
  applyAction(s, 0, offers(s, "activate", "Clue")[0]);
  resolve(s);
  eq(projectFor(s, 0).players[0].zones.Hand.count, before + 1, "{2}, Sacrifice: draw a card");
}
{
  const s = table();
  main(s);
  throws(() => runEffects(s, [{effect: "createToken", token: {predefined: "Blood"}}], {controller: 0, source: null}), /No predefined token named Blood/,
    "a predefined token the engine does not know is refused, not made blank");
  eq(Object.keys(PREDEFINED_TOKENS).sort(), ["Clue", "Food", "Pest", "Treasure"], "the three the most-played cards make, and the Pest (batch 18, Beledros Witherbloom)");
}

/* ---- a mana ability that sacrifices its source ---- */
{
  const s = table();
  on(s, card("Lotus Petal"), 0);
  main(s);
  eq(offers(s, "activate-mana", "Lotus Petal").length, 5, "Lotus Petal: any one color");
  applyAction(s, 0, offers(s, "activate-mana", "Lotus Petal")[0]);
  eq([s.zones.battlefield.length, Object.values(s.objects).find((o) => o.card === "Lotus Petal").zone, s.stack.length], [0, "graveyard", 0],
    "tapped and sacrificed as the cost of a mana ability: in the graveyard, nothing on the stack");
  const compiled = compileScript(script("Lotus Petal"));
  eq(compiled.definition.abilities[0].sacrificeSelf, true, "the directory compiles \"Sacrifice this\" in a mana ability's cost to sacrificeSelf");
}

/* ---- additional costs ---- */
{
  const s = table();
  on(s, card("Big Score"), 0, "hand");
  on(s, bear("Grizzly Bears"), 0, "hand");
  on(s, LEGEND, 0, "hand");
  for (let i = 0; i < 3; i += 1) on(s, WASTES, 0);
  on(s, basic("Mountain", "R"), 0);
  main(s);
  tapAll(s); tapAll(s, "Mountain");
  const ways = offers(s, "cast", "Big Score");
  eq(ways.map((a) => a.costNames.join()).sort(), ["Grizzly Bears", "Legend"],
    "Big Score is offered once per card that could be discarded, and never the spell itself (CR 601.2b)");
  const events = applyAction(s, 0, JSON.parse(JSON.stringify(ways.find((a) => a.costNames.join() === "Grizzly Bears"))));
  eq([s.stack.length, Object.values(s.objects).find((o) => o.card === "Grizzly Bears").zone], [1, "graveyard"],
    "cast from a copy of the offer: the spell is on the stack and the Bears discarded already, with the rest of its cost (CR 601.2h)");
  ok(events.some((e) => e.data?.fields?.discarded === true), "the move says it was a discard, for a madness or a discard trigger");
  resolve(s);
  eq([projectFor(s, 0).players[0].zones.Battlefield.cards.filter((c) => c.name === "Treasure").length], [2], "and resolved: two Treasures");
}
{
  const s = table();
  on(s, card("Thrill of Possibility"), 0, "hand");
  on(s, WASTES, 0); on(s, basic("Mountain", "R"), 0);
  main(s);
  tapAll(s); tapAll(s, "Mountain");
  eq(offers(s, "cast", "Thrill of Possibility").length, 0, "with no other card in hand, the discard cannot be paid, and the spell is not offered");
}
{
  const s = table();
  on(s, card("Village Rites"), 0, "hand");
  on(s, bear("Grizzly Bears"), 0);
  on(s, LEGEND, 0);
  on(s, ROCK, 0);
  on(s, bear("Their Bear"), 1);
  on(s, basic("Swamp", "B"), 0);
  main(s);
  tapAll(s, "Swamp");
  eq(offers(s, "cast", "Village Rites").map((a) => a.costNames.join()).sort(), ["Grizzly Bears", "Legend"],
    "Village Rites: one offer per creature its caster controls -- not an artifact, not an opponent's creature");
}
{
  const s = table();
  on(s, card("Deadly Dispute"), 0, "hand");
  on(s, bear("Grizzly Bears"), 0);
  on(s, ROCK, 0);
  on(s, WASTES, 0); on(s, basic("Swamp", "B"), 0);
  main(s);
  tapAll(s); tapAll(s, "Swamp");
  const ways = offers(s, "cast", "Deadly Dispute");
  eq(ways.map((a) => a.costNames.join()).sort(), ["Grizzly Bears", "Rock"], "Deadly Dispute: an artifact or a creature, never a land");
  applyAction(s, 0, ways.find((a) => a.costNames.join() === "Rock"));
  ok(!s.zones.battlefield.some((id) => s.objects[id].card === "Rock"), "the artifact is sacrificed as the spell is cast");
  resolve(s);
  eq(projectFor(s, 0).players[0].zones.Battlefield.cards.filter((c) => c.name === "Treasure").length, 1, "and a Treasure on resolution");
}
{
  /* A stale offer: the card it would discard has left the hand. */
  const s = table();
  on(s, card("Big Score"), 0, "hand");
  const fodder = on(s, bear("Grizzly Bears"), 0, "hand");
  for (let i = 0; i < 3; i += 1) on(s, WASTES, 0);
  on(s, basic("Mountain", "R"), 0);
  main(s);
  tapAll(s); tapAll(s, "Mountain");
  const offer = offers(s, "cast", "Big Score")[0];
  const forged = {...offer, costChoice: {discard: s.zones.battlefield.find((id) => s.objects[id].card === "Wastes")}, costNames: ["Wastes"]};
  throws(() => applyAction(s, 0, forged), /not a legal action/, "a submitted offer whose additional cost was never offered (a land on the battlefield as the discard) is refused");
  s.zones.hand[0] = s.zones.hand[0].filter((id) => id !== fodder);
  s.zones.exile.push(fodder); s.objects[fodder].zone = "exile";
  throws(() => applyAction(s, 0, offer), /not a legal action/, "an offer whose discard is no longer in hand is refused");
  eq(s.stack.length, 0, "and nothing was cast");
}
{
  const thrill = script("Thrill of Possibility");
  eq(compileScript(thrill).problems, [], "Thrill of Possibility, as written, compiles");
  const bad = compileScript({...thrill, abilities: [{...thrill.abilities[0], additionalCost: [{atom: "payLife", amount: 3}]}]});
  eq([bad.definition, bad.problems.some((p) => /payLife: an additional cost nothing pays yet/.test(p))], [null, true], "an additional cost the engine cannot pay is refused at compile, so the card stays unplayable");
}

console.log(`engine-equip: ${checks} checks passed — Equip at sorcery speed moves what it grants, the Equipment stays when its creature goes, Treasure, Food and Clue by name, and additional costs chosen as offers.`);
