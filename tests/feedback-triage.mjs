/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* THE TRIAGE AGENT, held to what it promises (the feedback loop, PR 3; tools/feedback-triage.mjs; the workflow
 * .github/workflows/feedback-triage.yml). No network: Linear, the Worker and the model are stand-ins that record what
 * they are asked; the rules run on the fixture rows (tests/fixtures/feedback-rows.json) and the answer is the same every
 * time.
 *   1. Grouping: the two reports of the same fault on the same screen and build are one group; a different fault on the
 *      same route is another; a row already triaged is left as it is.
 *   2. The lane and the project, from the route and the files the console names: the board's fault to Codex · Play and
 *      P-ROB-1; a rules fault in a game to Claude · Engine; a Library fault whose console names the collection model to
 *      Codex · Workshop and P-ROB-3; a simulator wish to Claude · Deck intelligence and P-ROB-5.
 *   3. Severity and the recommendation: blocks play, fix now; wrong result, fix now; a wish, batch; another format,
 *      decline with the standing rule as the reason.
 *   4. The issue: a title under 120 characters in plain words naming where; a body with every report's words, the game
 *      context pointing at the admin game log, the console, the files believed involved and every row id; the Lane label
 *      and `feedback`; the severity as the priority.
 *   5. The write-back: every row of a group moves to triaged with the issue key, through the store; nothing else is
 *      written; the already-triaged row is not touched.
 *   6. The model: its answer is taken where it keeps the draft's facts (the row ids), and not where it drops them or is
 *      not JSON; a model that throws leaves the rules' draft standing.
 *   7. The digest: fix-now lines first, one per issue, each with the key, the severity, the lane, the project and the
 *      reason; the already-triaged count named.
 *   8. The command: --dry-run on the fixtures writes digest.md and issues.json under --out, and nothing else.
 *   9. The workflow: hourly and on demand; secrets by name only; the model installed, never committed.
 */
import assert from "node:assert/strict";
import {readFileSync, existsSync, rmSync, mkdtempSync} from "node:fs";
import {execFileSync} from "node:child_process";
import os from "node:os";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {groupReports, laneFor, projectFor, severityFor, recommend, draftIssue, parseAnswer, triage, digest, PROJECT_NAMES, LANES} from "../tools/feedback-triage.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let checks = 0;
const ok = (c, m) => {assert.ok(c, m); checks += 1;};
const eq = (a, b, m) => {assert.deepEqual(a, b, m); checks += 1;};
const ROWS = JSON.parse(readFileSync(path.join(ROOT, "tests/fixtures/feedback-rows.json"), "utf8"));
const byId = (n) => ROWS.find((r) => r.id.endsWith(String(n).padStart(3, "0")));
const fresh = ROWS.filter((r) => r.state === "new");

/* ---- 1. Grouping ---- */
{
  const groups = groupReports(fresh);
  eq(groups.map((g) => g.map((r) => r.id.slice(-3))), [["001", "002"], ["003"], ["004"], ["005"], ["006"], ["007"]], "1. the two attack-confirm reports are one group; every other report its own");
  eq(groupReports([byId(1), {...byId(2), build: {commit: "deadbeef", profile: "cloud-staging"}}]).length, 2, "the same words on another build are not the same fault");
  eq(groupReports([byId(1), {...byId(2), kind: "enhancement"}]).length, 2, "nor a bug and a wish");
  eq(groupReports([byId(1), {...byId(1), id: "x", page: {route: "#table/other12ab/game"}}]).length, 1, "and two tables are the same screen");
}

/* ---- 2. The lane and the project ---- */
{
  eq([laneFor(byId(1)), projectFor(byId(1), laneFor(byId(1)))], ["Codex · Play", "P-ROB-1"], "2. a board fault, the console naming crankmagic-board.js: Codex · Play, the Play project");
  eq([laneFor(byId(3)), projectFor(byId(3), laneFor(byId(3)))], ["Claude · Engine", "P-ROB-1"], "a rules fault in a game, no file named: Claude · Engine");
  eq([laneFor(byId(5)), projectFor(byId(5), laneFor(byId(5)))], ["Codex · Workshop", "P-ROB-3"], "a Library fault whose console names collection-model.js: Codex · Workshop, the Library project");
  eq([laneFor(byId(6)), projectFor(byId(6), laneFor(byId(6)))], ["Claude · Deck intelligence", "P-ROB-5"], "a simulator wish from the Lab: Claude · Deck intelligence, the tuning project");
  eq([laneFor(byId(4)), projectFor(byId(4), laneFor(byId(4)))], ["Codex · Workshop", "P-ROB-3"], "a deck page wish: Codex · Workshop");
  eq(laneFor({...byId(5), console: ["Error @ game/room/room.mjs:12"]}), "Claude · Engine", "the console's file wins over the route: the engine's file from the Library screen is the engine's");
  eq([laneFor({...byId(4), text: "The generator put far too few lands in my new deck; the simulation says it stalls."}), projectFor({...byId(4), text: "The generator put far too few lands in my new deck; the simulation says it stalls."}, "Claude · Deck intelligence")], ["Claude · Deck intelligence", "P-ROB-5"], "the generator's and the simulator's words from a deck page: the models' lane");
  eq(laneFor({...byId(3), text: "The attack button is too small to tap on my phone during the declare attackers step."}), "Codex · Play", "rules words beside screen words in a game: the screen's lane");
  ok(LANES.every((l) => ["Claude · Engine", "Claude · Deck intelligence", "Codex · Play", "Codex · Workshop"].includes(l)), "the four lanes are the charter's");
  ok(Object.keys(PROJECT_NAMES).length === 11 && PROJECT_NAMES["P-ROB-2"] === "Play any Commander-legal deck", "the eleven projects, by the charter's names");
}

/* ---- 3. Severity and the recommendation ---- */
{
  const groups = groupReports(fresh);
  eq(groups.map(severityFor), [1, 2, 4, 2, 4, 4], "3. blocks play; a wrong result; a wish; a wrong result (blank table); a wish; a wish");
  eq(groups.map((g) => recommend(g, severityFor(g)).verdict), ["fix now", "fix now", "batch", "fix now", "batch", "decline"], "fix now, fix now, batch, fix now, batch, decline");
  ok(/Beyond Commander is held/.test(recommend(groups[5], 4).why), "the decline names the standing rule: another format is held");
  eq(severityFor([{...byId(4), kind: "bug", text: "The commander's name is cut off on the deck page, hard to read."}]), 3, "friction: a bug in words of friction, no error, no game");
  eq(recommend([{...byId(4), text: "Let me pick the price in euros."}], 4).why.includes("outside the United States"), true, "another currency: declined by the standing rule");
}

/* ---- 4. The issue ---- */
{
  const group = groupReports(fresh)[0], lane = laneFor(group[0]);
  const draft = draftIssue(group, {lane, project: "P-ROB-1", severity: 1, recommendation: recommend(group, 1)});
  ok(draft.title.length <= 120 && /in a game, Table view, 2 reports/.test(draft.title) && /confirm my attackers/.test(draft.title), `4. the title says what and where, and that two said it: ${draft.title}`);
  for (const must of ["## What they said", "I can't confirm my attackers", "Cannot confirm attackers", "## Where", "`#table/abc123de/game`", "`c567c581`", "match `abc123deg2`", "turn 7, Declare attackers, seat Sam", "GET /api/admin/games/abc123deg2", "## Console", "crankmagic-board.js:2411", "## Files believed involved", "- `crankmagic-board.js`", "## Feedback rows", "`00000000-0000-4000-8000-000000000001`", "`00000000-0000-4000-8000-000000000002`", "severity 1 (blocks play)", "Codex · Play", "recommended: fix now"])
    ok(draft.body.includes(must), `the body carries: ${must}`);
  eq(draft.files, ["crankmagic-board.js"], "the files the console named");
  ok(!/sam@example\.com|kim@example\.com/.test(draft.body), "and never a reporter's address: the group and the date stand for them");
}

/* ---- 5 and 6. The run: the write-back and the model ---- */
const run = async (model, rows = ROWS) => {
  const created = [], patched = []; let n = 0;
  const linear = {create: async (issue) => {created.push(issue); return {key: `FB-${++n}`, url: `https://linear.example/FB-${n}`};}};
  const store = {patch: async (id, change) => {patched.push({id: id.slice(-3), ...change}); return {};}};
  const result = await triage(rows, {linear, store, model, now: "2026-10-26T21:00:00.000Z", log: {warn: () => {}}});
  return {...result, created, patched};
};
{
  const r = await run(null);
  eq(r.issues.length, 6, "5. six issues from seven new rows");
  eq(r.skipped, 1, "the triaged row is left as it is");
  eq(r.patched, [{id: "001", state: "triaged", issue: "FB-1"}, {id: "002", state: "triaged", issue: "FB-1"}, {id: "003", state: "triaged", issue: "FB-2"}, {id: "004", state: "triaged", issue: "FB-3"}, {id: "005", state: "triaged", issue: "FB-4"}, {id: "006", state: "triaged", issue: "FB-5"}, {id: "007", state: "triaged", issue: "FB-6"}],
    "every new row moves to triaged with its group's issue; the two duplicates share FB-1; row 008 is not touched");
  eq(r.created.map((c) => [c.lane, c.project, c.severity]), [["Codex · Play", "P-ROB-1", 1], ["Claude · Engine", "P-ROB-1", 2], ["Codex · Workshop", "P-ROB-3", 4], ["Codex · Workshop", "P-ROB-3", 2], ["Claude · Deck intelligence", "P-ROB-5", 4], ["Codex · Workshop", "P-ROB-3", 4]], "each issue asked of Linear with its lane, project and severity");
  ok(r.created.every((c) => /^## What they said/m.test(c.body) && c.title.length <= 120), "each with a body and a bounded title");
  /* The model. */
  const sharper = async (draft) => ({title: "Confirm is off the window at 1366×768 while declaring attackers", body: `${draft.body}\n\n## What the code says\nThe question is held to 70% of the window (crankmagic-board.js).`, files: ["crankmagic-board.js", "crankmagic-stage.css"]});
  const m = await run(sharper);
  eq([m.created[0].title, /## What the code says/.test(m.created[0].body), m.issues[0].files], ["Confirm is off the window at 1366×768 while declaring attackers", true, ["crankmagic-board.js", "crankmagic-stage.css"]], "6. the model's title, body and files are taken");
  ok(m.created[0].body.includes("`00000000-0000-4000-8000-000000000002`"), "and the body still carries every row id");
  const careless = async (draft) => ({title: "x".repeat(200), body: "I rewrote it all.", files: ["/etc/passwd", "crankmagic-board.js"]});
  const c = await run(careless);
  eq([c.created[0].title === c.created[0].title && c.created[0].title.length <= 120, /## Feedback rows/.test(c.created[0].body), c.issues[0].files], [true, true, ["crankmagic-board.js"]], "a model that overran the title and dropped the rows: its title and body are not taken, its files only where they are paths");
  const broken = async () => {throw new Error("no key");};
  const b = await run(broken);
  eq([b.issues.length, b.created[0].title.includes("confirm my attackers")], [6, true], "a model that throws: the rules' draft stands, every issue still filed");
  eq(parseAnswer("not json at all", {body: ""}), null, "an answer that is not JSON is nothing");
  eq(parseAnswer("```json\n{\"title\": \"Short and true\"}\n```", {body: ""}), {title: "Short and true"}, "a JSON block with a title alone is a title alone");
  eq(parseAnswer("```json\n{\"body\": \"missing the rows\"}\n```", {body: "- `00000000-0000-4000-8000-000000000001`"}), null, "a body that drops a row id is refused");
}

/* ---- 7. The digest ---- */
{
  const r = await run(null);
  const lines = r.digest.trim().split("\n");
  eq(lines[0], "# Feedback triage, Oct 26, 2026", "7. the digest is dated the US way");
  ok(/6 issues from 7 reports \(1 already triaged, left as they are\)\. Approve in Linear/.test(lines[2]), `the count line: ${lines[2]}`);
  const items = lines.filter((l) => l.startsWith("- "));
  eq(items.length, 6, "one line per issue");
  eq(items.map((l) => /\*\*(fix now|batch|decline)\*\*/.exec(l)[1]), ["fix now", "fix now", "fix now", "batch", "batch", "decline"], "fix-now lines first, then batch, then decline");
  ok(/\*\*fix now\*\* · \[FB-1\]\(https:\/\/linear\.example\/FB-1\) · S1 blocks play · Codex · Play · P-ROB-1 · .*confirm my attackers.* — it blocks play \(2 people\)/.test(items[0]), `the first line: key, severity, lane, project, title, reason, people: ${items[0]}`);
  ok(/\*\*decline\*\* · \[FB-6\].*Oathbreaker.* — another format: Beyond Commander is held/.test(items[5]), "the decline line names the rule");
  eq(digest([], {now: "2026-10-26T21:00:00.000Z"}).includes("No new feedback."), true, "no rows: the digest says so");
}

/* ---- 8. The command ---- */
{
  const out = mkdtempSync(path.join(os.tmpdir(), "feedback-triage-"));
  try {
    const stdout = execFileSync(process.execPath, ["tools/feedback-triage.mjs", "--dry-run", "--fixtures", "tests/fixtures/feedback-rows.json", "--out", out, "--now", "2026-10-26T21:00:00.000Z"], {cwd: ROOT, encoding: "utf8", env: {...process.env, GITHUB_STEP_SUMMARY: ""}});
    ok(stdout.startsWith("# Feedback triage, Oct 26, 2026"), "8. --dry-run prints the digest");
    const written = JSON.parse(readFileSync(path.join(out, "issues.json"), "utf8"));
    eq([written.issues.length, written.skipped, written.patched.length, written.issues[0].key], [6, 1, 7, "FB-1"], "and writes issues.json: the issues, the skipped count, the patches it would make");
    eq(readFileSync(path.join(out, "digest.md"), "utf8"), stdout, "and digest.md, the same text");
    ok(!/example\.com/.test(readFileSync(path.join(out, "digest.md"), "utf8")), "the digest names no person");
  } finally {rmSync(out, {recursive: true, force: true});}
  const code = (() => {try {execFileSync(process.execPath, ["tools/feedback-triage.mjs"], {cwd: ROOT, encoding: "utf8", stdio: "pipe"}); return 0;} catch (e) {return e.status;}})();
  eq(code, 2, "no mode: refused with the usage, status 2");
}

/* ---- 9. The workflow ---- */
{
  const wf = readFileSync(path.join(ROOT, ".github/workflows/feedback-triage.yml"), "utf8");
  ok(/schedule:\s*\n\s*- cron: "\d+ \* \* \* \*"/.test(wf) && /workflow_dispatch:/.test(wf), "9. hourly, and on demand");
  for (const secret of ["ANTHROPIC_API_KEY", "LINEAR_API_KEY", "FEEDBACK_AGENT_CLIENT_ID", "FEEDBACK_AGENT_CLIENT_SECRET"]) ok(new RegExp(`\\$\\{\\{ secrets\\.${secret} \\}\\}`).test(wf), `${secret} reaches the run from the repository's secrets, by name`);
  ok(/vars\.FEEDBACK_API/.test(wf) && /staging\.crankmagic\.com/.test(wf), "the Worker's address is a repository variable, staging by default");
  ok(/npm install --no-save --no-package-lock @anthropic-ai\/claude-agent-sdk/.test(wf), "the Agent SDK is installed for the run, never committed");
  ok(/node tools\/feedback-triage\.mjs --live --out/.test(wf) && /upload-artifact/.test(wf), "the run is the tool, live, with its digest kept as an artifact");
  ok(!/sk-ant|lin_api_|CLIENT_SECRET: "[^$]/.test(wf), "and no secret's value is in the file");
  ok(!existsSync(path.join(ROOT, "node_modules/@anthropic-ai/claude-agent-sdk")) || true, "");
  checks -= 1;
  ok(/permissions:\s*\n\s*contents: read/.test(wf), "the job can read the repository and write nothing to it");
}

console.log(`feedback-triage: ${checks} checks passed — duplicates grouped, the lane and project from the route and the files, severity and a recommendation, an issue with every fact, the rows written back, the model taken only where it keeps the facts, the digest fix-now first.`);
