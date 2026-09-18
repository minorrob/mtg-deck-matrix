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
