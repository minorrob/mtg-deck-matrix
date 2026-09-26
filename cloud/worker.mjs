/* THE ACCOUNT CLOUD'S DOOR: the Worker behind crankmagic.com/api/*.
 *
 * Everything else on the site is static and never reaches this script (run_worker_first: ["/api/*"]), so
 * the pages stay free to serve and this file stays small: who is asking (access.mjs), and their library
 * (library.mjs). Rob's calls, 2026-09-24: invite-only, Google sign-in, staging first, and a conflict is put
 * to the person rather than settled here.
 *
 *   GET  /api/auth/login?to=#…     after Access has signed the person in, back to the app (a same-site path only)
 *   GET  /api/me                   who is signed in, and the version their devices converge on
 *   GET  /api/library              the head: {head} (null before a first save)
 *   PUT  /api/library              save {parent, revision, device, checksum, body, force?} -> 200 {head} | 409 {head}
 *   POST /api/library/kept         file this device's version without moving the head (the losing side of a choice)
 *   GET  /api/library/history      the versions held, newest first, without their bodies
 *   GET  /api/library/versions/:id one version with its body
 *   GET  /api/import/archidekt?id=N a public Archidekt deck, trimmed to what the importer reads; no sign-in, nothing
 *                                  stored (import.mjs, R3.10a)
 */
import {verifyAccess, Unauthorized} from "./access.mjs";
import {createLibrary, Conflict, Invalid, LIMITS} from "./library.mjs";
import {archidekt, ImportError} from "./import.mjs";

const HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
  "cross-origin-resource-policy": "same-origin",
  "referrer-policy": "no-referrer",
};
const reply = (status, value) => new Response(JSON.stringify(value), {status, headers: HEADERS});

/* RATE LIMITS (M3, docs/plan-to-100.md): per IP before anything else is done, and per person once Access has
   said who they are. Cloudflare's Rate Limiting bindings count at the edge; tools/release-pages.mjs configures
   both (LIMITS_PER_MINUTE there) and refuses a cloud release without them. The app saves a few seconds after
   a change, about twenty times a minute at the busiest, so a person meeting the limit is not using the app.
   A refusal says what happened and what to do, as the repository's rule asks. */
async function overLimit(binding, key) {
  if (!binding || !key) return false;
  const {success} = await binding.limit({key});
  return !success;
}
const tooMany = (who) => new Response(JSON.stringify({error: `Too many requests from ${who}. Nothing was changed. Wait a minute, then try again.`, retryAfterSeconds: 60}),
  {status: 429, headers: {...HEADERS, "retry-after": "60"}});

/* A write must come from the app itself. The Access cookie rides along on any request to this site, so a
   page elsewhere could otherwise post to it; a custom header cannot be sent cross-site without a CORS
   preflight this Worker never answers, and the Origin, when the browser sends one, must be this site. */
function fromTheApp(request, url) {
  if (request.headers.get("x-crankmagic") !== "sync") return false;
  if (!(request.headers.get("content-type") || "").startsWith("application/json")) return false;
  const origin = request.headers.get("origin");
  return !origin || origin === url.origin;
}

async function body(request) {
  const text = await request.text();
  if (text.length > LIMITS.body + 4096) throw new Invalid("that request is larger than a library the cloud can hold");
  try {return JSON.parse(text);} catch {throw new Invalid("that request is not JSON");}
}

/* `deps` lets the suite stand in for the network and the clock: {fetchImpl, now (ms), newId}. */
export async function handle(request, env, deps = {}) {
  const url = new URL(request.url), path = url.pathname, method = request.method;
  const ms = () => deps.now ?? Date.now();
  if (await overLimit(env.LIMIT_IP, request.headers.get("cf-connecting-ip"))) return tooMany("this network");
  /* IMPORT BY LINK needs no account: a first visit can start from a deck it already has. It is still the app's
     alone -- a custom header a page elsewhere cannot send without a preflight this Worker never answers, and the
     Origin, when there is one, this site -- and it writes nothing, so it is answered before anyone is asked who
     they are. Signed-out visitors reach it only once Access lets /api/import/* through (a Bypass policy, Rob's
     dashboard step at release; docs/plan-account-cloud.md). */
  if (path === "/api/import/archidekt") {
    const origin = request.headers.get("origin");
    if (method !== "GET") return reply(405, {error: "Import is a GET."});
    if (request.headers.get("x-crankmagic") !== "import" || (origin && origin !== url.origin)) return reply(403, {error: "That request did not come from CrankMagic."});
    try {return reply(200, {deck: await archidekt(url.searchParams.get("id"), {fetchImpl: deps.fetchImpl || fetch})});}
    catch (error) {if (error instanceof ImportError) return reply(error.status, {error: error.message}); throw error;}
  }
  let who;
  try {who = await verifyAccess(request, env, {fetchImpl: deps.fetchImpl, now: ms()});}
  catch (error) {
    if (error instanceof Unauthorized) return reply(401, {error: "Sign in to use your cloud library.", why: error.message});
    throw error;
  }
  if (await overLimit(env.LIMIT_PERSON, who.email)) return tooMany("your account");
  if (method !== "GET" && !fromTheApp(request, url)) return reply(403, {error: "That request did not come from CrankMagic."});

  const library = createLibrary(env.DB, {now: () => new Date(ms()).toISOString(), ...(deps.newId ? {newId: deps.newId} : {})});
  const person = await library.user(who.email);
  try {
    if (method === "GET" && path === "/api/auth/login") {
      /* Only a fragment of this app may be the destination: never another site, never another path. */
      const to = url.searchParams.get("to") || "";
      const fragment = /^#[\w\-?=&%.:+~/]{0,200}$/.test(to) ? to : "";
      return new Response(null, {status: 302, headers: {location: `${url.origin}/${fragment}`, "cache-control": "no-store"}});
    }
    if (method === "GET" && path === "/api/me") return reply(200, {email: person.email, since: person.createdAt, head: await library.head(person.id)});
    if (method === "GET" && path === "/api/library") return reply(200, {head: await library.head(person.id)});
    if (method === "PUT" && path === "/api/library") {
      const input = await body(request);
      return reply(200, {head: await library.save(person.id, input, {force: input.force === true})});
    }
    if (method === "POST" && path === "/api/library/kept") return reply(201, {kept: await library.keep(person.id, await body(request))});
    if (method === "GET" && path === "/api/library/history") return reply(200, {versions: await library.history(person.id, Number(url.searchParams.get("limit")) || 30)});
    /* DELETE ACCOUNT. The body repeats the address the person is signed in as: the dialog asks them to type
       it, and a request that does not carry it -- a replayed or mistaken one -- deletes nothing. Signing in
       again later starts an empty account; removing the sign-in itself is Access's, and Rob's runbook step. */
    if (method === "DELETE" && path === "/api/account") {
      const input = await body(request);
      if (String(input.confirm || "").trim().toLowerCase() !== person.email) return reply(400, {error: "Type the address you are signed in as to delete this account. Nothing was deleted."});
      return reply(200, {deleted: {email: person.email, ...await library.forget(person.id)}});
    }
    const version = /^\/api\/library\/versions\/([0-9a-f-]{36})$/.exec(path);
    if (method === "GET" && version) {
      const found = await library.version(person.id, version[1]);
      return found ? reply(200, {version: found}) : reply(404, {error: "That version is not in your cloud library."});
    }
    return reply(404, {error: "No such endpoint."});
  } catch (error) {
    if (error instanceof Conflict) return reply(409, {error: "Your library changed on another device since this one last saved.", head: error.head});
    if (error instanceof Invalid) return reply(400, {error: `The cloud refused that: ${error.message}.`});
    throw error;
  }
}

export default {
  async fetch(request, env) {
    /* The platform runs this script for /api/* -- and for any path that matches no file, since a Worker
       with assets gets what the assets cannot answer. Those are not the API's: they go back to the files,
       so a mistyped address is an honest 404, not a request to sign in. */
    if (!new URL(request.url).pathname.startsWith("/api/")) return env.ASSETS ? env.ASSETS.fetch(request) : new Response("Not found", {status: 404});
    try {return await handle(request, env);}
    catch (error) {
      console.error("crankmagic api:", error && error.stack || error);
      return reply(500, {error: "The cloud library had a problem, and nothing was changed. Try again in a moment."});
    }
  },
};
