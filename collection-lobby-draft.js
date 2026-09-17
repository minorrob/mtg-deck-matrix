/* Collection-owned helper for Play lobby Apply → real Decks draft (Design C / ownership invariants)
 *
 * When lobby Apply runs (paste / library / Build from Commander build-100), Hosted Play calls
 * ensureLobbyDraftDeck() so a **draft appears under Decks** with full catalog metadata (typeLine etc.).
 * Type bars read seat rows' `typeLine` or `C.card(cardId).typeLine`. Ready stays Hosted Play's
 * `seatMappedOk` — we leave seats/catalog with exact cardIds + typeLines.
 *
 * This module is IN: new helper module + wire/export where Collection already exposes APIs; tests.
 * This module is OUT: crankmagic-game.js, crankmagic-online.js, seat chrome, Forge engine.
 */
(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.CrankCollectionLobbyDraft = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  /**
   * Ensure a lobby draft deck exists in Collection with full catalog metadata.
   * 
   * @param {Object} options - Configuration options
   * @param {string} options.name - Deck name
   * @param {string[]} options.commanders - Array of commander card names (exact match required)
   * @param {Array<{name: string, quantity: number}>} options.cards - Array of {name, quantity} for main deck
   * @param {Function} options.catalogExact - Catalog resolver function (name => card object or null)
   * @param {Function} options.commit - Commit function for Collection commands
   * @param {Object} options.state - Current Collection state
   * @param {string} [options.existingDeckId] - Optional: deck ID to update if it's still a draft
   * 
   * @returns {Promise<Object>} Result object:
   *   - {boolean} ok - Whether operation succeeded
   *   - {string|null} deckId - Created/updated deck ID (null if failed)
   *   - {string[]} unresolved - Array of card names that failed exact match
   *   - {Array<{name, cardId, typeLine, colorIdentity}>} commanders - Resolved commander data
   *   - {Array<{name, quantity, cardId, typeLine, colorIdentity}>} cards - Resolved card data
   */
  async function ensureLobbyDraftDeck(options) {
    const {
      name,
      commanders = [],
      cards = [],
      catalogExact,
      commit,
      state,
      existingDeckId = null
    } = options;

    // Validate required parameters
    if (!name || typeof name !== 'string') {
      throw new Error('Deck name is required');
    }
    if (!catalogExact || typeof catalogExact !== 'function') {
      throw new Error('catalogExact resolver function is required');
    }
    if (!commit || typeof commit !== 'function') {
      throw new Error('commit function is required');
    }
    if (!state || !state.decks || !state.cards) {
      throw new Error('Collection state is required');
    }

    const unresolved = [];
    const resolvedCommanders = [];
    const resolvedCards = [];
    const catalogCards = [];

    // Resolve commanders
    for (const commanderName of commanders) {
      if (!commanderName || typeof commanderName !== 'string') {
        unresolved.push(commanderName || '(empty commander name)');
        continue;
      }

      const card = catalogExact(commanderName);
      if (!card || !card.id) {
        unresolved.push(commanderName);
        continue;
      }

      resolvedCommanders.push({
        name: card.name,
        cardId: card.id,
        typeLine: card.typeLine || '',
        colorIdentity: card.colorIdentity || []
      });

      // Add to catalog cards if not already in state
      if (!state.cards[card.id]) {
        catalogCards.push(card);
      }
    }

    // Resolve main deck cards
    for (const cardEntry of cards) {
      const { name: cardName, quantity } = cardEntry;

      if (!cardName || typeof cardName !== 'string') {
        unresolved.push(cardName || '(empty card name)');
        continue;
      }

      if (!Number.isInteger(quantity) || quantity < 1) {
        throw new Error(`Invalid quantity for ${cardName}: ${quantity}`);
      }

      const card = catalogExact(cardName);
      if (!card || !card.id) {
        unresolved.push(cardName);
        continue;
      }

      resolvedCards.push({
        name: card.name,
        quantity,
        cardId: card.id,
        typeLine: card.typeLine || '',
        colorIdentity: card.colorIdentity || []
      });

      // Add to catalog cards if not already in state
      if (!state.cards[card.id]) {
        catalogCards.push(card);
      }
    }

    // If any name failed exact match, return failure immediately
    if (unresolved.length > 0) {
      return {
        ok: false,
        unresolved,
        deckId: null,
        commanders: [],
        cards: []
      };
    }

    // Check if we should update an existing deck
    let deckId = existingDeckId;
    let isUpdate = false;

    if (existingDeckId) {
      const existingDeck = state.decks.find(d => d.id === existingDeckId);
      if (existingDeck && existingDeck.status === 'draft' && !existingDeck.archived) {
        isUpdate = true;
      } else {
        // Deck is missing, final, or archived - create new
        deckId = null;
      }
    }

    // Prepare slots (commanders + main deck cards)
    const slots = [
      ...resolvedCommanders.map(cmd => ({
        cardId: cmd.cardId,
        quantity: 1,
        purpose: 'main'
      })),
      ...resolvedCards.map(card => ({
        cardId: card.cardId,
        quantity: card.quantity,
        purpose: 'main'
      }))
    ];

    // Execute the command
    try {
      if (isUpdate) {
        // Update existing draft deck
        await commit({
          type: 'editDeck',
          deckId,
          name,
          commanders: resolvedCommanders.map(c => c.cardId),
          cards: catalogCards,
          slots
        }, { renderView: false });
      } else {
        // Create new draft deck
        deckId = `deck:lobby:${Date.now()}:${Math.random().toString(36).substr(2, 9)}`;
        await commit({
          type: 'createDeck',
          deckId,
          name,
          commanders: resolvedCommanders.map(c => c.cardId),
          cards: catalogCards,
          slots
          // omit groupId → auto group creation
        }, { renderView: false });
      }

      return {
        ok: true,
        deckId,
        unresolved: [],
        commanders: resolvedCommanders,
        cards: resolvedCards
      };
    } catch (error) {
      // If commit fails, return failure
      return {
        ok: false,
        unresolved: [],
        deckId: null,
        commanders: resolvedCommanders,
        cards: resolvedCards,
        error: error.message
      };
    }
  }

  return {
    ensureLobbyDraftDeck
  };
});
