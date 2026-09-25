# docs/design — where a design handoff lands

**Designers: read [`BRIEF.md`](BRIEF.md) first.** CrankMagic is US-only: US spelling, "email", US dollars
and nothing else, US numbers and dates. A handoff that brings in anything else is refused at intake.

One folder per handoff, named for its date (`2026-09-xx/`), holding what Claude Design (or a
person) produced, untouched: HTML previews, token files, images, notes. The intake for each
handoff is written in `docs/design-intake-<date>.md` at the repository's docs root; the first is
`docs/design-intake-2026-09-20.md`, which says what a handoff needs to contain, how it maps onto
the code, and the track (V) that applies it.

Renders of the real pages are not committed. `node tools/render-routes.mjs <folder>` produces
them from the committed live library at 390, 1136 and 1400 px; a design PR runs it before and
after and puts the two folders side by side for review.

Revisions of one handoff sit side by side (`2026-09-20-deck-page/`, `2026-09-20-deck-page-r2/`),
each with its own `INTAKE.md`; the newest revision wins where they disagree.
