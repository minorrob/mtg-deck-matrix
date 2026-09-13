/* The geometry pass, wired into `bash runtests.sh`.
 *
 * tests/uat/geometry.mjs holds the checks; this file finds a browser, serves the repo on
 * an ephemeral port, and runs them. It is here rather than only in tests/uat/ because a
 * check that lives in a directory nothing runs is a check nobody performs -- which was
 * the finding this closes.
 *
 * WHEN THERE IS NO BROWSER it prints SKIPPED and exits 0. A contributor with a plain Node
 * install must not see a red suite for a dependency the repo does not declare. That is a
 * real hole, so it is a loud line rather than a silent pass, and .github/workflows/tests.yml
 * installs Chromium precisely so that CI never takes this branch. Set GEOMETRY_REQUIRED=1
 * to turn the skip into a failure.
 */
import assert from "node:assert/strict";
import {geometryPass} from "./uat/geometry.mjs";
import {openBrowser} from "./uat/browser-runner.mjs";

const VERBOSE = process.env.GEOMETRY_VERBOSE === "1";

/* The browser, the server and the skip live in tests/uat/browser-runner.mjs, shared with
   the page budget; GEOMETRY_REQUIRED=1 turns a missing browser into a failure. */
const {browser, base, stub, close} = await openBrowser({name: "browser-geometry", flag: "GEOMETRY_REQUIRED"});

try {
  const {checks, failures} = await geometryPass({
    browser, base, stub,
    log: VERBOSE ? (line) => process.stdout.write(line + "\n") : () => {},
  });
  assert.deepEqual(failures, [],
    `the layout is wrong at ${failures.length} place(s):\n  ` + failures.join("\n  "));
  console.log(`browser-geometry: ${checks} checks passed — no sideways scroll, no tap target under 32px and no header overlap at 320, 375, 390, 430, 768 or 1400.`);
} finally {
  await close();
}
