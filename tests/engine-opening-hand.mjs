/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* TRAIN C, PHASE 2 (w2c-hands-triggers): AN OPENING HAND'S ACTIONS (CR 103.6), AND THE FIRST UPKEEP'S DELAYED TRIGGER.
 *
 * Chancellor of the Forge: "you may reveal this card from your opening hand. If you do, at the beginning of the first upkeep,
 * create a 1/1 red Phyrexian Goblin creature token with haste." Once the mulligans are done, the starting player is asked,
 * then each other player in turn order (CR 103.6), a card at a time (rules/mulligan.mjs, the static `opening-hand`); a card
 * revealed is named in the journal and shown to every player until the first turn begins (CR 103.6b), and what revealing
 * it does is done -- a delayed trigger, the card its source and the player its controller (CR 603.7g), at the beginning of
 * the first upkeep. Scenarios begin after the opening, so all of it is here: the questions and their order, the reveal in
 * another seat's view and the journal's words, the triggers at the first upkeep and not one more, a hand not revealed, and
 * the house pilot's answer.
 */
import assert from "node:assert/strict";
import {createState, addObject} from "../game/engine/state/index.mjs";
import {beginGame, advance, awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";
import {beginMulligans} from "../game/engine/rules/mulligan.mjs";
import {projectFor} from "../game/engine/projection.mjs";
import {housePilot} from "../game/engine/pilots/house-pilot.mjs";
import {historyLines} from "../game/room/history.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {compileScript} from "../game/engine/cards/index.mjs";
import {secretsFor} from "../tools/fuzz-live.mjs";
import {createRng} from "../game/engine/rng.mjs";

let checks = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };
const throws = (f, ...m) => { assert.throws(f, ...m); checks += 1; };

const cards = loadCardIndex();
const CHANCELLOR = "Chancellor of the Forge";
const WASTES = {card: "Wastes", types: ["Land"], supertypes: ["Basic"], abilities: [{id: "a0", kind: "mana", tapSelf: true, produces: {C: 1}}]};
/* Each library its seven cards, so each opening hand is all of them: Rob's one Chancellor, Maya's two. */
function opening(chancellors = [1, 2]) {
  const s = createState({matchId: "m", seed: "opening-hand", players: [{name: "Rob"}, {name: "Maya"}]});
  chancellors.forEach((n, seat) => { for (let i = 0; i < 7; i += 1) addObject(s, {...(i < n ? {...cards.definition(CHANCELLOR), card: CHANCELLOR} : WASTES), owner: seat, controller: seat}, "library", seat); });
  const rng = createRng("opening-hand");
  const events = beginMulligans(s, rng);
  /* Both keep. */
  while (s.awaiting?.kind === "mulligan-decision") events.push(...resolveAwaiting(s, [0], null, rng));
  return {s, rng, events};
}
const handOf = (s, viewer, owner) => projectFor(s, viewer).players[owner].zones.Hand.cards.map((c) => c.name).filter(Boolean).sort();
const choose = (s, rng, label) => resolveAwaiting(s, [awaitingChoice(s).options.find((o) => o.label === label).index], null, rng);
const goblins = (s, owner) => s.zones.battlefield.filter((id) => s.objects[id].card === "Phyrexian Goblin" && s.objects[id].controller === owner).length;
function toUpkeepAndResolve(s, rng) {
  beginGame(s);
  for (let n = 0; n < 20 && s.phase !== "UPKEEP"; n += 1) advance(s);
  const waiting = s.stack.length + (s.pendingTriggers ?? []).length;
  for (let n = 0; n < 20 && (s.stack.length || s.awaiting); n += 1) { if (s.awaiting) resolveAwaiting(s, [0], null, rng); else passPriority(s, null, rng); }
  return waiting;
}

{
  /* The starting player first: Rob, his Chancellor or the game begun. */
  const {s, rng} = opening();
  eq([s.awaiting?.kind, s.awaiting?.player, awaitingChoice(s).options.map((o) => o.label)], ["opening-hand", 0, ["Reveal Chancellor of the Forge", "Begin the game"]], "Rob is asked first");
  throws(() => resolveAwaiting(structuredClone(s), [5], null, rng), /Choose a card to reveal, or begin the game/, "an answer it does not offer is refused");
  const events = choose(s, rng, "Reveal Chancellor of the Forge");
  eq(events.filter((e) => e.kind === "GameEventCardRevealed").flatMap((e) => historyLines(e, ["Rob", "Maya"]).map((l) => l.text)), ["Rob revealed Chancellor of the Forge"], "revealed: the table's history says so");
  eq([handOf(s, 1, 0), secretsFor(s, 1).has(CHANCELLOR)], [[CHANCELLOR], false], "and Maya sees it in his hand, no secret of his");
  /* His only one revealed: Maya next, her two, one at a time. */
  eq([s.awaiting?.player, awaitingChoice(s).options.map((o) => o.label)], [1, ["Reveal Chancellor of the Forge", "Reveal Chancellor of the Forge", "Begin the game"]], "then Maya, her two");
  choose(s, rng, "Reveal Chancellor of the Forge");
  eq(awaitingChoice(s).options.map((o) => o.label), ["Reveal Chancellor of the Forge", "Begin the game"], "one revealed: the other offered");
  choose(s, rng, "Begin the game");
  eq([s.awaiting ?? null, s.mulligan.done, (s.delayedTriggers ?? []).map((d) => [d.at, d.controller, s.objects[d.source]?.card])], [null, true, [["upkeep", 0, CHANCELLOR], ["upkeep", 1, CHANCELLOR]]],
    "done: two delayed triggers, each its card's, each its player's");
  eq(handOf(s, 0, 1), [CHANCELLOR], "Rob sees the one she revealed, not her other");
  /* The first upkeep -- Rob's -- each makes its Goblin with haste; and the first turn begun, Rob's card is his own again. */
  eq(toUpkeepAndResolve(s, rng), 2, "the first upkeep: both trigger");
  eq([goblins(s, 0), goblins(s, 1), handOf(s, 1, 0)], [1, 1, []], "a Goblin each; the turn begun, his hand his own again");
  const goblin = s.zones.battlefield.find((id) => s.objects[id].card === "Phyrexian Goblin");
  eq([s.objects[goblin].keywords.includes("Haste"), (s.delayedTriggers ?? []).length], [true, 0], "with haste, and the delayed triggers spent");
  /* Not at the next upkeep. */
  const least = () => { const c = awaitingChoice(s); return c.options.slice(0, c.min ?? 0).map((o) => o.index); };
  for (let n = 0; n < 200 && !(s.turn === 2 && s.phase === "UPKEEP"); n += 1) { if (s.awaiting) resolveAwaiting(s, least(), null, rng); else if (s.priorityPlayer === null) advance(s); else { const out = passPriority(s, null, rng); if (out.outcome === "step-ends") advance(s); } }
  eq([s.turn, s.phase, goblins(s, 0) + goblins(s, 1)], [2, "UPKEEP", 2], "Maya's upkeep: no more");
}
{
  /* Not revealed: nothing at the first upkeep. */
  const {s, rng} = opening([1, 0]);
  choose(s, rng, "Begin the game");
  eq([s.awaiting ?? null, (s.delayedTriggers ?? []).length, handOf(s, 1, 0)], [null, 0, []], "begun without it: no delayed trigger, nothing shown");
  eq([toUpkeepAndResolve(s, rng), goblins(s, 0)], [0, 0], "and no Goblin");
  /* Revealed, Maya holding none: no secret from her until the first turn begins; then, to the state alone, his again (the
     journal is what remembers it, tools/fuzz-live.mjs). */
  const shown = opening([1, 0]);
  choose(shown.s, shown.rng, "Reveal Chancellor of the Forge");
  eq([shown.s.awaiting ?? null, secretsFor(shown.s, 1).has(CHANCELLOR)], [null, false], "his one revealed, nothing more to ask; before the first turn: shown");
  beginGame(shown.s);
  eq(secretsFor(shown.s, 1).has(CHANCELLOR), true, "the first turn begun: hidden again");
}
{
  /* What the compiler refuses: an opening hand's action other than a reveal's delayed trigger. */
  const script = (effects) => ({schema: "CrankCardScript@1", identity: {name: "Odd", oracleId: "x", types: ["Enchantment"], subtypes: [], manaCost: "{2}", colors: [], colorIdentity: []},
    oracleText: "Odd.", abilities: [{kind: "static", text: "Odd.", rule: "opening-hand", affects: {what: "card", self: true}, effects}]});
  const refused = (effects) => compileScript(script(effects)).problems.some((p) => p.includes("an opening hand's action"));
  eq([refused([{effect: "delayedTrigger", at: "upkeep", effects: [{effect: "gainLife", amount: 1}]}]), refused([{effect: "moveZone", targets: "self", to: "battlefield"}]), refused([])],
    [false, true, true], "a delayed trigger, and nothing else");
}
{
  /* No card with an opening-hand action: nobody is asked. The house pilot reveals what it may, then begins. */
  const none = opening([0, 0]);
  eq([none.s.awaiting ?? null, none.s.mulligan.done], [null, true], "nothing to reveal: no question");
  const {s, rng} = opening([1, 0]);
  const pilot = housePilot({seat: 0});
  for (let n = 0; n < 4 && s.awaiting; n += 1) resolveAwaiting(s, pilot.answer(projectFor(s, 0), awaitingChoice(s)).indices, null, rng);
  eq([(s.delayedTriggers ?? []).length, s.mulligan.done], [1, true], "the house pilot: revealed, then begun");
}

console.log(`engine-opening-hand: ${checks} checks passed -- an opening hand's actions asked once the mulligans are done, the starting player first, a card at a time; a card revealed shown to everyone until the first turn begins, its delayed trigger at the first upkeep and no other.`);
