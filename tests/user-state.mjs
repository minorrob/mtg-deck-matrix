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

/* THE MODULES THAT STILL EXIST TO WRITE A KEY. matrix.html, legacy-decks.html and
   legacy-graph.html were retired, and app.js, viewer.js, graph-page.js and shop-page.js
   went with them -- so fifteen of these keys now have no writer at all. They stay listed
   here and in user-state.js on purpose: a key nothing writes is still a key somebody's
   browser is holding, and the backup folds every one of them into the export. What the
   list must not do is claim a live writer that is not there, so the ones whose module is
   gone are named rather than quietly skipped. */
const RETIRED = new Set(["app.js", "viewer.js", "graph-page.js", "shop-page.js"]);
const sources = Object.fromEntries(await Promise.all(
  ["custom-model.js", "deck-store.js", "shop-filters.js",
    "manual-cards.js", "user-state.js", "card-images.js"]
    .map(async (f) => [f, await readFile(new URL(`../${f}`, import.meta.url), "utf8")])
));
const allSource = Object.values(sources).join("\n");
const appModule = await readFile(new URL("../crankmagic-app.js", import.meta.url), "utf8");

check("every key with a living writer is one that module actually writes", () => {
  for (const k of User.KEYS) {
    if (RETIRED.has(k.owner)) continue;      // no writer left; kept so a backup still carries it
    assert.ok(allSource.includes(`"${k.key}"`),
      `${k.key} is listed here but ${k.owner} does not write it — either it is stale or the writer renamed it`);
  }
});

check("a key whose writer was retired is still listed, so a backup can carry it", () => {
  /* This is the whole reason user-state.js outlives the pages: crankmagic-app.js folds
     MtgUserState.snapshot(localStorage) into every backup, and it can only carry what
     this list names. Losing an entry here silently drops somebody's old records. */
  const orphaned = User.KEYS.filter((k) => RETIRED.has(k.owner));
  assert.ok(orphaned.length >= 10,
    `only ${orphaned.length} keys are attributed to the retired pages; the list has been trimmed`);
  assert.match(appModule, /MtgUserState\.snapshot\(localStorage\)/,
    "the backup must still capture the retired pages' storage");
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

/* ---------------------------------------------------------------------------
   CLEARING IS A DECISION, NOT JUST A DELETION.
   The bug: Clear session emptied the page, and then adding ONE deck of your own brought
   all six shipped decks back -- with their collection, their bench and their ownership
   figures -- because the app decided what to show by asking "has this browser saved
   anything?" and saving your deck changed the answer. 459 bench copies of someone else's
   cards, for the crime of adding a deck. What follows pins the recorded decision that
   replaced the inference.
   --------------------------------------------------------------------------- */

check("a browser that has never opened the app starts empty, and says so out loud", () => {
  const jar = store();
  assert.equal(User.startsEmpty(jar), true);
  assert.equal(User.catalogSource(jar), "empty", "the answer is written down, not re-guessed");
});

check("a browser that already had state keeps the six", () => {
  const jar = store();
  jar.setItem("mtg-imported-decks.v1", "[]");
  assert.equal(User.startsEmpty(jar), false);
  assert.equal(User.catalogSource(jar), "default");
});

check("adding a deck after a clear does not bring the six back", () => {
  const jar = store();
  jar.setItem("mtg-viewer-inventory.v1", '{"cards":[]}');
  jar.setItem("mtg-deck-matrix-state-v1", "{}");
  assert.equal(User.startsEmpty(jar), false, "before the clear, the six are there");

  User.clearAll(jar, null);
  User.setCatalogSource(jar, "empty");          // what Clear session does
  assert.equal(User.startsEmpty(jar), true);

  jar.setItem("mtg-imported-decks.v1", '[{"id":"U1"}]');   // and now you add a deck
  assert.equal(User.startsEmpty(jar), true,
    "THE BUG: this used to flip back to false and resurrect six decks and a bench");
});

check("Load default is the one thing that brings them back", () => {
  const jar = store();
  User.setCatalogSource(jar, "empty");
  assert.equal(User.startsEmpty(jar), true);
  User.setCatalogSource(jar, "default");
  assert.equal(User.startsEmpty(jar), false);
});

check("the note about which catalog to start from is not counted as something you saved", () => {
  const jar = store();
  User.setCatalogSource(jar, "empty");
  assert.equal(User.present(jar).length, 0,
    "or Clear session offers to clear the note it just wrote");
  assert.equal(User.isFresh(jar), true);
  const gone = User.clearAll(jar, null);
  assert.ok(gone.keys.includes(User.CATALOG_KEY),
    "it is still removed by a clear -- it is just not advertised");
});

check("a junk value falls back to deciding rather than to a broken third state", () => {
  const jar = store();
  jar.setItem(User.CATALOG_KEY, "banana");
  assert.equal(User.catalogSource(jar), "");
  assert.equal(User.startsEmpty(jar), true, "nothing else saved, so: empty");
});

console.log(`\nuser-state: ${checks} checks passed across ${User.keys().length} saved keys.`);
