/* WHAT A PLAYER MAY DO RIGHT NOW, AND A GAME THAT ACTUALLY ENDS.
 *
 * `docs/engine/PLAN.md` §3.3 and §3.6 (`random-legal`: picks uniformly from enumerated legal
 * actions; used by the termination and determinism tests). Phase 1's gate is that a four-player
 * game runs to completion for 1,000 seeds with no exception and the same hash on replay. This
 * suite is the first installment of that claim, on the subset the kernel can play today: lands.
 *
 * LEGALITY IS ENUMERATED, NOT ASSERTED. The engine offers the actions a player may take and
 * refuses the ones it did not offer. A pilot that could describe an action the engine would then
 * perform anyway is how an AI ends up playing two lands a turn and nobody notices for a month.
 *
 * PLAYING A LAND IS A SPECIAL ACTION (CR 116.2a, 305.1). It does not use the stack, it cannot be
 * responded to, and it is legal only when its player has priority in a main phase of their own
 * turn with an empty stack. Every one of those clauses is a way to get it wrong.
 */
import assert from "node:assert/strict";
import {createState, addObject, cardsIn, zoneOf} from "../game/engine/state/index.mjs";
import {beginGame, advance, currentPhase} from "../game/engine/rules/turn.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";
import {pushAbility} from "../game/engine/rules/stack.mjs";
import {legalActions, applyAction} from "../game/engine/rules/actions.mjs";
import {randomLegalPilot} from "../game/engine/pilots/random-legal.mjs";
import {createRng} from "../game/engine/rng.mjs";
import {hashState, createJournal} from "../game/engine/journal.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const pod = {
  matchId: "m", seed: "s",
  players: [{name: "Rob"}, {name: "Krenko"}, {name: "Atraxa"}, {name: "Shadrix"}],
};

/* Deal each seat a library of basics and a hand of them. Lands are all the kernel can play until
   1.3 gives it mana, and they are enough to prove a turn cycle terminates. */
function dealt(seats = 4, libraryEach = 40, handEach = 7) {
  const state = createState({...pod, players: pod.players.slice(0, seats)});
  for (let seat = 0; seat < seats; seat += 1) {
    for (let i = 0; i < libraryEach; i += 1)
      addObject(state, {card: "Forest", owner: seat, controller: seat, types: ["Land"]}, "library", seat);
    for (let i = 0; i < handEach; i += 1)
      addObject(state, {card: "Island", owner: seat, controller: seat, types: ["Land"]}, "hand", seat);
  }
  beginGame(state);
  return state;
}

const walkTo = (state, phase) => { let n = 0; while (currentPhase(state) !== phase && n < 400) { advance(state); n += 1; } };
const kinds = (state, player) => legalActions(state, player).map((a) => a.kind).sort();

/* ---- passing is always available to whoever holds priority ---- */
{
  const s = dealt();
  advance(s);                                   /* upkeep */
  eq(kinds(s, 0), ["pass"], "in upkeep, with no mana and no instants, all a player can do is pass");
  eq(legalActions(s, 1), [],
    "and a player who does not hold priority has no actions at all — not an empty pass, none");
}

/* ---- a land, in a main phase, on your own turn, with an empty stack ---- */
{
  const s = dealt();
  walkTo(s, "MAIN1");
  const actions = legalActions(s, 0);
  eq(actions.filter((a) => a.kind === "play-land").length, 8,
    "each land in hand is its own offered action, so a pilot chooses which one — eight, because the draw step already added one to the seven dealt");
  ok(actions.some((a) => a.kind === "pass"), "and passing is still there");
  ok(actions.every((a) => a.kind !== "play-land" || Number.isInteger(a.objectId)),
    "each names the card it would play");
}
{
  const s = dealt();
  walkTo(s, "MAIN1");
  eq(legalActions(s, 1).length, 0, "nobody else may play a land on your turn");
}
{
  const s = dealt();
  advance(s);
  eq(kinds(s, 0), ["pass"], "not in upkeep — a land is a main-phase action (CR 505.5b)");
  walkTo(s, "COMBAT_DECLARE_ATTACKERS");
  eq(kinds(s, 0), ["pass"], "nor in combat");
}
{
  const s = dealt();
  walkTo(s, "MAIN1");
  pushAbility(s, {sourceId: null, controller: 1, abilityId: "something"});
  eq(kinds(s, 0), ["pass"],
    "and not with something on the stack — a land is a special action, which needs an empty stack (CR 116.2a)");
}

/* ---- one land a turn (CR 305.2) ---- */
{
  const s = dealt();
  walkTo(s, "MAIN1");
  const land = legalActions(s, 0).find((a) => a.kind === "play-land");
  const events = applyAction(s, 0, land);
  eq(zoneOf(s, cardsIn(s, "battlefield")[0]), "battlefield", "the land is on the battlefield");
  eq(cardsIn(s, "hand", 0).length, 7, "and out of the hand");
  eq(s.players[0].landsPlayed, 1, "the land drop is spent");
  eq(legalActions(s, 0).filter((a) => a.kind === "play-land").length, 0,
    "so no second land is offered this turn");

  ok(events.some((e) => e.kind === "GameEventLandPlayed"), "a land being played is reported as such");
  const played = events.find((e) => e.kind === "GameEventLandPlayed");
  eq(played.data.fields.player.playerId, 0, "with whose land it was, as the telemetry reads it");
  ok(played.data.fields.land?.name, "and which card, so the board can name it");
  ok(events.some((e) => e.kind === "GameEventCardChangeZone"), "and as the zone change it also is");

  ok(!events.some((e) => e.kind === "GameEventSpellAbilityCast"),
    "playing a land is not casting a spell — it never uses the stack (CR 305.1)");
  eq(s.stack.length, 0, "and nothing went onto it");
}

/* ---- an action the engine did not offer is refused ---- */
{
  const s = dealt();
  walkTo(s, "MAIN1");
  const land = legalActions(s, 0).find((a) => a.kind === "play-land");
  applyAction(s, 0, land);
  assert.throws(() => applyAction(s, 0, land), /not (a )?legal|already|offered/i,
    "replaying a spent action is refused rather than quietly doubling it"); checks += 1;
  assert.throws(() => applyAction(s, 1, {kind: "pass"}), /priority/i,
    "and a player who does not hold priority cannot act"); checks += 1;
  assert.throws(() => applyAction(s, 0, {kind: "teleport"}), /teleport|legal|unknown/i,
    "an action the engine has never heard of is not attempted"); checks += 1;
}

/* ---- the pilot picks from what it was offered, and only that ---- */
{
  const rng = createRng("pilot", null, {});
  const pilot = randomLegalPilot(rng);
  const s = dealt();
  walkTo(s, "MAIN1");
  const offered = legalActions(s, 0);
  for (let i = 0; i < 50; i += 1) {
    const chosen = pilot.choose(offered);
    ok(offered.includes(chosen), i === 0 ? "the pilot returns one of the actions it was handed" : true);
    checks -= i === 0 ? 0 : 1;
  }
  assert.throws(() => pilot.choose([]), /no legal|empty/i,
    "and refuses an empty list rather than returning undefined for a caller to trip over"); checks += 1;
}
{
  /* Uniform enough that no option is starved: with two options and 400 draws, a generator that
     always answered the same way would show up immediately. */
  const pilot = randomLegalPilot(createRng("spread"));
  const options = [{kind: "a"}, {kind: "b"}];
  const seen = {a: 0, b: 0};
  for (let i = 0; i < 400; i += 1) seen[pilot.choose(options).kind] += 1;
  ok(seen.a > 120 && seen.b > 120, "the pilot spreads its choices rather than favoring one");
}

/* ---- a whole game of lands, driven by the pilot, ends ---- */
function playOut(seed, turnLimit = 40) {
  const state = dealt();
  const rng = createRng(seed);
  const pilot = randomLegalPilot(rng);
  const journal = createJournal({matchId: "run", seed});
  let steps = 0;

  while (state.turn <= turnLimit && steps < 20000) {
    steps += 1;
    if (state.priorityPlayer === null) { for (const e of advance(state)) journal.write(e.kind, e.data); continue; }
    const actions = legalActions(state, state.priorityPlayer);
    const chosen = pilot.choose(actions);
    if (chosen.kind === "pass") {
      const result = passPriority(state);
      for (const e of result.events) journal.write(e.kind, e.data);
      if (result.outcome === "step-ends") for (const e of advance(state)) journal.write(e.kind, e.data);
    } else {
      for (const e of applyAction(state, state.priorityPlayer, chosen)) journal.write(e.kind, e.data);
    }
  }
  return {state, steps, journal, rng};
}
{
  const {state, steps} = playOut("terminates");
  ok(steps < 20000, "a game of lands played by a random pilot reaches the turn limit without running away");
  ok(state.turn > 40, "and got there by taking turns");
  const lands = state.zones.battlefield.length;
  ok(lands > 20, `lands actually got played (${lands} of them) rather than every pilot passing forever`);
  for (const player of state.players)
    ok(player.landsPlayed <= 1, "and nobody ever had two land drops in one turn");
  checks -= 3;
}

/* ---- the same seed is the same game ---- */
{
  const a = playOut("determinism");
  const b = playOut("determinism");
  eq(hashState(a.state), hashState(b.state), "the same seed produces the same final state");
  eq(a.steps, b.steps, "in the same number of moves");
  eq(JSON.stringify(a.journal.events()), JSON.stringify(b.journal.events()),
    "and a byte-identical journal — which is what makes a bug report a seed rather than a story");
  eq(a.rng.checkpoint(), b.rng.checkpoint(), "having drawn the same amount of randomness");

  const other = playOut("a different seed");
  ok(hashState(other.state) !== hashState(a.state), "a different seed is a different game");
}

console.log(`engine-actions: ${checks} checks passed — legality is enumerated, a land is a special action, and a random game of lands ends the same way twice.`);
