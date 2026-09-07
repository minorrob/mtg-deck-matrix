// Everything this app remembers about YOU, and the three things done to it:
// listed, backed up, and cleared.
//
// The failure this suite exists for is silent: a key written by one page and missing
// from this list survives a clear, so "this browser will look like one that has never
// opened the app" is a promise the dialog makes and the code does not keep. It also
// survives a backup, so the file offered before the clear does not contain it either.
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {createRequire} from "node:module";

const require = createRequire(import.meta.url);
const User = require("../user-state.js");

let checks = 0;
const check = (label, fn) => { fn(); checks += 1; console.log("  ok  " + label); };
const store = () => ({
  d: {},
  get length() { return Object.keys(this.d).length; },
  key(i) { return Object.keys(this.d)[i]; },
  getItem(k) { return k in this.d ? this.d[k] : null; },
  setItem(k, v) { this.d[k] = String(v); },
  removeItem(k) { delete this.d[k]; }
});

check("every key names a module, and no key is listed twice", () => {
  const seen = new Set();
  for (const k of User.KEYS) {
    assert.ok(k.key && k.owner && k.what, `${k.key || "(unnamed)"} is missing a field`);
    assert.ok(!seen.has(k.key), `${k.key} is listed twice`);
    seen.add(k.key);
  }
  assert.equal(seen.size, User.keys().length);
});

const sources = Object.fromEntries(await Promise.all(
  ["app.js", "viewer.js", "graph-page.js", "custom-model.js", "deck-store.js", "shop-filters.js"]
    .map(async (f) => [f, await readFile(new URL(`../${f}`, import.meta.url), "utf8")])
));
const allSource = Object.values(sources).join("\n");

check("every key is one the code actually writes, in the module it names", () => {
  for (const k of User.KEYS) {
    assert.ok(allSource.includes(`"${k.key}"`),
      `${k.key} is listed here but no page writes it — either it is stale or the writer renamed it`);
  }
});

check("every saved key carries a version marker, so one can be spotted on sight", () => {
  // The shape is what the next check leans on. Two keys predate the convention and are
  // named here rather than quietly exempted by a looser pattern.
  const LEGACY = new Set(["mtg-variant-picks"]);
  for (const k of User.keys()) {
    assert.ok(/(-v\d+|\.v\d+)$/.test(k) || LEGACY.has(k),
      `${k} has no version marker — add one, or name it in this test's LEGACY set`);
  }
});

check("nothing writes a key this list does not name", () => {
  /* Storage keys are string literals beginning "mtg-" and ending in a version marker.
     The version marker is what separates them from the other "mtg-" strings in these
     files -- the app id, a download filename, a template filename -- which are not keys
     and would otherwise have to be exempted one at a time forever.
     A key that is written and not listed survives every clear, which is the bug. */
  const found = new Set((allSource.match(/"mtg-[a-zA-Z0-9.:-]+"/g) || [])
    .map((s) => s.slice(1, -1))
    .filter((k) => /(-v\d+|\.v\d+)$/.test(k)));
  const known = new Set(User.keys());
  const strangers = [...found].filter((k) => !known.has(k) && !k.startsWith(User.SESSION_PREFIX));
  assert.deepEqual(strangers, [],
    `these keys are written but never cleared: ${strangers.join(", ")}`);
});

check("present() reports what is really there, and isFresh follows it", () => {
  const s = store();
  assert.deepEqual(User.present(s), []);
  assert.equal(User.isFresh(s), true);
  s.setItem("mtg-viewer.v1", "{}");
  assert.deepEqual(User.present(s).map((k) => k.key), ["mtg-viewer.v1"]);
  assert.equal(User.isFresh(s), false);
});

check("clearAll removes every named key and every cached Scryfall answer", () => {
  const local = store(), session = store();
  User.keys().forEach((k) => local.setItem(k, "x"));
  local.setItem("something-else-on-this-origin", "keep me");
  session.setItem(User.SESSION_PREFIX + "sol ring", "{}");
  session.setItem("unrelated", "keep me");

  const gone = User.clearAll(local, session);
  assert.equal(gone.keys.length, User.keys().length);
  assert.equal(gone.cached, 1);
  assert.deepEqual(Object.keys(local.d), ["something-else-on-this-origin"],
    "a clear must not reach beyond the keys it names");
  assert.deepEqual(Object.keys(session.d), ["unrelated"]);
  assert.equal(User.isFresh(local), true);
});

check("clearAll reports only what was actually removed", () => {
  const local = store();
  local.setItem("mtg-viewer.v1", "{}");
  assert.deepEqual(User.clearAll(local, null), {keys: ["mtg-viewer.v1"], cached: 0});
});

check("a backup round-trips byte for byte, including values that are not JSON", () => {
  // Some of these hold JSON and some hold a bare number. A restore that parsed them
  // would have to know which is which, and would drop the ones it guessed wrong about.
  const from = store();
  from.setItem("mtg-viewer.v1", '{"a":1}');
  from.setItem("mtg-last-export-v1", "1757200000000");
  const snap = User.snapshot(from);
  assert.equal(snap.kind, "mtg-deck-matrix-browser-backup");
  assert.deepEqual(snap.keys.sort(), ["mtg-last-export-v1", "mtg-viewer.v1"]);

  const to = store();
  const out = User.restore(to, snap);
  assert.deepEqual(out.restored.sort(), ["mtg-last-export-v1", "mtg-viewer.v1"]);
  assert.deepEqual(out.skipped, []);
  assert.equal(to.getItem("mtg-viewer.v1"), '{"a":1}');
  assert.equal(to.getItem("mtg-last-export-v1"), "1757200000000");
});

check("a backup covers exactly what a clear destroys", () => {
  // The dialog offers a backup "first". If the two lists ever differ, it is offering
  // to save less than it is about to delete.
  const s = store();
  User.keys().forEach((k) => s.setItem(k, "x"));
  assert.deepEqual(User.snapshot(s).keys.sort(), User.clearAll(s, null).keys.sort());
});

check("a restore names what it did not recognize rather than dropping it quietly", () => {
  const s = store();
  const out = User.restore(s, {kind: "mtg-deck-matrix-browser-backup", values: {
    "mtg-viewer.v1": "{}", "mtg-from-a-newer-build": "{}"
  }});
  assert.deepEqual(out.restored, ["mtg-viewer.v1"]);
  assert.deepEqual(out.skipped, ["mtg-from-a-newer-build"]);
});

check("a file that is not a backup is refused rather than half-applied", () => {
  const s = store();
  assert.throws(() => User.restore(s, {app: "something-else"}), /not a backup/);
  assert.throws(() => User.restore(s, null), /not a backup/);
  assert.deepEqual(Object.keys(s.d), []);
});

check("the committed default load is a real backup of nothing but named keys", async () => {
  const file = JSON.parse(await readFile(new URL("../data/my-load.json", import.meta.url), "utf8"));
  assert.equal(file.kind, "mtg-deck-matrix-browser-backup", "Load default reads it through restore()");
  const known = new Set(User.keys());
  const strangers = Object.keys(file.values).filter((k) => !known.has(k));
  assert.deepEqual(strangers, [], "a key restore() would skip is a key the default silently loses");
  const state = JSON.parse(file.values["mtg-deck-matrix-state-v1"]);
  const picks = Object.keys(state.buySelections || {});
  assert.equal(picks.length, 6, `the default load carries the six built decks, not ${picks.length}`);
  assert.deepEqual(picks.sort(), ["1b", "2c", "3o", "4e", "5o", "7e"]);
});

console.log(`\nuser-state: ${checks} checks passed across ${User.keys().length} saved keys.`);
