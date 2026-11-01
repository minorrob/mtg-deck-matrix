/* r3's SETTINGS AND THE MENU IT SLIMMED (R3.3a; wireframe 70-settings, INTAKE §4.7).
 *
 * In a real page with the committed library restored:
 *
 *   1. The Menu holds what §4.7 lists (the theme, Settings, backup and restore, help, the tour,
 *      feedback, sharing) and none of what moved: Excel, the emailed export, history and Undo,
 *      Confirmations, Clear all data, the card data ages. Reset comparison picks is gone.
 *   2. Menu → Settings opens #settings, with the design's sections, Play and AI Coach (AI-6): Account, Appearance, Play, Prices,
 *      Budget (Rob, 2026-10-18), AI Coach, Data, About. Every entry that left the Menu is there, and Publish your To Trade list is in the
 *      Library's More menu.
 *   3. The theme can be chosen here too, and both places show the same choice.
 *   4. Reduce motion is saved: it stills transitions and the rail's animation, survives a reload, and
 *      turns off again. So is Play's Stop at every step of my turn (Rob, 2026-10-11), with the preferences the board
 *      tells the room (tests/table-board.mjs).
 *   5. Budgets (Rob, 2026-10-18): a deck with no budget of its own has none; the account's budget is set here,
 *      set against what the decks plan, and said again under the Decks page's tiles; empty is none.
 *   6. About names the card data's ages, and on a phone the cards stack in one column.
 *
 * Needs Playwright and Chromium; GEOMETRY_REQUIRED=1 (CI) turns a missing browser into a failure.
 */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import path from "node:path";
import {openBrowser, loadLiveState, ROOT} from "./uat/browser-runner.mjs";

let checks = 0;
const ok = (cond, msg) => { checks++; assert.ok(cond, msg); };
const eq = (a, b, msg) => { checks++; assert.deepEqual(a, b, msg); };

const {browser, base, stub, close} = await openBrowser({name: "settings-r3", flag: "GEOMETRY_REQUIRED"});
const openMenu = async (page) => { await page.getByRole("button", {name: "Menu", exact: true}).click(); await page.locator("#cm-user-menu:popover-open").waitFor(); };
const toSettings = async (page) => { await page.evaluate(() => {location.hash = "#settings";}); await page.locator(".cm-settings").waitFor({timeout: 30000}); };
const entries = (page) => page.$$eval("#cm-user-menu button, #cm-user-menu a", (els) => els.map((el) => el.textContent.replace(/^[^\p{L}]+/u, "").trim()));

try {
  const context = await browser.newContext({viewport: {width: 1400, height: 900}, serviceWorkers: "block"});
  const page = await context.newPage();
  if (stub) await stub(page);
  await loadLiveState(page, base);

  /* 1. The Menu, slimmed. */
  await openMenu(page);
  /* Rob, 2026-09-29: Switch theme under Help, a glossary switch in Help, no Share CrankMagic by email (tests/menu-help.mjs).
     Rob, 2026-10-03: Reset All beside the backups (tests/reset-all.mjs). */
  /* Rob, 2026-10-28: the menu holds Your Profile, the skin, and two Help entries; the rest is in Settings. */
  eq(await entries(page), ["Your Profile", "Sapphire & Obsidian", "Bronze & Basalt", "Chalk & Coal", "Dark", "Light", "System",
    "Help & glossary", "Term definitions on hover: Off"], "the Menu holds Your Profile, the skin and the two Help entries");
  for (const moved of ["Share CrankMagic by email", "Export as Excel", "Email the export…", "See every change…", "Undo last change", "Confirmations…", "Clear all data", "Reset comparison picks", "Publish your To Trade list"])
    ok(!(await entries(page)).includes(moved), `${moved} has left the Menu`);
  ok(!(await page.$("#cm-user-menu #cm-data-dates")), "and so have the card data ages");
  await page.keyboard.press("Escape");

  /* 2. Settings, with everything that left the Menu. */
  await toSettings(page);
  ok(page.url().endsWith("#settings"), `Menu → Settings opens #settings (${page.url()})`);
  eq(await page.$$eval(".cm-settings-card h2", (hs) => hs.map((h) => h.textContent)), ["Account", "Profile", "Appearance", "Play", "Prices", "Budget", "AI Coach", "Data", "About"], "Settings has the design's five sections, Play and AI Coach (AI-6)");
  /* AI COACH SETTINGS (AI-6): six controls, their defaults, saved with the preferences; the meter from the door. */
  await page.route(`${base}/api/ai-meter`, (r) => r.fulfill({json: {open: true, spentCents: 0.4, capCents: 25}}));
  const aiPanel = async () => {await page.locator(".cm-settings-card", {has: page.locator("h2", {hasText: "AI Coach"})}).getByRole("button", {name: "AI Coach settings…"}).click(); await page.locator("#cm-ai-settings").waitFor({timeout: 10000});};
  const aiValues = () => page.evaluate(() => {const f = document.getElementById("cm-ai-settings").elements; return {suggestUnowned: f.suggestUnowned.checked, preferOwned: f.preferOwned.checked, inBracket: f.inBracket.checked, length: f.adviceLength.value, coachSees: f.coachSees.value};});
  await aiPanel();
  eq(await aiValues(), {suggestUnowned: false, preferOwned: true, inBracket: true, length: "short", coachSees: "hand"}, "AI Coach settings opens on its defaults: no cards not owned, own first, inside the bracket, short, the Coach sees the hand");
  await page.waitForFunction(() => /0\.4¢ of your 25¢/.test(document.getElementById("cm-ai-meter")?.textContent || ""), null, {timeout: 10000});
  eq(await page.locator("#cm-ai-settings a[href='privacy.html#ai-features']").count(), 1, "with the person's spending against their cap, and the privacy page's AI section");
  await page.locator("#cm-ai-settings [name=suggestUnowned]").check();
  await page.locator("#cm-ai-settings [name=adviceLength]").selectOption("detailed");
  await page.locator("#cm-ai-settings [name=coachSees]").selectOption("board");
  await page.locator("[data-action=ai-settings-save]").click();
  await page.waitForFunction(() => !document.querySelector("#cm-dialog[open]"), null, {timeout: 10000});
  eq(await page.evaluate(async () => {const r = await CrankRepository.open(); try {return (await r.getState()).preferences.aiCoach;} finally {r.close();}}),
    {suggestUnowned: true, preferOwned: true, inBracket: true, length: "detailed", coachSees: "board"}, "Save keeps them with the library's preferences, which sync with the account");
  await aiPanel();
  eq(await aiValues(), {suggestUnowned: true, preferOwned: true, inBracket: true, length: "detailed", coachSees: "board"}, "and the panel opens on them again");
  await page.locator("#cm-dialog [data-action=close]").first().click();
  await page.waitForFunction(() => !document.querySelector("#cm-dialog[open]"), null, {timeout: 10000});
  for (const [section, labels] of [["Data", ["Save a backup file", "Restore from a backup file", "Export as Excel", "Email the export…", "See every change…", "Undo last change", "Clear all data"]], ["Appearance", ["Confirmations…"]]]) {
    const inside = await page.locator(".cm-settings-card", {has: page.locator("h2", {hasText: section})}).locator("button").allTextContents();
    for (const label of labels) ok(inside.includes(label), `Settings › ${section} has ${label}`);
  }
  ok(/Signing in is not offered on this copy/.test(await page.locator("#cm-settings-account").innerText()), "without accounts, Account says so rather than offering a sign-in that cannot work");
  eq(await page.locator(".cm-settings").getByRole("button", {name: "Delete account…"}).count(), 0, "and there is no Delete account to offer");
  await page.goto(`${base}/index.html#cards`);
  await page.locator("[data-action=band-more]").click();
  ok(await page.getByRole("button", {name: "Publish your To Trade list"}).isVisible(), "Publish your To Trade list is in the Library's More menu");
  await page.keyboard.press("Escape");

  await toSettings(page);
  await page.getByRole('button', {name:'Clear all data', exact:true}).click();
  ok(await page.locator('#cm-dialog form.cm-destructive').count() === 1, 'Clear all data has the same danger-fill confirmation as deletion');
  ok(await page.getByLabel('Type CLEAR to confirm').count() === 1, 'clearing still requires typed confirmation');
  await page.locator('#cm-dialog [data-action=close]').first().click();
  await page.getByRole('button', {name:'Confirmations…', exact:true}).click();
  eq(await page.locator('.cm-confirmation-rules dt').count(), 4, 'the confirmation classes explain the available way back without fake switches');
  await page.locator('#cm-dialog [data-action=close]').first().click();
  /* 3. The theme, from Settings. */
  await toSettings(page);
  /* A1: four swatch cards, each drawn in its own theme's colors and face. */
  /* PLAY › OVERLAY (2026-10-12): the callouts' loudness is a slider, 60% until moved, saved with the Play preferences. */
  const overlay = page.locator(".cm-settings [data-settings-overlay]");
  eq([await overlay.getAttribute("type"), await overlay.inputValue(), (await page.locator(".cm-settings-slider:has([data-settings-overlay]) output").innerText()).trim()], ["range", "60", "60%"], "Play has the Overlay slider, at 60% until moved");
  await overlay.fill("0");
  await page.waitForFunction(() => document.querySelector(".cm-settings [data-settings-overlay]").getAttribute("aria-valuetext") === "off");
  await page.waitForTimeout(400);
  await page.locator(".cm-sidebar a[data-nav=decks]").click();
  await toSettings(page);
  eq(await page.locator(".cm-settings [data-settings-overlay]").inputValue(), "0", "moved to the left it is off, and saved: Settings opened again shows it off");
  await page.locator(".cm-settings [data-settings-overlay]").fill("60");
  await page.waitForTimeout(400);
  eq(await page.$$eval(".cm-settings .cm-theme-card", (bs) => bs.map((b) => b.getAttribute("aria-label"))), ["Sapphire & Obsidian", "Sapphire & Obsidian, light", "Bronze & Basalt", "Bronze & Basalt, light", "Chalk & Coal", "Chalk & Coal, light"], "Settings shows all six skin/register combinations as swatch cards");
  const swatchBg = await page.$$eval(".cm-settings .cm-theme-swatch", (ss) => ss.map((x) => getComputedStyle(x).backgroundColor));
  eq(new Set(swatchBg).size, 6, `each swatch is drawn in its own theme's ground (${swatchBg.join(", ")})`);
  eq(await page.$eval(".cm-settings .cm-theme-card[data-theme-choice='sapphire-obsidian'] strong", (el) => [getComputedStyle(el).fontFamily.includes("Lato"), getComputedStyle(el).textTransform]), [true, "none"], "skin names use the shared Lato component type");
  await page.locator(".cm-settings").getByRole("button", {name: "Sapphire & Obsidian, light", exact: true}).click();
  await page.waitForFunction(() => document.getElementById("matrix-v2").dataset.theme === "light");
  eq(await page.$$eval("[data-theme-choice][aria-pressed=true]", (bs) => bs.map((b) => b.dataset.themeChoice)), ["sapphire-obsidian-light"], "Settings marks the chosen skin/register combination");
  eq(await page.locator('[data-theme-mode="light"]').getAttribute("aria-pressed"), "true", "the menu register agrees with Settings");
  await page.locator(".cm-settings").getByRole("button", {name: "Sapphire & Obsidian", exact: true}).click();
  await page.waitForFunction(() => document.getElementById("matrix-v2").dataset.theme === "dark");

  /* 4. Reduce motion. */
  eq(await page.getByRole("switch", {name: "Reduce motion: Off", exact: true}).count(), 1, "the motion switch says its state in words");
  const motion = () => page.evaluate(() => ({attr: document.documentElement.dataset.motion || null, reduced: globalThis.CrankMotion.reduced(),
    pressed: document.querySelector('[data-action="set-motion"]').getAttribute("aria-checked"), aether: document.querySelector(".v-aether")?.dataset.motion,
    transition: document.querySelector("[data-motion-probe]") ? getComputedStyle(document.querySelector("[data-motion-probe]")).transitionDuration : "no probe after a reload"}));
  /* The probe is an element that really transitions before the switch; one that never did would read
     0s either way and prove nothing. */
  ok(await page.evaluate(() => { const el = [...document.querySelectorAll("#matrix-v2 *")].find((n) => getComputedStyle(n).transitionDuration.split(",").some((d) => parseFloat(d) > 0)); if (el) el.dataset.motionProbe = ""; return Boolean(el); }), "the page has an element that transitions, to measure");
  const before = await motion();
  ok(before.attr === null && !before.reduced && before.pressed === "false" && before.aether === "running" && before.transition.split(",").some((d) => parseFloat(d) > 0), `motion is on by default: ${JSON.stringify(before)}`);
  await page.getByRole("switch", {name: /Reduce motion/}).click();
  await page.waitForFunction(() => document.documentElement.dataset.motion === "reduce");
  const still = await motion();
  ok(still.reduced && still.pressed === "true" && still.aether === "still" && still.transition.split(",").every((d) => parseFloat(d) === 0),
    `Reduce motion stills the transitions and the rail's animation: ${JSON.stringify(still)}`);
  await page.reload();
  await page.locator(".cm-settings").waitFor({timeout: 60000});
  await page.waitForFunction(() => document.documentElement.dataset.motion === "reduce", null, {timeout: 15000});
  ok((await motion()).pressed === "true", "it is saved: after a reload the page is still and the switch still pressed");
  await page.getByRole("switch", {name: /Reduce motion/}).click();
  await page.waitForFunction(() => !document.documentElement.dataset.motion);
  ok((await motion()).aether === "running", "and turning it off sets the rail moving again");
  /* Play's Stop at every step of my turn: off by default, saved with the preferences, kept through a reload. */
  const steps = () => page.evaluate(async () => ({pressed: document.querySelector('[data-action="set-step-by-step"]').getAttribute("aria-checked"),
    saved: await (async () => {const r = await CrankRepository.open(); try {return ((await r.getState()).preferences.play || {}).stepByStep ?? null;} finally {r.close();}})()}));
  eq(await steps(), {pressed: "false", saved: null}, "Stop at every step of my turn is off by default");
  ok(/never ends by itself/.test(await page.locator(".cm-settings-card", {hasText: "Stop at every step"}).innerText()), "and Play says your turn never ends by itself, either way");
  await page.getByRole("switch", {name: /Stop at every step of my turn/}).click();
  await page.waitForFunction(() => document.querySelector('[data-action="set-step-by-step"]')?.getAttribute("aria-checked") === "true");
  eq(await steps(), {pressed: "true", saved: true}, "pressed, it is saved with the preferences (play.stepByStep), which the board tells the room");
  await page.reload();
  await page.locator(".cm-settings").waitFor({timeout: 60000});
  eq(await steps(), {pressed: "true", saved: true}, "and kept through a reload");
  await page.getByRole("switch", {name: /Stop at every step of my turn/}).click();
  await page.waitForFunction(() => document.querySelector('[data-action="set-step-by-step"]')?.getAttribute("aria-checked") === "false");
  eq(await steps(), {pressed: "false", saved: false}, "and off again");

  /* 5. Budgets (Rob, 2026-10-18; docs/budgets.md). A deck's budget is its own and inherits nothing; the account's is
     set here and set against what the decks plan to spend, and the Decks page under its tiles says the same. */
  const deck = "deck:live:D6";
  const budgetOnDeck = async () => {await page.goto(`${base}/index.html#decks?deck=${encodeURIComponent(deck)}`); await page.locator(".cm-bento").waitFor({timeout: 30000}); return (await page.locator("#cm-main .cm-bento-cost").innerText()).match(/No budget|Budget \$[\d,.]+/)?.[0];};
  eq(await budgetOnDeck(), "No budget", "a deck with no budget of its own has none: it takes neither the account's nor the pod's");
  const model = () => page.evaluate(async () => { const r = await CrankRepository.open(); try { const a = CrankCollection.budgets(await r.getState()); return {budget: a.budget, planned: a.planned, left: a.left, decks: a.decks.length}; } finally { r.close(); } });
  const money = (n) => "$" + n.toLocaleString("en-US", {minimumFractionDigits: 2, maximumFractionDigits: 2});
  await page.goto(`${base}/index.html#settings`);
  await page.locator(".cm-settings").waitFor();
  const atFirst = await model();
  ok(atFirst.budget === null && atFirst.planned > 0, `no account budget yet, and the decks plan ${money(atFirst.planned)}`);
  const card5 = () => page.locator(".cm-settings-card", {has: page.locator("h2", {hasText: "Budget"})}).innerText();
  ok((await card5()).includes(`Your decks plan ${money(atFirst.planned)} together`), "the Budget card says what the decks plan");
  eq(await page.locator(".cm-settings-budgets tbody tr").count(), atFirst.decks, "and lists every live deck, with its budget, cost and what it counts at");
  await page.getByLabel("Account budget ($)").fill("1000");
  await page.getByLabel("Account budget ($)").press("Enter");
  await page.waitForFunction(() => /Account budget \$1,000/.test(document.getElementById("cm-notice").textContent));
  const after = await model();
  eq([after.budget, after.left], [1000, Math.round((1000 - atFirst.planned) * 100) / 100], "Enter saves the account budget, and the model sets it against the decks");
  ok((await card5()).includes(`${money(Math.abs(after.left))} ${after.left < 0 ? "over" : "left"}`), "and Settings says what is left of it");
  eq(await budgetOnDeck(), "No budget", "the deck still has no budget: the account's is never inherited");
  await page.goto(`${base}/index.html#decks`);
  await page.locator(".cm-deck-grid").waitFor({timeout: 30000});
  const line = await page.locator(".cm-decks-budget").innerText();
  ok(line.includes(`of your $${(1000).toFixed(2)} account budget`) && line.includes(`$${atFirst.planned.toFixed(2)}`), `the Decks page says the same under its tiles: ${line}`);
  await page.goto(`${base}/index.html#settings`);
  await page.locator(".cm-settings").waitFor();
  await page.getByLabel("Account budget ($)").fill("-5");
  ok(!(await page.getByLabel("Account budget ($)").evaluate((i) => i.validity.valid)), "the browser itself flags a budget below one dollar");
  await page.getByRole("button", {name: "Save budget"}).click();
  await page.waitForFunction(() => document.getElementById("cm-notice").classList.contains("error"));
  ok(/above zero/.test(await page.locator("#cm-notice").innerText()), "and the button refuses it too, with a reason");
  await page.getByLabel("Account budget ($)").fill("");
  await page.getByRole("button", {name: "Save budget"}).click();
  await page.waitForFunction(() => /No account budget now/.test(document.getElementById("cm-notice").textContent));
  eq((await model()).budget, null, "an empty box is no account budget");

  /* 6. About, and a phone. */
  await page.goto(`${base}/index.html#settings`);
  await page.locator(".cm-settings #cm-data-dates p").first().waitFor();
  const about = await page.locator(".cm-settings-card", {has: page.locator("h2", {hasText: "About"})}).innerText();
  ok(/Card catalog/.test(about) && /Prices/.test(about) && /Library revision \d+/.test(about), `About names the card data's ages and the library's revision: ${about.replace(/\s+/g, " ").slice(0, 160)}`);
  await context.close();

  /* Signed in: Settings › Account says who, offers Sync now, and Sign out beside it. The page is served
     from disk with accounts on, and the account API answered here, as in tests/shell-r3.mjs. */
  const signed = await browser.newContext({viewport: {width: 1400, height: 900}, serviceWorkers: "block"});
  const p = await signed.newPage();
  if (stub) await stub(p);
  const html = readFileSync(path.join(ROOT, "index.html"), "utf8").replace("</head>", '<meta name="crankmagic-accounts" content="on"></head>');
  await p.route(`${base}/index.html*`, (route) => route.fulfill({contentType: "text/html; charset=utf-8", body: html}));
  await p.route(`${base}/api/me`, (route) => route.fulfill({json: {email: "reader@example.test"}}));
  await p.route(`${base}/api/library`, (route) => route.fulfill({json: {head: null}}));
  await p.goto(`${base}/index.html#settings`);
  await p.waitForFunction(() => /Signed in as reader@example\.test/.test(document.getElementById("cm-settings-account")?.textContent || ""), null, {timeout: 30000});
  eq(await p.locator("#cm-settings-account").getByRole("button").allTextContents(), ["Sync now", "Sign out"], "signed in, Settings › Account says who, with Sync now and Sign out");

  /* R3.3b: Delete account, in the danger zone, only when signed in. */
  let sent = null, signedOut = false;
  await p.route(`${base}/api/account`, (route) => { sent = {method: route.request().method(), body: route.request().postDataJSON(), header: route.request().headers()["x-crankmagic"]}; return route.fulfill({json: {deleted: {email: "reader@example.test", versions: 3}}}); });
  await p.route(`${base}/cdn-cgi/access/logout`, (route) => { signedOut = true; return route.fulfill({contentType: "text/html", body: "<p>signed out</p>"}); });
  /* Opened after the account is already known (the everyday path), not only while it is being checked. */
  await p.evaluate(() => { location.hash = "#decks"; });
  await p.locator(".cm-settings").waitFor({state: "detached"});
  await p.evaluate(() => { location.hash = "#settings"; });
  await p.locator(".cm-settings").waitFor();
  const dangerZone = p.locator(".cm-settings-danger");
  ok(await dangerZone.getByRole("button", {name: "Delete account…"}).isVisible(), "signed in, the danger zone offers Delete account… when Settings is opened later too");
  await dangerZone.getByRole("button", {name: "Delete account…"}).click();
  const confirm = p.getByLabel("Type your address to confirm");
  await confirm.waitFor();
  ok(/every earlier one/.test(await p.locator("#cm-dialog").innerText()) && /stays/.test(await p.locator("#cm-dialog").innerText()), "the dialog says what goes (every version) and what stays (this device's library)");
  ok(await p.evaluate(() => { const b = document.querySelector("#cm-dialog form.cm-destructive [type=submit]"); if (!b) return false; const probe = document.createElement("span"); probe.style.color = "var(--st-remove)"; document.getElementById("matrix-v2").append(probe); const want = getComputedStyle(probe).color; probe.remove(); return getComputedStyle(b).backgroundColor === want; }), "and its Delete account button is red, as a delete should be");
  await confirm.fill("someone@else.test");
  await p.locator("#cm-dialog [type=submit]").click();
  await p.locator("#cm-dialog .cm-error:not([hidden])").waitFor();
  ok(/Type the address exactly/.test(await p.locator("#cm-dialog .cm-error").innerText()) && sent === null, "another address is refused in the page, and nothing is sent");
  await confirm.fill("Reader@Example.test");
  await p.locator("#cm-dialog [type=submit]").click();
  await p.waitForFunction(() => /Deleted your account and 3 saved versions/.test(document.getElementById("cm-notice").textContent));
  eq(sent, {method: "DELETE", body: {confirm: "Reader@Example.test"}, header: "sync"}, "the address, typed in any case, is sent to DELETE /api/account from the app");
  await p.waitForURL(/cdn-cgi\/access\/logout/, {timeout: 10000});
  ok(signedOut, "and the page signs out, so nothing uploads the library straight back");
  await signed.close();

  /* THE UNITED STATES, ALWAYS: a reader whose browser is set to German still reads US numbers and US dates. */
  const german = await browser.newContext({viewport: {width: 1400, height: 900}, locale: "de-DE", serviceWorkers: "block"});
  const g = await german.newPage();
  if (stub) await stub(g);
  await loadLiveState(g, base);
  ok(await g.evaluate(() => (1400).toLocaleString() === "1.400"), "the browser really is German: its own locale writes 1,400 as 1.400");
  await g.goto(`${base}/index.html#cards`);
  await g.locator("#cm-roster-table").waitFor({timeout: 60000});
  await g.locator("[data-action=group-menu]").click();
  const summary = (await g.locator(".cm-band").innerText()) + " " + (await g.locator(".cm-row-menu").innerText());
  ok(/1,158/.test(summary) && /All 1,718/.test(summary.replace(/\s+/g, " ")) && !/1\.158|1\.718/.test(summary), `the Library still says 1,158 records and 1,718 copies, the US way: ${summary.replace(/\s+/g, " ").slice(0, 80)}`);
  await g.keyboard.press("Escape");
  await g.goto(`${base}/index.html#settings`);
  await g.locator(".cm-settings").getByRole("button", {name: "See every change…"}).click();
  await g.locator("#cm-history-rows article").first().waitFor();
  const stamp = (await g.locator("#cm-history-rows article .cm-muted").first().innerText()).split(" · ")[0];
  ok(/^[A-Z][a-z]{2} \d{1,2}, \d{4}, \d{1,2}:\d{2}\s?[AP]M$/.test(stamp), `History dates a change the US way, not as ISO or German: "${stamp}"`);
  await german.close();

  const phone = await browser.newContext({viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true, serviceWorkers: "block"});
  const small = await phone.newPage();
  if (stub) await stub(small);
  await small.goto(`${base}/index.html#settings`);
  await small.locator(".cm-settings-card").first().waitFor({timeout: 60000});
  const boxes = await small.$$eval(".cm-settings-card", (cs) => cs.map((c) => c.getBoundingClientRect()).map((r) => ({x: Math.round(r.x), w: Math.round(r.width), right: Math.round(r.right)})));
  ok(boxes.every((b) => b.x === boxes[0].x && b.right <= 390), `on a phone the sections stack in one column inside the screen: ${JSON.stringify(boxes)}`);
  ok(await small.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "with no sideways scroll");
  await phone.close();
} finally {
  await close();
}
console.log(`settings-r3: ${checks} checks passed — the Menu slimmed to INTAKE §4.7, Settings holds the rest in five sections, Play and AI Coach, Reduce motion (which stills the page) and Stop at every step are saved, and the account's budget is set against the decks' while no deck inherits it.`);
