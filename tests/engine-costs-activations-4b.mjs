/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* WAVE 4B, LANE J4: ACTIVATIONS FORBIDDEN, COSTS RAISED, X PAID IN LIFE, THE ATTACKERS DECLARED, AND THE SMALL PIECES BESIDE
 * THEM -- what the scenarios of the lane's twenty-eight cards cannot reach.
 *
 * rules/statics.mjs, permanentActivationForbidden: "your opponents can't activate abilities of artifacts, creatures, or
 * enchantments" (Grand Abolisher; CR 602.5), its mana abilities too (605.1a) -- of the permanents `of` describes, during its
 * controller's turn or always, while its condition holds.
 *
 * rules/statics.mjs and rules/actions.mjs: "spells your opponents cast that target this creature cost an additional 3 life to
 * cast" (Terror of the Peaks; CR 601.2c, 601.2f, 119.4) -- each way to aim a spell costed, a Phyrexian symbol's life with it;
 * a counted target chosen after the offer, refused as it is cast, saying what to do. "As an additional cost to cast this
 * spell, pay X life" (Toxic Deluge; CR 107.3a, 601.2b): the house pilot never pays all its life, and pays the least X.
 *
 * And what the schema and the compiler let each new form say: a cant-activate's `of`, a cost's `targeting` and `life`, a
 * triggered ability's "choose one or more" (Black Market Connections), all counters moved (The Ozolith), the counters "that
 * card" had, "from anywhere other than the battlefield" and "a creature card leaves your graveyard" (Syr Konrad, the Grim),
 * "except the first one they draw in each of their draw steps" (Orcish Bowmasters), "if its power is greater than each other
 * creature's power" (Selvala, Heart of the Wilds), and "you attacked with two or more creatures this turn" (Minas Tirith).
 */
import assert from "node:assert/strict";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {compileScript} from "../game/engine/cards/index.mjs";
import {validateScript} from "../game/engine/script/schema.mjs";
import {conditionProblems, conditionHolds} from "../game/engine/script/condition.mjs";
import {amountProblems} from "../game/engine/script/amount.mjs";
import {awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {legalActions, applyAction} from "../game/engine/rules/actions.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";
import {permanentActivationForbidden, lifeIncrease} from "../game/engine/rules/statics.mjs";
import {housePilot} from "../game/engine/pilots/house-pilot.mjs";
import {projectFor} from "../game/engine/projection.mjs";
import {tableCards} from "../cloud/game-room.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const TERROR = "Terror of the Peaks";
const CREATURE_OR_PLAYER = {anyOf: [{what: "permanent", types: ["Creature"]}, {what: "player"}]};
const FIX = {
  Bear: {types: ["Creature"], subtypes: ["Bear"], manaCost: "{1}{G}", colors: ["G"], power: 2, toughness: 2},
  Relic: {types: ["Artifact"], manaCost: "{1}", colors: []},
  /* "Activated abilities of artifacts your opponents control can't be activated as long as this is untapped": the always form
     of Grand Abolisher's, with a condition. */
  Lock: {types: ["Artifact"], manaCost: "{2}", colors: [], abilities: [{id: "l", kind: "static", text: "x", rule: "cant-activate",
    affects: {what: "player", who: "opponent"}, of: {types: ["Artifact"]}, condition: {present: {what: "permanent", self: true, tapped: false}}}]},
  /* "Spells cost {1} more to cast": a tax in mana, which is no tax in life. */
  Taxer: {types: ["Artifact"], manaCost: "{2}", colors: [], abilities: [{id: "t", kind: "static", text: "x", rule: "spells-cost-more", affects: {}, amount: 1}]},
  /* {R/P}: 1 damage to any target -- a Phyrexian symbol, paid in red or in 2 life. */
  Gut: {types: ["Instant"], manaCost: "{R/P}", colors: ["R"], spell: {id: "s", text: "x", targets: [CREATURE_OR_PLAYER], effects: [{effect: "dealDamage", amount: 1, targets: {target: 0}, who: {target: 0}}]}},
  /* "Destroy up to one target creature": a counted target, chosen once the offer is taken. */
  Pick: {types: ["Instant"], manaCost: "{B}", colors: ["B"], spell: {id: "s", text: "x", targets: [{what: "permanent", types: ["Creature"], count: {min: 0, max: 1}}],
    effects: [{effect: "destroy", targets: {target: 0}}]}},
  PickP: {types: ["Instant"], manaCost: "{B/P}", colors: ["B"], spell: {id: "s", text: "x", targets: [{what: "permanent", types: ["Creature"], count: {min: 0, max: 1}}],
    effects: [{effect: "destroy", targets: {target: 0}}]}},
  /* "Spells your opponents cast that target this creature cost {2} more to cast": the form in mana. */
  Warded: {types: ["Creature"], subtypes: ["Merfolk"], manaCost: "{1}{U}", colors: ["U"], power: 2, toughness: 2, abilities: [{id: "w", kind: "static", text: "x",
    rule: "spells-cost-more", affects: {}, caster: "opponent", targeting: {self: true}, amount: 2}]},
  Doom: {types: ["Instant"], manaCost: "{B}", colors: ["B"], spell: {id: "s", text: "x", targets: [{what: "permanent", types: ["Creature"]}], effects: [{effect: "destroy", targets: {target: 0}}]}},
  General: {types: ["Creature"], supertypes: ["Legendary"], subtypes: ["Human"], manaCost: "{2}{W}", colors: ["W"], power: 3, toughness: 3},
  Partner: {types: ["Creature"], supertypes: ["Legendary"], subtypes: ["Elf"], manaCost: "{1}{B}", colors: ["B"], power: 2, toughness: 1},
};
const at = (seat, zone, ...cards) => ({seat, zone, cards});
const play = (setup, extra = {}) => runScenario({name: "costs-activations-4b", seats: 2, setup, steps: [], ...extra}, index.definition, FIX).state;
const idOf = (s, card, seat) => s.zones.battlefield.find((id) => s.objects[id].card === card && s.objects[id].controller === seat);
const casts = (s, seat, card) => legalActions(s, seat).filter((a) => a.kind === "cast" && a.label === card);
const identity = {name: "Odd", oracleId: "x", types: ["Artifact"], subtypes: [], manaCost: "{1}", colors: [], colorIdentity: [], power: null, toughness: null};
const script = (abilities, more = {}) => ({schema: "CrankCardScript@1", identity: {...identity, ...more}, oracleText: abilities.map((a) => a.text).join("\n"), source: "hand", abilities});
const valid = (abilities, more) => validateScript(script(abilities, more)).valid;
const problems = (abilities, more) => compileScript(script(abilities, more)).problems;

/* ---- the schema: what each new form may say ---- */
{
  const lock = (more, rule = "cant-activate") => [{kind: "static", text: "x", rule, affects: {what: "player", who: "opponent"}, ...more}];
  const ARTIFACTS = {types: ["Artifact"]};
  ok(valid(lock({of: ARTIFACTS, duringYourTurn: true})), "cant-activate of some permanents during your turn (Grand Abolisher) is a script");
  ok(valid(lock({of: ARTIFACTS})), "and of some permanents always");
  ok(!valid(lock({of: ARTIFACTS, duringCombat: true})), "of some permanents during combat is not a form built");
  ok(!valid(lock({of: ARTIFACTS, duringYourTurn: false})), "duringYourTurn is true or absent");
  ok(!valid(lock({duringCombat: true, duringYourTurn: true})), "during your turn without `of` is not either");
  ok(!valid(lock({of: ARTIFACTS, duringYourTurn: true}, "cant-cast")), "`of` is a cant-activate static's, never a cant-cast's");
  ok(!valid(lock({of: {kinds: ["Artifact"]}})), "`of` is a selector, held to its grammar");

  const tax = (more, rule = "spells-cost-more") => [{kind: "static", text: "x", rule, affects: {}, caster: "opponent", ...more}];
  ok(valid(tax({targeting: {self: true}, life: 3})), "\"spells that target this creature cost 3 life more\" is a script");
  ok(!valid(tax({targeting: {selff: true}, life: 3})), "its targeting is a selector, held to its grammar");
  ok(!valid(tax({life: 0})), "a life increase is 1 or more");
  ok(!valid(tax({life: 3, amount: 1})), "in place of mana, never beside it");
  ok(!valid([{kind: "static", text: "x", rule: "cant-cast", affects: {what: "player"}, duringYourTurn: true, life: 3}]), "and a spells-cost-more static's alone");

  const modal = (more, kind = "triggered") => [{kind, text: "x", ...(kind === "triggered" ? {trigger: {on: "step", step: "MAIN1"}} : {cost: [{atom: "{T}"}]}),
    effects: [{effect: "modal", choose: 1, chooseUpTo: 2, modes: [{text: "a", effects: [{effect: "draw", count: 1}]}, {text: "b", effects: [{effect: "gainLife", amount: 1}]}], ...more}]}];
  ok(valid(modal({})), "a triggered ability may choose one or more (Black Market Connections)");
  ok(!valid(modal({choose: 0})), "never none there");
  ok(!valid(modal({sameMode: true})), "nor one mode twice");
  ok(!valid(modal({}, "activated")), "and an activated ability's modal is asked as it resolves, as one");

  const move = (more) => [{kind: "triggered", text: "x", trigger: {on: "step", step: "COMBAT_BEGIN"}, targets: [{what: "permanent", types: ["Creature"]}],
    effects: [{effect: "moveCounters", from: "self", targets: {target: 0}, counter: "all", ...more}]}];
  ok(valid(move({})), "all counters moved (The Ozolith) is a script");
  ok(!valid(move({count: 1})), "with no count of its own");
}

/* ---- the compiler: what it refuses rather than reads wrong ---- */
{
  const deluge = (cost, mana = "{2}{B}") => [{kind: "spell", text: "x", targets: [], additionalCost: [cost], effects: [{effect: "pumpAll", selector: {types: ["Creature"]}, power: {x: true, times: -1}, toughness: {x: true, times: -1}, until: "end-of-turn"}]}];
  const sorcery = {types: ["Sorcery"]};
  eq(problems(deluge({atom: "payLife", amount: "X"}), sorcery), [], "an additional cost of X life compiles");
  ok(problems(deluge({atom: "payLife", amount: 2}), sorcery).some((p) => /X life/.test(p)), "a fixed amount of life is not the form built");
  ok(problems(deluge({atom: "payLife", amount: "X"}), {...sorcery, manaCost: "{X}{B}"}).some((p) => /no \{X\} in its mana cost/.test(p)), "nor X life beside an {X} in its mana cost");

  const trig = (trigger, effects = [{effect: "draw", count: 1}]) => [{kind: "triggered", text: "x", trigger, effects}];
  ok(problems(trig({on: "put into graveyard", owner: "any", notFrom: "hand"})).some((p) => /does not watch for/.test(p)), "\"from anywhere other than\" is the battlefield, or nothing");
  eq(problems(trig({on: "left graveyard", owner: "you", filter: {types: ["Creature"]}})), [], "a creature card leaving your graveyard compiles");
  ok(problems(trig({on: "drawn", drawer: "opponent", exceptFirstInDrawStep: "yes"})).some((p) => /does not watch for/.test(p)), "exceptFirstInDrawStep is true or absent");
  ok(problems(trig({on: "leaves", who: "any", filter: {types: ["Creature"]}}, [{effect: "putCounter", targets: "self", countersOf: "remembered"}]))
    .some((p) => /countersOf/.test(p)), "the counters it had are its source's or that card's");

  ok(conditionProblems({powerAboveOthers: "self"}).length > 0, "powerAboveOthers is about that card");
  eq(conditionProblems({powerAboveOthers: "that card"}), [], "and that is a condition");
  ok(amountProblems({creaturesAttackedWithThisTurn: "opponent"}).length > 0, "the creatures attacked with are a player's: you or that player");
  eq(amountProblems({creaturesAttackedWithThisTurn: "you"}), [], "and yours is an amount");
}

/* ---- an activation forbidden of some permanents (Grand Abolisher's form), always, and while its condition holds ---- */
{
  const s = play([at(0, "battlefield", "Lock", "Sol Ring"), at(1, "battlefield", "Sol Ring", "Llanowar Elves")]);
  const lock = idOf(s, "Lock", 0);
  eq([permanentActivationForbidden(s, idOf(s, "Sol Ring", 1)), permanentActivationForbidden(s, idOf(s, "Llanowar Elves", 1)), permanentActivationForbidden(s, idOf(s, "Sol Ring", 0))],
    [true, false, false], "an opponent's artifact, not their creature, and not its controller's own");
  s.activePlayer = 1;
  ok(permanentActivationForbidden(s, idOf(s, "Sol Ring", 1)), "with no \"during your turn\", on any player's turn");
  s.objects[lock].tapped = true;
  ok(!permanentActivationForbidden(s, idOf(s, "Sol Ring", 1)), "its condition false, nothing forbidden");
}

/* ---- Terror of the Peaks: each way to aim a spell costed, a Phyrexian symbol's life with it (CR 601.2f, 119.4) ---- */
{
  const s = play([at(0, "battlefield", TERROR, "Bear"), at(1, "hand", "Gut")], {at: {turn: 2, phase: "MAIN1"}});
  s.players[1].life = 4;
  const aims = casts(s, 1, "Gut").map((a) => a.targetNames.join(", ")).sort();
  eq(aims, ["Bear", "Maya", "Rob"], "4 life, no red: paying 2 life for {R/P}, Gut may aim anywhere but at the Terror, which costs 3 life more");
  s.players[1].manaPool.R = 1;
  const red = casts(s, 1, "Gut").filter((a) => a.targetNames.join() === TERROR);
  eq([red.length, red[0]?.payWays === true, red[0]?.payment?.life ?? 0], [1, false, 0], "with {R} in her pool, at the Terror for the red alone -- the 2 life is no way to pay it then");
  applyAction(s, 1, red[0]);
  eq(s.players[1].life, 1, "and she pays the 3 life");
  const t = play([at(0, "battlefield", "Taxer"), at(1, "hand", "Gut")]);
  const gut = Number(Object.keys(t.objects).find((id) => t.objects[id].card === "Gut"));
  eq(lifeIncrease(t, 1, gut, []), 0, "a tax in mana is no tax in life");
}
{
  /* The same, in mana: with a single {B}, Maya may aim her Doom at the Bear, and not at the creature that costs {2} more. */
  const s = play([at(0, "battlefield", "Warded", "Bear"), at(1, "hand", "Doom")], {at: {turn: 2, phase: "MAIN1"}});
  s.players[1].manaPool.B = 1;
  eq(casts(s, 1, "Doom").map((a) => a.targetNames.join()).sort(), ["Bear"], "the Warded creature costs {2} more to target, which her pool can't pay");
  s.players[1].manaPool.C = 2;
  eq(casts(s, 1, "Doom").map((a) => a.targetNames.join()).sort(), ["Bear", "Warded"], "and with {2} more it can");
}
{
  /* A counted target is chosen after the offer is taken: aimed at the Terror with too little life, the cast is refused, saying
     what to do instead, and nothing is paid. */
  const s = play([at(0, "battlefield", TERROR), at(1, "hand", "Pick"), at(1, "battlefield", "Swamp")], {at: {turn: 2, phase: "MAIN1"}});
  s.players[1].life = 2;
  applyAction(s, 1, legalActions(s, 1).find((a) => a.kind === "activate-mana"));
  const [offer] = casts(s, 1, "Pick");
  applyAction(s, 1, offer);
  eq(s.awaiting?.kind, "choose-targets", "the counted target is asked once the cast is taken");
  const terror = awaitingChoice(s).options.find((o) => o.label.startsWith(TERROR));
  assert.throws(() => resolveAwaiting(s, [terror.index]), /costs 3 more life to cast this way, and Maya has 2: choose other targets/);
  checks += 1;
  eq([s.players[1].life, s.players[1].manaPool.B, Boolean(idOf(s, TERROR, 0))], [2, 1, true], "and nothing was paid, nor destroyed");
}
{
  /* {B/P} and a counted target: offered paying 2 of her 4 life; aimed at the Terror then, 2 + 3 is more than she has. */
  const s = play([at(0, "battlefield", TERROR), at(1, "hand", "PickP")], {at: {turn: 2, phase: "MAIN1"}});
  s.players[1].life = 4;
  applyAction(s, 1, casts(s, 1, "PickP")[0]);
  const terror = awaitingChoice(s).options.find((o) => o.label.startsWith(TERROR));
  assert.throws(() => resolveAwaiting(s, [terror.index]), /cannot be paid for/);
  checks += 1;
  eq(s.players[1].life, 4, "her life untouched");
}

/* ---- questions in words ---- */
{
  const s = play([at(0, "battlefield", "Command Beacon"), at(0, "command", "General", "Partner")]);
  applyAction(s, 0, legalActions(s, 0).find((a) => a.kind === "activate" && a.label === "Command Beacon"));
  passPriority(s); passPriority(s);
  eq(awaitingChoice(s).title, "Choose a card in your command zone", "a commander is chosen in the command zone, not searched for");
}
{
  const s = play([at(0, "battlefield", "Black Market Connections")]);
  eq(awaitingChoice(s).title, "Black Market Connections: choose 1 or more", "\"choose one or more\", asked in those words");
}
{
  const s = play([at(0, "battlefield", "Relic")]);
  ok(!conditionHolds(s, {powerAboveOthers: "that card"}, {controller: 0, about: {card: idOf(s, "Relic", 0)}}), "a permanent with no power has none greater than anything's");
}

/* ---- the house pilot and X paid in life ---- */
{
  const facts = {"Toxic Deluge": {manaValue: 3, types: ["Sorcery"], x: true}, Swamp: {manaValue: 0, types: ["Land"]}, Wastes: {manaValue: 0, types: ["Land"]}};
  const run = (life) => {
    const s = play([at(0, "hand", "Toxic Deluge"), at(0, "battlefield", "Swamp", "Wastes", "Wastes"), at(1, "battlefield", "Bear")]);
    s.players[0].life = life;
    const pilot = housePilot({seat: 0, cards: (name) => facts[name] ?? null});
    for (let n = 0; n < 8; n += 1) {
      const choice = pilot.choose(projectFor(s, 0), legalActions(s, 0));
      if (choice.kind === "pass") break;
      applyAction(s, 0, choice);
      if (choice.kind === "cast") break;
    }
    return s;
  };
  const s = run(40);
  eq([s.stack.at(-1)?.x, s.players[0].life], [1, 39], "it pays the least X that does something, never X for all its life's worth");
  const low = run(1);
  eq([low.stack.length, low.players[0].life], [0, 1], "and at 1 life it does not cast it: X 1 would cost all of it");
}

/* ---- the table plays the lane's cards ---- */
{
  const cards = ["Bojuka Bog", "Toxic Deluge", "Swan Song", "Black Market Connections", "City of Brass", "Syr Konrad, the Grim", "Flooded Grove", "Inventors' Fair", "Damn",
    "The Ozolith", "Twilight Mire", "Chrome Mox", "Orcish Bowmasters", "Command Beacon", "Grand Abolisher", "Loran of the Third Path", "Bedevil", "Toski, Bearer of Secrets",
    "Land Tax", "Tropical Island", "Academy Ruins", "Minas Tirith", TERROR, "Selvala, Heart of the Wilds", "Volcanic Island", "Massacre Wurm", "Damnation", "Scavenger Grounds"];
  eq(cards.filter((name) => !tableCards(name)), [], "every one of the lane's twenty-eight cards plays at the table");
  /* Mosswort Bridge plays since wave 4c's lane k1 built the land played as an effect resolves (CR 305.2a). */
  eq(["Six"].filter((name) => tableCards(name)), [], "and the one it stopped on, Six, does not yet");
  eq(["Mosswort Bridge"].filter((name) => !tableCards(name)), [], "while Mosswort Bridge, the other, now plays");
}

console.log(`engine-costs-activations-4b: ${checks} checks passed -- an activation forbidden of some permanents, always and while its condition holds; a spell's life raised for what it targets, a Phyrexian symbol's life with it, a counted target refused in words; X paid in life, and the house pilot paying the least; the schema's and the compiler's refusals; questions in words; the table playing the lane's cards.`);
