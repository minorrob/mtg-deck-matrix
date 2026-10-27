/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* THE AI ROSTER: THE DIFFICULTIES AND THE PERSONAS A SEAT IS CHOSEN FROM (docs/ai-players/PLAN-2026-10-26.html §3 and §7).
 *
 * Rob, 2026-10-26: "When choosing an AI player, you choose their difficulty, and then you choose their personality, and it
 * will be a persona. They'll have a name, a short description about who they are, and they will only be girls or boys,
 * male or female. They will have an avatar, and they will have captured within their short description indications of
 * their degree of saltiness, friendliness, or hugginess. These can override some of the presets and the difficulties."
 * And: "Roll hugginess into friendliness ... keep it generally straightforward": three dials.
 *
 * THE SOURCE OF TRUTH IS THIS MODULE, because the Worker and the room import modules and cannot read JSON; the browser's
 * lobby reads `data/ai-players/roster.json`, generated from it by `node tools/build-ai-roster.mjs` and held equal by
 * `tests/ai-personas.mjs`. A seat names a difficulty (`level`) and a persona (`persona`, an id here or none); nothing else
 * about either rides the wire, so a client can never choose a dial the roster does not offer.
 *
 * THE DIALS (each a whole number):
 *   saltiness        -2 group hug .. +4 salty: how disruptive its play may get. Easy and Normal are capped at -1 (Rob), Hard
 *                    at 0; only a persona's `saltCap` moves a cap, and it is the one place a cap can rise.
 *   friendliness     -2 .. +2, hugginess folded in: staying off a pile-on, taking a deal, cards that do nice things for others.
 *   competitiveness  -2 .. +2: how hard it pushes tempo and the win.
 *
 * WHAT A PERSONA MAY OVERRIDE, and nothing else (`OVERRIDE_LIMITS`): the saltiness cap, the reserve's risk appetite, a
 * grudge and a group-hug term on whom it goes at, its chance's temperature, and how it answers politics. It never changes
 * what it is told (information) and never weighs a person differently from an AI (person bias): the validator refuses a
 * persona that names either, and a persona cannot make Easy compute like Hard (temperature moves by one at most).
 */

export const ROSTER_SCHEMA = "CrankAiRoster@1";
export const PERSONA_SCHEMA = "CrankPersona@1";

/* The difficulties as the lobby offers them, in order. `id` is the seat's `level`. `saltCap` is the level's cap on the signed
   saltiness dial. `available: false` is offered nowhere yet; `needsAi` is the AI door's gate (the Veteran seat spends). */
export const LEVELS = Object.freeze([
  Object.freeze({id: "easy", label: "Easy", saltCap: -1, available: true, needsAi: false}),
  Object.freeze({id: "normal", label: "Normal", saltCap: -1, available: true, needsAi: false}),
  Object.freeze({id: "hard", label: "Hard", saltCap: 0, available: false, needsAi: false}),
  Object.freeze({id: "llm", label: "Veteran", saltCap: 0, available: true, needsAi: true}),
]);

export const DIALS = Object.freeze({
  saltiness: Object.freeze({min: -2, max: 4}),
  friendliness: Object.freeze({min: -2, max: 2}),
  competitiveness: Object.freeze({min: -2, max: 2}),
});

/* What an override may be. `saltCap` is the only one that can name a cap above its level's. */
export const OVERRIDE_LIMITS = Object.freeze({
  saltCap: Object.freeze({min: -2, max: 4}),
  risk: Object.freeze({min: -0.3, max: 0.3}),          // added to the reserve's appetite (PR 2): + risks more
  grudge: Object.freeze({min: 0, max: 1}),             // threat added to the seat that last hit it
  groupHug: Object.freeze({min: 0, max: 1}),           // how far it keeps off a seat the table is already hitting
  temperatureDelta: Object.freeze({min: -1, max: 1}),  // added to its level's temperature
  politics: Object.freeze(["join", "neutral", "avoid"]),
});

export const PERSONAS = Object.freeze([
  Object.freeze({
    schema: PERSONA_SCHEMA, id: "sable", name: "Sable", sex: "female", avatar: "assets/personas/sable.svg",
    blurb: "Plays the table like a grudge. Salty, relentless, remembers who hit her last.",
    disposition: Object.freeze({saltiness: 3, friendliness: -2, competitiveness: 2}),
    overrides: Object.freeze({saltCap: 4, grudge: 0.5, risk: -0.1, politics: "join"}),
    deckCriteria: Object.freeze({saltiness: 4, competitiveness: 4, speed: 3, playStyle: "Control"}),
  }),
  Object.freeze({
    schema: PERSONA_SCHEMA, id: "benny", name: "Benny", sex: "male", avatar: "assets/personas/benny.svg",
    blurb: "Everyone gets a card and a hug. Hits only what has to be stopped.",
    disposition: Object.freeze({saltiness: -2, friendliness: 2, competitiveness: -1}),
    overrides: Object.freeze({saltCap: -2, groupHug: 0.8, risk: 0.1, politics: "avoid"}),
    deckCriteria: Object.freeze({saltiness: 1, competitiveness: 2, speed: 2, playStyle: "Group Hug"}),
  }),
  Object.freeze({
    schema: PERSONA_SCHEMA, id: "marcus", name: "Marcus", sex: "male", avatar: "assets/personas/marcus.svg",
    blurb: "Plays to win, plays tight, plays the clock. Fair, never friendly.",
    disposition: Object.freeze({saltiness: 1, friendliness: 0, competitiveness: 2}),
    overrides: Object.freeze({saltCap: 1, risk: -0.15, politics: "neutral"}),
    deckCriteria: Object.freeze({saltiness: 3, competitiveness: 5, speed: 4, playStyle: "Combo"}),
  }),
  Object.freeze({
    schema: PERSONA_SCHEMA, id: "june", name: "June", sex: "female", avatar: "assets/personas/june.svg",
    blurb: "Here for the fun line. Takes the cool play over the best one.",
    disposition: Object.freeze({saltiness: -1, friendliness: 1, competitiveness: -1}),
    overrides: Object.freeze({saltCap: -1, temperatureDelta: 1, groupHug: 0.3, politics: "neutral"}),
    deckCriteria: Object.freeze({saltiness: 2, competitiveness: 2, speed: 2, playStyle: "Tribal"}),
  }),
]);

export const levelOf = (id) => LEVELS.find((l) => l.id === id) ?? null;
export const personaOf = (id) => PERSONAS.find((p) => p.id === id) ?? null;

/** The roster as the lobby reads it: plain data, the same as `data/ai-players/roster.json`. */
export function roster() {
  return JSON.parse(JSON.stringify({schema: ROSTER_SCHEMA, levels: LEVELS, personas: PERSONAS, dials: DIALS, overrideLimits: OVERRIDE_LIMITS}));
}

/**
 * A seat's difficulty and persona, as a table or a room will keep them: `level` one of the available levels (an unknown or
 * unavailable one falls to "normal", as a table always has), `persona` an id on the roster or null. A persona on a seat that
 * is not an AI is dropped.
 */
export function readSeatAi(seat) {
  const l = levelOf(seat?.level);
  const level = l && l.available ? l.id : "normal";
  const p = personaOf(seat?.persona);
  return {level, persona: p ? p.id : null};
}

/**
 * What a seat plays at: its level's saltiness cap, moved by its persona's `saltCap` (the one override that may raise it),
 * and the persona's other overrides within their limits. Pure over the roster; the pilots read it (PR 2 on).
 */
export function dispositionFor(levelId, personaId = null) {
  const l = levelOf(levelId) ?? levelOf("normal");
  const p = personaOf(personaId);
  const o = p?.overrides ?? {};
  const within = (v, lim, fallback) => (Number.isFinite(v) ? Math.max(lim.min, Math.min(lim.max, v)) : fallback);
  return {
    level: l.id, persona: p ? p.id : null,
    saltCap: within(o.saltCap, OVERRIDE_LIMITS.saltCap, l.saltCap),
    risk: within(o.risk, OVERRIDE_LIMITS.risk, 0),
    grudge: within(o.grudge, OVERRIDE_LIMITS.grudge, 0),
    groupHug: within(o.groupHug, OVERRIDE_LIMITS.groupHug, 0),
    temperatureDelta: within(o.temperatureDelta, OVERRIDE_LIMITS.temperatureDelta, 0),
    politics: OVERRIDE_LIMITS.politics.includes(o.politics) ? o.politics : "neutral",
    dials: p ? {...p.disposition} : null,
  };
}

/** Every reason a roster is not one this build can play, by name; empty when it is. Used by the suite and the generator. */
export function rosterProblems(r = roster()) {
  const bad = [];
  if (r.schema !== ROSTER_SCHEMA) bad.push(`the roster's schema is not ${ROSTER_SCHEMA}`);
  const ids = new Set();
  for (const l of r.levels ?? []) {
    if (ids.has(l.id)) bad.push(`level ${l.id} twice`);
    ids.add(l.id);
    if (!Number.isInteger(l.saltCap)) bad.push(`level ${l.id} has no whole saltCap`);
  }
  const names = new Set(), seen = new Set();
  for (const p of r.personas ?? []) {
    const at = `persona ${p.id}`;
    if (p.schema !== PERSONA_SCHEMA) bad.push(`${at} is not ${PERSONA_SCHEMA}`);
    if (!/^[a-z]{2,16}$/.test(p.id ?? "") || seen.has(p.id)) bad.push(`${at} needs its own lower-case id`);
    seen.add(p.id);
    if (!p.name || names.has(p.name)) bad.push(`${at} needs its own name`);
    names.add(p.name);
    if (p.sex !== "male" && p.sex !== "female") bad.push(`${at}'s sex is male or female`);
    if (!/^assets\/personas\/[a-z]+\.svg$/.test(p.avatar ?? "")) bad.push(`${at} names no avatar under assets/personas/`);
    if (!p.blurb || p.blurb.length > 90) bad.push(`${at}'s blurb is one short line (90 characters)`);
    for (const [dial, lim] of Object.entries(DIALS)) {
      const v = p.disposition?.[dial];
      if (!Number.isInteger(v) || v < lim.min || v > lim.max) bad.push(`${at}'s ${dial} is a whole number from ${lim.min} to ${lim.max}`);
    }
    for (const k of Object.keys(p.disposition ?? {})) if (!(k in DIALS)) bad.push(`${at} has a dial (${k}) the roster does not`);
    for (const [k, v] of Object.entries(p.overrides ?? {})) {
      const lim = OVERRIDE_LIMITS[k];
      if (!lim) bad.push(`${at} overrides ${k}, which a persona may not (information and person bias are never a persona's)`);
      else if (Array.isArray(lim) ? !lim.includes(v) : !(Number.isFinite(v) && v >= lim.min && v <= lim.max)) bad.push(`${at}'s ${k} is outside its limits`);
    }
    /* A persona's saltiness never exceeds the cap it names: a salty persona asks for the cap it needs. */
    const cap = p.overrides?.saltCap;
    if (Number.isInteger(cap) && p.disposition?.saltiness > cap) bad.push(`${at}'s saltiness ${p.disposition.saltiness} is above its own cap ${cap}`);
  }
  return bad;
}
