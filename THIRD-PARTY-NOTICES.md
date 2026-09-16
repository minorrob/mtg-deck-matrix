# Third-party notices

Everything in this repository that CrankMagic did not create, where it came
from, and what is known about the terms it arrived under. Read with
[`LICENSE`](LICENSE) and [`DISCLAIMER.md`](DISCLAIMER.md).

This file is maintained by hand. If you add a dependency, an asset or a data
source, add it here in the same commit.

---

## Game content — Wizards of the Coast LLC

| What | Where |
| --- | --- |
| Card names, rules text, type lines, mana costs, legality | `data/cards.json`, `data/card-facts.json`, `data/graph.json`, and every file derived from them |
| Mana and card symbols | `assets/mana/{W,U,B,R,G,2,3}.svg` |
| Card art and card images | fetched at runtime; reproduced in `assets/crankmagic/commander-*.webp` and incidentally in `docs/screens/` |
| Set names, set codes, collector numbers | throughout `data/` |

*Magic: The Gathering* and all associated names, symbols, text and imagery are
copyrights and/or trademarks of **Wizards of the Coast LLC**, a subsidiary of
Hasbro, Inc. **© Wizards of the Coast LLC.** All rights reserved by the owner.

CrankMagic is unofficial Fan Content permitted under the **Wizards of the Coast
Fan Content Policy** — <https://company.wizards.com/en/legal/fancontentpolicy> —
and is **not approved or endorsed by Wizards**. No ownership of this material is
claimed, and none is granted by this repository's license.

The mana SVGs are unmodified files retrieved from Scryfall's public card-symbols
endpoint (`https://svgs.scryfall.io/card-symbols/{symbol}.svg`) on 7 September
2026. Provenance is recorded in `docs/glossary.md`.

## Card data — Scryfall

- **Source:** <https://scryfall.com> — API docs at <https://scryfall.com/docs/api>
- **Used for:** card identity, oracle text, printings, images, legality, prices.
- **How:** `tools/build-card-records.mjs` fetches and caches; the app also
  requests cards at runtime.
- **Terms:** Scryfall's own guidelines and rate limits apply
  (<https://scryfall.com/docs/api>). Scryfall's compiled card database is made
  available for reuse; the **card text and images within it remain the property
  of Wizards of the Coast**, and Scryfall's own imagery and marks remain theirs.
- CrankMagic is **not affiliated with or endorsed by Scryfall.**

## Commander popularity — EDHREC

- **Source:** <https://edhrec.com>
- **Used for:** commander ranks (a dated *Top Commanders · Past 2 Years*
  snapshot) and card co-play signals.
- **Where:** `data/commander-ranks.json`, the co-play block of `data/graph.json`,
  produced by `tools/commander-ranks.mjs`.
- **Terms:** EDHREC's site terms apply. Their data is used as a dated snapshot
  for a personal tool and is clearly labelled in the app as observed co-play
  rather than a recommendation.
- CrankMagic is **not affiliated with or endorsed by EDHREC.**

## Rules engine — Forge

- **Source:** <https://github.com/Card-Forge/forge>
- **License:** **GPL-3.0-or-later.**
- **Pinned at:** the commit recorded in `game/engine-adapter/forge.lock.json`.
- **How it is used:** the Java sources under `game/engine-adapter/src/crankmagic/`
  link against Forge classes. **Those files are a derivative work of Forge and
  are themselves GPL-3.0-or-later**; each carries
  `SPDX-License-Identifier: GPL-3.0-or-later`. Forge itself is **not vendored**
  into this repository — it is fetched and built separately.
- The MIT grant in `LICENSE` §2 does **not** reach this directory and cannot be
  used to relicense it. Anyone redistributing the adapter must do so under the
  GPL and make corresponding source available.

## Retail links — TCGplayer, Card Kingdom

Outbound links only. No data is retrieved from them and no affiliate
relationship exists. Marks used nominatively to identify the destination.

## Deck imports — Moxfield, Archidekt, Deckstats

Deck lists that a user chooses to import. Their marks are used nominatively;
CrankMagic is not affiliated with any of them.

## Typefaces

| Face | Files | Terms |
| --- | --- | --- |
| **Oxanium** | subset embedded in the wordmark CSS | SIL Open Font License 1.1 — full text in `assets/crankmagic/oxanium-OFL.txt`. Copyright 2019 The Oxanium Project Authors. |
| **Satoshi** | `assets/crankmagic/satoshi-{400,500,700}.woff2` | Indian Type Foundry, distributed via Fontshare under the foundry's own license. Free for personal and commercial *use*; **redistribution of the font files is restricted by the foundry's terms.** Anyone forking this repository should read those terms rather than assume the files may travel with it. |
| System stacks | — | No embedded files. |

## Artwork not originated by this project

| What | Where | What is known |
| --- | --- | --- |
| Playmat images (7) | `game/ui/assets/playmats/*.png` | Supplied for personal game use on 15 September 2026, copied without raster edits. Labels in the picker are descriptive names, not claims about the original titles or artists. **No commercial redistribution right is asserted.** Provenance note: `game/ui/assets/playmats/README.md`. |
| `rob-playmat.png` | `game/ui/assets/` | As above. |
| Commander images (4) | `assets/crankmagic/commander-*.webp` | Derived from Magic card art; rights with Wizards of the Coast and the individual artists. |
| App screenshots | `docs/screens/**` | Screenshots of CrankMagic that may incidentally reproduce card art. |
| CrankMagic wand logo, wordmark, OG card | `assets/crankmagic/`, `design/crankmagic/assets/` | Project marks. Not licensed by `LICENSE` §2 — see `DISCLAIMER.md` §5. |
| The header mist | `crankmagic-brand.js` | Original procedural canvas artwork by this project. Covered by `LICENSE` §2. |

## Runtime dependencies

**None.** The application ships no framework and no vendored libraries; it is
plain JavaScript, CSS and HTML. Playwright is installed in CI for the browser
suites and is not part of the application.

---

### Reporting

If you hold rights in anything listed here and object to its presence, open an
issue on <https://github.com/minorrob/mtg-deck-matrix> or contact the
maintainer. It will be removed promptly.
