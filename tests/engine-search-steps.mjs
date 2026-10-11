/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* TRAIN C, W2D: A SEARCH A CARD AT A TIME -- "FOR A FOREST CARD AND A PLAINS CARD" (Krosan Verge) AND "FOR UP TO TWO BASIC LAND
 * CARDS THAT SHARE A LAND TYPE" (Myriad Landscape; CR 701.23b, 701.23h, 205.3i).
 *
 * chooseCard's `searches` (a description for each card) and `sharing: "land type"` (effects/asking.mjs): one search, asked a
 * card at a time -- each question the cards the next description fits, or that share a land type with every card found
 * before -- and everything found goes where the search puts it at once, then one shuffle. Each may find nothing; a later
 * one with nothing to find is not asked; with `sharing`, finding none ends it. Here: both forms, the cards that move and
 * when, a card found once never found again, refused answers, the shuffle, and the compiler.
 */
import assert from "node:assert/strict";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {compileScript} from "../game/engine/cards/index.mjs";
import {beginResolution} from "../game/engine/script/resolution.mjs";
import {awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {createRng} from "../game/engine/rng.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const FIX = {Savannah: {types: ["Land"], subtypes: ["Forest", "Plains"], manaCost: null, colors: []},
  /* Two basic lands that share a subtype that is no land type (CR 205.3i): they share no land type. */
  "Dryad Grove": {types: ["Land"], supertypes: ["Basic"], subtypes: ["Forest", "Dryad"], manaCost: null, colors: []},
  "Dryad Isle": {types: ["Land"], supertypes: ["Basic"], subtypes: ["Island", "Dryad"], manaCost: null, colors: []},
  "Snow Forest": {types: ["Land"], supertypes: ["Basic", "Snow"], subtypes: ["Forest"], manaCost: null, colors: []}};
const table = (library) => runScenario({name: "search-steps", library, setup: [], steps: []}, index.definition, FIX).state;
const KROSAN = {effect: "chooseCard", zone: "library", searches: [{subtypes: ["Forest"]}, {subtypes: ["Plains"]}], to: "battlefield", tapped: true, shuffle: true};
const MYRIAD = {effect: "chooseCard", zone: "library", selector: {types: ["Land"], supertypes: ["Basic"]}, count: 2, upTo: true, sharing: "land type", to: "battlefield", tapped: true, shuffle: true};
const labels = (s) => awaitingChoice(s).options.map((o) => o.label);
const onField = (s) => s.zones.battlefield.map((id) => s.objects[id].card).sort();
const pick = (s, name, rng) => resolveAwaiting(s, name === null ? [] : [awaitingChoice(s).options.find((o) => o.label === name).index], null, rng);

{
  const s = table(["Island", "Forest", "Plains"]), rng = createRng("k");
  beginResolution(s, [KROSAN], {controller: 0, source: null}, rng);
  const q = awaitingChoice(s);
  eq([q.title, q.mode, q.min, q.max, labels(s)], ["Search your library: card 1 of 2", "many", 0, 1, ["Forest"]], "first: a Forest card, which it may fail to find");
  pick(s, "Forest", rng);
  eq([awaitingChoice(s).title, labels(s), onField(s)], ["Search your library: card 2 of 2 (Forest found)", ["Plains"], []], "then a Plains card; nothing has moved yet");
  const events = pick(s, "Plains", rng);
  eq([onField(s), s.zones.battlefield.every((id) => s.objects[id].tapped), s.awaiting], [["Forest", "Plains"], true, null], "both onto the battlefield tapped, together");
  eq(events.filter((e) => e.kind === "GameEventShuffle").length, 1, "one shuffle, after both (CR 701.23h)");
}
{
  /* A card found once is never found again: two Savannahs are the Forest and the Plains, one card is not both. */
  const s = table(["Savannah", "Island"]), rng = createRng("k");
  beginResolution(s, [KROSAN], {controller: 0, source: null}, rng);
  pick(s, "Savannah", rng);
  eq(s.awaiting, null, "one Savannah, found as the Forest card: no Plains card left to find, and nothing asked");
  eq(onField(s), ["Savannah"], "and it alone is put onto the battlefield");
}
{
  /* Fail to find the first, and the second is still asked. Nothing in the library at all: the first still is (a search). */
  const s = table(["Plains"]), rng = createRng("k");
  beginResolution(s, [KROSAN], {controller: 0, source: null}, rng);
  eq([labels(s), awaitingChoice(s).max], [[], 0], "no Forest card: asked, nothing to find, so none may be chosen");
  pick(s, null, rng);
  pick(s, "Plains", rng);
  eq(onField(s), ["Plains"], "then the Plains card");
  let refused = 0;
  const t = table(["Forest", "Forest", "Plains"]);
  beginResolution(t, [KROSAN], {controller: 0, source: null}, createRng("k"));
  for (const bad of [[0, 1], [7]]) try { resolveAwaiting(t, bad, null, createRng("k")); } catch { refused += 1; }
  eq(refused, 2, "two at once, and one not offered: each refused");
}
{
  /* Sharing a land type: the second only what shares one with the first -- a snow Forest is a Forest. */
  const s = table(["Forest", "Island", "Snow Forest", "Plains"]), rng = createRng("m");
  beginResolution(s, [MYRIAD], {controller: 0, source: null}, rng);
  ok(labels(s).includes("Island") && labels(s).includes("Wastes"), "first: any basic land card -- Wastes too");
  pick(s, "Island", rng);
  eq(s.awaiting, null, "an Island first: none other shares a land type, and nothing more is asked");
  const t = table(["Forest", "Island", "Snow Forest"]), rng2 = createRng("m");
  beginResolution(t, [MYRIAD], {controller: 0, source: null}, rng2);
  pick(t, "Forest", rng2);
  eq(labels(t), ["Snow Forest"], "a Forest first: the snow Forest alone shares one");
  pick(t, "Snow Forest", rng2);
  eq(onField(t), ["Forest", "Snow Forest"], "both onto the battlefield");
  const w = table(["Dryad Grove", "Dryad Isle", "Forest"]), rng4 = createRng("m");
  beginResolution(w, [MYRIAD], {controller: 0, source: null}, rng4);
  pick(w, "Dryad Grove", rng4);
  eq(labels(w), ["Forest"], "a Dryad shared is no land type shared: the Forest alone");
  const u = table(["Forest", "Forest"]), rng3 = createRng("m");
  beginResolution(u, [MYRIAD], {controller: 0, source: null}, rng3);
  pick(u, null, rng3);
  eq([u.awaiting, onField(u)], [null, []], "up to two: none found, and it is over");
}

/* ---- the compiler ---- */
const compiled = (effect) => compileScript({schema: "CrankCardScript@1",
  identity: {name: "Odd Verge", oracleId: "x", types: ["Land"], subtypes: [], manaCost: null, colors: [], colorIdentity: []},
  oracleText: "x", source: "hand", abilities: [{kind: "activated", text: "x", cost: [{atom: "{T}"}], effects: [effect]}]}).problems;
{
  eq([compiled(KROSAN), compiled(MYRIAD)], [[], []], "both forms compile");
  ok(compiled({...KROSAN, zone: "graveyard"}).some((p) => p.includes("of a library")), "of a graveyard: refused");
  ok(compiled({...KROSAN, searches: [{subtypes: ["Forest"]}]}).some((p) => p.includes("two or more descriptions")), "one description: refused");
  ok(compiled({...KROSAN, count: 2}).some((p) => p.includes("two or more descriptions")), "with a count of its own: refused");
  ok(compiled({...KROSAN, sharing: "land type"}).some((p) => p.includes("two or more descriptions")), "with sharing too: refused");
  ok(compiled({...KROSAN, selector: {types: ["Land"]}}).some((p) => p.includes("two or more descriptions")), "with a selector of its own: refused");
  ok(compiled({...KROSAN, searches: [{subtypes: ["Forest"]}, {flavor: 1}]}).some((p) => p.includes("selector grammar")), "a description the selector grammar does not know: refused");
  ok(compiled({...MYRIAD, sharing: "color"}).some((p) => p.includes("sharing is")), "sharing a color: refused, not built");
  ok(compiled({...MYRIAD, count: 1}).some((p) => p.includes("sharing is")), "sharing among one: refused");
  ok(compiled({...MYRIAD, count: 3}).some((p) => p.includes("sharing is")), "sharing among three: refused, not built");
  ok(compiled({...MYRIAD, selector: undefined}).some((p) => p.includes("sharing is")), "sharing with no selector: refused");
}

console.log(`engine-search-steps: ${checks} checks passed -- a search a card at a time: a description for each, or sharing a land type; found together, shuffled once; refused when wrong.`);
