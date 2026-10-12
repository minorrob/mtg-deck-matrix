/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* WAVE 4A, LANE H4: REPLACEMENTS ON CREATING TOKENS AND PUTTING COUNTERS, AND "WHENEVER ONE OR MORE COUNTERS ARE PUT"
 * (CR 614.1a, 614.5, 614.12, 616.1, 122.6) -- what the scenarios of the lane's nineteen cards cannot reach.
 *
 * rules/statics.mjs, tokensCreated: the event is the tokens an effect would make, in groups, and each replacement rewrites
 * it as it then stands -- `more-tokens`, `tokens-instead`, `tokens-plus` (now by subtypes, or of any token: Xorn, Peregrin
 * Took), and `tokens-each` (Academy Manufactor, new). Their order is the tokens' controller's whenever two orders end
 * differently, among the effects that apply to the event as it stands (CR 616.1e-f) -- Dragons instead are asked about now,
 * not applied first. Every token made gets what the effect says of its tokens (the rulings of Queen Allenal, Divine
 * Visitation, Doubling Season). A predefined token a replacement makes is compiled into its definition (cards/index.mjs).
 *
 * rules/statics.mjs, placeCounters: `players: "you"` ("or on yourself"), a player's counters alone (`affects: {what:
 * "player"}`), "if an effect would put" (`byEffect`, not a cost's), and a permanent entering with counters not seeing its
 * own effect over a set of permanents (CR 614.12) -- at every place a permanent enters with counters.
 *
 * rules/trigger.mjs: "whenever YOU put one or more counters" (`putBy: "you"`), the counters event saying who put them.
 *
 * And the credits: CounterAddedOnce is "counter added"; ReplaceCounter is AddCounter's "instead"; ReplaceToken is not yet.
 */
import assert from "node:assert/strict";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex, loadCardScenarios} from "../game/tools/engine-cards.mjs";
import {compileScript} from "../game/engine/cards/index.mjs";
import {runEffects, runEffect} from "../game/engine/script/effects/index.mjs";
import {beginResolution} from "../game/engine/script/resolution.mjs";
import {awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {housePilot} from "../game/engine/pilots/house-pilot.mjs";
import {projectFor} from "../game/engine/projection.mjs";
import {placeCounters, countersPlaced, enteringCountersPlaced, playerCountersPlaced, tokensCreated} from "../game/engine/rules/statics.mjs";
import {PREDEFINED_TOKENS} from "../game/engine/script/effects/permanents.mjs";
import {missingFor, FORGE_REPLACING_API, FORGE_REPLACEMENT, FORGE_TRIGGER} from "../game/tools/engine-constructs.mjs";
import {tableCards} from "../cloud/game-room.mjs";
import {collectTriggers} from "../game/engine/rules/trigger.mjs";
import {createState, addObject} from "../game/engine/state/index.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const AP = "Anointed Procession", QA = "Queen Allenal of Ruadach", DV = "Divine Visitation", AM = "Academy Manufactor", XORN = "Xorn", TOOK = "Peregrin Took";
const KAMI = "Kami of Whispered Hopes", DS = "Doubling Season", WC = "Winding Constrictor", LZ = "Lae'zel, Vlaakith's Champion";
const SOLDIER = {name: "Soldier", types: ["Creature"], subtypes: ["Soldier"], colors: ["W"], power: 1, toughness: 1};
const plusOne = (affects) => ({id: "p", kind: "static", text: "x", rule: "more-counters", affects, counter: "+1/+1", plus: 1});
const FIX = {
  Bear: {types: ["Creature"], subtypes: ["Bear"], manaCost: "{1}{G}", colors: ["G"], power: 2, toughness: 2},
  Relic: {types: ["Artifact"], subtypes: [], manaCost: "{2}", colors: []},
  /* "Twice that many of those tokens instead", as an enchantment: eight of them stand side by side. */
  Twin: {types: ["Enchantment"], subtypes: [], manaCost: "{G}", colors: ["G"], abilities: [{id: "t", kind: "static", text: "x", rule: "more-tokens", affects: {who: "you"}, times: 2}]},
  /* A creature that enters with two +1/+1 counters, and has Kami's "that many plus one" over every permanent its controller has. */
  "Hopeful Hydra": {types: ["Creature"], subtypes: ["Hydra"], manaCost: "{C}", colors: ["G"], power: 0, toughness: 0, abilities: [
    {id: "h", kind: "replacement", text: "This creature enters with two +1/+1 counters on it.", watches: {event: "enters", who: "self"}, change: {entersWithCounters: {counter: "+1/+1", count: 2}}},
    plusOne({what: "permanent", controller: "you"})]},
  /* "If one or more +1/+1 counters would be put on this creature, that many plus one are put on it instead": of itself alone. */
  "Self Hydra": {types: ["Creature"], subtypes: ["Hydra"], manaCost: "{C}", colors: ["G"], power: 0, toughness: 0, abilities: [
    {id: "h", kind: "replacement", text: "This creature enters with two +1/+1 counters on it.", watches: {event: "enters", who: "self"}, change: {entersWithCounters: {counter: "+1/+1", count: 2}}},
    plusOne({what: "permanent", self: true})]},
  /* Riot, and Kami's "plus one" over its controller's permanents. */
  "Riot Kami": {types: ["Creature"], subtypes: ["Spirit"], manaCost: "{C}", colors: ["G"], power: 1, toughness: 1, abilities: [
    {id: "r", kind: "replacement", text: "Riot", watches: {event: "enters", who: "self"}, change: {riot: true}}, plusOne({what: "permanent", controller: "you"})]},
  /* A 2/2 that enters with two +1/+1 counters: one a Clone may enter as a copy of. */
  "Big Hydra": {types: ["Creature"], subtypes: ["Hydra"], manaCost: "{C}", colors: ["G"], power: 2, toughness: 2, abilities: [
    {id: "h", kind: "replacement", text: "This creature enters with two +1/+1 counters on it.", watches: {event: "enters", who: "self"}, change: {entersWithCounters: {counter: "+1/+1", count: 2}}}]},
  /* "If one or more creature tokens would be created under your control, those tokens plus a Treasure token are created instead." */
  "Treasure Banner": {types: ["Enchantment"], subtypes: [], manaCost: "{G}", colors: ["G"], abilities: [{id: "b", kind: "static", text: "x", rule: "tokens-plus", affects: {types: ["Creature"]}, token: PREDEFINED_TOKENS.Treasure}]},
  /* "Whenever you put one or more +1/+1 counters on a creature you control, you gain 1 life." */
  Keeper: {types: ["Enchantment"], subtypes: [], manaCost: "{G}", colors: ["G"], abilities: [{id: "k", kind: "triggered", text: "x",
    trigger: {on: "GameEventCardCounters", counterAdded: true, counter: "+1/+1", who: "any", filter: {types: ["Creature"], controller: "you"}, putBy: "you"},
    effects: [{effect: "gainLife", amount: 1}]}]},
};
const at = (seat, zone, ...cards) => ({seat, zone, cards});
const table = (setup, seats = 2) => runScenario({name: "tokens-counters-4a", seats, setup, steps: []}, index.definition, FIX).state;
const named = (s, name, seat = 0) => s.zones.battlefield.filter((id) => s.objects[id].card === name && s.objects[id].controller === seat);
const idOf = (s, name, seat = 0) => named(s, name, seat)[0];
const make = (s, params, controller = 0) => { const context = {controller, source: null}; runEffects(s, [{effect: "createToken", count: 1, ...params}], context); return context; };
const resolve = (s, effect, controller = 0) => beginResolution(s, [effect], {controller, source: null});
const labels = (s) => awaitingChoice(s).options.map((o) => o.label).sort();
const answer = (s, label) => {
  const option = awaitingChoice(s).options.find((o) => o.label === label);
  assert.ok(option, `no option ${label}: ${labels(s).join(", ")}`);
  return resolveAwaiting(s, [option.index]);
};

/* ---- the token event: groups, each replacement rewriting it as it stands ---- */
{
  /* Academy Manufactor's one of each, by the kind's subtype: a Food Golem creature token is a Food. */
  const s = table([at(0, "battlefield", AM)]);
  make(s, {token: {name: "Gingerbrute", types: ["Artifact", "Creature"], subtypes: ["Food", "Golem"], colors: [], power: 1, toughness: 1}});
  eq([named(s, "Gingerbrute").length, named(s, "Clue").length, named(s, "Treasure").length, named(s, "Food").length], [1, 1, 1, 0],
    "a Food Golem is a Food token: it, and a Clue and a Treasure beside it -- no second Food");
  const groups = tokensCreated(s, 0, 2, PREDEFINED_TOKENS.Clue).groups;
  eq(groups.map((g) => [g.token.name, g.count, g.own === true]), [["Clue", 2, true], ["Food", 2, false], ["Treasure", 2, false]],
    "two Clues: the effect's own two, and two of each other kind");
  eq(tokensCreated(s, 0, 0, PREDEFINED_TOKENS.Clue).groups.map((g) => g.count), [0], "none made: nothing to make one of each of (CR 614.5's one or more)");
  eq(tokensCreated(s, 1, 1, PREDEFINED_TOKENS.Clue).groups.length, 1, "Maya's Clue: Rob's Manufactor is no replacement of hers");
}
{
  /* One of each applies once one of its kinds is made, not before (CR 616.1f): a Soldier, and the Treasure an adder of creature
     tokens puts beside it, then one of each of that -- the only order, and nobody is asked. */
  const s = table([at(0, "battlefield", AM, "Treasure Banner")]);
  eq(resolve(s, {effect: "createToken", count: 1, token: SOLDIER}).status, "done", "a Soldier with the Manufactor and the Banner: nobody is asked");
  eq([named(s, "Soldier").length, named(s, "Treasure").length, named(s, "Clue").length, named(s, "Food").length], [1, 1, 1, 1],
    "the Soldier, the Banner's Treasure, and a Clue and a Food for it");
  /* None made, none added to: Xorn's "one or more Treasure tokens". */
  const t = table([at(0, "battlefield", XORN)]);
  make(t, {token: {predefined: "Treasure"}, count: 0});
  eq(named(t, "Treasure").length, 0, "no Treasure made: Xorn adds none");
}
{
  /* Its each are compiled from the predefined tokens createToken makes (cards/index.mjs, predefinedIn). */
  const manufactor = index.definition(AM).abilities.find((a) => a.rule === "tokens-each");
  eq([manufactor.each.map((k) => k.name), manufactor.each[2].abilities[0].id], [["Clue", "Food", "Treasure"], "treasure"], "the Manufactor's kinds are the predefined tokens, abilities and all");
  eq(index.definition(XORN).abilities[0].token, PREDEFINED_TOKENS.Treasure, "Xorn adds the predefined Treasure");
  /* One a fixture names without compiling is refused at once, not made as a nameless creature. */
  const raw = {types: ["Enchantment"], subtypes: [], manaCost: "{G}", colors: ["G"], abilities: [{id: "r", kind: "static", text: "Raw", rule: "tokens-plus", affects: {}, token: {predefined: "Food"}}]};
  const s = runScenario({name: "raw", seats: 2, setup: [at(0, "battlefield", "Raw")], steps: []}, index.definition, {Raw: raw}).state;
  assert.throws(() => make(s, {token: SOLDIER}), /a predefined token not compiled into its definition/); checks += 1;
}
{
  /* Only the effects that apply to the event as it stands are chosen among (CR 616.1e-f): the Queen's Soldier and Divine
     Visitation's Angels end differently, as many tokens either way -- said by what each makes. */
  const s = table([at(0, "battlefield", DV, QA)]);
  eq(resolve(s, {effect: "createToken", count: 1, token: SOLDIER}).status, "waiting", "a Soldier with the Visitation and the Queen: asked");
  const q = awaitingChoice(s);
  eq([q.title, labels(s), q.options.map((o) => o.makes)], ["1 Soldier token: which applies first?",
    ["Divine Visitation first: 2 tokens (1 Angel, 1 Soldier)", "Queen Allenal of Ruadach first: 2 tokens (2 Angel)"], [2, 2]], "two tokens either way: each says which");
  answer(s, "Queen Allenal of Ruadach first: 2 tokens (2 Angel)");
  eq([named(s, "Angel").length, named(s, "Soldier").length], [2, 0], "the Queen first: her Soldier made an Angel too");
  /* A Treasure: the Visitation does not apply, the Queen does not -- nothing to ask. */
  const t = table([at(0, "battlefield", DV, QA)]);
  eq([resolve(t, {effect: "createToken", count: 1, token: {predefined: "Treasure"}}).status, named(t, "Treasure").length], ["done", 1], "a Treasure: neither applies, nobody is asked");
  /* Unasked, the most: two either way, and the first. */
  const u = table([at(0, "battlefield", DV, QA)]);
  make(u, {token: SOLDIER});
  eq(named(u, "Angel").length + named(u, "Soldier").length, 2, "unasked: two tokens");
}
{
  /* Manufactor and Xorn: 4 or 6, and the question replayed answer by answer. */
  const s = table([at(0, "battlefield", AM, XORN, AP)]);
  resolve(s, {effect: "createToken", count: 1, token: {predefined: "Treasure"}});
  eq(labels(s), ["Academy Manufactor first: 7 to 8 tokens", "Anointed Procession first: 7 to 9 tokens", "Xorn first: 12 tokens"], "three effects: where each can lead");
  answer(s, "Anointed Procession first: 7 to 9 tokens");
  eq(labels(s), ["Academy Manufactor first: 7 tokens", "Xorn first: 9 tokens"], "asked again of the two left, the Procession's doubling replayed");
  answer(s, "Academy Manufactor first: 7 tokens");
  eq([named(s, "Clue").length, named(s, "Food").length, named(s, "Treasure").length], [2, 2, 3], "two Treasures, one of each of each, then Xorn's one more: 2, 2 and 3");
  const pilot = housePilot({seat: 0, cards: index.definition});
  const p = table([at(0, "battlefield", AM, XORN, AP)]);
  resolve(p, {effect: "createToken", count: 1, token: {predefined: "Treasure"}});
  const pq = awaitingChoice(p);
  eq(pq.options[pilot.answer(projectFor(p, 0), pq).indices[0]].makes, 12, "the house pilot takes the order that makes the most");
}
{
  /* Doublers alone end the same however many: ten of them and the Queen -- 11! orders -- are answered in no time, the end of
     each point followed once. */
  const big = table([at(0, "battlefield", ...Array(10).fill("Twin"), QA)]);
  const started = Date.now();
  const asked = tokensCreated(big, 0, 1, SOLDIER, {askable: true});
  eq([asked.question?.options.length, Date.now() - started < 3000], [11, true], "eleven effects, the Queen's order among them: asked, and quickly");
  const s = table([at(0, "battlefield", ...Array(8).fill("Twin"), QA)]);
  make(s, {token: SOLDIER});
  eq([named(s, "Soldier").length], [512], "unasked, eight doublers: the Queen first, then eight doublings -- 512");
}
{
  /* Made instead only of what it describes: a Soldier and the Food Peregrin Took adds -- the Visitation makes the Soldier an
     Angel and leaves the Food, in either order, and nobody is asked. */
  const s = table([at(0, "battlefield", DV, TOOK)]);
  eq(resolve(s, {effect: "createToken", count: 1, token: SOLDIER}).status, "done", "a Soldier with the Visitation and the Took: nobody is asked");
  eq([named(s, "Angel").length, named(s, "Food").length, named(s, "Soldier").length], [1, 1, 0], "an Angel, and a Food beside it");
}
{
  /* Every token made gets what the effect says of its tokens: an Aura among them is attached, a Food added beside it is not. */
  const s = table([at(0, "battlefield", TOOK, "Bear")]);
  make(s, {token: {predefined: "Royal Role"}, attachedTo: [idOf(s, "Bear")]});
  const [role] = named(s, "Royal"), [food] = named(s, "Food");
  eq([s.objects[role].attachedTo, s.objects[food].attachedTo ?? null, s.objects[idOf(s, "Bear")].attachments], [idOf(s, "Bear"), null, [role]],
    "a Royal Role attached to the Bear, and Peregrin Took's Food beside it attached to nothing");
  /* A copy and what is added beside it: the copy a copy, the Food a Food, both as the effect makes its tokens. */
  const t = table([at(0, "battlefield", TOOK, "Bear")]);
  runEffects(t, [{effect: "copyPermanent", targets: [idOf(t, "Bear")], tapped: true, remember: true}], {controller: 0, source: null});
  eq([named(t, "Bear").length, named(t, "Food").length, named(t, "Food").every((id) => t.objects[id].tapped), named(t, "Bear").filter((id) => t.objects[id].tapped).length],
    [2, 1, true, 1], "a tapped copy of the Bear: the copy, and a tapped Food");
}

/* ---- counters: whose, by an effect, and as a permanent enters ---- */
{
  /* `players`: true is any player's, "you" its controller's; `affects: {what: "player"}` a player's alone. */
  const s = table([at(0, "battlefield", WC, LZ, "Bear")]);
  eq([playerCountersPlaced(s, 0, "poison", 1, 1), playerCountersPlaced(s, 0, "poison", 1, 0), playerCountersPlaced(s, 1, "poison", 1, 0)], [2, 3, 1],
    "Rob's counters: Maya's one is two (the Constrictor), his own three (and Lae'zel's); Maya's: one");
  eq(countersPlaced(s, idOf(s, "Bear"), "+1/+1", 1, 1), 2, "the Constrictor's player half never reaches the Bear: one plus one, not plus two");
  eq(countersPlaced(s, idOf(s, "Bear"), "+1/+1", 1, 0), 3, "Rob's own: the Constrictor and Lae'zel, plus two");
  /* Permanents and players are numbered apart: a permanent whose id is a seat's number is no player to the player half. */
  const t = createState({matchId: "ids", seed: "ids", players: [{name: "Rob"}, {name: "Maya"}]});
  const relic = addObject(t, {...structuredClone(FIX.Relic), card: "Relic", owner: 0, controller: 0}, "battlefield");
  addObject(t, {...structuredClone(index.definition(WC)), card: WC, owner: 0, controller: 0}, "battlefield");
  eq([t.players.some((p) => p.id === relic), countersPlaced(t, relic, "charge", 1, 0)], [true, 2], "the Relic, its id a seat's: the Constrictor's plus one for permanents, not its players' besides");
}
{
  /* "If an effect would put": a cost's counters are not doubled; the same counters from an effect are. */
  const s = table([at(0, "battlefield", DS, "Bear")]);
  const bear = idOf(s, "Bear");
  eq([placeCounters(s, {id: bear}, "+1/+1", 1, 0, {cost: true}).count, placeCounters(s, {id: bear}, "+1/+1", 1, 0).count, enteringCountersPlaced(s, bear, "+1/+1", 1, 0)], [1, 2, 2],
    "Doubling Season: a cost's one stays one; an effect's, or one it enters with, two");
  const t = table([at(0, "battlefield", "Hardened Scales", "Bear")]);
  eq(placeCounters(t, {id: idOf(t, "Bear")}, "+1/+1", 1, 0, {cost: true}).count, 2, "Hardened Scales says nothing of effects: a cost's counter is two");
}
{
  /* CR 614.12: entering with counters, a permanent's own effect over a set it belongs to does not apply to it -- one of
     itself alone does. Each place a permanent enters with counters. */
  const cast = (name) => runScenario({name: "cast", seats: 2, setup: [at(0, "battlefield", "Wastes"), at(0, "hand", name)],
    steps: [{tap: "Wastes"}, {cast: name}, {resolve: true}]}, index.definition, FIX).state;
  const hopeful = cast("Hopeful Hydra"), self = cast("Self Hydra");
  eq([hopeful.objects[idOf(hopeful, "Hopeful Hydra")].counters["+1/+1"], self.objects[idOf(self, "Self Hydra")].counters["+1/+1"]], [2, 3],
    "cast: the Hopeful Hydra's 'permanents you control' not yet its own (2); the Self Hydra's 'this creature' is (3)");
  const put = (setup) => {
    const s = table(setup);
    runEffect(s, {effect: "moveZone", targets: [s.zones.hand[0].find((id) => s.objects[id].card === "Hopeful Hydra")], to: "battlefield"}, {controller: 0, source: null});
    return s.objects[idOf(s, "Hopeful Hydra")].counters["+1/+1"] ?? 0;
  };
  eq([put([at(0, "hand", "Hopeful Hydra")]), put([at(0, "battlefield", KAMI), at(0, "hand", "Hopeful Hydra")])], [2, 3],
    "put onto the battlefield by an effect: its own plus one not yet (2); the Kami's beside it (3)");
  const t = table([at(0, "exile", "Bear"), at(0, "battlefield", KAMI)]);
  const exiled = t.zones.exile.find((id) => t.objects[id].card === "Bear");
  runEffect(t, {effect: "moveZone", targets: [exiled], to: "battlefield", withCounter: "+1/+1"}, {controller: 0, source: null});
  eq(t.objects[idOf(t, "Bear")].counters["+1/+1"], 2, "'an additional +1/+1 counter' as it returns, beside the Kami: two");
  const u = table([at(0, "exile", KAMI)]);
  runEffect(u, {effect: "moveZone", targets: [u.zones.exile.find((id) => u.objects[id].card === KAMI)], to: "battlefield", withCounter: "+1/+1"}, {controller: 0, source: null});
  eq(u.objects[idOf(u, KAMI)].counters["+1/+1"], 1, "the Kami itself returning so: one");
  /* A token entering with counters (incubate's, createToken's), its own static not yet applying. */
  const v = table([at(0, "battlefield", "Relic")]);
  make(v, {token: {name: "Ooze", types: ["Creature"], subtypes: ["Ooze"], colors: ["G"], power: 0, toughness: 0, abilities: [plusOne({what: "permanent", controller: "you"})]},
    entersWithCounters: {"+1/+1": 2}});
  make(v, {token: {name: "Ooze Pal", types: ["Creature"], subtypes: ["Ooze"], colors: ["G"], power: 0, toughness: 0}, entersWithCounters: {"+1/+1": 2}});
  eq([v.objects[idOf(v, "Ooze")].counters["+1/+1"], v.objects[idOf(v, "Ooze Pal")].counters["+1/+1"]], [2, 3], "a token: its own not yet (2), the next one's with it there (3)");
  /* Riot's counter, chosen as it enters. */
  const w = runScenario({name: "riot", seats: 2, setup: [at(0, "battlefield", "Wastes"), at(0, "hand", "Riot Kami")],
    steps: [{tap: "Wastes"}, {cast: "Riot Kami"}, {resolve: true}, {choose: ["Riot Kami enters with a +1/+1 counter"]}]}, index.definition, FIX).state;
  eq(w.objects[idOf(w, "Riot Kami")].counters["+1/+1"], 1, "riot's counter on a Kami-like creature: one, its own effect not yet there");
  const x = runScenario({name: "riot beside", seats: 2, setup: [at(0, "battlefield", KAMI, "Wastes"), at(0, "hand", "Riot Kami")],
    steps: [{tap: "Wastes"}, {cast: "Riot Kami"}, {resolve: true}, {choose: ["Riot Kami enters with a +1/+1 counter"]}]}, index.definition, FIX).state;
  eq(x.objects[idOf(x, "Riot Kami")].counters["+1/+1"], 2, "beside the Kami: two");
  /* Impending's time counters (CR 702.176a), and a copy's own "enters with" (CR 614.12a), beside Doubling Season. */
  const y = runScenario({name: "impending", seats: 2, setup: [at(0, "battlefield", DS, "Plains", "Plains", "Wastes", "Wastes"), at(0, "hand", "Overlord of the Mistmoors")],
    steps: [{tap: "Plains"}, {tap: "Plains"}, {tap: "Wastes"}, {tap: "Wastes"}, {cast: "Overlord of the Mistmoors", alternative: 0}, {resolve: true}, {resolve: true}]}, index.definition, FIX).state;
  eq([y.objects[idOf(y, "Overlord of the Mistmoors")].counters.time, named(y, "Insect").length], [8, 4], "cast for its impending cost: eight time counters, and four Insects");
  const z = runScenario({name: "clone", seats: 2, setup: [at(0, "battlefield", DS, "Big Hydra", "Wastes", "Wastes", "Island", "Island"), at(0, "hand", "Sakashima's Student")],
    steps: [{tap: "Wastes"}, {tap: "Wastes"}, {tap: "Island"}, {tap: "Island"}, {cast: "Sakashima's Student"}, {resolve: true}, {choose: ["Big Hydra"]}]}, index.definition, FIX).state;
  eq(named(z, "Big Hydra").map((id) => z.objects[id].counters["+1/+1"] ?? 0).sort(), [0, 4], "Sakashima's Student as a copy of the Big Hydra enters with its two counters, doubled");
}
{
  /* "Whenever YOU put": the counters event says who put them -- an effect's controller, an entering permanent's controller
     (CR 122.6a), riot's, earthbend's. */
  const s = table([at(0, "battlefield", "Keeper", "Bear", "Forest"), at(1, "battlefield", "Bear")]);
  const mine = idOf(s, "Bear");
  const triggered = (events) => { s.pendingTriggers = []; collectTriggers(s, events); return s.pendingTriggers.length; };
  const put = (controller) => runEffects(s, [{effect: "putCounter", targets: [mine], counter: "+1/+1", count: 1}], {controller, source: null});
  eq([triggered(put(1)), triggered(put(0))], [0, 1], "Maya puts a +1/+1 counter on Rob's Bear: his Keeper does not trigger; Rob puts one: it does");
  eq(put(0).at(-1).data.fields.by, 0, "the event says Rob put it");
  eq(triggered(runEffects(s, [{effect: "earthbend", targets: [idOf(s, "Forest")], count: 2}], {controller: 0, source: null})), 1,
    "earthbend's counters are its controller's putting: it triggers");
  const t = runScenario({name: "keeper", seats: 2, setup: [at(0, "battlefield", "Keeper", "Wastes", "Wastes"), at(0, "hand", "Hopeful Hydra", "Riot Kami")],
    steps: [{tap: "Wastes"}, {cast: "Hopeful Hydra"}, {resolve: true}, {resolve: true}, {expect: [{seat: 0, life: 41}]}, {tap: "Wastes"}, {cast: "Riot Kami"}, {resolve: true},
      {choose: ["Riot Kami enters with a +1/+1 counter"]}, {resolve: true}]}, index.definition, FIX).state;
  eq(t.players[0].life, 42, "a creature entering with counters is its controller's putting (one life), and riot's counter too (another)");
  /* The compiler: "you", or nobody named -- not another player yet. */
  const compiled = (putBy) => compileScript({schema: "CrankCardScript@1", identity: {name: "Odd Exemplar", oracleId: "x", types: ["Creature"], subtypes: [], manaCost: "{W}", colors: ["W"], colorIdentity: ["W"], power: 1, toughness: 1},
    oracleText: "x", source: "hand", abilities: [{kind: "triggered", text: "x", trigger: {on: "counter added", counter: "+1/+1", putBy}, effects: [{effect: "draw", count: 1}]}]});
  eq([compiled("you").problems, compiled("opponent").problems.length > 0, compiled("you").definition.abilities[0].trigger.putBy], [[], true, "you"],
    "putBy \"you\" compiles; \"opponent\" is refused");
  const nest = compileScript({schema: "CrankCardScript@1", identity: {name: "Odd Nest", oracleId: "x", types: ["Enchantment"], subtypes: [], manaCost: "{B}", colors: ["B"], colorIdentity: ["B"]},
    oracleText: "x", source: "hand", abilities: [{kind: "triggered", text: "x", trigger: {on: "counter added", who: "any", counter: "-1/-1", filter: {types: ["Creature"]}, putBy: "you"},
      effects: [{effect: "draw", count: 1}]}]});
  eq([nest.problems, nest.definition.abilities[0].trigger.putBy, nest.definition.abilities[0].trigger.who], [[], "you", "any"], "on any creature, by you: compiled with it");
}

/* ---- four players: Primal Vigor's tokens for everyone, Lae'zel's counters for Rob alone ---- */
{
  const s = table([at(0, "battlefield", "Primal Vigor", LZ), at(1, "battlefield", "Bear"), at(2, "battlefield", "Bear"), at(3, "battlefield", "Bear")], 4);
  for (const seat of [0, 1, 2, 3]) make(s, {token: {predefined: "Treasure"}}, seat);
  eq([0, 1, 2, 3].map((seat) => named(s, "Treasure", seat).length), [2, 2, 2, 2], "every player's Treasure doubled");
  eq([1, 2, 3].map((seat) => countersPlaced(s, idOf(s, "Bear", seat), "+1/+1", 1, 0)), [2, 2, 2], "Rob's counter on each opponent's Bear: doubled, not plus one");
  eq([playerCountersPlaced(s, 0, "poison", 1, 0), playerCountersPlaced(s, 2, "poison", 1, 0)], [2, 1], "on Rob himself, by Rob: plus one; on Trey: one");
}

/* ---- the schema ---- */
{
  const problems = (fields) => compileScript({schema: "CrankCardScript@1",
    identity: {name: "Odd Static", oracleId: "x", types: ["Enchantment"], subtypes: [], manaCost: "{G}", colors: ["G"], colorIdentity: ["G"]},
    oracleText: "x", source: "hand", abilities: [{kind: "static", text: "x", ...fields}]}).problems;
  const each = [{predefined: "Clue"}, {predefined: "Food"}, {predefined: "Treasure"}];
  eq([problems({rule: "tokens-each", affects: {}, each}), problems({rule: "more-counters", affects: {what: "player"}, players: "you", plus: 1}),
    problems({rule: "more-counters", affects: {what: "permanent"}, players: "you", byEffect: true, times: 2})], [[], [], []], "one of each, a player's counters alone, an effect's: compile");
  for (const [bad, words] of [[{rule: "tokens-each", affects: {}, each: [{predefined: "Clue"}]}, "two or more"], [{rule: "tokens-each", affects: {}, each: [{predefined: "Clue"}, {name: "Food", types: ["Artifact"]}]}, "two or more [{predefined}]"],
    [{rule: "tokens-each", affects: {}, each: [{predefined: "Clue"}, {predefined: "Gadget"}]}, "no predefined token named Gadget"],
    [{rule: "more-counters", affects: {what: "player"}, plus: 1}, "players says whose"], [{rule: "more-counters", affects: {what: "player", who: "you"}, players: "you", plus: 1}, "players says whose"],
    [{rule: "more-counters", affects: {what: "permanent"}, players: "opponent", plus: 1}, "players is true"], [{rule: "more-counters", affects: {what: "permanent"}, byEffect: "yes", times: 2}, "byEffect is true"],
    [{rule: "tokens-instead", affects: {types: ["Creature"]}, token: {predefined: "Food", tapped: true}}, "What is made instead is a token"]])
    ok(problems(bad).some((p) => p.includes(words)), `refused: ${JSON.stringify(bad)}`);
}

/* ---- the credits ---- */
{
  eq(Object.entries(FORGE_REPLACING_API).filter(([, mode]) => !FORGE_REPLACEMENT[mode]), [], "every replacement's instead listed is one whose replacement is credited");
  eq([FORGE_TRIGGER.CounterAddedOnce, missingFor({apis: ["ReplaceCounter"], replacements: ["AddCounter"], triggers: ["CounterAddedOnce"]})], ["counter added", []],
    "CounterAddedOnce is the engine's counter added, ReplaceCounter AddCounter's instead: built");
  eq(missingFor({apis: ["ReplaceToken"], replacements: ["CreateToken"]}).map((m) => m.name), ["ReplaceToken", "CreateToken"],
    "ReplaceToken is not credited: Chatterfang's that many, Ojer Taq's creature tokens tripled, Jinnie Fay's choice of two are not built");
  const MINE = ["Doubling Season", AM, KAMI, "Parallel Lives", "Mondrak, Glory Dominus", "Ozolith, the Shattered Spire", XORN, "Elspeth, Storm Slayer", TOOK,
    "Evolution Witness", "Exemplar of Light", "Adrix and Nev, Twincasters", "Corpsejack Menace", "Exalted Sunborn", "Primal Vigor", "Stridehangar Automaton", LZ, WC, DV];
  eq(MINE.filter((name) => !tableCards(name)), [], "the table can play all nineteen");
  /* And their scenarios, with those of the cards whose replacements they extend -- tests/engine-cards.mjs plays every card's;
     here, the lane's alone, so a break of what they read is caught in seconds (game/tools/batch/breaks-wave4a-h4.py). */
  const LANE = new Set([...MINE, QA, AP, "Draconic Visitor", "Hardened Scales", "Branching Evolution", "Vorinclex, Monstrous Raider"]);
  const files = loadCardScenarios().filter(({scenarios: file}) => LANE.has(file.card));
  eq(files.length, LANE.size, "a scenario file for each");
  for (const {scenarios: file} of files) for (const scenario of file.scenarios) { runScenario(scenario, index.definition, file.fixtures ?? {}); checks += 1; }
}

console.log(`engine-tokens-counters-4a: ${checks} checks passed -- the token event in groups, one of each, the order among what applies as it stands, every token as the effect makes it; counters on yourself, by an effect, not by a permanent's own as it enters; whenever you put; four seats; the schema; the credits; the table.`);
