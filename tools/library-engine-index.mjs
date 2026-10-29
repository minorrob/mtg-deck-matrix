#!/usr/bin/env node
/* WHICH OF ROB'S CARDS CAN THE ENGINE PLAY, AND HOW SHOULD THE REST BE LOADED?
 *
 *   node tools/library-engine-index.mjs                                  # data/live-load.json, report only
 *   node tools/library-engine-index.mjs --live <live-load.json>          # another collection file
 *   node tools/library-engine-index.mjs --out <dir> [--lane-size 30]     # also write the index and one file per load lane
 *   node tools/library-engine-index.mjs --live-decks D1,D2,...           # the decks played from boxes (default: every D<n>)
 *   node tools/library-engine-index.mjs --check-lane <lane.json> ...     # where each card of a lane file stands now
 *   node tools/library-engine-index.mjs --top 180 [--rides faces:walkers,walkers:stack]   # and the next most-played cards
 *   node tools/library-engine-index.mjs ... --review-by-theme            # each lane also reviews its theme's candidates
 *   node tools/library-engine-index.mjs --pool --out <dir>              # every undefined Commander card, sentence reuse first
 *   node tools/library-engine-index.mjs --pool --scope <scope-95.json> # restrict writing/review to the frozen appearance target
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
 * and in one scope: `live` (in a deck played from a box), `deck` (in a design deck), `watched` (watched for a deck: a folded
 * design's card that deck lacks), `library` (owned, ordered, watched or to buy, and in no deck) or `top` (with --top N: one
 * of the N most-played Commander cards, data/engine/top-cards.json, that no table plays and no candidate covers; every
 * candidate of that set joins as well, for the promotion lane).
 *
 * The unloaded cards are then dealt into LANES the way the waves are run (docs/handoff-2026-10-12.md, section 5): one
 * theme per lane so one lane owns each rule its cards need, most-wanted first (the live decks' cards, then the other
 * decks', then the library's, each by how many decks play it and how widely Commander plays it), at most --lane-size a
 * lane. Nothing here writes to the engine; it only reads it. */
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {commanderPool, scorePool, dealPoolLanes, loadScopeFilter} from './library-engine-pool.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (flag, fallback = null) => { const i = process.argv.indexOf(flag); return i > 0 ? process.argv[i + 1] : fallback; };
const read = (rel) => JSON.parse(readFileSync(path.isAbsolute(rel) ? rel : path.join(ROOT, rel), 'utf8'));
const scopePath = arg('--scope');
if (process.argv.includes('--scope') && (!scopePath || scopePath.startsWith('--'))) throw new Error('--scope needs a manifest path');
const scopeRaw = scopePath ? readFileSync(path.resolve(ROOT, scopePath)) : null;
const loadScope = scopeRaw ? JSON.parse(scopeRaw) : null;
// Validate before calibration or any output directory is created.
loadScopeFilter(loadScope);

const {tableDefinition} = await import('../game/engine/cards/definitions.mjs');
const {candidateDefinition} = await import('../game/engine/cards/candidates.mjs');
const {loadCardScripts, loadCardScenarios, loadCardIndex} = await import('../game/tools/engine-cards.mjs');
const {foldName} = await import('../game/engine/cards/index.mjs');
const {compileCard, trustOf} = await import('../game/tools/card-compiler.mjs');
const {createLibrary} = await import('../game/engine/cards/sentences.mjs');
const {calibrate} = await import('../game/tools/sentence-library.mjs');
const {missingFor} = await import('../game/tools/engine-constructs.mjs');

/* A LANE, CHECKED AGAIN: after a session defines its cards, which of them every table plays now. Exit 1 if any is
   still unplayable, so the integration can use it as a gate as well as a report. */
const lanesToCheck = process.argv.flatMap((a, i) => (process.argv[i - 1] === '--check-lane' ? [a] : []));
if (lanesToCheck.length) {
  let open = 0;
  for (const file of lanesToCheck) {
    const lane = read(file), rows = [...lane.cards, ...(lane.review || [])].map((c) => ({c, tier: tableDefinition(c.name) ? 'final' : candidateDefinition(c.name) ? 'candidate' : 'not playable'}));
    const left = rows.filter((r) => r.tier !== 'final');open += left.length;
    console.log(`${lane.lane}: ${rows.length - left.length} of ${rows.length} final${left.length ? '; still not final:' : ''}`);
    for (const {c, tier} of left) console.log(`  ${tier.padEnd(12)} ${c.name}${c.liveDecks?.length ? ` (${c.liveDecks.join(', ')})` : ''}`);
  }
  process.exit(open ? 1 : 0);
}

const livePath = arg('--live', 'data/live-load.json');
const poolMode = process.argv.includes('--pool');
/* T3 is the public oracle universe, independent of a person's collection or deck files. */
const live = poolMode ? {decks: []} : read(livePath);
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
/* A watched card with a deck id is one a folded design (TB1, TB2 -> D1) has that the deck lacks: wanted for that deck. */
for (const [name, q, forId] of live.watching || []) { const e = entry(name); e.watching = (e.watching || 0) + q; if (forId) (e.watchFor ||= []).push(forId); }

/* THE ENGINE'S VIEW OF EACH. */
const oracle = read('data/engine/oracle.json');
const candidatesSummary = read('data/engine/candidates.json').summary;
const byOracle = new Map();
for (const c of oracle.cards) { byOracle.set(foldName(c.name), c); const front = c.name.split(' // ')[0]; if (front !== c.name && !byOracle.has(foldName(front))) byOracle.set(foldName(front), c); }
const included = loadScopeFilter(loadScope, (name) => byOracle.get(foldName(name))?.name ?? name);
const index = loadCardIndex();
if (poolMode) for (const card of commanderPool(oracle, new Set(read('data/commander-banned.json').cards), index.resolve)) entry(card.name).pool = true;
const scripts = loadCardScripts().map((f) => f.script);
const library = createLibrary(scripts);
const calibration = calibrate({scripts, library, scenarios: new Map(loadCardScenarios().map((f) => [f.scenarios.card, f.scenarios])), definition: index.definition});
const trust = trustOf(library, calibration);
const inventory = read('game/docs/engine-inventory.json');
const perCard = {...(inventory.library?.perCard || {}), ...(inventory.deck?.perCard || {}), ...(inventory.top?.perCard || {})};
const top = read('data/engine/top-cards.json').cards;
const rankOf = new Map(top.map((c, i) => [foldName(typeof c === 'string' ? c : c.name), i + 1]));
/* THE NEXT MOST-PLAYED CARDS (--top N): beyond the collection, the N most-played cards that are neither final nor a
   candidate, and every candidate of the set, which a review can promote without writing it again. */
const topCount = Number(arg('--top', 0));
if (topCount && !poolMode) {
  let taken = 0;
  for (const c of top) {
    const name = typeof c === 'string' ? c : c.name;
    if (!included(name) || cards.has(foldName(name)) || tableDefinition(name)) continue;
    const candidate = Boolean(candidateDefinition(name));
    if (!candidate && taken >= topCount) continue;
    if (!candidate) taken++;
    entry(name).top = true;
  }
}

// Apply to collection, top, pool and candidate-review rows before compiling, scoring or dealing any lane.
for (const [key, e] of cards) if (!included(e.name)) cards.delete(key);
for (const e of cards.values()) {
  const record = byOracle.get(foldName(e.name));
  e.rank = rankOf.get(foldName(e.name)) ?? (record ? rankOf.get(foldName(record.name)) : undefined) ?? null;
  if (record) { e.type = record.type; e.layout = record.layout; e.mv = record.mv; e.text = record.text || ''; }
  if (tableDefinition(e.name) || (record && tableDefinition(record.name))) { e.tier = 'final'; continue; }
  if (!poolMode && (candidateDefinition(e.name) || (record && candidateDefinition(record.name)))) { e.tier = 'candidate'; continue; }
  const hand = index.resolve(e.name) || (record && index.resolve(record.name));
  if (hand && !hand.playable) { e.tier = 'defined'; e.problems = hand.problems; continue; }
  if (!record) { e.tier = 'unresolved'; continue; }
  e.tier = 'unloaded';
  e.oracleName = record.name;
  const verdict = compileCard(record, {library, trust, definition: index.definition});
  /* Recompile the whole pool, including stored candidates: current calibration, not a stale generated snapshot. */
  if (poolMode && verdict.status === 'candidate') e.tier = 'candidate';
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
  ['faces', 'Cards with more than one face (split, adventure, modal double-faced, transform, flip, meld) and mutate', (c) => (c.layout && c.layout !== 'normal') || /\bMutate\b/.test(c.text || '')],
  ['walkers', 'Planeswalkers and loyalty: walker abilities, loyalty counters, planeswalker triggers, sagas and battles', (c) => /Planeswalker|Saga|Battle/.test(c.type || '') || /loyalty|planeswalker spell/i.test(c.text || '')],
  ['stack', 'The stack and control: counterspells, "can\'t cast", timing restrictions, flash grants, copies of spells and abilities, storm, phasing, morph, surge, spree, gaining control, cards from outside the game', (c) => /counter target|can't cast|could cast a sorcery|phase out|have flash|has flash|as though it had flash|opponent casts|outside the game|\bmorph\b|\bsurge\b|\bspree\b|gain control|copy target|copy that|copy it\b|target spell|target (instant|sorcery) spell|\bstorm\b|split second/i.test(c.text || '')],
  ['graveyard', 'The graveyard: recursion, death and leave-the-battlefield triggers, mill, manifest, shuffling cards away', (c) => /graveyard|\bdies\b|leaves the battlefield|\bmill|manifest|shuffles? .* into (its|their) owner's library/i.test(c.text || '')],
  ['combat', 'Combat and equipment: attack and block triggers and requirements, evasion, protection, equip, saddle, bushido', (c) => /attack|block|combat|\bequip|double strike|first strike|trample|menace|protection from|bushido|saddle/i.test(c.text || '') || /Equipment/.test(c.type || '')],
  ['mana', 'Lands and mana: land abilities and land types, mana abilities and rituals, mana doubling, extra land drops', (c) => /\bLand\b/.test(c.type || '') || /\badd \{|\badd (one|two|three|X) mana|mana of any|untap (target|all|each) lands?|play an additional land|additional land/i.test(c.text || '')],
  ['tokens', 'Tokens, counters and sacrifice: create, +1/+1 and other counters, sacrifice outlets, lifegain payoffs', (c) => /\btoken|counter on|counters on|\+1\/\+1|sacrifice|proliferate|you gain life|creatures you control get/i.test(c.text || '')],
  ['spells', 'Spells, draws and discards: instants and sorceries, card draw, cost changes, tutors, lands', () => true],
];
const themeOf = (c) => THEMES.find(([, , test]) => test(c))[0];
/* A theme too small to be a session's work rides with the one that shares its rules: two-faced cards with the walkers
   (Garruk Relentless is both). */
const RIDES_WITH = Object.fromEntries((arg('--rides') || 'faces:walkers').split(',').filter(Boolean).map((p) => p.split(':')));
const wanted = (c) => [c.liveDecks.length ? 0 : c.decks.length ? 1 : c.watchFor ? 2 : c.top ? 4 : 3, -c.liveDecks.length, -c.decks.length, c.rank ?? 1e9, c.name];
const cmp = (a, b) => { const x = wanted(a), y = wanted(b); for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1; return 0; };

const all = (poolMode ? scorePool([...cards.values()]) : [...cards.values()]).sort((a, b) => a.name.localeCompare(b.name));
const count = (tier) => all.filter((c) => c.tier === tier).length;
const unloaded = all.filter((c) => c.tier === 'unloaded');
const byTheme = new Map(THEMES.map(([id]) => [id, []]));
for (const c of unloaded) byTheme.get(themeOf(c)).push(c);
for (const [small, host] of Object.entries(RIDES_WITH)) { byTheme.get(host).push(...byTheme.get(small)); byTheme.set(small, []); }
const ridersOf = (id) => Object.keys(RIDES_WITH).filter((k) => RIDES_WITH[k] === id).flatMap((k) => [k, ...ridersOf(k)]);
const labelOf = (id) => [id, ...ridersOf(id)].map((t) => THEMES.find(([x]) => x === t)[1]).join('; ');
const lanes = poolMode ? dealPoolLanes(all, {laneSize, themes: THEMES, themeOf, rides: RIDES_WITH}) : [];
if (!poolMode) for (const [id] of THEMES) {
  const list = byTheme.get(id).sort(cmp), label = labelOf(id);
  const parts = Math.max(1, Math.ceil(list.length / laneSize));
  const per = Math.ceil(list.length / parts);
  for (let p = 0; p < parts && list.length; p++) {
    const slice = list.slice(p * per, (p + 1) * per);
    lanes.push({theme: id, label, cards: slice, part: parts > 1 ? p + 1 : 0});
  }
}
lanes.forEach((l, i) => { l.id = `L${i + 1}-${l.theme}${l.part ? '-' + l.part : ''}`; });
const candidates = all.filter((c) => c.tier === 'candidate').sort(cmp);
/* --review-by-theme: no separate review session; each candidate goes to the lane that owns its theme, as a list to review
   and promote (game/tools/card-waves.mjs) beside the cards to write. A review builds no rule, so the load is balanced: a
   candidate goes to its theme's lane while that lane holds fewer than its share of all the cards, else to the lightest. */
const reviewByTheme = poolMode || process.argv.includes('--review-by-theme');
if (reviewByTheme && !poolMode) {
  const hostOf = (t) => (RIDES_WITH[t] ? hostOf(RIDES_WITH[t]) : t);
  for (const lane of lanes) lane.review = [];
  const share = Math.ceil((unloaded.length + candidates.length) / lanes.length), load = (l) => l.cards.length + l.review.length;
  for (const c of candidates) {
    const own = lanes.find((l) => l.theme === hostOf(themeOf(c)));
    const lane = own && load(own) < share ? own : [...lanes].sort((x, y) => load(x) - load(y))[0];
    lane.review.push(c);
  }
}

/* THE REPORT. */
const scope = (c) => c.liveDecks.length ? 'live' : c.decks.length ? 'deck' : c.watchFor ? 'watched' : c.top ? 'top' : c.pool ? 'pool' : 'library';
console.log(poolMode ? `Commander pool: ${all.length} undefined cards, sentence reuse first` : `${livePath}: ${live.decks.length} decks, ${all.length} distinct cards (live decks: ${[...liveDecks].join(', ')})`);
console.log(`  final ${count('final')} · candidate ${count('candidate')} · defined, refused ${count('defined')} · unloaded ${count('unloaded')} · unresolved ${count('unresolved')}`);
for (const s of ['live', 'deck', 'watched', 'library', 'top', ...(poolMode ? ['pool'] : [])]) {
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
    liveDecks: c.liveDecks, decks: c.decks, ...(c.watchFor ? {watchedFor: c.watchFor} : {}), owned: c.owned, rank: c.rank, type: c.type, layout: c.layout,
    compiler: c.compiler, gaps: c.gaps, why: c.why, needs: c.needs,
    ...(poolMode ? {sentencesNeeded: c.sentencesNeeded, potentialCompletions: c.potentialCompletions, potentialPerSentence: c.potentialPerSentence} : {})});
  const rel = path.relative(ROOT, path.resolve(livePath)).split(path.sep).join('/');
  const source = poolMode ? {pool: true, oracle: oracle.generatedAt ?? null, priority: 'Estimated one-gap completions per missing sentence; actual gains require a post-wave compiler run'} : {collection: rel.startsWith('..') ? path.basename(livePath) : rel, workbook: live.workbook, decks: live.decks.map((d) => d.id),
    liveDecks: [...liveDecks], ...(topCount ? {top: topCount} : {}), candidates: candidatesSummary};
  if (loadScope) source.loadScope = {manifest: path.relative(ROOT, path.resolve(ROOT, scopePath)).split(path.sep).join('/'),
    sha256: createHash('sha256').update(scopeRaw).digest('hex'), share: loadScope.share, names: loadScope.count,
    appearances: loadScope.appearances, coveredAppearances: loadScope.coveredAppearances};
  writeFileSync(path.join(outDir, 'index.json'), JSON.stringify({schema: 'library-engine-index@1', source,
    summary: {cards: all.length, final: count('final'), candidate: count('candidate'), defined: count('defined'), unloaded: count('unloaded'), unresolved: count('unresolved'), verdicts},
    cards: all.map((c) => ({name: c.name, tier: c.tier, scope: scope(c), decks: c.decks, ...(c.watchFor ? {watchedFor: c.watchFor} : {}), owned: c.owned, ...(c.problems ? {problems: c.problems} : {}), ...(c.compiler ? {compiler: c.compiler} : {})}))}, null, 1) + '\n');
  for (const lane of lanes) writeFileSync(path.join(outDir, `lane-${lane.id}.json`), JSON.stringify({schema: 'library-load-lane@1', lane: lane.id, theme: lane.theme, label: lane.label, source, cards: lane.cards.map(slim), ...(lane.review ? {review: lane.review.map(slim)} : {})}, null, 1) + '\n');
  if (!reviewByTheme) writeFileSync(path.join(outDir, 'lane-candidate-review.json'), JSON.stringify({schema: 'library-load-lane@1', lane: 'candidates', theme: 'review', label: 'Candidates to review and promote to final', source, cards: candidates.map(slim)}, null, 1) + '\n');
  console.log(`  wrote ${outDir}: index.json, ${lanes.length} lane files${reviewByTheme ? ` (each with its theme's candidates to review: ${lanes.map((l) => l.review.length).join(' · ')})` : `, lane-candidate-review.json (${candidates.length})`}`);
}
