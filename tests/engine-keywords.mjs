/* THE KEYWORDS THAT CHANGE COMBAT.
 *
 * `docs/engine/PLAN.md` §3.1 (`keywords/`, one module per family) and §6's phase 2.3.
 *
 * WHY THIS FAMILY FIRST. The inventory counted keyword use across Rob's seven decks and FLYING IS
 * 52 of them — the most-used keyword by a distance, more than twice the next. Until this, the
 * engine knew the word and did nothing with it: a flier could be blocked by anything on the ground.
 * The combat system was already reading `Vigilance` and `Defender`, so these are the keywords it
 * half-knew about, finished.
 *
 * MENACE IS NOT A PER-BLOCKER RULE (CR 702.111b): "can't be blocked except by two or more
 * creatures" is a constraint on the SET. Every individual blocker is legal; the set of one is not.
 * An engine that only ever asks "may this creature block that one" cannot express it, and menace
 * silently does nothing — which is how it is usually got wrong.
 *
 * DEATHTOUCH CHANGES WHAT LETHAL MEANS (CR 702.2b), so it belongs in the damage ASSIGNMENT, not
 * after it. A 1/1 deathtoucher attacking into two 4/4 blockers assigns one damage to the first and
 * may then move on, because one is lethal from that source.
 *
 * FIRST STRIKE IS A WHOLE EXTRA STEP (CR 510.4), and double strike deals in BOTH of them. The turn
 * table has carried `COMBAT_FIRST_STRIKE_DAMAGE` as a conditional step since 1.2 waiting for this.
 */
import assert from "node:assert/strict";
import {createState, addObject, cardsIn} from "../game/engine/state/index.mjs";
import {beginGame, advance, currentPhase, awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";
import {canBlockAttacker, blockersAreLegal, lethalNeededFrom, KEYWORD_FAMILIES} from "../game/engine/keywords/combat.mjs";
import {KEYWORD_FAMILIES as TIMING, summoningSick, hasFlash} from "../game/engine/keywords/timing.mjs";
import {legalActions, nothingToDo} from "../game/engine/rules/actions.mjs";
import {canAttack} from "../game/engine/rules/combat.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const pod = {matchId: "m", seed: "s", players: [{name: "Rob"}, {name: "Krenko"}, {name: "Atraxa"}, {name: "Shadrix"}]};
const creature = (over) => ({types: ["Creature"], power: 2, toughness: 2, ...over});

/* A table at seat 0's declare-attackers step, with everything placed already out since turn one. */
function atCombat(setup = () => {}) {
  const s = createState(pod);
  for (let seat = 0; seat < 4; seat += 1)
    for (let i = 0; i < 60; i += 1)
      addObject(s, {card: `L${seat}-${i}`, owner: seat, controller: seat}, "library", seat);
  beginGame(s);
  setup(s);
  let guard = 0;
  while (!(s.activePlayer === 0 && s.turn > 1 && currentPhase(s) === "COMBAT_DECLARE_ATTACKERS") && guard < 900) {
    if (s.awaiting) { const c = awaitingChoice(s); resolveAwaiting(s, c.mode === "many" ? [] : [0]); continue; }
    advance(s);
    guard += 1;
  }
  return s;
}
const named = (s, name) => s.zones.battlefield.filter((id) => s.objects[id].card === name);
const step = (s, phase, limit = 40) => {
  let n = 0;
  while (currentPhase(s) !== phase && n < limit) {
    if (s.awaiting) { const c = awaitingChoice(s); resolveAwaiting(s, c.mode === "many" ? [] : [0]); continue; }
    if (s.priorityPlayer !== null) { if (passPriority(s).outcome === "step-ends") advance(s); } else advance(s);
    n += 1;
  }
};

/* ---- the families are declared ---- */
{
  ok(Array.isArray(KEYWORD_FAMILIES.evasion) && KEYWORD_FAMILIES.evasion.includes("Flying"),
    "evasion is a family and flying is in it");
  ok(KEYWORD_FAMILIES.combat.includes("Deathtouch"), "and the combat-damage keywords are another");
}

/* ---- evasion: flying (CR 702.9b) ---- */
{
  const s = atCombat((state) => {
    addObject(state, creature({card: "Flier", owner: 0, controller: 0, keywords: ["Flying"]}), "battlefield");
    addObject(state, creature({card: "Ground", owner: 1, controller: 1}), "battlefield");
    addObject(state, creature({card: "Blocker Flier", owner: 1, controller: 1, keywords: ["Flying"]}), "battlefield");
    addObject(state, creature({card: "Reacher", owner: 1, controller: 1, keywords: ["Reach"]}), "battlefield");
  });
  const flier = named(s, "Flier")[0];
  eq(canBlockAttacker(s, named(s, "Ground")[0], flier), false,
    "a creature with no flying and no reach cannot block a flier (CR 702.9b) — the most-used keyword in Rob's decks, and until now it did nothing");
  eq(canBlockAttacker(s, named(s, "Blocker Flier")[0], flier), true, "another flier can");
  eq(canBlockAttacker(s, named(s, "Reacher")[0], flier), true, "and so can reach (CR 702.17b)");
}
{
  const s = atCombat((state) => {
    addObject(state, creature({card: "Ground", owner: 0, controller: 0}), "battlefield");
    addObject(state, creature({card: "Flier", owner: 1, controller: 1, keywords: ["Flying"]}), "battlefield");
  });
  eq(canBlockAttacker(s, named(s, "Flier")[0], named(s, "Ground")[0]), true,
    "flying is not a restriction on what a flier may block — it blocks anything");
}

/* ---- evasion, end to end: the choice does not offer an illegal block ---- */
{
  const s = atCombat((state) => {
    addObject(state, creature({card: "Flier", owner: 0, controller: 0, keywords: ["Flying"]}), "battlefield");
    addObject(state, creature({card: "Ground", owner: 1, controller: 1}), "battlefield");
  });
  const choice = awaitingChoice(s);
  const at = choice.options.findIndex((o) => o.label.startsWith("Flier") && o.defenderId === 1);
  resolveAwaiting(s, [at]);
  step(s, "COMBAT_DECLARE_BLOCKERS");
  eq(awaitingChoice(s).options.length, 0,
    "the defending player is offered no blocks at all, rather than being offered one and refused");
  resolveAwaiting(s, []);
  step(s, "COMBAT_DAMAGE");
  eq(s.players[1].life, 38, "and the flier gets through");
}

/* ---- menace is a rule about the SET of blockers (CR 702.111b) ---- */
{
  const s = atCombat((state) => {
    addObject(state, creature({card: "Menacer", owner: 0, controller: 0, keywords: ["Menace"]}), "battlefield");
    addObject(state, creature({card: "One", owner: 1, controller: 1}), "battlefield");
    addObject(state, creature({card: "Two", owner: 1, controller: 1}), "battlefield");
  });
  const menacer = named(s, "Menacer")[0];
  const one = named(s, "One")[0], two = named(s, "Two")[0];
  eq(canBlockAttacker(s, one, menacer), true,
    "EVERY INDIVIDUAL BLOCKER IS LEGAL — menace cannot be expressed one blocker at a time, which is how it silently does nothing");
  eq(blockersAreLegal(s, menacer, [one]), false, "but a set of one is not");
  eq(blockersAreLegal(s, menacer, [one, two]), true, "and a set of two is");
  eq(blockersAreLegal(s, menacer, []), true, "while blocking with nobody is always allowed");
}
{
  const s = atCombat((state) => {
    addObject(state, creature({card: "Menacer", owner: 0, controller: 0, keywords: ["Menace"]}), "battlefield");
    addObject(state, creature({card: "Only One", owner: 1, controller: 1}), "battlefield");
  });
  const choice = awaitingChoice(s);
  resolveAwaiting(s, [choice.options.findIndex((o) => o.label.startsWith("Menacer") && o.defenderId === 1)]);
  step(s, "COMBAT_DECLARE_BLOCKERS");
  assert.throws(() => resolveAwaiting(s, [0]), /menace|two or more/i,
    "declaring a single blocker against menace is refused with the reason"); checks += 1;
  resolveAwaiting(s, []);
  step(s, "COMBAT_DAMAGE");
  eq(s.players[1].life, 38, "so it gets through");
}

/* ---- deathtouch changes what lethal means (CR 702.2b) ---- */
{
  const s = atCombat((state) => {
    addObject(state, creature({card: "Toucher", owner: 0, controller: 0, keywords: ["Deathtouch"]}), "battlefield");
    addObject(state, creature({card: "Big", owner: 1, controller: 1, power: 1, toughness: 6}), "battlefield");
    addObject(state, creature({card: "Plain", owner: 0, controller: 0}), "battlefield");
  });
  const big = named(s, "Big")[0];
  eq(lethalNeededFrom(s, named(s, "Toucher")[0], big), 1,
    "one damage from a deathtoucher is lethal, whatever the toughness");
  eq(lethalNeededFrom(s, named(s, "Plain")[0], big), 6, "and from anything else it is the toughness");
}
{
  const s = atCombat((state) => {
    addObject(state, creature({card: "Toucher", owner: 0, controller: 0, power: 2, toughness: 2, keywords: ["Deathtouch"]}), "battlefield");
    addObject(state, creature({card: "Wall", owner: 1, controller: 1, power: 0, toughness: 8}), "battlefield");
  });
  const choice = awaitingChoice(s);
  resolveAwaiting(s, [choice.options.findIndex((o) => o.label.startsWith("Toucher") && o.defenderId === 1)]);
  step(s, "COMBAT_DECLARE_BLOCKERS");
  resolveAwaiting(s, [0]);
  step(s, "COMBAT_DAMAGE");
  eq(named(s, "Wall").length, 0, "an 8-toughness wall dies to a 2/2 deathtoucher");
  eq(cardsIn(s, "graveyard", 1).length, 1, "into its owner's graveyard");
}

/* ---- trample puts the excess through (CR 702.19b) ---- */
{
  const s = atCombat((state) => {
    addObject(state, creature({card: "Trampler", owner: 0, controller: 0, power: 5, toughness: 5, keywords: ["Trample"]}), "battlefield");
    addObject(state, creature({card: "Chump", owner: 1, controller: 1, power: 1, toughness: 1}), "battlefield");
  });
  const choice = awaitingChoice(s);
  resolveAwaiting(s, [choice.options.findIndex((o) => o.label.startsWith("Trampler") && o.defenderId === 1)]);
  step(s, "COMBAT_DECLARE_BLOCKERS");
  resolveAwaiting(s, [0]);
  step(s, "COMBAT_DAMAGE");
  eq(named(s, "Chump").length, 0, "the blocker dies");
  eq(s.players[1].life, 36,
    "and the four over lethal go to the player — a 5/5 trampler into a 1/1 is one damage assigned and four through");
}
{
  const s = atCombat((state) => {
    addObject(state, creature({card: "Plain", owner: 0, controller: 0, power: 5, toughness: 5}), "battlefield");
    addObject(state, creature({card: "Chump", owner: 1, controller: 1, power: 1, toughness: 1}), "battlefield");
  });
  const choice = awaitingChoice(s);
  resolveAwaiting(s, [choice.options.findIndex((o) => o.label.startsWith("Plain") && o.defenderId === 1)]);
  step(s, "COMBAT_DECLARE_BLOCKERS");
  resolveAwaiting(s, [0]);
  step(s, "COMBAT_DAMAGE");
  eq(s.players[1].life, 40, "without trample the excess is simply lost, which is the whole point of chump blocking");
}

/* ---- lifelink (CR 702.15a) ---- */
{
  const s = atCombat((state) => {
    addObject(state, creature({card: "Linker", owner: 0, controller: 0, power: 3, toughness: 3, keywords: ["Lifelink"]}), "battlefield");
  });
  const choice = awaitingChoice(s);
  resolveAwaiting(s, [choice.options.findIndex((o) => o.label.startsWith("Linker") && o.defenderId === 1)]);
  step(s, "COMBAT_DAMAGE");
  eq(s.players[1].life, 37, "three damage dealt");
  eq(s.players[0].life, 43, "and its controller gains that much life");
}

/* ---- first strike is an extra step, and double strike deals in both (CR 510.4, 702.4b) ---- */
{
  const s = atCombat((state) => {
    addObject(state, creature({card: "Striker", owner: 0, controller: 0, power: 2, toughness: 2, keywords: ["First Strike"]}), "battlefield");
    addObject(state, creature({card: "Slow", owner: 1, controller: 1, power: 2, toughness: 2}), "battlefield");
  });
  const choice = awaitingChoice(s);
  resolveAwaiting(s, [choice.options.findIndex((o) => o.label.startsWith("Striker") && o.defenderId === 1)]);
  step(s, "COMBAT_DECLARE_BLOCKERS");
  resolveAwaiting(s, [0]);
  step(s, "COMBAT_FIRST_STRIKE_DAMAGE");
  eq(currentPhase(s), "COMBAT_FIRST_STRIKE_DAMAGE",
    "the extra step happens, which the turn table has carried as a conditional since 1.2 waiting for this");
  step(s, "COMBAT_DAMAGE");
  eq(named(s, "Slow").length, 0, "the blocker died to first-strike damage");
  eq(named(s, "Striker").length, 1,
    "and the first striker took nothing back, because its victim was gone before the regular step");
}
{
  const s = atCombat((state) => {
    addObject(state, creature({card: "Double", owner: 0, controller: 0, power: 2, toughness: 2, keywords: ["Double Strike"]}), "battlefield");
  });
  const choice = awaitingChoice(s);
  resolveAwaiting(s, [choice.options.findIndex((o) => o.label.startsWith("Double") && o.defenderId === 1)]);
  step(s, "COMBAT_DAMAGE");
  eq(s.players[1].life, 36, "double strike deals its damage twice — once in each step (CR 702.4b)");
}
{
  const s = atCombat((state) => {
    addObject(state, creature({card: "Plain", owner: 0, controller: 0}), "battlefield");
  });
  const choice = awaitingChoice(s);
  resolveAwaiting(s, [choice.options.findIndex((o) => o.label.startsWith("Plain") && o.defenderId === 1)]);
  let n = 0, sawFirstStrike = false;
  while (currentPhase(s) !== "COMBAT_END" && n < 40) {
    if (currentPhase(s) === "COMBAT_FIRST_STRIKE_DAMAGE") sawFirstStrike = true;
    if (s.awaiting) { const c = awaitingChoice(s); resolveAwaiting(s, c.mode === "many" ? [] : [0]); continue; }
    if (s.priorityPlayer !== null) { if (passPriority(s).outcome === "step-ends") advance(s); } else advance(s);
    n += 1;
  }
  eq(sawFirstStrike, false,
    "and with nobody in combat having first or double strike the extra step does not happen at all (CR 510.4)");
  eq(s.players[1].life, 38, "the damage having been dealt in the ordinary one");
}

/* ---- keywords read through the layers ---- */
{
  const s = atCombat((state) => {
    addObject(state, creature({card: "Grounded", owner: 0, controller: 0}), "battlefield");
    addObject(state, creature({card: "Ground", owner: 1, controller: 1}), "battlefield");
  });
  const grounded = named(s, "Grounded")[0];
  eq(canBlockAttacker(s, named(s, "Ground")[0], grounded), true, "before anything is granted");
  s.effects = [{id: "wings", layer: 6, timestamp: 99, affects: {ids: [grounded]}, apply: {addKeywords: ["Flying"]}}];
  eq(canBlockAttacker(s, named(s, "Ground")[0], grounded), false,
    "and granted flying is flying — evasion reads the creature as it currently is, not as it was printed");
}


/* ==== THE TIMING FAMILY (keywords/timing.mjs): flash, haste, and the summoning sickness they bend ==== */

/* A table at seat 0's first main phase of turn 1, nothing placed yet, lands in every library. */
function atMain(setup = () => {}) {
  const s = createState(pod);
  for (let seat = 0; seat < 4; seat += 1)
    for (let i = 0; i < 60; i += 1)
      addObject(s, {card: `L${seat}-${i}`, owner: seat, controller: seat, types: ["Land"]}, "library", seat);
  beginGame(s);
  setup(s);
  step(s, "MAIN1");
  return s;
}
/* Walk the table on, every seat passing, until `seat` holds priority in `phase` on someone's turn `turn`. */
function until(s, {turn, phase, seat}) {
  let n = 0;
  while (!(s.turn === turn && currentPhase(s) === phase && s.priorityPlayer === seat) && n < 2000) {
    if (s.awaiting) { const c = awaitingChoice(s); resolveAwaiting(s, c.mode === "many" ? [] : [0]); continue; }
    if (s.priorityPlayer !== null) { if (passPriority(s).outcome === "step-ends") advance(s); } else advance(s);
    n += 1;
  }
  assert.ok(n < 2000, `the table never reached turn ${turn}, ${phase}, seat ${seat}`);
}
const DORK = (over = {}) => creature({card: "Elf", owner: 0, controller: 0, power: 1, toughness: 1,
  abilities: [{id: "t-g", kind: "mana", tapSelf: true, produces: {G: 1}}], ...over});
const LAND = {card: "Forest", owner: 0, controller: 0, types: ["Land"], abilities: [{id: "t-g", kind: "mana", tapSelf: true, produces: {G: 1}}]};
const taps = (s, seat, id) => legalActions(s, seat).some((a) => a.kind === "activate-mana" && a.objectId === id);
const casts = (s, seat, id) => legalActions(s, seat).some((a) => a.kind === "cast" && a.objectId === id);

/* ---- the family is declared ---- */
{
  eq([...TIMING.timing], ["Flash", "Haste"], "timing is a family, and flash and haste are in it");
}

/* ---- summoning sickness reaches a creature's {T} abilities (CR 302.6) ---- */
{
  const s = atMain();
  const elf = addObject(s, DORK(), "battlefield");
  const forest = addObject(s, {...LAND}, "battlefield");
  eq(s.priorityPlayer, 0, "seat 0 holds priority in its first main phase");
  eq(taps(s, 0, elf), false, "a creature that arrived this turn cannot use its {T} mana ability: summoning sickness is not only about attacking (CR 302.6)");
  eq(taps(s, 0, forest), true, "a land that arrived this turn can: a land is not a creature, and is never sick");
  ok(summoningSick(s, elf) && !summoningSick(s, forest), "summoningSick says so: the creature is, the land is not");
}
{
  const s = atMain();
  const elf = addObject(s, DORK({card: "Hasty Elf", keywords: ["Haste"]}), "battlefield");
  eq(taps(s, 0, elf), true, "with haste it can use its {T} ability at once (CR 702.10b)");
  eq(summoningSick(s, elf), false, "a hasty creature is never sick");
}
{
  const s = atMain();
  const animated = addObject(s, {...LAND, card: "Animated Land", types: ["Land", "Creature"], power: 2, toughness: 2}, "battlefield");
  eq(taps(s, 0, animated), false, "a land that is a creature is a creature: it arrived this turn, so its {T} ability waits");
}

/* ---- it lasts until the controller's NEXT turn, not the game's next turn ---- */
{
  const s = atMain();
  const elf = addObject(s, DORK(), "battlefield");
  until(s, {turn: 2, phase: "UPKEEP", seat: 0});
  eq(taps(s, 0, elf), false, "on seat 1's turn 2 it is still sick: seat 0's most recent turn began after it arrived, so it has not been controlled since then (CR 302.6)");
  until(s, {turn: 4, phase: "UPKEEP", seat: 0});
  eq(taps(s, 0, elf), false, "and still on seat 3's turn 4");
  until(s, {turn: 5, phase: "UPKEEP", seat: 0});
  eq(taps(s, 0, elf), true, "on seat 0's own next turn it has been controlled since that turn began, and taps");
}
{
  /* Arrived on someone else's turn: the case the game's turn number gets wrong. */
  const s = atMain();
  until(s, {turn: 2, phase: "UPKEEP", seat: 0});
  const elf = addObject(s, DORK(), "battlefield");
  eq(taps(s, 0, elf), false, "a creature seat 0 gets on seat 1's turn 2 is sick at once");
  until(s, {turn: 3, phase: "UPKEEP", seat: 0});
  eq(taps(s, 0, elf), false, "and still on seat 2's turn 3, when the game's turn has moved past the one it arrived in: seat 0's turn has not begun since");
  until(s, {turn: 5, phase: "MAIN1", seat: 0});
  eq(taps(s, 0, elf), true, "and well again on seat 0's turn 5");
  eq(canAttack(s, elf, 0), true, "where it may attack too");
}

/* ---- haste lets it attack the turn it arrives (CR 702.10b) ---- */
{
  const s = atMain();
  const bear = addObject(s, creature({card: "Bear", owner: 0, controller: 0}), "battlefield");
  const hasty = addObject(s, creature({card: "Hasty", owner: 0, controller: 0, keywords: ["Haste"]}), "battlefield");
  eq(canAttack(s, bear, 0), false, "a creature that arrived this turn cannot attack");
  eq(canAttack(s, hasty, 0), true, "one with haste can");
  s.objects[hasty].tapped = true;
  eq(canAttack(s, hasty, 0), false, "and haste does not untap it: a tapped hasty creature still cannot attack");
}

/* ---- flash: a permanent spell cast any time its controller could cast an instant (CR 702.8a) ---- */
{
  const s = atMain();
  const flasher = addObject(s, creature({card: "Flasher", owner: 0, controller: 0, manaCost: "{1}", keywords: ["Flash"]}), "hand", 0);
  const slow = addObject(s, creature({card: "Slow", owner: 0, controller: 0, manaCost: "{1}"}), "hand", 0);
  until(s, {turn: 2, phase: "UPKEEP", seat: 0});
  s.players[0].manaPool.C = 2;
  ok(hasFlash(s, flasher) && !hasFlash(s, slow), "hasFlash reads the keyword on a card in hand");
  eq(casts(s, 0, flasher), true, "on seat 1's upkeep, with mana and priority, seat 0 may cast a creature with flash");
  eq(casts(s, 0, slow), false, "and not one without it: a creature is cast at sorcery speed (CR 307.1)");
  eq(nothingToDo(s, 0), false, "so holding a flash creature and the mana is not nothing to do");
}
{
  const s = atMain();
  addObject(s, creature({card: "Slow", owner: 0, controller: 0, manaCost: "{1}"}), "hand", 0);
  until(s, {turn: 2, phase: "UPKEEP", seat: 0});
  s.players[0].manaPool.C = 2;
  eq(nothingToDo(s, 0), true, "where without flash, on someone else's turn, there is nothing to do");
}
{
  /* The count path: the mana is in an untapped land, not yet in the pool, so the cast is not offered yet and
     nothing-to-do has to see that the land could pay for a flash creature now. */
  const s = atMain();
  addObject(s, {...LAND}, "battlefield");
  addObject(s, creature({card: "Flasher", owner: 0, controller: 0, manaCost: "{1}", keywords: ["Flash"]}), "hand", 0);
  until(s, {turn: 2, phase: "UPKEEP", seat: 0});
  eq(nothingToDo(s, 0), false, "with a flash creature in hand and an untapped land to pay for it, someone else's upkeep is not nothing to do");
}
{
  /* Out before the game began (a fixture, or a card that starts the game on the battlefield): controlled since the
     starting player's first turn began, so not sick in it. */
  const s = createState(pod);
  for (let seat = 0; seat < 4; seat += 1)
    for (let i = 0; i < 60; i += 1)
      addObject(s, {card: `L${seat}-${i}`, owner: seat, controller: seat, types: ["Land"]}, "library", seat);
  const early = addObject(s, DORK({card: "Early Elf"}), "battlefield");
  beginGame(s);
  step(s, "MAIN1");
  eq(taps(s, 0, early), true, "a creature out before the game began is not sick in the starting player's first turn: it has been theirs since that turn began");
}

console.log(`engine-keywords: ${checks} checks passed — flying finally does something, menace is a rule about the set, deathtouch changes what lethal means, trample puts the excess through, first strike gets its own step, and flash and haste bend the timing rules, summoning sickness reaching {T} abilities until the controller's own next turn.`);
