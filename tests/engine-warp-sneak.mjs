/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* WARP, VOID, SNEAK, OMNATH'S MANA, A DRONE THAT BLOCKS FLYERS, AND AN AURA THAT STEALS (Train E, worker e2; Rob's v43 library).
 *
 * What the cards' scenarios (game/engine/cards/<letter>/*.scenarios.json) cannot reach:
 *   - WARP (CR 702.185a): an alternative cost from the hand alone (cards/index.mjs `fromHand`; rules/actions.mjs) -- never from
 *     the command zone or exile; the permanent exiled at the next end step by its spell's controller's delayed trigger (rules/
 *     stack.mjs), then castable by its OWNER from exile, and only "after the current turn has ended" (effects/zones.mjs moveZone's
 *     `warped`, a may-play with `afterTurn`; rules/actions.mjs permissionOpen) -- a card with flash shows it; a permanent that
 *     left and came back meanwhile is a new object (CR 400.7) and stays.
 *   - VOID (CR 207.2c, 702.185c): "a nonland permanent left the battlefield this turn" -- any player's, a token too, counted
 *     with its last known information (state/index.mjs, recordDeath) -- "or a spell was warped this turn" (rules/actions.mjs,
 *     castThisTurn's `warped`), any player's; both this turn's alone (rules/turn.mjs).
 *   - SNEAK (CR 702.190): offered at an instant's timing in its caster's declare blockers step, with a spell on the stack too;
 *     the creature returned is no additional cost; the permanent attacks whom that one attacked -- a planeswalker, or one of
 *     three opponents (rules/stack.mjs); the room does not pass a player who could sneak (rules/actions.mjs, nothingToDo), nor one
 *     who could warp.
 *   - OMNATH (CR 106.4, 614.1a): the mana in the pool counted, what is kept beside it too (script/amount.mjs `manaInPool`); as a
 *     step ends, mana that would be lost becomes {C} -- the restricted mana and riders with it -- and firebending's, not lost
 *     then, keeps its color (rules/turn.mjs, rules/restricted-mana.mjs); without Omnath, lost as ever.
 *   - "CAN BLOCK ONLY CREATURES WITH FLYING" (CR 509.1b; rules/statics.mjs, keywords/combat.mjs), and its grammar.
 *   - "YOU CONTROL ENCHANTED PERMANENT" (CR 613.1b; effects/permanents.mjs controlByAuras, rules/sba.mjs): a later control change
 *     outlasts it (CR 613.7) and gives it back; the Aura losing the ability, moving, or changing hands ends it.
 */
import {legalActions, nothingToDo, applyAction} from "../game/engine/rules/actions.mjs";
import {conditionHolds} from "../game/engine/script/condition.mjs";
import {amountOf, amountProblems} from "../game/engine/script/amount.mjs";
import {controllerOf} from "../game/engine/rules/layers.mjs";
import {canBlockAttacker} from "../game/engine/keywords/combat.mjs";
import {checkStateBasedActions} from "../game/engine/rules/sba.mjs";
import {withheldOf} from "../game/engine/rules/restricted-mana.mjs";
import {play, drive, happen, at, idOf, compiled, keywordBuilt, index, checks, creature} from "./helpers/x11-keywords.mjs";

const {eq, ok, done} = checks("engine-warp-sneak");
const AFS = "All-Fates Stalker", PE = "Pinnacle Emissary", LEO = "Leonardo, Leader in Blue", OMN = "Omnath, Locus of the Void", TB = "Tractor Beam";
const SHOCK = {types: ["Instant"], manaCost: "{R}", colors: ["R"], spell: {id: "s", text: "Shock deals 2 damage to any target.",
  targets: [{anyOf: [{what: "permanent", types: ["Creature"]}, {what: "player"}]}], effects: [{effect: "dealDamage", amount: 2, targets: {target: 0}, who: {target: 0}}]}};
const blinker = compiled([{kind: "keyword", text: "Flash", keyword: "flash"}, {kind: "keyword", text: "Warp {1}", keyword: "warp", cost: [{atom: "mana", cost: "{1}"}]}],
  {name: "Blinker", types: ["Creature"], subtypes: ["Faerie"], manaCost: "{3}{U}", colors: ["U"], power: 1, toughness: 1});
const FIX = {Shock: SHOCK, Blinker: {...blinker.definition, card: "Blinker"}, Ogre: creature(["Ogre"], 4, 4, {colors: ["R"]}),
  Hawk: creature(["Bird"], 1, 1, {keywords: ["Flying"], colors: ["W"]}),
  Jace: {types: ["Planeswalker"], subtypes: ["Jace"], manaCost: "{3}{U}", colors: ["U"], loyalty: 5, abilities: []}};
const casts = (s, name, seat = 0) => legalActions(s, seat).filter((a) => a.kind === "cast" && s.objects[a.objectId].card === name);
const ways = (s, name, seat = 0) => casts(s, name, seat).map((a) => (a.alternative !== undefined ? s.objects[a.objectId].abilities[a.alternative].paidFor : "mana")).sort();
const inZone = (s, zone, name, seat = 0) => (["exile", "battlefield"].includes(zone) ? s.zones[zone] : s.zones[zone][seat]).find((id) => s.objects[id].card === name);
const warpAt = (name) => index.definition(name).abilities.findIndex((a) => a.paidFor === "warp");

/* ---- warp: the grammar ---- */
{
  eq(blinker.problems, [], "a flash creature with warp compiles");
  const warp = index.definition(AFS).abilities[warpAt(AFS)];
  eq([warp.rule, warp.paidFor, warp.fromHand, warp.cost], ["alternative-cost", "warp", true, [{atom: "mana", cost: "{1}{W}"}]], "All-Fates Stalker's warp: an alternative cost from the hand");
  ok(compiled([{kind: "keyword", text: "Warp {X}", keyword: "warp", cost: [{atom: "mana", cost: "{X}"}]}]).problems.some((p) => p.includes("a warp cost of mana, once, without X")), "a warp cost with X is refused");
  ok(compiled([{kind: "keyword", text: "Warp", keyword: "warp"}]).problems.some((p) => p.includes("a warp cost of mana")), "a warp with no cost is refused");
  ok(compiled([{kind: "keyword", text: "Warp {R}", keyword: "warp", cost: [{atom: "mana", cost: "{R}"}]}], {types: ["Instant"], power: null, toughness: null}).problems
    .some((p) => p.includes("never becomes a permanent")), "warp on an instant is refused");
  ok(keywordBuilt("Warp") && keywordBuilt("Sneak"), "Warp and Sneak are built (keywords/timing.mjs, the pay family)");
}

/* ---- warp: from the hand alone ---- */
{
  /* His commander in the command zone: its mana cost, never its warp cost; with two lands, nothing at all. */
  const s = play([at(0, "command", AFS), at(0, "battlefield", "Plains", "Wastes", "Wastes", "Wastes")], [], {}, FIX);
  eq(ways(s, AFS), ["mana"], "from the command zone: its mana cost alone");
  const t = play([at(0, "command", AFS), at(0, "battlefield", "Plains", "Wastes")], [{tap: "Plains"}, {tap: "Wastes"}], {}, FIX);
  eq(ways(t, AFS), [], "two mana, enough for its warp cost: not from the command zone");
  const u = play([at(0, "hand", AFS), at(0, "battlefield", "Plains", "Wastes")], [{tap: "Plains"}, {tap: "Wastes"}], {}, FIX);
  eq(ways(u, AFS), ["warp"], "from the hand: warp");
}

/* ---- warp: exiled at the end step, castable by its owner after this turn ---- */
{
  const k = FIX.Blinker.abilities.findIndex((a) => a.paidFor === "warp");
  const s = play([at(0, "hand", "Blinker"), at(0, "battlefield", "Wastes", "Island", "Wastes", "Wastes", "Wastes", "Island", "Wastes", "Wastes", "Wastes")],
    [{tap: "Wastes"}, {cast: "Blinker", alternative: k}, {resolve: true}, {to: {turn: 1, phase: "END_OF_TURN"}}], {}, FIX);
  eq(s.stack.at(-1)?.kind, "trigger", "the end step: warp's delayed trigger on the stack");
  drive(s, (st) => st.stack.length === 0 && st.priorityPlayer === 0);
  const exiled = inZone(s, "exile", "Blinker");
  ok(exiled !== undefined && s.objects[exiled].warped === true, "exiled, and a warped card in exile (CR 702.185b)");
  /* A cast from exile is paid from the pool (rules/actions.mjs taps for a hand's or a command zone's): four lands tapped. */
  const tapFour = () => { for (const land of ["Island", "Wastes", "Wastes", "Wastes"]) applyAction(s, 0, legalActions(s, 0).find((a) => a.kind === "activate-mana" && a.label === land)); };
  tapFour();
  eq([s.phase, s.players[0].manaPool.U, casts(s, "Blinker").length], ["END_OF_TURN", 1, 0], "still this turn, the mana there and the Blinker with flash: not castable from exile yet");
  drive(s, (st) => st.turn === 2 && st.phase === "UPKEEP" && st.priorityPlayer === 0);
  tapFour();
  eq([casts(s, "Blinker").length, ways(s, "Blinker")], [1, ["mana"]], "Maya's upkeep, a later turn: Rob may cast it from exile, for its mana cost");
  const effect = s.effects.find((e) => e.id === `warp:${exiled}`);
  eq([effect.rule, effect.player, effect.afterTurn, effect.spellsOnly], ["may-play", 0, 1, true], "the permission: Rob's, a spell, after turn 1");
}
{
  /* Its owner's: Maya took the warped Stalker before the end step -- Rob's delayed trigger exiles it, and Rob may cast it. */
  const s = play([at(0, "hand", AFS), at(0, "battlefield", "Plains", "Wastes")], [{tap: "Plains"}, {tap: "Wastes"}, {cast: AFS, alternative: warpAt(AFS)}, {resolve: true}], {}, FIX);
  drive(s, (st) => st.stack.length === 0 && !st.awaiting && st.priorityPlayer !== null, {answer: () => []});
  happen(s, {effect: "gainControl", targets: [idOf(s, AFS)], toPlayer: 1}, {controller: 1, source: null});
  eq(controllerOf(s, idOf(s, AFS)), 1, "Maya controls the Stalker");
  drive(s, (st) => st.turn === 2 && st.phase === "UPKEEP", {answer: () => []});
  const exiled = inZone(s, "exile", AFS);
  eq([exiled !== undefined, s.effects.find((e) => e.id === `warp:${exiled}`)?.player], [true, 0], "exiled at the end step, and the permission is Rob's, its owner's");
}
{
  /* Flickered before the end step: a new object (CR 400.7), not exiled; and one destroyed is not there to exile. */
  const s = play([at(0, "hand", AFS), at(0, "battlefield", "Plains", "Wastes")], [{tap: "Plains"}, {tap: "Wastes"}, {cast: AFS, alternative: warpAt(AFS)}, {resolve: true}], {}, FIX);
  drive(s, (st) => st.stack.length === 0 && !st.awaiting && st.priorityPlayer !== null, {answer: () => []});
  happen(s, {effect: "moveZone", targets: [idOf(s, AFS)], to: "exile", andReturn: true}, {controller: 0, source: null});
  drive(s, (st) => st.turn === 2 && st.phase === "UPKEEP", {answer: () => []});
  ok(idOf(s, AFS) !== undefined && inZone(s, "exile", AFS) === undefined, "flickered: it stays on the battlefield");
  eq(s.objects[idOf(s, AFS)].paidFor, undefined, "and was cast for nothing, as the new object it is");
}

{
  /* "As long as it remains exiled": a warped card sent anywhere but exile is no warped card, and nothing lets it be cast there. */
  const s = play([at(0, "battlefield", AFS)], [], {}, FIX);
  happen(s, {effect: "moveZone", targets: [idOf(s, AFS)], to: "graveyard", warped: 1}, {controller: 0, source: null});
  const there = inZone(s, "graveyard", AFS);
  eq([s.objects[there].warped, s.effects?.some((e) => String(e.id).startsWith("warp:")) ?? false], [undefined, false], "to the graveyard: not warped, and no permission");
  /* And exiled by an ability Maya controls, the permission is still its owner's (CR 702.185a: "its owner may cast"). */
  const t = play([at(0, "battlefield", AFS)], [], {}, FIX);
  happen(t, {effect: "moveZone", targets: [idOf(t, AFS)], to: "exile", warped: 1}, {controller: 1, source: null});
  eq(t.effects.find((e) => String(e.id).startsWith("warp:"))?.player, 0, "exiled by Maya's: Rob's permission, the owner's");
}

/* ---- void ---- */
{
  const s = play([at(0, "battlefield", "Mountain"), at(1, "battlefield", "Forest", "Ogre")], [], {}, FIX);
  ok(!conditionHolds(s, {void: true}, {controller: 0}), "nothing has left: no void");
  happen(s, {effect: "destroy", targets: [idOf(s, "Forest")]}, {controller: 0, source: null});
  eq([s.nonlandLeftThisTurn ?? 0, conditionHolds(s, {void: true}, {controller: 0})], [0, false], "a land destroyed: no void");
  happen(s, {effect: "moveZone", targets: [idOf(s, "Ogre")], to: "hand"}, {controller: 0, source: null});
  eq([s.nonlandLeftThisTurn, conditionHolds(s, {void: true}, {controller: 0}), conditionHolds(s, {void: true}, {controller: 1})], [1, true, true],
    "Maya's Ogre returned to her hand: a nonland permanent left -- void, for either player");
  drive(s, (st) => st.turn === 2 && st.phase === "UPKEEP");
  eq([s.nonlandLeftThisTurn, conditionHolds(s, {void: true}, {controller: 0})], [0, false], "the next turn: forgotten as it began");
}
{
  /* A token is a permanent; and a spell warped by Maya is void for Rob. */
  const s = play([at(0, "battlefield", "Mountain")], [], {}, FIX);
  happen(s, {effect: "createToken", count: 1, token: {name: "Spark", types: ["Creature"], subtypes: ["Elemental"], colors: ["R"], power: 1, toughness: 1}}, {controller: 0, source: null});
  happen(s, {effect: "destroy", targets: [idOf(s, "Spark")]}, {controller: 0, source: null});
  ok(conditionHolds(s, {void: true}, {controller: 0}), "a token died: void");
  const t = play([at(1, "hand", PE), at(1, "battlefield", "Island")], [{to: {turn: 2, phase: "MAIN1"}}, {tap: "Island", seat: 1}, {cast: PE, seat: 1, alternative: warpAt(PE)}], {}, FIX);
  eq([t.players[1].castThisTurn.at(-1).warped, conditionHolds(t, {void: true}, {controller: 0}), t.nonlandLeftThisTurn ?? 0], [true, true, 0],
    "Maya warped the Emissary: a spell was warped this turn, void for Rob");
  const u = play([at(1, "hand", PE), at(1, "battlefield", "Island", "Mountain", "Wastes")], [{to: {turn: 2, phase: "MAIN1"}}, {tap: "Island", seat: 1}, {tap: "Mountain", seat: 1}, {tap: "Wastes", seat: 1}, {cast: PE, seat: 1, alternative: false}], {}, FIX);
  eq([u.players[1].castThisTurn.at(-1).warped, conditionHolds(u, {void: true}, {controller: 0})], [undefined, false], "cast for its mana cost: nothing warped");
  ok(compiled([{kind: "triggered", text: "x", trigger: {on: "enters"}, condition: {void: false}, effects: [{effect: "draw", count: 1}]}]).problems.some((p) => p.includes("void is true")), "void is true");
  ok(compiled([{kind: "triggered", text: "x", trigger: {on: "enters"}, condition: {cast: {notFrom: "battlefield"}}, effects: [{effect: "draw", count: 1}]}]).problems
    .some((p) => p.includes("cast.notFrom is a zone")), "cast.notFrom is a zone a spell is cast from");
}

/* ---- sneak ---- */
{
  const sneak = index.definition(LEO).abilities[0];
  eq([sneak.rule, sneak.paidFor, sneak.sneak, sneak.condition, sneak.cost.at(-1)],
    ["alternative-cost", "sneak", true, {sneak: true}, {atom: "returnToHand", selector: {what: "permanent", types: ["Creature"], controller: "you", attacking: true, unblocked: true}}],
    "Leonardo's sneak: an alternative cost, an unblocked creature of his returned, in his declare blockers step");
  ok(compiled([{kind: "keyword", text: "Sneak", keyword: "sneak"}]).problems.some((p) => p.includes("a sneak cost of mana")), "a sneak cost is mana");
  ok(compiled([{kind: "triggered", text: "x", trigger: {on: "enters"}, condition: {sneak: 1}, effects: [{effect: "draw", count: 1}]}]).problems.some((p) => p.includes("sneak is true")), "sneak is true");
}
const LANDS = ["Plains", "Plains", "Wastes", "Wastes", "Wastes", "Mountain"];
const tapFive = [{tap: "Plains"}, {tap: "Plains"}, {tap: "Wastes"}, {tap: "Wastes"}, {tap: "Wastes"}];
{
  /* At an instant's timing: with Rob's Shock on the stack too. And the Bear, returned, is no additional cost. */
  const s = play([at(0, "hand", LEO, "Shock"), at(0, "battlefield", ...LANDS, "Bear")],
    [{attack: ["Bear"]}, {to: {turn: 1, phase: "COMBAT_DECLARE_BLOCKERS"}}, {tap: "Mountain"}, {cast: "Shock", targets: [{player: 1}]}, ...tapFive], {}, FIX);
  eq([s.stack.length, ways(s, LEO)], [1, ["sneak"]], "Shock on the stack: sneak still offered, as an instant would be");
  const t = play([at(0, "hand", LEO, "Shock"), at(0, "battlefield", ...LANDS, "Bear")],
    [{attack: ["Bear"]}, {to: {turn: 1, phase: "COMBAT_DECLARE_BLOCKERS"}}, ...tapFive, {cast: LEO, alternative: 0}], {}, FIX);
  eq([t.stack.at(-1).cast.paidFor, t.stack.at(-1).cast.additionalPaid, t.stack.at(-1).sneak], ["sneak", undefined, {player: 1}],
    "cast for it: its sneak cost paid, no additional cost, and whom the Bear attacked remembered");
  eq(t.combat.attacks.map((a) => t.objects[a.attacker]?.zone ?? null), [null], "the Bear, returned, a new object in his hand: out of combat (CR 506.4, 400.7)");
  /* In his declare blockers step alone: the combat damage step, the Bear still unblocked and attacking, is too late. */
  const u = play([at(0, "hand", LEO), at(0, "battlefield", ...LANDS, "Bear")], [{attack: ["Bear"]}, {to: {turn: 1, phase: "COMBAT_DAMAGE"}}, ...tapFive], {}, FIX);
  eq([u.phase, ways(u, LEO)], ["COMBAT_DAMAGE", []], "the combat damage step: no sneak");
  /* "Your" declare blockers step: Maya, who took Rob's unblocked attacker in his, may not sneak Splinter for it. Since CR
     506.4 was built (Train E), the Bear she took is out of combat as it changes hands -- no unblocked attacker of hers -- so
     this game no longer reaches sneak's own timing; the condition is asked of both players directly instead. */
  const v = play([at(0, "battlefield", "Bear"), at(1, "hand", "Splinter, Hamato Yoshi"), at(1, "battlefield", "Swamp")],
    [{attack: ["Bear"]}, {to: {turn: 1, phase: "COMBAT_DECLARE_BLOCKERS"}}], {}, FIX);
  happen(v, {effect: "gainControl", targets: [idOf(v, "Bear")], toPlayer: 1}, {controller: 1, source: null});
  drive(v, (st) => st.priorityPlayer === 1);
  applyAction(v, 1, legalActions(v, 1).find((a) => a.kind === "activate-mana" && a.label === "Swamp"));
  eq([v.phase, controllerOf(v, idOf(v, "Bear")), v.combat.attacks.length, ways(v, "Splinter, Hamato Yoshi", 1)], ["COMBAT_DECLARE_BLOCKERS", 1, 0, []],
    "the Bear Maya took is out of combat (CR 506.4): no sneak for her");
  eq([conditionHolds(v, {sneak: true}, {controller: 0}), conditionHolds(v, {sneak: true}, {controller: 1})], [true, false],
    "Rob's declare blockers step is his to sneak in, not Maya's (CR 702.190a)");
}
{
  /* The planeswalker the returned creature attacked (CR 702.190b, 506.3a). */
  const s = play([at(0, "hand", LEO), at(0, "battlefield", ...LANDS, "Bear"), at(1, "battlefield", "Jace")],
    [{attack: ["Bear"], at: "Jace (Maya)"}, {to: {turn: 1, phase: "COMBAT_DECLARE_BLOCKERS"}}, ...tapFive, {cast: LEO, alternative: 0}, {resolve: true}], {}, FIX);
  const leo = idOf(s, LEO), jace = idOf(s, "Jace");
  eq(s.combat.attacks.find((a) => a.attacker === leo), {attacker: leo, defender: 1, planeswalker: jace, blocked: false, blockers: []}, "Leonardo attacks Jace, as the Bear did");
  /* And with Jace gone before he enters, he attacks nothing (CR 506.3c), tapped all the same. */
  const t = play([at(0, "hand", LEO), at(0, "battlefield", ...LANDS, "Bear"), at(1, "battlefield", "Jace")],
    [{attack: ["Bear"], at: "Jace (Maya)"}, {to: {turn: 1, phase: "COMBAT_DECLARE_BLOCKERS"}}, ...tapFive, {cast: LEO, alternative: 0}], {}, FIX);
  happen(t, {effect: "destroy", targets: [idOf(t, "Jace")]}, {controller: 1, source: null});
  drive(t, (st) => st.stack.length === 0 || st.stack.at(-1).kind === "trigger");
  eq([t.combat.attacks.some((a) => a.attacker === idOf(t, LEO)), t.objects[idOf(t, LEO)].tapped], [false, true], "Jace gone: Leonardo enters tapped, attacking nothing");
}
{
  /* Four players: the Bear attacked Trey, so Leonardo attacks Trey. */
  const s = play([at(0, "hand", LEO), at(0, "battlefield", ...LANDS, "Bear", "Ogre")],
    [{attack: ["Ogre", "Bear"], at: ["Maya", "Trey"]}, {to: {turn: 1, phase: "COMBAT_DECLARE_BLOCKERS"}}, ...tapFive], {seats: 4}, FIX);
  eq(casts(s, LEO).map((a) => a.costNames), [["Bear"], ["Ogre"]], "either unblocked attacker may be returned");
  const t = play([at(0, "hand", LEO), at(0, "battlefield", ...LANDS, "Bear", "Ogre")],
    [{attack: ["Ogre", "Bear"], at: ["Maya", "Trey"]}, {to: {turn: 1, phase: "COMBAT_DECLARE_BLOCKERS"}}, ...tapFive, {cast: LEO, alternative: 0}, {resolve: true}], {seats: 4}, FIX);
  eq(t.combat.attacks.find((a) => a.attacker === idOf(t, LEO))?.defender, 2, "the Bear returned, Trey's attacker: Leonardo attacks Trey");
}
{
  /* The room passes for a player with nothing to do (rules/actions.mjs, nothingToDo): never one who could sneak, or warp. */
  const s = play([at(0, "hand", LEO), at(0, "battlefield", ...LANDS, "Bear")], [{attack: ["Bear"]}, {to: {turn: 1, phase: "COMBAT_DECLARE_BLOCKERS"}}], {}, FIX);
  const t = play([at(0, "hand", "Ogre"), at(0, "battlefield", ...LANDS, "Bear")], [{attack: ["Bear"]}, {to: {turn: 1, phase: "COMBAT_DECLARE_BLOCKERS"}}], {}, FIX);
  eq([nothingToDo(s, 0), nothingToDo(t, 0)], [false, true], "declare blockers, lands untapped: Leonardo in hand is something to do, an Ogre is not");
  const r = play([at(0, "hand", LEO), at(0, "battlefield", "Plains", "Plains", "Wastes", "Wastes", "Bear")], [{attack: ["Bear"]}, {to: {turn: 1, phase: "COMBAT_DECLARE_BLOCKERS"}}], {}, FIX);
  eq(nothingToDo(r, 0), true, "four lands, and sneak costs five: nothing to do");
  const u = play([at(0, "hand", PE), at(0, "battlefield", "Island")], [], {}, FIX);
  const v = play([at(0, "hand", "Ogre"), at(0, "battlefield", "Island")], [], {}, FIX);
  eq([nothingToDo(u, 0), nothingToDo(v, 0)], [false, true], "one Island: the Emissary's warp is something to do, an Ogre is not");
  const w = play([at(0, "command", PE), at(0, "battlefield", "Island")], [], {}, FIX);
  eq(nothingToDo(w, 0), true, "the Emissary in the command zone: no warp from there, nothing to do");
  const x = play([at(0, "hand", PE), at(0, "battlefield", "Island")], [{to: {turn: 2, phase: "UPKEEP"}}, {pass: 1}], {}, FIX);
  eq([x.priorityPlayer, nothingToDo(x, 0)], [0, true], "Maya's upkeep: an Emissary is no instant, and its warp nothing to do then");
}

/* ---- Omnath's mana ---- */
{
  const s = play([at(0, "battlefield", OMN, "Forest", "Mountain")], [{tap: "Forest"}], {}, FIX);
  s.players[0].restrictedMana = [{key: "G", source: idOf(s, "Forest"), spell: {types: ["Creature"]}}];
  s.players[0].manaRiders = [{id: 900, key: "G", source: idOf(s, "Forest"), whenSpent: {spell: {}, effects: [], text: "x"}}];
  eq([amountOf(s, {manaInPool: "you"}, {controller: 0}), amountOf(s, {manaInPool: "you"}, {controller: 1})], [2, 0], "his pool's {G} and the restricted {G} beside it: two; Maya's none");
  ok(amountProblems({manaInPool: "opponent"}).some((p) => p.includes("manaInPool is \"you\"")), "manaInPool is \"you\"");
  drive(s, (st) => st.phase === "COMBAT_BEGIN");
  eq([s.players[0].manaPool.G, s.players[0].manaPool.C, s.players[0].restrictedMana, s.players[0].manaRiders.map((r) => r.key)],
    [0, 1, [{key: "C", source: idOf(s, "Forest"), spell: {types: ["Creature"]}}], ["C"]], "the step ends: the {G} is {C}, the restricted mana {C} and still restricted, the rider on {C}");
}
{
  /* Firebending's mana is not lost as a combat step ends (CR 702.189a): it keeps its color; the rest becomes {C}. */
  const s = play([at(0, "battlefield", OMN, "Forest", "Mountain")], [{to: {turn: 1, phase: "COMBAT_BEGIN"}}, {tap: "Forest"}, {tap: "Mountain"}], {}, FIX);
  s.players[0].combatMana = {R: 1};
  drive(s, (st) => st.phase === "COMBAT_END" || st.phase === "MAIN2");
  eq([s.players[0].manaPool.R, s.players[0].manaPool.G, s.players[0].manaPool.C], [1, 0, 1], "beginning of combat ends: the kept {R} stays red, the {G} becomes {C}");
}
{
  /* Two {R} that can't be spent on spells from the hand, one of them firebending's: the kept one stays {R}, still withheld; the
     other becomes {C}, still withheld (rules/restricted-mana.mjs, withheldOf reads both). */
  const s = play([at(0, "battlefield", OMN, "Mountain", "Mountain")], [{to: {turn: 1, phase: "COMBAT_BEGIN"}}, {tap: "Mountain"}, {tap: "Mountain"}], {}, FIX);
  const p = s.players[0];
  p.combatMana = {R: 1};
  p.withheldMana = [{key: "R", source: null, cantSpend: {castFrom: "hand"}}, {key: "R", source: null, cantSpend: {castFrom: "hand"}}];
  p.withheldSeen = {...p.manaPool};
  drive(s, (st) => st.phase === "COMBAT_END" || st.phase === "MAIN2");
  eq([p.manaPool.R, p.manaPool.C, withheldOf(s, 0).map((e) => e.key).sort()], [1, 1, ["C", "R"]], "one {R} kept, one {C}: both still withheld");
}
{
  /* Without Omnath, or for another player: lost as ever. */
  const s = play([at(0, "battlefield", "Forest"), at(1, "battlefield", OMN)], [{tap: "Forest"}], {}, FIX);
  drive(s, (st) => st.phase === "COMBAT_BEGIN");
  eq([s.players[0].manaPool.G, s.players[0].manaPool.C], [0, 0], "Maya's Omnath keeps none of Rob's mana");
}

/* ---- the Drone: can block only creatures with flying ---- */
{
  const s = play([at(0, "battlefield", PE, "Wastes"), at(0, "hand", "Relic"), at(1, "battlefield", "Bear", "Hawk")], [{tap: "Wastes"}, {cast: "Relic"}, {resolve: true}, {resolve: true}], {}, FIX);
  const drone = idOf(s, "Drone");
  eq([canBlockAttacker(s, drone, idOf(s, "Hawk")), canBlockAttacker(s, drone, idOf(s, "Bear")), canBlockAttacker(s, idOf(s, PE), idOf(s, "Bear"))], [true, false, true],
    "the Drone may block the flying Hawk, never the Bear; the Emissary may block the Bear");
  ok(compiled([{kind: "static", text: "x", rule: "can-block-only", affects: {what: "permanent", self: true}}]).problems.some((p) => p.includes("says which attackers")), "can-block-only says which attackers");
  eq(compiled([{kind: "static", text: "x", rule: "can-block-only", affects: {what: "permanent", self: true}, attackers: {keywords: ["Flying"]}}]).problems, [],
    "and with them, a rule a static ability may change (rules/statics.mjs)");
}

/* ---- Tractor Beam: you control enchanted permanent ---- */
const BEAM = [at(0, "hand", TB), at(0, "battlefield", "Island", "Island", "Wastes", "Wastes"), at(1, "battlefield", "Ogre")];
const beamed = [{tap: "Island"}, {tap: "Island"}, {tap: "Wastes"}, {tap: "Wastes"}, {cast: TB, targets: [{card: "Ogre"}]}, {resolve: true}, {resolve: true}];
{
  const s = play(BEAM, beamed, {}, FIX);
  const ogre = idOf(s, "Ogre");
  eq([controllerOf(s, ogre), s.objects[ogre].controlledSinceTurn], [0, 1], "Rob controls the Ogre, since this turn (CR 302.6)");
  /* Maya takes it back until end of turn: the later change outlasts the Beam's (CR 613.7), and gives it back. */
  happen(s, {effect: "gainControl", targets: [ogre], until: "end-of-turn", toPlayer: 1}, {controller: 1, source: null});
  checkStateBasedActions(s);
  eq(controllerOf(s, ogre), 1, "Maya's until end of turn: hers, the Beam on it or not");
  drive(s, (st) => st.turn === 2 && st.phase === "UPKEEP");
  eq(controllerOf(s, ogre), 0, "the turn over: Rob's again");
}
{
  /* The Beam loses its abilities for the turn: the Ogre goes back to Maya, and returns to Rob once the Beam has them again. */
  const s = play(BEAM, beamed, {}, FIX);
  const ogre = idOf(s, "Ogre"), beam = idOf(s, TB);
  s.effects.push({id: "hush", layer: 6, affects: {ids: [beam]}, apply: {removeAllAbilities: true}, until: "end-of-turn", sourceController: 1});
  checkStateBasedActions(s);
  eq(controllerOf(s, ogre), 1, "the Beam without its abilities: Maya's Ogre");
  drive(s, (st) => st.turn === 2 && st.phase === "UPKEEP");
  eq(controllerOf(s, ogre), 0, "they come back: Rob's again");
}
{
  /* The Beam changes hands: Maya controls it, so she controls the Ogre. */
  const s = play(BEAM, beamed, {}, FIX);
  happen(s, {effect: "gainControl", targets: [idOf(s, TB)], toPlayer: 1}, {controller: 1, source: null});
  checkStateBasedActions(s);
  eq(controllerOf(s, idOf(s, "Ogre")), 1, "Maya controls the Beam: and the Ogre with it");
}
{
  /* Moved to another permanent: the first goes back, the new one is taken. */
  const s = play([...BEAM, at(1, "battlefield", "Hawk")], beamed, {}, FIX);
  const beam = idOf(s, TB), ogre = idOf(s, "Ogre"), hawk = idOf(s, "Hawk");
  s.objects[ogre].attachments = (s.objects[ogre].attachments ?? []).filter((a) => a !== beam);
  s.objects[beam].attachedTo = hawk;
  s.objects[hawk].attachments = [...(s.objects[hawk].attachments ?? []), beam];
  checkStateBasedActions(s);
  eq([controllerOf(s, ogre), controllerOf(s, hawk)], [1, 0], "attached to the Hawk: the Ogre Maya's, the Hawk Rob's");
}
{
  /* A Beam on the battlefield attached to nothing takes nothing, and goes to its owner's graveyard (CR 704.5m). */
  const s = play([at(0, "battlefield", TB)], [], {}, FIX);
  eq([inZone(s, "graveyard", TB) !== undefined, (s.effects ?? []).some((e) => e.byAura !== undefined)], [true, false], "unattached: to the graveyard, no control taken");
}

done("warp from the hand alone, exiled at the end step and castable by its owner after the turn; void any player's, this turn's; sneak at an instant's timing in its caster's declare blockers step, attacking whom the returned creature attacked; Omnath's mana kept as {C}; a Drone that blocks only flyers; and an Aura's control.");
