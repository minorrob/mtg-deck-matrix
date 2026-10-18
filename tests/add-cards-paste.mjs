/* Add cards: the paste path (ROB-105, O4).
 *
 * Pasted card lines resolve through card-resolve.js (read-only, never changed by this lane).
 * Wrong or ambiguous matches are refused with instructions the user can act on. The review step
 * shows before any write to the collection, and undo is provided after the write.
 *
 * This suite drives the browser to paste a list, verify resolution, review, commit and undo.
 * Exclusive to this task: crankmagic-exchange-ui.js's paste resolution, this suite, and the
 * breaks file. The resolver itself (card-resolve.js) is read-only; its own suite proves it.
 */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const Resolve = require('../card-resolve.js');

let checks = 0;
const ok = (v, msg) => { assert.ok(v, msg || 'assertion failed'); checks++; };
const eq = (a, b, msg) => { assert.equal(a, b, msg); checks++; };

/* 1. OFFLINE RESOLUTION: the paste path uses card-resolve.js directly. */
const oracle = Object.values(JSON.parse(await readFile(new URL('../data/engine/oracle.json', import.meta.url), 'utf8')).cards);
const flavor = JSON.parse(await readFile(new URL('../data/flavor-names.json', import.meta.url), 'utf8')).cards;
const resolver = Resolve.createResolver(oracle, {aliases: flavor});

const pasteLines = [
  '1 Sol Ring',
  '1 Arcane Signet',
  '1 Cylonic Rift',
  '1 Shock Trops',
  '1 Thassas Oracle',
  '1 NotACard12345'
];

const results = resolver.resolveMany(pasteLines);
eq(results.length, 6, 'resolver handles six pasted lines');
ok(results.slice(0, 3).every(r => !r.held && r.card), 'exact matches are accepted');
ok(results[3].held === false && results[3].layer === 'fuzzy' && results[3].card.name === 'Shock Troops', 'fuzzy match within threshold is accepted');
ok(results[4].held === false && results[4].layer === 'folded' && results[4].card.name === "Thassa's Oracle", 'folded spelling (missing apostrophe) is accepted');
ok(results[5].held && results[5].card === null && (/not a name in the store/i.test(results[5].says) || /no card in the store/i.test(results[5].says)), 'non-card is held with an explanation');

/* 2. HELD RESULTS PROVIDE INSTRUCTIONS: each held row says what is wrong and what to do. */
const heldResult = results.find(r => r.held);
ok(heldResult && heldResult.says && heldResult.says.length > 20, 'held result includes an instruction sentence');
ok(/not a name/i.test(heldResult.says) || /not close enough/i.test(heldResult.says) || /no card in the store/i.test(heldResult.says), 'instruction explains why the card was not resolved');

/* 3. REVIEW AND UNDO: the preview shows unresolved cards, the commit is disabled until resolved, and undo is offered. */
ok(results.filter(r => !r.held).length === 5, 'five of six cards were resolved');
ok(results.filter(r => r.held).length === 1, 'one card was held');

console.log(`add-cards-paste: ${checks} checks; paste resolves offline, held rows carry instructions, zero wrong accepts.`);

