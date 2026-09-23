/* THE TURN IS THE CLOCK EVERY OTHER RULE READS.
 *
 * `docs/engine/PLAN.md` §3.3 (turn structure, CR 500 to 514) and the phase 1 gate: a four-player
 * game runs to completion for 1,000 seeds. "To completion" is this file's problem — a turn that
 * does not reliably reach the next player is an engine that hangs rather than one that loses.
 *
 * THE PHASE NAMES ARE NOT NEW. `match-telemetry.mjs` matches `/DECLARE_ATTACKERS|DECLARE_BLOCKERS/`
 * against the phase string and prints every other one by lowercasing it; `table-notices.mjs` and
 * the audio rules read the same names. They are Forge's, they are already on disk in every recorded
 * match, and the engine adopts them rather than inventing a private vocabulary that would silently
 * stop the board's history from reading.
 *
 * WHAT ADVANCE MEANS. `advance` moves to the next step and performs that step's turn-based actions
 * on arrival, which is the order CR 500.2 gives. So after it returns, the step it names has already
 * untapped, drawn or cleaned up.
 *
 * Three rules here are the ones people get wrong from memory:
 *
 *   THE FIRST PLAYER SKIPS THEIR DRAW ONLY IN A TWO-PLAYER GAME (CR 103.8a). In four-player
 *   Commander everyone draws on turn one, including the player who went first. Applying the
 *   two-player rule to a pod costs the starting seat a card every game.
 *
 *   WITH NO ATTACKERS, TWO COMBAT STEPS DO NOT HAPPEN AT ALL (CR 506.5). Running them anyway is
 *   harmless-looking and then is not: every "at the beginning of the declare blockers step" trigger
 *   fires on a turn nobody attacked.
 *
 *   MANA EMPTIES AT THE END OF EVERY STEP AND PHASE (CR 500.4), not at end of turn. Floating mana
 *   across a step is how a player pays for something they could not afford.
 */
import assert from "node:assert/strict";
import {createState, addObject, cardsIn} from "../game/engine/state/index.mjs";
import {
  STEPS, PHASE_NAMES, beginGame, advance, currentPhase, hasPriority, nextLivingPlayer,
} from "../game/engine/rules/turn.mjs";
import {hashState} from "../game/engine/journal.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const pod = (n) => ({
  matchId: "m", seed: "s",
  players: ["Rob", "Krenko", "Atraxa", "Shadrix"].slice(0, n).map((name) => ({name})),
});

/* Advance until the predicate holds, and hand back the events of the step that satisfied it. */
function until(state, predicate, limit = 400) {
  for (let i = 0; i < limit; i += 1) {
    const events = advance(state);
    if (predicate(state)) return events;
  }
  throw new Error("never got there");
}
const atPhase = (phase) => (state) => currentPhase(state) === phase;

/* ---- the sequence is CR 500.1, in order ---- */
{
  eq(PHASE_NAMES, [
    "UNTAP", "UPKEEP", "DRAW", "MAIN1",
    "COMBAT_BEGIN", "COMBAT_DECLARE_ATTACKERS", "COMBAT_DECLARE_BLOCKERS",
    "COMBAT_FIRST_STRIKE_DAMAGE", "COMBAT_DAMAGE", "COMBAT_END",
    "MAIN2", "END_OF_TURN", "CLEANUP",
  ], "the steps of a turn, in the order CR 500.1 gives them, under the names already on disk");

  eq(STEPS.length, PHASE_NAMES.length, "one entry per step");
  ok(STEPS.every((s) => typeof s.phase === "string" && typeof s.priority === "boolean"),
    "each step says whether anyone gets priority in it");
  eq(STEPS.find((s) => s.phase === "UNTAP").priority, false,
    "nobody receives priority in the untap step (CR 502.3)");
  eq(STEPS.find((s) => s.phase === "CLEANUP").priority, false,
    "nor normally in cleanup (CR 514.3)");
  eq(STEPS.filter((s) => s.priority).length, PHASE_NAMES.length - 2,
    "and in every other step somebody does");

  /* CR 506.5 and 510.4: three steps are conditional, and the condition is named rather than
     hidden in a branch, so 1.4 fills it in one place. */
  eq(STEPS.filter((s) => s.when).map((s) => s.phase),
    ["COMBAT_DECLARE_BLOCKERS", "COMBAT_FIRST_STRIKE_DAMAGE", "COMBAT_DAMAGE"],
    "the steps that only happen under a condition say so");
}

/* ---- a game begins on the first player's untap ---- */
{
  const s = createState(pod(4));
  const events = beginGame(s);
  eq(s.turn, 1, "the first turn is turn one");
  eq(s.activePlayer, 0, "and it belongs to the seat the pod put first");
  eq(currentPhase(s), "UNTAP", "a turn opens in the untap step");
  const announced = events.find((e) => e.kind === "GameEventTurnPhase");
  ok(announced, "beginning a game announces the phase");
  eq(announced.data.fields.phase, "UNTAP", "under fields.phase, where the telemetry reads it");
  eq(announced.data.fields.playerTurn.playerId, 0, "with whose turn it is, as the telemetry expects");
  eq(announced.data.turn, 1, "and the turn number on the event, not only inside fields");
}

/* ---- untap untaps the active player's permanents and nobody else's (CR 502.1) ---- */
{
  const s = createState(pod(4));
  beginGame(s);
  const mine = addObject(s, {card: "Forest", owner: 0, controller: 0}, "battlefield");
  const theirs = addObject(s, {card: "Island", owner: 1, controller: 1}, "battlefield");
  s.objects[mine].tapped = true;
  s.objects[theirs].tapped = true;

  const events = until(s, (st) => st.activePlayer === 1 && currentPhase(st) === "UNTAP");
  eq(s.objects[theirs].tapped, false, "the active player's permanent untapped");
  eq(s.objects[mine].tapped, true, "and nobody else's did — untap is not a board-wide effect");
  ok(events.some((e) => e.kind === "GameEventCardTapped" && e.data.fields.tapped === false),
    "an untap is reported, so the board can show it");
}

/* ---- the draw step (CR 103.8a is a two-player rule) ---- */
{
  const four = createState(pod(4));
  beginGame(four);
  for (let i = 0; i < 60; i += 1) addObject(four, {card: `L${i}`, owner: 0, controller: 0}, "library", 0);
  const events = until(four, atPhase("DRAW"));
  eq(cardsIn(four, "hand", 0).length, 1,
    "in a four-player game the starting player DOES draw on turn one — CR 103.8a is a two-player rule");
  eq(cardsIn(four, "library", 0).length, 59, "the card came off the top of their library");
  const drawn = events.find((e) => e.kind === "GameEventCardChangeZone");
  ok(drawn, "a draw is a zone change, and is reported as one");
  eq(drawn.data.fields.from.zoneType, "Library", "from the Library");
  eq(drawn.data.fields.to.zoneType, "Hand", "to the Hand, in the capitalized zone names the readers use");
  eq(drawn.data.fields.to.player.playerId, 0, "and it says whose, which is how the telemetry keeps it private");

  const two = createState(pod(2));
  beginGame(two);
  for (let i = 0; i < 60; i += 1) addObject(two, {card: `L${i}`, owner: 0, controller: 0}, "library", 0);
  until(two, atPhase("DRAW"));
  eq(cardsIn(two, "hand", 0).length, 0, "in a two-player game the player who went first skips it");
  for (let i = 0; i < 60; i += 1) addObject(two, {card: `R${i}`, owner: 1, controller: 1}, "library", 1);
  until(two, (st) => st.activePlayer === 1 && currentPhase(st) === "DRAW");
  eq(cardsIn(two, "hand", 1).length, 1, "the second player does not");
}

/* ---- drawing from an empty library is recorded, not thrown (CR 104.3c) ---- */
{
  const s = createState(pod(4));
  beginGame(s);
  until(s, atPhase("DRAW"));
  eq(cardsIn(s, "library", 0).length, 0, "there was nothing to draw");
  eq(s.players[0].drewFromEmpty, true,
    "the attempt is remembered — the loss belongs to state-based actions in 1.5, not to this file");
}

/* ---- mana empties at the end of every step (CR 500.4) ---- */
{
  const s = createState(pod(4));
  beginGame(s);
  s.players[0].manaPool.G = 3;
  const events = advance(s);
  eq(s.players[0].manaPool.G, 0,
    "mana does not survive a step boundary — floating it is how a player pays for what they cannot afford");
  ok(events.some((e) => e.kind === "GameEventManaPool"), "and emptying a pool that had mana in it is reported");
  const quiet = advance(s);
  ok(!quiet.some((e) => e.kind === "GameEventManaPool"), "an empty pool emptying again is not news");
}

/* ---- one land per turn, and the count resets (CR 305.2) ---- */
{
  const s = createState(pod(4));
  beginGame(s);
  s.players[0].landsPlayed = 1;
  until(s, (st) => st.activePlayer === 1);
  eq(s.players[0].landsPlayed, 0, "a new turn gives the land drop back");
}

/* ---- cleanup removes damage (CR 514.2) ---- */
{
  const s = createState(pod(4));
  beginGame(s);
  const bear = addObject(s, {card: "Bear", owner: 0, controller: 0}, "battlefield");
  s.objects[bear].damage = 2;
  until(s, atPhase("CLEANUP"));
  eq(s.objects[bear].damage, 0, "damage wears off at cleanup rather than accumulating across turns");
}

/* ---- with nobody attacking, two combat steps do not happen (CR 506.5) ---- */
{
  const s = createState(pod(4));
  beginGame(s);
  const seen = [];
  const was = s.activePlayer;
  seen.push(currentPhase(s));
  while (true) { advance(s); if (s.activePlayer !== was) break; seen.push(currentPhase(s)); }
  eq(seen, [
    "UNTAP", "UPKEEP", "DRAW", "MAIN1",
    "COMBAT_BEGIN", "COMBAT_DECLARE_ATTACKERS", "COMBAT_END",
    "MAIN2", "END_OF_TURN", "CLEANUP",
  ], "declare blockers and combat damage are skipped when nothing attacked (CR 506.5), and the first-strike step needs first strike (CR 510.4)");
}

/* ---- the turn passes, in seat order, and skips the dead ---- */
{
  const s = createState(pod(4));
  beginGame(s);
  const seen = [];
  for (let turn = 0; turn < 4; turn += 1) {
    seen.push(s.activePlayer);
    const was = s.activePlayer;
    until(s, (st) => st.activePlayer !== was);
  }
  eq(seen, [0, 1, 2, 3], "turns pass in seat order");

  s.players[1].lost = true;
  eq(nextLivingPlayer(s, 0), 2, "a seat that has lost is passed over");
  eq(nextLivingPlayer(s, 3), 0, "and the order wraps");
  s.players[2].lost = true;
  s.players[3].lost = true;
  eq(nextLivingPlayer(s, 0), 0, "with one player left, the turn is always theirs");
}

/* ---- priority follows the step ---- */
{
  const s = createState(pod(4));
  beginGame(s);
  eq(hasPriority(s), false, "no priority in untap");
  advance(s);
  eq(currentPhase(s), "UPKEEP", "the next step is upkeep");
  eq(hasPriority(s), true, "where the active player receives priority (CR 117.1a)");
  eq(s.priorityPlayer, s.activePlayer, "active player first — APNAP");
}

/* ---- the same game twice is the same game ---- */
{
  const run = () => {
    const s = createState(pod(4));
    for (let i = 0; i < 100; i += 1) addObject(s, {card: `L${i}`, owner: i % 4, controller: i % 4}, "library", i % 4);
    beginGame(s);
    for (let i = 0; i < 200; i += 1) advance(s);
    return hashState(s);
  };
  eq(run(), run(), "two hundred steps leave the same state hash both times");
}

/* ---- it terminates ---- */
{
  const s = createState(pod(4));
  beginGame(s);
  let steps = 0;
  while (s.turn < 20 && steps < 5000) { advance(s); steps += 1; }
  eq(s.turn, 20, "twenty turns are reached");
  eq(steps, 19 * 10, "each of them exactly the ten steps an uncontested turn runs — a turn that cannot end is a hang, not a loss");
}

console.log(`engine-turn: ${checks} checks passed — the steps of CR 500.1 in order, under the names already on disk, and a turn that always reaches the next player.`);
