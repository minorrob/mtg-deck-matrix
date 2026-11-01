/* THE LIBRARY'S SET STATUS: BOX AND ASSIGN (ROB-358; Rob, 2026-11-01). Pure model plans, no browser:
 *
 *   1. Box: each ticked copy goes into the box of the deck it is assigned to. A copy in no deck stays on the Bench, a copy
 *      not in hand stays as it is, and a copy already boxed is left. ("You can't be boxed if you're not in a deck.")
 *   2. The warning, not a stop: a box that would hold more or fewer than the hundred still boxes every card, says so per
 *      deck, and the deck then reads Building, never Boxed ("the deck status changes to not legal").
 *   3. A copy that fills a seat takes the Substitute holding that seat out to the Bench, so the box keeps its count.
 *   4. Assign: a card the list already wants is reserved for that seat; any other card replaces a seat the reader names,
 *      the replaced copy stays in the box as the Substitute holding it, and a copy in hand reads Reserved until it is boxed.
 *      A card not in hand becomes a seat to buy, and its Watch record leaves.
 *   5. Assign asks only for what it cannot decide: the cards that need a seat named come back as `needs`.
 *   6. The seats offered to replace: the commander is never one, the Option-flagged come first, then those waiting on a buy.
 */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url), M = require('../collection-model.js');
let checks = 0;const eq = (a, b, m) => {checks++; assert.deepEqual(a, b, m);}, ok = (c, m) => {checks++; assert.ok(c, m);}, refuses = (f, re) => {checks++; assert.throws(f, re);};
let serial = 0;const run = (s, c) => M.apply(s, {id: 'op' + (++serial), at: '2026-11-01T12:00:00.000Z', ...c}).state;
const card = (n) => ({id: 'card:' + n, name: n, verified: true, commander: true, legalities: {commander: 'legal'}, colorIdentity: [], typeLine: 'Legendary Creature'});
const names = (p, n) => Array.from({length: n}, (_, i) => `${p}${i + 1}`);
const make = (s, id, list, extra = {}) => run(s, {type: 'createDeck', deckId: id, name: id, commanders: ['card:' + list[0]], cards: list.map(card), slots: list.map((n) => ({cardId: 'card:' + n, quantity: 1})), ...extra});
const own = (s, list, source = 'owned') => run(s, {type: 'importLots', batchId: 'b' + (++serial), cards: list.map(card), lots: list.map((n) => ({cardId: 'card:' + n, quantity: 1, source}))});
const st = (s, id) => M.deckStatus(s, M.deck(s, id));
const lotOf = (s, n) => s.lots.find((l) => l.cardId === 'card:' + n);
const slotOf = (s, id, n) => M.deck(s, id).slots.find((r) => r.cardId === 'card:' + n);
const read = (s, n, perspective = '') => M.stateReader(s)({...lotOf(s, n), kind: 'lot'});
const place = (s, id, list) => run(s, {type: 'bulk', op: 'place', deckId: id, confirmed: true, lotIds: list.map((n) => lotOf(s, n).id)});
const boxed = (s, ids) => M.boxCommands(s, ids.map((n) => lotOf(s, n).id));
const apply = (s, plan) => plan.command ? run(s, plan.command) : s;

/* A locked deck of a hundred, all owned, 60 of them boxed: the other 40 are assigned (Loading, which reads Reserved now). */
const base = () => {let s = make(M.empty(), 'D', names('A', 100));s = own(s, names('A', 100));s = run(s, {type: 'finalize', deckId: 'D'});return place(s, 'D', names('A', 60));};

/* 1 and 2. Box. */
{let s = base();
  eq([st(s, 'D').deckTotal, st(s, 'D').loading, st(s, 'D').boxed], [60, 40, false], 'the starting point: 60 boxed, 40 assigned and not boxed');
  /* All forty: the box holds the hundred, no warning, and the deck is Boxed. */
  let p = boxed(s, names('A', 100).slice(60));
  eq([p.total, p.warnings.length, p.stays], [40, 0, {noDeck: 0, notInHand: 0, already: 0, offered: 0}], 'boxing the other 40 fills the hundred without a warning');
  eq(p.decks.map((d) => [d.name, d.count, d.before, d.after, d.legalAfter]), [['D', 40, 60, 100, true]], 'the receipt line: D, 40 in, 60 to 100');
  let after = apply(s, p);
  eq([st(after, 'D').deckTotal, st(after, 'D').boxed, st(after, 'D').stage], [100, true, 'defined'], 'and the deck is Boxed');
  /* Ten of them: 70 of 100, a warning, and every one of the ten still boxed. */
  p = boxed(s, names('A', 100).slice(60, 70));
  eq(p.warnings.map((w) => [w.name, w.after, w.size]), [['D', 70, 100]], 'ten more is 70 of 100: the warning names the deck and the count');
  after = apply(s, p);
  eq([st(after, 'D').deckTotal, st(after, 'D').boxed], [70, false], 'it boxes them anyway, and the deck is not Boxed');
  /* Already boxed, in no deck, not in hand: each stays, and each is counted. */
  s = own(s, ['Free']);s = own(s, ['Coming'], 'ordered');
  p = M.boxCommands(s, [lotOf(s, 'A1').id, lotOf(s, 'Free').id, lotOf(s, 'Coming').id]);
  eq([p.command, p.stays], [null, {noDeck: 1, notInHand: 1, already: 1, offered: 0}], 'A1 is already boxed, Free is in no deck, Coming is not in hand: nothing to do, and each is counted');
}

/* Past the hundred (Rob, 2026-10-26): a box of 101 is allowed, warned, and Building. */
{let s = base();s = own(s, ['Z1', 'Z2']);
  s = run(s, {type: 'bulk', op: 'place', deckId: 'D', asStandIn: true, confirmed: true, lotIds: [lotOf(s, 'Z1').id, lotOf(s, 'Z2').id]});
  /* 62 boxed with two stand-ins; boxing the 40 assigned makes 102. */
  const p = boxed(s, names('A', 100).slice(60));
  eq(p.warnings.map((w) => [w.after, w.size]), [[102, 100]], 'a box that would hold 102 is warned');
  const after = apply(s, p);
  eq([st(after, 'D').deckTotal, st(after, 'D').over, st(after, 'D').boxed, st(after, 'D').stage], [102, true, false, 'building'], 'and boxes them: Over, Building, never Boxed');
}

/* 3. A copy that fills a seat takes the Substitute holding it out. D: 99 boxed, the seat for A100 held by stand-in S. */
{let s = make(M.empty(), 'D', names('A', 100));s = own(s, names('A', 99));s = run(s, {type: 'finalize', deckId: 'D'});s = place(s, 'D', names('A', 99));
  s = own(s, ['S']);s = run(s, {type: 'place', lotId: lotOf(s, 'S').id, deckId: 'D', asStandIn: true, standInFor: slotOf(s, 'D', 'A100').id});
  eq([st(s, 'D').deckTotal, st(s, 'D').boxed], [100, true], 'a hundred in the box, one of them the Substitute S');
  s = own(s, ['A100']);   /* the real copy arrives, owned, and the finalized list reserves it for its seat */
  s = run(s, {type: 'fulfill', deckId: 'D'});
  const real = lotOf(s, 'A100');ok(real.allocation && real.allocation.deckId === 'D', 'the real copy is reserved for the seat S holds');
  const p = M.boxCommands(s, [real.id]);
  eq(p.decks.map((d) => [d.name, d.count, d.before, d.after, d.legalAfter]), [['D', 1, 100, 100, true]], 'boxing it keeps the box at 100: S steps out');
  const after = apply(s, p);
  eq([lotOf(after, 'S').location.kind, lotOf(after, 'A100').location.kind, lotOf(after, 'S').standInFor], ['bench', 'deck', undefined], 'S is on the Bench, A100 in the deck');
  eq([st(after, 'D').final, st(after, 'D').substitute, st(after, 'D').boxed], [100, 0, true], 'and the deck reads 100 Final, Boxed');
}

/* 4. Assign. D is Boxed with a hundred; Z is owned, on the Bench, and not on the list. */
const full = () => {let s = make(M.empty(), 'D', names('A', 100));s = own(s, names('A', 100));s = run(s, {type: 'finalize', deckId: 'D'});return place(s, 'D', names('A', 100));};
{let s = full();s = own(s, ['Z']);
  const item = {recordId: lotOf(s, 'Z').id, kind: 'lot', lotId: lotOf(s, 'Z').id, cardId: 'card:Z', quantity: 1};
  let p = M.assignCommands(s, [item], 'D', {});
  eq([p.needs, p.command], [[item.recordId], null], 'Z is not on the list and no seat is named: it asks, and plans nothing');
  const seat = slotOf(s, 'D', 'A7').id;
  p = M.assignCommands(s, [item], 'D', {[item.recordId]: seat});
  eq(p.lines.map((x) => [x.name, x.how, x.replaces]), [['Z', 'reserved', 'A7']], 'Z replaces A7 and is reserved');
  const after = apply(s, p);
  eq([read(after, 'Z').use, read(after, 'Z').play, read(after, 'Z').inBox], ['final', 'loading', false], 'Z is assigned and on the Bench until boxed (the pill reads Reserved)');
  eq([read(after, 'A7').use, read(after, 'A7').inBox, read(after, 'A7').holds], ['substitute', true, 'card:Z'], 'A7 stays in the box as the Substitute holding the seat');
  eq([st(after, 'D').deckTotal, st(after, 'D').boxed], [100, true], 'the box still holds 100 while Z waits');
  /* Then Box: Z goes in, A7 comes out, the deck is a hundred Final. */
  const b = M.boxCommands(after, [lotOf(after, 'Z').id]);
  eq(b.warnings.length, 0, 'boxing Z keeps the hundred');
  const done = apply(after, b);
  eq([read(done, 'Z').use, read(done, 'Z').inBox, lotOf(done, 'A7').location.kind, st(done, 'D').final, st(done, 'D').substitute, st(done, 'D').boxed], ['final', true, 'bench', 100, 0, true], 'Z is Final in the box, A7 on the Bench, the deck Boxed');
}
/* A card not in hand becomes a seat to buy, and its Watch record leaves. */
{let s = full();s = own(s, ['W'], 'watching');
  const item = {recordId: lotOf(s, 'W').id, kind: 'lot', lotId: lotOf(s, 'W').id, cardId: 'card:W', quantity: 1};
  const seat = slotOf(s, 'D', 'A9').id;
  const p = M.assignCommands(s, [item], 'D', {[item.recordId]: seat});
  eq(p.lines.map((x) => [x.name, x.how, x.replaces]), [['W', 'to buy', 'A9']], 'W replaces A9 and is to buy');
  const after = apply(s, p);
  eq([after.lots.some((l) => l.cardId === 'card:W'), slotOf(after, 'D', 'W').committed], [false, true], 'the Watch record is gone and W is a committed seat');
  eq([st(after, 'D').reserved.buy, st(after, 'D').substitute, st(after, 'D').deckTotal], [1, 1, 100], 'W reads Reserved · To buy, A9 stands in as the Substitute, the box holds 100');
}
/* The list already wants it: the owned copy is reserved for that seat and the list is unchanged. */
{let s = make(M.empty(), 'D', names('A', 100));s = own(s, names('A', 99));s = run(s, {type: 'finalize', deckId: 'D'});s = place(s, 'D', names('A', 99));
  s = own(s, ['A100']);   /* owned, on the Bench; run fulfill away: assign it by hand */
  const l = lotOf(s, 'A100');if (l.allocation) s = run(s, {type: 'release', lotId: l.id, destination: 'bench'});
  const item = {recordId: lotOf(s, 'A100').id, kind: 'lot', lotId: lotOf(s, 'A100').id, cardId: 'card:A100', quantity: 1};
  const p = M.assignCommands(s, [item], 'D', {});
  eq([p.needs, p.lines.map((x) => [x.name, x.how, x.replaces])], [[], [['A100', 'reserved', '']]], 'the list wants A100: it is reserved with no seat to name');
  const after = apply(s, p);
  eq([read(after, 'A100').use, read(after, 'A100').play], ['final', 'loading'], 'and reads assigned, on the Bench');
}
/* Two cards cannot replace one seat. */
{let s = full();s = own(s, ['Z1', 'Z2']);const seat = slotOf(s, 'D', 'A3').id;
  const items = ['Z1', 'Z2'].map((n) => ({recordId: lotOf(s, n).id, kind: 'lot', lotId: lotOf(s, n).id, cardId: 'card:' + n, quantity: 1}));
  refuses(() => M.assignCommands(s, items, 'D', {[items[0].recordId]: seat, [items[1].recordId]: seat}), /same card, A3/);
}

/* A card already in the deck is left where it is. */
{let s = full();
  const item = {recordId: lotOf(s, 'A4').id, kind: 'lot', lotId: lotOf(s, 'A4').id, cardId: 'card:A4', quantity: 1};
  const p = M.assignCommands(s, [item], 'D', {});
  eq([p.needs, p.command, p.skipped.map((x) => [x.name, x.why])], [[], null, [['A4', 'already in D']]], 'A4 is in D already: nothing to assign, and the receipt says why');
}

/* 6. The seats offered. */
{let s = full();
  const r5 = slotOf(s, 'D', 'A5');s = run(s, {type: 'flag', deckId: 'D', slotId: r5.id, option: true});
  const seats = M.assignSeats(s, 'D');
  eq([seats.length, seats[0].name, seats.some((x) => x.name === 'A1')], [99, 'A5', false], '99 seats (the commander, A1, is not one), the Option-flagged one first');
}

/* 7. To buy: a watched card moves to the To Buy list; a card owned, or one a deck already waits on, stays. */
{let s = make(M.empty(), 'D', names('A', 100));s = own(s, ['W1', 'W2'], 'watching');s = own(s, ['O']);
  const ids = ['W1', 'W2', 'O'].map((n) => lotOf(s, n).id);
  const p = M.wantCommands(s, ids, 2);
  eq([p.moved, p.stays], [2, {own: 1, buy: 2}], 'two watched cards move; the owned one and the two already to buy stay, and each is counted');
  const after = apply(s, p);
  eq([after.lots.some((l) => l.source === 'watching'), after.groups.find((g) => g.id === M.WANT_LIST).entries.map((x) => x.cardId).sort()], [false, ['card:W1', 'card:W2']], 'the Watch records leave and the To Buy list holds the two cards');
  const seen = M.stateReader(after)({kind: 'entry', groupId: M.WANT_LIST, cardId: 'card:W1', id: 'x', quantity: 1});
  eq([seen.use, seen.ownership], ['unowned', 'buy'], 'and each reads To buy');
  eq(M.wantCommands(s, [lotOf(s, 'O').id], 0).command, null, 'an owned card alone has nothing to move');
}

console.log(`library-set-status: ${checks} checks passed — Box takes each copy to its deck's box, warns and still boxes when the box is not the hundred, and swaps out the Substitute; Assign reserves or replaces, naming what it needs.`);
