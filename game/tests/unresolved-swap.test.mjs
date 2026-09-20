import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {describeUnresolved, replacementsOf, searchCatalog, renderSwapPanel} from '../ui/unresolved.mjs';
import {applyReplacements} from '../tools/setup-catalog.mjs';

/* The refusal exactly as ai-compatibility.mjs builds it and both servers forward it (B.2). */
const refusal = [
  {name: 'Lim-Dûl’s Vault', quantity: 1, reason: 'This engine has no card script by that name', suggestions: ["lim-dul's vault", "lim-dul's paladin"]},
  {name: 'Sol Rng', quantity: 1, reason: 'This engine has no card script by that name', suggestions: []},
];
const catalog = [
  {name: 'Sol Ring', typeLine: 'Artifact', manaCost: '{1}', colorIdentity: [], legalities: {commander: 'legal'}, imageSmall: 'https://img/sol-ring-small.jpg', image: 'https://img/sol-ring.jpg', price: 1.2},
  {name: 'Sol Talisman', typeLine: 'Artifact', manaCost: '', colorIdentity: [], legalities: {commander: 'legal'}, imageSmall: 'https://img/sol-talisman.jpg'},
  {name: "Lim-Dûl's Vault", typeLine: 'Instant', manaCost: '{U}{B}', colorIdentity: ['U', 'B'], legalities: {commander: 'legal'}, imageSmall: 'https://img/ldv.jpg'},
  {name: 'Solemn Simulacrum', typeLine: 'Artifact Creature — Golem', colorIdentity: [], legalities: {commander: 'legal'}, imageSmall: 'https://img/solemn.jpg'},
  {name: 'Sol Ring (banned twin)', typeLine: 'Artifact', colorIdentity: [], legalities: {commander: 'banned'}, imageSmall: ''},
  {name: 'Mountain', typeLine: 'Basic Land — Mountain', colorIdentity: [], legalities: {commander: 'legal'}},
];

/* A fake element with enough DOM for the panel: properties, children, listeners. */
function fakeEl(tag, className = '', textContent = '') {
  const node = {tag, className, textContent, children: [], listeners: {}, hidden: false, disabled: false, value: '', attrs: {},
    append(...kids) { this.children.push(...kids); }, replaceChildren(...kids) { this.children = kids; },
    addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }, setAttribute(k, v) { this.attrs[k] = v; }};
  return node;
}
const fire = (node, type, ev = {}) => (node.listeners[type] || []).forEach((fn) => fn(ev));
const find = (node, cls) => { if (String(node.className).split(' ').includes(cls)) return node; for (const k of node.children) { const hit = find(k, cls); if (hit) return hit; } return null; };
const findAll = (node, cls, out = []) => { if (String(node.className).split(' ').includes(cls)) out.push(node); for (const k of node.children) findAll(k, cls, out); return out; };

test('the refusal becomes one row per unknown card, with Forge\'s first suggestion prefilled', () => {
  const d = describeUnresolved(refusal, {seatName: 'Pat'});
  assert.equal(d.rows.length, 2);
  assert.equal(d.headline, 'Pat: Forge does not recognize 2 cards. Choose a replacement for each, then validate again.');
  assert.deepEqual(d.rows.map((r) => [r.name, r.to]), [['Lim-Dûl’s Vault', "lim-dul's vault"], ['Sol Rng', '']]);
  assert.equal(d.complete, false, 'one row has no suggestion, so the swap is not complete');
  assert.deepEqual(describeUnresolved([]).rows, []);
  assert.deepEqual(replacementsOf(d.rows), [], 'no pairs are sent while a row is blank');
  d.rows[1].to = 'Sol Ring';
  assert.deepEqual(replacementsOf(d.rows), [{from: 'Lim-Dûl’s Vault', to: "lim-dul's vault"}, {from: 'Sol Rng', to: 'Sol Ring'}]);
});

test('the catalog search finds by word prefix, then substring, Commander-legal only, and carries type and art', () => {
  assert.deepEqual(searchCatalog(catalog, 'sol').map((h) => h.name), ['Sol Ring', 'Sol Talisman', 'Solemn Simulacrum']);
  assert.deepEqual(searchCatalog(catalog, 'ring').map((h) => h.name), ['Sol Ring']);
  assert.deepEqual(searchCatalog(catalog, 'lim dul').map((h) => h.name), ["Lim-Dûl's Vault"], 'accents and punctuation fold');
  assert.deepEqual(searchCatalog(catalog, 'sol ring').map((h) => h.name), ['Sol Ring'], 'the exact name comes first and the banned twin is left out');
  const hit = searchCatalog(catalog, 'sol ring')[0];
  assert.equal(hit.typeLine, 'Artifact');
  assert.equal(hit.image, 'https://img/sol-ring-small.jpg');
  assert.deepEqual(searchCatalog(catalog, 'vault', {colorIdentity: ['R']}), [], 'a card outside the commander\'s colours is not offered');
  assert.deepEqual(searchCatalog(catalog, 'vault', {colorIdentity: ['U', 'B', 'G']}).map((h) => h.name), ["Lim-Dûl's Vault"]);
  assert.deepEqual(searchCatalog(catalog, ''), []);
  assert.equal(searchCatalog(catalog, 'sol', {limit: 2}).length, 2);
});

test('the panel draws a row per card with the suggestion buttons, a search with type and art on hover, and submits the pairs', async () => {
  let sent = null;
  const panel = renderSwapPanel(refusal, {el: fakeEl, cards: catalog, seatName: 'Pat', onSubmit: (pairs) => { sent = pairs; }});
  assert.equal(panel.className, 'swap-panel');
  assert.equal(find(panel, 'swap-title').textContent, 'Cards Forge does not have');
  const rows = findAll(panel, 'swap-row');
  assert.equal(rows.length, 2);
  assert.equal(find(rows[0], 'swap-name').textContent, 'Lim-Dûl’s Vault');
  assert.equal(find(rows[0], 'swap-reason').textContent, 'This engine has no card script by that name');
  assert.equal(findAll(rows[0], 'swap-suggestion').length, 2, 'Forge\'s suggestions are one click each');
  const submit = find(panel, 'swap-submit');
  assert.equal(submit.disabled, true, 'the button waits until every row has a choice');
  /* the second row: type, see hits with type line, hover for art, pick */
  const input = find(rows[1], 'swap-input');
  input.value = 'sol';
  fire(input, 'input');
  await new Promise((r) => setTimeout(r, 0));   /* the hits render once the catalog promise has settled */
  const hits = find(rows[1], 'swap-hits');
  assert.equal(hits.hidden, false);
  assert.deepEqual(hits.children.map((li) => find(li, 'swap-hit-name').textContent), ['Sol Ring', 'Sol Talisman', 'Solemn Simulacrum']);
  assert.equal(find(hits.children[0], 'swap-hit-type').textContent, 'Artifact');
  const art = find(rows[1], 'swap-art');
  assert.equal(art.hidden, true, 'no art until a hit is hovered');
  fire(find(hits.children[0], 'swap-hit-pick'), 'mouseenter');
  assert.equal(art.hidden, false);
  assert.equal(art.src, 'https://img/sol-ring-small.jpg', 'hover shows the card');
  fire(find(hits.children[0], 'swap-hit-pick'), 'click');
  assert.equal(input.value, 'Sol Ring');
  assert.equal(find(rows[1], 'swap-chosen').textContent, 'Sol Ring · Artifact');
  assert.equal(hits.hidden, true);
  assert.equal(submit.disabled, false, 'both rows have a choice now');
  fire(submit, 'click');
  assert.deepEqual(sent, [{from: 'Lim-Dûl’s Vault', to: "lim-dul's vault"}, {from: 'Sol Rng', to: 'Sol Ring'}]);
});

test('the seat builder applies the swaps to the rows before Forge is consulted, without touching the source list', () => {
  const rows = [{name: 'Sol Rng', quantity: 1}, {name: 'Lim-Dûl’s Vault', quantity: 1}, {name: 'Mountain', quantity: 30}];
  const swapped = applyReplacements(rows, [{from: 'sol rng', to: 'Sol Ring'}, {from: 'Lim-Dûl’s Vault', to: "Lim-Dûl's Vault"}]);
  assert.deepEqual(swapped.map((r) => r.name), ['Sol Ring', "Lim-Dûl's Vault", 'Mountain'], 'matched by folded name, case and punctuation aside');
  assert.deepEqual(rows.map((r) => r.name), ['Sol Rng', 'Lim-Dûl’s Vault', 'Mountain'], 'the caller\'s rows are not mutated: preloaded lists are shared');
  assert.equal(swapped[0].quantity, 1);
  assert.deepEqual(applyReplacements(rows, undefined), rows, 'nothing to apply returns the rows as they are');
  assert.throws(() => applyReplacements(rows, [{from: 'x'}]), /replacement/i, 'a pair without a `to` is refused');
  assert.throws(() => applyReplacements(rows, 'Sol Ring'), /replacement/i);
  assert.throws(() => applyReplacements(rows, Array.from({length: 101}, () => ({from: 'a', to: 'b'}))), /replacement/i, 'a hundred is the most a deck could need');
  const src = readFileSync(new URL('../tools/setup-catalog.mjs', import.meta.url), 'utf8');
  assert.match(src, /applyReplacements\(d\.rows,\s*s\.replacements\)/, 'prepareSeat applies them to the assembled rows');
  assert.match(src, /replacements:\s*input\?\.replacements/, 'and a guest deck carries them from the gateway');
  assert.ok(src.indexOf('applyReplacements(d.rows') < src.indexOf('s.aiCompatibility=compatibility('), 'the swap lands before the Forge check, which is the point');
});

test('both pages draw the swap and both servers publish the module', () => {
  const read = (p) => readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
  assert.match(read('game/ui/guest.mjs'), /from '\/unresolved\.mjs'/, 'the guest seat lobby draws it');
  assert.match(read('game/ui/setup.mjs'), /from '\/unresolved\.mjs'/, 'the host page draws it');
  assert.match(read('game/ui/guest.mjs'), /error\.unresolved/, 'and the guest page acts on the refusal\'s list rather than its sentence');
  assert.match(read('game/ui/setup.mjs'), /error\.unresolved/, 'as does the host page');
  assert.match(read('game/server/guest-gateway.mjs'), /\['\/unresolved\.mjs',\['text\/javascript; charset=utf-8','unresolved\.mjs'\]\]/);
  assert.match(read('game/tools/serve-review.mjs'), /files\.set\('\/unresolved\.mjs',\['game\/ui\/unresolved\.mjs','text\/javascript'\]\)/);
  assert.match(read('game/tools/serve-review.mjs'), /'unresolved\.mjs'/, 'and the host hands it to the guest gateway');
  for (const css of ['game/ui/guest.css', 'game/ui/setup.css']) assert.match(read(css), /\.swap-panel/, css + ' styles it');
});
