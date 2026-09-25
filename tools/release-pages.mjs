#!/usr/bin/env node
/* THE PRODUCTION RELEASE: the web app, and only the web app, built from one commit of main.
 *
 * Rob, 2026-09-24: "I want the current git page to be the CrankMagic build minus the Play option (on
 * that tab it should say 'Coming Soon'). I want to use everything else that exists in CrankMagic
 * today as a production release." Asked what the release branch should hold, he chose ONLY THE WEB
 * APP: no game host, no Forge, no engine, no tools, tests or documents. And asked how Stages 2 and 3
 * reach main, he chose to MERGE AS WE GO behind a build switch -- which makes this file the switch:
 * main holds everything, and what a user can reach is decided here, by profile.
 *
 * WHAT IT DOES. Reads one commit (default origin/main) straight from git's object store -- never the
 * working tree, so an agent's half-finished edit cannot ship -- and walks the app's own references
 * outward from its pages and its service worker: every src and href, every url() in a stylesheet,
 * every string in a script that names a file the commit has, and every `dir/${...}.ext` template,
 * which stands for every such file in that folder. Only what the walk reaches is released. Then it
 * applies the profile:
 *
 *   pages   Play's modules are not walked and not released; their script tags leave both pages and
 *           their entries leave the service worker's shell; the pages are marked
 *           <meta name="crankmagic-play" content="coming-soon">, which crankmagic-app.js answers
 *           with the Coming Soon tab; the security policy stops allowing a connection to a game host
 *           on this machine or a tunnel, since nothing left in the page makes one.
 *
 * Every release also says what it is: <meta name="crankmagic-version"> in both pages (the Menu
 * shows it) and version.json at the root.
 *
 * WHAT IT REFUSES. A reference into a folder that never ships (game code, tools, tests, documents,
 * engine data, the source workbooks) stops the build and names the file that made it, because that
 * is either a leak or a broken link, and both want a person. So does any reference the release
 * itself cannot satisfy: a page that names a file the build left out.
 *
 * USAGE
 *   node tools/release-pages.mjs --out <empty dir>      build into a folder, to serve and test
 *   node tools/release-pages.mjs --commit               build and commit to release/pages (no push)
 *   node tools/release-pages.mjs --worktree --out <dir> preview uncommitted work (never --commit)
 *   options: --ref <commit> (default origin/main) · --origin <https://public.address/> (default: the
 *            address in the pages' canonical links) · --domain <host> (writes CNAME, GitHub Pages only)
 *            · --list prints every released file
 *
 * PUBLISHING is a separate, deliberate step: `git push origin release/pages`. The host serves that
 * branch, so a push is a production deploy -- never done without the four journeys passing on the
 * built folder first (docs/release-pages.md).
 */
import {execFileSync, spawnSync} from "node:child_process";
import {existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, mkdtempSync, rmSync} from "node:fs";
import os from "node:os";
import path from "node:path";
import {fileURLToPath} from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const RELEASE_BRANCH = "release/pages";
/* The address the pages name as their own, in their canonical and share tags; absolute links to it are the
   app's own files, and a profile with another origin (staging) has it rewritten. It was github.io until
   GitHub Pages went off on 2026-09-25; the pages name crankmagic.com since then (docs/decisions-2026-09-25.md). */
export const FIRST_PUBLIC = "https://crankmagic.com/";
/* The retired address. Nothing released may name it: it answers 404, and a library saved there is stranded. */
export const RETIRED_PUBLIC = "https://minorrob.github.io/mtg-deck-matrix/";
export const PAGES = ["index.html", "crankmagic.html"];
export const PUBLIC_CONTACT = "admin@crankmagic.com";
export const ROOTS = ["index.html", "crankmagic.html", "graph.html", "crankmagic-sw.js", ".nojekyll"];

/* Folders that never ship, whatever references them -- and the owner's own collection. data/live-state.json
   and data/live-load.json are Rob's library, which Load Live used to fetch from the site with a password
   printed in the page; Load Live is gone (Rob, 2026-09-24) and his library lives in his account now, so
   the two files stay in the repository for the tools that build them and are never served. */
export const NEVER = /^(game|tools|tests|docs|design|prototype|graph|payload|payload_v3|schema|\.github|\.claude)\/|^data\/(engine|source|archive|game-logs)\/|^data\/live-(state|load)\.json$/;

const PLAY = ["crankmagic-game.js", "crankmagic-lobby.js", "crankmagic-online.js", "crankmagic-online.css", "collection-lobby-draft.js"];
const ACCOUNTS = ["cloud-sync.js", "crankmagic-account.js"];
/* What every release shares: Play says Coming Soon, no game host, served by Cloudflare. */
const RELEASE = {
  play: "coming-soon",
  /* The browser reaches outside data only where plan-data-sync §0 allows it: Scryfall's API, and nothing else.
     Archidekt is left out of every release: its only caller is Play's deck import, which no release carries,
     and R3.10 brings Archidekt links back through a Worker route. The frozen local host keeps it until M9. */
  dropConnect: ["http://127.0.0.1:8768", "https://*.trycloudflare.com", "https://archidekt.com"],
  host: "cloudflare",
  /* Rob, 2026-09-24: "I do want the analytics." Cloudflare Web Analytics' automatic setup injects its
     beacon into every page; the policy allowed only this site's own scripts and refused it. The beacon
     loads from this host and reports to the site's own origin, which connect-src 'self' already allows. */
  scriptSources: ["https://static.cloudflareinsights.com"],
};
/* Values an Access application hands out once it exists (Zero Trust -> Access -> Applications). Until then
   a cloud profile builds but refuses to be written out or committed: verify() names what is missing. */
export const PENDING = "pending";

export const PROFILES = {
  /* Production. Rob registered crankmagic.com on Cloudflare (2026-09-24) and asked to make the cloud move now;
     he approved accounts on staging the same day ("Everything looks good!"). The pages stay public and
     signing in stays optional: only /api/* is behind the "CrankMagic accounts" Access application, whose
     policy is the invite list. */
  pages: {
    ...RELEASE, worker: "crankmagic", origin: "https://crankmagic.com/", leaveOut: PLAY, accounts: "on",
    cloud: {database: {name: "crankmagic", id: "131b2c74-70a0-471e-8474-b8d079b0d322"}, limits: {ip: "1001", person: "1002"},
      access: {team: "crankmagic.cloudflareaccess.com", aud: "ff51f3bcda0f6f50d2f48bb9d3d96b76530c128a23cdb1cc33aa4fa6d68611a3"}},
  },
  /* Stage 2 on staging.crankmagic.com, for Rob alone behind Access (Rob, 2026-09-24: staging first). */
  "cloud-staging": {
    ...RELEASE, worker: "crankmagic-staging", origin: "https://staging.crankmagic.com/", leaveOut: PLAY, accounts: "on",
    cloud: {database: {name: "crankmagic-staging", id: "b7f806ec-c9e8-4265-9f23-7d9705db9a26"}, limits: {ip: "2001", person: "2002"}, access: {team: "crankmagic.cloudflareaccess.com", aud: "213cb6b10352e5ed5525d6337f355cd5190dec402e86debd30971d3bd5bda1f5"}},
  },
};

/* Cloudflare serves the release as a Worker with static assets and no script, deployed with
   `wrangler deploy` from the very folder the acceptance walk passed on (docs/release-pages.md).
   ONE ADDRESS, ON PURPOSE: a library lives in the browser per origin, so every extra address a
   Worker answers on -- www, the free *.workers.dev name, preview URLs -- is somewhere a player could
   build a library that crankmagic.com cannot see. The Worker answers on crankmagic.com alone (a
   custom domain, which also makes its DNS record and certificate); www should redirect, not serve.
   .assetsignore keeps a clone's .git, wrangler's own .wrangler scratch folder (it writes one into the
   folder it deploys from, and its debug log walks it with the assets) and the configuration off the site. */
export const CLOUDFLARE_MAX_FILE = 25 * 1024 * 1024;
/* RATE LIMITS ON /api/* (M3): requests a minute, counted at the edge by Cloudflare's Rate Limiting bindings,
   which cloud/worker.mjs asks before it does anything. Per IP first, so a flood is turned away before any
   work; per person once Access has named them. The app saves a few seconds after a change, about twenty
   times a minute at the busiest, and a household can share one address. Each profile counts in its own
   namespaces, so staging never spends production's allowance. */
export const LIMITS_PER_MINUTE = Object.freeze({ip: 240, person: 120});
/* A profile with a cloud gets the API Worker (cloud/worker.mjs) in front of /api/* only -- every other path
   is still served straight from the assets, uninvoiced -- with its D1 database and its Access settings.
   The Worker's source ships in the release tree for wrangler to bundle, and .assetsignore keeps it (and the
   migrations) from being published as files. */
export const HOST_FILES = {
  cloudflare: ({date, origin, profile}) => ({
    "wrangler.jsonc": JSON.stringify({
      name: profile.worker,
      ...(profile.cloud ? {main: "cloud/worker.mjs"} : {}),
      compatibility_date: date,
      assets: profile.cloud ? {directory: "./", binding: "ASSETS", run_worker_first: ["/api/*"]} : {directory: "./"},
      routes: [{pattern: new URL(origin).host, custom_domain: true}],
      workers_dev: false,
      preview_urls: false,
      ...(profile.cloud ? {
        d1_databases: [{binding: "DB", database_name: profile.cloud.database.name, database_id: profile.cloud.database.id, migrations_dir: "cloud/migrations"}],
        vars: {ACCESS_TEAM_DOMAIN: profile.cloud.access.team, ACCESS_AUD: profile.cloud.access.aud},
        ratelimits: [
          {name: "LIMIT_IP", namespace_id: profile.cloud.limits.ip, simple: {limit: LIMITS_PER_MINUTE.ip, period: 60}},
          {name: "LIMIT_PERSON", namespace_id: profile.cloud.limits.person, simple: {limit: LIMITS_PER_MINUTE.person, period: 60}},
        ],
      } : {}),
    }, null, 2) + "\n",
    ".assetsignore": `.git\n.wrangler\n.assetsignore\nwrangler.jsonc\n.nojekyll\nnode_modules\n${profile.cloud ? "cloud/\n" : ""}`,
    /* Rob, 2026-09-24: "I don't want plain HTTP." Parsed by Cloudflare, never served. HSTS tells a browser
       that has been here once never to use http:// for this address again; the first visit's redirect is
       the zone's Always Use HTTPS, a setting outside what the wrangler sign-in may change. */
    "_headers": "/*\n  Strict-Transport-Security: max-age=31536000\n  X-Content-Type-Options: nosniff\n",
  }),
};

const git = (...args) => execFileSync("git", ["-C", ROOT, ...args], {encoding: "utf8", maxBuffer: 1 << 28}).trim();

/* One commit, read from the object store in a single `git cat-file --batch`. */
export function commitSource(ref = "origin/main") {
  const commit = git("rev-parse", "--verify", `${ref}^{commit}`);
  const date = git("log", "-1", "--format=%cs", commit);
  const entries = new Map();
  for (const line of git("ls-tree", "-r", "-z", commit).split("\0").filter(Boolean)) {
    const tab = line.indexOf("\t"), [mode, type, oid] = line.slice(0, tab).split(" ");
    if (type === "blob") entries.set(line.slice(tab + 1), {mode, oid});
  }
  const cache = new Map();
  const readMany = (paths) => {
    const want = paths.filter((p) => !cache.has(p));
    if (!want.length) return;
    const out = execFileSync("git", ["-C", ROOT, "cat-file", "--batch"], {input: want.map((p) => entries.get(p).oid).join("\n") + "\n", maxBuffer: 1 << 30});
    let at = 0;
    for (const p of want) {
      const nl = out.indexOf(10, at), [, , size] = out.subarray(at, nl).toString().split(" ");
      cache.set(p, out.subarray(nl + 1, nl + 1 + Number(size)));
      at = nl + 1 + Number(size) + 1;
    }
  };
  return {ref, commit, date, files: new Set(entries.keys()), entries, readMany, read: (p) => {readMany([p]); return cache.get(p);}};
}

/* The working tree as it would be committed: tracked files, current content. For the suite. */
export function worktreeSource() {
  const files = new Set(git("ls-files", "-z").split("\0").filter(Boolean).filter((f) => existsSync(path.join(ROOT, f))));
  return {ref: "worktree", commit: git("rev-parse", "HEAD"), date: new Date().toISOString().slice(0, 10), files, readMany: () => {}, read: (p) => readFileSync(path.join(ROOT, p))};
}

const TEXT = /\.(html|js|mjs|css|json|webmanifest|svg|md|txt)$/i;
const PATHLIKE = /(?:^|[^A-Za-z0-9_./-])((?:[A-Za-z0-9_.-]+\/)*[A-Za-z0-9_-][A-Za-z0-9_.-]*\.(?:js|mjs|css|json|svg|png|webp|jpe?g|gif|ico|woff2?|html|md|txt|webmanifest|xlsx|docx|pdf))(?=$|[?#"'`\s)<>,;])/g;

/* Comments are prose about files, not references to them; a docs/ path in a comment is not a leak. */
function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:\\"'`=])\/\/[^\n]*/g, (m, lead) => lead + " ".repeat(m.length - lead.length))
    .replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, " "));
}

/* Every file this text names, resolved against the files the commit has. */
export function referencesOf(file, text, files) {
  const found = new Set(), dir = path.posix.dirname(file);
  const add = (raw) => {
    let s = String(raw).trim();
    for (const own of [FIRST_PUBLIC, RETIRED_PUBLIC]) if (s.startsWith(own)) s = s.slice(own.length);
    if (!s || s.startsWith("#") || s.startsWith("//") || /^[a-z][a-z0-9+.-]*:/i.test(s)) return;
    s = s.split("#")[0].split("?")[0].replace(/^\.\//, "");
    if (!s) return;
    const relative = path.posix.normalize(path.posix.join(dir, s)), fromRoot = s.replace(/^\/+/, "");
    if (files.has(relative)) found.add(relative);
    else if (files.has(fromRoot)) found.add(fromRoot);
  };
  const code = /\.(js|mjs|html|css)$/i.test(file) ? stripComments(text) : text;
  if (/\.html?$/i.test(file)) for (const m of code.matchAll(/\b(?:src|href|content)\s*=\s*"([^"]*)"/gi)) add(m[1]);
  if (/\.(css|html?)$/i.test(file)) for (const m of code.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/gi)) add(m[1]);
  if (/\.(js|mjs|html?|json|webmanifest)$/i.test(file)) {
    for (const m of code.matchAll(PATHLIKE)) add(m[1]);
    /* `assets/mana/${symbol}.svg` names every .svg in assets/mana/ -- the folder is the reference. */
    for (const m of code.matchAll(/((?:[A-Za-z0-9_.-]+\/)+)([A-Za-z0-9_.-]*)\$\{[^}]*\}([A-Za-z0-9_.-]*)/g)) {
      const folder = m[1].replace(/^\.\//, ""), stem = m[2], suffix = m[3].split("?")[0];
      for (const f of files) {
        if (!f.startsWith(folder)) continue;
        const rest = f.slice(folder.length);
        if (!rest.includes("/") && rest.startsWith(stem) && rest.endsWith(suffix) && rest.length > stem.length + suffix.length) found.add(f);
      }
    }
  }
  found.delete(file);
  return found;
}

/* The walk. Returns the release's file list and, for each file, who first named it.
   A name inside a folder that never ships is not followed and not released -- and not an error,
   because the walk cannot tell a mention from a fetch: every data file names the tool that made it
   ("generator": "tools/..."), and Load Live tells its maintainer which tool rebuilds its file. A
   fetch of such a file would be a 404 in the release, and the journeys (docs/release-pages.md)
   are what catch that. `mentions` lists them, so a reader can check. */
export function walk(source, profile) {
  const leaveOut = new Set(profile.leaveOut), reachedFrom = new Map(), queue = [], mentions = [];
  for (const r of ROOTS) if (source.files.has(r)) {reachedFrom.set(r, "(root)"); queue.push(r);}
  while (queue.length) {
    const batch = queue.splice(0, queue.length).filter((f) => TEXT.test(f));
    source.readMany(batch);
    for (const f of batch) {
      for (const ref of referencesOf(f, source.read(f).toString("utf8"), source.files)) {
        if (reachedFrom.has(ref) || leaveOut.has(ref)) continue;
        if (NEVER.test(ref)) {mentions.push(`${f} names ${ref}`); continue;}
        reachedFrom.set(ref, f);
        queue.push(ref);
      }
    }
  }
  return {files: [...reachedFrom.keys()].sort(), reachedFrom, mentions, problems: []};
}

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/* The profile's edits to the pages and the service worker. Each edit must find what it edits. */
export function transform(file, text, {profile, version, origin}) {
  let out = text;
  const must = (before, after, what) => {if (before === after) throw Error(`${file}: ${what} -- nothing to change, so the page is not what this build expects`); return after;};
  if (PAGES.includes(file)) {
    for (const f of profile.leaveOut) {
      const tag = new RegExp(`[ \\t]*<(?:script[^>]*\\bsrc="${escape(f)}(?:\\?v=\\d+)?"[^>]*>\\s*</script>|link[^>]*\\bhref="${escape(f)}(?:\\?v=\\d+)?"[^>]*>)[ \\t]*\\r?\\n?`, "g");
      out = out.replace(tag, "");
    }
    const accounts = profile.accounts === "on" ? `  <meta name="crankmagic-accounts" content="on">\n` : "";
    out = must(out, out.replace(/(<meta charset="utf-8">\r?\n?)/i, `$1  <meta name="crankmagic-play" content="${profile.play}">\n  <meta name="crankmagic-version" content="${version}">\n${accounts}`), "insert the play and version marks after <meta charset>");
    /* The policy text is cut at its ';', so the last source is followed by nothing: hence the |$. */
    out = out.replace(/(connect-src[^;"]*)/, (csp) => profile.dropConnect.reduce((s, src) => s.replace(new RegExp(`\\s+${escape(src)}(?=[\\s;"]|$)`, "g"), ""), csp));
    if (profile.scriptSources?.length) out = must(out, out.replace(/script-src 'self'(?=[;"])/, `script-src 'self' ${profile.scriptSources.join(" ")}`), "add the profile's script sources to a script-src of 'self' alone");
    if (origin && origin !== FIRST_PUBLIC) out = out.split(FIRST_PUBLIC).join(origin);
  }
  if (file === "crankmagic-sw.js") {
    /* An entry and the comma after it; or, for the last entry in a list, the comma before it. */
    for (const f of profile.leaveOut) {
      const entry = `'${escape(f)}(?:\\?v=\\d+)?'`;
      out = out.replace(new RegExp(`${entry},[ \\t]*`, "g"), "").replace(new RegExp(`,[ \\t]*${entry}`, "g"), "");
    }
  }
  return out;
}

/* What the built folder must satisfy. Returns a list of problems; empty is a release. */
export function verify(built, profile) {
  const problems = [], files = new Set(built.keys());
  for (const f of files) if (NEVER.test(f)) problems.push(`${f} is in a folder that never ships`);
  for (const f of profile.leaveOut) if (files.has(f)) problems.push(PLAY.includes(f) ? `${f} is Play, and Play is not in this release` : `${f} is left out of this release, and is in it`);
  for (const [f, body] of built) {
    if (!TEXT.test(f)) continue;
    const text = body.toString("utf8");
    for (const f2 of profile.leaveOut) if (stripComments(text).includes(f2) && /\.(html|js)$/.test(f) && (PAGES.includes(f) || f === "crankmagic-sw.js")) problems.push(`${f} still names ${f2}`);
  }
  for (const p of PAGES) {
    const text = built.get(p)?.toString("utf8") || "";
    if (!text.includes(`<meta name="crankmagic-play" content="${profile.play}">`)) problems.push(`${p} is not marked ${profile.play}`);
    if (!/<meta name="crankmagic-version" content="[^"]+">/.test(text)) problems.push(`${p} does not say which version it is`);
    for (const src of profile.dropConnect) if (text.includes(src)) problems.push(`${p} still allows ${src}`);
    /* Scripts come from this site and the profile's named sources, and from nowhere else. */
    const scripts = (/script-src ([^;"]*)/.exec(text) || [])[1]?.trim().split(/\s+/) || [];
    const allowed = ["'self'", ...(profile.scriptSources || [])];
    if (scripts.join(" ") !== allowed.join(" ")) problems.push(`${p}'s script-src is "${scripts.join(" ")}", not "${allowed.join(" ")}"`);
  }
  if (profile.host === "cloudflare") {
    for (const [f, body] of built) if (body.length > CLOUDFLARE_MAX_FILE) problems.push(`${f} is ${(body.length / 1048576).toFixed(1)} MB, over Cloudflare's 25 MiB per file`);
    let config = null;
    try {config = JSON.parse(built.get("wrangler.jsonc")?.toString("utf8") || "");} catch {}
    if (!config || config.name !== profile.worker || config.assets?.directory !== "./") problems.push(`wrangler.jsonc does not serve the release's files from the Worker named ${profile.worker}`);
    if (!profile.cloud && config?.main) problems.push("wrangler.jsonc gives a release without a cloud a Worker script");
    if (profile.cloud) {
      /* The API runs for /api/* and nothing else, against this profile's database, as Access's audience. */
      if (config?.main !== "cloud/worker.mjs") problems.push("wrangler.jsonc does not run cloud/worker.mjs");
      if (config?.assets?.binding !== "ASSETS" || JSON.stringify(config?.assets?.run_worker_first) !== JSON.stringify(["/api/*"])) problems.push("wrangler.jsonc must run the Worker for /api/* only, with the assets bound as ASSETS");
      const db = (config?.d1_databases || [])[0];
      if (!db || db.binding !== "DB" || db.database_name !== profile.cloud.database.name || !/^[0-9a-f-]{36}$/.test(db.database_id || "")) problems.push(`wrangler.jsonc does not bind the ${profile.cloud.database.name} database as DB`);
      for (const [name, value] of Object.entries(config?.vars || {})) if (value === PENDING) problems.push(`${name} is pending: create the Access application for ${profile.origin} and put its value in PROFILES["${Object.keys(PROFILES).find((k) => PROFILES[k] === profile)}"]`);
      if (!config?.vars?.ACCESS_TEAM_DOMAIN || !config?.vars?.ACCESS_AUD) problems.push("wrangler.jsonc does not tell the Worker which Access application to trust");
      /* M3: every /api/* request is counted per IP and per person before it does any work. */
      for (const [name, limit] of [["LIMIT_IP", LIMITS_PER_MINUTE.ip], ["LIMIT_PERSON", LIMITS_PER_MINUTE.person]]) {
        const binding = (config?.ratelimits || []).find((r) => r.name === name);
        if (!binding || !/^[1-9][0-9]*$/.test(binding.namespace_id || "") || binding.simple?.limit !== limit || binding.simple?.period !== 60)
          problems.push(`wrangler.jsonc does not rate-limit /api/* with ${name} at ${limit} a minute`);
      }
      const namespaces = (config?.ratelimits || []).map((r) => r.namespace_id);
      if (new Set(namespaces).size !== namespaces.length) problems.push("wrangler.jsonc counts two rate limits in one namespace");
      if (config?.vars && "ACCESS_JWKS" in config.vars) problems.push("wrangler.jsonc hands the Worker its own signing keys (ACCESS_JWKS) -- that is for the local end-to-end run only");
      for (const f of ["cloud/worker.mjs", "cloud/access.mjs", "cloud/library.mjs"]) if (!files.has(f)) problems.push(`${f} is missing, so the Worker cannot be bundled`);
      if (![...files].some((f) => /^cloud\/migrations\/.+\.sql$/.test(f))) problems.push("the database migrations are missing");
      if (!(built.get(".assetsignore")?.toString("utf8") || "").split("\n").includes("cloud/")) problems.push(".assetsignore would publish the Worker's source as files");
    }
    for (const p of PAGES) {
      const marked = (built.get(p)?.toString("utf8") || "").includes(`<meta name="crankmagic-accounts" content="on">`);
      if (profile.accounts === "on" && !marked) problems.push(`${p} is not marked accounts-on, so the account module would stay asleep`);
      if (profile.accounts !== "on" && marked) problems.push(`${p} is marked accounts-on in a release without accounts`);
    }
    const host = profile.origin ? new URL(profile.origin).host : "";
    const routes = config?.routes || [];
    if (host && !(routes.length === 1 && routes[0].pattern === host && routes[0].custom_domain === true)) problems.push(`wrangler.jsonc does not answer on ${host} alone, as a custom domain`);
    if (config && (config.workers_dev !== false || config.preview_urls !== false)) problems.push("wrangler.jsonc leaves a workers.dev or preview address open -- a second origin, with its own browser storage");
    const ignored = (built.get(".assetsignore")?.toString("utf8") || "").split("\n");
    for (const must of [".git", ".wrangler", "wrangler.jsonc"]) if (!ignored.includes(must)) problems.push(`.assetsignore does not keep ${must} off the site`);
    if (ignored.includes("_headers")) problems.push(".assetsignore would keep _headers from Cloudflare, which reads it at deploy");
    const hsts = /^\/\*\r?\n(?:[ \t]+.*\r?\n)*?[ \t]+Strict-Transport-Security:\s*max-age=(\d+)/m.exec(built.get("_headers")?.toString("utf8") || "");
    if (!hsts || Number(hsts[1]) < 31536000) problems.push("_headers does not send Strict-Transport-Security for a year on every path -- Rob: no plain HTTP");
  }
  if (profile.origin) for (const p of PAGES) {
    const text = built.get(p)?.toString("utf8") || "";
    if (!text.includes(`<link rel="canonical" href="${profile.origin}`)) problems.push(`${p}'s canonical link is not ${profile.origin}`);
    if (profile.origin !== FIRST_PUBLIC && text.includes(FIRST_PUBLIC)) problems.push(`${p} still names ${FIRST_PUBLIC}, not its own origin`);
    if (text.includes(RETIRED_PUBLIC)) problems.push(`${p} still names the retired ${RETIRED_PUBLIC}`);
    const csp = (/connect-src([^;"]*)/.exec(text) || [])[1] || "";
    if (csp.trim() !== "'self' https://api.scryfall.com") problems.push(`${p}'s security policy lets the browser connect to more than this site and Scryfall's API (${csp.trim()}); plan-data-sync §0`);
  }
  /* ONE PUBLIC ADDRESS. Rob, 2026-09-24: "I don't want just anyone to see my personal email." Nothing
     released may name an email address but the public contact (which forwards to him); the problem masks
     what it found, so the refusal itself never prints someone's address. */
  for (const [f, body] of built) {
    if (!/\.(html|js|mjs|css|md|json|txt)$|^LICENSE$/.test(f)) continue;
    for (const m of body.toString("utf8").matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g))
      if (m[0].toLowerCase() !== PUBLIC_CONTACT) problems.push(`${f} names an email address other than ${PUBLIC_CONTACT} (${m[0].slice(0, 2)}…@${m[0].split("@")[1]})`);
  }
  /* The service worker's lists are the app's own statement of what it fetches: all must be here. */
  const sw = built.get("crankmagic-sw.js")?.toString("utf8") || "";
  for (const m of sw.matchAll(/'([^'\s]+?)(?:\?v=\d+)?'/g)) if (/\.[a-z0-9]+$/i.test(m[1]) && !files.has(m[1]) && !/^https?:/.test(m[1])) problems.push(`crankmagic-sw.js lists ${m[1]}, which the release does not have`);
  return problems;
}

/* Build: the walk, the edits, version.json (and CNAME when asked). A Map of path -> Buffer. */
export function build({source, profileName = "pages", origin = "", domain = ""}) {
  const profile = PROFILES[profileName];
  if (!profile) throw Error(`no profile ${profileName}; there is ${Object.keys(PROFILES).join(", ")}`);
  const {files, problems, mentions, reachedFrom} = walk(source, profile);
  if (problems.length) return {problems};
  const short = source.commit.slice(0, 7), version = `${short} · ${source.date}`;
  origin ||= profile.origin || "";
  const built = new Map();
  source.readMany(files);
  for (const f of files) {
    const body = source.read(f);
    built.set(f, PAGES.includes(f) || f === "crankmagic-sw.js" ? Buffer.from(transform(f, body.toString("utf8"), {profile, version, origin})) : body);
  }
  built.set("version.json", Buffer.from(JSON.stringify({commit: source.commit, date: source.date, profile: profileName, source: source.ref, origin: origin || FIRST_PUBLIC}, null, 2) + "\n"));
  if (domain) built.set("CNAME", Buffer.from(domain + "\n"));
  if (profile.host) for (const [f, text] of Object.entries(HOST_FILES[profile.host]({date: source.date, origin: origin || FIRST_PUBLIC, profile}))) built.set(f, Buffer.from(text));
  /* The Worker and its migrations, from the same commit as the pages (never walked: nothing links to them). */
  if (profile.cloud) {
    const worker = [...source.files].filter((f) => /^cloud\/[\w.-]+\.mjs$|^cloud\/migrations\/[\w.-]+\.sql$/.test(f));
    source.readMany(worker);
    for (const f of worker) built.set(f, source.read(f));
  }
  return {built, problems: verify(built, profile), version, mentions, reachedFrom};
}

/* Commit the build to release/pages with plumbing and a private index: the working tree, the
   checked-out branch and the real index are never touched. */
export const releaseBranch = (profileName) => profileName === "pages" ? RELEASE_BRANCH : `release/${profileName}`;
export function commitRelease(built, {commit, version, profileName}) {
  const RELEASE_BRANCH = releaseBranch(profileName);
  const tmp = mkdtempSync(path.join(os.tmpdir(), "release-index-"));
  try {
    const env = {...process.env, GIT_INDEX_FILE: path.join(tmp, "index")};
    const lines = [];
    for (const [f, body] of [...built].sort(([a], [b]) => a.localeCompare(b))) {
      const oid = execFileSync("git", ["-C", ROOT, "hash-object", "-w", "--stdin"], {input: body}).toString().trim();
      lines.push(`100644 ${oid}\t${f}`);
    }
    execFileSync("git", ["-C", ROOT, "update-index", "--add", "--index-info"], {input: lines.join("\n") + "\n", env});
    const tree = execFileSync("git", ["-C", ROOT, "write-tree"], {env}).toString().trim();
    const parent = spawnSync("git", ["-C", ROOT, "rev-parse", "--verify", "-q", `refs/heads/${RELEASE_BRANCH}`], {encoding: "utf8"}).stdout.trim()
      || spawnSync("git", ["-C", ROOT, "rev-parse", "--verify", "-q", `refs/remotes/origin/${RELEASE_BRANCH}`], {encoding: "utf8"}).stdout.trim();
    if (parent && git("rev-parse", `${parent}^{tree}`) === tree) return {commit: parent, tree, unchanged: true, branch: RELEASE_BRANCH};
    const message = `Release ${version} (${profileName}): main ${commit}\n\nBuilt by tools/release-pages.mjs from ${commit}. The web app only; Play says Coming Soon${PROFILES[profileName].accounts === "on" ? "; accounts on, with the API Worker" : ""}.\n`;
    const next = execFileSync("git", ["-C", ROOT, "commit-tree", tree, ...(parent ? ["-p", parent] : []), "-F", "-"], {input: message}).toString().trim();
    execFileSync("git", ["-C", ROOT, "update-ref", `refs/heads/${RELEASE_BRANCH}`, next, ...(parent ? [parent] : [])]);
    return {commit: next, tree, parent, unchanged: false, branch: RELEASE_BRANCH};
  } finally {
    rmSync(tmp, {recursive: true, force: true});
  }
}

function writeOut(built, dir) {
  if (existsSync(dir) && readdirSync(dir).length) throw Error(`${dir} is not empty; give an empty or new folder`);
  for (const [f, body] of built) {
    const full = path.join(dir, f);
    mkdirSync(path.dirname(full), {recursive: true});
    writeFileSync(full, body);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = (name, fallback = "") => {const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : fallback;};
  const has = (name) => process.argv.includes(name);
  /* --worktree previews uncommitted work; only a commit can be released. */
  if (has("--worktree") && has("--commit")) {console.error("--worktree builds a preview; a release is built from a commit (--ref)."); process.exit(2);}
  const source = has("--worktree") ? worktreeSource() : commitSource(arg("--ref", "origin/main"));
  const origin = arg("--origin"), domain = arg("--domain"), profileName = arg("--profile", "pages");
  if (origin && !/^https:\/\/[^/]+\/(?:[^?#]*\/)?$/.test(origin)) {console.error("--origin must be an https address ending in /"); process.exit(2);}
  const {built, problems, version, mentions, reachedFrom} = build({source, profileName, origin, domain});
  if (problems.length) {console.error(`release-pages: ${problems.length} problem${problems.length === 1 ? "" : "s"}, nothing written:\n  ` + problems.join("\n  ")); process.exit(1);}
  const bytes = [...built.values()].reduce((n, b) => n + b.length, 0);
  console.log(`release-pages: ${version} (${profileName}) -- ${built.size} files, ${(bytes / 1048576).toFixed(1)} MB, from ${source.commit}; ${mentions.length} mention${mentions.length === 1 ? "" : "s"} of files that never ship, not followed`);
  if (has("--list")) {
    for (const f of [...built.keys()].sort()) console.log(`  ${f.padEnd(44)} ${reachedFrom.get(f) ? "<- " + reachedFrom.get(f) : ""}`);
    for (const m of mentions) console.log("  (not followed) " + m);
  }
  if (arg("--out")) {writeOut(built, path.resolve(arg("--out"))); console.log(`written to ${path.resolve(arg("--out"))}`);}
  if (has("--commit")) {
    const r = commitRelease(built, {commit: source.commit, version, profileName});
    console.log(r.unchanged ? `${r.branch} already holds this build (${r.commit.slice(0, 7)}); nothing committed` : `${r.branch} -> ${r.commit.slice(0, 7)} (tree ${r.tree.slice(0, 7)}); not pushed. Publish with: git push origin ${r.branch}`);
  }
  if (!arg("--out") && !has("--commit") && !has("--list")) console.log("Nothing written: add --out <dir>, --commit or --list.");
}
