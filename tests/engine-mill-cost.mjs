/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* "{T}, MILL A CARD: ADD {C}" (Millikin; AI 2's Kiora deck): a mill in a mana ability's cost.
 *
 * cards/index.mjs compiles the cost atom `mill` into the mana ability's `millCost`; rules/actions.mjs offers it only while
 * its controller's library holds the cards to mill (CR 118.3: a cost is paid only with what it takes) and mills them as the
 * cost is paid, before the mana is added, off the stack (CR 701.17, 605.3a). A cast that taps for itself never taps it: its
 * mill is more than {T}. The card scenarios play the card; this suite holds the compile, the empty library, the mill itself
 * and the cast that taps for itself.
 */
import assert from "node:assert/strict";
import {createState, addObject, cardsIn} from "../game/engine/state/index.mjs";
import {beginGame, advance} from "../game/engine/rules/turn.mjs";
import {legalActions, applyAction, tapUnits} from "../game/engine/rules/actions.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {compileScript} from "../game/engine/cards/index.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const cards = loadCardIndex();
const card = (name) => ({...cards.definition(name), card: name});
const WASTES = {card: "Wastes", types: ["Land"], supertypes: ["Basic"], abilities: [{id: "a0", kind: "mana", tapSelf: true, produces: {C: 1}}]};
const GIFT = {card: "Gift", types: ["Instant"], manaCost: "{1}", spell: {id: "s", text: "You gain 1 life.", targets: [], effects: [{effect: "gainLife", amount: 1}]}};
function table(library = 12) {
  const s = createState({matchId: "m", seed: "mill-cost", players: [{name: "Rob"}, {name: "Maya"}]});
  for (let seat = 0; seat < 2; seat += 1) for (let i = 0; i < 12; i += 1) addObject(s, {...WASTES, owner: seat, controller: seat}, "library", seat);
  beginGame(s);
  for (let n = 0; n < 50 && !(s.phase === "MAIN1" && s.priorityPlayer === 0); n += 1) advance(s);
  /* As many cards in Rob's library as the check wants. */
  while (cardsIn(s, "library", 0).length > library) { const id = cardsIn(s, "library", 0)[0]; s.zones.library[0].splice(0, 1); delete s.objects[id]; }
  return s;
}
/* Put there before this turn began, so a creature's {T} is not summoning sick (CR 302.6). */
const put = (s, o, seat, zone) => { const id = addObject(s, {...o, owner: seat, controller: seat}, zone, zone === "battlefield" ? null : seat); s.objects[id].controlledSinceTurn = -1; return id; };
const script = (cost) => ({schema: "CrankCardScript@1", identity: {name: "Mill Thing", oracleId: "m", types: ["Artifact"], subtypes: [], manaCost: "{2}", colors: [], colorIdentity: []},
  oracleText: "x", source: "hand", abilities: [{kind: "activated", text: "x", cost, effects: [{effect: "addMana", mana: {C: 1}}]}]});

/* ---- the compile ---- */
{
  const millikin = cards.definition("Millikin").abilities[0];
  eq([millikin.kind, millikin.tapSelf, millikin.millCost, millikin.produces], ["mana", true, 1, {C: 1}], "Millikin: a mana ability, {T} and a card milled, for {C}");
  eq(compileScript(script([{atom: "{T}"}, {atom: "mill", count: 2}])).definition.abilities[0].millCost, 2, "mill two: two");
  ok(compileScript(script([{atom: "{T}"}, {atom: "mill", count: 0}])).problems.some((p) => p.includes("mana ability the engine cannot run")), "mill none is no cost it pays");
}

/* ---- offered while there is a card to mill, and the mill itself ---- */
{
  const s = table(1);
  const m = put(s, card("Millikin"), 0, "battlefield");
  const offers = legalActions(s, 0).filter((a) => a.kind === "activate-mana" && a.objectId === m);
  eq(offers.length, 1, "one card in the library: offered");
  const top = cardsIn(s, "library", 0)[0];
  const events = applyAction(s, 0, offers[0]);
  eq([s.players[0].manaPool.C, cardsIn(s, "library", 0).length, cardsIn(s, "graveyard", 0).map((id) => s.objects[id].card)], [1, 0, ["Wastes"]], "{C} added, the top card milled");
  ok(events.some((e) => e.kind === "GameEventCardChangeZone" && e.data.fields.card?.cardId === top && e.data.fields.from?.zoneType === "Library" && e.data.fields.to?.zoneType === "Graveyard"),
    "milled from the library to the graveyard, as any mill is");
  ok(events.findIndex((e) => e.kind === "GameEventCardChangeZone") < events.findIndex((e) => e.kind === "GameEventManaPool"), "the cost before the mana");
  eq(s.stack.length, 0, "and off the stack (CR 605.3a)");
  s.objects[m].tapped = false;
  eq(legalActions(s, 0).filter((a) => a.kind === "activate-mana" && a.objectId === m).length, 0, "untapped again with an empty library: nothing to mill, not offered (CR 118.3)");
}
{
  const s = table(0);
  const m = put(s, card("Millikin"), 0, "battlefield");
  eq(legalActions(s, 0).filter((a) => a.kind === "activate-mana" && a.objectId === m).length, 0, "an empty library: not offered");
  ok(!tapUnits(s, 0).some((u) => u.id === m), "and never a source a cast taps for itself");
}
{
  /* A cast that taps for itself would have to mill: Millikin is never one of its sources. */
  const s = table();
  const m = put(s, card("Millikin"), 0, "battlefield");
  put(s, GIFT, 0, "hand");
  ok(!tapUnits(s, 0).some((u) => u.id === m), "not a source a cast taps: its cost is more than {T}");
  eq(legalActions(s, 0).filter((a) => a.kind === "cast" && a.label === "Gift").length, 0, "so Gift is not offered from an empty pool");
}

console.log(`engine-mill-cost: ${checks} checks passed -- a mana ability that mills as its cost, offered only with the cards to mill, never tapped by a cast for itself.`);
