/* A Word file, written by hand, because the alternative was worse.
 *
 * The two printed checklists are also wanted as .docx. The obvious route is the
 * `docx` npm package, which is not on any CDN this page is allowed to load from,
 * and inlining a library to emit three XML files is a poor trade.
 *
 * A .docx is a ZIP holding three small XML parts. A ZIP whose entries are STORED
 * rather than deflated is still a valid ZIP -- Word opens it without complaint --
 * and a stored-only writer is about eighty lines with no dependency at all. So
 * this page needs no CDN for Word output, and works with the network off.
 *
 * WHY WORD AND NOT ONLY THE PRINT PAGE. The print page is the better artifact for
 * the job: CSS column layout is more reliable than Word's, and it prints the same
 * on every machine. But a .docx can be edited on the way to the store -- crossing
 * a card off, adding one somebody mentioned -- and that is a real thing to want.
 * Both ship; the print page is the default button.
 */
(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.MtgDocxWriter = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  /* ---------------- the smallest correct ZIP ---------------- */

  const CRC_TABLE = (() => {
    const table = new Int32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
    return table;
  })();

  function crc32(bytes) {
    let c = 0 ^ -1;
    for (let i = 0; i < bytes.length; i += 1) c = (c >>> 8) ^ CRC_TABLE[(c ^ bytes[i]) & 0xff];
    return (c ^ -1) >>> 0;
  }

  const utf8 = (text) => new TextEncoder().encode(text);

  function zip(entries) {
    const chunks = [];
    const central = [];
    let offset = 0;

    const push = (bytes) => { chunks.push(bytes); offset += bytes.length; };
    const u16 = (v) => [v & 0xff, (v >>> 8) & 0xff];
    const u32 = (v) => [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff];

    entries.forEach((entry) => {
      const name = utf8(entry.name);
      const body = utf8(entry.content);
      const sum = crc32(body);
      const localAt = offset;
      // Method 0 is STORE. No date, because a build that produces a different
      // file every run cannot be compared against the last one.
      push(new Uint8Array([
        ...u32(0x04034b50), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
        ...u32(sum), ...u32(body.length), ...u32(body.length),
        ...u16(name.length), ...u16(0)
      ]));
      push(name);
      push(body);
      central.push(new Uint8Array([
        ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
        ...u32(sum), ...u32(body.length), ...u32(body.length),
        ...u16(name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0),
        ...u32(localAt)
      ]));
      central.push(name);
    });

    const centralAt = offset;
    central.forEach(push);
    const centralSize = offset - centralAt;
    push(new Uint8Array([
      ...u32(0x06054b50), ...u16(0), ...u16(0),
      ...u16(entries.length), ...u16(entries.length),
      ...u32(centralSize), ...u32(centralAt), ...u16(0)
    ]));

    const total = chunks.reduce((n, c) => n + c.length, 0);
    const out = new Uint8Array(total);
    let at = 0;
    chunks.forEach((c) => { out.set(c, at); at += c.length; });
    return out;
  }

  /* ---------------- the three XML parts ---------------- */

  const xmlEsc = (s) => String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;");

  const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

  const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

  /* Letter paper, half-inch margins, two columns.
     12240 x 15840 twips is US Letter. 720 twips is half an inch. That leaves
     10800 of usable width; two columns with a 432 gap are 5184 each, which is
     where the right-hand tab stop goes so prices line up down the column. */
  const PAGE = {width: 12240, height: 15840, margin: 720, gap: 432};
  const COLUMN_WIDTH = (PAGE.width - PAGE.margin * 2 - PAGE.gap) / 2;

  function run(text, opts) {
    const o = opts || {};
    const props = [
      o.bold ? "<w:b/>" : "",
      o.caps ? "<w:caps/>" : "",
      o.color ? `<w:color w:val="${o.color}"/>` : "",
      o.size ? `<w:sz w:val="${o.size}"/>` : "",
      o.font ? `<w:rFonts w:ascii="${o.font}" w:hAnsi="${o.font}"/>` : ""
    ].join("");
    return `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ""}` +
      `<w:t xml:space="preserve">${xmlEsc(text)}</w:t></w:r>`;
  }

  function para(runs, opts) {
    const o = opts || {};
    const props = [
      o.spaceBefore || o.spaceAfter
        ? `<w:spacing${o.spaceBefore ? ` w:before="${o.spaceBefore}"` : ""}${o.spaceAfter ? ` w:after="${o.spaceAfter}"` : ""}/>`
        : "<w:spacing w:before=\"0\" w:after=\"0\"/>",
      o.tabRight ? `<w:tabs><w:tab w:val="right" w:pos="${COLUMN_WIDTH}"/></w:tabs>` : "",
      // Keep a heading with the line under it, so a column break never leaves a
      // heading stranded at the foot with its cards on the other side.
      o.keepNext ? "<w:keepNext/>" : "",
      o.border ? '<w:pBdr><w:bottom w:val="single" w:sz="8" w:space="1" w:color="000000"/></w:pBdr>' : ""
    ].join("");
    return `<w:p>${props ? `<w:pPr>${props}</w:pPr>` : ""}${runs}</w:p>`;
  }

  /**
   * Build a .docx as bytes.
   *
   * doc = {title, subtitle, sections: [{heading, groups: [{heading, items:
   *       [{text, note, right}]}]}]}
   *
   * The shape mirrors the print sheets deliberately: one source of truth for
   * what is on the list, two renderers for where it is going.
   */
  function build(doc) {
    const body = [];
    body.push(para(run(doc.title || "List", {bold: true, size: 32}), {spaceAfter: 40}));
    if (doc.subtitle) {
      body.push(para(run(doc.subtitle, {size: 18, color: "555555"}), {spaceAfter: 160}));
    }

    (doc.sections || []).forEach((section) => {
      if (section.heading) {
        body.push(para(run(section.heading, {bold: true, size: 20, caps: true}),
          {spaceBefore: 160, spaceAfter: 40, keepNext: true, border: true}));
      }
      (section.groups || []).forEach((group) => {
        if (group.heading) {
          body.push(para(run(group.heading, {bold: true, size: 18, color: "444444"}),
            {spaceBefore: 100, spaceAfter: 20, keepNext: true}));
        }
        (group.items || []).forEach((item) => {
          // U+2610 BALLOT BOX. The whole point of carrying the list is ticking it.
          let runs = run("☐  " + item.text, {size: 20});
          if (item.note) runs += run("  " + item.note, {size: 16, color: "666666"});
          if (item.right) {
            runs += `<w:r><w:tab/></w:r>` + run(item.right, {size: 18, font: "Consolas"});
          }
          body.push(para(runs, {tabRight: Boolean(item.right)}));
        });
      });
    });

    const sectPr = `<w:sectPr>` +
      `<w:pgSz w:w="${PAGE.width}" w:h="${PAGE.height}"/>` +
      `<w:pgMar w:top="${PAGE.margin}" w:right="${PAGE.margin}" w:bottom="${PAGE.margin}" w:left="${PAGE.margin}"/>` +
      `<w:cols w:num="2" w:space="${PAGE.gap}"/>` +
      `</w:sectPr>`;

    const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>${body.join("")}${sectPr}</w:body>
</w:document>`;

    return zip([
      {name: "[Content_Types].xml", content: CONTENT_TYPES},
      {name: "_rels/.rels", content: ROOT_RELS},
      {name: "word/document.xml", content: document}
    ]);
  }

  return {build, zip, crc32, COLUMN_WIDTH, PAGE};
});
