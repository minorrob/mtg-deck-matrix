/* TWO DEVICES, ONE LIBRARY -- the account cloud end to end on this machine (Stage 2).
 *
 * Builds the staging profile from the working tree and runs it under `wrangler dev --local`: the real Worker,
 * the real migration, a local D1. Two browser contexts are two devices signed in as the same person; the
 * Access token each request carries is signed by a key this run generates and hands the Worker as
 * ACCESS_JWKS (the one place that setting is ever used -- a release that sets it is refused). Then the
 * journeys a person would take:
 *
 *   1. device A restores a full library, and it saves itself to the cloud
 *   2. device B signs in empty, and brings the library in
 *   3. B makes a deck; A, reopened, has it
 *   4. both make a deck; B is asked which library to keep, keeps its own; A, reopened, has B's --
 *      and A's version is still in the cloud, displaced, not lost
 *   5. a game is logged and a simulation measured on A; the cloud's copy of the library carries both
 *
 *   node tests/uat/cloud-e2e.mjs      (WRANGLER=<wrangler.js>, UAT_PLAYWRIGHT, UAT_CHROME as for the other walks)
 */
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {spawn, spawnSync} from "node:child_process";
import {mkdtempSync, mkdirSync, writeFileSync, rmSync} from "node:fs";
import os from "node:os";
import path from "node:path";
import {build, worktreeSource, ROOT} from "../../tools/release-pages.mjs";

const require = createRequire(import.meta.url);
const {chromium} = require(process.env.UAT_PLAYWRIGHT || "playwright");
const WRANGLER = process.env.WRANGLER || "C:/Users/robmi/CrankMagic/workbench/cloudflare/node_modules/wrangler/bin/wrangler.js";
const PORT = Number(process.env.E2E_PORT || 8796), BASE = `http://crankmagic.localhost:${PORT}`;
const TEAM = "e2e.cloudflareaccess.com", AUD = "e2e-audience", EMAIL = "rob@e2e.test";
let checks = 0;
const ok = (value, message) => {assert.ok(value, message); checks++; console.log(`  ok  ${message}`);};

/* The build, with test Access values. The release goes in site/ and its configuration beside it, not in it:
   `wrangler dev` watches the assets folder and writes its own state and bundles next to the configuration,
   and with both in one folder every write it made reloaded the server, forever. */
const dir = mkdtempSync(path.join(os.tmpdir(), "crankmagic-e2e-")), site = path.join(dir, "site");
const {built} = build({source: worktreeSource(), profileName: "cloud-staging"});
for (const [f, body] of built) {mkdirSync(path.dirname(path.join(site, f)), {recursive: true}); writeFileSync(path.join(site, f), body);}
const config = JSON.parse(built.get("wrangler.jsonc").toString("utf8"));
config.vars = {ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD};
config.main = `site/${config.main}`;
config.assets = {...config.assets, directory: "./site"};
config.d1_databases = config.d1_databases.map((d) => ({...d, migrations_dir: `site/${d.migrations_dir}`}));
writeFileSync(path.join(dir, "wrangler.jsonc"), JSON.stringify(config, null, 2));
const state = path.join(dir, "state");

/* Access, as the Worker will see it: a key it is given, and tokens signed with it. */
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
const server = spawn(process.execPath, [WRANGLER, "dev", "--local", "--ip", "127.0.0.1", "--port", String(PORT), "--persist-to", state, "--var", `ACCESS_JWKS:${jwks}`], {cwd: dir, env});
let serverLog = "";
await new Promise((resolve, reject) => {
  const done = setTimeout(() => reject(Error(`wrangler dev did not start:\n${serverLog.slice(-2000)}`)), 120000);
  const watch = (chunk) => {serverLog += chunk; if (/Ready on|ready on/.test(serverLog)) {clearTimeout(done); resolve();}};
  server.stdout.on("data", watch); server.stderr.on("data", watch);
  server.on("exit", (code) => reject(Error(`wrangler dev exited (${code}):\n${serverLog}`)));
});

const browser = await chromium.launch({headless: true, ...(process.env.UAT_CHROME ? {executablePath: process.env.UAT_CHROME} : {})});
const errors = [], pages = [];
async function device(name) {
  const context = await browser.newContext({viewport: {width: 1280, height: 860}, extraHTTPHeaders: {"cf-access-jwt-assertion": await token()}});
  const page = await context.newPage();
  pages.push([name, page]);
  page.on("pageerror", (e) => errors.push(`${name}: ${e.message}`));
  const {stubNetwork} = await import("./scryfall-stub.mjs"); await stubNetwork(page, []);
  return page;
}
const open = async (page) => {await page.goto(`${BASE}/index.html`); await page.getByRole("heading", {name: /Build it\. Make it yours\.|Decks/}).first().waitFor({timeout: 60000});};
const decks = (page) => page.evaluate(async () => {const r = await CrankRepository.open(); try {return (await r.getState()).decks.map((d) => d.name).sort();} finally {r.close();}});
const cloud = (page, path) => page.evaluate(async (p) => (await fetch(p, {cache: "no-store"})).json(), path);
const until = async (what, fn, timeout = 30000) => {const end = Date.now() + timeout; for (;;) {const v = await fn(); if (v) return v; if (Date.now() > end) throw Error(`timed out waiting for ${what}`); await new Promise((r) => setTimeout(r, 500));}};
const shot = async (page, name) => {if (process.env.UAT_SHOTS) await page.screenshot({path: path.join(process.env.UAT_SHOTS, `e2e-${name}.png`)});};
async function newDeck(page, name) {
  await page.getByRole("link", {name: "Decks", exact: true}).click();
  await page.getByRole("button", {name: "New deck", exact: true}).first().click();
  await page.locator("[data-action=wizard-create]").click();
  /* A library with collection groups asks where the deck starts from first; an empty one goes straight on. */
  const onward = page.getByRole("button", {name: "Continue", exact: true});
  if (await onward.isVisible().catch(() => false)) await onward.click();
  await page.getByLabel("Card name or a Scryfall link").fill("Krenko, Mob Boss");
  await page.locator("[data-pick-card]").filter({has: page.getByText("Krenko, Mob Boss", {exact: true})}).click();
  await page.locator("#cm-dialog [name=name]").fill(name);
  await page.getByRole("button", {name: "Create draft", exact: true}).click();
  await page.getByRole("dialog").waitFor({state: "hidden"});
}

try {
  /* 1. Device A: a full library saves itself. */
  const a = await device("A");
  await open(a);
  await a.getByRole("button", {name: "Menu", exact: true}).click();
  ok(/Signed in as rob@e2e\.test/.test(await a.locator("#cm-account").innerText()), "the Menu says who is signed in");
  await shot(a, "menu-signed-in");
  await a.getByRole("button", {name: "Restore from a backup file", exact: true}).click();
  await a.getByLabel("CrankMagic JSON backup").setInputFiles(path.join(ROOT, "data", "live-state.json"));
  await a.getByRole("button", {name: "Validate backup", exact: true}).click();
  await a.getByLabel("Type RESTORE to replace the library").fill("RESTORE");
  await a.getByRole("button", {name: "Restore reviewed backup", exact: true}).click();
  await a.getByRole("dialog").waitFor({state: "hidden"});
  const aDecks = await decks(a);
  const first = await until("A's first save", async () => (await cloud(a, "/api/library")).head);
  ok(first.device.includes("Chrome") && first.size > 1000, `A's library saved itself to the cloud (${aDecks.length} decks, ${first.size.toLocaleString("en-US")} characters compressed)`);

  /* 2. Device B: signs in empty, and brings the library in. */
  const b = await device("B");
  await open(b);
  await until("B to bring the library in", async () => (await decks(b)).length === aDecks.length);
  ok(JSON.stringify(await decks(b)) === JSON.stringify(aDecks), "a new device, signed in, has the same library");
  ok((await cloud(b, "/api/library")).head.id === first.id, "without saving anything back");

  /* 3. B makes a deck; A, reopened, has it. */
  await newDeck(b, "E2E Goblins");
  await until("B's deck to save", async () => (await cloud(b, "/api/library")).head.id !== first.id);
  await open(a);
  await until("A to bring in B's deck", async () => (await decks(a)).includes("E2E Goblins"));
  ok(true, "a deck made on B is on A when A opens");

  /* 4. Both make a deck. B is asked which to keep; it keeps its own; nothing is lost. */
  const before = (await cloud(a, "/api/library")).head.id;
  await newDeck(a, "Alpha Goblins");
  const alpha = await until("A's deck to save", async () => {const h = (await cloud(a, "/api/library")).head; return h.id !== before && h;});
  await newDeck(b, "Beta Goblins");
  await b.getByRole("heading", {name: "Which library do you want to keep?"}).waitFor({timeout: 30000});
  const choice = await b.locator("#cm-dialog").innerText();
  await shot(b, "which-library");
  ok(/This device/.test(choice) && /The cloud \(saved on Chrome/.test(choice) && /30 days/.test(choice), "B is asked, shown both libraries, and told the other is kept 30 days");
  ok(/Only here: Beta Goblins[\s\S]*Only here: Alpha Goblins/.test(choice), "and told which deck each side has that the other does not");
  await b.getByRole("button", {name: "Keep this device's", exact: true}).click();
  const kept = await until("B's choice to save", async () => {const h = (await cloud(b, "/api/library")).head; return h.id !== alpha.id && h;});
  const history = (await cloud(b, "/api/library/history")).versions;
  ok(history.find((v) => v.id === alpha.id)?.kind === "displaced", "A's version is kept in the cloud, marked displaced");
  await open(a);
  await until("A to take B's choice", async () => {const d = await decks(a); return d.includes("Beta Goblins") && !d.includes("Alpha Goblins");});
  ok((await cloud(a, "/api/library")).head.id === kept.id, "A, reopened, has the library B chose");

  /* 5. A game logged and a simulation measured are the account's too, not just the decks (Rob, 24
        September: "when a record is created or a simulation history is created, those are being
        written back to the user's account"). Both go in through the repository's own commit, as
        Log a game and Measure write them, and the cloud's copy -- fetched, unzipped and opened with
        the same readBackup a device brings a library in with -- carries both. */
  const beforeRecord = (await cloud(a, "/api/library")).head.id;
  await a.evaluate(async () => {
    const r = await CrankRepository.open();
    try {
      let s = await r.getState(); const d = s.decks.find((x) => x.name === "Beta Goblins") || s.decks[0];
      await r.commit({id: crypto.randomUUID(), type: "game", deckId: d.id, outcome: "win", playedAt: "2026-09-24", pod: 4, notes: "E2E game record"}, s.revision);
      s = await r.getState();
      await r.commit({id: crypto.randomUUID(), type: "report", deckId: d.id, report: {protocol: "e2e-measure@1", deckFingerprint: "e2e-fingerprint", origin: "measured", summary: "E2E simulation history"}}, s.revision);
    } finally {r.close();}
  });
  const carried = await until("the record and the report to reach the cloud", async () => {
    const h = (await cloud(a, "/api/library")).head;
    if (h.id === beforeRecord) return null;
    const copy = await a.evaluate(async (id) => {
      const {version} = await (await fetch(`/api/library/versions/${id}`, {cache: "no-store"})).json();
      const {state} = await CrankExchange.readBackup(await CrankCloudSync.gunzip(CrankCloudSync.fromBase64(version.body)));
      return {games: state.games.map((g) => g.notes), reports: state.reports.map((x) => x.summary)};
    }, h.id);
    return copy.games.includes("E2E game record") && copy.reports.includes("E2E simulation history") && copy;
  });
  ok(carried.games.length === 1 && carried.reports.length === 1, "a logged game and a measured report are in the account's copy of the library");

  ok(errors.length === 0, `no page errors${errors.length ? ": " + errors.join(" | ") : ""}`);
  console.log(`cloud-e2e: ${checks} checks passed -- two devices, one library, through the real Worker and a local D1.`);
} catch (error) {
  const shots = process.env.UAT_SHOTS;
  if (shots) for (const [name, page] of pages) await page.screenshot({path: path.join(shots, `e2e-failure-${name}.png`)}).catch(() => {});
  console.error(`cloud-e2e FAILED: ${error.stack || error}\n--- wrangler dev ---\n${serverLog.slice(-3000)}`);
  process.exitCode = 1;
} finally {
  await browser.close();
  if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(server.pid), "/T", "/F"]); else server.kill();
  rmSync(dir, {recursive: true, force: true});
}
