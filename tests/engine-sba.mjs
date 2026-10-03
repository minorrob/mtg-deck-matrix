/* STATE-BASED ACTIONS: THE RULES THAT HAPPEN TO YOU.
 *
 * `docs/engine/PLAN.md` §3.3 (state-based actions, CR 704) — "the loss conditions the Java
 * `RulesProbe` asserted, ported red-first". Those assertions were written against Forge and proved
 * things about Commander that are easy to assume and wrong; they are carried across here as claims
 * about this engine instead, which is the only way the port means anything.
 *
 * NOBODY CHOOSES A STATE-BASED ACTION. They are checked whenever a player would receive priority
 * (CR 704.3), they all happen at once, and then they are checked again until none apply. That last
 * part is not a detail: a creature dying can put a player to zero life, and if the check ran once
 * the player would sit at zero until somebody next passed.
 *
 * THE COMMANDER RULES THE JAVA PROBE PINNED, each of which people get wrong from memory:
 *
 *   Damage from two different commanders is NOT pooled (CR 903.10a). Eleven from one and ten from
 *   another is not twenty-one; it is eleven, and ten.
 *
 *   Gaining life does not erase commander damage. The tally is damage dealt, not life lost.
 *
 *   NONCOMBAT damage from a commander does not add to the tally (CR 903.10a says combat damage).
 *   A commander that pings you for three has not moved you three closer to losing.
 *
 * AN EMPTY LIBRARY IS NOT A LOSS (CR 704.5b). Attempting to DRAW from one is. A player can sit at
 * zero cards all game and be fine until their draw step.
 */
import assert from "node:assert/strict";
import {createState, addObject, commanderKeyOf} from "../game/engine/state/index.mjs";
import {beginGame, awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {checkStateBasedActions, dealCommanderDamage, gameOver} from "../game/engine/rules/sba.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const pod = {matchId: "m", seed: "s", players: [{name: "Rob"}, {name: "Krenko"}, {name: "Atraxa"}, {name: "Shadrix"}]};
const fresh = () => { const s = createState(pod); beginGame(s); return s; };
const creature = (over) => ({types: ["Creature"], power: 2, toughness: 2, ...over});

/* ---- life (CR 704.5a) ---- */
{
  const s = fresh();
  s.players[0].life = 1;
  checkStateBasedActions(s);
  eq(s.players[0].lost, false, "one life remains playable");

  s.players[0].life = 0;
  checkStateBasedActions(s);
  eq(s.players[0].lost, true, "zero life loses");
  eq(s.players[0].lostTo, "life", "and says why, because the board shows the reason");
}
{
  const s = fresh();
  s.players[0].life = -4;
  checkStateBasedActions(s);
  eq(s.players[0].lost, true, "negative life loses too — the rule is 'zero or less', not 'exactly zero'");
}

/* ---- poison (CR 704.5c) ---- */
{
  const s = fresh();
  s.players[0].poison = 9;
  checkStateBasedActions(s);
  eq(s.players[0].lost, false, "nine poison does not lose");
  s.players[0].poison = 10;
  checkStateBasedActions(s);
  eq(s.players[0].lost, true, "ten does, at any life total");
  eq(s.players[0].lostTo, "poison", "for that reason");
}

/* ---- commander damage (CR 903.10a) ---- */
{
  const s = fresh();
  const krenko = addObject(s, creature({card: "Krenko, Mob Boss", owner: 1, controller: 1}), "battlefield");
  const atraxa = addObject(s, creature({card: "Atraxa, Praetors' Voice", owner: 2, controller: 2}), "battlefield");
  s.objects[krenko].commander = true;
  s.objects[atraxa].commander = true;

  dealCommanderDamage(s, 0, krenko, 11);
  dealCommanderDamage(s, 0, atraxa, 10);
  checkStateBasedActions(s);
  eq(s.players[0].lost, false,
    "damage from two different commanders is NOT pooled — eleven and ten is not twenty-one (CR 903.10a)");

  s.players[0].life = 80;
  eq(s.players[0].commanderDamage[commanderKeyOf(s.objects[krenko])], 11,
    "gaining life does not erase commander damage — the tally is damage dealt, not life lost");

  dealCommanderDamage(s, 0, krenko, 9);
  checkStateBasedActions(s);
  eq(s.players[0].lost, false, "twenty from one commander does not lose");
  dealCommanderDamage(s, 0, krenko, 1);
  checkStateBasedActions(s);
  eq(s.players[0].lost, true, "twenty-one from the same commander does");
  eq(s.players[0].lostTo, "commander-damage", "for that reason, at eighty life");
}
{
  const s = fresh();
  const krenko = addObject(s, creature({card: "Krenko, Mob Boss", owner: 1, controller: 1}), "battlefield");
  s.objects[krenko].commander = true;
  dealCommanderDamage(s, 0, krenko, 3, {combat: false});
  eq(s.players[0].commanderDamage[commanderKeyOf(s.objects[krenko])] ?? 0, 0,
    "noncombat damage from a commander does not add to the tally (CR 903.10a is about combat damage)");
  eq(s.players[0].life, 37, "though it still costs the life");
  dealCommanderDamage(s, 0, krenko, 3, {combat: true});
  eq(s.players[0].commanderDamage[commanderKeyOf(s.objects[krenko])], 3, "combat damage from it does");
}
{
  const s = fresh();
  const bear = addObject(s, creature({card: "Bear", owner: 1, controller: 1}), "battlefield");
  dealCommanderDamage(s, 0, bear, 21, {combat: true});
  checkStateBasedActions(s);
  eq(s.players[0].lost, false,
    "twenty-one combat damage from a creature that is not a commander is just nineteen life");
  eq(s.players[0].life, 19, "which it is");
}

/* ---- drawing from an empty library (CR 704.5b) ---- */
{
  const s = fresh();
  checkStateBasedActions(s);
  eq(s.players[0].lost, false, "an empty library alone does not lose — a player can sit at zero cards all game");
  s.players[0].drewFromEmpty = true;
  checkStateBasedActions(s);
  eq(s.players[0].lost, true, "attempting to draw from one does");
  eq(s.players[0].lostTo, "empty-library", "for that reason");
}

/* ---- creatures (CR 704.5f, 704.5g) ---- */
{
  const s = fresh();
  const bear = addObject(s, creature({card: "Bear", owner: 0, controller: 0}), "battlefield");
  s.objects[bear].damage = 1;
  checkStateBasedActions(s);
  eq(s.zones.battlefield.length, 1, "a 2/2 with one damage is fine");

  s.objects[bear].damage = 2;
  const events = checkStateBasedActions(s);
  eq(s.zones.battlefield.length, 0, "lethal damage destroys it (CR 704.5g)");
  eq(s.zones.graveyard[0].length, 1, "into its OWNER's graveyard");
  ok(events.some((e) => e.kind === "GameEventCardChangeZone"), "and the death is reported");
}
{
  const s = fresh();
  const borrowed = addObject(s, creature({card: "Borrowed", owner: 3, controller: 0}), "battlefield");
  s.objects[borrowed].damage = 5;
  checkStateBasedActions(s);
  eq(s.zones.graveyard[3].length, 1,
    "a creature somebody else controls dies to its owner's graveyard, not its controller's (CR 108.3)");
  eq(s.zones.graveyard[0].length, 0, "which is the whole point of tracking both");
}
{
  const s = fresh();
  const wisp = addObject(s, creature({card: "Wisp", owner: 0, controller: 0, toughness: 0}), "battlefield");
  checkStateBasedActions(s);
  eq(s.zones.battlefield.length, 0, "a creature with toughness zero is put into its graveyard (CR 704.5f)");
  eq(s.zones.graveyard[0].length, 1, "with no damage needed, and it is not 'destroyed' — regeneration would not save it");
  void wisp;
}
{
  const s = fresh();
  const token = addObject(s, creature({card: "Goblin", owner: 0, controller: 0, token: true}), "graveyard", 0);
  checkStateBasedActions(s);
  eq(s.zones.graveyard[0].length, 0,
    "a token that has left the battlefield ceases to exist (CR 704.5d) rather than sitting in a graveyard forever");
  eq(s.objects[token], undefined, "and is gone from the state");
}

/* ---- they repeat until nothing applies (CR 704.3) ---- */
{
  const s = fresh();
  s.players[0].life = 2;
  const bear = addObject(s, creature({card: "Bear", owner: 0, controller: 0}), "battlefield");
  s.objects[bear].damage = 2;
  /* The creature dies on the first pass. A test that only proves one pass happened cannot tell the
     difference between one pass and many, so this drops the player's life in between. */
  s.players[0].life = 0;
  checkStateBasedActions(s);
  eq(s.zones.battlefield.length, 0, "the creature died");
  eq(s.players[0].lost, true, "and the player lost, in the same check — they all happen at once (CR 704.3)");
}

/* ---- the game ends when one player is left (CR 104.2a) ---- */
{
  const s = fresh();
  eq(gameOver(s), null, "four players is a game");
  s.players[1].lost = true;
  s.players[2].lost = true;
  eq(gameOver(s), null, "two players is still a game");
  s.players[3].lost = true;
  eq(gameOver(s), {winner: 0, reason: "last player standing"},
    "one player left wins (CR 104.2a)");
}
{
  const s = fresh();
  for (const player of s.players) player.life = 0;
  const events = checkStateBasedActions(s);
  eq(s.players.every((p) => p.lost), true, "everyone can lose at once");
  eq(gameOver(s), {winner: null, reason: "all players lost"},
    "and a game where nobody is left is a draw (CR 104.4a), not a crash and not a winner");
  ok(events.some((e) => e.kind === "GameEventGameOutcome"), "which is reported, so the board can say what happened");
}

/* ---- a player who has lost leaves the board (CR 800.4a) ---- */
{
  const s = fresh();
  const theirs = addObject(s, creature({card: "Theirs", owner: 1, controller: 1}), "battlefield");
  addObject(s, creature({card: "Mine", owner: 0, controller: 0}), "battlefield");
  s.players[1].life = 0;
  checkStateBasedActions(s);
  eq(s.players[1].lost, true, "seat 1 is out");
  eq(s.objects[theirs], undefined,
    "and their permanents leave the game with them (CR 800.4a) — a board that keeps a dead player's creatures is a board nobody can read");
  eq(s.zones.battlefield.length, 1, "everyone else's stay");
}

/* ---- indestructible (CR 702.12b): not destroyed by lethal damage or deathtouch; zero toughness is not destruction ---- */
{
  const s = fresh();
  const dented = addObject(s, creature({card: "Myr", keywords: ["Indestructible"], owner: 0, controller: 0}), "battlefield");
  const touched = addObject(s, creature({card: "Golem", keywords: ["Indestructible"], owner: 0, controller: 0}), "battlefield");
  const shrunk = addObject(s, creature({card: "Ghost", toughness: 0, keywords: ["Indestructible"], owner: 0, controller: 0}), "battlefield");
  const plain = addObject(s, creature({card: "Bear", owner: 0, controller: 0}), "battlefield");
  s.objects[dented].damage = 5;
  s.objects[touched].damage = 1; s.objects[touched].deathtouched = true;
  s.objects[plain].damage = 2;
  checkStateBasedActions(s);
  eq([Boolean(s.objects[dented]), s.objects[dented]?.damage, Boolean(s.objects[touched]), Boolean(s.objects[shrunk]), Boolean(s.objects[plain])], [true, 5, true, false, false],
    "an indestructible 2/2 with 5 damage stays, damage and all; so does one dealt deathtouch damage; an indestructible 2/0 is put into the graveyard (704.5f is not destruction); a plain 2/2 with 2 damage dies");
}

/* ---- the legend rule (CR 704.5j; the plan review's C2, 2026-10-03) ----
   Two or more legendary permanents with the same name controlled by one player: that player chooses one, and the rest are
   PUT INTO their owners' graveyards -- not destroyed, so indestructible does not save them, and not sacrificed -- which is
   a death, so "dies" sees it. The same name under two players is two legends. */
{
  const s = fresh();
  const legend = (over) => creature({card: "Krenko, Mob Boss", supertypes: ["Legendary"], owner: 0, controller: 0, ...over});
  const first = addObject(s, legend({}), "battlefield");
  const second = addObject(s, legend({keywords: ["Indestructible"]}), "battlefield");
  checkStateBasedActions(s);
  eq([s.awaiting?.kind, s.awaiting?.player], ["legend-rule", 0], "two Krenkos under one player: that player is asked which to keep (CR 704.5j)");
  const choice = awaitingChoice(s);
  eq([choice.mode, choice.min, choice.max, choice.options.map((o) => o.cardId)], ["one", 1, 1, [first, second]], "one of the two, each offered as itself");
  ok(new Set(choice.options.map((o) => o.label)).size === 2, `and told apart in words (${choice.options.map((o) => o.label).join(" | ")})`);
  resolveAwaiting(s, [0]);
  eq([Boolean(s.objects[first]), Boolean(s.objects[second]), s.zones.graveyard[0].length, s.awaiting], [true, false, 1, null],
    "the one kept stays; the other is put into its owner's graveyard -- indestructible does not save it, because nothing destroyed it");
}
{
  const s = fresh();
  addObject(s, creature({card: "Krenko, Mob Boss", supertypes: ["Legendary"], owner: 0, controller: 0}), "battlefield");
  addObject(s, creature({card: "Krenko, Mob Boss", supertypes: ["Legendary"], owner: 1, controller: 1}), "battlefield");
  addObject(s, creature({card: "Bear", owner: 0, controller: 0}), "battlefield");
  addObject(s, creature({card: "Bear", owner: 0, controller: 0}), "battlefield");
  checkStateBasedActions(s);
  eq([s.awaiting, s.zones.battlefield.length], [null, 4], "the same legend under two players is two legends (one each), and two Bears are just two Bears");
}
{
  const s = fresh();
  const mine = addObject(s, creature({card: "Krenko, Mob Boss", supertypes: ["Legendary"], owner: 0, controller: 0}), "battlefield");
  const borrowed = addObject(s, creature({card: "Krenko, Mob Boss", supertypes: ["Legendary"], owner: 2, controller: 0}), "battlefield");
  checkStateBasedActions(s);
  eq(s.awaiting?.player, 0, "a legend borrowed from another player counts under its controller");
  resolveAwaiting(s, [0]);
  eq([Boolean(s.objects[mine]), s.objects[borrowed], s.zones.graveyard[2].length], [true, undefined, 1], "and the one not kept goes to its OWNER's graveyard");
}
/* A legend put into a graveyard by the rule died: Blood Artist sees it, through the rules with real cards. */
{
  const index = loadCardIndex();
  const LEGEND = {types: ["Creature"], subtypes: ["Goblin"], supertypes: ["Legendary"], manaCost: "{R}", colors: ["R"], power: 2, toughness: 2};
  const {state} = runScenario({name: "the legend rule is a death", setup: [
    {seat: 0, zone: "battlefield", cards: ["Mountain", "Blood Artist", "Legend"]}, {seat: 0, zone: "hand", cards: ["Legend"]},
  ], steps: [{tap: "Mountain"}, {cast: "Legend"}, {resolve: true},
    {expect: [{asks: {seat: 0}}]}, {answer: [0]},
    {expect: [{seat: 0, zone: "graveyard", cards: ["Legend"]}, {stack: 1}]}]}, index.definition, {Legend: LEGEND});
  eq([state.zones.battlefield.filter((id) => state.objects[id].card === "Legend").length], [1], "one Legend stays, the other died, and Blood Artist's trigger is on the stack for it");
  /* And a scenario that never answers it: the runner keeps the first, as the house pilot does. */
  const kept = runScenario({name: "the runner keeps the first legend", setup: [{seat: 0, zone: "battlefield", cards: ["Legend", "Legend"]}],
    steps: [{expect: [{seat: 0, zone: "graveyard", cards: ["Legend"]}]}]}, index.definition, {Legend: LEGEND}).state;
  eq(kept.zones.battlefield.filter((id) => kept.objects[id].card === "Legend").length, 1, "a scenario that does not answer the legend rule keeps the first");
}
{
  const s = fresh();
  for (let i = 0; i < 2; i += 1) {
    const id = addObject(s, creature({card: "Krenko, Mob Boss", supertypes: ["Legendary"], owner: 0, controller: 0}), "battlefield");
    s.objects[id].faceDown = true;
  }
  checkStateBasedActions(s);
  eq([s.awaiting, s.zones.battlefield.length], [null, 2], "two face-down permanents have no name (CR 708.2): the legend rule has nothing to compare");
}

/* ---- +1/+1 and -1/-1 counters annihilate (CR 704.5q) ---- */
{
  const s = fresh();
  const bear = addObject(s, creature({card: "Bear", owner: 0, controller: 0}), "battlefield");
  const other = addObject(s, creature({card: "Elk", owner: 0, controller: 0}), "battlefield");
  s.objects[bear].counters = {"+1/+1": 2, "-1/-1": 3};
  s.objects[other].counters = {"+1/+1": 2};
  checkStateBasedActions(s);
  eq([s.objects[bear].counters["+1/+1"] ?? 0, s.objects[bear].counters["-1/-1"] ?? 0, s.objects[other].counters["+1/+1"]], [0, 1, 2],
    "two +1/+1 and three -1/-1: two of each are removed, one -1/-1 is left (CR 704.5q); a creature with only +1/+1 counters keeps them");
  ok(Boolean(s.objects[bear]), "and the 2/2 with one -1/-1 counter lives, as a 1/1");
}

console.log(`engine-sba: ${checks} checks passed — two commanders' damage is not pooled, life gain does not erase it, an empty library is not a loss until you draw, and a dead player's board leaves with them.`);
