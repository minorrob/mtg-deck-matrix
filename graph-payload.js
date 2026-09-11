/* The shipped graph, packed and unpacked.
 *
 * WHY A FORMAT AT ALL. The whole format is 31,830 cards and ~650,000 EDHREC co-play
 * edges. Written the obvious way -- every edge an object naming both cards by their
 * 36-character oracle id -- the edges alone are 98 MB, most of it the same ids over and
 * over, and GitHub refuses a file past 100 MB. Written as [fromIndex, toIndex,
 * inclusion, synergy, decks] against the card list they are a fifth of that. Two card
 * fields are the same story: every card's art URL and TCGplayer link are one template
 * around one id, so the file carries the id and this rebuilds the link.
 *
 * WHO CALLS WHAT. graph/ingest/07-export-app.mjs calls pack() on the way out;
 * card-catalog.js calls unpack() on the way in, so nothing else in the app or the tests
 * ever sees the packed shape -- a card still has .image and .buy, an edge still has
 * .from and .to. A file that was never packed (format absent) passes through unpack()
 * untouched, so an old bake or a hand-written fixture still loads.
 */
(function (root) {
  'use strict';
  const FORMAT = 2;
  const IMG = /^https:\/\/cards\.scryfall\.io\/normal\/front\/([0-9a-f])\/([0-9a-f])\/\1\2([0-9a-f-]{34})\.jpg\?(\d+)$/;
  const TCG = /^https:\/\/partner\.tcgplayer\.com\/c\/4931599\/1830156\/21018\?subId1=api&u=https%3A%2F%2Fwww\.tcgplayer\.com%2Fproduct%2F(\d+)%3Fpage%3D1$/;
  const imageOf = (img) => { const [id, ts] = String(img).split('?'); return `https://cards.scryfall.io/normal/front/${id[0]}/${id[1]}/${id}.jpg?${ts}`; };
  const buyOf = (pid) => `https://partner.tcgplayer.com/c/4931599/1830156/21018?subId1=api&u=${encodeURIComponent(`https://www.tcgplayer.com/product/${pid}?page=1`)}`;

  function pack(payload) {
    const cards = payload.cards.map((c) => {
      const out = {...c};
      const m = IMG.exec(out.image || '');
      if (m) { out.img = `${m[1]}${m[2]}${m[3]}?${m[4]}`; delete out.image; }
      const b = TCG.exec(out.buy || '');
      if (b) { out.tcg = Number(b[1]); delete out.buy; }
      return out;
    });
    const at = new Map(cards.map((c, i) => [c.id, i]));
    const played = [];
    for (const e of payload.played || []) {
      const f = at.get(e.from), t = at.get(e.to);
      if (f === undefined || t === undefined) continue;
      played.push([f, t, Number(e.inclusion), Number(e.synergy), Number(e.decks)]);
    }
    return {...payload, format: FORMAT, cards, played};
  }

  function unpack(payload) {
    if (!payload || payload.format !== FORMAT) return payload;
    for (const c of payload.cards) {
      if (c.img && !c.image) { c.image = imageOf(c.img); delete c.img; }
      if (c.tcg && !c.buy) { c.buy = buyOf(c.tcg); delete c.tcg; }
    }
    const ids = payload.cards.map((c) => c.id);
    payload.played = (payload.played || []).map((e) => Array.isArray(e)
      ? {from: ids[e[0]], to: ids[e[1]], inclusion: e[2], synergy: e[3], decks: e[4]} : e);
    delete payload.format;
    return payload;
  }

  const api = {FORMAT, pack, unpack, imageOf, buyOf};
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.CrankGraphPayload = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
