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
/* The address the app was first published at; absolute links to it are the app's own files. */
export const FIRST_PUBLIC = "https://minorrob.github.io/mtg-deck-matrix/";
export const PAGES = ["index.html", "crankmagic.html"];
export const ROOTS = ["index.html", "crankmagic.html", "graph.html", "crankmagic-sw.js", ".nojekyll"];

/* Folders that never ship, whatever references them. */
export const NEVER = /^(game|tools|tests|docs|design|prototype|graph|payload|payload_v3|schema|\.github|\.claude)\/|^data\/(engine|source|archive|game-logs)\//;

export const PROFILES = {
  pages: {
    play: "coming-soon",
    leaveOut: ["crankmagic-game.js", "crankmagic-lobby.js", "crankmagic-online.js", "crankmagic-online.css", "collection-lobby-draft.js"],
    dropConnect: ["http://127.0.0.1:8768", "https://*.trycloudflare.com"],
  },
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
    if (s.startsWith(FIRST_PUBLIC)) s = s.slice(FIRST_PUBLIC.length);
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
    out = must(out, out.replace(/(<meta charset="utf-8">\r?\n?)/i, `$1  <meta name="crankmagic-play" content="${profile.play}">\n  <meta name="crankmagic-version" content="${version}">\n`), "insert the play and version marks after <meta charset>");
    out = out.replace(/(connect-src[^;"]*)/, (csp) => profile.dropConnect.reduce((s, src) => s.replace(new RegExp(`\\s+${escape(src)}(?=[\\s;"])`, "g"), ""), csp));
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
  for (const f of profile.leaveOut) if (files.has(f)) problems.push(`${f} is Play, and Play is not in this release`);
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
  const built = new Map();
  source.readMany(files);
  for (const f of files) {
    const body = source.read(f);
    built.set(f, PAGES.includes(f) || f === "crankmagic-sw.js" ? Buffer.from(transform(f, body.toString("utf8"), {profile, version, origin})) : body);
  }
  built.set("version.json", Buffer.from(JSON.stringify({commit: source.commit, date: source.date, profile: profileName, source: source.ref, origin: origin || FIRST_PUBLIC}, null, 2) + "\n"));
  if (domain) built.set("CNAME", Buffer.from(domain + "\n"));
  return {built, problems: verify(built, profile), version, mentions, reachedFrom};
}

/* Commit the build to release/pages with plumbing and a private index: the working tree, the
   checked-out branch and the real index are never touched. */
export function commitRelease(built, {commit, version, profileName}) {
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
    if (parent && git("rev-parse", `${parent}^{tree}`) === tree) return {commit: parent, tree, unchanged: true};
    const message = `Release ${version} (${profileName}): main ${commit}\n\nBuilt by tools/release-pages.mjs from ${commit}. The web app only; Play says Coming Soon.\n`;
    const next = execFileSync("git", ["-C", ROOT, "commit-tree", tree, ...(parent ? ["-p", parent] : []), "-F", "-"], {input: message}).toString().trim();
    execFileSync("git", ["-C", ROOT, "update-ref", `refs/heads/${RELEASE_BRANCH}`, next, ...(parent ? [parent] : [])]);
    return {commit: next, tree, parent, unchanged: false};
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
    console.log(r.unchanged ? `${RELEASE_BRANCH} already holds this build (${r.commit.slice(0, 7)}); nothing committed` : `${RELEASE_BRANCH} -> ${r.commit.slice(0, 7)} (tree ${r.tree.slice(0, 7)}); not pushed. Publish with: git push origin ${RELEASE_BRANCH}`);
  }
  if (!arg("--out") && !has("--commit") && !has("--list")) console.log("Nothing written: add --out <dir>, --commit or --list.");
}
