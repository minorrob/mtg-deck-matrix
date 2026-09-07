/* COMBAT. Creatures, blocks, and things dying.
 *
 * WHY THIS EXISTS. sim-engine.js has never had a combat step. It has an
 * arithmetic estimate of one:
 *
 *     attackPower = sum(creature.power * connectRate(creature))
 *     blockReduction = min(0.55, totalToughness * 0.025)
 *
 * No attacker is ever assigned to a blocker. Nothing ever dies. Nobody ever
 * decides anything. A deck whose whole plan is "many small bodies and go wide",
 * one built around a single huge trampler, and one that holds three untapped
 * blockers and wins late are all scored as a number times 0.7.
 *
 * That estimate was a reasonable place to start and it became the ceiling on
 * everything else. The clearest evidence is in docs/simulation-fidelity.md §3a:
 * keeping one creature home to block measured -10.42 points, not because it is
 * bad play but because blockReduction is CAPPED and sits at its cap on any board
 * of seven creatures, so a held-back body bought nothing while its lost attack
 * was paid in full. A blocker cannot be worth anything until blocks are declared.
 *
 * WHAT THIS MODULE IS. The rules half, kept pure and separate from the game loop:
 * given attackers, blockers and a way of valuing a creature, decide the blocks,
 * assign the damage, and say what died. No randomness, no state, no engine
 * internals -- so it can be tested against worked combats rather than against
 * whether a score moved.
 *
 * WHAT IT IS NOT, YET. The block-or-take decision here is the "fixed and obvious"
 * policy the design asks for first: block when it is a clean profit, chump only
 * when the damage would kill you. The real one prices life against board at this
 * life total (docs/simulation-fidelity.md §3, piece 4) and is where Playstyle
 * enters. Instants held up are not modelled at all. Both are named in the doc.
 */
(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.MtgCombat = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const SIMPLIFICATIONS = [
    "Blockers are chosen greedily, one attacker at a time, in the order the attackers were declared -- not by searching the assignment that is best overall.",
    "A creature blocks at most one attacker, which is the rule; but an attacker's blockers are chosen without regard to what the next attacker will then face.",
    "Protection, indestructible, banding and damage prevention are not modeled.",
    "Damage marked on a creature is cleared at end of turn, but nothing else about a turn's timing is modeled -- there are no combat tricks, because there is no priority."
  ];

  /* WHAT ONE CREATURE IS WORTH, for deciding whether losing it is worth the life
     it saves. Power plus toughness is the whole of a body's combat value and is
     the only thing this module can see; a creature that taps for mana or draws a
     card each turn is worth more than that and the engine passes it in as
     `value` when it knows. The commander is worth more than any of it: it comes
     back, but taxed, and the deck is built around it. */
  const COMMANDER_WORTH = 6;
  function worth(creature) {
    if (creature.value != null) return creature.value;
    return (creature.power || 0) + (creature.toughness || 0) + (creature.commander ? COMMANDER_WORTH : 0);
  }

  /* Can this creature legally block that one? Evasion is the only reason it
     cannot -- flying needs flying or reach to stop it, menace needs two bodies
     (checked by the caller, which is the only place that knows how many are
     left). */
  function canBlock(blocker, attacker) {
    if (attacker.hasFlying && !(blocker.hasFlying || blocker.hasReach)) return false;
    return true;
  }

  /* Does A's damage kill B? Deathtouch makes any nonzero damage lethal, which is
     what makes a 1/1 deathtouch blocker eat a 9/9. */
  function kills(dealer, damage, target) {
    if (damage <= 0) return false;
    if (dealer.hasDeathtouch) return true;
    return damage >= (target.toughness || 1) - (target.damage || 0);
  }

  /* WHICH DAMAGE STEP A CREATURE DEALS IN. First strike deals in the first step
     and not the second; double strike deals in both; everything else deals in the
     second only. Written once because getting it wrong in one of three places is
     how a combat rule ends up half-implemented. */
  function dealsIn(creature, step) {
    const early = Boolean(creature.hasFirstStrike || creature.hasDoubleStrike);
    if (step === "first") return early;
    return !creature.hasFirstStrike || Boolean(creature.hasDoubleStrike);
  }

  /* HOW ONE BLOCK GOES, before it is chosen. Two real damage steps, because the
     shortcut does not survive contact with double strike: a 6/6 double-strike
     trampler blocked by a 2/2 deals FOUR over in the first-strike step, and then
     all SIX in the normal step -- the blocker is already dead and there is
     nothing left to assign to. Ten, not eight, and not twelve. Anything that
     multiplies a single step by two gets that wrong, and gets it wrong quietly.
   *
   * Returns what each side loses, so the decision below is a comparison rather
   * than a rule. */
  function trade(attacker, blockers) {
    const state = blockers.map((blocker) => ({
      blocker,
      left: Math.max(1, (blocker.toughness || 1) - (blocker.damage || 0)),
      dead: false
    }));
    let attackerLeft = Math.max(1, (attacker.toughness || 1) - (attacker.damage || 0));
    let attackerDies = false;
    let trampleOver = 0;
    let dealtTotal = 0;

    const step = (which) => {
      /* COMBAT DAMAGE IN A STEP IS SIMULTANEOUS. A blocker that dies to the
         attacker still deals its own damage in the same step -- which is the
         whole of why a 1/1 deathtouch attacker and a 9/9 blocker kill each other.
         So the blockers that strike back are chosen from the board as it stood at
         the START of the step, before any of this step's deaths are applied.
         Only a first-strike kill removes a creature before it can answer. */
      const strikingBack = state.filter((entry) => !entry.dead && dealsIn(entry.blocker, which));
      const backPower = strikingBack.reduce((sum, entry) => sum + (entry.blocker.power || 0), 0);
      const backDeathtouch = strikingBack.some((entry) => entry.blocker.hasDeathtouch && (entry.blocker.power || 0) > 0);

      if (!attackerDies && dealsIn(attacker, which)) {
        /* The attacker assigns across its blockers in the order given, each
           taking only what it needs to die -- which is how an attacker actually
           assigns, and why deathtouch lets one big attacker kill several small
           ones. Damage it cannot spend lethally is not excess and does not
           trample: that is the rule, assign lethal to every blocker first. */
        let left = attacker.power || 0;
        for (const entry of state) {
          if (entry.dead || left <= 0) continue;
          const needed = attacker.hasDeathtouch ? 1 : entry.left;
          if (left >= needed) { entry.left = 0; entry.dead = true; left -= needed; dealtTotal += needed; }
          else { entry.left -= left; dealtTotal += left; left = 0; }
        }
        if (attacker.hasTrample && left > 0) { trampleOver += left; dealtTotal += left; }
      }
      if (backPower > 0) {
        attackerLeft -= backPower;
        if (attackerLeft <= 0 || backDeathtouch) attackerDies = true;
      }
    };
    step("first");
    step("normal");

    return {
      attackerDies,
      blockersKilled: state.filter((entry) => entry.dead).map((entry) => entry.blocker),
      trampleOver,
      dealtTotal
    };
  }

  /* THE BLOCK-OR-TAKE DECISION, in its first and most conservative form.
   *
   * Block when it is a clean profit -- the attacker dies and the blocker lives,
   * or the trade is worth more than it costs. Take the damage otherwise, because
   * a creature spent is a creature that is not attacking next turn, against two
   * other people. Chump-block only when the damage coming is the game.
   *
   * The full version prices life against board at THIS life total: three of forty
   * is nothing, three of four is the game, and the curve between them is where
   * Playstyle lives (docs/simulation-fidelity.md §3). This one has a single
   * threshold and says so. */
  function declareBlocks(attackers, blockers, options) {
    const opts = options || {};
    const life = opts.life != null ? opts.life : 40;
    /* What is actually arriving, which is not the sum of the printed powers: a
       double striker deals its power twice. Counting it once said six was coming
       from a creature that deals twelve, so a player at eight life declined the
       block that was the only thing between them and the game. */
    const incoming = attackers.reduce((sum, a) => sum + (a.power || 0) * (a.hasDoubleStrike ? 2 : 1), 0);
    // Lethal on the table changes every answer: a creature is worth nothing to a
    // player who is dead.
    const lethal = incoming >= life;
    const available = blockers.filter((b) => !b.tapped);
    const used = new Set();
    const assignments = [];

    // Biggest attacker first: it is the one most worth stopping, and the one a
    // blocker is most likely to be unable to handle alone.
    const ordered = attackers.slice().sort((a, b) => (b.power || 0) - (a.power || 0));
    for (const attacker of ordered) {
      const eligible = available.filter((b) => !used.has(b) && canBlock(b, attacker));
      if (!eligible.length) continue;
      if (attacker.hasMenace && eligible.length < 2) continue;

      const pick = chooseBlockers(attacker, eligible, {lethal, minimum: attacker.hasMenace ? 2 : 1});
      if (!pick.length) continue;
      pick.forEach((b) => used.add(b));
      assignments.push({attacker, blockers: pick});
    }
    return assignments;
  }

  /* Which bodies to put in front of one attacker, or none. Cheapest first, so a
     block that works is made with the least valuable creature that can make it. */
  function chooseBlockers(attacker, eligible, options) {
    const opts = options || {};
    const minimum = opts.minimum || 1;
    const cheapest = eligible.slice().sort((a, b) => worth(a) - worth(b));

    // One blocker, if one is enough and the exchange is worth making.
    for (const blocker of cheapest) {
      if (minimum > 1) break;
      const outcome = trade(attacker, [blocker]);
      const lost = outcome.blockersKilled.length ? worth(blocker) : 0;
      const gained = outcome.attackerDies ? worth(attacker) : 0;
      if (outcome.attackerDies && gained >= lost) return [blocker];
    }
    // Two, when one cannot do it alone -- or when menace requires it.
    for (let i = 0; i < cheapest.length; i += 1) {
      for (let j = i + 1; j < cheapest.length; j += 1) {
        const pair = [cheapest[i], cheapest[j]];
        const outcome = trade(attacker, pair);
        const lost = outcome.blockersKilled.reduce((sum, b) => sum + worth(b), 0);
        if (outcome.attackerDies && worth(attacker) >= lost) return pair;
      }
    }
    // Nothing profitable. Throw a body in front of it only if the damage is fatal.
    if (opts.lethal && cheapest.length >= minimum) return cheapest.slice(0, minimum);
    return [];
  }

  /* Resolve a declared combat. Returns what reaches the player, what the attacker
     gained from lifelink, and which creatures on each side died -- as the objects
     themselves, so the caller can splice them out of its own board. */
  function resolveCombat(attackers, assignments, options) {
    const opts = options || {};
    const blockedBy = new Map(assignments.map((a) => [a.attacker, a.blockers]));
    let damageToPlayer = 0;
    let lifelinkGain = 0;
    const attackersDead = [];
    const blockersDead = [];

    for (const attacker of attackers) {
      const blockers = blockedBy.get(attacker);
      if (!blockers || !blockers.length) {
        const dealt = (attacker.power || 0) * (attacker.hasDoubleStrike ? 2 : 1);
        damageToPlayer += dealt;
        if (attacker.hasLifelink) lifelinkGain += dealt;
        continue;
      }
      const outcome = trade(attacker, blockers);
      outcome.blockersKilled.forEach((b) => blockersDead.push(b));
      if (outcome.attackerDies) attackersDead.push(attacker);
      // trade() already ran both damage steps, so nothing is multiplied here.
      damageToPlayer += outcome.trampleOver;
      if (attacker.hasLifelink) lifelinkGain += outcome.dealtTotal;
    }
    void opts;
    return {damageToPlayer, lifelinkGain, attackersDead, blockersDead};
  }

  /* The whole step, for a caller that does not want to hold the pieces: declare,
     resolve, and hand back both sides' losses. */
  function fight(attackers, blockers, options) {
    const assignments = declareBlocks(attackers, blockers, options);
    const result = resolveCombat(attackers, assignments, options);
    return Object.assign({assignments}, result);
  }

  return {
    SIMPLIFICATIONS, COMMANDER_WORTH,
    worth, canBlock, kills, dealsIn, trade,
    declareBlocks, chooseBlockers, resolveCombat, fight
  };
});
