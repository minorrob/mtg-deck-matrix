/* THE NEW DECK FLOW ON SCREEN (Rob, 2026-10-23: the Decks requirements' Part B). In a real page with the committed library
 * restored:
 *
 *   1. New deck › Create opens Start from, and the shell is saved as it opens: a deck with no commander and no cards,
 *      Building on the Decks page with "Choose a commander", reopened from its tile (SHL-1 to SHL-4, NEW-2).
 *   2. Start from: four methods; Next waits for a commander; the selection survives switching methods; colors match
 *      exactly, Include more colors widens, C is colorless alone; play styles and mechanics list matching commanders
 *      with their counts (STF).
 *   3. Next puts the commander, and only the commander, on the deck, named "{commander} deck", with what the commander
 *      brings in the definition (REC-1, REC-4). Leave undefined saves it as it is (DEF-3).
 *   4. Define the Deck from the deck page: Define later saves the definition (General) and adds no card (CRD-2).
 *   5. Auto-create needs a composition and says where (CRD-5); with one, the review: seats grouped by role with counts,
 *      the summary bar, alternatives that take a seat on Confirm, Remove leaving seats empty; Create deck enters every
 *      card by its source, the deck a draft, nothing boxed (RVW).
 *   6. "Choose a commander first": a card added to a shell is refused, with a button that opens Start from (FMT-3).
 *   7. On a phone the frame is the whole screen, its nav a row across the top, nothing scrolling sideways (DLG-1, DLG-2).
 *   8. No model call anywhere in the flow (REC-3).
 *
 * Needs Playwright and Chromium; GEOMETRY_REQUIRED=1 (CI) turns a missing browser into a failure.
 */
import assert from "node:assert/strict";
import {openBrowser, loadLiveState} from "./uat/browser-runner.mjs";

let checks = 0;
const ok = (cond, msg) => { checks++; assert.ok(cond, msg); };
const eq = (a, b, msg) => { checks++; assert.deepEqual(a, b, msg); };
const {browser, base, stub, close} = await openBrowser({name: "new-deck-flow", flag: "GEOMETRY_REQUIRED"});
const title = (page) => page.locator("#cm-dialog[open] #cm-dialog-title").textContent();
const decks = (page) => page.evaluate(() => globalThis.__cm.state.decks.map((d) => ({id: d.id, name: d.name, commanders: d.commanders.map((c) => globalThis.__cm.state.cards[c]?.name), slots: d.slots.length, status: d.status, definition: d.definition})));
const deck = async (page, id) => (await decks(page)).find((d) => d.id === id);

try {
  const context = await browser.newContext({viewport: {width: 1400, height: 900}, serviceWorkers: "block"});
  const page = await context.newPage();
  if (stub) await stub(page);
  const asked = [];page.on("request", (r) => {if (/\/api\/(advise|ai)|anthropic|openai/i.test(r.url())) asked.push(r.url());});
  await page.addInitScript(() => (globalThis.CrankFeatures ||= []).push((C) => {globalThis.__cm = C;}));
  await loadLiveState(page, base);
  const before = (await decks(page)).map((d) => d.id);

  /* 1. Create opens Start from, and the shell is saved. */
  await page.getByRole("button", {name: "New deck", exact: true}).first().click();
  await page.locator("#cm-dialog [data-action=start-from]").click();
  await page.locator(".cm-flow-dialog").waitFor({timeout: 30000});
  eq(await title(page), "Start from", "Create opens Start from");
  const shellId = (await decks(page)).map((d) => d.id).find((id) => !before.includes(id));
  ok(shellId, "the shell is saved as Start from opens");
  eq(await deck(page, shellId).then((d) => [d.name, d.commanders, d.slots]), ["New deck", [], 0], "a shell: no commander, no cards");
  eq(await page.$$eval(".cm-flow-nav button", (bs) => bs.map((x) => x.textContent.trim())), ["Pick a commander", "Choose colors", "Choose play style", "Choose mechanics"], "four methods in the nav");
  ok(await page.$eval("[data-action=flow-next]", (x) => x.disabled), "Next waits for a commander");
  ok(!(await page.locator("#cm-dialog .cm-flow p.cm-muted").count()), "no explanatory copy in the frame (DLG-4)");
  await page.evaluate(() => globalThis.__cm.actions.close());
  await page.goto(`${base}/index.html#decks?sort=name`);
  const shellTile = page.locator(`[data-deck-tile="${shellId}"]`);
  await shellTile.waitFor({timeout: 30000});
  eq([await shellTile.locator("h3").textContent(), await shellTile.locator(".cm-pill").first().textContent()], ["Choose a commander", "Building"], "closed, the shell is on the Decks page, Building, asking for a commander");
  await shellTile.locator("button[data-action=start-from]").click();
  await page.locator(".cm-flow-dialog").waitFor();
  eq(await title(page), "Start from", "one click on its tile reopens Start from");
  eq((await decks(page)).length, before.length + 1, "without making another shell");

  /* 2. Start from's methods. */
  await page.fill("#cm-flow-query", "Krenko, Mob");
  await page.locator(".cm-flow-results [data-name='Krenko, Mob Boss']").click();
  ok(!(await page.$eval("[data-action=flow-next]", (x) => x.disabled)), "a commander picked, Next is ready");
  await page.locator(".cm-flow-nav button", {hasText: "Choose colors"}).click();
  ok(!(await page.$eval("[data-action=flow-next]", (x) => x.disabled)) && /Krenko, Mob Boss/.test(await page.locator("#cm-flow-chosen").textContent()), "the selection survives switching methods");
  await page.click("[data-action=flow-color][data-id=W]");await page.click("[data-action=flow-color][data-id=U]");
  const exact = await page.$$eval(".cm-flow-results [data-name]", (bs) => bs.length);
  ok(exact > 5, `W + U lists Azorius commanders (${exact} shown)`);
  const exactCi = await page.$$eval(".cm-flow-results [data-name]", (bs) => bs.map((x) => (globalThis.__cm.catalog.exact(x.dataset.name)?.colorIdentity || []).slice().sort().join("")));
  ok(exactCi.length && exactCi.every((ci) => ci === "UW"), `exactly white and blue, before Include more colors (${[...new Set(exactCi)].join(", ")})`);
  await page.check("[data-flow-include]");
  ok((await page.$$eval(".cm-flow-results [data-name]", (bs) => bs.length)) >= exact, "Include more colors widens the list");
  await page.click("[data-action=flow-color][data-id=C]");
  ok(await page.$eval("[data-flow-include]", (x) => x.disabled) && await page.$eval("[data-action=flow-color][data-id=W]", (x) => x.getAttribute("aria-pressed")) === "false", "C stands alone");
  await page.locator(".cm-flow-nav button", {hasText: "Choose play style"}).click();
  await page.click("[data-action=flow-style][data-id=aristocrats]");
  ok(/match/.test(await page.locator(".cm-flow-results").first().textContent()), "play styles list matching commanders, with the count");
  await page.locator(".cm-flow-nav button", {hasText: "Choose mechanics"}).click();
  await page.locator("[data-action=flow-mech]").first().click();
  ok(await page.locator(".cm-flow-results [data-name]").count() > 0, "and so do mechanics");
  await page.locator(".cm-flow-nav button", {hasText: "Pick a commander"}).click();

  /* 3. Next: the commander only. */
  await page.click("[data-action=flow-next]");
  await page.waitForFunction(() => document.querySelector("#cm-dialog[open] #cm-dialog-title")?.textContent === "Define the Deck", null, {timeout: 60000});
  let shell = await deck(page, shellId);
  eq([shell.name, shell.commanders, shell.slots], ["Krenko deck", ["Krenko, Mob Boss"], 1], "Next puts Krenko on the deck, and only Krenko, as Krenko deck");
  ok(shell.definition.fromCommander && Array.isArray(shell.definition.fromCommander.styles) && shell.definition.fromCommander.styles.includes("tribal"), "the definition carries what the commander brings, marked as from it (REC-1)");
  eq(await page.$$eval(".cm-flow-modes input[name=mode]", (xs) => xs.map((x) => x.parentElement.textContent.trim())), ["Define the deck", "Leave undefined"], "two choices at the top");
  ok(await page.$eval("[data-action=flow-create]", (x) => x.disabled), "Create deck waits for a choice");
  await page.check("input[name=mode][value=undefined]");
  ok(!(await page.$eval("[data-action=flow-create]", (x) => x.disabled)), "Leave undefined makes Create deck active at once");
  await page.click("[data-action=flow-create]");
  await page.locator(".cm-deck-hero h1").waitFor({timeout: 30000});
  eq((await deck(page, shellId)).slots, 1, "saved with only its commander");

  /* 4. Define the Deck from the deck page: Define later. */
  await page.locator("#cm-sec-overview-empty [data-action=define-deck]").click();
  await page.waitForFunction(() => document.querySelector("#cm-dialog[open] #cm-dialog-title")?.textContent === "Define the Deck");
  eq(await page.$$eval(".cm-flow-nav button", (bs) => bs.map((x) => x.textContent.trim())), ["General", "Gameplay", "Mechanics", "Cards"], "four sections, in order");
  const savedName = await page.inputValue('input[name=name]');
  await page.fill('input[name=name]', '   ');
  await page.locator('input[name=name]').dispatchEvent('change');
  const beforeInvalid = await page.evaluate(() => globalThis.__cm.state.revision);
  eq(await page.locator('.cm-flow-foot .v-button.primary').innerText(), 'Next', 'the primary button is Next on General (Rob, 2026-10-28)');
  await page.click('[data-action=flow-def-next]');
  eq(await page.locator('.cm-flow-nav button[aria-pressed=true]').innerText(), 'Gameplay', 'Next goes to the next section');
  await page.click('[data-action=flow-def-next]'); await page.click('[data-action=flow-def-next]');
  eq(await page.locator('.cm-flow-foot .v-button.primary').innerText(), 'Create deck', 'on Cards the primary button is Create deck');
  await page.click('[data-action=flow-create]');
  await page.locator('[name=name][aria-invalid=true]').waitFor();
  eq(await page.locator('#cm-flow-name-error').textContent(), 'Name the deck.', 'a blank name has an error at its field');
  ok(await page.locator('[name=name]').evaluate((x) => x === document.activeElement), 'the first invalid field receives focus');
  eq(await page.evaluate(() => globalThis.__cm.state.revision), beforeInvalid, 'invalid input never commits');
  eq(await page.locator('.cm-flow-nav .cm-flow-mark').count(), 0, 'validation is not a dot on a tab');
  await page.fill('input[name=name]', savedName);
  await page.locator('input[name=name]').dispatchEvent('change');
  /* THE RESTRICTIONS ARE THE BRACKET'S: Game Changers none in B1-2, three in B3, lifted from B4; two columns; no free-text box. */
  const restrictions = async () => page.$$eval(".cm-flow-restrict .cm-checkbox", (ls) => ls.map((l) => l.textContent.trim()));
  await page.selectOption("select[name=bracket]", "3");
  eq(await restrictions(), ["No mass land denial", "No chained extra turns", "Two-card infinites only as late finishers", "At most 3 Game Changers"], "Bracket 3: three Game Changers, and the rest");
  await page.selectOption("select[name=bracket]", "2");
  eq((await restrictions()).at(-1), "No Game Changers", "Bracket 2 allows no Game Changer");
  await page.selectOption("select[name=bracket]", "4");
  eq(await restrictions(), [], "Bracket 4 lifts every restriction");
  ok(/lifts these/.test(await page.locator(".cm-flow-lifted").innerText()), "and says so");
  eq(await page.locator("input[name=restrictions]").count(), 0, "the free-text box under Restrictions is gone");
  await page.selectOption("select[name=bracket]", "3");
  const grid = await page.$eval(".cm-flow-restrict-grid", (g) => getComputedStyle(g).gridTemplateColumns.split(" ").length);
  eq(grid, 2, "the restrictions sit in two columns");
  await page.fill("input[name=budget]", "150");await page.locator("input[name=budget]").dispatchEvent("change");
  await page.locator(".cm-flow-nav button", {hasText: "Cards"}).click();
  await page.check("input[name=cards][value=later]");
  let r0 = await page.evaluate(() => globalThis.__cm.state.revision);
  await page.click("[data-action=flow-create]");
  await page.waitForFunction((x) => globalThis.__cm.state.revision > x, r0);
  shell = await deck(page, shellId);
  eq([shell.definition.baseBracket, shell.definition.budget, shell.slots], [3, 150, 1], "Define later saves the definition and adds no card (CRD-2)");

  /* 5. Auto-create and the review. */
  await page.goto(`${base}/index.html#decks?deck=${encodeURIComponent(shellId)}`);
  await page.locator("#cm-sec-overview-empty [data-action=define-deck]").click();
  await page.waitForFunction(() => document.querySelector("#cm-dialog[open] #cm-dialog-title")?.textContent === "Define the Deck");
  await page.locator(".cm-flow-nav button", {hasText: "Cards"}).click();
  await page.check("input[name=cards][value=auto]");
  await page.check("input[name=weighting][value=Offense]");
  await page.click("[data-action=flow-create]");
  await page.locator(".cm-flow-nav button[data-mark]").first().waitFor({timeout: 30000});
  eq(await page.$$eval(".cm-flow-nav button[data-mark]", (bs) => bs.map((x) => x.dataset.to)), ["gameplay"], "without a composition, Auto-create sends you to Gameplay, marked (CRD-5)");
  await page.selectOption("select[name=primary]", "tribal");
  await page.locator(".cm-flow-nav button", {hasText: "Cards"}).click();
  await page.click("[data-action=flow-create]");
  await page.waitForFunction(() => document.querySelector("#cm-dialog[open] #cm-dialog-title")?.textContent === "Review the deck", null, {timeout: 120000});
  const bar = await page.locator(".cm-review-bar").textContent();
  ok(/seats filled/.test(bar) && /lands/.test(bar) && /To buy/.test(bar) && /Bench/.test(bar), `the summary bar: seats, lands, To buy against the budget, cards by source (${bar.replace(/\s+/g, " ").trim()})`);
  const groups = await page.$$eval(".cm-review-group h3", (hs) => hs.map((h) => h.textContent));
  ok(groups.length >= 4 && groups.every((g) => /\d+$/.test(g.trim())), `thumbnails grouped by slot role with counts (${groups.slice(0, 5).join(" | ")})`);
  const cards = await page.$$eval(".cm-review-card:not(.is-empty)", (ls) => ls.length);
  ok(cards >= 40, `the 99 less basic lands as thumbnails (${cards})`);
  /* An alternative takes a seat. */
  const first = await page.locator(".cm-review-card:not(.is-empty)").first().getAttribute("data-seat");
  const was = await page.locator(`.cm-review-card[data-seat="${first}"] .cm-review-thumb`).getAttribute("title");
  await page.locator(`.cm-review-card[data-seat="${first}"] .cm-review-thumb`).click();
  ok(await page.locator(".cm-review-alts input[name=alt]").count() <= 5 && await page.locator(".cm-review-alts input[name=alt]").count() > 0, "a card shows up to five alternatives");
  await page.locator(".cm-review-alts input[name=alt]").first().check();await page.click("[data-action=review-confirm]");
  const now = await page.locator(`.cm-review-card[data-seat="${first}"] .cm-review-thumb`).getAttribute("title");
  ok(now !== was && now.split(" · ")[1] === was.split(" · ")[1], `Confirm puts the alternative in the same seat, same definition (${was} → ${now})`);
  /* Remove: two seats come out and stay empty. */
  const ticks = page.locator(".cm-review-card:not(.is-empty) [data-review-tick]");
  await ticks.nth(1).check();await ticks.nth(2).check();await page.click("[data-action=review-remove]");
  const empties = await page.locator(".cm-review-card.is-empty").count();
  ok(empties >= 2, "removed cards leave their seats empty");
  r0 = await page.evaluate(() => globalThis.__cm.state.revision);
  await page.click("[data-action=review-create]");
  await page.waitForFunction(() => !document.querySelector("#cm-dialog[open]"), null, {timeout: 60000});
  ok(await page.evaluate((x) => globalThis.__cm.state.revision > x, r0), "Create deck saved");
  shell = await deck(page, shellId);
  ok(shell.slots > 50 && shell.slots < 100 && shell.status === "draft", `Create deck saves the cards, a draft (${shell.slots} rows)`);
  const sources = await page.evaluate((id) => {const C = globalThis.__cm, s = C.state, M = C.M, ds = M.deckStatus(s, M.deck(s, id));return {loading: ds.loading, reserved: ds.reserved.total, box: ds.deckTotal, seated: M.deck(s, id).slots.filter((r) => r.seat).length};}, shellId);
  eq(sources.box, 0, "nothing is boxed");
  ok(sources.reserved > 0, `cards to buy enter as Reserved (${sources.reserved})`);
  ok(sources.seated > 50, `each seat keeps its slot definition (${sources.seated})`);

  /* 6. Choose a commander first. */
  await page.evaluate(() => globalThis.__cm.actions["start-from"]());
  await page.locator(".cm-flow-dialog").waitFor();
  const empty = (await decks(page)).find((d) => !d.commanders.length && d.slots === 0).id;
  await page.evaluate(() => globalThis.__cm.actions.close());
  await page.evaluate((id) => {const C = globalThis.__cm, card = Object.values(C.state.cards)[0];C.form("Add a card", "", () => C.commit({type: "target", deckId: id, cardId: card.id, quantity: 1}), "Add");}, empty);
  await page.click("#cm-dialog[open] [type=submit]");
  await page.locator("#cm-dialog[open] .cm-error .cm-error-action").waitFor();
  ok(/^Choose a commander first\./.test(await page.locator("#cm-dialog[open] .cm-error").textContent()), "adding a card to a shell is refused: Choose a commander first");
  await page.click("#cm-dialog[open] .cm-error-action");
  await page.locator(".cm-flow-dialog").waitFor();
  eq(await title(page), "Start from", "and its button opens Start from");
  await context.close();

  /* 7. A phone. */
  const phone = await browser.newContext({viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true, serviceWorkers: "block"});
  const small = await phone.newPage();
  if (stub) await stub(small);
  await small.addInitScript(() => (globalThis.CrankFeatures ||= []).push((C) => {globalThis.__cm = C;}));
  await loadLiveState(small, base);
  await small.evaluate(() => globalThis.__cm.actions["start-from"]());
  await small.locator(".cm-flow-dialog").waitFor();
  const geo = await small.evaluate(() => {const d = document.querySelector(".cm-flow-dialog").getBoundingClientRect(), n = [...document.querySelectorAll(".cm-flow-nav button")].map((b) => b.getBoundingClientRect().top);return {w: d.width, row: new Set(n.map(Math.round)).size === 1, sideways: document.querySelector(".cm-flow-dialog").scrollWidth > document.querySelector(".cm-flow-dialog").clientWidth + 1};});
  ok(geo.w >= 388 && geo.row && !geo.sideways, `on a phone the frame is the whole screen, its nav one row across the top, nothing sideways (${JSON.stringify(geo)})`);
  await phone.close();

  /* 8. No model call. */
  eq(asked, [], "no model was called anywhere in the flow");
} finally {
  await close();
}
console.log(`new-deck-flow: ${checks} checks passed — the shell saved as Start from opens, a commander and only the commander, Define the Deck, and Auto-create's review entering every card by its source.`);
