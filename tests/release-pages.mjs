/* THE PRODUCTION RELEASE holds the web app and nothing else, and Play in it says Coming Soon.
 *
 * tools/release-pages.mjs builds the release from one commit; this suite builds it from the working
 * tree, in memory, and holds it to Rob's two sentences (2026-09-24): "the CrankMagic build minus the
 * Play option (on that tab it should say 'Coming Soon')" and, asked what the branch holds, "Only the
 * web app". Then it breaks the checks on purpose, because a check that cannot fail is a comment
 * (AGENTS.md): a release missing a file the service worker lists, a Play module that got in, a page
 * that forgot to say Coming Soon, a tool that leaked -- each must be named.
 */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {build, worktreeSource, verify, transform, referencesOf, workerModules, PROFILES, NEVER, PAGES, FIRST_PUBLIC, RETIRED_PUBLIC, PLAY_WORKER} from "../tools/release-pages.mjs";

let checks = 0;
const ok = (value, message) => {assert.ok(value, message); checks++;};
const eq = (a, b, message) => {assert.deepEqual(a, b, message); checks++;};
const profile = PROFILES.pages;

const {built, problems, mentions} = build({source: worktreeSource()});
eq(problems, [], "the release built from this tree verifies");
const files = [...built.keys()];

/* Only the web app. */
for (const f of ["index.html", "crankmagic.html", "graph.html", "crankmagic-sw.js", "crankmagic-app.js", "crankmagic-design.css", "data/cards.json", "data/graph.json", "sim-worker.js", "sim-engine.js", "sim/config.json", "LICENSE", "DISCLAIMER.md", ".nojekyll", "version.json"])
  ok(built.has(f), `${f} is in the release`);
eq(files.filter((f) => NEVER.test(f)), [], "nothing from game code, tools, tests, documents, the engine's data or the source workbooks");
for (const f of ["data/live-state.json", "data/live-load.json"]) ok(NEVER.test(f) && !built.has(f), `${f}, the owner's own collection, is never served`);
ok(!/load-live|live-state\.json|treycmload/.test(built.get("crankmagic-exchange-ui.js").toString("utf8")), "and nothing in the release offers to fetch it");
eq(files.filter((f) => /^(AGENTS|CLAUDE|BACKLOG|README|HOTFIX-SUMMARY)\.md$|\.(ps1|sh)$/.test(f)), [], "and none of the repository's own working files");
for (const f of profile.leaveOut) ok(!built.has(f), `${f} is Play, and is not in the release`);
ok(mentions.every((m) => / names (tools|data\/archive)\/| names data\/live-(state|load)\.json$/.test(m)), `the names it declined to follow are tools, the archive and the owner's collection, named as provenance: ${mentions.join("; ")}`);

/* Play says Coming Soon, and nothing left can reach a game host. */
for (const p of PAGES) {
  const text = built.get(p).toString("utf8");
  ok(text.includes('<meta name="crankmagic-play" content="coming-soon">'), `${p} is marked Coming Soon`);
  ok(/<meta name="crankmagic-version" content="[0-9a-f]{7} · \d{4}-\d{2}-\d{2}">/.test(text), `${p} says which commit it is`);
  ok(!/crankmagic-(game|lobby|online)\.(js|css)|collection-lobby-draft\.js/.test(text), `${p} loads no Play module`);
  ok(!text.includes("127.0.0.1:8768") && !text.includes("trycloudflare.com"), `${p}'s security policy allows no connection to a game host or a tunnel`);
  ok(/connect-src 'self' https:\/\/api\.scryfall\.com[;"]/.test(text), `${p} reaches this site and Scryfall's API, and nothing else (plan-data-sync §0): ${(/connect-src[^;"]*/.exec(text) || [""])[0]}`);
  ok(!/edhrec|archidekt/i.test((/connect-src[^;"]*/.exec(text) || [""])[0]), `${p} lets the browser reach neither EDHREC nor Archidekt`);
}
const app = built.get("crankmagic-app.js").toString("utf8");
ok(/meta\[name="crankmagic-play"\]'\)\?\.content==='coming-soon'\)views\.game=views\.online=/.test(app), "the app answers the mark with the Coming Soon view, on #game and #online");
ok(app.includes("'Play','Coming Soon'"), "which says Coming Soon under Play");
ok(/meta\[name="crankmagic-version"\]/.test(app), "and the Menu reads the version mark");

/* The service worker still runs, and everything it lists is in the release. */
const sw = built.get("crankmagic-sw.js").toString("utf8");
const lists = new Function("self", "caches", `${sw}\nreturn {SHELL, DATA, RUNTIME};`)({location: "https://example.test/", addEventListener() {}}, {});
const listed = [...lists.SHELL, ...lists.DATA, ...lists.RUNTIME].map((u) => u.split("?")[0]);
ok(listed.length > 40, `the worker still lists its shell and data (${listed.length})`);
eq(listed.filter((f) => !built.has(f)), [], "and every file it lists is in the release");
ok(!listed.some((f) => profile.leaveOut.includes(f)), "and none of them is Play");
const version = JSON.parse(built.get("version.json").toString("utf8"));
ok(/^[0-9a-f]{40}$/.test(version.commit) && version.profile === "pages", "version.json names the commit and the profile");

/* It lives at crankmagic.com, on Cloudflare (Rob, 2026-09-24: the domain is his, "make the cloud move now"). */
for (const p of PAGES) {
  const text = built.get(p).toString("utf8");
  ok(text.includes('<link rel="canonical" href="https://crankmagic.com/'), `${p}'s canonical link is crankmagic.com, which the app reads its own address from`);
  ok(!text.includes("github.io"), `${p} no longer names the github.io address`);
}
eq(version.origin, "https://crankmagic.com/", "version.json says where it is published");
const wrangler = JSON.parse(built.get("wrangler.jsonc").toString("utf8"));
eq([wrangler.name, wrangler.assets, wrangler.main], ["crankmagic", {directory: "./", binding: "ASSETS", run_worker_first: ["/api/*"]}, "cloud/worker.mjs"], "wrangler.jsonc serves every page as a file from the Worker named crankmagic, running its script for /api/* only");
eq([wrangler.routes, wrangler.workers_dev, wrangler.preview_urls], [[{pattern: "crankmagic.com", custom_domain: true}], false, false],
  "on crankmagic.com alone: no workers.dev or preview address, each of which would be another origin with its own browser library");
eq(wrangler.ratelimits, [
  {name: "LIMIT_IP", namespace_id: "1001", simple: {limit: 240, period: 60}},
  {name: "LIMIT_PERSON", namespace_id: "1002", simple: {limit: 120, period: 60}},
], "/api/* is rate-limited per IP and per person (M3)");
const ignored = built.get(".assetsignore").toString("utf8").split("\n");
ok([".git", ".wrangler", "wrangler.jsonc", ".assetsignore"].every((f) => ignored.includes(f)), "and .assetsignore keeps the clone's .git, wrangler's scratch folder and the configuration off the site");
ok([...built.values()].every((b) => b.length <= 25 * 1024 * 1024), "every file fits Cloudflare's 25 MiB");

/* Rob, 2026-09-24: "I don't want plain HTTP and I do want the analytics." */
for (const p of PAGES) eq((/script-src ([^;"]*)/.exec(built.get(p).toString("utf8")) || [])[1], "'self' https://static.cloudflareinsights.com",
  `${p} runs its own scripts and Cloudflare's analytics beacon, and nothing else`);
const headers = built.get("_headers").toString("utf8");
ok(/^\/\*\n\s+Strict-Transport-Security: max-age=31536000\n/.test(headers), "every path tells the browser to use https for a year (HSTS)");
ok(headers.includes("X-Content-Type-Options: nosniff"), "and not to guess content types");
ok(!ignored.includes("_headers"), "and _headers is uploaded, since Cloudflare reads it at deploy (it is parsed, never served)");

/* The checks fail when they should. */
const broken = (edit) => {const copy = new Map(built); edit(copy); return verify(copy, profile);};
ok(!broken((m) => m).some((p) => p.includes("rate-limit")), "the builder accepts the rate limits it wrote (M3)");
ok(broken((m) => { const w = JSON.parse(m.get("wrangler.jsonc").toString()); delete w.ratelimits; m.set("wrangler.jsonc", Buffer.from(JSON.stringify(w))); }).some((p) => p.includes("LIMIT_IP")), "and a release without the limits is named");
ok(broken((m) => m.delete("data/cards.json")).some((p) => p.includes("data/cards.json")), "a file the worker lists but the release lacks is named");
ok(broken((m) => m.set("crankmagic-game.js", Buffer.from(""))).some((p) => p.includes("crankmagic-game.js")), "a Play module in the release is named");
ok(broken((m) => m.set("index.html", Buffer.from(m.get("index.html").toString().replace('content="coming-soon"', 'content="live"')))).some((p) => p.includes("not marked")), "a page that does not say Coming Soon is named");
ok(broken((m) => m.set("tools/release-pages.mjs", Buffer.from(""))).some((p) => p.includes("never ships")), "a tool in the release is named");
ok(broken((m) => m.set("crankmagic.html", Buffer.from(m.get("crankmagic.html").toString().replace("connect-src 'self'", "connect-src 'self' http://127.0.0.1:8768")))).some((p) => p.includes("127.0.0.1:8768")), "a page that can reach a game host again is named");
ok(broken((m) => m.set("index.html", Buffer.from(m.get("index.html").toString().replace("connect-src 'self'", "connect-src 'self' https://json.edhrec.com")))).some((p) => p.includes("plan-data-sync")), "a page that lets the browser reach EDHREC again is named (plan-data-sync §0)");
assert.throws(() => transform("index.html", "<html><head></head></html>", {profile, version: "x", origin: ""}), /nothing to change/, "a page without <meta charset> is refused, not half-edited"); checks++;
ok(broken((m) => m.set(".assetsignore", Buffer.from("wrangler.jsonc\n"))).some((p) => p.includes(".git")), "an .assetsignore that would publish .git is named");
ok(broken((m) => m.set("data/huge.json", Buffer.alloc(25 * 1024 * 1024 + 1))).some((p) => p.includes("25 MiB")), "a file over Cloudflare's limit is named");
const withConfig = (edit) => broken((m) => {const c = JSON.parse(m.get("wrangler.jsonc").toString()); edit(c); m.set("wrangler.jsonc", Buffer.from(JSON.stringify(c)));});
ok(withConfig((c) => {c.workers_dev = true;}).some((p) => p.includes("second origin")), "a Worker left open on workers.dev is named");
ok(withConfig((c) => {c.routes.push({pattern: "www.crankmagic.com", custom_domain: true});}).some((p) => p.includes("alone")), "a second custom domain is named");
ok(broken((m) => m.set("index.html", Buffer.from(m.get("index.html").toString().replace("script-src 'self' https://static.cloudflareinsights.com", "script-src 'self' https://static.cloudflareinsights.com https://cdn.example")))).some((p) => p.includes("script-src")), "a page that would run scripts from anywhere else is named");
ok(broken((m) => m.set("_headers", Buffer.from("/*\n  X-Content-Type-Options: nosniff\n"))).some((p) => p.includes("Strict-Transport-Security")), "a release without HSTS is named");
ok(broken((m) => m.set("index.html", Buffer.from(m.get("index.html").toString().replace('href="https://crankmagic.com/"', `href="${RETIRED_PUBLIC}"`)))).some((p) => p.includes("canonical")), "a page whose canonical link is not crankmagic.com is named");

/* The walk reads what the app would load, not what its comments talk about. */
const have = new Set(["assets/mana/W.svg", "assets/mana/U.svg", "assets/mana/x.png", "docs/plan.md", "data/cards.json"]);
eq([...referencesOf("a.js", "const u = `assets/mana/${symbol}.svg`;", have)].sort(), ["assets/mana/U.svg", "assets/mana/W.svg"], "a template names every file of its kind in its folder");
eq([...referencesOf("a.js", "/* see docs/plan.md */ // and docs/plan.md\nfetch('data/cards.json?v=3')", have)], ["data/cards.json"], "a file named in a comment is not a reference; one fetched is");
eq([...referencesOf("index.html", '<meta property="og:image" content="https://minorrob.github.io/mtg-deck-matrix/assets/mana/W.svg">', have)], ["assets/mana/W.svg"], "an absolute link to the app's own address is its own file");

/* PRIVACY, TERMS, AND ONE PUBLIC ADDRESS (Rob, 2026-09-24: "I don't want just anyone to see my personal email"). */
ok(built.has("privacy.html") && built.has("terms.html"), "the privacy policy and the terms of use are published");
/* The landing page's art ships whole: the still, and the animation and its poster (Rob, 2026-09-30), found by their
   references like every other file -- a .webm is a file type the walk knows. */
ok(["assets/crankmagic/landing-cards.webp", "assets/crankmagic/landing-cards.webm", "assets/crankmagic/landing-cards-poster.webp"].every((f) => built.has(f)), "the landing page's art ships: the still, the animation and its poster");
/* The refusal with instructions (Rob, 2026-09-26; docs/play-invites.md): Access sends the uninvited here. */
{
  const page = built.has("not-invited.html") ? built.get("not-invited.html").toString("utf8") : "";
  ok(page && /ask Rob to add/.test(page) && /never adds anyone/.test(page) && page.includes("mailto:admin@crankmagic.com") && page.includes('href="/cdn-cgi/access/logout"'),
    "not-invited.html is published: ask Rob to add you, a link never adds anyone, the public contact, and sign out");
  ok(!/<script\b/i.test(page) && /Content-Security-Policy/.test(page) && !/@(gmail|outlook|yahoo|icloud)\./i.test(page), "and it runs no script, carries its policy, and names no personal address");
}
for (const p of PAGES) {
  const footer = (/<footer class="cm-legal"[\s\S]*?<\/footer>/.exec(built.get(p).toString("utf8")) || [""])[0];
  ok(['href="privacy.html"', 'href="terms.html"', 'href="mailto:admin@crankmagic.com"'].every((h) => footer.includes(h)), `${p}'s footer links Privacy, Terms and the contact address`);
}
ok(built.get("privacy.html").toString("utf8").includes("mailto:admin@crankmagic.com"), "and the privacy policy gives the contact address");
ok(broken((m) => m.set("crankmagic-app.js", Buffer.from(m.get("crankmagic-app.js").toString() + "\n// someone.personal@example.com\n"))).some((p) => p.includes("names an email address other than admin@crankmagic.com")),
  "a release that would show any other email address is refused");

/* PRODUCTION HAS ACCOUNTS since Rob approved them on staging (2026-09-24: "Everything looks good!"), on its
   own database and its own Access application; STAGING KEEPS ITS OWN of both. */
for (const f of ["cloud-sync.js", "crankmagic-account.js", "cloud/worker.mjs", "cloud/access.mjs", "cloud/library.mjs"]) ok(built.has(f), `${f} is in the production release`);
ok(PAGES.every((p) => built.get(p).toString("utf8").includes('<meta name="crankmagic-accounts" content="on">')), "and both production pages are marked accounts-on");
const pw = JSON.parse(built.get("wrangler.jsonc").toString("utf8"));
eq([pw.name, pw.main, pw.assets, pw.routes], ["crankmagic", "cloud/worker.mjs", {directory: "./", binding: "ASSETS", run_worker_first: ["/api/*"]}, [{pattern: "crankmagic.com", custom_domain: true}]],
  "production: the Worker crankmagic on crankmagic.com, its API script run for /api/* only, every page still served as a file");
eq(pw.d1_databases, [{binding: "DB", database_name: "crankmagic", database_id: "131b2c74-70a0-471e-8474-b8d079b0d322", migrations_dir: "cloud/migrations"}], "production's own database");
eq(pw.vars, {ACCESS_TEAM_DOMAIN: "crankmagic.cloudflareaccess.com", ACCESS_AUD: "ff51f3bcda0f6f50d2f48bb9d3d96b76530c128a23cdb1cc33aa4fa6d68611a3"},
  "and it trusts the CrankMagic accounts application (crankmagic.com/api/*, the invite list), read from its sign-in redirect");
const staging = build({source: worktreeSource(), profileName: "cloud-staging"});
eq(staging.problems, [], "the staging build is complete, its Access application's team and audience included");
eq(JSON.parse(staging.built.get("wrangler.jsonc").toString("utf8")).vars, {ACCESS_TEAM_DOMAIN: "crankmagic.cloudflareaccess.com", ACCESS_AUD: "213cb6b10352e5ed5525d6337f355cd5190dec402e86debd30971d3bd5bda1f5", PLAYTEST_TABLES: "on"},
  "and the Worker trusts that team's keys for that application only (read from the sign-in redirect's kid, and confirmed by Rob from the dashboard); its tables are playtest tables (M8b)");
const sb = staging.built, sw2 = JSON.parse(sb.get("wrangler.jsonc").toString("utf8"));
eq([sw2.name, sw2.main, sw2.assets, sw2.routes], ["crankmagic-staging", PLAY_WORKER, {directory: "./", binding: "ASSETS", run_worker_first: ["/api/*"]}, [{pattern: "staging.crankmagic.com", custom_domain: true}]],
  "staging: its own Worker on staging.crankmagic.com, Play's, the API script run for /api/* only");
eq(sw2.d1_databases, [{binding: "DB", database_name: "crankmagic-staging", database_id: "b7f806ec-c9e8-4265-9f23-7d9705db9a26", migrations_dir: "cloud/migrations"}], "its own database, never production's");
ok(["cloud/worker.mjs", "cloud/access.mjs", "cloud/library.mjs", "cloud/migrations/0001_accounts.sql", "cloud-sync.js", "crankmagic-account.js"].every((f) => sb.has(f)), "the Worker, its migration and the account module are all in it");
ok(sb.get(".assetsignore").toString("utf8").split("\n").includes("cloud/"), "and the Worker's source is not published as files");
ok(PAGES.every((p) => sb.get(p).toString("utf8").includes('<meta name="crankmagic-accounts" content="on">')), "both staging pages are marked accounts-on");
ok(verify(new Map([...sb, ["wrangler.jsonc", Buffer.from(JSON.stringify({...sw2, assets: {...sw2.assets, run_worker_first: ["/*"]}}))]]), PROFILES["cloud-staging"]).some((p) => p.includes("/api/* only")),
  "a Worker that would run for every path, not just the API, is named");
ok(verify(new Map([...sb, ["wrangler.jsonc", Buffer.from(JSON.stringify({...sw2, vars: {...sw2.vars, ACCESS_JWKS: "{\"keys\":[]}"}}))]]), PROFILES["cloud-staging"]).some((p) => p.includes("ACCESS_JWKS")),
  "a release that would hand the Worker its own signing keys is refused");
/* PLAY IN THE CLOUD, ON STAGING (Rob, 2026-09-29: "execute the play release and merge to staging"). */
const stagingProfile = PROFILES["cloud-staging"];
eq([sw2.durable_objects, sw2.migrations], [{bindings: [{name: "TABLES", class_name: "GameTable"}]}, [{tag: "tables-v1", new_sqlite_classes: ["GameTable"]}]], "staging binds TABLES to the table's Durable Object, made once by a SQLite-class migration");
ok(PAGES.every((p) => sb.get(p).toString("utf8").includes('<meta name="crankmagic-play" content="cloud">')), "both staging pages are marked Play in the cloud");
ok(["crankmagic-table.js", "crankmagic-board.js"].every((f) => sb.has(f)), "the table's lobby and its board are in it");
/* Rob's artwork mats (2026-09-29): Play only, every one with its picture and thumbnail; none in production. */
const {ART_MATS} = await import("../game/room/table.mjs");
ok(sb.has("crankmagic-mats.css") && ART_MATS.every((id) => sb.has(`assets/playmats/${id}.webp`) && sb.has(`assets/playmats/${id}-thumb.webp`)), `staging carries Rob's ${ART_MATS.length} artwork mats, each with its picture and thumbnail`);
eq([...sb.keys()].filter((f) => f.startsWith("assets/playmats/")).length, ART_MATS.length * 2, "and nothing else from that folder");
eq([built.has("crankmagic-mats.css"), [...built.keys()].filter((f) => f.startsWith("assets/playmats/")).length], [false, 0], "production, where Play is Coming Soon, carries neither the sheet nor its pictures");
/* The board's sound (B8): Play only -- the script and Rob's whole pack on staging, none of it in production. */
const pack = JSON.parse(readFileSync(new URL("../assets/audio/sound-index.json", import.meta.url), "utf8")).rows.filter((r) => r.kind !== "ui");
ok(sb.has("crankmagic-audio.js") && sb.has("assets/audio/sound-index.json") && pack.every((r) => sb.has(`assets/audio/${r.kind === "bgm" ? "bgm" : "sfx"}/${r.slug}.mp3`)), `staging carries the board's sound: the script, the index and all ${pack.length} clips`);
eq([built.has("crankmagic-audio.js"), [...built.keys()].filter((f) => f.startsWith("assets/audio/")).length], [false, 0], "production, where Play is Coming Soon, carries none of it");
ok(["crankmagic-game.js", "crankmagic-lobby.js", "crankmagic-online.js", "crankmagic-online.css", "collection-lobby-draft.js"].every((f) => !sb.has(f)), "and none of the local game host's modules");
const engine = workerModules(worktreeSource());
eq(engine.problems, [], "Play's Worker imports only modules in this tree, and nothing a Worker cannot bundle");
eq([...sb.keys()].filter((f) => /^game\//.test(f)).sort(), engine.files.filter((f) => /^game\//.test(f)), `the engine the table carries is in the tree for wrangler to bundle (${engine.files.length - 2} modules of game/), and nothing else of game/`);
ok(engine.files.every((f) => /\.mjs$/.test(f)) && !engine.files.some((f) => /^data\//.test(f)), "modules only: no card data, no JSON");
ok(engine.files.includes("game/engine/cards/definitions.mjs") && sb.has("game/engine/cards/definitions.mjs"),
  "and the cards the table plays are one of them (M5): every definition in the directory, generated as a module and bundled with the engine");
ok(sb.get(".assetsignore").toString("utf8").split("\n").includes("game/"), "and none of it is published as a file");
eq([pw.durable_objects, pw.migrations, pw.vars.PLAYTEST_TABLES, built.has("crankmagic-table.js"), [...built.keys()].some((f) => f.startsWith("game/"))], [undefined, undefined, undefined, false, false], "production binds no table, has no playtest tables, and carries neither the lobby nor the engine: Play there waits on Rob's go");
const without = (map, name) => new Map([...map].filter(([f]) => f !== name));
const playConfig = (map, change) => new Map([...map, ["wrangler.jsonc", Buffer.from(JSON.stringify(change(JSON.parse(map.get("wrangler.jsonc").toString("utf8")))))]]);
ok(verify(playConfig(sb, (c) => ({...c, durable_objects: undefined})), stagingProfile).some((p) => p.includes("does not bind TABLES")), "a Play release that binds no table is named");
ok(verify(playConfig(sb, (c) => ({...c, migrations: []})), stagingProfile).some((p) => p.includes("no migration")), "and one with no migration to make the class");
ok(verify(playConfig(sb, (c) => ({...c, main: "cloud/worker.mjs"})), stagingProfile).some((p) => p.includes(`does not run ${PLAY_WORKER}`)), "and one that runs the Worker without the table");
ok(verify(playConfig(sb, (c) => ({...c, vars: {...c.vars, PLAYTEST_TABLES: "off"}})), stagingProfile).some((p) => p.includes("playtest tables are not switched on")), "and staging's playtest tables switched off");
ok(verify(playConfig(built, (c) => ({...c, vars: {...c.vars, PLAYTEST_TABLES: "on"}})), profile).some((p) => p.includes("full record would be downloadable")), "production with playtest tables on is refused: every finished game's full record would be downloadable");
ok(verify(playConfig(built, (c) => ({...c, durable_objects: sw2.durable_objects})), profile).some((p) => p.includes("release without Play")), "and production binding a table");
ok(verify(new Map([...sb, [".assetsignore", Buffer.from(sb.get(".assetsignore").toString().replace("game/\n", ""))]]), stagingProfile).some((p) => p.includes("engine's source as files")), "a Play release that would publish the engine's source is named");
ok(verify(without(sb, "game/room/room.mjs"), stagingProfile).some((p) => p.includes("game/room/room.mjs")), "one missing a module the table imports is named");
ok(verify(new Map([...sb, ["game/engine/index.mjs", Buffer.from("export {};\n")]]), stagingProfile).some((p) => p.includes("game/engine/index.mjs is in a folder that never ships")), "and a module of game/ the Worker does not import is still something that never ships");
ok(verify(new Map([...sb, ["game/room/history.mjs", Buffer.from(`import fs from "node:fs";\n${sb.get("game/room/history.mjs")}`)]]), stagingProfile).some((p) => p.includes("imports node:fs")), "a Node import in the engine, which a Worker cannot bundle, is named");
ok(verify(without(sb, "crankmagic-board.js"), stagingProfile).some((p) => p.includes("crankmagic-board.js is Play in the cloud")), "and a Play release without the board");
ok(verify(new Map([...built, ["index.html", Buffer.from(built.get("index.html").toString().replace('<meta name="crankmagic-accounts" content="on">', ""))]]), profile).some((p) => p.includes("would stay asleep")),
  "a production page that lost its accounts-on mark is named");

console.log(`release-pages: ${checks} checks passed — ${files.length} files, Play out, Coming Soon in, nothing that never ships.`);
