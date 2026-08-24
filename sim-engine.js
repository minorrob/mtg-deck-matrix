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

  function producedColors(card, typeLine, text) {
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
    if (/\bLand\b/.test(typeLine) && !produced.size) (card.colorIdentity || []).forEach((color) => produced.add(String(color).toUpperCase()));
    return Array.from(produced);
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
  function drainAmount(text, typeLine) {
    if (/Instant|Sorcery/.test(typeLine)) return {all: 0, one: 0};
    if (!/whenever|at the beginning of/.test(text)) return {all: 0, one: 0};
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
  function classifyCard(card) {
    const typeLine = String(card.typeLine || "");
    const text = String(card.oracleText || "").toLowerCase().replace(/[’]/g, "'");
    const firstLine = text.split("\n")[0] || "";
    const cost = parseManaCost(card.manaCost);
    const cmc = Number.isFinite(Number(card.cmc)) && Number(card.cmc) > 0 ? Number(card.cmc) : cost.value;
    const isLand = /\bLand\b/.test(typeLine);
    const isCreature = /Creature/.test(typeLine);
    const instantSpeed = /Instant/.test(typeLine) || /flash/.test(text);
    const power = estimatePower(card, cmc, typeLine, text);
    const toughness = estimateToughness(card, cmc, typeLine, text);
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
      entersTapped: /enters (?:the battlefield )?tapped/.test(text),
      produces: producedColors(card, typeLine, text),
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
      isRamp: !isLand && (/\{t\}: add|add \{[wubrgc]\}/.test(text) || /search your library for (?:a|up to two|two)[^.]{0,30}land[^.]{0,30}onto the battlefield|you may play an additional land|create a treasure token/.test(text)),
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

  function keepableHand(hand, profiles) {
    let lands = 0;
    let earlyPlays = 0;
    hand.forEach((index) => {
      const profile = profiles[index];
      if (profile.isLand) lands += 1;
      else if (profile.cmc <= 3) earlyPlays += 1;
    });
    return lands >= 2 && lands <= 5 && earlyPlays >= 2;
  }

  function castable(profile, mana, sources, commanderTax = 0) {
    const cost = profile.cmc + commanderTax;
    if (cost > mana) return false;
    for (const color of COLORS) {
      if (profile.pips[color] > (sources[color] || 0)) return false;
    }
    return true;
  }

  function castPriority(profile, turn, state) {
    if (profile.isRamp && turn <= 6) return 100 - profile.cmc;
    if (profile.isDraw) return 80 - profile.cmc + (state.cardsInHand <= 2 ? 12 : 0);
    if (profile.isWipe) return state.opponentBoard >= 6 ? 90 : 20;
    if (profile.isFinisher) return 62 + Math.min(10, profile.power);
    if (profile.isCreature) return 58 + Math.min(8, profile.power) - profile.cmc * 0.5;
    if (profile.isRecursion) return 55;
    if (profile.isTutor) return 52;
    if (profile.isRemoval) return profile.instantSpeed ? 12 : 48;
    if (profile.isProtection) return profile.instantSpeed ? 10 : 44;
    return 30;
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
    const seats = [];
    for (let index = 0; index < 3; index += 1) seats.push(seatFrom(sampleProfile(table, rng), rng));
    let library = shuffle(deck.library, rng);
    let hand = [];
    let mulligans = 0;
    for (;;) {
      hand = library.slice(0, 7);
      if (mulligans >= (config.mulligans ?? 3) || keepableHand(hand, profiles)) break;
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
    const makeCreatureEntry = (profile, powerOverride) => {
      const startingCounters = profile.entersWithCounters ? scaledCounters(profile.entersWithCounters) : 0;
      return {
        basePower: powerOverride + profile.boardWidth * 2,
        baseToughness: profile.toughness,
        counters: startingCounters,
        power: powerOverride + profile.boardWidth * 2 + startingCounters,
        toughness: profile.toughness + startingCounters,
        sick: true,
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

      const landInHand = hand.findIndex((index) => profiles[index].isLand);
      if (landInHand >= 0) {
        const [played] = hand.splice(landInHand, 1);
        const profile = profiles[played];
        lands += 1;
        profile.produces.forEach((color) => { sources[color] += 1; });
        if (!profile.produces.length) COLORS.forEach((color) => { sources[color] += 0; });
        cast.add(played);
      } else if (turn <= 6 && lands < 5) {
        // Only a drop missed while still short on mana is screw; running out of
        // lands in hand after five are already down is just a normal curve.
        missedDrops += 1;
      }

      let mana = lands + rocks;
      if (turn >= 3 && turn <= 6 && mana < turn - 1) manaBehind += 1;
      opponentBoard = seats.reduce((sum, seat) => sum + byTurn(seat.threat, turn) * seat.deviation, 0);
      const state = {cardsInHand: hand.length, opponentBoard};
      for (;;) {
        let bestPosition = -1;
        let bestPriority = -Infinity;
        const ourPower = battlefieldCreatures.reduce((sum, creature) => sum + creature.power, 0);
        hand.forEach((index, position) => {
          const profile = profiles[index];
          if (profile.isLand) return;
          if (profile.isWipe && profile.wipesOwnBoard && ourPower > opponentBoard * 0.6) return;
          if (!castable(profile, mana, sources)) return;
          const priority = castPriority(profile, turn, state);
          if (priority > bestPriority) {
            bestPriority = priority;
            bestPosition = position;
          }
        });
        const commanderProfile = deck.commander?.profile;
        const commanderCost = commanderProfile ? commanderProfile.cmc + commanderTax : Infinity;
        const commanderCastable = commanderProfile && !commanderOnField && castable(commanderProfile, mana, sources, commanderTax);
        if (commanderCastable && (bestPosition < 0 || bestPriority < 95)) {
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
          }
          drainAll += commanderProfile.drain.all;
          drainOne += commanderProfile.drain.one;
          resolveCountersAndProliferate(commanderProfile);
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
          options.sort((a, b) => castPriority(profiles[b], turn, state) - castPriority(profiles[a], turn, state));
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
          if (profile.wipesOwnBoard) battlefieldCreatures.length = 0;
        }
        if (profile.isDrainSpell) seats.forEach((seat) => { seat.life -= profile.drainSpellAmount; });
        if (profile.isRemoval && !profile.instantSpeed) {
          const target = seats.reduce((best, seat) => (byTurn(seat.threat, turn) > byTurn(best.threat, turn) ? seat : best), seats[0]);
          target.deviation *= 0.8;
        }
        drainAll += profile.drain.all;
        drainOne += profile.drain.one;
        if (profile.isCreature) {
          const creaturePower = (profile.isDefender && defendersDealToughnessDamage) ? profile.toughness : profile.power;
          battlefieldCreatures.push(makeCreatureEntry(profile, creaturePower));
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

      heldAnswers = hand.filter((index) => profiles[index].instantSpeed && (profiles[index].isRemoval || profiles[index].isProtection)).length;
      if (turn >= 3 && turn <= 7) {
        measuredTurns += 1;
        if (heldAnswers > 0) interactionTurns += 1;
      }
      if (turn === 8) deadCardsAtEight = hand.filter((index) => !castable(profiles[index], lands + rocks, sources) && !profiles[index].isLand).length;

      // attackPower already carries each attacker's connect rate (flying/menace/trample get
      // more of their power through than a flat rate would), so it is applied directly below --
      // no further "unblocked factor" on top of it.
      let attackPower = 0;
      let lifelinkGain = 0;
      battlefieldCreatures.filter((creature) => !creature.sick && creature.canAttack).forEach((creature) => {
        const connected = creature.power * connectRateFor(creature);
        attackPower += connected;
        if (creature.hasLifelink) lifelinkGain += connected;
      });
      battlefieldCreatures.forEach((creature) => { creature.sick = false; });
      if (attackPower > 0) {
        const living = seats.filter((seat) => seat.life > 0);
        if (living.length) {
          const target = living.reduce((lowest, seat) => (seat.life < lowest.life ? seat : lowest), living[0]);
          target.life -= attackPower;
          life += lifelinkGain;
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
      const peerDamage = living.reduce((sum, seat) => sum + byTurn(seat.threat, turn) * seat.deviation, 0) * (1 - AIMED_AT_US);
      living.forEach((seat) => {
        const fromOthers = (peerDamage - byTurn(seat.threat, turn) * seat.deviation * (1 - AIMED_AT_US)) / Math.max(1, living.length - 1);
        seat.life -= fromOthers;
      });
      // Creatures we control soak damage by blocking, which is the only defensive
      // value the model gives a board beyond its attack power. Weighted by total
      // toughness rather than raw count, so a handful of high-toughness walls
      // mitigate more than the same number of 1-toughness tokens would. Deathtouch and first
      // strike add a flat deterrence bonus on top of raw toughness (see the constants above) --
      // a rough stand-in for "this blocker trades with anything" rather than a real combat
      // simulation.
      const totalToughness = battlefieldCreatures.reduce((sum, creature) => sum + (creature.toughness || 1) + (creature.hasDeathtouch ? DEATHTOUCH_DETERRENCE : 0) + (creature.hasFirstStrike ? FIRST_STRIKE_DETERRENCE : 0), 0);
      const blockReduction = Math.min(0.55, totalToughness * 0.025);
      for (const seat of seats) {
        if (seat.life <= 0) continue;
        life -= byTurn(seat.threat, turn) * seat.deviation * AIMED_AT_US * (1 - blockReduction);
        if (rng() < byTurn(seat.interaction, turn) && battlefieldCreatures.length) {
          battlefieldCreatures.sort((a, b) => b.power - a.power);
          const removed = battlefieldCreatures.shift();
          if (removed?.commander) commanderOnField = false;
        }
        if (rng() < (seat.wipeChance || 0)) {
          battlefieldCreatures.length = 0;
          drainAll *= 0.5;
          drainOne *= 0.5;
        }
        let seatWin = seat.winTurn;
        if (heldAnswers > 0 && turn >= seatWin - 1) {
          seatWin += 1.5;
          seat.winTurn = seatWin;
          heldAnswers -= 1;
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
  const OVERSHOOT_FLOOR = 0.5;
  function winRateBandNorm(winRate, band) {
    const floor = Number(band?.floor);
    const ceiling = Number(band?.ceiling);
    // With no band configured, keep the original monotonic curve.
    if (!Number.isFinite(floor) || !Number.isFinite(ceiling) || floor <= 0 || ceiling <= floor) {
      return Math.min(1, winRate / 0.5);
    }
    if (winRate < floor) return clamp01(winRate / floor);
    if (winRate <= ceiling) return 1;
    const overshoot = (winRate - ceiling) / Math.max(0.01, 1 - ceiling);
    return clamp01(1 - overshoot * (1 - OVERSHOOT_FLOOR));
  }

  function compositeScore(metrics, weights = DEFAULT_WEIGHTS, targets = DEFAULT_TARGETS, commanderCmc = 4, band = null) {
    const winRateNorm = winRateBandNorm(metrics.winRate, band);
    const screwNorm = Math.max(0, 1 - metrics.screwPct / Math.max(0.01, targets.screwPct * 2));
    const floodNorm = Math.max(0, 1 - metrics.floodPct / Math.max(0.01, targets.floodPct * 2));
    const commanderNorm = metrics.avgCommanderTurn
      ? Math.max(0, Math.min(1, 1 - (metrics.avgCommanderTurn - (commanderCmc + targets.commanderTurnAllowance)) / 4)) * metrics.commanderCastRate
      : 0;
    const interactionNorm = Math.min(1, metrics.interactionAvailability / Math.max(0.05, targets.interactionAvailability));
    const clockNorm = metrics.avgWinTurn ? Math.max(0, Math.min(1, (16 - metrics.avgWinTurn) / 8)) : 0;
    const deadNorm = Math.max(0, 1 - metrics.deadCardsAtT8 / Math.max(1, targets.deadCardsAtT8 * 2));
    const funNorm = funScoreFor(metrics);
    const podFunNorm = podFunScoreFor(metrics);
    const score = weights.winRate * winRateNorm
      + weights.screw * screwNorm
      + weights.flood * floodNorm
      + weights.commander * commanderNorm
      + weights.interaction * interactionNorm
      + weights.clock * clockNorm
      + weights.deadCards * deadNorm
      + (weights.fun ?? 0) * funNorm
      + (weights.podFun ?? 0) * podFunNorm;
    return Math.round(score * 1000) / 10;
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
      drawn: 0,
      cast: 0,
      dead: 0,
      castTurnTotal: 0,
      gamesWithCast: 0,
      winsWhenCast: 0
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
    metrics.score = compositeScore(metrics, config.scoreWeights || DEFAULT_WEIGHTS, config.targets || DEFAULT_TARGETS, commanderCmc, config.winRateBand || null);
    // The deck's power under the performance vector, regardless of which
    // objective this run is optimizing. The constrained Fun rung needs this to
    // check that chasing pod experience has not quietly cost real strength.
    metrics.powerScore = config.powerWeights
      ? compositeScore(metrics, config.powerWeights, config.targets || DEFAULT_TARGETS, commanderCmc, config.powerBand ?? null)
      : metrics.score;
    metrics.winRateInterval = winRateInterval(metrics);
    const perCardStats = Array.from(cardStats.values()).map((stat) => ({
      name: stat.name,
      drawnRate: stat.drawn / Math.max(1, metrics.games),
      castRate: stat.drawn ? stat.cast / stat.drawn : 0,
      avgCastTurn: stat.cast ? stat.castTurnTotal / stat.cast : 0,
      deadRate: stat.drawn ? stat.dead / stat.drawn : 0,
      winRateWhenCast: stat.gamesWithCast ? stat.winsWhenCast / stat.gamesWithCast : 0,
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
    winRateBandNorm,
    funScoreFor,
    podFunScoreFor,
    winRateInterval,
    analyzeGaps
  };
});
