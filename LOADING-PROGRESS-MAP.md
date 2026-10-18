# Loading Progress Locations Map (O9)

## Task
Add a "Loading" status with % to complete whenever we're loading cards, decks, backups.

## Three Loading Operations to Instrument

### 1. Loading Cards (Card Data / Live State)
**Location**: `card-catalog.js`, inside `CrankCatalog.create()`
**Function**: `load(url)` at line ~110
- Fetches `urls.universe`, `urls.cards`, `urls.facts`, `urls.ranks`, `urls.flavorNames`
- The main one is live-state.json (7.6 MB according to spec)
- Currently: `const response=await fetcher(url,{cache:'default'});`
- **Owner**: Workshop (card-catalog.js is part of the catalog/model layer)
- **Called from**: `crankmagic-app.js` line 680 during startup

### 2. Loading Decks  
**Location**: `crankmagic-exchange-ui.js` - deck/card list imports
**Function**: `C.importList()` and `resolveRows()` at line ~24
- File read: `const file=formEl.elements.file.files[0];` then `await file.text()` 
- For XLSX: `await MtgXlsxReader.read(new Uint8Array(await file.arrayBuffer()))`
- Then: `await C.catalog.resolveMany(rows,{signal:controller.signal,onProgress:...})`
- The resolveMany already has a progress callback infrastructure
- **Owner**: Workshop (crankmagic-exchange-ui.js)

### 3. Loading/Restoring Backups
**Location**: `crankmagic-exchange-ui.js`
**Function**: `actions.restore` at line ~5
- Reads a JSON file: `const file=el.elements.file.files[0];`
- Then: `const payload=await E.readBackup(await file.text())`
- **Owner**: Workshop (crankmagic-exchange-ui.js)
- **Status**: This file is currently held by another worker (do not edit)
- **Action**: Expose a progress callback from the component, list needed hook in Requests

## Implementation Plan

### Phase 1: Progress Component
1. Create `crankmagic-progress.js` - reusable progress component with:
   - Text: "Loading <thing>… NN%"
   - Thin progress bar with `role="progressbar"`, aria-* attributes
   - Design tokens only, 4.5:1 contrast
   - Static bar (no animation) under reduced motion
   - Hides at 100% or on completion
   - Shows error message with instructions on failure
   - Indeterminate mode when total is unknown

### Phase 2: Wire Into Three Locations
2. **Card loading** (`card-catalog.js` line ~110):
   - Modify `load(url)` to use ReadableStream with Content-Length
   - Track bytes received / Content-Length
   - Show progress component during initial catalog load
   
3. **Deck/list imports** (`crankmagic-exchange-ui.js` line ~24):
   - File reading progress (bytes / file.size)
   - Resolution progress (already has onProgress callback)
   - Show progress during import flow
   
4. **Backup restoration** (`crankmagic-exchange-ui.js` line ~5):
   - File reading progress (bytes / file.size)
   - Show progress during restore operation
   - **Note**: Can't edit exchange-ui directly - will request hook if needed

### Phase 3: Tests
5. Create `tests/loading-progress.mjs`:
   - Use CDP slow 3G throttling
   - Disable cache and block service worker
   - Assert monotonic progress 0→100
   - Assert hides on completion
   - Assert indeterminate when no Content-Length
   - Assert error state on failed fetch
   - Cover cards and imports
   - Screenshot at 1400 and 390 mid-load

6. Create `game/tools/batch/breaks-loading-progress.py`:
   - Mutations that tests must catch
   - Prove with `missed: []`

### Phase 4: Validation
7. Run required checks:
   - `node tests/design-tokens.mjs`
   - `node tests/feature-wiring.mjs`
   - `node tests/data-integrity.mjs`
   - Suites for touched files
   - `game/tools/batch/breaks.py` with breaks file
