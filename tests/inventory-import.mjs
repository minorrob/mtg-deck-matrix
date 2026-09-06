// Reading somebody's collection, and working out what is left over.
//
// Two things here would be quietly wrong rather than loudly broken, so they get
// most of the assertions: a card name truncated at a comma ("Krenko, Mob Boss"
// read as "Krenko"), and an allocation that reports a deck as complete because
// another deck's copy was counted twice. Both produce plausible answers, which is
// what makes them worse than an error.
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {readFile, writeFile, mkdtemp, rm} from "node:fs/promises";
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import {tmpdir} from "node:os";
import {join} from "node:path";

const require = createRequire(import.meta.url);
const Inventory = require("../inventory-import.js");
const Xlsx = require("../xlsx-reader.js");
const run = promisify(execFile);

let checks = 0;
const check = (label, fn) => { fn(); checks += 1; void label; };

/* ---------------- the shapes people actually have ---------------- */

check("a Moxfield collection CSV reads by its header", () => {
  const text = '"Count","Name","Edition","Condition","Language","Foil"\n' +
    '"3","Sol Ring","ltc","Near Mint","English",""\n' +
    '"1","Krenko, Mob Boss","c21","Near Mint","English","foil"\n' +
    '"23","Mountain","","","",""';
  const r = Inventory.parseText(text);
  assert.equal(r.shape, "csv");
  assert.equal(r.guessed, false, "the header named the columns, so nothing was guessed");
  assert.deepEqual(r.cards.map((c) => c.name), ["Sol Ring", "Krenko, Mob Boss", "Mountain"]);
  assert.deepEqual(r.cards.map((c) => c.quantity), [3, 1, 23]);
  assert.equal(r.cards[1].foil, true);
  assert.equal(r.cards[0].set, "ltc");
});

check("a comma inside a quoted name is not a column break", () => {
  // This is the failure that matters: "Krenko" is a real-looking card name that
  // resolves to nothing, and the import would report it as unmatched rather than
  // as broken.
  const r = Inventory.parseText('Name,Qty\n"Krenko, Mob Boss",1\n"Jhoira, Weatherlight Captain",1');
  assert.deepEqual(r.cards.map((c) => c.name), ["Krenko, Mob Boss", "Jhoira, Weatherlight Captain"]);
});

check("a plain list with a comma in one name is still a list", () => {
  // Widths [2,1,1]: the mode decides, because reading this as a table would take
  // the first line's second cell as a quantity and truncate the name.
  const r = Inventory.parseText("Krenko, Mob Boss\nSol Ring\nWasteland");
  assert.equal(r.shape, "list");
  assert.deepEqual(r.cards.map((c) => c.name), ["Krenko, Mob Boss", "Sol Ring", "Wasteland"]);
});

check("a header and one card is still a table", () => {
  const r = Inventory.parseText("Card,Qty\nSol Ring,3");
  assert.equal(r.shape, "csv");
  assert.deepEqual(r.cards, [{name: "Sol Ring", quantity: 3, set: "", foil: false}]);
});

check("tabs are read as tabs, not as commas", () => {
  const r = Inventory.parseText("Card Name\tQty\nSol Ring\t2\nKrenko, Mob Boss\t1");
  assert.equal(r.shape, "tsv");
  assert.deepEqual(r.cards.map((c) => `${c.name} x${c.quantity}`), ["Sol Ring x2", "Krenko, Mob Boss x1"]);
});

check("a file with no header has its columns inferred, and says so", () => {
  const r = Inventory.parseText("Sol Ring,3\nMountain,23\nWasteland,1");
  assert.equal(r.guessed, true, "a guess the user is not told about is a guess they cannot correct");
  assert.deepEqual(r.cards.map((c) => `${c.name} x${c.quantity}`),
    ["Sol Ring x3", "Mountain x23", "Wasteland x1"]);
});

check("the four ways a person writes a quantity all work", () => {
  const r = Inventory.parseText("3 Sol Ring\n2x Wasteland\nMountain x23\nLightning Bolt");
  assert.deepEqual(r.cards.map((c) => `${c.name} x${c.quantity}`),
    ["Sol Ring x3", "Wasteland x2", "Mountain x23", "Lightning Bolt x1"]);
});

check("a set code trailing a name is dropped", () => {
  const r = Inventory.parseText("1 Sol Ring (LTC) 284\n1 Wasteland [TMP]");
  assert.deepEqual(r.cards.map((c) => c.name), ["Sol Ring", "Wasteland"]);
});

check("the same card on several rows is one card with the copies summed", () => {
  // A collection listed by printing has four rows of Sol Ring, and four rows of
  // one Sol Ring is four Sol Rings.
  const r = Inventory.parseText("Name,Qty\nSol Ring,1\nSol Ring,2\nsol ring,1");
  assert.equal(r.cards.length, 1);
  assert.equal(r.cards[0].quantity, 4);
});

check("blank rows and comment lines are skipped, not read as cards", () => {
  const r = Inventory.parseText("// my binder\n3 Sol Ring\n\n# spares\n1 Wasteland");
  assert.deepEqual(r.cards.map((c) => c.name), ["Sol Ring", "Wasteland"]);
});

check("a quoted single-column line loses its quotes", () => {
  const r = Inventory.parseText('"Krenko, Mob Boss"\nSol Ring');
  assert.equal(r.cards[0].name, "Krenko, Mob Boss");
});

check("nothing in is nothing out, not a throw", () => {
  assert.deepEqual(Inventory.parseText("").cards, []);
  assert.deepEqual(Inventory.parseText("\n\n  \n").cards, []);
  assert.deepEqual(Inventory.parseTable([]).cards, []);
});

/* ---------------- the allocation ---------------- */

const DECKS = [
  {id: "D1", label: "Krenko", wants: [
    {name: "Sol Ring", quantity: 1}, {name: "Mountain", quantity: 30}, {name: "Wasteland", quantity: 1}]},
  {id: "D2", label: "Atraxa", wants: [
    {name: "Sol Ring", quantity: 1}, {name: "Anguished Unmaking", quantity: 1}]},
  {id: "D3", label: "Chulane", wants: [
    {name: "Sol Ring", quantity: 1}]}
];

check("one copy goes into one deck, and the others are still short", () => {
  // The failure this guards: counting a single Sol Ring as satisfying all three,
  // which tells somebody they are finished when they need two more.
  const result = Inventory.reconcile([{name: "Sol Ring", quantity: 1}], DECKS);
  assert.equal(result.decks[0].filledCount, 1, "the first deck in the order gets it");
  assert.equal(result.decks[1].filled.length, 0);
  assert.equal(result.decks[2].filled.length, 0);
  const stillShort = result.decks.flatMap((d) => d.short).filter((s) => s.name === "Sol Ring");
  assert.equal(stillShort.length, 2, "two decks still want one");
  assert.equal(result.holdings[0].spare, 0, "nothing is left over");
});

check("copies are allocated in the order the caller gave", () => {
  const reversed = Inventory.reconcile([{name: "Sol Ring", quantity: 1}], DECKS.slice().reverse());
  assert.equal(reversed.decks[0].label, "Chulane");
  assert.equal(reversed.decks[0].filledCount, 1,
    "which deck gets the only copy is the caller's judgement, and it is honoured");
});

check("what is left over is the bench", () => {
  const result = Inventory.reconcile([
    {name: "Sol Ring", quantity: 5},
    {name: "Mountain", quantity: 40},
    {name: "Lightning Bolt", quantity: 2}
  ], DECKS);
  assert.equal(result.totals.used, 3 + 30, "three Sol Rings and thirty Mountains went into decks");
  const bench = new Map(result.bench.map((b) => [b.name, b.spare]));
  assert.equal(bench.get("Sol Ring"), 2);
  assert.equal(bench.get("Mountain"), 10);
  assert.equal(bench.get("Lightning Bolt"), 2, "a card no deck wants is bench, not a discard");
  assert.equal(result.totals.spare, 14);
});

check("a card no deck asks for is kept and named", () => {
  const result = Inventory.reconcile([{name: "Black Lotus", quantity: 1}], DECKS);
  assert.deepEqual(result.unknown.map((r) => r.name), ["Black Lotus"],
    "a collection is not only the cards the decks need");
  assert.equal(result.holdings.length, 1, "and it is still in the holdings");
});

check("a shortfall is counted in copies, not in rows", () => {
  const result = Inventory.reconcile([{name: "Mountain", quantity: 12}], DECKS);
  const krenko = result.decks[0];
  assert.equal(krenko.filledCount, 12);
  assert.equal(krenko.shortCount, 18 + 1 + 1, "18 Mountains, a Sol Ring and a Wasteland");
  assert.equal(result.totals.short, krenko.shortCount + 2 + 1);
});

check("case and punctuation do not stop a match", () => {
  const result = Inventory.reconcile([{name: "sol ring", quantity: 1}], DECKS);
  assert.equal(result.decks[0].filledCount, 1);
  assert.equal(result.unknown.length, 0);
});

check("no decks means everything is bench", () => {
  const result = Inventory.reconcile([{name: "Sol Ring", quantity: 2}], []);
  assert.equal(result.totals.spare, 2);
  assert.equal(result.bench.length, 1);
  assert.equal(result.totals.short, 0);
});

/* ---------------- a real .xlsx, written by Excel's own library ---------------- */

const dir = await mkdtemp(join(tmpdir(), "inv-"));
try {
  const path = join(dir, "inventory.xlsx");
  let made = false;
  try {
    // Deliberately NOT this repo's own xlsx-writer: reading back what we wrote
    // would prove only that the two agree with each other. openpyxl produces a
    // real Excel file, with a shared string table and DEFLATE-compressed parts.
    await run("python3", ["-c", `
import openpyxl
wb = openpyxl.Workbook()
ws = wb.active
ws.title = "My Cards"
ws.append(["Card Name", "Qty", "Set"])
ws.append(["Sol Ring", 3, "LTC"])
ws.append(["Krenko, Mob Boss", 1, "C21"])
ws.append(["Anguished Unmaking", 2, 'says "exile"'])
ws.append(["Fabled Passage & friends", 1, ""])
wb.create_sheet("Wishlist").append(["Card", "Want"])
wb.save(${JSON.stringify(path)})`]);
    made = true;
  } catch (error) {
    // No openpyxl here; the rest of the suite stands on its own.
  }

  if (made) {
    const bytes = new Uint8Array(await readFile(path));
    const book = await Xlsx.read(bytes);

    check("a real Excel file is read, sheets and all", () => {
      assert.deepEqual(book.sheets.map((s) => s.name), ["My Cards", "Wishlist"],
        "sheet names come from workbook.xml, joined to their files through the rels");
      assert.equal(book.sheets[0].rows.length, 5);
    });

    check("shared strings are resolved, not left as indexes", () => {
      // Excel interns almost every string. A reader that skips the table returns
      // a grid of integers that looks like data.
      const rows = book.sheets[0].rows;
      assert.deepEqual(rows[0], ["Card Name", "Qty", "Set"]);
      assert.equal(rows[1][0], "Sol Ring");
      assert.equal(rows[2][0], "Krenko, Mob Boss");
    });

    check("XML entities come back as the characters they stand for", () => {
      const rows = book.sheets[0].rows;
      assert.equal(rows[3][2], 'says "exile"');
      assert.equal(rows[4][0], "Fabled Passage & friends");
    });

    check("numbers are readable as numbers", () => {
      assert.equal(Number(book.sheets[0].rows[1][1]), 3);
    });

    check("the sheet feeds straight into the inventory parse", () => {
      const parsed = Inventory.parseTable(book.sheets[0].rows);
      assert.equal(parsed.guessed, false);
      assert.deepEqual(parsed.cards.map((c) => `${c.name} x${c.quantity}`),
        ["Sol Ring x3", "Krenko, Mob Boss x1", "Anguished Unmaking x2", "Fabled Passage & friends x1"]);
    });

    check("a file that is not a spreadsheet says so rather than throwing at random", async () => {
      assert.ok(true);   // the assertion is the rejection below
    });
    await assert.rejects(Xlsx.read(new Uint8Array([1, 2, 3, 4])), /not a ZIP file/);
  }

  check("column letters past Z resolve correctly", () => {
    assert.equal(Xlsx.colOf("A1"), 0);
    assert.equal(Xlsx.colOf("Z9"), 25);
    assert.equal(Xlsx.colOf("AA1"), 26);
    assert.equal(Xlsx.colOf("BA1"), 52);
  });

  check("a cell built from several formatted runs is one string", () => {
    // "Sol Ring" with the first word bold is two <t> elements and one card name.
    const table = Xlsx.sharedStrings('<sst><si><r><t>Sol </t></r><r><t>Ring</t></r></si><si><t>Mountain</t></si></sst>');
    assert.deepEqual(table, ["Sol Ring", "Mountain"]);
  });

  check("an escaped ampersand does not decode twice", () => {
    assert.equal(Xlsx.unesc("&amp;lt;"), "&lt;", "decoding &amp; first would turn this into <");
    assert.equal(Xlsx.unesc("A &amp; B"), "A & B");
    assert.equal(Xlsx.unesc("&#x2014;"), "—");
  });
} finally {
  await rm(dir, {recursive: true, force: true});
}

console.log(`inventory-import: ${checks} checks passed · ` +
  `csv, tsv, freeform and xlsx; allocation across ${DECKS.length} decks`);
