/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* TRAIN C, W2D: "THEN YOU MAY EXILE THIS SPELL AND FOUR CARDS NAMED SPHINX'S APPROACH FROM YOUR GRAVEYARD. IF YOU DO, ..." AND
 * "A DECK CAN HAVE ANY NUMBER OF CARDS NAMED SPHINX'S APPROACH" (CR 118.12a, 707.10a, 100.2a).
 *
 * unlessPays' `exileSelf` and `exileFromGraveyard` (effects/asking.mjs): a "you may ... if you do" whose cost is the spell
 * itself, exiled off the stack as it resolves -- so nothing then puts it in a graveyard (rules/stack.mjs) -- and that many of
 * the payer's graveyard's cards a selector describes. Fewer there, or the spell a copy (no card to exile), and there is no
 * paying, and nobody is asked; more there, and which ones is the payer's choice. The deck rule is a static the compiler
 * holds to the card's own name. Here: each of those, refused answers, and the compiler.
 */
import assert from "node:assert/strict";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {compileScript} from "../game/engine/cards/index.mjs";
import {beginResolution} from "../game/engine/script/resolution.mjs";
import {awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {addObject} from "../game/engine/state/index.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const APPROACH = "Sphinx's Approach";
const table = (graveyard) => runScenario({name: "unless-exile", setup: [{seat: 0, zone: "graveyard", cards: graveyard}], steps: []}, index.definition, {}).state;
/* The spell on the stack, as it would be resolving: its own object, a card -- or a copy. */
const onStack = (s, copy = false) => addObject(s, {...index.definition(APPROACH), card: APPROACH, owner: 0, controller: 0, ...(copy ? {copy: true} : {})}, "stack");
const EXILE = (more = {}) => [{effect: "unlessPays", who: "you", ifPaid: true, exileSelf: true, exileFromGraveyard: {count: 4, selector: {named: APPROACH}},
  effects: [{effect: "gainLife", amount: 5}], ...more}];
const graveyard = (s) => s.zones.graveyard[0].map((id) => s.objects[id].card);
const exiled = (s) => s.zones.exile.map((id) => s.objects[id].card);
const PAY = `Exile ${APPROACH} and four cards named ${APPROACH} from your graveyard`;

{
  const s = table([APPROACH, APPROACH, APPROACH, APPROACH, "Island"]);
  const spell = onStack(s);
  beginResolution(s, EXILE(), {controller: 0, source: spell});
  const q = awaitingChoice(s);
  eq([q.title, q.options.map((o) => o.label)], [`${APPROACH}: exile ${APPROACH} and four cards named ${APPROACH} from your graveyard?`, [PAY, "Don't pay"]], "asked, in the card's words");
  resolveAwaiting(s, [0]);
  eq([exiled(s).length, graveyard(s), s.objects[spell], s.players[0].life], [5, ["Island"], undefined, 45], "this spell and the four exiled, the Island left; and if you do, what follows");
}
{
  /* Fewer than four there, or the spell a copy -- no card to exile (CR 707.10a): no paying it, and nobody is asked. */
  const s = table([APPROACH, APPROACH, APPROACH]);
  const out = beginResolution(s, EXILE(), {controller: 0, source: onStack(s)});
  eq([out.status, s.players[0].life], ["done", 40], "three: nothing asked, nothing done");
  const t = table([APPROACH, APPROACH, APPROACH, APPROACH]);
  eq(beginResolution(t, EXILE(), {controller: 0, source: onStack(t, true)}).status, "done", "a copy of the spell: nothing asked");
  const u = table([APPROACH, APPROACH, APPROACH, APPROACH]);
  eq(beginResolution(u, EXILE({exileSelf: undefined}), {controller: 0, source: null}).status, "waiting", "the graveyard's cards alone (no exileSelf) are a cost a source need not be");
  eq(awaitingChoice(u).title, `exile four cards named ${APPROACH} from your graveyard?`, "and said so");
  const v = table([APPROACH]);
  beginResolution(v, EXILE({exileSelf: undefined, exileFromGraveyard: {count: 1, selector: {named: APPROACH}}}), {controller: 0, source: null});
  eq(awaitingChoice(v).options[0].label, `Exile one card named ${APPROACH} from your graveyard`, "one card, said as one");
}
{
  /* Five there: which four is the payer's choice; refused answers; then the one not chosen stays. Declined: nothing moves. */
  const s = table([APPROACH, APPROACH, APPROACH, APPROACH, APPROACH]);
  const spell = onStack(s);
  beginResolution(s, EXILE(), {controller: 0, source: spell});
  resolveAwaiting(s, [0]);
  const q = awaitingChoice(s);
  eq([q.title, q.mode, q.min, q.max, q.options.length], ["Choose four cards to exile", "many", 4, 4, 5], "which four of the five");
  let refused = 0;
  for (const bad of [[0, 1, 2], [0, 1, 2, 3, 4], [0, 1, 1, 2], [0, 1, 2, 3, 3], [0, 1, 2, 9]]) try { resolveAwaiting(s, bad); } catch { refused += 1; }
  eq(refused, 5, "three, five, one twice (twice over), one not offered: each refused");
  const left = s.zones.graveyard[0][4];
  resolveAwaiting(s, [0, 1, 2, 3]);
  eq([s.zones.graveyard[0], exiled(s).length, s.players[0].life], [[left], 5, 45], "the fifth stays");
  const t = table([APPROACH, APPROACH, APPROACH, APPROACH]);
  beginResolution(t, EXILE(), {controller: 0, source: onStack(t)});
  resolveAwaiting(t, [1]);
  eq([graveyard(t).length, exiled(t), t.players[0].life], [4, [], 40], "declined: nothing exiled, nothing follows");
}

/* ---- the compiler ---- */
const compiled = (abilities) => compileScript({schema: "CrankCardScript@1",
  identity: {name: APPROACH, oracleId: "x", types: ["Instant"], subtypes: [], manaCost: "{1}{U}{U}", colors: ["U"], colorIdentity: ["U"]},
  oracleText: "x", source: "hand", abilities}).problems;
const RULE = (text) => ({kind: "static", text, rule: "any-number-in-deck", affects: {self: true}});
{
  eq(compiled([{kind: "spell", text: "x", effects: EXILE()}, RULE(`A deck can have any number of cards named ${APPROACH}.`)]), [], "the spell and its deck rule compile");
  ok(compiled([{kind: "spell", text: "x", effects: EXILE()}, RULE("A deck can have any number of cards named Relentless Rats.")]).some((p) => p.includes("its own name")),
    "the deck rule of another card's name: refused");
  ok(compiled([{kind: "spell", text: "x", effects: EXILE({exileFromGraveyard: {count: 0, selector: {named: APPROACH}}})}]).some((p) => p.includes("{count, selector}")), "none to exile: refused");
  ok(compiled([{kind: "spell", text: "x", effects: EXILE({exileFromGraveyard: {count: 4}})}]).some((p) => p.includes("{count, selector}")), "no selector: refused");
  ok(compiled([{kind: "spell", text: "x", effects: EXILE({exileFromGraveyard: {count: 4, selector: {types: ["Instant"]}}})}]).some((p) => p.includes("{count, selector}")), "cards not of a name: refused, not built");
  ok(compiled([{kind: "spell", text: "x", effects: EXILE({exileFromGraveyard: {count: 11, selector: {named: APPROACH}}})}]).some((p) => p.includes("{count, selector}")), "eleven: refused");
  ok(compiled([{kind: "spell", text: "x", effects: EXILE({exileFromGraveyard: {count: 4, selector: {named: APPROACH}, from: "hand"}})}]).some((p) => p.includes("{count, selector}")), "a word it does not know: refused");
  ok(compiled([{kind: "spell", text: "x", effects: EXILE({exileFromGraveyard: {count: 4, selector: {named: APPROACH, flavor: 1}}})}]).some((p) => p.includes("selector grammar")), "a selector the grammar does not know: refused");
  ok(compiled([{kind: "spell", text: "x", effects: EXILE({exileSelf: false})}]).some((p) => p.includes("exileSelf is true")), "exileSelf other than true: refused");
  ok(compiled([{kind: "activated", text: "x", cost: [{atom: "{T}"}], effects: EXILE()}]).some((p) => p.includes("on a spell")), "\"exile this spell\" on an ability: refused");
  ok(compiled([{kind: "spell", text: "x", effects: EXILE({exileFromGraveyard: undefined})}]).some((p) => p.includes("{count, selector}")), "exileSelf alone: refused");
}

console.log(`engine-unless-exile: ${checks} checks passed -- "you may exile this spell and four named cards from your graveyard": offered only when it can be paid, which four asked, the spell gone off the stack; its deck rule its own name.`);
