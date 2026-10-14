/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* BACKUP (CR 702.165; Guardian Scalelord, Train B X11).
 *
 * Backup N is a triggered ability (cards/index.mjs): when this creature enters, N +1/+1 counters on target creature, and if
 * that's another creature, it also gains until end of turn the non-backup abilities printed below this one on this card
 * (702.165a, 702.165c) -- fixed as the card is compiled (702.165d) and given as a pump gives abilities (layer 6, until end of
 * turn): keywords, triggered and activated abilities. "Another creature" is the effect's own condition on its target. The
 * Scalelord's "return target nonland permanent card with mana value X or less from your graveyard, where X is this
 * creature's power" then belongs to the creature that has it: its power, its controller's graveyard.
 */
import {abilitiesOf, keywordsOf, controllerOf} from "../game/engine/rules/layers.mjs";
import {play, drive, happen, labels, choose, at, idOf, compiled, missing, keywordBuilt, index, checks} from "./helpers/x11-keywords.mjs";

const {eq, ok, done} = checks("engine-x11-backup");
const GS = "Guardian Scalelord";
const ATTACK = "Whenever this creature attacks, return target nonland permanent card with mana value X or less from your graveyard to the battlefield, where X is this creature's power.";
const counters = (s, id) => s.objects[id]?.counters?.["+1/+1"] ?? 0;
const attacking = (s, id) => abilitiesOf(s, id).filter((a) => a.kind === "triggered" && a.text === ATTACK).length;
const CAST = [{tap: "Plains"}, {tap: "Wastes"}, {tap: "Wastes"}, {tap: "Wastes"}, {tap: "Wastes"}, {cast: GS}, {resolve: true}];
const LANDS = ["Plains", "Wastes", "Wastes", "Wastes", "Wastes"];

{
  /* The compiled ability: Flying and the attack trigger given, nothing printed above, no other backup. */
  const backup = index.definition(GS).abilities.find((a) => a.kind === "triggered" && a.text.startsWith("Backup 1"));
  eq([backup.effects[0].count, backup.effects[1].keywords, backup.effects[1].abilities.map((a) => a.text)], [1, ["Flying"], [ATTACK]],
    "Backup 1: one counter, and the abilities printed below it given -- flying and the attack trigger");
  const odd = compiled([{kind: "keyword", text: "Trample", keyword: "trample"}, {kind: "keyword", text: "Backup 1", keyword: "backup", amount: 1},
    {kind: "keyword", text: "Flying", keyword: "flying"}, {kind: "keyword", text: "Backup 2", keyword: "backup", amount: 2}, {kind: "keyword", text: "Vigilance", keyword: "vigilance"}]).definition;
  const [first, second] = odd.abilities.filter((a) => a.kind === "triggered");
  eq([first.effects[1].keywords, second.effects[0].count, second.effects[1].keywords], [["Flying", "Vigilance"], 2, ["Vigilance"]],
    "printed above it is not given, nor another backup (702.165a): the first gives flying and vigilance, the second, two counters, vigilance");
}
{
  /* Its target: a creature, any player's -- the lands are not offered. */
  const s = play([at(0, "battlefield", "Bear", ...LANDS), at(0, "hand", GS), at(1, "battlefield", "Squirrel", "Forest")], CAST);
  eq(labels(s).sort(), ["Bear", GS, "Squirrel"], "backup's target: any creature, the Scalelord itself among them, and no land");
}
{
  /* On Rob's Bear: the counter, and until end of turn the abilities. */
  const s = play([at(0, "battlefield", "Bear", ...LANDS), at(0, "hand", GS)], [...CAST, {choose: ["Bear"]}, {resolve: true}]);
  const bear = idOf(s, "Bear"), lord = idOf(s, GS);
  eq([counters(s, bear), keywordsOf(s, bear).includes("Flying"), attacking(s, bear), attacking(s, lord)], [1, true, 1, 1], "the Bear: a counter, flying and the attack trigger; the Scalelord keeps its own");
  drive(s, (st) => st.turn === 2 && st.phase === "MAIN1");
  eq([counters(s, bear), keywordsOf(s, bear).includes("Flying"), attacking(s, bear)], [1, false, 0], "the next turn: the counter stays, the abilities are gone");
}
{
  /* On itself: the counter only -- nothing gained twice. */
  const s = play([at(0, "battlefield", ...LANDS), at(0, "hand", GS)], [...CAST, {choose: [GS]}, {resolve: true}]);
  const lord = idOf(s, GS);
  eq([counters(s, lord), attacking(s, lord), keywordsOf(s, lord).filter((k) => k === "Flying").length], [1, 1, 1], "on itself: a counter, and its abilities once");
}
{
  /* Three players: on Maya's Bear -- another creature, so it gains them, though Rob's creature gave them. */
  const s = play([at(0, "battlefield", ...LANDS), at(0, "hand", GS), at(1, "battlefield", "Bear")], [...CAST, {choose: ["Bear"]}, {resolve: true}], {seats: 3});
  const bear = idOf(s, "Bear");
  eq([controllerOf(s, bear), counters(s, bear), keywordsOf(s, bear).includes("Flying"), attacking(s, bear)], [1, 1, true, 1], "Maya's Bear: a counter, flying and the attack trigger");
}
{
  /* The granted trigger, as the Bear attacks the same turn: X is the Bear's power, 3 -- the Big Bear (5) is no target. */
  const s = play([at(0, "battlefield", "Bear", ...LANDS), at(0, "hand", GS), at(0, "graveyard", "Relic", "Big Bear")],
    [...CAST, {choose: ["Bear"]}, {resolve: true}, {attack: ["Bear"]}]);
  eq(labels(s), ["Relic"], "the Bear attacks: its granted trigger may return the Relic (mana value 1), not the Big Bear (5), X its power 3");
  choose(s, "Relic");
  drive(s, (st) => st.stack.length === 0 && !(st.pendingTriggers ?? []).length);
  ok(idOf(s, "Relic") !== undefined, "and returns it to the battlefield");
}
{
  /* The target gone before it resolves: nothing at all. */
  const s = play([at(0, "battlefield", "Bear", ...LANDS), at(0, "hand", GS)], [...CAST, {choose: ["Bear"]}]);
  const bear = idOf(s, "Bear");
  happen(s, {effect: "destroy", targets: [bear]}, {controller: 1, source: null});
  drive(s, (st) => st.stack.length === 0 && st.priorityPlayer !== null && !(st.pendingTriggers ?? []).length);
  eq(counters(s, idOf(s, GS)), 0, "its only target gone: the ability does nothing, not even to the Scalelord");
}
ok(compiled([{kind: "keyword", text: "Backup", keyword: "backup"}, {kind: "keyword", text: "Flying", keyword: "flying"}]).problems.some((p) => p.includes("backup needs its number")),
  "backup with no number is refused");
ok(compiled([{kind: "keyword", text: "Backup 1", keyword: "backup", amount: 1}]).problems.some((p) => p.includes("none are")), "backup with nothing printed below it is refused");
eq(index.definition(GS).keywords, ["Backup", "Flying"], "the Scalelord's keywords");
ok(keywordBuilt("Backup"), "Backup is built (engine-constructs: its primitive putCounter)");
eq(missing(GS), [], `${GS} needs nothing the engine lacks`);
ok(index.resolve(GS)?.playable === true, `${GS} is defined and playable`);

done("backup's counter on any creature, the abilities printed below given to another until end of turn, fixed as compiled; the granted trigger its new holder's.");
