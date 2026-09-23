/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* EVERY `CR` CITATION IN THE ENGINE, CHECKED AGAINST THE ACTUAL COMPREHENSIVE RULES.
 *
 * `docs/engine/PLAN.md` §3.2.5: "Each rules module cites the CR section it implements in its header
 * comment." There are now several hundred of those citations, and every one was written from
 * memory. A rule number is the most authoritative-looking thing a comment can contain and the
 * easiest to be quietly wrong about — nobody checks a number that is already in the file, and a
 * wrong one sends the next reader to a rule about something else entirely.
 *
 * LOCAL-ONLY, AND THE RULES TEXT IS NOT IN THIS REPOSITORY. The Comprehensive Rules are Wizards'
 * copyrighted text. `ADR-001` and §12.5 are about keeping Wizards' content out of the product and
 * easily separable from Rob's IP, so this reads the rules from outside the repository — the same
 * arrangement `engine-inventory.mjs` has with Forge through `CRANKMAGIC_FORGE_ROOT`. Nothing is
 * copied in; only the verdict is committed.
 *
 *   node game/tools/check-citations.mjs           report
 *   node game/tools/check-citations.mjs --write   report, and write docs/engine/citations.md
 *
 * Get the rules with:
 *   curl -o "$CRANKMAGIC_RULES_ROOT/MagicCompRules-<date>.txt" \
 *     "https://media.wizards.com/2026/downloads/MagicCompRules%20<date>.txt"
 * The current link is on https://magic.wizards.com/en/rules.
 *
 * COMMANDER IS CR 903 AND THERE IS NO SEPARATE RULEBOOK. The Commander Rules Committee dissolved on
 * 30 September 2024 and handed the format to Wizards; the format's rules are CR 903 and the banned
 * list is Wizards' own. `mtgcommander.net` is the old committee's site and is historical.
 */

import {readFileSync, readdirSync, writeFileSync, existsSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..");
const RULES_ROOT = process.env.CRANKMAGIC_RULES_ROOT
  ?? path.resolve(REPO, "..", "rules");

/* Where citations live. The engine and its suites; nothing in the page layer cites the CR. */
const SCAN = [
  path.join(REPO, "game", "engine"),
  path.join(REPO, "tests"),
];
const SCAN_FILE = (file) => file.endsWith(".mjs") && (!file.startsWith("tests") || path.basename(file).startsWith("engine-"));

function newestRules() {
  if (!existsSync(RULES_ROOT)) return null;
  const files = readdirSync(RULES_ROOT).filter((f) => /^MagicCompRules.*\.txt$/i.test(f)).sort();
  return files.length === 0 ? null : path.join(RULES_ROOT, files[files.length - 1]);
}

/**
 * Every rule number the Comprehensive Rules actually define.
 *
 * The document numbers them two different ways and both have to be read: a top-level rule is
 * `509.1.` with a trailing dot, and a sub-rule is `509.1a` with a space after the letter. A scan
 * that only knows the first finds no sub-rules at all and reports every one of them as invented.
 */
function readRules(file) {
  const text = readFileSync(file, "utf8");
  const numbers = new Set();
  const sections = new Set();
  for (const line of text.split(/\r?\n/)) {
    const top = /^(\d{3}\.\d+)\.\s/.exec(line);
    if (top) { numbers.add(top[1]); sections.add(top[1].slice(0, 3)); continue; }
    const sub = /^(\d{3}\.\d+[a-z])\s/.exec(line);
    if (sub) { numbers.add(sub[1]); sections.add(sub[1].slice(0, 3)); }
  }
  const effective = /effective as of ([^.]+)\./i.exec(text.slice(0, 500));
  return {numbers, sections, effective: effective ? effective[1].trim() : "unknown", file};
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, {withFileTypes: true})) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith(".mjs")) out.push(full);
  }
  return out;
}

/* A citation is `CR` followed by numbers. The forms that actually appear: a specific rule
   (`CR 704.5g`), a top-level rule (`CR 400.7`), a bare section (`CR 903`), and lists or ranges
   (`CR 106, 107, 118`, `CR 611 to 613`) — which are several citations in one phrase. */
function citationsIn(text) {
  const found = [];
  for (const match of text.matchAll(/\bCR\s+((?:\d{3}(?:\.\d+[a-z]?)?)(?:\s*(?:,|to|and|-|–)\s*\d{3}(?:\.\d+[a-z]?)?)*)/g)) {
    for (const piece of match[1].split(/\s*(?:,|to|and|-|–)\s*/)) {
      const token = piece.trim();
      if (token) found.push({token, at: match.index});
    }
  }
  return found;
}

const rulesFile = newestRules();
if (!rulesFile) {
  console.error(`No Comprehensive Rules found in ${RULES_ROOT}.`);
  console.error("This tool is local-only: the rules are Wizards' text and are deliberately not in the repository.");
  console.error("Download the current .txt from https://magic.wizards.com/en/rules into that folder, or set CRANKMAGIC_RULES_ROOT.");
  process.exit(2);
}

const rules = readRules(rulesFile);
const files = SCAN.flatMap((dir) => (existsSync(dir) ? walk(dir) : []))
  .filter((full) => SCAN_FILE(path.relative(REPO, full).split(path.sep).join("/")));

let total = 0;
const bad = [];
const seen = new Map();

for (const full of files) {
  const text = readFileSync(full, "utf8");
  const lines = text.split(/\r?\n/);
  lines.forEach((line, index) => {
    for (const {token} of citationsIn(line)) {
      total += 1;
      seen.set(token, (seen.get(token) ?? 0) + 1);
      const ok = token.includes(".") ? rules.numbers.has(token) : rules.sections.has(token);
      if (!ok) {
        bad.push({
          rule: token,
          where: `${path.relative(REPO, full).split(path.sep).join("/")}:${index + 1}`,
          line: line.trim().slice(0, 120),
        });
      }
    }
  });
}

const distinct = [...seen.keys()].sort();
console.log(`Comprehensive Rules: ${path.basename(rulesFile)} (effective ${rules.effective})`);
console.log(`  ${rules.numbers.size} numbered rules across ${rules.sections.size} sections`);
console.log(`Engine citations: ${total} in ${files.length} files, ${distinct.length} distinct`);

if (bad.length === 0) {
  console.log(`\nEvery citation names a rule that exists.`);
} else {
  console.log(`\n${bad.length} citation${bad.length === 1 ? "" : "s"} name a rule that does not exist:\n`);
  for (const row of bad) console.log(`  ${row.rule.padEnd(12)} ${row.where}\n      ${row.line}`);
}

/* EXISTENCE IS NOT ACCURACY, and this is the half that matters more. `CR 702.110` is a real rule —
   it is Exploit — so a menace citation pointing at it passes every check above while sending the
   next reader somewhere else entirely. A misattributed number cannot be caught mechanically,
   because only a person can tell whether the rule is about the thing the comment claims. So
   `--show` prints what each cited rule actually says, for reading. */
if (process.argv.includes("--show")) {
  const text = readFileSync(rulesFile, "utf8").split(/\r?\n/);
  const firstLine = new Map();
  for (const line of text) {
    const m = /^(\d{3}\.\d+[a-z]?)[.\s]\s*(.*)$/.exec(line);
    if (m && !firstLine.has(m[1])) firstLine.set(m[1], m[2]);
  }
  console.log(`\nWhat each cited rule actually says:\n`);
  for (const rule of distinct) {
    const said = firstLine.get(rule) ?? (rules.sections.has(rule) ? "(a section, not a single rule)" : "(not found)");
    console.log(`  ${rule.padEnd(10)} ${said.slice(0, 116)}`);
  }
}

if (process.argv.includes("--write")) {
  const out = [
    "# Comprehensive Rules citations",
    "",
    "Generated by `node game/tools/check-citations.mjs --write`. **Local-only**: it reads the",
    "Comprehensive Rules from outside the repository, because they are Wizards' copyrighted text and",
    "`ADR-001` keeps Wizards' content out of the product. Only this verdict is committed.",
    "",
    "Commander is **CR 903**; there is no separate Commander rulebook. The Commander Rules Committee",
    "dissolved on 30 September 2024 and handed the format to Wizards of the Coast.",
    "",
    `Checked against \`${path.basename(rulesFile)}\`, effective ${rules.effective}.`,
    "",
    `- ${total} citations across ${files.length} engine files`,
    `- ${distinct.length} distinct rules cited`,
    `- ${bad.length} naming a rule that does not exist`,
    "",
    "## Rules the engine cites",
    "",
    distinct.map((rule) => `\`${rule}\``).join(" · "),
    "",
  ].join("\n");
  writeFileSync(path.join(REPO, "docs", "engine", "citations.md"), out);
  console.log(`\nWrote docs/engine/citations.md`);
}

process.exit(bad.length === 0 ? 0 : 1);
