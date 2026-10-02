/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* M4 PHASE 3, BATCH 48 (THE CATALOG'S ORDER): WHAT AN EFFECT MOVED, REMEMBERED (Forge's RememberChanged), AND A CONDITION
 * ABOUT A NAMED OBJECT (Forge's ConditionDefined).
 *
 * A search remembers what it found ("untap that land"), and may choose from what an earlier effect moved ("a creature
 * card from among them") -- which it must, from cards face up. moveZone takes the top cards of a library, a player's,
 * revealed if it says. "Its mana value" reads what was moved. "If it would leave the battlefield, exile it instead" stays
 * with that permanent, and not with what it becomes. A condition may ask about the card remembered, a target, or "that
 * card": "if it was a creature card", "if it's blue". And a layer static's `affects` reads supertypes now -- any key its
 * matcher does not read is refused, not ignored.
 */
import assert from "node:assert/strict";
import {createState, addObject} from "../game/engine/state/index.mjs";
import {awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {runEffects} from "../game/engine/script/effects/index.mjs";
import {beginResolution} from "../game/engine/script/resolution.mjs";
import {conditionHolds, conditionProblems} from "../game/engine/script/condition.mjs";
import {compileScript} from "../game/engine/cards/index.mjs";

let checks = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const WASTES = {card: "Wastes", types: ["Land"], supertypes: ["Basic"], abilities: [{id: "a0", kind: "mana", tapSelf: true, produces: {C: 1}}]};
const BEAR = {card: "Bear", types: ["Creature"], manaCost: "{1}{G}", colors: ["G"], power: 2, toughness: 2};
const OGRE = {card: "Ogre", types: ["Creature"], manaCost: "{3}{R}", colors: ["R"], power: 4, toughness: 4};
const BOLT = {card: "Bolt", types: ["Instant"], manaCost: "{R}", colors: ["R"]};
const table = () => createState({matchId: "m", seed: "remembered", players: [{name: "Rob"}, {name: "Maya"}]});
const put = (s, o, seat, zone) => addObject(s, {...o, owner: seat, controller: seat}, zone, ["battlefield", "exile"].includes(zone) ? null : seat);
const names = (s, ids) => ids.map((id) => s.objects[id].card);
const you = {controller: 0, source: null};

{
  /* A search that remembers: "untap that land". Without `remember`, nothing is remembered to untap. */
  const s = table();
  put(s, WASTES, 0, "library"); put(s, WASTES, 0, "library");
  beginResolution(s, [{effect: "chooseCard", zone: "library", selector: {types: ["Land"]}, to: "battlefield", tapped: true, remember: true}, {effect: "untap", targets: "remembered"}], you);
  resolveAwaiting(s, [0]);
  eq(s.zones.battlefield.map((id) => s.objects[id].tapped), [false], "found, put onto the battlefield tapped, and untapped: the land it found");
  const t = table();
  put(t, WASTES, 0, "library");
  beginResolution(t, [{effect: "chooseCard", zone: "library", selector: {types: ["Land"]}, to: "battlefield", tapped: true}, {effect: "untap", targets: "remembered"}], you);
  resolveAwaiting(t, [0]);
  eq(t.zones.battlefield.map((id) => t.objects[id].tapped), [true], "without remembering: it stays tapped");
}
{
  /* The top cards of Maya's library, exiled and remembered; a creature card from among them -- not the Ogre already in
     exile -- and one must be chosen; under Rob's control. */
  const s = table();
  for (const o of [BOLT, BEAR, WASTES, OGRE]) put(s, o, 1, "library");
  const old = put(s, OGRE, 1, "exile");
  beginResolution(s, [{effect: "moveZone", fromTop: 3, who: [1], to: "exile", remember: true},
    {effect: "chooseCard", zone: "exile", among: "remembered", selector: {types: ["Creature"]}, to: "battlefield", controller: "you"}], you);
  eq([names(s, s.zones.exile).sort(), names(s, s.zones.library[1])], [["Bear", "Bolt", "Ogre", "Wastes"], ["Ogre"]], "her top three exiled -- Bolt, Bear, Wastes -- and her fourth card stays");
  const choice = awaitingChoice(s);
  eq([choice.options.map((o) => o.label), choice.min], [["Bear"], 1], "the question: the Bear, from among them -- not the Ogre exiled before -- and it must be chosen");
  resolveAwaiting(s, [0]);
  const bear = s.zones.battlefield.find((id) => s.objects[id].card === "Bear");
  eq([s.objects[bear].owner, s.objects[bear].controller, s.zones.exile.includes(old)], [1, 0, true], "her Bear, on the battlefield under Rob's control");
}
{
  /* Revealed if it says; "its mana value" is the remembered card's. */
  const s = table();
  put(s, OGRE, 0, "library"); put(s, WASTES, 0, "library");
  const {events} = beginResolution(s, [{effect: "moveZone", fromTop: 1, to: "hand", reveal: true, remember: true}, {effect: "loseLife", amount: {manaValueOf: "remembered"}}], you);
  eq([names(s, s.zones.hand[0]), events.filter((e) => e.kind === "GameEventCardRevealed").length, s.players[0].life], [["Ogre"], 1, 36], "the Ogre, revealed and put into his hand: he loses 4");
  runEffects(s, [{effect: "moveZone", fromTop: 1, to: "hand"}], you);
  eq(names(s, s.zones.hand[0]).sort(), ["Ogre", "Wastes"], "not revealed when it does not say: the next card, quietly");
}
{
  /* "If it would leave the battlefield, exile it instead": destroyed or bounced, exiled. What it becomes keeps nothing. */
  const s = table();
  const bear = put(s, BEAR, 0, "graveyard");
  runEffects(s, [{effect: "moveZone", targets: [bear], to: "battlefield", exileIfLeaves: true}], you);
  const back = s.zones.battlefield[0];
  runEffects(s, [{effect: "destroy", targets: [back]}], you);
  eq([names(s, s.zones.exile), names(s, s.zones.graveyard[0])], [["Bear"], []], "destroyed: exiled instead");
  const t = table();
  runEffects(t, [{effect: "moveZone", targets: [put(t, BEAR, 0, "graveyard")], to: "battlefield", exileIfLeaves: true}], you);
  runEffects(t, [{effect: "moveZone", targets: [t.zones.battlefield[0]], to: "hand"}], you);
  eq([names(t, t.zones.exile), names(t, t.zones.hand[0])], [["Bear"], []], "returned to his hand: exiled instead");
  const exiled = t.zones.exile[0];
  runEffects(t, [{effect: "moveZone", targets: [exiled], to: "battlefield"}], you);
  runEffects(t, [{effect: "destroy", targets: [t.zones.battlefield[0]]}], you);
  eq(names(t, t.zones.graveyard[0]), ["Bear"], "back from exile it is a new object (CR 400.7): destroyed, to the graveyard");
}
{
  /* A named object: remembered, a target, "that card" -- read where it is now. */
  const s = table();
  const bear = put(s, BEAR, 1, "exile"), bolt = put(s, BOLT, 1, "exile");
  const creature = {about: "remembered", is: {types: ["Creature"]}};
  eq([conditionHolds(s, creature, {controller: 0, remembered: [bear]}), conditionHolds(s, creature, {controller: 0, remembered: [bolt]}), conditionHolds(s, creature, {controller: 0, remembered: []})],
    [true, false, false], "remembered: the Bear is a creature card, the Bolt is not, and nothing remembered is not");
  const drake = put(s, {card: "Drake", types: ["Creature"], colors: ["U"]}, 1, "battlefield");
  const blue = {about: "target", is: {colors: ["U"]}};
  eq([conditionHolds(s, blue, {controller: 0, targets: [{kind: "object", id: drake}]}), conditionHolds(s, blue, {controller: 0, targets: [{kind: "object", id: bear}]}), conditionHolds(s, blue, {controller: 0, targets: [null]})],
    [true, false, false], "a target: the Drake is blue, the Bear is not, and a target gone is not");
  eq(conditionHolds(s, {about: "that card", is: {types: ["Creature"]}}, {controller: 0, about: {card: drake}}), true, "\"that card\": the trigger's subject");
  eq([conditionProblems({about: "remembered"}).length > 0, conditionProblems({about: "it", is: {}}).length > 0, conditionProblems(creature)], [true, true, []], "the schema: both keys, and a known object");
}
{
  /* A layer static's affects reads supertypes; a key the layers' matcher does not read is refused. */
  const script = (affects) => ({schema: "CrankCardScript@1", identity: {name: "Banner", oracleId: "x", types: ["Enchantment"], subtypes: [], manaCost: "{1}", colors: [], colorIdentity: [], power: null, toughness: null},
    oracleText: "Creatures you control get +1/+1.", source: "hand", abilities: [{kind: "static", text: "Creatures you control get +1/+1.", layer: 7, sublayer: "c", affects, apply: {power: 1, toughness: 1}}]});
  eq(compileScript(script({what: "permanent", types: ["Creature"], supertypes: ["Legendary"], controller: "you"})).problems, [], "supertypes: read");
  eq(compileScript(script({what: "permanent", types: ["Creature"], power: {min: 2}})).problems.some((p) => /no key "power"/.test(p)), true, "power: refused, not ignored");
}

console.log(`engine-remembered-moved: ${checks} checks passed — a search remembers; from among what was moved, chosen; the top of a library, revealed if it says; its mana value; exiled if it would leave; a named object's condition; a layer's affects read in full or refused.`);
