/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* WAVE 4C, LANE K4: SPELLS, DRAWS AND DISCARDS.
 *
 * The lane's twenty cards play through their scenarios (here first, so a break is found fast, and again in
 * tests/engine-cards.mjs). Beside them, what the scenarios cannot reach, each against the rule it follows:
 *   - affinity (CR 702.41a; Thought Monitor): the keyword as the spell's own cost reduction, and what it may say;
 *   - "if you casting or copying an instant or sorcery spell causes a triggered ability ... to trigger" (Veyran, Voice of
 *     Duality; CR 603.2d): the cause a `triggers-again` may name;
 *   - draws replaced (CR 614.11): "you win the game instead" from an empty library (Laboratory Maniac), and "draw two cards
 *     instead" except the first of the draw step (Teferi's Ageless Insight) -- each instance once to a draw and the draws it
 *     became (CR 614.5), and a draw that can't be made no event to replace (Narset, Parter of Veils; CR 101.2, 121.2b);
 *   - mana of one of some colors as a spell resolves (Culling Ritual), and what may be said of it;
 *   - a hand looked at (Gitaxian Probe; CR 701.20e): to its looker alone, hand by hand in turn order, an empty hand or the
 *     looker's own never asked, a looker who leaves, a spectator, and what is refused;
 *   - "each player who can't" after a sacrifice that must be made (Plaguecrafter): nobody able at all;
 *   - "pay 5 life or pay {2}" (Redirect Lightning; CR 119.4, 601.2b): the life beside the rest of the cost, and an offer
 *     changed to skip it refused;
 *   - "that creature's power" of a creature an effect sacrificed, as it last existed (Disciple of Freyalise; CR 608.2h).
 */
import assert from "node:assert/strict";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex, loadCardScenarios} from "../game/tools/engine-cards.mjs";
import {tableCards} from "../cloud/game-room.mjs";
import {compileScript} from "../game/engine/cards/index.mjs";
import {validateScript} from "../game/engine/script/schema.mjs";
import {beginResolution} from "../game/engine/script/resolution.mjs";
import {awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {legalActions, applyAction} from "../game/engine/rules/actions.mjs";
import {concede} from "../game/engine/rules/sba.mjs";
import {costReduction, drawsMore, emptyDrawWins} from "../game/engine/rules/statics.mjs";
import {ASKING} from "../game/engine/script/effects/asking.mjs";
import {runEffects} from "../game/engine/script/effects/index.mjs";
import {projectFor} from "../game/engine/projection.mjs";
import {cardsIn} from "../game/engine/state/index.mjs";
import {isKeyword} from "../game/engine/vocabulary.mjs";
import {missingFor} from "../game/tools/engine-constructs.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };
const throws = (f, pattern, m) => { assert.throws(f, pattern, m); checks += 1; };

const index = loadCardIndex();
const LANE = ["Eiganjo, Seat of the Empire", "Ruinous Ultimatum", "Nature's Claim", "Harmonic Prodigy", "Blind Obedience", "Culling Ritual", "Gitaxian Probe",
  "Plaguecrafter", "Corrupted Conviction", "Disciple of Freyalise // Garden of Freyalise", "Veyran, Voice of Duality", "Tamiyo's Safekeeping", "Redirect Lightning",
  "Goreclaw, Terror of Qal Sisma", "Scrawling Crawler", "Open the Armory", "Thought Monitor", "Hedron Archive", "Laboratory Maniac", "Teferi's Ageless Insight"];

/* ---- the lane's cards: playable at a table, and every scenario of theirs ---- */
for (const name of LANE) ok(tableCards(name) !== null, `${name} plays at a table`);
{
  let runs = 0;
  for (const {scenarios: file} of loadCardScenarios()) {
    if (!LANE.includes(file.card)) continue;
    for (const scenario of file.scenarios) { runScenario(scenario, index.definition, file.fixtures ?? {}); runs += 1; }
  }
  ok(runs >= 70, `the lane's ${runs} scenarios each pass`);
}

const creature = (cost, subtypes, colors, p, t, more = {}) => ({types: ["Creature"], subtypes, manaCost: cost, colors, power: p, toughness: t, ...more});
const spell = (types, cost, colors, text, effects, targets = [], more = {}) => ({types, manaCost: cost, colors, spell: {id: "s", text, targets, effects, ...more}});
const FIX = {
  Bear: creature("{1}{G}", ["Bear"], ["G"], 2, 2),
  Relic: {types: ["Artifact"], manaCost: "{1}", colors: []},
  /* A "draw two instead" that is no legend, for two of them under one player (CR 614.5). */
  Scholar: {...creature("{1}", ["Human"], ["U"], 1, 1), abilities: [{id: "d", kind: "static", text: "If you would draw a card, draw two cards instead.", rule: "draws-more",
    affects: {what: "player", who: "you"}, count: 2}]},
  /* "Pay 2 life or pay {1}", and a gain if it was paid (CR 601.2b). */
  Toll: spell(["Sorcery"], "{0}", ["W"], "As an additional cost to cast this spell, pay 2 life or pay {1}. If its additional cost was paid, you gain 1 life.",
    [{effect: "gainLife", amount: 1, condition: {cast: {additionalPaid: true}}}], [], {additionalCost: [{atom: "oneOf", options: [[{atom: "payLife", amount: 2}], [{atom: "mana", cost: "{1}"}]]}]}),
  /* Two Phyrexian symbols, and "pay 5 life or pay {2}" besides. */
  Rage: spell(["Sorcery"], "{R/P}{R/P}", ["R"], "As an additional cost to cast this spell, pay 5 life or pay {2}. You gain 1 life.",
    [{effect: "gainLife", amount: 1}], [], {additionalCost: [{atom: "oneOf", options: [[{atom: "payLife", amount: 5}], [{atom: "mana", cost: "{2}"}]]}]}),
};
const at = (seat, zone, ...cards) => ({seat, zone, cards});
const table = (setup, {seats = 2, steps = [], at: when} = {}) => runScenario({name: "4c-k4", setup, steps, seats, ...(when ? {at: when} : {})}, index.definition, FIX).state;
const hands = (s) => s.players.map((p) => cardsIn(s, "hand", p.id).length);
const run = (s, effects, controller = 0) => beginResolution(s, effects, {controller, source: null});
const shown = (s, viewer, owner) => projectFor(s, viewer).players[owner].zones.Hand.cards.map((c) => c.name).sort();
const compiled = (abilities, identity = {}) => compileScript({schema: "CrankCardScript@1", identity: {name: "Probe", oracleId: "probe", types: ["Creature"], subtypes: [],
  manaCost: "{1}", colors: [], power: 1, toughness: 1, ...identity}, oracleText: abilities.map((a) => a.text).join("\n"), source: "hand", abilities});
const problems = (abilities, identity) => compiled(abilities, identity).problems.join("; ");

/* ---- affinity (CR 702.41a) ---- */
{
  ok(isKeyword("affinity"), "affinity is a keyword a script may say");
  const {definition} = compiled([{kind: "keyword", text: "Affinity for artifacts", keyword: "affinity", of: {types: ["Artifact"]}}]);
  const [ability] = definition.abilities;
  eq([ability.kind, ability.rule, ability.affects, ability.amount], ["static", "this-costs-less", {self: true}, {count: {types: ["Artifact"], what: "permanent", controller: "you"}}],
    "the keyword is the spell's own reduction: {1} less for each artifact its caster controls");
  ok(definition.keywords.includes("Affinity"), "and the card has the keyword");
  ok(/affinity says what it counts/.test(problems([{kind: "keyword", text: "Affinity", keyword: "affinity"}])), "affinity for nothing said is refused");
  ok(/affinity says what it counts/.test(problems([{kind: "keyword", text: "Affinity for artifacts", keyword: "affinity", of: {types: ["Artifact"], controller: "opponent"}}])),
    "and one that says whose: they are always its caster's");
  ok(/no key/.test(problems([{kind: "keyword", text: "Affinity for artifacts", keyword: "affinity", of: {kind: ["Artifact"]}}])), "and a selector the grammar does not know");
  const s = table([at(0, "battlefield", "Relic", "Relic", "Relic", "Bear"), at(1, "battlefield", "Relic"), at(0, "hand", "Thought Monitor")]);
  const monitor = cardsIn(s, "hand", 0).find((id) => s.objects[id].card === "Thought Monitor");
  eq(costReduction(s, 0, monitor), 3, "Thought Monitor in Rob's hand: three of his artifacts, {3} less; Maya's Relic and his Bear nothing");
}

/* ---- "if you casting or copying an instant or sorcery spell causes ..." (CR 603.2d) ---- */
{
  const veyran = (cause) => validateScript({schema: "CrankCardScript@1", identity: {name: "Probe", oracleId: "probe", types: ["Creature"], subtypes: [], manaCost: "{1}", colors: [], power: 1, toughness: 1},
    oracleText: "x", source: "hand", abilities: [{kind: "static", text: "x", rule: "triggers-again", affects: {what: "permanent", controller: "you"}, cause}]});
  ok(veyran({event: "cast or copy", filter: {anyOf: [{types: ["Instant"]}, {types: ["Sorcery"]}]}}).valid, "a cast or a copy may cause a trigger to trigger again");
  ok(!veyran({event: "cast"}).valid, "and no event the engine does not read");
}

/* ---- draws replaced (CR 614.11) ---- */
{
  /* Laboratory Maniac: only its controller's draws, only from an empty library. */
  const s = table([at(0, "battlefield", "Laboratory Maniac")]);
  eq([emptyDrawWins(s, 0), emptyDrawWins(s, 1)], [true, false], "Rob's Maniac replaces his draws, never Maya's");
  s.zones.library[1].length = 0;
  runEffects(s, [{effect: "draw", who: [1], count: 1}], {controller: 1, source: null});
  eq([s.players[1].drewFromEmpty === true, s.players[0].won === true], [true, false], "Maya drawing from an empty library is marked to lose, and Rob wins nothing for it");
  const t = table([at(0, "battlefield", "Laboratory Maniac")]);
  runEffects(t, [{effect: "draw", who: [0], count: 2}], {controller: 0, source: null});
  eq([hands(t)[0], t.players[0].won === true], [2, false], "from a library with cards, Rob simply draws");
}
{
  /* "Except the first one you draw in each of your draw steps": counted in that player's own draw step only. */
  const s = table([at(0, "battlefield", "Teferi's Ageless Insight")], {at: {turn: 3, phase: "UPKEEP"}});
  eq(drawsMore(s, 0).length, 1, "in Rob's upkeep a draw is replaced");
  eq(drawsMore(s, 1).length, 0, "Maya's never: it is Rob's");
  const d = table([at(0, "battlefield", "Teferi's Ageless Insight", "Scholar")], {at: {turn: 3, phase: "DRAW"}});
  eq(drawsMore(d, 0).length, 2, "in his draw step, once its card is drawn, the Insight replaces the next; the Scholar, with no exception, too");
  d.players[0].drawStepDraws = {turn: d.turn, count: 0};
  eq(drawsMore(d, 0).length, 1, "and the step's first card: the Scholar alone");
  d.players[0].drawStepDraws = {turn: d.turn - 2, count: 3};
  eq(drawsMore(d, 0).length, 1, "a count from another turn is not this step's: still its first");
}
{
  /* Two "draw two instead" of one player's: each applies once to the draw and to the draws it became -- four (CR 614.5). */
  const s = table([at(0, "battlefield", "Scholar", "Scholar")]);
  runEffects(s, [{effect: "draw", who: [0], count: 1}], {controller: 0, source: null});
  eq(hands(s)[0], 4, "two Scholars: one card is four");
  const t = table([at(0, "battlefield", "Scholar"), at(1, "battlefield", "Scholar")]);
  runEffects(t, [{effect: "draw", who: [0], count: 1}], {controller: 0, source: null});
  eq(hands(t)[0], 2, "Maya's Scholar is for her draws: Rob's card is two");
}
{
  /* Narset, Parter of Veils: Maya's, and Rob is her opponent. The first of the two his card became is drawn, the second can't
     be -- and a draw that can't be made is nothing to replace (CR 101.2, 121.2b). */
  const s = table([at(0, "battlefield", "Teferi's Ageless Insight"), at(1, "battlefield", "Narset, Parter of Veils")]);
  runEffects(s, [{effect: "draw", who: [0], count: 1}], {controller: 0, source: null});
  eq(hands(s)[0], 1, "under Narset, Rob's one card replaced by two is one");
}
{
  const draws = (more) => validateScript({schema: "CrankCardScript@1", identity: {name: "Probe", oracleId: "probe", types: ["Enchantment"], subtypes: [], manaCost: "{1}", colors: [], power: null, toughness: null},
    oracleText: "x", source: "hand", abilities: [{kind: "static", text: "x", rule: "draws-more", affects: {what: "player", who: "you"}, ...more}]});
  ok(draws({count: 2, exceptFirstInDrawStep: true}).valid, "draw two instead, but the draw step's first");
  ok(!draws({count: 1}).valid, "one card for one is no replacement");
  ok(!draws({}).valid, "and how many is said");
  ok(!draws({count: 2, exceptFirstInDrawStep: false}).valid, "exceptFirstInDrawStep is true or unsaid");
}

/* ---- mana of one of some colors as a spell resolves (Culling Ritual) ---- */
{
  const said = (effect) => problems([{kind: "spell", text: "Add mana.", targets: [], effects: [{effect: "addMana", ...effect}]}], {types: ["Sorcery"], power: null, toughness: null});
  eq(said({colors: ["B", "G"], count: 2}), "", "{B} or {G}, twice");
  ok(/colors is two or more/.test(said({colors: ["B"]})), "one color is no choice: say it as mana");
  ok(/colors is two or more/.test(said({colors: ["B", "B"]})), "each color once");
  ok(/colors is two or more/.test(said({colors: ["B", "P"]})), "only the five colors");
  ok(/colors is two or more/.test(said({colors: ["B", "G"], anyColor: true})), "never beside any color");
  const s = table([]);
  run(s, [{effect: "addMana", colors: ["W", "U", "R"], count: 2}]);
  const q = awaitingChoice(s);
  eq([q.options.map((o) => o.label), /white, blue or red/.test(q.title)], [["White", "Blue", "Red"], true], "the colors it names, and no others, each mana in turn");
  resolveAwaiting(s, [2]);
  resolveAwaiting(s, [0]);
  eq([s.players[0].manaPool.R, s.players[0].manaPool.W, s.awaiting], [1, 1, null], "one red and one white, as Rob chose them");
  throws(() => { const t = table([]); run(t, [{effect: "addMana", colors: ["W", "U"], count: 1}]); resolveAwaiting(t, [3]); }, /Choose one color/, "a color it does not offer is refused");
}

/* ---- a hand looked at (CR 701.20e) ---- */
{
  ok(["open", "choice", "apply", "left"].every((k) => typeof ASKING.handLook[k] === "function"), "handLook has every part an asking primitive has");
  const s = table([at(1, "hand", "Bear", "Relic"), at(2, "hand", "Bear"), at(3, "hand", "Relic")], {seats: 4});
  eq(run(s, [{effect: "peekAndReveal", zone: "hand", who: "opponent"}, {effect: "gainLife", amount: 1}]).status, "waiting", "Rob looks at each opponent's hand");
  const q = awaitingChoice(s);
  eq([s.awaiting.player, q.mode, q.min, q.max, q.options.map((o) => o.label).sort()], [0, "ack", 0, 0, ["Bear", "Relic"]], "Maya's first: an acknowledgment, her cards its options");
  eq([shown(s, 0, 1), shown(s, 2, 1), shown(s, 3, 1)], [["Bear", "Relic"], [], []], "Rob sees her hand; Trey and Sam do not");
  eq(projectFor(s, null).players[1].zones.Hand.cards, [], "nor does a spectator");
  throws(() => resolveAwaiting(s, [0]), /say you have seen it/, "nothing is chosen from it");
  resolveAwaiting(s, []);
  eq([s.awaiting.player, shown(s, 0, 2), shown(s, 0, 1)], [0, ["Bear"], []], "then Trey's, in turn order -- and Maya's no longer shown");
  resolveAwaiting(s, []);
  eq(shown(s, 0, 3), ["Relic"], "then Sam's");
  resolveAwaiting(s, []);
  eq([s.awaiting, s.players[0].life, hands(s)], [null, 41, [1, 2, 1, 1]], "the resolution goes on; every hand where it was (Rob drew his first turn's card, CR 103.8a)");
}
{
  const s = table([at(0, "hand", "Bear"), at(2, "hand", "Bear")], {seats: 3});
  run(s, [{effect: "peekAndReveal", zone: "hand", who: "each"}]);
  eq([s.awaiting?.player, s.awaiting?.from], [0, 2], "each player's: Rob's own, already his to see, and Maya's empty hand are not asked about; Trey's is");
  resolveAwaiting(s, []);
  eq(s.awaiting, null, "and that is all");
}
{
  /* In turn order from the active player (CR 101.4): on Trey's turn, Rob looks at Trey's hand first, then Maya's. */
  const s = table([at(1, "hand", "Bear"), at(2, "hand", "Relic")], {seats: 3, at: {turn: 3, phase: "MAIN1"}});
  run(s, [{effect: "peekAndReveal", zone: "hand", who: "opponent"}]);
  eq(s.awaiting.from, 2, "Trey's, the active player's, first");
  resolveAwaiting(s, []);
  eq(s.awaiting.from, 1, "then Maya's");
}
{
  /* Trey concedes while Rob looks at Maya's hand: his is not looked at after (CR 800.4a). */
  const s = table([at(1, "hand", "Bear"), at(2, "hand", "Relic")], {seats: 3});
  run(s, [{effect: "peekAndReveal", zone: "hand", who: "opponent"}, {effect: "gainLife", amount: 1}]);
  concede(s, 2);
  eq(s.awaiting?.from, 1, "Rob still looks at Maya's");
  resolveAwaiting(s, []);
  eq([s.awaiting, s.players[0].life], [null, 41], "and Trey's, gone with him, is not asked about");
}
{
  /* Another question that names cards shows them to nobody but its own player's view of their own: a discard's. */
  const s = table([at(1, "hand", "Bear", "Relic")]);
  run(s, [{effect: "discard", who: [1], count: 1}], 0);
  eq([s.awaiting.player, shown(s, 0, 1)], [1, []], "Maya chooses a discard; Rob sees none of her cards");
}
{
  /* The looker concedes while looking (CR 800.4a): the spell left with them, and nobody looks. */
  const s = table([at(1, "hand", "Bear"), at(2, "hand", "Relic")], {seats: 3});
  run(s, [{effect: "peekAndReveal", zone: "hand", who: "opponent"}]);
  concede(s, 0);
  eq([s.awaiting, shown(s, 1, 2)], [null, []], "nothing is asked of anyone, and nobody is shown Trey's hand");
}
{
  throws(() => runEffects(table([at(1, "hand", "Bear")]), [{effect: "peekAndReveal", zone: "hand", who: "opponent"}], {controller: 0, source: null}),
    /not run on its own/, "a look at a hand run outside a resolution is refused, never read as a library's top");
  const said = (effect) => problems([{kind: "spell", text: "Look.", targets: [], effects: [{effect: "peekAndReveal", ...effect}]}], {types: ["Sorcery"], power: null, toughness: null});
  eq(said({zone: "hand", who: "opponent"}), "", "a look at each opponent's hand");
  ok(/zone is "hand"/.test(said({zone: "graveyard"})), "a hand, or a library's top: no other zone");
  ok(/zone is "hand"/.test(said({zone: "hand", reveal: true})), "a hand revealed to all is not this");
  ok(/zone is "hand"/.test(said({zone: "hand", count: 2})), "and a look at a hand is the whole of it");
}

/* ---- the catalog's credits (game/tools/engine-constructs.mjs) ---- */
{
  eq([missingFor({apis: ["RevealHand", "Draw"]}), missingFor({apis: ["Draw"], triggers: ["ChangesZone"], keywords: ["Flying", "Affinity"]})], [[], []],
    "Gitaxian Probe's and Thought Monitor's constructs are built: a hand looked at, affinity");
  eq(missingFor({replacements: ["Draw"]}).map((m) => m.name), ["Draw"], "and a draw replaced is not credited: Notion Thief, Abundance and Underrealm Lich's forms are not built");
}

/* ---- "each player who can't" (Plaguecrafter) ---- */
{
  const s = table([at(0, "hand", "Bear"), at(1, "hand", "Relic"), at(0, "battlefield", "Relic")]);
  run(s, [{effect: "sacrifice", who: "each", count: 1, selector: {anyOf: [{types: ["Creature"]}, {types: ["Planeswalker"]}]}, ifNot: [{effect: "discard", who: "that player", count: 1}]}]);
  eq([s.awaiting.player, awaitingChoice(s).options.map((o) => o.label)], [0, ["Bear"]], "nobody has a creature or planeswalker: each discards, Rob first");
  resolveAwaiting(s, [0]);
  resolveAwaiting(s, [0]);
  eq([hands(s), cardsIn(s, "graveyard", 0).length, cardsIn(s, "graveyard", 1).length], [[0, 0], 1, 1], "Rob's Bear and Maya's Relic discarded");
  const said = (effect) => validateScript({schema: "CrankCardScript@1", identity: {name: "Probe", oracleId: "probe", types: ["Sorcery"], subtypes: [], manaCost: "{1}", colors: [], power: null, toughness: null},
    oracleText: "x", source: "hand", abilities: [{kind: "spell", text: "x", targets: [], effects: [{effect: "sacrifice", who: "each", count: 1, ...effect}]}]}).valid;
  eq([said({ifNot: [{effect: "discard", who: "that player", count: 1}]}), said({ifNot: []}), said({keep: 1, ifNot: [{effect: "discard", who: "that player", count: 1}]})],
    [true, false, false], "what follows is a list of effects, and never beside keeping");
}

/* ---- "pay 5 life or pay {2}" (CR 119.4, 601.2b) ---- */
{
  const s = table([at(0, "hand", "Toll")]);
  const offers = legalActions(s, 0).filter((a) => a.kind === "cast" && a.label === "Toll");
  eq(offers.map((a) => [a.extraLife ?? 0, a.extraMana ?? ""]), [[2, ""]], "with no mana, the life alone: 2");
  const forged = {...offers[0]};
  delete forged.extraLife;
  throws(() => applyAction(s, 0, forged), /not a legal action/, "the same cast without its life is no offer, and refused");
  applyAction(s, 0, offers[0]);
  eq(s.players[0].life, 38, "the 2 life paid as it is cast");
  const t = table([at(0, "hand", "Toll")], {steps: [{cast: "Toll"}, {resolve: true}]});
  eq(t.players[0].life, 39, "its additional cost was paid: the 1 life gained back (CR 601.2b)");
  const u = table([at(0, "hand", "Toll")]);
  u.players[0].life = 1;
  eq(legalActions(u, 0).filter((a) => a.kind === "cast" && a.label === "Toll").length, 0, "at 1 life, and no mana, it can't be cast (CR 119.4)");
  const said = (life) => problems([{kind: "spell", text: "x", additionalCost: [{atom: "oneOf", options: [[{atom: "payLife", amount: life}], [{atom: "mana", cost: "{2}"}]]}], targets: [],
    effects: [{effect: "draw", count: 1}]}], {types: ["Sorcery"], power: null, toughness: null});
  eq(said(5), "", "pay 5 life or pay {2}");
  ok([said(0), said("X")].every((p) => /a whole number, 1 or more/.test(p)), "a choice's life is a whole number, 1 or more");
}
{
  /* Rage: {R/P}{R/P} and 5 life -- the Phyrexian symbols paid from what the 5 leaves (CR 107.4f, 119.4). */
  const s = table([at(0, "battlefield", "Mountain", "Mountain"), at(0, "hand", "Rage")], {steps: [{tap: "Mountain"}, {tap: "Mountain"}]});
  s.players[0].life = 8;
  const offers = legalActions(s, 0).filter((a) => a.kind === "cast" && a.label === "Rage" && a.extraLife === 5);
  eq(offers.length, 1, "at 8 life, the 5 life paid leaves 3: offered");
  applyAction(s, 0, offers[0]);
  const q = awaitingChoice(s);
  eq(q.options.map((o) => o.label).sort(), ["{R} and 2 life", "{R}{R}"], "which pays the {R/P}{R/P}: never 4 life of the 3 the 5 leaves");
  const t = table([at(0, "hand", "Rage")]);
  t.players[0].life = 8;
  eq(legalActions(t, 0).filter((a) => a.kind === "cast" && a.label === "Rage").length, 0, "with no mana, 5 and 4 more is more than 8: not offered");
}

/* ---- "that creature's power", sacrificed by an effect (CR 608.2h) ---- */
{
  const s = table([at(0, "battlefield", "Bear")]);
  const bear = s.zones.battlefield.find((id) => s.objects[id].card === "Bear");
  s.objects[bear].counters = {"+1/+1": 3};
  run(s, [{effect: "sacrifice", who: "you", count: 1, selector: {types: ["Creature"]}, remember: true}, {effect: "gainLife", amount: {powerOf: "remembered"}}]);
  resolveAwaiting(s, [0]);
  eq(s.players[0].life, 45, "a Bear with three +1/+1 counters, sacrificed: 5, as it last was");
  const t = table([]);
  run(t, [{effect: "gainLife", amount: {powerOf: "remembered"}}]);
  eq(t.players[0].life, 40, "nothing remembered: nothing");
  /* Moved before, remembered after: a creature destroyed, then two library cards looked at -- "that card" the first of those,
     its printed power (Sapling of Colfenor's read), never the creature's. */
  const u = runScenario({name: "4c-k4 moved", setup: [at(0, "battlefield", "Bear")], library: ["Ogre", "Ogre"], steps: []}, index.definition,
    {...FIX, Ogre: creature("{2}{R}", ["Ogre"], ["R"], 3, 3)}).state;
  const grown = u.zones.battlefield.find((id) => u.objects[id].card === "Bear");
  u.objects[grown].counters = {"+1/+1": 3};
  run(u, [{effect: "destroyAll", selector: {what: "permanent", types: ["Creature"]}, remember: true}, {effect: "peekAndReveal", count: 2, remember: true},
    {effect: "gainLife", amount: {powerOf: "remembered"}}]);
  eq(u.players[0].life, 43, "the Ogre's 3, not the destroyed Bear's 5");
  /* Nothing moved and nothing remembered: read as before, the source as it last was. */
  const w = table([]);
  beginResolution(w, [{effect: "gainLife", amount: {powerOf: "remembered"}}], {controller: 0, source: null, lastKnown: {power: 2}});
  eq(w.players[0].life, 42, "nothing remembered or moved: the source's last power, as before");
}

console.log(`engine-spells-draws-4c: ${checks} checks passed -- the lane's twenty cards, affinity, a cast or copy doubling a trigger, draws replaced, a mana choice of colors, a hand looked at, "each player who can't", life as an additional cost, and a sacrificed creature's last power.`);
