/* ADD / MOVE TO GROUP (Rob, 2026-09-28; docs/plan-groups.md, G4). One action where the Library had three -- Put in a
 * physical deck, Move physically to Bench, Add to a group -- because a group is a place or a list.
 *
 *   Choices   the Bench first, then the decks, the piles and the lists, and New group… at the foot
 *   Deck      the copies go in the deck's box and are filed in its group
 *   Trade     out of the box, offered for Sell / Trade, filed in the pile
 *   Bench     back on the Bench, off Sell / Trade, out of the pile
 *   General   filed in the list; nothing moves
 *   New group a Commander deck made from the ticked copies opens New deck from the group
 *   Menus     the row menu has the one action; the Library's bar has no Ordered… / Bought in store / Arrived (D1);
 *             the To buy tab keeps them
 *
 * On Rob's library, restored through the app. Needs Playwright (GEOMETRY_REQUIRED=1 makes its absence a failure).
 */
import assert from "node:assert/strict";
import {mkdirSync} from "node:fs";
import path from "node:path";
import {openBrowser, loadLiveState} from "./uat/browser-runner.mjs";

let checks = 0;
const ok = (c, m) => {assert.ok(c, m); checks += 1;};
const eq = (a, b, m) => {assert.deepEqual(a, b, m); checks += 1;};
const SHOTS = process.env.UAT_SHOTS || "";
if (SHOTS) mkdirSync(SHOTS, {recursive: true});
const shot = async (page, name) => {if (SHOTS) await page.screenshot({path: path.join(SHOTS, `${name}.png`)});};

const {browser, base, stub, close} = await openBrowser({name: "move-to-group", flag: "GEOMETRY_REQUIRED"});
try {
  const context = await browser.newContext({viewport: {width: 1280, height: 900}, serviceWorkers: "block"});
  const page = await context.newPage();
  if (stub) await stub(page);
  await page.addInitScript(() => (globalThis.CrankFeatures ||= []).push((C) => {globalThis.__cm = C;}));
  await loadLiveState(page, base);

  /* Two owned copies on the Bench, of two cards, free and not offered. */
  const pick = await page.evaluate(() => {
    const C = globalThis.__cm, seen = new Set(), names = new Map();
    for (const l of C.state.lots) names.set(l.cardId, (names.get(l.cardId) || 0) + 1);
    const lots = C.state.lots.filter((l) => l.source === "owned" && l.location?.kind === "bench" && !l.allocation && l.offer === "none" && names.get(l.cardId) === 1 && !seen.has(l.cardId) && seen.add(l.cardId)).slice(0, 2);
    return lots.map((l) => ({id: l.id, name: C.card(l.cardId).name}));
  });
  eq(pick.length, 2, "two free Bench copies to move");
  const lotOf = (id) => page.evaluate((x) => {const l = globalThis.__cm.state.lots.find((y) => y.id === x); return {kind: l.location?.kind, deckId: l.location?.deckId || "", offer: l.offer, groups: l.groupIds};}, id);
  const tick = async () => {
    await page.goto(`${base}/index.html#cards`);
    await page.locator("#cm-roster-query").waitFor({timeout: 60000});
    for (const p of pick) {
      await page.fill("#cm-roster-query", p.name);
      await page.locator(`tr[data-record="${p.id}"] input[type=checkbox]`).check();
    }
  };
  const move = async (label) => {
    await page.locator("[data-action=batch-move]").first().click();
    await page.locator("#cm-dialog[open] h2", {hasText: "Add / move 2 records to a group"}).waitFor();
    const value = await page.locator("#cm-dialog [name=groupId] option", {hasText: label}).first().getAttribute("value");
    await page.selectOption("#cm-dialog [name=groupId]", value);
    await page.click("#cm-dialog button[type=submit]");
    await page.locator("#cm-dialog[open] button[type=submit]", {hasText: "Confirm change"}).click({timeout: 15000}).catch(async (err) => {throw Error(`no review: ${await page.locator("#cm-dialog").innerText()}`);});
    await page.locator("#cm-dialog[open]").waitFor({state: "detached", timeout: 30000}).catch(() => {});
    await page.waitForFunction(() => !document.querySelector("#cm-dialog[open]"), null, {timeout: 30000});
  };

  /* MENUS: the Library's bar and a row's menu */
  await tick();
  const bar = await page.locator(".cm-batch-bar button").allInnerTexts();
  ok(bar.some((x) => /Add \/ move to group/.test(x)) && !bar.some((x) => /^(Ordered…|Bought in store|Arrived|Put in a physical deck|Move physically to Bench|Add to a group)$/.test(x.trim())), `the Library's bar has one Add / move to group, and no Ordered… / Bought in store / Arrived (${bar.join(" | ")})`);

  /* CHOICES */
  await page.locator("[data-action=batch-move]").first().click();
  const choices = await page.locator("#cm-dialog [name=groupId] option").allInnerTexts();
  ok(choices[0] === "Bench" && / · Commander deck$/.test(choices[1]) && choices.at(-1) === "New group…", `the Bench first, then the decks, New group… last (${choices.join(" | ")})`);
  ok(!(await page.locator("#cm-dialog [name=name]").isVisible()) && !(await page.locator("#cm-dialog [name=template]").isVisible()), "a name and template are asked only for New group…");
  await shot(page, "move-to-group-1280");
  await page.locator("#cm-dialog [data-action=close]").first().click();

  /* DECK: into D1's box, filed in its group */
  const d1 = await page.evaluate(() => {const C = globalThis.__cm, d = C.state.decks.find((x) => /^D1 /.test(x.name)); return {id: d.id, name: d.name, gid: d.groupId};});
  await move(d1.name);
  for (const p of pick) {const l = await lotOf(p.id); ok(l.kind === "deck" && l.deckId === d1.id && l.groups.includes(d1.gid), `${p.name} is in ${d1.name}'s box and filed in its group`);}

  /* GENERAL: a new list; nothing moves */
  await tick();
  await page.locator("[data-action=batch-move]").first().click();
  await page.selectOption("#cm-dialog [name=groupId]", "__new");
  await page.fill("#cm-dialog [name=name]", "Proliferate");
  await page.click("#cm-dialog button[type=submit]");
  await page.locator("#cm-dialog[open] button[type=submit]", {hasText: "Confirm change"}).click();
  await page.waitForFunction(() => !document.querySelector("#cm-dialog[open]"), null, {timeout: 30000});
  const listId = await page.evaluate(() => globalThis.__cm.state.groups.find((g) => g.name === "Proliferate")?.id);
  for (const p of pick) {const l = await lotOf(p.id); ok(l.kind === "deck" && l.deckId === d1.id && l.groups.includes(listId), `${p.name} is filed in Proliferate and is still in ${d1.name}'s box`);}
  eq(await page.evaluate(() => globalThis.__cm.state.groups.find((g) => g.name === "Proliferate").template), "general", "Proliferate is a General group");

  /* TRADE: out of the box, offered, filed in the pile */
  await tick();
  await move("To Trade · To sell / trade");
  for (const p of pick) {const l = await lotOf(p.id); ok(l.kind === "bench" && l.offer === "available" && l.groups.includes("group:to-trade"), `${p.name} is out of the box and offered in To Trade`);}

  /* BENCH: off Sell / Trade, out of the pile */
  await tick();
  await move("Bench");
  for (const p of pick) {const l = await lotOf(p.id); ok(l.kind === "bench" && l.offer === "none" && !l.groups.includes("group:to-trade"), `${p.name} is back on the Bench, off Sell / Trade and out of To Trade`);}

  /* NEW GROUP › Commander deck: refused, and nothing made, when no ticked card can lead; with a leader, New deck opens */
  await tick();
  await page.locator("[data-action=batch-move]").first().click();
  await page.selectOption("#cm-dialog [name=groupId]", "__new");
  await page.fill("#cm-dialog [name=name]", "Pair pile");
  await page.selectOption("#cm-dialog [name=template]", "commander");
  await page.click("#cm-dialog button[type=submit]");
  await page.locator("#cm-dialog .cm-error", {hasText: "None of these cards can lead a Commander deck"}).waitFor();
  ok(!(await page.evaluate(() => globalThis.__cm.state.groups.some((g) => g.name === "Pair pile"))), "no leader among the ticked cards: refused, and no group is left behind");
  await page.locator("#cm-dialog [data-action=close]").first().click();
  const leader = await page.evaluate(() => {const C = globalThis.__cm, l = C.state.lots.find((x) => {const c = C.card(x.cardId); return x.source === "owned" && x.location?.kind === "bench" && !x.allocation && x.offer === "none" && c?.commander && c.legalities?.commander === "legal";}); return {id: l.id, name: C.card(l.cardId).name};});
  await page.fill("#cm-roster-query", leader.name);
  await page.locator(`tr[data-record="${leader.id}"] input[type=checkbox]`).check();
  await page.locator("[data-action=batch-move]").first().click();
  await page.selectOption("#cm-dialog [name=groupId]", "__new");
  await page.fill("#cm-dialog [name=name]", "Pair pile");
  await page.selectOption("#cm-dialog [name=template]", "commander");
  await page.click("#cm-dialog button[type=submit]");
  await page.locator("#cm-dialog[open] h2", {hasText: "New deck from Pair pile"}).waitFor({timeout: 30000});
  checks += 1;
  await page.locator("#cm-dialog [data-action=close]").first().click();

  /* ROW MENU: one action where it had three */
  await page.goto(`${base}/index.html#cards`);
  await page.fill("#cm-roster-query", pick[0].name);
  await page.locator(`tr[data-record="${pick[0].id}"] [data-action=row-actions]`).click();
  const items = await page.locator(".cm-row-menu button").allInnerTexts();
  ok(items.some((x) => /^Add \/ move to group/.test(x.trim())) && !items.some((x) => /Put in physical deck|Move physically to Bench|as a substitute/.test(x)), `the row menu has Add / move to group, and none of the three it replaces (${items.join(" | ")})`);
  await page.keyboard.press("Escape");

  /* TO BUY keeps its order buttons */
  await page.goto(`${base}/index.html#cards?tab=buy`);
  await page.locator("[data-action=clear-filters]").first().click();
  await page.locator(".cm-table tbody tr input[type=checkbox]").first().waitFor({timeout: 60000});
  await page.locator(".cm-table tbody tr input[type=checkbox]").first().check();
  const buyBar = await page.locator(".cm-batch-bar button").allInnerTexts();
  ok(["Ordered…", "Bought in store", "Arrived"].every((x) => buyBar.some((y) => y.trim() === x)), `the To buy tab keeps Ordered…, Bought in store and Arrived (${buyBar.join(" | ")})`);
  await context.close();
} finally {
  await close();
}
console.log(`move-to-group: ${checks} checks passed — one Add / move to group: into a deck's box, a Sell / Trade pile, back to the Bench, or onto a list, and New group makes a deck.`);
