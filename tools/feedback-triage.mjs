/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* THE TRIAGE AGENT (the feedback loop, PR 3; docs/feedback-loop/PLAN-2026-10-26.html, section 3; the contract is
 * docs/feedback-loop/CrankFeedback.md).
 *
 * Runs on GitHub Actions hourly and on demand (.github/workflows/feedback-triage.yml). It reads the rows in state `new`
 * from the Worker's admin route with its own Access service token, groups duplicates, picks the lane from the charter's
 * file table (docs/program/README.md, section 3) by the route and the files the console names, sets a severity (1 blocks
 * play, 2 wrong result, 3 friction, 4 wish), drafts a title and a body, creates the Linear issue in the outcome project
 * the route maps to (Rob's call D3, on the default) with the Lane label and a `feedback` label, writes the issue key back
 * to every row of the group (state `triaged`), and writes a digest: one line per issue with its recommendation (fix now,
 * batch, decline with a reason). The agent never executes a fix; its only writes are Linear issues and the rows' state.
 *
 * The rules do the classifying, so a run is the same on the same rows. The model (Claude Haiku 5.5 through the Claude
 * Agent SDK, the repository checked out so it can read the code a report points at) sharpens the title, the body and the
 * list of files it believes are involved; when it is not reachable, or answers badly, the rules' draft stands.
 *
 *   node tools/feedback-triage.mjs --dry-run --fixtures tests/fixtures/feedback-rows.json [--out work/triage]
 *       the rules on fixture rows; nothing read or written outside --out
 *   node tools/feedback-triage.mjs --live [--out work/triage] [--no-model]
 *       FEEDBACK_API (https://staging.crankmagic.com), CF_ACCESS_CLIENT_ID and CF_ACCESS_CLIENT_SECRET (the agent's
 *       service token), LINEAR_API_KEY, ANTHROPIC_API_KEY (the model; left out, the rules' draft stands). Secrets reach
 *       this file from the environment only: never on a command line, never in a file.
 */
import {readFile, writeFile, mkdir, appendFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath, pathToFileURL} from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/* ---- The charter's file table, by prefix: a file the console names says whose lane the report is ---- */
export const LANES = Object.freeze(["Claude · Engine", "Claude · Deck intelligence", "Codex · Play", "Codex · Workshop"]);
const FILE_LANES = [
  [/^game\//, "Claude · Engine"], [/^cloud\/(worker|play-worker|game-room|tables|ai|access|feedback)\.mjs$/, "Claude · Engine"], [/^cloud\/migrations\//, "Claude · Engine"],
  [/^cloud\/(advise|advice-contract|import)/, "Claude · Deck intelligence"],
  [/^(deck-generator|draft-builder|lineup-model|compliance-model|slot-model|card-classify|custom-model|deck-measure|sim-engine|sim-worker|crankmagic-sim|pilot-policy|crankmagic-strategies|crankmagic-loops|crankmagic-graph|crankmagic-graph-scoped|graph-payload|crankmagic-rules|edhrec-client|scryfall-client|crankmagic-card-client|card-catalog|card-images|card-link|deck-sources|deck-import|shop-export|guide-agent|guide-measured)\.js$/, "Claude · Deck intelligence"],
  [/^(crankmagic-board|crankmagic-table|crankmagic-tabletop|crankmagic-seat-art|crankmagic-sea|crankmagic-audio|crankmagic-stage|crankmagic-stage-tables|crankmagic-stage-paint|crankmagic-mats|crankmagic-online|crankmagic-lobby|crankmagic-game|crankmagic-sandbox|crankmagic-settings-play)\.(js|css)$/, "Codex · Play"],
  [/^cloud\/(library|sharing|access-invites|mail)\.mjs$/, "Codex · Workshop"],
  [/\.(js|css|html)$/, "Codex · Workshop"],
];
/* The screens, by route, to a lane and the outcome project the route maps to (docs/program/README.md, section 1). */
const ROUTES = [
  [/^#table\b|^#game\b/, "Codex · Play", "P-ROB-1"],
  [/^#cards\b/, "Codex · Workshop", "P-ROB-3"],
  [/^#decks\?.*\bnew\b|^#newdeck\b|^#lab\b/, "Claude · Deck intelligence", "P-ROB-4"],
  [/^#decks\b|^#pull\b|^#change\b/, "Codex · Workshop", "P-ROB-3"],
  [/^#discover\b/, "Codex · Workshop", "P-ROB-5"],
  [/^#buy\b|^#orders\b|^#trade\b/, "Codex · Workshop", "P-ROB-6"],
  [/^#settings\b|^#welcome\b|^#$|^$/, "Codex · Workshop", "P-ROB-7"],
  [/^#share\b|^#social\b/, "Codex · Workshop", "P-ROB-9"],
];
const ENGINE_WORDS = /\b(rule|rules|engine|stack|trigger|triggers|priority|resolve|resolved|mana|tapped|untap|target|targets|counter|counters|damage|refused|illegal|legality|can'?t play|cannot play|not playable|commander tax|phase|step)\b/i;
const DECK_WORDS = /\b(simulat\w*|generator|generated|synergy|synergies|composition|price|prices|buy ?list|recommend\w*|graph|edhrec|scryfall|strategy|strategies)\b/i;
/* Stuck, not wrong: a thing that cannot be done at all. A wrong answer the game went on from is severity 2. */
const BLOCKING = /\b(can'?t|cannot|unable|stuck|frozen|freeze|freezes|froze|crash\w*|blank|nothing happens|won'?t|hangs?|hung|not responding|no way to)\b/i;
const FRICTION = /\b(hard to|confusing|unclear|too small|too big|slow|annoying|awkward|hidden|hard to find|too many clicks|typo|misspell\w*|overlap\w*|cut off)\b/i;
const OUT_OF_SCOPE = [
  [/\b(oathbreaker|standard|modern|pioneer|legacy|vintage|pauper|brawl)\b/i, "another format: Beyond Commander is held until the initial launch is done (P-ROB-11)"],
  [/\b(euros?|eur|pounds? sterling|gbp|yen|currency switch|british|metric)\b/i, "anything from outside the United States is refused, not built (AGENTS.md, The United States, always)"],
  [/\b(small|medium|large) (size )?buttons?\b|\bS\/M\/L\b/i, "sizes are sliders, never steps (AGENTS.md)"],
];

/* ---- Words, for grouping and titles ---- */
/* The words of a report, lightly stemmed (scrolling, scrolls and scrolled are one word), the small ones left out. */
const stem = (w) => w.replace(/'(s|t|re|ve|ll|d)$/, "").replace(/(ing|ed|es|s)$/, (m, _, i, s) => (s.length - m.length >= 3 ? "" : m));
const words = (text) => String(text || "").toLowerCase().replace(/[^a-z0-9' ]+/g, " ").split(/\s+/).map(stem).filter((w) => w.length > 2 && !STOP.has(w));
const STOP = new Set(["the", "and", "but", "for", "with", "that", "this", "when", "then", "was", "were", "are", "its", "it's", "you", "your", "from", "have", "has", "had", "not", "can", "could", "should", "would", "there", "here", "into", "onto", "out", "off", "all", "any", "one", "two", "too", "very", "just", "than", "them", "they", "what", "which", "where", "while", "does", "did", "doing", "also", "please"]);
const bag = (list) => new Set(list);
const jaccard = (a, b) => {if (!a.size && !b.size) return 1; let both = 0; for (const x of a) if (b.has(x)) both += 1; return both / (a.size + b.size - both);};
const routeKey = (route) => String(route || "").split("?")[0].replace(/\/[a-z0-9]{8,40}\/[A-Za-z0-9_-]{20,100}$/, "").replace(/\/[a-z0-9]{8,40}(\/game)?$/, "/*");
/* The file a console line names, repository-relative: "crankmagic-board.js:1234" or ".../game/room/room.mjs:12:3". */
const filesNamed = (report) => {
  const found = new Set();
  for (const line of report.console || []) for (const m of String(line).matchAll(/([A-Za-z0-9_./-]+\.(?:m?js|css))(?::\d+)?/g)) found.add(m[1].replace(/^.*?((?:game|cloud|tools)\/|[^/]+$)/, "$1"));
  return [...found];
};

/* ---- 1. Group duplicates: the same route and build, and similar text (the words two reports share, over the words of
   both: the same fault said twice shares about half; two faults on one screen share a few) ---- */
export const SIMILAR = 0.4;
export function groupReports(rows) {
  const groups = [];
  for (const row of rows) {
    const key = `${routeKey(row.page && row.page.route)}|${row.build && row.build.commit}`, grams = bag(words(row.text));
    const home = groups.find((g) => g.key === key && g.kind === row.kind && jaccard(g.grams, grams) >= SIMILAR);
    if (home) {home.rows.push(row); for (const t of grams) home.grams.add(t);}
    else groups.push({key, kind: row.kind, grams, rows: [row]});
  }
  return groups.map(({rows: members}) => members);
}

/* ---- 2. The lane and the project ---- */
export function laneFor(report) {
  const route = (report.page && report.page.route) || "", text = `${report.text || ""} ${(report.console || []).join(" ")}`;
  const named = filesNamed(report).map((f) => FILE_LANES.find(([re]) => re.test(f))?.[1]).filter(Boolean);
  if (named.length) {
    /* The console says which file threw: the engine's and the models' before the screens', whose errors often show in them. */
    for (const lane of ["Claude · Engine", "Claude · Deck intelligence", "Codex · Play", "Codex · Workshop"]) if (named.includes(lane)) return lane;
  }
  const byRoute = ROUTES.find(([re]) => re.test(route));
  if (byRoute && byRoute[1] === "Codex · Play" && (report.game || /^#table/.test(route)) && ENGINE_WORDS.test(text) && !/\b(button|drawer|click|tap|drag|scroll|layout|screen|window|zoom|camera|slider|font|color|animation)\b/i.test(text)) return "Claude · Engine";
  if (byRoute && byRoute[1] === "Codex · Workshop" && DECK_WORDS.test(text) && /^#(decks|discover|lab)/.test(route)) return "Claude · Deck intelligence";
  return byRoute ? byRoute[1] : "Codex · Workshop";
}
export function projectFor(report, lane) {
  const route = (report.page && report.page.route) || "", text = report.text || "";
  if (lane === "Claude · Engine") return /\b(can'?t play|cannot play|not playable|unknown card|refused|on the list)\b/i.test(text) || /^#decks/.test(route) ? "P-ROB-2" : "P-ROB-1";
  if (lane === "Claude · Deck intelligence") return /simulat|synerg|tuning|measure/i.test(text) ? "P-ROB-5" : DECK_WORDS.test(text) && /price|buy/i.test(text) ? "P-ROB-6" : /^#discover/.test(route) ? "P-ROB-5" : "P-ROB-4";
  const byRoute = ROUTES.find(([re]) => re.test(route));
  if (/\b(share|shared|sharing|invite)\b/i.test(text)) return "P-ROB-9";
  if (/\b(theme|themes|preferences?|settings?|reduce motion|tailor\w*)\b/i.test(text) && lane === "Codex · Workshop") return "P-ROB-7";
  return byRoute ? byRoute[2] : "P-ROB-10";
}

/* ---- 3. Severity: 1 blocks play, 2 wrong result, 3 friction, 4 wish ---- */
export function severityFor(members) {
  const text = members.map((r) => r.text || "").join(" "), kind = members[0].kind;
  const inGame = members.some((r) => r.game), errors = members.some((r) => (r.console || []).length);
  if (kind === "enhancement") return 4;
  if (inGame && (BLOCKING.test(text) || errors)) return 1;
  if (FRICTION.test(text) && !BLOCKING.test(text) && !errors) return 3;
  return 2;
}
export const SEVERITY_WORDS = Object.freeze({1: "blocks play", 2: "wrong result", 3: "friction", 4: "wish"});

/* ---- 4. The recommendation: fix now, batch, or decline with a reason ---- */
export function recommend(members, severity) {
  const text = members.map((r) => r.text || "").join(" ");
  for (const [re, why] of OUT_OF_SCOPE) if (re.test(text)) return {verdict: "decline", why};
  if (severity <= 2) return {verdict: "fix now", why: severity === 1 ? "it blocks play" : "a wrong result"};
  return {verdict: "batch", why: severity === 3 ? "friction, with the next pass on that screen" : `a wish${members.length > 1 ? `, asked ${members.length} times` : ""}`};
}

/* ---- 5. The draft: a title in Rob's wording (what, where, the fact), and a body with the reproduction and the metadata ---- */
const SCREEN = (r) => (r.page && (r.page.screen || r.page.route)) || "the app";
const sentence = (text) => {const first = String(text || "").trim().split(/(?<=[.!?])\s|\n/)[0] || ""; return first.length > 90 ? `${first.slice(0, 87).trimEnd()}…` : first;};
export function draftIssue(members, {lane, project, severity, recommendation}) {
  const first = members[0], where = first.game ? `in a game, ${first.page && first.page.view ? `${first.page.view} view` : "the board"}` : `on ${SCREEN(first)}`;
  const title = `${sentence(first.text).replace(/[.]$/, "")} (${where}${members.length > 1 ? `, ${members.length} reports` : ""})`;
  const lines = [];
  lines.push(`**Feedback from ${members.length} ${members.length === 1 ? "person" : "people"}** · ${first.kind} · severity ${severity} (${SEVERITY_WORDS[severity]}) · ${lane} · recommended: ${recommendation.verdict}, ${recommendation.why}.`, "");
  lines.push("## What they said");
  for (const r of members) lines.push(`- ${String(r.text || "").replace(/\s+/g, " ").trim()} *(${r.group}, ${r.createdAt ? r.createdAt.slice(0, 10) : "undated"})*`);
  lines.push("", "## Where");
  lines.push(`- Route \`${first.page && first.page.route}\`, screen ${SCREEN(first)}${first.page && first.page.view ? `, view ${first.page.view}` : ""}; build \`${first.build && first.build.commit}\` (${first.build && first.build.profile}).`);
  if (first.game) lines.push(`- Game: table \`${first.game.tableId || "?"}\`, match \`${first.game.matchId || "?"}\`, turn ${first.game.turn ?? "?"}${first.game.step ? `, ${first.game.step}` : ""}${first.game.seat ? `, seat ${first.game.seat}` : ""}${first.game.decisionId ? `, decision \`${first.game.decisionId}\`` : ""}${first.game.lastLine ? `; last line: "${first.game.lastLine}"` : ""}. The record: the admin game log, \`GET /api/admin/games/${first.game.matchId || "<match>"}\`.`);
  if (first.deck) lines.push(`- Deck: ${first.deck.name || first.deck.id || "?"}${first.deck.card ? `; the card under the pointer: ${first.deck.card}` : ""}.`);
  if (first.device) lines.push(`- Device: ${first.device.viewport ? `${first.device.viewport.width}×${first.device.viewport.height}` : "?"} at ${first.device.pixelRatio ?? "?"}x, ${first.device.pointer || "?"} pointer, ${first.device.browser || "?"}${first.device.reducedMotion ? ", reduced motion" : ""}${first.device.theme ? `, ${first.device.theme}` : ""}.`);
  const console_ = members.flatMap((r) => r.console || []).slice(0, 20);
  if (console_.length) lines.push("", "## Console", "```", ...console_, "```");
  const files = [...new Set(members.flatMap(filesNamed))];
  lines.push("", "## Files believed involved", ...(files.length ? files.map((f) => `- \`${f}\``) : ["- (none named by the console; the lane's screen files for the route)"]));
  lines.push("", "## Feedback rows", ...members.map((r) => `- \`${r.id}\``));
  return {title, body: lines.join("\n"), files};
}

/* ---- 6. The model: sharpens the draft; the rules' draft stands when it cannot ---- */
const DEFAULT_MODEL = "claude-haiku-5-5";
/** The model through the Claude Agent SDK, with the repository to read (Read, Grep, Glob only). Returns a function
    (draft, group) -> {title, body, files} or null. */
export async function agentModel({cwd = ROOT, model = process.env.FEEDBACK_MODEL || DEFAULT_MODEL, log = console} = {}) {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  let sdk;
  try {sdk = await import("@anthropic-ai/claude-agent-sdk");} catch (error) {log.warn(`The Claude Agent SDK is not installed (${error.message}); the rules' draft stands.`); return null;}
  return async (draft, members) => {
    const prompt = `You are triaging feedback for CrankMagic, a Commander deck and play app in this repository. Read the files the report names (and docs/program/README.md section 3 for who owns which file) with Read, Grep and Glob, then answer with one JSON object in a \`\`\`json block and nothing else:
{"title": "<a title in plain words: what, where, the fact; under 90 characters; American English>", "body": "<the body below, kept whole, with a '## What the code says' section added: the function or file where the reported behavior comes from, in two or three sentences, with file paths>", "files": ["<repository-relative paths you believe are involved, at most 6>"]}

The draft title: ${draft.title}

The draft body:
${draft.body}`;
    try {
      let answer = "";
      for await (const message of sdk.query({prompt, options: {model, cwd, maxTurns: 12, allowedTools: ["Read", "Grep", "Glob"], permissionMode: "bypassPermissions", systemPrompt: "Read, then answer with the JSON asked for. Never edit a file."}})) {
        if (message.type === "result" && typeof message.result === "string") answer = message.result;
      }
      return parseAnswer(answer, draft);
    } catch (error) {log.warn(`The model did not answer for "${draft.title}": ${error.message}; the rules' draft stands.`); return null;}
  };
}
/** The model's answer, taken only where it keeps the draft's facts: a title under 120 characters, a body that still carries
    every feedback row id, files that are paths. */
export function parseAnswer(answer, draft) {
  const m = /```json\s*([\s\S]*?)```/.exec(String(answer || "")) || [null, String(answer || "")];
  let value;
  try {value = JSON.parse(m[1]);} catch {return null;}
  return vetAnswer(value, draft);
}
/** What a model's answer may change, whatever model gave it: the parts that keep the draft's facts, and nothing else. */
export function vetAnswer(value, draft) {
  if (!value || typeof value !== "object") return null;
  const out = {};
  if (typeof value.title === "string" && value.title.trim() && value.title.trim().length <= 120) out.title = value.title.trim();
  if (typeof value.body === "string" && draft.body.match(/`[0-9a-f-]{36}`/g)?.every((id) => value.body.includes(id))) out.body = value.body;
  if (Array.isArray(value.files)) out.files = value.files.filter((f) => typeof f === "string" && /^[A-Za-z0-9_./-]+$/.test(f) && !f.startsWith("/")).slice(0, 6);
  return Object.keys(out).length ? out : null;
}

/* ---- 7. Linear: the team by key, the labels by name (feedback made once), the project by its identifier ---- */
const LINEAR = "https://api.linear.app/graphql";
export function linearClient({key = process.env.LINEAR_API_KEY, team = process.env.LINEAR_TEAM || "ROB", fetchImpl = fetch} = {}) {
  if (!key) throw new Error("LINEAR_API_KEY is not set.");
  const gql = async (query, variables = {}) => {
    const r = await fetchImpl(LINEAR, {method: "POST", headers: {"content-type": "application/json", authorization: key}, body: JSON.stringify({query, variables})});
    const value = await r.json().catch(() => ({}));
    if (!r.ok || value.errors) throw new Error(`Linear answered ${r.status}: ${(value.errors || []).map((e) => e.message).join("; ") || "no detail"}`);
    return value.data;
  };
  let cache = null;
  async function lookups() {
    if (cache) return cache;
    const data = await gql(`query($key: String!) { teams(filter: {key: {eq: $key}}) { nodes { id key labels(first: 100) { nodes { id name } } projects(first: 50) { nodes { id name slugId } } } } }`, {key: team});
    const t = data.teams.nodes[0];
    if (!t) throw new Error(`Linear has no team ${team}.`);
    const labels = new Map(t.labels.nodes.map((l) => [l.name, l.id]));
    if (!labels.has("feedback")) {
      const made = await gql(`mutation($input: IssueLabelCreateInput!) { issueLabelCreate(input: $input) { issueLabel { id name } } }`, {input: {teamId: t.id, name: "feedback", color: "#F2994A", description: "Filed by the feedback triage agent from a person's report (the feedback loop)."}});
      labels.set("feedback", made.issueLabelCreate.issueLabel.id);
    }
    const projects = await gql(`query { projects(first: 50) { nodes { id name } } }`);
    return (cache = {teamId: t.id, labels, projects: projects.projects.nodes});
  }
  return {
    async create({title, body, lane, project, severity}) {
      const {teamId, labels, projects} = await lookups();
      const labelIds = [labels.get("feedback"), labels.get(lane)].filter(Boolean);
      /* The project by the charter's identifier is its position in the readout's list: P-ROB-n names the project whose
         name the charter gives; matched on the charter's names (docs/program/README.md, section 1). */
      const name = PROJECT_NAMES[project];
      const found = name ? projects.find((p) => p.name.toLowerCase().startsWith(name.toLowerCase())) : null;
      const data = await gql(`mutation($input: IssueCreateInput!) { issueCreate(input: $input) { issue { identifier url } } }`,
        {input: {teamId, title, description: body, labelIds, priority: severity, ...(found ? {projectId: found.id} : {})}});
      return {key: data.issueCreate.issue.identifier, url: data.issueCreate.issue.url, project: found ? found.name : null};
    },
  };
}
export const PROJECT_NAMES = Object.freeze({
  "P-ROB-1": "Play: an exceptional Commander game", "P-ROB-2": "Play any Commander-legal deck", "P-ROB-3": "Library", "P-ROB-4": "Deck creation", "P-ROB-5": "Deck tuning",
  "P-ROB-6": "Buying cards", "P-ROB-7": "CrankMagic tailored to me", "P-ROB-8": "AI in action", "P-ROB-9": "Share deck builds", "P-ROB-10": "Joyful end to end", "P-ROB-11": "Beyond Commander",
});

/* ---- 8. The store: the Worker's admin routes, with the agent's service token ---- */
export function storeClient({api = process.env.FEEDBACK_API || "https://staging.crankmagic.com", id = process.env.CF_ACCESS_CLIENT_ID, secret = process.env.CF_ACCESS_CLIENT_SECRET, fetchImpl = fetch} = {}) {
  if (!id || !secret) throw new Error("CF_ACCESS_CLIENT_ID and CF_ACCESS_CLIENT_SECRET (the agent's service token) are not set.");
  const headers = {"CF-Access-Client-Id": id, "CF-Access-Client-Secret": secret};
  const answer = async (r) => {const value = await r.json().catch(() => ({})); if (!r.ok) throw new Error(`The Worker answered ${r.status}: ${value.error || "no detail"}`); return value;};
  return {
    async list(state = "new") {
      const out = []; let since = null;
      for (let page = 0; page < 50; page++) {
        const url = new URL("/api/admin/feedback", api); url.searchParams.set("state", state); url.searchParams.set("limit", "200"); if (since) url.searchParams.set("since", since);
        const {feedback} = await answer(await fetchImpl(url, {headers, redirect: "manual"}));
        out.push(...feedback);
        if (feedback.length < 200) break;
        since = feedback[feedback.length - 1].createdAt;
      }
      return out;
    },
    async patch(id, change) {
      return (await answer(await fetchImpl(new URL(`/api/admin/feedback/${id}`, api), {method: "PATCH", redirect: "manual", headers: {...headers, "content-type": "application/json", "x-crankmagic": "feedback-admin"}, body: JSON.stringify(change)}))).feedback;
    },
  };
}

/* ---- 9. The run ---- */
/**
 * Triage `rows` (the store's `new` rows): one issue per group, written back to every row of the group.
 * @param rows the rows, as the admin route answers them
 * @param linear {create({title, body, lane, project, severity}) -> {key, url}}
 * @param store {patch(id, {state, issue})}
 * @param model (draft, members) -> {title?, body?, files?} | null, or null for the rules alone
 * @returns {Promise<{issues, digest, skipped}>}
 */
export async function triage(rows, {linear, store, model = null, now = new Date().toISOString(), log = console} = {}) {
  const fresh = rows.filter((r) => r.state === "new" && !r.issue), skipped = rows.length - fresh.length;
  const issues = [];
  for (const members of groupReports(fresh)) {
    const lane = laneFor(members[0]), project = projectFor(members[0], lane), severity = severityFor(members), recommendation = recommend(members, severity);
    let draft = draftIssue(members, {lane, project, severity, recommendation});
    if (model) {
      const better = await model(draft, members).then((v) => vetAnswer(v, draft), (error) => {log.warn(`The model failed on "${draft.title}": ${error.message}`); return null;});
      if (better) draft = {...draft, ...better};
    }
    const made = await linear.create({title: draft.title, body: draft.body, lane, project, severity});
    for (const r of members) await store.patch(r.id, {state: "triaged", issue: made.key});
    issues.push({key: made.key, url: made.url, title: draft.title, lane, project, severity, kind: members[0].kind, recommendation, rows: members.map((r) => r.id), reporters: [...new Set(members.map((r) => r.reporter))].length, files: draft.files});
  }
  return {issues, digest: digest(issues, {now, skipped}), skipped};
}

/** The digest: one line per issue with its recommendation, the fix-now lines first. */
export function digest(issues, {now = new Date().toISOString(), skipped = 0} = {}) {
  const order = {"fix now": 0, batch: 1, decline: 2};
  const sorted = [...issues].sort((a, b) => order[a.recommendation.verdict] - order[b.recommendation.verdict] || a.severity - b.severity);
  const when = new Date(now);
  const date = `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][when.getUTCMonth()]} ${when.getUTCDate()}, ${when.getUTCFullYear()}`;
  const lines = [`# Feedback triage, ${date}`, "", issues.length ? `${issues.length} issue${issues.length === 1 ? "" : "s"} from ${issues.reduce((n, i) => n + i.rows.length, 0)} report${issues.reduce((n, i) => n + i.rows.length, 0) === 1 ? "" : "s"}${skipped ? ` (${skipped} already triaged, left as they are)` : ""}. Approve in Linear: the label on the issue is the record.` : "No new feedback.", ""];
  for (const i of sorted) lines.push(`- **${i.recommendation.verdict}** · ${i.url ? `[${i.key}](${i.url})` : i.key} · S${i.severity} ${SEVERITY_WORDS[i.severity]} · ${i.lane} · ${i.project} · ${i.title} — ${i.recommendation.why}${i.reporters > 1 ? ` (${i.reporters} people)` : ""}`);
  return lines.join("\n") + "\n";
}

/* ---- The command ---- */
async function main(argv) {
  const flag = (name) => argv.includes(name);
  const value = (name, fallback = null) => {const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : fallback;};
  const out = value("--out"), dry = flag("--dry-run"), live = flag("--live");
  if (!dry && !live) {console.error("Say --dry-run --fixtures <rows.json>, or --live."); process.exit(2);}
  let rows, linear, store, model = null;
  if (dry) {
    rows = JSON.parse(await readFile(path.resolve(value("--fixtures", "tests/fixtures/feedback-rows.json")), "utf8"));
    let n = 0; const patched = [];
    linear = {create: async (issue) => ({key: `FB-${++n}`, url: null, issue})};
    store = {patch: async (id, change) => {patched.push({id, ...change}); return {id, ...change};}};
    const result = await triage(rows, {linear, store, model, now: value("--now", new Date().toISOString())});
    result.patched = patched;
    await report(result, out);
    return;
  }
  store = storeClient(); linear = linearClient();
  if (!flag("--no-model")) model = await agentModel();
  rows = await store.list("new");
  const result = await triage(rows, {linear, store, model});
  await report(result, out);
}
async function report(result, out) {
  if (out) {
    await mkdir(out, {recursive: true});
    await writeFile(path.join(out, "digest.md"), result.digest);
    await writeFile(path.join(out, "issues.json"), JSON.stringify({issues: result.issues, skipped: result.skipped, ...(result.patched ? {patched: result.patched} : {})}, null, 2) + "\n");
  }
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, result.digest);
  process.stdout.write(result.digest);
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main(process.argv.slice(2)).catch((error) => {console.error(`feedback-triage: ${error.message}`); process.exit(1);});
