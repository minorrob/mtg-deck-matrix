/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* M4 PHASE 3, BATCH 38 (THE CATALOG'S ORDER): A STATIC ABILITY'S CONDITION (Forge's IsPresentStatic).
 *
 * "Creatures you control get +1/+0 and have vigilance as long as you control three or more creatures": a layer static
 * with a condition applies while the condition holds, asked again every time characteristics are derived -- so it comes
 * and goes with the permanents. A condition that counts creatures does not ask the layers forever: inside that count,
 * conditional statics are left out (they change keywords and power, never what is counted). And "as long as this card
 * is in your graveyard and you control a Mountain": a static that works from its owner's graveyard, there and nowhere
 * else, for its owner. A condition, or a graveyard, on a rule static is refused rather than silently always on.
 */
import assert from "node:assert/strict";
import {createState, addObject, moveObject} from "../game/engine/state/index.mjs";
import {keywordsOf, characteristicsOf} from "../game/engine/rules/layers.mjs";
import {compileScript} from "../game/engine/cards/index.mjs";
import {missingFor} from "../game/tools/engine-constructs.mjs";
import {loadCardIndex, loadCardScripts} from "../game/tools/engine-cards.mjs";
import {conditionHolds} from "../game/engine/script/condition.mjs";
import {compileSelector} from "../game/engine/script/filter.mjs";

let checks = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const cards = loadCardIndex();
const card = (name) => ({...cards.definition(name), card: name});
const s = createState({matchId: "m", seed: "static-conditions", players: [{name: "Rob"}, {name: "Maya"}]});
const on = (o, seat) => addObject(s, {...o, owner: seat, controller: seat}, "battlefield", null);
const BEAR = {card: "Bear", types: ["Creature"], power: 2, toughness: 2};
const pt = (id) => { const c = characteristicsOf(s, id); return [c.power, c.toughness]; };

{
  /* Jetmir: it comes and goes with the count. */
  on(card("Jetmir, Nexus of Revels"), 0);
  const bear = on(BEAR, 0);
  eq([pt(bear), keywordsOf(s, bear).includes("Vigilance")], [[2, 2], false], "two creatures: nothing");
  const third = on(BEAR, 0);
  eq([pt(bear), keywordsOf(s, bear).includes("Vigilance")], [[3, 2], true], "a third arrives: +1/+0 and vigilance, at once");
  on(BEAR, 1); on(BEAR, 1); on(BEAR, 1);
  eq(pt(bear), [3, 2], "Maya's creatures are not Rob's: still three");
  moveObject(s, third, "graveyard", 0);
  eq([pt(bear), keywordsOf(s, bear).includes("Vigilance")], [[2, 2], false], "the third gone: gone too");
}
{
  /* Two conditional statics whose conditions count creatures: the counting settles, it does not recurse. */
  on(card("Jetmir, Nexus of Revels"), 0);
  const many = Array.from({length: 8}, () => on(BEAR, 0));
  eq(pt(many[0]), [8, 2], "two Jetmirs and nine others of Rob's (eleven creatures): each Jetmir's three steps, +3/+0 each -- a 2/2 Bear is 8/2");
}
{
  /* Anger: from its owner's graveyard, with a Mountain, for its owner's creatures -- and nowhere else. */
  const t = createState({matchId: "m", seed: "anger", players: [{name: "Rob"}, {name: "Maya"}]});
  const put = (o, seat, zone) => addObject(t, {...o, owner: seat, controller: seat}, zone, zone === "battlefield" ? null : seat);
  const robs = put(BEAR, 0, "battlefield"), mayas = put(BEAR, 1, "battlefield");
  put({card: "Mountain", types: ["Land"], subtypes: ["Mountain"], supertypes: ["Basic"]}, 0, "battlefield");
  const anger = put(card("Anger"), 0, "hand");
  eq(keywordsOf(t, robs).includes("Haste"), false, "Anger in Rob's hand: nothing");
  const buried = moveObject(t, anger, "graveyard", 0);
  eq([keywordsOf(t, robs).includes("Haste"), keywordsOf(t, mayas).includes("Haste")], [true, false], "in Rob's graveyard, with his Mountain: his creatures have haste, Maya's do not");
  const exiled = moveObject(t, buried, "exile", null);
  eq(keywordsOf(t, robs).includes("Haste"), false, "exiled: nothing");
  moveObject(t, exiled, "battlefield", null);
  eq(keywordsOf(t, robs).includes("Haste"), false, "on the battlefield: only its own haste, which it has -- it gives none");
}
{
  /* What is refused, and the catalog. */
  const raptor = loadCardScripts().find(({script}) => script.identity.name === "Hulking Raptor").script;
  const withStatic = (ability) => { const script = structuredClone(raptor); script.abilities.push(ability); return compileScript(script).problems; };
  eq(withStatic({kind: "static", text: "Hulking Raptor", rule: "no-maximum-hand-size", affects: {what: "player"}, condition: {present: {what: "permanent", types: ["Land"]}, atLeast: 2}})
    .some((p) => /a condition or a graveyard on a rule static/.test(p)), true, "a condition on a rule static: refused, not always on");
  eq(withStatic({kind: "static", text: "Hulking Raptor", layer: 6, affects: {what: "permanent"}, apply: {addKeywords: ["Haste"]}, worksFrom: "exile"})
    .some((p) => /works from the battlefield, or from a graveyard/.test(p)), true, "a static that would work from exile: refused");
  eq(missingFor({options: ["IsPresentStatic"]}), [], "the catalog: a static's condition is built");
}

{
  const t = createState({matchId: "present-reads", seed: "quest", players: [{name: "Rob"}, {name: "Maya"}]});
  const put = (o, seat = 0) => addObject(t, {...o, owner: seat, controller: seat}, "battlefield", null);
  const q = put(card("Quest for the Goblin Lord"));
  const bears = Array.from({length: 48}, (_, n) => put(BEAR, n % 2));
  const selector = {what: "permanent", self: true, countersAtLeast: {counter: "quest", count: 5}};
  let validations = 0;
  const observed = new Proxy(selector, {ownKeys(value) {validations++; return Reflect.ownKeys(value);}});
  compileSelector(observed);
  const oneCompilation = validations;
  validations = 0;
  eq(conditionHolds(t, {present: observed}, {controller: 0, source: q}), false, "the actual Quest has no quest counters");
  eq(validations, oneCompilation, "one present query validates once, rather than once per battlefield candidate");
  const pt = id => {const c = characteristicsOf(t, id); return [c.power, c.toughness];};
  eq([pt(bears[0]), pt(bears[1])], [[2, 2], [2, 2]], "no Quest boost below its threshold");
  t.objects[q].counters.quest = 5;
  eq([conditionHolds(t, {present: selector}, {controller: 0, source: q}), pt(bears[0]), pt(bears[1])], [true, [4, 2], [2, 2]], "the same live source now boosts only its controller's creature");
  t.objects[q].counters.quest = 4;
  eq([pt(bears[0]), pt(bears[1])], [[2, 2], [2, 2]], "a later counter change invalidates the previous truth");
  const oracle = (c, context) => {
    const match = compileSelector(c.present), n = t.zones.battlefield.filter(id => match(t, id, context)).length;
    return n >= (c.atLeast ?? (c.atMost !== undefined ? 0 : 1)) && (c.atMost === undefined || n <= c.atMost);
  };
  const conditions = [{present: selector}, {present: selector, atMost: 0}, {present: selector, atLeast: 2},
    {present: {...selector, controller: "you"}}, {present: {...selector, zone: "graveyard"}},
    {present: {anyOf: [selector, {what: "permanent", types: ["Creature"], controller: "opponent"}]}},
    {present: {self: true, anyOf: [{self: false, types: ["Creature"]}]}, atLeast: 2},
    {present: {what: "permanent", types: ["Creature"], controller: "you"}, atLeast: 24}];
  for (const source of [q, String(q), null, {cardId: q}]) for (const controller of [0, 1]) for (const condition of conditions)
    eq(conditionHolds(t, condition, {source, controller}), oracle(condition, {source, controller}), "optimized query preserves selector/count/source/controller semantics");
  selector.self = false;
  t.objects[bears[0]].counters.quest = 6;
  eq(conditionHolds(t, {present: selector}, {source: q}), true, "mutating the selector causes a fresh whole-board query");
  selector.unknownPresentKey = true;
  assert.throws(() => conditionHolds(t, {present: selector}, {source: q}), /selector grammar has no key "unknownPresentKey"/); checks++;
  delete selector.unknownPresentKey; selector.self = true;
  const gone = moveObject(t, q, "graveyard", 0);
  t.objects[gone].counters = {quest: 5};
  eq(conditionHolds(t, {present: selector}, {source: gone}), false, "a source outside the battlefield is not a permanent present");
  t.zones.battlefield = [];
  assert.throws(() => conditionHolds(t, {present: {what: "permanent", self: true, unknownPresentKey: true}}, {source: gone}), /selector grammar has no key "unknownPresentKey"/); checks++;
}

console.log(`engine-static-conditions: ${checks} checks passed — live static conditions, exact self identity, bounded selector validation and fresh grammar checks.`);
