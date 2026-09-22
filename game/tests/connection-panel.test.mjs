import test from 'node:test';
import assert from 'node:assert/strict';
import {describeReadiness, renderConnectionPanel, quietLabel} from '../ui/connection.mjs';
import {countdownBlockers, createTable, transitionTable} from '../contracts/table-lifecycle.mjs';

/* A readiness object built the way the broker builds it, from a real table and the same blocker
   list the countdown transition consumes, so this suite cannot drift from the contract. */
function readinessOf(table, {now = 0, presence = {}} = {}) {
  const blockers = countdownBlockers(table), reasons = new Map();
  for (const b of blockers) if (b.seatId !== null && !reasons.has(b.seatId)) reasons.set(b.seatId, b.reason);
  return {schema: 'CrankMagicTableReadiness@1', phase: table.phase, ok: blockers.length === 0 && table.phase === 'selecting',
    table: blockers.filter(b => b.seatId === null).map(b => b.reason),
    seats: table.seats.map(seat => ({seatId: seat.seatId, kind: seat.kind, name: seat.name, claimed: seat.occupied, connected: seat.connected,
      deckValidated: !!seat.deckVersion, ready: seat.ready,
      quietForMs: seat.kind === 'human' && seat.occupied ? Math.max(0, now - (presence[seat.seatId] ?? now)) : null,
      blocking: seat.occupied ? reasons.get(seat.seatId) ?? null : null})),
    waitingOn: table.seats.filter(s => s.occupied && reasons.has(s.seatId)).map(s => `${s.name || 'Seat ' + (s.seatId + 1)} (${reasons.get(s.seatId)})`)};
}
const fresh = () => createTable({tableId: 't', seats: [{seatId: 0, kind: 'human', occupied: true, name: 'Rob'}, {seatId: 1, kind: 'human', name: 'Pat'}, {seatId: 2, kind: 'human', name: 'Sam'}, {seatId: 3, kind: 'ai', name: 'Forge 1'}]});
const step = (t, event, now = 0) => transitionTable(t, {...event, revision: t.revision}, {now, launchId: 'l1'});

/* A fake element: enough of the DOM for renderConnectionPanel to build a tree we can read. */
function fakeEl(tag, className = '', textContent = '') {
  const node = {tag, className, textContent, children: [], append(...kids) { this.children.push(...kids); }};
  return node;
}
const texts = (node) => [node.textContent, ...node.children.flatMap(texts)].filter(Boolean);

test('quiet time reads as whole seconds, then minutes, and nothing under a second', () => {
  assert.equal(quietLabel(0), '');
  assert.equal(quietLabel(999), '');
  assert.equal(quietLabel(1000), '1 s');
  assert.equal(quietLabel(12400), '12 s');
  assert.equal(quietLabel(59999), '60 s');
  assert.equal(quietLabel(60000), '1 min');
  assert.equal(quietLabel(150000), '2 min');
  assert.equal(quietLabel(null), '');
});

test('a fresh table names every seat holding it, by reason, and the empty chairs by what they wait for', () => {
  const d = describeReadiness(readinessOf(fresh()), {now: 0, youSeatId: 0});
  assert.equal(d.ok, false);
  assert.deepEqual(d.rows.map(r => [r.name, r.state, r.blocking]), [
    ['You', 'choosing', 'no validated deck'],
    ['Pat', 'empty', null],
    ['Sam', 'empty', null],
    ['Forge 1', 'preparing', 'no validated deck'],
  ]);
  assert.equal(d.rows[1].detail, 'Invitation not opened yet');
  assert.equal(d.headline, 'Waiting on You (no validated deck), Forge 1 (no validated deck).');
  assert.deepEqual(d.waitingOn, ['You', 'Forge 1']);
  assert.equal(d.tone, 'waiting');
});

test('the seat states follow the blocker order: connection, then deck, then ready', () => {
  let t = fresh();
  t = step(t, {type: 'join', seatId: 1});
  t = step(t, {type: 'deck', seatId: 0, deckVersion: 'd0'});
  t = step(t, {type: 'deck', seatId: 3, deckVersion: 'd3'});
  t = step(t, {type: 'ready', seatId: 3, ready: true});
  const d = describeReadiness(readinessOf(t), {now: 0, youSeatId: 1});
  const byName = Object.fromEntries(d.rows.map(r => [r.name, r]));
  assert.equal(byName.Rob.state, 'unready');
  assert.equal(byName.Rob.label, 'Deck chosen, not ready');
  assert.equal(byName.You.state, 'choosing');
  assert.equal(byName['Forge 1'].state, 'ready');
  assert.equal(byName.Sam.state, 'empty');
  /* the guest who just joined sees themselves as You, and the host by name */
  assert.equal(byName.You.seatId, 1);
  t = step(t, {type: 'disconnect', seatId: 1}, 5000);
  const gone = describeReadiness(readinessOf(t, {now: 47000, presence: {1: 5000}}), {youSeatId: 0});
  const pat = gone.rows.find(r => r.name === 'Pat');
  assert.equal(pat.state, 'offline');
  assert.equal(pat.blocking, 'not connected');
  assert.equal(pat.detail, 'Quiet for 42 s');
  assert.match(gone.headline, /Pat \(not connected\)/);
});

test('a connected seat that has stopped heartbeating is flagged as going quiet before the broker drops it', () => {
  let t = fresh();
  t = step(t, {type: 'join', seatId: 1});
  const soon = describeReadiness(readinessOf(t, {now: 9000, presence: {1: 0}}), {youSeatId: 0});
  assert.equal(soon.rows[1].warn, false, 'nine seconds is inside the heartbeat allowance');
  const quiet = describeReadiness(readinessOf(t, {now: 14000, presence: {1: 0}}), {youSeatId: 0});
  assert.equal(quiet.rows[1].warn, true);
  assert.equal(quiet.rows[1].state, 'choosing', 'the state is still what the table says');
  assert.equal(quiet.rows[1].detail, 'Going quiet, 14 s since the last heartbeat');
  assert.ok(quiet.quietWarnMs < quiet.disconnectMs, 'the warning comes before the broker disconnects the seat');
});

test('everyone ready reads as ready, and a table with too few seats says so instead of naming nobody', () => {
  let t = fresh();
  t = step(t, {type: 'join', seatId: 1});
  for (const seatId of [0, 1, 3]) { t = step(t, {type: 'deck', seatId, deckVersion: 'd' + seatId}); t = step(t, {type: 'ready', seatId, ready: true}); }
  const ready = describeReadiness(readinessOf(t), {youSeatId: 0});
  assert.equal(ready.ok, true);
  assert.equal(ready.headline, 'Everyone is ready.');
  assert.equal(ready.tone, 'ok');
  assert.equal(ready.rows.find(r => r.name === 'Sam').state, 'empty', 'an empty chair is not an unready player');
  const lonely = createTable({tableId: 'u', seats: [{seatId: 0, kind: 'human', occupied: true, name: 'Rob'}, {seatId: 1, kind: 'human', name: 'Pat'}]});
  const d = describeReadiness(readinessOf(step(step(lonely, {type: 'deck', seatId: 0, deckVersion: 'x'}), {type: 'ready', seatId: 0, ready: true})));
  assert.equal(d.headline, 'A game needs at least two seats.');
  assert.deepEqual(d.tableReasons, ['A game needs at least two seats']);
});

test('the countdown counts, the launch stage is named, and a failed launch says why', () => {
  let t = fresh();
  t = step(t, {type: 'join', seatId: 1});
  for (const seatId of [0, 1, 3]) { t = step(t, {type: 'deck', seatId, deckVersion: 'd' + seatId}); t = step(t, {type: 'ready', seatId, ready: true}); }
  t = step(t, {type: 'countdown'}, 1000);
  const counting = describeReadiness(readinessOf(t), {now: 4200, countdownAt: t.countdownAt});
  assert.equal(counting.headline, 'Starting in 7');
  assert.equal(counting.tone, 'starting');
  t = step(t, {type: 'tick'}, 11000);
  const spawning = describeReadiness({...readinessOf(t), launch: {stage: 'engine-spawning'}});
  assert.equal(spawning.headline, 'Starting the rules engine');
  assert.equal(spawning.launch.label, 'Starting the rules engine');
  const failed = describeReadiness({...readinessOf(t), launch: {stage: 'failed', reason: 'Forge exited with code 1'}});
  assert.equal(failed.tone, 'failed');
  assert.equal(failed.launch.reason, 'Forge exited with code 1');
  const playing = describeReadiness({...readinessOf(t), phase: 'playing'});
  assert.equal(playing.headline, 'The game is on.');
});

test('the panel draws one row per seat with its state, detail and who-you-are, through the element factory', () => {
  let t = fresh();
  t = step(t, {type: 'join', seatId: 1});
  t = step(t, {type: 'disconnect', seatId: 1}, 0);
  const panel = renderConnectionPanel(readinessOf(t, {now: 20000, presence: {1: 0}}), {el: fakeEl, youSeatId: 0, now: 20000});
  assert.equal(panel.tag, 'section');
  assert.equal(panel.className, 'connection-panel is-waiting');
  const [title, headline, list] = panel.children;
  assert.equal(title.textContent, 'Who we are waiting on');
  assert.match(headline.textContent, /^Waiting on You \(no validated deck\), Pat \(not connected\), Forge 1 \(no validated deck\)\.$/);
  assert.equal(list.className, 'connection-seats');
  assert.equal(list.children.length, 4);
  const [you, pat, sam, ai] = list.children;
  assert.equal(you.className, 'connection-seat is-choosing is-you is-blocking');
  assert.deepEqual(texts(you), ['You', 'Human', 'Choosing a deck']);
  assert.equal(pat.className, 'connection-seat is-offline is-blocking');
  assert.deepEqual(texts(pat), ['Pat', 'Human', 'Not connected', 'Quiet for 20 s']);
  assert.equal(sam.className, 'connection-seat is-empty');
  assert.deepEqual(texts(sam), ['Sam', 'Human', 'Waiting for player', 'Invitation not opened yet']);
  assert.equal(ai.className, 'connection-seat is-preparing is-blocking');
  assert.deepEqual(texts(ai), ['Forge 1', 'AI', 'Preparing']);
  assert.equal(panel.children.length, 3, 'no launch line while selecting');
  const launching = renderConnectionPanel({...readinessOf(t), phase: 'starting', launch: {stage: 'bridge-green'}}, {el: fakeEl});
  assert.equal(launching.children.at(-1).className, 'connection-launch is-bridge-green');
  assert.equal(launching.children.at(-1).textContent, 'Rules engine connected');
  assert.equal(launching.children[0].textContent, 'Starting the game', 'the title follows the tone, not the seat list');
  const failed = renderConnectionPanel({...readinessOf(t), phase: 'starting', launch: {stage: 'failed', reason: 'Forge exited'}}, {el: fakeEl});
  assert.equal(failed.className, 'connection-panel is-failed');
  assert.equal(failed.children[0].textContent, 'The game did not start');
  assert.equal(failed.children.at(-1).textContent, 'The engine failed to start: Forge exited');
  const ok = renderConnectionPanel({phase: 'selecting', ok: true, table: [], seats: []}, {el: fakeEl});
  assert.equal(ok.className, 'connection-panel is-ok');
  assert.equal(ok.children[0].textContent, 'Everyone is here');
});

test('the three pages that draw the panel import this module and the servers publish it', async () => {
  const {readFileSync} = await import('node:fs');
  const read = (p) => readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
  assert.match(read('game/ui/guest.mjs'), /from '\/connection\.mjs'/, 'the guest seat lobby draws it');
  assert.match(read('game/ui/setup.mjs'), /from '\/connection\.mjs'/, 'the host live table draws it');
  assert.match(read('crankmagic-game.js'), /import\(['"]\/connection\.mjs['"]\)/, 'the workshop lobby draws it while a private table is open');
  assert.match(read('game/server/guest-gateway.mjs'), /\['\/connection\.mjs',\['text\/javascript; charset=utf-8','connection\.mjs'\]\]/, 'the guest gateway serves it');
  assert.match(read('game/tools/serve-review.mjs'), /files\.set\('\/connection\.mjs',\['game\/ui\/connection\.mjs','text\/javascript'\]\)/, 'the host serves it at its root');
  assert.match(read('game/tools/serve-review.mjs'), /'connection\.mjs'/, 'and hands it to the guest gateway');
  for (const css of ['game/ui/guest.css', 'game/ui/setup.css', 'crankmagic.css']) assert.match(read(css), /\.connection-panel/, css + ' styles it');
});

/* WHAT A GUEST IS TOLD WHEN THE LAUNCH FAILED A MOMENT AGO.
 *
 * The panel already rendered a 'failed' launch STAGE, and during the 2026-09-22 UAT a guest still
 * watched "Starting the rules engine" for nine minutes: that stage lives in the runtime's
 * in-memory launchProgress, which can go stale or be overwritten. The table's own launchError is
 * authoritative and persisted, so the panel prefers it and a reset table can still say why. */
test('a table that failed to launch says so, even when the runtime stage has gone stale', () => {
  let t = createTable({tableId: 't', seats: [{seatId: 0, kind: 'human', occupied: true}, {seatId: 1, kind: 'human', occupied: true}, {seatId: 2, kind: 'ai'}]});
  const go = (event, now = 0) => t = transitionTable(t, {...event, revision: t.revision}, {now, launchId: 'L1'});
  for (const seatId of [0, 1, 2]) { go({type: 'deck', seatId, deckVersion: 'd' + seatId}); go({type: 'ready', seatId, ready: true}); }
  go({type: 'countdown'}); go({type: 'tick'}, 10000);
  go({type: 'engine-failed', launchId: 'L1', error: 'Forge did not become ready within four minutes'});

  /* The runtime still claims it is spawning -- exactly the stale state the UAT met. */
  const readiness = {...readinessOf(t), launch: {stage: 'engine-spawning', error: null}};
  const d = describeReadiness(readiness, {now: 20000, youSeatId: 1, launchError: t.launchError});
  assert.equal(d.tone, 'failed', 'a table carrying a launch error is not merely "waiting"');
  assert.match(d.headline, /did not become ready/, 'the reason reaches the reader');

  /* And the AI seat is ready again, so the panel blames only the humans who must re-confirm. */
  assert.deepEqual(d.waitingOn.sort(), ['Seat 1', 'You']);
});

/* "Choosing a deckChulane, Teller of Tales" — one seat card, two facts, no gap.
 *
 * The guest seat card appends a status <small> and a commander <small> as siblings. Its own
 * stylesheet already stacks the two fields above them (`.seat strong,.seat span{display:block}`)
 * and stops short of the smalls, so the last two run together inline. An agent playing a guest in
 * the 2026-09-22 UAT read it on every seat card in every state: "ReadyPurphoros, God of the Forge",
 * "Choosing a deckAtraxa, Praetors' Voice". */
test('a guest seat card stacks its fields instead of running them together', async () => {
  const {readFileSync} = await import('node:fs');
  const css = readFileSync(new URL('../ui/guest.css', import.meta.url), 'utf8');
  const stacked = /\.seat[^{}]*\bsmall\b[^{}]*\{[^}]*display:block/.test(css);
  assert.ok(stacked,
    'the status and the commander are adjacent <small> siblings; without display:block they '
    + 'concatenate, which is what a guest actually read');
});
