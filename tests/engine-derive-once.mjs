/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* EACH OBJECT DERIVED ONCE PER QUESTION (the plan's X5 train; engine-room-games on 2026-10-03).
 *
 * Deriving an object's characteristics asks about others: a static's condition counts permanents (Anger, from a
 * graveyard: "as long as you control a Mountain"), a counted power counts creatures (Adeline). Each of those is derived
 * in turn, and each derivation asked the same questions again. With Anger in a graveyard and Adeline on a board of 57
 * permanents, one projection derived the board hundreds of thousands of times, and a four-seat game in the room took
 * seconds a step (seed 1 of engine-room-games never finished). Now a derivation, and any question that only reads and
 * asks many (a projection, the offers, the question being asked, the state-based actions' check), derives each object
 * once per guard level and gathers the effects in play once (rules/layers.mjs, `deriving`).
 *
 * What must hold: the answers are the same as without the memo, on a board where the guard levels differ (an object
 * derived inside a condition, or inside a count, leaves something out); the questions that only read change nothing;
 * an answer handed out is a copy; and the work is linear in the board, not cubic. The state-based actions now read the
 * board once and act on what they found (CR 704.3): a creature only a death in that check brings down dies in the next
 * check of the same call.
 */
import assert from "node:assert/strict";
import {createState, addObject} from "../game/engine/state/index.mjs";
import {characteristicsOf, deriving, deriveMemo, keywordsOf, powerOf, typesOf, controllerOf} from "../game/engine/rules/layers.mjs";
import {legalActions, nothingToDo, applyAction} from "../game/engine/rules/actions.mjs";
import {beginGame, advance, awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";
import {checkStateBasedActions, gameOver} from "../game/engine/rules/sba.mjs";
import {beginMulligans, mulligansDone} from "../game/engine/rules/mulligan.mjs";
import {projectFor} from "../game/engine/projection.mjs";
import {hashState} from "../game/engine/journal.mjs";
import {createRng} from "../game/engine/rng.mjs";
import {housePilot} from "../game/engine/pilots/house-pilot.mjs";
import {leastAnswer} from "../game/room/room.mjs";
import {commanderLegal} from "../game/room/table.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const card = (name) => ({...index.definition(name), card: name});
const MOUNTAIN = {card: "Mountain", types: ["Land"], supertypes: ["Basic"], subtypes: ["Mountain"], abilities: [{id: "a0", kind: "mana", tapSelf: true, produces: {R: 1}}]};
const BEAR = {card: "Bear", types: ["Creature"], subtypes: ["Bear"], manaCost: "{1}{G}", colors: ["G"], power: 2, toughness: 2};
const without = (fn) => { deriveMemo.off(true); try { return fn(); } finally { deriveMemo.off(false); } };

/* Where the guard levels change an answer. Inside a condition the conditional statics are left out, and inside a count
   the counted changes are (rules/layers.mjs, holdsNow and counted): a memo that forgot which level an answer was derived
   at would hand one level's answer to the other. The Statue is a creature only while Rob controls a Mountain -- a
   conditional static, so not inside a condition; the Captain gets +3/+3 while Rob controls 26 creatures, which he does
   only if the Statue counts; the Champion gets +1/+1 for each creature of Rob's with power 4 or greater, which Adeline
   is only outside a count; and the Rager's counted bonus gives it trample too. Three are legendary, for the legend
   rule's check. */
const STATUE = {card: "Statue", types: ["Artifact"], manaCost: "{3}", colors: [], power: 3, toughness: 3, abilities: [{id: "a0", kind: "static", text: "As long as you control a Mountain, this is a creature.",
  layer: 4, affects: {self: true}, apply: {addTypes: ["Creature"]}, condition: {present: {what: "permanent", subtypes: ["Mountain"], controller: "you"}}}]};
const CAPTAIN = {card: "Captain", types: ["Creature"], supertypes: ["Legendary"], manaCost: "{2}{W}", colors: ["W"], power: 2, toughness: 2, abilities: [{id: "a0", kind: "static", text: "As long as you control twenty-six or more creatures, this gets +3/+3.",
  layer: 7, sublayer: "c", affects: {self: true}, apply: {power: 3, toughness: 3}, condition: {present: {what: "permanent", types: ["Creature"], controller: "you"}, atLeast: 26}}]};
const CHAMPION = {card: "Champion", types: ["Creature"], supertypes: ["Legendary"], manaCost: "{1}{G}", colors: ["G"], power: 1, toughness: 1, abilities: [{id: "a0", kind: "static", text: "This gets +1/+1 for each creature you control with power 4 or greater.",
  layer: 7, sublayer: "c", affects: {self: true}, apply: {power: {count: {what: "permanent", types: ["Creature"], controller: "you", power: {min: 4}}}, toughness: {count: {what: "permanent", types: ["Creature"], controller: "you", power: {min: 4}}}}}]};
const RAGER = {card: "Rager", types: ["Creature"], supertypes: ["Legendary"], manaCost: "{R}", colors: ["R"], power: 1, toughness: 1, abilities: [{id: "a0", kind: "static", text: "This gets +1/+0 for each creature you control and has trample.",
  layer: 7, sublayer: "c", affects: {self: true}, apply: {power: {count: {what: "permanent", types: ["Creature"], controller: "you"}}, addKeywords: ["Trample"]}}]};

/* The board that never finished: Anger in Rob's graveyard and a Mountain, so his creatures have haste -- but not when
   they are derived inside Anger's own condition; Adeline and Psychosis Crawler, whose power counts -- but not when they
   are derived inside a count; and forty creatures. With them, the four above. */
function board({mountain = true, mountainFirst = false, fixtures = true} = {}) {
  const s = createState({matchId: "derive", seed: "derive", players: [{name: "Rob"}, {name: "Maya"}]});
  const put = (o, seat, zone) => addObject(s, {...o, owner: seat, controller: seat}, zone, zone === "battlefield" ? null : seat);
  put(card("Anger"), 0, "graveyard");
  if (mountainFirst) put(MOUNTAIN, 0, "battlefield");
  put(card("Adeline, Resplendent Cathar"), 0, "battlefield");
  put(card("Psychosis Crawler"), 0, "battlefield");
  put(card("Psychosis Crawler"), 1, "battlefield");
  for (let i = 0; i < 20; i += 1) { put(BEAR, 0, "battlefield"); put(BEAR, 1, "battlefield"); }
  if (fixtures) for (const fixture of [STATUE, CAPTAIN, CHAMPION, RAGER]) put(fixture, 0, "battlefield");
  for (let i = 0; i < 3; i += 1) put(BEAR, 0, "hand");
  /* The Mountain last: Anger's condition looks at every permanent before it finds one. */
  if (mountain && !mountainFirst) put(MOUNTAIN, 0, "battlefield");
  return s;
}
const all = (s) => Object.keys(s.objects).map(Number).map((id) => [id, characteristicsOf(s, id)]);
/* The same answers in one question whatever order it asks them in, and whichever it asks first: a type, then the whole. */
const ORDERS = (ids) => [ids, [...ids].reverse(), ids.filter((_, i) => i % 2).concat(ids.filter((_, i) => i % 2 === 0)), [...ids].sort((a, b) => ((a * 7919) % 101) - ((b * 7919) % 101))];
const parts = (s, id) => ({types: typesOf(s, id), controller: controllerOf(s, id), keywords: keywordsOf(s, id)});

{
  const s = board();
  const [adeline] = s.zones.battlefield.filter((id) => s.objects[id].card === "Adeline, Resplendent Cathar");
  const [bear] = s.zones.battlefield.filter((id) => s.objects[id].card === "Bear");
  const named = (name) => s.zones.battlefield.find((id) => s.objects[id].card === name);
  eq([powerOf(s, adeline), keywordsOf(s, bear).includes("Haste"), typesOf(s, named("Statue")).includes("Creature")], [26, true, true],
    "Adeline counts Rob's 26 creatures, the Statue one of them; Anger gives his Bear haste");
  eq([powerOf(s, named("Captain")), powerOf(s, named("Champion")), keywordsOf(s, named("Rager")).includes("Trample")], [2, 1, true],
    "inside the Captain's condition the Statue is no creature (25), inside the Champion's count Adeline's power is uncounted, and the Rager has trample");
  const ids = Object.keys(s.objects).map(Number);
  const truth = new Map(without(() => ids.map((id) => [id, {...parts(s, id), whole: characteristicsOf(s, id)}])));
  eq(deriving(s, () => all(s)), all(s).map(([id]) => [id, truth.get(id).whole]), "every object, derived in one question with the memo, is what it is without it -- haste and counts and all");
  for (const order of ORDERS(ids)) {
    /* A type, a controller and keywords first, for every object; then the whole of each. */
    const got = deriving(s, () => ({first: order.map((id) => [id, parts(s, id)]), then: order.map((id) => [id, characteristicsOf(s, id)])}));
    for (const [id, answer] of got.first) assert.deepEqual(answer, {types: truth.get(id).types, controller: truth.get(id).controller, keywords: truth.get(id).keywords}, `object ${id}, asked in another order`);
    for (const [id, answer] of got.then) assert.deepEqual(answer, truth.get(id).whole, `object ${id}, its whole after its type`);
  }
  checks += 1;
  const maya = board({mountain: false});
  eq(deriving(maya, () => all(maya)), without(() => all(maya)), "and with no Mountain, Anger's condition false");

  /* The work: linear in the board. */
  deriveMemo.reset();
  projectFor(s, 0);
  const memoized = deriveMemo.count();
  deriveMemo.reset();
  without(() => projectFor(s, 0));
  const unmemoized = deriveMemo.count();
  const n = s.zones.battlefield.length;
  ok(memoized <= 4 * Object.keys(s.objects).length, `a projection of ${n} permanents makes ${memoized} derivations: each object once per guard level`);
  ok(unmemoized > 50 * memoized, `without the memo it made ${unmemoized}`);
  const made = (fn) => { deriveMemo.reset(); fn(); return deriveMemo.count(); };
  /* A Bear's type asks Anger's condition of every permanent: each derived once, and without its counted amounts --
     Adeline's and the Crawlers' power, which would count the board again. */
  const typed = made(() => typesOf(s, bear)), controlled = made(() => controllerOf(s, bear));
  ok(typed <= n + 2 && controlled <= n + 2, `the Bear's type: ${typed} derivations for ${n} permanents; its controller: ${controlled}`);
  Object.assign(s, {turn: 1, activePlayer: 0, priorityPlayer: 0, phase: "MAIN1"});
  const offered = made(() => legalActions(s, 0)), checked = made(() => checkStateBasedActions(structuredClone(s)));
  ok(offered <= 2 * Object.keys(s.objects).length && checked <= 15 * Object.keys(s.objects).length, `Rob's offers: ${offered} derivations; the state-based check: ${checked}`);
  /* "You control a Mountain" stops at the first: with it first on the battlefield, a type asks about one permanent (the
     Captain's condition, which counts creatures, aside). */
  const early = board({mountainFirst: true, fixtures: false});
  const earlyBear = early.zones.battlefield.find((id) => early.objects[id].card === "Bear");
  ok(made(() => typesOf(early, earlyBear)) <= 3, "with the Mountain first, Anger's condition looks no further");

  /* What it hands out is a copy. */
  const first = deriving(s, () => { const c = characteristicsOf(s, bear); c.keywords.push("Flying"); c.power = 99; return characteristicsOf(s, bear); });
  eq([first.power, first.keywords.includes("Flying")], [2, false], "an answer edited by its caller is not the next caller's answer");
}
{
  /* The state-based actions read the board once, then act (CR 704.3). Lord dies to lethal damage; the Bear it made a 3/3
     has 2 damage, lethal only once the Lord is gone: it dies in the next check of the same call, after the Lord. */
  const s = createState({matchId: "sba", seed: "sba", players: [{name: "Rob"}, {name: "Maya"}]});
  const LORD = {card: "Lord", types: ["Creature"], manaCost: "{1}{W}", colors: ["W"], power: 1, toughness: 1,
    abilities: [{id: "a0", kind: "static", text: "Other creatures you control get +1/+1.", layer: 7, sublayer: "c", affects: {what: "permanent", types: ["Creature"], controller: "you", another: true}, apply: {power: 1, toughness: 1}}]};
  const lord = addObject(s, {...LORD, owner: 0, controller: 0}, "battlefield");
  const bear = addObject(s, {...BEAR, owner: 0, controller: 0}, "battlefield");
  s.objects[lord].damage = 1;
  s.objects[bear].damage = 2;
  const events = checkStateBasedActions(s);
  eq(events.filter((e) => e.kind === "GameEventCardChangeZone").map((e) => e.data.fields.card.name), ["Lord", "Bear"], "the Lord dies, then the Bear it held up -- one call, two checks");
  eq(s.zones.battlefield.length, 0, "both gone");
}
{
  /* Whole games: at every step, the projection and the offers are what they are without the memo, and asking them --
     and the question being asked -- changes nothing. Two four-seat games of house pilots on random definitions. */
  const playable = index.names.filter((n) => index.resolve(n)?.playable === true);
  const defs = new Map(playable.map((n) => [n, index.definition(n)]));
  const isLand = (d) => (d.types ?? []).includes("Land");
  const spells = playable.filter((n) => { const d = defs.get(n); return !isLand(d) && d.manaCost && !(d.types ?? []).includes("Planeswalker"); });
  const lands = playable.filter((n) => isLand(defs.get(n)));
  const commanders = playable.filter((n) => commanderLegal(defs.get(n)));
  const BASICS = ["Plains", "Island", "Swamp", "Mountain", "Forest"];
  const basicLand = (name) => ({types: ["Land"], supertypes: ["Basic"], subtypes: [name], abilities: [{id: "a0", kind: "mana", tapSelf: true, produces: {[{Plains: "W", Island: "U", Swamp: "B", Mountain: "R", Forest: "G"}[name]]: 1}}]});
  const cardOf = (name) => (BASICS.includes(name) ? basicLand(name) : defs.get(name));
  let compared = 0;
  for (const seed of [1, 2]) {
    const r = createRng(`derive-${seed}`);
    const pick = (list) => list[r.int(list.length)];
    const state = createState({matchId: `d${seed}`, seed: `derive-${seed}`, players: ["Rob", "Maya", "Trey", "Sam"].map((name) => ({name}))});
    for (let seat = 0; seat < 4; seat += 1) {
      const put = (name, zone) => addObject(state, {...cardOf(name), card: name, owner: seat, controller: seat, ...(zone === "command" ? {commander: true} : {})}, zone, seat);
      put(pick(commanders), "command");
      for (let i = 0; i < 26; i += 1) put(pick(spells), "library");
      for (let i = 0; i < 4; i += 1) put(pick(lands), "library");
      for (let i = 0; i < 30; i += 1) put(pick(BASICS), "library");
    }
    const manaValue = (cost) => (String(cost || "").match(/\{([^}]+)\}/g) || []).reduce((n, sym) => n + (/^\d+$/.test(sym.slice(1, -1)) ? Number(sym.slice(1, -1)) : sym === "{X}" ? 0 : 1), 0);
    const facts = (name) => { const d = cardOf(name); return d ? {manaValue: manaValue(d.manaCost), types: d.types ?? [], power: d.power ?? null, toughness: d.toughness ?? null} : null; };
    const pilots = [0, 1, 2, 3].map((seat) => housePilot({seat, cards: facts}));
    const rng = createRng(`derive-game-${seed}`);
    /* Asked as the room asks, and compared: the same answer without the memo, and the game unchanged by asking. */
    const asked = (label, fn) => {
      if (state.stepIndex === undefined || (compared += 1) % 4 !== 0) return fn();
      const before = hashState(state);
      const memoized = fn();
      assert.equal(hashState(state), before, `seed ${seed}: asking ${label} changed the game`);
      assert.deepEqual(memoized, without(fn), `seed ${seed}, turn ${state.turn}: ${label} differs without the memo`);
      return memoized;
    };
    const answer = (seat) => {
      const choice = asked("the question", () => awaitingChoice(state));
      const a = pilots[seat].answer(asked("the projection", () => projectFor(state, seat)), choice);
      try { return resolveAwaiting(state, a.indices, a.amounts, rng, a); } catch {
        const least = leastAnswer(choice);
        return resolveAwaiting(state, least.indices, least.amounts, rng, least);
      }
    };
    beginMulligans(state, rng);
    for (let n = 0; n < 200 && !mulligansDone(state); n += 1) answer(state.awaiting.player);
    beginGame(state);
    for (let steps = 0; state.turn <= 14 && !gameOver(state) && steps < 20000; steps += 1) {
      if (state.awaiting) { answer(state.awaiting.player); continue; }
      if (state.priorityPlayer === null) { advance(state); continue; }
      const seat = state.priorityPlayer;
      const actions = asked("the offers", () => legalActions(state, seat));
      asked("whether there is nothing to do", () => nothingToDo(state, seat, actions));
      const chosen = pilots[seat].choose(asked("the projection", () => projectFor(state, seat)), actions);
      if (chosen.kind === "pass") { const out = passPriority(state, null, rng); if (out.outcome === "step-ends") advance(state); }
      else applyAction(state, seat, chosen);
    }
  }
  ok(compared > 1000, `${compared} questions asked across two games of 14 turns, every fourth checked: it changed nothing, and was the same without the memo`);
}

console.log(`engine-derive-once: ${checks} checks passed -- each object derived once per question and guard level, the same answers as without the memo, questions that only read change nothing, answers handed out as copies, and the state-based actions reading the board once before acting.`);
