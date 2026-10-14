/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* HEXPROOF FROM A COLOR, CHOSEN AS IT RESOLVES (CR 702.11d, 105.1; Skrelv, Defector Mite, Train C phase 2).
 *
 * "Choose a color" as an effect resolves: chooseColor (effects/asking.mjs), its controller's choice of the five, named by
 * the effects after it as "$chosenColor" -- its own placeholder, so a permanent's entering choice ("$chosen", read as its
 * abilities are) never takes its place (script/chosen.mjs, script/bind.mjs). Then, until end of turn:
 *   "hexproof from that color" -- an effect (effectUntil's `rule: "hexproof-from"`): no target of a spell of that color, or
 *     an ability from a source of that color, an opponent of its controller controls (rules/protection.mjs, script/filter.mjs)
 *     -- as it is chosen, and again as it resolves (CR 608.2b);
 *   "it can't be blocked by creatures of that color this turn" -- an effect (`rule: "cant-be-blocked-by"`, its `by`), read
 *     as each blocker is (rules/statics.mjs, cantBeBlockedBy);
 *   "toxic 1" -- the keyword given by a pump (cards/index.mjs compiles it; rules/combat.mjs reads it).
 */
import {legalActions} from "../game/engine/rules/actions.mjs";
import {canBlockAttacker} from "../game/engine/keywords/combat.mjs";
import {hexproofFrom} from "../game/engine/rules/protection.mjs";
import {keywordsOf} from "../game/engine/rules/layers.mjs";
import {matchesSelector} from "../game/engine/script/filter.mjs";
import {withChosen, withChosenColor} from "../game/engine/script/chosen.mjs";
import {play, drive, at, later, idOf, choose, labels, pilotsAnswer, index, checks} from "./helpers/x11-keywords.mjs";
import {missingFor} from "../game/tools/engine-constructs.mjs";

const {eq, ok, done} = checks("engine-hexproof-from");
const SK = "Skrelv, Defector Mite";
const creature = (cost, colors, abilities = []) => ({types: ["Creature"], subtypes: ["Beast"], manaCost: cost, colors, power: 2, toughness: 2, abilities});
const ping = (cost) => [{id: "p", kind: "activated", text: `${cost}: This creature deals 1 damage to target creature.`, cost: [{atom: "mana", cost}],
  targets: [{what: "permanent", types: ["Creature"]}], effects: [{effect: "dealDamage", amount: 1, targets: {target: 0}}]}];
const bolt = (cost, colors) => ({types: ["Instant"], manaCost: cost, colors, spell: {id: "s", text: "It deals 1 damage to target creature.",
  targets: [{what: "permanent", types: ["Creature"]}], effects: [{effect: "dealDamage", amount: 1, targets: {target: 0}}]}});
const FIX = {"Red Pinger": creature("{R}", ["R"], ping("{0}")), "Blue Pinger": creature("{U}", ["U"], ping("{0}")),
  "Red Beast": creature("{R}", ["R"]), "Gold Beast": creature("{R}{G}", ["R", "G"]), "Green Beast": creature("{G}", ["G"]),
  "Red Bolt": bolt("{R}", ["R"]), "Gold Bolt": bolt("{R}{G}", ["R", "G"]), "Blue Bolt": bolt("{U}", ["U"])};
/* Rob's turn 3: Skrelv's ability, paid with 2 life, at his Bear -- and the color chosen. */
const shielded = (color, theirs = [], mine = [], steps = []) => {
  const s = play([later(0, "battlefield", SK), at(0, "battlefield", "Bear", ...mine), ...theirs], [{to: {turn: 3, phase: "MAIN1"}}, {activate: SK, targets: [{card: "Bear"}]}, {resolve: true}], {}, FIX);
  if (color) choose(s, color);
  for (const step of steps) step(s);
  return s;
};

{
  const s = shielded(null);
  eq([s.awaiting?.kind, s.awaiting?.effect, labels(s)], ["effect-choice", "chooseColor", ["White", "Blue", "Black", "Red", "Green"]], "as it resolves, Rob chooses a color");
  choose(s, "Red");
  const bear = idOf(s, "Bear");
  const shield = s.effects.find((e) => e.rule === "hexproof-from"), lock = s.effects.find((e) => e.rule === "cant-be-blocked-by");
  eq([shield.colors, shield.affects.ids, lock.by, keywordsOf(s, bear).includes("Toxic")], [["R"], [bear], {types: ["Creature"], colors: ["R"]}, true],
    "red: the Bear's hexproof from red, its \"can't be blocked by red creatures\", and toxic");
}
{
  /* Its controller's own red spell may aim at it: hexproof is from his opponents (702.11b, 702.11d). */
  const s = play([later(0, "battlefield", SK), at(0, "battlefield", "Bear", "Mountain"), at(0, "hand", "Red Bolt")],
    [{to: {turn: 3, phase: "MAIN1"}}, {activate: SK, targets: [{card: "Bear"}]}, {resolve: true}, {choose: ["Red"]}, {tap: "Mountain"}], {}, FIX);
  const robAims = legalActions(s, 0).filter((a) => a.kind === "cast").flatMap((a) => a.targetNames);
  ok(robAims.includes("Bear"), "Rob's own Red Bolt may aim at his Bear");
  ok(!hexproofFrom(s, idOf(s, "Bear"), 0, s.zones.hand[0].find((id) => s.objects[id].card === "Red Bolt")), "and hexproofFrom says so");
}
{
  /* An opponent's red spell, red-and-green spell, or red source's ability may not aim at it; blue may. Maya, given priority
     in Rob's main phase. */
  const s = play([later(0, "battlefield", SK), at(0, "battlefield", "Bear"),
    at(1, "battlefield", "Red Pinger", "Blue Pinger", "Mountain", "Forest", "Island"), at(1, "hand", "Red Bolt", "Gold Bolt", "Blue Bolt")],
  [{to: {turn: 3, phase: "MAIN1"}}, {activate: SK, targets: [{card: "Bear"}]}, {resolve: true}, {choose: ["Red"]}, {pass: 1},
    {tap: "Mountain", seat: 1}, {tap: "Forest", seat: 1}, {tap: "Island", seat: 1}], {}, FIX);
  const aims = (pred) => [...new Set(legalActions(s, 1).filter(pred).flatMap((a) => a.targetNames))].sort();
  const spell = (name) => (a) => a.kind === "cast" && s.objects[a.objectId].card === name;
  const ability = (name) => (a) => a.kind === "activate" && s.objects[a.objectId].card === name;
  eq(aims(spell("Red Bolt")).includes("Bear"), false, "Maya's red spell: not the Bear");
  eq(aims(spell("Gold Bolt")).includes("Bear"), false, "her red-and-green spell: not the Bear (it is red)");
  eq(aims(spell("Blue Bolt")).includes("Bear"), true, "her blue spell: the Bear");
  eq([aims(ability("Red Pinger")).includes("Bear"), aims(ability("Blue Pinger")).includes("Bear")], [false, true], "an ability from her red source may not, from her blue one may");
  eq(aims(spell("Red Bolt")).includes(SK), true, "Skrelv itself has no hexproof: her Red Bolt may aim at it");
  /* A source of that color as it now is (layer 5): the Blue Pinger made red, and its ability may no longer. */
  s.effects.push({id: "paint", layer: 5, affects: {ids: [idOf(s, "Blue Pinger")]}, apply: {setColors: ["R"]}, until: "end-of-turn", sourceController: 1, timestamp: s.nextTimestamp++});
  eq(aims(ability("Blue Pinger")).includes("Bear"), false, "the Blue Pinger painted red: its ability may not aim at the Bear");
}
{
  /* Gained after it was aimed at (CR 608.2b): Maya's Red Bolt on the stack at the Bear, Skrelv's ability in response -- the
     Bolt's one target illegal now, and it does nothing. */
  const s = play([later(0, "battlefield", SK), at(0, "battlefield", "Bear"), at(1, "battlefield", "Mountain"), at(1, "hand", "Red Bolt")],
    [{to: {turn: 3, phase: "COMBAT_BEGIN"}}, {pass: 1}, {tap: "Mountain", seat: 1}, {cast: "Red Bolt", seat: 1, targets: [{card: "Bear"}]}, {pass: 1},
      {activate: SK, seat: 0, targets: [{card: "Bear"}]}, {resolve: true}, {choose: ["Red"]}, {resolve: true}], {}, FIX);
  eq([s.objects[idOf(s, "Bear")].damage, s.zones.graveyard[1].map((id) => s.objects[id].card)], [0, ["Red Bolt"]], "the Bolt does nothing: the Bear undamaged");
}
{
  /* "Can't be blocked by creatures of that color this turn": red ones, and a red-and-green one; a green one may. */
  const s = shielded("Red", [at(1, "battlefield", "Red Beast", "Gold Beast", "Green Beast")]);
  const bear = idOf(s, "Bear");
  eq(["Red Beast", "Gold Beast", "Green Beast"].map((n) => canBlockAttacker(s, idOf(s, n), bear)), [false, false, true], "the red and the red-green can't block it; the green can");
  ok(canBlockAttacker(s, idOf(s, "Red Beast"), idOf(s, SK)), "and Skrelv, which it did not name, the Red Beast may block");
  /* Toxic 1 with its combat damage, then all of it over at the end of the turn. */
  const t = shielded("Red", [at(1, "battlefield", "Red Beast")], [], [(st) => drive(st, (x) => x.awaiting?.kind === "declare-attackers")]);
  choose(t, ...labels(t).filter((l) => l.startsWith("Bear ")));
  drive(t, (st) => st.phase === "MAIN2" && st.priorityPlayer !== null);
  eq([t.players[1].life, t.players[1].poison ?? 0], [38, 1], "the Bear unblocked by the Red Beast: Maya takes 2 and a poison counter");
  drive(t, (st) => st.turn === 4 && st.phase === "MAIN1");
  const later4 = idOf(t, "Bear");
  eq([hexproofFrom(t, later4, 1, idOf(t, "Red Beast")), canBlockAttacker(t, idOf(t, "Red Beast"), later4), keywordsOf(t, later4).includes("Toxic")], [false, true, false],
    "Maya's turn: the hexproof, the blocking rule and the toxic are gone");
}
{
  /* "$chosenColor" is the resolution's color, never a permanent's entering choice: "$chosen" and it are kept apart. */
  const effect = {colors: ["$chosenColor"], subtypes: ["$chosen"]};
  eq(withChosenColor(withChosen(effect, "Elf"), "G"), {colors: ["G"], subtypes: ["Elf"]}, "each placeholder its own value");
  eq(withChosenColor(effect, undefined).colors, ["(none chosen)"], "before a color is chosen: a color nothing has");
  ok(!matchesSelector({what: "permanent", colors: ["(none chosen)"]}, play([at(0, "battlefield", "Bear")]), 1, {controller: 0}), "which matches nothing");
}
{
  /* The pilots answer "choose a color", and the rules take the answer. */
  for (const after of pilotsAnswer(shielded(null))) ok(after.effects.some((e) => e.rule === "hexproof-from" && e.colors.length === 1 && "WUBRG".includes(e.colors[0])), "each pilot chooses a color");
}
eq(missingFor({apis: ["ChooseColor"]}), [], "ChooseColor is built (engine-constructs: chooseColor)");
eq(index.definition(SK).keywords, ["Toxic"], `${SK}'s keyword`);
ok(index.resolve(SK)?.playable === true, `${SK} is defined and playable`);

done("choose a color as it resolves; hexproof from that color against an opponent's spells and sources of it, and unblockable by creatures of it, until end of turn.");
