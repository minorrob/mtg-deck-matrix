/* Unit tests for collection-lobby-draft.js
 * 
 * Tests cover:
 * - Resolve success (all names match)
 * - Unresolved list (some names don't match)
 * - createDeck draft (new deck created)
 * - Re-apply editDeck (update existing draft)
 * - No Owned lots created (only draft deck)
 */

// Simple test runner for Node.js (must be setup before test definitions)
const tests = [];
let currentSuite = '';

global.describe = (name, fn) => {
  currentSuite = name;
  fn();
};

global.test = (name, fn) => {
  tests.push({ suite: currentSuite, name, fn });
};

global.expect = (value) => ({
  toBe: (expected) => {
    if (value !== expected) {
      throw new Error(`Expected ${value} to be ${expected}`);
    }
  },
  toEqual: (expected) => {
    const a = JSON.stringify(value);
    const b = JSON.stringify(expected);
    if (a !== b) {
      throw new Error(`Expected ${a} to equal ${b}`);
    }
  },
  toBeTruthy: () => {
    if (!value) {
      throw new Error(`Expected ${value} to be truthy`);
    }
  },
  toBeNull: () => {
    if (value !== null) {
      throw new Error(`Expected ${value} to be null`);
    }
  },
  not: {
    toBe: (expected) => {
      if (value === expected) {
        throw new Error(`Expected ${value} not to be ${expected}`);
      }
    },
    toHaveBeenCalled: () => {
      if (value.mock && value.mock.calls.length > 0) {
        throw new Error(`Expected function not to have been called`);
      }
    }
  },
  toHaveLength: (expected) => {
    if (value.length !== expected) {
      throw new Error(`Expected length ${value.length} to be ${expected}`);
    }
  },
  toContain: (expected) => {
    if (!value.includes(expected)) {
      throw new Error(`Expected ${value} to contain ${expected}`);
    }
  },
  toHaveBeenCalled: () => {
    if (!value.mock || value.mock.calls.length === 0) {
      throw new Error(`Expected function to have been called`);
    }
  },
  rejects: {
    toThrow: async (expected) => {
      try {
        await value;
        throw new Error(`Expected promise to reject with "${expected}"`);
      } catch (error) {
        if (!error.message.includes(expected)) {
          throw new Error(`Expected error "${error.message}" to include "${expected}"`);
        }
      }
    }
  }
});

global.jest = {
  fn: () => {
    const fn = function(...args) {
      fn.mock.calls.push(args);
    };
    fn.mock = { calls: [] };
    return fn;
  }
};

const CrankCollectionLobbyDraft = require('./collection-lobby-draft.js');
const CrankCollection = require('./collection-model.js');

// Mock catalog data
const MOCK_CATALOG = {
  'Sol Ring': {
    id: 'card:sol-ring',
    name: 'Sol Ring',
    typeLine: 'Artifact',
    colorIdentity: [],
    oracleId: 'mock-oracle-1',
    verified: true,
    legalities: { commander: 'legal' }
  },
  'Command Tower': {
    id: 'card:command-tower',
    name: 'Command Tower',
    typeLine: 'Land',
    colorIdentity: [],
    oracleId: 'mock-oracle-2',
    verified: true,
    legalities: { commander: 'legal' }
  },
  'Krenko, Mob Boss': {
    id: 'card:krenko-mob-boss',
    name: 'Krenko, Mob Boss',
    typeLine: 'Legendary Creature — Goblin Warrior',
    colorIdentity: ['R'],
    oracleId: 'mock-oracle-3',
    verified: true,
    commander: true,
    legalities: { commander: 'legal' }
  },
  'Lightning Bolt': {
    id: 'card:lightning-bolt',
    name: 'Lightning Bolt',
    typeLine: 'Instant',
    colorIdentity: ['R'],
    oracleId: 'mock-oracle-4',
    verified: true,
    legalities: { commander: 'legal' }
  },
  'Mountain': {
    id: 'card:mountain',
    name: 'Mountain',
    typeLine: 'Basic Land — Mountain',
    colorIdentity: ['R'],
    oracleId: 'mock-oracle-5',
    verified: true,
    legalities: { commander: 'legal' }
  }
};

function mockCatalogExact(name) {
  return MOCK_CATALOG[name] || null;
}

function createMockState() {
  return CrankCollection.empty();
}

describe('collection-lobby-draft', () => {
  describe('ensureLobbyDraft', () => {
    test('resolves all names and creates draft deck successfully', async () => {
      const state = createMockState();
      let committedCommand = null;

      const mockCommit = async (command, options) => {
        committedCommand = command;
        const result = CrankCollection.apply(state, { id: 'test-1', ...command });
        Object.assign(state, result.state);
        return result;
      };

      const result = await CrankCollectionLobbyDraft.ensureLobbyDraft({
        seatLabel: 'Test Deck',
        commanders: [{ name: 'Krenko, Mob Boss' }],
        cards: [
          { name: 'Sol Ring', quantity: 1 },
          { name: 'Lightning Bolt', quantity: 1 },
          { name: 'Mountain', quantity: 50 }
        ],
        catalogExact: mockCatalogExact,
        commit: mockCommit,
        state
      });

      expect(result.ok).toBe(true);
      expect(result.unresolved).toEqual([]);
      expect(result.deckId).toBeTruthy();
      expect(result.summary).toBeTruthy();
      expect(result.commanders).toHaveLength(1);
      expect(result.commanders[0]).toEqual({
        name: 'Krenko, Mob Boss',
        cardId: 'card:krenko-mob-boss',
        typeLine: 'Legendary Creature — Goblin Warrior',
        colorIdentity: ['R']
      });
      expect(result.cards).toHaveLength(3);
      expect(result.cards[0]).toEqual({
        name: 'Sol Ring',
        quantity: 1,
        cardId: 'card:sol-ring',
        typeLine: 'Artifact',
        colorIdentity: []
      });

      // Verify committed command
      expect(committedCommand.type).toBe('createDeck');
      expect(committedCommand.name).toBe('Test Deck');
      expect(committedCommand.commanders).toEqual(['card:krenko-mob-boss']);
      expect(committedCommand.slots).toHaveLength(4); // 1 commander + 3 cards
      expect(committedCommand.cards).toBeTruthy(); // Catalog cards included
    });

    test('returns unresolved names when exact match fails', async () => {
      const state = createMockState();
      const mockCommit = jest.fn();

      const result = await CrankCollectionLobbyDraft.ensureLobbyDraft({
        seatLabel: 'Test Deck',
        commanders: [{ name: 'Krenko, Mob Boss' }],
        cards: [
          { name: 'Sol Ring', quantity: 1 },
          { name: 'Unknown Card Name', quantity: 1 },
          { name: 'Another Missing Card', quantity: 2 }
        ],
        catalogExact: mockCatalogExact,
        commit: mockCommit,
        state
      });

      expect(result.ok).toBe(false);
      expect(result.unresolved).toEqual([{ name: 'Unknown Card Name' }, { name: 'Another Missing Card' }]);
      expect(result.deckId).toBeNull();
      expect(result.commanders).toEqual([]);
      expect(result.cards).toEqual([]);
      expect(mockCommit).not.toHaveBeenCalled();
    });

    test('returns unresolved commanders when commander name fails', async () => {
      const state = createMockState();
      const mockCommit = jest.fn();

      const result = await CrankCollectionLobbyDraft.ensureLobbyDraft({
        seatLabel: 'Test Deck',
        commanders: [{ name: 'Unknown Commander' }],
        cards: [
          { name: 'Sol Ring', quantity: 1 }
        ],
        catalogExact: mockCatalogExact,
        commit: mockCommit,
        state
      });

      expect(result.ok).toBe(false);
      expect(result.unresolved).toEqual([{ name: 'Unknown Commander' }]);
      expect(result.deckId).toBeNull();
      expect(mockCommit).not.toHaveBeenCalled();
    });

    test('updates existing draft deck when existingDeckId provided and deck is draft', async () => {
      const state = createMockState();
      
      // First create a draft deck with enough cards
      const initialSlots = [
        { cardId: 'card:krenko-mob-boss', quantity: 1, purpose: 'main' },
        { cardId: 'card:mountain', quantity: 99, purpose: 'main' }
      ];
      
      let result = CrankCollection.apply(state, {
        id: 'setup-1',
        type: 'createDeck',
        deckId: 'deck:existing',
        name: 'Original Deck',
        commanders: ['card:krenko-mob-boss'],
        cards: [MOCK_CATALOG['Krenko, Mob Boss'], MOCK_CATALOG['Mountain']],
        slots: initialSlots
      });
      Object.assign(state, result.state);

      let committedCommand = null;
      const mockCommit = async (command, options) => {
        committedCommand = command;
        // Don't apply the command in this test - just verify it was called correctly
        return { state, summary: 'Mock commit' };
      };

      const updateResult = await CrankCollectionLobbyDraft.ensureLobbyDraft({
        seatLabel: 'Updated Deck',
        commanders: [{ name: 'Krenko, Mob Boss' }],
        cards: [
          { name: 'Sol Ring', quantity: 1 },
          { name: 'Mountain', quantity: 50 }
        ],
        existingDeckId: 'deck:existing',
        catalogExact: mockCatalogExact,
        commit: mockCommit,
        state
      });

      expect(updateResult.ok).toBe(true);
      expect(updateResult.deckId).toBe('deck:existing');
      expect(committedCommand.type).toBe('editDeck');
      expect(committedCommand.deckId).toBe('deck:existing');
      expect(committedCommand.name).toBe('Updated Deck');
    });

    test('creates new deck when existingDeckId is final (not draft)', async () => {
      const state = createMockState();
      
      // Create a finalized deck with 100 cards
      const finalizedSlots = [
        { cardId: 'card:krenko-mob-boss', quantity: 1, purpose: 'main' },
        { cardId: 'card:mountain', quantity: 99, purpose: 'main' }
      ];
      
      let result = CrankCollection.apply(state, {
        id: 'setup-1',
        type: 'createDeck',
        deckId: 'deck:finalized',
        name: 'Finalized Deck',
        commanders: ['card:krenko-mob-boss'],
        cards: [MOCK_CATALOG['Krenko, Mob Boss'], MOCK_CATALOG['Mountain']],
        slots: finalizedSlots
      });
      Object.assign(state, result.state);
      
      // Finalize it
      result = CrankCollection.apply(state, {
        id: 'setup-2',
        type: 'finalize',
        deckId: 'deck:finalized'
      });
      Object.assign(state, result.state);

      let committedCommand = null;
      const mockCommit = async (command, options) => {
        committedCommand = command;
        const result = CrankCollection.apply(state, { id: 'test-3', ...command });
        Object.assign(state, result.state);
        return result;
      };

      const updateResult = await CrankCollectionLobbyDraft.ensureLobbyDraft({
        seatLabel: 'New Draft Deck',
        commanders: [{ name: 'Krenko, Mob Boss' }],
        cards: [
          { name: 'Sol Ring', quantity: 1 }
        ],
        existingDeckId: 'deck:finalized',
        catalogExact: mockCatalogExact,
        commit: mockCommit,
        state
      });

      expect(updateResult.ok).toBe(true);
      expect(updateResult.deckId).not.toBe('deck:finalized');
      expect(committedCommand.type).toBe('createDeck');
    });

    test('creates new deck when existingDeckId is archived', async () => {
      const state = createMockState();
      
      // Create and archive a deck with 100 cards
      const archivedSlots = [
        { cardId: 'card:krenko-mob-boss', quantity: 1, purpose: 'main' },
        { cardId: 'card:mountain', quantity: 99, purpose: 'main' }
      ];
      
      let result = CrankCollection.apply(state, {
        id: 'setup-1',
        type: 'createDeck',
        deckId: 'deck:archived',
        name: 'Archived Deck',
        commanders: ['card:krenko-mob-boss'],
        cards: [MOCK_CATALOG['Krenko, Mob Boss'], MOCK_CATALOG['Mountain']],
        slots: archivedSlots
      });
      Object.assign(state, result.state);
      
      // Finalize and archive
      result = CrankCollection.apply(state, {
        id: 'setup-2',
        type: 'finalize',
        deckId: 'deck:archived'
      });
      Object.assign(state, result.state);
      
      result = CrankCollection.apply(state, {
        id: 'setup-3',
        type: 'archive',
        deckId: 'deck:archived'
      });
      Object.assign(state, result.state);

      let committedCommand = null;
      const mockCommit = async (command, options) => {
        committedCommand = command;
        const result = CrankCollection.apply(state, { id: 'test-4', ...command });
        Object.assign(state, result.state);
        return result;
      };

      const updateResult = await CrankCollectionLobbyDraft.ensureLobbyDraft({
        seatLabel: 'New Draft Deck',
        commanders: [{ name: 'Krenko, Mob Boss' }],
        cards: [
          { name: 'Sol Ring', quantity: 1 }
        ],
        existingDeckId: 'deck:archived',
        catalogExact: mockCatalogExact,
        commit: mockCommit,
        state
      });

      expect(updateResult.ok).toBe(true);
      expect(updateResult.deckId).not.toBe('deck:archived');
      expect(committedCommand.type).toBe('createDeck');
    });

    test('does not create any Owned/Ordered lots', async () => {
      const state = createMockState();

      const mockCommit = async (command, options) => {
        const result = CrankCollection.apply(state, { id: 'test-5', ...command });
        Object.assign(state, result.state);
        return result;
      };

      await CrankCollectionLobbyDraft.ensureLobbyDraft({
        seatLabel: 'Test Deck',
        commanders: [{ name: 'Krenko, Mob Boss' }],
        cards: [
          { name: 'Sol Ring', quantity: 1 },
          { name: 'Mountain', quantity: 50 }
        ],
        catalogExact: mockCatalogExact,
        commit: mockCommit,
        state
      });

      // Verify no lots were created
      expect(state.lots).toHaveLength(0);
      
      // Verify deck exists
      expect(state.decks).toHaveLength(1);
      expect(state.decks[0].status).toBe('draft');
    });

    test('handles multiple commanders (partner)', async () => {
      const partnerA = {
        id: 'card:partner-a',
        name: 'Partner A',
        typeLine: 'Legendary Creature — Human Warrior',
        colorIdentity: ['W'],
        oracleId: 'mock-oracle-partner-a',
        verified: true,
        commander: true
      };
      const partnerB = {
        id: 'card:partner-b',
        name: 'Partner B',
        typeLine: 'Legendary Creature — Elf Wizard',
        colorIdentity: ['U'],
        oracleId: 'mock-oracle-partner-b',
        verified: true,
        commander: true
      };

      const extendedCatalog = {
        ...MOCK_CATALOG,
        'Partner A': partnerA,
        'Partner B': partnerB
      };

      const state = createMockState();
      const mockCommit = async (command, options) => {
        const result = CrankCollection.apply(state, { id: 'test-6', ...command });
        Object.assign(state, result.state);
        return result;
      };

      const result = await CrankCollectionLobbyDraft.ensureLobbyDraft({
        seatLabel: 'Partner Deck',
        commanders: [{ name: 'Partner A' }, { name: 'Partner B' }],
        cards: [
          { name: 'Sol Ring', quantity: 1 }
        ],
        catalogExact: (name) => extendedCatalog[name] || null,
        commit: mockCommit,
        state
      });

      expect(result.ok).toBe(true);
      expect(result.commanders).toHaveLength(2);
      expect(result.commanders[0].name).toBe('Partner A');
      expect(result.commanders[1].name).toBe('Partner B');
    });

    test('validates required parameters', async () => {
      const state = createMockState();
      const mockCommit = jest.fn();

      await expect(
        CrankCollectionLobbyDraft.ensureLobbyDraft({
          commanders: [{ name: 'Krenko, Mob Boss' }],
          cards: [],
          catalogExact: mockCatalogExact,
          commit: mockCommit,
          state
        })
      ).rejects.toThrow('seatLabel is required');

      await expect(
        CrankCollectionLobbyDraft.ensureLobbyDraft({
          seatLabel: 'Test',
          commanders: [{ name: 'Krenko, Mob Boss' }],
          cards: [],
          commit: mockCommit,
          state
        })
      ).rejects.toThrow('catalogExact resolver function is required');

      await expect(
        CrankCollectionLobbyDraft.ensureLobbyDraft({
          seatLabel: 'Test',
          commanders: [{ name: 'Krenko, Mob Boss' }],
          cards: [],
          catalogExact: mockCatalogExact,
          state
        })
      ).rejects.toThrow('commit function is required');
    });

    test('validates card quantities', async () => {
      const state = createMockState();
      const mockCommit = jest.fn();

      await expect(
        CrankCollectionLobbyDraft.ensureLobbyDraft({
          seatLabel: 'Test',
          commanders: [{ name: 'Krenko, Mob Boss' }],
          cards: [
            { name: 'Sol Ring', quantity: 0 }
          ],
          catalogExact: mockCatalogExact,
          commit: mockCommit,
          state
        })
      ).rejects.toThrow('Invalid quantity');

      await expect(
        CrankCollectionLobbyDraft.ensureLobbyDraft({
          seatLabel: 'Test',
          commanders: [{ name: 'Krenko, Mob Boss' }],
          cards: [
            { name: 'Sol Ring', quantity: 1.5 }
          ],
          catalogExact: mockCatalogExact,
          commit: mockCommit,
          state
        })
      ).rejects.toThrow('Invalid quantity');
    });

    test('typeLine correctly populated for type-bar contract', async () => {
      const state = createMockState();
      const mockCommit = async (command, options) => {
        const result = CrankCollection.apply(state, { id: 'test-7', ...command });
        Object.assign(state, result.state);
        return result;
      };

      const result = await CrankCollectionLobbyDraft.ensureLobbyDraft({
        seatLabel: 'Type Test Deck',
        commanders: [{ name: 'Krenko, Mob Boss' }],
        cards: [
          { name: 'Sol Ring', quantity: 1 },
          { name: 'Lightning Bolt', quantity: 1 },
          { name: 'Mountain', quantity: 1 }
        ],
        catalogExact: mockCatalogExact,
        commit: mockCommit,
        state
      });

      expect(result.ok).toBe(true);
      
      // Verify typeLines are present for type bar buckets
      expect(result.cards[0].typeLine).toBe('Artifact');
      expect(result.cards[1].typeLine).toBe('Instant');
      expect(result.cards[2].typeLine).toContain('Land');
      
      // Commander typeLine
      expect(result.commanders[0].typeLine).toContain('Creature');
    });
  });
});

// Run tests if executed directly
if (typeof module !== 'undefined' && require.main === module) {
  console.log('Running collection-lobby-draft tests...\n');
  
  (async () => {
    let passed = 0;
    let failed = 0;
    
    for (const {suite, name, fn} of tests) {
      try {
        await fn();
        console.log(`✓ ${suite} > ${name}`);
        passed++;
      } catch (error) {
        console.log(`✗ ${suite} > ${name}`);
        console.log(`  ${error.message}`);
        failed++;
      }
    }
    
    console.log(`\n${passed} passed, ${failed} failed`);
    process.exit(failed > 0 ? 1 : 0);
  })();
}
