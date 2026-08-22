# MtG Deck Matrix

A mobile-first static app with one private browser-local flow:

1. **Compare** — choose one of five variants for each of six deck roles.
2. **Buy Picks** — include required tune-ups and optionally select Enhance or Max cards.
3. **Shop List** — search, filter, deduplicate, and mark cards or precons as found.

The source data is normalized from the two legacy HTML files kept in the parent project folder. Run `tools/extract_data.py` after those source files change.

## Current catalog coverage

All 30 Compare variants are normalized and connected to Buy Picks. The six complete profiles from the original Shopping Guide retain their audited shopping plans. The other variants promote their own published precon seed, key-upgrade table, upgrade ladder, and Bracket 3 route into variant-specific purchase profiles; verified shared precons reuse their full 100-card shell, while incomplete source lists remain visibly modeled rather than being presented as audited decklists.

Run `node tests/data-integrity.mjs` to validate the catalog.
