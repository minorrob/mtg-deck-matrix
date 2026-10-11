/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* TRAIN C, P4-REPLACEMENTS: COUNTERS PUT ON, REPLACED -- MORE, ONE MORE, AND HALF (CR 614.1a, 616.1, 122.6).
 *
 * The static `more-counters` (rules/statics.mjs, placeCounters) was "twice that many" alone. Now: "that many plus one"
 * (`plus`; Hardened Scales, Yoshimaru), "half that many, rounded down" (`half`; Vorinclex's for its opponents), and who must
 * be putting them, "you" or "opponent" (`putBy`). Each applies once, and only to one or more (CR 614.5): half of one is
 * none, and then nothing has anything to add to. The order of two whose orders end differently is the affected player's
 * (CR 616.1): asked in a resolution before any is put (effects/asking.mjs, orderCounters), and where nothing can stop to ask
 * the most for the player putting them on their own, the fewest put by another.
 * Here, what the scenarios cannot reach: the arithmetic of every pair, the question's words and whom it asks, a second
 * placement in one effect, the fallback both ways, players' counters, four players, the house pilot, the schema, the credit.
 */
import assert from "node:assert/strict";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {compileScript} from "../game/engine/cards/index.mjs";
import {placeCounters, countersPlaced, playerCountersPlaced} from "../game/engine/rules/statics.mjs";
import {beginResolution} from "../game/engine/script/resolution.mjs";
import {awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {runEffect} from "../game/engine/script/effects/index.mjs";
import {housePilot} from "../game/engine/pilots/house-pilot.mjs";
import {projectFor} from "../game/engine/projection.mjs";
import {missingFor} from "../game/tools/engine-constructs.mjs";
import {concede} from "../game/engine/rules/sba.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const SCALES = "Hardened Scales", YOSHI = "Yoshimaru, Beloved Companion", VORIN = "Vorinclex, Monstrous Raider", BE = "Branching Evolution", ANGEL = "Darksteel Angel";
const FIX = {
  Bear: {types: ["Creature"], subtypes: ["Bear"], manaCost: "{1}{G}", colors: ["G"], power: 2, toughness: 2},
  Relic: {types: ["Artifact"], subtypes: [], manaCost: "{2}", colors: []},
  /* "Twice that many counters of any kind on a permanent you control", saying nothing of players. */
  Doubler: {types: ["Artifact"], subtypes: [], manaCost: "{2}", colors: [], abilities: [{id: "d", kind: "static", text: "x", rule: "more-counters", affects: {what: "permanent", controller: "you"}, times: 2}]},
};
const at = (seat, zone, ...cards) => ({seat, zone, cards});
const table = (setup, seats = 2) => runScenario({name: "counters replaced", seats, setup, steps: []}, index.definition, FIX).state;
const idOf = (s, name, seat = 0) => s.zones.battlefield.find((id) => s.objects[id].card === name && s.objects[id].controller === seat);

/* ---- each one, and what it does to one or more ---- */
{
  const s = table([at(0, "battlefield", SCALES, "Bear", "Relic"), at(1, "battlefield", "Bear")]);
  const bear = idOf(s, "Bear"), hers = idOf(s, "Bear", 1);
  eq([countersPlaced(s, bear, "+1/+1", 1, 0), countersPlaced(s, bear, "+1/+1", 3, 1), countersPlaced(s, hers, "+1/+1", 1, 0)], [2, 4, 1],
    "plus one: on Rob's creature whoever puts them, never on Maya's");
  eq([countersPlaced(s, bear, "-1/-1", 2, 0), countersPlaced(s, idOf(s, "Relic"), "+1/+1", 1, 0), countersPlaced(s, bear, "+1/+1", 0, 0)], [2, 1, 0],
    "not another kind, not a noncreature, and none is none (CR 614.5's one or more)");
  const t = table([at(0, "battlefield", SCALES, SCALES, "Bear")]);
  eq([countersPlaced(t, idOf(t, "Bear"), "+1/+1", 1, 0), t.awaiting], [3, null], "two of them: plus two in either order, and nobody asked");
}
{
  const s = table([at(0, "battlefield", VORIN, "Bear"), at(1, "battlefield", "Bear")]);
  const mine = idOf(s, "Bear"), hers = idOf(s, "Bear", 1);
  eq([countersPlaced(s, mine, "+1/+1", 3, 0), countersPlaced(s, hers, "-1/-1", 1, 0), countersPlaced(s, hers, "charge", 2, 0)], [6, 2, 4],
    "Rob puts them: twice, any kind, anyone's permanent");
  eq([countersPlaced(s, hers, "+1/+1", 3, 1), countersPlaced(s, mine, "-1/-1", 5, 1), countersPlaced(s, hers, "+1/+1", 1, 1)], [1, 2, 0],
    "Maya, an opponent, puts them: half, rounded down -- and one is none");
  eq([countersPlaced(s, mine, "+1/+1", 3, null)], [3], "nobody putting them (an unknown putter) is neither");
  eq([playerCountersPlaced(s, 1, "poison", 3, 0), playerCountersPlaced(s, 0, "poison", 3, 1)], [6, 1], "and on a player: Rob's doubled, Maya's halved");
}
{
  /* Half of one is none, and then Hardened Scales has nothing to add to: Maya's one counter on Rob's Bear. */
  const s = table([at(0, "battlefield", SCALES, VORIN, "Bear")]);
  const bear = idOf(s, "Bear");
  const asked = placeCounters(s, {id: bear}, "+1/+1", 1, 1, {askable: true});
  eq([asked.question?.player, asked.question?.options.length], [0, 2], "Scales and Vorinclex's half on one counter end at 1 or 0: Rob, whose Bear it is, is asked");
  eq(countersPlaced(s, bear, "+1/+1", 1, 1), 0, "nobody to ask, put by another: the fewest -- halved to none, and Scales has nothing to add to");
  eq(countersPlaced(s, bear, "+1/+1", 1, 0), 4, "Rob's own: Vorinclex doubles, Scales adds -- the most, 4 (plus first, then twice)");
}
{
  /* "Can't have -1/-1 counters put on them" (times 0) beside Vorinclex: none, either way, and nobody is asked. */
  const s = table([at(0, "battlefield", ANGEL, VORIN)]);
  const angel = idOf(s, ANGEL);
  eq([placeCounters(s, {id: angel}, "-1/-1", 2, 0, {askable: true}), placeCounters(s, {id: angel}, "-1/-1", 2, 1, {askable: true})], [{count: 0}, {count: 0}],
    "times 0 beside twice or half: none, with no question");
}

/* ---- the question in a resolution: whom it asks, what it says, and the answer ---- */
const resolve = (s, effects, controller = 0) => beginResolution(s, effects, {controller, source: null});
{
  const s = table([at(0, "battlefield", SCALES, BE, "Bear")]);
  const bear = idOf(s, "Bear");
  const out = resolve(s, [{effect: "putCounter", targets: [bear], counter: "+1/+1", count: 1}, {effect: "gainLife", amount: 1}]);
  eq([out.status, s.awaiting?.player, s.objects[bear].counters["+1/+1"] ?? 0], ["waiting", 0, 0], "asked before any counter is put");
  const q = awaitingChoice(s);
  eq([q.title, q.options.map((o) => o.label), q.options.map((o) => [o.puts, o.least])],
    ["1 +1/+1 counter on Bear: which applies first?", ["Hardened Scales first: 4 counters", "Branching Evolution first: 3 counters"], [[4, 4], [3, 3]]],
    "each option says where it leads");
  assert.throws(() => resolveAwaiting(s, [2]), /Invalid selection/); checks += 1;
  resolveAwaiting(s, [1]);
  eq([s.objects[bear].counters["+1/+1"], s.players[0].life, s.awaiting], [3, 41, null], "Evolution first: three, and the resolution carried on (the life after it)");
  const out2 = resolve(s, [{effect: "dealDamage", amount: 1, targets: [bear]}]);
  eq([out2.status, s.awaiting], ["done", null], "an effect that puts no counters is never asked about them");
}
{
  /* Maya's effect, Rob's Bear: Rob is asked (CR 616.1's affected object's controller), not the effect's controller. */
  const s = table([at(0, "battlefield", SCALES, BE, "Bear")]);
  resolve(s, [{effect: "putCounter", targets: [idOf(s, "Bear")], counter: "+1/+1", count: 2}], 1);
  eq([s.awaiting?.player, awaitingChoice(s).options.map((o) => o.label)], [0, ["Hardened Scales first: 6 counters", "Branching Evolution first: 5 counters"]],
    "Maya puts them on Rob's Bear: Rob chooses");
}
{
  /* putCounterAll: each placement asked in turn, each answer its own. */
  const s = table([at(0, "battlefield", SCALES, BE, "Bear", "Bear")]);
  const [a, b] = s.zones.battlefield.filter((id) => s.objects[id].card === "Bear");
  resolve(s, [{effect: "putCounterAll", selector: {what: "permanent", types: ["Creature"], controller: "you"}, counter: "+1/+1", count: 1}]);
  resolveAwaiting(s, [0]);
  ok(s.awaiting && s.objects[a].counters["+1/+1"] === undefined, "the second Bear is asked about before either gets a counter");
  resolveAwaiting(s, [1]);
  eq([s.objects[a].counters["+1/+1"], s.objects[b].counters["+1/+1"], s.awaiting], [4, 3, null], "4 on the first, 3 on the second, as answered");
}
{
  /* Three effects: two answers, one after the other, each re-asked about what is left. */
  const s = table([at(0, "battlefield", SCALES, BE, VORIN, "Bear")]);
  const bear = idOf(s, "Bear");
  resolve(s, [{effect: "putCounter", targets: [bear], counter: "+1/+1", count: 1}]);
  const first = awaitingChoice(s);
  eq(first.options.map((o) => o.label), ["Hardened Scales first: 8 counters", "Branching Evolution first: 5 to 6 counters", "Vorinclex, Monstrous Raider first: 5 to 6 counters"],
    "three effects: what each leads to, as a range");
  resolveAwaiting(s, [first.options.findIndex((o) => o.label.startsWith(BE))]);
  const second = awaitingChoice(s);
  eq([second.options.map((o) => o.label), second.id === first.id], [["Hardened Scales first: 6 counters", "Vorinclex, Monstrous Raider first: 5 counters"], false],
    "asked again about the two left, with a question of its own");
  resolveAwaiting(s, [0]);
  eq(s.objects[bear].counters["+1/+1"], 6, "twice, plus one, twice: six");
}
{
  /* Asked, Rob concedes: his Bear leaves with him (CR 800.4a), and Maya's resolution goes on -- the counters it would have
     put on his Bear go nowhere, and hers are put on as before. */
  const s = table([at(0, "battlefield", SCALES, BE, "Bear"), at(1, "battlefield", "Bear")], 3);
  const hers = idOf(s, "Bear", 1);
  resolve(s, [{effect: "putCounterAll", selector: {what: "permanent", types: ["Creature"]}, counter: "+1/+1", count: 1}], 1);
  eq(s.awaiting?.player, 0, "Rob is asked about his Bear");
  concede(s, 0);
  eq([s.awaiting, s.resolving, s.objects[hers].counters["+1/+1"], idOf(s, "Bear")], [null, null, 1, undefined], "Rob gone, Maya's Bear has its counter and the resolution is done");
}
{
  /* Two of Rob's Hardened Scales and a doubler: two options that would read alike are numbered. */
  const s = table([at(0, "battlefield", SCALES, SCALES, BE, "Bear")]);
  resolve(s, [{effect: "putCounter", targets: [idOf(s, "Bear")], counter: "+1/+1", count: 1}]);
  eq(awaitingChoice(s).options.map((o) => o.label), ["Rob's Hardened Scales first: 5 to 6 counters (1)", "Rob's Hardened Scales first: 5 to 6 counters (2)", "Branching Evolution first: 4 counters"],
    "no two options read the same");
}
{
  /* Rob is asked about his Scales and Maya's Vorinclex (her opponent puts them: half); Maya concedes before he answers. */
  const s = table([at(0, "battlefield", SCALES, "Bear"), at(1, "battlefield", VORIN)], 3);
  const bear = idOf(s, "Bear");
  resolve(s, [{effect: "putCounter", targets: [bear], counter: "+1/+1", count: 1}]);
  eq(awaitingChoice(s).options.map((o) => o.label), ["Hardened Scales first: 1 counter", "Vorinclex, Monstrous Raider first: 0 counters"], "Scales then half is one; half first is none");
  concede(s, 1);
  eq(awaitingChoice(s).options.map((o) => o.label), ["Hardened Scales first: 2 counters", "An effect no longer there"], "Vorinclex gone with Maya: said so");
  resolveAwaiting(s, [0]);
  eq([s.objects[bear].counters["+1/+1"], s.awaiting], [2, null], "and Scales alone applies: two");
}
{
  /* A static that says nothing of players never changes a player's counters. */
  const s = table([at(0, "battlefield", "Doubler")]);
  eq([playerCountersPlaced(s, 1, "poison", 2, 0), countersPlaced(s, idOf(s, "Doubler"), "poison", 2, 0)], [2, 4], "no `players`: a player's poison as it was, a permanent's doubled");
}
{
  /* Two that end the same are not asked; a resolution with nothing to order puts them at once. */
  const s = table([at(0, "battlefield", BE, VORIN, "Bear")]);
  const out = resolve(s, [{effect: "putCounter", targets: [idOf(s, "Bear")], counter: "+1/+1", count: 1}]);
  eq([out.status, s.objects[idOf(s, "Bear")].counters["+1/+1"]], ["done", 4], "two doublers: four, and no question");
}
{
  /* A permanent entering with counters can't stop to ask: the most, its controller putting them. */
  const s = table([at(0, "battlefield", SCALES, BE), at(0, "hand", "Walking Ballista")]);
  const ballista = s.zones.hand[0].find((id) => s.objects[id].card === "Walking Ballista");
  runEffect(s, {effect: "moveZone", targets: [ballista], to: "battlefield"}, {controller: 0});
  eq(s.objects[idOf(s, "Walking Ballista")].counters["+1/+1"] ?? 0, 0, "X is 0 put onto the battlefield: none, and nothing to add one to");
  const t = table([at(0, "battlefield", SCALES, BE, "Bear")]);
  runEffect(t, {effect: "putCounter", targets: [idOf(t, "Bear")], counter: "+1/+1", count: 1}, {controller: 0});
  eq(t.objects[idOf(t, "Bear")].counters["+1/+1"], 4, "an effect run where nothing can ask, Rob putting them on his own: the most");
}

/* ---- four players: each opponent of Vorinclex's controller halved ---- */
{
  const s = table([at(0, "battlefield", VORIN), at(1, "battlefield", "Bear"), at(2, "battlefield", "Bear"), at(3, "battlefield", "Bear")], 4);
  eq([1, 2, 3].map((seat) => countersPlaced(s, idOf(s, "Bear", seat), "+1/+1", 2, seat)), [1, 1, 1], "Maya, Trey and Sam each put two on their own: one each");
  eq(countersPlaced(s, idOf(s, "Bear", 2), "+1/+1", 2, 0), 4, "Rob puts two on Trey's: four");
}

/* ---- the house pilot answers it: the most, or of -1/-1 counters the fewest ---- */
{
  const pilot = housePilot({seat: 0, cards: index.definition});
  const s = table([at(0, "battlefield", BE, SCALES, "Bear")]);
  resolve(s, [{effect: "putCounter", targets: [idOf(s, "Bear")], counter: "+1/+1", count: 1}]);
  const answer = pilot.answer(projectFor(s, 0), awaitingChoice(s));
  eq([awaitingChoice(s).options[0].label, awaitingChoice(s).options[answer.indices[0]].label], ["Branching Evolution first: 3 counters", "Hardened Scales first: 4 counters"],
    "the house pilot takes the most +1/+1 counters, not the first offered");
  /* Maya puts three -1/-1 counters on Rob's Bear: his Vorinclex halves hers, hers doubles them -- 3 or 2. */
  const t = table([at(0, "battlefield", VORIN, "Bear"), at(1, "battlefield", VORIN)]);
  resolve(t, [{effect: "putCounter", targets: [idOf(t, "Bear")], counter: "-1/-1", count: 3}], 1);
  const q = awaitingChoice(t);
  eq([t.awaiting.player, q.options.map((o) => o.label), q.options[pilot.answer(projectFor(t, 0), q).indices[0]].least], [0,
    ["Rob's Vorinclex, Monstrous Raider first: 2 counters", "Maya's Vorinclex, Monstrous Raider first: 3 counters"], 2],
    "of -1/-1 counters on its own creature, the fewest");
}

/* ---- the schema ---- */
const withStatic = (fields) => compileScript({schema: "CrankCardScript@1",
  identity: {name: "Odd Scales", oracleId: "x", types: ["Enchantment"], subtypes: [], manaCost: "{G}", colors: ["G"], colorIdentity: ["G"]},
  oracleText: "x", source: "hand", abilities: [{kind: "static", text: "x", rule: "more-counters", affects: {types: ["Creature"], controller: "you"}, ...fields}]}).problems;
eq([withStatic({plus: 1}), withStatic({half: true, putBy: "opponent", players: true}), withStatic({times: 0})], [[], [], []], "plus, half and times compile");
for (const [bad, words] of [[{plus: 1, times: 2}, "one of times, plus or half"], [{plus: 0}, "plus is a whole number"], [{half: 2}, "half is true"],
  [{putBy: "anyone"}, "putBy is"], [{players: "yes"}, "players is true"], [{times: -1}, "times is a whole number"]])
  ok(withStatic(bad).some((p) => p.includes(words)), `and refuses ${JSON.stringify(bad)}`);

/* ---- the credit ---- */
eq(missingFor({replacements: ["AddCounter"], counts: ["CounterNum"]}), [], "AddCounter and CounterNum read as built");

console.log(`engine-counters-replaced: ${checks} checks passed -- plus one, half rounded down, twice, by whom; one or more only; the order asked of the affected player where it changes how many, the most or fewest where nothing can ask; players; four seats; the pilot; the schema.`);
