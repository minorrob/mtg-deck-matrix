/* THE EVENT MAPPING, DRIVEN THROUGH THE REAL FEED.
 *
 * The labels this module matches on are written by match-telemetry.mjs, so the rows here are
 * built by running engine-shaped events through summarizeEvents rather than by hand. Hand-written
 * rows would test my memory of the label; these test the label. If match-telemetry rewords
 * "Died · battlefield → graveyard" tomorrow, this suite goes red -- which is the entire point,
 * because the alternative is a game that quietly stops making a sound when a creature dies.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {summarizeEvents} from "../tools/match-telemetry.mjs";
import {soundsFor, cardIndex, isBoardWipe, WIPE_FLOOR, UNREACHABLE_FROM_THE_FEED} from "../ui/play-audio-events.mjs";

const VIEWER = 0;
let sequence = 0;
const event = (kind, fields, turn = 2) => ({kind, eventId: `event:${sequence += 1}`, data: {turn, fields}});

/* One shared cast of characters, with the type lines the probe reports (ForgeProbe.java:180). */
const CARDS = [
  {cardId: 1, name: "Shivan Dragon", typeLine: "Creature — Dragon", owner: 0, controller: 0},
  {cardId: 2, name: "Sol Ring", typeLine: "Artifact", owner: 0, controller: 0},
  {cardId: 3, name: "Forest", typeLine: "Basic Land — Forest", owner: 0, controller: 0},
  {cardId: 4, name: "Goblin", typeLine: "Creature — Goblin", owner: 1, controller: 1, token: true},
  {cardId: 5, name: "Llanowar Elves", typeLine: "Creature — Elf Druid", owner: 1, controller: 1},
  {cardId: 6, name: "Bone Spike", typeLine: "Creature — Skeleton", owner: 1, controller: 1},
  {cardId: 7, name: "Sigil of Lost", typeLine: "Enchantment — Aura", owner: 1, controller: 1},
  {cardId: 8, name: "Krenko, Mob Boss", typeLine: "Legendary Creature — Goblin Warrior", owner: 1, controller: 1, commander: true},
];
/* A state with a battlefield of the given size, so R9 can measure "most of it". */
const stateWith = (onBattlefield) => ({
  players: [{playerId: 0, zones: {Battlefield: {cards: CARDS.slice(0, onBattlefield)}, Hand: {cards: []}}},
            {playerId: 1, zones: {Battlefield: {cards: []}}}],
});
/* Every card is known to the feed so nothing is dropped as a hidden source. */
const feed = (events) => summarizeEvents(events, CARDS, VIEWER).recent;
const heard = (events, {state = stateWith(7), viewerSeatId = VIEWER} = {}) =>
  soundsFor(feed(events), new Set(), {viewerSeatId, state});

test("the card rules run on a cast and on a land, and on nothing else", () => {
  assert.deepEqual(heard([event("GameEventSpellAbilityCast",
    {sa: {host: {cardId: 1}, isSpell: true}, si: {actor: {playerId: 1}}})]), ["sfx_tribe_dragon"]);
  assert.deepEqual(heard([event("GameEventLandPlayed", {land: {cardId: 3}, player: {playerId: 0}})]), ["sfx_play_land"]);
  /* An activated ability is not a card being cast. R1 is about cards. */
  assert.deepEqual(heard([event("GameEventSpellAbilityCast",
    {sa: {host: {cardId: 2}, isSpell: false}, si: {actor: {playerId: 0}}})]), []);
});

test("combat is heard as combat, and commander damage as itself", () => {
  assert.deepEqual(heard([event("GameEventAttackersDeclared",
    {defendingPlayer: {playerId: 1, name: "Krenko"},
     attackersMap: [{key: {playerId: 1, name: "Krenko"}, value: [{cardId: 1}]}]})]), ["sfx_event_attack"]);
  assert.deepEqual(heard([event("GameEventAttackersDeclared",
    {defendingPlayer: {playerId: 1, name: "Krenko"}, attackersMap: []})]), [],
    "an empty declaration is not an attack");
  assert.deepEqual(heard([event("GameEventBlockersDeclared",
    {defendingPlayer: {playerId: 1, name: "Krenko"},
     blockers: [{key: {playerId: 1}, value: [{key: {cardId: 1}, value: [{cardId: 5}]}]}]})]), ["sfx_event_block"]);
  assert.deepEqual(heard([event("GameEventPlayerDamaged",
    {source: {cardId: 1}, target: {playerId: 0, name: "Rob"}, amount: 7, combat: true})]),
    ["sfx_event_combat_damage"]);
  /* The feed appends "· commander damage" only when the SOURCE is a commander and the damage is
     combat, so the clip that ends a game in 21 has its own sound and does not hide inside the
     ordinary combat one. */
  assert.deepEqual(heard([event("GameEventPlayerDamaged",
    {source: {cardId: 8}, target: {playerId: 0, name: "Rob"}, amount: 7, combat: true})]),
    ["sfx_event_commander_damage"]);
});

test("damage that is not combat is heard as the life it cost, which is what the pack ships", () => {
  assert.deepEqual(heard([event("GameEventPlayerDamaged",
    {source: {cardId: 2}, target: {playerId: 0, name: "Rob"}, amount: 3, combat: false})]),
    ["sfx_event_life_loss"], "the pack has no non-combat damage clip; life_loss's own row says (non-combat)");
});

test("a life total falling next to its own damage row is one hit, not two", () => {
  const rows = heard([
    event("GameEventPlayerDamaged", {source: {cardId: 1}, target: {playerId: 0, name: "Rob"}, amount: 7, combat: true}),
    event("GameEventPlayerLivesChanged", {player: {playerId: 0, name: "Rob"}, oldLives: 40, newLives: 33}),
  ]);
  assert.deepEqual(rows, ["sfx_event_combat_damage"], "the life row is the same hit being reported again");
});

test("life moving on its own is still heard, in both directions", () => {
  assert.deepEqual(heard([event("GameEventPlayerLivesChanged",
    {player: {playerId: 0, name: "Rob"}, oldLives: 40, newLives: 45})]), ["sfx_event_life_gain"]);
  assert.deepEqual(heard([event("GameEventPlayerLivesChanged",
    {player: {playerId: 0, name: "Rob"}, oldLives: 40, newLives: 38})]), ["sfx_event_life_loss"]);
  assert.deepEqual(heard([event("GameEventPlayerPoisoned",
    {receiver: {playerId: 0, name: "Rob"}, oldValue: 1, amount: 2})]), ["sfx_event_poison"]);
});

test("R10: a batch of tokens is one sound, however many arrive", () => {
  const born = () => event("GameEventCardChangeZone",
    {card: {cardId: 4}, from: {zoneType: "None"}, to: {zoneType: "Battlefield", player: {playerId: 1}}});
  assert.deepEqual(heard([born(), born(), born(), born(), born()]), ["sfx_event_create_tokens"]);
});

test("a permanent arriving announces itself only when its cast was not the moment before", () => {
  const arrive = (cardId) => event("GameEventCardChangeZone",
    {card: {cardId}, from: {zoneType: "Stack"}, to: {zoneType: "Battlefield", player: {playerId: 1}}});
  assert.deepEqual(heard([arrive(5)]), ["sfx_event_etb"], "something appearing from nowhere is an event");
  assert.deepEqual(heard([
    event("GameEventSpellAbilityCast", {sa: {host: {cardId: 5}, isSpell: true}, si: {actor: {playerId: 1}}}),
    arrive(5),
  ]), ["sfx_tribe_elf"], "its own cast already said it; R8 only adds a sound for a separate moment");
});

test("leaving play sounds like what left, and where it went", () => {
  const leave = (cardId, to) => event("GameEventCardChangeZone",
    {card: {cardId}, from: {zoneType: "Battlefield", player: {playerId: 1}}, to: {zoneType: to, player: {playerId: 1}}});
  assert.deepEqual(heard([leave(5, "Graveyard")]), ["sfx_event_dies"], "a creature dies");
  assert.deepEqual(heard([leave(7, "Graveyard")]), ["sfx_event_destroy"], "an aura is destroyed, it does not die");
  assert.deepEqual(heard([leave(5, "Exile")]), ["sfx_event_exile"]);
  assert.deepEqual(heard([event("GameEventCardChangeZone",
    {card: {cardId: 5}, from: {zoneType: "Library", player: {playerId: 1}},
     to: {zoneType: "Graveyard", player: {playerId: 1}}})]), ["sfx_event_mill"]);
});

test("R9: most of the board leaving at once is one wipe, not one sound per corpse", () => {
  /* The glossary's definition is relative -- "most or all ... at once" -- so it is measured
     against what is left rather than against a number invented here. */
  assert.equal(isBoardWipe(5, 1), true);
  assert.equal(isBoardWipe(5, 9), false, "five of fourteen is not most of the board");
  assert.equal(isBoardWipe(WIPE_FLOOR - 1, 0), false, "a small board trading is not a Wrath");

  const die = (cardId) => event("GameEventCardChangeZone",
    {card: {cardId}, from: {zoneType: "Battlefield", player: {playerId: 1}}, to: {zoneType: "Graveyard", player: {playerId: 1}}});
  assert.deepEqual(heard([die(1), die(5), die(6), die(7)], {state: stateWith(1)}), ["sfx_event_board_wipe"]);
  /* The same four deaths on a board that still has plenty left is removal, not a wipe. */
  assert.deepEqual(heard([die(1), die(5), die(6), die(7)], {state: stateWith(7)}),
    ["sfx_event_dies", "sfx_event_dies", "sfx_event_dies", "sfx_event_destroy"]);
});

test("your own draw and your own turn, and nobody else's", () => {
  const draw = (playerId) => event("GameEventCardChangeZone",
    {card: {cardId: 5}, from: {zoneType: "Library", player: {playerId}}, to: {zoneType: "Hand", player: {playerId}}});
  assert.deepEqual(heard([draw(VIEWER)]), ["sfx_event_draw"]);
  assert.deepEqual(heard([draw(1)]), [], "an opponent's draw is private and never reaches the feed");

  const untap = (playerId) => event("GameEventTurnPhase", {playerTurn: {playerId, name: "Rob"}, phase: "UNTAP"});
  assert.deepEqual(heard([untap(VIEWER)]), ["sfx_event_your_turn"]);
  assert.deepEqual(heard([untap(1)]), [], "somebody else's turn beginning is not your turn beginning");
  assert.deepEqual(heard([event("GameEventTurnPhase", {playerTurn: {playerId: VIEWER}, phase: "MAIN1"})]), [],
    "every other step is silent, or a turn would be seven chimes long");
});

test("the batch is heard in the order it happened, and only once", () => {
  const events = [
    event("GameEventLandPlayed", {land: {cardId: 3}, player: {playerId: 0}}),
    event("GameEventSpellAbilityCast", {sa: {host: {cardId: 1}, isSpell: true}, si: {actor: {playerId: 0}}}),
    event("GameEventPlayerPoisoned", {receiver: {playerId: 0, name: "Rob"}, oldValue: 0, amount: 1}),
  ];
  const rows = feed(events);
  assert.equal(rows[0].kind, "GameEventPlayerPoisoned", "the feed itself is newest first");
  const seen = new Set();
  assert.deepEqual(soundsFor(rows, seen, {viewerSeatId: VIEWER, state: stateWith(7)}),
    ["sfx_play_land", "sfx_tribe_dragon", "sfx_event_poison"], "but it is played oldest first");
  assert.deepEqual(soundsFor(rows, seen, {viewerSeatId: VIEWER, state: stateWith(7)}), [],
    "the same feed on the next poll is silent");
});

test("opening the board mid-game does not replay the whole match at you", () => {
  const rows = feed([event("GameEventPlayerPoisoned", {receiver: {playerId: 0, name: "Rob"}, oldValue: 0, amount: 1})]);
  const seen = new Set();
  assert.deepEqual(soundsFor(rows, seen, {viewerSeatId: VIEWER, state: stateWith(7), priming: true}), []);
  assert.deepEqual(soundsFor(rows, seen, {viewerSeatId: VIEWER, state: stateWith(7)}), [],
    "and priming marked them seen, so they do not arrive one poll later instead");
});

test("cardIndex finds a card in any zone of any seat", () => {
  const index = cardIndex({players: [
    {zones: {Battlefield: {cards: [{cardId: 1, typeLine: "Creature — Dragon"}]}}},
    {zones: {Graveyard: {cards: [{cardId: 9, typeLine: "Instant"}]}, Hand: {cards: []}}},
  ]});
  assert.equal(index.get(1).typeLine, "Creature — Dragon");
  assert.equal(index.get(9).typeLine, "Instant");
  assert.deepEqual(cardIndex(null).size, 0);
  assert.deepEqual(cardIndex({players: [{}]}).size, 0);
});

/* EVERY SLUG THIS CAN PRODUCE MUST EXIST, and every event clip the pack ships must either be
   reachable or be listed as knowingly unreachable. An event clip that is neither is one nobody
   will ever hear and nobody will ever look for. */
test("the mapping and the pack account for each other, both ways", () => {
  const rows = JSON.parse(readFileSync("game/ui/assets/audio/sound-index.json", "utf8")).rows;
  const shipped = new Set(rows.filter((r) => r.kind === "event").map((r) => r.slug));
  const source = readFileSync("game/ui/play-audio-events.mjs", "utf8");
  const named = new Set([...source.matchAll(/"(sfx_(?:event|ui)_\w+)"/g)].map((m) => m[1]));
  for (const slug of named) assert.ok(shipped.has(slug), `${slug} is named here but the pack does not ship it`);
  const unreachable = new Set(UNREACHABLE_FROM_THE_FEED);
  const orphans = [...shipped].filter((slug) => !named.has(slug) && !unreachable.has(slug));
  assert.deepEqual(orphans, [], `these clips can never be heard and are not declared unreachable: ${orphans.join(", ")}`);
});
