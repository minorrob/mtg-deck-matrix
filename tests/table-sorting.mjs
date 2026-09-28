/* THE SORTING SPACE (Rob, 2026-09-28; docs/plan-groups.md G6b-2). "This view is meant to mirror sitting physically at a
 * table, sorting through cards, and temporarily creating piles of them to make mental sense of them, then dragging a
 * card or piles of cards into a specified group."
 *
 *   Stacks     identical copies in the drawer are one face with a count, and dragging it carries every copy
 *   Piles      a drag onto New pile starts a pile of your own in the middle; nothing is staged, the library unchanged
 *   Outline    the card left behind in the drawer is its outline, saying which pile it is on
 *   Name       a pile is renamed from the drawer, and is still on the table after a reload
 *   Staged     a whole pile dragged onto a group is staged in the sitting, one move per card, and leaves the middle
 *   Once       Review and confirm writes them as one revision
 *   Away       Put the pile away ends a pile; its cards never moved
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

const {browser, base, stub, close} = await openBrowser({name: "table-sorting", flag: "GEOMETRY_REQUIRED"});
try {
  const context = await browser.newContext({viewport: {width: 1400, height: 1000}, serviceWorkers: "block"});
  const page = await context.newPage();
  if (stub) await stub(page);
  await page.addInitScript(() => (globalThis.CrankFeatures ||= []).push((C) => {globalThis.__cm = C;}));
  await loadLiveState(page, base);
  const trade = await page.evaluate(() => globalThis.__cm.state.groups.find((g) => g.template === "trade").id);
  const revision = () => page.evaluate(() => globalThis.__cm.state.revision);
  const pending = () => page.evaluate(() => {const sb = globalThis.__cm.sandbox; return sb && sb.open ? sb.size : 0;});
  /* A drag the way a hand makes one: press, travel, let go -- scrolling the page to the target on the way, as a
     reader does when the group is further down the table than the screen. */
  const drag = async (from, to) => {
    await from.scrollIntoViewIfNeeded();
    const a = await from.boundingBox();
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
    await page.mouse.down();
    await page.mouse.move(a.x + a.width / 2 + 12, a.y + a.height / 2 + 12, {steps: 3});
    await to.evaluate((el) => el.scrollIntoView({block: "center"}));
    const b = await to.boundingBox();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, {steps: 12});
    await page.mouse.up();
  };
  /* Two records of one card on the Bench: the first Bench copy held twice, split in two, as a second purchase is. */
  const twin = await page.evaluate(async () => {const C = globalThis.__cm, name = (l) => C.card(l.cardId).name;
    const l = C.state.lots.filter((x) => x.source === "owned" && x.location?.kind === "bench" && !x.allocation && x.offer === "none" && x.quantity >= 2).sort((a, b) => name(a).localeCompare(name(b)))[0];
    await C.commit({type: "source", lotId: l.id, quantity: 1, source: "owned"}, {renderView: false});
    return {name: name(l), ids: C.state.lots.filter((x) => x.cardId === l.cardId && x.source === "owned" && x.location?.kind === "bench" && !x.allocation).map((x) => x.id), copies: l.quantity};});
  await page.goto(`${base}/index.html#cards?view=tabletop`);
  await page.locator(".cm-tt-mat").waitFor({timeout: 60000});
  const rev0 = await revision();

  /* STACKS: open the Bench; identical copies are one face with a count */
  await page.locator("[data-pile='bench']").click();
  const stack = page.locator(`.cm-tt-drawer .cm-tt-card.is-stack[data-n="${twin.name.replace(/"/g, '\\"')}"]`);
  await stack.waitFor({timeout: 30000});
  const stackN = Number((await stack.locator(".cm-tt-copies").innerText()).replace(/\D/g, ""));
  const stackName = await stack.getAttribute("data-n");
  ok(stackN > 1 && new RegExp(`, ${stackN} copies`).test(await stack.getAttribute("aria-label")), `identical copies are one stack with a count (${stackName} ×${stackN})`);
  const faces = await page.locator(".cm-tt-drawer .cm-tt-card[data-record]").evaluateAll((cs) => cs.map((c) => c.dataset.n));
  eq([faces.filter((n) => n === stackName).length, twin.ids.length, stackN], [1, 2, twin.copies], `${stackName}'s two records are one face in the drawer, counting all ${twin.copies} copies`);
  /* The count never sits on the tick (G6d; found by the journeys walk): the point under a stack's tick is the tick, so
     ticking a stack ticks it rather than picking it up. */
  ok(await stack.evaluate((el) => { const t = el.querySelector(".cm-tt-tick").getBoundingClientRect(), hit = document.elementFromPoint(t.left + t.width / 2, t.top + t.height / 2); return Boolean(hit && hit.closest(".cm-tt-tick")); }), "the stack's tick is uncovered: its count sits clear of it");

  /* PILES: drag the stack onto New pile */
  await page.locator(".cm-tt-sorting").waitFor();
  ok(await page.locator(".cm-tt-sorting [data-pile='sort:new']").isVisible(), "the middle of the table is the sorting space, with a New pile door");
  await drag(stack, page.locator(".cm-tt-sorting [data-pile='sort:new']"));
  const pile1 = page.locator(".cm-tt-sorting .cm-tt-pile.cm-tt-sort").first();
  await pile1.waitFor({timeout: 15000});
  eq([await pile1.locator(".cm-tt-placard strong").innerText(), countOf(await pile1.getAttribute("aria-label"))], ["Pile 1", stackN], "the whole stack starts Pile 1");
  eq([await revision(), await pending()], [rev0, 0], "nothing is staged and the library is unchanged");
  eq((await page.evaluate(() => JSON.parse(localStorage.getItem("cm-tabletop-sort"))[0].ids)).slice().sort(), twin.ids.slice().sort(), "dragging the stack carried both records");

  /* OUTLINE: the card left behind */
  const outline = page.locator(`.cm-tt-drawer .cm-tt-card.is-out[data-n="${stackName.replace(/"/g, '\\"')}"]`);
  await outline.waitFor({timeout: 15000});
  eq(await outline.getAttribute("data-out"), "On Pile 1", "the drawer keeps the card's outline, saying which pile it is on");

  /* One more card, a single, onto Pile 1 */
  const single = page.locator(".cm-tt-drawer .cm-tt-card[data-record]:not(.is-out):not(.is-stack)").first();
  const singleId = await single.getAttribute("data-record");
  await drag(single, pile1);
  await page.waitForFunction((n) => {const b = document.querySelector(".cm-tt-sorting .cm-tt-pile.cm-tt-sort"); return b && new RegExp(`, ${n} cards?`).test(b.getAttribute("aria-label"));}, stackN + 1, {timeout: 15000});
  checks += 1;
  await shot(page, "table-sorting-1400");

  /* NAME, and still there after a reload */
  await pile1.click();
  await page.locator("[data-tt=sort-rename]").click();
  await page.fill("#cm-dialog [name=name]", "Trade bait");
  await page.click("#cm-dialog button[type=submit]");
  await page.locator(".cm-tt-sorting .cm-tt-pile.cm-tt-sort .cm-tt-placard strong", {hasText: "Trade bait"}).waitFor({timeout: 15000});
  checks += 1;
  await page.reload();
  await page.locator(".cm-tt-mat").waitFor({timeout: 60000});
  const kept = page.locator(".cm-tt-sorting .cm-tt-pile.cm-tt-sort");
  eq([await kept.count(), await kept.first().locator(".cm-tt-placard strong").innerText(), countOf(await kept.first().getAttribute("aria-label"))], [1, "Trade bait", stackN + 1], "the pile is still on the table after a reload, named and whole");

  /* STAGED: the whole pile onto To Trade */
  const tradePile = page.locator(`.cm-tt-mat [data-pile='place:${trade}']`);
  const tradeBefore = countOf(await tradePile.getAttribute("aria-label"));
  const ids = await page.evaluate(() => JSON.parse(localStorage.getItem("cm-tabletop-sort"))[0].ids);
  await drag(kept.first(), tradePile);
  /* One move per record: the stack's two and the single. */
  await page.locator(".cm-sitting", {hasText: `${ids.length} moves pending`}).waitFor({timeout: 15000});
  eq([ids.length, await pending(), await revision()], [3, 3, rev0], "the pile is 3 staged moves, one per record, and the library is unchanged");
  eq(await page.locator(".cm-tt-sorting .cm-tt-pile.cm-tt-sort").count(), 0, "the pile leaves the middle once it is in a group");
  eq(countOf(await tradePile.getAttribute("aria-label")), tradeBefore + stackN + 1, "the To Trade pile already shows them, as the sitting would leave it");
  await shot(page, "table-sorting-staged-1400");

  /* ONCE */
  await page.locator("[data-action=sitting-confirm]").first().click();
  await page.locator("#cm-dialog[open] button[type=submit]", {hasText: "Confirm change"}).click();
  await page.waitForFunction(() => !document.querySelector("#cm-dialog[open]"), null, {timeout: 30000});
  const after = await page.evaluate(([list, gid]) => {const C = globalThis.__cm; return {rev: C.state.revision, all: list.every((id) => {const l = C.state.lots.find((x) => x.id === id); return l && l.groupIds.includes(gid) && (l.source !== "owned" || l.offer === "available");})};}, [ids, trade]);
  eq(after, {rev: rev0 + 1, all: true}, "Review and confirm writes every card into To Trade as one revision");
  eq(await pending(), 0, "and the sitting is closed");

  /* SEVERAL CARDS CHOSEN (G6d; found by the journeys walk): tick two, choose a third, and the three stand on the stage
     with the mat whole around them -- the stage and the mat have a height, and Clear selection can be pressed. */
  await page.locator("[data-pile='bench']").click();
  const singles = page.locator(".cm-tt-drawer .cm-tt-card[data-record]:not(.is-out):not(.is-stack)");
  await singles.nth(2).waitFor({timeout: 30000});
  await singles.nth(0).locator(".cm-tt-tick").click();
  await singles.nth(1).locator(".cm-tt-tick").click();
  await singles.nth(2).click();
  await page.locator(".cm-tt-stage .cm-tt-card").nth(2).waitFor({timeout: 15000});
  const geom = await page.evaluate(() => [document.querySelector(".cm-tt-stage").getBoundingClientRect().height, document.querySelector(".cm-tt-mat").getBoundingClientRect().height]);
  ok(geom[0] > 200 && geom[1] > geom[0], `three chosen cards stand on a stage with a height, inside a mat that holds it (${geom.map(Math.round).join(" in ")}px)`);
  await page.locator(".cm-tt-stage [data-tt=clear]").click({timeout: 5000});
  await page.waitForFunction(() => !document.querySelector(".cm-tt-stage"), null, {timeout: 10000});
  checks += 1;

  /* AWAY: a pile put away was only ever a thought */
  await page.locator("[data-pile='bench']").click();
  const one = page.locator(".cm-tt-drawer .cm-tt-card[data-record]:not(.is-out)").first();
  await one.waitFor({timeout: 30000});
  await drag(one, page.locator(".cm-tt-sorting [data-pile='sort:new']"));
  await page.locator(".cm-tt-sorting .cm-tt-pile.cm-tt-sort").first().click();
  await page.locator("[data-tt=sort-clear]").click();
  await page.waitForFunction(() => !document.querySelector(".cm-tt-sorting .cm-tt-pile.cm-tt-sort"), null, {timeout: 15000});
  eq([await revision(), await pending(), await page.evaluate(() => localStorage.getItem("cm-tabletop-sort"))], [rev0 + 1, 0, null], "Put the pile away ends it; nothing is staged or written");
  ok(singleId && ids.includes(singleId), "the single card dragged onto the pile went with it");
  await context.close();
} finally {
  await close();
}
console.log(`table-sorting: ${checks} checks passed — copies stack with a count, piles of your own sort in the middle and leave an outline, and a pile dropped on a group is staged and confirmed once.`);
