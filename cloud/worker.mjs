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
 */
import {verifyAccess, Unauthorized} from "./access.mjs";
import {createLibrary, Conflict, Invalid, LIMITS} from "./library.mjs";

const HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
  "cross-origin-resource-policy": "same-origin",
  "referrer-policy": "no-referrer",
};
const reply = (status, value) => new Response(JSON.stringify(value), {status, headers: HEADERS});

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
  let who;
  try {who = await verifyAccess(request, env, {fetchImpl: deps.fetchImpl, now: ms()});}
  catch (error) {
    if (error instanceof Unauthorized) return reply(401, {error: "Sign in to use your cloud library.", why: error.message});
    throw error;
  }
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
    try {return await handle(request, env);}
    catch (error) {
      console.error("crankmagic api:", error && error.stack || error);
      return reply(500, {error: "The cloud library had a problem, and nothing was changed. Try again in a moment."});
    }
  },
};
