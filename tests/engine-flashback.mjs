/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* M4 PHASE 3, BATCH 31 (THE CATALOG'S ORDER): FLASHBACK (CR 702.34a).
 *
 * "You may cast this card from your graveyard by paying [cost] rather than its mana cost." The cast is offered from its
 * owner's graveyard only, at the speed of its type, for the flashback cost -- mana, and life a player can pay only when
 * their total is at least that much (CR 119.4). Cast that way, the spell is exiled instead of going anywhere else
 * whenever it would leave the stack: resolved, countered, returned to a hand. Cast from a hand, it is not. Past in
 * Flames gives flashback, until end of turn, to the instants and sorceries in its controller's graveyard as it resolves
 * (CR 611.2c), for their mana costs -- not to a card put there later.
 *
 * A flashback cost need not be mana (the plan's X5, D5: Battle Screech, "Flashback--Tap three untapped white creatures
 * you control"). Offered only while that many untapped creatures fit; which ones, asked once the cast is taken and
 * before anything is paid (CR 601.2h), as escape's other cards are; a summoning-sick creature may be tapped, since it is
 * not its own {T} (CR 302.6).
 */
import assert from "node:assert/strict";
import {createState, addObject} from "../game/engine/state/index.mjs";
import {beginGame, advance, awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {legalActions, applyAction, flashbackCost, nothingToDo} from "../game/engine/rules/actions.mjs";
import {compileScript} from "../game/engine/cards/index.mjs";
import {housePilot} from "../game/engine/pilots/house-pilot.mjs";
import {projectFor} from "../game/engine/projection.mjs";
import {summoningSick} from "../game/engine/keywords/timing.mjs";
import {resolveTop} from "../game/engine/rules/stack.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";
import {beginResolution} from "../game/engine/script/resolution.mjs";
import {missingFor} from "../game/tools/engine-constructs.mjs";
import {offerDetails} from "../game/room/room.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";

let checks = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };
const ok = (c, m) => { assert.ok(c, m); checks += 1; };

const cards = loadCardIndex();
const card = (name) => ({...cards.definition(name), card: name});
const WASTES = {card: "Wastes", types: ["Land"], supertypes: ["Basic"], abilities: [{id: "a0", kind: "mana", tapSelf: true, produces: {C: 1}}]};
const BOLT = {card: "Bolt", types: ["Instant"], manaCost: "{R}", colors: ["R"],
  spell: {id: "s", text: "Bolt deals 3 damage to any target.", targets: [{anyOf: [{what: "permanent", types: ["Creature"]}, {what: "player"}]}], effects: [{effect: "dealDamage", amount: 3, targets: {target: 0}, who: {target: 0}}]}};
const pod = {matchId: "m", seed: "flashback", players: [{name: "Rob"}, {name: "Maya"}]};
function table() {
  const s = createState(pod);
  for (let seat = 0; seat < 2; seat += 1) for (let i = 0; i < 12; i += 1) addObject(s, {...WASTES, owner: seat, controller: seat}, "library", seat);
  return s;
}
function main(s) { beginGame(s); for (let n = 0; n < 50 && !(s.phase === "MAIN1" && s.priorityPlayer === 0); n += 1) advance(s); return s; }
const put = (s, o, seat, zone) => addObject(s, {...o, owner: seat, controller: seat}, zone, zone === "battlefield" ? null : seat);
const pool = (s, seat, mana) => Object.assign(s.players[seat].manaPool, mana);
const casts = (s, seat, name) => legalActions(s, seat).filter((a) => a.kind === "cast" && a.label === name);
const zoneNames = (s, zone, seat) => (zone === "exile" ? s.zones.exile : s.zones[zone][seat]).map((id) => s.objects[id].card);

{
  /* Offered from its owner's graveyard, for the flashback cost, at the speed of its type. */
  const s = main(table());
  const mine = put(s, card("Faithless Looting"), 0, "graveyard");
  const hers = put(s, card("Faithless Looting"), 1, "graveyard");
  eq([flashbackCost(s, 0, mine), flashbackCost(s, 0, hers), flashbackCost(s, 1, hers)], [{mana: "{2}{R}", life: 0}, null, {mana: "{2}{R}", life: 0}],
    "its flashback cost is {2}{R} for its owner; Rob cannot flash back Maya's card");
  put(s, BOLT, 0, "graveyard");
  pool(s, 0, {R: 1});
  eq(casts(s, 0, "Faithless Looting").length, 0, "with {R}: its mana cost, not the flashback cost -- not offered");
  pool(s, 0, {C: 2});
  const offers = casts(s, 0, "Faithless Looting");
  eq(offers.map((a) => [a.from, a.flashback, s.objects[a.objectId].owner]), [["graveyard", true, 0]], "with {2}{R}: offered once, from Rob's own graveyard -- not from Maya's -- with flashback");
  eq(casts(s, 0, "Bolt").length, 0, "a card without flashback in the graveyard: not offered");
  eq(offerDetails(s, 0, offers), ["flashback"], "the table says how it is cast");
  put(s, card("Faithless Looting"), 0, "hand");
  applyAction(s, 0, casts(s, 0, "Faithless Looting").find((a) => a.from === "hand"));
  eq(casts(s, 0, "Faithless Looting").length, 0, "a sorcery: not offered while a spell is on the stack");
}
{
  /* Its cost, life and all (CR 119.4); and exiled as it resolves. Cast from a hand, it goes to the graveyard. */
  const s = main(table());
  const analysis = put(s, card("Deep Analysis"), 0, "graveyard");
  pool(s, 0, {U: 1, C: 1});
  s.players[0].life = 2;
  eq(casts(s, 0, "Deep Analysis").length, 0, "at 2 life Rob cannot pay 3: not offered");
  s.players[0].life = 3;
  const offer = casts(s, 0, "Deep Analysis").find((a) => a.targets?.[0]?.id === 0);
  eq(Boolean(offer?.flashback), true, "at exactly 3 he can: offered");
  /* Cast at 4, so paying leaves him in the game: at 0 he would lose, and his spell would leave the game with him (CR 800.4a). */
  s.players[0].life = 4;
  applyAction(s, 0, offer);
  eq([s.players[0].life, s.players[0].manaPool.U, s.players[0].manaPool.C, s.stack.at(-1).flashback], [1, 0, 0, true], "cast: {1}{U} and 3 life paid -- not its {3}{U} -- and the spell remembers how it was cast");
  resolveTop(s);
  eq([zoneNames(s, "exile"), zoneNames(s, "graveyard", 0), s.objects[analysis]], [["Deep Analysis"], [], undefined], "it resolves and is exiled, not put into the graveyard");
  const fromHand = main(table());
  put(fromHand, card("Deep Analysis"), 0, "hand");
  pool(fromHand, 0, {U: 1, C: 3});
  applyAction(fromHand, 0, casts(fromHand, 0, "Deep Analysis").find((a) => a.from === "hand"));
  eq(fromHand.stack.at(-1).flashback, undefined, "cast from the hand, nothing is remembered");
  resolveTop(fromHand);
  eq([zoneNames(fromHand, "graveyard", 0), zoneNames(fromHand, "exile")], [["Deep Analysis"], []], "and it goes to the graveyard, ready to be flashed back");
}
{
  /* Exiled whenever it would leave the stack: countered, or returned to a hand. And no flashback cast without the flag. */
  const s = main(table());
  put(s, card("Faithless Looting"), 0, "graveyard");
  pool(s, 0, {R: 1, C: 2});
  const offer = casts(s, 0, "Faithless Looting")[0];
  assert.throws(() => applyAction(s, 0, {...offer, flashback: undefined}), /not a legal action/, "the same card from the graveyard without flashback is not an action anyone was offered");
  checks += 1;
  applyAction(s, 0, offer);
  beginResolution(s, [{effect: "counterSpell", spells: [s.stack.at(-1).objectId]}], {controller: 1, source: null});
  eq([zoneNames(s, "exile"), zoneNames(s, "graveyard", 0), s.stack.length], [["Faithless Looting"], [], 0], "countered: exiled");
  const t = main(table());
  put(t, card("Faithless Looting"), 0, "graveyard");
  pool(t, 0, {R: 1, C: 2});
  applyAction(t, 0, casts(t, 0, "Faithless Looting")[0]);
  beginResolution(t, [{effect: "moveZone", targets: [t.stack.at(-1).objectId], to: "hand"}], {controller: 1, source: null});
  eq([zoneNames(t, "exile"), zoneNames(t, "hand", 0), t.stack.length], [["Faithless Looting"], [], 0], "returned to its owner's hand by an effect: exiled instead");
}
{
  /* Past in Flames: the instants and sorceries in Rob's graveyard as it resolves, for their mana costs, this turn only. */
  const s = main(table());
  const bolt = put(s, BOLT, 0, "graveyard");
  const theirs = put(s, BOLT, 1, "graveyard");
  put(s, card("Past in Flames"), 0, "hand");
  pool(s, 0, {R: 1, C: 3});
  applyAction(s, 0, casts(s, 0, "Past in Flames")[0]);
  resolveTop(s);
  pool(s, 0, {R: 1});
  const offers = casts(s, 0, "Bolt");
  eq([new Set(offers.map((a) => a.objectId)).size, offers.every((a) => a.flashback && a.objectId === bolt)], [1, true], "Rob's Bolt has flashback for {R}; Maya's Bolt, in her graveyard, does not");
  const late = put(s, BOLT, 0, "graveyard");
  eq(casts(s, 0, "Bolt").some((a) => a.objectId === late), false, "a Bolt put into the graveyard after it resolved: no flashback (CR 611.2c)");
  eq(casts(s, 0, "Past in Flames").map((a) => a.flashback), [], "Past in Flames itself, in the graveyard, costs {4}{R}: with {R} it is not offered");
  for (let n = 0; n < 400 && !(s.turn === 2 && s.phase === "MAIN1"); n += 1) {
    if (s.awaiting) { resolveAwaiting(s, s.awaiting.kind === "order-triggers" ? awaitingChoice(s).options.map((o) => o.index) : awaitingChoice(s).options.slice(0, awaitingChoice(s).min ?? 0).map((o) => o.index)); continue; }
    if (s.priorityPlayer === null) advance(s); else if (passPriority(s).outcome === "step-ends") advance(s);
  }
  eq((s.effects ?? []).some((e) => e.rule === "flashback"), false, "and at the end of the turn it is gone");
  void theirs;
}
{
  /* "Flashback--Tap three untapped white creatures you control" (Battle Screech): offered only while three untapped white
     creatures are Rob's; which three, asked once it is taken, before anything is paid. */
  const LION = {card: "Lion", types: ["Creature"], subtypes: ["Cat"], colors: ["W"], manaCost: "{W}", power: 2, toughness: 1};
  const KNIGHT = {card: "Knight", types: ["Creature"], subtypes: ["Knight"], colors: ["W"], manaCost: "{2}{W}", power: 3, toughness: 3};
  const BEAR = {card: "Bear", types: ["Creature"], subtypes: ["Bear"], colors: ["G"], manaCost: "{1}{G}", power: 2, toughness: 2};
  const s = main(table());
  const screech = put(s, card("Battle Screech"), 0, "graveyard");
  eq(flashbackCost(s, 0, screech), {mana: "", life: 0, tap: {count: 3, selector: {types: ["Creature"], colors: ["W"]}}}, "its flashback cost is no mana: three white creatures to tap");
  const lions = [put(s, LION, 0, "battlefield"), put(s, LION, 0, "battlefield")];
  const bear = put(s, BEAR, 0, "battlefield");
  put(s, LION, 1, "battlefield");
  eq([casts(s, 0, "Battle Screech").length, nothingToDo(s, 0)], [0, true], "two white creatures, a green Bear and Maya's Lion: not offered, and nothing to do");
  lions.push(put(s, LION, 0, "battlefield"));
  s.objects[lions[2]].tapped = true;
  eq(casts(s, 0, "Battle Screech").length, 0, "a third Lion, tapped: still not");
  s.objects[lions[2]].tapped = false;
  const offers = casts(s, 0, "Battle Screech");
  eq([offers.length, offers[0]?.flashback, nothingToDo(s, 0), lions.every((id) => summoningSick(s, id))], [1, true, false, true], "three untapped, summoning sick (CR 302.6): offered once, with flashback");
  eq(offerDetails(s, 0, offers), ["flashback, tapping three untapped white creatures you control"], "the table says what it taps");
  applyAction(s, 0, offers[0]);
  const q = awaitingChoice(s);
  eq([q.id, q.title, q.min, q.max, q.options.map((o) => o.label)], [`choose-cost:${screech}`, "Battle Screech's flashback: tap three untapped white creatures you control", 3, 3, ["Lion (1)", "Lion (2)", "Lion (3)"]],
    "which three: Rob's untapped Lions, not the Bear or Maya's");
  eq([s.stack.length, lions.map((id) => s.objects[id].tapped), s.objects[screech].zone], [0, [false, false, false], "graveyard"], "nothing cast or tapped before the answer");
  assert.throws(() => resolveAwaiting(s, [0, 1]), /Invalid selection/);
  checks += 1;
  /* Taken with its creatures named (a pilot across the network): they are checked -- the Bear is not white. */
  const forged = structuredClone(s);
  forged.awaiting = null;
  forged.priorityPlayer = 0;
  assert.throws(() => applyAction(forged, 0, {...offers[0], flashbackTap: [lions[0], lions[1], bear]}), /three untapped white creatures you control/);
  checks += 1;
  resolveAwaiting(s, [0, 1, 2]);
  eq([s.stack.length, s.stack[0]?.flashback, lions.map((id) => s.objects[id].tapped), s.objects[bear].tapped], [1, true, [true, true, true], false], "cast: the three Lions tapped, the Bear not");
  resolveTop(s);
  eq([zoneNames(s, "exile"), s.zones.battlefield.filter((id) => s.objects[id].card === "Bird").length], [["Battle Screech"], 2], "two Birds, and it is exiled");

  /* The house pilot taps the weakest: three Lions, not the Knight. */
  const p = main(table());
  put(p, card("Battle Screech"), 0, "graveyard");
  const knight = put(p, KNIGHT, 0, "battlefield");
  for (let i = 0; i < 3; i += 1) put(p, LION, 0, "battlefield");
  applyAction(p, 0, casts(p, 0, "Battle Screech")[0]);
  const pq = awaitingChoice(p);
  const answer = housePilot({seat: 0, cards: (name) => cards.definition(name)}).answer(projectFor(p, 0), pq);
  eq(answer.indices.map((i) => pq.options[i].label).sort(), ["Lion (1)", "Lion (2)", "Lion (3)"], "the house pilot keeps its Knight untapped");
  resolveAwaiting(p, answer.indices);
  eq(p.objects[knight].tapped, false, "and the Knight is untapped");

  /* A cost the engine would get wrong is refused. */
  const script = (cost) => ({schema: "CrankCardScript@1", identity: {name: "Test", oracleId: "00000000-0000-4000-8000-000000000000", types: ["Sorcery"], manaCost: "{W}"},
    oracleText: "Draw a card.", source: "hand", abilities: [{kind: "spell", text: "Draw a card.", effects: [{effect: "draw", count: 1}]}, {kind: "keyword", text: "Flashback", keyword: "flashback", cost}]});
  const TAP = {atom: "tapCreature", count: 2, selector: {types: ["Creature"]}};
  eq(compileScript(script([TAP])).problems, [], "tapping two creatures is a flashback cost");
  ok(compileScript(script([{atom: "tapCreature", selector: {types: ["Creature"]}}])).problems.length > 0, "without how many: refused");
  ok(compileScript(script([TAP, TAP])).problems.length > 0, "twice: refused");
}
{
  /* The catalog: Flashback is built now. */
  eq(missingFor({keywords: ["Flashback"]}), [], "a card with Flashback misses nothing for it");
}

console.log(`engine-flashback: ${checks} checks passed — cast from its owner's graveyard for the flashback cost, at its type's speed, life only if it can be paid; exiled as it leaves the stack, not when cast from a hand; Past in Flames gives it for a turn to what is there as it resolves; a cost that taps creatures, which ones asked before anything is paid.`);
