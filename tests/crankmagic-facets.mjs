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

check("the public facets are the old graph page's, plus both sides of every relation", () => {
  const keys = Facets.available(null).map((f) => f.key);
  assert.deepEqual(keys, ["roles","colors","type","mechanics","tribes",
    "triggers","causes","multiplies","produces","requires","grants","extends","rarity"],
    "an empty library shows the card facets and neither personal one");
});

check("every directed facet has a facet for the other side of its join", () => {
  /* A filter for what a card fires on is only half useful without one for what causes
     that event; the four pairs are the reason the graph can be walked rather than read. */
  const keys = new Set(Facets.available(null).map((f) => f.key));
  for (const [a, b] of [["triggers","causes"], ["produces","requires"], ["grants","extends"]]) {
    assert.ok(keys.has(a) && keys.has(b), `${a}/${b} is offered as half a pair`);
  }
  assert.ok(keys.has("multiplies"), "and the compounding side of make-and-multiply");
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

check("a pick cycles include, exclude, gone", () => {
  /* Two states could not say "the counters deck WITHOUT the proliferate", which is a
     question a reader asks about their own deck constantly. */
  let sel = Facets.toggle({}, "roles", "ramp");
  assert.deepEqual(sel, {roles: ["ramp"]});
  assert.equal(Facets.stateOf(sel, "roles", "ramp"), "include");
  sel = Facets.toggle(sel, "roles", "ramp");
  assert.deepEqual(sel, {roles: ["!ramp"]});
  assert.equal(Facets.stateOf(sel, "roles", "ramp"), "exclude");
  sel = Facets.toggle(sel, "roles", "ramp");
  assert.deepEqual(sel, {}, "the third tap leaves no empty array behind");
  assert.equal(Facets.stateOf(sel, "roles", "ramp"), "off");
});

check("inclusions and exclusions stack, in one facet and across them", () => {
  const draw = Facets.apply(CARDS, {roles: ["draw"]}, null).length;
  const drawNotRamp = Facets.apply(CARDS, {roles: ["draw", "!ramp"]}, null);
  assert.ok(drawNotRamp.length > 0 && drawNotRamp.length < draw,
    `${drawNotRamp.length} of ${draw} draw cards do not also ramp`);
  assert.ok(drawNotRamp.every((c) => !(c.roles || []).includes("ramp")));
  const alsoNotBlue = Facets.apply(CARDS, {roles: ["draw", "!ramp"], mechanics: ["!flying"]}, null);
  assert.ok(alsoNotBlue.length <= drawNotRamp.length);
  assert.ok(alsoNotBlue.every((c) => !(c.mechanics || []).includes("flying")));
});

check("an exclusion is absolute, in any mode, with or without an inclusion", () => {
  /* A card carrying an excluded term is out whatever else it carries -- otherwise
     any-mode would quietly let it back in through another pick. */
  const only = Facets.apply(CARDS, {mechanics: ["!flying"]}, null);
  const all = Facets.apply(CARDS, {}, null);
  assert.ok(only.length < all.length && only.every((c) => !(c.mechanics || []).includes("flying")));
  const anyMode = Facets.apply(CARDS, {roles: ["draw", "!ramp"]}, null, {any: true});
  assert.ok(anyMode.every((c) => !(c.roles || []).includes("ramp")),
    "any-mode must not readmit a card the reader excluded");
  assert.ok(anyMode.length >= Facets.apply(CARDS, {roles: ["draw", "!ramp"]}, null).length);
});

check("set() is the two-state control, and the chip's x means gone", () => {
  let sel = Facets.set({}, "roles", "ramp", "include");
  assert.deepEqual(sel, {roles: ["ramp"]});
  sel = Facets.set(sel, "roles", "ramp", "exclude");
  assert.deepEqual(sel, {roles: ["!ramp"]});
  sel = Facets.set(sel, "roles", "ramp", "off");
  assert.deepEqual(sel, {});
  assert.deepEqual(Facets.set({roles: ["!ramp", "draw"]}, "roles", "ramp", "off"), {roles: ["draw"]},
    "clearing one pick leaves the others alone");
});

check("chips name the facet a pick came from, so it can be removed on its own", () => {
  const chips = Facets.chips({roles: ["ramp", "!draw"], colors: ["W"]});
  assert.deepEqual(chips, [
    {key: "roles", label: "Role", value: "ramp", exclude: false},
    {key: "roles", label: "Role", value: "draw", exclude: true},
    {key: "colors", label: "Color", value: "W", exclude: false}
  ], "a chip names the term and which way it points, never the raw stored form");
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


/* ------------------------------------------- the directed facets, over the real bake */

check("Multiplies names things cards actually produce or trigger on", () => {
  const values = VALUES.multiplies.map((r) => r.value);
  assert.ok(values.length >= 8, `only ${values.length} multiplier kinds in the bake`);
  const other = new Set([...VALUES.produces.map((r) => r.value), ...VALUES.triggers.map((r) => r.value)]);
  const orphans = values.filter((v) => v !== "trigger" && !other.has(v));
  assert.deepEqual(orphans, [],
    `nothing in the catalog produces or fires on: ${orphans.join(", ")} — those multipliers can never pair`);
});

check("a multiplier is rarer than the thing it multiplies", () => {
  const makers = Facets.apply(CARDS, {produces: ["token"]}, null).length;
  const doublers = Facets.apply(CARDS, {multiplies: ["token"]}, null).length;
  assert.ok(doublers > 0, "no token doublers in a Commander catalog is a parsing bug");
  assert.ok(doublers < makers / 5, `${doublers} token doublers against ${makers} token makers reads as a false-positive pattern`);
});

check("Grants is not a list of creatures that merely have the keyword", () => {
  const flying = Facets.apply(CARDS, {grants: ["flying"]}, null);
  const withFlying = CARDS.filter((c) => (c.mechanics || []).includes("flying"));
  assert.ok(flying.length > 0 && withFlying.length > flying.length * 3,
    `${flying.length} cards grant flying against ${withFlying.length} that have it — the grant rule is not discriminating`);
});

check("Extends is a subset of Grants: you cannot spread what you do not give", () => {
  const wrong = CARDS.filter((c) => (c.extends || []).some((q) => q !== "keywords" && !(c.grants || []).includes(q)));
  assert.deepEqual(wrong.slice(0, 5).map((c) => c.name), [],
    `${wrong.length} cards extend a quality they do not grant`);
});

console.log(`crankmagic-facets: ${checks} checks passed · ${Facets.available(null).length} card facets over ${CARDS.length} cards`);
