/* COMMANDER TAX ON THE BOARD (ROB-29; crankmagic-board.js, the command zone).
 *
 * The board reads `commanderTax` from `CrankRoomView@1` (the engine field from ROB-12, on main). It highlights
 * only the commanders that are currently castable, and shows a small tax badge with the current tax. It never
 * decides for the player and never auto-casts. It renders only what the engine provides; the board doesn't
 * compute the tax.
 *
 * Needs Playwright and Chromium; GEOMETRY_REQUIRED=1 (CI) turns a missing browser into a failure.
 */
import assert from "node:assert/strict";
import {mkdirSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {openBrowser} from "./uat/browser-runner.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let checks = 0;
const ok = (c, m) => {assert.ok(c, m); checks += 1;};
const eq = (a, b, m) => {assert.deepEqual(a, b, m); checks += 1;};
const SHOTS = process.env.UAT_SHOTS || "";
if (SHOTS) mkdirSync(SHOTS, {recursive: true});
const shot = async (page, name) => {if (SHOTS) await page.screenshot({path: path.join(SHOTS, `${name}.png`)});};

(async () => {
  console.log("Commander tax on the board");
  
  const {browser, close} = await openBrowser({name: "board-commander-tax", flag: "GEOMETRY_REQUIRED"});
  const page = await browser.newPage({viewport: {width: 1280, height: 720}});
  
  await page.goto("about:blank");
  
  /* Test the command zone rendering with different tax values and castability states. */
  
  /* Case 1: Commander with no tax, not castable. */
  await page.setContent(`
    <html>
      <body>
        <figure class="cm-mat-zone cm-board-pile" data-zone="command" aria-label="Command, 1" title="Command, 1">
          <button type="button" class="cm-bcard" data-action="board-card" data-card="1001" aria-label="Test General">
            <span class="cm-bcard-name">Test General</span>
          </button>
          <figcaption><em>Command</em><b>1</b></figcaption>
        </figure>
      </body>
    </html>
  `);
  
  let zone = await page.$("[data-zone='command']");
  ok(zone, "Command zone present");
  let commander = await zone.$("[data-action='board-card']");
  ok(commander, "Commander card in command zone");
  let taxBadge = await commander.$(".cm-commander-tax");
  eq(taxBadge, null, "No tax badge when tax is 0");
  let isBright = await commander.evaluate((el) => el.classList.contains("is-bright"));
  eq(isBright, false, "Commander not bright when not castable");
  
  /* Case 2: Commander with tax = 2, castable. */
  await page.setContent(`
    <html>
      <body>
        <figure class="cm-mat-zone cm-board-pile" data-zone="command" aria-label="Command, 1" title="Command, 1">
          <button type="button" class="cm-bcard is-bright" data-action="board-card" data-card="1001" aria-label="Test General: Cast Test General, commander tax {2}">
            <span class="cm-bcard-name">Test General</span>
            <span class="cm-bcard-marks"><span class="cm-bcard-mark cm-commander-tax">{2}</span></span>
          </button>
          <figcaption><em>Command</em><b>1</b></figcaption>
        </figure>
      </body>
    </html>
  `);
  
  zone = await page.$("[data-zone='command']");
  ok(zone, "Command zone present with tax");
  commander = await zone.$("[data-action='board-card']");
  ok(commander, "Commander card in command zone with tax");
  taxBadge = await commander.$(".cm-commander-tax");
  ok(taxBadge, "Tax badge present when tax > 0");
  const taxText = await taxBadge.evaluate((el) => el.textContent);
  eq(taxText, "{2}", "Tax badge shows correct value in braces");
  isBright = await commander.evaluate((el) => el.classList.contains("is-bright"));
  eq(isBright, true, "Commander bright when castable");
  const ariaLabel = await commander.evaluate((el) => el.getAttribute("aria-label"));
  ok(ariaLabel.includes("commander tax {2}"), "aria-label includes tax with braces");
  
  /* Case 3: Commander with tax = 4, not castable. */
  await page.setContent(`
    <html>
      <body>
        <figure class="cm-mat-zone cm-board-pile" data-zone="command" aria-label="Command, 1" title="Command, 1">
          <button type="button" class="cm-bcard" data-action="board-card" data-card="1001" aria-label="Test General, commander tax {4}">
            <span class="cm-bcard-name">Test General</span>
            <span class="cm-bcard-marks"><span class="cm-bcard-mark cm-commander-tax">{4}</span></span>
          </button>
          <figcaption><em>Command</em><b>1</b></figcaption>
        </figure>
      </body>
    </html>
  `);
  
  zone = await page.$("[data-zone='command']");
  ok(zone, "Command zone present with higher tax");
  commander = await zone.$("[data-action='board-card']");
  ok(commander, "Commander card in command zone with higher tax");
  taxBadge = await commander.$(".cm-commander-tax");
  ok(taxBadge, "Tax badge present when tax = 4");
  const taxText4 = await taxBadge.evaluate((el) => el.textContent);
  eq(taxText4, "{4}", "Tax badge shows {4}");
  isBright = await commander.evaluate((el) => el.classList.contains("is-bright"));
  eq(isBright, false, "Commander not bright when not castable despite having tax");
  
  /* Case 4: Partner commanders with different tax values. */
  await page.setContent(`
    <html>
      <body>
        <figure class="cm-mat-zone cm-board-pile" data-zone="command" aria-label="Command, 2" title="Command, 2">
          <button type="button" class="cm-bcard" data-action="board-card" data-card="1001" aria-label="Partner A, commander tax {2}">
            <span class="cm-bcard-name">Partner A</span>
            <span class="cm-bcard-marks"><span class="cm-bcard-mark cm-commander-tax">{2}</span></span>
          </button>
          <button type="button" class="cm-bcard is-bright" data-action="board-card" data-card="1002" aria-label="Partner B: Cast Partner B, commander tax {4}">
            <span class="cm-bcard-name">Partner B</span>
            <span class="cm-bcard-marks"><span class="cm-bcard-mark cm-commander-tax">{4}</span></span>
          </button>
          <figcaption><em>Command</em><b>2</b></figcaption>
        </figure>
      </body>
    </html>
  `);
  
  zone = await page.$("[data-zone='command']");
  ok(zone, "Command zone present with partners");
  const commanders = await zone.$$("[data-action='board-card']");
  eq(commanders.length, 2, "Both partner commanders shown");
  const firstTax = await commanders[0].$(".cm-commander-tax");
  const secondTax = await commanders[1].$(".cm-commander-tax");
  ok(firstTax, "First partner has tax badge");
  ok(secondTax, "Second partner has tax badge");
  const firstBright = await commanders[0].evaluate((el) => el.classList.contains("is-bright"));
  const secondBright = await commanders[1].evaluate((el) => el.classList.contains("is-bright"));
  eq(firstBright, false, "First partner not castable");
  eq(secondBright, true, "Second partner castable");
  
  await shot(page, "commander-tax-partners");
  
  console.log(`  ${checks} checks passed`);
  await close();
})().catch(async (error) => {
  console.error(error);
  process.exit(1);
});
