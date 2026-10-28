/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* Evidence read from the existing CommanderProbeEvent journal, never from instrumented rules. Presence, an offer,
   a copy resolving, and a fizzled spell are not proof that the card was cast and resolved. Statics, keywords and
   mana abilities without an unambiguous ability id stay unobserved; this ledger cannot certify G-3 by itself. */
export const EXERCISED_SCHEMA = "CrankCardExercised@1";

export function abilityInventory(script) {
  const out = [];
  const walk = (part, prefix = "") => {
    const face = part.identity?.name ?? script.identity.name;
    for (const [i, ability] of (part.abilities ?? []).entries()) out.push({
      path: `${prefix}abilities[${i}]`, runtimeId: ability.id ?? `a${i}`, face,
      kind: ability.kind, keyword: ability.keyword ?? null, text: ability.text ?? "", mana: ability.mana === true,
      activated: 0, triggered: 0, resolved: 0, scenarios: [], games: [],
    });
    for (const key of ["back", "adventure", "prepare"]) if (part[key]) walk(part[key], `${prefix}${key}.`);
  };
  walk(script);
  return out;
}

export function createExerciseLedger(scripts) {
  return {schema: EXERCISED_SCHEMA, games: [], scenarios: [], unattributed: [], cards: Object.fromEntries(scripts.map((script) => [script.identity.name,
    {singleFace: !script.back && !script.adventure && !script.prepare && (!script.layout || script.layout === "normal") && !script.identity.name.includes(" // "),
      cast: 0, played: 0, resolved: 0, exercised: 0, games: [], abilities: abilityInventory(script)}]))};
}

/* A face's name and the card's full name may both appear. If the journal cannot distinguish two face-local a0 ids,
   neither is credited. The ambiguity is retained for review, rather than resolved using the current object's face. */
function ownerOf(ledger, name) {
  if (ledger.cards[name]) return [name, ledger.cards[name]];
  const matches = Object.entries(ledger.cards).filter(([full, card]) => full.split(" // ").includes(name) || card.abilities.some((a) => a.face === name));
  return matches.length === 1 ? matches[0] : null;
}

/** Add only a passing scenario's journal or a clean game's journal. `clean` must be supplied by the game verdict. */
export function addExerciseEvidence(ledger, events, {game = null, scenario = null, clean = false} = {}) {
  if (game !== null && !clean) return false;
  if (game === null && scenario === null) throw new Error("Exercise evidence names a clean game or a passing scenario.");
  const casts = new Map(), successful = new Set();
  const addName = (list, name) => {if (!list.includes(name)) list.push(name);};
  const ability = (name, id, kind, event, matchedSpell = false) => {
    const owner = ownerOf(ledger, name);
    if (!owner) return;
    const [full, card] = owner;
    let method = "explicit-ability-id", matches;
    if (id === null || id === undefined) {
      /* Ordinary spell events currently omit spell.id. A successful resolution correlated to its actual cast can
         identify a single printed spell ability, but never a copy, unmatched event, or ambiguous face/ability. */
      if (kind !== "resolved" || !matchedSpell || !card.singleFace) return;
      matches = card.abilities.filter((a) => a.kind === "spell");
      method = "inferred-unique-printed-spell";
    } else matches = card.abilities.filter((a) => a.runtimeId === id && !a.mana && ["spell", "activated", "triggered"].includes(a.kind)
      && (name === full || a.face === name));
    if (matches.length !== 1) {
      ledger.unattributed.push({game, scenario, kind: event.kind, name, abilityId: id, reason: matches.length ? "ambiguous face-local ability id" : "no printed ability with that id"});
      return;
    }
    const hit = matches[0];
    hit[kind] += 1;
    (hit.observations ??= []).push({method, kind, game, scenario, stackId: event.data?.fields?.stackId ?? event.data?.fields?.sa?.stackId ?? null,
      eventId: event.eventId ?? null});
    if (scenario !== null) addName(hit.scenarios, scenario);
    if (game !== null) addName(hit.games, game);
  };
  for (const event of events) {
    const f = event?.data?.fields ?? {}, name = f.card?.name ?? f.land?.name;
    const owner = name ? ownerOf(ledger, name) : null;
    if (!owner) continue;
    const [full, card] = owner;
    if (event.kind === "GameEventLandPlayed") {
      if (game !== null) {card.played += 1; card.resolved += 1; successful.add(full);}
    } else if (event.kind === "GameEventSpellAbilityCast") {
      if (f.sa?.isSpell === true) {
        if (Number.isInteger(f.sa.stackId)) casts.set(f.sa.stackId, full);
        if (game !== null) card.cast += 1;
      } else if (f.sa?.isSpell === false) ability(name, f.sa.abilityId, "activated", event);
    } else if (event.kind === "GameEventSpellResolved") {
      if (f.hasFizzled !== false) continue;
      const matchedSpell = f.kind === "spell" && casts.get(f.stackId) === full;
      if (matchedSpell && game !== null) {
        card.resolved += 1; successful.add(full);
      }
      if (f.kind === "trigger") ability(name, f.abilityId, "triggered", event);
      ability(name, f.abilityId, "resolved", event, matchedSpell);
    }
  }
  if (game !== null) {
    addName(ledger.games, game);
    for (const name of successful) {ledger.cards[name].exercised += 1; addName(ledger.cards[name].games, game);}
  }
  if (scenario !== null) addName(ledger.scenarios, scenario);
  return true;
}

export function exerciseSummary(ledger) {
  const cards = Object.entries(ledger.cards), unreached = [], scenarioUnreached = [];
  let abilities = 0, reached = 0, scenarioReached = 0, counterfactualReached = 0;
  for (const [name, card] of cards) for (const a of card.abilities) {
    abilities += 1;
    const proof = a.counterfactual?.some((p) => p.status === "proved" && p.baseline?.status === "passed" && p.result?.status === "failed") === true;
    if (proof) counterfactualReached += 1;
    if (proof || (a.resolved > 0 && a.scenarios.length > 0)) scenarioReached += 1;
    else scenarioUnreached.push({card: name, path: a.path, kind: a.kind, reason: "no passing scenario has execution or runtime-removal behavior proof"});
    /* Successful resolution is stronger than an activation whose effect never happened. */
    if (a.resolved > 0 || proof) reached += 1;
    else unreached.push({card: name, path: a.path, kind: a.kind,
      reason: a.mana || ["static", "keyword", "replacement"].includes(a.kind) ? "no unambiguous application event observed" : "no successful resolution observed"});
  }
  return {final: cards.length, exercised: cards.filter(([, card]) => card.exercised > 0).length,
    neverExercised: cards.filter(([, card]) => card.exercised === 0).map(([name]) => name),
    abilities, reached, scenarioReached, counterfactualReached, unreached, scenarioUnreached,
    complete: unreached.length === 0, scenarioComplete: scenarioReached === abilities};
}
