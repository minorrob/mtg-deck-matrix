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
  await element.click({timeout: 10000}).catch(async error=>{
    console.error('CONTROL GEOMETRY',selector,await element.evaluate(el=>{const result=[];for(let n=el;n;n=n.parentElement){const s=getComputedStyle(n);result.push({tag:n.tagName,cls:n.className,box:n.getBoundingClientRect().toJSON(),scroll:[n.scrollLeft,n.scrollTop],position:s.position,overflow:s.overflow,transform:s.transform});}return result;}));throw error;
  });
}
/* Follow the branch containing the chosen engine index, through visible controls only. */
export async function chooseFlow(page,index) {
  for(let n=0;n<100;n++){
    const hidden=page.locator(`details:not([open]) [data-action=board-flow-choice][data-indices~="${index}"]`);
    if(await hidden.count())await hidden.first().locator('xpath=ancestor::details').locator('summary').click();
    const branch=await visible(page,`[data-action=board-flow-choice][data-indices~="${index}"]`);
    if(branch){await branch.click();continue;}
    const confirm=await visible(page,'[data-action=board-flow-confirm]:not([disabled])');
    if(confirm){await confirm.click();return;}
    throw new Error(`No visible layered path to option ${index}`);
  }
  throw new Error('Layered choice did not terminate');
}

/* The options the pilot picked, pressed as a person would (Rob, 2026-10-25: the same card in a question is one stack, ×N):
   an option drawn on its own by its button; one in a stack by the stack -- a click where one may be taken, and where more
   may, its how-many set to the number of that card the pilot took. Which of identical cards is taken is the same choice. */
async function pickOptions(page, indices) {
  const stacks = await page.$$eval("#cm-board-decision [data-action=board-option-same]", (bs) => bs.map((b) => b.dataset.same));
  const done = new Set();
  for (const i of indices) {
    const key = stacks.find((s) => s.split(",").map(Number).includes(i));
    if (!key) {await click(page, `[data-action=board-option][data-index="${i}"]`); continue;}
    if (done.has(key)) continue;
    done.add(key);
    const n = indices.filter((x) => key.split(",").map(Number).includes(x)).length, count = await visible(page, `#cm-board-decision [data-board-same="${key}"]`);
    if (count) await count.fill(String(n));
    else await click(page, `#cm-board-decision [data-action=board-option-same][data-same="${key}"]`);
  }
}

async function bindSelected(page) {
  const next=await visible(page,'[data-action=board-target-next]:not([disabled])');
  if(next)await next.click();
  return click(page,'[data-action=board-direct]:not([disabled]), [data-action=board-confirm]:not([disabled])');
}

/* The option the pilot picked at priority, found where the board shows it: in the decision panel, behind Also, in
   the card's own chooser, or grouped under one button with others of its kind. */
async function priority(page, d, chosen) {
  if (chosen.act === "pass") return click(page, "[data-action=board-pass]:not([disabled])");
  if (!await visible(page, `#cm-board-decision [data-action=board-option][data-index="${chosen.index}"]`)) {
    const also = await visible(page, "[data-action=board-actions-open], [data-action=board-also]");
    if (also) await also.click();
  }
  const exact = await visible(page, `[data-action=board-option][data-index="${chosen.index}"]`);
  if (exact) {await exact.click();return await visible(page,'.cm-choice-flow') ? chooseFlow(page,chosen.index) : bindSelected(page);}
  const chooser = await visible(page, `[data-action=board-choose][data-card="${chosen.cardId}"]`);
  if (chooser) {await chooser.click();return chooseFlow(page,chosen.index);}
  const grouped = d.options.find((o) => o.act === chosen.act && o.label === chosen.label);
  await click(page, `[data-action=board-option][data-index="${grouped.index}"]`);
  return bindSelected(page);
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
    if (d.kind === "draw") await click(page, "button[data-action=board-draw]:not(.cm-bcard):not([disabled])");
    else if (d.kind === "priority") {
      const options = d.options.map((o) => ({kind: o.act, objectId: o.cardId, label: o.label, option: o}));
      await priority(page, d, pilot.choose(v.state, options).option);
    } else {
      const picked = pilot.answer(v.state, d);
      let bound=false;
      if(/^mulligan:/.test(d.id) && d.options.some(o=>o.label==='Keep')) {
        await click(page,`[data-action=board-opening-hand][data-index="${picked.indices[0]}"]`);bound=true;
      } else if(['one','boolean','index'].includes(d.mode) && await visible(page,'.cm-choice-flow')) {
        await chooseFlow(page,picked.indices[0]);bound=true;
      } else if(String(d.id).startsWith('declare-attackers:')) {
        for(const i of picked.indices || []){const o=d.options.find(o=>o.index===i);await click(page,`[data-action=board-flow-attacker][data-card="${o.cardId}"]`);await chooseFlow(page,i);}
      } else if(picked.indices?.length===1 && d.options.find(o=>o.index===picked.indices[0])?.decline && await visible(page,`[data-action=board-decline][data-index="${picked.indices[0]}"]`)) {
        await click(page,`[data-action=board-decline][data-index="${picked.indices[0]}"]`);bound=true;
      } else if (picked.amounts) {
        for (let i = 0; i < picked.amounts.length; i++) {
          const field = await visible(page, `[data-board-amount="${i}"]`);
          assert.ok(field, `amount input ${i}`);
          await field.fill(String(picked.amounts[i]));
          await field.press("Tab");
        }
      } else if (d.mode === "many" && Array.isArray(d.legalBlocks)) {
        const publicIds=new Set(v.state.players.flatMap(p=>p.zones.Battlefield.cards).map(c=>c.cardId));
        const attacks=(v.state.combat?.attacks || []).filter(a=>a.defender===v.seat && publicIds.has(a.attacker));
        for(const attack of attacks) {
          const currentAttacker=await page.locator('.cm-block-draft').getAttribute('data-active-attacker');
          const confirms=await visible(page,`[data-action=board-block-attacker-confirm][data-attacker="${attack.attacker}"]`);
          if(Number(currentAttacker)!==attack.attacker || !confirms)await click(page,`[data-action=board-block-attacker][data-attacker="${attack.attacker}"]`);
          const indices=(picked.indices || []).filter(i=>d.options.find(o=>o.index===i)?.attackerId===attack.attacker);
          for(const i of indices)await click(page,`[data-action=board-block-pair][data-index="${i}"]`);
          await click(page,`[data-action=${indices.length?'board-block-attacker-confirm':'board-block-attacker-none'}][data-attacker="${attack.attacker}"]`);
        }
        await page.locator('[data-action=board-send-blockers]:not([disabled])').waitFor({timeout});
        await click(page,'[data-action=board-send-blockers]:not([disabled])');bound=true;
      } else await pickOptions(page, picked.indices ?? []);
      if (!bound && ["one", "boolean", "index", "many", "order", "ack", "damage", "amount"].includes(d.mode)) await bindSelected(page);
    }
    while (current()?.revision === v.revision && Date.now() - at < timeout) await page.waitForTimeout(20);
    assert.notEqual(current()?.revision, v.revision, `action advances ${d.title}`);
    answer.waits.push({title: d.title, at, ms: Date.now() - at});
    return true;
  }
  answer.waits = [];
  return answer;
}
