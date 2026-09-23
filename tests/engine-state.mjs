/* THE STATE IS PLAIN DATA, AND ZONES ARE WHERE CARDS ACTUALLY LIVE.
 *
 * `docs/engine/PLAN.md` §3.1 (state/: objects, zones, players, counters, mana pool, attachments,
 * control, timestamps) and §3.2.4 (checkpointable: game state is plain data).
 *
 * Two invariants carry most of the weight, and both are cheap to get wrong:
 *
 *   ONE OBJECT IS IN ONE ZONE. A card that is in a graveyard and still on a battlefield is the
 *   shape of bug that produces impossible boards and un-reproducible games.
 *
 *   MOVING A CARD MAKES A NEW OBJECT (CR 400.7). A creature that dies and returns is not the same
 *   object, does not remember its counters and is not what an "exile it until…" effect was
 *   tracking. Getting this wrong is the classic rules-engine defect.
 */
import assert from "node:assert/strict";
import {createState, addObject, moveObject, zoneOf, cardsIn, ZONES, PER_PLAYER} from "../game/engine/state/index.mjs";
import {hashState} from "../game/engine/journal.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const pod = {
  matchId: "m", seed: "s",
  players: [{name: "Rob"}, {name: "Krenko"}, {name: "Atraxa"}, {name: "Shadrix"}],
};

/* ---- a new game ---- */
{
  const s = createState(pod);
  eq(s.players.length, 4, "four seats");
  eq(s.players.map((p) => p.life), [40, 40, 40, 40], "Commander starts at 40 (CR 903.7)");
  eq(s.players.map((p) => p.id), [0, 1, 2, 3], "seats are numbered from zero and are stable");
  ok(s.players.every((p) => p.poison === 0 && !p.lost), "nobody is poisoned or out at the start");
  eq(s.turn, 0, "turn zero until the first turn begins");
  eq(hashState(s), hashState(createState(pod)), "the same pod makes the same state — no clock, no counter shared between games");
  eq(JSON.parse(JSON.stringify(s)), s, "the whole state is plain data, so it clones and hashes");
}

/* ---- zones ---- */
{
  const s = createState(pod);
  for (const zone of ZONES) ok(zone in s.zones, `${zone} exists from the start, empty, rather than appearing on first use`);
  for (const zone of PER_PLAYER) {
    eq(s.zones[zone].length, 4, `${zone} is per player, one list each`);
    ok(s.zones[zone].every((list) => Array.isArray(list) && list.length === 0), `${zone} starts empty for everyone`);
  }
  ok(Array.isArray(s.zones.battlefield) && Array.isArray(s.zones.stack),
    "the battlefield and the stack are shared, so they are one list, not one per player");
}

/* ---- objects, and the one-zone invariant ---- */
{
  const s = createState(pod);
  const id = addObject(s, {card: "Forest", controller: 0, owner: 0}, "library", 0);
  ok(Number.isInteger(id), "adding a card returns its object id");
  eq(zoneOf(s, id), "library", "and it is in the zone it was put in");
  eq(cardsIn(s, "library", 0).length, 1, "which is seat 0's library");
  eq(cardsIn(s, "library", 1).length, 0, "and not anyone else's");

  const moved = moveObject(s, id, "hand", 0);
  ok(moved !== id, "moving a card between zones makes a NEW object (CR 400.7) — it does not remember its old life");
  eq(zoneOf(s, moved), "hand", "the new object is in the new zone");
  eq(cardsIn(s, "library", 0).length, 0, "and it left the old one");

  const everywhere = ZONES.flatMap((z) => (PER_PLAYER.includes(z)
    ? s.zones[z].flat() : s.zones[z]));
  eq(everywhere.filter((x) => x === moved).length, 1,
    "exactly one zone holds it — a card in two places is the bug that makes a board impossible");
  eq(everywhere.filter((x) => x === id).length, 0, "and the old object is gone, not orphaned in a zone");
}

/* ---- timestamps (CR 613.7), which layers will need ---- */
{
  const s = createState(pod);
  const a = addObject(s, {card: "A", controller: 0, owner: 0}, "battlefield");
  const b = addObject(s, {card: "B", controller: 0, owner: 0}, "battlefield");
  ok(s.objects[b].timestamp > s.objects[a].timestamp, "later objects have later timestamps");
  const moved = moveObject(s, a, "graveyard", 0);
  ok(s.objects[moved].timestamp > s.objects[b].timestamp,
    "and moving zones takes a new one, so a returning permanent is not older than what is already there");
}

/* ---- a card belongs to its owner however far it travels (CR 108.3) ---- */
{
  const s = createState(pod);
  const id = addObject(s, {card: "Stolen", controller: 0, owner: 3}, "battlefield");
  const moved = moveObject(s, id, "graveyard", 3);
  eq(s.objects[moved].owner, 3, "owner survives a zone change");
  eq(cardsIn(s, "graveyard", 3).length, 1, "and the card goes to its OWNER's graveyard, not its controller's");
}

/* ---- refusals, rather than quiet corruption ---- */
{
  const s = createState(pod);
  assert.throws(() => addObject(s, {card: "X", owner: 0}, "nowhere"), /zone/i); checks += 1;
  assert.throws(() => addObject(s, {card: "X", owner: 0}, "library"), /player/i,
    "a per-player zone needs a seat; adding without one would silently pick a library"); checks += 1;
  assert.throws(() => moveObject(s, 9999, "hand", 0), /object/i); checks += 1;
  assert.throws(() => createState({...pod, players: [{name: "Alone"}]}), /two/i,
    "a one-player game is not a game"); checks += 1;
  assert.throws(() => createState({...pod, players: new Array(5).fill({name: "x"})}), /four/i); checks += 1;
}

console.log(`engine-state: ${checks} checks passed — one object in one zone, a new object on every move, and the whole state is plain data.`);
