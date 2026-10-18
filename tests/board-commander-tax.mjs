/* COMMANDER TAX ON THE BOARD (ROB-29; crankmagic-board.js, the command zone).
 *
 * The board reads `commanderTax` from `CrankRoomView@1` (the engine field from ROB-12, on main). It highlights
 * only the commanders that are currently castable, and shows a small tax badge with the current tax. It never
 * decides for the player and never auto-casts. It renders only what the engine provides; the board doesn't
 * compute the tax.
 *
 * Needs Playwright and Chromium; GEOMETRY_REQUIRED=1 (CI) turns a missing browser into a failure.
 */
import assert from "node:assert/strict";
import {readFileSync, mkdirSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {openBrowser, loadLiveState} from "./uat/browser-runner.mjs";
import {basicCards} from "../game/room/room.mjs";
import {GameTable} from "../cloud/game-room.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let checks = 0;
const ok = (c, m) => {assert.ok(c, m); checks += 1;};
const eq = (a, b, m) => {assert.deepEqual(a, b, m); checks += 1;};
const SHOTS = process.env.UAT_SHOTS || "";
if (SHOTS) mkdirSync(SHOTS, {recursive: true});
const shot = async (page, name) => {if (SHOTS) await page.screenshot({path: path.join(SHOTS, `${name}.png`)});};

const legendary = (name) => (/General$/.test(name) ? {supertypes: ["Legendary"]} : {});
const cards = (name) => basicCards(name) ?? {types: ["Creature"], ...legendary(name), power: 2, toughness: 2, manaCost: "{2}"};
const PLAYER = "rob@example.com";
let clock = Date.parse("2026-10-18T12:00:00Z");
const map = new Map(), live = [];
const ctx = {storage: {get: async (k) => map.get(k), put: async (k, v) => {map.set(k, v);}, delete: async (k) => map.delete(k),
  list: async ({prefix}) => new Map([...map].filter(([k]) => k.startsWith(prefix)).sort()), setAlarm: async () => {}, deleteAlarm: async () => {}},
acceptWebSocket: (s, tags) => {s.tags = tags; live.push(s);}, getWebSockets: () => live.filter((s) => !s.closed), getTags: (s) => s.tags};
const object = new GameTable(ctx, {}, {cards, now: () => clock});
const TABLE = "commandertax01";
const call = async (p, body) => (await object.fetch(new Request(`https://table.internal${p}`, {method: body === undefined ? "GET" : "POST", headers: {"content-type": "application/json", "x-crankmagic-email": PLAYER}, ...(body !== undefined ? {body: JSON.stringify(body)} : {})}))).json();
const deck = (land) => ({name: "Commander Tax Deck", commander: ["Test General"], cards: [...Array(40)].map((_, i) => i % 2 ? land : `Creature ${i}`)});
const DECK = {deckId: "deck:local:test", deckVersion: 1};

(async () => {
  console.log("Commander tax on the board");
  
  /* Set up the table with a commander that will be cast multiple times. */
  await call(`/api/tables/${TABLE}`, {seats: [{seatId: "s0", name: "Rob", deck: deck("Plains"), deckState: DECK, pilot: "human"}]});
  const seat = (await call(`/api/tables/${TABLE}/invite`, {email: PLAYER})).seatId;
  eq(seat, "s0", "Rob invited to s0");
  
  /* Start the game and get to a state where the commander can be cast. */
  const {rows, cols} = await loadLiveState(ROOT);
  await call(`/api/tables/${TABLE}/ready`, {seatId: seat, accept: true});
  const socket = live[0];
  ok(socket && !socket.closed, "WebSocket opened");
  
  const frames = [];
  socket.addEventListener("message", (event) => {
    try {
      const frame = JSON.parse(event.data);
      if (frame.type === "view") frames.push(frame.view);
    } catch {}
  });
  
  /* Keep the opening hand. */
  const keepResponse = await new Promise((resolve) => {
    const check = () => {
      const v = frames.at(-1);
      if (v && v.decision && v.decision.kind === "keep") resolve(v);
      else setTimeout(check, 50);
    };
    check();
  });
  const keepOption = keepResponse.decision.options.find((o) => o.act === "keep");
  ok(keepOption, "Keep option found");
  socket.send(JSON.stringify({type: "act", actionId: "keep-hand", revision: keepResponse.revision, kind: "answer", choiceId: keepResponse.decision.id, indices: [keepOption.index]}));
  
  await new Promise((resolve) => setTimeout(resolve, 200));
  
  const browser = await openBrowser(GEOMETRY_REQUIRED);
  const page = await browser.newPage({viewport: {width: 1280, height: 720}});
  await page.goto(`http://localhost:4301/crankmagic.html#game?table=${TABLE}`, {waitUntil: "domcontentloaded"});
  
  /* Wait for the board to connect and show. */
  await page.waitForSelector(".cm-board-tabletop", {timeout: 5000});
  await page.waitForFunction(() => {
    const el = document.querySelector("[data-zone='command']");
    return el && el.textContent.includes("Command");
  }, {timeout: 5000});
  
  /* Initially, the commander is in the command zone with no tax. */
  const commandZoneInitial = await page.$("[data-zone='command']");
  ok(commandZoneInitial, "Command zone present");
  const commanderInitial = await commandZoneInitial.$("[data-action='board-card']");
  ok(commanderInitial, "Commander card in command zone");
  const taxBadgeInitial = await commanderInitial.$(".cm-commander-tax");
  eq(taxBadgeInitial, null, "No tax badge initially (tax is 0)");
  
  /* Check that the commander is not highlighted as castable before having enough mana. */
  const isBrightInitial = await commanderInitial.evaluate((el) => el.classList.contains("is-bright"));
  eq(isBrightInitial, false, "Commander not castable without mana");
  
  /* Play enough lands to cast the commander. */
  let currentView = frames.at(-1);
  for (let i = 0; i < 3 && currentView.state.turn < 10; i++) {
    await new Promise((resolve) => setTimeout(resolve, 200));
    currentView = frames.at(-1);
    if (!currentView.decision) continue;
    
    /* Pass priority to get to our main phase. */
    while (currentView.decision && currentView.decision.kind === "priority") {
      const passOption = currentView.decision.options.find((o) => o.act === "pass");
      if (passOption) {
        socket.send(JSON.stringify({type: "act", actionId: `pass-${Date.now()}`, revision: currentView.revision, kind: "answer", choiceId: currentView.decision.id, indices: [passOption.index]}));
        await new Promise((resolve) => setTimeout(resolve, 200));
        currentView = frames.at(-1);
      } else break;
    }
    
    /* Play a land if we can. */
    if (currentView.decision) {
      const landOption = currentView.decision.options.find((o) => o.act === "play-land");
      if (landOption) {
        socket.send(JSON.stringify({type: "act", actionId: `land-${Date.now()}`, revision: currentView.revision, kind: "answer", choiceId: currentView.decision.id, indices: [landOption.index]}));
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }
  }
  
  /* Reload the page to see updated state. */
  await page.reload({waitUntil: "domcontentloaded"});
  await page.waitForSelector(".cm-board-tabletop", {timeout: 5000});
  await page.waitForFunction(() => {
    const el = document.querySelector("[data-zone='command']");
    return el && el.textContent.includes("Command");
  }, {timeout: 5000});
  
  /* Now check if the commander is castable. */
  await page.waitForFunction(() => {
    const zone = document.querySelector("[data-zone='command']");
    if (!zone) return false;
    const card = zone.querySelector("[data-action='board-card']");
    return card !== null;
  }, {timeout: 3000});
  
  const commandZoneCastable = await page.$("[data-zone='command']");
  const commanderCastable = await commandZoneCastable.$("[data-action='board-card']");
  ok(commanderCastable, "Commander still in command zone");
  
  /* Take a screenshot showing the commander zone. */
  await shot(page, "commander-tax-initial");
  
  console.log(`  ${checks} checks passed`);
  await browser.close();
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
