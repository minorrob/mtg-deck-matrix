/* THE TABLE'S HISTORY (M5; game/room/history.mjs, carried in every room view).
 *
 *   Lines     each engine event the history speaks of becomes the line the board shows; tapping, mana and the
 *             steps of a turn say nothing; a player's draws in a row are one line that counts.
 *   Hidden    a card moving between two hidden zones is never named. Played for real: two people and two house
 *             pilots, twelve turns, and at every decision no seat's history holds, anywhere in any line, the
 *             name of a card that only another seat's hand or a library holds.
 *   Same      every seat is shown the same history; it survives the room being put away and woken.
 *   Room      conceding and End game are lines too; the history keeps its newest 300 lines.
 */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {randomUUID} from "node:crypto";
import {memoryStorage} from "../game/engine/storage.mjs";
import {createRng} from "../game/engine/rng.mjs";
import {randomLegalPilot} from "../game/engine/pilots/random-legal.mjs";
import {startRoom, openRoom, basicCards} from "../game/room/room.mjs";
import {historyLines, addToHistory, HISTORY_LIMIT} from "../game/room/history.mjs";

let checks = 0;
const ok = (c, m) => {assert.ok(c, m); checks += 1;};
const eq = (a, b, m) => {assert.deepEqual(a, b, m); checks += 1;};

const src = readFileSync(new URL("../game/room/history.mjs", import.meta.url), "utf8");
ok(!/from\s+["'](node:|fs|path|os)/.test(src) && !/\brequire\(|\bprocess\./.test(src), "the history imports nothing a Worker lacks");

/* 1. LINES, one event at a time. */
const NAMES = ["Rob", "Maya"];
const ev = (kind, fields, turn = 3) => ({kind, data: {turn, phase: "MAIN1", fields}});
const card = (name, owner = 0, extra = {}) => ({cardId: 7, name, owner, controller: owner, faceDown: false, ...extra});
const zone = (from, to, c) => ev("GameEventCardChangeZone", {card: c, from: {zoneType: from, player: {playerId: c.owner}}, to: {zoneType: to, player: {playerId: c.owner}}});
const say = (e) => historyLines(e, NAMES).map((l) => l.text);
eq(say(ev("GameEventTurnPhase", {phase: "UNTAP", playerTurn: {playerId: 1}})), ["Turn 3 · Maya"], "a turn begins: Turn 3 · Maya");
eq(say(ev("GameEventTurnPhase", {phase: "UPKEEP", playerTurn: {playerId: 1}})), [], "its steps say nothing");
eq(say(ev("GameEventLandPlayed", {land: card("Forest"), player: {playerId: 0}})), ["Rob played Forest"], "a land played");
eq(say(ev("GameEventSpellAbilityCast", {card: card("Llanowar Elves"), sa: {isSpell: true}, si: {actor: {playerId: 0}}})), ["Rob cast Llanowar Elves"], "a spell cast");
eq(say(ev("GameEventSpellAbilityCast", {card: card("Morph", 0, {faceDown: true}), sa: {isSpell: true}, si: {actor: {playerId: 0}}})), ["Rob cast a face-down card"], "a face-down spell, unnamed");
eq(say(ev("GameEventSpellResolved", {card: {cardId: 7, name: "Llanowar Elves"}})), ["Llanowar Elves resolved"], "a spell resolved");
eq(say(zone("Hand", "Graveyard", card("Opt"))), ["Rob discarded Opt"], "a discard names the card, now public");
eq(say(zone("Library", "Graveyard", card("Opt"))), ["Opt was milled"], "a mill");
eq(say(zone("Battlefield", "Graveyard", card("Bear", 1))), ["Bear went to the graveyard"], "a creature dies");
eq(say(zone("Battlefield", "Exile", card("Bear", 1))), ["Bear was exiled"], "an exile");
eq(say(zone("Battlefield", "Hand", card("Bear", 1))), ["Bear returned to Maya's hand"], "a bounce names what was public");
eq(say(zone("Hand", "Library", card("Secret Tutor"))), [], "a hand to a library: nothing, it was never public");
eq(say(zone("Hand", "Stack", card("Opt"))), [], "a cast's own move is already said by the cast");
eq(say(ev("GameEventPlayerLivesChanged", {player: {playerId: 1}, oldLives: 40, newLives: 37})), ["Maya: 40 → 37 life"], "life changes");
eq(say(ev("GameEventPlayerLivesChanged", {player: {playerId: 1}, oldLives: 0, newLives: 0, lost: true, lossReason: "conceded"})), ["Maya lost the game (conceded)"], "a loss, and why");
eq(say(ev("GameEventPlayerDamaged", {source: card("Bear"), target: {playerId: 1}, amount: 2})), ["Bear dealt 2 to Maya"], "damage to a player");
eq(say(ev("GameEventCardDamaged", {source: card("Bear"), card: card("Elf", 1), amount: 2})), ["Bear dealt 2 to Elf"], "damage to a creature");
eq(say(ev("GameEventAttackersDeclared", {player: {playerId: 0}, attackers: [{card: card("Bear")}, {card: card("Wolf")}]})), ["Rob attacked with Bear, Wolf"], "attackers");
eq(say(ev("GameEventBlockersDeclared", {player: {playerId: 1}, blockers: [{card: card("Elf", 1), blocking: card("Bear")}]})), ["Maya: Elf blocked Bear"], "blockers");
eq(say(ev("GameEventGameOutcome", {winner: 1, reason: "last player standing"})), ["Maya won"], "the outcome");
for (const quiet of ["GameEventCardTapped", "GameEventManaPool", "GameEventShuffle"]) eq(say(ev(quiet, {player: {playerId: 0}, card: card("Forest")})), [], `${quiet} says nothing`);
const draws = [];
for (let i = 0; i < 7; i += 1) addToHistory(draws, zone("Library", "Hand", card(`Secret ${i}`)), NAMES);
addToHistory(draws, zone("Library", "Hand", card("Secret M", 1)), NAMES);
eq(draws.map((l) => l.text), ["Rob drew 7 cards", "Maya drew a card"], "draws in a row are one line that counts, and never name the card");
const long = [];
for (let i = 0; i < HISTORY_LIMIT + 50; i += 1) addToHistory(long, ev("GameEventLandPlayed", {land: card(`Land ${i}`), player: {playerId: 0}}), NAMES);
eq([long.length, long[0].text], [HISTORY_LIMIT, "Rob played Land 50"], `the history keeps its newest ${HISTORY_LIMIT} lines`);

/* 2. HIDDEN, in real games. Every card has its own name, so a name in a line can be traced to where it was. */
const DEFS = new Map();
const def = (name, d) => {DEFS.set(name, d); return name;};
const cards = (name) => DEFS.get(name) ?? basicCards(name);
function deck(seat) {
  const list = [];
  for (let i = 0; i < 38; i += 1) list.push(def(`Grove ${seat}`, {types: ["Land"], abilities: [{id: "t-g", kind: "mana", tapSelf: true, produces: {G: 1}}]}));
  const kinds = [["Bear", 2, 2, "{1}{G}"], ["Wolf", 3, 3, "{2}{G}"], ["Wurm", 5, 5, "{4}{G}"], ["Elf", 1, 1, "{G}"]];
  for (let i = 0; i < 61; i += 1) {const [k, p, t, c] = kinds[i % 4]; list.push(def(`${k} ${seat}-${i}`, {types: ["Creature"], power: p, toughness: t, manaCost: c}));}
  return {commander: [def(`General ${seat}`, {types: ["Creature"], power: 3, toughness: 3, manaCost: "{2}{G}"})], cards: list};
}
const POD = {seats: [
  {seatId: "rob", name: "Rob", pilot: "human", ...deck(0)},
  {seatId: "maya", name: "Maya", pilot: "human", ...deck(1)},
  {seatId: "ai-1", name: "House 1", pilot: "house", ...deck(2)},
  {seatId: "ai-2", name: "House 2", pilot: "house", ...deck(3)},
]};
const HUMANS = ["rob", "maya"];
const rawState = async (storage, matchId) => JSON.parse(await storage.get(`match/${matchId}/checkpoint/${String(JSON.parse(await storage.get(`match/${matchId}/checkpoint/latest`)).sequence).padStart(10, "0")}`)).state;
/* Names only another seat's hand, or a library, holds -- and that nothing public shares. */
function secretsFor(state, seat) {
  const pub = new Set(), secret = new Set();
  for (const o of Object.values(state.objects)) {
    if (o.zone === "library" || (o.zone === "hand" && o.owner !== seat)) secret.add(o.card); else pub.add(o.card);
  }
  for (const n of pub) secret.delete(n);
  return secret;
}
function person(seed) {
  const pilot = randomLegalPilot(createRng(seed));
  return (d) => {const a = pilot.answer(d); return {kind: "answer", choiceId: d.id, ...(a.indices ? {indices: a.indices} : {}), ...(a.amounts ? {amounts: a.amounts} : {})};};
}

let linesRead = 0, viewsRead = 0;
for (const seed of ["h-1", "h-2", "h-3"]) {
  const storage = memoryStorage(), matchId = `hist-${seed}`;
  let room = await startRoom({storage, matchId, cards, pod: POD, seed});
  const people = Object.fromEntries(HUMANS.map((h) => [h, person(`${seed}-${h}`)]));
  for (let n = 0; room.waitingOn; n += 1) {
    const who = room.waitingOn, view = room.view(who);
    if (view.state.turn > 12) break;
    const state = await rawState(storage, matchId);
    const shown = room.seats.map((s) => room.view(s.seatId).history);
    for (const [i, s] of room.seats.entries()) {
      const secret = [...secretsFor(state, i)];
      for (const line of shown[i]) {
        const leaked = secret.find((name) => new RegExp(`${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w-])`).test(line.text));
        if (leaked) assert.fail(`seat ${s.seatId} was told "${line.text}", naming ${leaked}, which only a hidden zone holds`);
        linesRead += 1;
      }
      viewsRead += 1;
    }
    if (shown.some((h) => JSON.stringify(h) !== JSON.stringify(shown[0]))) assert.fail("two seats were shown different histories");
    await room.act(who, {actionId: randomUUID(), revision: view.revision, ...people[who](view.decision)});
    if (n % 25 === 24) room = await openRoom({storage, matchId, cards});
  }
  const h = room.view("rob").history;
  ok(h.some((l) => l.mark === "turn" && /^Turn 1 · /.test(l.text)) && h.some((l) => / played Grove \d/.test(l.text)) && h.some((l) => / drew (a card|\d+ cards)$/.test(l.text)), `game ${seed}: its history has the turns, the lands played and the draws (${h.length} lines shown)`);
  const woken = await openRoom({storage, matchId, cards});
  eq(woken.view("maya").history, room.view("maya").history, `game ${seed}: the history is the same after the room is put away and woken`);
}
ok(linesRead > 10000, `no seat's history named a card only a hidden zone held: ${linesRead} lines read across ${viewsRead} views`);

/* 3. THE ROOM'S OWN LINES: conceding, and End game. */
{
  const storage = memoryStorage();
  const room = await startRoom({storage, matchId: "hist-room", cards, pod: POD, seed: "h-room"});
  await room.leave("maya", "conceded");
  ok(room.view("rob").history.some((l) => l.text === "Maya conceded"), "a concession is a line");
  await room.end("rob");
  eq(room.view("rob").history.at(-1).text, "Rob ended the game for everyone · not finished", "and so is End game, as not finished");
  eq(room.view("rob").history.map((l) => Object.keys(l).filter((k) => !["turn", "text", "mark"].includes(k))).flat(), [], "a view's lines carry only the turn, the words and a mark");
}
{
  const storage = memoryStorage();
  const room = await startRoom({storage, matchId: "hist-time", cards, pod: POD, seed: "h-time"});
  await room.leave("rob", "timed-out");
  ok(room.view("maya").history.some((l) => l.text === "Rob ran out of time · not finished"), "running out of time is a line, as not finished");
}

console.log(`game-history: ${checks} checks passed — the table's history in words: every line public, the same for every seat, ${linesRead} lines read in three games with nothing hidden named, the room's own lines kept.`);
