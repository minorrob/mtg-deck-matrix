/* PLANNED CHANGES ON THE PAGE (Rob, 2026-10-25, C1–C8; tests/planned-changes.mjs proves the model's side).
 *
 * In a real page with the committed library restored, on the deck with the most to swap:
 *
 *   1. The page: "Planned Changes", two column groups (Take out of Box, Add to Box), a row for every pair the model
 *      plans, the counter at Removed 0, Added 0 and the box's total.
 *   2. C4: each side a tick, the card's thumbnail (the card large on a hover), its name, its colors and what it is.
 *   3. C5: a take-out says its role (Substitute, Final); an add its chain and use (Owned - Final, To Buy - Final ...);
 *      every add can be ticked (Rob, 2026-10-26), a To Buy Final included.
 *   4. C1 and C6: a tick changes nothing in the library; it moves the counter, red off 100, green at 100.
 *   5. C7: an add whose partner is not ticked pairs with a ticked take-out from another row, both wearing one dot.
 *   6. C2: Swap asks "Confirm additions and removals?"; Cancel changes nothing; Confirm makes it one change: the add
 *      in the box, the take-out on the Bench, the box still 100.
 *   7. C8: two adds and no take-out still swap after the confirmation, which warns of the count; the box is 102.
 *   8. The deck page's button is Planned Changes, and opens this page.
 *
 * Needs Playwright and Chromium; GEOMETRY_REQUIRED=1 (CI) turns a missing browser into a failure.
 */
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {openBrowser, loadLiveState} from "./uat/browser-runner.mjs";
const require = createRequire(import.meta.url), M = require("../collection-model.js"), CH = require("../crankmagic-change.js");

let checks = 0;
const ok = (c, msg) => { checks++; assert.ok(c, msg); };
const eq = (a, b, msg) => { checks++; assert.deepEqual(a, b, msg); };

const {browser, base, stub, close} = await openBrowser({name: "planned-changes-ui", flag: "GEOMETRY_REQUIRED"});
const stateOf = (page) => page.evaluate(async () => { const r = await CrankRepository.open(); try { return await r.getState(); } finally { r.close(); } });

try {
  const context = await browser.newContext({viewport: {width: 1400, height: 900}, serviceWorkers: "block"});
  const page = await context.newPage();
  if (stub) await stub(page);
  const errors = []; page.on("pageerror", (x) => errors.push(x.message));
  await loadLiveState(page, base);
  let st = await stateOf(page);
  /* The deck with the most adds that can be ticked, and an original pair among them. */
  const planOf = (s, id) => CH.planned(s, s.decks.find((d) => d.id === id), {M});
  const DECK = st.decks.filter((d) => !d.archived).map((d) => ({id: d.id, p: planOf(st, d.id)}))
    .filter(({p}) => p.rows.some((r) => r.in?.selectable && r.out?.selectable))
    .sort((a, b) => b.p.rows.filter((r) => r.in?.selectable).length - a.p.rows.filter((r) => r.in?.selectable).length)[0]?.id;
  ok(DECK, "some deck has an owned card to add beside the Substitute holding its seat, so the checks below can fail");
  const deck = st.decks.find((d) => d.id === DECK);
  let plan = planOf(st, DECK);
  const picks = plan.rows.filter((r) => r.in?.selectable);
  ok(picks.length >= 4, `${deck.name} has ${picks.length} adds that can be ticked (four are needed)`);

  /* 8, first: the deck page's way in. */
  await page.goto(`${base}/index.html#decks?deck=${encodeURIComponent(DECK)}`);
  const into = page.getByRole("button", {name: /^Planned Changes/});
  await into.first().waitFor({timeout: 30000});
  ok(await page.getByRole("button", {name: /^Ready to add/}).count() === 0, "the deck page's button is Planned Changes, no longer Ready to add");
  await into.first().click();
  await page.locator(".cm-plan").waitFor({timeout: 30000});
  ok(page.url().includes(`#pull?deck=${encodeURIComponent(DECK)}`), "and it opens the deck's Planned Changes");

  /* 1. */
  eq(await page.locator(".cm-plan h1").textContent(), "Planned Changes", "the page is Planned Changes");
  eq(await page.locator(".cm-plan-head [role=columnheader]").allTextContents(), ["Take out of Box", "Add to Box"], "two column groups: Take out of Box, Add to Box");
  eq(await page.locator(".cm-plan-row").count(), plan.rows.length, `a row for every pair the model plans (${plan.rows.length})`);
  const counter = async () => page.evaluate(() => { const c = document.querySelector(".cm-plan-counter"), n = (k) => Number(c.querySelector(`[data-plan-n=${k}]`).textContent); return {removed: n("removed"), added: n("added"), total: n("total"), right: c.classList.contains("is-right"), off: c.classList.contains("is-off"), words: c.textContent.replace(/\s+/g, " ").trim()}; });
  let c = await counter();
  eq([c.removed, c.added, c.total], [0, 0, plan.boxTotal], `the counter starts at 0 removed, 0 added, the box's ${plan.boxTotal}`);
  ok(/Removed/.test(c.words) && /Added/.test(c.words) && /Total Deck Cards/.test(c.words), `it says Removed, Added and Total Deck Cards: "${c.words}"`);
  ok(await page.locator("[data-action=plan-swap]").isDisabled(), "Swap waits for a tick");

  /* 2. */
  const sides = await page.$$eval(".cm-plan-side:not(.is-empty)", (xs) => xs.map((x) => ({tick: !!x.querySelector("input[type=checkbox].cm-plan-tick"), thumb: !!x.querySelector(".cm-plan-thumb img"), peek: x.querySelector(".cm-plan-thumb")?.dataset.peek || "", name: x.querySelector(".cm-plan-name")?.textContent.trim(), colors: !!x.querySelector(".cm-plan-sub > :first-child:not(.cm-plan-role)") || x.querySelector(".cm-plan-sub").children.length > 1, role: x.querySelector(".cm-plan-role")?.textContent.trim(), out: x.classList.contains("is-out")})));
  ok(sides.length && sides.every((x) => x.tick && x.name && x.role), "every side has a tick, a name and what it is");
  ok(sides.filter((x) => x.thumb).length >= sides.length * .9, `and a thumbnail (${sides.filter((x) => x.thumb).length} of ${sides.length})`);
  ok(sides.every((x) => x.colors), "and the card's colors under its name, beside what it is");
  const thumb = page.locator(".cm-plan-side.is-in .cm-plan-thumb").first();
  await thumb.hover();
  await page.locator(".cm-plan-peek img").waitFor({timeout: 5000});
  eq(await page.locator(".cm-plan-peek img").getAttribute("src"), await thumb.getAttribute("data-peek"), "a hover on a thumbnail shows the card large");
  ok(/\/normal\//.test(await thumb.getAttribute("data-peek")) && /\/small\//.test(await thumb.locator("img").getAttribute("src")), "the large picture, the small one in the row");
  await page.mouse.move(5, 5);
  await page.locator(".cm-plan-peek").waitFor({state: "detached", timeout: 5000});
  ok(true, "and it goes when the pointer leaves");

  /* 3. */
  ok(sides.filter((x) => x.out).every((x) => ["Substitute", "Final"].includes(x.role)), "each take-out says its role: Substitute or Final");
  const labels = sides.filter((x) => !x.out).map((x) => x.role);
  ok(labels.every((l) => /^(Owned|To Buy|To Buy · Ordered) - (Final|Substitute|Bench|Upgrade)$/.test(l)), `each add says its chain and use (${[...new Set(labels)].join(", ")})`);
  const buyFinal = plan.rows.find((r) => r.in?.label === "To Buy - Final");
  if (buyFinal) ok(await page.locator(`[data-plan-pick="${buyFinal.in.id}"]`).isEnabled(), `a To Buy Final (${buyFinal.in.name}) can be ticked (Rob, 2026-10-26)`);
  else ok(true, "no To Buy Final here");

  /* 4. */
  const pairRow = picks.find((r) => r.out?.selectable);
  const tick = (u) => page.locator(`[data-plan-pick="${u.id}"]`).check();
  const untick = (u) => page.locator(`[data-plan-pick="${u.id}"]`).uncheck();
  const rev = st.revision;
  await tick(pairRow.in);
  c = await counter();
  eq([c.removed, c.added, c.total, c.off, c.right], [0, 1, plan.boxTotal + 1, true, false], `one add ticked: Added 1, the total ${plan.boxTotal + 1}, red`);
  eq((await stateOf(page)).revision, rev, "and nothing in the library changed (C1)");
  await tick(pairRow.out);
  c = await counter();
  eq([c.removed, c.added, c.total, c.right], [1, 1, plan.boxTotal, true], `its partner ticked too: Removed 1, Added 1, the total ${plan.boxTotal}, green at 100`);
  eq(await page.locator(".cm-plan-side.is-repaired").count(), 0, "an original pair wears no dot");

  /* 5. */
  const other = plan.rows.find((r) => r.out?.selectable && r !== pairRow);
  ok(other, "another row has a take-out to tick");
  await untick(pairRow.out); await tick(other.out);
  const dots = await page.$$eval(".cm-plan-side.is-repaired", (xs) => xs.map((x) => ({id: x.dataset.planUnit, mark: x.querySelector(".cm-plan-mark").style.getPropertyValue("--mark"), shown: getComputedStyle(x.querySelector(".cm-plan-mark")).display !== "none"})));
  eq(dots.map((x) => x.id).sort(), [pairRow.in.id, other.out.id].sort(), "the lonely add pairs with the take-out ticked in another row");
  ok(dots.length === 2 && dots[0].mark && dots[0].mark === dots[1].mark && dots.every((x) => x.shown), `and both wear the same dot (${dots[0]?.mark})`);
  eq((await page.locator(".cm-plan-side.is-repaired").allInnerTexts()).join(" ").includes("paired"), false, "a dot, no words");
  await untick(other.out); await tick(pairRow.out);
  eq(await page.locator(".cm-plan-side.is-repaired").count(), 0, "ticked back to its own partner, the dots go");

  /* 6. */
  await page.locator("[data-action=plan-swap]").click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor();
  ok((await dialog.textContent()).includes("Confirm additions and removals?"), "Swap asks: Confirm additions and removals?");
  ok((await dialog.textContent()).includes(pairRow.in.name) && (await dialog.textContent()).includes(pairRow.out.name), "naming what goes in and what comes out");
  await dialog.getByRole("button", {name: /^(Cancel|Close)$/}).first().click();
  await dialog.waitFor({state: "hidden"});
  eq((await stateOf(page)).revision, rev, "Cancel changes nothing");
  await page.locator("[data-action=plan-swap]").click();
  await dialog.getByRole("button", {name: "Confirm change"}).click();
  await dialog.waitFor({state: "hidden"});
  await page.waitForTimeout(600);
  st = await stateOf(page);
  eq(st.revision, rev + 1, "Confirm makes it one change, one undo");
  const lot = (id) => st.lots.find((l) => l.id === id);
  ok(lot(pairRow.out.lotId)?.location?.kind !== "deck" || lot(pairRow.out.lotId)?.location?.deckId !== DECK, `the take-out (${pairRow.out.name}) left the box`);
  eq(M.deckStatus(st, st.decks.find((d) => d.id === DECK)).deckTotal, plan.boxTotal, `the box is still ${plan.boxTotal}`);
  plan = planOf(st, DECK);
  eq(await page.locator(".cm-plan-row").count(), plan.rows.length, "the page drawn again from the model");
  c = await counter();
  eq([c.removed, c.added, c.total], [0, 0, plan.boxTotal], "the ticks cleared with the change made");

  /* 7. */
  const two = plan.rows.filter((r) => r.in?.selectable && !(r.in.kind === "upgrade" && r.in.chain !== "owned")).slice(0, 2);
  ok(two.length === 2, "two more adds to tick");
  for (const r of two) await tick(r.in);
  c = await counter();
  eq([c.added, c.total, c.off], [2, plan.boxTotal + 2, true], `two adds, no take-out: the total ${plan.boxTotal + 2}, red`);
  await page.locator("[data-action=plan-swap]").click();
  await dialog.waitFor();
  ok(/102 cards in the deck after this/.test(await dialog.textContent()) || new RegExp(`${plan.boxTotal + 2} cards in the deck after this`).test(await dialog.textContent()), "the confirmation warns of the count");
  await dialog.getByRole("button", {name: "Confirm change"}).click();
  await dialog.waitFor({state: "hidden"});
  await page.waitForTimeout(600);
  st = await stateOf(page);
  eq(M.deckStatus(st, st.decks.find((d) => d.id === DECK)).deckTotal, plan.boxTotal + 2, `and it swaps anyway: the box holds ${plan.boxTotal + 2} (C8)`);
  eq(errors, [], "no page errors");
  await context.close();
} finally {
  await close();
}
console.log(`planned-changes-ui: ${checks} checks passed — Planned Changes in two column groups with thumbnails, colors and roles; a tick only selects, the counter green at 100, a re-pair dotted, Swap confirmed as one change, and a mismatched count swapped after the warning.`);
