/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* M4 PHASE 3, BATCH 45 (THE CATALOG'S ORDER): PLAYING FROM ANOTHER ZONE (Forge's MayPlay), IN THE FORMS ITS CARDS NEED.
 *
 * "Once during each of your turns, you may cast an instant or sorcery spell from your graveyard" (Kess): a permission
 * open only on its holder's turns, spent on its source when a card is played through it -- each source its own -- and a
 * permission with no limit used first, so a limited one is spent only when it must be. "If a spell cast this way would be
 * put into your graveyard, exile it instead": resolved or countered, exiled; returned to a hand, not (unlike flashback).
 * And "you may pay {1}. If you do, ...": the payment's other side.
 */
import assert from "node:assert/strict";
import {createState, addObject, usesThisTurn} from "../game/engine/state/index.mjs";
import {beginGame, advance, awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {legalActions, applyAction} from "../game/engine/rules/actions.mjs";
import {resolveTop} from "../game/engine/rules/stack.mjs";
import {beginResolution} from "../game/engine/script/resolution.mjs";
import {missingFor} from "../game/tools/engine-constructs.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";

let checks = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const cards = loadCardIndex();
const card = (name) => ({...cards.definition(name), card: name});
const WASTES = {card: "Wastes", types: ["Land"], supertypes: ["Basic"], abilities: [{id: "a0", kind: "mana", tapSelf: true, produces: {C: 1}}]};
const GIFT = {card: "Gift", types: ["Instant"], manaCost: "{C}", spell: {id: "s", text: "You gain 1 life.", targets: [], effects: [{effect: "gainLife", amount: 1}]}};
function table() {
  const s = createState({matchId: "m", seed: "play-from", players: [{name: "Rob"}, {name: "Maya"}]});
  for (let seat = 0; seat < 2; seat += 1) for (let i = 0; i < 12; i += 1) addObject(s, {...WASTES, owner: seat, controller: seat}, "library", seat);
  return s;
}
function main(s) { beginGame(s); for (let n = 0; n < 50 && !(s.phase === "MAIN1" && s.priorityPlayer === 0); n += 1) advance(s); return s; }
const put = (s, o, seat, zone) => addObject(s, {...o, owner: seat, controller: seat}, zone, zone === "battlefield" ? null : seat);
const pool = (s, seat, mana) => Object.assign(s.players[seat].manaPool, mana);
const casts = (s, seat, name) => legalActions(s, seat).filter((a) => a.kind === "cast" && a.label === name);
const zoneNames = (s, zone, seat) => (zone === "exile" ? s.zones.exile : s.zones[zone][seat]).map((id) => s.objects[id].card);
const keyOf = (s, id) => `play-from:${s.objects[id].abilities.find((a) => a.rule === "play-from").id}`;

{
  /* Once during each of his turns: one Gift from the graveyard, then no more -- until a second Kess gives one more. */
  const s = main(table());
  const kess = put(s, card("Kess, Dissident Mage"), 0, "battlefield");
  put(s, GIFT, 0, "graveyard"); put(s, GIFT, 0, "graveyard");
  pool(s, 0, {C: 3});
  eq(casts(s, 0, "Gift").length, 2, "both Gifts in his graveyard are offered");
  applyAction(s, 0, casts(s, 0, "Gift")[0]);
  eq([usesThisTurn(s, kess, keyOf(s, kess)), s.stack.at(-1).graveyardToExile], [1, true], "cast through Kess: its use spent, and the spell remembers how it was cast");
  resolveTop(s);
  eq(casts(s, 0, "Gift").length, 0, "the other Gift: not offered again this turn");
  put(s, card("Kess, Dissident Mage"), 0, "battlefield");
  eq(casts(s, 0, "Gift").length, 1, "a second Kess: one more");
  /* Not on Maya's turn, though Rob holds priority there. */
  const t = main(table());
  put(t, card("Kess, Dissident Mage"), 0, "battlefield");
  put(t, GIFT, 0, "graveyard");
  pool(t, 0, {C: 1});
  t.activePlayer = 1; t.priorityPlayer = 0;
  eq(casts(t, 0, "Gift").length, 0, "Maya's turn, Rob holding priority: not offered");
  t.activePlayer = 0;
  eq(casts(t, 0, "Gift").length, 1, "his own turn: offered");
}
{
  /* Exiled if it would go to a graveyard: resolved, or countered. Returned to a hand, it goes there -- unlike flashback. */
  const cast = () => {
    const s = main(table());
    put(s, card("Kess, Dissident Mage"), 0, "battlefield");
    put(s, GIFT, 0, "graveyard");
    pool(s, 0, {C: 1});
    applyAction(s, 0, casts(s, 0, "Gift")[0]);
    return s;
  };
  const resolved = cast();
  resolveTop(resolved);
  eq([zoneNames(resolved, "exile"), zoneNames(resolved, "graveyard", 0), resolved.players[0].life], [["Gift"], [], 41], "it resolves: Rob gains 1, and it is exiled");
  const countered = cast();
  beginResolution(countered, [{effect: "counterSpell", spells: [countered.stack.at(-1).objectId]}], {controller: 1, source: null});
  eq([zoneNames(countered, "exile"), zoneNames(countered, "graveyard", 0)], [["Gift"], []], "countered: exiled");
  const bounced = cast();
  beginResolution(bounced, [{effect: "moveZone", targets: [bounced.stack.at(-1).objectId], to: "hand"}], {controller: 1, source: null});
  eq([zoneNames(bounced, "exile"), zoneNames(bounced, "hand", 0)], [[], ["Gift"]], "returned to his hand: in his hand");
  const discarded = cast();
  beginResolution(discarded, [{effect: "moveZone", targets: [discarded.stack.at(-1).objectId], to: "graveyard"}], {controller: 1, source: null});
  eq([zoneNames(discarded, "exile"), zoneNames(discarded, "graveyard", 0)], [["Gift"], []], "put into his graveyard by an effect: exiled");
  const fromHand = main(table());
  put(fromHand, card("Kess, Dissident Mage"), 0, "battlefield");
  put(fromHand, GIFT, 0, "hand");
  pool(fromHand, 0, {C: 1});
  applyAction(fromHand, 0, casts(fromHand, 0, "Gift")[0]);
  resolveTop(fromHand);
  eq(zoneNames(fromHand, "graveyard", 0), ["Gift"], "cast from his hand: to the graveyard, and Kess's use unspent");
}
{
  /* A permission with no limit first: Kess's use is spent only when nothing else lets him. */
  const s = main(table());
  const kess = put(s, card("Kess, Dissident Mage"), 0, "battlefield");
  put(s, {card: "Conduit", types: ["Artifact"], abilities: [{id: "p", kind: "static", text: "You may cast spells from your graveyard.", rule: "play-from", affects: {what: "player", who: "you"}, zone: "graveyard", spells: true}]}, 0, "battlefield");
  put(s, GIFT, 0, "graveyard");
  pool(s, 0, {C: 1});
  applyAction(s, 0, casts(s, 0, "Gift")[0]);
  eq([usesThisTurn(s, kess, keyOf(s, kess)), s.stack.at(-1).graveyardToExile], [0, undefined], "cast through the unlimited permission: Kess unspent, and nothing to exile");
  /* A land permission with a limit is spent the same way. */
  const t = main(table());
  const once = put(t, {card: "Terrace", types: ["Artifact"], abilities: [{id: "q", kind: "static", text: "Once during each of your turns, you may play a land from your graveyard.", rule: "play-from", affects: {what: "player", who: "you"}, zone: "graveyard", lands: true, yourTurn: true, limit: 1}]}, 0, "battlefield");
  put(t, WASTES, 0, "graveyard"); put(t, WASTES, 0, "graveyard");
  t.players[0].landAllowance = 3;
  const lands = () => legalActions(t, 0).filter((a) => a.kind === "play-land" && a.from === "graveyard");
  eq(lands().length, 2, "two lands in his graveyard, three land drops: both offered");
  applyAction(t, 0, lands()[0]);
  eq([usesThisTurn(t, once, keyOf(t, once)), lands().length], [1, 0], "one played: the permission spent, the other not offered");
}
{
  /* "You may pay {1}. If you do": paid, the effects; not paid, nothing. Plain "unless" is as it was. */
  const ask = (params, answer, mana) => {
    const s = main(table());
    pool(s, 0, mana);
    beginResolution(s, [{effect: "unlessPays", who: "you", amount: 1, ...params, effects: [{effect: "gainLife", amount: 3}]}], {controller: 0, source: null});
    const options = awaitingChoice(s).options;
    resolveAwaiting(s, [options.find((o) => o.label === answer).index]);
    return [s.players[0].life, s.players[0].manaPool.C];
  };
  eq(ask({ifPaid: true}, "Pay {1}", {C: 1}), [43, 0], "\"if you do\": paid, he gains 3");
  eq(ask({ifPaid: true}, "Don't pay", {C: 1}), [40, 1], "not paid: nothing");
  eq(ask({}, "Don't pay", {C: 1}), [43, 1], "plain \"unless\": not paid, the effects");
  eq(ask({}, "Pay {1}", {C: 1}), [40, 0], "... paid, nothing");
}
{
  eq(missingFor({options: ["MayPlay"]}), [{kind: "option", name: "MayPlay", why: "not built"}],
    "MayPlay stays unbuilt in the catalog: a free cast, life for mana and a permanent type at a time are not built");
}

console.log(`engine-play-from: ${checks} checks passed — once during each of your turns, per source, an unlimited permission first; exiled if it would go to a graveyard; "you may pay ... if you do".`);
