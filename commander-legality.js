/* Commander legality: is this hundred a deck the format allows, and if not, which card, which rule, and what to do.
 *
 * WHAT THIS IS FOR (Linear ROB-104). Rob's first outcome is "play any deck legal in Commander", and the flip side
 * AGENTS.md states: behavior that would break a game is refused, with instructions. The lobby seats a list today on
 * size, color identity (when the paste carries identities), duplicates and the bracket's Game Changer cap
 * (crankmagic-lobby.js validate); the collection model checks a saved deck's legality against the catalog's
 * verified flags (collection-model.js legality); neither knows the banned list by name, reads partner pairs the same
 * way, or tells a non-legendary creature from a commander. This is the one pure function both can call, in Node and
 * the browser from one file, and its answer is three words per problem: the card, the rule, the fix.
 *
 * THE RULES, each with its code on the problem it raises:
 *
 *   size                 exactly one hundred cards, commanders included
 *   commander            at least one commander, at most two
 *   eligible             a commander is a legendary creature, or says it can be your commander; a Background alone
 *                        is not a commander
 *   pair                 two commanders are a legal pair: both Partner; Partner with each other by name; both
 *                        Friends forever; Choose a Background and a Background; a Time Lord Doctor and a Doctor's
 *                        companion
 *   banned               a card on the banned list (data/commander-banned.json, dated; passed in as `banned`)
 *   not-legal            a card whose own legality says it is not legal in Commander (silver border, a Conspiracy)
 *   identity             every card's color identity within the commanders' combined identity; identity is read
 *                        from the record when it carries one and derived from the mana cost (hybrid and Phyrexian
 *                        symbols both count), the rules text outside reminder text, and basic land types otherwise
 *   singleton            one copy of each card, except basic lands and cards whose text says otherwise ("any number
 *                        of cards named", "up to seven cards named")
 *
 * WHAT IT DOES NOT CLAIM. A card the caller hands over with no legality field and no identity is UNVERIFIED: it is
 * not refused (a paste that knows names and nothing else would refuse every deck), it is counted in `facts.unverified`
 * and named in a note, and `strict: true` turns the note into a problem for the screens that save a deck. The banned
 * list is only as current as its date, which the result repeats. A companion in the ninety-nine is noted, not judged:
 * in Commander it is a card like any other unless the table says otherwise. Bracket rules (Game Changers, mass land
 * denial, extra turns, combos) are compliance, not legality, and live in compliance-model.js and the lobby.
 *
 * SHAPES. Cards in any of the three shapes the repository carries: the catalog's camelCase (typeLine, oracleText,
 * colorIdentity, legalities), the engine oracle's short keys (type, text, ci, keywords) and Scryfall's snake_case
 * (type_line, oracle_text, color_identity). A row may carry `quantity`. The commanders may be named separately or
 * sit among the hundred: a card in `cards` whose name is a commander's is lifted out once, as the lobby does.
 *
 * PURE and UMD like deck-generator.js. tests/commander-legality.mjs holds every rule on a failing and a passing case;
 * the breaks are game/tools/batch/breaks-commander-legality.py.
 */
(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CrankLegality = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const DECK_SIZE = 100;
  const COLORS = ["W", "U", "B", "R", "G"];
  const COLOR_NAME = {W: "white", U: "blue", B: "black", R: "red", G: "green"};
  const BASIC_TYPE_COLOR = {plains: "W", island: "U", swamp: "B", mountain: "R", forest: "G"};
  const BASIC_NAME = /^(?:Snow-Covered )?(?:Plains|Island|Swamp|Mountain|Forest|Wastes)$/;
  const WORDS = {two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9};

  const fold = (s) => String(s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[‘’]/g, "'").trim().toLowerCase();
  const front = (name) => String(name || "").split(" // ")[0].trim();

  /* One shape from three. `identityGiven` says whether the record carried an identity, so the identity rule can tell
     "within the colors" from "nothing to check". */
  function normalize(raw) {
    const c = raw || {};
    const ci = c.colorIdentity || c.ci || c.color_identity;
    const legal = c.legalities && c.legalities.commander !== undefined ? c.legalities.commander
      : c.legal && c.legal.commander !== undefined ? c.legal.commander
      : c.commanderLegal !== undefined ? (c.commanderLegal === false ? "not_legal" : c.commanderLegal) : null;
    return {
      name: String(c.name || "").trim(),
      quantity: Math.max(1, Math.floor(Number(c.quantity)) || 1),
      typeLine: String(c.typeLine || c.type_line || c.type || ""),
      text: String(c.oracleText || c.oracle_text || c.text || ""),
      mana: String(c.manaCost || c.mana_cost || c.mana || ""),
      keywords: Array.isArray(c.keywords) ? c.keywords.map(String) : [],
      identity: Array.isArray(ci) ? ci.map((x) => String(x).toUpperCase()).filter((x) => COLORS.includes(x)) : null,
      identityGiven: Array.isArray(ci),
      legal: legal === null || legal === undefined ? null : String(legal),
      raw: c
    };
  }

  /* Color identity by the rules when the record carries none: every colored mana symbol in the cost and in the rules
     text outside reminder text (hybrid {G/W} is both, Phyrexian {B/P} is black), plus basic land types. */
  function deriveIdentity(card) {
    const out = new Set();
    const symbols = (s) => { for (const m of String(s).matchAll(/\{([^}]+)\}/g)) for (const part of m[1].split("/")) if (COLORS.includes(part)) out.add(part); };
    symbols(card.mana);
    symbols(card.text.replace(/\([^)]*\)/g, ""));
    for (const [type, color] of Object.entries(BASIC_TYPE_COLOR)) if (new RegExp(`\\b${type}\\b`, "i").test(card.typeLine)) out.add(color);
    return [...out];
  }
  const identityOf = (card) => (card.identityGiven ? card.identity : deriveIdentity(card));

  /* How many copies a deck may carry: basics and the cards that say otherwise, as collection-model.js reads them. */
  function maxCopies(card) {
    if (/\bBasic\b/.test(card.typeLine) || BASIC_NAME.test(card.name)) return Infinity;
    if (/any number of cards named/i.test(card.text)) return Infinity;
    const m = card.text.match(/up to (two|three|four|five|six|seven|eight|nine|\d+) cards named/i);
    if (m) return WORDS[m[1].toLowerCase()] || Number(m[1]);
    return 1;
  }

  const isBackground = (c) => /Legendary/.test(c.typeLine) && /Enchantment/.test(c.typeLine) && /\bBackground\b/.test(c.typeLine);
  const choosesBackground = (c) => c.keywords.some((k) => /^choose a background$/i.test(k)) || /choose a background/i.test(c.text);
  const isDoctor = (c) => /Time Lord/.test(c.typeLine) && /\bDoctor\b/.test(c.typeLine);
  const isCompanionOfDoctor = (c) => c.keywords.some((k) => /^doctor's companion$/i.test(k)) || /doctor's companion/i.test(c.text);
  const friendsForever = (c) => c.keywords.some((k) => /^friends forever$/i.test(k)) || /friends forever/i.test(c.text);
  const partnerWith = (c) => { const m = c.text.match(/partner with ([^(\n]+)/i); return m ? m[1].trim().replace(/[.,]$/, "") : null; };
  /* "Partner" on its own: the keyword, and not merely the parent keyword Scryfall also lists on a Partner with card. */
  const partner = (c) => !partnerWith(c) && (c.keywords.some((k) => /^partner$/i.test(k)) || /\bpartner\b(?! with)/i.test(c.text.replace(/\([^)]*\)/g, "")));
  const eligible = (c) => (/Legendary/.test(c.typeLine) && /Creature/.test(c.typeLine)) || /can be your commander/i.test(c.text);

  /**
   * The check. `deck` is {commanders, cards}; `options.banned` is an array or Set of names (data/commander-banned.json's
   * `cards`), `options.bannedAt` its date, `options.strict` refuses unverified cards. Returns
   * {legal, problems: [{code, card, rule, fix}], notes, facts}.
   */
  function check(deck, options) {
    const opts = options || {};
    const d = deck || {};
    /* The list by whole name and by front face, so "Erayo, Soratami Ascendant" is refused as the flip card it is. */
    const banned = new Set([...(opts.banned instanceof Set ? opts.banned : Array.isArray(opts.banned) ? opts.banned : [])].flatMap((n) => [fold(n), fold(front(n))]));
    const problems = [], notes = [];
    const problem = (code, card, rule, fix) => problems.push({code, card, rule, fix});

    let commanders = (d.commanders || []).map(normalize).filter((c) => c.name);
    const commanderNames = new Set(commanders.map((c) => fold(c.name)));
    /* The hundred may carry the commanders: lift each out once; a second copy stays and the singleton rule sees it. */
    const lifted = new Set();
    const cards = [];
    for (const raw of (d.cards || []).map(normalize)) {
      if (!raw.name) continue;
      if (commanderNames.has(fold(raw.name)) && !lifted.has(fold(raw.name))) {
        lifted.add(fold(raw.name));
        if (raw.quantity > 1) cards.push({...raw, quantity: raw.quantity - 1});
        continue;
      }
      cards.push(raw);
    }
    /* Copies of one name across rows are one card. */
    const merged = new Map();
    for (const c of cards) {
      const k = fold(c.name);
      if (merged.has(k)) merged.get(k).quantity += c.quantity; else merged.set(k, {...c});
    }
    const list = [...merged.values()];
    const size = commanders.length + list.reduce((n, c) => n + c.quantity, 0);

    /* 1. Size. */
    if (size !== DECK_SIZE) {
      problem("size", "Deck list", `A Commander deck is exactly ${DECK_SIZE} cards, commanders included; this one is ${size}.`,
        size < DECK_SIZE ? `Add ${DECK_SIZE - size} card${DECK_SIZE - size === 1 ? "" : "s"}.` : `Cut ${size - DECK_SIZE} card${size - DECK_SIZE === 1 ? "" : "s"}.`);
    }

    /* 2. Commanders: one or two, each eligible, two a legal pair. */
    if (!commanders.length) problem("commander", "Commander", "No commander is named. A Commander deck is one legendary creature (or a legal pair) at the head of ninety-nine.", "Name the commander.");
    if (commanders.length > 2) problem("commander", commanders.map((c) => c.name).join(", "), `${commanders.length} commanders are named; the format allows one, or two that partner.`, "Keep one commander, or a legal pair.");
    for (const c of commanders) {
      if (isBackground(c)) {
        /* Alone it is not a commander; beside the wrong commander the pair rule says so, once. */
        if (commanders.length === 1) problem("eligible", c.name, "A Background is not a commander on its own; it joins a commander that says \"Choose a Background\".", "Pair it with a Choose a Background commander, or name another commander.");
      } else if (!eligible(c)) {
        problem("eligible", c.name, `${c.name} is not a legendary creature and does not say it can be your commander.`, "Choose a legendary creature, or a card whose text says it can be your commander.");
      }
    }
    if (commanders.length === 2) {
      const [a, b] = commanders;
      const named = partnerWith(a) && partnerWith(b) && fold(partnerWith(a)) === fold(front(b.name)) && fold(partnerWith(b)) === fold(front(a.name));
      const generic = partner(a) && partner(b);
      const friends = friendsForever(a) && friendsForever(b);
      const background = (choosesBackground(a) && isBackground(b)) || (choosesBackground(b) && isBackground(a));
      const doctors = (isDoctor(a) && isCompanionOfDoctor(b)) || (isDoctor(b) && isCompanionOfDoctor(a));
      if (!(named || generic || friends || background || doctors)) {
        const why = partnerWith(a) ? `${a.name} partners only with ${partnerWith(a)}` : partnerWith(b) ? `${b.name} partners only with ${partnerWith(b)}`
          : `neither Partner on both, nor Friends forever on both, nor a Choose a Background commander with a Background, nor a Time Lord Doctor with a Doctor's companion`;
        problem("pair", `${a.name} and ${b.name}`, `Two commanders need a pairing rule, and these have none: ${why}.`, "Keep one of them, or choose a pair the rules join.");
      }
    }

    /* 3. Each card: banned, not legal, identity, copies. */
    const identity = new Set(commanders.flatMap(identityOf));
    const colorsSaid = [...identity].map((x) => COLOR_NAME[x]).join(", ") || "colorless";
    const unverified = [];
    let identityChecked = 0;
    const everyone = [...commanders.map((c) => ({...c, isCommander: true})), ...list];
    for (const c of everyone) {
      const isBanned = banned.has(fold(c.name)) || banned.has(fold(front(c.name))) || c.legal === "banned";
      if (isBanned) { problem("banned", c.name, `${c.name} is banned in Commander${opts.bannedAt ? ` (list dated ${String(opts.bannedAt).slice(0, 10)})` : ""}.`, "Replace it."); continue; }
      if (c.legal !== null && c.legal !== "legal") problem("not-legal", c.name, `${c.name} is not legal in Commander (${c.legal.replace(/_/g, " ")}).`, "Replace it with a Commander-legal card.");
      if (c.legal === null && !c.identityGiven && !c.mana && !c.typeLine) unverified.push(c.name);
      if (!c.isCommander && commanders.length) {
        const own = identityOf(c);
        if (c.identityGiven || c.mana || c.text || c.typeLine) identityChecked++;
        const outside = own.filter((x) => !identity.has(x));
        if (outside.length) problem("identity", c.name, `${c.name} is ${outside.map((x) => COLOR_NAME[x]).join(" and ")}; the commander${commanders.length > 1 ? "s are" : " is"} ${colorsSaid}.`, "Replace it with a card inside the commander's color identity.");
      }
      if (!c.isCommander) {
        const allowed = maxCopies(c);
        /* A copy of the commander left in the ninety-nine is a second copy: the commander is the first. */
        const copies = c.quantity + (commanderNames.has(fold(c.name)) ? 1 : 0);
        if (copies > allowed) problem("singleton", c.name, allowed === 1 ? `${copies} copies of ${c.name}${copies > c.quantity ? " (the commander and one in the ninety-nine)" : ""}; a Commander deck carries one of each card that is not a basic land.` : `${copies} copies of ${c.name}; its text allows ${allowed}.`, allowed === 1 ? `Keep one ${c.name} and replace the other ${copies - 1}.` : `Keep ${allowed}.`);
      }
    }
    if (unverified.length) {
      if (opts.strict) for (const n of unverified) problem("unverified", n, `${n} carries no legality or identity, so it cannot be verified.`, "Resolve it against the catalog, or check the name.");
      else notes.push(`${unverified.length} card${unverified.length === 1 ? "" : "s"} carr${unverified.length === 1 ? "ies" : "y"} no legality or identity and ${unverified.length === 1 ? "was" : "were"} not verified: ${unverified.slice(0, 5).join(", ")}${unverified.length > 5 ? ", …" : ""}.`);
    }
    if (commanders.length && list.length && identityChecked === 0) notes.push("No card carried an identity, a cost or a type, so color identity was not checked.");
    const companions = list.filter((c) => c.keywords.some((k) => /^companion$/i.test(k)) || /^Companion —/m.test(c.text));
    if (companions.length) notes.push(`${companions.map((c) => c.name).join(", ")} ${companions.length === 1 ? "is a companion" : "are companions"}; in Commander a companion is a card in the ninety-nine unless the table agrees otherwise. Its restriction was not checked.`);
    if (!banned.size) notes.push("No banned list was supplied, so banned cards were not checked by name.");

    const order = {size: 0, commander: 1, eligible: 2, pair: 3, banned: 4, "not-legal": 5, identity: 6, singleton: 7, unverified: 8};
    problems.sort((x, y) => order[x.code] - order[y.code] || x.card.localeCompare(y.card));
    return {
      legal: problems.length === 0,
      problems,
      notes,
      facts: {size, commanders: commanders.map((c) => c.name), identity: [...identity].sort(), cards: list.length, unverified: unverified.length,
        identityChecked, bannedList: banned.size, bannedAt: opts.bannedAt || null}
    };
  }

  /** The issue's signature: the list, the commanders, the same options. */
  const commanderLegality = (list, commanders, options) => check({cards: list, commanders}, options);

  return {check, commanderLegality, normalize, identityOf, deriveIdentity, maxCopies, eligible, DECK_SIZE, COLORS};
});
