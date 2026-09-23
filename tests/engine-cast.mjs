/* TAPPING FOR MANA, AND CASTING WHAT IT PAYS FOR.
 *
 * `docs/engine/PLAN.md` §3.3 (mana and costs: CR 106, 107, 118, 601.2, 605).
 *
 * A MANA ABILITY DOES NOT USE THE STACK (CR 605.3a). It cannot be responded to, it resolves
 * immediately, and it may be activated any time its controller has priority. Putting it on the
 * stack would be the single most visible rules error an engine can make: every land tap would
 * become a window for instants, and every game would play wrong from turn one.
 *
 * TIMING IS TWO DIFFERENT RULES. A sorcery-speed spell needs a main phase of your own turn with an
 * empty stack (CR 307.1); an instant needs only priority (CR 304.1). An engine that checks one
 * rule for both either forbids legal instants or allows sorceries in combat.
 *
 * WHAT IS DEFERRED, AND IS NAMED RATHER THAN FAKED. CR 601.2g lets a player activate mana abilities
 * DURING the casting process, after the cost is known. This kernel offers tapping and casting as
 * separate actions, which is a legal sequence and the one a human plays; a spell is offered when
 * the pool can pay for it, not when the battlefield could. Casting with automatic land-tapping is
 * part of the payment choice work, and until it lands the engine simply never offers a cast it
 * cannot pay for — it does not offer one and then fail.
 */
import assert from "node:assert/strict";
import {createState, addObject, cardsIn, zoneOf} from "../game/engine/state/index.mjs";
import {beginGame, advance, currentPhase, awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {legalActions, applyAction} from "../game/engine/rules/actions.mjs";
import {peekStack, stackSize, resolveTop} from "../game/engine/rules/stack.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";
import {createRng} from "../game/engine/rng.mjs";
import {randomLegalPilot} from "../game/engine/pilots/random-legal.mjs";
import {hashState} from "../game/engine/journal.mjs";
import {gameOver} from "../game/engine/rules/sba.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const pod = {matchId: "m", seed: "s", players: [{name: "Rob"}, {name: "Krenko"}, {name: "Atraxa"}, {name: "Shadrix"}]};

const FOREST = {card: "Forest", types: ["Land"], abilities: [{id: "t-g", kind: "mana", tapSelf: true, produces: {G: 1}}]};
const BEARS = {card: "Grizzly Bears", types: ["Creature"], manaCost: "{1}{G}", power: 2, toughness: 2};
const BOLT = {card: "Lightning Bolt", types: ["Instant"], manaCost: "{R}"};

function table() {
  const state = createState(pod);
  for (let seat = 0; seat < 4; seat += 1)
    for (let i = 0; i < 20; i += 1) addObject(state, {...FOREST, owner: seat, controller: seat}, "library", seat);
  beginGame(state);
  return state;
}
const walkTo = (state, phase) => { let n = 0; while (currentPhase(state) !== phase && n < 400) { advance(state); n += 1; } };
const find = (state, player, kind) => legalActions(state, player).filter((a) => a.kind === kind);

/* ---- a mana ability is offered whenever its controller has priority (CR 605.3a) ---- */
{
  const s = table();
  const forest = addObject(s, {...FOREST, owner: 0, controller: 0}, "battlefield");
  advance(s);                                     /* upkeep: not a main phase */
  eq(find(s, 0, "activate-mana").length, 1,
    "a land can be tapped for mana in upkeep — a mana ability needs priority, not a main phase");
  walkTo(s, "COMBAT_DECLARE_ATTACKERS");
  eq(find(s, 0, "activate-mana").length, 1, "and in combat");
  eq(zoneOf(s, forest), "battlefield", "the land is where it was");
}
{
  const s = table();
  addObject(s, {...FOREST, owner: 1, controller: 1}, "battlefield");
  advance(s);
  eq(find(s, 1, "activate-mana").length, 0,
    "but only while you hold priority — seat 1 does not, so it has no actions at all");
}

/* ---- tapping for mana does not use the stack (CR 605.3a) ---- */
{
  const s = table();
  const forest = addObject(s, {...FOREST, owner: 0, controller: 0}, "battlefield");
  advance(s);
  const events = applyAction(s, 0, find(s, 0, "activate-mana")[0]);
  eq(s.players[0].manaPool.G, 1, "the mana is in the pool immediately");
  eq(stackSize(s), 0,
    "and nothing went on the stack — a mana ability cannot be responded to, and putting it there would make every land tap a window for instants");
  eq(s.objects[forest].tapped, true, "the land is tapped");
  ok(events.some((e) => e.kind === "GameEventCardTapped" && e.data.fields.tapped === true), "which is reported");
  ok(events.some((e) => e.kind === "GameEventManaPool"), "and so is the mana");
  eq(find(s, 0, "activate-mana").length, 0, "a tapped land is not offered again");
  eq(s.priorityPlayer, 0, "and the player keeps priority after a mana ability (CR 117.3c)");
}

/* ---- a sorcery-speed spell: main phase, own turn, empty stack (CR 307.1) ---- */
{
  const s = table();
  addObject(s, {...FOREST, owner: 0, controller: 0}, "battlefield");
  addObject(s, {...FOREST, owner: 0, controller: 0}, "battlefield");
  addObject(s, {...BEARS, owner: 0, controller: 0}, "hand", 0);
  walkTo(s, "MAIN1");
  eq(find(s, 0, "cast").length, 0, "with an empty pool the creature is not offered — the engine never offers a cast it cannot pay");
  for (const tap of find(s, 0, "activate-mana")) applyAction(s, 0, tap);
  eq(s.players[0].manaPool.G, 2, "two lands, two green");
  eq(find(s, 0, "cast").length, 1, "now the creature is castable");

  const events = applyAction(s, 0, find(s, 0, "cast")[0]);
  eq(stackSize(s), 1, "a spell goes on the stack (CR 601.2a)");
  eq(peekStack(s).name, "Grizzly Bears", "as itself");
  eq(cardsIn(s, "hand", 0).filter((id) => s.objects[id].card === "Grizzly Bears").length, 0,
    "and left the hand — the card the draw step put there is still in it, which is the point of checking by name");
  eq(s.players[0].manaPool, {W: 0, U: 0, B: 0, R: 0, G: 0, C: 0}, "the mana was spent");
  ok(events.some((e) => e.kind === "GameEventSpellAbilityCast"), "casting is reported as casting");
  eq(events.find((e) => e.kind === "GameEventSpellAbilityCast").data.fields.sa.isSpell, true,
    "under the field the telemetry reads to tell a spell from an ability");

  resolveTop(s);
  eq(cardsIn(s, "battlefield").filter((id) => s.objects[id].card === "Grizzly Bears").length, 1,
    "and it resolves onto the battlefield");
}
{
  const s = table();
  addObject(s, {...FOREST, owner: 0, controller: 0}, "battlefield");
  addObject(s, {...FOREST, owner: 0, controller: 0}, "battlefield");
  addObject(s, {...BEARS, owner: 0, controller: 0}, "hand", 0);
  advance(s);                                       /* upkeep */
  for (const tap of find(s, 0, "activate-mana")) applyAction(s, 0, tap);
  eq(find(s, 0, "cast").length, 0, "a creature cannot be cast in upkeep, paid for or not (CR 307.1)");
  walkTo(s, "COMBAT_DECLARE_ATTACKERS");
  eq(find(s, 0, "cast").length, 0, "nor in combat");
}
{
  const s = table();
  addObject(s, {...FOREST, owner: 1, controller: 1}, "battlefield");
  addObject(s, {...FOREST, owner: 1, controller: 1}, "battlefield");
  addObject(s, {...BEARS, owner: 1, controller: 1}, "hand", 1);
  walkTo(s, "MAIN1");
  passPriority(s);
  eq(s.priorityPlayer, 1, "seat 1 has priority on seat 0's turn");
  for (const tap of find(s, 1, "activate-mana")) applyAction(s, 1, tap);
  eq(find(s, 1, "cast").length, 0, "and still cannot cast a creature — it is not their main phase");
}

/* ---- an instant needs only priority (CR 304.1) ---- */
{
  const s = table();
  const mountain = {card: "Mountain", types: ["Land"], abilities: [{id: "t-r", kind: "mana", tapSelf: true, produces: {R: 1}}]};
  addObject(s, {...mountain, owner: 1, controller: 1}, "battlefield");
  addObject(s, {...BOLT, owner: 1, controller: 1}, "hand", 1);
  walkTo(s, "COMBAT_DECLARE_ATTACKERS");
  passPriority(s);
  applyAction(s, 1, find(s, 1, "activate-mana")[0]);
  eq(find(s, 1, "cast").length, 1,
    "an instant can be cast in combat, on somebody else's turn — the only requirement is priority");
  applyAction(s, 1, find(s, 1, "cast")[0]);
  eq(stackSize(s), 1, "it goes on the stack like any spell");
  eq(peekStack(s).playerId, 1, "controlled by whoever cast it");
}
{
  const s = table();
  const mountain = {card: "Mountain", types: ["Land"], abilities: [{id: "t-r", kind: "mana", tapSelf: true, produces: {R: 1}}]};
  addObject(s, {...mountain, owner: 0, controller: 0}, "battlefield");
  addObject(s, {...BOLT, owner: 0, controller: 0}, "hand", 0);
  addObject(s, {...BEARS, owner: 0, controller: 0}, "hand", 0);
  walkTo(s, "MAIN1");
  applyAction(s, 0, find(s, 0, "activate-mana")[0]);
  applyAction(s, 0, find(s, 0, "cast")[0]);
  eq(find(s, 0, "cast").length, 0,
    "and with something on the stack a sorcery-speed spell is not offered, though an instant would be");
}

/* ---- the pool empties between steps, so mana does not carry (CR 500.4) ---- */
{
  const s = table();
  addObject(s, {...FOREST, owner: 0, controller: 0}, "battlefield");
  addObject(s, {...BEARS, owner: 0, controller: 0}, "hand", 0);
  advance(s);
  applyAction(s, 0, find(s, 0, "activate-mana")[0]);
  walkTo(s, "MAIN1");
  eq(s.players[0].manaPool.G, 0, "mana tapped in upkeep is gone by the main phase");
  eq(find(s, 0, "cast").length, 0, "so it does not pay for anything there");
}

/* ---- refusals ---- */
{
  const s = table();
  const forest = addObject(s, {...FOREST, owner: 0, controller: 0}, "battlefield");
  advance(s);
  const tap = find(s, 0, "activate-mana")[0];
  applyAction(s, 0, tap);
  assert.throws(() => applyAction(s, 0, tap), /not (a )?legal/i,
    "a land cannot be tapped twice — the offered list is the only truth"); checks += 1;
  eq(s.objects[forest].tapped, true, "and it is still just tapped once");
}

/* ---- a real game, with spells in it, still terminates and still replays ---- */
function playOut(seed, turnLimit = 30) {
  const state = createState(pod);
  for (let seat = 0; seat < 4; seat += 1) {
    for (let i = 0; i < 30; i += 1) addObject(state, {...FOREST, owner: seat, controller: seat}, "library", seat);
    for (let i = 0; i < 4; i += 1) addObject(state, {...FOREST, owner: seat, controller: seat}, "hand", seat);
    for (let i = 0; i < 3; i += 1) addObject(state, {...BEARS, owner: seat, controller: seat}, "hand", seat);
  }
  beginGame(state);
  const rng = createRng(seed);
  const pilot = randomLegalPilot(rng);
  let steps = 0, casts = 0;
  while (state.turn <= turnLimit && steps < 40000) {
    steps += 1;
    /* Since 1.5 a game can END, and advancing a finished one is refused. */
    if (gameOver(state)) break;
    if (state.awaiting) { const a = pilot.answer(awaitingChoice(state)); resolveAwaiting(state, a.indices, a.amounts); continue; }
    if (state.priorityPlayer === null) { advance(state); continue; }
    const chosen = pilot.choose(legalActions(state, state.priorityPlayer));
    if (chosen.kind === "pass") {
      if (passPriority(state).outcome === "step-ends") advance(state);
    } else {
      if (chosen.kind === "cast") casts += 1;
      applyAction(state, state.priorityPlayer, chosen);
    }
  }
  return {state, steps, casts};
}
{
  const a = playOut("spells");
  ok(a.steps < 40000, "a game with spells in it terminates");
  /* SUMMED OVER SEEDS, NOT MEASURED ON ONE. A single seed's count is a sample, and it moved the
     moment combat started drawing from the same stream — the same seed is a different game as soon
     as anything else consumes randomness. What has to hold is that the path works at all: a pilot
     that could never assemble tap, tap, cast inside one window of priority would total zero. */
  const spread = ["spells", "spells-2", "spells-3", "spells-4"].map((seed) => playOut(seed));
  const total = spread.reduce((sum, run) => sum + run.casts, 0);
  ok(total > 5, `creatures got cast across four seeds (${spread.map((r) => r.casts).join(", ")})`);
  ok(spread.some((run) => run.state.zones.battlefield.some((id) => run.state.objects[id].card === "Grizzly Bears")),
    "and resolved onto the battlefield, which is the whole path: tap, cast, resolve");
  checks -= 2;

  const b = playOut("spells");
  eq(hashState(a.state), hashState(b.state), "the same seed plays the same game");
  eq(a.casts, b.casts, "casting the same spells");
  ok(hashState(playOut("another").state) !== hashState(a.state), "and a different seed does not");
}

console.log(`engine-cast: ${checks} checks passed — a mana ability never touches the stack, sorcery speed and instant speed are two different rules, and a game with spells in it replays exactly.`);
