/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* FLANKING (CR 702.25), AND A SELECTOR'S "WITHOUT" A KEYWORD (Sidar Kondo of Jamuraa, Train B X11).
 *
 * Flanking is a triggered ability (cards/index.mjs): whenever this creature becomes blocked by a creature without flanking,
 * that blocker gets -1/-1 until end of turn -- once for each such blocker (CR 509.3d; rules/trigger.mjs, `blockedBy`), the
 * blocker read as blockers are declared (509.3f), each instance of flanking on its own (702.25b). `nonKeywords` is the
 * selector's "without flying or reach" (script/filter.mjs), read through the layers: Sidar's "creatures your opponents
 * control without flying or reach can't block creatures with power 2 or less".
 */
import {compileSelector} from "../game/engine/script/filter.mjs";
import {runEffect} from "../game/engine/script/effects/index.mjs";
import {powerOf, toughnessOf} from "../game/engine/rules/layers.mjs";
import {play, drive, asked, labels, at, idOf, compiled, missing, keywordBuilt, index, checks} from "./helpers/x11-keywords.mjs";

const {eq, ok, throws, done} = checks("engine-x11-flanking");
const SIDAR = "Sidar Kondo of Jamuraa";
const stats = (s, id) => [powerOf(s, id), toughnessOf(s, id)];
const blockers = (s) => drive(s, asked("declare-blockers")) && labels(s);
const ids = (s, name) => s.zones.battlefield.filter((id) => s.objects[id].card === name);

{
  /* Two Spiders without flanking block it: two triggers, each Spider -1/-1 once. */
  const s = play([at(0, "battlefield", SIDAR), at(1, "battlefield", "Spider", "Spider")], [{attack: [SIDAR]}, {block: [["Spider", SIDAR], ["Spider", SIDAR]]}]);
  const [a, b] = ids(s, "Spider");
  drive(s, (st) => toughnessOf(st, a) === 2 && toughnessOf(st, b) === 2 && st.stack.length === 0);
  eq([stats(s, a), stats(s, b)], [[0, 2], [0, 2]], "blocked by two creatures without flanking: each gets -1/-1, once (CR 509.3d)");
  eq(s.phase, "COMBAT_DECLARE_BLOCKERS", "in the declare blockers step, before damage");
}
{
  /* A Spider blocking Rob's other attacker, the Squirrel: nothing -- it did not block Sidar. And Sidar's own keyword is the word. */
  const s = play([at(0, "battlefield", SIDAR, "Squirrel"), at(1, "battlefield", "Spider")], [{attack: [SIDAR, "Squirrel"]}, {block: [["Spider", "Squirrel"]]}]);
  const spider = idOf(s, "Spider");
  drive(s, (st) => st.phase === "COMBAT_DAMAGE");
  eq([stats(s, spider), s.objects[spider].damage], [[1, 3], 1], "the Spider blocked the Squirrel, not Sidar: no -1/-1, and the Squirrel's 1 damage");
  eq(index.definition(SIDAR).keywords, ["Flanking", "Partner"], "Sidar has the keyword flanking, so a creature it blocks with flanking ignores it");
}
{
  /* A blocker with flanking -- given, through the layers -- gets nothing. */
  const s = play([at(0, "battlefield", SIDAR), at(1, "battlefield", "Spider")], [{attack: [SIDAR]}]);
  const spider = idOf(s, "Spider");
  runEffect(s, {effect: "pump", targets: [spider], power: 0, toughness: 0, keywords: ["Flanking"]}, {controller: 1, source: null});
  drive(s, (st) => st.phase === "COMBAT_DAMAGE", {answer: (st, choice) => (st.awaiting.kind === "declare-blockers" ? [choice.options.find((o) => o.label === `Spider blocks ${SIDAR}`).index] : null)});
  ok(s.zones.battlefield.includes(spider) && toughnessOf(s, spider) === 3 && s.objects[spider].damage === 2, "a blocker that has flanking: no -1/-1, and it survives Sidar's 2 damage");
}
{
  /* Two instances of flanking trigger separately (702.25b): -2/-2 on one blocker, and it lasts until end of turn. */
  const TWIN = {...compiled([{kind: "keyword", text: "Flanking", keyword: "flanking"}, {kind: "keyword", text: "Flanking", keyword: "flanking"}],
    {name: "Twin Knight", power: 1, toughness: 1}).definition, card: "Twin Knight"};
  eq(TWIN.abilities.filter((a) => a.kind === "triggered").length, 2, "two instances, two triggered abilities");
  const s = play([at(0, "battlefield", "Twin Knight"), at(1, "battlefield", "Big Bear")], [{attack: ["Twin Knight"]}, {block: [["Big Bear", "Twin Knight"]]}], {}, {"Twin Knight": TWIN});
  const bear = idOf(s, "Big Bear");
  drive(s, (st) => st.stack.length === 0 && toughnessOf(st, bear) === 3);
  eq(stats(s, bear), [3, 3], "the Big Bear blocks it: -1/-1 twice");
  drive(s, (st) => st.turn === 2 && st.phase === "MAIN1");
  eq(stats(s, bear), [5, 5], "and the next turn it is a 5/5 again: until end of turn");
}
{
  /* Sidar's static, four players: Rob's Bear (power 2) attacks Maya; Rob's Big Bear (power 5) attacks Trey. */
  const s = play([at(0, "battlefield", SIDAR, "Bear", "Big Bear"), at(1, "battlefield", "Bear", "Spider"), at(2, "battlefield", "Bear")],
    [{attack: ["Bear", "Big Bear"], at: ["Maya", "Trey"]}], {seats: 4});
  eq(blockers(s).sort(), ["Spider blocks Bear"], "Maya: her Spider, with reach, may block the Bear; her Bear, without flying or reach, may not");
  eq(s.awaiting.player, 1, "the question is Maya's, the Bear's defending player");
  drive(s, (st) => st.awaiting?.kind === "declare-blockers" && st.awaiting.player === 2, {answer: () => []});
  eq(labels(s), ["Bear blocks Big Bear"], "Trey's Bear may block the Big Bear: power 5 is not 2 or less");
}
{
  /* Without flying or reach, through the layers: Maya's Bear given flying may block Rob's Bear. */
  const s = play([at(0, "battlefield", SIDAR, "Bear"), at(1, "battlefield", "Bear")], [{attack: ["Bear"]}]);
  const mayas = ids(s, "Bear").find((id) => s.objects[id].controller === 1);
  runEffect(s, {effect: "pump", targets: [mayas], power: 0, toughness: 0, keywords: ["Flying"]}, {controller: 1, source: null});
  eq(blockers(s), ["Bear blocks Bear"], "given flying, Maya's Bear is no longer one of the creatures without it");
}
throws(() => compileSelector({what: "permanent", nonKeywords: "Flying"}), /nonKeywords are a list/, "nonKeywords is a list");

ok(keywordBuilt("Flanking"), "Flanking is built (keywords/combat.mjs, the combat family)");
eq(missing(SIDAR), [], `${SIDAR} needs nothing the engine lacks`);
ok(index.resolve(SIDAR)?.playable === true, `${SIDAR} is defined and playable`);

done("flanking once for each blocker without it, each instance on its own, until end of turn; \"without flying or reach\" through the layers.");
