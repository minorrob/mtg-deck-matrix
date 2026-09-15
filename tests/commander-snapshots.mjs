import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {snapshotLibraryDeck, forgeDeckText} from '../game/contracts/deck-snapshot.mjs';

const state = JSON.parse(readFileSync(new URL('../data/live-state.json', import.meta.url))).payload.state;
const facts = JSON.parse(readFileSync(new URL('../data/card-facts.json', import.meta.url))).cards;
const identities = JSON.parse(readFileSync(new URL('../game/fixtures/live-identities.json', import.meta.url))).cards;
const options = {facts, identities, sourceRevision:'test-revision', capturedAt:'2026-09-15T00:00:00Z'};
const before = JSON.stringify(state);
const ids = Object.values(state.decks).map(d=>d.id);
const deckOf = (s,id) => Object.values(s.decks).find(d=>d.id===id);
for (const id of ids) {
  const d = snapshotLibraryDeck(state,id,options);
  assert.equal(d.total,100);
  assert.equal(d.library.reduce((n,c)=>n+c.quantity,0),100-d.commanders.length);
  assert.ok(Object.isFrozen(d.library[0]));
  const text = forgeDeckText(d);
  assert.equal(text.split('\n').filter(l=>/^\d+ /.test(l)).reduce((n,l)=>n+parseInt(l),0),100);
  assert.equal(Object.hasOwn(d,'lots'),false);
  const reordered = structuredClone(state);
  deckOf(reordered,id).slots.reverse();
  deckOf(reordered,id).version++;
  assert.equal(snapshotLibraryDeck(reordered,id,options).gameplayHash,d.gameplayHash);
  const edited = structuredClone(state);
  const slots = deckOf(edited,id).slots.filter(s=>s.purpose==='main' && !deckOf(edited,id).commanders.includes(s.cardId));
  slots[0].quantity++;
  slots[1].quantity--;
  if (slots[1].quantity === 0) deckOf(edited,id).slots = deckOf(edited,id).slots.filter(s=>s !== slots[1]);
  assert.notEqual(snapshotLibraryDeck(edited,id,options).gameplayHash,d.gameplayHash);
  const invalid = structuredClone(state);
  deckOf(invalid,id).slots.find(s=>s.purpose==='main').quantity++;
  assert.throws(()=>snapshotLibraryDeck(invalid,id,options),/100|Commander must/);
}
assert.equal(JSON.stringify(state),before,'Export must never mutate the collection');
const unknown = structuredClone(state);
delete unknown.cards[deckOf(unknown,ids[0]).commanders[0]].oracleId;
assert.throws(()=>snapshotLibraryDeck(unknown,ids[0],options),/Oracle ID/);
console.log('Commander snapshots: six exact hundreds, identity/version separation, invalid-list rejection, immutable collection passed');
