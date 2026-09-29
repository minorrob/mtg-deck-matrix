/* THE RELEASE, WALKED THE WAY ROB SAID TO CONFIRM IT.
 *
 * Rob, 2026-09-24: "We confirm by testing the full deck creation, testing, exploring and acquiring
 * capabilities." This walks those four, in that order, on a fresh library, against any address:
 * a built release served locally (tools/release-pages.mjs --out, then any static server) or the
 * live site. Real Chromium, real IndexedDB -- and the real simulator in its worker, which is the
 * one piece no other suite runs: crankmagic-journeys files a report instead of measuring, and the
 * simulator is exactly what a release can break by leaving out a file it loads at run time.
 *
 * Around the four, the release's own promises: the Menu names the commit, Play says Coming Soon (or is the
 * table's page, on a release with Play in the cloud),
 * and across the whole walk the page throws nothing, asks the site for nothing it does not have,
 * and never reaches for a game host or a tunnel.
 *
 *   UAT_BASE=http://crankmagic.localhost:8790 node tests/uat/release-acceptance.mjs
 *   UAT_SHOTS=<folder> saves a screenshot per step; UAT_LIVE_NETWORK=1 lets Scryfall answer for
 *   real (the default answers it from the shipped catalog, as every walk here does).
 *
 * Serve it at a *.localhost name, not 127.0.0.1 or localhost: those are the game host's own copy to
 * the app, and a name under .localhost is a secure context by spec, like the https site.
 */
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {mkdirSync} from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const {chromium} = require(process.env.UAT_PLAYWRIGHT || "playwright");
const BASE = (process.env.UAT_BASE || "").replace(/\/+$/, "");
if (!BASE) {console.error("release-acceptance: set UAT_BASE to the release's address"); process.exit(2);}
const SHOTS = process.env.UAT_SHOTS || "";
if (SHOTS) mkdirSync(SHOTS, {recursive: true});

const browser = await chromium.launch({headless: true, ignoreDefaultArgs: ["--hide-scrollbars"], ...(process.env.UAT_CHROME ? {executablePath: process.env.UAT_CHROME} : {})});
const context = await browser.newContext({viewport: {width: 1440, height: 900}});
const page = await context.newPage();
const origin = new URL(BASE).origin;
const thrown = [], missing = [], hostCalls = [], refused = [];
page.on("pageerror", (e) => thrown.push(e.message));
page.on("console", (m) => {if (m.type() === "error" && /Content Security Policy|Refused to (connect|load)/i.test(m.text())) refused.push(m.text());});
/* UAT_STATIC=1: the release is served as plain files, with no Worker behind /api/*, so the account
   module's /api/me meets a 404 there; on Cloudflare it meets Access instead. Only then is that allowed. */
const STATIC = process.env.UAT_STATIC === "1";
page.on("response", (r) => {const u = new URL(r.url()); if (u.origin === origin && r.status() === 404 && !(STATIC && u.pathname.startsWith("/api/"))) missing.push(u.pathname);});
page.on("request", (r) => {if (/(127\.0\.0\.1|localhost):8768|trycloudflare\.com/.test(r.url())) hostCalls.push(r.url());});
/* The simulator runs in a worker, whose errors never reach the page's own listeners. */
const workerTrouble = [];
page.on("worker", (w) => {w.on("console", (m) => {if (m.type() === "error") workerTrouble.push(m.text());}); w.on("close", () => {});});
/* UAT_RELEASE=0 walks the same four against main's own pages, which carry no release marks. */
const RELEASE = process.env.UAT_RELEASE !== "0";
if (process.env.UAT_LIVE_NETWORK !== "1") {const {stubNetwork} = await import("./scryfall-stub.mjs"); await stubNetwork(page, []);}

let checks = 0;
const ok = (value, message) => {assert.ok(value, message); checks++; console.log(`  ok  ${message}`);};
const shot = async (name) => {if (SHOTS) await page.screenshot({path: path.join(SHOTS, `${name}.png`)});};
const click = (label) => page.getByRole("button", {name: label, exact: true}).click();
const nav = (label) => page.getByRole("link", {name: label, exact: true}).click();
const noticeMatching = (re, timeout = 60000) => page.waitForFunction((source) => new RegExp(source).test(document.querySelector("#cm-notice")?.textContent || ""), re.source, {timeout}).then(() => page.locator("#cm-notice").innerText());
const library = () => page.evaluate(async () => {const r = await CrankRepository.open(); try {return await r.getState();} finally {r.close();}});

try {
  await page.goto(`${BASE}/index.html#decks`);
  await page.getByRole("heading", {name: /^(Decks|Build it\. Make it yours\.)$/}).first().waitFor({timeout: 60000});
  ok((await library()).decks.length === 0, "the release opens on a fresh, empty library");

  if (RELEASE) {
    /* The release names itself, and shares the address it is published at -- the canonical link --
       not whatever address this copy happens to be open on. */
    /* The version moved from the Menu to Settings › About in R3.3 (INTAKE §4.7); the Menu's Settings
       entry is how a reader gets there. */
    await click("Menu");
    await click("Settings");
    await page.locator(".cm-settings .cm-version").waitFor({timeout: 15000});
    const version = (await page.locator(".cm-settings .cm-version").innerText()).replace(/\s+/g, " ").trim();
    ok(/[0-9a-f]{7} · \d{4}-\d{2}-\d{2}/.test(version), `Settings names this release: ${version}`);
    await shot("01-settings-version");
    await click("Menu");
    /* A release with accounts offers sign-in to a person who is not signed in -- and nothing else changes. */
    if (await page.evaluate(() => document.querySelector('meta[name="crankmagic-accounts"]')?.content === "on")) {
      await page.locator("#cm-account").waitFor({timeout: 15000});
      ok(/Sign in to keep your library in the cloud/.test(await page.locator("#cm-account").innerText()), "signed out, the Menu offers the cloud library, and the workshop is otherwise the same");
    }
    const home = await page.evaluate(() => new URL("./", document.querySelector('link[rel="canonical"]').href).href);
    ok((await page.locator("#cm-share-mail").getAttribute("href")).includes(encodeURIComponent(home)), `the share link carries the published address, ${home}`);
    await shot("01b-menu");
    await page.keyboard.press("Escape");

    /* Play is Coming Soon -- or, on a release with Play in the cloud (staging since 2026-09-29), the table's page. */
    await nav("Play");
    if (await page.getAttribute('meta[name="crankmagic-play"]', "content") === "cloud") {
      await page.getByRole("heading", {name: "New table"}).waitFor({timeout: 20000});
      ok(!/Coming Soon/.test(await page.locator("#cm-main").textContent()), "Play is the table's page: New table, not Coming Soon");
      await shot("02-play-new-table");
      await nav("Decks");
      await page.waitForFunction(() => location.hash.startsWith("#decks"));
    } else {
      await page.getByRole("heading", {name: "Coming Soon", level: 1}).waitFor({timeout: 20000});
      ok(/play/i.test(await page.locator("#cm-main .v-eyebrow").first().innerText()), "Play says Coming Soon");
      await shot("02-play-coming-soon");
      await click("Go to your decks");
      await page.waitForFunction(() => location.hash.startsWith("#decks"));
      ok(true, "and its button goes back to the decks");
    }
  }

  /* 1 · CREATE. Build drafts a hundred for a commander from nothing but its name. */
  await page.evaluate(() => {location.hash = "#lab";});
  await page.locator("#cm-lab-form").waitFor({timeout: 45000});
  const openAll = () => page.evaluate(() => document.querySelectorAll("#cm-lab-form details").forEach((d) => {d.open = true;}));
  await openAll();
  await page.locator("#cm-lab-form [name=mode]").selectOption("commander");
  await openAll();
  await page.locator("#cm-lab-form [name=commanderQuery]").fill("Krenko, Mob Boss");
  await page.locator("[data-lab-commander]").filter({has: page.getByText("Krenko, Mob Boss", {exact: true})}).click();
  await openAll();
  await page.locator("#cm-lab-form [name=deckName]").fill("Release Goblins");
  await click("Run initial draft");
  await page.getByRole("button", {name: "Review draft cards"}).waitFor({timeout: 90000});
  ok(true, "Build drafted a starting hundred for Krenko, Mob Boss");
  await shot("03-create-draft");

  /* 2 · TEST. Measure plays simulated games in the simulator's worker. Build's five steps are
     numbered Run buttons; each one's name is what it does ("Measure this draft"). */
  await click("Measure this draft");
  const pill = setInterval(() => page.locator("#cm-lab-sim-status").innerText().then((t) => console.log(`      measuring: ${t || "(empty)"}`)).catch(() => {}), 15000);
  const measured = await noticeMatching(/^Measured \d/, 240000).finally(() => clearInterval(pill));
  ok(/Measured [\d.]+ points from [\d,]+ games in [\d.]+s/.test(measured), `Measure ran the simulator: ${measured.split(".")[0]}.${measured.split(".")[1]}`);
  await shot("04-test-measured");
  await click("Save this deck");
  await page.waitForFunction(async () => {const r = await CrankRepository.open(); try {return (await r.getState()).decks.some((d) => d.name === "Release Goblins");} finally {r.close();}}, null, {timeout: 30000});
  const saved = (await library()).decks.find((d) => d.name === "Release Goblins");
  const count = saved.slots.reduce((n, r) => n + r.quantity, 0) + saved.commanders.filter((id) => !saved.slots.some((r) => r.cardId === id)).length;
  ok(count === 100, `Save this deck made it a deck of 100 (${count})`);
  ok((await library()).reports.some((r) => r.deckId === saved.id && r.metrics?.score), "and the measurement went with it, filed under the deck");
  await page.evaluate((id) => {location.hash = "#decks?deck=" + encodeURIComponent(id);}, saved.id);
  await page.getByRole("tab", {name: /^Overview/}).waitFor({timeout: 30000});
  await page.waitForTimeout(800);
  await shot("05-create-deck-page");
  /* Finalize marks the list final (G3d, D4: a draft already reserves what you own and lists the rest to buy, so
     finalizing is the badge, not the step that makes the buy list). */
  await click("Finalize");
  await click("Confirm change");
  await page.getByRole("dialog").waitFor({state: "hidden"});
  ok((await library()).decks.find((d) => d.id === saved.id).status === "final", "Finalize makes it final");

  /* 3 · EXPLORE. Follow a card into the graph. */
  await nav("Explore");
  await page.locator("[data-action=explore-from-card]").waitFor({timeout: 60000});
  await shot("06-explore-doors");
  await page.locator("[data-action=explore-from-card]").click();
  await page.getByLabel("Card name or a Scryfall link").fill("Sol Ring");
  await page.locator("[data-pick-card]").filter({has: page.getByText("Sol Ring", {exact: true})}).first().click();
  await page.waitForFunction(() => new URLSearchParams(location.hash.split("?")[1] || "").get("card") === "Sol Ring", null, {timeout: 30000});
  await page.locator("#cm-graph").waitFor({timeout: 60000});
  await page.waitForFunction(() => document.querySelector("#cm-graph")?.crankGraph?.current?.()?.name === "Sol Ring", null, {timeout: 60000});
  ok(true, "Explore follows Sol Ring into its connections on the graph");
  await page.waitForTimeout(1200);
  await shot("07-explore-graph");

  /* 4 · ACQUIRE. The new deck's cards are on the To buy list, priced; one tap buys one. */
  await page.goto(`${BASE}/index.html#cards?tab=buy`);
  await page.locator("#cm-roster-table").waitFor({timeout: 45000});
  const toBuy = await page.locator("[data-action=shop-buy]").count();
  ok(toBuy > 0, `the To buy list carries the new deck's cards (${toBuy} rows with Bought)`);
  await shot("08-acquire-to-buy");
  const before = (await library()).lots.filter((l) => l.source === "owned").reduce((n, l) => n + l.quantity, 0);
  await page.locator("[data-action=shop-buy]").first().click();
  const bought = await noticeMatching(/is yours|are yours/);
  const after = (await library()).lots.filter((l) => l.source === "owned").reduce((n, l) => n + l.quantity, 0);
  ok(after > before, `Bought makes it yours: "${bought.split(" — ")[0]}" (owned ${before} → ${after})`);
  await shot("09-acquire-bought");

  /* 5 · A CARD'S NAME OPENS THE CARD, and a menu is a menu (Rob, 24 September). A stray argument
     made every card-name click end in "back is not defined", and the menus drew transparent over
     the rows because their colors were defined inside the page and they open outside it. */
  await page.locator("#cm-roster-table tbody .cm-card-name").first().click();
  await page.locator("#cm-dialog[open] .cm-inspector").waitFor({timeout: 30000});
  ok(true, "a card's name in the list opens the card");
  await page.keyboard.press("Escape");
  const more = page.getByRole("button", {name: /^More/}).first();
  await more.click();
  const menuBg = await page.evaluate(() => getComputedStyle(document.querySelector(".cm-menu[popover]:popover-open")).backgroundColor);
  ok(menuBg !== "rgba(0, 0, 0, 0)" && menuBg !== "transparent", `the More menu is opaque (${menuBg})`);
  await more.click();
  ok(await page.locator(".cm-menu[popover]:popover-open").count() === 0, "and a second click on More closes it");

  /* And across the whole walk. */
  ok(thrown.length === 0, `no page errors${thrown.length ? ": " + thrown.join(" | ") : ""}`);
  ok(missing.length === 0, `the site had every file the app asked for${missing.length ? " -- missing: " + [...new Set(missing)].join(", ") : ""}`);
  ok(hostCalls.length === 0, `nothing reached for a game host or a tunnel${hostCalls.length ? ": " + hostCalls.join(", ") : ""}`);
  ok(refused.length === 0, `the security policy refused nothing${refused.length ? ": " + refused.join(" | ") : ""}`);
  console.log(`release-acceptance: ${checks} checks passed against ${BASE} -- create, test, explore, acquire.`);
} catch (error) {
  if (SHOTS) await page.screenshot({path: path.join(SHOTS, "failure.png")}).catch(() => {});
  console.error(`release-acceptance FAILED at ${page.url()}\n${error.stack || error}`);
  if (thrown.length) console.error("page errors:", thrown);
  if (workerTrouble.length) console.error("worker errors:", workerTrouble);
  console.error("notice:", await page.locator("#cm-notice").innerText().catch(() => "(none)"));
  if (missing.length) console.error("404s:", [...new Set(missing)]);
  process.exitCode = 1;
} finally {
  await browser.close();
}
