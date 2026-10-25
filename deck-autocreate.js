/* AUTO-CREATE (Rob, 2026-10-23: the Decks requirements' CRD-4 to CRD-8, GEN-3, GEN-6, MEC-3, MEC-4, RVW-2).
 *
 * The app's own builder for the 99, no AI (CRD-7, REC-3). It is the deck generator's skeleton (deck-generator.js: its role
 * quotas, its order, its 36 lands) moved by the weighting the person picks and filled from the graph's cards, scored on the
 * recommendations (deck-recommend.js). Every one of the 99 seats gets a SLOT DEFINITION -- a role and its conditions,
 * "ramp, mana value 1-3", "payoff, Aristocrats", "proliferate" -- and a card fills a seat because it meets them (CRD-8);
 * the definitions are saved with the deck so a later swap can ask for the same thing. Each seat offers up to five
 * alternatives that meet the same definition (RVW-2).
 *
 * WHERE CARDS COME FROM (GEN-3), cumulative like Box: "bench" (free copies on the Bench), "buy" (and cards to buy), "decks"
 * (and copies sitting in another deck's box). Owned first, then popular, then cheap; the budget caps what is to buy.
 *
 * THE WEIGHTING (CRD-4): Balanced, Offense, Defense, Response, Value, Combo -- data/composition-targets.json's play styles
 * Balanced, Aggressive, Defensive (new on 2026-10-23), Reactive, Value engine and Combo, each a shift of the role counts.
 *
 * Deterministic: the same inputs give the same 99 -- every ordering ends on the card's name. PURE and UMD. */
(function (root, factory) {
  const isNode = typeof module === "object" && module.exports && typeof require === "function";
  const G = isNode ? require("./deck-generator.js") : root && root.MtgDeckGenerator;
  const V = isNode ? require("./deck-vocabulary.js") : root && root.CrankVocabulary;
  const api = factory(G, V);
  if (isNode) module.exports = api;
  if (root) root.CrankAutoCreate = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (G, V) {
  "use strict";
  if (!G || !V) throw new Error("Auto-create needs deck-generator.js and deck-vocabulary.js");
  const LANDS = 36, NONBASIC_MAX = 12, ALTERNATIVES = 5;
  const WEIGHTINGS = [["Balanced", "Balanced"], ["Offense", "Aggressive"], ["Defense", "Defensive"], ["Response", "Reactive"], ["Value", "Value engine"], ["Combo", "Combo"]];
  const SOURCES = ["bench", "buy", "decks"];
  const BASICS = {W: "Plains", U: "Island", B: "Swamp", R: "Mountain", G: "Forest"};
  /* composition-targets' roles, in the generator's: a threat is a finisher, a counterspell is protection; recursion and
     tutors get seats of their own, taken from the theme. */
  const ROLE_OF = {threat: "finisher", counterspell: "protection", recursion: "recursion", tutor: "tutor", removal: "removal", wipe: "wipe", draw: "draw", ramp: "ramp", protection: "protection", finisher: "finisher"};
  const MV = {ramp: [1, 3], draw: [1, 4], removal: [1, 4], wipe: [3, 6], protection: [1, 3], finisher: [4, 9], recursion: [1, 5], tutor: [1, 4]};
  const LABEL = {ramp: "ramp", draw: "card draw", removal: "removal", wipe: "board wipe", protection: "protection", finisher: "finisher", recursion: "recursion", tutor: "tutor"};

  /* THE SKELETON: how many seats each role gets, from the generator's quotas shifted by the weighting. */
  function quotas(weighting, targets) {
    const style = (targets && targets.playStyles || {})[(WEIGHTINGS.find(([w]) => w === weighting) || WEIGHTINGS[0])[1]] || {roles: {}};
    const q = {recursion: 0, tutor: 0};
    for (const r of G.ROLE_ORDER) q[r] = G.ROLE_QUOTAS[r].quota;
    for (const [role, range] of Object.entries(style.roles || {})) {const r = ROLE_OF[role];if (!r) continue;q[r] = Math.max(0, (q[r] || 0) + Number(range.min || 0));}
    const spells = 99 - LANDS, named = Object.entries(q).filter(([k]) => k !== "theme").reduce((n, [, v]) => n + v, 0);
    q.theme = Math.max(0, spells - named);
    return q;
  }

  /* A card meets a slot when it carries the slot's role, inside its mana value range, or serves its style, mechanic or
     tribe. */
  function meets(c, slot) {
    if (c.isLand) return false;
    if (slot.role === "theme") {
      if (slot.mechanic && !V.carries(c, slot.mechanic)) return false;
      if (slot.style && !V.archetype(slot.style).card(c)) return false;
      if (slot.tribe && !(c.tribes || []).includes(slot.tribe) && !(c.wants || []).includes(slot.tribe)) return false;
      return true;
    }
    const roles = c.roles || [];
    const ok = slot.role === "finisher" ? roles.includes("finisher") || (/Creature/.test(c.type || "") && Number(c.pow) >= 5) : roles.includes(slot.role);
    if (!ok) return false;
    if (slot.mv && (c.mv < slot.mv[0] || c.mv > slot.mv[1])) return false;
    return true;
  }
  const describe = (slot) => slot.role === "theme"
    ? [slot.mechanic ? V.label(slot.mechanic.slice(2)) : "", slot.style ? `payoff, ${V.archetype(slot.style).label}` : "", slot.tribe ? `${slot.tribe}` : ""].filter(Boolean).join(", ") || "theme"
    : `${LABEL[slot.role]}${slot.mv ? `, ${slot.mv[0]}-${slot.mv[1]} mana` : ""}`;

  /* THE SLOT PLAN (CRD-8, MEC-3): each chosen mechanic gets its bar of seats first, then the roles, then the theme split
     between the primary and the second composition. */
  function plan({definition = {}, weighting = "Balanced", targets = null}) {
    const q = quotas(weighting, targets), slots = [], mechanics = (definition.mechanics || []).slice(0, V.MAX_MECHANICS);
    const primary = definition.composition?.primary || null, secondary = definition.composition?.secondary || null, tribe = definition.composition?.tribe || null;
    const add = (n, slot) => {for (let i = 0; i < n; i++) slots.push({...slot, label: describe(slot)});};
    let theme = q.theme;
    for (const m of mechanics) {const n = Math.min(V.BAR, theme);add(n, {role: "theme", mechanic: m});theme -= n;}
    for (const r of [...G.ROLE_ORDER.filter((x) => x !== "theme"), "recursion", "tutor"]) add(q[r] || 0, {role: r, mv: MV[r] || null});
    const second = secondary ? Math.floor(theme * 0.3) : 0;
    add(theme - second, {role: "theme", style: primary, tribe: primary === "tribal" ? tribe : null});
    if (second) add(second, {role: "theme", style: secondary});
    return {quotas: q, slots: slots.map((s, i) => ({seat: i + 1, ...s}))};
  }

  /* THE FILL. `available(name)` says where a copy is: {bench: free copies, decks: [{deckId, name}]}; `exclude(card)` is
     the restriction check the caller can prove (mass land denial from the card's text); `banned` a set of names. */
  function build({commanders, definition = {}, weighting = "Balanced", targets = null, pool, recommendations = [], available = () => ({bench: 0, decks: []}), exclude = () => false, banned = new Set(), brackets = null}) {
    const identity = new Set(commanders.flatMap((c) => [...V.ciSet(c.ci)])), leaders = new Set(commanders.map((c) => c.name));
    const sources = SOURCES.slice(0, SOURCES.indexOf(definition.cardSources || "buy") + 1);
    const bracket = Number(definition.baseBracket) || 2, rules = (brackets || []).find((b) => b.n === bracket) || {gameChangers: bracket >= 4 ? 99 : bracket === 3 ? 3 : 0, extraTurnChains: bracket >= 4};
    const flags = {massLandDenial: true, extraTurns: true, lateCombos: true, gameChangerCap: true, ...(definition.restrictionFlags || {})};
    const gcCap = flags.gameChangerCap ? rules.gameChangers : 99, turnCap = flags.extraTurns && !rules.extraTurnChains ? 1 : 99, tutorCap = flags.lateCombos ? 4 : 99;
    const never = new Set((definition.neverInclude || []).map((x) => String(x).toLowerCase()));
    const rec = new Map(recommendations.map((r, i) => [r.name, {score: r.score, why: r.why, rank: i}]));
    const where = (c) => {const a = available(c.name) || {bench: 0, decks: []};if (a.bench > 0) return {source: "bench"};
      if (sources.includes("decks") && a.decks && a.decks.length) return {source: "deck", deckId: a.decks[0].deckId, deckName: a.decks[0].name};
      if (sources.includes("buy")) return {source: "buy"};return null;};
    const price = (c) => Number.isFinite(c.price) ? c.price : 0;
    const candidates = pool.filter((c) => c && !c.isLand && !leaders.has(c.name) && V.within(c.ci, identity) && !banned.has(c.name) && !never.has(c.name.toLowerCase()) && !exclude(c));
    const value = (c) => {const r = rec.get(c.name), w = where(c);return (r ? r.score : 0) + (w && w.source === "bench" ? 4 : w && w.source === "deck" ? 1.5 : 0) + (Number.isFinite(c.rank) ? Math.max(0, 2 - c.rank / 5000) : 0) - Math.min(3, price(c) / 10);};
    const scored = candidates.map((c) => ({c, v: value(c)})).sort((a, b) => b.v - a.v || a.c.name.localeCompare(b.c.name, "en-US"));
    const {slots} = plan({definition, weighting, targets}), used = new Set(), budget = Number.isFinite(definition.budget) && definition.budget > 0 ? definition.budget : Infinity;
    let spend = 0, gc = 0, turns = 0, tutors = 0;
    const allowed = (c) => (!c.gameChanger || gc < gcCap) && (!(c.roles || []).includes("extra-turn") || turns < turnCap) && (!(c.roles || []).includes("tutor") || tutors < tutorCap);
    const take = (c, w) => {used.add(c.name);if (w.source === "buy") spend += price(c);if (c.gameChanger) gc++;if ((c.roles || []).includes("extra-turn")) turns++;if ((c.roles || []).includes("tutor")) tutors++;};
    const filled = slots.map((slot) => {
      let pick = null;
      for (const {c} of scored) {if (used.has(c.name) || !meets(c, slot) || !allowed(c)) continue;const w = where(c);if (!w) continue;if (w.source === "buy" && spend + price(c) > budget) continue;pick = {c, w};break;}
      if (pick) take(pick.c, pick.w);
      return {...slot, card: pick ? pick.c.name : null, source: pick ? pick.w.source : null, deckId: pick && pick.w.deckId || null, price: pick ? price(pick.c) : null, why: pick && rec.get(pick.c.name) ? rec.get(pick.c.name).why : []};
    });
    /* Alternatives: the next cards that meet the same definition and are not in the deck (RVW-2). */
    for (const s of filled) s.alternatives = scored.filter(({c}) => !used.has(c.name) && meets(c, s) && where(c)).slice(0, ALTERNATIVES).map(({c}) => ({name: c.name, source: where(c).source, price: price(c)}));
    /* LANDS: owned nonbasic lands inside the colors first, up to twelve, then basics by the colors' share of the pips. */
    const nonbasics = pool.filter((c) => c && c.isLand && !/Basic/.test(c.type || "") && V.within(c.ci, identity) && !banned.has(c.name) && (available(c.name)?.bench > 0 || (sources.includes("buy") && price(c) <= 2 && c.rank && c.rank < 3000)))
      .sort((a, b) => ((available(b.name)?.bench > 0) - (available(a.name)?.bench > 0)) || (a.rank || 1e9) - (b.rank || 1e9) || a.name.localeCompare(b.name, "en-US")).slice(0, identity.size > 1 ? NONBASIC_MAX : 4);
    const colors = [...identity].sort(), basics = LANDS - nonbasics.length, each = colors.length ? Math.floor(basics / colors.length) : 0;
    const basicLands = colors.length ? colors.map((x, i) => ({name: BASICS[x], quantity: each + (i < basics - each * colors.length ? 1 : 0)})) : [{name: "Wastes", quantity: basics}];
    const toBuy = filled.filter((s) => s.source === "buy").reduce((n, s) => n + (s.price || 0), 0);
    const counts = V.mechanicCounts(candidates, identity, definition.mechanics || []);
    return {slots: filled, lands: {nonbasic: nonbasics.map((c) => ({name: c.name, source: available(c.name)?.bench > 0 ? "bench" : "buy", price: price(c)})), basic: basicLands},
      summary: {seats: filled.length, filled: filled.filter((s) => s.card).length, lands: LANDS, toBuy: Math.round(toBuy * 100) / 100, budget: budget === Infinity ? null : budget,
        bySource: {bench: filled.filter((s) => s.source === "bench").length, buy: filled.filter((s) => s.source === "buy").length, decks: filled.filter((s) => s.source === "deck").length},
        mechanics: counts}};
  }

  /* CRD-5, CRD-6: what Auto-create still needs. A composition (Let CrankMagic choose counts), at most three mechanics, and
     only mechanics whose pool can carry their bar. */
  function missing(definition = {}, poolCounts = []) {
    const out = [];
    if (!definition.composition || !definition.composition.primary) out.push({section: "Gameplay", says: "Choose a composition, or Let CrankMagic choose."});
    if ((definition.mechanics || []).length > V.MAX_MECHANICS) out.push({section: "Mechanics", says: `Choose at most ${V.MAX_MECHANICS} mechanics.`});
    for (const m of poolCounts) if (m.cards < V.BAR) out.push({section: "Mechanics", says: `${V.label(m.id.slice(2))}: only ${m.cards} cards fit, fewer than the ${V.BAR} a mechanic needs.`});
    return out;
  }
  return {LANDS, WEIGHTINGS, SOURCES, quotas, plan, meets, describe, build, missing};
});
