/* THE LOBBY (docs/crankmagic-game-plan.md §5.1, PR G0). Where a game of Commander is set up:
 * your deck, one to three opponents, and one set of rules every seat at the table obeys.
 *
 * WHY THIS IS A MODULE AND NOT A SCREEN. Everything the lobby decides is arithmetic over card
 * lists — is this a hundred, is it inside its commander's colors, how many Game Changers does
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
  /* `cards` is the 99: the commanders are named separately, because the color-identity check and
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
     Changers; bracket 3 allows 3" AND list which five. A color-identity check is skipped where
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
        `${outside.length} card${outside.length === 1 ? " is" : "s are"} outside ${s.commanders.map((c) => c.name).join(" and ")}'s color identity (${[...colors].map((x) => COLOR_NAME[x] || x).join(", ") || "colorless"}): ${list(outside.map((c) => c.name))}.`,
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
     land in a color the deck already wants most. That is honest about what it is: a basic keeps
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
    /* The color the deck leans on hardest, by how many of its cards carry that color. */
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

  /* ================================================================== THE SCREEN'S ARITHMETIC (F.1)
   * Everything below used to live in crankmagic-game.js, the file whose own header says it
   * "spells nothing of its own". It grew to 2,200 lines holding seat mapping, deck resolution,
   * the Game Changer strip and backfill, invite seat ids and the Start orchestration -- the
   * exact places that kept regressing, and the one file with no suite. So they are here now,
   * behind tests/crankmagic-lobby.mjs, and the screen calls them.
   *
   * THE RULE OF THIS SECTION: nothing here reads the DOM, localStorage or the network. Anything
   * a function needs from the app (a card record by id, an exact-name catalog hit, the measured
   * reports) is handed in as a plain function or array, so a Node suite can hand in stubs and
   * the browser hands in C.card / C.catalog.exact. Where a function fills a row's cardId or
   * typeLine in place, it says so -- that mutation is what the screen relied on.
   */
  const SLOT_COUNT = MAX_SEATS - 1;   /* opponents; the host is the fourth box */
  const BASIC_BY_COLOR = {W: "Plains", U: "Island", B: "Swamp", R: "Mountain", G: "Forest"};
  const BASIC_LOOSE = /^(plains|island|swamp|mountain|forest|wastes)$/i;
  const noLookups = {card: () => null, exact: () => null};
  const lookupsOf = (l) => ({card: (l && typeof l.card === "function") ? l.card : noLookups.card,
    exact: (l && typeof l.exact === "function") ? l.exact : noLookups.exact});
  const factsRow = (c, id) => ({name: (c && c.name) || id, cardId: id, gameChanger: !!(c && c.gameChanger),
    colorIdentity: (c && c.colorIdentity) || [], typeLine: (c && c.typeLine) || "", edhrecRank: c && c.edhrecRank, price: c && c.price});

  /* ------------------------------------------------------------------ a seat, from each source */
  /* A library deck: the commanders and the main slots, each joined to its record through `card`.
     `score` is {score, why} from measuredScore, or nothing. */
  function libraryDeckSeat(deck, options) {
    const o = options || {}, look = lookupsOf(o), commanderIds = new Set(deck.commanders || []);
    const facts = (id) => factsRow(look.card(id), id);
    const measured = o.score || {score: null, why: ""};
    return seat({id: "seat:" + deck.id, name: deck.name, kind: "library", deckId: deck.id, you: !!o.you,
      commanders: (deck.commanders || []).map(facts),
      cards: (deck.slots || []).filter((r) => r.purpose === "main" && !commanderIds.has(r.cardId)).map((r) => Object.assign(facts(r.cardId), {quantity: r.quantity})),
      score: measured.score, scoreWhy: measured.why});
  }

  /* A parsed list (from parsePaste or a link loader): rows are filled from `exact` by name, or
     from the record the loader already attached as row.card. Commanders come from
     parsed.commanders, or from rows flagged isCommander, or from names in parsed.commander. */
  function listSeat(parsed, options) {
    const o = options || {}, look = lookupsOf(o);
    const fill = (row) => {
      const facts = row.card || look.exact(row.name) || {};
      return {name: row.name, quantity: row.quantity || 1, cardId: facts.id || "",
        gameChanger: !!facts.gameChanger, colorIdentity: facts.colorIdentity || [],
        typeLine: facts.typeLine || "", edhrecRank: facts.edhrecRank, price: facts.price};
    };
    const names = new Set((parsed.commander || []).map((x) => String(x).toLowerCase()));
    const rows = parsed.cards || [];
    const isCmd = (r) => r.isCommander || names.has(String(r.name).toLowerCase());
    const commanders = (parsed.commanders || rows.filter(isCmd)).map(fill);
    const cards = rows.filter((r) => !isCmd(r)).map(fill);
    return seat({name: o.name || parsed.name || "Imported deck", kind: o.kind, url: o.url, you: !!o.you,
      commanders, cards, score: null,
      scoreWhy: "No measured score: the simulator has not played this list."});
  }

  /* A host catalog entry (what /api/setup lists): the commander by name through `exact`, and
     either the rows the host sent or, when it sent none, ninety-nine basics split across the
     commander's colors so the seat is at least a legal placeholder. */
  function catalogMetaSeat(meta, options) {
    const o = options || {}, look = lookupsOf(o);
    const commanderName = String(meta.commander || "").trim();
    if (!commanderName) throw Error("That host deck has no commander.");
    const exact = look.exact(commanderName);
    const colors = (exact && exact.colorIdentity) || [];
    let commanders = [{name: commanderName, cardId: exact && exact.id, colorIdentity: colors.slice(), gameChanger: !!(exact && exact.gameChanger)}];
    let cards = [];
    if (Array.isArray(meta.rows) && meta.rows.length) {
      const cmdSet = new Set([commanderName.toLowerCase()]);
      (meta.commanders || []).forEach((c) => { const n = typeof c === "string" ? c : c.name; if (n) cmdSet.add(String(n).toLowerCase()); });
      if (Array.isArray(meta.commanders) && meta.commanders.length) {
        commanders = meta.commanders.map((c) => {
          const n = typeof c === "string" ? c : c.name, hit = look.exact(n);
          return {name: n, cardId: hit && hit.id, colorIdentity: (hit && hit.colorIdentity) || [], gameChanger: !!(hit && hit.gameChanger)};
        }).filter((c) => c.name);
      }
      cards = meta.rows.map((r) => {
        const name = typeof r === "string" ? r : r.name;
        return {name, quantity: Number((r && r.quantity) || 1) || 1, basic: BASIC_LOOSE.test(name)};
      }).filter((r) => r.name && !cmdSet.has(r.name.toLowerCase()));
    } else {
      const basicNames = colors.length ? colors.map((c) => BASIC_BY_COLOR[c]).filter(Boolean) : ["Wastes"];
      let left = DECK_SIZE - 1;
      basicNames.forEach((name, i) => {
        const quantity = i === basicNames.length - 1 ? left : Math.floor((DECK_SIZE - 1) / basicNames.length);
        left -= quantity;
        if (quantity > 0) cards.push({name, quantity, basic: true});
      });
    }
    return seat({id: "seat:" + meta.id, name: meta.name || commanderName, kind: "library", deckId: meta.id, you: !!o.you, commanders, cards});
  }

  /* ------------------------------------------------------------------ a pasted list */
  /* One card a line, an optional quantity in front ("1", "1x"), an optional set code and
     collector number after, section headers (Commander, Deck, Sideboard...) honoured. With no
     Commander section, a list whose first line stands alone above a blank line names its
     commander there -- the shape the invitation email asks for.
     ANY LINE ENDING SPLITS. A textarea hands over LF; a Windows file CRLF; an old export CR.
     The splitter once read only CRLF, so a paste typed or pasted into the lobby's own form --
     which the browser normalizes to LF -- came through as a single line, and the paste path
     had never once produced a seat. */
  function parsePaste(input) {
    const lines = String(input || "").split(/\r\n|\r|\n/).map((x) => x.trim());
    const cards = [], commanders = [];
    let section = "";
    for (const line of lines) {
      if (!line) { section = ""; continue; }
      const header = /^(commander|deck|maindeck|mainboard|sideboard|companion)s?\b[:\s]*$/i.exec(line);
      if (header) { section = header[1].toLowerCase(); continue; }
      const m = /^(?:(\d+)\s*[xX]?\s+)?(.+?)\s*(?:\([^)]*\)\s*[\w-]*)?$/.exec(line);
      if (!m) continue;
      const row = {name: m[2].replace(/\s*\*[^*]*\*\s*$/, "").trim(), quantity: Number(m[1] || 1)};
      if (!row.name || /^\d+$/.test(row.name)) continue;
      if (section === "commander") commanders.push(row); else cards.push(row);
    }
    if (!commanders.length && cards.length > 1 && lines[0] && !lines[1]) commanders.push(cards.shift());
    return {commanders, cards};
  }

  /* ------------------------------------------------------------------ make it seatable */
  /* THE STRIP AND BACKFILL (self-test #7). A built or pasted list that the table refuses is not
     handed back as a refusal: Game Changers over the cap go (trim first, then by name), cards
     outside the color identity go, duplicates of non-basics drop to one, anything over a hundred
     is cut from the end, and anything under is filled with the commander's first-color basic.
     Twelve passes, then a last resort that strips every Game Changer. The seat object is worked
     on in place, as the screen always did. `says` is the notice the screen shows, `adjusted`
     whether it changed anything, `lastResort` whether the twelve passes were not enough. */
  const sizeLoose = (s) => (s.commanders || []).length + (s.cards || []).reduce((n, c) => n + (Number(c.quantity) || 1), 0);
  function conform(s, options) {
    const opts = options || {};
    let adjusted = false;
    const done = (says, lastResort) => ({seat: s, adjusted, says, lastResort: !!lastResort});
    for (let guard = 0; guard < 12; guard += 1) {
      let check = validate(s, opts);
      if (check.ok) return done(adjusted ? "Seated a legal 100 (trimmed Game Changers / illegal cards)." : "");
      adjusted = true;
      const blocking = (check.issues || []).filter((i) => i.severity === "blocking");
      if (blocking.some((i) => i.code === "gameChangers")) {
        try { const trimmed = trim(s, opts); if (trimmed && trimmed.seat) s = trimmed.seat; } catch (_) { /* manual strip below */ }
      }
      check = validate(s, opts);
      if (check.ok) return done("Seated a legal 100 (trimmed Game Changers / illegal cards).");
      const issues = (check.issues || []).filter((i) => i.severity === "blocking");
      const gcIssue = issues.find((i) => i.code === "gameChangers");
      if (gcIssue) {
        const ban = new Set((gcIssue.cards || []).map((n) => String(n).toLowerCase()));
        if (ban.size) s.cards = (s.cards || []).filter((c) => !ban.has(String(c.name || "").toLowerCase()));
        else { const hit = (s.cards || []).find((c) => c.gameChanger); if (hit) s.cards = (s.cards || []).filter((c) => c !== hit); else break; }
      }
      const identityIssue = issues.find((i) => i.code === "identity");
      if (identityIssue && Array.isArray(identityIssue.cards) && identityIssue.cards.length) {
        const ban = new Set(identityIssue.cards.map((n) => String(n).toLowerCase()));
        s.cards = (s.cards || []).filter((c) => !ban.has(String(c.name || "").toLowerCase()));
      }
      const dupIssue = issues.find((i) => i.code === "duplicates");
      if (dupIssue && Array.isArray(dupIssue.cards) && dupIssue.cards.length) {
        const ban = new Set(dupIssue.cards.map((n) => String(n).toLowerCase()));
        s.cards = (s.cards || []).map((c) => (!ban.has(String(c.name || "").toLowerCase()) || c.basic) ? c : Object.assign({}, c, {quantity: 1}));
      }
      let total = sizeLoose(s);
      while (total > DECK_SIZE && s.cards && s.cards.length) {
        const last = s.cards[s.cards.length - 1];
        if ((Number(last.quantity) || 1) > 1) { last.quantity -= 1; total -= 1; } else { s.cards.pop(); total -= 1; }
      }
      if (total < DECK_SIZE) {
        const colors = new Set();
        (s.commanders || []).forEach((c) => (c.colorIdentity || []).forEach((x) => colors.add(x)));
        const basic = [...colors].map((c) => BASIC_BY_COLOR[c]).filter(Boolean)[0] || "Wastes";
        const need = DECK_SIZE - total;
        const existing = (s.cards || []).find((c) => String(c.name).toLowerCase() === basic.toLowerCase());
        if (existing) existing.quantity = (Number(existing.quantity) || 0) + need;
        else (s.cards || (s.cards = [])).push({name: basic, quantity: need, basic: true, gameChanger: false});
      }
    }
    s.cards = (s.cards || []).filter((c) => !c.gameChanger);
    const total = sizeLoose(s);
    if (total < DECK_SIZE) {
      const need = DECK_SIZE - total;
      const existing = (s.cards || []).find((c) => BASIC_LOOSE.test(c.name));
      if (existing) existing.quantity = (Number(existing.quantity) || 0) + need;
      else (s.cards || (s.cards = [])).push({name: "Wastes", quantity: need, basic: true});
    }
    return done("Seated a legal 100 after removing Game Changers over the table cap.", true);
  }

  /* ------------------------------------------------------------------ names against the catalog */
  /* Fills typeLine and cardId in place on every row that lacks them, through `card` then `exact`. */
  function enrich(s, lookups) {
    const look = lookupsOf(lookups);
    for (const row of [].concat(s.commanders || []).concat(s.cards || [])) {
      if (row.typeLine) continue;
      let c = row.cardId ? look.card(row.cardId) : null;
      if (!c && row.name) c = look.exact(row.name);
      if (!c) continue;
      if (!row.cardId && c.id) row.cardId = c.id;
      if (c.typeLine) row.typeLine = c.typeLine;
    }
    return s;
  }

  /* The names nothing can answer, each once. A row whose name resolves gets its cardId filled. */
  function unresolved(s, lookups) {
    const look = lookupsOf(lookups), unknown = [], seen = new Set();
    for (const row of [].concat(s.commanders || []).concat(s.cards || [])) {
      const name = String(row.name || "").trim();
      if (!name) continue;
      const id = row.cardId || "";
      const known = id && look.card(id);
      const exact = known || look.exact(name);
      if (exact) { if (!row.cardId && exact.id) row.cardId = exact.id; continue; }
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      unknown.push(name);
    }
    return unknown;
  }

  /* Ready Up's own gate, before the table's: near enough a hundred, and every name known. */
  function mapped(s, lookups) {
    const total = sizeLoose(s);
    if (total < 90) return {ok: false, why: `Deck has ${total} cards; map a full ~100 before Ready.`, unknown: []};
    const unknown = unresolved(s, lookups);
    if (unknown.length) return {ok: false, why: `${unknown.length} name${unknown.length === 1 ? "" : "s"} not in catalog (e.g. ${unknown[0]}). Fix before Ready.`, unknown};
    return {ok: true, why: "", unknown: []};
  }

  /* The type bar: [label, count, color] for every bucket with a card in it. Fills typeLine and
     cardId in place where the catalog can answer, as enrich does. */
  const TYPE_BUCKETS = [["Creature", "#6dbf6d"], ["Instant", "#6aa8ff"], ["Sorcery", "#ff8a5c"], ["Artifact", "#c0c0c0"],
    ["Enchantment", "#e0a0ff"], ["Planeswalker", "#ff6ad5"], ["Land", "#c4a35a"], ["Other", "#8899aa"]];
  function typeCounts(s, lookups) {
    const look = lookupsOf(lookups), buckets = TYPE_BUCKETS.map(([n, color]) => [n, 0, color]);
    for (const row of [].concat(s.commanders || []).concat(s.cards || [])) {
      const quantity = Number(row.quantity) || 1;
      let tl = row.typeLine || "";
      if (!tl && row.cardId) tl = (look.card(row.cardId) || {}).typeLine || "";
      if (!tl && row.name) {
        const hit = look.exact(row.name);
        if (hit) { tl = hit.typeLine || ""; if (!row.cardId && hit.id) row.cardId = hit.id; if (tl) row.typeLine = tl; }
      }
      const t = String(tl).toLowerCase();
      const hit = /\bland\b/.test(t) ? "Land" : /\bcreature\b/.test(t) ? "Creature" : /\binstant\b/.test(t) ? "Instant"
        : /\bsorcery\b/.test(t) ? "Sorcery" : /\bartifact\b/.test(t) ? "Artifact" : /\benchantment\b/.test(t) ? "Enchantment"
        : /\bplaneswalker\b/.test(t) ? "Planeswalker" : "Other";
      buckets.find((x) => x[0] === hit)[1] += quantity;
    }
    return buckets.filter((b) => b[1] > 0);
  }

  /* ------------------------------------------------------------------ the measured score */
  /* The latest measured report for this deck, preferring one measured on this exact list.
     `fingerprint(deck)` is the model's own, handed in. */
  function measuredScore(deck, reports, fingerprint) {
    const runs = (reports || []).filter((r) => r.deckId === deck.id && r.origin === "measured");
    if (!runs.length) return {score: null, why: ""};
    const fp = typeof fingerprint === "function" ? fingerprint(deck) : null;
    const current = fp === null ? [] : runs.filter((r) => r.deckFingerprint === fp);
    const run = (current.length ? current : runs).slice(-1)[0];
    const score = run.metrics && Number.isFinite(Number(run.metrics.score)) ? Number(run.metrics.score) : null;
    if (score === null) return {score: null, why: ""};
    const se = run.metrics.scoreStandardError;
    return {score: Math.round(score * 10) / 10,
      why: `${current.length ? "Measured on this list" : "Measured on an earlier list"}${se ? ` (±${se})` : ""}, ${run.protocol || "the published protocol"}.`};
  }

  function rulesSummary(bracket, cap) {
    const gc = cap === "" || cap === undefined || cap === null
      ? (bracket.gameChangers === Infinity ? "no Game Changer limit" : `${bracket.gameChangers} Game Changer${bracket.gameChangers === 1 ? "" : "s"}`)
      : (Number(cap) === 0 ? "0 Game Changers" : `${Number(cap)} Game Changer${Number(cap) === 1 ? "" : "s"}`);
    return `Bracket ${bracket.n} · ${bracket.name}. Cap: ${gc}. Same rules for every seat.`;
  }

  /* ------------------------------------------------------------------ the lobby's saved shape */
  /* What the screen keeps between visits: the host's seat, three opponent boxes each Human, AI
     or unused, the bracket and cap, and whether the rules were confirmed. `lobbyState` takes
     whatever was saved -- including the legacy {seats: []} shape -- and returns this shape. */
  const emptyOpponent = () => ({role: "unused", ready: false, seat: null, guestName: "", guestEmail: "", inviteId: ""});
  const emptyLobby = () => ({bracket: 3, cap: "", host: null, hostBuildDef: null,
    opponents: Array.from({length: SLOT_COUNT}, emptyOpponent), rulesConfirmed: null});
  function lobbyState(raw) {
    if (!raw || typeof raw !== "object") return emptyLobby();
    if (Array.isArray(raw.seats)) {
      const next = emptyLobby();
      next.bracket = Number(raw.bracket) || 3;
      next.cap = raw.cap === undefined ? "" : raw.cap;
      const you = raw.seats.find((x) => x.you) || null;
      if (you) next.host = {seat: you, ready: !!you.ready};
      raw.seats.filter((x) => !x.you).slice(0, SLOT_COUNT).forEach((s, i) => {
        next.opponents[i] = {role: s.kind === "generated" ? "ai" : "human", ready: !!s.ready, seat: s};
      });
      return next;
    }
    const opponents = Array.isArray(raw.opponents)
      ? raw.opponents.slice(0, SLOT_COUNT).map((o) => ({
          role: ["unused", "human", "ai"].includes(o.role) ? o.role : "unused", ready: !!o.ready, seat: o.seat || null,
          guestName: String(o.guestName || ""), guestEmail: String(o.guestEmail || ""), inviteId: String(o.inviteId || ""),
          buildDef: o.buildDef || null}))
      : Array.from({length: SLOT_COUNT}, emptyOpponent);
    while (opponents.length < SLOT_COUNT) opponents.push(emptyOpponent());
    return {bracket: Number(raw.bracket) || 3, cap: raw.cap === undefined ? "" : raw.cap,
      host: raw.host && raw.host.seat ? {seat: raw.host.seat, ready: !!raw.host.ready} : null,
      hostBuildDef: raw.hostBuildDef || null, opponents, rulesConfirmed: raw.rulesConfirmed || null};
  }

  /* The seats that are actually at the table: the host first (marked `you`), then every
     opponent box that has a role and a deck, each carrying its ready flag and role. */
  function activeSeats(lobby) {
    const out = [];
    if (lobby.host && lobby.host.seat) out.push(Object.assign({}, lobby.host.seat, {you: true, ready: !!lobby.host.ready}));
    (lobby.opponents || []).forEach((opp) => {
      if (!opp || opp.role === "unused" || !opp.seat) return;
      out.push(Object.assign({}, opp.seat, {you: false, ready: !!opp.ready, role: opp.role}));
    });
    return out;
  }

  /* SERVER SEAT IDS. The host is seat 0 and the human guests take 1, 2, 3 in box order, because
     the host's validateSetup wants humans packed before AIs. This map is what an invitation is
     minted against, so it is the one place that arithmetic lives. */
  function seatIds(opponents) {
    const map = new Map();
    let next = 1;
    (opponents || []).forEach((opp, i) => { if (opp && opp.role === "human") map.set(i, next++); });
    return map;
  }

  /* Start's gate: the table's own verdict, the host ready, and every AI seat decked and ready.
     Human guests are never readied by the host -- they bring their deck on the guest gateway. */
  /* IS THIS SEAT READY? An AI has no one to press Ready for it, so its readiness is a fact
     about its deck: seated, and passing the table's own checks. A human -- the host or a guest --
     presses the control on their own seat, so for them the flag is the answer. An empty seat does
     not hold the table up.

     `checks` is the table's own list (t.checks); without one, a seated AI counts as ready, which
     is the state the screen shows before the first validation returns. */
  function seatReady(participant, checks) {
    if (!participant || participant.role === "unused") return true;
    if (participant.role === "human") return !!participant.ready;
    if (!participant.seat) return false;
    const check = (checks || []).find((c) => c.seatId === participant.seat.id);
    return check ? !!check.ok : true;
  }

  function startReady(t, lobby) {
    if (!t || !t.ready) return false;
    if (!lobby.host || !lobby.host.ready) return false;
    return (lobby.opponents || []).every((o) => {
      if (!o || o.role === "unused") return true;
      if (o.role === "human") return true;
      return seatReady(o, t.checks);
    });
  }

  /* An open table that is still taking guests: preparing another would mint a new table id and
     void every invitation already sent (the bug of 18 September). */
  const tableAccepting = (open) => !!(open && open.table && ["selecting", "rematch"].includes(open.table.phase));

  /* ------------------------------------------------------------------ the prepare request */
  /* A seat the host can serve from its own library by id: live and archive ids only. A draft
     UUID (deck:<uuid>) must go through import-deck like a paste. */
  function libraryKind(s) {
    const k = String((s && s.kind) || "").toLowerCase();
    if (k === "generated" || k === "paste") return false;
    const id = String((s && s.deckId) || "");
    if (!(id.startsWith("deck:live:") || id.startsWith("archive:"))) return false;
    return k === "library" || k === "preloaded";
  }

  /* One seat of the /api/prepare body. Returns {request} when the host can serve the deck
     itself, or {request, handoff} when the seated list must first be sent to /api/import-deck;
     the caller fills request.deckId (and commander) from what import returns. Pure: the
     network call is the caller's. */
  function prepareSeat(s, seatId, kind, options) {
    const o = options || {};
    const commanders = (s.commanders || []).map((c) => (typeof c === "string" ? c : c.name)).filter(Boolean);
    const commander = commanders[0] || "";
    const name = String(s.name || commander || ("Seat " + (seatId + 1))).slice(0, 100);
    const request = {seatId, kind, name, commanderMode: "selected", commander};
    if (kind === "ai") { request.nativeProfile = "Default"; request.difficulty = 3; }
    if (kind === "human" && seatId > 0 && (s.guestPlaceholder || (!(s.cards && s.cards.length) && !s.deckId))) {
      return {request: Object.assign(request, {source: "preloaded", deckId: "", commander: "", commanderMode: "selected"})};
    }
    if (s.deckId && libraryKind(s)) return {request: Object.assign(request, {source: "library", deckId: s.deckId})};
    const cap = Number(o.maxCost) || Number(o.budget) || 225;
    const liveHit = (o.catalogDecks || []).find((d) => d && String(d.id || "").startsWith("deck:live:")
      && d.commander === commander && d.ok !== false && (d.cost == null || Number(d.cost) <= cap));
    if (liveHit) return {request: Object.assign(request, {source: "library", deckId: liveHit.id, commander: liveHit.commander || commander})};
    const rows = (s.cards || []).map((c) => ({name: typeof c === "string" ? c : c.name, quantity: Number((c && c.quantity) || 1) || 1})).filter((r) => r.name);
    const total = commanders.length + rows.reduce((n, r) => n + r.quantity, 0);
    if (total !== DECK_SIZE) throw new Error(name + ": seat list must total 100 with commanders (have " + total + ").");
    const handoff = {schema: "CrankMagicDeckHandoff@1", name, commanders, rows};
    if (s.deckId) handoff.sourceDeckId = s.deckId;
    return {request: Object.assign(request, {source: "library", deckId: ""}), handoff, commander};
  }

  /* The seats in the order the host wants them -- host, then human guests, then AIs -- with the
     counts the prepare body carries. A human box with no deck yet is a placeholder the guest
     fills on the gateway; an AI box with no deck is an error, as is an empty host seat. */
  function prepareOrder(lobby, options) {
    const o = options || {}, humanOpps = [], aiOpps = [];
    (lobby.opponents || []).forEach((opp, idx) => {
      if (!opp || opp.role === "unused") return;
      if (opp.role === "human") {
        humanOpps.push(opp.seat || {name: String(opp.guestName || ("Friend " + (idx + 2))).slice(0, 100), commanders: [], cards: [], kind: "human", guestPlaceholder: true});
      } else if (opp.role === "ai") {
        if (!opp.seat) throw new Error("Seat an AI deck before opening the guest lobby.");
        aiOpps.push(opp.seat);
      }
    });
    if (!lobby.host || !lobby.host.seat) throw new Error("Host seat is empty — seat your deck before inviting guests.");
    const maxCost = Number(lobby.maxCost) || Number(o.budget) || 225;
    return {
      humans: 1 + humanOpps.length, ais: aiOpps.length, maxCost,
      bracket: Number(lobby.bracket) || Number(o.defaultBracket) || 3,
      ordered: [{seat: lobby.host.seat, kind: "human"}, ...humanOpps.map((s) => ({seat: s, kind: "human"})), ...aiOpps.map((s) => ({seat: s, kind: "ai"}))],
    };
  }

  return {BRACKETS, bracketOf, DECK_SIZE, MIN_SEATS, MAX_SEATS, SLOT_COUNT, FAIR_BAND, BASIC, BASIC_FOR, COLOR_NAME,
    seat, size, identity, capOf, gameChangers, gameChangerCount, validate, trim, trimRank, pod, seating, rng, table,
    libraryDeckSeat, listSeat, catalogMetaSeat, parsePaste, conform, enrich, unresolved, mapped, typeCounts,
    measuredScore, rulesSummary, emptyOpponent, emptyLobby, lobbyState, activeSeats, seatIds, startReady, seatReady,
    tableAccepting, libraryKind, prepareSeat, prepareOrder};
});
