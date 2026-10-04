/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* THE CATALOG: EVERY DISTINCT THING A COMMANDER CARD CAN DO, AND WHERE THE ENGINE STANDS ON EACH.
 *
 * Rob, 2026-10-01: "My preference in the rules and play engine work is that we start with a definitive and distinct list
 * of actions, triggers, effects, actions, options, etc. that can be taken by MtG cards adhering to commander rules."
 *
 * Two sources make the list definitive, and they are joined here:
 *
 *   THE RULES. The Comprehensive Rules name every keyword action (701) and keyword ability (702). Their headings --
 *   numbers and names only, the game's own vocabulary -- are kept in `game/docs/cr-index.json`, refreshed from the
 *   rules text with --rules (the text itself is Wizards' and stays out of the repository, as check-citations says).
 *
 *   THE CARDS. `game/docs/engine-inventory.json` measured every card Forge implements -- 33,821, nearly every card ever
 *   printed -- in Forge's vocabulary: each distinct effect, trigger, static ability, replacement effect, keyword and cost
 *   any card uses, with how many cards use it, overall and among the most-played 80% of Commander cards.
 *
 * Each entry says where the engine stands -- built, partly built, named but not built, or missing -- what the engine
 * calls it, how many of the most-played cards need it, and how many of those it alone holds back (every other thing
 * the card needs is built). That last number is the build order. engine-constructs.mjs holds the Forge-to-engine
 * translation coverage uses, so the two never disagree.
 *
 *   node game/tools/engine-catalog.mjs            print the summary
 *   node game/tools/engine-catalog.mjs --write    write docs/engine/catalog.md and game/docs/engine-catalog.json
 *   node game/tools/engine-catalog.mjs --check    both committed files are what this would write now
 *   node game/tools/engine-catalog.mjs --rules    refresh game/docs/cr-index.json from the rules text first (local only)
 */

import {readFileSync, writeFileSync, existsSync, readdirSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {isPrimitive, isKeyword, isTriggerEvent, normalizeKeyword} from "../engine/vocabulary.mjs";
import {isBuilt} from "../engine/script/effects/index.mjs";
import {TRIGGER_KINDS} from "../engine/cards/index.mjs";
import {loadCardIndex} from "./engine-cards.mjs";
import {FORGE_API, FORGE_TRIGGER, FORGE_STATIC, FORGE_REPLACEMENT, FORGE_OPTIONS, FORGE_COUNTS, BROAD_TRIGGERS, keywordBuilt, missingFor} from "./engine-constructs.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const CR_INDEX = path.join(REPO, "game", "docs", "cr-index.json");
const OUT_MD = path.join(REPO, "docs", "engine", "catalog.md");
const OUT_JSON = path.join(REPO, "game", "docs", "engine-catalog.json");
const args = process.argv.slice(2);

/* ---- the rules' headings ---- */

/* "701.3. Attach", "702.6. Equip": a numbered rule whose whole line is a name. */
export function headingsFrom(text) {
  const out = {keywordActions: [], keywordAbilities: []};
  for (const line of String(text).split(/\r?\n/)) {
    const m = /^(70[12])\.(\d+)\. (.{1,48})$/.exec(line.trim());
    if (!m || /\.$/.test(m[3]) || Number(m[2]) < 2) continue;
    (m[1] === "701" ? out.keywordActions : out.keywordAbilities).push({rule: `${m[1]}.${m[2]}`, name: m[3]});
  }
  return out;
}
/* Run only when invoked, so a test can import headingsFrom without writing anything. */
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();

function main() {
  if (args.includes("--rules")) {
    const root = process.env.CRANKMAGIC_RULES_ROOT ?? path.resolve(REPO, "..", "rules");
    const file = existsSync(root) ? readdirSync(root).filter((f) => /^MagicCompRules.*\.txt$/i.test(f)).sort().pop() : null;
    if (!file) { console.error(`No Comprehensive Rules found in ${root}; set CRANKMAGIC_RULES_ROOT.`); process.exit(2); }
    const headings = headingsFrom(readFileSync(path.join(root, file), "utf8"));
    writeFileSync(CR_INDEX, JSON.stringify({schema: "CrankCrIndex@1", source: file, ...headings}, null, 1) + "\n");
    console.log(`cr-index: ${headings.keywordActions.length} keyword actions, ${headings.keywordAbilities.length} keyword abilities from ${file}`);
  }
  const cr = JSON.parse(readFileSync(CR_INDEX, "utf8"));

  /* ---- what the cards use ---- */

  const inventory = JSON.parse(readFileSync(path.join(REPO, "game", "docs", "engine-inventory.json"), "utf8"));
  const countsOf = (scope, kind) => new Map((inventory[scope]?.counts?.[kind] ?? []).map(([name, n]) => [name, n]));
  const TOP = Object.fromEntries(["apis", "triggers", "statics", "replacements", "keywords", "costs", "params", "amounts"].map((k) => [k, countsOf("top", k)]));
  const ALL = Object.fromEntries(["apis", "triggers", "statics", "replacements", "keywords", "costs", "params", "amounts"].map((k) => [k, countsOf("forge", k)]));

  /* What the most-played cards need that the engine has not got, and which of them one thing alone holds back. */
  const directory = loadCardIndex();
  const topCards = Object.entries(inventory.top?.perCard ?? {});
  const blocks = new Map(), alone = new Map();
  let everyRule = 0;
  for (const [name, card] of topCards) {
    /* A defined card has every rule it needs and holds nothing back (engine-coverage.mjs says why). */
    const missing = directory.resolve(name)?.playable === true ? [] : missingFor(card);
    if (!missing.length) { everyRule += 1; continue; }
    const keys = [...new Set(missing.map((m) => `${m.kind}:${m.name}`))];
    for (const k of keys) blocks.set(k, (blocks.get(k) ?? 0) + 1);
    if (keys.length === 1) alone.set(keys[0], (alone.get(keys[0]) ?? 0) + 1);
    void name;
  }
  const defined = topCards.filter(([name]) => directory.resolve(name)?.playable === true).length;

  /* ---- the entries ---- */

  const STATUS = ["built", "partial", "named", "missing"];
  const entry = (fields) => ({...fields, top: fields.top ?? 0, all: fields.all ?? 0, blocks: fields.blocks ?? 0, alone: fields.alone ?? 0});
  const byKey = (key) => ({blocks: blocks.get(key) ?? 0, alone: alone.get(key) ?? 0});

  /* Keyword abilities (CR 702): a keyword the rules modules act on behaves; one the vocabulary names but nothing acts on
     is named; an ability keyword is built once the primitive its ability uses is (Equip, attach); a partner ability is a
     deck rule the table holds (engine-constructs.mjs, keywordBuilt). */
  const behaves = keywordBuilt;
  const keywordStatus = (word) => (behaves(word) ? "built" : isKeyword(normalizeKeyword(word).toLowerCase()) ? "named" : "missing");
  const forgeKeyword = (name) => [...ALL.keywords.keys(), ...TOP.keywords.keys()].find((k) => k.toLowerCase() === name.toLowerCase()) ?? null;
  const keywordAbilities = cr.keywordAbilities.map(({rule, name}) => {
    const forge = forgeKeyword(name);
    return entry({kind: "keyword ability", rule, name, engine: behaves(name) ? name : null, status: keywordStatus(name), forge,
      top: forge ? TOP.keywords.get(forge) ?? 0 : 0, all: forge ? ALL.keywords.get(forge) ?? 0 : 0, ...(forge ? byKey(`keyword:${forge}`) : {})});
  });
  /* Forge's keyword constructs that are not keyword abilities of the rules: "ETBReplacement", "etbCounter", "Chapter". */
  const ruleWords = new Set(cr.keywordAbilities.map((k) => k.name.toLowerCase()));
  const keywordConstructs = [...new Set([...TOP.keywords.keys()])].filter((k) => !ruleWords.has(k.toLowerCase())).map((forge) =>
    entry({kind: "keyword construct", rule: null, name: forge, engine: behaves(forge) ? forge : null, status: keywordStatus(forge), forge,
      top: TOP.keywords.get(forge) ?? 0, all: ALL.keywords.get(forge) ?? 0, ...byKey(`keyword:${forge}`)}));

  /* Keyword actions (CR 701), each to the engine's primitive for it and Forge's effect of the same name. "core" is a
     thing the rules modules do themselves -- casting, activating -- rather than an effect a card names. */
  const ACTIONS = {
    Activate: {core: true}, Attach: {engine: "attach"}, Cast: {core: true}, Counter: {engine: "counterSpell", forge: ["Counter"]},
    Create: {engine: "createToken", forge: ["Token"]}, Destroy: {engine: "destroy", forge: ["Destroy", "DestroyAll"]}, Discard: {engine: "discard"},
    Double: {engine: "multiplyCounters", forge: ["MultiplyCounter"]}, Exchange: {engine: "exchangeLife", forge: ["ExchangeLifeVariant", "ExchangeControl"]},
    Exile: {engine: "moveZone", partial: true}, Fight: {engine: "fight"}, Investigate: {engine: "createToken", note: "a Clue (CR 111.10f)"},
    Mill: {engine: "mill"}, Play: {engine: "play"}, Reveal: {engine: "chooseCard", partial: true, forge: ["Reveal", "PeekAndReveal"]},
    Sacrifice: {engine: "sacrifice", partial: true, note: "as a cost, built; as an effect, not yet", forge: ["Sacrifice", "SacrificeAll"]},
    Scry: {engine: "scry"}, Search: {engine: "chooseCard", forge: ["ChangeZone"]}, Shuffle: {engine: "shuffle"}, Surveil: {engine: "surveil"},
    "Tap and Untap": {engine: "tap", forge: ["Tap", "Untap", "TapAll", "UntapAll"]}, Transform: {engine: "setState", forge: ["SetState"]},
    Proliferate: {engine: "proliferate"}, Amass: {engine: "amass"}, Connive: {engine: "connive"}, Discover: {engine: "discover"},
  };
  const forgeApiFor = (name, spec) => spec?.forge ?? [...ALL.apis.keys()].filter((api) => api.toLowerCase() === name.replace(/[^A-Za-z]/g, "").toLowerCase());
  const keywordActions = cr.keywordActions.map(({rule, name}) => {
    const spec = ACTIONS[name], forge = forgeApiFor(name, spec);
    const status = spec?.core ? "built" : !spec?.engine ? "missing" : isBuilt(spec.engine) ? (spec.partial ? "partial" : "built") : isPrimitive(spec.engine) ? "named" : "missing";
    const sum = (m) => forge.reduce((n, api) => n + (m.get(api) ?? 0), 0);
    const engineKey = spec?.engine ? `api:${spec.engine}` : null;
    return entry({kind: "keyword action", rule, name, engine: spec?.core ? "(the rules modules)" : spec?.engine ?? null, status, forge: forge.join(", ") || null,
      top: sum(TOP.apis), all: sum(ALL.apis), ...(engineKey ? byKey(engineKey) : {}), ...(spec?.note ? {note: spec.note} : {})});
  });

  /* Effects: every Forge effect API any card uses. */
  /* Built, some forms: a delayed trigger fires "at the beginning of the next end step" (batch 13), not yet at the other
     moments a card can name. */
  const PARTIAL_EFFECTS = new Set(["delayedTrigger"]);
  const effectStatus = (primitive) => (!primitive ? "missing" : isBuilt(primitive) ? (PARTIAL_EFFECTS.has(primitive) ? "partial" : "built") : isPrimitive(primitive) ? "named" : "missing");
  const effects = [...ALL.apis.keys()].map((api) => {
    const primitive = FORGE_API[api] ?? null;
    return entry({kind: "effect", rule: null, name: api, engine: primitive, status: effectStatus(primitive), forge: api, top: TOP.apis.get(api) ?? 0, all: ALL.apis.get(api) ?? 0,
      ...byKey(primitive && !isBuilt(primitive) ? `api:${primitive}` : `api:${api}`)});
  });

  /* Triggers: the events a card watches. The compiler builds "enters", "dies", "upkeep" and "end step"; Forge's
     ChangesZone covers every zone change and Phase every step, so those two are partly built. */
  /* Forge's broad zone-change and phase triggers stand for several events; DamageDone also covers damage to creatures and
   planeswalkers, and the compiler builds damage to players only. */
const PARTIAL_TRIGGERS = new Set([...BROAD_TRIGGERS, "DamageDone"]);
  const triggers = [...ALL.triggers.keys()].map((mode) => {
    const event = FORGE_TRIGGER[mode] ?? null;
    const status = !event ? "missing" : PARTIAL_TRIGGERS.has(mode) ? "partial" : TRIGGER_KINDS.includes(event) ? "built" : isTriggerEvent(event) ? "named" : "missing";
    return entry({kind: "trigger", rule: null, name: mode, engine: event, status, forge: mode, top: TOP.triggers.get(mode) ?? 0, all: ALL.triggers.get(mode) ?? 0,
      ...byKey(event ? `trigger:${event}` : `trigger:${mode}`)});
  });

  /* Static abilities and replacement effects. */
  const statics = [...ALL.statics.keys()].map((mode) => entry({kind: "static", rule: null, name: mode, engine: FORGE_STATIC[mode] ?? null,
    /* Continuous is every layer effect, some built; ReduceCost is "spells cost {N} less" (built) and "this spell costs
     {X} less" (not yet). */
  status: FORGE_STATIC[mode] ? (["Continuous", "ReduceCost"].includes(mode) ? "partial" : "built") : "missing", forge: mode, top: TOP.statics.get(mode) ?? 0, all: ALL.statics.get(mode) ?? 0, ...byKey(`static:${mode}`)}));
  const replacements = [...ALL.replacements.keys()].map((mode) => entry({kind: "replacement", rule: null, name: mode, engine: FORGE_REPLACEMENT[mode] ?? null,
    status: FORGE_REPLACEMENT[mode] ? "partial" : "missing", forge: mode, top: TOP.replacements.get(mode) ?? 0, all: ALL.replacements.get(mode) ?? 0, ...byKey(`replacement:${mode}`)}));

  /* Costs (CR 118, 602.1): the kinds a card can ask, from Forge's cost atoms. The engine pays tapping, mana, life and a
     sacrifice -- of the source, or of a permanent chosen as the cost is paid -- and a discard as a spell's additional cost. */
  const COSTS = {
    T: ["{T}", "built"], MANA: ["mana", "built"], GENERIC: ["mana", "built"], PayLife: ["payLife", "built"], Sac: ["sacrifice", "built"],
    Discard: ["discard", "partial"], Q: ["{Q}", "named"], SubCounter: ["removeCounters", "named"], AddCounter: ["addCounters", "named"],
    RemoveAnyCounter: ["removeAnyCounter", "named"], ExileFromGrave: ["exileFromGraveyard", "named"], tapXType: ["tapUntapped", "named"],
    Reveal: ["reveal", "named"], Return: ["returnToHand", "named"], Draw: ["draw", "named"], Mill: ["mill", "named"],
    ExileFromHand: [null, "missing"], ExileAnyGrave: [null, "missing"], Exile: [null, "missing"], PayEnergy: [null, "missing"], Exert: [null, "missing"],
    CollectEvidence: [null, "missing"], Waterbend: [null, "missing"], Blight: [null, "missing"], DamageYou: [null, "missing"], ExiledMoveToGrave: [null, "missing"],
  };
  const costs = Object.entries(COSTS).filter(([forge]) => ALL.costs.has(forge) || TOP.costs.has(forge)).map(([forge, [engine, status]]) =>
    entry({kind: "cost", rule: null, name: forge, engine, status, forge, top: TOP.costs.get(forge) ?? 0, all: ALL.costs.get(forge) ?? 0}));

  /* Choices: what a card asks its player (CR 603.5, 700.2, 115, 107.3), and how the engine asks it -- each a question
     the room puts to that seat, shown on the board as a pop-up of its options. */
  const CHOICES = [
    {name: "You may (optional effect)", rule: "603.5", engine: "modal (Yes / No)", status: "built"},
    {name: "Choose one / choose two (modes)", rule: "700.2", engine: "modal", status: "built"},
    {name: "Targets", rule: "115", engine: "targets, chosen as cast or triggered", status: "built"},
    {name: "Order of simultaneous triggers", rule: "603.3b", engine: "order-triggers", status: "built"},
    {name: "Search a library", rule: "701.23", engine: "chooseCard", status: "built"},
    {name: "Scry, the cards to the bottom", rule: "701.22", engine: "scry", status: "built"},
    {name: "Additional cost: which card or permanent", rule: "601.2b", engine: "one offer per choice", status: "built"},
    {name: "Divide combat damage among blockers", rule: "510.1c", engine: "assign-combat-damage", status: "built"},
    {name: "Attackers and blockers", rule: "508.1, 509.1", engine: "declare-attackers, declare-blockers", status: "built"},
    {name: "A value for X", rule: "107.3", engine: "one offer per value the pool can pay", status: "built"},
    {name: "Divide damage or counters as a spell resolves", rule: "601.2d", engine: null, status: "missing"},
    {name: "Choose a color, a card type or a creature type", rule: "700.2", engine: "chooseType", status: isBuilt("chooseType") ? "built" : "named"},
    {name: "Choose a player or opponent", rule: "115.1", engine: null, status: "missing"},
    {name: "Vote", rule: "701.38", engine: null, status: "missing"},
    {name: "Two piles", rule: "700.2", engine: "twoPiles", status: isBuilt("twoPiles") ? "built" : "named"},
  ].map((c) => entry({kind: "choice", forge: null, ...c}));

  /* Options and conditions: an ability's parameters that change what it does (engine-constructs.mjs FORGE_OPTIONS). */
  const options = Object.entries(FORGE_OPTIONS).map(([param, o]) => entry({kind: "option", rule: null, name: o.name, engine: o.engine ?? null, status: o.status, forge: param,
    top: TOP.params.get(param) ?? 0, all: ALL.params.get(param) ?? 0, ...byKey(`option:${param}`)}));

  /* Amounts the game counts, kind by kind (engine-constructs.mjs FORGE_COUNTS): every kind Forge counts by, and any it
     counts by that the table does not list, as missing. */
  const countKinds = [...new Set([...Object.keys(FORGE_COUNTS), ...ALL.amounts.keys(), ...TOP.amounts.keys()])];
  const amounts = countKinds.map((kind) => { const c = FORGE_COUNTS[kind] ?? {name: kind, status: "missing"};
    return entry({kind: "count", rule: kind.startsWith("Devotion") ? "700.5" : kind === "xPaid" ? "107.3" : null, name: c.name, engine: c.engine ?? null, status: c.status, forge: kind,
      top: TOP.amounts.get(kind) ?? 0, all: ALL.amounts.get(kind) ?? 0, ...byKey(`count:${kind}`)}); });

  const sections = [
    ["Keyword abilities (CR 702)", keywordAbilities], ["Keyword actions (CR 701)", keywordActions], ["Effects", effects], ["Triggers", triggers],
    ["Static abilities", statics], ["Replacement effects", replacements], ["Costs", costs], ["Options and conditions", options], ["Amounts the game counts", amounts], ["Choices", choices()], ["Other keyword constructs", keywordConstructs],
  ];
  function choices() { return CHOICES; }

  /* ---- the catalog, written ---- */

  const tally = (rows) => Object.fromEntries(STATUS.map((s) => [s, rows.filter((r) => r.status === s).length]));
  const order = (rows) => [...rows].sort((a, b) => b.top - a.top || b.all - a.all || String(a.name).localeCompare(String(b.name)));
  const all = sections.flatMap(([, rows]) => rows);
  /* A keyword action and the effect that does it are one thing to build (Sacrifice, Surveil): listed once, as the effect. */
  const seen = new Set();
  const next = [...all].filter((r) => r.status !== "built" && r.alone > 0).sort((a, b) => b.alone - a.alone || b.blocks - a.blocks || (a.kind === "effect" ? -1 : 1))
    .filter((r) => { const key = r.engine ?? `${r.kind}:${r.name}`; if (seen.has(key)) return false; seen.add(key); return true; }).slice(0, 15);
  const catalog = {
    schema: "CrankEngineCatalog@1",
    sources: {rules: cr.source, cards: {all: inventory.summary?.forgeAll?.cards ?? null, top: topCards.length}},
    top: {cards: topCards.length, defined, everyRule},
    sections: Object.fromEntries(sections.map(([title, rows]) => [title, {tally: tally(rows), entries: order(rows)}])),
  };

  const n = (v) => (typeof v === "number" ? v.toLocaleString("en-US") : "?");
  const cell = (v) => (v === null || v === undefined || v === "" ? "—" : String(v).replace(/\|/g, "/"));
  const lines = [
    "# The engine catalog",
    "",
    "Generated by `node game/tools/engine-catalog.mjs --write`; `--check` holds it to its sources.",
    "",
    "Every distinct thing a Commander card can do, and where the engine stands on each (Rob, 2026-10-01: \"a definitive and",
    "distinct list of actions, triggers, effects, actions, options, etc. that can be taken by MtG cards adhering to commander",
    "rules\"). The keyword actions and abilities are the Comprehensive Rules' own list (701, 702); the effects, triggers,",
    `static abilities, replacement effects and costs are every one used by the ${n(catalog.sources.cards.all)} cards Forge implements.`,
    "",
    `**The most-played 80% of Commander cards:** ${n(topCards.length)} cards; ${n(defined)} defined and playable today; ${n(everyRule)} with every`,
    "mechanic built, so only their definitions are left to write.",
    "",
    "**Status:** *built* the engine does it; *partial* some forms; *named* in the engine's vocabulary, not built; *missing* not",
    "yet named. **Top** is how many of the most-played cards use it, **All** how many of every card. **Holds back** is how",
    "many most-played cards need it among other missing things; **Alone** how many it alone holds back -- the build order.",
    "",
    "## Summary",
    "",
    "| Section | Entries | Built | Partial | Named | Missing |",
    "| --- | ---: | ---: | ---: | ---: | ---: |",
    ...sections.map(([title, rows]) => { const t = tally(rows); return `| ${title} | ${rows.length} | ${t.built} | ${t.partial} | ${t.named} | ${t.missing} |`; }),
    "",
    "## What to build next",
    "",
    "The things that alone hold back the most of the most-played cards.",
    "",
    "| Kind | Name | Engine | Status | Alone | Holds back |",
    "| --- | --- | --- | --- | ---: | ---: |",
    ...next.map((r) => `| ${r.kind} | ${cell(r.name)} | ${cell(r.engine)} | ${r.status} | ${r.alone} | ${r.blocks} |`),
    "",
  ];
  for (const [title, rows] of sections) {
    lines.push(`## ${title}`, "");
    const withRule = rows.some((r) => r.rule);
    lines.push(`| ${withRule ? "Rule | " : ""}Name | Engine | Status | Top | All | Holds back | Alone |`);
    lines.push(`| ${withRule ? "--- | " : ""}--- | --- | --- | ---: | ---: | ---: | ---: |`);
    for (const r of order(rows))
      lines.push(`| ${withRule ? `${cell(r.rule)} | ` : ""}${cell(r.name)}${r.note ? ` (${r.note})` : ""} | ${cell(r.engine)} | ${r.status} | ${r.top} | ${r.all} | ${r.blocks} | ${r.alone} |`);
    lines.push("");
  }
  const md = lines.join("\n");
  const json = JSON.stringify(catalog, null, 1) + "\n";

  if (args.includes("--check")) {
    const stale = [[OUT_MD, md], [OUT_JSON, json]].filter(([file, text]) => !existsSync(file) || readFileSync(file, "utf8") !== text).map(([file]) => path.relative(REPO, file));
    if (stale.length) { console.error(`engine-catalog: stale -- ${stale.join(", ")}; run node game/tools/engine-catalog.mjs --write`); process.exit(1); }
    console.log(`engine-catalog: current -- ${all.length} entries in ${sections.length} sections`);
  } else if (args.includes("--write")) {
    writeFileSync(OUT_MD, md); writeFileSync(OUT_JSON, json);
    console.log(`engine-catalog: wrote ${path.relative(REPO, OUT_MD)} and ${path.relative(REPO, OUT_JSON)} -- ${all.length} entries`);
  } else {
    console.log(lines.slice(0, 40).join("\n"));
  }
}
