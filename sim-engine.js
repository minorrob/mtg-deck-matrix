(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.MtgSimEngine = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  // A Monte Carlo model of a four-player Commander game, not a rules engine.
  // Every simplification lives in one of three places: classifyCard (what a card
  // does), playTurn (how it gets used), and the opponent profiles (what the table
  // does back). Results are only meaningful compared with each other — the same
  // deck under the same seeds before and after a swap — never as absolute odds.
  const SIMPLIFICATIONS = [
    "No stack: spells resolve when cast, and counterspells are modeled as generic interaction.",
    "No blocking assignment: combat damage is total attacking power weighted by a per-creature connect rate (higher for flying/menace/trample), and a board's damage reduction is weighted by total toughness plus a flat deathtouch/first-strike deterrence bonus, not a real block.",
    "+1/+1 counters model growth (enters-with, a source that adds more, a doubler, proliferate) but not storage or transfer -- a card that moves counters between permanents when something dies (The Ozolith) is treated as an ordinary permanent with no counter interaction.",
    "Proliferate is applied to every one of our own creatures that already carries a counter; the real choice of which permanents or players to target does not exist in this model.",
    "A repeatable counters or proliferate source (an activated ability, or a trigger) is assumed usable every turn from the turn it resolves onward, including that same turn.",
    "No politics: opponents never team up, and never target each other's threats instead of ours.",
    "Tutors draw the best of three random cards instead of choosing exactly.",
    "Tokens are modeled as extra power on the creature that makes them, not as separate bodies.",
    "Alternate win conditions and storm are scored as a large threat rather than an instant win.",
    "Mana fixing is ideal within the colors actually available from lands in play.",
    "A land that goes and gets a basic is modeled as entering tapped, because the basic it fetches arrives tapped; neither the mana some of them charge to crack nor the land itself being spent is modeled.",
    "Where a keyword states its real effect only in reminder text -- basic landcycling, investigate -- the card is credited with nothing for it, because reminder text is stripped before a card is read.",
    "A Defender creature contributes no attack power unless the deck also contains an effect that lets it attack anyway, and deals damage equal to its toughness instead of its power when the deck contains an effect that says so.",
    "A noncreature commander (a planeswalker printed with \"can be your commander\") is cast and taxed normally but never joins combat as an attacker or blocker.",
    "Opponents are nine parameterized archetype curves (three power tiers, six playstyles), not simulated decks with real cards.",
    "The fun/participation score is one reasonable operationalization of a subjective idea — a developed board and a game that didn't end suspiciously early either way — not a settled definition of \"fun.\""
  ];

  const DEFAULT_TARGETS = {
    screwPct: 0.1,
    floodPct: 0.08,
    interactionAvailability: 0.4,
    deadCardsAtT8: 2,
    commanderTurnAllowance: 1,
    winTurnMargin: 0.5
  };

  const DEFAULT_WEIGHTS = {
    winRate: 0.3,
    screw: 0.15,
    flood: 0.1,
    commander: 0.1,
    interaction: 0.1,
    clock: 0.1,
    deadCards: 0.05,
    fun: 0.1
  };

  const COLORS = ["W", "U", "B", "R", "G"];
  // The share of a seat's output aimed at us rather than at the other two seats.
  const AIMED_AT_US = 0.33;
  // How a sacrifice deck actually plays: you keep a few bodies back rather than
  // emptying the board, and one outlet only gets through so many creatures in a
  // turn before you run out of things worth eating.
  const SAC_KEEP_BACK = 3;
  const SAC_PER_OUTLET = 2;
  // A card off the top is worth more than a point of reach, less than a body.
  const DEATH_DRAW_VALUE = 1.5;
  const BASIC_COLOR = {Plains: "W", Island: "U", Swamp: "B", Mountain: "R", Forest: "G"};

  // How much of a creature's power actually connects when it attacks. There is no real block
  // assignment in this model (see SIMPLIFICATIONS), so this stands in for "how hard is this
  // creature to stop" -- flying and menace both make a creature meaningfully harder to block on
  // an ordinary board and are treated the same; trample gets some value through a block without
  // being fully unblockable, landing between the two. CONNECT_BASE (0.7) already existed as the
  // flat rate every creature used before this file modeled evasion at all.
  const CONNECT_BASE = 0.7;
  const CONNECT_EVASIVE = 0.85;
  const CONNECT_TRAMPLE = 0.78;
  const connectRateFor = (creature) => ((creature.hasFlying || creature.hasMenace) ? CONNECT_EVASIVE : creature.hasTrample ? CONNECT_TRAMPLE : CONNECT_BASE);
  // A modest bonus to a blocker's deterrent value, not a real combat-trick simulation: a
  // deathtouch blocker trades with anything regardless of its own toughness, and a first-strike
  // blocker often kills its attacker before taking damage back. Both fold into the same
  // toughness-weighted block-reduction estimate every creature already contributes to.
  const DEATHTOUCH_DETERRENCE = 2;
  const FIRST_STRIKE_DETERRENCE = 1;

  /* THE PILOT, WHEN THERE IS ONE. Everything below this line has always had
     exactly one answer for our side of the table -- one mulligan rule, one cast
     order, one attack target -- while the three opponents were nine parameterized
     archetypes sampled per seat. pilot-policy.js is the other half of that
     asymmetry, and it is deliberately OPTIONAL: with no config.policy nothing
     here is ever called, no module is loaded, and the run is the run this file
     has always produced. tests/pilot-policy.mjs fails if that stops being true. */
  let pilotModule;
  function pilot() {
    if (pilotModule !== undefined) return pilotModule;
    pilotModule = null;
    try {
      if (typeof module === "object" && module.exports && typeof require === "function") pilotModule = require("./pilot-policy.js");
      else if (typeof globalThis !== "undefined" && globalThis.MtgPilotPolicy) pilotModule = globalThis.MtgPilotPolicy;
    } catch (error) { pilotModule = null; }
    return pilotModule;
  }
  function pilotOrThrow() {
    const found = pilot();
    if (!found) throw new Error("A pilot policy was supplied but pilot-policy.js is not loaded");
    return found;
  }

  /* REAL COMBAT, WHEN IT IS ASKED FOR. Same contract as the pilot above: with no
     config.combat nothing here is called, no module is loaded, and the run is the
     arithmetic estimate this file has always produced. */
  let combatModule;
  function combat() {
    if (combatModule !== undefined) return combatModule;
    combatModule = null;
    try {
      if (typeof module === "object" && module.exports && typeof require === "function") combatModule = require("./combat.js");
      else if (typeof globalThis !== "undefined" && globalThis.MtgCombat) combatModule = globalThis.MtgCombat;
    } catch (error) { combatModule = null; }
    return combatModule;
  }
  function combatOrThrow() {
    const found = combat();
    if (!found) throw new Error("Board combat was asked for but combat.js is not loaded");
    return found;
  }

  function clamp01(value) {
    return Math.max(0, Math.min(1, Number(value) || 0));
  }

  function createRng(seed) {
    let state = (Number(seed) || 1) >>> 0;
    return function random() {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hashSeed(...parts) {
    let hash = 2166136261;
    const text = parts.join("|");
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function parseManaCost(manaCost) {
    const tokens = String(manaCost || "").match(/\{([^}]+)\}/g) || [];
    const pips = {W: 0, U: 0, B: 0, R: 0, G: 0};
    let generic = 0;
    let value = 0;
    tokens.forEach((token) => {
      const body = token.slice(1, -1).toUpperCase();
      if (/^\d+$/.test(body)) {
        generic += Number(body);
        value += Number(body);
        return;
      }
      if (body === "X" || body === "Y") return;
      const color = COLORS.find((entry) => body.includes(entry));
      if (color) pips[color] += 1;
      else generic += 1;
      value += 1;
    });
    return {pips, generic, value};
  }

  /* What the land taps for ITSELF, before any land it might go and get. Split out
     because "does this land make its own colour" is also the question that decides
     whether it is a fetch, and asking producedColors would get the fetch fallback's
     answer instead of the card's. */
  function ownProducedColors(card, typeLine, text) {
    const produced = new Set();
    if (BASIC_COLOR[card.name]) produced.add(BASIC_COLOR[card.name]);
    // Matches every symbol in the run right after "add" — not just the first —
    // so a real dual/triome land's "Add {R} or {W}." or "Add {B}, {G}, or {U}."
    // credits every color it actually produces, not only the first one.
    (text.match(/add\s+(?:\{[wubrgc]\}\s*(?:(?:,|or\b|and\b)\s*)*)+/g) || []).forEach((run) => {
      (run.match(/\{([wubrgc])\}/g) || []).forEach((token) => {
        const color = token.replace(/[^wubrgc]/g, "").toUpperCase();
        if (COLORS.includes(color)) produced.add(color);
      });
    });
    if (/add one mana of any color|add \{c\}\{c\}|any color/.test(text)) COLORS.forEach((color) => produced.add(color));
    return produced;
  }

  function producedColors(card, typeLine, text) {
    const produced = ownProducedColors(card, typeLine, text);
    // A land that goes and gets a basic makes whatever that basic makes. These
    // carry an empty color identity, so falling through to it left Evolving
    // Wilds, Terramorphic Expanse and Fabled Passage producing no color --
    // which flattered every swap that replaced one with a real dual.
    if (/\bLand\b/.test(typeLine) && !produced.size && PUTS_LAND_ONTO_BATTLEFIELD.test(text)) {
      const named = text.match(/\b(plains|island|swamp|mountain|forest)\b/g) || [];
      if (named.length) {
        named.forEach((word) => produced.add(BASIC_TYPE_COLOR[word]));
      } else {
        COLORS.forEach((color) => produced.add(color));
      }
    }
    if (/\bLand\b/.test(typeLine) && !produced.size) (card.colorIdentity || []).forEach((color) => produced.add(String(color).toUpperCase()));
    return Array.from(produced);
  }

  /* A LAND WHOSE ONLY COLOUR IS THE BASIC IT GOES AND GETS.
   *
   * producedColors above credits a fetch with every colour it can reach, which is
   * right -- you choose the basic. entersTapped then decided the timing off the
   * fetch's own text, and a fetch does not say "enters tapped" because the fetch
   * is not the land that does. So Evolving Wilds and Terramorphic Expanse modelled
   * as UNTAPPED FIVE-COLOUR LANDS, available the turn they were played: strictly
   * better than any land in Magic. Naya and Bant Panorama modelled as untapped
   * tri-lands while really charging {1} on top of the sacrifice.
   *
   * What the real cards do: Evolving Wilds, Terramorphic Expanse and both
   * Panoramas fetch the basic TAPPED, so the colour is a turn away in every case.
   * Fabled Passage untaps it only while you control four or fewer lands. So the
   * fetch enters tapped here, which costs it the {C} the Panoramas really do tap
   * for on that turn and still does not charge the mana to crack them -- two
   * errors pointing opposite ways, with the colour landing on the right turn.
   *
   * Myriad Landscape and Krosan Verge already read as tapped, because they print
   * the words; this makes the other five agree with them. */
  function fetchesItsColors(card, typeLine, rawText) {
    if (!/\bLand\b/.test(typeLine)) return false;
    if (!PUTS_LAND_ONTO_BATTLEFIELD.test(rawText)) return false;
    /* Only when the land makes no coloured mana of its own. A real dual that also
       fetches is not one of these -- and it is read from the UNSTRIPPED text, the
       same text producedColors gets, because a true dual prints its whole mana
       ability as reminder text: "({T}: Add {W} or {U}.)" is the entirety of
       Tundra. Ask this question of the stripped text and every dual in Magic
       becomes a fetch. */
    return ownProducedColors(card, typeLine, rawText).size === 0;
  }

  const BASIC_TYPES = "land|plains|island|swamp|mountain|forest";
  const BASIC_TYPE_COLOR = {plains: "W", island: "U", swamp: "B", mountain: "R", forest: "G"};
  const PUTS_LAND_ONTO_BATTLEFIELD = new RegExp(
    "search(?:es)? your library for [^.]{0,70}?(?:" + BASIC_TYPES + ")[^.]{0,90}?"
    + "onto the battlefield", "i");


  // A Treasure a card just makes is ramp. A Treasure locked behind paying mana
  // or sacrificing something is not ramp on the turn it is cast, and crediting
  // it as such is what put Currency Converter and Goldvein Pick at the top of a
  // bench screen they have no business leading.
  function makesTreasureFreely(text) {
    if (!/create a treasure token/.test(text)) return false;
    return text.split("\n").some((line) => {
      if (!/create a treasure token/.test(line)) return false;
      const colon = line.indexOf(":");
      if (colon < 0) return true;                       // triggered or static
      const cost = line.slice(0, colon);
      if (/\{\d|sacrifice|discard|pay/.test(cost)) return false;  // a bare {T} still counts
      /* ...and what the bare {T} buys has to BE the Treasure, not a Treasure it
         might reach. Currency Converter reads "{T}: Put a card exiled with this
         artifact into its owner's graveyard. If it's a land card, create a
         Treasure token." The cost is a bare {T}, so the test above passed it and
         the card modelled as a one-mana Treasure engine -- when the Treasure needs
         a card discarded, exiled with this artifact, and a land at that.
         Only activated abilities are read this way. A triggered Treasure that
         names a condition -- Smothering Tithe's "if the player doesn't" -- is the
         ordinary shape of a trigger, and those are still ramp. */
      const clause = line.slice(colon + 1).split(".").find((sentence) => /create a treasure token/.test(sentence)) || "";
      return !/\bif\b|\bunless\b/.test(clause);
    });
  }

  function estimatePower(card, cmc, typeLine, text) {
    if (Number.isFinite(Number(card.power))) return Math.max(0, Number(card.power));
    if (!/Creature/.test(typeLine)) return 0;
    let power = Math.max(1, Math.round(cmc * 0.9));
    if (/trample|double strike|menace/.test(text)) power += 1;
    if (/defender/.test(text)) power = Math.max(0, power - 2);
    return power;
  }

  function estimateToughness(card, cmc, typeLine, text) {
    if (Number.isFinite(Number(card.toughness))) return Math.max(0, Number(card.toughness));
    if (!/Creature/.test(typeLine)) return 0;
    let toughness = Math.max(1, Math.round(cmc * 0.9));
    if (/defender/.test(text)) toughness += 2;
    return toughness;
  }

  // Decks that win by draining the table rather than attacking it need a route
  // to victory the model can see, or every aristocrats and lifegain build reads
  // as unable to close. Only a repeatable trigger on a permanent counts: "when
  // this creature dies" fires once and is left to the combat model, while
  // "whenever a creature you control dies" is an engine. Assuming the trigger
  // fires every turn is generous, and is why drain decks should be read as an
  // upper bound rather than a forecast.
  const DEATH_TRIGGER = /(?:whenever|when) (?:a|an|another|one or more)[^.]{0,60}(?:creature|creatures)[^.]{0,40}you control[^.]{0,20}(?:dies|die)/;
  function isDeathTriggered(text) { return DEATH_TRIGGER.test(text); }

  // Aristocrats payoffs: what each of your own creatures dying pays. Kept
  // separate from drainAmount because a death trigger only fires when something
  // dies, which needs a sacrifice outlet (or combat) to happen on purpose --
  // the engine used to model neither, so a sacrifice deck read as its bodies.
  function deathValue(text, typeLine) {
    if (/Instant|Sorcery/.test(typeLine)) return {drain: 0, draw: 0};
    if (!isDeathTriggered(text)) return {drain: 0, draw: 0};
    const words = {a: 1, one: 1, two: 2, three: 3};
    const read = (match) => {
      if (!match) return 0;
      const raw = match[1] || match[2] || "1";
      return Number(words[raw] ?? raw) || 1;
    };
    return {
      drain: read(/each opponent loses (\d+|a|one|two|three) life|deals (\d+) damage to each opponent/.exec(text)),
      draw: /draw a card/.test(text) ? 1 : 0
    };
  }

  function drainAmount(text, typeLine) {
    if (/Instant|Sorcery/.test(typeLine)) return {all: 0, one: 0};
    if (!/whenever|at the beginning of/.test(text)) return {all: 0, one: 0};
    // A death trigger is not an every-turn drain. Before deaths were modeled
    // this read Blood Artist as "each opponent loses 1 life every turn, forever,
    // with nothing having died"; deathValue now pays it when something actually
    // dies, so crediting it here as well would pay it twice.
    if (isDeathTriggered(text)) return {all: 0, one: 0};
    const words = {a: 1, one: 1, two: 2, three: 3};
    const read = (match) => {
      if (!match) return 0;
      const raw = match[1] || match[2] || "1";
      return Number(words[raw] ?? raw) || 1;
    };
    return {
      all: read(/each opponent loses (\d+|a|one|two|three) life|deals (\d+) damage to each opponent/.exec(text)),
      one: read(/target (?:player|opponent) loses (\d+|a|one|two|three) life/.exec(text))
    };
  }

  // Scryfall tags card.keywords only for an ability the card itself has, never one it merely
  // grants to or references in others (Favorable Winds mentions "flying", but is not itself a
  // flier). oracleText alone can't make that distinction reliably by regex -- except that a
  // card's own printed keywords are always bunched into one comma-separated line, and it is
  // always the FIRST line ("Flying, vigilance, deathtouch, lifelink" on Atraxa) rather than
  // buried in a later granting sentence ("Creatures you control gain trample..."). Checking only
  // the first line resolves every false positive found scanning this catalog's granting/
  // referencing cards (Craterhoof, Elspeth, Iroas, Vito) for "flying/trample/deathtouch/menace/
  // lifelink" without a real keyword of their own.
  function hasKeyword(card, firstLine, keyword) {
    if ((card.keywords || []).some((entry) => String(entry).toLowerCase() === keyword)) return true;
    if (!new RegExp(`\\b${keyword}\\b`).test(firstLine)) return false;
    // The one real granting card found in this catalog whose whole oracle text is a single
    // line (Favorable Winds: "Creatures you control with flying get +1/+1.") has no separate
    // later line for the first-line check above to skip past. A genuine keyword line never
    // says "you control" -- it's a bare list ("Flying, vigilance") -- so excluding that phrase
    // catches this case too, checked against every keyworded card in this catalog without
    // producing a new false negative (the one card it would affect, Sephara, Sky's Blade,
    // resolves correctly anyway via card.keywords before this line ever runs).
    return !/\byou control\b/.test(firstLine);
  }

  // A repeatable counters/proliferate source is one that can fire more than once across a game:
  // an activated ability (a mana/tap cost followed by a colon) or a triggered ability opening a
  // line with "at the beginning of" or "whenever". Anything else -- a one-shot instant/sorcery,
  // or a static enters-the-battlefield-only clause -- fires at most once, at cast time.
  function hasRepeatableAbility(text) {
    return /\{[^}]*\}[^:]*:/.test(text) || /(?:^|\n)(?:at the beginning of|whenever)\b/.test(text);
  }

  // One pass over the card's own text decides everything the game loop knows
  // about it. Anything the loop cannot see is, by definition, not simulated.
  // Reminder text is always parenthesised and never carries rules meaning.
  function stripReminder(text) {
    return String(text).replace(/\([^()]*\)/g, " ").replace(/[ \t]{2,}/g, " ");
  }

  function classifyCard(card) {
    const typeLine = String(card.typeLine || "");
    const rawText = String(card.oracleText || "").toLowerCase().replace(/[’]/g, "'");
    const text = stripReminder(rawText);
    const firstLine = text.split("\n")[0] || "";
    const cost = parseManaCost(card.manaCost);
    const cmc = Number.isFinite(Number(card.cmc)) && Number(card.cmc) > 0 ? Number(card.cmc) : cost.value;
    const isLand = /\bLand\b/.test(typeLine);
    const isCreature = /Creature/.test(typeLine);
    const instantSpeed = /Instant/.test(typeLine) || /flash/.test(text);
    const power = estimatePower(card, cmc, typeLine, rawText);
    const toughness = estimateToughness(card, cmc, typeLine, rawText);
    const tokenMakers = (text.match(/create (?:a|an|two|three|x|\d+)[^.]{0,40}token/g) || []).length;
    const rampMatch = /add \{[wubrgc]\}\{[wubrgc]\}|search your library for (?:a|up to two|two) (?:basic )?land/.test(text) ? 2 : 1;
    const entersWithCountersMatch = /enters(?: the battlefield)? with (a|an|one|two|three|four|five|\d+)[^.]{0,20}\+1\/\+1 counters?/.exec(text);
    const addsCounterMatch = /put[s]? (?:a|an|one|two|three|four|five|\d+|x)[^.]{0,20}\+1\/\+1 counters? on/.exec(text);
    const COUNTER_WORDS = {a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5};
    const readCounterAmount = (word) => COUNTER_WORDS[word] ?? (Number(word) || 1);
    return {
      name: card.name,
      quantity: Math.max(1, Number(card.quantity || 1)),
      cmc,
      pips: cost.pips,
      typeLine,
      isLand,
      isBasicLand: /\bBasic Land\b/.test(typeLine),
      // A fetch is tapped too: the basic it goes and gets arrives tapped, so the
      // colour is a turn away however the fetch itself is printed. See
      // fetchesItsColors.
      entersTapped: /enters (?:the battlefield )?tapped/.test(text) || fetchesItsColors(card, typeLine, rawText),
      produces: producedColors(card, typeLine, rawText),
      isCommander: Boolean(card.isCommander),
      isCreature,
      power,
      toughness,
      // Anchored to the start of a line, matching how Scryfall prints a real
      // keyword ("Defender\nWhen this creature enters...") — a card that merely
      // mentions "defender" in the middle of other ability text (e.g. "+1/+1 for
      // each Defender you control") should not match.
      isDefender: isCreature && /(?:^|\n)defender\b/.test(text),
      liftsDefender: /attack as though (?:it|they) didn'?t have defender/.test(text),
      // Arcades, the Strategist and Felothar the Steadfast both print this
      // clause for creatures with Defender; Assault Formation prints the
      // unrestricted form. Scoped to Defender creatures specifically when
      // applied below, matching the printed cards in this catalog.
      defenderToughnessDamage: /damage equal to (?:its|their) toughness rather than (?:its|their) power/.test(text),
      instantSpeed,
      // Two separate misses used to live here. The land-fetch pattern allowed
      // only thirty characters between "land" and "onto the battlefield", which
      // Cultivate ("...cards, reveal those cards, and put one onto the
      // battlefield tapped and the other into your hand") overruns; and it
      // required the literal word "land", which Nature's Lore, Three Visits,
      // Farseek and Wood Elves never say -- they name a basic land type. Between
      // them that is most of the ramp actually played in this format, and every
      // green deck was being scored without it.
      isRamp: !isLand && (/\{t\}: add|add \{[wubrgc]\}/.test(text)
        || PUTS_LAND_ONTO_BATTLEFIELD.test(text)
        || /you may play an additional land/.test(text)
        || makesTreasureFreely(text)),
      rampAmount: rampMatch,
      isDraw: /draw (?:a|one|two|three|four|x|\d+) cards?|draws? that many cards|draw cards equal/.test(text) && !/each opponent draws/.test(text),
      drawAmount: /draw (?:two|three|four|\d+) cards|draw cards equal|draws? that many/.test(text) ? 2 : 1,
      isRemoval: /destroy target|exile target (?:creature|permanent|artifact|enchantment|planeswalker|nonland)|deals? \d+ damage to (?:target|any target)|fights? target|return target (?:creature|permanent|nonland permanent) to its owner's hand|target creature gets [-−]/.test(text),
      isWipe: /destroy all|exile all|all creatures get [-−]|each player sacrifices|return all creatures|destroy each creature|each creature deals damage equal to its (?:power|toughness) to itself/.test(text),
      // Only a one-shot spell sweeps our own board in the model. A wipe printed
      // on a permanent (a planeswalker ability, an activated sweeper) comes with
      // the permanent's own value and is not a symmetrical reset.
      wipesOwnBoard: /Instant|Sorcery/.test(typeLine),
      isProtection: /hexproof|indestructible|protection from|counter target spell|regenerate|phases? out|prevent all damage|can't be countered/.test(text),
      isRecursion: /return target .{0,40}from your graveyard|return .{0,30}from your graveyard to (?:the battlefield|your hand)/.test(text),
      isTutor: /search your library for an? (?:card|artifact|creature|enchantment|instant|sorcery|permanent)/.test(text),
      isFinisher: /you win the game|each opponent loses \d+ life|extra combat phase|deals damage equal to/.test(text) || (isCreature && cmc >= 5),
      boardWidth: tokenMakers,
      drain: drainAmount(text, typeLine),
      // A repeatable way to put your own creature in the graveyard on demand.
      // Only an activated ability counts: the sacrifice has to be a cost, which
      // is what makes it available at will rather than once.
      isSacOutlet: !/Instant|Sorcery/.test(typeLine)
        && /sacrifice (?:a|an|another) (?:creature|permanent|token|artifact)[^:\n]{0,40}:/.test(text),
      // What one of your creatures dying is worth. Read off the same permanents
      // the drain reader already looks at, so an aristocrats payoff is credited
      // once as a death trigger rather than twice.
      death: deathValue(text, typeLine),
      isDrainSpell: /Instant|Sorcery/.test(typeLine) && /each opponent loses|damage to each opponent/.test(text),
      drainSpellAmount: Number((/each opponent loses (\d+) life|deals (\d+) damage to each opponent/.exec(text) || [])[1] || (/each opponent loses (\d+) life|deals (\d+) damage to each opponent/.exec(text) || [])[2] || 3),
      // Evasion and combat keywords -- read from the card's own first line (see hasKeyword above)
      // so a card that merely grants or references these to other creatures is never mistaken
      // for having them itself.
      hasFlying: hasKeyword(card, firstLine, "flying"),
      hasMenace: hasKeyword(card, firstLine, "menace"),
      hasTrample: hasKeyword(card, firstLine, "trample"),
      hasDeathtouch: hasKeyword(card, firstLine, "deathtouch"),
      hasFirstStrike: hasKeyword(card, firstLine, "first strike"),
      hasLifelink: hasKeyword(card, firstLine, "lifelink"),
      // +1/+1 counters: a creature that enters already carrying some, a source (creature,
      // artifact, or enchantment) that repeatedly or once puts more on a creature, and the rare
      // effect (Hardened Scales, Ozolith-the-Shattered-Spire-style) that doubles every +1/+1
      // counter this deck would place. Counter-storage/transfer effects (The Ozolith itself:
      // move counters from a dying creature onto this permanent, then redistribute them later)
      // are a distinct, more stateful mechanic and are not modeled -- a card with that text
      // classifies as an ordinary permanent with no counter interaction here.
      entersWithCounters: entersWithCountersMatch ? readCounterAmount(entersWithCountersMatch[1]) : 0,
      addsCounterAmount: addsCounterMatch ? readCounterAmount((/put[s]? (a|an|one|two|three|four|five|\d+|x)/.exec(addsCounterMatch[0]) || [])[1]) : 0,
      addsCounterRepeatable: Boolean(addsCounterMatch) && hasRepeatableAbility(text),
      isProliferate: (card.keywords || []).some((entry) => String(entry).toLowerCase() === "proliferate") || /proliferate/.test(text),
      proliferateRepeatable: /proliferate/.test(text) && hasRepeatableAbility(text),
      doublesCounters: /that many (plus one|more)[^.]*counters?[^.]*instead|doubl(e|ing)[^.]*counter/.test(text),
      price: Number(card.price || 0),
      gameChanger: Boolean(card.gameChanger)
    };
  }

  function prepareDeck(cards) {
    const profiles = [];
    const library = [];
    let commander = null;
    // A card that lifts the Defender restriction (e.g. Felothar the Steadfast)
    // or changes how Defenders deal combat damage (Arcades, the Strategist)
    // is a deck-wide effect, checked once here rather than per creature.
    let defendersCanAttack = false;
    let defendersDealToughnessDamage = false;
    // A doubler (Hardened Scales, Vorel of the Hull Clade) affects every +1/+1 counter this
    // deck places, from any source -- checked once here rather than duplicated at every place
    // a counter gets added, matching how the Defender-lifting flags above already work.
    let counterDoubler = false;
    cards.forEach((card) => {
      const profile = classifyCard(card);
      if (profile.liftsDefender) defendersCanAttack = true;
      if (profile.defenderToughnessDamage) defendersDealToughnessDamage = true;
      if (profile.doublesCounters) counterDoubler = true;
      const index = profiles.push(profile) - 1;
      if (profile.isCommander && !commander) {
        commander = {profile, index};
        for (let copy = 1; copy < profile.quantity; copy += 1) library.push(index);
        return;
      }
      for (let copy = 0; copy < profile.quantity; copy += 1) library.push(index);
    });
    return {profiles, library, commander, defendersCanAttack, defendersDealToughnessDamage, counterDoubler};
  }

  function shuffle(source, rng) {
    const deck = source.slice();
    for (let index = deck.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(rng() * (index + 1));
      const held = deck[index];
      deck[index] = deck[swap];
      deck[swap] = held;
    }
    return deck;
  }

  /* WHICH SEVENS YOU KEEP. The defaults are the rule this file has always used:
     two to five lands and two plays you can make in the first three turns. A
     policy widens or narrows it -- a casual pilot keeps almost any seven with
     lands in it; a competitive one also wants something proactive in there and
     will go to five looking for it. */
  function keepableHand(hand, profiles, policy) {
    const rule = policy && policy.mulligan;
    const minLands = rule ? rule.minLands : 2;
    const maxLands = rule ? rule.maxLands : 5;
    const minEarly = rule ? rule.minEarlyPlays : 2;
    const earlyCmc = rule ? rule.earlyCmc : 3;
    const minProactive = rule ? (rule.minProactive || 0) : 0;
    let lands = 0;
    let earlyPlays = 0;
    let proactive = 0;
    hand.forEach((index) => {
      const profile = profiles[index];
      if (profile.isLand) lands += 1;
      else {
        if (profile.cmc <= earlyCmc) earlyPlays += 1;
        if (minProactive && (profile.isRamp || profile.isDraw || profile.isTutor)) proactive += 1;
      }
    });
    if (lands < minLands || lands > maxLands || earlyPlays < minEarly) return false;
    return proactive >= minProactive;
  }

  function castable(profile, mana, sources, commanderTax = 0) {
    const cost = profile.cmc + commanderTax;
    if (cost > mana) return false;
    for (const color of COLORS) {
      if (profile.pips[color] > (sources[color] || 0)) return false;
    }
    return true;
  }

  /* WHAT YOU CAST FIRST. A policy supplies OFFSETS onto this table, never a
     replacement for it -- so the shape of the ordering (ramp before draw before
     creatures, instants held back) survives, and a policy says only how much
     harder or softer it leans. All-zero offsets are this function unchanged. */
  const NO_CAST_BIAS = {ramp: 0, draw: 0, wipe: 0, finisher: 0, creature: 0, recursion: 0, tutor: 0, removal: 0, protection: 0, other: 0, wipeThreshold: 6};
  function castPriority(profile, turn, state, policy) {
    const bias = (policy && policy.cast) || NO_CAST_BIAS;
    if (profile.isRamp && turn <= 6) return 100 - profile.cmc + bias.ramp;
    if (profile.isDraw) return 80 - profile.cmc + (state.cardsInHand <= 2 ? 12 : 0) + bias.draw;
    if (profile.isWipe) return (state.opponentBoard >= bias.wipeThreshold ? 90 : 20) + bias.wipe;
    if (profile.isFinisher) return 62 + Math.min(10, profile.power) + bias.finisher;
    if (profile.isCreature) return 58 + Math.min(8, profile.power) - profile.cmc * 0.5 + bias.creature;
    if (profile.isRecursion) return 55 + bias.recursion;
    if (profile.isTutor) return 52 + bias.tutor;
    if (profile.isRemoval) return (profile.instantSpeed ? 12 : 48) + bias.removal;
    if (profile.isProtection) return (profile.instantSpeed ? 10 : 44) + bias.protection;
    return 30 + bias.other;
  }

  function sampleProfile(table, rng) {
    const roll = rng();
    let cumulative = 0;
    for (const seat of table) {
      cumulative += seat.weight;
      if (roll <= cumulative) return seat;
    }
    return table[table.length - 1];
  }

  /* WHAT ONE OF A SEAT'S CREATURES IS. The threat curve says how much power the
     seat has at turn T; bodySize says how that power is divided, which is the
     whole difference between a tokens seat and a voltron seat and the only thing
     a blocker cares about. Square bodies, because most Commander creatures are
     near enough square and inventing a second number per archetype would be
     inventing rather than deriving. */
  function seatCreature(seat) {
    const size = Math.max(1, Math.round(seat.bodySize));
    return {power: size, toughness: size, damage: 0, sick: true, tapped: false, seatBody: true};
  }

  /* Deploy what the seat's curve says it has by now -- and only what it has not
     already deployed.
   *
     THE FIRST VERSION TOPPED UP TO A LEVEL, and a level is not a board. Kill four
     of a seat's creatures and the next turn handed them all back, so attacking
     into a board achieved nothing and the seats stopped dying: measured on D6,
     surviving seats went 1.32 -> 1.74 and the first elimination slid from turn
     8.7 to 9.1, which is most of why the win rate collapsed. A creature killed
     has to stay killed, so the seat tracks what it has EVER put down and adds
     only the difference. Losing one costs it that body for the rest of the game,
     which is the entire reason attacking a board is worth doing. */
  function refreshSeatBoard(seat, turn) {
    const want = Math.max(0, Math.round(byTurn(seat.threat, turn) * seat.deviation / Math.max(0.5, seat.bodySize)));
    while (seat.deployed < want) {
      seat.creatures.push(seatCreature(seat));
      seat.deployed += 1;
    }
  }

  const seatPower = (seat) => seat.creatures.reduce((sum, creature) => sum + creature.power, 0);

  function seatFrom(profileDefinition, rng) {
    const jitter = profileDefinition.jitter || 0.2;
    const deviation = 1 + (rng() * 2 - 1) * jitter;
    const win = profileDefinition.winTurn;
    const winTurn = Math.max(win.floor, Math.round(win.mean + (rng() * 2 - 1) * win.sd * 2));
    return {
      key: profileDefinition.key,
      life: 40,
      // The turn this seat's life hit zero, so Pod Fun can charge for the turns a
      // knocked-out player spends watching rather than playing.
      eliminatedTurn: null,
      deviation,
      winTurn,
      threat: profileDefinition.threatDamageByTurn,
      // Only read under board combat; the estimate path never looks at it.
      bodySize: Number(profileDefinition.bodySize) || 2,
      creatures: [],
      // How many this seat has ever put on the battlefield, so a body it lost is
      // one it does not get back.
      deployed: 0,
      interaction: profileDefinition.interactionChanceByTurn,
      wipeChance: profileDefinition.wipeChanceByTurn,
      wipeVulnerability: Number.isFinite(Number(profileDefinition.wipeVulnerability)) ? Number(profileDefinition.wipeVulnerability) : 1
    };
  }

  function byTurn(series, turn) {
    if (!series?.length) return 0;
    return series[Math.min(turn, series.length - 1)];
  }

  function playGame(deck, table, config, seed, cardStats) {
    const rng = createRng(seed);
    const profiles = deck.profiles;
    // No policy is the published pilot: every branch guarded on `policy` below
    // falls through to the code this file has always run.
    const policy = config.policy ? pilotOrThrow().get(config.policy) : null;
    /* "estimate" is the arithmetic this file has always done: attacking power
       times a connect rate, reduced by a toughness-weighted guess at blocking,
       with nothing ever assigned to anything and nothing ever dying. "board"
       gives the three seats creatures and runs a real combat step against them.
       Default is estimate, so every published number stays what it is. */
    const combatMode = String(config.combat || "estimate");
    if (combatMode !== "estimate" && combatMode !== "board") {
      throw new Error(`Unknown combat mode "${combatMode}" -- it is "estimate" or "board"`);
    }
    const boardCombat = combatMode === "board";
    const Combat = boardCombat ? combatOrThrow() : null;
    const seats = [];
    for (let index = 0; index < 3; index += 1) seats.push(seatFrom(sampleProfile(table, rng), rng));
    let library = shuffle(deck.library, rng);
    let hand = [];
    let mulligans = 0;
    const mulliganCap = (policy && policy.mulligan.maxMulligans != null)
      ? policy.mulligan.maxMulligans
      : (config.mulligans ?? 3);
    for (;;) {
      hand = library.slice(0, 7);
      if (mulligans >= mulliganCap || keepableHand(hand, profiles, policy)) break;
      mulligans += 1;
      library = shuffle(deck.library, rng);
    }
    library = library.slice(7);
    for (let bottom = 0; bottom < mulligans && hand.length; bottom += 1) {
      let worst = 0;
      hand.forEach((index, position) => {
        if (profiles[index].cmc > profiles[hand[worst]].cmc) worst = position;
      });
      library.push(hand.splice(worst, 1)[0]);
    }

    const drawn = new Set(hand);
    const cast = new Set();
    const battlefieldCreatures = [];
    const sources = {W: 0, U: 0, B: 0, R: 0, G: 0};
    let lands = 0;
    let rocks = 0;
    let life = 40;
    let commanderTax = 0;
    let commanderTurn = 0;
    let commanderOnField = false;
    let heldAnswers = 0;
    let interactionTurns = 0;
    let measuredTurns = 0;
    let landsDrawn = 0;
    // Lands played tapped this turn; they come online at the next land drop.
    let tappedPending = {count: 0, colors: []};
    let cardsSeen = hand.length;
    let missedDrops = 0;
    let manaBehind = 0;
    let deadCardsAtEight = 0;
    let won = false;
    let lost = false;
    let endTurn = 0;
    let lossCause = "";
    let opponentBoard = 0;
    let drainAll = 0;
    let drainOne = 0;
    let sacOutlets = 0;
    let deathDrain = 0;
    let deathDraw = 0;
    let peakBoard = 0;
    const defendersCanAttack = Boolean(deck.defendersCanAttack);
    const defendersDealToughnessDamage = Boolean(deck.defendersDealToughnessDamage);
    const counterDoubler = Boolean(deck.counterDoubler);
    // A repeatable counters/proliferate source (an activated ability, or a recurring trigger)
    // keeps firing every turn from the turn it resolves onward -- tracked as a running rate
    // rather than a one-shot effect. One-shot sources (an instant, or a static ETB-only clause)
    // are applied immediately where they're cast instead and never added here.
    let counterEngineRate = 0;
    let proliferateEngineCount = 0;

    // Every counter this deck places is doubled when a doubler (Hardened Scales-style) is
    // anywhere in the 100; growCreature keeps a creature's power/toughness derived from its
    // base stats plus counters rather than mutating power directly, so repeated triggers stack
    // correctly instead of compounding a doubling on top of itself.
    const scaledCounters = (amount) => amount * (counterDoubler ? 2 : 1);
    const growCreature = (creature, amount) => {
      if (!creature || amount <= 0) return;
      creature.counters += amount;
      creature.power = creature.basePower + creature.counters;
      creature.toughness = creature.baseToughness + creature.counters;
    };
    // No real per-creature targeting exists in this model (see SIMPLIFICATIONS); putting new
    // counters on the board's current biggest threat is the closest reasonable stand-in for
    // "the counters synergy deck grows its best creature."
    const biggestCreature = () => battlefieldCreatures.reduce((best, creature) => (!best || creature.power > best.power ? creature : best), null);
    const proliferateBoard = () => {
      battlefieldCreatures.forEach((creature) => { if (creature.counters > 0) growCreature(creature, scaledCounters(1)); });
    };
    // A card that both enters the battlefield and grows over time (Karn's Bastion is not a
    // creature and never reaches here; a creature that both enters with counters and has, say,
    // a doubler in play, does) needs its starting counters scaled by the doubler exactly once,
    // the same as any other counter placed after it.
    /* A TOKEN IS A BODY, WHEN THERE IS A BOARD FOR IT TO STAND ON.
     *
     * boardWidth counts a card's token-making clauses, and the estimate folds
     * each one into the parent as +2 power -- which is the right shape for an
     * arithmetic model and exactly wrong for a real combat step. It turns a
     * go-wide deck into a handful of enormous creatures, and a handful of
     * enormous creatures get chump-blocked all day where the same power spread
     * across many bodies does not. Measured on the first run of board combat,
     * with tokens still folded in: D6 Krenko, whose entire plan is Goblins, fell
     * 17.15 points and from a 31.4% win rate to 6.5% -- the worst of the six, and
     * the one the change was most supposed to help.
     *
     * So under board combat each clause becomes its own 2/2 instead. Two power,
     * the same two the estimate credited, so the deck's TOTAL power is unchanged
     * and the only thing that moves is how it is divided -- which is the thing
     * under test. */
    const TOKEN_BODY = 2;
    const tokenBodies = (profile) => {
      if (!boardCombat || !profile.boardWidth) return [];
      return Array.from({length: profile.boardWidth}, () => ({
        basePower: TOKEN_BODY, baseToughness: TOKEN_BODY, counters: 0,
        power: TOKEN_BODY, toughness: TOKEN_BODY,
        sick: true, tapped: false, commander: false, canAttack: true, isToken: true,
        hasFlying: false, hasMenace: false, hasTrample: false,
        hasDeathtouch: false, hasFirstStrike: false, hasLifelink: false
      }));
    };
    const makeCreatureEntry = (profile, powerOverride) => {
      const startingCounters = profile.entersWithCounters ? scaledCounters(profile.entersWithCounters) : 0;
      // Under board combat the token half is deployed separately, so the parent
      // keeps only its own printed body.
      const width = boardCombat ? 0 : profile.boardWidth;
      return {
        basePower: powerOverride + width * 2,
        baseToughness: profile.toughness,
        counters: startingCounters,
        power: powerOverride + width * 2 + startingCounters,
        toughness: profile.toughness + startingCounters,
        sick: true,
        tapped: false,
        commander: false,
        canAttack: !profile.isDefender || defendersCanAttack,
        hasFlying: profile.hasFlying,
        hasMenace: profile.hasMenace,
        hasTrample: profile.hasTrample,
        hasDeathtouch: profile.hasDeathtouch,
        hasFirstStrike: profile.hasFirstStrike,
        hasLifelink: profile.hasLifelink
      };
    };
    // Registers what a just-cast card's counters/proliferate ability does: a one-shot source
    // applies immediately (to the board's biggest creature, or across it for proliferate — see
    // biggestCreature/proliferateBoard above), while a repeatable source joins a running
    // per-turn rate that keeps firing every turn from here on, applied once below.
    const resolveCountersAndProliferate = (profile) => {
      if (profile.addsCounterAmount > 0) {
        if (profile.addsCounterRepeatable) counterEngineRate += scaledCounters(profile.addsCounterAmount);
        else growCreature(biggestCreature(), scaledCounters(profile.addsCounterAmount));
      }
      if (profile.isProliferate) {
        if (profile.proliferateRepeatable) proliferateEngineCount += 1;
        else proliferateBoard();
      }
    };

    hand.forEach((index) => {
      if (profiles[index].isLand) landsDrawn += 1;
    });

    const maxTurns = config.maxTurns || 16;
    for (let turn = 1; turn <= maxTurns && !won && !lost; turn += 1) {
      endTurn = turn;
      if (turn > 1 || (seed & 1) === 0) {
        const card = library.shift();
        if (card === undefined) {
          lost = true;
          lossCause = "decked";
          break;
        }
        hand.push(card);
        drawn.add(card);
        cardsSeen += 1;
        if (profiles[card].isLand) landsDrawn += 1;
      }

      // A land that entered tapped last turn is available now. entersTapped was
      // being computed on every card and then never read, so a tapped dual was
      // scored as though it came down untapped -- which is most of the
      // difference between a Guildgate and a real dual.
      if (tappedPending.count) {
        lands += tappedPending.count;
        tappedPending.colors.forEach((color) => { sources[color] += 1; });
        tappedPending = {count: 0, colors: []};
      }
      const landInHand = hand.findIndex((index) => profiles[index].isLand);
      if (landInHand >= 0) {
        const [played] = hand.splice(landInHand, 1);
        const profile = profiles[played];
        if (profile.entersTapped) {
          tappedPending.count += 1;
          profile.produces.forEach((color) => { tappedPending.colors.push(color); });
        } else {
          lands += 1;
          profile.produces.forEach((color) => { sources[color] += 1; });
        }
        cast.add(played);
        /* A LAND DROP IS THE CARD BEING PLAYED. `cast` already knew that -- it is why a
           land never counted as dead -- but the counter did not, so all 36 lands in a
           hundred read "0% cast, 0% dead" and the table's whole visible half was zeros.
           Counted here, a land's rate answers a real question: how often a drawn copy
           actually reached the battlefield rather than sitting behind a colour it could
           not use or a drop already spent. */
        if (cardStats) {
          const stat = cardStats.get(profile.name);
          if (stat) { stat.cast += 1; stat.castTurnTotal += turn; }
        }
      } else if (turn <= 6 && lands < 5) {
        // Only a drop missed while still short on mana is screw; running out of
        // lands in hand after five are already down is just a normal curve.
        missedDrops += 1;
      }

      let mana = lands + rocks;
      if (turn >= 3 && turn <= 6 && mana < turn - 1) manaBehind += 1;
      if (boardCombat) {
        seats.forEach((seat) => { if (seat.life > 0) refreshSeatBoard(seat, turn); });
        // Our creatures untap; theirs are ready by the time they attack.
        battlefieldCreatures.forEach((creature) => { creature.tapped = false; });
        seats.forEach((seat) => seat.creatures.forEach((creature) => { creature.sick = false; }));
      }
      opponentBoard = boardCombat
        ? seats.reduce((sum, seat) => sum + (seat.life > 0 ? seatPower(seat) : 0), 0)
        : seats.reduce((sum, seat) => sum + byTurn(seat.threat, turn) * seat.deviation, 0);
      const state = {cardsInHand: hand.length, opponentBoard};
      /* TAPPING OUT, OR NOT. A pilot who holds an answer up is refusing to spend
         the mana that answer costs. Reserving nothing -- the published pilot --
         leaves this at zero and the loop below spends exactly as it always has.
         Colour is not reserved: this model has no notion of which land is tapped
         (see SIMPLIFICATIONS). */
      const reserved = policy
        ? pilotOrThrow().manaToReserve(hand.map((index) => profiles[index]), mana, turn, policy)
        : 0;
      const commanderGate = policy ? policy.cast.commanderThreshold : 95;
      for (;;) {
        let bestPosition = -1;
        let bestPriority = -Infinity;
        const spendable = mana - reserved;
        const ourPower = battlefieldCreatures.reduce((sum, creature) => sum + creature.power, 0);
        hand.forEach((index, position) => {
          const profile = profiles[index];
          if (profile.isLand) return;
          if (profile.isWipe && profile.wipesOwnBoard && ourPower > opponentBoard * 0.6) return;
          /* The card you are holding the mana for is the card you are holding.
             Without this, a reserving pilot keeps the mana and then spends it on
             the very answer it was kept for -- the cast loop reaches instants
             last, so they go out whenever nothing better is castable. Guarded on
             `reserved`, which is zero for the published pilot and for every
             policy that taps out, so this line is unreachable for them. */
          if (reserved > 0 && profile.instantSpeed && (profile.isRemoval || profile.isProtection)) return;
          if (!castable(profile, spendable, sources)) return;
          const priority = castPriority(profile, turn, state, policy);
          if (priority > bestPriority) {
            bestPriority = priority;
            bestPosition = position;
          }
        });
        const commanderProfile = deck.commander?.profile;
        const commanderCost = commanderProfile ? commanderProfile.cmc + commanderTax : Infinity;
        const commanderCastable = commanderProfile && !commanderOnField && castable(commanderProfile, spendable, sources, commanderTax);
        if (commanderCastable && (bestPosition < 0 || bestPriority < commanderGate)) {
          mana -= commanderCost;
          commanderOnField = true;
          commanderTax += 2;
          if (!commanderTurn) commanderTurn = turn;
          // A noncreature commander (a planeswalker printed with "can be your
          // commander") is never a combatant — it never joins the board as an
          // attacker or blocker here, the same way it never would on a table.
          if (commanderProfile.isCreature) {
            const commanderPower = (commanderProfile.isDefender && defendersDealToughnessDamage) ? commanderProfile.toughness : commanderProfile.power;
            battlefieldCreatures.push({...makeCreatureEntry(commanderProfile, commanderPower), commander: true});
            tokenBodies(commanderProfile).forEach((token) => battlefieldCreatures.push(token));
          }
          drainAll += commanderProfile.drain.all;
          drainOne += commanderProfile.drain.one;
          if (commanderProfile.isSacOutlet) sacOutlets += 1;
          deathDrain += commanderProfile.death.drain;
          deathDraw += commanderProfile.death.draw;
          resolveCountersAndProliferate(commanderProfile);
          /* THE COMMANDER'S CAST IS A CAST. This branch casts from the command zone and
             returns before reaching the cast bookkeeping below, so the per-card table
             reported 0% for the one card the header reports at 99.98% -- the single most
             obviously wrong row in the readout. */
          if (cardStats) {
            const stat = cardStats.get(commanderProfile.name);
            if (stat) { stat.cast += 1; stat.castTurnTotal += turn; }
          }
          continue;
        }
        if (bestPosition < 0) break;
        const [played] = hand.splice(bestPosition, 1);
        const profile = profiles[played];
        mana -= profile.cmc;
        cast.add(played);
        if (cardStats) {
          const stat = cardStats.get(profile.name);
          if (stat) {
            stat.cast += 1;
            stat.castTurnTotal += turn;
          }
        }
        if (profile.isRamp) {
          rocks += profile.rampAmount;
          profile.produces.forEach((color) => { sources[color] += 1; });
          if (!profile.produces.length) COLORS.forEach((color) => { sources[color] += 1; });
        }
        if (profile.isDraw) {
          for (let extra = 0; extra < profile.drawAmount; extra += 1) {
            const card = library.shift();
            if (card === undefined) break;
            hand.push(card);
            drawn.add(card);
            cardsSeen += 1;
            if (profiles[card].isLand) landsDrawn += 1;
          }
        }
        if (profile.isTutor) {
          const options = [library.shift(), library.shift(), library.shift()].filter((entry) => entry !== undefined);
          options.sort((a, b) => castPriority(profiles[b], turn, state, policy) - castPriority(profiles[a], turn, state, policy));
          if (options.length) {
            hand.push(options[0]);
            drawn.add(options[0]);
            library.push(...options.slice(1));
          }
        }
        if (profile.isWipe) {
          // wipeVulnerability scales the same 45% base reduction per seat: a
          // combo/stax seat barely notices (they don't rely on a board), a
          // token seat loses far more than the base amount.
          seats.forEach((seat) => { seat.deviation *= Math.max(0, 1 - (1 - 0.55) * seat.wipeVulnerability); });
          /* A wipe that only scales a threat curve leaves the creatures standing.
             Under board combat it kills the same share of real bodies -- a stax
             seat barely notices, a tokens seat loses most of what it has. */
          if (boardCombat) {
            seats.forEach((seat) => {
              const kept = Math.floor(seat.creatures.length * Math.max(0, 1 - 0.45 * seat.wipeVulnerability));
              seat.creatures.length = Math.min(seat.creatures.length, kept);
            });
          }
          if (profile.wipesOwnBoard) battlefieldCreatures.length = 0;
        }
        if (profile.isDrainSpell) seats.forEach((seat) => { seat.life -= profile.drainSpellAmount; });
        if (profile.isRemoval && !profile.instantSpeed) {
          const target = seats.reduce((best, seat) => (byTurn(seat.threat, turn) > byTurn(best.threat, turn) ? seat : best), seats[0]);
          target.deviation *= 0.8;
          /* ...and under board combat it takes the biggest thing off that board,
             which is what removal does and what scaling a curve cannot express. */
          if (boardCombat && target.creatures.length) {
            let biggest = 0;
            target.creatures.forEach((creature, index) => {
              if (creature.power > target.creatures[biggest].power) biggest = index;
            });
            target.creatures.splice(biggest, 1);
          }
        }
        drainAll += profile.drain.all;
        drainOne += profile.drain.one;
        if (profile.isSacOutlet) sacOutlets += 1;
        deathDrain += profile.death.drain;
        deathDraw += profile.death.draw;
        if (profile.isCreature) {
          const creaturePower = (profile.isDefender && defendersDealToughnessDamage) ? profile.toughness : profile.power;
          battlefieldCreatures.push(makeCreatureEntry(profile, creaturePower));
          tokenBodies(profile).forEach((token) => battlefieldCreatures.push(token));
        }
        // After the push, so a self-targeting ETB (a creature that also says "put a +1/+1
        // counter on this creature") can land on itself via biggestCreature() rather than an
        // unrelated creature already on board.
        resolveCountersAndProliferate(profile);
      }
      peakBoard = Math.max(peakBoard, battlefieldCreatures.length);
      // Every repeatable counters/proliferate source registered above fires once per turn from
      // the turn it resolved onward, including its first turn -- a reasonable stand-in for an
      // activated ability usable the turn it enters, or a trigger due before combat.
      if (counterEngineRate > 0) growCreature(biggestCreature(), counterEngineRate);
      for (let engineIndex = 0; engineIndex < proliferateEngineCount; engineIndex += 1) proliferateBoard();

      // An answer you cannot pay for is not an answer. Counting instant-speed
      // removal by presence in hand alone inverted the metric: a six-mana instant
      // sat there uncastable and scored interaction on every turn, while a
      // one-mana instant that could actually be held up scored the same or less.
      /* THE COUNTERFACTUAL, AND THE FACT. The published protocol asks whether the
         answer COULD have been held up with everything untapped, which credits a
         pilot who tapped out for interaction they did not have. A policy that
         holds mana up is measured on what it actually kept, so its interaction
         figure is a fact rather than a might-have-been -- and that is why the two
         lens scores compare with each other and not with the published number. */
      const answerMana = (policy && policy.hold.fromUntappedMana) ? mana : lands + rocks;
      heldAnswers = hand.filter((index) => {
        const answer = profiles[index];
        return answer.instantSpeed
          && (answer.isRemoval || answer.isProtection)
          && castable(answer, answerMana, sources);
      }).length;
      if (turn >= 3 && turn <= 7) {
        measuredTurns += 1;
        if (heldAnswers > 0) interactionTurns += 1;
      }
      if (turn === 8) {
        const stranded = hand.filter((index) => !castable(profiles[index], lands + rocks, sources) && !profiles[index].isLand);
        deadCardsAtEight = stranded.length;
        /* THE SAME FILTER, KEPT PER CARD. deadCardsAtEight has always been counted here and
           thrown away as a single number. Which cards those were is the one per-card figure
           that separates one nonland from another in this model: cast rate cannot, because a
           game runs long enough that essentially every drawn spell is eventually cast, so it
           sits at 99-100% for the whole list and ranks nothing. Being stuck in hand on turn
           eight is a real, varying fault -- too expensive, or off-colour for these sources. */
        if (cardStats) {
          const already = new Set();
          stranded.forEach((index) => {
            const name = profiles[index].name;
            if (already.has(name)) return;
            already.add(name);
            const stat = cardStats.get(name);
            if (stat) stat.stuckAtEight += 1;
          });
        }
      }

      // attackPower already carries each attacker's connect rate (flying/menace/trample get
      // more of their power through than a flat rate would), so it is applied directly below --
      // no further "unblocked factor" on top of it.
      let attackPower = 0;
      let lifelinkGain = 0;
      const eligibleAttackers = battlefieldCreatures.filter((creature) => !creature.sick && creature.canAttack);
      /* KEEPING BLOCKERS HOME. Null for the published pilot, which attacks with
         everything. A creature in this set gives up its attack and is counted
         twice in the block-reduction estimate below -- a body held back is
         certainly there to block, where an attacker only notionally is. */
      const heldBack = policy ? pilotOrThrow().heldBackCreatures(eligibleAttackers, policy) : null;
      eligibleAttackers.forEach((creature) => {
        if (heldBack && heldBack.has(creature)) return;
        const connected = creature.power * connectRateFor(creature);
        attackPower += connected;
        if (creature.hasLifelink) lifelinkGain += connected;
      });
      battlefieldCreatures.forEach((creature) => { creature.sick = false; });
      if (boardCombat) {
        /* THE ATTACK, AGAINST A BOARD. attackPower and lifelinkGain above are the
           estimate's arithmetic and are ignored here: the attackers are the
           creatures themselves, the defending seat blocks with what it has, and
           both sides lose what dies. */
        const attacking = eligibleAttackers.filter((creature) => !heldBack || !heldBack.has(creature));
        const living = seats.filter((seat) => seat.life > 0);
        if (attacking.length && living.length) {
          const threatOf = (seat, at) => (boardCombat ? seatPower(seat) : byTurn(seat.threat, at) * seat.deviation);
          const shares = policy
            ? pilotOrThrow().allocateCombatDamage(living, 1, turn, policy, threatOf)
            : [{seat: living.reduce((low, seat) => (seat.life < low.life ? seat : low), living[0]), amount: 1}];
          /* A share of the damage becomes a share of the ATTACKERS: one combat per
             seat that gets any. Spread deals a third to each, so a third of the
             creatures go to each -- which is the closest a real combat step comes
             to a policy written for a scalar. */
          const groups = shares.map((share) => ({seat: share.seat, attackers: []}));
          attacking.forEach((creature, index) => { groups[index % groups.length].attackers.push(creature); });
          groups.forEach((group) => {
            if (!group.attackers.length) return;
            /* The seat blocks, so the pricing here is ITS life and the neutral
               weight -- our pilot's lifeWeight says what OUR life is worth to us,
               and lending it to an opponent would be reading our own mind onto
               theirs. */
            const out = Combat.fight(group.attackers, group.seat.creatures, {life: group.seat.life});
            group.seat.life -= out.damageToPlayer;
            life += out.lifelinkGain;
            out.blockersDead.forEach((dead) => {
              const at = group.seat.creatures.indexOf(dead);
              if (at >= 0) group.seat.creatures.splice(at, 1);
            });
            out.attackersDead.forEach((dead) => {
              const at = battlefieldCreatures.indexOf(dead);
              if (at >= 0) battlefieldCreatures.splice(at, 1);
              if (dead.commander) commanderOnField = false;
            });
          });
          // Attacking taps a creature, so it is not there to block on the way
          // back -- which is what makes keeping one home a real decision.
          attacking.forEach((creature) => { if (!creature.hasVigilance) creature.tapped = true; });
        }
      } else if (attackPower > 0) {
        const living = seats.filter((seat) => seat.life > 0);
        if (living.length) {
          if (policy) {
            pilotOrThrow()
              .allocateCombatDamage(living, attackPower, turn, policy, (seat, at) => byTurn(seat.threat, at) * seat.deviation)
              .forEach((assignment) => { assignment.seat.life -= assignment.amount; });
          } else {
            const target = living.reduce((lowest, seat) => (seat.life < lowest.life ? seat : lowest), living[0]);
            target.life -= attackPower;
          }
          life += lifelinkGain;
        }
      }
      // Sacrifice, once there is both an outlet and something that pays for a
      // death. This runs after combat, so a creature attacks and is then eaten;
      // the cost is the attacks it will not make later. A body is only fed to
      // the outlet when its death pays more than the body was going to hit for,
      // which is the decision a pilot actually makes -- eating the whole board
      // for one point each is not how the deck plays, and modeling it that way
      // made an outlet read as a liability.
      if (sacOutlets > 0 && (deathDrain > 0 || deathDraw > 0)) {
        const livingSeats = Math.max(1, seats.filter((seat) => seat.life > 0).length);
        const payoff = deathDrain * livingSeats + deathDraw * DEATH_DRAW_VALUE;
        const spare = Math.max(0, battlefieldCreatures.length - SAC_KEEP_BACK);
        const worthEating = battlefieldCreatures
          .map((creature, index) => ({creature, index}))
          .filter((entry) => !entry.creature.commander && entry.creature.power < payoff)
          .sort((a, b) => a.creature.power - b.creature.power)
          .slice(0, Math.min(spare, SAC_PER_OUTLET * sacOutlets));
        if (worthEating.length) {
          worthEating.map((entry) => entry.index).sort((a, b) => b - a)
            .forEach((index) => { battlefieldCreatures.splice(index, 1); });
          if (deathDrain) {
            seats.forEach((seat) => { seat.life -= deathDrain * worthEating.length; });
          }
          for (let drawn = 0; drawn < deathDraw * worthEating.length && library.length; drawn += 1) {
            hand.push(library.shift());
            cardsSeen += 1;
          }
        }
      }
      if (drainAll) seats.forEach((seat) => { seat.life -= drainAll; });
      if (drainOne) {
        const alive = seats.filter((seat) => seat.life > 0);
        if (alive.length) alive.reduce((lowest, seat) => (seat.life < lowest.life ? seat : lowest), alive[0]).life -= drainOne;
      }
      seats.forEach((seat) => { if (seat.life <= 0 && seat.eliminatedTurn === null) seat.eliminatedTurn = turn; });
      if (seats.every((seat) => seat.life <= 0)) {
        won = true;
        break;
      }

      // A four-player pod is not three decks aimed at one player. Each seat sends
      // a share of its damage at us and spreads the rest across the other seats,
      // which is what makes a game closable: by the time we can attack, the table
      // has already softened itself up.
      const living = seats.filter((seat) => seat.life > 0);
      /* Under board combat a seat's output is its actual creatures, not its
         curve -- otherwise the same power is counted twice, once as bodies that
         attack us and once as a number that hits its peers. */
      const outputOf = (seat) => (boardCombat ? seatPower(seat) : byTurn(seat.threat, turn) * seat.deviation);
      const peerDamage = living.reduce((sum, seat) => sum + outputOf(seat), 0) * (1 - AIMED_AT_US);
      living.forEach((seat) => {
        const fromOthers = (peerDamage - outputOf(seat) * (1 - AIMED_AT_US)) / Math.max(1, living.length - 1);
        seat.life -= fromOthers;
      });
      // Creatures we control soak damage by blocking, which is the only defensive
      // value the model gives a board beyond its attack power. Weighted by total
      // toughness rather than raw count, so a handful of high-toughness walls
      // mitigate more than the same number of 1-toughness tokens would. Deathtouch and first
      // strike add a flat deterrence bonus on top of raw toughness (see the constants above) --
      // a rough stand-in for "this blocker trades with anything" rather than a real combat
      // simulation.
      const totalToughness = battlefieldCreatures.reduce((sum, creature) => {
        const worth = (creature.toughness || 1) + (creature.hasDeathtouch ? DEATHTOUCH_DETERRENCE : 0) + (creature.hasFirstStrike ? FIRST_STRIKE_DETERRENCE : 0);
        return sum + worth * (heldBack && heldBack.has(creature) ? 2 : 1);
      }, 0);
      const blockReduction = Math.min(0.55, totalToughness * 0.025);
      for (const seat of seats) {
        if (seat.life <= 0) continue;
        if (boardCombat) {
          /* THEIR ATTACK, AGAINST OUR BOARD. A share of the seat's creatures come
             at us and we choose the blocks -- with whatever did not attack this
             turn, because a creature that attacked is tapped. That is the whole
             of why holding one back is a decision rather than a loss. */
          const ready = seat.creatures.filter((creature) => !creature.sick);
          const count = Math.round(ready.length * AIMED_AT_US);
          if (count > 0) {
            const attackers = ready.slice(0, count);
            // ...and here WE block, so this is where Playstyle enters combat.
            const out = combatOrThrow().fight(attackers, battlefieldCreatures, {
              life, lifeWeight: policy ? policy.combat.lifeWeight : 1
            });
            life -= out.damageToPlayer;
            out.blockersDead.forEach((dead) => {
              const at = battlefieldCreatures.indexOf(dead);
              if (at >= 0) battlefieldCreatures.splice(at, 1);
              if (dead.commander) commanderOnField = false;
            });
            out.attackersDead.forEach((dead) => {
              const at = seat.creatures.indexOf(dead);
              if (at >= 0) seat.creatures.splice(at, 1);
            });
          }
        } else {
          life -= byTurn(seat.threat, turn) * seat.deviation * AIMED_AT_US * (1 - blockReduction);
        }
        if (rng() < byTurn(seat.interaction, turn) && battlefieldCreatures.length) {
          battlefieldCreatures.sort((a, b) => b.power - a.power);
          const removed = battlefieldCreatures.shift();
          if (removed?.commander) commanderOnField = false;
        }
        if (rng() < (seat.wipeChance || 0)) {
          // A wipe is symmetrical: it takes their boards too, not only ours.
          if (boardCombat) seats.forEach((other) => { other.creatures.length = 0; });
          battlefieldCreatures.length = 0;
          drainAll *= 0.5;
          drainOne *= 0.5;
        }
        let seatWin = seat.winTurn;
        if (heldAnswers > 0 && turn >= seatWin - 1) {
          seatWin += policy ? policy.hold.delayTurns : 1.5;
          seat.winTurn = seatWin;
          heldAnswers -= 1;
          /* AND THEN THE ANSWER IS GONE. heldAnswers is recounted from hand at the
             top of every turn, so without this one instant in hand pushes back every
             combo on the table, every turn, for the whole game and is never cast --
             a single Swords to Plowshares as an infinite supply of answers. Measured:
             it made deliberately holding mana up worth +15.66, five points more than
             any real decision, because the pilot was being paid for a card it never
             spent.

             Gated on the policy, so the published protocol -- which has always
             counted this way, and whose every number was produced under it -- is
             untouched. Both lens policies turn it on, which is what makes the two
             halves of the gap comparable. */
          if (policy && policy.hold.answerIsSpent) {
            let cheapest = -1;
            hand.forEach((index, position) => {
              const answer = profiles[index];
              if (!answer.instantSpeed || !(answer.isRemoval || answer.isProtection)) return;
              if (cheapest < 0 || answer.cmc < profiles[hand[cheapest]].cmc) cheapest = position;
            });
            if (cheapest >= 0) cast.add(hand.splice(cheapest, 1)[0]);
          }
        }
        if (turn >= seatWin) {
          lost = true;
          lossCause = `${seat.key} combo`;
          break;
        }
      }
      if (life <= 0) {
        lost = true;
        lossCause = "damage";
      }
    }

    if (cardStats) {
      drawn.forEach((index) => {
        const stat = cardStats.get(profiles[index].name);
        if (stat) {
          stat.drawn += 1;
          if (!cast.has(index)) stat.dead += 1;
          else if (won) stat.winsWhenCast += 1;
          if (cast.has(index)) stat.gamesWithCast += 1;
        }
      });
    }

    const landRatio = cardsSeen ? landsDrawn / cardsSeen : 0;
    const screwed = manaBehind >= 2 || (lands + rocks <= 2 && endTurn >= 4);
    // Fun/participation signals: did the deck actually get to do something
    // (not screwed out with an empty board and no commander), and did the
    // game last long enough to feel like a real game either way — a turn-4
    // stomp is as bad for a friendly pod as a turn-4 loss.
    const participated = !(screwed && !commanderTurn && peakBoard <= 1);
    const reasonablePace = endTurn >= 5;

    // Pod signals: the same game read from the other three seats. My Fun asks
    // whether I got to play; these ask what the table's evening looked like.
    // Idle turns are the direct cost of knocking someone out early -- a player
    // eliminated on turn 6 of a 12-turn game sits out half the game.
    seats.forEach((seat) => { if (seat.life <= 0 && seat.eliminatedTurn === null) seat.eliminatedTurn = endTurn; });
    const eliminated = seats.filter((seat) => seat.eliminatedTurn !== null);
    const idleTurns = eliminated.reduce((sum, seat) => sum + Math.max(0, endTurn - seat.eliminatedTurn), 0);
    const survivingSeats = seats.length - eliminated.length;
    // A table is "still playing" while at least two opponents remain, which is
    // when the game still has real politics and real decisions left in it.
    const firstElimination = eliminated.length ? Math.min(...eliminated.map((seat) => seat.eliminatedTurn)) : endTurn;

    return {
      won,
      endTurn,
      idleTurns,
      survivingSeats,
      firstElimination,
      lossCause,
      mulligans,
      commanderTurn,
      screwed,
      flooded: landRatio > 0.55 && endTurn >= 6,
      interactionRate: measuredTurns ? interactionTurns / measuredTurns : 0,
      deadCardsAtEight,
      life,
      participated,
      peakBoard,
      reasonablePace
    };
  }

  function emptyMetrics() {
    return {
      games: 0,
      wins: 0,
      winRate: 0,
      avgWinTurn: 0,
      avgEndTurn: 0,
      screwPct: 0,
      floodPct: 0,
      mulliganRate: 0,
      avgCommanderTurn: 0,
      commanderCastRate: 0,
      interactionAvailability: 0,
      deadCardsAtT8: 0,
      lossCauses: {},
      /* GAMES THAT NEITHER ENDED. A game that reaches maxTurns with nobody dead is not
         a loss -- it is a game the compute budget cut short -- but winRate is wins/games,
         so it lands in the denominator looking exactly like one. Slow decks pay for the
         cutoff. Reported separately here rather than folded into the score, because
         changing the score would rewrite every published rung; a reader who can see
         "18% of these games never finished" can discount the win rate themselves. */
      incompleteRate: 0,
      participationRate: 0,
      avgPeakBoard: 0,
      reasonablePaceRate: 0,
      avgIdleTurns: 0,
      avgSurvivingSeats: 0,
      avgFirstElimination: 0,
      funScore: 0,
      podFunScore: 0,
      score: 0
    };
  }

  function summarize(totals) {
    const games = totals.games || 1;
    return {
      games: totals.games,
      wins: totals.wins,
      winRate: totals.wins / games,
      avgWinTurn: totals.wins ? totals.winTurnSum / totals.wins : 0,
      avgEndTurn: totals.endTurnSum / games,
      screwPct: totals.screwed / games,
      floodPct: totals.flooded / games,
      mulliganRate: totals.mulligans / games,
      avgCommanderTurn: totals.commanderGames ? totals.commanderTurnSum / totals.commanderGames : 0,
      commanderCastRate: totals.commanderGames / games,
      interactionAvailability: totals.interactionSum / games,
      deadCardsAtT8: totals.deadSum / games,
      lossCauses: totals.lossCauses,
      incompleteRate: (totals.incomplete || 0) / games,
      participationRate: totals.participatedSum / games,
      avgPeakBoard: totals.peakBoardSum / games,
      reasonablePaceRate: totals.reasonablePaceSum / games,
      avgIdleTurns: totals.idleTurnSum / games,
      avgSurvivingSeats: totals.survivingSeatSum / games,
      avgFirstElimination: totals.firstEliminationSum / games
    };
  }

  // One reasonable operationalization of "fun," not a settled definition —
  // see SIMPLIFICATIONS. Half weight on actually getting to play, three
  // tenths on a board actually developing (capped at 4 permanents, since more
  // than that is already a fully realized board for this purpose), two
  // tenths on the game lasting long enough to feel like a real game.
  function funScoreFor(metrics) {
    return clamp01(
      (metrics.participationRate ?? 1) * 0.5
      + Math.min(1, (metrics.avgPeakBoard ?? 0) / 4) * 0.3
      + (metrics.reasonablePaceRate ?? 1) * 0.2
    );
  }

  // Pod Fun: the same game read from the other three seats. My Fun asks whether
  // this deck let ME play; this asks what the evening looked like for everyone
  // else at the table, which is the thing that decides whether a pod invites the
  // deck back. Deliberately built to discriminate rather than to detect
  // disasters -- every term below has real spread across real decks, which is
  // exactly what funScoreFor lacks (its three inputs sit at their ceilings for
  // roughly three quarters of decks, so weighting it changes nothing).
  //
  //   idle      45%  turns an eliminated player spends watching, per opponent,
  //                  measured against the length of the game they were dropped
  //                  from. Knocking two players out at turn 6 of a turn-12 game
  //                  costs the table twelve player-turns of doing nothing.
  //   survivors 30%  how much of the table was still playing at the end. A game
  //                  that ends with everyone alive beats one that ends 1-on-1.
  //   patience  25%  how deep the game got before the first player died. Early
  //                  eliminations are the single clearest "no fun" signal a pod
  //                  reports, independent of who did the eliminating.
  function podFunScoreFor(metrics) {
    const endTurn = Math.max(1, metrics.avgEndTurn ?? 1);
    const opponents = 3;
    // Worst realistic case: every opponent knocked out at the halfway mark.
    const idleBudget = Math.max(1, endTurn * 0.5 * opponents);
    const idleNorm = clamp01(1 - (metrics.avgIdleTurns ?? 0) / idleBudget);
    const survivorNorm = clamp01((metrics.avgSurvivingSeats ?? opponents) / opponents);
    // Full credit once the first elimination lands at or past turn 9; no credit
    // for a table where someone dies on turn 4.
    const patienceNorm = clamp01(((metrics.avgFirstElimination ?? endTurn) - 4) / 5);
    return clamp01(idleNorm * 0.45 + survivorNorm * 0.3 + patienceNorm * 0.25);
  }

  // Win rate is scored against a BAND, not maximized. A quarter of the games is
  // a fair share of a four-player pod; below the floor the deck is too weak to
  // enjoy, and above the ceiling you become the archenemy and the invitations
  // stop. Full credit inside the band, a linear ramp up to it, and a decay above
  // it that reaches OVERSHOOT_FLOOR at a 100% win rate -- still positive, since
  // winning is not a failure, just no longer the thing being optimized.
  // Half credit once the deck is winning seven games in ten -- the point at
  // which it stops being the strong deck at the table and becomes the reason
  // the table stops inviting it -- and a quarter at total dominance. Still
  // positive at every win rate, because winning is not a failure; just no
  // longer the thing being optimized.
  const RUNAWAY_WIN_RATE = 0.7;
  // Share of the unbanded win-rate credit earned by a 50% win rate.
  const EVEN_SHARE_CREDIT = 0.85;
  const OVERSHOOT_FLOOR = 0.5;
  const DOMINANCE_FLOOR = 0.25;
  function winRateBandNorm(winRate, band) {
    const floor = Number(band?.floor);
    const ceiling = Number(band?.ceiling);
    // With no band configured the curve has to stay monotonic across the whole
    // range. It used to be min(1, winRate / 0.5), which saturated at an even
    // share of a four-player pod: every deck above 50% scored identically, so a
    // real improvement registered as no movement and, worse, a change that cost
    // win rate could still read as a gain from the other terms. Most of the
    // credit is still earned by the time a deck takes its share; the rest is
    // spread above it so the term never stops rising.
    if (!Number.isFinite(floor) || !Number.isFinite(ceiling) || floor <= 0 || ceiling <= floor) {
      return EVEN_SHARE_CREDIT * Math.min(1, winRate / 0.5)
        + (1 - EVEN_SHARE_CREDIT) * clamp01(winRate);
    }
    if (winRate < floor) return clamp01(winRate / floor);
    if (winRate <= ceiling) return 1;
    const overshoot = (winRate - ceiling) / Math.max(0.01, RUNAWAY_WIN_RATE - ceiling);
    return clamp01(Math.max(DOMINANCE_FLOOR, 1 - overshoot * (1 - OVERSHOOT_FLOOR)));
  }

  /* WHERE THE NUMBER COMES FROM, ITEM BY ITEM.
   * ------------------------------------------
   * The score is a weighted sum of nine normalized measurements, and for a long time it
   * was only ever returned as the sum -- one number, on a page, with no way to ask what
   * made it. "51.33" against a deck somebody just built reads as a verdict rather than a
   * measurement, and a verdict you cannot interrogate is worth less than no number at all.
   *
   * So the parts are computed once, here, and both the total and the breakdown come from
   * the same array. They cannot disagree, because there is only one of them.
   *
   * Each part carries:
   *   norm    0..1, how well the deck did on that measurement
   *   weight  its share of the hundred
   *   points  weight * norm * 100 -- what it actually contributed
   *   max     weight * 100 -- what it could have contributed
   *   lost    max - points, which is the column to sort on when looking for the problem
   *   reads   the raw measurement in words, because "0.42" is not an answer to "why"
   */
  function scoreParts(metrics, weights = DEFAULT_WEIGHTS, targets = DEFAULT_TARGETS, commanderCmc = 4, band = null) {
    const pct = (v) => `${(v * 100).toFixed(1)}%`;
    const rows = [
      {key: "winRate", label: "Wins games",
       norm: winRateBandNorm(metrics.winRate, band), weight: weights.winRate ?? 0,
       reads: `wins ${pct(metrics.winRate)} of games` +
         (band ? ` (banded: this rung is judged against ${pct(band.floor ?? 0)}–${pct(band.ceiling ?? 1)})` : ` against a 25% share of a four-player pod`)},
      {key: "screw", label: "Casts its spells",
       norm: Math.max(0, 1 - metrics.screwPct / Math.max(0.01, targets.screwPct * 2)),
       weight: weights.screw ?? 0,
       reads: `mana screwed in ${pct(metrics.screwPct)} of games, against a ${pct(targets.screwPct)} target`},
      {key: "flood", label: "Draws action, not lands",
       norm: Math.max(0, 1 - metrics.floodPct / Math.max(0.01, targets.floodPct * 2)),
       weight: weights.flood ?? 0,
       reads: `flooded in ${pct(metrics.floodPct)} of games, against a ${pct(targets.floodPct)} target`},
      {key: "commander", label: "Gets the commander down",
       norm: metrics.avgCommanderTurn
         ? Math.max(0, Math.min(1, 1 - (metrics.avgCommanderTurn - (commanderCmc + targets.commanderTurnAllowance)) / 4)) * metrics.commanderCastRate
         : 0,
       weight: weights.commander ?? 0,
       reads: metrics.avgCommanderTurn
         ? `cast on turn ${metrics.avgCommanderTurn.toFixed(1)} in ${pct(metrics.commanderCastRate)} of games ` +
           `(a ${commanderCmc}-drop should land by turn ${commanderCmc + targets.commanderTurnAllowance})`
         : "the commander was never cast"},
      {key: "interaction", label: "Has answers when it needs them",
       norm: Math.min(1, metrics.interactionAvailability / Math.max(0.05, targets.interactionAvailability)),
       weight: weights.interaction ?? 0,
       reads: `an answer in hand on ${pct(metrics.interactionAvailability)} of turns, against a ${pct(targets.interactionAvailability)} target`},
      {key: "clock", label: "Closes the game",
       norm: metrics.avgWinTurn ? Math.max(0, Math.min(1, (16 - metrics.avgWinTurn) / 8)) : 0,
       weight: weights.clock ?? 0,
       reads: metrics.avgWinTurn
         ? `wins on turn ${metrics.avgWinTurn.toFixed(1)} on average; turn 8 is full marks, turn 16 is none`
         : "no game was won, so there is no clock to measure"},
      {key: "deadCards", label: "Keeps its hand live",
       norm: Math.max(0, 1 - metrics.deadCardsAtT8 / Math.max(1, targets.deadCardsAtT8 * 2)),
       weight: weights.deadCards ?? 0,
       reads: `${metrics.deadCardsAtT8.toFixed(1)} uncastable cards in hand at turn 8, against a ${targets.deadCardsAtT8} target`},
      {key: "fun", label: "Is a deck you enjoy piloting",
       norm: funScoreFor(metrics), weight: weights.fun ?? 0,
       reads: `decisions per game and board presence, scored ${(funScoreFor(metrics) * 100).toFixed(0)} of 100`},
      {key: "podFun", label: "Is a deck the table enjoys",
       norm: podFunScoreFor(metrics), weight: weights.podFun ?? 0,
       reads: `how long the other three seats stayed in the game, scored ${(podFunScoreFor(metrics) * 100).toFixed(0)} of 100`}
    ];
    const scoring = rows.filter((row) => row.weight > 0);
    /* THE TOTAL COMES OFF THE RAW NORMS, not off the rounded ones. Summing values already
       rounded to three places moved D4 Felothar from 71.90 to 71.88 -- a published number
       changing because of how it was displayed, which is the one thing a breakdown must
       never do. Rounding is for the reader; the score is computed once, at full precision,
       exactly as it was before this function existed. */
    const total = scoring.reduce((sum, row) => sum + row.weight * row.norm, 0);
    const parts = scoring.map((row) => {
      const points = row.weight * row.norm * 100;
      const max = row.weight * 100;
      return Object.assign({}, row, {
        norm: Math.round(row.norm * 1000) / 1000,
        points: Math.round(points * 100) / 100,
        max: Math.round(max * 100) / 100,
        lost: Math.round((max - points) * 100) / 100
      });
    });
    return {parts, score: Math.round(total * 1000) / 10};
  }

  function compositeScore(metrics, weights = DEFAULT_WEIGHTS, targets = DEFAULT_TARGETS, commanderCmc = 4, band = null) {
    return scoreParts(metrics, weights, targets, commanderCmc, band).score;
  }

  // A 95% interval on the win rate, so a swap that moves the number by less than
  // the noise can be recognized as noise.
  function winRateInterval(metrics) {
    const games = Math.max(1, metrics.games);
    const rate = metrics.winRate;
    const margin = 1.96 * Math.sqrt(Math.max(rate * (1 - rate), 0.0001) / games);
    return {low: Math.max(0, rate - margin), high: Math.min(1, rate + margin), margin};
  }

  function simulateGames(cards, table, config, seed, onBatch) {
    const deck = prepareDeck(cards);
    const cardStats = new Map(deck.profiles.map((profile) => [profile.name, {
      name: profile.name,
      /* Carried so a readout can leave lands out of "the cards that carried the deck".
         A land is cast the turn it is drawn, every time, so it tops any list ranked on
         how often a draw became a cast -- which tells the reader nothing except that
         their deck contains lands. */
      isLand: Boolean(profile.isLand),
      isCommander: Boolean(profile.isCommander),
      drawn: 0,
      cast: 0,
      dead: 0,
      castTurnTotal: 0,
      gamesWithCast: 0,
      winsWhenCast: 0,
      stuckAtEight: 0
    }]));
    const totals = {
      games: 0,
      wins: 0,
      winTurnSum: 0,
      endTurnSum: 0,
      screwed: 0,
      flooded: 0,
      mulligans: 0,
      commanderTurnSum: 0,
      commanderGames: 0,
      interactionSum: 0,
      deadSum: 0,
      lossCauses: {},
      incomplete: 0,
      participatedSum: 0,
      peakBoardSum: 0,
      reasonablePaceSum: 0,
      idleTurnSum: 0,
      survivingSeatSum: 0,
      firstEliminationSum: 0
    };
    const games = Number(config.games || config.gamesPerIteration || 500);
    const batchSize = Number(config.batchSize || 100);
    for (let index = 0; index < games; index += 1) {
      const result = playGame(deck, table, config, hashSeed(seed, index), cardStats);
      totals.games += 1;
      totals.endTurnSum += result.endTurn;
      totals.mulligans += result.mulligans;
      totals.interactionSum += result.interactionRate;
      totals.deadSum += result.deadCardsAtEight;
      if (result.won) {
        totals.wins += 1;
        totals.winTurnSum += result.endTurn;
      } else if (result.lossCause) {
        totals.lossCauses[result.lossCause] = (totals.lossCauses[result.lossCause] || 0) + 1;
      } else {
        // Neither won nor lost: the turn cap ended it. Until now this fell through
        // every branch and was counted nowhere but `games`.
        totals.incomplete += 1;
      }
      if (result.screwed) totals.screwed += 1;
      if (result.flooded) totals.flooded += 1;
      if (result.commanderTurn) {
        totals.commanderGames += 1;
        totals.commanderTurnSum += result.commanderTurn;
      }
      if (result.participated) totals.participatedSum += 1;
      totals.peakBoardSum += result.peakBoard;
      if (result.reasonablePace) totals.reasonablePaceSum += 1;
      totals.idleTurnSum += result.idleTurns;
      totals.survivingSeatSum += result.survivingSeats;
      totals.firstEliminationSum += result.firstElimination;
      if (onBatch && (index + 1) % batchSize === 0) onBatch({completed: index + 1, total: games, metrics: summarize(totals)});
    }
    const metrics = summarize(totals);
    const commanderCmc = deck.commander?.profile.cmc || 4;
    metrics.funScore = funScoreFor(metrics);
    metrics.podFunScore = podFunScoreFor(metrics);
    /* The total and the breakdown from one computation, so the page can say what made
       the number rather than only what the number is. */
    const scored = scoreParts(metrics, config.scoreWeights || DEFAULT_WEIGHTS,
      config.targets || DEFAULT_TARGETS, commanderCmc, config.winRateBand || null);
    metrics.score = scored.score;
    metrics.scoreParts = scored.parts;
    // The deck's power under the performance vector, regardless of which
    // objective this run is optimizing. The constrained Fun rung needs this to
    // check that chasing pod experience has not quietly cost real strength.
    metrics.powerScore = config.powerWeights
      ? compositeScore(metrics, config.powerWeights, config.targets || DEFAULT_TARGETS, commanderCmc, config.powerBand ?? null)
      : metrics.score;
    metrics.winRateInterval = winRateInterval(metrics);
    const perCardStats = Array.from(cardStats.values()).map((stat) => ({
      name: stat.name,
      isLand: stat.isLand,
      isCommander: stat.isCommander,
      drawnRate: stat.drawn / Math.max(1, metrics.games),
      /* GAMES, not events, over games. `cast` counts every cast; `drawn` counts games in
         which the card was drawn at all -- so a row standing for 36 Mountains divided 5
         plays a game by 1 game and reported 500%. gamesWithCast asks the same question
         ("of the games you saw it, how often did you get to play it?") with a denominator
         it cannot exceed, and is identical to the old figure for a single-copy card. */
      castRate: stat.drawn ? stat.gamesWithCast / stat.drawn : 0,
      avgCastTurn: stat.cast ? stat.castTurnTotal / stat.cast : 0,
      deadRate: stat.drawn ? stat.dead / stat.drawn : 0,
      winRateWhenCast: stat.gamesWithCast ? stat.winsWhenCast / stat.gamesWithCast : 0,
      stuckRate: stat.drawn ? stat.stuckAtEight / stat.drawn : 0,
      games: stat.drawn
    }));
    return {metrics, perCardStats, commanderCmc, profiles: deck.profiles};
  }

  function analyzeGaps(metrics, options = {}) {
    const targets = {...DEFAULT_TARGETS, ...(options.targets || {})};
    const commanderCmc = options.commanderCmc || 4;
    const tableWinTurn = options.tableWinTurn || 10;
    const gaps = [];
    if (metrics.screwPct > targets.screwPct) {
      gaps.push({
        key: "mana-screw",
        severity: Math.round((metrics.screwPct - targets.screwPct) * 1000) / 10,
        observed: `${(metrics.screwPct * 100).toFixed(1)}% of games missed two or more land drops`,
        target: `${(targets.screwPct * 100).toFixed(0)}% or fewer`,
        rolesToFix: ["ramp", "land"]
      });
    }
    if (metrics.floodPct > targets.floodPct) {
      gaps.push({
        key: "flood",
        severity: Math.round((metrics.floodPct - targets.floodPct) * 1000) / 10,
        observed: `${(metrics.floodPct * 100).toFixed(1)}% of games drew more than 55% lands`,
        target: `${(targets.floodPct * 100).toFixed(0)}% or fewer`,
        rolesToFix: ["draw", "cut-land"]
      });
    }
    if (!metrics.avgCommanderTurn || metrics.avgCommanderTurn > commanderCmc + targets.commanderTurnAllowance) {
      gaps.push({
        key: "commander-access",
        severity: Math.round(((metrics.avgCommanderTurn || 12) - commanderCmc - targets.commanderTurnAllowance) * 10) / 10,
        observed: metrics.avgCommanderTurn
          ? `the commander lands on turn ${metrics.avgCommanderTurn.toFixed(1)} in ${(metrics.commanderCastRate * 100).toFixed(0)}% of games`
          : "the commander was never cast",
        target: `turn ${(commanderCmc + targets.commanderTurnAllowance).toFixed(1)} or earlier`,
        rolesToFix: ["ramp"]
      });
    }
    if (metrics.interactionAvailability < targets.interactionAvailability) {
      gaps.push({
        key: "interaction",
        severity: Math.round((targets.interactionAvailability - metrics.interactionAvailability) * 1000) / 10,
        observed: `an answer was in hand on ${(metrics.interactionAvailability * 100).toFixed(0)}% of turns 3 to 7`,
        target: `${(targets.interactionAvailability * 100).toFixed(0)}% or more`,
        rolesToFix: ["removal", "protection"]
      });
    }
    if (metrics.avgWinTurn && metrics.avgWinTurn > tableWinTurn - targets.winTurnMargin) {
      gaps.push({
        key: "clock",
        severity: Math.round((metrics.avgWinTurn - tableWinTurn + targets.winTurnMargin) * 10) / 10,
        observed: `wins arrive on turn ${metrics.avgWinTurn.toFixed(1)} against a table that ends around turn ${tableWinTurn.toFixed(1)}`,
        target: `turn ${(tableWinTurn - targets.winTurnMargin).toFixed(1)} or earlier`,
        rolesToFix: ["finisher", "threat"]
      });
    }
    if (!metrics.avgWinTurn) {
      gaps.push({
        key: "no-wins",
        severity: 100,
        observed: "the deck did not win a single simulated game",
        target: "at least one win in the sample",
        rolesToFix: ["finisher", "threat", "ramp"]
      });
    }
    if (metrics.deadCardsAtT8 > targets.deadCardsAtT8) {
      gaps.push({
        key: "dead-cards",
        severity: Math.round((metrics.deadCardsAtT8 - targets.deadCardsAtT8) * 10) / 10,
        observed: `${metrics.deadCardsAtT8.toFixed(1)} uncastable cards were stranded in hand on turn 8`,
        target: `${targets.deadCardsAtT8} or fewer`,
        rolesToFix: ["curve", "ramp"]
      });
    }
    return gaps.sort((a, b) => b.severity - a.severity);
  }

  return {
    SIMPLIFICATIONS,
    DEFAULT_TARGETS,
    DEFAULT_WEIGHTS,
    createRng,
    hashSeed,
    parseManaCost,
    classifyCard,
    prepareDeck,
    playGame,
    simulateGames,
    summarize,
    emptyMetrics,
    compositeScore,
    scoreParts,
    winRateBandNorm,
    funScoreFor,
    podFunScoreFor,
    winRateInterval,
    analyzeGaps
  };
});
