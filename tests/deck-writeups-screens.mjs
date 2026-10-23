/* THE DECK WRITE-UPS ON SCREEN (requirements DPG-2 to DPG-8; Rob, 2026-10-23). In a real page with the committed
 * library restored (data/live-state.json, whose D1-D7 are older decks than the 10-21 backup's):
 *
 *   1. Settings › Data › Apply deck write-ups previews before it changes anything: the decks whose id and commanders
 *      match a write-up, the decks whose commanders differ (never written over), the write-ups with no deck, and the
 *      notes that stay because nobody's backup wrote them. Apply is one change, and Undo takes all of it back.
 *   2. The deck header shows the description where the notes used to be, and never the notes.
 *   3. Overview opens with How to play, a numbered list of the deck's steps.
 *   4. The notes are the owner's: under "Your notes" in Guide & SWOT and in the edit form.
 *   5. The edit form has Description and How to play (one step per line); three steps are refused in plain words.
 *
 * Needs Playwright and Chromium; GEOMETRY_REQUIRED=1 (CI) turns a missing browser into a failure.
 */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {openBrowser, loadLiveState} from "./uat/browser-runner.mjs";

let checks = 0;
const ok = (cond, msg) => { checks++; assert.ok(cond, msg); };
const eq = (a, b, msg) => { checks++; assert.deepEqual(a, b, msg); };
const W = JSON.parse(readFileSync(new URL("../data/deck-writeups-2026-10-23.json", import.meta.url), "utf8")).decks;

const {browser, base, stub, close} = await openBrowser({name: "deck-writeups-screens", flag: "GEOMETRY_REQUIRED"});
try {
  const context = await browser.newContext({viewport: {width: 1400, height: 900}, serviceWorkers: "block"});
  const page = await context.newPage();
  if (stub) await stub(page);
  await page.addInitScript(() => (globalThis.CrankFeatures ||= []).push((C) => {globalThis.__cm = C;}));
  await loadLiveState(page, base);
  const deck = (id) => page.evaluate((x) => {const d = globalThis.__cm.state.decks.find((d) => d.id === x); return {description: d.description, howToPlay: d.howToPlay, notes: d.notes};}, id);
  const before = await deck("deck:live:D6");
  ok(before.notes && !before.description, "D6 starts with its old notes and no description");

  /* 1. The preview, then Apply, then Undo, then Apply again. */
  const openApply = async () => {
    await page.goto(`${base}/index.html#settings`);
    await page.getByRole("button", {name: "Apply deck write-ups…", exact: true}).click();
    await page.locator("#cm-writeups-preview").waitFor({timeout: 30000});
  };
  await openApply();
  const preview = await page.evaluate(() => ({
    todo: [...document.querySelectorAll("[data-writeup]")].map((x) => x.dataset.writeup),
    kept: [...document.querySelectorAll("[data-kept]")].map((x) => x.dataset.kept),
    unmatched: Object.fromEntries([...document.querySelectorAll("[data-unmatched]")].map((x) => [x.dataset.unmatched, x.textContent]))}));
  eq(preview.todo, ["D2", "D4", "D6"], "the three decks whose id and commander match their write-up");
  eq(preview.kept, ["D2", "D4", "D6"], "their notes are not the backup's text, so they stay");
  for (const id of ["D1", "D3", "D5", "D7"]) ok(/leads with/.test(preview.unmatched[id] || ""), `${id} here leads with another commander, so its write-up is not applied: ${preview.unmatched[id]}`);
  eq(Object.keys(preview.unmatched).length, 31, "and the 27 decks this library does not have are listed too");
  eq((await deck("deck:live:D6")).description, undefined, "nothing changes before Apply");
  const revision = await page.evaluate(() => globalThis.__cm.state.revision);
  await page.getByRole("button", {name: "Apply to 3 decks", exact: true}).click();
  await page.waitForFunction((r) => globalThis.__cm.state.revision === r + 1, revision);
  eq((await deck("deck:live:D6")).description, W.D6.description, "Apply writes D6's description");
  eq((await deck("deck:live:D2")).howToPlay, W.D2.howToPlay, "and D2's How to play");
  eq((await deck("deck:live:D1")).description, undefined, "and leaves D1, whose commander differs, alone");
  eq((await deck("deck:live:D6")).notes, before.notes, "the owner's notes are kept");
  await page.evaluate(() => globalThis.__cm.actions.undo());
  await page.waitForFunction((r) => globalThis.__cm.state.revision !== r + 1, revision);
  eq((await deck("deck:live:D6")).description, undefined, "one Undo takes the whole change back");
  await openApply();
  await page.getByRole("button", {name: "Apply to 3 decks", exact: true}).click();
  await page.waitForFunction(() => !!globalThis.__cm.state.decks.find((d) => d.id === "deck:live:D6").description);

  /* 2 and 3. The header and Overview. */
  await page.goto(`${base}/index.html#decks?deck=${encodeURIComponent("deck:live:D6")}`);
  await page.locator("#cm-sec-how-to-play").waitFor({timeout: 30000});
  eq(await page.locator(".cm-deck-hero .cm-deck-strategy").textContent(), W.D6.description, "the header shows the description");
  ok(!(await page.locator(".cm-deck-hero").textContent()).includes(before.notes), "and not the notes");
  eq(await page.locator("#cm-sec-how-to-play h2").textContent(), "How to play");
  eq(await page.locator("#cm-sec-how-to-play ol > li").allTextContents(), W.D6.howToPlay, "How to play is the deck's steps, numbered");
  eq(await page.evaluate(() => document.querySelector(".cm-deck-tabs")?.nextElementSibling?.id), "cm-sec-how-to-play", "Overview opens with How to play, right under the tabs");

  /* 4. Your notes, in Guide & SWOT. */
  await page.evaluate(() => globalThis.__cm.actions["deck-guide"]?.({dataset: {deck: "deck:live:D6"}}));
  const guide = page.locator("dialog #cm-sec-guide");
  if (await guide.count()) {
    ok((await guide.textContent()).includes("Your notes") && (await guide.textContent()).includes(before.notes), "Guide & SWOT keeps the notes under Your notes");
    await page.evaluate(() => globalThis.__cm.actions.close());
  }

  /* 5. The edit form. */
  await page.evaluate(() => globalThis.__cm.actions["edit-deck"]({dataset: {deck: "deck:live:D6"}}));
  const form = page.locator("dialog form");
  eq(await form.locator("textarea[name=description]").inputValue(), W.D6.description, "the edit form has the description");
  eq((await form.locator("textarea[name=howToPlay]").inputValue()).split("\n"), W.D6.howToPlay, "and How to play, one step per line");
  ok((await form.textContent()).includes("Your notes"), "and the notes, as Your notes");
  await form.locator("textarea[name=howToPlay]").fill("One.\nTwo.\nThree.");
  await form.locator("[type=submit]").click();
  await form.locator(".cm-error").waitFor({state: "visible", timeout: 10000});
  eq(await form.locator(".cm-error").textContent(), "How to play is 4 to 6 steps; this one has 3.", "three steps are refused, in plain words");
  eq((await deck("deck:live:D6")).howToPlay, W.D6.howToPlay, "and nothing changes");
  await form.locator("textarea[name=howToPlay]").fill("One.\nTwo.\nThree.\nFour.");
  await form.locator("textarea[name=description]").fill("A shorter line.");
  await form.locator("[type=submit]").click();
  await page.waitForFunction(() => globalThis.__cm.state.decks.find((d) => d.id === "deck:live:D6").description === "A shorter line.");
  eq((await deck("deck:live:D6")).howToPlay, ["One.", "Two.", "Three.", "Four."], "four steps save");
} finally {
  await close();
}
console.log(`deck-writeups-screens: ${checks} checks passed — the write-ups previewed, applied in one undoable change, the description in the header and How to play opening Overview.`);
