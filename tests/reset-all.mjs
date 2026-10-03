/* RESET ALL (Rob, 2026-10-03: "a 'Reset All' option in the menu that completely resets the library and decks to as
 * if the user is brand new, not local save and not delete account, which already exist").
 *
 * In a real page with the committed library restored:
 *
 *   1. The Menu offers Reset All beside the backups, in red. It opens a dialog that says what goes and what stays,
 *      offers a backup first, and puts a red Reset All button behind a typed RESET.
 *   2. Anything but RESET is refused in the page, and nothing changes.
 *   3. RESET empties the library and every key CrankMagic keeps in this browser, leaves another site's key alone,
 *      and opens the bare address -- the landing page, as a new visitor sees it -- saying it was reset.
 *   4. What it leaves is what a brand-new browser has: the same library (decks, records, groups, settings), the same
 *      keys in storage, the same landing words, the default theme.
 *   5. Signed in, a cloud that cannot be reached refuses the reset with nothing changed. One that can is emptied with
 *      the library, by force (so its old version is kept 30 days, not pruned); the person stays signed in; and the
 *      next sync keeps the empty library rather than bringing the old one back.
 *   6. A cloud save that fails after the library has emptied says so, and leaves this device marked as changed, so
 *      the next sync saves the empty library.
 *
 * Needs Playwright and Chromium; GEOMETRY_REQUIRED=1 (CI) turns a missing browser into a failure.
 */
import assert from "node:assert/strict";
import {readFileSync, mkdirSync} from "node:fs";
import path from "node:path";
import {gunzipSync} from "node:zlib";
import {openBrowser, loadLiveState, ROOT} from "./uat/browser-runner.mjs";

let checks = 0;
const ok = (cond, msg) => { checks++; assert.ok(cond, msg); };
const eq = (a, b, msg) => { checks++; assert.deepEqual(a, b, msg); };

const {browser, base, stub, close} = await openBrowser({name: "reset-all", flag: "GEOMETRY_REQUIRED"});
const shot = async (page, name) => {if (process.env.UAT_SHOTS) {mkdirSync(process.env.UAT_SHOTS, {recursive: true}); await page.screenshot({path: path.join(process.env.UAT_SHOTS, `${name}.png`)});}};
const fresh = async () => {
  const context = await browser.newContext({viewport: {width: 1400, height: 900}, serviceWorkers: "block"});
  const page = await context.newPage();
  if (stub) await stub(page);
  return {context, page};
};
const openMenu = async (page) => { await page.getByRole("button", {name: "Menu", exact: true}).click(); await page.locator("#cm-user-menu:popover-open").waitFor(); };
const entries = (page) => page.$$eval("#cm-user-menu button, #cm-user-menu a", (els) => els.map((el) => el.textContent.replace(/^[^\p{L}]+/u, "").trim()));
const resetDialog = async (page) => {
  await openMenu(page);
  await page.locator("#cm-user-menu").getByRole("button", {name: "Reset All", exact: true}).click();
  await page.getByLabel("Type RESET to confirm").waitFor();
};
const submit = (page) => page.locator("#cm-dialog [type=submit]").click();
const landing = (page) => page.locator(".cm-landing h1").waitFor({timeout: 60000});
const noticeSays = (page, re) => page.waitForFunction((source) => new RegExp(source).test(document.getElementById("cm-notice")?.textContent || ""), re.source, {timeout: 30000});
/* The library as the repository holds it, read through its own module, as the app reads it. */
const library = (page) => page.evaluate(async () => {
  const repo = await CrankRepository.open();
  try {
    const s = await repo.getState(), history = await repo.history();
    return {revision: s.revision, decks: s.decks.length, lots: s.lots.length, games: s.games.length, groups: s.groups.map((g) => `${g.id}:${g.name}`).sort(),
      preferences: s.preferences, history: history.map((h) => h.summary), sync: (await repo.meta("cloud-sync")) || null};
  } finally { repo.close(); }
});
const shape = ({decks, lots, games, groups, preferences, history}) => ({decks, lots, games, groups, preferences, history});
const stored = (page) => page.evaluate(() => ({local: Object.keys(localStorage).sort(), session: Object.keys(sessionStorage).sort()}));
const landingWords = (page) => page.evaluate(() => ({
  palette: document.documentElement.dataset.palette,
  way: document.querySelector(".cm-landing-account .v-button")?.textContent.trim() || null,
  step: document.querySelector(".cm-landing-step strong")?.textContent.trim() || null,
}));
/* What CrankMagic keeps in a browser that has been used: the tables, the lobby, a size, Explore's recents, the
   audio, the old Matrix's library key, a Scryfall answer -- and one key that is not CrankMagic's at all. */
const SEEDED = {"cm-tabletop-sort": "[]", "cm-lobby": "{\"seats\":[]}", "cm-card-scale": "1.25", "crankmagic:discover:recents:v1": "[]",
  "crankmagic-audio-muted": "1", "mtg-deck-matrix-state-v1": "{}"};
const seed = (page) => page.evaluate((keys) => {
  for (const [k, v] of Object.entries(keys)) localStorage.setItem(k, v);
  localStorage.setItem("another-site", "stays");
  sessionStorage.setItem("crankmagic-scryfall:sol ring", "{}");
}, SEEDED);
const until = async (cond, what, ms = 30000) => { const end = Date.now() + ms; while (!cond()) { if (Date.now() > end) throw Error(`timed out waiting for ${what}`); await new Promise((r) => setTimeout(r, 100)); } };
const unpack = (body) => JSON.parse(gunzipSync(Buffer.from(body, "base64")).toString("utf8"));

try {
  /* A BRAND-NEW BROWSER, for comparison: the landing page, and what its first visit leaves behind. */
  const newcomer = await fresh();
  await newcomer.page.goto(`${base}/index.html`);
  await landing(newcomer.page);
  const firstVisit = {library: await library(newcomer.page), stored: await stored(newcomer.page), words: await landingWords(newcomer.page)};
  eq([firstVisit.library.decks, firstVisit.words.way, firstVisit.words.step], [0, "Start without an account", "Step one: start your first deck"], "a brand-new browser lands on the landing page, with no decks, offering Start without an account");
  await newcomer.context.close();

  const {context, page} = await fresh();
  await loadLiveState(page, base);
  await openMenu(page);
  await page.locator("#cm-user-menu [data-theme-choice=brass-slate]").click();
  await page.waitForFunction(() => document.querySelector("[data-theme-choice=brass-slate]")?.getAttribute("aria-pressed") === "true");
  await seed(page);
  const before = await library(page);
  ok(before.decks > 0 && before.lots > 1000, `the committed library is in: ${before.decks} decks, ${before.lots} card records`);
  ok(before.preferences.theme === "brass-slate", "and a theme of the reader's own is chosen, saved with the library");

  /* 1. The Menu entry and its dialog. */
  await openMenu(page);
  const items = await entries(page);
  eq(items.slice(0, 4), ["Settings", "Save a backup file", "Restore from a backup file", "Reset All"], "the Menu offers Reset All beside the backups");
  ok(await page.locator("#cm-user-menu [data-action=reset-all]").evaluate((b) => b.classList.contains("cm-danger") && getComputedStyle(b).color !== getComputedStyle(b.previousElementSibling).color), "in red, unlike the entries beside it");
  await shot(page, "reset-all-menu");
  await page.keyboard.press("Escape");
  await resetDialog(page);
  eq((await page.locator("#cm-dialog[open] h2").first().textContent()).trim(), "Reset All", "it opens a dialog named Reset All");
  const words = await page.locator("#cm-dialog").innerText();
  ok(/permanently removes your library/.test(words) && /every deck/.test(words) && /settings and theme/.test(words) && /tables, lobby, layout and sizes/.test(words), "which says what goes: the library, every deck, the settings and theme, and what this browser keeps");
  ok(/Files you exported stay where you saved them/.test(words), "and what stays: the files exported");
  ok(!/signed in/.test(words), "and, signed out, says nothing about a cloud");
  ok(await page.locator("#cm-dialog").getByRole("button", {name: "Save a backup file first"}).isVisible(), "it offers a backup first");
  ok(await page.evaluate(() => { const b = document.querySelector("#cm-dialog form.cm-destructive [type=submit]"); if (!b || b.textContent.trim() !== "Reset All") return false; const probe = document.createElement("span"); probe.style.color = "var(--st-remove)"; document.getElementById("matrix-v2").append(probe); const want = getComputedStyle(probe).color; probe.remove(); return getComputedStyle(b).backgroundColor === want; }), "and its Reset All button is red, as a reset this size should be");
  await shot(page, "reset-all-dialog");

  /* 2. Only RESET does it. */
  await page.getByLabel("Type RESET to confirm").fill("reset");
  await submit(page);
  await page.locator("#cm-dialog .cm-error:not([hidden])").waitFor();
  ok(/Type RESET exactly/.test(await page.locator("#cm-dialog .cm-error").innerText()), "reset in small letters is refused, in the page");
  const still = await library(page), stillStored = await stored(page);
  eq([still.decks, still.lots, still.revision], [before.decks, before.lots, before.revision], "and the library is untouched");
  ok(Object.keys(SEEDED).every((k) => (stillStored.local.includes(k))), "and so is what the browser keeps");

  /* 3. RESET. */
  await page.getByLabel("Type RESET to confirm").fill("RESET");
  await submit(page);
  await page.waitForURL(`${base}/index.html`, {timeout: 30000});
  await landing(page);
  eq(page.url(), `${base}/index.html`, "the page reopens at the bare address, on the landing page");
  await noticeSays(page, /CrankMagic was reset/);
  eq((await page.locator("#cm-notice .cm-toast-text").textContent()).trim(), "CrankMagic was reset. This is how a new visitor finds it.", "and says it was reset");
  await shot(page, "reset-all-landing");
  const after = await library(page);
  eq([after.decks, after.lots, after.games], [0, 0, 0], "the library is empty: no decks, no card records, no games");
  ok(after.revision > before.revision, `and its revision moved on (${before.revision} → ${after.revision}), so another open tab sees the change rather than missing it`);
  const left = await stored(page);
  eq(Object.keys(SEEDED).filter((k) => left.local.includes(k)), [], "every key CrankMagic kept in this browser is gone");
  ok(left.local.includes("another-site"), "but a key that is not CrankMagic's stays");
  ok(!left.session.some((k) => k.startsWith("crankmagic")), "and the Scryfall answers held for the session are gone");

  /* 4. As if brand new. */
  eq(shape(after), shape(firstVisit.library), "what is left is a brand-new browser's library: the same starter groups, the same settings, the same one line of History");
  eq(left.local.filter((k) => k !== "another-site"), firstVisit.stored.local, "the same keys in storage");
  eq(left.session, firstVisit.stored.session, "and in the session's storage");
  eq(await landingWords(page), firstVisit.words, "and the landing page a new visitor sees: the default theme, Start without an account, Step one");
  await context.close();

  /* 5. SIGNED IN: the cloud's library is emptied with it, or the next sync would bring it straight back. */
  const signed = await fresh();
  const p = signed.page;
  const html = readFileSync(path.join(ROOT, "index.html"), "utf8").replace("</head>", '<meta name="crankmagic-accounts" content="on"></head>');
  const cloud = {head: null, n: 0, puts: [], pulls: 0, failGet: false, failPutOnce: false};
  const head = () => ({id: `v${++cloud.n}`, savedAt: new Date().toISOString(), device: "Chrome on Linux"});
  await p.route(`${base}/index.html*`, (route) => route.fulfill({contentType: "text/html; charset=utf-8", body: html}));
  await p.route(`${base}/api/me`, (route) => route.fulfill({json: {email: "reader@example.test"}}));
  await p.route(`${base}/api/library/**`, (route) => { cloud.pulls++; return route.fulfill({status: 404, json: {error: "not here"}}); });
  await p.route(`${base}/api/library`, (route) => {
    const request = route.request();
    if (request.method() === "GET") return cloud.failGet ? route.fulfill({status: 503, json: {error: "The cloud is resting."}}) : route.fulfill({json: {head: cloud.head}});
    const sent = request.postDataJSON();
    if (cloud.failPutOnce) { cloud.failPutOnce = false; cloud.puts.push({...sent, failed: true}); return route.fulfill({status: 503, json: {error: "The cloud is resting."}}); }
    cloud.head = head();
    cloud.puts.push({...sent, answer: cloud.head.id});
    return route.fulfill({json: {head: cloud.head}});
  });
  await loadLiveState(p, base);
  await until(() => cloud.puts.length === 1, "the restored library's first save to the cloud");
  ok(cloud.puts[0].parent === null && unpack(cloud.puts[0].body).payload.state.decks.length === before.decks, `signed in, the restored library saves itself to the cloud (${cloud.head.id})`);
  const matched = cloud.head.id;
  await p.waitForFunction(async () => { const repo = await CrankRepository.open(); try { return !!(await repo.meta("cloud-sync"))?.headId; } finally { repo.close(); } });

  /* A cloud that cannot be reached: nothing is reset. */
  cloud.failGet = true;
  await resetDialog(p);
  const signedWords = await p.locator("#cm-dialog").innerText();
  ok(/You stay signed in as reader@example\.test/.test(signedWords) && /Your cloud library is emptied too/.test(signedWords) && /30 days/.test(signedWords), "signed in, the dialog says the account stays and the cloud library is emptied too, its old version kept 30 days");
  await shot(p, "reset-all-dialog-signed-in");
  await p.getByLabel("Type RESET to confirm").fill("RESET");
  await submit(p);
  await p.locator("#cm-dialog .cm-error:not([hidden])").waitFor({timeout: 30000});
  ok(/Nothing was reset: your cloud library could not be reached/.test(await p.locator("#cm-dialog .cm-error").innerText()), "a cloud that cannot be reached refuses the reset, and says why");
  const untouched = await library(p);
  eq([untouched.decks, untouched.lots, cloud.puts.length], [before.decks, before.lots, 1], "with the library untouched and nothing sent");
  cloud.failGet = false;

  /* One that can: emptied by force, and the account stays. */
  await submit(p);
  await p.waitForURL(`${base}/index.html`, {timeout: 30000});
  await landing(p);
  await noticeSays(p, /CrankMagic was reset, here and in your cloud library\./);
  const forced = cloud.puts[1];
  ok(forced && forced.force === true && forced.parent === matched, `the empty library replaced the cloud's (${matched}) by force, so the old version is kept for 30 days`);
  const sentState = unpack(forced.body).payload.state;
  eq([sentState.decks.length, sentState.lots.length], [0, 0], "and what it sent is the empty library");
  await until(() => cloud.puts.length >= 3, "the next sync after the reload", 30000);
  const next = cloud.puts[2];
  ok(next.parent === forced.answer && !next.force, `the next sync saves on top of the reset (${forced.answer}), without force`);
  eq(cloud.pulls, 0, "and nothing was ever pulled back down");
  const signedAfter = await library(p);
  eq([signedAfter.decks, signedAfter.lots], [0, 0], "the library stays empty");
  ok(signedAfter.sync && signedAfter.sync.email === "reader@example.test" && signedAfter.sync.headId === cloud.head.id, "matched to the cloud's newest version, for the same account");
  /* The landing page stands alone, with the rail hidden: its own chip opens the Menu, and names who is signed in. */
  await p.waitForFunction(() => document.querySelector(".cm-landing-chip")?.classList.contains("is-signed-in"), null, {timeout: 30000});
  eq((await p.locator(".cm-landing-chip .cm-landing-chip-name").innerText()).trim(), "reader@example.test", "the reader is still signed in: the landing page's chip names them");
  await p.locator(".cm-landing-chip").click();
  await p.locator("#cm-user-menu:popover-open").waitFor();
  ok((await entries(p)).includes("Sign out") && (await entries(p)).includes("Sync now"), "and its Menu offers Sync now and Sign out");
  await p.keyboard.press("Escape");

  /* 6. A cloud save that fails after the library has emptied: the next sync saves the empty library. */
  await loadLiveState(p, base);
  const savesBefore = cloud.puts.length;
  await until(() => cloud.puts.length === savesBefore + 1, "the restored library's save");
  const refilled = cloud.head.id;
  cloud.failPutOnce = true;
  await resetDialog(p);
  await p.getByLabel("Type RESET to confirm").fill("RESET");
  await submit(p);
  await p.waitForURL(`${base}/index.html`, {timeout: 30000});
  await landing(p);
  await noticeSays(p, /CrankMagic was reset/);
  eq((await p.locator("#cm-notice .cm-toast-text").textContent()).trim(), "CrankMagic was reset. Your cloud library could not be reached just now, so it is emptied the next time this device syncs.", "a cloud save that fails after the library emptied says so");
  ok(cloud.puts[savesBefore + 1]?.failed && cloud.puts[savesBefore + 1].force === true, "the forced save was tried, and failed");
  await until(() => cloud.puts.length >= savesBefore + 3, "the next sync after the failed save", 30000);
  const retried = cloud.puts[savesBefore + 2];
  ok(retried.parent === refilled && !retried.force, `the next sync saves this device's library on top of the cloud's (${refilled}) -- it does not take the cloud's back`);
  eq(unpack(retried.body).payload.state.decks.length, 0, "and what it saves is the empty library");
  eq(cloud.pulls, 0, "nothing was pulled back down");
  eq((await library(p)).decks, 0, "and the library stays empty");
  await signed.context.close();
} finally {
  await close();
}
console.log(`reset-all: ${checks} checks passed — Menu › Reset All empties the library and everything CrankMagic keeps in this browser, and the cloud's library when signed in, leaving exactly what a brand-new visitor has.`);
