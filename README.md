# MtG Deck Matrix

A mobile-first static app with one private browser-local flow:

1. **Compare** — choose one of five variants for each of six deck roles.
2. **Buy Picks** — include required tune-ups and optionally select Enhance or Max cards.
3. **Shop List** — search, filter, deduplicate, and mark cards or precons as found.

The source data is normalized from the two legacy HTML files kept in the parent project folder. Run `tools/extract_data.py` after those source files change.

## Current catalog coverage

All 30 Compare variants are normalized. The six complete purchase profiles present in the original Shopping Guide are connected end-to-end: `1o`, `2c`, `3e`, `4c`, `5o`, and `6c`. Unmapped variants remain selectable but intentionally do not receive generic or mismatched shopping cards.

Run `node tests/data-integrity.mjs` to validate the catalog.
