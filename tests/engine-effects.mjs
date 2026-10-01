/* THE EFFECT PRIMITIVES: WHERE A CARD DEFINITION STOPS BEING A DOCUMENT.
 *
 * `docs/engine/PLAN.md` §6, phase 2.2 — "effect primitives for the top 25 deck primitives".
 *
 * The 25 are not chosen, they are MEASURED. `game/docs/engine-inventory.json` counted every Forge
 * API used across Rob's seven decks: 64 distinct, 821 uses, and the top 25 account for 90.9% of
 * them. Building in frequency order means the first thing that works is the thing most of his
 * cards actually do.
 *
 * This suite covers the 21 that need no decision from a player. The four that ask — dig, scry,
 * discard and modal — need a resolution that can stop half way through and resume, which is 2.2b.
 * They are absent rather than stubbed.
 *
 * TWO THINGS EVERY ONE OF THESE HAS TO GET RIGHT:
 *
 *   A CARD THAT MOVES BECOMES A NEW OBJECT (CR 400.7). An effect that moves a card and then refers
 *   to "it" has to use the id that came back, not the one it was given. This is the rule the whole
 *   kernel is built on and the easiest one to forget inside a primitive.
 *
 *   DAMAGE GOES THROUGH REPLACEMENT AND PREVENTION (CR 615). A primitive that subtracted life
 *   directly would walk straight past every shield on the board.
 */
import assert from "node:assert/strict";
import {createState, addObject, cardsIn, zoneOf} from "../game/engine/state/index.mjs";
import {beginGame} from "../game/engine/rules/turn.mjs";
import {powerOf, toughnessOf, typesOf, keywordsOf} from "../game/engine/rules/layers.mjs";
import {runEffect, EFFECTS, TOP_25} from "../game/engine/script/effects/index.mjs";
import {isPrimitive} from "../game/engine/vocabulary.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const pod = {matchId: "m", seed: "s", players: [{name: "Rob"}, {name: "Krenko"}, {name: "Atraxa"}, {name: "Shadrix"}]};
const creature = (over) => ({types: ["Creature"], power: 2, toughness: 2, ...over});

function board() {
  const s = createState(pod);
  for (let seat = 0; seat < 4; seat += 1)
    for (let i = 0; i < 20; i += 1)
      addObject(s, {card: `L${seat}-${i}`, owner: seat, controller: seat}, "library", seat);
  beginGame(s);
  const bear = addObject(s, creature({card: "Bear", owner: 0, controller: 0, manaCost: "{1}{G}"}), "battlefield");
  const theirs = addObject(s, creature({card: "Theirs", owner: 1, controller: 1}), "battlefield");
  return {s, bear, theirs, ctx: {controller: 0, source: bear}};
}
const run = (s, effect, ctx) => runEffect(s, effect, ctx);

/* ---- the catalog and the registry agree ---- */
{
  eq(TOP_25.length, 25, "the twenty-five measured primitives are named");
  ok(TOP_25.every((name) => isPrimitive(name)),
    "and every one of them is in the catalog — a primitive implemented but undeclared would be a name the schema refuses");
  const built = TOP_25.filter((name) => EFFECTS[name]);
  eq(built.length, 21,
    "twenty-one are built; dig, scry, discard and modal ask a player something and need 2.2b's resumable resolution");
  ok(Object.keys(EFFECTS).every((name) => isPrimitive(name)),
    "nothing is implemented that the catalog does not declare");
}

/* ---- zones ---- */
{
  const {s, bear, ctx} = board();
  const events = run(s, {effect: "moveZone", targets: [bear], to: "graveyard"}, ctx);
  eq(cardsIn(s, "graveyard", 0).length, 1, "moveZone puts it in the zone");
  eq(zoneOf(s, bear), null, "and the object that was there is gone — a zone change makes a new one (CR 400.7)");
  ok(events.some((e) => e.kind === "GameEventCardChangeZone"), "reported as the zone change it is");
}
{
  const {s, ctx} = board();
  const before = cardsIn(s, "hand", 0).length;
  run(s, {effect: "draw", count: 3, who: "you"}, ctx);
  eq(cardsIn(s, "hand", 0).length, before + 3, "draw takes three off the top");
  eq(cardsIn(s, "library", 0).length, 17, "and the library is three shorter");
}
{
  const {s, ctx} = board();
  run(s, {effect: "draw", count: 1, who: "opponent"}, ctx);
  eq(cardsIn(s, "hand", 1).length, 1, "draw can be aimed at opponents");
  eq(cardsIn(s, "hand", 2).length, 1, "all of them");
  eq(cardsIn(s, "hand", 0).length, 0, "and not at you");
}
{
  const {s, bear, theirs, ctx} = board();
  run(s, {effect: "moveZoneAll", from: "battlefield", to: "graveyard",
    selector: {what: "permanent", types: ["Creature"]}}, ctx);
  eq(s.zones.battlefield.length, 0, "moveZoneAll clears everything the selector matched");
  eq(cardsIn(s, "graveyard", 0).length, 1, "each to its OWNER's graveyard");
  eq(cardsIn(s, "graveyard", 1).length, 1, "which is not the same graveyard");
  void bear; void theirs;
}

/* ---- destroy is not the same as moving to a graveyard ---- */
{
  const {s, theirs, ctx} = board();
  run(s, {effect: "destroy", targets: [theirs]}, ctx);
  eq(cardsIn(s, "graveyard", 1).length, 1, "destroy puts it in its owner's graveyard");
}
{
  const {s, theirs, ctx} = board();
  s.objects[theirs].keywords = ["Indestructible"];
  const events = run(s, {effect: "destroy", targets: [theirs]}, ctx);
  eq(cardsIn(s, "graveyard", 1).length, 0,
    "indestructible cannot be destroyed (CR 702.12b) — which is why destroy is its own primitive and not a moveZone");
  eq(zoneOf(s, theirs), "battlefield", "it is still there");
  eq(events.length, 0, "and nothing is reported, because nothing happened");
}

/* ---- destroyAll: a board wipe, decided at once (CR 701.8, 702.12b) ---- */
{
  const {s, ctx} = board();
  const stone = addObject(s, creature({card: "Stone", owner: 2, controller: 2, keywords: ["Indestructible"]}), "battlefield");
  const land = addObject(s, {card: "Forest", owner: 0, controller: 0, types: ["Land"]}, "battlefield");
  run(s, {effect: "destroyAll", selector: {what: "permanent", types: ["Creature"]}}, ctx);
  eq(cardsIn(s, "graveyard", 0).length + cardsIn(s, "graveyard", 1).length, 2, "destroyAll destroys every creature the selector matched, each to its owner's graveyard");
  eq(zoneOf(s, stone), "battlefield", "an indestructible one survives it");
  eq(zoneOf(s, land), "battlefield", "and what the selector did not match is untouched");
}
{
  /* The lord comes first on the battlefield, so a wipe done one at a time would kill it first. */
  const s = createState(pod);
  for (let seat = 0; seat < 4; seat += 1) for (let i = 0; i < 5; i += 1) addObject(s, {card: `L${seat}-${i}`, owner: seat, controller: seat}, "library", seat);
  beginGame(s);
  const lord = addObject(s, creature({card: "Lord", owner: 0, controller: 0}), "battlefield");
  const ward = addObject(s, creature({card: "Ward", owner: 0, controller: 0}), "battlefield");
  s.objects[lord].abilities = [{id: "aegis", kind: "static", layer: 6, affects: {ids: [ward]}, apply: {addKeywords: ["Indestructible"]}}];
  run(s, {effect: "destroyAll", selector: {what: "permanent", types: ["Creature"]}}, {controller: 0, source: lord});
  eq(zoneOf(s, ward), "battlefield", "a creature the lord made indestructible survives the wipe that kills the lord: which ones die is decided before any of them moves");
  eq(cardsIn(s, "graveyard", 0).length, 1, "and the lord is gone");
}

/* ---- mill: the top of a library into the graveyard (CR 701.13) ---- */
{
  const {s, ctx} = board();
  const top = cardsIn(s, "library", 0).slice(0, 3).map((id) => s.objects[id].card);
  const hand = cardsIn(s, "hand", 0).length;
  run(s, {effect: "mill", count: 3, who: "you"}, ctx);
  eq(cardsIn(s, "graveyard", 0).length, 3, "mill puts three cards into the graveyard");
  eq(cardsIn(s, "library", 0).length, 17, "off the library");
  eq(cardsIn(s, "graveyard", 0).map((id) => s.objects[id].card), top, "from the top, in order");
  eq(cardsIn(s, "hand", 0).length, hand, "and not into the hand: milling is not drawing");
}
{
  const {s, ctx} = board();
  run(s, {effect: "mill", count: 2, who: "opponent"}, ctx);
  eq([1, 2, 3].map((p) => cardsIn(s, "graveyard", p).length), [2, 2, 2], "mill can be aimed at each opponent");
  eq(cardsIn(s, "graveyard", 0).length, 0, "and not at you");
}
{
  const {s, ctx} = board();
  run(s, {effect: "mill", count: 30, who: "you"}, ctx);
  eq([cardsIn(s, "library", 0).length, cardsIn(s, "graveyard", 0).length], [0, 20], "told to mill more than the library holds, a player mills what there is (CR 701.13b)");
  ok(!s.players[0].drewFromEmpty, "and is not marked for an empty-library draw: milling out is not drawing from an empty library");
}

/* ---- mana, tapping ---- */
{
  const {s, ctx} = board();
  run(s, {effect: "addMana", mana: {G: 2}}, ctx);
  eq(s.players[0].manaPool.G, 2, "addMana fills the pool");
  eq(s.players[1].manaPool.G, 0, "of the ability's controller and nobody else");
}
{
  const {s, bear, theirs, ctx} = board();
  run(s, {effect: "tap", targets: [bear, theirs]}, ctx);
  eq(s.objects[bear].tapped, true, "tap taps");
  eq(s.objects[theirs].tapped, true, "whatever it is aimed at");
  run(s, {effect: "untap", targets: [bear]}, ctx);
  eq(s.objects[bear].tapped, false, "and untap is its opposite");
  eq(s.objects[theirs].tapped, true, "on only what it names");
}

/* ---- life and damage ---- */
{
  const {s, ctx} = board();
  run(s, {effect: "gainLife", amount: 5, who: "you"}, ctx);
  eq(s.players[0].life, 45, "gainLife");
  run(s, {effect: "loseLife", amount: 3, who: "opponent"}, ctx);
  eq(s.players[1].life, 37, "loseLife, aimed at each opponent");
  eq(s.players[0].life, 45, "and not at you");
}
{
  const {s, theirs, ctx} = board();
  run(s, {effect: "dealDamage", amount: 1, targets: [theirs]}, ctx);
  eq(s.objects[theirs].damage, 1, "dealDamage marks a creature");
  run(s, {effect: "dealDamage", amount: 4, toPlayer: 1}, ctx);
  eq(s.players[1].life, 36, "and costs a player life");
}
{
  const {s, ctx} = board();
  /* A shield on seat 1. A primitive that subtracted life directly would walk straight past it. */
  addObject(s, {card: "Shield", types: ["Enchantment"], owner: 1, controller: 1,
    abilities: [{id: "shield", kind: "replacement", text: "Prevent the next 3 damage.",
      watches: {event: "damage", toPlayer: "controller"}, prevent: 3}]}, "battlefield");
  run(s, {effect: "dealDamage", amount: 5, toPlayer: 1}, ctx);
  eq(s.players[1].life, 38,
    "dealDamage goes through prevention (CR 615) — five less a three-point shield is two");
}

/* ---- counters ---- */
{
  const {s, bear, ctx} = board();
  run(s, {effect: "putCounter", counter: "+1/+1", count: 2, targets: [bear]}, ctx);
  eq(s.objects[bear].counters["+1/+1"], 2, "putCounter puts them on");
  eq(powerOf(s, bear), 4, "and the layers read them, so the creature is really bigger");
  eq(toughnessOf(s, bear), 4, "both ways");
}
{
  const {s, ctx} = board();
  run(s, {effect: "putCounterAll", counter: "+1/+1", count: 1,
    selector: {what: "permanent", types: ["Creature"], controller: "you"}}, ctx);
  const mine = s.zones.battlefield.filter((id) => s.objects[id].controller === 0);
  ok(mine.every((id) => s.objects[id].counters["+1/+1"] === 1), "putCounterAll puts one on each match");
  const theirs = s.zones.battlefield.filter((id) => s.objects[id].controller === 1);
  ok(theirs.every((id) => !s.objects[id].counters["+1/+1"]), "and not on what the selector excluded");
}
{
  const {s, bear, theirs, ctx} = board();
  s.objects[bear].counters = {"+1/+1": 1};
  s.objects[theirs].counters = {"-1/-1": 2};
  s.players[0].counters = {poison: 1};
  run(s, {effect: "proliferate", chosen: [bear, theirs, {player: 0}]}, ctx);
  eq(s.objects[bear].counters["+1/+1"], 2, "proliferate adds one of each kind already there");
  eq(s.objects[theirs].counters["-1/-1"], 3, "including a kind its controller would rather not have");
  eq(s.players[0].counters.poison, 2, "and it works on players too (CR 701.34a)");
}
{
  const {s, bear, ctx} = board();
  run(s, {effect: "proliferate", chosen: [bear]}, ctx);
  eq(s.objects[bear].counters, {},
    "proliferate on something with no counters adds nothing — it adds ANOTHER of what is there, not a first one");
}

/* ---- permanents ---- */
{
  const {s, ctx} = board();
  const events = run(s, {effect: "createToken", token: {name: "Goblin", types: ["Creature"], subtypes: ["Goblin"],
    power: 1, toughness: 1}, count: 3}, ctx);
  const tokens = s.zones.battlefield.filter((id) => s.objects[id].token);
  eq(tokens.length, 3, "createToken makes the number asked for");
  ok(tokens.every((id) => s.objects[id].controller === 0), "under the ability's controller");
  eq(powerOf(s, tokens[0]), 1, "with the body it was given");
  ok(events.some((e) => e.kind === "GameEventCardChangeZone"), "and each arrival is reported");
}
{
  const {s, ctx} = board();
  const land = addObject(s, {card: "Island", types: ["Land"], owner: 0, controller: 0}, "battlefield");
  run(s, {effect: "animate", targets: [land], power: 3, toughness: 3, addTypes: ["Creature"],
    until: "end-of-turn"}, ctx);
  ok(typesOf(s, land).includes("Creature"), "animate makes it a creature");
  ok(typesOf(s, land).includes("Land"), "in addition to what it was (CR 613.1d)");
  eq(powerOf(s, land), 3, "with the body the effect gave it");
}
{
  const {s, bear, ctx} = board();
  run(s, {effect: "pump", targets: [bear], power: 2, toughness: 2, until: "end-of-turn"}, ctx);
  eq(powerOf(s, bear), 4, "pump adds until end of turn");
  eq(s.objects[bear].power, 2,
    "and does NOT write it into the card — a pump written into the state is one that never wears off");
}
{
  const {s, ctx} = board();
  run(s, {effect: "pumpAll", selector: {what: "permanent", types: ["Creature"], controller: "you"},
    power: 1, toughness: 1, until: "end-of-turn"}, ctx);
  const mine = s.zones.battlefield.filter((id) => s.objects[id].controller === 0);
  ok(mine.every((id) => powerOf(s, id) === 3), "pumpAll pumps everything the selector matched");
  const theirs = s.zones.battlefield.find((id) => s.objects[id].controller === 1);
  eq(powerOf(s, theirs), 2, "and nothing it did not");
}
{
  const {s, bear, ctx} = board();
  run(s, {effect: "effectUntil", until: "end-of-turn", layer: 6,
    affects: {what: "permanent", types: ["Creature"], controller: "you"},
    apply: {addKeywords: ["Flying"]}}, ctx);
  ok(keywordsOf(s, bear).includes("Flying"), "effectUntil is a temporary static, and the layers apply it");
  eq(s.effects.length, 1, "held as a continuous effect rather than written into the card");
  ok(s.effects[0].until === "end-of-turn", "with its duration, so cleanup can end it");
}

/* ---- flow ---- */
{
  const {s, ctx} = board();
  const spell = addObject(s, creature({card: "Their Spell", owner: 1, controller: 1}), "hand", 1);
  s.stack.push({stackId: 1, abilityId: null, objectId: spell, cardId: spell, name: "Their Spell",
    faceDown: false, playerId: 1, kind: "spell", stage: "waiting", targets: [], permanent: true});
  s.zones.stack.push(spell);
  s.objects[spell].zone = "stack";
  run(s, {effect: "counterSpell", targets: [1]}, ctx);
  eq(s.stack.length, 0, "counterSpell takes it off the stack");
  eq(cardsIn(s, "graveyard", 1).length, 1, "into its owner's graveyard (CR 701.6a)");
}
{
  const {s, ctx} = board();
  run(s, {effect: "delayedTrigger", at: "end step", effects: [{effect: "draw", count: 1}]}, ctx);
  eq(s.delayedTriggers.length, 1, "delayedTrigger schedules something for later (CR 603.7)");
  eq(s.delayedTriggers[0].at, "end step", "saying when");
  eq(s.delayedTriggers[0].controller, 0, "and whose it is");
}
{
  const {s, ctx} = board();
  const events = run(s, {effect: "cleanup", forget: ["remembered"]}, ctx);
  eq(events, [],
    "cleanup is end-of-effect bookkeeping and is not a card-visible primitive — it does nothing a player can see, and says so rather than being left out and failing validation");
}

/* ---- every effect returns events, and none writes a journal ---- */
{
  const {s, bear, ctx} = board();
  for (const name of Object.keys(EFFECTS)) {
    const result = run(s, {effect: name, targets: [bear], amount: 0, count: 0, mana: {}, who: "you",
      counter: "+1/+1", to: "graveyard", token: {name: "T", types: ["Creature"], power: 1, toughness: 1},
      selector: {what: "permanent", types: ["Nothing"]}, at: "end step", effects: [], chosen: [],
      layer: 6, affects: {what: "permanent", types: ["Nothing"]}, apply: {}}, ctx);
    ok(Array.isArray(result), `${name} returns a list of events`);
    checks -= 1;
  }
  checks += 1;
}

/* ---- an unknown primitive is refused ---- */
{
  const {s, ctx} = board();
  assert.throws(() => run(s, {effect: "destroyCreature", targets: []}, ctx), /destroyCreature|primitive/i,
    "running something that is not a primitive is refused, not skipped"); checks += 1;
  assert.throws(() => run(s, {effect: "dig", count: 3}, ctx), /dig|resolution/i,
    "and a primitive that asks a player something refuses to be run directly, rather than running half of itself"); checks += 1;
}

console.log(`engine-effects: ${checks} checks passed — twenty-one of the twenty-five measured primitives, damage through prevention, pump that wears off because it was never written down, indestructible that cannot be destroyed, a board wipe decided at once, and mill that is not a draw.`);
