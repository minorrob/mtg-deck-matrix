/* REPLACEMENT AND PREVENTION: THE EVENT THAT NEVER HAPPENS.
 *
 * `docs/engine/PLAN.md` §3.3 (replacement and prevention, CR 614 and 615; "affected object's
 * controller orders", CR 616.1).
 *
 * A REPLACEMENT EFFECT IS NOT A TRIGGER. It does not use the stack, nobody gets priority, and it
 * cannot be responded to. It waits for an event that WOULD happen and changes it before it does, so
 * the original never occurs at all: a creature that would die and is exiled instead did not die,
 * and nothing that watches for deaths sees one. Modeling this as a trigger that undoes the event
 * afterwards produces a game where "whenever a creature dies" fires on creatures that never died.
 *
 * EACH EFFECT APPLIES ONCE TO A GIVEN EVENT (CR 614.5). Without that rule two effects that each
 * modify a zone change can bounce the event between them forever, which is a hang rather than a
 * wrong answer — and a hang in the middle of state-based actions is unreportable.
 *
 * WHEN SEVERAL APPLY, THE AFFECTED OBJECT'S CONTROLLER CHOOSES THE ORDER (CR 616.1) — not the
 * effects' controllers, and not the engine. The player whose creature is about to be replaced out
 * of existence is the one who picks which replacement happens first, and the order changes the
 * outcome whenever the first one removes the second's opportunity.
 *
 * PREVENTION IS A SHIELD THAT WEARS OUT (CR 615.1). "Prevent the next 3 damage" against 5 leaves 2
 * getting through and the shield spent; against 1 it leaves 2 of the shield for later.
 */
import assert from "node:assert/strict";
import {createState, addObject, cardsIn, zoneOf} from "../game/engine/state/index.mjs";
import {beginGame} from "../game/engine/rules/turn.mjs";
import {applyReplacements, replacementChoice, resolveReplacementOrder} from "../game/engine/rules/replacement.mjs";
import {checkStateBasedActions} from "../game/engine/rules/sba.mjs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const pod = {matchId: "m", seed: "s", players: [{name: "Rob"}, {name: "Krenko"}, {name: "Atraxa"}, {name: "Shadrix"}]};
const creature = (over) => ({types: ["Creature"], power: 2, toughness: 2, ...over});

function started() {
  const s = createState(pod);
  for (let seat = 0; seat < 4; seat += 1)
    for (let i = 0; i < 40; i += 1)
      addObject(s, {card: `L${seat}-${i}`, owner: seat, controller: seat}, "library", seat);
  beginGame(s);
  return s;
}

/* A replacement effect is data over the same proposals the rules modules raise, so phase 2's card
   script compiles to this rather than to a private vocabulary. */
const REST_IN_PEACE = {id: "rip", kind: "replacement", text: "If a creature would die, exile it instead.",
  watches: {event: "zone-change", from: "battlefield", to: "graveyard"},
  change: {to: "exile"}};
const SHIELD = (amount) => ({id: `shield-${amount}`, kind: "replacement",
  text: `Prevent the next ${amount} damage that would be dealt to you this turn.`,
  watches: {event: "damage", toPlayer: "controller"},
  prevent: amount});

/* ---- nothing applies: the proposal comes back as it was ---- */
{
  const s = started();
  const bear = addObject(s, creature({card: "Bear", owner: 0, controller: 0}), "battlefield");
  const result = applyReplacements(s, {event: "zone-change", objectId: bear, from: "battlefield", to: "graveyard", player: 0});
  eq(result.proposal.to, "graveyard", "with no replacement effects around, a proposal is unchanged");
  eq(result.awaiting, false, "and nobody is asked anything");
}

/* ---- a zone change replaced (CR 614.1) ---- */
{
  const s = started();
  addObject(s, {card: "Rest in Peace", types: ["Enchantment"], owner: 1, controller: 1,
    abilities: [REST_IN_PEACE]}, "battlefield");
  const bear = addObject(s, creature({card: "Bear", owner: 0, controller: 0}), "battlefield");
  const result = applyReplacements(s, {event: "zone-change", objectId: bear, from: "battlefield", to: "graveyard", player: 0});
  eq(result.proposal.to, "exile", "the creature is exiled instead of dying");
  eq(result.applied, ["rip"], "and the effect that did it is recorded");
}
{
  /* END TO END: the state-based action that would kill it consults the replacement first, so the
     creature never reaches a graveyard and nothing that watches for a death sees one. */
  const s = started();
  addObject(s, {card: "Rest in Peace", types: ["Enchantment"], owner: 1, controller: 1,
    abilities: [REST_IN_PEACE]}, "battlefield");
  const bear = addObject(s, creature({card: "Bear", owner: 0, controller: 0}), "battlefield");
  s.objects[bear].damage = 5;
  const events = checkStateBasedActions(s);
  eq(cardsIn(s, "graveyard", 0).length, 0, "it did not die");
  eq(cardsIn(s, "exile").length, 1, "it was exiled instead");
  const move = events.find((e) => e.kind === "GameEventCardChangeZone");
  eq(move.data.fields.to.zoneType, "Exile",
    "and the board is told it went to exile — an engine that reported a death and then moved it would be describing an event that never happened");
}

/* ---- each effect applies once to a given event (CR 614.5) ---- */
{
  const s = started();
  /* Two effects that both watch a creature dying and send it somewhere different. Whichever goes
     first takes the event away from the other, so the ORDER DECIDES THE OUTCOME — which is exactly
     why CR 616.1 gives the choice to the player whose creature it is. */
  const EXILE = {...REST_IN_PEACE, id: "one"};
  const BOUNCE = {id: "two", kind: "replacement", text: "If a creature would die, return it to its owner's hand instead.",
    watches: {event: "zone-change", from: "battlefield", to: "graveyard"}, change: {to: "hand"}};
  const stage = () => {
    const board = started();
    addObject(board, {card: "One", types: ["Enchantment"], owner: 1, controller: 1, abilities: [EXILE]}, "battlefield");
    addObject(board, {card: "Two", types: ["Enchantment"], owner: 1, controller: 1, abilities: [BOUNCE]}, "battlefield");
    const target = addObject(board, creature({card: "Bear", owner: 0, controller: 0}), "battlefield");
    return {board, target};
  };

  const {board, target} = stage();
  const first = applyReplacements(board, {event: "zone-change", objectId: target, from: "battlefield", to: "graveyard", player: 0});
  eq(first.awaiting, true, "with two applicable effects the engine stops and asks");
  eq(board.awaiting.kind, "order-replacements", "which replacement applies first");
  eq(board.awaiting.player, 0,
    "and it is the AFFECTED object's controller who chooses (CR 616.1), not the effects' controller");

  const choice = replacementChoice(board, board.awaiting);
  eq(choice.mode, "one", "one of them goes first");
  eq(choice.options.length, 2, "over both");
  ok(choice.options.every((o) => o.label.includes("would die")), "each named by its own text");

  const exiled = resolveReplacementOrder(board, board.awaiting, [0]);
  eq(exiled.proposal.to, "exile", "choosing the exile effect exiles it");
  eq(exiled.applied, ["one"],
    "and the other no longer applies at all — the event it was watching for is gone, which is CR 614 working on the event AS IT NOW IS");
  eq(board.awaiting, null, "the wait is over");

  const other = stage();
  applyReplacements(other.board, {event: "zone-change", objectId: other.target, from: "battlefield", to: "graveyard", player: 0});
  const bounced = resolveReplacementOrder(other.board, other.board.awaiting, [1]);
  eq(bounced.proposal.to, "hand", "choosing the other one sends it to its owner's hand instead");
  eq(bounced.applied, ["two"], "and now the first is the one that lost its opportunity");
  ok(exiled.proposal.to !== bounced.proposal.to,
    "the same board, the same death, two outcomes — which is why the choice is the affected player's and not the engine's");
  void s;
}

/* ---- prevention wears out (CR 615.1) ---- */
{
  const s = started();
  const shield = addObject(s, {card: "Shield", types: ["Enchantment"], owner: 0, controller: 0,
    abilities: [SHIELD(3)]}, "battlefield");
  const result = applyReplacements(s, {event: "damage", toPlayer: 0, amount: 5, sourceId: null});
  eq(result.proposal.amount, 2, "three of five prevented leaves two getting through");
  eq(s.objects[shield].abilities[0].prevent, 0, "and the shield is spent");
}
{
  const s = started();
  const shield = addObject(s, {card: "Shield", types: ["Enchantment"], owner: 0, controller: 0,
    abilities: [SHIELD(3)]}, "battlefield");
  const result = applyReplacements(s, {event: "damage", toPlayer: 0, amount: 1, sourceId: null});
  eq(result.proposal.amount, 0, "one point against a three-point shield is all prevented");
  eq(s.objects[shield].abilities[0].prevent, 2, "with two of the shield left for later");
}
{
  const s = started();
  addObject(s, {card: "Shield", types: ["Enchantment"], owner: 0, controller: 0,
    abilities: [SHIELD(3)]}, "battlefield");
  const result = applyReplacements(s, {event: "damage", toPlayer: 1, amount: 5, sourceId: null});
  eq(result.proposal.amount, 5,
    "a shield on one player does nothing for another — 'dealt to you' means its controller");
}
{
  const s = started();
  addObject(s, {card: "Spent", types: ["Enchantment"], owner: 0, controller: 0,
    abilities: [SHIELD(0)]}, "battlefield");
  const result = applyReplacements(s, {event: "damage", toPlayer: 0, amount: 4, sourceId: null});
  eq(result.proposal.amount, 4, "a spent shield is not an applicable effect and is not offered");
  eq(result.awaiting, false, "so nothing is asked");
}

/* ---- an event reduced to nothing does not happen at all (CR 615.4) ---- */
{
  const s = started();
  addObject(s, {card: "Big Shield", types: ["Enchantment"], owner: 0, controller: 0,
    abilities: [SHIELD(9)]}, "battlefield");
  const result = applyReplacements(s, {event: "damage", toPlayer: 0, amount: 4, sourceId: null});
  eq(result.proposal.amount, 0, "all of it prevented");
  eq(result.proposal.prevented, true,
    "and the event is marked as not happening, so a caller does not report zero damage as damage");
}

/* ---- the effect must be somewhere it can act (CR 113.6) ---- */
{
  const s = started();
  addObject(s, {card: "Rest in Peace", types: ["Enchantment"], owner: 1, controller: 1,
    abilities: [REST_IN_PEACE]}, "graveyard", 1);
  const bear = addObject(s, creature({card: "Bear", owner: 0, controller: 0}), "battlefield");
  const result = applyReplacements(s, {event: "zone-change", objectId: bear, from: "battlefield", to: "graveyard", player: 0});
  eq(result.proposal.to, "graveyard", "a replacement effect in a graveyard is not affecting the battlefield");
}

/* ---- refusals ---- */
{
  const s = started();
  assert.throws(() => resolveReplacementOrder(s, {kind: "order-replacements", player: 0}, [0]),
    /not waiting|no replacement/i, "answering a question nobody asked is refused"); checks += 1;
}

/* ---- two effects that end the same are no choice (CR 616.1; the plan review's C2) ----
   Two players' "exile it instead" both apply to a third player's creature dying. Either order exiles it, so the order is
   not asked: before, the engine asked a question nothing could answer, the creature went to the graveyard after all, and
   the game stopped. */
{
  const board = started();
  addObject(board, {card: "One", types: ["Enchantment"], owner: 1, controller: 1, abilities: [{...REST_IN_PEACE, id: "one"}]}, "battlefield");
  addObject(board, {card: "Two", types: ["Enchantment"], owner: 2, controller: 2, abilities: [{...REST_IN_PEACE, id: "two"}]}, "battlefield");
  const target = addObject(board, creature({card: "Bear", owner: 0, controller: 0}), "battlefield");
  const result = applyReplacements(board, {event: "zone-change", objectId: target, from: "battlefield", to: "graveyard", player: 0});
  eq([result.awaiting, board.awaiting, result.proposal.to], [false, null, "exile"], "two effects that both exile it: exiled, and nobody is asked");
}
{
  const index = loadCardIndex();
  const BEAR = {types: ["Creature"], manaCost: "{1}{G}", colors: ["G"], power: 2, toughness: 2};
  const {state} = runScenario({name: "two Liesas", seats: 3, setup: [{seat: 0, zone: "battlefield", cards: ["Liesa, Forgotten Archangel", "Mountain"]},
    {seat: 1, zone: "battlefield", cards: ["Liesa, Forgotten Archangel"]}, {seat: 2, zone: "battlefield", cards: ["Bear"]}, {seat: 0, zone: "hand", cards: ["Lightning Bolt"]}],
  steps: [{tap: "Mountain"}, {cast: "Lightning Bolt", targets: [{card: "Bear"}]}, {resolve: true}, {expect: [{seat: 2, zone: "exile", cards: ["Bear"]}]},
    {to: {turn: 2, phase: "MAIN1"}}]}, index.definition, {Bear: BEAR});
  eq(state.awaiting, null, "with Liesa under two players, Trey's Bear bolted is exiled, and the game goes on");
}

console.log(`engine-replacement: ${checks} checks passed — a replaced event never happens, each effect applies once, the affected object's controller chooses the order, and a shield wears out.`);
