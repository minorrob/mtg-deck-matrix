/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* WHAT HAPPENED THIS TURN, AND THIS GAME, AS AMOUNTS AND CONDITIONS (Train C, phase 2: the area p2-records).
 *
 * The records the game keeps, each where the event happens, and the amounts (script/amount.mjs) that read them -- what the
 * cards' scenarios cannot reach: three and four players, every way into the record, its reset, its refusals, a checkpoint.
 *   - A creature died (CR 700.4), for the player who controlled it as it last existed there (state/index.mjs, recordDeath;
 *     effects/zones.mjs and the three ways rules/sba.mjs puts one there): creaturesDiedThisTurn, "you" or "any".
 *   - Cards drawn this turn (CR 121.2; the draw step's and an effect's): cardsDrawnThisTurn.
 *   - Noncombat damage dealt to a player this turn (effects/resources.mjs): playersDealtNoncombatDamage, as the combat count.
 *   - Scried or surveilled this turn (CR 701.22a, 701.25a; effects/asking.mjs): scriedOrSurveilledThisTurn.
 *   - The life every opponent lost this turn: lifeLostThisTurn "opponents" -- and spectacle (CR 702.137a), the alternative
 *     cost it unlocks (cards/index.mjs).
 *   - The spells cast this turn, read as the amount is (CR 608.2h): spellsCastThisTurn, with a filter; and this game, by
 *     name (rules/actions.mjs): spellsCastThisGame.
 *   - A graveyard card put there from the battlefield this turn (state/index.mjs): the selector's fromBattlefieldThisTurn.
 *   - A permanent that has dealt damage, or combat damage (CR 510.2), as this object (CR 400.7): hasDealtDamage and
 *     hasDealtCombatDamage, in the selector grammar and the layers' matcher.
 * Each survives a checkpoint and reads back (game/engine/storage.mjs); each construct's credit is checked.
 */
import assert from "node:assert/strict";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {compileScript} from "../game/engine/cards/index.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";
import {advance, awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {concede, checkStateBasedActions} from "../game/engine/rules/sba.mjs";
import {legalActions, applyAction, castNow, castChoicesNow} from "../game/engine/rules/actions.mjs";
import {costReduction} from "../game/engine/rules/statics.mjs";
import {characteristicsOf} from "../game/engine/rules/layers.mjs";
import {runEffects} from "../game/engine/script/effects/index.mjs";
import {moveOne, sacrificeOne} from "../game/engine/script/effects/zones.mjs";
import {beginResolution} from "../game/engine/script/resolution.mjs";
import {amountOf, amountProblems} from "../game/engine/script/amount.mjs";
import {conditionHolds} from "../game/engine/script/condition.mjs";
import {selectMatching, compileSelector} from "../game/engine/script/filter.mjs";
import {addObject} from "../game/engine/state/index.mjs";
import {createJournal} from "../game/engine/journal.mjs";
import {memoryStorage, createMatchStore} from "../game/engine/storage.mjs";
import {createRng} from "../game/engine/rng.mjs";
import {housePilot} from "../game/engine/pilots/house-pilot.mjs";
import {projectFor} from "../game/engine/projection.mjs";
import {FORGE_COUNTS, keywordBuilt} from "../game/tools/engine-constructs.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const rng = createRng("history-records");
const spellOf = (types, cost, colors, text, effects, targets = []) => ({types, manaCost: cost, colors, spell: {id: "s0", text, targets, effects}});
const ANY = {anyOf: [{what: "permanent", types: ["Creature"]}, {what: "player"}]};
const FIX = {
  Bear: {types: ["Creature"], subtypes: ["Bear"], manaCost: "{1}{G}", colors: ["G"], power: 2, toughness: 2},
  Elk: {types: ["Creature"], subtypes: ["Elk"], manaCost: "{2}{G}", colors: ["G"], power: 3, toughness: 3},
  Rock: {types: ["Artifact"], manaCost: "{1}", colors: []},
  Blight: {types: ["Creature"], subtypes: ["Horror"], manaCost: "{B}", colors: ["B"], power: 1, toughness: 1, keywords: ["Infect"]},
  Spark: spellOf(["Instant"], "{R}", ["R"], "Spark deals 1 damage to any target.", [{effect: "dealDamage", amount: 1, targets: {target: 0}, who: {target: 0}}], [ANY]),
  Peek: spellOf(["Instant"], "{U}", ["U"], "Scry 1.", [{effect: "scry", count: 1}]),
  Glimpse: spellOf(["Instant"], "{U}", ["U"], "Surveil 1.", [{effect: "surveil", count: 1}]),
  Drain: spellOf(["Sorcery"], "{B}", ["B"], "Each opponent loses 1 life.", [{effect: "loseLife", amount: 1, who: "opponent"}]),
};
const at = (seat, zone, ...cards) => ({seat, zone, cards});
const table = (setup, seats = 4, steps = [], library = []) => runScenario({name: "history-records", seats, library, setup, steps}, index.definition, FIX).state;
const idOf = (s, card, seat = 0, zone = "battlefield") => (zone === "battlefield" ? s.zones.battlefield : zone === "exile" ? s.zones.exile : s.zones[zone][seat])
  .find((id) => s.objects[id].card === card && (zone !== "battlefield" || s.objects[id].controller === seat));
const amount = (s, value, seat, more = {}) => amountOf(s, value, {controller: seat, ...more});
const seats = (s, value) => s.players.map((p) => amount(s, value, p.id));
/* On, as the room plays: questions answered with their least, triggers in the order offered, until `done` says stop. */
function playUntil(s, done, limit = 3000) {
  for (let n = 0; n < limit; n += 1) {
    if (done(s)) return;
    if (s.awaiting) {
      const choice = awaitingChoice(s);
      resolveAwaiting(s, s.awaiting.kind === "order-triggers" ? choice.options.map((o) => o.index) : choice.options.slice(0, choice.min ?? 0).map((o) => o.index));
    } else if (s.priorityPlayer === null) advance(s);
    else if (passPriority(s, null, rng).outcome === "step-ends") advance(s);
  }
  throw new Error("never got there");
}
const nextTurn = (s) => { const turn = s.turn; playUntil(s, (x) => x.turn === turn + 1 && x.phase === "MAIN1" && x.priorityPlayer !== null && !x.awaiting); };
const resolveStack = (s) => playUntil(s, (x) => !x.stack.length && !x.awaiting);

/* ---------------------------------------------------------------------------------------------------------------------
 * MORBID: a creature put into a graveyard from the battlefield died (CR 700.4) -- counted for whoever controlled it there.
 * ------------------------------------------------------------------------------------------------------------------- */
{
  const s = table([at(0, "battlefield", "Bear", "Rock"), at(1, "battlefield", "Bear", "Elk"), at(2, "battlefield", "Elk"), at(3, "battlefield", "Wastes", "Bear")]);
  const died = (value = "you") => seats(s, {creaturesDiedThisTurn: value});
  eq(died(), [0, 0, 0, 0], "four players: nothing has died");
  runEffects(s, [{effect: "destroy", targets: [idOf(s, "Bear", 0)]}], {controller: 1, source: null});
  eq(died(), [1, 0, 0, 0], "Rob's Bear destroyed by Maya's effect: it died under Rob's control");
  runEffects(s, [{effect: "dealDamage", amount: 2, targets: [idOf(s, "Bear", 1)]}], {controller: 0, source: null});
  eq(died(), [1, 0, 0, 0], "lethal damage marked: not dead until the state-based actions");
  checkStateBasedActions(s);
  eq(died(), [1, 1, 0, 0], "then destroyed by them (CR 704.5g): Maya's");
  runEffects(s, [{effect: "gainControl", targets: [idOf(s, "Elk", 2)], until: "end-of-turn"}], {controller: 0, source: null});
  sacrificeOne(s, idOf(s, "Elk", 0), []);
  eq(died(), [2, 1, 0, 0], "Trey's Elk, stolen by Rob and sacrificed: it died under Rob's control, as it last existed (CR 603.10a)");
  runEffects(s, [{effect: "destroy", targets: [idOf(s, "Rock", 0)]}], {controller: 1, source: null});
  eq(died()[0], 2, "an artifact put into the graveyard is no creature that died");
  const land = idOf(s, "Wastes", 3);
  runEffects(s, [{effect: "animate", targets: [land], addTypes: ["Creature"], power: 1, toughness: 1}], {controller: 3, source: null});
  runEffects(s, [{effect: "destroy", targets: [land]}], {controller: 0, source: null});
  eq(died()[3], 1, "Sam's Wastes, animated: it died a creature (through the layers)");
  const token = addObject(s, {card: "Soldier", types: ["Creature"], power: 1, toughness: 1, token: true, owner: 3, controller: 3}, "battlefield");
  runEffects(s, [{effect: "destroy", targets: [token]}], {controller: 0, source: null});
  eq(died()[3], 2, "a token dies too (CR 700.4), however briefly it is in the graveyard");
  const elk = idOf(s, "Elk", 1);
  s.objects[elk].counters.finality = 1;
  runEffects(s, [{effect: "destroy", targets: [elk]}], {controller: 0, source: null});
  ok(s.zones.exile.some((id) => s.objects[id].card === "Elk"), "Maya's Elk with a finality counter is exiled instead (CR 122.1h)");
  eq(died()[1], 1, "and so did not die");
  moveOne(s, idOf(s, "Bear", 3), "hand", [], {owner: 3});
  eq(died()[3], 2, "a creature returned to its owner's hand did not die");
  const shrunk = addObject(s, {card: "Wisp", types: ["Creature"], power: 1, toughness: 1, owner: 2, controller: 2}, "battlefield");
  s.objects[shrunk].counters["-1/-1"] = 1;
  checkStateBasedActions(s);
  eq(died()[2], 1, "toughness 0: put into Trey's graveyard (CR 704.5f), and it died");
  addObject(s, {card: "Living Aura", types: ["Enchantment", "Creature"], subtypes: ["Aura"], enchant: {what: "permanent", types: ["Creature"]}, power: 1, toughness: 1, owner: 2, controller: 2}, "battlefield");
  checkStateBasedActions(s);
  eq([died()[2], s.zones.graveyard[2].map((id) => s.objects[id].card).includes("Living Aura")], [2, true], "an Aura that is a creature, attached to nothing, put into the graveyard (CR 704.5m): it died");
  const walker = addObject(s, {card: "Walking Gideon", types: ["Planeswalker", "Creature"], power: 4, toughness: 4, loyalty: 3, owner: 1, controller: 1}, "battlefield");
  s.objects[walker].counters.loyalty = 0;
  checkStateBasedActions(s);
  eq(died()[1], 2, "a planeswalker that is a creature, at 0 loyalty, put into the graveyard (CR 704.5i): it died");
  eq(died("any"), [8, 8, 8, 8], "\"a creature died this turn\": every player's together, whoever asks");
  eq(amount(s, {creaturesDiedThisTurn: "that player"}, 0, {about: {player: 3}}), 2, "\"that player\": Sam's");
  nextTurn(s);
  eq([...died(), died("any")[0]], [0, 0, 0, 0, 0], "a new turn: every count from none");
  ok(amountProblems({creaturesDiedThisTurn: "opponent"}).length > 0, "creaturesDiedThisTurn is \"you\", \"that player\" or \"any\": an opponent's is refused");
}
{
  /* As it happens: "destroy target creature; then, if a creature died this turn, ..." sees the one this resolution destroyed. */
  const s = table([at(1, "battlefield", "Bear")], 2);
  beginResolution(s, [{effect: "destroy", targets: [idOf(s, "Bear", 1)]},
    {effect: "branch", if: {compare: {count: {creaturesDiedThisTurn: "any"}, atLeast: 1}}, then: [{effect: "gainLife", amount: 5}]}], {controller: 0});
  eq(s.players[0].life, 45, "a creature destroyed earlier in the same resolution has died by the time the next effect asks");
}

/* ---------------------------------------------------------------------------------------------------------------------
 * CARDS DRAWN THIS TURN (CR 121.2): the draw step's and every effect's, each card its own, for its player.
 * ------------------------------------------------------------------------------------------------------------------- */
{
  const s = table([], 3);
  const drawn = () => seats(s, {cardsDrawnThisTurn: "you"});
  eq(drawn(), [1, 0, 0], "three players, turn 1: Rob drew his draw step's card -- only a two-player game skips it (CR 103.8a)");
  runEffects(s, [{effect: "draw", count: 2}], {controller: 0, source: null});
  runEffects(s, [{effect: "draw", count: 1, who: "opponent"}], {controller: 0, source: null});
  eq(drawn(), [3, 1, 1], "then Rob draws two more; each opponent one");
  eq(amount(s, {cardsDrawnThisTurn: "that player"}, 0, {about: {player: 2}}), 1, "\"that player\": Trey's");
  nextTurn(s);
  eq(drawn(), [0, 1, 0], "Maya's turn: her draw step's card, and nobody else's");
  for (const kind of ["cardsDrawnThisTurn", "scriedOrSurveilledThisTurn", "spellsCastThisTurn"])
    ok(amountProblems({[kind]: "any"}).length > 0 && amountProblems({[kind]: "you"}).length === 0, `${kind} is "you" or "that player"`);
  ok(amountProblems({spellsCastThisGame: "any", named: "Spark"}).length > 0, "and spellsCastThisGame");
}

/* ---------------------------------------------------------------------------------------------------------------------
 * NONCOMBAT DAMAGE DEALT TO A PLAYER THIS TURN, AND WHAT HAS DEALT DAMAGE.
 * ------------------------------------------------------------------------------------------------------------------- */
{
  const s = table([at(0, "battlefield", "Bear", "Blight"), at(1, "battlefield", "Elk")]);
  const hit = (seat, who = "opponent") => amount(s, {playersDealtNoncombatDamage: who}, seat);
  const bear = idOf(s, "Bear"), blight = idOf(s, "Blight"), elk = idOf(s, "Elk", 1);
  eq([hit(0), hit(0, "any")], [0, 0], "four players: no damage yet");
  runEffects(s, [{effect: "dealDamage", amount: 1, targets: [elk], from: [bear]}], {controller: 0, source: bear});
  eq(hit(0, "any"), 0, "damage to Maya's Elk is no damage to a player");
  ok(s.objects[bear].hasDealtDamage === true && s.objects[bear].hasDealtCombatDamage !== true, "the Bear has dealt damage, and not combat damage");
  eq([selectMatching(s, {what: "permanent", hasDealtDamage: true}, {controller: 0}), selectMatching(s, {what: "permanent", hasDealtCombatDamage: true}, {controller: 0})], [[bear], []],
    "the selector finds it among what has dealt damage, and nothing has dealt combat damage");
  runEffects(s, [{effect: "dealDamage", amount: 1, toPlayer: 1}], {controller: 0, source: null});
  eq([hit(0), hit(1), hit(2), hit(0, "any")], [1, 0, 1, 1], "Maya dealt noncombat damage: an opponent of Rob's and Trey's, not of her own");
  runEffects(s, [{effect: "dealDamage", amount: 1, toPlayer: 2, from: [blight]}], {controller: 0, source: blight});
  eq([s.players[2].poison, s.players[2].life, hit(0)], [1, 40, 2], "infect's damage to Trey is poison, and still damage dealt to him (CR 702.90b)");
  eq(amount(s, {playersDealtNoncombatDamage: "opponent"}, 3), 2, "Sam's opponents dealt it: Maya and Trey");
  concede(s, 1, rng);
  eq(hit(0), 1, "Maya has left the game: no longer an opponent counted (CR 800.4a)");
  nextTurn(s);
  eq(hit(0, "any"), 0, "a new turn: none");
  ok(s.objects[bear].hasDealtDamage === true, "what has dealt damage has dealt it for good: \"yet\" is this game");
  moveOne(s, bear, "hand", [], {owner: 0});
  const back = moveOne(s, s.zones.hand[0].find((id) => s.objects[id].card === "Bear"), "battlefield", [], {owner: 0});
  ok(s.objects[back].hasDealtDamage !== true, "a new object has dealt none (CR 400.7)");
  ok(amountProblems({playersDealtNoncombatDamage: "you"}).length > 0, "playersDealtNoncombatDamage is \"opponent\" or \"any\"");
}
{
  /* "Any" takes in the player asking. */
  const s = table([], 2);
  runEffects(s, [{effect: "dealDamage", amount: 1, toPlayer: 0}], {controller: 0, source: null});
  eq([amount(s, {playersDealtNoncombatDamage: "any"}, 0), amount(s, {playersDealtNoncombatDamage: "opponent"}, 0), amount(s, {playersDealtNoncombatDamage: "opponent"}, 1)], [1, 0, 1],
    "Rob dealt himself noncombat damage: \"any\" counts him, his \"opponent\" does not, Maya's does");
}
{
  /* Combat damage: no noncombat damage, but dealt damage, and combat damage, by the attacker. */
  const s = table([at(0, "battlefield", "Bear")], 2, [{attack: ["Bear"]}, {to: {turn: 1, phase: "MAIN2"}}]);
  const bear = idOf(s, "Bear");
  eq([s.players[1].life, amount(s, {playersDealtNoncombatDamage: "any"}, 0)], [38, 0], "the Bear hits Maya for 2: combat damage, no noncombat damage this turn");
  eq([s.objects[bear].hasDealtDamage, s.objects[bear].hasDealtCombatDamage], [true, true], "and the Bear has dealt damage, and combat damage (CR 510.2)");
  eq(selectMatching(s, {what: "permanent", hasDealtCombatDamage: true}, {controller: 0}), [bear], "the selector finds it");
  eq(selectMatching(s, {what: "permanent", types: ["Creature"], hasDealtDamage: false}, {controller: 0}), [], "and nothing that has not");
}
{
  /* The two keys in both matchers: a rule static's affects is the selector grammar's (rules/statics.mjs), a layer static's
     the layers' (rules/layers.mjs) -- "can't be blocked" and "has hexproof" as long as it hasn't dealt damage. */
  const s = table([at(1, "battlefield", "Bear")], 2);
  const sneak = addObject(s, {card: "Sneak", types: ["Creature"], power: 1, toughness: 1, owner: 0, controller: 0,
    abilities: [{id: "a0", kind: "static", rule: "cant-be-blocked", affects: {what: "permanent", self: true, hasDealtDamage: false}},
      {id: "a1", kind: "static", layer: 6, affects: {what: "permanent", self: true, hasDealtDamage: false}, apply: {addKeywords: ["Hexproof"]}}]}, "battlefield");
  s.objects[sneak].controlledSinceTurn = 0;   /* under Rob's control since before his turn: not summoning sick (CR 302.6) */
  const blocks = (x) => { playUntil(x, (y) => y.awaiting?.kind === "declare-blockers" || (y.turn === 1 && y.phase === "COMBAT_END")); return x.awaiting?.kind === "declare-blockers" ? awaitingChoice(x).options.map((o) => o.label) : []; };
  const t = structuredClone(s);
  playUntil(t, (y) => y.awaiting?.kind === "declare-attackers");
  resolveAwaiting(t, [awaitingChoice(t).options.find((o) => o.label.startsWith("Sneak")).index]);
  eq(blocks(t).filter((l) => l.includes("Sneak")), [], "before it has dealt damage, it can't be blocked");
  ok(characteristicsOf(s, sneak).keywords.includes("Hexproof"), "and has hexproof");
  runEffects(s, [{effect: "dealDamage", amount: 1, toPlayer: 1, from: [sneak]}], {controller: 0, source: sneak});
  ok(!characteristicsOf(s, sneak).keywords.includes("Hexproof"), "once it has dealt damage -- noncombat damage too -- no hexproof");
  playUntil(s, (y) => y.awaiting?.kind === "declare-attackers");
  resolveAwaiting(s, [awaitingChoice(s).options.find((o) => o.label.startsWith("Sneak")).index]);
  ok(blocks(s).some((l) => l === "Bear blocks Sneak"), "and it can be blocked");
  for (const bad of [{hasDealtDamage: "yes"}, {hasDealtCombatDamage: 1}])
    ok((() => { try { compileSelector(bad); return false; } catch { return true; } })(), `the selector refuses ${JSON.stringify(bad)}: true or false`);
}

/* ---------------------------------------------------------------------------------------------------------------------
 * SCRIED OR SURVEILLED THIS TURN.
 * ------------------------------------------------------------------------------------------------------------------- */
{
  const s = table([at(0, "battlefield", "Island", "Island"), at(0, "hand", "Peek", "Glimpse")], 3,
    [{tap: "Island"}, {cast: "Peek"}, {resolve: true}, {answer: []}]);
  const scried = () => seats(s, {scriedOrSurveilledThisTurn: "you"});
  eq(scried(), [1, 0, 0], "Rob scried 1: once");
  runScenarioSteps(s, [{tap: "Island"}, {cast: "Glimpse"}]);
  resolveStack(s);
  eq(scried(), [2, 0, 0], "and surveilled 1: twice");
  eq(amount(s, {scriedOrSurveilledThisTurn: "that player"}, 1, {about: {player: 0}}), 2, "\"that player\": Rob's, asked by Maya");
  nextTurn(s);
  eq(scried(), [0, 0, 0], "a new turn: none");
}
function runScenarioSteps(s, steps) {
  for (const step of steps) {
    const [kind, card] = step.tap ? ["activate-mana", step.tap] : ["cast", step.cast];
    const found = legalActions(s, 0).find((a) => a.kind === kind && a.label === card);
    applyAction(s, 0, found);
  }
}

/* ---------------------------------------------------------------------------------------------------------------------
 * THE LIFE EVERY OPPONENT LOST THIS TURN, AND SPECTACLE (CR 702.137a).
 * ------------------------------------------------------------------------------------------------------------------- */
{
  const s = table([], 4);
  const lost = (seat) => amount(s, {lifeLostThisTurn: "opponents"}, seat);
  runEffects(s, [{effect: "loseLife", amount: 2, who: "you"}], {controller: 0, source: null});
  eq(lost(0), 0, "Rob's own life lost is no opponent's");
  eq(lost(1), 2, "but it is Maya's opponent's");
  runEffects(s, [{effect: "loseLife", amount: 1, who: "opponent"}], {controller: 0, source: null});
  eq([lost(0), lost(2)], [3, 4], "Rob's three opponents lost 1 each; Trey's: Rob's 2, Maya's 1 and Sam's 1, his own not");
  concede(s, 3, rng);
  eq(lost(0), 2, "Sam has left the game: his life lost no longer counted (CR 800.4a)");
  nextTurn(s);
  eq(lost(0), 0, "a new turn: none");
  ok(amountProblems({lifeLostThisTurn: "opponent"}).length > 0 && amountProblems({lifeLostThisTurn: "opponents"}).length === 0,
    "lifeLostThisTurn is \"you\", \"that player\" or \"opponents\"");
}
{
  const LIGHT = "Light Up the Stage";
  const ways = (s) => legalActions(s, 0).filter((a) => a.kind === "cast" && a.label === LIGHT).map((a) => (a.alternative !== undefined ? "spectacle" : "mana")).sort();
  const pooled = (setup, steps) => table(setup, 2, steps);
  const board = [at(0, "battlefield", "Swamp", "Mountain", "Wastes", "Wastes"), at(0, "hand", LIGHT, "Drain")];
  eq(ways(pooled(board, [{tap: "Mountain"}])), [], "no opponent lost life: {R} alone does not cast it");
  eq(ways(pooled(board, [{tap: "Mountain"}, {tap: "Wastes"}, {tap: "Wastes"}])), ["mana"], "{2}{R}: its mana cost alone");
  const drained = pooled(board, [{tap: "Swamp"}, {cast: "Drain"}, {resolve: true}, {tap: "Mountain"}]);
  eq([drained.players[1].life, ways(drained)], [39, ["spectacle"]], "Maya lost a life to Rob's Drain -- life lost, no damage -- and {R} casts it by spectacle");
  const picked = housePilot({seat: 0, cards: index.definition}).choose(projectFor(drained, 0), legalActions(drained, 0));
  eq([picked.kind, picked.label, picked.alternative !== undefined], ["cast", LIGHT, true], "the house pilot takes the spectacle offer: an ordinary cast offer, no new question");
  const identity = {name: "Test Spectacle", oracleId: "test-spectacle", types: ["Sorcery"], subtypes: [], manaCost: "{3}{R}", colors: ["R"], colorIdentity: ["R"], power: null, toughness: null};
  const compiled = (ability) => compileScript({schema: "CrankCardScript@1", identity, oracleText: `${ability.text}\nDraw a card.`, source: "hand",
    abilities: [ability, {kind: "spell", text: "Draw a card.", targets: [], effects: [{effect: "draw", count: 1}]}]});
  const good = compiled({kind: "keyword", text: "Spectacle {R}", keyword: "spectacle", cost: [{atom: "mana", cost: "{R}"}]});
  eq([good.problems, good.definition.abilities.filter((a) => a.rule === "alternative-cost").map((a) => a.cost), good.definition.keywords], [[], [[{atom: "mana", cost: "{R}"}]], ["Spectacle"]],
    "the keyword compiles to an alternative cost of {R}, and the card shows it once");
  ok(compiled({kind: "keyword", text: "Spectacle--Pay 2 life", keyword: "spectacle", cost: [{atom: "payLife", amount: 2}]}).problems.some((p) => p.includes("a spectacle cost of mana")),
    "spectacle's cost is mana: anything else is refused by name");
  ok(compiled({kind: "keyword", text: "Spectacle", keyword: "spectacle"}).problems.some((p) => p.includes("a spectacle cost of mana")), "and a spectacle without a cost");
}

/* ---------------------------------------------------------------------------------------------------------------------
 * SPELLS CAST THIS TURN (read as the amount is), AND THIS GAME BY NAME.
 * ------------------------------------------------------------------------------------------------------------------- */
{
  const s = table([at(0, "battlefield", "Forest", "Wastes", "Mountain"), at(0, "hand", "Bear", "Spark", "Traxos, Academy Guardian"),
    at(1, "battlefield", "Mountain"), at(1, "hand", "Spark")], 3, [
    {tap: "Forest"}, {tap: "Wastes"}, {cast: "Bear"}, {resolve: true}]);
  const traxos = idOf(s, "Traxos, Academy Guardian", 0, "hand");
  const cast = (seat, filter) => amount(s, {spellsCastThisTurn: "you", ...(filter ? {filter} : {})}, seat);
  eq([cast(0), cast(0, {nonTypes: ["Creature"]}), costReduction(s, 0, traxos)], [1, 0, 0], "Rob cast a creature spell: one spell, no noncreature spell, and Traxos costs its full {3}{U}");
  /* Maya's Spark, on Rob's turn: hers, not his. */
  playUntil(s, (x) => x.priorityPlayer === 1);
  applyAction(s, 1, legalActions(s, 1).find((a) => a.kind === "activate-mana"));
  applyAction(s, 1, legalActions(s, 1).find((a) => a.kind === "cast" && a.label === "Spark" && a.targets?.[0]?.kind === "player" && a.targets[0].id === 2));
  resolveStack(s);
  eq([cast(1), cast(1, {nonTypes: ["Creature"]}), cast(0, {nonTypes: ["Creature"]}), costReduction(s, 0, traxos)], [1, 1, 0, 0], "Maya's Spark is her noncreature spell this turn, not Rob's: no {2} off");
  playUntil(s, (x) => x.priorityPlayer === 0 && x.turn === 1);
  applyAction(s, 0, legalActions(s, 0).find((a) => a.kind === "activate-mana"));
  applyAction(s, 0, legalActions(s, 0).find((a) => a.kind === "cast" && a.label === "Spark" && a.targets?.[0]?.kind === "player" && a.targets[0].id === 1));
  eq([cast(0), cast(0, {nonTypes: ["Creature"]}), cast(0, {types: ["Instant"]}), costReduction(s, 0, traxos)], [2, 1, 1, 2],
    "Rob's own Spark, cast and still on the stack: two spells, one noncreature, one instant -- and Traxos costs {2} less");
  eq(amount(s, {spellsCastThisTurn: "that player"}, 2, {about: {player: 0}}), 2, "\"that player\": Rob's, asked by Trey");
  eq(amountProblems({spellsCastThisTurn: "you", filter: {nonTypes: ["Creature"]}}), [], "the spells cast this turn take a filter");
  ok(amountProblems({spellsCastThisTurn: "you", filter: {manaValue: {max: 2}}}).length > 0, "a filter reads what each spell was as it was cast: its card types and controller");
  ok(amountProblems({lifeGainedThisTurn: "you", filter: {}}).length > 0, "and only the counts of what was kept take one");
  nextTurn(s);
  eq([cast(0), cast(1)], [0, 0], "a new turn: none");
  eq(s.players[0].castNames, {Bear: 1, Spark: 1}, "but this game's, by name, stay");
}
{
  /* "If an opponent cast a blue spell this turn" (Ricochet Trap, Train D): spellsCastThisTurn "an opponent" -- the most any one
     opponent still in the game cast (CR 102.2, 800.4a), never several opponents' added together -- each spell's colors as it
     was cast (CR 105.2; script/filter.mjs, a last known snapshot's `colors`). Four players. */
  const s = table([at(0, "battlefield", "Island"), at(0, "hand", "Peek"), at(1, "battlefield", "Island", "Island"), at(1, "hand", "Peek", "Glimpse"),
    at(2, "battlefield", "Island", "Mountain"), at(2, "hand", "Glimpse", "Spark")], 4);
  const BLUE = {spellsCastThisTurn: "an opponent", filter: {colors: ["U"]}};
  const blue = (seat) => amount(s, BLUE, seat), any = (seat) => amount(s, {spellsCastThisTurn: "an opponent"}, seat);
  const cast = (seat, card, land) => {
    playUntil(s, (x) => x.priorityPlayer === seat && !x.awaiting);
    applyAction(s, seat, legalActions(s, seat).find((a) => a.kind === "activate-mana" && a.label === land));
    applyAction(s, seat, legalActions(s, seat).find((a) => a.kind === "cast" && a.label === card && (!a.targets?.length || a.targets[0].kind === "player")));
    resolveStack(s);
  };
  eq([blue(0), any(0)], [0, 0], "four players: nobody has cast anything");
  cast(0, "Peek", "Island");
  eq([blue(0), blue(1), blue(3)], [0, 1, 1], "Rob's own blue Peek is no opponent's to him; to Maya and Sam, it is");
  cast(1, "Peek", "Island");
  eq(blue(0), 1, "Maya's blue Peek: one opponent of Rob's has cast a blue spell");
  cast(2, "Spark", "Mountain");
  eq([blue(0), any(0)], [1, 1], "Trey's Spark is red: still one blue, and one spell is the most any one opponent cast");
  cast(2, "Glimpse", "Island");
  eq([blue(0), any(0)], [1, 2], "Trey's blue Glimpse beside Maya's Peek: the most one opponent cast, 1 -- never their 2 together; and Trey's 2 spells");
  cast(1, "Glimpse", "Island");
  eq(blue(0), 2, "Maya's second blue spell: two, both hers");
  concede(s, 1, rng);
  eq([blue(0), any(0)], [1, 2], "Maya conceded: her spells are no opponent's now (CR 800.4a), Trey's are");
  eq(amountProblems(BLUE), [], "\"an opponent\", with a filter of colors as each spell was cast");
  nextTurn(s);
  eq([blue(0), any(0)], [0, 0], "a new turn: none");
}
{
  /* Aetherflux Reservoir's count as its trigger resolves (CR 608.2h): a spell cast in response is among them. */
  const s = table([at(0, "battlefield", "Aetherflux Reservoir", "Mountain", "Mountain"), at(0, "hand", "Spark", "Spark")], 2);
  for (let n = 0; n < 2; n += 1) {
    applyAction(s, 0, legalActions(s, 0).find((a) => a.kind === "activate-mana"));
    applyAction(s, 0, legalActions(s, 0).find((a) => a.kind === "cast" && a.label === "Spark" && a.targets?.[0]?.kind === "player" && a.targets[0].id === 1));
  }
  eq(s.stack.filter((e) => e.kind !== "spell").length, 2, "two triggers wait, one above each Spark");
  resolveStack(s);
  eq(s.players[0].life, 44, "each counted as it resolved: 2 and 2, not 1 and 2");
  s.players[0].life = 49;
  ok(!legalActions(s, 0).some((a) => a.kind === "activate" && a.label === "Aetherflux Reservoir"), "at 49 life, 50 cannot be paid (CR 119.4)");
  s.players[0].life = 60;
  const zap = legalActions(s, 0).filter((a) => a.kind === "activate" && a.label === "Aetherflux Reservoir");
  ok(zap.length > 0, "at 60 life, Pay 50 life is offered");
  applyAction(s, 0, zap.find((a) => a.targets?.[0]?.kind === "player" && a.targets[0].id === 1));
  resolveStack(s);
  eq([s.players[0].life, s.players[1].life], [10, -12], "Rob pays 50; Maya, at 38, is dealt 50");
}
{
  const APPROACH = "Approach of the Second Sun";
  const SEVEN = ["Plains", "Wastes", "Wastes", "Wastes", "Wastes", "Wastes", "Wastes"];
  const steps = [...SEVEN.map((land) => ({tap: land})), {cast: APPROACH}, {resolve: true}];
  const s = table([at(0, "battlefield", ...SEVEN), at(0, "hand", APPROACH)], 2, steps, ["Island", "Island", "Island", "Island", "Island", "Island", "Island", "Island"]);
  const library = s.zones.library[0].map((id) => s.objects[id].card);
  eq([library.indexOf(APPROACH), s.players[0].life], [6, 47], "the first, cast from Rob's hand: seventh from the top of his library, and 7 life");
  eq(amount(s, {spellsCastThisGame: "you", named: APPROACH}, 0), 1, "one spell of that name cast this game");
  nextTurn(s); nextTurn(s);
  eq(amount(s, {spellsCastThisGame: "you", named: APPROACH}, 0), 1, "still, two turns later: the game's record is never cleared");
  eq(amount(s, {spellsCastThisGame: "you", named: APPROACH}, 1), 0, "and it is Rob's, not Maya's");
  /* The second, cast from exile, not from his hand: no win -- back into the library, and 7 life more. */
  const second = addObject(s, {...index.definition(APPROACH), card: APPROACH, owner: 0, controller: 0}, "exile");
  const before = s.players[0].life;
  castNow(s, 0, castChoicesNow(s, 0, second)[0]);
  resolveStack(s);
  eq([amount(s, {spellsCastThisGame: "you", named: APPROACH}, 0), s.players[0].won === true, s.players[0].life - before], [2, false, 7],
    "a second one cast this game, but from exile: \"cast from your hand\" fails -- no win, and 7 life");
  ok(amountProblems({spellsCastThisGame: "you"}).length > 0 && amountProblems({cardsDrawnThisTurn: "you", named: APPROACH}).length > 0,
    "spellsCastThisGame counts a name, and only it takes one");
}
{
  /* A library shorter than seven: the bottom (moveZone's position, the bottom of a shorter one). */
  const APPROACH = "Approach of the Second Sun";
  const SEVEN = ["Plains", "Wastes", "Wastes", "Wastes", "Wastes", "Wastes", "Wastes"];
  const s = table([at(0, "battlefield", ...SEVEN), at(0, "hand", APPROACH)], 2);
  for (const id of s.zones.library[0].slice(3)) moveOne(s, id, "exile", []);
  for (const land of SEVEN) applyAction(s, 0, legalActions(s, 0).find((a) => a.kind === "activate-mana" && s.objects[a.objectId].card === land && !s.objects[a.objectId].tapped));
  applyAction(s, 0, legalActions(s, 0).find((a) => a.kind === "cast" && a.label === APPROACH));
  resolveStack(s);
  eq(s.zones.library[0].map((id) => s.objects[id].card), ["Wastes", "Wastes", "Wastes", APPROACH], "three cards in his library: it goes to the bottom");
}

/* ---------------------------------------------------------------------------------------------------------------------
 * A GRAVEYARD CARD PUT THERE FROM THE BATTLEFIELD THIS TURN.
 * ------------------------------------------------------------------------------------------------------------------- */
{
  const s = table([at(0, "battlefield", "Bear", "Rock"), at(0, "hand", "Elk"), at(0, "graveyard", "Bear")], 2);
  const fresh = () => selectMatching(s, {what: "card", zone: "graveyard", fromBattlefieldThisTurn: true}, {controller: 0}).map((id) => s.objects[id].card).sort();
  eq(fresh(), [], "a Bear in Rob's graveyard from before the game: not from the battlefield");
  runEffects(s, [{effect: "destroy", targets: [idOf(s, "Bear")]}], {controller: 0, source: null});
  sacrificeOne(s, idOf(s, "Rock"), []);
  moveOne(s, idOf(s, "Elk", 0, "hand"), "graveyard", [], {owner: 0});
  eq(fresh(), ["Bear", "Rock"], "the Bear destroyed and the Rock sacrificed this turn; not the Elk, discarded from his hand");
  const bounced = addObject(s, {...FIX.Elk, card: "Elk", owner: 0, controller: 0}, "battlefield");
  const inHand = moveOne(s, bounced, "hand", [], {owner: 0});
  ok(s.objects[inHand].fromBattlefield === undefined, "the mark is a graveyard card's alone: an Elk returned to Rob's hand carries none");
  const rock = s.zones.graveyard[0].find((id) => s.objects[id].card === "Rock");
  const returned = moveOne(s, rock, "battlefield", [], {owner: 0});
  eq(fresh(), ["Bear"], "the Rock returned to the battlefield is no longer that graveyard card");
  moveOne(s, returned, "graveyard", [], {owner: 0});
  eq(fresh(), ["Bear", "Rock"], "put there from the battlefield again: a new card in the graveyard, and this turn");
  nextTurn(s);
  eq(fresh(), [], "a new turn: put there on an earlier one");
  ok((() => { try { compileSelector({what: "card", zone: "graveyard", fromBattlefieldThisTurn: false}); return false; } catch { return true; } })(), "fromBattlefieldThisTurn is true");
}

/* ---------------------------------------------------------------------------------------------------------------------
 * EVERY RECORD SURVIVES A CHECKPOINT, AND READS BACK THE SAME.
 * ------------------------------------------------------------------------------------------------------------------- */
{
  const s = table([at(0, "battlefield", "Bear", "Island", "Mountain"), at(0, "hand", "Peek", "Spark"), at(1, "battlefield", "Elk")], 2,
    [{tap: "Island"}, {cast: "Peek"}, {resolve: true}, {answer: []}, {tap: "Mountain"}, {cast: "Spark", targets: [{player: 1}]}, {resolve: true}]);
  runEffects(s, [{effect: "dealDamage", amount: 1, toPlayer: 1, from: [idOf(s, "Bear")]}], {controller: 0, source: idOf(s, "Bear")});
  runEffects(s, [{effect: "destroy", targets: [idOf(s, "Elk", 1)]}], {controller: 0, source: null});
  runEffects(s, [{effect: "draw", count: 1}], {controller: 0, source: null});
  const p0 = s.players[0], p1 = s.players[1];
  eq([p0.scriedThisTurn, p0.drawnThisTurn, p0.castNames, p1.diedThisTurn, p1.noncombatDamagedThisTurn, s.objects[idOf(s, "Bear")].hasDealtDamage,
    s.objects[s.zones.graveyard[1][0]].fromBattlefield], [1, 1, {Peek: 1, Spark: 1}, 1, true, true, true], "every record kept");
  const store = createMatchStore(memoryStorage(), "records");
  const point = {...createJournal({matchId: "records", seed: "s"}).checkpoint(s, createRng("s").checkpoint()), matchId: "records"};
  await store.saveCheckpoint(point);
  const back = await store.latestCheckpoint();
  eq(back.state, JSON.parse(JSON.stringify(s)), "the checkpoint is saved, and reads back the same");
  eq([amountOf(back.state, {creaturesDiedThisTurn: "any"}, {controller: 0}), amountOf(back.state, {playersDealtNoncombatDamage: "opponent"}, {controller: 0}),
    amountOf(back.state, {scriedOrSurveilledThisTurn: "you"}, {controller: 0}), amountOf(back.state, {spellsCastThisGame: "you", named: "Spark"}, {controller: 0})], [1, 1, 1, 1],
  "and every amount reads the same from it");
}

/* ---------------------------------------------------------------------------------------------------------------------
 * THE CREDITS.
 * ------------------------------------------------------------------------------------------------------------------- */
eq(["Morbid", "YouDrewThisTurn", "LifeOppsLostThisTurn"].map((kind) => FORGE_COUNTS[kind].status), ["built", "built", "built"],
  "credited: morbid, the cards you drew this turn, the life your opponents lost this turn");
eq(FORGE_COUNTS.ThisTurnCast.status, "partial", "spells cast this turn: partial -- by card type and controller, as each was cast");
ok(keywordBuilt("Spectacle"), "spectacle is a keyword with behavior");
ok(conditionHolds(table([], 2), {compare: {count: {lifeLostThisTurn: "opponents"}, atLeast: 1}}, {controller: 0}) === false, "and its condition is false before anyone has lost life");

console.log(`engine-history-records: ${checks} checks passed -- what died, was drawn, was dealt, was scried, was lost and was cast, this turn and this game; a graveyard card from the battlefield; what has dealt damage; spectacle.`);
