/* THE FIRST-LOOK LIST, WALKED (Rob, 2026-09-24, #372) — every item of it, on a served release.
 *
 *   node tools/serve-folder.mjs <release folder> 8790
 *   UAT_BASE=http://crankmagic.localhost:8790 UAT_LIVE_NETWORK=1 node tests/uat/first-look.mjs
 *
 * Rob walked crankmagic.com the evening accounts went live and sent a list: card names that threw
 * "back is not defined", menus drawn transparent over the rows, a More menu a second click would not
 * close, a hover picture too small and missing from a deck's hundred, the Overview's By card type bar
 * drawing nothing, Full guide and SWOT going to the wrong page, Explore's dead search box and its wait
 * on 21 MB, Inspect not the default, the rail's "saved in this browser" note, three Menu entries to go,
 * an adventure's second cost on the row, and the Table view's sizes. Each came back fixed, and each is a
 * check here, so the r3 redesign (docs/design/2026-09-25-redesign-r3/) cannot quietly undo one.
 *
 * It restores the committed library (data/live-state.json) through Menu → Restore, as a reader would,
 * and needs the live network for card pictures and Explore (UAT_LIVE_NETWORK=1 is the only mode it has).
 * UAT_SHOTS=<folder> keeps a screenshot per step. Exit 1 on any failed item, naming it. */
import path from "node:path";
import {mkdirSync} from "node:fs";
import {pathToFileURL} from "node:url";
import {findPlaywright, ROOT} from "./browser-runner.mjs";

const BASE = (process.env.UAT_BASE || "").replace(/\/+$/, "");
if (!BASE) { console.error("first-look: set UAT_BASE to the release's address"); process.exit(2); }
const BACKUP = process.env.UAT_BACKUP || path.join(ROOT, "data", "live-state.json");
const SHOTS = process.env.UAT_SHOTS || "";
if (SHOTS) mkdirSync(SHOTS, {recursive: true});
const entry = findPlaywright();
if (!entry) { console.error("first-look: Playwright is not installed (set UAT_PLAYWRIGHT)"); process.exit(1); }
const pw = await import(path.isAbsolute(entry) ? pathToFileURL(entry).href : entry);
const chromium = pw.chromium || pw.default.chromium;
const browser = await chromium.launch({headless: true, args: ["--host-resolver-rules=MAP crankmagic.localhost 127.0.0.1"], ...(process.env.UAT_CHROME ? {executablePath: process.env.UAT_CHROME} : {})});

const results = [];
const verdict = (item, pass, detail = "") => { results.push({item, pass}); console.log(`${pass ? "  ok  " : "  FAIL"} ${item}${detail ? " -- " + detail : ""}`); };
const toast = (page) => page.locator(".cm-notice, [role=alert]").filter({hasText: /not defined/}).count();
const opaque = (page, sel) => page.evaluate((s) => { const m = document.querySelector(s); if (!m) return null; const bg = getComputedStyle(m).backgroundColor; return {bg, opaque: bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent"}; }, sel);
const artShown = (page) => page.evaluate(() => { const b = document.querySelector(".cm-hover-art"); if (!b || b.hidden) return null; const r = b.getBoundingClientRect(); return {w: Math.round(r.width), inView: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight}; });
const artHidden = (page) => page.evaluate(() => { const b = document.querySelector(".cm-hover-art"); return !b || b.hidden; });

async function session(viewport, tag) {
  const context = await browser.newContext({viewport});
  const page = await context.newPage();
  const errors = []; page.on("pageerror", (e) => errors.push(e.message));
  const shot = (n) => SHOTS ? page.screenshot({path: path.join(SHOTS, `${tag}-${n}.png`)}) : null;
  await page.goto(`${BASE}/index.html`);
  await page.getByRole("heading", {name: "Build it. Make it yours."}).waitFor({timeout: 60000});
  return {context, page, errors, shot};
}
async function restore(page) {
  await page.getByRole("button", {name: "Menu", exact: true}).click();
  await page.getByRole("button", {name: "Restore from a backup file", exact: true}).click();
  await page.getByLabel("CrankMagic JSON backup").setInputFiles(BACKUP);
  await page.getByRole("button", {name: "Validate backup", exact: true}).click();
  await page.getByLabel("Type RESTORE to replace the library").fill("RESTORE");
  await page.getByRole("button", {name: "Restore reviewed backup", exact: true}).click();
  await page.getByRole("dialog").waitFor({state: "hidden"});
  await page.waitForTimeout(1200);
}
/* A real pointer comes to rest on the name's words; hovering a wide button's center, or a scroll under a
   resting pointer, is not what a reader does. */
async function restOn(page, locator) {
  await locator.scrollIntoViewIfNeeded(); await page.waitForTimeout(600);
  const r = await locator.boundingBox();
  await page.mouse.move(r.x + 8, r.y + r.height / 2); await page.mouse.move(r.x + 14, r.y + r.height / 2);
  await page.waitForTimeout(1500);
}

try {
  /* Desktop. */
  {
    const {context, page, errors, shot} = await session({width: 1440, height: 900}, "desktop");
    verdict("the empty Decks page offers Restore a backup, not Import", await page.getByRole("button", {name: "Restore a backup", exact: true}).count() === 1);
    await restore(page);
    await page.getByRole("button", {name: "Menu", exact: true}).click(); await page.waitForTimeout(300);
    verdict("Menu no longer offers Subscribe, a mirrored file or Load Live", !/Subscribe to updates|Keep a file up to date|Load Live/i.test(await page.locator("#cm-user-menu").innerText()));
    await shot("menu"); await page.keyboard.press("Escape");
    verdict("the rail has no 'saved in this browser' note", await page.locator(".cm-nav-note").count() === 0);
    verdict("the Decks header reads naturally", !/, no playable/.test(await page.locator("#cm-main").innerText()));

    await page.goto(`${BASE}/index.html#cards`); await page.locator("#cm-roster-table").waitFor({timeout: 30000}); await page.waitForTimeout(1200);
    await shot("library");
    const kpi = await page.evaluate(() => { const k = document.querySelector(".cm-kpi"), s = k.querySelector("strong").getBoundingClientRect(), r = k.getBoundingClientRect(); return {pad: Math.round(s.left - r.left), h: Math.round(r.height)}; });
    verdict("the Library counts are cards with room around the figure", kpi.pad >= 12 && kpi.h >= 70, JSON.stringify(kpi));
    const firstName = page.locator("#cm-roster-table tbody .cm-card-name").first();
    await restOn(page, firstName);
    const art = await artShown(page);
    verdict("the Library hover picture is 360px", !!art && art.w >= 350, JSON.stringify(art));
    await page.mouse.move(5, 5); await page.waitForTimeout(300);
    verdict("and it goes away when the pointer leaves", await artHidden(page));
    await firstName.click(); await page.waitForTimeout(1500);
    verdict("a card name in Library opens the card, no 'is not defined'", await page.locator("#cm-dialog[open] .cm-inspector").count() === 1 && (await toast(page)) === 0);
    await page.keyboard.press("Escape"); await page.waitForTimeout(300);
    const dots = page.locator("#cm-roster-table tbody [data-action=row-actions]").first();
    await dots.click(); await page.waitForTimeout(400);
    verdict("the row ⋯ menu is opaque", !!(await opaque(page, ".cm-row-menu:popover-open"))?.opaque);
    await dots.click(); await page.waitForTimeout(400);
    verdict("a second click on ⋯ closes it", await page.locator(".cm-row-menu:popover-open").count() === 0);
    const more = page.getByRole("button", {name: /^More/}).first();
    await more.click(); await page.waitForTimeout(400);
    verdict("the More menu is opaque", !!(await opaque(page, ".cm-row-menu:popover-open"))?.opaque);
    await more.click(); await page.waitForTimeout(400);
    verdict("a second click on More closes it", await page.locator(".cm-row-menu:popover-open").count() === 0);
    await page.getByPlaceholder("Name, type or rules text").fill("Unexpected Party"); await page.waitForTimeout(1200);
    const cost = await page.evaluate(() => { const row = [...document.querySelectorAll("#cm-roster-table tbody tr")].find((r) => /Unexpected Party/.test(r.textContent)); return row?.querySelector(".cm-row-mana .cm-mana")?.getAttribute("aria-label") || null; });
    verdict("An Unexpected Party shows only its printed cost", cost === "Mana cost {2}{W}{W}", String(cost));
    await page.getByPlaceholder("Name, type or rules text").fill(""); await page.waitForTimeout(600);
    await page.getByRole("button", {name: "Table", exact: true}).click(); await page.waitForTimeout(2500);
    const pile = page.locator("#cm-tt-host .cm-tt-pile").first();
    if (await pile.count()) { await pile.click(); await page.waitForTimeout(1200); }
    const sizes = {};
    for (const k of ["S", "M", "L"]) { const b = page.locator(`#cm-tt-host [data-tt=size][data-size=${k}]`); if (await b.count()) { await b.click(); await page.waitForTimeout(700); sizes[k] = await page.evaluate(() => Math.round(document.querySelector("#cm-tt-host .cm-tt-grid .cm-tt-card")?.getBoundingClientRect().width || 0)); } }
    verdict("the Table view's S, M and L are 83, 125 and 182 px", sizes.S === 83 && sizes.M === 125 && sizes.L === 182, JSON.stringify(sizes));

    await page.goto(`${BASE}/index.html#decks`); await page.waitForTimeout(1000);
    await page.locator(".cm-deck-tile").first().getByRole("button").first().click();
    await page.getByRole("button", {name: "Open deck", exact: true}).click(); await page.waitForTimeout(2000);
    verdict("choosing Open deck closes the tile's menu", await page.locator(".cm-tile-menu:popover-open").count() === 0);
    await page.locator(".cm-bento-types").scrollIntoViewIfNeeded(); await page.waitForTimeout(300);
    const bands = await page.evaluate(() => [...document.querySelectorAll(".cm-bento-types .cm-breakdown i")].map((i) => getComputedStyle(i).backgroundColor));
    verdict("the Overview's By card type bar draws", bands.length > 0 && bands.every((c) => c !== "rgba(0, 0, 0, 0)"), `${bands.length} bands`);
    await shot("overview");
    const before = page.url();
    /* r3 (R3.5) made the guide a dialog; the first look's rule still holds -- the link stays on the deck. */
    await page.getByRole("button", {name: "Full guide and SWOT", exact: true}).click(); await page.waitForTimeout(800);
    const guideOpen = await page.evaluate(() => document.getElementById("cm-dialog").open && Boolean(document.querySelector("#cm-dialog #cm-sec-guide")));
    verdict("Full guide and SWOT stays on the deck and opens its guide", page.url() === before && guideOpen, `dialog open: ${guideOpen}`);
    await page.keyboard.press("Escape");
    await page.getByRole("tab", {name: /^The hundred/}).click(); await page.waitForTimeout(1200);
    const name = page.locator(".cm-deck-list .cm-card-name").nth(3);
    await restOn(page, name);
    const art2 = await artShown(page);
    verdict("a name in the hundred shows the card at 360px, inside the window", !!art2 && art2.w >= 350 && art2.inView, JSON.stringify(art2));
    await page.mouse.move(5, 5); await page.waitForTimeout(300);
    verdict("and hides when the pointer leaves", await artHidden(page));
    await name.click(); await page.waitForTimeout(1500);
    verdict("a name in the hundred opens the card, no 'is not defined'", await page.locator("#cm-dialog[open] .cm-inspector").count() === 1 && (await toast(page)) === 0);
    await page.keyboard.press("Escape");

    await page.goto(`${BASE}/index.html#discover`);
    const t0 = Date.now();
    await page.locator(".cm-explore-chooser").waitFor({timeout: 120000});
    verdict("Explore's chooser draws without waiting for the co-play links", Date.now() - t0 < 60000, `${Date.now() - t0} ms`);
    verdict("Explore no longer says '20 MB'", !/20 MB/.test(await page.locator("#cm-main").innerText()));
    await shot("explore");
    const box = await page.evaluate(() => { const i = document.getElementById("cm-entry-query"), cs = getComputedStyle(i); return {font: cs.fontSize, color: cs.color, kbd: !!document.querySelector(".cm-explore-search kbd")}; });
    verdict("the search at the top right is a visible field with no dead key hint", box.font === "15px" && box.color !== "rgba(0, 0, 0, 0)" && !box.kbd, JSON.stringify(box));
    await page.locator("#cm-entry-query").fill("Sol Ring"); await page.keyboard.press("Enter"); await page.waitForTimeout(1500);
    verdict("typing a card there and pressing Enter opens the picker on it", (await page.locator("#cm-card-query").inputValue().catch(() => null)) === "Sol Ring");
    await page.keyboard.press("Escape");
    await page.goto(`${BASE}/index.html#discover?card=Sol%20Ring`);
    await page.locator("[data-action=graph-mode]").first().waitFor({timeout: 180000}); await page.waitForTimeout(1500);
    const mode = await page.evaluate(() => [...document.querySelectorAll("[data-action=graph-mode]")].find((b) => b.getAttribute("aria-pressed") === "true")?.dataset.mode);
    verdict("Explore's graph opens in Inspect", mode === "inspect", String(mode));
    verdict("no page errors on the desktop walk", errors.length === 0, errors.slice(0, 3).join(" | "));
    await context.close();
  }

  /* A phone. */
  {
    const {context, page, errors, shot} = await session({width: 390, height: 844}, "phone");
    await restore(page);
    await page.goto(`${BASE}/index.html#decks`); await page.waitForTimeout(1200);
    await page.locator(".cm-deck-tile").first().getByRole("button").first().click();
    await page.getByRole("button", {name: "Open deck", exact: true}).click(); await page.waitForTimeout(2000);
    await shot("deck");
    const bar = await page.evaluate(() => { const b = document.querySelector(".cm-action-bar"); if (!b) return null; return {buttons: [...b.querySelectorAll(".v-button")].map((x) => { const q = x.getBoundingClientRect(); return [Math.round(q.left), Math.round(q.right)]; }), vw: innerWidth, heroWork: getComputedStyle(document.querySelector(".cm-deck-hero .cm-deck-work")).display}; });
    verdict("the phone's action bar fits the screen", !!bar && bar.buttons.every(([l, r]) => l >= 0 && r <= bar.vw), JSON.stringify(bar));
    verdict("and the hero does not repeat its three actions", bar && bar.heroWork === "none");
    verdict("no page errors on the phone walk", errors.length === 0, errors.slice(0, 3).join(" | "));
    await context.close();
  }
} finally {
  await browser.close();
}
const failed = results.filter((r) => !r.pass);
console.log(`first-look: ${results.length - failed.length} of ${results.length} items hold against ${BASE}${failed.length ? " -- failing: " + failed.map((f) => f.item).join("; ") : ""}`);
process.exitCode = failed.length ? 1 : 0;
