/* EVERY TOUR STEP POINTS AT SOMETHING.
 *
 * tests/tour.mjs holds the tour's content honest without a browser: seven journeys, every
 * step naming a registered view, every selector parseable, every tour ending in a sentence
 * that says what you now have. What it cannot do is prove a selector MATCHES. That is the
 * failure that actually reaches a reader, and it is invisible from the outside: a step whose
 * selector matches nothing draws its card in the middle of the screen with no spotlight, and
 * looks exactly like a step that was meant to.
 *
 * So the engine records which selector won on the layer, as data-tour-hit, and this walks
 * every step of every tour in a real browser and asserts it is never "none". Four of the
 * legacy tour's shipped bugs -- a step measuring a "Loading…" box that had already been
 * replaced, a step matching another view's hidden copy of the same class, a step describing a
 * sub-route it never navigated to, a step covered by a popover in the top layer -- all
 * present as exactly this, and all four were found by running this check rather than by
 * reading the code.
 *
 * A deck is drafted and saved first, because four of the seven tours describe a deck you
 * have, and on an empty library they correctly collapse to a single "nothing here yet" step.
 * Walking them empty would prove nothing about the other forty.
 */
import assert from "node:assert/strict";
import {openBrowser} from "./browser-runner.mjs";

/* The browser the other walks use (browser-runner.mjs): Playwright found where it is installed, the repo served under
   crankmagic.localhost -- the app treats localhost and 127.0.0.1 as the game host's own copy and hides the rail there,
   Menu and all (Rob, 2026-09-24) -- and the network stubbed. TOUR_WALK_REQUIRED=1 makes a missing browser a failure,
   as tests/uat/journeys.mjs runs it. */
const {browser, base, stub, close} = await openBrowser({name: "tour-walk", flag: "TOUR_WALK_REQUIRED"});
const page = await (await browser.newContext({viewport: {width: 1400, height: 1000}})).newPage();
if (stub) await stub(page);
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));

const fail = async (message) => {
  await close();
  console.error(`tour-walk: ${message}`);
  process.exit(1);
};
/* Take a Tour is in the Menu, at the foot of the rail. */
const openTours = async () => {
  await page.locator("#cm-user-functions").click();
  await page.locator("#cm-user-menu [data-action=tour]").click();
};

try {
  /* --------------------------------------------------- seed one real deck */
  await page.goto(`${base}/index.html#lab`);
  await page.locator("#cm-lab-run-pane").waitFor({timeout: 90000});
  await page.evaluate(() => document.querySelectorAll("#cm-main details").forEach((d) => {d.open = true;}));
  await page.waitForTimeout(600);
  /* By NAME, not by label. getByLabel matches the label element's text content, and a
     required field's label carries a trailing asterisk -- so an exact label match breaks
     every time a field becomes required, which is a change to presentation, not to the form.
     The accessible name is clean ("Deck name"); it is the locator that was brittle. */
  await page.locator("#cm-lab-form [name=commanderQuery]").fill("Krenko, Mob Boss");
  await page.locator("[data-lab-commander]").filter({has: page.getByText("Krenko, Mob Boss", {exact: true})}).first().click();
  await page.locator("#cm-lab-form [name=deckName]").fill("Tour walk");
  await page.locator("#cm-lab-run").click();
  await page.locator("#cm-lab-save:not([disabled])").waitFor({timeout: 180000});
  await page.waitForTimeout(45000);            // the draft fetches printed text for 99 cards
  await page.locator("#cm-lab-save").click();
  await page.waitForTimeout(4000);

  await page.goto(`${base}/index.html#decks`);
  await page.waitForTimeout(6000);
  const decks = await page.locator(".cm-deck-tile").count();
  if (!decks) await fail("could not seed a deck, so the four tours that need one cannot be walked");

  /* --------------------------------------------------- walk every tour */
  await openTours();
  await page.getByRole("dialog").waitFor({timeout: 15000});
  const ids = await page.locator(".cm-tour-pick").evaluateAll((els) => els.map((e) => e.dataset.tour));
  assert.equal(ids.length, 7, `the chooser offers ${ids.length} tours, not seven`);
  await page.keyboard.press("Escape");

  let walked = 0;
  const missed = [];
  for (const id of ids) {
    await openTours();
    await page.locator(`[data-tour="${id}"]`).click();
    await page.locator("#cm-tour-layer").waitFor({state: "visible", timeout: 15000});
    for (let step = 0; step < 40; step += 1) {
      await page.waitForTimeout(1300);
      /* The engine keeps trying to find and measure its target while a view is still loading
         (Discover waits on its graph data), so this waits for the spotlight to settle rather
         than sampling once and blaming the tour for the page's latency. What it must not do is
         wait forever: a step that never resolves is exactly the rot this walk exists to catch. */
      const read = () => page.evaluate(() => {
        const layer = document.getElementById("cm-tour-layer");
        const box = document.getElementById("cm-tour-spotlight").getBoundingClientRect();
        return {hit: layer.dataset.tourHit, title: document.getElementById("cm-tour-title").textContent,
          width: box.width, height: box.height,
          last: document.getElementById("cm-tour-next").textContent === "Done"};
      });
      let seen = await read();
      for (let wait = 0; wait < 12 && seen.hit !== "finish" && (seen.width < 10 || seen.height < 10); wait += 1) {
        await page.waitForTimeout(1000);
        seen = await read();
      }
      /* Every step is walked, and every one that misses is named at the end, so one run lists them all. */
      if (seen.hit === "none") missed.push(`${id}: step "${seen.title}" points at nothing`);
      else if (seen.hit !== "finish" && (seen.width < 10 || seen.height < 10)) missed.push(`${id}: step "${seen.title}" matched ${seen.hit} but measured ${Math.round(seen.width)}x${Math.round(seen.height)}`);
      walked += 1;
      if (seen.last) break;
      await page.locator("#cm-tour-next").click();
    }
    await page.locator("#cm-tour-next").click();   // Done closes
    await page.waitForTimeout(400);
  }

  if (missed.length) await fail(`${missed.length} of ${walked} steps miss their target:\n  ${missed.join("\n  ")}`);
  if (errors.length) await fail(`console errors during the walk: ${errors.slice(0, 3).join(" | ")}`);
  console.log(`tour-walk: ${ids.length} tours, ${walked} steps, every one pointing at something real.`);
} finally {
  await close().catch(() => {});
}
