/* THE IMPORT, AS ROB MET IT (2026-09-28).
 *
 * He pasted the 886 distinct cards he owns. The first 150 resolved at once and then it crawled, 2 to 20 rows
 * every 2.6 seconds: every name the catalog did not know was its own Scryfall lookup, refused past the burst
 * allowance and retried for about 2.6 seconds each. And around it:
 *   - an existing group still offered "New group name";
 *   - the review showed only the first 100 rows by name, so a row needing "Correct identity" could be hidden,
 *     and there was no way to see only those;
 *   - closing the review, by the close control, a click beside it or Escape, threw the whole batch away
 *     without a word, and "Revise input" came back with the pasted list gone;
 *   - the New deck dialog was 900 wide around choices 56 characters wide, its close button far off to the right;
 *   - the Library had no way in to upload cards except through a deck;
 *   - the rail's Menu sat at the foot of the page, lost in the scroll.
 *
 *   Resolve  names the catalog knows answer at once; the rest go to Scryfall 75 a request (a double-faced
 *            card's front face is a name the catalog knows); a printing or a link is looked up one by one
 *   Wait     a refusal is retried after the wait Scryfall names, inside the call's deadline
 *   Group    "New group name" shows only for a new group, in the import and in Explore's two group forms
 *   Review   every unresolved row is shown; "Needs identity only" shows just those; a correction keeps the
 *            review's filter
 *   Close    the close control, Escape and the backdrop ask "Are you sure…"; staying keeps the batch
 *   Revise   comes back with the pasted list
 *   New deck the dialog is as wide as its choices, its close button in line with their right edge
 *   Upload   Library › Upload cards opens the import
 *   Menu     sits right under Play
 *
 * The node half needs nothing; the browser half needs Playwright (GEOMETRY_REQUIRED=1 makes its absence a failure).
 */
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {readFileSync, mkdirSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {openBrowser} from "./uat/browser-runner.mjs";

const require = createRequire(import.meta.url);
const Catalog = require("../card-catalog.js");
const {createClient} = require("../scryfall-client.js");
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let checks = 0;
const ok = (c, m) => {assert.ok(c, m); checks += 1;};
const eq = (a, b, m) => {assert.deepEqual(a, b, m); checks += 1;};
const SHOTS = process.env.UAT_SHOTS || "";
if (SHOTS) mkdirSync(SHOTS, {recursive: true});
const shot = async (page, name) => {if (SHOTS) await page.screenshot({path: path.join(SHOTS, `${name}.png`)});};

/* ---- RESOLVE: the catalog's resolveMany against a counting client ---- */
{
  const universe = {generatedAt: "2026-09-19", cards: [
    ...Array.from({length: 200}, (_, i) => [`Local ${i}`, "U", "c", 2, "Creature", null, 0]),
    ["Delver of Secrets // Insectile Aberration", "U", "c", 1, "Creature", null, 0],
    ["Sol Ring", "", "u", 1, "Artifact", null, 0]]};
  const fetchImpl = async (url) => new Response(JSON.stringify(String(url).includes("universe") ? universe : String(url).includes("facts") ? {cards: {}} : {cards: []}), {status: 200, headers: {"Content-Type": "application/json"}});
  const REMOTE = new Set(Array.from({length: 160}, (_, i) => `remote ${i}`));
  const calls = {named: 0, collection: [], bySetNumber: 0};
  const client = {
    named: async () => {calls.named += 1; return null;},
    bySetNumber: async (set, n) => {calls.bySetNumber += 1; return {name: "Sol Ring", id: `print-${set}-${n}`, set, typeLine: "Artifact", legalities: {commander: "legal"}};},
    collection: async (ids) => {calls.collection.push(ids.length); return {cards: ids.filter(({name}) => REMOTE.has(name.toLowerCase())).map(({name}) => ({name, id: `id-${name}`, typeLine: "Creature", legalities: {commander: "legal"}})), missing: ids.filter(({name}) => !REMOTE.has(name.toLowerCase())).map(({name}) => name)};},
  };
  const cat = await Catalog.create({client, fetchImpl, urls: {universe: "u/universe.json", cards: "u/cards.json", facts: "u/facts.json", ranks: null, graph: "u/graph.json"}, savedCards: {}});
  const rows = [
    ...Array.from({length: 200}, (_, i) => ({name: `Local ${i}`})),
    {name: "Delver of Secrets"},
    ...Array.from({length: 160}, (_, i) => ({name: `Remote ${i}`})),
    {name: "Remote 5"},
    ...Array.from({length: 3}, (_, i) => ({name: `Ghost ${i}`})),
    {name: "Sol Ring", printing: {set: "ltc", collector: "292"}},
  ];
  const progress = [];
  const out = await cat.resolveMany(rows, {onProgress: (p) => progress.push(p)});
  eq(out.length, rows.length, "one answer per row, in order");
  ok(out.slice(0, 200).every((r, i) => r.card && r.card.name === `Local ${i}`), "the 200 names the catalog knows answer from the catalog");
  eq(out[200].card && out[200].card.name, "Delver of Secrets // Insectile Aberration", "a double-faced card's front face is a name the catalog knows");
  eq(calls.named, 0, "no name is looked up one by one");
  eq(calls.collection, [75, 75, 13], "the 163 names it does not know (160 cards, 3 unknown; a repeated name asked once) go to Scryfall 75 a request: 3 requests, not 164");
  ok(out.slice(201, 362).every((r) => r.card && /^Remote \d+$/.test(r.card.name)) && out[361].card.name === "Remote 5", "each is answered, the repeated row too");
  ok(out.slice(362, 365).every((r) => !r.card && /No exact match/.test(r.error)), "a name Scryfall does not know says so, for Correct identity");
  ok(out[365].card && out[365].card.name === "Sol Ring" && calls.bySetNumber === 1, "a row naming its printing is still looked up by set and number, alone");
  ok(progress.at(-1).done === rows.length && progress.at(-1).total === rows.length && progress.length < 10, `progress is told as it goes (${progress.length} updates), ending at ${rows.length} of ${rows.length}`);

  const failing = await Catalog.create({client: {...client, collection: async () => {throw new Error("Scryfall responded 503");}}, fetchImpl, urls: {universe: "u/universe.json", cards: "u/cards.json", facts: "u/facts.json", ranks: null, graph: "u/graph.json"}, savedCards: {}});
  const down = await failing.resolveMany([{name: "Local 1"}, {name: "Remote 1"}]);
  ok(down[0].card && !down[1].card && /503/.test(down[1].error), "Scryfall unreachable: the known rows still resolve, the others say why");
  const stop = new AbortController(); stop.abort();
  await assert.rejects(cat.resolveMany([{name: "Never Seen 1"}], {signal: stop.signal}), (e) => e.name === "AbortError"); checks += 1;
}

/* ---- WAIT: a refusal is retried after the wait Scryfall names ---- */
{
  const slept = [];
  let n = 0;
  const fetchImpl = async () => (n++ === 0 ? new Response("{}", {status: 429, headers: {"retry-after": "2"}}) : new Response(JSON.stringify({object: "card", id: "x", name: "Sol Ring", type_line: "Artifact", legalities: {}}), {status: 200, headers: {"Content-Type": "application/json"}}));
  const client = createClient({fetchImpl, delayMs: 0, cache: {get: () => null, set: () => {}}, sleep: async (ms) => {slept.push(ms);}});
  const card = await client.named("Sol Ring", {exact: true});
  ok(card && card.name === "Sol Ring" && slept.length === 1 && slept[0] >= 1900 && slept[0] <= 2000, `refused with "retry after 2 seconds", the client waits that (${slept[0]}ms), not its own quarter second, then succeeds`);
  const slept2 = []; let m = 0;
  const bare = createClient({fetchImpl: async () => (m++ === 0 ? new Response("{}", {status: 429}) : new Response(JSON.stringify({object: "card", id: "x", name: "Sol Ring", type_line: "Artifact", legalities: {}}), {status: 200})), delayMs: 0, cache: {get: () => null, set: () => {}}, sleep: async (ms) => {slept2.push(ms);}});
  await bare.named("Sol Ring", {exact: true});
  eq(slept2, [250], "with no wait named, the old quarter-second backoff stands");
}

/* ---- GROUP: Explore's two group forms use the same rule ---- */
{
  const src = readFileSync(path.join(ROOT, "crankmagic-discover.js"), "utf8");
  eq((src.match(/C\.newGroupName\(form\(`Add \$\{chosen\.length\}/g) || []).length, 2, "Explore's two Add-to-a-group forms show New group name only for a new group, through the same helper");
}

/* ---- THE BROWSER ---- */
const {browser, base, stub, close} = await openBrowser({name: "import-flow", flag: "GEOMETRY_REQUIRED"});
if (browser) {
  try {
    const context = await browser.newContext({viewport: {width: 1280, height: 900}, serviceWorkers: "block"});
    const page = await context.newPage();
    const scryfall = [];
    if (stub) await stub(page, scryfall);
    const asked = [];
    page.on("dialog", async (d) => {asked.push(d.message()); await (page.__accept ? d.accept() : d.dismiss());});

    /* MENU and UPLOAD */
    await page.goto(`${base}/index.html#cards`);
    await page.locator(".cm-subnav a", {hasText: "Upload cards"}).waitFor({timeout: 60000});
    const rail = await page.evaluate(() => {const play = document.querySelector('[data-nav="game"]').getBoundingClientRect(), menu = document.getElementById("cm-user-functions").getBoundingClientRect(); return {gap: Math.round(menu.top - play.bottom), playBottom: Math.round(play.bottom), menuTop: Math.round(menu.top)};});
    ok(rail.gap >= 0 && rail.gap <= 48, `Menu sits right under Play (${rail.gap}px below it), not at the foot of the page`);
    await shot(page, "rail-menu-1280");
    await page.locator(".cm-subnav a", {hasText: "Upload cards"}).click();
    await page.locator("#cm-dialog[open] h2", {hasText: "Import cards or a deck list"}).waitFor();
    ok(true, "Library › Upload cards opens the import, straight into the library");

    /* GROUP */
    const nameShown = () => page.locator("#cm-dialog [name=name]").isVisible();
    ok(await nameShown(), "with Create a new group chosen, New group name is asked");
    const existing = await page.locator("#cm-dialog [name=group] option").evaluateAll((o) => o.map((x) => x.value).filter(Boolean));
    await page.selectOption("#cm-dialog [name=group]", existing[0]);
    ok(!(await nameShown()), `an existing group (${existing[0]}) does not ask for a new group's name`);
    await shot(page, "import-existing-group-1280");
    await page.selectOption("#cm-dialog [name=group]", "");
    ok(await nameShown(), "and choosing Create a new group again asks for it again");

    /* RESOLVE, in the page: names the catalog knows, names only Scryfall knows, and names nobody knows */
    const known = JSON.parse(readFileSync(path.join(ROOT, "data", "commander-universe.json"), "utf8")).cards.map((c) => c[0]).filter((n) => !n.includes(" // ")).slice(0, 300);
    const ghosts = ["Zzz Ghost Card One", "Zzz Ghost Card Two", "Zzz Ghost Card Three"];
    const list = [...known, ...ghosts].map((n) => `1 ${n}`).join("\n");
    await page.fill("#cm-dialog textarea[name=text]", list);
    const started = Date.now();
    await page.click("#cm-dialog button[type=submit]");
    await page.locator("#cm-dialog[open] h2", {hasText: "Review import"}).waitFor({timeout: 60000});
    const took = Date.now() - started;
    const named = scryfall.filter((u) => u.startsWith("/cards/named")).length, batched = scryfall.filter((u) => u.startsWith("/cards/collection")).length;
    ok(named === 0 && batched === 1, `303 rows: the 300 known answer from the catalog, the 3 unknown go to Scryfall in 1 request (${batched} batched, ${named} one by one), in ${took}ms`);

    /* REVIEW */
    const rows = () => page.locator("#cm-import-preview tr").allInnerTexts();
    let shown = await rows();
    ok(ghosts.every((g) => shown.some((r) => r.includes(g))) && shown.length === 100, `all 3 rows needing identity are shown though they sort last of 303, within 100 rows (${shown.length})`);
    await page.check("#cm-import-needs");
    shown = await rows();
    ok(shown.length === 3 && shown.every((r) => /Correct identity/.test(r)), "Needs identity only shows just the 3");
    await shot(page, "review-needs-identity-1280");

    /* CLOSE: asked, and staying keeps the batch */
    page.__accept = false;
    await page.click("#cm-dialog .cm-dialog-close");
    await page.keyboard.press("Escape");
    await page.mouse.click(5, 5);
    await page.waitForTimeout(300);
    eq(asked, Array(3).fill("Are you sure you want to close this window? All progress will be lost."), "the close control, Escape and a click beside the dialog each ask first");
    ok(await page.locator("#cm-dialog[open] h2", {hasText: "Review import"}).count() === 1 && (await rows()).length === 3, "and choosing to stay keeps the review as it was, filter and all");

    /* A correction goes to the picker and back, keeping the review's filter */
    await page.locator("#cm-import-preview [data-action=resolve-row]").first().click();
    await page.locator("#cm-dialog[open] h2", {hasText: "Resolve imported row"}).waitFor();
    ok((await page.inputValue("#cm-card-query")) === "Zzz Ghost Card One", "Correct identity opens the picker with the row's name in it");
    await page.click("#cm-dialog .cm-dialog-close");
    await page.locator("#cm-dialog[open] h2", {hasText: "Review import"}).waitFor();
    ok(await page.isChecked("#cm-import-needs") && (await rows()).length === 3, "the picker's back returns to the review with its filter, not to nothing");

    /* REVISE keeps the list */
    await page.click("#cm-import-revise");
    await page.locator("#cm-dialog[open] h2", {hasText: "Import cards or a deck list"}).waitFor();
    eq((await page.inputValue("#cm-dialog textarea[name=text]")).split("\n").length, 303, "Revise input comes back with the 303 pasted lines");

    /* CLOSE, accepted, while resolving: it stops */
    await page.click("#cm-dialog button[type=submit]");
    await page.locator("#cm-dialog[open] h2", {hasText: "Review import"}).waitFor({timeout: 60000});
    page.__accept = true;
    await page.click("#cm-dialog .cm-dialog-close");
    await page.waitForTimeout(300);
    ok(!(await page.locator("#cm-dialog[open]").count()), "leaving when asked closes the review");

    /* NEW DECK */
    await page.goto(`${base}/index.html#decks`);
    await page.locator("[data-action=new-deck]").first().waitFor({timeout: 60000});
    await page.locator("[data-action=new-deck]").first().click();
    await page.locator("#cm-dialog[open] .cm-wizard-paths").waitFor();
    const fit = await page.evaluate(() => {const d = document.getElementById("cm-dialog").getBoundingClientRect(), x = document.querySelector("#cm-dialog .cm-dialog-close").getBoundingClientRect(), p = document.querySelector("#cm-dialog .cm-wizard-paths").getBoundingClientRect();
      return {width: Math.round(d.width), closeRight: Math.round(x.right), pathsRight: Math.round(p.right), left: Math.round(p.left - d.left), right: Math.round(d.right - p.right)};});
    ok(fit.width <= 560 && Math.abs(fit.closeRight - fit.pathsRight) <= 2 && Math.abs(fit.left - fit.right) <= 2, `the New deck dialog is ${fit.width}px, as wide as its choices: the close button's right edge is the choices' (${fit.closeRight} vs ${fit.pathsRight}) and the gutters match (${fit.left} left, ${fit.right} right)`);
    await shot(page, "new-deck-1280");
    await context.close();
  } finally {
    await close();
  }
}
console.log(`import-flow: ${checks} checks passed — names resolve from the catalog and 75 at a time, a refusal waits as long as Scryfall says, New group name only for a new group, every unresolved row shown and filterable, closing asks first, Revise keeps the list, the New deck dialog fits its choices, Upload cards in the Library, Menu under Play.`);
