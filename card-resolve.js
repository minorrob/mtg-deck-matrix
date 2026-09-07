/**
 * "That card name is not a card." Now what?
 *
 * An imported list is somebody's typing, or somebody else's export, or a name a language
 * model made up. When one of them does not match, the import used to say so and stop:
 * "1 card name could not be matched" and a Save button that saved a 99-card deck the
 * simulator would then refuse to score. A dead end with the answer one request away.
 *
 * THE LADDER, cheapest and most certain first. Every rung is Scryfall, because Scryfall
 * is the only card database this app can reach without a key -- see WHY NOT TCGPLAYER.
 *
 *   1. AUTOCOMPLETE ON THE WHOLE NAME. Scryfall's own name suggester. It answers for a
 *      typo or a half-remembered name and answers nothing for an invented one.
 *   2. AUTOCOMPLETE ON THE PART BEFORE THE COMMA. This is the rung that earns its keep.
 *      Most legends are "Name, Title", and an invented card is almost always a real Name
 *      with a wrong Title: "Splinter, Vengeful Sensei" is not a card, and "Splinter" gives
 *      back Splinter the Mentor, Splinter Hamato Yoshi and Splinter Aging Champion, one of
 *      which is what was meant.
 *   3. FUZZY NAMED. Scryfall's own single best guess. It is confident and sometimes
 *      confidently wrong -- it answers "Splinter, Vengeful Sensei" with "Ink-Eyes, Servant
 *      of Oni" -- so it is offered as one candidate among several rather than applied.
 *   4. SEARCH ON THE DISTINCTIVE WORDS. `name:x name:y`, for a name whose words are all
 *      real but in the wrong order or with a word missing.
 *
 * Candidates are deduped, ranked, and capped at five, because a list of twenty is not a
 * choice, it is a second search. Every one carries WHY it is being offered, so the reader
 * is choosing between reasons rather than between names.
 *
 * WHY NOT TCGPLAYER as the second source. Its API needs a client id and secret and an
 * OAuth exchange; this app is a static site with no server and no place to keep a secret
 * that would not also be handing that secret to everybody who opens it. What it offers
 * instead is `storeSearchUrl` -- a plain search link a person can open and read with their
 * own eyes -- which is the honest version of "check a second source" for a page with no
 * credentials.
 *
 * PURE apart from the client it is handed. tests/card-resolve.mjs runs the whole ladder
 * against a stub.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.MtgCardResolve = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var CAP = 5;

  function clean(name) { return String(name == null ? "" : name).trim(); }
  function key(name) {
    return clean(name).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, " ").trim();
  }

  /* The part of a name before the first comma. "Splinter, Vengeful Sensei" -> "Splinter".
     Returned only when it is worth searching on: one bare word is often too generic to
     help ("The"), and the whole name is already rung 1. */
  function leadName(name) {
    var head = clean(name).split(/\s*[,—–-]\s*/)[0];
    if (!head || head.length < 3) return "";
    if (key(head) === key(name)) return "";
    return head;
  }

  /* The words worth searching on: the long ones, which are the ones that identify a card.
     "of", "the" and "a" match everything and rank nothing. */
  var STOP = {of: 1, the: 1, a: 1, an: 1, and: 1, to: 1, "in": 1, on: 1, from: 1};
  function words(name) {
    return key(name).split(" ").filter(function (w) { return w.length > 2 && !STOP[w]; });
  }

  /* HOW ALIKE TWO NAMES ARE, 0..1. Two failures need ranking and they are different:
     "right card, wrong words" (Splinter, Vengeful Sensei) and "right word, wrong letters"
     (Sol Rng). Shared WORDS catch the first and shared TRIGRAMS catch the second, so the
     score is the better of the two -- a name that is one letter out scores as highly as
     one that is one word out, which is what a reader would say about both.

     The leading word counts double: in "Name, Title" the name is the part people get
     right, and the title is the part they invent. */
  function trigrams(text) {
    var padded = "  " + key(text) + " ";
    var out = [];
    for (var i = 0; i < padded.length - 2; i += 1) out.push(padded.slice(i, i + 3));
    return out;
  }
  function diceScore(asked, found) {
    var a = trigrams(asked), b = trigrams(found);
    if (!a.length || !b.length) return 0;
    var have = Object.create(null);
    b.forEach(function (g) { have[g] = (have[g] || 0) + 1; });
    var hit = 0;
    a.forEach(function (g) { if (have[g] > 0) { have[g] -= 1; hit += 1; } });
    var dice = (2 * hit) / (a.length + b.length);
    /* PENALIZED FOR BEING THE WRONG LENGTH. Dice flatters a short candidate: "Splinter"
       has eleven trigrams and shares ten of them with "Splinter, Vengeful Sensei", which
       scores it above "Splinter, Radical Rat" -- and the reader typed a long name, so a
       long name is the likelier answer. Half the relative difference in length, which
       barely touches a one-letter typo (0.94x for Sol Rng -> Sol Ring) and reorders a
       card that is a third the length of what was asked for. */
    var la = key(asked).length, lb = key(found).length;
    var longer = Math.max(la, lb) || 1;
    return dice * (1 - 0.5 * (Math.abs(la - lb) / longer));
  }
  function wordScore(asked, found) {
    var a = words(asked), b = words(found);
    if (!a.length || !b.length) return 0;
    var have = {};
    b.forEach(function (w) { have[w] = 1; });
    var hit = 0;
    a.forEach(function (w, i) { if (have[w]) hit += (i === 0 ? 2 : 1); });
    return Math.min(1, hit / (a.length + 1));
  }
  function likeness(asked, found) {
    return Math.max(wordScore(asked, found), diceScore(asked, found));
  }

  /* A name shaped like a commander -- "Something, Some Title". When the name asked for
     has that shape, candidates that share it are what was meant far more often than a
     one-word card that happens to share a syllable. Used only to break ties. */
  var titled = function (name) { return /,/.test(clean(name)); };

  /* Every rung's findings land here, with the first reason a card was found kept: a card
     that autocomplete offered AND fuzzy guessed is one candidate, described by the
     stronger of the two. */
  function collector() {
    var seen = Object.create(null);
    var out = [];
    return {
      add: function (card, why, rung) {
        if (!card || !card.name) return;
        var k = key(card.name);
        if (seen[k]) return;
        seen[k] = 1;
        out.push({card: card, name: card.name, why: why, rung: rung});
      },
      has: function (name) { return Boolean(seen[key(name)]); },
      list: function () { return out; }
    };
  }

  /**
   * Look one name up. Returns {name, exact, candidates, searched, error}.
   *
   *   exact       a card whose name IS the name asked for, if the ladder turned one up
   *   candidates  up to five {name, card, why, likeness}, best first
   *   searched    which rungs actually ran, for the message when nothing is found
   *
   * A rung that throws is recorded and the ladder carries on: one 429 must not cost the
   * reader the other three answers.
   */
  async function resolveName(name, client, options) {
    var asked = clean(name);
    var opts = options || {};
    var limit = opts.limit || CAP;
    var found = collector();
    var searched = [];
    var errors = [];

    /* RUNG 0: THE REGISTRY, WITH NO NETWORK AT ALL.
       data/commander-universe.json is every Commander-legal card name, already committed
       and already fetched by the graph. Matched by trigram it catches the failure Scryfall
       cannot: autocomplete is prefix-based, so "Sol Rng" suggests nothing and the fuzzy
       endpoint answers it with "Oathsworn Giant". Against the list, "Sol Ring" is the
       obvious answer and no request is made to find it. */
    var localNames = opts.localNames || [];
    if (localNames.length) {
      searched.push("registry");
      var near = [];
      for (var n = 0; n < localNames.length; n += 1) {
        var score = diceScore(asked, localNames[n]);
        if (score >= 0.45) near.push({name: localNames[n], score: score});
      }
      near.sort(function (a, b) { return b.score - a.score; });
      near.slice(0, limit).forEach(function (entry) {
        found.add({name: entry.name}, "Closest name in the card list", "registry");
      });
    }

    async function rung(label, run) {
      searched.push(label);
      try { await run(); } catch (err) { errors.push(label + ": " + (err && err.message || err)); }
    }

    // 1 + 2. Scryfall's own name suggester, on the whole name and then on the lead.
    var suggestions = [];
    await rung("autocomplete", async function () {
      suggestions = (await client.autocomplete(asked)) || [];
    });
    var lead = leadName(asked);
    if (lead && suggestions.length < limit) {
      await rung("autocomplete:lead", async function () {
        var more = (await client.autocomplete(lead)) || [];
        suggestions = suggestions.concat(more.filter(function (n) { return suggestions.indexOf(n) < 0; }));
      });
    }
    /* Names, not cards. They are turned into cards in one /cards/collection request
       rather than one request each -- five round trips for one typo is a page that feels
       broken even when it works. */
    var top = suggestions.slice(0, limit * 2);
    if (top.length) {
      await rung("collection", async function () {
        var result = await client.collection(top.map(function (n) { return {name: n}; }));
        (result.cards || []).forEach(function (card) {
          found.add(card, "Scryfall suggests this name", "autocomplete");
        });
      });
    }

    // 3. Scryfall's single best guess. Confident, and sometimes confidently wrong.
    if (found.list().length < limit) {
      await rung("fuzzy", async function () {
        var card = await client.named(asked);
        if (card) found.add(card, "Scryfall's closest match", "fuzzy");
      });
    }

    // 4. The distinctive words, in any order.
    var terms = words(asked).slice(0, 4);
    if (terms.length && found.list().length < limit) {
      await rung("search", async function () {
        var query = terms.map(function (w) { return 'name:"' + w + '"'; }).join(" ");
        var cards = await client.search(query + " legal:commander", {maxPages: 1});
        (cards || []).forEach(function (card) { found.add(card, "Shares the words in that name", "search"); });
      });
    }

    var wantTitled = titled(asked);
    var ranked = found.list()
      .map(function (entry) { return Object.assign({}, entry, {likeness: likeness(asked, entry.name)}); })
      .sort(function (a, b) {
        return (b.likeness - a.likeness)
          // A "Name, Title" query means a commander; offer commander-shaped names first.
          || (wantTitled ? (titled(b.name) ? 1 : 0) - (titled(a.name) ? 1 : 0) : 0)
          || RUNGS.indexOf(a.rung) - RUNGS.indexOf(b.rung)
          || a.name.localeCompare(b.name);
      });
    let exact = ranked.filter(function (entry) { return key(entry.name) === key(asked); })[0] || null;


    var shortlist = ranked.slice(0, limit);
    /* A registry hit is a name and nothing else -- the registry carries no rules text, and
       the simulator needs rules text. The survivors are turned into real cards in one
       request, which is also the check that the name is still real. */
    var thin = shortlist.filter(function (entry) { return !entry.card.typeLine && !entry.card.type_line; });
    if (thin.length) {
      await rung("collection:fill", async function () {
        var result = await client.collection(thin.map(function (entry) { return {name: entry.name}; }));
        var byName = Object.create(null);
        (result.cards || []).forEach(function (card) { byName[key(card.name)] = card; });
        shortlist = shortlist.map(function (entry) {
          var full = byName[key(entry.name)];
          return full ? Object.assign({}, entry, {card: full, name: full.name}) : entry;
        }).filter(function (entry) { return entry.card.typeLine || entry.card.type_line || entry.rung !== "registry"; });
      });
    }
    exact = shortlist.filter(function (entry) { return key(entry.name) === key(asked); })[0] || exact;

    return {
      name: asked,
      exact: exact ? exact.card : null,
      candidates: shortlist,
      searched: searched,
      errors: errors
    };
  }
  var RUNGS = ["registry", "autocomplete", "fuzzy", "search"];

  /** The whole list, one name at a time. Sequential on purpose: Scryfall asks for it. */
  async function resolveNames(names, client, options) {
    var out = [];
    for (var i = 0; i < (names || []).length; i += 1) {
      out.push(await resolveName(names[i], client, options));
      if (options && options.onEach) options.onEach(out[out.length - 1], i, names.length);
    }
    return out;
  }

  /* The escape hatch, for a name no rung could place: a search a person can read with
     their own eyes. Not an API call -- see WHY NOT TCGPLAYER at the top. */
  function storeSearchUrl(name) {
    return "https://www.tcgplayer.com/search/magic/product?productLineName=magic&q="
      + encodeURIComponent(clean(name));
  }
  function scryfallSearchUrl(name) {
    return "https://scryfall.com/search?q=" + encodeURIComponent(clean(name));
  }

  return {
    resolveName: resolveName, resolveNames: resolveNames,
    leadName: leadName, words: words, likeness: likeness,
    storeSearchUrl: storeSearchUrl, scryfallSearchUrl: scryfallSearchUrl, CAP: CAP
  };
});
