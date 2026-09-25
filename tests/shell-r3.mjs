/* r3's SHELL, AS A READER USES IT (R3.2, docs/design/2026-09-25-redesign-r3/INTAKE.md).
 *
 * The wireframes this holds the app to are 04-shell, 06-global-menu, 07-help-panel, 72-toast-error,
 * 74-confirm-delete and 76-glossary. In a real page with the committed library restored:
 *
 *   1. The Menu is a chip at the rail's foot, still the button named "Menu". Signed in, it shows the
 *      person's initial, their address and whether the library reached the cloud; when the cloud fails,
 *      it says so. Sign out is the Menu's last entry.
 *   2. The theme is one of three: Dark, Light, Match system. The choice in force is pressed, it is
 *      saved, and Match system follows the device live.
 *   3. A save's toast carries Undo, and Undo takes the save back. A failure that may pass carries Retry,
 *      which runs the action again; a rule the reader has not met yet does not.
 *   4. Help is a slide-over at the right with the page visible beside it; the glossary is one step on,
 *      and closing the glossary comes back to the help. The Menu's Help opens the page's own help.
 *   5. Deleting a deck asks for the deck's name, not a fixed word, and the Undo after it brings the
 *      deck back.
 *
 * Needs Playwright and Chromium, like tests/type-final.mjs; GEOMETRY_REQUIRED=1 (CI) turns a missing
 * browser into a failure.
 */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import path from "node:path";
import {openBrowser, loadLiveState, ROOT} from "./uat/browser-runner.mjs";

let checks = 0;
const ok = (cond, msg) => { checks++; assert.ok(cond, msg); };
const eq = (a, b, msg) => { checks++; assert.deepEqual(a, b, msg); };

const {browser, base, stub, close} = await openBrowser({name: "shell-r3", flag: "GEOMETRY_REQUIRED"});
const menuButton = (page) => page.getByRole("button", {name: "Menu", exact: true});
const openMenu = async (page) => { await menuButton(page).click(); await page.locator("#cm-user-menu:popover-open").waitFor(); };
const theme = (page) => page.evaluate(() => document.getElementById("matrix-v2").dataset.theme);
const pressed = (page) => page.$$eval("[data-theme-choice]", (bs) => bs.filter((b) => b.getAttribute("aria-pressed") === "true").map((b) => b.dataset.themeChoice));
const toast = (page) => page.evaluate(() => {
  const el = document.getElementById("cm-notice");
  return {shown: !el.hidden, text: el.querySelector(".cm-toast-text")?.textContent || "", action: el.querySelector(".cm-toast-action")?.textContent || null, error: el.classList.contains("error")};
});
/* An action the dispatcher runs, pressed the way a reader would press it wherever it is drawn. */
const press = (page, action, data = {}) => page.evaluate(({action, data}) => {
  const b = document.createElement("button");
  b.dataset.action = action;
  for (const [k, v] of Object.entries(data)) b.dataset[k] = v;
  document.getElementById("cm-main").append(b);
  b.click();
  b.remove();
}, {action, data});

try {
  const context = await browser.newContext({viewport: {width: 1400, height: 900}, serviceWorkers: "block"});
  const page = await context.newPage();
  if (stub) await stub(page);
  await loadLiveState(page, base);

  /* 1, without an account: the chip reads Menu and says what the Menu holds. */
  eq(await page.$eval("#cm-user-functions", (b) => [b.querySelector(".cm-chip-name").textContent, b.querySelector(".cm-chip-status").textContent]),
    ["Menu", "Settings & backup"], "with no account, the chip reads Menu and what the Menu holds");
  const fitsOut = await page.$eval("#cm-user-functions .cm-chip-status", (el) => [el.scrollWidth, el.clientWidth]);
  ok(fitsOut[0] <= fitsOut[1], `and that line fits the rail without being cut off (${fitsOut.join(" in ")}px)`);

  /* 2. Three themes. */
  await openMenu(page);
  eq(await page.$$eval("[data-theme-choice]", (bs) => bs.map((b) => b.textContent)), ["Dark · Brass & Slate", "Light · Felt & Cream", "Match system"], "the Menu offers three themes");
  eq(await pressed(page), ["dark"], "and dark, the default, is the one pressed");
  await page.getByRole("button", {name: "Light · Felt & Cream"}).click();
  await page.waitForFunction(() => document.getElementById("matrix-v2").dataset.theme === "light");
  eq(await pressed(page), ["light"], "choosing Light turns the page light and presses Light");

  /* 3. The save's toast carries Undo, and Undo takes it back. */
  const saved = await toast(page);
  ok(saved.shown && /Light theme/.test(saved.text) && saved.action === "Undo" && !saved.error, `the theme's toast carries Undo: ${JSON.stringify(saved)}`);
  /* Every notice raised while Undo runs, not just the last: the repository announces the new revision
     to this tab's own listeners before undo() returns, and a listener that took it for another tab's
     change once posted "refreshed after a change in another tab" on top of "Last change undone" --
     only sometimes, by timing. Recording them all makes that a certainty rather than a race. */
  await page.evaluate(() => { window.__notices = []; new MutationObserver(() => { const t = document.querySelector("#cm-notice .cm-toast-text")?.textContent; if (t) window.__notices.push(t); }).observe(document.getElementById("cm-notice"), {childList: true, subtree: true, characterData: true}); });
  await page.locator("#cm-notice .cm-toast-action").click();
  await page.waitForFunction(() => document.getElementById("matrix-v2").dataset.theme === "dark");
  await page.waitForTimeout(600);
  const during = await page.evaluate(() => window.__notices);
  ok(!during.some((t) => /another tab/.test(t)), `Undo in this tab is not reported as another tab's change: ${JSON.stringify(during)}`);
  const undone = await toast(page);
  ok(/Last change undone/.test(undone.text) && undone.action === null, `Undo put the dark theme back, and its own toast offers nothing further: ${JSON.stringify(undone)}`);

  /* Match system follows the device, live, and the choice is saved. */
  await page.emulateMedia({colorScheme: "light"});
  await openMenu(page);
  await page.getByRole("button", {name: "Match system"}).click();
  await page.waitForFunction(() => document.getElementById("matrix-v2").dataset.theme === "light");
  eq(await pressed(page), ["system"], "Match system is pressed, and on a light device the page is light");
  await page.emulateMedia({colorScheme: "dark"});
  await page.waitForFunction(() => document.getElementById("matrix-v2").dataset.theme === "dark", null, {timeout: 5000});
  eq(await theme(page), "dark", "the device turning dark turns the page dark, with no reload");
  await page.reload();
  await page.getByRole("heading", {name: "Decks", level: 1}).waitFor({timeout: 60000});
  eq(await pressed(page), ["system"], "the choice is saved: after a reload Match system is still the one pressed");
  await page.emulateMedia({colorScheme: "light"});
  await page.waitForFunction(() => document.getElementById("matrix-v2").dataset.theme === "light", null, {timeout: 5000});
  ok(true, "and it still follows the device");
  await openMenu(page);
  await page.getByRole("button", {name: "Dark · Brass & Slate"}).click();
  await page.waitForFunction(() => document.getElementById("matrix-v2").dataset.theme === "dark");
  await page.emulateMedia({colorScheme: "dark"});

  /* Retry: only for a failure that may pass. A deck that is not archived cannot be deleted -- a rule,
     so no Retry. Offline, the same press is offered Retry, and Retry runs it again. */
  const live = await page.evaluate(() => document.querySelector('[data-action="deck"][data-deck]')?.dataset.deck || "");
  ok(live, "the restored library has a deck");
  await press(page, "delete-deck", {deck: live});
  await page.waitForFunction(() => document.getElementById("cm-notice").classList.contains("error"));
  const rule = await toast(page);
  ok(/Archive the deck first/.test(rule.text) && rule.action === null, `a rule's error offers no Retry: ${JSON.stringify(rule)}`);
  await context.setOffline(true);
  await press(page, "delete-deck", {deck: live});
  await page.waitForFunction(() => document.querySelector("#cm-notice .cm-toast-action")?.textContent === "Retry");
  ok((await toast(page)).error, "offline, the same failure is offered Retry");
  await context.setOffline(false);
  await page.evaluate(() => { document.getElementById("cm-notice").dataset.seen = "before"; });
  await page.locator("#cm-notice .cm-toast-action").click();
  await page.waitForFunction(() => { const el = document.getElementById("cm-notice"); return !el.hidden && !el.querySelector(".cm-toast-action"); });
  ok(/Archive the deck first/.test((await toast(page)).text), "Retry ran the action again, which, back online, fails as a rule with no Retry");

  /* 4. Help slides in from the right, with the page beside it. */
  await page.locator('#cm-main [data-action="page-help"]').first().click();
  const panel = page.locator("#cm-dialog");
  await panel.waitFor();
  await panel.evaluate((d) => Promise.all(d.getAnimations().map((a) => a.finished)));
  const box = await panel.boundingBox();
  ok(await panel.evaluate((d) => d.classList.contains("cm-slideover")), "the page's help opens as the slide-over");
  ok(Math.abs(box.x + box.width - 1400) <= 1 && box.x > 700 && box.height >= 899, `it is the full height of the right edge with the page visible beside it (${JSON.stringify(box)})`);
  eq(await page.locator("#cm-dialog-title").textContent(), "Help — Decks", "and it is titled for the page");
  await page.getByRole("button", {name: "Open the glossary →"}).click();
  await page.locator("#cm-dialog-title", {hasText: "Glossary"}).waitFor();
  const terms = await page.$$eval("#cm-dialog .cm-gloss-term", (ts) => ts.map((t) => t.textContent));
  ok(["Physical deck", "Substitute", "Bench", "Reserved", "To buy", "Ordered"].every((t) => terms.includes(t)), `the glossary names the statuses: ${terms.join(", ")}`);
  ok(await page.$eval("#cm-dialog .cm-gloss-term", (t) => getComputedStyle(t).backgroundColor !== "rgba(0, 0, 0, 0)"), "each status wears its color");
  await page.getByRole("button", {name: "Close", exact: true}).click();
  await page.locator("#cm-dialog-title", {hasText: "Help — Decks"}).waitFor();
  ok(true, "closing the glossary comes back to the help it was opened from");
  await page.getByRole("button", {name: "Got it"}).click();
  await panel.waitFor({state: "hidden"});
  ok(true, "Got it closes the help");
  await openMenu(page);
  await page.getByRole("button", {name: "Help & glossary"}).click();
  await page.locator("#cm-dialog-title", {hasText: "Help — Decks"}).waitFor();
  ok(true, "the Menu's Help & glossary opens the help of the page underneath");
  await page.keyboard.press("Escape");
  await panel.waitFor({state: "hidden"});

  /* 5. Deleting a deck asks for its name. It is offered on archived decks only, so archive first. */
  await press(page, "archive", {deck: live});
  await page.getByRole("button", {name: "Confirm change"}).click();
  await page.waitForFunction(() => !document.getElementById("cm-dialog").open);
  await press(page, "delete-deck", {deck: live});
  const field = page.getByLabel("Type the deck name to confirm");
  await field.waitFor();
  const wanted = await field.getAttribute("placeholder");
  ok(await page.evaluate(() => { const b = document.querySelector("#cm-dialog form.cm-destructive [type=submit]"); if (!b) return false; const probe = document.createElement("span"); probe.style.color = "var(--st-remove)"; document.getElementById("matrix-v2").append(probe); const want = getComputedStyle(probe).color; probe.remove(); return getComputedStyle(b).backgroundColor === want; }), "the delete button is red, as a delete should be (74-confirm-delete)");
  ok(wanted && wanted !== "DELETE" && (await page.locator("#cm-dialog-title").textContent()).includes(wanted), `the field asks for the deck's own name, the one in the title (${wanted})`);
  await field.fill("DELETE");
  await page.locator("#cm-dialog [type=submit]").click();
  await page.locator("#cm-dialog .cm-error:not([hidden])").waitFor();
  ok(/Type the deck name exactly/.test(await page.locator("#cm-dialog .cm-error").textContent()) && await page.evaluate(() => document.getElementById("cm-dialog").open),
    "the old fixed word deletes nothing, and the dialog stays");
  await field.fill(wanted);
  await page.locator("#cm-dialog [type=submit]").click();
  await page.waitForFunction(() => !document.getElementById("cm-dialog").open);
  const gone = await toast(page);
  ok(gone.action === "Undo", `the deletion's toast offers Undo: ${JSON.stringify(gone)}`);
  await press(page, "delete-deck", {deck: live});
  await page.waitForFunction(() => document.getElementById("cm-notice").classList.contains("error"));
  ok(!(await page.evaluate(() => document.getElementById("cm-dialog").open)), "the deck is gone: deleting it again finds nothing to delete");
  await page.evaluate(() => { document.getElementById("cm-notice").hidden = true; });
  await press(page, "undo");
  await page.waitForFunction(() => /Last change undone/.test(document.getElementById("cm-notice").textContent));
  await press(page, "delete-deck", {deck: live});
  await field.waitFor();
  ok(true, "Undo brought the deck back: it is there, archived, to be deleted again");
  await page.keyboard.press("Escape");
  await context.close();

  /* 1, signed in: a page with accounts on, and a cloud that answers. */
  for (const cloud of ["answers", "fails"]) {
    const signed = await browser.newContext({viewport: {width: 1400, height: 900}, serviceWorkers: "block"});
    const p = await signed.newPage();
    if (stub) await stub(p);
    /* The page from disk rather than route.fetch, which cannot resolve the .localhost name from Node. */
    const page_ = readFileSync(path.join(ROOT, "index.html"), "utf8").replace("</head>", '<meta name="crankmagic-accounts" content="on"></head>');
    await p.route(`${base}/index.html*`, (route) => route.fulfill({contentType: "text/html; charset=utf-8", body: page_}));
    await p.route(`${base}/api/me`, (route) => route.fulfill({json: {email: "reader@example.test"}}));
    await p.route(`${base}/api/library`, (route) => cloud === "answers"
      ? route.fulfill({json: {head: null}})
      : route.fulfill({status: 500, json: {error: "The cloud is down for a moment."}}));
    await p.goto(`${base}/index.html`);
    await p.locator("#cm-user-functions.is-signed-in").waitFor({timeout: 30000});
    const chip = () => p.$eval("#cm-user-functions", (b) => ({
      avatar: b.querySelector(".cm-chip-avatar").textContent, name: b.querySelector(".cm-chip-name").textContent,
      status: b.querySelector(".cm-chip-status").textContent, trouble: b.classList.contains("is-trouble"), label: b.getAttribute("aria-label")}));
    if (cloud === "answers") {
      await p.waitForFunction(() => /^Synced · /.test(document.querySelector("#cm-user-functions .cm-chip-status").textContent), null, {timeout: 15000});
      eq(await chip(), {avatar: "R", name: "reader@example.test", status: "Synced · just now", trouble: false, label: "Menu"},
        "signed in, the chip shows the initial, the address and when the library last matched the cloud, and is still the button named Menu");
      const fits = await p.$eval("#cm-user-functions .cm-chip-status", (el) => [el.scrollWidth, el.clientWidth]);
      ok(fits[0] <= fits[1], `and the sync line fits the rail without being cut off (${fits.join(" in ")}px)`);
      await openMenu(p);
      ok(/Signed in as reader@example\.test/.test(await p.locator("#cm-account").innerText()), "the Menu's Account section says who is signed in");
      eq(await p.$eval("#cm-user-menu", (m) => { const last = [...m.querySelectorAll("button,a")].pop(); return [last.textContent, last.classList.contains("cm-danger")]; }),
        ["Sign out", true], "Sign out is the Menu's last entry, in red");
    } else {
      await p.waitForFunction(() => document.querySelector("#cm-user-functions").classList.contains("is-trouble"), null, {timeout: 15000});
      eq((await chip()).status, "Not saved to the cloud", "when the cloud fails, the chip says the library has not reached it");
    }
    await signed.close();
  }

  /* On a phone the chip is its initial alone, and still the button named Menu. */
  const phone = await browser.newContext({viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true, serviceWorkers: "block"});
  const small = await phone.newPage();
  if (stub) await stub(small);
  await small.goto(`${base}/index.html`);
  await menuButton(small).waitFor({timeout: 60000});
  eq(await small.$eval("#cm-user-functions .cm-chip-text", (t) => getComputedStyle(t).display), "none", "on a phone the chip's words give way to its mark");
  const chipBox = await menuButton(small).boundingBox();
  ok(chipBox.x + chipBox.width <= 390 && chipBox.height >= 40, `and the chip fits the row, 40px tall or more (${JSON.stringify(chipBox)})`);
  await phone.close();
} finally {
  await close();
}
console.log(`shell-r3: ${checks} checks passed — the Menu chip, three themes with Match system followed live, toasts with Undo and Retry, help as a slide-over with the glossary, and delete by the deck's name.`);
