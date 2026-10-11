/* THE AI ADVISOR ON A DECK'S PAGE (AI-4; crankmagic-advisor.js), in a real page with Rob's library restored and the AI
 * door stood in for:
 *
 *   1. Offered only where the door would answer: Ask the AI advisor is under the deck's More menu when GET /api/ai-advise
 *      says open, and not otherwise.
 *   2. The page sends the deck's id and the goal, nothing more (the Worker builds the brief: tests/advisor.mjs).
 *   3. The answer is a review: each swap a row to tick, with its why; the swaps it dropped counted; the library it read and
 *      the person's meter said. Nothing has changed until Save ticked as upgrades, which saves each ticked swap as the
 *      deck's linked upgrade -- the card in, for the card out's slot -- and nothing else.
 *   4. Signed in to the library only, the door's sign-in is offered, coming back to the deck.
 *
 * The answer stood in for is one the Worker would show: swaps from D1's own brief (cloud/advise.mjs on the same library).
 * Needs Playwright and Chromium; GEOMETRY_REQUIRED=1 (CI) turns a missing browser into a failure.
 */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {gzipSync} from "node:zlib";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {openBrowser, loadLiveState} from "./uat/browser-runner.mjs";
import {openVersion, adviseBrief} from "../cloud/advise.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let checks = 0;
const ok = (c, m) => {assert.ok(c, m); checks += 1;};
const eq = (a, b, m) => {assert.deepEqual(a, b, m); checks += 1;};

const live = JSON.parse(readFileSync(path.join(ROOT, "data", "live-state.json"), "utf8"));
const state = await openVersion(gzipSync(Buffer.from(JSON.stringify(live))).toString("base64"));
const DECK = "deck:live:D1", brief = adviseBrief(state, DECK, "");
const outs = brief.hundred.filter((r) => !r.empty && !brief.constraints.keep.includes(r.name)).map((r) => r.name);
const ins = brief.candidates.map((c) => c.name);
const swaps = [{out: outs[0], in: ins[0], role: "Removal", why: "It answers threats for less."}, {out: outs[1], in: ins[1], role: "Draw", why: "It keeps the hand full."}];
const html = readFileSync(path.join(ROOT, "index.html"), "utf8").replace("</head>", `<meta name="crankmagic-accounts" content="on"></head>`);

const {browser, base, stub, close} = await openBrowser({name: "advisor-page", flag: "GEOMETRY_REQUIRED"});
async function person({open = true, advise = null} = {}) {
  const context = await browser.newContext({viewport: {width: 1400, height: 900}, serviceWorkers: "block"});
  const page = await context.newPage();
  if (stub) await stub(page);
  await loadLiveState(page, base);
  await page.route(`${base}/index.html*`, (r) => r.fulfill({contentType: "text/html; charset=utf-8", body: html}));
  await page.route(`${base}/api/me`, (r) => r.fulfill({json: {email: "rob@example.com"}}));
  await page.route(`${base}/api/library**`, (r) => r.request().method() === "GET" ? r.fulfill({json: {head: null}})
    : r.fulfill({json: {head: {id: "00000000-0000-4000-8000-000000000000", revision: 1, checksum: "x", device: "test", createdAt: new Date().toISOString()}}}));
  await page.route(`${base}/api/ai-advise`, (r) => r.fulfill({json: {open}}));
  const sent = [];
  await page.route(`${base}/api/ai/advise`, (r) => {sent.push({body: JSON.parse(r.request().postData() || "{}"), header: r.request().headers()["x-crankmagic"]}); return advise(r);});
  await page.goto("about:blank");
  await page.goto(`${base}/index.html#decks?deck=${encodeURIComponent(DECK)}`);
  await page.locator(".cm-deck-hero").waitFor({timeout: 60000});
  return {context, page, sent};
}
const more = async (page) => {await page.locator(".cm-deck-actions [data-action=deck-more-menu]").click(); await page.locator(".cm-tile-menu").waitFor({timeout: 10000});};
const upgradesOf = (page) => page.evaluate(async (deckId) => {const r = await CrankRepository.open(); try {const s = await r.getState(); const d = s.decks.find((x) => x.id === deckId);
  const name = (id) => (s.cards[id] || {}).name; return d.slots.filter((x) => x.purpose === "upgrade").map((x) => ({in: name(x.cardId), out: name((d.slots.find((m) => m.id === x.replaces) || {}).cardId), committed: x.committed}));} finally {r.close();}}, DECK);

try {
  /* 1. Not offered where the door would not answer. */
  {
    const {context, page} = await person({open: false});
    await page.waitForTimeout(500);
    await more(page);
    eq(await page.locator("[data-action=deck-advise]").count(), 0, "where GET /api/ai-advise says closed, the More menu has no Ask the AI advisor");
    await context.close();
  }
  /* 2-3. Asked, reviewed, ticked, saved. */
  {
    const advise = (r) => r.fulfill({json: {changes: swaps, keep: [], summary: "Two swaps for more interaction.", dropped: 1, model: "claude-haiku-5-5", savedAt: "2026-10-11T09:30:00Z", meter: {spentCents: 0.4, capCents: 25}}});
    const {context, page, sent} = await person({advise});
    await page.waitForFunction(() => true);
    await page.waitForTimeout(500);
    const before = await upgradesOf(page);
    await more(page);
    await page.locator("[data-action=deck-advise]").click();
    await page.locator("#cm-advise-ask").fill("more removal");
    await page.locator("[data-action=deck-advise-send]").click();
    await page.locator("#cm-advise-out input[name=advise]").first().waitFor({timeout: 15000});
    eq(sent.map((x) => [x.body, x.header]), [[{deckId: DECK, ask: "more removal"}, "ai"]], "the page sends the deck's id and the goal, with the AI door's header, and nothing more");
    const rows = await page.locator("#cm-advise-out li").allInnerTexts();
    eq(rows.length, 2, "each swap is a row to tick");
    ok(rows[0].includes(`${swaps[0].out} → ${swaps[0].in}`) && rows[0].includes(swaps[0].why) && rows[0].includes("Removal"), `with the cards out and in, the role and the why (${rows[0].replace(/\s+/g, " ")})`);
    const said = (await page.locator("#cm-advise-out").innerText()).replace(/\s+/g, " ");
    ok(/Two swaps for more interaction\./.test(said) && /1 proposed swap named a card not in this deck/.test(said) && /as saved Oct 11/.test(said) && /0\.4¢ of your 25¢ today/.test(said),
      `the summary, the dropped swap counted, when the library it read was saved, and the meter (${said})`);
    eq(await upgradesOf(page), before, "nothing has changed while the answer is read");
    await page.locator("#cm-advise-out input[name=advise][value='1']").uncheck();
    await page.locator("[data-action=deck-advise-save]").click();
    await page.waitForFunction(() => !document.querySelector("#cm-dialog[open]"), null, {timeout: 15000});
    const after = await upgradesOf(page);
    eq(after.filter((x) => !before.some((y) => y.in === x.in && y.out === x.out)), [{in: swaps[0].in, out: swaps[0].out, committed: false}],
      "Save ticked as upgrades saves the ticked swap as D1's linked upgrade -- the card in for the card out's slot, not yet committed -- and the unticked one not at all");
    await page.waitForFunction(() => /Saved 1 swap as upgrade/.test(document.getElementById("cm-notice")?.textContent || ""), null, {timeout: 10000});
    ok(true, "and says it saved one swap as an upgrade, on the Upgrades tab");
    await context.close();
  }
  /* 4. Signed in to the library only: the door's own sign-in, back to the deck. */
  {
    const {context, page} = await person({advise: (r) => r.fulfill({status: 401, json: {error: "Sign in to CrankMagic's AI features to use them."}})});
    await page.waitForTimeout(500);
    await more(page);
    await page.locator("[data-action=deck-advise]").click();
    await page.locator("[data-action=deck-advise-send]").click();
    const link = page.locator("#cm-advise-out a[href^='/api/ai/login']");
    await link.waitFor({timeout: 15000});
    eq(await link.getAttribute("href"), `/api/ai/login?to=${encodeURIComponent(`#decks?deck=${DECK}`)}`, "signed in to the library only, the page offers the AI door's sign-in, coming back to this deck");
    await context.close();
  }
} finally {
  await close();
}
console.log(`advisor-page: ${checks} checks passed — Ask the AI advisor, offered only where the door would answer; the deck's id and the goal sent, nothing more; swaps reviewed and saved as upgrades, nothing else changed.`);
