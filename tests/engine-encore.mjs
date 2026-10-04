/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* ENCORE (the plan's X5, D5 Shadrix Aristocrats: Angel of Indemnity; X5f).
 *
 * Encore (CR 702.141a) is an activated ability of a card in its owner's graveyard, at sorcery speed: pay the cost and exile
 * the card, and for each opponent a token copy of it with haste attacks that opponent this turn if able, sacrificed at the
 * beginning of the next end step. Three things the engine had no word for until now:
 *   - an activated ability of a card in its owner's graveyard, offered there (rules/actions.mjs), its cost exiling the card;
 *   - a token copy of that card, now in exile ("this card": the stack entry is about it);
 *   - a requirement to attack one player this turn "if able" (CR 508.1d): offered only that player while it can attack
 *     them without a cost to pay, and attacking them anyway if left out (rules/combat.mjs).
 * The card scenarios play the cards (Angel of Indemnity, Impulsive Pilferer). This suite holds the edges: who may and
 * when, the cost, one copy per opponent and what each is, the requirement and a cost that lifts it, the end step, the
 * schema and the catalog.
 */
import assert from "node:assert/strict";
import {awaitingChoice, resolveAwaiting, advance} from "../game/engine/rules/turn.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";
import {legalActions, applyAction} from "../game/engine/rules/actions.mjs";
import {resolveTop} from "../game/engine/rules/stack.mjs";
import {concede} from "../game/engine/rules/sba.mjs";
import {keywordsOf, characteristicsOf} from "../game/engine/rules/layers.mjs";
import {compileScript} from "../game/engine/cards/index.mjs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {missingFor} from "../game/tools/engine-constructs.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {offerDetails} from "../game/room/room.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const at = (seat, zone, ...cards) => ({seat, zone, cards});
const later = (seat, zone, ...cards) => ({seat, zone, cards, sick: true});
const play = (name, setup, steps, more = {}) => runScenario({name, setup, steps, ...more}, index.definition, {}).state;
const named = (s, card, zone) => Object.values(s.objects).filter((o) => o.card === card && o.zone === zone);
const encores = (s, seat) => legalActions(s, seat).filter((a) => a.kind === "activate" && a.label === "Angel of Indemnity");
const EIGHT = ["Plains", "Plains", "Wastes", "Wastes", "Wastes", "Wastes", "Wastes", "Wastes"];
const tapAll = (names) => names.map((n) => ({tap: n}));
/* From the beginning of combat to the declare-attackers question, everyone passing (the scenario runner would answer it). */
function toDeclaration(s) {
  for (let n = 0; n < 50 && s.awaiting?.kind !== "declare-attackers"; n += 1) {
    if (s.awaiting) throw new Error(`asked ${s.awaiting.kind} before the declaration`);
    if (s.priorityPlayer === null) advance(s);
    else if (passPriority(s).outcome === "step-ends") advance(s);
  }
  return awaitingChoice(s);
}

/* ---- who may, and when ---- */
{
  const s = play("offers", [at(0, "battlefield", ...EIGHT), at(0, "graveyard", "Angel of Indemnity"), at(1, "graveyard", "Angel of Indemnity")], tapAll(EIGHT));
  const offers = encores(s, 0);
  eq(offers.map((a) => [s.objects[a.objectId].zone, s.objects[a.objectId].owner, a.text]), [["graveyard", 0, "Encore {6}{W}{W}"]],
    "Rob's Angel in his graveyard, {6}{W}{W} in his pool, his main phase: one offer, from the graveyard; Maya's Angel is hers");
  eq(offerDetails(s, 0, offers), ["“Encore {6}{W}{W}”"], "the table says which ability it is: the card's name alone does not");
}
{
  const s = play("in hand, on the battlefield", [at(0, "battlefield", ...EIGHT, "Angel of Indemnity"), at(0, "hand", "Angel of Indemnity")], tapAll(EIGHT));
  eq(encores(s, 0).length, 0, "an Angel in the hand or on the battlefield has no encore to offer: it works from the graveyard");
}
{
  /* "Activate only as a sorcery" (CR 702.141a, 602.5d): not on Maya's turn, holding priority. */
  const s = play("Maya's turn", [later(0, "battlefield", ...EIGHT), at(0, "graveyard", "Angel of Indemnity")], [{pass: 1}, ...tapAll(EIGHT)], {at: {turn: 2, phase: "MAIN1"}});
  eq([s.priorityPlayer, encores(s, 0).length], [0, 0], "on Maya's turn, holding priority with {6}{W}{W}: not offered");
}

/* ---- the cost, the copies, the requirement ---- */
{
  const s = play("four seats", [at(0, "battlefield", ...EIGHT), at(0, "graveyard", "Angel of Indemnity")], tapAll(EIGHT), {seats: 4});
  const angel = named(s, "Angel of Indemnity", "graveyard")[0].id;
  applyAction(s, 0, encores(s, 0)[0]);
  const exiled = named(s, "Angel of Indemnity", "exile");
  eq([s.objects[angel], exiled.length, s.stack.length, s.stack[0].about?.card === exiled[0]?.id], [undefined, 1, 1, true],
    "activated: the card is exiled as its cost (CR 602.2b, 601.2h), and the ability on the stack is about it there");
  resolveTop(s);
  const tokens = named(s, "Angel of Indemnity", "battlefield");
  eq(tokens.map((t) => [t.token, t.controller, characteristicsOf(s, t.id).power, characteristicsOf(s, t.id).toughness]), [[true, 0, 5, 5], [true, 0, 5, 5], [true, 0, 5, 5]],
    "three opponents, three tokens: copies of the card, 5/5s, Rob's");
  ok(tokens.every((t) => ["Flying", "Lifelink", "Haste"].every((k) => keywordsOf(s, t.id).includes(k))), "each with the card's flying and lifelink, and haste gained (CR 702.141a)");
}
{
  /* Played through: the declare-attackers question, then the end step. */
  const s = play("attacks", [at(0, "battlefield", ...EIGHT), at(0, "graveyard", "Angel of Indemnity")],
    [...tapAll(EIGHT), {activate: "Angel of Indemnity"}, {resolve: true}, {settle: true}, {to: {turn: 1, phase: "COMBAT_BEGIN"}}], {seats: 4});
  const choice = toDeclaration(s);
  const tokens = named(s, "Angel of Indemnity", "battlefield").map((t) => t.id);
  const offered = tokens.map((t) => choice.options.filter((o) => o.cardId === t).map((o) => o.defenderId));
  eq(offered.map((d) => d.length), [1, 1, 1], "at the declaration, each token is offered one defender only");
  eq(offered.flat().sort(), [1, 2, 3], "each its own opponent: Maya, Trey and Sam, one each");
  resolveAwaiting(s, []);
  eq(s.combat.attacks.map((a) => [tokens.indexOf(a.attacker) >= 0, a.defender]).sort((x, y) => x[1] - y[1]), [[true, 1], [true, 2], [true, 3]],
    "declared with none, they attack anyway (CR 508.1d): each the opponent it was made for");
}
{
  /* A cost to attack lifts the requirement (CR 508.1d): with Ghostly Prison, Maya's token need not attack her. */
  const s = play("a cost", [at(0, "battlefield", ...EIGHT), at(0, "graveyard", "Angel of Indemnity"), at(1, "battlefield", "Ghostly Prison")],
    [...tapAll(EIGHT), {activate: "Angel of Indemnity"}, {resolve: true}, {settle: true}, {to: {turn: 1, phase: "COMBAT_BEGIN"}}], {seats: 3});
  const choice = toDeclaration(s);
  const tokens = named(s, "Angel of Indemnity", "battlefield").map((t) => t.id);
  const offered = tokens.map((t) => choice.options.filter((o) => o.cardId === t).map((o) => o.defenderId).sort());
  eq(offered.map((d) => d.length).sort(), [1, 2], "Trey's token is offered Trey alone; Maya's, whom it would cost {2} to attack, is offered either");
  resolveAwaiting(s, []);
  eq(s.combat.attacks.map((a) => a.defender), [2], "declared with none: Trey's attacks him; Maya's stays home, not required to pay");
}
{
  /* The end step: every token sacrificed (CR 702.141a); the card stays in exile. */
  const s = play("the end step", [at(0, "battlefield", ...EIGHT), at(0, "graveyard", "Angel of Indemnity")],
    [...tapAll(EIGHT), {activate: "Angel of Indemnity"}, {resolve: true}, {settle: true}, {to: {turn: 1, phase: "END_OF_TURN", settle: true}}, {settle: true}], {seats: 3});
  eq([named(s, "Angel of Indemnity", "battlefield").length, named(s, "Angel of Indemnity", "exile").length, s.players.map((p) => p.life)], [0, 1, [50, 35, 35]],
    "the two tokens attacked, Rob gained 10 through lifelink, and at the end step both were sacrificed; the card stays in exile");
  const next = play("the next turn", [at(0, "battlefield", ...EIGHT), at(0, "graveyard", "Angel of Indemnity")],
    [...tapAll(EIGHT), {activate: "Angel of Indemnity"}, {resolve: true}, {settle: true}, {to: {turn: 1, phase: "END_OF_TURN", settle: true}}, {settle: true},
      {to: {turn: 2, phase: "MAIN1", settle: true}}], {seats: 3});
  eq((next.effects ?? []).filter((e) => e.rule === "must-attack").length, 0, "and the requirement ends with the turn (CR 514.2)");
}
{
  /* A player who has left the game is no one to attack (CR 800.4; rules/combat.mjs, the defenders still in the game): Maya's token is required of no one. */
  const s = play("Maya has left", [at(0, "battlefield", ...EIGHT), at(0, "graveyard", "Angel of Indemnity")],
    [...tapAll(EIGHT), {activate: "Angel of Indemnity"}, {resolve: true}, {settle: true}], {seats: 3});
  concede(s, 1);
  for (let n = 0; n < 10 && s.phase !== "COMBAT_BEGIN"; n += 1) { if (s.priorityPlayer === null) advance(s); else if (passPriority(s).outcome === "step-ends") advance(s); }
  const choice = toDeclaration(s);
  const tokens = named(s, "Angel of Indemnity", "battlefield").map((t) => t.id);
  eq(tokens.map((t) => choice.options.filter((o) => o.cardId === t).map((o) => o.defenderId)), [[2], [2]], "both tokens may attack Trey, the one opponent left");
  resolveAwaiting(s, []);
  eq(s.combat.attacks.map((a) => a.defender), [2], "declared with none: Trey's token attacks him; Maya's is required to attack no one");
}

/* ---- the schema, and the catalog ---- */
{
  const script = (cost) => ({schema: "CrankCardScript@1", identity: {name: "Test", oracleId: "00000000-0000-4000-8000-000000000000", types: ["Creature"], manaCost: "{R}", power: 1, toughness: 1},
    oracleText: "Encore {3}{R}", source: "hand", abilities: [{kind: "keyword", text: "Encore {3}{R}", keyword: "encore", cost}]});
  eq(compileScript(script([{atom: "mana", cost: "{3}{R}"}])).problems, [], "an encore cost of mana compiles");
  for (const bad of [[], [{atom: "payLife", amount: 2}], [{atom: "mana", cost: "{3}{R}"}, {atom: "payLife", amount: 2}]])
    ok(compileScript(script(bad)).problems.length > 0, `and refuses ${JSON.stringify(bad)}`);
}
eq(missingFor({keywords: ["Encore"]}), [], "the catalog credits Encore");
for (const name of ["Angel of Indemnity", "Impulsive Pilferer"]) ok(index.resolve(name)?.playable === true, `${name} is defined and playable`);

console.log(`engine-encore: ${checks} checks passed -- encore offered from its owner's graveyard at sorcery speed, the card exiled as its cost; a hasty token copy for each opponent, each attacking that opponent if able and offered no one else, a cost lifting it; all sacrificed at the end step.`);
