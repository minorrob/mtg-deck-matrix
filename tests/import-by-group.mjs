/* THE IMPORT SPEAKS IN CARD STATES, BY GROUP (Rob, 2026-09-28; docs/plan-groups.md §6, G5). "What does this input
 * represent?" became "What are these cards?", asked after the group, in the words the group allows:
 *
 *   Any group        Copies I own · Copies I ordered (Arriving by trade is a tick, not a kind) · A list · An edited sheet
 *   A deck's group   In this deck's box · Owned, for this deck · Ordered for this deck · On this deck's list
 *   Gone             "Copies arriving by trade" (a detail of Ordered) and "Order confirmation" (Orders › Paste receipt)
 *
 * Each is proved by importing into Rob's restored library: into D1's box (a card its list wants is reserved to its seat),
 * onto D1's list (the count goes up), owned into To Trade (offered), ordered by trade (channel trade).
 * Needs Playwright (GEOMETRY_REQUIRED=1 makes its absence a failure).
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
const records = JSON.parse(readFileSync(path.join(ROOT, "data", "cards.json"), "utf8")).cards;

const {browser, base, stub, close} = await openBrowser({name: "import-by-group", flag: "GEOMETRY_REQUIRED"});
try {
  const context = await browser.newContext({viewport: {width: 1280, height: 900}, serviceWorkers: "block"});
  const page = await context.newPage();
  if (stub) await stub(page);
  await page.addInitScript(() => (globalThis.CrankFeatures ||= []).push((C) => {globalThis.__cm = C;}));
  await loadLiveState(page, base);
  const d1 = await page.evaluate(() => {const C = globalThis.__cm, d = C.state.decks.find((x) => /^D1 /.test(x.name)), g = C.state.groups.find((x) => x.id === d.groupId);
    const need = C.M.projection(C.state).find((r) => r.kind === "need" && r.deckId === d.id);
    return {id: d.id, gid: d.groupId, label: C.groupLabel(g), names: d.slots.filter((r) => r.purpose === "main").map((r) => C.card(r.cardId)?.name), needName: need && C.card(need.cardId).name, needSlot: need && need.slotId};});
  ok(!!d1.needName, `D1 still needs a card to buy (${d1.needName})`);
  const fresh = records.find((c) => c.commander !== true && !c.name.includes("//") && (c.colorIdentity || []).length === 1 && (c.colorIdentity || [])[0] === "W" && !/Basic Land/.test(c.typeLine || "") && !d1.names.includes(c.name));

  const open = async () => {
    await page.goto(`${base}/index.html#cards`);
    await page.locator(".cm-subnav a", {hasText: "Upload cards"}).waitFor({timeout: 60000});
    await page.locator(".cm-subnav a", {hasText: "Upload cards"}).click();
    await page.locator("#cm-dialog[open] h2", {hasText: "Import cards or a deck list"}).waitFor();
  };
  const modes = () => page.locator("#cm-dialog [name=mode] option").evaluateAll((os) => os.map((o) => o.value));
  const run = async (text) => {
    await page.fill("#cm-dialog textarea[name=text]", text);
    await page.click("#cm-dialog button[type=submit]");
    await page.locator("#cm-dialog[open] h2", {hasText: "Review import"}).waitFor({timeout: 60000});
    await page.click("#cm-import-commit");
    await page.waitForFunction(() => !document.querySelector("#cm-dialog[open]"), null, {timeout: 30000});
  };

  /* THE WORDS */
  await open();
  eq(await page.locator("#cm-dialog label", {hasText: "What are these cards?"}).count(), 1, "the question is What are these cards?");
  eq(await page.locator("#cm-dialog label", {hasText: "What does this input represent?"}).count(), 0, "the old question is gone");
  eq(await modes(), ["owned", "ordered", "draft", "edited"], "any group: owned, ordered, a list, an edited sheet — no trade kind, no order confirmation");
  ok(await page.locator("#cm-import-bytrade").isHidden(), "Arriving by trade shows only for Ordered");
  await page.selectOption("#cm-dialog [name=mode]", "ordered");
  ok(await page.locator("#cm-import-bytrade").isVisible(), "and shows for Ordered");
  await page.selectOption("#cm-dialog [name=group]", d1.gid);
  eq(await modes(), ["box", "owned", "ordered", "list"], "a deck's group: its box, owned for it, ordered for it, its list");
  await shot(page, "import-deck-group-1280");

  /* IN THIS DECK'S BOX: a card D1's list wants goes in, reserved to its seat */
  await page.selectOption("#cm-dialog [name=mode]", "box");
  await run(`1 ${d1.needName}`);
  const boxed = await page.evaluate(([deckId, slotId]) => globalThis.__cm.state.lots.filter((l) => l.location?.kind === "deck" && l.location.deckId === deckId && l.allocation?.slotId === slotId).length, [d1.id, d1.needSlot]);
  eq(boxed >= 1, true, `${d1.needName} is in D1's box, reserved to the seat that wanted it`);

  /* ON THIS DECK'S LIST: the count goes up; no copy is made */
  const lotsBefore = await page.evaluate(() => globalThis.__cm.state.lots.length);
  await open();
  await page.selectOption("#cm-dialog [name=group]", d1.gid);
  await page.selectOption("#cm-dialog [name=mode]", "list");
  await run(`1 ${fresh.name}`);
  const listed = await page.evaluate(([deckId, name]) => {const C = globalThis.__cm; return C.state.decks.find((d) => d.id === deckId).slots.filter((r) => r.purpose === "main" && C.card(r.cardId)?.name === name).reduce((n, r) => n + r.quantity, 0);}, [d1.id, fresh.name]);
  eq(listed, 1, `${fresh.name} is on D1's list`);
  eq(await page.evaluate(() => globalThis.__cm.state.lots.length), lotsBefore, "and no copy was made: a list is not ownership");

  /* OWNED INTO TO TRADE: offered */
  await open();
  await page.selectOption("#cm-dialog [name=group]", "group:to-trade");
  await page.selectOption("#cm-dialog [name=mode]", "owned");
  await run(`1 ${fresh.name}`);
  const offered = await page.evaluate((name) => {const C = globalThis.__cm; return C.state.lots.filter((l) => C.card(l.cardId)?.name === name && l.groupIds.includes("group:to-trade")).map((l) => l.offer);}, fresh.name);
  eq(offered, ["available"], "a copy imported into To Trade is offered");

  /* ORDERED, ARRIVING BY TRADE */
  await open();
  await page.selectOption("#cm-dialog [name=group]", "");
  await page.fill("#cm-dialog [name=name]", "Trade with Sam");
  await page.selectOption("#cm-dialog [name=mode]", "ordered");
  await page.check("#cm-dialog [name=byTrade]");
  await run(`1 ${fresh.name}`);
  const traded = await page.evaluate((name) => {const C = globalThis.__cm, g = C.state.groups.find((x) => x.name === "Trade with Sam"); return C.state.lots.filter((l) => C.card(l.cardId)?.name === name && l.groupIds.includes(g.id)).map((l) => [l.source, l.channel]);}, fresh.name);
  eq(traded, [["ordered", "trade"]], "Ordered with Arriving by trade is an ordered copy whose channel is trade");
  await context.close();
} finally {
  await close();
}
console.log(`import-by-group: ${checks} checks passed — the import asks What are these cards? after the group, in its state words, and each lands where it says.`);
