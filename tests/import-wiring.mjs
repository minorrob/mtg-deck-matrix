// How the added-deck modules are wired into My Decks.
//
// viewer.js is browser code with no Node harness, and the failures that matter
// here are ones a browser would not throw on: a module tag left out so the
// import button silently does nothing, a preview score recorded as if it were a
// measurement, the master catalog written to in place. Those are all visible in
// the source, so they are checked in the source.
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const read = async (p) => readFile(new URL(p, import.meta.url), "utf8");
const viewer = await read("../viewer.js");
const page = await read("../index.html");
const panel = await read("../import-panel.js");
const store = await read("../deck-store.js");
const css = await read("../viewer.css");

let checks = 0;
const check = (label, fn) => { fn(); checks += 1; void label; };

/* ---------------- the page loads what the page uses ---------------- */

const MODULES = ["lineup-model", "sim-engine", "scryfall-client", "deck-import",
  "deck-sources", "deck-measure", "deck-store", "import-panel"];

check("every module the import path needs is on the page", () => {
  MODULES.forEach((name) => {
    assert.match(page, new RegExp(`src="${name}\\.js`),
      `index.html does not load ${name}.js, so the Add a deck button would do nothing`);
  });
});

check("they load in dependency order, ahead of the page that calls them", () => {
  const at = (name) => page.indexOf(`src="${name}.js`);
  // deck-import requires the lineup model; deck-measure requires the engine.
  assert.ok(at("lineup-model") < at("deck-import"), "the lineup model comes before the parser");
  assert.ok(at("sim-engine") < at("deck-measure"), "the engine comes before the measurement");
  MODULES.forEach((name) => {
    assert.ok(at(name) < at("viewer"), `${name}.js must load before viewer.js`);
  });
});

check("the globals viewer.js reaches for are the ones the modules attach", () => {
  // A rename on either side is silent: the button just reports the tool missing.
  const wanted = viewer.match(/window\.(Mtg[A-Za-z]+)/g) || [];
  const attached = {
    "window.MtgDeckImport": "deck-import.js",
    "window.MtgDeckSources": "deck-sources.js",
    "window.MtgDeckStore": "deck-store.js",
    "window.MtgDeckMeasure": "deck-measure.js",
    "window.MtgImportPanel": "import-panel.js",
    "window.MtgSimEngine": "sim-engine.js",
    "window.MtgScryfall": "scryfall-client.js"
  };
  [...new Set(wanted)].forEach((name) => {
    assert.ok(attached[name], `viewer.js reads ${name}, which nothing on this page defines`);
  });
});

/* ---------------- the master is never written to ---------------- */

check("the workbook's catalog is read, never assigned into", () => {
  // Store.merge copies on write; the guard here is that viewer.js does not
  // reach around it. An import that mutated MASTER would corrupt the six decks
  // for the rest of the session and look fine until a reload.
  const writes = viewer.match(/MASTER\.\w+\s*(=[^=]|\.push\()/g) || [];
  assert.deepEqual(writes, [], `viewer.js writes to the master: ${writes.join(", ")}`);
  assert.match(viewer, /DATA = Store \? Store\.merge\(MASTER, IMPORTS\)/,
    "DATA is the merge of the two, not one of them");
});

check("the merged catalog is rebuilt, and its memos dropped with it", () => {
  // byName caches an index over DATA.cards. Left standing, a card added by an
  // import comes back "not found" from the very row that holds it.
  assert.match(viewer, /function rebuild\(\)[\s\S]{0,400}byName\.index = null/,
    "rebuild must clear the name index");
  assert.match(viewer, /function rebuild\(\)[\s\S]{0,600}state\.deck = DATA\.decks/,
    "rebuild must re-point an open deck page at the new object");
});

/* ---------------- a preview is never recorded ---------------- */

check("only the full protocol is written to the record", () => {
  // preview() renders; runFull() assigns. If preview ever assigned, every
  // imported deck would carry a number a tenth of a point out, which is the
  // size of the gaps between the six.
  const previewBody = panel.slice(panel.indexOf("async function preview()"),
    panel.indexOf("function renderScore("));
  assert.ok(!/record\.measured\s*=/.test(previewBody),
    "the preview must not be stored as the measurement");
  assert.match(panel, /preview: true/, "the preview asks for the preview plan");
  const fullBody = panel.slice(panel.indexOf("async function runFull("));
  assert.match(fullBody, /record\.measured = result/, "the full run is the one recorded");
  assert.ok(!/preview: true/.test(fullBody), "and it does not ask for a preview");
});

check("a deck that is not a hundred cards with a commander is not scored", () => {
  assert.match(panel, /Store\.measurable\(record\)/,
    "the panel gates scoring on the same rule the store states");
  assert.match(viewer, /if \(!Store\.measurable\(record\)\)/,
    "and so does the measure-it-later button");
  assert.match(store, /function problems\(record\)/);
});

/* ---------------- counts describe what is on screen ---------------- */

check("the ribbon and the tab counts are rebuilt on every render", () => {
  // They were set once at boot, when there were six decks and no way to add one.
  assert.match(viewer, /function render\(\)[\s\S]{0,300}renderCounts\(\)/,
    "render must refresh the counts");
  assert.ok(!/\["6", "decks"\]/.test(viewer), 'the deck count must not be the literal "6"');
  assert.ok(!/\/600/.test(viewer), "the card total must not be the literal 600");
});

check("a rank is computed over the decks that are loaded", () => {
  assert.match(viewer, /function rankOf\(id\)/,
    "a deck page opened straight from a link has never been through orderedDecks");
});

/* ---------------- the panel's own field sizes ---------------- */

check("the panel's fields do not trigger the iOS zoom", () => {
  // iOS zooms a focused field whose text is under 16px and never zooms back, and
  // this panel is the only real form on the page. The rule wins on source order,
  // so nothing may follow it -- the same contract app.css carries.
  const RULE = ".imp-field input, .imp-field textarea { font-size: 16px; }";
  const at = css.lastIndexOf(RULE);
  assert.ok(at > 0, "the 16px phone rule must exist for the import fields");
  const after = css.slice(at + RULE.length);
  assert.ok(!/font-size:/.test(after),
    `no rule may follow it: ${after.trim().slice(0, 80)}`);
});

console.log(`import-wiring: ${checks} checks passed · ` +
  `${MODULES.length} modules loaded ahead of viewer.js`);
