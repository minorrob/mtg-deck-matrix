/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* THE PLAN'S X11: A PLAYER LEAVES THE GAME, EVERYTHING OF THEIRS WITH THEM (CR 800.4a).
 *
 * rules/sba.mjs, removePlayerFromBoard -- the one path every loss and concession takes -- and what follows it:
 *   - every object they own leaves the game, in every zone: battlefield, hand, library, graveyard, command, exile, the
 *     stack, and phased out (CR 702.26k, with no zone-change ability triggering); nothing is said of each, so a hand and a
 *     library stay hidden as they go;
 *   - on the stack, a spell whose card is theirs leaves and an ability they control ceases to exist; one that was
 *     resolving takes the rest of its resolution and its question with it, and priority goes on as after a resolution
 *     (CR 117.3b, 800.4j; rules/sba.mjs, concede);
 *   - every effect giving them control ends (tests/engine-x11-permissions.mjs), then whatever they still control is
 *     exiled: a permanent, a phased-out one, and a spell of another's card they were let cast;
 *   - a permanent that phased out under their control, and is now another's, phases in at the untap step after their next
 *     turn would have begun (CR 702.26n; rules/turn.mjs);
 *   - and what effects were tracking for them goes as the rules say: their delayed trigger is never put on the stack
 *     (800.4d), their permanent's "until this leaves" exile returns its card to its owner (610.3c).
 * Four players throughout.
 */
import assert from "node:assert/strict";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {legalActions, applyAction} from "../game/engine/rules/actions.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";
import {advance, awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {concede} from "../game/engine/rules/sba.mjs";
import {runEffects} from "../game/engine/script/effects/index.mjs";
import {addObject, PER_PLAYER} from "../game/engine/state/index.mjs";
import {projectFor} from "../game/engine/projection.mjs";
import {historyLines} from "../game/room/history.mjs";
import {createRng} from "../game/engine/rng.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const rng = createRng("x11-leave");
const FIX = {
  Bear: {types: ["Creature"], subtypes: ["Bear"], manaCost: "{1}{G}", colors: ["G"], power: 2, toughness: 2},
  "Secret Bear": {types: ["Creature"], subtypes: ["Bear"], manaCost: "{1}{G}", colors: ["G"], power: 2, toughness: 2},
  "Secret Ox": {types: ["Creature"], subtypes: ["Ox"], manaCost: "{3}{W}", colors: ["W"], power: 2, toughness: 4},
  "Phased Relic": {types: ["Artifact"], manaCost: "{1}"},
  Relic: {types: ["Artifact"], manaCost: "{1}"},
  "Rob's Commander": {types: ["Creature"], supertypes: ["Legendary"], subtypes: ["Human"], manaCost: "{2}{W}", colors: ["W"], power: 2, toughness: 2},
  Spark: {types: ["Instant"], manaCost: "{R}", colors: ["R"]},
};
const NAMES = ["Rob", "Maya", "Trey", "Sam"];
const at = (seat, zone, ...cards) => ({seat, zone, cards});
const scene = (setup, steps = [], seats = 4) => runScenario({name: "x11-leave", seats, setup, steps}, index.definition, FIX).state;
const idOf = (s, card, seat) => Object.values(s.objects).find((o) => o.card === card && o.owner === seat)?.id;
const owned = (s, seat) => Object.values(s.objects).filter((o) => o.owner === seat);
const counts = (s, seat) => Object.fromEntries([...PER_PLAYER.map((z) => [z, s.zones[z][seat].length]),
  ["battlefield", s.zones.battlefield.filter((id) => s.objects[id].owner === seat).length], ["exile", s.zones.exile.filter((id) => s.objects[id].owner === seat).length]]);
/* Every listed object exists and says where it is; every object is listed once (the conformance suite's invariant). */
function zonesHold(s, label) {
  const where = new Map();
  for (const [zone, lists] of Object.entries(s.zones)) for (const list of PER_PLAYER.includes(zone) ? lists : [lists])
    for (const id of list) { assert.ok(!where.has(id) && s.objects[id]?.zone === zone, `${label}: object ${id} in ${zone}`); where.set(id, zone); }
  for (const id of s.phasedOut ?? []) { assert.ok(!where.has(id) && s.objects[id]?.zone === "phased", `${label}: phased ${id}`); where.set(id, "phased"); }
  eq(where.size, Object.keys(s.objects).length, `${label}: every object is in one place, and nothing is left of what left`);
}
function playUntil(s, done, limit = 4000) {
  for (let n = 0; n < limit; n += 1) {
    if (done(s)) return;
    if (s.awaiting) {
      const choice = awaitingChoice(s);
      resolveAwaiting(s, s.awaiting.kind === "order-triggers" ? choice.options.map((o) => o.index) : choice.options.slice(0, choice.min ?? 0).map((o) => o.index));
    } else if (s.priorityPlayer === null) advance(s);
    else if (passPriority(s, null, rng).outcome === "step-ends") advance(s);
  }
  throw new Error("never got there");
}
const turnOf = (s, turn) => playUntil(s, (x) => x.turn === turn && x.phase === "MAIN1" && x.priorityPlayer !== null && !x.awaiting);

/* ---- every zone ---- */
{
  const s = scene([at(0, "hand", "Secret Bear", "Secret Ox"), at(0, "graveyard", "Spark"), at(0, "exile", "Bear"), at(0, "command", "Rob's Commander"),
    at(0, "battlefield", "Relic", "Phased Relic"), at(1, "hand", "Bear"), at(1, "graveyard", "Spark"), at(1, "exile", "Bear"), at(1, "battlefield", "Bear")]);
  runEffects(s, [{effect: "phaseOut", targets: [idOf(s, "Phased Relic", 0)]}], {controller: 0, source: null});
  const mayas = counts(s, 1);
  eq(counts(s, 0), {library: 19, hand: 3, graveyard: 1, command: 1, battlefield: 1, exile: 1}, "four players: Rob has cards in every zone (his turn-1 draw in hand), and a permanent phased out");
  eq(projectFor(s, 1).players[0].zones.Hand.cards.map((c) => c.name), [], "Maya cannot see Rob's hand");
  const events = concede(s, 0);
  eq(owned(s, 0), [], "Rob concedes: nothing he owns is left anywhere -- library, hand, graveyard, command zone, exile, battlefield, phased out");
  eq(counts(s, 1), mayas, "and nothing of Maya's has moved");
  zonesHold(s, "after Rob left");
  const said = JSON.stringify(events);
  ok(!["Secret Bear", "Secret Ox", "Phased Relic"].some((name) => said.includes(name)), "nothing said names a card of his hand, or the phased-out one (CR 702.26k)");
  eq(events.flatMap((e) => historyLines(e, NAMES)).map((l) => l.text), ["Rob lost the game (conceded)"], "the history says only that he left");
  eq([projectFor(s, 1).players[0].zones.Hand.count, projectFor(s, 1).players[0].zones.Library.count], [0, 0], "and Maya's view shows his hand and library empty");
}

/* ---- the stack ---- */
{
  /* His spell, held up while Trey has priority: it leaves the game with him; priority stays with Trey. */
  const s = scene([at(0, "battlefield", "Mountain"), at(0, "hand", "Lightning Bolt")], [{tap: "Mountain"}, {cast: "Lightning Bolt", targets: [{player: 1}]}, {pass: 2}]);
  eq([s.stack.map((e) => e.name), s.priorityPlayer], [["Lightning Bolt"], 2], "Rob's Lightning Bolt at Maya on the stack, Trey to act");
  concede(s, 0);
  eq([s.stack.length, idOf(s, "Lightning Bolt", 0), s.priorityPlayer], [0, undefined, 2], "Rob concedes: the Bolt leaves the game with him, and Trey still holds priority");
  playUntil(s, (x) => x.turn === 2);
  eq(s.players[1].life, 40, "the turn ends: Maya was never dealt the 3");
}
{
  /* His ability: it ceases to exist; what it aimed at stays. */
  const s = scene([at(0, "battlefield", "Scavenging Ooze", "Forest"), at(1, "graveyard", "Spark")],
    [{tap: "Forest"}, {activate: "Scavenging Ooze", targets: [{card: "Spark"}]}, {pass: 1}]);
  eq(s.stack.map((e) => [e.kind, e.objectId]), [["ability", null]], "Rob's Ooze ability on the stack, aimed at Maya's Spark");
  concede(s, 0);
  eq([s.stack.length, s.zones.graveyard[1].map((id) => s.objects[id].card)], [0, ["Spark"]], "Rob concedes: the ability is gone, and the Spark stays in Maya's graveyard");
}
{
  /* A spell he controls whose card is Maya's (cast from her exile by an effect's leave): exiled, hers. */
  const s = scene([at(0, "battlefield", "Mountain"), at(1, "exile", "Lightning Bolt")]);
  runEffects(s, [{effect: "mayPlay", targets: [idOf(s, "Lightning Bolt", 1)], until: "ever"}], {controller: 0, source: null});
  applyAction(s, 0, legalActions(s, 0).find((a) => a.kind === "activate-mana" && a.label === "Mountain"));
  applyAction(s, 0, legalActions(s, 0).find((a) => a.kind === "cast" && a.label === "Lightning Bolt" && a.targets?.[0]?.kind === "player" && a.targets[0].id === 2));
  eq([s.stack.map((e) => [e.name, e.playerId]), s.objects[s.stack[0].objectId].owner], [[["Lightning Bolt", 0]], 1], "Rob casts Maya's Bolt from her exile at Trey");
  concede(s, 0);
  eq([s.stack.length, s.zones.exile.map((id) => [s.objects[id].card, s.objects[id].owner])], [0, [["Lightning Bolt", 1]]], "Rob concedes: the spell he controlled is exiled, Maya's card");
  zonesHold(s, "after the exile");
}
{
  /* His ability resolving and asking him (Eternal Witness's "you may"): it goes with him, the question with it, and priority
     passes as after a resolution -- the active player gone, to Maya (CR 117.3b, 800.4j). Play goes on. */
  const steps = [{tap: "Forest"}, {tap: "Forest"}, {tap: "Wastes"}, {cast: "Eternal Witness"}, {resolve: true}, {choose: ["Spark"]}, {pass: 4}];
  const s = scene([at(0, "battlefield", "Forest", "Forest", "Wastes"), at(0, "hand", "Eternal Witness"), at(0, "graveyard", "Spark")], steps);
  eq([s.awaiting?.kind, s.awaiting?.player, s.stack.map((e) => e.stage)], ["effect-choice", 0, ["resolving"]], "Witness's trigger resolving, asking Rob");
  concede(s, 0);
  eq([s.stack.length, Boolean(s.resolving), s.awaiting, s.priorityPlayer], [0, false, null, 1], "Rob concedes: the trigger is gone, its resolution and its question with it, and Maya has priority");
  turnOf(s, 2);
  eq([s.activePlayer, s.players[0].lost], [1, true], "and the game goes on: Maya's turn");
  /* Two players: Rob conceding ends the game, and nobody is given priority. */
  const two = scene([at(0, "battlefield", "Forest", "Forest", "Wastes"), at(0, "hand", "Eternal Witness"), at(0, "graveyard", "Spark")], [...steps.slice(0, -1), {pass: 2}], 2);
  concede(two, 0);
  eq([two.stack.length, two.priorityPlayer], [0, null], "two players: the game is over, and nobody holds priority");
}
{
  /* His spell resolving and asking another: Mana Leak's "unless its controller pays {3}" asked of Maya on her turn. It
     goes with him, Maya's question is withdrawn, and her Bolt is still there to resolve. And the same for Maya's own Mana
     Leak card that Rob was let cast from her exile: exiled, its question withdrawn too. */
  for (const whose of [0, 1]) {
    const setup = [at(0, "battlefield", "Island", "Wastes"), at(1, "battlefield", "Mountain"), at(1, "hand", "Lightning Bolt"),
      whose === 0 ? at(0, "hand", "Mana Leak") : at(1, "exile", "Mana Leak")];
    const s = scene(setup, [{to: {turn: 2, phase: "MAIN1"}}, {tap: "Mountain", seat: 1}, {cast: "Lightning Bolt", seat: 1, targets: [{player: 2}]}, {pass: 3}]);
    if (whose === 1) runEffects(s, [{effect: "mayPlay", targets: [idOf(s, "Mana Leak", 1)], until: "ever"}], {controller: 0, source: null});
    for (const land of ["Island", "Wastes"]) applyAction(s, 0, legalActions(s, 0).find((a) => a.kind === "activate-mana" && a.label === land));
    applyAction(s, 0, legalActions(s, 0).find((a) => a.kind === "cast" && a.label === "Mana Leak"));
    playUntil(s, (x) => x.awaiting?.kind === "effect-choice");
    eq([s.awaiting.player, s.stack.map((e) => e.name)], [1, ["Lightning Bolt", "Mana Leak"]], `${whose ? "Maya's" : "Rob's"} Mana Leak asks Maya whether she pays {3}`);
    concede(s, 0);
    eq([s.stack.map((e) => e.name), s.awaiting, Boolean(s.resolving), s.priorityPlayer], [["Lightning Bolt"], null, false, 1], "Rob concedes: the Leak is gone, Maya's question withdrawn, Maya to act on her own turn");
    eq(s.zones.exile.filter((id) => s.objects[id].card === "Mana Leak").map((id) => s.objects[id].owner), whose === 1 ? [1] : [], whose === 1 ? "Maya's Leak card, exiled" : "and nothing of his is left in exile");
    playUntil(s, (x) => x.stack.length === 0);
    eq(s.players[2].life, 37, "Maya's Bolt resolves: Trey at 37");
  }
}

{
  /* The active player gone already (CR 800.4j): Rob concedes on his own turn, the turn goes on, and Maya's Mana Leak is
     asking Trey about his Bolt when she concedes too -- priority passes over both, to Trey. */
  const s = scene([at(1, "battlefield", "Island", "Wastes"), at(1, "hand", "Mana Leak"), at(2, "battlefield", "Mountain"), at(2, "hand", "Lightning Bolt")]);
  concede(s, 0);
  passPriority(s, null, rng);
  eq([s.activePlayer, s.priorityPlayer], [0, 2], "Rob concedes on his turn; it goes on without him, Trey to act");
  applyAction(s, 2, legalActions(s, 2).find((a) => a.kind === "activate-mana" && a.label === "Mountain"));
  applyAction(s, 2, legalActions(s, 2).find((a) => a.kind === "cast" && a.label === "Lightning Bolt" && a.targets?.[0]?.kind === "player" && a.targets[0].id === 3));
  playUntil(s, (x) => x.priorityPlayer === 1);
  for (const land of ["Island", "Wastes"]) applyAction(s, 1, legalActions(s, 1).find((a) => a.kind === "activate-mana" && a.label === land));
  applyAction(s, 1, legalActions(s, 1).find((a) => a.kind === "cast" && a.label === "Mana Leak"));
  playUntil(s, (x) => x.awaiting?.kind === "effect-choice");
  eq(s.awaiting.player, 2, "Maya's Mana Leak asks Trey");
  concede(s, 1);
  eq([s.stack.map((e) => e.name), s.awaiting, s.priorityPlayer], [["Lightning Bolt"], null, 2], "Maya concedes: her Leak is gone, and priority skips Rob and her, to Trey");
}

/* ---- phased out ---- */
{
  /* Maya's Bear, Rob's for good, phased out under him: the change ends with him, and it phases in -- Maya's -- at the untap
     step after his next turn would have begun, turn 5's, not before (CR 702.26n). Maya's Ox, under Rob's control from the
     start and phased out, is exiled (800.4a). */
  const s = scene([at(1, "battlefield", "Bear")]);
  const bear = idOf(s, "Bear", 1);
  runEffects(s, [{effect: "gainControl", targets: [bear]}], {controller: 0, source: null});
  const ox = addObject(s, {...FIX["Secret Ox"], card: "Secret Ox", owner: 1, controller: 0}, "battlefield");
  runEffects(s, [{effect: "phaseOut", targets: [bear, ox]}], {controller: 0, source: null});
  concede(s, 0);
  eq([s.objects[bear].zone, s.objects[bear].controller], ["phased", 1], "Rob concedes: the Bear is Maya's again, still phased out");
  eq(s.zones.exile.map((id) => [s.objects[id].card, s.objects[id].owner]), [["Secret Ox", 1]], "and the Ox, his by default, is exiled");
  for (const turn of [2, 3, 4]) { turnOf(s, turn); eq(s.objects[bear].zone, "phased", `turn ${turn}: still phased out`); }
  turnOf(s, 5);
  eq([s.objects[bear].zone, s.objects[bear].controller, s.activePlayer], ["battlefield", 1, 1], "turn 5, past Rob's seat: phased in, Maya's, on her turn");
}

/* ---- what effects were tracking for him ---- */
{
  /* His delayed trigger -- "return it at the beginning of the next end step" -- is never put on the stack (800.4d): Maya's
     Bear stays exiled. His permanent's "until this leaves" exile, though, returns Trey's Bear to Trey (610.3, 610.3c). */
  const s = scene([at(0, "battlefield", "Relic"), at(1, "battlefield", "Bear"), at(2, "battlefield", "Bear")]);
  runEffects(s, [{effect: "moveZone", targets: [idOf(s, "Bear", 1)], to: "exile", andReturn: "end step"}], {controller: 0, source: null});
  runEffects(s, [{effect: "exileUntil", targets: [idOf(s, "Bear", 2)], until: "this leaves"}], {controller: 0, source: idOf(s, "Relic", 0)});
  eq(s.zones.exile.map((id) => s.objects[id].owner).sort(), [1, 2], "Rob exiled Maya's Bear until the end step, and Trey's until his Relic leaves");
  concede(s, 0);
  eq([s.zones.battlefield.filter((id) => s.objects[id].card === "Bear").map((id) => s.objects[id].controller)], [[2]], "Rob concedes: his Relic leaves, and Trey's Bear returns to Trey");
  playUntil(s, (x) => x.turn === 2);
  eq(s.zones.exile.map((id) => s.objects[id].owner), [1], "the end step passes: Rob's delayed trigger never goes on the stack, and Maya's Bear stays exiled");
}

console.log(`engine-x11-leave: ${checks} checks passed -- a player leaving the game takes everything they own from every zone, the stack and phasing, unseen; their spells leave and abilities cease, a resolution cut short passing priority on; what they still control is exiled; a permanent phased out under them phases in after their turn would have begun; their delayed trigger never goes on the stack, and their "until this leaves" exile returns.`);
