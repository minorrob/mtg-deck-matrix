/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* THE PLAN'S X11: A PLAYER LEAVES THE GAME WHILE THEY ARE BEING ASKED (CR 800.4a, 800.4f-h).
 *
 * A question asked of a player who leaves is not simply withdrawn: what it was part of goes on without them, the way the
 * rules say, until the resolution finishes and priority goes on (CR 117.3b) -- rules/sba.mjs `concede`, rules/turn.mjs
 * `answerForDeparted` and `goOnWithout`, script/resolution.mjs `answerDeparted`, and each asking primitive's `left`:
 *   - what was theirs to choose among left with them: their sacrifice or discard in "each player ..." is no choice, and
 *     the next player is asked, or the effect is done (one who chose and then left discards nothing); a search of their
 *     library finds nothing; their commander, their Aura, their attacking tokens, their conniving go nowhere;
 *   - a cost they would pay, or choose whether to pay, is not paid (800.4f), deciding or choosing how to pay;
 *   - any other choice -- a "may" that is theirs, the opponent's piles of Fact or Fiction, the opponent's two of Gifts
 *     Ungiven -- is made by another opponent, the one there is or the one the controller chooses (800.4g), even when it
 *     was asked only after they left (Arcane Denial's upkeep);
 *   - the order of damage replacements dealt to them is asked of nobody, and the rest of the effect's damage is asked
 *     and dealt; in combat, none is assigned to them (800.4e) and the rest of the step's damage is;
 *   - the next defending player declares blockers; the next player's triggers go on the stack, and the next trigger is
 *     aimed (800.4d, 603.3b);
 *   - and with the active player gone, priority goes to the next player in turn order (800.4j).
 * Then a fuzzed concession at every question of seeded games of the engine's playable cards, and games played to their end
 * through concessions while asked: the game never stalls, no one who has left is asked or given priority, and leaving leads
 * to no refused answer. Four players throughout.
 */
import assert from "node:assert/strict";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {legalActions, applyAction} from "../game/engine/rules/actions.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";
import {advance, awaitingChoice, resolveAwaiting, beginGame, hasPriority} from "../game/engine/rules/turn.mjs";
import {concede, gameOver} from "../game/engine/rules/sba.mjs";
import {beginResolution} from "../game/engine/script/resolution.mjs";
import {createState, addObject} from "../game/engine/state/index.mjs";
import {beginMulligans, mulligansDone} from "../game/engine/rules/mulligan.mjs";
import {createRng} from "../game/engine/rng.mjs";
import {housePilot} from "../game/engine/pilots/house-pilot.mjs";
import {randomLegalPilot} from "../game/engine/pilots/random-legal.mjs";
import {projectFor} from "../game/engine/projection.mjs";
import {leastAnswer} from "../game/room/room.mjs";
import {commanderLegal} from "../game/room/table.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const rng = createRng("x11-leave-questions");
const FIX = {
  Bear: {types: ["Creature"], subtypes: ["Bear"], manaCost: "{1}{G}", colors: ["G"], power: 2, toughness: 2},
  "Red Bear": {types: ["Creature"], subtypes: ["Bear"], manaCost: "{1}{R}", colors: ["R"], power: 2, toughness: 2},
  Spark: {types: ["Instant"], manaCost: "{R}", colors: ["R"]},
  Relic: {types: ["Artifact"], manaCost: "{1}"},
  Ox: {types: ["Creature"], subtypes: ["Ox"], manaCost: "{3}{W}", colors: ["W"], power: 2, toughness: 4},
  Watcher: {types: ["Creature"], manaCost: "{1}", power: 1, toughness: 1, abilities: [{id: "a0", kind: "triggered", text: "Whenever a creature dies, you gain 1 life.",
    trigger: {on: "GameEventCardChangeZone", from: "Battlefield", to: "Graveyard", who: "any", filter: {types: ["Creature"]}}, effects: [{effect: "gainLife", amount: 1}]}]},
  Mourner: {types: ["Creature"], manaCost: "{1}", power: 1, toughness: 1, abilities: [{id: "a0", kind: "triggered", text: "Whenever a creature dies, up to one target player loses 1 life.",
    trigger: {on: "GameEventCardChangeZone", from: "Battlefield", to: "Graveyard", who: "any", filter: {types: ["Creature"]}}, targets: [{what: "player", count: {min: 0, max: 1}}],
    effects: [{effect: "loseLife", amount: 1, who: {target: 0}}]}]},
  "Rob's Commander": {types: ["Creature"], supertypes: ["Legendary"], subtypes: ["Human"], manaCost: "{2}{W}", colors: ["W"], power: 2, toughness: 2},
  "Trey's Commander": {types: ["Creature"], supertypes: ["Legendary"], subtypes: ["Human"], manaCost: "{2}{W}", colors: ["W"], power: 2, toughness: 2},
  Halo: {types: ["Enchantment"], subtypes: ["Aura"], manaCost: "{W}", colors: ["W"], enchant: {what: "permanent", types: ["Creature"]}},
};
const at = (seat, zone, ...cards) => ({seat, zone, cards});
const late = (seat, zone, ...cards) => ({seat, zone, cards, sick: true});
const scene = (setup, steps = [], seats = 4) => runScenario({name: "x11-leave-questions", seats, setup, steps}, index.definition, FIX).state;
const named = (s, zone, seat) => s.zones[zone][seat].map((id) => s.objects[id].card).sort();
const asked = (s) => (s.awaiting ? [s.awaiting.effect ?? s.awaiting.kind, s.awaiting.player] : null);
/* Answer what is asked by its options' words. */
function pick(s, ...labels) {
  const choice = awaitingChoice(s);
  const indices = labels.map((label) => {
    const option = choice.options.find((o) => o.label === label);
    if (!option) throw new Error(`no option ${label}: ${choice.options.map((o) => o.label).join(", ")}`);
    return option.index;
  });
  return resolveAwaiting(s, indices, null, rng);
}
const first = (s) => resolveAwaiting(s, [0], null, rng);
const settled = (s) => eq([s.stack.length, Boolean(s.resolving), s.awaiting], [0, false, null], "the resolution has finished, the stack is empty and nothing is asked");
function playUntil(s, done, limit = 4000) {
  for (let n = 0; n < limit; n += 1) {
    if (done(s)) return;
    if (s.awaiting) {
      const choice = awaitingChoice(s);
      resolveAwaiting(s, s.awaiting.kind === "order-triggers" ? choice.options.map((o) => o.index) : choice.options.slice(0, choice.min ?? 0).map((o) => o.index), null, rng);
    } else if (s.priorityPlayer === null) advance(s);
    else if (passPriority(s, null, rng).outcome === "step-ends") advance(s);
  }
  throw new Error("never got there");
}
const cast = (s, seat, card, aim = () => true) => applyAction(s, seat, legalActions(s, seat).find((a) => a.kind === "cast" && a.label === card && aim(a)));
const tap = (s, seat, ...lands) => { for (const land of lands) applyAction(s, seat, legalActions(s, seat).find((a) => a.kind === "activate-mana" && a.label === land)); };
const resolveTop = (s) => playUntil(s, (x) => x.awaiting !== null || x.stack.every((e) => e.stage === "resolving"));

/* ---- "each player sacrifices a creature": theirs is no choice, and the next player is asked ---- */
const bloodOnMayasTurn = () => scene([at(0, "battlefield", "Bear"), at(1, "battlefield", "Swamp", "Bear"), at(1, "hand", "Innocent Blood"), at(2, "battlefield", "Bear"), at(3, "battlefield", "Bear")],
  [{to: {turn: 2, phase: "MAIN1"}}, {tap: "Swamp", seat: 1}, {cast: "Innocent Blood", seat: 1}, {resolve: true}]);
{
  const s = bloodOnMayasTurn();
  eq(asked(s), ["sacrifice", 1], "Maya's Innocent Blood: Maya chooses first, on her turn (CR 101.4)");
  first(s);
  eq(asked(s), ["sacrifice", 2], "then Trey");
  concede(s, 2);
  eq(asked(s), ["sacrifice", 3], "Trey concedes while he is choosing: Sam is asked next, and the resolution goes on");
  first(s);
  eq(asked(s), ["sacrifice", 0], "then Rob");
  first(s);
  settled(s);
  eq([named(s, "graveyard", 0), named(s, "graveyard", 1), named(s, "graveyard", 3), s.priorityPlayer], [["Bear"], ["Bear", "Innocent Blood"], ["Bear"], 1],
    "everyone else's Bear is sacrificed, and Maya, the active player, receives priority (CR 117.3b)");
}
{
  const s = bloodOnMayasTurn();
  first(s); first(s); first(s);
  eq(asked(s), ["sacrifice", 0], "Rob is the last asked");
  concede(s, 0);
  settled(s);
  eq([named(s, "graveyard", 1), named(s, "graveyard", 2), named(s, "graveyard", 3), s.priorityPlayer], [["Bear", "Innocent Blood"], ["Bear"], ["Bear"], 1],
    "Rob concedes as the last asked: the others' sacrifices are made at once, and Maya has priority");
}
{
  /* What follows the last answer runs at once, with the game's random stream concede is handed: "then each player shuffles". */
  const s = scene([at(0, "battlefield", "Bear"), at(2, "battlefield", "Bear")]);
  beginResolution(s, [{effect: "sacrifice", who: "each", count: 1, selector: {types: ["Creature"]}}, {effect: "shuffle", who: "each"}], {controller: 1}, rng);
  first(s);
  eq(asked(s), ["sacrifice", 2], "an effect of Maya's: each player sacrifices a creature, then each shuffles -- Rob has chosen, Trey is asked");
  const events = concede(s, 2, createRng("shuffle"));
  eq([Boolean(s.resolving), named(s, "graveyard", 0), events.filter((e) => e.kind === "GameEventShuffle").length], [false, ["Bear"], 3],
    "Trey concedes: Rob's sacrifice is made, and the three still in the game shuffle");
}
{
  /* Two players left: Rob conceding as he is asked ends the game, and nothing more is asked of anyone. */
  const s = bloodOnMayasTurn();
  first(s); concede(s, 2); concede(s, 3);
  eq(asked(s), ["sacrifice", 0], "Trey and Sam have conceded; Rob is asked");
  concede(s, 0);
  eq([gameOver(s)?.winner, s.awaiting], [1, null], "Rob concedes: Maya has won, and nothing is asked");
}

/* ---- "each opponent discards a card": a player who chose and then left discards nothing ---- */
{
  const s = scene([at(0, "hand", "Spark"), at(1, "battlefield", "Swamp", "Wastes"), at(1, "hand", "Stony-Voiced Goblins"), at(2, "hand", "Spark"), at(3, "hand", "Spark")],
    [{to: {turn: 2, phase: "MAIN1"}}, {tap: "Swamp", seat: 1}, {tap: "Wastes", seat: 1}, {cast: "Stony-Voiced Goblins", seat: 1}, {resolve: true}]);
  resolveTop(s);
  eq(asked(s), ["discard", 2], "Maya's Stony-Voiced Goblins enters: each opponent discards, Trey first");
  pick(s, "Spark");
  eq(asked(s), ["discard", 3], "Trey has chosen his Spark; Sam is asked");
  concede(s, 2);
  eq(asked(s), ["discard", 3], "Trey concedes: Sam is still asked");
  pick(s, "Spark");
  eq(asked(s), ["discard", 0], "then Rob");
  concede(s, 0);
  settled(s);
  eq([named(s, "graveyard", 3), named(s, "hand", 3), s.priorityPlayer], [["Spark"], [], 1],
    "Rob concedes as the last asked: Sam's discard is made, Trey's -- chosen before he left -- is not, and Maya has priority");
}

/* ---- "unless that player pays": not paid (CR 800.4f) ---- */
for (const how of ["deciding", "choosing the mana"]) {
  const s = scene([at(2, "battlefield", "Island", "Swamp", "Mountain"), late(1, "battlefield", "Smothering Tithe")], [{to: {turn: 3, phase: "DRAW"}}]);
  resolveTop(s);
  eq(asked(s), ["unlessPays", 2], "Trey draws on his turn: Maya's Smothering Tithe asks him whether he pays {2}");
  if (how === "choosing the mana") { pick(s, "Pay {2}"); eq(asked(s), ["unlessPays", 2], "he pays, and is asked which mana"); }
  concede(s, 2);
  settled(s);
  eq([s.zones.battlefield.filter((id) => s.objects[id].card === "Treasure").map((id) => s.objects[id].controller), s.priorityPlayer], [[1], 3],
    `Trey concedes ${how}: the {2} is not paid, so Maya creates a Treasure; and the active player gone, Sam, next in turn order, has priority (CR 800.4j)`);
}

/* ---- "target opponent may draw a card": another opponent makes the choice (CR 800.4g) ---- */
const tataru = (gone = []) => {
  const s = scene([at(1, "battlefield", "Plains", "Wastes"), at(1, "hand", "Tataru Taru")], [{to: {turn: 2, phase: "MAIN1"}}]);
  for (const seat of gone) concede(s, seat);
  tap(s, 1, "Plains", "Wastes");
  cast(s, 1, "Tataru Taru");
  resolveTop(s);
  resolveTop(s);
  pick(s, "Rob");
  resolveTop(s);
  return s;
};
{
  const s = tataru();
  eq(asked(s), ["modal", 0], "Maya's Tataru Taru enters aimed at Rob: Maya draws, and Rob is asked whether he draws");
  const hands = s.players.map((p) => s.zones.hand[p.id].length);
  concede(s, 0);
  eq([asked(s), awaitingChoice(s).options.map((o) => o.label), awaitingChoice(s).title], [["chooseInstead", 1], ["Trey", "Sam"], "Rob has left the game: choose who makes their choice"],
    "Rob concedes: his choice is another opponent's, and with two, Maya chooses which");
  assert.throws(() => resolveAwaiting(s, [2], null, rng), /Invalid selection/); checks += 1;
  /* A question the pilots answer: the house pilot the room seats for the AI, and the random-legal pilot. */
  for (const [who, a] of [["the house pilot", housePilot({seat: 1, cards: () => null}).answer(projectFor(s, 1), awaitingChoice(s))],
    ["the random-legal pilot", randomLegalPilot(createRng("instead")).answer(awaitingChoice(s))]]) {
    const t = structuredClone(s);
    resolveAwaiting(t, a.indices, a.amounts, rng, a);
    ok(t.awaiting?.effect === "modal" && [2, 3].includes(t.awaiting.player), `${who} answers it: Trey or Sam is asked`);
  }
  pick(s, "Sam");
  eq([asked(s), awaitingChoice(s).title], [["modal", 3], "Draw a card?"], "Sam is asked Rob's question");
  pick(s, "Draw a card");
  settled(s);
  eq([s.zones.hand[3].length, s.zones.hand[1].length, s.priorityPlayer], [hands[3], hands[1], 1], "the card drawn would have been Rob's: nobody draws it, and Maya has priority");
}
{
  const s = tataru([3]);
  concede(s, 0);
  eq(asked(s), ["modal", 2], "with Sam gone already, Trey is the one other opponent, and is asked at once");
  pick(s, "Don't draw");
  settled(s);
}

/* ---- Fact or Fiction: another opponent separates the piles ---- */
const fiction = () => scene([at(1, "battlefield", "Island", "Wastes", "Wastes", "Wastes"), at(1, "hand", "Fact or Fiction")],
  [{to: {turn: 2, phase: "MAIN1"}}, {tap: "Island", seat: 1}, {tap: "Wastes", seat: 1}, {tap: "Wastes", seat: 1}, {tap: "Wastes", seat: 1}, {cast: "Fact or Fiction", seat: 1}, {resolve: true}]);
{
  const s = fiction();
  eq(asked(s), ["twoPiles", 1], "Maya's Fact or Fiction: she chooses the opponent who separates");
  pick(s, "Rob");
  eq(asked(s), ["twoPiles", 0], "Rob is asked to separate the five");
  concede(s, 0);
  eq(asked(s), ["chooseInstead", 1], "Rob concedes: Maya chooses another opponent to separate them");
  pick(s, "Trey");
  eq([asked(s), s.awaiting.step], [["twoPiles", 2], "separate"], "Trey separates");
  resolveAwaiting(s, [0, 1], null, rng);
  eq(asked(s), ["twoPiles", 1], "and Maya picks a pile");
  resolveAwaiting(s, [1], null, rng);
  settled(s);
  eq([s.zones.hand[1].length, s.zones.graveyard[1].length, s.priorityPlayer], [1 + 3, 2 + 1, 1], "the pile of three to her hand, beside her draw, and two to her graveyard with the spell; Maya has priority");
}
{
  /* Rob leaves while Maya is choosing, and she names him: the separating is asked of nobody who has left. */
  const s = fiction();
  concede(s, 0);
  pick(s, "Rob");
  eq(asked(s), ["chooseInstead", 1], "Maya names Rob, who has just left: she chooses again, between Trey and Sam");
}

/* ---- Gifts Ungiven: another opponent chooses the two ---- */
{
  const s = scene([at(1, "battlefield", "Island", "Wastes", "Wastes", "Wastes"), at(1, "hand", "Gifts Ungiven"), at(1, "library", "Spark", "Bear", "Relic", "Ox")],
    [{to: {turn: 2, phase: "MAIN1"}}, {tap: "Island", seat: 1}, {tap: "Wastes", seat: 1}, {tap: "Wastes", seat: 1}, {tap: "Wastes", seat: 1},
      {cast: "Gifts Ungiven", seat: 1, targets: [{player: 0}]}, {resolve: true}]);
  pick(s, "Spark", "Bear", "Relic", "Ox");
  eq(asked(s), ["chooseCard", 0], "Maya's Gifts Ungiven, aimed at Rob: she finds four, and Rob is asked to choose two");
  concede(s, 0);
  eq(asked(s), ["chooseInstead", 1], "Rob concedes: Maya chooses another opponent to choose them");
  pick(s, "Sam");
  eq(asked(s), ["chooseCard", 3], "Sam chooses");
  pick(s, "Spark", "Bear");
  settled(s);
  eq([named(s, "graveyard", 1), named(s, "hand", 1).filter((n) => n !== "Wastes"), s.priorityPlayer], [["Bear", "Gifts Ungiven", "Spark"], ["Ox", "Relic"], 1],
    "Sam's two go to her graveyard and the rest to her hand");
}

/* ---- Path to Exile: a search of the library they no longer have finds nothing ---- */
{
  const s = scene([at(0, "battlefield", "Bear"), at(1, "battlefield", "Plains"), at(1, "hand", "Path to Exile")],
    [{to: {turn: 2, phase: "MAIN1"}}, {tap: "Plains", seat: 1}, {cast: "Path to Exile", seat: 1, targets: [{card: "Bear", seat: 0}]}, {resolve: true}]);
  eq(asked(s), ["chooseCard", 0], "Maya's Path to Exile exiles Rob's Bear, and Rob may search for a basic land");
  const events = concede(s, 0);
  settled(s);
  eq([events.some((e) => e.kind === "GameEventShuffle"), s.priorityPlayer], [false, 1], "Rob concedes: nothing is searched or shuffled, and Maya has priority");
}

/* ---- a commander's owner gone: it goes nowhere, and the next owner is asked ---- */
{
  const s = scene([]);
  const rob = addObject(s, {...FIX["Rob's Commander"], card: "Rob's Commander", owner: 0, controller: 0, commander: true}, "battlefield");
  const trey = addObject(s, {...FIX["Trey's Commander"], card: "Trey's Commander", owner: 2, controller: 2, commander: true}, "battlefield");
  beginResolution(s, [{effect: "moveZone", targets: [rob, trey], to: "hand"}], {controller: 1}, rng);
  eq(asked(s), ["commanderHome", 0], "an effect of Maya's returns Rob's and Trey's commanders to their owners' hands: Rob is asked first");
  concede(s, 0);
  eq(asked(s), ["commanderHome", 2], "Rob concedes, his commander with him: Trey is asked");
  pick(s, "Put it into the command zone");
  eq([Boolean(s.resolving), named(s, "command", 2)], [false, ["Trey's Commander"]], "and his goes to the command zone");
}

/* ---- the order of two damage replacements, dealt to a player who has left ---- */
{
  const s = scene([at(1, "battlefield", "Mountain", "Plains", "Swamp", "Torbran, Thane of Red Fell", "Fiery Emancipation"), at(1, "hand", "Crackling Doom"),
    at(2, "battlefield", "Bear"), at(3, "battlefield", "Bear")],
    [{to: {turn: 2, phase: "MAIN1"}}, {tap: "Mountain", seat: 1}, {tap: "Plains", seat: 1}, {tap: "Swamp", seat: 1}, {cast: "Crackling Doom", seat: 1}, {resolve: true}]);
  eq(asked(s), ["orderDamage", 0], "Maya's Crackling Doom, with Torbran and Fiery Emancipation: Rob chooses which applies first to his 2 (CR 616.1)");
  concede(s, 0);
  eq(asked(s), ["orderDamage", 2], "Rob concedes: his damage is no one's, and Trey is asked about his");
  pick(s, awaitingChoice(s).options[0].label);
  eq(asked(s), ["orderDamage", 3], "then Sam");
  pick(s, awaitingChoice(s).options[1].label);
  eq([40 - s.players[2].life, 40 - s.players[3].life, asked(s)], [12, 8, ["sacrifice", 2]], "Trey's 2 is dealt plus 2 then tripled, Sam's tripled then plus 2; then the sacrifices, Trey first");
  first(s); first(s);
  settled(s);
  eq([named(s, "graveyard", 2), named(s, "graveyard", 3), s.priorityPlayer], [["Bear"], ["Bear"], 1], "each sacrifices his Bear, and Maya has priority");
}

/* ---- Arcane Denial: "its controller may draw", that controller gone before the upkeep ---- */
{
  const s = scene([at(0, "battlefield", "Forest", "Wastes"), at(0, "hand", "Bear"), at(1, "battlefield", "Island", "Wastes"), at(1, "hand", "Arcane Denial")]);
  tap(s, 0, "Forest", "Wastes");
  cast(s, 0, "Bear");
  passPriority(s, null, rng);
  tap(s, 1, "Island", "Wastes");
  cast(s, 1, "Arcane Denial");
  playUntil(s, (x) => x.stack.length === 0);
  concede(s, 0);
  playUntil(s, (x) => x.awaiting?.effect === "chooseInstead" || x.turn > 2);
  eq([asked(s), s.turn, s.phase], [["chooseInstead", 1], 2, "UPKEEP"], "Rob's Bear countered, Rob concedes; at the upkeep his \"may draw\" is asked of another opponent Maya chooses");
  pick(s, "Trey");
  eq(asked(s), ["modal", 2], "Trey is asked");
  const treys = s.zones.hand[2].length;
  pick(s, "Draw two cards");
  eq(s.zones.hand[2].length, treys, "and the cards would have been Rob's: nobody draws them");
}

/* ---- combat ---- */
{
  /* Rob attacks Maya, Trey and Sam. Maya declares no blocks; Trey concedes while declaring his: Sam still declares, and
     nothing is dealt to Trey (CR 800.4e). */
  const s = scene([at(0, "battlefield", "Bear", "Bear", "Red Bear"), at(1, "battlefield", "Bear"), at(2, "battlefield", "Bear"), at(3, "battlefield", "Bear")],
    [{attack: ["Bear", "Bear", "Red Bear"], at: ["Maya", "Trey", "Sam"]}]);
  playUntil(s, (x) => x.awaiting?.kind === "declare-blockers");
  eq(asked(s), ["declare-blockers", 1], "Maya declares blockers first");
  resolveAwaiting(s, [], null, rng);
  eq(asked(s), ["declare-blockers", 2], "then Trey");
  concede(s, 2);
  eq(asked(s), ["declare-blockers", 3], "Trey concedes: Sam declares his");
  pick(s, "Bear blocks Red Bear");
  playUntil(s, (x) => x.phase === "COMBAT_END" || x.turn > 1);
  eq([s.players[1].life, s.players[2].life, named(s, "graveyard", 0), named(s, "graveyard", 3)], [38, 40, ["Red Bear"], ["Bear"]],
    "Maya is dealt 2; Rob's Bear deals nothing to Trey, who has left; Sam's block trades");
}
{
  /* Rob's red attackers, with Torbran and Fiery Emancipation: Maya, asked the order for the damage to her, concedes; the
     rest of the step's damage is asked and dealt. */
  const s = scene([at(0, "battlefield", "Red Bear", "Red Bear", "Torbran, Thane of Red Fell", "Fiery Emancipation")], [{attack: ["Red Bear", "Red Bear"], at: ["Maya", "Trey"]}]);
  playUntil(s, (x) => x.awaiting?.kind === "order-damage");
  eq(asked(s), ["order-damage", 1], "the damage to Maya: she chooses the order");
  concede(s, 1);
  eq(asked(s), ["order-damage", 2], "she concedes: Trey is asked about his");
  pick(s, awaitingChoice(s).options[0].label);
  ok(s.players[2].life < 40 && !s.awaiting, "and the damage to Trey is dealt");
}

/* ---- triggers ---- */
{
  /* Rob's Go for the Throat kills Sam's Bear. Maya and Trey each have two Watchers: Maya is asked their order, and
     concedes; Trey's go on the stack in his order, and Rob, the active player, receives priority. */
  const s = scene([at(0, "battlefield", "Swamp", "Wastes"), at(0, "hand", "Go for the Throat"), at(1, "battlefield", "Watcher", "Watcher"), at(2, "battlefield", "Watcher", "Watcher"), at(3, "battlefield", "Bear")],
    [{tap: "Swamp"}, {tap: "Wastes"}, {cast: "Go for the Throat", targets: [{card: "Bear", seat: 3}]}, {resolve: true}]);
  eq(asked(s), ["order-triggers", 1], "the Bear dies: Maya orders her two triggers");
  concede(s, 1);
  eq(asked(s), ["order-triggers", 2], "Maya concedes: Trey orders his");
  resolveAwaiting(s, awaitingChoice(s).options.map((o) => o.index), null, rng);
  eq([s.stack.map((e) => e.playerId), s.priorityPlayer], [[2, 2], 0], "Trey's two are on the stack, and Rob has priority");
  playUntil(s, (x) => x.stack.length === 0);
  eq(s.players[2].life, 42, "they resolve: Trey gains 2");
}
{
  /* Maya's and Trey's Blood Artists trigger; Maya, aiming hers, concedes: Trey aims his. */
  const s = scene([at(0, "battlefield", "Swamp", "Wastes"), at(0, "hand", "Go for the Throat"), at(1, "battlefield", "Blood Artist"), at(2, "battlefield", "Blood Artist"), at(3, "battlefield", "Bear")],
    [{tap: "Swamp"}, {tap: "Wastes"}, {cast: "Go for the Throat", targets: [{card: "Bear", seat: 3}]}, {resolve: true}]);
  eq(asked(s), ["trigger-targets", 1], "the Bear dies: Maya aims her Blood Artist's trigger");
  concede(s, 1);
  eq(asked(s), ["trigger-targets", 2], "Maya concedes, her trigger gone: Trey aims his");
  pick(s, "Sam");
  playUntil(s, (x) => x.stack.length === 0);
  eq([s.players[3].life, s.players[2].life], [39, 41], "Sam loses 1, Trey gains 1");
}
{
  /* "Up to one target player": a counted target, picked as the trigger goes on the stack -- Maya's, then Trey's. */
  const s = scene([at(0, "battlefield", "Swamp", "Wastes"), at(0, "hand", "Go for the Throat"), at(1, "battlefield", "Mourner"), at(2, "battlefield", "Mourner"), at(3, "battlefield", "Bear")],
    [{tap: "Swamp"}, {tap: "Wastes"}, {cast: "Go for the Throat", targets: [{card: "Bear", seat: 3}]}, {resolve: true}]);
  eq(asked(s), ["choose-targets", 1], "the Bear dies: Maya picks her Mourner's target");
  concede(s, 1);
  eq(asked(s), ["choose-targets", 2], "Maya concedes, her trigger gone: Trey picks his");
}

/* ---- casting, asked what to pay with: they held priority, and it passes on (CR 800.4a) ---- */
{
  const s = scene([at(0, "battlefield", "Forest", "Wastes"), at(0, "hand", "Bear"), at(1, "battlefield", "Island", "Mountain", "Plains"), at(1, "hand", "Arcane Denial")]);
  tap(s, 0, "Forest", "Wastes");
  cast(s, 0, "Bear");
  passPriority(s, null, rng);
  cast(s, 1, "Arcane Denial");
  eq([asked(s), awaitingChoice(s).title], [["choose-cost", 1], "Arcane Denial: what to tap for it"], "Maya answers Rob's Bear with Arcane Denial, and is asked what she taps for it");
  concede(s, 1);
  eq([s.awaiting, s.priorityPlayer, s.stack.map((e) => e.name)], [null, 2, ["Bear"]], "Maya concedes: priority passes to Trey, next in turn order, and the Bear is still on the stack");
}
{
  const s = scene([at(0, "battlefield", "Bear"), at(1, "battlefield", "Plains", "Wastes", "Wastes"), at(1, "hand", "Fancy Footwork")]);
  passPriority(s, null, rng);
  tap(s, 1, "Plains", "Wastes", "Wastes");
  cast(s, 1, "Fancy Footwork");
  eq(asked(s), ["choose-targets", 1], "on Rob's turn Maya casts Fancy Footwork, and is asked which creatures it untaps");
  concede(s, 1);
  eq([s.awaiting, s.priorityPlayer, s.stack.length], [null, 2, 0], "Maya concedes: priority passes to Trey, and nothing of the spell is on the stack");
}

/* ---- what is put in front of an effect for the one it is about: their tokens attacking, their Aura, their conniving ---- */
{
  const s = scene([at(2, "battlefield", "Bear")]);
  const token = addObject(s, {...FIX.Bear, card: "Bear", token: true, owner: 0, controller: 0}, "battlefield");
  s.combat = {attackingPlayerId: 0, attacks: [], defenders: []};
  beginResolution(s, [{effect: "attackWhom", tokens: [token], player: 0}], {controller: 1}, rng);
  eq(asked(s), ["attackWhom", 0], "a token of Rob's put onto the battlefield attacking, by an effect of Maya's: Rob chooses whom it attacks");
  concede(s, 0);
  eq([Boolean(s.resolving), s.awaiting, s.combat.attacks], [false, null, []], "Rob concedes, the token with him: nothing is put into the attack");
}
{
  const s = scene([at(0, "battlefield", "Bear", "Bear")]);
  const halo = addObject(s, {...FIX.Halo, card: "Halo", owner: 0, controller: 0}, "battlefield");
  const bears = s.zones.battlefield.filter((id) => s.objects[id].card === "Bear");
  beginResolution(s, [{effect: "enchantWhat", aura: halo, hosts: bears, player: 0}], {controller: 1}, rng);
  eq(asked(s), ["enchantWhat", 0], "Rob's Aura entering by an effect of Maya's: Rob chooses what it enchants");
  concede(s, 0);
  eq([Boolean(s.resolving), s.awaiting], [false, null], "Rob concedes, the Aura with him: there is nothing to attach");
}
{
  const s = scene([at(0, "battlefield", "Bear", "Bear"), at(2, "battlefield", "Bear"), at(2, "hand", "Spark")]);
  const conniving = s.zones.battlefield.filter((id) => s.objects[id].card === "Bear");
  beginResolution(s, [{effect: "connive", targets: conniving}], {controller: 1}, rng);
  eq(asked(s), ["conniveWhich", 0], "an effect of Maya's has Rob's two Bears and Trey's connive: Rob chooses which of his connives first");
  concede(s, 0);
  eq(asked(s), ["discard", 2], "Rob concedes: his draw and discard are no one's, and Trey's Bear connives -- he draws, and is asked to discard");
  pick(s, "Spark");
  eq([Boolean(s.resolving), s.objects[conniving[2]].counters["+1/+1"]], [false, 1], "the Spark was a nonland card: a +1/+1 counter on Trey's Bear");
}

/* ---- fuzzed: a concession at every question of seeded games ----

   Four seats of the engine's playable cards dealt at random -- a commander, thirty spells, six lands, basics -- played by
   the house pilot the room seats for the AI, or the random-legal pilot; a dozen of each deck's spells are ones that ask
   another player something. At every question asked in the game the game is copied, the player asked concedes in the
   copy, and the copy is played on to the end of the next turn: it must never stall (a question or priority pending until
   the game ends, a resolution never left with nothing asked), never ask a player who has left or give them priority, and
   the concession must lead to no refused answer -- each pilot's answer given as the room gives it, counted as the room
   counts it (game/room/room.mjs, `refusals`), and the least answer given instead. */
const playable = index.names.filter((n) => index.resolve(n)?.playable === true);
const defs = new Map(playable.map((n) => [n, index.definition(n)]));
const isLand = (d) => (d.types ?? []).includes("Land");
const SPELLS = playable.filter((n) => !isLand(defs.get(n)) && defs.get(n).manaCost && !(defs.get(n).types ?? []).includes("Planeswalker"));
const LANDS = playable.filter((n) => isLand(defs.get(n)));
const COMMANDERS = playable.filter((n) => commanderLegal(defs.get(n)) && (defs.get(n).types ?? []).includes("Creature"));
/* The spells whose effects ask a player other than their controller -- "each player sacrifices", "unless that player
   pays", "an opponent separates", "target opponent chooses", "its controller may" -- a dozen of each deck's thirty, so
   the questions this is about are asked often. */
const asksAnother = (x) => (Array.isArray(x) ? x.some(asksAnother) : x !== null && typeof x === "object" && (
  (["discard", "sacrifice", "unlessPays", "chooseCard"].includes(x.effect) && x.who !== undefined && x.who !== "you") || (x.effect === "modal" && x.chooser !== undefined && x.chooser !== "you")
  || x.effect === "twoPiles" || Object.values(x).some(asksAnother)));
const ASKERS = SPELLS.filter((n) => asksAnother(defs.get(n)));
const BASICS = {Plains: "W", Island: "U", Swamp: "B", Mountain: "R", Forest: "G"};
const cardOf = (name) => (BASICS[name] ? {types: ["Land"], supertypes: ["Basic"], subtypes: [name], abilities: [{id: "a0", kind: "mana", tapSelf: true, produces: {[BASICS[name]]: 1}}]} : defs.get(name));
const manaValue = (cost) => (String(cost || "").match(/\{([^}]+)\}/g) || []).reduce((n, sym) => n + (/^\d+$/.test(sym.slice(1, -1)) ? Number(sym.slice(1, -1)) : sym === "{X}" ? 0 : 1), 0);
const facts = (name) => { const d = cardOf(name); return d ? {manaValue: manaValue(d.manaCost), types: d.types ?? [], power: d.power ?? null, toughness: d.toughness ?? null} : null; };
function dealt(seed) {
  const deal = createRng(`deal-${seed}`), pickOne = (list) => list[deal.int(list.length)];
  const s = createState({matchId: `leave-${seed}`, seed: `leave-${seed}`, players: ["Rob", "Maya", "Trey", "Sam"].map((name) => ({name}))});
  for (let seat = 0; seat < 4; seat += 1) {
    const put = (name, zone) => addObject(s, {...cardOf(name), card: name, owner: seat, controller: seat, ...(zone === "command" ? {commander: true} : {})}, zone, seat);
    put(pickOne(COMMANDERS), "command");
    for (let i = 0; i < 30; i += 1) put(pickOne(i < 12 ? ASKERS : SPELLS), "library");
    for (let i = 0; i < 6; i += 1) put(pickOne(LANDS), "library");
    for (let i = 0; i < 28; i += 1) put(pickOne(Object.keys(BASICS)), "library");
  }
  return s;
}
/* The pilots, each answering as the room asks it: the house pilot from its seat's view, the random-legal from the choice. */
function pilotsFor(kind, seed) {
  if (kind === "house") {
    const seats = [0, 1, 2, 3].map((seat) => housePilot({seat, cards: facts}));
    return {answer: (s, choice) => seats[s.awaiting.player].answer(projectFor(s, s.awaiting.player), choice),
      choose: (s, actions) => seats[s.priorityPlayer].choose(projectFor(s, s.priorityPlayer), actions)};
  }
  const random = randomLegalPilot(createRng(`pilot-${seed}`));
  return {answer: (s, choice) => random.answer(choice), choose: (s, actions) => random.choose(actions)};
}
const out = (s, seat) => s.players[seat].lost === true;
/* One step of the game, as the room takes it; what went wrong, or null. */
function step(s, pilot, stream, tally) {
  if (s.awaiting) {
    if (out(s, s.awaiting.player)) return `a player who has left is asked (${s.awaiting.kind})`;
    const choice = awaitingChoice(s), a = pilot.answer(s, choice);
    try { resolveAwaiting(s, a.indices, a.amounts, stream, a); } catch {
      tally.refused += 1;
      const least = leastAnswer(choice);
      resolveAwaiting(s, least.indices, least.amounts, stream, least);
    }
    return null;
  }
  if (s.resolving) return "a resolution is left pending with nothing asked";
  if (s.priorityPlayer === null) { advance(s); return null; }
  if (out(s, s.priorityPlayer)) return "a player who has left holds priority";
  const chosen = pilot.choose(s, legalActions(s, s.priorityPlayer));
  if (chosen.kind === "pass") { if (passPriority(s, null, stream).outcome === "step-ends") advance(s); } else applyAction(s, s.priorityPlayer, chosen);
  return null;
}
/* A game dealt and begun, its opening hands kept or not by its pilot. */
function begun(kind, seed) {
  const s = dealt(seed), stream = createRng(`game-${seed}`), pilot = pilotsFor(kind, seed);
  beginMulligans(s, stream);
  while (!mulligansDone(s)) { const a = pilot.answer(s, awaitingChoice(s)); resolveAwaiting(s, a.indices, a.amounts, stream); }
  beginGame(s);
  return {s, stream, pilot};
}
/* The asked player concedes: then the game is moving -- over, or someone still in it asked or holding priority, or a step
   with no priority in it ending -- and the answers until play has gone on from it (a player holding priority, nothing
   pending) are given and counted; what is refused after that is no part of anyone's leaving. */
function leaves(s, stream, pilot, label, limit, until) {
  const who = s.awaiting.player, kind = s.awaiting.effect ?? s.awaiting.kind;
  const resolvingAnother = Boolean(s.resolving) && s.stack.findLast((e) => e.stage === "resolving")?.playerId !== who;
  concede(s, who, stream);
  const moving = gameOver(s) || (s.awaiting ? !out(s, s.awaiting.player) : s.priorityPlayer !== null ? !out(s, s.priorityPlayer) : !s.resolving && !hasPriority(s));
  if (!moving) assert.fail(`${label}: after the concession, nothing is asked and nobody holds priority`);
  const tally = {refused: 0};
  let added = null;
  for (let m = 0; m < limit && !gameOver(s) && until(s); m += 1) {
    if (added === null && !s.awaiting && !s.resolving && s.priorityPlayer !== null) added = tally.refused;
    const wrong = step(s, pilot, stream, tally);
    if (wrong) assert.fail(`${label}: after the concession, ${wrong}`);
  }
  if (added ?? tally.refused) assert.fail(`${label}: the concession led to ${added ?? tally.refused} refused answer(s)`);
  return {kind, resolvingAnother};
}
const label = (s, seed, n) => `seed ${seed}, step ${n}, turn ${s.turn}: ${s.awaiting.kind}${s.awaiting.effect ? ` ${s.awaiting.effect}` : ""}`;

/* At every question, in a copy, played on to the end of the next turn. */
let forks = 0, duringAnother = 0;
const kinds = new Set();
for (const [kind, seed] of [["house", 1], ["house", 2], ["house", 3], ["house", 4], ["random", 5]]) {
  const {s, stream, pilot} = begun(kind, seed), ignored = {refused: 0};
  for (let n = 0; n < 20000 && !gameOver(s) && s.turn <= 30; n += 1) {
    if (s.awaiting && !out(s, s.awaiting.player)) {
      const fork = structuredClone(s), turn = s.turn;
      const left = leaves(fork, createRng(`fork-${seed}-${n}`), pilot, label(s, seed, n), 300, (x) => x.turn <= turn + 1);
      forks += 1;
      kinds.add(left.kind);
      if (left.resolvingAnother) duringAnother += 1;
    }
    const wrong = step(s, pilot, stream, ignored);
    if (wrong) assert.fail(`seed ${seed}, step ${n}: ${wrong}`);
  }
}
ok(forks > 150 && duringAnother > 5, `${forks} concessions at a question, ${duringAnother} of them during another player's resolution, of ${kinds.size} kinds: none stalls, asks or gives priority to anyone who has left, or leads to a refused answer`);

/* And in the game itself, played to its end: each player asked during another player's resolution concedes there -- and
   past turn 30 whoever is asked anything -- until the last one standing wins (CR 104.2a). */
let ended = 0, mainLine = 0;
const goneOn = (x) => !(x.priorityPlayer !== null && !x.awaiting && !x.resolving);
for (const [kind, seed] of [["house", 11], ["random", 12], ["house", 13]]) {
  const {s, stream, pilot} = begun(kind, seed), ignored = {refused: 0};
  for (let n = 0; n < 40000 && !gameOver(s); n += 1) {
    const another = s.awaiting && s.resolving && s.stack.findLast((e) => e.stage === "resolving")?.playerId !== s.awaiting.player;
    if (another || (s.awaiting && s.turn > 30)) { mainLine += leaves(s, stream, pilot, label(s, seed, n), 300, goneOn).resolvingAnother ? 1 : 0; continue; }
    const wrong = step(s, pilot, stream, ignored);
    if (wrong) assert.fail(`seed ${seed}, step ${n}: ${wrong}`);
  }
  const living = s.players.filter((p) => !p.lost).map((p) => p.id);
  if (living.length === 1 && gameOver(s)?.winner === living[0]) ended += 1;
}
eq(ended, 3, "three games played to their end through concessions while asked: none stalled, and in each the last player standing won");
ok(mainLine >= 3, `${mainLine} of those concessions during another player's resolution`);

console.log(`engine-x11-leave-questions: ${checks} checks passed -- a player leaving while asked: theirs to choose among is no choice, a cost not paid, another choice another opponent's; damage to them asked and dealt to nobody; the next defender, the next player's triggers; priority to the next player; and ${forks} fuzzed concessions, none stalling.`);
