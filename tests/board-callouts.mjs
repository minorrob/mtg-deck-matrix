/* THE CALLOUTS' READING OF A VIEW (crankmagic-board.js, calloutsFor; Rob, 2026-10-12, from the Replit concept's overlay).
 *
 * What a new view earns against the last, read in Node with no browser: your turn beginning; attackers declared
 * against you; a hit in a combat damage step and a life change outside one; a seat knocked out; a spell countered,
 * proliferate and tokens from the history's new lines; a permanent destroyed or exiled; counters that grew; a response
 * on a stack that already held something; the game's end, and nothing else with it. Never a hidden card's name, and
 * never more than six at once. The board's feature closure is run against a stub of the app, which is enough for the
 * pure reading; the drawing is proved in a browser by tests/table-board.mjs.
 */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";

let checks = 0;
const ok = (c, m) => {assert.ok(c, m); checks += 1;};
const eq = (a, b, m) => {assert.deepEqual(a, b, m); checks += 1;};

/* The board, loaded as the page loads it, its feature run against the least app it needs to define its functions. */
const box = {console};
box.globalThis = box;
box.document = {addEventListener() {}, querySelector() {return null;}, querySelectorAll() {return [];}, getElementById() {return null;}, documentElement: {dataset: {}, classList: {add() {}, remove() {}}}, body: {append() {}}, createElement() {return {style: {}, setAttribute() {}, append() {}, remove() {}, animate() {return {finished: Promise.resolve()};}};}};
box.addEventListener = () => {};
box.performance = {now: () => 0};
box.setTimeout = () => 0; box.clearTimeout = () => {};
vm.runInNewContext(readFileSync(new URL("../crankmagic-board.js", import.meta.url), "utf8"), box);
const C = {esc: (x) => String(x), actions: {}, button: () => "", cardScaleRange: () => [60, 160], cardScale: () => 100, cardScaleSlider: () => "", state: {preferences: {}}, HELP: {}, main: null};
box.CrankFeatures[0](C);
const calloutsFor = (was, next) => JSON.parse(JSON.stringify(box.CrankBoard.calloutsFor(was, next)));
ok(typeof box.CrankBoard.calloutsFor === "function", "the board exposes its reading of a view for this suite");

/* A four-seat view, the person at s0, with nothing happening in it; each case changes a copy. */
const card = (cardId, name, owner, extra = {}) => ({cardId, name, faceDown: false, owner, controller: owner, tapped: false, damage: 0, counters: {}, types: ["Creature"], power: 2, toughness: 2, keywords: [], ...extra});
const zones = (field = []) => ({Library: {count: 90, hiddenCount: 90, cards: []}, Hand: {count: 7, hiddenCount: 7, cards: []}, Battlefield: {count: field.length, hiddenCount: 0, cards: field}, Graveyard: {count: 0, hiddenCount: 0, cards: []}, Exile: {count: 0, hiddenCount: 0, cards: []}, Command: {count: 1, hiddenCount: 0, cards: []}});
const player = (i, name, field = []) => ({playerId: i, name, life: 40, health: {life: 40, poison: 0, status: "active", lossReason: null, commanderDamageMax: 0, commanderDamage: {}}, counters: {}, mana: [], landsPlayed: 0, zones: zones(field)});
const base = () => ({schema: "CrankRoomView@1", matchId: "m1", seatId: "s0", seat: 0, revision: 10, status: "playing", result: null, departures: {},
  seats: [{seatId: "s0", name: "Rob", pilot: "human"}, {seatId: "s1", name: "Maya", pilot: "house"}, {seatId: "s2", name: "Nina", pilot: "house"}, {seatId: "s3", name: "Theo", pilot: "house"}],
  waitingOn: "s1", decision: null, history: [{turn: 3, text: "Maya played Swamp"}],
  state: {turn: 3, turnPlayerId: 1, priorityPlayerId: 1, phase: "MAIN1", players: [player(0, "Rob", [card(1, "Bear", 0)]), player(1, "Maya", [card(2, "Wolf", 1)]), player(2, "Nina"), player(3, "Theo")], combat: null, stack: [], stackSize: 0, gameOver: false}});
const after = (change) => {const was = base(), next = base(); next.revision = 11; change(next, was); return [was, next];};
const words = (list) => list.map((c) => `${c.word}${c.number ? " " + c.number : ""}`.trim());

/* 1. Your turn. */
{
  const [was, next] = after((n) => {n.state.turn = 4; n.state.turnPlayerId = 0;});
  eq(words(calloutsFor(was, next)), ["YOUR TURN"], "the turn passing to you is called out");
  ok(calloutsFor(was, next)[0].line === "Turn 4" && calloutsFor(was, next)[0].tone === "value", "with the turn under it, in gold");
  const [w2, n2] = after((n) => {n.state.turn = 4; n.state.turnPlayerId = 2;});
  eq(words(calloutsFor(w2, n2)), [], "another seat's turn beginning is not");
}
/* 2. Attackers declared against you, counted, only the new ones. */
{
  const [was, next] = after((n, w) => {w.state.combat = {attackingPlayerId: 1, defenders: [0], attacks: [{attacker: 2, defender: 0, blocked: false, blockers: []}]};
    n.state.phase = "COMBAT_DECLARE_ATTACKERS"; n.state.combat = {attackingPlayerId: 1, defenders: [0], attacks: [{attacker: 2, defender: 0, blocked: false, blockers: []}, {attacker: 7, defender: 0, blocked: false, blockers: []}, {attacker: 8, defender: 2, blocked: false, blockers: []}]};});
  const got = calloutsFor(was, next);
  eq(words(got), ["INCOMING"], "one new attacker against you: INCOMING, with no count");
  eq([got[0].tone, got[0].glyph, got[0].line], ["harm", "swords", "1 attacking you"], "red swords, and how many");
  const [w2, n2] = after((n) => {n.state.phase = "COMBAT_DECLARE_ATTACKERS"; n.state.combat = {attackingPlayerId: 1, defenders: [0], attacks: [{attacker: 2, defender: 0}, {attacker: 7, defender: 0}, {attacker: 8, defender: 2}]};});
  eq(words(calloutsFor(w2, n2)), ["INCOMING ×2"], "two at once carry the count; an attack on Nina is not yours");
}
/* 3. Life: a hit in a damage step, a change outside one, a gain. */
{
  const [was, next] = after((n) => {n.state.phase = "COMBAT_DAMAGE"; n.state.players[0].health.life = 33;});
  const got = calloutsFor(was, next);
  eq(words(got), ["HIT -7"], "seven in combat damage is a hit");
  eq(got[0].line, "You · 33", "with your life after it");
  const [w2, n2] = after((n) => {n.state.phase = "COMBAT_DAMAGE"; n.state.players[2].health.life = 28;});
  eq(words(calloutsFor(w2, n2)), ["CRITICAL -12"], "twelve is critical");
  const [w3, n3] = after((n) => {n.state.players[1].health.life = 37; n.state.players[3].health.life = 42;});
  const g3 = calloutsFor(w3, n3);
  eq(words(g3), ["LIFE -3", "LIFE +2"], "outside combat, life lost and life gained, each named");
  eq(g3.map((c) => c.tone), ["harm", "growth"], "red and green");
  eq(g3.map((c) => c.line), ["Maya · 37", "Theo · 42"], "whose, and the new total");
}
/* 4. A seat knocked out says so once, and not its life as well. */
{
  const [was, next] = after((n) => {n.state.phase = "COMBAT_DAMAGE"; n.state.players[1].health.life = 0; n.state.players[1].health.status = "lost"; n.state.players[1].health.lossReason = "0 life";});
  const got = calloutsFor(was, next);
  eq(words(got), ["KO"], "a seat that fell is KO, not a hit");
  ok(got[0].big && got[0].line === "Maya · 0 life", "big, and the reason under it");
  const [w2, n2] = after((n) => {n.state.players[3].health.poison = 10;});
  eq(words(calloutsFor(w2, n2)), ["FATAL"], "ten poison is fatal");
  const [w3, n3] = after((n) => {n.state.players[2].health.commanderDamage = {"1:9": 21};});
  eq(calloutsFor(w3, n3).map((c) => c.line), ["Nina · 21 from a commander"], "and 21 from one commander");
}
/* 5. The history's new lines: countered, proliferate, tokens; the old lines never again. */
{
  const [was, next] = after((n) => {n.history = [{turn: 3, text: "Rob's Rhystic Study was countered by Counterspell"}, {turn: 3, text: "Maya played Swamp"}];});
  const got = calloutsFor(was, next);
  eq(words(got), ["COUNTERED"], "a spell countered, from the line the history added");
  eq([got[0].tone, got[0].glyph], ["answer", "slash"], "in blue, a slash");
  const [w2, n2] = after((n) => {n.history = [{turn: 3, text: "Krenko, Mob Boss created 4 Goblin tokens"}, {turn: 3, text: "Theo proliferated"}, {turn: 3, text: "Maya played Swamp"}];});
  eq(words(calloutsFor(w2, n2)), ["TOKENS ×4", "PROLIFERATE"], "tokens with their count, and proliferate");
  const [w3, n3] = after(() => {});
  eq(words(calloutsFor(w3, n3)), [], "a line already seen earns nothing again");
}
/* 6. A permanent destroyed or exiled; counters that grew; never a hidden card's name. */
{
  const [was, next] = after((n) => {const p = n.state.players[1]; p.zones.Battlefield.cards = []; p.zones.Graveyard.cards = [card(2, "Wolf", 1)];});
  const got = calloutsFor(was, next);
  eq(words(got), ["DESTROYED"], "a creature from the mat to the graveyard is destroyed");
  eq(got[0].line, "Wolf", "named, since the graveyard is public");
  const [w2, n2] = after((n) => {const p = n.state.players[0]; p.zones.Battlefield.cards = []; p.zones.Exile.cards = [card(1, "Bear", 0)];});
  eq(calloutsFor(w2, n2).map((c) => [c.word, c.tone, c.line]), [["EXILED", "fade", "Bear"]], "to exile, it fades, in violet");
  const [w3, n3] = after((n, w) => {w.state.players[1].zones.Battlefield.cards = [card(2, null, 1, {faceDown: true})]; const p = n.state.players[1]; p.zones.Battlefield.cards = []; p.zones.Graveyard.cards = [card(2, null, 1, {faceDown: true})];});
  eq(calloutsFor(w3, n3).map((c) => c.line), ["A face-down permanent"], "a face-down permanent is never named");
  const [w4, n4] = after((n) => {n.state.players[0].zones.Battlefield.cards[0].counters = {"+1/+1": 3};});
  const g4 = calloutsFor(w4, n4);
  eq([g4[0].word, g4[0].number, g4[0].line, g4[0].tone], ["", "+3", "Bear", "growth"], "+1/+1 counters placed: the number alone, green, over the card's name");
}
/* 7. A response: something added to a stack that already held something, not the first thing on it. */
{
  const [was, next] = after((n, w) => {w.state.stack = [{stackId: 1, cardId: 20, name: "Rhystic Study", playerId: 0, kind: "spell", stage: "waiting"}]; n.state.stack = [...w.state.stack, {stackId: 2, cardId: 21, name: "Counterspell", playerId: 1, kind: "spell", stage: "waiting"}];});
  const got = calloutsFor(was, next);
  eq(words(got), ["RESPONSE"], "a spell on top of a spell is a response");
  eq(got[0].line, "Maya · Counterspell", "whose, and what");
  const [w2, n2] = after((n) => {n.state.stack = [{stackId: 1, cardId: 20, name: "Rhystic Study", playerId: 0, kind: "spell", stage: "waiting"}];});
  eq(words(calloutsFor(w2, n2)), [], "the first thing on an empty stack is not");
  const [w3, n3] = after((n, w) => {w.state.stack = [{stackId: 1, cardId: 20, name: "Rhystic Study", playerId: 0, kind: "spell"}]; n.state.stack = [...w.state.stack, {stackId: 2, cardId: 21, name: null, faceDown: true, playerId: 1, kind: "spell"}];});
  eq(calloutsFor(w3, n3)[0].line, "Maya · a face-down spell", "a face-down spell on the stack is not named");
}
/* 8. The game's end: the winner, and nothing else with it. */
{
  const [was, next] = after((n) => {n.status = "finished"; n.result = {winner: "s0", reason: "last standing"}; n.state.players[1].health.life = 0; n.state.players[1].health.status = "lost";});
  const got = calloutsFor(was, next);
  eq(got.map((c) => [c.word, c.line, c.big]), [["VICTORY", "You won", true]], "you won: VICTORY, big, alone");
  const [w2, n2] = after((n) => {n.status = "finished"; n.result = {winner: "s2", reason: "last standing"};});
  eq(calloutsFor(w2, n2).map((c) => [c.word, c.line]), [["GAME OVER", "Nina won"]], "another's win: GAME OVER, naming them");
}
/* 9. Never more than six, and nothing for an older view or another game. */
{
  const [was, next] = after((n) => {n.state.turn = 4; n.state.turnPlayerId = 0; for (const p of n.state.players) p.health.life = 30; n.history = [{turn: 4, text: "Maya's Opt was countered by Negate"}, {turn: 4, text: "Krenko created 3 Goblin tokens"}, {turn: 3, text: "Maya played Swamp"}];});
  ok(calloutsFor(was, next).length === 6, `at most six at once (${calloutsFor(was, next).length} of 7 earned)`);
}
console.log(`board-callouts: ${checks} checks passed — the board's reading of a new view against the last: your turn, attackers against you, hits and life, a seat out, countered, proliferate and tokens, destroyed and exiled, counters grown, a response on the stack, the game's end; a hidden card never named; six at most.`);
