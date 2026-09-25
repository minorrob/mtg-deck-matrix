/* r3's EXPLORE (R3.7a; wireframes 50-explore-graph and 52-explore-add-wanted, INTAKE R3.7).
 *
 * In a real page with the committed library restored:
 *
 *   1. A graph opened from a deck says so: the app's crumbs read Explore › the deck, and the head
 *      holds Filters · lens, then Back to deck. Filters · lens opens and closes the tools, pressed
 *      while they are open. Back to deck goes to that deck's page.
 *   2. Add and/or buy is one dialog, opened from the card pane and from every list row's caret. Its
 *      choices are kept distinct and each says where the card lands; the button says what it will do.
 *   3. Each choice lands where it says, judged from the stored library, not from the page:
 *      Wanted puts it on the want list (the To Buy group) and buys nothing; On the Bench records
 *      owned copies reserved for no deck; a draft deck takes it into its list; a finished deck
 *      opens the swap and links it as an upgrade option, its hundred unchanged; a collection group
 *      plans it there.
 *
 * Needs Playwright and Chromium; GEOMETRY_REQUIRED=1 (CI) turns a missing browser into a failure.
 */
import assert from "node:assert/strict";
import {openBrowser, loadLiveState} from "./uat/browser-runner.mjs";

let checks = 0;
const ok = (cond, msg) => { checks++; assert.ok(cond, msg); };
const eq = (a, b, msg) => { checks++; assert.deepEqual(a, b, msg); };

const {browser, base, stub, close} = await openBrowser({name: "explore-r3", flag: "GEOMETRY_REQUIRED"});
const D6 = "deck:live:D6";
const CARD = "Llanowar Elves";
/* The library as stored, judged here in Node: the page's security policy refuses eval. */
const stateOf = (page) => page.evaluate(async () => { const r = await CrankRepository.open(); try { const s = await r.getState(); return {cards: s.cards, lots: s.lots, decks: s.decks, groups: s.groups}; } finally { r.close(); } });
const idOf = (st, name) => Object.values(st.cards).find((c) => c.name === name)?.id;
const opened = async (page, title) => { await page.waitForFunction((t) => document.querySelector("#cm-dialog[open]") && document.getElementById("cm-dialog-title")?.textContent === t, title); };
const closed = (page) => page.waitForFunction(() => !document.querySelector("#cm-dialog[open]"));
/* Open the dialog for any card, the way a list row's caret does: a button with the action and the name. */
const addFor = async (page, name) => {
  await page.evaluate((n) => { const b = document.createElement("button"); b.type = "button"; b.dataset.action = "add-buy"; b.dataset.card = n; b.id = "explore-r3-probe"; b.hidden = false; document.getElementById("cm-main").append(b); }, name);
  await page.locator("#explore-r3-probe").click();
  await page.evaluate(() => document.getElementById("explore-r3-probe")?.remove());
  await opened(page, `Add ${name}`);
};
const put = async (page, value) => { await page.locator(`#cm-dialog input[name=put][value=${value}]`).check(); };
const submitText = (page) => page.locator("#cm-dialog [type=submit]").textContent();

try {
  const context = await browser.newContext({viewport: {width: 1400, height: 900}, serviceWorkers: "block"});
  const page = await context.newPage();
  if (stub) await stub(page);
  await loadLiveState(page, base);
  await page.goto(`${base}/index.html#discover?deck=${encodeURIComponent(D6)}`);
  await page.locator(".cm-card-view-buy [data-action=add-buy]").waitFor({timeout: 60000});
  const st0 = await stateOf(page);
  const d6 = st0.decks.find((d) => d.id === D6);

  /* 1. The head. */
  eq(await page.$$eval(".cm-crumbs .cm-crumb", (as) => as.map((a) => [a.textContent, a.getAttribute("href")])), [["Explore", "#discover"], [d6.name, `#decks?deck=${encodeURIComponent(D6)}`]], "the crumbs read Explore, then the deck the graph came from");
  eq(await page.$$eval(".cm-page-head .cm-actions > .v-button", (bs) => bs.map((b) => b.textContent.trim())), ["Filters · lens", "Back to deck"], "the head holds Filters · lens, then Back to deck");
  const panelHidden = () => page.$eval("#cm-advanced-tools-panel", (p) => p.hidden);
  const toggle = page.locator("[data-action=toggle-advanced-tools]");
  const wasOpen = !(await panelHidden());
  eq(await toggle.getAttribute("aria-pressed"), String(wasOpen), "Filters · lens is pressed exactly when the tools are open");
  await toggle.click();
  eq(await panelHidden(), wasOpen, "a click opens or closes the tools");
  eq(await page.locator("[data-action=toggle-advanced-tools]").getAttribute("aria-pressed"), String(!wasOpen), "and the button follows");
  await page.locator("[data-action=toggle-advanced-tools]").click();
  eq(await panelHidden(), !wasOpen, "a second click puts them back");
  ok(!(await page.$(".cm-advanced-tools-disclosure")), "the old Show Advanced Tools row is gone");

  /* 2. The dialog, from the pane. */
  ok(!(await page.$("#cm-card-view details.cm-inline-menu summary.cm-card-view-menu-btn")), "the Add/Buy drop-down is gone from the pane");
  const pane = page.locator(".cm-card-view-buy [data-action=add-buy]");
  ok(await pane.evaluate((b) => b.classList.contains("primary")), "Add and/or buy… is the pane's primary");
  const focusName = await pane.getAttribute("data-card");
  await pane.click();
  await opened(page, `Add ${focusName}`);
  eq(await page.$$eval("#cm-dialog .cm-add-choice b", (bs) => bs.map((b) => b.textContent)), ["Into a deck", "Wanted", "On the Bench", "Into a collection group"], "four choices, kept distinct");
  eq(await page.$eval("#cm-dialog input[name=put]:checked", (i) => i.value), "deck", "a graph opened from a deck starts on Into a deck");
  eq(await page.$eval("#cm-dialog select[name=deck]", (s) => s.value), D6, "with that deck chosen");
  const links = await page.$$eval("#cm-dialog .cm-add-head a", (as) => as.map((a) => [a.textContent, a.href, a.target]));
  ok(links.length === 2 && /TCGplayer/.test(links[0][0]) && /Card Kingdom/.test(links[1][0]) && links.every((l) => l[2] === "_blank"), "the two vendors sit beside the price, each in a new tab");
  ok(decodeURIComponent(links[1][1]).includes(focusName), "and Card Kingdom searches for this card");
  eq(await submitText(page), d6.status === "draft" ? "Add to deck" : "Choose the swap…", "the button says what Into a deck will do for this deck");
  await put(page, "wanted"); eq(await submitText(page), "Remember it", "Wanted: Remember it");
  await put(page, "bench"); eq(await submitText(page), "Add to the Bench", "On the Bench: Add to the Bench");
  await put(page, "group"); eq(await submitText(page), "Add to group", "a group: Add to group");
  await page.locator("#cm-dialog select[name=deck]").selectOption(D6);
  eq(await page.$eval("#cm-dialog input[name=put]:checked", (i) => i.value), "deck", "touching a choice's own field picks that choice");
  await page.keyboard.press("Escape");
  await closed(page);

  /* 3a. Wanted: on the want list, nothing bought. */
  const copiesOf = (state, id) => state.lots.filter((l) => l.cardId === id).reduce((n, l) => ({all: n.all + l.quantity, bench: n.bench + (l.source === "owned" && l.location?.kind === "bench" && !l.allocation ? l.quantity : 0), reserved: n.reserved + (l.allocation ? l.quantity : 0)}), {all: 0, bench: 0, reserved: 0});
  const had = copiesOf(st0, idOf(st0, CARD));
  ok(!st0.groups.find((g) => g.id === "group:to-buy").entries.some((r) => r.cardId === idOf(st0, CARD)), `${CARD} is not on the want list yet`);
  await addFor(page, CARD);
  await put(page, "wanted");
  await page.locator("#cm-dialog [type=submit]").click();
  await closed(page);
  let st = await stateOf(page);
  const elves = idOf(st, CARD);
  ok(elves, `${CARD} is in the library's cards now`);
  ok(st.groups.find((g) => g.id === "group:to-buy").entries.some((r) => r.cardId === elves), "Wanted put it on the want list, the To Buy group");
  eq(copiesOf(st, elves), had, "and bought nothing: the copies are as they were");

  /* 3b. On the Bench: owned copies, reserved for no deck. */
  await addFor(page, CARD);
  await page.locator("#cm-dialog input[name=qty]").fill("2");
  eq(await page.$eval("#cm-dialog input[name=put]:checked", (i) => i.value), "bench", "typing the copies picked On the Bench");
  await page.locator("#cm-dialog [type=submit]").click();
  await closed(page);
  st = await stateOf(page);
  const now = copiesOf(st, elves);
  eq(now.all - had.all, 2, "On the Bench recorded two copies");
  eq(now.bench - had.bench, 2, "both owned, on the Bench, reserved for no deck");
  eq(now.reserved, had.reserved, "and no deck reserved either");

  /* 3c. A draft deck takes it into its list. */
  const commander = d6.commanders[0];
  await page.evaluate(async (cmd) => { const r = await CrankRepository.open(); try { const s = await r.getState(); await r.commit({id: crypto.randomUUID(), type: "createDeck", deckId: "deck:explore-r3", name: "Explore draft", commanders: [cmd], slots: [{cardId: cmd, quantity: 1}]}, s.revision); } finally { r.close(); } }, commander);
  await page.reload();
  await page.locator(".cm-card-view-buy [data-action=add-buy]").waitFor({timeout: 60000});
  await addFor(page, CARD);
  await page.locator("#cm-dialog select[name=deck]").selectOption("deck:explore-r3");
  ok(/Adds it to the list/.test(await page.locator("#cm-dialog .cm-add-choice", {has: page.locator("input[value=deck]")}).locator("small").textContent()), "for a draft, Into a deck says it adds it to the list");
  eq(await submitText(page), "Add to deck", "and the button says Add to deck");
  await page.locator("#cm-dialog [type=submit]").click();
  await closed(page);
  st = await stateOf(page);
  ok(st.decks.find((d) => d.id === "deck:explore-r3").slots.some((r) => r.cardId === elves && r.purpose === "main"), "the draft's list holds it");

  /* 3d. A finished deck: the swap, then an upgrade option; the hundred does not change. */
  const mainsBefore = st.decks.find((d) => d.id === D6).slots.filter((r) => r.purpose === "main").map((r) => r.cardId).sort();
  await addFor(page, CARD);
  await page.locator("#cm-dialog select[name=deck]").selectOption(D6);
  ok(/upgrade option/.test(await page.locator("#cm-dialog .cm-add-choice", {has: page.locator("input[value=deck]")}).locator("small").textContent()), "for a finished deck, Into a deck says it becomes an upgrade option");
  await page.locator("#cm-dialog [type=submit]").click();
  await opened(page, `Swap for ${CARD}`);
  const replaces = await page.$eval("#cm-dialog select[name=slot]", (s) => s.value);
  await page.getByRole("button", {name: "Link as an option"}).click();
  await closed(page);
  st = await stateOf(page);
  const d6After = st.decks.find((d) => d.id === D6);
  const option = d6After.slots.find((r) => r.cardId === elves && r.purpose !== "main");
  ok(option && option.replaces === replaces, `${CARD} is linked to ${d6.name} as an option for the slot chosen in the swap`);
  eq(d6After.slots.filter((r) => r.purpose === "main").map((r) => r.cardId).sort(), mainsBefore, "and the hundred is unchanged");

  /* 3e. A collection group plans it there. */
  const group = st.groups.find((g) => g.id !== "group:to-buy" && !g.entries.some((r) => r.cardId === elves));
  await addFor(page, CARD);
  await page.locator("#cm-dialog select[name=group]").selectOption(group.id);
  await page.locator("#cm-dialog [type=submit]").click();
  await closed(page);
  st = await stateOf(page);
  ok(st.groups.find((g) => g.id === group.id).entries.some((r) => r.cardId === elves), `the card is planned in ${group.name}`);

  /* 2, again: a list row's caret opens the same dialog, for that row's card. */
  await page.locator(".cm-pane-tab[data-tab=list]").click();
  const caret = page.locator("#cm-card-view [data-action=add-buy].cm-buy-caret").first();
  await caret.waitFor({timeout: 30000});
  const rowName = await caret.getAttribute("data-card");
  await caret.click();
  await opened(page, `Add ${rowName}`);
  eq(await page.$$eval("#cm-dialog .cm-add-choice b", (bs) => bs.length), 4, "a list row's caret opens the same dialog, for its own card");
  await page.keyboard.press("Escape");
  await context.close();
} finally {
  await close();
}
console.log(`explore-r3: ${checks} checks passed — Explore's head as drawn, and Add and/or buy as one dialog whose choices land where they say.`);
