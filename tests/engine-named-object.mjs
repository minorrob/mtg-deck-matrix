/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* M4 PHASE 3, BATCH 70 (THE CATALOG'S ORDER): AN EFFECT'S CONDITION ABOUT A NAMED OBJECT (Forge's ConditionDefined), ITS
 * SEVEN FORMS -- and what three of them needed besides.
 *
 * How the spell was cast: "if this spell was cast from a graveyard" (Sevinne's Reclamation) and Addendum's "if you cast
 * this spell during your main phase" (Unbreakable Formation) -- a copy was not cast (CR 707.10). "This way": what the
 * effect before it did -- the creature you sacrificed (Rise of the Witch-king), the card you discarded (Toph's "if you
 * do"), the permanent it dealt damage to after prevention (Marauding Raptor), the token it made (Yenna). And the spell a
 * trigger is about -- "if that spell is a Lesson", "if it's a permanent spell" -- read as it last was once it has left the
 * stack (CR 608.2h). Besides: an Aura put onto the battlefield without being cast enchants what its controller chooses,
 * or does not enter (CR 303.4f-g); "doesn't have the same name as another permanent you control"; an effect's own
 * condition refused at the schema when it is not one.
 */
import assert from "node:assert/strict";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";
import {collectTriggers} from "../game/engine/rules/trigger.mjs";
import {advance} from "../game/engine/rules/turn.mjs";
import {pushSpell, stackProjection} from "../game/engine/rules/stack.mjs";
import {characteristicsOf} from "../game/engine/rules/layers.mjs";
import {runEffects} from "../game/engine/script/effects/index.mjs";
import {beginResolution, answerResolution} from "../game/engine/script/resolution.mjs";
import {conditionHolds, conditionProblems} from "../game/engine/script/condition.mjs";
import {compileSelector} from "../game/engine/script/filter.mjs";
import {validateScript} from "../game/engine/script/schema.mjs";
import {FORGE_OPTIONS, missingFor} from "../game/tools/engine-constructs.mjs";
import {loadCardIndex, loadCardScripts} from "../game/tools/engine-cards.mjs";

let checks = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const cards = loadCardIndex();
const at = (seat, zone, ...names) => ({seat, zone, cards: names});
const creature = (cost, power, more = {}) => ({types: ["Creature"], manaCost: cost, colors: ["G"], power, toughness: power, ...more});
const gain = {id: "s", text: "You gain 1 life.", targets: [], effects: [{effect: "gainLife", amount: 1}]};
const aura = (enchant) => ({types: ["Enchantment"], subtypes: ["Aura"], manaCost: "{W}", colors: ["W"], enchant,
  spell: {id: "enchant", text: "Enchant", targets: [enchant], effects: []}});
const FIX = {
  Bear: creature("{1}{G}", 2, {subtypes: ["Bear"]}), Ogre: creature("{2}{R}", 3), Elf: creature("{G}", 1),
  Soldier: creature("{1}", 1, {token: true}), Ward: creature("{1}{U}", 1, {keywords: ["Hexproof"]}),
  Ceratops: creature("{2}{G}", 3, {subtypes: ["Dinosaur"]}),
  Shock: {types: ["Instant"], manaCost: "{R}", colors: ["R"], spell: gain},
  Study: {types: ["Sorcery"], subtypes: ["Lesson"], manaCost: "{G}", colors: ["G"], spell: gain},
  Blessing: aura({what: "permanent", types: ["Creature"]}), Growth: aura({what: "permanent", types: ["Land"], controller: "you"}), Curse: aura({what: "player"}),
  Anthem: {types: ["Enchantment"], manaCost: "{2}{W}", colors: ["W"]},
};
const scenario = (setup, steps = [], seats = 2, more = {}) => runScenario({name: "named object", seats, setup, steps, expect: [], ...more}, cards.definition, FIX).state;
const named = (s, name, zone = "battlefield") => Object.values(s.objects).filter((o) => o.card === name && o.zone === zone).map((o) => o.id);
/* Everyone passes until the stack is empty (or something asks). */
const resolveAll = (s) => { for (let n = 0; n < 200 && s.stack.length && !s.awaiting; n += 1) if (passPriority(s).outcome === "step-ends") advance(s); };
const THIS_WAY = {about: "remembered", is: {}};

{
  /* The catalog's credit: built, and a card needing only it is held back by nothing. */
  eq([FORGE_OPTIONS.ConditionDefined.status, missingFor({options: ["ConditionDefined"]})], ["built", []], "ConditionDefined is built");
}
{
  /* The grammar: `cast` says how the spell was cast, closed like the rest. */
  eq(conditionProblems({cast: {from: "graveyard"}}), [], "cast from a graveyard");
  eq(conditionProblems({cast: {mainPhase: true}}), [], "cast during your main phase");
  eq([conditionProblems({cast: {from: "deck"}}).length, conditionProblems({cast: {mainPhase: false}}).length, conditionProblems({cast: {}}).length,
    conditionProblems({cast: {when: "now"}}).length, conditionProblems({cast: "graveyard"}).length], [1, 1, 1, 1, 1], "a zone that is not one, mainPhase false, empty, an unknown key, not an object: refused");
  /* An effect's own condition is checked by the schema now, as an ability's is: a misspelled key is refused, not read as true. */
  const script = structuredClone(loadCardScripts().find(({script: s}) => s.identity.name === "Sevinne's Reclamation").script);
  eq(validateScript(script).valid, true, "Sevinne's Reclamation as written is valid");
  script.abilities[0].effects[1].condition = {castFrom: "graveyard"};
  const {valid, errors} = validateScript(script);
  eq([valid, errors.some((e) => e.path.endsWith("effects[1].condition"))], [false, true], "an effect's condition with a key the grammar lacks: refused at the schema");
}
{
  /* How it was cast, read as it resolves: the original flashed back carries it; the copy it makes was not cast, and has none
     -- so the copy does not copy itself again. The board's stack is as it was: no `cast` in it. */
  const s = scenario([at(0, "graveyard", "Sevinne's Reclamation", "Bear", "Ogre"), at(0, "battlefield", "Plains", "Wastes", "Wastes", "Wastes", "Wastes")],
    [{tap: "Plains"}, {tap: "Wastes"}, {tap: "Wastes"}, {tap: "Wastes"}, {tap: "Wastes"}, {cast: "Sevinne's Reclamation", targets: [{card: "Bear"}]}, {resolve: true}, {choose: ["Yes"]}]);
  const [original, copy] = s.stack;
  eq([original.cast, copy.copy, copy.cast], [{from: "graveyard", mainPhase: true}, true, undefined], "the original was cast from a graveyard in his main phase; the copy was not cast");
  eq(stackProjection(s).some((e) => "cast" in e), false, "how a spell was cast is the engine's: not in the stack it shows");
  eq([conditionHolds(s, {cast: {from: "graveyard"}}, {controller: 0, cast: copy.cast}), conditionHolds(s, {cast: {from: "graveyard"}}, {controller: 0, cast: original.cast}),
    conditionHolds(s, {cast: {from: "hand"}}, {controller: 0, cast: original.cast}), conditionHolds(s, {cast: {mainPhase: true}}, {controller: 0, cast: {from: "hand", mainPhase: false}})],
  [false, true, false, false], "no record, no; the zone it names, yes; another zone, no; outside its caster's main phase, no");
}
{
  /* "That spell", read as it last was (CR 608.2h): Toph's Lesson countered in response -- the land still gets the additional
     counter, because the spell WAS a Lesson. */
  const s = scenario([at(0, "battlefield", "Toph, Hardheaded Teacher", "Forest", "Mountain"), at(0, "hand", "Study")],
    [{tap: "Forest"}, {cast: "Study"}, {choose: ["Mountain"]}]);
  const study = s.stack.find((e) => e.name === "Study").objectId;
  runEffects(s, [{effect: "counterSpell", spells: [study]}], {controller: 1, source: null});
  eq([s.stack.length, named(s, "Study", "graveyard").length], [1, 1], "the Lesson is countered; Toph's trigger waits alone");
  resolveAll(s);
  const mountain = named(s, "Mountain")[0];
  eq([characteristicsOf(s, mountain).power, characteristicsOf(s, mountain).toughness], [2, 2], "earthbend 1 and the additional counter: a 2/2");
}
{
  /* Nalfeshnee's form, "if it's a permanent spell": the spell a trigger is about, on the stack -- and once it has left, as it
     last was there; with nothing known of it, it is not. */
  const s = scenario([at(0, "hand", "Bear", "Shock"), at(0, "battlefield", "Forest", "Wastes", "Mountain")],
    [{tap: "Forest"}, {tap: "Wastes"}, {cast: "Bear"}, {tap: "Mountain"}, {cast: "Shock"}]);
  const permanentSpell = {about: "that card", is: {nonTypes: ["Instant", "Sorcery"]}};
  const bear = s.stack.find((e) => e.name === "Bear"), shock = s.stack.find((e) => e.name === "Shock");
  const was = {cardId: bear.objectId, types: ["Creature"], subtypes: ["Bear"], supertypes: [], controller: 0, token: false};
  eq([conditionHolds(s, permanentSpell, {controller: 0, about: {card: bear.objectId}}), conditionHolds(s, permanentSpell, {controller: 0, about: {card: shock.objectId}})],
    [true, false], "a creature spell is a permanent spell; an instant is not");
  runEffects(s, [{effect: "counterSpell", spells: [bear.objectId]}], {controller: 1, source: null});
  eq([conditionHolds(s, permanentSpell, {controller: 0, about: {card: bear.objectId, was}}), conditionHolds(s, permanentSpell, {controller: 0, about: {card: bear.objectId}}),
    conditionHolds(s, {about: "that card", is: {colors: ["G"]}}, {controller: 0, about: {card: bear.objectId, was}})],
  [true, false, false], "countered: as it last was, a permanent spell; with nothing known, no; and a color its snapshot cannot say is not answered yes");
}
{
  /* "If you sacrificed a creature this way", with a token: it is in the graveyard until it ceases to exist (CR 704.5d), so it
     counts -- and it is never "another permanent card" to return. Gone afterwards. */
  const s = scenario([at(0, "hand", "Rise of the Witch-king"), at(0, "battlefield", "Soldier", "Swamp", "Forest", "Wastes", "Wastes"), at(0, "graveyard", "Ogre"),
    at(1, "battlefield", "Elf")],
  [{tap: "Swamp"}, {tap: "Forest"}, {tap: "Wastes"}, {tap: "Wastes"}, {cast: "Rise of the Witch-king"}, {resolve: true}, {choose: ["Soldier"]}, {choose: ["Elf"]},
    {expect: [{asks: {seat: 0, options: ["Ogre"]}}]}, {choose: ["Ogre"]}]);
  eq([named(s, "Ogre").length, named(s, "Soldier", "graveyard").length, named(s, "Soldier").length], [1, 0, 0], "the token counted; the Ogre returns; the token is gone");
}
{
  /* Three players: what a "this way" sacrifice remembers is its controller's own -- Maya casting it with no creature of hers
     returns nothing, whatever Rob and Trey sacrificed. */
  const s = scenario([at(0, "battlefield", "Bear"), at(2, "battlefield", "Elf"), at(1, "graveyard", "Ogre")], [], 3);
  const outcome = beginResolution(s, [{effect: "sacrifice", who: "each", count: 1, selector: {types: ["Creature"]}, remember: true},
    {effect: "gainLife", amount: 5, condition: THIS_WAY}], {controller: 1, source: null});
  eq([outcome.status, s.awaiting.player], ["waiting", 0], "Rob is asked first");
  answerResolution(s, [0]);
  const done = answerResolution(s, [0]);
  eq([done.status, s.players[1].life], ["done", 40], "Trey sacrificed too; Maya did not, and gains nothing");
}
{
  /* "If you do" (a discard): its controller's own, not each player's. */
  const s = scenario([at(0, "hand", "Bear"), at(1, "hand", "Ogre")], [], 2);
  beginResolution(s, [{effect: "discard", who: "each", count: 1, remember: true}, {effect: "gainLife", amount: 5, condition: THIS_WAY}], {controller: 1, source: null});
  answerResolution(s, [0]);
  const done = answerResolution(s, [0]);
  eq([done.status, s.players[1].life, named(s, "Ogre", "graveyard").length], ["done", 45, 1], "each discards; Maya did, so she gains 5");
  const t = scenario([at(0, "hand", "Bear")], [], 2);
  beginResolution(t, [{effect: "discard", who: "each", count: 1, remember: true}, {effect: "gainLife", amount: 5, condition: THIS_WAY}], {controller: 1, source: null});
  answerResolution(t, [0]);
  eq(t.players[1].life, 40, "Rob discarded, Maya had nothing to: she did not, and gains nothing");
}
{
  /* What "this way" remembers starts empty: an earlier effect's objects are not what a sacrifice, or a discard, that nobody
     made did. And what the controller discarded first is still remembered when the next player is done. */
  const s = scenario([at(0, "battlefield", "Bear")], [], 2);
  const creatures = {what: "permanent", types: ["Creature"]};
  beginResolution(s, [{effect: "pumpAll", selector: creatures, remember: true},
    {effect: "sacrifice", who: "opponent", count: 1, selector: {types: ["Creature"]}, remember: true}, {effect: "gainLife", amount: 5, condition: THIS_WAY},
    {effect: "pumpAll", selector: creatures, remember: true},
    {effect: "discard", who: "opponent", count: 1, remember: true}, {effect: "gainLife", amount: 7, condition: THIS_WAY}], {controller: 0, source: null});
  eq(s.players[0].life, 40, "Maya had no creature and no card: nothing done this way, and no life for Rob");
  const u = scenario([at(0, "hand", "Bear"), at(1, "hand", "Ogre")], [], 2);
  beginResolution(u, [{effect: "discard", who: "each", count: 1, remember: true}, {effect: "gainLife", amount: 5, condition: THIS_WAY}], {controller: 0, source: null});
  answerResolution(u, [0]);
  answerResolution(u, [0]);
  eq(u.players[0].life, 45, "Rob discarded first, then Maya: what he did is still remembered when she is done");
}
{
  /* The spell's snapshot rides every cast trigger -- Thousand-Year Storm's count of the spells before it too -- and a spell
     nothing is known of (gone before its trigger was read) carries none. */
  const s = scenario([at(0, "battlefield", "Thousand-Year Storm", "Mountain"), at(0, "hand", "Shock")], [{tap: "Mountain"}, {cast: "Shock"}]);
  const top = s.stack.at(-1);
  eq([top.name, top.about.castBefore, top.about.was?.types], ["Thousand-Year Storm", 0, ["Instant"]], "the Storm's trigger: no spell before it, and the Shock as it was");
  const t = scenario([at(0, "battlefield", "Toph, Hardheaded Teacher")], [], 2);
  collectTriggers(t, [{kind: "GameEventSpellAbilityCast", data: {turn: 1, phase: "MAIN1", fields: {card: {cardId: 99999, name: "Ghost"}, sa: {isSpell: true, stackId: 99999},
    si: {actor: {playerId: 0}}}}}]);
  eq(t.pendingTriggers.at(-1)?.about, {card: 99999, player: 0}, "a spell no longer anywhere: about it, with nothing known of it");
}
{
  /* An Aura that enchants a player is not built: returned, it finds nothing and stays in the graveyard -- never a permanent
     in a player's place. One thing to enchant inside a resolution: attached at once, nobody asked. */
  const s = scenario([at(0, "graveyard", "Curse"), at(0, "battlefield", "Bear")], [], 2);
  runEffects(s, [{effect: "moveZone", targets: named(s, "Curse", "graveyard"), to: "battlefield"}], {controller: 0, source: null});
  eq([named(s, "Curse", "graveyard").length, named(s, "Curse").length], [1, 0], "Enchant player: it stays in the graveyard");
  const t = scenario([at(0, "graveyard", "Growth"), at(0, "battlefield", "Forest")], [], 2);
  const outcome = beginResolution(t, [{effect: "copyPermanent", targets: named(t, "Growth", "graveyard")}], {controller: 0, source: null});
  eq([outcome.status, t.objects[named(t, "Growth")[0]].attachedTo], ["done", named(t, "Forest")[0]], "one land: the copy enchants it at once");
}
{
  /* "Dealt damage this way" is after prevention: the Raptor's 2 prevented, the Dinosaur was not dealt any, and no +2/+0. */
  const s = scenario([at(0, "battlefield", "Marauding Raptor", "Forest", "Wastes"), at(0, "hand", "Ceratops")],
    [{tap: "Forest"}, {tap: "Wastes"}, {cast: "Ceratops"}, {resolve: true}]);
  const ceratops = named(s, "Ceratops")[0];
  runEffects(s, [{effect: "effectUntil", rule: "prevent-damage", targets: [ceratops], apply: {to: true}, until: "end-of-turn"}], {controller: 1, source: null});
  resolveAll(s);
  eq([characteristicsOf(s, named(s, "Marauding Raptor")[0]).power, s.objects[ceratops].damage], [2, 0], "prevented: no damage, no +2/+0");
  const context = {controller: 0, source: null, remembered: [ceratops]};
  runEffects(s, [{effect: "dealDamage", targets: [ceratops], amount: 0, remember: true}], context);
  eq(context.remembered, [], "no damage to deal: nothing remembered, not what an earlier effect left");
}
{
  /* A token copy of an Aura (CR 303.4f-g): nothing it could enchant, and it is not made; one, and it enters attached to it,
     nobody asked; two outside a resolution, the first. Its controller's "you": Maya's copy of Growth looks for her land. */
  const s = scenario([at(0, "graveyard", "Growth"), at(1, "battlefield", "Forest"), at(0, "battlefield", "Bear")], [], 2);
  const growth = named(s, "Growth", "graveyard")[0];
  const context = {controller: 0, source: null};
  runEffects(s, [{effect: "copyPermanent", targets: [growth], remember: true}], context);
  eq([named(s, "Growth").length, context.remembered], [0, []], "Rob controls no land: no Growth token");
  runEffects(s, [{effect: "copyPermanent", targets: [growth], controller: 1}], {controller: 1, source: null});
  const [token] = named(s, "Growth");
  eq([s.objects[token].attachedTo, s.objects[named(s, "Forest")[0]].attachments], [named(s, "Forest")[0], [token]], "Maya's copy enchants her Forest, at once");
  const b = scenario([at(0, "graveyard", "Blessing"), at(0, "battlefield", "Bear", "Elf")], [], 2);
  runEffects(b, [{effect: "copyPermanent", targets: [named(b, "Blessing", "graveyard")[0]]}], {controller: 0, source: null});
  eq([b.awaiting, b.objects[named(b, "Blessing")[0]].attachedTo], [null, named(b, "Bear")[0]], "two creatures and no resolution to ask in: the first");
}
{
  /* An Aura card put onto the battlefield (Sun Titan, Sevinne's Reclamation): enchanting what it may -- a hexproof creature
     too, since it is not targeted -- or staying in the graveyard with nothing to enchant; off the stack, to the graveyard. */
  const s = scenario([at(0, "graveyard", "Blessing"), at(1, "battlefield", "Ward")], [], 2);
  runEffects(s, [{effect: "moveZone", targets: named(s, "Blessing", "graveyard"), to: "battlefield"}], {controller: 0, source: null});
  eq(s.objects[named(s, "Blessing")[0]]?.attachedTo, named(s, "Ward")[0], "the Blessing enchants Maya's hexproof creature");
  const t = scenario([at(0, "graveyard", "Blessing")], [], 2);
  const card = named(t, "Blessing", "graveyard")[0];
  runEffects(t, [{effect: "moveZone", targets: [card], to: "battlefield"}], {controller: 0, source: null});
  eq([t.objects[card]?.zone, named(t, "Blessing").length], ["graveyard", 0], "no creature: it stays where it was, the same card");
  const u = scenario([at(0, "hand", "Blessing")], [], 2);
  const entry = pushSpell(u, named(u, "Blessing", "hand")[0], {controller: 0, permanent: true});
  runEffects(u, [{effect: "moveZone", targets: [entry.objectId], to: "battlefield"}], {controller: 0, source: null});
  eq([u.stack.length, named(u, "Blessing", "graveyard").length, named(u, "Blessing").length], [0, 1, 0], "from the stack with nothing to enchant: its owner's graveyard");
}
{
  /* "Doesn't have the same name as another permanent you control": another player's same-named permanent does not count. */
  const unique = compileSelector({what: "permanent", types: ["Enchantment"], uniqueName: true});
  const s = scenario([at(0, "battlefield", "Anthem"), at(1, "battlefield", "Anthem")], [], 2);
  eq(named(s, "Anthem").map((id) => unique(s, id, {controller: 0})), [true, true], "one Anthem each: each is unique to its controller");
  const t = scenario([at(0, "battlefield", "Anthem", "Anthem")], [], 2);
  eq(named(t, "Anthem").map((id) => unique(t, id, {controller: 0})), [false, false], "two of Rob's: neither");
}

console.log(`engine-named-object: ${checks} checks passed`);
