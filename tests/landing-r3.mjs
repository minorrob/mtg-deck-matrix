/* THE LANDING PAGE (R3.8; INTAKE row R3.8, Rob's decisions M1·2 to M1·5) AND THE DECKS PAGE WITH NO DECKS.
 *
 * In a real page:
 *
 *   1. Who sees it. `/` with nothing in this browser is the landing page, standing alone (no rail). With a
 *      library, `/` is Decks. Signed in, `/` goes on to Decks as soon as the account answers. Any #route is the
 *      app, and #welcome is the landing page on purpose.
 *   2. What it promises. Invite-only: Sign in (only where accounts are on) and "Start without an account",
 *      never "Start free" or "Free account". Play is Coming soon.
 *   3. Where each door goes: Decks, Library, Explore, Play, each to its own page.
 *   4. Step one: a typed name opens the commander picker already searched; a pasted list opens the import with
 *      the list in it; Upload a CSV opens the import; Restore a backup opens Restore; "Start without an account"
 *      puts the cursor in the box.
 *   5. What it loads: never the graph.
 *   6. On a phone: no sideways scroll, and Step one in reach.
 *   7. Decks with no decks: the page is Decks, and "No decks yet" offers a commander, a list and a backup.
 *
 * Needs Playwright and Chromium; GEOMETRY_REQUIRED=1 (CI) turns a missing browser into a failure.
 */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {openBrowser, loadLiveState} from "./uat/browser-runner.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let checks = 0;
const ok = (c, msg) => { checks++; assert.ok(c, msg); };
const eq = (a, b, msg) => { checks++; assert.deepEqual(a, b, msg); };

const {browser, base, stub, close} = await openBrowser({name: "landing-r3", flag: "GEOMETRY_REQUIRED"});
const fresh = async (viewport = {width: 1400, height: 900}, extra = {}) => {
  const context = await browser.newContext({viewport, serviceWorkers: "block", ...extra});
  const page = await context.newPage();
  if (stub) await stub(page);
  return {context, page};
};
const landing = (page) => page.locator(".cm-landing h1").waitFor({timeout: 60000});
const dialogTitle = async (page) => { await page.locator("#cm-dialog[open]").waitFor({timeout: 30000}); return (await page.locator("#cm-dialog[open] h2").first().innerText()).trim(); };
const closeDialog = async (page) => { await page.keyboard.press("Escape"); await page.locator("#cm-dialog[open]").waitFor({state: "detached", timeout: 10000}).catch(() => {}); };

try {
  /* 1 and 5. A first visit: the landing page, alone, and no graph fetched. */
  {
    const {context, page} = await fresh();
    const asked = [];
    page.on("request", (r) => asked.push(new URL(r.url()).pathname));
    await page.goto(`${base}/index.html`);
    await landing(page);
    eq(await page.locator(".cm-landing h1").innerText(), "Build the deck. Own the cards. Bring it to the table.", "a first visit to / opens the landing page");
    eq(await page.locator(".cm-sidebar").isVisible(), false, "and it stands alone: the app's rail is not drawn");
    await page.waitForTimeout(1500);
    const graph = asked.filter((p) => /graph[^/]*\.json$|\/data\/graph/.test(p));
    eq(graph, [], "and nothing on it fetches the graph");

    /* 2. The promises. */
    const text = await page.locator(".cm-landing").innerText();
    ok(!/Start free|Free account/i.test(text), "it never says Start free or Free account: accounts are invite-only (M1·2)");
    ok(/Start without an account/.test(text) && /No account needed/.test(text), "it says Start without an account, and that none is needed");
    eq(await page.locator(".cm-landing [data-action=account-sign-in]").count(), 0, "and where accounts are off, it offers no Sign in");
    eq(await page.$$eval(".cm-landing-door", (ds) => ds.map((d) => d.querySelector(".cm-landing-door-top").innerText.replace(/\s+/g, " ").trim())),
      ["DECKS", "LIBRARY", "EXPLORE", "PLAY Coming soon"], "four doors, and Play is Coming soon (M1·5)");

    /* 4. Step one. */
    await page.locator("[data-action=landing-start]").first().click();
    ok(await page.$eval("#cm-landing-query", (i) => i === document.activeElement), "Start without an account puts the cursor in Step one's box");
    await page.locator("#cm-landing-query").fill("Krenko, Mob Boss");
    await page.locator("#cm-landing-start [type=submit]").click();
    eq(await dialogTitle(page), "Choose your commander", "a name and Start my deck open the commander picker");
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
    eq(await page.$$eval(".cm-landing-door", (ds) => ds.map((d) => d.getAttribute("href"))), ["#decks", "#cards", "#discover", "#game"], "each door goes to its own page");
    await page.locator(".cm-landing-door[href='#decks']").click();
    await page.getByRole("heading", {name: "Decks", level: 1}).waitFor({timeout: 30000});
    eq(await page.locator(".cm-sidebar").isVisible(), true, "and through a door the app is itself again, rail and all");

    /* 7. Decks with no decks. */
    eq((await page.locator(".cm-decks-empty h2").innerText()).trim(), "No decks yet", "Decks with no decks says so");
    eq(await page.$$eval(".cm-decks-empty .cm-actions [data-action]", (bs) => bs.map((b) => [b.textContent.trim(), b.dataset.action])),
      [["Start from a commander", "wizard-create"], ["Bring a list", "wizard-import"], ["Restore backup…", "restore"]], "and offers a commander, a list or a backup you saved, in that order");
    await page.locator(".cm-decks-empty [data-action=wizard-create]").click();
    eq(await dialogTitle(page), "Choose your commander", "Start from a commander opens the commander picker");
    await closeDialog(page);
    ok(!/Build it\.|Make it yours/.test(await page.locator("#cm-main").innerText()), "and the slogan is the landing page's alone");

    /* #welcome is the landing page on purpose, whatever the library holds. */
    await page.goto(`${base}/index.html#welcome`);
    await landing(page);
    ok(true, "#welcome opens the landing page");
    await context.close();
  }

  /* 1. With a library, / is Decks. */
  {
    const {context, page} = await fresh();
    await loadLiveState(page, base);
    await page.goto(`${base}/index.html`);
    await page.getByRole("heading", {name: "Decks", level: 1}).waitFor({timeout: 60000});
    eq(await page.locator(".cm-landing").count(), 0, "with a library in this browser, / opens Decks, not the landing page");
    await context.close();
  }

  /* 1 and 2. Signed in, / goes on to Decks; signed out where accounts are on, the landing page offers Sign in. */
  for (const who of ["signed in", "signed out"]) {
    const {context, page} = await fresh();
    const html = readFileSync(path.join(ROOT, "index.html"), "utf8").replace("</head>", '<meta name="crankmagic-accounts" content="on"></head>');
    await page.route(`${base}/index.html*`, (route) => route.fulfill({contentType: "text/html; charset=utf-8", body: html}));
    await page.route(`${base}/api/me`, (route) => who === "signed in" ? route.fulfill({json: {email: "reader@example.test"}}) : route.fulfill({status: 401, json: {}}));
    await page.route(`${base}/api/library`, (route) => route.fulfill({json: {head: null}}));
    await page.goto(`${base}/index.html`);
    if (who === "signed in") {
      await page.waitForFunction(() => location.hash === "#decks", null, {timeout: 30000});
      await page.getByRole("heading", {name: "Decks", level: 1}).waitFor({timeout: 30000});
      eq(await page.locator(".cm-landing").count(), 0, "signed in, / goes on to Decks: the library is on its way from the cloud");
    } else {
      await landing(page);
      await page.waitForTimeout(1000);
      eq(await page.locator(".cm-landing-account [data-action=account-sign-in]").innerText(), "Sign in", "signed out where accounts are on, the landing page offers Sign in");
      ok(/Sign in to keep it in the cloud/.test(await page.locator(".cm-landing-fine").innerText()), "and says what signing in adds");
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
    const art = await page.$$eval(".cm-landing-card, .cm-landing-sample, .cm-landing-door, .cm-landing-close", (els) => els.map((el) => { const r = el.getBoundingClientRect(); return [el.className, Math.round(r.left), Math.round(r.right)]; }));
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
console.log(`landing-r3: ${checks} checks passed — / is the landing page for a first visit only, its promises are invite-only, each door and Step one go where they say, and Decks with no decks says so.`);
