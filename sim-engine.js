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
    "No stack: spells resolve when cast, and counterspells are modelled as generic interaction.",
    "No blocking assignment: combat damage is total attacking power times an unblocked factor, and a board's damage reduction is weighted by total toughness, not a real block.",
    "No politics: opponents never team up, and never target each other's threats instead of ours.",
    "Tutors draw the best of three random cards instead of choosing exactly.",
    "Tokens are modelled as extra power on the creature that makes them, not as separate bodies.",
    "Alternate win conditions and storm are scored as a large threat rather than an instant win.",
    "Mana fixing is ideal within the colors actually available from lands in play.",
    "A Defender creature contributes no attack power unless the deck also contains an effect that lets it attack anyway.",
    "Opponents are nine parameterised archetype curves (three power tiers, six playstyles), not simulated decks with real cards.",
    "The fun/participation score is one reasonable operationalisation of a subjective idea — a developed board and a game that didn't end suspiciously early either way — not a settled definition of \"fun.\""
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
    (text.match(/add \{([wubrgc])\}/g) || []).forEach((token) => {
      const color = token.replace(/[^wubrgc]/g, "").toUpperCase();
      if (COLORS.includes(color)) produced.add(color);
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

  // One pass over the card's own text decides everything the game loop knows
  // about it. Anything the loop cannot see is, by definition, not simulated.
  function classifyCard(card) {
    const typeLine = String(card.typeLine || "");
    const text = String(card.oracleText || "").toLowerCase().replace(/[’]/g, "'");
    const cost = parseManaCost(card.manaCost);
    const cmc = Number.isFinite(Number(card.cmc)) && Number(card.cmc) > 0 ? Number(card.cmc) : cost.value;
    const isLand = /\bLand\b/.test(typeLine);
    const isCreature = /Creature/.test(typeLine);
    const instantSpeed = /Instant/.test(typeLine) || /flash/.test(text);
    const power = estimatePower(card, cmc, typeLine, text);
    const toughness = estimateToughness(card, cmc, typeLine, text);
    const tokenMakers = (text.match(/create (?:a|an|two|three|x|\d+)[^.]{0,40}token/g) || []).length;
    const rampMatch = /add \{[wubrgc]\}\{[wubrgc]\}|search your library for (?:a|up to two|two) (?:basic )?land/.test(text) ? 2 : 1;
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
      price: Number(card.price || 0),
      gameChanger: Boolean(card.gameChanger)
    };
  }

  function prepareDeck(cards) {
    const profiles = [];
    const library = [];
    let commander = null;
    // A card that lifts the Defender restriction (e.g. Felothar the Steadfast)
    // is a deck-wide effect, checked once here rather than per creature.
    let defendersCanAttack = false;
    cards.forEach((card) => {
      const profile = classifyCard(card);
      if (profile.liftsDefender) defendersCanAttack = true;
      const index = profiles.push(profile) - 1;
      if (profile.isCommander && !commander) {
        commander = {profile, index};
        for (let copy = 1; copy < profile.quantity; copy += 1) library.push(index);
        return;
      }
      for (let copy = 0; copy < profile.quantity; copy += 1) library.push(index);
    });
    return {profiles, library, commander, defendersCanAttack};
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
          battlefieldCreatures.push({power: commanderProfile.power + commanderProfile.boardWidth * 2, toughness: commanderProfile.toughness, sick: true, commander: true, canAttack: !commanderProfile.isDefender || defendersCanAttack});
          drainAll += commanderProfile.drain.all;
          drainOne += commanderProfile.drain.one;
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
        if (profile.isCreature) battlefieldCreatures.push({power: profile.power + profile.boardWidth * 2, toughness: profile.toughness, sick: true, commander: false, canAttack: !profile.isDefender || defendersCanAttack});
      }
      peakBoard = Math.max(peakBoard, battlefieldCreatures.length);

      heldAnswers = hand.filter((index) => profiles[index].instantSpeed && (profiles[index].isRemoval || profiles[index].isProtection)).length;
      if (turn >= 3 && turn <= 7) {
        measuredTurns += 1;
        if (heldAnswers > 0) interactionTurns += 1;
      }
      if (turn === 8) deadCardsAtEight = hand.filter((index) => !castable(profiles[index], lands + rocks, sources) && !profiles[index].isLand).length;

      const attackPower = battlefieldCreatures.filter((creature) => !creature.sick && creature.canAttack).reduce((sum, creature) => sum + creature.power, 0);
      battlefieldCreatures.forEach((creature) => { creature.sick = false; });
      if (attackPower > 0) {
        const living = seats.filter((seat) => seat.life > 0);
        if (living.length) {
          const target = living.reduce((lowest, seat) => (seat.life < lowest.life ? seat : lowest), living[0]);
          target.life -= attackPower * 0.7;
        }
      }
      if (drainAll) seats.forEach((seat) => { seat.life -= drainAll; });
      if (drainOne) {
        const alive = seats.filter((seat) => seat.life > 0);
        if (alive.length) alive.reduce((lowest, seat) => (seat.life < lowest.life ? seat : lowest), alive[0]).life -= drainOne;
      }
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
      // mitigate more than the same number of 1-toughness tokens would.
      const totalToughness = battlefieldCreatures.reduce((sum, creature) => sum + (creature.toughness || 1), 0);
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
    return {
      won,
      endTurn,
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
      funScore: 0,
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
      reasonablePaceRate: totals.reasonablePaceSum / games
    };
  }

  // One reasonable operationalisation of "fun," not a settled definition —
  // see SIMPLIFICATIONS. Half weight on actually getting to play, three
  // tenths on a board actually developing (capped at 4 permanents, since more
  // than that is already a fully realised board for this purpose), two
  // tenths on the game lasting long enough to feel like a real game.
  function funScoreFor(metrics) {
    return clamp01(
      (metrics.participationRate ?? 1) * 0.5
      + Math.min(1, (metrics.avgPeakBoard ?? 0) / 4) * 0.3
      + (metrics.reasonablePaceRate ?? 1) * 0.2
    );
  }

  function compositeScore(metrics, weights = DEFAULT_WEIGHTS, targets = DEFAULT_TARGETS, commanderCmc = 4) {
    const winRateNorm = Math.min(1, metrics.winRate / 0.5);
    const screwNorm = Math.max(0, 1 - metrics.screwPct / Math.max(0.01, targets.screwPct * 2));
    const floodNorm = Math.max(0, 1 - metrics.floodPct / Math.max(0.01, targets.floodPct * 2));
    const commanderNorm = metrics.avgCommanderTurn
      ? Math.max(0, Math.min(1, 1 - (metrics.avgCommanderTurn - (commanderCmc + targets.commanderTurnAllowance)) / 4)) * metrics.commanderCastRate
      : 0;
    const interactionNorm = Math.min(1, metrics.interactionAvailability / Math.max(0.05, targets.interactionAvailability));
    const clockNorm = metrics.avgWinTurn ? Math.max(0, Math.min(1, (16 - metrics.avgWinTurn) / 8)) : 0;
    const deadNorm = Math.max(0, 1 - metrics.deadCardsAtT8 / Math.max(1, targets.deadCardsAtT8 * 2));
    const funNorm = funScoreFor(metrics);
    const score = weights.winRate * winRateNorm
      + weights.screw * screwNorm
      + weights.flood * floodNorm
      + weights.commander * commanderNorm
      + weights.interaction * interactionNorm
      + weights.clock * clockNorm
      + weights.deadCards * deadNorm
      + (weights.fun ?? 0) * funNorm;
    return Math.round(score * 1000) / 10;
  }

  // A 95% interval on the win rate, so a swap that moves the number by less than
  // the noise can be recognised as noise.
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
      reasonablePaceSum: 0
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
      if (onBatch && (index + 1) % batchSize === 0) onBatch({completed: index + 1, total: games, metrics: summarize(totals)});
    }
    const metrics = summarize(totals);
    const commanderCmc = deck.commander?.profile.cmc || 4;
    metrics.funScore = funScoreFor(metrics);
    metrics.score = compositeScore(metrics, config.scoreWeights || DEFAULT_WEIGHTS, config.targets || DEFAULT_TARGETS, commanderCmc);
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
    funScoreFor,
    winRateInterval,
    analyzeGaps
  };
});
