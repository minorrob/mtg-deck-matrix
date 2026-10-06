/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* MANIFEST, AND FACE-DOWN PERMANENTS (CR 701.40, 708; Reality Shift, claude/cards-faces-class).
 *
 * To manifest the top card of a library is to put it onto the battlefield face down (effects/zones.mjs, manifest; state/
 * index.mjs, moveObject's `faceDown`): a nameless, textless 2/2 creature without subtypes or a mana cost (CR 701.40a,
 * 708.2a), turned face down before it enters, so nothing of its own happens as it does (708.3). WHAT IT IS IS HIDDEN: its
 * controller may look at it (708.5) -- `faceDownName` in that seat's projection alone -- and no other seat's view, no
 * event, no line of the table's history names it, until it is turned face up -- a creature card, for its mana cost, a
 * special action (701.40b, 116.2b; rules/actions.mjs) -- or leaves the battlefield, revealed as it moves (708.9). Turned
 * face up it is the same object, every effect on it still applying (708.8), with a new timestamp (613.7f). The property is
 * checked the way tests/engine-projection.mjs checks it: every string anywhere in each document.
 */
import assert from "node:assert/strict";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {legalActions, applyAction} from "../game/engine/rules/actions.mjs";
import {runEffect} from "../game/engine/script/effects/index.mjs";
import {characteristicsOf, lastKnown} from "../game/engine/rules/layers.mjs";
import {selectMatching} from "../game/engine/script/filter.mjs";
import {factsOf, targetName} from "../game/engine/script/bind.mjs";
import {projectFor} from "../game/engine/projection.mjs";
import {historyLines} from "../game/room/history.mjs";
import {offerDetails} from "../game/room/room.mjs";
import {transformObject, addObject} from "../game/engine/state/index.mjs";
import {concede} from "../game/engine/rules/sba.mjs";
import {missingFor} from "../game/tools/engine-constructs.mjs";
import {housePilot} from "../game/engine/pilots/house-pilot.mjs";
import {advance, awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";
import {createRng} from "../game/engine/rng.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const RS = "Reality Shift", SECRET = "Secret Ox";
const at = (seat, zone, ...cards) => ({seat, zone, cards});
const FIX = {Bear: {types: ["Creature"], subtypes: ["Bear"], manaCost: "{1}{G}", colors: ["G"], power: 2, toughness: 2},
  [SECRET]: {types: ["Creature"], subtypes: ["Ox"], supertypes: ["Legendary"], manaCost: "{4}{B}", colors: ["B"], power: 6, toughness: 6},
  "Secret Ward": {types: ["Enchantment"], manaCost: "{1}{W}", colors: ["W"], power: null, toughness: null},
  "Secret Tapland": {types: ["Land"], manaCost: null, colors: [], power: null, toughness: null,
    abilities: [{id: "a0", kind: "replacement", text: "This land enters tapped.", watches: {event: "enters", who: "self"}, change: {entersTapped: true}}]},
  "Secret Aura": {types: ["Enchantment"], subtypes: ["Aura"], manaCost: "{W}", colors: ["W"], power: null, toughness: null, enchant: {what: "permanent", types: ["Creature"]}},
  "Secret Free": {types: ["Creature"], manaCost: null, colors: [], power: 1, toughness: 1},
  "Secret Phyrexian": {types: ["Creature"], manaCost: "{B/P}", colors: ["B"], power: 1, toughness: 1},
  "Gate Warden": {types: ["Enchantment"], manaCost: "{2}", colors: [], power: null, toughness: null,
    abilities: [{id: "a0", kind: "replacement", text: "If a card would be put onto the battlefield, exile it instead.", watches: {event: "zone-change", to: "battlefield"}, change: {to: "exile"}}]},
  Calf: {types: ["Creature"], subtypes: ["Ox"], manaCost: "{G}", colors: ["G"], power: 1, toughness: 1},
  Rhino: {types: ["Creature"], subtypes: ["Rhino"], manaCost: "{4}{G}", colors: ["G"], power: 4, toughness: 4, keywords: ["Trample"]}};
const NAMES = ["Rob", "Maya", "Trey", "Sam"];
const run = (setup, steps = [], more = {}) => runScenario({name: "manifest", setup, steps, ...more}, index.definition, FIX);
const SHIFT = [{tap: "Island"}, {tap: "Wastes"}, {cast: RS, targets: [{card: "Bear", seat: 1}]}, {resolve: true}];
const SETUP = (more = []) => [at(0, "battlefield", "Island", "Wastes"), at(0, "hand", RS), at(1, "battlefield", "Bear", ...more)];
const faceDown = (s) => s.zones.battlefield.filter((id) => s.objects[id].faceDown === true);
function everyString(value, out = []) {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) for (const item of value) everyString(item, out);
  else if (value && typeof value === "object") for (const item of Object.values(value)) everyString(item, out);
  return out;
}
const mentions = (value, name) => everyString(value).some((text) => text.includes(name));

/* ---- four seats: the card is Maya's to see, and nobody else's ---- */
{
  /* The Secret Ox on top of Maya's library alone -- a name no other seat holds -- and Reality Shift resolved by four passes. */
  const {state: s} = run(SETUP(), SHIFT.slice(0, 3), {seats: 4});
  addObject(s, {...FIX[SECRET], card: SECRET, owner: 1, controller: 1}, "library", 1);
  s.zones.library[1].unshift(s.zones.library[1].pop());
  const events = [];
  for (let n = 0; n < 4 && s.stack.length; n += 1) events.push(...passPriority(s, null, createRng("manifest")).events);
  const [id] = faceDown(s);
  eq([s.objects[id].controller, s.objects[id].owner, s.zones.library[1].length], [1, 1, 20], "Maya manifests the top card of HER library, twenty-one cards, now twenty: hers, under her control");
  const mine = projectFor(s, 1).players[1].zones.Battlefield.cards.find((c) => c.cardId === id);
  eq([mine.name, mine.faceDownName, mine.faceDown, mine.types, mine.power, mine.toughness], [null, SECRET, true, ["Creature"], 2, 2],
    "Maya's own view: a face-down 2/2 creature with no name -- and what card it is, which she may look at (CR 708.5)");
  for (const seat of [0, 2, 3]) {
    const view = projectFor(s, seat);
    const theirs = view.players[1].zones.Battlefield.cards.find((c) => c.cardId === id);
    eq([theirs.name, theirs.faceDownName, theirs.types, theirs.power, theirs.toughness], [null, undefined, ["Creature"], 2, 2], `${NAMES[seat]} sees a face-down 2/2 creature, and not which card`);
    ok(!mentions(view, SECRET), `and nowhere in ${NAMES[seat]}'s whole projection is the card named`);
  }
  ok(!mentions(projectFor(s, null), SECRET), "nor a spectator's");
  ok(!mentions(events, SECRET), "no event names it: the manifest's move says a face-down card (CR 708.5)");
  eq(events.flatMap((e) => historyLines(e, NAMES).map((l) => l.text)).filter((t) => t.includes("face-down")), ["a face-down card entered the battlefield"],
    "the table's history, the same for every seat, says a face-down card entered");
}

/* ---- what a face-down permanent is (CR 708.2a): no name, no color, no subtype, no supertype, no mana cost, no ability ---- */
{
  const {state: s} = run(SETUP(), SHIFT, {library: [SECRET]});
  const [id] = faceDown(s);
  const c = characteristicsOf(s, id);
  eq([s.objects[id].card, c.colors, c.subtypes, s.objects[id].supertypes, s.objects[id].manaCost, s.objects[id].abilities, c.keywords], [null, [], [], undefined, null, [], []],
    "no name, colorless, no subtypes or supertypes, no mana cost, no abilities");
  eq([selectMatching(s, {what: "permanent", named: SECRET}, {controller: 0}), selectMatching(s, {what: "permanent", colors: ["B"]}, {controller: 0}),
    factsOf(s, [{kind: "object", id}])[0].manaValueOf], [[], [], 0], "nothing finds it by its card's name or color, and its mana value is 0");
  eq(targetName(s, {kind: "object", id}), "A face-down permanent", "aimed at, it is said to be face down -- the same words for every seat");
  const details = offerDetails(s, 0, [{kind: "cast", objectId: 0, targets: [{kind: "object", id}]}]);
  ok(!mentions(details, SECRET) && details[0].includes("A face-down permanent (Maya's)"), `and an offer aimed at it says so: ${details[0]}`);
  runEffect(s, {effect: "manifest", who: [1]}, {controller: 0, source: null});
  const two = faceDown(s);
  eq([two.length, selectMatching(s, {what: "permanent", uniqueName: true, controller: "opponent"}, {controller: 0}).filter((x) => two.includes(x)).length], [2, 2],
    "two face-down permanents do not share a name: they have none (CR 708.2a)");
  const empty = run(SETUP(), [], {library: []}).state;
  empty.zones.library[1].splice(0);
  eq([runEffect(empty, {effect: "manifest", who: [1]}, {controller: 0, source: null}), faceDown(empty).length], [[], 0], "an empty library: nothing is manifested");
}

/* ---- turned face up: a special action, its controller's alone, for a creature card's mana cost (CR 701.40b) ---- */
{
  const {state: s} = run(SETUP(["Swamp", "Wastes", "Wastes", "Wastes", "Wastes"]), [...SHIFT, {pass: 1}, {tap: "Swamp", seat: 1}, ...Array(4).fill({tap: "Wastes", seat: 1})],
    {library: [SECRET]});
  const [id] = faceDown(s);
  const offers = legalActions(s, 1).filter((a) => a.kind === "turn-face-up");
  eq(offers.map((a) => [a.objectId, a.label]), [[id, SECRET]], "offered to Maya, named for her: she may look at it");
  eq(legalActions(s, 0).filter((a) => a.kind === "turn-face-up").length, 0, "never to Rob, who does not control it");
  s.objects[id].counters["+1/+1"] = 1;
  s.objects[id].damage = 1;
  runEffect(s, {effect: "pump", targets: [id], power: 1, toughness: 1}, {controller: 0, source: null});
  const stamp = s.objects[id].timestamp;
  const events = applyAction(s, 1, offers[0]);
  const c = characteristicsOf(s, id);
  eq([s.objects[id].card, s.objects[id].faceDown, c.colors, s.objects[id].supertypes, c.power, s.objects[id].counters, s.objects[id].damage],
    [SECRET, undefined, ["B"], ["Legendary"], 8, {"+1/+1": 1}, 1], "face up: the Secret Ox, the same object -- its counter, its damage and the +1/+1 still on it (CR 708.8): 8/8");
  ok(s.objects[id].timestamp > stamp, "with a new timestamp (CR 613.7f)");
  eq([s.priorityPlayer, s.stack.length, s.players[1].manaPool], [1, 0, {W: 0, U: 0, B: 0, R: 0, G: 0, C: 0}], "no stack, Maya still holds priority (CR 116.3), and {4}{B} paid");
  eq(events.flatMap((e) => historyLines(e, NAMES).map((l) => l.text)), [`Maya turned ${SECRET} face up`], "and now everyone is told which card it is");
  ok(mentions(projectFor(s, 0), SECRET), "Rob's view names it now");
}
{
  /* In response, with a spell on the stack -- any time she has priority. */
  const {state: s} = run([at(0, "battlefield", "Island", "Wastes", "Mountain"), at(0, "hand", RS, "Lightning Bolt"), at(1, "battlefield", "Bear", "Swamp", "Wastes", "Wastes", "Wastes", "Wastes")],
    [...SHIFT, {tap: "Mountain"}, {cast: "Lightning Bolt", targets: [{card: "A face-down permanent"}]}, {pass: 1}, {tap: "Swamp", seat: 1}, ...Array(4).fill({tap: "Wastes", seat: 1})],
    {library: [SECRET]});
  eq(legalActions(s, 1).filter((a) => a.kind === "turn-face-up").length, 1, "with Rob's Bolt on the stack aimed at it, Maya may still turn it face up");
  const poor = run(SETUP(["Swamp"]), [...SHIFT, {pass: 1}, {tap: "Swamp", seat: 1}], {library: [SECRET]}).state;
  eq(legalActions(poor, 1).filter((a) => a.kind === "turn-face-up").length, 0, "with only {B} in her pool, it is not offered: its whole mana cost is paid");
  const land = run(SETUP(["Plains", "Wastes"]), [...SHIFT, {pass: 1}, {tap: "Plains", seat: 1}, {tap: "Wastes", seat: 1}], {library: ["Secret Ward"]}).state;
  eq(legalActions(land, 1).filter((a) => a.kind === "turn-face-up").length, 0, "an enchantment card manifested is never offered: only a creature card turns face up this way");
  assert.throws(() => applyAction(land, 1, {kind: "turn-face-up", objectId: faceDown(land)[0]}), /not a legal action/);
  checks += 1;
}

/* ---- it leaves, and is revealed (CR 708.9); as it last was, a 2/2 ---- */
{
  const {state: s, events} = run([at(0, "battlefield", "Island", "Wastes", "Mountain"), at(0, "hand", RS, "Lightning Bolt"), at(1, "battlefield", "Bear")],
    [...SHIFT, {tap: "Mountain"}, {cast: "Lightning Bolt", targets: [{card: "A face-down permanent"}]}, {resolve: true}], {library: [SECRET]});
  void s;
  eq(events.filter((e) => e.kind === "GameEventCardChangeZone" && e.data.fields.to?.zoneType === "Graveyard" && e.data.fields.card?.name === SECRET).length, 1,
    "3 damage, and it dies a face-down 2/2 -- its move names the card, revealed to everyone as it goes (CR 708.9)");
  const dying = events.find((e) => e.kind === "GameEventCardChangeZone" && e.data.fields.card?.name === SECRET);
  eq([dying.data.fields.leftBehind.power, dying.data.fields.leftBehind.name], [2, null], "as it last was, a nameless 2/2: \"its power\" is 2 (CR 113.7a)");
  const t = run(SETUP(), SHIFT, {library: [SECRET]}).state;
  const [id] = faceDown(t);
  const lki = lastKnown(t, id);
  eq([lki.name, lki.power, lki.abilities], [null, 2, []], "its last known information is the face-down permanent's");
  runEffect(t, {effect: "moveZone", targets: [id], to: "hand"}, {controller: 0, source: null});
  const [card] = t.zones.hand[1];
  eq([t.objects[card].card, t.objects[card].power, t.objects[card].faceDown], [SECRET, 6, undefined], "returned to Maya's hand it is the card again, face up");
}

/* ---- a double-faced card manifested (CR 712.15): face down it can't transform; face up, its front face ---- */
{
  const VE = "Venat, Heart of Hydaelyn // Hydaelyn, the Mothercrystal";
  const {state: s} = run(SETUP(["Plains", "Plains", "Wastes"]), [...SHIFT, {pass: 1}, {tap: "Plains", seat: 1}, {tap: "Plains", seat: 1}, {tap: "Wastes", seat: 1}], {library: [VE]});
  const [id] = faceDown(s);
  eq([s.objects[id].card, s.objects[id].mdfc, transformObject(s, id)], [null, undefined, false], "manifested Venat is a face-down 2/2, and can't transform (CR 712.15a)");
  applyAction(s, 1, legalActions(s, 1).find((a) => a.kind === "turn-face-up"));
  eq([s.objects[id].card, characteristicsOf(s, id).power, Boolean(s.objects[id].mdfc?.transforming)], ["Venat, Heart of Hydaelyn", 3, true],
    "turned face up for {1}{W}{W}: Venat, its front face, a card that may transform again");
}

/* ---- Reality Shift on a face-down creature: revealed into exile, and its controller manifests again ---- */
{
  const {state: s, events} = run([at(0, "battlefield", "Island", "Wastes", "Island", "Wastes"), at(0, "hand", RS, RS), at(1, "battlefield", "Bear")],
    [...SHIFT, {tap: "Island"}, {tap: "Wastes"}, {cast: RS, targets: [{card: "A face-down permanent"}]}, {resolve: true}], {library: [SECRET, "Bear"]});
  eq([s.zones.exile.map((id) => s.objects[id].card).sort(), faceDown(s).length, s.zones.library[1].length], [["Bear", SECRET], 1, 18],
    "the Secret Ox exiled, face up; Maya manifests her next card");
  ok(!mentions(projectFor(s, 0).players[1].zones.Battlefield, "Bear"), "and what that one is, Rob is not told");
  void events;
}

/* ---- what every event, choice and offer says of it; and what it enters as ---- */
{
  const {state: s, events} = run([at(0, "battlefield", "Island", "Wastes", "Mountain"), at(0, "hand", RS, "Lightning Bolt"), at(1, "battlefield", "Bear")],
    [...SHIFT, {tap: "Mountain"}, {cast: "Lightning Bolt", targets: [{card: "A face-down permanent"}]}], {library: [SECRET]});
  const aimed = events.find((e) => e.kind === "GameEventBecomesTarget" && e.data.fields.targetId === faceDown(s)[0]);
  eq([aimed.data.fields.card.name, aimed.data.fields.card.faceDown], [null, true], "an event about it -- it became a target -- says it is face down, and names nothing");
  const {state: a, events: fought} = run([at(0, "battlefield", "Island", "Wastes", "Bear"), at(0, "hand", RS)],
    [{tap: "Island"}, {tap: "Wastes"}, {cast: RS, targets: [{card: "Bear", seat: 0}]}, {resolve: true}, {to: {turn: 3, phase: "MAIN1"}}, {attack: ["A face-down permanent"]}], {library: [SECRET]});
  const declared = fought.find((e) => e.kind === "GameEventAttackersDeclared");
  eq([declared.data.fields.attackers.map((x) => [x.card.name, x.card.faceDown]), mentions(fought.filter((e) => e.data.turn === 3), SECRET), faceDown(a).length],
    [[[null, true]], false, 1], "Rob attacks with it, offered as \"A face-down permanent → Maya\": the attack names nothing either");
  const tapland = run(SETUP(), SHIFT, {library: ["Secret Tapland"]}).state;
  eq(tapland.objects[faceDown(tapland)[0]].tapped, false, "a land that \"enters tapped\", manifested, enters untapped: face down it has no such ability (CR 708.3)");
  const aura = run(SETUP(), SHIFT, {library: ["Secret Aura"]}).state;
  eq(faceDown(aura).length, 1, "an Aura card is manifested too, attached to nothing: face down it has no enchant");
  const fell = run(SETUP(), SHIFT, {library: ["Fell the Profane // Fell Mire"]}).state;
  eq(faceDown(fell).length, 1, "and a modal double-faced card with an instant on its front: face down it is a 2/2 whatever its faces (CR 712.15)");
  /* "If a card would be put onto the battlefield, exile it instead": sent elsewhere, it was never manifested (CR 614.1). */
  const gate = run([...SETUP(), at(0, "battlefield", "Gate Warden")], SHIFT, {library: [SECRET]}).state;
  eq([faceDown(gate).length, gate.zones.exile.map((id) => gate.objects[id].card).sort()], [0, ["Bear", SECRET]], "with a permanent that exiles whatever would enter, the card goes to exile instead, and nothing is manifested");
  const gated = {controller: 0, source: null};
  runEffect(gate, {effect: "manifest", who: [1], remember: true}, gated);
  eq(gated.remembered, [], "and \"the manifested permanent\" is none");
  const walker = run(SETUP(), SHIFT, {library: ["Kasmina, Enigma Sage"]}).state;
  eq([faceDown(walker).length, walker.objects[faceDown(walker)[0]].counters], [1, {}], "a planeswalker card manifested: a 2/2 creature, with no loyalty counters -- it enters as no planeswalker");
  eq(missingFor({apis: ["ChangeZone", "Manifest"]}), [], "and the catalog counts manifest as built (game/tools/engine-constructs.mjs)");
  const remembered = run(SETUP(), [], {library: [SECRET]}).state;
  const context = {controller: 0, source: null};
  runEffect(remembered, {effect: "manifest", who: [1], count: 2, remember: true}, context);
  eq([context.remembered.length, context.remembered.every((id) => remembered.objects[id].faceDown === true)], [2, true], "\"manifest the top two\", one at a time (CR 701.40e), remembered for what follows");
}
{
  /* Its controller leaves the game: revealed as it goes (CR 708.9). */
  const {state: s} = run(SETUP(), SHIFT, {library: [SECRET], seats: 3});
  const left = concede(s, 1);
  ok(left.some((e) => e.kind === "GameEventCardChangeZone" && e.data.fields.card?.name === SECRET), "Maya concedes: her face-down permanent leaves with her, revealed -- named");
}
{
  /* Its controller's offer says what it costs; the house pilot takes it when nothing is to be cast; one with no mana cost, or
     a Phyrexian one paid in life. */
  const {state: s} = run(SETUP(["Swamp", "Wastes", "Wastes", "Wastes", "Wastes"]), [...SHIFT, {pass: 1}, {tap: "Swamp", seat: 1}, ...Array(4).fill({tap: "Wastes", seat: 1})],
    {library: [SECRET]});
  const offers = legalActions(s, 1);
  eq(offerDetails(s, 1, offers.filter((a) => a.kind === "turn-face-up")), ["turn face up for {4}{B}"], "the room says what turning it face up costs");
  eq(housePilot({seat: 1, cards: (name) => index.definition(name)}).choose(projectFor(s, 1), offers).kind, "turn-face-up", "the house pilot turns it face up when its pool pays and nothing is to be cast");
  const free = run(SETUP(), [...SHIFT, {pass: 1}], {library: ["Secret Free"]}).state;
  eq([free.priorityPlayer, legalActions(free, 1).filter((a) => a.kind === "turn-face-up").length], [1, 0],
    "Maya holding priority: a creature card with no mana cost can't be turned face up this way (CR 701.40b)");
  const robs = run(SETUP(), SHIFT, {library: ["Secret Phyrexian"]}).state;
  eq([robs.priorityPlayer, legalActions(robs, 0).filter((a) => a.kind === "turn-face-up").length], [0, 0],
    "Rob holding priority, with life enough for its {B/P}: still never offered Maya's face-down permanent -- its controller's alone");
  const life = run(SETUP(), [...SHIFT, {pass: 1}], {library: ["Secret Phyrexian"]}).state;
  const turnUp = legalActions(life, 1).find((a) => a.kind === "turn-face-up");
  applyAction(life, 1, turnUp);
  eq([life.objects[turnUp.objectId].card, life.players[1].life], ["Secret Phyrexian", 38], "{B/P} with an empty pool: paid with 2 life (CR 107.4f), and it turns face up");
}
{
  /* Blocking with it, and a trampler's damage assigned past it: each choice says it is face down. */
  const {state: s} = run([at(0, "battlefield", "Island", "Wastes", "Rhino"), at(0, "hand", RS), at(1, "battlefield", "Bear", "Calf")], [...SHIFT, {attack: ["Rhino"]}], {library: [SECRET]});
  const rng = createRng("manifest");
  for (let n = 0; n < 20 && s.awaiting?.kind !== "declare-blockers"; n += 1) { if (s.awaiting) break; if (s.priorityPlayer === null) advance(s); else if (passPriority(s, null, rng).outcome === "step-ends") advance(s); }
  const blocks = awaitingChoice(s).options.map((o) => o.label);
  eq(blocks.sort(), ["A face-down permanent blocks Rhino", "Calf blocks Rhino"], "Maya's blockers: \"A face-down permanent blocks Rhino\", and her Calf");
  resolveAwaiting(s, awaitingChoice(s).options.map((o) => o.index));
  for (let n = 0; n < 20 && s.awaiting?.kind !== "assign-combat-damage"; n += 1) { if (s.awaiting) break; if (s.priorityPlayer === null) advance(s); else if (passPriority(s, null, rng).outcome === "step-ends") advance(s); }
  ok(awaitingChoice(s).options.some((o) => o.label === "A face-down permanent"), "and Rob's trampling Rhino, blocked by both, assigns its damage among them: \"A face-down permanent\" is one");
  /* Rob's own face-down creature, offered to attack Maya's planeswalker. */
  const {state: w} = run([at(0, "battlefield", "Island", "Wastes", "Bear"), at(0, "hand", RS), at(1, "battlefield", "Kasmina, Enigma Sage")],
    [{tap: "Island"}, {tap: "Wastes"}, {cast: RS, targets: [{card: "Bear", seat: 0}]}, {resolve: true}, {to: {turn: 3, phase: "MAIN1"}}], {library: [SECRET]});
  for (let n = 0; n < 20 && w.awaiting?.kind !== "declare-attackers"; n += 1) { if (w.awaiting) break; if (w.priorityPlayer === null) advance(w); else if (passPriority(w, null, rng).outcome === "step-ends") advance(w); }
  eq(awaitingChoice(w).options.map((o) => o.label).sort(), ["A face-down permanent → Kasmina, Enigma Sage (Maya)", "A face-down permanent → Maya"], "Rob's attackers: \"A face-down permanent\" at Maya, or at her Kasmina");
}

console.log(`engine-manifest: ${checks} checks passed -- a manifested card face down, a nameless 2/2 nobody but its controller may see; turned face up for its mana cost as a special action, or revealed as it leaves.`);
