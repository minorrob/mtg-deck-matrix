/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* SEND FEEDBACK, THE CONTROL AND THE SHEET (the feedback loop, PR 2; crankmagic-feedback.js, feedback-schema.js;
 * docs/feedback-loop/CrankFeedback.md). The real page in a real browser; the Worker stood in for by routes that keep
 * what the sheet posts.
 *   1. The glyph: one on every page's head, a symbol with its name for a reader, and the Menu's Send Feedback, both the
 *      same sheet. Symbols first: the sheet's kind is two glyph tiles, its controls glyphs with accessible names.
 *   2. The report: what the person typed, and everything gathered -- the route and screen, the build from version.json,
 *      the device, the console ring (an error thrown before the sheet opened), the deck page and its name -- bounded as
 *      CrankFeedback@1, posted with the sheet's own header; never who the person is.
 *   3. The answers: 201 closes the sheet and thanks; a refusal (the eleventh in an hour) stays open and says why; a
 *      picture chosen is sent as WebP under 1 MiB and the thanks says it is not kept yet.
 *   4. Signed out: the sheet refuses with the way out (Sign in, or Email instead), and posts nothing.
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
/* A PNG for the picture chosen: 64x40, one color, written here so it is a real file the browser decodes. */
import {deflateSync} from "node:zlib";
function png(width, height) {
  const crcTable = Array.from({length: 256}, (_, n) => {let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0;});
  const crc = (buf) => {let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0;};
  const chunk = (type, data) => {const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type, "ascii"), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]);};
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {raw[y * (width * 3 + 1)] = 0; for (let x = 0; x < width; x++) {const o = y * (width * 3 + 1) + 1 + x * 3; raw[o] = 40; raw[o + 1] = 120 + (x % 50); raw[o + 2] = 90;}}
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
const PNG = png(64, 40);

const {browser, base, stub, close} = await openBrowser({name: "feedback-sheet", flag: "GEOMETRY_REQUIRED"});
if (browser) try {
  const context = await browser.newContext({viewport: {width: 1400, height: 900}, serviceWorkers: "block"});
  await context.addInitScript(() => (globalThis.CrankFeatures ||= []).push((C) => {globalThis.__cm = C;}));
  const page = await context.newPage();
  if (stub) await stub(page);
  await loadLiveState(page, base);
  const posted = [];
  let answer = () => ({status: 201, json: {feedback: {id: "f-1", state: "new", screenshot: null}}});
  let me = {status: 200, json: {email: "rob@example.com"}};
  await page.route(`${base}/index.html*`, (r) => r.fulfill({contentType: "text/html; charset=utf-8", body: html}));
  await page.route(`${base}/version.json`, (r) => r.fulfill({json: {commit: "c567c581", profile: "cloud-staging"}}));
  await page.route(`${base}/api/me`, (r) => r.fulfill(me));
  await page.route(`${base}/api/library**`, (r) => r.request().method() === "GET" ? r.fulfill({json: {head: null}})
    : r.fulfill({json: {head: {id: "00000000-0000-4000-8000-000000000000", revision: 1, checksum: "x", device: "test", createdAt: new Date().toISOString()}}}));
  await page.route(`${base}/api/feedback`, (r) => {
    const req = r.request();
    posted.push({headers: req.headers(), body: JSON.parse(req.postData() || "null")});
    const a = answer(); r.fulfill(a.json ? {status: a.status, json: a.json} : {status: a.status});
  });
  await page.goto("about:blank");
  await page.goto(`${base}/index.html#decks`);
  await page.waitForFunction(() => /Signed in as/.test(document.getElementById("cm-account")?.textContent || ""), null, {timeout: 60000});
  const sheet = page.locator("#cm-dialog form.cm-feedback");

  /* ---- 1. The glyph ---- */
  for (const [route, screen] of [["#decks", "Decks"], ["#cards", "Library"], ["#discover", "Explore"]]) {
    await page.goto(`${base}/index.html${route}`);
    await page.locator(".cm-page-head .cm-feedback-btn").first().waitFor({timeout: 30000});
    const glyph = page.locator(".cm-page-head [data-action=send-feedback]").first();
    eq([await glyph.getAttribute("aria-label"), (await glyph.innerText()).trim().length <= 2], ["Send feedback", true], `1. ${screen}'s head has the feedback glyph: a symbol, named for a reader`);
    eq((await page.evaluate(() => globalThis.__cm.feedback.draft().page)), {route, screen}, `and the report from there says ${route}, ${screen}`);
  }
  await page.goto(`${base}/index.html#decks`);
  await page.locator(".cm-page-head .cm-feedback-btn").first().waitFor({timeout: 30000});
  await page.locator(".cm-page-head [data-action=send-feedback]").first().click();
  await sheet.waitFor({timeout: 10000});
  eq(await page.locator("#cm-dialog-title").textContent(), "Send feedback", "the glyph opens the sheet");
  eq(await sheet.locator(".cm-feedback-kind input[type=radio]").count(), 2, "two kinds, as two glyph tiles");
  eq(await sheet.locator(".cm-feedback-kind input:checked").getAttribute("value"), "bug", "bug is the kind until the person says otherwise");
  for (const name of ["Add a picture", "Send feedback"]) ok(await sheet.getByRole("button", {name}).or(sheet.getByText(name)).count() > 0, `the sheet names "${name}" for a reader`);
  ok(/⌖ #decks/.test(await sheet.locator(".cm-feedback-context").innerText()) && /⚙ c567c581/.test(await sheet.locator(".cm-feedback-context").innerText()), "and shows, in glyphs, what goes with the report: where, and which build");
  await shot(page, "feedback-sheet-1400");
  await page.keyboard.press("Escape");
  await page.locator("#cm-dialog[open]").waitFor({state: "detached", timeout: 5000}).catch(() => {});
  /* The Menu no longer has Send Feedback (Rob, 2026-10-28): the glyph on the page's head is the door. */
  await page.getByRole("button", {name: "Menu", exact: true}).click();
  await page.locator("#cm-user-menu:popover-open").waitFor();
  ok(await page.locator("#cm-user-menu [data-action=send-feedback]").count() === 0, "the Menu has no Send Feedback; the page's glyph opens the sheet");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");

  /* ---- 2. The report ---- */
  await page.evaluate(() => {setTimeout(() => {throw new Error("boom from the decks page");}, 0);});
  await page.waitForFunction(() => globalThis.__cm.feedback.errors().some((l) => l.includes("boom from the decks page")));
  ok(true, "2. an error the page throws is kept in the console ring");
  await page.goto(`${base}/index.html#decks?deck=${encodeURIComponent("deck:live:D1")}`);
  await page.locator(".cm-deck-hero .cm-feedback-btn").waitFor({timeout: 30000});
  await page.locator(".cm-deck-hero [data-action=send-feedback]").click();
  await sheet.waitFor({timeout: 10000});
  await sheet.locator(".cm-feedback-kind input[value=enhancement]").check({force: true});
  await sheet.locator("textarea[name=text]").fill("  The deck page could show the\n\n\n\n commander's   color identity larger.  ");
  await sheet.getByRole("button", {name: "Send feedback"}).click();
  await page.locator("#cm-notice").filter({hasText: /Feedback sent/}).waitFor({timeout: 10000});
  eq(posted.length, 1, "Send posts one report");
  const {headers, body} = posted[0];
  eq([headers["x-crankmagic"], headers["content-type"]], ["feedback", "application/json"], "with the sheet's own header and JSON");
  eq([body.schema, body.kind, body.text], ["CrankFeedback@1", "enhancement", "The deck page could show the\n\ncommander's color identity larger."], "the report: the schema, the kind chosen, the text as typed and bounded");
  eq(body.page, {route: `#decks?deck=${encodeURIComponent("deck:live:D1")}`, screen: "Decks"}, "where: the deck page's route and screen");
  eq(body.build, {commit: "c567c581", profile: "cloud-staging"}, "the build, from version.json");
  eq([body.deck.id, typeof body.deck.name, body.deck.name.length > 0], ["deck:live:D1", "string", true], `the deck page's deck, by id and name (${body.deck.name})`);
  eq([body.device.viewport, body.device.pointer, body.device.browser, typeof body.device.pixelRatio, typeof body.device.reducedMotion, typeof body.device.theme], [{width: 1400, height: 900}, "fine", "Chrome", "number", "boolean", "string"], "the device: viewport, pointer, browser, pixel ratio, motion, theme");
  ok(Array.isArray(body.console) && body.console.some((l) => /boom from the decks page/.test(l)) && body.console.length <= 20, "the console ring, the error included");
  ok(!("game" in body) && !("screenshot" in body), "no game on the board, no picture: neither field is sent");
  ok(!/rob@example\.com|reporter|email/.test(JSON.stringify(body)), "and never who the person is: the Worker reads that from the token");
  eq(await page.locator("#cm-dialog[open]").count(), 0, "201 closes the sheet");
  eq(await page.locator("#cm-notice .cm-toast-action").count(), 0, "and the thanks carries no Undo: sending changed nothing in the library");

  /* ---- 3. The answers ---- */
  answer = () => ({status: 429, json: {error: "You have sent 10 reports in the last hour, the most CrankMagic takes from one person. Nothing was saved. Wait 50 minutes, then send it again.", retryAfterSeconds: 3000}});
  await page.locator(".cm-deck-hero [data-action=send-feedback]").click();
  await sheet.waitFor({timeout: 10000});
  await sheet.getByRole("button", {name: "Send feedback"}).click();
  await sheet.locator(".cm-error:not([hidden])").waitFor({timeout: 10000});
  eq(posted.length, 1, "3. an empty text is refused before anything is posted");
  ok(/Say what happened/.test(await sheet.locator(".cm-error").innerText()), "and the sheet says so");
  await sheet.locator("textarea[name=text]").fill("The eleventh.");
  await sheet.getByRole("button", {name: "Send feedback"}).click();
  await page.waitForFunction(() => /10 reports in the last hour/.test(document.querySelector("#cm-dialog .cm-error")?.textContent || ""), null, {timeout: 10000});
  eq([posted.length, await page.locator("#cm-dialog[open]").count()], [2, 1], "the Worker's refusal is shown in the sheet, which stays open with the text kept");
  eq(await sheet.locator("textarea[name=text]").inputValue(), "The eleventh.", "the text is not lost");
  ok(!(await sheet.getByRole("button", {name: "Send feedback"}).isDisabled()), "and Send is live again");
  /* A picture chosen. */
  answer = () => ({status: 201, json: {feedback: {id: "f-2", state: "new", screenshot: "dropped"}}});
  await sheet.locator("input[data-feedback=upload]").setInputFiles({name: "shot.png", mimeType: "image/png", buffer: PNG});
  await sheet.locator(".cm-feedback-preview:not([hidden]) img").waitFor({timeout: 10000}).catch(async (error) => {throw Error(`${error.message}; the sheet says: ${await sheet.locator(".cm-error").textContent()}`);});
  ok(/⚠/.test(await sheet.locator(".cm-feedback-context").innerText()), "the context line shows the console count in a glyph");
  const drafted = await page.evaluate(() => globalThis.__cm.feedback.draft({text: "x", screenshot: document.querySelector("#cm-dialog .cm-feedback-preview img").src}));
  ok(typeof drafted.screenshot === "string" && drafted.screenshot.startsWith("data:image/webp;base64,"), "the picture is encoded as WebP");
  await sheet.getByRole("button", {name: "Send feedback"}).click();
  await page.waitForFunction(() => /not kept yet/.test(document.querySelector("#cm-notice")?.textContent || ""), null, {timeout: 10000});
  ok(posted[2].body.screenshot.startsWith("data:image/webp;base64,") && posted[2].body.screenshot.length < 1_400_000, "and sent under 1 MiB");
  ok(/not kept yet/.test(await page.locator("#cm-notice").innerText()), "the thanks says the picture is not kept yet, as the Worker answered");
  await sheet.waitFor({state: "detached", timeout: 5000}).catch(() => {});

  /* ---- 4. Signed out ---- */
  me = {status: 401, json: {error: "Sign in to use your cloud library."}};
  await page.goto("about:blank");
  await page.goto(`${base}/index.html#cards`);
  await page.locator(".cm-page-head .cm-feedback-btn").first().waitFor({timeout: 30000});
  await page.waitForFunction(() => globalThis.__cm.signedIn && !globalThis.__cm.signedIn(), null, {timeout: 20000});
  await page.locator(".cm-page-head [data-action=send-feedback]").first().click();
  await page.locator("#cm-dialog .cm-feedback-signed-out").waitFor({timeout: 10000});
  ok(/signed out/i.test(await page.locator("#cm-dialog").innerText()), "4. signed out, the sheet says so");
  eq([await page.locator("#cm-dialog [data-action=account-sign-in]").count(), await page.locator("#cm-dialog [data-action=feedback-mail]").count(), await page.locator("#cm-dialog form.cm-feedback").count()], [1, 1, 0], "with the way out (Sign in, or Email instead) and no form to fill");
  eq(posted.length, 3, "and nothing more was posted");
  await shot(page, "feedback-signed-out-1400");

  await context.close();
} finally {
  await close();
}
console.log(`feedback-sheet: ${checks} checks passed — one glyph on every page and in the Menu; the report gathered, bounded and posted with its header; refusals shown, nothing lost; signed out refused with the way out.`);
