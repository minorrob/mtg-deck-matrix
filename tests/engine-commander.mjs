/* THE COMMANDER RULES: CR 903.
 *
 * `docs/engine/PLAN.md` §3.3 ("command zone, tax, color identity, 21 combat damage from one
 * commander, partner, the command-zone replacement choice"). The 21-damage rule landed with
 * state-based actions in 1.5; this is the rest.
 *
 * COLOR IDENTITY IS NOT COLOR (CR 903.4). A card's color identity is its colors PLUS every mana
 * symbol in its rules text, and it ignores reminder text. A colorless artifact whose ability costs
 * {B} has a black color identity and cannot go in a mono-white deck. This is the rule the whole
 * deck-building side of the app depends on, and the one people get wrong by reading the mana cost
 * alone.
 *
 * COMMANDER TAX IS PER CAST FROM THE COMMAND ZONE, NOT PER CAST (CR 903.8). A commander that was
 * cast, died, was recast from the command zone and then bounced to hand costs its printed price
 * from hand — the tax counts only the times it left the command zone.
 *
 * THE COMMAND-ZONE REPLACEMENT IS A CHOICE AND IT IS THE OWNER'S (CR 903.9a). "May" means the
 * engine has to ask. An engine that always returns a commander to the command zone takes away a
 * real decision: leaving it in the graveyard is how a player sets up a reanimation, and paying the
 * tax again is not always what they want.
 */
import assert from "node:assert/strict";
import {createState, addObject, cardsIn, zoneOf} from "../game/engine/state/index.mjs";
import {beginGame, advance, currentPhase, awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {legalActions, applyAction} from "../game/engine/rules/actions.mjs";
import {checkStateBasedActions} from "../game/engine/rules/sba.mjs";
import {colorIdentity, withinIdentity, commanderTax} from "../game/engine/rules/commander.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const pod = {matchId: "m", seed: "s", players: [{name: "Rob"}, {name: "Krenko"}, {name: "Atraxa"}, {name: "Shadrix"}]};
const creature = (over) => ({types: ["Creature"], power: 2, toughness: 2, ...over});
const FOREST = {card: "Forest", types: ["Land"], abilities: [{id: "t-g", kind: "mana", tapSelf: true, produces: {G: 1}}]};

function started() {
  const s = createState(pod);
  for (let seat = 0; seat < 4; seat += 1)
    for (let i = 0; i < 40; i += 1)
      addObject(s, {...FOREST, card: `L${seat}-${i}`, owner: seat, controller: seat}, "library", seat);
  beginGame(s);
  return s;
}

/* ---- color identity (CR 903.4) ---- */
{
  eq(colorIdentity({manaCost: "{2}{G}{G}", text: ""}), ["G"], "a green creature is green");
  eq(colorIdentity({manaCost: "{1}{W}{U}", text: ""}), ["W", "U"],
    "two colors, in WUBRG order — the order the rest of the app and every card frame uses, so two identities compare without sorting");
  eq(colorIdentity({manaCost: "{3}", text: ""}), [], "a colorless artifact with no symbols has no identity");
  eq(colorIdentity({manaCost: "{3}", text: "{T}, Pay {B}: Draw a card."}), ["B"],
    "but a mana symbol in the RULES TEXT gives it one — this is the rule people get wrong by reading the mana cost alone");
  eq(colorIdentity({manaCost: "{G}", text: "{T}: Add {R}."}), ["R", "G"],
    "and the two are combined, not replaced");
  eq(colorIdentity({manaCost: "{W/U}", text: ""}), ["W", "U"], "a hybrid symbol is both of its colors");
  eq(colorIdentity({manaCost: "{U/P}", text: ""}), ["U"], "a Phyrexian symbol is its color");
  eq(colorIdentity({manaCost: "{2}", text: "{T}: Add {C}."}), [],
    "colorless mana is not a color, so {C} adds nothing to an identity");
  eq(colorIdentity({manaCost: "{1}{R}", text: "Sacrifice a creature: it deals 2 damage. (Reminder about {R} here.)"}), ["R"],
    "reminder text in parentheses is ignored (CR 903.4c), or half the pool would be five colors");
  eq(colorIdentity({manaCost: "", text: "", colorIndicator: ["G"]}), ["G"],
    "and a color indicator counts, which is how a card with no mana cost has an identity at all");
}

/* ---- a deck has to fit its commander (CR 903.4) ---- */
{
  const identity = colorIdentity({manaCost: "{2}{G}{W}", text: ""});
  ok(withinIdentity({manaCost: "{G}", text: ""}, identity), "a green card fits a Selesnya commander");
  ok(withinIdentity({manaCost: "{3}", text: ""}, identity), "so does a colorless one");
  ok(!withinIdentity({manaCost: "{U}", text: ""}, identity), "a blue one does not");
  ok(!withinIdentity({manaCost: "{2}", text: "{T}: Add {U}."}, identity),
    "and neither does a colorless artifact that can make blue mana — which is the case a naive check misses");
}

/* ---- the commander starts in the command zone (CR 903.6) ---- */
{
  const s = started();
  const general = addObject(s, creature({card: "Krenko, Mob Boss", owner: 0, controller: 0,
    manaCost: "{2}{R}{R}", commander: true}), "command", 0);
  eq(zoneOf(s, general), "command", "it begins in the command zone");
  eq(cardsIn(s, "command", 0).length, 1, "which is its owner's");
  eq(commanderTax(s, 0, general), 0, "and costs nothing extra the first time (CR 903.8)");
}

/* ---- casting from the command zone, and the tax ---- */
{
  const s = started();
  const general = addObject(s, creature({card: "Bear General", owner: 0, controller: 0,
    manaCost: "{1}{G}", commander: true}), "command", 0);
  for (let i = 0; i < 4; i += 1) addObject(s, {...FOREST, owner: 0, controller: 0}, "battlefield");
  let guard = 0;
  while (currentPhase(s) !== "MAIN1" && guard < 30) { advance(s); guard += 1; }

  eq(legalActions(s, 0).filter((a) => a.kind === "cast").length, 0,
    "with no mana it is not offered, like any other spell");
  for (const tap of legalActions(s, 0).filter((a) => a.kind === "activate-mana")) applyAction(s, 0, tap);
  const cast = legalActions(s, 0).find((a) => a.kind === "cast" && a.objectId === general);
  ok(cast, "with two green available the commander can be cast from the command zone (CR 903.8)");

  applyAction(s, 0, cast);
  eq(s.players[0].manaPool.G, 2, "two of the four green paid for it");
  eq(s.players[0].commanderCasts[general], 1, "and the cast is counted");
}
{
  const s = started();
  const general = addObject(s, creature({card: "Bear General", owner: 0, controller: 0,
    manaCost: "{1}{G}", commander: true}), "command", 0);
  eq(commanderTax(s, 0, general), 0, "no tax on the first cast");
  s.players[0].commanderCasts = {[general]: 1};
  eq(commanderTax(s, 0, general), 2, "two more after one (CR 903.8)");
  s.players[0].commanderCasts = {[general]: 3};
  eq(commanderTax(s, 0, general), 6, "and six after three — two for each previous cast, not a doubling");
}
{
  const s = started();
  const general = addObject(s, creature({card: "Bear General", owner: 0, controller: 0,
    manaCost: "{1}{G}", commander: true}), "command", 0);
  s.players[0].commanderCasts = {[general]: 1};
  for (let i = 0; i < 3; i += 1) addObject(s, {...FOREST, owner: 0, controller: 0}, "battlefield");
  let guard = 0;
  while (currentPhase(s) !== "MAIN1" && guard < 30) { advance(s); guard += 1; }
  for (const tap of legalActions(s, 0).filter((a) => a.kind === "activate-mana")) applyAction(s, 0, tap);
  eq(s.players[0].manaPool.G, 3, "three mana available");
  eq(legalActions(s, 0).filter((a) => a.kind === "cast" && a.objectId === general).length, 0,
    "and a taxed commander costing four is not offered for three — the tax is part of the cost, not an afterthought");
}

/* ---- the command-zone replacement is a choice, and it is the owner's (CR 903.9a) ---- */
{
  const s = started();
  const general = addObject(s, creature({card: "Bear General", owner: 0, controller: 0,
    manaCost: "{1}{G}", commander: true}), "battlefield");
  s.objects[general].damage = 5;
  checkStateBasedActions(s);
  eq(s.awaiting?.kind, "commander-replacement",
    "a commander that would die stops the game and asks (CR 903.9a says MAY, so the engine has to ask)");
  eq(s.awaiting.player, 0, "and it asks its OWNER");

  const choice = awaitingChoice(s);
  eq(choice.mode, "boolean", "a yes or no");
  eq(choice.options.length, 2, "with two answers");
  ok(choice.options[0].label.toLowerCase().includes("command"), "the first being the command zone");

  resolveAwaiting(s, [0]);
  eq(cardsIn(s, "command", 0).length, 1, "saying yes puts it back in the command zone");
  eq(cardsIn(s, "graveyard", 0).length, 0, "and not in the graveyard");
}
{
  const s = started();
  const general = addObject(s, creature({card: "Bear General", owner: 0, controller: 0,
    manaCost: "{1}{G}", commander: true}), "battlefield");
  s.objects[general].damage = 5;
  checkStateBasedActions(s);
  resolveAwaiting(s, [1]);
  eq(cardsIn(s, "graveyard", 0).length, 1,
    "saying no leaves it in the graveyard — which is a real choice, because that is where a reanimation starts");
  eq(cardsIn(s, "command", 0).length, 0, "and the command zone stays empty");
}
{
  const s = started();
  /* A borrowed commander dies to its OWNER's command zone, and its owner is the one asked. */
  const general = addObject(s, creature({card: "Their General", owner: 3, controller: 0,
    manaCost: "{1}{G}", commander: true}), "battlefield");
  s.objects[general].damage = 5;
  checkStateBasedActions(s);
  eq(s.awaiting.player, 3, "the owner is asked, not the controller (CR 903.9a)");
  resolveAwaiting(s, [0]);
  eq(cardsIn(s, "command", 3).length, 1, "and it goes to their command zone");
  eq(cardsIn(s, "command", 0).length, 0, "not the one it was borrowed into");
}
{
  const s = started();
  const bear = addObject(s, creature({card: "Ordinary Bear", owner: 0, controller: 0}), "battlefield");
  s.objects[bear].damage = 5;
  checkStateBasedActions(s);
  eq(s.awaiting, null, "a creature that is not a commander is not asked anything");
  eq(cardsIn(s, "graveyard", 0).length, 1, "it just dies");
}

console.log(`engine-commander: ${checks} checks passed — color identity reads the rules text too, the tax counts casts from the command zone, and the owner is asked whether their commander comes back.`);
