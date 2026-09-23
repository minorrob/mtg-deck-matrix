/* DETERMINISM IS THE PROPERTY EVERYTHING ELSE RESTS ON.
 *
 * `docs/engine/PLAN.md` §3.2.1: same pod, same seed, same decisions produce the same journal and
 * the same state hashes. §3.2.4: a checkpoint is the state plus the RNG POSITION and the pending
 * choice, so a game resumes from any decision. Both of those are promises about this one file.
 *
 * A rules engine whose randomness is not reproducible cannot be differentially tested against
 * Forge, cannot replay a bug report, and cannot checkpoint. So this suite is written before the
 * kernel exists and stays forever (§6 phase 1.1).
 */
import assert from "node:assert/strict";
import {createRng, SEQUENCE_KINDS} from "../game/engine/rng.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

/* ---- the same seed is the same stream ---- */
{
  const a = createRng("game-one"), b = createRng("game-one"), c = createRng("game-two");
  const drawA = Array.from({length: 200}, () => a.unit());
  const drawB = Array.from({length: 200}, () => b.unit());
  const drawC = Array.from({length: 200}, () => c.unit());
  eq(drawA, drawB, "the same seed produces the same sequence");
  ok(drawA.join() !== drawC.join(), "a different seed produces a different one");
  ok(drawA.every((n) => n >= 0 && n < 1), "every draw is in [0, 1)");
  ok(new Set(drawA).size > 190, "and the stream does not collapse onto a few values");
}

/* ---- a seed is any string, and the empty one still works ---- */
{
  for (const seed of ["", "0", "a", "a much longer seed with spaces and — punctuation", "🜂"]) {
    const r = createRng(seed);
    const n = r.unit();
    ok(Number.isFinite(n) && n >= 0 && n < 1, `seed ${JSON.stringify(seed)} yields a usable draw`);
  }
  ok(createRng("a").unit() !== createRng("b").unit(), "one character of difference changes the stream");
}

/* ---- integers are uniform enough and never out of range ---- */
{
  const r = createRng("ints");
  const counts = new Array(6).fill(0);
  for (let i = 0; i < 60000; i += 1) counts[r.int(6)] += 1;
  ok(counts.every((n) => n > 9000 && n < 11000), `a d6 is roughly flat over 60,000 rolls: ${counts.join(", ")}`);
  ok(Array.from({length: 500}, () => r.int(1)).every((n) => n === 0), "int(1) is always 0");
  assert.throws(() => r.int(0), /positive/, "int(0) is a bug in the caller, not a silent 0"); checks += 1;
  assert.throws(() => r.int(-3), /positive/); checks += 1;
  assert.throws(() => r.int(2.5), /integer/); checks += 1;
}

/* ---- THE SHUFFLE IS THE ONE THAT DECIDES GAMES ---- */
{
  const deck = Array.from({length: 99}, (_, i) => i);
  const a = createRng("library").shuffle(deck.slice());
  const b = createRng("library").shuffle(deck.slice());
  eq(a, b, "the same seed shuffles a library the same way");
  eq([...a].sort((x, y) => x - y), deck, "a shuffle is a permutation: nothing lost, nothing gained, no duplicates");
  ok(a.join() !== deck.join(), "and it actually moved");

  /* An unbiased Fisher-Yates puts every card in every position eventually. A modulo-biased or
     sort-based shuffle fails this: positions cluster. */
  const seenAtFront = new Set();
  for (let i = 0; i < 400; i += 1) seenAtFront.add(createRng("s" + i).shuffle(deck.slice())[0]);
  ok(seenAtFront.size > 60, `many different cards reach the top across seeds, not a biased few (${seenAtFront.size})`);

  const r = createRng("pure");
  const input = [1, 2, 3];
  const out = r.shuffle(input);
  ok(out !== input, "shuffle returns a new array rather than reordering the caller's");
  eq(input, [1, 2, 3], "and leaves the original alone — a library is shuffled, not mutated underfoot");
  eq(createRng("empty").shuffle([]), [], "an empty library shuffles to an empty library");
}

/* ---- POSITION AND RESUME (§3.2.4) ---- */
{
  const r = createRng("resume");
  for (let i = 0; i < 37; i += 1) r.unit();
  const saved = r.checkpoint();
  const ahead = Array.from({length: 20}, () => r.unit());

  const back = createRng("resume", saved);
  eq(Array.from({length: 20}, () => back.unit()), ahead,
    "a checkpoint resumes the exact stream — this is what lets a game be saved mid-decision");
  ok(saved.draws === 37, "the checkpoint carries how many draws have been taken");
  eq(JSON.parse(JSON.stringify(saved)), saved, "a checkpoint is plain data, so structuredClone of the state carries it");

  const r2 = createRng("resume");
  for (let i = 0; i < 37; i += 1) r2.unit();
  eq(r2.checkpoint(), saved, "the same seed and the same number of draws is the same position");
}

/* ---- THE TAPE: what was drawn, and what for ---- */
{
  const r = createRng("tape", null, {record: true});
  r.shuffle([1, 2, 3, 4, 5]);
  r.int(20);
  r.unit();
  const tape = r.tape();
  ok(tape.length >= 3, "the tape records each draw");
  ok(tape.every((e) => SEQUENCE_KINDS.includes(e.kind)), `every entry names a known kind: ${SEQUENCE_KINDS.join(", ")}`);
  ok(tape.some((e) => e.kind === "shuffle") && tape.some((e) => e.kind === "int"),
    "and distinguishes a shuffle from a roll, so a replay can be read by a person");

  const quiet = createRng("tape");
  quiet.unit();
  eq(quiet.tape(), [], "recording is opt-in; a game does not pay for a tape nobody reads");
}

/* ---- the stream is not accidentally shared ---- */
{
  const a = createRng("split"), b = createRng("split");
  a.unit(); a.unit();
  ok(a.checkpoint().draws === 2 && b.checkpoint().draws === 0,
    "two generators from one seed are independent; drawing from one does not advance the other");
}

console.log(`engine-rng: ${checks} checks passed — one seed is one stream, a shuffle is an unbiased permutation, and a checkpoint resumes it exactly.`);
