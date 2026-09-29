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

const require = createRequire(import.meta.url);
const {chromium} = require(process.env.UAT_PLAYWRIGHT || "playwright");
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
const browser = await chromium.launch({headless: true, ...(process.env.UAT_CHROME ? {executablePath: process.env.UAT_CHROME} : {})});
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
  const refused = await api("POST", `${url}/deck`, {seatId: 0, deck: {name: "Quintorius", commander: ["Quintorius, Loremaster"], cards: ["Sol Ring", "Forest"]}});
  eq([refused.status, refused.json.unsupported], [422, ["Quintorius, Loremaster", "Sol Ring"]], "a real deck's cards are refused by name: the engine cannot play them until M4 defines them");
  /* The lobby, drawn from the release's own modules (Rob, 2026-09-29: it opened on "reading 'statusPill'"). */
  await page.goto(`${BASE}/index.html#table?id=${id}`);
  await page.locator(".cm-cloud-table .cm-lobby-seat").nth(1).waitFor({timeout: 30000});
  eq([await page.locator(".cm-cloud-table .cm-lobby-seat").count(), await page.locator("#cm-table-refused").count(), await page.locator(".cm-cloud-table .cm-seat-pill").count()], [2, 0, 2], "the lobby opens and draws both seats, each with its status");
  /* THE BASIC LANDS TEST DECK (Rob, 2026-09-29), chosen in the table's own dialog, for Rob's seat and the AI's. */
  for (const [seat, button] of [[0, "Choose a deck"], [1, "Choose its deck"]]) {
    await page.locator(`.cm-lobby-seat[data-seat="${seat}"]`).getByRole("button", {name: button}).click();
    await page.locator("#cm-dialog [data-action=table-use-test-deck]").waitFor({timeout: 15000});
    if (!seat) await shot(page, "test-deck-1400");
    await page.locator("#cm-dialog [data-action=table-use-test-deck]").click();
    await page.locator(`.cm-lobby-seat[data-seat="${seat}"] .cm-seat-line`, {hasText: "Basic lands test deck"}).waitFor({timeout: 15000});
  }
  const seats = (await api("GET", url)).json.table.seats;
  eq(seats.map((s) => s.deck && s.deck.name), ["Basic lands test deck", "Basic lands test deck"], "on this playtest table the deck dialog offers the basic lands test deck, and both seats take it");
  await shot(page, "lobby-1400");
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
  eq(errors, [], "and no page error on the way");
} finally {
  await browser.close();
  proxy.close();
  server.kill();
  await new Promise((r) => setTimeout(r, 500));
  try {rmSync(dir, {recursive: true, force: true});} catch {}
}
console.log(`play-e2e: ${checks} checks passed — the staging release's Play under wrangler dev: the Play tab is the table, a table is a playtest table, the alarm launches the game, the board opens over the socket, and the full record downloads and replays.`);
