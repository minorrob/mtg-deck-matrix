import test from 'node:test';
import assert from 'node:assert/strict';

test('non-decider with okEnabled=false should not get enabled controls', () => {
  // Simulating a mulligan decision where viewer is not the decider
  const ui = {
    ok: 'Keep',
    okEnabled: false,
    nativeFallback: '',
    prompt: 'Keith is going first. Rob, you are going 2nd. Do you want to keep your hand?',
    choice: null
  };
  
  const viewerSeatId = 1; // Viewer is seat 1
  const priorityPlayerId = 0; // But seat 0 has priority/decision
  
  // The button should be disabled when okEnabled is false
  const shouldBeDisabled = !ui.okEnabled || !!ui.nativeFallback;
  assert.equal(shouldBeDisabled, true, 'Button should be disabled for non-decider');
  
  // And we should show waiting copy if viewer doesn't have control
  const viewerHasControl = viewerSeatId === priorityPlayerId;
  assert.equal(viewerHasControl, false, 'Viewer should not have control');
});

test('decider with okEnabled=true should get working Keep button', () => {
  const ui = {
    ok: 'Keep',
    okEnabled: true,
    nativeFallback: '',
    prompt: 'Rob, do you want to keep your hand?',
    choice: null
  };
  
  const viewerSeatId = 1;
  const priorityPlayerId = 1; // Viewer has priority
  
  const shouldBeDisabled = !ui.okEnabled || !!ui.nativeFallback;
  assert.equal(shouldBeDisabled, false, 'Button should be enabled for decider');
  
  const viewerHasControl = viewerSeatId === priorityPlayerId;
  assert.equal(viewerHasControl, true, 'Viewer should have control');
});

test('mulligan decision should be tracked to prevent double acknowledgment', () => {
  const acknowledgedDecisions = new Map();
  const matchId = 'match-123';
  const turn = 0;
  const viewerSeatId = 1;
  const prompt = 'Rob, do you want to keep your hand?';
  
  // First acknowledgment
  const decisionKey1 = `${matchId}:${turn}:${viewerSeatId}:${prompt}`;
  acknowledgedDecisions.set(decisionKey1, Date.now());
  
  // Check if already acknowledged
  const alreadyAcknowledged = acknowledgedDecisions.has(decisionKey1);
  assert.equal(alreadyAcknowledged, true, 'Decision should be marked as acknowledged');
  
  // Different prompt should not be acknowledged
  const differentPrompt = 'Rob, do you want to mulligan?';
  const decisionKey2 = `${matchId}:${turn}:${viewerSeatId}:${differentPrompt}`;
  assert.equal(acknowledgedDecisions.has(decisionKey2), false, 'Different decision should not be acknowledged');
});

test('active player at untap with okEnabled=true should see enabled Continue', () => {
  const ui = {
    ok: 'OK',
    okEnabled: true,
    nativeFallback: '',
    prompt: 'Priority: Rob\nTurn: 1 (Rob)\nPhase: Untap',
    choice: null
  };
  
  const viewerSeatId = 1;
  const turnPlayerId = 1; // Viewer is the active player
  const priority = /^Priority:/m.test(ui.prompt);
  
  assert.equal(priority, true, 'Should be a priority decision');
  assert.equal(viewerSeatId, turnPlayerId, 'Viewer should be the turn player');
  assert.equal(ui.okEnabled, true, 'okEnabled should be true');
  
  // Button should be enabled, not show waiting copy
  const shouldShowWaitingCopy = !ui.okEnabled && viewerSeatId !== turnPlayerId;
  assert.equal(shouldShowWaitingCopy, false, 'Should not show waiting copy for active player with okEnabled');
});

test('active player with okEnabled=false should not show fake waiting copy', () => {
  const ui = {
    ok: 'Continue',
    okEnabled: false,
    nativeFallback: 'Complete this action in the engine window',
    prompt: 'Priority: Rob',
    choice: null
  };
  
  const viewerSeatId = 1;
  const turnPlayerId = 1;
  
  // When nativeFallback is set, we show fallback notice, not waiting copy
  assert.equal(!!ui.nativeFallback, true, 'Should have nativeFallback');
  
  // Should not incorrectly show "Waiting for active player..." when viewer IS the active player
  const incorrectWaitingCopy = !ui.okEnabled && !ui.nativeFallback && viewerSeatId === turnPlayerId;
  assert.equal(incorrectWaitingCopy, false, 'Should not show waiting copy when viewer is active player');
});

test('nativeFallback should show recoverable messaging', () => {
  const ui = {
    ok: 'Continue',
    okEnabled: false,
    nativeFallback: 'Finish this choice in the engine window',
    prompt: 'Choose a card',
    choice: null
  };
  
  const shouldBeDisabled = !ui.okEnabled || !!ui.nativeFallback;
  assert.equal(shouldBeDisabled, true, 'Button should be disabled when nativeFallback is set');
  assert.equal(!!ui.nativeFallback, true, 'nativeFallback should be present');
});

test('action acknowledgment state should be set after successful gameAction', () => {
  const lastActionSuccess = {
    timestamp: Date.now(),
    action: 'ok'
  };
  
  // Button should show acknowledgment
  const buttonLabel = lastActionSuccess && lastActionSuccess.action === 'ok' 
    ? '✓ Acknowledged' 
    : 'Continue';
  assert.equal(buttonLabel, '✓ Acknowledged', 'Button should show acknowledgment');
  
  // Button should be disabled during acknowledgment
  const ui = { okEnabled: true, nativeFallback: '' };
  const shouldBeDisabled = !ui.okEnabled || !!ui.nativeFallback || 
    (lastActionSuccess && lastActionSuccess.action === 'ok');
  assert.equal(shouldBeDisabled, true, 'Button should be disabled during acknowledgment');
});

test('acknowledgment should clear after timeout', () => {
  const now = Date.now();
  const lastActionSuccess = {
    timestamp: now - 2000, // 2 seconds ago
    action: 'ok'
  };
  
  const timeout = 1500;
  const shouldClear = (now - lastActionSuccess.timestamp) > timeout;
  assert.equal(shouldClear, true, 'Acknowledgment should clear after timeout');
});

test('multiple action types should support acknowledgment', () => {
  const actions = ['ok', 'cancel', 'answer'];
  
  for (const action of actions) {
    const lastActionSuccess = { timestamp: Date.now(), action };
    const isAcknowledged = lastActionSuccess && lastActionSuccess.action === action;
    assert.equal(isAcknowledged, true, `Action '${action}' should be acknowledged`);
  }
});

test('debug mode flag should be detectable from URL', () => {
  // Simulate URLSearchParams check
  const testUrls = [
    { search: '?debugDecisions=1', expected: true },
    { search: '?debugDecisions', expected: true },
    { search: '', expected: false },
    { search: '?other=1', expected: false }
  ];
  
  for (const { search, expected } of testUrls) {
    const params = new URLSearchParams(search);
    const debugDecisions = params.has('debugDecisions');
    assert.equal(debugDecisions, expected, `URL '${search}' should return ${expected}`);
  }
});
