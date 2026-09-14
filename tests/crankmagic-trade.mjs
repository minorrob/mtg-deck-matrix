/* THE TO TRADE LINK (backlog #200), held where it would quietly lie.
 *
 * The link is the whole publication, so the failures that matter are a list that leaves a
 * copy out or counts one twice, a link that does not come back as the list that went in,
 * and a contact that becomes a mailto it should not. The list is read off the committed
 * live library; the wire form goes through the same CompressionStream a browser has. */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
import path from "node:path";
import {ROOT} from "../schema/index.mjs";

const require = createRequire(import.meta.url);
const M = require(path.join(ROOT, "collection-model.js"));
const T = require(path.join(ROOT, "crankmagic-trade.js"));
let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks++; };

const live = JSON.parse(readFileSync(path.join(ROOT, "data/live-state.json"), "utf8"));
const state = M.migrate(live.payload.state || live.payload);

/* The list: offered copies plus the To Trade group, one row per card and printing. */
const offered = state.lots.filter((l) => l.source === "owned" && l.offer === "available");
const group = state.groups.find((g) => g.id === "group:to-trade");
ok(group, "the live library has the starter To Trade group");
const list = T.listFrom(state);
eq(list.count, offered.reduce((n, l) => n + l.quantity, 0) + state.lots.filter((l) => !(l.source === "owned" && l.offer === "available") && (l.groupIds || []).includes(group.id)).reduce((n, l) => n + l.quantity, 0) + group.entries.reduce((n, e) => n + e.quantity, 0), "every offered copy, every copy filed in the group and every planned entry is counted once");
ok(list.cards.every((r, i, a) => i === 0 || a[i - 1].name.localeCompare(r.name) <= 0), "by name");
ok(list.cards.every((r) => r.quantity >= 1 && r.name && Array.isArray(r.why)), "every row has a name, a count and a reason");

/* A synthetic library: an offered copy, a held deal (not on offer), a copy filed in the group, a planned entry, and the same card offered twice in one printing. */
const s = M.empty();
s.groups = M.starterGroups();
s.cards = {"card:a": {id: "card:a", name: "Sol Ring", price: 1.5}, "card:b": {id: "card:b", name: "Étrata, the Silencer", price: 0.4}, "card:c": {id: "card:c", name: "Krenko, Mob Boss"}};
s.lots = [
  {id: "l1", cardId: "card:a", quantity: 2, source: "owned", printing: {set: "cmm", collector: "410", finish: "foil"}, location: {kind: "bench"}, offer: "available", groupIds: []},
  {id: "l2", cardId: "card:a", quantity: 1, source: "owned", printing: {set: "cmm", collector: "410", finish: "foil"}, location: {kind: "bench"}, offer: "available", groupIds: []},
  {id: "l3", cardId: "card:b", quantity: 1, source: "owned", printing: {}, location: {kind: "bench"}, offer: "held", groupIds: []},
  {id: "l4", cardId: "card:c", quantity: 1, source: "owned", printing: {}, location: {kind: "bench"}, offer: "none", groupIds: ["group:to-trade"]},
  {id: "l5", cardId: "card:b", quantity: 4, source: "ordered", printing: {}, location: {kind: "bench"}, offer: "available", groupIds: []},
];
s.groups.find((g) => g.id === "group:to-trade").entries.push({id: "e1", cardId: "card:b", quantity: 1});
const synth = T.listFrom(s);
eq(synth.cards.map((r) => [r.name, r.quantity, r.why]), [["Étrata, the Silencer", 1, ["planned"]], ["Krenko, Mob Boss", 1, ["filed"]], ["Sol Ring", 3, ["offered"]]], "offered copies sum by printing, a held deal and an ordered copy are not on offer, the filed copy and the planned entry count; by name, accents folded");
eq(synth.count, 5); eq(synth.cards[2].set, "cmm"); eq(synth.cards[2].finish, "foil"); eq(synth.cards[2].price, 1.5, "the record's price rides along");

/* The wire form: what goes in comes out, unicode and all, with the publisher's facts; garbage is null. */
const packed = await T.pack(synth, {from: "Rob", contact: "rob@example.com", note: "Ask nicely — trades welcome", when: new Date("2026-09-14T12:00:00Z")});
ok(/^[A-Za-z0-9_-]+$/.test(packed), "base64url with no padding, so the hash needs no escaping");
const back = await T.unpack(packed);
eq(back.from, "Rob"); eq(back.contact, "rob@example.com"); eq(back.note, "Ask nicely — trades welcome"); eq(back.day, "2026-09-14");
eq(back.cards.map((r) => [r.name, r.quantity, r.price, r.set, r.collector, r.finish]), synth.cards.map((r) => [r.name, r.quantity, r.price, r.set, r.collector, r.finish]), "the cards round-trip");
eq(await T.unpack("not-a-list"), null); eq(await T.unpack(""), null); eq(await T.unpack(packed.slice(0, 10)), null, "a link cut short is refused, not half-read");
const url = T.link(packed); ok(url.startsWith(T.APP_URL + "#trade?d=") && url.endsWith(packed), "the link is the public address with the list in the hash");

/* Size: a hundred cards fit a URL comfortably; the QR is offered only when the link fits the one this app draws. */
const hundred = {cards: Array.from({length: 100}, (_, i) => ({name: `Card number ${i} of the trade binder`, quantity: 1 + (i % 3), price: i / 7, set: "abc", collector: String(100 + i), finish: ""}))};
const big = T.link(await T.pack(hundred, {from: "Rob", contact: "rob@example.com"}));
ok(big.length < 8000, `a hundred cards is ${big.length} characters, under a browser's comfort`);
ok(!T.qrFits(big), "and too long for the QR this app draws"); ok(T.qrFits(T.APP_URL + "#trade?d=abc"), "a short link fits");
eq(T.QR_MAX, 213);

/* The contact: an address becomes a mailto with the subject and body, a link stays a link, anything else is nothing. */
ok(T.contactHref("rob@example.com", "About your Sol Ring", "Hi").startsWith("mailto:rob@example.com?subject=About%20your%20Sol%20Ring&body=Hi"));
eq(T.contactHref("mailto:rob@example.com", "s", "b").startsWith("mailto:rob@example.com?"), true);
eq(T.contactHref("https://example.com/rob", "s", "b"), "https://example.com/rob");
eq(T.contactHref("call me", "s", "b"), ""); eq(T.contactHref("", "s", "b"), "");
ok(T.imageFor("Sol Ring", {image: "https://cards.scryfall.io/normal/x.jpg"}) === "https://cards.scryfall.io/normal/x.jpg" && T.imageFor("Sol Ring", null).includes("cards/named?exact=Sol%20Ring"), "a shipped picture, else Scryfall by name");

console.log(`crankmagic-trade: ${checks} checks passed — ${list.cards.length} cards on the live To Trade list, a hundred-card link is ${big.length} characters.`);
