/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* A NAME LOCKED UNTIL YOUR NEXT TURN (Reflector Mage; AI 1's Chulane deck, after the live game of 2026-10-04).
 *
 * "Return target creature an opponent controls to its owner's hand. That creature's owner can't cast spells with the same
 * name as that creature until your next turn." The second sentence is a rule changed for a player for a while: effectUntil's
 * `rule: "cant-cast"` (script/effects/permanents.mjs), its players bound from the facts `ownerOf` and its spells by `nameOf`
 * (script/bind.mjs, read as the resolution begins, before the creature is returned), and read where a cast is offered --
 * from the hand, the command zone, or as an effect casts (rules/statics.mjs, castForbidden). It ends as its controller's
 * next turn begins, or, should that player have left the game, as that turn would have begun (CR 800.4m; rules/turn.mjs).
 * The owner, not the controller (CR 108.3); a land is played, not cast (the card's ruling of 2016-01-22).
 */
import assert from "node:assert/strict";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {legalActions, castChoicesNow, applyAction} from "../game/engine/rules/actions.mjs";
import {advance, awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";
import {createRng} from "../game/engine/rng.mjs";
import {castForbidden} from "../game/engine/rules/statics.mjs";
import {concede} from "../game/engine/rules/sba.mjs";
import {validateScript} from "../game/engine/script/schema.mjs";
import {runEffect} from "../game/engine/script/effects/index.mjs";
import {bindEffect, factsOf} from "../game/engine/script/bind.mjs";

let checks = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const RM = "Reflector Mage";
const at = (seat, zone, ...cards) => ({seat, zone, cards});
const later = (seat, zone, ...cards) => ({seat, zone, cards, sick: true});
const bear = (cost, extra = {}) => ({types: ["Creature"], subtypes: ["Bear"], manaCost: cost, colors: ["G"], power: 2, toughness: 2, ...extra});
const FIX = {Bear: bear("{1}{G}"), Cub: bear("{1}{G}"), "Flash Bear": bear("{G}", {keywords: ["Flash"]}),
  Steal: {types: ["Sorcery"], manaCost: "{U}", colors: ["U"], spell: {id: "s", text: "Gain control of target creature.", targets: [{what: "permanent", types: ["Creature"]}],
    effects: [{effect: "gainControl", targets: {target: 0}}]}},
  Recall: {types: ["Sorcery"], manaCost: "{G}", colors: ["G"], spell: {id: "s", text: "You may cast a spell with mana value 2 or less from your hand without paying its mana cost.", targets: [],
    effects: [{effect: "play", manaValueAtMost: 2, free: true}]}}};
const run = (scenario) => runScenario({name: "name lock", ...scenario}, index.definition, FIX).state;
const casts = (s, seat, card) => legalActions(s, seat).filter((a) => a.kind === "cast" && a.label === card).length;
const tap = (s, seat, card) => applyAction(s, seat, legalActions(s, seat).find((a) => a.kind === "activate-mana" && a.label === card));
/* The game on to a step, as the room plays it: everyone passes, nobody attacks, a player's triggers go on in order. */
const rng = createRng("name lock");
function goTo(s, turn, phase) {
  for (let n = 0; n < 2000; n += 1) {
    if (s.turn === turn && s.phase === phase && s.priorityPlayer !== null && !s.awaiting) return;
    if (s.awaiting) {
      const kind = s.awaiting.kind;
      if (kind === "order-triggers") resolveAwaiting(s, awaitingChoice(s).options.map((o) => o.index));
      else if (kind === "declare-attackers" || kind === "declare-blockers") resolveAwaiting(s, []);
      else throw new Error(`asked ${kind}`);
    } else if (s.priorityPlayer === null) advance(s);
    else if (passPriority(s, null, rng).outcome === "step-ends") advance(s);
  }
  throw new Error(`never reached turn ${turn} ${phase}`);
}
const taps = (seat, ...lands) => lands.map((tap) => ({tap, seat}));
const reflect = (target) => [{tap: "Plains"}, {tap: "Island"}, {tap: "Wastes"}, {cast: RM}, {resolve: true}, {choose: [target]}, {resolve: true}];
const RM_LANDS = at(0, "battlefield", "Plains", "Island", "Wastes");

{
  /* It lasts exactly until Rob's next turn begins: Maya's Flash Bear can't be cast on Rob's turn, on hers, and can on his next. */
  const setup = [RM_LANDS, at(0, "hand", RM), at(1, "battlefield", "Flash Bear", "Forest"), at(1, "hand", "Cub")];
  const s = run({setup, steps: [...reflect("Flash Bear"), {pass: 1}]});
  eq(s.effects.filter((e) => e.rule === "cant-cast").map((e) => [e.players, e.spells, e.until, e.sourceController]), [[[1], {named: "Flash Bear"}, "your-next-turn", 0]],
    "the effect: Maya, the owner, can't cast spells named Flash Bear until Rob's next turn");
  const t = run({setup, steps: [...reflect("Flash Bear"), {pass: 1}, ...taps(1, "Forest")]});
  eq(casts(t, 1, "Flash Bear"), 0, "on Rob's turn, with priority and {G}, Maya is not offered her Flash Bear");
  const u = run({setup, steps: [...reflect("Flash Bear"), {to: {turn: 2, phase: "MAIN1"}}, ...taps(1, "Forest")]});
  eq(casts(u, 1, "Flash Bear"), 0, "nor on her own turn");
  const v = run({setup, steps: [...reflect("Flash Bear"), {to: {turn: 3, phase: "UPKEEP"}}, {pass: 1}, ...taps(1, "Forest")]});
  eq([v.effects.filter((e) => e.rule === "cant-cast").length, casts(v, 1, "Flash Bear")], [0, 1], "Rob's next turn begun, it is over: in his upkeep she may cast it");
}
{
  /* The owner, not the controller (CR 108.3): Maya stole Rob's Bear; his Reflector Mage returns it to HIS hand and locks HIM. */
  const s = run({setup: [at(0, "battlefield", "Plains", "Island", "Wastes", "Forest", "Wastes", "Bear"), at(0, "hand", RM), at(1, "battlefield", "Island"), at(1, "hand", "Steal")],
    steps: [{to: {turn: 2, phase: "MAIN1"}}, ...taps(1, "Island"), {cast: "Steal", seat: 1, targets: [{card: "Bear"}]}, {resolve: true},
      {to: {turn: 3, phase: "MAIN1"}}, ...reflect("Bear"), {tap: "Forest"}, {tap: "Wastes"}]});
  eq([s.zones.hand[0].map((id) => s.objects[id].card).includes("Bear"), casts(s, 0, "Bear")], [true, 0], "the Bear in Rob's hand, and Rob not offered it with {1}{G} in his pool");
  eq(s.effects.find((e) => e.rule === "cant-cast")?.players, [0], "locked: its owner Rob, not Maya who controlled it");
}
{
  /* Four players: only the owner is locked -- Trey may cast his own Bear. */
  const s = run({seats: 4, setup: [RM_LANDS, at(0, "hand", RM), at(1, "battlefield", "Bear"), at(2, "battlefield", "Forest", "Wastes"), at(2, "hand", "Bear")],
    steps: [...reflect("Bear"), {to: {turn: 3, phase: "MAIN1"}}, ...taps(2, "Forest", "Wastes")]});
  eq([casts(s, 2, "Bear"), castForbidden(s, 1, s.zones.hand[1].find((id) => s.objects[id].card === "Bear"))], [1, true], "Trey casts a Bear on his turn; Maya's is still forbidden");
}
{
  /* A commander returned: its owner may put it into the command zone instead (CR 903.9b), and it can't be cast from there. */
  const steps = [{to: {turn: 2, phase: "MAIN1"}}, ...taps(1, "Forest", "Wastes"), {cast: "Bear", seat: 1}, {resolve: true},
    {to: {turn: 3, phase: "MAIN1"}}, ...reflect("Bear"), {choose: ["Put it into the command zone"]}];
  const setup = [RM_LANDS, at(1, "command", "Bear"), at(1, "battlefield", "Forest", "Wastes", "Forest", "Wastes"), at(0, "hand", RM)];
  const s = run({setup, steps: [...steps, {to: {turn: 4, phase: "MAIN1"}}, ...taps(1, "Forest", "Wastes", "Forest", "Wastes")]});
  eq([s.zones.command[1].map((id) => s.objects[id].card), casts(s, 1, "Bear")], [["Bear"], 0], "the commander home, and with its {1}{G} and {2} of tax in her pool, Maya can't cast it");
  const t = run({setup, steps: [...steps, {to: {turn: 6, phase: "MAIN1"}}, ...taps(1, "Forest", "Wastes", "Forest", "Wastes")]});
  eq(casts(t, 1, "Bear"), 1, "after Rob's next turn, she can");
}
{
  /* As an effect casts ("you may cast a spell ... without paying its mana cost"): refused there too (castChoicesNow). */
  const s = run({setup: [RM_LANDS, at(0, "hand", RM), at(1, "battlefield", "Bear", "Forest"), at(1, "hand", "Recall", "Cub")],
    steps: [...reflect("Bear"), {to: {turn: 2, phase: "MAIN1"}}]});
  const hand = (card) => s.zones.hand[1].find((id) => s.objects[id].card === card);
  eq([castChoicesNow(s, 1, hand("Bear")).length, castChoicesNow(s, 1, hand("Cub")).length], [0, 1], "a free cast as Recall resolves: the Bear not among them, the Cub is");
}
{
  /* CR 800.4m: Rob leaves the game -- the lock lasts until his turn would have begun, neither ending at once nor for good.
     Rob, Maya, Trey: Rob concedes on his own turn 1; turns 2 and 3 are Maya's and Trey's; the next would have been Rob's,
     and is Maya's. */
  const s = run({seats: 3, setup: [RM_LANDS, at(0, "hand", RM), at(1, "battlefield", "Flash Bear", "Forest")], steps: [...reflect("Flash Bear")]});
  const locks = () => s.effects.filter((e) => e.rule === "cant-cast").length;
  concede(s, 0);
  eq(locks(), 1, "Rob concedes: the lock stays");
  goTo(s, 2, "MAIN1");
  eq([s.activePlayer, locks()], [1, 1], "Maya's turn 2: still locked");
  goTo(s, 3, "MAIN1");
  eq([s.activePlayer, locks()], [2, 1], "Trey's turn 3, before Rob's would have begun: still locked");
  goTo(s, 4, "MAIN1");
  eq([s.activePlayer, locks()], [1, 0], "turn 4, Maya's -- where Rob's would have begun: the lock is over");
  tap(s, 1, "Forest");
  eq(casts(s, 1, "Flash Bear"), 1, "and with {G} she is offered the Flash Bear");
}

/* Facts read as the resolution begins (CR 608.2h): the owner and the name, before the creature is returned. */
{
  const s = run({setup: [at(1, "battlefield", "Bear")], steps: []});
  const bearId = s.zones.battlefield.find((id) => s.objects[id].card === "Bear");
  const facts = factsOf(s, [{kind: "object", id: bearId}]);
  eq([facts[0].ownerOf, facts[0].nameOf], [1, "Bear"], "ownerOf and nameOf of a target");
  const bound = bindEffect({effect: "effectUntil", rule: "cant-cast", who: {ownerOf: {target: 0}}, named: {nameOf: {target: 0}}, until: "your-next-turn"}, {controller: 0, facts, targets: [{kind: "object", id: bearId}]});
  eq([bound.who, bound.named], [[1], "Bear"], "bound into the effect: who Maya, named Bear");
  /* A name that could not be read forbids nothing (the creature gone, its fact null). */
  const before = (s.effects ?? []).length;
  runEffect(s, {effect: "effectUntil", rule: "cant-cast", who: [1], until: "your-next-turn"}, {controller: 0, source: null});
  eq((s.effects ?? []).length, before, "no name: no effect, rather than every spell forbidden");
}

/* The schema: a cast forbidden for a while names both its spells and its players. */
{
  const script = (effect) => ({schema: "CrankCardScript@1", identity: {name: "Test", oracleId: "t", types: ["Sorcery"], manaCost: "{1}"}, oracleText: "x", abilities: [
    {kind: "spell", text: "x", targets: [{what: "permanent"}], effects: [effect]}]});
  eq(validateScript(script({effect: "effectUntil", rule: "cant-cast", who: {ownerOf: {target: 0}}, until: "your-next-turn"})).valid, false, "no `named`: refused");
  eq(validateScript(script({effect: "effectUntil", rule: "cant-cast", named: {nameOf: {target: 0}}, until: "your-next-turn"})).valid, false, "no `who`: refused");
  eq(validateScript(script({effect: "effectUntil", rule: "cant-cast", who: {ownerOf: {target: 0}}, named: {nameOf: {target: 0}}, until: "your-next-turn"})).valid, true, "both: valid");
  eq(validateScript(script({effect: "effectUntil", rule: "cant-cast", who: {ownerOf: {target: 1}}, named: {nameOf: {target: 0}}, until: "your-next-turn"})).valid, false, "a fact of a target not declared: refused");
}

console.log(`engine-name-lock: ${checks} checks passed -- a name its owner can't cast until your next turn, from any zone and as an effect casts; the owner, not the controller; over as that turn begins, or would have (CR 800.4m).`);
