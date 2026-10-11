/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* SUSPEND FROM THE HAND (CR 702.62; Knight of Old Benalia, Train C phase 2).
 *
 * Suspend's first ability: "If you could begin to cast this card by putting it onto the stack from your hand, you may pay
 * [cost] and exile it with N time counters on it. This action doesn't use the stack" (702.62a) -- a special action (CR
 * 116.2f; rules/actions.mjs), offered at the timing the card could be cast and with nothing forbidding that cast (702.62c),
 * whether or not its mana cost could be paid; its cost paid from the pool, each way the pool pays it its own offer. The card
 * in exile is then suspended (702.62b): the time counters come off at its owner's upkeeps and the free cast follows, as for
 * any suspended card (tests/engine-suspend.mjs; rules/trigger.mjs, rules/stack.mjs).
 */
import {legalActions, applyAction} from "../game/engine/rules/actions.mjs";
import {offerDetails} from "../game/room/room.mjs";
import {housePilot} from "../game/engine/pilots/house-pilot.mjs";
import {projectFor} from "../game/engine/projection.mjs";
import {play, drive, at, compiled, keywordBuilt, index, checks, assert} from "./helpers/x11-keywords.mjs";

const {eq, ok, done} = checks("engine-suspend-hand");
const KB = "Knight of Old Benalia";
const card = (name, abilities, identity) => {
  const {definition, problems} = compiled(abilities, {name, ...identity});
  if (problems.length) throw new Error(`${name}: ${problems.join("; ")}`);
  return {...definition, card: name};
};
const FIX = {
  /* An instant with suspend: offered whenever it could be cast. */
  "Quick Vision": card("Quick Vision", [{kind: "keyword", text: "Suspend 2--{U}", keyword: "suspend", amount: 2, cost: [{atom: "mana", cost: "{U}"}]},
    {kind: "spell", text: "Draw a card.", effects: [{effect: "draw", count: 1}]}], {types: ["Instant"], manaCost: "{2}{U}", colors: ["U"], power: null, toughness: null}),
  /* A sorcery with no mana cost: never cast from the hand for its mana cost, suspended all the same. */
  "Vision": card("Vision", [{kind: "keyword", text: "Suspend 4--{1}", keyword: "suspend", amount: 4, cost: [{atom: "mana", cost: "{1}"}]},
    {kind: "spell", text: "Draw three cards.", effects: [{effect: "draw", count: 3}]}], {types: ["Sorcery"], manaCost: null, colors: ["U"], power: null, toughness: null}),
  /* A creature with flash and suspend: on another player's turn too. */
  "Flash Knight": card("Flash Knight", [{kind: "keyword", text: "Flash", keyword: "flash"}, {kind: "keyword", text: "Suspend 1--{W/P}", keyword: "suspend", amount: 1, cost: [{atom: "mana", cost: "{W/P}"}]}],
    {types: ["Creature"], subtypes: ["Knight"], manaCost: "{4}{W}", colors: ["W"], power: 3, toughness: 3}),
  Hush: {types: ["Enchantment"], manaCost: "{1}", colors: [], abilities: [{id: "h", kind: "static", text: "Players can't cast creature spells.", rule: "cant-cast", affects: {what: "player"}, spells: {types: ["Creature"]}}]},
};
const suspends = (s, seat = 0) => legalActions(s, seat).filter((a) => a.kind === "suspend");
const exiled = (s, name) => s.zones.exile.map((id) => s.objects[id]).find((o) => o.card === name);

{
  const s = play([at(0, "hand", KB), at(0, "battlefield", "Plains")], [{tap: "Plains"}], {}, FIX);
  eq(suspends(s).map((a) => a.label), [KB], "his main phase, {W} in his pool: suspend offered, though the Knight's {3}{W}{W} could not be paid");
  eq(offerDetails(s, 0, suspends(s)), ["Suspend 5—{W}"], "the board says it in the card's words");
  applyAction(s, 0, suspends(s)[0]);
  const knight = exiled(s, KB);
  eq([knight?.counters.time, knight?.suspended, s.stack.length, s.priorityPlayer, s.players[0].manaPool.W], [5, true, 0, 0, 0],
    "suspended: in exile with five time counters, nothing on the stack, Rob holding priority, his {W} spent");
  drive(s, (st) => st.turn === 3 && st.phase === "UPKEEP" && st.stack.length === 1);
  drive(s, (st) => st.stack.length === 0 && st.priorityPlayer !== null);
  eq(exiled(s, KB).counters.time, 4, "his next upkeep: four");
}
{
  /* "If you could begin to cast this card": its timing -- a sorcery's for the Knight, an instant's for Quick Vision. */
  const combat = play([at(0, "hand", KB, "Quick Vision"), at(0, "battlefield", "Plains", "Island")], [{to: {turn: 1, phase: "COMBAT_BEGIN"}}, {tap: "Plains"}, {tap: "Island"}], {}, FIX);
  eq(suspends(combat).map((a) => a.label), ["Quick Vision"], "in combat: the instant, not the Knight");
  const theirs = play([at(0, "hand", "Quick Vision"), at(0, "battlefield", "Island")], [{to: {turn: 2, phase: "MAIN1"}}, {pass: 1}, {tap: "Island", seat: 0}], {}, FIX);
  eq(suspends(theirs).map((a) => a.label), ["Quick Vision"], "on Maya's turn, with priority: the instant still");
  const flash = play([at(0, "hand", "Flash Knight")], [{to: {turn: 2, phase: "MAIN1"}}, {pass: 1}], {}, FIX);
  eq(suspends(flash).map((a) => a.payment.life), [2], "a creature with flash, on Maya's turn: offered, its {W/P} paid with 2 life from an empty pool");
  applyAction(flash, 0, suspends(flash)[0]);
  eq([flash.players[0].life, exiled(flash, "Flash Knight")?.counters.time], [38, 1], "suspended: Rob at 38, one time counter on it");
  const vision = play([at(0, "hand", "Vision"), at(0, "battlefield", "Wastes")], [{tap: "Wastes"}], {}, FIX);
  eq([suspends(vision).length, legalActions(vision, 0).filter((a) => a.kind === "cast").length], [1, 0], "a card with no mana cost: suspended, though never cast for one");
  const hushed = play([at(0, "hand", KB), at(0, "battlefield", "Plains", "Hush")], [{tap: "Plains"}], {}, FIX);
  eq(suspends(hushed).length, 0, "\"players can't cast creature spells\": nor suspend one (702.62c)");
  const smashed = play([at(0, "hand", "Siege Smash", "Quick Vision"), at(0, "battlefield", "Mountain", "Wastes", "Island", "Bear")],
    [{tap: "Mountain"}, {tap: "Wastes"}, {cast: "Siege Smash", modes: [1], targets: [{card: "Bear"}]}, {tap: "Island"}], {}, FIX);
  eq(suspends(smashed).length, 0, "split second on the stack: no cast could begin, so no suspend");
  const graveyard = play([at(0, "graveyard", KB), at(0, "battlefield", "Plains")], [{tap: "Plains"}], {}, FIX);
  eq(suspends(graveyard).length, 0, "from the graveyard: no");
}
{
  /* Which mana pays is the player's: "Suspend 4--{1}" with {W} and {U} in the pool, two offers. */
  const s = play([at(0, "hand", "Vision"), at(0, "battlefield", "Plains", "Island")], [{tap: "Plains"}, {tap: "Island"}], {}, FIX);
  const ways = suspends(s);
  eq(ways.map((a) => offerDetails(s, 0, ways)[ways.indexOf(a)]).sort(), ["Suspend 4--{1}, paying {U}", "Suspend 4--{1}, paying {W}"], "two ways, each said with the mana it spends");
  assert.throws(() => applyAction(structuredClone(s), 0, {...ways[0], payWith: "0,0,0,0,0,9|0"}), /choose one of the ways your pool pays/, "a way the pool has not: refused, saying what to do");
  applyAction(s, 0, ways.find((a) => a.payment.mana.U === 1));
  eq([s.players[0].manaPool.W, s.players[0].manaPool.U ?? 0, exiled(s, "Vision")?.counters.time], [1, 0, 4], "paid with the {U}: the {W} left");
}
{
  /* The house pilot suspends when its pool pays and it casts nothing; and the room asks it then (`passes`). */
  const s = play([at(0, "hand", KB), at(0, "battlefield", "Plains")], [{tap: "Plains"}], {}, FIX);
  const pilot = housePilot({seat: 0}), actions = legalActions(s, 0);
  eq([pilot.passes(actions, 0), pilot.choose(projectFor(s, 0), actions).kind], [false, "suspend"], "the house pilot takes it");
}
ok(compiled([{kind: "keyword", text: "Suspend--{W}", keyword: "suspend", cost: [{atom: "mana", cost: "{W}"}]}]).problems.some((p) => p.includes("a number of time counters")), "suspend without its number is refused");
ok(compiled([{kind: "keyword", text: "Suspend 3--Pay 3 life", keyword: "suspend", amount: 3, cost: [{atom: "payLife", amount: 3}]}]).problems.some((p) => p.includes("a mana cost")), "a cost that is not mana is refused");
ok(compiled([{kind: "keyword", text: "Suspend 1--{1}", keyword: "suspend", amount: 1, cost: [{atom: "mana", cost: "{1}"}]}], {types: ["Land"], manaCost: null, power: null, toughness: null}).problems
  .some((p) => p.includes("never cast")), "suspend on a land is refused");
eq(index.definition(KB).keywords, ["Suspend"], `${KB}'s keyword`);
ok(keywordBuilt("Suspend"), "Suspend is built (keywords/timing.mjs, the zones family)");
ok(index.resolve(KB)?.playable === true, `${KB} is defined and playable`);

done("suspend from the hand: a special action at the timing it could be cast, its cost from the pool, exiled with its time counters and suspended.");
