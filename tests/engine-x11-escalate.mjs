/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* ESCALATE (CR 702.120; Collective Effort, Train B X11).
 *
 * Escalate is an additional cost (CR 601.2f-h) for each mode chosen beyond the first as a modal spell is cast (700.2):
 * cards/index.mjs puts it among the spell's additional costs, and rules/actions.mjs makes each number of extra modes its own
 * cast -- its mana that many times, its creatures to tap that many times over, and exactly that many modes more than one.
 * Which creatures is asked once the cast is taken, of its caster, before anything is paid; any untapped creature of theirs
 * that fits, a summoning-sick one too (CR 302.6). Both pilots answer it, the house pilot tapping its weakest.
 */
import {legalActions, applyAction} from "../game/engine/rules/actions.mjs";
import {play, labels, choose, at, later, idOf, compiled, missing, keywordBuilt, index, checks, pilotsAnswer} from "./helpers/x11-keywords.mjs";
import {awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {housePilot} from "../game/engine/pilots/house-pilot.mjs";
import {projectFor} from "../game/engine/projection.mjs";

const {eq, ok, done} = checks("engine-x11-escalate");
const CE = "Collective Effort";
const casts = (s, name = CE) => legalActions(s, 0).filter((a) => a.kind === "cast" && s.objects[a.objectId].card === name);
const shapes = (s, name = CE) => [...new Set(casts(s, name).map((a) => `${(a.modes ?? []).length}:${a.escalate ?? 0}:${a.escalateTap ?? 0}`))].sort();
const PAY = [{tap: "Plains"}, {tap: "Plains"}, {tap: "Wastes"}];
const LANDS = ["Plains", "Plains", "Wastes"];
const spell = (name, escalate, cost = "{R}") => ({...compiled([{kind: "keyword", text: "Escalate", keyword: "escalate", cost: escalate},
  {kind: "spell", text: "Choose one or more", effects: [{effect: "modal", choose: 1, chooseUpTo: 3, modes: ["a", "b", "c"].map((m) => ({text: m, targets: [], effects: [{effect: "draw", count: 1}]}))}]}],
  {name, types: ["Sorcery"], manaCost: cost, colors: ["R"], power: null, toughness: null}).definition, card: name});
const FIX = {Blast: spell("Blast", [{atom: "mana", cost: "{1}"}]), Both: spell("Both", [{atom: "mana", cost: "{1}"}, {atom: "tapCreature", count: 1, selector: {types: ["Creature"]}}])};

{
  /* One creature to tap: one mode, or two escalated once; never three. Two creatures: three as well. */
  const s = play([at(0, "battlefield", ...LANDS, "Bear"), at(0, "hand", CE), at(1, "battlefield", "Big Bear", "Charm Ward")], PAY);
  eq(shapes(s), ["1:0:0", "2:1:1"], "one Bear: one mode, or two with one creature tapped");
  const t = play([at(0, "battlefield", ...LANDS, "Bear", "Squirrel"), at(0, "hand", CE), at(1, "battlefield", "Big Bear", "Charm Ward")], PAY);
  eq(shapes(t), ["1:0:0", "2:1:1", "3:2:2"], "two creatures: three modes too, both tapped");
  const u = play([at(0, "battlefield", ...LANDS), at(0, "hand", CE), at(1, "battlefield", "Big Bear", "Charm Ward")], PAY);
  eq(shapes(u), ["1:0:0"], "no creature: one mode only");
}
{
  /* Taken: Rob is asked which creatures, two for three modes, and tapping them pays it. A creature he cast this turn may be
     tapped; a tapped one may not. */
  const s = play([at(0, "battlefield", ...LANDS, "Bear", "Big Bear"), later(0, "battlefield", "Squirrel"), at(0, "hand", CE), at(1, "battlefield", "Spider", "Charm Ward")],
    PAY);
  s.objects[idOf(s, "Big Bear")].tapped = true;
  const three = casts(s).find((a) => (a.modes ?? []).length === 3);
  applyAction(s, 0, three);
  const choice = awaitingChoice(s);
  eq([s.awaiting?.kind, choice.cost, choice.min, choice.max, labels(s).sort()], ["choose-cost", "escalate", 2, 2, ["Bear", "Squirrel"]],
    "three modes: two creatures to tap, the summoning-sick Squirrel among them and the tapped Big Bear not");
  let refused = false;
  try { resolveAwaiting(s, [0]); } catch (error) { refused = /Invalid selection|pick them again/.test(error.message); }
  ok(refused && s.awaiting?.kind === "choose-cost", "one creature for two is refused, and the question stays");
  const pilots = pilotsAnswer(s);
  ok(pilots.every((after) => after.stack.length === 1), "both pilots answer it, and the spell is cast");
  eq(housePilot({seat: 0}).answer(projectFor(s, 0), choice).indices.map((i) => choice.options[i].label).sort(), ["Bear", "Squirrel"], "the house pilot taps the two there are");
  choose(s, "Bear", "Squirrel");
  ok(s.objects[idOf(s, "Bear")].tapped && s.objects[idOf(s, "Squirrel")].tapped && s.stack.length === 1, "both tapped as it is cast");
  eq(s.stack[0].cast?.additionalPaid, true, "its additional cost was paid");
}
{
  /* An action sent with two modes but not their escalate is no offer; one sent with its creatures already named is held to
     them as the cost is paid -- Maya's Spider is not Rob's to tap. */
  const s = play([at(0, "battlefield", ...LANDS, "Bear"), at(0, "hand", CE), at(1, "battlefield", "Big Bear", "Charm Ward", "Spider")], PAY);
  const two = casts(s).find((a) => (a.modes ?? []).length === 2);
  const {escalate, escalateTap, ...unpaid} = two;
  let refused = "";
  try { applyAction(s, 0, unpaid); } catch (error) { refused = error.message; }
  ok(escalate === 1 && escalateTap === 1 && /not a legal action/.test(refused), "two modes without escalate's cost: refused, not cast free of it");
  try { applyAction(s, 0, {...two, escalateTapped: [idOf(s, "Spider")]}); refused = ""; } catch (error) { refused = error.message; }
  ok(/pick them again/.test(refused) && s.stack.length === 0 && s.objects[idOf(s, "Spider")].tapped !== true, "another player's creature named for it: refused, saying to pick again, and nothing moved");
}
{
  /* The house pilot taps its weakest: of a Bear and a Big Bear, for one, the Bear. */
  const s = play([at(0, "battlefield", ...LANDS, "Big Bear", "Bear"), at(0, "hand", CE), at(1, "battlefield", "Big Bear", "Charm Ward")], PAY);
  applyAction(s, 0, casts(s).find((a) => (a.modes ?? []).length === 2));
  const choice = awaitingChoice(s);
  eq(housePilot({seat: 0}).answer(projectFor(s, 0), choice).indices.map((i) => choice.options[i].label), ["Bear"], "the house pilot taps the weaker creature");
}
{
  /* A mana escalate cost: {1} more for each mode beyond the first. And mana and a creature both. */
  const s = play([at(0, "battlefield", "Mountain", "Wastes", "Wastes"), at(0, "hand", "Blast")], [{tap: "Mountain"}, {tap: "Wastes"}, {tap: "Wastes"}], {}, FIX);
  eq(casts(s, "Blast").map((a) => [(a.modes ?? []).length, a.extraMana ?? ""]).sort(), [[1, ""], [1, ""], [1, ""], [2, "{1}"], [2, "{1}"], [2, "{1}"], [3, "{1}{1}"]],
    "{R}{C}{C}: one mode, two with {1} more, three with {2} more");
  const t = play([at(0, "battlefield", "Mountain", "Wastes", "Bear"), at(0, "hand", "Both")], [{tap: "Mountain"}, {tap: "Wastes"}], {}, FIX);
  eq(shapes(t, "Both"), ["1:0:0", "2:1:1"], "mana and a creature to tap: two modes for {1} and the Bear");
}
{
  /* Pool empty, lands untapped: one mode is offered, its sources tapped as it is cast; an escalated cast is offered once its
     mana is in the pool (the creature it taps is not then a source tapped for mana as well). */
  const s = play([at(0, "battlefield", ...LANDS, "Bear"), at(0, "hand", CE), at(1, "battlefield", "Big Bear", "Charm Ward")]);
  eq(shapes(s), ["1:0:0"], "nothing in the pool: the one-mode cast, tapping for itself");
}
ok(compiled([{kind: "keyword", text: "Escalate {1}", keyword: "escalate", cost: [{atom: "mana", cost: "{1}"}]}, {kind: "spell", text: "x", effects: [{effect: "draw", count: 1}]}],
  {types: ["Sorcery"], power: null, toughness: null}).problems.some((p) => p.includes("modes are chosen as it is cast")), "escalate on a spell without modes is refused");
const modalOf = (choose, upTo) => compiled([{kind: "keyword", text: "Escalate {1}", keyword: "escalate", cost: [{atom: "mana", cost: "{1}"}]},
  {kind: "spell", text: "Choose", effects: [{effect: "modal", choose, ...(upTo ? {chooseUpTo: upTo} : {}), modes: ["a", "b", "c"].map((m) => ({text: m, targets: [], effects: [{effect: "draw", count: 1}]}))}]}],
  {types: ["Sorcery"], power: null, toughness: null});
ok(modalOf(1).problems.some((p) => p.includes("one or more of them")) && modalOf(2, 3).problems.some((p) => p.includes("one or more of them")),
  "nor on \"choose one\" or \"choose two or more\": escalate pays for each mode beyond the first of one or more");
eq(modalOf(1, 2).definition.spell.additionalCost.find((a) => a.atom === "escalate").most, 1, "\"choose one or two\" of three: one mode at most beyond the first");
ok(compiled([{kind: "keyword", text: "Escalate", keyword: "escalate", cost: [{atom: "payLife", amount: 2}]}, {kind: "spell", text: "Choose one or more", effects: [{effect: "modal", choose: 1, chooseUpTo: 2,
  modes: [{text: "a", targets: [], effects: [{effect: "draw", count: 1}]}, {text: "b", targets: [], effects: [{effect: "draw", count: 1}]}]}]}], {types: ["Sorcery"], power: null, toughness: null})
  .problems.some((p) => p.includes("an escalate cost of mana")), "a life escalate cost is refused");
eq(index.definition(CE).keywords, ["Escalate"], "Collective Effort's keyword");
ok(keywordBuilt("Escalate"), "Escalate is built (keywords/timing.mjs, the pay family)");
eq(missing(CE), [], `${CE} needs nothing the engine lacks`);
ok(index.resolve(CE)?.playable === true, `${CE} is defined and playable`);

done("escalate's cost for each mode beyond the first, mana or creatures to tap, each number of modes its own cast; the creatures asked of the caster, the weakest by the house pilot.");
