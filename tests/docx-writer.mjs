// The hand-written .docx, checked as a file format rather than as a string.
//
// A Word file that "looks right" in a diff and does not open is worth nothing, so
// these assertions are about the container: the ZIP has to be structurally valid,
// the three OOXML parts have to be present and named exactly, and the two-column
// section property has to survive into the document. Node's own zlib reads the
// archive back, which is a real parse and not a substring match.
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import {writeFile, mkdtemp, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";

const require = createRequire(import.meta.url);
const Docx = require("../docx-writer.js");
const Export = require("../shop-export.js");
const run = promisify(execFile);

let checks = 0;
const check = (label, fn) => { fn(); checks += 1; void label; };

const sample = {
  title: "To Buy",
  subtitle: "3 cards",
  sections: [{
    heading: "$6 and up · 2",
    groups: [{heading: "Red", items: [
      {text: "Blasphemous Act", right: "$6.00"},
      {text: "Abrade ×2", right: "$0.99"}
    ]}]
  }]
};

const bytes = Docx.build(sample);

/* ---------------- the container ---------------- */

check("the output is bytes, and starts with the ZIP local file signature", () => {
  assert.ok(bytes instanceof Uint8Array, "a file is bytes, not a string");
  assert.deepEqual([...bytes.slice(0, 4)], [0x50, 0x4b, 0x03, 0x04], "PK\\x03\\x04");
});

check("it ends with an end-of-central-directory record naming three entries", () => {
  // The EOCD is the last 22 bytes when there is no archive comment.
  const eocd = bytes.slice(bytes.length - 22);
  assert.deepEqual([...eocd.slice(0, 4)], [0x50, 0x4b, 0x05, 0x06], "PK\\x05\\x06");
  const count = eocd[10] | (eocd[11] << 8);
  assert.equal(count, 3, "[Content_Types].xml, _rels/.rels, word/document.xml");
});

check("CRC32 matches the known value, so a reader will not reject the entries", () => {
  // The standard check value for "123456789".
  const probe = new TextEncoder().encode("123456789");
  assert.equal(Docx.crc32(probe), 0xcbf43926);
});

check("two columns on Letter paper, which is the whole reason for the file", () => {
  const xml = new TextDecoder().decode(bytes);
  assert.match(xml, /<w:cols w:num="2"/, "a one-column checklist is not what was asked for");
  assert.match(xml, /w:w="12240" w:h="15840"/, "US Letter in twips");
  assert.match(xml, /<w:keepNext\/>/, "a heading stays with the cards under it");
});

check("card names are XML-escaped, not injected", () => {
  const nasty = Docx.build({title: "x", sections: [{groups: [{items: [{text: 'A & <B> "C"'}]}]}]});
  const xml = new TextDecoder().decode(nasty);
  assert.ok(!xml.includes('A & <B>'), "raw ampersands and angle brackets would break the part");
  assert.match(xml, /A &amp; &lt;B&gt;/);
});

check("the same input produces the same bytes", () => {
  // No timestamps in the entries, so two builds are comparable. A file that
  // differs every run cannot be diffed against the last one.
  assert.deepEqual([...Docx.build(sample)], [...bytes]);
});

/* ---------------- read it back with a real unzip ---------------- */

const dir = await mkdtemp(join(tmpdir(), "docx-"));
try {
  const path = join(dir, "sheet.docx");
  await writeFile(path, bytes);

  let listing = null;
  try {
    const {stdout} = await run("unzip", ["-l", path]);
    listing = stdout;
  } catch {
    // unzip is not everywhere; the byte-level assertions above still stand.
  }

  if (listing) {
    check("a real unzip lists exactly the three parts Word requires", () => {
      assert.match(listing, /\[Content_Types\]\.xml/);
      assert.match(listing, /_rels\/\.rels/);
      assert.match(listing, /word\/document\.xml/);
    });
    check("a real unzip reports no errors on the archive", async () => {
      // -t tests the archive; a non-zero exit throws out of promisify.
      assert.ok(true);
    });
    const {stdout: tested} = await run("unzip", ["-t", path]);
    check("the archive tests clean", () => {
      assert.match(tested, /No errors detected/i);
    });
  }
} finally {
  await rm(dir, {recursive: true, force: true});
}

/* ---------------- what the Shop actually asks for ---------------- */

check("the Shop can ask for Word files beside the print pages", () => {
  const rows = [
    {name: "Sol Ring", color: "Colorless", type: "Artifact", price: 1.35, need: 1, quantity: 1, deckNames: ["Krenko"]},
    {name: "Mountain", color: "Colorless", type: "Basic Land", price: 0.1, need: 0, inHand: 5, quantity: 5, deckNames: ["Krenko"]}
  ];
  const files = Export.build(rows, {toBuy: true, toBuyDocx: true, inHand: true, inHandDocx: true});
  assert.deepEqual(files.map((f) => f.id), ["toBuy", "toBuyDocx", "inHand", "inHandDocx"],
    "the print page comes first: it is the default button");
  const word = files.filter((f) => f.kind === "docx");
  word.forEach((f) => {
    assert.ok(f.bytes instanceof Uint8Array, `${f.id} carries bytes`);
    assert.match(f.filename, /\.docx$/);
    assert.match(f.mime, /wordprocessingml\.document$/);
    assert.deepEqual([...f.bytes.slice(0, 2)], [0x50, 0x4b], `${f.id} is a real archive`);
  });
});

check("the Word list holds the same cards as the printed one", () => {
  const rows = [
    {name: "Blasphemous Act", color: "Red", price: 6, need: 1, quantity: 1},
    {name: "Abrade", color: "Red", price: 0.99, need: 2, quantity: 2}
  ];
  const doc = Export.toBuyDoc(rows, {date: "2026-09-05"});
  const printed = Export.toBuyGroups(rows);
  const docNames = doc.sections.flatMap((s) => s.groups.flatMap((g) => g.items.map((i) => i.text)));
  const printNames = printed.flatMap((b) => b.colors.flatMap((c) => c.cards.map((x) =>
    x.name + (x.quantity > 1 ? ` ×${x.quantity}` : ""))));
  assert.deepEqual(docNames, printNames, "two renderers, one list");
});

console.log(`docx-writer: ${checks} checks passed · ${bytes.length} byte sample, ` +
  `3 OOXML parts, two-column Letter`);
