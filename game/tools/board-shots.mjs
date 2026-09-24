/* A DEVELOPED BOARD, ON DEMAND, PHOTOGRAPHED AND CHECKED.
 *
 * qa-pod.mjs plays a real game against the native AI, and that is the only way to see real engine
 * state -- but its runs reach turn two to four with little on the battlefield, so "two rows with real
 * creatures" had never been seen. This loads the board page with a FIXTURE instead: the 2026-09-24
 * Play Focus Mock's Krenko goblins (fourteen permanents, seven lands, a hand, three opponents), with
 * real card images from data/cards.json. It photographs Focus, and optionally the four-up and a table
 * notice, and it FAILS -- exit 1 -- when a card on the focused mat is not the commander's size or sits
 * below its zone's bottom edge (Rob, 2026-09-24; docs/decisions-2026-09-24.md).
 *
 *   node game/tools/board-shots.mjs --out shots/ [--port 8778] [--sizes 1920x1080,1440x900]
 *                                  [--table] [--notice]
 *
 * Needs a review host on --port (`COMMANDER_PORT=8778 COMMANDER_GUEST_PORT=8779 node
 * game/tools/serve-review.mjs`), Playwright (UAT_PLAYWRIGHT) and Chrome (UAT_CHROME).
 *
 * TWO THINGS IT CHANGES ON THE PAGE, both only here: the replay's hardcoded seat names become the
 * mock's (a live game replaces them with the seats' own), and the notice renderer is reachable from
 * the page so --notice can show one, since a replay never raises a notice by itself.
 *
 * DO NOT RUN IT AGAINST A HOST WITH A LIVE GAME. The page joins a live table when there is one and
 * shows that instead of the fixture; it refuses rather than photograph the wrong board.
 */
import {createRequire} from "node:module";
import {readFileSync, mkdirSync, writeFileSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const argv = new Map();
for (let i = 2; i < process.argv.length; i += 1) {
  const key = process.argv[i].replace(/^--/, ""), value = process.argv[i + 1];
  if (value === undefined || value.startsWith("--")) argv.set(key, true); else { argv.set(key, value); i += 1; }
}
const out = argv.get("out");
if (!out) { console.error("board-shots: --out <directory> is required"); process.exit(2); }
const port = Number(argv.get("port") || 8778);
const sizes = String(argv.get("sizes") || "1920x1080").split(",").map((s) => s.split("x").map(Number));
mkdirSync(out, {recursive: true});
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.UAT_PLAYWRIGHT || "playwright");

/* THE FIXTURE. */
const catalog = JSON.parse(readFileSync(path.join(REPO, "data", "cards.json"), "utf8"));
const byName = new Map((catalog.cards || catalog).map((c) => [c.name, c]));
let nextId = 100;
const card = (name, o = {}) => {
  const c = byName.get(name);
  if (!c) throw new Error(`board-shots: "${name}" is not in data/cards.json`);
  return {cardId: nextId++, name, typeLine: c.typeLine, oracleText: c.oracleText, manaCost: c.manaCost, power: c.power,
    toughness: c.toughness, colorIdentity: c.colorIdentity, art: c.image, tapped: !!o.tapped};
};
const token = () => ({cardId: nextId++, name: "Goblin", typeLine: "Token Creature — Goblin", oracleText: "", power: "1",
  toughness: "1", token: true, tapped: false, art: "https://cards.scryfall.io/normal/front/1/4/1425e965-7eea-419c-a7ec-c8169fa9edbf.jpg"});
const zone = (cards) => ({count: cards.length, cards});
const player = (playerId, name, life, z) => ({playerId, name, health: {life, poison: 0, commanderDamageMax: 0, status: "playing"}, mana: [],
  zones: {Hand: z.Hand || {count: 7, cards: []}, Battlefield: zone(z.Battlefield || []), Graveyard: zone(z.Graveyard || []),
    Exile: zone(z.Exile || []), Library: {count: 87, cards: []}, Command: zone(z.Command || [])}});
const players = [
  player(0, "Rob", 40, {Command: [card("Krenko, Mob Boss")],
    Battlefield: [card("Goblin Chieftain"), card("Goblin Warchief"), card("Skirk Prospector"), card("Goblin Matron"), card("Mogg War Marshal"),
      token(), token(), token(), token(), token(), card("Sol Ring", {tapped: true}), card("Thornbite Staff"), card("Shared Animosity"),
      card("Impact Tremors"), card("Mountain", {tapped: true}), card("Mountain", {tapped: true}), card("Mountain", {tapped: true}),
      card("Mountain"), card("Mountain"), card("Battlefield Forge"), card("Kher Keep", {tapped: true})],
    Hand: zone([card("Goblin Bombardment"), card("Lightning Bolt"), card("Mountain"), card("Krenko's Command"), card("Thousand-Year Elixir"),
      card("Purphoros, God of the Forge"), card("Warstorm Surge")]),
    Graveyard: [card("Abrade"), card("Big Score"), card("Cinder Strike")], Exile: [card("Goblin Ringleader")]}),
  player(1, "Nina", 38, {Command: [card("Chulane, Teller of Tales")], Battlefield: [card("Forest"), card("Island"), card("Plains"),
    card("Forest", {tapped: true}), card("Llanowar Elves"), card("Birds of Paradise")]}),
  player(2, "Sam", 40, {Command: [card("Atraxa, Praetors' Voice")], Battlefield: [card("Forest"), card("Swamp"), card("Island"),
    card("Command Tower"), card("Arcane Signet")]}),
  player(3, "Jo", 35, {Command: [card("Shadrix Silverquill")], Battlefield: [card("Plains"), card("Swamp"), card("Island"), card("Orzhov Signet")]}),
];
const cast = (sequence, text) => ({eventId: "e" + sequence, sequence, turn: 4, kind: "GameEventSpellAbilityCast", fields: {sa: {description: text}}});
const fixture = {frames: [{sequence: 50, turn: 4, phase: "MAIN1", turnPlayerId: 0, priorityPlayerId: 0, stack: [], stackSize: 0, combat: null, players}],
  log: [cast(40, "Seat 2 cast Swords to Plowshares on Goblin Warchief — fizzled"), cast(41, "You tapped Krenko: created 4 Goblins"),
    cast(42, "Seat 4 drained 1 from each opponent"), cast(43, "Seat 3 cast Cultivate"), cast(44, "Seat 2 attacked you — blocked by Goblin token"),
    cast(45, "You drew Lightning Bolt"), cast(46, "You played Battlefield Forge")],
  pod: {podHash: "board-shots", seats: [{deck: {name: "Krenko", total: 100, commanders: [{name: "Krenko, Mob Boss",
    art: {normal: byName.get("Krenko, Mob Boss").image}, typeLine: "Legendary Creature — Goblin Warrior", colorIdentity: ["R"]}], library: []}}]}};

/* Headless Chromium hides scroll bars by default, and a zone's sideways bar is part of what is judged. */
const browser = await chromium.launch({headless: true, executablePath: process.env.UAT_CHROME, ignoreDefaultArgs: ["--hide-scrollbars"]});
const failures = [];
try {
  for (const [width, height] of sizes) {
    const page = await browser.newPage({viewport: {width, height}});
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e.message)));
    await page.route("**/match.json", (r) => r.fulfill({contentType: "application/json", body: JSON.stringify(fixture)}));
    await page.route("**/review.mjs", async (r) => r.fulfill({contentType: "text/javascript", body: (await (await r.fetch()).text())
      .replace("const names=['You · Chulane','Krenko','Atraxa','Shadrix'];", "const names=['You · Rob','Seat 2 · Nina','Seat 3 · Sam','Seat 4 · Jo'];")
      + ";window.__showNotice=(...rows)=>{noticeQueue.push(...rows);showNextNotice();};"}));
    await page.goto(`http://127.0.0.1:${port}/review`);
    await page.waitForSelector("#seat-0 .player-mat", {state: "attached", timeout: 30000});
    await page.waitForTimeout(1500);
    if (await page.evaluate(() => /LIVE/.test(document.querySelector(".focus-eyebrow")?.textContent || "") || /Live table connected/.test(document.body.innerText))) {
      console.error(`board-shots: the host on ${port} has a live game, and the page shows it instead of the fixture. Use a host with no game.`);
      process.exitCode = 2;
      break;
    }
    const tag = `${width}x${height}`;
    if (argv.get("table")) {
      /* What review.mjs does when a live game starts: leave the setup screen for the table. */
      await page.waitForSelector("#game-setup[open]", {timeout: 15000}).catch(() => {});
      await page.evaluate(() => { document.body.classList.remove("setup-screen"); document.getElementById("game-setup")?.close?.(); });
      await page.waitForTimeout(1500);
      await page.screenshot({path: path.join(out, `table-${tag}.png`)});
    }
    if (argv.get("notice")) {
      const id = await page.evaluate(() => [...document.querySelectorAll(".card[data-card-id]")].find((n) => /Mountain/.test(n.getAttribute("aria-label") || ""))?.dataset.cardId);
      await page.evaluate((id) => window.__showNotice({playerId: 0, name: "Mountain", label: "Drew a card", cardId: Number(id)},
        {playerId: 1, name: "Swords to Plowshares", label: "Cast a spell", cardId: null}), id);
      await page.waitForTimeout(800);
      const box = await (await page.$("#table-notice")).boundingBox();
      await page.screenshot({path: path.join(out, `notice-${tag}.png`), clip: {x: box.x - 40, y: box.y - 40, width: box.width + 80, height: box.height + 80}});
      await page.click("#table-notice .table-notice-ack");
    }
    await page.evaluate(() => document.getElementById("view-hand").click());
    await page.waitForSelector("#focus[open]");
    await page.waitForTimeout(1500);
    await page.screenshot({path: path.join(out, `focus-${tag}.png`)});
    const facts = await page.evaluate(() => {
      const mat = document.querySelector("#focus .focus-mat-stage .player-mat"), r = mat.getBoundingClientRect();
      /* offsetWidth, not the bounding box: a tapped card is turned, not resized. */
      const widths = [...mat.querySelectorAll(".mat-zone .card, .mat-pile > img, .mat-pile .library-back")].map((n) => n.offsetWidth);
      const below = [...mat.querySelectorAll(".mat-zone")].flatMap((zoneNode) => [...zoneNode.querySelectorAll(".card")]
        .filter((c) => c.getBoundingClientRect().bottom > zoneNode.getBoundingClientRect().bottom + 1)
        .map((c) => c.getAttribute("aria-label")));
      return {mat: [Math.round(r.width), Math.round(r.height)], cardWidth: mat.style.getPropertyValue("--mat-card-width"),
        widths: [...new Set(widths)], below, lanes: !!mat.querySelector(".mat-battlefield .lanes")};
    });
    writeFileSync(path.join(out, `focus-${tag}.json`), JSON.stringify({...facts, pageErrors: errors}, null, 2));
    console.log(`board-shots ${tag}: mat ${facts.mat.join("x")}, every card ${facts.cardWidth}, two lanes ${facts.lanes ? "yes" : "no"}, page errors ${errors.length}`);
    if (facts.widths.length !== 1) failures.push(`${tag}: cards on the focused mat come in ${facts.widths.length} widths (${facts.widths.join(", ")}px)`);
    if (facts.below.length) failures.push(`${tag}: ${facts.below.length} card(s) below a zone's bottom edge: ${facts.below.join("; ")}`);
    if (errors.length) failures.push(`${tag}: page errors: ${errors.join(" | ")}`);
    await page.close();
  }
} finally {
  await browser.close();
}
for (const failure of failures) console.error("board-shots: FAIL " + failure);
if (failures.length) process.exitCode = 1;
