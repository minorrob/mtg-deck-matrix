# CONSOLE-NETWORK — crankmagic.com workshop UAT 2026-09-24

## Summary

| Class | Desktop | Mobile |
|---|---|---|
| `pageerror` / uncaught | **0** | **0** |
| Failed critical app-shell requests (4xx/5xx on JS/CSS/HTML/catalog) | **0 observed** | **0 observed** |
| Console noise | CSP on Cloudflare Access login | same |

## Page errors

None recorded across desktop and mobile walks (`walk.mjs` / `walk2.mjs` / `walk3.mjs`).

## Failed network requests

No failed requests to crankmagic.com app assets or card catalog were logged by the response listener (status ≥400), after filtering Cloudflare Insights / favicon noise.

Scryfall card images (when fetched) were not flagged as systematic failures in this run.

## Console / CSP

### Cloudflare Access login (Accounts)

When opening CrankMagic Accounts (Menu → account), the hosted login page at `lucky-smoke-fdf6.cloudflareaccess.com` logged:

> Loading the image `data:image/svg+xml,…` violates CSP directive `default-src https: 'unsafe-inline'` (img-src not set; fallback to default-src). Action blocked.

**Impact:** Cosmetic on the third-party Access login chrome (logo/SVG). Does not break Google / Email sign-in affordances. Workshop guest path unaffected.

### App origin

No workshop-breaking console errors captured on `https://crankmagic.com/` Decks / Library / Explore / Play Coming Soon during the settled walks.

## Notes for settle races

- Initial “Opening your library” clears reliably within the harness wait (≤~120s budget; typically much faster).
- Explore may show **“Loading the co-play links — about 20 MB, kept for next time…”** with an empty main until that payload finishes — automated reads must wait; early screenshot looks blank (`evidence/*/60c-explore.png`) while a settled Explore shows chooser + 31,830 cards (`04-nav-explore.png`).
