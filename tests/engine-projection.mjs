/* WHAT A SEAT MAY SEE, AND THE PROPERTY THAT NOTHING ELSE LEAKS.
 *
 * `docs/engine/PLAN.md` §3.2.2 ("one state, many projections… no caller ever receives an engine
 * object"), §3.8 ("seat visibility is enforced inside the engine, not by the host, so a cloud host
 * that serves many tables cannot leak a hand by a routing mistake") and the phase 1 gate's third
 * clause: NO HIDDEN CARD IN ANY SEAT PROJECTION.
 *
 * THIS IS THE ONLY SECURITY-SHAPED QUESTION THE ENGINE ANSWERS, and it is worth stating plainly
 * why it is answered here rather than upstream. A projection is what crosses every boundary: the
 * browser seat, the guest gateway, an API pilot, and eventually the network. If visibility is
 * decided by the caller, then every caller is a place to get it wrong, and the one that gets it
 * wrong shows somebody else's hand. Deciding it once, in the engine, means a routing mistake in the
 * host can lose a game but cannot leak one.
 *
 * A COUNT IS NOT A CARD. An opponent's hand is a number; a library is a number. The projection has
 * to carry the count, because the board draws it, without carrying what the cards are. The failure
 * mode is not usually a deliberate leak — it is a zone serialized wholesale because it was
 * convenient, with the UI happening not to render it.
 *
 * THE PROPERTY TEST IS NOT A LIST OF CASES. It plays whole random games and checks EVERY seat's
 * projection at EVERY decision point: that no card the seat may not see appears anywhere in it,
 * under any key, at any depth. A test that checks the zones it thought of cannot catch a leak
 * through a field somebody adds later, which is exactly how this kind of bug arrives.
 */
import assert from "node:assert/strict";
import {createState, addObject, cardsIn, moveObject} from "../game/engine/state/index.mjs";
import {beginGame, advance, currentPhase, awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {legalActions, applyAction} from "../game/engine/rules/actions.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";
import {gameOver} from "../game/engine/rules/sba.mjs";
import {projectFor, PROJECTION_SCHEMA} from "../game/engine/projection.mjs";
import {createRng} from "../game/engine/rng.mjs";
import {randomLegalPilot} from "../game/engine/pilots/random-legal.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const pod = {matchId: "m", seed: "s", players: [{name: "Rob"}, {name: "Krenko"}, {name: "Atraxa"}, {name: "Shadrix"}]};
const creature = (over) => ({types: ["Creature"], power: 2, toughness: 2, ...over});
const FOREST = {card: "Forest", types: ["Land"], abilities: [{id: "t-g", kind: "mana", tapSelf: true, produces: {G: 1}}]};

function table() {
  const s = createState(pod);
  for (let seat = 0; seat < 4; seat += 1) {
    for (let i = 0; i < 30; i += 1)
      /* A name unique to its seat, so any appearance of it in another seat's view is unambiguous.
         Real decks share basics; distinguishable ones are what make the property test sharp. */
      addObject(s, {...FOREST, card: `Forest of ${seat}`, owner: seat, controller: seat}, "library", seat);
    for (let i = 0; i < 5; i += 1)
      addObject(s, creature({card: `Secret of ${seat}`, owner: seat, controller: seat, manaCost: "{1}{G}"}), "hand", seat);
  }
  beginGame(s);
  return s;
}

/* Every string anywhere in a structure, however deeply nested and under whatever key. This is the
   whole point: a leak through a field nobody thought to check is still a leak. */
function everyString(value, out = []) {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) for (const item of value) everyString(item, out);
  else if (value && typeof value === "object") for (const item of Object.values(value)) everyString(item, out);
  return out;
}

/* ---- the shape the board already reads (§12.1) ---- */
{
  const s = table();
  const view = projectFor(s, 0);
  eq(view.schema, PROJECTION_SCHEMA, "the projection names its schema, so a reader can refuse an old one");
  eq(view.turn, 1, "the turn");
  eq(view.turnPlayerId, 0, "whose it is");
  eq(view.phase, "UNTAP", "and the phase, under the name the board already renders");
  eq(view.players.length, 4, "every seat is present");
  eq(view.stackSize, 0, "with an empty stack");
  eq(view.gameOver, null, "and a game still running");
  eq(JSON.parse(JSON.stringify(view)), view, "a projection is plain data — no caller receives an engine object");
}

/* ---- your own hand, and nobody else's ---- */
{
  const s = table();
  for (let seat = 0; seat < 4; seat += 1) {
    const view = projectFor(s, seat);
    const mine = view.players.find((p) => p.playerId === seat);
    eq(mine.zones.Hand.count, 5, "you are told how many cards you hold");
    eq(mine.zones.Hand.cards.length, 5, "and which they are");
    ok(mine.zones.Hand.cards.every((c) => c.name === `Secret of ${seat}`), "your own cards, by name");

    for (const other of view.players.filter((p) => p.playerId !== seat)) {
      eq(other.zones.Hand.count, 5, "an opponent's hand is a COUNT, which the board draws");
      eq(other.zones.Hand.cards, [], "and no cards at all — not a list of face-down ones, none");
      eq(other.zones.Hand.hiddenCount, 5, "with the hidden count said outright, so nothing has to be inferred");
    }

    /* THE PROPERTY, stated over the whole document rather than over the zones this test thought of. */
    const strings = everyString(view);
    for (let them = 0; them < 4; them += 1) {
      if (them === seat) continue;
      ok(!strings.includes(`Secret of ${them}`),
        them === 0 ? `seat ${seat} cannot see seat ${them}'s cards ANYWHERE in the document` : true);
      checks -= them === 0 ? 0 : 1;
    }
  }
}

/* ---- a library is a count, even your own (CR 401.2) ---- */
{
  const s = table();
  const view = projectFor(s, 0);
  const mine = view.players.find((p) => p.playerId === 0);
  eq(mine.zones.Library.count, 30, "you know how many cards are in your library");
  eq(mine.zones.Library.cards, [],
    "and not what they are — a library is hidden from its owner too, which is the case an engine forgets");
  eq(mine.zones.Library.hiddenCount, 30, "all of it hidden");
}

/* ---- the battlefield and graveyards are public (CR 400.2) ---- */
{
  const s = table();
  addObject(s, creature({card: "Public Bear", owner: 1, controller: 1}), "battlefield");
  addObject(s, creature({card: "Dead Thing", owner: 2, controller: 2}), "graveyard", 2);
  for (let seat = 0; seat < 4; seat += 1) {
    const view = projectFor(s, seat);
    const strings = everyString(view);
    ok(strings.includes("Public Bear"), seat === 0 ? "everybody sees the battlefield" : true);
    ok(strings.includes("Dead Thing"), seat === 0 ? "and everybody sees every graveyard" : true);
    checks -= seat === 0 ? 0 : 2;
  }
}

/* ---- the stack is public, and so is what is on it ---- */
{
  const s = table();
  let guard = 0;
  while (currentPhase(s) !== "MAIN1" && guard < 30) { advance(s); guard += 1; }
  addObject(s, {...FOREST, owner: 0, controller: 0}, "battlefield");
  addObject(s, {...FOREST, owner: 0, controller: 0}, "battlefield");
  for (const tap of legalActions(s, 0).filter((a) => a.kind === "activate-mana")) applyAction(s, 0, tap);
  const cast = legalActions(s, 0).find((a) => a.kind === "cast");
  applyAction(s, 0, cast);

  for (let seat = 0; seat < 4; seat += 1) {
    const view = projectFor(s, seat);
    eq(view.stackSize, 1, seat === 0 ? "every seat sees the stack" : true);
    eq(view.stack[0].name, "Secret of 0", seat === 0 ? "and what is on it, named — casting a spell reveals it" : true);
    checks -= seat === 0 ? 0 : 2;
  }
  /* And the seat that cast it now holds one fewer secret, which everyone can count. */
  const opponent = projectFor(s, 1).players.find((p) => p.playerId === 0);
  eq(opponent.zones.Hand.count, cardsIn(s, "hand", 0).length, "a hand count follows the real hand");
}

/* ---- life, poison and commander damage are public (CR 903.10) ---- */
{
  const s = table();
  s.players[1].life = 12;
  s.players[1].poison = 4;
  const view = projectFor(s, 0);
  const them = view.players.find((p) => p.playerId === 1);
  eq(them.life, 12, "an opponent's life total is public");
  eq(them.health.poison, 4, "so is their poison, because a player has to be able to count to ten");
}

/* ---- combat is public ---- */
{
  const s = table();
  s.combat = {attackingPlayerId: 0, defenders: [1], firstStrike: false,
    attacks: [{attacker: 99, defender: 1, blocked: false, blockers: []}]};
  const view = projectFor(s, 3);
  eq(view.combat.attacks.length, 1, "a seat not in the combat still sees it");
  eq(view.combat.attacks[0].defender, 1, "including who is being attacked");
}

/* ---- a projection is a copy, not a window ---- */
{
  const s = table();
  const view = projectFor(s, 0);
  view.players[0].life = 1;
  view.players[0].zones.Hand.cards.length = 0;
  eq(s.players[0].life, 40, "changing a projection does not change the game");
  eq(cardsIn(s, "hand", 0).length, 5, "nor its zones — a caller holding a view cannot reach through it");
}

/* ---- refusals ---- */
{
  const s = table();
  assert.throws(() => projectFor(s, 9), /seat|viewer/i,
    "a seat that is not at the table gets no projection at all, rather than an empty one"); checks += 1;
  const spectator = projectFor(s, null);
  eq(spectator.viewerSeatId, null, "a spectator view exists");
  for (let seat = 0; seat < 4; seat += 1)
    eq(spectator.players[seat].zones.Hand.cards, [],
      seat === 0 ? "and sees no hand at all, which is the safe default for anyone not in a seat" : true);
  checks -= 3;
}

/* ---- a face-down permanent (CR 708): present to all, a 2/2 creature with no name; the card its controller's alone to
   look at (CR 708.5) -- manifested here from Krenko's library, whose cards' names no other seat holds ---- */
{
  const s = table();
  const id = moveObject(s, cardsIn(s, "library", 1)[0], "battlefield", null, {faceDown: true});
  for (let seat = 0; seat < 4; seat += 1) {
    const card = projectFor(s, seat).players[1].zones.Battlefield.cards.find((c) => c.cardId === id);
    eq([card.name, card.faceDown, card.types, card.power, card.toughness, card.faceDownName], [null, true, ["Creature"], 2, 2, seat === 1 ? "Forest of 1" : undefined],
      seat === 0 ? "every seat sees a face-down 2/2 creature with no name, and only Krenko, its controller, which card it is" : true);
    if (seat !== 1) ok(!everyString(projectFor(s, seat)).includes("Forest of 1"), seat === 0 ? "and nowhere in another seat's document is it named" : true);
    checks -= seat === 0 ? 0 : seat === 1 ? 1 : 2;
  }
  eq(projectFor(s, 1).players[1].zones.Battlefield.hiddenCount, 1, "its own zone counts it as hidden: it has no name");
}

/* ---- THE PROPERTY: a whole random game, every seat, every decision point ---- */
{
  const seeds = ["leak-1", "leak-2", "leak-3"];
  let looks = 0;
  for (const seed of seeds) {
    const s = table();
    const pilot = randomLegalPilot(createRng(seed));
    let steps = 0;

    const inspect = () => {
      looks += 1;
      for (let seat = 0; seat < 4; seat += 1) {
        const strings = everyString(projectFor(s, seat));
        for (let them = 0; them < 4; them += 1) {
          if (them === seat) continue;
          /* A card is a secret while it is in a hand or a library. Once it is cast or on the
             battlefield it is public and its name is expected to appear, so the check asks the
             state where the card actually is rather than matching on the name alone. */
          const hidden = [...cardsIn(s, "hand", them), ...cardsIn(s, "library", them)]
            .map((id) => s.objects[id].card);
          for (const name of hidden) {
            /* Names repeat across zones, so a name is only a leak if NO public copy exists. */
            /* A name is only a leak when the viewer has no legitimate source for it: not on the
               battlefield, the stack, any graveyard or exile, and not in the viewer's own hand. */
            const publiclyVisible = cardsIn(s, "hand", seat).some((id) => s.objects[id].card === name)
              || s.zones.battlefield.some((id) => s.objects[id].card === name)
              || s.zones.stack.some((id) => s.objects[id].card === name)
              || s.zones.graveyard.some((list) => list.some((id) => s.objects[id].card === name))
              || s.zones.exile.some((id) => s.objects[id].card === name);
            if (publiclyVisible) continue;
            if (strings.includes(name))
              throw new assert.AssertionError({
                message: `seat ${seat} could see ${JSON.stringify(name)}, which is only in seat ${them}'s hidden zones`,
                actual: name, expected: "not visible", operator: "leak",
              });
          }
        }
      }
    };

    while (s.turn <= 12 && steps < 40000) {
      steps += 1;
      if (gameOver(s)) break;
      inspect();
      if (s.awaiting) {
        const answer = pilot.answer(awaitingChoice(s));
        resolveAwaiting(s, answer.indices, answer.amounts);
        continue;
      }
      if (s.priorityPlayer === null) { advance(s); continue; }
      const chosen = pilot.choose(legalActions(s, s.priorityPlayer));
      if (chosen.kind === "pass") { if (passPriority(s).outcome === "step-ends") advance(s); }
      else applyAction(s, s.priorityPlayer, chosen);
    }
  }
  /* A floor, not a target: the number moves whenever anything else consumes randomness. What it
     rules out is a loop that exited early and proved nothing. */
  ok(looks > 300,
    `three whole games, every seat, every decision point: ${looks} decision points, four projections each, and no leak`);
}

console.log(`engine-projection: ${checks} checks passed — a count is not a card, a library is hidden from its owner too, and three whole games leaked nothing to anybody.`);
