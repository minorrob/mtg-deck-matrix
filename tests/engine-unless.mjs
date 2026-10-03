/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* M4 PHASE 3, BATCH 14 (THE CATALOG'S ORDER): "UNLESS A PLAYER PAYS" (CR 118.12).
 *
 * The player named is asked; "Pay" is offered only to a player who can, from the pool and their untapped mana sources
 * together, and paying taps for them (they hold no priority to tap in); not paying, what follows `unless` happens, in
 * order, with the same targets. A land that asks to see a card as it enters asks only a player who has one. And "their
 * first noncreature spell each turn" counts what that player has cast this turn, afresh each turn.
 */
import assert from "node:assert/strict";
import {createState, addObject} from "../game/engine/state/index.mjs";
import {beginGame, advance, awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {legalActions, applyAction} from "../game/engine/rules/actions.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";
import {canPayGeneric, payGeneric} from "../game/engine/rules/mana.mjs";
import {beginResolution} from "../game/engine/script/resolution.mjs";
import {housePilot} from "../game/engine/pilots/house-pilot.mjs";
import {projectFor} from "../game/engine/projection.mjs";
import {missingFor} from "../game/tools/engine-constructs.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const cards = loadCardIndex();
const card = (name) => ({...cards.definition(name), card: name});
const land = (name, color) => ({card: name, types: ["Land"], supertypes: ["Basic"], subtypes: color === "C" ? [] : [name], abilities: [{id: "a0", kind: "mana", tapSelf: true, produces: {[color]: 1}}]});
const WASTES = land("Wastes", "C");
const gift = {card: "Gift", types: ["Instant"], manaCost: "{C}", spell: {id: "s", text: "You gain 1 life.", targets: [], effects: [{effect: "gainLife", amount: 1}]}};

const pod = {matchId: "m", seed: "unless", players: [{name: "Rob"}, {name: "Maya"}]};
function table() {
  const s = createState(pod);
  for (let seat = 0; seat < 2; seat += 1) for (let i = 0; i < 12; i += 1) addObject(s, {...WASTES, owner: seat, controller: seat}, "library", seat);
  return s;
}
const on = (s, o, seat, zone = "battlefield") => addObject(s, {...o, owner: seat, controller: seat}, zone, ["battlefield", "exile"].includes(zone) ? null : seat);
function main(s) { beginGame(s); for (let n = 0; n < 50 && !(s.phase === "MAIN1" && s.priorityPlayer === 0); n += 1) advance(s); return s; }
const ctx = (controller = 0, source = null) => ({controller, source});
/* On until `until` holds: nobody attacks or blocks, triggers go on in the order offered, and a payment is declined. */
function run(s, until) {
  for (let n = 0; n < 300 && !until(s); n += 1) {
    if (s.awaiting) {
      const kind = s.awaiting.kind, choice = awaitingChoice(s);
      if (kind === "declare-attackers" || kind === "declare-blockers") resolveAwaiting(s, []);
      else if (kind === "order-triggers") resolveAwaiting(s, choice.options.map((o) => o.index));
      else resolveAwaiting(s, [choice.options.length - 1]);
      continue;
    }
    if (s.priorityPlayer === null) advance(s); else if (passPriority(s).outcome === "step-ends") advance(s);
  }
}

/* ---- paying for a player who holds no priority ---- */
{
  const s = table();
  on(s, WASTES, 1); on(s, WASTES, 1);
  on(s, {card: "Signet", types: ["Artifact"], abilities: [{id: "a0", kind: "mana", tapSelf: true, cost: "{1}", produces: {U: 1, B: 1}}]}, 1);
  const elf = on(s, {card: "Elf", types: ["Creature"], power: 1, toughness: 1, abilities: [{id: "a0", kind: "mana", tapSelf: true, produces: {G: 1}}]}, 1);
  main(s);
  s.players[1].manaPool.R = 1;
  eq([canPayGeneric(s, 1, 3), canPayGeneric(s, 1, 4)], [true, false],
    "Maya can pay {3}: one in her pool and two lands -- not the Signet, whose {1} is a cost of its own, nor the Elf, which has not been hers since a turn of hers began (CR 302.6: she has had none)");
  const events = payGeneric(s, 1, 2);
  eq([s.players[1].manaPool.R, s.zones.battlefield.filter((id) => s.objects[id].card === "Wastes" && s.objects[id].tapped).length], [0, 1], "paying {2}: the pool first, then one land tapped");
  ok(events.some((e) => e.kind === "GameEventCardTapped"), "and the tap is reported");
  void elf;
}

/* ---- the question, and what not paying does ---- */
{
  const s = table();
  on(s, WASTES, 1);
  main(s);
  beginResolution(s, [{effect: "unlessPays", who: "opponent", amount: 2, effects: [{effect: "gainLife", amount: 5}, {effect: "draw", count: 1}]}], ctx(0, null));
  const choice = awaitingChoice(s);
  eq([s.awaiting.player, choice.options.map((o) => o.label)], [1, ["Don't pay"]], "asked of Maya; with one land she cannot pay {2}, and is not offered to");
  resolveAwaiting(s, [0]);
  eq([s.players[0].life, projectFor(s, 0).players[0].zones.Hand.count], [45, 1], "not paying, everything after `unless` happens, in order");
}
{
  const s = table();
  on(s, WASTES, 1); on(s, WASTES, 1);
  main(s);
  beginResolution(s, [{effect: "unlessPays", who: "opponent", amount: 2, effects: [{effect: "gainLife", amount: 5}]}], ctx(0, null));
  const choice = awaitingChoice(s);
  eq(choice.options.map((o) => o.label), ["Pay {2}", "Don't pay"], "with two lands she may pay");
  resolveAwaiting(s, [0]);
  eq([s.players[0].life, s.zones.battlefield.filter((id) => s.objects[id].tapped).length], [40, 2], "paying taps her lands, and nothing else happens");
}
{
  /* WHICH MANA PAYS IS THE PAYER'S (CR 605.3a, 118.12; the plan review's C2): an Island and two Wastes paying {2} can leave
     the Island or a Wastes untapped -- which decides what she can still cast -- so she is asked which. */
  const s = table();
  on(s, land("Island", "U"), 1); on(s, WASTES, 1); on(s, WASTES, 1);
  main(s);
  beginResolution(s, [{effect: "unlessPays", who: "opponent", amount: 2, effects: [{effect: "gainLife", amount: 5}]}], ctx(0, null));
  resolveAwaiting(s, [0]);
  const pick = awaitingChoice(s);
  eq([s.awaiting?.player, pick.mode, pick.min, pick.max, pick.options.map((o) => o.label)], [1, "many", 2, 2, ["Tap Island", "Tap Wastes", "Tap Wastes"]],
    "having said she pays {2}, Maya chooses the two that pay it");
  resolveAwaiting(s, pick.options.flatMap((o) => (o.label === "Tap Wastes" ? [o.index] : [])));
  eq([s.zones.battlefield.filter((id) => !s.objects[id].tapped).map((id) => s.objects[id].card), s.players[0].life, s.awaiting], [["Island"], 40, null],
    "she keeps the Island up; paid, nothing else happens");
}
{
  /* With mana of one kind, or exactly enough, every way is the same: nobody is asked. Her pool's {U} and an Island are one
     kind, and the pool goes first. */
  const s = table();
  on(s, WASTES, 1); on(s, WASTES, 1); on(s, WASTES, 1);
  main(s);
  beginResolution(s, [{effect: "unlessPays", who: "opponent", amount: 2, effects: [{effect: "gainLife", amount: 5}]}], ctx(0, null));
  resolveAwaiting(s, [0]);
  eq([s.awaiting, s.zones.battlefield.filter((id) => s.objects[id].tapped).length], [null, 2], "three Wastes paying {2}: one way, paid without a question");
  const t = table();
  const island = on(t, land("Island", "U"), 1);
  main(t);
  t.players[1].manaPool.U = 1;
  beginResolution(t, [{effect: "unlessPays", who: "opponent", amount: 1, effects: [{effect: "gainLife", amount: 5}]}], ctx(0, null));
  resolveAwaiting(t, [0]);
  eq([t.awaiting, t.players[1].manaPool.U, t.objects[island].tapped], [null, 0, false], "a {U} in her pool and an Island paying {1}: the same mana either way, the pool's spent");
}
{
  /* The same targets: "counter target spell unless its controller pays {3}". */
  const s = table();
  on(s, card("Mana Leak"), 0, "hand");
  on(s, land("Island", "U"), 0); on(s, WASTES, 0);
  on(s, gift, 1, "hand"); on(s, WASTES, 1);
  main(s);
  run(s, (x) => x.turn === 2 && x.phase === "MAIN1" && x.priorityPlayer === 1);
  applyAction(s, 1, legalActions(s, 1).find((a) => a.kind === "activate-mana"));
  applyAction(s, 1, legalActions(s, 1).find((a) => a.kind === "cast" && a.label === "Gift"));
  passPriority(s);
  for (const name of ["Island", "Wastes"]) applyAction(s, 0, legalActions(s, 0).find((a) => a.kind === "activate-mana" && a.label === name));
  applyAction(s, 0, legalActions(s, 0).find((a) => a.kind === "cast" && a.label === "Mana Leak"));
  passPriority(s); passPriority(s);
  eq(s.awaiting?.player, 1, "Mana Leak asks Gift's controller -- its target's, not its caster");
  resolveAwaiting(s, [awaitingChoice(s).options.findIndex((o) => o.label === "Don't pay")]);
  eq(Object.values(s.objects).filter((o) => o.card === "Gift").map((o) => o.zone), ["graveyard"], "she cannot pay: Gift is countered");
}
{
  /* The house pilot pays when it can. */
  const s = table();
  on(s, WASTES, 1); on(s, WASTES, 1);
  main(s);
  beginResolution(s, [{effect: "unlessPays", who: "opponent", amount: 1, effects: [{effect: "draw", count: 1}]}], ctx(0, null));
  const choice = awaitingChoice(s);
  eq(choice.options[housePilot({seat: 1}).answer(projectFor(s, 1), choice).indices[0]].label, "Pay {1}", "the house pilot pays {1} rather than give a card away");
}

/* ---- a land that asks to see a card ---- */
{
  const s = table();
  on(s, card("Choked Estuary"), 0, "hand"); on(s, land("Island", "U"), 0, "hand");
  main(s);
  applyAction(s, 0, legalActions(s, 0).find((a) => a.kind === "play-land" && a.label === "Choked Estuary"));
  const choice = awaitingChoice(s);
  eq(choice.options.map((o) => o.label), ["Reveal Island: Choked Estuary enters untapped", "Don't reveal: Choked Estuary enters tapped"], "an Island in hand: reveal it, or don't");
  const events = resolveAwaiting(s, [0]);
  const estuary = s.zones.battlefield.find((id) => s.objects[id].card === "Choked Estuary");
  eq([s.objects[estuary].tapped, events.some((e) => e.kind === "GameEventCardRevealed" && e.data.fields.card.name === "Island")], [false, true], "revealed: untapped, and the Island named for all to see");
  eq(projectFor(s, 1).players[0].zones.Hand.count, 1, "the Island stays in Rob's hand");
}
{
  const s = table();
  on(s, card("Choked Estuary"), 0, "hand"); on(s, land("Forest", "G"), 0, "hand");
  main(s);
  applyAction(s, 0, legalActions(s, 0).find((a) => a.kind === "play-land" && a.label === "Choked Estuary"));
  const estuary = s.zones.battlefield.find((id) => s.objects[id].card === "Choked Estuary");
  eq([s.awaiting, s.objects[estuary].tapped], [null, true], "no Island or Swamp in hand: nobody is asked, and it enters tapped");
}

/* ---- "their first noncreature spell each turn" ---- */
{
  const s = table();
  on(s, card("Esper Sentinel"), 0);
  for (let i = 0; i < 4; i += 1) on(s, WASTES, 1);
  on(s, gift, 1, "hand"); on(s, gift, 1, "hand"); on(s, gift, 1, "hand");
  main(s);
  run(s, (x) => x.turn === 2 && x.phase === "MAIN1" && x.priorityPlayer === 1);
  const castGift = () => { applyAction(s, 1, legalActions(s, 1).find((a) => a.kind === "activate-mana")); applyAction(s, 1, legalActions(s, 1).find((a) => a.kind === "cast" && a.label === "Gift")); };
  castGift();
  eq((s.pendingTriggers ?? []).length + s.stack.filter((e) => e.kind === "trigger").length, 1, "Maya's first noncreature spell: Esper Sentinel triggers");
  passPriority(s); passPriority(s);
  if (s.awaiting) resolveAwaiting(s, [awaitingChoice(s).options.length - 1]);
  passPriority(s); passPriority(s);
  castGift();
  eq(s.stack.filter((e) => e.kind === "trigger").length, 0, "her second this turn: no trigger");
  eq(s.players[1].castThisTurn.length, 2, "(two spells cast this turn, counted)");
  run(s, (x) => x.turn === 3 && x.phase === "MAIN1");
  eq(s.players[1].castThisTurn.length, 0, "and counted afresh the next turn, so her first noncreature spell in her next turn triggers again");
}

/* ---- the measurement ---- */
{
  eq([missingFor({apis: ["Draw"], options: ["UnlessCost", "UnlessCostMana"]}), missingFor({apis: ["LoseLife"], options: ["UnlessCost", "UnlessCostDiscard"]})],
    [[], [{kind: "option", name: "UnlessCostDiscard", why: "not built"}]],
    "\"unless that player pays {1}\" is built; Painful Quandary's \"unless they discard a card\" is not");
}

console.log(`engine-unless: ${checks} checks passed — "unless a player pays" asked of the player named, paid by tapping for them or else the consequences in order; a reveal as a land enters; the first noncreature spell each turn.`);
