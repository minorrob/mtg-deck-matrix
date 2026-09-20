import test from 'node:test';
import assert from 'node:assert/strict';
import {parseDeckList} from '../contracts/deck-list-import.mjs';

const ninetyNine = (n = 98) => `${n} Forest\n1 Sol Ring`;

/* THE FORMAT THE INVITATION EMAIL ACTUALLY ASKS FOR. It says "[Count] [Card Name]", gives
 * "1 Chulane, Teller of Tales" as the example, and puts the commander FIRST. The parser it was
 * feeding took comma-separated columns with the commander LAST, so it read that example line as
 * the two cells "1 Chulane" and "Teller of Tales" and refused the deck. Anybody who followed the
 * instructions they were sent could not import. */
test('the format the invitation email asks for imports, commander first', () => {
  const value = parseDeckList(`1 Chulane, Teller of Tales\n\n${ninetyNine()}`, {name: 'Friend deck'});
  assert.deepEqual(value.commanders, ['Chulane, Teller of Tales'], 'a comma inside the name is part of the name');
  assert.equal(value.name, 'Friend deck');
  assert.deepEqual(value.rows, [{quantity: 98, name: 'Forest'}, {quantity: 1, name: 'Sol Ring'}]);
});

test('commander last reads the same, because people paste it both ways', () => {
  const value = parseDeckList(`${ninetyNine()}\n\n1 Chulane, Teller of Tales`);
  assert.deepEqual(value.commanders, ['Chulane, Teller of Tales']);
  assert.equal(value.rows.length, 2);
});

test('a Commander header works instead of a blank line', () => {
  const value = parseDeckList(`Commander\n1 Chulane, Teller of Tales\nDeck\n${ninetyNine()}`);
  assert.deepEqual(value.commanders, ['Chulane, Teller of Tales']);
  assert.equal(value.rows.reduce((n, c) => n + c.quantity, 0), 99);
});

test('the shapes real exports arrive in', () => {
  // Archidekt and Moxfield text exports carry an x, a set code and a collector number.
  const archidekt = parseDeckList('1x Chulane, Teller of Tales (ELD) 326 *F*\n\n98x Forest (M10) 246\n1x Sol Ring [C21]');
  assert.deepEqual(archidekt.commanders, ['Chulane, Teller of Tales'], 'printing details are not part of the name');
  assert.deepEqual(archidekt.rows, [{quantity: 98, name: 'Forest'}, {quantity: 1, name: 'Sol Ring'}]);

  // "Export it to excel", which the same email suggests, pastes as tabs.
  const excel = parseDeckList('98\tForest\n1\tSol Ring\n\n1\tChulane, Teller of Tales');
  assert.deepEqual(excel.commanders, ['Chulane, Teller of Tales']);
  assert.equal(excel.rows[0].quantity, 98);

  // Two-column CSV, both column orders, quoted names -- the shape that already worked.
  const csv = parseDeckList('Card Name,Count\nForest,97\n"Temple, Garden",2\n\n"Chulane, Teller of Tales",1');
  assert.deepEqual(csv.rows[1], {name: 'Temple, Garden', quantity: 2});
  const reversed = parseDeckList('Quantity,Name\r\n97,Forest\r\n1,Sol Ring\r\n\r\n1,Partner One\r\n1,Partner Two\r\n');
  assert.deepEqual(reversed.commanders, ['Partner One', 'Partner Two'], 'partners are two single cards');

  // A bare name is one copy, which is how a lot of people write a list out by hand.
  const bare = parseDeckList(`Sol Ring\nTemple, Garden\n${Array.from({length: 97}, (_, i) => `Card ${i}`).join('\n')}\n\nChulane, Teller of Tales`);
  assert.equal(bare.rows.length, 99);
  assert.deepEqual(bare.rows[1], {quantity: 1, name: 'Temple, Garden'});
});

test('sections that are not the deck are left out', () => {
  const value = parseDeckList(`Commander\n1 Chulane, Teller of Tales\nDeck (99)\n${ninetyNine()}\nSideboard\n1 Not In This Deck\nMaybeboard\n5 Nor This`);
  assert.equal(value.rows.reduce((n, c) => n + c.quantity, 0), 99);
  assert.ok(!value.rows.some((c) => c.name.startsWith('Not In')), 'a sideboard is not part of a Commander deck');
});

test('what it refuses, and why', () => {
  // With a hundred cards and no marker there is nothing to go on, so it asks rather than guesses.
  assert.throws(() => parseDeckList('1 Sol Ring\n99 Forest'), /blank line/);
  assert.throws(() => parseDeckList(`1 Chulane, Teller of Tales\n\n50 Forest`), /exactly 100 cards.*this list has 51/);
  assert.throws(() => parseDeckList(`2 Chulane, Teller of Tales\n\n${ninetyNine()}`), /single-card/);
  assert.throws(() => parseDeckList(`1 Sol Ring\n\n${ninetyNine()}`), /appears twice/);
  assert.throws(() => parseDeckList(''), /empty or too large/);
});

/* A hundred-line list with one bad line should say which line. Making somebody re-read the whole
 * paste to find it is how a guest gives up and asks the host to do it for them. */
test('a line that cannot be read is reported by its number', () => {
  try {
    parseDeckList(`1 Chulane, Teller of Tales\n\n97 Forest\n"Truncated Ring,1\n900 Plains`);
    assert.fail('should have thrown');
  } catch (error) {
    assert.match(error.message, /2 lines could not be read/);
    assert.deepEqual(error.lineErrors.map((e) => e.line), [4, 5], 'every bad line, by number');
    assert.match(error.lineErrors[0].reason, /Unclosed quote/);
    assert.match(error.lineErrors[0].text, /Truncated Ring/, 'the offending text comes back with it');
    assert.match(error.lineErrors[1].reason, /above 100/);
  }
});
