/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* M4 PHASE 3, BATCH 5: "AS THIS LAND ENTERS, YOU MAY PAY 2 LIFE. IF YOU DON'T, IT ENTERS TAPPED."
 *
 * The ten shock lands are in the most-played forty Commander cards, and the classic way to play one is to fetch it.
 * rules/entering.mjs: the land enters as it would unpaid -- tapped -- and its controller is asked at the next point a
 * player would receive priority, before any trigger goes on the stack: after the land drop, after the resolution
 * that put it there. Paying untaps it. "Pay" is offered only to a player with the life (CR 119.4).
 */
import assert from "node:assert/strict";
import {createState, addObject} from "../game/engine/state/index.mjs";
import {beginGame, advance, awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {legalActions, applyAction} from "../game/engine/rules/actions.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";
import {projectFor} from "../game/engine/projection.mjs";
import {housePilot} from "../game/engine/pilots/house-pilot.mjs";
import {createRng} from "../game/engine/rng.mjs";
import {askEntering} from "../game/engine/rules/entering.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };
const throws = (f, re, m) => { assert.throws(f, re, m); checks += 1; };

const SHOCK = {card: "Watery Grave", types: ["Land"], subtypes: ["Island", "Swamp"], abilities: [
  {id: "a0", kind: "mana", tapSelf: true, produces: [{U: 1}, {B: 1}]},
  {id: "r0", kind: "replacement", text: "As this land enters, you may pay 2 life. If you don't, it enters tapped.",
    watches: {event: "enters", who: "self"}, change: {entersTapped: true, unlessPay: {life: 2}}}]};
const WASTES = {card: "Wastes", types: ["Land"], supertypes: ["Basic"], abilities: [{id: "a0", kind: "mana", tapSelf: true, produces: {C: 1}}]};
const FETCH = {card: "Fetch", types: ["Land"], abilities: [{id: "a0", kind: "activated", text: "x", cost: [{atom: "{T}"}, {atom: "sacrifice", self: true}],
  targets: [], effects: [{effect: "chooseCard", zone: "library", selector: {types: ["Land"], subtypes: ["Island"]}, to: "battlefield", shuffle: true}]}]};
const LANDFALL = {card: "Landfall", types: ["Enchantment"], abilities: [{id: "t0", kind: "triggered", text: "Whenever a land you control enters, you gain 1 life.",
  trigger: {on: "GameEventCardChangeZone", to: "Battlefield", who: "any", filter: {what: "permanent", types: ["Land"], controller: "you"}}, effects: [{effect: "gainLife", amount: 1}]}]};

const pod = {matchId: "m", seed: "entering", players: [{name: "Rob"}, {name: "Maya"}]};
function table(library = [WASTES]) {
  const s = createState(pod);
  for (let seat = 0; seat < 2; seat += 1) for (let i = 0; i < 10; i += 1) for (const c of library) addObject(s, {...c, owner: seat, controller: seat}, "library", seat);
  return s;
}
const on = (s, o, seat, zone = "battlefield") => addObject(s, {...o, owner: seat, controller: seat}, zone, ["battlefield", "exile"].includes(zone) ? null : seat);
function main(s) { beginGame(s); for (let n = 0; n < 50 && !(s.phase === "MAIN1" && s.priorityPlayer === 0); n += 1) advance(s); return s; }
const shockOn = (s) => s.objects[s.zones.battlefield.find((id) => s.objects[id].card === "Watery Grave")];
const playShock = (s) => applyAction(s, 0, legalActions(s, 0).find((a) => a.kind === "play-land" && a.label === "Watery Grave"));

{
  const s = table();
  on(s, SHOCK, 0, "hand");
  main(s);
  playShock(s);
  const choice = awaitingChoice(s);
  eq([s.awaiting.kind, s.awaiting.player, s.priorityPlayer, shockOn(s).tapped], ["entering-choice", 0, null, true],
    "the land drop is followed at once by its controller's question, nobody holding priority, the land tapped as it would be unpaid");
  eq(choice.options.map((o) => o.label), ["Pay 2 life: Watery Grave enters untapped", "Don't pay: Watery Grave enters tapped"], "pay, or let it enter tapped");
  throws(() => resolveAwaiting(s, [5]), /Invalid selection/, "an answer outside the choice is refused");
  resolveAwaiting(s, [0]);
  eq([shockOn(s).tapped, s.players[0].life, s.priorityPlayer], [false, 38, 0], "paid: untapped, 2 life gone, and priority back to its player");
}
{
  const s = table();
  on(s, SHOCK, 0, "hand");
  main(s);
  playShock(s);
  resolveAwaiting(s, [1]);
  eq([shockOn(s).tapped, s.players[0].life], [true, 40], "not paid: tapped, and no life lost");
}
{
  const s = table();
  on(s, SHOCK, 0, "hand");
  main(s);
  s.players[0].life = 1;
  playShock(s);
  eq(awaitingChoice(s).options.map((o) => o.label), ["Don't pay: Watery Grave enters tapped"], "at 1 life there is no paying 2 (CR 119.4): the only answer is tapped");
}
{
  /* Fetched by a search: asked once the search's resolution is done, before anyone receives priority. */
  const s = table([SHOCK, WASTES]);
  on(s, FETCH, 0);
  main(s);
  applyAction(s, 0, legalActions(s, 0).find((a) => a.kind === "activate"));
  passPriority(s); passPriority(s);
  eq(s.awaiting?.effect, "chooseCard", "the fetch searches");
  resolveAwaiting(s, [awaitingChoice(s).options.findIndex((o) => o.label === "Watery Grave")], null, createRng("x"));
  eq([s.awaiting?.kind, shockOn(s).tapped, s.stack.length], ["entering-choice", true, 0], "the shock it found asks as the search ends, before priority returns");
  resolveAwaiting(s, [0]);
  eq([shockOn(s).tapped, s.players[0].life, s.priorityPlayer], [false, 38, 0], "and paid for, it is untapped: the fetch-and-shock a player expects");
}
{
  /* The question is part of entering: it comes before the triggers its entering caused. */
  const s = table();
  on(s, LANDFALL, 0);
  on(s, SHOCK, 0, "hand");
  main(s);
  playShock(s);
  eq([s.awaiting?.kind, s.stack.length], ["entering-choice", 0], "the shock asks before the land's arrival trigger goes on the stack");
  resolveAwaiting(s, [0]);
  eq([s.stack.length, s.stack[0]?.kind], [1, "trigger"], "then the trigger goes on the stack");
}
{
  const s = table();
  on(s, SHOCK, 0, "hand");
  main(s);
  playShock(s);
  const answer = housePilot({seat: 0}).answer(projectFor(s, 0), awaitingChoice(s));
  eq(answer.indices, [0], "the house pilot pays the 2 life for an untapped land");
}
{
  /* Put onto the battlefield by a resolution that asks nothing itself: asked as that resolution ends. */
  const s = table();
  on(s, WASTES, 0);
  on(s, SHOCK, 0, "graveyard");
  on(s, {card: "Return", types: ["Sorcery"], manaCost: "{C}", spell: {id: "s", text: "x", targets: [{what: "card", zone: "graveyard", types: ["Land"]}],
    effects: [{effect: "moveZone", targets: {target: 0}, to: "battlefield"}]}}, 0, "hand");
  main(s);
  applyAction(s, 0, legalActions(s, 0).find((a) => a.kind === "activate-mana"));
  applyAction(s, 0, legalActions(s, 0).find((a) => a.kind === "cast"));
  passPriority(s);
  const last = passPriority(s);
  eq([last.outcome, s.awaiting?.kind, s.priorityPlayer, shockOn(s).tapped], ["resolved", "entering-choice", null, true],
    "a spell that returns a shock land asks its question as the spell finishes, before priority returns");
}
{
  const s = table();
  main(s);
  const gone = on(s, SHOCK, 0, "graveyard");
  s.enteringQuestions = [{objectId: gone, life: 2}, {objectId: 9999, life: 2}];
  eq([askEntering(s), s.enteringQuestions.length, s.awaiting], [false, 0, null], "a land no longer on the battlefield when its turn to ask comes is not asked about");
}

console.log(`engine-entering: ${checks} checks passed — a shock land asks as it enters, from hand or from a fetch, before any trigger, and only offers what its player can pay.`);
