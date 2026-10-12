/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* WAVE 4A, LANE H3: AN OBJECT AN EFFECT REMEMBERS, REFERRED TO LATER BY THE SAME CARD -- what the scenarios of its nineteen
 * cards cannot reach.
 *
 *   - "THE COPIED PERMANENT" (Spark Double): entering as a copy, the exception's counters by what it entered as
 *     (rules/entering.mjs, `except.entersWithCounters`), said as counters put on; a planeswalker copied has its loyalty,
 *     a copiable value (CR 707.2; effects/permanents.mjs, copiable; state/index.mjs COPY_KEYS; rules/layers.mjs, lastKnown),
 *     and enters with that many loyalty counters (CR 306.5b; rules/replacement.mjs, ownEntering) -- Clever Impersonator too.
 *   - "THAT CREATURE DEALS COMBAT DAMAGE" (Hunter's Insight): a delayed trigger waiting on a damage source (rules/trigger.mjs).
 *   - "ITS ACTIVATED ABILITIES CAN'T BE ACTIVATED" (Koma, Cosmos Serpent; CR 602.5, 605.1a): the remembered permanents
 *     (state/index.mjs, activationsForbidden) offer no activation and pay for nothing (rules/actions.mjs, rules/mana.mjs).
 *   - REPLACEMENTS A RESOLUTION MADE ABOUT WHAT IT NAMED (rules/replacement.mjs, rememberedReplacement): "that creature enters
 *     with an additional +1/+1 counter" (Summon: Fenrir) and "if a source would deal damage to that player or a permanent
 *     that player controls, it deals double that damage" (Lightning, Army of One), each its own effect, ordered as any is.
 *   - "THAT CREATURE'S POWER" (Ziatora): a reflexive trigger about what the effect before it sacrificed, as it last was.
 *   - SHADOW (CR 702.28; Minas Morgul's shadow counter, CR 122.1b): who may block whom.
 *   - "EACH PLAYER CHOOSES A COLOR" (Selective Obliteration): each chooser's color kept, and a selector's `onlyChosenColor`.
 *   - "TARGET ARTIFACT CARD IN THAT PLAYER'S GRAVEYARD ... IF BOTH TARGETS ARE STILL LEGAL" (Goblin Welder): a target spec's
 *     `ownedByControllerOf` (script/bind.mjs, script/schema.mjs) and the condition `targetsLegal` (script/condition.mjs).
 *   - "THE CREATURE WITH THE GREATEST POWER OR TIED" (Summon: Fenrir): the condition `greatestPower`.
 */
import {play, happen, idOf, compiled, index, checks, creature, at, later} from "./helpers/x11-keywords.mjs";
import {canBlockAttacker, blockersAreLegal, KEYWORD_FAMILIES} from "../game/engine/keywords/combat.mjs";
import {canBlock} from "../game/engine/rules/combat.mjs";
import {ruleChanged} from "../game/engine/rules/statics.mjs";
import {keywordsOf, lastKnown, controllerOf} from "../game/engine/rules/layers.mjs";
import {paymentUnits, canPayGeneric} from "../game/engine/rules/mana.mjs";
import {legalActions} from "../game/engine/rules/actions.mjs";
import {activationsForbidden, ACTIVATIONS_FORBIDDEN, COPY_KEYS} from "../game/engine/state/index.mjs";
import {applyReplacements, damageChoicesPossible, damageOrderChoice} from "../game/engine/rules/replacement.mjs";
import {validateScript} from "../game/engine/script/schema.mjs";
import {targetChoices, targetCandidates, recheckTargets} from "../game/engine/script/bind.mjs";
import {conditionHolds, conditionProblems} from "../game/engine/script/condition.mjs";
import {compileSelector} from "../game/engine/script/filter.mjs";
import {isKeyword} from "../game/engine/vocabulary.mjs";
import {tableDefinition} from "../game/engine/cards/definitions.mjs";

const {eq, ok, throws, done} = checks("engine-wave4a-h3");
const BEAR = creature(["Bear"], 2, 2);
const FIX = {
  Bear: BEAR, "Their Bear": BEAR, Ogre: creature(["Ogre"], 3, 3, {colors: ["R"]}),
  Dauthi: creature(["Dauthi"], 1, 1, {colors: ["B"], keywords: ["Shadow"]}),
  Walker: {types: ["Planeswalker"], supertypes: ["Legendary"], subtypes: ["Ajani"], manaCost: "{2}{W}", colors: ["W"], loyalty: 9},
  /* Not legendary, so a legendary copy of it is no matter for the legend rule (CR 704.5j). */
  Drifter: {types: ["Planeswalker"], subtypes: ["Ajani"], manaCost: "{2}{W}", colors: ["W"], loyalty: 4},
  Relic: {types: ["Artifact"], manaCost: "{1}", colors: []},
  Engine: {types: ["Artifact", "Creature"], subtypes: ["Construct"], manaCost: "{4}", colors: [], power: 4, toughness: 4},
  Doubler: {types: ["Enchantment"], manaCost: "{R}", colors: ["R"], abilities: [{id: "dbl", kind: "replacement", text: "If a source would deal damage to a permanent or player, it deals double that damage to that permanent or player instead.",
    watches: {event: "damage"}, change: {multiply: 2}}]},
  Adder: {types: ["Enchantment"], manaCost: "{R}", colors: ["R"], abilities: [{id: "add", kind: "replacement", text: "If a source you control would deal damage to an opponent, it deals that much damage plus 2 instead.",
    watches: {event: "damage", source: {controller: "you"}, toPlayer: "opponent"}, change: {add: 2}}]},
};
const pay = (lands) => lands.map((tap) => ({tap}));
const SPARK_LANDS = ["Island", "Wastes", "Wastes", "Wastes"];

/* ---- Spark Double: the copy's counters, by what it entered as; a planeswalker's loyalty copied ---- */
{
  eq(COPY_KEYS.includes("loyalty"), true, "loyalty is a copiable value (CR 707.2)");
  const s = play([at(0, "hand", "Spark Double"), at(0, "battlefield", ...SPARK_LANDS, "Walker")],
    [...pay(SPARK_LANDS), {cast: "Spark Double"}, {resolve: true}, {choose: ["Walker"]}, {settle: true}], {}, FIX);
  const walkers = s.zones.battlefield.filter((id) => s.objects[id].card === "Walker");
  eq(walkers.map((id) => s.objects[id].counters.loyalty ?? 0).sort((a, b) => a - b), [9, 10], "the original at 9; the copy at its printed 9 and one more");
  const copy = walkers.find((id) => (s.objects[id].counters.loyalty ?? 0) === 10);
  eq([s.objects[copy].loyalty, s.objects[copy].counters["+1/+1"] ?? 0, (s.objects[copy].supertypes ?? []).includes("Legendary")], [9, 0, false],
    "the copy's loyalty is the Walker's, no +1/+1 counter (it entered as no creature), and not legendary");
  eq(lastKnown(s, copy).copiable?.loyalty, 9, "and its last known copiable values carry the loyalty (a token copy of it as it last was)");
}
{
  /* Clever Impersonator, which may copy any nonland permanent: a planeswalker copied enters with its loyalty and lives. */
  const s = play([at(0, "hand", "Clever Impersonator"), at(0, "battlefield", "Island", "Island", "Wastes", "Wastes", "Drifter")],
    [{tap: "Island"}, {tap: "Island"}, {tap: "Wastes"}, {tap: "Wastes"}, {cast: "Clever Impersonator"}, {resolve: true}, {choose: ["Drifter"]}, {settle: true}], {}, FIX);
  const walkers = s.zones.battlefield.filter((id) => s.objects[id].card === "Drifter");
  eq(walkers.map((id) => s.objects[id].counters.loyalty ?? 0), [4, 4], "Clever Impersonator as the Drifter: 4 loyalty counters, and on the battlefield");
}

/* ---- Hunter's Insight: the delayed trigger waits on the damage's source, not on what was dealt it ---- */
{
  const s = play([at(0, "hand", "Hunter's Insight"), at(0, "battlefield", "Forest", "Wastes", "Wastes", "Bear"), at(1, "battlefield", "Their Bear")],
    [{tap: "Forest"}, {tap: "Wastes"}, {tap: "Wastes"}, {cast: "Hunter's Insight", targets: [{card: "Bear"}]}, {resolve: true}], {}, FIX);
  const bear = idOf(s, "Bear", 0), theirs = idOf(s, "Their Bear", 1);
  const waiting = (s.delayedTriggers ?? []).find((d) => d.on?.on === "GameEventPlayerDamaged");
  eq([waiting?.watch, waiting?.thisTurn, waiting?.on?.planeswalkers], [bear, true, true], "it waits on the Bear, this turn, to a player or planeswalker");
  /* Maya's Bear's combat damage to Rob, and the Bear's noncombat damage: neither is it. */
  happen(s, {effect: "dealDamage", amount: 2, who: [0]}, {controller: 1, source: theirs});
  happen(s, {effect: "dealDamage", amount: 2, who: [1]}, {controller: 0, source: bear});
  eq([s.pendingTriggers.filter((t) => t.abilityId === "delayed").length, s.zones.hand[0].length], [0, 0], "noncombat damage, or another source's, triggers nothing");
}

/* ---- Koma: the permanents named offer no activation, and pay for nothing ---- */
{
  const s = play([at(0, "battlefield", "Forest", "Wastes")], [], {}, FIX);
  const forest = idOf(s, "Forest");
  eq([activationsForbidden(s, forest), canPayGeneric(s, 0, 2), paymentUnits(s, 0).length], [false, true, 2], "before: both lands pay");
  s.effects = [...(s.effects ?? []), {id: "koma", rule: ACTIVATIONS_FORBIDDEN, affects: {ids: [forest]}, until: "end-of-turn", sourceController: 1, timestamp: 1}];
  eq([activationsForbidden(s, forest), canPayGeneric(s, 0, 2), paymentUnits(s, 0).map((u) => u.label)], [true, false, ["Tap Wastes"]],
    "the Forest's mana ability can't be activated: an unasked generic payment can't tap it either (rules/mana.mjs)");
  eq(legalActions(s, 0).filter((a) => a.kind === "activate-mana").map((a) => a.label), ["Wastes"], "nor is it offered to tap for mana");
}

/* ---- Lightning: the doubler a resolution made, each its own, ordered with the others ---- */
{
  const s = play([at(0, "battlefield", "Lightning, Army of One", "Doubler"), at(1, "battlefield", "Ogre")], [], {}, FIX);
  const lightning = idOf(s, "Lightning, Army of One"), ogre = idOf(s, "Ogre");
  eq(damageChoicesPossible(s), false, "one doubler on the battlefield: no order to choose");
  happen(s, {effect: "effectUntil", rule: "damage-doubled", who: [1], until: "your-next-turn"}, {controller: 0, source: lightning});
  const doubled = s.effects.find((e) => e.rule === "damage-doubled");
  eq([doubled.players, doubled.name, doubled.until], [[1], "Lightning, Army of One", "your-next-turn"], "it remembers Maya, by its source's name, until Rob's next turn");
  eq(damageChoicesPossible(s), true, "with it, two effects change damage: the order is Maya's to choose when the orders differ");
  happen(s, {effect: "effectUntil", rule: "damage-doubled", who: [1], until: "your-next-turn"}, {controller: 0, source: lightning});
  const {proposal} = applyReplacements(s, {event: "damage", sourceId: lightning, toPlayer: 1, toCard: null, amount: 1, combat: false}, {dry: true});
  eq(proposal.amount, 8, "three doublers, each its own effect: 1 becomes 8 (CR 614.5)");
  const toOgre = applyReplacements(s, {event: "damage", sourceId: lightning, toPlayer: null, toCard: ogre, amount: 1, combat: false}, {dry: true}).proposal;
  eq(toOgre.amount, 8, "to a permanent Maya controls, the same");
  const toRob = applyReplacements(s, {event: "damage", sourceId: ogre, toPlayer: 0, toCard: null, amount: 1, combat: false}, {dry: true}).proposal;
  eq(toRob.amount, 2, "to Rob, only the Doubler's");
  /* What she controls is read as the damage is dealt: the Ogre Rob's now, and Lightning's doublers pass it by. */
  happen(s, {effect: "gainControl", targets: [ogre]}, {controller: 0, source: null});
  eq([controllerOf(s, ogre), applyReplacements(s, {event: "damage", sourceId: lightning, toPlayer: null, toCard: ogre, amount: 1, combat: false}, {dry: true}).proposal.amount],
    [0, 2], "Rob's Ogre: the Doubler's alone");
}
{
  /* The order question names the effect by its source. */
  const s = play([at(0, "battlefield", "Lightning, Army of One", "Adder"), at(1, "battlefield", "Ogre")], [], {}, FIX);
  const lightning = idOf(s, "Lightning, Army of One");
  happen(s, {effect: "effectUntil", rule: "damage-doubled", who: [1]}, {controller: 0, source: lightning});
  const {question} = applyReplacements(s, {event: "damage", sourceId: lightning, toPlayer: 1, toCard: null, amount: 3, combat: false}, {askable: true, dry: true});
  eq(question?.player, 1, "doubled then plus 2 is 8, plus 2 then doubled 10: Maya, dealt it, is asked which first (CR 616.1)");
  const labels = damageOrderChoice(s, {proposal: question.proposal, options: question.options}).options.map((o) => o.label);
  ok(labels.some((l) => l.startsWith("Lightning, Army of One first")), `the doubler is named for the order (CR 616.1): ${labels.join(" | ")}`);
}

/* ---- Shadow (CR 702.28b) ---- */
{
  eq([KEYWORD_FAMILIES.evasion.includes("Shadow"), isKeyword("shadow")], [true, true], "shadow is a keyword with behavior");
  const s = play([at(0, "battlefield", "Bear", "Dauthi"), at(1, "battlefield", "Their Bear", "Ogre")], [], {}, FIX);
  const bear = idOf(s, "Bear"), dauthi = idOf(s, "Dauthi"), theirs = idOf(s, "Their Bear"), ogre = idOf(s, "Ogre");
  eq([canBlockAttacker(s, theirs, dauthi), canBlockAttacker(s, theirs, bear)], [false, true], "a creature without shadow can't block one with it, and still blocks one without");
  eq(canBlockAttacker(s, dauthi, ogre), false, "a creature with shadow can't block one without");
  happen(s, {effect: "putCounter", targets: [ogre], counter: "shadow", count: 1}, {controller: 0, source: null});
  eq([keywordsOf(s, ogre).includes("Shadow"), canBlockAttacker(s, ogre, dauthi), blockersAreLegal(s, dauthi, [ogre])], [true, true, true], "a shadow counter gives shadow: the Ogre may block the Dauthi now");
}

/* ---- Taunt from the Rampart and Secret Tunnel: the rules they change, read where blocks are ---- */
{
  const s = play([at(0, "hand", "Taunt from the Rampart"), at(0, "battlefield", "Mountain", "Plains", "Wastes", "Wastes", "Wastes", "Bear"), at(1, "battlefield", "Their Bear")],
    [...pay(["Mountain", "Plains", "Wastes", "Wastes", "Wastes"]), {cast: "Taunt from the Rampart"}, {resolve: true}], {}, FIX);
  const theirs = idOf(s, "Their Bear");
  eq([ruleChanged(s, "cant-block", theirs), canBlock(s, theirs, 1), ruleChanged(s, "goaded", theirs)], [true, false, true], "Maya's Bear is goaded and can't block");
  eq(ruleChanged(s, "cant-block", idOf(s, "Bear")), false, "Rob's own creature is neither");
}
{
  const s = play([at(0, "battlefield", "Secret Tunnel")], [], {}, FIX);
  const tunnel = idOf(s, "Secret Tunnel");
  happen(s, {effect: "animate", targets: [tunnel], power: 3, toughness: 3, types: ["Creature"]}, {controller: 0, source: tunnel});
  eq(ruleChanged(s, "cant-be-blocked", tunnel), true, "this land can't be blocked: a creature now, it can't be (CR 509.1b)");
}

/* ---- Ziatora: the reflexive trigger reads what the sacrifice remembered, as it last was ---- */
{
  const s = play([at(0, "battlefield", "Ziatora, the Incinerator", "Ogre")], [], {}, FIX);
  const ogre = idOf(s, "Ogre");
  happen(s, {effect: "pump", targets: [ogre], power: 2, toughness: 0}, {controller: 0, source: null});
  const context = {controller: 0, source: idOf(s, "Ziatora, the Incinerator")};
  happen(s, {effect: "moveZone", targets: [ogre], sacrifice: true, remember: true}, context);
  happen(s, {effect: "immediateTrigger", about: "remembered", targets: [], effects: [{effect: "gainLife", amount: 1}]}, context);
  const reflexive = s.pendingTriggers.find((t) => t.abilityId === "reflexive");
  eq([reflexive.about.card, reflexive.about.lastKnown?.power], [context.remembered[0], 5], "about the card in the graveyard, its power as it last was: 5");
  /* What it remembered and what it moved differ (a remembering that kept no snapshot): no last known is guessed at. */
  happen(s, {effect: "immediateTrigger", about: "remembered", targets: [], effects: []}, {...context, remembered: [context.remembered[0], 99], movedWas: [{power: 7}]});
  eq(s.pendingTriggers.filter((t) => t.abilityId === "reflexive").at(-1).about.lastKnown, undefined, "one snapshot for two remembered: none is read");
}

/* ---- Selective Obliteration's selector ---- */
{
  throws(() => compileSelector({onlyChosenColor: "yes"}), /onlyChosenColor is true or false/, "onlyChosenColor is a boolean");
  const s = play([at(0, "battlefield", "Bear", "Relic"), at(1, "battlefield", "Ogre")], [], {}, FIX);
  const only = compileSelector({what: "permanent", onlyChosenColor: true});
  const ids = {bear: idOf(s, "Bear"), ogre: idOf(s, "Ogre"), relic: idOf(s, "Relic")};
  eq([only(s, ids.bear, {chosenColors: {0: "G", 1: "G"}}), only(s, ids.ogre, {chosenColors: {0: "G", 1: "G"}}), only(s, ids.relic, {chosenColors: {0: "C"}})],
    [true, false, false], "the Bear is only Rob's green; the Ogre is not Maya's; a colorless Relic is no color at all");
  eq(only(s, ids.bear, {}), false, "a controller who chose nothing: no permanent of theirs is only that color");
}

/* ---- Goblin Welder: "in that player's graveyard", "if both targets are still legal" ---- */
{
  const welder = index.definition("Goblin Welder");
  const specs = welder.abilities.find((a) => a.kind === "activated").targets;
  const s = play([at(0, "battlefield", "Relic"), at(0, "graveyard", "Engine"), at(1, "battlefield", "Relic"), at(1, "graveyard", "Engine")], [], {}, FIX);
  const [robRelic, mayaRelic] = [idOf(s, "Relic", 0), idOf(s, "Relic", 1)];
  const [robEngine, mayaEngine] = [s.zones.graveyard[0][0], s.zones.graveyard[1][0]];
  eq(targetChoices(s, specs, {controller: 0, source: null}).map((t) => t.map((x) => x.id)), [[robRelic, robEngine], [mayaRelic, mayaEngine]], "each artifact with its controller's graveyard's card");
  eq(targetCandidates(s, specs[1], {controller: 0, source: null, chosenTargets: [{kind: "object", id: mayaRelic}]}).map((c) => c.id), [mayaEngine],
    "a second target chosen after the first: Maya's card, for Maya's artifact");
  eq(targetCandidates(s, specs[1], {controller: 0, source: null, chosenTargets: []}).map((c) => c.id), [], "with no first target yet, none");
  /* As it resolves (CR 608.2b): Maya now controls Rob's Relic -- the Engine in Rob's graveyard is no longer that player's. */
  happen(s, {effect: "gainControl", targets: [robRelic]}, {controller: 1, source: null});
  const {targets, fizzles} = recheckTargets(s, specs, [{kind: "object", id: robRelic}, {kind: "object", id: robEngine}], {controller: 0, source: null});
  eq([targets[0]?.id, targets[1], fizzles], [robRelic, null, false], "the Relic still a legal target, the Engine not");
  eq([conditionHolds(s, {targetsLegal: true}, {controller: 0, targets}), conditionHolds(s, {targetsLegal: true}, {controller: 0, targets: [targets[0]]})], [false, true],
    "targetsLegal: every one, or the condition fails");
  eq([conditionHolds(s, {targetsLegal: true}, {controller: 0}), conditionHolds(s, {targetsLegal: true}, {controller: 0, targets: []})], [false, false],
    "and an ability with no targets at all has none legal");
  eq(conditionProblems({targetsLegal: false}), ["targetsLegal is true: every target still legal as it resolves"], "targetsLegal is true");
  const script = (targets) => ({schema: "CrankCardScript@1", identity: {name: "Odd", oracleId: "odd", types: ["Creature"], subtypes: [], manaCost: "{1}", colors: [], colorIdentity: [], power: 1, toughness: 1},
    oracleText: "x", source: "hand", abilities: [{kind: "activated", text: "x", cost: [{atom: "{T}"}], targets, effects: []}]});
  const errors = (targets) => validateScript(script(targets)).errors.filter((e) => e.path.endsWith("ownedByControllerOf")).length;
  eq([errors(specs), errors([specs[1], specs[0]]), errors([specs[0], {...specs[1], ownedByControllerOf: 1}]), errors([{...specs[0], what: "card", zone: "graveyard"}, specs[1]]),
    errors([specs[0], {...specs[1], what: "permanent", zone: undefined}]), errors([{...specs[0], count: {min: 1, max: 2}}, specs[1]])], [0, 1, 1, 1, 1, 1],
    "ownedByControllerOf names an earlier, single permanent target, on a single card target");
}

/* ---- Summon: Fenrir's "the creature with the greatest power or tied" ---- */
{
  const s = play([at(0, "battlefield", "Bear"), at(1, "battlefield", "Ogre")], [], {}, FIX);
  eq([conditionHolds(s, {greatestPower: "you"}, {controller: 0}), conditionHolds(s, {greatestPower: "you"}, {controller: 1})], [false, true], "the Ogre's 3 is the greatest: Maya's");
  happen(s, {effect: "pump", targets: [idOf(s, "Bear")], power: 1, toughness: 0}, {controller: 0, source: null});
  eq([conditionHolds(s, {greatestPower: "you"}, {controller: 0}), conditionHolds(s, {greatestPower: "you"}, {controller: 1})], [true, true], "tied at 3: both");
  /* A power below zero is that power (CR 208.1): Rob's Bear at -1, the only creature, is the creature with the greatest. */
  const low = play([at(0, "battlefield", "Bear")], [], {}, FIX);
  happen(low, {effect: "pump", targets: [idOf(low, "Bear")], power: -3, toughness: 0}, {controller: 0, source: null});
  eq(conditionHolds(low, {greatestPower: "you"}, {controller: 0}), true, "a -1 power alone is the greatest");
  const none = play([at(1, "battlefield", "Ogre")], [], {}, FIX);
  eq(conditionHolds(none, {greatestPower: "you"}, {controller: 0}), false, "Rob controls no creature: none of his has it");
  eq(conditionProblems({greatestPower: true}), ["greatestPower is \"you\": its controller controls the creature with the greatest power, or one tied for it"], "greatestPower is \"you\"");
}

/* ---- each definition, compiled whole ---- */
for (const name of ["Spark Double", "Mistrise Village", "Hunter's Insight", "Koma, Cosmos Serpent", "Goblin Welder", "Secret Tunnel", "Taunt from the Rampart",
  "Summon: Fenrir", "Legolas's Quick Reflexes", "Whirler Rogue", "Lightning, Army of One", "Ziatora, the Incinerator", "Bria, Riptide Rogue",
  "Thassa, God of the Sea", "Minas Morgul, Dark Fortress", "Basim Ibn Ishaq", "Selective Obliteration", "Together Forever", "Slip Through Space"])
  ok(index.resolve(name)?.playable === true && tableDefinition(name) !== null, `${name}: playable, and the table plays it (cards/definitions.mjs)`);
void later; void compiled;

done("Spark Double's copy and its counters, Hunter's Insight's damage source, Koma's forbidden activations, the replacements a resolution remembers, Ziatora's sacrificed power, shadow, each player's color, Goblin Welder's two targets, and the greatest power");
