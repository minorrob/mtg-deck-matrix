/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* PHYREXIAN MANA, TAPPED FOR (ROB-326; Rob's playtest, 2026-10-29, Tezzeret's Gambit): "{U/P} can be paid with either {U} or
 * 2 life" (CR 107.4f).
 *
 * The defect, measured on main (3ca254f7) with the real engine and no UI: Tezzeret's Gambit in hand and three untapped Wastes
 * (or three Wastes and an Island) was offered NOT AT ALL -- the cast that taps for itself (castTapPlans) left Phyrexian costs
 * "to tapping by hand", so the life way was only ever offered once the player had tapped the three lands themselves. And
 * Gitaxian Probe beside an untapped Island was offered for 2 life only, the Island ignored: life chosen for the player.
 *
 * The fix is gated by `phyrexianTaps` (a table's new matches, as `xTaps` was), so a match launched before offers and replays
 * what it did; the contract is docs/ui-lane/phyrexian-payment-contract.md.
 *
 *   blue available             both ways asked: "Island, Wastes, ..." and "Wastes, ... and 2 life"
 *   blue not available, life   the life way alone, named on the offer ("paying 2 life"), and no question
 *   life too low               the mana way alone; and neither is no offer, with the refusal saying what to do
 *   the AI                     takes the first way, the mana way: life is never its pick while mana pays
 */
import assert from "node:assert/strict";
import {legalActions, applyAction, whyNot} from "../game/engine/rules/actions.mjs";
import {awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";
import {createRng} from "../game/engine/rng.mjs";
import {phyrexianVariants, parseManaCost} from "../game/engine/rules/mana.mjs";
import {projectFor} from "../game/engine/projection.mjs";
import {housePilot} from "../game/engine/pilots/house-pilot.mjs";
import {offerDetails} from "../game/room/room.mjs";
import {decisionPath} from "../game/room/decision-path.mjs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const at = (seat, zone, ...cards) => ({seat, zone, cards});
const FIX = {Rock: {types: ["Artifact"], manaCost: "{1}", colors: []}};
const GAMBIT = "Tezzeret's Gambit", PROBE = "Gitaxian Probe", MISSTEP = "Mental Misstep", VRASKA = "Vraska, Betrayal's Sting";
/* A table's new match (pooledTaps, xTaps, phyrexianTaps) and the library of the card's own scenario. */
const play = (name, setup, more = {}) => runScenario({name, setup, steps: [], pooledTaps: true, xTaps: true, phyrexianTaps: true, library: ["Island", "Forest", "Swamp"], ...more}, index.definition, FIX).state;
/* One launched before: the same, without the key. */
const before = (name, setup) => play(name, setup, {phyrexianTaps: false});
const casts = (s, card) => legalActions(s, 0).filter((a) => a.kind === "cast" && a.label === card);
const tapped = (s) => s.zones.battlefield.filter((id) => s.objects[id].tapped).map((id) => s.objects[id].card).sort();
const onStack = (s) => s.stack.map((e) => s.objects[e.objectId]?.card);
const hand = (s) => s.zones.hand[0].map((id) => s.objects[id].card);
const rng = createRng("phyrexian-taps");
const wastes = (n) => Array(n).fill("Wastes");
/* Everyone passes until the stack is empty or a question comes up. */
const settle = (s) => { for (let n = 0; n < 50 && s.stack.length && !s.awaiting; n += 1) passPriority(s, null, rng); };

{
  /* THE DEFECT: three untapped Wastes, nothing blue. Before the key, not offered; with it, offered for the life way. */
  const old = before("gambit, before", [at(0, "battlefield", ...wastes(3)), at(0, "hand", GAMBIT)]);
  eq(casts(old, GAMBIT).length, 0, "a match launched before (no key): three untapped Wastes offer no Tezzeret's Gambit, as measured on main");

  const s = play("gambit, no blue", [at(0, "battlefield", ...wastes(3)), at(0, "hand", GAMBIT)]);
  const offers = casts(s, GAMBIT);
  eq(offers.length, 1, "three untapped Wastes, no blue: Tezzeret's Gambit is offered, once");
  eq([offers[0].autoTap, offers[0].payment.life, offers[0].payment.mana.C], [true, 2, 3], "tapping for itself, three colorless and 2 life");
  eq(offerDetails(s, 0, offers), ["tapping Wastes, Wastes, Wastes, paying 2 life"], "and the offer says so: the life is named, not hidden");
  /* Proliferate needs something to give a counter to. */
  const rock = s.zones.battlefield.length;
  ok(rock === 3, "(three lands on the table)");
  s.players[1].counters.experience = 1;
  applyAction(s, 0, offers[0]);
  eq([s.awaiting, onStack(s), tapped(s), s.players[0].life], [null, [GAMBIT], wastes(3), 38], "taken: only one way, so nothing is asked; three Wastes tapped, 2 life paid");
  settle(s);
  eq(hand(s), ["Island", "Forest"], "it resolves: two cards drawn");
  eq(s.awaiting?.kind, "effect-choice", "and it proliferates: Maya's experience counter is there to choose");
  const choice = awaitingChoice(s);
  resolveAwaiting(s, choice.options.map((o) => o.index));
  eq([s.players[1].counters.experience, s.stack.length], [2, 0], "chosen, it gets another, and the spell is done");
  eq(s.zones.graveyard[0].map((id) => s.objects[id].card), [GAMBIT], "and the spell is in the graveyard");
}
{
  /* BLUE AVAILABLE: both ways, asked. */
  const s = play("gambit, blue", [at(0, "battlefield", ...wastes(3), "Island"), at(0, "hand", GAMBIT)]);
  const [offer, ...more] = casts(s, GAMBIT);
  eq([more.length, offer.autoTap, offerDetails(s, 0, [offer])], [0, true, ["tapping what you choose"]], "three Wastes and an Island: one offer, the caster picks what pays");
  eq([offer.payment.life, offer.payment.mana.U], [0, 1], "(priced at the mana way)");
  applyAction(s, 0, offer);
  const q = awaitingChoice(s);
  eq([s.awaiting.kind, q.title, tapped(s), s.players[0].life], ["choose-cost", `${GAMBIT}: what to tap for it`, [], 40], "asked before anything is tapped or paid");
  eq(q.options.map((o) => [o.label, o.payment.life, o.payment.mana.U]),
    [["Island, Wastes, Wastes, Wastes", 0, 1], ["Wastes, Wastes, Wastes and 2 life", 2, 0], ["Wastes, Wastes, Island and 2 life", 2, 1]],
    "the {U} way first, then 2 life for the {U/P} (kept with the Island, or tapping it for the generic)");
  /* The life way: three Wastes and 2 life, the Island kept. */
  const life = structuredClone(s);
  resolveAwaiting(life, [1]);
  eq([tapped(life), life.players[0].life, onStack(life)], [wastes(3), 38, [GAMBIT]], "2 life chosen: three Wastes tapped, the Island kept, 2 life paid");
  /* The {U} way: the Island and three Wastes, no life. */
  resolveAwaiting(s, [0]);
  eq([tapped(s), s.players[0].life, onStack(s)], [["Island", ...wastes(3)], 40, [GAMBIT]], "{U} chosen: four lands tapped, no life paid");
  settle(s);
  eq(hand(s), ["Island", "Forest"], "and it draws two");
}
{
  /* LIFE TOO LOW: the mana way alone; and neither is refused with instructions. */
  const low = play("gambit, life 1, blue", [at(0, "battlefield", ...wastes(3), "Island"), at(0, "hand", GAMBIT)]);
  low.players[0].life = 1;
  const [offer] = casts(low, GAMBIT);
  eq(offerDetails(low, 0, [offer]), ["tapping Island, Wastes, Wastes, Wastes"], "1 life: the {U} way alone, named, and no question");
  applyAction(low, 0, offer);
  eq([low.awaiting, tapped(low), low.players[0].life], [null, ["Island", ...wastes(3)], 1], "taken: tapped, no life paid");
  const broke = play("gambit, life 1, no blue", [at(0, "battlefield", ...wastes(3)), at(0, "hand", GAMBIT)]);
  broke.players[0].life = 1;
  eq(casts(broke, GAMBIT).length, 0, "1 life and no blue: not offered");
  eq(whyNot(broke, 0, broke.zones.hand[0].find((id) => broke.objects[id].card === GAMBIT)),
    "It costs 4 mana ({U/P} is paid with {U} or 2 life, and you have 1 life), and you can make 3 now.",
    "and the refusal names the {U/P}, what pays it, and the life there is -- not a bare \"it costs 4\"");
  const two = play("gambit, life 2, no blue", [at(0, "battlefield", ...wastes(3)), at(0, "hand", GAMBIT)]);
  two.players[0].life = 2;
  eq(casts(two, GAMBIT).length, 1, "2 life is enough for the life way (CR 119.4: a player can pay life only if their total is at least that much)");
  applyAction(two, 0, casts(two, GAMBIT)[0]);
  eq(two.players[0].life, 0, "and the cast is made, at 0");
}
{
  /* FEWER LANDS THAN THE GENERIC: not offered, with or without the life way. */
  const s = play("gambit, two lands", [at(0, "battlefield", "Wastes", "Island"), at(0, "hand", GAMBIT)]);
  eq(casts(s, GAMBIT).length, 0, "two lands: {3} cannot be paid, whatever pays the {U/P}");
  eq(whyNot(s, 0, s.zones.hand[0].find((id) => s.objects[id].card === GAMBIT)),
    "It costs 3 mana ({U/P} is paid with {U} or 2 life, and you have 40 life), and you can make 2 now.",
    "and the refusal counts the {U/P} as the life it can be paid with: 3 mana, not 4");
  const four = play("gambit, four Wastes, life 1", [at(0, "battlefield", ...wastes(4)), at(0, "hand", GAMBIT)]);
  four.players[0].life = 1;
  eq(casts(four, GAMBIT).length, 0, "four Wastes and 1 life: the {U/P} has neither {U} nor 2 life");
  eq(whyNot(four, 0, four.zones.hand[0].find((id) => four.objects[id].card === GAMBIT)),
    "Its {U/P} is paid with {U} or 2 life: you have 1 life and nothing untapped makes {U}. Tap a source of {U}, or gain life.",
    "and the refusal says which symbol, what pays it, and what to do");
}
{
  /* GITAXIAN PROBE {U/P}: the Island is the caster's to spend or keep -- never replaced by life without asking. */
  const old = before("probe, before", [at(0, "battlefield", "Island"), at(0, "hand", PROBE)]);
  eq(casts(old, PROBE).map((a) => [a.autoTap ?? false, a.payment.life]), [[false, 2], [false, 2]], "a match launched before: Probe beside an untapped Island is offered for 2 life only (two targets)");
  const s = play("probe, island", [at(0, "battlefield", "Island"), at(0, "hand", PROBE)]);
  const offers = casts(s, PROBE);
  eq(offers.map((a) => [a.autoTap, a.payment.life]), [[true, 0], [true, 0]], "with the key: offered tapping, priced at the {U} way (one offer for each player to look at)");
  applyAction(s, 0, offers[0]);
  const q = awaitingChoice(s);
  eq(q.options.map((o) => [o.label, o.payment.life]), [["Island", 0], ["2 life", 2]], "asked: the Island, or 2 life");
  const life = structuredClone(s);
  resolveAwaiting(life, [1]);
  eq([tapped(life), life.players[0].life], [[], 38], "2 life: the Island is kept");
  resolveAwaiting(s, [0]);
  eq([tapped(s), s.players[0].life], [["Island"], 40], "the Island: no life");
  /* The AI takes the first way: mana before life. */
  const p = play("probe, pilot", [at(0, "battlefield", "Island"), at(0, "hand", PROBE)]);
  const pilot = housePilot({seat: 0, cards: () => ({manaValue: 1, types: ["Sorcery"]})});
  applyAction(p, 0, pilot.choose(projectFor(p, 0), legalActions(p, 0)));
  resolveAwaiting(p, pilot.answer(projectFor(p, 0), awaitingChoice(p)).indices);
  eq([tapped(p), p.players[0].life], [["Island"], 40], "the house pilot pays {U} with the Island: life is not its pick while mana pays");
  /* No land at all: the pool's one way, 2 life, as before. */
  const none = play("probe, no land", [at(0, "hand", PROBE)]);
  eq(casts(none, PROBE).map((a) => [a.autoTap ?? false, a.payment.life]), [[false, 2], [false, 2]], "no land: 2 life, the one way there is (unchanged)");
}
{
  /* MENTAL MISSTEP {U/P}: an instant, aimed at a spell of mana value 1. */
  const s = play("misstep", [at(0, "battlefield", "Island"), at(0, "hand", MISSTEP), at(1, "hand", PROBE), at(1, "battlefield", "Island")]);
  s.activePlayer = 1; s.priorityPlayer = 1;
  const stolen = legalActions(s, 1).find((a) => a.kind === "cast" && a.label === PROBE);
  applyAction(s, 1, stolen.autoTap ? {...stolen, tapPlan: undefined} : stolen);
  if (s.awaiting) resolveAwaiting(s, [0]);
  eq(onStack(s), [PROBE], "(Maya casts Gitaxian Probe, mana value 1)");
  s.priorityPlayer = 0;
  const offers = casts(s, MISSTEP);
  eq(offers.length > 0 && offers.every((a) => a.autoTap === true), true, "Mental Misstep is offered tapping, beside an untapped Island");
  applyAction(s, 0, offers[0]);
  eq(awaitingChoice(s).options.map((o) => [o.label, o.payment.life]), [["Island", 0], ["2 life", 2]], "the Island, or 2 life");
  const dry = play("misstep, no blue", [at(0, "hand", MISSTEP), at(1, "hand", PROBE)]);
  dry.activePlayer = 1; dry.priorityPlayer = 1;
  applyAction(dry, 1, legalActions(dry, 1).find((a) => a.kind === "cast" && a.label === PROBE));
  dry.priorityPlayer = 0;
  eq(casts(dry, MISSTEP).map((a) => [a.autoTap ?? false, a.payment.life]).slice(0, 1), [[false, 2]], "with no land at all: 2 life, the one way");
}
{
  /* Vraska, Betrayal's Sting {4}{B}{B/P}: five Swamps pay it with life; six, either way. */
  const five = play("vraska, five", [at(0, "battlefield", ...Array(5).fill("Swamp")), at(0, "hand", VRASKA)]);
  eq(offerDetails(five, 0, casts(five, VRASKA)), ["tapping Swamp, Swamp, Swamp, Swamp, Swamp, paying 2 life"], "five Swamps: {4}{B} and 2 life, the one way");
  const six = play("vraska, six", [at(0, "battlefield", ...Array(6).fill("Swamp")), at(0, "hand", VRASKA)]);
  applyAction(six, 0, casts(six, VRASKA)[0]);
  eq(awaitingChoice(six).options.map((o) => [o.payment.life, o.taps.length]), [[0, 6], [2, 5]], "six Swamps: all six, or five and 2 life");
}
{
  /* TWO PHYREXIAN SYMBOLS are told apart by how many are paid in life, not by which of two alike. */
  const cost = parseManaCost("{1}{B/P}{B/P}");
  eq(phyrexianVariants(cost, 4).map((v) => [v.life, v.paid.join(""), v.cost.symbols.map((s) => s.kind).join(",")]),
    [[0, "", "generic,colored,colored"], [2, "B", "generic,colored"], [4, "BB", "generic"]], "{B/P}{B/P}: no life, one symbol, both -- three ways");
  eq(phyrexianVariants(cost, 3).map((v) => v.life), [0, 2], "with 3 life, not both");
  eq(phyrexianVariants(parseManaCost("{W/P}{U/P}"), 2).map((v) => v.paid.join("")), ["", "U", "W"], "different colors are different choices");
  eq(phyrexianVariants(parseManaCost("{2}{G}"), 40).length, 1, "a cost with none: itself");
}
{
  /* The question carries what the board draws: the same path facts as the pool's payment question (decision-path.mjs). */
  const s = play("path", [at(0, "battlefield", ...wastes(3), "Island"), at(0, "hand", GAMBIT)]);
  const [offer] = casts(s, GAMBIT);
  applyAction(s, 0, offer);
  const q = awaitingChoice(s);
  const path = decisionPath(s, q, q.options[1], s.awaiting.action, null);
  eq(path.filter((n) => n.kind === "mana").map((n) => n.label).at(-1), "{C}{C}{C} and 2 life", "the life way's path ends in the payment: three colorless and 2 life");
}

console.log(`engine-phyrexian-taps: ${checks} checks passed`);
