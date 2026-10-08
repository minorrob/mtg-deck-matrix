/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* THE PLAN'S X11, TRAIN B: CONTROL, ATTACK REQUIREMENTS AND A GRAVEYARD COUNT -- WHAT THE CARDS' SCENARIOS CANNOT REACH,
 * AND WHAT CONTROL DOES WHEN A PLAYER LEAVES THE GAME.
 *
 * Four of Rob's decks' cards, each with the engine piece it lacked:
 *   - "If a card left your graveyard this turn" (Primary Research, Relic Retriever): the count `cardsLeftGraveyardThisTurn`,
 *     kept per graveyard as each card leaves (state/index.mjs), cleared as a turn begins (rules/turn.mjs); a token is no
 *     card (CR 108.2b).
 * *   - "Gain control of target creature for as long as this creature remains on the battlefield" (Sower of Temptation):
 *     gainControl `until: "this leaves"`, nothing at all if Sower has already gone (CR 611.2b), ended as Sower leaves the
 *     battlefield however it goes; and every control change for a while now ends in layer 2's timestamp order (CR 613.7):
 *     a later change still holding the permanent keeps it (effects/permanents.mjs, endControlChange).
 *   - A player leaving the game (CR 800.4a; rules/sba.mjs): every effect giving them control of an object ends, for good
 *     ones too -- so every change leaves its record -- the permanent going where the changes still in effect would have it;
 *     what they control still is exiled; and a change ending later that would return a permanent to a player who has left
 *     exiles it instead (800.4c).
 *   - Mentor (CR 702.134a) compiled from the keyword, and "that token ... attacks this combat if able" (Legion Warboss): an
 *     effect read with the statics' "attacks each combat if able" (rules/statics.mjs), refused with instructions when a
 *     declaration leaves the token home, met by both pilots, and for this combat alone (CR 508.1d).
 * Three and four players throughout, and each construct's credit. (Maralen, Fae Ascendant, of the same batch, is another
 * session's: its linked-exile casting is built there.)
 */
import assert from "node:assert/strict";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {compileScript} from "../game/engine/cards/index.mjs";
import {validateScript} from "../game/engine/script/schema.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";
import {advance, awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {attackers} from "../game/engine/rules/combat.mjs";
import {attacksEachCombat} from "../game/engine/rules/statics.mjs";
import {concede, checkStateBasedActions} from "../game/engine/rules/sba.mjs";
import {summoningSick} from "../game/engine/keywords/timing.mjs";
import {runEffects} from "../game/engine/script/effects/index.mjs";
import {moveOne} from "../game/engine/script/effects/zones.mjs";
import {amountOf, amountProblems} from "../game/engine/script/amount.mjs";
import {addObject} from "../game/engine/state/index.mjs";
import {housePilot} from "../game/engine/pilots/house-pilot.mjs";
import {randomLegalPilot} from "../game/engine/pilots/random-legal.mjs";
import {projectFor} from "../game/engine/projection.mjs";
import {createRng} from "../game/engine/rng.mjs";
import {missingFor, keywordBuilt, FORGE_COUNTS} from "../game/tools/engine-constructs.mjs";
import {readFileSync} from "node:fs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };
const throws = (fn, re, m) => { assert.throws(fn, re, m); checks += 1; };

const index = loadCardIndex();
const rng = createRng("x11-permissions");
const SOWER = "Sower of Temptation", WARBOSS = "Legion Warboss";
const FIX = {
  Bear: {types: ["Creature"], subtypes: ["Bear"], manaCost: "{1}{G}", colors: ["G"], power: 2, toughness: 2},
  Sprite: {types: ["Creature"], subtypes: ["Faerie"], manaCost: "{U}", colors: ["U"], power: 1, toughness: 1},
  Spark: {types: ["Instant"], manaCost: "{R}", colors: ["R"]},
};
const at = (seat, zone, ...cards) => ({seat, zone, cards});
const table = (setup, seats = 2, library = []) => runScenario({name: "x11-permissions", seats, library, setup, steps: []}, index.definition, FIX).state;
const idOf = (s, card, seat = 0, zone = "battlefield") => (zone === "battlefield" ? s.zones.battlefield : zone === "exile" ? s.zones.exile : s.zones[zone][seat])
  .find((id) => s.objects[id].card === card && (zone !== "battlefield" || s.objects[id].controller === seat));
const controls = (s, seat) => s.zones.battlefield.filter((id) => s.objects[id].controller === seat).map((id) => s.objects[id].card).sort();
/* On, as the room plays: questions answered with their least, triggers in the order offered, until `done` says stop. */
function playUntil(s, done, limit = 3000) {
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
const resolveTop = (s) => { const top = s.stack.at(-1).stackId; playUntil(s, (x) => !x.stack.some((e) => e.stackId === top) || x.awaiting); };

/* ---------------------------------------------------------------------------------------------------------------------
 * "IF A CARD LEFT YOUR GRAVEYARD THIS TURN": counted per graveyard, cards only, from none each turn.
 * ------------------------------------------------------------------------------------------------------------------- */
{
  const s = table([at(0, "graveyard", "Spark", "Bear"), at(2, "graveyard", "Spark")], 4);
  const left = (seat) => amountOf(s, {cardsLeftGraveyardThisTurn: "you"}, {controller: seat});
  eq([0, 1, 2, 3].map(left), [0, 0, 0, 0], "four players, nothing has left a graveyard yet");
  moveOne(s, idOf(s, "Spark", 0, "graveyard"), "exile", []);
  moveOne(s, idOf(s, "Bear", 0, "graveyard"), "hand", [], {owner: 0});
  moveOne(s, idOf(s, "Spark", 2, "graveyard"), "library", [], {owner: 2});
  eq([0, 1, 2, 3].map(left), [2, 0, 1, 0], "two of Rob's cards left his graveyard (to exile and to his hand), one of Trey's: each counted for its own graveyard");
  const token = addObject(s, {card: "Goblin", types: ["Creature"], token: true, owner: 3, controller: 3}, "graveyard", 3);
  moveOne(s, token, "exile", []);
  eq(left(3), 0, "a token leaving Sam's graveyard is no card leaving it (CR 108.2b)");
  eq(amountOf(s, {cardsLeftGraveyardThisTurn: "that player"}, {controller: 0, about: {player: 2}}), 1, "\"that player\": Trey's count");
  playUntil(s, (x) => x.turn === 2 && x.phase === "MAIN1" && x.priorityPlayer !== null);
  eq([0, 1, 2, 3].map(left), [0, 0, 0, 0], "a new turn: every player's count from none");
  ok(amountProblems({cardsLeftGraveyardThisTurn: "opponent"}).length > 0, "the count is \"you\" or \"that player\": an opponent's is refused");
}

/* ---------------------------------------------------------------------------------------------------------------------
 * SOWER OF TEMPTATION: control for as long as it remains, and control changes ending in timestamp order (CR 613.7).
 * ------------------------------------------------------------------------------------------------------------------- */
const sowerTakes = (s, sower, target) => runEffects(s, [{effect: "gainControl", targets: [target], until: "this leaves"}], {controller: 0, source: sower});
const loan = (s, target, to) => runEffects(s, [{effect: "gainControl", targets: [target], until: "end-of-turn"}], {controller: to, source: null});
const toCleanup = (s) => playUntil(s, (x) => x.turn === 2 && x.priorityPlayer !== null && !x.awaiting);
{
  /* Rob's Sower takes Maya's Bear; Trey takes it until end of turn; the Sower dies: Trey's change is later and still holds
     it, so it stays his -- and as the turn ends, it goes where the Sower's would have sent it: to Maya. */
  const s = table([at(0, "battlefield", SOWER), at(1, "battlefield", "Bear")], 4);
  const sower = idOf(s, SOWER), bear = idOf(s, "Bear", 1);
  sowerTakes(s, sower, bear);
  loan(s, bear, 2);
  eq(s.objects[bear].controller, 2, "four players: Rob's Sower took Maya's Bear, then Trey took it until end of turn: Trey's");
  runEffects(s, [{effect: "destroy", targets: [sower]}], {controller: 1, source: null});
  eq(s.objects[bear].controller, 2, "the Sower dies: Trey's later change still holds the Bear");
  toCleanup(s);
  eq(s.objects[bear].controller, 1, "the turn over: back to Maya, never to Rob");
  eq((s.effects ?? []).filter((e) => e.rule === "control-returns").length, 0, "and every control record spent");
}
{
  /* The other order: Trey's loan first, then Rob's Sower takes it from Trey. The turn ending does not take it from Rob --
     the Sower's change is later -- and when the Sower leaves, the Bear goes to Maya, whose it was before either. */
  const s = table([at(0, "battlefield", SOWER), at(1, "battlefield", "Bear")], 4);
  const sower = idOf(s, SOWER), bear = idOf(s, "Bear", 1);
  loan(s, bear, 2);
  sowerTakes(s, sower, bear);
  toCleanup(s);
  eq(s.objects[bear].controller, 0, "Trey's loan ends as the turn does, but Rob's Sower took it after: still Rob's");
  moveOne(s, sower, "hand", [], {owner: 0});
  eq(s.objects[bear].controller, 1, "the Sower returned to Rob's hand: the Bear is Maya's, not Trey's");
  eq([s.activePlayer, summoningSick(s, bear)], [1, true], "and, back under her control during her own turn, summoning sick for Maya (CR 302.6)");
  playUntil(s, (x) => x.turn === 6 && x.phase === "MAIN1" && x.priorityPlayer === 1 && !x.awaiting);
  eq(summoningSick(s, bear), false, "Maya's next turn: hers since it began, and ready");
}
{
  /* Rob takes Maya's Bear until end of turn, and Maya's own Sower takes it back: from then on it is Maya's, and when her
     Sower leaves on her next turn, nothing changes hands -- she has had it since before her turn began, so it is not
     summoning sick (CR 302.6). */
  const s = table([at(1, "battlefield", "Bear", SOWER)], 4);
  const bear = idOf(s, "Bear", 1), mayas = idOf(s, SOWER, 1);
  loan(s, bear, 0);
  runEffects(s, [{effect: "gainControl", targets: [bear], until: "this leaves"}], {controller: 1, source: mayas});
  toCleanup(s);
  eq([s.activePlayer, s.objects[bear].controller, summoningSick(s, bear)], [1, 1, false], "Maya's turn: her Bear, hers since Rob's turn, ready");
  moveOne(s, mayas, "hand", [], {owner: 1});
  eq([s.objects[bear].controller, summoningSick(s, bear)], [1, false], "her Sower leaves: the Bear stays hers, and still ready");
}
{
  /* For good, after a loan: later, and never ending, so the loan's end gives nothing back. */
  const s = table([at(1, "battlefield", "Bear")], 3);
  const bear = idOf(s, "Bear", 1);
  loan(s, bear, 2);
  runEffects(s, [{effect: "gainControl", targets: [bear]}], {controller: 0, source: null});
  toCleanup(s);
  eq(s.objects[bear].controller, 0, "Trey's loan, then Rob gains it for good: Rob's after the turn ends");
}
{
  /* The Bear leaves while the Sower holds it: a new object (CR 400.7), its records spent; the Sower leaving later gives
     nothing back. The Sower changing hands does not end its effect: it still remains on the battlefield. */
  const s = table([at(0, "battlefield", SOWER), at(1, "battlefield", "Bear", "Bear")], 3);
  const sower = idOf(s, SOWER), [first, second] = s.zones.battlefield.filter((id) => s.objects[id].card === "Bear");
  sowerTakes(s, sower, first);
  sowerTakes(s, sower, second);
  runEffects(s, [{effect: "destroy", targets: [first]}], {controller: 1, source: null});
  eq([s.zones.graveyard[1].map((id) => s.objects[id].card), (s.effects ?? []).filter((e) => e.rule === "control-returns").length], [["Bear"], 1],
    "one stolen Bear destroyed: to Maya's graveyard, and only the other's record left");
  runEffects(s, [{effect: "gainControl", targets: [sower]}], {controller: 2, source: null});
  eq([s.objects[sower].controller, s.objects[second].controller], [2, 0], "Trey takes the Sower for good: the Bear stays Rob's, the Sower still on the battlefield");
  runEffects(s, [{effect: "destroy", targets: [sower]}], {controller: 1, source: null});
  eq(controls(s, 1), ["Bear"], "the Sower destroyed: the Bear back with Maya");
}
{
  /* The Sower's controller leaves the game (CR 800.4a): the Sower, his, leaves with him, and the Bear goes back. */
  const s = table([at(0, "battlefield", SOWER), at(1, "battlefield", "Bear")], 4);
  const sower = idOf(s, SOWER), bear = idOf(s, "Bear", 1);
  sowerTakes(s, sower, bear);
  concede(s, 0);
  eq([s.objects[sower], s.objects[bear].controller], [undefined, 1], "Rob concedes: his Sower leaves the game with him, and Maya has her Bear");
}
{
  /* Its source already gone: the duration never starts, and nothing changes hands (CR 611.2b). */
  const s = table([at(1, "battlefield", "Bear")], 2);
  const bear = idOf(s, "Bear", 1);
  runEffects(s, [{effect: "gainControl", targets: [bear], until: "this leaves"}], {controller: 0, source: null});
  eq([s.objects[bear].controller, (s.effects ?? []).length], [1, 0], "no source on the battlefield: the Bear stays Maya's, and no record is made");
  ok(validateScript({schema: "CrankCardScript@1", identity: {name: "Test", oracleId: "t", types: ["Sorcery"], manaCost: "{1}"}, oracleText: "x",
    abilities: [{kind: "spell", text: "x", targets: [{what: "permanent", types: ["Creature"]}], effects: [{effect: "gainControl", targets: {target: 0}, until: "end-of-combat"}]}]})
    .errors.some((e) => e.path.endsWith(".until")), "a control duration the engine does not end is refused");
}

/* ---------------------------------------------------------------------------------------------------------------------
 * A PLAYER LEAVES THE GAME (CR 800.4a): every effect giving them control of an object ends -- for good, for the turn, for
 * as long as -- the permanent going where the changes still in effect, in timestamp order, would have it (CR 613.7);
 * whatever they control still is exiled; and a change ending later that would give it back to them exiles it (800.4c).
 * ------------------------------------------------------------------------------------------------------------------- */
const takeForGood = (s, target, by) => runEffects(s, [{effect: "gainControl", targets: [target]}], {controller: by, source: null});
const records = (s) => (s.effects ?? []).filter((e) => e.rule === "control-returns").length;
const bearOf = (s, owner) => idOf(s, "Bear", owner);
{
  /* For good, for the turn, and for as long as a Sower Rob does not own remains: Rob concedes, and each ends. */
  const s = table([at(1, "battlefield", "Bear", "Bear", "Bear"), at(2, "battlefield", SOWER)], 4);
  const [kept, lent, sown] = s.zones.battlefield.filter((id) => s.objects[id].card === "Bear"), sower = idOf(s, SOWER, 2);
  takeForGood(s, kept, 0);
  loan(s, lent, 0);
  takeForGood(s, sower, 0);
  runEffects(s, [{effect: "gainControl", targets: [sown], until: "this leaves"}], {controller: 0, source: sower});
  eq(controls(s, 0), ["Bear", "Bear", "Bear", SOWER], "four players: Rob has Maya's three Bears -- for good, for the turn, by Trey's Sower -- and the Sower");
  concede(s, 0);
  eq([controls(s, 1), controls(s, 2)], [["Bear", "Bear", "Bear"], [SOWER]], "Rob concedes: every change giving him control ends at once -- the Bears are Maya's, the Sower Trey's again, still on the battlefield");
  eq(records(s), 0, "and every record spent");
}
{
  /* Losing is leaving too: Rob at 0 life, the state-based actions take him out, and his Bear goes back. */
  const s = table([at(1, "battlefield", "Bear")], 4);
  takeForGood(s, bearOf(s, 1), 0);
  s.players[0].life = 0;
  checkStateBasedActions(s);
  eq([s.players[0].lost, controls(s, 1)], [true, ["Bear"]], "Rob loses at 0 life: Maya's Bear is hers again");
}
{
  /* A later change of another player's still holds it: Rob took it for good, Trey until end of turn. Rob concedes: Trey
     keeps it, and as the turn ends it goes to Maya, not Rob. */
  const s = table([at(1, "battlefield", "Bear")], 4);
  const bear = bearOf(s, 1);
  takeForGood(s, bear, 0);
  loan(s, bear, 2);
  concede(s, 0);
  eq(s.objects[bear].controller, 2, "Rob concedes: Trey's loan, later, still holds the Bear");
  toCleanup(s);
  eq(s.objects[bear].controller, 1, "the turn over: Maya's");
}
{
  /* The other way round: Trey took it for good, then Rob until end of turn. Trey concedes: Rob's later loan keeps it for
     the turn, and then it goes to Maya -- Trey's change ended with him. */
  const s = table([at(1, "battlefield", "Bear")], 4);
  const bear = bearOf(s, 1);
  takeForGood(s, bear, 2);
  loan(s, bear, 0);
  concede(s, 2);
  eq(s.objects[bear].controller, 0, "Trey concedes: Rob's loan still holds the Bear");
  toCleanup(s);
  eq(s.objects[bear].controller, 1, "the turn over: Maya's, not Trey's");
}
{
  /* Two changes for good, Rob's then Trey's: Trey leaving gives it to Rob, Rob leaving then to Maya -- the earlier change
     decides again once the later one has gone (CR 613.7). */
  const s = table([at(1, "battlefield", "Bear")], 4);
  const bear = bearOf(s, 1);
  takeForGood(s, bear, 0);
  takeForGood(s, bear, 2);
  concede(s, 2);
  eq(s.objects[bear].controller, 0, "Trey concedes: Rob's earlier change gives it to Rob");
  concede(s, 0);
  eq(controls(s, 1), ["Bear"], "Rob concedes: Maya's");
}
{
  /* A change that changes nothing still counts: Rob lends himself Maya's Bear until end of turn, then takes it for good --
     at the end of the turn the later change keeps it his. */
  const s = table([at(1, "battlefield", "Bear")], 4);
  const bear = bearOf(s, 1);
  loan(s, bear, 0);
  takeForGood(s, bear, 0);
  toCleanup(s);
  eq(s.objects[bear].controller, 0, "the loan ends, the change for good after it holds: Rob's");
}
{
  /* Effects giving control to someone else do not end with the player whose effect they were: Rob gives Trey's Bear to
     Maya (as "target opponent gains control" does) and concedes; it is Maya the effect gives control to. */
  const s = table([at(2, "battlefield", "Bear")], 4);
  const bear = bearOf(s, 2);
  runEffects(s, [{effect: "gainControl", targets: [bear], toPlayer: 1}], {controller: 0, source: null});
  concede(s, 0);
  eq(s.objects[bear].controller, 1, "Rob's effect gave Maya the Bear: Rob conceding ends nothing, it stays hers");
}
{
  /* The owner gone first: Maya's Bear, Rob's for good, leaves the game with Maya (800.4a), its records with it; Rob
     conceding afterwards has nothing to give back. */
  const s = table([at(1, "battlefield", "Bear"), at(0, "battlefield", "Forest")], 4);
  const bear = bearOf(s, 1);
  takeForGood(s, bear, 0);
  concede(s, 1);
  eq([s.objects[bear], records(s)], [undefined, 0], "Maya concedes: her Bear leaves the game though Rob controls it, and no record is left");
  concede(s, 0);
  eq(s.zones.battlefield.map((id) => s.objects[id].card).filter((c) => c !== "Forest"), [], "Rob concedes after: nothing comes back");
}
{
  /* Whatever they control still is exiled (800.4a): Maya's Bear that entered under Rob's control, no effect giving it him. */
  const s = table([], 4);
  const bear = addObject(s, {...FIX.Bear, card: "Bear", owner: 1, controller: 0}, "battlefield");
  concede(s, 0);
  eq([s.objects[bear], s.zones.exile.map((id) => [s.objects[id].card, s.objects[id].owner])], [undefined, [["Bear", 1]]],
    "Rob concedes: Maya's Bear, under his control from the start, is exiled");
}
{
  /* And if another player holds such a permanent when its default controller leaves, it stays -- until that change ends,
     and then, with nobody in the game to have it, it is exiled (800.4c): as the turn ends, or as a Sower leaves. */
  const s = table([at(2, "battlefield", SOWER)], 4);
  const lent = addObject(s, {...FIX.Bear, card: "Bear", owner: 1, controller: 0}, "battlefield");
  const sown = addObject(s, {...FIX.Bear, card: "Bear", owner: 1, controller: 0}, "battlefield");
  loan(s, lent, 2);
  runEffects(s, [{effect: "gainControl", targets: [sown], until: "this leaves"}], {controller: 2, source: idOf(s, SOWER, 2)});
  concede(s, 0);
  eq(controls(s, 2), ["Bear", "Bear", SOWER], "Rob concedes: Trey holds both Bears that were Rob's by default");
  toCleanup(s);
  eq([s.objects[lent], s.objects[sown]?.controller], [undefined, 2], "the turn over: the lent Bear is exiled, not given to Rob");
  runEffects(s, [{effect: "destroy", targets: [idOf(s, SOWER, 2)]}], {controller: 1, source: null});
  eq([s.objects[sown], s.zones.exile.filter((id) => s.objects[id].card === "Bear").length], [undefined, 2], "the Sower destroyed: the other is exiled too");
}

/* ---------------------------------------------------------------------------------------------------------------------
 * LEGION WARBOSS: its token must attack this combat; mentor on attack, its target's power read as it resolves.
 * ------------------------------------------------------------------------------------------------------------------- */
const toAttackers = (s) => playUntil(s, (x) => x.awaiting?.kind === "declare-attackers");
{
  const s = table([at(0, "battlefield", WARBOSS)], 4);
  toAttackers(s);
  const choice = attackers.choice(s, s.awaiting);
  const goblin = idOf(s, "Goblin");
  eq(choice.requires.map((r) => r.values), [[goblin]], "four players: the Goblin must attack, the Warboss need not");
  throws(() => attackers.declared(s, s.awaiting, []), /Error: Goblin has to attack this combat: Legion Warboss says it attacks if able\. Declare it attacking a player or a planeswalker\.$/,
    "keeping it home is refused, with what to do instead");
  for (const answer of [housePilot({seat: 0}).answer(projectFor(s, 0), choice), randomLegalPilot(createRng("warboss")).answer(choice)])
    ok(answer.indices.some((i) => choice.options[i].cardId === goblin), "each pilot sends the Goblin");
  /* The Warboss gone before attackers are declared: the requirement is the token's for this combat all the same, said by
     the Warboss's name. */
  runEffects(s, [{effect: "destroy", targets: [idOf(s, WARBOSS)]}], {controller: 1, source: null});
  throws(() => attackers.declared(s, s.awaiting, []), /Legion Warboss says it attacks if able/, "the Warboss destroyed: still required, still named");
  /* Another combat this turn: the requirement was for the one before. */
  s.combatsThisTurn += 1;
  eq(attacksEachCombat(s, goblin), [], "a second combat phase: nothing requires the Goblin");
}
{
  /* Mentor's target, asked again as it resolves (CR 608.2b): pumped to the Warboss's power, the Goblin is no longer a
     legal target, and gets nothing. */
  const s = table([at(0, "battlefield", WARBOSS, "Sprite")], 2);
  toAttackers(s);
  const choice = attackers.choice(s, s.awaiting);
  resolveAwaiting(s, choice.options.filter((o) => s.objects[o.cardId].card !== "Sprite").map((o) => o.index));
  eq(awaitingChoice(s).options.map((o) => o.label), ["Goblin"], "the Warboss and its Goblin attack, the Sprite stays home: mentor aims at the Goblin, the only attacking lesser power");
  resolveAwaiting(s, [0]);
  const goblin = idOf(s, "Goblin");
  runEffects(s, [{effect: "pump", targets: [goblin], power: 1, toughness: 0}], {controller: 0, source: null});
  resolveTop(s);
  eq(s.objects[goblin].counters["+1/+1"] ?? 0, 0, "pumped to power 2 before it resolved: no counter");
}
{
  /* Its source gone, mentor reads the Warboss's power as it last was (CR 113.7a). */
  const s = table([at(0, "battlefield", WARBOSS)], 2);
  toAttackers(s);
  resolveAwaiting(s, attackers.choice(s, s.awaiting).options.map((o) => o.index));
  resolveAwaiting(s, [0]);
  runEffects(s, [{effect: "destroy", targets: [idOf(s, WARBOSS)]}], {controller: 1, source: null});
  resolveTop(s);
  eq(s.objects[idOf(s, "Goblin")].counters["+1/+1"], 1, "the Warboss destroyed with mentor waiting: its last power, 2, still above the Goblin's: the counter");
}
{
  /* Compiled from the keyword: the triggered ability and the word; the schema's words for what must attack. */
  const mentor = compileScript({schema: "CrankCardScript@1", identity: {name: "Test", oracleId: "t", types: ["Creature"], manaCost: "{1}", power: 2, toughness: 2}, oracleText: "Mentor",
    abilities: [{kind: "keyword", text: "Mentor", keyword: "mentor"}]});
  eq([mentor.problems, mentor.definition.keywords, mentor.definition.abilities.map((a) => [a.kind, a.trigger.on, a.targets[0].power])],
    [[], ["Mentor"], [["triggered", "GameEventAttackersDeclared", {lessThan: "self"}]]], "mentor: a triggered ability on attacking, aimed at lesser power");
  const token = (mustAttack) => ({schema: "CrankCardScript@1", identity: {name: "Test", oracleId: "t", types: ["Sorcery"], manaCost: "{1}"}, oracleText: "x",
    abilities: [{kind: "spell", text: "x", effects: [{effect: "createToken", token: {predefined: "Treasure"}, mustAttack}]}]});
  eq(validateScript(token("this combat")).valid, true, "\"attacks this combat if able\": valid");
  ok(validateScript(token("this turn")).errors.some((e) => e.path.endsWith(".mustAttack")), "a requirement the engine does not read is refused");
}

/* ---------------------------------------------------------------------------------------------------------------------
 * THE CREDITS (game/tools/engine-constructs.mjs), and the five cards playable.
 * ------------------------------------------------------------------------------------------------------------------- */
{
  const inventory = JSON.parse(readFileSync(new URL("../game/docs/engine-inventory.json", import.meta.url), "utf8"));
  const uses = (name) => inventory.deck?.perCard?.[name] ?? inventory.top?.perCard?.[name] ?? inventory.library?.perCard?.[name];
  eq(FORGE_COUNTS.LeftGraveyardThisTurn?.status, "built", "the count \"a card left your graveyard this turn\" is credited");
  eq([missingFor(uses("Primary Research")), missingFor(uses("Relic Retriever"))], [[], []], "Primary Research and Relic Retriever: every rule built");
  ok(keywordBuilt("Mentor"), "mentor is credited, an ability keyword over putCounter");
  eq(missingFor(uses(WARBOSS)).map((m) => m.name), ["RememberObjects"], "Legion Warboss: held back by remembering objects alone, a construct of many forms not credited here");
  for (const name of ["Primary Research", "Relic Retriever", WARBOSS, SOWER]) ok(index.resolve(name)?.playable === true, `${name} is defined and playable`);
}

console.log(`engine-x11-permissions: ${checks} checks passed -- a card leaving a graveyard counted per graveyard, cards only, from none each turn; Sower's control while it remains, and control changes ending in timestamp order; a player leaving the game, each kind of change given back, what they still control exiled, and what would return to them exiled; Legion Warboss's token required this combat, refused with instructions, met by both pilots; mentor's lesser power as it resolves; the credits.`);
