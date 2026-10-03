/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* M4 PHASE 3, BATCH 27 (THE CATALOG'S ORDER): "WHENEVER YOU DISCARD A CARD" (CR 701.9).
 *
 * To discard is to put a card from a hand into a graveyard: an effect's ("target player discards a card"), and a cost's --
 * cycling, "discard a card:". A discard trigger says whose discard it watches for -- yours, an opponent's -- and what kind
 * of card, and is about the card in the graveyard and the player who discarded it ("that player loses 2 life"). "Discard
 * a card" as an activated ability's cost is chosen as it is activated, one offer for each card that could be discarded.
 */
import assert from "node:assert/strict";
import {createState, addObject} from "../game/engine/state/index.mjs";
import {beginGame, advance} from "../game/engine/rules/turn.mjs";
import {legalActions, applyAction} from "../game/engine/rules/actions.mjs";
import {collectTriggers} from "../game/engine/rules/trigger.mjs";
import {beginResolution} from "../game/engine/script/resolution.mjs";
import {resolveAwaiting, awaitingChoice} from "../game/engine/rules/turn.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";

let checks = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const cards = loadCardIndex();
const card = (name) => ({...cards.definition(name), card: name});
const WASTES = {card: "Wastes", types: ["Land"], supertypes: ["Basic"], abilities: [{id: "a0", kind: "mana", tapSelf: true, produces: {C: 1}}]};
const pod = {matchId: "m", seed: "discard", players: [{name: "Rob"}, {name: "Maya"}]};
function table() {
  const s = createState(pod);
  for (let seat = 0; seat < 2; seat += 1) for (let i = 0; i < 12; i += 1) addObject(s, {...WASTES, owner: seat, controller: seat}, "library", seat);
  return s;
}
const on = (s, o, seat, zone = "battlefield") => addObject(s, {...o, owner: seat, controller: seat}, zone, ["battlefield", "exile"].includes(zone) ? null : seat);
function main(s) { beginGame(s); for (let n = 0; n < 50 && !(s.phase === "MAIN1" && s.priorityPlayer === 0); n += 1) advance(s); return s; }
const BEAR = {card: "Bear", types: ["Creature"], manaCost: "{1}", power: 2, toughness: 2};
const ISLAND = {card: "Island", types: ["Land"], supertypes: ["Basic"], subtypes: ["Island"]};
const OPT = {card: "Opt", types: ["Instant"], manaCost: "{U}"};
/* `seat` discards the card named `name` from their hand, by an effect; what triggers. */
function discards(s, seat, name) {
  s.pendingTriggers = [];
  const out = beginResolution(s, [{effect: "discard", count: 1}], {controller: seat, source: null});
  const index = awaitingChoice(s).options.find((o) => o.label === name).index;
  const answered = resolveAwaiting(s, [index]);
  /* The answer's events come back inside the resolution's too: each event once. */
  collectTriggers(s, [...new Set([...(out.events ?? []), ...(Array.isArray(answered) ? answered : answered?.events ?? [])])]);
  return s.pendingTriggers;
}
const named = (s, name, zone) => Object.keys(s.objects).map(Number).filter((id) => s.objects[id].card === name && s.objects[id].zone === zone);

{
  const s = table();
  on(s, card("Liliana's Caress"), 0); on(s, card("Bone Miser"), 0);
  on(s, BEAR, 1, "hand"); on(s, BEAR, 0, "hand");
  main(s);
  const theirs = discards(s, 1, "Bear");
  eq(theirs.map((t) => [s.objects[t.source.cardId].card, t.about]), [["Liliana's Caress", {card: named(s, "Bear", "graveyard").find((id) => s.objects[id].owner === 1), player: 1}]],
    "Maya discards a Bear: Liliana's Caress (an opponent's discard) triggers, about the card in her graveyard and Maya; Bone Miser (Rob's own) does not");
  const mine = discards(s, 0, "Bear");
  eq(mine.map((t) => s.objects[t.source.cardId].card), ["Bone Miser"], "Rob discards a creature card: Bone Miser's creature trigger, and Liliana's Caress is quiet");
}
{
  const s = table();
  on(s, card("Bone Miser"), 0);
  on(s, ISLAND, 0, "hand"); on(s, OPT, 0, "hand");
  main(s);
  eq(discards(s, 0, "Island").map((t) => t.abilityId), ["a1"], "a land card: the land trigger, {B}{B}");
  eq(discards(s, 0, "Opt").map((t) => t.abilityId), ["a2"], "a noncreature, nonland card: the draw");
}
{
  /* A discard as a cost is a discard: cycling. */
  const s = table();
  on(s, card("Archfiend of Ifnir"), 0);
  on(s, card("Archfiend of Ifnir"), 0, "hand");
  on(s, WASTES, 0); on(s, WASTES, 0);
  main(s);
  for (const a of legalActions(s, 0).filter((x) => x.kind === "activate-mana")) applyAction(s, 0, a);
  s.pendingTriggers = [];
  const events = applyAction(s, 0, legalActions(s, 0).find((a) => a.kind === "activate" && a.label === "Archfiend of Ifnir"));
  collectTriggers(s, events);
  eq((s.pendingTriggers ?? []).map((t) => s.objects[t.source.cardId]?.card), ["Archfiend of Ifnir"], "cycling the Archfiend in hand is a discard: the one on the battlefield triggers");
}
{
  /* "Discard a card" as a cost: one offer per card in hand; none, and it can't be activated. */
  const s = table();
  const buccaneer = on(s, card("Glint-Horn Buccaneer"), 0);
  on(s, {card: "Mountain", types: ["Land"], supertypes: ["Basic"], subtypes: ["Mountain"], abilities: [{id: "a0", kind: "mana", tapSelf: true, produces: {R: 1}}]}, 0); on(s, WASTES, 0);
  on(s, BEAR, 0, "hand"); on(s, OPT, 0, "hand");
  main(s);
  s.combat = {attacks: [{attacker: buccaneer, defender: 1, blockers: []}]};
  for (const a of legalActions(s, 0).filter((x) => x.kind === "activate-mana")) applyAction(s, 0, a);
  const offers = legalActions(s, 0).filter((a) => a.kind === "activate" && a.label === "Glint-Horn Buccaneer");
  eq(offers.map((a) => a.costNames[0]).sort(), ["Bear", "Opt"], "attacking, with two cards in hand: one offer to discard each");
  s.pendingTriggers = [];
  collectTriggers(s, applyAction(s, 0, offers.find((a) => a.costNames[0] === "Opt")));
  eq([named(s, "Opt", "graveyard").length, (s.pendingTriggers ?? []).map((t) => s.objects[t.source.cardId]?.card)], [1, ["Glint-Horn Buccaneer"]],
    "the Opt is discarded as the cost, and that discard triggers the Buccaneer's own \"whenever you discard a card\"");
}

console.log(`engine-discard: ${checks} checks passed — whose discard and what kind, about the card and the player; a discard as a cost (cycling, "discard a card:") is a discard; one offer per card that could be discarded.`);
