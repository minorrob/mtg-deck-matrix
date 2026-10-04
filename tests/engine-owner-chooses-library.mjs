/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* "THE OWNER OF TARGET NONLAND PERMANENT PUTS IT INTO THEIR LIBRARY SECOND FROM THE TOP OR ON THE BOTTOM" (Rob's Priority
 * Batch 10.3, its forty-fifth slice: Temporal Cleansing, the 193rd card of Rob's list).
 *
 * A choice made as the spell resolves by a player who is not its controller: a `modal` with a `chooser` of
 * `{ownerOf: {target: 0}}` (script/bind.mjs) asks the target's owner -- as it now is, its controller aside. Such a choice
 * is no mode of the spell's (cards/index.mjs): it is not chosen as the spell is cast (CR 700.2), and the spell names its
 * target beside it. And `moveZone` to a library with a `position` (script/effects/zones.mjs) puts the card that many down
 * from the top: "second from the top" is `position: 2`, the bottom of a library too short for it.
 *
 * The card scenarios play the card. This suite holds the edges.
 */
import assert from "node:assert/strict";
import {moveZone} from "../game/engine/script/effects/zones.mjs";
import {bindEffect} from "../game/engine/script/bind.mjs";
import {compileScript} from "../game/engine/cards/index.mjs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const at = (seat, zone, ...cards) => ({seat, zone, cards});
const FIX = {Idol: {types: ["Artifact"], manaCost: "{2}", colors: []}};
const play = (setup, more = {}) => runScenario({name: "owner chooses", setup, steps: [], ...more}, index.definition, FIX).state;
const top = (s, seat, n) => s.zones.library[seat].slice(0, n).map((id) => s.objects[id].card);
const bottom = (s, seat) => s.objects[s.zones.library[seat].at(-1)].card;
const idol = (s) => s.zones.battlefield.find((id) => s.objects[id].card === "Idol");

/* ---- how far down the library ---- */
{
  const s = play([at(1, "battlefield", "Idol")], {library: ["Forest", "Mountain", "Plains"]});
  moveZone(s, {targets: [idol(s)], to: "library", position: 2}, {controller: 0});
  eq(top(s, 1, 4), ["Forest", "Idol", "Mountain", "Plains"], "second from the top: one card above it");
}
{
  const s = play([at(1, "battlefield", "Idol")], {library: ["Forest"]});
  moveZone(s, {targets: [idol(s)], to: "library", top: true}, {controller: 0});
  eq(top(s, 1, 2), ["Idol", "Forest"], "on top, as before");
  const t = play([at(1, "battlefield", "Idol")], {library: ["Forest"]});
  moveZone(t, {targets: [idol(t)], to: "library"}, {controller: 0});
  eq(bottom(t, 1), "Idol", "and on the bottom when it says neither");
}
{
  const s = play([at(1, "battlefield", "Idol")]);
  s.zones.library[1].splice(1);
  moveZone(s, {targets: [idol(s)], to: "library", position: 3}, {controller: 0});
  eq(top(s, 1, 2), ["Wastes", "Idol"], "third from the top of a one-card library: the bottom, under it");
}

/* ---- who is asked ---- */
{
  const s = play([at(1, "battlefield", "Idol")]);
  const id = idol(s);
  s.objects[id].controller = 0;
  const bound = bindEffect({effect: "modal", chooser: {ownerOf: {target: 0}}, modes: []}, {controller: 0, source: null, targets: [{kind: "object", id}]}, s);
  eq(bound.chooser, 1, "the owner of the target, though Rob controls it now");
  const gone = bindEffect({effect: "modal", chooser: {ownerOf: {target: 0}}, modes: []}, {controller: 0, source: null, targets: []}, s);
  eq("chooser" in gone, false, "no target, and nobody but the controller is named");
}

/* ---- the compiler ---- */
{
  const text = "The owner of target nonland permanent puts it into their library second from the top or on the bottom.";
  const compiled = compileScript({schema: "CrankCardScript@1", identity: {name: "Odd Cleansing", oracleId: "x", types: ["Sorcery"], subtypes: [], manaCost: "{U}", colors: ["U"], colorIdentity: ["U"]},
    oracleText: text, source: "hand", abilities: [{kind: "spell", text, targets: [{what: "permanent", nonTypes: ["Land"]}], effects: [{effect: "modal", chooser: {ownerOf: {target: 0}}, choose: 1,
      modes: [{text: "Second from the top", effects: [{effect: "moveZone", targets: {target: 0}, to: "library", position: 2}]}, {text: "On the bottom", effects: [{effect: "moveZone", targets: {target: 0}, to: "library"}]}]}]}]});
  eq([compiled.problems, compiled.definition?.spell?.modal, compiled.definition?.spell?.targets?.length], [[], undefined, 1],
    "a choice the owner makes as it resolves is no mode chosen as it is cast, and the spell keeps its target");
}
ok(index.resolve("Temporal Cleansing")?.playable === true, "Temporal Cleansing is defined and playable");

console.log(`engine-owner-chooses-library: ${checks} checks passed -- the target's owner asked as it resolves, not the spell's modes; second from the top, the top, the bottom.`);
