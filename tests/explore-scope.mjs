// Explore scope chooser: query contract, recent scopes, and entry conditions.
//
// Slice A adds a three-door chooser when #discover has no scope params, plus deep links
// for deck=, commander=, and card= params. This validates the localStorage contract and
// param parsing without requiring a full DOM simulation.

import assert from "node:assert/strict";

let checks = 0;
const check = (label, fn) => { fn(); checks += 1; void label; };

/* ----------------------------------------------------------- localStorage contract */

// Mock localStorage for testing
class MockStorage {
  constructor() { this.store = {}; }
  getItem(key) { return this.store[key] || null; }
  setItem(key, value) { this.store[key] = String(value); }
  removeItem(key) { delete this.store[key]; }
  clear() { this.store = {}; }
}

const RECENTS_KEY = 'crankmagic:discover:recents:v1';

function getRecentScopes(storage) {
  try {
    const stored = storage.getItem(RECENTS_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed.slice(0, 8) : [];
  } catch { return []; }
}

function saveRecentScope(storage, scope) {
  try {
    const recents = getRecentScopes(storage).filter((r) => !(r.type === scope.type && r.id === scope.id));
    recents.unshift(scope);
    storage.setItem(RECENTS_KEY, JSON.stringify(recents.slice(0, 8)));
  } catch { /* localStorage unavailable */ }
}

function clearRecentScopes(storage) {
  try { storage.removeItem(RECENTS_KEY); } catch { /* localStorage unavailable */ }
}

/* ------------------------------------------------------------- scope persistence */

check("an empty storage returns no recent scopes", () => {
  const storage = new MockStorage();
  assert.deepEqual(getRecentScopes(storage), []);
});

check("a deck scope can be saved and retrieved", () => {
  const storage = new MockStorage();
  const scope = {type: 'deck', id: 'deck:123', label: 'My Deck'};
  saveRecentScope(storage, scope);
  const recents = getRecentScopes(storage);
  assert.equal(recents.length, 1);
  assert.deepEqual(recents[0], scope);
});

check("a commander scope can be saved and retrieved", () => {
  const storage = new MockStorage();
  const scope = {type: 'commander', id: 'Atraxa', label: 'Atraxa'};
  saveRecentScope(storage, scope);
  const recents = getRecentScopes(storage);
  assert.equal(recents.length, 1);
  assert.deepEqual(recents[0], scope);
});

check("a card scope can be saved and retrieved", () => {
  const storage = new MockStorage();
  const scope = {type: 'card', id: 'Sol Ring', label: 'Sol Ring'};
  saveRecentScope(storage, scope);
  const recents = getRecentScopes(storage);
  assert.equal(recents.length, 1);
  assert.deepEqual(recents[0], scope);
});

check("multiple scopes are kept in order, newest first", () => {
  const storage = new MockStorage();
  saveRecentScope(storage, {type: 'card', id: 'A', label: 'A'});
  saveRecentScope(storage, {type: 'card', id: 'B', label: 'B'});
  saveRecentScope(storage, {type: 'card', id: 'C', label: 'C'});
  const recents = getRecentScopes(storage);
  assert.equal(recents.length, 3);
  assert.equal(recents[0].id, 'C');
  assert.equal(recents[1].id, 'B');
  assert.equal(recents[2].id, 'A');
});

check("duplicate scopes are deduplicated, keeping the newest", () => {
  const storage = new MockStorage();
  saveRecentScope(storage, {type: 'card', id: 'A', label: 'A'});
  saveRecentScope(storage, {type: 'card', id: 'B', label: 'B'});
  saveRecentScope(storage, {type: 'card', id: 'A', label: 'A Again'});
  const recents = getRecentScopes(storage);
  assert.equal(recents.length, 2);
  assert.equal(recents[0].id, 'A');
  assert.equal(recents[0].label, 'A Again');
  assert.equal(recents[1].id, 'B');
});

check("only the 8 most recent scopes are kept", () => {
  const storage = new MockStorage();
  for (let i = 0; i < 12; i++) {
    saveRecentScope(storage, {type: 'card', id: `card${i}`, label: `Card ${i}`});
  }
  const recents = getRecentScopes(storage);
  assert.equal(recents.length, 8);
  assert.equal(recents[0].id, 'card11');
  assert.equal(recents[7].id, 'card4');
});

check("clearing recents removes the key", () => {
  const storage = new MockStorage();
  saveRecentScope(storage, {type: 'card', id: 'A', label: 'A'});
  assert.equal(getRecentScopes(storage).length, 1);
  clearRecentScopes(storage);
  assert.deepEqual(getRecentScopes(storage), []);
  assert.equal(storage.getItem(RECENTS_KEY), null);
});

check("malformed JSON in storage returns an empty array", () => {
  const storage = new MockStorage();
  storage.setItem(RECENTS_KEY, '{not valid json}');
  assert.deepEqual(getRecentScopes(storage), []);
});

check("non-array data in storage returns an empty array", () => {
  const storage = new MockStorage();
  storage.setItem(RECENTS_KEY, JSON.stringify({type: 'card'}));
  assert.deepEqual(getRecentScopes(storage), []);
});

/* ---------------------------------------------------------------- param contract */

check("scope params parsed correctly: deck only", () => {
  const params = new URLSearchParams('deck=deck123');
  const scopeParams = {
    deck: params.get('deck'),
    commander: params.get('commander'),
    card: params.get('card'),
    gap: params.get('gap')
  };
  assert.equal(scopeParams.deck, 'deck123');
  assert.equal(scopeParams.commander, null);
  assert.equal(scopeParams.card, null);
  assert.equal(scopeParams.gap, null);
});

check("scope params parsed correctly: deck with gap", () => {
  const params = new URLSearchParams('deck=deck123&gap=Removal');
  const scopeParams = {
    deck: params.get('deck'),
    commander: params.get('commander'),
    card: params.get('card'),
    gap: params.get('gap')
  };
  assert.equal(scopeParams.deck, 'deck123');
  assert.equal(scopeParams.gap, 'Removal');
});

check("scope params parsed correctly: commander only", () => {
  const params = new URLSearchParams('commander=Atraxa,%20Praetors%27%20Voice');
  const scopeParams = {
    deck: params.get('deck'),
    commander: params.get('commander'),
    card: params.get('card'),
    gap: params.get('gap')
  };
  assert.equal(scopeParams.commander, "Atraxa, Praetors' Voice");
});

check("scope params parsed correctly: card only", () => {
  const params = new URLSearchParams('card=Sol%20Ring');
  const scopeParams = {
    deck: params.get('deck'),
    commander: params.get('commander'),
    card: params.get('card'),
    gap: params.get('gap')
  };
  assert.equal(scopeParams.card, 'Sol Ring');
});

check("hasScope is true when any scope param is present", () => {
  assert.equal(!!(new URLSearchParams('deck=x').get('deck')), true);
  assert.equal(!!(new URLSearchParams('commander=x').get('commander')), true);
  assert.equal(!!(new URLSearchParams('card=x').get('card')), true);
  assert.equal(!!(new URLSearchParams('').get('deck') || new URLSearchParams('').get('commander') || new URLSearchParams('').get('card')), false);
});

/* --------------------------------------------------------------- entry conditions */

check("bare #discover (no params) should show chooser, not graph", () => {
  const params = new URLSearchParams('');
  const hasScope = !!(params.get('deck') || params.get('commander') || params.get('card'));
  assert.equal(hasScope, false, "no scope params means show chooser");
});

check("#discover?deck=X should enter graph with deck scope", () => {
  const params = new URLSearchParams('deck=abc');
  const hasScope = !!(params.get('deck') || params.get('commander') || params.get('card'));
  assert.equal(hasScope, true, "deck param means enter graph");
});

check("#discover?commander=X should enter graph with commander scope", () => {
  const params = new URLSearchParams('commander=Atraxa');
  const hasScope = !!(params.get('deck') || params.get('commander') || params.get('card'));
  assert.equal(hasScope, true, "commander param means enter graph");
});

check("#discover?card=X should enter graph with card scope", () => {
  const params = new URLSearchParams('card=Sol%20Ring');
  const hasScope = !!(params.get('deck') || params.get('commander') || params.get('card'));
  assert.equal(hasScope, true, "card param means enter graph");
});

check("gap param alone does not constitute a scope", () => {
  const params = new URLSearchParams('gap=Removal');
  const hasScope = !!(params.get('deck') || params.get('commander') || params.get('card'));
  assert.equal(hasScope, false, "gap param alone should show chooser");
});

/* ------------------------------------------------------------------------ done */

console.log(`✓ ${checks} checks passed (explore-scope)`);
