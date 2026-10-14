/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* REPLICATE, FIRST STRIKE AS THE DAMAGE STEP BEGINS, AND WHAT HAPATRA AND JHOIRA NEEDED (Train E, worker f4; Rob's v43 library).
 *
 * What the cards' scenarios (game/engine/cards/<letter>/*.scenarios.json) cannot reach:
 *   - FIRST STRIKE (CR 510.4): the first-strike damage step happens when a creature in combat has first or double strike as
 *     the combat damage step begins -- given it after blocks (Interjection), not only as attackers and blockers were declared
 *     (rules/turn.mjs); in the second step, the creatures that had neither as the first step began, and double strikers now
 *     (rules/combat.mjs, `struckFirst`) -- a first striker gone before that step is not among them, and asks nothing.
 *   - REPLICATE (CR 702.56a; Lose Focus): its grammar (cards/index.mjs) -- a mana cost, on an instant or sorcery, once; each
 *     number of times paid its own cast (rules/actions.mjs), and no action claiming more copies than it paid for.
 *   - "FOR EACH OPPONENT, ... UP TO ONE TARGET CREATURE THAT PLAYER CONTROLS" on a triggered ability (Hapatra; script/schema.mjs):
 *     the one form built, and never two of one opponent's.
 *   - "THE GREATEST MANA VALUE AMONG CARDS IN YOUR GRAVEYARD" (script/amount.mjs, `greatestManaValue`): a land's 0, a
 *     double-faced card's front face (CR 712.8a), none at all with something added to it.
 *   - "UNDER YOUR CONTROL" (Jhoira; effects/zones.mjs, digUntil's `found.controller`): its grammar.
 */
import {legalActions, applyAction} from "../game/engine/rules/actions.mjs";
import {amountOf, amountProblems} from "../game/engine/script/amount.mjs";
import {play, drive, at, idOf, compiled, keywordBuilt, index, checks, creature, labels, choose} from "./helpers/x11-keywords.mjs";

const {eq, ok, throws, done} = checks("engine-replicate-first-strike");
const BOLT = {types: ["Instant"], manaCost: "{R}", colors: ["R"], spell: {id: "s", text: "Bolt deals 3 damage to any target.",
  targets: [{anyOf: [{what: "permanent", types: ["Creature"]}, {what: "player"}]}], effects: [{effect: "dealDamage", amount: 3, targets: {target: 0}, who: {target: 0}}]}};
const FIX = {Bolt: BOLT, Knight: creature(["Knight"], 1, 2, {keywords: ["First Strike"], colors: ["W"]}), Ogre: creature(["Ogre"], 3, 3, {colors: ["R"], manaCost: "{2}{R}"}),
  Twin: creature(["Warrior"], 2, 2, {keywords: ["Double Strike"], colors: ["R"]}), Bear: creature(["Bear"], 2, 2), Rock: {types: ["Artifact"], manaCost: "{1}", colors: []},
  Gift: {types: ["Instant"], manaCost: "{W}", colors: ["W"], spell: {id: "s", text: "You gain 2 life.", targets: [], effects: [{effect: "gainLife", amount: 2}]}}};
const graveyard = (s, seat) => s.zones.graveyard[seat].map((id) => s.objects[id].card).sort();

/* ---- first strike, read as the combat damage step begins (CR 510.4) ---- */
{
  /* Maya's Ogre attacks, Rob's Bear blocks; then Interjection: the step happens, and the Bear's 4 kill the Ogre first. */
  const s = play([at(0, "battlefield", "Bear", "Plains"), at(0, "hand", "Interjection"), at(1, "battlefield", "Ogre")],
    [{to: {turn: 2, phase: "MAIN1"}}, {attack: ["Ogre"]}, {block: [["Bear", "Ogre"]]}, {pass: 1}, {tap: "Plains", seat: 0},
      {cast: "Interjection", seat: 0, targets: [{card: "Bear"}]}, {resolve: true}], {}, FIX);
  eq(s.combat?.struckFirst, undefined, "no first strike was in combat as blockers were declared; nothing kept yet");
  drive(s, (st) => st.phase === "COMBAT_FIRST_STRIKE_DAMAGE");
  ok(s.combat.struckFirst.includes(idOf(s, "Bear")), "the first-strike damage step happens, and the Bear is among those that struck first");
  drive(s, (st) => st.phase === "COMBAT_END");
  eq([graveyard(s, 1), s.objects[idOf(s, "Bear")].damage ?? 0], [["Ogre"], 0], "the Ogre died in it, and dealt the Bear nothing");
}
{
  /* Without a first striker, no first-strike step: the one damage step. */
  const s = play([at(0, "battlefield", "Bear"), at(1, "battlefield", "Ogre")], [{to: {turn: 2, phase: "MAIN1"}}, {attack: ["Ogre"]}, {block: [["Bear", "Ogre"]]}], {}, FIX);
  const seen = new Set();
  drive(s, (st) => { seen.add(st.phase); return st.phase === "COMBAT_END"; });
  ok(!seen.has("COMBAT_FIRST_STRIKE_DAMAGE") && seen.has("COMBAT_DAMAGE"), "no first striker: no first-strike step, and the regular one");
  eq(graveyard(s, 0), ["Bear"], "the Ogre's 3 kill the Bear");
}
{
  /* A double striker deals damage in both steps (CR 702.4b): Maya's Twin, unblocked, 2 and 2. */
  const s = play([at(1, "battlefield", "Twin")], [{to: {turn: 2, phase: "MAIN1"}}, {attack: ["Twin"]}], {}, FIX);
  drive(s, (st) => st.phase === "COMBAT_END");
  eq(s.players[0].life, 36, "a double striker deals its 2 in each step");
}
{
  /* Two first-striking Knights attack; Rob kills one with Bolt in the declare blockers step. The other still strikes first, and
     the one gone is not among them -- nothing asks about an object that left (CR 506.4). */
  const s = play([at(0, "battlefield", "Mountain", "Bear"), at(0, "hand", "Bolt"), at(1, "battlefield", "Knight", "Knight")],
    [{to: {turn: 2, phase: "MAIN1"}}, {attack: ["Knight", "Knight"]}, {block: [["Bear", "Knight"]]}, {pass: 1}, {tap: "Mountain", seat: 0},
      {cast: "Bolt", seat: 0, targets: [{card: "Knight"}]}, {resolve: true}], {}, FIX);
  eq(graveyard(s, 1), ["Knight"], "one Knight is dead before combat damage");
  drive(s, (st) => st.phase === "COMBAT_FIRST_STRIKE_DAMAGE");
  eq(s.combat.struckFirst.length, 1, "the first-strike step: the Knight still there struck first, the one gone is not counted");
  drive(s, (st) => st.phase === "COMBAT_END");
  eq(graveyard(s, 0), ["Bolt"], "and the combat ends: the Bear, blocking the other, took 1 and lives");
}
{
  /* A game saved in the first-strike damage step before `struckFirst` was kept: the second step reads the rule as it was
     (dealsRegular) -- a first striker that is not double deals no more. Maya's Knight, unblocked: 1, and not 1 again. */
  const t = play([at(1, "battlefield", "Knight")], [{to: {turn: 2, phase: "MAIN1"}}, {attack: ["Knight"]}], {}, FIX);
  drive(t, (st) => st.phase === "COMBAT_FIRST_STRIKE_DAMAGE");
  eq(t.players[0].life, 39, "the first-strike step: the Knight's 1");
  delete t.combat.struckFirst;
  drive(t, (st) => st.phase === "COMBAT_END");
  eq(t.players[0].life, 39, "and with nothing kept from that step, not 1 again in the regular one");
}

/* ---- replicate: the grammar (cards/index.mjs) ---- */
{
  const instant = {types: ["Instant"], power: null, toughness: null};
  const counter = {kind: "spell", text: "Counter target spell.", targets: [{what: "spell"}], effects: [{effect: "counterSpell", spells: {target: 0}}]};
  const problems = (abilities, identity = instant) => compiled(abilities, identity).problems;
  eq(problems([{kind: "keyword", text: "Replicate {U}", keyword: "replicate", cost: "{U}"}, counter]), [], "an instant with replicate {U} compiles");
  ok(problems([{kind: "keyword", text: "Replicate {X}", keyword: "replicate", cost: "{X}"}, counter]).some((p) => p.includes("replicate is a mana cost")), "replicate {X} is refused");
  ok(problems([{kind: "keyword", text: "Replicate", keyword: "replicate"}, counter]).some((p) => p.includes("replicate is a mana cost")), "replicate with no cost is refused");
  ok(problems([{kind: "keyword", text: "Replicate {G}", keyword: "replicate", cost: "{G}"}], {}).some((p) => p.includes("not an instant or sorcery")), "replicate on a creature is refused");
  ok(problems([{kind: "keyword", text: "Replicate {U}", keyword: "replicate", cost: "{U}"}, {kind: "keyword", text: "Replicate {1}", keyword: "replicate", cost: "{1}"}, counter])
    .some((p) => p.includes("a second replicate")), "two instances of replicate are refused (CR 702.56b is not built)");
  ok(problems([{kind: "keyword", text: "Replicate {U}", keyword: "replicate", cost: "{U}"}]).some((p) => p.includes("Replicate is on a spell")), "replicate with no spell ability to copy is refused");
  const lose = index.definition("Lose Focus");
  eq(lose.spell.additionalCost, [{atom: "replicate", cost: "{U}"}], "Lose Focus: its replicate cost among the spell's additional costs");
  ok(keywordBuilt("Replicate"), "Replicate is built (keywords/timing.mjs, the cast family)");
}

/* ---- replicate: each number of times its own cast, and no more copies than paid for ---- */
{
  const maya = [{to: {turn: 2, phase: "MAIN1"}}, {tap: "Forest", seat: 1}, {tap: "Wastes", seat: 1}, {cast: "Bear", seat: 1}, {pass: 1}];
  const lose = (s) => legalActions(s, 0).filter((a) => a.kind === "cast" && s.objects[a.objectId].card === "Lose Focus");
  const s = play([at(0, "battlefield", "Island", "Wastes", "Island", "Island"), at(0, "hand", "Lose Focus"), at(1, "battlefield", "Forest", "Wastes"), at(1, "hand", "Bear")],
    [...maya, {tap: "Island", seat: 0}, {tap: "Wastes", seat: 0}, {tap: "Island", seat: 0}, {tap: "Island", seat: 0}], {}, FIX);
  const offers = lose(s);
  eq(offers.map((a) => [a.replicated ?? 0, a.extraMana ?? ""]).sort(), [[0, ""], [1, "{U}"], [2, "{U}{U}"]], "four mana: replicated none, once or twice -- each its own cast");
  const once = offers.find((a) => a.replicated === 1);
  throws(() => applyAction(structuredClone(s), 0, {...once, replicated: 5}), /not a legal action/, "a cast claiming five copies for one {U} is refused");
  applyAction(s, 0, offers.find((a) => a.replicated === 2));
  eq(s.stack.map((e) => [e.kind, e.abilityId ?? null]), [["spell", null], ["spell", null], ["trigger", "replicate"]], "replicated twice: the spell, and its replicate trigger above it");
  eq(s.stack.at(-1).script.effects, [{effect: "copySpell", spells: "that card", count: 2, newTargets: true}], "which copies it twice, new targets its controller's to choose");
  const t = play([at(0, "battlefield", "Island", "Wastes"), at(0, "hand", "Lose Focus"), at(1, "battlefield", "Forest", "Wastes"), at(1, "hand", "Bear")],
    [...maya, {tap: "Island", seat: 0}, {tap: "Wastes", seat: 0}], {}, FIX);
  applyAction(t, 0, lose(t)[0]);
  eq(t.stack.map((e) => e.kind), ["spell", "spell"], "not replicated: no replicate trigger (CR 603.4) -- the Bear and Lose Focus alone");
}

/* ---- "for each opponent, up to one target ... that player controls" on a triggered ability (script/schema.mjs) ---- */
{
  const put = [{effect: "putCounter", targets: {target: 0}, counter: "-1/-1", count: 1}];
  const trig = (target, kind = "triggered") => compiled([{kind, text: "x", ...(kind === "triggered" ? {trigger: {on: "enters", who: "self"}} : {}), targets: [target], effects: put}]).problems;
  const each = {what: "permanent", types: ["Creature"], count: {min: 0, max: 1}, forEach: "opponent"};
  eq(trig(each), [], "a triggered ability's \"for each opponent, up to one target creature that player controls\" compiles");
  ok(trig({...each, count: {min: 0, max: 2}}).some((p) => p.includes("forEach")), "up to two of each is not the form built");
  ok(trig({...each, count: {min: 1, max: 1}}).some((p) => p.includes("forEach")), "exactly one of each is not either");
  ok(trig({...each, forEach: "player"}).some((p) => p.includes("forEach")), "for each player is not");
  ok(trig({what: "player", count: {min: 0, max: 1}, forEach: "opponent"}).some((p) => p.includes("forEach")), "a player is no permanent that player controls");
  const {forEach, ...plain} = each;
  eq(compiled([{kind: "spell", text: "x", targets: [plain], effects: put}], {types: ["Instant"], power: null, toughness: null}).problems, [], "an instant's \"up to one target creature\" compiles");
  ok(forEach === "opponent" && compiled([{kind: "spell", text: "x", targets: [each], effects: put}], {types: ["Instant"], power: null, toughness: null}).problems.some((p) => p.includes("forEach")),
    "with \"for each opponent\" it is refused: built for a triggered ability");
  /* Three players, Hapatra entering: two of Maya's creatures are refused, one of hers and one of Trey's are not. */
  const s = play([at(0, "battlefield", "Swamp", "Swamp", "Forest", "Wastes", "Wastes"), at(0, "hand", "Hapatra, the Desert Fang"), at(0, "graveyard", "Ogre"),
    at(1, "battlefield", "Bear", "Ogre"), at(2, "battlefield", "Bear")],
  [{tap: "Swamp"}, {tap: "Swamp"}, {tap: "Forest"}, {tap: "Wastes"}, {tap: "Wastes"}, {cast: "Hapatra, the Desert Fang"}, {resolve: true}], {seats: 3}, FIX);
  eq(labels(s).sort(), ["Bear (Maya's)", "Bear (Trey's)", "Ogre (Maya's)"], "each opponent's creatures, and none of Rob's");
  throws(() => choose(structuredClone(s), "Bear (Maya's)", "Ogre (Maya's)"), /./, "two of Maya's: refused");
  choose(s, "Ogre (Maya's)", "Bear (Trey's)");
  drive(s, (st) => st.stack.length === 0);
  eq([graveyard(s, 1), graveyard(s, 2)], [["Ogre"], ["Bear"]], "three counters (an Ogre, mana value 3, in Rob's graveyard) on each: both die");
}

/* ---- the greatest mana value among cards (script/amount.mjs) ---- */
{
  ok(amountProblems({greatestManaValue: {what: "card", zone: "graveyard", controller: "you"}}).length === 0, "the amount, over a graveyard, is grammar");
  ok(amountProblems({greatestManaValue: {what: "card", zone: "graveyard", flavor: "x"}}).length > 0, "what it counts is held to the selector grammar");
  const s = play([at(0, "graveyard", "Forest")], [], {}, FIX);
  const gy = {greatestManaValue: {what: "card", zone: "graveyard", controller: "you"}};
  eq(amountOf(s, gy, {controller: 0, source: null}), 0, "a land's mana value is 0");
  eq(amountOf(s, {...gy, plus: 1}, {controller: 1, source: null}), 1, "an empty graveyard is 0, and 1 more is 1");
  const t = play([at(0, "graveyard", "Grub, Storied Matriarch // Grub, Notorious Auntie", "Bear")], [], {}, FIX);
  eq(amountOf(t, gy, {controller: 0, source: null}), 3, "a double-faced card in the graveyard has its front face's mana value, 3 (CR 712.8a)");
}

/* ---- "under your control" (effects/zones.mjs, digUntil) ---- */
{
  const dig = (found) => compiled([{kind: "triggered", text: "x", trigger: {on: "enters", who: "self"}, targets: [{what: "player", who: "opponent"}],
    effects: [{effect: "digUntil", who: {target: 0}, selector: {types: ["Artifact"]}, found, rest: "bottom"}]}]).problems;
  eq(dig({to: "battlefield", controller: "you"}), [], "found, onto the battlefield under your control: grammar");
  ok(dig({to: "battlefield", controller: "opponent"}).some((p) => p.includes("found.controller")), "under anyone else's is refused");
  ok(dig({to: "hand", controller: "you"}).some((p) => p.includes("found.controller")), "a controller for a card going to a hand is refused");
  const s = play([at(0, "battlefield", "Jhoira, Weatherlight Corsair")], [{attack: ["Jhoira, Weatherlight Corsair"]}], {library: ["Rock"]}, FIX);
  drive(s, (st) => st.stack.length === 0 && !st.awaiting && st.phase !== "COMBAT_DECLARE_ATTACKERS", {answer: (st) => (st.awaiting.kind === "trigger-targets" ? [0] : null)});
  const rock = idOf(s, "Rock");
  eq([s.objects[rock].controller, s.objects[rock].owner], [0, 1], "Maya's Rock, found by Jhoira's attack: Rob controls it, Maya owns it");
}

done("first strike as the damage step begins and the second step's creatures (CR 510.4), replicate's grammar and its casts (CR 702.56a), a triggered ability's \"for each opponent\" targets, the greatest mana value among cards, and a found card under your control");
