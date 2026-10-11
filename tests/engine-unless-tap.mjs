/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* TRAIN C, PHASE 2 (p3-costs): "YOU MAY TAP ANOTHER UNTAPPED MERFOLK YOU CONTROL. WHEN YOU DO, ..." (Meanders Guide; CR
 * 118.12a, 603.12) -- a cost of tapping a permanent, paid as an effect resolves, and a reflexive trigger when it is.
 *
 * unlessPays' `tap`: each untapped permanent of the payer's its selector describes its own option, `another` never the
 * ability's source, and not paying; tapped as it is paid, still untapped and the payer's or refused. What the scenarios
 * cannot reach: whose permanents, a permanent tapped before the answer, the words asked, four players, and the schema.
 */
import assert from "node:assert/strict";
import {table, on, bear, card} from "./helpers/b4-table.mjs";
import {beginResolution} from "../game/engine/script/resolution.mjs";
import {awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {validateScript} from "../game/engine/script/schema.mjs";

let checks = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const merfolk = {card: "Merfolk", types: ["Creature"], subtypes: ["Merfolk"], power: 1, toughness: 1};
const guide = card("Meanders Guide");
const effect = guide.abilities.find((a) => a.kind === "triggered").effects[0];
{
  /* The options: Rob's other untapped Merfolk, each its own, then not paying -- never the source, a tapped one, a Bear, or
     Maya's Merfolk. In four seats, the payer is "you". */
  const s = table(4);
  const source = on(s, guide), first = on(s, {...merfolk, card: "First"}), tired = on(s, {...merfolk, card: "Tired"});
  s.objects[tired].tapped = true;
  on(s, bear); on(s, {...merfolk, card: "Hers"}, 1);
  const second = on(s, {...merfolk, card: "Second"});
  on(s, {...bear, card: "Old Bear", manaCost: "{1}{G}"}, 0, "graveyard");
  beginResolution(s, [effect], {controller: 0, source});
  const choice = awaitingChoice(s);
  eq([s.awaiting.player, choice.options.map((o) => o.cardId ?? null)], [0, [first, second, null]], "Rob is asked: First, Second, or not paying");
  eq(choice.title, "Meanders Guide: tap another untapped Merfolk you control?", "in the card's words");
  eq(choice.options.map((o) => o.label), ["Tap First", "Tap Second", "Don't pay"], "each named");
  resolveAwaiting(s, [1]);
  eq([s.objects[second].tapped, s.objects[first].tapped, [...(s.pendingTriggers ?? []), ...s.stack].length + (s.awaiting ? 1 : 0) > 0], [true, false, true], "Second tapped, and when he does, the reflexive trigger");
}
{
  /* Not paid: nothing tapped, and no trigger. Tapped before the answer: refused, nothing done. */
  const s = table();
  const source = on(s, guide), first = on(s, {...merfolk, card: "First"});
  beginResolution(s, [effect], {controller: 0, source});
  resolveAwaiting(s, [1]);
  eq([s.objects[first].tapped, (s.pendingTriggers ?? []).length], [false, 0], "declined: nothing");
  const t = table();
  const from = on(t, guide), other = on(t, {...merfolk, card: "Other"});
  beginResolution(t, [effect], {controller: 0, source: from});
  t.objects[other].tapped = true;
  eq(awaitingChoice(t).options.map((o) => o.label), ["Don't pay"], "tapped meanwhile: asked again, it is no longer an option");
  resolveAwaiting(t, [0]);
  eq((t.pendingTriggers ?? []).length, 0, "and nothing triggered");
}
{
  /* "Tap an untapped creature you control": its words with "an". */
  const s = table();
  const source = on(s, bear); on(s, {...bear, card: "Cub"});
  beginResolution(s, [{effect: "unlessPays", who: "you", tap: {types: ["Creature"], another: true}, ifPaid: true, effects: [{effect: "gainLife", amount: 2}]}], {controller: 0, source});
  eq(awaitingChoice(s).title, "Bear: tap another untapped creature you control?", "another");
  const t = table();
  const from = on(t, bear);
  beginResolution(t, [{effect: "unlessPays", who: "you", tap: {types: ["Creature"]}, ifPaid: true, effects: [{effect: "gainLife", amount: 2}]}], {controller: 0, source: from});
  eq(awaitingChoice(t).title, "Bear: tap an untapped creature you control?", "and \"an\" before untapped");
  resolveAwaiting(t, [0]);
  eq([t.objects[from].tapped, t.players[0].life], [true, 42], "its own source may pay, when the words do not say another; and what follows paying happens");
}
{
  const script = (extra) => ({schema: "CrankCardScript@1", source: "hand", identity: {name: "Test", oracleId: "00000000-0000-4000-8000-000000000000", types: ["Sorcery"], manaCost: "{U}"},
    oracleText: "Test.", abilities: [{kind: "spell", text: "Test.", effects: [{effect: "unlessPays", who: "you", tap: {subtypes: ["Merfolk"]}, ifPaid: true, effects: [{effect: "draw", count: 1}], ...extra}]}]});
  eq(validateScript(script({})).valid, true, "the schema admits a tap cost");
  eq([validateScript(script({returnToHand: {types: ["Creature"]}})).valid, validateScript(script({discard: true})).valid, validateScript(script({tap: {flavor: 1}})).valid], [false, false, false],
    "and refuses it beside another cost of a permanent or a card, or with a selector the grammar has not");
}
console.log(`engine-unless-tap: ${checks} checks passed`);
