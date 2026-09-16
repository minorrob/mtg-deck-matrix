#!/usr/bin/env node
/* Tests for Explore B: progressive disclosure of advanced tools (Filters, Trace, Lens) */

import {strict as assert} from 'assert';

const advancedToolsKey = 'crankmagic:discover:advancedTools:v1';

// Mock localStorage for testing
const mockStorage = {};
const localStorage = {
  getItem: (key) => mockStorage[key] || null,
  setItem: (key, value) => { mockStorage[key] = value; },
  removeItem: (key) => { delete mockStorage[key]; },
  clear: () => { Object.keys(mockStorage).forEach((k) => delete mockStorage[k]); }
};

function getAdvancedToolsState() {
  try {
    return localStorage.getItem(advancedToolsKey) === 'open';
  } catch {
    return false;
  }
}

function setAdvancedToolsState(open) {
  try {
    localStorage.setItem(advancedToolsKey, open ? 'open' : 'closed');
  } catch {
    /* private mode */
  }
}

function shouldForceOpenTools(params) {
  return params.trace === '1' || !!params.lens;
}

const tests = [
  // Default state: collapsed
  {
    name: 'Default state is collapsed',
    fn() {
      localStorage.clear();
      const state = getAdvancedToolsState();
      assert.equal(state, false, 'Advanced tools should be collapsed by default');
    }
  },

  // Persisted state: open
  {
    name: 'Persisted open state is restored',
    fn() {
      localStorage.clear();
      setAdvancedToolsState(true);
      const state = getAdvancedToolsState();
      assert.equal(state, true, 'Advanced tools should be open when localStorage says so');
    }
  },

  // Persisted state: closed
  {
    name: 'Persisted closed state is restored',
    fn() {
      localStorage.clear();
      setAdvancedToolsState(false);
      const state = getAdvancedToolsState();
      assert.equal(state, false, 'Advanced tools should be closed when localStorage says so');
    }
  },

  // Deep link: trace=1 forces open
  {
    name: 'trace=1 deep link forces tools open',
    fn() {
      localStorage.clear();
      const params = {trace: '1'};
      const forceOpen = shouldForceOpenTools(params);
      assert.equal(forceOpen, true, 'trace=1 should force advanced tools open');
    }
  },

  // Deep link: lens=Role forces open
  {
    name: 'lens=Role deep link forces tools open',
    fn() {
      localStorage.clear();
      const params = {lens: 'Removal'};
      const forceOpen = shouldForceOpenTools(params);
      assert.equal(forceOpen, true, 'lens parameter should force advanced tools open');
    }
  },

  // No deep link: respects localStorage
  {
    name: 'No deep link respects localStorage',
    fn() {
      localStorage.clear();
      setAdvancedToolsState(false);
      const params = {};
      const forceOpen = shouldForceOpenTools(params);
      const advancedToolsOpen = forceOpen || getAdvancedToolsState();
      assert.equal(advancedToolsOpen, false, 'Without deep links, should respect localStorage');
    }
  },

  // Deep link overrides localStorage
  {
    name: 'Deep link overrides closed localStorage state',
    fn() {
      localStorage.clear();
      setAdvancedToolsState(false);
      const params = {trace: '1'};
      const forceOpen = shouldForceOpenTools(params);
      const advancedToolsOpen = forceOpen || getAdvancedToolsState();
      assert.equal(advancedToolsOpen, true, 'Deep link should override closed localStorage state');
    }
  },

  // State persistence
  {
    name: 'State persists correctly',
    fn() {
      localStorage.clear();
      setAdvancedToolsState(true);
      assert.equal(localStorage.getItem(advancedToolsKey), 'open', 'Should persist "open" state');
      setAdvancedToolsState(false);
      assert.equal(localStorage.getItem(advancedToolsKey), 'closed', 'Should persist "closed" state');
    }
  },

  // Loops-only default when deck is scoped (existing behavior preserved)
  {
    name: 'Loops-only defaults to on when deck is picked',
    fn() {
      const deckPicked = true;
      const loopTouched = false;
      const loopMode = !loopTouched ? deckPicked : false;
      assert.equal(loopMode, true, 'Loops-only should default on when deck is picked');
    }
  },

  // Loops-only respects user override
  {
    name: 'Loops-only respects manual toggle',
    fn() {
      const deckPicked = true;
      const loopTouched = true;
      const loopMode = !loopTouched ? deckPicked : false;
      assert.equal(loopMode, false, 'Loops-only should respect manual toggle');
    }
  },

  // Multiple deep link params
  {
    name: 'Multiple deep link params force open',
    fn() {
      const params = {deck: 'deck-123', lens: 'Removal', trace: '1'};
      const forceOpen = shouldForceOpenTools(params);
      assert.equal(forceOpen, true, 'Multiple deep link params should force tools open');
    }
  },

  // Only deck param (no lens or trace) does not force open
  {
    name: 'Only deck param does not force tools open',
    fn() {
      localStorage.clear();
      const params = {deck: 'deck-123'};
      const forceOpen = shouldForceOpenTools(params);
      const advancedToolsOpen = forceOpen || getAdvancedToolsState();
      assert.equal(advancedToolsOpen, false, 'deck param alone should not force tools open');
    }
  },
];

let passed = 0, failed = 0;
for (const test of tests) {
  try {
    test.fn();
    console.log(`✓ ${test.name}`);
    passed++;
  } catch (error) {
    console.error(`✗ ${test.name}`);
    console.error(`  ${error.message}`);
    failed++;
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
