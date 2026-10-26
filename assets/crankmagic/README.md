# CrankMagic production assets

These are unchanged copies of the approved design assets in
`design/crankmagic/assets/` and `design/crankmagic/art/`. The wand logo was selected
by the user; its transparent derivative and edge treatment were approved during
the design review. Since r4 (2026-10-25) the faces are Cinzel 600 for page titles and the deck title, and Lato 400 and
700 for everything else; Barlow Condensed 800 is the callout word only. The embedded Oxanium subset in
`crankmagic-design.css` is still the wordmark, the app's name, and `oxanium-OFL.txt` accompanies it.
Each face ships with its OFL text beside it (`cinzel-OFL.txt`, `lato-OFL.txt`, `barlowcondensed-OFL.txt`). Source URLs, font CSS and commander image provenance remain in the
design package. Mana SVG provenance is documented in `docs/glossary.md`.

The mist remains procedural canvas artwork in `crankmagic-brand.js`; it is
decorative, pausable, and disabled for reduced motion. Public artwork never
encodes or implies a user's holdings.

The card backs `card-back-{tan,blue,black,red,green}.webp` are Rob's own artwork (design/art-source/card_backgrounds/,
2026-09-30), cropped to the card and scaled to 280x392 by `tools/build-card-backs.py`. Tan is the universal back; a
seat's back follows its color on the Play board.
