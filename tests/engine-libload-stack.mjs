/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* THE STACK AND CONTROL (library load L2, 2026-10-21): what the cards' scenarios cannot reach.
 *
 * Spree (CR 702.172a; Explosive Derailment): each choice of one or more modes a cast of its own, their costs added, and the
 * compiler's guards. "You may cast this spell as though it had flash if it targets a commander" (Timely Ward,
 * `flash-if-targets`): its guards. The selector grammar's `targeting` (Rebuff the Wicked) and `attacking: "you"` (Mangara,
 * the Diplomat). "Your opponents can't cast spells this turn" (Silence) at a table of four.
 */
import {legalActions} from "../game/engine/rules/actions.mjs";
import {compileSelector} from "../game/engine/script/filter.mjs";
import {play, at, compiled, keywordBuilt, index, checks} from "./helpers/x11-keywords.mjs";

const {eq, ok, throws, done} = checks("engine-libload-stack");
const ED = "Explosive Derailment";
const FIX = {Ogre: {types: ["Creature"], subtypes: ["Ogre"], manaCost: "{3}{R}", colors: ["R"], power: 4, toughness: 4},
  Tonic: {types: ["Instant"], manaCost: "{C}", colors: [], spell: {id: "s", text: "You gain 1 life.", targets: [], effects: [{effect: "gainLife", amount: 1}]}}};
const casts = (s, card, seat = 0) => legalActions(s, seat).filter((a) => a.kind === "cast" && s.objects[a.objectId].card === card);

/* SPREE: each set of modes offered once, with what its modes add. */
{
  const summary = (lands) => [...new Set(casts(play([at(0, "hand", ED), at(0, "battlefield", ...lands), at(1, "battlefield", "Ogre", "Relic")],
    lands.map((l) => ({tap: l})), {}, FIX), ED).map((a) => `${a.modes.join("+")}:${a.extraMana}`))].sort();
  eq(summary(["Mountain"]), [], "{R} alone: no mode paid for, and no cast -- one or more modes (CR 702.172a)");
  eq(summary(["Mountain", "Wastes", "Wastes"]), ["0:{2}", "1:{2}"], "{2}{R}: either mode alone, its {2} added");
  eq(summary(["Mountain", "Wastes", "Wastes", "Wastes", "Wastes"]), ["0+1:{2}{2}", "0:{2}", "1:{2}"], "{4}{R}: both too, both costs added");
  const both = play([at(0, "hand", ED), at(0, "battlefield", "Mountain", "Wastes", "Wastes", "Wastes", "Wastes"), at(1, "battlefield", "Ogre", "Relic")],
    [..."MWWWW"].map((c) => ({tap: c === "M" ? "Mountain" : "Wastes"})).concat([{cast: ED, modes: [0, 1], targets: [{card: "Ogre"}, {card: "Relic"}]}]), {}, FIX);
  eq([both.stack.length, both.stack[0]?.modes], [1, [0, 1]], "cast with both modes: on the stack with both");
  eq(Object.values(both.players[0].manaPool).reduce((a, b) => a + b, 0), 0, "all five mana paid: {R}, and {2} for each mode");
}
const mode = (text, more) => ({text, targets: [], effects: [{effect: "draw", count: 1}], ...more});
const spell = (effect) => ({kind: "spell", text: "x", effects: [effect]});
const spree = {kind: "keyword", text: "Spree", keyword: "spree"};
const instant = {types: ["Instant"], power: null, toughness: null};
const modal = (modes, more = {}) => ({effect: "modal", choose: 1, chooseUpTo: modes.length, modes, ...more});
eq(compiled([spree, spell(modal([mode("a", {cost: "{1}"}), mode("b", {cost: "{2}{U}"})]))], instant).problems, [], "spree, each mode with its cost, one or more of them: fine");
ok(compiled([spree, spell(modal([mode("a", {cost: "{1}"}), mode("b")]))], instant).problems.some((p) => p.includes("Spree: each mode says its cost")), "a mode without its cost is refused");
ok(compiled([spree, spell(modal([mode("a", {cost: "{X}"}), mode("b", {cost: "{1}"})]))], instant).problems.some((p) => p.includes("Spree: each mode says its cost")), "a cost with X is refused");
ok(compiled([spree, spell({effect: "modal", choose: 1, modes: [mode("a", {cost: "{1}"}), mode("b", {cost: "{1}"})]})], instant).problems
  .some((p) => p.includes("Spree is on a spell whose modes are chosen")), "spree on \"choose one\" is refused: one or more");
ok(compiled([spree, spell(modal([mode("a", {cost: "{1}"}), mode("b", {cost: "{1}"}), mode("c", {cost: "{1}"})], {chooseUpTo: 2}))], instant).problems
  .some((p) => p.includes("Spree is on a spell whose modes are chosen")), "spree on \"choose one or two\" of three is refused: any of its modes");
ok(compiled([spree, spell({effect: "draw", count: 1})], instant).problems.some((p) => p.includes("Spree is on a spell whose modes are chosen")), "spree on a spell with no modes is refused");
ok(compiled([spell(modal([mode("a", {cost: "{1}"}), mode("b", {cost: "{1}"})]))], instant).problems.some((p) => p.includes("tiered's or spree's")), "a mode's cost without spree or tiered is refused");
const defined = index.definition(ED);
eq([defined.keywords, defined.spell.additionalCost], [["Spree"], [{atom: "spree", costs: ["{2}", "{2}"]}]], `${ED}: its keyword, and its modes' costs among its additional costs`);
ok(keywordBuilt("Spree"), "Spree is built (keywords/timing.mjs, the pay family)");

/* FLASH IF IT TARGETS (Timely Ward): its targets chosen as it is offered, so a spell with targets, none counted, and no modes. */
const aura = {types: ["Enchantment"], subtypes: ["Aura"], power: null, toughness: null};
const flashIf = (more = {}) => ({kind: "static", text: "flash if it targets a commander", rule: "flash-if-targets", targeting: {types: ["Creature"], commander: true}, affects: {what: "card", self: true}, ...more});
const enchant = {kind: "keyword", text: "Enchant creature", keyword: "enchant", target: {what: "permanent", types: ["Creature"]}};
eq(compiled([flashIf(), enchant], aura).problems, [], "on an Aura, which targets what it will enchant: fine");
ok(compiled([flashIf(), spell({effect: "draw", count: 1})], instant).problems.some((p) => p.includes("flash for what it targets")), "on a spell with no targets: refused");
ok(compiled([flashIf(), {kind: "spell", text: "x", targets: [{what: "permanent", types: ["Creature"], count: {min: 0}}], effects: [{effect: "tap", targets: {target: 0}}]}], instant).problems
  .some((p) => p.includes("flash for what it targets")), "on a spell whose target is counted: refused");
ok(compiled([flashIf({targeting: undefined}), enchant], aura).problems.some((p) => /targeting/.test(p)), "without saying what it must target: refused");
eq(index.definition("Timely Ward").abilities.filter((a) => a.rule === "flash-if-targets").map((a) => a.targeting), [{types: ["Creature"], commander: true}], "Timely Ward: a commander, a creature");

/* THE SELECTOR GRAMMAR. */
throws(() => compileSelector({what: "permanent", targeting: {controller: "you"}}), /targeting is a spell's/, "targeting on a permanent: refused");
throws(() => compileSelector({what: "spell", targeting: {what: "player"}}), /targeting is a spell's/, "targeting a player: refused (a permanent's selector)");
throws(() => compileSelector({what: "permanent", attacking: "them"}), /attacking: true, or attacking: "you"/, "attacking anyone but you: refused");
ok(typeof compileSelector({what: "spell", targeting: {what: "permanent", controller: "you"}}) === "function" && typeof compileSelector({what: "permanent", attacking: "you"}) === "function",
  "a spell that targets a permanent you control, and a creature attacking you: both said");

/* SILENCE AT FOUR: all three of Rob's opponents, each with mana and an instant, offered nothing; Rob his own. */
{
  const s = play([at(0, "hand", "Silence", "Tonic"), at(0, "battlefield", "Plains", "Wastes"), ...[1, 2, 3].flatMap((p) => [at(p, "hand", "Tonic"), at(p, "battlefield", "Wastes")])],
    [{tap: "Plains"}, {cast: "Silence"}, {resolve: true}, {tap: "Wastes"}], {seats: 4}, FIX);
  eq(casts(s, "Tonic").length, 1, "Rob may still cast his Tonic");
  eq(s.effects.filter((e) => e.rule === "cant-cast").map((e) => e.players), [[1, 2, 3]], "the three opponents, and not Rob, can't cast spells this turn");
}

done("library load L2: spree, flash for what a spell targets, a spell that targets a permanent you control, creatures attacking you, Silence at four.");
