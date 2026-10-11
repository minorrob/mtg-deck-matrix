/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* A PERSON AT THE BOARD: one seat answered as the house pilot would answer it, but only through the board's own
 * controls -- the draw, Pass, the option buttons, Also, a card's chooser, the amount fields and Confirm -- reading
 * nothing the seat's own frames do not carry. Shared by tests/uat/real-deck-game.mjs and tests/uat/play-journeys.mjs,
 * so a real card's question (a target, a mode, a payment, an order) is answered the same way in both.
 *
 *   const answer = boardPerson({page, seat, cards: tableCards, current: () => latestView});
 *   await answer();   // true once the room has moved past the question; false when nothing is asked of this seat
 *
 * Each answer is timed: `answer.waits` holds {title, at, ms}, from the click until the seat's view moved on.
 */
import assert from "node:assert/strict";
import {housePilot} from "../../game/engine/pilots/house-pilot.mjs";

export async function visible(page, selector) {
  const items = page.locator(selector);
  for (let i = 0; i < await items.count(); i++) if (await items.nth(i).isVisible().catch(() => false)) return items.nth(i);
  return null;
}
export async function click(page, selector) {
  const element = await visible(page, selector);
  assert.ok(element, `visible control ${selector}`);
  await element.click({timeout: 10000});
}

/* The option the pilot picked at priority, found where the board shows it: in the decision panel, behind Also, in
   the card's own chooser, or grouped under one button with others of its kind. */
async function priority(page, d, chosen) {
  if (chosen.act === "pass") return click(page, "[data-action=board-pass]:not([disabled])");
  if (!await visible(page, `#cm-board-decision [data-action=board-option][data-index="${chosen.index}"]`)) {
    const also = await visible(page, "[data-action=board-also]");
    if (also) await also.click();
  }
  const exact = await visible(page, `[data-action=board-option][data-index="${chosen.index}"]`);
  if (exact) return exact.click();
  const chooser = await visible(page, `[data-action=board-choose][data-card="${chosen.cardId}"]`);
  if (chooser) {await chooser.click(); return click(page, `[data-action=board-zoom-do][data-index="${chosen.index}"]`);}
  const grouped = d.options.find((o) => o.act === chosen.act && o.label === chosen.label);
  return click(page, `[data-action=board-option][data-index="${grouped.index}"]`);
}

export function boardPerson({page, seat, cards, current, timeout = 15000}) {
  const pilot = housePilot({seat, cards});
  async function answer() {
    const v = current(), d = v?.decision;
    if (!d || v.status === "finished") return false;
    /* Turns went by: said for six seconds, then put away by itself (crankmagic-board.js, WENT_MS; Rob, 2026-10-09: nothing
       to acknowledge). So its OK is pressed while it is there, and its going first is no fault (PT-R-01, tables 19 and 33:
       the click outlived the panel and waited out its 30 s). Still there and still not pressed, it says why: Playwright's
       reason, how often the board was drawn anew in two seconds, and what the seat was asked. */
    const closed = await visible(page, "[data-action=board-went-close]");
    if (closed) await closed.click({timeout: 5000}).catch(async (error) => {
      if (!await visible(page, "[data-action=board-went-close]")) return;
      const redraws = await page.evaluate(() => new Promise((done) => {let n = 0; const host = document.getElementById("cm-board"); if (!host) return done(-1); const o = new MutationObserver(() => {n += 1;}); o.observe(host, {childList: true, subtree: true}); setTimeout(() => {o.disconnect(); done(n);}, 2000);}));
      const now = current(), why = error.message.split("\n").filter((l) => /^\s+- /.test(l)).slice(-3).map((l) => l.trim()).join("; ");
      throw new Error(`seat ${seat}: Turns went by's OK, still shown, could not be pressed (${error.message.split("\n")[0]}${why ? `: ${why}` : ""}); the board was drawn anew ${redraws} times in 2 s; the seat was asked "${d.title}" (${d.kind}), and the latest view waits on ${now?.waitingOn ?? "no one"} at revision ${now?.revision}`);
    });
    const at = Date.now();
    if (d.kind === "draw") await click(page, "[data-action=board-draw]:not([disabled])");
    else if (d.kind === "priority") {
      const options = d.options.map((o) => ({kind: o.act, objectId: o.cardId, label: o.label, option: o}));
      await priority(page, d, pilot.choose(v.state, options).option);
    } else {
      const picked = pilot.answer(v.state, d);
      if (picked.amounts) {
        for (let i = 0; i < picked.amounts.length; i++) {
          const field = await visible(page, `[data-board-amount="${i}"]`);
          assert.ok(field, `amount input ${i}`);
          await field.fill(String(picked.amounts[i]));
          await field.press("Tab");
        }
      } else for (const i of picked.indices ?? []) await click(page, `[data-action=board-option][data-index="${i}"]`);
      if (["many", "order", "ack", "damage", "amount"].includes(d.mode)) await click(page, "[data-action=board-confirm]:not([disabled])");
    }
    while (current()?.revision === v.revision && Date.now() - at < timeout) await page.waitForTimeout(20);
    assert.notEqual(current()?.revision, v.revision, `action advances ${d.title}`);
    answer.waits.push({title: d.title, at, ms: Date.now() - at});
    return true;
  }
  answer.waits = [];
  return answer;
}
