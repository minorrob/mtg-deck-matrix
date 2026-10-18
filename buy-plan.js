/* The buy plan: for every card you need, which printing, from which vendor, in which box, and what that choice cost you.
 *
 * WHAT THIS IS FOR (Linear ROB-119). Rob's sixth outcome: "buying is clean and balances speed, print and cost by my
 * priorities." The Shop lists what a deck still needs and prices it at Scryfall's figure for the cheapest printing;
 * it does not choose a printing, a vendor or a shipment, and it cannot say what a reader who wants the original art,
 * or wants the cards by Saturday, is giving up for it. This module does, as one pure function behind the priority dial
 * (ROB-118, the Workshop's screen): three weights in, one ordered plan out, every line with the trade-off it made.
 *
 * WHAT IT READS.
 *   needs     [{name, quantity, deck?}]: the cards to buy.
 *   prices    a printings snapshot (tools/printings-snapshot.mjs; the app takes the same shape from Scryfall's prints
 *             search): {generatedAt, cards: {name: [{set, setName, collector, released, usd, usdFoil, finishes, frame,
 *             frameEffects, borderColor, fullArt, promo}]}}. US dollars only (AGENTS.md: the United States, always).
 *   weights   {cost, speed, print}, each 0 to 1: the dial. All zero is all equal.
 *   options   vendors (data/vendors.json's table, or the reader's edited copy from Settings), print (the preference the
 *             print weight pulls toward: prefer "cheapest" | "oldest" | "newest"; finish "any" | "foil" | "nonfoil";
 *             frame "any" | "borderless" | "showcase" | "extended" | "retro"), rules (crankmagic-rules.js, the house
 *             rules), local (false to leave the counter out, when there is none to walk into).
 *
 * HOW IT CHOOSES. Every printing with a price in the finish allowed is a candidate; its print score is how well it
 * matches the preference (1 for the one the reader asked for, down to 0). Every vendor is assumed to carry every
 * printing at its price factor over Scryfall's figure (that is TCGplayer's market price), to ship for a flat charge
 * waived over a threshold, and to take its lead days. The plan is chosen among the ways of splitting the order across
 * vendors (every single vendor, and the split that puts each card where it is cheapest after shipping), each scored by
 * the three weights on three normalized axes: dollars over the cheapest possible, days over the fastest possible, and
 * print preference given up. Within the chosen vendor set, each card takes the printing that scores best under the
 * same weights. Nothing is scraped and nothing is promised: the vendor table is an assumption the reader edits, and
 * the plan repeats the assumptions it used.
 *
 * WHAT A LINE SAYS. "Sol Ring, Commander Legends 2020 foil from Card Kingdom, $4.60: $2.90 more than the cheapest
 * printing anywhere (TCGplayer, Commander Masters), two days sooner than TCGplayer; the printing you asked for." The
 * house rules (crankmagic-rules.js: nothing over $30, the local store's first refusal at $5) mark a line, never block
 * it: the decision is the reader's.
 *
 * PURE and UMD like deck-generator.js. tests/buy-plan.mjs holds it on a dated snapshot of fourteen cards' printings;
 * the breaks are game/tools/batch/breaks-buy-plan.py.
 */
(function (root, factory) {
  "use strict";
  const node = typeof module === "object" && module.exports && typeof require === "function";
  const take = (file, name) => { if (node) { try { return require(file); } catch (e) { return null; } } return root ? root[name] : null; };
  const api = factory({rules: take("./crankmagic-rules.js", "CrankRules"), vendors: node ? take("./data/vendors.json") : root && root.CrankVendors});
  if (node) module.exports = api;
  if (root) root.CrankBuyPlan = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (deps) {
  "use strict";

  const DEFAULT_WEIGHTS = Object.freeze({cost: 1, speed: 0, print: 0});
  const DEFAULT_PRINT = Object.freeze({prefer: "cheapest", finish: "any", frame: "any"});
  const FRAMES = {
    borderless: (p) => p.borderColor === "borderless" || (p.frameEffects || []).includes("borderless"),
    showcase: (p) => (p.frameEffects || []).includes("showcase"),
    extended: (p) => (p.frameEffects || []).includes("extendedart"),
    retro: (p) => p.frame === "1993" || p.frame === "1997"
  };

  const round2 = (x) => Math.round(Number(x || 0) * 100) / 100;
  const money = (x) => `$${round2(x).toFixed(2)}`;
  const fold = (s) => String(s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[‘’]/g, "'").trim().toLowerCase();
  const clamp01 = (v) => Math.max(0, Math.min(1, Number(v) || 0));
  const days = (n) => `${n} day${n === 1 ? "" : "s"}`;

  function normalizeWeights(raw) {
    const w = {cost: clamp01(raw && raw.cost), speed: clamp01(raw && raw.speed), print: clamp01(raw && raw.print)};
    const sum = w.cost + w.speed + w.print;
    if (!sum) return {cost: 1 / 3, speed: 1 / 3, print: 1 / 3, allEqual: true};
    return {cost: w.cost / sum, speed: w.speed / sum, print: w.print / sum, allEqual: false};
  }

  function vendorsOf(options) {
    const table = (options && options.vendors) || (deps.vendors && deps.vendors.vendors) || [];
    const list = (Array.isArray(table) ? table : table.vendors || []).filter((v) => v && v.id && v.name)
      .map((v) => ({id: v.id, name: v.name, kind: v.kind === "counter" ? "counter" : "mail", priceFactor: Number(v.priceFactor) || 1, shippingFlat: Number(v.shippingFlat) || 0, freeOver: Number(v.freeOver) || 0, leadDays: Math.max(0, Math.round(Number(v.leadDays) || 0)), carries: v.carries || "", says: v.says || ""}));
    return options && options.local === false ? list.filter((v) => v.kind !== "counter") : list;
  }

  /* The printings of one card that can be bought in the finish allowed, each with its unit price and print score. */
  function candidatesOf(prints, pref) {
    const out = [];
    for (const p of prints || []) {
      const finishes = [];
      if (p.usd !== null && p.usd !== undefined && pref.finish !== "foil") finishes.push({finish: "nonfoil", price: Number(p.usd)});
      if (p.usdFoil !== null && p.usdFoil !== undefined && pref.finish !== "nonfoil") finishes.push({finish: "foil", price: Number(p.usdFoil)});
      for (const f of finishes) if (Number.isFinite(f.price) && f.price > 0) out.push({...p, finish: f.finish, unit: f.price});
    }
    if (!out.length) return out;
    const released = out.map((c) => c.released || "").filter(Boolean).sort();
    const oldest = released[0], newest = released[released.length - 1];
    const cheapest = Math.min(...out.map((c) => c.unit));
    for (const c of out) {
      let score = 0;
      if (pref.prefer === "cheapest") score = cheapest / c.unit;
      else if (pref.prefer === "oldest") score = c.released === oldest ? 1 : released.length > 1 ? 1 - (released.indexOf(c.released) / (released.length - 1)) : 1;
      else if (pref.prefer === "newest") score = c.released === newest ? 1 : released.length > 1 ? released.indexOf(c.released) / (released.length - 1) : 1;
      else score = 1;
      if (pref.frame !== "any" && FRAMES[pref.frame]) score = FRAMES[pref.frame](c) ? Math.max(score, 0.9) : score * 0.3;
      if (pref.finish === "foil" && c.finish !== "foil") score *= 0.3;
      c.printScore = round2(Math.max(0, Math.min(1, score)));
      c.why = pref.prefer === "cheapest" ? (c.unit === cheapest ? "the cheapest printing" : `${money(c.unit - cheapest)} over the cheapest printing`)
        : pref.prefer === "oldest" ? (c.released === oldest ? "the original printing" : `a ${c.released ? c.released.slice(0, 4) : "later"} printing, not the original`)
        : pref.prefer === "newest" ? (c.released === newest ? "the newest printing" : `a ${c.released ? c.released.slice(0, 4) : "older"} printing, not the newest`) : "a printing";
      if (pref.frame !== "any") c.why += FRAMES[pref.frame] && FRAMES[pref.frame](c) ? `, ${pref.frame}` : `, not ${pref.frame}`;
      if (c.finish === "foil") c.why += ", foil";
    }
    return out.sort((a, b) => a.unit - b.unit || (b.printScore - a.printScore) || String(a.set).localeCompare(String(b.set)));
  }

  /**
   * The plan. Returns {generatedAt, weights, print, lines, bundles, total, slowestDays, unpriced, assumptions, says}.
   */
  function buyPlan(needs, prices, rawWeights, options) {
    const o = options || {};
    const weights = normalizeWeights(rawWeights || DEFAULT_WEIGHTS);
    const pref = {...DEFAULT_PRINT, ...(o.print || {})};
    const vendors = vendorsOf(o);
    const rules = o.rules === undefined ? deps.rules : o.rules;
    const snapshot = prices && prices.cards ? prices : {cards: prices || {}, generatedAt: null};
    const byName = new Map(Object.keys(snapshot.cards).map((n) => [fold(n), snapshot.cards[n]]));
    const wanted = [];
    const unpriced = [];
    for (const n of needs || []) {
      if (!n || !n.name) continue;
      const quantity = Math.max(1, Math.round(Number(n.quantity) || 1));
      const cands = candidatesOf(byName.get(fold(n.name)) || byName.get(fold(String(n.name).split(" // ")[0])) || [], pref);
      if (!cands.length) { unpriced.push(n.name); continue; }
      wanted.push({name: n.name, quantity, deck: n.deck || null, cands});
    }
    if (!vendors.length) return {generatedAt: snapshot.generatedAt || null, weights, print: pref, lines: [], bundles: [], total: {cards: 0, shipping: 0, all: 0}, slowestDays: null, unpriced: unpriced.concat(wanted.map((w) => w.name)), assumptions: [], says: "No vendor table was supplied, so no plan could be made."};

    /* The floor and the ceiling of each axis, for normalizing: the cheapest any card can be anywhere, the fastest
       vendor, the best print score available. */
    const cheapestAnywhere = (w) => Math.min(...vendors.map((v) => Math.min(...w.cands.map((c) => c.unit * v.priceFactor))));
    const floorCards = wanted.reduce((n, w) => n + cheapestAnywhere(w) * w.quantity, 0);
    const fastest = Math.min(...vendors.map((v) => v.leadDays));
    const slowest = Math.max(...vendors.map((v) => v.leadDays));
    const bestPrint = wanted.reduce((n, w) => n + Math.max(...w.cands.map((c) => c.printScore)) * w.quantity, 0);
    const quantityAll = wanted.reduce((n, w) => n + w.quantity, 0) || 1;

    /* The best printing of one card at one vendor under the weights: dollars over the floor against print given up. */
    const pick = (w, v) => {
      const floor = cheapestAnywhere(w);
      let best = null, bestScore = Infinity;
      for (const c of w.cands) {
        const unit = round2(c.unit * v.priceFactor);
        const over = floor > 0 ? (unit - floor) / floor : 0;
        const score = weights.cost * Math.min(3, over) + weights.print * (1 - c.printScore);
        if (score < bestScore - 1e-9 || (Math.abs(score - bestScore) < 1e-9 && best && unit < best.unit)) { best = {...c, unit, base: c.unit}; bestScore = score; }
      }
      return best;
    };

    /* The candidate plans: every single vendor, and the split that puts each card where it is cheapest after the
       chosen printing's price, paying each vendor's shipping once. */
    const shippingFor = (v, subtotal) => (subtotal <= 0 ? 0 : v.freeOver > 0 && subtotal >= v.freeOver ? 0 : v.shippingFlat);
    const assemble = (assignment, label) => {
      const byVendor = new Map();
      for (const {w, v, c} of assignment) { if (!byVendor.has(v.id)) byVendor.set(v.id, {vendor: v, items: []}); byVendor.get(v.id).items.push({w, c}); }
      let cards = 0, shipping = 0, printSum = 0, lead = 0;
      const bundles = [];
      for (const {vendor, items} of byVendor.values()) {
        const subtotal = round2(items.reduce((n, i) => n + i.c.unit * i.w.quantity, 0));
        const ship = shippingFor(vendor, subtotal);
        cards += subtotal; shipping += ship; lead = Math.max(lead, vendor.leadDays);
        printSum += items.reduce((n, i) => n + i.c.printScore * i.w.quantity, 0);
        bundles.push({vendor, items, subtotal, shipping: ship});
      }
      const all = round2(cards + shipping);
      const costAxis = floorCards > 0 ? (all - floorCards) / floorCards : 0;
      const speedAxis = slowest > fastest ? (lead - fastest) / (slowest - fastest) : 0;
      const printAxis = bestPrint > 0 ? (bestPrint - printSum) / bestPrint : 0;
      const score = weights.cost * Math.min(3, costAxis) + weights.speed * speedAxis + weights.print * printAxis;
      return {label, assignment, bundles, cards: round2(cards), shipping: round2(shipping), all, lead, printSum, score, axes: {cost: round2(costAxis), speed: round2(speedAxis), print: round2(printAxis)}};
    };
    const plans = [];
    for (const v of vendors) plans.push(assemble(wanted.map((w) => ({w, v, c: pick(w, v)})), `everything from ${v.name}`));
    if (vendors.length > 1) {
      const split = wanted.map((w) => {
        let best = null;
        for (const v of vendors) { const c = pick(w, v); if (!best || c.unit < best.c.unit - 1e-9) best = {w, v, c}; }
        return best;
      });
      plans.push(assemble(split, "each card where it is cheapest"));
    }
    plans.sort((a, b) => a.score - b.score || a.all - b.all || a.lead - b.lead || a.label.localeCompare(b.label));
    const chosen = plans[0];

    /* The lines, each with its trade-off against the cheapest and the fastest it could have been. */
    const cheapestLine = (w) => { let best = null; for (const v of vendors) for (const c of w.cands) { const unit = round2(c.unit * v.priceFactor); if (!best || unit < best.unit) best = {unit, vendor: v, c}; } return best; };
    const fastestVendor = vendors.slice().sort((a, b) => a.leadDays - b.leadDays || a.priceFactor - b.priceFactor)[0];
    const lines = chosen.assignment.map(({w, v, c}) => {
      const cheap = cheapestLine(w);
      const extra = round2((c.unit - cheap.unit) * w.quantity);
      const parts = [];
      if (extra > 0.005) parts.push(`${money(extra)} more than the cheapest (${cheap.c.setName}${cheap.c.finish === "foil" ? " foil" : ""} from ${cheap.vendor.name})`);
      else parts.push("the cheapest it could be");
      if (v.leadDays > fastestVendor.leadDays) parts.push(`${days(v.leadDays - fastestVendor.leadDays)} slower than ${fastestVendor.name}`);
      else if (v.leadDays === 0) parts.push("in hand today");
      else parts.push(`as fast as any (${days(v.leadDays)})`);
      parts.push(c.why);
      const flags = rules && typeof rules.warnings === "function" ? rules.warnings({price: c.base, paid: c.unit, vendor: v.name}) : [];
      return {
        name: w.name, quantity: w.quantity, deck: w.deck,
        printing: {set: c.set, setName: c.setName, collector: c.collector, released: c.released, finish: c.finish, printScore: c.printScore, tcgplayerId: c.tcgplayerId || null},
        vendor: {id: v.id, name: v.name, leadDays: v.leadDays}, unit: c.unit, base: c.base, total: round2(c.unit * w.quantity),
        cheapest: {unit: cheap.unit, vendor: cheap.vendor.name, set: cheap.c.setName, finish: cheap.c.finish, saves: extra},
        flags,
        says: `${w.name}${w.quantity > 1 ? ` ×${w.quantity}` : ""}, ${c.setName}${c.finish === "foil" ? " foil" : ""} from ${v.name}, ${money(c.unit)}${w.quantity > 1 ? ` each` : ""}: ${parts.join("; ")}${flags.length ? ` (${flags.join(", ")})` : ""}.`
      };
    });
    const vendorOrder = chosen.bundles.map((b) => b.vendor.id);
    lines.sort((a, b) => vendorOrder.indexOf(a.vendor.id) - vendorOrder.indexOf(b.vendor.id) || b.total - a.total || a.name.localeCompare(b.name));
    const bundles = chosen.bundles.map((b) => ({vendor: {id: b.vendor.id, name: b.vendor.name, kind: b.vendor.kind, leadDays: b.vendor.leadDays}, cards: b.items.reduce((n, i) => n + i.w.quantity, 0), subtotal: b.subtotal, shipping: b.shipping, total: round2(b.subtotal + b.shipping),
      says: `${b.vendor.name}: ${b.items.reduce((n, i) => n + i.w.quantity, 0)} card${b.items.length === 1 && b.items[0].w.quantity === 1 ? "" : "s"}, ${money(b.subtotal)}${b.shipping ? ` plus ${money(b.shipping)} shipping` : b.vendor.kind === "mail" ? ", shipping waived" : ""}, ${b.vendor.leadDays ? `about ${days(b.vendor.leadDays)}` : "today"}.`}));
    const assumptions = vendors.map((v) => `${v.name}: ${v.priceFactor === 1 ? "Scryfall's price" : `${Math.round((v.priceFactor - 1) * 100)}% over Scryfall's price`}, ${v.shippingFlat ? `${money(v.shippingFlat)} shipping${v.freeOver ? ` waived over ${money(v.freeOver)}` : ""}` : "no shipping"}, ${v.leadDays ? days(v.leadDays) : "same day"}; carries ${v.carries || "every printing"}.`);
    assumptions.push(snapshot.generatedAt ? `Prices are Scryfall's US-dollar figures as of ${String(snapshot.generatedAt).slice(0, 10)}.` : "Prices carry no date; the plan is not reproducible.");
    const alternatives = plans.slice(1, 4).map((p) => ({label: p.label, total: p.all, days: p.lead, print: round2(p.printSum / quantityAll), score: round2(p.score)}));
    const dial = weights.allEqual ? "cost, speed and print weighed alike" : [["cost", weights.cost], ["speed", weights.speed], ["print", weights.print]].filter(([, x]) => x > 0).sort((a, b) => b[1] - a[1]).map(([k, x]) => `${k} ${Math.round(x * 100)}%`).join(", ");
    return {
      generatedAt: snapshot.generatedAt || null,
      weights: {cost: round2(weights.cost), speed: round2(weights.speed), print: round2(weights.print)}, print: pref,
      lines, bundles,
      total: {cards: chosen.cards, shipping: chosen.shipping, all: chosen.all, floor: round2(floorCards)},
      slowestDays: chosen.lead, printScore: round2(chosen.printSum / quantityAll), axes: chosen.axes,
      chosen: chosen.label, alternatives, unpriced, assumptions,
      says: `${chosen.label}: ${lines.reduce((n, l) => n + l.quantity, 0)} cards, ${money(chosen.all)} with shipping (${money(chosen.cards)} in cards; the floor anywhere is ${money(floorCards)}), ${chosen.lead ? `about ${days(chosen.lead)}` : "in hand today"}; by ${dial}.${unpriced.length ? ` ${unpriced.length} card${unpriced.length === 1 ? " has" : "s have"} no price in the snapshot: ${unpriced.slice(0, 4).join(", ")}${unpriced.length > 4 ? ", …" : ""}.` : ""}`
    };
  }

  return {buyPlan, normalizeWeights, candidatesOf, vendorsOf, DEFAULT_WEIGHTS, DEFAULT_PRINT, FRAMES};
});
