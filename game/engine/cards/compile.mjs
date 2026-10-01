/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* THE CARD LOADER'S CHECKS: WHAT A MODEL-WRITTEN SCRIPT MUST PASS BEFORE THE ENGINE WILL STORE IT.
 *
 * `docs/plan-to-done-2026-09-30.md`, AI-3, and `docs/plan-card-extraction-skill.md` §3. A model writes a card's
 * abilities from its oracle text; this file decides whether what it wrote is the card. It is pure -- no file, no
 * network -- so the offline batch (`game/tools/engine-compile.mjs`) and, through the door, the Worker's loader run the
 * same checks. The four, cheapest first, and a card stops at the first it fails:
 *
 *   1. THE PRINTED FACTS ARE NOT THE MODEL'S. Name, oracle id, cost, types, colors, power and toughness come from the
 *      committed oracle data (`data/engine/oracle.json`); the model writes only `abilities`. `assembleScript` joins
 *      them, and `CrankCardScript@1`'s own validation (script/schema.mjs) is check one.
 *   2. FIDELITY, BY CODE. Every ability's `text` must be a sentence of the card's oracle text -- a model that invents
 *      an ability cannot produce a matching sentence -- and every clause of the oracle text must be claimed by some
 *      ability, or the card is only partly understood. Reminder text in parentheses claims nothing. (The read-back,
 *      a second model reading the script against the text and answering a checklist, is `checkReadBack`.)
 *   3. THE SMOKE TEST. The card is put into a scratch game and played through the rules: a land played, a spell cast
 *      and resolved, each activated ability activated, every question answered with its first legal answer. An
 *      exception, or a state where an object is not in exactly the zone it says, refuses it (`smokeTest`).
 *   4. RULES THAT NEED A RULING. The model names any layer, replacement or copy interaction it relied on, with the
 *      rule; a card with any is stored `provisional` until a playtest or Rob confirms it.
 *
 * A script that passes and uses something the engine has not built is not refused: it is stored `blocked`, with the
 * construct named (cards/index.mjs), so the day the engine builds it the card plays without being learned again.
 */

import {validateScript, SCRIPT_SCHEMA, ABILITY_KINDS} from "../script/schema.mjs";
import {compileScript} from "./index.mjs";
import {runScenario} from "./scenario.mjs";
import {hashState} from "../journal.mjs";
import {EFFECTS, NEEDS_A_DECISION} from "../script/effects/index.mjs";
import {SELECTOR_KEYS} from "../script/filter.mjs";
import {STATIC_RULES} from "../rules/statics.mjs";

export const COMPILED_SCHEMA = "CrankCompiledCard@1";

/** The oracle facts a script is held to, hashed: a card whose text changes is learned again (PLAN §3.4). */
export const oracleHash = (card) => hashState({name: card.name, mana: card.mana ?? null, type: card.type ?? "", text: card.text ?? ""});

const num = (v) => (v !== null && v !== undefined && /^\d+$/.test(String(v)) ? Number(v) : null);
const SUPERTYPES = ["Legendary", "Basic", "Snow", "World"];

/** The printed facts, from the oracle record and never from the model. */
export function identityOf(card) {
  const [left, right = ""] = String(card.type ?? "").split(" — ");
  const words = left.split(/\s+/).filter(Boolean);
  const supertypes = words.filter((w) => SUPERTYPES.includes(w));
  return {
    name: card.name, oracleId: card.id, ...(supertypes.length ? {supertypes} : {}),
    types: words.filter((w) => !SUPERTYPES.includes(w)), subtypes: right.split(/\s+/).filter(Boolean),
    manaCost: card.mana ?? null, colors: [...(card.colors ?? [])], colorIdentity: [...(card.ci ?? [])],
    power: num(card.power), toughness: num(card.toughness),
  };
}

/** A type line from an identity, the way the oracle prints it. */
export const typeLineOf = (identity) => [...(identity.supertypes ?? []), ...(identity.types ?? [])].join(" ")
  + ((identity.subtypes ?? []).length ? ` — ${identity.subtypes.join(" ")}` : "");

/** The script: the oracle's facts and text, the model's abilities. */
export function assembleScript(card, answer, model = null) {
  return {schema: SCRIPT_SCHEMA, identity: identityOf(card), oracleText: card.text ?? "", source: "compiler",
    ...(model ? {model} : {}), abilities: Array.isArray(answer?.abilities) ? answer.abilities : []};
}

/* ---- check 2: fidelity, by code ---- */

const normalize = (s) => String(s ?? "").replace(/[‘’]/g, "'").replace(/[“”]/g, "\"").replace(/—/g, "-")
  .toLowerCase().replace(/\s+/g, " ").replace(/\s*\.\s*$/, "").trim();
/* A line that is all reminder text (a basic land's "({T}: Add {W}.)") is the card's ability; anywhere else, reminder
   text in parentheses explains a keyword and claims nothing. */
const withoutReminders = (line) => {
  const t = line.trim();
  if (/^\(.*\)$/.test(t)) return t.slice(1, -1);
  return t.replace(/\s*\([^)]*\)/g, "").trim();
};
/** The clauses of a card's oracle text: its lines, each line's sentences, a keyword line's comma-separated words. */
export function oracleClauses(text) {
  const clauses = [];
  for (const raw of String(text ?? "").split("\n")) {
    const line = withoutReminders(raw);
    if (!line) continue;
    const sentences = line.split(/(?<=\.)\s+(?=[A-Z{])/).map((s) => s.trim()).filter(Boolean);
    for (const s of sentences) {
      /* "Flying, double strike, vigilance": a keyword line, one clause per keyword. */
      if (!/[.:]/.test(s) && s.includes(",")) clauses.push(...s.split(",").map((w) => w.trim()).filter(Boolean));
      else clauses.push(s);
    }
  }
  return clauses;
}

/**
 * Every ability a sentence of the card, and every clause of the card claimed by an ability.
 *
 * @returns {{ok: boolean, invented: string[], unclaimed: string[]}}
 */
export function checkFidelity(script) {
  const full = normalize(String(script.oracleText ?? "").replace(/[()]/g, ""));
  const texts = (script.abilities ?? []).map((a) => normalize(a?.text));
  const invented = (script.abilities ?? []).filter((a, i) => !texts[i] || !full.includes(texts[i])).map((a) => String(a?.text ?? ""));
  const unclaimed = oracleClauses(script.oracleText).filter((clause) => {
    const c = normalize(clause);
    return !texts.some((t) => t && (t.includes(c) || c.includes(t)));
  });
  return {ok: invented.length === 0 && unclaimed.length === 0, invented, unclaimed};
}

/* ---- the read-back: a second model's checklist ---- */

export const READBACK_SCHEMA = Object.freeze({
  type: "object", additionalProperties: false,
  properties: {
    everyAbilityPresent: {type: "boolean"}, costsRight: {type: "boolean"}, targetsRight: {type: "boolean"},
    zonesRight: {type: "boolean"}, effectsRight: {type: "boolean"}, problems: {type: "array", items: {type: "string"}},
  },
  required: ["everyAbilityPresent", "costsRight", "targetsRight", "zonesRight", "effectsRight", "problems"],
});
export const READBACK_SYSTEM = [
  "You check a Magic: The Gathering card definition against the card's oracle text, for a rules engine.",
  "You get the oracle text and a JSON definition. Answer each question true only if the definition does exactly what the text says:",
  "every ability present (none missing, none extra); every cost right (mana, tapping, sacrifice, life); every target right (what may be chosen, how many);",
  "every zone right (where things move from and to); every effect right (amounts, who is affected, durations).",
  "List each problem in one plain sentence in American English. Return only JSON matching the schema.",
].join(" ");
export const readBackRequest = (card, script) => JSON.stringify({oracleText: card.text ?? "", name: card.name, definition: {abilities: script.abilities}});
/** A read-back passes only when every answer is yes and it names no problem. */
export function checkReadBack(answer) {
  const keys = ["everyAbilityPresent", "costsRight", "targetsRight", "zonesRight", "effectsRight"];
  const failed = keys.filter((k) => answer?.[k] !== true);
  const problems = Array.isArray(answer?.problems) ? answer.problems.map(String).filter(Boolean) : ["no checklist came back"];
  return {ok: failed.length === 0 && problems.length === 0, failed, problems};
}

/* ---- check 3: the smoke test ---- */

const COLOR_LAND = {W: "Plains", U: "Island", B: "Swamp", R: "Mountain", G: "Forest"};
/* Lands enough to pay a cost: a basic per colored pip (a hybrid's first color), Wastes for the rest, and two more
   Wastes for an ability's own mana. X is paid as zero. */
function landsFor(cost) {
  const lands = [];
  for (const symbol of String(cost ?? "").match(/\{[^}]+\}/g) ?? []) {
    const s = symbol.slice(1, -1);
    if (/^\d+$/.test(s)) for (let i = 0; i < Number(s); i += 1) lands.push("Wastes");
    else if (s === "X") continue;
    else {
      const color = s.split("/").find((c) => COLOR_LAND[c]);
      lands.push(color ? COLOR_LAND[color] : "Wastes");
    }
  }
  return [...lands, "Wastes", "Wastes"];
}
const SMOKE_FIXTURES = Object.freeze({
  "Smoke Commander": {types: ["Creature"], manaCost: "{W}{U}{B}{R}{G}", colorIdentity: ["W", "U", "B", "R", "G"], power: 5, toughness: 5},
  "Smoke Bear": {types: ["Creature"], manaCost: "{1}{G}", power: 2, toughness: 2},
  "Smoke Relic": {types: ["Artifact"], manaCost: "{2}"},
  "Smoke Charm": {types: ["Enchantment"], manaCost: "{2}"},
  "Smoke Giant": {types: ["Creature"], manaCost: "{4}{G}", power: 5, toughness: 5},
  /* A free sorcery the opponent casts, so a card cast at instant speed has a spell to answer. */
  "Smoke Sorcery": {types: ["Sorcery"], manaCost: "{0}", spell: {id: "s", text: "Draw a card.", targets: [], effects: [{effect: "draw", count: 1}]}},
});

/**
 * A scratch game for one card: its player has the lands to cast it and a five-color commander; the opponent has a
 * creature, a bigger one, an artifact, an enchantment and a land to be aimed at. The card is played or cast and
 * resolved -- one cast at instant speed in the opponent's turn, in answer to a sorcery, so a counterspell has a spell
 * to counter -- and on its controller's next turn each of its abilities is used once if it can be.
 */
export function smokeScenario(script) {
  const name = script.identity.name;
  const isLand = (script.identity.types ?? []).includes("Land");
  const lands = isLand ? ["Wastes", "Wastes"] : landsFor(script.identity.manaCost);
  const instantSpeed = !isLand && Boolean(script.identity.manaCost)
    && ((script.identity.types ?? []).includes("Instant") || (script.abilities ?? []).some((a) => a?.kind === "keyword" && a.keyword === "flash"));
  const steps = [];
  /* A land that asks as it enters, or triggers (a scry land), is answered and resolved before the game moves on. */
  if (isLand) steps.push({play: name, seat: 0}, {settle: true});
  else if (script.identity.manaCost) {
    if (instantSpeed) steps.push({cast: "Smoke Sorcery", seat: 1}, {pass: 1});
    for (let i = 0; i < lands.length - 2; i += 1) steps.push({tap: lands[i], seat: 0, optional: true});
    steps.push({cast: name, seat: 0, targets: "any", optional: true}, {settle: true});
  }
  steps.push({to: {turn: 3, phase: "MAIN1"}});
  for (const ability of script.abilities ?? []) {
    if (ability?.kind !== "activated") continue;
    if (ability.mana) steps.push({tap: name, seat: 0, optional: true});
    else steps.push({tap: "Wastes", seat: 0, optional: true}, {tap: "Wastes", seat: 0, optional: true}, {activate: name, seat: 0, targets: "any", optional: true}, {settle: true});
  }
  return {
    fixtures: SMOKE_FIXTURES,
    scenario: {
      name: `smoke: ${name}`,
      ...(instantSpeed ? {at: {turn: 2, phase: "MAIN1"}} : {}),
      setup: [
        {seat: 0, zone: "command", cards: ["Smoke Commander"]},
        {seat: 0, zone: "battlefield", cards: lands},
        ...(isLand || script.identity.manaCost ? [{seat: 0, zone: "hand", cards: [name]}] : [{seat: 0, zone: "battlefield", cards: [name]}]),
        {seat: 1, zone: "battlefield", cards: ["Smoke Bear", "Smoke Giant", "Smoke Relic", "Smoke Charm", "Wastes"]},
        {seat: 1, zone: "hand", cards: ["Smoke Sorcery"]},
      ],
      steps,
      expect: [],
    },
  };
}

/* Every object in exactly the zone it says it is in, and every zone's ids real: an engine that lost or doubled a card
   is in a state no game could reach. */
export function zoneProblems(state) {
  const problems = [], seen = new Map();
  const note = (id, where) => { if (seen.has(id)) problems.push(`object ${id} is in ${seen.get(id)} and ${where}`); seen.set(id, where); };
  for (const [zone, value] of Object.entries(state.zones)) {
    const lists = Array.isArray(value[0]) || value.length === 0 && zone !== "battlefield" && zone !== "stack" && zone !== "exile" ? value : [value];
    lists.forEach((list, seat) => (Array.isArray(list) ? list : []).forEach((id) => {
      note(id, zone);
      const o = state.objects[id];
      if (!o) problems.push(`${zone} lists object ${id}, which does not exist`);
      else if (o.zone !== zone) problems.push(`${o.card} is listed in ${zone} and says it is in ${o.zone}`);
      void seat;
    }));
  }
  for (const id of Object.keys(state.objects)) if (!seen.has(Number(id))) problems.push(`${state.objects[id].card} is in no zone`);
  return problems;
}

/**
 * Play the card in its scratch game.
 *
 * @param {(name: string) => ?object} cards  the directory's definitions, for the basic lands
 * @returns {{ok: boolean, error: ?string, problems: string[]}}
 */
export function smokeTest(script, cards) {
  const {definition, problems} = compileScript(script);
  if (!definition) return {ok: false, error: null, problems: [`not playable yet: ${problems.join("; ")}`], blocked: true};
  const {scenario, fixtures} = smokeScenario(script);
  const resolve = (name) => (name === script.identity.name ? structuredClone(definition) : cards(name));
  try {
    const {state, events} = runScenario(scenario, resolve, fixtures);
    const bad = zoneProblems(state);
    /* Whether the card was actually played: a counterspell with nothing to counter stays in hand, which is the
       fixture's limit and not the script's fault -- so it is reported, not refused. */
    const name = script.identity.name;
    const played = (!(script.identity.types ?? []).includes("Land") && !script.identity.manaCost)
      || events.some((e) => (e.kind === "GameEventLandPlayed" && e.data.fields.land?.name === name)
        || (e.kind === "GameEventSpellAbilityCast" && e.data.fields.sa?.isSpell && e.data.fields.card?.name === name));
    const resolved = events.filter((e) => e.kind === "GameEventSpellResolved").length;
    return {ok: bad.length === 0, error: null, problems: bad, played, resolved};
  } catch (error) {
    return {ok: false, error: error.message, problems: [error.message]};
  }
}

/* ---- the request the script writer receives ---- */

/** What a script may say, read off the engine as it is today: the vocabulary the model is held to. */
export function scriptVocabulary() {
  return {
    abilityKinds: [...ABILITY_KINDS],
    effects: [...Object.keys(EFFECTS), ...NEEDS_A_DECISION].sort(),
    selectorKeys: [...SELECTOR_KEYS, "anyOf (a choice of selectors, for 'any target')"],
    triggers: ["enters (who: self|another|any, filter?: selector)", "dies (who: self)", "upkeep (yours: true|false)", "end step (yours: true|false)"],
    costAtoms: ["{atom: \"{T}\"}", "{atom: \"mana\", cost: \"{1}{G}\"}", "{atom: \"payLife\", amount: n}", "{atom: \"sacrifice\", self: true}"],
    staticRules: Object.keys(STATIC_RULES),
  };
}

/** The writer's standing instructions: the same for every card, so the prefix caches. */
export function writerSystem(examples) {
  const v = scriptVocabulary();
  return [
    "You write the abilities of one Magic: The Gathering card as JSON for the CrankMagic rules engine (CrankCardScript@1).",
    "You get the card's name, type line, mana cost and oracle text. The printed facts are filled in by code; you write only `abilities`.",
    "Each ability is an object with `kind` (one of " + v.abilityKinds.join(", ") + ") and `text`, the exact oracle sentence it implements, copied from the oracle text.",
    "Spell, activated and triggered abilities have `effects`: each names a primitive in `effect`, one of: " + v.effects.join(", ") + ".",
    "Targets: an ability lists them in `targets` as selectors (keys: " + v.selectorKeys.join(", ") + "), and an effect names its target as {\"target\": n}: in `targets` for objects, `who` or `toPlayer` for players, `spells` for a spell to counter. \"self\" is the card itself.",
    "Activated abilities have `cost`, a list of cost atoms: " + v.costAtoms.join(", ") + ". A mana ability is activated, with `mana: true`, and its first effect is addMana with `mana` (fixed), `choice` (alternatives) or `anyColor` (true, or \"identity\" for the commander's color identity).",
    "Triggered abilities have `trigger` with `on`: " + v.triggers.join("; ") + ".",
    "Keyword abilities have `keyword`, lowercase (\"flying\"). Static abilities change a characteristic in a `layer` with `apply` and `affects`, or a `rule`, one of: " + v.staticRules.join(", ") + ". Replacement abilities have `watches` and `change` (\"This land enters tapped\" is watches {event: \"enters\", who: \"self\"}, change {entersTapped: true}).",
    "Use only the names above. If the card needs something not listed, write it as best the vocabulary allows and say so in `notes`; never invent a primitive.",
    "List in `crFlags` any interaction of layers (CR 613), replacement effects (CR 614), copying (CR 707) or other rule your definition depends on, as \"CR 613.1: why\". Reminder text in parentheses is not an ability.",
    "Return only JSON matching the schema, with the abilities array written as JSON text in `abilitiesJson`. Examples of finished definitions follow.",
    ...examples.map((e) => JSON.stringify({card: {name: e.identity.name, type: typeLineOf(e.identity), manaCost: e.identity.manaCost, oracleText: e.oracleText}, abilities: e.abilities})),
  ].join("\n");
}
/**
 * The writer's answer, for the API's structured output: the abilities as JSON TEXT, any notes, and the rules it
 * relied on. Structured output allows no open object and no recursion, and a card's abilities are both -- effects
 * nest inside modes -- so the wrapper is held by the API and what is inside it by `validateScript`, which is
 * stricter than any JSON Schema the API accepts.
 */
export const WRITER_SCHEMA = Object.freeze({
  type: "object", additionalProperties: false,
  properties: {
    abilitiesJson: {type: "string"},
    notes: {type: "string"},
    crFlags: {type: "array", items: {type: "string"}},
  },
  required: ["abilitiesJson", "notes", "crFlags"],
});
export const writerRequest = (card, errors = null) => JSON.stringify({
  card: {name: card.name, type: card.type, manaCost: card.mana ?? null, oracleText: card.text ?? ""},
  ...(errors ? {yourLastAnswerWasRefused: errors} : {}),
});

/**
 * Checks one and two, by code, on a writer's answer.
 *
 * @returns {{script, stage: ?string, problems: string[]}} `stage` names the first check failed, or null
 */
export function checkAnswer(card, answer, model = null) {
  let abilities = answer?.abilities;
  if (typeof answer?.abilitiesJson === "string") {
    try { abilities = JSON.parse(answer.abilitiesJson); }
    catch (error) { return {script: assembleScript(card, {abilities: []}, model), stage: "schema", problems: [`abilitiesJson is not JSON: ${error.message}`]}; }
  }
  const script = assembleScript(card, {abilities}, model);
  const {valid, errors} = validateScript(script);
  if (!valid) return {script, stage: "schema", problems: errors.map((e) => `${e.path}: ${e.message}`)};
  const fidelity = checkFidelity(script);
  if (!fidelity.ok) return {script, stage: "fidelity", problems: [...fidelity.invented.map((t) => `not a sentence of the card: "${t}"`), ...fidelity.unclaimed.map((t) => `no ability claims: "${t}"`)]};
  return {script, stage: null, problems: []};
}
