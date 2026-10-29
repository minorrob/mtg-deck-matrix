/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.

   EXPLORE FROM A COMMANDER FINDS EVERY COMMANDER THE CATALOG KNOWS (ROB-214, Luke's playtest of 2026-10-28; DB-01).

   "Explore from a commander" said '"Giada" is not a commander in the catalog.' while the commander was on screen, and the door
   counted 3,411 commanders. It looked only in the graph's rows (data/graph.json, baked Sep 11) for a row flagged `isCommander`;
   the commander universe the app also loads (data/commander-universe.json, Sep 28) holds 3,497, and 86 of them are not in the
   graph at all (Aerid Konstrari, Arni, Humble Scribe, Avacyn, Angel of Horror, ...). A commander the graph never took in could
   not be explored, and a failed lookup quietly opened Explore on Atraxa.

     1. A commander only the universe knows opens in Explore, focused on that card, with no refusal.
     2. A graph commander is found by its full name in any case, or by the start of it where that names one commander
        ("Giada"), and the door's count is the whole catalog's commanders.
     3. A name that is no commander is refused by name, and Explore does not open on some other card.

   GEOMETRY_REQUIRED=1 refuses a missing browser.
     node tests/explore-commander-door.mjs
*/
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import path from "node:path";
import {openBrowser, loadLiveState, ROOT} from "./uat/browser-runner.mjs";

let checks = 0;
const ok = (c, m) => {assert.ok(c, m); checks += 1;};
const eq = (a, b, m) => {assert.deepEqual(a, b, m); checks += 1;};

const universe = JSON.parse(readFileSync(path.join(ROOT, "data/commander-universe.json"), "utf8")).cards;
const graph = JSON.parse(readFileSync(path.join(ROOT, "data/graph.json"), "utf8")).cards;
const inGraph = new Set(graph.map((c) => c.name));
const onlyUniverse = universe.filter((r) => r[6] === 1 && !inGraph.has(r[0])).map((r) => r[0]);
const everyCommander = universe.filter((r) => r[6] === 1).length;
ok(onlyUniverse.length >= 50, `the committed data has commanders only the universe knows (${onlyUniverse.length})`);
const NEW = "Aerid Konstrari";
ok(onlyUniverse.includes(NEW), `${NEW} is one of them`);

const {browser, base, stub, close} = await openBrowser({name: "explore-commander-door", flag: "GEOMETRY_REQUIRED"});

async function door(page) {
  await page.goto(`${base}/index.html#discover`);
  await page.locator("[data-action=explore-from-commander]").waitFor({timeout: 60000});
  await page.locator("[data-action=explore-from-commander]").click();
  await page.locator("#cm-dialog input[name=commander]").waitFor();
}
const submit = async (page, name) => {
  await page.locator("#cm-dialog input[name=commander]").fill(name);
  await page.locator("#cm-dialog [type=submit]").click();
};

try {
  const context = await browser.newContext({viewport: {width: 1400, height: 900}, serviceWorkers: "block"});
  const page = await context.newPage();
  if (stub) await stub(page);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await loadLiveState(page, base);

  /* ---- 1. a commander only the universe knows ---- */
  await door(page);
  const counted = await page.locator("#cm-dialog .cm-muted").first().textContent();
  eq(counted.replace(/\D/g, ""), String(everyCommander), `the door counts every commander the catalog holds (${everyCommander.toLocaleString("en-US")}), not the graph's 3,411`);
  await submit(page, NEW);
  await page.waitForFunction((n) => decodeURIComponent(location.hash.replace(/\+/g, " ")).includes(`commander=${n}`), NEW, {timeout: 30000});
  ok(true, `${NEW} opens Explore on that commander`);
  await page.locator("#cm-card-view").waitFor({timeout: 60000});
  await page.waitForTimeout(1500);
  ok((await page.locator("#cm-card-view").textContent()).includes(NEW), `Explore is focused on ${NEW}, not on another card`);
  ok(!(await page.locator(".cm-notice, [role=alert]").allTextContents()).some((t) => /not a commander/.test(t)), "and nothing was refused");

  /* ---- 2. a graph commander, in another case ---- */
  await door(page);
  await submit(page, "giada, font of hope");
  await page.waitForFunction(() => decodeURIComponent(location.hash.replace(/\+/g, " ")).includes("commander=Giada, Font of Hope"), null, {timeout: 30000});
  await page.locator("#cm-card-view").waitFor({timeout: 60000});
  await page.waitForTimeout(1500);
  ok((await page.locator("#cm-card-view").textContent()).includes("Giada, Font of Hope"), "Giada, in any case, is found and focused");

  /* ... and by the start of it, where that names one commander: what Luke typed, "Giada". */
  await door(page);
  await submit(page, "Giada");
  await page.waitForFunction(() => decodeURIComponent(location.hash.replace(/\+/g, " ")).includes("commander=Giada, Font of Hope"), null, {timeout: 30000});
  ok(true, '"Giada" alone opens Giada, Font of Hope');

  /* ---- 3. no commander ---- */
  await door(page);
  await submit(page, "Sol Ring");
  await page.waitForTimeout(1200);
  ok(!decodeURIComponent(page.url()).includes("commander="), "Sol Ring is no commander: Explore does not open on one");
  ok((await page.locator("body").textContent()).includes('"Sol Ring" is not a commander in the catalog'), "and the refusal names it");

  eq(errors, [], "no page error");
  await context.close();
  console.log(`explore-commander-door: ${checks} checks passed -- a commander only the universe knows opens in Explore, a graph commander is found in any case, and a non-commander is refused by name.`);
} finally {
  await close();
}
