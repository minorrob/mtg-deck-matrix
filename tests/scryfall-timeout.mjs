/* A REQUEST THAT NEVER ANSWERS MUST STILL END.
 *
 * The Scryfall client had no timeout. `signal` was passed straight through from the caller
 * and every caller passed undefined, so a fetch that never settled left an await that never
 * returned — and the failure surfaced nowhere near the network.
 *
 * What it actually did: opening a deck calls catalog.details() for the commander, details()
 * awaits client.named(), and with that request hung the deck overview never reached the line
 * that writes its HTML. The reader was left looking at the PREVIOUS page — no deck, no
 * spinner, no error, nothing to retry — which is precisely what happens offline, in an app
 * that ships a service worker so it can be used offline. It was found by a browser journey
 * timing out on a button that was never going to appear.
 *
 * Every caller already handles a rejection gracefully: details() returns the card it had,
 * cheapest() returns the card it had. So the whole fix is that a stalled request rejects
 * instead of hanging, and these checks hold that line.
 */
import assert from "node:assert/strict";
import {createRequire} from "node:module";

const require = createRequire(import.meta.url);
const {createClient} = require("../scryfall-client.js");

let checks = 0;
const ok = (label, fn) => fn().then(() => {checks += 1; process.stdout.write(`  ok  ${label}\n`);});

/* A fetch that never settles, which is what a stalled connection looks like from here. */
const hang = () => new Promise(() => {});
const noCache = () => ({get: () => null, set: () => {}});

/* Node defines `navigator` as a getter-only property, so it cannot simply be assigned.
   Returns the undo. */
function fakeNavigator(value) {
  const prior = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "navigator", {value, configurable: true, writable: true});
  return () => {
    if (prior) Object.defineProperty(globalThis, "navigator", prior);
    else delete globalThis.navigator;
  };
}

await ok("a request that never answers rejects rather than hanging for ever", async () => {
  const client = createClient({fetchImpl: hang, timeoutMs: 120, delayMs: 0, cache: noCache()});
  const began = Date.now();
  await assert.rejects(() => client.named("Krenko, Mob Boss", {exact: true}),
    /did not answer within 120ms/,
    "a hung request has to become a rejection; anything else leaves the caller's await open");
  const took = Date.now() - began;
  assert.ok(took < 3000, `it took ${took}ms — the deadline is not bounding the retries`);
});

await ok("the deadline covers the whole call, not each attempt", async () => {
  /* MAX_ATTEMPTS is 4. A per-attempt timeout would make the worst case four times the number
     the caller was given, plus backoff — so the one number an operator can reason about
     would not be the one the app obeys. */
  let attempts = 0;
  const client = createClient({
    fetchImpl: () => {attempts += 1; return hang();},
    timeoutMs: 150, delayMs: 0, cache: noCache(),
  });
  const began = Date.now();
  await assert.rejects(() => client.named("Sol Ring", {exact: true}));
  const took = Date.now() - began;
  assert.ok(took < 150 * 3, `${took}ms for a 150ms deadline: the attempts are each getting a full one`);
  assert.equal(attempts, 1, `expected the deadline to stop after one hung attempt, saw ${attempts}`);
});

await ok("a caller that cancels still gets AbortError, not the timeout's message", async () => {
  /* The two aborts must not be confused. Cancelling a lookup — the picker does it on every
     keystroke — is the caller's business and propagates; the deadline is ours and becomes a
     plain failure the callers already swallow. Chaining the caller's signal rather than
     replacing it is what keeps cancellation working at all. */
  const controller = new AbortController();
  const client = createClient({fetchImpl: hang, timeoutMs: 60000, delayMs: 0, cache: noCache()});
  const pending = client.named("Lightning Bolt", {exact: true, signal: controller.signal});
  setTimeout(() => controller.abort(), 30);
  await assert.rejects(pending, (error) => {
    assert.equal(error.name, "AbortError", `a cancelled request reported ${error.name}`);
    return true;
  });
});

await ok("a request that answers in time is unaffected", async () => {
  const card = {object: "card", id: "x", name: "Sol Ring", type_line: "Artifact", mana_cost: "{1}"};
  const client = createClient({
    fetchImpl: async () => ({status: 200, ok: true, json: async () => card}),
    timeoutMs: 50, delayMs: 0, cache: noCache(),
  });
  const out = await client.named("Sol Ring", {exact: true});
  assert.equal(out.name, "Sol Ring", "the timeout must not disturb the path that works");
});

await ok("a retryable failure still retries, and still stops at the deadline", async () => {
  let calls = 0;
  const client = createClient({
    fetchImpl: async () => {calls += 1; return {status: 500, ok: false, json: async () => ({})};},
    timeoutMs: 400, delayMs: 0, cache: noCache(),
  });
  await assert.rejects(() => client.named("Mountain", {exact: true}));
  assert.ok(calls > 1, "a 500 should have been retried");
  assert.ok(calls <= 4, `${calls} calls: MAX_ATTEMPTS is not being honoured`);
});

await ok("offline is answered at once rather than waited out", async () => {
  /* The deadline stops a stall hanging the app; it does not make offline fast. When the
     browser says there is no network the request cannot succeed, so there is nothing to
     wait for -- and the deck page can render from what it already has, immediately. */
  let asked = 0;
  const restore = fakeNavigator({onLine: false});
  try {
    const client = createClient({
      fetchImpl: () => {asked += 1; return hang();},
      timeoutMs: 60000, delayMs: 0, cache: noCache(),
    });
    const began = Date.now();
    await assert.rejects(() => client.named("Sol Ring", {exact: true}), /Offline/);
    assert.ok(Date.now() - began < 500, "offline should not wait on a deadline it cannot beat");
    assert.equal(asked, 0, "a request was sent while the browser reported no network");
  } finally {restore();}
});

await ok("navigator.onLine true is not treated as proof of reachability", async () => {
  /* onLine true only means an interface exists. A captive portal or a dead host still has
     to fall to the deadline, so the short-circuit must be on false alone. */
  const restore = fakeNavigator({onLine: true});
  try {
    const client = createClient({fetchImpl: hang, timeoutMs: 120, delayMs: 0, cache: noCache()});
    await assert.rejects(() => client.named("Sol Ring", {exact: true}), /did not answer within/);
  } finally {restore();}
});

console.log(`scryfall-timeout: ${checks} checks passed — a stalled request rejects, ` +
  "cancellation still cancels, and the working path is untouched.");
