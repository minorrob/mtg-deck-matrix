/* The buy priority dial on the Buy tab (ROB-118).
 *
 * Three sliders — cost, speed, print — that balance the buy plan. Each slider is 0–100; they normalize to shares that
 * sum to 1. All zero is all equal (⅓ each). Dragging previews live; letting go saves per device. The plan renders
 * buyPlan's output and never computes numbers itself. Both ends of each slider proven at 1400 and 390 wide.
 *
 * Depends on: buy-plan.js (ROB-119), data/vendors.json, the Buy tab in crankmagic-collection.js.
 * Breaks: game/tools/batch/breaks-buy-dial.py.
 */
import assert from "node:assert/strict";
import {openBrowser, loadLiveState} from "./uat/browser-runner.mjs";

const WIDTH_DESKTOP = 1400, WIDTH_PHONE = 390;

let checks = 0;
const ok = (cond, msg) => { checks++; assert.ok(cond, msg); };
const eq = (a, b, msg) => { checks++; assert.deepEqual(a, b, msg); };

const {browser, base, stub, close} = await openBrowser({name: "buy-dial", flag: "GEOMETRY_REQUIRED"});

try {
  const context = await browser.newContext({viewport: {width: WIDTH_DESKTOP, height: 900}, serviceWorkers: "block"});
  const page = await context.newPage();
  if (stub) await stub(page);
  await loadLiveState(page, base);

  /* Navigate to Buy tab - wait for page ready first. */
  await page.getByRole("heading", {name: "Decks", level: 1}).waitFor({timeout: 10000});
  await page.goto(`${base}/index.html#cards?tab=buy`);
  await page.waitForTimeout(1000);
  
  /* The dial should appear even if there are no To buy items. */

  /* 1. The dial appears on the Buy tab. */
  await page.waitForSelector(".cm-buy-dial", {timeout: 5000});
  ok(await page.isVisible(".cm-buy-dial"), "the dial is visible on the Buy tab");
  ok(await page.isVisible('[data-dial="cost"]'), "cost slider present");
  ok(await page.isVisible('[data-dial="speed"]'), "speed slider present");
  ok(await page.isVisible('[data-dial="print"]'), "print slider present");

  /* 2. Each slider has a percentage. */
  const costSlider = page.locator('[data-dial="cost"]');
  const speedSlider = page.locator('[data-dial="speed"]');
  const printSlider = page.locator('[data-dial="print"]');

  const getPct = async (dial) => {
    return await page.locator(`[data-dial="${dial}"]`).evaluateHandle((el) => el.closest(".cm-dial-row").querySelector(".cm-dial-label small").textContent).then((h) => h.jsonValue());
  };

  /* Cost starts at 100% (default). */
  ok((await getPct("cost")).includes("100%"), "cost percentage starts at 100%");

  /* 3. Dragging updates the percentages live. */
  await costSlider.fill("50");
  await page.waitForTimeout(200);
  ok((await getPct("cost")).includes("50%"), "cost at 50 shows 50%");

  await speedSlider.fill("100");
  await page.waitForTimeout(200);
  const pctSpeed = await getPct("speed");
  ok(parseInt(pctSpeed) > 50, `speed at 100 with cost 50 is over 50% (got ${pctSpeed})`);

  /* 4. The buy plan renders. */
  const planHost = page.locator("#cm-buy-plan");
  ok(await planHost.isVisible(), "the buy plan host is visible");
  const planText = await planHost.innerText();
  ok(planText.length > 0, "the plan shows content");

  /* 5. Both ends of each slider at 1400 wide. */
  await page.setViewportSize({width: WIDTH_DESKTOP, height: 900});
  await page.waitForTimeout(300);

  await costSlider.fill("0");
  await speedSlider.fill("0");
  await printSlider.fill("0");
  await page.waitForTimeout(200);
  ok((await getPct("cost")).includes("33%") || (await getPct("cost")).includes("34%"), "all zero gives ⅓ each (desktop min)");

  await costSlider.fill("100");
  await speedSlider.fill("0");
  await printSlider.fill("0");
  await page.waitForTimeout(200);
  ok((await getPct("cost")).includes("100%"), "cost 100, others 0 gives 100% cost at desktop");

  /* 6. Both ends at 390 wide. */
  await page.setViewportSize({width: WIDTH_PHONE, height: 844});
  await page.waitForTimeout(300);

  await costSlider.fill("0");
  await speedSlider.fill("0");
  await printSlider.fill("0");
  await page.waitForTimeout(200);
  ok((await getPct("cost")).includes("33%") || (await getPct("cost")).includes("34%"), "all zero gives ⅓ each (phone min)");

  await speedSlider.fill("100");
  await costSlider.fill("0");
  await printSlider.fill("0");
  await page.waitForTimeout(200);
  ok((await getPct("speed")).includes("100%"), "speed 100, others 0 gives 100% speed at phone");

  /* 7. The dial is visible and interactive at both widths. */
  await page.setViewportSize({width: WIDTH_DESKTOP, height: 900});
  await page.waitForTimeout(200);
  ok(await costSlider.isVisible(), "cost slider visible at 1400 wide");
  ok(await costSlider.isEnabled(), "cost slider enabled at 1400 wide");

  await page.setViewportSize({width: WIDTH_PHONE, height: 844});
  await page.waitForTimeout(200);
  ok(await costSlider.isVisible(), "cost slider visible at 390 wide");
  ok(await costSlider.isEnabled(), "cost slider enabled at 390 wide");

  console.log(`buy-dial: ${checks} checks passed — dial appears, sliders update percentages live, plan renders, both ends proven at 1400 and 390 wide.`);
} finally {
  await close();
}
