/* THE GUIDED TOUR'S CONTENT, HELD HONEST.
 *
 * A tour is content, and content rots differently from code: nothing throws when a step
 * points at a view that was renamed, or when a tour quietly loses the sentence that is the
 * whole reason it exists. The failure is silent and the symptom is a reader learning the
 * wrong thing.
 *
 * So this reads the real TOURS array out of crankmagic-tour.js and asserts the properties
 * that make a tour a tour. It cannot prove a selector MATCHES -- that needs the app running
 * with data, and tests/uat/journeys.mjs does it by walking every step in a browser and
 * asserting the layer's data-tour-hit is never "none". This is the cheap half: structure,
 * copy, and the promise each tour makes.
 */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

let checks = 0;
const ok = (label, fn) => {fn(); checks += 1; process.stdout.write(`  ok  ${label}\n`);};

const source = readFileSync(new URL("../crankmagic-tour.js", import.meta.url), "utf8");

/* The module is a CrankFeatures registration, so it cannot simply be imported: it wants a
   DOM and a `C`. The TOURS array is a pure literal, so slice it out and evaluate that alone
   -- the real text, not a copy, so editing a tour changes what this runs. */
const start = source.indexOf("const TOURS=[");
assert.ok(start > 0, "TOURS is not where this test expects it in crankmagic-tour.js");
const end = source.indexOf("\n\n/* A tour that describes work on a deck", start);
assert.ok(end > start, "the end of the TOURS literal moved");
const literal = source.slice(start + "const TOURS=".length, end).trim().replace(/;$/, "");
/* The literal names the helpers it uses, so they are bound here as stand-ins. `firstDeck`
   reads live state in the app; here it only has to be callable, because what this test
   checks about a params function is that it IS one. */
// eslint-disable-next-line no-new-func
const TOURS = new Function("firstDeck", `return ${literal}`)(() => ({deck: "example"}));

/* The views the router actually registers. Read from the modules rather than listed here,
   so renaming a view breaks this test instead of silently orphaning a tour step. */
const VIEWS = new Set();
for (const file of ["crankmagic-decks.js", "crankmagic-collection.js", "crankmagic-lab.js", "crankmagic-discover.js"]) {
  const text = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
  for (const m of text.matchAll(/views\.([a-z]+)\s*=/g)) VIEWS.add(m[1]);
}

ok("every use case the tour promises to cover is present", () => {
  assert.equal(TOURS.length, 7, "seven journeys were specified in design/crankmagic/tour-plan.md");
  const ids = TOURS.map((t) => t.id);
  assert.deepEqual([...new Set(ids)], ids, "two tours share an id, so the chooser cannot tell them apart");
  for (const id of ["build", "refine", "discover", "collect", "perform", "acquire", "portable"]) {
    assert.ok(ids.includes(id), `the "${id}" journey is missing`);
  }
});

ok("the router knows every view a step navigates to", () => {
  assert.ok(VIEWS.size >= 4, `only found ${VIEWS.size} registered views; the scan is broken, not the tours`);
  for (const tour of TOURS) {
    for (const step of tour.steps) {
      assert.ok(VIEWS.has(step.view),
        `${tour.id}: step "${step.title}" goes to view "${step.view}", which no module registers`);
    }
  }
});

ok("every selector is one the browser can actually parse", () => {
  /* A typo in a selector throws inside querySelector at tour time, which surfaces as a step
     that silently points at nothing. Cheaper to catch here. */
  for (const tour of TOURS) {
    for (const step of tour.steps) {
      assert.ok(step.selectors.length, `${tour.id}: step "${step.title}" has no selectors`);
      for (const selector of step.selectors) {
        assert.doesNotThrow(() => new Function(`"use strict"; return ${JSON.stringify(selector)}`)(),
          `${tour.id}: selector ${selector} is not a string`);
        assert.match(selector, /^[#.[\]a-zA-Z0-9_=\-\s,>:()]+$/,
          `${tour.id}: selector ${selector} has characters no CSS selector carries`);
      }
    }
  }
});

ok("a step's act names a handler the engine defines", () => {
  const acts = new Set([...source.matchAll(/^\s{2}(\w+)\(\)\{/gm)].map((m) => m[1]));
  for (const tour of TOURS) {
    for (const step of tour.steps.filter((s) => s.act)) {
      assert.ok(acts.has(step.act),
        `${tour.id}: step "${step.title}" calls act "${step.act}", which ACTS does not define`);
    }
  }
});

ok("every tour ends by saying what the reader now has", () => {
  /* This is the feature. A tour that ends with "that is the end of the tour" has taught
     somebody where the buttons are; the sentence below is what teaches them what it was for.
     It is checked for substance, not merely presence -- an empty string would pass a
     truthiness test and fail the reader. */
  for (const tour of TOURS) {
    assert.ok(tour.have && tour.have.length > 60,
      `${tour.id}: the "you now have" sentence is missing or too thin to be worth reading`);
    assert.ok(/[.!]$/.test(tour.have.trim()), `${tour.id}: the "you now have" text is not a finished sentence`);
    assert.ok(tour.promise && tour.promise.length > 10, `${tour.id}: no one-line promise for the chooser card`);
    assert.ok(tour.job && /[.?]$/.test(tour.job.trim()), `${tour.id}: the chooser card does not state the job`);
  }
});

ok("no tour is too short to be worth choosing", () => {
  for (const tour of TOURS) {
    assert.ok(tour.steps.length >= 4,
      `${tour.id} has ${tour.steps.length} steps; fewer than four is a tooltip, not a tour`);
    for (const step of tour.steps) {
      assert.ok(step.title && step.title.length > 3, `${tour.id}: a step has no title`);
      assert.ok(step.copy && step.copy.length > 40, `${tour.id}: step "${step.title}" says too little to help`);
    }
  }
});

ok("a tour that needs a deck says which precondition, and the engine can test it", () => {
  /* Four of the seven describe work on something you have. If `needs` names a key the
     MISSING map or the `has` map does not carry, the tour opens on undefined and throws. */
  const missing = source.slice(source.indexOf("const MISSING="), source.indexOf("const has="));
  const hasMap = source.slice(source.indexOf("const has="), source.indexOf("/* ---", source.indexOf("const has=")));
  for (const tour of TOURS.filter((t) => t.needs)) {
    assert.match(missing, new RegExp(`\\b${tour.needs}\\s*:\\{step:`), `MISSING has no step for "${tour.needs}"`);
    assert.match(missing, new RegExp(`\\b${tour.needs}\\s*:[\\s\\S]{0,900}?have:`),
      `MISSING["${tour.needs}"] has no "have" line, so the tour would end promising something it could not deliver`);
    assert.match(hasMap, new RegExp(`\\b${tour.needs}\\s*:`), `has() cannot test for "${tour.needs}"`);
  }
});

ok("a step that needs a sub-route carries a params function, not a bare view", () => {
  /* Five of "read a deck's performance" describe #decks?deck=<id>. Navigating to bare
     #decks lands on the deck LIST, which renders none of that markup -- so those steps were
     never going to match, deck or no deck, and the browser walk showed exactly that. Any
     step whose selectors are detail-page markup has to carry the params to get there. */
  const DETAIL_ONLY = [".cm-deck-hero", ".cm-stats", ".cm-curve", "[data-action=deck-evidence]", "[data-action=deck-suggestions]"];
  for (const tour of TOURS) {
    for (const step of tour.steps) {
      if (!step.selectors.some((s) => DETAIL_ONLY.includes(s))) continue;
      assert.equal(typeof step.params, "function",
        `${tour.id}: step "${step.title}" points at deck-detail markup but does not navigate to a deck`);
      const out = step.params();
      assert.ok(out && typeof out === "object", `${tour.id}: params() for "${step.title}" returned no object`);
    }
  }
});

ok("the tours reach every part of the app, not just the one they were written for", () => {
  /* Seven journeys that all stayed inside Deck Lab would satisfy every check above. The
     point of the set is coverage of the product. */
  const reached = new Set(TOURS.flatMap((t) => t.steps.map((s) => s.view)));
  for (const view of VIEWS) {
    assert.ok(reached.has(view), `no tour ever visits the "${view}" view`);
  }
});

console.log(`tour: ${checks} checks passed — ${TOURS.length} journeys, ` +
  `${TOURS.reduce((n, t) => n + t.steps.length, 0)} steps, every one ending in what you now have.`);
