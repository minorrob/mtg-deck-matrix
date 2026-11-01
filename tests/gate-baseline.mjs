/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* THE KNOWN-RED BASELINE AND ITS COMPARATOR (tools/gate-compare.mjs, tools/gate/known-red-main.json), ROB-377.
 *
 * The merge records here say "the bar was no new failure against main, not green" (ROB-334: 19 failing, every one also failing on
 * main). That is a claim a session made by hand: the Actions suites job is cancelled at its 60-minute cap (ROB-234), 14 to 21
 * suites are red on a clean main, and the sources disagree on the count. This suite holds the thing that makes the claim a
 * computation, and holds it to what AGENTS.md asks of every test -- it goes red when what it tests is broken:
 *
 *   1. The run's output is read the way tools/run-suites.mjs writes it: a FAILED line, and "FAIL <file>" lines in quiet mode.
 *   2. The comparison, on planted cases: a failure the baseline does not list is NEW (and blocks); a listed failure is OLD; a listed
 *      suite that passes is FIXED (so its entry is removed); a listed failure past its expiry is EXPIRED (and blocks); an entry for
 *      the other environment is not judged, and its suite failing here is NEW; a flake that passes is not FIXED.
 *   3. The baseline's own rules: every entry names a suite that exists, a known category, a cause, a Linear issue, a first-seen date
 *      and an expiry after it, an unknown cause stands only a week, and no suite is listed twice -- each broken in turn on a copy.
 *   4. The committed baseline, against those rules, above a floor so an emptied file fails.
 */
import assert from "node:assert/strict";
import {existsSync, readFileSync} from "node:fs";
import {parseFailures, compare, validateBaseline, readBaseline, CATEGORIES} from "../tools/gate-compare.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };
const names = (rows) => rows.map((x) => x.suite);

/* ---- 1. reading a run ---- */
const loud = `
===== tests/a.mjs =====
ok
===== tests/b.mjs =====
boom

slowest: tests/b.mjs 3 s; 1.2 minutes, 3 at a time
FAILED: tests/b.mjs game/tests/c.test.mjs tests/b.mjs
`;
eq(parseFailures(loud), ["game/tests/c.test.mjs", "tests/b.mjs"], "the FAILED line is read, deduplicated and sorted");
const quiet = `  ok   tests/a.mjs\n  FAIL tests/z.mjs\nsome output\n  FAIL tests/y.mjs (stopped after 20 minutes)\n  ok   tests/x.mjs\n`;
eq(parseFailures(quiet), ["tests/y.mjs", "tests/z.mjs"], "quiet mode's FAIL lines are read, with the stop note ignored");
eq(parseFailures("12 suites passed.\n"), [], "a clean run has no failures");
eq(parseFailures(""), [], "an empty run has no failures");

/* ---- 2. comparing ---- */
const entry = (suite, extra = {}) => ({suite, category: "stale-anchor", cause: "its anchors were written for an older layout", issue: "ROB-250", firstSeen: "2026-10-29", expires: "2026-12-01", ...extra});
const baseOf = (...entries) => ({schema: "crankmagic.known-red@1", asOf: "2026-11-01", entries});
const cmp = (failing, base, env = "actions", today = "2026-11-01") => compare({failing, baseline: base, today, env});

let r = cmp(["tests/old.mjs", "tests/brand-new.mjs"], baseOf(entry("tests/old.mjs"), entry("tests/fixed.mjs")));
eq(names(r.new), ["tests/brand-new.mjs"], "a failure the baseline does not list is NEW");
eq(names(r.old), ["tests/old.mjs"], "a listed failure is OLD");
eq(names(r.fixed), ["tests/fixed.mjs"], "a listed suite that now passes is FIXED");
ok(r.ok === false, "a NEW failure blocks the merge");
r = cmp(["tests/old.mjs"], baseOf(entry("tests/old.mjs")));
ok(r.ok === true && r.new.length === 0 && r.expired.length === 0, "only OLD failures: nothing new, the merge is not blocked");
r = cmp(["tests/stale.mjs"], baseOf(entry("tests/stale.mjs", {expires: "2026-10-31"})));
eq(names(r.expired), ["tests/stale.mjs"], "a listed failure past its expiry is EXPIRED");
ok(r.ok === false, "an EXPIRED entry blocks until it is fixed, retired or re-approved");
r = cmp(["tests/stale.mjs"], baseOf(entry("tests/stale.mjs", {expires: "2026-11-01"})));
ok(r.ok === true, "an entry is good through its expiry date");

/* the environment is part of the answer */
const container = entry("tests/container.mjs", {category: "container-toolchain", onlyIn: "container"});
const actions = entry("tests/actions.mjs", {category: "test-drift", onlyIn: "actions"});
r = cmp(["tests/container.mjs"], baseOf(container), "container");
eq(names(r.old), ["tests/container.mjs"], "a container-only entry failing in the container is OLD");
r = cmp(["tests/container.mjs"], baseOf(container), "actions");
eq(names(r.new), ["tests/container.mjs"], "a container-only suite failing on Actions is NEW: it should pass there");
ok(/container/.test(r.new[0].reason), "and the reason says why");
r = cmp([], baseOf(container, actions), "actions");
eq(names(r.skipped), ["tests/container.mjs"], "a container-only entry is not judged on Actions");
eq(names(r.fixed), ["tests/actions.mjs"], "an Actions entry that passes on Actions is FIXED");
r = cmp([], baseOf(container, actions), "container");
eq(names(r.skipped), ["tests/actions.mjs"], "an Actions-only entry is not judged in the container");
eq(names(r.fixed), ["tests/container.mjs"], "a container entry that passes in the container is FIXED");
r = cmp([], baseOf(entry("tests/flaky.mjs", {category: "flake"})));
eq(names(r.skipped), ["tests/flaky.mjs"], "a flake that passes this run is not FIXED");
eq(r.fixed, [], "and nothing is removed because it passed once");
r = cmp(["tests/flaky.mjs"], baseOf(entry("tests/flaky.mjs", {category: "flake"})));
eq(names(r.old), ["tests/flaky.mjs"], "a flake that fails is OLD");

/* ---- 3. the baseline's own rules, each broken on a copy ---- */
const planted = baseOf(entry("tests/old.mjs"), entry("tests/other.mjs", {category: "unknown", expires: "2026-11-08"}));
const problems = (mutate) => { const copy = JSON.parse(JSON.stringify(planted)); mutate(copy); return validateBaseline(copy, {suiteExists: () => true}); };
eq(problems(() => {}), [], "the planted baseline is valid");
ok(problems((b) => { b.entries[0].issue = ""; }).some((p) => /issue/.test(p)), "an entry with no Linear issue is refused");
ok(problems((b) => { b.entries[0].issue = "fix later"; }).some((p) => /issue/.test(p)), "an issue that is not a ROB key is refused");
ok(problems((b) => { b.entries[0].category = "whatever"; }).some((p) => /category/.test(p)), "an unknown category name is refused");
ok(problems((b) => { b.entries[0].cause = " "; }).some((p) => /cause/.test(p)), "an entry with no cause is refused");
ok(problems((b) => { b.entries[0].firstSeen = "yesterday"; }).some((p) => /firstSeen/.test(p)), "a first-seen that is not a date is refused");
ok(problems((b) => { b.entries[0].expires = "2026-10-01"; }).some((p) => /expires/.test(p)), "an expiry before the first-seen date is refused");
ok(problems((b) => { b.entries[0].expires = undefined; }).some((p) => /expires/.test(p)), "an entry with no expiry is refused");
ok(problems((b) => { b.entries.push(entry("tests/old.mjs")); }).some((p) => /twice/.test(p)), "a suite listed twice is refused");
ok(problems((b) => { b.entries[0].onlyIn = "somewhere"; }).some((p) => /onlyIn/.test(p)), "an onlyIn that is not actions or container is refused");
ok(problems((b) => { b.entries[1].expires = "2026-11-09"; }).some((p) => /unknown cause/.test(p)), "an unknown cause that stands longer than a week is refused");
ok(problems((b) => { b.entries[0].expires = "2026-12-31"; }).length === 0, "a known cause may stand longer than a week");
ok(validateBaseline(JSON.parse(JSON.stringify(planted)), {suiteExists: (s) => s !== "tests/old.mjs"}).some((p) => /exist/.test(p)), "a suite that does not exist is refused");
ok(validateBaseline({schema: "other", entries: []}, {suiteExists: () => true}).some((p) => /schema/.test(p)), "the wrong schema is refused");
ok(validateBaseline({schema: "crankmagic.known-red@1"}, {suiteExists: () => true}).some((p) => /entries/.test(p)), "a file with no entries list is refused");

/* ---- 4. the committed baseline ---- */
const committed = readBaseline();
const bad = validateBaseline(committed, {suiteExists: (s) => existsSync(new URL("../" + s, import.meta.url))});
eq(bad, [], "the committed baseline passes every rule above");
ok(committed.entries.length >= 10, `the committed baseline lists ${committed.entries.length} suites; an emptied file must fail (floor 10)`);
ok(committed.entries.every((e) => CATEGORIES.includes(e.category)), "every committed category is a known one");
ok(typeof committed.basis === "string" && committed.basis.length > 40, "the file says what it was measured on and how sure that is");
/* The comparator reads the committed file: dropping one entry turns that suite's failure into a NEW one. */
const some = committed.entries.find((e) => !e.onlyIn);
const without = {...committed, entries: committed.entries.filter((e) => e !== some)};
eq(names(cmp([some.suite], without, "actions", committed.asOf).new), [some.suite], "removing a committed entry makes its failure NEW");
eq(cmp([some.suite], committed, "actions", committed.asOf).new, [], "with the entry present the same failure is not new");
/* Every committed entry fails as itself, in the environment it names: nothing in the file is unreachable. */
for (const e of committed.entries) {
  const env = e.onlyIn || "actions";
  eq(cmp([e.suite], committed, env, committed.asOf).new, [], `${e.suite} failing in ${env} is not new`);
}
/* The README names the tool, because a tool nobody knows to run is a tool nobody runs. */
ok(readFileSync(new URL("../README.md", import.meta.url), "utf8").includes("`tools/gate-compare.mjs`"), "README.md names tools/gate-compare.mjs");

console.log(`gate-baseline: ${checks} checks passed.`);
