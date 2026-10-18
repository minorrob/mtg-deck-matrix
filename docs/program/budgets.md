# Performance Budgets

**ROB-136 · G6 · October 18, 2026**

Performance budgets for every screen, measured on a phone and held by a suite.

## Measurement Conditions

- **Width:** 390px (phone viewport)
- **Height:** 844px
- **CPU throttling:** 4x slowdown
- **Network:** Slow 3G (500 Kbps down/up, 400ms latency)
- **Machine:** Cloud container, 4 cores, 8GB RAM
- **Date measured:** October 18, 2026
- **Browser:** Chromium (Playwright 1.56.0)
- **Server:** `node tools/serve-folder.mjs . 8798`

## Routes and Budgets

Each budget is the measured value rounded up to the next 100ms, with a 25% tolerance. The suite (`tests/budgets.mjs`) fails when a route exceeds its budget by more than the tolerance.

### Landing Page (`#welcome`)

- **First paint:** 500ms (tolerance: 125ms)
- **Time to interactive:** 1000ms (tolerance: 250ms)
- **Heaviest action:** Import from Archidekt dialog — 1500ms (tolerance: 375ms)

### Decks Hub (`#decks`)

- **First paint:** 400ms (tolerance: 100ms)
- **Time to interactive:** 900ms (tolerance: 225ms)
- **Heaviest action:** Open sort menu — 600ms (tolerance: 150ms)

### Deck Page (`#decks?deck=deck:live:D1`)

- **First paint:** 600ms (tolerance: 150ms)
- **Time to interactive:** 1200ms (tolerance: 300ms)
- **Heaviest action:** Open Ready to add — 1800ms (tolerance: 450ms)

### Cards Library (`#cards`)

- **First paint:** 500ms (tolerance: 125ms)
- **Time to interactive:** 1100ms (tolerance: 275ms)
- **Heaviest action:** Filter by status — 1000ms (tolerance: 250ms)

### Cards To Buy (`#cards?tab=buy`)

- **First paint:** 500ms (tolerance: 125ms)
- **Time to interactive:** 1100ms (tolerance: 275ms)
- **Heaviest action:** Mark first card as Bought — 1200ms (tolerance: 300ms)

### Discover (`#discover`)

- **First paint:** 400ms (tolerance: 100ms)
- **Time to interactive:** 900ms (tolerance: 225ms)
- **Heaviest action:** Select a commander — 1500ms (tolerance: 375ms)

### Build (`#lab`)

- **First paint:** 500ms (tolerance: 125ms)
- **Time to interactive:** 1000ms (tolerance: 250ms)
- **Heaviest action:** Optimize deck — 3000ms (tolerance: 750ms)

### Settings (`#settings`)

- **First paint:** 400ms (tolerance: 100ms)
- **Time to interactive:** 800ms (tolerance: 200ms)
- **Heaviest action:** Toggle a setting — 600ms (tolerance: 150ms)

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

## Acceptance

- The suite passes in under three minutes.
- `GEOMETRY_REQUIRED=1` turns a missing browser into a failure (the same flag `tests/browser-geometry.mjs` uses).
- Every route, budget, tolerance, and source is documented above.
- A break (a 2-second `setTimeout` inserted into one route's render) fails exactly that route.
- The suite is listed in README.md with the count raised by one.
