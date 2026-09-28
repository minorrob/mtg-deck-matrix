/* GROUPS HAVE TEMPLATES (Rob, 2026-09-28; docs/plan-groups.md, G3). A copy sits in one physical place -- the Bench,
 * a deck's box, a To sell / trade pile -- and in any number of General groups, which are lists kept by hand.
 *
 *   Migration  Rob's library, a schema-3 backup, restores through the app as schema 4: the Bench, To Trade, To Buy
 *              and his seven decks' groups get their templates, and the empty Main Deck is gone
 *   Labels     the Library's group picker names a place's template beside its name ("To Trade · To sell / trade")
 *   New group  asks for a template, General by default; no second Bench is offered; Commander deck opens New deck
 *   Manage     a group's template can change there; the Bench says it stays, and has no Delete
 *   Decks      a deck is never offered the Bench or a To sell / trade pile as its box
 *   Model      the model's own rules are in tests/collection-model.mjs (templates, the one Bench, the 3 → 4 migration)
 *
 * Needs Playwright (GEOMETRY_REQUIRED=1 makes its absence a failure).
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
const templates = (page) => page.evaluate(() => Object.fromEntries(globalThis.__cm.state.groups.map((g) => [g.name, g.template])));

const {browser, base, stub, close} = await openBrowser({name: "group-templates", flag: "GEOMETRY_REQUIRED"});
try {
  const context = await browser.newContext({viewport: {width: 1280, height: 900}, serviceWorkers: "block"});
  const page = await context.newPage();
  if (stub) await stub(page);
  await page.addInitScript(() => (globalThis.CrankFeatures ||= []).push((C) => {globalThis.__cm = C;}));

  /* MIGRATION: Rob's schema-3 backup restores as schema 4 */
  await loadLiveState(page, base);
  const restored = await page.evaluate(() => {const s = globalThis.__cm.state; return {schema: s.schemaVersion, decks: s.decks.filter((d) => d.groupId).map((d) => s.groups.find((g) => g.id === d.groupId).template)};});
  eq(restored.schema, 4, "the restored library is schema 4");
  const t = await templates(page);
  eq([t.Bench, t["To Trade"], t["To Buy"], "Main Deck" in t], ["bench", "trade", "general", false], "the Bench, To Trade and To Buy get their templates, and the empty Main Deck is gone");
  ok(restored.decks.length === 7 && restored.decks.every((x) => x === "commander"), `each of the 7 decks' groups is a Commander deck group (${restored.decks.join(", ")})`);

  /* LABELS: the Library's group picker */
  await page.goto(`${base}/index.html#cards`);
  await page.locator("[name=groupPick]").waitFor({timeout: 60000});
  const picks = await page.locator("[name=groupPick] option").allInnerTexts();
  ok(picks.includes("Bench") && picks.includes("To Trade · To sell / trade") && picks.includes("To Buy"), `the picker names the places' templates and leaves the Bench and General lists plain (${picks.slice(0, 5).join(" | ")})`);
  ok(picks.filter((x) => / · Commander deck$/.test(x)).length === 7, "each deck's group reads as a Commander deck");

  /* NEW GROUP: a template, General by default, no second Bench */
  await page.locator("[data-action=new-group]").first().click();
  await page.locator("#cm-dialog[open] h2", {hasText: "New Collection group"}).waitFor();
  const choice = page.locator("#cm-dialog [name=template]");
  eq(await choice.inputValue(), "general", "a new group is General unless you choose otherwise");
  const offered = await choice.locator("option").evaluateAll((os) => os.map((o) => o.value));
  eq(offered, ["general", "trade", "limited", "commander"], "the templates offered: General, To sell / trade, 40-card deck and Commander deck; no second Bench");
  await shot(page, "new-group-template-1280");
  await page.fill("#cm-dialog [name=name]", "Binder 3");
  await choice.selectOption("trade");
  await page.click("#cm-dialog button[type=submit]");
  await page.waitForFunction(() => globalThis.__cm.state.groups.some((g) => g.name === "Binder 3"));
  eq((await templates(page))["Binder 3"], "trade", "Binder 3 is made a To sell / trade group");
  await page.locator("[name=groupPick] option", {hasText: "Binder 3 · To sell / trade"}).waitFor({state: "attached", timeout: 30000});
  checks += 1;

  /* MANAGE: change the template; the Bench stays */
  await page.locator("[data-action=roster-more]").first().click();
  await page.locator("[data-action=manage-group]").click();
  await page.locator("#cm-dialog[open] h2", {hasText: "Manage Binder 3"}).waitFor();
  eq(await page.locator("#cm-dialog [name=template]").inputValue(), "trade", "Manage shows the group's template");
  await page.locator("#cm-dialog [name=template]").selectOption("general");
  await page.click("#cm-dialog button[type=submit]");
  await page.waitForFunction(() => globalThis.__cm.state.groups.find((g) => g.name === "Binder 3").template === "general");
  checks += 1;
  const bench = await page.evaluate(() => globalThis.__cm.state.groups.find((g) => g.template === "bench").id);
  await page.goto(`${base}/index.html#cards?group=${encodeURIComponent(bench)}`);
  await page.locator("[data-action=roster-more]").first().click();
  await page.locator("[data-action=manage-group]").click();
  await page.locator("#cm-dialog[open] h2", {hasText: "Manage Bench"}).waitFor();
  ok(await page.locator("#cm-dialog [name=template]").count() === 0 && /one Bench, and it stays/.test(await page.locator("#cm-dialog").innerText()), "Manage Bench offers no template, and says the Bench stays");
  eq(await page.locator("#cm-dialog [data-action=delete-group]").count(), 0, "and has no Delete group");
  await shot(page, "manage-bench-1280");
  await page.locator("#cm-dialog [data-action=close]").first().click();

  /* NEW GROUP › Commander deck opens New deck */
  await page.locator("[data-action=new-group]").first().click();
  await page.fill("#cm-dialog [name=name]", "Someone");
  await page.locator("#cm-dialog [name=template]").selectOption("commander");
  await page.click("#cm-dialog button[type=submit]");
  await page.locator("#cm-dialog[open] h2", {hasText: "Create a deck from a commander"}).waitFor();
  ok(!(await templates(page)).Someone, "choosing Commander deck makes no group of its own: it opens the deck wizard");

  /* DECKS: the Bench and a To sell / trade pile are never a deck's box */
  await page.selectOption("#cm-dialog [name=how]", "group");
  const boxes = await page.locator("#cm-dialog [name=groupId] option").allInnerTexts();
  ok(!boxes.includes("Bench") && !boxes.includes("To Buy") && !boxes.some((x) => /To sell \/ trade|Commander deck/.test(x)) && boxes.includes("Binder 3"), `the wizard offers only groups a deck may take (${boxes.join(" | ")})`);

  /* DECKS: Change the collection group, on a deck's page, offers the same */
  await page.locator("#cm-dialog [data-action=close]").first().click();
  const deckId = await page.evaluate(() => globalThis.__cm.state.decks.find((d) => d.groupId && !d.archived).id);
  await page.goto(`${base}/index.html#decks?deck=${encodeURIComponent(deckId)}`);
  await page.locator("[data-action=deck-more-menu]").first().click();
  await page.locator("[data-action=attach-group]").first().click();
  await page.locator("#cm-dialog[open] h2", {hasText: "Change the collection group"}).waitFor();
  const moves = await page.locator("#cm-dialog [name=groupId] option").allInnerTexts();
  eq(moves, ["Binder 3"], "Change the collection group offers only the General groups: not the Bench, To Trade, To Buy or another deck's box");
  await shot(page, "change-deck-group-1280");
  await context.close();
} finally {
  await close();
}
console.log(`group-templates: ${checks} checks passed — Rob's library restores as schema 4 with every group's template, New group and Manage choose it, and the Bench stays the Bench.`);
