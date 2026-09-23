/* THE STACK: LAST ON, FIRST OFF, AND THE CARD IS REALLY THERE.
 *
 * `docs/engine/PLAN.md` §3.3 (priority and the stack, CR 117, 405, 601, 608).
 *
 * The part that is easy to fake and expensive to fake: A SPELL'S CARD IS IN THE STACK ZONE
 * (CR 405.1). It is not still in the hand with a note attached. Getting that wrong means a hand
 * count is wrong for every player watching, "return target card from your graveyard" can find a
 * card that is mid-cast, and a countered spell has nowhere to go. The stack zone and the list of
 * stack entries are two lists here, because an activated ability has no card at all — so this
 * suite pins that they never drift apart.
 *
 * The other one: AN ABILITY ON THE STACK IS INDEPENDENT OF ITS SOURCE (CR 113.7a). Destroying the
 * creature does not remove its activated ability from the stack, and the ability resolving does
 * not move any card anywhere.
 */
import assert from "node:assert/strict";
import {createState, addObject, cardsIn, zoneOf} from "../game/engine/state/index.mjs";
import {
  pushSpell, pushAbility, peekStack, stackSize, resolveTop, stackProjection,
} from "../game/engine/rules/stack.mjs";
import {hashState} from "../game/engine/journal.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const pod = {
  matchId: "m", seed: "s",
  players: [{name: "Rob"}, {name: "Krenko"}, {name: "Atraxa"}, {name: "Shadrix"}],
};

/* The zone list and the entry list must agree on the cards they share, always. */
function coherent(state, why) {
  const fromEntries = state.stack.map((e) => e.objectId).filter((id) => id !== null);
  eq(state.zones.stack, fromEntries, why);
}

/* ---- a fresh state has a stack, empty, rather than growing one on first use ---- */
{
  const s = createState(pod);
  eq(s.stack, [], "the entry list exists from the start");
  eq(s.zones.stack, [], "and so does the zone");
  eq(stackSize(s), 0, "with nothing on it");
  eq(peekStack(s), null, "and nothing to look at");
}

/* ---- casting moves the card out of the hand and onto the stack (CR 405.1) ---- */
{
  const s = createState(pod);
  const inHand = addObject(s, {card: "Grizzly Bears", owner: 0, controller: 0}, "hand", 0);
  const entry = pushSpell(s, inHand, {controller: 0, permanent: true});

  eq(cardsIn(s, "hand", 0).length, 0,
    "the card left the hand — a spell being cast is not still in hand with a note attached");
  eq(zoneOf(s, entry.objectId), "stack", "it is in the stack zone, where CR 405.1 puts it");
  ok(entry.objectId !== inHand, "and moving zones made a new object, as every zone change does");
  eq(stackSize(s), 1, "one thing on the stack");
  coherent(s, "the zone and the entries agree");
}

/* ---- the entry carries what the board already reads (12.1) ---- */
{
  const s = createState(pod);
  const card = addObject(s, {card: "Lightning Bolt", owner: 2, controller: 2}, "hand", 2);
  const entry = pushSpell(s, card, {controller: 2, targets: [{playerId: 0}]});
  for (const field of ["stackId", "abilityId", "cardId", "name", "faceDown", "playerId", "kind", "stage", "targets"])
    ok(field in entry, `a stack entry carries ${field}, because the projection contract names it`);
  eq(entry.kind, "spell", "a cast card is a spell");
  eq(entry.playerId, 2, "controlled by whoever cast it");
  eq(entry.name, "Lightning Bolt", "and named, so the board can say what is happening");
  eq(entry.targets, [{playerId: 0}], "with its targets");

  const shown = stackProjection(s);
  eq(shown.length, 1, "the projection shows it");
  ok(!("objectId" in shown[0]), "without the engine's own object id — no caller receives an engine object");
}

/* ---- last on, first off (CR 608.1) ---- */
{
  const s = createState(pod);
  const first = pushAbility(s, {sourceId: null, controller: 0, abilityId: "a1"});
  const second = pushAbility(s, {sourceId: null, controller: 1, abilityId: "a2"});
  eq(peekStack(s).stackId, second.stackId, "the top of the stack is the last thing put on it");
  resolveTop(s);
  eq(peekStack(s).stackId, first.stackId, "and under it is the one before");
  ok(second.stackId !== first.stackId, "stack ids do not repeat");
}

/* ---- where a spell goes when it resolves ---- */
{
  const s = createState(pod);
  const creature = addObject(s, {card: "Grizzly Bears", owner: 0, controller: 0}, "hand", 0);
  const entry = pushSpell(s, creature, {controller: 0, permanent: true});
  const events = resolveTop(s);
  eq(stackSize(s), 0, "the stack is empty again");
  eq(cardsIn(s, "battlefield").length, 1, "a permanent spell resolves onto the battlefield (CR 608.3)");
  ok(events.some((e) => e.kind === "GameEventSpellResolved"), "and the resolution is reported");
  const zoneChange = events.find((e) => e.kind === "GameEventCardChangeZone");
  eq(zoneChange.data.fields.from.zoneType, "Stack", "from the Stack");
  eq(zoneChange.data.fields.to.zoneType, "Battlefield", "to the Battlefield");
  ok(cardsIn(s, "battlefield")[0] !== entry.objectId, "arriving is another zone change, so another object");
  coherent(s, "and the two lists are still in step");
}
{
  const s = createState(pod);
  /* Owner 3, controller 0: somebody else's card being cast. It goes to its OWNER's graveyard. */
  const bolt = addObject(s, {card: "Lightning Bolt", owner: 3, controller: 0}, "hand", 3);
  pushSpell(s, bolt, {controller: 0, permanent: false});
  resolveTop(s);
  eq(cardsIn(s, "graveyard", 3).length, 1,
    "an instant goes to its OWNER's graveyard as the last part of resolving (CR 608.2m)");
  eq(cardsIn(s, "graveyard", 0).length, 0, "not to the graveyard of whoever cast it");
}

/* ---- an ability is not its source (CR 113.7a) ---- */
{
  const s = createState(pod);
  const source = addObject(s, {card: "Llanowar Elves", owner: 0, controller: 0}, "battlefield");
  pushAbility(s, {sourceId: source, controller: 0, abilityId: "tap-for-g", kind: "ability"});
  eq(peekStack(s).objectId, null, "an ability puts no card on the stack");
  eq(zoneOf(s, source), "battlefield", "its source has not moved");
  const events = resolveTop(s);
  eq(stackSize(s), 0, "it resolved");
  eq(zoneOf(s, source), "battlefield", "and its source still has not moved — an ability resolving is not a zone change");
  ok(!events.some((e) => e.kind === "GameEventCardChangeZone"), "so nothing reports one");
  coherent(s, "the lists agree with an ability in the mix, which is the case that drifts");
}

/* ---- a trigger is a kind, not a different list ---- */
{
  const s = createState(pod);
  const entry = pushAbility(s, {sourceId: null, controller: 1, abilityId: "t1", kind: "trigger"});
  eq(entry.kind, "trigger", "a triggered ability says so");
  eq(peekStack(s).kind, "trigger", "and sits on the same stack as everything else");
}

/* ---- an effect runs before the card leaves the stack ---- */
{
  const s = createState(pod);
  const bolt = addObject(s, {card: "Lightning Bolt", owner: 0, controller: 0}, "hand", 0);
  const entry = pushSpell(s, bolt, {controller: 0, permanent: false});
  let sawZone = null;
  resolveTop(s, (state, resolving) => { sawZone = zoneOf(state, resolving.objectId); });
  eq(sawZone, "stack",
    "an effect resolves while its spell is still on the stack — moving the card first would make a spell unable to refer to itself");
}

/* ---- refusals ---- */
{
  const s = createState(pod);
  assert.throws(() => resolveTop(s), /empty|nothing/i,
    "resolving an empty stack is a caller's bug, not a no-op"); checks += 1;
  assert.throws(() => pushSpell(s, 9999, {controller: 0}), /object/i); checks += 1;
  const onField = addObject(s, {card: "Forest", owner: 0, controller: 0}, "battlefield");
  assert.throws(() => pushAbility(s, {sourceId: onField, controller: 0}), /abilityId|ability id/i,
    "an ability on the stack has to say which ability it is, or nothing can resolve it"); checks += 1;
}

/* ---- the stack is plain data, and the same game hashes the same ---- */
{
  const build = () => {
    const s = createState(pod);
    const a = addObject(s, {card: "A", owner: 0, controller: 0}, "hand", 0);
    pushSpell(s, a, {controller: 0, permanent: true});
    pushAbility(s, {sourceId: null, controller: 1, abilityId: "x"});
    return s;
  };
  const s = build();
  eq(JSON.parse(JSON.stringify(s)), s, "a state with a loaded stack is still plain data");
  eq(hashState(s), hashState(build()), "and hashes the same when it is built the same way");
  resolveTop(s);
  ok(hashState(s) !== hashState(build()), "resolving something changes it");
}

console.log(`engine-stack: ${checks} checks passed — last on first off, the card really is in the stack zone, and an ability is not its source.`);
