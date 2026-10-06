/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* STAGING READ BACK BY A SESSION (tools/staging-check.mjs; the review response's L6, Part 7's G-C).
 *
 * The tool sends the Access service token's two headers and reads version.json, both pages' crankmagic-version and
 * /api/me. Here a stand-in for staging answers as staging would: admitted and seated, refused (Access's redirect to its
 * sign-in), a release from before the token was seated (/api/me 401), and a release other than the one expected.
 */
import assert from "node:assert/strict";
import {check} from "../tools/staging-check.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const RELEASE = {commit: "abcdef1234567890", date: "2026-10-06", profile: "cloud-staging"};
const page = (v) => `<!doctype html><meta charset="utf-8">\n  <meta name="crankmagic-version" content="${v}">`;
/* Staging, as a fetch: `admit` the service token or not, `seated` its identity or not, the release it serves. */
function staging({admit = true, seated = true, release = RELEASE} = {}) {
  const seen = [];
  const fetchImpl = async (url, init) => {
    seen.push({path: new URL(url).pathname, headers: init.headers});
    if (!admit || init.headers["CF-Access-Client-Id"] !== "id" || init.headers["CF-Access-Client-Secret"] !== "secret")
      return new Response(null, {status: 302, headers: {location: "https://crankmagic.cloudflareaccess.com/cdn-cgi/access/login"}});
    const path = new URL(url).pathname;
    if (path === "/version.json") return new Response(JSON.stringify(release), {status: 200});
    if (path === "/" || path === "/crankmagic.html") return new Response(page(`${release.commit.slice(0, 7)} · ${release.date}`), {status: 200});
    if (path === "/api/me") return seated ? new Response(JSON.stringify({email: "service:session-checks"}), {status: 200}) : new Response(JSON.stringify({error: "Sign in."}), {status: 401});
    return new Response("no", {status: 404});
  };
  return {fetchImpl, seen};
}

{
  const {fetchImpl, seen} = staging();
  const got = await check({id: "id", secret: "secret", expect: "abcdef1", fetchImpl});
  eq([got.problems, got.release.commit, got.who, Object.values(got.pages)], [[], "abcdef1234567890", "service:session-checks", ["abcdef1 · 2026-10-06", "abcdef1 · 2026-10-06"]],
    "admitted and seated: the release, both pages' version and the session's checks read back, nothing wrong");
  ok(seen.every((s) => s.headers["CF-Access-Client-Id"] === "id" && s.headers["CF-Access-Client-Secret"] === "secret"), "every request carried the service token's two headers");
}
{
  const got = await check({id: "id", secret: "wrong", fetchImpl: staging().fetchImpl});
  ok(got.problems.some((p) => /did not admit the service token/.test(p)) && got.release === null, "a token Access does not admit: said so, nothing read");
}
{
  const got = await check({id: "id", secret: "secret", fetchImpl: staging({seated: false}).fetchImpl});
  ok(got.problems.some((p) => /does not seat the service token \(401/.test(p)), "a release before the token was seated: said so (/api/me 401)");
}
{
  const got = await check({id: "id", secret: "secret", expect: "1234567", fetchImpl: staging().fetchImpl});
  ok(got.problems.some((p) => /serves abcdef1234567890, not 1234567/.test(p)), "another release than the one expected: said so");
  const prod = await check({id: "id", secret: "secret", fetchImpl: staging({release: {...RELEASE, profile: "pages"}}).fetchImpl});
  ok(prod.problems.some((p) => /serves the pages profile/.test(p)), "and production's profile served at staging: said so");
}

console.log(`staging-check: ${checks} checks passed -- a session reads staging back through the Access service token: the release, both pages' version and the seated identity, and says what is wrong when Access refuses, the release is old, or it is not the one expected.`);
