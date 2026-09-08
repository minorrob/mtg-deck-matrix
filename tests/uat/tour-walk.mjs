/* EVERY TOUR STEP POINTS AT SOMETHING.
 *
 * tests/tour.mjs holds the tour's content honest without a browser: seven journeys, every
 * step naming a registered view, every selector parseable, every tour ending in a sentence
 * that says what you now have. What it cannot do is prove a selector MATCHES. That is the
 * failure that actually reaches a reader, and it is invisible from the outside: a step whose
 * selector matches nothing draws its card in the middle of the screen with no spotlight, and
 * looks exactly like a step that was meant to.
 *
 * So the engine records which selector won on the layer, as data-tour-hit, and this walks
 * every step of every tour in a real browser and asserts it is never "none". Four of the
 * legacy tour's shipped bugs -- a step measuring a "Loading…" box that had already been
 * replaced, a step matching another view's hidden copy of the same class, a step describing a
 * sub-route it never navigated to, a step covered by a popover in the top layer -- all
 * present as exactly this, and all four were found by running this check rather than by
 * reading the code.
 *
 * A deck is drafted and saved first, because four of the seven tours describe a deck you
 * have, and on an empty library they correctly collapse to a single "nothing here yet" step.
 * Walking them empty would prove nothing about the other forty.
 */
import assert from "node:assert/strict";
import {createServer} from "node:http";
import {readFile} from "node:fs/promises";
import {extname, join, normalize} from "node:path";
import {fileURLToPath} from "node:url";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const HOME = process.env.PLAYWRIGHT_HOME || process.env.SP;
const CHROME = process.env.UAT_CHROME;
if (!HOME || !CHROME) {
  console.log("tour-walk: skipped — set PLAYWRIGHT_HOME and UAT_CHROME to run the tour in a browser.");
  process.exit(0);
}

const TYPES = {".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".svg": "image/svg+xml", ".webp": "image/webp", ".png": "image/png"};

const server = createServer(async (req, res) => {
  const path = join(ROOT, normalize(decodeURIComponent(req.url.split("?")[0])).replace(/^(\.\.[/\\])+/, ""));
  try {
    const body = await readFile(path);
    res.writeHead(200, {"content-type": TYPES[extname(path)] || "application/octet-stream"});
    res.end(body);
  } catch { res.writeHead(404); res.end("not found"); }
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const base = `http://127.0.0.1:${server.address().port}`;

const pw = await import(`file://${HOME}/node_modules/playwright/index.js`);
const chromium = pw.chromium || pw.default.chromium;
const {stubNetwork} = await import(new URL("./scryfall-stub.mjs", import.meta.url));

const browser = await chromium.launch({executablePath: CHROME});
const page = await (await browser.newContext({viewport: {width: 1400, height: 1000}})).newPage();
await stubNetwork(page);
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));

const fail = async (message) => {
  await browser.close(); server.close();
  console.error(`tour-walk: ${message}`);
  process.exit(1);
};

try {
  /* --------------------------------------------------- seed one real deck */
  await page.goto(`${base}/index.html#lab`);
  await page.locator("#cm-lab-run-pane").waitFor({timeout: 90000});
  await page.evaluate(() => document.querySelectorAll("#cm-main details").forEach((d) => {d.open = true;}));
  await page.waitForTimeout(600);
  await page.getByLabel("Search commander name").fill("Krenko, Mob Boss");
  await page.locator("[data-lab-commander]").filter({has: page.getByText("Krenko, Mob Boss", {exact: true})}).first().click();
  await page.getByLabel("Deck name", {exact: true}).fill("Tour walk");
  await page.locator("#cm-lab-run").click();
  await page.locator("#cm-lab-save:not([disabled])").waitFor({timeout: 180000});
  await page.waitForTimeout(45000);            // the draft fetches printed text for 99 cards
  await page.locator("#cm-lab-save").click();
  await page.waitForTimeout(4000);

  await page.goto(`${base}/index.html#decks`);
  await page.waitForTimeout(6000);
  const decks = await page.locator(".cm-deck-tile").count();
  if (!decks) await fail("could not seed a deck, so the four tours that need one cannot be walked");

  /* --------------------------------------------------- walk every tour */
  await page.getByRole("button", {name: "Take a tour"}).click();
  await page.getByRole("dialog").waitFor({timeout: 15000});
  const ids = await page.locator(".cm-tour-pick").evaluateAll((els) => els.map((e) => e.dataset.tour));
  assert.equal(ids.length, 7, `the chooser offers ${ids.length} tours, not seven`);
  await page.keyboard.press("Escape");

  let walked = 0;
  for (const id of ids) {
    await page.getByRole("button", {name: "Take a tour"}).click();
    await page.locator(`[data-tour="${id}"]`).click();
    await page.locator("#cm-tour-layer").waitFor({state: "visible", timeout: 15000});
    for (let step = 0; step < 40; step += 1) {
      await page.waitForTimeout(1300);
      const seen = await page.evaluate(() => {
        const layer = document.getElementById("cm-tour-layer");
        const box = document.getElementById("cm-tour-spotlight").getBoundingClientRect();
        return {hit: layer.dataset.tourHit, title: document.getElementById("cm-tour-title").textContent,
          width: box.width, height: box.height,
          last: document.getElementById("cm-tour-next").textContent === "Done"};
      });
      if (seen.hit === "none") await fail(`${id}: step "${seen.title}" points at nothing`);
      if (seen.hit !== "finish" && (seen.width < 10 || seen.height < 10)) {
        await fail(`${id}: step "${seen.title}" matched ${seen.hit} but measured ${Math.round(seen.width)}x${Math.round(seen.height)}`);
      }
      walked += 1;
      if (seen.last) break;
      await page.locator("#cm-tour-next").click();
    }
    await page.locator("#cm-tour-next").click();   // Done closes
    await page.waitForTimeout(400);
  }

  if (errors.length) await fail(`console errors during the walk: ${errors.slice(0, 3).join(" | ")}`);
  console.log(`tour-walk: ${ids.length} tours, ${walked} steps, every one pointing at something real.`);
} finally {
  await browser.close().catch(() => {});
  server.close();
}
