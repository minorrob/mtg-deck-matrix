/* A REAL GAME, DRIVEN AND PHOTOGRAPHED, SO THE BOARD CAN BE JUDGED.
 *
 * Three pieces of Stage B sat blocked for a week on one sentence: "cannot be judged without cards
 * on screen." The CSS-shape suites check that a rule exists and says the right thing; they cannot
 * see that the hand ended up 500px below the fold, or that the center counter landed on a player's
 * own name. Both of those were found the first time this ran, and neither was visible any other
 * way.
 *
 *   node game/tools/qa-pod.mjs --out shots/ [--port 8768] [--turns 3] [--width 1920] [--height 1080]
 *
 * It starts a pod against the NATIVE Forge AI, so it spends no API tokens; plays until the turn
 * counter reaches --turns by clicking whatever the board is waiting on; writes the screenshots and
 * a measurement of the board's geometry; and closes the game. The close is in a finally, because a
 * harness that leaves an engine running is worse than no harness.
 *
 * TWO THINGS THE HOST REQUIRES that are easy to miss from outside a browser: the session token
 * from /api/setup as X-Commander-Token, and an Origin header matching the host's own origin. Both
 * come back as "Invalid local session" and neither says which one is missing.
 *
 * Run it against a SECOND host on a spare port rather than the one in use, unless the one in use
 * is idle: starting a pod here ends whatever game was running there.
 */
import {createRequire} from "node:module";
import {mkdirSync, writeFileSync} from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const argv = new Map();
for (let i = 2; i < process.argv.length; i += 2) argv.set(process.argv[i].replace(/^--/, ""), process.argv[i + 1]);
const out = argv.get("out");
if (!out) { console.error("qa-pod: --out <directory> is required"); process.exit(2); }
const port = Number(argv.get("port") || 8768);
const turns = Number(argv.get("turns") || 3);
const width = Number(argv.get("width") || 1920);
const height = Number(argv.get("height") || 1080);
const HOST = `http://127.0.0.1:${port}`;
mkdirSync(out, {recursive: true});

const {chromium} = require(process.env.UAT_PLAYWRIGHT || "playwright");
let token = "";
const post = async (route, body) => {
  const response = await fetch(HOST + route, {method: "POST",
    headers: {"content-type": "application/json", "X-Commander-Token": token, Origin: HOST},
    body: JSON.stringify(body)});
  const text = await response.text();
  if (!response.ok) throw new Error(`${route} ${response.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
};

const setup = await fetch(HOST + "/api/setup").then((r) => r.json());
token = setup.token;
/* The host's own defaults are the pod worth photographing: whatever Rob last set up. Only the AI
   provider is forced, so a QA run never bills anything. */
const config = {...setup.defaults, aiProvider: "native", aiModel: null,
  seats: setup.defaults.seats.map((s) => (s.kind === "ai" ? {...s, aiProvider: null, aiModel: null} : s))};
console.log(`qa-pod: ${config.humans} human + ${config.ais} AI, preparing decks…`);
const prepared = await post("/api/prepare", config);
await post("/api/start", {id: prepared.id});
console.log("qa-pod: engine started");

let browser = null;
try {
  browser = await chromium.launch({executablePath: process.env.UAT_CHROME});
  const page = await browser.newPage({viewport: {width, height}});
  const clips = [], errors = [];
  page.on("response", (r) => { if (r.url().includes("/audio/") && !r.url().endsWith(".json")) clips.push(r.url().split("/audio/")[1]); });
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(HOST + "/review", {waitUntil: "domcontentloaded"});
  await page.waitForTimeout(3000);
  await page.evaluate(() => document.getElementById("game-setup")?.close());
  await page.mouse.click(Math.round(width / 2), Math.round(height / 2));   /* arms the audio, as a player does */

  let turn = 0;
  for (let i = 0; i < 200 && turn < turns; i += 1) {
    await page.waitForTimeout(1200);
    turn = await page.evaluate(() => {
      /* Whatever the board is waiting on. Nothing here chooses a play -- the point is to reach a
         board with cards on it, not to play well. */
      const wanted = /^(Keep|OK|Pass|Continue|Done|Yes|Auto|Resolve|Next|Start with)/;
      for (const b of document.querySelectorAll("button")) {
        if (b.offsetParent && !b.disabled && wanted.test(b.textContent.trim())) b.click();
      }
      return Number(document.body.innerText.match(/Turn (\d+)/)?.[1] || 0);
    });
  }
  console.log(`qa-pod: reached turn ${turn}`);
  await page.waitForTimeout(2000);

  await page.screenshot({path: path.join(out, "board.png")});
  const table = await page.locator(".table").first().boundingBox();
  if (table) await page.screenshot({path: path.join(out, "table.png"), clip: table});

  /* The measurements a screenshot cannot be argued with about. */
  const geometry = await page.evaluate(() => {
    const box = (sel) => { const e = document.querySelector(sel); const r = e?.getBoundingClientRect(); return r ? {x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height)} : null; };
    return {
      viewport: {w: innerWidth, h: innerHeight},
      seats: [...document.querySelectorAll(".seat")].map((e) => {
        const r = e.getBoundingClientRect();
        return {w: Math.round(r.width), h: Math.round(r.height), ratio: +(r.width / r.height).toFixed(3), cards: e.querySelectorAll(".card").length};
      }),
      counter: box(".table-counter"), hand: box(".hand"), table: box(".table"),
      turn: document.body.innerText.match(/Turn \d+[^\n]*/)?.[0] || null,
    };
  });
  /* "Below the fold" is the one that matters and the one nobody thinks to check: a card is dragged
     from the hand onto a mat, so a hand off screen is not a cosmetic problem. */
  const fold = geometry.hand && geometry.hand.y + geometry.hand.h > geometry.viewport.h
    ? `HAND OVERFLOWS THE FOLD by ${Math.round(geometry.hand.y + geometry.hand.h - geometry.viewport.h)}px`
    : "hand fits above the fold";
  const report = {...geometry, fold, audioClips: [...new Set(clips)], pageErrors: errors};
  writeFileSync(path.join(out, "geometry.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({fold, seats: geometry.seats, counter: geometry.counter, hand: geometry.hand,
    audioClips: report.audioClips, pageErrors: errors.length}, null, 1));
  console.log(`qa-pod: wrote ${out}/board.png, ${out}/table.png, ${out}/geometry.json`);
} finally {
  await browser?.close().catch(() => {});
  await post("/api/close-game", {}).catch((e) => console.error("qa-pod: could not close the game —", e.message));
  console.log("qa-pod: game closed");
}
