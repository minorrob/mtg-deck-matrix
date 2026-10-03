/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* M4 PHASE 3, BATCH 43 (THE CATALOG'S ORDER): "WHENEVER YOU SACRIFICE A PERMANENT" (CR 701.21).
 *
 * Every way to sacrifice says so -- a Treasure's mana ability, "sacrifice a creature:" as a cost, the sacrifice effect,
 * "sacrifice it at the beginning of the next end step" -- with who sacrificed it. A destroyed permanent was not
 * sacrificed, and does not trigger "whenever you sacrifice", even its own (read as it left). Whose: "you", "a player".
 * "Another permanent": not this one. What it was, as it last was.
 */
import assert from "node:assert/strict";
import {createState, addObject} from "../game/engine/state/index.mjs";
import {beginGame, advance, awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {legalActions, applyAction} from "../game/engine/rules/actions.mjs";
import {collectTriggers} from "../game/engine/rules/trigger.mjs";
import {runEffects} from "../game/engine/script/effects/index.mjs";
import {beginResolution} from "../game/engine/script/resolution.mjs";
import {TRIGGER_KINDS} from "../game/engine/cards/index.mjs";
import {missingFor} from "../game/tools/engine-constructs.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";

let checks = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const cards = loadCardIndex();
const card = (name) => ({...cards.definition(name), card: name});
const WASTES = {card: "Wastes", types: ["Land"], supertypes: ["Basic"], abilities: [{id: "a0", kind: "mana", tapSelf: true, produces: {C: 1}}]};
const BEAR = {card: "Bear", types: ["Creature"], power: 2, toughness: 2};
function table() {
  const s = createState({matchId: "m", seed: "sacrificed", players: [{name: "Rob"}, {name: "Maya"}]});
  for (let seat = 0; seat < 2; seat += 1) for (let i = 0; i < 12; i += 1) addObject(s, {...WASTES, owner: seat, controller: seat}, "library", seat);
  return s;
}
const on = (s, o, seat) => addObject(s, {...o, owner: seat, controller: seat}, "battlefield", null);
function main(s) { beginGame(s); for (let n = 0; n < 50 && !(s.phase === "MAIN1" && s.priorityPlayer === 0); n += 1) advance(s); return s; }
const sacrifices = (events) => events.filter((e) => e.kind === "GameEventCardChangeZone" && e.data.fields.sacrificed === true).map((e) => [e.data.fields.card.name, e.data.fields.sacrificer]);
const triggeredBy = (s, events) => { s.pendingTriggers = []; collectTriggers(s, events); return s.pendingTriggers.map((t) => t.source.name); };

{
  /* Each way to sacrifice says so, with who. */
  const s = table();
  runEffects(s, [{effect: "createToken", token: {predefined: "Treasure"}}], {controller: 0, source: null});
  const altar = on(s, {card: "Altar", types: ["Artifact"], abilities: [{id: "alt", kind: "activated", text: "Sacrifice a creature: You gain 1 life.", cost: [{atom: "sacrifice", selector: {types: ["Creature"]}}], effects: [{effect: "gainLife", amount: 1}]}]}, 0);
  on(s, BEAR, 0);
  main(s);
  const treasure = s.zones.battlefield.find((id) => s.objects[id].card === "Treasure");
  eq(sacrifices(applyAction(s, 0, legalActions(s, 0).find((a) => a.kind === "activate-mana" && a.objectId === treasure))), [["Treasure", 0]], "a Treasure tapped and sacrificed for mana: a sacrifice, by Rob");
  eq(sacrifices(applyAction(s, 0, legalActions(s, 0).find((a) => a.kind === "activate" && a.objectId === altar))), [["Bear", 0]], "\"sacrifice a creature:\" as a cost: a sacrifice");
  const elf = on(s, {...BEAR, card: "Elf"}, 1);
  beginResolution(s, [{effect: "sacrifice", who: "opponent", count: 1, selector: {types: ["Creature"]}}], {controller: 0, source: null});
  eq(sacrifices(resolveAwaiting(s, [0])), [["Elf", 1]], "\"each opponent sacrifices a creature\": Maya's sacrifice, by Maya");
  void elf;
  const goblin = on(s, {...BEAR, card: "Goblin"}, 0);
  eq(sacrifices(runEffects(s, [{effect: "moveZone", targets: [goblin], to: "graveyard", sacrifice: true}], {controller: 0, source: null})), [["Goblin", 0]], "\"sacrifice it at the beginning of the next end step\": a sacrifice");
}
{
  /* Destroyed is not sacrificed -- not even for its own "whenever you sacrifice", read as it left. Whose, and "another". */
  const s = main(table());
  const juri = on(s, card("Juri, Master of the Revue"), 0);
  on(s, card("Mayhem Devil"), 0);
  on(s, card("Korvold, Fae-Cursed King"), 0);
  eq(triggeredBy(s, runEffects(s, [{effect: "destroy", targets: [juri]}], {controller: 1, source: null})).includes("Mayhem Devil"), false,
    "Juri destroyed: nothing triggers on a sacrifice -- not Mayhem Devil");
  const s2 = main(table());
  const juri2 = on(s2, card("Juri, Master of the Revue"), 0);
  eq(triggeredBy(s2, runEffects(s2, [{effect: "destroy", targets: [juri2]}], {controller: 1, source: null})), ["Juri, Master of the Revue"], "Juri destroyed: only its own \"when Juri dies\" -- not its \"whenever you sacrifice\"");
  const t = main(table());
  on(t, card("Mayhem Devil"), 0); on(t, card("Korvold, Fae-Cursed King"), 0);
  const mayas = on(t, BEAR, 1);
  eq(triggeredBy(t, runEffects(t, [{effect: "moveZone", targets: [mayas], to: "graveyard", sacrifice: true}], {controller: 1, source: null})), ["Mayhem Devil"], "Maya sacrifices: Mayhem Devil (a player) triggers, Korvold (you) does not");
  const u = main(table());
  const mazirek = on(u, card("Mazirek, Kraul Death Priest"), 0);
  eq(triggeredBy(u, runEffects(u, [{effect: "moveZone", targets: [mazirek], to: "graveyard", sacrifice: true}], {controller: 0, source: null})), [], "Mazirek sacrificed itself: \"another permanent\" -- nothing");
  on(u, card("Mazirek, Kraul Death Priest"), 0);
  const other = on(u, BEAR, 0);
  eq(triggeredBy(u, runEffects(u, [{effect: "moveZone", targets: [other], to: "graveyard", sacrifice: true}], {controller: 0, source: null})), ["Mazirek, Kraul Death Priest"], "another permanent sacrificed: it triggers");
}
{
  /* What it was, as it last was: a Treasure is a Treasure; a Bear is not an artifact. Korvold sacrifices another. */
  const s = main(table());
  on(s, card("Captain Lannery Storm"), 0); on(s, card("Crime Novelist"), 0);
  const bear = on(s, BEAR, 0);
  eq(triggeredBy(s, runEffects(s, [{effect: "moveZone", targets: [bear], to: "graveyard", sacrifice: true}], {controller: 0, source: null})), [], "a Bear sacrificed: neither \"a Treasure\" nor \"an artifact\" triggers");
  runEffects(s, [{effect: "createToken", token: {predefined: "Treasure"}}], {controller: 0, source: null});
  const treasure = s.zones.battlefield.find((id) => s.objects[id].card === "Treasure");
  eq(triggeredBy(s, runEffects(s, [{effect: "moveZone", targets: [treasure], to: "graveyard", sacrifice: true}], {controller: 0, source: null})).sort(), ["Captain Lannery Storm", "Crime Novelist"], "a Treasure: both (a Treasure, an artifact)");
  const k = main(table());
  const korvold = on(k, card("Korvold, Fae-Cursed King"), 0);
  on(k, BEAR, 0);
  beginResolution(k, [{effect: "sacrifice", count: 1, selector: {another: true}}], {controller: 0, source: korvold});
  eq(awaitingChoice(k).options.map((o) => o.label), ["Bear"], "Korvold's \"sacrifice another permanent\": the Bear, not Korvold");
}
{
  eq([TRIGGER_KINDS.includes("sacrificed"), missingFor({triggers: ["Sacrificed"]})], [true, []], "the trigger is one a card may name, and the catalog credits it");
}

console.log(`engine-sacrificed: ${checks} checks passed — every sacrifice says so, by whom; destroyed is not sacrificed, its own trigger included; you or a player; another; what it was; Korvold sacrifices another.`);
