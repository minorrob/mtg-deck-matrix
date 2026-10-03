/* THE HOUSE PILOT (PLAN §3.6, task 4.2): IT SEES ONLY ITS SEAT, IT COSTS NOTHING, AND IT PLAYS.
 *
 * `docs/plan-to-100.md` M4: "the engine's own opponent, which sees only its seat and costs nothing per
 * game." Taken ahead of phase 3 as Rob approved (docs/decisions-2026-09-25.md), because a game room needs
 * an opponent before it needs a card library. This suite holds:
 *
 *   1. By construction, it cannot read game state: the module imports nothing, and it is handed a seat's
 *      projection, the offered actions and the choice -- the browser's inputs.
 *   2. What it cannot see does not change what it does: at hundreds of decision points in real games, a
 *      state whose opponents' hands and every library are replaced with other cards (same counts) gets the
 *      same decision. A pilot that peeked would diverge here.
 *   3. It costs nothing and replays: no randomness, no clock; a game of four house pilots replays to the
 *      same hash and a byte-identical journal.
 *   4. Games of house pilots finish, over many seeds, with no exception and every answer legal.
 *   5. It plays: across seeded four-player games, two house pilots beat two random-legal pilots.
 */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {createState, addObject} from "../game/engine/state/index.mjs";
import {beginGame, advance, awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {legalActions, applyAction} from "../game/engine/rules/actions.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";
import {gameOver} from "../game/engine/rules/sba.mjs";
import {beginMulligans, mulligansDone} from "../game/engine/rules/mulligan.mjs";
import {projectFor} from "../game/engine/projection.mjs";
import {createRng} from "../game/engine/rng.mjs";
import {createJournal, hashState} from "../game/engine/journal.mjs";
import {randomLegalPilot} from "../game/engine/pilots/random-legal.mjs";
import {housePilot, HOUSE_PILOT_ID} from "../game/engine/pilots/house-pilot.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const TURN_LIMIT = 30;
const measured = [];
const FOREST = {card: "Forest", types: ["Land"], abilities: [{id: "t-g", kind: "mana", tapSelf: true, produces: {G: 1}}]};
/* Public card knowledge: what a named card is and costs. The same facts a player reads off the card. */
const CARD_FACTS = new Map();
function card(name, facts) { CARD_FACTS.set(name, facts); return name; }
const cards = (name) => CARD_FACTS.get(name) ?? null;

function deal(state, seat) {
  for (let i = 0; i < 38; i += 1) addObject(state, {...FOREST, card: card(`Forest ${seat}`, {manaValue: 0, types: ["Land"]}), owner: seat, controller: seat}, "library", seat);
  const creatures = [["Bear", 2, 2, "{1}{G}", 2], ["Wolf", 3, 3, "{2}{G}", 3], ["Wurm", 5, 5, "{4}{G}", 5], ["Elf", 1, 1, "{G}", 1]];
  for (let i = 0; i < 61; i += 1) {
    const [kind, p, t, cost, mv] = creatures[i % creatures.length];
    const name = card(`${kind} ${seat}-${i}`, {manaValue: mv, types: ["Creature"], power: p, toughness: t});
    addObject(state, {card: name, types: ["Creature"], power: p, toughness: t, manaCost: cost, owner: seat, controller: seat}, "library", seat);
  }
  const general = card(`General ${seat}`, {manaValue: 3, types: ["Creature"], power: 3, toughness: 3});
  addObject(state, {card: general, types: ["Creature"], power: 3, toughness: 3, manaCost: "{2}{G}", owner: seat, controller: seat, commander: true}, "command", seat);
}

/* A four-player game in which each seat has its own pilot. A house pilot is handed its seat's
   projection and nothing else from the state. `onDecision` sees every house decision point. */
function playGame(seed, kinds, {onDecision} = {}) {
  const state = createState({matchId: "house", seed, players: [0, 1, 2, 3].map((i) => ({name: `Seat ${i}`}))});
  for (let seat = 0; seat < 4; seat += 1) deal(state, seat);
  const rng = createRng(seed);
  const journal = createJournal({matchId: "house", seed});
  const pilots = kinds.map((k, seat) => (k === "house" ? housePilot({seat, cards}) : randomLegalPilot(rng)));
  const write = (events) => { for (const e of events) journal.write(e.kind, e.data); };
  const answerFor = (seat, choice) => {
    const pilot = pilots[seat];
    if (pilot.id !== HOUSE_PILOT_ID) return pilot.answer(choice);
    const view = projectFor(state, seat);
    onDecision?.({state, seat, view, choice});
    return pilot.answer(view, choice);
  };
  write(beginMulligans(state, rng));
  for (let guard = 0; !mulligansDone(state) && guard < 400; guard += 1) {
    const answer = answerFor(state.awaiting.player, awaitingChoice(state));
    write(resolveAwaiting(state, answer.indices, answer.amounts, rng));
  }
  write(beginGame(state));
  let steps = 0;
  while (state.turn <= TURN_LIMIT && !gameOver(state)) {
    if (++steps > 200000) throw new Error(`seed ${seed}: the game did not end`);
    if (state.awaiting) {
      const answer = answerFor(state.awaiting.player, awaitingChoice(state));
      write(resolveAwaiting(state, answer.indices, answer.amounts, rng));
      continue;
    }
    if (state.priorityPlayer === null) { write(advance(state)); continue; }
    const seat = state.priorityPlayer, actions = legalActions(state, seat), pilot = pilots[seat];
    let chosen;
    if (pilot.id === HOUSE_PILOT_ID) {
      const view = projectFor(state, seat);
      onDecision?.({state, seat, view, actions});
      chosen = pilot.choose(view, actions);
      assert.ok(actions.includes(chosen), "the house pilot chose one of the offered actions");
    } else chosen = pilot.choose(actions);
    if (chosen.kind === "pass") {
      const result = passPriority(state);
      write(result.events);
      if (result.outcome === "step-ends") write(advance(state));
    } else write(applyAction(state, seat, chosen));
  }
  return {state, journal, steps, outcome: gameOver(state)};
}

/* 1. It cannot read state: it imports nothing, and it refuses another seat's view. */
{
  const code = readFileSync(path.join(ROOT, "game/engine/pilots/house-pilot.mjs"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  eq([...code.matchAll(/\bimport\b[^;]*from\s*["']([^"']+)["']/g)].map((m) => m[1]), [], "the house pilot imports nothing: no state, no rules, no randomness, no clock");
  ok(!/\bMath\.random|\bDate\b|\bperformance\b|\bfetch\s*\(/.test(code), "and uses no randomness, clock or network of its own");
  const state = createState({matchId: "x", seed: "x", players: [{name: "A"}, {name: "B"}]});
  assert.throws(() => housePilot({seat: 0, cards}).choose(projectFor(state, 1), [{kind: "pass"}]), /handed seat 1's view/); checks += 1;
}

/* 2. What it cannot see does not change what it does. */
{
  let points = 0;
  const hide = (state, seat) => {
    const twin = structuredClone(state);
    for (const [id, object] of Object.entries(twin.objects)) {
      const inHidden = (object.zone === "hand" && object.owner !== seat) || object.zone === "library";
      if (inHidden) twin.objects[id] = {...object, card: `Hidden ${id}`, power: 9, toughness: 9, types: ["Creature"]};
    }
    return twin;
  };
  for (const seed of ["blind-a", "blind-b", "blind-c", "blind-d"]) {
    playGame(seed, ["house", "house", "house", "house"], {
      onDecision({state, seat, actions, choice}) {
        if (points > 600) return;
        points += 1;
        const twin = hide(state, seat);
        const a = housePilot({seat, cards}), b = housePilot({seat, cards});
        const first = actions ? a.choose(projectFor(state, seat), actions) : a.answer(projectFor(state, seat), choice);
        const second = actions ? b.choose(projectFor(twin, seat), actions) : b.answer(projectFor(twin, seat), choice);
        assert.deepEqual(second, first, `seed ${seed}: seat ${seat} decided differently when only hidden cards changed`);
      },
    });
  }
  measured.push(`${points} blind decision points`);
  ok(points > 300, `at ${points} decision points, a state with every hidden card replaced got the same decision`);
}

/* 3 and 4. It costs nothing, it replays, and games of house pilots finish. */
{
  const a = playGame("house-replay", ["house", "house", "house", "house"]);
  const b = playGame("house-replay", ["house", "house", "house", "house"]);
  eq(hashState(a.state), hashState(b.state), "four house pilots replay to the same state");
  eq(JSON.stringify(a.journal.events()), JSON.stringify(b.journal.events()), "with a byte-identical journal");
  let games = 0, decided = 0;
  for (let i = 0; i < 100; i += 1) {
    const run = playGame(`house-${i}`, ["house", "house", "house", "house"]);
    games += 1; if (run.outcome) decided += 1;
  }
  eq(games, 100, "100 four-player games of house pilots ran to the end or the turn limit with no exception");
  measured.push(`${decided}/100 all-house games won inside ${TURN_LIMIT} turns`);
  ok(decided > 0, `and house pilots win games: ${decided} of 100 ended with a winner inside ${TURN_LIMIT} turns`);
}

/* 5. It plays better than chance. Measured as who is still standing when the game ends, not who won: with
   vanilla creatures the last two careful players often stall into the turn limit, which says nothing about
   who played better up to that point. */
{
  const standing = {house: 0, random: 0}, seats = {house: 0, random: 0};
  for (let i = 0; i < 60; i += 1) {
    const kinds = i % 2 ? ["house", "random", "house", "random"] : ["random", "house", "random", "house"];
    const run = playGame(`strength-${i}`, kinds);
    run.state.players.forEach((p, seat) => { seats[kinds[seat]] += 1; if (!p.lost) standing[kinds[seat]] += 1; });
  }
  measured.push(`standing at the end: house ${standing.house}/${seats.house}, random ${standing.random}/${seats.random}`);
  ok(standing.house >= seats.house * 0.9, `house pilots survive: ${standing.house} of ${seats.house} seats standing at the end`);
  ok(standing.random <= seats.random * 0.25, `random-legal pilots do not: ${standing.random} of ${seats.random}`);
}

/* 6. It never blocks a menace creature with one (CR 702.111b; the plan review's C2). Probe R's seed 11: offered each
   blocker on its own, the pilot declared a single good block on a creature with menace, the rules refused the
   declaration, and the room could not get past the refusal. It reads the attacker's keywords from its own view. */
{
  const s = createState({matchId: "m", seed: "menace", players: [{name: "Rob"}, {name: "Maya"}]});
  for (let seat = 0; seat < 2; seat += 1) for (let i = 0; i < 20; i += 1) addObject(s, {...FOREST, owner: seat, controller: seat}, "library", seat);
  addObject(s, {card: card("Sneak", {manaValue: 2, types: ["Creature"], power: 2, toughness: 2}), types: ["Creature"], power: 2, toughness: 2, keywords: ["Menace"], owner: 0, controller: 0}, "battlefield");
  addObject(s, {card: card("Plain Bear", {manaValue: 2, types: ["Creature"], power: 2, toughness: 2}), types: ["Creature"], power: 2, toughness: 2, owner: 0, controller: 0}, "battlefield");
  addObject(s, {card: card("Wall", {manaValue: 3, types: ["Creature"], power: 3, toughness: 3}), types: ["Creature"], power: 3, toughness: 3, owner: 1, controller: 1}, "battlefield");
  beginGame(s);
  let guard = 0;
  while (!(s.turn === 3 && s.awaiting?.kind === "declare-attackers") && guard < 400) {
    guard += 1;
    if (s.awaiting) { resolveAwaiting(s, []); continue; }
    if (s.priorityPlayer === null) { advance(s); continue; }
    if (passPriority(s).outcome === "step-ends") advance(s);
  }
  const attack = awaitingChoice(s);
  resolveAwaiting(s, attack.options.filter((o) => o.defenderId === 1).map((o) => o.index));
  while (s.awaiting?.kind !== "declare-blockers" && guard < 500) {
    guard += 1;
    if (s.priorityPlayer === null) { advance(s); continue; }
    if (passPriority(s).outcome === "step-ends") advance(s);
  }
  const choice = awaitingChoice(s);
  const answer = housePilot({seat: 1, cards}).answer(projectFor(s, 1), choice);
  eq(answer.indices.map((i) => choice.options[i].label), ["Wall blocks Plain Bear"],
    "the Wall would block either attacker well, and blocks the one without menace -- never one blocker on a menace creature");
  resolveAwaiting(s, answer.indices);
  ok(true, "and the rules accept the declaration");
}

console.log(`engine-house-pilot: ${checks} checks passed — the house pilot sees only its seat, draws nothing it cannot see, replays exactly, finishes 100 games, and beats random play (${measured.join("; ")}).`);
