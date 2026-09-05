/* The three lists you leave the house with.
 *
 * These are not three views of one table. They go to three different places and
 * each is shaped for where it is used:
 *
 *   To Buy   printed, folded, carried to a booth. Grouped the way you walk a
 *            trader's boxes -- by what it costs, then by color -- and cut to the
 *            three columns you actually read standing up.
 *   Order    pasted into TCGplayer's Mass Entry box. Machine-read, so it carries
 *            nothing a machine would choke on.
 *   In hand  checked against the shelf at home. One flat list, with the deck it
 *            belongs to, because that is the question being asked.
 *
 * WHY THE BANDS ARE COARSER HERE. slot-model.js has nine price bands and they are
 * right for filtering a table. Nine headings on a printed sheet is nine places to
 * lose your finger. Three is what a person sorts a binder into.
 */
(function (root, factory) {
  "use strict";
  const docx = (typeof module === "object" && module.exports && typeof require === "function")
    ? require("./docx-writer.js")
    : root && root.MtgDocxWriter;
  const api = factory(docx);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.MtgShopExport = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (Docx) {
  "use strict";

  /* The boundaries are stated rather than implied. "$6+, $1-6, under $1" leaves
     exactly $1.00 and exactly $6.00 undecided, and a card that falls through
     every band vanishes off the sheet. These three cover the line with no gap and
     no overlap: a price is in exactly one, always. */
  const DOCX_MIME =
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

  const BANDS = [
    {key: "high", label: "$6 and up", test: (p) => p >= 6},
    {key: "mid", label: "$1 to $6", test: (p) => p >= 1 && p < 6},
    {key: "low", label: "Under $1", test: (p) => p < 1}
  ];

  // Color order is WUBRG, the order every Magic player already reads, then the
  // two that are not a color.
  const COLOR_ORDER = ["White", "Blue", "Black", "Red", "Green", "Multicolor", "Colorless"];

  function bandOf(price) {
    const p = Number(price);
    // An unpriced card still has to appear -- it is a card you do not have. It
    // goes in the cheap drawer and prints without a figure rather than as $0.00,
    // which would read as "free" instead of "unknown".
    if (!Number.isFinite(p) || p < 0) return BANDS[BANDS.length - 1];
    return BANDS.find((band) => band.test(p)) || BANDS[BANDS.length - 1];
  }

  const money = (v) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? "$" + n.toFixed(2) : "—";
  };

  const byName = (a, b) => String(a.name).localeCompare(String(b.name), "en", {sensitivity: "base"});

  function colorRank(color) {
    const i = COLOR_ORDER.indexOf(color);
    return i < 0 ? COLOR_ORDER.length : i;
  }

  /**
   * To Buy: what is still owed, grouped price band -> color -> A to Z.
   * Only the three columns a person reads at a booth.
   */
  function toBuyGroups(rows) {
    const owed = (rows || []).filter((r) => Number(r.need) > 0);
    return BANDS.map((band) => {
      const inBand = owed.filter((r) => bandOf(r.price).key === band.key);
      const colors = [];
      inBand.forEach((row) => {
        const name = row.color || "Colorless";
        let bucket = colors.find((c) => c.color === name);
        if (!bucket) { bucket = {color: name, cards: []}; colors.push(bucket); }
        bucket.cards.push({
          name: row.name,
          color: name,
          price: money(row.price),
          quantity: Number(row.need) || 1
        });
      });
      colors.sort((a, b) => colorRank(a.color) - colorRank(b.color));
      colors.forEach((c) => c.cards.sort(byName));
      return {
        key: band.key,
        label: band.label,
        colors,
        count: inBand.reduce((n, r) => n + (Number(r.need) || 1), 0)
      };
    }).filter((band) => band.colors.length);
  }

  /**
   * Order: TCGplayer Mass Entry.
   *
   * Their box takes one line per card, quantity first, and matches on the exact
   * printed name. So: no set codes, no prices, no headings, no blank lines, and
   * the full double-faced name rather than the front face -- a card entered as
   * half its own name does not match.
   */
  function orderText(rows) {
    return (rows || [])
      .filter((r) => Number(r.ordered) > 0)
      .slice()
      .sort(byName)
      .map((r) => `${Number(r.ordered) || 1} ${r.name}`)
      .join("\n");
  }

  /**
   * In hand: one flat list of what is already on the shelf, with the deck that
   * wants it. Sorted by deck then name, because it is read deck by deck.
   */
  function inHandRows(rows) {
    return (rows || [])
      .filter((r) => Number(r.inHand) > 0)
      .map((r) => ({
        deck: (r.deckNames || []).join(", ") || "Unassigned",
        name: r.name,
        color: r.color || "Colorless",
        // The Shop's rows call it cardType (what the card IS) to distinguish it
        // from the slot's type (the job the slot does). Either is accepted.
        type: r.type || r.cardType || ""
      }))
      .sort((a, b) => a.deck.localeCompare(b.deck) || byName(a, b));
  }

  const esc = (s) => String(s == null ? "" : s)
    .replace(/[&<>"']/g, (c) => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]));

  /* A print sheet, as HTML, opened in a tab with the print dialog up.
   *
   * Two columns via CSS `column-count`, which is what makes a hundred-card
   * checklist two pages instead of four. What may and may not break across the
   * column is decided per element, below, and it is the difference between a
   * sheet you can read at a booth and one you cannot. */
  const PRINT_CSS = `
  @page { size: letter portrait; margin: 12mm; }
  * { box-sizing: border-box; }
  body { font: 11pt/1.35 Georgia, "Times New Roman", serif; color: #111; margin: 0; padding: 16px; background: #fff; }
  h1 { font: 700 16pt/1.2 Georgia, serif; margin: 0 0 2px; }
  .sub { font: 9.5pt/1.3 system-ui, sans-serif; color: #555; margin: 0 0 14px; }
  .cols { column-count: 2; column-gap: 14mm; }
  /* A band may flow across the column break; a COLOR group may not. Keeping a
     whole band together looked tidier and wasted half a page -- twelve cheap
     cards forced the entire band into column two and left column one short. The
     price is printed on every line, so a group that lands under the fold is
     still unambiguous; a group split down the middle is the thing that hurts. */
  section { break-inside: auto; margin: 0 0 10px; }
  .grp { break-inside: avoid-column; }
  h2 { font: 700 10pt/1.2 system-ui, sans-serif; text-transform: uppercase; letter-spacing: .06em;
       margin: 0 0 4px; padding-bottom: 2px; border-bottom: 1.5px solid #111; break-after: avoid; }
  h3 { font: 700 9pt/1.2 system-ui, sans-serif; color: #444; margin: 7px 0 2px; break-after: avoid; }
  ul { list-style: none; margin: 0; padding: 0; }
  li { display: flex; align-items: baseline; gap: 6px; padding: 1.5px 0; break-inside: avoid; }
  /* An empty box to tick. The whole point of carrying it is marking it up. */
  li::before { content: ""; flex: 0 0 auto; width: 9px; height: 9px; border: 1px solid #666; border-radius: 1px; }
  .nm { flex: 1 1 auto; }
  .qty { font: 700 9pt system-ui, sans-serif; color: #444; }
  .pr { font: 9.5pt "SF Mono", Menlo, monospace; color: #333; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .dk { font: 8.5pt system-ui, sans-serif; color: #666; white-space: nowrap; }
  @media print { .noprint { display: none; } body { padding: 0; } }
  .noprint { font: 9.5pt system-ui, sans-serif; margin: 0 0 14px; padding: 8px 10px;
             background: #f2efe4; border: 1px solid #ddd6c2; border-radius: 5px; }`;

  function page(title, subtitle, bodyHtml, note) {
    return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>${esc(title)}</title><style>${PRINT_CSS}</style></head><body>
${note ? `<p class="noprint">${esc(note)}</p>` : ""}
<h1>${esc(title)}</h1><p class="sub">${esc(subtitle)}</p>
<div class="cols">${bodyHtml}</div>
<script>window.addEventListener("load", function () { window.print(); });</script>
</body></html>`;
  }

  function toBuyHtml(rows, meta) {
    const groups = toBuyGroups(rows);
    const total = groups.reduce((n, g) => n + g.count, 0);
    const body = groups.map((band) => `<section><h2>${esc(band.label)} · ${band.count}</h2>` +
      band.colors.map((c) => `<div class="grp"><h3>${esc(c.color)}</h3><ul>` +
        c.cards.map((card) => `<li><span class="nm">${esc(card.name)}` +
          (card.quantity > 1 ? ` <span class="qty">×${card.quantity}</span>` : "") +
          `</span><span class="pr">${esc(card.price)}</span></li>`).join("") +
        "</ul></div>").join("") + "</section>").join("");
    return page("To Buy", `${total} card${total === 1 ? "" : "s"} · ` +
      `grouped by price, then color, A to Z · target prices, not what you will pay · ` +
      ((meta && meta.date) || new Date().toISOString().slice(0, 10)),
      body || "<p>Nothing outstanding.</p>",
      "This tab will open your print dialog. Print it, fold it, take it to the booth.");
  }

  function inHandHtml(rows, meta) {
    const list = inHandRows(rows);
    const body = "<ul>" + list.map((r) => `<li><span class="nm">${esc(r.name)}</span>` +
      `<span class="dk">${esc(r.color)}${r.type ? " · " + esc(r.type) : ""} · ${esc(r.deck)}</span></li>`)
      .join("") + "</ul>";
    return page("In Hand", `${list.length} card${list.length === 1 ? "" : "s"} · ` +
      `already owned, listed by deck · ` +
      ((meta && meta.date) || new Date().toISOString().slice(0, 10)),
      list.length ? body : "<p>Nothing marked as in hand.</p>",
      "This tab will open your print dialog. Check it against the shelf.");
  }

  /* The same list, aimed at Word instead of a printer. One source of truth for
     what is on it; the renderers differ only in where it is going. */
  function toBuyDoc(rows, meta) {
    const groups = toBuyGroups(rows);
    const total = groups.reduce((n, g) => n + g.count, 0);
    return {
      title: "To Buy",
      subtitle: `${total} card${total === 1 ? "" : "s"} · grouped by price, then color, A to Z · ` +
        `target prices, not what you will pay · ${(meta && meta.date) || ""}`,
      sections: groups.map((band) => ({
        heading: `${band.label} · ${band.count}`,
        groups: band.colors.map((c) => ({
          heading: c.color,
          items: c.cards.map((card) => ({
            text: card.name + (card.quantity > 1 ? ` ×${card.quantity}` : ""),
            right: card.price
          }))
        }))
      }))
    };
  }

  function inHandDoc(rows, meta) {
    const list = inHandRows(rows);
    return {
      title: "In Hand",
      subtitle: `${list.length} card${list.length === 1 ? "" : "s"} · already owned, ` +
        `listed by deck · ${(meta && meta.date) || ""}`,
      sections: [{
        groups: [{
          items: list.map((r) => ({
            text: r.name,
            note: `${r.color}${r.type ? " · " + r.type : ""} · ${r.deck}`
          }))
        }]
      }]
    };
  }

  /**
   * Build whichever lists were asked for. Returns files ready to hand to a
   * download, each with the name it should be saved under and the type it is.
   */
  function build(rows, want, meta) {
    const stamp = (meta && meta.date) || new Date().toISOString().slice(0, 10);
    const files = [];
    const asked = want || {};
    if (asked.toBuy) {
      files.push({id: "toBuy", label: "To Buy", kind: "print",
        filename: `to-buy-${stamp}.html`, mime: "text/html;charset=utf-8",
        content: toBuyHtml(rows, {date: stamp})});
    }
    if (asked.toBuyDocx && Docx) {
      files.push({id: "toBuyDocx", label: "To Buy (Word)", kind: "docx",
        filename: `to-buy-${stamp}.docx`, mime: DOCX_MIME,
        bytes: Docx.build(toBuyDoc(rows, {date: stamp}))});
    }
    if (asked.order) {
      const text = orderText(rows);
      files.push({id: "order", label: "Order", kind: "tcgplayer",
        filename: `tcgplayer-order-${stamp}.txt`, mime: "text/plain;charset=utf-8",
        content: text,
        // The instruction belongs with the file, not in a help page nobody opens.
        note: "Open tcgplayer.com/massentry, paste the whole file into the box, " +
              "and press Add to Cart. One line per card, quantity first."});
    }
    if (asked.inHand) {
      files.push({id: "inHand", label: "In hand", kind: "print",
        filename: `in-hand-${stamp}.html`, mime: "text/html;charset=utf-8",
        content: inHandHtml(rows, {date: stamp})});
    }
    if (asked.inHandDocx && Docx) {
      files.push({id: "inHandDocx", label: "In hand (Word)", kind: "docx",
        filename: `in-hand-${stamp}.docx`, mime: DOCX_MIME,
        bytes: Docx.build(inHandDoc(rows, {date: stamp}))});
    }
    return files;
  }

  return {
    BANDS,
    COLOR_ORDER,
    bandOf,
    toBuyGroups,
    orderText,
    inHandRows,
    toBuyHtml,
    inHandHtml,
    toBuyDoc,
    inHandDoc,
    build
  };
});
