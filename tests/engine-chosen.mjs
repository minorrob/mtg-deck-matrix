/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* M4 PHASE 3, BATCH 56 (THE CATALOG'S ORDER): "AS THIS ENTERS, CHOOSE A CREATURE TYPE" (Forge's ETBReplacement, its
 * choosing forms).
 *
 * The choice is asked as the permanent enters -- the creature types among the game's cards, or the options named -- and
 * kept as that permanent's `chosen`. Each permanent reads its own: its statics through the layers ("creatures of the
 * chosen type get +1/+1", "this creature is the chosen type"), its rules statics (a cost reduction), its triggers'
 * filters, its abilities' effects and costs, and a replacement watching others enter. A condition may ask which was chosen
 * (the Sieges), a rule static too. Before anything is chosen, "$chosen" matches nothing.
 */
import assert from "node:assert/strict";
import {createState, addObject} from "../game/engine/state/index.mjs";
import {characteristicsOf, lastKnown} from "../game/engine/rules/layers.mjs";
import {costReduction, costIncrease, ruleChanged} from "../game/engine/rules/statics.mjs";
import {beginGame, advance} from "../game/engine/rules/turn.mjs";
import {legalActions, applyAction} from "../game/engine/rules/actions.mjs";
import {enteringModifications} from "../game/engine/rules/replacement.mjs";
import {conditionHolds, conditionProblems} from "../game/engine/script/condition.mjs";
import {collectTriggers} from "../game/engine/rules/trigger.mjs";
import {runEffects} from "../game/engine/script/effects/index.mjs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {withChosen, chosenFor, NONE_CHOSEN} from "../game/engine/script/chosen.mjs";
import {missingFor} from "../game/tools/engine-constructs.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";

let checks = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const cards = loadCardIndex();
const card = (name) => ({...cards.definition(name), card: name});
const table = () => createState({matchId: "m", seed: "chosen", players: [{name: "Rob"}, {name: "Maya"}]});
const put = (s, o, seat, zone = "battlefield", chosen) => { const id = addObject(s, {...o, owner: seat, controller: seat}, zone, zone === "battlefield" ? null : seat); if (chosen !== undefined) s.objects[id].chosen = chosen; return id; };
const ELF = {card: "Elf", types: ["Creature"], subtypes: ["Elf"], power: 1, toughness: 1}, GOBLIN = {card: "Goblin", types: ["Creature"], subtypes: ["Goblin"], power: 1, toughness: 1};
const WASTES = {card: "Wastes", types: ["Land"], supertypes: ["Basic"], abilities: [{id: "a0", kind: "mana", tapSelf: true, produces: {C: 1}}]};
const at = (seat, zone, ...names) => ({seat, zone, cards: names});

{
  /* Asked as it enters: the creature types among the game's cards; or the options named. */
  const fixtures = {Elf: {...ELF, manaCost: "{G}"}, Goblin: {...GOBLIN, manaCost: "{R}"}};
  eq(runScenario({name: "types", setup: [at(0, "battlefield", "Wastes", "Wastes", "Wastes", "Elf"), at(1, "graveyard", "Goblin"), at(0, "hand", "Patchwork Banner")],
    steps: [{tap: "Wastes"}, {tap: "Wastes"}, {tap: "Wastes"}, {cast: "Patchwork Banner"}, {resolve: true}], expect: [{asks: {seat: 0, options: ["Elf", "Goblin"]}}]}, cards.definition, fixtures).passed.length, 1,
    "Patchwork Banner: Elf (his battlefield) and Goblin (Maya's graveyard) offered");
  eq(runScenario({name: "named", setup: [at(0, "battlefield", "Wastes", "Wastes", "Wastes"), at(0, "hand", "Cloud Key")],
    steps: [{tap: "Wastes"}, {tap: "Wastes"}, {tap: "Wastes"}, {cast: "Cloud Key"}, {resolve: true}], expect: [{asks: {seat: 0, options: ["Artifact", "Creature", "Enchantment", "Instant", "Sorcery"]}}]}, cards.definition, fixtures).passed.length, 1,
    "Cloud Key: the five it names");
}
{
  /* Each permanent its own choice: one Banner on Elf, one on Goblin. */
  const s = table();
  put(s, card("Patchwork Banner"), 0, "battlefield", "Elf"); put(s, card("Patchwork Banner"), 0, "battlefield", "Goblin");
  const elf = put(s, ELF, 0), goblin = put(s, GOBLIN, 0), hers = put(s, ELF, 1);
  eq([characteristicsOf(s, elf).power, characteristicsOf(s, goblin).power, characteristicsOf(s, hers).power], [2, 2, 1], "his Elf by one Banner, his Goblin by the other, Maya's Elf by neither");
  /* "This creature is the chosen type": an Adaptive Automaton on Elf is an Elf. */
  const automaton = put(s, card("Adaptive Automaton"), 0, "battlefield", "Elf");
  eq(characteristicsOf(s, automaton).types.includes("Elf"), true, "the Automaton is an Elf too");
  /* Its last known information keeps the choice. */
  eq(lastKnown(s, automaton).chosen, "Elf", "as it last was: Elf chosen");
}
{
  /* A rules static (Urza's Incubator, anyone's spells), a trigger's filter (Vanquisher's Banner) -- each its own choice. */
  const s = table();
  put(s, card("Urza's Incubator"), 1, "battlefield", "Goblin");
  const goblin = put(s, {...GOBLIN, manaCost: "{2}"}, 0, "hand"), elf = put(s, {...ELF, manaCost: "{2}"}, 0, "hand");
  eq([costReduction(s, 0, goblin), costReduction(s, 0, elf)], [2, 0], "Maya's Incubator on Goblin: Rob's Goblin spell {2} less, his Elf not");
  /* The other rules statics read it the same way: "spells of the chosen type cost {1} more", "creatures of the chosen type
     can't be blocked". */
  put(s, {card: "Tithe", types: ["Enchantment"], abilities: [{id: "c", kind: "static", text: "Spells of the chosen type cost {1} more.", rule: "spells-cost-more", affects: {subtypes: ["$chosen"]}, amount: 1}]}, 1, "battlefield", "Elf");
  eq([costIncrease(s, 0, goblin), costIncrease(s, 0, elf)], [0, 1], "Maya's Tithe on Elf: his Elf spell {1} more, his Goblin not");
  put(s, {card: "Veil", types: ["Enchantment"], abilities: [{id: "v", kind: "static", text: "Creatures you control of the chosen type can't be blocked.", rule: "cant-be-blocked", affects: {what: "permanent", types: ["Creature"], controller: "you", subtypes: ["$chosen"]}}]}, 0, "battlefield", "Goblin");
  eq([ruleChanged(s, "cant-be-blocked", put(s, GOBLIN, 0)), ruleChanged(s, "cant-be-blocked", put(s, ELF, 0))], [true, false], "his Veil on Goblin: his Goblin can't be blocked, his Elf can");
  /* Vanquisher's Banner on Elf: his Elf spell draws, his Goblin spell does not. */
  const triggered = (subtype) => {
    const t = table();
    for (let i = 0; i < 6; i += 1) addObject(t, {...WASTES, owner: 0, controller: 0}, "library", 0), addObject(t, {...WASTES, owner: 1, controller: 1}, "library", 1);
    put(t, card("Vanquisher's Banner"), 0, "battlefield", "Elf");
    put(t, {card: subtype, types: ["Creature"], subtypes: [subtype], manaCost: "{C}", power: 1, toughness: 1}, 0, "hand"); put(t, WASTES, 0);
    beginGame(t); for (let n = 0; n < 50 && !(t.phase === "MAIN1" && t.priorityPlayer === 0); n += 1) advance(t);
    applyAction(t, 0, legalActions(t, 0).find((a) => a.kind === "activate-mana"));
    applyAction(t, 0, legalActions(t, 0).find((a) => a.kind === "cast" && a.label === subtype));
    return t.stack.filter((e) => e.kind === "trigger").length;
  };
  eq([triggered("Elf"), triggered("Goblin")], [1, 0], "an Elf spell: the Banner triggers; a Goblin: not");
  /* Its activated abilities' effects, read as they resolve: "{1}: draw a card for each creature you control of the chosen type" --
     two Elves and a Goblin: two cards. */
  const LANTERN = {types: ["Artifact"], manaCost: "{1}", abilities: [
    {id: "r", kind: "replacement", text: "As this artifact enters, choose a creature type.", watches: {event: "enters", who: "self"}, change: {choose: "creature type"}},
    {id: "t", kind: "activated", text: "{1}: Draw a card for each creature you control of the chosen type.", cost: [{atom: "mana", cost: "{1}"}],
      effects: [{effect: "draw", count: {count: {what: "permanent", types: ["Creature"], controller: "you", subtypes: ["$chosen"]}}}]}]};
  eq(runScenario({name: "lantern", setup: [at(0, "battlefield", "Wastes", "Wastes", "Elf", "Elf", "Goblin"), at(0, "hand", "Lantern")],
    steps: [{tap: "Wastes"}, {cast: "Lantern"}, {resolve: true}, {choose: ["Elf"]}, {tap: "Wastes"}, {activate: "Lantern"}, {resolve: true}],
    expect: [{seat: 0, zone: "hand", count: 2}]}, cards.definition, {Lantern: LANTERN, Elf: {...ELF, manaCost: "{G}"}, Goblin: {...GOBLIN, manaCost: "{R}"}}).passed.length, 1, "Elf chosen: two cards for his two Elves");
}
{
  /* A replacement watching others enter (Metallic Mimic on Elf): his Elf, not his Goblin, not Maya's Elf. */
  const s = table();
  put(s, card("Metallic Mimic"), 0, "battlefield", "Elf");
  const counters = (o, seat) => { const id = put(s, o, seat, "hand"); return enteringModifications(s, {objectId: id, player: seat, types: o.types}).counters["+1/+1"] ?? 0; };
  eq([counters(ELF, 0), counters(GOBLIN, 0), counters(ELF, 1)], [1, 0, 0], "his Elf enters with a counter; his Goblin and Maya's Elf without");
  /* A cost of the chosen type (Etchings of the Chosen on Elf): his Elf offered to sacrifice, his Goblin not. */
  const t = table();
  for (let i = 0; i < 6; i += 1) addObject(t, {...WASTES, owner: 0, controller: 0}, "library", 0), addObject(t, {...WASTES, owner: 1, controller: 1}, "library", 1);
  const etchings = put(t, card("Etchings of the Chosen"), 0, "battlefield", "Elf");
  put(t, ELF, 0); put(t, GOBLIN, 0); put(t, WASTES, 0);
  beginGame(t); for (let n = 0; n < 50 && !(t.phase === "MAIN1" && t.priorityPlayer === 0); n += 1) advance(t);
  applyAction(t, 0, legalActions(t, 0).find((a) => a.kind === "activate-mana"));
  eq([...new Set(legalActions(t, 0).filter((a) => a.kind === "activate" && a.objectId === etchings).flatMap((a) => a.costNames))], ["Elf"], "only the Elf offered as the sacrifice");
}
{
  /* Read as it last was: "whenever a creature you control of the chosen type dies" on a Keeper dying with them -- an Elf
     dying beside it triggers it, a Goblin does not. */
  const KEEPER = {card: "Keeper", types: ["Creature"], subtypes: ["Human"], power: 1, toughness: 1, abilities: [{id: "k", kind: "triggered", text: "Whenever a creature you control of the chosen type dies, you gain 1 life.",
    trigger: {on: "GameEventCardChangeZone", from: "Battlefield", to: "Graveyard", who: "any", filter: {types: ["Creature"], controller: "you", subtypes: ["$chosen"]}}, effects: [{effect: "gainLife", amount: 1}]}]};
  const dyingWith = (o) => { const s = table(); const keeper = put(s, KEEPER, 0, "battlefield", "Elf"), other = put(s, o, 0);
    s.pendingTriggers = []; collectTriggers(s, runEffects(s, [{effect: "destroy", targets: [keeper, other]}], {controller: 0, source: null})); return s.pendingTriggers.length; };
  eq([dyingWith(ELF), dyingWith(GOBLIN)], [1, 0], "an Elf dying with the Keeper: once; a Goblin: not");
}
{
  /* "Triggers an additional time" of the chosen type (Roaming Throne on Elf): his Elf's arrival trigger twice, a Goblin's once. */
  const SEER = (subtype) => ({types: ["Creature"], subtypes: [subtype], manaCost: "{1}", power: 1, toughness: 1,
    abilities: [{id: "t", kind: "triggered", text: "When this creature enters, you gain 1 life.", trigger: {on: "GameEventCardChangeZone", to: "Battlefield", who: "self"}, effects: [{effect: "gainLife", amount: 1}]}]});
  const fixtures = {Elf: SEER("Elf"), Goblin: SEER("Goblin")};
  const life = (subtype, total) => runScenario({name: "throne", setup: [at(0, "battlefield", ...Array(5).fill("Wastes")), at(0, "hand", "Roaming Throne", subtype), at(1, "graveyard", "Elf")],
    steps: [{tap: "Wastes"}, {tap: "Wastes"}, {tap: "Wastes"}, {tap: "Wastes"}, {cast: "Roaming Throne"}, {resolve: true}, {choose: ["Elf"]}, {tap: "Wastes"}, {cast: subtype}, {resolve: true}, {settle: true}],
    expect: [{seat: 0, life: total}]}, cards.definition, fixtures).passed.length;
  eq([life("Elf", 42), life("Goblin", 41)], [1, 1], "his Elf: 2 life, its trigger twice; his Goblin: 1, once");
  /* A condition on the choice: Windcrag Siege's Mardu doubles what an attack triggers only when Mardu was chosen. */
  const HERALD = {types: ["Enchantment"], abilities: [{id: "h", kind: "triggered", text: "Whenever a creature you control attacks, you gain 1 life.",
    trigger: {on: "GameEventAttackersDeclared", who: "any", filter: {types: ["Creature"], controller: "you"}}, effects: [{effect: "gainLife", amount: 1}]}]};
  const siege = (mode, total) => runScenario({name: "siege", setup: [at(0, "battlefield", "Mountain", "Plains", "Wastes", "Bear", "Herald"), at(0, "hand", "Windcrag Siege")],
    steps: [{tap: "Mountain"}, {tap: "Plains"}, {tap: "Wastes"}, {cast: "Windcrag Siege"}, {resolve: true}, {choose: [mode]}, {attack: ["Bear"]}, {settle: true}],
    expect: [{seat: 0, life: total}]}, cards.definition, {Herald: HERALD, Bear: {types: ["Creature"], manaCost: "{1}{G}", colors: ["G"], power: 2, toughness: 2}}).passed.length;
  eq([siege("Mardu", 42), siege("Jeskai", 41)], [1, 1], "Mardu: the Herald twice, 2 life; Jeskai: once, 1");
  /* And its Jeskai upkeep only when Jeskai: Mardu chosen, no Goblin at his next upkeep. */
  eq(runScenario({name: "mardu", setup: [at(0, "battlefield", "Mountain", "Plains", "Wastes"), at(0, "hand", "Windcrag Siege")],
    steps: [{tap: "Mountain"}, {tap: "Plains"}, {tap: "Wastes"}, {cast: "Windcrag Siege"}, {resolve: true}, {choose: ["Mardu"]}, {to: {turn: 3, phase: "MAIN1"}}],
    expect: [{seat: 0, zone: "battlefield", cards: ["Mountain", "Plains", "Wastes", "Windcrag Siege"]}]}, cards.definition, {}).passed.length, 1, "Mardu chosen: no Goblin at his upkeep");
  eq([conditionHolds(table(), {chosen: "Mardu"}, {controller: 0, source: null}), conditionProblems({chosen: 5}).length], [false, 1], "no source, no choice; a choice that is not a name refused");
}
{
  /* Before anything is chosen, "$chosen" names no type at all. */
  eq([withChosen({subtypes: ["$chosen"]}).subtypes[0], chosenFor({subtypes: ["$chosen"]}, {chosen: "Elf"}).subtypes[0]], [NONE_CHOSEN, "Elf"], "none chosen: a name no card has; chosen: Elf");
  eq(missingFor({keywords: ["ETBReplacement"]}).length, 1, "the catalog keeps ETBReplacement unbuilt: its other forms (a color, a player, a card name, a copy) are not");
}

console.log(`engine-chosen: ${checks} checks passed — asked as it enters, the game's creature types or the options named; each permanent its own choice, read by its layers, rules statics, triggers, costs and replacements; triggers again of it; a condition on it; none chosen matches nothing.`);
