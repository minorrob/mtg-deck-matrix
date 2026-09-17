/* Collection-owned helper for Play lobby Apply → real Decks draft (Design C / ownership invariants)
 *
 * When lobby Apply runs (paste / library / Build from Commander build-100), Hosted Play calls
 * ensureLobbyDraft() from buildSeatFromValues so a **draft appears under Decks** with full 
 * catalog metadata (typeLine etc.).
 *
 * Type bars read seat rows' `typeLine` or `C.card(cardId).typeLine`. Ready stays Hosted Play's
 * `seatMappedOk` — we leave seats/catalog with exact cardIds + typeLines.
 *
 * Export: C.ensureLobbyDraft(...) and CrankCollection.ensureLobbyDraft(...)
 *
 * This module is IN: new helper module + wire/export where Collection already exposes APIs; tests.
 * This module is OUT: crankmagic-game.js, crankmagic-online.js, seat chrome, Forge engine.
 */
(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) {
    root.CrankCollectionLobbyDraft = api;
    // Also export on CrankCollection if it exists
    if (root.CrankCollection) {
      root.CrankCollection.ensureLobbyDraft = api.ensureLobbyDraft;
      root.CrankCollection.attachDeckReport = api.attachDeckReport;
    }
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  /**
   * Ensure a lobby draft deck exists in Collection with full catalog metadata.
   * 
   * Called by Hosted Play buildSeatFromValues after lobby Apply (paste/library/build-100).
   * 
   * @param {Object} options - Configuration options
   * @param {string} options.seatLabel - Deck name (seat label)
   * @param {Array<{name: string}>} options.commanders - Commander names (exact match required)
   * @param {Array<{name: string, quantity: number}>} options.cards - Main deck cards
   * @param {string} [options.existingDeckId] - Optional: pass seat.deckId for re-Apply
   * @param {Function} options.catalogExact - Catalog resolver function (name => card object or null)
   * @param {Function} options.commit - Commit function for Collection commands
   * @param {Object} options.state - Current Collection state
   * 
   * @returns {Promise<Object>} Result object:
   *   - {boolean} ok - Whether operation succeeded
   *   - {string|null} deckId - Created/updated deck ID (null if failed)
   *   - {Array<{name, line?}>} unresolved - Card names that failed exact match
   *   - {Array<{name, cardId, typeLine, colorIdentity}>} commanders - Resolved commanders
   *   - {Array<{name, quantity, cardId, typeLine, colorIdentity}>} cards - Resolved cards
   *   - {string} [summary] - Optional success message
   */
  async function ensureLobbyDraft(options) {
    const {
      seatLabel,
      commanders = [],
      cards = [],
      existingDeckId = null,
      catalogExact,
      commit,
      state
    } = options;

    // Validate required parameters
    if (!seatLabel || typeof seatLabel !== 'string') {
      throw new Error('seatLabel is required');
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
    for (const commanderEntry of commanders) {
      const commanderName = commanderEntry?.name;
      
      if (!commanderName || typeof commanderName !== 'string') {
        unresolved.push({ name: commanderName || '(empty commander name)' });
        continue;
      }

      const card = catalogExact(commanderName);
      if (!card || !card.id) {
        unresolved.push({ name: commanderName });
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
        unresolved.push({ name: cardName || '(empty card name)' });
        continue;
      }

      if (!Number.isInteger(quantity) || quantity < 1) {
        throw new Error(`Invalid quantity for ${cardName}: ${quantity}`);
      }

      const card = catalogExact(cardName);
      if (!card || !card.id) {
        unresolved.push({ name: cardName });
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
      let summary;
      if (isUpdate) {
        // Update existing draft deck
        await commit({
          type: 'editDeck',
          deckId,
          name: seatLabel,
          commanders: resolvedCommanders.map(c => c.cardId),
          cards: catalogCards,
          slots
        }, { renderView: false });
        summary = `Updated draft deck: ${seatLabel}`;
      } else {
        // Create new draft deck
        deckId = `deck:lobby:${Date.now()}:${Math.random().toString(36).substr(2, 9)}`;
        await commit({
          type: 'createDeck',
          deckId,
          name: seatLabel,
          commanders: resolvedCommanders.map(c => c.cardId),
          cards: catalogCards,
          slots
          // omit groupId → auto group creation
        }, { renderView: false });
        summary = `Created draft deck: ${seatLabel}`;
      }

      return {
        ok: true,
        deckId,
        unresolved: [],
        commanders: resolvedCommanders,
        cards: resolvedCards,
        summary
      };
    } catch (error) {
      // If commit fails, return failure
      return {
        ok: false,
        unresolved: [],
        deckId: null,
        commanders: resolvedCommanders,
        cards: resolvedCards,
        summary: `Failed: ${error.message}`
      };
    }
  }

  /**
   * Attach a simulation report to a draft deck.
   * 
   * Called by Hosted Play or Measure after simulation completes.
   * 
   * @param {Object} options - Configuration options
   * @param {string} options.deckId - Target deck ID
   * @param {Object} options.report - Report object with protocol + deckFingerprint
   * @param {Function} options.commit - Commit function for Collection commands
   * @param {Object} options.state - Current Collection state
   * 
   * @returns {Promise<Object>} Result object:
   *   - {boolean} ok - Whether operation succeeded
   *   - {string} [error] - Error message if failed
   *   - {string} [summary] - Success message
   */
  async function attachDeckReport(options) {
    const {
      deckId,
      report,
      commit,
      state
    } = options;

    // Validate required parameters
    if (!deckId || typeof deckId !== 'string') {
      throw new Error('deckId is required');
    }
    if (!report || typeof report !== 'object') {
      throw new Error('report object is required');
    }
    if (!report.protocol || typeof report.protocol !== 'string') {
      throw new Error('report.protocol is required');
    }
    if (!report.deckFingerprint || typeof report.deckFingerprint !== 'string') {
      throw new Error('report.deckFingerprint is required');
    }
    if (!commit || typeof commit !== 'function') {
      throw new Error('commit function is required');
    }
    if (!state || !state.decks) {
      throw new Error('Collection state is required');
    }

    // Find the deck
    const deck = state.decks.find(d => d.id === deckId);
    if (!deck) {
      return {
        ok: false,
        error: 'Deck not found'
      };
    }

    // Compute current deck fingerprint (same logic as Collection model)
    const currentFingerprint = JSON.stringify({
      commanders: [...deck.commanders].sort(),
      slots: deck.slots.filter(r => r.purpose === 'main')
        .map(r => [r.cardId, r.quantity])
        .sort((a, b) => a[0].localeCompare(b[0]))
    });

    // Check fingerprint match
    if (report.deckFingerprint !== currentFingerprint) {
      return {
        ok: false,
        error: 'Report fingerprint does not match current deck list. The deck may have been modified since the simulation.'
      };
    }

    // Attach the report
    try {
      await commit({
        type: 'report',
        deckId,
        report
      }, { renderView: false });

      return {
        ok: true,
        summary: `Attached simulation report to ${deck.name}`
      };
    } catch (error) {
      return {
        ok: false,
        error: error.message
      };
    }
  }

  return {
    ensureLobbyDraft,
    attachDeckReport
  };
});
