/* THE LOBBY (docs/crankmagic-game-plan.md §5.1, PR G0). Where a game of Commander is set up:
 * your deck, one to three opponents, and one set of rules every seat at the table obeys.
 *
 * WHY THIS IS A MODULE AND NOT A SCREEN. Everything the lobby decides is arithmetic over card
 * lists — is this a hundred, is it inside its commander's colours, how many Game Changers does
 * it carry against the bracket's cap, which seat goes first, and is the pod fair. None of that
 * needs a browser, and all of it needs to be right, so it lives here where a Node suite can hold
 * it to the committed decks. The screen in crankmagic-game.js draws what this returns and spells
 * nothing of its own.
 *
 * THE BRACKETS ARE THE PUBLISHED ONES. Commander Brackets 1-5, and the only number that varies
 * between them for the lobby's purposes is how many Game Changers a deck may carry: none at 1-2,
 * three at 3, unlimited at 4-5. The other bracket rules — mass land denial, chained extra turns,
 * two-card infinite combos — are judgements about how a deck plays rather than counts, so the
 * lobby names them for the reader and does not pretend to enforce them. draft-builder.js already
 * reads the same caps (`ceiling>=4?Infinity:ceiling===3?3:0`), so a generated seat and a seated
 * one are judged by one rule.
 *
 * WHAT A SEAT IS. One shape, whatever it came from — a deck in the library, an Archidekt link, a
 * pasted export, or a list the draft builder made:
 *
 *   {id, name, kind, deckId, url, commanders:[…], cards:[{name, quantity, …}], score, scoreWhy}
 *
 * so validate(), trim() and the pod read never ask where a list came from. That is the whole
 * reason the four sources in the plan cost one implementation rather than four.
 *
 * NOTHING HERE FETCHES, WRITES OR RANDOMISES WITHOUT A SEED. The shuffle is seeded so a replay
 * reproduces its table exactly, which is what "fixed for a replay" in the plan means.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CrankLobby = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const DECK_SIZE = 100;
  const MIN_SEATS = 2;
  const MAX_SEATS = 4;
  /* Within this many points of the rest of the pod is a fair table. The simulator's own margin of
     error on a rated deck is about a fifth of a point, so four points is a real difference rather
     than noise, and it is about the gap between a precon and an upgraded precon. */
  const FAIR_BAND = 4;

  const BRACKETS = [
    {n: 1, name: "Exhibition", gameChangers: 0, says: "Ultra-casual. No Game Changers, no mass land denial, no chained extra turns, no two-card infinite combos. Winning is not the point."},
    {n: 2, name: "Core", gameChangers: 0, says: "Precon level. No Game Changers, and the same three restrictions. Games run long and end on a big turn."},
    {n: 3, name: "Upgraded", gameChangers: 3, says: "Up to three Game Changers. No mass land denial, no chained extra turns, and a two-card combo only as a late-game finish."},
    {n: 4, name: "Optimized", gameChangers: Infinity, says: "No restrictions. The strongest build of whatever the deck wants to do."},
    {n: 5, name: "cEDH", gameChangers: Infinity, says: "No restrictions, and every seat is playing to win as fast as the format allows."},
  ];
  const bracketOf = (n) => BRACKETS.find((b) => b.n === Number(n)) || BRACKETS[2];
  const capOf = (bracket, override) => (override === undefined || override === null || override === "" ? bracket.gameChangers : Math.max(0, Number(override) || 0));

  const BASIC = /^(Plains|Island|Swamp|Mountain|Forest|Wastes|Snow-Covered (Plains|Island|Swamp|Mountain|Forest))$/;
  const COLOR_NAME = {W: "white", U: "blue", B: "black", R: "red", G: "green", C: "colorless"};

  const text = (v, max) => String(v === null || v === undefined ? "" : v).slice(0, max || 200).trim();
  const qty = (v) => { const n = Math.floor(Number(v)); return Number.isFinite(n) && n > 0 ? n : 1; };
  /* Number(null) is 0 and Number("") is 0, so a plain Number.isFinite test turns "this card has
     no rank" into "this card is rank zero" — which reads as the most-played card in Commander. */
  const num = (v) => { if (v === null || v === undefined || v === "") return null; const n = Number(v); return Number.isFinite(n) ? n : null; };
  const uid = (prefix) => prefix + Math.random().toString(36).slice(2, 9);
  const list = (names, limit = 4) => {
    const shown = names.slice(0, limit).join(", ");
    return names.length > limit ? `${shown} and ${names.length - limit} more` : shown;
  };

  /* ------------------------------------------------------------------ a seat, from anywhere */
  /* `cards` is the 99: the commanders are named separately, because the colour-identity check and
     the size check both need to know which is which. A caller that hands the whole hundred in
     `cards` with the commanders among them is handled — they are lifted out by name. */
  function seat(raw) {
    const r = raw || {};
    const commanders = (r.commanders || []).map((c) => ({
      name: text(c.name, 160), cardId: text(c.cardId, 120),
      colorIdentity: (c.colorIdentity || []).map((x) => text(x, 1).toUpperCase()).filter(Boolean),
    })).filter((c) => c.name);
    const named = new Set(commanders.map((c) => c.name.toLowerCase()));
    const cards = (r.cards || []).map((c) => ({
      name: text(c.name, 160), quantity: qty(c.quantity), cardId: text(c.cardId, 120),
      gameChanger: !!c.gameChanger, basic: c.basic === undefined ? BASIC.test(text(c.name, 160)) : !!c.basic,
      colorIdentity: (c.colorIdentity || []).map((x) => text(x, 1).toUpperCase()).filter(Boolean),
      typeLine: text(c.typeLine, 200), edhrecRank: num(c.edhrecRank), price: num(c.price), delta: num(c.delta),
    })).filter((c) => c.name && !named.has(c.name.toLowerCase()));
    const score = num(r.score);
    return {
      id: text(r.id, 120) || uid("seat:"), name: text(r.name, 160) || (commanders[0] ? commanders[0].name : "Unnamed deck"),
      kind: ["library", "link", "paste", "generated"].includes(r.kind) ? r.kind : "library",
      deckId: text(r.deckId, 120), url: text(r.url, 500), you: !!r.you,
      commanders, cards, score, scoreWhy: text(r.scoreWhy, 300),
    };
  }

  const size = (s) => s.commanders.length + s.cards.reduce((n, c) => n + c.quantity, 0);
  const identity = (s) => { const out = new Set(); for (const c of s.commanders) for (const x of c.colorIdentity) out.add(x); return out; };
  const gameChangers = (s) => s.cards.filter((c) => c.gameChanger);
  const gameChangerCount = (s) => gameChangers(s).reduce((n, c) => n + c.quantity, 0);

  /* ------------------------------------------------------------------ is this deck seatable */
  /* Every issue names the cards it is about, so the lobby can say "this deck carries 5 Game
     Changers; bracket 3 allows 3" AND list which five. A colour-identity check is skipped where
     the list carries no identities at all — an unresolved paste knows names and nothing else, and
     a check that cannot see is worse than no check because it reads as a clean bill. */
  function validate(raw, options) {
    const s = seat(raw), bracket = bracketOf((options || {}).bracket);
    const cap = capOf(bracket, (options || {}).gameChangers);
    const issues = [];
    const add = (code, severity, why, cards) => issues.push({code, severity, why, cards: cards || []});

    if (!s.commanders.length) add("commander", "blocking", "No commander named. Every Commander deck is one card at the head of a hundred.");
    const total = size(s);
    if (total !== DECK_SIZE) add("size", "blocking", `${total} cards, not ${DECK_SIZE}${total < DECK_SIZE ? ` — ${DECK_SIZE - total} short` : ` — ${total - DECK_SIZE} over`}.`);

    const colors = identity(s), known = s.cards.filter((c) => c.colorIdentity.length || c.basic);
    if (s.commanders.length && known.length) {
      const outside = s.cards.filter((c) => c.colorIdentity.some((x) => x !== "C" && !colors.has(x)));
      if (outside.length) add("identity", "blocking",
        `${outside.length} card${outside.length === 1 ? " is" : "s are"} outside ${s.commanders.map((c) => c.name).join(" and ")}'s colour identity (${[...colors].map((x) => COLOR_NAME[x] || x).join(", ") || "colorless"}): ${list(outside.map((c) => c.name))}.`,
        outside.map((c) => c.name));
    }

    const dupes = s.cards.filter((c) => !c.basic && c.quantity > 1);
    if (dupes.length) add("duplicates", "blocking",
      `${list(dupes.map((c) => `${c.quantity}× ${c.name}`))} — a Commander deck carries one of each card that is not a basic land.`,
      dupes.map((c) => c.name));

    const gc = gameChangerCount(s);
    if (gc > cap) add("gameChangers", "blocking",
      `This deck carries ${gc} Game Changer${gc === 1 ? "" : "s"}; bracket ${bracket.n} (${bracket.name}) allows ${cap === Infinity ? "any number" : cap}. ${list(gameChangers(s).map((c) => c.name), 6)}.`,
      gameChangers(s).map((c) => c.name));

    return {
      ok: !issues.some((i) => i.severity === "blocking"), issues, size: total, gameChangers: gc,
      cap, bracket: bracket.n, colors: [...colors], identityChecked: !!(s.commanders.length && known.length),
    };
  }

  /* ------------------------------------------------------------------ trim to the bracket */
  /* THE EXCESS GOES, AND A BASIC TAKES THE SEAT. Dropping a card out of a hundred leaves
     ninety-nine, which is not a legal deck — so the cut is a swap, and the replacement is a basic
     land in a colour the deck already wants most. That is honest about what it is: a basic keeps
     the list legal and playable, and it is plainly worse than what it replaced, which is the
     reader's cue to put something real there before a game that matters.
     The order is the measured one where a measurement exists (a library deck's upgrade options
     carry the delta the sweep measured), then the least-played first by EDHREC rank, then by name
     so the same deck always trims the same way. `rule` says which of the three decided. */
  function trimRank(cards) {
    const measured = cards.some((c) => c.delta !== null), ranked = cards.some((c) => c.edhrecRank !== null);
    const rule = measured ? "measured" : ranked ? "played" : "name";
    const sorted = cards.slice().sort((a, b) =>
      (measured ? (a.delta === null ? Infinity : a.delta) - (b.delta === null ? Infinity : b.delta) : 0)
      || (ranked ? (b.edhrecRank === null ? -1 : b.edhrecRank) - (a.edhrecRank === null ? -1 : a.edhrecRank) : 0)
      || a.name.localeCompare(b.name));
    return {rule, sorted};
  }
  const RULE_SAYS = {
    measured: "the ones the sweep measured as adding least to this deck went first",
    played: "the least played went first, by how often Commander decks run them",
    name: "they went alphabetically, because nothing here carries a measurement or a rank to order by",
  };
  const BASIC_FOR = {W: "Plains", U: "Island", B: "Swamp", R: "Mountain", G: "Forest", C: "Wastes"};

  function trim(raw, options) {
    const s = seat(raw), bracket = bracketOf((options || {}).bracket);
    const cap = capOf(bracket, (options || {}).gameChangers);
    const gc = gameChangers(s), have = gameChangerCount(s);
    if (!(have > cap)) return {seat: s, dropped: [], added: [], rule: "", says: "Nothing to trim — this deck is already inside the bracket."};
    const {rule, sorted} = trimRank(gc);
    const drop = [], want = have - cap;
    let taken = 0;
    for (const c of sorted) { if (taken >= want) break; drop.push(c); taken += c.quantity; }
    const dropNames = new Set(drop.map((c) => c.name));
    /* The colour the deck leans on hardest, by how many of its cards carry that colour. */
    const colors = [...identity(s)].filter((x) => x !== "C");
    const weight = new Map(colors.map((x) => [x, s.cards.filter((c) => c.colorIdentity.includes(x)).reduce((n, c) => n + c.quantity, 0)]));
    const heaviest = colors.slice().sort((a, b) => (weight.get(b) || 0) - (weight.get(a) || 0) || a.localeCompare(b))[0] || "C";
    const basic = BASIC_FOR[heaviest] || "Wastes";
    const cards = s.cards.filter((c) => !dropNames.has(c.name));
    const already = cards.find((c) => c.name === basic);
    if (already) already.quantity += taken;
    else cards.push({name: basic, quantity: taken, cardId: "", gameChanger: false, basic: true, colorIdentity: heaviest === "C" ? [] : [heaviest], typeLine: "Basic Land", edhrecRank: null, price: null, delta: null});
    return {
      seat: Object.assign({}, s, {cards}),
      dropped: drop.map((c) => ({name: c.name, quantity: c.quantity})),
      added: [{name: basic, quantity: taken}], rule,
      says: `${taken} Game Changer${taken === 1 ? "" : "s"} out, ${taken} ${basic}${taken === 1 ? "" : "s"} in: ${RULE_SAYS[rule]}. The hundred still stands, and a basic is plainly worse than what it replaced — put something real there before a game that matters.`,
    };
  }

  /* ------------------------------------------------------------------ the read before you sit */
  /* One sentence, from the measured scores. It compares YOUR deck to the REST of the pod rather
     than to the pod including yourself — including yourself pulls the average toward you and a
     table of one strong deck and three weak ones reads as nearly fair, which it is not. */
  function pod(seats, options) {
    const all = (seats || []).map(seat);
    const you = all.find((s) => s.you) || all[0] || null;
    const rated = all.filter((s) => s.score !== null);
    const mean = (xs) => (xs.length ? Math.round((xs.reduce((n, x) => n + x, 0) / xs.length) * 10) / 10 : null);
    const average = mean(rated.map((s) => s.score));
    const others = all.filter((s) => s !== you && s.score !== null);
    const field = mean(others.map((s) => s.score));
    const unrated = all.length - rated.length;
    let read = "", gap = null;
    if (!you || you.score === null || field === null) {
      read = all.length < MIN_SEATS ? "Seat at least one opponent." : "No read yet — nothing here carries a measured score.";
    } else {
      gap = Math.round((you.score - field) * 10) / 10;
      read = Math.abs(gap) <= FAIR_BAND ? "A fair table."
        : gap > 0 ? `You are the deck to beat, by ${gap}.`
        : `You are the underdog, by ${Math.abs(gap)}.`;
    }
    const partial = unrated ? `${unrated} of the ${all.length} decks carr${unrated === 1 ? "ies" : "y"} no measured score, so this read is partial.` : "";
    const scores = rated.map((s) => s.score);
    return {
      seats: all.length, average, field, gap, read, partial, unrated,
      spread: scores.length > 1 ? Math.round((Math.max(...scores) - Math.min(...scores)) * 10) / 10 : null,
      rows: all.map((s) => ({id: s.id, name: s.name, you: s === you, score: s.score, kind: s.kind})),
    };
  }

  /* ------------------------------------------------------------------ seating and the first turn */
  /* Seeded, so "fixed for a replay" is a seed rather than a saved list: the same seed deals the
     same table forever, and the seed is short enough to write on the game log. */
  function hash(str) { let h = 2166136261; for (let i = 0; i < String(str).length; i += 1) { h ^= String(str).charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rng(seedValue) { let a = hash(seedValue) || 1; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function seating(seats, options) {
    const all = (seats || []).map(seat), o = options || {};
    if (!all.length) return {order: [], first: null, seed: ""};
    if (o.fixed) return {order: all.map((s) => s.id), first: all[0].id, seed: "", fixed: true};
    const seed = text(o.seed, 40) || String(Date.now());
    const next = rng(seed), order = all.slice();
    for (let i = order.length - 1; i > 0; i -= 1) { const j = Math.floor(next() * (i + 1)); const t = order[i]; order[i] = order[j]; order[j] = t; }
    return {order: order.map((s) => s.id), first: order[0].id, seed, fixed: false};
  }

  /* ------------------------------------------------------------------ the whole lobby at once */
  /* One call the screen can draw: every seat judged by one bracket, the pod's read, the seating,
     and whether the game can start. `ready` is the only thing that gates Play. */
  function table(config) {
    const c = config || {}, bracket = bracketOf(c.bracket);
    const cap = capOf(bracket, c.gameChangers);
    const seats = (c.seats || []).map(seat).slice(0, MAX_SEATS);
    const checks = seats.map((s) => Object.assign({seatId: s.id, name: s.name}, validate(s, {bracket: bracket.n, gameChangers: cap})));
    const enough = seats.length >= MIN_SEATS;
    return {
      bracket, cap, seats, checks, pod: pod(seats), seating: seating(seats, {seed: c.seed, fixed: c.fixedSeating}),
      ready: enough && checks.every((x) => x.ok),
      why: !enough ? `Seat ${MIN_SEATS - seats.length} more — a game is ${MIN_SEATS} to ${MAX_SEATS} players.`
        : checks.every((x) => x.ok) ? "" : `${checks.filter((x) => !x.ok).length} seat${checks.filter((x) => !x.ok).length === 1 ? "" : "s"} cannot sit yet.`,
    };
  }

  return {BRACKETS, bracketOf, DECK_SIZE, MIN_SEATS, MAX_SEATS, FAIR_BAND, BASIC, BASIC_FOR, COLOR_NAME,
    seat, size, identity, capOf, gameChangers, gameChangerCount, validate, trim, trimRank, pod, seating, rng, table};
});
