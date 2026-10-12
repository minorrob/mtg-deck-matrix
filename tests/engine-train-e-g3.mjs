/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* TRAIN E, WAVE 3 (g3): what the scenarios of fifteen of Rob's v43 library cards cannot reach.
 *
 *   - INCUBATE (CR 701.53; Sunfall): `incubate` (script/effects/permanents.mjs), one Incubator token entering the battlefield
 *     with N +1/+1 counters -- a double-faced token (CR 111.10i), its front a colorless Incubator artifact with "{2}:
 *     Transform this token.", its back a 0/0 colorless Phyrexian artifact creature named Phyrexian Token. It transforms as a
 *     double-faced permanent does: the same object, its counters still on it (CR 712.18), and an instruction to transform it
 *     again once it has transformed since the ability was put on the stack does nothing (CR 701.27f).
 *   - THE FIRST-STRIKE DAMAGE STEP, DECIDED AS THE COMBAT DAMAGE STEP BEGINS (CR 510.4; rules/turn.mjs): a creature given
 *     first strike after blockers are declared (Stingerquill Charm, Squire's Lightblade with flash) deals its damage in that
 *     step; with every first striker gone by then, there is no such step.
 *   - "CAN ATTACK AS THOUGH IT DIDN'T HAVE DEFENDER" ONLY AS LONG AS YOU'VE SCRIED OR SURVEILLED THIS TURN (Surveillance
 *     Phantasm): who may attack, which a scenario cannot ask -- this turn's scry, not last turn's.
 *   - "MOVE X +1/+1 COUNTERS" with fewer than X there (Tester of the Tangential; CR 122.5, 609.3): those there move.
 */
import {legalActions, applyAction} from "../game/engine/rules/actions.mjs";
import {characteristicsOf} from "../game/engine/rules/layers.mjs";
import {projectFor} from "../game/engine/projection.mjs";
import {runEffect, isBuilt} from "../game/engine/script/effects/index.mjs";
import {PREDEFINED_TOKENS} from "../game/engine/script/effects/permanents.mjs";
import {moveCounters} from "../game/engine/script/effects/resources.mjs";
import {isPrimitive} from "../game/engine/vocabulary.mjs";
import {awaitingChoice} from "../game/engine/rules/turn.mjs";
import {play, drive, happen, at, idOf, checks, creature} from "./helpers/x11-keywords.mjs";

const {eq, ok, done} = checks("engine-train-e-g3");
const PHANTASM = "Surveillance Phantasm";
const FIX = {
  Duelist: creature(["Human"], 2, 2, {keywords: ["First Strike"]}), Ogre: creature(["Ogre"], 3, 3, {colors: ["R"]}),
  Peek: {types: ["Instant"], manaCost: "{U}", colors: ["U"], spell: {id: "s", text: "Scry 1.", targets: [], effects: [{effect: "scry", count: 1}]}},
};
const tokens = (s, name) => s.zones.battlefield.filter((id) => s.objects[id].token && s.objects[id].card === name);
const activations = (s, name, seat = 0) => legalActions(s, seat).filter((a) => a.kind === "activate" && s.objects[a.objectId]?.card === name);
const incubate = (s, count) => runEffect(s, {effect: "incubate", ...(count !== undefined ? {count} : {})}, {controller: 0, source: null});

/* ---- incubate and the Incubator token ---- */
{
  ok(isPrimitive("incubate") && isBuilt("incubate"), "incubate is a primitive of the catalog (§12.2), and built");
  const {Incubator} = PREDEFINED_TOKENS;
  eq([Incubator.name, Incubator.types, Incubator.subtypes, Incubator.colors, Incubator.abilities.map((a) => [a.text, a.cost, a.effects])],
    ["Incubator", ["Artifact"], ["Incubator"], [], [["{2}: Transform this token.", [{atom: "mana", cost: "{2}"}], [{effect: "setState", targets: "self", transform: true}]]]],
    "the Incubator's front face: a colorless Incubator artifact with \"{2}: Transform this token.\" (CR 111.10i)");
  eq([Incubator.back.name, Incubator.back.types, Incubator.back.subtypes, Incubator.back.colors, Incubator.back.power, Incubator.back.toughness],
    ["Phyrexian Token", ["Artifact", "Creature"], ["Phyrexian"], [], 0, 0], "its back face: a 0/0 colorless Phyrexian artifact creature named Phyrexian Token");
}
{
  const s = play([at(0, "battlefield", "Wastes", "Wastes", "Wastes", "Wastes")]);
  const events = incubate(s, 2);
  const [id] = tokens(s, "Incubator");
  const c = characteristicsOf(s, id);
  eq([tokens(s, "Incubator").length, s.objects[id].counters, s.objects[id].controller, c.types, c.subtypes, c.colors ?? [], c.power],
    [1, {"+1/+1": 2}, 0, ["Artifact"], ["Incubator"], [], null], "incubate 2: one Incubator token under Rob's control, with two +1/+1 counters -- an artifact, colorless, no creature");
  eq([s.objects[id].mdfc?.transforming, s.objects[id].mdfc?.front.card, s.objects[id].mdfc?.back.card, s.objects[id].face], [true, "Incubator", "Phyrexian Token", undefined],
    "a double-faced token, its front face up (CR 712.14)");
  const entered = events.find((e) => e.kind === "GameEventCardChangeZone" && e.data.fields.createdAsToken);
  eq(entered?.data.fields.card.name, "Incubator", "and it entered the battlefield, said so");
  eq(projectFor(s, 1).players[0].zones.Battlefield.cards.filter((card) => card.name === "Incubator").map((card) => card.counters?.["+1/+1"]), [2], "Maya sees Rob's Incubator and its two counters");

  /* {2}, twice, in answer to itself: the first transforms it, the second finds it transformed since and does nothing. */
  for (let n = 0; n < 4; n += 1) applyAction(s, 0, legalActions(s, 0).find((a) => a.kind === "activate-mana"));
  eq(activations(s, "Incubator").length, 1, "{2}: Transform this token, offered");
  applyAction(s, 0, activations(s, "Incubator")[0]);
  applyAction(s, 0, activations(s, "Incubator")[0]);
  eq(s.stack.length, 2, "activated twice, both on the stack");
  drive(s, (st) => st.stack.length === 0 && st.priorityPlayer !== null);
  const back = characteristicsOf(s, id);
  eq([s.objects[id].card, s.objects[id].face, s.objects[id].transforms, back.types, back.subtypes, back.power, back.toughness, s.objects[id].counters],
    ["Phyrexian Token", "back", 1, ["Artifact", "Creature"], ["Phyrexian"], 2, 2, {"+1/+1": 2}],
    "transformed once (CR 701.27f): the same object, a Phyrexian Token -- a 0/0 Phyrexian artifact creature with its two counters, a 2/2 (CR 712.18)");
  eq(projectFor(s, 1).players[0].zones.Battlefield.cards.filter((card) => card.name !== "Wastes").map((card) => [card.name, card.power, card.toughness]), [["Phyrexian Token", 2, 2]],
    "Maya sees a 2/2 Phyrexian Token");
  eq(activations(s, "Phyrexian Token").length, 0, "its back face has no ability to transform it back");
}
{
  const s = play([]);
  incubate(s, 0);
  incubate(s);
  eq(tokens(s, "Incubator").map((id) => s.objects[id].counters), [{}, {}], "incubate 0, or with no count: an Incubator with no counters at all");
}

/* ---- the first-strike damage step, as the combat damage step begins (CR 510.4) ---- */
const phasesTo = (s, until) => {
  const seen = [];
  drive(s, (st) => { if (seen[seen.length - 1] !== st.phase) seen.push(st.phase); return until(st); });
  return seen;
};
{
  /* The only first striker destroyed after blocks: no first-strike step, and the Ogre deals its damage in the regular one. */
  const s = play([at(0, "battlefield", "Duelist", "Bear"), at(1, "battlefield", "Ogre")], [{attack: ["Duelist", "Bear"]}, {block: [["Ogre", "Bear"]]}], {}, FIX);
  eq(s.phase, "COMBAT_DECLARE_BLOCKERS", "blockers declared, the Duelist with first strike still attacking");
  happen(s, {effect: "destroy", targets: [idOf(s, "Duelist")]}, {controller: 1, source: null});
  const seen = phasesTo(s, (st) => st.phase === "MAIN2");
  ok(!seen.includes("COMBAT_FIRST_STRIKE_DAMAGE") && seen.includes("COMBAT_DAMAGE"), `no first striker as combat damage begins: no first-strike step (${seen.join(", ")})`);
  eq([s.zones.graveyard[0].map((id) => s.objects[id].card).sort(), s.players[1].life], [["Bear", "Duelist"], 40], "the Ogre and the Bear deal their damage together in the one step: the Bear dies");
}
{
  /* First strike given after blocks: a first-strike step, the Bear's damage in it, and the Ogre dead before it strikes back. */
  const s = play([at(0, "battlefield", "Bear"), at(1, "battlefield", "Ogre")], [{attack: ["Bear"]}, {block: [["Ogre", "Bear"]]}], {}, FIX);
  happen(s, {effect: "pump", targets: [idOf(s, "Bear")], power: 1, toughness: 0, keywords: ["First Strike"]}, {controller: 0, source: null});
  const seen = phasesTo(s, (st) => st.phase === "MAIN2");
  ok(seen.includes("COMBAT_FIRST_STRIKE_DAMAGE"), `first strike given in the declare blockers step: a first-strike step (${seen.join(", ")})`);
  eq([s.zones.graveyard[1].map((id) => s.objects[id].card), s.zones.graveyard[0].length], [["Ogre"], 0], "the 3/2 Bear kills the Ogre first, and takes nothing");
}

/* ---- Surveillance Phantasm: this turn's scry or surveil ---- */
const attackersOffered = (s) => {
  drive(s, (st) => st.awaiting?.kind === "declare-attackers");
  return awaitingChoice(s).options.map((o) => o.label.split(" → ")[0]);
};
{
  const s = play([at(0, "battlefield", PHANTASM, "Bear")], [], {}, FIX);
  const offered = attackersOffered(s);
  ok(offered.includes("Bear") && !offered.includes(PHANTASM), `nothing scried or surveilled: the Bear may attack, the Phantasm may not (${offered.join(", ")})`);
}
{
  const s = play([at(0, "battlefield", PHANTASM, "Island"), at(0, "hand", "Peek")], [{tap: "Island"}, {cast: "Peek"}, {resolve: true}, {answer: []}], {}, FIX);
  ok(attackersOffered(s).includes(PHANTASM), "a scry this turn: it may attack");
}
{
  /* Surveilled on turn 1, nothing on turn 3: it may not attack on turn 3. */
  const s = play([at(0, "battlefield", PHANTASM, "Bear", "Island", "Wastes", "Wastes", "Wastes")], [{tap: "Island"}, {tap: "Wastes"}, {tap: "Wastes"}, {tap: "Wastes"},
    {activate: PHANTASM}, {resolve: true}, {answer: []}, {to: {turn: 3, phase: "MAIN1"}}], {}, FIX);
  const offered = attackersOffered(s);
  ok(offered.includes("Bear") && !offered.includes(PHANTASM), `surveilled on Rob's last turn, not this one: it may not attack (${offered.join(", ")})`);
}

/* ---- moveCounters: as many as there are (CR 122.5, 609.3) ---- */
{
  const s = play([at(0, "battlefield", "Tester of the Tangential", "Bear")], [], {}, FIX);
  const tester = idOf(s, "Tester of the Tangential"), bear = idOf(s, "Bear");
  s.objects[tester].counters["+1/+1"] = 2;
  moveCounters(s, {from: [tester], targets: [bear], counter: "+1/+1", count: 5}, {controller: 0});
  eq([s.objects[tester].counters["+1/+1"], s.objects[bear].counters["+1/+1"]], [0, 2], "five asked of two there: the two move");
  const events = moveCounters(s, {from: [tester], targets: [bear], counter: "+1/+1", count: 1}, {controller: 0});
  eq([events, s.objects[tester].counters["+1/+1"], s.objects[bear].counters["+1/+1"]], [[], 0, 2], "none left: nothing moves, nothing said");
}

done("incubate and the Incubator token (CR 701.53, 111.10i, 701.27f, 712.18), the first-strike damage step as combat damage begins (CR 510.4), Surveillance Phantasm's attack, and counters moved as many as there are (CR 609.3)");
