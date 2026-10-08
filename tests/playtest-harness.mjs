/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* THE HARNESS NOTE NAMES ONLY WHAT THE PAGE HAS (docs/playtest-harness.md; docs/plan-to-done-2026-09-30.md, M8 and
 * G-C). Grok Bot's agents drive the real lobby and board by the hooks the note names -- a data-action, a data-*
 * attribute and its values, an element id, a class -- so a hook renamed in the page and not in the note sends an
 * agent clicking at nothing. Every hook the note names in code is looked for here in the page's own code (the lobby,
 * crankmagic-table.js; the board, crankmagic-board.js; the controls the app lends them, crankmagic-app.js), and every
 * control and id in a suite or a journey that uses it, so a rename breaks a test before it breaks an agent. So do the
 * files the note points an agent at. */
import assert from "node:assert/strict";
import {existsSync, readFileSync, readdirSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (f) => readFileSync(path.join(ROOT, f), "utf8");
let checks = 0;
const ok = (c, m) => {assert.ok(c, m); checks += 1;};

const note = read("docs/playtest-harness.md");
const PAGE = ["crankmagic-board.js", "crankmagic-table.js", "crankmagic-app.js"].map(read).join("\n");
const SELF = path.basename(fileURLToPath(import.meta.url));
const TESTS = ["tests", "tests/uat"].flatMap((dir) => readdirSync(path.join(ROOT, dir)).filter((f) => f.endsWith(".mjs") && f !== SELF).map((f) => read(`${dir}/${f}`))).join("\n");

/* What the note names in code: the spans between backticks. */
const spans = [...note.matchAll(/`([^`\n]+)`/g)].map((m) => m[1]);
const quoted = (v) => PAGE.includes(`"${v}"`) || PAGE.includes(`'${v}'`);
/* An attribute the page sets in script (`host.dataset.phone = ...`) is drawn too. */
const dataset = (name) => `dataset.${name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())}`;

/* Controls: `data-action=board-pass`, or a lobby action named bare (`table-invite`). Each is a data-action the page
   draws (a quoted name: the board draws some through a helper, b("OK", "board-went-close")), and a test presses it. */
const actions = new Set(spans.flatMap((s) => [...s.matchAll(/data-action=([a-z][a-z-]*)/g)].map((m) => m[1]).concat(/^(table|board)-[a-z-]+$/.test(s) ? [s] : [])));
ok(actions.size >= 30, `the note names the lobby's and the board's controls (${actions.size})`);
/* Drawn, not merely handled: `actions["board-pass"]` is the handler, and a button renamed away from it leaves the
   handler behind. */
const drawn = (a) => PAGE.includes(`data-action="${a}"`) || PAGE.split(`"${a}"`).length - 1 > PAGE.split(`actions["${a}"]`).length - 1;
for (const a of actions) {
  ok(drawn(a), `the control ${a} is one the page draws`);
  /* Pressed by its action, or by the class the page gives that one control (`.cm-mat-pick` for table-mat-pick). */
  ok(TESTS.includes(a) || TESTS.includes(`.cm-${a.replace(/^(table|board)-/, "")}`), `the control ${a} is pressed or read by a suite or a journey`);
}

/* Element ids: `#cm-board-decision`. */
const ids = new Set(spans.flatMap((s) => [...s.matchAll(/#(cm-[a-z-]+)/g)].map((m) => m[1])));
for (const id of ids) {
  ok(PAGE.includes(`id="${id}"`) || quoted(id), `the element #${id} is one the page has`);
  ok(TESTS.includes(id), `the element #${id} is used by a suite or a journey`);
}

/* Classes: `.cm-board-turn`, `section.cm-board-went`. */
const classes = new Set(spans.flatMap((s) => [...s.matchAll(/\.(cm-[a-z-]+|is-[a-z-]+)/g)].map((m) => m[1])));
for (const c of classes) ok(PAGE.includes(c), `the class ${c} is one the page draws`);

/* Attributes and their values: `[data-drag=rows]`, `[data-zone=battlefield|lands|...]`, `data-view`, `input[data-board-amount=<n>]`.
   A value the note names is drawn as that attribute's value, or as a quoted value the page builds the attribute from. */
const attributes = new Map();
for (const s of spans) for (const m of s.matchAll(/(data-[a-z-]+)(?:=([a-z|]+))?/g)) {
  if (m[1] === "data-action") continue;
  const values = attributes.get(m[1]) ?? new Set();
  for (const v of (m[2] ?? "").split("|").filter(Boolean)) values.add(v);
  attributes.set(m[1], values);
}
for (const [name, values] of attributes) {
  ok(PAGE.includes(name) || PAGE.includes(dataset(name)), `the attribute ${name} is one the page draws`);
  /* A value built from a label (data-zone="${label.toLowerCase()}") is drawn from that label. */
  const titled = (v) => quoted(v[0].toUpperCase() + v.slice(1));
  for (const v of values) ok(PAGE.includes(`${name}="${v}"`) || quoted(v) || titled(v), `the page draws ${name}=${v}`);
}

/* Roles: `role=status`. */
for (const s of spans) for (const [, role] of s.matchAll(/^role=([a-z]+)$/g)) ok(PAGE.includes(`role="${role}"`), `the page has role=${role}`);

/* The files the note points an agent at. */
const files = spans.filter((s) => /^(tests|game|docs)\/[\w./-]+\.(mjs|md)$|^[\w-]+\.(js|csv|html)$/.test(s));
ok(files.length >= 8, `the note points at its suites, journeys and documents (${files.length})`);
for (const f of files) {
  const at = [f, `docs/uat/${f}`, `cloud/${f}`, `cloud/public/${f}`].find((p) => existsSync(path.join(ROOT, p)));
  ok(at, `the note's ${f} is there`);
}

console.log(`playtest-harness: ${checks} checks passed -- every control, id, class, attribute and file the harness note names is in the page or the repository, and every control and id is used by a test`);
