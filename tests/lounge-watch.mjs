/* WATCHING (docs/ui-lane/lounge-contract.md §4): `connect?watch=1` is a spectator.
 *
 *   who      a public table to anyone signed in; a private one to its seats, its organizer and the owner; only while a game is on
 *   sees     the same view frames as a seat, from the public state alone: no seat's hand, no library, no decision, no private
 *            choice -- PROVED by looking for the names of the cards a seat holds in every frame the spectator was sent
 *   plays    nothing: any action frame answers {type: "refused"} and is not applied
 *   counted  `watching: n` in the table's view, a number and nothing about who
 */
import {ROB, MAYA, SAM, EVE, ok, eq, count, world, running} from "./helpers/lounge-harness.mjs";

const w = await world();
const T = (id, path = "") => `/api/tables/${id}${path}`;

/* 1. WHO MAY WATCH, AND WHEN. */
const open = await running(w, MAYA, {privacy: "public"});
eq((await w.watch(open.id, EVE)).status, 409, "nothing to watch while the table is in its lobby");
eq((await open.start()).status, 200, "the host starts");
eq((await w.call("GET", T(open.id), {as: MAYA})).json.table.phase, "playing", "a game is on");
const eveWatches = await w.watch(open.id, EVE);
eq([eveWatches.status, eveWatches.json], [200, {upgraded: true}], "anyone signed in watches a public table's game");
eq((await w.call("GET", T(open.id, "/connect"), {as: EVE, headers: {upgrade: "websocket", origin: "https://crankmagic.test"}})).status, 403, "without watch=1 they have no seat to connect to");
eq((await w.call("GET", T(open.id), {as: EVE})).status, 403, "and no table view without it either");
const spectated = (await w.call("GET", T(open.id) + "?watch=1", {as: EVE})).json.table;
eq([spectated.spectating, spectated.yourSeat, spectated.youAreHost, spectated.requests, "cards" in spectated.seats[0], spectated.gameRecord], [true, null, false, undefined, false, null],
  "the table's view for a spectator is the public one: no seat of theirs, no host powers, none of any seat's own facts");

const secret = await running(w, MAYA, {privacy: "private", people: [{name: "Sam", email: SAM}]});
await secret.start();
eq([(await w.watch(secret.id, EVE)).status, (await w.watch(secret.id, SAM)).status, (await w.watch(secret.id, MAYA)).status, (await w.watch(secret.id, ROB)).status], [403, 200, 200, 200],
  "a private table's game: a stranger no; its seats and the owner yes");
eq((await w.call("GET", T(secret.id) + "?watch=1", {as: EVE})).status, 403, "and a stranger gets no spectator's table view of it either");
eq((await w.call("GET", T(secret.id) + "?watch=1", {as: ROB})).json.table.youAreAdmin, true, "the owner does");

/* 2. WHAT A SPECTATOR IS SENT: the hand's cards are not in it. Maya and Eve at the open table. */
const mayaSeat = await w.call("GET", T(open.id, "/connect"), {as: MAYA, headers: {upgrade: "websocket", origin: "https://crankmagic.test"}});
eq(mayaSeat.status, 200, "Maya connects to her seat");
const mayaSock = w.socketsOf(open.id).find((x) => x.tags[0] === "s0"), eveSock = w.socketsOf(open.id).find((x) => x.tags[0] === "watch");
eq([mayaSock.tags, eveSock.tags], [["s0"], ["watch"]], "her socket is her seat's; the other is tagged as a spectator, by the object and not by anything the client sent");
const object = w.objects.get(open.id);
const handNames = (frame) => frame.view.state.players.flatMap((p) => p.zones.Hand.cards.map((c) => c.name).filter(Boolean));
const viewsOf = (sock) => sock.frames.filter((f) => f.type === "view");
const publicNames = (frame) => new Set(frame.view.state.players.flatMap((p) => ["Battlefield", "Graveyard", "Exile", "Command"].flatMap((z) => p.zones[z].cards.map((c) => c.name).filter(Boolean))));

let leakChecks = 0;
const checkSpectator = () => {
  const mine = new Map(viewsOf(mayaSock).map((f) => [f.view.revision, f]));
  for (const f of viewsOf(eveSock)) {
    const seat = mine.get(f.view.revision);
    if (!seat) continue;
    const text = JSON.stringify(f);
    const held = handNames(seat).filter((n) => !publicNames(f).has(n));
    for (const name of held) {ok(!text.includes(name), `the spectator's frame at revision ${f.view.revision} does not carry "${name}", a card in Maya's hand`); leakChecks += 1;}
    for (const p of f.view.state.players) {
      eq([p.zones.Hand.cards.length, p.zones.Hand.count > 0 || f.view.state.turn === 0], [0, true], "a hand is a count and no cards (nothing was revealed at this table)");
      eq([p.zones.Library.cards.length, p.zones.Library.count > 0], [0, true], "a library is a count and no cards");
    }
    eq([f.view.decision, f.view.manaSources, f.view.seatId, f.view.seat, f.view.spectator], [null, [], null, null, true], "no decision, no mana sources, and no seat of its own");
    ok(!("canUndo" in f.view) && !("stepByStep" in f.view) && !("yielding" in f.view), "none of a seat's own ways of playing");
  }
};
const first = viewsOf(eveSock)[0];
ok(first && viewsOf(mayaSock).length > 0, "both were sent a view at once");
ok(handNames(viewsOf(mayaSock)[0]).length === 7, "Maya's own view holds her seven cards, by name");
ok(handNames(viewsOf(mayaSock)[0]).every((n) => /^(Bear|Grove) p0/.test(n)), "...and they are her deck's");
checkSpectator();

/* Play on: Maya answers what she is asked; the spectator is sent a view after each change, none with her cards. */
for (let i = 0; i < 30; i += 1) {
  const latest = viewsOf(mayaSock).at(-1).view;
  if (!latest.decision) break;
  const before = viewsOf(eveSock).length;
  await object.webSocketMessage(mayaSock, JSON.stringify({type: "act", actionId: crypto.randomUUID(), revision: latest.revision, kind: "answer", choiceId: latest.decision.id, indices: [0]}));
  if (viewsOf(eveSock).length > before) ok(true, "a change reaches the spectator as a view");
}
ok(viewsOf(eveSock).length >= 2, "the spectator has been sent the game as it moved");
checkSpectator();
ok(leakChecks >= 3, `at least three of Maya's hands were checked against what the spectator was sent (${leakChecks})`);

/* 3. A SPECTATOR PLAYS NOTHING. */
const mayaNow = viewsOf(mayaSock).at(-1).view;
ok(mayaNow.decision, "Maya has a decision pending");
const revisionBefore = (await object.load()).view("s0").revision;
const frames = eveSock.frames.length;
await object.webSocketMessage(eveSock, JSON.stringify({type: "act", actionId: crypto.randomUUID(), revision: mayaNow.revision, kind: "answer", choiceId: mayaNow.decision.id, indices: [0]}));
const refused = eveSock.frames.slice(frames);
eq([refused.length, refused[0].type, refused[0].status], [1, "refused", 403], "an action frame, even Maya's own pending decision, answers {type: refused}");
eq([(await object.load()).view("s0").revision, viewsOf(mayaSock).at(-1).view.revision], [revisionBefore, revisionBefore], "and is not applied: the game did not move, and Maya was sent nothing");
for (const frame of [{type: "yield", on: true}, {type: "prefer", stepByStep: true}, {type: "check", choiceId: mayaNow.decision.id, indices: [0]}, {type: "nonsense"}]) {
  await object.webSocketMessage(eveSock, JSON.stringify(frame));
  eq(eveSock.frames.at(-1).type, "refused", `a ${frame.type} frame is refused too`);
}
await object.webSocketMessage(eveSock, "not json");
eq(eveSock.frames.at(-1).type, "refused", "and so is a frame that is not JSON");
eq((await object.load()).view("s0").revision, revisionBefore, "still nothing moved");
await object.webSocketMessage(eveSock, JSON.stringify({type: "view"}));
eq([eveSock.frames.at(-1).type, eveSock.frames.at(-1).view.spectator, eveSock.frames.at(-1).view.decision], ["view", true, null], "a spectator may ask for the view again, and it is the public one");
await object.webSocketMessage(eveSock, JSON.stringify({type: "view", after: "event:not-a-number"}));
eq(eveSock.frames.at(-1).view.eventsReset, true, "with an event it cannot place, told to start from the view");
ok(!JSON.stringify(eveSock.frames).includes('"secret"'), "no event a seat was told in secret");

/* 4. COUNTED. */
await w.watch(open.id, SAM);
eq((await w.call("GET", T(open.id), {as: MAYA})).json.table.watching, 2, "the table's view counts its spectators");
eq(Object.keys((await w.call("GET", T(open.id), {as: MAYA})).json.table).filter((k) => /watch/i.test(k)), ["watching"], "as a number alone");
const ctx = w.contexts.get(open.id);
await object.webSocketClose(eveSock, 1000); ctx.sockets.splice(ctx.sockets.indexOf(eveSock), 1);
eq([(await w.call("GET", T(open.id), {as: MAYA})).json.table.watching, (await w.call("GET", T(open.id), {as: SAM})).status], [1, 403], "a spectator leaving is not counted; watching gave Sam no seat");

/* 5. A TABLE THAT HAS ENDED CANNOT BE WATCHED. */
await w.call("POST", T(open.id, "/quit"), {as: MAYA, body: {}});
eq((await w.watch(open.id, EVE)).status, 409, "an ended table has nothing to watch");

console.log(`lounge-watch: ${count()} checks passed — spectators by the privacy rules, the public view alone (no hand, no library, no decision: ${leakChecks} hands checked against every frame), actions refused and not applied, and counted as a number.`);
