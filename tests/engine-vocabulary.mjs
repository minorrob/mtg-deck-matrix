/* THE ENGINE'S VOCABULARY, AND WHERE IT MEETS THE APP'S.
 *
 * `docs/engine/PLAN.md` §3.4 names "the primitive catalog" as an input the compiler is handed
 * alongside the schema and the oracle text. Until now that catalog has been a prose list in §12.2 —
 * something a person reads, not something a program can check. This is the same list as data.
 *
 * WHY IT HAS TO BE DATA BEFORE THE SCHEMA IS WRITTEN. `CrankCardScript@1`'s `effects[]` names a
 * primitive. If the legal names are not declared, the schema either repeats them (and drifts from
 * §12.2 the first time either changes) or accepts any string — and then an unsupported construct
 * arrives silently, which is the exact failure principle 6 exists to prevent: unsupported is loud.
 *
 * THE OTHER HALF IS THE SEAM. `card-classify.js` — whose own suite calls it "the one vocabulary" —
 * derives fifteen lists from oracle text by regex, and six files read them. The engine describes
 * the same cards in a different vocabulary, at a different level. Nothing maps between them.
 *
 * What the scan showed, and what changed the plan for this file: ROLES ARE NOT THE SEAM. `finisher`
 * and `ramp` are strategic judgments, and no sequence of primitives derives them — they belong to
 * the app the way the glossary does. The parts that really do describe the same thing are the
 * TRIGGERS and the KEYWORDS, which are small, concrete, and already disagree.
 */
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {createRequire} from "node:module";
import {
  PRIMITIVES, ALL_PRIMITIVES, TRIGGER_EVENTS, COST_ATOMS,
  TIER0_KEYWORDS, TIER0_CONSTRUCTS, KEYWORDS,
  isPrimitive, isKeyword, isTriggerEvent,
  APP_TERMS, TRIGGER_BRIDGE, KEYWORD_BRIDGE, normalizeKeyword,
} from "../game/engine/vocabulary.mjs";

const require = createRequire(import.meta.url);
let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

/* ---- the catalog is the plan's list, and stays it ---- */
{
  const text = await readFile(new URL("../docs/engine/PLAN.md", import.meta.url), "utf8");
  const section = text.slice(text.indexOf("### 12.2"), text.indexOf("### 12.3"));
  ok(section.length > 500, "§12.2 is where the primitive set is written down");

  /* A bullet in the plan wraps across lines, so the continuations are joined before the names are
     read — a per-line scan silently finds a third of them and looks like it worked. */
  const named = new Set();
  for (const bullet of section.split(/\n(?=- )/)) {
    const flat = bullet.replace(/\s*\n\s+/g, " ").trim();
    if (!flat.startsWith("- ")) continue;
    for (const [, name] of flat.matchAll(/`([^`]+)`/g)) named.add(name);
  }
  eq(named.size, 74,
    "seventy-four names are written in backticks in §12.2 — seventy-two effect primitives (regenerate joined in batch 28, addPhase in batch 33, becomeCopy in batch 58) and the two symbolic cost atoms");

  const missing = [...named].filter((name) => !ALL_PRIMITIVES.includes(name) && !COST_ATOMS.includes(name));
  eq(missing, [],
    "and every one of them is declared here — this is the drift guard: a primitive added to the plan and not to the catalog would be a name the compiler is told to use and the schema refuses");
}
{
  const flat = Object.values(PRIMITIVES).flat();
  eq(flat.length, new Set(flat).size,
    "no primitive is declared twice, in one family or across two — a duplicate means two families both think they own it");
  eq(ALL_PRIMITIVES.length, flat.length, "and the flat list is exactly the families");
  ok(Object.isFrozen(PRIMITIVES), "the catalog is read, never edited by a caller");
  ok(flat.every((name) => /^[a-z][A-Za-z]*$/.test(name)),
    "every primitive is a plain camelCase identifier, so a script can name one without quoting rules");
}

/* ---- membership, which is the question the schema will ask ---- */
{
  ok(isPrimitive("moveZone"), "a declared primitive is one");
  ok(isPrimitive("proliferate"), "from any family");
  ok(!isPrimitive("moveZOne"), "a typo is not — which is the whole point of asking");
  ok(!isPrimitive("blink"), "and neither is an app term that happens to describe an effect");
  ok(isTriggerEvent("dies"), "a declared trigger event is one");
  ok(!isTriggerEvent("creature-dies"), "and the app's spelling of it is not");
}

/* ---- keywords, and the two things the plan's list conflates ---- */
{
  eq(TIER0_KEYWORDS.length + TIER0_CONSTRUCTS.length, 52,
    "§12.2 lists fifty-two named things under Keywords (its heading says fifty-three; the list is the part that matters)");

  /* NOT EVERYTHING IN THAT LIST IS A KEYWORD. "saga chapters" and "alternate additional cost" are
     construct families that were grouped with the keywords. The difference is operational: a
     keyword is something `grantKeyword` can hand to a permanent, and neither of those is. */
  ok(TIER0_CONSTRUCTS.includes("saga chapters"), "a construct family is filed as one");
  ok(!isKeyword("saga chapters"), "and is not grantable, which is what isKeyword is asked for");
  ok(isKeyword("flying"), "a real keyword is");
  ok(TIER0_KEYWORDS.every((word) => isKeyword(word)), "every tier 0 keyword is grantable");
  ok(KEYWORDS.length >= TIER0_KEYWORDS.length,
    "the declared set is at least tier 0 — §12.2's count was measured on Rob's seven decks, not on the pool");
}

/* ---- the app's vocabulary, declared, so the seam can be checked at all ---- */
{
  const Classify = require("../card-classify.js");
  const cards = JSON.parse(await readFile(new URL("../data/cards.json", import.meta.url), "utf8")).cards || [];
  ok(cards.length > 1000, `the classifier has ${cards.length} cards of evidence to be measured against`);

  const seen = {};
  for (const card of cards) {
    const out = Classify.classify(card);
    for (const [key, value] of Object.entries(out ?? {})) {
      if (!Array.isArray(value)) continue;
      (seen[key] ??= new Set());
      for (const term of value) if (typeof term === "string") seen[key].add(term);
    }
  }

  /* THE CLOSED-SET CHECK, which is worth having on its own account. Six files read these terms. A
     typo in one of the classifier's regexes emits a term nothing matches, and every screen still
     renders — the card simply stops appearing in a category it belongs to, quietly. */
  for (const dimension of ["roles", "causes", "triggers", "produces", "consumes", "grants", "extends"]) {
    const emitted = [...(seen[dimension] ?? [])].sort();
    eq(emitted, [...APP_TERMS[dimension]].sort(),
      `the ${dimension} the classifier actually emits over the whole corpus are exactly the ones declared`);
  }
}

/* ---- the seam: triggers ---- */
{
  for (const term of APP_TERMS.triggers) {
    ok(term in TRIGGER_BRIDGE, `the app's ${JSON.stringify(term)} says what it means in engine terms`);
    checks -= 1;
  }
  checks += 1;
  const targets = Object.values(TRIGGER_BRIDGE).map((entry) => entry.event).filter((name) => name !== null);
  ok(targets.every((name) => isTriggerEvent(name)),
    "and every engine event the bridge names is one the engine declares");

  eq(TRIGGER_BRIDGE["creature-dies"].event, "dies", "creature-dies is the engine's dies");
  eq(TRIGGER_BRIDGE["creature-etb"].event, "enters", "creature-etb is enters");
  eq(TRIGGER_BRIDGE["cast-creature"].event, "spell cast",
    "and the five cast-* terms are one engine event with a type filter, not five events");
  eq(TRIGGER_BRIDGE["cast-creature"].filter, "Creature", "which the bridge carries");

  /* A GAP FOUND BY COMPARING THEM, AND CLOSED. §12.2's trigger list carried "life gained" and no
     counterpart, although "whenever you lose life" is an ordinary Magic trigger. The plan gained
     "life lost" rather than this being mapped to something near it — a wrong mapping compiles and
     is then silently incorrect, which is worse than a gap somebody can see. */
  eq(TRIGGER_BRIDGE["life-loss"].event, "life lost", "life-loss has an engine trigger event");
  ok(isTriggerEvent("life lost"), "which the engine declares — the comparison is what found it missing");
  eq(Object.values(TRIGGER_BRIDGE).filter((e) => e.event === null).length, 0,
    "and every app trigger term now names an engine event; none is left unmapped");
}

/* ---- the seam: keywords ---- */
{
  eq(normalizeKeyword("double-strike"), "double strike",
    "the app hyphenates what the engine spaces, which is the kind of difference that matches nothing and errors nowhere");
  eq(normalizeKeyword("first-strike"), "first strike", "both of them");
  eq(normalizeKeyword("flying"), "flying", "and leaves alone what already agrees");

  for (const term of [...APP_TERMS.grants, ...APP_TERMS.extends]) {
    ok(term in KEYWORD_BRIDGE, `the app's ${JSON.stringify(term)} is accounted for`);
    checks -= 1;
  }
  checks += 1;

  /* Two real keywords the engine's tier 0 list did not carry, because tier 0 was measured on seven
     decks. Declared now, so a card script that grants one is not refused as a typo. */
  ok(isKeyword("shroud"), "shroud is a keyword the app knew about and tier 0 did not");
  ok(isKeyword("ward"), "so is ward");

  /* And one that is NOT a keyword at all. "Unblockable" has not been a keyword since 2012; the
     cards say "can't be blocked", which is a static ability. Mapping it to a keyword would put a
     word on a permanent that no rule reads. */
  eq(KEYWORD_BRIDGE.unblockable.keyword, null, "unblockable is not a keyword");
  eq(KEYWORD_BRIDGE.unblockable.kind, "static", "it is a static ability, and the bridge says which");
}

/* ---- roles are the app's own, and that is the finding ---- */
{
  ok(APP_TERMS.roles.includes("finisher"), "the roles include judgments like finisher");
  ok(APP_TERMS.roles.includes("ramp"), "and ramp");
  ok(!ALL_PRIMITIVES.includes("finisher"), "which no primitive is");
  ok(typeof APP_TERMS.rolesAreNotBridged === "string" && APP_TERMS.rolesAreNotBridged.length > 40,
    "and the module says in words why they are not bridged, instead of leaving an empty map that looks unfinished");
}

/* ---- it is plain data ---- */
{
  const snapshot = {PRIMITIVES, TRIGGER_EVENTS, KEYWORDS, APP_TERMS, TRIGGER_BRIDGE, KEYWORD_BRIDGE};
  eq(JSON.parse(JSON.stringify(snapshot)), snapshot,
    "the whole vocabulary is plain data, so the compiler can be handed it as a tool definition (§3.4)");
}

console.log(`engine-vocabulary: ${checks} checks passed — the plan's primitive catalog as data, the classifier's terms held to a closed set, and the triggers and keywords where the two vocabularies actually meet.`);
