/* THE AI ROSTER AND ITS PERSONAS (docs/ai-players/PLAN-2026-10-26.html §3 and §7; game/engine/pilots/roster.mjs).
 *
 * Rob, 2026-10-26: "When choosing an AI player, you choose their difficulty, and then you choose their personality, and it
 * will be a persona. They'll have a name, a short description ... male or female ... an avatar ... indications of their
 * degree of saltiness, friendliness ... These can override some of the presets and the difficulties." Hugginess is folded
 * into friendliness: three dials.
 *
 *   1. The roster is one a build can play: levels, four personas on three whole-number dials within their ranges, each
 *      male or female with a one-line blurb and an avatar on disk, every override within its limits.
 *   2. The validator refuses what a persona may never do: override information or person bias, a dial out of range, a
 *      saltiness above the cap it names, a blurb that is a paragraph, a missing avatar.
 *   3. The browser's copy (data/ai-players/roster.json) is what the module says.
 *   4. Dispositions: Easy and Normal are capped at -1 on saltiness and Hard at 0; only a persona's saltCap moves a cap, and
 *      its overrides are held to their limits whatever a roster says.
 *   5. A seat names a level and a persona and nothing else rides the wire: an unknown persona or an unavailable level is
 *      dropped (to none, and to Normal), a person's seat carries neither.
 *   6. The table keeps a persona with its seat from the new-table request to the view the lobby reads and the launched
 *      room, and the room's pilot is made with it.
 *
 *   node tests/ai-personas.mjs
 */
import assert from "node:assert/strict";
import {existsSync, readFileSync} from "node:fs";
import {memoryStorage} from "../game/engine/storage.mjs";
import {startRoom, seatPilot} from "../game/room/room.mjs";
import {tableOn} from "../game/room/table.mjs";
import {LEVELS, PERSONAS, DIALS, OVERRIDE_LIMITS, roster, rosterProblems, readSeatAi, dispositionFor, levelOf, personaOf} from "../game/engine/pilots/roster.mjs";

let checks = 0;
const ok = (c, m) => {assert.ok(c, m); checks += 1;};
const eq = (a, b, m) => {assert.deepEqual(a, b, m); checks += 1;};
const ROOT = new URL("../", import.meta.url);

/* ---- 1. The roster ---- */
{
  eq(rosterProblems(), [], "the roster is one this build can play");
  eq(LEVELS.map((l) => l.id), ["easy", "normal", "hard", "llm"], "the levels, in the lobby's order: Easy, Normal, Hard, then the Claude seat");
  eq(PERSONAS.map((p) => p.id), ["sable", "benny", "marcus", "june"], "four personas: the salty one, the group hug, the competitor, the casual");
  eq([...new Set(PERSONAS.map((p) => p.sex))].sort(), ["female", "male"], "male and female, and only those");
  ok(PERSONAS.every((p) => existsSync(new URL(p.avatar, ROOT)) && readFileSync(new URL(p.avatar, ROOT), "utf8").startsWith("<svg")), "each has its avatar on disk");
  ok(PERSONAS.every((p) => p.blurb.length <= 90 && !/\n/.test(p.blurb)), "each description is one short line");
  eq(Object.keys(DIALS), ["saltiness", "friendliness", "competitiveness"], "three dials: hugginess is folded into friendliness");
  ok(PERSONAS.every((p) => !("hugginess" in p.disposition)), "and no persona has a dial of its own for it");
  const by = Object.fromEntries(PERSONAS.map((p) => [p.id, p]));
  ok(by.sable.disposition.saltiness >= 3 && by.sable.overrides.saltCap === 4, "Sable is salty and may go to 4 at any difficulty");
  ok(by.benny.disposition.friendliness === 2 && by.benny.overrides.saltCap < 0 && by.benny.overrides.politics === "avoid", "Benny is the group hug: friendliest, kindest cap, stays out of pile-ons");
  ok(by.marcus.disposition.competitiveness === 2 && by.marcus.overrides.saltCap === 1, "Marcus is the competitor");
  ok(by.june.overrides.temperatureDelta === 1 && by.june.disposition.competitiveness < 0, "June is the casual: she takes the fun line");
  eq(levelOf("hard").available, false, "Hard is not offered until its pilot exists");
}

/* ---- 2. What the validator refuses ---- */
{
  const sable = JSON.parse(JSON.stringify(PERSONAS[0]));
  const mutated = (change) => {const r = roster(); change(r.personas[0]); return rosterProblems(r);};
  ok(mutated((p) => {p.overrides.information = "all";}).some((m) => /overrides information.*never a persona's/.test(m)), "a persona that overrides information is refused");
  ok(mutated((p) => {p.overrides.personBias = 1;}).some((m) => /personBias/.test(m)), "and one that weighs a person differently from an AI");
  ok(mutated((p) => {p.disposition.saltiness = 5;}).some((m) => /saltiness is a whole number from -2 to 4/.test(m)), "a dial above its range");
  ok(mutated((p) => {p.disposition.friendliness = 1.5;}).some((m) => /friendliness/.test(m)), "or not a whole number");
  ok(mutated((p) => {p.disposition.hugginess = 1;}).some((m) => /dial \(hugginess\)/.test(m)), "or a fourth dial");
  ok(mutated((p) => {p.sex = "other";}).some((m) => /male or female/.test(m)), "a sex that is not male or female");
  ok(mutated((p) => {p.overrides.saltCap = 1;}).some((m) => /above its own cap/.test(m)), "a saltiness above the cap the persona itself names");
  ok(mutated((p) => {p.overrides.temperatureDelta = 3;}).some((m) => /temperatureDelta is outside its limits/.test(m)), "a temperature moved by more than one: it cannot make Easy compute like Hard");
  ok(mutated((p) => {p.overrides.politics = "betray";}).some((m) => /politics is outside/.test(m)), "politics outside join, neutral, avoid");
  ok(mutated((p) => {p.blurb = "x".repeat(91);}).some((m) => /one short line/.test(m)), "a blurb that is a paragraph");
  ok(mutated((p) => {p.avatar = "../secret.svg";}).some((m) => /no avatar under assets\/personas/.test(m)), "an avatar outside assets/personas");
  ok(mutated((p) => {p.id = "benny";}).some((m) => /own lower-case id/.test(m)), "a duplicate id");
  void sable;
}

/* ---- 3. The browser's copy ---- */
{
  const file = readFileSync(new URL("data/ai-players/roster.json", ROOT), "utf8");
  eq(JSON.parse(file), roster(), "data/ai-players/roster.json is what the module says (node tools/build-ai-roster.mjs writes it)");
  ok(file.endsWith("\n") && JSON.parse(file).schema === "CrankAiRoster@1", "and it names its schema");
}

/* ---- 4. Dispositions ---- */
{
  eq([dispositionFor("easy").saltCap, dispositionFor("normal").saltCap, dispositionFor("hard").saltCap, dispositionFor("llm").saltCap], [-1, -1, 0, 0],
    "without a persona, Easy and Normal are capped at -1 (Rob's rule), Hard at 0, and the Claude seat at 0");
  eq(LEVELS.map((l) => l.saltCap), [-1, -1, 0, 0], "the roster says Hard's cap is 0 and Easy's and Normal's -1");
  for (const level of ["easy", "normal", "hard", "llm"]) eq(dispositionFor(level, "sable").saltCap, 4, `Sable raises the cap to 4 at ${level}: the one place a cap rises`);
  eq([dispositionFor("normal", "benny").saltCap, dispositionFor("easy", "june").saltCap], [-2, -1], "Benny lowers it, June keeps it");
  const d = dispositionFor("hard", "june");
  eq([d.temperatureDelta, d.groupHug, d.politics, d.dials], [1, 0.3, "neutral", {saltiness: -1, friendliness: 1, competitiveness: -1}], "June's overrides and dials read through");
  eq(dispositionFor("normal", "nobody").persona, null, "an unknown persona is none");
  eq(dispositionFor("normal").dials, null, "and none has no dials");
  /* Held to the limits whatever a roster says: a build that read a wild value would still clamp it. */
  const lim = OVERRIDE_LIMITS;
  ok(lim.temperatureDelta.min === -1 && lim.temperatureDelta.max === 1 && lim.saltCap.max === 4 && lim.saltCap.min === -2, "the limits: temperature by one, saltiness cap from -2 to 4");
}

/* ---- 5. A seat names a level and a persona, and nothing else rides the wire ---- */
{
  eq(readSeatAi({level: "easy", persona: "sable"}), {level: "easy", persona: "sable"}, "a level and a persona on the roster are kept");
  eq(readSeatAi({level: "hard", persona: "june"}), {level: "normal", persona: "june"}, "an unavailable level (Hard, for now) is Normal; the persona stands");
  eq(readSeatAi({level: "llm", persona: "Sable"}), {level: "llm", persona: null}, "an id is exact: 'Sable' is not 'sable'");
  eq(readSeatAi({level: "wizard", persona: "<script>"}), {level: "normal", persona: null}, "an unknown level is Normal and an unknown persona none");
  eq(readSeatAi({}), {level: "normal", persona: null}, "and a seat that says nothing is Normal with none");
  ok(personaOf("sable") && !personaOf("constructor") && !personaOf("__proto__") && !levelOf("constructor"), "a prototype's name is not a persona or a level");
}

/* ---- 6. The table keeps a persona with its seat, and the room's pilot is made with it ---- */
{
  const cards = (name) => (name === "Forest" ? {types: ["Land"], abilities: [{id: "t-g", kind: "mana", tapSelf: true, produces: {G: 1}}]}
    : /^Bear/.test(name) ? {types: ["Creature"], power: 2, toughness: 2, manaCost: "{1}{G}"}
    : /^General/.test(name) ? {types: ["Creature"], supertypes: ["Legendary"], power: 3, toughness: 3, manaCost: "{2}{G}"} : null);
  const deckFor = (tag) => ({name: `${tag} deck`, commander: [`General ${tag}`], cards: [...Array(38).fill("Forest"), ...Array.from({length: 61}, (_, i) => `Bear ${tag}-${i}`)]});
  let seq = 0;
  const random = (n) => {seq += 1; return new Uint8Array(n).map((_, i) => (seq * 31 + i * 7) % 256);};
  const t = tableOn(memoryStorage(), {cards, random});
  const ROB = "rob@example.com", now = Date.parse("2026-10-27T20:00:00Z");
  const made = await t.create({tableId: "tablepersonas", host: ROB, hostName: "Rob", seats: [
    {kind: "ai", name: "Sable", level: "easy", persona: "sable"}, {kind: "ai", name: "Plain", level: "normal"}, {kind: "ai", name: "Odd", level: "normal", persona: "nobody"}]});
  eq(made.seats.map((s) => [s.kind, s.level ?? null, s.persona ?? null]), [["human", null, null], ["ai", "easy", "sable"], ["ai", "normal", null], ["ai", "normal", null]],
    "the new table's view says each AI seat's level and persona; an unknown persona is none, and a person's seat has neither");
  const human = await tableOn(memoryStorage(), {cards, random}).create({tableId: "tablehuman", host: ROB, hostName: "Rob", seats: [{kind: "human", name: "Pat", persona: "sable"}, {kind: "ai", name: "B", persona: "benny"}]});
  eq(human.seats.map((s) => s.persona ?? null), [null, null, "benny"], "a persona named on a person's seat is dropped");
  for (const seat of [0, 1, 2, 3]) await t.deck(ROB, seat, deckFor(`p${seat}`), now);
  await t.ready(ROB, true, now);
  await t.start(ROB, now);
  await t.tick(now + 10000);
  const room = await t.currentRoom();
  eq(room.seats.map((s) => s.persona ?? null), [null, "sable", null, null], "the launched game carries the persona with its seat");
  const view = await t.view(ROB);
  eq(view.seats.filter((s) => s.kind === "ai").map((s) => [s.level, s.persona ?? null]), [["easy", "sable"], ["normal", null], ["normal", null]], "and the table's view still says so");
  /* A room started straight from a pod keeps a persona too, makes its pilot with it, and drops one on a seat with no setting. */
  const given = [];
  const rm = await startRoom({storage: memoryStorage(), matchId: "personapod", seed: "s", pilot: (args) => {given.push(args); return seatPilot(args);}, pod: {seats: [
    {seatId: "rob", name: "Rob", pilot: "human", commander: [], cards: Array(40).fill("Forest")},
    {seatId: "ai", name: "Benny", pilot: "house", level: "normal", persona: "benny", commander: [], cards: Array(40).fill("Forest")},
    {seatId: "old", name: "Old", pilot: "house", persona: "sable", commander: [], cards: Array(40).fill("Forest")}]}});
  eq(rm.seats.map((s) => s.persona ?? null), [null, "benny", null], "a room's seat keeps its persona; a house seat with no setting, as every match before them, has none");
  eq(Object.fromEntries(given.map((g) => [g.seat, g.persona])), {1: "benny", 2: null}, "and the room made the pilot for Benny's seat with his persona, and the old seat's with none");
}

console.log(`ai-personas: ${checks} checks passed — the roster offers four difficulties and four personas on three dials, each persona within its limits and none able to touch information or person bias; a seat names a level and a persona and a table carries the persona from the lobby to the launched room.`);
