#!/usr/bin/env node
/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* STAGING, READ BACK BY A SESSION (the review response's L6; Part 7's G-C "the version read back").
 *
 * Staging's Access guards the whole site, so a session reaches it only as the Access service token Rob made for it
 * ("crankmagic-staging-checks", admitted by staging's "Session checks" policy, 2026-10-06), given to a session's
 * environment as CF_ACCESS_CLIENT_ID and CF_ACCESS_CLIENT_SECRET -- never on a command line, never in a file, never
 * printed. This reads what staging serves: version.json (the release's commit, date and profile), both pages'
 * crankmagic-version, and /api/me, which a release that seats the token (SERVICE_SEATS, cloud/access.mjs) answers as
 * the session's checks. With --expect <commit>, it fails unless staging serves that release.
 *
 *   node tools/staging-check.mjs [--expect <commit>] [--base https://staging.crankmagic.com]
 *
 * Exit 0 when staging answers as expected, 1 when it does not, 2 when the token is not in the environment.
 * It reads the WebSocket of no table: this container's network proxy carries none (docs/ACTIVE.md).
 */
import {fileURLToPath} from "node:url";

export async function check({base = "https://staging.crankmagic.com", expect = null, id, secret, fetchImpl = fetch} = {}) {
  const headers = {"CF-Access-Client-Id": id, "CF-Access-Client-Secret": secret};
  /* Access answers a token it does not admit with a redirect to its sign-in (its team's domain, or /cdn-cgi/access/), or
     403. Any other redirect is staging's own -- its static files drop ".html", /crankmagic.html answering 307 to
     /crankmagic -- and is followed, on the same site only, the token's headers with it. */
  const read = async (path, hops = 0) => {
    const at = new URL(path, base), response = await fetchImpl(at, {headers, redirect: "manual"});
    if (response.status >= 300 && response.status < 400) {
      const to = new URL(response.headers.get("location") || "/", at);
      if (to.origin !== at.origin || to.pathname.startsWith("/cdn-cgi/access/") || hops >= 3) return {status: response.status, refused: "Access did not admit the service token (a redirect to its sign-in)"};
      return read(to.pathname + to.search, hops + 1);
    }
    return {status: response.status, text: await response.text()};
  };
  const problems = [];
  const version = await read("/version.json");
  let release = null;
  if (version.refused || version.status !== 200) problems.push(version.refused ?? `version.json answered ${version.status}`);
  else {
    try { release = JSON.parse(version.text); } catch { problems.push("version.json is not JSON"); }
  }
  const pages = {};
  for (const page of ["/", "/crankmagic.html"]) {
    const got = await read(page);
    pages[page] = got.status === 200 ? (/<meta name="crankmagic-version" content="([^"]+)">/.exec(got.text) ?? [])[1] ?? null : null;
    if (!pages[page]) problems.push(`${page} does not say its version (${got.refused ?? got.status})`);
  }
  const me = await read("/api/me");
  let who = null;
  if (me.status === 200) { try { who = JSON.parse(me.text).email ?? null; } catch { /* reported below */ } }
  if (who !== "service:session-checks") problems.push(`/api/me does not seat the service token (${me.refused ?? me.status}${who ? `, as ${who}` : ""}): a release before L6, or SERVICE_SEATS off`);
  if (release && expect && !String(release.commit ?? "").startsWith(expect) && !String(expect).startsWith(release.commit ?? "-"))
    problems.push(`staging serves ${release.commit}, not ${expect}`);
  if (release && release.profile !== "cloud-staging") problems.push(`staging serves the ${release.profile} profile`);
  return {release, pages, who, problems};
}

/** The token from the environment, its names in any case: an environment's settings may keep the case they were typed in
    (CF_Access_Client_Secret), and Linux's names are case-sensitive. Never printed. */
export function credentials(env) {
  const named = (name) => env[name] ?? Object.entries(env).find(([k]) => k.toUpperCase() === name)?.[1];
  return {id: named("CF_ACCESS_CLIENT_ID"), secret: named("CF_ACCESS_CLIENT_SECRET")};
}

async function main(argv) {
  const arg = (name) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : undefined; };
  const {id, secret} = credentials(process.env);
  if (!id || !secret) {
    console.error("staging-check: CF_ACCESS_CLIENT_ID and CF_ACCESS_CLIENT_SECRET are not in this environment. Add them in the cloud environment's settings (docs/review-response-2026-10-05.md §6.2, A5); a new session receives them.");
    return 2;
  }
  const result = await check({base: arg("base") ?? undefined, expect: arg("expect") ?? null, id, secret});
  console.log(`staging-check: ${result.release ? `${result.release.commit} (${result.release.profile}, ${result.release.date})` : "no version read"}; pages ${JSON.stringify(result.pages)}; /api/me ${result.who ?? "-"}`);
  for (const problem of result.problems) console.log(`  problem: ${problem}`);
  return result.problems.length ? 1 : 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) process.exit(await main(process.argv.slice(2)));
