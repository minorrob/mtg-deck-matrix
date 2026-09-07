/**
 * The agent that writes "How to play it".
 *
 * WHY AN AGENT AND NOT A TEMPLATE. Six decks have a guide, hand-written. The other
 * forty-four variants, every imported deck and every deck built here have none, and
 * `guideFor()` returns null so the panel is simply absent -- the largest visible hole in
 * the app. The guide is the one thing on the deck page that a template genuinely cannot
 * produce: it is a paragraph about what a hundred specific cards are trying to do
 * together, and no amount of counting types gets you there.
 *
 * WHAT THIS MODULE IS. The prompt, the schema and the CHECKS -- everything except the
 * network call, which is deliberate. There is no API key in this repository and nowhere
 * to keep one (docs/claude-api-evaluation.md), so the runner is a tool that reads a key
 * out of the environment and writes a committed JSON file; the browser never calls
 * anything. What the browser gets is a file, exactly as it does today.
 *
 * THE DIVISION, which is the whole design:
 *
 *   THE APP MEASURES.   Card counts, the curve, role counts, the mana, the score. All of
 *                       it is computed and handed to the model as fact. The model is never
 *                       asked for a number it could get wrong.
 *   THE MODEL EXPLAINS. What the deck is trying to do, how a turn should go, what to keep
 *                       in an opening hand, what will go wrong. Prose, and only prose.
 *   THE APP CHECKS.     Every card named must be one of the hundred that was sent. Not
 *                       "a real card" -- one of THESE cards. That is a stricter gate than
 *                       the registry and it is a set difference, so it cannot be argued
 *                       with. A guide that names a card the deck does not contain is
 *                       rejected and re-asked, which costs four cents.
 *
 * WHAT IT DELIBERATELY DOES NOT DO. It does not score the deck, rank it, or say whether it
 * is good. The simulator does that, over 120,000 games, and a model asked the same question
 * produces a confident number connected to nothing -- which would look identical on screen
 * to a measured one.
 *
 * PURE. No network, no fs, no globals. tests/guide-agent.mjs runs every check offline.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.MtgGuideAgent = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  /* The model that writes these. Opus 5 rather than Haiku: every sentence here is a
     knowledge claim about Magic cards, and on Anthropic's own measurement Haiku 4.5
     answers knowledge questions at about a tenth of the cost and 63% accuracy against
     Opus 5's 92%. A guide is generated once per deck and read many times; buying a third
     of it wrong to save three cents is the wrong trade. See docs/claude-api-evaluation.md. */
  var MODEL = "claude-opus-5";
  var MAX_TOKENS = 3000;

  /* The fields the MODEL writes. Everything else on a deck-guides.json record -- id, label,
     commander, colorIdentity, shape -- is computed and merged in afterwards, because a
     model that is asked for a number is a model that can get a number wrong. */
  var SCHEMA = {
    type: "object",
    additionalProperties: false,
    required: ["nickname", "hook", "archetype", "difficulty", "whatItDoes", "howItWins",
      "turns", "mulligan", "keyCards", "watchFor", "upgradePath"],
    properties: {
      nickname: {type: "string", minLength: 6, maxLength: 40,
        description: "What a player would call this deck in conversation. Colors and plan, not the commander's name."},
      hook: {type: "string", minLength: 40, maxLength: 180,
        description: "One sentence: the thing this deck does that no other deck at the table does."},
      archetype: {type: "string", minLength: 6, maxLength: 60,
        description: "The recognised archetype, in the words a player would use."},
      difficulty: {
        type: "object", additionalProperties: false, required: ["tier", "why"],
        properties: {
          tier: {type: "string", enum: ["Beginner", "Intermediate", "Advanced"]},
          why: {type: "string", minLength: 40, maxLength: 260,
            description: "What makes it that tier, in terms of decisions the pilot has to make."}
        }
      },
      whatItDoes: {type: "string", minLength: 200, maxLength: 900,
        description: "The engine of the deck, naming the cards that make it work."},
      howItWins: {type: "string", minLength: 100, maxLength: 500,
        description: "How the game actually ends. Name the cards that end it."},
      turns: {
        type: "array", minItems: 3, maxItems: 5,
        items: {
          type: "object", additionalProperties: false, required: ["when", "do"],
          properties: {
            when: {type: "string", minLength: 5, maxLength: 24,
              description: "A turn range, e.g. \"Turns 1-3\"."},
            do: {type: "string", minLength: 80, maxLength: 600}
          }
        }
      },
      mulligan: {type: "string", minLength: 80, maxLength: 400,
        description: "What to keep and what to throw back, in terms of this deck's cards."},
      keyCards: {
        type: "array", minItems: 4, maxItems: 6,
        items: {
          type: "object", additionalProperties: false, required: ["name", "why"],
          properties: {
            name: {type: "string", description: "Exactly as printed, and it must be one of the cards in the list."},
            why: {type: "string", minLength: 40, maxLength: 260}
          }
        }
      },
      watchFor: {
        type: "array", minItems: 3, maxItems: 5,
        items: {type: "string", minLength: 60, maxLength: 400},
        description: "What goes wrong with this deck. Real weaknesses, not hedges."
      },
      upgradePath: {type: "string", minLength: 100, maxLength: 700,
        description: "What to change first and why. Cards outside the list may be named HERE and only here."}
    }
  };

  var SYSTEM = [
    "You write how-to-play guides for Magic: the Gathering Commander decks, for somebody",
    "who has the deck in front of them and has never played it.",
    "",
    "RULES, in order of how much they matter:",
    "1. Every card you name must be in the list you are given, spelled exactly as it appears",
    "   there. The one exception is upgradePath, where you may name cards to add.",
    "2. Never state a count of cards, lands, creatures or spells that is not in the shape",
    "   figures you are given. If you want to say how many of something the deck has and",
    "   the figure is not supplied, name the cards instead of counting them.",
    "3. Say what the deck does at a table, in the order it does it. No praise, no hedging,",
    "   no 'this powerful deck'. A guide is instructions, not a review.",
    "4. Do not score the deck or say whether it is good. That is measured elsewhere.",
    "5. Weaknesses in watchFor are real ones, stated plainly: what loses this deck games."
  ].join("\n");

  function clean(value) { return String(value == null ? "" : value).trim(); }

  function fold(name) {
    return clean(name).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, " ").trim();
  }

  /** The hundred, as the model is given it: quantity and name, one per line. */
  function listText(cards) {
    return (cards || []).map(function (card) {
      var n = Number(card.quantity || 1);
      return (n > 1 ? n + "x " : "") + clean(card.name);
    }).join("\n");
  }

  /* The shape, in words rather than as a JSON blob. The figures are the ONLY numbers the
     guide is allowed to state, so they are given as sentences the model can quote. */
  function shapeText(shape) {
    if (!shape) return "";
    var lines = [];
    var counts = ["lands", "creatures", "planeswalkers", "battles", "instants",
      "sorceries", "artifacts", "enchantments"];
    counts.forEach(function (key) {
      if (shape[key] != null) lines.push(shape[key] + " " + key);
    });
    var out = lines.length ? "Counts you may quote: " + lines.join(", ") + "." : "";
    if (shape.avgMv != null) out += " Average mana value " + shape.avgMv + ".";
    if (shape.curve) {
      out += " Curve: " + Object.keys(shape.curve).map(function (k) {
        return shape.curve[k] + " at " + k;
      }).join(", ") + ".";
    }
    if (shape.roles) {
      var roles = Object.keys(shape.roles).sort(function (a, b) { return shape.roles[b] - shape.roles[a]; });
      out += " Roles the simulator assigned: " + roles.slice(0, 10).map(function (r) {
        return shape.roles[r] + " " + r;
      }).join(", ") + ".";
    }
    return out.trim();
  }

  function userText(deck) {
    var parts = [
      "Commander: " + clean(deck.commander),
      "Color identity: " + (deck.colorIdentity || []).join("") || "colorless"
    ];
    var shape = shapeText(deck.shape);
    if (shape) parts.push(shape);
    parts.push("", "The hundred:", listText(deck.cards));
    return parts.join("\n");
  }

  /** The whole request body, ready to POST to /v1/messages. */
  function request(deck, options) {
    var opts = options || {};
    return {
      model: opts.model || MODEL,
      max_tokens: opts.maxTokens || MAX_TOKENS,
      system: SYSTEM,
      /* Structured outputs rather than "reply with JSON": the answer arrives as the record
         viewer.js already renders, with no parsing and no "sometimes it wrote a paragraph
         where a list belongs". `output_format` is the old spelling and 400s now. */
      output_config: {format: {type: "json_schema", schema: SCHEMA}},
      messages: [{role: "user", content: userText(deck)}]
    };
  }

  /* ------------------------------------------------------------------ checking */

  /* Card-name-shaped spans in prose: a run of capitalised words, allowing the small words
     a card name may contain, and allowing the comma in "Name, Title". Deliberately greedy
     about what it CONSIDERS -- the set difference afterwards is what decides. */
  var SMALL = "of|the|and|to|in|on|from|for|a|an|at|with|into|its|your";
  /* THE RUN IS AS LONG AS THE SENTENCE; THE WINDOW IS AS LONG AS A CARD NAME.
     Capping the RUN was the mistake. A guide lists cards the way a person does --
     "Overgrown Battlement, Sylvan Caryatid, Axebane Guardian, Wall of Roots, Saruli
     Caretaker, Portcullis Vine" -- and any cap cuts such a list somewhere, leaving the
     tail of a name as the longest thing left at that position. "Roots" and "Elixir" are
     both real cards, so a correct guide was reported as naming cards the deck does not
     contain. Raising the cap only moved where it cut.

     So the run runs to the end of the capitalised text, and the WINDOW -- the thing
     actually looked up -- is capped at eleven words, which is the longest card name in the
     registry ("Valentin, Dean of the Vein // Lisette, Dean of the Root"). Cost is linear
     in the run length rather than quadratic. */
  var LONGEST_NAME = 11;
  var SPAN = new RegExp(
    "\\b[A-Z][\\w'\\u2019-]*(?:,?\\s+(?:" + SMALL + "|[A-Z0-9][\\w'\\u2019-]*))*", "g");

  /* Each capitalised run in the text, as an array of its words. The words, not the joined
     string, because a name has to be found INSIDE a run: "Cast Krenko, Mob Boss" is one
     run and the card is the last three words of it. */
  function runsIn(text) {
    var out = [];
    (clean(text).match(SPAN) || []).forEach(function (span) {
      var words = span.split(/\s+/);
      while (words.length && new RegExp("^(?:" + SMALL + ")[.,;:]?$", "i").test(words[words.length - 1])) {
        words.pop();
      }
      if (words.length) out.push(words);
    });
    return out;
  }

  /** Every window of every run, longest first within each run. For tests and debugging. */
  function spansIn(text) {
    var out = [];
    runsIn(text).forEach(function (words) {
      for (var from = 0; from < words.length; from += 1) {
        for (var to = Math.min(words.length, from + LONGEST_NAME); to > from; to -= 1) {
          var span = words.slice(from, to).join(" ").replace(/^[.,;:]+|[.,;:]+$/g, "");
          if (span) out.push(span);
        }
      }
    });
    return out;
  }

  /* THE LONGEST NAME WINS, and then the reader moves past it. Taking every window of
     "Krenko, Mob Boss" independently finds "Mob", which is also a real Magic card, and
     reports that the guide names a card the deck does not contain -- inside the name of
     the commander. Greedy longest-match at each position, the way a tokenizer does it. */
  function namesIn(text, inDeck, known) {
    var found = [];
    runsIn(text).forEach(function (words) {
      var at = 0;
      while (at < words.length) {
        var took = 0;
        var reach = Math.min(words.length, at + LONGEST_NAME);
        for (var to = reach; to > at; to -= 1) {
          var span = words.slice(at, to).join(" ").replace(/^[.,;:]+|[.,;:]+$/g, "");
          var key = fold(span);
          if (!key) continue;
          if (inDeck[key] || (known && known[key])) {
            found.push({name: span, key: key, inDeck: Boolean(inDeck[key])});
            took = to - at;
            break;
          }
        }
        at += took || 1;
      }
    });
    return found;
  }

  function prose(guide) {
    var bits = [guide.hook, guide.whatItDoes, guide.howItWins, guide.mulligan,
      guide.difficulty && guide.difficulty.why];
    (guide.turns || []).forEach(function (turn) { bits.push(turn.do); });
    (guide.watchFor || []).forEach(function (line) { bits.push(line); });
    (guide.keyCards || []).forEach(function (card) { bits.push(card.why); });
    return bits.filter(Boolean).join("\n");
  }

  /**
   * What is wrong with this guide. Returns {errors, review}:
   *
   *   errors  must be fixed before the guide is written anywhere. Re-ask.
   *   review  a person should glance at it. Not automatically wrong.
   *
   * `registry` is optional -- every Commander-legal card name. With it, a name in the prose
   * that is a real card the deck does NOT hold is a hard error rather than a maybe.
   */
  function check(guide, deck, registry) {
    var errors = [];
    var review = [];
    if (!guide || typeof guide !== "object") return {errors: ["no guide was returned"], review: review};

    var inDeck = Object.create(null);
    (deck.cards || []).forEach(function (card) { inDeck[fold(card.name)] = card.name; });
    var known = null;
    if (registry && registry.length) {
      known = Object.create(null);
      for (var i = 0; i < registry.length; i += 1) {
        /* Blank-name cards are left out. "_____ Goblin" is a real card whose name folds to
           "goblin", so with it in the index the word Goblin in any sentence is a card the
           deck does not contain. There are a handful of these and none of them is what a
           guide means. */
        if (/_{3,}/.test(registry[i])) continue;
        known[fold(registry[i])] = registry[i];
      }
    }

    SCHEMA.required.forEach(function (field) {
      if (guide[field] == null || guide[field] === "") errors.push("missing " + field);
    });
    if (guide.difficulty && ["Beginner", "Intermediate", "Advanced"].indexOf(guide.difficulty.tier) < 0) {
      errors.push("difficulty tier is \"" + guide.difficulty.tier + "\", which is not one of the three");
    }

    // Key cards are the strict list: every one must be a card the deck holds.
    (guide.keyCards || []).forEach(function (card) {
      if (!inDeck[fold(card.name)]) errors.push("keyCards names " + card.name + ", which is not in this deck");
      else if (inDeck[fold(card.name)] !== clean(card.name)) {
        review.push("keyCards spells it \"" + card.name + "\"; the deck has \"" + inDeck[fold(card.name)] + "\"");
      }
    });

    /* The prose. upgradePath is exempt by design -- it is the one field whose whole job is
       to name cards the deck does not have yet. */
    /* ONE WORD IS NOT A CARD REFERENCE. A guide introduces a card by its printed name and
       then refers back to it short: "Swiftfoot Boots, Thousand-Year Elixir and Goblin
       Warchief all let him tap... and the Elixir untaps him for a second activation."
       There is a real card called Elixir, so a single-word match reported a correct
       sentence as naming a card the deck does not have. Every such collision found in the
       six hand-written guides was one word long -- Elixir, Roots, Wastes, Portcullis,
       Goblin -- and every genuine reference was two or more.

       The cost is that a guide inventing a one-word card would slip past this check. It
       would not slip past the keyCards check, which is exact, and a card worth inventing
       gets named in full somewhere. Precision is worth more than completeness here: a
       false positive rejects a correct guide and pays for another one. */
    var seen = Object.create(null);
    namesIn(prose(guide), inDeck, known).forEach(function (hit) {
      if (hit.inDeck || seen[hit.key]) return;
      if (hit.name.split(/\s+/).length < 2) return;
      seen[hit.key] = 1;
      errors.push("the guide names " + known[hit.key]
        + ", which is a real card this deck does not contain");
    });

    /* COUNTS, and this is fiddlier than it looks. Three things went wrong on the first
       attempt and each one would have rejected a correct guide:

       "Thirty-six lands is a lot to draw" was read as "six lands" and flagged against a
       deck with thirty-six, because a hyphen is a word boundary and `six` is in the number
       table. Compound number words are joined before anything is compared.

       "Keep three or four lands" is advice about an opening hand, not a claim about the
       hundred, and the mulligan field is nothing but such advice -- so it is exempt, the
       way upgradePath is exempt from the card-name check.

       And a sentence anywhere else that is plainly about a hand rather than the deck
       ("keep", "opening hand", "in hand") is skipped for the same reason.

       What is left is a claim about the list, and those are checked against the shape the
       app supplied. A count tied to no type -- "eleven cards discard on purpose", the most
       useful sentence in the six hand-written guides -- cannot be verified from a card
       list at all, so it goes to `review` for a person rather than being rejected. */
    var shape = deck.shape || {};
    var TYPES = {land: "lands", lands: "lands", creature: "creatures", creatures: "creatures",
      instant: "instants", instants: "instants", sorcery: "sorceries", sorceries: "sorceries",
      artifact: "artifacts", artifacts: "artifacts", enchantment: "enchantments",
      enchantments: "enchantments", planeswalker: "planeswalkers", planeswalkers: "planeswalkers"};
    var ONES = {one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
      nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
      sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19};
    var TENS = {twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60,
      seventy: 70, eighty: 80, ninety: 90};
    var NUMBER = "\\d{1,3}|(?:" + Object.keys(TENS).join("|") + ")(?:[-\\s](?:"
      + Object.keys(ONES).join("|") + "))?|" + Object.keys(ONES).join("|");
    function numberOf(word) {
      var text = String(word).toLowerCase().replace(/\s+/g, "-");
      if (/^\d+$/.test(text)) return Number(text);
      var parts = text.split("-");
      var tens = TENS[parts[0]];
      if (tens != null) return tens + (parts[1] ? (ONES[parts[1]] || 0) : 0);
      return ONES[parts[0]] != null ? ONES[parts[0]] : null;
    }
    var HAND = /\b(keep|keeps|keeping|opening hand|mulligan|in hand|hand with|hand of|throw back)\b/i;

    /* Everything except mulligan, which is advice about seven cards by definition. */
    var counted = prose(Object.assign({}, guide, {mulligan: ""}));
    var count = new RegExp("(" + NUMBER + ")\\s+([a-z]+)", "gi");
    var match;
    while ((match = count.exec(counted)) !== null) {
      var n = numberOf(match[1]);
      var noun = TYPES[match[2].toLowerCase()];
      /* The sentence this sits in, so hand advice outside the mulligan field is skipped
         too: "a hand with four lands and no rock" is not a claim about the hundred. */
      var from = counted.lastIndexOf(".", match.index) + 1;
      var to = counted.indexOf(".", match.index);
      var sentence = counted.slice(from, to < 0 ? counted.length : to);
      if (HAND.test(sentence)) continue;
      if (!noun) {
        if (/^cards?$/i.test(match[2])) {
          review.push("\"" + match[0] + "\" is a count nothing here can check");
        }
        continue;
      }
      if (n == null || shape[noun] == null) continue;
      /* A NUMBER FAR BELOW THE DECK'S IS ABOUT SOMETHING ELSE. "Dragonlord Dromoka and
         three creatures fly over a stalled board" is a claim about a board, and "keep two
         lands and a rock" about a hand; neither contradicts a deck with 27 creatures and
         35 lands. A guide that has miscounted says a number in the same neighbourhood --
         26 creatures when there are 27 -- so only those are checked. Under half the real
         figure, the sentence is about a hand, a board or a turn, and the checker has no
         business in it. */
      if (n * 2 < Number(shape[noun])) continue;
      if (n !== Number(shape[noun])) {
        errors.push("the guide says \"" + match[0] + "\"; the deck has " + shape[noun] + " " + noun);
      }
    }

    return {errors: errors, review: review};
  }

  /**
   * The model's fields plus the app's own, in the order data/deck-guides.json uses.
   * Anything the app can compute, the app computes.
   */
  function merge(guide, deck) {
    return {
      id: deck.id,
      label: deck.label,
      commander: deck.commander,
      nickname: guide.nickname,
      hook: guide.hook,
      colorIdentity: deck.colorIdentity || [],
      archetype: guide.archetype,
      difficulty: guide.difficulty,
      whatItDoes: guide.whatItDoes,
      howItWins: guide.howItWins,
      turns: guide.turns,
      mulligan: guide.mulligan,
      keyCards: guide.keyCards,
      watchFor: guide.watchFor,
      shape: deck.shape,
      upgradePath: guide.upgradePath
    };
  }

  return {
    MODEL: MODEL, MAX_TOKENS: MAX_TOKENS, SCHEMA: SCHEMA, SYSTEM: SYSTEM,
    request: request, userText: userText, listText: listText, shapeText: shapeText,
    check: check, merge: merge, spansIn: spansIn, namesIn: namesIn, fold: fold
  };
});
