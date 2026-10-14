/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* WAVE 4C, LANE K3: TOKENS AND COUNTERS, CLASSES AND DICE -- what the scenarios of the lane's eighteen cards cannot reach.
 *
 *   - A DIE ROLLED (CR 706; Ancient Copper Dragon): `rollDie`, its result from the game's random stream and every face of a d20
 *     reached, "equal to the result" (`dieRolled`), the history's line, and what the schema refuses.
 *   - "WHEN THIS CLASS BECOMES LEVEL 2" (CR 716.2a; Caretaker's Talent, Wizard Class): its own level, from below -- not another
 *     Class's, nor a level set to what it already was -- and the trigger the compiler refuses.
 *   - OFFSPRING (CR 702.175a; Coruscation Mage): the cast paying it is another offer, one that claims it without paying is
 *     refused, and what the compiler refuses.
 *   - COPIES OF WHAT AN EFFECT MOVED, HALVED (Saw in Half), and a mana ability with no {T} of its own that taps an artifact
 *     (Urza, Lord High Artificer): the schema's refusals, and the source tapping itself.
 *   - +1/+1 AND -1/-1 COUNTERS ANNIHILATING (CR 704.5q), done with the other state-based actions, on a creature that survives.
 */
import {play, happen, idOf, compiled, index, checks, creature, at} from "./helpers/x11-keywords.mjs";
import {legalActions, applyAction} from "../game/engine/rules/actions.mjs";
import {checkStateBasedActions} from "../game/engine/rules/sba.mjs";
import {powerOf, toughnessOf} from "../game/engine/rules/layers.mjs";
import {createState} from "../game/engine/state/index.mjs";
import {runEffect} from "../game/engine/script/effects/index.mjs";
import {amountProblems} from "../game/engine/script/amount.mjs";
import {conditionProblems} from "../game/engine/script/condition.mjs";
import {validateScript} from "../game/engine/script/schema.mjs";
import {createRng} from "../game/engine/rng.mjs";
import {isPrimitive, isKeyword, isTriggerEvent} from "../game/engine/vocabulary.mjs";
import {TRIGGER_KINDS} from "../game/engine/cards/index.mjs";
import {historyLines} from "../game/room/history.mjs";
import {tableDefinition} from "../game/engine/cards/definitions.mjs";
import {loadCardScenarios} from "../game/tools/engine-cards.mjs";
import {runScenario} from "../game/engine/cards/scenario.mjs";

const {eq, ok, throws, done} = checks("engine-wave4c-k3");
const BEAR = creature(["Bear"], 2, 2);
const spellScript = (effects, targets = []) => ({schema: "CrankCardScript@1", identity: {name: "Odd", oracleId: "x", types: ["Sorcery"], subtypes: [], manaCost: "{1}", colors: [], colorIdentity: [], power: null, toughness: null},
  oracleText: "x", source: "hand", abilities: [{kind: "spell", text: "x", targets, effects}]});
const errorsAt = (script, end) => validateScript(script).errors.filter((e) => e.path.endsWith(end)).length;

/* ---- the vocabulary names them ---- */
eq([isPrimitive("rollDie"), isTriggerEvent("becomes level"), TRIGGER_KINDS.includes("becomes level"), isKeyword("offspring")], [true, true, true, true],
  "rollDie a primitive, \"becomes level\" a trigger the compiler builds, offspring a keyword");

/* ---- a die rolled (CR 706) ---- */
{
  const s = createState({matchId: "m", seed: "dice", players: [{name: "Rob"}, {name: "Maya"}]});
  const rng = createRng("dice"), seen = new Set();
  let last = null, context = null;
  for (let n = 0; n < 400; n += 1) {
    context = {controller: 0, source: null};
    [last] = runEffect(s, {effect: "rollDie", sides: 20}, context, rng);
    seen.add(last.data.fields.result);
  }
  eq([seen.size, Math.min(...seen), Math.max(...seen)], [20, 1, 20], "a d20: every face from 1 to 20 comes up, and nothing else");
  eq([last.kind, last.data.fields.sides, last.data.fields.player.playerId, context.rolled === last.data.fields.result], ["GameEventDieRolled", 20, 0, true],
    "said to everyone, by its roller, and kept for what follows");
  throws(() => runEffect(s, {effect: "rollDie", sides: 6}, {controller: 0, source: null}, null), /random stream/, "never rolled without the game's random stream");
  eq([runEffect(s, {effect: "rollDie"}, {controller: 0, source: null}, rng), runEffect(s, {effect: "rollDie", sides: 1}, {controller: 0, source: null}, rng)], [[], []],
    "a die of no number of sides, or of one, rolls nothing");
  eq(historyLines({kind: "GameEventDieRolled", data: {turn: 3, fields: {player: {playerId: 0}, sides: 20, result: 13}}}, ["Rob"]), [{turn: 3, text: "Rob rolled a d20: 13"}],
    "the history says the roll and its result");
  eq([errorsAt(spellScript([{effect: "rollDie"}]), ".sides"), errorsAt(spellScript([{effect: "rollDie", sides: 1}]), ".sides"), errorsAt(spellScript([{effect: "rollDie", sides: "20"}]), ".sides"),
    errorsAt(spellScript([{effect: "rollDie", sides: 20}]), ".sides")], [1, 1, 1, 0], "a die's sides: a whole number, 2 or more");
  eq([amountProblems({dieRolled: true}), amountProblems({dieRolled: 1}).length], [[], 1], "dieRolled is true");
}

/* ---- "when this Class becomes level 2" (CR 716.2a) ---- */
{
  const s = play([at(0, "battlefield", "Wizard Class", "Wizard Class")]);
  const [a, b] = Object.keys(s.objects).map(Number).filter((id) => s.objects[id].card === "Wizard Class" && s.objects[id].zone === "battlefield");
  const mine = (id) => (s.pendingTriggers ?? []).filter((t) => t.source.cardId === id).length;
  happen(s, {effect: "setState", targets: [b], level: 2});
  s.pendingTriggers = [];
  happen(s, {effect: "setState", targets: [a], level: 2});
  eq([mine(a), mine(b)], [1, 0], "one Wizard Class becomes level 2: its trigger, not the other's -- level 2 already, and having the ability");
  s.pendingTriggers = [];
  happen(s, {effect: "setState", targets: [a], level: 2});
  eq(mine(a), 0, "set to level 2 again, it did not become level 2");
  happen(s, {effect: "setState", targets: [a], level: 3});
  eq(mine(a), 0, "becoming level 3 is not becoming level 2");
  const t = play([at(0, "battlefield", "Wizard Class")]);
  const c = idOf(t, "Wizard Class");
  happen(t, {effect: "setState", targets: [c], level: 3});
  eq((t.pendingTriggers ?? []).filter((p) => p.source.cardId === c).length, 0, "nor is going from level 1 straight to 3");
  const trig = (trigger) => compiled([{kind: "triggered", text: "x", trigger, effects: [{effect: "draw", count: 1}]}]).problems.length;
  eq([trig({on: "becomes level", level: 2}), trig({on: "becomes level", level: 1}), trig({on: "becomes level"}), trig({on: "becomes level", level: 2, who: "another"})], [0, 1, 1, 1],
    "the trigger: this permanent's own level, 2 or more");
}

/* ---- offspring (CR 702.175a) ---- */
{
  const s = play([at(0, "battlefield", "Mountain", "Wastes", "Wastes", "Wastes"), at(0, "hand", "Coruscation Mage")],
    [{tap: "Mountain"}, {tap: "Wastes"}, {tap: "Wastes"}, {tap: "Wastes"}]);
  const casts = legalActions(s, 0).filter((a) => a.kind === "cast" && a.label === "Coruscation Mage");
  eq(casts.map((a) => [a.extraMana ?? "", a.offspring === true]).sort(), [["", false], ["{2}", true]], "two offers: without offspring, and with its {2} paid");
  const plain = casts.find((a) => !a.offspring);
  throws(() => applyAction(structuredClone(s), 0, {...plain, offspring: true}), /./, "a cast claiming offspring without paying for it is refused");
  const definition = index.definition("Coruscation Mage");
  eq([definition.spell.additionalCost, definition.abilities.filter((a) => a.kind === "triggered" && a.condition?.offspringPaid === true).length, definition.keywords.includes("Offspring")],
    [[{atom: "offspring", cost: "{2}"}], 1, true], "the card: its additional cost, its trigger as it enters, and the keyword it has");
  const off = (ability, identity) => compiled([ability], identity).problems.length;
  eq([off({kind: "keyword", text: "Offspring {2}", keyword: "offspring", cost: "{2}"}), off({kind: "keyword", text: "Offspring {2}", keyword: "offspring", cost: "{2}"}, {types: ["Artifact"]}),
    off({kind: "keyword", text: "Offspring", keyword: "offspring"}),
    compiled([{kind: "keyword", text: "Offspring {2}", keyword: "offspring", cost: "{2}"}, {kind: "keyword", text: "Offspring {1}", keyword: "offspring", cost: "{1}"}]).problems.length > 0],
    [0, 1, 1, true], "offspring: a mana cost, on a creature, once");
  eq([conditionProblems({offspringPaid: true}), conditionProblems({offspringPaid: "yes"}).length], [[], 1], "offspringPaid is true or false");
}

/* ---- copies of what an effect moved, halved (Saw in Half) ---- */
{
  eq([errorsAt(spellScript([{effect: "copyPermanent", of: "moved", halfStats: true, count: 2}]), ".of"),
    errorsAt(spellScript([{effect: "copyPermanent", of: "moved", targets: {target: 0}}], [{what: "permanent"}]), ".of"),
    errorsAt(spellScript([{effect: "copyPermanent", of: "self"}]), ".of"), errorsAt(spellScript([{effect: "destroy", of: "moved"}]), ".of"),
    errorsAt(spellScript([{effect: "copyPermanent", targets: {target: 0}, halfStats: true}], [{what: "permanent"}]), ".halfStats")],
  [0, 1, 1, 1, 1], "of: \"moved\" on a copyPermanent with no targets of its own; halfStats only beside it");
}

/* ---- a copy and a characteristic-defining ability (CR 707.9d) ---- */
{
  /* Adeline's power is the number of creatures Rob controls: a plain copy keeps that ability; a 1/1 copy (offspring's) does not. */
  const s = play([at(0, "battlefield", "Adeline, Resplendent Cathar", "Bear", "Bear")], [], {}, {Bear: BEAR});
  const adeline = idOf(s, "Adeline, Resplendent Cathar");
  happen(s, {effect: "copyPermanent", targets: [adeline], except: {nonLegendary: true}});
  happen(s, {effect: "copyPermanent", targets: [adeline], except: {nonLegendary: true, setPower: 1, setToughness: 1}});
  const tokens = Object.keys(s.objects).map(Number).filter((id) => s.objects[id].token === true && s.objects[id].card === "Adeline, Resplendent Cathar");
  eq(tokens.map((id) => [powerOf(s, id), toughnessOf(s, id)]), [[5, 4], [1, 1]],
    "a plain copy's power is the creatures Rob controls (five, the copies among them); a 1/1 copy's stays 1");
}

/* ---- a mana ability that taps an artifact, with no {T} of its own (Urza, Lord High Artificer) ---- */
{
  const urza = index.definition("Urza, Lord High Artificer").abilities.find((a) => a.kind === "mana");
  eq([urza?.tapSelf, urza?.tapCreature], [false, {types: ["Artifact"]}], "compiled as a mana ability: no {T}, an artifact tapped");
  const SPIRE = {types: ["Artifact"], manaCost: "{2}", colors: [], abilities: [{id: "m", kind: "mana", tapSelf: false, produces: {C: 1}, tapCreature: {types: ["Artifact"]},
    text: "Tap an untapped artifact you control: Add {C}."}]};
  const s = play([at(0, "battlefield", "Spire", "Relic", "Bear")], [], {}, {Spire: SPIRE, Bear: BEAR});
  const offers = () => legalActions(s, 0).filter((a) => a.kind === "activate-mana" && a.label === "Spire").map((a) => a.costNames.join("+")).sort();
  eq(offers(), ["Relic", "Spire"], "it may tap its own source, an artifact, or another -- never the Bear");
  s.objects[idOf(s, "Spire")].tapped = true;
  eq(offers(), ["Relic"], "tapped, its source is no longer one to tap -- and the ability is still offered, having no {T} of its own");
}

/* ---- +1/+1 and -1/-1 counters annihilate (CR 704.5q) on a creature that lives ---- */
{
  const s = play([at(0, "battlefield", "Bear")], [], {}, {Bear: BEAR});
  const bear = idOf(s, "Bear");
  s.objects[bear].counters = {"+1/+1": 2, "-1/-1": 1};
  checkStateBasedActions(s);
  eq([s.objects[bear]?.counters, s.objects[bear]?.zone], [{"+1/+1": 1, "-1/-1": 0}, "battlefield"], "a 3/3 with both: one of each gone, and it stays");
}

/* ---- every one of the lane's cards, at the table, and its scenarios played here too (so a break is found quickly) ---- */
const LANE = ["The Reaver Cleaver", "Maskwood Nexus", "Bitterblossom", "Caretaker's Talent", "Ancient Copper Dragon", "Sai, Master Thopterist", "Chasm Skulker",
  "Steel Overseer", "Coruscation Mage", "Saw in Half", "Pact of Negation", "Loyal Apprentice", "Terrasymbiosis", "Urza, Lord High Artificer", "Wizard Class",
  "Revitalizing Repast // Old-Growth Grove", "Banner of Kinship", "Setessan Champion"];
for (const name of LANE) ok(index.resolve(name)?.playable === true && tableDefinition(name) !== null, `${name}: playable, and the table plays it (cards/definitions.mjs)`);
/* And the cards already defined whose rules these changes touched: a mana ability tapping another creature (Jaspera Sentinel,
   Saruli Caretaker), a choice made as a permanent enters (Patchwork Banner, Herald's Horn), counters and tokens doubled or added
   to (Doubling Season, Queen Allenal of Ruadach), entering as a copy (Sculpting Steel, Phyrexian Metamorph, Spark Double), a
   Class's levels (Innkeeper's Talent), a copy as its source last existed (Colorstorm Stallion), a count as it enters (Diregraf
   Colossus), and power set by a characteristic-defining ability (Body of Knowledge, Adeline, Resplendent Cathar). */
const TOUCHED = ["Jaspera Sentinel", "Saruli Caretaker", "Patchwork Banner", "Herald's Horn", "Doubling Season", "Queen Allenal of Ruadach", "Sculpting Steel",
  "Phyrexian Metamorph", "Spark Double", "Innkeeper's Talent", "Colorstorm Stallion", "Diregraf Colossus", "Body of Knowledge", "Adeline, Resplendent Cathar"];
for (const {scenarios: file} of loadCardScenarios().filter(({scenarios}) => LANE.includes(scenarios.card) || TOUCHED.includes(scenarios.card)))
  for (const scenario of file.scenarios) ok(runScenario(scenario, index.definition, file.fixtures ?? {}).passed.length > 0, `${file.card}: ${scenario.name}`);

done("a die rolled and its result, a Class becoming level 2, offspring's offers and refusals, copies of what an effect moved halved, a mana ability tapping an artifact with no {T} of its own, counters annihilating, and the table playing all eighteen of the lane's cards, each scenario of theirs played, and those of the cards whose rules they touched");
