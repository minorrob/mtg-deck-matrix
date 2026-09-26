/* BUILD A DECK: Commander → Strategy → Budget → Review (R3.11; INTAKE row R3.11, the design's "Lab strategy").
 *
 * In Node, over the committed data: CrankStrategies.optionsFor ranks what each commander offers -- the rules text, then
 * how decks and guides name it, both agreeing first, ties to the most distinctive; colors only when a commander has no entry -- with the top fit
 * first and the others "strong" or "good". In a real page:
 *
 *   1. New deck's Create, the Decks page's Start from a commander and the landing page's Step one all open the wizard.
 *   2. Strategy: a skeleton while the file loads, then the chips Node computed for that commander, in order, with their
 *      fit labels, the top fit preselected; another commander recomputes them; a commander with no entry is read by
 *      its colors.
 *   3. Budget starts at the house cap and refuses a cap that is not a dollar amount.
 *   4. Review shows what was chosen; Create draft makes the deck with its definition (strategies, cap, what to include
 *      or avoid); Draft the 99 hands it all to the Lab, which drafts a preview seeded from those strategies.
 *
 * Needs Playwright and Chromium; GEOMETRY_REQUIRED=1 (CI) turns a missing browser into a failure.
 */
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {openBrowser} from "./uat/browser-runner.mjs";

const require = createRequire(import.meta.url);
const S = require("../crankmagic-strategies.js"), data = require("../data/commander-strategies.json"), universe = require("../data/commander-universe.json");
let checks = 0;
const ok = (c, msg) => { checks++; assert.ok(c, msg); };
const eq = (a, b, msg) => { checks++; assert.deepEqual(a, b, msg); };
const entry = (name) => data.commanders.find((c) => c.name === name) || null;
const counts = data.perStrategy, optionsOf = (name) => S.optionsFor({entry: entry(name), counts});

/* In Node: the ranking itself. */
{
  const krenko = optionsOf("Krenko, Mob Boss");
  eq(krenko[0].fit, "top fit", "the first option is the top fit");
  ok(krenko.slice(1).every((o) => o.fit === "strong" || o.fit === "good"), "the rest are strong or good");
  const both = krenko.filter((o) => /and the decks/.test(o.source)), rules = krenko.filter((o) => o.source === "rules text"), named = krenko.filter((o) => o.source === "the decks and guides");
  ok(krenko.indexOf(both.at(-1)) < krenko.indexOf(rules[0]) && krenko.indexOf(rules.at(-1)) < krenko.indexOf(named[0]), "what the rules text and the decks agree on comes first, then the rules text alone, then the decks alone");
  ok(rules.every((o) => o.fit === "strong") && named.every((o) => o.fit === "good"), "the rules text's are strong, the decks' alone good");
  eq(krenko[0].label, "Tribal payoff", "a tie goes to the more distinctive strategy: of the three Krenko's rules text and decks agree on, Tribal payoff is his");
  const tied = krenko.filter((o) => o.source === krenko[0].source).map((o) => counts[o.id]);
  ok(tied.every((n, i) => !i || tied[i - 1] <= n), "the tied ones in order of how few commanders share them");
  const everyone = data.commanders.map((c) => S.optionsFor({entry: c, counts}));
  ok(everyone.every((o) => o.length >= 1 && o[0].fit === "top fit"), `every one of the ${data.commanders.length} commanders in the file gets at least one option, the first a top fit`);
  eq(S.optionsFor({entry: null, colorIdentity: ["R"]}).map((o) => o.id), S.BY_COLOR.R, "a commander with no entry is read by its colors");
  eq(S.optionsFor({entry: null, colorIdentity: []}).map((o) => o.id), S.BY_COLOR.C, "and a colorless one by the colorless archetypes");
}

const fields = universe.fields, NAME = fields.indexOf("name"), CMD = fields.indexOf("commander"), CI = fields.indexOf("ci"), RANK = fields.indexOf("rank");
const have = new Set(data.commanders.map((c) => c.name));
const unread = universe.cards.filter((c) => c[CMD] && !have.has(c[NAME]) && !c[NAME].includes("//")).sort((a, b) => (a[RANK] || 1e9) - (b[RANK] || 1e9))[0];

const {browser, base, stub, close} = await openBrowser({name: "build-wizard", flag: "GEOMETRY_REQUIRED"});
const title = (page) => page.locator("#cm-dialog[open] h2").first().innerText();
const chips = (page) => page.$$eval("#cm-build-chips .cm-build-chip:not(.is-loading)", (bs) => bs.map((b) => [b.querySelector("span").textContent, b.querySelector("small").textContent, b.getAttribute("aria-pressed")]));
const pickCommander = async (page, name) => {
  await page.locator("#cm-card-query").fill(name);
  await page.locator("#cm-dialog [data-pick-card]").filter({has: page.getByText(name, {exact: true})}).first().click();
};
const stateOf = (page) => page.evaluate(async () => { const r = await CrankRepository.open(); try { return await r.getState(); } finally { r.close(); } });

try {
  const context = await browser.newContext({viewport: {width: 1400, height: 900}, serviceWorkers: "block"});
  const page = await context.newPage();
  if (stub) await stub(page);
  /* Hold the strategy file back a moment, so the skeleton has time to be seen. */
  let hold = true;
  await page.route(`${base}/data/commander-strategies.json*`, async (route) => { if (hold) await new Promise((r) => setTimeout(r, 1200)); return route.continue(); });

  /* 1. The landing page's Step one opens the wizard with the name already searched. */
  await page.goto(`${base}/index.html`);
  await page.locator("#cm-landing-query").waitFor({timeout: 60000});
  await page.locator("#cm-landing-query").fill("Krenko, Mob Boss");
  await page.locator("#cm-landing-start [type=submit]").click();
  await page.locator("#cm-dialog[open] #cm-card-query").waitFor({timeout: 30000});
  eq(await title(page), "Build a deck · Commander", "Step one opens Build a deck at its first step, Commander");
  eq(await page.inputValue("#cm-card-query"), "Krenko, Mob Boss", "with the name already searched");

  /* 2. Strategy: skeleton, then the chips Node computed, top fit preselected. */
  await page.locator("#cm-dialog [data-pick-card]").filter({has: page.getByText("Krenko, Mob Boss", {exact: true})}).first().click();
  await page.locator("#cm-build-chips").waitFor({timeout: 30000});
  eq([await page.getAttribute("#cm-build-chips", "aria-busy"), await page.locator("#cm-build-chips .cm-build-chip.is-loading").count() > 0], ["true", true], "while the strategies load, a skeleton holds their place");
  eq(await page.$eval(".cm-build-steps [aria-current=step]", (li) => li.textContent), "2 · Strategy", "the step row says where the reader is");
  await page.locator("#cm-build-chips[aria-busy=false]").waitFor({timeout: 30000});
  const want = optionsOf("Krenko, Mob Boss");
  eq(await chips(page), want.map((o, i) => [o.label, o.fit, String(i === 0)]), "then the options read off Krenko, in order, with their fit labels, the top fit preselected");
  await page.locator(`#cm-build-chips [data-strategy="${want[2].id}"]`).click();
  await page.locator("#cm-dialog textarea[name=restrictions]").fill("No infinite combos");

  /* Another commander recomputes them. */
  await page.locator("#cm-dialog [data-action=build-step][data-to=commander]").click();
  hold = false;
  await pickCommander(page, "Atraxa, Praetors' Voice");
  await page.locator("#cm-build-chips[aria-busy=false]").waitFor({timeout: 30000});
  eq((await chips(page)).map(([l]) => l), optionsOf("Atraxa, Praetors' Voice").map((o) => o.label), "another commander recomputes the options");
  /* A commander with no entry: its colors. */
  await page.locator("#cm-dialog [data-action=build-step][data-to=commander]").click();
  await pickCommander(page, unread[NAME]);
  await page.locator("#cm-build-chips[aria-busy=false]").waitFor({timeout: 30000});
  eq((await chips(page)).map(([l, fit]) => [l, fit]), S.optionsFor({entry: null, colorIdentity: String(unread[CI]).split("").filter(Boolean)}).map((o) => [o.label, o.fit]), `${unread[NAME]}, which the file does not read, is read by its colors`);
  /* Back to Krenko, and on. */
  await page.locator("#cm-dialog [data-action=build-step][data-to=commander]").click();
  await pickCommander(page, "Krenko, Mob Boss");
  await page.locator("#cm-build-chips[aria-busy=false]").waitFor({timeout: 30000});
  await page.locator(`#cm-build-chips [data-strategy="${want[2].id}"]`).click();
  eq((await chips(page)).filter(([, , p]) => p === "true").map(([l]) => l), [want[0].label, want[2].label], "picking a second strategy keeps the first");
  await page.locator("#cm-dialog textarea[name=restrictions]").fill("No infinite combos");
  await page.locator("#cm-dialog [data-action=build-step][data-to=budget]").click();

  /* 3. Budget. */
  eq(await page.inputValue("#cm-dialog input[name=budget]"), "225", "the cap starts at the house rule's $225");
  await page.locator("#cm-dialog input[name=budget]").fill("-5");
  await page.locator("#cm-dialog [data-action=build-step][data-to=review]").click();
  ok(/dollar amount/.test(await page.locator("#cm-notice").innerText()), "a cap that is not a dollar amount is refused, and says so");
  await page.locator("#cm-dialog input[name=budget]").fill("180");
  await page.locator("#cm-dialog [data-action=build-step][data-to=review]").click();

  /* 4. Review, and Create draft. */
  const review = await page.locator(".cm-build-review").innerText();
  ok(/Krenko, Mob Boss/.test(review) && review.includes(want[0].label) && review.includes(want[2].label) && /\$180/.test(review) && /No infinite combos/.test(review), `Review shows the commander, the strategies, the cap and what to avoid:\n${review}`);
  eq(await page.inputValue("#cm-dialog input[name=name]"), "Krenko, Mob Boss deck", "and names the deck for its commander, to change");
  await page.locator("#cm-dialog input[name=name]").fill("Wizard Goblins");
  await page.locator("#cm-dialog [data-action=build-create]").click();
  await page.waitForFunction(() => /deck=/.test(location.hash), null, {timeout: 30000});
  const made = (await stateOf(page)).decks.find((d) => d.name === "Wizard Goblins");
  ok(made, "Create draft makes the deck");
  eq([made.status, made.slots.length, made.definition.strategies, made.definition.budget, made.definition.restrictions], ["draft", 1, [want[0].id, want[2].id], 180, "No infinite combos"], "a draft with just its commander, carrying the strategies, the cap and what to avoid");

  /* 1 and 4. New deck's Create, then Draft the 99 in the Lab. */
  await page.goto(`${base}/index.html#decks`);
  await page.locator(".cm-page-head [data-action=new-deck]").click();
  await page.locator("#cm-dialog [data-action=wizard-create]").click();
  eq(await title(page), "Build a deck · Commander", "New deck's Create opens the same wizard");
  await pickCommander(page, "Krenko, Mob Boss");
  await page.locator("#cm-build-chips[aria-busy=false]").waitFor({timeout: 30000});
  await page.locator("#cm-dialog [data-action=build-step][data-to=budget]").click();
  await page.locator("#cm-dialog [data-action=build-step][data-to=review]").click();
  await page.locator("#cm-dialog [data-action=build-lab]").click();
  await page.waitForFunction(() => location.hash.startsWith("#lab"), null, {timeout: 30000});
  await page.locator("#cm-lab-strategies").waitFor({timeout: 60000});
  eq((await page.locator("#cm-lab-strategies .cm-chip").allInnerTexts()), [want[0].label], "the Lab shows the strategy it was handed");
  /* The draft runs by itself: poll the stored state until it holds a preview (up to three minutes). */
  let preview = null;
  for (const until = Date.now() + 180000; Date.now() < until; await page.waitForTimeout(2000)) { const p = (await stateOf(page)).preferences.labPreview; if (p && p.slots && p.slots.length > 50) { preview = p; break; } }
  ok(preview && preview.commanders.includes(made.commanders[0]), `and drafts at once, a preview led by Krenko (${preview ? preview.slots.length : 0} rows); nothing is saved to Decks`);
  eq([preview.definition.strategies, preview.definition.budget], [[want[0].id], 225], "the preview carries the wizard's strategies and cap, which the draft was seeded from");
  eq((await stateOf(page)).decks.filter((d) => /Krenko/.test(d.name) && d.name !== "Wizard Goblins").length, 0, "no deck was made by drafting");
  await context.close();
} finally {
  await close();
}
console.log(`build-wizard: ${checks} checks passed — Commander, Strategy (read off the commander, top fit first), Budget and Review, ending in a draft deck or a Lab draft.`);
