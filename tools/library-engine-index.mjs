#!/usr/bin/env node
/* WHICH OF ROB'S CARDS CAN THE ENGINE PLAY, AND HOW SHOULD THE REST BE LOADED?
 *
 *   node tools/library-engine-index.mjs                                  # data/live-load.json, report only
 *   node tools/library-engine-index.mjs --live <live-load.json>          # another collection file
 *   node tools/library-engine-index.mjs --out <dir> [--lane-size 30]     # also write the index and one file per load lane
 *   node tools/library-engine-index.mjs --live-decks D1,D2,...           # the decks played from boxes (default: every D<n>)
 *
 * Every card the collection names (each deck's hundred, everything owned, ordered or on the buy list) is put in one tier,
 * the way a table would see it:
 *
 *   final       the card directory defines it (`tableDefinition`): every table plays it
 *   candidate   the card compiler's or the backstop's (`candidateDefinition`): playtest tables only, labeled, until a
 *               wave reviews and promotes it (`game/tools/card-waves.mjs --review / --promote`)
 *   defined     a hand definition exists but the engine refuses it by name (its problems are listed)
 *   unloaded    nothing plays it; the compiler's verdict says why (structure, unknown sentences, vetoed, blocked,
 *               refused), and the coverage tool's measure says what the engine still lacks
 *   unresolved  the oracle data has no card of that name (not Commander legal, banned, or a misspelling)
 *
 * The unloaded cards are then dealt into LANES the way the waves are run (docs/handoff-2026-10-12.md, section 5): one
 * theme per lane so one lane owns each rule its cards need, most-wanted first (the live decks' cards, then the other
 * decks', then the library's, each by how many decks play it and how widely Commander plays it), at most --lane-size a
 * lane. Nothing here writes to the engine; it only reads it. */
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (flag, fallback = null) => { const i = process.argv.indexOf(flag); return i > 0 ? process.argv[i + 1] : fallback; };
const read = (rel) => JSON.parse(readFileSync(path.isAbsolute(rel) ? rel : path.join(ROOT, rel), 'utf8'));

const {tableDefinition} = await import('../game/engine/cards/definitions.mjs');
const {candidateDefinition} = await import('../game/engine/cards/candidates.mjs');
const {loadCardScripts, loadCardScenarios, loadCardIndex} = await import('../game/tools/engine-cards.mjs');
const {foldName} = await import('../game/engine/cards/index.mjs');
const {compileCard, trustOf} = await import('../game/tools/card-compiler.mjs');
const {createLibrary} = await import('../game/engine/cards/sentences.mjs');
const {calibrate} = await import('../game/tools/sentence-library.mjs');
const {missingFor} = await import('../game/tools/engine-constructs.mjs');

const livePath = arg('--live', 'data/live-load.json');
const live = read(livePath);
const laneSize = Number(arg('--lane-size', 30));
const outDir = arg('--out');
const liveDecks = new Set((arg('--live-decks') || live.decks.filter((d) => /^D\d+$/.test(d.id)).map((d) => d.id).join(',')).split(',').filter(Boolean));

/* EVERY NAME THE COLLECTION HOLDS, with where it is. */
const cards = new Map();
const entry = (name) => { const k = foldName(name); if (!cards.has(k)) cards.set(k, {name, decks: [], liveDecks: [], owned: 0, ordered: 0, buy: 0}); return cards.get(k); };
for (const d of live.decks) for (const [name] of d.cards) { const e = entry(name); e.decks.push(d.id); if (liveDecks.has(d.id)) e.liveDecks.push(d.id); }
for (const d of live.decks) { const lead = [].concat(d.commander || []); for (const name of lead) if (name) { const e = entry(name); if (!e.decks.includes(d.id)) e.decks.push(d.id); e.commander = true; } }
for (const list of Object.values(live.owned?.inDeck || {})) for (const [name, q] of list) entry(name).owned += q;
for (const [name, q] of live.owned?.bench || []) entry(name).owned += q;
for (const [name, q] of live.ordered || []) entry(name).ordered += q;
for (const [name, q] of live.buy || []) entry(name).buy += q;

/* THE ENGINE'S VIEW OF EACH. */
const oracle = read('data/engine/oracle.json');
const byOracle = new Map();
for (const c of oracle.cards) { byOracle.set(foldName(c.name), c); const front = c.name.split(' // ')[0]; if (front !== c.name && !byOracle.has(foldName(front))) byOracle.set(foldName(front), c); }
const index = loadCardIndex();
const scripts = loadCardScripts().map((f) => f.script);
const library = createLibrary(scripts);
const calibration = calibrate({scripts, library, scenarios: new Map(loadCardScenarios().map((f) => [f.scenarios.card, f.scenarios])), definition: index.definition});
const trust = trustOf(library, calibration);
const inventory = read('game/docs/engine-inventory.json');
const perCard = {...(inventory.library?.perCard || {}), ...(inventory.deck?.perCard || {}), ...(inventory.top?.perCard || {})};
const top = read('data/engine/top-cards.json').cards;
const rankOf = new Map(top.map((c, i) => [foldName(typeof c === 'string' ? c : c.name), i + 1]));

for (const e of cards.values()) {
  const record = byOracle.get(foldName(e.name));
  e.rank = rankOf.get(foldName(e.name)) ?? (record ? rankOf.get(foldName(record.name)) : undefined) ?? null;
  if (record) { e.type = record.type; e.layout = record.layout; e.mv = record.mv; }
  if (tableDefinition(e.name) || (record && tableDefinition(record.name))) { e.tier = 'final'; continue; }
  if (candidateDefinition(e.name) || (record && candidateDefinition(record.name))) { e.tier = 'candidate'; continue; }
  const hand = index.resolve(e.name) || (record && index.resolve(record.name));
  if (hand && !hand.playable) { e.tier = 'defined'; e.problems = hand.problems; continue; }
  if (!record) { e.tier = 'unresolved'; continue; }
  e.tier = 'unloaded';
  e.oracleName = record.name;
  const verdict = compileCard(record, {library, trust, definition: index.definition});
  e.compiler = verdict.status;
  if (verdict.gaps) e.gaps = verdict.gaps.map((g) => String(g).replace(/\s+/g, ' ').trim());
  if (verdict.why) e.why = verdict.why;
  const inv = perCard[record.name] || perCard[e.name];
  e.needs = inv ? missingFor(inv).map((g) => `${g.kind}:${g.name}`) : null;
  e.text = record.text || '';
}

/* THE LANES. One theme each, the waves' four (docs/handoff-2026-10-12/BRIEF-wave.md) plus the shapes that are their own
   construct: more than one face, and planeswalkers. The first theme a card's type line and text match wins. */
const THEMES = [
  ['faces', 'Cards with more than one face: split, adventure, modal double-faced, transform, flip, meld', (c) => c.layout && c.layout !== 'normal'],
  ['walkers', 'Planeswalkers, sagas, battles and other loyalty, lore and defense cards', (c) => /Planeswalker|Saga|Battle/.test(c.type || '')],
  ['lands', 'Lands: land types, land drops, mana from lands', (c) => /\bLand\b/.test(c.type || '')],
  ['graveyard', 'The graveyard and combat: recursion, mill, flashback, attacks, blocks, combat damage', (c) => /graveyard|mill|flashback|unearth|escape|embalm|disturb|attack|block|combat damage|first strike|double strike|deathtouch|menace|trample/i.test(c.text || '')],
  ['tokens', 'Tokens and counters: create, +1/+1 and other counters, proliferate, anthems', (c) => /\btoken|counter on|counters on|\+1\/\+1|proliferate|creatures you control get/i.test(c.text || '')],
  ['spells', 'Spells, draws and discards: instants and sorceries, card draw, copies, cost changes, tutors', () => true],
];
const themeOf = (c) => THEMES.find(([, , test]) => test(c))[0];
const wanted = (c) => [c.liveDecks.length ? 0 : c.decks.length ? 1 : 2, -c.liveDecks.length, -c.decks.length, c.rank ?? 1e9, c.name];
const cmp = (a, b) => { const x = wanted(a), y = wanted(b); for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1; return 0; };

const all = [...cards.values()].sort((a, b) => a.name.localeCompare(b.name));
const count = (tier) => all.filter((c) => c.tier === tier).length;
const unloaded = all.filter((c) => c.tier === 'unloaded');
const byTheme = new Map(THEMES.map(([id]) => [id, []]));
for (const c of unloaded) byTheme.get(themeOf(c)).push(c);
const lanes = [];
for (const [id, label] of THEMES) {
  const list = byTheme.get(id).sort(cmp);
  const parts = Math.max(1, Math.ceil(list.length / laneSize));
  const per = Math.ceil(list.length / parts);
  for (let p = 0; p < parts && list.length; p++) {
    const slice = list.slice(p * per, (p + 1) * per);
    lanes.push({id: parts > 1 ? `${id}-${p + 1}` : id, theme: id, label, cards: slice});
  }
}
const candidates = all.filter((c) => c.tier === 'candidate').sort(cmp);

/* THE REPORT. */
const scope = (c) => c.liveDecks.length ? 'live' : c.decks.length ? 'deck' : 'library';
console.log(`${livePath}: ${live.decks.length} decks, ${all.length} distinct cards (live decks: ${[...liveDecks].join(', ')})`);
console.log(`  final ${count('final')} · candidate ${count('candidate')} · defined, refused ${count('defined')} · unloaded ${count('unloaded')} · unresolved ${count('unresolved')}`);
for (const s of ['live', 'deck', 'library']) {
  const of = all.filter((c) => scope(c) === s);
  console.log(`  ${s.padEnd(8)} ${String(of.length).padStart(5)} cards: final ${of.filter((c) => c.tier === 'final').length}, candidate ${of.filter((c) => c.tier === 'candidate').length}, unloaded ${of.filter((c) => c.tier === 'unloaded').length}`);
}
const verdicts = {};
for (const c of unloaded) verdicts[c.compiler] = (verdicts[c.compiler] || 0) + 1;
console.log('  unloaded by compiler verdict:', JSON.stringify(verdicts), `· one sentence short: ${unloaded.filter((c) => c.compiler === 'unknown' && c.gaps?.length === 1).length}`);
console.log('  lanes:', lanes.map((l) => `${l.id} ${l.cards.length}`).join(' · '));
const unresolvedNames = all.filter((c) => c.tier === 'unresolved').map((c) => c.name);
if (unresolvedNames.length) console.log('  unresolved:', unresolvedNames.join('; '));

if (outDir) {
  mkdirSync(outDir, {recursive: true});
  const slim = (c) => ({name: c.name, ...(c.oracleName && c.oracleName !== c.name ? {oracleName: c.oracleName} : {}), scope: scope(c),
    liveDecks: c.liveDecks, decks: c.decks, owned: c.owned, rank: c.rank, type: c.type, layout: c.layout,
    compiler: c.compiler, gaps: c.gaps, why: c.why, needs: c.needs});
  const source = {collection: path.relative(ROOT, path.resolve(livePath)).split(path.sep).join('/'), workbook: live.workbook, decks: live.decks.map((d) => d.id),
    liveDecks: [...liveDecks], candidates: read('data/engine/candidates.json').summary};
  writeFileSync(path.join(outDir, 'index.json'), JSON.stringify({schema: 'library-engine-index@1', source,
    summary: {cards: all.length, final: count('final'), candidate: count('candidate'), defined: count('defined'), unloaded: count('unloaded'), unresolved: count('unresolved'), verdicts},
    cards: all.map((c) => ({name: c.name, tier: c.tier, scope: scope(c), decks: c.decks, owned: c.owned, ...(c.problems ? {problems: c.problems} : {}), ...(c.compiler ? {compiler: c.compiler} : {})}))}, null, 1) + '\n');
  for (const lane of lanes) writeFileSync(path.join(outDir, `lane-${lane.id}.json`), JSON.stringify({schema: 'library-load-lane@1', lane: lane.id, theme: lane.theme, label: lane.label, source, cards: lane.cards.map(slim)}, null, 1) + '\n');
  writeFileSync(path.join(outDir, 'lane-candidates.json'), JSON.stringify({schema: 'library-load-lane@1', lane: 'candidates', theme: 'review', label: 'Candidates to review and promote to final', source, cards: candidates.map(slim)}, null, 1) + '\n');
  console.log(`  wrote ${outDir}: index.json, ${lanes.length} lane files, lane-candidates.json (${candidates.length})`);
}
