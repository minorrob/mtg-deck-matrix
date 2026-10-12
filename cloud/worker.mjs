/* THE ACCOUNT CLOUD'S DOOR: the Worker behind crankmagic.com/api/*.
 *
 * Everything else on the site is static and never reaches this script (run_worker_first: ["/api/*"]), so
 * the pages stay free to serve and this file stays small: who is asking (access.mjs), and their library
 * (library.mjs). Rob's calls, 2026-09-24: invite-only, Google sign-in, staging first, and a conflict is put
 * to the person rather than settled here.
 *
 *   GET  /api/auth/login?to=#…     after Access has signed the person in, back to the app (a same-site path only)
 *   GET  /api/join/:table/:code    an invitation's link: back to the app at #table/<table>/<code>, after Access's sign-in
 *   GET  /api/me                   who is signed in, and the version their devices converge on
 *   GET  /api/ai-seat              whether this person may seat an AI on Claude at a new table (AI-2): {open}
 *   GET  /api/library              the head: {head} (null before a first save)
 *   PUT  /api/library              save {parent, revision, device, checksum, body, force?} -> 200 {head} | 409 {head}
 *   POST /api/library/kept         file this device's version without moving the head (the losing side of a choice)
 *   GET  /api/library/history      the versions held, newest first, without their bodies
 *   GET  /api/library/versions/:id one version with its body
 *   GET  /api/import/archidekt?id=N a public Archidekt deck, trimmed to what the importer reads; no sign-in, nothing
 *                                  stored (import.mjs, R3.10a)
 *   /api/tables/*                  Play's front door: a table's lobby and its game, each table a Durable Object
 *                                  (tables.mjs, game-room.mjs) -- shut until Play's release binds TABLES
 *   POST /api/ai/explain           a measured score read out loud by the AI, behind its own Access application, an
 *                                  allowlist, the key and the spend caps -- shut until Rob opens each (ai.mjs, M6)
 *   POST /api/ai/coach             the Coach at a table (X13): the same door, the brief built by the table for the
 *                                  asker's own seat, and its own switch, AI_COACH, until the privacy page names it
 *   POST /api/ai/advise            the deck advisor (AI-4): the same door, the brief built here from the person's own
 *                                  library in the cloud (cloud/advise.mjs); its own switch, AI_ADVISE
 *   GET  /api/ai-advise            whether this person may ask the advisor (AI-4): {open}
 *   GET  /api/ai-meter             this person's AI spending over the last 24 hours against their cap (AI-6)
 *   GET  /api/ai/login?to=#...     back to the app once signed in to the AI door
 */
import {verifyAccess, Unauthorized} from "./access.mjs";
import {createLibrary, Conflict, Invalid, LIMITS} from "./library.mjs";
import {archidekt, ImportError} from "./import.mjs";
import {createAi, settings, explain, coach, advise, readQuestion, Closed} from "./ai.mjs";
import {readAsk, openVersion, adviseBrief} from "./advise.mjs";
import {tables} from "./tables.mjs";

/** Whether this person may seat an AI on Claude: the same gates as the table's object checks when it seats one. */
/* AI COACH SETTINGS (AI-6): the person's own spending over the last 24 hours against their cap, from the call log, for
   the settings panel's meter; `open` false where the door is shut or they are not on its list. The 24 hours end at
   `now` (an ISO time), the request's clock, so a suite's fixed clock reads the window its calls were logged in. */
async function aiMeter(env, email, now) {
  if (!env.DB) return {open: false};
  let config;
  try {config = settings(env);} catch {return {open: false};}
  const ai = createAi(env.DB, {now});
  if (!(await ai.allowed(email))) return {open: false};
  const {mine} = await ai.spent(email);
  return {open: true, spentCents: Math.round(mine / 10000 * 100) / 100, capCents: config.capPerson / 10000};
}
async function aiSeatOpen(env, email, flag = "AI_PILOT") {
  if (env[flag] !== "on" || !env.DB) return false;
  try {settings(env);} catch {return false;}
  return createAi(env.DB).allowed(email);
}

/** An invitation's link, `/api/join/<table>/<code>`: where it sends the person -- the app, at the seat's fragment -- or
    null when the path is not one (the suites' browsers ask this too, behind their stand-in for Access). */
export function joinLocation(url) {
  const link = /^\/api\/join\/([a-z0-9]{8,40})\/([A-Za-z0-9_-]{20,100})$/.exec(url.pathname);
  return link ? `${url.origin}/#table/${link[1]}/${link[2]}` : null;
}

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
function fromTheApp(request, url, purpose = "sync") {
  if (request.headers.get("x-crankmagic") !== purpose) return false;
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
  if (path.startsWith("/api/ai/")) return aiDoor(request, env, deps, url, ms);
  let who;
  try {who = await verifyAccess(request, env, {fetchImpl: deps.fetchImpl, now: ms()});}
  catch (error) {
    if (error instanceof Unauthorized) return reply(401, {error: "Sign in to use your cloud library.", why: error.message});
    throw error;
  }
  if (await overLimit(env.LIMIT_PERSON, who.email)) return tooMany("your account");
  /* Recovery entry gate: keep the GameTable class/storage, but admit no new HTTP or socket
     connections while the public app has Play closed. Existing sockets and clocks are not paused. */
  if (env.PLAY_TABLES_CLOSED === "on" && (path === "/api/tables" || path.startsWith("/api/tables/") || joinLocation(url)))
    return reply(503, {error: "Play is temporarily unavailable. Your library and saved tables are kept. Try again after Play reopens."});
  /* PLAY (M5; cloud/tables.mjs): shut until Play's release binds TABLES. Its writes carry their own header, and
     its WebSocket must come from this site: a socket carries the Access cookie like any request, and a page
     elsewhere could otherwise open one to someone's seat. */
  if (path === "/api/tables" || path.startsWith("/api/tables/")) {
    const origin = request.headers.get("origin");
    if (method !== "GET" && !fromTheApp(request, url, "play")) return reply(403, {error: "That request did not come from CrankMagic."});
    if (request.headers.get("upgrade") === "websocket" && origin !== url.origin) return reply(403, {error: "That request did not come from CrankMagic."});
    return tables(request, env, who);
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
    /* AN INVITATION (cloud/tables.mjs). Access's sign-in keeps a link's path and drops its fragment, so a friend signed
       out who opened `#table/<id>/<code>` at staging, where Access guards the whole site, landed on the home page with
       the invitation gone (the readiness checks of 2026-10-04, R5). The link is this path instead, behind Access on
       every site, and comes back to the fragment once the person is in. The code reaches this Worker, as the sign-in's
       `to` already carried it; nothing here keeps it, and it seats only someone Access admits. */
    const joined = method === "GET" ? joinLocation(url) : null;
    if (joined) return new Response(null, {status: 302, headers: {location: joined, "cache-control": "no-store", "referrer-policy": "no-referrer"}});
    if (method === "GET" && path === "/api/me") return reply(200, {email: person.email, since: person.createdAt, head: await library.head(person.id)});
    /* AN AI ON CLAUDE (AI-2): New table offers one only where the table's object would seat it (cloud/game-room.mjs
       `pilotOpen`): the switch on, the door's key, caps and model set, and this person on the allowlist. */
    if (method === "GET" && path === "/api/ai-seat") return reply(200, {open: await aiSeatOpen(env, person.email)});
    /* THE DECK ADVISOR (AI-4): a deck's page offers Ask the advisor only where the door would answer this person. */
    if (method === "GET" && path === "/api/ai-advise") return reply(200, {open: await aiSeatOpen(env, person.email, "AI_ADVISE")});
    if (method === "GET" && path === "/api/ai-meter") return reply(200, await aiMeter(env, person.email, () => new Date(ms()).toISOString()));
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
      return reply(200, {deleted: {email: person.email, ...await library.forget(person.id, person.email)}});
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

/* THE AI DOOR (M6; cloud/ai.mjs, docs/ai-door.md). Its own Access application, so a library sign-in -- which may
   be the emailed code -- never opens it; then the allowlist, the key and the caps, each shut until Rob sets it. */
const AI_BODY = 64 * 1024;
const AI_ROUTES = {"/api/ai/explain": "Explain", "/api/ai/coach": "The Coach", "/api/ai/advise": "The advisor"};
async function aiDoor(request, env, deps, url, ms) {
  if (!env.AI_ACCESS_AUD) return reply(503, {error: "AI features are not switched on here yet."});
  let who;
  try {who = await verifyAccess(request, env, {fetchImpl: deps.fetchImpl, now: ms(), audience: env.AI_ACCESS_AUD});}
  catch (error) {
    if (error instanceof Unauthorized) return reply(401, {error: "Sign in to CrankMagic's AI features to use them.", why: error.message});
    throw error;
  }
  if (await overLimit(env.LIMIT_PERSON, who.email)) return tooMany("your account");
  /* Signed in to the AI door, back to the app: the board sends a person here when its first question finds them signed
     in to the library only (Access's sign-in keeps a path and drops a fragment, so the place to return is `to`). */
  if (request.method === "GET" && url.pathname === "/api/ai/login") {
    const to = url.searchParams.get("to") || "";
    const fragment = /^#[\w\-?=&%.:+~/]{0,200}$/.test(to) ? to : "";
    return new Response(null, {status: 302, headers: {location: `${url.origin}/${fragment}`, "cache-control": "no-store"}});
  }
  const feature = AI_ROUTES[url.pathname];
  if (!feature) return reply(404, {error: "No such endpoint."});
  if (request.method !== "POST") return reply(405, {error: `${feature} is a POST.`});
  if (!fromTheApp(request, url, "ai")) return reply(403, {error: "That request did not come from CrankMagic."});
  const ai = createAi(env.DB, {now: () => new Date(ms()).toISOString(), ...(deps.newId ? {newId: deps.newId} : {})});
  if (!(await ai.allowed(who.email))) return reply(403, {error: "Your account is not on CrankMagic's list for AI features. Ask the person who invited you."});
  /* The Coach sends a person's hand and board, which the privacy page must say before it is offered: its own switch. */
  if (feature === "The Coach" && env.AI_COACH !== "on") return reply(503, {error: "The Coach is not switched on here yet."});
  /* The advisor sends a deck's list and the person's own cards and lists: its own switch, as the Coach has. */
  if (feature === "The advisor" && env.AI_ADVISE !== "on") return reply(503, {error: "The deck advisor is not switched on here yet."});
  try {
    const config = settings(env);
    const text = await request.text();
    if (text.length > AI_BODY) return reply(413, {error: `That is more than ${({"Explain": "a score explanation", "The advisor": "a question for the advisor"})[feature] ?? "a question for the Coach"} needs. Nothing was sent to the AI.`});
    let input;
    try {input = JSON.parse(text);} catch {return reply(400, {error: "That request is not JSON."});}
    if (feature === "Explain") return reply(200, await explain({ai, who, input, config, fetchImpl: deps.fetchImpl || fetch}));
    /* THE ADVISOR: the brief is built here from the person's own library in the cloud (cloud/advise.mjs), never from
       anything the browser sends but the deck's id and the goal. */
    if (feature === "The advisor") {
      const {deckId, ask} = readAsk(input);
      const library = createLibrary(env.DB, {now: () => new Date(ms()).toISOString(), ...(deps.newId ? {newId: deps.newId} : {})});
      const person = await library.user(who.email), head = await library.head(person.id);
      if (!head) return reply(409, {error: "Your library is not in the cloud yet. Let this device save it, then ask again."});
      const found = await library.version(person.id, head.id);
      const brief = adviseBrief(await openVersion(found.body), deckId, ask);
      return reply(200, {...await advise({ai, who, brief, config, fetchImpl: deps.fetchImpl || fetch}), savedAt: head.savedAt});
    }
    /* THE COACH: the table builds the asking person's brief from their own seat's view (game/room/coach-brief.mjs),
       never from anything the browser sends; a person with no seat there, or no game on, is refused by the table. */
    const {tableId, question, hand} = readQuestion(input);
    if (!env.TABLES) return reply(503, {error: "Play is not switched on here yet."});
    const asked = await env.TABLES.get(env.TABLES.idFromName(tableId)).fetch(new Request(`https://table.internal/table/brief${hand ? "" : "?hand=0"}`, {headers: {"x-crankmagic-email": who.email}}));
    const found = await asked.json().catch(() => null);
    if (!asked.ok || !found?.brief) return reply(asked.ok ? 502 : asked.status, {error: found?.error || "The table could not say what is on it."});
    return reply(200, await coach({ai, who, brief: found.brief, question, config, fetchImpl: deps.fetchImpl || fetch}));
  } catch (error) {
    if (error instanceof Closed) return reply(error.status, {error: error.message});
    throw error;
  }
}

/* MONITORING (M3, docs/ops.md): one structured line for each answer the operator should hear about, for Workers Logs
   to keep and its alerts to count -- every 5xx (a 503 is a feature switched off, so an alert leaves it out by its
   status), and a save refused because the library moved on another device. The line names the route's resource
   only (/api/tables, never a table's id or an invitation's code), never the person, and for an error its name and
   where it was thrown, not its message, which can carry what was sent. */
export function opsLine(request, status, error = null) {
  const {pathname} = new URL(request.url);
  const conflict = status === 409 && request.method === "PUT" && pathname === "/api/library";
  if (status < 500 && !conflict) return null;
  const route = pathname.split("/").slice(0, 3).join("/");
  return {ops: conflict ? "sync-conflict" : "5xx", status, method: request.method, route,
    ...(error ? {error: error.name || typeof error, at: String(error.stack || "").split("\n").slice(1, 4).map((l) => l.trim()).join(" | ")} : {})};
}

/** The Worker's answer to one request, with its monitoring line. */
export async function serve(request, env, options = {}, log = console) {
  /* The platform runs this script for /api/* -- and for any path that matches no file, since a Worker
     with assets gets what the assets cannot answer. Those are not the API's: they go back to the files,
     so a mistyped address is an honest 404, not a request to sign in. */
  if (!new URL(request.url).pathname.startsWith("/api/")) return env.ASSETS ? env.ASSETS.fetch(request) : new Response("Not found", {status: 404});
  let response, failure = null;
  try {response = await handle(request, env, options);}
  catch (error) {
    failure = error;
    response = reply(500, {error: "The cloud library had a problem, and nothing was changed. Try again in a moment."});
  }
  const line = opsLine(request, response.status, failure);
  if (line) log[line.status >= 500 ? "error" : "log"](line);
  return response;
}

export default {fetch: (request, env) => serve(request, env)};
