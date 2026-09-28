/* THE TABLE BY GROUP (Rob, 2026-09-28; docs/plan-groups.md G6). "The Table view shows each card once, with groups along
 * the bottom": the band is the physical groups -- the decks, the Sell / Trade piles -- and the Bench is the rail along
 * the back; every copy is on the one pile it is in.
 *
 *   Band       one pile per deck and per Sell / Trade pile, By group the default; By status one choice away, remembered
 *   Once       the piles' counts add up to the table's total: no card on two piles
 *   Spread     opening a deck shows only that deck's cards, and its stacks stay that deck's when one is opened
 *   Drop       Move to… on a copy lists the places, and a place is Add / move to group, staged in the sitting (G6b-2)
 *              and written by Review and confirm
 *   Status     Group piles by Status breaks a group into its card-state piles; there is no separate status band
 *   Lists      a General list laid on the row shows the cards filed in it, the places unchanged, remembered per device
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
const countOf = (label) => Number((/, (\d+) cards?/.exec(label || "") || [])[1] || 0);

const {browser, base, stub, close} = await openBrowser({name: "table-by-group", flag: "GEOMETRY_REQUIRED"});
try {
  const context = await browser.newContext({viewport: {width: 1400, height: 1000}, serviceWorkers: "block"});
  const page = await context.newPage();
  if (stub) await stub(page);
  await page.addInitScript(() => (globalThis.CrankFeatures ||= []).push((C) => {globalThis.__cm = C;}));
  await loadLiveState(page, base);
  const facts = await page.evaluate(() => {const C = globalThis.__cm, decks = C.state.decks.filter((d) => !d.archived && d.kind !== "lobby");
    return {decks: decks.map((d) => ({id: d.id, gid: d.groupId, name: d.name})), trade: C.state.groups.filter((g) => g.template === "trade").map((g) => g.id)};});
  await page.goto(`${base}/index.html#cards?view=tabletop`);
  await page.locator(".cm-tt-mat").waitFor({timeout: 60000});

  /* BAND */
  const band = await page.locator("[data-pile^='place:group:']").evaluateAll((bs) => bs.map((b) => b.dataset.pile.replace(/^place:/, "")));
  eq(band.slice().sort(), [...facts.decks.map((d) => d.gid), ...facts.trade].sort(), `the band is the ${facts.decks.length} decks and the Sell / Trade pile`);
  eq(await page.locator("[data-pile^='status:']").count(), 0, "no status piles along the bottom");
  await shot(page, "table-by-group-1400");

  /* ONCE */
  const labels = await page.locator("[data-pile^='place:'], [data-pile='bench']").evaluateAll((bs) => bs.map((b) => b.getAttribute("aria-label")));
  const sum = labels.reduce((n, l) => n + countOf(l), 0);
  const total = Number(((await page.locator("#cm-tt-status").innerText()).match(/([\d,]+) cop/) || [])[1].replace(/,/g, ""));
  eq(sum, total, `every copy is on exactly one pile: the piles hold ${sum}, the table ${total}`);

  /* SPREAD: D1's pile shows only D1's cards, and its stacks stay D1's */
  const d1 = facts.decks.find((d) => /^D1 /.test(d.name));
  const d1Count = countOf(await page.locator(`[data-pile='place:${d1.gid}']`).getAttribute("aria-label"));
  await page.locator(`[data-pile='place:${d1.gid}']`).click();
  await page.locator(".cm-tt-drawer:not(.is-shut) .cm-tt-card[data-record]").first().waitFor({timeout: 30000});
  const mine = (ids) => page.evaluate(([list, deckId]) => {const C = globalThis.__cm; return list.every((id) => {const l = C.state.lots.find((x) => x.id === id); if (!l) return id.includes(deckId); return (l.location?.kind === "deck" && l.location.deckId === deckId) || l.allocation?.deckId === deckId;});}, [ids, d1.id]);
  const shown = await page.locator(".cm-tt-drawer .cm-tt-card[data-record]").evaluateAll((cs) => cs.map((c) => c.dataset.record));
  ok(shown.length > 0 && await mine(shown), `D1's pile shows D1's cards only (${shown.length} on the first page of ${d1Count})`);
  const chips = page.locator("[data-pile^='group:']");
  const stackSum = (await chips.evaluateAll((cs) => cs.map((c) => c.getAttribute("aria-label")))).reduce((n, l) => n + countOf(l), 0);
  eq(stackSum, d1Count, `D1's stacks add up to D1's pile (${stackSum} of ${d1Count})`);
  await chips.first().click();
  await page.locator(".cm-tt-drawer:not(.is-shut) .cm-tt-card[data-record]").first().waitFor({timeout: 30000});
  const stack = await page.locator(".cm-tt-drawer .cm-tt-card[data-record]").evaluateAll((cs) => cs.map((c) => c.dataset.record));
  ok(stack.length > 0 && await mine(stack), "an opened stack is still D1's cards");
  await shot(page, "table-deck-spread-1400");

  /* DROP: Move to… lists the places; a place is Add / move to group */
  await page.keyboard.press("Escape");
  await page.locator("[data-pile='bench']").click();
  const card = page.locator(".cm-tt-drawer .cm-tt-card[data-record]").first();
  await card.waitFor({timeout: 30000});
  const lotId = await card.getAttribute("data-record");
  await card.click();
  await page.locator("[data-tt=moveto], button:has-text('Move to…')").first().click();
  const dest = page.locator(`[data-action=tabletop-drop][data-pile='place:${facts.trade[0]}']`);
  await dest.waitFor({timeout: 10000});
  ok(/Add \/ move to/.test(await dest.innerText()), "Move to… offers the Sell / Trade pile as Add / move to group");
  await dest.click();
  /* G6b-2: the drop is staged in the sitting, not reviewed on the spot; Review and confirm writes it. */
  await page.locator(".cm-sitting", {hasText: "pending"}).waitFor({timeout: 15000});
  ok(await page.evaluate((id) => globalThis.__cm.state.lots.find((x) => x.id === id).offer !== "available", lotId), "the drop is staged: the library is unchanged until Review and confirm");
  await page.locator("[data-action=sitting-confirm]").first().click();
  await page.locator("#cm-dialog[open] button[type=submit]", {hasText: "Confirm change"}).click();
  await page.waitForFunction((id) => {const l = globalThis.__cm.state.lots.find((x) => x.id === id); return l && l.offer === "available";}, lotId, {timeout: 30000});
  checks += 1;

  /* STATUS IS A BREAKOUT: D1 sorted by Status spreads into the card-state piles, and they add up to D1 */
  await page.keyboard.press("Escape");
  await page.selectOption("select[name=tabletopGroupBy]", "status");
  await page.locator(`.cm-tt-mat [data-pile='place:${d1.gid}']`).click();
  await page.locator(".cm-tt-mat [data-pile^='group:status:']").first().waitFor({timeout: 30000});
  const byStatus = await page.locator(".cm-tt-mat [data-pile^='group:status:']").evaluateAll((bs) => bs.map((b) => b.getAttribute("aria-label")));
  ok(byStatus.some((l) => /^Target, /.test(l)) && byStatus.reduce((n, l) => n + countOf(l), 0) === d1Count, `Group piles by Status breaks D1 into its card-state piles, adding up to D1 (${byStatus.join(" | ")})`);
  ok(/^Target, /.test(byStatus[0]), `and in the order a deck is finished, Target first (${byStatus[0]})`);
  eq(await page.locator("select[name=tabletopArrange]").count(), 0, "there is no second arrangement: the status piles are a breakout, not a band");
  await shot(page, "table-d1-by-status-1400");
  /* PUT AWAY, THE WHOLE TABLE AGAIN (G6d; found by the journeys walk): leaving an opened group -- Escape, or Back to Play
     Space -- puts the table back at rest, so the stacks are the whole table's again, not that group's. */
  const whole = async () => (await page.locator(".cm-tt-mat [data-pile^='group:status:']").evaluateAll((bs) => bs.map((b) => b.getAttribute("aria-label")))).reduce((n, l) => n + countOf(l), 0);
  await page.keyboard.press("Escape");
  await page.waitForFunction((n) => [...document.querySelectorAll(".cm-tt-mat [data-pile^='group:status:']")].reduce((t, b) => t + Number((/, (\d+) cards?/.exec(b.getAttribute("aria-label")) || [])[1] || 0), 0) > n, d1Count, {timeout: 15000}).catch(() => {});
  ok(await whole() > d1Count, "Escape puts D1 away: the stacks are the whole table's again");
  await page.locator(`.cm-tt-mat [data-pile='place:${d1.gid}']`).click();
  await page.waitForFunction((n) => [...document.querySelectorAll(".cm-tt-mat [data-pile^='group:status:']")].reduce((t, b) => t + Number((/, (\d+) cards?/.exec(b.getAttribute("aria-label")) || [])[1] || 0), 0) === n, d1Count, {timeout: 15000});
  await page.locator("[data-action=tt-rest]").first().click();
  await page.waitForTimeout(800);
  ok(await whole() > d1Count, "and so does Back to Play Space");

  /* LISTS ON THE TABLE: a General list laid on the row shows its cards, and the places do not change */
  await page.keyboard.press("Escape");
  await page.evaluate(async (ids) => {const C = globalThis.__cm; await C.commit({type: "createGroup", groupId: "group:list-proliferate", name: "Proliferate", template: "general"}); await C.commit({type: "groupLots", groupId: "group:list-proliferate", lotIds: ids});}, [lotId]);
  await page.locator("[data-tt-lists]").click();
  await page.locator("#cm-dialog[open] h2", {hasText: "Lists on the table"}).waitFor();
  await page.check("#cm-dialog [name='list:group:list-proliferate']");
  await page.click("#cm-dialog button[type=submit]");
  const listPile = page.locator(".cm-tt-mat [data-pile='place:group:list-proliferate']");
  await listPile.waitFor({timeout: 30000});
  eq(countOf(await listPile.getAttribute("aria-label")), 1, "the list is on the row with the one card filed in it");
  const placesAgain = await page.locator(".cm-tt-mat [data-pile^='place:']:not([data-pile='place:group:list-proliferate']), .cm-tt-mat [data-pile='bench']").evaluateAll((bs) => bs.map((b) => b.getAttribute("aria-label")));
  eq(placesAgain.reduce((n, l) => n + countOf(l), 0), total, "and the places still hold every copy once: a list never moves a card");
  await page.reload();
  await page.locator(".cm-tt-mat [data-pile='place:group:list-proliferate']").waitFor({timeout: 60000});
  checks += 1;
  await context.close();
} finally {
  await close();
}
console.log(`table-by-group: ${checks} checks passed — the table's band is the groups, every card once, a deck spreads into its own stacks, and a drop is Add / move to group.`);
