// The graph's filters, against the real 7,764-card graph.
//
// These are cheap to get subtly wrong in ways nobody notices: an OR where an AND was
// meant, a colour rule that quietly hides colourless cards, an Ownership control that
// appears on an empty library offering one useless option. Each of those is a check here.
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {readFile} from "node:fs/promises";

const require = createRequire(import.meta.url);
const Facets = require("../crankmagic-facets.js");

const graph = JSON.parse(await readFile(new URL("../data/graph.json", import.meta.url), "utf8"));
const CARDS = graph.cards;

let checks = 0;
const check = (label, fn) => { fn(); checks += 1; void label; };

/* ------------------------------------------------------- the facets that exist */

check("the ten public facets are the ones the old graph page carried", () => {
  const keys = Facets.available(null).map((f) => f.key);
  assert.deepEqual(keys, ["roles","colors","type","mechanics","tribes","triggers","causes","produces","requires","rarity"],
    "an empty library shows the card facets and neither personal one");
});

check("an empty library is offered no Ownership control", () => {
  const keys = Facets.available({cards:{}, lots:[], decks:[]}).map((f) => f.key);
  assert.ok(!keys.includes("owned"), "Ownership on an empty library offers only 'not owned', which filters nothing");
  assert.ok(!keys.includes("decks"));
});

check("a library with a card gets both personal facets back", () => {
  const state = {cards:{"card:a":{id:"card:a",name:"Sol Ring"}},
    lots:[{id:"lot:1",cardId:"card:a",quantity:1,source:"owned",location:{kind:"bench"}}], decks:[]};
  const keys = Facets.available(state).map((f) => f.key);
  assert.ok(keys.includes("owned") && keys.includes("decks"));
});

/* --------------------------------------------------------------- what it counts */

const VALUES = Facets.values(CARDS, null);

check("every facet reports values, commonest first", () => {
  for (const facet of Facets.available(null)) {
    const rows = VALUES[facet.key];
    assert.ok(rows.length > 0, `${facet.key} produced no values from the real graph`);
    for (let i = 1; i < rows.length; i += 1) {
      assert.ok(rows[i - 1].count >= rows[i].count, `${facet.key} is not sorted by count`);
    }
  }
});

check("the counts are real counts, not guesses", () => {
  const row = VALUES.rarity.find((r) => r.value === "common");
  const actual = CARDS.filter((c) => c.rarity === "common").length;
  assert.equal(row.count, actual);
});

check("card type is matched inside the printed type line", () => {
  const creatures = VALUES.type.find((r) => r.value === "Creature").count;
  assert.equal(creatures, CARDS.filter((c) => /Creature/.test(c.type || "")).length);
  assert.ok(creatures > 1000, "a Commander catalog with under a thousand creatures is a parsing bug");
});

/* -------------------------------------------------------------- how it narrows */

check("no selection is not a filter", () => {
  assert.equal(Facets.apply(CARDS, {}, null).length, CARDS.length);
  assert.equal(Facets.apply(CARDS, null, null).length, CARDS.length);
});

check("picks inside one facet are ANDed, not ORed", () => {
  const both = Facets.apply(CARDS, {roles: ["ramp", "draw"]}, null).length;
  const ramp = Facets.apply(CARDS, {roles: ["ramp"]}, null).length;
  const draw = Facets.apply(CARDS, {roles: ["draw"]}, null).length;
  assert.ok(both <= Math.min(ramp, draw),
    `ramp+draw returned ${both}, more than ramp (${ramp}) or draw (${draw}) alone — that is an OR`);
  assert.ok(both > 0, "no card both ramps and draws, which is not true of Magic");
});

check("picks across facets narrow further", () => {
  const one = Facets.apply(CARDS, {type: ["Creature"]}, null).length;
  const two = Facets.apply(CARDS, {type: ["Creature"], rarity: ["mythic"]}, null).length;
  assert.ok(two < one && two > 0, `${two} of ${one}`);
});

/* --------------------------------------------------- colour, the one with a rule */

check("a colourless card is legal in every deck, so it passes any colour pick", () => {
  const solRing = CARDS.find((c) => c.name === "Sol Ring");
  assert.ok(solRing, "Sol Ring must be in the catalog");
  assert.equal(solRing.ci || "", "", "Sol Ring is colourless");
  assert.ok(Facets.matches(solRing, {colors: ["W"]}), "colourless must pass a mono-white deck");
  assert.ok(Facets.matches(solRing, {colors: ["U", "B"]}), "and a two-colour one");
});

check("ticking C alone is how you isolate colourless", () => {
  const solRing = CARDS.find((c) => c.name === "Sol Ring");
  const white = CARDS.find((c) => c.ci === "W");
  assert.ok(Facets.matches(solRing, {colors: ["C"]}));
  assert.ok(!Facets.matches(white, {colors: ["C"]}), "a white card is not colourless");
});

check("a card outside the picked identity is excluded", () => {
  // ci is stored in a canonical order (BW, not WB), so pick a real two-colour card and
  // use its own letters rather than assuming which way round they are written.
  const pair = CARDS.find((c) => c.ci && c.ci.length === 2);
  assert.ok(pair, "the catalog must hold a two-colour card");
  const [a, b] = pair.ci.split("");
  assert.ok(Facets.matches(pair, {colors: [a, b]}), `${pair.name} (${pair.ci}) fits its own two colours`);
  assert.ok(!Facets.matches(pair, {colors: [a]}), `${pair.name} (${pair.ci}) does not fit a mono-${a} deck`);
});

/* ------------------------------------------------- ownership, from live state only */

function library() {
  return {
    cards: {
      "card:sol": {id: "card:sol", name: "Sol Ring"},
      "card:sig": {id: "card:sig", name: "Arcane Signet"},
      "card:cmd": {id: "card:cmd", name: "Command Tower"}
    },
    lots: [
      {id: "lot:1", cardId: "card:sol", quantity: 1, source: "owned", location: {kind: "bench"}},
      {id: "lot:2", cardId: "card:sig", quantity: 1, source: "ordered"}
    ],
    decks: [{id: "deck:1", name: "Splinter", archived: false,
             slots: [{id: "s1", cardId: "card:cmd", quantity: 1, purpose: "main"}]}]
  };
}

check("ownership comes from the collection, never from the stale graph fields", () => {
  const stale = CARDS.find((c) => c.own > 0);
  assert.ok(stale, "the historical graph does carry baked ownership — that is what this guards against");
  const rows = Facets.apply([stale], {owned: ["on the bench"]}, library());
  assert.equal(rows.length, 0,
    `${stale.name} has own=${stale.own} baked into graph.json and must NOT count as owned`);
});

check("a card owned in the live library is found by Ownership", () => {
  const sol = CARDS.find((c) => c.name === "Sol Ring");
  assert.equal(Facets.apply([sol], {owned: ["on the bench"]}, library()).length, 1);
  assert.equal(Facets.apply([sol], {owned: ["on order"]}, library()).length, 0);
});

check("an ordered card reads as on order, not owned", () => {
  const sig = CARDS.find((c) => c.name === "Arcane Signet");
  assert.equal(Facets.apply([sig], {owned: ["on order"]}, library()).length, 1);
});

check("a card in no lot reads as not owned", () => {
  const any = CARDS.find((c) => !["Sol Ring", "Arcane Signet", "Command Tower"].includes(c.name));
  assert.equal(Facets.apply([any], {owned: ["not owned"]}, library()).length, 1);
});

check("In a deck lists the decks by name and matches them", () => {
  const tower = CARDS.find((c) => c.name === "Command Tower");
  assert.equal(Facets.apply([tower], {decks: ["Splinter"]}, library()).length, 1);
  const sol = CARDS.find((c) => c.name === "Sol Ring");
  assert.equal(Facets.apply([sol], {decks: ["Splinter"]}, library()).length, 0);
});

check("an archived deck is not offered as a filter", () => {
  const state = library();
  state.decks[0].archived = true;
  const vals = Facets.values(CARDS, state);
  assert.deepEqual(vals.decks || [], [], "an archived deck must not appear in the In a deck facet");
});

/* ---------------------------------------------------------------- the selection */

check("toggling adds then removes, and an empty facet disappears", () => {
  let sel = Facets.toggle({}, "roles", "ramp");
  assert.deepEqual(sel, {roles: ["ramp"]});
  sel = Facets.toggle(sel, "roles", "draw");
  assert.deepEqual(sel.roles, ["ramp", "draw"]);
  sel = Facets.toggle(sel, "roles", "ramp");
  assert.deepEqual(sel.roles, ["draw"]);
  sel = Facets.toggle(sel, "roles", "draw");
  assert.deepEqual(sel, {}, "the last pick removed should leave no empty array behind");
});

check("chips name the facet a pick came from, so it can be removed on its own", () => {
  const chips = Facets.chips({roles: ["ramp"], colors: ["W"]});
  assert.deepEqual(chips, [
    {key: "roles", label: "Role", value: "ramp"},
    {key: "colors", label: "Color", value: "W"}
  ]);
  assert.equal(Facets.count({roles: ["ramp"], colors: ["W"]}), 2);
});

check("the whole catalog narrows to a small, real answer", () => {
  const rows = Facets.apply(CARDS, {type: ["Creature"], colors: ["B"], tribes: ["Rat"]}, null);
  assert.ok(rows.length > 0 && rows.length < 200, `black Rats returned ${rows.length}`);
  assert.ok(rows.every((c) => /Creature/.test(c.type)));
});

check("any-mode within a facet is an OR, and colour keeps its own rule either way", () => {
  const all = Facets.apply(CARDS, {roles: ["ramp", "draw"]}, null).length;
  const any = Facets.apply(CARDS, {roles: ["ramp", "draw"]}, null, {any: true}).length;
  const ramp = Facets.apply(CARDS, {roles: ["ramp"]}, null).length;
  const draw = Facets.apply(CARDS, {roles: ["draw"]}, null).length;
  assert.ok(any >= Math.max(ramp, draw), `any-mode returned ${any}, fewer than ramp (${ramp}) or draw (${draw}) alone`);
  assert.ok(any <= ramp + draw && any > all, `any (${any}) must sit between all (${all}) and ramp+draw (${ramp + draw})`);
  const pair = CARDS.find((c) => c.ci && c.ci.length === 2);
  const [a] = pair.ci.split("");
  assert.ok(!Facets.matches(pair, {colors: [a]}, {any: true}), `${pair.name} must still fail a mono-${a} deck in any-mode: colour is one question about the whole identity`);
});

console.log(`crankmagic-facets: ${checks} checks passed · ${Facets.available(null).length} card facets over ${CARDS.length} cards`);
