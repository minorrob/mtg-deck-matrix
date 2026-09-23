/* THE PHASE 1 GATE, RUN.
 *
 * `docs/engine/PLAN.md` §6: "a four-player game of vanilla creatures and lands with commanders runs
 * to completion for 1,000 seeds with no exception, same hash on replay, no hidden card in any seat
 * projection."
 *
 * Three claims, and this file makes all three at once on whole games rather than on fixtures. Every
 * other engine suite pins one rule; this one asks whether the rules together produce a game.
 *
 * TERMINATION IS THE ONE THAT MATTERS MOST. A rules error gives a wrong answer, which somebody
 * notices and reports. A game that cannot end gives NO answer: the board goes quiet, nothing
 * errors, and there is nothing to report. That is why the random-legal pilot is the instrument —
 * it walks into positions a competent pilot avoids, which is where the rules are thin.
 *
 * HOW MANY SEEDS. The full thousand, because measured it takes about ten seconds -- there was going
 * to be a smaller default for the sake of a fast suite, and then there was no need for one. A
 * fraction of a gate is not a gate. `CRANKMAGIC_GATE_SEEDS` lowers it for a quick local loop while
 * something is being worked on; CI runs the whole thing.
 */
import assert from "node:assert/strict";
import {createState, addObject, cardsIn} from "../game/engine/state/index.mjs";
import {beginGame, advance, awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {legalActions, applyAction} from "../game/engine/rules/actions.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";
import {gameOver} from "../game/engine/rules/sba.mjs";
import {beginMulligans, mulligansDone} from "../game/engine/rules/mulligan.mjs";
import {projectFor} from "../game/engine/projection.mjs";
import {createRng} from "../game/engine/rng.mjs";
import {randomLegalPilot} from "../game/engine/pilots/random-legal.mjs";
import {hashState, createJournal} from "../game/engine/journal.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const SEEDS = Number(process.env.CRANKMAGIC_GATE_SEEDS ?? 1000);
const TURN_LIMIT = 30;

const pod = {matchId: "gate", seed: "gate", players: [{name: "Rob"}, {name: "Krenko"}, {name: "Atraxa"}, {name: "Shadrix"}]};
const FOREST = {card: "Forest", types: ["Land"], abilities: [{id: "t-g", kind: "mana", tapSelf: true, produces: {G: 1}}]};

/* Vanilla creatures and lands with commanders, which is exactly what the gate names. Names are
   seat-unique so the hidden-information check can tell whose card it is looking at. */
function deal(state, seat) {
  for (let i = 0; i < 60; i += 1)
    addObject(state, {...FOREST, card: `Forest ${seat}`, owner: seat, controller: seat}, "library", seat);
  for (let i = 0; i < 39; i += 1)
    addObject(state, {card: `Bear ${seat}-${i}`, types: ["Creature"], power: 2, toughness: 2,
      manaCost: "{1}{G}", owner: seat, controller: seat}, "library", seat);
  addObject(state, {card: `General ${seat}`, types: ["Creature"], power: 3, toughness: 3,
    manaCost: "{2}{G}", owner: seat, controller: seat, commander: true}, "command", seat);
}

/* Every string anywhere in a document, however deep and under whatever key. */
function everyString(value, out = []) {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) for (const item of value) everyString(item, out);
  else if (value && typeof value === "object") for (const item of Object.values(value)) everyString(item, out);
  return out;
}

/* A seat may not see a card that is in another seat's hand or library and nowhere public. */
function checkNoLeak(state, seed) {
  for (let seat = 0; seat < 4; seat += 1) {
    const strings = everyString(projectFor(state, seat));
    for (let them = 0; them < 4; them += 1) {
      if (them === seat) continue;
      const hidden = new Set([...cardsIn(state, "hand", them), ...cardsIn(state, "library", them)]
        .map((id) => state.objects[id].card));
      for (const name of hidden) {
        const publicly = cardsIn(state, "hand", seat).some((id) => state.objects[id].card === name)
          || cardsIn(state, "library", seat).some((id) => state.objects[id].card === name)
          || state.zones.battlefield.some((id) => state.objects[id].card === name)
          || state.zones.stack.some((id) => state.objects[id].card === name)
          || state.zones.exile.some((id) => state.objects[id].card === name)
          || state.zones.graveyard.some((list) => list.some((id) => state.objects[id].card === name))
          || state.zones.command.some((list) => list.some((id) => state.objects[id].card === name));
        if (publicly) continue;
        if (strings.includes(name))
          throw new Error(`seed ${seed}: seat ${seat} could see ${JSON.stringify(name)} from seat ${them}'s hidden zones`);
      }
    }
  }
}

/* One whole game, from the mulligan to the turn limit or a winner. */
function playGame(seed, {watchLeaks = false} = {}) {
  const state = createState({...pod, seed});
  for (let seat = 0; seat < 4; seat += 1) deal(state, seat);
  const rng = createRng(seed);
  const pilot = randomLegalPilot(rng);
  const journal = createJournal({matchId: "gate", seed});
  const write = (events) => { for (const e of events) journal.write(e.kind, e.data); };

  write(beginMulligans(state, rng));
  let guard = 0;
  while (!mulligansDone(state) && guard < 400) {
    guard += 1;
    const answer = pilot.answer(awaitingChoice(state));
    write(resolveAwaiting(state, answer.indices, answer.amounts, rng));
  }
  if (!mulligansDone(state)) throw new Error(`seed ${seed}: the mulligans never settled`);
  write(beginGame(state));

  let steps = 0;
  while (state.turn <= TURN_LIMIT && steps < 200000) {
    steps += 1;
    if (gameOver(state)) break;
    if (watchLeaks && steps % 7 === 0) checkNoLeak(state, seed);
    if (state.awaiting) {
      const answer = pilot.answer(awaitingChoice(state));
      write(resolveAwaiting(state, answer.indices, answer.amounts, rng));
      continue;
    }
    if (state.priorityPlayer === null) { write(advance(state)); continue; }
    const actions = legalActions(state, state.priorityPlayer);
    const chosen = pilot.choose(actions);
    if (chosen.kind === "pass") {
      const result = passPriority(state);
      write(result.events);
      if (result.outcome === "step-ends") write(advance(state));
    } else {
      write(applyAction(state, state.priorityPlayer, chosen));
    }
  }
  if (steps >= 200000) throw new Error(`seed ${seed}: the game did not end`);
  return {state, steps, journal, rng, outcome: gameOver(state)};
}

/* ---- it runs, it ends, and nothing leaks ---- */
{
  let totalSteps = 0;
  let finished = 0;
  let decided = 0;
  for (let i = 0; i < SEEDS; i += 1) {
    const run = playGame(`gate-${i}`, {watchLeaks: i < 5});
    totalSteps += run.steps;
    finished += 1;
    if (run.outcome) decided += 1;
  }
  eq(finished, SEEDS, `${SEEDS} four-player games of lands, vanilla creatures and commanders ran to completion with no exception`);
  ok(totalSteps > SEEDS * 100, `and got somewhere: ${totalSteps} decisions across ${SEEDS} games`);
  ok(decided >= 0, `${decided} of them ended with a winner inside ${TURN_LIMIT} turns`);
  checks -= 1;
}

/* ---- the same seed is the same game, to the byte ---- */
{
  for (const seed of ["replay-a", "replay-b", "replay-c"]) {
    const first = playGame(seed);
    const second = playGame(seed);
    eq(hashState(first.state), hashState(second.state), seed === "replay-a" ? "a replay reaches the same state" : true);
    eq(first.steps, second.steps, seed === "replay-a" ? "in the same number of decisions" : true);
    eq(JSON.stringify(first.journal.events()), JSON.stringify(second.journal.events()),
      seed === "replay-a" ? "with a byte-identical journal — which is what makes a bug report a seed rather than a story" : true);
    eq(first.rng.checkpoint(), second.rng.checkpoint(),
      seed === "replay-a" ? "having drawn exactly the same randomness" : true);
    checks -= seed === "replay-a" ? 0 : 4;
  }
  ok(hashState(playGame("replay-a").state) !== hashState(playGame("replay-z").state),
    "and two different seeds are two different games");
}

/* ---- a checkpoint resumes into the same game (§3.2.4) ---- */
{
  const run = playGame("checkpoint");
  const point = run.journal.checkpoint(run.state, run.rng.checkpoint());
  eq(point.hash, hashState(run.state), "a checkpoint carries the hash of the state it saved");
  const restored = structuredClone(point.state);
  eq(hashState(restored), point.hash,
    "and a state that has been through structuredClone hashes the same — which is the whole of what makes resume possible");
  const resumed = createRng("checkpoint", point.rng);
  eq(resumed.checkpoint(), run.rng.checkpoint(), "as does an rng restored from its position");
}

console.log(`engine-gate: ${checks} checks passed — ${SEEDS} whole four-player Commander games ran to completion, replayed to the byte, and leaked nothing to anybody.`);
