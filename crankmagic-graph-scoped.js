/* Scoped graph loading: build neighborhoods without downloading the full corpus first.
 *
 * THE PROBLEM. The full graph (~37MB uncompressed) must download before Discover paints,
 * even when a seed (deck/commander/card) is in the URL. A reader following a link waits
 * on 7,764 cards to see the neighborhood of one.
 *
 * THE SOLUTION. Bootstrap the UI with metadata only, build a scoped slice (N hops from
 * the seed, loop-relevant edges preferred) and render that immediately, then lazy-load
 * the full corpus in the background or on explicit widen. Cache the full graph in
 * IndexedDB once loaded, keyed by the file's stamp.
 *
 * Entry points:
 *   loadScoped({seed, depth, breadth, catalog}) → {cards, played, scoped: true}
 *   loadFull({catalog, background}) → full graph
 *   getCached(stamp) → cached graph or null
 *   putCached(stamp, graph) → stores for next load
 */
(function (root) {
  'use strict';

  const DB_NAME = 'crankmagic-graph-cache';
  const DB_VERSION = 1;
  const STORE_NAME = 'graphs';
  const MAX_DEPTH = 3;
  const DEFAULT_BREADTH = 30;

  /* IndexedDB wrapper for caching the full graph. */
  let dbPromise = null;
  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (!globalThis.indexedDB) {
        reject(new Error('IndexedDB not available'));
        return;
      }
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
    });
    return dbPromise;
  }

  async function getCached(stamp) {
    if (!stamp) return null;
    try {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const request = tx.objectStore(STORE_NAME).get(stamp);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
      });
    } catch (e) {
      console.warn('Graph cache read failed:', e);
      return null;
    }
  }

  async function putCached(stamp, data) {
    if (!stamp || !data) return;
    try {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const request = tx.objectStore(STORE_NAME).put(data, stamp);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    } catch (e) {
      console.warn('Graph cache write failed:', e);
    }
  }

  async function clearOldCaches(currentStamp) {
    try {
      const db = await openDB();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const keys = await new Promise((resolve, reject) => {
        const req = store.getAllKeys();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      for (const key of keys) {
        if (key !== currentStamp) {
          await new Promise((resolve, reject) => {
            const req = store.delete(key);
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
          });
        }
      }
    } catch (e) {
      console.warn('Could not clear old graph caches:', e);
    }
  }

  /* Build a neighborhood slice around one seed card at specified depth/breadth.
   * Uses the catalog's relate function to score pairs and builds outward from the seed. */
  function buildNeighborhood(seedCard, allCards, {depth = 2, breadth = 12, relate}) {
    if (!seedCard || !allCards || !relate) return {cards: [], played: []};
    
    const maxDepth = Math.min(MAX_DEPTH, depth);
    const maxBreadth = Math.min(DEFAULT_BREADTH, breadth);
    const CAP = 180;
    
    const byId = new Map(allCards.map(c => [c.id, c]));
    const placed = new Set([seedCard.id]);
    const result = [seedCard];
    
    // BFS outward from seed
    let frontier = [{card: seedCard, depth: 0}];
    
    for (let d = 1; d <= maxDepth && result.length < CAP && frontier.length; d++) {
      const nextFrontier = [];
      
      for (const {card: parent} of frontier) {
        if (result.length >= CAP) break;
        
        // Find best neighbors of this parent
        const candidates = [];
        for (const candidate of allCards) {
          if (placed.has(candidate.id)) continue;
          const relation = relate(parent, candidate);
          if (relation && relation.score > 0) {
            candidates.push({card: candidate, relation});
          }
        }
        
        // Sort by score and rank, take top N
        candidates.sort((a, b) => 
          b.relation.score - a.relation.score || 
          (a.card.rank || Infinity) - (b.card.rank || Infinity)
        );
        
        const take = Math.min(maxBreadth, candidates.length, CAP - result.length);
        for (let i = 0; i < take; i++) {
          const {card} = candidates[i];
          placed.add(card.id);
          result.push(card);
          nextFrontier.push({card, depth: d});
        }
      }
      
      frontier = nextFrontier;
    }
    
    return {cards: result, played: []};
  }

  /* Load just the graph metadata (stamp, schema, counts) without card data. */
  async function loadMetadata(url) {
    const response = await fetch(url, {
      method: 'HEAD',
      cache: 'default'
    });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    
    // We need at least the stamp to cache properly, so fetch minimally
    const dataResponse = await fetch(url, {cache: 'default'});
    if (!dataResponse.ok) throw new Error('HTTP ' + dataResponse.status);
    const data = await dataResponse.json();
    
    return {
      stamp: data.generatedAt || data.amplifiersAt || '',
      schema: data.schema || '',
      cardCount: (data.counts && data.counts.cards) || (data.cards && data.cards.length) || 0
    };
  }

  /* Load a scoped neighborhood slice without loading the full graph.
   * This is the fast path for seeded entry. */
  async function loadScoped({seedCard, seedName, depth = 2, breadth = 12, catalog, graphUrl, onProgress}) {
    if (!catalog || !graphUrl) throw new Error('Catalog and graph URL required');
    
    // Report progress
    onProgress?.({phase: 'metadata', done: 0, total: 1});
    
    // Try to load from cache first
    const meta = await loadMetadata(graphUrl);
    const cached = await getCached(meta.stamp);
    
    if (cached) {
      onProgress?.({phase: 'cached', done: 1, total: 1});
      // Build neighborhood from cache
      const seed = seedCard || cached.cards.find(c => c.name === seedName);
      if (seed) {
        const relate = catalog.relate || ((a, b) => 
          globalThis.CrankGraph ? globalThis.CrankGraph.relate(a, b) : null
        );
        const slice = buildNeighborhood(seed, cached.cards, {depth, breadth, relate});
        return {...slice, scoped: true, fullGraph: cached};
      }
    }
    
    // Cache miss: load minimal set for the seed
    onProgress?.({phase: 'loading', done: 0, total: meta.cardCount});
    
    // For MVP, we need to load the full graph to build the neighborhood
    // In a future iteration, this could be server-side or pre-sharded
    const response = await fetch(graphUrl, {cache: 'default'});
    if (!response.ok) throw new Error('HTTP ' + response.status);
    
    const rawData = await response.json();
    onProgress?.({phase: 'unpacking', done: meta.cardCount, total: meta.cardCount});
    
    const Payload = globalThis.CrankGraphPayload;
    const fullGraph = Payload ? Payload.unpack(rawData) : rawData;
    
    // Cache for next time
    putCached(meta.stamp, fullGraph).catch(() => {});
    clearOldCaches(meta.stamp).catch(() => {});
    
    // Build neighborhood
    const seed = seedCard || fullGraph.cards.find(c => c.name === seedName);
    if (seed) {
      const relate = catalog.relate || ((a, b) => 
        globalThis.CrankGraph ? globalThis.CrankGraph.relate(a, b) : null
      );
      const slice = buildNeighborhood(seed, fullGraph.cards, {depth, breadth, relate});
      return {...slice, scoped: true, fullGraph};
    }
    
    // No seed found, return minimal set
    return {cards: fullGraph.cards.slice(0, 50), played: [], scoped: true, fullGraph};
  }

  /* Load the full graph, checking cache first. */
  async function loadFull({graphUrl, onProgress, catalog}) {
    if (!graphUrl) throw new Error('Graph URL required');
    
    onProgress?.({phase: 'checking-cache', done: 0, total: 1});
    
    const meta = await loadMetadata(graphUrl);
    const cached = await getCached(meta.stamp);
    
    if (cached) {
      onProgress?.({phase: 'cached', done: 1, total: 1});
      return cached;
    }
    
    onProgress?.({phase: 'loading', done: 0, total: meta.cardCount});
    
    const response = await fetch(graphUrl, {cache: 'default'});
    if (!response.ok) throw new Error('HTTP ' + response.status);
    
    const rawData = await response.json();
    onProgress?.({phase: 'unpacking', done: meta.cardCount, total: meta.cardCount});
    
    const Payload = globalThis.CrankGraphPayload;
    const fullGraph = Payload ? Payload.unpack(rawData) : rawData;
    
    // Cache for next time
    putCached(meta.stamp, fullGraph).catch(() => {});
    clearOldCaches(meta.stamp).catch(() => {});
    
    onProgress?.({phase: 'complete', done: meta.cardCount, total: meta.cardCount});
    
    return fullGraph;
  }

  /* Check if we should use scoped loading based on URL params */
  function shouldUseScoped(params) {
    return !!(params.get('deck') || params.get('commander') || params.get('card'));
  }

  /* Extract seed information from URL params */
  function getSeedFromParams(params, catalog) {
    if (params.get('card')) {
      const cardName = params.get('card');
      return {type: 'card', name: cardName};
    }
    if (params.get('commander')) {
      const commanderName = params.get('commander');
      return {type: 'commander', name: commanderName};
    }
    if (params.get('deck')) {
      const deckId = params.get('deck');
      // Will need to resolve deck → commander in the caller
      return {type: 'deck', deckId};
    }
    return null;
  }

  const api = {
    loadScoped,
    loadFull,
    getCached,
    putCached,
    clearOldCaches,
    shouldUseScoped,
    getSeedFromParams,
    buildNeighborhood
  };

  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.CrankGraphScoped = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
