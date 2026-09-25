/* ONE GATE-STYLE GAME, SPLIT INTO STEPS SO IT CAN STOP AND RESUME.
 *
 * The same four-player game of lands, vanilla creatures and commanders that `tests/engine-gate.mjs` plays,
 * driven one decision at a time by the random-legal pilot. `tests/engine-storage.mjs` and its second process
 * (`engine-resume-child.mjs`) both play through this file, so "the same game" means the same code.
 */
import {createState, addObject} from "../../game/engine/state/index.mjs";
import {beginGame, advance, awaitingChoice, resolveAwaiting} from "../../game/engine/rules/turn.mjs";
import {legalActions, applyAction} from "../../game/engine/rules/actions.mjs";
import {passPriority} from "../../game/engine/rules/priority.mjs";
import {gameOver} from "../../game/engine/rules/sba.mjs";
import {beginMulligans, mulligansDone} from "../../game/engine/rules/mulligan.mjs";
import {createRng} from "../../game/engine/rng.mjs";
import {randomLegalPilot} from "../../game/engine/pilots/random-legal.mjs";
import {createJournal} from "../../game/engine/journal.mjs";

export const MATCH = "resume";
export const TURN_LIMIT = 30;
export const pod = {matchId: MATCH, players: [{name: "Rob"}, {name: "Krenko"}, {name: "Atraxa"}, {name: "Shadrix"}]};
const FOREST = {card: "Forest", types: ["Land"], abilities: [{id: "t-g", kind: "mana", tapSelf: true, produces: {G: 1}}]};

function deal(state, seat) {
  for (let i = 0; i < 60; i += 1) addObject(state, {...FOREST, card: `Forest ${seat}`, owner: seat, controller: seat}, "library", seat);
  for (let i = 0; i < 39; i += 1)
    addObject(state, {card: `Bear ${seat}-${i}`, types: ["Creature"], power: 2, toughness: 2, manaCost: "{1}{G}", owner: seat, controller: seat}, "library", seat);
  addObject(state, {card: `General ${seat}`, types: ["Creature"], power: 3, toughness: 3, manaCost: "{2}{G}", owner: seat, controller: seat, commander: true}, "command", seat);
}

/** A new game, through its mulligans, at the start of turn one. */
export function newGame(seed) {
  const state = createState({...pod, seed});
  for (let seat = 0; seat < 4; seat += 1) deal(state, seat);
  const rng = createRng(seed);
  const journal = createJournal({matchId: MATCH, seed});
  const pilot = randomLegalPilot(rng);
  const write = (events) => { for (const e of events) journal.write(e.kind, e.data); };
  write(beginMulligans(state, rng));
  for (let guard = 0; !mulligansDone(state) && guard < 400; guard += 1) {
    const answer = pilot.answer(awaitingChoice(state));
    write(resolveAwaiting(state, answer.indices, answer.amounts, rng));
  }
  write(beginGame(state));
  return {seed, state, rng, journal, pilot};
}

/** The same game, from a checkpoint the match store handed back. Nothing but the checkpoint is used. */
export function resumeGame(point) {
  const state = structuredClone(point.state);
  const rng = createRng(point.seed, point.rng);
  const journal = createJournal({matchId: point.matchId, seed: point.seed}, point);
  return {seed: point.seed, state, rng, journal, pilot: randomLegalPilot(rng)};
}

export const finished = (g) => g.state.turn > TURN_LIMIT || Boolean(gameOver(g.state));

/** One decision. False once the game is over. */
export function step(g) {
  if (finished(g)) return false;
  const {state, rng, journal, pilot} = g;
  const write = (events) => { for (const e of events) journal.write(e.kind, e.data); };
  if (state.awaiting) {
    const answer = pilot.answer(awaitingChoice(state));
    write(resolveAwaiting(state, answer.indices, answer.amounts, rng));
  } else if (state.priorityPlayer === null) {
    write(advance(state));
  } else {
    const chosen = pilot.choose(legalActions(state, state.priorityPlayer));
    if (chosen.kind === "pass") {
      const result = passPriority(state);
      write(result.events);
      if (result.outcome === "step-ends") write(advance(state));
    } else {
      write(applyAction(state, state.priorityPlayer, chosen));
    }
  }
  return true;
}

/** Up to `max` decisions; how many were made. */
export function playOn(g, max = 200000) {
  let n = 0;
  while (n < max && step(g)) n += 1;
  if (n >= 200000) throw new Error(`seed ${g.seed}: the game did not end`);
  return n;
}
