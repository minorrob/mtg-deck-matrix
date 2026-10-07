/* PLAY IN THE CLOUD, END TO END -- the staging release's Play under `wrangler dev --local` (M5, the Play release).
 *
 * Builds the staging profile from the working tree -- Play in the cloud, the Worker cloud/play-worker.mjs with the
 * table as a Durable Object carrying the rules engine -- and runs it as Cloudflare would: workerd, the real bundle,
 * a local D1 and local Durable Objects. The Access token is signed by a key this run makes (as tests/uat/cloud-e2e.mjs
 * does), and put on every request -- the table's WebSocket included -- by a small proxy in front of the Worker, as
 * Access does at the edge: a page cannot set a header on a WebSocket. Then, as Rob:
 *
 *   1. the Play tab is the table's page, not Coming Soon, and the local game host's modules are not in the page
 *   2. a table with an AI seat: it is a playtest table (staging's PLAYTEST_TABLES); decks the engine can play
 *      today (basic lands: every other card waits on M4's definitions, and is refused by name); ready; start
 *   3. the countdown ends on the object's alarm and the game is on; the board opens over the table's WebSocket
 *   4. End game for everyone; the game-over panel offers Download the full record, and the file is the whole
 *      game, which the M8a replayer plays again to the same end
 *   5. a real deck's cards are refused by name, as the engine cannot play them yet
 *   6. two people and an AI from a library backup: each restores it in Settings; the host invites; the newcomer, a
 *      second Access identity, joins by the link, sees which decks the table can play, and takes one; both play the
 *      first turns; a reload mid-game returns to the board; End game; the record replays to the same end
 *   7. at a third table the host, the only person, concedes, and the game ends there instead of the AI seats playing on
 *
 *   node tests/uat/play-e2e.mjs      (WRANGLER=<wrangler.js>, UAT_PLAYWRIGHT, UAT_CHROME, UAT_SHOTS as for the other walks)
 */
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {spawn, spawnSync} from "node:child_process";
import http from "node:http";
import net from "node:net";
import {mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync} from "node:fs";
import os from "node:os";
import path from "node:path";
import {build, worktreeSource} from "../../tools/release-pages.mjs";
import {replayTape} from "../../game/room/replay.mjs";
import {tableCards} from "../../cloud/game-room.mjs";
import {NO_PERSON_REASON} from "../../game/room/room.mjs";

const require = createRequire(import.meta.url);
const playwright = require(process.env.UAT_PLAYWRIGHT || "playwright");
/* The browser UAT_BROWSER names (the matrix, browser-runner.mjs); Chromium by default. */
const {launchBrowser} = await import("./browser-runner.mjs");
const WRANGLER = process.env.WRANGLER;
if (!WRANGLER) { console.error("play-e2e: set WRANGLER to an installed wrangler's bin/wrangler.js (docs/release-pages.md, Tooling on a fresh machine)"); process.exit(2); }
const PORT = Number(process.env.E2E_PORT || 8797), WORKER_PORT = PORT + 1, BASE = `http://crankmagic.localhost:${PORT}`;
const TEAM = "e2e.cloudflareaccess.com", AUD = "e2e-audience", EMAIL = "rob@e2e.test";
let checks = 0;
const ok = (value, message) => {assert.ok(value, message); checks++; console.log(`  ok  ${message}`);};
const eq = (a, b, message) => {assert.deepEqual(a, b, message); checks++; console.log(`  ok  ${message}`);};

/* The build, with test Access values, in site/ with its configuration beside it (see cloud-e2e). */
const dir = mkdtempSync(path.join(os.tmpdir(), "crankmagic-play-e2e-")), site = path.join(dir, "site");
const {built, problems} = build({source: worktreeSource(), profileName: "cloud-staging"});
eq(problems, [], "the staging release with Play builds and verifies");
for (const [f, body] of built) {mkdirSync(path.dirname(path.join(site, f)), {recursive: true}); writeFileSync(path.join(site, f), body);}
const config = JSON.parse(built.get("wrangler.jsonc").toString("utf8"));
eq([config.main, config.durable_objects.bindings[0].name, config.vars.PLAYTEST_TABLES], ["cloud/play-worker.mjs", "TABLES", "on"], "its Worker is Play's, binds TABLES, and its tables are playtest tables");
config.vars = {...config.vars, ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD};
/* THE LOCAL RUNTIME'S DATE. A tree built from the worktree is dated today in UTC, and wrangler's local runtime refuses
   a compatibility date newer than its own build knows; an installed wrangler is days older than today, so every run
   just after midnight UTC failed before the Worker started. The test tree runs at the runtime's own date when it is
   older. The release itself is untouched: it is dated by its commit and runs on Cloudflare's current runtime. */
const runtimeDate = createRequire(WRANGLER)("workerd").compatibilityDate;
if (config.compatibility_date > runtimeDate) config.compatibility_date = runtimeDate;
config.main = `site/${config.main}`;
config.assets = {...config.assets, directory: "./site"};
config.d1_databases = config.d1_databases.map((d) => ({...d, migrations_dir: `site/${d.migrations_dir}`}));
delete config.routes;
writeFileSync(path.join(dir, "wrangler.jsonc"), JSON.stringify(config, null, 2));
const state = path.join(dir, "state");

const {publicKey, privateKey} = await crypto.subtle.generateKey({name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256"}, true, ["sign", "verify"]);
const jwks = JSON.stringify({keys: [{...await crypto.subtle.exportKey("jwk", publicKey), kid: "e2e"}]});
const b64 = (v) => Buffer.from(typeof v === "string" ? v : JSON.stringify(v)).toString("base64url");
async function token() {
  const now = Math.floor(Date.now() / 1000), head = b64({alg: "RS256", kid: "e2e"}), body = b64({aud: [AUD], iss: `https://${TEAM}`, email: EMAIL, iat: now, exp: now + 7200});
  return `${head}.${body}.${Buffer.from(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", privateKey, new TextEncoder().encode(`${head}.${body}`))).toString("base64url")}`;
}

const env = {...process.env, CI: "1", WRANGLER_SEND_METRICS: "false"};
const migrate = spawnSync(process.execPath, [WRANGLER, "d1", "migrations", "apply", config.d1_databases[0].database_name, "--local", "--persist-to", state], {cwd: dir, env, encoding: "utf8"});
if (migrate.status !== 0) throw Error(`the local migration failed:\n${migrate.stdout}\n${migrate.stderr}`);
const server = spawn(process.execPath, [WRANGLER, "dev", "--local", "--ip", "127.0.0.1", "--port", String(WORKER_PORT), "--persist-to", state, "--var", `ACCESS_JWKS:${jwks}`], {cwd: dir, env});
let serverLog = "";
await new Promise((resolve, reject) => {
  const done = setTimeout(() => reject(Error(`wrangler dev did not start:\n${serverLog.slice(-2000)}`)), 120000);
  const watch = (chunk) => {serverLog += chunk; if (/Ready on|ready on/.test(serverLog)) {clearTimeout(done); resolve();}};
  server.stdout.on("data", watch); server.stderr.on("data", watch);
  server.on("exit", (code) => reject(Error(`wrangler dev exited (${code}):\n${serverLog}`)));
});

/* ACCESS, AS THE EDGE DOES IT: every request and every WebSocket upgrade reaches the Worker with the token. */
const proxy = http.createServer(async (req, res) => {
  const upstream = http.request({host: "127.0.0.1", port: WORKER_PORT, method: req.method, path: req.url, headers: {...req.headers, "cf-access-jwt-assertion": await token()}}, (r) => {res.writeHead(r.statusCode, r.headers); r.pipe(res);});
  upstream.on("error", () => {try {res.writeHead(502); res.end();} catch {}});
  req.pipe(upstream);
});
proxy.on("upgrade", async (req, socket, head) => {
  const upstream = net.connect(WORKER_PORT, "127.0.0.1", async () => {
    const headers = {...req.headers, "cf-access-jwt-assertion": await token()};
    upstream.write(`${req.method} ${req.url} HTTP/1.1\r\n${Object.entries(headers).map(([k, v]) => `${k}: ${v}`).join("\r\n")}\r\n\r\n`);
    if (head && head.length) upstream.write(head);
    upstream.pipe(socket); socket.pipe(upstream);
  });
  upstream.on("error", () => socket.destroy()); socket.on("error", () => upstream.destroy());
});
await new Promise((r) => proxy.listen(PORT, "127.0.0.1", r));

const SHOTS = process.env.UAT_SHOTS || "";
if (SHOTS) mkdirSync(SHOTS, {recursive: true});
const browser = await launchBrowser(playwright);
const errors = [];
const shot = async (page, name) => {if (SHOTS) await page.screenshot({path: path.join(SHOTS, `play-${name}.png`)});};
const until = async (what, fn, timeout = 30000) => {const end = Date.now() + timeout; for (;;) {const v = await fn(); if (v) return v; if (Date.now() > end) throw Error(`timed out waiting for ${what}`); await new Promise((r) => setTimeout(r, 500));}};

try {
  const context = await browser.newContext({viewport: {width: 1400, height: 900}, acceptDownloads: true});
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  const {stubNetwork} = await import("./scryfall-stub.mjs"); await stubNetwork(page, []);
  /* The API as the app calls it: from the page, with Play's header on a write. */
  const api = (method, p, body) => page.evaluate(async ([m, u, b]) => {
    const r = await fetch(u, {method: m, cache: "no-store", ...(m === "GET" ? {} : {headers: {"content-type": "application/json", "x-crankmagic": "play"}, body: JSON.stringify(b || {})})});
    return {status: r.status, json: await r.json().catch(() => null)};
  }, [method, p, body]);

  /* 1. The Play tab. */
  await page.goto(`${BASE}/index.html#game`);
  await page.locator("#cm-main").getByText(/table/i).first().waitFor({timeout: 60000});
  const text = await page.locator("#cm-main").evaluate((el) => el.textContent);
  ok(!/Coming Soon/.test(text), "the Play tab is not Coming Soon on staging");
  ok(await page.locator(".cm-cloud-table, [data-action^=table-]").count() > 0, `it is the table's page: ${text.replace(/\s+/g, " ").trim().slice(0, 90)}…`);
  eq(await page.evaluate(() => [...document.scripts].map((s) => s.src).filter((s) => /crankmagic-(game|lobby|online)\.js|collection-lobby-draft/.test(s))), [], "and the local game host's modules are not in the page");
  await shot(page, "tab-1400");

  /* 2. A table, an AI seat, decks the engine can play today. */
  const made = await api("POST", "/api/tables", {hostName: "Rob", seats: [{kind: "ai", name: "Bot"}]});
  eq([made.status, made.json.table.playtest, made.json.table.youAreHost], [201, true, true], "Rob makes a table with an AI seat, and on staging it is a playtest table");
  const id = made.json.table.tableId, url = `/api/tables/${id}`;
  const refused = await api("POST", `${url}/deck`, {seatId: 0, deck: {name: "Quintorius", commander: ["Quintorius, Loremaster"], cards: ["Cyclonic Rift", "Forest"]}});
  eq([refused.status, refused.json.unsupported], [422, ["Cyclonic Rift"]], "only undefined cards are refused by name; Quintorius is supported");
  /* M5 (the plan review's C4): the table plays the engine's own definitions -- a deck wholly of them takes a seat, and
     the table says which names it does not know. */
  eq((await api("POST", `${url}/known`, {names: ["Krenko, Mob Boss", "Lightning Bolt", "Cyclonic Rift"]})).json.unknown, ["Cyclonic Rift"], "asked which names it cannot play, the table names only the undefined one");
  const whole = await api("POST", `${url}/deck`, {seatId: 0, deck: {name: "Goblins", commander: ["Krenko, Mob Boss"], cards: [...Array(40).fill("Mountain"), "Lightning Bolt", "Blasphemous Act", "Sol Ring"]}});
  eq(whole.status, 200, "a deck wholly of the engine's own definitions takes a seat at the playtest table");
  /* The lobby, drawn from the release's own modules (Rob, 2026-09-29: it opened on "reading 'statusPill'"). */
  await page.goto(`${BASE}/index.html#table?id=${id}`);
  await page.locator(".cm-cloud-table .cm-lobby-seat").nth(1).waitFor({timeout: 30000});
  eq([await page.locator(".cm-cloud-table .cm-lobby-seat").count(), await page.locator("#cm-table-refused").count(), await page.locator(".cm-cloud-table .cm-seat-pill").count()], [2, 0, 2], "the lobby opens and draws both seats, each with its status");
  /* THE BASIC LANDS TEST DECK (Rob, 2026-09-29), chosen in the table's own dialog, for Rob's seat and the AI's. */
  /* Seat 1 already holds the Goblins deck taken above, so its button says Change deck (crankmagic-table.js); seat 2's
     says Choose its deck. */
  for (const [seat, button] of [[0, /^(Choose a deck|Change deck)$/], [1, /^(Choose its deck|Change deck)$/]]) {
    await page.locator(`.cm-lobby-seat[data-seat="${seat}"]`).getByRole("button", {name: button}).click();
    await page.locator("#cm-dialog [data-action=table-use-test-deck]").waitFor({timeout: 15000});
    if (!seat) await shot(page, "test-deck-1400");
    await page.locator("#cm-dialog [data-action=table-use-test-deck]").click();
    await page.locator(`.cm-lobby-seat[data-seat="${seat}"] .cm-seat-line`, {hasText: "Basic lands test deck"}).waitFor({timeout: 15000});
  }
  const seats = (await api("GET", url)).json.table.seats;
  eq(seats.map((s) => s.deck && s.deck.name), ["Basic lands test deck", "Basic lands test deck"], "on this playtest table the deck dialog offers the basic lands test deck, and both seats take it");
  await shot(page, "lobby-1400");
  /* ROB'S ARTWORK MATS (2026-09-29): one is chosen like any other mat. */
  eq((await api("POST", `${url}/mat`, {mat: "star-whale"})).json.table.seats[0].mat, "star-whale", "Rob puts his seat on the Star Whale mat");
  await api("POST", `${url}/ready`, {ready: true});
  eq((await api("POST", `${url}/start`)).status, 200, "Rob starts the countdown");

  /* 3. The object's alarm ends it; the board opens over the socket. */
  const playing = await until("the countdown to end on the object's alarm", async () => {const t = (await api("GET", url)).json.table; return t.phase === "playing" && t;}, 45000);
  ok(/^[a-z0-9]+g1$/.test(playing.matchId), `the game is on (${playing.matchId}), launched by the Durable Object's alarm in workerd`);
  await page.goto(`${BASE}/index.html#table?id=${id}`);
  await page.locator("#cm-board").waitFor({timeout: 30000});
  await page.locator("#cm-board .cm-board-strip").waitFor({timeout: 30000}).catch(async (error) => {
    await shot(page, "board-failed");
    console.error((await page.locator("#cm-board").evaluate((el) => el.textContent)).replace(/\s+/g, " ").slice(0, 600), errors, serverLog.slice(-3000));
    throw error;
  });
  ok(true, "the board opens over the table's WebSocket, through the Worker to the object");
  const whale = await page.evaluate(async () => {
    const mat = document.querySelector('.cm-board-mat[data-mat="star-whale"]'), bg = mat && getComputedStyle(mat).backgroundImage;
    const src = bg && (/url\("?([^")]+star-whale\.webp)"?\)/.exec(bg) || [])[1];
    const r = src ? await fetch(src) : null;
    return {src, status: r && r.status, type: r && r.headers.get("content-type")};
  });
  ok(/assets\/playmats\/star-whale\.webp$/.test(whale.src || "") && whale.status === 200 && /webp/.test(whale.type || ""), `the board draws Rob's seat on the Star Whale picture, served by staging's release (${whale.status} ${whale.type})`);
  await shot(page, "board-1400");

  /* 4. End game; Download the full record; replay it. */
  eq((await api("GET", `${url}/record`)).status, 409, "while the game is on there is no record");
  await api("POST", `${url}/end`);
  await page.locator(".cm-board-over").waitFor({timeout: 30000});
  const button = page.locator(".cm-board-over [data-action=board-record]");
  eq((await button.textContent()).trim(), "Download the full record", "the game over, a playtest table offers the full record");
  const [download] = await Promise.all([page.waitForEvent("download", {timeout: 20000}), button.click()]);
  const rec = JSON.parse(readFileSync(await download.path(), "utf8"));
  eq([rec.kind, rec.playtest, typeof rec.seed, rec.tape.at(-1).kind, rec.result.reason], ["full", true, "string", "end", "ended early"], "the file is the whole game: its seed, its tape ending where it was ended, and how it ended");
  const replayed = await replayTape({matchId: rec.matchId, pod: rec.pod, seed: rec.seed, tape: rec.tape});
  eq([replayed.status, replayed.view("s0").result], ["finished", rec.result], "and the replayer plays it again to the same end");
  ok(!JSON.stringify(rec).includes(EMAIL), "no one's address is in it");
  await shot(page, "record-1400");

  /* 5. TWO PEOPLE AND AN AI, FROM A LIBRARY BACKUP (the live game of 2026-10-04): the way a host and an invited
     newcomer actually arrive. Each restores a library backup in Settings -- one built here with the app's own model,
     of cards the engine defines, so no one's library is in the repository. The host makes a table with a person's
     seat and an AI's and invites; the newcomer, a second Access identity with its own origin and library, joins by
     the link, sees which decks the table can play, and takes one. Both boards open and both play the first turns; the
     newcomer reloads mid-game and is back on their board with no seat away; the host ends the game; the record
     replays to the same end with the table's own cards. */
  {
    const M = require("../../collection-model.js"), E = require("../../collection-exchange.js"), C = require("../../card-catalog.js");
    const {tableCards} = await import("../../cloud/game-room.mjs");
    const playable = (name) => {try {return Boolean(tableCards(name));} catch {return false;}};
    const oracle = JSON.parse(readFileSync(new URL("../../data/engine/oracle.json", import.meta.url), "utf8")).cards;
    const fact = (name) => {
      const o = oracle.find((x) => x.name === name);
      return C.normalize({name, typeLine: o.type, manaCost: o.mana ?? "", oracleText: o.text ?? "", colors: o.colors ?? [], colorIdentity: o.ci ?? [], legalities: {commander: "legal"}, price: null});
    };
    /* One red card the engine has yet to define, for the deck that is not whole: the first of these still waiting. */
    const gap = ["Shared Animosity", "Purphoros, God of the Forge", "Wheel of Fortune", "Chaos Warp"].find((name) => !playable(name));
    ok(Boolean(gap), `a red card the table cannot play yet, for the deck that is not whole (${gap})`);
    const card = Object.fromEntries(["Krenko, Mob Boss", "Mountain", "Ezuri, Renegade Leader", "Forest", gap].map((name) => [name, fact(name)]));
    let library = M.empty(), serial = 0;
    const run = (type, args) => {library = M.apply(library, {type, id: `e2e-${++serial}`, at: "2026-10-04T12:00:00Z", ...args}).state;};
    run("cards", {cards: Object.values(card)});
    const deck = (deckId, name, commander, rest) => run("createDeck", {deckId, name, commanders: [card[commander].id],
      slots: [[commander, 1], ...rest].map(([cardName, quantity], k) => ({id: `${deckId}-${k}`, cardId: card[cardName].id, quantity}))});
    deck("goblins", "Goblins (e2e)", "Krenko, Mob Boss", [["Mountain", 99]]);
    deck("elves", "Elves (e2e)", "Ezuri, Renegade Leader", [["Forest", 99]]);
    deck("gap", "Goblins with a gap (e2e)", "Krenko, Mob Boss", [["Mountain", 98], [gap, 1]]);
    const backupFile = path.join(dir, "e2e-library.json");
    writeFileSync(backupFile, JSON.stringify(await E.backup({state: library, history: []})));
    const counts = M.counters(library);
    const review = `${library.decks.length} decks · ${counts.owned} owned · ${counts.ordered} ordered · ${counts.toBuy} to buy · 0 history records`;

    /* The newcomer: their own Access token, through their own stand-in, so their own origin and library. */
    const NEWCOMER = "newcomer@e2e.test", NPORT = PORT + 2, NBASE = `http://crankmagic.localhost:${NPORT}`;
    const tokenFor = async (email) => {
      const now = Math.floor(Date.now() / 1000), head = b64({alg: "RS256", kid: "e2e"}), body = b64({aud: [AUD], iss: `https://${TEAM}`, email, iat: now, exp: now + 7200});
      return `${head}.${body}.${Buffer.from(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", privateKey, new TextEncoder().encode(`${head}.${body}`))).toString("base64url")}`;
    };
    const second = http.createServer(async (req, res) => {
      const upstream = http.request({host: "127.0.0.1", port: WORKER_PORT, method: req.method, path: req.url, headers: {...req.headers, "cf-access-jwt-assertion": await tokenFor(NEWCOMER)}}, (r) => {res.writeHead(r.statusCode, r.headers); r.pipe(res);});
      upstream.on("error", () => {try {res.writeHead(502); res.end();} catch {}});
      req.pipe(upstream);
    });
    second.on("upgrade", async (req, socket, head) => {
      const upstream = net.connect(WORKER_PORT, "127.0.0.1", async () => {
        const headers = {...req.headers, "cf-access-jwt-assertion": await tokenFor(NEWCOMER)};
        upstream.write(`${req.method} ${req.url} HTTP/1.1\r\n${Object.entries(headers).map(([k, v]) => `${k}: ${v}`).join("\r\n")}\r\n\r\n`);
        if (head && head.length) upstream.write(head);
        upstream.pipe(socket); socket.pipe(upstream);
      });
      upstream.on("error", () => socket.destroy()); socket.on("error", () => upstream.destroy());
    });
    await new Promise((r) => second.listen(NPORT, "127.0.0.1", r));
    try {
      const newcomerContext = await browser.newContext({viewport: {width: 1400, height: 900}});
      const newcomer = await newcomerContext.newPage();
      newcomer.on("pageerror", (e) => errors.push(`newcomer: ${e.message}`));
      await stubNetwork(newcomer, []);
      const restore = async (p, base) => {
        await p.goto("about:blank");
        await p.goto(`${base}/index.html#settings`);
        await p.locator("#cm-settings-h-data").waitFor({timeout: 30000});
        await p.getByRole("button", {name: "Restore from a backup file"}).click();
        await p.locator("#cm-dialog input[name=file]").setInputFiles(backupFile);
        await p.locator("#cm-dialog").getByRole("button", {name: "Validate backup"}).click();
        const said = p.locator("#cm-dialog").getByText(/\d+ decks · \d+ owned/).first();
        await said.waitFor({timeout: 30000});
        const text = (await said.textContent()).trim();
        await p.locator("#cm-dialog input[name=confirm]").fill("RESTORE");
        await p.locator("#cm-dialog").getByRole("button", {name: "Restore reviewed backup"}).click();
        await p.getByText("Backup restored after checksum verification.").first().waitFor({timeout: 30000});
        return text;
      };
      eq([await restore(page, BASE), await restore(newcomer, NBASE)], [review, review], `the host and the newcomer each restore the library in Settings, and its review reads "${review}"`);

      /* The host's table: a person's seat and an AI's. */
      await page.goto(`${BASE}/index.html#table`);
      const form = page.locator("#cm-table-new");
      await form.waitFor({timeout: 30000});
      await form.locator("input[name=hostName]").fill("Rob");
      await form.locator("select[name=kind2]").selectOption("human");
      await form.locator("input[name=name2]").fill("Newcomer");
      await form.locator("select[name=kind3]").selectOption("ai");
      await form.locator("input[name=name3]").fill("Bot");
      await page.locator("[data-action=table-create]").click();
      await page.locator(".cm-cloud-table .cm-lobby-seat").nth(2).waitFor({timeout: 30000});
      const tableId = (/id=([^&]+)/.exec(new URL(page.url()).hash) || [])[1], turl = `/api/tables/${tableId}`;
      await page.locator(`.cm-lobby-seat[data-seat="1"]`).getByRole("button", {name: /^Invite$/}).click();
      const input = page.locator("#cm-dialog[open] #cm-table-link");
      await until("the invitation link", async () => Boolean(await input.inputValue().catch(() => "")), 15000);
      const link = new URL(await input.inputValue());
      ok(new RegExp(`^/api/join/${tableId}/[A-Za-z0-9_-]{20,100}$`).test(link.pathname) && !link.hash, "the host invites seat 2 and gets its link, a path through the Worker (Access's sign-in keeps a path, drops a fragment)");
      await page.locator("#cm-dialog").getByRole("button", {name: "Done"}).click();

      /* The newcomer joins by the link and chooses a deck the table can play. */
      await newcomer.goto(`${NBASE}${link.pathname}${link.hash}`);
      await newcomer.locator(".cm-cloud-table .cm-lobby-seat").nth(2).waitFor({timeout: 30000});
      const seen = await newcomer.evaluate(async (u) => (await (await fetch(u, {cache: "no-store"})).json()).table.seats.map((s) => [s.you, s.occupied]), turl);
      eq(seen.slice(0, 2), [[false, true], [true, true]], "the newcomer opens the link, signed in as themself, and sits in seat 2");
      await newcomer.locator(`.cm-lobby-seat[data-seat="1"]`).getByRole("button", {name: /^Choose a deck$/}).click();
      const rows = newcomer.locator("#cm-dialog .cm-table-deck[data-action=table-use-deck]");
      await rows.first().waitFor({timeout: 15000});
      await until("the dialog's known counts", async () => newcomer.locator("#cm-dialog [data-known-for]").evaluateAll((els) => els.length > 0 && els.every((el) => el.textContent.trim())), 30000);
      const known = Object.fromEntries(await rows.evaluateAll((els) => els.map((el) => [el.querySelector("strong").textContent.trim(), el.querySelector("[data-known-for]").textContent.trim()])));
      eq([known["Elves (e2e)"], known["Goblins with a gap (e2e)"]], ["All 100 cards known", "99 of 100 known · 1 to learn"], "the deck dialog says which decks the table can play, before one is chosen");
      await rows.filter({has: newcomer.locator("strong").getByText("Elves (e2e)", {exact: true})}).click();
      await newcomer.locator(`.cm-lobby-seat[data-seat="1"] .cm-seat-line`, {hasText: "Elves (e2e)"}).waitFor({timeout: 15000});
      await newcomer.locator(`.cm-lobby-seat[data-seat="1"]`).getByRole("button", {name: /^Ready$/}).click();

      /* The host seats their deck and the AI's, and starts. */
      await page.goto(`${BASE}/index.html#table?id=${tableId}`);
      await page.locator(".cm-cloud-table .cm-lobby-seat").nth(2).waitFor({timeout: 30000});
      for (const [seat, button] of [[0, /^Choose a deck$/], [2, /^Choose its deck$/]]) {
        await page.locator(`.cm-lobby-seat[data-seat="${seat}"]`).getByRole("button", {name: button}).click();
        await page.locator("#cm-dialog .cm-table-deck[data-action=table-use-deck]").filter({has: page.locator("strong").getByText("Goblins (e2e)", {exact: true})}).click();
        await page.locator(`.cm-lobby-seat[data-seat="${seat}"] .cm-seat-line`, {hasText: "Goblins (e2e)"}).waitFor({timeout: 15000});
      }
      await page.locator(`.cm-lobby-seat[data-seat="0"]`).getByRole("button", {name: /^Ready$/}).click();
      await until("everyone ready", async () => (await api("GET", turl)).json?.table?.blockers?.length === 0, 30000);
      await page.locator("[data-action=table-start]").click();
      await until("the game to start", async () => (await api("GET", turl)).json?.table?.phase === "playing", 60000);
      for (const [p, base] of [[page, BASE], [newcomer, NBASE]]) {
        await p.goto(`${base}/index.html#table?id=${tableId}`);
        await p.locator("#cm-board .cm-board-strip").waitFor({timeout: 30000});
      }
      ok(true, "the host starts; both people's boards open on the game");

      /* Both play the first turns: keep, draw, pass, and the first answer to anything else. */
      const act = async (p) => {
        const went = p.locator("[data-action=board-went-close]");
        if (await went.count()) {await went.first().click(); return;}
        const d = p.locator("#cm-board-decision:not(.is-also)").first();
        if (await d.count()) {
          assert.ok(!/cannot answer/.test((await d.textContent()) || ""), "the board can answer what it is asked");
          const confirm = d.locator("[data-action=board-confirm]"), opts = d.locator("[data-action=board-option]");
          if (await confirm.count()) {
            for (let i = 0; i < await opts.count() && !(await confirm.isEnabled()); i++) await opts.nth(i).click();
            if (await confirm.isEnabled()) await confirm.click();
          } else if (await opts.count()) await opts.first().click();
          return;
        }
        for (const action of ["board-draw", "board-pass"]) {
          const b = p.locator(`[data-action=${action}]`).first();
          if (await b.count() && await b.isEnabled()) {await b.click(); return;}
        }
      };
      const turnOf = async (p) => Number((/Turn (\d+)/.exec((await p.locator(".cm-board-turn").first().textContent().catch(() => "")) || "") || [0, 0])[1]);
      await until("both people to reach turn 3", async () => {await act(page); await act(newcomer); return Math.min(await turnOf(page), await turnOf(newcomer)) >= 3;}, 180000);
      ok(true, `both people play through their boards to turn ${await turnOf(page)}`);

      /* A reload mid-game: back on the board, and no seat away. */
      await newcomer.reload();
      await newcomer.locator("#cm-board .cm-board-strip").waitFor({timeout: 30000});
      await until("the table to settle", async () => (await api("GET", turl)).json?.table?.away?.length === 0, 15000);
      ok(true, "the newcomer reloads mid-game and is back on their board, with no seat counted away");

      /* The host ends it for everyone; the record replays with the table's own cards. */
      await page.locator("[data-action=board-tools]").click();
      await page.locator("[data-action=board-end]").click();
      await page.locator("[data-action=board-end][data-confirm]").click();
      for (const p of [page, newcomer]) await p.locator(".cm-board-over").waitFor({timeout: 30000});
      const [download] = await Promise.all([page.waitForEvent("download", {timeout: 20000}), page.locator(".cm-board-over [data-action=board-record]").click()]);
      const rec = JSON.parse(readFileSync(await download.path(), "utf8"));
      const again = await replayTape({matchId: rec.matchId, pod: rec.pod, seed: rec.seed, tape: rec.tape, cards: tableCards});
      eq([again.status, again.view("s0").result, rec.pod.seats.map((s) => s.pilot)], ["finished", rec.result, ["human", "human", "house"]],
        "the host ends the game for everyone, both see it over, and the record of two people and an AI replays to the same end");
      ok(!JSON.stringify(rec).includes(NEWCOMER), "the newcomer's address is not in the record");
      await newcomerContext.close();
    } finally {
      second.close();
    }
  }

  /* 6. ONCE EVERY PERSON IS OUT, THE GAME ENDS THERE (Rob, 2026-10-06; game/room/room.mjs `endWhenNoPerson`). Rob and
     two AI seats at a third table; he concedes as the game begins, and the game ends at once, the AI seats not playing it
     out: its record is there to download straight away, says why it ended, and replays to the same end. */
  const goblins = {name: "Goblins", commander: ["Krenko, Mob Boss"], cards: [...Array(40).fill("Mountain"), "Lightning Bolt", "Blasphemous Act", "Sol Ring"]};
  const third = await api("POST", "/api/tables", {hostName: "Rob", seats: [{kind: "ai", name: "Bot"}, {kind: "ai", name: "Bot 2"}]});
  const url3 = `/api/tables/${third.json.table.tableId}`;
  for (const seatId of [0, 1, 2]) await api("POST", `${url3}/deck`, {seatId, deck: goblins});
  await api("POST", `${url3}/ready`, {ready: true});
  await api("POST", `${url3}/start`);
  const match = (await until("the third table's countdown to end", async () => {const t = (await api("GET", url3)).json.table; return t.phase === "playing" && t;}, 45000)).matchId;
  eq((await api("POST", `${url3}/concede`)).json.table.phase, "rematch", "at a third table, Rob and two AI seats, Rob concedes as the game begins, and the table moves on at once");
  const done = (await api("GET", `${url3}/record?match=${match}`)).json.record;
  eq([done.result.reason, done.result.winner, done.departures.s0, done.refusals.since], [NO_PERSON_REASON, null, "conceded", 0], "the game ended there, the AI seats not playing it out, and its record says why");
  const replayedOn = await replayTape({matchId: done.matchId, pod: done.pod, seed: done.seed, tape: done.tape, cards: tableCards});
  eq(replayedOn.view("s0").result, done.result, "and it replays to the same end");
  eq(errors, [], "and no page error on the way");
} finally {
  await browser.close();
  proxy.close();
  server.kill();
  await new Promise((r) => setTimeout(r, 500));
  try {rmSync(dir, {recursive: true, force: true});} catch {}
}
console.log(`play-e2e: ${checks} checks passed — the staging release's Play under wrangler dev: the Play tab is the table, a table is a playtest table, the alarm launches the game, the board opens over the socket, and the full record downloads and replays.`);
