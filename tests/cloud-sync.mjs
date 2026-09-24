/* WHAT A DEVICE DOES NEXT (cloud-sync.js) -- every case, because this is where a mistake loses a library.
 *
 * The two that must never happen: a device overwriting the cloud with an older library, and a device
 * overwriting its own unsaved changes with the cloud's. Both reduce to one rule -- when both sides moved, or
 * when two full libraries meet for the first time, the answer is "ask", never "save" or "pull" (Rob,
 * 2026-09-24: "Ask me which to keep").
 */
import assert from "node:assert/strict";
import {createRequire} from "node:module";
const require = createRequire(import.meta.url);
const S = require("../cloud-sync.js");

let checks = 0;
const eq = (a, b, message) => {assert.deepEqual(a, b, message); checks++;};
const act = (input) => S.decide(input).action;
const full = (revision) => ({revision, decks: [{id: "d1"}], lots: [{id: "l1"}]});
const empty = (revision = 0) => ({revision, decks: [], lots: []});
const head = (id) => ({id, device: "Chrome on Windows", savedAt: "2026-09-24T18:00:00Z"});
const me = "rob@example.com";

/* No library in the cloud yet. */
eq(act({head: null, sync: null, email: me, state: empty()}), "none", "nothing anywhere: nothing to do");
eq(S.decide({head: null, sync: null, email: me, state: full(5)}), {action: "save", parent: null, why: "the first save of this library to the cloud"}, "a library and an empty cloud: the first save, with no parent");

/* This device has never met this account. */
eq(act({head: head("h1"), sync: null, email: me, state: empty()}), "pull", "an empty device signing in takes the cloud's library");
eq(act({head: head("h1"), sync: null, email: me, state: full(3)}), "ask", "a full device meeting a full cloud for the first time is asked, never overwritten either way");
eq(act({head: head("h1"), sync: {email: "trey@example.com", headId: "h1", syncedRevision: 3}, email: me, state: full(3)}), "ask", "another person's sync record on this browser does not count as matched");

/* The everyday cases. */
const matched = {email: me, headId: "h1", syncedRevision: 7};
eq(act({head: head("h1"), sync: matched, email: me, state: full(7)}), "none", "neither moved: nothing");
eq(S.decide({head: head("h1"), sync: matched, email: me, state: full(8)}), {action: "save", parent: "h1", why: "changes made on this device"}, "only this device moved: save from the head it last matched");
eq(act({head: head("h2"), sync: matched, email: me, state: full(7)}), "pull", "only the cloud moved: bring it in");
eq(act({head: head("h2"), sync: matched, email: me, state: full(8)}), "ask", "both moved: ask");
eq(act({head: head("h2"), sync: matched, email: me, state: empty(8)}), "ask", "both moved even if this device emptied its library: ask, since emptying is a change too");

/* How a device names itself: the browser and the system, nothing more. */
eq(S.deviceLabel("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36"), "Chrome on Windows", "Chrome on Windows");
eq(S.deviceLabel("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"), "Safari on iOS", "Safari on an iPhone");
eq(S.deviceLabel("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36 Edg/141.0"), "Edge on Windows", "Edge, which also says Chrome");
eq(S.deviceLabel(""), "A browser", "and something, when it says nothing");

/* When, in words. */
const now = Date.parse("2026-09-24T20:00:00Z");
eq([S.ago("2026-09-24T19:59:50Z", now), S.ago("2026-09-24T19:58:00Z", now), S.ago("2026-09-24T18:00:00Z", now), S.ago("2026-09-21T20:00:00Z", now)],
  ["just now", "2 minutes ago", "2 hours ago", "3 days ago"], "saved-at times read as a person would say them");

/* The library travels gzipped and base64'd, and comes back byte for byte -- a 1 MB library included. */
const library = JSON.stringify({format: "crankmagic-backup", version: 1, payload: {state: {revision: 9, decks: Array.from({length: 4000}, (_, i) => ({id: `deck-${i}`, name: "Krenko, Mob Boss ✦"}))}}});
const packed = S.toBase64(await S.gzip(library));
eq(packed.slice(0, 4), "H4sI", "packed as gzip, which the cloud checks for");
eq(await S.gunzip(S.fromBase64(packed)), library, "and unpacked to the same text, including characters outside ASCII");
eq(packed.length < library.length / 5, true, `and compressed (${library.length.toLocaleString("en-US")} characters to ${packed.length.toLocaleString("en-US")})`);

console.log(`cloud-sync: ${checks} checks passed — every combination of who moved, and the library round-trips gzipped.`);
