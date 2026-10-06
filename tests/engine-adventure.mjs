/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* ADVENTURES (CR 715; Bofur, Reliable Guardian // Concerted Care).
 *
 * An adventurer card has two sets of characteristics: its own, and its Adventure's -- an instant or sorcery with the
 * subtype Adventure (CR 715.2). Its owner may cast it as itself or as its Adventure, each its own offer (715.3); cast as an
 * Adventure, only the Adventure's characteristics are weighed (715.3a) and the spell has only those on the stack (715.3b),
 * and everywhere else the card has only its own (715.4). An Adventure that resolves is exiled by its controller, who may
 * cast the card -- as itself, never as an Adventure that way -- for as long as it remains exiled (715.3d); one that does not
 * resolve goes where any spell would. The definition's `adventure` half (cards/index.mjs, `adventurer`), the object's face
 * (state/index.mjs), the offers and the cast (rules/actions.mjs, withAdventure), the exile (rules/stack.mjs). The card's
 * scenarios play the card; this suite holds the edges: a counter, a copy, three players, a commander's tax, an effect that
 * casts it, a land adventurer, "nothing to do", the schema, and the state left unchanged by a look.
 */
import assert from "node:assert/strict";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {legalActions, applyAction, nothingToDo} from "../game/engine/rules/actions.mjs";
import {pushCopy, stackProjection} from "../game/engine/rules/stack.mjs";
import {resolveAwaiting, awaitingChoice} from "../game/engine/rules/turn.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";
import {beginResolution} from "../game/engine/script/resolution.mjs";
import {createCardIndex, compileScript} from "../game/engine/cards/index.mjs";
import {validateScript, SCRIPT_SCHEMA} from "../game/engine/script/schema.mjs";
import {commanderTax} from "../game/engine/rules/commander.mjs";
import {hashState} from "../game/engine/journal.mjs";
import {addObject} from "../game/engine/state/index.mjs";
import {identityOf, checkAnswer, ADVENTURE_BY_HAND, checkFidelity, smokeTest} from "../game/engine/cards/compile.mjs";
import {compileCards} from "../game/tools/engine-compile.mjs";
import {loadCardScripts} from "../game/tools/engine-cards.mjs";
import {castChoicesNow, castNow} from "../game/engine/rules/actions.mjs";
import {deriving, derivingAfresh, characteristicsOf} from "../game/engine/rules/layers.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const BOFUR = "Bofur, Reliable Guardian // Concerted Care", ME = "Bofur, Reliable Guardian", CARE = "Concerted Care";
const at = (seat, zone, ...cards) => ({seat, zone, cards});
const creature = (name, more = {}) => ({types: ["Creature"], subtypes: [name], manaCost: "{1}{G}", colors: ["G"], power: 2, toughness: 2, ...more});
/* A land whose mana costs 1 life: no source a cast taps for itself (rules/actions.mjs, tapUnits), so a cast is offered only
   with mana in the pool -- what "nothing to do" then counts. */
const PAINFUL = {types: ["Land"], abilities: [{id: "m", kind: "mana", tapSelf: true, produces: {W: 1}, payLife: 1}]};
const FIX = {Bear: creature("Bear"), Painful: PAINFUL};
const play = (setup, steps, more = {}, cards = index.definition) => runScenario({name: "adventure", setup, steps, ...more}, cards, FIX).state;
const named = (s, card, zone) => Object.values(s.objects).filter((o) => o.card === card && (zone === undefined || o.zone === zone));
const casts = (s, seat = 0) => legalActions(s, seat).filter((a) => a.kind === "cast").map((a) => `${a.label}${a.adventure ? " (Adventure)" : ""}`).sort();
const careAt = (s, target, seat = 0) => legalActions(s, seat).find((a) => a.kind === "cast" && a.adventure === true && a.targets?.[0]?.id === target);
const mayPlays = (s) => (s.effects ?? []).filter((e) => e.rule === "may-play");

/* ---- the definition, and the card as itself everywhere but the stack (CR 715.4) ---- */
{
  const definition = index.definition(BOFUR);
  eq([definition.adventurer.main.card, definition.adventurer.adventure.card, definition.adventurer.adventure.types, definition.adventurer.adventure.subtypes],
    [ME, CARE, ["Instant"], ["Adventure"]], "the definition carries both halves: Bofur, and Concerted Care, an instant with the subtype Adventure");
  const s = play([at(0, "hand", BOFUR)], []);
  const [card] = named(s, ME, "hand");
  eq([card.types, card.manaCost, card.supertypes, card.face], [["Creature"], "{W}", ["Legendary"], undefined], "in hand it is Bofur alone: a legendary creature costing {W}");
}

/* ---- the offers: each half by its own cost and timing (CR 715.3a), and a look that changes nothing ---- */
{
  const one = play([at(0, "battlefield", "Plains", "Bear"), at(0, "hand", BOFUR)], [{tap: "Plains"}]);
  eq(casts(one), [ME], "with {W} in the pool, only Bofur: the Adventure costs {1}{W}");
  const two = play([at(0, "battlefield", "Plains", "Wastes", "Bear"), at(0, "hand", BOFUR)], [{tap: "Plains"}, {tap: "Wastes"}]);
  eq(casts(two), [ME, CARE + " (Adventure)"], "with {1}{W}, both, each its own offer");
  const before = hashState(two);
  legalActions(two, 0); legalActions(two, 0);
  eq(hashState(two), before, "weighing the Adventure leaves the game as it was: the card back as itself in hand");
  const [card] = named(two, ME, "hand");
  eq([card.card, card.face, card.types], [ME, undefined, ["Creature"]], "and the object is Bofur again, no face left showing");
  const none = play([at(0, "battlefield", "Plains", "Wastes"), at(0, "hand", BOFUR)], [{tap: "Plains"}, {tap: "Wastes"}]);
  eq(casts(none), [ME], "no artifact or creature of Rob's to target: the Adventure is not offered (CR 601.2c), Bofur is");
}

/* ---- on the stack: the Adventure's characteristics alone (CR 715.3b) ---- */
{
  const s = play([at(0, "battlefield", "Plains", "Wastes", "Bear"), at(0, "hand", BOFUR)], [{tap: "Plains"}, {tap: "Wastes"}, {cast: CARE, targets: [{card: "Bear"}]}]);
  const spell = s.objects[s.stack[0].objectId];
  eq([spell.card, spell.types, spell.subtypes, spell.manaCost, spell.face], [CARE, ["Instant"], ["Adventure"], "{1}{W}", "adventure"], "the spell is Concerted Care, an instant Adventure costing {1}{W}");
  eq([stackProjection(s)[0].name, s.stack[0].adventure, s.stack[0].permanent], [CARE, true, false], "the stack shows Concerted Care, cast as an Adventure, not a permanent spell");
  eq(s.players[0].castThisTurn.at(-1).types, ["Instant"], "and what Rob cast this turn is an instant spell");
  /* A checkpoint taken here resumes the same: the face is plain data. */
  const resumed = JSON.parse(JSON.stringify(s));
  for (let n = 0; n < 6 && resumed.stack.length; n += 1) passPriority(resumed);
  eq([named(resumed, ME, "exile").length, mayPlays(resumed).length], [1, 1], "resumed from JSON, it resolves the same: exiled, with its permission");
}

/* ---- countered: to the graveyard as itself, on no adventure (CR 715.3d covers a resolution only) ---- */
{
  const s = play([at(0, "battlefield", "Plains", "Wastes", "Bear"), at(0, "hand", BOFUR), at(1, "battlefield", "Island", "Island"), at(1, "hand", "Counterspell")],
    [{tap: "Plains"}, {tap: "Wastes"}, {cast: CARE, targets: [{card: "Bear"}]}, {pass: 1}, {tap: "Island", seat: 1}, {tap: "Island", seat: 1},
      {cast: "Counterspell", seat: 1, targets: [{card: CARE}]}, {resolve: true}]);
  eq([named(s, ME, "graveyard").length, named(s, ME, "exile").length, mayPlays(s).length], [1, 0, 0], "countered by Maya: Bofur in Rob's graveyard, nothing exiled, no permission");
  eq(named(s, ME, "graveyard")[0].types, ["Creature"], "and it is Bofur there, a creature card");
}

/* ---- a copy of an Adventure ceases to exist; only the card goes on an adventure (CR 707.10, 715.3d) ---- */
{
  const s = play([at(0, "battlefield", "Plains", "Wastes", "Bear"), at(0, "hand", BOFUR)], [{tap: "Plains"}, {tap: "Wastes"}, {cast: CARE, targets: [{card: "Bear"}]}], {seats: 2});
  pushCopy(s, s.stack[0], {controller: 1});
  for (let n = 0; n < 12 && s.stack.length; n += 1) passPriority(s);
  eq([named(s, CARE).length, named(s, ME, "exile").length, mayPlays(s).map((e) => e.player)], [0, 1, [0]], "Maya's copy resolves and is gone; the card is exiled, and Rob alone may cast it");
}

/* ---- exiled on an adventure: cast as itself only, for as long as it stays there (CR 715.3d) ---- */
const exiled = (more = []) => play([at(0, "battlefield", "Plains", "Wastes", "Plains", "Wastes", "Bear"), at(0, "hand", BOFUR)],
  [{tap: "Plains"}, {tap: "Wastes"}, {cast: CARE, targets: [{card: "Bear"}]}, {resolve: true}, ...more]);
{
  const s = exiled([{tap: "Plains"}, {tap: "Wastes"}]);
  eq(casts(s), [ME], "from exile, with {1}{W} in the pool: Bofur, and not the Adventure again");
  const [permission] = mayPlays(s);
  eq([permission.notAdventure, permission.spellsOnly, permission.until, permission.player], [true, true, "ever", 0], "its permission: Rob's, to cast it as itself, for as long as it remains exiled");
  /* Another effect's permission to cast it may cast it as an Adventure (715.3d) -- the player's own permission, not another's. */
  const [card] = named(s, ME, "exile");
  s.effects.push({id: "theirs", rule: "may-play", affects: {ids: [card.id]}, player: 1, spellsOnly: true, until: "end-of-turn", madeOnTurn: s.turn, sourceController: 1});
  eq(casts(s), [ME], "Maya's permission to cast it lets Rob cast no Adventure");
  s.effects.push({id: "other", rule: "may-play", affects: {ids: [card.id]}, player: 0, spellsOnly: true, until: "end-of-turn", madeOnTurn: s.turn, sourceController: 0});
  eq(casts(s), [ME, CARE + " (Adventure)"], "with another effect's permission too, the Adventure may be cast from there");
  const later = exiled([{to: {turn: 3, phase: "MAIN1"}}, {tap: "Plains"}]);
  eq(casts(later), [ME], "on Rob's next turn it is still his to cast");
  /* Moved from exile, it is a new object (CR 400.7): the permission stays behind. */
  const gone = exiled([{tap: "Plains"}, {tap: "Wastes"}]);
  beginResolution(gone, [{effect: "moveZone", targets: [named(gone, ME, "exile")[0].id], to: "graveyard"}], {controller: 0});
  eq([named(gone, ME, "graveyard").length, casts(gone)], [1, []], "put into the graveyard from exile, it is cast from nowhere: the permission stayed behind");
}

/* ---- three players: the Adventure's controller is the one who may cast it from exile, whoever owns it ---- */
{
  const s = play([at(0, "battlefield", "Bear"), at(1, "battlefield", "Bear", "Plains", "Wastes")], [], {seats: 3});
  /* Rob's card, in exile, which an effect lets Maya cast (as an effect that steals a card would). */
  const card = addObject(s, {...index.definition(BOFUR), card: BOFUR, owner: 0, controller: 0}, "exile");
  s.effects = [...(s.effects ?? []), {id: "steal", rule: "may-play", affects: {ids: [card]}, player: 1, spellsOnly: true, until: "ever", madeOnTurn: s.turn, sourceController: 1}];
  passPriority(s);
  eq(s.priorityPlayer, 1, "Maya holds priority");
  for (const id of s.zones.battlefield) if (s.objects[id].controller === 1 && ["Plains", "Wastes"].includes(s.objects[id].card)) applyAction(s, 1, legalActions(s, 1).find((a) => a.kind === "activate-mana" && a.objectId === id));
  const bear = named(s, "Bear").find((o) => o.controller === 1).id;
  eq(casts(s, 0), [], "Rob, without priority, is offered nothing");
  applyAction(s, 1, careAt(s, bear, 1));
  eq(s.stack[0].playerId, 1, "Maya casts Rob's Concerted Care on her Bear");
  for (let n = 0; n < 9 && s.stack.length; n += 1) passPriority(s);
  const [permission] = mayPlays(s).filter((e) => e.notAdventure);
  eq([named(s, ME, "exile")[0].owner, permission.player], [0, 1], "exiled, still Rob's card, and Maya -- the Adventure's controller -- may cast it");
}

/* ---- a commander on an adventure: the tax counts the cast from the command zone (CR 903.8) ---- */
{
  const s = play([at(0, "battlefield", "Plains", "Wastes", "Plains", "Wastes", "Plains", "Bear"), at(0, "command", BOFUR)],
    [{tap: "Plains"}, {tap: "Wastes"}, {cast: CARE, targets: [{card: "Bear"}]}, {resolve: true}, {choose: ["Put it into the command zone"]}]);
  const [home] = named(s, ME, "command");
  eq([Boolean(home), commanderTax(s, 0, home.id)], [true, 2], "Concerted Care cast from the command zone: Bofur home again costs {2} more");
  const theirs = play([at(0, "battlefield", "Plains", "Wastes", "Bear"), at(0, "command", BOFUR)], [{to: {turn: 2, phase: "MAIN1"}}, {pass: 1}, {tap: "Plains", seat: 0}, {tap: "Wastes", seat: 0}]);
  eq(casts(theirs), [CARE + " (Adventure)"], "from the command zone on Maya's turn: the Adventure, an instant, and not Bofur");
}

/* ---- an effect that casts it: either half, each by its own mana value (CR 715.3a, 608.2g) ---- */
{
  const ask = (most) => {
    const s = play([at(0, "battlefield", "Bear"), at(0, "hand", BOFUR)], []);
    beginResolution(s, [{effect: "play", from: "hand", manaValueAtMost: most, free: true}], {controller: 0});
    return awaitingChoice(s).options.map((o) => o.label);
  };
  eq(ask(1), [ME, "Don't cast"], "\"with mana value 1 or less\": Bofur, and not Concerted Care, whose mana value is 2");
  eq(ask(2), [ME, `${CARE} → Bear`, "Don't cast"], "2 or less: either");
  const s = play([at(0, "battlefield", "Bear"), at(0, "hand", BOFUR)], []);
  beginResolution(s, [{effect: "play", from: "hand", manaValueAtMost: 2, free: true}], {controller: 0});
  resolveAwaiting(s, [1]);
  eq([s.stack.length, s.objects[s.stack[0].objectId].card, s.stack[0].adventure], [1, CARE, true], "cast this way, it is the Adventure on the stack");
  /* "Mana of any type can be spent": what is owed is the mana value of the half cast -- one for Bofur, two for the Adventure. */
  const one = play([at(0, "battlefield", "Plains", "Bear"), at(0, "hand", BOFUR)], []);
  beginResolution(one, [{effect: "play", from: "hand", anyMana: true}], {controller: 0});
  eq(awaitingChoice(one).options.map((o) => o.label), [ME, "Don't cast"], "with one land: Bofur's one mana can be paid, the Adventure's two cannot");
}

/* ---- "nothing to do": an instant Adventure there is mana for is something to do ---- */
{
  const theirTurn = (hand) => play([at(0, "battlefield", "Painful", "Painful", "Bear"), at(0, "hand", hand)], [{to: {turn: 2, phase: "MAIN1"}}, {pass: 1}]);
  const s = theirTurn(BOFUR);
  eq([s.priorityPlayer, casts(s)], [0, []], "on Maya's turn, with lands that cost life to tap, no cast is offered from an empty pool");
  eq(nothingToDo(s, 0), false, "but Concerted Care could be cast with them: there is something to do");
  eq(nothingToDo(theirTurn("Bear"), 0), true, "with only a creature card in hand, there is not");
  /* Bofur back from its adventure, in exile: castable as itself only, a creature -- nothing to do on Maya's turn. */
  const away = play([at(0, "battlefield", "Plains", "Wastes", "Painful", "Painful", "Bear"), at(0, "hand", BOFUR)],
    [{tap: "Plains"}, {tap: "Wastes"}, {cast: CARE, targets: [{card: "Bear"}]}, {resolve: true}, {to: {turn: 2, phase: "MAIN1"}}, {pass: 1}]);
  eq([named(away, ME, "exile").length, nothingToDo(away, 0)], [1, true], "on an adventure, the card is no Adventure to cast: nothing to do");
}

/* ---- a land adventurer: played from exile once its Adventure resolves (CR 715.3d) ---- */
{
  const town = {schema: SCRIPT_SCHEMA, identity: {name: "Probe Town // Probe Raid", oracleId: "probe-town", types: ["Land"], subtypes: ["Town"], manaCost: "", colors: [], colorIdentity: ["R"], power: null, toughness: null},
    oracleText: "{T}: Add {C}.", source: "hand",
    abilities: [{kind: "activated", text: "{T}: Add {C}.", cost: [{atom: "{T}"}], effects: [{effect: "addMana", mana: {C: 1}}]}],
    adventure: {identity: {name: "Probe Raid", types: ["Sorcery"], subtypes: ["Adventure"], manaCost: "{R}", colors: ["R"], power: null, toughness: null},
      oracleText: "Each opponent loses 1 life.", abilities: [{kind: "spell", text: "Each opponent loses 1 life.", effects: [{effect: "loseLife", amount: 1, who: "opponent"}]}]}};
  const cards = createCardIndex([town]);
  const lookup = (name) => cards.definition(name) ?? index.definition(name);
  const s = play([at(0, "battlefield", "Mountain"), at(0, "hand", "Probe Town // Probe Raid")], [{tap: "Mountain"}, {cast: "Probe Raid"}, {resolve: true}], {}, lookup);
  eq([s.players[1].life, named(s, "Probe Town", "exile").length], [39, 1], "the sorcery Adventure of a land resolves: Maya loses 1, and the card is exiled");
  eq(legalActions(s, 0).filter((a) => a.kind === "play-land").map((a) => a.label), ["Probe Town"], "and Rob may play it as his land from exile");
}

/* ---- the schema and the compiler refuse what is not an adventurer card ---- */
{
  const base = () => ({schema: SCRIPT_SCHEMA, identity: {name: "Probe // Probe Care", oracleId: "p", types: ["Creature"], manaCost: "{W}", colors: ["W"], power: 1, toughness: 1}, oracleText: "", source: "hand", abilities: [],
    adventure: {identity: {name: "Probe Care", types: ["Instant"], subtypes: ["Adventure"], manaCost: "{1}{W}", colors: ["W"]}, oracleText: "Draw a card.",
      abilities: [{kind: "spell", text: "Draw a card.", effects: [{effect: "draw", count: 1}]}]}});
  ok(validateScript(base()).valid && compileScript(base()).definition !== null, "a creature with an instant Adventure is an adventurer card");
  const creatureAdventure = base(); creatureAdventure.adventure.identity.types = ["Creature"];
  ok(validateScript(creatureAdventure).errors.some((e) => /instant or a sorcery with the subtype Adventure/.test(e.message)), "an Adventure that is a creature is refused");
  const noSubtype = base(); noSubtype.adventure.identity.subtypes = [];
  ok(!validateScript(noSubtype).valid, "an Adventure without the subtype Adventure is refused");
  const nameless = base(); delete nameless.adventure.identity.name;
  ok(validateScript(nameless).errors.some((e) => e.path === "adventure.identity.name"), "an Adventure is held to the identity a card is: one without a name is refused");
  const unbuilt = base(); unbuilt.adventure.abilities[0].effects = [{effect: "notAPrimitive"}];
  ok(validateScript(unbuilt).errors.some((e) => e.path.startsWith("adventure.abilities[0]")), "and its abilities to the schema: an effect that is no primitive is refused there");
  const both = base(); both.back = {identity: {name: "Back", types: ["Land"]}, oracleText: "", abilities: []};
  ok(validateScript(both).errors.some((e) => /not both/.test(e.message)), "an adventurer card with a back face is refused");
  const misnamed = base(); misnamed.adventure.identity.name = "Something Else";
  ok(compileScript(misnamed).problems.some((p) => /Card \/\/ Adventure/.test(p)), "an Adventure named otherwise than the card's second name is refused");
  const spellless = base(); spellless.adventure.abilities = [];
  ok(compileScript(spellless).problems.some((p) => /Adventure: /.test(p)), "an Adventure with no spell ability is refused");
  const instantCard = base(); instantCard.identity.types = ["Instant"]; instantCard.abilities = [{kind: "spell", text: "Draw a card.", effects: [{effect: "draw", count: 1}]}];
  ok(compileScript(instantCard).problems.some((p) => /permanent card/.test(p)), "an instant card with an Adventure is refused: the adventurer card is a permanent card");
}

/* ---- the Adventure's own characteristics, wherever a rule reads them (CR 715.3a) ---- */
{
  /* "Instant and sorcery spells you cast cost {1} less": Concerted Care for {W}, read afresh -- not the creature the same
     look had just read (rules/layers.mjs, derivingAfresh). */
  const s = play([at(0, "battlefield", "Goblin Electromancer", "Plains", "Bear"), at(0, "hand", BOFUR)], [{tap: "Plains"}]);
  eq(casts(s), [ME, CARE + " (Adventure)", CARE + " (Adventure)"], "with Goblin Electromancer and {W}: Bofur, and Concerted Care for {1} less, at the Bear or the Electromancer");
  /* A permanent's permission to cast from the top of the library is asked of what is cast (Mystic Forge's shape). */
  const fromTop = (spells) => ({types: ["Enchantment"], abilities: [{id: "a0", kind: "static", text: "You may cast spells from the top of your library.", rule: "play-from",
    affects: {what: "player", who: "you"}, zone: "library-top", spells}]});
  const FIXES = {...FIX, "Creature Top": fromTop({types: ["Creature"]}), "Any Top": fromTop(true)};
  const top = (permission) => runScenario({name: "top", library: [BOFUR], setup: [at(0, "battlefield", permission, "Plains", "Wastes", "Bear")],
    steps: [{tap: "Plains"}, {tap: "Wastes"}]}, index.definition, FIXES).state;
  eq(casts(top("Creature Top")), [ME], "\"you may cast creature spells from the top\": Bofur, never Concerted Care, an instant");
  eq(casts(top("Any Top")), [ME, CARE + " (Adventure)"], "\"you may cast spells from the top\": either");
}

/* ---- tapped for as it is cast: the Adventure's cost, and the question of which lands (CR 601.2g) ---- */
{
  const s = play([at(0, "battlefield", "Plains", "Plains", "Wastes", "Bear"), at(0, "hand", BOFUR)], []);
  const [bear] = named(s, "Bear");
  const offer = careAt(s, bear.id);
  eq(offer?.autoTap, true, "with untapped lands and an empty pool, Concerted Care is offered tapped for as it is cast");
  applyAction(s, 0, offer);
  const question = awaitingChoice(s);
  eq([s.awaiting?.kind, question.title, question.options.map((o) => o.label).sort()], ["choose-cost", `${CARE}: what to tap for it`, ["Plains, Plains", "Plains, Wastes"]],
    "two ways to pay {1}{W}: asked which, for Concerted Care -- two lands, not Bofur's one");
  resolveAwaiting(s, [question.options.findIndex((o) => o.label === "Plains, Wastes")]);
  eq([s.stack.length, s.objects[s.stack[0]?.objectId]?.card, s.zones.battlefield.filter((id) => s.objects[id].tapped).map((id) => s.objects[id].card).sort()],
    [1, CARE, ["Plains", "Wastes"]], "answered: the Plains and the Wastes tapped, and Concerted Care on the stack");
}

/* ---- an Adventure is an offer of its own; one not offered is refused, whatever it claims ---- */
{
  const errand = {schema: SCRIPT_SCHEMA, identity: {name: "Probe Squire // Probe Errand", oracleId: "probe-squire", types: ["Creature"], subtypes: ["Human"], manaCost: "{W}", colors: ["W"], colorIdentity: ["W"], power: 1, toughness: 1},
    oracleText: "", source: "hand", abilities: [],
    adventure: {identity: {name: "Probe Errand", types: ["Instant"], subtypes: ["Adventure"], manaCost: "{W}", colors: ["W"], power: null, toughness: null},
      oracleText: "Draw a card.", abilities: [{kind: "spell", text: "Draw a card.", effects: [{effect: "draw", count: 1}]}]}};
  const stomp = {schema: SCRIPT_SCHEMA, identity: {name: "Probe Giant // Probe Stomp", oracleId: "probe-giant", types: ["Creature"], subtypes: ["Giant"], manaCost: "{3}{R}", colors: ["R"], colorIdentity: ["R"], power: 4, toughness: 4},
    oracleText: "", source: "hand", abilities: [],
    adventure: {identity: {name: "Probe Stomp", types: ["Instant"], subtypes: ["Adventure"], manaCost: "{R}", colors: ["R"], power: null, toughness: null},
      oracleText: "Each opponent loses 1 life.", abilities: [{kind: "spell", text: "Each opponent loses 1 life.", effects: [{effect: "loseLife", amount: 1, who: "opponent"}]}]}};
  const probes = createCardIndex([errand, stomp]);
  const lookup = (name) => probes.definition(name) ?? index.definition(name);
  /* Exiled on its adventure, the Squire is offered as itself; the same offer claiming to be the Adventure is refused. */
  const s = play([at(0, "battlefield", "Plains", "Plains"), at(0, "hand", "Probe Squire // Probe Errand")], [{tap: "Plains"}, {cast: "Probe Errand"}, {resolve: true}, {tap: "Plains"}], {}, lookup);
  const squire = legalActions(s, 0).find((a) => a.kind === "cast" && a.label === "Probe Squire");
  eq(casts(s), ["Probe Squire"], "from its adventure: the Squire, for {W}");
  assert.throws(() => applyAction(structuredClone(s), 0, {...squire, adventure: true}), /not a legal action/, "the Squire's offer, claiming to be its Adventure: refused");
  checks += 1;
  /* An effect that casts "with mana value 1 or less": the Giant's Adventure is, the Giant is not. */
  const giant = play([at(0, "battlefield", "Bear"), at(0, "hand", "Probe Giant // Probe Stomp")], [], {}, lookup);
  beginResolution(giant, [{effect: "play", from: "hand", manaValueAtMost: 1, free: true}], {controller: 0});
  eq(awaitingChoice(giant).options.map((o) => o.label), ["Probe Stomp", "Don't cast"], "a 4-mana Giant with a 1-mana Adventure: the Adventure is offered");
  /* Escape is the card's own (CR 702.138a): an Adventure is never cast with it, nor offered twice for it. */
  const fled = {...structuredClone(errand), identity: {...errand.identity, name: "Probe Runaway // Probe Errand", oracleId: "probe-runaway"},
    abilities: [{kind: "keyword", text: "Escape—{W}, Exile another card from your graveyard.", keyword: "escape", cost: [{atom: "mana", cost: "{W}"}, {atom: "exileFromGraveyard", count: 1}]}]};
  const graveyardSpells = {types: ["Enchantment"], abilities: [{id: "a0", kind: "static", text: "You may cast spells from your graveyard.", rule: "play-from", affects: {what: "player", who: "you"}, zone: "graveyard", spells: true}]};
  const more = createCardIndex([fled]);
  const grave = runScenario({name: "grave", setup: [at(0, "battlefield", "Graveyard Spells", "Plains"), at(0, "graveyard", "Probe Runaway // Probe Errand", "Bear")], steps: [{tap: "Plains"}]},
    (name) => more.definition(name) ?? index.definition(name), {...FIX, "Graveyard Spells": graveyardSpells}).state;
  eq(casts(grave).filter((label) => label.startsWith("Probe Errand")), ["Probe Errand (Adventure)"], "from a graveyard a permanent lets Rob cast from, with escape too: the Adventure once, never escaped");
  /* And a card with no Adventure, cast by an effect as if it had one, is no Adventure: to the graveyard as ever. */
  const bolt = play([at(0, "battlefield", "Bear"), at(0, "hand", "Lightning Bolt")], []);
  const [card] = named(bolt, "Lightning Bolt", "hand");
  eq(castChoicesNow(bolt, 0, card.id).filter((offer) => offer.adventure).length, 0, "a card with no Adventure: an effect offers it no Adventure");
  const [aim] = castChoicesNow(bolt, 0, card.id);
  castNow(bolt, 0, {...aim, adventure: true});
  for (let n = 0; n < 6 && bolt.stack.length; n += 1) passPriority(bolt);
  eq([named(bolt, "Lightning Bolt", "graveyard").length, mayPlays(bolt).length], [1, 0], "Lightning Bolt cast so goes to the graveyard, on no adventure");
}

/* ---- a look made afresh only where a memo is open (rules/layers.mjs, derivingAfresh) ---- */
{
  const s = play([at(0, "battlefield", "Bear")], []);
  const [bear] = named(s, "Bear");
  const seen = deriving(s, () => {
    const before = characteristicsOf(s, bear.id).power;
    s.objects[bear.id].power = 5;
    const fresh = derivingAfresh(s, () => characteristicsOf(s, bear.id).power);
    const after = characteristicsOf(s, bear.id).power;
    return [before, fresh, after];
  });
  eq(seen, [2, 5, 2], "inside a memo: the fresh look sees the Bear as it now is, and the memo keeps what it held");
  s.objects[bear.id].power = 2;
  const outside = derivingAfresh(s, () => { const a = characteristicsOf(s, bear.id).power; s.objects[bear.id].power = 7; return [a, characteristicsOf(s, bear.id).power]; });
  eq(outside, [2, 7], "outside one, none is opened: every look is the Bear as it is then");
}

/* ---- the definition checks: both halves held to their texts, and the smoke game plays the card ---- */
{
  const bofur = loadCardScripts().find((e) => e.script.identity.name === BOFUR).script;
  eq([checkFidelity(bofur).ok, smokeTest(bofur, index.definition).played], [true, true], "Bofur's definition is faithful to both halves, and its smoke game casts it");
  const invented = structuredClone(bofur);
  invented.adventure.abilities[0].text = "Target creature you control gains flying until end of turn.";
  ok(!checkFidelity(invented).ok, "an Adventure ability that is no sentence of the Adventure fails fidelity");
}

/* ---- the card loader: an adventurer card's printed facts are its own half's, and it is refused by name, not learned ---- */
{
  const card = {id: "probe", name: "Probe Knight // Probe Charge", layout: "adventure", mana: "{1}{W} // {R}", type: "Creature — Human Knight // Instant — Adventure", text: "", ci: ["R", "W"],
    faces: [{name: "Probe Knight", mana: "{1}{W}", type: "Creature — Human Knight", text: "Vigilance", power: "2", toughness: "2", colors: null},
      {name: "Probe Charge", mana: "{R}", type: "Instant — Adventure", text: "Probe Charge deals 1 damage to any target.", power: null, toughness: null, colors: null}]};
  const identity = identityOf(card);
  eq([identity.types, identity.subtypes, identity.manaCost, identity.colors, identity.colorIdentity, identity.power],
    [["Creature"], ["Human", "Knight"], "{1}{W}", ["W"], ["R", "W"], 2], "its printed facts: the Knight's, white by its cost, the identity both halves'");
  const checked = checkAnswer(card, {abilities: [{kind: "keyword", text: "Vigilance", keyword: "vigilance"}]});
  eq([checked.stage, checked.problems], ["layout", [ADVENTURE_BY_HAND]], "and the loader refuses it by name rather than learn its own half alone");
  let asked = 0;
  const run = await compileCards({names: [card.name], oracle: new Map([[card.name, card]]), hand: new Set(), cards: index.definition, ledger: {cards: {}},
    call: async () => { asked += 1; throw new Error("the writer is never asked about an adventurer card"); }, examples: []});
  eq([run.results, asked, run.cost], [[{name: card.name, outcome: "refused", problems: [ADVENTURE_BY_HAND]}], 0, 0], "a compile run refuses it before the writer is asked: nothing spent");
}

console.log(`engine-adventure: ${checks} checks passed -- an adventurer card cast as itself or its Adventure, each by its own characteristics; exiled on resolving and cast as itself from there; countered, copied, by another player, from the command zone, by an effect; a land adventurer; the schema.`);
