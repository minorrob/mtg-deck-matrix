/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* FIREBENDING N (CR 702.189; Fire Nation Cadets, Train C phase 2).
 *
 * "Whenever this creature attacks, add N {R}. Until end of combat, you don't lose this mana as steps and phases end"
 * (702.189a): the keyword compiles to that triggered ability (cards/index.mjs), its mana added with `untilEndOfCombat`
 * (script/effects/resources.mjs) and kept as combat's steps end -- no more of it than the pool still holds, the plain mana
 * spent first -- and lost as the combat phase ends (CR 500.5a; rules/turn.mjs). Each instance triggers. Fire Nation Cadets
 * has it only while a Lesson card is in its controller's graveyard: a static giving the keyword (layer 6, rules/layers.mjs);
 * once triggered, the ability resolves whatever becomes of the Lesson (CR 113.7a).
 */
import {advance} from "../game/engine/rules/turn.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";
import {keywordsOf} from "../game/engine/rules/layers.mjs";
import {play, drive, happen, at, idOf, compiled, labels, keywordBuilt, checks} from "./helpers/x11-keywords.mjs";

const {eq, ok, done} = checks("engine-firebending");
const FNC = "Fire Nation Cadets";
const bender = (amount) => ({kind: "keyword", text: `Firebending ${amount}`, keyword: "firebending", amount});
const twice = compiled([bender(1), bender(2)], {name: "Twin Bender", subtypes: ["Human"], colors: ["R"], manaCost: "{R}"});
const FIX = {
  "Old Lesson": {types: ["Sorcery"], subtypes: ["Lesson"], manaCost: "{1}", colors: ["R"], spell: {id: "s", text: "Draw a card.", targets: [], effects: [{effect: "draw", count: 1}]}},
  "Twin Bender": {...twice.definition, card: "Twin Bender"},
};
const pool = (s, seat = 0) => s.players[seat].manaPool;
/* Both players pass in turn, and the step ends: the events of moving on. */
function stepEnds(s) {
  for (let n = 0; n < 4; n += 1) {
    const outcome = passPriority(s, null);
    if (outcome.outcome === "step-ends") return advance(s);
  }
  throw new Error("the step did not end");
}
/* Fire Nation Cadets attacks with a Lesson in Rob's graveyard, and its trigger resolves. */
const attacked = (more = [], setup = []) => play([at(0, "battlefield", FNC), at(0, "graveyard", "Old Lesson"), ...setup], [{attack: [FNC]}, {resolve: true}, ...more], {}, FIX);

{
  const {definition, problems} = compiled([bender(2)]);
  const trigger = definition.abilities.find((a) => a.kind === "triggered");
  eq([problems, definition.keywords, trigger.trigger.on, trigger.trigger.who, trigger.effects], [[], ["Firebending"], "GameEventAttackersDeclared", "self",
    [{effect: "addMana", mana: {R: 2}, untilEndOfCombat: true}]], "firebending 2: whenever this creature attacks, add {R}{R}, kept until end of combat");
  ok(compiled([{kind: "keyword", text: "Firebending", keyword: "firebending"}]).problems.some((p) => p.includes("firebending needs its number")), "a firebending without its number is refused");
  ok(compiled([bender(0)]).problems.some((p) => p.includes("firebending needs its number")), "and firebending 0");
  const adds = (more) => compiled([{kind: "triggered", text: "Whenever this creature attacks, add {R}.", trigger: {on: "attacks", who: "self"}, effects: [{effect: "addMana", mana: {R: 1}, ...more}]}]).problems;
  eq([adds({untilEndOfCombat: true}), adds({untilEndOfCombat: "yes"}).some((p) => p.includes("untilEndOfCombat")), adds({untilEndOfCombat: true, spendOnly: {spell: {types: ["Instant"]}}}).some((p) => p.includes("untilEndOfCombat"))],
    [[], true, true], "a script's own mana kept until end of combat: true, and plain -- restricted mana kept so is not built");
}
{
  /* Kept as the declare attackers step ends; with a land's {R} beside it, the land's goes. */
  const s = attacked([{tap: "Mountain"}], [at(0, "battlefield", "Mountain")]);
  eq([pool(s).R, s.players[0].combatMana], [3, {R: 2}], "{R}{R} from firebending, and the Mountain's {R}");
  const events = stepEnds(s);
  eq([s.phase, pool(s).R, s.players[0].combatMana], ["COMBAT_DECLARE_BLOCKERS", 2, {R: 2}], "the step ends: two kept, the Mountain's lost");
  eq(events.filter((e) => e.kind === "GameEventManaPool").map((e) => e.data.fields.emptied?.R), [1], "and the pool said to empty by that one");
  drive(s, (st) => st.priorityPlayer !== null);
  eq([stepEnds(s).filter((e) => e.kind === "GameEventManaPool"), pool(s).R], [[], 2], "the blockers step ends with only the kept mana: nothing lost, nothing said");
}
{
  /* Spent in part: no more kept than the pool holds -- the plain mana went first. */
  const s = attacked([{tap: "Mountain"}, {activate: FNC}, {resolve: true}], [at(0, "battlefield", "Mountain")]);
  eq(pool(s).R, 1, "+1/+0 for {2} of the three");
  stepEnds(s);
  eq([pool(s).R, s.players[0].combatMana], [1, {R: 1}], "the one left is kept: the plain {R} was spent first");
  const t = attacked([{activate: FNC}, {resolve: true}]);
  stepEnds(t);
  eq([pool(t).R, t.players[0].combatMana], [0, undefined], "all of it spent: nothing kept, nothing remembered");
}
{
  /* Through the steps of combat to its end, and gone as the combat phase ends. */
  const s = attacked();
  drive(s, (st) => st.phase === "COMBAT_END" && st.priorityPlayer !== null);
  eq(pool(s).R, 2, "still there in the end of combat step");
  stepEnds(s);
  eq([s.phase, pool(s).R, s.players[0].combatMana], ["MAIN2", 0, undefined], "lost as combat ends");
}
{
  /* Outside combat it is mana like any other: lost as the step ends. */
  const s = play([at(0, "battlefield", FNC)], [], {}, FIX);
  happen(s, {effect: "addMana", mana: {R: 2}, untilEndOfCombat: true});
  eq(pool(s).R, 2, "added in the main phase");
  stepEnds(s);
  eq([pool(s).R, s.players[0].combatMana], [0, undefined], "and lost as the main phase ends: only combat's steps keep it");
}
{
  /* Each instance triggers. */
  const s = play([at(0, "battlefield", "Twin Bender")], [{attack: ["Twin Bender"]}], {}, FIX);
  eq([s.awaiting?.kind, labels(s).length], ["order-triggers", 2], "two firebending abilities: two triggers, his to order");
  drive(s, (st) => st.stack.length === 0 && st.priorityPlayer !== null);
  eq([pool(s).R, s.players[0].combatMana], [3, {R: 3}], "{R} and {R}{R}, all kept");
}
{
  /* Fire Nation Cadets has it while a Lesson is in his graveyard; the trigger, once on the stack, does not ask again. */
  const s = play([at(0, "battlefield", FNC), at(0, "graveyard", "Old Lesson")], [{attack: [FNC]}], {}, FIX);
  const id = idOf(s, FNC);
  ok(keywordsOf(s, id).includes("Firebending"), "a Lesson in his graveyard: firebending");
  happen(s, {effect: "moveZone", targets: [s.zones.graveyard[0][0]], to: "exile"});
  ok(!keywordsOf(s, id).includes("Firebending"), "the Lesson exiled: no firebending now");
  drive(s, (st) => st.stack.length === 0 && st.priorityPlayer !== null);
  eq(pool(s).R, 2, "but the ability already triggered resolves: {R}{R}");
  const t = play([at(0, "battlefield", FNC), at(1, "graveyard", "Old Lesson")], [{attack: [FNC]}], {}, FIX);
  eq([keywordsOf(t, idOf(t, FNC)).includes("Firebending"), t.stack.length], [false, 0], "a Lesson in Maya's graveyard is not his");
}
ok(keywordBuilt("Firebending"), "Firebending is built (engine-constructs: its attack trigger's mana)");

done("firebending: whenever it attacks, N {R} kept as combat's steps end -- no more than is left -- and lost as combat ends; each instance; Fire Nation Cadets' while a Lesson is in his graveyard.");
