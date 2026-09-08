/* THE OFFLINE CACHE, AND THE PRICE OF CHANGING ONE LINE OF CSS.
 *
 * The worker used to keep one cache named after its own ?v=. Every asset bump changes the
 * worker, so every asset bump changed the cache name, so every asset bump threw the whole
 * cache away -- data/graph.json included, which is 7.1 MB on its own. A CSS fix cost the
 * next visit the entire catalog.
 *
 * It now keeps two, each keyed on a hash of its own list: the shell (pages, styles,
 * modules, fonts, art) and the data files. The property that matters is that neither key
 * moves when the other list does, and this suite holds the worker to it by running its
 * real source against a fake Cache Storage rather than by reading it.
 */
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import vm from "node:vm";

const ROOT = new URL("../", import.meta.url);
const SOURCE = await readFile(new URL("crankmagic-sw.js", ROOT), "utf8");

let checks = 0;
/* Awaited, or an async check that rejects would pass silently -- which is the exact
   class of bug this file exists to catch elsewhere. */
const ok = async (label, fn) => {await fn(); checks += 1; process.stdout.write(`  ok  ${label}\n`);};

/* A service worker global with just enough of one to run: the event listeners it
   registers, a Cache Storage that records what was opened and deleted, and a fetch that
   never happens because nothing here dispatches a fetch event. */
function run(source) {
  const listeners = new Map();
  const caches = new Map();          // name -> Set(url)
  const deleted = [];
  const opened = [];
  const cacheStorage = {
    open: async (name) => {
      opened.push(name);
      if (!caches.has(name)) caches.set(name, new Set());
      const entries = caches.get(name);
      return {addAll: async (files) => files.forEach((f) => entries.add(f)), match: async () => undefined, put: async () => {}};
    },
    keys: async () => [...caches.keys()],
    delete: async (name) => {deleted.push(name); return caches.delete(name);},
  };
  const self = {
    location: new URL("https://minorrob.github.io/mtg-deck-matrix/crankmagic-sw.js?v=51"),
    addEventListener: (type, fn) => listeners.set(type, fn),
    clients: {claim: async () => {}},
    caches: cacheStorage,
  };
  const context = vm.createContext({self, caches: cacheStorage, URL, Math, console, fetch: async () => {throw new Error("no network in this suite");}});
  vm.runInContext(source, context);
  return {listeners, caches, deleted, opened, context};
}

/* Fire install and activate the way the browser does, and hand back what ended up cached
   under which name. */
async function installed(source) {
  const world = run(source);
  const waits = [];
  await world.listeners.get("install")({waitUntil: (p) => waits.push(p)});
  await Promise.all(waits);
  const before = [...world.caches.keys()];
  const activateWaits = [];
  await world.listeners.get("activate")({waitUntil: (p) => activateWaits.push(p)});
  await Promise.all(activateWaits);
  return {...world, before};
}

const first = await installed(SOURCE);
const names = [...first.caches.keys()];

await ok("the worker keeps the shell and the data in two caches, not one", () => {
  assert.equal(names.length, 2, `expected a shell cache and a data cache, got ${names.join(", ") || "none"}`);
  assert.ok(names.some((n) => n.includes(":shell:")), `no shell cache among ${names.join(", ")}`);
  assert.ok(names.some((n) => n.includes(":data:")), `no data cache among ${names.join(", ")}`);
  assert.ok(names.every((n) => n.startsWith("crankmagic-public:/mtg-deck-matrix/:")),
    "both caches must stay under the path-scoped prefix, or two deployments on one origin evict each other");
});

const shellName = names.find((n) => n.includes(":shell:"));
const dataName = names.find((n) => n.includes(":data:"));

await ok("every data file is in the data cache and nothing else is", () => {
  const data = [...first.caches.get(dataName)];
  assert.ok(data.length >= 8, `only ${data.length} data files precached`);
  assert.deepEqual(data.filter((f) => !f.startsWith("data/")), [],
    "a non-data file landed in the data cache, so refreshing the catalog would evict it");
  const shell = [...first.caches.get(shellName)];
  assert.deepEqual(shell.filter((f) => f.startsWith("data/")), [],
    "a data file landed in the shell cache, so a CSS bump would evict it -- which is the bug this split exists to fix");
  assert.ok(shell.length > 45, `only ${shell.length} shell files precached`);
  // Both HTML entry points have to be there or the offline fallback has nothing to serve.
  for (const page of ["index.html", "crankmagic.html", "graph.html"]) assert.ok(shell.includes(page), `${page} is not precached`);
});

await ok("the simulator is still deliberately absent, so a first visit does not pay for it", () => {
  const all = [...first.caches.get(shellName), ...first.caches.get(dataName)];
  assert.deepEqual(all.filter((f) => /^sim-(engine|worker)\.js/.test(f)), [],
    "sim-engine and its worker are ~120 KB most sessions never run; precaching them makes every first visit pay for it");
});

/* ------------------------------------------- the property the split exists for */

const bumpShell = (text) => text.replace("crankmagic.css?v=28", "crankmagic.css?v=29");
const bumpData = (text) => text.replace("data/cards.json?v=3", "data/cards.json?v=4");

await ok("editing the CSS changes the shell key and leaves the data cache exactly where it was", async () => {
  const after = await installed(bumpShell(SOURCE));
  const afterShell = [...after.caches.keys()].find((n) => n.includes(":shell:"));
  const afterData = [...after.caches.keys()].find((n) => n.includes(":data:"));
  assert.notEqual(afterShell, shellName, "a changed shell file must change the shell key, or the browser serves the old CSS");
  assert.equal(afterData, dataName, "a changed shell file must NOT change the data key -- that is the 7.1 MB this split saves");
});

await ok("refreshing the catalog changes the data key and leaves the shell cache standing", async () => {
  const after = await installed(bumpData(SOURCE));
  const afterShell = [...after.caches.keys()].find((n) => n.includes(":shell:"));
  const afterData = [...after.caches.keys()].find((n) => n.includes(":data:"));
  assert.notEqual(afterData, dataName, "a changed data file must change the data key");
  assert.equal(afterShell, shellName, "a changed data file must NOT change the shell key, or a card refresh re-downloads the whole app");
});

await ok("the worker's own ?v= no longer decides either key", async () => {
  /* It used to be the ONLY thing that decided the key, which is why every bump wiped
     everything. The worker still carries a version so the browser refetches the script;
     it just must not be what names the caches any more. Served from a different worker
     URL, with the same two lists, both caches have to come back with the same names. */
  const world = run(SOURCE);
  world.context.self.location = new URL("https://minorrob.github.io/mtg-deck-matrix/crankmagic-sw.js?v=999");
  const waits = [];
  await world.listeners.get("install")({waitUntil: (p) => waits.push(p)});
  await Promise.all(waits);
  assert.deepEqual([...world.caches.keys()].sort(), [dataName, shellName].sort(),
    "the cache names moved with the worker's version, which is the behaviour that threw 7.1 MB away on every CSS fix");
});

await ok("activate deletes stale caches under this prefix and keeps both current ones", async () => {
  const world = run(SOURCE);
  // Two leftovers from earlier deployments, plus another app's cache that must survive.
  world.caches.set("crankmagic-public:/mtg-deck-matrix/:shell:oldkey", new Set());
  world.caches.set("crankmagic-public:/mtg-deck-matrix/:data:oldkey", new Set());
  world.caches.set("some-other-app:v1", new Set());
  const installs = [];
  await world.listeners.get("install")({waitUntil: (p) => installs.push(p)});
  await Promise.all(installs);
  const activates = [];
  await world.listeners.get("activate")({waitUntil: (p) => activates.push(p)});
  await Promise.all(activates);
  assert.deepEqual(world.deleted.slice().sort(),
    ["crankmagic-public:/mtg-deck-matrix/:data:oldkey", "crankmagic-public:/mtg-deck-matrix/:shell:oldkey"],
    "activate must clear this app's stale caches and nothing else");
  const left = [...world.caches.keys()].sort();
  assert.deepEqual(left, [dataName, shellName, "some-other-app:v1"].sort(),
    "both current caches survive activation, and another app on the same origin is untouched");
});

await ok("every precached file names a version, so a change can never be served stale", () => {
  const listed = [...first.caches.get(shellName), ...first.caches.get(dataName)];
  const unversioned = listed.filter((f) => !/\?v=\d+$/.test(f) && !/^(index|crankmagic|graph)\.html$/.test(f));
  assert.deepEqual(unversioned, [],
    "these precached files carry no ?v=, so the cache would keep an old copy forever:\n  " + unversioned.join("\n  "));
});

console.log(`service-worker: ${checks} checks passed — shell ${first.caches.get(shellName).size} files, data ${first.caches.get(dataName).size} files, each keyed on its own list.`);
