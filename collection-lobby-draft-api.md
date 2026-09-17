# Collection Lobby Draft API

**Status:** DRAFT PR / START-TEST HOLD  
**Owner:** Collection  
**Consumer:** Hosted Play (lobby Apply operations)

## Overview

When lobby Apply runs (paste / library / Build from Commander build-100), Hosted Play calls `ensureLobbyDraftDeck()` to create a **draft deck under Decks** with full catalog metadata (typeLine, colorIdentity, etc.).

This helper ensures:
- Exact-name resolution for all commanders and cards via catalog
- Draft deck creation with proper Collection format
- Full metadata for type-bar rendering (typeLine)
- Ready state stays Hosted Play's `seatMappedOk` (we provide exact cardIds + typeLines for seats)
- No Owned/Ordered lots are created (only draft deck)

## API

### `ensureLobbyDraftDeck(options)`

Creates or updates a draft deck in Collection from lobby Apply data.

#### Parameters

```javascript
{
  // Required
  name: string,                  // Deck name
  commanders: string[],          // Commander card names (exact match required)
  cards: Array<{                 // Main deck cards
    name: string,                // Card name (exact match required)
    quantity: number             // Positive integer
  }>,
  catalogExact: Function,        // Catalog resolver: name => card object or null
  commit: Function,              // Collection commit function
  state: Object,                 // Current Collection state

  // Optional
  existingDeckId: string|null    // If provided and deck is draft, updates it;
                                 // if final/archived/missing, creates new
}
```

#### Returns

```javascript
Promise<{
  ok: boolean,                   // Operation succeeded
  deckId: string|null,           // Created/updated deck ID (null if failed)
  unresolved: string[],          // Card names that failed exact match
  commanders: Array<{            // Resolved commander metadata
    name: string,
    cardId: string,
    typeLine: string,
    colorIdentity: string[]
  }>,
  cards: Array<{                 // Resolved card metadata
    name: string,
    quantity: number,
    cardId: string,
    typeLine: string,
    colorIdentity: string[]
  }>,
  error?: string                 // Error message if commit failed
}>
```

## Usage Example

```javascript
const CrankCollectionLobbyDraft = require('./collection-lobby-draft.js');

// In Hosted Play lobby Apply handler:
const result = await CrankCollectionLobbyDraft.ensureLobbyDraftDeck({
  name: 'Krenko Goes Wide',
  commanders: ['Krenko, Mob Boss'],
  cards: [
    { name: 'Sol Ring', quantity: 1 },
    { name: 'Lightning Bolt', quantity: 1 },
    { name: 'Mountain', quantity: 50 },
    // ... 97 more cards
  ],
  catalogExact: C.catalog.exact,  // Your catalog resolver
  commit: C.commit,               // Your Collection commit function
  state: C.state,                 // Current Collection state
  existingDeckId: null            // Or previous lobby deck ID for re-Apply
});

if (!result.ok) {
  // Handle unresolved cards
  console.error('Unresolved cards:', result.unresolved);
  // Show error UI to user
  return;
}

// Success - use result.deckId, result.commanders, result.cards
// to write seat rows with exact cardIds and typeLines
writeSeatRows(result.commanders, result.cards);
```

## Type Bar Contract

For Hosted Play type bar rendering, the result provides `typeLine` for each card:

- **Buckets:** Land, Creature, Instant, Sorcery, Artifact, Enchantment, Planeswalker
- **Other:** Cards with missing typeLine AND unresolved cardId
- **All-Other:** All cards in Other bucket

Seat rows can read `typeLine` directly from the result arrays:

```javascript
// From result
const commander = result.commanders[0];
console.log(commander.typeLine); // "Legendary Creature — Goblin Warrior"

const card = result.cards.find(c => c.name === 'Sol Ring');
console.log(card.typeLine); // "Artifact"
```

## Re-Apply Behavior

When `existingDeckId` is provided:

1. **If deck is draft** → `editDeck` with new commanders/slots
2. **If deck is final/archived/missing** → `createDeck` new draft

This allows users to edit a lobby deck and re-Apply without creating duplicates.

## Error Handling

### Unresolved Names

If any commander or card name fails exact catalog match:
- `ok: false`
- `unresolved: ['Card Name', ...]` lists failed names
- `deckId: null`
- No deck is created/modified

### Commit Failure

If Collection commit throws:
- `ok: false`
- `error: "Error message"`
- Resolved metadata still returned for debugging

## Integration Points

### Where to Wire

Export `CrankCollectionLobbyDraft` alongside other Collection APIs:

```javascript
// In your app initialization (e.g., crankmagic-app.js)
const CrankCollectionLobbyDraft = require('./collection-lobby-draft.js');

// Make available to Hosted Play
C.collectionLobbyDraft = CrankCollectionLobbyDraft;
```

### Hosted Play Call Site

In lobby Apply handler (NOT in crankmagic-game.js or crankmagic-online.js):

```javascript
// Hosted Play lobby Apply
async function applyLobbyDeck(lobbyData) {
  const result = await C.collectionLobbyDraft.ensureLobbyDraftDeck({
    name: lobbyData.deckName,
    commanders: lobbyData.commanders,
    cards: lobbyData.cards,
    catalogExact: C.catalog.exact,
    commit: C.commit,
    state: C.state,
    existingDeckId: lobbyData.lastDeckId
  });

  if (!result.ok) {
    showUnresolvedCardsError(result.unresolved);
    return;
  }

  // Write seat rows with result.commanders and result.cards
  // (cardId, typeLine, colorIdentity all populated)
  updateSeats(result);
  
  // Store deckId for future re-Apply
  lobbyData.lastDeckId = result.deckId;
}
```

## Files

- **IN:** `collection-lobby-draft.js` (new helper), `collection-lobby-draft.test.js` (unit tests)
- **OUT:** crankmagic-game.js, crankmagic-online.js, seat chrome, Forge engine, Discover/Lab/sim, Wanted/Design C rewrites

## Testing

Run unit tests:

```bash
node collection-lobby-draft.test.js
```

Tests cover:
- ✓ Resolve success (all names match)
- ✓ Unresolved list (some names don't match)
- ✓ createDeck draft (new deck created)
- ✓ Re-apply editDeck (update existing draft)
- ✓ No Owned/Ordered lots created
- ✓ Partner commanders (multiple commanders)
- ✓ Parameter validation
- ✓ Type-bar metadata

## Notes

- This is a **DRAFT PR** with **START-TEST HOLD** — code + unit tests only
- Do not merge; do not touch Online files
- Design C / ownership invariants: only draft decks, never Owned lots
- Ready state is Hosted Play's responsibility (seatMappedOk)
- Collection provides exact catalog metadata for seat rows
