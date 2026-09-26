/* A DECK BY ITS LINK, IN THE PAGE (R3.10a). The Worker's side is tests/cloud-worker.mjs; this is the reader's.
 *
 * The test server has no Worker, so /api/import/archidekt is answered here with what the Worker would send: a real
 * Archidekt response (tests/fixtures/archidekt-deck.json) put through the Worker's own trim. In a real page:
 *
 *   1. The landing page's "Import from Archidekt" and the New deck wizard's "From a link" take a link, and the deck
 *      comes in as a list in the app's own import, commander first, named after the deck, to review before saving.
 *   2. A link typed into the landing page's Step one goes to the importer, not to the commander search.
 *   3. The page asks the app's own route, with the app's header, and never archidekt.com.
 *   4. A Moxfield link, a private deck and an importer out of reach are each answered with what to do: the paste path.
 *
 * Needs Playwright and Chromium; GEOMETRY_REQUIRED=1 (CI) turns a missing browser into a failure.
 */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {openBrowser} from "./uat/browser-runner.mjs";
import {trim} from "../cloud/import.mjs";

let checks = 0;
const ok = (c, msg) => { checks++; assert.ok(c, msg); };
const eq = (a, b, msg) => { checks++; assert.deepEqual(a, b, msg); };
const raw = JSON.parse(readFileSync(new URL("./fixtures/archidekt-deck.json", import.meta.url), "utf8"));
const deck = trim(raw);
const LINK = "https://archidekt.com/decks/123456/fun-with-fungus";

const {browser, base, stub, close} = await openBrowser({name: "import-link", flag: "GEOMETRY_REQUIRED"});
const fresh = async () => {
  const context = await browser.newContext({viewport: {width: 1400, height: 900}, serviceWorkers: "block"});
  const page = await context.newPage();
  if (stub) await stub(page);
  const asked = [], outside = [];
  page.on("request", (r) => { const u = new URL(r.url()); if (/archidekt\.com$/.test(u.hostname)) outside.push(r.url()); });
  let answer = () => ({status: 200, json: {deck}});
  await page.route(`${base}/api/import/archidekt*`, (route) => { const r = route.request(); asked.push({url: r.url(), header: r.headers()["x-crankmagic"]}); const a = answer(); return a.html ? route.fulfill({status: a.status, contentType: "text/html", body: a.html}) : route.fulfill({status: a.status, json: a.json}); });
  return {context, page, asked, outside, answer: (fn) => { answer = fn; }};
};
const dialog = async (page) => { await page.locator("#cm-dialog[open]").waitFor({timeout: 30000}); return (await page.locator("#cm-dialog[open] h2").first().innerText()).trim(); };
const closeDialog = async (page) => { await page.keyboard.press("Escape"); await page.waitForTimeout(300); };
const listIn = (page) => page.$eval("#cm-dialog textarea[name=text]", (t) => t.value);
const notice = (page) => page.locator("#cm-notice").innerText();

try {
  /* 1 and 3. The landing page's Import from Archidekt. */
  {
    const {context, page, asked, outside, answer} = await fresh();
    await page.goto(`${base}/index.html`);
    await page.locator(".cm-landing [data-action=import-archidekt]").waitFor({timeout: 60000});
    await page.locator(".cm-landing [data-action=import-archidekt]").click();
    eq(await dialog(page), "Import from Archidekt", "the landing page's Import from Archidekt asks for the deck's link");
    await page.locator("#cm-dialog input[name=url]").fill(LINK);
    await page.locator("#cm-dialog [type=submit]").click();
    await page.waitForFunction(() => document.querySelector("#cm-dialog[open] textarea[name=text]"), null, {timeout: 30000});
    eq(await dialog(page), "Import cards or a deck list", "the deck comes in as the app's own import, to review before anything is saved");
    const lines = (await listIn(page)).split("\n");
    eq(lines[0], "1 Thelon of Havenwood", "the commander first");
    eq(lines.length, deck.cards.length, `then the rest, one line a card (${lines.length})`);
    eq(await page.inputValue("#cm-dialog input[name=name]"), raw.name, "named after the deck");
    eq(asked.map((a) => [new URL(a.url).pathname + new URL(a.url).search, a.header]), [["/api/import/archidekt?id=123456", "import"]], "asked of the app's own importer, once, with the app's header");
    eq(outside, [], "and the page never reached archidekt.com itself");
    await closeDialog(page);

    /* 2. A link in Step one. */
    await page.goto(`${base}/index.html#welcome`);
    await page.locator("#cm-landing-query").fill(LINK);
    await page.locator("#cm-landing-start [type=submit]").click();
    await page.waitForFunction(() => document.querySelector("#cm-dialog[open] textarea[name=text]"), null, {timeout: 30000});
    eq((await listIn(page)).split("\n")[0], "1 Thelon of Havenwood", "a link typed into Step one goes to the importer, not the commander search");
    await closeDialog(page);

    /* 4. What to do instead. */
    const tryLink = async (link) => { await page.locator(".cm-landing [data-action=import-archidekt]").click(); await dialog(page); await page.locator("#cm-dialog input[name=url]").fill(link); await page.locator("#cm-dialog [type=submit]").click(); await page.waitForTimeout(800); return (await page.locator("#cm-dialog[open] .cm-error").innerText().catch(() => "")) || await notice(page); };
    ok(/Moxfield.*Export.*paste/is.test(await tryLink("https://www.moxfield.com/decks/abcDEF123")), "a Moxfield link: says Moxfield will not serve it, and to export and paste");
    await closeDialog(page);
    answer(() => ({status: 404, json: {error: "Archidekt has no public deck 99. A private deck cannot be read by link; export its list and paste it."}}));
    ok(/no public deck 99.*paste/i.test(await tryLink("archidekt.com/decks/99")), "a private deck: the importer's own words, and the paste path");
    await closeDialog(page);
    answer(() => ({status: 404, html: "<!doctype html><title>Not found</title>"}));
    ok(/not reachable from here.*paste/i.test(await tryLink(LINK)), "an importer out of reach (no Worker, or a sign-in wall): the paste path, said plainly");
    await closeDialog(page);
    await context.close();
  }

  /* 1. The New deck wizard's From a link. */
  {
    const {context, page} = await fresh();
    await page.goto(`${base}/index.html#decks`);
    await page.getByRole("heading", {name: "Decks", level: 1}).waitFor({timeout: 60000});
    await page.locator(".cm-page-head [data-action=new-deck]").click();
    await page.locator("#cm-dialog [data-action=import-archidekt]").click();
    eq(await dialog(page), "Import from Archidekt", "New deck offers From a link beside Create, Import and Load");
    await page.locator("#cm-dialog input[name=url]").fill(LINK);
    await page.locator("#cm-dialog [type=submit]").click();
    await page.waitForFunction(() => document.querySelector("#cm-dialog[open] textarea[name=text]"), null, {timeout: 30000});
    eq((await listIn(page)).split("\n")[0], "1 Thelon of Havenwood", "and brings the deck in the same way");
    await context.close();
  }
  /* The pages' security policy no longer names Archidekt at all. */
  for (const f of ["index.html", "crankmagic.html"]) ok(!/archidekt/i.test((/connect-src[^;"]*/.exec(readFileSync(new URL(`../${f}`, import.meta.url), "utf8")) || [""])[0]), `${f}'s connect-src does not name Archidekt`);
} finally {
  await close();
}
console.log(`import-link: ${checks} checks passed — an Archidekt link comes in through the app's own importer as a list to review, and anything it cannot read is answered with the paste path.`);
