/* THE TABLE BY GROUP (Rob, 2026-09-28; docs/plan-groups.md G6). "The Table view shows each card once, with groups along
 * the bottom": the band is the physical groups -- the decks, the Sell / Trade piles -- and the Bench is the rail along
 * the back; every copy is on the one pile it is in.
 *
 *   Band       one pile per deck and per Sell / Trade pile, By group the default; By status one choice away, remembered
 *   Once       the piles' counts add up to the table's total: no card on two piles
 *   Spread     opening a deck shows only that deck's cards, and its stacks stay that deck's when one is opened
 *   Drop       Move to… on a copy lists the places, and a place is Add / move to group, reviewed, then done
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
  eq(await page.locator("select[name=tabletopArrange]").inputValue(), "group", "the table is arranged by group unless you choose otherwise");
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
  await page.locator("#cm-dialog[open] h2", {hasText: "Add / move 1 record to a group"}).waitFor();
  eq(await page.locator("#cm-dialog [name=groupId]").inputValue(), facts.trade[0], "the dialog opens on the pile it was dropped on");
  await page.click("#cm-dialog button[type=submit]");
  await page.locator("#cm-dialog[open] button[type=submit]", {hasText: "Confirm change"}).click();
  await page.waitForFunction((id) => {const l = globalThis.__cm.state.lots.find((x) => x.id === id); return l && l.offer === "available";}, lotId, {timeout: 30000});
  checks += 1;

  /* BY STATUS, one choice away and remembered (from the table at rest: Escape puts the card back) */
  await page.keyboard.press("Escape");
  await page.locator("select[name=tabletopArrange]").waitFor({timeout: 60000});
  await page.selectOption("select[name=tabletopArrange]", "status");
  await page.locator(".cm-tt-mat [data-pile^='status:']").first().waitFor({timeout: 30000});
  eq(await page.locator(".cm-tt-mat [data-pile^='place:group:']").count(), 0, "By status puts the status piles back");
  await page.reload();
  await page.locator("select[name=tabletopArrange]").waitFor({timeout: 60000});
  eq(await page.locator("select[name=tabletopArrange]").inputValue(), "status", "and is remembered on this device");
  await context.close();
} finally {
  await close();
}
console.log(`table-by-group: ${checks} checks passed — the table's band is the groups, every card once, a deck spreads into its own stacks, and a drop is Add / move to group.`);
