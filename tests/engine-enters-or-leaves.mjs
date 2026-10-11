/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* "IF A LEGENDARY PERMANENT OR AN ARTIFACT ENTERING OR LEAVING THE BATTLEFIELD CAUSES A TRIGGERED ABILITY OF A PERMANENT YOU
 * CONTROL TO TRIGGER, THAT ABILITY TRIGGERS AN ADDITIONAL TIME" (Gandalf the White; Train C phase 2, w2a-selectors; CR
 * 603.2d, 603.6a, 603.10a).
 *
 * A `triggers-again` static's cause `{event: "enters or leaves", filter}` (rules/trigger.mjs, causedBy): an arrival, as it now
 * is, or a departure from the battlefield to anywhere -- dying, exiled, returned, sacrificed -- as it last existed there (its
 * last known information, so a token that ceases to exist still counts). Gandalf's flash for legendary and artifact spells is
 * the `cast-as-though-flash` permission as built. The card's scenarios play Gandalf; this suite holds every way to leave, a
 * creature's own "when this dies", a token, two Gandalfs, an opponent's ability, and the grammar.
 */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createState, addObject} from "../game/engine/state/index.mjs";
import {beginGame, advance} from "../game/engine/rules/turn.mjs";
import {collectTriggers} from "../game/engine/rules/trigger.mjs";
import {runEffects} from "../game/engine/script/effects/index.mjs";
import {validateScript} from "../game/engine/script/schema.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";

let checks = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const cards = loadCardIndex();
const card = (name) => ({...cards.definition(name), card: name});
const WASTES = {card: "Wastes", types: ["Land"], supertypes: ["Basic"], abilities: [{id: "a0", kind: "mana", tapSelf: true, produces: {C: 1}}]};
function table() {
  const s = createState({matchId: "m", seed: "gandalf", players: [{name: "Rob"}, {name: "Maya"}]});
  for (let seat = 0; seat < 2; seat += 1) for (let i = 0; i < 12; i += 1) addObject(s, {...WASTES, owner: seat, controller: seat}, "library", seat);
  beginGame(s);
  for (let n = 0; n < 50 && !(s.phase === "MAIN1" && s.priorityPlayer === 0); n += 1) advance(s);
  return s;
}
const on = (s, o, seat) => addObject(s, {...o, owner: seat, controller: seat}, "battlefield", null);
const inHand = (s, o, seat) => addObject(s, {...o, owner: seat, controller: seat}, "hand", seat);
const triggered = (s, effects, controller = 0) => { s.pendingTriggers = []; collectTriggers(s, runEffects(s, effects, {controller, source: null})); return s.pendingTriggers.map((t) => t.source.name); };
const LEAVER = {card: "Leaver", types: ["Enchantment"], abilities: [{id: "l", kind: "triggered", text: "Whenever another permanent leaves the battlefield, draw a card.",
  trigger: {on: "GameEventCardChangeZone", from: "Battlefield", who: "another"}, effects: [{effect: "draw", count: 1}]}]};
const ARRIVER = {card: "Arriver", types: ["Enchantment"], abilities: [{id: "a", kind: "triggered", text: "Whenever another permanent enters, you gain 1 life.",
  trigger: {on: "GameEventCardChangeZone", to: "Battlefield", who: "another"}, effects: [{effect: "gainLife", amount: 1}]}]};
const RELIC = {card: "Relic", types: ["Artifact"]};
const HERO = {card: "Hero", types: ["Creature"], supertypes: ["Legendary"], power: 2, toughness: 2,
  abilities: [{id: "d", kind: "triggered", text: "When this creature dies, you gain 2 life.", trigger: {on: "GameEventCardChangeZone", from: "Battlefield", to: "Graveyard", who: "self"}, effects: [{effect: "gainLife", amount: 2}]}]};
const BEAR = {card: "Bear", types: ["Creature"], power: 2, toughness: 2};
const LAND = {card: "Gaea's Cradle", types: ["Land"], supertypes: ["Legendary"]};

{
  /* Every way to leave the battlefield: an artifact destroyed, exiled, returned to its owner's hand, sacrificed. */
  const s = table();
  on(s, card("Gandalf the White"), 0);
  on(s, LEAVER, 0);
  const relics = [0, 1, 2, 3].map(() => on(s, RELIC, 0));
  eq(triggered(s, [{effect: "destroy", targets: [relics[0]]}]), ["Leaver", "Leaver"], "an artifact destroyed: twice");
  eq(triggered(s, [{effect: "moveZone", targets: [relics[1]], to: "exile"}]), ["Leaver", "Leaver"], "an artifact exiled: twice");
  eq(triggered(s, [{effect: "moveZone", targets: [relics[2]], to: "hand"}]), ["Leaver", "Leaver"], "an artifact returned to its owner's hand: twice");
  eq(triggered(s, [{effect: "moveZone", targets: [relics[3]], to: "graveyard", sacrifice: true}]), ["Leaver", "Leaver"], "an artifact sacrificed: twice");
  const bear = on(s, BEAR, 0);
  eq(triggered(s, [{effect: "destroy", targets: [bear]}]), ["Leaver"], "a nonlegendary creature, no artifact: once");
}
{
  /* A legendary creature's own "when this dies", read as it last was (CR 603.10a); a token artifact that ceases to exist. */
  const s = table();
  on(s, card("Gandalf the White"), 0);
  const hero = on(s, HERO, 0);
  eq(triggered(s, [{effect: "destroy", targets: [hero]}]), ["Hero", "Hero"], "the legendary Hero dies: its own dies trigger twice");
  on(s, LEAVER, 0);
  runEffects(s, [{effect: "createToken", token: {predefined: "Treasure"}}], {controller: 0, source: null});
  const treasure = s.zones.battlefield.find((id) => s.objects[id].card === "Treasure");
  eq(triggered(s, [{effect: "moveZone", targets: [treasure], to: "graveyard", sacrifice: true}]), ["Leaver", "Leaver"], "a Treasure token sacrificed: an artifact leaving, twice");
}
{
  /* Entering: a legendary land is a legendary permanent; a Bear is neither. Two Gandalfs: three times. */
  const s = table();
  on(s, card("Gandalf the White"), 0);
  on(s, ARRIVER, 0);
  eq(triggered(s, [{effect: "moveZone", targets: [inHand(s, LAND, 0)], to: "battlefield"}]), ["Arriver", "Arriver"], "a legendary land enters: twice");
  eq(triggered(s, [{effect: "moveZone", targets: [inHand(s, BEAR, 0)], to: "battlefield"}]), ["Arriver"], "a Bear enters: once");
  on(s, card("Gandalf the White"), 0);
  eq(triggered(s, [{effect: "moveZone", targets: [inHand(s, RELIC, 0)], to: "battlefield"}]).length, 3, "two Gandalfs: an artifact entering, three times");
}
{
  /* An opponent's ability is not one of a permanent Rob controls; and Maya's artifact leaving still doubles Rob's Leaver. */
  const s = table();
  on(s, card("Gandalf the White"), 0);
  on(s, LEAVER, 1);
  const relic = on(s, RELIC, 0);
  eq(triggered(s, [{effect: "destroy", targets: [relic]}]), ["Leaver"], "Maya's Leaver: once");
  const t = table();
  on(t, card("Gandalf the White"), 0);
  on(t, LEAVER, 0);
  const hers = on(t, RELIC, 1);
  eq(triggered(t, [{effect: "destroy", targets: [hers]}]), ["Leaver", "Leaver"], "Maya's artifact leaving, Rob's Leaver: twice -- whoever's the artifact is");
}
{
  /* The grammar: "enters or leaves" is a cause; "leaves" alone is not one yet. */
  const gandalf = JSON.parse(readFileSync(new URL("../game/engine/cards/g/gandalf-the-white.json", import.meta.url), "utf8"));
  eq(validateScript(gandalf).valid, true, "Gandalf's definition is a valid script");
  const copy = structuredClone(gandalf);
  copy.abilities[2].cause.event = "leaves";
  eq(validateScript(copy).errors.some((e) => /enters or leaves/.test(e.message)), true, "\"leaves\" alone is refused, naming what is built");
}

console.log(`engine-enters-or-leaves: ${checks} checks passed`);
