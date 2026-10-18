/* The program readout's feeds, validated: a malformed feed fails CI before it reaches Rob's page.
 *
 * WHY A SUITE FOR JSON. docs/readout/index.html (Linear ROB-138) is the one page Rob opens to see every feature
 * in his words, where it stands and what remains. Five AI systems on three platforms edit its inputs: one feed each
 * under docs/readout/feeds/, and north-star.json for the outcomes. Nothing else checks those files. A feed with a
 * misspelled status, an outcome key that no longer exists, or a "done" item that still claims hours would render
 * as a wrong number on a page whose whole job is to be trusted at a glance. So the rules in docs/readout/README.md
 * are asserted here, by file and by item, and the message names the offender.
 *
 * WHAT IT HOLDS. For every workstream named in north-star.json: its feed exists, names itself correctly, carries a
 * real timestamp and a "now" sentence; every item has a Linear ID, a known outcome, a feature in words, a known
 * status, a number of hours that is zero when done and present when not; IDs are unique within a feed; every ask
 * of Rob has an ID, an ask and a recommendation; no feed carries an email address or a token-shaped string (the
 * same classes tools/local-ci.sh scans for). The page's own HTML is checked to reference the files it reads.
 *
 * THE BREAKS are game/tools/batch/breaks-readout-feeds.py: a done item that keeps hours, an outcome renamed under
 * the feeds, an address planted in a note. Each must fail here; the restored files pass.
 */
import assert from "node:assert/strict";
import {readFile, readdir} from "node:fs/promises";

const ROOT = new URL("../", import.meta.url);
const READOUT = new URL("./docs/readout/", ROOT);
const STATUSES = new Set(["backlog", "in_progress", "review", "blocked", "done", "held"]);
const WORKSTREAMS = new Set(["claude-engine", "claude-deck", "codex-play", "codex-workshop", "grok"]);
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const TOKEN = /\b(sk-[A-Za-z0-9]{10,}|re_[A-Za-z0-9]{10,}|ghp_[A-Za-z0-9]{10,}|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,})\b/;
let checks = 0;
const ok = (cond, msg) => { checks++; assert.ok(cond, msg); };

const json = async (name) => JSON.parse(await readFile(new URL(name, READOUT), "utf8"));
const ns = await json("north-star.json");

ok(Array.isArray(ns.outcomes) && ns.outcomes.length >= 10, "north-star.json names the outcomes");
ok(Array.isArray(ns.workstreams) && ns.workstreams.length === WORKSTREAMS.size, "north-star.json names the five workstreams");
ok(typeof ns.hours_per_day === "number" && ns.hours_per_day > 0, "north-star.json sets hours_per_day");
ok(typeof ns.linear_issue_base === "string" && ns.linear_issue_base.startsWith("https://linear.app/"), "north-star.json has the Linear issue base");
const outcomeKeys = new Set(ns.outcomes.map((o) => o.key));
ok(outcomeKeys.size === ns.outcomes.length, "outcome keys are unique");
for (const o of ns.outcomes) {
  ok(/^[a-z-]+$/.test(o.key), `outcome key ${o.key} is a slug`);
  ok(Number.isInteger(o.n) && o.n >= 1, `outcome ${o.key} is numbered`);
  ok(typeof o.title === "string" && o.title.length > 10, `outcome ${o.key} has Rob's title`);
  ok(o.project && /^P-ROB-\d+$/.test(o.project.id) && /^https:\/\/linear\.app\//.test(o.project.url), `outcome ${o.key} names its Linear project`);
  ok(Array.isArray(o.milestones) && o.milestones.length >= 1 && o.milestones.every((m) => m.code && m.name), `outcome ${o.key} lists milestones`);
  ok(typeof o.launch_line === "string" && o.launch_line.length > 20, `outcome ${o.key} has a launch line`);
  for (const lead of o.leads || []) ok(WORKSTREAMS.has(lead), `outcome ${o.key} lead ${lead} is a workstream`);
}
for (const w of ns.workstreams) {
  ok(WORKSTREAMS.has(w.key), `workstream ${w.key} is one of the five`);
  ok(w.feed === `feeds/${w.key}.json`, `workstream ${w.key} reads feeds/${w.key}.json`);
}

/* The feeds directory holds exactly the five, so a sixth file (a typo, a stale copy) is noticed. */
const files = (await readdir(new URL("./feeds/", READOUT))).filter((f) => f.endsWith(".json")).sort();
assert.deepEqual(files, [...WORKSTREAMS].sort().map((k) => `${k}.json`), "feeds/ holds exactly one file per workstream");

for (const w of ns.workstreams) {
  const raw = await readFile(new URL(w.feed, READOUT), "utf8");
  ok(!EMAIL.test(raw), `${w.feed} carries no email address`);
  ok(!TOKEN.test(raw), `${w.feed} carries no token-shaped string`);
  const f = JSON.parse(raw);
  ok(f.workstream === w.key, `${w.feed} names its workstream (${f.workstream})`);
  ok(!Number.isNaN(Date.parse(f.updated)) && /^\d{4}-\d{2}-\d{2}T/.test(f.updated), `${w.feed} has an ISO-8601 updated timestamp`);
  ok(typeof f.now === "string" && f.now.trim().length >= 10, `${w.feed} says what it is doing now`);
  ok(typeof f.branch === "string" && f.branch.length > 0, `${w.feed} names its branch`);
  ok(Array.isArray(f.items), `${w.feed} has items`);
  const ids = new Set();
  for (const it of f.items) {
    const where = `${w.feed} item ${it.id}`;
    ok(/^ROB-\d+$/.test(it.id || ""), `${where} has a Linear ID`);
    ok(!ids.has(it.id), `${where} appears once in its feed`);
    ids.add(it.id);
    ok(outcomeKeys.has(it.outcome), `${where} names a known outcome (${it.outcome})`);
    ok(typeof it.feature === "string" && it.feature.length >= 8, `${where} describes the feature in words`);
    ok(STATUSES.has(it.status), `${where} has a known status (${it.status})`);
    ok(typeof it.remaining_hours === "number" && it.remaining_hours >= 0, `${where} has remaining_hours`);
    if (it.status === "done") ok(it.remaining_hours === 0, `${where} is done, so its remaining_hours is 0 (was ${it.remaining_hours})`);
    if (it.status === "held") ok(it.remaining_hours === 0, `${where} is held, so its remaining_hours is 0`);
    for (const e of it.evidence || []) ok(e.label && /^https?:\/\//.test(e.url || ""), `${where} evidence has a label and a URL`);
  }
  for (const a of f.asks_of_rob || []) {
    ok(/^ROB-\d+$/.test(a.id || ""), `${w.feed} ask ${a.id} has a Linear ID`);
    ok(typeof a.ask === "string" && a.ask.length >= 8, `${w.feed} ask ${a.id} says what Rob must do`);
    ok(typeof a.recommendation === "string" && a.recommendation.length >= 3, `${w.feed} ask ${a.id} carries a recommendation`);
  }
  for (const b of f.blocked_on || []) {
    ok(/^ROB-\d+$/.test(b.id || "") && typeof b.by === "string" && b.by.length > 3, `${w.feed} block ${b.id} names what blocks it`);
    ok(WORKSTREAMS.has(b.owner) || b.owner === "rob", `${w.feed} block ${b.id} names who owns the block (${b.owner})`);
  }
}

/* The page reads these names; a rename on one side without the other would show an empty readout. */
const html = await readFile(new URL("index.html", READOUT), "utf8");
ok(html.includes('readJson("north-star.json")'), "index.html reads north-star.json");
ok(html.includes("raw.githubusercontent.com/minorrob/mtg-deck-matrix/main/docs/readout/"), "index.html reads main's raw files by default");
ok(html.includes("readJson(w.feed)"), "index.html reads each workstream's feed from north-star.json");
ok(!EMAIL.test(html), "index.html carries no email address");

console.log(`readout-feeds: ${checks} checks passed — ${ns.workstreams.length} feeds, ${ns.outcomes.length} outcomes, every item with a known outcome, status and hours.`);
