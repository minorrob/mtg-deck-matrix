/* THE CHANGE LIST (Rob, 14 September): what a physical deck needs pulled and what it needs put in,
 * as a checklist of "Remove this card → Put this card in" rows, rationalised against the mana
 * formula and the deck's top-level counts so an irrational deck is warned about before the
 * cards move.
 *
 * WHAT IT READS. The same projection the Cards page tables and the deck page read
 * (collection-model.js `projection`): for a final deck, the copies physically in its box
 * (reserved ones and substitutes), the reserved copies elsewhere (the Bench, another deck's
 * box), the ordered copies on their way and the To buy requirements. The list (the main slots)
 * is what the box should become.
 *
 * WHAT IT SAYS. Every substitute the model would take out now (readiness `remove`: a real
 * copy is ready to take its seat, or the box holds more substitutes than empty seats) is a
 * removal; every reserved copy not yet in the box is an addition, available now when it is
 * owned and waiting when it is ordered or still to buy. Removals are paired with additions --
 * the option slot that names the seat first, then the same primary type, then the nearest
 * mana value -- so a row reads as one physical swap; what cannot be paired stands alone.
 *
 * THE MANA FORMULA (Rob's, as stated: start at 38 and sub out): a deck starts at
 * MANA.baseLands lands and gives one up for every MANA.perCheapRamp cheap ramp pieces (ramp at
 * two mana or less -- rocks, dorks, ramp spells), never below MANA.floorLands; a high curve
 * (average mana value of the spells at or above MANA.highCurve) asks one back, a low curve
 * (at or below MANA.lowCurve) gives one more up. The numbers are here to be argued with.
 *
 * PURE and UMD, like crankmagic-tabletop.js: Node tests hold it on the committed live library.
 * The view (crankmagic-change-ui.js) turns rows into commands and the sheet into Excel. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CrankChange = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const MANA = {baseLands: 38, perCheapRamp: 2, floorLands: 33, cheapRampMax: 2, highCurve: 3.6, lowCurve: 2.4, tolerance: 1};
  const TOTAL = 100;
  const TYPE_ORDER = ["Creature", "Planeswalker", "Battle", "Instant", "Sorcery", "Artifact", "Enchantment", "Land"];
  const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
  const isLand = (c) => /\bLand\b/.test(String((c && c.typeLine) || ""));
  const isBasic = (c) => /\bBasic\b/.test(String((c && c.typeLine) || ""));
  const typeOf = (c) => TYPE_ORDER.find((k) => String((c && c.typeLine) || "").includes(k)) || "Other";
  const rolesOf = (c, classify) => (c && Array.isArray(c.roles) && c.roles.length) ? c.roles : (classify ? (classify(c) || {}).roles || [] : []);
  /* Mana value from the record, or read off the mana cost when the record carries none. */
  const mv = (c) => { if (c && Number.isFinite(Number(c.manaValue)) && c.manaValue !== null && c.manaValue !== "") return Number(c.manaValue); const cost = String((c && c.manaCost) || ""); let n = 0; for (const sym of cost.match(/\{[^}]+\}/g) || []) { const s = sym.slice(1, -1); if (/^\d+$/.test(s)) n += Number(s); else if (/^[WUBRGCS]$|^[WUBRG]\/[WUBRGP]$|^2\/[WUBRG]$|^[WUBRG]\/P$/.test(s)) n += 1; else if (/^\d+\/[WUBRG]$/.test(s)) n += Number(s.split("/")[0]); } return n; };

  /* The land count the formula asks of a set of cards (the whole hundred, lands included). */
  function landTarget(cards, options = {}) {
    const classify = options.classify || null, m = {...MANA, ...(options.mana || {})};
    const spells = cards.filter((c) => !isLand(c));
    const cheapRamp = spells.filter((c) => rolesOf(c, classify).includes("ramp") && mv(c) <= m.cheapRampMax).length;
    let target = m.baseLands - Math.floor(cheapRamp / m.perCheapRamp);
    const avg = spells.length ? spells.reduce((n, c) => n + mv(c), 0) / spells.length : 0;
    if (spells.length && avg >= m.highCurve) target += 1;
    if (spells.length && avg <= m.lowCurve) target -= 1;
    target = Math.max(m.floorLands, target);
    return {target, cheapRamp, avg: Math.round(avg * 100) / 100, says: `${m.baseLands} lands, less one for every ${m.perCheapRamp} ramp pieces at ${m.cheapRampMax} mana or less (${cheapRamp} here), never below ${m.floorLands}${spells.length && avg >= m.highCurve ? ", plus one for a high curve" : spells.length && avg <= m.lowCurve ? ", less one for a low curve" : ""}`};
  }

  /* The counts a hundred is judged by. `cards` is a list of {card, quantity}. */
  function tally(cards, options = {}) {
    const classify = options.classify || null, isGC = options.isGameChanger || ((c) => Boolean(c && c.gameChanger));
    const out = {total: 0, lands: 0, basics: 0, ramp: 0, draw: 0, removal: 0, wipe: 0, gameChangers: 0, byType: {}, names: new Map(), avg: 0};
    let spellMv = 0, spells = 0;
    for (const {card: c, quantity} of cards) {
      const q = Math.max(0, num(quantity) || 1);
      out.total += q;
      if (isLand(c)) { out.lands += q; if (isBasic(c)) out.basics += q; } else { spellMv += mv(c) * q; spells += q; }
      const roles = rolesOf(c, classify);
      for (const r of ["ramp", "draw", "removal", "wipe"]) if (roles.includes(r)) out[r] += q;
      if (isGC(c)) out.gameChangers += q;
      const t = typeOf(c); out.byType[t] = (out.byType[t] || 0) + q;
      const key = String((c && c.name) || "").toLowerCase(); out.names.set(key, (out.names.get(key) || 0) + q);
    }
    out.avg = spells ? Math.round(spellMv / spells * 100) / 100 : 0;
    return out;
  }

  /* The warnings a set of cards earns against the formula and the top-level counts. */
  function judge(cards, options = {}) {
    const t = tally(cards, options), land = landTarget(cards.flatMap(({card, quantity}) => Array(Math.max(1, num(quantity) || 1)).fill(card)), options);
    const rules = options.rules || {}, minimums = rules.ROLE_MINIMUMS || {removal: 8, wipe: 2, ramp: 10, draw: 10}, gcLimit = Number.isFinite(rules.GC_LIMIT) ? rules.GC_LIMIT : 2;
    const colors = new Set(options.colors || []);
    const warnings = [];
    if (t.total !== TOTAL) warnings.push({kind: "total", says: `${t.total} cards in the box; a Commander deck is ${TOTAL}.`});
    if (Math.abs(t.lands - land.target) > (options.mana && Number.isFinite(options.mana.tolerance) ? options.mana.tolerance : MANA.tolerance)) warnings.push({kind: "lands", says: `${t.lands} lands; the formula asks ${land.target} (${land.says}).`});
    for (const [role, min] of Object.entries(minimums)) if (t[role] !== undefined && t[role] < min) warnings.push({kind: role, says: `${t[role]} ${role === "wipe" ? "board wipes" : role === "draw" ? "card draw" : role} against a floor of ${min}.`});
    if (t.gameChangers > gcLimit) warnings.push({kind: "gameChangers", says: `${t.gameChangers} Game Changers; the bracket allows ${gcLimit}.`});
    for (const [name, n] of t.names) if (n > 1) { const c = cards.find((x) => String((x.card && x.card.name) || "").toLowerCase() === name).card; if (!isBasic(c) && !/A deck can have any number/i.test(String((c && c.oracleText) || ""))) warnings.push({kind: "singleton", says: `${c.name} ×${n}; one copy of a non-basic.`}); }
    if (colors.size) for (const {card: c} of cards) if ((c && c.colorIdentity || []).some((x) => !colors.has(x))) warnings.push({kind: "identity", says: `${c.name} is outside the commander's colour identity.`});
    return {tally: t, land, warnings};
  }

  /* THE PLAN for one final deck. `M` is the collection model (projection, readiness); `state`
     the library. Returns rows, the three readings (the box now, after what can be done now,
     after everything arrives), the warnings on each, and the counts. */
  function plan(state, deck, options = {}) {
    const M = options.M; if (!M || !deck) return null;
    const s = state, rows = M.projection(s), ready = M.readiness(s, deck);
    /* Facts come from the catalog record (the view passes C.card; the test the record set): a
       library card is a reference, and the projection's `card` may carry no type line. */
    const cardOf = options.cardOf || ((id) => s.cards[id]);
    const factsOf = (r) => cardOf(r.cardId) || r.card || {};
    const main = deck.slots.filter((r) => r.purpose === "main");
    const slotById = new Map(deck.slots.map((r) => [r.id, r]));
    const inBox = rows.filter((r) => r.kind === "lot" && r.source === "owned" && (r.placement === "Physical deck" && r.deckId === deck.id));
    const subs = rows.filter((r) => r.kind === "lot" && r.source === "owned" && r.standInDeckId === deck.id);
    const reservedOut = rows.filter((r) => r.kind === "lot" && r.source === "owned" && r.deckId === deck.id && r.placement === "Reserved");
    const ordered = rows.filter((r) => r.kind === "lot" && r.source === "ordered" && r.deckId === deck.id);
    const needs = rows.filter((r) => r.kind === "need" && r.deckId === deck.id);
    const nameOf = (r) => String(factsOf(r).name || (r.card && r.card.name) || "");
    /* Which substitutes come out now: the model's `remove` count (a real copy is ready for the
       seat, or the box holds more substitutes than empty seats), taken in the binder's order;
       the rest come out when the card they fill in for arrives. */
    const subsSorted = subs.slice().sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
    /* One copy per row (a lot of three basics is three rows), so every row is one physical swap. */
    let out = ready.remove; const removeNow = [], removeLater = [];
    for (const r of subsSorted) for (let k = 0; k < r.quantity; k += 1) { const unit = {lotId: r.id, cardId: r.cardId, card: factsOf(r), name: nameOf(r), quantity: 1, standInFor: r.standInFor || ""}; if (out > 0) { removeNow.push({...unit, why: "a substitute the list does not call for"}); out -= 1; } else removeLater.push({...unit, why: "a substitute until the real card arrives"}); }
    const where = (r) => r.location && r.location.kind === "deck" ? (options.deckName ? options.deckName(r.location.deckId) : "another deck") + "'s box" : r.location && r.location.box ? `Bench · ${r.location.box}` : "Bench";
    const units = (list, make) => list.flatMap((r) => Array.from({length: Math.max(1, num(r.quantity) || 1)}, () => make(r)));
    const additions = [
      ...units(reservedOut, (r) => ({lotId: r.id, cardId: r.cardId, card: factsOf(r), name: nameOf(r), quantity: 1, where: where(r), available: true, slotId: r.allocation && r.allocation.slotId})),
      ...units(ordered, (r) => ({lotId: r.id, cardId: r.cardId, card: factsOf(r), name: nameOf(r), quantity: 1, where: "ordered", available: false, slotId: r.allocation && r.allocation.slotId})),
      ...units(needs, (r) => ({lotId: null, cardId: r.cardId, card: factsOf(r), name: nameOf(r), quantity: 1, where: "to buy", available: false, slotId: r.slotId}))
    ].sort((a, b) => Number(b.available) - Number(a.available) || a.name.localeCompare(b.name));
    /* PAIRING. A removal now pairs with an addition available now; a substitute that stays
       pairs with the ordered or to-buy card whose seat it fills, so the row reads "remove
       this when that arrives". Within each: THE SEAT THE SUBSTITUTE WAS RECORDED AGAINST first
       (play-space plan §2.12 — `standInFor`, set when the copy went into the box, which turns
       this from a guess into a fact), then the option slot that names the seat, then the same
       primary type, then the nearest mana value. What cannot pair stands alone.

       Everything after the first is still inference and still needed: nothing recorded a pairing
       before §2.12 shipped, and a copy can be dropped in as a substitute without naming a seat. */
    const replacedBy = new Map();
    for (const r of deck.slots) if (r.purpose !== "main" && r.replaces && slotById.has(r.replaces)) replacedBy.set(slotById.get(r.replaces).cardId, r.cardId);
    const free = additions.slice(), rowsOut = [];
    const take = (pred) => { const i = free.findIndex(pred); return i >= 0 ? free.splice(i, 1)[0] : null; };
    const pair = (rem, wantAvailable) => {
      const named = replacedBy.get(rem.cardId), pool = (a) => a.available === wantAvailable;
      const recorded = rem.standInFor ? take((a) => pool(a) && a.slotId === rem.standInFor) : null;
      const add = recorded || (named && take((a) => pool(a) && a.cardId === named)) || take((a) => pool(a) && typeOf(a.card) === typeOf(rem.card)) || (() => { let best = null, gap = Infinity; for (const a of free) { if (!pool(a)) continue; const g = Math.abs(mv(a.card) - mv(rem.card)); if (g < gap) { gap = g; best = a; } } return best ? take((a) => a === best) : null; })();
      return {add, why: add ? (add === recorded ? "recorded when the substitute went in" : named === add.cardId ? "the option slot names this seat" : typeOf(add.card) === typeOf(rem.card) ? `both ${typeOf(rem.card).toLowerCase()}s` : "the nearest mana value") : ""};
    };
    for (const rem of removeNow) { const {add, why} = pair(rem, true); rowsOut.push({action: add ? "swap" : "remove", out: rem, in: add, available: true, why: add ? why : "more substitutes than the list has seats for"}); }
    const staying = [];
    for (const rem of removeLater) { const {add, why} = pair(rem, false); if (add) rowsOut.push({action: "swap", out: rem, in: add, available: false, why: `${why}; it comes out when ${add.name} arrives`}); else staying.push(rem); }
    for (const add of free) rowsOut.push({action: "add", out: null, in: add, available: add.available, why: add.available ? "on the list, not yet in the box" : `on the list, ${add.where}`});
    rowsOut.forEach((r, i) => { r.step = i + 1; });
    /* THE READINGS: the box now, after what can be done now, after everything arrives. */
    const boxNow = [...inBox, ...subs].map((r) => ({lotId: r.id, card: factsOf(r), quantity: r.quantity}));
    /* A removal comes off its own lot, and off the card's other lots when the lot is short. */
    const apply = (base, rows) => { const list = base.map((x) => ({...x}));
      for (const r of rows) { if (r.out) { let left = r.out.quantity; const same = (x) => x.card && r.out.card && (x.card.id || x.card.name) === (r.out.card.id || r.out.card.name);
          for (const x of [...list.filter((x) => x.lotId === r.out.lotId), ...list.filter((x) => x.lotId !== r.out.lotId && same(x))]) { if (left <= 0) break; const take = Math.min(x.quantity, left); x.quantity -= take; left -= take; }
          for (let i = list.length - 1; i >= 0; i -= 1) if (list[i].quantity <= 0) list.splice(i, 1); }
        if (r.in) list.push({lotId: r.in.lotId, card: r.in.card, quantity: r.in.quantity}); }
      return list; };
    const judgeOpts = {...options, colors: deck.commanders.flatMap((id) => (cardOf(id) && cardOf(id).colorIdentity) || [])};
    const now = judge(boxNow, judgeOpts), afterNow = judge(apply(boxNow, rowsOut.filter((r) => r.available)), judgeOpts), afterAll = judge(apply(boxNow, rowsOut), judgeOpts);
    const listCards = main.map((r) => ({card: cardOf(r.cardId), quantity: r.quantity})).filter((x) => x.card);
    const list = judge(listCards, judgeOpts);
    return {deckId: deck.id, deckName: deck.name, rows: rowsOut, staying, counts: {remove: removeNow.reduce((n, r) => n + r.quantity, 0), removeLater: rowsOut.filter((r) => r.out && !r.available).reduce((n, r) => n + r.out.quantity, 0), addNow: additions.filter((a) => a.available).reduce((n, a) => n + a.quantity, 0), waiting: additions.filter((a) => !a.available).reduce((n, a) => n + a.quantity, 0), rows: rowsOut.length, doable: rowsOut.filter((r) => r.available).length},
      readings: {now, afterNow, afterAll, list}, readiness: ready};
  }

  /* The sheet a plan exports: rows for the checklist, rows for the readings. */
  function sheets(p) {
    const say = (r) => r.action === "swap" ? "Remove, then put in" : r.action === "remove" ? "Remove" : "Put in";
    const rows = p.rows.map((r) => ({step: r.step, action: say(r), remove: r.out ? r.out.name : "", removeCopies: r.out ? r.out.quantity : "", putIn: r.in ? r.in.name : "", putInCopies: r.in ? r.in.quantity : "", from: r.in ? r.in.where : "", status: r.available ? "Now" : `Waiting · ${r.in ? r.in.where : ""}`, why: r.why}));
    const reading = (label, j) => ({reading: label, cards: j.tally.total, lands: j.tally.lands, landsWanted: j.land.target, ramp: j.tally.ramp, draw: j.tally.draw, removal: j.tally.removal, wipes: j.tally.wipe, gameChangers: j.tally.gameChangers, avgManaValue: j.tally.avg, warnings: j.warnings.map((w) => w.says).join(" ")});
    const readings = [reading("The box now", p.readings.now), reading("After what can be done now", p.readings.afterNow), reading("After everything arrives", p.readings.afterAll), reading("The list as written", p.readings.list)];
    return {
      sheets: [
        {name: "Change list", columns: [["step", "Step", 6], ["action", "Do", 20], ["remove", "Remove this card", 30], ["removeCopies", "Copies", 8], ["putIn", "Put this card in", 30], ["putInCopies", "Copies", 8], ["from", "Where it is", 22], ["status", "Status", 18], ["why", "Why paired", 34]].map(([key, label, width]) => ({key, label, width})), rows},
        {name: "Readings", columns: [["reading", "Reading", 30], ["cards", "Cards", 8], ["lands", "Lands", 8], ["landsWanted", "Lands the formula asks", 22], ["ramp", "Ramp", 8], ["draw", "Draw", 8], ["removal", "Removal", 10], ["wipes", "Wipes", 8], ["gameChangers", "Game Changers", 14], ["avgManaValue", "Avg mana value", 14], ["warnings", "Warnings", 80]].map(([key, label, width]) => ({key, label, width})), rows: readings}
      ]
    };
  }

  return {MANA, TOTAL, landTarget, tally, judge, plan, sheets, typeOf, isLand};
});
