/* HOW LONG DOES THE BOARD MAKE A PERSON WAIT?
 *
 * Rob, 2026-09-21: "helps every player move at the speed they move at (not the speed the computer
 * moves at; e.g. we don't leave users hanging for 5 seconds to wait for a button to enable or
 * appear)."
 *
 * That cannot be fixed while it is a feeling. This turns it into numbers: how often the board
 * actually asks the engine anything, and how long each control spends unusable between one state
 * arriving and the next.
 *
 * READ ONLY. It clicks nothing and sends no action, so it can be pointed at a game in progress
 * without changing it. What it reports is what a person sitting there would experience.
 *
 *   node tools/board-latency.mjs [seconds]
 *
 * Reading from the source first, so the measurements have something to agree or disagree with:
 *   game/ui/review.mjs:804      poll interval 750ms, or 250ms while casts are pending
 *   game/ui/review.mjs:535      a successful action disables the confirm button for 1500ms
 *   game/ui/live-poll.mjs:1     retry backoff 500 x 2^n, capped at 5000ms
 * The third is the only one that reaches five seconds, and it only does so after four consecutive
 * failed reads -- so if the five seconds Rob felt is that cap, the board is erroring, not just
 * slow. Confirming or refuting that is the point.
 */
import {fileURLToPath} from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HOST = process.env.CRANKMAGIC_HOST || "http://127.0.0.1:8768";
const SECONDS = Number(process.argv[2] || 45);

const live = await fetch(`${HOST}/api/live`).then((r) => r.json()).catch(() => null);
if (!live || live.status !== "playing") {
  console.error(`No game is playing on ${HOST} (status: ${live ? live.status : "no answer"}).`);
  console.error("Start one from the lobby first — this measures a board with something on it.");
  process.exit(1);
}
console.log(`Watching match ${live.matchId} for ${SECONDS}s. Read only: no clicks, no actions.\n`);

const runner = await import(new URL("../tests/uat/browser-runner.mjs", import.meta.url).href);
const {browser, close} = await runner.openBrowser({name: "board-latency", flag: "GEOMETRY_REQUIRED"});

try {
  const context = await browser.newContext({viewport: {width: 1600, height: 950}, deviceScaleFactor: 1});
  const page = await context.newPage();

  /* Instrumented before any of the board's own scripts run, so nothing is missed at startup. */
  await page.addInitScript(() => {
    window.__cm = {requests: [], controls: []};
    const real = window.fetch;
    window.fetch = async (...args) => {
      const url = String(args[0] && args[0].url ? args[0].url : args[0]);
      const started = performance.now();
      try {
        const res = await real(...args);
        window.__cm.requests.push({url, started, ended: performance.now(), status: res.status});
        return res;
      } catch (err) {
        window.__cm.requests.push({url, started, ended: performance.now(), status: 0});
        throw err;
      }
    };
    /* Every tenth of a second, write down which controls a person could actually press. A control
       that is absent and one that is present-but-disabled are the same to them, so both count as
       unusable and the report says which it was. */
    const named = () => {
      const out = {};
      for (const b of document.querySelectorAll("button")) {
        const label = (b.textContent || "").trim().replace(/\s+/g, " ").slice(0, 28);
        if (!label) continue;
        if (out[label] === undefined || !out[label]) out[label] = !b.disabled;
      }
      return out;
    };
    setInterval(() => window.__cm.controls.push({at: performance.now(), usable: named()}), 100);
  });

  await page.goto(`${HOST}/review`);
  await page.waitForTimeout(SECONDS * 1000);

  const data = await page.evaluate(() => window.__cm);
  await context.close();

  /* ---- what the board asked the engine, and how often ---- */
  const views = data.requests.filter((r) => /\/api\/game-view|\/match\/view/.test(r.url));
  const gaps = views.slice(1).map((r, i) => Math.round(r.started - views[i].started)).sort((a, b) => a - b);
  const pct = (p) => gaps.length ? gaps[Math.min(gaps.length - 1, Math.floor(gaps.length * p))] : 0;
  const slowest = data.requests.slice().sort((a, b) => (b.ended - b.started) - (a.ended - a.started))[0];
  const failed = data.requests.filter((r) => r.status === 0 || r.status >= 400);

  console.log("THE POLL");
  console.log(`  reads of the game view      ${views.length} in ${SECONDS}s`);
  console.log(`  gap between reads           median ${pct(0.5)}ms · 90th ${pct(0.9)}ms · worst ${gaps[gaps.length - 1] || 0}ms`);
  console.log(`  slowest single request      ${slowest ? Math.round(slowest.ended - slowest.started) + "ms  " + slowest.url.replace(HOST, "") : "none"}`);
  console.log(`  failed or errored reads     ${failed.length}${failed.length ? "  <-- the backoff climbs to 5000ms after four in a row" : ""}`);

  /* ---- how long each control spent unusable ---- */
  const labels = new Set();
  for (const s of data.controls) for (const k of Object.keys(s.usable)) labels.add(k);
  const stalls = [];
  for (const label of labels) {
    let since = null;
    for (const s of data.controls) {
      const usable = s.usable[label] === true;
      if (!usable && since === null) since = s.at;
      if (usable && since !== null) { stalls.push({label, ms: Math.round(s.at - since)}); since = null; }
    }
  }
  const worst = new Map();
  for (const s of stalls) if (!worst.has(s.label) || worst.get(s.label).ms < s.ms) worst.set(s.label, s);

  console.log("\nTIME A CONTROL SPENT UNUSABLE (absent or disabled), longest run each");
  const rows = [...worst.values()].sort((a, b) => b.ms - a.ms).slice(0, 12);
  if (!rows.length) console.log("  nothing changed state in the window — the board was idle");
  for (const r of rows) {
    const flag = r.ms >= 5000 ? "  <-- five seconds or worse" : r.ms >= 2000 ? "  <-- over two seconds" : "";
    console.log(`  ${String(r.ms).padStart(6)}ms  ${r.label}${flag}`);
  }
  console.log(`\n${stalls.length} waits observed. Over 2s: ${stalls.filter((s) => s.ms >= 2000).length}. Over 5s: ${stalls.filter((s) => s.ms >= 5000).length}.`);
  console.log("A wait is only a defect if a person was trying to act during it; this counts them all,");
  console.log("so the labels matter as much as the numbers.");
} finally { await close(); }
void ROOT;
