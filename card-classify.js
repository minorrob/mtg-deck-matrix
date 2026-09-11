/**
 * What a card DOES, read off its rules text.
 *
 * THE MODELING DECISION THIS FILE ENCODES. Cards are never linked to cards. A card is
 * linked to the EVENTS it fires on and the events it CAUSES, and to the RESOURCES it
 * makes and spends. Synergy is then a two-hop path -- Krenko CAUSES creature-etb,
 * Purphoros TRIGGERS_ON creature-etb -- so it is derived rather than curated. 38k cards
 * would be 1.9 billion authored pairs; this is a few hundred thousand edges and it
 * generalises to cards printed tomorrow.
 *
 * WHY IT IS ITS OWN FILE. These tables were written for graph/ingest/02-build-csv.mjs,
 * which runs over the Scryfall bulk download and whose output is baked into
 * data/graph.json. The graph page now also has to classify a card that is NOT in that
 * bake -- somebody types a Commander-legal card the corpus never included, and the page
 * looks it up and draws its neighborhood. Two copies of this vocabulary would drift, and
 * the drift would be invisible: the typed card would sit in the same picture as the baked
 * ones, connected by subtly different rules, and nothing would look wrong. So there is one
 * copy, and tests/card-classify.mjs holds it to what the bake already committed.
 *
 * Reminder text is stripped before any ability is read. Scryfall prints reminder text in
 * parentheses, and reading it as rules text is what once credited Bronze Guardian with a
 * +1/+1 counter doubler it does not have.
 *
 * HOW THE PATTERNS ARE WRITTEN, after the 2026-09 audit. Oracle text is read in three
 * voices and the first version of every table heard only one of them: "you draw a card"
 * but not "target player draws a card"; "whenever a creature dies" but not "whenever
 * this creature or another creature dies", which is how every aristocrats payoff is
 * printed; "search your library for a basic land card" but not "for up to two basic
 * land cards", which is how Cultivate is printed. Blood Artist had no death trigger,
 * Cultivate was not ramp, and Purphoros -- whose whole job is 2 damage to each opponent
 * -- caused no life loss, because the pattern wanted the word "loses". Each table below
 * now names the third-person verb, the "one or more" plural, the self-inclusive "X or
 * another", and the damage-as-life-loss reading. Every widening was measured against
 * the corpus before it landed; the numbers are in the commit that brought it.
 *
 * Pure. No DOM, no storage, no fetch.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.MtgCardClassify = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  /* Building blocks for the listeners. LEAD is the self-inclusive opener -- "this
     creature or another creature", "omnath or another elemental" -- and ART is every
     determiner a trigger can open with, "one or more" included. NOUN_STOP is what may
     NOT stand where the creature noun stands: the other permanent types, players, and
     the function words that would otherwise let "whenever a land you control enters"
     read "you" as the noun and pass as a creature entering. */
  var LEAD = "(?:[^.,;]{0,40} or )?";
  var ART = "(?:another |a |an |the |one or more |each |all |any number of )?";
  var NOUN_STOP = "(?!(?:lands?|artifacts?|enchantments?|planeswalkers?|auras?|equipment|vehicles?|battles?|cards?|spells?|counters?|players?|opponents?|sagas?|abilit(?:y|ies)|you|your|this|that|those|with|from|under|or|and|is|are|would|of|in|on|to|the|a|an|it|its|another|other|each|all|one|more|any|number|some|two|three)\\b)";
  var WORD = "[a-z][a-z'-]*";
  var CREATURE_NOUN = "(?:other )?(?:" + NOUN_STOP + WORD + " )?" + NOUN_STOP + WORD + "s?";
  /* The determiners sit in the stop list too: when ART leaves "another" unconsumed, the
     noun slot must not take it, or "another enchantment ... enters" reads "another" as
     the thing entering and passes. */
  var DIES_STOP = "(?!(?:players?|opponents?|you|your|this|that|those|with|from|under|or|and|is|are|would|of|in|on|to|the|a|an|it|its|another|other|each|all|one|more|any|number|some|two|three)\\b)";
  var DIES_NOUN = "(?:other )?(?:" + DIES_STOP + WORD + " )?" + DIES_STOP + WORD + "s?";
  var PHASE = "(?:your |each |each player's |each opponent's |an opponent's |the )?";
  var NUM = "(?:a|an|one|two|three|four|five|x|\\d+|that many|twice that many)";
  var LAND_WORD = "(?:land|plains|island|swamp|mountain|forest)";
  var LAND_SEARCH = "search your library for (?:a|an|up to \\w+)[^.]{0,60}" + LAND_WORD + "[^.]{0,60}onto the battlefield";
  var LAND_PUT = "puts? (?:a|that|target|up to \\w+|those|them|it) lands?(?: cards?)?[^.]{0,40}onto the battlefield";
  var TREASURE = "creates? " + NUM + "[^.]{0,30}treasure";
  /* Keyword actions that make counters or tokens without saying "put" or "create" once
     their reminder text is gone. Bolster 2 puts two counters; Amass makes an Army. */
  var COUNTER_KEYWORDS = "\\b(?:bolster|support|adapt|evolve|monstrosity|mentor|outlast|backup|modular|graft|unleash|training|ravenous|amass|reinforce|renown|scavenge|devour|fabricate|riot)\\b";
  var TOKEN_KEYWORDS = "\\b(?:populate|investigate|amass|fabricate|incubate|living weapon|myriad|encore|embalm|eternalize|afterlife|squad|offspring)\\b";
  var CREATURE_TOKEN_KEYWORDS = "\\b(?:populate|amass|fabricate|living weapon|myriad|encore|embalm|eternalize|afterlife|squad|offspring|unearth|persist|undying)\\b";
  var re = function (s) { return new RegExp(s); };

  // --- the event vocabulary -------------------------------------------------
  // Each entry: the event id, what a card that LISTENS for it says, and what a card
  // that CAUSES it says. Keeping both sides in one table is what keeps them aligned.
  var EVENTS = [
    {id: "creature-etb",
     listen: re("whenever " + LEAD + ART + CREATURE_NOUN + "[^.]{0,40}\\benters?\\b(?! (?:a |your |the |an opponent's )?graveyard)"),
     cause:  re("creates? " + NUM + "[^.]{0,60}creature tokens?|puts? (?:a|an|two|three|x|\\d+|that|target|those|them|it)[^.]{0,40}creature(?: cards?)?[^.]{0,30}onto the battlefield|search your library for (?:a|an|up to \\w+)[^.]{0,40}creature cards?[^.]{0,60}onto the battlefield|returns? [^.]{0,30}creature[^.]{0,40}to the battlefield|returns? (?:it|them|that card|those cards|each of them) to the battlefield|exile [^.]{0,60}(?:then )?returns? (?:it|them|that card|those cards) to the battlefield|creates? (?:a|x|\\d+) tokens? that(?:'s| is| are) (?:a )?cop(?:y|ies) of|" + CREATURE_TOKEN_KEYWORDS)},
    {id: "land-drop",
     listen: re("landfall|whenever " + LEAD + "(?:a |an |one or more |another |each )?(?:nonbasic |basic |other )?lands? (?:you control |you own )?(?:enters?|is put onto the battlefield)\\b"),
     cause:  re("you may play an additional land|" + LAND_PUT + "|" + LAND_SEARCH)},
    {id: "creature-dies",
     listen: re("whenever " + LEAD + ART + DIES_NOUN + "[^.,]{0,40}\\b(?:dies|die)\\b"),
     /* Only what kills no matter what: a sacrifice or a destroy. Damage and -N/-N depend on
        the creature's toughness, so a bolt is removal but not a cause of death -- a payoff
        that fires when a creature dies must not be drawn to every burn spell. */
     cause:  re("sacrifices? (?:a|an|another|two|three|x|\\d+|that|target|all) creatures?|destroy target creature|destroy (?:all|each) creatures?|each (?:player|opponent) sacrifices (?:a|an|two|\\d+|x) creatures?")},
    /* "Whenever you attack" and "whenever one or more creatures you control attack" listen;
       "whenever this creature attacks" is the card's own trigger, not a listener. */
    {id: "attack",         listen: re("whenever you attack\\b|whenever " + LEAD + ART + DIES_NOUN + "[^.]{0,30}\\battacks?\\b"),
                           cause:  /must be blocked|attacks? each combat if able|goad/},
    {id: "combat-begin",   listen: /at the beginning of (?:each |your )?combat/, cause: /additional combat phase|untap all creatures you control/},
    {id: "end-step",       listen: re("at the beginning of " + PHASE + "end step"), cause: null},
    {id: "upkeep",         listen: re("at the beginning of " + PHASE + "upkeep"), cause: null},
    {id: "cast-spell",     listen: /whenever (?:you|a player|you or an opponent) casts? (?:a|an|your|another|one or more|the)/, cause: null},
    /* THE TYPED CASTS. "Whenever you cast a creature spell" is Chulane's whole deck, and
       a generic cast-spell event has no cause side -- every card is a spell. The typed
       ones do: the cause is the card's own type line, read by causeType rather than by
       rules text. This is how a creature deck built around a creature-cast commander
       stops reading as ninety strangers. */
    {id: "cast-creature",  listen: /whenever you cast (?:a|an|another|your first) (?:legendary |historic |nontoken |[a-z]+ )?creature spell/, cause: null, causeType: /Creature/},
    {id: "cast-instant-sorcery", listen: /whenever you cast (?:a|an|your first) (?:noncreature spell|instant or sorcery|instant|sorcery)/, cause: null, causeType: /Instant|Sorcery/},
    {id: "cast-enchantment", listen: /whenever you cast an? (?:[a-z]+ )?enchantment spell/, cause: null, causeType: /Enchantment/},
    {id: "cast-artifact",  listen: /whenever you cast an? (?:[a-z]+ )?artifact spell|whenever you cast (?:a historic spell|an artifact or)/, cause: null, causeType: /Artifact/},
    {id: "cast-legendary", listen: /whenever you cast a (?:legendary|historic) spell/, cause: null, causeType: /Legendary/},
    {id: "counter-placed", listen: /whenever (?:one or more )?\+1\/\+1 counters? (?:is|are) put|whenever (?:a|one or more) counters? (?:is|are) put on/,
                           cause:  re("puts? " + NUM + "[^.]{0,30}\\+1\\/\\+1 counters?|enters (?:the battlefield )?with (?:a|an|one|two|three|x|\\d+)[^.]{0,20}\\+1\\/\\+1 counters?|distribute [^.]{0,20}\\+1\\/\\+1 counters?|" + COUNTER_KEYWORDS)},
    {id: "life-gain",      listen: /whenever you gain life/, cause: /you gain (?:\d+|x|that much|twice that much|life)|gain (?:that much|x) life|lifelink/},
    {id: "life-loss",      listen: /whenever (?:an? )?opponent loses life|whenever a player loses life/,
                           cause:  /each opponent loses (?:\d+|x|that much|half|life)|target (?:player|opponent) loses (?:\d+|x|that much|life)|each player loses (?:\d+|x) life|\bloses (?:\d+|x|that much|half) life|opponents? loses? life equal|deals? (?:\d+|x|that much) damage to (?:each opponent|each player|any target|target player|target opponent|each of your opponents|that player)|deals? damage (?:equal to|to each opponent)|loses life equal to/},
    {id: "draw-card",      listen: /whenever you draw/, cause: re("draws? " + NUM + " cards?|draws? cards? equal|draws? (?:an|two|x) additional cards?")},
    {id: "sacrifice",      listen: /whenever you sacrifice|whenever a player sacrifices/, cause: /sacrifices? (?:a|an|another|two|three|x|\d+)[^:\n]{0,40}:|sacrifice (?:a|an|another|two|three|x|\d+)[^.]{0,30}as an additional cost/},
    {id: "graveyard-entry",listen: re("whenever " + LEAD + "(?:a |an |one or more |another )?[^.]{0,30}(?:is|are) put into (?:your |a |an opponent's |their )?graveyard|whenever [^.]{0,40}(?:card|permanent)s? (?:is|are) put into"),
                           cause:  /mills? (?:\d+|x|that many)|discards? (?:a|your|two|three|x|\d+|that many|their hand)|put (?:the )?top (?:\d+|x) cards[^.]{0,30}graveyard|surveil|sacrifice (?:a|an|another|two|three|x|\d+) (?:land|permanent|artifact|creature|enchantment)/}
  ];

  var RESOURCES = [
    {id: "mana",     produce: /\{t\}: add|add \{[wubrgc]\}|adds? (?:one|two|three|four|x|\d+) (?:additional )?mana|add an amount of/, consume: null},
    {id: "treasure", produce: re(TREASURE), consume: /sacrifice[^.]{0,20}treasure/},
    {id: "card",     produce: re("draws? " + NUM + " cards?|draws? cards? equal|draws? (?:an|two|x) additional cards?"), consume: /discards? (?:a|your|two|three|x|\d+)/},
    {id: "life",     produce: /you gain (?:\d+|x|that much|twice that much|life)|gain (?:that much|x) life|lifelink/, consume: /you lose (?:\d+|x|half) life|pay (?:\d+|x|half your) life/},
    /* EVERY KIND OF COUNTER, not only +1/+1. This is the pattern the old "proliferate
       event" carried, filed where it belongs: proliferate does not FIRE when a counter is
       placed, it makes more of whatever counters are already there. So a card that puts
       loyalty, charge, shield or +1/+1 counters PRODUCES the thing proliferate MULTIPLIES,
       and the pair falls out of the produces/multiplies join instead of a fake trigger.
       The +1/+1-specific vocabularies (the counters role, the counters requirement) stay
       +1/+1-specific: a payoff that reads "+1/+1 counter" means that one. */
    {id: "counter",  produce: re("puts? " + NUM + "[^.]{0,40}counters? on|enters (?:the battlefield )?with (?:a|an|one|two|three|x|\\d+)[^.]{0,30}counters?|distribute [^.]{0,30}counters?|" + COUNTER_KEYWORDS), consume: /remove (?:a|an|one|two|x|\d+|all)[^.]{0,30}counters?/},
    {id: "token",    produce: re("creates? " + NUM + "[^.]{0,60}tokens?|creates? a token|" + TOKEN_KEYWORDS), consume: null}
  ];

  // A card that says "sacrifice a creature" needs bodies; one that pays off counters
  // needs a source of counters. These are the REQUIRES edges -- the demand side.
  //
  // THE SAC-OUTLET ENTRY THAT USED TO BE HERE WAS BACKWARDS. It filed "sacrifice a
  // creature:" as requiring a sac-outlet -- the card IS the outlet; what it lacks is
  // the creatures. The role it now demands is the one every creature card fills, so
  // Ashnod's Altar reads as fed by Krenko rather than as satisfied by itself.
  var SAC_NOUN = "(?!lands?\\b|enchantments?\\b|cards?\\b|spells?\\b|permanents?\\b|artifacts?\\b)(?:[a-z-]+ )?[a-z-]+s?";
  var REQUIRES = [
    {role: "counters",    when: /(?:for each|equal to the number of)[^.]{0,40}\+1\/\+1 counter|remove (?:a|an|x|\d+)[^.]{0,20}\+1\/\+1 counter/, hard: true},
    {role: "creatures",   when: re("creatures you control get|whenever (?:another )?creature you control|sacrifice (?:a|an|another|two|three|x|\\d+) " + SAC_NOUN + "\\b|(?:for each|equal to the number of|number of) creatures? you control"), hard: true},
    {role: "artifacts",   when: /(?:for each|number of) artifacts? you control|whenever (?:another )?artifact (?:you control )?enters|sacrifice (?:a|an|another) artifacts?\b|artifacts you control get/, hard: true},
    {role: "graveyard",   when: /return target[^.]{0,40}from your graveyard|(?:for each|number of) [^.]{0,30}in your graveyard|(?:cast|play)[^.]{0,50}from your graveyard/, hard: true},
    {role: "lands",       when: /landfall|(?:for each|number of) lands? you control|lands you control have/, hard: true},
    {role: "instants",    when: /(?:for each|number of) instant|whenever you cast (?:an )?instant/, hard: true}
  ];

  // Supply roles. REQUIRES names these, so they must exist on the FILLS side too --
  // a demand vocabulary with no matching supply vocabulary reports every payoff as
  // unsatisfied, which is worse than not checking at all.
  var SUPPLY_ROLES = [
    {id: "creatures", test: function (tl) { return /Creature/.test(tl); }},
    {id: "artifacts", test: function (tl) { return /Artifact/.test(tl); }},
    {id: "lands",     test: function (tl) { return /Land/.test(tl); }},
    {id: "instants",  test: function (tl) { return /Instant/.test(tl); }}
  ];
  /* A sac outlet is any "sacrifice a <thing>:" cost whose thing can be a creature --
     "sacrifice a creature", "sacrifice a goblin", "sacrifice another artifact". Lands,
     cards and spells are excluded; "sacrifice this creature" is a card eating itself,
     not an outlet. The old pattern named four nouns and so missed every tribal outlet,
     Skirk Prospector first among them. */
  var SAC_OUTLET = "sacrifice (?:a|an|another|two|three|x|\\d+) (?!lands?\\b|enchantments?\\b|cards?\\b|spells?\\b)(?:[a-z-]+ )?[a-z-]+s?[^:\\n.]{0,30}:";
  var SUPPLY_TEXT = [
    {id: "counters",  re: re("puts? " + NUM + "[^.]{0,30}\\+1\\/\\+1 counters?|" + COUNTER_KEYWORDS)},
    {id: "graveyard", re: /mills? (?:\d+|x|that many)|discards? (?:a|your|two|three|x|\d+)|put (?:the )?top (?:\d+|x) cards[^.]{0,30}graveyard|surveil/},
    {id: "sac-outlet",re: re(SAC_OUTLET)}
  ];

  var ROLE_PATTERNS = [
    /* Ramp is mana or lands ARRIVING: a rock, a dork, a land put onto the battlefield, a
       Treasure. A land tutored to HAND is a tutor, not ramp, and was counted as ramp
       until the audit. */
    {id: "ramp",       re: re("\\{t\\}: add|add \\{[wubrgc]\\}|adds? (?:one|two|three|four|x|\\d+) (?:additional )?mana|add an amount of|" + LAND_SEARCH + "|you may play an additional land|" + LAND_PUT + "|" + TREASURE)},
    {id: "draw",       re: re("draws? " + NUM + " cards?|draws? that many cards|draws? cards? equal|draws? (?:an|two|x) additional cards?")},
    {id: "removal",    re: /destroy target|exile target (?:creature|permanent|artifact|enchantment|planeswalker|nonland|attacking|blocking|tapped)|deals? (?:\d+|x|that much) damage to (?:target|any target)|fights? target|target creature gets -\d+\/-\d+/},
    {id: "wipe",       re: /destroy all|exile all|all creatures get [-−]|each player sacrifices|deals? (?:\d+|x) damage to each creature|destroy each/},
    /* Protection is a quality HANDED to your board or a spell that shields it. A creature
       that merely has hexproof protects nothing but itself, and "can't be countered" is
       not protection at all -- both counted before. */
    {id: "protection", re: /(?:gains?|has|have|get|gets|with) [^.]{0,30}\b(?:hexproof|indestructible|shroud|protection from|ward)|you have hexproof|counter target (?:spell|ability|activated|triggered)|prevent all (?:combat )?damage|regenerate (?:target|each|all|another)|phase out|can't be the target of|exile target (?:creature|permanent) you control[^.]{0,40}return/},
    {id: "recursion",  re: /return target .{0,40}from your graveyard|return .{0,30}from your graveyard to (?:the battlefield|your hand)|(?:cast|play)[^.]{0,50}from your graveyard|from your graveyard to the battlefield/},
    {id: "tutor",      re: /search your library for (?:a|an|up to \w+|any number of) (?:cards?|artifacts?|creatures?|enchantments?|instants?|sorcer(?:y|ies)|permanents?|planeswalkers?|legendary|nonland|[a-z]+ cards?)/},
    {id: "sac-outlet", re: re(SAC_OUTLET)},
    /* A finisher ends the game: you win, they lose, extra combats, or a drain that SCALES --
       "loses X life", "loses that much life", "life equal to". A flat "each opponent loses
       1 life" per trigger is an engine's exhaust, not a finisher, and 48 aristocrats
       pieces carried the role until the audit. */
    {id: "finisher",   re: /you win the game|loses the game|(?:each|target) (?:opponent|player) loses (?:x|half|that much|life equal|(?:[5-9]|\d{2,}) life)|deals? (?:x|that much) damage to each (?:opponent|player)|extra combat phase/}
  ];

  /* --- THE OTHER HALF OF "CREATE" ------------------------------------------
   *
   * Everything above answers "what does this card make, need, fire on and cause".
   * Nothing above answers "what does this card make MORE OF". A token maker and a
   * token doubler are the tightest pair in Commander and the graph could not see it,
   * because both sides were only ever matched on words they had in common.
   *
   * The ids here are deliberately the SAME ids EVENTS and RESOURCES use, so the join
   * is an exact intersection rather than a fuzzy one: Krenko PRODUCES token, Parallel
   * Lives MULTIPLIES token, and the edge writes itself. A doubler of a TRIGGER names
   * the event it doubles (Panharmonicon multiplies creature-etb), which pairs it with
   * whatever CAUSES that event.
   *
   * Written narrowly on purpose. "double" and "twice" appear in plenty of rules text
   * that compounds nothing ("double strike", "twice each turn"), so every pattern
   * names the thing being multiplied as well as the multiplying. A missed doubler
   * costs one edge; a wrong one puts a lie on the canvas. */
  var MULTIPLIERS = [
    {id: "token",       re: /(?:twice|double) that many[^.]{0,40}tokens?|creates? twice that many|if (?:one or more|an?)[^.]{0,25}tokens? would be created[^.]{0,80}(?:twice|plus|instead)|if an effect would create[^.]{0,60}tokens?[^.]{0,60}(?:twice|instead)|populate|creates? that many plus/},
    /* Hardened Scales is "if one or more +1/+1 counters would be put on"; the first
       pattern wanted the word "counters" right after "one or more" and missed it. */
    {id: "counter",     re: /proliferate|(?:twice|double) that many[^.]{0,40}counters?|if (?:one or more )?[^.]{0,25}counters? would be (?:put|placed)[^.]{0,90}(?:twice|plus|instead)|if an effect would put[^.]{0,50}counters?[^.]{0,70}(?:twice|instead)|double the number of[^.]{0,40}counters?/},
    {id: "mana",        re: /if you tap a[^.]{0,40}for mana[^.]{0,40}produces (?:twice|three times|double)|would produce[^.]{0,30}mana[^.]{0,40}(?:twice|three times|instead)|produces? (?:twice|three times) (?:as much|that much)|whenever you tap a[^.]{0,30}for mana, add an additional|adds? an additional \{|double the amount of[^.]{0,20}mana/},
    {id: "treasure",    re: /(?:twice|double) that many[^.]{0,30}treasure|if (?:one or more )?treasure tokens? would be created[^.]{0,70}(?:twice|plus|instead)/},
    {id: "card",        re: /draws? an additional card|if you would draw a card[^.]{0,110}(?:draw two cards instead|instead|additional)|draws? twice that many cards/},
    {id: "life",        re: /if you would gain life[^.]{0,60}(?:twice|instead|plus)|gains? twice that much life|double (?:your|that player's) life total/},
    {id: "life-loss",   re: /would deal (?:combat )?damage[^.]{0,70}(?:deals? (?:twice|double|triple) that|deals? that much damage plus \d+|instead deals? (?:twice|double|triple))|deals? (?:double|triple) that (?:much|damage)/},
    /* THE TRIGGER DOUBLERS. Their wording moved with the 2024 templating -- "a creature
       entering", not "entering the battlefield" -- and the generic ones name no event at
       all ("if a triggered ability of a Shaman you control triggers"). That last shape
       gets its own id, "trigger", which pairs with any card that has a trigger to double. */
    {id: "creature-etb",  re: /if (?:an? )?(?:artifact|creature|permanent|token)[^.]{0,50}entering[^.]{0,70}causes a triggered ability[^.]{0,90}triggers an additional time/},
    {id: "land-drop",     re: /if (?:an? )?(?:land|permanent)[^.]{0,50}entering[^.]{0,70}causes a triggered ability[^.]{0,90}triggers an additional time|you may play (?:an|two) additional lands?/},
    {id: "creature-dies", re: /if (?:an? )?(?:creature|permanent)[^.]{0,40}dying causes a triggered ability[^.]{0,90}triggers an additional time/},
    {id: "attack",        re: /if (?:an? )?creature attacking causes a triggered ability[^.]{0,90}triggers an additional time|additional combat phase/},
    {id: "combat-begin",  re: /additional combat phase/},
    {id: "trigger",       re: /if a triggered ability of[^.]{0,90}triggers, that ability triggers an additional time/}
  ];

  /* --- WHAT A CARD HANDS OUT, AND WHAT WIDENS IT ---------------------------
   *
   * GRANTS is the quality a card gives to a permanent -- the shield, not the body.
   * A creature that merely HAS flying grants nothing, so every pattern requires the
   * giving verb: gains, has, have, gets. That is the whole difference between an
   * evasive creature and a card that makes your board evasive.
   *
   * EXTENDS is the card that widens one of those across the whole board, either by
   * naming the team ("creatures you control gain indestructible", "demons you control
   * have menace", "all creatures have haste") or by copying whatever qualities are
   * already there ("creatures you control gain each of those abilities" -- the Odric
   * line). "keywords" is the id for the copiers, which cannot name in advance what they
   * will be spreading. */
  var QUALITIES = [
    {id: "hexproof",      re: /hexproof/},
    {id: "indestructible",re: /indestructible/},
    {id: "ward",          re: /ward\b/},
    {id: "protection",    re: /protection from/},
    {id: "shroud",        re: /shroud/},
    {id: "unblockable",   re: /can't be blocked/},
    {id: "flying",        re: /flying/},
    {id: "trample",       re: /trample/},
    {id: "haste",         re: /haste/},
    {id: "lifelink",      re: /lifelink/},
    {id: "deathtouch",    re: /deathtouch/},
    {id: "vigilance",     re: /vigilance/},
    {id: "double-strike", re: /double strike/},
    {id: "first-strike",  re: /first strike/},
    {id: "reach",         re: /reach/},
    {id: "menace",        re: /menace/}
  ];
  /* The window after the verb is short on purpose. "You gain 1 life for each creature you
     control with flying" has both a giving verb and a quality in it and gives nothing;
     thirty characters is the difference between "gains flying" and that sentence. */
  var GRANT_VERB = "(?:gains?|has|have|get|gets)";
  var TEAM = "creatures you control|permanents you control|artifacts you control|creature tokens you control|your creatures|each (?:other )?creature you control|all creatures you control|all creatures|(?:other |attacking |nontoken )?[a-z]+s you control";
  var COPIES_ABILITIES = /gains? each of those abilities|gains? all abilities|have all (?:activated )?abilities|gains? the abilities of|have (?:each of )?those (?:keyword )?abilities|the same is true for/;

  /* --- WHAT A CARD IS, AND WHAT IT IS FOR -----------------------------------
   *
   * TRIBES is read off the type line, one creature face at a time. It used to split
   * the whole line on spaces, so a two-faced card's back face contributed "//",
   * "Legendary" and "Creature" as tribes, an Artifact Creature // Land carried
   * "Land", and "Time Lord" -- the one two-word creature type in the game -- arrived
   * as a Time and a Lord. 161 cards in the shipped bake had a type word filed as a
   * tribe; the Filters pane offered "//" as one.
   *
   * WANTS is the tribe a card is a PAYOFF for -- "Goblins you control get +1/+1",
   * "sacrifice a Goblin", "for each Elf", "another Elemental you control". Oracle
   * text capitalises subtypes and nothing else, which is what makes this readable at
   * all: after "another", "each", "target" or before "creature", a capitalised word
   * is a subtype or it is nothing. The land and artifact subtypes are stopped by
   * name; a caller that knows the real creature-type vocabulary (the bake does, the
   * page has the facet) passes it as opts.tribes and anything outside it is dropped.
   * This is the join the graph could not draw before: Krenko and Goblin Chieftain
   * share no event, no resource and no quality, and were strangers on the canvas. */
  /* --- WHAT A BODY IS FOR ---------------------------------------------------
   *
   * The model had no notion of a creature's STATS, so a deck built on toughness read as
   * ninety strangers: Felothar assigns combat damage by toughness and eats creatures for
   * cards equal to toughness, and every wall in the deck was joined to him only as a
   * generic body for his sac outlet. The two sides here are different in kind and are
   * read differently, which is the whole point.
   *
   * WANTS is a payoff, read off rules text: "equal to its toughness", "total power",
   * "toughness 4 or greater", "as though they didn't have defender". 178 cards in the
   * format care about toughness and 663 about power.
   *
   * OFFERS is a body, read off the printed numbers rather than any words -- a creature
   * whose toughness is 4 or more AND at least two above its power is a wall in all but
   * name, and a Defender or a Wall is one by type. Nothing in the rules text says so,
   * which is exactly why no text pattern could ever have found it. */
  var STAT_WANTS = [
    {id: "toughness", re: /equal to (?:its|their|that creature's|this creature's|the sacrificed creature's) toughness|(?:total|combined|greatest) toughness|toughness (?:\d+|x) or (?:greater|more|higher)|assigns? combat damage equal to (?:its|their) toughness|toughness (?:is )?greater than (?:its|their) power|as though (?:it|they) didn't have defender|creatures? (?:you control )?with defender|with defender you control/},
    {id: "power",     re: /equal to (?:its|their|that creature's|this creature's|the sacrificed creature's) power|(?:total|combined|greatest) power|power (?:\d+|x) or (?:greater|more|higher)/}
  ];
  var STAT_FLOOR = 4, STAT_GAP = 2;

  var TYPE_WORDS = /^(?:Legendary|Basic|Snow|World|Ongoing|Host|Token|Creature|Artifact|Enchantment|Land|Instant|Sorcery|Planeswalker|Battle|Kindred|Tribal|\/\/)$/;
  /* Dryad Arbor is "Land Creature — Forest Dryad": the land type shares the subtype
     slot with the creature type, and only one of them is a tribe. */
  var SUBTYPE_NOT_TRIBE = /^(?:Plains|Island|Swamp|Mountain|Forest|Desert|Gate|Lair|Locus|Mine|Power-Plant|Tower|Urza's|Cave|Sphere|Cloud|Wastes|Equipment|Vehicle|Aura|Saga|Food|Treasure|Clue|Blood|Map|Powerstone|Gold|Junk|Incubator|Fortification|Shrine|Background|Class|Case|Role|Room|Attraction|Contraption|Curse|Cartouche|Rune|Shard|Lesson|Adventure|Arcane|Trap|Omen|Bobblehead)$/;
  var NOT_A_TRIBE = /^(?:Treasure|Food|Clue|Blood|Map|Powerstone|Gold|Junk|Incubator|Aura|Equipment|Vehicle|Fortification|Saga|Shrine|Cartouche|Rune|Curse|Background|Class|Case|Role|Shard|Room|Lesson|Adventure|Arcane|Trap|Omen|Plains|Island|Swamp|Mountain|Forest|Wastes|Gate|Desert|Cave|Lair|Locus|Mine|Tower|Sphere|Cloud|Urza's|Power-Plant|Siege|Attraction|Contraption|Bobblehead|Phenomenon|Plane|Scheme|Vanguard|Conspiracy|Dungeon|Monarch|Initiative|Ring|Day|Night|Commander|Legend|Legendary|Equip|Enchant|Creature|Artifact|Enchantment|Land|Planeswalker|Instant|Sorcery|Battle|Token|Permanent|Spell|Card|Ability|Emblem|Counter|Mana|Life|Turn|Combat|Target|Each|Another|Other|Whenever|When|If|At|Then|Until|Instead|Choose|Create|Return|Put|Exile|Destroy|Sacrifice|Search|Draw|Add|Tap|Untap|Look|Reveal|Shuffle|Activate|Cast|Play|Attach|Counter|You|Your|Their|Its|The|This|That|These|Those|Any|All|No|Up|X|Y|Z|Cipher|Copy|Flip|Roll|Scry|Surveil|Mill|Goad|Vote|Council's|Will|Bolster|Support|Amass|Populate|Investigate|Proliferate|Adapt|Monstrosity|Level|Landfall|Battalion|Metalcraft|Threshold|Delirium|Revolt|Morbid|Ferocious|Undergrowth|Constellation|Domain|Hellbent|Heroic|Kinship|Radiance|Fateful|Adamant|Magecraft|Coven|Alliance|Pack|Party|Outlaw|Historic|Modified|Legendaries|Sagas|Gates|Deserts|Caves|Spheres|Lairs|Treasures|Foods|Clues|Bloods|Maps|Powerstones|Golds|Junks|Incubators|Auras|Vehicles|Fortifications|Shrines|Cartouches|Runes|Curses|Backgrounds|Classes|Cases|Roles|Shards|Rooms|Lessons|Adventures|Traps|Omens)$/;
  var WANT_CONTEXTS = [
    /\b([A-Z][a-z]+(?: Lord)?)s (?:you control|you own|your opponents control|an opponent controls)/g,
    /\b(?:another|other|each|each other|target|nontoken|all|sacrifice an?|sacrifice another|a|an|an? nontoken|any number of|one or more|up to \w+|x) ([A-Z][a-z]+(?: Lord)?)s?\b(?! (?:named|creature token|token))/g,
    /\b([A-Z][a-z]+(?: Lord)?) (?:spells?|cards?|permanents?)\b/g,
    /\b([A-Z][a-z]+(?: Lord)?) creatures?\b(?! tokens?)/g,
    /\bfor each ([A-Z][a-z]+(?: Lord)?)\b/g,
    /\b(?:is|are|becomes?|it's|they're) (?:a |an |also a |also an )?([A-Z][a-z]+(?: Lord)?)\b(?! (?:with|until|instead|token))/g
  ];
  /* MAKES is the tribe of the tokens a card creates -- Krenko makes Goblins, Sporemound
     makes Saprolings -- which is the supply side of the tribal join: Slimefoot pays off
     Saprolings, and nothing on any type line says so. */
  var MAKE_CONTEXTS = [
    /\b([A-Z][a-z]+(?: Lord)?) (?:creature |artifact creature |enchantment creature )?tokens?\b/g,
    /\bamass ([A-Z][a-z]+)/g
  ];

  function stripReminder(t) {
    return String(t || "").replace(/\([^()]*\)/g, " ").replace(/[ \t]{2,}/g, " ");
  }

  /* The text a classifier reads: both faces of a two-faced card, reminder text gone. A
     single face would silently drop half of every modal double-faced card's abilities,
     and the graph would call a land a land and nothing else. rawText keeps the case,
     which the tribe reader needs; rulesText lowers it for everything else. */
  function rawText(card) {
    var faces = (card && card.cardFaces) || (card && card.card_faces) || [];
    var raw = (card && (card.oracleText || card.oracle_text));
    if (!raw) {
      raw = faces.map(function (f) { return f.oracleText || f.oracle_text || ""; }).join("\n");
    }
    return stripReminder(raw);
  }
  function rulesText(card) { return rawText(card).toLowerCase(); }

  function push(list, value) { if (list.indexOf(value) < 0) list.push(value); }

  /* The creature types on a type line, one face at a time, creature faces only. */
  function tribesOf(typeLine) {
    var out = [];
    String(typeLine || "").split(" // ").forEach(function (face) {
      var halves = face.split("—");
      if (!/\bCreature\b/.test(halves[0])) return;
      var sub = (halves[1] || "").trim().replace(/\bTime Lord\b/g, "Time_Lord");
      sub.split(/\s+/).filter(Boolean).forEach(function (t) {
        if (!TYPE_WORDS.test(t) && !SUBTYPE_NOT_TRIBE.test(t)) push(out, t.replace("_", " "));
      });
    });
    return out;
  }

  /* The stats a creature OFFERS a payoff. A power or toughness printed as * is not a
     number and is skipped rather than guessed at. */
  function statsOf(card) {
    var typeLine = String((card && (card.typeLine || card.type_line || card.type)) || "");
    var out = [];
    if (!/\bCreature\b/.test(typeLine)) return out;
    var p = Number(card && card.power), t = Number(card && card.toughness);
    var keywords = ((card && card.keywords) || []).map(function (k) { return String(k).toLowerCase(); });
    var defends = keywords.indexOf("defender") >= 0 || /\bWall\b/.test(typeLine);
    if (defends || (isFinite(t) && isFinite(p) && t >= STAT_FLOOR && t >= p + STAT_GAP)) push(out, "toughness");
    if (isFinite(p) && isFinite(t) && p >= STAT_FLOOR && p >= t + STAT_GAP) push(out, "power");
    return out;
  }

  function toSet(v) {
    if (!v) return null;
    if (v instanceof Set) return v;
    if (Array.isArray(v)) return new Set(v);
    return new Set(Object.keys(v));
  }

  /* The tribes a card's text names as something it counts, buffs or sacrifices. */
  function wantsOf(text, allow) { return namedTribes(WANT_CONTEXTS, text, allow); }
  /* The tribes of the tokens a card's text creates. */
  function makesOf(text, allow) { return namedTribes(MAKE_CONTEXTS, text, allow); }
  function namedTribes(contexts, text, allow) {
    var out = [];
    contexts.forEach(function (ctx) {
      ctx.lastIndex = 0;
      var m;
      while ((m = ctx.exec(text))) {
        var w = m[1];
        if (NOT_A_TRIBE.test(w)) continue;
        if (allow && !allow.has(w)) continue;
        push(out, w);
      }
    });
    return out;
  }

  /**
   * One card in, the fields data/graph.json carries out.
   *
   * Takes whatever a card record calls its fields -- Scryfall's snake_case straight off
   * the API, or the app's own camelCase -- because the two callers hold the card in
   * different hands and neither should have to translate before asking.
   *
   * opts.tribes, when given, is the creature-type vocabulary WANTS may name -- a Set,
   * an array, or an object keyed by type. Without it the stoplist alone decides.
   */
  /* A legendary card names itself -- "whenever haliya enters or attacks", "purphoros deals
     2 damage" -- and the short name is a word the listeners cannot tell from a creature
     noun. Scryfall already writes "this creature" on most cards; this finishes the job for
     the ones that still carry a name, so a self-trigger never reads as a listener. */
  function selfless(text, card) {
    var names = [];
    var full = String((card && card.name) || "").trim();
    if (full) {
      full.split(" // ").forEach(function (face) {
        names.push(face);
        var short = face.split(",")[0].trim();
        if (short && short !== face && short.split(" ").length <= 3) names.push(short);
      });
    }
    ((card && (card.cardFaces || card.card_faces)) || []).forEach(function (f) { if (f && f.name) names.push(String(f.name)); });
    var out = text;
    names.map(function (n) { return n.toLowerCase(); })
      .sort(function (a, b) { return b.length - a.length; })
      .forEach(function (n) {
        if (n.length < 3 || /^(?:the|a|an)$/.test(n)) return;
        var esc = n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        out = out.replace(new RegExp("\\b" + esc + "\\b", "g"), "this creature");
      });
    return out;
  }

  function classify(card, opts) {
    var typeLine = String((card && (card.typeLine || card.type_line || card.type)) || "");
    var raw = rawText(card);
    var text = selfless(raw.toLowerCase(), card);
    var isLand = /\bLand\b/.test(typeLine);
    var allow = toSet(opts && opts.tribes);
    var out = {roles: [], requires: [], causes: [], triggers: [], produces: [], consumes: [],
               multiplies: [], grants: [], extends: [], mechanics: [], tribes: [], wants: [], makes: [],
               wantsStat: [], offersStat: []};

    // A trigger doubler listens to whatever it doubles, so it reads as a co-payoff.
    var doublesEtb = /entering the battlefield causes a triggered ability[^.]{0,60}to trigger|triggers? an additional time/.test(text);
    if (doublesEtb) {
      if (/creature|permanent/.test(text)) push(out.triggers, "creature-etb");
      if (/land/.test(text)) push(out.triggers, "land-drop");
    }
    EVENTS.forEach(function (e) {
      if (e.listen && e.listen.test(text)) push(out.triggers, e.id);
      if (e.cause && e.cause.test(text)) push(out.causes, e.id);
      if (e.causeType && !isLand && e.causeType.test(typeLine)) push(out.causes, e.id);
    });
    RESOURCES.forEach(function (r) {
      if (r.produce && r.produce.test(text)) push(out.produces, r.id);
      if (r.consume && r.consume.test(text)) push(out.consumes, r.id);
    });
    REQUIRES.forEach(function (q) { if (q.when.test(text)) push(out.requires, q.role); });
    MULTIPLIERS.forEach(function (m) { if (m.re.test(text)) push(out.multiplies, m.id); });
    /* A quality only counts as GRANTED when a verb hands it over -- "gains hexproof",
       "creatures you control have flying". A flier that simply flies grants nothing, and
       reading its own keyword as a grant would make every evasive creature a protector. */
    QUALITIES.forEach(function (q) {
      var body = q.re.source;
      if (new RegExp(GRANT_VERB + "\\b[^.]{0,30}\\b(?:" + body + ")").test(text)) push(out.grants, q.id);
      if (new RegExp("(?:" + TEAM + ")[^.]{0,25}" + GRANT_VERB + "\\b[^.]{0,60}\\b(?:" + body + ")").test(text)) { push(out.grants, q.id); push(out.extends, q.id); }
    });
    if (COPIES_ABILITIES.test(text)) push(out.extends, "keywords");
    ROLE_PATTERNS.forEach(function (r) { if (!isLand && r.re.test(text)) push(out.roles, r.id); });
    SUPPLY_ROLES.forEach(function (r) { if (r.test(typeLine)) push(out.roles, r.id); });
    SUPPLY_TEXT.forEach(function (r) { if (r.re.test(text)) push(out.roles, r.id); });
    ((card && card.keywords) || []).forEach(function (k) { push(out.mechanics, String(k).toLowerCase()); });
    tribesOf(typeLine).forEach(function (t) { push(out.tribes, t); });
    wantsOf(raw, allow).forEach(function (t) { push(out.wants, t); });
    makesOf(raw, allow).forEach(function (t) { push(out.makes, t); });
    STAT_WANTS.forEach(function (q) { if (q.re.test(text)) push(out.wantsStat, q.id); });
    statsOf(card).forEach(function (t) { push(out.offersStat, t); });
    return out;
  }

  /* The rate and strength the CSV bake carries alongside the plain edge. graph.json drops
     both, so the page never needs them -- but 02-build-csv.mjs does, and it must not keep
     a second copy of the patterns to get at them. */
  function edgeDetail(card) {
    var text = rulesText(card);
    return {
      causeRate: /whenever|at the beginning/.test(text) ? "repeatable" : "once",
      triggersYoursOnly: /you control/.test(text) ? "true" : "false",
      requireStrength: function (role) {
        var found = REQUIRES.filter(function (q) { return q.role === role; })[0];
        return found && found.hard ? "hard" : "soft";
      }
    };
  }

  return {
    EVENTS: EVENTS, RESOURCES: RESOURCES, REQUIRES: REQUIRES,
    SUPPLY_ROLES: SUPPLY_ROLES, SUPPLY_TEXT: SUPPLY_TEXT, ROLE_PATTERNS: ROLE_PATTERNS,
    MULTIPLIERS: MULTIPLIERS, QUALITIES: QUALITIES, STAT_WANTS: STAT_WANTS,
    stripReminder: stripReminder, rulesText: rulesText, rawText: rawText,
    tribesOf: tribesOf, wantsOf: wantsOf, makesOf: makesOf, statsOf: statsOf,
    classify: classify, edgeDetail: edgeDetail
  };
});
