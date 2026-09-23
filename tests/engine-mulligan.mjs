/* THE LONDON MULLIGAN: CR 103.5.
 *
 * `docs/engine/PLAN.md` §3.3, thirteenth row ("London mulligan, four players"), and the last piece
 * of phase 1.
 *
 * YOU ALWAYS DRAW SEVEN. That is what makes it the London mulligan rather than the Paris one: a
 * player taking their third mulligan still sees seven cards, and then puts three of them on the
 * bottom. An engine that draws six, then five, is playing a rule that was replaced in 2019 — and it
 * is a rule that changes which hands are keepable, so nobody would mistake it for a rounding error.
 *
 * THE BOTTOMING HAPPENS WHEN YOU KEEP, NOT WHEN YOU MULLIGAN. A player who mulligans twice and
 * keeps the third hand bottoms two cards from that hand — which is why the choice has to come after
 * the decision to keep, and has to be over the hand they actually kept.
 *
 * WHICH CARDS GO TO THE BOTTOM IS THE PLAYER'S CHOICE, and it is the most consequential decision in
 * the opening. An engine that bottoms the last N cards drawn is not bottoming, it is punishing.
 *
 * EVERY SEAT DECIDES BEFORE ANYONE REDRAWS. In a four-player game the decisions of a round happen
 * together; an engine that resolves one seat completely before asking the next lets a later seat's
 * shuffle depend on an earlier seat's choice, and the game stops being reproducible from its pod
 * and seed alone.
 */
import assert from "node:assert/strict";
import {createState, addObject, cardsIn} from "../game/engine/state/index.mjs";
import {awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {beginMulligans, mulligansDone} from "../game/engine/rules/mulligan.mjs";
import {createRng} from "../game/engine/rng.mjs";
import {hashState} from "../game/engine/journal.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const pod = {matchId: "m", seed: "s", players: [{name: "Rob"}, {name: "Krenko"}, {name: "Atraxa"}, {name: "Shadrix"}]};

function dealt() {
  const s = createState(pod);
  for (let seat = 0; seat < 4; seat += 1)
    for (let i = 0; i < 99; i += 1)
      addObject(s, {card: `S${seat}-${i}`, owner: seat, controller: seat}, "library", seat);
  return s;
}

/* Answer whatever is pending: `keep` decides every mulligan question, and bottoming takes the
   first N cards so the test's own choices do not wander between runs. */
function play(state, rng, keep) {
  let guard = 0;
  while (!mulligansDone(state) && guard < 200) {
    guard += 1;
    const awaiting = state.awaiting;
    if (!awaiting) throw new Error("nothing pending and not done");
    if (awaiting.kind === "mulligan-decision") {
      resolveAwaiting(state, [keep(awaiting.player, state) ? 0 : 1], null, rng);
    } else {
      const choice = awaitingChoice(state);
      resolveAwaiting(state, choice.options.slice(0, awaiting.count).map((_, i) => i), null, rng);
    }
  }
  return state;
}

/* ---- everybody draws seven ---- */
{
  const s = dealt();
  beginMulligans(s, createRng("open"));
  for (let seat = 0; seat < 4; seat += 1) eq(cardsIn(s, "hand", seat).length, 7, "seven cards each to open");
  eq(cardsIn(s, "library", 0).length, 92, "off the top of a shuffled library");
  eq(s.awaiting.kind, "mulligan-decision", "and the first seat is asked");
  eq(s.awaiting.player, 0, "the starting player decides first (CR 103.5)");

  const choice = awaitingChoice(s);
  eq(choice.mode, "boolean", "keep or mulligan");
  ok(choice.options[0].label.toLowerCase().includes("keep"), "with keeping first");
}

/* ---- keeping the first hand costs nothing ---- */
{
  const s = dealt();
  beginMulligans(s, createRng("keep-all"));
  play(s, createRng("keep-all"), () => true);
  ok(mulligansDone(s), "with everybody keeping, the mulligans are over");
  for (let seat = 0; seat < 4; seat += 1) {
    eq(cardsIn(s, "hand", seat).length, 7, "and every seat has seven");
    eq(cardsIn(s, "library", seat).length, 92, "with the rest of the deck under them");
  }
}

/* ---- a mulligan draws SEVEN again, and costs one card on keeping ---- */
{
  const s = dealt();
  const rng = createRng("one-mull");
  beginMulligans(s, rng);
  const opening = cardsIn(s, "hand", 0).map((id) => s.objects[id].card);

  /* Seat 0 mulligans once and then keeps; everybody else keeps at once. In a FOUR-player game the
     first mulligan is free (CR 103.5c), so nothing goes to the bottom and the hand is still seven. */
  let mulliganed = false;
  play(s, rng, (player) => {
    if (player !== 0) return true;
    if (mulliganed) return true;
    mulliganed = true;
    return false;
  });

  eq(cardsIn(s, "hand", 0).length, 7,
    "after one mulligan a kept hand is still SEVEN — in a multiplayer game the first mulligan is free (CR 103.5c), which is the common path here because every game this engine plays has four seats");
  eq(cardsIn(s, "library", 0).length, 92, "with the rest of the deck under it and nothing bottomed");
  const now = cardsIn(s, "hand", 0).map((id) => s.objects[id].card);
  ok(now.join() !== opening.join(),
    "and it is a genuinely new hand, not the old one with a card removed — the first hand went back and was shuffled");
  for (const seat of [1, 2, 3]) eq(cardsIn(s, "hand", seat).length, 7, "seats that kept are untouched");
}

/* ---- the bottomed card is the player's choice, over the hand they kept ---- */
{
  const s = dealt();
  const rng = createRng("choose");
  beginMulligans(s, rng);
  let mulliganed = 0;
  let guard = 0;
  let bottomChoice = null;
  while (!mulligansDone(s) && guard < 200) {
    guard += 1;
    const awaiting = s.awaiting;
    if (awaiting.kind === "mulligan-decision") {
      /* TWO mulligans, because the first is free in a multiplayer game (CR 103.5c) and a free one
         bottoms nothing -- there would be no question to ask. */
      const keep = awaiting.player !== 0 || mulliganed >= 2;
      if (awaiting.player === 0 && mulliganed < 2) mulliganed += 1;
      resolveAwaiting(s, [keep ? 0 : 1], null, rng);
      continue;
    }
    if (awaiting.player === 0 && !bottomChoice) {
      bottomChoice = awaitingChoice(s);
      eq(bottomChoice.mode, "many", "bottoming is a selection");
      eq(bottomChoice.min, 1, "of exactly the number of mulligans taken");
      eq(bottomChoice.max, 1, "no more and no fewer");
      eq(bottomChoice.options.length, 7,
        "over the SEVEN cards just drawn — the choice is over the hand actually kept, which is the whole point of the London rule");
      const target = bottomChoice.options[3];
      resolveAwaiting(s, [3], null, rng);
      const left = cardsIn(s, "hand", 0).map((id) => s.objects[id].card);
      ok(!left.includes(target.label), "the card the player chose is the one that went");
      eq(left.length, 6, "leaving six");
      const library = cardsIn(s, "library", 0).map((id) => s.objects[id].card);
      eq(library[library.length - 1], target.label,
        "and it went to the BOTTOM of the library, not the top — which is the difference between a mulligan and a scry");
      continue;
    }
    const choice = awaitingChoice(s);
    resolveAwaiting(s, choice.options.slice(0, awaiting.count).map((_, i) => i), null, rng);
  }
  ok(bottomChoice, "the player was asked");
}

/* ---- three mulligans still draws seven, and bottoms three ---- */
{
  const s = dealt();
  const rng = createRng("three");
  beginMulligans(s, rng);
  let taken = 0;
  let sawSeven = false;
  let guard = 0;
  while (!mulligansDone(s) && guard < 200) {
    guard += 1;
    const awaiting = s.awaiting;
    if (awaiting.kind === "mulligan-decision") {
      if (awaiting.player === 0 && taken < 3) {
        eq(cardsIn(s, "hand", 0).length, 7,
          taken === 0 ? "every mulligan draws SEVEN, not six then five — that rule was replaced in 2019" : true);
        checks -= taken === 0 ? 0 : 1;
        taken += 1;
        resolveAwaiting(s, [1], null, rng);
        continue;
      }
      resolveAwaiting(s, [0], null, rng);
      continue;
    }
    if (awaiting.player === 0) {
      eq(awaiting.count, 2,
        "three mulligans means TWO cards to the bottom, because the first one was free (CR 103.5c)");
      sawSeven = awaitingChoice(s).options.length === 7;
    }
    const choice = awaitingChoice(s);
    resolveAwaiting(s, choice.options.slice(0, awaiting.count).map((_, i) => i), null, rng);
  }
  ok(sawSeven, "chosen from a full seven");
  eq(cardsIn(s, "hand", 0).length, 5, "and a five-card hand is what three mulligans leaves");
  eq(cardsIn(s, "library", 0).length, 94, "with the whole rest of the deck below");
}

/* ---- you cannot bottom more cards than you have ---- */
{
  const s = dealt();
  const rng = createRng("desperate");
  beginMulligans(s, rng);
  let taken = 0;
  let guard = 0;
  while (!mulligansDone(s) && guard < 400) {
    guard += 1;
    const awaiting = s.awaiting;
    if (awaiting.kind === "mulligan-decision") {
      /* Nine mulligans, which no person would take and a random pilot takes regularly. */
      const mull = awaiting.player === 0 && taken < 9;
      if (mull) taken += 1;
      resolveAwaiting(s, [mull ? 1 : 0], null, rng);
      continue;
    }
    if (awaiting.player === 0) {
      eq(awaiting.count, 7,
        "nine mulligans asks for seven cards, not nine — a hand of seven has seven to give, and asking for more is a question with no legal answer");
    }
    const choice = awaitingChoice(s);
    resolveAwaiting(s, choice.options.slice(0, awaiting.count).map((_, i) => i), null, rng);
  }
  ok(mulligansDone(s), "so the opening still settles");
  eq(cardsIn(s, "hand", 0).length, 0, "on a hand of nothing, which is a legal way to start a game");
}

/* ---- a seat that keeps is not asked again ---- */
{
  const s = dealt();
  const rng = createRng("asked-once");
  beginMulligans(s, rng);
  const asked = [];
  let round = 0;
  let guard = 0;
  while (!mulligansDone(s) && guard < 200) {
    guard += 1;
    const awaiting = s.awaiting;
    if (awaiting.kind === "mulligan-decision") {
      asked.push(awaiting.player);
      /* Seat 2 mulligans twice; everybody else keeps immediately. */
      const mull = awaiting.player === 2 && round < 2;
      if (mull) round += 1;
      resolveAwaiting(s, [mull ? 1 : 0], null, rng);
      continue;
    }
    const choice = awaitingChoice(s);
    resolveAwaiting(s, choice.options.slice(0, awaiting.count).map((_, i) => i), null, rng);
  }
  eq(asked.filter((p) => p === 1).length, 1, "a seat that kept on the first round is asked exactly once");
  eq(asked.filter((p) => p === 2).length, 3, "and one that mulliganed twice is asked three times");
  eq(cardsIn(s, "hand", 2).length, 6, "ending on six -- two mulligans, one of them free");
}

/* ---- the same seed deals the same game ---- */
{
  const run = () => {
    const s = dealt();
    const rng = createRng("determinism");
    beginMulligans(s, rng);
    let count = 0;
    play(s, rng, () => { count += 1; return count > 2; });
    return hashState(s);
  };
  eq(run(), run(), "the same seed and the same decisions deal the same opening hands");
  const other = () => {
    const s = dealt();
    const rng = createRng("another seed");
    beginMulligans(s, rng);
    let count = 0;
    play(s, rng, () => { count += 1; return count > 2; });
    return hashState(s);
  };
  ok(other() !== run(), "and a different seed deals a different one");
}

/* ---- refusals ---- */
{
  const s = dealt();
  const rng = createRng("refuse");
  beginMulligans(s, rng);
  assert.throws(() => resolveAwaiting(s, [0, 1], null, rng), /yes|no|one/i,
    "keep-or-mulligan takes one answer"); checks += 1;
  assert.throws(() => beginMulligans(s, rng), /already|under way/i,
    "and the mulligans cannot be started twice"); checks += 1;
}

console.log(`engine-mulligan: ${checks} checks passed — every mulligan draws seven, the bottoming happens on keeping and over the hand kept, the player chooses which cards go, and they go to the bottom.`);
