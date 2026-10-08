/* THE ENGINE'S STORAGE ADAPTER, AND A MATCH THAT MOVES BETWEEN PROCESSES (PLAN §3.8, task 4.1b).
 *
 * `docs/plan-to-100.md` M4: "a storage adapter: the runtime writes its journal and checkpoints through an
 * interface, not Node's `fs`, so a Durable Object can host it. It needs a test that a checkpoint resumes
 * identically in another process." This is that test, and the rules around it:
 *
 *   1. Nothing under game/engine/ imports a Node module or touches `process`: the engine is the same code in
 *      a test, on the local host and in a Durable Object.
 *   2. Both implementations (memory, and files on disk) keep the same contract, and refuse a key that could
 *      name a place outside the store.
 *   3. The match store appends a journal and never rewrites it, and verifies every checkpoint's hash on the
 *      way in and on the way out.
 *   4. A game checkpointed mid-play in this process and resumed by a SECOND Node process from nothing but
 *      the files reaches the same final state, with the same randomness drawn and a byte-identical journal,
 *      as the same game played through without stopping.
 */
import assert from "node:assert/strict";
import {readFileSync, readdirSync, statSync, mkdtempSync, rmSync, writeFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
import os from "node:os";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {memoryStorage, createMatchStore, checkKey, CHECKPOINT_SCHEMA} from "../game/engine/storage.mjs";
import {fileStorage} from "../game/server/storage-fs.mjs";
import {hashState} from "../game/engine/journal.mjs";
import {newGame, playOn, finished, MATCH, pod} from "./fixtures/engine-game.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };
const rejects = async (fn, re, m) => { await assert.rejects(fn, re, m); checks += 1; };

/* 1. No Node inside the engine. */
{
  const files = [];
  const walk = (d) => { for (const f of readdirSync(d)) { const p = path.join(d, f); if (statSync(p).isDirectory()) walk(p); else if (f.endsWith(".mjs") || f.endsWith(".js")) files.push(p); } };
  walk(path.join(ROOT, "game/engine"));
  ok(files.length > 20, `the engine's modules were found (${files.length})`);
  const offenders = files.filter((f) => {
    const code = readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    return /\bfrom\s+["'](node:[^"']+|fs|path|os|child_process|worker_threads)(\/[^"']*)?["']|\brequire\s*\(|\bprocess\.|\bimport\s*\(\s*["'](node:|fs|path|os)/.test(code);
  }).map((f) => path.relative(ROOT, f));
  eq(offenders, [], `nothing under game/engine/ may import a Node module or touch process, so a Durable Object can run it: ${offenders.join(", ")}`);
}

/* 2. The contract, on both implementations. */
const tmp = mkdtempSync(path.join(os.tmpdir(), "crank-storage-"));
try {
  for (const [name, storage] of [["memory", memoryStorage()], ["file", fileStorage(path.join(tmp, "contract"))]]) {
    eq(await storage.get("a/b"), null, `${name}: a missing key reads as null`);
    await storage.put("a/b", "one"); await storage.put("a/c", "two"); await storage.put("z", "three");
    eq(await storage.get("a/b"), "one", `${name}: what was put is what is read`);
    eq(await storage.list("a/"), ["a/b", "a/c"], `${name}: a prefix lists its keys in order`);
    eq(await storage.list(), ["a/b", "a/c", "z"], `${name}: and with no prefix, every key`);
    await storage.put("a/b", "uno");
    eq(await storage.get("a/b"), "uno", `${name}: a put replaces`);
    eq([await storage.delete("a/b"), await storage.delete("a/b")], [true, false], `${name}: a delete says whether there was anything`);
    for (const bad of ["", "../x", "a/../../x", "a//b", "/abs", "a/./b", "a\\b", "a b"])
      await rejects(() => storage.put(bad, "x"), /storage key/, `${name}: the key ${JSON.stringify(bad)} is refused`);
    await rejects(() => storage.put("a/n", 5), /strings/, `${name}: storage holds strings`);
  }
  eq(checkKey("match/resume/journal/0000000001"), "match/resume/journal/0000000001", "a match store's own keys are valid");

  /* 3. The match store's rules, in memory. */
  {
    const store = createMatchStore(memoryStorage(), "m1");
    await store.saveMatch({pod, seed: "s"});
    await rejects(() => store.saveMatch({pod, seed: "s"}), /started once/, "a match is started once");
    eq((await store.loadMatch()).seed, "s", "and its seed is kept");
    const g = newGame("store-rules");
    playOn(g, 50);
    const events = g.journal.events().map((e) => ({...e, matchId: "m1"}));
    await store.appendEvents(events);
    await rejects(() => store.appendEvents(events.slice(0, 1)), /never rewritten/, "a journal event is never written twice");
    eq((await store.readJournal()).map((e) => e.sequence), events.map((e) => e.sequence), "the journal reads back in order");
    const point = {...g.journal.checkpoint(g.state, g.rng.checkpoint()), matchId: "m1"};
    await store.saveCheckpoint(point);
    eq((await store.latestCheckpoint()).hash, point.hash, "the latest checkpoint reads back");
    await rejects(() => store.saveCheckpoint({...point, state: {...point.state, turn: point.state.turn + 1}}), /does not match its hash/, "a checkpoint whose state is not the one its hash describes is refused");
    await rejects(() => store.saveCheckpoint({...point, matchId: "other"}), /not m1/, "and one for another match");
    await rejects(() => store.saveCheckpoint({...point, schema: "x"}), new RegExp(CHECKPOINT_SCHEMA), "and one that is not a checkpoint");
    /* A state JSON would not carry whole -- a key holding undefined, a number that is not finite -- hashes as it is in
       memory and not as it reads back, so a room could never wake from it (G1, 2026-10-08): refused as it is saved. */
    for (const [label, effect, field] of [["a key holding undefined", {id: "e", layer: 6, sublayer: undefined}, "state.effects.0.sublayer is undefined"],
      ["a number that is not finite", {id: "e", layer: 7, timestamp: NaN}, "state.effects.0.timestamp is NaN"]]) {
      const state = {...point.state, effects: [effect]};
      await rejects(() => createMatchStore(memoryStorage(), "m1").saveCheckpoint({...point, state, hash: hashState(state)}), new RegExp(`would not read back.*${field.replace(/\./g, "\\.")}`),
        `a checkpoint whose state holds ${label} is refused as it is saved, naming the field`);
    }
    eq(await createMatchStore(memoryStorage(), "empty").latestCheckpoint(), null, "a match with no checkpoint yet says so");
  }

  /* 4. The match moves between processes. */
  {
    const seed = "resume-across-processes";
    const reference = newGame(seed);
    playOn(reference);
    ok(finished(reference), "the reference game, played straight through, finishes");

    const dir = path.join(tmp, "match");
    const store = createMatchStore(fileStorage(dir), MATCH);
    await store.saveMatch({pod, seed});
    const first = newGame(seed);
    const made = playOn(first, 400);
    eq(made, 400, "the first process plays 400 decisions");
    ok(!finished(first), "and stops mid-game, not at its end");
    await store.appendEvents(first.journal.events());
    const point = first.journal.checkpoint(first.state, first.rng.checkpoint());
    await store.saveCheckpoint(point);

    const child = spawnSync(process.execPath, [path.join(ROOT, "tests/fixtures/engine-resume-child.mjs"), dir, MATCH], {encoding: "utf8"});
    eq(child.status, 0, `the second process resumed and finished: ${child.stderr}`);
    const out = JSON.parse(child.stdout);
    ok(out.pid !== process.pid, "in a different process");
    eq(out.resumedAt, point.sequence, "from the checkpoint the first process saved");
    eq(out.hash, hashState(reference.state), "and it reached the same final state as the game played without stopping");
    eq(out.turn, reference.state.turn, "on the same turn");
    eq(out.rng, reference.rng.checkpoint(), "having drawn exactly the same randomness");
    eq(JSON.stringify(await store.readJournal()), JSON.stringify(reference.journal.events()),
      "and the journal on disk, first process then second, is byte-identical to the uninterrupted one");

    /* An edited checkpoint is not the game that was saved. */
    const file = path.join(dir, "match", MATCH, "checkpoint", `${String(point.sequence).padStart(10, "0")}.json`);
    const saved = JSON.parse(readFileSync(file, "utf8"));
    saved.state.turn += 1;
    writeFileSync(file, JSON.stringify(saved));
    await rejects(() => store.latestCheckpoint(), /does not match its hash/, "a checkpoint edited on disk is refused rather than resumed");
    const again = spawnSync(process.execPath, [path.join(ROOT, "tests/fixtures/engine-resume-child.mjs"), dir, MATCH], {encoding: "utf8"});
    ok(again.status !== 0 && /does not match its hash/.test(again.stderr), "and the second process refuses it too");
  }
} finally {
  rmSync(tmp, {recursive: true, force: true});
}

console.log(`engine-storage: ${checks} checks passed — no Node in the engine, one storage contract in memory and on disk, and a game checkpointed here resumed in another process to the same state, randomness and journal.`);
