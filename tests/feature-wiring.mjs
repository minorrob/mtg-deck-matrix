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

/* M-11. No tracked text file carries U+FFFD. The replacement character is what a decoder writes
   when bytes were read in the wrong encoding; committed, it is a corrupted word shipped to every
   reader (the tab title read "CrankMagic", the replacement character, "Commander workshop" for
   three days). This file spells the character by its code so it does not flag itself. */
{
  const {execFileSync} = await import("node:child_process");
  const tracked = execFileSync("git", ["ls-files", "--", "*.html", "*.js", "*.mjs", "*.css", "*.md", "*.json"], {cwd: ROOT, encoding: "utf8"}).split(/\r?\n/).filter(Boolean);
  const corrupted = tracked.filter((f) => readFileSync(path.join(ROOT, f), "utf8").includes(String.fromCharCode(0xFFFD)));
  eq(corrupted, [], `these tracked files carry U+FFFD, a decoding error committed as text: ${corrupted.join(", ")}`);
  ok(tracked.length > 100, `the tracked-file list is real (${tracked.length} files)`);
}

/* B-20, M-14, M-16, P-05: the small UAT fixes, held by reading the source. */
{
  const decks = read("crankmagic-decks.js"), app = read("crankmagic-app.js");
  ok(/primary=readyN>0\?'pull':ready\.toBuy>0\?'buy':'log'/.test(decks), "the deck header's primary follows the deck's state (B-20)");
  ok(/M\.localDate\(g\.at\)/.test(decks) && /\blocalDate\b/.test(read("collection-model.js")), "a game's date is read as a local calendar date (P-05)");
  ok(/paidOrList\/wins/.test(decks), "paid per win divides the figure the Cost panel shows (P-05)");
  ok(/closeBtn\.focus\(\{preventScroll:true\}\);dialog\.scrollTop=0/.test(app), "a dialog opens at the top with focus on its close button (M-14)");
  ok(/hashchange[\s\S]{0,400}stale\.hidden=true/.test(app), "a notice is hidden when the route changes (M-16)");
  for (const [f, rule] of [["crankmagic.css", /#cm-dialog\{[^}]*overflow:hidden auto/], ["crankmagic-design.css", /dialog\.v-dialog\{[^}]*overflow:hidden auto/]]) ok(rule.test(read(f)), `${f}: the dialog never scrolls sideways (M-13)`);
  for (const f of ["index.html", "crankmagic.html"]) ok(/<div class="v-nav-track"><nav class="v-nav-links"/.test(read(f)) && /<\/nav><\/div><div class="cm-nav-note"/.test(read(f)), `${f}: the sticky nav lives in its own track above the note (M-12)`);
}

console.log(`feature-wiring: ${checks} checks passed — ${features.length} feature files read; dialogs bound, help entries titled, dates local, compare picks in memory.`);
