/* "How to play it", written from the list and its measurement -- with no model in the loop.
 *
 * WHY THIS EXISTS. Six decks had a hand-written guide; every other deck has none, and the
 * plan to write the rest with a language model was set aside: no key, no spend, nothing a
 * stranger's page calls. What is left is the thing a template CAN do honestly. It cannot
 * say what a hundred cards are "trying" to do -- but it can say what they ARE: which of them
 * set up the commander, which of them the commander pays off, how many lands, where the
 * curve sits, what the simulator measured, and where the list is thin. Every sentence here
 * is one of those facts in words. Every card it names is in the list, and the guide-agent
 * checker is run over the result to prove it.
 *
 * WHAT IT WILL NOT DO. Rank the deck, call it good, or invent a plan the cards do not carry.
 * Where the list has no finisher the guide says it has no finisher. Where there is no
 * measurement the measured lines are simply absent rather than estimated.
 *
 * PURE. No DOM, no fetch. Inputs are catalog records (with the classifier's tags) and, if
 * there is one, a measured report from crankmagic-sim.js. tests/guide-measured.mjs runs it.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CrankGuideMeasured = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var GENERIC = {creatures: 1, lands: 1, artifacts: 1, enchantments: 1, instants: 1, sorceries: 1, planeswalkers: 1};
  var TYPES = [["lands", /\bLand\b/], ["creatures", /\bCreature\b/], ["planeswalkers", /\bPlaneswalker\b/], ["battles", /\bBattle\b/],
    ["instants", /\bInstant\b/], ["sorceries", /\bSorcery\b/], ["artifacts", /\bArtifact\b/], ["enchantments", /\bEnchantment\b/]];
  var ROLE_WORDS = {ramp: "ramp", draw: "card draw", removal: "removal", wipe: "board wipes", protection: "protection",
    recursion: "recursion", "sac-outlet": "sacrifice outlets", finisher: "finishers", tutor: "tutors", counters: "counters", graveyard: "graveyard"};
  var TAG_WORDS = {"creature-etb": "creatures entering", "creature-dies": "creatures dying", "land-drop": "land drops", attack: "attacks",
    "combat-begin": "the start of combat", "end-step": "the end step", upkeep: "the upkeep", "cast-spell": "spells being cast",
    proliferate: "proliferate", "counter-placed": "+1/+1 counters", "life-gain": "life gain", "life-loss": "opponents losing life",
    "draw-card": "card draw", sacrifice: "sacrifice", "graveyard-entry": "cards entering a graveyard"};

  function clean(v) { return String(v == null ? "" : v).trim(); }
  /* Mana value from the record, or from the printed cost when the record has none:
     {2}{U}{B} is 4, {X}{R} is 1, hybrid and Phyrexian symbols count one each. */
  function mvOf(c) {
    var v = c.manaValue != null ? c.manaValue : c.mv != null ? c.mv : c.cmc;
    if (v != null && Number.isFinite(Number(v))) return Number(v);
    var total = 0;
    (String(c.manaCost || "").match(/\{[^}]+\}/g) || []).forEach(function (sym) {
      var inner = sym.slice(1, -1);
      if (/^\d+$/.test(inner)) total += Number(inner);
      else if (/^X|Y|Z$/.test(inner)) total += 0;
      else if (/^\d+\/[WUBRGC]$/.test(inner)) total += Number(inner.split("/")[0]);
      else total += 1;
    });
    return total;
  }
  function short(name) { return clean(name).split(",")[0].split(" // ")[0]; }
  function qty(row) { return Number(row.quantity || 1); }
  function card(row) { return row.card || row; }
  function names(rows, n) { return rows.slice(0, n).map(function (r) { return card(r).name; }); }
  function list(items) {
    if (!items.length) return "";
    if (items.length === 1) return items[0];
    return items.slice(0, -1).join(", ") + " and " + items[items.length - 1];
  }
  function plural(n, one, many) { return n + " " + (n === 1 ? one : (many || one + "s")); }
  function round(v, d) { var f = Math.pow(10, d || 0); return Math.round(Number(v) * f) / f; }
  function has(c, key, value) { return ((c && c[key]) || []).indexOf(value) >= 0; }
  function word(tag) { return TAG_WORDS[tag] || String(tag).replace(/-/g, " "); }
  function lower(s) { s = clean(s); return s ? s.charAt(0).toLowerCase() + s.slice(1) : s; }
  function firstSentence(text) {
    var line = clean(text).split("\n").filter(function (l) { return l && !/^\(/.test(l); })[0] || "";
    return line.replace(/\s*\(.*?\)\s*/g, " ").replace(/\s+/g, " ").trim().replace(/\.$/, "");
  }

  /* -------------------------------------------------------------- the shape */

  function shape(rows) {
    var out = {}, curve = {}, mvSum = 0, mvN = 0, roles = {};
    TYPES.forEach(function (t) { out[t[0]] = 0; });
    for (var i = 0; i <= 7; i += 1) curve[i === 7 ? "7+" : String(i)] = 0;
    rows.forEach(function (row) {
      var c = card(row), n = qty(row), type = clean(c.typeLine || c.type);
      TYPES.forEach(function (t) { if (t[1].test(type)) out[t[0]] += n; });
      if (!/\bLand\b/.test(type)) {
        var mv = Math.max(0, Math.round(mvOf(c)));
        curve[mv >= 7 ? "7+" : String(mv)] += n; mvSum += mv * n; mvN += n;
      }
      (c.roles || []).forEach(function (r) { if (!GENERIC[r]) roles[r] = (roles[r] || 0) + n; });
    });
    out.avgMv = mvN ? round(mvSum / mvN, 2) : 0;
    out.curve = curve; out.roles = roles;
    out.total = rows.reduce(function (s, r) { return s + qty(r); }, 0);
    return out;
  }

  /* ------------------------------------------------ what the commander is for */

  /* The creature type the commander's text is about, if its text names one the list
     carries in numbers: "Ninja" for Splinter, "Goblin" for Krenko. */
  function tribeOf(commander, rows) {
    var text = clean(commander.oracleText);
    var counts = {};
    rows.forEach(function (row) { (card(row).tribes || []).forEach(function (t) { counts[t] = (counts[t] || 0) + qty(row); }); });
    var best = null;
    Object.keys(counts).forEach(function (t) {
      if (t.length < 3) return;
      var re = new RegExp("\\b" + t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "s?\\b", "i");
      if (re.test(text) && counts[t] >= 5 && (!best || counts[t] > counts[best])) best = t;
    });
    return best ? {type: best, count: counts[best]} : null;
  }

  function relate(commander, rows) {
    var tribe = tribeOf(commander, rows);
    var triggerText = /\b(whenever|when |at the beginning)/i.test(clean(commander.oracleText));
    var cTrig = triggerText ? (commander.triggers || []) : [], cCause = commander.causes || [], cMech = commander.mechanics || [];
    var enablers = [], payoffs = [], kin = [], shared = [];
    rows.forEach(function (row) {
      var c = card(row); if (c.name === commander.name) return;
      var causes = c.causes || [], triggers = c.triggers || [], mechs = c.mechanics || [];
      var e = cTrig.filter(function (t) { return causes.indexOf(t) >= 0; });
      var p = cCause.filter(function (t) { return triggers.indexOf(t) >= 0; });
      var m = cMech.filter(function (t) { return mechs.indexOf(t) >= 0; });
      if (e.length) enablers.push({card: c, via: e});
      if (p.length) payoffs.push({card: c, via: p});
      if (m.length) shared.push({card: c, via: m});
      if (tribe && has(c, "tribes", tribe.type)) kin.push({card: c});
    });
    var byRank = function (a, b) { return (a.card.rank || 1e9) - (b.card.rank || 1e9); };
    enablers.sort(byRank); payoffs.sort(byRank); shared.sort(byRank); kin.sort(byRank);
    /* What the kin have in common beyond the type: the two mechanics most of them carry. */
    var kinMech = {};
    kin.forEach(function (k) { (k.card.mechanics || []).forEach(function (m) { kinMech[m] = (kinMech[m] || 0) + 1; }); });
    var kinMechanics = Object.keys(kinMech).filter(function (m) { return kinMech[m] >= 3; }).sort(function (a, b) { return kinMech[b] - kinMech[a]; }).slice(0, 2).map(function (m) { return {mechanic: m, count: kinMech[m]}; });
    return {tribe: tribe, enablers: enablers, payoffs: payoffs, shared: shared, kin: kin, kinMechanics: kinMechanics};
  }

  /* ---------------------------------------------------------------- the guide */

  function build(input) {
    var commander = input.commander, rows = input.cards || [], report = input.report || null, styles = input.styles || [];
    var sh = shape(rows), rel = relate(commander, rows);
    var nonCmd = rows.filter(function (r) { return card(r).name !== commander.name; });
    var byRole = function (role) { return nonCmd.filter(function (r) { return has(card(r), "roles", role); }); };
    var ramp = byRole("ramp"), draw = byRole("draw"), removal = byRole("removal"), wipes = byRole("wipe"),
      protection = byRole("protection"), tutors = byRole("tutor");
    /* A finisher is a card the classifier files as one AND that costs enough to be one; a
       two-drop tagged "finisher" is a tagging accident, not a plan. */
    var finishers = byRole("finisher").filter(function (r) { return mvOf(card(r)) >= 4; });
    var cheap = nonCmd.filter(function (r) { var c = card(r); return !/\bLand\b/.test(clean(c.typeLine || c.type)) && Number(c.manaValue) <= 2; });
    var cmdMv = Math.round(mvOf(commander));
    var cmdLine = firstSentence(commander.oracleText);
    var cname = commander.name, tribe = rel.tribe;

    // ARCHETYPE, from the tribe when there is one and the play styles the commander earns.
    var archetype = (tribe ? tribe.type + " tribal" : (styles[0] || "Commander")) + (styles.length ? " · " + styles.filter(function (s) { return !tribe || s !== "Tribal"; }).slice(0, 2).join(" · ") : "");

    // HOOK: the commander's own first line, and what in the list answers it.
    var answer = tribe ? plural(tribe.count, tribe.type, tribe.type + "s")
      : rel.enablers.length ? plural(rel.enablers.length, "card") + " that set up " + list(rel.enablers.slice(0, 1).map(function (x) { return word(x.via[0]); }))
      : rel.shared.length ? plural(rel.shared.length, "card") + " that share " + word(rel.shared[0].via[0])
      : plural(sh.creatures, "creature");
    var hook = cname + ": " + lower(cmdLine) + ". This list gives it " + answer + " to work with.";

    // WHAT IT DOES: the counts, then the cards that feed the commander and the ones it feeds.
    var what = [];
    what.push(plural(sh.lands, "land") + ", " + plural(sh.creatures, "creature") + ", " + plural(sh.instants + sh.sorceries, "spell") + " and " + plural(sh.artifacts + sh.enchantments, "other permanent") + "; average mana value " + sh.avgMv + ".");
    if (tribe) what.push("The " + plural(tribe.count, tribe.type, tribe.type + "s") + " are the plan" + (rel.kin.length ? ": " + list(names(rel.kin, 8)) + (rel.kin.length > 8 ? " and " + (rel.kin.length - 8) + " more" : "") : "") + "." + (rel.kinMechanics.length ? " " + list(rel.kinMechanics.map(function (k) { return k.count + " of them carry " + k.mechanic; })) + "." : ""));
    if (rel.enablers.length) what.push(list(names(rel.enablers, 6)) + (rel.enablers.length > 6 ? " and " + (rel.enablers.length - 6) + " more" : "") + " set up " + list(rel.enablers[0].via.map(word)) + ", which is what " + cname + " waits for.");
    if (rel.payoffs.length) what.push(list(names(rel.payoffs, 6)) + " pay off " + list(rel.payoffs[0].via.map(word)) + ", which " + cname + " causes.");
    if (rel.shared.length && !tribe) what.push(list(names(rel.shared, 6)) + " share " + list(rel.shared[0].via.map(word)) + " with the commander.");
    what.push(plural(ramp.length, "ramp piece") + ", " + plural(draw.length, "card-draw spell") + ", " + plural(removal.length, "removal spell") + (wipes.length ? ", " + plural(wipes.length, "board wipe") : "") + (protection.length ? " and " + plural(protection.length, "protection spell") : "") + ".");

    // HOW IT WINS: only what the list can show.
    var wins;
    if (finishers.length) wins = list(names(finishers, 4)) + (finishers.length === 1 ? " is the finisher" : " are the finishers") + "; the rest of the list exists to reach " + (finishers.length === 1 ? "it" : "them") + " with a board.";
    else {
      var biggest = nonCmd.filter(function (r) { return /\bCreature\b/.test(clean(card(r).typeLine || card(r).type)); }).sort(function (a, b) { return (Number(card(b).power) || 0) - (Number(card(a).power) || 0) || mvOf(card(b)) - mvOf(card(a)); });
      wins = "Nothing here is filed as a finisher. It wins by attacking" + (tribe ? " with " + tribe.type + "s" : "") + ", " + plural(sh.creatures, "creature") + " deep" + (biggest.length ? ", the biggest of them " + list(names(biggest, 3)) : "") + ", and by whatever " + cname + " adds to each swing.";
    }

    // TURNS, from the curve.
    var rocks = ramp.filter(function (r) { return Number(card(r).manaValue) <= 2; });
    var early = tribe ? rel.kin.filter(function (r) { return Number(card(r).manaValue) <= 2; }) : cheap;
    var turns = [
      {when: "Turns 1-3", do: "Land every turn" + (rocks.length ? " and get a rock down: " + list(names(rocks, 4)) : "") + "." + (early.length ? " Then the cheap " + (tribe ? tribe.type + "s" : "plays") + ": " + list(names(early, 4)) + "." : "")},
      {when: "Turns 4-6", do: "Cast " + cname + (cmdMv ? " on " + cmdMv : "") + (protection.length ? " with " + list(names(protection, 2)) + " in reserve" : "") + "." + (rel.enablers.length || rel.payoffs.length ? " Start the engine: " + list(names(rel.enablers.concat(rel.payoffs), 4)) + "." : "") + (draw.length ? " Refill with " + list(names(draw, 3)) + "." : "")},
      {when: "Turn 7 and after", do: (finishers.length ? "Close with " + list(names(finishers, 3)) + "." : "Keep attacking; there is no single card that ends the game, so the board has to.") + (wipes.length ? " " + list(names(wipes, 2)) + (wipes.length === 1 ? " is" : " are") + " your reset if the table gets ahead." : "") + (removal.length ? " Hold " + list(names(removal, 2)) + " for the one thing that would stop you." : "")}
    ];

    var mulligan = "Keep three or four lands" + (rocks.length ? " or two lands and a rock" : "") + " (" + plural(sh.lands, "land") + ", average mana value " + sh.avgMv + ")" + (early.length ? " with one early " + (tribe ? tribe.type : "play") : "") + (draw.length ? ", and prefer a hand that draws" : "") + ".";

    // KEY CARDS: the commander's kin and helpers first, then the roles the deck leans on.
    var scored = nonCmd.map(function (r) {
      var c = card(r), s = 0, why = [];
      var e = rel.enablers.find(function (x) { return x.card === c; }), p = rel.payoffs.find(function (x) { return x.card === c; }), m = rel.shared.find(function (x) { return x.card === c; });
      if (e) { s += 30; why.push("sets up " + list(e.via.map(word)) + " for the commander"); }
      if (p) { s += 30; why.push("pays off " + list(p.via.map(word)) + ", which the commander causes"); }
      if (m) { s += 15; why.push("shares " + list(m.via.map(word)) + " with the commander"); }
      if (tribe && has(c, "tribes", tribe.type)) {
        s += 12;
        var km = rel.kinMechanics.filter(function (k) { return has(c, "mechanics", k.mechanic); }).map(function (k) { return k.mechanic; });
        why.push("a " + tribe.type + (km.length ? " with " + list(km) : "") + ", which is what the commander is built around");
        if (km.length) s += 6;
      }
      ["finisher", "wipe", "draw", "ramp", "removal", "protection", "tutor"].forEach(function (role) {
        if (!has(c, "roles", role)) return;
        if (role === "finisher" && mvOf(c) < 4) return;
        s += role === "finisher" ? 25 : role === "wipe" ? 12 : 8; why.push(ROLE_WORDS[role]);
      });
      if (c.rank) s += Math.max(0, 12 - Math.log10(c.rank) * 3);
      return {card: c, score: s, why: why};
    }).filter(function (x) { return x.why.length; }).sort(function (a, b) { return b.score - a.score || a.card.name.localeCompare(b.card.name); });
    var keyCards = scored.slice(0, 6).map(function (x) {
      var w = x.why.slice(0, 2).join("; ");
      return {name: x.card.name, why: w.charAt(0).toUpperCase() + w.slice(1) + "."};
    });

    // WATCH FOR: the measurement, then where the list is thin.
    var watch = [];
    if (report && report.metrics) {
      var m = report.metrics, v = function (k) { return m[k] && m[k].value != null ? m[k].value : null; };
      var parts = [];
      if (v("score") != null) parts.push(v("score") + " points on the " + (report.protocol || "published") + " protocol");
      if (v("winRate") != null) parts.push(v("winRate") + "% wins at a four-seat table");
      if (v("averageWinTurn") != null) parts.push("winning games ended on turn " + round(v("averageWinTurn"), 1) + " on average");
      if (v("averageCommanderTurn") != null) parts.push("the commander arrived on turn " + round(v("averageCommanderTurn"), 1));
      if (v("incompleteGames") != null && v("incompleteGames") > 0) parts.push(v("incompleteGames") + "% of games hit the turn cap");
      if (parts.length) watch.push("Measured: " + parts.join("; ") + ". The three opponents are sampled archetype profiles, so this compares lists under one model rather than predicting an evening.");
    }
    if (sh.lands < 34) watch.push("Only " + plural(sh.lands, "land") + ". Expect missed drops; ramp has to cover it.");
    if (sh.lands > 38) watch.push(plural(sh.lands, "land") + " is more than most hundreds run; late hands will flood.");
    if (sh.avgMv >= 3.4) watch.push("Average mana value " + sh.avgMv + " is high. Hands without a rock start slowly.");
    if (removal.length <= 4) watch.push("Removal is thin: " + (removal.length ? list(names(removal, 4)) : "nothing the classifier files as removal") + ". A single problem permanent can go unanswered.");
    if (draw.length <= 4) watch.push("Card draw is thin (" + plural(draw.length, "card") + "); the deck runs on what the commander provides.");
    if (!wipes.length) watch.push("No board wipe. If the table goes wide first, there is no reset.");
    if (!watch.length) watch.push("The counts are in the usual bands; the thin spots, if any, are in the matchups rather than the list.");

    var difficulty = {tier: "Intermediate", why: "You are tracking what the commander wants each turn and which card in hand answers it."};
    if (styles.indexOf("Combo") >= 0 || (rel.enablers.length + rel.payoffs.length) >= 20) difficulty = {tier: "Advanced", why: "Many pieces interact with the commander; sequencing them is the game."};
    else if ((rel.enablers.length + rel.payoffs.length + rel.kin.length) <= 6 && !finishers.length) difficulty = {tier: "Beginner", why: "The list mostly plays cards on curve and attacks; there is little to sequence."};

    return {
      origin: "measured",
      commander: cname,
      nickname: tribe ? tribe.type + " tribal" : archetype,
      archetype: archetype,
      hook: hook,
      colorIdentity: commander.colorIdentity || [],
      difficulty: difficulty,
      whatItDoes: what.join(" "),
      howItWins: wins,
      turns: turns,
      mulligan: mulligan,
      keyCards: keyCards,
      watchFor: watch,
      shape: sh,
      upgradePath: "No upgrade path is recorded for this list. Recommendations on the deck page lists role-compatible options; nothing there is a measured improvement until it is measured.",
      measured: report ? {protocol: report.protocol, score: report.metrics && report.metrics.score ? report.metrics.score.value : null} : null
    };
  }

  return {build: build, shape: shape, relate: relate, tribeOf: tribeOf};
});
