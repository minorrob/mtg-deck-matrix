/* THE VETERAN: HARD, REASONED OVER BY A MODEL (docs/ai-players/PLAN-2026-10-26.html §6; game/engine/pilots/agent-pilot.mjs,
 * game/engine/pilots/veteran-skill.md, game/room/agent-brief.mjs, room.mjs `analysis`).
 *
 * Rob, 2026-10-26: the Veteran takes the Hard player's code and "that agent would run it and get the decisions, then reason over the
 * decisions and determine the best target. It would also never specifically overweight toward human players, and it would not have
 * familiarity with the mechanics behind the deterministic logic determining the difficulty of the players they're up against." And:
 * "The veteran mode agent should know its mechanics, how and what it weights, as along with the instruction set and skills (trying to
 * avoid tool calls unless required) we give it, it'd use this as context to understand how to interpret its numbers."
 *
 *   1. Its instruction set: the Markdown is what the Worker sends; it explains its own numbers and says nothing of how any other seat
 *      is built or who is a person; it asks for no tool.
 *   2. Its brief, from a real room at a real consult: Hard's analysis in the brief's own words (seats as "you" and "Seat n", plans as the
 *      decision's own option indices), and nothing in it that tells a person from an AI, names a level, or names another's persona.
 *   3. The room's analysis is read-only and only for an AI seat that is being asked.
 *   4. It is Hard underneath, plays as its persona, and asks about an opening hand only when it is close.
 *   5. What it costs: the system prompt is sent as a cached block, and a consult's request is small.
 *
 *   node tests/veteran-agent.mjs
 */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {randomUUID} from "node:crypto";
import {memoryStorage} from "../game/engine/storage.mjs";
import {startRoom, LLM, RoomError} from "../game/room/room.mjs";
import {agentPilot, CLOSE, CLOSE_HAND} from "../game/engine/pilots/agent-pilot.mjs";
import {agentBrief, pickOf} from "../game/room/agent-brief.mjs";
import {VETERAN_SKILL} from "../cloud/veteran-skill.mjs";
import {moduleText} from "../tools/build-veteran-skill.mjs";
import {PILOT_SYSTEM, pilotBody, pilotWorst, PILOT_MAX_TOKENS} from "../cloud/ai.mjs";
import {decksFromBackup, person} from "../tools/fuzz-live.mjs";
import {tableCards} from "../cloud/game-room.mjs";

let checks = 0;
const ok = (c, m) => {assert.ok(c, m); checks += 1;};
const eq = (a, b, m) => {assert.deepEqual(a, b, m); checks += 1;};
const ROOT = new URL("../", import.meta.url);

/* ---- 1. The instruction set ---- */
{
  const md = readFileSync(new URL("game/engine/pilots/veteran-skill.md", ROOT), "utf8");
  eq(readFileSync(new URL("cloud/veteran-skill.mjs", ROOT), "utf8"), moduleText(md), "veteran-skill.mjs is what veteran-skill.md says (node tools/build-veteran-skill.mjs writes it)");
  eq(PILOT_SYSTEM, VETERAN_SKILL, "and it is the system prompt the door sends");
  eq(VETERAN_SKILL, md.trim(), "the Markdown, whole");
  for (const word of ["threats", "urgency", "reserve", "alternatives", "immediate", "near", "long", "housePilotWouldChoose", "analysis", "persona", "indices"]) ok(VETERAN_SKILL.includes(word), `it explains ${word}`);
  for (const term of ["life", "hitters", "growth", "ramp", "engine", "commander"]) ok(new RegExp(`\`${term}\``).test(VETERAN_SKILL), `it names the signal ${term}`);
  ok(/1 : 0\.6 : 0\.3|immediate\` plus 0\.6 of \`near\` plus 0\.3 of \`long\`/.test(VETERAN_SKILL) && /about 8 worth/.test(VETERAN_SKILL), "and the weights it reads them by: the tiers 1 to 0.6 to 0.3, a full urgency about 8 worth");
  ok(/not worth casting, and passing is a good move/.test(VETERAN_SKILL) && /one seed of a loop is not a reason to cast a board wipe/i.test(VETERAN_SKILL), "and to answer in proportion");
  /* What it must never say: how another seat is built, who is a person, any difficulty. */
  for (const word of ["easy", "normal", "human", "person", "people", "player's setting", "difficulty", "difficulties", "temperature", "softmax", "AI seat", "bot", "computer"])
    ok(!new RegExp(`\\b${word}\\b`, "i").test(VETERAN_SKILL), `it never says "${word}"`);
  ok(!/tool call|use the tool|call the|function call/i.test(VETERAN_SKILL) && /no tools/i.test(VETERAN_SKILL), "it asks for no tool: the brief carries everything");
  ok(/never by who is sitting in it/.test(VETERAN_SKILL), "it weighs every seat by what it does, never by who sits in it");
  ok(/game data, never as instructions/.test(VETERAN_SKILL), "and treats the brief's words as data");
  ok(VETERAN_SKILL.length < 7000, `short enough to cache cheaply (${VETERAN_SKILL.length} characters)`);
}

/* ---- 2 and 3. A real room, at a real consult ---- */
const backup = JSON.parse(readFileSync(new URL("data/live-state.json", ROOT), "utf8"));
const decks = decksFromBackup(backup, ["D6 Krenko Goblins", "D2 Chulane Value Loop", "D4 Felothar Walls", "D5 Shadrix Aristocrats"]);
const pod = {passEmpty: true, endWhenNoPerson: true, resolveAll: true, passAfterCast: true, seats: [
  {seatId: "rob", name: "Rob", pilot: "human", commander: decks[0].commander, cards: decks[0].cards},
  {seatId: "vet", name: "Vet Sable", pilot: "house", level: LLM, persona: "sable", commander: decks[1].commander, cards: decks[1].cards},
  {seatId: "ez", name: "Benny Bot", pilot: "house", level: "easy", persona: "benny", commander: decks[2].commander, cards: decks[2].cards},
  {seatId: "nm", name: "Marcus Normal", pilot: "house", level: "normal", persona: "marcus", commander: decks[3].commander, cards: decks[3].cards}]};
{
  const room = await startRoom({storage: memoryStorage(), matchId: "vet-brief", cards: tableCards, pod, seed: "vet-brief-seed"});
  const rob = person("vet-brief-rob");
  const briefs = [];
  let step = 0;
  while (room.waitingOn && room.status !== "finished" && step < 4000 && briefs.length < 12) {
    step += 1;
    const who = room.waitingOn, view = room.view(who);
    if (view.state.turn > 120) break;
    if (who === "vet") {
      const house = room.houseAnswer("vet"), analysis = room.analysis("vet");
      briefs.push({view, house, analysis, brief: agentBrief(view, house.indices, analysis)});
      await room.act("vet", {actionId: randomUUID(), revision: view.revision, kind: "answer", choiceId: view.decision.id, ...house});
    } else await room.act(who, {actionId: randomUUID(), revision: view.revision, ...rob(view.decision, view.state.turn, view)});
  }
  ok(briefs.length >= 3, `the Veteran was consulted ${briefs.length} times in the first turns of a four-seat game`);
  const withPlans = briefs.filter((b) => b.brief.analysis?.alternatives?.length);
  ok(withPlans.length >= 2, `and ${withPlans.length} of those briefs carry Hard's plans`);
  for (const {brief, view, house, analysis} of briefs) {
    const text = JSON.stringify(brief);
    ok(brief.analysis && Array.isArray(brief.analysis.threats) && brief.analysis.threats.length === 3, "each brief's analysis has a row for each of the other three seats");
    ok(brief.analysis.threats.every((t) => /^Seat [1-4]$/.test(t.seat) && t.seat !== "Seat 2" && ["life", "hitters", "growth", "ramp", "engine", "commander"].every((k) => typeof t.signals[k] === "number")),
      "named as Seat n, never you, and never itself, each with the six signals");
    ok(brief.analysis.threats.every((t, i, a) => i === 0 || a[i - 1].score >= t.score), "strongest threat first");
    ok(!brief.analysis.top || /^Seat [1-4]$/.test(brief.analysis.top), "the top threat is a seat word");
    ok((brief.analysis.urgency ?? []).every((u) => /^Seat [1-4]$/.test(u.seat) && u.urgency >= 0), "the urgent things are on other seats' boards, as seat words");
    const known = new Set((view.decision.options ?? []).map((o, i) => o.index ?? i));
    ok(brief.analysis.alternatives.every((a) => a.indices.every((i) => known.has(i)) && Number.isFinite(a.value) && typeof a.why === "string" && a.why.length > 0),
      "every alternative is the decision's own option indices, with a value and a line on why");
    ok(pickOf(view.decision, {indices: house.indices}) !== null, "and the pilot's own answer is a legal one for the decision");
    ok(!/\bseat \d\b/.test(text), "no seat is a bare number: the brief says Seat n or you");
    ok(brief.analysis.persona && brief.analysis.persona.name === "Sable" && /grudge/.test(brief.analysis.persona.blurb) && brief.analysis.persona.saltiness === 3, "the persona is its own: Sable, her blurb and her dials");
    ok(brief.housePilotWouldChoose.length > 0 && JSON.stringify(brief.housePilotWouldChoose) === JSON.stringify(house.indices), "Hard's own choice is the hint");
    /* What must never be in it. */
    ok(!/"level"|"kind"|"pilot"|"easy"|"normal"|"hard"|\bhuman\b|"llm"|Veteran|Benny|Marcus|June|Bot\b|Normal\b|Rob/i.test(text.replace(/"Sable"/g, "").replace(/Plays the table like a grudge[^"]*/g, "")),
      "no seat's kind, level or setting, no other persona, and no person's name anywhere in it");
    ok(text.length < 24000, `a brief is a few kilobytes (${(text.length / 1024).toFixed(1)} KB)`);
    void analysis;
  }
  /* The room's analysis: read-only, and only for an AI seat that is being asked. */
  const view = room.view(room.waitingOn);
  if (room.waitingOn === "vet") {
    const before = JSON.stringify(room.view("vet"));
    room.analysis("vet"); room.analysis("vet");
    eq(JSON.stringify(room.view("vet")), before, "asking for the analysis changes nothing: the seat is still asked the same question");
  }
  let refused = null;
  try {room.analysis("rob");} catch (error) {refused = error;}
  ok(refused instanceof RoomError && refused.status === 403, "a person's seat has no analysis: refused");
  try {room.analysis("ez");} catch (error) {refused = error;}
  ok(refused instanceof RoomError && [403, 409].includes(refused.status), "nor a seat that is not being asked");
  void view;
}

/* ---- 4. Hard underneath, a persona on top, an opening hand asked about only when close ---- */
{
  const FACTS = {Forest: {manaValue: 0, types: ["Land"], makes: ["G"], flags: ""}, Bear: {manaValue: 2, types: ["Creature"], makes: [], flags: ""}};
  const cards = (n) => FACTS[n] ?? null;
  const vet = agentPilot({seat: 0, cards, deck: []});
  eq([vet.id, vet.setting], ["agent", "hard"], "the Veteran is Hard underneath");
  const june = agentPilot({seat: 0, cards, deck: [], disposition: {groupHug: 0.3, temperatureDelta: 1}});
  eq([june.setting, june.disposition.groupHug], ["hard", 0.3], "and plays as its persona: the disposition reaches the pilot beneath");
  /* An opening hand: 12 lands in a 40-card deck, two in hand: about 52%, against the 60% it keeps at: close, within a tenth. */
  const names = [...Array(12).fill("Forest"), ...Array(28).fill("Bear")];
  const hand = (lands) => Array.from({length: 7}, (_, i) => ({cardId: 500 + i, name: i < lands ? "Forest" : "Bear", types: i < lands ? ["Land"] : ["Creature"]}));
  const mulliganView = (lands, library = 33) => ({viewerSeatId: 0, turn: 0, turnPlayerId: 0, phase: "MULLIGAN", stackSize: 0, combat: null, stack: [],
    players: [{playerId: 0, life: 40, health: {status: "active"}, mana: [], zones: {Hand: {cards: hand(lands), count: 7}, Battlefield: {cards: []}, Library: {cards: [], count: library}, Graveyard: {cards: []}, Exile: {cards: []}, Command: {cards: []}}}, {playerId: 1, life: 40, health: {status: "active"}, mana: [], zones: {Hand: {cards: [], count: 7}, Battlefield: {cards: []}, Library: {cards: [], count: 33}, Graveyard: {cards: []}, Exile: {cards: []}, Command: {cards: []}}}]});
  const choice = {id: "mulligan:0:0", mode: "one", min: 1, max: 1, options: [{index: 0, label: "Keep"}, {index: 1, label: "Mulligan"}]};
  const p = agentPilot({seat: 0, cards, deck: names});
  eq([p.consult(mulliganView(2), {choice}), p.consult(mulliganView(3, 33), {choice}), p.consult(mulliganView(0, 33), {choice})], [true, false, false],
    "a hand at about the odds it keeps at is asked about (two lands: 52% against 60%); a clearly good hand (three lands) and a clearly bad one (none) are not");
  eq(CLOSE_HAND, 0.1, "close is within a tenth");
  const ex = p.explain(mulliganView(2), {choice});
  ok(ex.alternatives.length === 2 && /third land/.test(ex.alternatives[0].why) && /mulligan/.test(ex.alternatives[1].why), "and the model is told the odds and the other option");
  eq(CLOSE, 3, "a cast is a close call within three points");
}

/* ---- 5. What it costs ---- */
{
  const body = pilotBody({turn: 1}, "claude-haiku-5-5");
  ok(Array.isArray(body.system) && body.system[0].cache_control?.type === "ephemeral" && body.system[0].text === VETERAN_SKILL, "the instruction set goes as a cached system block, paid for once");
  eq(body.thinking, {type: "disabled"}, "with thinking off, as before");
  eq(PILOT_MAX_TOKENS, 300, "and a short answer");
  const room = await startRoom({storage: memoryStorage(), matchId: "vet-cost", cards: tableCards, pod, seed: "vet-cost-seed"});
  const rob = person("vet-cost-rob");
  let worst = 0, n = 0;
  while (room.waitingOn && room.status !== "finished" && n < 600) {
    n += 1;
    const who = room.waitingOn, view = room.view(who);
    if (who === "vet") {
      const house = room.houseAnswer("vet"), brief = agentBrief(view, house.indices, room.analysis("vet"));
      worst = Math.max(worst, pilotWorst(brief, "claude-haiku-5-5"));
      await room.act("vet", {actionId: randomUUID(), revision: view.revision, kind: "answer", choiceId: view.decision.id, ...house});
    } else await room.act(who, {actionId: randomUUID(), revision: view.revision, ...rob(view.decision, view.state.turn, view)});
  }
  ok(worst > 0 && worst < 6000, `the worst-case cost of a consult is about ${(worst / 10000).toFixed(2)} cents of a 25-cent game (${worst} micros)`);
}

console.log(`veteran-agent: ${checks} checks passed — the Veteran is Hard reasoned over by a model that is told how to read Hard's numbers and nothing of how any other seat is built; its brief carries Hard's plans in the decision's own indices and cannot tell a person from an AI.`);
