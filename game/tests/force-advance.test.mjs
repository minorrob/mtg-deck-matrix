import test from 'node:test';
import assert from 'node:assert/strict';
import {chooseForcedAction} from '../tools/force-advance.mjs';
import {GUEST_ROUTE_KEYS} from '../server/guest-gateway.mjs';

const view = (ui, revision = 7) => ({revision, state: {players: [], turn: 3, phase: 'MAIN1'}, ui});

test('a required decision is forced with its only lawful answer', () => {
  for (const mode of ['draw', 'ack']) {
    const forced = chooseForcedAction(view({choice: {id: 'c1', mode, options: []}}), 0);
    assert.equal(forced.automatic, true, `${mode} has one lawful answer, so forcing it changes nothing`);
    assert.equal(forced.request.choiceId, 'c1');
    assert.equal(forced.request.revision, 7, 'the action is stamped with the revision it was chosen from');
    assert.deepEqual(forced.request.indices, []);
  }
});

test('an open choice takes a legal option and says it was a real choice', () => {
  const forced = chooseForcedAction(view({choice: {id: 'c2', mode: 'one', min: 1, max: 1,
    options: [{index: 0, label: 'Alpha'}, {index: 1, label: 'Beta'}]}}, 9), 0);
  assert.equal(forced.automatic, false);
  assert.equal(forced.alternatives, 2, 'the journal records what else was on offer');
  assert.deepEqual(forced.request.indices, [0]);
  assert.equal(forced.request.revision, 9);
});

test('nothing is forced when nothing is waiting', () => {
  assert.equal(chooseForcedAction(view({}), 0), null, 'no pending decision');
  assert.equal(chooseForcedAction({revision: 1, state: {gameOver: true}}, 0), null, 'a finished game');
  assert.equal(chooseForcedAction(null, 0), null);
});

/* Forcing a decision is the host's lever over the whole table, so it must not be reachable from a
 * guest session. A guest answers their own prompts; nobody else's. */
test('force-advance is not exposed on the guest gateway', () => {
  assert.ok(!GUEST_ROUTE_KEYS.some((key) => key.includes('force-advance')),
    'the guest route table must not carry the host failsafe');
});

/* The escalation the host actually needs: re-ask the AI, and when re-asking has already failed,
 * lock in a legal decision and move the table on. chooseForcedAction is what supplies that second
 * step, so what it returns has to be enough to journal a freeze afterwards. */
test('a forced action carries enough to explain the freeze later', () => {
  const stuck = {revision: 31, state: {turn: 9, phase: 'COMBAT_DECLARE_BLOCKERS', turnPlayerId: 0,
    priorityPlayerId: 2, stackSize: 1, players: []},
    ui: {prompt: 'Priority: declare blockers', choice: {id: 'blockers', mode: 'one', title: 'Choose a blocker',
      options: [{index: 0, label: 'Block with Grizzly Bears'}, {index: 1, label: 'No blocks'}]}}};
  const forced = chooseForcedAction(stuck, 2);
  assert.equal(forced.choiceId, 'blockers', 'which decision was taken out of the seat’s hands');
  assert.equal(forced.automatic, false, 'and that it was a real choice, not a required draw');
  assert.equal(forced.alternatives, 2, 'with what else had been on offer');
  assert.equal(forced.request.revision, 31, 'pinned to the revision it was chosen from');
  assert.ok(forced.label, 'and a human-readable account of what was done');
});
