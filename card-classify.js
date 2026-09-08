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
 * Pure. No DOM, no storage, no fetch.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.MtgCardClassify = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  // --- the event vocabulary -------------------------------------------------
  // Each entry: the event id, what a card that LISTENS for it says, and what a card
  // that CAUSES it says. Keeping both sides in one table is what keeps them aligned.
  var EVENTS = [
    {id: "creature-etb",   listen: /whenever (?:another )?(?:a |one or more )?creatures?[^.]{0,40}enters/,
                           cause:  /create (?:a|an|one|two|three|four|x|\d+)[^.]{0,60}creature tokens?|put (?:a|an|two|\d+)[^.]{0,40}creature[^.]{0,20}onto the battlefield|exile [^.]{0,50}(?:then )?returns? (?:it|them|that card|those cards) to the battlefield|returns? (?:it|them|that card) to the battlefield under (?:its|their) owner/},
    {id: "land-drop",      listen: /landfall|whenever a land (?:you control )?enters/,
                           cause:  /you may play an additional land|put (?:a|that) land(?: card)? onto the battlefield|search your library for a[^.]{0,50}land[^.]{0,40}onto the battlefield/},
    {id: "creature-dies",  listen: /whenever (?:another |a |the )?(?:equipped |enchanted |target |nontoken )?creature(?:s)? (?:you control )?(?:dies|die)/,
                           cause:  /sacrifice (?:a|an|another|two|\d+) creature|destroy target creature|deals? \d+ damage to target creature/},
    {id: "attack",         listen: /whenever [^.]{0,40}attacks/,
                           cause:  /must be blocked|attacks? each combat if able|goad/},
    {id: "combat-begin",   listen: /at the beginning of combat/, cause: /additional combat phase|untap all creatures you control/},
    {id: "end-step",       listen: /at the beginning of (?:your |each )?end step/, cause: null},
    {id: "upkeep",         listen: /at the beginning of (?:your |each )?upkeep/, cause: null},
    {id: "cast-spell",     listen: /whenever you cast (?:a|an|your)/, cause: null},
    {id: "proliferate",    listen: /proliferate/,
                           cause:  /put (?:a|an|one|two|three|x|\d+)[^.]{0,40}counters? on|enters with (?:a|an|one|two|three|x|\d+)[^.]{0,30}counters?/},
    {id: "counter-placed", listen: /whenever (?:one or more )?\+1\/\+1 counters? (?:is|are) put/,
                           cause:  /put (?:a|an|one|two|three|x|\d+)[^.]{0,30}\+1\/\+1 counters?/},
    {id: "life-gain",      listen: /whenever you gain life/, cause: /you gain \d+ life|gain (?:that much|x) life|lifelink/},
    {id: "life-loss",      listen: /whenever (?:an? )?opponent loses life/, cause: /each opponent loses \d+ life|target player loses \d+ life/},
    {id: "draw-card",      listen: /whenever you draw/, cause: /draw (?:a|one|two|three|x|\d+) cards?/},
    {id: "sacrifice",      listen: /whenever you sacrifice/, cause: /sacrifice (?:a|an|another)[^:\n]{0,40}:/},
    {id: "graveyard-entry",listen: /whenever (?:a|one or more) [^.]{0,30}(?:card |permanent )?(?:is put into|enters) (?:your |a )?graveyard/,
                           cause:  /mill \d+|discard (?:a|your|\d+)|put (?:the )?top \d+ cards[^.]{0,30}graveyard/}
  ];

  var RESOURCES = [
    {id: "mana",     produce: /\{t\}: add|add \{[wubrgc]\}|add (?:one|two|three|x|\d+) mana/, consume: null},
    {id: "treasure", produce: /create (?:a|an|one|two|three|x|\d+)[^.]{0,30}treasure/, consume: /sacrifice[^.]{0,20}treasure/},
    {id: "card",     produce: /draw (?:a|one|two|three|x|\d+) cards?/, consume: /discard (?:a|your|two|\d+)/},
    {id: "life",     produce: /you gain \d+ life|gain (?:that much|x) life/, consume: /you lose \d+ life|pay \d+ life/},
    {id: "counter",  produce: /put (?:a|an|one|two|three|x|\d+)[^.]{0,30}\+1\/\+1 counters?/, consume: /remove (?:a|an|one|two|x|\d+)[^.]{0,30}counters?/},
    {id: "token",    produce: /create (?:a|an|one|two|three|x|\d+)[^.]{0,60}token/, consume: null}
  ];

  // A card that says "sacrifice a creature" needs bodies; one that pays off counters
  // needs a source of counters. These are the REQUIRES edges -- the demand side.
  var REQUIRES = [
    {role: "sac-outlet",  when: /sacrifice (?:a|an|another) (?:creature|permanent|token|artifact)/, hard: false},
    {role: "counters",    when: /(?:for each|equal to the number of)[^.]{0,40}\+1\/\+1 counter|remove (?:a|an|x|\d+)[^.]{0,20}\+1\/\+1 counter/, hard: true},
    {role: "creatures",   when: /creatures you control get|whenever (?:another )?creature you control/, hard: true},
    {role: "artifacts",   when: /(?:for each|number of) artifacts? you control|whenever (?:another )?artifact (?:you control )?enters/, hard: true},
    {role: "graveyard",   when: /return target[^.]{0,40}from your graveyard|(?:for each|number of) [^.]{0,30}in your graveyard/, hard: true},
    {role: "lands",       when: /landfall|(?:for each|number of) lands? you control/, hard: true},
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
  var SUPPLY_TEXT = [
    {id: "counters",  re: /put (?:a|an|one|two|three|x|\d+)[^.]{0,30}\+1\/\+1 counters?/},
    {id: "graveyard", re: /mill \d+|discard (?:a|your|\d+)|put (?:the )?top \d+ cards[^.]{0,30}graveyard/},
    {id: "sac-outlet",re: /sacrifice (?:a|an|another) (?:creature|permanent|token|artifact)[^:\n]{0,40}:/}
  ];

  var ROLE_PATTERNS = [
    {id: "ramp",       re: /\{t\}: add|add \{[wubrgc]\}|search your library for a[^.]{0,50}land|you may play an additional land/},
    {id: "draw",       re: /draw (?:a|one|two|three|x|\d+) cards?|draws? that many cards/},
    {id: "removal",    re: /destroy target|exile target (?:creature|permanent|artifact|enchantment|planeswalker)|deals? \d+ damage to (?:target|any target)|fights? target/},
    {id: "wipe",       re: /destroy all|exile all|all creatures get [-−]|each player sacrifices/},
    {id: "protection", re: /hexproof|indestructible|protection from|counter target spell|prevent all damage|can't be countered/},
    {id: "recursion",  re: /return target .{0,40}from your graveyard|return .{0,30}from your graveyard to (?:the battlefield|your hand)/},
    {id: "tutor",      re: /search your library for an? (?:card|artifact|creature|enchantment|instant|sorcery|permanent)/},
    {id: "sac-outlet", re: /sacrifice (?:a|an|another) (?:creature|permanent|token|artifact)[^:\n]{0,40}:/},
    {id: "finisher",   re: /you win the game|each opponent loses \d+ life|extra combat phase/}
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
    {id: "token",       re: /(?:twice|double) that many[^.]{0,40}tokens?|creates? twice that many|if (?:one or more|an?) tokens? would be created[^.]{0,80}(?:twice|plus|instead)|if an effect would create[^.]{0,60}tokens?[^.]{0,60}(?:twice|instead)|populate|creates? that many plus/},
    {id: "counter",     re: /proliferate|(?:twice|double) that many[^.]{0,40}counters?|if (?:one or more )?counters? would be (?:put|placed)[^.]{0,90}(?:twice|plus|instead)|if an effect would put[^.]{0,50}counters?[^.]{0,70}(?:twice|instead)|double the number of[^.]{0,40}counters?/},
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
   * naming the team ("creatures you control gain indestructible") or by copying
   * whatever qualities are already there ("creatures you control gain each of those
   * abilities" -- the Odric line). "keywords" is the id for the copiers, which cannot
   * name in advance what they will be spreading. */
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
  var TEAM = "creatures you control|permanents you control|artifacts you control|creature tokens you control|your creatures|each (?:other )?creature you control|all creatures you control";
  var COPIES_ABILITIES = /gains? each of those abilities|gains? all abilities|have all (?:activated )?abilities|gains? the abilities of|have (?:each of )?those (?:keyword )?abilities/;

  function stripReminder(t) {
    return String(t || "").replace(/\([^()]*\)/g, " ").replace(/[ \t]{2,}/g, " ");
  }

  /* The text a classifier reads: both faces of a two-faced card, reminder text gone,
     lower-cased. A single face would silently drop half of every modal double-faced
     card's abilities, and the graph would call a land a land and nothing else. */
  function rulesText(card) {
    var faces = (card && card.cardFaces) || (card && card.card_faces) || [];
    var raw = (card && (card.oracleText || card.oracle_text));
    if (!raw) {
      raw = faces.map(function (f) { return f.oracleText || f.oracle_text || ""; }).join("\n");
    }
    return stripReminder(raw).toLowerCase();
  }

  function push(list, value) { if (list.indexOf(value) < 0) list.push(value); }

  /**
   * One card in, the seven fields data/graph.json carries out.
   *
   * Takes whatever a card record calls its fields -- Scryfall's snake_case straight off
   * the API, or the app's own camelCase -- because the two callers hold the card in
   * different hands and neither should have to translate before asking.
   */
  function classify(card) {
    var typeLine = String((card && (card.typeLine || card.type_line || card.type)) || "");
    var text = rulesText(card);
    var isLand = /\bLand\b/.test(typeLine);
    var out = {roles: [], requires: [], causes: [], triggers: [], produces: [], consumes: [],
               multiplies: [], grants: [], extends: [], mechanics: [], tribes: []};

    // A trigger doubler listens to whatever it doubles, so it reads as a co-payoff.
    var doublesEtb = /entering the battlefield causes a triggered ability[^.]{0,60}to trigger|triggers? an additional time/.test(text);
    if (doublesEtb) {
      if (/creature|permanent/.test(text)) push(out.triggers, "creature-etb");
      if (/land/.test(text)) push(out.triggers, "land-drop");
    }
    EVENTS.forEach(function (e) {
      if (e.listen && e.listen.test(text)) push(out.triggers, e.id);
      if (e.cause && e.cause.test(text)) push(out.causes, e.id);
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
    var sub = (typeLine.split("—")[1] || "").trim();
    if (/Creature/.test(typeLine)) {
      sub.split(/\s+/).filter(Boolean).forEach(function (t) { push(out.tribes, t); });
    }
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
    MULTIPLIERS: MULTIPLIERS, QUALITIES: QUALITIES,
    stripReminder: stripReminder, rulesText: rulesText, classify: classify, edgeDetail: edgeDetail
  };
});
