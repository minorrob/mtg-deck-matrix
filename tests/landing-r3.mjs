/* THE LANDING PAGE (R3.8; INTAKE row R3.8, Rob's decisions M1·2 to M1·5) AND THE DECKS PAGE WITH NO DECKS.
 *
 * In a real page:
 *
 *   1. Who sees it. `/` is the landing page, standing alone (no rail), for everyone: with nothing in this browser,
 *      with a library (its header then says Open your decks), and signed in (Rob, 2026-09-29: "when I go to
 *      crankmagic.com that should go to the landing page"). The rail's CrankMagic name and logo go back to it
 *      (#welcome). Any other #route is the app.
 *   2. What it promises. Invite-only: Sign in (only where accounts are on) and "Start without an account",
 *      never "Start free" or "Free account". Play is Coming soon.
 *   3. Where each door goes: Decks, Library, Explore, Play, each to its own page.
 *   4. Step one: a typed name opens the commander picker already searched; a pasted list opens the import with
 *      the list in it; Upload a CSV opens the import; Restore a backup opens Restore; "Start without an account"
 *      puts the cursor in the box.
 *   5. What it loads: never the graph.
 *   6. On a phone: no sideways scroll, and Step one in reach.
 *   7. Decks with no decks: the page is Decks, and "No decks yet" offers a commander, a list and a backup.
 *   8. The account chip (Rob, 2026-09-30): left of the way in, the app's own menu -- "Menu" where accounts are off,
 *      "Sign in" signed out, the person signed in -- opening under the chip, seen with the rail hidden, Account first.
 *   9. The hero art (Rob, 2026-09-30): his picture at twice its drawn width, the Krenko deck box over its foot.
 *
 * Needs Playwright and Chromium; GEOMETRY_REQUIRED=1 (CI) turns a missing browser into a failure.
 */
import assert from "node:assert/strict";
import {readFileSync, mkdirSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {openBrowser, loadLiveState} from "./uat/browser-runner.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let checks = 0;
const ok = (c, msg) => { checks++; assert.ok(c, msg); };
const eq = (a, b, msg) => { checks++; assert.deepEqual(a, b, msg); };

const {browser, base, stub, close} = await openBrowser({name: "landing-r3", flag: "GEOMETRY_REQUIRED"});
const shot = async (page, name) => {if (process.env.UAT_SHOTS) {mkdirSync(process.env.UAT_SHOTS, {recursive: true}); await page.screenshot({path: path.join(process.env.UAT_SHOTS, `${name}.png`)});}};
const fresh = async (viewport = {width: 1400, height: 900}, extra = {}) => {
  const context = await browser.newContext({viewport, serviceWorkers: "block", ...extra});
  const page = await context.newPage();
  if (stub) await stub(page);
  return {context, page};
};
const landing = (page) => page.locator(".cm-landing h1").waitFor({timeout: 60000});
const dialogTitle = async (page) => { await page.locator("#cm-dialog[open]").waitFor({timeout: 30000}); return (await page.locator("#cm-dialog[open] h2").first().textContent()).trim();  /* the words, not their case: a theme may set headings in capitals */ };
const closeDialog = async (page) => { await page.keyboard.press("Escape"); await page.locator("#cm-dialog[open]").waitFor({state: "detached", timeout: 10000}).catch(() => {}); };

try {
  /* 1 and 5. A first visit: the landing page, alone, and no graph fetched. */
  {
    const {context, page} = await fresh();
    const asked = [];
    page.on("request", (r) => asked.push(new URL(r.url()).pathname));
    await page.goto(`${base}/index.html`);
    await landing(page);
    eq((await page.locator(".cm-landing h1").textContent()).trim(), "Build the deck. Own the cards. Bring it to the table.", "a first visit to / opens the landing page (its words; a theme may set them in capitals)");
    eq(await page.locator(".cm-sidebar").isVisible(), false, "and it stands alone: the app's rail is not drawn");
    await page.waitForTimeout(1500);
    const graph = asked.filter((p) => /graph[^/]*\.json$|\/data\/graph/.test(p));
    eq(graph, [], "and nothing on it fetches the graph");

    /* 2. The promises. */
    const text = await page.locator(".cm-landing").innerText();
    ok(!/Start free|Free account/i.test(text), "it never says Start free or Free account: accounts are invite-only (M1·2)");
    ok(/Start without an account/.test(text) && /No account needed/.test(text), "it says Start without an account, and that none is needed");
    eq(await page.locator(".cm-landing [data-action=account-sign-in]").count(), 0, "and where accounts are off, it offers no Sign in");
    /* 8. The chip, where accounts are off: the app's menu, opened from the header with the rail hidden. */
    eq((await page.locator(".cm-landing-chip .cm-landing-chip-name").innerText()).trim(), "Menu", "where accounts are off the header's chip says Menu");
    await page.locator(".cm-landing-chip").click();
    await page.locator("#cm-user-menu:popover-open").waitFor({timeout: 10000});
    const menuAt = await page.evaluate(() => {const m = document.getElementById("cm-user-menu").getBoundingClientRect(), c = document.querySelector(".cm-landing-chip").getBoundingClientRect(); const hit = document.elementFromPoint(m.left + m.width / 2, m.top + 20); return {seen: !!hit && !!hit.closest("#cm-user-menu"), under: m.top >= c.bottom && m.top <= c.bottom + 16 && m.right >= c.left && m.left <= c.right && m.right <= innerWidth};});
    ok(menuAt.seen && menuAt.under, "and it opens the rail's own menu under the chip, seen though the rail is hidden");
    ok(await page.locator("#cm-user-menu [data-action=open-settings]").isVisible(), "the menu with Settings in it");
    await page.keyboard.press("Escape");
    eq(await page.$$eval(".cm-landing-door", (ds) => ds.map((d) => d.querySelector(".cm-landing-door-top").innerText.replace(/\s+/g, " ").trim())),
      ["DECKS", "LIBRARY", "EXPLORE", "PLAY Coming soon"], "four doors, and Play is Coming soon (M1·5)");

    /* 4. Step one. */
    await page.locator("[data-action=landing-start]").first().click();
    ok(await page.$eval("#cm-landing-query", (i) => i === document.activeElement), "Start without an account puts the cursor in Step one's box");
    await page.locator("#cm-landing-query").fill("Krenko, Mob Boss");
    await page.locator("#cm-landing-start [type=submit]").click();
    eq(await dialogTitle(page), "Build a deck · Commander", "a name and Start my deck open Build a deck at its commander step");
    eq(await page.inputValue("#cm-dialog #cm-card-query"), "Krenko, Mob Boss", "with the name already in its search");
    await page.locator("#cm-dialog [data-pick-card]").first().waitFor({timeout: 30000});
    ok(/Krenko, Mob Boss/.test(await page.locator("#cm-dialog #cm-card-results").innerText()), "and already searched");
    await closeDialog(page);

    const list = "1 Krenko, Mob Boss\n1 Goblin Matron\n1 Mountain";
    await page.locator("#cm-landing-query").fill("");
    await page.locator("#cm-landing-query").focus();
    await page.evaluate((t) => { const dt = new DataTransfer(); dt.setData("text", t); document.getElementById("cm-landing-query").dispatchEvent(new ClipboardEvent("paste", {clipboardData: dt, bubbles: true, cancelable: true})); }, list);
    eq(await dialogTitle(page), "Import cards or a deck list", "a pasted list opens the import");
    ok((await page.$$eval("#cm-dialog textarea", (ts) => ts.map((t) => t.value))).some((v) => v.trim() === list), "with the list in it, every line");
    await closeDialog(page);

    await page.locator(".cm-landing [data-action=landing-list]").click();
    eq(await dialogTitle(page), "Import cards or a deck list", "Upload a CSV opens the import, which takes a file");
    ok(await page.locator("#cm-dialog input[type=file]").count() > 0, "and it has a file input");
    await closeDialog(page);
    await page.locator(".cm-landing [data-action=restore]").click();
    eq(await dialogTitle(page), "Restore a full backup", "Restore a backup opens Restore");
    await closeDialog(page);

    /* 3. The doors. */
    /* 9. The hero is Rob's art (2026-09-30): one picture at twice its drawn width, the three commander cards gone, and the
          Krenko deck box over its foot. */
    const art = await page.evaluate(async () => {const img = document.querySelector(".cm-landing-art .cm-landing-hero-art"); if (!img) return null; await img.decode().catch(() => {}); const a = img.getBoundingClientRect(), s = document.querySelector(".cm-landing-sample").getBoundingClientRect();
      return {src: img.getAttribute("src"), natural: img.naturalWidth, drawn: Math.round(a.width), cards: document.querySelectorAll(".cm-landing-art img").length, over: s.right > a.left && s.bottom > a.top && s.top < a.bottom && Number(getComputedStyle(document.querySelector(".cm-landing-sample")).zIndex) > 0, hit: document.elementFromPoint((s.left + s.right) / 2, (s.top + s.bottom) / 2)?.closest(".cm-landing-sample") !== null};});
    ok(art && /landing-cards\.webp/.test(art.src) && art.natural === 1120 && art.drawn * 1.5 <= art.natural && art.cards === 1, `the hero is Rob's art, 1120px drawn at ${art && art.drawn}px, in place of the three cards`);
    ok(art.over && art.hit, "and the Krenko Goblins deck box sits over it, on top");
    await page.evaluate(() => scrollTo(0, 0));
    await shot(page, "landing-art-1400");
    eq(await page.$$eval(".cm-landing-door", (ds) => ds.map((d) => d.getAttribute("href"))), ["#decks", "#cards", "#discover", "#game"], "each door goes to its own page");
    await page.locator(".cm-landing-door[href='#decks']").click();
    await page.getByRole("heading", {name: "Decks", level: 1}).waitFor({timeout: 30000});
    eq(await page.locator(".cm-sidebar").isVisible(), true, "and through a door the app is itself again, rail and all");

    /* 7. Decks with no decks. */
    eq((await page.locator(".cm-decks-empty h2").textContent()).trim(), "No decks yet", "Decks with no decks says so");
    eq(await page.$$eval(".cm-decks-empty .cm-actions [data-action]", (bs) => bs.map((b) => [b.textContent.trim(), b.dataset.action])),
      [["Start from a commander", "wizard-create"], ["Bring a list", "wizard-import"], ["Restore backup…", "restore"]], "and offers a commander, a list or a backup you saved, in that order");
    await page.locator(".cm-decks-empty [data-action=wizard-create]").click();
    eq(await dialogTitle(page), "Build a deck · Commander", "Start from a commander opens Build a deck at its commander step");
    await closeDialog(page);
    ok(!/Build it\.|Make it yours/.test(await page.locator("#cm-main").innerText()), "and the slogan is the landing page's alone");

    /* #welcome is the landing page on purpose, whatever the library holds. */
    await page.goto(`${base}/index.html#welcome`);
    await landing(page);
    ok(true, "#welcome opens the landing page");
    await context.close();
  }

  /* 1. THE FRONT DOOR (Rob, 2026-09-29): with a library too, / is the landing page, and it offers the way in; the
        rail's CrankMagic name and logo bring you back to it. */
  {
    const {context, page} = await fresh();
    await loadLiveState(page, base);
    await page.goto(`${base}/index.html`);
    await landing(page);
    eq([await page.locator(".cm-landing-account .v-button").innerText(), await page.locator(".cm-landing-account .v-button").getAttribute("href"), await page.locator(".cm-landing [data-action=landing-start]").count()],
      ["Open your decks", "#decks", 1], "with a library in this browser, / is the landing page too, and its header says Open your decks");
    eq(await page.locator(".cm-landing-step strong").textContent(), "Start a new deck", "and Step one reads Start a new deck, not your first");
    await page.waitForTimeout(1500);
    ok(!/Offline app caching is unavailable/.test(await page.locator("#cm-notice").textContent()), "a browser that blocks service workers is not shown an error about it");
    await shot(page, "landing-with-library-1440");
    await page.locator(".cm-landing-account .v-button").click();
    await page.getByRole("heading", {name: "Decks", level: 1}).waitFor({timeout: 60000});
    ok(true, "Open your decks opens Decks");
    for (const [which, sel] of [["logo", ".v-brand-home"], ["name", "a.v-brand"]]) {
      await page.locator(sel).click();
      await landing(page);
      ok(true, `the rail's CrankMagic ${which} goes back to the landing page`);
      await page.goto(`${base}/index.html#decks`);
      await page.getByRole("heading", {name: "Decks", level: 1}).waitFor({timeout: 60000});
    }
    await context.close();
  }

  /* 1 and 2. Signed in, / is the landing page, with no Sign in; signed out where accounts are on, it offers Sign in. */
  for (const who of ["signed in", "signed out"]) {
    const {context, page} = await fresh();
    const html = readFileSync(path.join(ROOT, "index.html"), "utf8").replace("</head>", '<meta name="crankmagic-accounts" content="on"></head>');
    await page.route(`${base}/index.html*`, (route) => route.fulfill({contentType: "text/html; charset=utf-8", body: html}));
    await page.route(`${base}/api/me`, (route) => who === "signed in" ? route.fulfill({json: {email: "reader@example.test"}}) : route.fulfill({status: 401, json: {}}));
    await page.route(`${base}/api/library`, (route) => route.fulfill({json: {head: null}}));
    await page.goto(`${base}/index.html`);
    const leftOfWayIn = () => page.evaluate(() => {const c = document.querySelector(".cm-landing-account .cm-landing-chip").getBoundingClientRect(), g = document.querySelector(".cm-landing-account .v-button").getBoundingClientRect(); return c.right <= g.left && Math.abs((c.top + c.bottom) / 2 - (g.top + g.bottom) / 2) < 4;});
    const openMenu = async () => {await page.locator(".cm-landing-chip").click(); await page.locator("#cm-user-menu:popover-open").waitFor({timeout: 10000}); return (await page.locator("#cm-account").innerText()).replace(/\s+/g, " ").trim();};
    if (who === "signed in") {
      await landing(page);
      await page.waitForFunction(() => document.querySelector(".cm-landing-account .v-button")?.textContent === "Open your decks", null, {timeout: 30000});
      eq(await page.locator(".cm-landing-account [data-action=account-sign-in]").count(), 0, "signed in, / is the landing page too (Rob, 2026-09-29): no Sign in, and Open your decks");
      /* 8. Signed in, the chip shows who, left of Open your decks, and opens the menu with Sync now at its head. */
      eq((await page.locator(".cm-landing-chip .cm-landing-chip-name").innerText()).trim(), "reader@example.test", "signed in, the header's chip shows who is signed in");
      ok(await leftOfWayIn(), "to the left of Open your decks, on its line");
      const account = await openMenu();
      ok(/^Account Signed in as reader@example\.test/.test(account) && await page.locator("#cm-account [data-action=account-sync]").isVisible(), `and opens the menu: Account, who, and Sync now (${account.slice(0, 60)})`);
      await shot(page, "landing-chip-signed-in-1400");
    } else {
      await landing(page);
      await page.waitForTimeout(1000);
      /* 8. Signed out where accounts are on, the chip says Sign in; it opens the menu, whose Account says Sign in. */
      eq((await page.locator(".cm-landing-account .cm-landing-chip .cm-landing-chip-name").innerText()).trim(), "Sign in", "signed out where accounts are on, the landing page's chip says Sign in (Rob, 2026-09-30)");
      ok(await leftOfWayIn(), "to the left of the way in, on its line");
      ok(/Sign in to keep it in the cloud/.test(await page.locator(".cm-landing-fine").innerText()), "and says what signing in adds");
      const account = await openMenu();
      ok(/^Account Sign In \(Save to Cloud\)/.test(account) && await page.locator("#cm-account [data-action=account-sign-in]").isVisible(), `and it opens the menu, Account at its head with Sign in (${account.slice(0, 60)})`);
      await shot(page, "landing-chip-signed-out-1400");
    }
    await context.close();
  }

  /* 6. On a phone. */
  {
    const {context, page} = await fresh({width: 390, height: 844}, {isMobile: true, hasTouch: true});
    await page.goto(`${base}/index.html`);
    await landing(page);
    await page.waitForTimeout(500);
    const wide = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
    ok(wide[0] <= wide[1], `on a phone the landing page never scrolls sideways (${wide.join(" in ")}px)`);
    /* The page clips sideways overflow rather than scrolling, so "no scrollbar" alone would pass a card cut in half:
       every piece of the art is inside the screen, turned as it is. */
    const art = await page.$$eval(".cm-landing-hero-art, .cm-landing-sample, .cm-landing-door, .cm-landing-close", (els) => els.map((el) => { const r = el.getBoundingClientRect(); return [el.className, Math.round(r.left), Math.round(r.right)]; }));
    const out = art.filter(([, l, r]) => l < 0 || r > 390);
    eq(out, [], `and every card, door and panel sits inside the screen (${art.length} measured)`);
    const box = await page.locator("#cm-landing-start").boundingBox();
    ok(box.x >= 15 && box.x + box.width <= 375, `and Step one sits inside the 16px gutters (${Math.round(box.x)} to ${Math.round(box.x + box.width)})`);
    const go = await page.locator("#cm-landing-start [type=submit]").boundingBox();
    ok(go.height >= 44, `and its button is a thumb's height (${Math.round(go.height)}px)`);
    await context.close();
  }
} finally {
  await close();
}
console.log(`landing-r3: ${checks} checks passed — / is the landing page for everyone, the rail's name and logo go back to it, its promises are invite-only, each door and Step one go where they say, its account chip opens the app's menu, and Decks with no decks says so.`);
