/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* THE ENGINE CATALOG (game/tools/engine-catalog.mjs; Rob, 2026-10-01: "a definitive and distinct list of actions,
 * triggers, effects, actions, options, etc. that can be taken by MtG cards adhering to commander rules").
 *
 *   Rules      every keyword action (701) and keyword ability (702) heading of the Comprehensive Rules is an entry,
 *              once, in its section; the headings are read from the rules text as numbers and names only.
 *   Cards      every effect, trigger, static ability, replacement effect and keyword the most-played cards use is an
 *              entry, with the inventory's own count.
 *   Status     an entry marked built is one the engine has: an effect's primitive is built, a keyword behaves.
 *   Order      the most-played cards with every mechanic built are the coverage count; what to build next is ordered
 *              by how many cards each thing alone holds back, and lists each thing once.
 */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {isBuilt} from "../game/engine/script/effects/index.mjs";
import {missingFor, BEHAVIORAL_KEYWORDS, ABILITY_KEYWORDS} from "../game/tools/engine-constructs.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const read = (rel) => JSON.parse(readFileSync(new URL(`../${rel}`, import.meta.url), "utf8"));
const cr = read("game/docs/cr-index.json");
const catalog = read("game/docs/engine-catalog.json");
const inventory = read("game/docs/engine-inventory.json");
const section = (title) => catalog.sections[title].entries;
const md = readFileSync(new URL("../docs/engine/catalog.md", import.meta.url), "utf8");

/* ---- the rules ---- */
{
  const {headingsFrom} = await import("../game/tools/engine-catalog.mjs");
  const sample = "701.1. Most actions described in a card’s rules text use the standard English definitions.\n701.3. Attach\n701.3a To attach an Aura...\n702.6. Equip\n702.9. Flying\n";
  eq(headingsFrom(sample), {keywordActions: [{rule: "701.3", name: "Attach"}], keywordAbilities: [{rule: "702.6", name: "Equip"}, {rule: "702.9", name: "Flying"}]},
    "a heading is a numbered rule whose whole line is a name; 701.1's sentence and the lettered subrules are not headings");
  eq([cr.keywordActions.length, cr.keywordAbilities.length], [70, 194], `the rules (${cr.source}) name 70 keyword actions and 194 keyword abilities`);
  const rules = [...cr.keywordActions, ...cr.keywordAbilities].map((h) => h.rule);
  eq(new Set(rules).size, rules.length, "each heading once");
  for (const [title, headings] of [["Keyword actions (CR 701)", cr.keywordActions], ["Keyword abilities (CR 702)", cr.keywordAbilities]]) {
    const listed = section(title).map((e) => `${e.rule} ${e.name}`).sort();
    eq(listed, headings.map((h) => `${h.rule} ${h.name}`).sort(), `${title}: every heading is an entry, and nothing else is`);
  }
  ok(md.includes("| 702.6 | Equip | Equip | built |") && md.includes("| 701.3 | Attach | attach | built |"), "the written catalog says Equip and Attach are built, with their rule numbers");
}

/* ---- the cards ---- */
{
  const TOP = inventory.top.counts;
  const indexOf = (title) => new Map(section(title).map((e) => [e.forge ?? e.name, e]));
  for (const [kind, titles] of [["apis", ["Effects"]], ["triggers", ["Triggers"]], ["statics", ["Static abilities"]], ["replacements", ["Replacement effects"]],
    ["keywords", ["Keyword abilities (CR 702)", "Other keyword constructs"]]]) {
    const entries = new Map(titles.flatMap((t) => [...indexOf(t)]));
    const wrong = TOP[kind].filter(([name, n]) => !(entries.has(name) && entries.get(name).top === n)).map(([name, n]) => `${name} (${n})`);
    eq(wrong, [], `every ${kind.replace(/s$/, "")} the most-played cards use is an entry, with the inventory's count (${TOP[kind].length})`);
  }
  eq(section("Effects").length, inventory.forge.counts.apis.length, `every effect any of the ${catalog.sources.cards.all} cards uses is listed (${inventory.forge.counts.apis.length})`);
}

/* ---- status ---- */
{
  const bad = section("Effects").filter((e) => e.status === "built" && !isBuilt(e.engine)).map((e) => e.name);
  eq(bad, [], "an effect marked built has its primitive built");
  const behaves = (w) => [...BEHAVIORAL_KEYWORDS].some((k) => k.toLowerCase() === w.toLowerCase()) || (ABILITY_KEYWORDS[w] && isBuilt(ABILITY_KEYWORDS[w]));
  eq(section("Keyword abilities (CR 702)").filter((e) => (e.status === "built") !== Boolean(behaves(e.name))).map((e) => e.name), [], "a keyword ability is built exactly when it behaves");
  ok(["built", "partial", "named", "missing"].includes(section("Choices").find((c) => c.rule === "603.5").status) && section("Choices").find((c) => c.rule === "603.5").status === "built",
    "\"you may\" is a built choice (CR 603.5)");
}

/* ---- order ---- */
{
  /* A trigger counts only when the compiler builds it: a "whenever you cast a spell" card is not one the engine has every
     rule for just because the vocabulary names the event (the catalog showed coverage counting it, 2026-10-01). */
  eq([missingFor({triggers: ["SpellCast"]}), missingFor({triggers: ["ChangesZone"]}), missingFor({triggers: ["Phase"]})],
    [[{kind: "trigger", name: "spell cast", why: "declared, not built"}], [], []],
    "a trigger the vocabulary names but the compiler does not build holds a card back; Forge's broad zone-change and phase triggers do not");
  const every = Object.values(inventory.top.perCard).filter((card) => missingFor(card).length === 0).length;
  eq(catalog.top.everyRule, every, `the most-played cards with every mechanic built are coverage's own count (${every})`);
  const next = md.split("## What to build next")[1].split("\n## ")[0].split("\n").filter((l) => /^\| [a-z]/.test(l) && !l.startsWith("| Kind")).map((l) => l.split("|").map((c) => c.trim()));
  const alone = next.map((c) => Number(c[5]));
  ok(next.length > 0 && alone.every((n, i) => i === 0 || n <= alone[i - 1]), `what to build next is ordered by what each alone holds back (${next.slice(0, 3).map((c) => `${c[2]} ${c[5]}`).join(", ")})`);
  eq(new Set(next.map((c) => c[3] === "—" ? `${c[1]}:${c[2]}` : c[3])).size, next.length, "and lists each thing once: a keyword action and its effect are one");
}

console.log(`engine-catalog: ${checks} checks passed — every keyword action and ability of the rules and every construct the cards use, each with where the engine stands and what to build next.`);
