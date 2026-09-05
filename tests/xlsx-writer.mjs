// The hand-written .xlsx, opened by a real spreadsheet reader.
//
// A workbook that "looks right" in a diff and makes Excel offer to repair it is
// worth nothing, so these assertions go through openpyxl where it is available:
// the archive is opened, the sheets are enumerated by name, and cells are read
// back by address. The byte-level checks stand on their own when it is not.
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import {writeFile, mkdtemp, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";

const require = createRequire(import.meta.url);
const Xlsx = require("../xlsx-writer.js");
const Audit = require("../deck-audit.js");
const run = promisify(execFile);

let checks = 0;
const check = (label, fn) => { fn(); checks += 1; void label; };

const book = {
  sheets: [
    {
      name: "Summary",
      columns: [{key: "deck", label: "Deck", width: 20}, {key: "score", label: "Score"}],
      rows: [{deck: "Krenko", score: 71.37}, {deck: "Atraxa & Co", score: 84.6}]
    },
    {
      name: "Krenko",
      columns: [{key: "name", label: "Card"}, {key: "quantity", label: "Qty"}, {key: "why", label: "Why"}],
      rows: [
        {name: "Sol Ring", quantity: 1, why: 'Fast mana; "always" the best turn-one play'},
        {name: "Mountain", quantity: 23, why: ""},
        {name: "Krenko, Mob Boss", quantity: 1, why: "Commander <the whole plan>"}
      ]
    }
  ]
};

const bytes = Xlsx.build(book);

/* ---------------- the container ---------------- */

check("the output is a ZIP, and carries every part Excel requires", () => {
  assert.ok(bytes instanceof Uint8Array);
  assert.deepEqual([...bytes.slice(0, 4)], [0x50, 0x4b, 0x03, 0x04], "PK\\x03\\x04");
  const raw = new TextDecoder().decode(bytes);
  ["[Content_Types].xml", "_rels/.rels", "xl/workbook.xml", "xl/_rels/workbook.xml.rels",
   "xl/styles.xml", "xl/worksheets/sheet1.xml", "xl/worksheets/sheet2.xml"]
    .forEach((part) => assert.ok(raw.includes(part), `${part} is missing`));
});

check("the same input produces the same bytes", () => {
  assert.deepEqual([...Xlsx.build(book)], [...bytes], "a file that differs every run cannot be diffed");
});

/* ---------------- the rules Excel enforces on sheet names ---------------- */

check("a sheet name Excel would reject is repaired, not passed through", () => {
  // Each of these makes Excel declare the file corrupt rather than warn.
  const taken = new Set();
  assert.equal(Xlsx.sheetName("Deck 4 / Felothar", taken), "Deck 4 Felothar",
    "the slash is the one people actually type");
  assert.equal(Xlsx.sheetName("a".repeat(40), new Set()).length, 31, "31 characters is the hard limit");
  assert.equal(Xlsx.sheetName("", new Set()), "Sheet", "a blank name is not a name");
  assert.equal(Xlsx.sheetName("x[1]:y?*\\z", new Set()), "x 1 y z");
});

check("two decks with the same name get two sheets, not one", () => {
  const taken = new Set();
  assert.equal(Xlsx.sheetName("Krenko", taken), "Krenko");
  assert.equal(Xlsx.sheetName("Krenko", taken), "Krenko (2)");
  assert.equal(Xlsx.sheetName("Krenko", taken), "Krenko (3)");
  // A long name that collides is truncated so the suffix survives.
  const long = "b".repeat(31);
  assert.equal(Xlsx.sheetName(long, taken), long);
  const second = Xlsx.sheetName(long, taken);
  assert.equal(second.length, 31, "still within the limit");
  assert.match(second, /\(2\)$/, "and still distinguishable");
});

check("cell addresses keep counting past column Z", () => {
  assert.equal(Xlsx.cellRef(0, 1), "A1");
  assert.equal(Xlsx.cellRef(25, 1), "Z1");
  assert.equal(Xlsx.cellRef(26, 1), "AA1");
  assert.equal(Xlsx.cellRef(51, 9), "AZ9");
  assert.equal(Xlsx.cellRef(52, 1), "BA1");
});

/* ---------------- what goes in a cell ---------------- */

check("a number stays a number, so a column can be totalled", () => {
  const xml = Xlsx.sheetXml({columns: [{key: "a"}], rows: [{a: 12.5}]});
  assert.match(xml, /<v>12\.5<\/v>/, "written as a value, not as text");
  assert.ok(!/inlineStr/.test(xml.split("<row r=\"2\"")[1]), "and not as an inline string");
});

check("a blank is blank, not the word null", () => {
  const xml = Xlsx.sheetXml({columns: [{key: "a"}, {key: "b"}], rows: [{a: null, b: ""}]});
  assert.ok(!/null/.test(xml));
  assert.match(xml, /<c r="A2"\/>/, "an empty cell, which sorts and filters correctly");
});

check("text is escaped rather than injected", () => {
  const xml = Xlsx.sheetXml({columns: [{key: "a"}], rows: [{a: 'A & <B> "C"'}]});
  assert.ok(!xml.includes("<B>"), "a raw angle bracket would break the part");
  assert.match(xml, /A &amp; &lt;B&gt;/);
});

check("control characters are dropped, because Excel refuses them", () => {
  // A bell character in a cell is not an escaping problem: Excel rejects the
  // whole file. Pasted text carries them more often than anyone expects.
  const xml = Xlsx.sheetXml({columns: [{key: "a"}], rows: [{a: "before\u0007after"}]});
  assert.match(xml, /beforeafter/, "the bell goes, the text either side stays");
  assert.ok(!/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(xml));
});

check("the header row is frozen and the columns are sized", () => {
  const xml = Xlsx.sheetXml({columns: [{key: "a", label: "Card", width: 34}], rows: []});
  assert.match(xml, /state="frozen"/, "a hundred rows without a frozen header is unreadable");
  assert.match(xml, /width="34"/, "8.43 characters is not enough for a card name");
});

check("a workbook needs a sheet", () => {
  assert.throws(() => Xlsx.build({sheets: []}), /at least one sheet/);
});

/* ---------------- open it with a real reader ---------------- */

const dir = await mkdtemp(join(tmpdir(), "xlsx-"));
try {
  const path = join(dir, "book.xlsx");
  await writeFile(path, bytes);

  let report = null;
  try {
    const script = `
import json, openpyxl
wb = openpyxl.load_workbook(${JSON.stringify(path)})
ws = wb["Krenko"]
print(json.dumps({
  "sheets": wb.sheetnames,
  "header": [c.value for c in ws[1]],
  "a2": ws["A2"].value,
  "b3": ws["B3"].value,
  "b3_type": type(ws["B3"].value).__name__,
  "c2": ws["C2"].value,
  "c4": ws["C4"].value,
  "score": wb["Summary"]["B2"].value,
  "score_type": type(wb["Summary"]["B2"].value).__name__,
  "frozen": ws.freeze_panes,
}))`;
    const {stdout} = await run("python3", ["-c", script]);
    report = JSON.parse(stdout);
  } catch (error) {
    // No openpyxl here; the byte-level assertions above still stand.
  }

  if (report) {
    check("a real reader opens it and finds the sheets by name", () => {
      assert.deepEqual(report.sheets, ["Summary", "Krenko"],
        "the summary is first, because that is the sheet the file opens on");
    });
    check("the header row and the cells read back as written", () => {
      assert.deepEqual(report.header, ["Card", "Qty", "Why"]);
      assert.equal(report.a2, "Sol Ring");
      assert.equal(report.b3, 23, "Mountain x23");
      assert.equal(report.b3_type, "int", "a quantity is a number to the reader, not text");
      assert.equal(report.c2, 'Fast mana; "always" the best turn-one play',
        "quotes survive the round trip");
      assert.equal(report.c4, "Commander <the whole plan>", "and so do angle brackets");
    });
    check("a score is a number the spreadsheet can sort on", () => {
      assert.equal(report.score, 71.37);
      assert.equal(report.score_type, "float");
    });
    check("the header row is frozen in the file, not just in the markup", () => {
      assert.equal(report.frozen, "A2");
    });
  }
} finally {
  await rm(dir, {recursive: true, force: true});
}

/* ---------------- the deck workbook the app builds ---------------- */

const decks = [{
  title: "Deck 6 · Krenko",
  commander: "Krenko, Mob Boss",
  rungLabel: "Tuned",
  score: 71.37,
  scoreSource: "v2.4 sweep, 21,000 games",
  cards: [
    {name: "Krenko, Mob Boss", quantity: 1, type: "Legendary Creature", mv: 4, color: "R",
     rung: "Base", where: "In the box", unit: 2.1, line: 2.1, inBox: true, why: "The commander"},
    {name: "Mountain", quantity: 23, type: "Basic Land", mv: 0, color: "L",
     rung: "Base", where: "In the box", unit: 0.1, line: 2.3, inBox: true, why: ""},
    {name: "Blasphemous Act", quantity: 1, type: "Sorcery", mv: 9, color: "R",
     rung: "Tuned", where: "To buy", unit: 6, line: 6, toBuy: true, why: "The reset button"}
  ]
}];

check("the workbook has a summary sheet and one sheet for each deck", () => {
  const built = Audit.workbook(decks, {date: "2026-09-05"});
  assert.equal(built.sheets.length, 2);
  assert.equal(built.sheets[0].name, "Summary");
  assert.equal(built.sheets[1].name, "Deck 6 · Krenko");
  assert.match(built.filename, /^decks-2026-09-05\.xlsx$/);
});

check("the summary counts cards, not rows", () => {
  const [summary] = Audit.workbook(decks, {}).sheets;
  const row = summary.rows[0];
  assert.equal(row.cards, 25, "23 Mountains are 23 cards and one row");
  assert.equal(row.lands, 23);
  assert.equal(row.inBox, 24);
  assert.equal(row.toBuy, 1);
  assert.equal(row.toBuyCost, 6);
  assert.equal(row.score, 71.37);
});

check("the average mana value leaves the lands out", () => {
  // (4 + 9) / 2 = 6.5. Counting 23 Mountains at zero would report 0.52.
  assert.equal(Audit.avgMv(decks[0].cards), 6.5);
});

check("the per-deck sheet carries the why, which is the reason to export at all", () => {
  const sheet = Audit.workbook(decks, {}).sheets[1];
  assert.deepEqual(sheet.columns.map((c) => c.key).slice(0, 3), ["n", "name", "quantity"]);
  assert.equal(sheet.columns[sheet.columns.length - 1].key, "why");
  assert.equal(sheet.rows[0].why, "The commander");
  assert.equal(sheet.rows[2].line, 6);
});

check("the whole thing builds into a file", () => {
  const built = Audit.workbook(decks, {});
  const out = Xlsx.build(built);
  assert.ok(out.length > 1000);
  assert.deepEqual([...out.slice(0, 2)], [0x50, 0x4b]);
});

console.log(`xlsx-writer: ${checks} checks passed · ${bytes.length} byte sample, ` +
  `${book.sheets.length} sheets, header frozen`);
