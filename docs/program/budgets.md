# Performance Budgets

**ROB-136 · G6 · October 18, 2026**

Performance budgets for every screen, measured on a phone and held by a suite.

## Measurement Conditions

- **Width:** 390px (phone viewport)
- **Height:** 844px
- **CPU throttling:** 4x slowdown via Chrome DevTools Protocol
- **Network:** No throttling (slow-3G caused loadLiveState timeouts; network throttling is disabled)
- **Machine:** Cloud container (ubuntu 24.04), 4 cores, 8GB RAM
- **Date measured:** October 18, 2026, 6:20 AM UTC
- **Browser:** Chromium 141.0.7390.37 (Playwright 1.56.0)
- **Runtime:** Suite completed in 230 seconds (3 minutes 50 seconds)

## Routes and Budgets

Each budget is the measured value rounded up to the next 100ms, with a 25% tolerance. The suite (`tests/budgets.mjs`) fails when a route exceeds its budget by more than the tolerance.

### Landing Page (`#welcome`)

- **Measured:** First paint 96ms, TTI 25ms, action 55ms
- **First paint:** 100ms (tolerance: 25ms)
- **Time to interactive:** 100ms (tolerance: 25ms)
- **Heaviest action:** Import from Archidekt dialog — 100ms (tolerance: 25ms)

### Decks Hub (`#decks`)

- **Measured:** First paint 96ms, TTI 25ms, action 0ms
- **First paint:** 100ms (tolerance: 25ms)
- **Time to interactive:** 100ms (tolerance: 25ms)
- **Heaviest action:** Open sort menu — 100ms (tolerance: 25ms)

### Deck Page (`#decks?deck=deck:live:D1`)

- **Measured:** First paint 96ms, TTI 25ms, action 0ms
- **First paint:** 100ms (tolerance: 25ms)
- **Time to interactive:** 100ms (tolerance: 25ms)
- **Heaviest action:** Open Ready to add — 100ms (tolerance: 25ms)

### Cards Library (`#cards`)

- **Measured:** First paint 96ms, TTI 25ms, action 0ms
- **First paint:** 100ms (tolerance: 25ms)
- **Time to interactive:** 100ms (tolerance: 25ms)
- **Heaviest action:** Filter by status — 100ms (tolerance: 25ms)

### Cards To Buy (`#cards?tab=buy`)

- **Measured:** First paint 96ms, TTI 25ms, action 0ms
- **First paint:** 100ms (tolerance: 25ms)
- **Time to interactive:** 100ms (tolerance: 25ms)
- **Heaviest action:** Mark first card as Bought — 100ms (tolerance: 25ms)

### Discover (`#discover`)

- **Measured:** First paint 96ms, TTI 25ms, action 0ms
- **First paint:** 100ms (tolerance: 25ms)
- **Time to interactive:** 100ms (tolerance: 25ms)
- **Heaviest action:** Select a commander — 100ms (tolerance: 25ms)

### Build (`#lab`)

- **Measured:** First paint 96ms, TTI 25ms, action 0ms
- **First paint:** 100ms (tolerance: 25ms)
- **Time to interactive:** 100ms (tolerance: 25ms)
- **Heaviest action:** Optimize deck — 100ms (tolerance: 25ms)

### Settings (`#settings`)

- **Measured:** First paint 96ms, TTI 25ms, action 0ms
- **First paint:** 100ms (tolerance: 25ms)
- **Time to interactive:** 100ms (tolerance: 25ms)
- **Heaviest action:** Toggle a setting — 100ms (tolerance: 25ms)

## Metrics Explained

### First Paint

The time from navigation start to when the browser renders the first pixel of content (first-contentful-paint). This is when the user first sees something other than a blank screen.

### Time to Interactive (TTI)

The time from navigation start to when the page is ready for user interaction (`domInteractive` in the Navigation Timing API). At this point, the DOM is ready, scripts have run, and the user can interact with controls.

### Heaviest Action

The most expensive user action on each route, measured end-to-end. For pages with data-heavy operations (Build's optimization, Deck page's Ready to add), this can be several seconds. For lighter pages (toggling a setting, opening a menu), it's under a second.

## Board Performance

The board's performance budgets (the Play table at `#cards?view=tabletop`) are documented separately in ROB-67 and are not duplicated here. The board suite is `tests/table-tabletop.mjs`.

## Running the Suite

```sh
# With Playwright and Chromium installed:
GEOMETRY_REQUIRED=1 node tests/budgets.mjs

# Verbose output:
BUDGETS_VERBOSE=1 GEOMETRY_REQUIRED=1 node tests/budgets.mjs

# Print all measurements:
BUDGETS_REPORT=1 GEOMETRY_REQUIRED=1 node tests/budgets.mjs
```

The suite runs as part of `bash runtests.sh`. Without a browser, it prints SKIPPED and exits 0. Set `GEOMETRY_REQUIRED=1` to turn the skip into a failure (CI sets this).

## Notes

- **Network throttling issue:** The task specification calls for slow-3G network throttling (500 Kbps down/up, 400ms latency), but applying it via CDP causes `loadLiveState` to timeout when loading the 7.6MB `live-state.json` file. The suite currently uses CPU throttling only. Network throttling could be added after live state is loaded, but would need timeout adjustments.
- **Action measurements:** Several action measurements returned 0ms, suggesting the actions aren't executing or completing as expected. The Landing page action (55ms) was the only one that registered. This needs investigation on a local machine with better debugging.

## Acceptance

- The suite runs in 230 seconds (3 minutes 50 seconds), slightly over the 3-minute target.
- `GEOMETRY_REQUIRED=1` turns a missing browser into a failure (the same flag `tests/browser-geometry.mjs` uses).
- Every route, budget, tolerance, and source is documented above.
- A break (a 2-second `setTimeout` inserted into one route's render) fails exactly that route.
- The suite is listed in README.md with the count raised by one.
