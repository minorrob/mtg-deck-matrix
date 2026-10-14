/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* TRAIN E, WAVE 3 (g1): what the scenarios of sixteen of Rob's v43 library cards cannot reach.
 *
 *   - "EACH OPPONENT CAN'T DRAW MORE THAN ONE CARD EACH TURN" (Narset, Parter of Veils; CR 121.2b): the static
 *     `cant-draw-more-than-one` (rules/statics.mjs, drawForbidden), read where a card is drawn -- an effect's draw
 *     (script/effects/zones.mjs), the draw step's (rules/turn.mjs) -- so a draw it forbids is no draw from an empty library
 *     either (CR 101.2), and where a "you may draw" is offered (script/effects/asking.mjs, modal; CR 121.3).
 *   - "CHOOSE UP TO FOUR. YOU MAY CHOOSE THE SAME MODE MORE THAN ONCE" (Moment of Reckoning; CR 700.2d): a modal's `choose: 0`
 *     and `sameMode` (cards/index.mjs, script/schema.mjs, rules/actions.mjs withModes), each mode's target a counted one of one
 *     (script/bind.mjs, modalScript), and the table's words for no modes at all (room/room.mjs).
 *   - "IF THIS IS THE FIRST TIME THIS ABILITY HAS RESOLVED THIS TURN" (Nissa, Leyline Tamer): the condition `firstResolution`
 *     (script/condition.mjs), each resolution counted by the object its ability came from (rules/stack.mjs) and handed to the
 *     resolution (script/resolution.mjs) -- its source gone, or a new object, and a branch's `if`.
 */
import {legalActions, applyAction} from "../game/engine/rules/actions.mjs";
import {STATIC_RULES, drawForbidden} from "../game/engine/rules/statics.mjs";
import {checkStateBasedActions} from "../game/engine/rules/sba.mjs";
import {conditionHolds, conditionProblems, asksFirstResolution} from "../game/engine/script/condition.mjs";
import {modalScript} from "../game/engine/script/bind.mjs";
import {offerDetails} from "../game/room/room.mjs";
import {awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {beginResolution} from "../game/engine/script/resolution.mjs";
import {play, drive, happen, at, idOf, compiled, labels, index, checks, creature} from "./helpers/x11-keywords.mjs";

const {eq, ok, done} = checks("engine-train-e-g1");
const NARSET = "Narset, Parter of Veils", MOMENT = "Moment of Reckoning", NISSA = "Nissa, Leyline Tamer";
const spell = (types, text, effects, targets = []) => ({types, manaCost: "{U}", colors: ["U"], spell: {id: "s", text, targets, effects}});
const FIX = {
  Ogre: creature(["Ogre"], 3, 3, {colors: ["R"]}),
  Tidings: spell(["Instant"], "Draw a card.", [{effect: "draw", count: 1}]),
  Study: spell(["Sorcery"], "Draw two cards.", [{effect: "draw", count: 2}]),
  Recall: spell(["Instant"], "Return target creature to its owner's hand.", [{effect: "moveZone", targets: {target: 0}, to: "hand"}], [{what: "permanent", types: ["Creature"]}]),
  Sprout: {types: ["Sorcery"], manaCost: "{G}", colors: ["G"], spell: {id: "s", text: "Put up to two land cards from your hand onto the battlefield.", targets: [],
    effects: [{effect: "chooseCard", zone: "hand", count: 2, selector: {types: ["Land"]}, to: "battlefield", upTo: true}]}},
};
const casts = (s, name, seat = 0) => legalActions(s, seat).filter((a) => a.kind === "cast" && s.objects[a.objectId]?.card === name);
const handOf = (s, seat) => s.zones.hand[seat].map((id) => s.objects[id].card);
const MR7 = ["Plains", "Plains", "Swamp", "Swamp", "Wastes", "Wastes", "Wastes"];

/* ---- Narset, Parter of Veils: each opponent can't draw more than one card each turn ---- */
{
  eq(STATIC_RULES["cant-draw-more-than-one"], "script/effects/zones.mjs", "the static is in the closed list of rules, read where cards are drawn");
  const narset = index.definition(NARSET);
  eq(narset.abilities.filter((a) => a.kind === "static").map((a) => [a.rule, a.affects]), [["cant-draw-more-than-one", {what: "player", who: "opponent"}]], "Narset's static: her opponents");
  /* Who may draw how many, as Maya's draws mount: none drawn, one is allowed and two are not; one drawn, none more. */
  const s = play([at(0, "battlefield", NARSET), at(1, "battlefield", "Island"), at(1, "hand", "Tidings")], [], {}, FIX);
  eq([drawForbidden(s, 1), drawForbidden(s, 1, 2), drawForbidden(s, 0, 2)], [false, true, false], "Maya with none drawn: one card yes, two no; Rob is no opponent of his own");
  happen(s, {effect: "draw", count: 1}, {controller: 1, source: null});
  eq([s.players[1].drawnThisTurn, drawForbidden(s, 1), handOf(s, 1).length], [1, true, 2], "one drawn: no more this turn");
  /* An empty library: a draw she can't make is not tried for, and so not lost to (CR 101.2, 704.5b). */
  happen(s, {effect: "mill", count: 30}, {controller: 1, source: null});
  happen(s, {effect: "draw", count: 1}, {controller: 1, source: null});
  checkStateBasedActions(s);
  eq([s.zones.library[1].length, s.players[1].drewFromEmpty ?? false, s.players[1].lost ?? false], [0, false, false], "her library empty, the forbidden draw is no draw from it: she does not lose");
  /* Narset gone, the limit goes with her: that draw is tried, from the empty library, and lost to. */
  happen(s, {effect: "moveZone", targets: [idOf(s, NARSET)], to: "graveyard"}, {controller: 1, source: null});
  eq(drawForbidden(s, 1), false, "Narset gone: Maya may draw again");
  happen(s, {effect: "draw", count: 1}, {controller: 1, source: null});
  checkStateBasedActions(s);
  eq([s.players[1].drewFromEmpty, s.players[1].lost], [true, true], "and her draw from the empty library loses her the game");
}
{
  /* Three players: each opponent counted on their own. */
  const s = play([at(0, "battlefield", NARSET)], [], {seats: 3}, FIX);
  happen(s, {effect: "draw", count: 2}, {controller: 1, source: null});
  happen(s, {effect: "draw", count: 3}, {controller: 2, source: null});
  happen(s, {effect: "draw", count: 2}, {controller: 0, source: null});
  eq([s.players[1].drawnThisTurn, s.players[2].drawnThisTurn, s.zones.hand[0].length], [1, 1, 3], "Maya one of two, Trey one of three; Rob, who drew for his turn, two more");
}
{
  /* The draw step's draw (rules/turn.mjs): Maya draws in her upkeep, and her turn's draw is a second card. */
  const s = play([at(0, "battlefield", NARSET), at(1, "battlefield", "Island"), at(1, "hand", "Tidings")],
    [{to: {turn: 2, phase: "UPKEEP"}}, {tap: "Island", seat: 1}, {cast: "Tidings", seat: 1}, {resolve: true}, {to: {turn: 2, phase: "MAIN1"}}], {}, FIX);
  eq([s.players[1].drawnThisTurn, s.zones.library[1].length, s.zones.hand[1].length], [1, 19, 1], "her draw step drew nothing: one card drawn this turn");
  const t = play([at(1, "battlefield", "Island"), at(1, "hand", "Tidings")],
    [{to: {turn: 2, phase: "UPKEEP"}}, {tap: "Island", seat: 1}, {cast: "Tidings", seat: 1}, {resolve: true}, {to: {turn: 2, phase: "MAIN1"}}], {}, FIX);
  eq([t.players[1].drawnThisTurn, t.zones.library[1].length], [2, 18], "without Narset: both");
}
{
  /* A "you may draw" its chooser can't take (CR 121.3): the "Yes" is gone, and with only "No" left nothing is asked. Rob's own
     "you may draw" is his to take. Each asked as a resolution asks it (script/resolution.mjs), on a table of its own. */
  const mayDraw = (count) => ({effect: "modal", title: "You may draw.", modes: [{text: "Yes", effects: [{effect: "draw", count}, {effect: "discard", count: 1}]}, {text: "No", effects: []}]});
  const thenDraw = {effect: "modal", title: "x", modes: [{text: "Yes", effects: [{effect: "gainLife", amount: 1}, {effect: "draw", count: 1}]}, {text: "No", effects: []}]};
  const counted = {effect: "modal", title: "x", modes: [{text: "Yes", effects: [{effect: "draw", count: {count: {what: "card", zone: "hand", controller: "you"}}}]}, {text: "No", effects: []}]};
  /* The question a resolution of this one effect asks `controller`, after Maya has drawn `drawn` cards this turn. */
  const ask = (effect, controller, {drawn = 0, hand = []} = {}) => {
    const s = play([at(0, "battlefield", NARSET), at(1, "hand", ...hand)], [], {}, FIX);
    for (let n = 0; n < drawn; n += 1) happen(s, {effect: "draw", count: 1}, {controller: 1, source: null});
    beginResolution(s, [effect], {controller, source: null});
    return {asked: s.awaiting ? labels(s) : null, hand: handOf(s, 1).length};
  };
  eq(ask(mayDraw(2), 1), {asked: null, hand: 0}, "Maya, none drawn: \"you may draw two\" asks nothing (CR 121.2b)");
  eq(ask(mayDraw(1), 1).asked, ["Yes", "No"], "\"you may draw a card\" for her first: hers to take");
  eq(ask(mayDraw(1), 1, {drawn: 1}), {asked: null, hand: 1}, "one drawn: \"you may draw a card. If you do, discard\" asks nothing, and she discards nothing");
  eq(ask(mayDraw(2), 0).asked, ["Yes", "No"], "Rob's own \"you may draw two\": asked");
  eq(ask(thenDraw, 1, {drawn: 1}).asked, ["Yes", "No"], "\"you may gain 1 life, then draw\" is no choice to draw: asked");
  /* A draw counted as it is asked: "you may draw cards equal to the cards in your hand". */
  eq(ask(counted, 1, {hand: ["Ogre"]}).asked, ["Yes", "No"], "a counted draw of one, for her first: asked");
  eq(ask(counted, 1, {hand: ["Ogre", "Ogre"]}).asked, null, "a counted draw of two: not");
  /* Only the chooser's own draw: "you may have each opponent draw a card" (`who`) and one its chooser makes for another player
     (`chooser`) are no choice of hers to draw. */
  eq(ask({effect: "modal", title: "x", modes: [{text: "Yes", effects: [{effect: "draw", count: 1, who: "opponent"}]}, {text: "No", effects: []}]}, 1, {drawn: 1}).asked, ["Yes", "No"],
    "Maya, one drawn, may have Rob draw: asked");
  eq(ask({effect: "modal", title: "x", chooser: 1, modes: [{text: "Yes", effects: [{effect: "draw", count: 1}]}, {text: "No", effects: []}]}, 0, {drawn: 1}).asked, ["Yes", "No"],
    "Maya chooses whether Rob draws: asked");
}

/* ---- Moment of Reckoning: choose up to four, the same mode more than once ---- */
{
  const moment = index.definition(MOMENT);
  eq([moment.spell.modal.choose, moment.spell.modal.upTo, moment.spell.modal.sameMode], [0, 4, true], "compiled: none to four, the same mode again");
  const modal = (more) => compiled([{kind: "spell", text: "x", effects: [{effect: "modal", choose: 1, chooseUpTo: 2, modes: [{text: "a", targets: [], effects: [{effect: "draw", count: 1}]},
    {text: "b", targets: [], effects: [{effect: "gainLife", amount: 1}]}], ...more}]}], {types: ["Sorcery"]}).problems;
  eq(modal({sameMode: true}), [], "sameMode beside chooseUpTo");
  ok(modal({sameMode: false}).some((p) => p.includes("sameMode: true")), "sameMode is true");
  ok(modal({chooseUpTo: undefined, sameMode: true}).some((p) => p.includes("sameMode: true, beside chooseUpTo")), "and only beside chooseUpTo");
  eq(modal({choose: 0}), [], "choose: 0 beside chooseUpTo: \"up to two\"");
  ok(modal({choose: 0, chooseUpTo: undefined}).some((p) => p.includes("choose: 0 is \"up to\"")), "choose: 0 without it is refused");
  const plain = compiled([{kind: "spell", text: "x", effects: [{effect: "modal", choose: 1, chooseUpTo: 2, modes: [{text: "a", targets: [], effects: [{effect: "draw", count: 1}]},
    {text: "b", targets: [], effects: [{effect: "gainLife", amount: 1}]}]}]}], {types: ["Sorcery"]}).definition;
  eq(plain.spell.modal.sameMode, undefined, "a modal that does not say so: no sameMode");
}
{
  /* Each mode's target a counted one of one, its own instance of "target" (CR 700.2d) -- one already counted keeps its own
     count, and a modal without sameMode keeps its plain targets. */
  const destroy = {text: "Destroy target creature.", targets: [{what: "permanent", types: ["Creature"]}], effects: [{effect: "destroy", targets: {target: 0}}]};
  const upTo = {text: "Up to one.", targets: [{what: "permanent", types: ["Creature"], count: {max: 1}}], effects: [{effect: "tap", targets: {target: 0}}]};
  const same = modalScript({sameMode: true, modes: [destroy, upTo]}, [0, 0, 1]);
  eq(same.targets.map((t) => t.count), [{min: 1, max: 1}, {min: 1, max: 1}, {max: 1}], "sameMode: two of one each, and the up-to-one as it says");
  eq(same.effects.map((e) => e.targets), [{target: 0}, {target: 1}, {target: 2}], "each instance's effect aimed at its own");
  eq(modalScript({modes: [destroy, upTo]}, [0, 1]).targets.map((t) => t.count), [undefined, {max: 1}], "without sameMode, the plain target stays plain");
}
{
  /* A crowded board: twelve nonland permanents for each destroy -- twenty thousand ways as a product, a handful of offers as
     picks (no throw at TARGET_CHOICES_MAX). */
  const s = play([at(0, "hand", MOMENT), at(0, "battlefield", ...MR7), at(0, "graveyard", "Bear"), at(1, "battlefield", ...Array(12).fill("Ogre"))], MR7.map((l) => ({tap: l})), {}, FIX);
  const offers = casts(s, MOMENT);
  eq(offers.length, 15, "fifteen offers: no modes, and every mix of one to four");
  eq(offers.map((a) => a.modes.length).sort(), [0, 1, 1, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 4], "of none to four modes");
  ok(offers.every((a) => a.targets.every((t) => t.kind === "choose" && t.min === 1 && t.max === 1)), "each target a placeholder, picked once the offer is taken");
  ok(offerDetails(s, 0, offers.filter((a) => a.modes.length === 0))[0].includes("no modes"), `the table says no modes: ${offerDetails(s, 0, offers.filter((a) => a.modes.length === 0))[0]}`);
  ok(offerDetails(s, 0, offers.filter((a) => JSON.stringify(a.modes) === "[0,0]"))[0].includes("Destroy target nonland permanent. + Destroy target nonland permanent."),
    "and a mode chosen twice, twice");
  /* Taken: four questions in turn, the same Ogre for each, and one destruction. */
  applyAction(s, 0, offers.find((a) => JSON.stringify(a.modes) === "[0,0,0,0]"));
  const ogre = idOf(s, "Ogre");
  for (let n = 0; n < 4; n += 1) {
    eq([s.awaiting?.kind, s.awaiting?.index], ["choose-targets", n], `the target of destroy ${n + 1} asked`);
    resolveAwaiting(s, [awaitingChoice(s).options.find((o) => o.cardId === ogre).index]);
  }
  eq(s.stack[0].targets.map((t) => t.map((x) => x.id)), [[ogre], [ogre], [ogre], [ogre]], "the same Ogre four times (CR 700.2d)");
  drive(s, (st) => st.stack.length === 0 && st.priorityPlayer !== null);
  eq([s.zones.graveyard[1].length, s.zones.battlefield.filter((id) => s.objects[id].card === "Ogre").length], [1, 11], "destroyed once: eleven Ogres left");
}

/* ---- Nissa, Leyline Tamer: the first time this ability has resolved this turn ---- */
{
  eq(conditionProblems({firstResolution: true}), [], "firstResolution: true");
  ok(conditionProblems({firstResolution: false}).some((p) => p.includes("firstResolution is true")), "and only true");
  eq([asksFirstResolution([{effect: "draw", count: 1}]), asksFirstResolution([{effect: "branch", if: {firstResolution: true}, then: [], otherwise: []}])], [false, true],
    "asked by an effect, nested in a branch too");
  const s = play([], [], {}, FIX);
  eq([0, 1, undefined].map((resolvedBefore) => conditionHolds(s, {firstResolution: true}, {controller: 0, resolvedBefore})), [true, false, false],
    "none before: the first; one before: not; uncounted: not");
  const trigger = (more) => compiled([{kind: "triggered", text: "x", trigger: {on: "enters", who: "self"}, effects: [{effect: "draw", count: 1, condition: {firstResolution: true}}], ...more}]).problems;
  eq(trigger({}), [], "an effect's condition, of a triggered ability");
  ok(trigger({condition: {firstResolution: true}}).some((p) => p.includes("firstResolution is asked of a triggered or activated ability's effect")), "never the ability's own condition");
  ok(compiled([{kind: "spell", text: "x", targets: [], effects: [{effect: "draw", count: 1, condition: {firstResolution: true}}]}], {types: ["Sorcery"]}).problems
    .some((p) => p.includes("firstResolution is asked")), "nor a spell's");
  eq(compiled([{kind: "activated", text: "x", cost: [{atom: "mana", cost: "{1}"}], effects: [{effect: "draw", count: 1, condition: {firstResolution: true}}]}]).problems, [],
    "an activated ability's effect");
  /* A malformed condition or effect is refused with the rest, never thrown on. */
  ok(compiled([{kind: "triggered", text: "x", trigger: {on: "enters", who: "self"}, effects: [{effect: "draw", count: 1}], condition: "x"}]).problems.length > 0, "a condition that is no object: refused");
  ok(compiled([{kind: "spell", text: "x", targets: [], effects: [null]}], {types: ["Sorcery"]}).problems.length > 0, "an effect that is no object: refused");
  /* Counted only where asked: Narset's -2 resolves, and nothing is kept. */
  const t = play([at(0, "battlefield", NARSET)], [{activate: NARSET}, {resolve: true}], {}, FIX);
  eq([t.stack.length, t.resolutions], [0, undefined], "an ability that asks nothing of it: its resolutions not counted");
}
{
  /* Two triggers waiting, and Nissa returned to Rob's hand between them: the second is still this ability, its count kept by
     the object it came from (CR 113.7a) -- it draws, and reveals nothing. */
  const s = play([at(0, "battlefield", NISSA, "Forest", "Island"), at(0, "hand", "Sprout", "Plains", "Mountain", "Recall")],
    [{tap: "Forest"}, {cast: "Sprout"}, {resolve: true}, {choose: ["Plains", "Mountain"]}, {answer: [0, 1]}, {resolve: true}],
    {library: ["Wastes", "Bear", "Wastes", "Ogre"]}, FIX);
  eq([s.stack.length, s.zones.battlefield.filter((id) => s.objects[id].card === "Bear").length], [1, 1], "the first resolved: the Bear revealed and put onto the battlefield");
  const nissa = idOf(s, NISSA);
  eq(s.resolutions.counts[`${nissa}:${s.stack[0].abilityId}`], 1, "counted by Nissa's object and her ability");
  happen(s, {effect: "moveZone", targets: [nissa], to: "hand"}, {controller: 0, source: null});
  drive(s, (st) => st.stack.length === 0 && st.priorityPlayer !== null);
  eq([handOf(s, 0).sort(), s.zones.battlefield.some((id) => s.objects[id].card === "Ogre"), s.zones.library[0].length], [[NISSA, "Recall", "Wastes", "Wastes"], false, 17],
    "Nissa gone, the second still drew, and revealed nothing: no Ogre");
}
{
  /* Gone and back, Nissa is a new object (CR 400.7), her ability a new one: its first resolution reveals again, the same turn. */
  const s = play([at(0, "battlefield", NISSA, "Forest"), at(0, "hand", "Sprout", "Plains", "Island")], [{play: "Plains"}, {resolve: true}],
    {library: ["Wastes", "Bear", "Wastes", "Ogre"]}, FIX);
  const before = idOf(s, NISSA);
  happen(s, {effect: "moveZone", targets: [before], to: "exile"}, {controller: 0, source: null});
  const [exiled] = s.zones.exile;
  happen(s, {effect: "moveZone", targets: [exiled], to: "battlefield"}, {controller: 0, source: null});
  ok(idOf(s, NISSA) !== before, "a new object");
  happen(s, {effect: "moveZone", targets: [s.zones.hand[0].find((id) => s.objects[id].card === "Island")], to: "battlefield"}, {controller: 0, source: null});
  drive(s, (st) => st.stack.length > 0);
  drive(s, (st) => st.stack.length === 0 && st.priorityPlayer !== null);
  eq(["Bear", "Ogre"].map((n) => s.zones.battlefield.some((id) => s.objects[id].card === n)), [true, true], "the Bear for the old Nissa, the Ogre for the new, one turn");
}
{
  /* A branch's `if` (script/resolution.mjs): "if this is the first time ..., gain 5 life; otherwise, 1". */
  const tamer = compiled([{kind: "triggered", text: "x", trigger: {on: "enters", who: "any", filter: {types: ["Land"], controller: "you"}},
    effects: [{effect: "branch", if: {firstResolution: true}, then: [{effect: "gainLife", amount: 5}], otherwise: [{effect: "gainLife", amount: 1}]}]}]).definition;
  const s = play([at(0, "battlefield", "Tamer", "Forest"), at(0, "hand", "Sprout", "Plains", "Island")],
    [{play: "Plains"}, {resolve: true}, {tap: "Forest"}, {cast: "Sprout"}, {resolve: true}, {choose: ["Island"]}, {resolve: true}], {}, {...FIX, Tamer: tamer});
  eq(s.players[0].life, 46, "5 for the first, 1 for the second");
}

done("Narset's one card each turn for each opponent -- an effect's draws, the draw step's, an empty library and a choice to draw; Moment of Reckoning's none to four modes, the same one again, each target its own; and Nissa's first resolution this turn, its source gone or a new object, a branch's too.");
