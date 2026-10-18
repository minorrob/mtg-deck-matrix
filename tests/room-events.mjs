/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* THE TABLE'S EVENTS IN THE VIEW (`events.v1`; Linear ROB-77; game/room/events.mjs and room.mjs).
 *
 * Two people, Forests, Bears and Salves, play until Rob has cast, attacked and been attacked:
 *   1. Each view carries `events`, each with the journal's id (`event:<n>`), a kind and the turn and phase, in order: a
 *      game's turns, draws, lands, casts, resolutions, taps, damage and life all appear.
 *   2. What a seat may know: Rob's draws in Maya's views are counts, never the card; his own name it; no event carries its
 *      `secret` out; and no card of Rob's is named to Maya by a draw.
 *   3. The decision an event answered: Rob's cast names the decision he answered.
 *   4. A view carries the change it shows: two views in a row share no event.
 *   5. A seat that reconnects asks `after` the last event it saw and gets exactly what came since; asked from before what
 *      the room keeps, it is told to start from the view (`eventsReset`).
 *   6. Reopened from storage, the same; replayed, the same events with the same ids.
 *   7. Each engine event as the table hears it (tableEvent): a face-down card unnamed, a card moved between two hidden zones
 *      no event, a spell countered and a token made each their own kind.
 */
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {memoryStorage, createMatchStore} from "../game/engine/storage.mjs";
import {startRoom, openRoom, basicCards} from "../game/room/room.mjs";
import {replayTape} from "../game/room/replay.mjs";
import {EVENTS_KEEP, tableEvent} from "../game/room/events.mjs";
import {createState, addObject} from "../game/engine/state/index.mjs";
import {runEffects} from "../game/engine/script/effects/index.mjs";

let checks = 0;
const ok = (c, m) => {assert.ok(c, m); checks += 1;};
const eq = (a, b, m) => {assert.deepEqual(a, b, m); checks += 1;};

const BEAR = {types: ["Creature"], power: 2, toughness: 2, manaCost: "{1}{G}", colors: ["G"]};
const SALVE = {types: ["Instant"], manaCost: "{G}", colors: ["G"], spell: {id: "s", text: "You gain 1 life.", targets: [], effects: [{effect: "gainLife", amount: 1}]}};
const GENERAL = {types: ["Creature"], power: 9, toughness: 9, manaCost: "{7}{G}{G}", colors: ["G"]};
const cards = (name) => (/^Bear /.test(name) ? BEAR : /^Salve /.test(name) ? SALVE : name.startsWith("General") ? GENERAL : basicCards(name));
const deck = (seat) => ({commander: [`General ${seat}`], cards: Array.from({length: 99}, (_, i) => (i % 2 ? "Forest" : `${["Bear", "Salve"][(i / 2) % 2]} ${seat}-${i}`))});
const pod = {seats: [{seatId: "rob", name: "Rob", pilot: "human", ...deck(0)}, {seatId: "maya", name: "Maya", pilot: "human", ...deck(1)}],
  passEmpty: true, endWhenNoPerson: true, resolveAll: true, passAfterCast: true, endAsks: true, untapMana: true, pooledTaps: true, yieldTurn: true};
const SEED = "events-seed-1";
const n = (id) => Number(String(id).slice("event:".length));

const ask = (room) => (room.waitingOn ? room.view(room.waitingOn) : null);
const option = (v, test) => v.decision.options.find(test);
const untapped = (v) => v.state.players[v.seat].zones.Battlefield.cards.filter((c) => c.name === "Forest" && !c.tapped).length;
/* Keep, play a land, cast a Bear in one's own main phase, attack with everything, never block, otherwise pass; every view
   of both seats after each answer is heard. */
const storage = memoryStorage();
const room = await startRoom({storage, matchId: "events", cards, pod, seed: SEED});
const seen = {rob: [], maya: []};
let robCast = null;
const hear = () => {for (const seatId of ["rob", "maya"]) seen[seatId].push(room.view(seatId));};
hear();
for (let i = 0; i < 4000; i += 1) {
  const v = ask(room);
  if (!v) break;
  const d = v.decision;
  let pick;
  if (d.kind === "priority") {
    const own = v.state.turnPlayerId === v.seat && /^MAIN/.test(v.state.phase) && !v.state.stack.length;
    const bear = own && untapped(v) >= 2 && option(v, (o) => o.act === "cast" && /^Bear /.test(o.label));
    pick = (option(v, (o) => o.act === "play-land") || bear || option(v, (o) => o.act === "pass")).index;
    if (bear && pick === bear.index && v.seatId === "rob" && !robCast) robCast = {decisionId: d.id, name: bear.label.replace(/^Cast /, "")};
  } else if (d.id.startsWith("declare-attackers")) {
    const ids = new Set(); pick = d.options.filter((o) => !ids.has(o.cardId) && ids.add(o.cardId)).map((o) => o.index);
  } else pick = d.mode === "many" ? d.options.slice(0, d.min).map((o) => o.index) : 0;
  await room.act(v.seatId, {actionId: randomUUID(), revision: v.revision, kind: "answer", choiceId: d.id, indices: [pick].flat()});
  hear();
  /* Past what the room keeps, so a reconnect from the start is told to start over. */
  const life = room.view("rob").state.players.map((p) => p.life), heard = new Set(seen.rob.flatMap((x) => x.events.map((e) => e.eventId)));
  if (robCast && life[0] < 40 && life[1] < 40 && heard.size > EVENTS_KEEP + 20) break;
}
const all = (seatId) => {const out = new Map(); for (const v of seen[seatId]) for (const e of v.events) out.set(e.eventId, e); return [...out.values()].sort((a, b) => n(a.eventId) - n(b.eventId));};
const robs = all("rob"), mayas = all("maya");

/* ---- 1 ---- */
const last = room.view("rob");
eq(last.eventsSchema, "events.v1", "1. the view says which events it carries: events.v1");
ok(robs.every((e) => /^event:\d+$/.test(e.eventId) && typeof e.kind === "string" && Number.isInteger(e.turn)), "each event has the journal's id, a kind and its turn");
ok(robs.every((e, i) => i === 0 || n(e.eventId) > n(robs[i - 1].eventId)), "and they come in the order they happened");
const kinds = new Set(robs.map((e) => e.kind));
for (const k of ["turn", "draw", "land", "cast", "resolve", "tap", "attack", "damage", "life"]) ok(kinds.has(k), `a game's ${k} is an event (${[...kinds].join(", ")})`);

/* ---- 2 ---- */
const robDrawsSeenByMaya = mayas.filter((e) => e.kind === "draw" && e.player === 0);
ok(robDrawsSeenByMaya.length > 0 && robDrawsSeenByMaya.every((e) => e.card === undefined && e.count === 1), `2. Rob's draws in Maya's views are counts, never the card (${robDrawsSeenByMaya.length})`);
/* In his own, a draw names its card while it is in his hand: in the view that carries it, every card a draw names is there;
   a card drawn and put back (his mulligan's) is in his library again, and is named to no one. */
const named = seen.rob.flatMap((v) => v.events.filter((e) => e.kind === "draw" && e.player === 0 && e.card).map((e) => [e, v]));
ok(named.length > 0 && named.every(([e, v]) => v.state.players[0].zones.Hand.cards.some((c) => c.cardId === e.card.cardId && c.name === e.card.name)),
  `in his own, a draw names the card he drew while it is in his hand (${named.length} named)`);
ok([...robs, ...mayas].every((e) => !("secret" in e)), "no event carries its secret out");
ok(mayas.filter((e) => e.kind === "draw").every((e) => e.player === 1 || e.card === undefined), "and no draw of Rob's names a card to Maya");

/* ---- 3 ---- */
const cast = robs.find((e) => e.kind === "cast" && e.player === 0);
eq([cast?.decisionId, cast?.card?.name], [robCast.decisionId, robCast.name], `3. Rob's cast names the decision he answered (${robCast.decisionId})`);
const firstAnswered = robs.findIndex((e) => e.decisionId !== undefined);
ok(firstAnswered >= 0 && robs.slice(firstAnswered).some((e) => e.decisionId === undefined), "and what the room did after an answer, on its own, names none");
ok(mayas.every((e) => e.kind !== "move" || !(["hand", "library"].includes(e.from) && ["hand", "library"].includes(e.to))), "a card moved between two hidden zones is no event (his mulligan's)");

/* ---- 4 ---- */
const pairs = seen.rob.slice(1).map((v, i) => [seen.rob[i], v]).filter(([a, b]) => a.events.length && b.events.length);
ok(pairs.length > 0 && pairs.every(([a, b]) => Math.max(...a.events.map((e) => n(e.eventId))) < Math.min(...b.events.map((e) => n(e.eventId))) || a.revision === b.revision),
  `4. two views in a row share no event: each carries the change it shows (${pairs.length} pairs)`);

/* ---- 5 ---- */
const mid = robs[Math.floor(robs.length * 0.9)];
const since = room.view("rob", {after: mid.eventId});
eq(since.events.map((e) => e.eventId), robs.filter((e) => n(e.eventId) > n(mid.eventId)).map((e) => e.eventId), "5. reconnecting after an event it saw, a seat gets exactly what came since");
eq([since.eventsReset, room.view("rob", {after: last.events.at(-1)?.eventId ?? robs.at(-1).eventId}).events.length], [undefined, 0], "and after the newest, nothing");
const oldest = room.view("rob", {after: "event:0"});
ok(robs.length > EVENTS_KEEP && oldest.eventsReset === true && oldest.events.length === 0,
  `asked from before what the room keeps (${EVENTS_KEEP}), it is told to start from the view (${robs.length} events in this game)`);
eq(room.view("rob", {after: "nonsense"}).eventsReset, true, "and an id it cannot read, the same");

/* ---- 6 ---- */
const reopened = await openRoom({storage, matchId: "events", cards});
eq(reopened.view("rob", {after: mid.eventId}).events, since.events, "6. reopened from storage, the same events after the same one");
const store = createMatchStore(storage, "events"), meta = await store.loadMatch();
const replayed = await replayTape({matchId: "events", pod: meta.pod, seed: meta.seed, tape: await store.readTape(), cards});
/* A decision's id carries the room's revision when it was asked (`priority:<turn>:<step>:<revision>`), and a replay asks the
   same questions at its own revisions: the same events answered a decision, each named as its room asked it. */
const answered = (list) => list.map(({decisionId, ...e}) => ({...e, answered: decisionId !== undefined}));
eq(answered(replayed.view("maya", {after: mid.eventId}).events), answered(room.view("maya", {after: mid.eventId}).events),
  "replayed, the same events with the same ids, each seat's as it was, and the same of them made by an answer");

/* ---- 7 ---- */
const ev = (kind, fields) => ({kind, data: {turn: 3, phase: "MAIN1", fields}});
const faceDown = {cardId: 9, name: "Secret Thing", owner: 0, controller: 0, faceDown: true};
eq(tableEvent(ev("GameEventCardChangeZone", {card: faceDown, from: {zoneType: "Hand"}, to: {zoneType: "Exile"}}), "event:5").card, {cardId: 9, name: null}, "7. a face-down card moved is no name");
eq(tableEvent(ev("GameEventCardChangeZone", {card: {...faceDown, faceDown: false}, from: {zoneType: "Hand"}, to: {zoneType: "Library"}}), "event:6"), null, "a card moved from a hand to a library is no event");
eq(tableEvent(ev("GameEventSpellResolved", {stackId: 4, playerId: 1, countered: true}), "event:7"), {eventId: "event:7", turn: 3, phase: "MAIN1", kind: "countered", player: 1, stackId: 4}, "a spell countered is `countered`");
eq(tableEvent(ev("GameEventCardChangeZone", {card: {cardId: 12, name: "Goblin", owner: 1, faceDown: false}, from: {zoneType: null}, to: {zoneType: "Battlefield", player: {playerId: 1}}, createdAsToken: true}), "event:8").kind, "token", "and a token made is `token`");
const drawn = tableEvent(ev("GameEventCardChangeZone", {card: {cardId: 3, name: "Forest", owner: 0, faceDown: false}, from: {zoneType: "Library"}, to: {zoneType: "Hand"}, drawn: true, drewAs: 30}), "event:9");
eq([drawn.kind, drawn.card, drawn.secret], ["draw", undefined, {seat: 0, card: {cardId: 30, name: "Forest"}}], "a draw keeps its card as the drawer's secret, by the id it has in the hand");
/* And an effect's draw ("draw a card", script/effects/zones.mjs) says that id too. */
const st = createState({matchId: "m", seed: "draw-as", players: [{name: "Rob"}, {name: "Maya"}]});
for (let i = 0; i < 3; i += 1) addObject(st, {card: `Card ${i}`, types: ["Land"], owner: 0, controller: 0}, "library", 0);
const drew = runEffects(st, [{effect: "draw", count: 1}], {controller: 0, source: null}).find((e) => e.kind === "GameEventCardChangeZone");
eq(tableEvent(drew, "event:1").secret.card.cardId, st.zones.hand[0][0], "an effect's draw names the card by the id it has in the hand");

console.log(`room-events: ${checks} checks passed — every view carries what happened as events.v1, each with the journal's id and the decision it answered, a draw the drawer's alone; a reconnect gets exactly what it missed, or is told to start over; reopened and replayed, the same.`);
