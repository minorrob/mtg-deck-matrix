/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* THE INTERACTION CENSUS: a second check on what the extraction captured, and on what a player is then offered.
 *
 * Four bugs of 2026-10-29 (Linear ROB-317, 326, 330, 331) and three more behind them (ROB-323 Winter's "a permanent" prompt,
 * ROB-329 the Elk's picture, ROB-300 the held-back templates) share one shape: a card has more than one WAY -- a mode, a way
 * to pay, a second ability, a union of targets -- and one layer between the Oracle text and the table lost a way, while the
 * card's own scenario passed because it was driven by hand into the state where the way survives. The compiler's checks read
 * the compiler's own output, so they cannot see what it dropped. This reads the Oracle text a second time with its own,
 * deliberately separate rules (it imports nothing from the sentence library), and asks the engine the question a player asks.
 *
 * LAYER A, EXTRACTION (static, text against definition). From the Oracle text alone: the modes, the mode-like keywords
 * (flashback, kicker, spree, cycling...), each "cost: effect" line and the parts of its cost, and the unions of targets
 * ("target creature or planeswalker"). Each is looked for in the definition. A way the text has and the definition lacks is a
 * finding. This is the check on "the extraction to the engine input".
 *
 * LAYER B, FUNDING STATE (behavioral, metamorphic). For each card's spell and each activated ability that costs mana, build two
 * states that differ in one way only: the lands the cost needs are UNTAPPED with an empty pool, or the same lands are tapped by
 * hand into the pool. The rule: every cast or activation the second state offers, the first must offer -- a player does not
 * float mana to discover what they can do. Nothing here knows the right answer for a card, so it holds for every card, new
 * ones included, and it is what ROB-317/326/330/331 broke. It also checks WAY PARITY: a cost that can be paid two ways
 * (Phyrexian {U/P}, hybrid, {2/W}) offers a cast for each way it has the resources for, not for one.
 *
 *   node game/tools/interaction-census.mjs                     both layers, summary
 *   node game/tools/interaction-census.mjs --card "Hall of Echoes"   one card, every finding in full
 *   node game/tools/interaction-census.mjs --layer a|b        one layer
 *   node game/tools/interaction-census.mjs --write-baseline   rewrite docs/engine/interaction-census-baseline.json
 *   node game/tools/interaction-census.mjs --check            exit 1 on a finding the baseline does not list (or one it still lists that is fixed)
 *
 * The baseline is a ratchet, as the UK-spelling count is: it lists the findings known on the day it was written, each class
 * with the Linear issue that owns it, and it only shrinks. A new card, or a card that regresses, fails `--check`.
 */

import {readFileSync, writeFileSync, existsSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {parseManaCost} from "../engine/rules/mana.mjs";
import {legalActions} from "../engine/rules/actions.mjs";
import {runScenario} from "../engine/cards/scenario.mjs";
import {loadCardScripts, loadCardIndex} from "./engine-cards.mjs";
import {createCardIndex} from "../engine/cards/index.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const BASELINE_FILE = path.join(ROOT, "docs", "engine", "interaction-census-baseline.json");

/* ---------------------------------------------------------------------------------------------------------------------
 * LAYER A: the Oracle text, read on its own.
 * ------------------------------------------------------------------------------------------------------------------- */

/* Reminder text and quoted text go: a reminder repeats a rule, and a quoted ability ("Lands you control have '{T}: Add {C}.'") is granted to
   something else, so neither is one of this card's own ways. */
const noReminder = (text) => String(text ?? "").replace(/\([^()]*\)/g, "").replace(/"[^"\n]*"|“[^”\n]*”/g, '""').replace(/[ \t]+/g, " ").replace(/ +\n/g, "\n").trim();
const lines = (text) => noReminder(text).split("\n").map((l) => l.trim()).filter(Boolean);

/* Keywords whose whole point is that the player picks a way to cast or pay (or picks what to add to the cast). */
const WAY_KEYWORDS = ["flashback", "evoke", "overload", "dash", "madness", "escape", "foretell", "bestow", "prowl", "spectacle", "surge",
  "emerge", "morph", "megamorph", "disguise", "blitz", "unearth", "embalm", "eternalize", "disturb", "cleave", "suspend", "plot", "mutate",
  "prototype", "warp", "freerunning", "impending", "sneak", "harmonize", "jump-start", "retrace", "aftermath", "kicker", "multikicker",
  "buyback", "replicate", "entwine", "escalate", "spree", "awaken", "miracle", "splice", "ninjutsu", "commander ninjutsu", "channel",
  "transmute", "reconfigure", "craft", "offspring", "squad", "casualty", "bargain", "strive", "conspire", "tiered", "fuse", "level up"];
const KEYWORD_LINE = new RegExp(`^(${WAY_KEYWORDS.map((k) => k.replace(/[-\s]/g, "[-\\s]")).join("|")})\\b`, "i");
/* "Cycling {2}", "Basic landcycling {1}", "Wizardcycling {2}", "Plainscycling": one family, as many ways as there are lines. */
const CYCLING_LINE = /^(?:[a-z]+\s)?(?:[a-z]+)?cycling\b/i;

const TYPE_NOUNS = ["creature", "artifact", "enchantment", "land", "planeswalker", "battle"];
const NOUN = `(?:${[...TYPE_NOUNS, "permanent", "player", "opponent", "spell", "card", "token"].join("|")})s?\\b`;
const ADJ = "(?:(?!target\\b)[a-z-]+ ){0,2}";
/* "target creature or planeswalker", "target artifact, creature, or enchantment": the list after "target". */
const TARGET_UNION = new RegExp(`\\btarget ${ADJ}${NOUN}(?:(?:,|,? or|,? and/or) (?:an? |another )?${ADJ}${NOUN})+`, "gi");

const COST_VERB = /^(sacrifice|discard|pay|remove|exile|tap|untap|return|put|mill|reveal|exert|blight|behold|waterbend|collect|forage)\b/i;
const NOT_A_COST = /^(when|whenever|at|if|as long as|until|choose|you may|activate|each|target|this|that|then)\b/i;

/** The Oracle text's "cost: effect" lines: `{cost, parts}` each. A loyalty line has `loyalty`. */
function activatedLines(text) {
  const found = [];
  for (const raw of lines(text)) {
    const line = raw.replace(/^[A-Z][\w'’,\- ]{1,30} — /, "");
    const loyalty = /^[\[(]?([+−–-]?\d+|[+−–-]X|0)[\])]?:\s+\S/.exec(line);
    if (loyalty) { found.push({line, loyalty: loyalty[1], parts: []}); continue; }
    const at = line.indexOf(":");
    if (at < 1) continue;
    const left = line.slice(0, at);
    if (NOT_A_COST.test(left) || /[.•]/.test(left)) continue;
    if (!/\{/.test(left) && !COST_VERB.test(left)) continue;
    found.push({line, parts: left.split(/,\s*(?![^{]*\})/).map((p) => p.trim()).filter(Boolean)});
  }
  return found;
}

/** What a cost part is, by the word a player reads: the same classes a definition's cost atoms fall into (`atomClass`). */
function partClass(part) {
  if (/^(\{[^}]+\})+$/.test(part)) return /^\{T\}$/.test(part) ? "tap" : /^\{Q\}$/.test(part) ? "untap" : /^\{E\}+$/.test(part) ? "energy" : "mana";
  if (/^sacrifice\b/i.test(part)) return "sacrifice";
  if (/^discard\b/i.test(part)) return "discard";
  if (/^pay \d+ life/i.test(part)) return "life";
  if (/^exile\b/i.test(part)) return "exile";
  if (/^remove\b/i.test(part)) return "removeCounters";
  if (/^tap (an|two|three|x|\d+|another)\b.*untapped/i.test(part)) return "tapCreature";
  if (/^untap\b/i.test(part)) return "untap";
  if (/^return\b/i.test(part)) return "return";
  if (/^mill\b/i.test(part)) return "mill";
  if (/^put .*counter/i.test(part)) return "addCounters";
  return "other";
}
const ATOM_CLASS = (atom) => {
  const a = String(atom ?? "");
  if (a === "{T}") return "tap";
  if (a === "{Q}" || a === "untapCreature") return "untap";
  if (a === "mana") return "mana";
  if (a === "payLife") return "life";
  if (a === "payEnergy") return "energy";
  if (a === "tapCreature") return "tapCreature";
  if (a === "returnToHand") return "return";
  if (/^exile/.test(a)) return "exile";
  if (/^remove/.test(a)) return "removeCounters";
  return a;
};

/** The unions of card types the text writes after "target", each as a sorted list ("creature,planeswalker"). */
function targetUnions(text) {
  const unions = new Set();
  for (const hit of noReminder(text).match(TARGET_UNION) ?? []) {
    if (!/\b(or|and\/or)\b/i.test(hit)) continue;
    const nouns = TYPE_NOUNS.filter((n) => new RegExp(`\\b${n}s?\\b`, "i").test(hit));
    if (nouns.length >= 2) unions.add(nouns.sort().join(","));
  }
  return [...unions];
}

/** Everything the Oracle text says, as ways the player can take. */
export function oracleFacets(oracleText, manaCost = "") {
  const all = lines(oracleText);
  const modalHeaders = all.filter((l) => /\bchoose (one|two|three|four|five|x|up to \w+|one or both|one or more|any number)\b[^•]*[—–-]\s*$/i.test(l)).length;
  const bullets = all.filter((l) => l.startsWith("•")).length;
  const spree = all.filter((l) => /^\+\s*\{[^}]+\}.*[—–-]/.test(l)).length;
  const keywords = [], cycling = [];
  for (const l of all) {
    const k = KEYWORD_LINE.exec(l.replace(/^[A-Z][\w'’,\- ]{1,30} — /, ""));
    if (k && !/^(escape|channel)$/i.test(k[1]) || (k && /—|\{/.test(l))) keywords.push(k[1].toLowerCase().replace(/[-\s]+/g, " "));
    if (CYCLING_LINE.test(l) && /cycling\s*(\{|—|[A-Z0-9])/i.test(l)) cycling.push(l);
  }
  const symbols = {phyrexian: 0, hybrid: 0, monohybrid: 0, x: /\{X\}/.test(manaCost)};
  for (const s of manaCost.match(/\{[^}]+\}/g) ?? []) {
    if (/^\{[WUBRGC]\/P\}$/.test(s)) symbols.phyrexian += 1;
    else if (/^\{\d+\/[WUBRGC]\}$/.test(s)) symbols.monohybrid += 1;
    else if (/^\{[WUBRGC]\/[WUBRGC]\}$/.test(s)) symbols.hybrid += 1;
  }
  return {
    modes: bullets > 0 && /\bchoose (one|two|three|four|five|x|up to \w+|any number)\b/i.test(noReminder(oracleText)) ? {headers: modalHeaders, bullets} : null,
    spree, keywords: [...new Set(keywords)], cycling, symbols,
    activated: activatedLines(oracleText),
    additionalCost: /\bas an additional cost to cast (this spell|it)\b/i.test(noReminder(oracleText)),
    targetUnions: targetUnions(oracleText),
  };
}

/* A cost is a list of atoms; the odd definition writes one atom, or a bare string. */
const atomsOf = (ability) => (Array.isArray(ability?.cost) ? ability.cost : ability?.cost ? [ability.cost] : []).map((a) => (typeof a !== "string" ? a : /^(\{[^}]+\})+$/.test(a) ? {atom: "mana", cost: a} : {atom: a}));

const walk = (value, visit) => {
  if (Array.isArray(value)) return value.forEach((v) => walk(v, visit));
  if (value && typeof value === "object") { visit(value); Object.values(value).forEach((v) => walk(v, visit)); }
};

/** What the definition kept of those ways. */
export function definitionFacets(def) {
  const out = {modes: 0, keywordNames: new Set(), activated: [], loyalty: 0, additionalCost: false, unions: new Set(), targetSpecs: 0};
  const faces = [def, ...["back", "adventure", "prepare"].map((k) => def[k]).filter((x) => x && typeof x === "object")];
  for (const face of faces) for (const ability of face.abilities ?? []) {
    walk(ability, (node) => {
      if (node.effect === "modal") out.modes += (node.modes ?? []).length;
      if (Array.isArray(node.anyOf)) {
        const types = new Set();
        for (const branch of node.anyOf) for (const t of branch.types ?? []) types.add(t.toLowerCase());
        if (types.size >= 2) out.unions.add([...types].sort().join(","));
      }
    });
    const text = noReminder(ability.text).toLowerCase();
    if (ability.keyword) out.keywordNames.add(String(ability.keyword).toLowerCase());
    if (ability.cycling) out.keywordNames.add("cycling");
    out.keywordNames.add(text.split(/[\s—:{]/)[0]);
    out.keywordNames.add(text.split(/[—:{]/)[0].trim());
    if (ability.additionalCost) out.additionalCost = true;
    if (ability.kind === "activated" && !atomsOf(ability).some((c) => c.atom === "loyalty") && /:/.test(ability.text ?? "")) out.activated.push(ability);
    if (atomsOf(ability).some((c) => c.atom === "loyalty")) out.loyalty += 1;
    for (const t of ability.targets ?? []) out.targetSpecs += 1;
  }
  for (const k of ["back", "adventure", "prepare", "layout"]) if (def[k]) out.keywordNames.add(k);
  return out;
}

const isMultiFaced = (def) => ["back", "adventure", "prepare", "layout"].some((k) => def[k]);

/** Layer A: the findings for one definition. Each is `{code, detail}`. */
export function extractionFindings(def, tally = {}) {
  const found = [];
  const oracle = oracleFacets(def.oracleText, def.identity?.manaCost ?? "");
  const kept = definitionFacets(def);
  /* What was looked at, so a parser that finds nothing cannot pass for a directory that is clean. */
  const seen = (key, n = 1) => { tally[key] = (tally[key] ?? 0) + n; };
  if (oracle.modes) seen("modalCards");
  seen("wayKeywordLines", oracle.keywords.length); seen("cyclingLines", oracle.cycling.length); seen("spreeModes", oracle.spree);
  seen("activatedLines", oracle.activated.filter((a) => a.loyalty === undefined).length); seen("loyaltyLines", oracle.activated.filter((a) => a.loyalty !== undefined).length);
  seen("costParts", oracle.activated.reduce((n, a) => n + a.parts.length, 0)); seen("targetUnions", oracle.targetUnions.length);
  seen("phyrexianSymbols", oracle.symbols.phyrexian); seen("hybridSymbols", oracle.symbols.hybrid + oracle.symbols.monohybrid);
  const add = (code, detail) => found.push({code, detail});

  if (oracle.modes && oracle.modes.bullets > 0) {
    if (kept.modes === 0) add("MODES_DROPPED", `the text offers ${oracle.modes.bullets} modes; the definition has no modal effect`);
    /* A trigger that reads "attacks or blocks" is two abilities of the same modes in the definition: a multiple of the text's count is whole. */
    else if ((kept.modes < oracle.modes.bullets || kept.modes % oracle.modes.bullets !== 0) && !oracle.spree) add("MODES_COUNT", `the text has ${oracle.modes.bullets} modes; the definition keeps ${kept.modes}`);
  }
  if (oracle.spree > 0 && kept.modes < oracle.spree && !kept.keywordNames.has("spree")) add("SPREE_DROPPED", `${oracle.spree} spree modes in the text; the definition has none`);

  for (const k of oracle.keywords) {
    const named = [...kept.keywordNames].some((n) => n === k || n.startsWith(k));
    if (!named) add("WAY_KEYWORD_DROPPED", `"${k}" is in the text; no ability of the definition names it`);
  }
  if (oracle.cycling.length && !kept.keywordNames.has("cycling") && ![...kept.keywordNames].some((n) => /cycling/.test(n))) add("CYCLING_DROPPED", oracle.cycling.join(" / "));
  if (oracle.additionalCost && !kept.additionalCost) {
    /* Optional additional costs (kicker and its kin) are keywords; a mandatory one is `additionalCost`. Only the second is checked here. */
    if (!/\byou may\b[^.]*\bas an additional cost\b/i.test(noReminder(def.oracleText)) && !(def.abilities ?? []).some((a) => a.additionalCost || a.kicked !== undefined))
      add("ADDITIONAL_COST_DROPPED", "the text has an additional cost to cast; the definition carries none");
  }

  if (!isMultiFaced(def)) {
    const textual = oracle.activated.filter((a) => a.loyalty === undefined);
    const loyal = oracle.activated.filter((a) => a.loyalty !== undefined);
    if (textual.length > kept.activated.length) add("ACTIVATED_DROPPED", `the text has ${textual.length} "cost: effect" abilities; the definition has ${kept.activated.length}`);
    if (loyal.length > kept.loyalty) add("LOYALTY_DROPPED", `the text has ${loyal.length} loyalty abilities; the definition has ${kept.loyalty}`);
    for (const line of textual) {
      const left = line.line.slice(0, line.line.indexOf(":") + 1).toLowerCase().replace(/\s+/g, " ");
      const twin = kept.activated.find((a) => noReminder(a.text).toLowerCase().replace(/\s+/g, " ").includes(left.slice(0, Math.min(left.length, 40))));
      if (!twin) continue;
      const want = line.parts.map(partClass).filter((c) => c !== "other");
      const have = new Set(atomsOf(twin).map((c) => ATOM_CLASS(c.atom)));
      const missing = [...new Set(want)].filter((c) => !have.has(c));
      if (missing.length) add("COST_COMPONENT_DROPPED", `"${line.line.slice(0, line.line.indexOf(":"))}" has ${missing.join(", ")} in the text; the definition's cost has ${[...have].join(", ") || "nothing"}`);
    }
  }

  for (const union of oracle.targetUnions) if (!kept.unions.has(union) && !targetCoveredBySeparateSpecs(def, union))
    add("TARGET_UNION_NARROWED", `the text targets "${union.replace(",", " or ")}"; the definition has no anyOf that covers both (types: [..] means AND)`);
  return found;
}

/* "Choose one -- target creature or planeswalker" written as two modes is fine; so is a union written as separate specs of one ability's modes. */
function targetCoveredBySeparateSpecs(def, union) {
  const need = new Set(union.split(","));
  const have = new Set();
  walk(def.abilities ?? [], (node) => {
    if (node.what === "permanent" && Array.isArray(node.types) && node.types.length === 1) have.add(node.types[0].toLowerCase());
  });
  return [...need].every((t) => have.has(t)) && (def.abilities ?? []).some((a) => JSON.stringify(a).includes('"modal"'));
}

/* ---------------------------------------------------------------------------------------------------------------------
 * LAYER B: the same state with the mana untapped, and with it floated by hand.
 * ------------------------------------------------------------------------------------------------------------------- */

const BASIC = {W: "Plains", U: "Island", B: "Swamp", R: "Mountain", G: "Forest", C: "Wastes"};
const FIXTURES = {
  "Census Bear": {types: ["Creature"], subtypes: ["Bear"], manaCost: "{1}{G}", colors: ["G"], power: 2, toughness: 2},
  "Census Relic": {types: ["Artifact"], manaCost: "{1}", colors: []},
};
const MAX_WAYS = 6, MAX_LANDS = 14;

/**
 * The ways a mana cost can be paid, each as the lands that pay it and nothing more, and what kind of way it is.
 * {X} is paid at 0. A Phyrexian symbol has a mana way (its basic land) and a life way (no land); {W/U} one way per color; {2/W} two Wastes or a Plains.
 */
export function paymentWays(manaCost) {
  const cost = parseManaCost(manaCost ?? "");
  let ways = [{lands: Array(cost.generic).fill("Wastes"), via: []}];
  for (const symbol of cost.symbols) {
    let options = null;
    if (symbol.kind === "colored") options = [{lands: [BASIC[symbol.color]], via: []}];
    else if (symbol.kind === "phyrexian") options = [{lands: [BASIC[symbol.color]], via: ["mana"]}, {lands: [], via: ["life"]}];
    else if (symbol.kind === "hybrid") options = symbol.either.map((c) => ({lands: [BASIC[c]], via: [c]}));
    else if (symbol.kind === "monohybrid") options = [{lands: [BASIC[symbol.color]], via: [symbol.color]}, {lands: Array(symbol.amount).fill("Wastes"), via: ["generic"]}];
    else if (symbol.kind === "snow") options = [{lands: ["Wastes"], via: []}];
    if (!options) continue;
    ways = ways.flatMap((w) => options.map((o) => ({lands: [...w.lands, ...o.lands], via: [...w.via, ...o.via]}))).slice(0, 64);
  }
  const seen = new Set();
  return ways.filter((w) => w.lands.length <= MAX_LANDS && !seen.has(w.lands.join() + w.via.join()) && seen.add(w.lands.join() + w.via.join())).slice(0, MAX_WAYS);
}

/** What a player can do with a card, and from where: one `subject` per spell and per activated ability that costs mana. */
function subjectsOf(def) {
  const out = [];
  const types = def.identity?.types ?? [];
  const cost = def.identity?.manaCost ?? "";
  if (!types.includes("Land") && cost) out.push({kind: "cast", zone: "hand", cost, label: def.identity.name});
  (def.abilities ?? []).forEach((ability, i) => {
    if (ability.kind !== "activated" || ability.mana === true || atomsOf(ability).some((c) => c.atom === "loyalty")) return;
    const mana = atomsOf(ability).find((c) => c.atom === "mana");
    if (!mana?.cost) return;
    out.push({kind: "activate", zone: ability.zone ?? "battlefield", cost: mana.cost, label: def.identity.name, abilityId: ability.id ?? `a${i}`, text: ability.text});
  });
  return out;
}

const signature = (a) => `${a.kind}|${a.label}|${a.abilityId ?? ""}`;
const offeredBy = (state, subject) => legalActions(state, 0).some((a) => a.kind === subject.kind && a.label === subject.label && (subject.kind === "cast" || a.abilityId === subject.abilityId));

/** Whether the engine offers `subject` in the state with `way`'s lands untapped (floated: false) or tapped into the pool by hand (true). */
export const engineProbe = (def, subject, way, floated, index) => offeredBy(stateFor(def, subject, way, floated, index), subject);

function stateFor(def, subject, way, floated, index) {
  const lands = way.lands;
  const board = [{seat: 0, zone: "battlefield", cards: [...lands, "Census Bear", "Census Relic"]}, {seat: 1, zone: "battlefield", cards: ["Census Bear", "Census Relic"]}];
  const name = def.identity.name;
  const placed = {seat: 0, zone: subject.zone, cards: [name]};
  const steps = floated ? lands.map((land) => ({tap: land})) : [];
  return runScenario({name: `census ${name}`, setup: [...board, placed], steps, expect: []}, index.definition, FIXTURES).state;
}

/** Layer B: the findings for one definition. Each is `{code, detail}`; `unexercised` counts the subjects no state offered at all. */
export function fundingFindings(def, index, probe = engineProbe) {
  const found = [], tally = {subjects: 0, exercised: 0};
  for (const subject of subjectsOf(def)) {
    let ways;
    try { ways = paymentWays(subject.cost); } catch { continue; }
    if (!ways.length) continue;
    tally.subjects += 1;
    const verdicts = [];
    for (const way of ways) {
      try {
        const floatedOffer = probe(def, subject, way, true, index);
        const untappedOffer = floatedOffer ? probe(def, subject, way, false, index) : null;
        verdicts.push({way, floatedOffer, untappedOffer});
      } catch (error) { verdicts.push({way, error: error.message}); }
    }
    const usable = verdicts.filter((v) => !v.error);
    if (usable.some((v) => v.floatedOffer)) tally.exercised += 1;
    const what = subject.kind === "cast" ? "cast" : `ability ${subject.abilityId} (${(subject.text ?? "").slice(0, 40)})`;
    for (const v of usable) if (v.floatedOffer && v.untappedOffer === false)
      found.push({code: subject.kind === "cast" ? "CAST_ONLY_WHEN_FLOATED" : "ACTIVATION_ONLY_WHEN_FLOATED",
        detail: `${what}: offered once ${v.way.lands.join(", ") || "no lands"} are tapped into the pool by hand, not while they are untapped${v.way.via.length ? ` (way: ${v.way.via.join("+")})` : ""}`});
    if (ways.length > 1 && usable.some((v) => v.floatedOffer) && usable.some((v) => !v.floatedOffer))
      found.push({code: "PAYMENT_WAY_MISSING", detail: `${what}: offered for ${usable.filter((v) => v.floatedOffer).map((v) => v.way.via.join("+") || "base").join(" | ")} but not for ${usable.filter((v) => !v.floatedOffer).map((v) => v.way.via.join("+") || "base").join(" | ")}`});
  }
  return {found, tally};
}

/* ---------------------------------------------------------------------------------------------------------------------
 * The whole directory, the baseline, and the command line.
 * ------------------------------------------------------------------------------------------------------------------- */

/** Every finding of the directory: `{card, code, detail}`, plus Layer B's tally. */
export function census({layers = "ab", only = null, scripts = loadCardScripts(), index = loadCardIndex(), probe = engineProbe} = {}) {
  const findings = [], tally = {cards: 0, multiFaced: 0, subjects: 0, exercised: 0, examined: {}};
  for (const {script: def} of scripts) {
    const name = def.identity?.name;
    if (only && name !== only) continue;
    tally.cards += 1;
    if (isMultiFaced(def)) tally.multiFaced += 1;
    if (layers.includes("a")) for (const f of extractionFindings(def, tally.examined)) findings.push({card: name, layer: "A", ...f});
    if (layers.includes("b")) {
      const b = fundingFindings(def, index, probe);
      tally.subjects += b.tally.subjects; tally.exercised += b.tally.exercised;
      for (const f of b.found) findings.push({card: name, layer: "B", ...f});
    }
  }
  return {findings, tally};
}

/** The committed candidates (data/engine/candidates.json: what the playtest tables load) as scripts, with the hand-authored directory beside them. */
export async function committedCandidates() {
  const {scriptOf} = await import("./card-compiler.mjs");
  const file = JSON.parse(readFileSync(path.join(ROOT, "data", "engine", "candidates.json"), "utf8"));
  const oracle = JSON.parse(readFileSync(path.join(ROOT, "data", "engine", "oracle.json"), "utf8"));
  const records = new Map(oracle.cards.map((c) => [c.id, c]));
  const scripts = file.cards.map((c) => scriptOf(c, records.get(c.oracleId)));
  const hand = loadCardScripts().map((e) => ({...e, source: "hand"}));
  const index = createCardIndex([...hand, ...scripts.map((script) => ({script, source: "compiled", status: "provisional"}))]);
  return {scripts: scripts.map((script) => ({script})), index};
}

/**
 * The compiler's candidates through the same two layers: the admission gate. A candidate is the extraction's output for a
 * card the directory does not define yet, so this is the check on "the extraction to the engine input" at the moment it
 * matters. A candidate with any finding is held, whatever its smoke game did. Slow (the compiler's calibration, about 45 s).
 */
export async function candidateCensus() {
  const {compileAll, scriptOf} = await import("./card-compiler.mjs");
  const {results, oracle} = compileAll();
  const records = new Map(oracle.cards.map((c) => [c.id, c]));
  const candidates = results.filter((r) => r.status === "candidate");
  const scripts = candidates.map((c) => scriptOf(c, records.get(c.oracleId)));
  const hand = loadCardScripts().map((e) => ({...e, source: "hand"}));
  const index = createCardIndex([...hand, ...scripts.map((script) => ({script, source: "compiled", status: "provisional"}))]);
  const out = census({layers: "ab", scripts: scripts.map((script) => ({script})), index});
  return {...out, candidates: candidates.length, statuses: results.reduce((m, r) => (m[r.status] = (m[r.status] ?? 0) + 1, m), {})};
}

/** The directory and the committed candidates, as one list of findings (a candidate's carries `scope: "candidate"`). */
export async function wholeCensus() {
  const directory = census();
  const {scripts, index} = await committedCandidates();
  const candidates = census({scripts, index});
  return {findings: [...directory.findings, ...candidates.findings.map((f) => ({...f, scope: "candidate"}))], directory: directory.tally, candidates: candidates.tally};
}

/** A finding's key in the baseline: the card, the class, and the ability or way it names (the first 60 characters of its detail). */
export const keyOf = (f) => `${f.scope === "candidate" ? "candidate:" : ""}${f.card}|${f.code}|${f.detail.slice(0, 60)}`;

/** The baseline as a Set of keys, by class. */
export function readBaseline(file = BASELINE_FILE) {
  if (!existsSync(file)) return {classes: {}, keys: new Set()};
  const raw = JSON.parse(readFileSync(file, "utf8"));
  return {classes: raw.classes ?? {}, keys: new Set(Object.values(raw.classes ?? {}).flatMap((c) => c.keys ?? []))};
}

/** The findings against the baseline: `added` (new, fail), `fixed` (listed, no longer found: ratchet down). */
export function againstBaseline(findings, baseline = readBaseline()) {
  const now = new Set(findings.map(keyOf));
  return {added: findings.filter((f) => !baseline.keys.has(keyOf(f))), fixed: [...baseline.keys].filter((k) => !now.has(k))};
}

export const CLASS_OWNERS = {
  CAST_ONLY_WHEN_FLOATED: "ROB-326 (Phyrexian/hybrid casts) and ROB-317",
  ACTIVATION_ONLY_WHEN_FLOATED: "ROB-330, ROB-331, ROB-317 (abilityOffers prices against the pool only; castOffers has an autoTap branch)",
  PAYMENT_WAY_MISSING: "ROB-326",
  TARGET_UNION_NARROWED: "ROB-323 (Winter) and ROB-300",
  MODES_DROPPED: "ROB-300", MODES_COUNT: "ROB-300", SPREE_DROPPED: "ROB-300", WAY_KEYWORD_DROPPED: "ROB-300", CYCLING_DROPPED: "ROB-317",
  ADDITIONAL_COST_DROPPED: "ROB-300", ACTIVATED_DROPPED: "ROB-330, ROB-331", LOYALTY_DROPPED: "ROB-300", COST_COMPONENT_DROPPED: "ROB-330",
};

function summarize(findings) {
  const by = new Map();
  for (const f of findings) { if (!by.has(f.code)) by.set(f.code, new Set()); by.get(f.code).add(f.card); }
  return [...by].sort((a, b) => b[1].size - a[1].size).map(([code, cards]) => ({code, cards: cards.size, owner: CLASS_OWNERS[code] ?? "unowned"}));
}

async function main(argv) {
  const arg = (name) => { const i = argv.indexOf(name); return i < 0 ? null : argv[i + 1] ?? true; };
  const layer = arg("--layer") || "ab";
  const only = arg("--card");
  const started = Date.now();
  if (argv.includes("--candidates")) {
    const {findings, tally, candidates, statuses} = await candidateCensus();
    console.log(`Compiler candidates: ${candidates} of ${JSON.stringify(statuses)} (${((Date.now() - started) / 1000).toFixed(1)}s). Layer B exercised ${tally.exercised} of ${tally.subjects}.`);
    for (const row of summarize(findings)) console.log(`  ${String(row.cards).padStart(5)} candidates  ${row.code.padEnd(30)} ${row.owner}`);
    for (const f of findings.slice(0, 40)) console.log(`HOLD ${f.card}: ${f.code}: ${f.detail}`);
    return findings.length ? 1 : 0;
  }
  const whole = !only && layer === "ab" && (argv.includes("--check") || argv.includes("--write-baseline"));
  const {findings, tally} = whole ? await wholeCensus().then((w) => ({findings: w.findings, tally: w.directory})) : census({layers: layer, only: typeof only === "string" ? only : null});
  if (typeof only === "string") {
    for (const f of findings) console.log(`${f.layer} ${f.code}: ${f.detail}`);
    console.log(findings.length ? `${findings.length} finding(s) for ${only}.` : `No findings for ${only}${tally.cards ? "" : " (no such definition)"}.`);
    return 0;
  }
  console.log(`Interaction census: ${tally.cards} definitions (${tally.multiFaced} multi-faced, skipped by the activated-cost check), layer ${layer}, ${((Date.now() - started) / 1000).toFixed(1)}s.`);
  if (layer.includes("b")) console.log(`Layer B exercised ${tally.exercised} of ${tally.subjects} spells and costed abilities (the rest were offered in no state: a target, a sacrifice or a summoning-sick tap the probe does not supply).`);
  for (const row of summarize(findings)) console.log(`  ${String(row.cards).padStart(5)} cards  ${row.code.padEnd(30)} ${row.owner}`);
  if (argv.includes("--write-baseline")) {
    const classes = {};
    for (const f of findings) (classes[f.code] ??= {owner: CLASS_OWNERS[f.code] ?? "unowned", keys: []}).keys.push(keyOf(f));
    for (const c of Object.values(classes)) c.keys = [...new Set(c.keys)].sort();
    writeFileSync(BASELINE_FILE, JSON.stringify({schema: "interaction-census-baseline@1", note: "A ratchet: findings known when it was written. It only shrinks. See game/tools/interaction-census.mjs.", classes}, null, 1) + "\n");
    console.log(`Baseline written: ${findings.length} findings in ${Object.keys(classes).length} classes.`);
  }
  if (argv.includes("--check")) {
    const {added, fixed} = againstBaseline(findings);
    for (const f of added.slice(0, 30)) console.log(`NEW  ${f.card}: ${f.code}: ${f.detail}`);
    for (const k of fixed.slice(0, 30)) console.log(`FIXED (remove from the baseline with --write-baseline): ${k}`);
    console.log(`${added.length} new, ${fixed.length} fixed since the baseline.`);
    return added.length || fixed.length ? 1 : 0;
  }
  return 0;
}

/* Not a top-level await: card-compiler.mjs imports this module (its census gate) and this one imports it back for the candidates, so
   the module must finish evaluating before main loads it. */
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2)).then((code) => process.exit(code));
