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

    /* 1. The picker. */
    await page.locator(".cm-landing [data-action=start-precon]").click();
    await page.locator("#cm-precon-list .cm-precon").first().waitFor({timeout: 30000});
    eq((await page.locator("#cm-dialog[open] h2").first().innerText()).trim(), "Start from a precon", "the landing page's Start from a precon opens the picker");
    eq((await page.locator("#cm-precon-n").innerText()).trim(), `${data.decks.length} of ${data.decks.length} Commander precons, newest first`, "it says how many there are");
    const first = await rows(page);
    eq(first.map((r) => r.id).slice(0, 5), data.decks.slice(0, 5).map((d) => d.id), "newest first");
    eq(first.length, 60, "sixty at a time, with a word to narrow the search for the rest");
    const today = new Date().toISOString().slice(0, 10), top = byId.get(first[0].id);
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
    eq((await page.locator("#cm-dialog[open] h2").first().innerText()).trim(), "Import cards or a deck list", "a choice opens the app's own import, to review before saving");
    const lines = (await page.$eval("#cm-dialog textarea[name=text]", (t) => t.value)).split("\n");
    eq(lines[0], `1 ${pick.commander[0].name}`, "the commander first");
    eq(lines.reduce((n, l) => n + Number(l.split(" ")[0]), 0), 100, "a hundred cards");
    eq(await page.inputValue("#cm-dialog input[name=name]"), pick.name, "named after the precon");
    eq(fetched.length, 1, "the list was fetched once");
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
    eq(fetched.length, 1, "and the list was not fetched again");
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
    eq((await page.locator("#cm-dialog[open] h2").first().innerText()).trim(), "Start from a precon", "New deck offers From a precon, the same picker");
    await context.close();
  }
} finally {
  await close();
}
console.log(`precons: ${checks} checks passed — ${data.decks.length} Commander precons, newest first, searchable, each coming in as a hundred-card list to review.`);
