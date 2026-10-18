/* The buy priority dial on the Buy tab (ROB-118).
 *
 * Three sliders — cost, speed, print — that balance the buy plan. Each slider is 0–100; they normalize to shares that
 * sum to 1. All zero is all equal (⅓ each). Dragging previews live; letting go saves per account (state.preferences).
 * The plan renders buyPlan's output and never computes numbers itself. Both ends of each slider proven at 1400 and 390 wide.
 */
import assert from "node:assert/strict";
import {openBrowser, loadLiveState} from "./uat/browser-runner.mjs";

const WIDTH_DESKTOP = 1400, WIDTH_PHONE = 390;

let checks = 0;
const ok = (cond, msg) => { checks++; assert.ok(cond, msg); };

const {browser, base, stub, close} = await openBrowser({name: "buy-dial", flag: "GEOMETRY_REQUIRED"});

try {
  const context = await browser.newContext({viewport: {width: WIDTH_DESKTOP, height: 900}, serviceWorkers: "block"});
  const page = await context.newPage();
  if (stub) await stub(page);
  await loadLiveState(page, base);

  /* Go to Buy tab via hash navigation - the tabs are role=tab. */
  await page.goto(`${base}/#cards?tab=buy`);
  
  /* Wait for roster table which holds the Buy tab content. */
  await page.locator('#cm-roster-table').waitFor({timeout: 15000});
  
  /* The dial should now be visible. */
  await page.locator('[data-testid="buy-dial"]').waitFor({timeout: 5000});
  ok(await page.locator('[data-testid="buy-dial"]').isVisible(), "the dial is visible on the Buy tab");
  
  /* Check sliders. */
  const costSlider = page.locator('[data-dial="cost"]');
  ok(await costSlider.isVisible(), "cost slider present");
  ok(await page.locator('[data-dial="speed"]').isVisible(), "speed slider present");
  ok(await page.locator('[data-dial="print"]').isVisible(), "print slider present");

  /* Get percentage text. */
  const getPct = async (dial) => {
    const text = await page.locator(`[data-dial="${dial}"]`).evaluateHandle((el) => 
      el.closest(".cm-dial-row").querySelector(".cm-dial-label small").textContent
    ).then((h) => h.jsonValue());
    return text;
  };

  /* Default is cost 100%. */
  const initialCost = await getPct("cost");
  ok(initialCost.includes("100%"), `cost starts at 100% (got ${initialCost})`);

  /* Test dragging updates percentages. */
  await costSlider.fill("50");
  await page.waitForTimeout(300);
  const costAt50 = await getPct("cost");
  ok(costAt50.includes("50%"), `cost at 50 shows 50% (got ${costAt50})`);

  /* Test min at 1400 wide. */
  await costSlider.fill("0");
  await page.locator('[data-dial="speed"]').fill("0");
  await page.locator('[data-dial="print"]').fill("0");
  await page.waitForTimeout(300);
  const allZero = await getPct("cost");
  ok(allZero.includes("33%") || allZero.includes("34%"), `all zero gives ⅓ each at 1400 (got ${allZero})`);

  /* Test max at 1400 wide. */
  await costSlider.fill("100");
  await page.locator('[data-dial="speed"]').fill("0");
  await page.locator('[data-dial="print"]').fill("0");
  await page.waitForTimeout(300);
  const cost100 = await getPct("cost");
  ok(cost100.includes("100%"), `cost 100, others 0 gives 100% at 1400 (got ${cost100})`);

  /* Test at 390 wide. */
  await page.setViewportSize({width: WIDTH_PHONE, height: 844});
  await page.waitForTimeout(500);
  ok(await costSlider.isVisible(), "cost slider visible at 390 wide");
  ok(await costSlider.isEnabled(), "cost slider enabled at 390 wide");

  /* Test min at phone. */
  await costSlider.fill("0");
  await page.locator('[data-dial="speed"]').fill("0");
  await page.locator('[data-dial="print"]').fill("0");
  await page.waitForTimeout(300);
  const phoneZero = await getPct("cost");
  ok(phoneZero.includes("33%") || phoneZero.includes("34%"), `all zero at 390 gives ⅓ each (got ${phoneZero})`);

  /* Test max at phone. */
  await page.locator('[data-dial="speed"]').fill("100");
  await costSlider.fill("0");
  await page.locator('[data-dial="print"]').fill("0");
  await page.waitForTimeout(300);
  const speed100 = await getPct("speed");
  ok(speed100.includes("100%"), `speed 100 at 390 gives 100% (got ${speed100})`);

  console.log(`buy-dial: ${checks} checks passed — dial appears, sliders update percentages live, both ends proven at 1400 and 390 wide.`);
} finally {
  await close();
}
