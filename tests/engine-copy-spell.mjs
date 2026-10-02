/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* M4 PHASE 3, BATCH 30 (THE CATALOG'S ORDER): COPY A SPELL (CR 707.10).
 *
 * A copy of a spell is a spell of its own on the stack, controlled by whoever copied it, with the original's copiable
 * values and every choice made for it: its targets, X. It is put on the stack, not cast. It is no card: as it leaves
 * the stack it ceases to exist -- resolved, countered, or returned to a hand (CR 707.10a, 704.5e) -- unless it was a
 * permanent spell that resolved, which becomes a token (CR 608.3f). "You may choose new targets for the copy" (CR
 * 707.10c) asks its controller, target by target, to keep each one or choose another legal one; a copy is never its own
 * target (CR 115.5). A copy made while its source is still resolving is above that source, and the source still leaves.
 */
import assert from "node:assert/strict";
import {createState, addObject} from "../game/engine/state/index.mjs";
import {beginGame, advance, awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {pushSpell, resolveTop} from "../game/engine/rules/stack.mjs";
import {checkStateBasedActions} from "../game/engine/rules/sba.mjs";
import {beginResolution} from "../game/engine/script/resolution.mjs";
import {historyLines} from "../game/room/history.mjs";

let checks = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const WASTES = {card: "Wastes", types: ["Land"], supertypes: ["Basic"], abilities: [{id: "a0", kind: "mana", tapSelf: true, produces: {C: 1}}]};
const ANY = {anyOf: [{what: "permanent", types: ["Creature"]}, {what: "player"}]};
const BOLT = {card: "Bolt", types: ["Instant"], manaCost: "{R}", colors: ["R"],
  spell: {id: "s", text: "Bolt deals 3 damage to any target.", targets: [ANY], effects: [{effect: "dealDamage", amount: 3, targets: {target: 0}, who: {target: 0}}]}};
const COUNTER = {card: "Counter", types: ["Instant"], manaCost: "{U}{U}",
  spell: {id: "s", text: "Counter target spell.", targets: [{what: "spell"}], effects: [{effect: "counterSpell", spells: {target: 0}}]}};
const REVERBERATE = {card: "Reverberate", types: ["Instant"], manaCost: "{R}{R}",
  spell: {id: "s", text: "Copy target instant or sorcery spell. You may choose new targets for the copy.", targets: [{what: "spell", types: ["Instant"]}],
    effects: [{effect: "copySpell", spells: {target: 0}, newTargets: true}]}};
const KNIGHT = {card: "Knight", types: ["Creature"], supertypes: ["Legendary"], manaCost: "{1}", power: 2, toughness: 2};
const pod = {matchId: "m", seed: "copy", players: [{name: "Rob"}, {name: "Maya"}]};
function table() {
  const s = createState(pod);
  for (let seat = 0; seat < 2; seat += 1) for (let i = 0; i < 12; i += 1) addObject(s, {...WASTES, owner: seat, controller: seat}, "library", seat);
  return s;
}
function main(s) { beginGame(s); for (let n = 0; n < 50 && !(s.phase === "MAIN1" && s.priorityPlayer === 0); n += 1) advance(s); return s; }
const cast = (s, card, seat, targets = [], extra = {}) => pushSpell(s, addObject(s, {...card, owner: seat, controller: seat}, "hand", seat), {controller: seat, targets, ...extra});
const copyOf = (s, spellObject, controller, more = {}) => beginResolution(s, [{effect: "copySpell", spells: [spellObject], ...more}], {controller, source: null});
const MAYA = {kind: "player", id: 1}, ROB = {kind: "player", id: 0};
const graveyards = (s) => [s.zones.graveyard[0].length, s.zones.graveyard[1].length];

{
  /* The copy: Maya's, with Bolt's target; on the stack, not cast; then it resolves and leaves no card behind. */
  const s = main(table());
  const bolt = cast(s, BOLT, 0, [MAYA]);
  const castBefore = [s.players[0].castThisTurn?.length ?? 0, s.players[1].castThisTurn?.length ?? 0];
  const {events} = copyOf(s, bolt.objectId, 1);
  const copy = s.stack[1];
  eq([s.stack.length, copy.playerId, copy.copy, copy.targets, copy.name], [2, 1, true, [MAYA], "Bolt"], "Maya copies Rob's Bolt: a second spell on the stack, hers, aimed where Bolt is");
  eq([s.objects[copy.objectId].zone, s.objects[copy.objectId].owner, s.objects[copy.objectId].copy], ["stack", 1, true], "the copy is an object on the stack, owned by the player who put it there (CR 110.2), and marked a copy");
  eq([s.players[0].castThisTurn?.length ?? 0, s.players[1].castThisTurn?.length ?? 0], castBefore, "nobody cast it: no spell is added to anyone's spells cast this turn");
  eq(events.some((e) => e.kind === "GameEventSpellAbilityCast"), false, "and no cast event, so nothing that says \"whenever you cast\" sees it");
  const said = events.filter((e) => e.kind === "GameEventSpellCopied");
  eq([said.length, said[0]?.data.fields.playerId, said[0]?.data.fields.card?.name, said[0]?.data.fields.original?.name], [1, 1, "Bolt", "Bolt"], "one GameEventSpellCopied: Maya, a copy of Bolt");
  eq(historyLines(said[0], ["Rob", "Maya"]).map((l) => l.text), ["Maya copied Bolt"], "the table's history says so");
  const copyId = copy.objectId;
  resolveTop(s);
  eq([s.players[1].life, s.objects[copyId], graveyards(s), s.zones.stack.length, s.stack.length], [37, undefined, [0, 0], 1, 1], "the copy resolves: Maya takes 3, and it ceases to exist -- no card in any graveyard; Bolt is still there");
  resolveTop(s);
  eq([s.players[1].life, graveyards(s)], [34, [1, 0]], "then Bolt: 3 more, and Bolt -- the card -- goes to Rob's graveyard");
}
{
  /* Countered, or returned to a hand, a copy ceases to exist too (CR 707.10a, 704.5e); a spell an effect moves off the
     stack takes its entry with it. */
  const s = main(table());
  const bolt = cast(s, BOLT, 0, [MAYA]);
  copyOf(s, bolt.objectId, 0, {count: 2});
  eq(s.stack.map((e) => Boolean(e.copy)), [false, true, true], "count 2: two copies");
  const [, first, second] = s.stack;
  beginResolution(s, [{effect: "counterSpell", spells: [first.objectId]}], {controller: 1, source: null});
  eq([s.objects[first.objectId], graveyards(s), s.stack.length], [undefined, [0, 0], 2], "a countered copy ceases to exist: nothing goes to a graveyard");
  beginResolution(s, [{effect: "moveZone", targets: [second.objectId], to: "hand"}], {controller: 1, source: null});
  eq(s.stack.length, 1, "a copy returned to a hand leaves the stack: its entry goes with it");
  checkStateBasedActions(s);
  eq([s.zones.hand[0].length, s.zones.hand[1].length], [0, 0], "and in the hand it ceases to exist (CR 704.5e): no card in anyone's hand");
  beginResolution(s, [{effect: "moveZone", targets: [bolt.objectId], to: "hand"}], {controller: 1, source: null});
  checkStateBasedActions(s);
  eq([s.stack.length, s.zones.stack.length, s.zones.hand[0].map((id) => s.objects[id].card)], [0, 0, ["Bolt"]], "Bolt itself returned to Rob's hand: off the stack, entry and all, and a card in his hand");
}
{
  /* The choices made for it are the copy's too (CR 707.10): X. */
  const s = main(table());
  const BLAZE = {card: "Blaze", types: ["Sorcery"], manaCost: "{X}{R}",
    spell: {id: "s", text: "Blaze deals X damage to any target.", targets: [ANY], effects: [{effect: "dealDamage", amount: "X", targets: {target: 0}, who: {target: 0}}]}};
  const blaze = cast(s, BLAZE, 0, [MAYA], {x: 4});
  copyOf(s, blaze.objectId, 0);
  eq(s.stack[1].x, 4, "a copy of Blaze with X = 4 has X = 4");
  resolveTop(s);
  eq(s.players[1].life, 36, "and deals 4");
}
{
  /* New targets (CR 707.10c): keep, or a legal other -- never the copy itself. */
  const s = main(table());
  const bear = addObject(s, {card: "Bear", types: ["Creature"], power: 2, toughness: 2, owner: 1, controller: 1}, "battlefield", null);
  const bolt = cast(s, BOLT, 0, [MAYA]);
  const counter = cast(s, COUNTER, 1, [{kind: "object", id: bolt.objectId}]);
  copyOf(s, counter.objectId, 0, {newTargets: true});
  const choice = awaitingChoice(s);
  eq([s.awaiting.player, choice.options.map((o) => o.label)], [0, ["Keep Bolt", "Counter"]], "Rob copies Maya's Counter: he may keep Bolt or aim it at the Counter -- not at the copy itself");
  resolveAwaiting(s, [1]);
  eq([s.stack[2].targets, s.stack[1].targets], [[{kind: "object", id: counter.objectId}], [{kind: "object", id: bolt.objectId}]], "he chooses the Counter: the copy's target changes, the original's does not");
  copyOf(s, bolt.objectId, 1, {newTargets: true});
  eq(awaitingChoice(s).options.map((o) => o.label).sort(), ["Bear", "Keep Maya", "Rob"], "a copy of Bolt: keep Maya, or Rob, or the Bear");
  resolveAwaiting(s, [awaitingChoice(s).options.find((o) => o.label === "Bear").index]);
  eq(s.stack[3].targets, [{kind: "object", id: bear}], "the copy is aimed at the Bear now");
}
{
  /* A copy of a permanent spell becomes a token as it resolves (CR 608.3f); "except it isn't legendary". */
  const s = main(table());
  const knight = cast(s, KNIGHT, 0, [], {permanent: true});
  copyOf(s, knight.objectId, 0, {except: {nonLegendary: true}});
  const copyObject = s.stack[1].objectId;
  eq([s.objects[copyObject].supertypes ?? [], s.stack[1].permanent], [[], true], "the copy is not legendary, and it will be a permanent");
  resolveTop(s);
  const token = s.zones.battlefield.find((id) => s.objects[id].card === "Knight");
  eq([s.objects[token].token, s.objects[token].copy ?? false, s.objects[token].supertypes ?? []], [true, false, []], "it resolves into a token Knight, no longer a copy, not legendary");
  resolveTop(s);
  checkStateBasedActions(s);
  eq(s.zones.battlefield.filter((id) => s.objects[id].card === "Knight").length, 2, "and the legendary Knight beside it: the legend rule has nothing to do");
}
{
  /* A copy made while its source resolves sits above the source -- and the source still leaves (stack.mjs). */
  const s = main(table());
  const bolt = cast(s, BOLT, 0, [MAYA]);
  const reverberate = cast(s, REVERBERATE, 0, [{kind: "object", id: bolt.objectId}]);
  resolveTop(s);
  eq(s.stack.map((e) => [e.name, e.stage]), [["Bolt", "waiting"], ["Reverberate", "resolving"], ["Bolt", "waiting"]], "Reverberate stops to ask, the copy already above it");
  resolveAwaiting(s, [0]);
  eq([s.stack.map((e) => [e.name, Boolean(e.copy)]), s.objects[reverberate.objectId], s.zones.graveyard[0].map((id) => s.objects[id].card)],
    [[["Bolt", false], ["Bolt", true]], undefined, ["Reverberate"]], "answered: Reverberate leaves for the graveyard, and the copy stays on the stack above Bolt");
}

console.log(`engine-copy-spell: ${checks} checks passed — a copy is the copier's spell with the original's targets, not cast; resolved, countered or returned it ceases to exist; new targets kept or chosen, never itself; a permanent spell's copy a token, not legendary if asked; its source still leaves.`);
