/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* M4 PHASE 3, BATCH 39 (THE CATALOG'S ORDER): AN ALTERNATIVE COST (CR 118.9).
 *
 * "If you control a commander, you may cast this spell without paying its mana cost"; "you may pay 1 life and exile a
 * blue card from your hand rather than pay this spell's mana cost". The card's own static: offered beside the cast that
 * pays the mana cost, only while its condition holds, life only for a player who has that much (CR 119.4), a card exiled
 * from the hand never the spell itself -- and never with another alternative (flashback, a free cast: 118.9a). And two
 * pieces its cards need: "nonblack", and a prevention effect read as damage is dealt ("creatures your opponents
 * control", a creature arriving later among them).
 */
import assert from "node:assert/strict";
import {createState, addObject} from "../game/engine/state/index.mjs";
import {beginGame, advance} from "../game/engine/rules/turn.mjs";
import {legalActions, applyAction} from "../game/engine/rules/actions.mjs";
import {selectMatching} from "../game/engine/script/filter.mjs";
import {runEffects} from "../game/engine/script/effects/index.mjs";
import {compileScript} from "../game/engine/cards/index.mjs";
import {offerDetails} from "../game/room/room.mjs";
import {missingFor} from "../game/tools/engine-constructs.mjs";
import {loadCardIndex, loadCardScripts} from "../game/tools/engine-cards.mjs";

let checks = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const cards = loadCardIndex();
const card = (name) => ({...cards.definition(name), card: name});
const WASTES = {card: "Wastes", types: ["Land"], supertypes: ["Basic"], abilities: [{id: "a0", kind: "mana", tapSelf: true, produces: {C: 1}}]};
const BOLT = {card: "Bolt", types: ["Instant"], manaCost: "{R}", colors: ["R"],
  spell: {id: "s", text: "Bolt deals 3 damage to any target.", targets: [{anyOf: [{what: "permanent", types: ["Creature"]}, {what: "player"}]}], effects: [{effect: "dealDamage", amount: 3, targets: {target: 0}, who: {target: 0}}]}};
function table() {
  const s = createState({matchId: "m", seed: "alternative", players: [{name: "Rob"}, {name: "Maya"}]});
  for (let seat = 0; seat < 2; seat += 1) for (let i = 0; i < 12; i += 1) addObject(s, {...WASTES, owner: seat, controller: seat}, "library", seat);
  beginGame(s);
  for (let n = 0; n < 50 && !(s.phase === "MAIN1" && s.priorityPlayer === 0); n += 1) advance(s);
  return s;
}
const put = (s, o, seat, zone) => addObject(s, {...o, owner: seat, controller: seat, ...(o.commander ? {commander: true} : {})}, zone, zone === "battlefield" || zone === "stack" ? null : seat);
const casts = (s, name) => legalActions(s, 0).filter((a) => a.kind === "cast" && a.label === name);

{
  /* Only while its condition holds; beside the paid cast; and the table says how. */
  const s = table();
  put(s, card("Deadly Rollick"), 0, "hand");
  const bear = put(s, {card: "Bear", types: ["Creature"], colors: ["G"], power: 2, toughness: 2}, 1, "battlefield");
  eq(casts(s, "Deadly Rollick").length, 0, "no commander, no mana: not offered at all");
  put(s, {card: "Captain", types: ["Creature"], power: 2, toughness: 2, commander: true}, 0, "battlefield");
  const free = casts(s, "Deadly Rollick");
  eq(free.map((a) => [a.alternative, a.targets.map((t) => s.objects[t.id]?.card)]), [[0, ["Bear"]], [0, ["Captain"]]], "his commander on the battlefield: offered, by its alternative, at each creature");
  eq(offerDetails(s, 0, free.slice(0, 1))[0].endsWith("without paying its mana cost"), true, "and the table says so");
  assert.throws(() => applyAction(s, 0, {...free[0], alternative: undefined}), /not a legal action/, "the free offer claimed as a paid cast, with no mana to pay: not a legal action");
  checks += 1;
  Object.assign(s.players[0].manaPool, {B: 1, C: 3});
  eq(casts(s, "Deadly Rollick").filter((a) => a.alternative === undefined).length, 2, "with {3}{B} in the pool, the paid cast is offered beside it");
  applyAction(s, 0, free.find((a) => a.targets[0].id === bear));
  eq([s.players[0].manaPool.B, s.stack.at(-1).name], [1, "Deadly Rollick"], "cast the free way: nothing spent");
}
{
  /* Life only for a player who has it (CR 119.4); "nonblack". */
  const s = table();
  put(s, card("Snuff Out"), 0, "hand");
  put(s, {card: "Swamp", types: ["Land"], subtypes: ["Swamp"], supertypes: ["Basic"]}, 0, "battlefield");
  put(s, {card: "Bear", types: ["Creature"], colors: ["G"], power: 2, toughness: 2}, 1, "battlefield");
  put(s, {card: "Zombie", types: ["Creature"], colors: ["B"], power: 2, toughness: 2}, 1, "battlefield");
  eq(casts(s, "Snuff Out").map((a) => s.objects[a.targets[0].id].card), ["Bear"], "with a Swamp, for 4 life: at the green Bear, not the black Zombie");
  eq(offerDetails(s, 0, casts(s, "Snuff Out"))[0].includes("paying 4 life"), true, "the table names the life");
  s.players[0].life = 3;
  eq(casts(s, "Snuff Out").length, 0, "at 3 life: Rob cannot pay 4");
}
{
  /* A card exiled from the hand -- one the selector describes, never the spell itself -- goes to exile. */
  const s = table();
  const bolt = put(s, BOLT, 0, "stack");
  s.stack.push({stackId: 99, abilityId: null, objectId: bolt, cardId: bolt, name: "Bolt", faceDown: false, playerId: 0, kind: "spell", stage: "waiting", targets: [{kind: "player", id: 1}]});
  const will = put(s, card("Force of Will"), 0, "hand");
  eq(casts(s, "Force of Will").length, 0, "no other blue card in hand: Force of Will cannot exile itself, so not offered");
  const ponder = put(s, {card: "Ponder", types: ["Sorcery"], colors: ["U"], manaCost: "{U}"}, 0, "hand");
  put(s, {card: "Shock", types: ["Instant"], colors: ["R"], manaCost: "{R}"}, 0, "hand");
  const offers = casts(s, "Force of Will");
  eq(offers.map((a) => a.costNames), [["Ponder"]], "Ponder, the blue card: one offer; the red Shock is no choice");
  eq(offerDetails(s, 0, offers)[0].includes("exiling Ponder"), true, "the table says what it exiles");
  applyAction(s, 0, offers[0]);
  eq([s.players[0].life, s.objects[ponder], s.zones.exile.map((id) => s.objects[id].card), s.objects[will]], [39, undefined, ["Ponder"], undefined], "1 life paid, Ponder in exile, Force of Will on the stack");
  assert.throws(() => applyAction(s, 0, {...offers[0], alternative: undefined}), /not a legal action/, "the same cast claimed without its alternative: refused");
  checks += 1;
}
{
  /* Never with another alternative (CR 118.9a): flashback from the graveyard pays its own cost only. */
  const s = table();
  const script = structuredClone(loadCardScripts().find(({script: one}) => one.identity.name === "Faithless Looting").script);
  script.abilities.push({kind: "static", text: "If you control a commander, you may cast this spell without paying its mana cost.", rule: "alternative-cost", affects: {what: "card", self: true}, cost: [],
    condition: {present: {what: "permanent", commander: true, controller: "you"}}});
  const {definition} = compileScript(script);
  put(s, {...definition, card: "Faithless Looting"}, 0, "graveyard");
  put(s, {card: "Captain", types: ["Creature"], power: 2, toughness: 2, commander: true}, 0, "battlefield");
  Object.assign(s.players[0].manaPool, {R: 1, C: 2});
  eq(casts(s, "Faithless Looting").map((a) => [a.flashback ?? false, a.alternative ?? null]), [[true, null]], "from the graveyard: flashback alone, never also free");
}
{
  /* "Creatures your opponents control": read as the damage is dealt -- a creature that arrives later is among them. */
  const s = table();
  runEffects(s, [{effect: "effectUntil", rule: "prevent-damage", affects: {what: "permanent", types: ["Creature"], controller: "opponent"}, apply: {by: true, to: false}, until: "end-of-turn"}], {controller: 0, source: null});
  const late = put(s, {card: "Ogre", types: ["Creature"], power: 3, toughness: 3}, 1, "battlefield");
  const mine = put(s, {card: "Bear", types: ["Creature"], power: 2, toughness: 2}, 0, "battlefield");
  runEffects(s, [{effect: "dealDamage", from: [late], targets: [mine], amount: 3}], {controller: 1, source: late});
  runEffects(s, [{effect: "dealDamage", from: [mine], who: [1], amount: 2}], {controller: 0, source: mine});
  eq([s.objects[mine].damage, s.players[1].life], [0, 38], "Maya's Ogre, arrived after: its damage prevented; Rob's Bear's is not");
  eq(selectMatching(s, {what: "permanent", types: ["Creature"], nonColors: ["B"]}, {controller: 0}).length, 2, "and neither is black: both are nonblack");
}
{
  /* What may be paid instead, and the catalog. */
  const script = structuredClone(loadCardScripts().find(({script: one}) => one.identity.name === "Force of Will").script);
  script.abilities[0].cost = [{atom: "tapOthers", count: 4}];
  eq(compileScript(script).problems.some((p) => /an alternative cost of tapOthers nothing pays yet/.test(p)), true, "tapping four creatures instead: refused (Sephara waits for it)");
  eq(missingFor({statics: ["AlternativeCost"]}), [], "the catalog: an alternative cost is built");
}

console.log(`engine-alternative-cost: ${checks} checks passed — its own alternative cost offered beside the paid cast while its condition holds, life only if there, a card exiled from the hand never itself, never with flashback; nonblack; prevention read as damage is dealt.`);
