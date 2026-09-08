/* Reading a spreadsheet somebody made in Excel.
 *
 * WHY NOT "JUST SAVE AS CSV". Because the file people have is the file they have.
 * An inventory lives in a .xlsx, and answering an upload with "export it as CSV
 * first" is asking somebody to do the app's job for it.
 *
 * WHAT THIS IS. A .xlsx is a ZIP of XML, and its entries are DEFLATE-compressed
 * rather than stored, so unlike the writer this needs an inflater. Browsers and
 * Node both have one -- DecompressionStream("deflate-raw") -- so there is still
 * no library here, only a central-directory walk and two XML parts:
 *
 *   xl/worksheets/sheetN.xml   the cells, as references and values
 *   xl/sharedStrings.xml       the string table those cells point into
 *
 * Excel interns almost every string, so a sheet read without the shared table
 * comes back as a grid of integers. That is the failure this file exists to
 * avoid, and it is why the table is parsed even though the writer never emits one.
 *
 * WHAT IT DELIBERATELY DOES NOT DO. Formulas are read as their cached value,
 * which is what the sheet was showing. Dates come back as the serial number
 * Excel stores, because turning one into a date needs the number-format table and
 * an inventory has no dates in it. Styles, merges and charts are ignored.
 */
(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.MtgXlsxReader = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const u16 = (b, at) => b[at] | (b[at + 1] << 8);
  const u32 = (b, at) => (b[at] | (b[at + 1] << 8) | (b[at + 2] << 16) | (b[at + 3] << 24)) >>> 0;
  const MAX_PART = 100 * 1024 * 1024, MAX_TOTAL = 250 * 1024 * 1024;
  const CRC_TABLE = Uint32Array.from({length: 256}, (_, n) => {
    for (let bit = 0; bit < 8; bit++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
    return n >>> 0;
  });
  function crc32(bytes) { let crc = 0xffffffff; for (const b of bytes) crc = CRC_TABLE[(crc ^ b) & 255] ^ (crc >>> 8); return (crc ^ 0xffffffff) >>> 0; }

  /* Walk the central directory rather than the local headers.
     A local header may carry zero lengths and defer them to a data descriptor
     after the payload, which cannot be found without already knowing the length.
     The central directory always has the real figures. */
  function entries(bytes) {
    // The EOCD is the last 22 bytes with no comment; scan back for its signature
    // in case there is one.
    let eocd = -1;
    for (let i = bytes.length - 22; i >= 0 && i > bytes.length - 66000; i -= 1) {
      if (u32(bytes, i) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error("That is not a ZIP file, so it is not a .xlsx either.");
    const count = u16(bytes, eocd + 10);
    if (count > 4096) throw new Error("This workbook has too many ZIP parts.");
    let at = u32(bytes, eocd + 16);
    let total = 0;
    const out = [];
    const decoder = new TextDecoder();
    for (let n = 0; n < count; n += 1) {
      if (at + 46 > bytes.length || u32(bytes, at) !== 0x02014b50) throw new Error("The workbook ZIP directory is incomplete.");
      const method = u16(bytes, at + 10);
      const compressed = u32(bytes, at + 20);
      const size = u32(bytes, at + 24), crc = u32(bytes, at + 16);
      total += size;
      if (size > MAX_PART || total > MAX_TOTAL) throw new Error("The expanded workbook is too large. Split it into smaller files.");
      const nameLen = u16(bytes, at + 28);
      const extraLen = u16(bytes, at + 30);
      const commentLen = u16(bytes, at + 32);
      const localAt = u32(bytes, at + 42);
      const name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLen));
      if (out.some(entry => entry.name === name)) throw new Error("Duplicate workbook ZIP part: " + name);
      if (at + 46 + nameLen + extraLen + commentLen > bytes.length) throw new Error("The workbook ZIP directory is truncated.");
      out.push({name, method, compressed, localAt, size, crc});
      at += 46 + nameLen + extraLen + commentLen;
    }
    return out;
  }

  async function inflate(bytes) {
    if (typeof DecompressionStream !== "function") {
      throw new Error("This browser cannot decompress a .xlsx. Save the sheet as CSV instead.");
    }
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    const reader = stream.getReader(), chunks = []; let length = 0;
    while (true) { const {value, done} = await reader.read(); if (done) break; length += value.length;
      if (length > MAX_PART) { await reader.cancel(); throw new Error("An expanded workbook part exceeds the size limit."); } chunks.push(value); }
    const output = new Uint8Array(length); let offset = 0; for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.length; } return output;
  }

  /** The bytes of one entry, inflated if it needs to be. */
  async function readEntry(bytes, entry) {
    // The local header's own name and extra lengths are the ones that count: a
    // writer may put different extra fields in the two places.
    const at = entry.localAt;
    if (u32(bytes, at) !== 0x04034b50) throw new Error(`Bad local header for ${entry.name}`);
    const start = at + 30 + u16(bytes, at + 26) + u16(bytes, at + 28);
    if (start + entry.compressed > bytes.length) throw new Error("A workbook part is truncated: " + entry.name);
    const body = bytes.subarray(start, start + entry.compressed);
    if (![0, 8].includes(entry.method)) throw new Error(`${entry.name} uses compression method ${entry.method}, which is not supported.`);
    const output = entry.method === 0 ? body : await inflate(body);
    if (output.length !== entry.size || crc32(output) !== entry.crc) throw new Error("The workbook has a corrupt part: " + entry.name);
    return output;
  }

  const decode = (bytes) => new TextDecoder().decode(bytes);

  const unesc = (s) => String(s)
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_m, dec) => String.fromCodePoint(Number(dec)))
    // Last, or an escaped "&amp;lt;" would come back as "<".
    .replace(/&amp;/g, "&");

  /* The shared string table. Each <si> is one string, but a run of differently
     formatted text inside one cell is several <t> elements that have to be
     joined -- "Sol Ring" typed with the first word bold is two runs and one name. */
  function sharedStrings(xml) {
    const out = [];
    const items = xml.match(/<si\b[\s\S]*?<\/si>|<si\b[^>]*\/>/g) || [];
    items.forEach((si) => {
      const runs = si.match(/<t[^>]*>([\s\S]*?)<\/t>/g) || [];
      out.push(runs.map((t) => unesc(t.replace(/<t[^>]*>|<\/t>/g, ""))).join(""));
    });
    return out;
  }

  /** "BA12" -> 52. Column letters are base-26 with no zero. */
  function colOf(ref) {
    const letters = String(ref).match(/^[A-Z]+/);
    if (!letters) return 0;
    let n = 0;
    for (const ch of letters[0]) n = n * 26 + (ch.charCodeAt(0) - 64);
    return n - 1;
  }

  function sheetRows(xml, strings) {
    const rows = [];
    // Match self-closing cells/rows first. The old alternation consumed the
    // next populated cell as part of a blank one, shifting notes into price
    // columns during an edited-library round trip.
    (xml.match(/<row\b[^>]*\/>|<row\b[^>]*>[\s\S]*?<\/row>/g) || []).forEach((rowXml) => {
      const cells = [];
      (rowXml.match(/<c\b[^>]*\/>|<c\b[^>]*>[\s\S]*?<\/c>/g) || []).forEach((cellXml) => {
        const ref = (cellXml.match(/\sr="([A-Z]+\d+)"/) || [])[1] || "";
        const type = (cellXml.match(/\st="([^"]+)"/) || [])[1] || "n";
        const at = ref ? colOf(ref) : cells.length;
        if (at > 511) throw new Error("This sheet exceeds the supported 512 import columns.");
        if (Object.hasOwn(cells, at)) throw new Error("Duplicate cell reference in the workbook: " + ref);
        let value = "";
        if (type === "inlineStr") {
          const runs = cellXml.match(/<t[^>]*>([\s\S]*?)<\/t>/g) || [];
          value = runs.map((t) => unesc(t.replace(/<t[^>]*>|<\/t>/g, ""))).join("");
        } else {
          const raw = (cellXml.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
          if (raw !== undefined) {
            // "s" means the value is an index into the shared table, which is the
            // shape almost every real spreadsheet uses for text.
            value = type === "s" ? (strings[Number(raw)] || "") : unesc(raw);
          }
        }
        while (cells.length < at) cells.push("");
        cells[at] = value;
      });
      rows.push(cells);
      if (rows.length > 200001) throw new Error("This sheet exceeds the supported import row limit.");
    });
    return rows;
  }

  /**
   * Read a workbook.
   *
   * Returns {sheets: [{name, rows}]} where a row is an array of strings. Sheet
   * order follows xl/workbook.xml, so sheets[0] is the one the file opens on.
   */
  async function read(bytes) {
    const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const list = entries(data);
    const byName = new Map(list.map((e) => [e.name, e]));
    const get = async (name) => (byName.has(name) ? decode(await readEntry(data, byName.get(name))) : null);

    const workbook = await get("xl/workbook.xml");
    if (!workbook) throw new Error("No xl/workbook.xml, so this is not a spreadsheet.");
    const sharedXml = await get("xl/sharedStrings.xml");
    const strings = sharedXml ? sharedStrings(sharedXml) : [];

    /* Sheet names live in workbook.xml, their files in workbook.xml.rels, and the
       two are joined on r:id. Guessing "the Nth <sheet> is sheetN.xml" is right
       often enough to be dangerous: a workbook whose sheets were reordered or
       deleted breaks it, and the reader silently returns the wrong sheet. */
    const relsXml = await get("xl/_rels/workbook.xml.rels");
    const rels = new Map();
    (relsXml ? relsXml.match(/<Relationship\b[^>]*\/>/g) || [] : []).forEach((rel) => {
      const id = (rel.match(/Id="([^"]+)"/) || [])[1];
      const target = (rel.match(/Target="([^"]+)"/) || [])[1];
      if (id && target) rels.set(id, target.replace(/^\/?xl\//, "").replace(/^\.\//, ""));
    });

    const sheets = [];
    for (const tag of workbook.match(/<sheet\b[^>]*\/>/g) || []) {
      const name = unesc((tag.match(/name="([^"]*)"/) || [])[1] || "Sheet");
      const id = (tag.match(/r:id="([^"]+)"/) || [])[1];
      const path = "xl/" + (rels.get(id) || `worksheets/sheet${sheets.length + 1}.xml`);
      const xml = await get(path);
      sheets.push({name, rows: xml ? sheetRows(xml, strings) : []});
    }
    return {sheets};
  }

  return {read, entries, sharedStrings, sheetRows, colOf, unesc};
});
