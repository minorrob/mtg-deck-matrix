# Commander glossary

`data/commander-glossary.json` is the **only editable source of glossary definitions** for CrankMagic. The 335 entries include the supplied workbook's 272 terms and 63 additions covering card types, zones, timing, Commander rules, resources and other explanatory terms. Incorrect seed wording has been replaced directly. There is no workbook/override merge and no second glossary to maintain.

## Authority and maintenance

The workbook `MTG_Commander_Glossary.xlsx` was an intake source, not an ongoing authority. Its filename and SHA-256 identify that intake; the user's original file is not modified or distributed. The wording now lives in the JSON. Readability edits and new terms go there directly, with a revision increment. Aliases share the same term ID and definition. Stable IDs allow corrections without breaking references.

Wizards' [Comprehensive Rules](https://magic.wizards.com/en/rules) are the external rules authority. This review used the [published text effective August 7, 2026](https://media.wizards.com/2026/downloads/MagicCompRules%2020260819.txt), checked September 7, 2026. Entries carry source keys and relevant rule sections where applicable. The common [keyword glossary](https://magic.wizards.com/en/keyword-glossary) and [Phyrexia release notes](https://magic.wizards.com/en/news/feature/phyrexia-all-will-be-one-release-notes) are supplementary references. This dataset is a concise teaching glossary; a short explanation does not replace the full rules or card-specific rulings.

Corrections include regeneration tapping, lifelink not being a triggered ability, banding damage assignment, token state-based actions, optional tapping for harmonize, and the casting costs and timing of warp and suspend. The current keyword-ability headings were checked against the published rules; missing variant actions and foundational terms were added. Variant terminology is labeled to distinguish it from ordinary Commander play. This does not claim a formal proof of every summary or simulation support for every term.

The workbook's 45 effect-category ratings are retained as a separate, explicitly subjective reference block inside the canonical file. They are not glossary definitions, card classifications, objective fun scores or simulation coefficients. `simulationEligible` is false. Do not infer engine behavior from them.

## Consumption contract

- Load the canonical dataset once and share it across pages. Future cached versions must invalidate by dataset revision and asset version; old storage must not override published definitions.
- The standalone design mock embeds a generated subset from this file so its demonstrated tooltips work offline. That subset is an output, never an editable source. A changed definition must be rebuilt into exports; do not patch tooltip strings separately.
- Use an explicit term ID when context is ambiguous. Countering a spell is different from putting counters on a creature. App navigation such as Discover is not a keyword-action explanation. Never scan and rewrite all visible text indiscriminately.
- Use escaped labels and plain-text definitions. Annotate explanatory keywords, card types and concepts, preserving the actual card name and text.
- Dotted underline signals a definition. Hover slightly emphasizes the term without shifting text. Show below when space permits, otherwise above; fit the viewport. Leaving the word dismisses the popup. Keyboard focus, Escape, touch toggle and outside dismissal provide alternatives. Scrolling dismisses stale popup positions.
- About the Commander combines power/toughness, type line and mana symbols in one compact fact bullet. Keywords remain prominent, followed by triggered/activated abilities and practical use guidance.
- Glossary text is explanation data, not executable card behavior or an AI-generated ruling. No AI request or token cost is needed for definitions.

## Checks and implementation status

Run `node tools/check-glossary.mjs`. It checks stable/unique IDs, alias ambiguity, reference structure, foundational coverage, plain text, the single-authority contract and the subjective-rating boundary. It validates structure, not rules correctness.

The data and mana assets are prepared on the review branch. Production pages do not load them yet; full application integration remains subject to the user's build sign-off. On integration, add a consistent `?v=` reference, update all affected asset versions and run `node tests/asset-versions.mjs --update`, the Node suites and browser journeys.

## Mana artwork provenance

`assets/mana/{W,U,B,R,G,2,3}.svg` are unmodified symbols retrieved from Scryfall's public `https://svgs.scryfall.io/card-symbols/{symbol}.svg` URLs on September 7, 2026. See [Scryfall's symbol API documentation](https://scryfall.com/docs/api/card-symbols). They are embedded in the standalone mock for offline display. Color identity icons and a card's mana cost use separate accessible labels: they answer different questions. Magic symbols and card imagery belong to their respective rights holders; the files are not original CrankMagic artwork.
