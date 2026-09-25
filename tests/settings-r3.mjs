/* r3's SETTINGS AND THE MENU IT SLIMMED (R3.3a; wireframe 70-settings, INTAKE §4.7).
 *
 * In a real page with the committed library restored:
 *
 *   1. The Menu holds what §4.7 lists (the theme, Settings, backup and restore, help, the tour,
 *      feedback, sharing) and none of what moved: Excel, the e-mailed export, history and Undo,
 *      Confirmations, Clear all data, the card data ages. Reset comparison picks is gone.
 *   2. Menu → Settings opens #settings, with the design's sections: Account, Appearance, Prices, Data,
 *      About. Every entry that left the Menu is there, and Publish your To Trade list is in the
 *      Library's More menu.
 *   3. The theme can be chosen here too, and both places show the same choice.
 *   4. Reduce motion is saved: it stills transitions and the rail's animation, survives a reload, and
 *      turns off again.
 *   5. The default budget cap is what a deck with no cap of its own is held to, on the deck's own
 *      page; empty goes back to the pod's rule.
 *   6. About names the card data's ages, and on a phone the cards stack in one column.
 *
 * Needs Playwright and Chromium; GEOMETRY_REQUIRED=1 (CI) turns a missing browser into a failure.
 */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import path from "node:path";
import {openBrowser, loadLiveState, ROOT} from "./uat/browser-runner.mjs";

let checks = 0;
const ok = (cond, msg) => { checks++; assert.ok(cond, msg); };
const eq = (a, b, msg) => { checks++; assert.deepEqual(a, b, msg); };

const {browser, base, stub, close} = await openBrowser({name: "settings-r3", flag: "GEOMETRY_REQUIRED"});
const openMenu = async (page) => { await page.getByRole("button", {name: "Menu", exact: true}).click(); await page.locator("#cm-user-menu:popover-open").waitFor(); };
const toSettings = async (page) => { await openMenu(page); await page.locator("#cm-user-menu").getByRole("button", {name: "Settings"}).click(); await page.locator(".cm-settings").waitFor({timeout: 30000}); };
const entries = (page) => page.$$eval("#cm-user-menu button, #cm-user-menu a", (els) => els.map((el) => el.textContent.replace(/^[^\p{L}]+/u, "").trim()));

try {
  const context = await browser.newContext({viewport: {width: 1400, height: 900}, serviceWorkers: "block"});
  const page = await context.newPage();
  if (stub) await stub(page);
  await loadLiveState(page, base);

  /* 1. The Menu, slimmed. */
  await openMenu(page);
  eq(await entries(page), ["Dark · Brass & Slate", "Light · Felt & Cream", "Match system", "Settings", "Save a backup file", "Restore from a backup file",
    "Help & glossary", "Take a Tour", "Send Feedback", "Share CrankMagic by e-mail", "Show a QR code"], "the Menu holds what INTAKE §4.7 lists, in order");
  for (const moved of ["Export as Excel", "E-mail the export…", "See every change…", "Undo last change", "Confirmations…", "Clear all data", "Reset comparison picks", "Publish your To Trade list"])
    ok(!(await entries(page)).includes(moved), `${moved} has left the Menu`);
  ok(!(await page.$("#cm-user-menu #cm-data-dates")), "and so have the card data ages");
  await page.keyboard.press("Escape");

  /* 2. Settings, with everything that left the Menu. */
  await toSettings(page);
  ok(page.url().endsWith("#settings"), `Menu → Settings opens #settings (${page.url()})`);
  eq(await page.$$eval(".cm-settings-card h2", (hs) => hs.map((h) => h.textContent)), ["Account", "Appearance", "Prices", "Data", "About"], "Settings has the design's five sections");
  for (const [section, labels] of [["Data", ["Save a backup file", "Restore from a backup file", "Export as Excel", "E-mail the export…", "See every change…", "Undo last change", "Clear all data"]], ["Appearance", ["Confirmations…"]]]) {
    const inside = await page.locator(".cm-settings-card", {has: page.locator("h2", {hasText: section})}).locator("button").allTextContents();
    for (const label of labels) ok(inside.includes(label), `Settings › ${section} has ${label}`);
  }
  ok(/Signing in is not offered on this copy/.test(await page.locator("#cm-settings-account").innerText()), "without accounts, Account says so rather than offering a sign-in that cannot work");
  await page.goto(`${base}/index.html#cards`);
  await page.locator("[data-action=roster-more]").first().click();
  ok(await page.getByRole("button", {name: "Publish your To Trade list"}).isVisible(), "Publish your To Trade list is in the Library's More menu");
  await page.keyboard.press("Escape");

  /* 3. The theme, from Settings. */
  await toSettings(page);
  await page.locator(".cm-settings").getByRole("button", {name: "Light · Felt & Cream"}).click();
  await page.waitForFunction(() => document.getElementById("matrix-v2").dataset.theme === "light");
  eq(await page.$$eval("[data-theme-choice][aria-pressed=true]", (bs) => bs.map((b) => b.dataset.themeChoice)), ["light", "light"], "Light chosen in Settings is pressed in Settings and in the Menu alike");
  await page.locator(".cm-settings").getByRole("button", {name: "Dark · Brass & Slate"}).click();
  await page.waitForFunction(() => document.getElementById("matrix-v2").dataset.theme === "dark");

  /* 4. Reduce motion. */
  const motion = () => page.evaluate(() => ({attr: document.documentElement.dataset.motion || null, reduced: globalThis.CrankMotion.reduced(),
    pressed: document.querySelector('[data-action="set-motion"]').getAttribute("aria-pressed"), aether: document.querySelector(".v-aether")?.dataset.motion,
    transition: document.querySelector("[data-motion-probe]") ? getComputedStyle(document.querySelector("[data-motion-probe]")).transitionDuration : "no probe after a reload"}));
  /* The probe is an element that really transitions before the switch; one that never did would read
     0s either way and prove nothing. */
  ok(await page.evaluate(() => { const el = [...document.querySelectorAll("#matrix-v2 *")].find((n) => getComputedStyle(n).transitionDuration.split(",").some((d) => parseFloat(d) > 0)); if (el) el.dataset.motionProbe = ""; return Boolean(el); }), "the page has an element that transitions, to measure");
  const before = await motion();
  ok(before.attr === null && !before.reduced && before.pressed === "false" && before.aether === "running" && before.transition.split(",").some((d) => parseFloat(d) > 0), `motion is on by default: ${JSON.stringify(before)}`);
  await page.getByRole("button", {name: "Reduce motion"}).click();
  await page.waitForFunction(() => document.documentElement.dataset.motion === "reduce");
  const still = await motion();
  ok(still.reduced && still.pressed === "true" && still.aether === "still" && still.transition.split(",").every((d) => parseFloat(d) === 0),
    `Reduce motion stills the transitions and the rail's animation: ${JSON.stringify(still)}`);
  await page.reload();
  await page.locator(".cm-settings").waitFor({timeout: 60000});
  await page.waitForFunction(() => document.documentElement.dataset.motion === "reduce", null, {timeout: 15000});
  ok((await motion()).pressed === "true", "it is saved: after a reload the page is still and the switch still pressed");
  await page.getByRole("button", {name: "Reduce motion"}).click();
  await page.waitForFunction(() => !document.documentElement.dataset.motion);
  ok((await motion()).aether === "running", "and turning it off sets the rail moving again");

  /* 5. The default budget cap. */
  const deck = "deck:live:D6";
  const capOnDeck = async () => {await page.goto(`${base}/index.html#decks?deck=${encodeURIComponent(deck)}`); await page.locator(".cm-bento").waitFor({timeout: 30000}); return (await page.locator("#cm-main").innerText()).match(/Cap \$[\d,.]+/)?.[0];};
  eq(await capOnDeck(), "Cap $225.00", "a deck with no cap of its own is held to the pod's rule, $225");
  await page.goto(`${base}/index.html#settings`);
  await page.locator(".cm-settings").waitFor();
  await page.getByLabel("Default budget cap ($)").fill("300");
  await page.getByLabel("Default budget cap ($)").press("Enter");
  await page.waitForFunction(() => /held to \$300/.test(document.getElementById("cm-notice").textContent));
  ok(/held to \$300/.test(await page.locator(".cm-settings").innerText()), "Enter saves the cap, and Settings says what decks are held to now");
  eq(await capOnDeck(), "Cap $300.00", "and the deck's own page holds it to the new default");
  await page.goto(`${base}/index.html#settings`);
  await page.locator(".cm-settings").waitFor();
  await page.getByLabel("Default budget cap ($)").fill("-5");
  ok(!(await page.getByLabel("Default budget cap ($)").evaluate((i) => i.validity.valid)), "the browser itself flags a cap below one dollar");
  await page.getByRole("button", {name: "Save cap"}).click();
  await page.waitForFunction(() => document.getElementById("cm-notice").classList.contains("error"));
  ok(/above zero/.test(await page.locator("#cm-notice").innerText()), "and the button refuses it too, with a reason");
  await page.getByLabel("Default budget cap ($)").fill("");
  await page.getByRole("button", {name: "Save cap"}).click();
  await page.waitForFunction(() => /pod’s rule again/.test(document.getElementById("cm-notice").textContent));
  eq(await capOnDeck(), "Cap $225.00", "an empty box goes back to the pod's rule");

  /* 6. About, and a phone. */
  await page.goto(`${base}/index.html#settings`);
  await page.locator(".cm-settings #cm-data-dates p").first().waitFor();
  const about = await page.locator(".cm-settings-card", {has: page.locator("h2", {hasText: "About"})}).innerText();
  ok(/Card catalog/.test(about) && /Prices/.test(about) && /Library revision \d+/.test(about), `About names the card data's ages and the library's revision: ${about.replace(/\s+/g, " ").slice(0, 160)}`);
  await context.close();

  /* Signed in: Settings › Account says who, offers Sync now, and Sign out beside it. The page is served
     from disk with accounts on, and the account API answered here, as in tests/shell-r3.mjs. */
  const signed = await browser.newContext({viewport: {width: 1400, height: 900}, serviceWorkers: "block"});
  const p = await signed.newPage();
  if (stub) await stub(p);
  const html = readFileSync(path.join(ROOT, "index.html"), "utf8").replace("</head>", '<meta name="crankmagic-accounts" content="on"></head>');
  await p.route(`${base}/index.html*`, (route) => route.fulfill({contentType: "text/html; charset=utf-8", body: html}));
  await p.route(`${base}/api/me`, (route) => route.fulfill({json: {email: "reader@example.test"}}));
  await p.route(`${base}/api/library`, (route) => route.fulfill({json: {head: null}}));
  await p.goto(`${base}/index.html#settings`);
  await p.waitForFunction(() => /Signed in as reader@example\.test/.test(document.getElementById("cm-settings-account")?.textContent || ""), null, {timeout: 30000});
  eq(await p.locator("#cm-settings-account").getByRole("button").allTextContents(), ["Sync now", "Sign out"], "signed in, Settings › Account says who, with Sync now and Sign out");
  await signed.close();

  const phone = await browser.newContext({viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true, serviceWorkers: "block"});
  const small = await phone.newPage();
  if (stub) await stub(small);
  await small.goto(`${base}/index.html#settings`);
  await small.locator(".cm-settings-card").first().waitFor({timeout: 60000});
  const boxes = await small.$$eval(".cm-settings-card", (cs) => cs.map((c) => c.getBoundingClientRect()).map((r) => ({x: Math.round(r.x), w: Math.round(r.width), right: Math.round(r.right)})));
  ok(boxes.every((b) => b.x === boxes[0].x && b.right <= 390), `on a phone the sections stack in one column inside the screen: ${JSON.stringify(boxes)}`);
  ok(await small.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "with no sideways scroll");
  await phone.close();
} finally {
  await close();
}
console.log(`settings-r3: ${checks} checks passed — the Menu slimmed to INTAKE §4.7, Settings holds the rest in five sections, Reduce motion is saved and stills the page, and the default cap reaches a deck's own page.`);
