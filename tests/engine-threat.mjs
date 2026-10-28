/* THE THREAT TABLE (docs/ai-players/PLAN-2026-10-26.html §4; game/engine/pilots/threat.mjs), AND L1 READING IT.
 *
 * Rob, 2026-10-26: every difficulty reads, at a foundational level, "total life, who has the biggest hitters, who seems
 * to be getting the most cards onto their map, who has the fastest ramp-ups"; Easy takes "a more rudimentary approach";
 * no difficulty ever weights a person differently from an AI; and an attack "with a creature that will die and do nothing
 * to the other player" is never made.
 *
 *   1. The signals, each in [0, 1], read off the seat's projection and public card facts alone.
 *   2. Easy keeps a rank (the top row 1, the rest 0); Normal a weighted mean; `over` is the score less the table's mean.
 *   3. Nothing in a row can tell a person from an AI: the same board under other names, or with seat kinds and settings
 *      written into the view, gives the same table to the byte, and the same pilot answers; the LLM seat's brief carries
 *      no kind, level or persona.
 *   4. L1 attacks where threat × effect is highest, at Easy and at Normal, and with one opponent the table moves nothing.
 *   5. The floor: a plan whose every attacker dies for nothing is never drawn, at Easy over every seed.
 *
 *   node tests/engine-threat.mjs
 */
import assert from "node:assert/strict";
import {threatTable, absurd, THREAT_WEIGHTS, SIGNALS} from "../game/engine/pilots/threat.mjs";
import {scoredPilot, WEIGHTS} from "../game/engine/pilots/scored-pilot.mjs";
import {agentBrief} from "../game/room/agent-brief.mjs";

let checks = 0;
const ok = (c, m) => {assert.ok(c, m); checks += 1;};
const eq = (a, b, m) => {assert.deepEqual(a, b, m); checks += 1;};
const near = (a, b, m) => {assert.ok(Math.abs(a - b) < 1e-9, `${m}: ${a} is not ${b}`); checks += 1;};

/* Public card facts, as the room hands them (game/room/room.mjs factsFrom): types, and the mana a card makes. */
const FACTS = {
  Forest: {manaValue: 0, types: ["Land"], makes: ["G"]}, Mountain: {manaValue: 0, types: ["Land"], makes: ["R"]},
  "Sol Ring": {manaValue: 1, types: ["Artifact"], makes: ["C"]}, "Llanowar Elves": {manaValue: 1, types: ["Creature"], makes: ["G"]},
  Bear: {manaValue: 2, types: ["Creature"], makes: []}, Dragon: {manaValue: 6, types: ["Creature"], makes: []},
  Wall: {manaValue: 2, types: ["Creature"], makes: []}, Banner: {manaValue: 3, types: ["Enchantment"], makes: []},
  /* The role flags the room hands every pilot (pilots/roles.mjs): a doubler, an untapper and loop piece, a token engine; and a commander's class. */
  "Doubling Season": {manaValue: 5, types: ["Enchantment"], makes: [], flags: "D"}, "Intruder Alarm": {manaValue: 4, types: ["Enchantment"], makes: [], flags: "UL"},
  "Krenko Engine": {manaValue: 4, types: ["Creature"], makes: [], flags: "T"}, "Blood Artist": {manaValue: 2, types: ["Creature"], makes: [], flags: "B"},
  "Loop Commander": {manaValue: 4, types: ["Creature"], makes: [], commanderClass: 1}, "Value Commander": {manaValue: 4, types: ["Creature"], makes: [], commanderClass: 0.5},
};
const cards = (name) => FACTS[name] ?? null;
let ids = 0;
const card = (name, controller, extra = {}) => ({cardId: ++ids, name, types: FACTS[name].types, controller, owner: controller, tapped: false, damage: 0, keywords: [],
  ...(FACTS[name].types.includes("Creature") ? {power: extra.power ?? 2, toughness: extra.toughness ?? 2} : {}), ...extra});
function viewOf({seat = 0, turn = 9, phase = "MAIN1", turnPlayerId = 0, players, combat = null, stackSize = 0}) {
  return {viewerSeatId: seat, turn, turnPlayerId, phase, stackSize, combat, stack: [],
    players: players.map((p, i) => ({playerId: i, name: p.name ?? `P${i}`, life: p.life ?? 40, health: {life: p.life ?? 40, status: p.status ?? "active", poison: 0}, mana: [], counters: {},
      zones: {Battlefield: {cards: p.battlefield ?? [], count: (p.battlefield ?? []).length}, Hand: {cards: p.hand ?? [], count: p.handCount ?? (p.hand ?? []).length},
        Library: {cards: [], count: 60}, Graveyard: {cards: []}, Exile: {cards: []}, Command: {cards: p.command ?? []}}, ...(p.extra ?? {})}))};
}

/* ---- 1. The signals ---- */
{
  /* Seat 1: three lands, a Sol Ring, Elves, a Dragon (6/6 flying) and a Banner; seat 2: two lands and a Bear; at 40 and 30 life. */
  const s1 = [card("Forest", 1), card("Forest", 1), card("Mountain", 1), card("Sol Ring", 1), card("Llanowar Elves", 1, {power: 1, toughness: 1}),
    card("Dragon", 1, {power: 6, toughness: 6, keywords: ["Flying"]}), card("Banner", 1)];
  const s2 = [card("Forest", 2), card("Forest", 2), card("Bear", 2)];
  const v = viewOf({players: [{}, {battlefield: s1}, {battlefield: s2, life: 30}]});
  const t = threatTable(v, {seat: 0, cards, setting: "normal"});
  eq(t.rows.map((r) => r.playerId), [1, 2], "one row per living opponent, never the seat itself");
  eq(Object.keys(t.rows[0].signals), [...SIGNALS], "the six signals, in the plan's order");
  const [a, b] = t.rows.map((r) => r.signals);
  eq([a.life, b.life], [1, 0.75], "life: each seat's life as a share of the highest among them");
  /* Hitters: the Dragon's 6 at 1.5 for flying, the Elves' 1, over my 40 life; the Bear's 2. */
  near(a.hitters, (6 * 1.5 + 1) / 40, "hitters: power on the board, evasion counted, over my life");
  near(b.hitters, 2 / 40, "and the Bear's two");
  /* Growth: nonland permanents a turn (turn 9 over three seats: three turns each) against the table's fastest. */
  eq([a.growth, b.growth], [1, 0.25], "growth: four nonland permanents against one, as a share of the fastest");
  /* Ramp: lands and what makes mana -- three lands, the Ring and the Elves are five sources; two lands are two. */
  near(a.ramp, 1, "ramp: mana sources a turn, lands and rocks and dorks alike, as a share of the fastest");
  near(b.ramp, 0.4, "(two sources against five)");
  eq([a.engine, a.commander, b.engine, b.commander], [0, 0, 0, 0], "engine and commander: 0 when no card says it has a role (the room hands the flags; section 1b)");
  ok(t.rows.every((r) => Object.values(r.signals).every((x) => x >= 0 && x <= 1) && r.score >= 0 && r.score <= 1), "every signal and score in [0, 1]");
  const w = THREAT_WEIGHTS.normal, sum = (s) => SIGNALS.reduce((n, k) => n + w[k] * s[k], 0) / SIGNALS.reduce((n, k) => n + w[k], 0);
  near(t.rows[0].score, sum(a), "Normal's score is the weighted mean under its weights");
  near(t.rows[1].score, sum(b), "for each row");
  eq(t.top, 1, "the top is the seat with the biggest board, ramp and life");
  near(t.mean, (t.rows[0].score + t.rows[1].score) / 2, "the mean is the rows'");
  near(t.over(1) + t.over(2), 0, "`over` sums to nothing across the table: it says where, never whether");
  eq(t.of(0), 0, "the seat itself, or anyone not at the table, scores nothing");
  const out = threatTable(viewOf({players: [{}, {battlefield: s1, status: "lost"}, {battlefield: s2}]}), {seat: 0, cards});
  eq(out.rows.map((r) => r.playerId), [2], "a seat out of the game has no row");
  const empty = threatTable(viewOf({players: [{}, {}, {}]}), {seat: 0, cards});
  const lifeShare = THREAT_WEIGHTS.normal.life / SIGNALS.reduce((n, k) => n + THREAT_WEIGHTS.normal[k], 0);
  near(empty.rows[0].score, lifeShare, "empty boards: only life counts, at its weight's share");
  eq([empty.rows[1].score === empty.rows[0].score, empty.over(1), empty.over(2)], [true, 0, 0], "equal, and the mean says nobody stands out");
}

/* ---- 1b. The engine and the commander ---- */
{
  const links = (seat, n) => [card("Doubling Season", seat), card("Intruder Alarm", seat), card("Krenko Engine", seat, {power: 1, toughness: 1}), card("Doubling Season", seat)].slice(0, n);
  const at = (setting, mine, theirs, command = []) => threatTable(viewOf({players: [{}, {battlefield: mine, command}, {battlefield: theirs}]}), {seat: 0, cards, setting});
  const sig = (t, id, k) => t.rows.find((r) => r.playerId === id).signals[k];
  /* Engine: Normal sees one when two links are down, Hard from the first, and Easy's weight is 0. */
  eq([sig(at("normal", links(1, 1), []), 1, "engine"), sig(at("normal", links(1, 2), []), 1, "engine"), sig(at("normal", links(1, 4), []), 1, "engine")], [0, 0.5, 1],
    "Normal: one link is no engine, two is half of one, four is one");
  near(sig(at("hard", links(1, 1), []), 1, "engine"), 1 / 3, "Hard: the first link is already a seed (a third)");
  eq([sig(at("hard", links(1, 3), []), 1, "engine"), sig(at("hard", links(1, 4), []), 1, "engine")], [1, 1], "and three links are one, more are no more");
  eq([sig(at("easy", links(1, 4), []), 1, "engine"), sig(at("easy", [], [], [card("Loop Commander", 1)]), 1, "commander")], [0, 0], "Easy reads 0 for the engine and the commander, whatever is on the table");
  eq([THREAT_WEIGHTS.easy.engine, THREAT_WEIGHTS.easy.commander], [0, 0], "and weighs neither");
  ok(links(1, 1)[0].types.includes("Enchantment") && sig(at("hard", [card("Blood Artist", 1)], []), 1, "engine") === 0, "a bleed card is no engine link: only doublers, draw, token, untap, recursion and copy are");
  /* Only a seat's own permanents count, and the seat itself and the lost never. */
  eq(sig(at("hard", [], links(2, 4)), 1, "engine"), 0, "the other seat's links are the other seat's");
  /* Commander: the strongest class in the command zone, or on the battlefield. */
  const sigC = (setting, command, bf = []) => sig(at(setting, bf, [], command), 1, "commander");
  eq([sigC("hard", [card("Loop Commander", 1)]), sigC("hard", [card("Value Commander", 1)]), sigC("hard", [])], [1, 0.5, 0], "a commander's class is the signal, from the command zone");
  eq(sigC("hard", [], [card("Loop Commander", 1, {commander: true})]), 1, "and from the battlefield once it is out");
  eq(sigC("hard", [card("Value Commander", 1), card("Loop Commander", 1)]), 1, "two commanders: the stronger");
  /* The weights: Hard hears the commander at 1, Normal at 0.2, Easy at 0 -- so from turn one, on an empty board. */
  const [h, n] = ["hard", "normal"].map((st) => at(st, [], [], [card("Loop Commander", 1)]).rows[0].score);
  const [h0, n0] = ["hard", "normal"].map((st) => at(st, [], []).rows[0].score);
  ok(h - h0 > 0.15 && n - n0 < 0.06 && h - h0 > 3 * (n - n0), `a loop commander on an empty board lifts Hard's score by ${(h - h0).toFixed(3)} and Normal's by ${(n - n0).toFixed(3)}`);
  eq(at("easy", [], [], [card("Loop Commander", 1)]).rows[0].score, at("easy", [], []).rows[0].score, "and Easy's by nothing");
  /* The table's top: two seats alike but for the commander; Hard goes at the loop commander's seat, Easy ties to the earlier. */
  const twin = (setting, cmd) => threatTable(viewOf({players: [{}, {battlefield: [card("Bear", 1)]}, {battlefield: [card("Bear", 2)], command: cmd}]}), {seat: 0, cards, setting});
  eq([twin("hard", [card("Loop Commander", 2)]).top, twin("hard", []).top], [2, 1], "Hard's top is the seat with the loop commander; without one, the earlier seat");
  eq(twin("easy", [card("Loop Commander", 2)]).top, 1, "Easy never looked at it");
}

/* ---- 2. Easy's rank ---- */
{
  const s1 = [card("Forest", 1), card("Forest", 1), card("Sol Ring", 1), card("Dragon", 1, {power: 6, toughness: 6})];
  const s2 = [card("Forest", 2), card("Bear", 2)];
  const v = viewOf({players: [{}, {battlefield: s1}, {battlefield: s2}]});
  const easy = threatTable(v, {seat: 0, cards, setting: "easy"});
  eq(easy.rows.map((r) => r.score), [1, 0], "Easy keeps a rank: the top row 1, the rest 0");
  eq([easy.top, easy.mean, easy.over(1), easy.over(2)], [1, 0.5, 0.5, -0.5], "and its mean and `over` follow");
  const tie = threatTable(viewOf({players: [{}, {life: 30}, {life: 25}]}), {seat: 0, cards, setting: "easy"});
  eq(tie.top, 1, "a tie on the signals goes to ... the higher life, since life is a signal");
  const level = threatTable(viewOf({players: [{}, {battlefield: [card("Bear", 1)]}, {battlefield: [card("Bear", 2)]}]}), {seat: 0, cards, setting: "easy"});
  eq(level.top, 1, "an exact tie goes to the earlier seat");
  const ranked = threatTable(viewOf({players: [{}, {battlefield: [card("Bear", 1)], life: 30}, {battlefield: [card("Bear", 2)], life: 30}]}), {seat: 0, cards, setting: "easy"});
  eq(ranked.top, 1, "(the same board at the same life: the earlier seat)");
  const low = threatTable(viewOf({players: [{}, {battlefield: [card("Bear", 1), card("Forest", 1)]}, {battlefield: [card("Bear", 2), card("Forest", 2)], life: 20}]}), {seat: 0, cards, setting: "easy"});
  eq(low.rows.map((r) => r.score), [1, 0], "with the same board, the seat at full life ranks above the one at 20: nearer to winning");
  const w = THREAT_WEIGHTS.easy;
  eq([w.engine, w.commander], [0, 0], "Easy weighs no engine and no commander");
}

/* ---- 3. A person and an AI are the same row ---- */
{
  const board = (seat) => [card("Forest", seat), card("Forest", seat), card("Bear", seat, {power: 3, toughness: 3})];
  const plain = viewOf({players: [{}, {battlefield: board(1)}, {battlefield: board(2), life: 35}]});
  const named = viewOf({players: [{name: "Rob"}, {name: "Maya", battlefield: board(1), extra: {kind: "human", seat: {kind: "human"}}},
    {name: "AI · Easy", battlefield: board(2), life: 35, extra: {kind: "ai", level: "easy", persona: "sable"}}]});
  /* The same ids on both boards, so the rows compare to the byte. */
  ids = 0; const p1 = viewOf({players: [{}, {battlefield: board(1)}, {battlefield: board(2), life: 35}]});
  ids = 0; const p2 = viewOf({players: [{name: "Rob"}, {name: "Maya", battlefield: board(1), extra: {kind: "human"}}, {name: "AI · Easy", battlefield: board(2), life: 35, extra: {kind: "ai", level: "easy", persona: "sable"}}]});
  for (const setting of ["easy", "normal", "hard"]) {
    const a = threatTable(p1, {seat: 0, cards, setting}), b = threatTable(p2, {seat: 0, cards, setting});
    eq(JSON.stringify(b.rows), JSON.stringify(a.rows), `${setting}: the table is the same to the byte whatever the seats are called or marked`);
  }
  ok(!JSON.stringify(threatTable(p2, {seat: 0, cards}).rows).match(/human|kind|level|persona|Maya|Rob/), "and no row carries a name, a kind, a level or a persona");
  /* The pilot's answer, too: declare-attackers with one 3/3 against two open seats. */
  const mine = card("Bear", 0, {power: 3, toughness: 3});
  const choice = {id: "declare-attackers:9", mode: "many", min: 0, max: 1, exclusiveBy: "cardId", options: [{index: 0, cardId: mine.cardId, defenderId: 1}, {index: 1, cardId: mine.cardId, defenderId: 2}]};
  const with0 = (v) => ({...v, players: v.players.map((p, i) => (i === 0 ? {...p, zones: {...p.zones, Battlefield: {cards: [mine], count: 1}}} : p))});
  for (const setting of ["easy", "normal"]) {
    const pilot = scoredPilot({seat: 0, cards, setting, seed: "s"});
    eq(pilot.answer(with0(p2), choice), pilot.answer(with0(p1), choice), `${setting}: L1 answers the same with the seats marked person and AI`);
  }
  void plain; void named;
  /* The LLM seat's brief: whatever the view carries about a seat's kind or setting, the model is not told. */
  const brief = agentBrief({seat: 0, state: {...p2, decision: null}, decision: {id: "x", title: "Attack Maya?", mode: "one", options: [{index: 0, label: "Attack Maya"}, {index: 1, label: "Attack AI · Easy"}]}}, [0]);
  const text = JSON.stringify(brief);
  ok(!/"kind"|"level"|"persona"|human|easy|sable/.test(text), `the brief carries no seat kind, level or persona (${text.slice(0, 80)}...)`);
  ok(!/Maya|Rob/.test(text), "nor a person's name");
}

/* ---- 4. L1 goes where threat × effect is highest ---- */
{
  /* Two open seats at 40 life, neither with a blocker; seat 2 is the bigger threat (lands, a Ring, a Dragon held back
     tapped). The damage is the same either way, so only the threat decides -- and seat 1 comes first, which is where the
     tie went before the table existed. */
  ids = 0;
  const mine = [card("Bear", 0, {power: 3, toughness: 3}), card("Bear", 0, {power: 2, toughness: 2})];
  const s2 = [card("Forest", 2), card("Forest", 2), card("Forest", 2), card("Sol Ring", 2), card("Dragon", 2, {power: 6, toughness: 6, tapped: true})];
  const v = viewOf({players: [{battlefield: mine}, {battlefield: [card("Forest", 1)]}, {battlefield: s2}]});
  const choice = {id: "declare-attackers:9", mode: "many", min: 0, max: 2, exclusiveBy: "cardId", options: [
    {index: 0, cardId: mine[0].cardId, defenderId: 1}, {index: 1, cardId: mine[1].cardId, defenderId: 1},
    {index: 2, cardId: mine[0].cardId, defenderId: 2}, {index: 3, cardId: mine[1].cardId, defenderId: 2}]};
  const seeds = Array.from({length: 20}, (_, n) => `seed-${n}`);
  const picks = (setting, weights = WEIGHTS) => new Set(seeds.map((seed) => JSON.stringify(scoredPilot({seat: 0, cards, setting, seed, weights}).answer(v, choice).indices.sort())));
  eq([...picks("normal")], ["[2,3]"], "normal: both attack the bigger threat, seat 2, the damage being equal, on every seed");
  const easy = picks("easy");
  ok(!easy.has("[0,1]") && easy.has("[2,3]"), `easy: its attacks go at the top of its rank, seat 2, and never at seat 1; some seeds hold back, as its chance allows (${[...easy].join(" ")})`);
  eq([...picks("normal", {...WEIGHTS, threat: 0, threatAim: 0})], ["[0,1]"], "normal with the threat weight at 0 attacks seat 1, the first: the break the table catches");
  /* Easy's rank is a filter, not a weight: with the weight at 0 it still goes only at seat 2; and when the top of its rank
     cannot be attacked at all (no option names it), the next seat is attacked on some seeds, so nothing it can hit is safe. */
  ok(!picks("easy", {...WEIGHTS, threat: 0, threatAim: 0}).has("[0,1]"), "Easy with the weight at 0 still never attacks seat 1: the rank decides");
  const onlyOne = {...choice, options: choice.options.slice(0, 2)};
  const reach = new Set(seeds.map((seed) => JSON.stringify(scoredPilot({seat: 0, cards, setting: "easy", seed}).answer(v, onlyOne).indices.sort())));
  ok(reach.has("[0,1]"), `and when seat 2 cannot be attacked, seat 1 is, on some seeds (${[...reach].join(" ")})`);
  /* A huge threat behind a wall loses to a smaller one in the open: effect counts. */
  const walled = viewOf({players: [{battlefield: mine}, {battlefield: [card("Forest", 1)]}, {battlefield: [...s2, card("Wall", 2, {power: 0, toughness: 8}), card("Wall", 2, {power: 0, toughness: 8})]}]});
  eq(scoredPilot({seat: 0, cards, setting: "normal", seed: "seed"}).answer(walled, choice).indices.sort(), [0, 1], "normal: the bigger threat behind two walls is not where the damage goes; the open seat is");
  /* One opponent: the table moves nothing, so a bad attack is still not made. */
  const one = viewOf({players: [{battlefield: [card("Bear", 0, {power: 2, toughness: 2})]}, {battlefield: [card("Bear", 1, {power: 3, toughness: 3})]}]});
  const alone = {id: "declare-attackers:9", mode: "many", min: 0, max: 1, exclusiveBy: "cardId", options: [{index: 0, cardId: one.players[0].zones.Battlefield.cards[0].cardId, defenderId: 1}]};
  eq(scoredPilot({seat: 0, cards, setting: "normal", seed: "x"}).answer(one, alone).indices, [], "with one opponent, a 2/2 into a 3/3 stays home as it always did");
  const t = threatTable(one, {seat: 0, cards, setting: "normal"});
  eq(t.over(1), 0, "(the lone opponent is the mean: `over` is nothing)");
}

/* ---- 5. The floor ---- */
{
  eq(absurd([{cardId: 1}], {through: 0, attackersLost: [{cardId: 1}]}), true, "every attacker lost and nothing through: absurd");
  eq([absurd([], {through: 0, attackersLost: []}), absurd([{cardId: 1}], {through: 2, attackersLost: [{cardId: 1}]}), absurd([{cardId: 1}, {cardId: 2}], {through: 0, attackersLost: [{cardId: 1}]})], [false, false, false],
    "holding back, damage through, or an attacker that lives: not absurd");
  /* A 1/1 into an untapped 3/3, at Easy: the band used to hold the attack as a near-best plan, so some seeds drew it. */
  ids = 0;
  const weak = card("Bear", 0, {power: 1, toughness: 1}), wall = card("Bear", 1, {power: 3, toughness: 3});
  const v = viewOf({players: [{battlefield: [weak]}, {battlefield: [wall]}, {}]});
  const choice = {id: "declare-attackers:9", mode: "many", min: 0, max: 1, exclusiveBy: "cardId", options: [{index: 0, cardId: weak.cardId, defenderId: 1}, {index: 1, cardId: weak.cardId, defenderId: 2}]};
  const drawn = new Set();
  for (let n = 0; n < 60; n += 1) drawn.add(JSON.stringify(scoredPilot({seat: 0, cards, setting: "easy", seed: `seed-${n}`}).answer(v, choice).indices));
  ok(!drawn.has("[0]"), `Easy never attacks the 3/3 with the 1/1 over 60 seeds (drew ${[...drawn].join(" ")})`);
  ok(drawn.has("[1]"), "while the open seat is still attacked on some seeds");
}

console.log(`engine-threat: ${checks} checks passed — the threat table reads life, hitters, growth and ramp off the seat's view alone; Easy keeps a rank and Normal a weighted mean; a person and an AI are the same row; L1 attacks where threat × effect is highest; and no plan whose every attacker dies for nothing is ever drawn.`);
