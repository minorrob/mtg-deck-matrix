/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* THE CARD DIRECTORY: WHAT THE ENGINE KNOWS ABOUT A CARD BY NAME.
 *
 * `docs/engine/PLAN.md` §3.1 and §6's phase 2.4 -- "`cards/index.mjs` with `resolve` and `suggest`", the same shape
 * as `forge-card-index.mjs`, reading CrankMagic's own definitions instead of Forge's scripts. Definitions live beside
 * it as `game/engine/cards/<letter>/<slug>.json` (`CrankCardScript@1`), each with its `<slug>.scenarios.json`;
 * `game/tools/engine-cards.mjs` reads them from disk, and this file, which touches no file system, is what a Worker
 * can import.
 *
 * A SCRIPT IS NOT YET AN OBJECT. The script says what the card says, in the vocabulary a model can be held to
 * ("enters", "upkeep", `{atom: "{T}"}`); the rules modules act on objects in their own terms (a trigger watching
 * `GameEventCardChangeZone`, a mana ability that `produces`). `compileScript` is the translation, and the only one:
 *   - a spell ability becomes the object's `spell`, which stack.mjs resolves;
 *   - "{T}: Add {G}" -- an activated ability with `{T}` as its whole cost, one fixed `addMana` and no target -- becomes
 *     a mana ability (CR 605.1a), which never uses the stack;
 *   - every other activated ability stays activated, and actions.mjs offers it;
 *   - a triggered ability's event is compiled to the engine event trigger.mjs watches;
 *   - keyword abilities become the object's keywords, in the rules modules' spelling;
 *   - statics and replacements pass through: their schema was written against layers.mjs and replacement.mjs.
 *
 * WHAT IT CANNOT PLAY, IT SAYS, BY NAME, BEFORE THE GAME (decision M4, 2026-09-25: "refused by name"). A script can
 * be perfectly valid and still use something the engine has not built -- a primitive declared and not implemented,
 * a keyword with no behavior, a cost atom nothing pays, a trigger whose targets nothing chooses yet. Each is a
 * PROBLEM, and a card with any problem has no definition: `definition(name)` is null and `problems(name)` says why.
 * A table refuses it at prepare, never on the turn it is drawn.
 */

import {validateScript} from "../script/schema.mjs";
import {isBuilt} from "../script/effects/index.mjs";
import {KEYWORD_FAMILIES} from "../keywords/combat.mjs";
import {KEYWORD_FAMILIES as TIMING_FAMILIES} from "../keywords/timing.mjs";
import {costAtomBuilt} from "../rules/actions.mjs";

/** The keywords some rules module acts on, in its own spelling. A keyword not here is a word with no behavior. */
const KEYWORDS_WITH_BEHAVIOR = new Set([...Object.values(KEYWORD_FAMILIES), ...Object.values(TIMING_FAMILIES)].flat());

/* "first strike" in the script's vocabulary is "First Strike" to the rules modules. */
const titleCase = (word) => String(word).split(" ").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

/* A script's trigger, in the engine's events. The script names the event in the vocabulary's words; `who: "self"` is
   "when THIS enters", `yours: true` is "at the beginning of YOUR upkeep". */
const TRIGGERS = {
  enters: (t) => (t.who ?? "self") === "self" ? {on: "GameEventCardChangeZone", to: "Battlefield", who: "self"} : null,
  dies: (t) => (t.who ?? "self") === "self" ? {on: "GameEventCardChangeZone", from: "Battlefield", to: "Graveyard", who: "self"} : null,
  upkeep: (t) => ({on: "GameEventTurnPhase", phase: "UPKEEP", ...(t.yours === false ? {} : {yourTurn: true})}),
  "end step": (t) => ({on: "GameEventTurnPhase", phase: "END_OF_TURN", ...(t.yours === false ? {} : {yourTurn: true})}),
};

/** Fold a name for matching: case, accents, punctuation and spacing do not make a different card. */
export function foldName(name) {
  return String(name ?? "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9/ ]+/g, "").replace(/\s+/g, " ").trim();
}

/* Every effect, nested ones included, for checking what a script asks of the engine. */
function effectsIn(list, out = []) {
  for (const effect of list ?? []) {
    if (!effect || typeof effect !== "object") continue;
    out.push(effect);
    effectsIn(effect.effects, out);
    for (const mode of effect.modes ?? []) effectsIn(mode.effects, out);
    effectsIn(effect.then, out);
    effectsIn(effect.otherwise, out);
  }
  return out;
}

/* "{T}: Add {G}." -- CR 605.1a: an activated ability without a target that could add mana is a mana ability. The
   engine's mana abilities tap their source and add a fixed amount; anything else that adds mana is a problem until
   the payment choice exists (a color chosen on activation, a cost beyond {T}). */
function manaAbility(ability, id) {
  if (ability.kind !== "activated") return null;
  const adds = (ability.effects ?? []).some((e) => e?.effect === "addMana");
  if (!adds) return null;
  const fixed = (ability.cost ?? []).length === 1 && ability.cost[0]?.atom === "{T}" && !(ability.targets ?? []).length
    && ability.effects.length === 1 && ability.effects[0].mana && typeof ability.effects[0].mana === "object"
    && Object.entries(ability.effects[0].mana).every(([color, n]) => /^[WUBRGC]$/.test(color) && Number.isInteger(n) && n > 0);
  return fixed ? {id, kind: "mana", tapSelf: true, produces: {...ability.effects[0].mana}, text: ability.text} : "unbuilt";
}

/**
 * A script as the object the engine holds, or the reasons it cannot be one yet.
 *
 * @returns {{definition: ?object, problems: string[]}}
 */
export function compileScript(script) {
  const {valid, errors} = validateScript(script);
  if (!valid) return {definition: null, problems: errors.map((e) => `${e.path}: ${e.message}`)};

  const problems = [];
  const identity = script.identity;
  const abilities = [];
  const keywords = [];
  let spell = null;

  script.abilities.forEach((ability, index) => {
    const id = ability.id ?? `a${index}`;
    for (const effect of effectsIn(ability.effects)) {
      if (!isBuilt(effect.effect)) problems.push(`${effect.effect}: declared, not built`);
      /* counterSpell's targets are stack ids; the binder hands it objects. Its target is 2.4b's. */
      if (effect.effect === "counterSpell") problems.push("counterSpell: countering a target spell is not wired yet");
    }

    if (ability.kind === "spell") {
      if (spell) problems.push("a second spell ability: one card, one spell");
      spell = {id, text: ability.text, targets: ability.targets ?? [], effects: ability.effects};
      return;
    }
    if (ability.kind === "keyword") {
      const word = titleCase(ability.keyword);
      if (!KEYWORDS_WITH_BEHAVIOR.has(word)) problems.push(`${word}: declared, no behavior`);
      keywords.push(word);
      return;
    }
    if (ability.kind === "activated") {
      const mana = manaAbility(ability, id);
      if (mana === "unbuilt") { problems.push(`${ability.text}: a mana ability beyond "{T}: Add" a fixed amount`); return; }
      if (mana) { abilities.push(mana); return; }
      for (const atom of ability.cost) if (!costAtomBuilt(atom)) problems.push(`${atom?.atom ?? "a cost"}: a cost atom nothing pays yet`);
      abilities.push({id, kind: "activated", text: ability.text, cost: ability.cost, targets: ability.targets ?? [],
        effects: ability.effects, ...(ability.timing ? {timing: ability.timing} : {})});
      return;
    }
    if (ability.kind === "triggered") {
      const compile = TRIGGERS[ability.trigger.on];
      const trigger = compile ? compile(ability.trigger) : null;
      if (!trigger) problems.push(`${ability.trigger.on}${ability.trigger.who ? ` (${ability.trigger.who})` : ""}: a trigger the engine does not watch for yet`);
      if ((ability.targets ?? []).length) problems.push(`${ability.text}: a trigger's targets are chosen as it goes on the stack, which is 2.4b's`);
      abilities.push({id, kind: "triggered", text: ability.text, trigger: trigger ?? {on: null}, effects: ability.effects,
        ...(ability.condition ? {condition: ability.condition} : {}), ...(ability.optional ? {optional: true} : {})});
      return;
    }
    /* static and replacement: their schema is the rules modules' own shape. */
    abilities.push({...ability, id});
  });

  const types = identity.types;
  if (!spell && types.some((t) => t === "Instant" || t === "Sorcery")) problems.push("an instant or sorcery with no spell ability does nothing");

  const definition = {
    oracleId: identity.oracleId,
    types: [...types],
    subtypes: [...(identity.subtypes ?? [])],
    manaCost: identity.manaCost ?? null,
    colors: [...(identity.colors ?? [])],
    colorIdentity: [...(identity.colorIdentity ?? [])],
    power: identity.power ?? null,
    toughness: identity.toughness ?? null,
    keywords,
    abilities,
    ...(spell ? {spell} : {}),
  };
  return {definition: problems.length ? null : definition, problems: [...new Set(problems)]};
}

/* Edit distance, bounded: suggestions are for a misspelling, not for every card in the pool. */
function distance(a, b, limit) {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  let previous = Array.from({length: b.length + 1}, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j += 1) {
      row[j] = Math.min(previous[j] + 1, row[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      best = Math.min(best, row[j]);
    }
    if (best > limit) return limit + 1;
    previous = row;
  }
  return previous[b.length];
}

/**
 * The directory over a list of scripts.
 *
 * @param {Array<{script: object, path?: string}>|Array<object>} entries  scripts, or `{script, path}` as game/tools/engine-cards.mjs reads them
 * @returns {{size: number, names: string[], resolve: Function, suggest: Function, definition: Function, problems: Function}}
 */
export function createCardIndex(entries) {
  const byName = new Map();
  for (const entry of entries ?? []) {
    const script = entry && entry.script ? entry.script : entry;
    const file = entry && entry.script ? entry.path ?? null : null;
    const name = script?.identity?.name;
    if (!name) throw new Error(`A card definition${file ? ` (${file})` : ""} has no name`);
    const key = foldName(name);
    if (byName.has(key)) throw new Error(`Two definitions of ${name}${file ? ` (${file} and ${byName.get(key).path})` : ""}`);
    const {definition, problems} = compileScript(script);
    byName.set(key, {name, oracleId: script.identity.oracleId ?? null, path: file, script, definition, problems});
  }
  const names = [...byName.values()].map((e) => e.name).sort();

  /** A card's entry by name, however it is spelled -- or null. The same shape as forge-card-index's `resolve`. */
  const resolve = (name) => {
    const hit = byName.get(foldName(name));
    return hit ? {name: hit.name, oracleId: hit.oracleId, path: hit.path, playable: hit.problems.length === 0, problems: [...hit.problems]} : null;
  };
  /** The nearest names, for a name that does not resolve. */
  const suggest = (name, limit = 5) => {
    const want = foldName(name);
    if (!want) return [];
    return names
      .map((n) => {const f = foldName(n); return {n, d: f.startsWith(want) || want.startsWith(f) ? 0 : distance(want, f, 3)};})
      .filter((x) => x.d <= 3)
      .sort((a, b) => a.d - b.d || a.n.localeCompare(b.n))
      .slice(0, limit)
      .map((x) => x.n);
  };
  /** The object fields for `addObject`, fresh each call -- or null when the engine cannot play the card. */
  const definition = (name) => {
    const hit = byName.get(foldName(name));
    return hit && hit.definition ? structuredClone(hit.definition) : null;
  };
  /** Why a card cannot be played, or [] when it can (and null for a card there is no definition of at all). */
  const problems = (name) => {
    const hit = byName.get(foldName(name));
    return hit ? [...hit.problems] : null;
  };

  return {size: byName.size, names, resolve, suggest, definition, problems};
}
