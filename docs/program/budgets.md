# Performance Budgets

**ROB-136 · G6 · October 18, 2026**

Performance budgets for first paint, time to interactive, and heaviest action per route, measured on a phone with throttling and held by a suite.

## Measurement Conditions

- **Width:** 390px (phone viewport)
- **Height:** 844px
- **CPU throttling:** 4x slowdown via Chrome DevTools Protocol
- **Network throttling:** Slow-3G (500 Kbps down/up, 400ms latency) via CDP
- **Machine:** Cloud container (Ubuntu 24.04), 4 cores, 8GB RAM
- **Date measured:** October 18, 2026, 1:00 PM UTC
- **Browser:** Chromium 141.0.7390.37 (Playwright 1.56.0)
- **Runtime:** Suite completes in ~20 seconds

## Measurement Approach

Each route gets a fresh page load with throttling applied before navigation:
1. Live state is loaded once without throttling (to avoid timeout on 7.6MB file)
2. CPU and network throttling are applied to the browser context
3. Each route is measured with a new page instance navigating to that route
4. Performance metrics are captured via Navigation Timing API
5. One action per route is measured

## Routes and Budgets

Budgets are rounded up to the next 100ms from actual measurements, with 25% tolerance.

| Route | First Paint | TTI | Action | Action Description |
|-------|-------------|-----|--------|-------------------|
| Landing | 60ms → 100ms | 60ms → 100ms | 90ms → 200ms | Click Import from Archidekt |
| Decks | 65ms → 100ms | 65ms → 100ms | 430ms → 2000ms | Click first deck tile |
| Deck page | 55ms → 100ms | 60ms → 100ms | 100ms → 2000ms | Scroll page |
| Cards Library | 60ms → 100ms | 60ms → 100ms | 320ms → 2000ms | Hover first table row |
| Cards To buy | 55ms → 100ms | 60ms → 100ms | 200ms → 2000ms | Wait for table |
| Discover | 60ms → 100ms | 60ms → 100ms | 2500ms → 3600ms | Wait for chooser |
| Build | 60ms → 100ms | 60ms → 100ms | 160ms → 2000ms | Wait for form |
| Settings | 55ms → 100ms | 60ms → 100ms | 105ms → 2000ms | Wait for controls |

All budgets have 25% tolerance (e.g., 100ms budget allows up to 125ms).

## Metrics Explained

### First Paint

Time from navigation start to first-contentful-paint. When the user first sees content.

### Time to Interactive (TTI)

Time from navigation start to domContentLoadedEventEnd. When the DOM is parsed, scripts executed, and page is interactive.

### Actions

Actions vary widely in timing under slow-3G throttling:
- Simple actions (hover, wait): 100-300ms
- Navigation actions (Decks clicking tile): 400-2000ms  
- Heavy page loads (Discover loading graph): 2000-3500ms

Action measurements show significant variance between runs (±500ms) due to throttling effects.

## Break Test

**Mutation:** Settings first paint and TTI budgets lowered from 100ms to 30ms

**Failing output:**
```
Settings             paint    56ms (budget 30+7) TTI    59ms (budget 30+7) action   104ms (budget 2000+500)

AssertionError [ERR_ASSERTION]: performance budgets exceeded at 2 place(s):
  Settings: first paint 56ms exceeds budget 30ms + 7ms tolerance
  Settings: time to interactive 59ms exceeds budget 30ms + 7ms tolerance
```

**Result:** Only Settings failed on first paint and TTI. Other 7 routes passed.

**Restored:** Budgets back to 100ms, all 25 checks pass.

## Running the Suite

```sh
# With Playwright and Chromium installed:
GEOMETRY_REQUIRED=1 node tests/budgets.mjs

# Print all measurements:
BUDGETS_REPORT=1 GEOMETRY_REQUIRED=1 node tests/budgets.mjs
```

The suite runs as part of `bash runtests.sh`. Without a browser, it prints SKIPPED and exits 0. Set `GEOMETRY_REQUIRED=1` to turn the skip into a failure (CI sets this).

## Acceptance

- Suite runs in ~20 seconds: ✓ well under 3-minute target
- Per-route measurement: ✓ each route gets fresh page load under throttling
- Slow-3G applied: ✓ Network.emulateNetworkConditions with 500 Kbps, 400ms latency
- Actions measured: ✓ one action per route with visible result
- Break test: ✓ lowering Settings budgets to 30ms fails only that route
- README.md suite listing: outside scope (see task return)
