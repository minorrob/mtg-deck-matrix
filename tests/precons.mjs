/* START FROM A PRECON (R3.10b; INTAKE row R3.10, decision M1 · 4).
 *
 * data/precons.json is every Commander precon Wizards has published, built from MTGJSON by tools/build-precons.mjs,
 * whose own --check holds the file to its promises offline (tests/generators.mjs runs it). This is the reader's side,
 * in a real page:
 *
 *   1. The landing page's "Start from a precon" and the New deck wizard's "From a precon" open one picker: every
 *      precon, newest first, each with its commander(s), colors, set and a US date ("Releases" before it is out).
 *   2. It searches by deck, commander or set code, partners included.
 *   3. A choice comes in as a list in the app's own import, commander first, named after the deck, a hundred cards,
 *      to review before anything is saved.
 *   4. A precon holding a card banned since it was printed says so before the review.
 *   5. The file is fetched only when the picker opens, once.
 *
 * Needs Playwright and Chromium; GEOMETRY_REQUIRED=1 (CI) turns a missing browser into a failure.
 */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {openBrowser} from "./uat/browser-runner.mjs";

let checks = 0;
const ok = (c, msg) => { checks++; assert.ok(c, msg); };
const eq = (a, b, msg) => { checks++; assert.deepEqual(a, b, msg); };
const data = JSON.parse(readFileSync(new URL("../data/precons.json", import.meta.url), "utf8"));
const latest = JSON.parse(readFileSync(new URL("../data/precons-latest.json", import.meta.url), "utf8"));
const byId = new Map(data.decks.map((d) => [d.id, d]));
const us = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", {month: "short", day: "numeric", year: "numeric"});

const {browser, base, stub, close} = await openBrowser({name: "precons", flag: "GEOMETRY_REQUIRED"});
const fresh = async () => {
  const context = await browser.newContext({viewport: {width: 1400, height: 900}, serviceWorkers: "block"});
  const page = await context.newPage();
  if (stub) await stub(page);
  const fetched = [];
  page.on("request", (r) => { if (/\/data\/precons\.json/.test(r.url())) fetched.push(r.url()); });
  return {context, page, fetched};
};
const rows = (page) => page.$$eval("#cm-precon-list .cm-precon", (bs) => bs.map((b) => ({id: b.dataset.precon, text: b.innerText.replace(/\s+/g, " ").trim(), pips: b.querySelectorAll(".cm-pip").length})));
const search = async (page, text) => { await page.locator("#cm-precon-q").fill(text); await page.waitForTimeout(150); return rows(page); };

try {
  {
    const {context, page, fetched} = await fresh();
    await page.goto(`${base}/index.html`);
    await page.locator(".cm-landing [data-action=start-precon]").waitFor({timeout: 60000});
    await page.waitForTimeout(800);
    eq(fetched.length, 0, "the precon list is not fetched until the picker opens");

    /* 0. New from Wizards (Rob, 2026-09-30): the newest release's precons on the landing page, from the small file. */
    await page.locator("#cm-landing-precons:not([hidden]) .cm-precon-chip").first().waitFor({timeout: 30000});
    const chips = await page.$$eval("#cm-landing-precons .cm-precon-chip", (bs) => bs.map((b) => ({id: b.dataset.precon, text: b.innerText.replace(/\s+/g, " ").trim(), pips: b.querySelectorAll(".cm-pip").length})));
    eq(chips.map((c) => c.id), latest.decks.map((d) => d.id), `the landing page offers the newest release's precons, ${latest.decks.length} of them, from data/precons-latest.json`);
    ok(chips.every((c, i) => c.text.startsWith(latest.decks[i].name) && c.pips === new Set(latest.decks[i].commander.flatMap((x) => x.colorIdentity)).size), "each chip names the deck and its commander's colors");
    const head = (await page.locator("#cm-landing-precons .cm-precon-latest-head").innerText()).replace(/\s+/g, " ");
    ok(/New from Wizards/i.test(head) && latest.decks.every((d) => head.includes(d.setName)) && head.includes(us(latest.releaseDate)), `the strip names the sets and the US date: "${head}"`);
    eq(fetched.length, 0, "and still the full list was not fetched");
    const fracture = latest.decks.find((d) => /Reality Fracture/.test(d.setName)) || latest.decks[0];
    await page.locator(`#cm-landing-precons [data-precon="${fracture.id}"]`).click();
    await page.waitForFunction(() => document.querySelector("#cm-dialog[open] textarea[name=text]"), null, {timeout: 30000});
    eq(await page.inputValue("#cm-dialog input[name=name]"), fracture.name, `one click starts it: ${fracture.name} (${fracture.setName}) is in the review, named`);
    eq((await page.$eval("#cm-dialog textarea[name=text]", (t) => t.value)).split("\n").reduce((n, l) => n + Number(l.split(" ")[0]), 0), 100, "a hundred cards");
    eq(fetched.length, 1, "the full list was fetched for it, once");
    await page.keyboard.press("Escape");
    fetched.length = 0;

    /* 1. The picker. */
    await page.locator(".cm-landing [data-action=start-precon]").click();
    await page.locator("#cm-precon-list .cm-precon").first().waitFor({timeout: 30000});
    eq((await page.locator("#cm-dialog[open] h2").first().textContent()).trim(), "Start from a precon", "the landing page's Start from a precon opens the picker");
    eq((await page.locator("#cm-precon-n").innerText()).trim(), `${data.decks.length} of ${data.decks.length} Commander precons, newest first`, "it says how many there are");
    const first = await rows(page);
    eq(first.map((r) => r.id).slice(0, 5), data.decks.slice(0, 5).map((d) => d.id), "newest first");
    eq(first.length, 60, "sixty at a time, with a word to narrow the search for the rest");
    const now = new Date(), today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`, top = byId.get(first[0].id);  /* the reader's calendar date, as the app reads it */
    ok(first[0].text.includes(`${top.code} · ${top.releaseDate > today ? "Releases " : ""}${us(top.releaseDate)}`), `each row says its set and a US date: "${first[0].text}"`);
    ok(first.every((r) => r.pips === new Set(byId.get(r.id).commander.flatMap((c) => c.colorIdentity)).size), "and its commander's colors");

    /* 2. Search, partners included. */
    const doctor = await search(page, "sarah jane");
    ok(doctor.length >= 1 && doctor.every((r) => /Sarah Jane Smith/.test(r.text)) && doctor.some((r) => / \+ /.test(r.text)), "a partner is found by either name, and the row names both");
    eq((await search(page, "WOC")).map((r) => r.id).sort(), data.decks.filter((d) => d.code === "WOC").map((d) => d.id).sort(), "a set code finds that set's precons");
    eq(await search(page, "no such precon anywhere"), [], "and nothing is nothing");
    ok(/No precon matches/.test(await page.locator("#cm-precon-list").innerText()), "said so");

    /* 3. A choice. */
    const pick = data.decks.find((d) => d.commander.length === 1 && !d.notInUniverse);
    await search(page, pick.commander[0].name);
    await page.locator(`#cm-precon-list [data-precon="${pick.id}"]`).click();
    await page.waitForFunction(() => document.querySelector("#cm-dialog[open] textarea[name=text]"), null, {timeout: 30000});
    eq((await page.locator("#cm-dialog[open] h2").first().textContent()).trim(), "Import cards or a deck list", "a choice opens the app's own import, to review before saving");
    const lines = (await page.$eval("#cm-dialog textarea[name=text]", (t) => t.value)).split("\n");
    eq(lines[0], `1 ${pick.commander[0].name}`, "the commander first");
    eq(lines.reduce((n, l) => n + Number(l.split(" ")[0]), 0), 100, "a hundred cards");
    eq(await page.inputValue("#cm-dialog input[name=name]"), pick.name, "named after the precon");
    eq(fetched.length, 0, "the list was not fetched again (it was cached by the click above)");
    await page.keyboard.press("Escape");

    /* 4. A card banned since it was printed. */
    const banned = data.decks.find((d) => d.notInUniverse && d.notInUniverse.includes("Dockside Extortionist"));
    ok(banned, "the committed list has a precon holding a card banned since (Dockside Extortionist)");
    await page.locator(".cm-landing [data-action=start-precon]").click();
    await page.locator("#cm-precon-list .cm-precon").first().waitFor({timeout: 30000});
    await search(page, banned.name);
    await page.locator(`#cm-precon-list [data-precon="${banned.id}"]`).click();
    await page.waitForFunction(() => document.querySelector("#cm-dialog[open] textarea[name=text]"), null, {timeout: 30000});
    ok(/Dockside Extortionist.*banned since it was printed/.test(await page.locator("#cm-notice").innerText()), "a precon with a banned card says so before the review");
    eq(fetched.length, 0, "and the list was not fetched again");
    await context.close();
  }
  /* 1. The New deck wizard's From a precon. */
  {
    const {context, page} = await fresh();
    await page.goto(`${base}/index.html#decks`);
    await page.getByRole("heading", {name: "Decks", level: 1}).waitFor({timeout: 60000});
    await page.locator(".cm-page-head [data-action=new-deck]").click();
    await page.locator("#cm-dialog [data-action=start-precon]").click();
    await page.locator("#cm-precon-list .cm-precon").first().waitFor({timeout: 30000});
    eq((await page.locator("#cm-dialog[open] h2").first().textContent()).trim(), "Start from a precon", "New deck offers From a precon, the same picker");
    await page.keyboard.press("Escape");
    await page.locator("#cm-precon-latest:not([hidden]) .cm-precon-chip").first().waitFor({timeout: 30000});
    eq(await page.$$eval("#cm-precon-latest .cm-precon-chip", (bs) => bs.map((b) => b.dataset.precon)), latest.decks.map((d) => d.id), "the Decks hub carries the same New from Wizards strip");
    /* Rob, 2026-09-30: on the Decks page, the pointer on a precon shows its commander's card, and moving off puts it away. */
    await page.locator("#cm-precon-latest .cm-precon-chip").first().hover();
    await page.locator(".cm-hover-art:not([hidden]) img[src]").waitFor({timeout: 10000});
    const pop = await page.evaluate(() => {const box = document.querySelector(".cm-hover-art"), chip = document.querySelector("#cm-precon-latest .cm-precon-chip"), r = box.getBoundingClientRect(), c = chip.getBoundingClientRect(); return {card: chip.dataset.card, src: box.querySelector("img").getAttribute("src"), beside: r.left >= c.right - 1 || r.right <= c.left + 1, w: Math.round(r.width)};});
    ok(pop.card === latest.decks[0].commander[0].name && pop.src && pop.beside && pop.w >= 300, `the pointer on a precon shows its commander's card beside it, ${pop.w}px (${pop.card})`);
    await page.mouse.move(5, 5);
    await page.locator(".cm-hover-art").waitFor({state: "hidden", timeout: 5000});
    ok(true, "and it goes when the pointer moves off the precon");
    await context.close();
  }
} finally {
  await close();
}
console.log(`precons: ${checks} checks passed — ${data.decks.length} Commander precons, newest first, searchable, each coming in as a hundred-card list to review.`);
