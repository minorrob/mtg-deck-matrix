/* THE MENU, AS ROB ASKED ON 2026-09-29: "add a hard refresh 'Refresh' button under 'Sync Now' in the menu options.
 * Also move the 'Switch Theme' section to under 'Help' section and remove 'Share CrankMagic by email'. Within the
 * Help Section, we should have a toggle to turn on the glossary function (... hover over game terms to see what
 * they mean in an info box that disappears after moving the cursor off it)."
 *
 *   Order     Account (Sync now, then Refresh), Settings and backups, Help (with the glossary switch), Switch theme,
 *             Sign out; no Share CrankMagic by email
 *   Glossary  the switch says Off, then On; a card's rules text underlines its game terms; hovering one shows its
 *             definition in a box that goes when the cursor moves off; the choice is kept after a reload; Off again
 *             takes the underlines away
 *   Refresh   empties this browser's copies of the app's files and reloads; the library is untouched
 */
import assert from "node:assert/strict";
import {readFileSync, mkdirSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {openBrowser, loadLiveState} from "./uat/browser-runner.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let checks = 0;
const ok = (c, m) => {assert.ok(c, m); checks += 1;};
const eq = (a, b, m) => {assert.deepEqual(a, b, m); checks += 1;};
const SHOTS = process.env.UAT_SHOTS || "";
if (SHOTS) mkdirSync(SHOTS, {recursive: true});
const shot = async (page, name) => {if (SHOTS) await page.screenshot({path: path.join(SHOTS, `${name}.png`)});};
const html = readFileSync(path.join(ROOT, "index.html"), "utf8").replace("</head>", `<meta name="crankmagic-accounts" content="on"></head>`);

const {browser, base, stub, close} = await openBrowser({name: "menu-help", flag: "GEOMETRY_REQUIRED"});
if (browser) try {
  const context = await browser.newContext({viewport: {width: 1400, height: 900}, serviceWorkers: "block"});
  await context.addInitScript(() => (globalThis.CrankFeatures ||= []).push((C) => {globalThis.__cm = C;}));
  const page = await context.newPage();
  if (stub) await stub(page);
  await loadLiveState(page, base);
  /* Signed in, as on the site: the Menu's Account section, with Sync now. */
  await page.route(`${base}/index.html*`, (r) => r.fulfill({contentType: "text/html; charset=utf-8", body: html}));
  await page.route(`${base}/api/me`, (r) => r.fulfill({json: {email: "rob@example.com"}}));
  await page.route(`${base}/api/library**`, (r) => r.request().method() === "GET" ? r.fulfill({json: {head: null}})
    : r.fulfill({json: {head: {id: "00000000-0000-4000-8000-000000000000", revision: 1, checksum: "x", device: "test", createdAt: new Date().toISOString()}}}));
  await page.goto("about:blank");   /* so the next address loads the page afresh, with the stubs above */
  await page.goto(`${base}/index.html#decks`);
  await page.locator("#cm-account [data-action=account-sync]").waitFor({state: "attached", timeout: 60000});

  /* ORDER. */
  const openMenu = async () => {await page.getByRole("button", {name: "Menu", exact: true}).click(); await page.locator("#cm-user-menu:popover-open").waitFor();};
  await openMenu();
  const items = await page.$$eval("#cm-user-menu > p, #cm-user-menu button, #cm-user-menu a", (els) => els.map((el) => el.textContent.replace(/^[^\p{L}]+/u, "").trim()).filter((t) => !t.startsWith("Signed in")));
  eq(await page.locator("#cm-account > p").first().textContent(), "Account", "the Menu opens on Account");
  eq(items, ["Sync now", "Refresh", "Settings", "Save a backup file", "Restore from a backup file", "Reset All",
    "Help", "Help & glossary", "Term definitions on hover: Off", "Take a Tour", "Send Feedback", "Show a QR code",
    "Switch theme", "Moss & Iron", "Brass & Slate", "Felt & Cream", "Steel & Cobalt", "Sign out"],
  "the Menu: Account with Sync now and Refresh under it, Settings, the backups and Reset All, Help with the glossary switch, then Switch theme, then Sign out");
  ok(!items.includes("Share CrankMagic by email") && !(await page.locator("#cm-share-mail").count()), "Share CrankMagic by email is gone");
  await shot(page, "menu-1400");

  /* GLOSSARY. */
  const card = await page.evaluate(() => {const C = globalThis.__cm; return [...new Set(C.state.lots.map((l) => l.cardId))].find((id) => /\b(Flying|Trample|Haste)\b/.test((C.card(id) || {}).oracleText || ""));});
  ok(card, "a card of the library with Flying, Trample or Haste in its rules text, to read");
  const inspect = async () => {await page.evaluate((id) => globalThis.__cm.inspector(id), card); await page.locator("#cm-dialog[open]").waitFor();};
  await page.keyboard.press("Escape");
  await inspect();
  eq(await page.locator("#cm-dialog .v-term").count(), 0, "off, rules text carries no underlined terms");
  await page.keyboard.press("Escape");
  await openMenu();
  await page.locator("#cm-menu-terms").click();
  await page.waitForFunction(() => globalThis.__cm.state.preferences?.terms === true);
  await openMenu().catch(() => {});
  eq([await page.getAttribute("#cm-menu-terms", "aria-pressed"), (await page.locator("#cm-menu-terms .cm-menu-state").textContent())], ["true", "On"], "Help's switch turns the glossary on, and says so");
  await page.keyboard.press("Escape");
  await inspect();
  const term = page.locator("#cm-dialog .v-term").first();
  await term.waitFor({timeout: 10000});
  await term.hover();
  await page.locator("#cm-glossary-tip:popover-open").waitFor({timeout: 5000});
  const tip = await page.locator("#cm-glossary-tip").textContent();
  ok(tip.length > 20, `hovering "${await term.textContent()}" shows its definition in a box (${tip.slice(0, 80)}…)`);
  await shot(page, "glossary-hover-1400");
  await page.mouse.move(5, 890);
  await page.waitForFunction(() => !document.querySelector("#cm-glossary-tip").matches(":popover-open"), null, {timeout: 5000});
  ok(true, "and the box goes when the cursor moves off the term");
  await page.keyboard.press("Escape");
  await page.reload();
  await page.locator("#cm-account [data-action=account-sync]").waitFor({state: "attached", timeout: 60000});
  await openMenu();
  eq(await page.locator("#cm-menu-terms .cm-menu-state").textContent(), "On", "the choice is kept after a reload");
  await page.locator("#cm-menu-terms").click();
  await page.waitForFunction(() => globalThis.__cm.state.preferences?.terms === false);
  await page.keyboard.press("Escape");
  await inspect();
  eq(await page.locator("#cm-dialog .v-term").count(), 0, "and Off takes the underlines away again");
  await page.keyboard.press("Escape");

  /* REFRESH. */
  await page.evaluate(async () => {await (await caches.open("crankmagic-public:/:shell:test")).put("probe.txt", new Response("old"));});
  const decksBefore = await page.evaluate(() => globalThis.__cm.state.decks.length);
  await openMenu();
  const [nav] = await Promise.all([page.waitForEvent("framenavigated", {timeout: 15000}), page.locator("#cm-account [data-action=app-refresh]").click()]);
  ok(nav === page.mainFrame(), "Refresh reloads the page");
  await page.locator("#cm-account [data-action=account-sync]").waitFor({state: "attached", timeout: 60000});
  eq(await page.evaluate(async () => (await caches.keys()).filter((k) => k.startsWith("crankmagic-public:"))), [], "after emptying this browser's copies of the app's files");
  eq(await page.evaluate(() => globalThis.__cm.state.decks.length), decksBefore, "and the library is untouched");
  await context.close();
} finally {
  await close();
}
console.log(`menu-help: ${checks} checks passed — Refresh under Sync now, Help with its glossary switch, Switch theme under Help, no Share by email.`);
