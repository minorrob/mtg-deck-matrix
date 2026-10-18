# Loading Progress Feature (O9) - Status Report

## Completed (Commit 1460e576)

### 1. Progress Component Created
- **File**: `crankmagic-progress.js`
  - Reusable component with `create(container, {label, indeterminate})` API
  - Returns controller with `update(loaded, total)`, `complete()`, `error(msg, instructions)`
  - Monotonic progress (never decreases)
  - Uses `toLocaleString('en-US')` for formatting
  - Proper `role="progressbar"` with all aria-* attributes
  - Indeterminate mode when total unknown

- **File**: `crankmagic-progress.css`
  - Design tokens only (--v-*, --color-*, etc.)
  - 4.5:1 contrast minimum
  - Static bar under `prefers-reduced-motion: reduce`
  - Indeterminate animation (pulsing bar, disabled under reduced motion)
  - Error state styling with `--v-required` color
  - Mobile responsive (520px breakpoint)

### 2. Card Catalog Progress Tracking
- **File**: `card-catalog.js` (modified)
  - `load(url, progressCallback)` function updated
  - Streams response body with `ReadableStream` reader
  - Tracks `bytes received / Content-Length`
  - Falls back to `response.json()` when no Content-Length or no callback
  - Calls `progressCallback(received, total)` during download

## In Progress / Remaining

### 3. Wire Into Application Startup
**Status**: NOT STARTED
**Files to modify**:
- `crankmagic-app.js` (line ~673-680)
  - Show progress during `CrankCatalog.create()`
  - Replace/enhance "Opening your library…" skeleton
  - Track progress across multiple file loads (universe, cards, facts, ranks, flavorNames)
- `index.html` or similar
  - Add `<script src="crankmagic-progress.js"></script>`
  - Add `<link rel="stylesheet" href="crankmagic-progress.css">`

**Plan**:
```javascript
// In crankmagic-app.js, around line 680
const progressContainer = document.querySelector('.cm-skeleton');
const progress = CrankProgress.create(progressContainer, {label: 'cards'});

// Create wrapper that aggregates progress across multiple files
let totalBytes = 0, loadedBytes = 0;
const trackProgress = (loaded, total) => {
  // Aggregate across all loads
  progress.update(loadedBytes + loaded, totalBytes + total);
};

catalog = await CrankCatalog.create({
  repository: repo,
  client: CrankCardClient.create(),
  link: MtgCardLink,
  urls: CrankAssets,
  savedCards: state.cards,
  onProgress: trackProgress  // NEW: pass progress callback
});

progress.complete();
```

### 4. Wire Into Imports (Deck Lists)
**Status**: NOT STARTED
**Files to modify**:
- `crankmagic-exchange-ui.js` (line ~24, `resolveRows()`)
  - File reading progress: `bytes read / file.size`
  - Resolution already has `onProgress` callback (line 26)
  - Show progress during import flow

**Note**: According to takeover rules, we CANNOT edit `crankmagic-exchange-ui.js` directly as another worker holds it. 
**Action**: List needed hook in "Requests outside my scope" section.

### 5. Wire Into Backup Restoration
**Status**: NOT STARTED
**Files**: Same as #4 (`crankmagic-exchange-ui.js` line ~5)
**Note**: Same restriction applies - cannot edit directly.
**Action**: List needed hook in "Requests outside my scope" section.

### 6. Browser Test Suite
**Status**: NOT STARTED
**File to create**: `tests/loading-progress.mjs`
**Requirements**:
- Install Playwright: `npm i --no-save playwright@1.56 && npx playwright install --with-deps chromium`
- Set `GEOMETRY_REQUIRED=1`
- Use CDP slow 3G throttling
- Disable cache and block service worker
- Assert monotonic progress 0→100
- Assert hides on completion
- Assert indeterminate when no Content-Length
- Assert error state on failed fetch
- Cover cards loading (minimum)
- Screenshots at 1400 and 390 mid-load

### 7. Mutation Testing (Breaks File)
**Status**: NOT STARTED
**File to create**: `game/tools/batch/breaks-loading-progress.py`
**Requirements**:
- Real mutations that tests must catch
- Run with `python3 game/tools/batch/breaks.py game/tools/batch/breaks-loading-progress.py`
- Must show `missed: []`

### 8. Validation & Checks
**Status**: NOT STARTED
**Commands to run**:
- `node tests/design-tokens.mjs`
- `node tests/feature-wiring.mjs`
- `node tests/data-integrity.mjs`
- `node tests/loading-progress.mjs` (once created)
- Any suite for modified files
- `tools/local-ci.sh <head> 0`

### 9. Update Pins
**Status**: NOT STARTED
**Files to update**:
- Run `node tools/bump-pins.mjs`
- Run `node tests/asset-versions.mjs --update`
- Update `README.md` suite count

### 10. Screenshots
**Status**: NOT STARTED
**Requirements**:
- 1400px wide mid-load
- 390px wide mid-load
- Throttled network visible
- Object IDs visible
- No private data

## Requests Outside My Scope

### Exchange UI Progress Hooks (crankmagic-exchange-ui.js)
**Worker holding file**: Codex · Workshop (another worker)
**Cannot edit**: According to takeover rules

**Needed for backup restore** (line ~5, `actions.restore`):
```javascript
// Inside actions.restore, after file.text():
const progressContainer = document.querySelector('#progress-container');
const progress = CrankProgress.create(progressContainer, {label: 'backup'});
const payload = await E.readBackup(
  await file.text(),
  (loaded, total) => progress.update(loaded, total)
);
progress.complete();
```

**Needed for imports** (line ~24, `resolveRows()`):
```javascript
// During file read:
const progress = CrankProgress.create(container, {label: 'deck list'});
// File stream with progress...
progress.complete();
```

## Technical Decisions Made

1. **Streaming vs. Simple**: Used `ReadableStream` with Content-Length for real progress
2. **Indeterminate mode**: Show pulsing bar when Content-Length unavailable
3. **Monotonic only**: Progress never decreases (prevents jitter)
4. **Error recovery**: Clear error state with instructions, not just "failed"
5. **Accessibility**: Full ARIA support (progressbar, valuenow, valuemin, valuemax, labelledby)
6. **Motion**: Static bar under `prefers-reduced-motion: reduce`
7. **Tokens only**: No hardcoded colors, uses design system

## Files Modified/Created
- ✅ `crankmagic-progress.js` (new)
- ✅ `crankmagic-progress.css` (new)
- ✅ `card-catalog.js` (modified - streaming progress)
- ✅ `LOADING-PROGRESS-MAP.md` (new - documentation)
- ⏸️ `crankmagic-app.js` (pending - wire into startup)
- ⏸️ `index.html` (pending - add script/link tags)
- ⏸️ `tests/loading-progress.mjs` (pending - create)
- ⏸️ `game/tools/batch/breaks-loading-progress.py` (pending - create)
- ⏸️ `README.md` (pending - update count)

## Next Steps (Priority Order)
1. Wire progress into app startup (`crankmagic-app.js`)
2. Add component to HTML (`index.html`)
3. Create browser test suite
4. Create breaks file
5. Run validation checks
6. Update pins
7. Take screenshots
8. Document exchange-ui hooks needed
9. Open draft PR
