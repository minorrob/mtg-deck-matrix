/* THE PILOT. Who is holding the cards.
 *
 * WHY THIS EXISTS. Read sim-engine.js and count the parameters. The three
 * opponents are nine archetype curves across three power tiers and six
 * playstyles, sampled per seat, jittered per game -- a table that can be a
 * kitchen-table pod on one run and a bracket-3 night on the next. Then look at
 * our side of it. One mulligan rule. One cast-priority table. One attack target.
 * The deck under test has always been piloted by exactly one person, and that
 * person never changes.
 *
 * That asymmetry is why the app could not answer the question it most needed to
 * answer: is this deck weak, or is it being played the wrong way? A score is a
 * deck and a pilot multiplied together, and with one pilot you cannot factor it.
 *
 * WHAT A POLICY IS. Five decisions, each of which currently has exactly one
 * hard-coded answer in sim-engine.js:
 *
 *   1. MULLIGAN     which sevens you keep
 *   2. WHAT TO CAST which of the castable things you cast first
 *   3. WHO TO ATTACK where the damage goes
 *   4. HOLDING UP    whether you keep mana for the instant in your hand
 *   5. KEEPING BACK  whether every creature attacks
 *
 * A policy names an answer to each. BALANCED names the answers sim-engine has
 * always given, so a run with no policy and a run under BALANCED are the same
 * run, card for card and seed for seed -- and every published number stays what
 * it is. CASUAL and COMPETITIVE are the two ends the app actually asks about.
 *
 * THE POINT IS THE GAP. Run the same hundred under CASUAL and COMPETITIVE. The
 * difference separates the weaknesses that belong to the deck from the ones that
 * belong to the pilot. A deck that scores 65 casual and 82 competitive is not a
 * 65 deck; it is a deck being played the wrong way, and the seventeen points are
 * a sentence: "you can play this deck competitively by attacking the leader."
 * That sentence is the deliverable. advise() below writes it.
 *
 * A HONESTY NOTE ABOUT INTERACTION. The published protocol counts an answer as
 * "available" when you could have cast it with all your mana untapped, whether
 * or not you actually kept that mana up -- a counterfactual. The two lens
 * policies count it only when the mana was genuinely left over. That makes the
 * lens scores comparable with EACH OTHER and not directly with the published
 * number. Which is fine: the gap is the product, not the levels.
 */
(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.MtgPilotPolicy = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  /* ------------------------------------------------------------------ *
   * The five decisions, as data.
   * ------------------------------------------------------------------ */

  /* WHO TO ATTACK. Four readings of "the leader", and they disagree, which is
     the whole reason this parameter is interesting.

     Look at the shipped opponent profiles. The combo seat wins on turn 9 and has
     a threat output of 2 on turn 8 -- almost no board. The tokens seat wins on
     turn 11 with a threat output of 12. Attack the biggest board and you hit
     tokens. Attack the player closest to winning and you hit combo. Those are
     different players, and knowing which one to hit is most of what separates a
     competitive pilot from a casual one at a real table. */
  const TARGETS = {
    // Finish what the table started. Concentrates damage where it kills fastest,
    // which is why it closes games -- and why it so often kills the wrong seat.
    weakest: {
      label: "the player already on the ropes",
      pick: (living) => living.reduce((low, seat) => (seat.life < low.life ? seat : low), living[0])
    },
    // The biggest board. The intuitive read of "who is winning", and in this
    // model it is frequently wrong.
    board: {
      label: "the biggest board",
      pick: (living, turn, threatOf) => living.reduce((best, seat) => (threatOf(seat, turn) > threatOf(best, turn) ? seat : best), living[0])
    },
    // The player closest to actually winning, board or no board.
    clock: {
      label: "whoever is closest to winning",
      pick: (living) => living.reduce((best, seat) => {
        if (seat.winTurn !== best.winTurn) return seat.winTurn < best.winTurn ? seat : best;
        return seat.life < best.life ? seat : best;
      }, living[0])
    },
    // Everybody a bit. Nobody dies early, which is better for the table's evening
    // and worse for winning.
    spread: {label: "everyone, a bit at a time", pick: null}
  };

  function makePolicy(spec) {
    return {
      key: spec.key,
      label: spec.label,
      blurb: spec.blurb,
      mulligan: {
        minLands: 2, maxLands: 5, minEarlyPlays: 2, earlyCmc: 3, minProactive: 0,
        maxMulligans: null,
        ...(spec.mulligan || {})
      },
      // Offsets onto sim-engine's cast-priority table, not a replacement for it.
      // Zero everywhere means the engine's own numbers, untouched.
      cast: {
        ramp: 0, draw: 0, wipe: 0, finisher: 0, creature: 0,
        recursion: 0, tutor: 0, removal: 0, protection: 0, other: 0,
        wipeThreshold: 6, commanderThreshold: 95,
        ...(spec.cast || {})
      },
      /* `lifeWeight` is where Playstyle reaches combat: what a point of life is
         worth to this pilot, as a multiplier on the price combat.js computes from
         the life total. Below 1 is a pilot that treats life as a resource to
         spend and blocks less; above 1 is one that does not enjoy being hit. 1 is
         the neutral pricing, and it is what the published pilot uses. */
      combat: {target: "weakest", keepBack: 0, lifeWeight: 1, ...(spec.combat || {})},
      /* THE TWO HONEST RULES, both off by default because the published protocol
         does not use them. `fromUntappedMana`: an answer counts as available only
         when the mana for it was genuinely left over, not when it could have been.
         `answerIsSpent`: an answer that stops a combo is cast, and is then gone --
         without it one instant in hand delays every combo on the table every turn,
         forever. Both lens policies set both, so the two halves of the gap are
         measured the same way. */
      hold: {reserve: false, fromTurn: 4, fromUntappedMana: false, answerIsSpent: false, delayTurns: 1.5, ...(spec.hold || {})}
    };
  }

  /* THE PUBLISHED PILOT. Every value here is the value sim-engine.js already
     uses. Changing any of them re-bases every score in the repository, so they
     are pinned by tests/pilot-policy.mjs, which fails if this object stops being
     a no-op. */
  const BALANCED = makePolicy({
    key: "balanced",
    label: "Balanced",
    blurb: "The published pilot: keeps a workable seven, casts down the curve, and finishes off whoever is already low."
  });

  /* THE FRIEND WHO BROUGHT A DECK. Keeps the seven -- going to six for a hand
     with two lands and a play in it is not something most tables do. Jams the
     commander, because the commander is the reason the deck exists. Casts
     creatures. Does not tutor, and does not wipe a board they are also standing
     on. Taps out every turn, and finishes off whoever is already on the ropes. */
  const CASUAL = makePolicy({
    key: "casual",
    label: "Casual",
    blurb: "Keeps the seven, jams the commander, casts creatures, taps out every turn, and finishes off whoever is already low.",
    mulligan: {minLands: 2, maxLands: 6, minEarlyPlays: 1, maxMulligans: 1},
    cast: {creature: 6, recursion: 4, finisher: 2, tutor: -12, wipe: -25, commanderThreshold: 200},
    combat: {target: "weakest", keepBack: 0, lifeWeight: 1.4},
    hold: {reserve: false, fromUntappedMana: true, answerIsSpent: true}
  });

  /* THE PILOT WHO IS TRYING TO WIN. Mulligans a hand that cannot function and
     will go to five. Develops mana and cards before deploying the commander --
     the commander is a card, not a plan. Tutors, because a tutor is the best card
     in most decks. Keeps the cheapest instant-speed answer payable from turn four
     rather than tapping out. And attacks the player closest to winning, not the
     player closest to dead.

     MEASURED, ONE DECISION AT A TIME, across the six shipped hundreds. Three seeds
     of 8,000 games, on the honest answer rules, mean delta against the same
     baseline. Reproduce with `node tools/sim/pilot-ablation.mjs --seeds 3 --games 8000`:

       hold the cheapest answer up from t4    +11.54   (win rate 28.8% -> 37.1%)
       attack whoever is closest to winning   +10.93   (win rate 28.8% -> 47.0%)
       hold it up from turn two instead        +6.32   -- too early costs more than it buys
       creature-first cast order               +0.48
       develop-and-tutor cast order            +0.00
       jam the commander                       -0.10
       mulligan to five for a working hand     -0.51
       develop before deploying the commander  -1.49

     The two big ones are close in size and pull apart by deck -- Krenko's headroom
     is nearly all in who it attacks, Atraxa's nearly all in holding an answer up --
     which is why the app measures the attribution per deck rather than assuming it.

     The negatives are kept. A policy is a way of playing, not a pile of the moves
     that scored best; mulligan and commander discipline are what a competitive
     pilot actually does, whatever this model charges for them. */
  const COMPETITIVE = makePolicy({
    key: "competitive",
    label: "Competitive",
    blurb: "Mulligans to a functional hand, develops before deploying, tutors, holds an answer up, and attacks whoever is closest to winning.",
    mulligan: {minLands: 2, maxLands: 5, minEarlyPlays: 2, minProactive: 1, maxMulligans: 4},
    cast: {ramp: 5, draw: 5, tutor: 20, wipe: 10, creature: -6, removal: -4, commanderThreshold: 62},
    combat: {target: "clock", keepBack: 0, lifeWeight: 0.7},
    hold: {reserve: true, fromTurn: 4, fromUntappedMana: true, answerIsSpent: true}
  });

  /* ATTRIBUTION, MEASURED. A gap is a number; "attack the leader" is a claim
     about which decision produced it, and the two are not the same thing. Each
     entry here is the competitive policy with exactly one decision handed back to
     the casual pilot, so running it and taking the difference says what that one
     decision was worth ON THIS HUNDRED -- rather than on the six decks I happened
     to calibrate against.

     Ordered by what they were worth across the shipped six, so a caller running
     only one or two runs the ones most likely to matter. */
  const ABLATIONS = [
    {
      key: "target",
      decision: "who you attack",
      // The gerund is the headline; the contrast is the detail. Kept apart so
      // the sentence reads as English rather than as a spliced template.
      doing: "attacking whoever is closest to winning",
      instead: "finishing off the player already on the ropes",
      override: {combat: {target: CASUAL.combat.target}}
    },
    {
      key: "hold",
      decision: "whether you tap out",
      doing: "keeping the mana for an answer up from turn four",
      instead: "tapping out every turn",
      override: {hold: {reserve: false}}
    },
    {
      key: "mulligan",
      decision: "which sevens you keep",
      doing: "throwing back a seven that cannot function",
      instead: "keeping almost any seven with lands in it",
      override: {mulligan: {...CASUAL.mulligan}}
    },
    {
      key: "commander",
      decision: "when the commander comes down",
      doing: "developing mana and cards before deploying the commander",
      instead: "deploying the commander as soon as it is castable",
      override: {cast: {commanderThreshold: CASUAL.cast.commanderThreshold}}
    },
    {
      key: "blocking",
      decision: "what a point of life is worth",
      doing: "spending life to keep creatures on the board",
      instead: "blocking to stay on a comfortable life total",
      /* INERT WITHOUT BLOCKS. lifeWeight prices a block, and the estimate engine
         has no blocks to price -- so this decision measures exactly zero there,
         and a bare zero in a report invites the reader to conclude that blocking
         does not matter rather than that the engine could not see it. Anything
         reporting a credit has to say which engine it ran on. */
      needs: "board",
      override: {combat: {lifeWeight: CASUAL.combat.lifeWeight}}
    },
    {
      key: "order",
      decision: "what you cast first",
      doing: "casting the tutor and the ramp before the creature",
      instead: "casting the creature first",
      override: {cast: {
        ramp: CASUAL.cast.ramp, draw: CASUAL.cast.draw, tutor: CASUAL.cast.tutor,
        wipe: CASUAL.cast.wipe, creature: CASUAL.cast.creature, removal: CASUAL.cast.removal,
        recursion: CASUAL.cast.recursion, finisher: CASUAL.cast.finisher
      }}
    }
  ];

  /* The competitive policy with one decision reverted. Nested, because a policy is
     four small objects and a shallow spread would drop the fields the override
     does not name. */
  function without(key) {
    const found = ABLATIONS.find((entry) => entry.key === key);
    if (!found) throw new Error(`Unknown pilot decision "${key}"`);
    const patch = found.override;
    return {
      ...COMPETITIVE,
      key: `competitive-without-${key}`,
      label: `Competitive, but ${found.instead}`,
      mulligan: {...COMPETITIVE.mulligan, ...(patch.mulligan || {})},
      cast: {...COMPETITIVE.cast, ...(patch.cast || {})},
      combat: {...COMPETITIVE.combat, ...(patch.combat || {})},
      hold: {...COMPETITIVE.hold, ...(patch.hold || {})}
    };
  }

  const POLICIES = {balanced: BALANCED, casual: CASUAL, competitive: COMPETITIVE};
  // The pair the gap is measured across. Order matters: advice is phrased as a
  // move from the first to the second.
  const LENS = ["casual", "competitive"];

  function get(key) {
    if (!key) return BALANCED;
    if (typeof key === "object") return key;
    const found = POLICIES[key];
    if (!found) throw new Error(`Unknown pilot policy "${key}"`);
    return found;
  }

  /* ------------------------------------------------------------------ *
   * The decisions themselves. Pure, so the engine stays readable and these
   * stay testable without running a game.
   * ------------------------------------------------------------------ */

  /* Damage assignment for one attack step. Returns a list rather than a single
     seat so "spread" is expressible without the engine special-casing it. */
  function allocateCombatDamage(living, power, turn, policy, threatOf) {
    if (!living.length || !(power > 0)) return [];
    const mode = TARGETS[policy?.combat?.target] ? policy.combat.target : "weakest";
    if (mode === "spread") {
      const share = power / living.length;
      return living.map((seat) => ({seat, amount: share}));
    }
    return [{seat: TARGETS[mode].pick(living, turn, threatOf), amount: power}];
  }

  /* Which creatures stay home. The highest-toughness bodies, because the ones
     that block well are the ones worth not attacking with. Returns a Set the
     engine checks in two places: attackers skip it, and the block-reduction
     estimate counts it double -- a creature held back is certainly available to
     block, where an attacker only notionally is.
   *
   * SHIPPED AT ZERO, AND HERE IS WHY. Measured, this costs 10 to 13 points and
   * two-thirds of the win rate (keepBack 1: -10.41; keepBack 2: -13.34; win rate
   * 28.8% -> 14.4%). That is not a playstyle, it is a broken trade, and the cause
   * is in the model rather than in the decision: block reduction is
   * min(0.55, totalToughness * 0.025), which on the shipped decks' average
   * toughness of 3.2 is pinned at the cap from a board of seven creatures onward.
   * Past that point doubling a held-back body buys exactly nothing while the lost
   * attack is paid in full.
   *
   * A blocker cannot be worth anything until blocks are declared. So the
   * parameter stays, implemented and tested and set to zero, and the combat work
   * in docs/simulation-fidelity.md section 3 is what makes it mean something --
   * at which point this is the number it has to beat. */
  function heldBackCreatures(eligible, policy) {
    const keepBack = Number(policy?.combat?.keepBack || 0);
    if (!keepBack || !eligible.length) return null;
    const ranked = eligible.slice().sort((a, b) => (b.toughness || 1) - (a.toughness || 1));
    return new Set(ranked.slice(0, keepBack));
  }

  /* How much mana to refuse to spend. A pilot holding up an answer is not
     holding up a number -- they are holding up a specific card, and the cheapest
     one is what they can actually afford to keep live. Colour is not reserved:
     the model has no notion of which land is tapped (see SIMPLIFICATIONS). */
  function manaToReserve(handProfiles, mana, turn, policy) {
    const hold = policy?.hold;
    if (!hold?.reserve || turn < (hold.fromTurn ?? 4)) return 0;
    let cheapest = Infinity;
    for (const profile of handProfiles) {
      if (!profile.instantSpeed) continue;
      if (!profile.isRemoval && !profile.isProtection) continue;
      if (profile.cmc < cheapest) cheapest = profile.cmc;
    }
    return cheapest <= mana ? cheapest : 0;
  }

  /* ------------------------------------------------------------------ *
   * The gap, and what to say about it.
   * ------------------------------------------------------------------ */

  // Below this the two pilots did the same thing and saying otherwise is noise.
  // Two standard errors of a six-seed run is around 0.6; three points is a
  // comfortable margin over that and still small enough to be worth acting on.
  const MEANINGFUL = 3;
  // A part has to move by more than this to be named as a reason.
  const PART_MEANINGFUL = 0.8;

  function pct(value) { return `${Math.round((value || 0) * 100)}%`; }
  function one(value) { return (Math.round((value || 0) * 10) / 10).toFixed(1); }
  function round2(value) { return Math.round(value * 100) / 100; }
  function cap(text) { return text ? text.charAt(0).toUpperCase() + text.slice(1) : text; }

  /* What actually differs between two policies, in words. Used to attribute a
     gap without pretending a single run proves which knob caused it -- these are
     the differences that exist, stated as differences. */
  function differences(from, to) {
    const notes = [];
    if (from.combat.target !== to.combat.target) {
      notes.push({
        key: "target",
        text: `attack ${TARGETS[to.combat.target]?.label || to.combat.target} instead of ${TARGETS[from.combat.target]?.label || from.combat.target}`
      });
    }
    if (from.combat.keepBack !== to.combat.keepBack) {
      notes.push({
        key: "keep-back",
        text: to.combat.keepBack > from.combat.keepBack
          ? `keep ${to.combat.keepBack} creature${to.combat.keepBack === 1 ? "" : "s"} home to block`
          : "attack with everything instead of keeping blockers home"
      });
    }
    if (from.hold.reserve !== to.hold.reserve) {
      notes.push({
        key: "hold-up",
        text: to.hold.reserve
          ? "stop tapping out from turn four, so the instant in hand is a card you can actually cast"
          : "tap out rather than holding an answer up"
      });
    }
    if (from.mulligan.minProactive !== to.mulligan.minProactive || from.mulligan.minEarlyPlays !== to.mulligan.minEarlyPlays
      || from.mulligan.maxMulligans !== to.mulligan.maxMulligans) {
      notes.push({
        key: "mulligan",
        text: to.mulligan.minProactive > from.mulligan.minProactive || (to.mulligan.maxMulligans || 0) > (from.mulligan.maxMulligans || 0)
          ? "throw back a seven that cannot function, and be willing to go to five"
          : "keep almost any seven with lands in it"
      });
    }
    if (from.cast.tutor !== to.cast.tutor) {
      notes.push({key: "tutor", text: to.cast.tutor > from.cast.tutor ? "cast the tutor before the creature" : "cast the creature before the tutor"});
    }
    if (from.cast.commanderThreshold !== to.cast.commanderThreshold) {
      notes.push({
        key: "commander",
        text: to.cast.commanderThreshold < from.cast.commanderThreshold
          ? "develop mana and draw before deploying the commander"
          : "deploy the commander as soon as it is castable"
      });
    }
    return notes;
  }

  /* The part-by-part story. Both measurements carry scoreParts in the same
     order; pair them and report what moved. */
  function partDeltas(from, to) {
    const byKey = new Map((from.scoreParts || []).map((part) => [part.key, part]));
    return (to.scoreParts || [])
      .map((part) => {
        const before = byKey.get(part.key);
        if (!before) return null;
        return {
          key: part.key, label: part.label, max: part.max,
          before: before.points, after: part.points,
          delta: Number((part.points - before.points).toFixed(2))
        };
      })
      .filter(Boolean)
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  }

  /**
   * The sentence the app has been unable to write.
   *
   * Takes two measurements of the same hundred -- from deck-measure.js, under
   * the casual and the competitive policy -- and returns the advice, ordered by
   * how much it is worth.
   *
   * `credits` is the measured attribution: one entry per ablation actually run,
   * `{key, points}`, where points is what that single decision was worth ON THIS
   * DECK. With it, the headline names the decision that earned the points. Without
   * it, the headline says the gap exists and the detail lists the decisions that
   * differ, in the order they were worth across the shipped six -- which is a
   * weaker claim, and is worded as one.
   */
  function advise(casual, competitive, options) {
    const opts = options || {};
    const from = get(opts.fromPolicy || "casual");
    const to = get(opts.toPolicy || "competitive");
    const gap = round2((competitive?.score || 0) - (casual?.score || 0));
    const deck = opts.deckName ? `${opts.deckName} ` : "";
    const credits = (opts.credits || []).slice().sort((a, b) => b.points - a.points);
    const notes = differences(from, to);
    const parts = partDeltas(casual, competitive).filter((part) => Math.abs(part.delta) >= PART_MEANINGFUL);
    const out = [];

    if (Math.abs(gap) < MEANINGFUL) {
      out.push({
        key: "pilot-neutral",
        weight: 100,
        headline: "This deck plays about the same either way.",
        detail: `${deck}scores ${one(casual?.score)} played casually and ${one(competitive?.score)} played to win — ${one(Math.abs(gap))} points apart, which is inside the noise of the measurement. Its ceiling is in the hundred cards, not in the piloting. Play it however the table is playing.`
      });
      return out;
    }

    if (gap > 0) {
      const best = credits[0] && credits[0].points >= MEANINGFUL
        ? ABLATIONS.find((entry) => entry.key === credits[0].key)
        : null;
      out.push(best ? {
        key: "play-to-win",
        weight: 1000,
        headline: `You can play this deck competitively by ${best.doing}.`,
        detail: `${deck}scores ${one(casual?.score)} played casually and ${one(competitive?.score)} played to win — the same hundred cards, the same seeds, ${one(gap)} points apart. ${cap(best.doing)} rather than ${best.instead} is ${one(credits[0].points)} of those points on its own, measured by running the competitive line again with that one decision handed back.`
      } : {
        key: "play-to-win",
        weight: 1000,
        headline: "This deck has real headroom in how it is played.",
        detail: `${deck}scores ${one(casual?.score)} played casually and ${one(competitive?.score)} played to win. Those ${one(gap)} points are not in the cards — it is the same hundred under the same seeds. They are in the decisions, which differ in ${notes.length}: ${notes.map((note) => note.text).join("; ")}.`
      });
      credits.slice(best ? 1 : 0).forEach((credit) => {
        if (Math.abs(credit.points) < PART_MEANINGFUL) return;
        const entry = ABLATIONS.find((item) => item.key === credit.key);
        if (!entry) return;
        out.push({
          key: `credit-${credit.key}`,
          weight: 500 + Math.abs(credit.points),
          headline: credit.points > 0
            ? `${cap(entry.doing)} is worth ${one(credit.points)} points.`
            : `${cap(entry.doing)} costs this deck ${one(-credit.points)} points.`,
          detail: credit.points > 0
            ? `Measured against ${entry.instead}, on this hundred.`
            : `Measured against ${entry.instead}, this deck would rather you did that instead — ${entry.decision} is one place the competitive line does not suit it.`
        });
      });
    } else {
      out.push({
        key: "already-tuned",
        weight: 1000,
        headline: "Playing this deck harder does not make it better.",
        detail: `${deck}scores ${one(casual?.score)} played casually and ${one(competitive?.score)} played to win — it gets ${one(-gap)} points worse. The deck wants a board and the time to use it, and the competitive line trades both away. Deploy it, and let the game go long.`
      });
    }

    parts.slice(0, 3).forEach((part) => {
      out.push({
        key: `part-${part.key}`,
        weight: 100 + Math.abs(part.delta),
        headline: part.delta > 0
          ? `Played to win, it gains ${one(part.delta)} points on "${part.label.toLowerCase()}".`
          : `Played to win, it loses ${one(-part.delta)} points on "${part.label.toLowerCase()}".`,
        detail: `${one(part.before)} points casual against ${one(part.after)} competitive, out of ${one(part.max)}.`
      });
    });

    const winGap = (competitive?.winRate || 0) - (casual?.winRate || 0);
    if (Math.abs(winGap) >= 0.02) {
      out.push({
        key: "win-rate",
        weight: 90 + Math.abs(winGap) * 50,
        headline: winGap > 0
          ? `It wins ${pct(casual?.winRate)} of games played casually and ${pct(competitive?.winRate)} played to win.`
          : `It wins ${pct(casual?.winRate)} of games played casually and only ${pct(competitive?.winRate)} played to win.`,
        detail: `Same hundred, same seeds — ${pct(Math.abs(winGap))} of the table's games change hands on the piloting alone.`
      });
    }

    const funGap = (competitive?.podFunScore || 0) - (casual?.podFunScore || 0);
    if (funGap <= -0.05) {
      out.push({
        key: "pod-cost",
        weight: 80,
        headline: "Winning with it costs the table.",
        detail: `Pod experience falls from ${pct(casual?.podFunScore)} to ${pct(competitive?.podFunScore)} when the deck is played to win — players are knocked out earlier and spend more of the evening watching. Worth knowing before you take the competitive line to a kitchen table.`
      });
    }

    return out.sort((a, b) => b.weight - a.weight);
  }

  return {
    POLICIES, BALANCED, CASUAL, COMPETITIVE, LENS, TARGETS,
    MEANINGFUL, PART_MEANINGFUL,
    ABLATIONS, without,
    get, makePolicy,
    allocateCombatDamage, heldBackCreatures, manaToReserve,
    differences, partDeltas, advise
  };
});
