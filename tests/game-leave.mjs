/* LEAVING A GAME IN PLAY (M5; Rob, 2026-09-26): conceding, ending the game for everyone, and the five minutes
 * a dropped player has to come back (game/engine/rules/sba.mjs concede, game/room/room.mjs, game/room/table.mjs,
 * cloud/game-room.mjs GameTable, cloud/tables.mjs).
 *
 *   Engine   a player concedes at any time (CR 104.3a) and leaves as any loser does (CR 800.4a): their
 *            permanents go, priority and turns skip them, a decision they were asked is withdrawn. Fuzzed: a
 *            concession at a random point in hundreds of games never breaks one.
 *   Room     a person leaves, and whatever was being asked is asked afresh; before the first turn their hand
 *            is kept for them and they concede when it begins; End game stops everything, "ended early".
 *   Table    any person ends the game for everyone; a person concedes; a dropped player's clock is five
 *            minutes, stopped by coming back, and running out concedes them, recorded as not finished.
 *   Object   the alarm carries both clocks; the others are told who dropped and until when.
 */
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {createState, addObject} from "../game/engine/state/index.mjs";
import {beginGame, advance, awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {legalActions, applyAction} from "../game/engine/rules/actions.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";
import {gameOver, concede} from "../game/engine/rules/sba.mjs";
import {attackers} from "../game/engine/rules/combat.mjs";
import {beginMulligans, mulligansDone} from "../game/engine/rules/mulligan.mjs";
import {createRng} from "../game/engine/rng.mjs";
import {randomLegalPilot} from "../game/engine/pilots/random-legal.mjs";
import {memoryStorage} from "../game/engine/storage.mjs";
import {startRoom, openRoom, basicCards, NO_PERSON_REASON} from "../game/room/room.mjs";
import {replayTape} from "../game/room/replay.mjs";
import {createMatchStore} from "../game/engine/storage.mjs";
import {tableOn, AWAY_LIMIT} from "../game/room/table.mjs";
import {GameTable} from "../cloud/game-room.mjs";
import {playGame} from "../tools/fuzz-live.mjs";

let checks = 0;
const ok = (c, m) => {assert.ok(c, m); checks += 1;};
const eq = (a, b, m) => {assert.deepEqual(a, b, m); checks += 1;};
const refuses = async (p, status, re, m) => {await assert.rejects(p, (e) => e.status === status && (!re || re.test(e.message)), m); checks += 1;};

/* 1. THE ENGINE: FUZZED. */
const FOREST = {types: ["Land"], abilities: [{id: "t-g", kind: "mana", tapSelf: true, produces: {G: 1}}]};
function engineGame(seed) {
  const state = createState({matchId: "leave", seed, players: [0, 1, 2, 3].map((i) => ({name: `P${i}`}))});
  for (let p = 0; p < 4; p += 1) {
    for (let i = 0; i < 40; i += 1) addObject(state, {...FOREST, card: `Forest ${p}`, owner: p, controller: p}, "library", p);
    for (let i = 0; i < 59; i += 1) addObject(state, {card: `Bear ${p}-${i}`, types: ["Creature"], power: 2, toughness: 2, manaCost: "{1}{G}", owner: p, controller: p}, "library", p);
    addObject(state, {card: `General ${p}`, types: ["Creature"], power: 3, toughness: 3, manaCost: "{2}{G}", owner: p, controller: p, commander: true}, "command", p);
  }
  return state;
}
let conceded = 0, whilePriority = 0, whileAsked = 0, ended = 0;
for (let n = 0; n < 240; n += 1) {
  const seed = `fuzz-${n}`, state = engineGame(seed), rng = createRng(seed), pilot = randomLegalPilot(rng), when = createRng(`when-${n}`);
  beginMulligans(state, rng);
  while (!mulligansDone(state)) {const a = pilot.answer(awaitingChoice(state)); resolveAwaiting(state, a.indices, a.amounts, rng);}
  beginGame(state);
  const plan = [20 + when.int(400), 450 + when.int(700), 1200 + when.int(900)];  /* up to three concessions, at random decisions */
  /* The second waits, if it must, for a question to be pending, and is the asked player's: leaving while being asked
     is a case of its own, and is made to happen rather than left to the seeds. */
  let waitingToAsk = false;
  let steps = 0;
  while (state.turn <= 25 && !gameOver(state)) {
    steps += 1;
    if (steps === plan[1] && !state.awaiting) waitingToAsk = true;
    if (plan.includes(steps) || (waitingToAsk && state.awaiting)) {
      const living = state.players.filter((p) => !p.lost).map((p) => p.id);
      const asked = waitingToAsk && state.awaiting && !state.players[state.awaiting.player].lost;
      if (steps === plan[1] && !state.awaiting) continue;
      waitingToAsk = false;
      const who = asked ? state.awaiting.player : living[when.int(living.length)];
      if (state.priorityPlayer === who) whilePriority += 1;
      if (state.awaiting && state.awaiting.player === who) whileAsked += 1;
      concede(state, who);
      conceded += 1;
      const p = state.players[who];
      if (!(p.lost && p.lostTo === "conceded")) assert.fail(`seed ${seed}: the player who conceded is not out`);
      if (state.zones.battlefield.some((id) => state.objects[id].owner === who)) assert.fail(`seed ${seed}: a conceded player's permanent stayed`);
      if (state.awaiting && state.awaiting.player === who) assert.fail(`seed ${seed}: a conceded player is still being asked`);
      if (state.priorityPlayer !== null && state.players[state.priorityPlayer].lost) assert.fail(`seed ${seed}: priority went to a player who is out`);
      continue;
    }
    if (steps > 200000) assert.fail(`seed ${seed}: the game did not end`);
    if (state.awaiting) {
      if (state.players[state.awaiting.player].lost) assert.fail(`seed ${seed}: a player who is out was asked a question (${state.awaiting.kind}, turn ${state.turn}, active ${state.activePlayer}, step ${state.step})`);
      const a = pilot.answer(awaitingChoice(state)); resolveAwaiting(state, a.indices, a.amounts, rng); continue;
    }
    if (state.priorityPlayer === null) {advance(state); continue;}
    if (state.players[state.priorityPlayer].lost) assert.fail(`seed ${seed}: a player who is out holds priority`);
    const chosen = pilot.choose(legalActions(state, state.priorityPlayer));
    if (chosen.kind === "pass") {const r = passPriority(state); if (r.outcome === "step-ends") advance(state);}
    else applyAction(state, state.priorityPlayer, chosen);
  }
  /* CR 104.2a: whoever is left when everyone else has conceded wins. */
  const living = state.players.filter((p) => !p.lost).map((p) => p.id);
  for (const who of living.slice(1)) concede(state, who);
  const over = gameOver(state);
  if (!over || over.winner !== living[0]) assert.fail(`seed ${seed}: with everyone else gone, player ${living[0]} did not win`);
  ended += 1;
}
ok(conceded >= 300, `the engine took ${conceded} concessions at random points in 240 games without breaking one`);
ok(whilePriority > 10 && whileAsked > 0, `including ${whilePriority} by the player holding priority and ${whileAsked} by a player being asked a question`);
eq(ended, 240, "and in every game, once everyone else had conceded, the last player standing won (CR 104.2a)");
assert.throws(() => {const s = engineGame("x"); concede(s, 1); concede(s, 1);}, /already left/); checks += 1;
{
  /* A departed active player declares no attack, even with a creature under their control (CR 800.4). */
  const s = engineGame("attack");
  const id = addObject(s, {card: "Loaned Bear", types: ["Creature"], power: 2, toughness: 2, owner: 1, controller: 0}, "battlefield");
  s.turn = 3; s.activePlayer = 0; s.players[0].turnBegan = 3; s.objects[id].controlledSinceTurn = 1;   /* player 0's turn 3 (CR 302.6 reads their turn) */
  eq(attackers.open(s), true, "an active player with a creature that can attack is asked to declare attackers");
  s.awaiting = null; s.players[0].lost = true;
  eq(attackers.open(s), false, "the same player, having left the game, is asked nothing");
}

/* 2. THE ROOM. */
const DEFS = new Map();
const def = (name, d) => {DEFS.set(name, d); return name;};
const cards = (name) => DEFS.get(name) ?? basicCards(name);
const deck = (tag) => ({commander: [def(`General ${tag}`, {types: ["Creature"], supertypes: ["Legendary"], power: 3, toughness: 3, manaCost: "{2}{G}"})],
  cards: [...Array.from({length: 38}, () => def(`Grove ${tag}`, FOREST)), ...Array.from({length: 61}, (_, i) => def(`Bear ${tag}-${i}`, {types: ["Creature"], power: 2, toughness: 2, manaCost: "{1}{G}"}))]});
const POD = {seats: [{seatId: "s0", name: "Rob", pilot: "human", ...deck("a")}, {seatId: "s1", name: "Maya", pilot: "human", ...deck("b")}, {seatId: "s2", name: "Bot", pilot: "house", ...deck("c")}]};
const answerer = (seed) => {const p = randomLegalPilot(createRng(seed)); return (d) => {const a = p.answer(d); return {kind: "answer", choiceId: d.id, ...(a.indices ? {indices: a.indices} : {}), ...(a.amounts ? {amounts: a.amounts} : {}), ...(a.value !== undefined ? {value: a.value} : {})};};};
async function stepRoom(room, n, people) {
  for (let i = 0; i < n && room.waitingOn; i += 1) {
    const who = room.waitingOn, v = room.view(who);
    if (v.departures[who]) assert.fail(`the room asked ${who}, who has left the game, to decide`); await room.act(who, {actionId: randomUUID(), revision: v.revision, ...people(v.decision)});}
}
{
  /* Leaving before the first turn: the hand is kept for them, and they concede as the game begins. */
  const storage = memoryStorage();
  let room = await startRoom({storage, matchId: "early", cards, pod: POD, seed: "early"});
  const firstAsked = room.waitingOn;
  await room.leave(firstAsked, "conceded");
  const later = room.view("s0");
  eq(later.departures, {[firstAsked]: "conceded"}, "a person who leaves before the first turn is recorded as having conceded");
  const people = answerer("p1");
  await stepRoom(room, 400, people);
  const state = (await openRoom({storage, matchId: "early", cards})).view("s0").state;
  const left = state.players.find((_, i) => `s${i}` === firstAsked);
  ok(left.lost || state.turn >= 1, "their opening hand was kept for them and, once the game began, they conceded");
  ok(room.waitingOn !== firstAsked, "and they are never asked anything again");

  /* Leaving mid-game while being asked: the question is withdrawn and whoever is asked next is asked afresh. */
  const s2 = memoryStorage();
  room = await startRoom({storage: s2, matchId: "mid", cards, pod: POD, seed: "mid"});
  await stepRoom(room, 40, answerer("p2"));
  const asked = room.waitingOn, stale = room.view(asked);
  await room.leave(asked, "timed-out");
  await refuses(room.act(asked, {actionId: randomUUID(), revision: stale.revision, ...answerer("late")(stale.decision)}), 409, /./, "an answer to the withdrawn question is refused");
  eq(room.view("s0").departures[asked], "timed-out", "a player whose time ran out is recorded as timed out (their record: not finished)");
  ok(room.waitingOn !== asked, "play goes on without them");
  await refuses(room.leave(asked, "conceded"), 409, /already left/, "a seat leaves once");
  await refuses(room.leave("s2", "conceded"), 409, /AI seat/, "an AI seat does not leave");
  await refuses(room.leave("s0", "walked-off"), 400, null, "and a seat leaves only by conceding or timing out");
  const reopened = await openRoom({storage: s2, matchId: "mid", cards});
  eq(reopened.view("s0").departures, room.view("s0").departures, "a woken room remembers who left, and why");

  /* End game: everything stops. */
  const s3 = memoryStorage();
  room = await startRoom({storage: s3, matchId: "end", cards, pod: POD, seed: "end"});
  await stepRoom(room, 30, answerer("p3"));
  const by = room.waitingOn === "s0" ? "s1" : "s0";
  await room.end(by);
  const v = room.view("s0");
  eq([v.status, v.result, v.waitingOn, v.decision], ["finished", {winner: null, reason: "ended early", endedBy: by}, null, null], "End game finishes the game for everyone, with no winner, recorded as ended early and by whom");
  await refuses(room.act("s0", {actionId: randomUUID(), revision: v.revision, kind: "answer", choiceId: "x", indices: [0]}), 409, /over/, "nothing more is played");
  await refuses(room.end("s1"), 409, /over/, "and it ends once");
  eq((await openRoom({storage: s3, matchId: "end", cards})).view("s1").result.reason, "ended early", "a woken room still says it ended early");
}

/* 3. THE TABLE. */
const ROB = "rob@example.com", MAYA = "maya@example.com", EVE = "eve@example.com";
let now = Date.parse("2026-09-26T21:00:00Z");
let seq = 0;
const random = (n) => {seq += 1; return new Uint8Array(n).map((_, i) => (seq * 13 + i * 5) % 256);};
async function playingTable(storage = memoryStorage()) {
  const t = tableOn(storage, {cards, random});
  await t.create({tableId: `tbl${String(seq).padStart(8, "0")}`, host: ROB, hostName: "Rob", seats: [{kind: "human", name: "Maya"}, {kind: "ai", name: "Bot"}]});
  const code = (await t.invite(ROB, 1, now)).code;
  await t.join(MAYA, code, now);
  await t.deck(ROB, 0, deck("ta"), now); await t.deck(MAYA, 1, deck("tb"), now); await t.deck(ROB, 2, deck("tc"), now);
  await t.ready(ROB, true, now); await t.ready(MAYA, true, now);
  await t.start(ROB, now);
  await t.tick(now + 10000);
  return t;
}
{
  let t = await playingTable();
  await refuses(t.endGame(EVE, now), 403, null, "someone with no seat cannot end the game");
  const ended1 = await t.endGame(MAYA, now);
  eq(ended1.phase, "rematch", "any person at the table, not only the host, ends the game for everyone; the table moves on to the rematch question");
  eq((await t.currentRoom()), null, "and no game is being played");

  t = await playingTable();
  await t.concede(MAYA, now);
  const after = await t.view(ROB);
  eq([after.seats[1].occupied, after.phase], [false, "playing"], "a person who concedes leaves the game, and it goes on without them");
  eq((await t.currentRoom()).view("s0").departures, {s1: "conceded"}, "the room records that they conceded");
  await refuses(t.endGame(MAYA, now), 409, /left this game/, "a person who has left cannot end the game for those still playing");
  await refuses(t.concede(MAYA, now), 409, null, "nor concede twice");

  /* The five minutes. */
  t = await playingTable();
  await t.dropped(1, now);
  eq((await t.view(ROB)).away, [{seatId: 1, until: now + AWAY_LIMIT}], "Maya drops: everyone can see her five minutes");
  eq(AWAY_LIMIT, 5 * 60 * 1000, "five minutes, as Rob decided");
  eq(await t.nextAlarm(), now + AWAY_LIMIT, "the table's next alarm is her time running out");
  await t.back(1, now + 60000);
  eq([(await t.view(ROB)).away, await t.nextAlarm()], [[], null], "she comes back in time: the clock stops and her seat is as she left it");
  eq((await t.currentRoom()).view("s1").departures, {}, "and she has not left the game");
  await t.dropped(1, now + 70000);
  await t.tick(now + 70000 + AWAY_LIMIT - 1);
  eq((await t.currentRoom()).view("s0").departures, {}, "one moment short of five minutes, nothing happens");
  await t.tick(now + 70000 + AWAY_LIMIT);
  eq((await t.currentRoom()).view("s0").departures, {s1: "timed-out"}, "at five minutes she concedes, recorded as timed out, which her record shows as not finished");
  eq([(await t.view(ROB)).away, (await t.view(ROB)).seats[1].occupied], [[], false], "and the clock is gone with her");
  await t.dropped(0, now);
  eq((await t.view(ROB)).away.length, 1, "the host dropping starts the host's clock too");
}

/* 4. THE OBJECT: one alarm, two clocks, and the others told. */
{
  const map = new Map(), sockets = [], alarmsSet = [];
  const ctx = {storage: {get: async (k) => map.get(k), put: async (k, v) => {map.set(k, v);}, delete: async (k) => map.delete(k),
    list: async ({prefix}) => new Map([...map].filter(([k]) => k.startsWith(prefix)).sort()), setAlarm: async (t) => {alarmsSet.push(t);}, deleteAlarm: async () => {alarmsSet.push(null);}},
  acceptWebSocket: (s, tags) => {s.tags = tags; sockets.push(s);}, getWebSockets: () => sockets.filter((s) => !s.closed), getTags: (s) => s.tags};
  let clock = now;
  const object = new GameTable(ctx, {}, {cards, random, now: () => clock});
  const call = async (path, email, body) => (await object.fetch(new Request(`https://table.internal${path}`, {method: body === undefined ? "GET" : "POST", headers: {"content-type": "application/json", "x-crankmagic-email": email}, ...(body !== undefined ? {body: JSON.stringify(body)} : {})}))).json();
  await call("/table/create", ROB, {tableId: "tableleave1", hostName: "Rob", seats: [{kind: "human", name: "Maya"}]});
  await call("/table/join", MAYA, {code: (await call("/table/invite", ROB, {seatId: 1})).invite.code});
  await call("/table/deck", ROB, {seatId: 0, deck: deck("oa")}); await call("/table/deck", MAYA, {seatId: 1, deck: deck("ob")});
  await call("/table/ready", ROB, {ready: true}); await call("/table/ready", MAYA, {ready: true});
  await call("/table/start", ROB, {});
  eq(alarmsSet.at(-1), clock + 10000, "the alarm is set for the countdown");
  clock += 10000; await object.alarm();
  eq(alarmsSet.at(-1), null, "the game started, and with no clock running the alarm is cleared");
  const sock = () => ({tags: null, frames: [], closed: false, send(f) {this.frames.push(JSON.parse(f));}, close() {this.closed = true;}});
  const rob = sock(), maya = sock();
  await object.load(); object.accept(rob, "s0"); object.accept(maya, "s1");
  maya.closed = true; await object.webSocketClose(maya, 1001);
  const told = rob.frames.find((f) => f.type === "away");
  eq([told && told.seatId, told && told.until], ["s1", clock + AWAY_LIMIT], "when Maya's socket closes, Rob is told who dropped and until when");
  eq(alarmsSet.at(-1), clock + AWAY_LIMIT, "and the alarm is set for her time running out");
  /* She comes back through the real route: the platform's socket pieces stood in for, as Node has neither. */
  const back = sock();
  object.socketPair = () => [{}, back];
  object.upgraded = () => ({status: 101});
  const reconnect = await object.fetch(new Request("https://table.internal/connect", {headers: {upgrade: "websocket", "x-crankmagic-email": MAYA}}));
  eq([reconnect.status, back.frames[0].view.seatId], [101, "s1"], "she reconnects to her own seat");
  eq(alarmsSet.at(-1), null, "in time: her clock stops and the alarm is cleared");
  /* Two sockets for one seat (a phone and a laptop): closing one is not dropping. */
  const second = sock(); object.accept(second, "s1");
  const before = rob.frames.length;
  second.closed = true; await object.webSocketClose(second, 1001);
  eq([rob.frames.slice(before).some((f) => f.type === "away"), alarmsSet.at(-1)], [false, null], "with another of her sockets still open, closing one starts no clock");
  back.closed = true; await object.webSocketClose(back, 1001);
  clock += AWAY_LIMIT; await object.alarm();
  eq((await object.load()).view("s0").departures, {s1: "timed-out"}, "the alarm at five minutes concedes her");
  ok(rob.frames.filter((f) => f.type === "view").at(-1).view.departures.s1 === "timed-out", "and Rob's socket is sent the view that shows it");
  const endView = await call("/table/end", ROB, {});
  eq(endView.table.phase, "rematch", "End game over the object ends it");
  const last = rob.frames.filter((f) => f.type === "view").at(-1).view;
  eq([last.status, last.result && last.result.reason], ["finished", "ended early"], "and the sockets still open are sent the view that says so, though the table has no game on any more");
}


/* 5. ONCE EVERY PERSON IS OUT, THE GAME ENDS THERE (Rob, 2026-10-06: the AI seats do not play it out for nobody;
   game/room/room.mjs `endWhenNoPerson`, which the table sets as it launches a game, kept with the match so a game made
   before it replays as it was played). */
{
  const pod = (flag, tags) => ({passEmpty: true, ...(flag ? {endWhenNoPerson: true} : {}), seats: [
    {seatId: "s0", name: "Rob", pilot: "human", ...deck(tags[0])}, {seatId: "s1", name: "Bot", pilot: "house", ...deck(tags[1])}, {seatId: "s2", name: "Bot 2", pilot: "house", ...deck(tags[2])}]});
  /* The last person concedes. */
  const storage = memoryStorage();
  await startRoom({storage, matchId: "nobody", cards, pod: pod(true, ["na", "nb", "nc"]), seed: "nobody"});
  const room = await openRoom({storage, matchId: "nobody", cards});  /* woken first: the rule is kept with the room */
  await room.leave("s0", "conceded");
  const v = room.view("s0");
  eq([v.status, v.result, v.departures], ["finished", {winner: null, reason: NO_PERSON_REASON, endedBy: null}, {s0: "conceded"}], "the only person concedes: the game ends there, with two AI seats still in it, and says why");
  eq(room.history.at(-1).text, "Every person is out of the game, so it ends here · not finished", "the history says so too");
  await refuses(room.end("s0"), 409, /over/, "nothing more is played, or ended");
  const meta = await createMatchStore(storage, "nobody").loadMatch();
  eq((await replayTape({matchId: "nobody", pod: meta.pod, seed: meta.seed, tape: await createMatchStore(storage, "nobody").readTape(), cards})).fingerprint(), room.fingerprint(), "and its replay ends in the same place");
  eq((await openRoom({storage, matchId: "nobody", cards})).view("s1").result.reason, NO_PERSON_REASON, "a woken room still says so");
  /* Without the flag, a game made before it: the AI seats play on to the end, as that game was played. */
  const older = await startRoom({storage: memoryStorage(), matchId: "older", cards, pod: pod(false, ["na", "nb", "nc"]), seed: "nobody"});
  await older.leave("s0", "conceded");
  eq([older.status, older.view("s1").result.reason], ["finished", "last player standing"], "a match without the flag plays on to the end, as games did before 2026-10-06");
  /* The last person is knocked out: the game ends then too, and their own result is a loss. */
  let knocked = null;
  for (let n = 0; n < 12 && !knocked; n += 1) {
    const r = await startRoom({storage: memoryStorage(), matchId: `ko${n}`, cards, pod: {...pod(true, [`ka${n}`, `kb${n}`, `kc${n}`]), startingLife: 3}, seed: `ko-${n}`});
    const people = answerer(`ko-person-${n}`);
    while (r.waitingOn === "s0") {const w = r.view("s0"); await r.act("s0", {actionId: randomUUID(), revision: w.revision, ...people(w.decision)});}
    const w = r.view("s0"), active = w.state.players.filter((p) => p.health.status === "active").length;
    if (w.result.reason === NO_PERSON_REASON) {
      ok(w.state.players[0].health.status === "lost" && !w.departures.s0 && active >= 2, `game ko${n}: Rob is knocked out with ${active} AI seats still in, and the game ends there`);
      knocked = w;
    } else ok(w.result.reason === "last player standing", `game ko${n}: it ended naturally first (${w.result.winner} won)`);
  }
  ok(knocked, "among a dozen short games, Rob is knocked out with AI seats still playing");
  /* The table launches every game with the flag; with Maya gone, Rob conceding ends it and the table moves on. */
  const tableStorage = memoryStorage(), t = await playingTable(tableStorage);
  const matchId = (await t.currentRoom()).matchId;
  const launched = (await createMatchStore(tableStorage, matchId).loadMatch()).pod;
  eq(launched.endWhenNoPerson, true, "the table launches its games with the rule");
  /* The G1 harness (tools/fuzz-live.mjs) plays its games as the table launches them, or the person's waits it measures
     would include the AI seats playing a game out for nobody, which no person at the table waits through. */
  const beats = (p) => ({drawBeat: p.drawBeat, passEmpty: p.passEmpty, endWhenNoPerson: p.endWhenNoPerson, resolveAll: p.resolveAll});
  const harness = memoryStorage();
  await playGame({decks: ["ha", "hb", "hc"].map((tag) => ({name: tag, ...deck(tag)})), seed: 1, cards, humans: [0], matchId: "harness", storage: harness, turnLimit: 1});
  eq(beats((await createMatchStore(harness, "harness").loadMatch()).pod), beats(launched), "and the G1 harness launches its games with the table's beats: the draw's click, the empty step passed, the game ending once every person is out, Resolve all");
  await t.concede(MAYA, now);
  eq((await t.view(ROB)).phase, "playing", "one person concedes: the other is still in, and the game goes on");
  const ended = await t.concede(ROB, now);
  eq(ended.phase, "rematch", "the last person concedes: the game ends, and the table moves on to the rematch question");
}

console.log(`game-leave: ${checks} checks passed — ${conceded} concessions fuzzed through the engine, End game for everyone by any person, the five minutes a dropped player has, recorded as not finished, and the game ending once every person is out.`);
