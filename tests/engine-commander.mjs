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
import {createState, addObject, cardsIn, zoneOf, commanderKeyOf} from "../game/engine/state/index.mjs";
import {beginGame, advance, currentPhase, awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {legalActions, applyAction} from "../game/engine/rules/actions.mjs";
import {checkStateBasedActions} from "../game/engine/rules/sba.mjs";
import {colorIdentity, withinIdentity, commanderTax} from "../game/engine/rules/commander.mjs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {projectFor} from "../game/engine/projection.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";

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

  const key = commanderKeyOf(s.objects[general]);
  applyAction(s, 0, cast);
  eq(s.players[0].manaPool.G, 2, "two of the four green paid for it");
  eq(s.players[0].commanderCasts[key], 1, "and the cast is counted, against the commander rather than the object that was cast (CR 400.7)");
}
{
  const s = started();
  const general = addObject(s, creature({card: "Bear General", owner: 0, controller: 0,
    manaCost: "{1}{G}", commander: true}), "command", 0);
  eq(commanderTax(s, 0, general), 0, "no tax on the first cast");
  s.players[0].commanderCasts = {[commanderKeyOf(s.objects[general])]: 1};
  eq(commanderTax(s, 0, general), 2, "two more after one (CR 903.8)");
  s.players[0].commanderCasts = {[commanderKeyOf(s.objects[general])]: 3};
  eq(commanderTax(s, 0, general), 6, "and six after three — two for each previous cast, not a doubling");
}
{
  const s = started();
  const general = addObject(s, creature({card: "Bear General", owner: 0, controller: 0,
    manaCost: "{1}{G}", commander: true}), "command", 0);
  s.players[0].commanderCasts = {[commanderKeyOf(s.objects[general])]: 1};
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

{
  /* A game that is over asks nobody anything: seat 0's commander dies in the same check that puts the last opponent
     out (CR 104.2a), and its owner, the winner, is not asked where it goes. */
  const s = createState({matchId: "m", seed: "s", players: [{name: "Rob"}, {name: "Maya"}]});
  beginGame(s);
  const general = addObject(s, creature({card: "Bear General", owner: 0, controller: 0, manaCost: "{1}{G}", commander: true}), "battlefield");
  s.objects[general].damage = 5;
  s.players[1].life = 0;
  checkStateBasedActions(s);
  eq([s.players[1].lost, cardsIn(s, "graveyard", 0).length, s.awaiting], [true, 1, null],
    "the commander died and the game ended in one check: the winner is not asked about the command zone");
}

/* ---- the question holds the triggers (CR 704.3, 603.3b) ----
   A commander that dies as a step begins -- its damage marked before the upkeep -- is asked about before anything goes on
   the stack: the question is part of the state-based actions, and triggers wait until those are done. The death's
   triggers wait for the answer; had they gone first, two of them would have replaced the question with their order. */
{
  const index = loadCardIndex();
  const s = started();
  for (const name of ["Zulaport Cutthroat", "Blood Artist"]) addObject(s, {...index.definition(name), card: name, owner: 0, controller: 0}, "battlefield");
  const general = addObject(s, creature({card: "Bear General", owner: 0, controller: 0, manaCost: "{1}{G}", commander: true}), "battlefield");
  s.objects[general].damage = 5;
  let guard = 0;
  while (!s.awaiting && guard < 30) { advance(s); guard += 1; }
  eq([s.awaiting?.kind, s.stack.length, (s.pendingTriggers ?? []).length], ["commander-replacement", 0, 2],
    "a commander dying as the upkeep begins: its owner is asked first, and its death's two triggers wait, off the stack");
  resolveAwaiting(s, [0]);
  eq([cardsIn(s, "command", 0).length, s.awaiting?.kind ?? null], [1, "order-triggers"],
    "answered, it is in the command zone, and then its owner orders the two triggers");
}

/* ---- the commander through a game: real cards, through the rules (the plan review's probes P1-P5, 2026-10-03) ----
 *
 * Each of these was wrong at 849845bf, and each passed every unit check above: the functions were right and nothing in a
 * game reached them the right way. A commander removed by an effect was never asked about (only a death by damage was,
 * and before the move, so no "dies" trigger saw it); the tax and the damage tally were kept by the object, which a zone
 * change replaces (CR 400.7); and combat damage never reached the tally at all. */
{
  const index = loadCardIndex();
  /* A one-mana 11/3 with haste, legendary: a commander that can attack the turn it is cast and die to a Lightning Bolt. */
  const BOSS = {types: ["Creature"], subtypes: ["Ogre"], supertypes: ["Legendary"], manaCost: "{R}", colors: ["R"], power: 11, toughness: 3, keywords: ["Haste"]};
  const play = (name, setup, steps, extra = {}) => runScenario({name, setup, steps, ...extra}, index.definition, {Boss: BOSS});
  const cast = [{tap: "Mountain"}, {cast: "Boss"}, {resolve: true}];
  const ZONE = "Put it into the command zone";

  /* CR 903.9a: exiled by an effect (Swords to Plowshares), its owner is asked once it is there, and yes moves it. */
  {
    const {state} = play("exiled by an effect", [
      {seat: 0, zone: "command", cards: ["Boss"]}, {seat: 0, zone: "battlefield", cards: ["Mountain", "Mountain", "Mountain"]},
      {seat: 1, zone: "battlefield", cards: ["Plains"]}, {seat: 1, zone: "hand", cards: ["Swords to Plowshares"]},
    ], [...cast, {pass: 1}, {tap: "Plains", seat: 1}, {cast: "Swords to Plowshares", seat: 1, targets: [{card: "Boss"}]}, {resolve: true},
      {expect: [{seat: 0, zone: "exile", cards: ["Boss"]}, {asks: {seat: 0, options: [ZONE, "Leave it in exile"]}}]},
      {choose: [ZONE]}]);
    eq([cardsIn(state, "command", 0).map((id) => state.objects[id].card), state.zones.exile.length],
      [["Boss"], 0], "a commander exiled by an effect: its owner is asked once it is in exile (CR 903.9a), and yes puts it in the command zone");
  }

  /* Destroyed by an effect (Terminate): asked; no leaves it, and it is not asked again. */
  {
    const {state} = play("destroyed by an effect, and left there", [
      {seat: 0, zone: "command", cards: ["Boss"]}, {seat: 0, zone: "battlefield", cards: ["Mountain", "Mountain", "Mountain"]},
      {seat: 1, zone: "battlefield", cards: ["Swamp", "Mountain"]}, {seat: 1, zone: "hand", cards: ["Terminate"]},
    ], [...cast, {pass: 1}, {tap: "Swamp", seat: 1}, {tap: "Mountain", seat: 1}, {cast: "Terminate", seat: 1, targets: [{card: "Boss"}]}, {resolve: true},
      {expect: [{asks: {seat: 0, options: [ZONE, "Leave it in your graveyard"]}}]},
      {choose: ["Leave it in your graveyard"]},
      /* On to the next turn: state-based actions are checked at every priority, and a refused commander is not asked again. */
      {to: {turn: 2, phase: "MAIN1"}}]);
    eq([cardsIn(state, "graveyard", 0).map((id) => state.objects[id].card), state.awaiting], [["Boss"], null],
      "a commander destroyed by an effect: no leaves it in the graveyard, and the owner is not asked again while it stays there");
  }

  /* Killed (Lightning Bolt): it dies first -- Zulaport Cutthroat sees it -- and the question comes after (CR 903.9a is a
     state-based action, not a replacement). */
  {
    const {state} = play("dies, is seen dying, then asked", [
      {seat: 0, zone: "command", cards: ["Boss"]}, {seat: 0, zone: "battlefield", cards: ["Mountain", "Mountain", "Mountain", "Zulaport Cutthroat"]},
      {seat: 1, zone: "battlefield", cards: ["Mountain"]}, {seat: 1, zone: "hand", cards: ["Lightning Bolt"]},
    ], [...cast, {pass: 1}, {tap: "Mountain", seat: 1}, {cast: "Lightning Bolt", seat: 1, targets: [{card: "Boss"}]}, {resolve: true},
      {expect: [{seat: 0, zone: "graveyard", cards: ["Boss"]}, {asks: {seat: 0, options: [ZONE, "Leave it in your graveyard"]}}]},
      {choose: [ZONE]},
      {expect: [{seat: 0, zone: "command", cards: ["Boss"]}, {stack: 1}]},
      {resolve: true}]);
    eq([state.players[1].life, state.players[0].life], [39, 41],
      "a commander that dies is a creature that died: Zulaport Cutthroat drains for it, and its owner still moves it to the command zone");
  }

  /* CR 903.9b: a commander that would be put into its owner's hand or library may go to the command zone instead -- a
     replacement, so its owner is asked before it moves, and "no" lets it go where the effect sends it. */
  const BOUNCE = {types: ["Instant"], manaCost: "{U}", colors: ["U"], spell: {id: "s", text: "Return target creature to its owner's hand.",
    targets: [{what: "permanent", types: ["Creature"]}], effects: [{effect: "moveZone", targets: {target: 0}, to: "hand"}]}};
  const TUCK = {types: ["Instant"], manaCost: "{U}", colors: ["U"], spell: {id: "s", text: "Put target creature on the bottom of its owner's library.",
    targets: [{what: "permanent", types: ["Creature"]}], effects: [{effect: "moveZone", targets: {target: 0}, to: "library"}]}};
  const moved = (spell, answer) => runScenario({name: `${spell} and ${answer}`, setup: [
    {seat: 0, zone: "command", cards: ["Boss"]}, {seat: 0, zone: "battlefield", cards: ["Mountain"]},
    {seat: 1, zone: "battlefield", cards: ["Island"]}, {seat: 1, zone: "hand", cards: [spell]},
  ], steps: [...cast, {pass: 1}, {tap: "Island", seat: 1}, {cast: spell, seat: 1, targets: [{card: "Boss"}]}, {resolve: true},
    {expect: [{seat: 0, zone: "battlefield", cards: ["Mountain", "Boss"]}, {asks: {seat: 0, options: [ZONE, spell === "Bounce" ? "Let it go to your hand" : "Let it go to your library"]}}]},
    {choose: [answer]}]}, index.definition, {Boss: BOSS, Bounce: BOUNCE, Tuck: TUCK}).state;
  {
    /* On Maya's own turn, the question is still Rob's: the owner's, not the active player's. */
    const theirs = runScenario({name: "bounced on Maya's turn", setup: [
      {seat: 0, zone: "command", cards: ["Boss"]}, {seat: 0, zone: "battlefield", cards: ["Mountain"]},
      {seat: 1, zone: "battlefield", cards: ["Island"]}, {seat: 1, zone: "hand", cards: ["Bounce"]},
    ], steps: [...cast, {to: {turn: 2, phase: "MAIN1"}}, {tap: "Island", seat: 1}, {cast: "Bounce", seat: 1, targets: [{card: "Boss"}]}, {resolve: true},
      {expect: [{asks: {seat: 0, options: [ZONE, "Let it go to your hand"]}}]}]}, index.definition, {Boss: BOSS, Bounce: BOUNCE}).state;
    eq(theirs.awaiting?.player, 0, "bounced on Maya's turn, Rob is the one asked (CR 903.9b: its owner)");
    const home = moved("Bounce", ZONE), kept = moved("Bounce", "Let it go to your hand"), tucked = moved("Tuck", "Let it go to your library");
    const where = (st) => Object.values(st.objects).find((o) => o.card === "Boss")?.zone;
    eq([where(home), where(kept), where(tucked), kept.awaiting, cardsIn(home, "hand", 0).length],
      ["command", "hand", "library", null, 0],
      "a commander bounced or tucked: its owner is asked BEFORE it moves (CR 903.9b) -- yes, the command zone and never the hand; no, the hand or the library, and nothing more is asked");
  }

  /* The tax (CR 903.8) follows the commander, not the object: after one cast and one return it costs {2} more. */
  {
    const {state} = play("the tax after a return", [
      {seat: 0, zone: "command", cards: ["Boss"]}, {seat: 0, zone: "battlefield", cards: ["Mountain", "Mountain", "Mountain"]},
      {seat: 1, zone: "battlefield", cards: ["Mountain"]}, {seat: 1, zone: "hand", cards: ["Lightning Bolt"]},
    ], [...cast, {pass: 1}, {tap: "Mountain", seat: 1}, {cast: "Lightning Bolt", seat: 1, targets: [{card: "Boss"}]}, {resolve: true},
      {choose: [ZONE]}, {to: {turn: 3, phase: "MAIN1"}}, {tap: "Mountain"},
      {expect: [{offers: {kind: "cast", card: "Boss"}, count: 0}]},
      {tap: "Mountain"}, {tap: "Mountain"},
      {expect: [{offers: {kind: "cast", card: "Boss"}, count: 1}]}]);
    eq(commanderTax(state, 0, cardsIn(state, "command", 0)[0]), 2, "a commander cast once and returned costs {2} more the second time (CR 903.8), whatever object it is now");
  }

  /* Commander damage (CR 903.10a) counts combat damage from the same commander over the game, across its zone changes. */
  {
    const {state} = play("21 from the same commander, across a death", [
      {seat: 0, zone: "command", cards: ["Boss"]}, {seat: 0, zone: "battlefield", cards: ["Mountain", "Mountain", "Mountain"]},
      {seat: 1, zone: "battlefield", cards: ["Mountain"]}, {seat: 1, zone: "hand", cards: ["Lightning Bolt"]},
    ], [...cast, {attack: ["Boss"]}, {to: {turn: 2, phase: "MAIN1"}},
      {expect: [{seat: 1, life: 29}]},
      {tap: "Mountain", seat: 1}, {cast: "Lightning Bolt", seat: 1, targets: [{card: "Boss"}]}, {resolve: true},
      {choose: [ZONE]}, {to: {turn: 3, phase: "MAIN1"}},
      {tap: "Mountain"}, {tap: "Mountain"}, {tap: "Mountain"}, {cast: "Boss"}, {resolve: true}, {attack: ["Boss"]},
      {to: {turn: 3, phase: "MAIN2"}}], {stopWhenOver: true});
    eq([state.players[1].life, state.players[1].lost === true, state.players[1].lostTo ?? null, Object.values(state.players[1].commanderDamage)],
      [18, true, "commander-damage", [22]],
      "11 combat damage, a death and a recast, then 11 more: 22 from the same commander, one tally, and the player loses at 18 life (CR 903.10a)");
    /* And the board can say whose: the projection's commander card carries the key the tally is kept under. */
    const seen = projectFor(state, 1).players, key = seen[0].zones.Battlefield.cards.find((c) => c.name === "Boss")?.commanderKey;
    eq([Object.keys(seen[1].health.commanderDamage), String(key).split(":")[0]], [[key], "0"],
      "the commander as any seat sees it names the key its damage is kept under, its owner's seat first");
  }
}

console.log(`engine-commander: ${checks} checks passed — color identity reads the rules text too, the tax counts casts from the command zone, and the owner is asked whether their commander comes back.`);
