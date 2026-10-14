/* A DECK HOLDS CARDS WHETHER OR NOT IT IS FINAL (Rob, 2026-09-28; docs/plan-groups.md, G3).
 *
 * Rob loaded the cards he owns for a Quintorius deck into a group, made the deck from the group, and found every
 * copy still on the Bench. Going to the Library to move them, he was told "Finalize a deck first — a draft holds no
 * reservations to confirm", and finalizing needs a legal hundred he did not have yet. So:
 *
 *   Upload   his owned cards go into a new group through Library › Upload cards
 *   Deck     New deck from that group offers to put the copies he owns in the deck's box, ticked; they go in,
 *            each one the list calls for reserved for its seat (Target), the rest as substitutes
 *   Library  "Add / move to group" lists a draft deck, and no "Finalize a deck first" is left anywhere
 *   G3c      the hero badge reads Commander + 99 live; a copy in the draft is one Library row, not two
 *   Model    the model's own rule is in tests/collection-model.mjs (a draft deck reserves and holds copies)
 *
 * Needs Playwright (GEOMETRY_REQUIRED=1 makes its absence a failure).
 */
import assert from "node:assert/strict";
import {readFileSync, mkdirSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {openBrowser} from "./uat/browser-runner.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let checks = 0;
const ok = (c, m) => {assert.ok(c, m); checks += 1;};
const eq = (a, b, m) => {assert.deepEqual(a, b, m); checks += 1;};
const SHOTS = process.env.UAT_SHOTS || "";
if (SHOTS) mkdirSync(SHOTS, {recursive: true});
const shot = async (page, name) => {if (SHOTS) await page.screenshot({path: path.join(SHOTS, `${name}.png`)});};

/* Nothing in the app says "Finalize a deck first" any more, except where a finished list really is the point. */
{
  const src = readFileSync(path.join(ROOT, "crankmagic-collection.js"), "utf8");
  eq((src.match(/Finalize a deck first — a draft holds no/g) || []).length, 0, "no \"Finalize a deck first — a draft holds no …\" is left in the Library");
  eq((src.match(/(finals|decks)=C\.state\.decks\.filter\(d=>!d\.archived&&d\.status==='final'\)/g) || []).length, 2, "of the Library's deck lists, only Ready to add's two (the roster menu and its picker, which read a finished list) are limited to finalized decks: the others that put copies in a deck list every deck");
}

/* The cards: Quintorius and eight cards the catalog has in full. */
const records = JSON.parse(readFileSync(path.join(ROOT, "data", "cards.json"), "utf8")).cards;
const leader = records.find((c) => /^Quintorius, Loremaster$/.test(c.name));
const others = records.filter((c) => !c.name.includes("//") && (c.colorIdentity || []).every((x) => ["R", "W"].includes(x)) && c.name !== leader.name && !/Basic Land/.test(c.typeLine || "")).slice(0, 8);
const LIST = [leader, ...others].map((c) => `1 ${c.name}`).join("\n");

const {browser, base, stub, close} = await openBrowser({name: "deck-holds-cards", flag: "GEOMETRY_REQUIRED"});
try {
  const context = await browser.newContext({viewport: {width: 1280, height: 900}, serviceWorkers: "block"});
  const page = await context.newPage();
  if (stub) await stub(page);
  await page.addInitScript(() => (globalThis.CrankFeatures ||= []).push((C) => {globalThis.__cm = C;}));

  /* UPLOAD: the owned cards into a new group */
  await page.goto(`${base}/index.html#cards`);
  await page.locator(".cm-subnav a", {hasText: "Upload cards"}).waitFor({timeout: 60000});
  await page.locator(".cm-subnav a", {hasText: "Upload cards"}).click();
  await page.locator("#cm-dialog[open] h2", {hasText: "Import cards or a deck list"}).waitFor();
  await page.selectOption("#cm-dialog [name=mode]", "owned");
  await page.fill("#cm-dialog [name=name]", "Quintorius pile");
  await page.fill("#cm-dialog textarea[name=text]", LIST);
  await page.click("#cm-dialog button[type=submit]");
  await page.locator("#cm-dialog[open] h2", {hasText: "Review import"}).waitFor({timeout: 60000});
  await page.click("#cm-import-commit");
  await page.waitForFunction(() => globalThis.__cm.state.groups.some((g) => g.name === "Quintorius pile") && globalThis.__cm.state.lots.length >= 9, null, {timeout: 30000});
  const before = await page.evaluate(() => {const g = globalThis.__cm.state.groups.find((x) => x.name === "Quintorius pile"); return {gid: g.id, bench: globalThis.__cm.state.lots.filter((l) => l.groupIds.includes(g.id) && l.location?.kind === "bench").length};});
  eq(before.bench, 9, "the 9 owned cards are on the Bench, filed in the new group");

  /* DECK: New deck › Create › The cards in a collection group › the group */
  await page.goto(`${base}/index.html#decks`);
  await page.locator("[data-action=new-deck]").first().waitFor({timeout: 60000});
  await page.locator("[data-action=new-deck]").first().click();
  await page.locator("#cm-dialog [data-action=wizard-create]").click();
  await page.selectOption("#cm-dialog [name=how]", "group");
  await page.selectOption("#cm-dialog [name=groupId]", before.gid);
  ok(/draft deck whose list is the 9 cards in Quintorius pile/.test(await page.locator("#cm-new-deck-road").innerText()), "the wizard says what Continue makes: a draft deck whose list is the group's 9 cards");
  await page.click("#cm-dialog button[type=submit]");
  await page.locator("#cm-dialog[open] h2", {hasText: "New deck from Quintorius pile"}).waitFor();
  const move = page.locator("#cm-dialog [name=move]");
  ok(await move.isChecked() && /Put the 9 copies you own from Quintorius pile \(now on the Bench\) in the deck's box/.test(await page.locator("#cm-dialog label.cm-checkbox").innerText()), "New deck from the group offers, ticked, to put the 9 copies in the deck's box");
  await shot(page, "new-deck-from-group-1280");
  await page.click("#cm-dialog button[type=submit]");
  await page.locator(".cm-deck-hero h1").waitFor({timeout: 30000});
  const after = await page.evaluate((gid) => {
    const C = globalThis.__cm, d = C.state.decks.find((x) => x.groupId === gid), read = C.M.stateReader(C.state);
    const mine = C.state.lots.filter((l) => l.groupIds.includes(gid));
    return {status: d.status, inBox: mine.filter((l) => l.location?.kind === "deck" && l.location.deckId === d.id).length,
      roles: [...new Set(mine.map((l) => read({...l, kind: "lot"}).role))], reserved: mine.filter((l) => l.allocation?.deckId === d.id).length, name: d.name};
  }, before.gid);
  eq([after.status, after.inBox, after.reserved, after.roles], ["draft", 9, 9, ["target"]], "the draft deck holds all 9 copies in its box, each reserved for its seat: Target, not Bench");
  await shot(page, "draft-deck-with-copies-1280");

  /* G3c: the badge reads Commander + 99 live, and the deck's More menu offers its Draft list, not an empty buy list */
  const legal = await page.locator(".cm-deck-hero .cm-legal-badge").innerText();
  eq(legal, "Not legal · Commander + 8 of 99", "the hero badge counts the commander and the 99 apart, live, on a draft");
  await page.locator("[data-action=deck-more-menu]").first().click();
  ok(await page.locator("[data-action=deck-cards]", {hasText: "Draft list (0)"}).count() === 1 && await page.locator("[data-action=deck-buy-list]").count() === 0, "More offers the Draft list (0: every seat has its copy), not a buy list a draft does not have");
  await page.keyboard.press("Escape");

  /* G3c: a copy put in the draft is one Library row, not a copy row and a Draft list row */
  await page.goto(`${base}/index.html#cards?deck=${encodeURIComponent(await page.evaluate((gid) => globalThis.__cm.state.decks.find((x) => x.groupId === gid).id, before.gid))}`);
  await page.locator(".cm-table tbody tr.cm-row-card").first().waitFor({timeout: 60000});
  const recs = await page.locator(".cm-table tbody tr.cm-row-card").evaluateAll((trs) => trs.map((t) => t.dataset.record));
  eq([recs.length, recs.filter((x) => x.startsWith("plan:")).length], [9, 0], "the deck's Library shows its 9 copies once each, and no Draft list row for a seat a copy fills");
  await page.evaluate((gid) => {const C = globalThis.__cm, d = C.state.decks.find((x) => x.groupId === gid); return C.inspector(C.state.lots.find((l) => l.groupIds.includes(gid) && !d.commanders.includes(l.cardId)).cardId);}, before.gid);
  await page.locator("#cm-dialog[open] .cm-standing").waitFor();
  const chips = await page.locator("#cm-dialog .cm-standing p").nth(1).locator("button").evaluateAll((bs) => bs.map((x) => x.title));
  eq(chips.length, 1, `the card's dialog gives the deck one Assignment chip, its copy, and no Draft list chip beside it (${chips.join(" | ")})`);
  await page.locator("#cm-dialog [data-action=close]").first().click();

  /* LIBRARY: Add / move to group lists the draft deck (G4 made it one action) */
  await page.goto(`${base}/index.html#cards`);
  await page.locator(".cm-table tbody tr input[type=checkbox]").first().waitFor({timeout: 60000});
  await page.locator(".cm-table tbody tr input[type=checkbox]").first().check();
  await page.locator("[data-action=batch-move]").first().click();
  await page.locator("#cm-dialog[open] h2", {hasText: "Add / move 1 record to a group"}).waitFor();
  const options = await page.locator("#cm-dialog [name=groupId] option").allInnerTexts();
  ok(options.includes("Quintorius pile · Commander deck"), `Add / move to group lists the draft deck's group (${options.join(", ")})`);
  await page.locator('#cm-dialog [data-action=close]').first().click();
  const did=await page.evaluate(gid=>__cm.state.decks.find(d=>d.groupId===gid).id,before.gid);
  const snapshot=()=>page.evaluate(()=>({lots:__cm.state.lots,decks:__cm.state.decks}));
  const initial=await snapshot();
  const owned=()=>page.evaluate(()=>__cm.M.counters(__cm.state).owned);
  const total=await owned();
  const cid=initial.decks.find(d=>d.id===did).slots.find(r=>!initial.decks.find(d=>d.id===did).commanders.includes(r.cardId)).cardId;
  const openRemove=async()=>{
    await page.goto(`${base}/index.html#cards?deck=${encodeURIComponent(did)}`);
    await page.locator('.cm-table tbody tr.cm-row-card').first().waitFor();
    const record=await page.evaluate(cid=>__cm.M.projection(__cm.state).find(r=>r.cardId===cid&&r.deckId).recordId,cid);
    await page.locator(`[data-action=row-actions][data-record="${record}"]`).click();
    await page.locator('.cm-row-menu:popover-open [data-action=remove-deck-card]').click();
    await page.locator('#cm-dialog[open] button[type=submit]').waitFor();
  };
  // Closing or reloading a review makes no change.
  await openRemove();await page.reload();await page.locator('.cm-table tbody tr.cm-row-card').first().waitFor();
  eq(await snapshot(),initial,'interrupted removal leaves the library untouched');
  await openRemove();
  // A second tab changes a real record while this tab is reviewing it.
  const second=await context.newPage();if(stub)await stub(second);
  await second.addInitScript(()=> (globalThis.CrankFeatures ||= []).push(C=>{globalThis.__cm=C;}));
  await second.goto(`${base}/index.html#decks?deck=${encodeURIComponent(did)}`);
  await second.locator('.cm-deck-hero h1').waitFor();
  await second.locator('[data-action=deck-more-menu]').first().click();
  await second.locator('.cm-menu:popover-open [data-action=edit-deck]').click();
  await second.fill('#cm-dialog [name=name]','Cloud acceptance deck');
  await second.click('#cm-dialog button[type=submit]');
  await page.waitForFunction(did=>__cm.state.decks.find(d=>d.id===did).name==='Cloud acceptance deck',did);
  await page.click('#cm-dialog button[type=submit]');
  ok(/changed/.test(await page.locator('#cm-dialog .cm-error').innerText()),'another tab invalidates the removal review');
  eq(await owned(),total,'stale review cannot change ownership');await second.close();
  await page.locator('#cm-dialog [data-action=close]').first().click();
  await openRemove();
  const beforeRemove=await snapshot();
  await page.locator('#cm-dialog button[type=submit]').evaluate(b=>{b.click();b.click();});
  await page.waitForFunction(({did,cid})=>!__cm.state.decks.find(d=>d.id===did).slots.some(r=>r.cardId===cid),{did,cid});
  eq(await owned(),total,'repeated removal clicks keep total ownership');
  ok(await page.evaluate(cid=>__cm.state.lots.filter(l=>l.cardId===cid).every(l=>!l.allocation&&l.location.kind==='bench'),cid),'removed copies return to the Bench');
  await page.getByRole('button',{name:'Undo',exact:true}).click();
  await page.waitForFunction(({did,cid})=>__cm.state.decks.find(d=>d.id===did).slots.some(r=>r.cardId===cid),{did,cid});
  eq(await snapshot(),beforeRemove,'Undo restores list, reservations and box locations together');
  await openRemove();await page.uncheck('#cm-dialog [name=returnToBench]');await page.click('#cm-dialog button[type=submit]');
  await page.waitForFunction(({did,cid})=>!__cm.state.decks.find(d=>d.id===did).slots.some(r=>r.cardId===cid),{did,cid});
  ok(await page.evaluate(cid=>__cm.state.lots.filter(l=>l.cardId===cid).every(l=>!l.allocation&&l.location.kind==='deck'),cid),'list-only removal preserves actual box location');
  await page.goto(`${base}/index.html#decks?deck=${encodeURIComponent(did)}`);await page.locator('.cm-deck-hero h1').waitFor();
  await page.locator('[data-action=deck-more-menu]').first().click();await page.locator('.cm-menu:popover-open [data-action=change-commander]').click();
  await page.fill('#cm-card-query','Krenko, Mob Boss');
  await page.locator('#cm-card-results button',{hasText:'Krenko, Mob Boss'}).first().click();
  await page.locator('#cm-dialog button[type=submit]').click();
  await page.waitForFunction(did=>__cm.state.decks.find(d=>d.id===did).commanders.some(id=>__cm.card(id).name==='Krenko, Mob Boss'),did);
  eq(await owned(),total,'changing commander does not invent a copy');
  await page.reload();await page.locator('.cm-deck-hero:not(.cm-skeleton) h1').waitFor();
  ok(await page.evaluate(did=>__cm.state.decks.find(d=>d.id===did).commanders.some(id=>__cm.card(id).name==='Krenko, Mob Boss'),did),'commander change survives reload');
  // A saved opt-out for archived decks cannot silently delete an active deck.
  await page.evaluate(()=>__cm.setSkip('deleteDeck',true));
  const beforeDelete=await snapshot();
  await page.locator('[data-action=deck-more-menu]').first().click();await page.locator('.cm-menu:popover-open [data-action=delete-deck]').click();
  await page.fill('#cm-dialog [name=confirm]','wrong name');await page.click('#cm-dialog button[type=submit]');
  ok(/exactly/.test(await page.locator('#cm-dialog .cm-error').innerText()),'deletion requires this deck name');
  await page.fill('#cm-dialog [name=confirm]','Cloud acceptance deck');await page.click('#cm-dialog button[type=submit]');
  await page.waitForFunction(did=>!__cm.state.decks.some(d=>d.id===did),did);
  eq(await owned(),total,'direct deletion preserves every owned copy');
  ok(await page.evaluate(()=>__cm.state.lots.every(l=>!l.allocation&&l.location.kind==='bench')),'deleted deck has no dangling reservation or box');
  await page.getByRole('button',{name:'Undo',exact:true}).click();
  await page.waitForFunction(did=>__cm.state.decks.some(d=>d.id===did),did);
  eq(await snapshot(),beforeDelete,'Undo restores the deleted deck and its exact copies');
  await page.setViewportSize({width:390,height:844});
  await page.goto(`${base}/index.html#decks?deck=${encodeURIComponent(did)}`);
  await page.locator('[data-action=deck-more-menu]').first().click();
  await page.locator('.cm-menu:popover-open [data-action=change-commander]').click();
  ok(await page.locator('#cm-card-query').isVisible(),'Change commander is reachable at phone width');
  await page.locator('#cm-dialog [data-action=close]').first().click();
  await page.locator('[data-action=deck-more-menu]').first().click();
  await page.locator('.cm-menu:popover-open [data-action=delete-deck]').click();
  ok(await page.locator('#cm-dialog [name=confirm]').isVisible(),'direct deletion is reachable at phone width');
  await page.locator('#cm-dialog [data-action=close]').first().click();
  eq(await snapshot(),beforeDelete,'canceling phone controls leaves the restored deck unchanged');
  await context.close();
} finally {
  await close();
}
console.log(`deck-holds-cards: ${checks} checks passed — owned cards uploaded into a group go into the draft deck made from it, reserved for their seats, with reviewed removal, commander changes, deletion, undo, reload, repeated clicks and stale-tab protection.`);
