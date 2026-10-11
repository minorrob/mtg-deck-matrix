/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* PLAYING A CARD EXILED FACE DOWN (CR 406.3, 406.3a-b, 601.2, 305.1-305.2; Gandalf, Goblins' Bane // Flameshape).
 *
 * "Look at the top two cards of your library and exile them face down. For as long as they remain exiled, you may play them
 * if you control a Wizard." A card exiled face down has no characteristics (CR 406.3a), "but the spell or ability that
 * exiled it may allow it to be played from exile ... the card is turned face up just before the player announces that they
 * are playing the card". The exile is moveZone's (`faceDown`, `look`: the player who looked may go on looking while it
 * remains exiled, CR 406.3), the permission mayPlay's, with `onlyIf` its condition (rules/actions.mjs, permissionOpen),
 * asked whenever a card would be played through it. The offers weigh the card shown face up (rules/actions.mjs,
 * withFaceUp; state/index.mjs, shownFaceUp) -- a land under the land drop's rules, a spell by its own cost, timing and
 * targets, an adventurer card as itself or its Adventure (CR 715.3) -- and only for a player who may look at it (406.3b;
 * projection.mjs, mayLookAt). Played, it is revealed to every player; until then no other seat is told anything of it but
 * that it is a face-down card. The permission names objects, so it ends as the card leaves exile (CR 400.7).
 *
 * The card's scenarios (game/engine/cards/g/gandalf-goblins-bane-flameshape.scenarios.json) play the card; this suite holds
 * the edges: what the exile and the permission are; what each seat may see, by the projection and by G1's leak judge
 * (tools/fuzz-live.mjs); asking changes nothing; the real cost and timing; a cast that stops to ask; the condition coming and
 * going; the permission's end; the player who may not look; "nothing to do"; an adventurer card kept whole face down; and the
 * compiler's refusals.
 */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {legalActions, applyAction, nothingToDo} from "../game/engine/rules/actions.mjs";
import {awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {projectFor} from "../game/engine/projection.mjs";
import {hashState} from "../game/engine/journal.mjs";
import {runEffect} from "../game/engine/script/effects/index.mjs";
import {moveOne} from "../game/engine/script/effects/zones.mjs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {compileScript} from "../game/engine/cards/index.mjs";
import {validateScript} from "../game/engine/script/schema.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {secretsFor, leaksIn} from "../tools/fuzz-live.mjs";
import {offerDetails} from "../game/room/room.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const GANDALF = "Gandalf, Goblins' Bane // Flameshape";
const at = (seat, zone, ...cards) => ({seat, zone, cards});
const bolt = (name, types = ["Instant"]) => ({types, manaCost: "{R}", colors: ["R"], spell: {id: "s0", text: `${name} deals 2 damage to target player.`, targets: [{what: "player"}],
  effects: [{effect: "dealDamage", amount: 2, who: {target: 0}}]}});
const FIX = {
  "Secret Bolt": bolt("Secret Bolt"),
  "Secret Slow Bolt": bolt("Secret Slow Bolt", ["Sorcery"]),
  "Secret Trinket": {types: ["Artifact"], manaCost: "{1}", colors: []},
  "Secret Ogre": {types: ["Creature"], subtypes: ["Ogre"], manaCost: "{R}", colors: ["R"], power: 3, toughness: 3},
  "Hidden Grove": {types: ["Land"], abilities: [{id: "t-g", kind: "mana", tapSelf: true, produces: {G: 1}}]},
  Apprentice: {types: ["Creature"], subtypes: ["Human", "Wizard"], manaCost: "{U}", colors: ["U"], power: 1, toughness: 1},
};
const play = (setup, steps = [], more = {}) => runScenario({name: more.name ?? "face-down play", setup, steps, ...more}, index.definition, FIX);
const FLAME = [{tap: "Mountain"}, {tap: "Mountain"}, {cast: "Flameshape"}, {resolve: true}];
const facedown = (s) => s.zones.exile.filter((id) => s.objects[id].faceDown === true);
const real = (s, id) => s.objects[id].faceDownCard.card;
const offers = (s, seat, kind, card) => legalActions(s, seat).filter((a) => a.kind === kind && a.label === card);
const everyString = (v, out = []) => {
  if (typeof v === "string") out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => everyString(x, out));
  else if (v && typeof v === "object") Object.values(v).forEach((x) => everyString(x, out));
  return out;
};
const mentions = (v, name) => everyString(v).some((text) => text.includes(name));
const SECRETS = ["Secret Bolt", "Hidden Grove"];

/* ---- the exile and the permission ---- */
{
  const {state: s, events} = play([at(0, "battlefield", "Mountain", "Mountain"), at(0, "hand", GANDALF)], FLAME, {library: ["Secret Bolt", "Hidden Grove"]});
  const down = facedown(s);
  eq(down.map((id) => [real(s, id), s.objects[id].card, s.objects[id].types, s.objects[id].manaCost, s.objects[id].lookers]),
    [["Secret Bolt", null, [], null, [0]], ["Hidden Grove", null, [], null, [0]]],
    "Flameshape: the top two exiled face down, no characteristics there (CR 406.3a), Rob a looker -- he looked at them first (CR 406.3)");
  const moves = events.filter((e) => e.kind === "GameEventCardChangeZone" && e.data.fields.to.zoneType === "Exile" && e.data.fields.from.zoneType === "Library");
  eq(moves.map((e) => [e.data.fields.card.name, e.data.fields.card.faceDown]), [[null, true], [null, true]], "the moves every player's history reads name nothing");
  const permission = s.effects.filter((e) => e.rule === "may-play" && !e.id.startsWith("adventure:"));
  eq(permission.map((e) => [e.player, e.until, e.affects.ids, e.onlyIf]), [[0, "ever", down, {present: {what: "permanent", controller: "you", subtypes: ["Wizard"]}}]],
    "and a permission for Rob to play them, for as long as they remain exiled, with its condition kept to be asked later");
  /* What each seat may see (projection.mjs): Rob the cards he looked at; Maya and a spectator, two face-down cards. */
  const rob = projectFor(s, 0).players[0].zones.Exile.cards.filter((c) => c.faceDown);
  eq(rob.map((c) => [c.name, c.faceDownName]), [[null, "Secret Bolt"], [null, "Hidden Grove"]], "Rob's view: each face down, and what it is (faceDownName)");
  for (const seat of [1, null]) {
    const view = projectFor(s, seat);
    eq([SECRETS.filter((n) => mentions(view, n)), view.players[0].zones.Exile.cards.filter((c) => c.faceDown).map((c) => [c.faceDownName ?? null, c.types, c.power])],
      [[], [[null, [], null], [null, [], null]]], `${seat === null ? "a spectator" : "Maya"} is shown two face-down cards and nothing of what they are`);
  }
  /* G1's leak judge (tools/fuzz-live.mjs), which reads the state's own facts: secret from Maya, not from Rob. */
  eq([SECRETS.filter((n) => secretsFor(s, 1).has(n)), leaksIn(projectFor(s, 1), secretsFor(s, 1))], [SECRETS, []], "the leak judge: both are Maya's secrets, and her view leaks neither");
  eq(SECRETS.filter((n) => secretsFor(s, 0).has(n)), [], "and neither is Rob's");
}

/* ---- the condition, coming and going ---- */
const WIZARD = (library = ["Secret Bolt", "Hidden Grove"], more = []) => play([at(0, "battlefield", "Apprentice", "Mountain", "Mountain", "Mountain", "Mountain"), at(0, "hand", GANDALF)],
  [...FLAME, ...more], {library}).state;
{
  const none = play([at(0, "battlefield", "Mountain", "Mountain", "Mountain"), at(0, "hand", GANDALF)], [...FLAME, {tap: "Mountain"}], {library: ["Secret Bolt", "Hidden Grove"]}).state;
  eq([offers(none, 0, "cast", "Secret Bolt").length, offers(none, 0, "play-land", "Hidden Grove").length], [0, 0], "no Wizard: {R} in the pool and a land drop left, and neither is offered");
  const s = WIZARD(undefined, [{tap: "Mountain"}]);
  eq([offers(s, 0, "cast", "Secret Bolt").map((a) => [a.from, a.payment.mana.R, a.targets[0].id]), offers(s, 0, "play-land", "Hidden Grove").map((a) => a.from)],
    [[["exile", 1, 0], ["exile", 1, 1]], ["exile"]], "an Apprentice (a Wizard): the Bolt offered from exile for its own {R}, at either player; the Grove as a land");
  moveOne(s, s.zones.battlefield.find((id) => s.objects[id].card === "Apprentice"), "graveyard", []);
  eq([offers(s, 0, "cast", "Secret Bolt").length, offers(s, 0, "play-land", "Hidden Grove").length], [0, 0], "the Apprentice gone: neither offered -- the condition asked again, not once as Flameshape resolved");
}

/* ---- asking changes nothing; the real cost and timing ---- */
{
  const s = WIZARD(undefined, [{tap: "Mountain"}]);
  const before = hashState(s), objects = JSON.stringify(facedown(s).map((id) => s.objects[id]));
  legalActions(s, 0);
  nothingToDo(s, 0);
  eq([hashState(s), JSON.stringify(facedown(s).map((id) => s.objects[id]))], [before, objects], "weighed face up for the offers, and face down again after, key for key: asking changes nothing");
  const broke = WIZARD();
  eq(offers(broke, 0, "cast", "Secret Bolt").length, 0, "nothing in the pool: the Bolt is not offered (its {R} is paid, CR 601.2g-h)");
  const theirs = WIZARD(undefined, [{to: {turn: 2, phase: "MAIN1"}}, {pass: 1}, {tap: "Mountain"}]);
  eq([theirs.priorityPlayer, offers(theirs, 0, "cast", "Secret Bolt").length, offers(theirs, 0, "play-land", "Hidden Grove").length], [0, 2, 0],
    "on Maya's turn, Rob holding priority with {R}: the Bolt, an instant, offered; the Grove not (CR 305.1, 305.3)");
  const slow = WIZARD(["Secret Slow Bolt", "Secret Ogre"], [{to: {turn: 2, phase: "MAIN1"}}, {pass: 1}, {tap: "Mountain"}]);
  eq([offers(slow, 0, "cast", "Secret Slow Bolt").length, offers(slow, 0, "cast", "Secret Ogre").length], [0, 0], "and a sorcery and a creature at their own speed: not then (CR 307.1)");
}

/* ---- played: revealed to every player ---- */
{
  const s = WIZARD(undefined, [{tap: "Mountain"}]);
  const card = facedown(s).find((id) => real(s, id) === "Secret Bolt");
  const events = applyAction(s, 0, offers(s, 0, "cast", "Secret Bolt").find((a) => a.targets[0].id === 1));
  const spell = s.objects[s.stack[0].objectId];
  eq([s.objects[card], spell.card, spell.faceDown === true, spell.types, s.stack[0].name], [undefined, "Secret Bolt", false, ["Instant"], "Secret Bolt"],
    "cast: turned face up as it was announced, on the stack as the card it is, a new object (CR 400.7)");
  eq([projectFor(s, 1).stack[0].name, events.find((e) => e.kind === "GameEventSpellAbilityCast")?.data.fields.card.name], ["Secret Bolt", "Secret Bolt"],
    "and revealed: Maya's view of the stack and the cast event name it");
  eq([mentions(projectFor(s, 1), "Hidden Grove"), secretsFor(s, 1).has("Secret Bolt")], [false, false], "the Grove still hidden from Maya; the Bolt no longer a secret");
  const land = WIZARD();
  const grove = facedown(land).find((id) => real(land, id) === "Hidden Grove");
  const played = applyAction(land, 0, offers(land, 0, "play-land", "Hidden Grove")[0]);
  const arrived = land.zones.battlefield.find((id) => land.objects[id].card === "Hidden Grove");
  eq([land.objects[grove], arrived !== undefined, land.players[0].landsPlayed, played.find((e) => e.kind === "GameEventLandPlayed")?.data.fields.land.name],
    [undefined, true, 1, "Hidden Grove"], "the Grove played from exile: on the battlefield as the land it is, Rob's land for the turn, named as it is played");
}

/* ---- the table says the offer as the card it is ---- */
{
  const s = WIZARD(["Abrade", "Hidden Grove"], [{tap: "Mountain"}, {tap: "Mountain"}]);
  const offered = offers(s, 0, "cast", "Abrade");
  eq([offered.length, offerDetails(s, 0, offered)], [1, ["Abrade deals 3 damage to target creature. · → Apprentice"]],
    "Abrade face down, {1}{R} in the pool: its creature mode at the Apprentice, the table's words its mode's (room.mjs, offerDetails) -- not \"mode 1\"");
  const t = play([at(0, "battlefield", "Apprentice", "Swamp", "Mountain", "Mountain"), at(0, "hand", GANDALF)], FLAME, {library: ["Snuff Out", "Hidden Grove"]}).state;
  const instead = offers(t, 0, "cast", "Snuff Out");
  eq([instead.map((a) => a.alternative), offerDetails(t, 0, instead)], [[0], ["→ Apprentice · instead of its mana cost, paying 4 life"]],
    "Snuff Out face down, a Swamp out: for its alternative cost, 4 life (CR 118.9), and the table says so -- not \"without paying its mana cost\"");
}

/* ---- a cast that stops to ask is face down again while it asks ---- */
{
  const s = play([at(0, "battlefield", "Apprentice", "Mountain", "Mountain", "Mountain", "Forest"), at(0, "hand", GANDALF)], [...FLAME, {tap: "Mountain"}, {tap: "Forest"}],
    {library: ["Secret Trinket", "Hidden Grove"]}).state;
  const card = facedown(s).find((id) => real(s, id) === "Secret Trinket");
  const offer = offers(s, 0, "cast", "Secret Trinket");
  eq(offer.map((a) => a.payWays), [true], "{R}{G} in the pool for a {1} artifact: one offer, which mana asked once it is taken (X8b)");
  applyAction(s, 0, offer[0]);
  eq([s.awaiting?.kind, s.objects[card].faceDown, s.objects[card].card, mentions(projectFor(s, 1), "Secret Trinket")], ["choose-cost", true, null, false],
    "asked which mana: the card back in exile face down meanwhile, nothing of it in Maya's view");
  const choice = awaitingChoice(s);
  eq([choice.title, choice.options.length], ["Secret Trinket: which mana pays for it", 2], "the question, Rob's alone, weighs it as the card it is");
  resolveAwaiting(s, [0]);
  eq([s.objects[card], s.stack.map((e) => e.name)], [undefined, ["Secret Trinket"]], "answered: cast, on the stack as itself");
}

/* ---- the permission ends as the card leaves exile ---- */
{
  const s = WIZARD(undefined, [{tap: "Mountain"}]);
  const card = facedown(s).find((id) => real(s, id) === "Secret Bolt");
  const away = moveOne(s, card, "graveyard", []);
  eq([s.objects[away].card, offers(s, 0, "cast", "Secret Bolt").length], ["Secret Bolt", 0], "put into the graveyard, it is revealed and a new object: not offered from there");
  moveOne(s, away, "exile", [], {faceDown: true, lookers: [0]});
  eq(offers(s, 0, "cast", "Secret Bolt").length, 0, "nor exiled face down again: the permission named the object that left (CR 400.7)");
}

/* ---- only a player who may look at it is offered it ---- */
{
  const s = play([at(0, "battlefield", "Mountain", "Mountain"), at(0, "hand", GANDALF), at(1, "battlefield", "Apprentice", "Mountain")],
    [...FLAME, {to: {turn: 2, phase: "MAIN1"}}, {tap: "Mountain", seat: 1}], {library: ["Secret Bolt", "Hidden Grove"]}).state;
  const card = facedown(s).find((id) => s.objects[id].owner === 0 && real(s, id) === "Secret Bolt");
  s.effects.push({id: "maya-may", rule: "may-play", affects: {ids: [card]}, player: 1, until: "ever", madeOnTurn: s.turn, sourceController: 1});
  const mine = (st) => legalActions(st, 1).filter((a) => a.kind === "cast" && a.objectId === card);
  /* (Maya drew a Secret Bolt of her own: the libraries begin alike.) */
  eq([s.priorityPlayer, mine(s).length, legalActions(s, 1).filter((a) => mentions(a, "Secret Bolt")).every((a) => s.objects[a.objectId]?.owner === 1)], [1, 0, true],
    "a permission for Maya to play Rob's face-down card, which she may not look at: not offered, and none of her offers names it (CR 406.3b)");
  s.objects[card].lookers = [0, 1];
  eq(mine(s).length, 2, "allowed to look at it, she is offered it (at either player)");
}

/* ---- nothing to do? ---- */
{
  const s = play([at(0, "battlefield", "Apprentice", "Mountain", "Mountain", "Mountain"), at(0, "hand", GANDALF)], FLAME, {library: ["Secret Bolt", "Secret Ogre"]}).state;
  eq([s.priorityPlayer, s.stack.length, legalActions(s, 0).filter((a) => !["pass", "activate-mana"].includes(a.kind)).length, nothingToDo(s, 0)], [0, 0, 0, false],
    "an untapped Mountain and a face-down Bolt Rob may cast: something to do, though nothing is offered until he taps it");
  moveOne(s, s.zones.battlefield.find((id) => s.objects[id].card === "Apprentice"), "graveyard", []);
  eq(nothingToDo(s, 0), true, "and with no Wizard, nothing");
}

/* ---- an adventurer card, kept whole face down ---- */
{
  const s = WIZARD(["Glóin the Mighty // Easy Pickings", "Hidden Grove"]);
  const card = facedown(s).find((id) => real(s, id) === "Glóin the Mighty");
  eq([Boolean(s.objects[card].faceDownCard.adventurer), s.objects[card].adventurer], [true, undefined],
    "an adventurer card exiled face down: its two sets of characteristics kept with the card, none on the face-down object");
  const m = play([at(0, "battlefield", "Mountain")], [], {library: ["Glóin the Mighty // Easy Pickings"]}).state;
  runEffect(m, {effect: "manifest", who: "you"}, {controller: 0, source: null});
  const manifested = m.zones.battlefield.find((id) => m.objects[id].faceDown === true);
  const gone = moveOne(m, manifested, "graveyard", []);
  eq([m.objects[gone].card, m.objects[gone].adventurer?.adventure?.card], ["Glóin the Mighty", "Easy Pickings"], "and one manifested leaves the battlefield as the card it is, Adventure and all (CR 708.9)");
}

/* ---- a face-down permanent's question is no play of a card ---- */
{
  const s = play([at(0, "battlefield", "Mountain")], [{tap: "Mountain"}], {library: ["Secret Ogre"]}).state;
  runEffect(s, {effect: "manifest", who: "you"}, {controller: 0, source: null});
  const id = s.zones.battlefield.find((x) => s.objects[x].faceDown === true);
  (s.effects ??= []).push({id: "grant", layer: 6, affects: {ids: [id]}, until: null, sourceController: 0, apply: {addAbilities: [{id: "g0", kind: "activated",
    text: "{1}: Up to two target creatures each get +1/+1 until end of turn.", cost: [{atom: "mana", cost: "{1}"}],
    targets: [{what: "permanent", types: ["Creature"], count: {max: 2}}], effects: [{effect: "pump", targets: {target: 0}, power: 1, toughness: 1}]}]}});
  applyAction(s, 0, legalActions(s, 0).find((a) => a.kind === "activate" && a.objectId === id));
  eq([s.awaiting?.kind, mentions(awaitingChoice(s), "Secret Ogre"), s.objects[id].faceDown], ["choose-targets", false, true],
    "a manifested Ogre given an ability with counted targets: asked which, it stays face down, its question naming nothing (withFaceUp is for exile alone)");
}

/* ---- moveZone's face-down exile, looked at or not ---- */
{
  const s = play([at(0, "battlefield", "Mountain")], [], {library: ["Secret Bolt", "Hidden Grove"]}).state;
  runEffect(s, {effect: "moveZone", fromTop: 1, to: "exile", faceDown: true}, {controller: 0, source: null});
  const [blind] = facedown(s);
  eq([s.objects[blind].lookers, projectFor(s, 0).players[0].zones.Exile.cards[0].faceDownName], [[], undefined], "\"exile the top card face down\", not looked at: nobody may look, Rob included");
  runEffect(s, {effect: "moveZone", fromTop: 1, to: "exile", faceDown: true, look: true}, {controller: 0, source: null});
  const looked = facedown(s).find((id) => id !== blind);
  eq([s.objects[looked].lookers, real(s, looked)], [[0], "Hidden Grove"], "looked at first: its controller may go on looking (CR 406.3)");
}

/* ---- the card's own scenarios, and what the runner's new expectations refuse ---- */
{
  const file = JSON.parse(readFileSync(new URL("../game/engine/cards/g/gandalf-goblins-bane-flameshape.scenarios.json", import.meta.url), "utf8"));
  for (const scenario of file.scenarios) ok(runScenario(scenario, index.definition, file.fixtures).passed.length > 0, `the scenario passes: ${scenario.name}`);
  const flame = file.scenarios.find((s) => s.name.startsWith("Flameshape:"));
  const wrong = (expect) => { try { runScenario({...flame, expect}, index.definition, file.fixtures); return null; } catch (error) { return error.message; } };
  ok(/face-down cards of Rob.s exile are/.test(wrong([{seat: 0, zone: "exile", faceDown: [null, null]}]) ?? ""), "the runner refuses a face-down card Rob may look at said to be unseen");
  ok(/face-down cards of Rob.s exile as Maya sees it are/.test(wrong([{seat: 1, of: 0, zone: "exile", faceDown: ["Shock", "Mountain"]}]) ?? ""), "and one Maya may not look at said to be seen");
  ok(/Rob.s exile as Maya sees it is/.test(wrong([{seat: 1, of: 0, zone: "exile", cards: []}]) ?? ""), "and Rob's exile as Maya sees it read wrong");
}

/* ---- the compiler and the schema ---- */
{
  const script = (effects) => ({schema: "CrankCardScript@1", identity: {name: "Test", oracleId: "00000000-0000-4000-8000-000000000000", types: ["Sorcery"], manaCost: "{R}", colors: ["R"]},
    oracleText: "Exile the top card of your library face down. You may play it.", source: "hand",
    abilities: [{kind: "spell", text: "Exile the top card of your library face down. You may play it.", targets: [], effects}]});
  const exile = {effect: "moveZone", fromTop: 1, to: "exile", faceDown: true, look: true, remember: true};
  const may = {effect: "mayPlay", targets: "remembered", zone: "exile", until: "ever", onlyIf: {present: {what: "permanent", controller: "you", subtypes: ["Wizard"]}}};
  eq(compileScript(script([exile, may])).problems, [], "Flameshape's form compiles");
  ok(compileScript(script([{...exile, to: "battlefield"}, may])).problems.some((p) => p.startsWith("moveZone: faceDown")), "face down onto the battlefield is refused: that is manifest's");
  ok(compileScript(script([{...exile, faceDown: undefined}, may])).problems.some((p) => p.startsWith("moveZone: look")), "and a look without the face-down exile");
  ok(compileScript(script([exile, {...may, targets: undefined}])).problems.some((p) => p.startsWith("mayPlay: onlyIf")), "and a condition on a permission naming no cards");
  ok(validateScript(script([exile, {...may, onlyIf: {controls: "Wizard"}}])).errors.some((e) => e.path.endsWith(".onlyIf")), "and a condition with a key conditions do not have");
  ok(index.resolve(GANDALF)?.playable === true, "Gandalf, Goblins' Bane // Flameshape is defined and playable");
}

console.log(`engine-face-down-play: ${checks} checks passed -- a card exiled face down played as the card it is by the one player who may look at it, while its condition holds and it remains exiled; revealed as it is played, hidden from every other seat until then.`);
