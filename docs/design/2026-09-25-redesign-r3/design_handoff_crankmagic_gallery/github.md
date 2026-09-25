repo: minorrob/mtg-deck-matrix
branch: main

## Last sync
date: 2026-09-25T02:40:00Z

### Updated in this project
- Wireframes v2: 70-screen navigable suite incl. landing and Play Full screen view
- Landing page: wireframe L1 + hi-fi mock (Satoshi Black headers), referencing the live crankmagic.com
- Wireframes turn 4 (dialogs, Guide/SWOT, How, archived/compare) and the extrapolation guide in the handoff README
- Read game/README.md, the Online quick start and the human-play plan; three Play lobby layouts added to Wireframes.dc.html (turn 2)
- Wireframes for the remaining nine pages (Wireframes.dc.html) and the Claude Code handoff pack (design_handoff_crankmagic_gallery/)
- Read the Library source (crankmagic-collection.js) and designed Library + Explore entry in the chosen palettes
- Saved four design systems (root + design-systems/) from the palette study
- Read the Discover page source (crankmagic-discover.js) and designed Explore in the Gallery system
- Ported the header aether-mist animation (crankmagic-brand.js) to the new rail wordmark
- Gallery chosen as the direction; Bench retired

## Sync history
- 2026-09-20T05:06:31Z — recreated Decks + Deck Overview; copied fonts, logo, mana symbols, commander art, live-load data

## Screen map
| Screen | Repo files |
| --- | --- |
| Landing Wireframe.dc.html, Landing Page.dc.html | new page (no repo source yet); nav + brand from index.html, crankmagic-app.js |
| Current Decks.dc.html | index.html, crankmagic.css, crankmagic-design.css, crankmagic-decks.js (views.decks), crankmagic-app.js (readinessBar, colors, pill), data/live-load.json |
| Current Deck Overview.dc.html | index.html, crankmagic.css, crankmagic-design.css, crankmagic-decks.js (overview, stats, glance, nextLine, recordHTML), crankmagic-app.js, data/live-load.json |
| Gallery Decks.dc.html, Gallery Deck Page.dc.html | redesign of the two screens above; aether.js ports crankmagic-brand.js |
| Gallery Explore.dc.html, Gallery Explore Entry.dc.html | crankmagic-discover.js (views.discover, facetBar, card pane), crankmagic.css |
| Gallery Library.dc.html | crankmagic-collection.js (cardsHead, statsHTML, filter panel, columns), README Cards → Library |
| Deck Redesign.dc.html | canvas presenting the Gallery screens |
| Wireframes.dc.html | crankmagic-decks.js (cardsTab, workingHTML, upgradesHTML, acquire), crankmagic-collection.js (buy tab, sheet), crankmagic-orders.js, crankmagic-pull.js, crankmagic-change-ui.js, crankmagic-game.js, crankmagic-online.js, game/README.md, game/docs/CRANKMAGIC-ONLINE-QUICK-START.md, docs/commander-human-play-and-multiplayer.md |
