// "It is this card. Here is the link."
//
// The fix-the-names screen offers five guesses and a way to give up, and sometimes the
// right answer is none of the six -- the reader has the card open in another tab. This
// covers turning that tab into an answer: what a link is worth, in what order, and what
// happens when it is worth nothing at all.
//
// The last case is the one that matters. A link no rung can place still becomes a card,
// because refusing it is the same dead end the fix screen was built to remove.
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";

const require = createRequire(import.meta.url);
const Link = require("../card-link.js");

let checks = 0;
const check = (label, fn) => { fn(); checks += 1; console.log("  ok  " + label); };
const acheck = async (label, fn) => { await fn(); checks += 1; console.log("  ok  " + label); };

/* ------------------------------------------------------- reading a link, offline */

check("a Scryfall card page names a printing outright", () => {
  const link = Link.identify("https://scryfall.com/card/blb/238/sheltered-by-ghosts");
  assert.equal(link.kind, "scryfall-card");
  assert.equal(link.set, "blb");
  assert.equal(link.number, "238");
  assert.equal(link.name, "sheltered by ghosts");
  assert.equal(link.site, "Scryfall");
});

check("a link pasted without its scheme is still a link", () => {
  const link = Link.identify("scryfall.com/card/c21/242/sol-ring");
  assert.equal(link.kind, "scryfall-card");
  assert.equal(link.set, "c21");
  assert.equal(link.number, "242");
});

check("a search link says the name in the open -- unless it is a query", () => {
  assert.equal(Link.identify("https://scryfall.com/search?q=Sol+Ring").name, "Sol Ring");
  assert.equal(Link.identify("https://scryfall.com/search?q=t%3Acreature+c%3Arw").name, "",
    "a Scryfall query is not a card name and must not be treated as one");
});

check("a TCGplayer product link gives an id and a slug", () => {
  const link = Link.identify("https://www.tcgplayer.com/product/59989/magic-m13-fervor?page=1");
  assert.equal(link.kind, "tcgplayer");
  assert.equal(link.productId, 59989);
  assert.equal(link.name, "magic m13 fervor");
  assert.equal(link.site, "TCGplayer");
});

check("an affiliate wrapper is unwrapped to the link it is hiding", () => {
  // The app builds its own buy links this way, so a reader copying one back in must land
  // on the card rather than on the tracking host.
  const link = Link.identify(
    "https://partner.tcgplayer.com/c/4931599/1830156/21018?subId1=api&u=" +
    encodeURIComponent("https://www.tcgplayer.com/product/59989/magic-m13-fervor"));
  assert.equal(link.kind, "tcgplayer");
  assert.equal(link.productId, 59989);
  assert.equal(link.wrapped, true);
});

check("a store's own slug is read the same way as anyone else's", () => {
  assert.equal(Link.identify("https://edhrec.com/cards/sol-ring").name, "sol ring");
  assert.equal(Link.identify("https://www.cardkingdom.com/mtg/commander-2021/sol-ring").name, "sol ring");
  assert.equal(Link.identify("https://www.cardmarket.com/en/Magic/Products/Singles/Commander-2021/Sol-Ring").name,
    "Sol Ring");
  assert.equal(Link.identify("https://edhrec.com/cards/sol-ring").site, "EDHREC");
});

check("a picture is a picture, and a slug that is only digits is nothing", () => {
  const image = Link.identify("https://example.com/cards/sheltered-by-ghosts.jpg");
  assert.equal(image.kind, "image");
  assert.equal(image.image, "https://example.com/cards/sheltered-by-ghosts.jpg");
  assert.equal(image.name, "sheltered by ghosts");
  assert.equal(Link.identify("https://www.coolstuffinc.com/p/284471").name, "",
    "a numeric slug names nothing, and guessing from it would be worse than admitting that");
});

check("what is not a link is refused", () => {
  assert.equal(Link.identify(""), null);
  assert.equal(Link.identify("Sheltered by Ghosts"), null, "a card name is not a link");
  assert.equal(Link.identify("javascript:alert(1)"), null, "only http and https");
  assert.equal(Link.identify("ftp://example.com/card"), null);
});

/* --------------------------------------------------------------- the ladder */

function stubClient(known = {}) {
  const calls = [];
  return {
    calls,
    async bySetNumber(set, number) {
      calls.push(["bySetNumber", set + "/" + number]);
      return known.printings?.[set + "/" + number] || null;
    },
    async named(name, options) {
      calls.push(["named", name + (options?.exact ? " (exact)" : "")]);
      const hit = known.names?.[String(name).toLowerCase()];
      if (!hit) return null;
      if (options?.exact && !known.exact?.includes(String(name).toLowerCase())) return null;
      return hit;
    },
    async byTcgplayerId(id) {
      calls.push(["byTcgplayerId", id]);
      return known.products?.[id] || null;
    }
  };
}

const CARD = (name) => ({name, typeLine: "Artifact", manual: undefined});

await acheck("a Scryfall printing is taken exactly, and costs one request", async () => {
  const client = stubClient({printings: {"c21/242": CARD("Sol Ring")}});
  const out = await Link.resolveLink("https://scryfall.com/card/c21/242/sol-ring", client, {});
  assert.equal(out.card.name, "Sol Ring");
  assert.equal(out.manual, null);
  assert.deepEqual(client.calls, [["bySetNumber", "c21/242"]],
    "an exact printing needs no name lookup at all");
});

await acheck("a name stated in the link is tried exactly before anything is guessed", async () => {
  const client = stubClient({names: {"sol ring": CARD("Sol Ring")}, exact: ["sol ring"]});
  const out = await Link.resolveLink("https://scryfall.com/search?q=Sol+Ring", client, {});
  assert.equal(out.card.name, "Sol Ring");
  assert.deepEqual(client.calls, [["named", "Sol Ring (exact)"]]);
});

await acheck("a TCGplayer product id beats its own slug", async () => {
  const client = stubClient({products: {59989: CARD("Fervor")}});
  const out = await Link.resolveLink(
    "https://www.tcgplayer.com/product/59989/magic-m13-fervor", client, {});
  assert.equal(out.card.name, "Fervor");
  assert.equal(out.via, "the TCGplayer product");
  assert.ok(client.calls.some((c) => c[0] === "byTcgplayerId"));
});

await acheck("a slug is guessed at from the longest reading down", async () => {
  // "magic m13 fervor" is not a card; "fervor" is. The trims run longest-first, because a
  // wrong trim that happens to be a real card is the worst answer available.
  const client = stubClient({names: {fervor: CARD("Fervor")}});
  const out = await Link.resolveLink(
    "https://www.tcgplayer.com/product/59989/magic-m13-fervor", client, {});
  assert.equal(out.card.name, "Fervor");
  assert.equal(out.via, "the name in the address");
  const guesses = client.calls.filter((c) => c[0] === "named").map((c) => c[1]);
  assert.deepEqual(guesses, [
    "magic m13 fervor (exact)", "magic m13 fervor", "m13 fervor", "fervor"
  ]);
});

/* ------------------------------------------------- when no rung can place it */

await acheck("a card Scryfall does not have still becomes a card", async () => {
  const out = await Link.resolveLink(
    "https://example.com/spoilers/pastel-ooze.jpg", stubClient(), {name: "Pastel Ooze"});
  assert.equal(out.card, null);
  assert.equal(out.manual.manual, true);
  assert.equal(out.manual.name, "Pastel Ooze", "it is called what the reader was asked about");
  assert.equal(out.manual.image, "https://example.com/spoilers/pastel-ooze.jpg");
  assert.equal(out.manual.source, "https://example.com/spoilers/pastel-ooze.jpg");
  assert.equal(out.manual.sourceSite, "example.com");
});

check("a manual card carries every field the deck record reads", () => {
  const card = Link.manualCard(Link.identify("https://example.com/x/pastel-ooze.png"),
    {name: "Pastel Ooze", now: () => "2026-09-07T00:00:00.000Z"});
  for (const field of ["name", "typeLine", "manaCost", "oracleText", "keywords",
    "colorIdentity", "cmc", "price", "gameChanger", "image", "manual", "source", "addedAt"]) {
    assert.ok(field in card, `deck-store's toRecord reads ${field}`);
  }
  assert.equal(card.typeLine, "", "no type line, because inventing one would be a lie");
  assert.equal(card.price, 0);
  assert.equal(card.addedAt, "2026-09-07T00:00:00.000Z");
});

await acheck("a rung that throws costs its answer, not the whole ladder", async () => {
  const client = {
    async bySetNumber() { throw new Error("offline"); },
    async named() { throw new Error("offline"); },
    async byTcgplayerId() { throw new Error("offline"); }
  };
  const out = await Link.resolveLink("https://scryfall.com/card/blb/238/x", client, {name: "X Card"});
  assert.equal(out.card, null);
  assert.equal(out.manual.name, "X Card", "offline still leaves the reader with a card");
});

await acheck("a caller that will not take a manual card is told so plainly", async () => {
  const out = await Link.resolveLink("https://example.com/nothing-here",
    stubClient(), {allowManual: false});
  assert.equal(out.card, null);
  assert.equal(out.manual, null);
  assert.match(out.error, /does not have a card/);
});

/* --------------------------------------------------------------- it is wired in */

const page = readFileSync(new URL("../legacy-decks.html", import.meta.url), "utf8");
const panel = readFileSync(new URL("../import-panel.js", import.meta.url), "utf8");
const viewer = readFileSync(new URL("../viewer.js", import.meta.url), "utf8");
const client = readFileSync(new URL("../scryfall-client.js", import.meta.url), "utf8");

check("the page loads it, and the import will not open without it", () => {
  assert.match(page, /src="card-link\.js/);
  assert.match(page, /src="manual-cards\.js/);
  assert.match(viewer, /"MtgCardLink"/);
  assert.match(viewer, /"MtgManualCards"/);
});

check("the fix screen offers the link box and hands the answer back", () => {
  assert.match(panel, /data-fix-link=/);
  assert.match(panel, /async function useLink/);
  assert.match(panel, /opts\.resolveLink\(raw, \{name: asked\}\)/);
  assert.match(panel, /if \(card\.manual && opts\.onManualCard\) opts\.onManualCard\(card\)/);
});

check("the Scryfall client can fetch one exact printing", () => {
  assert.match(client, /async function bySetNumber/);
  assert.match(client, /\/cards\/\$\{encodeURIComponent\(code\)\}\/\$\{encodeURIComponent\(collector\)\}/);
  assert.match(client, /\n      bySetNumber,/);
});

console.log(`\ncard-link: ${checks} checks passed.`);
