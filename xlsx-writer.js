/* An Excel workbook, written by hand, for the same reason the Word file is.
 *
 * A .xlsx is a ZIP of XML parts, exactly as a .docx is, and docx-writer.js
 * already holds a correct stored-entry ZIP writer. So the whole cost of Excel
 * output here is the parts list and a cell encoder -- no CDN, no SheetJS, and
 * it works with the network off.
 *
 * INLINE STRINGS, NOT A SHARED TABLE. Excel normally interns every string in
 * xl/sharedStrings.xml and has cells point at it by index. That saves space in a
 * workbook with thousands of repeated values and costs a whole part, a second
 * pass, and an index that is silently wrong if anything gets out of step. These
 * workbooks are a few hundred rows of mostly distinct card names, so every cell
 * carries its own text (t="inlineStr") and there is no table to get wrong.
 *
 * WHAT EXCEL WILL REFUSE. A sheet name over 31 characters, one containing any of
 * : \ / ? * [ ], a blank one, or two sheets with the same name -- each of those
 * makes Excel declare the file corrupt and offer to repair it, which reads as
 * "this app produced a broken file". sheetName() is the one place that is
 * handled, and it is handled by truncating and disambiguating rather than by
 * hoping the deck names are short.
 */
(function (root, factory) {
  "use strict";
  const docx = (typeof module === "object" && module.exports && typeof require === "function")
    ? require("./docx-writer.js")
    : root && root.MtgDocxWriter;
  const api = factory(docx);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.MtgXlsxWriter = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (Docx) {
  "use strict";

  if (!Docx) throw new Error("The workbook writer needs docx-writer.js for its ZIP");

  const MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

  // Excel rejects the C0 control characters outright. They arrive from pasted
  // text often enough to be worth dropping rather than escaping.
  const CONTROL = /[\x00-\x08\x0B\x0C\x0E-\x1F]/g;

  const xmlEsc = (s) => String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(CONTROL, "");

  /* A1, B1 ... Z1, AA1. Written out rather than assumed, because a workbook with
     more than 26 columns is one bad loop away and the failure is silent. */
  function cellRef(col, row) {
    let name = "";
    let n = col;
    while (n >= 0) {
      name = String.fromCharCode(65 + (n % 26)) + name;
      n = Math.floor(n / 26) - 1;
    }
    return name + row;
  }

  const ILLEGAL = /[:\\/?*[\]]/g;

  /**
   * A sheet name Excel will accept, unique within `taken`.
   * Truncation happens before disambiguation so the suffix is never cut off.
   */
  function sheetName(raw, taken) {
    let base = String(raw || "Sheet").replace(ILLEGAL, " ").replace(/\s+/g, " ").trim();
    if (!base) base = "Sheet";
    if (base.length > 31) base = base.slice(0, 31).trim();
    if (!taken || !taken.has(base.toLowerCase())) {
      if (taken) taken.add(base.toLowerCase());
      return base;
    }
    for (let n = 2; n < 100; n += 1) {
      const suffix = ` (${n})`;
      const name = base.slice(0, 31 - suffix.length).trim() + suffix;
      if (!taken.has(name.toLowerCase())) { taken.add(name.toLowerCase()); return name; }
    }
    throw new Error(`Cannot find a free sheet name for "${raw}"`);
  }

  /* A number stays a number so Excel can total a column; everything else is
     text. null and "" are written as an empty cell rather than as the string
     "null", which is the difference between a blank and a value that sorts. */
  function cellXml(value, col, row, header) {
    const ref = cellRef(col, row);
    if (value === null || value === undefined || value === "") return `<c r="${ref}"/>`;
    if (typeof value === "number" && Number.isFinite(value)) {
      return `<c r="${ref}"><v>${value}</v></c>`;
    }
    const style = header ? ' s="1"' : "";
    return `<c r="${ref}" t="inlineStr"${style}><is><t xml:space="preserve">${xmlEsc(value)}</t></is></c>`;
  }

  function sheetXml(sheet) {
    const columns = sheet.columns || [];
    const rows = [];
    if (columns.length) {
      rows.push(`<row r="1">${columns.map((c, i) =>
        cellXml(c.label != null ? c.label : c.key, i, 1, true)).join("")}</row>`);
    }
    (sheet.rows || []).forEach((row, index) => {
      const r = index + (columns.length ? 2 : 1);
      const cells = columns.length
        ? columns.map((c, i) => cellXml(row[c.key], i, r, false))
        : row.map((v, i) => cellXml(v, i, r, false));
      rows.push(`<row r="${r}">${cells.join("")}</row>`);
    });
    // Column widths are in characters. Without them every column is 8.43 wide
    // and a card name is unreadable until the reader drags a divider.
    const cols = columns.length
      ? `<cols>${columns.map((c, i) =>
          `<col min="${i + 1}" max="${i + 1}" width="${c.width || 16}" customWidth="1"/>`).join("")}</cols>`
      : "";
    // Freeze the header row, so scrolling a hundred cards keeps the labels.
    const pane = columns.length
      ? '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
      : "";
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${pane}${cols}<sheetData>${
      rows.join("")}</sheetData></worksheet>`;
  }

  const CONTENT_TYPES = (count) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
${Array.from({length: count}, (_u, i) =>
  `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("\n")}
</Types>`;

  const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

  /* One bold style, at index 1, for the header row. Index 0 has to exist and has
     to be the default -- Excel reads styles by position, and a missing zeroth
     entry is a corrupt file rather than an unstyled one. */
  const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>
</styleSheet>`;

  /**
   * Build a workbook as bytes.
   *
   * book = {sheets: [{name, columns: [{key, label, width}], rows: [{...}]}]}
   * A sheet may instead carry `rows` as arrays, in which case it is written
   * without a header.
   */
  function build(book) {
    const sheets = (book && book.sheets) || [];
    if (!sheets.length) throw new Error("A workbook needs at least one sheet");
    const taken = new Set();
    const named = sheets.map((sheet) => ({...sheet, xlName: sheetName(sheet.name, taken)}));

    const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
 xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>${named.map((s, i) =>
  `<sheet name="${xmlEsc(s.xlName)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets>
</workbook>`;

    const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${named.map((_s, i) =>
  `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("\n")}
<Relationship Id="rId${named.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

    return Docx.zip([
      {name: "[Content_Types].xml", content: CONTENT_TYPES(named.length)},
      {name: "_rels/.rels", content: ROOT_RELS},
      {name: "xl/workbook.xml", content: workbook},
      {name: "xl/_rels/workbook.xml.rels", content: workbookRels},
      {name: "xl/styles.xml", content: STYLES},
      ...named.map((sheet, i) => ({name: `xl/worksheets/sheet${i + 1}.xml`, content: sheetXml(sheet)}))
    ]);
  }

  return {build, sheetName, cellRef, sheetXml, xmlEsc, MIME};
});
