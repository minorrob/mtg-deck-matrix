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
    if (colors.size) for (const {card: c} of cards) if ((c && c.colorIdentity || []).some((x) => !colors.has(x))) warnings.push({kind: "identity", says: `${c.name} is outside the commander's color identity.`});
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

  /* PLANNED CHANGES (Rob, 2026-10-25, C1–C8; the list once called Ready to add). One deck's changes as pairs, one copy a
     side: what to take out of the box beside what to add to it. Read from the model's own record states
     (M.deckStatus): a Substitute in the box says whose seat it holds, a Reserved or Loading copy which card it replaces,
     an Upgrade the Final it would replace -- so the original pairs are the model's, not a guess.

     TAKE OUT OF BOX: every Substitute in the box ("Substitute"), and a Final an Upgrade names ("Final").
     ADD TO BOX, by where it is in the chain (Rob: To Buy · Not purchased > To Buy · Ordered > Owned) and what it is for:
       - Owned · Final: a Reserved or Loading copy you own, on the Bench or in another deck's box;
       - Owned · Substitute: a stand-in chosen for a seat, not in yet;
       - Owned · Bench: a free copy on the Bench that fills a seat this deck has not reserved;
       - Owned / To Buy / To Buy · Ordered · Upgrade: an Upgrade, by ownership;
       - To Buy / To Buy · Ordered · Final: a Reserved card still to buy or on its way, shown with the Substitute holding
         its seat.
     EVERY ADD CAN BE TICKED (Rob, 2026-10-26: "I can't check the box in Planned Changes for 'Add to Box' cards. I should be
     able to, and able to not remove any of them, just add them if I want"): ticked, a To Buy or Ordered Final is recorded
     as in hand and goes in; an Upgrade that names nothing it replaces joins the list as one more card (Owned: in the box
     too). Only a Bench row with no copy to move cannot be ticked.
     A row holds one pair, an add alone, or a take-out alone; rows with both come first. */
  function planned(state, deck, options = {}) {
    const M = options.M; if (!M || !deck) return null;
    const s = state, cardOf = options.cardOf || ((id) => s.cards[id]), status = M.deckStatus(s, deck), mine = status.rows;
    const facts = (id) => cardOf(id) || s.cards[id] || {name: ""};
    const units = (n, make) => Array.from({length: Math.max(1, num(n) || 1)}, (_, k) => make(k));
    const chainOf = (own) => (own === "own" ? "owned" : own === "ordered" ? "ordered" : "buy");
    const CHAIN = {owned: "Owned", ordered: "To Buy · Ordered", buy: "To Buy"};
    const upgradesFor = new Set(mine.filter(({st}) => st.use === "upgrade" && st.replaces).map(({st}) => st.replaces));
    const outs = [], ins = [];
    for (const {r, st} of mine) {
      if (r.kind !== "lot" || !st.inBox) continue;
      const role = st.use === "substitute" ? "Substitute" : st.use === "final" && upgradesFor.has(r.cardId) ? "Final" : "";
      if (!role) continue;
      for (const k of units(r.quantity, (k) => k)) outs.push({id: `out:${r.id}#${k}`, lotId: r.id, cardId: r.cardId, card: facts(r.cardId), name: facts(r.cardId).name, role, holds: st.holds || "", slotId: st.slotId || (role === "Final" ? (r.allocation && r.allocation.slotId) || "" : ""), selectable: true});
    }
    const free = (cardId, taken) => s.lots.find((l) => l.cardId === cardId && l.source === "owned" && !l.allocation && !(l.location && l.location.kind === "deck") && (l.offer || "none") === "none" && !l.chosenFor && !taken.has(l.id));
    const takenFree = new Set();
    for (const {r, st} of mine) {
      if (st.inBox) continue;
      let kind = "", chain = "", lotId = r.kind === "lot" ? r.id : null, seat = "";
      if (st.use === "upgrade") {kind = "upgrade"; chain = chainOf(st.ownership); if (chain === "owned" && (!lotId || r.source !== "owned")) {const l = free(r.cardId, takenFree); if (l) {lotId = l.id; takenFree.add(l.id);} else {chain = "buy"; lotId = null;}} if (chain !== "owned" && r.kind === "lot") lotId = null;}
      else if (st.use === "final" && st.play === "loading") {kind = "final"; chain = "owned";}
      else if (st.use === "reserved") {kind = "final"; chain = chainOf(st.ownership);}
      else if (st.use === "substitute" && r.kind === "lot") {kind = "substitute"; chain = "owned"; seat = (r.chosenFor && r.chosenFor.slotId) || "";}
      else continue;
      const use = kind === "upgrade" ? "Upgrade" : kind === "substitute" ? "Substitute" : "Final";
      for (const k of units(r.quantity, (k) => k)) ins.push({id: `in:${r.id || r.recordId}#${k}`, kind, chain, label: `${CHAIN[chain]} - ${use}`, lotId, cardId: r.cardId, card: facts(r.cardId), name: facts(r.cardId).name, replaces: st.replaces || "", slotId: st.slotId || r.slotId || "", seat, where: st.from ? (options.deckName ? options.deckName(st.from) : "another deck") : "", named: kind !== "upgrade" || !!(st.slotId && st.replaces), entry: r.kind === "entry" ? {groupId: r.groupId, entryId: r.id} : null, selectable: kind !== "final" || chain !== "ordered" || !!lotId});
    }
    const bench = M.benchFree ? M.benchFree(s, deck) : {rows: []};
    for (const x of bench.rows || []) for (const k of units(x.quantity, (k) => k)) ins.push({id: `in:bench:${x.lotId || x.cardId}#${k}`, kind: "bench", chain: "owned", label: "Owned - Bench", lotId: x.lotId || null, cardId: x.cardId, card: facts(x.cardId), name: facts(x.cardId).name, replaces: "", slotId: "", seat: "", where: x.box ? `Bench · ${x.box}` : "Bench", selectable: !!x.lotId});
    /* THE ORIGINAL PAIRS: an Upgrade with the Final it names; a Reserved or Loading copy with the Substitute holding its
       seat (one whose `holds` is this card), else one of the card it replaces. */
    const left = outs.slice(), take = (pred) => {const i = left.findIndex(pred); return i >= 0 ? left.splice(i, 1)[0] : null;};
    const rows = [];
    for (const a of ins) {
      const o = a.kind === "upgrade" ? take((x) => x.role === "Final" && x.cardId === a.replaces)
        : a.kind === "final" ? (take((x) => x.role === "Substitute" && x.holds === a.cardId) || (a.replaces ? take((x) => x.role === "Substitute" && x.cardId === a.replaces) : null)) : null;
      rows.push({in: a, out: o});
    }
    for (const o of left) rows.push({in: null, out: o});
    const rank = (r) => (r.in && r.out ? 0 : r.in ? 1 : 2) * 10 + (r.in ? ({owned: 0, ordered: 1, buy: 2})[r.in.chain] : 0);
    rows.sort((a, b) => rank(a) - rank(b) || String((a.in || a.out).name).localeCompare(String((b.in || b.out).name)));
    rows.forEach((r, i) => { r.row = i + 1; });
    return {deckId: deck.id, rows, boxTotal: status.deckTotal};
  }

  /* WHAT A SWAP PAIRS (C7): every selected add with its original take-out when that is selected too; an add whose partner
     is not selected takes the next selected take-out left over, and that pair is marked re-paired; what is left of
     either side goes alone (C8: three in and one out still swap). */
  function pairUp(rows, selectedIn, selectedOut) {
    const isIn = (a) => a && selectedIn.has(a.id), isOut = (o) => o && selectedOut.has(o.id);
    const pairs = [], usedOut = new Set();
    for (const r of rows) if (isIn(r.in) && isOut(r.out)) {pairs.push({in: r.in, out: r.out, repaired: false}); usedOut.add(r.out.id);}
    const spare = rows.filter((r) => isOut(r.out) && !usedOut.has(r.out.id)).map((r) => r.out);
    for (const r of rows) if (isIn(r.in) && !isOut(r.out)) {const o = spare.shift() || null; pairs.push({in: r.in, out: o, repaired: !!o});}
    for (const o of spare) pairs.push({in: null, out: o, repaired: false});
    return pairs;
  }

  /* A SWAP AS COMMANDS, one batch, one undo. An Upgrade is reserved in place of the Final it names (that Final staying in
     the box as its Substitute); re-paired with another Final, that Final's seat takes it instead. An owned card goes in
     (its seat found by the model, or a stand-in for the seat it was chosen for). A take-out goes to the Bench, except
     beside a To Buy Upgrade: that one stays in the box holding the seat until the Upgrade arrives (Rob: "Record the
     plan").

     ADDING WITHOUT TAKING OUT (Rob, 2026-10-26). A To Buy Final ticked is recorded as owned, in the box, on its seat; an
     Ordered one is marked arrived and goes in. An Upgrade naming nothing joins the list as one more card, and an Owned
     one goes in with it; the deck may pass 100 and reads Building until it is back. A Substitute whose card went in, or a
     Final an Owned Upgrade replaced, stays in the box as a Substitute with no live card -- unless a Reserved card is left
     with no one holding its seat (its Substitute taken out), when the two are paired; several Substitutes for fewer such
     seats go by mana value, largest first. `rows` is the plan the pairs came from (planned().rows). */
  function swapCommands(deck, pairs, rows = []) {
    const deckId = deck.id, into = [], out = [], plan = [], grow = [], held = [];
    const listed = (cardId) => deck.slots.filter((x) => x.purpose === "main" && x.cardId === cardId).reduce((n, x) => n + x.quantity, 0), more = new Map();
    for (const {in: a, out: o} of pairs) {
      if (a && a.kind === "upgrade" && !a.named) {
        const n = (more.get(a.cardId) || listed(a.cardId)) + 1; more.set(a.cardId, n);
        if (a.chain === "owned" && a.lotId) into.push({type: "place", lotId: a.lotId, deckId, quantity: 1, asStandIn: true, confirmed: true});
        grow.push({type: "target", deckId, cardId: a.cardId, quantity: n, confirmed: true});
        if (a.entry) grow.push({type: "removeGroupEntries", groupId: a.entry.groupId, entryIds: [a.entry.entryId]});
        if (o) out.push(o);
      } else if (a && a.kind === "upgrade") {
        if (o && o.role === "Final" && o.slotId && o.cardId !== a.replaces) plan.push({type: "swap", deckId, slotId: o.slotId, cardId: a.cardId, substitute: true, confirmed: true}, {type: "removeOption", deckId, slotId: a.slotId});
        else plan.push({type: "acceptOption", deckId, slotId: a.slotId, substitute: true});
        if (a.chain === "owned" && a.lotId) into.push({type: "place", lotId: a.lotId, deckId, quantity: 1, confirmed: true});
        if (o && a.chain === "owned") out.push(o);
      } else if (a && a.kind === "final" && a.chain === "buy") {
        const seat = deck.slots.find((x) => x.id === a.slotId);
        into.push({type: "acquire", deckId, slotId: a.slotId, lot: {cardId: a.cardId, quantity: 1, source: "owned", printing: (seat && seat.printing) || {}, location: {kind: "deck", deckId, box: deck.name}}});
        if (o) out.push(o);
      } else if (a && a.kind === "final" && a.chain === "ordered") {
        into.push({type: "source", lotId: a.lotId, source: "owned"}, {type: "place", lotId: a.lotId, deckId, quantity: 1, confirmed: true});
        if (o) out.push(o);
      } else if (a) {
        into.push(a.kind === "substitute" ? {type: "place", lotId: a.lotId, deckId, quantity: 1, asStandIn: true, standInFor: a.seat, confirmed: true} : {type: "place", lotId: a.lotId, deckId, quantity: 1, confirmed: true});
        if (o) out.push(o);
      } else if (o) out.push(o);
    }
    /* THE SEATS AFTER: who no longer holds a live card, and which Reserved seats are left with no one holding them. */
    const outIds = new Set(pairs.filter((p) => p.out).map((p) => p.out.id)), inIds = new Set(pairs.filter((p) => p.in).map((p) => p.in.id));
    const freed = [], needy = [];
    for (const r of rows) {
      if (!r.in) continue;
      const added = inIds.has(r.in.id), holder = r.out && !outIds.has(r.out.id) ? r.out : null;
      if (added && holder && (r.in.kind === "final" || (r.in.kind === "upgrade" && r.in.chain === "owned"))) freed.push(holder);
      if (!added && r.in.kind === "final" && r.in.slotId && !holder) needy.push(r.in);
    }
    const byMana = (a, b) => mv(b.card) - mv(a.card) || String(a.name).localeCompare(String(b.name));
    freed.sort(byMana); needy.sort(byMana);
    freed.forEach((f, i) => held.push({type: "holdSeat", lotId: f.lotId, deckId, quantity: 1, slotId: needy[i] ? needy[i].slotId : ""}));
    /* Copies of one record moving the same way go as one place, so ten Mountains stay one record of ten. */
    const merged = (list) => {const seen = new Map(), keep = []; for (const c of list) {if (c.type !== "place") {keep.push(c); continue;} const k = [c.lotId, c.deckId || "", c.asStandIn ? 1 : 0, c.standInFor || ""].join("|"); if (seen.has(k)) seen.get(k).quantity += c.quantity; else {const x = {...c}; seen.set(k, x); keep.push(x);}} return keep;};
    const once = (list) => {const seen = new Set(); return list.filter((c) => {const k = JSON.stringify(c); if (c.type !== "source" || !seen.has(k)) {seen.add(k); return true;} return false;});};
    const targets = [...new Map(grow.filter((c) => c.type === "target").map((c) => [c.cardId, c])).values()], entries = grow.filter((c) => c.type !== "target");
    return [...plan, ...once(merged(into)), ...targets, ...entries, ...merged(out.map((o) => ({type: "place", lotId: o.lotId, quantity: 1, confirmed: true}))), ...held];
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

  return {MANA, TOTAL, landTarget, tally, judge, plan, sheets, typeOf, isLand, planned, pairUp, swapCommands};
});
