/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* SPLIT SECOND (CR 702.61; Siege Smash, Train C phase 2).
 *
 * While a spell with split second is on the stack, players can't cast other spells or activate abilities that aren't mana
 * abilities (702.61a): rules/actions.mjs offers every player passing, mana abilities and special actions -- a face-down
 * permanent turned face up -- and nothing else, and no spell is cast as an effect resolves (castChoicesNow). Triggered
 * abilities trigger and go on the stack as ever (702.61b). Read on the spell as it is on the stack (keywords/timing.mjs,
 * splitSecondOnStack); gone from it, and everything is offered again.
 */
import {legalActions, castChoicesNow} from "../game/engine/rules/actions.mjs";
import {splitSecondOnStack} from "../game/engine/keywords/timing.mjs";
import {play, happen, at, compiled, keywordBuilt, index, checks} from "./helpers/x11-keywords.mjs";

const {eq, ok, done} = checks("engine-split-second");
const SS = "Siege Smash";
const shock = {types: ["Instant"], manaCost: "{R}", colors: ["R"], spell: {id: "s", text: "Shock deals 2 damage to any target.",
  targets: [{anyOf: [{what: "permanent", types: ["Creature"]}, {what: "player"}]}], effects: [{effect: "dealDamage", amount: 2, targets: {target: 0}, who: {target: 0}}]}};
const watcher = compiled([{kind: "triggered", text: "Whenever a player casts a spell, you gain 1 life.", trigger: {on: "spell cast", caster: "any"}, effects: [{effect: "gainLife", amount: 1}]}],
  {name: "Watcher", types: ["Enchantment"], manaCost: "{1}", colors: [], power: null, toughness: null});
const FIX = {Shock: shock, Watcher: {...watcher.definition, card: "Watcher"},
  "Life Rock": {types: ["Artifact"], manaCost: "{1}", colors: [], abilities: [{id: "g", kind: "activated", text: "{1}: You gain 1 life.", cost: [{atom: "mana", cost: "{1}"}], targets: [], effects: [{effect: "gainLife", amount: 1}]}]},
  Ox: {types: ["Creature"], subtypes: ["Ox"], manaCost: "{R}", colors: ["R"], power: 3, toughness: 3}};
const kinds = (s, seat) => [...new Set(legalActions(s, seat).map((a) => a.kind))].sort();
const SMASH = [{tap: "Mountain"}, {tap: "Wastes"}, {cast: SS, modes: [1], targets: [{card: "Bear"}]}];

eq(watcher.problems, [], "the Watcher fixture compiles");
{
  /* Four players: on the stack, each in turn is offered only passing and its lands' mana. */
  const s = play([at(0, "hand", SS), at(0, "battlefield", "Mountain", "Wastes", "Bear"),
    ...[1, 2, 3].map((seat) => at(seat, "battlefield", "Mountain", "Life Rock")), ...[1, 2, 3].map((seat) => at(seat, "hand", "Shock"))], [...SMASH, {pass: 1}], {seats: 4}, FIX);
  ok(splitSecondOnStack(s), "Siege Smash on the stack: split second holds");
  eq(kinds(s, 1), ["activate-mana", "pass"], "Maya, with Shock in hand and an untapped Life Rock: passing and her Mountain's mana only");
  const t = play([at(0, "hand", SS), at(0, "battlefield", "Mountain", "Wastes", "Bear"),
    ...[1, 2, 3].map((seat) => at(seat, "battlefield", "Mountain", "Life Rock")), ...[1, 2, 3].map((seat) => at(seat, "hand", "Shock"))], [...SMASH, {pass: 2}], {seats: 4}, FIX);
  eq(kinds(t, 2), ["activate-mana", "pass"], "Trey too, the next player in turn");
  eq(castChoicesNow(t, 2, t.zones.hand[2][0]), [], "and no spell is cast as an effect resolves while it is there");
}
{
  /* Its own caster as well: "players", every one (702.61a) -- Rob holds priority after casting it. */
  const s = play([at(0, "hand", SS, "Shock"), at(0, "battlefield", "Mountain", "Wastes", "Bear", "Mountain", "Life Rock", "Wastes")], SMASH, {}, FIX);
  eq(kinds(s, 0), ["activate-mana", "pass"], "Rob, who cast it, may not cast his Shock or use his Life Rock either");
}
{
  /* Triggered abilities trigger and are put on the stack as normal (702.61b): above it, and they resolve first. */
  const s = play([at(0, "hand", SS), at(0, "battlefield", "Mountain", "Wastes", "Bear", "Watcher")], [...SMASH], {}, FIX);
  eq(s.stack.length, 2, "the Watcher's trigger went on the stack above Siege Smash");
  const t = play([at(0, "hand", SS), at(0, "battlefield", "Mountain", "Wastes", "Bear", "Watcher")], [...SMASH, {resolve: true}], {}, FIX);
  eq([t.players[0].life, t.stack.length, splitSecondOnStack(t)], [41, 1, true], "it resolved -- Rob at 41 -- and Siege Smash is still there, still holding");
}
{
  /* Special actions stay open (702.61b): a face-down permanent turned face up. */
  const t = play([at(0, "hand", SS), at(0, "battlefield", "Mountain", "Wastes", "Bear", "Mountain")], [...SMASH], {library: ["Ox"]}, FIX);
  happen(t, {effect: "manifest", who: "you"}, {controller: 0, source: null});
  t.players[0].manaPool.R = 1;
  ok(t.zones.battlefield.some((id) => t.objects[id].faceDown === true), "a card manifested beneath the Smash");
  eq(kinds(t, 0), ["activate-mana", "pass", "turn-face-up"], "Rob may still turn it face up for {R}: a special action");
}
{
  /* Gone from the stack, everything is offered again. */
  const s = play([at(0, "hand", SS, "Shock"), at(0, "battlefield", "Mountain", "Wastes", "Bear", "Mountain", "Life Rock", "Wastes")], [...SMASH, {resolve: true}, {tap: "Mountain"}], {}, FIX);
  ok(!splitSecondOnStack(s), "resolved: no split second");
  eq(kinds(s, 0), ["activate", "activate-mana", "cast", "pass"], "Rob may cast Shock and use the Life Rock again");
}
{
  /* A spell without it holds nothing: Shock on the stack, and the Watcher's trigger above it -- an ability, no object of its
     own to read -- and Maya may answer. */
  const s = play([at(0, "hand", "Shock"), at(0, "battlefield", "Mountain", "Bear", "Watcher"), at(1, "hand", "Shock"), at(1, "battlefield", "Mountain")],
    [{tap: "Mountain"}, {cast: "Shock", targets: [{player: 1}]}, {pass: 1}, {tap: "Mountain", seat: 1}], {}, FIX);
  eq(s.stack.map((e) => e.kind), ["spell", "trigger"], "Shock, and the Watcher's trigger above it");
  ok(!splitSecondOnStack(s) && legalActions(s, 1).some((a) => a.kind === "cast"), "Shock on the stack: Maya may cast her own");
}
eq(index.definition(SS).keywords, ["Split Second"], `${SS}'s keyword`);
ok(keywordBuilt("Split second"), "Split second is built (keywords/timing.mjs, the timing family)");
ok(index.resolve(SS)?.playable === true, `${SS} is defined and playable`);

done("split second: nothing cast and no ability but a mana ability activated while it is on the stack, its caster included; triggers and special actions go on.");
