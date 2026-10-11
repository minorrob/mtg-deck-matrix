/* PLAYTEST FINDINGS HAVE ONE SHAPE (docs/uat/playtest-findings.md, docs/plan-to-100.md M8). Grok Bot's agents hand
 * over one row per finding; a row the triage loop cannot read -- a missing column, a severity outside S1-S4, a class
 * it does not know -- is refused here rather than discovered halfway through a triage. A closed row says how: a fixed one
 * names its PR, one ruled as intended its CR rule and why (tools/playtest-triage.mjs reads the same columns). Every
 * playtest CSV under docs/uat/ is checked: the template, and each run's findings once they arrive. */
import assert from "node:assert/strict";
import {readFileSync, readdirSync, statSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {COLUMNS, cells, unanswered} from "../tools/playtest-triage.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let checks = 0;
const ok = (c, m) => {assert.ok(c, m); checks += 1;};

const files = [];
(function walk(dir) {for (const f of readdirSync(dir)) {const p = path.join(dir, f); if (statSync(p).isDirectory()) walk(p); else if (/playtest.*\.csv$/.test(f)) files.push(p);}})(path.join(ROOT, "docs", "uat"));
ok(files.some((f) => f.endsWith("playtest-findings-template.csv")), "the template is there");
for (const f of files) {
  const name = path.relative(ROOT, f), lines = readFileSync(f, "utf8").split(/\r?\n/).filter(Boolean);
  ok(JSON.stringify(cells(lines[0])) === JSON.stringify(COLUMNS), `${name} has the columns, in order: ${COLUMNS.join(", ")}`);
  const ids = new Set();
  for (const [i, line] of lines.slice(1).entries()) {
    const row = Object.fromEntries(cells(line).map((v, k) => [COLUMNS[k], v]));
    const where = `${name} row ${i + 2}`;
    ok(cells(line).length === COLUMNS.length, `${where} has ${COLUMNS.length} cells`);
    ok(/^PT-[A-Za-z0-9-]+$/.test(row.id) && !ids.has(row.id) && ids.add(row.id), `${where}: its id is PT-<run>-<nn>, and unique`);
    ok(row.game_id && row.seat && row.happened && row.should_have && row.evidence, `${where}: the game, the seat, what happened, what should have and the evidence are filled in`);
    ok(/^\d+$/.test(row.turn), `${where}: the turn is a number`);
    ok(["S1", "S2", "S3", "S4"].includes(row.severity), `${where}: severity is S1-S4`);
    ok(["rules", "card", "ui", "performance", "ux"].includes(row.class), `${where}: class is rules, card, ui, performance or ux`);
    ok(["open", "fixed", "as-intended"].includes(row.status), `${where}: status is open, fixed or as-intended`);
    ok(!row.cr_rule || /^CR \d{3}(\.\d+[a-z]?)?$/.test(row.cr_rule), `${where}: a rule is cited as CR 510.1a`);
    ok(row.status !== "open" || !row.outcome, `${where}: an open finding has no outcome yet`);
    for (const owed of unanswered(row)) ok(false, `${where}: ${owed}`);
  }
}
console.log(`playtest-findings: ${checks} checks passed — ${files.length} playtest CSV${files.length === 1 ? "" : "s"} in the one shape the triage loop reads.`);
