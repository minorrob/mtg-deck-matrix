/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* THE PLAN'S X11, TRAIN B: "YOU MAY PAY {X}" AS IT RESOLVES, AND WHAT HALO FORAGER'S SCENARIOS CANNOT REACH.
 *
 * Halo Forager: "When this creature enters, you may pay {X}. When you do, you may cast target instant or sorcery card with
 * mana value X from a graveyard without paying its mana cost. If that spell would be put into a graveyard, exile it
 * instead." Three pieces:
 *   - unlessPays `amountX` (script/effects/asking.mjs): X the payer's to choose as it resolves (CR 107.3f), each amount
 *     their pool and plain mana sources could pay its own option, paid as any "unless" amount is -- which mana, asked when
 *     the ways differ -- and the X kept for what follows (`paidX`, script/resolution.mjs);
 *   - the reflexive trigger (immediateTrigger, CR 603.12) carrying that X to its targets (rules/trigger.mjs);
 *   - play's `exileInstead`, the spell cast so marked (rules/actions.mjs, castNow).
 * Here: the options at four players, the mana question, the targets by mana value across every graveyard, the spell's
 * mark on the stack, both pilots' answers, the schema.
 */
import assert from "node:assert/strict";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {compileScript} from "../game/engine/cards/index.mjs";
import {legalActions, applyAction} from "../game/engine/rules/actions.mjs";
import {awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";
import {parseManaCost, manaValue} from "../game/engine/rules/mana.mjs";
import {housePilot} from "../game/engine/pilots/house-pilot.mjs";
import {randomLegalPilot} from "../game/engine/pilots/random-legal.mjs";
import {projectFor} from "../game/engine/projection.mjs";
import {createRng} from "../game/engine/rng.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const rng = createRng("x11-pay-x");
const HALO = "Halo Forager", BOLT = "Lightning Bolt", WHISPER = "Night's Whisper", HARMONIZE = "Harmonize";
const FIX = {Elf: {types: ["Creature"], subtypes: ["Elf"], manaCost: "{G}", colors: ["G"], power: 1, toughness: 1, abilities: [{id: "m", kind: "mana", tapSelf: true, produces: {G: 1}}]}};
/* What the room tells the house pilot of a card (game/room/room.mjs, factsFrom). */
const facts = (name) => { const c = index.definition(name) ?? FIX[name]; return c ? {manaValue: c.manaCost ? manaValue(parseManaCost(c.manaCost)) : 0, types: c.types ?? []} : null; };
const at = (seat, zone, ...cards) => ({seat, zone, cards});
const HF_LANDS = ["Island", "Swamp", "Wastes"];
/* Halo Forager cast and resolved, its trigger resolving: the "pay {X}" question asked. */
function enters(setup, seats = 2) {
  const s = runScenario({name: "x11-pay-x", seats, setup: [at(0, "hand", HALO), at(0, "battlefield", ...HF_LANDS), ...setup],
    steps: [...HF_LANDS.map((land) => ({tap: land})), {cast: HALO}, {resolve: true}, {resolve: true}]}, index.definition, FIX).state;
  return s;
}
const labels = (s) => awaitingChoice(s).options.map((o) => o.label);
const pick = (s, label) => resolveAwaiting(s, [awaitingChoice(s).options.find((o) => o.label === label).index]);
function settle(s) { for (let n = 0; n < 50 && s.stack.length && !s.awaiting; n += 1) passPriority(s, null, rng); }

/* ---- the amounts offered: what the pool and the plain sources could pay, from {0} ---- */
{
  const s = enters([at(0, "battlefield", "Forest", "Forest", "Elf"), at(1, "graveyard", BOLT), at(2, "graveyard", WHISPER)], 4);
  const q = awaitingChoice(s);
  eq([q.id, q.title, labels(s)], [`unless:0:${s.turn}:X`, "Halo Forager: pay {X}?", ["Pay {0}", "Pay {1}", "Pay {2}", "Pay {3}", "Don't pay"]],
    "two Forests and an Elf untapped: {0} to {3}, or not at all");
  eq([housePilot({seat: 0, cards: facts}).answer(projectFor(s, 0), q).indices.map((i) => q.options[i].label)], [["Pay {2}"]],
    "the house pilot pays the most X an instant or sorcery in a graveyard has (Trey's Whisper, 2, over Maya's Bolt, 1)");
  for (let k = 0; k < 6; k += 1) ok(q.options[randomLegalPilot(createRng(`x-${k}`)).answer(q).indices[0]] !== undefined, "the random pilot one of them");
}
{
  const s = enters([at(0, "battlefield", "Forest"), at(0, "graveyard", HARMONIZE, "Elf")]);
  const q = awaitingChoice(s);
  eq([labels(s), housePilot({seat: 0, cards: facts}).answer(projectFor(s, 0), q).indices.map((i) => q.options[i].label)], [["Pay {0}", "Pay {1}", "Don't pay"], ["Don't pay"]],
    "no instant or sorcery of a value it can pay (Harmonize is 4; the Elf, 1, is a creature card): the house pilot does not pay");
}
/* ---- which mana pays it, when the ways differ: asked of the payer ---- */
{
  const s = enters([at(0, "battlefield", "Forest", "Island"), at(0, "graveyard", BOLT)]);
  pick(s, "Pay {1}");
  eq([awaitingChoice(s).title, labels(s)], ["Pay {1}: choose the mana", ["Tap Forest", "Tap Island"]], "{1} from a Forest or an Island: Rob's to choose");
  pick(s, "Tap Island");
  const island = s.zones.battlefield.filter((id) => s.objects[id].card === "Island");
  eq([island.map((id) => s.objects[id].tapped), s.zones.battlefield.find((id) => s.objects[id].card === "Forest" && !s.objects[id].tapped) !== undefined],
    [[true, true], true], "the Island he chose tapped, the Forest left");
  eq(awaitingChoice(s).options.map((o) => o.label), [BOLT], "and then the \"when you do\" asks its target: the Bolt, mana value 1");
}
/* ---- the targets: mana value exactly X, in any graveyard; the spell cast marked to be exiled ---- */
{
  const s = enters([at(0, "battlefield", "Forest", "Forest"), at(0, "graveyard", WHISPER, BOLT, HARMONIZE), at(1, "graveyard", WHISPER), at(2, "graveyard", BOLT), at(3, "graveyard", "Forest")], 4);
  pick(s, "Pay {2}");
  eq(labels(s).sort(), [WHISPER, WHISPER], "X is 2: both Night's Whispers, Rob's and Maya's -- not a Bolt (1), Harmonize (4) or a land");
  const mayas = awaitingChoice(s).options.find((o) => s.objects[o.targets[0].id].owner === 1);
  ok(mayas !== undefined, "Maya's Whisper is one of them");
  resolveAwaiting(s, [mayas.index]);
  settle(s);
  eq(labels(s), [WHISPER, "Don't cast"], "cast it, or not");
  pick(s, WHISPER);
  const entry = s.stack[s.stack.length - 1];
  eq([s.objects[entry.objectId]?.card, entry.graveyardToExile === true, entry.cast?.from], [WHISPER, true, "graveyard"], "on the stack from a graveyard, to be exiled rather than put into one");
  settle(s);
  eq([s.players[0].life, s.zones.exile.some((id) => s.objects[id].card === WHISPER && s.objects[id].owner === 1)], [38, true],
    "Rob, who cast it, draws two and loses 2; Maya's Whisper is exiled, not put back in her graveyard");
}

/* ---- the schema ---- */
const halo = (unless, play = {}) => compileScript({schema: "CrankCardScript@1",
  identity: {name: "Odd Forager", oracleId: "x", types: ["Creature"], subtypes: ["Faerie"], manaCost: "{U}", colors: ["U"], colorIdentity: ["U"], power: 1, toughness: 1},
  oracleText: "x", source: "hand", abilities: [{kind: "triggered", text: "x", trigger: {on: "enters", who: "self"}, effects: [{effect: "unlessPays", ...unless, effects: [
    {effect: "immediateTrigger", text: "x", targets: [{what: "card", zone: "graveyard", types: ["Instant"], manaValue: {exactly: "X"}}], effects: [{effect: "play", from: "targets", targets: {target: 0}, free: true, ...play}]}]}]}]}).problems;
eq(halo({amountX: true, ifPaid: true}, {exileInstead: true}), [], "you may pay {X}, then cast it and exile it instead: compiles");
for (const bad of [{amountX: true}, {amountX: true, ifPaid: true, amount: 2}, {amountX: "yes", ifPaid: true}])
  ok(halo(bad).some((p) => p.includes("You may pay {X}")), `and refuses ${JSON.stringify(bad)}`);
ok(halo({amountX: true, ifPaid: true}, {exileInstead: false}).some((p) => p.includes("exile it instead")), "and an exileInstead that is not true");

console.log(`engine-x11-pay-x: ${checks} checks passed`);
