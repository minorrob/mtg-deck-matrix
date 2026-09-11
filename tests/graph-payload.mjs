// The packed graph unpacks to exactly what was packed, and a file that was never packed
// passes through untouched. The packing is what keeps the whole-format graph under
// GitHub's file limit (see graph-payload.js), so a round-trip that lost a field would
// lose it for every visitor.
import assert from "node:assert/strict";
import {createRequire} from "node:module";

const require = createRequire(import.meta.url);
const P = require("../graph-payload.js");
let checks = 0;
const ok = (name, fn) => { fn(); checks += 1; };

const image = "https://cards.scryfall.io/normal/front/4/1/4160bb5f-4b49-4535-94f5-776d7abd1d1a.jpg?1783936732";
const buy = "https://partner.tcgplayer.com/c/4931599/1830156/21018?subId1=api&u=https%3A%2F%2Fwww.tcgplayer.com%2Fproduct%2F126451%3Fpage%3D1";
const cards = [
  {id: "a", name: "Alpha", image, buy, roles: ["draw"]},
  {id: "b", name: "Beta", image: "https://example.com/not-scryfall.jpg", buy: "https://example.com/shop"},
  {id: "c", name: "Gamma"}
];
const played = [{from: "a", to: "b", inclusion: 0.2174, synergy: 0.0812, decks: 360}, {from: "a", to: "c", inclusion: 0.1, synergy: -0.02, decks: 12}];
const payload = {generatedAt: "2026-09-11T00:00:00Z", scope: "test", counts: {cards: 3, playedWith: 2}, cards, played};

ok("pack shrinks a templated link to its id and leaves an odd one alone", () => {
  const packed = P.pack(payload);
  assert.equal(packed.format, P.FORMAT);
  assert.equal(packed.cards[0].img, "4160bb5f-4b49-4535-94f5-776d7abd1d1a?1783936732");
  assert.equal(packed.cards[0].tcg, 126451);
  assert.ok(!("image" in packed.cards[0]) && !("buy" in packed.cards[0]));
  assert.equal(packed.cards[1].image, cards[1].image, "a URL off the template is kept whole");
  assert.equal(packed.cards[1].buy, cards[1].buy);
  assert.deepEqual(packed.played, [[0, 1, 0.2174, 0.0812, 360], [0, 2, 0.1, -0.02, 12]]);
});

ok("unpack restores every field byte for byte", () => {
  const back = P.unpack(JSON.parse(JSON.stringify(P.pack(payload))));
  assert.deepEqual(back.cards, cards);
  assert.deepEqual(back.played, played);
  assert.ok(!("format" in back));
  assert.equal(back.scope, "test");
});

ok("pack does not touch its input", () => {
  P.pack(payload);
  assert.equal(payload.cards[0].image, image);
  assert.equal(typeof payload.played[0], "object");
});

ok("an unpacked file passes through unpack unchanged", () => {
  const plain = JSON.parse(JSON.stringify(payload));
  assert.equal(P.unpack(plain), plain);
  assert.equal(plain.cards[0].image, image);
});

ok("an edge to a card outside the list is dropped rather than mis-indexed", () => {
  const packed = P.pack({...payload, played: [...played, {from: "a", to: "zzz", inclusion: 0.5, synergy: 0, decks: 1}]});
  assert.equal(packed.played.length, 2);
});

console.log(`graph-payload: ${checks} checks passed`);
