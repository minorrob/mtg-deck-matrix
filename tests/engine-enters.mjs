/* HOW A PERMANENT ENTERS: CR 614.1c AND 614.12.
 *
 * The measured blocker. `game/docs/engine-inventory.json` counts Forge's `Moved` replacement on 53
 * of the 477 cards in Rob's seven decks — the single largest construct in his collection. Half of
 * it already worked: "if it would die, exile it instead" is an ordinary zone-change replacement and
 * has been since 1.7. The other half is this — effects that change HOW a permanent arrives rather
 * than WHERE a card goes.
 *
 * THE RULE THAT MAKES THIS AWKWARD (CR 614.12): a replacement effect that modifies how a permanent
 * enters applies EVEN THOUGH THE PERMANENT IS NOT ON THE BATTLEFIELD YET. A land that enters tapped
 * says so with its own ability, and at the moment that ability has to be read the land is still a
 * card on the stack with no abilities on the battlefield to find. Every other replacement effect in
 * the engine is found by scanning the battlefield; this one cannot be.
 *
 * SELF-REPLACEMENT APPLIES FIRST (CR 614.15). A permanent's own "enters tapped" is applied before
 * anybody else's effect gets a say, and without that rule the order is a choice nobody should be
 * asked to make.
 *
 * AND IT IS ONE EVENT, NOT TWO. A permanent that enters tapped was never untapped: there is no
 * moment where it is on the battlefield untapped and then taps, so nothing that watches for
 * tapping sees anything. An engine that puts it down and then taps it is describing two events
 * where the rules have one.
 */
import assert from "node:assert/strict";
import {createState, addObject, cardsIn} from "../game/engine/state/index.mjs";
import {beginGame} from "../game/engine/rules/turn.mjs";
import {pushSpell, resolveTop} from "../game/engine/rules/stack.mjs";
import {runEffect} from "../game/engine/script/effects/index.mjs";
import {powerOf} from "../game/engine/rules/layers.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const pod = {matchId: "m", seed: "s", players: [{name: "Rob"}, {name: "Krenko"}, {name: "Atraxa"}, {name: "Shadrix"}]};
const started = () => { const s = createState(pod); beginGame(s); return s; };

/* The two shapes the compiler will emit for this family. */
const ENTERS_TAPPED = {id: "etb-tapped", kind: "replacement", text: "This land enters tapped.",
  watches: {event: "enters", who: "self"}, change: {entersTapped: true}};
const ENTERS_WITH = (counter, count) => ({id: "etb-counters", kind: "replacement",
  text: `This creature enters with ${count} ${counter} counters on it.`,
  watches: {event: "enters", who: "self"}, change: {entersWithCounters: {counter, count}}});

const onBattlefield = (s, name) => s.zones.battlefield.filter((id) => s.objects[id].card === name);

/* ---- a land that enters tapped ---- */
{
  const s = started();
  const land = addObject(s, {card: "Tapped Land", types: ["Land"], owner: 0, controller: 0,
    abilities: [ENTERS_TAPPED]}, "hand", 0);
  runEffect(s, {effect: "moveZone", targets: [land], to: "battlefield"}, {controller: 0});
  const arrived = onBattlefield(s, "Tapped Land")[0];
  eq(s.objects[arrived].tapped, true,
    "it arrives tapped — read off the card's OWN ability, which had to be found while the card was still in hand (CR 614.12)");
}
{
  const s = started();
  const land = addObject(s, {card: "Plain Land", types: ["Land"], owner: 0, controller: 0}, "hand", 0);
  runEffect(s, {effect: "moveZone", targets: [land], to: "battlefield"}, {controller: 0});
  eq(s.objects[onBattlefield(s, "Plain Land")[0]].tapped, false, "and a land with no such ability does not");
}
{
  /* ONE EVENT, NOT TWO. Nothing should see a tap happen, because none did. */
  const s = started();
  const land = addObject(s, {card: "Tapped Land", types: ["Land"], owner: 0, controller: 0,
    abilities: [ENTERS_TAPPED]}, "hand", 0);
  const events = runEffect(s, {effect: "moveZone", targets: [land], to: "battlefield"}, {controller: 0});
  ok(!events.some((e) => e.kind === "GameEventCardTapped"),
    "no tap is reported — a permanent that enters tapped was never untapped, and an engine that puts it down and then taps it describes two events where the rules have one");
  ok(events.some((e) => e.kind === "GameEventCardChangeZone"), "only the arrival");
}

/* ---- a creature that enters with counters ---- */
{
  const s = started();
  const creature = addObject(s, {card: "Hydra", types: ["Creature"], power: 0, toughness: 0,
    owner: 0, controller: 0, abilities: [ENTERS_WITH("+1/+1", 3)]}, "hand", 0);
  runEffect(s, {effect: "moveZone", targets: [creature], to: "battlefield"}, {controller: 0});
  const arrived = onBattlefield(s, "Hydra")[0];
  eq(s.objects[arrived].counters["+1/+1"], 3, "it arrives with its counters already on it");
  eq(powerOf(s, arrived), 3, "which the layers read, so it is a 3/3 the moment it is there");
}
{
  /* The counters are part of ARRIVING, so the creature is never a 0/0 on the battlefield — which
     matters, because a 0/0 would die to state-based actions before anything could put counters on
     it. That is the whole reason this is a replacement and not a trigger. */
  const s = started();
  const creature = addObject(s, {card: "Hydra", types: ["Creature"], power: 0, toughness: 0,
    owner: 0, controller: 0, abilities: [ENTERS_WITH("+1/+1", 2)]}, "hand", 0);
  const entry = pushSpell(s, creature, {controller: 0, permanent: true});
  resolveTop(s);
  const arrived = onBattlefield(s, "Hydra")[0];
  ok(arrived !== undefined, "a 0/0 that enters with counters survives resolving onto the battlefield");
  eq(powerOf(s, arrived), 2, "as a 2/2");
  void entry;
}

/* ---- somebody else's effect can modify how yours enters ---- */
{
  const s = started();
  addObject(s, {card: "Contamination", types: ["Enchantment"], owner: 1, controller: 1,
    abilities: [{id: "all-tapped", kind: "replacement", text: "Lands enter tapped.",
      watches: {event: "enters", types: ["Land"]}, change: {entersTapped: true}}]}, "battlefield");
  const land = addObject(s, {card: "Ordinary Land", types: ["Land"], owner: 0, controller: 0}, "hand", 0);
  runEffect(s, {effect: "moveZone", targets: [land], to: "battlefield"}, {controller: 0});
  eq(s.objects[onBattlefield(s, "Ordinary Land")[0]].tapped, true,
    "a permanent somebody else controls can change how your land enters, and it is found on the battlefield the ordinary way");
}
{
  const s = started();
  addObject(s, {card: "Contamination", types: ["Enchantment"], owner: 1, controller: 1,
    abilities: [{id: "all-tapped", kind: "replacement", text: "Lands enter tapped.",
      watches: {event: "enters", types: ["Land"]}, change: {entersTapped: true}}]}, "battlefield");
  const bear = addObject(s, {card: "Bear", types: ["Creature"], power: 2, toughness: 2,
    owner: 0, controller: 0}, "hand", 0);
  runEffect(s, {effect: "moveZone", targets: [bear], to: "battlefield"}, {controller: 0});
  eq(s.objects[onBattlefield(s, "Bear")[0]].tapped, false,
    "and it applies only to what it says — a creature is not a land");
}

/* ---- a token can enter tapped too ---- */
{
  const s = started();
  runEffect(s, {effect: "createToken", count: 2,
    token: {name: "Treasure", types: ["Artifact"], tapped: true}}, {controller: 0});
  const tokens = s.zones.battlefield.filter((id) => s.objects[id].token);
  eq(tokens.length, 2, "two tokens");
  ok(tokens.every((id) => s.objects[id].tapped), "both tapped, as the token said");
}

/* ---- entering a zone that is not the battlefield is untouched ---- */
{
  const s = started();
  const land = addObject(s, {card: "Tapped Land", types: ["Land"], owner: 0, controller: 0,
    abilities: [ENTERS_TAPPED]}, "battlefield");
  s.objects[land].tapped = true;
  runEffect(s, {effect: "moveZone", targets: [land], to: "graveyard"}, {controller: 0});
  eq(cardsIn(s, "graveyard", 0).length, 1, "it went to the graveyard");
  eq(s.objects[cardsIn(s, "graveyard", 0)[0]].tapped, false,
    "and 'enters tapped' says nothing about a graveyard — a card there is not tapped or untapped at all (CR 110.5b)");
}

console.log(`engine-enters: ${checks} checks passed — a permanent's own arrival ability is found while it is still in hand, entering tapped is one event and not two, and a 0/0 that enters with counters is never a 0/0 on the battlefield.`);
