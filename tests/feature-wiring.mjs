/* FEATURE WIRING, HELD BY READING THE SOURCE.
 *
 * Four defects from the 2026-09-19 walkthrough (docs/app-walkthrough-plan-2026-09-19.md, W.1)
 * shared one shape: a feature file did something the app's plumbing cannot honor, and nothing
 * failed until a person clicked. New deck threw "dialog is not defined" because the decks feature
 * never receives the dialog handle; Play's help printed `undefined` because one entry was a bare
 * string where the registry wants {title, body}; Log a game defaulted to tomorrow because the date
 * was UTC; a compare tick was dropped because a view selection went through the serialized save.
 *
 * A feature file is a CrankFeatures registration that wants a DOM and a `C`, so it is read here
 * rather than run. Each check names the defect it holds shut.
 */
import assert from "node:assert/strict";
import {readFileSync, readdirSync} from "node:fs";
import path from "node:path";
import {ROOT} from "../schema/index.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks++; };
const read = (f) => readFileSync(path.join(ROOT, f), "utf8");
const features = readdirSync(ROOT).filter((f) => /^crankmagic-.*\.js$/.test(f) && f !== "crankmagic-app.js" && f !== "crankmagic-sw.js").sort();

/* D1. A feature that touches `dialog` must have bound it: destructured from C, assigned from
   modal(), or looked up. The app's own dialog lives in crankmagic-app.js and is not exported. */
{
  const unbound = features.filter((f) => {
    const src = read(f);
    /* a method call on it, not the word "dialog." at the end of a sentence in a comment */
    if (!/\bdialog\.(close|showModal|show|open\b|innerHTML|querySelector|scrollTop|setAttribute|addEventListener)/.test(src)) return false;
    return !/(const|let|var)\s*\{[^}]*\bdialog\b[^}]*\}\s*=\s*C\b|(const|let|var)\s+dialog\s*=|\bdialog\s*=\s*(modal|form|C\.\$|\$)\(/.test(src);
  });
  eq(unbound, [], `these features use a dialog they never bound, which throws "dialog is not defined" at the click: ${unbound.join(", ")}`);
}

/* D2. Every help entry is {title, body}: the "?" button reads both. */
{
  const bad = [];
  for (const f of features) {
    for (const m of read(f).matchAll(/\bHELP\.([a-zA-Z]+)\s*=\s*([`'"{])/g)) if (m[2] !== "{") bad.push(`${f}: HELP.${m[1]} is a bare string`);
  }
  eq(bad, [], `a help entry without a title prints "undefined" over the dialog:\n  ${bad.join("\n  ")}`);
  const keys = new Set();
  for (const f of features) for (const m of read(f).matchAll(/\bHELP\.([a-zA-Z]+)\s*=\s*\{/g)) keys.add(m[1]);
  for (const key of ["decks", "deck", "cards", "lab", "discover", "game", "change"]) ok(keys.has(key), `HELP.${key} is registered as an object`);
}

/* D4. A date a person sees is the local calendar date, from one helper. The UTC slice is fine for
   data stamps that are compared across machines (card-catalog.js keeps it); it is wrong for the
   date a game was played, the name of a backup, the date on an export. */
{
  const utc = /new Date\(\)\.toISOString\(\)\.slice\(0, ?10\)/;
  for (const f of ["crankmagic-decks.js", "crankmagic-app.js", "crankmagic-collection.js"]) ok(!utc.test(read(f)), `${f} builds a user-facing date from UTC; use M.today()`);
  ok(/\btoday\b/.test(read("collection-model.js")) && /M\.today\(\)/.test(read("crankmagic-decks.js")), "Log a game defaults to M.today()");
}

/* D9. A compare tick is a view selection, not a library change: it never goes through commit(),
   which refuses a second call while the first is saving and which persists across reloads. */
{
  const advisor = read("crankmagic-advisor.js");
  const handler = /actions\['compare-pick'\]\s*=([^\n]*)/.exec(advisor);
  ok(handler, "the compare-pick handler is in crankmagic-advisor.js");
  ok(!/commit\(/.test(handler[1]), "and it does not commit a preferences command");
  ok(!/preferences\.comparisonPicks/.test(read("crankmagic-decks.js")), "the Decks page reads the picks from memory, not from saved preferences");
}

console.log(`feature-wiring: ${checks} checks passed — ${features.length} feature files read; dialogs bound, help entries titled, dates local, compare picks in memory.`);
