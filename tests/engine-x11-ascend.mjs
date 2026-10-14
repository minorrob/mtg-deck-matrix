/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* ASCEND AND THE CITY'S BLESSING (CR 702.131; Wayward Swordtooth, Train B X11).
 *
 * On a permanent, ascend is a static ability (702.131b): any time its controller controls ten or more permanents, they get
 * the city's blessing for the rest of the game -- recorded as the game is checked, before the state-based actions act
 * (keywords/designations.mjs, citysBlessings), and read this moment by whatever asks (hasCitysBlessing). On an instant or
 * sorcery it is a spell ability done as the spell resolves (702.131a; rules/stack.mjs). The blessing stays when the
 * permanents go, any number of players may have it (702.131c), and "unless you have the city's blessing" is the condition
 * `citysBlessing` (script/condition.mjs) -- the Swordtooth's "can't attack or block unless", a rule static's.
 */
import {checkStateBasedActions} from "../game/engine/rules/sba.mjs";
import {resolveTop} from "../game/engine/rules/stack.mjs";
import {conditionHolds} from "../game/engine/script/condition.mjs";
import {hasCitysBlessing, citysBlessings, ascendAsItResolves, ASCEND_AT} from "../game/engine/keywords/designations.mjs";
import {FORGE_COUNTS} from "../game/tools/engine-constructs.mjs";
import {play, drive, happen, asked, labels, at, idOf, compiled, missing, keywordBuilt, index, checks} from "./helpers/x11-keywords.mjs";

const {eq, ok, done} = checks("engine-x11-ascend");
const WS = "Wayward Swordtooth";
const NINE = Array(9).fill("Wastes");
const attackers = (s) => drive(s, asked("declare-attackers")) && labels(s);
const FIX = {Rise: {...compiled([{kind: "keyword", text: "Ascend", keyword: "ascend"}, {kind: "spell", text: "Draw a card.", effects: [{effect: "draw", count: 1}]}],
  {name: "Rise", types: ["Sorcery"], manaCost: "{U}", colors: ["U"], power: null, toughness: null}).definition, card: "Rise"},
Muse: {...compiled([{kind: "spell", text: "Draw a card.", effects: [{effect: "draw", count: 1}]}],
  {name: "Muse", types: ["Sorcery"], manaCost: "{U}", colors: ["U"], power: null, toughness: null}).definition, card: "Muse"}};

eq(ASCEND_AT, 10, "ten permanents (CR 702.131)");
{
  /* Ten permanents, the Swordtooth among them: the blessing, as the game is checked; it attacks. */
  const s = play([at(0, "battlefield", WS, ...NINE)]);
  eq(s.players[0].citysBlessing, true, "the first check of the game gave Rob the city's blessing");
  ok(attackers(s).includes(`${WS} → Maya`), "and the Swordtooth may attack");
}
{
  /* Nine: no blessing -- it can't attack, and can't block Maya's Bear. */
  const s = play([at(0, "battlefield", WS, ...NINE.slice(1)), at(1, "battlefield", "Bear")]);
  eq([s.players[0].citysBlessing, hasCitysBlessing(s, 0)], [undefined, false], "nine permanents: no blessing");
  ok(!attackers(s).some((l) => l.startsWith(WS)), "and the Swordtooth may not attack");
  const t = play([at(0, "battlefield", WS, ...NINE.slice(1)), at(1, "battlefield", "Bear")], [{to: {turn: 2, phase: "MAIN1"}}, {attack: ["Bear"], seat: 1}]);
  drive(t, asked("declare-blockers"));
  eq(labels(t), [], "nor block the Bear");
}
{
  /* It stays when the permanents go; a tenth arriving mid-turn gives it at once, before any check records it. */
  const s = play([at(0, "battlefield", WS, ...NINE.slice(1)), at(0, "hand", "Bear")]);
  const bear = s.zones.hand[0].find((id) => s.objects[id].card === "Bear");
  happen(s, {effect: "moveZone", targets: [bear], to: "battlefield"});
  ok(s.players[0].citysBlessing === undefined && hasCitysBlessing(s, 0) && conditionHolds(s, {citysBlessing: true}, {controller: 0}),
    "the tenth enters: Rob has it this moment, the static ability's, before the check records it");
  const told = checkStateBasedActions(s).filter((e) => e.kind === "GameEventCitysBlessing").map((e) => e.data.fields.player.playerId);
  eq([s.players[0].citysBlessing, told], [true, [0]], "the check records it, and the game is told it is Rob's");
  happen(s, {effect: "destroy", targets: [idOf(s, "Bear"), idOf(s, "Wastes")]});
  ok(s.players[0].citysBlessing === true && hasCitysBlessing(s, 0), "recorded, and kept once he controls eight");
}
{
  /* Ten permanents and no ascend: nothing. Four players: only the ascend permanent's controller. */
  const s = play([at(0, "battlefield", ...NINE, "Wastes"), at(1, "battlefield", WS), at(2, "battlefield", ...NINE, WS)], [], {seats: 4});
  eq(s.players.map((p) => p.citysBlessing === true), [false, false, true, false], "Rob's ten without ascend, Maya's Swordtooth alone: no blessing; Trey's ten with it: his");
  eq([0, 1, 2, 3].map((p) => hasCitysBlessing(s, p)), [false, false, true, false], "and asked this moment, the same: ascend gives it only to its controller, at ten");
  eq(citysBlessings(s), [], "and a later check gives no one more");
}
{
  /* Ascend on a sorcery: as it resolves, ten permanents -- the blessing; nine, none; and none gained again by one who has it. */
  const s = play([at(0, "battlefield", "Island", ...NINE), at(0, "hand", "Rise")], [{tap: "Island"}, {cast: "Rise"}], {}, FIX);
  const told = resolveTop(s).filter((e) => e.kind === "GameEventCitysBlessing").map((e) => e.data.fields.player.playerId);
  eq([s.players[0].citysBlessing, told], [true, [0]], "Rise resolves with Rob at ten permanents: the city's blessing, and the game is told");
  eq(ascendAsItResolves(s, 0), [], "another ascend spell of his gives it no second time");
  const t = play([at(0, "battlefield", "Island", ...NINE.slice(1)), at(0, "hand", "Rise")], [{tap: "Island"}, {cast: "Rise"}, {resolve: true}], {}, FIX);
  eq(t.players[0].citysBlessing, undefined, "at nine: none");
  const v = play([at(0, "battlefield", "Island", ...NINE), at(0, "hand", "Muse")], [{tap: "Island"}, {cast: "Muse"}, {resolve: true}], {}, FIX);
  eq(v.players[0].citysBlessing, undefined, "a sorcery without ascend, at ten: none");
  /* A creature with ascend resolving is no spell ability: its ascend is the permanent's, recorded as the game is checked. */
  const u = play([at(0, "battlefield", "Island", "Forest", "Forest", ...NINE.slice(2)), at(0, "hand", WS)], [{tap: "Island"}, {tap: "Forest"}, {tap: "Forest"}, {cast: WS}]);
  resolveTop(u);
  ok(idOf(u, WS) !== undefined && u.players[0].citysBlessing === undefined && hasCitysBlessing(u, 0),
    "the Swordtooth resolves onto ten others: no blessing from it as a spell -- the permanent's, this moment");
  checkStateBasedActions(u);
  eq(u.players[0].citysBlessing, true, "and recorded as the game is checked");
}
ok(compiled([{kind: "static", text: "x", rule: "cant-block", affects: {what: "permanent", self: true}, condition: {citysBlessing: "no"}}]).problems
  .some((p) => p.includes("citysBlessing is true or false")), "citysBlessing is true or false");
eq(compiled([{kind: "static", text: "x", rule: "cant-block", affects: {what: "permanent", self: true}, condition: {citysBlessing: false}}]).problems, [],
  "and one of the condition grammar's closed keys");
eq(index.definition(WS).keywords, ["Ascend"], "the Swordtooth's keyword");
ok(keywordBuilt("Ascend") && FORGE_COUNTS.Blessing?.status === "built", "Ascend is built (keywords/designations.mjs), and the count Blessing");
eq(missing(WS), [], `${WS} needs nothing the engine lacks`);
ok(index.resolve(WS)?.playable === true, `${WS} is defined and playable`);

done("the city's blessing at ten permanents with ascend, this moment and for good, a spell's as it resolves; the Swordtooth's attack and block unless it.");
