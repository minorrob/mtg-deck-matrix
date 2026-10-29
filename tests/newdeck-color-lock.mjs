/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.

   THE NEW DECK FLOW'S COLORS FOLLOW THE COMMANDER (ROB-216, Luke's playtest of 2026-10-28; DB-03; crankmagic-newdeck.js).

   Luke picked a red commander, then "Choose colors" let the colors drift to something else with the commander still chosen.
   Rob: after picking a red commander, Color should lock to red, or warn that changing it disconnects the commander.

     1. With no commander chosen, the color chips are free: pressing one picks it.
     2. With a commander chosen, "Choose colors" shows the commander's identity (Krenko, Mob Boss: red) and nothing else.
     3. Pressing another color does not change anything yet: it asks, naming the commander and saying it will be disconnected.
     4. "Keep Krenko" puts the question away; the commander and the colors are as they were.
     5. "Change colors" lets the commander go (the chosen line is gone, Next is off) and applies the change from its colors.

   GEOMETRY_REQUIRED=1 refuses a missing browser.
     node tests/newdeck-color-lock.mjs
*/
import assert from "node:assert/strict";
import {openBrowser, loadLiveState} from "./uat/browser-runner.mjs";

let checks = 0;
const ok = (c, m) => {assert.ok(c, m); checks += 1;};
const eq = (a, b, m) => {assert.deepEqual(a, b, m); checks += 1;};

const {browser, base, stub, close} = await openBrowser({name: "newdeck-color-lock", flag: "GEOMETRY_REQUIRED"});
const COMMANDER = "Krenko, Mob Boss";
const pressed = (page) => page.$$eval('#cm-dialog .cm-flow-colors [data-action="flow-color"]', (bs) => bs.filter((b) => b.getAttribute("aria-pressed") === "true").map((b) => b.dataset.id));
const chip = (page, id) => page.locator(`#cm-dialog .cm-flow-colors [data-id="${id}"]`);
const nav = (page, to) => page.locator(`#cm-dialog [data-action="flow-nav"][data-to="${to}"]`).click();

try {
  const context = await browser.newContext({viewport: {width: 1400, height: 900}, serviceWorkers: "block"});
  const page = await context.newPage();
  if (stub) await stub(page);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await loadLiveState(page, base);
  await page.goto(`${base}/index.html#decks`);
  await page.locator("[data-action=new-deck]").first().waitFor({timeout: 60000});
  await page.locator("[data-action=new-deck]").first().click();
  await page.locator("#cm-dialog [data-action=start-from]").waitFor({timeout: 30000});
  await page.locator("#cm-dialog [data-action=start-from]").click();
  await page.locator("#cm-flow-query").waitFor({timeout: 30000});

  /* ---- 1. no commander yet: the colors are free ---- */
  await nav(page, "colors");
  eq(await pressed(page), [], "no commander, no color pressed");
  await chip(page, "U").click();
  eq(await pressed(page), ["U"], "with no commander, pressing Blue picks it, with no question");
  ok(await page.locator("#cm-flow-color-ask").count() === 0, "and nothing is asked");
  await chip(page, "U").click();

  /* ---- 2. a red commander sets the colors ---- */
  await nav(page, "pick");
  await page.locator("#cm-flow-query").fill(COMMANDER);
  await page.locator('#cm-dialog [data-action="flow-commander"]').first().click();
  ok((await page.locator("#cm-flow-chosen").textContent()).includes(COMMANDER), `${COMMANDER} is chosen`);
  await nav(page, "colors");
  eq(await pressed(page), ["R"], `Choose colors shows ${COMMANDER}'s identity, red, and only that`);
  eq(await page.locator("#cm-dialog .cm-flow-colors").getAttribute("data-locked"), "commander", "and marks them as the commander's");
  ok(await page.locator("#cm-dialog [data-flow-include]").isDisabled(), "Include more colors is off while the commander sets them");

  /* ---- 3. another color asks first ---- */
  await chip(page, "W").click();
  const ask = page.locator("#cm-flow-color-ask");
  ok(await ask.count() === 1, "pressing White asks");
  ok(/Krenko, Mob Boss/.test(await ask.textContent()) && /disconnected/.test(await ask.textContent()), "naming the commander and saying it will be disconnected");
  eq(await pressed(page), ["R"], "and changes nothing yet");
  ok((await page.locator("#cm-flow-chosen").textContent()).includes(COMMANDER), "the commander is still chosen");

  /* ---- 4. keep ---- */
  await page.locator('#cm-flow-color-ask [data-action="flow-color-no"]').click();
  ok(await page.locator("#cm-flow-color-ask").count() === 0, "Keep puts the question away");
  eq(await pressed(page), ["R"], "the colors are as they were");
  ok((await page.locator("#cm-flow-chosen").textContent()).includes(COMMANDER), "and the commander is kept");

  /* ---- 5. change ---- */
  await chip(page, "W").click();
  await page.locator('#cm-flow-color-ask [data-action="flow-color-yes"]').click();
  ok(await page.locator("#cm-flow-chosen").count() === 0, "Change colors lets the commander go");
  ok(await page.locator('#cm-dialog [data-action="flow-next"]').isDisabled(), "Next is off until another is chosen");
  eq((await pressed(page)).sort(), ["R", "W"], "and White is added to the commander's red");
  ok(await page.locator("#cm-dialog .cm-flow-colors[data-locked]").count() === 0, "the colors are free again");

  eq(errors, [], "no page error");
  await context.close();
  console.log(`newdeck-color-lock: ${checks} checks passed -- a chosen commander sets Choose colors; changing them asks first, Keep changes nothing, Change colors disconnects the commander.`);
} finally {
  await close();
}
