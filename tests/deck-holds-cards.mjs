/* A DECK HOLDS CARDS WHETHER OR NOT IT IS FINAL (Rob, 2026-09-28; docs/plan-groups.md, G3).
 *
 * Rob loaded the cards he owns for a Quintorius deck into a group, made the deck from the group, and found every
 * copy still on the Bench. Going to the Library to move them, he was told "Finalize a deck first — a draft holds no
 * reservations to confirm", and finalizing needs a legal hundred he did not have yet. So:
 *
 *   Upload   his owned cards go into a new group through Library › Upload cards
 *   Deck     New deck from that group offers to put the copies he owns in the deck's box, ticked; they go in,
 *            each one the list calls for reserved for its seat (Target), the rest as substitutes
 *   Library  "Put in a physical deck" lists a draft deck, and no "Finalize a deck first" is left anywhere
 *   Model    the model's own rule is in tests/collection-model.mjs (a draft deck reserves and holds copies)
 *
 * Needs Playwright (GEOMETRY_REQUIRED=1 makes its absence a failure).
 */
import assert from "node:assert/strict";
import {readFileSync, mkdirSync} from "node:fs";
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

/* Nothing in the app says "Finalize a deck first" any more, except where a finished list really is the point. */
{
  const src = readFileSync(path.join(ROOT, "crankmagic-collection.js"), "utf8");
  eq((src.match(/Finalize a deck first — a draft holds no/g) || []).length, 0, "no \"Finalize a deck first — a draft holds no …\" is left in the Library");
  eq((src.match(/(finals|decks)=C\.state\.decks\.filter\(d=>!d\.archived&&d\.status==='final'\)/g) || []).length, 2, "of the Library's deck lists, only Ready to add's two (the roster menu and its picker, which read a finished list) are limited to finalized decks: the three that put copies in a deck list every deck");
}

/* The cards: Quintorius and eight cards the catalog has in full. */
const records = JSON.parse(readFileSync(path.join(ROOT, "data", "cards.json"), "utf8")).cards;
const leader = records.find((c) => /^Quintorius, Loremaster$/.test(c.name));
const others = records.filter((c) => !c.name.includes("//") && (c.colorIdentity || []).every((x) => ["R", "W"].includes(x)) && c.name !== leader.name && !/Basic Land/.test(c.typeLine || "")).slice(0, 8);
const LIST = [leader, ...others].map((c) => `1 ${c.name}`).join("\n");

const {browser, base, stub, close} = await openBrowser({name: "deck-holds-cards", flag: "GEOMETRY_REQUIRED"});
try {
  const context = await browser.newContext({viewport: {width: 1280, height: 900}, serviceWorkers: "block"});
  const page = await context.newPage();
  if (stub) await stub(page);
  await page.addInitScript(() => (globalThis.CrankFeatures ||= []).push((C) => {globalThis.__cm = C;}));

  /* UPLOAD: the owned cards into a new group */
  await page.goto(`${base}/index.html#cards`);
  await page.locator(".cm-subnav a", {hasText: "Upload cards"}).waitFor({timeout: 60000});
  await page.locator(".cm-subnav a", {hasText: "Upload cards"}).click();
  await page.locator("#cm-dialog[open] h2", {hasText: "Import cards or a deck list"}).waitFor();
  await page.selectOption("#cm-dialog [name=mode]", "owned");
  await page.fill("#cm-dialog [name=name]", "Quintorius pile");
  await page.fill("#cm-dialog textarea[name=text]", LIST);
  await page.click("#cm-dialog button[type=submit]");
  await page.locator("#cm-dialog[open] h2", {hasText: "Review import"}).waitFor({timeout: 60000});
  await page.click("#cm-import-commit");
  await page.waitForFunction(() => globalThis.__cm.state.groups.some((g) => g.name === "Quintorius pile") && globalThis.__cm.state.lots.length >= 9, null, {timeout: 30000});
  const before = await page.evaluate(() => {const g = globalThis.__cm.state.groups.find((x) => x.name === "Quintorius pile"); return {gid: g.id, bench: globalThis.__cm.state.lots.filter((l) => l.groupIds.includes(g.id) && l.location?.kind === "bench").length};});
  eq(before.bench, 9, "the 9 owned cards are on the Bench, filed in the new group");

  /* DECK: New deck › Create › The cards in a collection group › the group */
  await page.goto(`${base}/index.html#decks`);
  await page.locator("[data-action=new-deck]").first().waitFor({timeout: 60000});
  await page.locator("[data-action=new-deck]").first().click();
  await page.locator("#cm-dialog [data-action=wizard-create]").click();
  await page.selectOption("#cm-dialog [name=how]", "group");
  await page.selectOption("#cm-dialog [name=groupId]", before.gid);
  ok(/draft deck whose list is the 9 cards in Quintorius pile/.test(await page.locator("#cm-new-deck-road").innerText()), "the wizard says what Continue makes: a draft deck whose list is the group's 9 cards");
  await page.click("#cm-dialog button[type=submit]");
  await page.locator("#cm-dialog[open] h2", {hasText: "New deck from Quintorius pile"}).waitFor();
  const move = page.locator("#cm-dialog [name=move]");
  ok(await move.isChecked() && /Put the 9 copies you own from Quintorius pile \(now on the Bench\) in the deck's box/.test(await page.locator("#cm-dialog label.cm-checkbox").innerText()), "New deck from the group offers, ticked, to put the 9 copies in the deck's box");
  await shot(page, "new-deck-from-group-1280");
  await page.click("#cm-dialog button[type=submit]");
  await page.locator(".cm-deck-hero h1").waitFor({timeout: 30000});
  const after = await page.evaluate((gid) => {
    const C = globalThis.__cm, d = C.state.decks.find((x) => x.groupId === gid), read = C.M.stateReader(C.state);
    const mine = C.state.lots.filter((l) => l.groupIds.includes(gid));
    return {status: d.status, inBox: mine.filter((l) => l.location?.kind === "deck" && l.location.deckId === d.id).length,
      roles: [...new Set(mine.map((l) => read({...l, kind: "lot"}).role))], reserved: mine.filter((l) => l.allocation?.deckId === d.id).length, name: d.name};
  }, before.gid);
  eq([after.status, after.inBox, after.reserved, after.roles], ["draft", 9, 9, ["target"]], "the draft deck holds all 9 copies in its box, each reserved for its seat: Target, not Bench");
  await shot(page, "draft-deck-with-copies-1280");

  /* LIBRARY: Put in a physical deck lists the draft deck */
  await page.goto(`${base}/index.html#cards`);
  await page.locator(".cm-table tbody tr input[type=checkbox]").first().waitFor({timeout: 60000});
  await page.locator(".cm-table tbody tr input[type=checkbox]").first().check();
  await page.locator("[data-action=batch-place]").first().click();
  await page.locator("#cm-dialog[open] h2", {hasText: "Put these copies in a physical deck"}).waitFor();
  const options = await page.locator("#cm-dialog [name=deckId] option").allInnerTexts();
  ok(options.includes(after.name), `Put in a physical deck lists the draft deck (${options.join(", ")})`);
  await context.close();
} finally {
  await close();
}
console.log(`deck-holds-cards: ${checks} checks passed — owned cards uploaded into a group go into the draft deck made from it, reserved for their seats, and the Library offers a draft deck as a place for copies.`);
