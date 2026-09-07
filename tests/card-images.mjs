// The picture of a card the app does not ship.
//
// data/card-facts.json carries images for 668 cards. A deck somebody pastes in is a hundred
// the file has never heard of, so opening one of them said "is not in the card data" over a
// blank rectangle -- a real card, whose name the app knows, that Scryfall has had a picture
// of the whole time. What follows pins the ladder that replaced it, and the two things that
// make a cache safe: it is bounded, and a storage that refuses to write costs a cache hit
// rather than a picture.
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";

const require = createRequire(import.meta.url);
const Images = require("../card-images.js");
const User = require("../user-state.js");

let checks = 0;
const check = (label, fn) => { fn(); checks += 1; console.log("  ok  " + label); };
const acheck = async (label, fn) => { await fn(); checks += 1; console.log("  ok  " + label); };

function memory(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    get length() { return map.size; },
    key: (i) => Array.from(map.keys())[i] ?? null
  };
}

const SHIPPED = {"Sol Ring": {small: "s/sol.jpg", normal: "n/sol.jpg", typeLine: "Artifact"}};
const stub = (found) => ({
  calls: [],
  async named(name, options) {
    this.calls.push(name + (options?.exact ? " (exact)" : ""));
    return found && found[name] ? found[name] : null;
  }
});

check("the cache is a key Clear session knows about", () => {
  assert.equal(Images.KEY, "mtg-card-images.v1");
  assert.ok(User.keys().includes(Images.KEY),
    "a cache the clear cannot reach is a cache that outlives the session it belongs to");
});

await acheck("a shipped card costs nothing: no storage, no request", async () => {
  const client = stub();
  const store = memory();
  const out = await Images.resolve("Sol Ring", {facts: SHIPPED, storage: store, client});
  assert.equal(out.normal, "n/sol.jpg");
  assert.equal(out.source, "shipped");
  assert.deepEqual(client.calls, [], "the shipped file was in memory and was asked anyway");
  assert.equal(Images.size(store), 0, "a card that needs no cache was cached");
});

await acheck("a card the deck record already carries needs no request either", async () => {
  const client = stub();
  const store = memory();
  const out = await Images.resolve("Splinter, Radical Rat", {
    facts: SHIPPED, storage: store, client,
    local: (name) => (name === "Splinter, Radical Rat"
      ? {name, image: "s/rat.jpg", imageLarge: "n/rat.jpg"} : null)
  });
  assert.equal(out.normal, "n/rat.jpg");
  assert.equal(out.source, "your deck");
  assert.deepEqual(client.calls, []);
  assert.equal(Images.size(store), 1, "and it is remembered, so the next open is free");
});

await acheck("otherwise Scryfall, exactly once, and the answer is kept", async () => {
  const client = stub({"Kaito, Bane of Nightmares": {image: "s/k.jpg", imageLarge: "n/k.jpg"}});
  const store = memory();
  const first = await Images.resolve("Kaito, Bane of Nightmares", {facts: SHIPPED, storage: store, client});
  assert.equal(first.source, "scryfall");
  assert.equal(first.normal, "n/k.jpg");
  assert.deepEqual(client.calls, ["Kaito, Bane of Nightmares (exact)"]);

  const again = await Images.resolve("Kaito, Bane of Nightmares", {facts: SHIPPED, storage: store, client});
  assert.equal(again.cached, true);
  assert.equal(again.normal, "n/k.jpg");
  assert.equal(client.calls.length, 1, "a second open asked Scryfall again");
});

await acheck("an exact miss gets one fuzzy retry, because exporters spell things", async () => {
  const client = stub({"Sol Ring Prime": {imageLarge: "n/p.jpg"}});
  /* exact returns nothing for this stub unless the name matches; the fuzzy call is the
     second one, with no exact flag. */
  const store = memory();
  const out = await Images.resolve("Sol Ring Prime", {facts: {}, storage: store, client});
  assert.equal(out.normal, "n/p.jpg");
  assert.deepEqual(client.calls, ["Sol Ring Prime (exact)"], "found on the first ask");

  const missing = stub();
  const none = await Images.resolve("Zzzqqq Blorp", {facts: {}, storage: memory(), client: missing});
  assert.equal(none, null);
  assert.deepEqual(missing.calls, ["Zzzqqq Blorp (exact)", "Zzzqqq Blorp"],
    "a miss must try fuzzy once before giving up");
});

await acheck("no client, no invention", async () => {
  const out = await Images.resolve("Anything", {facts: {}, storage: memory()});
  assert.equal(out, null);
});

await acheck("a Scryfall that throws costs the picture, not the page", async () => {
  const angry = {async named() { throw new Error("429"); }};
  const out = await Images.resolve("Anything", {facts: {}, storage: memory(), client: angry});
  assert.equal(out, null);
});

check("the cache is bounded, and what you look at survives", () => {
  const store = memory();
  let clock = 1000;
  for (let i = 0; i < Images.CAP + 50; i += 1) {
    Images.remember(store, "Card " + i, {normal: "n/" + i + ".jpg"}, "scryfall", clock += 1);
  }
  assert.equal(Images.size(store), Images.CAP, `the cache grew to ${Images.size(store)}`);
  // The oldest went; the newest stayed.
  assert.equal(Images.cached(store, "Card 0"), null);
  assert.ok(Images.cached(store, "Card " + (Images.CAP + 49)));
});

check("touching an entry keeps it", () => {
  const store = memory();
  Images.remember(store, "Old", {normal: "n/old.jpg"}, "scryfall", 1);
  Images.remember(store, "New", {normal: "n/new.jpg"}, "scryfall", 2);
  Images.cached(store, "Old", 3);                       // looked at, so newer than New
  const map = Images.read(store);
  assert.ok(map[Images.fold("Old")].at > map[Images.fold("New")].at);
});

check("storage that will not write costs a cache hit, never a picture", () => {
  const blocked = {
    getItem: () => { throw new Error("blocked"); },
    setItem: () => { throw new Error("blocked"); },
    removeItem: () => {}
  };
  assert.deepEqual(Images.read(blocked), {});
  assert.doesNotThrow(() => Images.remember(blocked, "X", {normal: "n/x.jpg"}));
  assert.equal(Images.cached(blocked, "X"), null);
});

check("a name is matched however it is punctuated", () => {
  const store = memory();
  Images.remember(store, "Teferi's Protection", {normal: "n/t.jpg"});
  assert.ok(Images.cached(store, "teferis protection"), "punctuation must not make a second entry");
});

check("the page loads it and the card sheet uses it", () => {
  const page = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const viewer = readFileSync(new URL("../viewer.js", import.meta.url), "utf8");
  assert.match(page, /src="card-images\.js/);
  assert.match(viewer, /function cardImage/);
  assert.match(viewer, /MtgCardImages/);
  assert.match(viewer, /forget\(window\.localStorage, name\)/,
    "a cached URL that stopped resolving must be dropped, not redrawn forever");
});

console.log(`\ncard-images: ${checks} checks passed.`);
