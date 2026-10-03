/* A RESOLUTION THAT CAN STOP HALF WAY THROUGH AND CARRY ON.
 *
 * `docs/engine/PLAN.md` §6, phase 2.2, and §3.2.4 — "resume from any decision is a first-class
 * feature, not a recovery hack". Phase 1 made that true for turn-based actions. This makes it true
 * for card effects, which is where it actually gets used: "Scry 2, then draw a card" has to ask
 * between the two, and the draw must still happen afterwards.
 *
 * THE FOUR PRIMITIVES THAT ASK. `dig`, `scry`, `discard` and `modal` are 50 of the 821 API uses in
 * Rob's seven decks, and they were left out of 2.2a because none of them can be written as a
 * function that returns events — every one of them stops and waits for a person.
 *
 * A QUEUE, NOT A CALL STACK. A chosen mode's effects are spliced into the front of the queue rather
 * than run by recursion, which is what makes a modal containing a scry work: the scry stops the
 * resolution the same way it would at the top level, and what follows the modal is still waiting
 * behind it. Recursion would have had to unwind and rebuild itself across the pause.
 *
 * SCRY IS ASKED IN THE SHAPES THE BOARD DRAWS. CR 701.22a: put any number on the bottom IN ANY ORDER
 * and the rest on top IN ANY ORDER. It was one `manipulate` ordering whose answer had to carry
 * `toBottom`, which the board never sends, so at the table nothing could go under. Now it is a
 * pick-several and then an order for each end holding two or more, and every answer here goes
 * through the controller exactly as the board sends it: indices, and nothing else.
 *
 * DISCARD IS THE DISCARDING PLAYER'S CHOICE, not the spell's controller's. A card reading "each
 * opponent discards a card" asks each of them, one at a time.
 */
import assert from "node:assert/strict";
import {createState, addObject, cardsIn} from "../game/engine/state/index.mjs";
import {beginGame, awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {beginResolution, resolutionPending} from "../game/engine/script/resolution.mjs";
import {isBuilt, TOP_25} from "../game/engine/script/effects/index.mjs";
import {createController, CHOICE_MODES} from "../game/engine/controller.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const pod = {matchId: "m", seed: "s", players: [{name: "Rob"}, {name: "Krenko"}, {name: "Atraxa"}, {name: "Shadrix"}]};

function board() {
  const s = createState(pod);
  for (let seat = 0; seat < 4; seat += 1) {
    for (let i = 0; i < 20; i += 1)
      addObject(s, {card: `L${seat}-${i}`, owner: seat, controller: seat}, "library", seat);
    for (let i = 0; i < 4; i += 1)
      addObject(s, {card: `H${seat}-${i}`, owner: seat, controller: seat}, "hand", seat);
  }
  beginGame(s);
  const source = addObject(s, {card: "The Spell", types: ["Instant"], owner: 0, controller: 0}, "battlefield");
  return {s, source, ctx: {controller: 0, source}};
}
const libraryNames = (s, seat) => cardsIn(s, "library", seat).map((id) => s.objects[id].card);
const handNames = (s, seat) => cardsIn(s, "hand", seat).map((id) => s.objects[id].card);

/* THE BOARD'S PATH. The room offers the engine's choice through the controller; the board answers with the indices it
   collected and nothing else (crankmagic-board.js, "board-confirm": `send({indices: picked})`); the controller checks
   them against the choice; and the room hands the answer it took to the engine whole (game/room/room.mjs answerWith).
   An answer the board could not have sent is refused here, as the room would refuse it. */
let ids = 0;
function asTheBoard(s, indices) {
  const c = createController(), choice = awaitingChoice(s);
  c.offer(choice);
  c.answer({actionId: `00000000-0000-4000-8000-${String(++ids).padStart(12, "0")}`, revision: c.revision, kind: "answer", choiceId: choice.id, indices});
  const answer = c.take();
  return resolveAwaiting(s, answer.indices, answer.amounts, null, answer);
}
const byLabel = (s, names) => names.map((name) => awaitingChoice(s).options.find((o) => o.label === name).index);
const asked = (s) => { const c = awaitingChoice(s); return {mode: c.mode, min: c.min, max: c.max, title: c.title, options: c.options.map((o) => o.label)}; };

/* ---- all twenty-five are now built ---- */
{
  eq(TOP_25.filter((name) => !isBuilt(name)), [],
    "every one of the twenty-five measured primitives is implemented, by one route or the other");
  eq(TOP_25.length, 25, "all twenty-five of them");
}

/* ---- a resolution with nothing to ask runs straight through ---- */
{
  const {s, ctx} = board();
  const outcome = beginResolution(s, [{effect: "draw", count: 2, who: "you"},
    {effect: "gainLife", amount: 3, who: "you"}], ctx);
  eq(outcome.status, "done", "two effects with no questions finish in one go");
  eq(handNames(s, 0).length, 6, "both of them having happened");
  eq(s.players[0].life, 43, "in order");
  eq(resolutionPending(s), false, "and nothing is left waiting");
}

/* ---- scry stops, asks, and the rest of the resolution still happens ---- */
{
  const {s, ctx} = board();
  const top = libraryNames(s, 0).slice(0, 2);
  const outcome = beginResolution(s, [{effect: "scry", count: 2}, {effect: "draw", count: 1, who: "you"}], ctx);
  eq(outcome.status, "waiting", "scry stops the resolution");
  eq(s.awaiting.kind, "effect-choice", "and asks");
  eq(handNames(s, 0).length, 4, "THE DRAW HAS NOT HAPPENED YET — an engine that ran the rest first would draw the card it was about to decide the position of");

  eq(asked(s), {mode: "many", min: 0, max: 2, title: "Scry 2: choose any to put on the bottom", options: top},
    "the first question is a pick-several over the top two of the library: any of them to the bottom, none included (CR 701.22a)");

  /* Keep the first on top, send the second to the bottom -- the indices the board sends, and nothing beside them. */
  asTheBoard(s, byLabel(s, [top[1]]));
  eq(resolutionPending(s), false, "one card left on top has no order to choose, so that one answer finishes the resolution");
  eq(handNames(s, 0).length, 5, "and the draw that came after the scry happened");
  eq(handNames(s, 0)[4], top[0], "drawing the card the player chose to keep on top");
  eq(libraryNames(s, 0).at(-1), top[1], "with the one the player picked on the bottom: \"on the bottom\" is reachable from the board");
  eq(libraryNames(s, 0).length, 19, "and no card lost on the way");
}
{
  const {s, ctx} = board();
  const top = libraryNames(s, 0).slice(0, 1);
  beginResolution(s, [{effect: "scry", count: 1}], ctx);
  asTheBoard(s, []);
  eq([s.awaiting, libraryNames(s, 0)[0]], [null, top[0]], "scry 1 keeping it on top leaves it where it was, and asks nothing more");
}
{
  const {s, ctx} = board();
  const [a, b, c] = libraryNames(s, 0).slice(0, 3);
  beginResolution(s, [{effect: "scry", count: 3}], ctx);
  asTheBoard(s, []);
  eq(asked(s), {mode: "order", min: 3, max: 3, title: "Put the rest back on top of your library, the first you choose on top", options: [a, b, c]},
    "all three kept: then the order they go back in, a second pop-up");
  asTheBoard(s, byLabel(s, [c, a, b]));
  eq([s.awaiting, libraryNames(s, 0).slice(0, 4)], [null, [c, a, b, "L0-3"]], "the first chosen goes on top, in the player's order (CR 701.22a)");
}
{
  const {s, ctx} = board();
  const [a, b, c] = libraryNames(s, 0).slice(0, 3);
  beginResolution(s, [{effect: "scry", count: 3}], ctx);
  asTheBoard(s, byLabel(s, [a, b]));
  eq(asked(s), {mode: "order", min: 2, max: 2, title: "Put those on the bottom of your library, the last you choose at the very bottom", options: [a, b]},
    "two to the bottom: the bottom is in any order too (CR 701.22a), so the order they go under in is asked");
  eq(libraryNames(s, 0).slice(0, 3), [a, b, c], "and nothing has moved while the player is still choosing");
  asTheBoard(s, byLabel(s, [b, a]));
  eq(s.awaiting, null, "one card left on top: no third question");
  eq([libraryNames(s, 0)[0], libraryNames(s, 0).slice(-2)], [c, [b, a]], "the one kept on top, the two under everything with the last chosen at the very bottom");
}
{
  const {s, ctx} = board();
  const [a, b, c, d] = libraryNames(s, 0).slice(0, 4);
  beginResolution(s, [{effect: "scry", count: 4}, {effect: "draw", count: 1, who: "you"}], ctx);
  const modes = [awaitingChoice(s).mode];
  asTheBoard(s, byLabel(s, [d, b]));
  modes.push(awaitingChoice(s).mode);
  eq(awaitingChoice(s).options.map((o) => o.label), [b, d], "two under and two on top: the bottom's order first, over the two picked");
  asTheBoard(s, byLabel(s, [d, b]));
  modes.push(awaitingChoice(s).mode);
  eq(awaitingChoice(s).options.map((o) => o.label), [a, c], "then the top's order, over the two kept");
  eq(handNames(s, 0).length, 4, "with the draw behind the scry still waiting through all three questions");
  asTheBoard(s, byLabel(s, [c, a]));
  eq(modes, ["many", "order", "order"], "three questions: a pick-several, then an order for each end");
  ok(modes.every((mode) => CHOICE_MODES.includes(mode)) && modes.length === 3, "each a mode the controller declares and the board draws");
  eq([resolutionPending(s), handNames(s, 0).at(-1), libraryNames(s, 0)[0], libraryNames(s, 0).slice(-2), libraryNames(s, 0).length],
    [false, c, a, [d, b], 19], "the draw takes the card chosen first for the top; the other kept card is next; the two under end with b at the very bottom");
}
{
  const {s, ctx} = board();
  const looked = libraryNames(s, 0).slice(0, 3);
  beginResolution(s, [{effect: "scry", count: 3}], ctx);
  asTheBoard(s, byLabel(s, looked));
  eq(asked(s).options, looked, "all three to the bottom: their order is asked");
  asTheBoard(s, byLabel(s, looked));
  eq([s.awaiting, libraryNames(s, 0).slice(-3), libraryNames(s, 0)[0]], [null, looked, "L0-3"], "and nothing is left on top to order: two questions in all");
}
{
  /* What the board cannot send, the controller refuses before the engine sees it. */
  const {s, ctx} = board();
  beginResolution(s, [{effect: "scry", count: 2}], ctx);
  assert.throws(() => asTheBoard(s, [0, 0]), /Invalid selection/, "the pick-several refuses a card picked twice"); checks += 1;
  assert.throws(() => asTheBoard(s, [0, 1, 2]), /required number|Invalid selection/, "and more cards than were looked at"); checks += 1;
  asTheBoard(s, []);
  assert.throws(() => asTheBoard(s, [1]), /required number/, "the order takes every card kept, not some of them"); checks += 1;
  ok(s.awaiting && awaitingChoice(s).mode === "order", "and a refused answer leaves the question asked");
}
{
  /* A caller that skips a card in an order (the engine's own callers are not checked by the controller) never takes it
     out of the library: what it did not name goes after what it did, as it was. */
  const {s, ctx} = board();
  const [a, b, c] = libraryNames(s, 0).slice(0, 3);
  beginResolution(s, [{effect: "scry", count: 3}], ctx);
  resolveAwaiting(s, []);
  resolveAwaiting(s, [2]);
  eq([libraryNames(s, 0).slice(0, 3), libraryNames(s, 0).length], [[c, a, b], 20], "an order naming one card of three: it on top, the other two after it, none lost");
}
{
  /* The one question scry used to ask, `indices` the order and `toBottom` which go under, still means what it meant: a
     scenario written for it, or a caller not yet moved, plays the same. */
  const {s, ctx} = board();
  const [a, b] = libraryNames(s, 0).slice(0, 2);
  beginResolution(s, [{effect: "scry", count: 2}], ctx);
  resolveAwaiting(s, [1, 0], null, null, {toBottom: [0]});
  eq([s.awaiting, libraryNames(s, 0)[0], libraryNames(s, 0).at(-1)], [null, b, a], "the old one-question answer: finished at once, b on top and a under");
}
{
  const s = createState(pod);
  beginGame(s);
  beginResolution(s, [{effect: "scry", count: 2}], {controller: 0, source: null});
  eq(s.awaiting, null, "an empty library: nothing to look at, nothing asked");
}

/* ---- dig: look at N, take some, the rest go where the card says ---- */
{
  const {s, ctx} = board();
  const top = libraryNames(s, 0).slice(0, 3);
  beginResolution(s, [{effect: "dig", count: 3, take: 1, to: "hand", rest: "bottom"}], ctx);
  const choice = awaitingChoice(s);
  eq(choice.options.length, 3, "dig shows the top three");
  eq(choice.min, 1, "and asks for exactly what the card says to take");
  eq(choice.max, 1, "no more");

  resolveAwaiting(s, [1]);
  ok(handNames(s, 0).includes(top[1]), "the chosen card goes where the card says");
  eq(libraryNames(s, 0).slice(-2), [top[0], top[2]],
    "and the rest go to the bottom, in the order they were looked at");
  eq(resolutionPending(s), false, "the resolution is finished");
}
{
  const {s, ctx} = board();
  beginResolution(s, [{effect: "dig", count: 3, take: 1, to: "hand", rest: "graveyard"}], ctx);
  resolveAwaiting(s, [0]);
  eq(cardsIn(s, "graveyard", 0).length, 2, "'the rest into your graveyard' is the other common wording");
}

/* ---- discard is the DISCARDING player's choice ---- */
{
  const {s, ctx} = board();
  beginResolution(s, [{effect: "discard", count: 1, who: "opponent"}], ctx);
  eq(s.awaiting.kind, "effect-choice", "each opponent discards");
  eq(s.awaiting.player, 1,
    "and it is the DISCARDING player who is asked, not the spell's controller — a card reading 'each opponent discards a card' does not let you pick theirs");

  const first = awaitingChoice(s);
  eq(first.options.length, 4, "over their own hand");
  resolveAwaiting(s, [0]);
  eq(handNames(s, 1).length, 4, "chosen, and still in hand: every opponent chooses before anything is discarded (CR 101.4)");
  eq(s.awaiting.player, 2, "and the next opponent is asked in turn");
  resolveAwaiting(s, [0]);
  resolveAwaiting(s, [0]);
  eq(resolutionPending(s), false, "once every one of them has answered");
  eq([handNames(s, 1).length, handNames(s, 2).length, handNames(s, 3).length], [3, 3, 3], "then each discards the card they chose, together");
  eq(handNames(s, 0).length, 4, "the controller discarded nothing");
  eq(cardsIn(s, "graveyard", 1).length, 1, "and each discard went to its own graveyard");
}
{
  const {s, ctx} = board();
  beginResolution(s, [{effect: "discard", count: 2, who: "you"}], ctx);
  const choice = awaitingChoice(s);
  eq(choice.min, 2, "discarding two asks for two");
  eq(choice.max, 2, "exactly");
  resolveAwaiting(s, [0, 2]);
  eq(handNames(s, 0).length, 2, "and takes them");
  eq(cardsIn(s, "graveyard", 0).length, 2, "into the graveyard");
}

/* ---- modal, and the nesting that makes the queue necessary ---- */
{
  const {s, ctx} = board();
  beginResolution(s, [{effect: "modal", choose: 1, modes: [
    {text: "Draw two cards.", effects: [{effect: "draw", count: 2, who: "you"}]},
    {text: "Gain 5 life.", effects: [{effect: "gainLife", amount: 5, who: "you"}]},
  ]}], ctx);
  const choice = awaitingChoice(s);
  eq(choice.mode, "one", "choose one");
  eq(choice.options.map((o) => o.label), ["Draw two cards.", "Gain 5 life."],
    "each mode named by its own words, because 'mode 1' is not a choice anybody can make");

  resolveAwaiting(s, [1]);
  eq(s.players[0].life, 45, "the chosen mode happened");
  eq(handNames(s, 0).length, 4, "and the one not chosen did not");
}
{
  const {s, ctx} = board();
  beginResolution(s, [{effect: "modal", choose: 2, modes: [
    {text: "Draw a card.", effects: [{effect: "draw", count: 1, who: "you"}]},
    {text: "Gain 2 life.", effects: [{effect: "gainLife", amount: 2, who: "you"}]},
    {text: "Each opponent loses 1 life.", effects: [{effect: "loseLife", amount: 1, who: "opponent"}]},
  ]}], ctx);
  eq(awaitingChoice(s).min, 2, "choose two asks for two");
  resolveAwaiting(s, [0, 2]);
  eq(handNames(s, 0).length, 5, "the first chosen mode ran");
  eq(s.players[1].life, 39, "and so did the second");
  eq(s.players[0].life, 40, "while the unchosen one did not");
}
{
  /* THE CASE THE QUEUE EXISTS FOR: a modal whose chosen mode contains something that also asks,
     with an effect queued behind the whole modal. */
  const {s, ctx} = board();
  beginResolution(s, [
    {effect: "modal", choose: 1, modes: [
      {text: "Scry 2.", effects: [{effect: "scry", count: 2}]},
      {text: "Gain 3 life.", effects: [{effect: "gainLife", amount: 3, who: "you"}]},
    ]},
    {effect: "draw", count: 1, who: "you"},
  ], ctx);
  eq(awaitingChoice(s).mode, "one", "the modal asks first");
  resolveAwaiting(s, [0]);
  eq(s.awaiting.kind, "effect-choice", "and choosing the scry mode stops the resolution again");
  eq(awaitingChoice(s).title, "Scry 2: choose any to put on the bottom", "on the scry");
  eq(handNames(s, 0).length, 4, "with the draw behind the modal still waiting");
  asTheBoard(s, []);
  eq(handNames(s, 0).length, 4, "the scry's second question (the order of the two kept) still inside the mode, the draw still waiting");
  asTheBoard(s, [0, 1]);
  eq(handNames(s, 0).length, 5,
    "and only once the nested question is answered does what followed the modal happen — which is why it is a queue and not a call stack");
  eq(resolutionPending(s), false, "everything ran");
}

/* ---- a resolution is plain data and survives a checkpoint (§3.2.4) ---- */
{
  const {s, ctx} = board();
  beginResolution(s, [{effect: "scry", count: 2}, {effect: "draw", count: 1, who: "you"}], ctx);
  ok(resolutionPending(s), "a resolution is paused");
  const copy = JSON.parse(JSON.stringify(s));
  eq(copy.resolving.queue.length, s.resolving.queue.length,
    "the whole resolution is plain data — a game saved mid-effect resumes mid-effect, which is what §3.2.4 promises");
  ok(copy.awaiting, "with the question it is waiting on");
  asTheBoard(copy, [1]);
  eq(handNames(copy, 0).length, 5, "and the restored copy finishes the resolution on its own");
}
{
  /* Saved between scry's questions: the cards picked for the bottom are part of the question still being asked. */
  const {s, ctx} = board();
  const [a, b, c] = libraryNames(s, 0).slice(0, 3);
  beginResolution(s, [{effect: "scry", count: 3}], ctx);
  asTheBoard(s, byLabel(s, [a]));
  const copy = JSON.parse(JSON.stringify(s));
  eq(asked(copy).options, [b, c], "a game saved at scry's second question resumes at it, over the two kept");
  asTheBoard(copy, byLabel(copy, [c, b]));
  eq([libraryNames(copy, 0).slice(0, 2), libraryNames(copy, 0).at(-1)], [[c, b], a], "and finishes with the first answer's pick still on the bottom");
}

/* ---- refusals ---- */
{
  const {s, ctx} = board();
  beginResolution(s, [{effect: "scry", count: 2}], ctx);
  assert.throws(() => beginResolution(s, [{effect: "draw", count: 1}], ctx), /already|resolving/i,
    "a second resolution cannot start over one that is paused"); checks += 1;
}

console.log(`engine-resolution: ${checks} checks passed — all twenty-five measured primitives, a resolution that stops and carries on, scry asked as the board's pop-ups (any to the bottom, then each end's order), and a modal containing a scry with an effect still queued behind it.`);
