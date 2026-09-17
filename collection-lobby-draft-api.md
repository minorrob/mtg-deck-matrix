# Collection Lobby Draft & Report API

**Status:** DRAFT PR / START-TEST HOLD  
**Owner:** Collection  
**Consumer:** Hosted Play (ensureLobbyDraft) + Hosted Play/Measure (attachDeckReport)  
**Contract:** LOCKED ✓

## Overview

Two exports for Hosted Play integration:

1. **`C.ensureLobbyDraft()`** — When lobby Apply runs (paste / library / Build from Commander build-100), Hosted Play calls this from `buildSeatFromValues` to create a **draft deck under Decks** with full catalog metadata (typeLine, colorIdentity, etc.).

2. **`C.attachDeckReport()`** — After simulation completes (Hosted Play or Measure), attach the report to the draft deck with fingerprint validation.

Both ensure:
- No Owned/Ordered lots are created
- Full catalog metadata for rendering
- Fingerprint validation (attachDeckReport)

## Export

Available as:
- **`C.ensureLobbyDraft(...)`** (preferred) — wired in app initialization
- **`CrankCollection.ensureLobbyDraft(...)`** — also available on Collection model

Hosted Play calls from `buildSeatFromValues` after the list is known.

## API Signature (LOCKED)

```javascript
C.ensureLobbyDraft({
  seatLabel: string,                 // Deck name (seat label)
  commanders: Array<{ name: string }>,  // Commander names (exact match required)
  cards: Array<{                     // Main deck cards
    name: string,                    // Card name (exact match required)
    quantity: number                 // Positive integer
  }>,
  existingDeckId?: string            // Optional: pass seat.deckId for re-Apply
})
```

### Internal Parameters (provided by app wiring)

The following are injected by the app and not passed by Hosted Play:

```javascript
{
  catalogExact: Function,            // Catalog resolver: name => card object or null
  commit: Function,                  // Collection commit function
  state: Object                      // Current Collection state
}
```

## Return Value (LOCKED)

```javascript
Promise<{
  ok: boolean,                       // Operation succeeded
  deckId: string|null,               // Created/updated deck ID (null if failed)
  unresolved: Array<{                // Card names that failed exact match
    name: string,
    line?: number                    // Optional line number (for future paste context)
  }>,
  commanders: Array<{                // Resolved commander metadata
    name: string,
    cardId: string,
    typeLine: string,
    colorIdentity: string[]
  }>,
  cards: Array<{                     // Resolved card metadata
    name: string,
    quantity: number,
    cardId: string,
    typeLine: string,
    colorIdentity: string[]
  }>,
  summary?: string                   // Optional success/error message
}>
```

## Usage Example

```javascript
// In Hosted Play buildSeatFromValues (after lobby Apply):
const result = await C.ensureLobbyDraft({
  seatLabel: 'Krenko Goes Wide',
  commanders: [
    { name: 'Krenko, Mob Boss' }
  ],
  cards: [
    { name: 'Sol Ring', quantity: 1 },
    { name: 'Lightning Bolt', quantity: 1 },
    { name: 'Mountain', quantity: 50 },
    // ... 97 more cards
  ],
  existingDeckId: seat.deckId  // For re-Apply; null for first Apply
});

if (!result.ok) {
  // Handle unresolved cards
  showUnresolvedCardsError(result.unresolved);
  return;
}

// Success - use result.deckId, result.commanders, result.cards
// to write seat rows with exact cardIds and typeLines
seat.deckId = result.deckId;
writeSeatRows(result.commanders, result.cards);
```

## Behavior

### Exact-Name Resolution

1. All commander names must resolve via `catalogExact(name)`
2. All card names must resolve via `catalogExact(name)`
3. If **any** name fails: returns `{ ok: false, unresolved: [...] }` immediately
4. No deck is created/modified if any name is unresolved

### Draft Deck Creation

On success:
- Calls `commit({ type: 'createDeck', ... })` with full catalog metadata
- Omits `groupId` → auto Collection group created
- Deck status is `'draft'`
- Never creates Owned/Ordered lots

### Re-Apply Behavior

When `existingDeckId` is provided:

1. **If deck is still draft** → `editDeck` with new commanders/slots
2. **If deck is final/archived/missing** → `createDeck` new draft

This prevents duplicate decks when user edits lobby and re-Applies.

### Return Mirror for Seats

Result includes resolved metadata so Hosted Play can write seat rows **without reading Decks UI**:

- `commanders[]` — resolved with cardId, typeLine, colorIdentity
- `cards[]` — resolved with cardId, typeLine, colorIdentity

Seat rows read `typeLine` directly from result arrays.

## Type Bar Contract

For Hosted Play type bar rendering:

**Buckets:** Land, Creature, Instant, Sorcery, Artifact, Enchantment, Planeswalker, Other

- Helper populates `typeLine` for every resolved card (from catalog `card.typeLine`)
- Type bars read seat rows' `typeLine` or `C.card(cardId).typeLine`
- **Other bucket:** missing typeLine AND unresolved cardId

### Example Type Bar Logic

```javascript
function typeBarBucket(row) {
  const typeLine = row.typeLine || C.card(row.cardId)?.typeLine || '';
  
  if (typeLine.includes('Land')) return 'Land';
  if (typeLine.includes('Creature')) return 'Creature';
  if (typeLine.includes('Instant')) return 'Instant';
  if (typeLine.includes('Sorcery')) return 'Sorcery';
  if (typeLine.includes('Artifact')) return 'Artifact';
  if (typeLine.includes('Enchantment')) return 'Enchantment';
  if (typeLine.includes('Planeswalker')) return 'Planeswalker';
  
  return 'Other';  // Missing typeLine or unresolved
}
```

## Error Handling

### Unresolved Names

If any commander or card name fails exact catalog match:

```javascript
{
  ok: false,
  deckId: null,
  unresolved: [
    { name: 'Unknown Card Name' },
    { name: 'Another Missing' }
  ],
  commanders: [],
  cards: [],
  summary: undefined
}
```

No deck is created/modified. Show error UI with unresolved list.

### Commit Failure

If Collection commit throws (e.g., validation error):

```javascript
{
  ok: false,
  deckId: null,
  unresolved: [],
  commanders: [...],  // Still returned for debugging
  cards: [...],
  summary: 'Failed: error message'
}
```

Resolved metadata still returned for debugging context.

## Integration

### App Wiring (crankmagic-app.js or similar)

Wire the helper during app initialization:

```javascript
// After Collection model is initialized
const CrankCollectionLobbyDraft = require('./collection-lobby-draft.js');

// Export on C for Hosted Play
C.ensureLobbyDraft = async (options) => {
  return CrankCollectionLobbyDraft.ensureLobbyDraft({
    ...options,
    catalogExact: C.catalog.exact,
    commit: C.commit,
    state: C.state
  });
};
```

### Hosted Play Call Site (buildSeatFromValues)

```javascript
// In buildSeatFromValues (NOT crankmagic-game.js / crankmagic-online.js)
async function buildSeatFromValues(seatLabel, commanderNames, cardList, existingDeckId) {
  const result = await C.ensureLobbyDraft({
    seatLabel,
    commanders: commanderNames.map(name => ({ name })),
    cards: cardList.map(({ name, quantity }) => ({ name, quantity })),
    existingDeckId: existingDeckId || null
  });

  if (!result.ok) {
    showUnresolvedCardsError(result.unresolved);
    return null;
  }

  // Write seat rows with result metadata
  const seat = {
    deckId: result.deckId,
    commanders: result.commanders,
    cards: result.cards
  };
  
  return seat;
}
```

## Testing

Run unit tests:

```bash
node collection-lobby-draft.test.js
# 11 passed, 0 failed ✓
```

### Test Coverage

- ✓ Resolve success (all names match)
- ✓ Unresolved list (some names don't match)
- ✓ createDeck draft (new deck created)
- ✓ Re-apply editDeck (update existing draft)
- ✓ Re-apply createDeck (when final/archived)
- ✓ No Owned/Ordered lots created
- ✓ Partner commanders (multiple commanders)
- ✓ Parameter validation
- ✓ Type-bar metadata (typeLine populated)
- ✓ Summary field populated

## Files

- **Module:** `collection-lobby-draft.js` (helper implementation)
- **Tests:** `collection-lobby-draft.test.js` (11 unit tests)
- **Docs:** `collection-lobby-draft-api.md` (this file)

**OUT:** crankmagic-game.js, crankmagic-online.js, seat chrome, Forge engine, Discover/Lab/sim

## Design C / Ownership Invariants

- ✅ Only draft decks created (never Owned/Ordered lots)
- ✅ Full catalog metadata (typeLine, colorIdentity) for seat rendering
- ✅ Exact-name resolution (fail-fast if any name unresolved)
- ✅ Re-Apply behavior (edit draft, create new if final)
- ✅ Ready state stays Hosted Play's `seatMappedOk` (we provide exact cardIds + typeLines)
- ✅ Contract LOCKED — signature and return value final

## API 2: attachDeckReport (LOCKED)

### Export

Available as:
- **`C.attachDeckReport(...)`** (preferred)
- **`CrankCollection.attachDeckReport(...)`**

**Called by:** Hosted Play/Measure after published 120k simulation completes

### Signature (LOCKED)

```javascript
C.attachDeckReport({
  deckId: string,           // Target deck ID (seat.deckId from ensureLobbyDraft)
  report: {                 // Full CrankSim.packFor() report object (accept as-is)
    protocol: string,       // Required: report protocol/format
    deckFingerprint: string, // Required: deck fingerprint for validation
    limits: {...},          // Preserved: simulation limits
    versions: {...},        // Preserved: engine versions
    conditions: {...},      // Preserved: simulation conditions
    metrics: {...},         // Preserved: win rate, score, etc.
    coverage: {...},        // Preserved: coverage stats
    origin?: 'measured',    // Optional: 'measured' for published sims
    kind?: 'report',        // Optional: 'report' type marker
    ...                     // All other fields preserved (honesty fields, etc.)
  }
})
```

**Accepts full `CrankSim.packFor()` payload as-is:**
- Preserves ALL fields (limits/protocol/deckFingerprint/versions/conditions/metrics/coverage/etc.)
- Does NOT reinterpret or strip honesty fields
- Validates `origin: 'measured'` and `kind: 'report'` when present

Internal parameters (commit, state) injected by app wiring.

### Return Value (LOCKED)

```javascript
Promise<{
  ok: boolean,              // Operation succeeded
  error?: string,           // Error message if failed
  summary?: string          // Success message
}>
```

### Behavior

1. **Validates report fields:**
   - Requires `report.protocol` (string)
   - Requires `report.deckFingerprint` (string)
   - Accepts full `CrankSim.packFor()` object as-is

2. **Fingerprint validation:**
   - Computes current deck fingerprint from commanders + main slots (draft deck hundred)
   - Refuses if `report.deckFingerprint` doesn't match current deck
   - Returns `{ ok: false, error: 'Report fingerprint does not match...' }`

3. **Never creates Owned lots**
   - Only attaches report to `state.reports`
   - Wraps `C.commit({ type: 'report', deckId, report })`
   - Preserves entire report object unchanged

### Usage Example

```javascript
// After published 120k simulation completes:

// 1. Compute fingerprint from draft deck hundred
const fingerprint = JSON.stringify({
  commanders: [...deck.commanders].sort(),
  slots: deck.slots.filter(r => r.purpose === 'main')
    .map(r => [r.cardId, r.quantity])
    .sort((a, b) => a[0].localeCompare(b[0]))
});

// 2. Get full CrankSim.packFor() report (with ALL fields)
const packedReport = CrankSim.packFor({
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
  coverage: { /* ... */ },
  origin: 'measured',
  kind: 'report'
  // ... all other fields preserved (honesty, run details, etc.)
});

// 3. Attach to draft deck created by ensureLobbyDraft
const result = await C.attachDeckReport({
  deckId: seat.deckId,  // From ensureLobbyDraft result
  report: packedReport   // Full object as-is
});

if (!result.ok) {
  console.error(result.error);  // e.g., fingerprint mismatch
  return;
}

// Success - report attached to deck with all fields preserved
```

**Integration Flow:**
1. Hosted Play calls `ensureLobbyDraft()` → gets `seat.deckId`
2. Published 120k simulation runs → gets `CrankSim.packFor()` report
3. Hosted Play/Measure calls `attachDeckReport({ deckId: seat.deckId, report })`
4. Report appears in Decks → deck overview → Reports section

### Reports UI

Reports attached via `attachDeckReport()` appear in **Decks → deck overview → Reports** section:
- Simple list format (no Measure wizard chrome)
- Shows: protocol, timestamp, list status (current/historical), origin
- Visible for all reports attached to the deck (`state.reports.filter(r => r.deckId === deckId)`)

## Notes

- **DRAFT PR / START-TEST HOLD** — code + unit tests only; not UAT/prod ready
- **Do not merge** — for integration review only
- Hosted Play wires call sites; Collection does not edit crankmagic-game.js
- Export names: `C.ensureLobbyDraft(...)` + `C.attachDeckReport(...)` (both preferred)
- Contracts LOCKED: signatures and return values are final ✓
