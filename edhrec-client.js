/* What other people actually play with THIS commander.
 *
 * The deck generator has always ranked cards by `edhrecRank` -- Scryfall's copy
 * of EDHREC's global popularity number. That answers "is this card widely
 * played", which is a real question and the wrong one: Sol Ring outranks every
 * card in Magic and tells you nothing about whether it belongs in an Atraxa
 * deck rather than a Krenko one.
 *
 * EDHREC publishes the question that is actually being asked, per commander, at
 * json.edhrec.com. Two numbers per card, and they are not the same number:
 *
 *   inclusion   how many of this commander's decks run it, out of how many
 *               could. Sol Ring is ~90% for everybody. This is "a pilot of this
 *               deck usually owns and plays this".
 *
 *   synergy     that inclusion MINUS the rate across all decks in the same
 *               colors. Sol Ring is about zero: everyone plays it, so playing it
 *               says nothing about your commander. A card at +0.40 is played
 *               forty points more often here than in colour-matched decks
 *               generally, which is as close to "this card is here because of
 *               your commander" as a dataset can get.
 *
 * A deck wants both. Inclusion alone rebuilds the same pile of staples for every
 * commander; synergy alone builds a themed deck with no removal and no ramp,
 * because interaction is played everywhere and therefore synergises with
 * nothing. So both are carried and the generator's lenses weight them.
 *
 * WHAT HAPPENS WHEN THERE IS NO PAGE. A commander printed last week, or an
 * obscure one, has no EDHREC page -- the endpoint 404s. That is not an error
 * worth surfacing: it means this signal is unavailable for this deck, and the
 * generator has ranked cards without it since the day it was written. `load`
 * returns null, `scoreFor` returns null for every card, and the caller falls
 * back to exactly the behaviour it had before this file existed.
 */
(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.MtgEdhrec = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const BASE = "https://json.edhrec.com/pages/commanders/";

  /* The same slug EDHREC's own URLs use, and byte-for-byte the one
     graph/ingest/04-fetch-edhrec.mjs already computes -- the two must agree or a
     cache written by the ingest script would miss every lookup made here. */
  function slugify(name) {
    return String(name || "").toLowerCase()
      .replace(/'/g, "")
      .replace(/[,.]/g, "")
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  }

  /* A partner or background pairing lives at "a-b" on EDHREC, and a two-faced
     commander at the front face alone. Both are worth trying before giving up,
     because a 404 here silently costs the whole signal. */
  function slugCandidates(name) {
    const raw = String(name || "");
    const out = [slugify(raw)];
    const front = raw.split("//")[0].trim();
    if (front && front !== raw) out.push(slugify(front));
    return [...new Set(out.filter(Boolean))];
  }

  const key = (name) => String(name || "").trim().toLowerCase();

  /* EDHREC's own list headers, kept because they carry meaning the numbers do
     not: a card under "Game Changers" is one whether or not it is popular, and
     the Tier 3 cap is counted on exactly that set. */
  const NOTABLE = {
    "high synergy cards": "highSynergy",
    "top cards": "topCard",
    "game changers": "gameChanger",
    "new cards": "newCard"
  };

  /**
   * Fold one commander page into a lookup.
   *
   * The interesting part is nested three deep. Measured against a live response
   * for Atraxa, the thirteen lists partition the cards -- 292 rows, 292 distinct
   * names, no card in two lists -- so the dedup below is defensive rather than
   * load-bearing today. It keeps the first sighting's numbers and unions the
   * labels, so if EDHREC ever does put a card in two lists the two lists cannot
   * disagree about its inclusion rate.
   */
  function parse(payload) {
    const lists = (((payload || {}).container || {}).json_dict || {}).cardlists || [];
    const cards = new Map();
    let rows = 0;
    lists.forEach((list) => {
      const label = NOTABLE[String(list.header || "").trim().toLowerCase()] || null;
      (list.cardviews || []).forEach((view) => {
        if (!view || !view.name) return;
        rows += 1;
        const k = key(view.name);
        const seen = cards.get(k);
        if (seen) {
          if (label) seen.tags[label] = true;
          return;
        }
        const potential = Number(view.potential_decks || 0);
        cards.set(k, {
          name: view.name,
          // A share in 0..1, or null when EDHREC did not give the denominator --
          // null rather than 0, because "not reported" and "nobody plays it" are
          // different facts and only one of them should push a card down.
          inclusion: potential > 0 ? Number(view.num_decks || 0) / potential : null,
          // Already a difference of two shares, so it is signed and small.
          // Clamped only at the bottom: a negative synergy means the card is
          // played LESS here than in colour-matched decks generally, which is
          // information, but not information worth ranking below cards nobody
          // has an opinion about at all.
          synergy: typeof view.synergy === "number" ? view.synergy : null,
          decks: Number(view.num_decks || 0),
          tags: label ? {[label]: true} : {}
        });
      });
    });
    return {cards, rows, lists: lists.length};
  }

  /**
   * Fetch and fold one commander's page.
   *
   * Resolves to null on anything that is not a usable page -- a 404, a network
   * refusal, a body that does not parse. Never throws: this signal is an
   * improvement to the ranking, not a precondition for building a deck, and a
   * generator that fell over because EDHREC was down would be worse than one
   * that had never asked.
   */
  async function load(name, options) {
    const opts = options || {};
    const fetchImpl = opts.fetchImpl || (typeof fetch === "function" ? fetch : null);
    if (!fetchImpl || !name) return null;
    for (const slug of slugCandidates(name)) {
      try {
        const response = await fetchImpl(`${opts.base || BASE}${slug}.json`, {signal: opts.signal});
        if (!response || !response.ok) continue;
        const parsed = parse(await response.json());
        if (!parsed.cards.size) continue;
        return {slug, commander: name, ...parsed};
      } catch (err) {
        // A refused connection, a CORS failure, a body that is not JSON. Try the
        // next spelling, then give up quietly.
      }
    }
    return null;
  }

  /* One card's numbers, or null when this commander's page does not mention it.
     Null is the honest answer and the caller must treat it as "no opinion",
     never as zero -- a card EDHREC has never seen in this deck is not a card
     EDHREC has judged badly. */
  function scoreFor(index, cardName) {
    if (!index || !index.cards) return null;
    return index.cards.get(key(cardName)) || null;
  }

  /* The two numbers folded into one 0..1 ranking term.
   *
   * Inclusion is the base -- what a pilot of this deck usually plays -- and
   * synergy adds to it, so a card that is both common here AND uncommon
   * elsewhere ranks above a staple everyone runs. The synergy half is scaled by
   * 0.5 and clamped: EDHREC's synergy runs roughly -0.3 to +0.6, and left
   * unscaled it would swamp inclusion entirely and build a deck of nothing but
   * commander-specific cards with no removal in it. */
  function rank(entry) {
    if (!entry) return null;
    const inclusion = entry.inclusion == null ? null : Math.max(0, Math.min(1, entry.inclusion));
    const synergy = entry.synergy == null ? 0 : Math.max(-0.2, Math.min(0.6, entry.synergy));
    if (inclusion == null && entry.synergy == null) return null;
    return Math.max(0, Math.min(1, (inclusion == null ? 0.1 : inclusion) + synergy * 0.5));
  }

  return {BASE, slugify, slugCandidates, parse, load, scoreFor, rank, NOTABLE};
});
