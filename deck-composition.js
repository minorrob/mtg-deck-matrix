/* THE COMPOSITION MODEL: what a hundred is made of, against what its bracket and playstyle ask for.
 *
 * Rob, October 18 (Linear ROB-114, project "Deck tuning"): "strong deck composition understandings on ramps,
 * counters, defense, offense, deck mechanic objectives." The deck page already counts the curve, the types and
 * ramp (crankmagic-decks.js compositionHTML), the lens counts four roles against the house minimums
 * (crankmagic-lens.js), and the change list judges lands by Rob's formula (crankmagic-change.js). None of them
 * answers his question in one place, by role, against a target that depends on the deck, with the deck's own
 * objectives named. This module does, as one pure function the screens render and never recompute.
 *
 * WHAT IT READS. Card records in any of the three shapes the repository carries (the catalog's camelCase, the
 * engine oracle's short keys, Scryfall's snake_case), normalized once. Roles come from the one audited vocabulary,
 * card-classify.js (the same "ramp" Discover means; crankmagic-decks.js rolesOf), never from a second set of
 * patterns here, with two readings of its own: COUNTERSPELL, which the classifier files under protection and Rob
 * asked for by name, and THREAT, a body that pressures life totals, which no role in the vocabulary carries.
 *
 * WHAT IT MEANS BY "TARGET". data/composition-targets.json: a base range per role, overridden per bracket (the
 * published Commander Brackets 1 to 5, crankmagic-lobby.js BRACKETS), shifted per playstyle (the Lab's five:
 * Balanced, Aggressive, Reactive, Value engine, Combo). The house minimums (crankmagic-rules.js ROLE_MINIMUMS:
 * removal 8, wipe 2, ramp 10, draw 10) are the floors the base starts from; the land target is Rob's formula in
 * crankmagic-change.js when that module is present, so the two never disagree. The file says where each number
 * came from, and the reasonableness report (ROB-112) and the simulator's calibration (ROB-116) are the measurements
 * that will move them; until then they are a first cut and the file says so.
 *
 * WHAT IT MEANS BY "OBJECTIVE". The strategy vocabulary (crankmagic-strategies.js): the commander's own text and the
 * deck's mechanics name the strategies the deck is trying to run; for each, the cards in the hundred whose own text
 * offers the same strategy are counted, and the objective is "served" when at least SERVED_AT of them are there.
 * That is a count of cards that could serve the strategy, not a proof that they combine; the synergies model
 * (ROB-115) is the one that reads the joins.
 *
 * WHAT THE NUMBERS ARE NOT. A count against a range is a composition check, not a measurement of how the deck
 * plays: a deck can hit every range and lose every game. The simulator measures play; this says whether the parts
 * are there. Every count carries the card names behind it, so a reader can disagree with the classifier card by card.
 *
 * PURE and UMD, like deck-generator.js: Node tests hold it on the six staging decks (tests/deck-composition.mjs);
 * the browser gets the same file and the Tune tab (ROB-113) renders what it returns.
 */
(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CrankComposition = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const ROLES = ["ramp", "draw", "removal", "counterspell", "wipe", "protection", "recursion", "tutor", "threat", "finisher"];
  const ROLE_LABEL = {
    ramp: "Ramp", draw: "Card draw", removal: "Removal", counterspell: "Counterspells", wipe: "Board wipes",
    protection: "Protection", recursion: "Recursion", tutor: "Tutors", threat: "Threats", finisher: "Win conditions"
  };
  /* Rob's words for the groups, so the page can say "interaction 11" before it says "removal 8, counterspells 3". */
  const GROUPS = [
    {id: "mana", label: "Mana", roles: ["ramp"]},
    {id: "advantage", label: "Card advantage", roles: ["draw", "tutor"]},
    {id: "interaction", label: "Interaction", roles: ["removal", "counterspell", "wipe"]},
    {id: "defense", label: "Defense", roles: ["protection", "recursion"]},
    {id: "offense", label: "Offense", roles: ["threat", "finisher"]}
  ];
  const PLAYSTYLES = ["Balanced", "Aggressive", "Reactive", "Value engine", "Combo"];
  const COLORS = ["W", "U", "B", "R", "G"];
  const SERVED_AT = 3;
  /* A counterspell answers a spell or an ability on the stack. The classifier files "counter target spell" under
     protection (it shields the board); Rob asked for counters by name, so they are counted on their own here as well,
     and a card can be both. */
  const COUNTERSPELL = /counter target (?:spell|ability|activated ability|triggered ability|noncreature spell|creature spell|instant|sorcery|artifact|enchantment|planeswalker)/;
  /* A threat is a body that pressures life totals on its own: three power, or two with evasion, or a planeswalker,
     or anything the classifier already calls a finisher. A 1/1 that makes tokens is an engine, not a threat; the
     objectives count it. */
  const EVASION = /\b(?:flying|trample|menace|double strike|deathtouch|infect|toxic|can't be blocked|unblockable|shadow|horsemanship|fear|intimidate)\b/;
  const BASIC_TYPE_COLOR = {plains: "W", island: "U", swamp: "B", mountain: "R", forest: "G"};
  const ANY_COLOR = /add (?:one|two|three|x|\d+|an amount of|that much) mana (?:of any (?:one )?color|in any combination of colors)|add one mana of any color|any color in your commander's color identity|mana of any type/;
  const FETCHES_BASIC = /search your library for (?:a|an|up to \w+) basic land/;

  const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
  const lower = (s) => String(s || "").toLowerCase().replace(/[’]/g, "'");
  const stripReminder = (t) => String(t || "").replace(/\([^()]*\)/g, " ").replace(/[ \t]{2,}/g, " ");

  /* ONE RECORD SHAPE. The catalog (data/cards.json) says typeLine and oracleText; the engine oracle
     (data/engine/oracle.json) says type and text, mana and mv, ci; Scryfall says type_line and oracle_text. A
     double-faced card's faces are joined so a modal land or a transforming creature is read whole. Nothing else in
     this file touches a raw record. */
  function normalize(card) {
    if (!card) return null;
    const faces = Array.isArray(card.faces) ? card.faces : Array.isArray(card.card_faces) ? card.card_faces : null;
    const pick = (...keys) => { for (const k of keys) if (card[k] !== undefined && card[k] !== null && card[k] !== "") return card[k]; return undefined; };
    let text = pick("oracleText", "oracle_text", "text");
    if (text === undefined && faces) text = faces.map((f) => f.oracleText || f.oracle_text || f.text || "").join("\n");
    let typeLine = pick("typeLine", "type_line", "type");
    if (typeLine === undefined && faces) typeLine = faces.map((f) => f.typeLine || f.type_line || f.type || "").join(" // ");
    let manaCost = pick("manaCost", "mana_cost", "mana");
    if (manaCost === undefined && faces) manaCost = faces[0].manaCost || faces[0].mana_cost || faces[0].mana || "";
    const manaValue = pick("manaValue", "cmc", "mv");
    const power = pick("power") !== undefined ? pick("power") : (faces && faces[0].power);
    return {
      name: String(card.name || ""),
      typeLine: String(typeLine || ""),
      oracleText: String(text || ""),
      manaCost: String(manaCost || ""),
      manaValue: manaValue === undefined ? manaValueOf(String(manaCost || "")) : num(manaValue),
      colorIdentity: Array.isArray(pick("colorIdentity", "color_identity", "ci")) ? pick("colorIdentity", "color_identity", "ci") : [],
      power: power === undefined || power === null ? null : String(power),
      keywords: Array.isArray(card.keywords) ? card.keywords : [],
      roles: Array.isArray(card.roles) && card.roles.length ? card.roles : null,
      raw: card
    };
  }

  /* The mana value read off a cost when a record carries none (the same reading crankmagic-change.js makes). */
  function manaValueOf(cost) {
    let n = 0;
    for (const sym of String(cost || "").match(/\{[^}]+\}/g) || []) {
      const s = sym.slice(1, -1).toUpperCase();
      if (/^\d+$/.test(s)) n += Number(s);
      else if (/^\d+\/[WUBRG]$/.test(s)) n += Number(s.split("/")[0]);
      else if (/^[WUBRGCS]$|^[WUBRG]\/[WUBRGP]$|^[WUBRG]\/P$/.test(s)) n += 1;
    }
    return n;
  }

  /* COLORED PIPS of a cost: a hybrid symbol asks for either, so it counts once for each; a Phyrexian or a
     two-generic hybrid counts for its color. Generic and colorless add nothing. */
  function pipsOf(cost) {
    const out = {W: 0, U: 0, B: 0, R: 0, G: 0};
    for (const sym of String(cost || "").match(/\{[^}]+\}/g) || []) {
      const s = sym.slice(1, -1).toUpperCase();
      for (const part of s.split("/")) if (out[part] !== undefined) out[part] += 1;
    }
    return out;
  }

  /* THE COLORS A LAND PRODUCES: its basic land types (a Forest Plains is both), the symbols it adds, "any color" as
     every color the deck plays, and a land that fetches a basic as every color too. Colorless-only lands produce
     nothing colored and are counted as such. */
  function landColors(card, deckColors) {
    const all = deckColors && deckColors.length ? deckColors : COLORS;
    const type = lower(card.typeLine), text = lower(stripReminder(card.oracleText));
    const set = new Set();
    for (const [sub, color] of Object.entries(BASIC_TYPE_COLOR)) if (new RegExp("\\b" + sub + "\\b").test(type)) set.add(color);
    for (const m of text.matchAll(/add (\{[^.]*)/g)) for (const sym of m[1].match(/\{[wubrg](?:\/[wubrg])?\}/g) || []) for (const c of sym.slice(1, -1).toUpperCase().split("/")) set.add(c);
    if (ANY_COLOR.test(text) || FETCHES_BASIC.test(text)) for (const c of all) set.add(c);
    return [...set].filter((c) => COLORS.includes(c));
  }

  const isLand = (c) => /\bLand\b/.test(c.typeLine);
  const isBasic = (c) => /\bBasic\b/.test(c.typeLine);
  const isCreature = (c) => /\bCreature\b/.test(c.typeLine);
  const isPlaneswalker = (c) => /\bPlaneswalker\b/.test(c.typeLine);
  const powerOf = (c) => { const p = Number(String(c.power || "").replace(/[^\d.-]/g, "")); return Number.isFinite(p) ? p : 0; };

  /* ROLES: the classifier's, read once per card (a record that already carries baked roles keeps them, as the deck
     page does), plus the two readings above. `classify` is MtgCardClassify.classify or a stand-in; without one, only
     the two readings here and the baked roles are available, and the result says so. */
  function rolesOf(card, classify) {
    let base = card.roles;
    let classified = null;
    if (!base && classify) { classified = classify(card) || {}; base = classified.roles || []; }
    base = base || [];
    const text = lower(stripReminder(card.oracleText));
    const roles = new Set(base.filter((r) => ROLES.includes(r)));
    if (!isLand(card) && COUNTERSPELL.test(text)) roles.add("counterspell");
    if (!isLand(card) && (isPlaneswalker(card) || roles.has("finisher") || (isCreature(card) && (powerOf(card) >= 3 || (powerOf(card) >= 2 && (EVASION.test(text) || card.keywords.some((k) => EVASION.test(lower(k))))))))) roles.add("threat");
    return {roles: [...roles], classified};
  }

  /* TARGETS for one deck: base, then the bracket's overrides, then the playstyle's shifts; counterspells only ask
     for anything when the deck plays blue; a role's range never inverts (max is lifted to min). */
  function resolveTargets(data, {bracket = 3, playStyle = "Balanced", colors = []} = {}) {
    const out = {};
    const b = String(Math.min(5, Math.max(1, Math.round(num(bracket) || 3))));
    const style = PLAYSTYLES.includes(playStyle) ? playStyle : "Balanced";
    const over = (data.brackets && data.brackets[b] && data.brackets[b].roles) || {};
    const shift = (data.playStyles && data.playStyles[style] && data.playStyles[style].roles) || {};
    for (const role of ROLES) {
      const base = (data.base && data.base.roles && data.base.roles[role]) || {min: 0, max: 99};
      const o = over[role] || {};
      let min = o.min !== undefined ? o.min : base.min, max = o.max !== undefined ? o.max : base.max;
      const s = shift[role] || {};
      min = Math.max(0, min + num(s.min)); max = Math.max(min, max + num(s.max));
      if (role === "counterspell" && !colors.includes("U")) { min = 0; max = Math.max(0, Math.min(max, 2)); }
      out[role] = {min, max, bracket: Number(b), playStyle: style, source: (o.min !== undefined || o.max !== undefined) ? `bracket ${b}` : "base"};
    }
    return out;
  }

  /* THE CURVE: spells by mana value, 0 to 7+, and the average; lands never count. */
  function curveOf(spells) {
    const buckets = Array(8).fill(0);
    let sum = 0;
    for (const {card, quantity} of spells) { buckets[Math.min(7, Math.max(0, Math.round(card.manaValue)))] += quantity; sum += card.manaValue * quantity; }
    const n = spells.reduce((a, x) => a + x.quantity, 0);
    return {buckets, average: n ? Math.round(sum / n * 100) / 100 : 0, spells: n};
  }

  /* OBJECTIVES: the strategies the deck declares, each with the cards whose own text offers it. */
  function objectivesOf(entries, {strategies, commanders, commanderStrategies, mechanics, ticked}) {
    if (!strategies || typeof strategies.forDeck !== "function" || typeof strategies.derive !== "function") return {available: false, list: [], note: "the strategy vocabulary was not available"};
    const fromCommanders = [];
    for (const c of commanders) for (const id of strategies.derive(c.classified || {})) if (!fromCommanders.includes(id)) fromCommanders.push(id);
    for (const id of commanderStrategies || []) if (!fromCommanders.includes(id)) fromCommanders.push(id);
    const ids = strategies.forDeck({commanderStrategies: fromCommanders, mechanics: mechanics || [], ticked: ticked || null});
    const list = ids.map((id) => {
      const offering = entries.filter((e) => e.classified && strategies.derive(e.classified).includes(id));
      const count = offering.reduce((n, e) => n + e.quantity, 0);
      return {id, label: strategies.labelOf(id), count, served: count >= SERVED_AT, cards: offering.slice(0, 8).map((e) => e.card.name), source: fromCommanders.includes(id) ? (strategies.fromMechanics(mechanics || []).includes(id) ? "commander and mechanics" : "commander") : "mechanics"};
    });
    return {available: true, list, servedAt: SERVED_AT};
  }

  /* THE ONE FUNCTION. `cards`: records, or {card, quantity} pairs, the whole hundred including the commanders.
     `options`: commanders (records), bracket, playStyle, mechanics, ticked, commanderStrategies (the baked entry's
     ids), classify (MtgCardClassify.classify), strategies (CrankStrategies), landTarget (CrankChange.landTarget),
     targets (the parsed data file), colors (the commander's identity; read off the commanders when absent). */
  function compose(cards, options = {}) {
    const classify = options.classify || (typeof globalThis !== "undefined" && globalThis.MtgCardClassify && globalThis.MtgCardClassify.classify) || null;
    const strategies = options.strategies || (typeof globalThis !== "undefined" && globalThis.CrankStrategies) || null;
    const landTarget = options.landTarget || (typeof globalThis !== "undefined" && globalThis.CrankChange && globalThis.CrankChange.landTarget) || null;
    const targetsData = options.targets || (typeof globalThis !== "undefined" && globalThis.CrankCompositionTargets) || null;
    const entries = [];
    const unknown = [];
    for (const item of cards || []) {
      const raw = item && item.card !== undefined ? item.card : item;
      const quantity = Math.max(1, num(item && item.quantity) || 1);
      const card = normalize(raw);
      if (!card || (!card.typeLine && !card.oracleText)) { unknown.push(String((raw && raw.name) || (item && item.name) || "unknown card")); continue; }
      const {roles, classified} = rolesOf(card, classify);
      entries.push({card, quantity, roles, classified});
    }
    const commanders = (options.commanders || []).map(normalize).filter(Boolean).map((card) => ({card, classified: classify ? classify(card) : null}));
    const colors = options.colors && options.colors.length ? options.colors : [...new Set(commanders.flatMap((c) => c.card.colorIdentity))];
    const total = entries.reduce((n, e) => n + e.quantity, 0) + unknown.length;
    const lands = entries.filter((e) => isLand(e.card));
    const spells = entries.filter((e) => !isLand(e.card));

    /* Roles: a count and the names behind it, so the classifier can be argued with card by card. */
    const roles = {};
    for (const role of ROLES) {
      const hits = entries.filter((e) => e.roles.includes(role));
      roles[role] = {label: ROLE_LABEL[role], count: hits.reduce((n, e) => n + e.quantity, 0), cards: hits.map((e) => e.card.name).sort()};
    }
    const groups = GROUPS.map((g) => {
      const seen = new Set();
      let count = 0;
      for (const e of entries) if (g.roles.some((r) => e.roles.includes(r)) && !seen.has(e.card.name)) { seen.add(e.card.name); count += e.quantity; }
      return {id: g.id, label: g.label, roles: g.roles, count};
    });

    /* Lands: the count, basics, the colors they make, against the pips the spells ask for. */
    const pips = {W: 0, U: 0, B: 0, R: 0, G: 0};
    for (const e of spells) { const p = pipsOf(e.card.manaCost); for (const c of COLORS) pips[c] += p[c] * e.quantity; }
    const sources = {W: 0, U: 0, B: 0, R: 0, G: 0};
    for (const e of lands) for (const c of landColors(e.card, colors)) sources[c] += e.quantity;
    const pipTotal = COLORS.reduce((n, c) => n + pips[c], 0), sourceTotal = COLORS.reduce((n, c) => n + sources[c], 0);
    const colorBalance = COLORS.filter((c) => pips[c] > 0 || sources[c] > 0).map((c) => {
      const pipShare = pipTotal ? pips[c] / pipTotal : 0, sourceShare = sourceTotal ? sources[c] / sourceTotal : 0;
      return {color: c, pips: pips[c], sources: sources[c], pipShare: Math.round(pipShare * 100), sourceShare: Math.round(sourceShare * 100), short: pips[c] > 0 && sources[c] < Math.max(3, Math.round(pipShare * sourceTotal * 0.75))};
    });
    const landCount = lands.reduce((n, e) => n + e.quantity, 0);
    const flat = entries.flatMap((e) => Array(e.quantity).fill({...e.card, roles: e.roles}));
    const land = landTarget ? landTarget(flat, {classify: null}) : null;
    const landsOut = {count: landCount, basics: lands.filter((e) => isBasic(e.card)).reduce((n, e) => n + e.quantity, 0), target: land ? land.target : null, says: land ? land.says : "no land formula available", sources, pips, colorBalance};

    /* Targets and gaps. */
    const bracket = num(options.bracket) || 3, playStyle = options.playStyle || "Balanced";
    const targets = targetsData ? resolveTargets(targetsData, {bracket, playStyle, colors}) : null;
    const gaps = {};
    if (targets) for (const role of ROLES) {
      const t = targets[role], count = roles[role].count;
      const verdict = count < t.min ? "short" : count > t.max ? "over" : "in range";
      gaps[role] = {count, min: t.min, max: t.max, verdict, gap: count < t.min ? count - t.min : count > t.max ? count - t.max : 0, says: `${count} ${ROLE_LABEL[role].toLowerCase()}; bracket ${t.bracket} ${t.playStyle} asks ${t.min} to ${t.max}.`};
    }
    if (targets && land) {
      const tol = 1;
      const verdict = Math.abs(landCount - land.target) <= tol ? "in range" : landCount < land.target ? "short" : "over";
      gaps.lands = {count: landCount, min: land.target - tol, max: land.target + tol, verdict, gap: verdict === "in range" ? 0 : landCount - land.target, says: `${landCount} lands; the formula asks ${land.target} (${land.says}).`};
    }

    const objectives = objectivesOf(entries, {strategies, commanders, commanderStrategies: options.commanderStrategies, mechanics: options.mechanics, ticked: options.ticked});

    return {
      total, counted: total - unknown.length, unknown, colors, bracket, playStyle,
      lands: landsOut, curve: curveOf(spells), roles, groups, targets, gaps, objectives,
      classifierAvailable: Boolean(classify),
      note: "Counts against ranges are a composition check, not a measurement of play; the simulator measures play."
    };
  }

  return {ROLES, ROLE_LABEL, GROUPS, PLAYSTYLES, COLORS, SERVED_AT, normalize, manaValueOf, pipsOf, landColors, rolesOf, resolveTargets, curveOf, compose};
});
