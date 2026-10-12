/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* EVERY BREAK STILL BREAKS SOMETHING (game/tools/batch/anchors.py).
 *
 * A break finds an exact text in a file and changes it; a suite must then fail (game/tools/batch/breaks.py). When a later
 * merge moves that text, the break finds nothing, changes nothing and proves nothing -- and no suite says so, because
 * breaks.py runs only when someone runs it. Waves 4a and 4b found 60 such breaks across 25 files, each by hand. This suite
 * reads every breaks file in the repository and holds each anchor to being found once, and only once, so a lane that
 * moves another's anchor sees it in its own run, not two merges later.
 *
 * It runs no suite and breaks nothing: it reads files. A fixture of each problem proves the check reports it.
 */
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {mkdtempSync, mkdirSync, writeFileSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {fileURLToPath} from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const tool = join(root, "game/tools/batch/anchors.py");
let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks += 1; };
const eq = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks += 1; };

/* The tool's summary for a root, and whether it passed. */
function scan(at) {
  try {
    return {passed: true, ...JSON.parse(execFileSync("python3", ["-I", tool, at], {encoding: "utf8"}))};
  } catch (error) {
    if (typeof error.stdout !== "string" || !error.stdout.trim().startsWith("{")) throw error;
    return {passed: false, ...JSON.parse(error.stdout)};
  }
}

// The repository: every break's anchor found once.
const repo = scan(root);
const named = (p) => `${p.kind}: ${p.file}${p.label ? ` "${p.label}"` : ""}${p.target ? ` in ${p.target}` : ""}${p.found !== undefined ? ` (found ${p.found} times)` : ""}${p.suite ? ` ${p.suite}` : ""}`;
eq(repo.problems.map(named), [], "a break whose anchor is not found exactly once changes nothing, or breaks.py refuses it: re-anchor it on the code it was written for and prove it caught again");
ok(repo.passed, "the tool passes when nothing is reported");
ok(repo.files >= 40, `every breaks file is read, under game/tools/batch and tools (read ${repo.files})`);
ok(repo.breaks >= 1000, `every break in them is checked (checked ${repo.breaks})`);

// A fixture of each problem, each reported, and nothing else.
const fixture = mkdtempSync(join(tmpdir(), "anchors-"));
try {
  mkdirSync(join(fixture, "game/tools/batch"), {recursive: true});
  mkdirSync(join(fixture, "tools"), {recursive: true});
  mkdirSync(join(fixture, "tests"), {recursive: true});
  writeFileSync(join(fixture, "tests/real.mjs"), "");
  writeFileSync(join(fixture, "code.mjs"), "const once = 1;\nconst twice = 2;\nconst twice = 2;\n");
  writeFileSync(join(fixture, "game/tools/batch/breaks-fixture.py"), [
    "SUITES = ['tests/real.mjs', 'tests/gone.mjs']",
    "BREAKS = [",
    "    ('found once', 'code.mjs', 'const once = 1;', 'const once = 0;'),",
    "    ('found nowhere', 'code.mjs', 'const moved = 3;', 'const moved = 0;'),",
    "    ('found twice', 'code.mjs', 'const twice = 2;', 'const twice = 0;'),",
    "    ('no change', 'code.mjs', 'const once = 1;', 'const once = 1;'),",
    "    ('no file', 'gone.mjs', 'x', 'y'),",
    "    ('bad shape', 'code.mjs'),",
    "]",
    "",
  ].join("\n"));
  // A breaks file by another name, in tools/: read too (train-b6-breaks.py's three stale anchors went unseen this way).
  writeFileSync(join(fixture, "tools/other-breaks.py"), "SUITES = []\nBREAKS = [('elsewhere', 'code.mjs', 'const elsewhere = 4;', '')]\n");
  // A Python file that assigns no BREAKS is no breaks file.
  writeFileSync(join(fixture, "tools/helper.py"), "VALUE = 1\n");
  const seen = scan(fixture);
  ok(!seen.passed, "the tool fails when anything is reported");
  eq(seen.files, 2, "both breaks files read, the helper not");
  eq(seen.breaks, 7, "every entry counted");
  eq(seen.problems.map((p) => [p.kind, p.label ?? p.suite ?? p.entry?.slice(0, 13)]).sort(), [
    ["bad shape", "('bad shape',"],
    ["no change", "no change"],
    ["no file", "no file"],
    ["no suite", "tests/gone.mjs"],
    ["not once", "elsewhere"],
    ["not once", "found nowhere"],
    ["not once", "found twice"],
  ].sort(), "each problem reported, the sound break not");
  eq(seen.problems.filter((p) => p.kind === "not once").map((p) => p.found).sort(), [0, 0, 2], "how many times each was found");
} finally {
  rmSync(fixture, {recursive: true, force: true});
}

console.log(`engine-breaks-anchors: ${checks} checks passed — ${repo.files} breaks files, ${repo.breaks} breaks, every anchor found once`);
