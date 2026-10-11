/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* TRAIN C, PHASE 2 (w2c-hands-triggers): "WHEN YOU DISCARD THIS CARD", AND "WHENEVER A PLAYER DISCARDS ONE OR MORE CARDS".
 *
 * Titanbones, Towering Heart: "when you discard this card, you gain 3 life" -- a trigger condition that can't trigger from
 * the battlefield, so it functions from the zone the card went to (CR 113.6k; rules/trigger.mjs), this card's own discard
 * and no other. Tinybones, Pocket Nuisance: "whenever a player discards one or more cards" -- `batch`, once for each player
 * who discarded in one action, however many they discarded (CR 603.2c). What the scenarios cannot reach: a discard at
 * cleanup (CR 514.1) and as a cost, a second Titanbones on the battlefield, what the batched trigger is about, two actions
 * apart, and what the compiler refuses.
 */
import assert from "node:assert/strict";
import {createState, addObject} from "../game/engine/state/index.mjs";
import {beginGame, advance, awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";
import {legalActions, applyAction} from "../game/engine/rules/actions.mjs";
import {beginResolution} from "../game/engine/script/resolution.mjs";
import {compileScript} from "../game/engine/cards/index.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";

let checks = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const cards = loadCardIndex();
const card = (name) => ({...cards.definition(name), card: name});
const TITAN = "Titanbones, Towering Heart", TINY = "Tinybones, Pocket Nuisance";
const WASTES = {card: "Wastes", types: ["Land"], supertypes: ["Basic"], abilities: [{id: "a0", kind: "mana", tapSelf: true, produces: {C: 1}}]};
const BEAR = {card: "Bear", types: ["Creature"], manaCost: "{1}", power: 2, toughness: 2};
/* "Discard a card: you gain 1 life." -- a discard as a cost. */
const ALTAR = {card: "Altar", types: ["Artifact"], manaCost: "{1}", abilities: [{id: "a0", kind: "activated", text: "Discard a card: You gain 1 life.", cost: [{atom: "discard"}], effects: [{effect: "gainLife", amount: 1}]}]};
function table(players = 2) {
  const s = createState({matchId: "m", seed: "discard-triggers", players: ["Rob", "Maya", "Trey"].slice(0, players).map((name) => ({name}))});
  for (let seat = 0; seat < players; seat += 1) for (let i = 0; i < 12; i += 1) addObject(s, {...WASTES, owner: seat, controller: seat}, "library", seat);
  return s;
}
const on = (s, o, seat, zone = "battlefield") => addObject(s, {...o, owner: seat, controller: seat}, zone, ["battlefield", "exile"].includes(zone) ? null : seat);
function main(s) { beginGame(s); for (let n = 0; n < 50 && !(s.phase === "MAIN1" && s.priorityPlayer === 0); n += 1) advance(s); return s; }
const named = (s, name, zone) => Object.keys(s.objects).map(Number).filter((id) => s.objects[id].card === name && s.objects[id].zone === zone);
/* What has triggered: waiting to go on the stack, or on it -- each as its source, controller, ability and subject. */
const fired = (s) => [...(s.pendingTriggers ?? []).map((t) => ({card: t.source.cardId, controller: t.controller, abilityId: t.abilityId, about: t.about})),
  ...s.stack.filter((e) => e.kind === "trigger").map((e) => ({card: e.cardId, controller: e.playerId, abilityId: e.abilityId, about: e.about}))];
const clear = (s) => { s.pendingTriggers = []; s.stack = s.stack.filter((e) => e.kind !== "trigger"); };
/* `seat` discards the cards named, by one effect, answered as the room answers it; what triggered. */
function discards(s, seat, names, who = null) {
  clear(s);
  beginResolution(s, [{effect: "discard", count: names.length, ...(who ? {who} : {})}], {controller: seat, source: null});
  const options = awaitingChoice(s).options, used = new Set();
  const indices = names.map((name) => { const o = options.find((x) => x.label === name && !used.has(x.index)); used.add(o.index); return o.index; });
  resolveAwaiting(s, indices);
  return fired(s);
}
/* On to Rob's cleanup, where he must discard to his hand size (CR 514.1). */
function toCleanup(s) {
  for (let n = 0; n < 200 && s.awaiting?.kind !== "discard-to-hand-size"; n += 1) {
    if (s.awaiting) throw new Error(`asked ${s.awaiting.kind}`);
    if (s.priorityPlayer === null) advance(s);
    else { const out = passPriority(s); if (out.outcome === "step-ends") advance(s); }
  }
  return s;
}

{
  /* Discarded to hand size at Rob's cleanup: Titanbones' own trigger, from his graveyard, about it and him. */
  const s = main(table());
  for (let i = 0; i < 7; i += 1) on(s, BEAR, 0, "hand");
  on(s, card(TITAN), 0, "hand");
  toCleanup(s);
  clear(s);
  const choice = awaitingChoice(s);
  resolveAwaiting(s, [choice.options.find((o) => o.label === TITAN).index]);
  const grave = named(s, TITAN, "graveyard")[0];
  eq(fired(s).map((t) => [t.card, t.controller]), [[grave, 0]], "discarded at cleanup: its trigger, from the card it became in his graveyard, his");
}
{
  /* Discarded as a cost ("Discard a card: you gain 1 life"): a discard -- 3 life, and the Altar's 1. */
  const s = table();
  on(s, ALTAR, 0); on(s, card(TITAN), 0, "hand");
  main(s);
  clear(s);
  applyAction(s, 0, legalActions(s, 0).find((a) => a.kind === "activate" && a.label === "Altar" && a.costNames?.[0] === TITAN));
  eq(fired(s).map((t) => t.card), named(s, TITAN, "graveyard"), "the cost's discard triggers it");
}
{
  /* A second Titanbones on Rob's battlefield: the discarded one's trigger alone ("this card"); and its 3 life is the
     battlefield one's "whenever you gain life". */
  const s = table();
  const standing = on(s, card(TITAN), 0); on(s, card(TITAN), 0, "hand"); on(s, BEAR, 0, "hand");
  main(s);
  const one = discards(s, 0, [TITAN]);
  eq(one.map((t) => t.card), named(s, TITAN, "graveyard"), "one trigger, the discarded card's -- not the one on the battlefield");
  const other = discards(s, 0, ["Bear"]);
  eq(other.length, 0, "a Bear discarded: neither");
  eq(s.objects[standing].zone, "battlefield", "the standing one stays");
  /* A card whose trigger watches every discard ("whenever you discard a card") does not see its own from the graveyard: only
     "this card" works from there. */
  const miser = on(s, {card: "Miser", types: ["Creature"], manaCost: "{1}", power: 1, toughness: 1, abilities: [{id: "m", kind: "triggered", text: "Whenever you discard a card, you gain 1 life.",
    trigger: {on: "GameEventCardChangeZone", to: "Graveyard", discarded: true, discarder: "you"}, effects: [{effect: "gainLife", amount: 1}]}]}, 0, "hand");
  eq([discards(s, 0, ["Miser"]).length, s.objects[miser] ? "hand" : "moved"], [0, "moved"], "a Miser discarded from the hand: no trigger of its own");
}
{
  /* Tinybones under Maya: Rob discards two at cleanup, one action -- one trigger, about both cards and him. */
  const s = table();
  on(s, card(TINY), 1);
  main(s);
  for (let i = 0; i < 9; i += 1) on(s, BEAR, 0, "hand");
  toCleanup(s);
  clear(s);
  eq(awaitingChoice(s).min, 2, "two to discard");
  resolveAwaiting(s, [0, 1]);
  const both = fired(s);
  eq([both.length, both[0]?.about?.player, (both[0]?.about?.cards ?? []).length, both[0]?.controller], [1, 0, 2, 1], "Maya's Tinybones: once, about Rob and both cards");
}
{
  /* Two discards apart are two actions: two triggers. Three players discarding at once: one each. */
  const s = table(3);
  on(s, card(TINY), 0); on(s, BEAR, 1, "hand"); on(s, BEAR, 1, "hand"); on(s, BEAR, 2, "hand");
  main(s);
  eq(discards(s, 1, ["Bear"], [1]).length, 1, "Maya discards one: one");
  eq(discards(s, 1, ["Bear"], [1]).length, 1, "then another, a second action: one more");
  on(s, BEAR, 1, "hand"); on(s, BEAR, 0, "hand");
  clear(s);
  beginResolution(s, [{effect: "discard", who: "each", count: 1}], {controller: 0, source: null});
  for (let n = 0; n < 3 && s.awaiting?.kind === "effect-choice"; n += 1) resolveAwaiting(s, [0]);
  eq(fired(s).map((t) => t.about.player).sort(), [0, 1, 2], "each player discards one at once: one for each of the three");
}
{
  /* What the compiler refuses: "whenever another card is discarded" is not a trigger it builds. */
  const script = (trigger) => ({schema: "CrankCardScript@1", identity: {name: "Odd", oracleId: "x", types: ["Creature"], subtypes: [], manaCost: "{1}", colors: [], colorIdentity: [], power: 1, toughness: 1},
    oracleText: "Odd.", abilities: [{kind: "triggered", text: "Odd.", trigger: {on: "discarded", ...trigger}, effects: [{effect: "gainLife", amount: 1}]}]});
  const problems = (trigger) => compileScript(script(trigger)).problems.filter((p) => p.startsWith("discarded"));
  eq([problems({who: "self"}).length, problems({}).length, problems({who: "another"}).length], [0, 0, 1], "this card's or anyone's, never another's");
}

console.log(`engine-discard-triggers: ${checks} checks passed -- "when you discard this card" from the zone it went to, its own discard alone, at cleanup and as a cost; "whenever a player discards one or more cards" once for each player each action.`);
