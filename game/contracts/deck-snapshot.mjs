import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const Model = require('../../collection-model.js');
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
export const sha256 = text => createHash('sha256').update(text).digest('hex');

/** Versioned canonical JSON: code-point key order, finite JSON values only. */
export function canonical(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && Object.getPrototypeOf(value) === Object.prototype) {
    return '{' + Object.keys(value).sort(compare).map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
  }
  throw new TypeError('Snapshot contains a non-JSON value');
}

function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

/** Copy only deck information. Inventory, credentials, notes and private reports never enter a pack. */
export function snapshotLibraryDeck(state, deckId, {facts = {}, identities = {}, sourceRevision, capturedAt} = {}) {
  const deck = Object.values(state.decks).find(d => d.id === deckId);
  if (!deck) throw new Error(`Deck not found: ${deckId}`);
  if (!capturedAt || !sourceRevision) throw new Error('Snapshot requires a capture time and source revision');
  const commanderIds = new Set(deck.commanders);
  if (commanderIds.size !== deck.commanders.length || commanderIds.size < 1 || commanderIds.size > 2) {
    throw new Error('Expected one commander or a two-commander pair');
  }
  function card(id, quantity) {
    const ref = state.cards[id];
    const identity = identities[ref?.name];
    const oracleId = ref?.oracleId || (identity?.name === ref?.name && identity.oracleId);
    if (!ref?.name || !oracleId) throw new Error(`Missing card name or Oracle ID: ${id}`);
    if (ref.oracleId && identity?.oracleId && ref.oracleId !== identity.oracleId) throw new Error(`Conflicting Oracle ID: ${ref.name}`);
    if (!Number.isSafeInteger(quantity) || quantity <= 0) throw new Error(`Invalid quantity: ${ref.name}`);
    if (/[\r\n]/.test(ref.name)) throw new Error('Card names cannot contain line breaks');
    const f = facts[ref.name] || {};
    return {cardId: id, oracleId, name: ref.name, quantity,
      identitySource: ref.oracleId ? 'library' : identity.sourceUrl,
      art: {normal: f.normal || null, small: f.small || null, setCode: f.setCode || null},
      typeLine: f.typeLine || '', colorIdentity: [...(f.colorIdentity || [])]};
  }
  const counts = new Map();
  for (const slot of deck.slots.filter(s => s.purpose === 'main')) {
    if (!Number.isSafeInteger(slot.quantity) || slot.quantity <= 0) throw new Error('Invalid main-deck quantity');
    counts.set(slot.cardId, (counts.get(slot.cardId) || 0) + slot.quantity);
  }
  // CrankMagic stores commanders in main slots. Strip exactly one physical commander copy.
  for (const id of commanderIds) {
    if (counts.get(id) !== 1) throw new Error(`Commander must appear exactly once in the hundred: ${id}`);
    counts.delete(id);
  }
  const commanders = [...commanderIds].map(id => card(id, 1));
  const library = [...counts].map(([id, n]) => card(id, n)).sort((a, b) => compare(a.oracleId, b.oracleId));
  const total = library.reduce((n, c) => n + c.quantity, commanders.length);
  if (total !== 100) throw new Error(`${deck.name} has ${total} cards; Commander requires exactly 100 including commanders`);
  const seen = new Set();
  for (const c of [...commanders, ...library]) {
    if (seen.has(c.oracleId)) throw new Error(`Duplicate Oracle identity: ${c.name}`);
    seen.add(c.oracleId);
  }
  // Printing and website version do not change gameplay identity. Engine/data versions belong to the match.
  const identity = {schema: 'CommanderDeckIdentity@1',
    commanders: commanders.map(c => [c.oracleId, c.quantity]).sort((a, b) => compare(a[0], b[0])),
    library: library.map(c => [c.oracleId, c.quantity])};
  return freeze({schema: 'CommanderDeckSnapshot@1', deckId, deckVersion: deck.version,
    name: deck.name, source: {kind: 'crankmagic-library', revision: sourceRevision, capturedAt},
    fingerprint: Model.fingerprint(deck), gameplayHash: sha256(canonical(identity)),
    commanders, library, total, legality: 'engine-validation-required'});
}

export function forgeDeckText(snapshot) {
  const row = c => `${c.quantity} ${c.name}`;
  if (/[\r\n]/.test(snapshot.name)) throw new Error('Deck name cannot contain line breaks');
  return ['[metadata]', `Name=${snapshot.name}`, '[Commander]', ...snapshot.commanders.map(row),
    '[Main]', ...snapshot.library.map(row), ''].join('\n');
}
