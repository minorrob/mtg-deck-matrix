/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* "PLANESWALKERS YOU CONTROL HAVE '[-8]: CREATE AN 8/8 BLUE LEVIATHAN CREATURE TOKEN WITH HEXPROOF'" (Kiora of Salt and
 * Sand; the live-game plan of 2026-10-04, its piece P2), and Kiora's "whenever you attack, if you've activated a loyalty
 * ability this turn, untap target attacking creature. It can't be blocked this turn."
 *
 * Built already: a static that adds abilities in layer 6 (`addAbilities`, batch 76; CR 613.1f), each compiled as a
 * card's own, so a granted loyalty ability is one (CR 606): paid with loyalty counters (606.4), at sorcery speed, and one
 * of the permanent's loyalty abilities for the once-a-turn rule (606.3). No new engine code; this suite proves it, and
 * Kiora's attack trigger, which reads P4's record (tests/engine-loyalty-activated.mjs).
 */
import assert from "node:assert/strict";
import {legalActions} from "../game/engine/rules/actions.mjs";
import {awaitingChoice} from "../game/engine/rules/turn.mjs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {runEffect} from "../game/engine/script/effects/index.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const KIORA = "Kiora of Salt and Sand", AJANI = "Ajani Unrelenting", KB = "Kiora, Behemoth Beckoner";
const at = (seat, zone, ...cards) => ({seat, zone, cards});
const FIX = {
  Bear: {types: ["Creature"], subtypes: ["Bear"], manaCost: "{1}{G}", colors: ["G"], power: 2, toughness: 2},
  "Other Bear": {types: ["Creature"], subtypes: ["Bear"], manaCost: "{1}{G}", colors: ["G"], power: 2, toughness: 2},
  Walker: {types: ["Planeswalker"], subtypes: ["Ajani"], manaCost: "{2}{W}", colors: ["W"], loyalty: 9},
};
const play = (setup, steps = []) => runScenario({name: "granted loyalty", setup, steps}, index.definition, FIX).state;
const idOf = (s, card) => s.zones.battlefield.find((id) => s.objects[id].card === card);
const offers = (s, card, seat = 0) => legalActions(s, seat).filter((a) => a.kind === "activate" && s.objects[a.objectId].card === card);
const minus8 = (s, card) => offers(s, card).filter((a) => a.loyalty === -8);

/* ---- granted, to Rob's planeswalkers only, payable only with eight ---- */
{
  const s = play([at(0, "battlefield", KIORA, "Walker", KB)]);
  eq([minus8(s, "Walker").length, minus8(s, KB).length], [1, 0], "the 9-loyalty Walker is offered -8; Behemoth Beckoner, at 7, is not");
  const t = play([at(0, "battlefield", KIORA), at(1, "battlefield", "Walker")], [{pass: 1}, {to: {turn: 2, phase: "MAIN1"}}]);
  eq(offers(t, "Walker", 1).length, 0, "Maya's Walker has no -8 from Rob's Kiora");
  const u = play([at(0, "battlefield", "Walker")]);
  eq(offers(u, "Walker").length, 0, "without Kiora, the Walker has nothing to activate");
}
/* ---- a loyalty ability like its own: once a turn among them, and gone with Kiora ---- */
{
  const s = play([at(0, "battlefield", KIORA, AJANI)]);
  s.objects[idOf(s, AJANI)].counters.loyalty = 9;
  eq(offers(s, AJANI).map((a) => a.loyalty).sort((a, b) => a - b), [-8, -3, -2, 1], "Ajani at 9: its three, and the -8");
  const ran = play([at(0, "battlefield", KIORA, "Walker")], [{activate: "Walker"}]);
  eq(offers(ran, "Walker").length, 0, "the -8 activated: nothing more from the Walker this turn (CR 606.3)");
  eq(ran.players[0].loyaltyThisTurn, 1, "and it is a loyalty ability activated");
  const gone = play([at(0, "battlefield", KIORA, "Walker")]);
  runEffect(gone, {effect: "moveZone", targets: [idOf(gone, KIORA)], to: "graveyard"}, {controller: 1, source: null});
  eq(minus8(gone, "Walker").length, 0, "Kiora gone: the -8 with her");
}
/* ---- the -8 makes Ajani's Cadet too ---- */
{
  const s = play([at(0, "battlefield", KIORA, AJANI, "Walker")], [{activate: "Walker"}, {resolve: true}, {resolve: true}]);
  eq([idOf(s, "Leviathan") !== undefined, idOf(s, "Cadet") !== undefined], [true, true], "the Walker's -8: a Leviathan, and a Cadet from Ajani");
}
/* ---- Kiora's attack: an attacking creature only, untapped and unblockable ---- */
{
  const s = play([at(0, "battlefield", KIORA, "Walker", "Bear", "Other Bear")], [{activate: "Walker"}, {resolve: true}, {attack: ["Bear"]}]);
  eq(awaitingChoice(s).options.map((o) => o.label), ["Bear"], "the trigger's target: the attacking Bear, not the one at home");
  const t = play([at(0, "battlefield", KIORA, "Walker", "Bear")], [{activate: "Walker"}, {resolve: true}, {attack: ["Bear"]}, {choose: ["Bear"]}, {resolve: true}]);
  const bear = idOf(t, "Bear");
  eq([t.objects[bear].tapped, (t.effects ?? []).some((e) => e.rule === "cant-be-blocked" && e.affects?.ids?.includes(bear))], [false, true], "the Bear untapped, and can't be blocked this turn");
  const u = play([at(0, "battlefield", KIORA, "Walker", "Bear")], [{attack: ["Bear"]}]);
  eq([u.stack.length, u.awaiting?.kind ?? null], [0, null], "nothing activated this turn: no trigger");
}
ok(index.resolve(KIORA)?.playable === true, `${KIORA} is defined and playable`);

console.log(`engine-granted-loyalty: ${checks} checks passed -- planeswalkers you control have a loyalty ability: granted in layer 6, paid in loyalty, once a turn among their own, gone with its source; Kiora's attack untaps an attacker, unblockable.`);
