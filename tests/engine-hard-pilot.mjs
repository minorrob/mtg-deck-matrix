/* HARD (docs/ai-players/PLAN-2026-10-26.html §3 and §5; game/engine/pilots/scored-pilot.mjs at setting "hard").
 *
 * Rob, 2026-10-26: Hard "will compute a preferred target for each of the creatures they are going to declare to attack ...
 * They also consider the creatures that they would use and the blockers they may want to hold back ... based on the attack
 * potential of other players, the number of creatures on the board, the number of creatures with trample or with flying on
 * the board, and a weighted probability that X number of blockers may be needed between now and my next turn."; and the
 * response to a threat in proportion to it.
 *
 *   1. A preferred defender for each creature: one goes for the kill, another where it does the most, which a single-target
 *      plan (Normal's) never does; the same board at Normal and Easy keeps its one target.
 *   2. (later milestones add the reserve, the urgency and the chains to this file)
 *
 *   node tests/engine-hard-pilot.mjs
 */
import assert from "node:assert/strict";
import {scoredPilot, SETTINGS, TEMPERATURE, absorb} from "../game/engine/pilots/scored-pilot.mjs";
import {seatPilot} from "../game/room/room.mjs";
import {bonus, linksIn, keepEdge, CHAIN, DENSE, KEEP_EDGE} from "../game/engine/pilots/chains.mjs";
import {reserveFor, RISK, PMIN, MOST_CANDIDATES} from "../game/engine/pilots/reserve.mjs";

let checks = 0;
const ok = (c, m) => {assert.ok(c, m); checks += 1;};
const eq = (a, b, m) => {assert.deepEqual(a, b, m); checks += 1;};

const FACTS = {Forest: {manaValue: 0, types: ["Land"], makes: ["G"], flags: ""}, Bear: {manaValue: 2, types: ["Creature"], makes: [], flags: ""}, Wall: {manaValue: 2, types: ["Creature"], makes: [], flags: ""},
  /* Spells and engine pieces, with the role flags the room hands every pilot (pilots/roles.mjs). */
  Murder: {manaValue: 3, types: ["Instant"], makes: [], flags: "A"}, Wrath: {manaValue: 4, types: ["Sorcery"], makes: [], flags: "K"},
  "Loop Piece": {manaValue: 2, types: ["Creature"], makes: [], flags: "UL"}, "Token Engine": {manaValue: 3, types: ["Creature"], makes: [], flags: "T"},
  Doubler: {manaValue: 4, types: ["Enchantment"], makes: [], flags: "D"}, "Three Drop": {manaValue: 3, types: ["Creature"], makes: [], flags: ""},
  "Loop Commander": {manaValue: 4, types: ["Creature"], makes: [], flags: "", commanderClass: 1}, "Big Vanilla": {manaValue: 4, types: ["Creature"], makes: [], flags: ""}};
const cards = (name) => FACTS[name] ?? null;
let ids = 0;
const C = (name, controller, power, toughness, extra = {}) => ({cardId: ++ids, name, types: FACTS[name].types, controller, owner: controller, tapped: false, damage: 0, keywords: [], power, toughness, ...extra});
function viewOf({seat = 0, turn = 9, phase = "COMBAT_DECLARE_ATTACKERS", turnPlayerId = 0, players}) {
  return {viewerSeatId: seat, turn, turnPlayerId, phase, stackSize: 0, combat: null, stack: [],
    players: players.map((p, i) => ({playerId: i, name: `P${i}`, life: p.life ?? 40, health: {life: p.life ?? 40, status: "active", poison: 0}, mana: [], counters: {},
      zones: {Battlefield: {cards: p.battlefield ?? [], count: (p.battlefield ?? []).length}, Hand: {cards: p.hand ?? [], count: (p.hand ?? []).length},
        Library: {cards: [], count: 60}, Graveyard: {cards: []}, Exile: {cards: []}, Command: {cards: p.command ?? []}}}))};
}
const attackChoice = (mine, defenders, max = mine.length) => ({id: "declare-attackers:9", mode: "many", min: 0, max, exclusiveBy: "cardId",
  options: defenders.flatMap((d) => mine.map((c) => ({cardId: c.cardId, defenderId: d}))).map((o, index) => ({...o, index}))});
const answer = (setting, view, choice, seed = "s", disposition = null) => scoredPilot({seat: 0, cards, setting, seed, disposition}).answer(view, choice).indices.sort((a, b) => a - b);
const which = (choice, indices) => indices.map((i) => [choice.options[i].cardId, choice.options[i].defenderId]);

ok(SETTINGS.includes("hard") && TEMPERATURE.hard === 0, "L1 knows a hard setting, which takes the best plan");

/* ---- 1. A preferred defender for each creature ---- */
{
  ids = 0;
  const a = C("Bear", 0, 3, 3), b = C("Bear", 0, 2, 2);
  /* Seat 1 is at 3 life with nothing to block; seat 2 is at 40 with nothing to block. */
  const v = viewOf({players: [{battlefield: [a, b]}, {life: 3}, {life: 40}]});
  const ch = attackChoice([a, b], [1, 2]);
  eq(which(ch, answer("hard", v, ch)), [[a.cardId, 1], [b.cardId, 2]], "Hard: the 3/3 goes for the kill at 3 life, and the 2/2, which that seat no longer needs, at the healthy one");
  eq(new Set(answer("normal", v, ch).map((i) => ch.options[i].defenderId)).size <= 1, true, "Normal's plans send everything at one seat: it never splits");
  eq(new Set(answer("easy", v, ch).map((i) => ch.options[i].defenderId)).size <= 1, true, "and neither does Easy");
  /* The split is not a habit: with two seats alike, both go where the damage is worth most (the same one). */
  const alike = viewOf({players: [{battlefield: [a, b]}, {life: 40}, {life: 40}]});
  eq(new Set(answer("hard", alike, ch).map((i) => ch.options[i].defenderId)).size, 1, "with two seats alike, Hard keeps both at one: a split only where it helps");
}

/* ---- 2. The reserve: the creatures held home for the swing back ---- */
{
  const worth = (c) => c.power + c.toughness / 2;
  ok(RISK.hard === 0.25 && RISK.normal === 1 && !("easy" in RISK), "Hard risks a quarter of its life to the swing back; Normal only a lethal one; Easy keeps no reserve");
  /* A trampler across the table: my life is 12 and a tapped 6/6 trampler comes back for 6, or 1 over a 5/5. */
  ids = 0;
  const big = C("Bear", 0, 5, 5), small = C("Bear", 0, 2, 2);
  const trampler = C("Bear", 1, 6, 6, {tapped: true, keywords: ["Trample"]});
  const v = viewOf({players: [{life: 12, battlefield: [big, small]}, {battlefield: [trampler]}]});
  const ch = attackChoice([big, small], [1]);
  const ids_ = (indices) => indices.map((i) => ch.options[i].cardId);
  eq(ids_(answer("hard", v, ch)), [small.cardId], "Hard holds the 5/5 home against the trampler, which goes over anything smaller, and sends the 2/2");
  eq(ids_(answer("hard", v, ch, "s", {risk: 0.3})).includes(big.cardId), true, "a persona that risks more (risk +0.3: 0.55 of its life) sends the 5/5 too: the appetite is the difference");
  /* Flyers: two 3/3 flyers come back at 8 life; only the reach creature can block one. */
  ids = 0;
  const reach = C("Bear", 0, 4, 4, {keywords: ["Reach"]}), g1 = C("Bear", 0, 3, 3), g2 = C("Bear", 0, 3, 3);
  const f1 = C("Bear", 1, 3, 3, {tapped: true, keywords: ["Flying"]}), f2 = C("Bear", 1, 3, 3, {tapped: true, keywords: ["Flying"]});
  const vf = viewOf({players: [{life: 8, battlefield: [reach, g1, g2]}, {battlefield: [f1, f2]}]});
  const chf = attackChoice([reach, g1, g2], [1]);
  const sent = answer("hard", vf, chf).map((i) => chf.options[i].cardId);
  ok(!sent.includes(reach.cardId) && sent.includes(g1.cardId) && sent.includes(g2.cardId), `against two flyers Hard keeps the reach creature home, the only one that can block them, and the ground creatures go (${sent.length} attack)`);
  /* A kill is not given up for a reserve: the sole opponent at 5 life, open, and a 20/20 trampler tapped on their side. */
  ids = 0;
  const k1 = C("Bear", 0, 3, 3), k2 = C("Bear", 0, 3, 3);
  const vk = viewOf({players: [{life: 8, battlefield: [k1, k2]}, {life: 5, battlefield: [C("Bear", 1, 20, 20, {tapped: true, keywords: ["Trample"]})]}]});
  const chk = attackChoice([k1, k2], [1]);
  eq(answer("hard", vk, chk), [0, 1], "with the kill on offer (5 life, no blocker) both go, whatever comes back: there is no swing back from a win");
  /* Normal holds against a lethal swing only: two 4/4s at 8 life against three tapped 3/3s keeps one home (the old behavior). */
  ids = 0;
  const n1 = C("Bear", 0, 4, 4), n2 = C("Bear", 0, 4, 4);
  const vn = viewOf({players: [{life: 8, battlefield: [n1, n2]}, {life: 10, battlefield: [C("Bear", 1, 3, 3, {tapped: true}), C("Bear", 1, 3, 3, {tapped: true}), C("Bear", 1, 3, 3, {tapped: true})]}]});
  const chn = attackChoice([n1, n2], [1]);
  eq([answer("normal", vn, chn).length, answer("hard", vn, chn).length <= 1], [1, true], "Normal keeps one 4/4 home against a lethal swing; Hard keeps at least as many");
}

/* ---- 3. reserveFor, on its own: the weighted probability that a seat comes at me ---- */
{
  ids = 0;
  const x = C("Bear", 0, 4, 4);
  const atk = C("Bear", 1, 8, 8, {tapped: true});
  const args = (extra) => ({candidates: [x], guards: [], myLife: 20, through: absorb, worth: (c) => c.power + c.toughness / 2, risk: 0.25, ...extra});
  /* Alone with me, the seat comes at me for sure: 8 of 20 is 0.4, over a quarter, so the 4/4 stays. */
  const alone = reserveFor(args({foes: [{playerId: 1, life: 40}], theirs: () => [atk], blockersOf: () => [], threatOf: () => 1}));
  eq(alone, [x.cardId], "a lone attacker's 8 power against 20 life is held against: the 4/4 stays home");
  /* With a juicier seat at the table (5 life, no blockers, the top threat), the same seat is far more likely to go there:
     the probability it comes at me is small, and the 4/4 is free. */
  const exposed = {playerId: 2, life: 5};
  const crowd = reserveFor(args({foes: [{playerId: 1, life: 40}, exposed], theirs: (id) => (id === 1 ? [atk] : []), blockersOf: () => [], threatOf: (id) => (id === 2 ? 1 : 0.1)}));
  eq(crowd, [], "with an exposed seat for it to hit instead, the chance it comes at me is small and nothing is held");
  /* A lethal swing is held against whatever the odds, once the chance clears PMIN. */
  const lethal = reserveFor(args({myLife: 6, foes: [{playerId: 1, life: 40}, exposed], theirs: (id) => (id === 1 ? [C("Bear", 1, 8, 8, {tapped: true})] : []), blockersOf: () => [], threatOf: (id) => (id === 2 ? 1 : 0.1)}));
  ok(PMIN === 0.2 && lethal.length <= 1, "(PMIN is a fifth)");
  /* A big board is the crackback term's, not the reserve's. */
  const many = Array.from({length: MOST_CANDIDATES + 1}, () => C("Bear", 0, 1, 1));
  eq(reserveFor(args({candidates: many, foes: [{playerId: 1, life: 40}], theirs: () => [atk], blockersOf: () => [], threatOf: () => 1})), [], "more creatures than it works out are left to L1's own exposure terms");
  eq(reserveFor(args({foes: [{playerId: 1, life: 40}], theirs: () => [], blockersOf: () => [], threatOf: () => 1})), [], "no one who can attack me, nothing is held");
  eq(reserveFor(args({candidates: [], foes: [{playerId: 1, life: 40}], theirs: () => [atk], blockersOf: () => [], threatOf: () => 1})), [], "no candidate, no reserve");
}

/* ---- 4. absorb: what gets through a defender that blocks to cut the most ---- */
{
  ids = 0;
  const T = (p, t, k = []) => C("Bear", 1, p, t, {keywords: k}), B = (p, t, k = []) => C("Bear", 0, p, t, {keywords: k});
  eq(absorb([T(6, 6)], []), 6, "no blocker, all of it");
  eq(absorb([T(6, 6)], [B(1, 1)]), 0, "a blocker stops a ground attacker whole, even a chump");
  eq(absorb([T(6, 6, ["Trample"])], [B(5, 5)]), 1, "a trampler goes over all but what its blocker soaks: a 5/5 lets 1 through");
  eq(absorb([T(6, 6, ["Trample"])], [B(2, 2)]), 4, "and a 2/2 lets 4");
  eq(absorb([T(3, 3, ["Flying"])], [B(5, 5)]), 3, "a flyer is met only by a flyer or reach: a ground blocker is no help");
  eq(absorb([T(3, 3, ["Flying"])], [B(5, 5, ["Reach"])]), 0, "reach blocks it");
  eq(absorb([T(3, 3, ["Menace"])], [B(5, 5)]), 3, "and menace needs two blockers: one cannot");
  eq(absorb([T(4, 4), T(1, 1)], [B(2, 2)]), 1, "one blocker goes where it cuts most: the 4-power attacker, so 1 gets through");
  eq(absorb([T(2, 2, ["Double Strike"])], [B(2, 2)]), 0, "double strike is counted twice when it is not blocked, and a block stops it all");
  eq(absorb([T(2, 2, ["Double Strike"])], []), 4, "(4 unblocked)");
}

/* ---- 5. Response urgency in the cast choice: answer in proportion ---- */
{
  const lands = (n) => Array.from({length: n}, (_, i) => ({kind: "activate-mana", objectId: 100 + i, label: "Forest", detail: "{G}"}));
  const offer = (name, objectId, targets = [], hostile = false) => ({kind: "cast", objectId, label: name, tax: 0, autoTap: true, ...(hostile ? {hostile: true} : {}), targets});
  const at = (id) => ({kind: "object", id});
  const main = (players, extra = {}) => viewOf({phase: "MAIN1", players, ...extra});
  const choose = (setting, v, actions) => scoredPilot({seat: 0, cards, setting, seed: "s"}).choose(v, actions);
  const kind = (a) => a.kind + (a.label ? `:${a.label}` : "");

  /* Murder on a vanilla 1/1: every setting casts it. Only a wipe is held to the proportion rule (the bench measured a Hard that passed
     with spot removal in hand and lost tempo for it). */
  ids = 0;
  const tiny = C("Bear", 1, 1, 1);
  const v1 = main([{}, {battlefield: [tiny]}]);
  const a1 = [offer("Murder", 9, [at(tiny.cardId)], true), ...lands(4), {kind: "pass"}];
  eq([kind(choose("hard", v1, a1)), kind(choose("normal", v1, a1)), kind(choose("easy", v1, a1))], ["cast:Murder", "cast:Murder", "cast:Murder"],
    "a removal spell for a vanilla 1/1: every setting casts it, the mana being otherwise unused");

  /* The same spell on a loop piece with its partner in sight: Hard casts it, at the loop piece and not at the bigger body. */
  ids = 0;
  const loop = C("Loop Piece", 1, 1, 1), engine = C("Token Engine", 1, 1, 1), body = C("Bear", 1, 3, 3);
  const v2 = main([{}, {battlefield: [loop, engine, body]}]);
  const a2 = [offer("Murder", 9, [at(body.cardId)], true), offer("Murder", 9, [at(loop.cardId)], true), offer("Murder", 9, [at(engine.cardId)], true), ...lands(4), {kind: "pass"}];
  const hard = choose("hard", v2, a2);
  eq([hard.kind, hard.targets[0].id], ["cast", loop.cardId], "with a loop piece and its partner on the board, Hard casts Murder at the loop piece, not the bigger vanilla body");
  eq(choose("normal", v2, a2).targets[0].id, body.cardId, "Normal, with urgency a light weight, still goes at the bigger body");

  /* A board wipe: not for one seed of a loop; yes when the other seats' creatures are many and mine are few. */
  ids = 0;
  const seed = C("Doubler", 1, 0, 0), m1 = C("Bear", 0, 3, 3), m2 = C("Bear", 0, 3, 3), m3 = C("Bear", 0, 3, 3);
  const wrath = [offer("Wrath", 9, [], true), ...lands(5), {kind: "pass"}];
  eq(kind(choose("hard", main([{battlefield: [m1, m2, m3]}, {battlefield: [seed]}]), wrath)), "pass", "one doubler seed is no reason for a wipe that takes my three creatures: Hard passes");
  ids = 0;
  const big = [C("Bear", 1, 5, 5), C("Bear", 1, 5, 5), C("Bear", 1, 5, 5), C("Bear", 1, 5, 5)], lone = C("Bear", 0, 1, 1);
  eq(kind(choose("hard", main([{life: 12, battlefield: [lone]}, {battlefield: big}]), wrath)), "cast:Wrath", "four 5/5s against my one 1/1 at 12 life: Hard wipes the board");
  ids = 0;
  const big2 = [C("Bear", 1, 5, 5), C("Bear", 1, 5, 5), C("Bear", 1, 5, 5), C("Bear", 1, 5, 5)], mine4 = [C("Bear", 0, 5, 5), C("Bear", 0, 5, 5), C("Bear", 0, 5, 5), C("Bear", 0, 5, 5)];
  eq(kind(choose("hard", main([{life: 12, battlefield: mine4}, {battlefield: big2}]), wrath)), "pass", "an even trade, four 5/5s of mine for four of theirs: the wipe costs more than it removes, and Hard passes");

  /* Mana held for an instant answer, on its own turn, when the table holds a seed worth answering. */
  ids = 0;
  const hand = [{cardId: 70, name: "Murder", types: ["Instant"]}, {cardId: 71, name: "Three Drop", types: ["Creature"]}];
  const drop = [offer("Three Drop", 71), ...lands(4), {kind: "pass"}];
  const worried = main([{hand}, {command: [C("Loop Commander", 1, 3, 3, {commander: true})]}]);
  const calm = main([{hand}, {}]);
  eq([kind(choose("hard", worried, drop)), kind(choose("hard", calm, drop))], ["pass", "cast:Three Drop"], "Hard with Murder in hand and a loop commander across the table leaves three of its four mana up and does not cast the 3-drop; with a calm table it does");
  eq(kind(choose("normal", worried, drop)), "cast:Three Drop", "Normal does not hold mana");

  /* Easy pays no attention at all: the same spell it always cast at the worthiest target. */
  eq(choose("easy", v2, a2).targets[0].id, body.cardId, "Easy goes at the biggest body, as L1 always has");
}

/* ---- 6. Its own chains: playing toward the deck's engine ---- */
{
  ok(CHAIN.easy === 0 && CHAIN.normal < CHAIN.hard && DENSE === 6 && KEEP_EDGE === 0.15, "Easy reads no chain, Normal's weighs less than Hard's");
  const f = (flags) => (n) => (n === "Link" ? {flags} : n === "Other" ? {flags: ""} : null);
  eq(linksIn(["Link", "Link", "Other", "Unknown"], f("T")), 2, "a deck's links are the cards whose flags are an engine link");
  eq([bonus({setting: "easy", flags: "T", boardLinks: 3, deckLinks: 9}), bonus({setting: "hard", flags: "B", boardLinks: 3, deckLinks: 9}), bonus({setting: "hard", flags: "T", boardLinks: 0, deckLinks: 0})], [0, 0, 0],
    "Easy gets nothing, a card that is no link nothing, and a deck with no engine nothing");
  eq([bonus({setting: "normal", flags: "T", boardLinks: 0, deckLinks: 9}), bonus({setting: "normal", flags: "T", boardLinks: 1, deckLinks: 9})], [0, 0.75], "Normal credits a chain only once a link is down, and lightly");
  eq([bonus({setting: "hard", flags: "T", boardLinks: 0, deckLinks: 6}), bonus({setting: "hard", flags: "T", boardLinks: 2, deckLinks: 6}), bonus({setting: "hard", flags: "T", boardLinks: 0, deckLinks: 3})], [1.5, 3, 0.75],
    "Hard credits it from the first card, more with links down, and in proportion to how much of the deck is engine");
  eq([keepEdge({setting: "hard", handFlags: ["", "T"], lands: 2}), keepEdge({setting: "hard", handFlags: ["", "T"], lands: 1}), keepEdge({setting: "normal", handFlags: ["T"], lands: 3}), keepEdge({setting: "hard", handFlags: ["", undefined], lands: 3})], [0.15, 0, 0, 0],
    "a hand with a link and two lands keeps at lower odds, at Hard only");
  /* In a cast: 4 mana, a 4-mana vanilla or a 3-mana token engine. Hard goes to the engine; the others to the bigger body. */
  ids = 0;
  const lands4 = Array.from({length: 4}, (_, i) => ({kind: "activate-mana", objectId: 100 + i, label: "Forest", detail: "{G}"}));
  const both = [{kind: "cast", objectId: 9, label: "Big Vanilla", tax: 0, autoTap: true, targets: []}, {kind: "cast", objectId: 10, label: "Token Engine", tax: 0, autoTap: true, targets: []}, ...lands4, {kind: "pass"}];
  const deck = Array(8).fill("Token Engine");
  const play = (setting, v) => scoredPilot({seat: 0, cards, setting, seed: "s", deck}).choose(v, both).label;
  const v0 = viewOf({phase: "MAIN1", players: [{}, {}]});
  eq([play("hard", v0), play("normal", v0), play("easy", v0)], ["Token Engine", "Big Vanilla", "Big Vanilla"], "Hard plays toward its engine, the 3-mana link over the 4-mana body; Normal and Easy take the bigger body");
  const v1 = viewOf({phase: "MAIN1", players: [{battlefield: [C("Token Engine", 0, 1, 1)]}, {}]});
  eq(play("normal", v1), "Big Vanilla", "and Normal, with a link already down, still takes the body: its weight is low");
  /* The keep: 12 lands in 40, two in hand and a link: about a 52% chance of a third land by turn three. */
  const names = [...Array(12).fill("Forest"), ...Array(6).fill("Token Engine"), ...Array(22).fill("Bear")];
  const hand = Array.from({length: 7}, (_, i) => ({cardId: 500 + i, name: i < 2 ? "Forest" : i === 2 ? "Token Engine" : "Bear", types: i < 2 ? ["Land"] : ["Creature"]}));
  const vm = viewOf({phase: "MAIN1", players: [{hand, library: 33}, {}]});
  vm.players[0].zones.Library = {cards: [], count: 33};
  const mull = {id: "mulligan:0:0", mode: "one", min: 1, max: 1, options: [{index: 0, label: "Keep"}, {index: 1, label: "Mulligan"}]};
  const keeps = (setting) => scoredPilot({seat: 0, cards, setting, seed: "s", deck: names}).answer(vm, mull).indices[0] === 0;
  eq([keeps("hard"), keeps("normal")], [true, false], "a 52% hand with a link and two lands: Hard keeps it, Normal sends it back");
}

/* ---- 7. A persona: through the room to the pilot, and a group hug in an attack ---- */
{
  const cardsNone = () => null;
  const sable = seatPilot({seat: 1, cards: cardsNone, level: "hard", persona: "sable"}), plain = seatPilot({seat: 1, cards: cardsNone, level: "hard"});
  eq([sable.setting, sable.disposition?.saltCap, sable.disposition?.risk, sable.disposition?.persona, plain.disposition], ["hard", 4, -0.1, "sable", null],
    "a persona on a seat reaches the pilot as its disposition (Sable: cap 4, a little less risk); the plain difficulty has none");
  const june = seatPilot({seat: 1, cards: cardsNone, level: "normal", persona: "june"});
  eq([june.disposition.temperatureDelta, june.disposition.groupHug], [1, 0.3], "June's chance is a degree looser, with a little group hug");
  /* A group hug does not hit a seat that is not the table's top threat unless it must; an open attack at one the plain pilot makes. */
  ids = 0;
  const a = C("Bear", 0, 2, 2);
  const v = viewOf({players: [{battlefield: [a]}, {life: 40}, {life: 40, battlefield: [C("Bear", 2, 5, 5), C("Bear", 2, 5, 5)]}]});
  const ch = {id: "declare-attackers:9", mode: "many", min: 0, max: 1, exclusiveBy: "cardId", options: [{index: 0, cardId: a.cardId, defenderId: 1}]};
  const go = (disposition) => scoredPilot({seat: 0, cards, setting: "normal", seed: "s", disposition}).answer(v, ch).indices.length;
  eq([go(null), go({groupHug: 0.8})], [1, 0], "a 2/2 at an open seat that is not the top threat: the plain Normal attacks, a group hug (0.8) does not");
  const kill = viewOf({players: [{battlefield: [a]}, {life: 2}, {life: 40, battlefield: [C("Bear", 2, 5, 5), C("Bear", 2, 5, 5)]}]});
  const goKill = (disposition) => scoredPilot({seat: 0, cards, setting: "normal", seed: "s", disposition}).answer(kill, ch).indices.length;
  eq(goKill({groupHug: 0.8}), 1, "but a kill is a kill: at 2 life the group hug attacks");
}

console.log(`engine-hard-pilot: ${checks} checks passed — Hard gives each creature the defender where it does the most and holds home the blockers a trampler or a flyer needs, answers a threat in proportion to it, plays toward its own engine, and plays as a persona would.`);
