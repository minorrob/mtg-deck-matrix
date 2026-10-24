/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* WHY A CARD CAN'T BE PLAYED NOW (Linear ROB-24: "show why another card is unavailable instead of silently suggesting all
 * actions wait until Main 1"; for Rob's one-person, three-AI table, Oct 21).
 *
 *   1. The engine (rules/actions.mjs, whyNot), each reason from the facts the offers are made from:
 *      a land a second time, a land on another player's turn, a creature at the wrong time on either turn, too little mana,
 *      a color nothing untapped makes, the commander tax counted in, no target to cast it at -- and nothing for a card
 *      that is offered, or isn't this player's to play.
 *   2. The room (game/room/room.mjs, view): while a seat holds priority, its own hand and command cards that nothing
 *      offered plays carry `why`; another seat's view never carries one on them, and a seat not holding priority gets none.
 */
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {legalActions, applyAction, whyNot} from "../game/engine/rules/actions.mjs";
import {recordCommanderCast} from "../game/engine/rules/commander.mjs";
import {memoryStorage} from "../game/engine/storage.mjs";
import {startRoom, basicCards} from "../game/room/room.mjs";

let checks = 0;
const ok = (c, m) => {assert.ok(c, m); checks += 1;};
const eq = (a, b, m) => {assert.deepEqual(a, b, m); checks += 1;};

/* ---- 1. THE ENGINE ---- */
const index = loadCardIndex();
const creature = (manaCost, colors = ["G"]) => ({types: ["Creature"], manaCost, colors, power: 2, toughness: 2});
const FIX = {
  Bear: creature("{1}{G}"), Ox: creature("{3}{G}{G}"),
  Bolt: {types: ["Instant"], manaCost: "{R}", colors: ["R"], spell: {id: "s", text: "Bolt deals 3 damage to any target.", targets: [{what: "any"}], effects: [{effect: "dealDamage", amount: 3, targets: {target: 0}}]}},
  Pacify: {types: ["Instant"], manaCost: "{G}", colors: ["G"], spell: {id: "s", text: "Tap target creature.", targets: [{what: "permanent", types: ["Creature"]}], effects: [{effect: "tap", targets: {target: 0}}]}},
  Leader: {types: ["Creature"], supertypes: ["Legendary"], manaCost: "{1}{G}", colors: ["G"], power: 2, toughness: 2},
};
const at = (seat, zone, ...cards) => ({seat, zone, cards});
const play = (name, setup, {steps = [], when} = {}) => runScenario({name, setup, steps, ...(when ? {at: when} : {})}, index.definition, FIX).state;
const idOf = (s, card, zone = "hand") => Object.values(s.objects).find((o) => o.card === card && o.zone === zone && o.owner === 0)?.id;
const why = (s, card, zone) => whyNot(s, 0, idOf(s, card, zone), legalActions(s, 0));

{
  const twice = play("two lands in hand", [at(0, "hand", "Forest", "Forest")], {steps: [{play: "Forest"}]});
  eq(why(twice, "Forest"), "You've played your land for this turn.", "a second land the same turn: you've played your land");
  eq(why(play("their turn", [at(0, "hand", "Forest")], {when: {turn: 2, phase: "MAIN1"}}), "Forest"), "Lands are played on your own turn.", "a land on another player's turn");
  eq(why(play("combat", [at(0, "battlefield", "Forest", "Forest"), at(0, "hand", "Bear")], {when: {turn: 1, phase: "COMBAT_BEGIN"}}), "Bear"),
    "It isn't an instant: cast it in your main phase, with nothing on the stack.", "a creature on your own turn outside a main phase: not an instant");
  eq(why(play("their main", [at(0, "battlefield", "Forest", "Forest"), at(0, "hand", "Bear")], {when: {turn: 2, phase: "MAIN1"}}), "Bear"),
    "It isn't an instant: cast it on your own turn.", "a creature on another player's turn: not an instant");
  eq(why(play("short", [at(0, "battlefield", "Forest"), at(0, "hand", "Ox")]), "Ox"), "It costs 5 mana, and you can make 1 now.", "too little mana: what it costs, and what you can make");
  eq(why(play("color", [at(0, "battlefield", "Forest"), at(0, "hand", "Bolt")]), "Bolt"), "It needs {R}, and nothing you have untapped makes it.", "a color nothing untapped makes");
  eq(why(play("no target", [at(0, "battlefield", "Forest"), at(0, "hand", "Pacify")]), "Pacify"), "There's no way to cast it now: its targets, or another of its costs.",
    "mana enough and its time, but no creature to aim it at");
  eq(why(play("offered", [at(0, "battlefield", "Forest", "Forest"), at(0, "hand", "Bear")]), "Bear"), null, "a card that is offered says nothing");
  const theirs = play("theirs", [at(1, "hand", "Bear")]);
  eq(whyNot(theirs, 0, Object.values(theirs.objects).find((o) => o.card === "Bear" && o.owner === 1).id, legalActions(theirs, 0)), null, "another player's card: not this player's to explain");
  /* The commander, cast once from the command zone before (CR 903.8): {1}{G} and {2} more, four, with three Forests. */
  const taxed = play("tax", [at(0, "battlefield", "Forest", "Forest", "Forest"), at(0, "command", "Leader")]);
  recordCommanderCast(taxed, 0, idOf(taxed, "Leader", "command"));
  eq(why(taxed, "Leader", "command"), "It costs 4 mana, the commander tax included, and you can make 3 now.", "the commander cast once before: its tax counted in, and said so");
  const untaxed = play("no tax", [at(0, "battlefield", "Forest"), at(0, "command", "Leader")]);
  eq(why(untaxed, "Leader", "command"), "It costs 2 mana, and you can make 1 now.", "and never cast: its own cost, no tax said");
}

/* ---- 2. THE ROOM ---- */
{
  const OX = creature("{3}{G}{G}"), BOLT = FIX.Bolt;
  const cards = (n) => n.startsWith("Ox") ? OX : n.startsWith("Bolt") ? BOLT : n.startsWith("General") ? {types: ["Creature"], power: 9, toughness: 9, manaCost: "{7}{G}{G}", colors: ["G"]} : basicCards(n);
  const deck = (seat) => ({commander: [`General ${seat}`], cards: Array.from({length: 99}, (_, i) => ["Forest", `Ox ${seat}-${i}`, `Bolt ${seat}-${i}`][i % 3])});
  const room = await startRoom({storage: memoryStorage(), matchId: "whynot", cards, seed: "whynot-1",
    pod: {seats: [{seatId: "rob", name: "Rob", pilot: "human", ...deck(0)}, {seatId: "maya", name: "Maya", pilot: "human", ...deck(1)}], passEmpty: true, endAsks: true, pooledTaps: true}});
  let robWhy = null, mayaSawRob = 0, idleWhy = 0, offeredWhy = 0;
  for (let n = 0; n < 600 && room.waitingOn; n += 1) {
    const who = room.waitingOn, other = who === "rob" ? "maya" : "rob";
    const v = room.view(who), o = room.view(other), d = v.decision;
    /* The other seat: not holding priority, its own cards carry nothing; and the seat asked's cards never show on its view. */
    const others = o.state.players[o.seat].zones;
    idleWhy += [...(others.Hand.cards || []), ...(others.Command.cards || [])].filter((c) => c.why).length;
    const theirsOfMine = o.state.players[v.seat].zones;
    mayaSawRob += [...(theirsOfMine.Hand.cards || []), ...(theirsOfMine.Command.cards || [])].filter((c) => c.why).length;
    /* A card the decision offers never carries a reason. */
    offeredWhy += [...v.state.players[v.seat].zones.Hand.cards, ...v.state.players[v.seat].zones.Command.cards].filter((c) => c.why && d.options.some((x) => x.cardId === c.cardId)).length;
    if (who === "rob" && d.kind === "priority" && !robWhy) {
      const mine = [...v.state.players[v.seat].zones.Hand.cards, ...v.state.players[v.seat].zones.Command.cards].filter((c) => c.why);
      if (mine.some((c) => /^Ox /.test(c.name)) && mine.every((c) => !d.options.some((x) => x.cardId === c.cardId))) robWhy = mine.map((c) => [c.name.split(" ")[0], c.why]);
    }
    const land = d.options.find((x) => /^Play /.test(x.label ?? "")), pass = d.options.find((x) => x.act === "pass" || /pass|keep|next/i.test(x.label ?? ""));
    const pick = d.kind === "priority" ? (land ?? pass ?? d.options[0]) : d.options[0];
    await room.act(who, {actionId: randomUUID(), revision: v.revision, kind: "answer", choiceId: d.id, indices: d.min > 1 ? d.options.slice(0, d.min).map((x) => x.index) : [pick.index]});
    if (robWhy && n > 80) break;
  }
  ok(robWhy && robWhy.some(([name, w]) => name === "Ox" && /^It costs 5 mana, and you can make \d now\.$/.test(w)),
    `holding priority, Rob's own cards that nothing offered plays say why (${JSON.stringify(robWhy?.slice(0, 3))})`);
  eq(offeredWhy, 0, "and a card the decision offers never carries one");
  eq(mayaSawRob, 0, "another seat's view never carries a why on Rob's cards (his commander is public; his reasons are not)");
  eq(idleWhy, 0, "and a seat not holding priority has none on its own");
}

console.log(`room-why-not: ${checks} checks passed — a card that can't be played now says why: a second land, a land or a creature at the wrong time, too little mana or a missing color, the commander tax counted in, no target; said by the room on a seat's own cards while it holds priority, and never to another seat.`);
