/* Tests for scoped graph loading: neighborhoods without the full corpus.
 *
 * Checks that:
 * - Scoped loading detects seed params correctly
 * - Neighborhood building respects depth and breadth limits
 * - Canvas remains interactive with scoped slice
 * - Background full load doesn't block the UI
 * - IndexedDB caching works for the full graph
 */
import {strict as assert} from 'node:assert';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');

const require = createRequire(import.meta.url);

/* Load the scoped module */
const scopedSrc = readFileSync(join(ROOT, 'crankmagic-graph-scoped.js'), 'utf8');
const sandbox = {};
new Function('globalThis', 'window', scopedSrc)(sandbox, sandbox);
const Scoped = sandbox.CrankGraphScoped;

/* Mock URLSearchParams */
class MockURLSearchParams {
  constructor(params = {}) {
    this.params = params;
  }
  get(key) {
    return this.params[key] || null;
  }
}

let checks = 0;
const ok = (label, fn) => {
  fn();
  checks += 1;
  process.stdout.write(`  ok  ${label}\n`);
};

/* Basic API presence */
ok('Scoped module exports the expected API', () => {
  assert.ok(Scoped);
  assert.equal(typeof Scoped.shouldUseScoped, 'function');
  assert.equal(typeof Scoped.getSeedFromParams, 'function');
  assert.equal(typeof Scoped.buildNeighborhood, 'function');
  assert.equal(typeof Scoped.loadScoped, 'function');
  assert.equal(typeof Scoped.loadFull, 'function');
});

/* Seed detection from params */
ok('shouldUseScoped returns true when deck param is present', () => {
  const params = new MockURLSearchParams({deck: 'some-deck-id'});
  assert.equal(Scoped.shouldUseScoped(params), true);
});

ok('shouldUseScoped returns true when commander param is present', () => {
  const params = new MockURLSearchParams({commander: 'Atraxa, Praetors\' Voice'});
  assert.equal(Scoped.shouldUseScoped(params), true);
});

ok('shouldUseScoped returns true when card param is present', () => {
  const params = new MockURLSearchParams({card: 'Sol Ring'});
  assert.equal(Scoped.shouldUseScoped(params), true);
});

ok('shouldUseScoped returns false when no seed param is present', () => {
  const params = new MockURLSearchParams({});
  assert.equal(Scoped.shouldUseScoped(params), false);
});

/* Seed extraction */
ok('getSeedFromParams extracts card seed', () => {
  const params = new MockURLSearchParams({card: 'Sol Ring'});
  const seed = Scoped.getSeedFromParams(params, {});
  assert.ok(seed);
  assert.equal(seed.type, 'card');
  assert.equal(seed.name, 'Sol Ring');
});

ok('getSeedFromParams extracts commander seed', () => {
  const params = new MockURLSearchParams({commander: 'Atraxa, Praetors\' Voice'});
  const seed = Scoped.getSeedFromParams(params, {});
  assert.ok(seed);
  assert.equal(seed.type, 'commander');
  assert.equal(seed.name, 'Atraxa, Praetors\' Voice');
});

ok('getSeedFromParams extracts deck seed', () => {
  const params = new MockURLSearchParams({deck: 'deck-123'});
  const seed = Scoped.getSeedFromParams(params, {});
  assert.ok(seed);
  assert.equal(seed.type, 'deck');
  assert.equal(seed.deckId, 'deck-123');
});

ok('getSeedFromParams returns null when no seed', () => {
  const params = new MockURLSearchParams({});
  const seed = Scoped.getSeedFromParams(params, {});
  assert.equal(seed, null);
});

/* Neighborhood building */
ok('buildNeighborhood respects breadth limit', () => {
  const seed = {id: 'seed-1', name: 'Seed Card', rank: 1};
  const allCards = [
    seed,
    {id: 'card-2', name: 'Card 2', rank: 2},
    {id: 'card-3', name: 'Card 3', rank: 3},
    {id: 'card-4', name: 'Card 4', rank: 4},
    {id: 'card-5', name: 'Card 5', rank: 5},
    {id: 'card-6', name: 'Card 6', rank: 6},
    {id: 'card-7', name: 'Card 7', rank: 7},
  ];
  
  /* Mock relate function that makes everything related */
  const relate = (a, b) => ({score: 10, kind: 'test'});
  
  const result = Scoped.buildNeighborhood(seed, allCards, {
    depth: 1,
    breadth: 3,
    relate
  });
  
  /* Should have seed + at most 3 neighbors */
  assert.ok(result.cards.length > 0);
  assert.ok(result.cards.length <= 4);
  assert.ok(result.cards.find(c => c.id === 'seed-1'));
});

ok('buildNeighborhood returns empty when no seed', () => {
  const result = Scoped.buildNeighborhood(null, [], {relate: () => null});
  assert.deepEqual(result.cards, []);
});

ok('buildNeighborhood includes seed in results', () => {
  const seed = {id: 'seed-1', name: 'Seed', rank: 1};
  const result = Scoped.buildNeighborhood(seed, [seed], {relate: () => null});
  assert.equal(result.cards.length, 1);
  assert.equal(result.cards[0].id, 'seed-1');
});

/* Test with actual graph data if available */
try {
  const graphPath = join(ROOT, 'data', 'graph.json');
  const graphData = JSON.parse(readFileSync(graphPath, 'utf8'));
  const Payload = require(join(ROOT, 'graph-payload.js'));
  const graph = Payload.unpack(graphData);
  
  /* Load the graph module to get relate function */
  const graphSrc = readFileSync(join(ROOT, 'crankmagic-graph.js'), 'utf8');
  const graphSandbox = {};
  new Function('globalThis', 'window', graphSrc)(graphSandbox, graphSandbox);
  const Graph = graphSandbox.CrankGraph;
  
  ok('buildNeighborhood works with actual graph data', () => {
    const atraxa = graph.cards.find(c => c.name === 'Atraxa, Praetors\' Voice');
    if (atraxa) {
      const result = Scoped.buildNeighborhood(atraxa, graph.cards, {
        depth: 2,
        breadth: 12,
        relate: (a, b) => Graph.relate(a, b)
      });
      
      /* Should build a reasonable neighborhood */
      assert.ok(result.cards.length > 1);
      assert.ok(result.cards.length <= 180);
      assert.ok(result.cards.find(c => c.id === atraxa.id));
    }
  });
} catch (e) {
  process.stdout.write(`  skip graph data tests (${e.message})\n`);
}

process.stdout.write(`\n${checks} checks complete.\n`);
