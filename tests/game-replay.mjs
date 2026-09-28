/* A GAME REPLAYS FROM ITS SEED AND ITS TAPE (docs/plan-to-100.md M8; game/room/replay.mjs).
 *
 * The playtest program hands over games, and a finding is only as good as seeing it happen again. The room kept
 * the seed and a journal of what the engine did, but not what people told it: their answers lived only in a
 * receipt list capped at 256. Now every person's input is on a decision tape, numbered and stored with the match.
 *
 *   Taped      every answer, the seat that left and the game ended are on the tape, in order, numbered without a
 *              gap, across a room evicted and woken every ten decisions and past the receipts' 256
 *   Replayed   a fresh room fed the seed, the pod and the tape reaches the same state, the same journal (its hash
 *              and length) and the same end as the stored game
 *   Refused    a tampered tape is refused at the entry where it parts from the game, by number
 *   Private    a fingerprint is hashes and counts, never a card; the replayer imports nothing a Worker lacks
 *
 * The decks are the room suite's (tests/game-room.mjs): lands, vanilla creatures and a commander per seat.
 */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {randomUUID} from "node:crypto";
import {memoryStorage, createMatchStore} from "../game/engine/storage.mjs";
import {createRng} from "../game/engine/rng.mjs";
import {randomLegalPilot} from "../game/engine/pilots/random-legal.mjs";
import {startRoom, openRoom, basicCards} from "../game/room/room.mjs";
import {replayTape, replayMatch} from "../game/room/replay.mjs";

let checks = 0;
const ok = (c, m) => {assert.ok(c, m); checks += 1;};
const eq = (a, b, m) => {assert.deepEqual(a, b, m); checks += 1;};

{
  const src = readFileSync(new URL("../game/room/replay.mjs", import.meta.url), "utf8");
  ok(!/from\s+["'](node:|fs|path|os|child_process|worker_threads)/.test(src) && !/\brequire\(|\bprocess\./.test(src), "the replayer imports nothing a Worker lacks");
}

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
function person(seed) {
  const pilot = randomLegalPilot(createRng(seed));
  return (decision) => {
    const a = pilot.answer(decision);
    return {kind: "answer", choiceId: decision.id, ...(a.indices ? {indices: a.indices} : {}), ...(a.amounts ? {amounts: a.amounts} : {}), ...(a.value !== undefined ? {value: a.value} : {})};
  };
}

/* A game with everything a tape must carry: answers past the receipts' 256, a seat that leaves, the game ended,
   and the room evicted and woken every ten decisions. */
const storage = memoryStorage(), matchId = "replay-1";
let room = await startRoom({storage, matchId, cards, pod: POD, seed: "seed-replay"});
const people = Object.fromEntries(HUMANS.map((h) => [h, person(`person-${h}`)]));
let decisions = 0;
for (;;) {
  const who = room.waitingOn;
  if (!who || room.status !== "playing") break;
  if (decisions === 300 && who === "maya") {await room.leave("maya", "conceded"); continue;}
  if (decisions >= 360) {await room.end("rob"); break;}
  const view = room.view(who);
  await room.act(who, {actionId: randomUUID(), revision: view.revision, ...people[who](view.decision)});
  decisions += 1;
  if (decisions % 10 === 0) room = await openRoom({storage, matchId, cards});
}
ok(decisions > 256, `the people made ${decisions} decisions, past the 256 receipts a room keeps`);

/* TAPED */
const tape = await createMatchStore(storage, matchId).readTape();
eq(tape.map((t) => t.n), tape.map((_, i) => i), `the tape is numbered without a gap across ${Math.floor(decisions / 10)} wakings (${tape.length} entries)`);
eq(tape.filter((t) => t.kind === "answer").length, decisions, "every answer a person gave is on it");
eq(tape.filter((t) => t.kind !== "answer").map((t) => [t.kind, t.seat, t.why ?? ""]), [["leave", "maya", "conceded"], ["end", "rob", ""]], "and the seat that left and the game ended, in order");
await assert.rejects(createMatchStore(storage, matchId).appendTape([tape[0]]), /already written/, "a tape entry is written once, never rewritten"); checks += 1;

/* REPLAYED */
const proof = await replayMatch({storage, matchId, cards});
ok(proof.same, `a fresh room fed the seed, the pod and the tape is the same game: ${JSON.stringify(proof.original)}`);
eq(proof.replayed.status, "finished", "and ends as the stored game ended");
{/* A stored journal that is not the one this tape makes is found out, even where the state agrees. */
  const key = (await storage.list(`match/${matchId}/journal/`))[5], was = await storage.get(key), e = JSON.parse(was);
  await storage.put(key, JSON.stringify({...e, data: {...e.data, edited: true}}));
  ok(!(await replayMatch({storage, matchId, cards})).same, "a stored journal edited after the fact does not match its replay");
  await storage.put(key, was);}
const meta = await createMatchStore(storage, matchId).loadMatch();
const again = await replayTape({matchId, pod: meta.pod, seed: meta.seed, tape, cards});
eq(again.fingerprint(), (({journal, ...rest}) => rest)(proof.replayed), "a second replay is the same again");

/* REFUSED */
const bent = structuredClone(tape), at = bent.findIndex((t, i) => i > 20 && t.kind === "answer");
bent[at].seat = bent[at].seat === "rob" ? "maya" : "rob";
await assert.rejects(replayTape({matchId, pod: meta.pod, seed: meta.seed, tape: bent, cards}), new RegExp(`parts from the game at entry ${bent[at].n}\\b`), "a tampered tape is refused where it parts from the game"); checks += 1;
const short = tape.slice(0, 50), part = await replayTape({matchId, pod: meta.pod, seed: meta.seed, tape: short, cards});
ok(part.fingerprint().hash !== proof.original.hash && part.fingerprint().tape === 50, "a truncated tape is a different, earlier game, not the stored one");

/* PRIVATE */
eq(Object.keys(proof.original).sort(), ["events", "hash", "journal", "status", "tape"], "a fingerprint is hashes and counts");
ok(!/Bear|Wolf|Wurm|Elf|Grove|General/.test(JSON.stringify(proof)), "and names no card");
console.log(`game-replay: ${checks} checks passed — ${decisions} decisions and ${tape.length} tape entries replay to the same game from the seed, and a tampered tape is refused where it parts.`);
