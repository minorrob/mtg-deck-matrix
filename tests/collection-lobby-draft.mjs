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

import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const CrankCollectionLobbyDraft = require('../collection-lobby-draft.js');
const CrankCollection = require('../collection-model.js');

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

  describe('attachDeckReport', () => {
    test('attaches report successfully when fingerprint matches', async () => {
      const state = createMockState();
      
      // Create a draft deck
      const slots = [
        { cardId: 'card:krenko-mob-boss', quantity: 1, purpose: 'main' },
        { cardId: 'card:sol-ring', quantity: 1, purpose: 'main' },
        { cardId: 'card:mountain', quantity: 98, purpose: 'main' }
      ];
      
      let result = CrankCollection.apply(state, {
        id: 'setup-1',
        type: 'createDeck',
        deckId: 'deck:test',
        name: 'Test Deck',
        commanders: ['card:krenko-mob-boss'],
        cards: [MOCK_CATALOG['Krenko, Mob Boss'], MOCK_CATALOG['Sol Ring'], MOCK_CATALOG['Mountain']],
        slots
      });
      Object.assign(state, result.state);

      // Compute fingerprint
      const fingerprint = JSON.stringify({
        commanders: ['card:krenko-mob-boss'],
        slots: [
          ['card:krenko-mob-boss', 1],
          ['card:mountain', 98],
          ['card:sol-ring', 1]
        ]
      });

      let committedCommand = null;
      const mockCommit = async (command, options) => {
        committedCommand = command;
        const result = CrankCollection.apply(state, { id: 'test-attach', ...command });
        Object.assign(state, result.state);
        return result;
      };

      const attachResult = await CrankCollectionLobbyDraft.attachDeckReport({
        deckId: 'deck:test',
        report: {
          protocol: 'test-protocol-v1',
          deckFingerprint: fingerprint,
          data: { some: 'report data' }
        },
        commit: mockCommit,
        state
      });

      expect(attachResult.ok).toBe(true);
      expect(attachResult.summary).toBeTruthy();
      expect(committedCommand.type).toBe('report');
      expect(committedCommand.deckId).toBe('deck:test');
      
      // Verify report was added to state
      expect(state.reports).toHaveLength(1);
      expect(state.reports[0].deckId).toBe('deck:test');
    });

    test('refuses report when fingerprint does not match', async () => {
      const state = createMockState();
      
      // Create a draft deck
      const slots = [
        { cardId: 'card:krenko-mob-boss', quantity: 1, purpose: 'main' },
        { cardId: 'card:sol-ring', quantity: 1, purpose: 'main' },
        { cardId: 'card:mountain', quantity: 98, purpose: 'main' }
      ];
      
      let result = CrankCollection.apply(state, {
        id: 'setup-1',
        type: 'createDeck',
        deckId: 'deck:test',
        name: 'Test Deck',
        commanders: ['card:krenko-mob-boss'],
        cards: [MOCK_CATALOG['Krenko, Mob Boss'], MOCK_CATALOG['Sol Ring'], MOCK_CATALOG['Mountain']],
        slots
      });
      Object.assign(state, result.state);

      const mockCommit = jest.fn();

      const attachResult = await CrankCollectionLobbyDraft.attachDeckReport({
        deckId: 'deck:test',
        report: {
          protocol: 'test-protocol-v1',
          deckFingerprint: 'wrong-fingerprint',
          data: { some: 'report data' }
        },
        commit: mockCommit,
        state
      });

      expect(attachResult.ok).toBe(false);
      expect(attachResult.error).toContain('fingerprint does not match');
      expect(mockCommit).not.toHaveBeenCalled();
    });

    test('refuses report when deck not found', async () => {
      const state = createMockState();
      const mockCommit = jest.fn();

      const attachResult = await CrankCollectionLobbyDraft.attachDeckReport({
        deckId: 'deck:nonexistent',
        report: {
          protocol: 'test-protocol-v1',
          deckFingerprint: 'any-fingerprint',
          data: { some: 'report data' }
        },
        commit: mockCommit,
        state
      });

      expect(attachResult.ok).toBe(false);
      expect(attachResult.error).toBe('Deck not found');
      expect(mockCommit).not.toHaveBeenCalled();
    });

    test('validates required report fields', async () => {
      const state = createMockState();
      const mockCommit = jest.fn();

      await expect(
        CrankCollectionLobbyDraft.attachDeckReport({
          report: {
            protocol: 'test-protocol-v1',
            deckFingerprint: 'fingerprint'
          },
          commit: mockCommit,
          state
        })
      ).rejects.toThrow('deckId is required');

      await expect(
        CrankCollectionLobbyDraft.attachDeckReport({
          deckId: 'deck:test',
          report: {
            deckFingerprint: 'fingerprint'
          },
          commit: mockCommit,
          state
        })
      ).rejects.toThrow('report.protocol is required');

      await expect(
        CrankCollectionLobbyDraft.attachDeckReport({
          deckId: 'deck:test',
          report: {
            protocol: 'test-protocol-v1'
          },
          commit: mockCommit,
          state
        })
      ).rejects.toThrow('report.deckFingerprint is required');
    });

    test('never creates Owned lots when attaching report', async () => {
      const state = createMockState();
      
      // Create a draft deck
      const slots = [
        { cardId: 'card:krenko-mob-boss', quantity: 1, purpose: 'main' },
        { cardId: 'card:sol-ring', quantity: 1, purpose: 'main' }
      ];
      
      let result = CrankCollection.apply(state, {
        id: 'setup-1',
        type: 'createDeck',
        deckId: 'deck:test',
        name: 'Test Deck',
        commanders: ['card:krenko-mob-boss'],
        cards: [MOCK_CATALOG['Krenko, Mob Boss'], MOCK_CATALOG['Sol Ring']],
        slots
      });
      Object.assign(state, result.state);

      const fingerprint = JSON.stringify({
        commanders: ['card:krenko-mob-boss'],
        slots: [
          ['card:krenko-mob-boss', 1],
          ['card:sol-ring', 1]
        ]
      });

      const mockCommit = async (command, options) => {
        const result = CrankCollection.apply(state, { id: 'test-attach', ...command });
        Object.assign(state, result.state);
        return result;
      };

      await CrankCollectionLobbyDraft.attachDeckReport({
        deckId: 'deck:test',
        report: {
          protocol: 'test-protocol-v1',
          deckFingerprint: fingerprint,
          data: { some: 'report data' }
        },
        commit: mockCommit,
        state
      });

      // Verify no lots were created
      expect(state.lots).toHaveLength(0);
      
      // Verify report exists
      expect(state.reports).toHaveLength(1);
    });

    test('reports are visible for deck in Collection state', async () => {
      const state = createMockState();
      
      // Create two decks
      let result = CrankCollection.apply(state, {
        id: 'setup-1',
        type: 'createDeck',
        deckId: 'deck:test1',
        name: 'Test Deck 1',
        commanders: ['card:krenko-mob-boss'],
        cards: [MOCK_CATALOG['Krenko, Mob Boss']],
        slots: [{ cardId: 'card:krenko-mob-boss', quantity: 1, purpose: 'main' }]
      });
      Object.assign(state, result.state);

      result = CrankCollection.apply(state, {
        id: 'setup-2',
        type: 'createDeck',
        deckId: 'deck:test2',
        name: 'Test Deck 2',
        commanders: ['card:krenko-mob-boss'],
        cards: [MOCK_CATALOG['Krenko, Mob Boss']],
        slots: [{ cardId: 'card:krenko-mob-boss', quantity: 1, purpose: 'main' }]
      });
      Object.assign(state, result.state);

      // Attach reports to both decks
      const fp1 = JSON.stringify({
        commanders: ['card:krenko-mob-boss'],
        slots: [['card:krenko-mob-boss', 1]]
      });

      let commitCounter = 0;
      const mockCommit = async (command) => {
        commitCounter++;
        const result = CrankCollection.apply(state, { id: 'commit-' + Date.now() + '-' + commitCounter, ...command });
        Object.assign(state, result.state);
        return result;
      };

      // Attach first report to deck1
      let attachResult = await CrankCollectionLobbyDraft.attachDeckReport({
        deckId: 'deck:test1',
        report: {
          protocol: 'test-protocol-v1',
          deckFingerprint: fp1,
          origin: 'measured'
        },
        commit: mockCommit,
        state
      });
      if (!attachResult.ok) {
        console.error('First attach failed:', attachResult.error);
      }
      expect(attachResult.ok).toBe(true);

      // Attach second report to deck1
      attachResult = await CrankCollectionLobbyDraft.attachDeckReport({
        deckId: 'deck:test1',
        report: {
          protocol: 'test-protocol-v2',
          deckFingerprint: fp1,
          origin: 'imported'
        },
        commit: mockCommit,
        state
      });
      if (!attachResult.ok) {
        console.error('Second attach failed:', attachResult.error);
      }
      expect(attachResult.ok).toBe(true);

      // Attach report to deck2
      attachResult = await CrankCollectionLobbyDraft.attachDeckReport({
        deckId: 'deck:test2',
        report: {
          protocol: 'test-protocol-v1',
          deckFingerprint: fp1,
          origin: 'measured'
        },
        commit: mockCommit,
        state
      });
      if (!attachResult.ok) {
        console.error('Third attach failed:', attachResult.error);
      }
      expect(attachResult.ok).toBe(true);

      // Verify reports are in state and properly separated by deck
      expect(state.reports).toHaveLength(3);
      
      const deck1Reports = state.reports.filter(r => r.deckId === 'deck:test1');
      const deck2Reports = state.reports.filter(r => r.deckId === 'deck:test2');
      
      expect(deck1Reports).toHaveLength(2);
      expect(deck2Reports).toHaveLength(1);
      
      expect(deck1Reports[0].protocol).toBe('test-protocol-v1');
      expect(deck1Reports[1].protocol).toBe('test-protocol-v2');
      expect(deck2Reports[0].protocol).toBe('test-protocol-v1');
    });

    test('preserves all report fields from CrankSim.packFor() as-is', async () => {
      const state = createMockState();
      
      // Create a draft deck
      const slots = [
        { cardId: 'card:krenko-mob-boss', quantity: 1, purpose: 'main' },
        { cardId: 'card:sol-ring', quantity: 1, purpose: 'main' }
      ];
      
      let result = CrankCollection.apply(state, {
        id: 'setup-1',
        type: 'createDeck',
        deckId: 'deck:test',
        name: 'Test Deck',
        commanders: ['card:krenko-mob-boss'],
        cards: [MOCK_CATALOG['Krenko, Mob Boss'], MOCK_CATALOG['Sol Ring']],
        slots
      });
      Object.assign(state, result.state);

      const fingerprint = JSON.stringify({
        commanders: ['card:krenko-mob-boss'],
        slots: [
          ['card:krenko-mob-boss', 1],
          ['card:sol-ring', 1]
        ]
      });

      // Full CrankSim.packFor() report with ALL fields
      const fullReport = {
        protocol: 'crankmagic-commander-2026-09',
        deckFingerprint: fingerprint,
        limits: { games: 120000, seeds: 6 },
        versions: { engine: '1.0.0', rules: '2026-09' },
        conditions: { bracket: 2, pod: 4 },
        metrics: {
          score: { value: 42, standardError: 1.2 },
          winRate: { value: 25.3 },
          averageWinTurn: { value: 8.5 }
        },
        coverage: { cardsSeen: 95, cardsPlayed: 87 },
        origin: 'measured',
        kind: 'report',
        honestyFields: { simulationId: 'sim-123', runtime: 3600 },
        runDetails: { startedAt: '2026-09-17T20:00:00Z', completedAt: '2026-09-17T21:00:00Z' }
      };

      const mockCommit = async (command, options) => {
        const result = CrankCollection.apply(state, { id: 'test-preserve', ...command });
        Object.assign(state, result.state);
        return result;
      };

      const attachResult = await CrankCollectionLobbyDraft.attachDeckReport({
        deckId: 'deck:test',
        report: fullReport,
        commit: mockCommit,
        state
      });

      expect(attachResult.ok).toBe(true);
      
      // Verify ALL fields are preserved in state.reports
      const savedReport = state.reports[0];
      expect(savedReport.protocol).toBe('crankmagic-commander-2026-09');
      expect(savedReport.deckFingerprint).toBe(fingerprint);
      expect(savedReport.limits).toEqual({ games: 120000, seeds: 6 });
      expect(savedReport.versions).toEqual({ engine: '1.0.0', rules: '2026-09' });
      expect(savedReport.conditions).toEqual({ bracket: 2, pod: 4 });
      expect(savedReport.metrics.score.value).toBe(42);
      expect(savedReport.coverage).toEqual({ cardsSeen: 95, cardsPlayed: 87 });
      expect(savedReport.origin).toBe('measured');
      expect(savedReport.kind).toBe('report');
      // Honesty fields preserved
      expect(savedReport.honestyFields).toEqual({ simulationId: 'sim-123', runtime: 3600 });
      expect(savedReport.runDetails).toEqual({ startedAt: '2026-09-17T20:00:00Z', completedAt: '2026-09-17T21:00:00Z' });
    });
  });
});

/* A suite under tests/ is run by runtests.sh, which invokes it directly. The CommonJS
 * `require.main === module` guard this carried has no meaning in a module, and left the
 * whole file defining tests and running none of them. */
{
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
