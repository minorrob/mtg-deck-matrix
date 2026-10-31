---
name: write-ui-copy
description: Write or review the words on a CrankMagic screen — a label, a button, a prompt, a refusal, an empty state, a toast, an accessible name — within "Symbols first, words last", the refusal rule and US English. Use whenever a change adds or edits text a player reads.
---

# Words on screen

Adapted for CrankMagic from Anthropic's `design:ux-copy` plugin skill, in our own words. `AGENTS.md` wins where they
differ.

## Needs

Nothing beyond the repository. `tests/feature-wiring.mjs` checks the wording rules it can.

## The order of preference

1. **No words:** a glyph, a color, an indicator, a position. (`AGENTS.md`, "Symbols first, words last".)
2. **Shorthand:** a count, a mana symbol, an arrow (*Fauna Shaman* → ⤳ *Rob*).
3. **A short phrase:** a verb first for an action ("Cast", "Pass"), a noun for a place ("Library").
4. **A sentence:** only for a refusal, a first-time explanation, or something irreversible.

What must stay clear in every event: the source or cause, the action, the target or effect, in that order, and a card
name is one press from the card.

## Kinds of copy

| Kind | Rule |
| --- | --- |
| Button / action | A verb, one or two words; the same verb everywhere for the same action. |
| Refusal | What is wrong, then what to do instead, naming the specific thing (`AGENTS.md`'s un-invited seat example). Never a warning that can be clicked past. |
| Empty state | What will be here, and the one action that fills it. |
| Confirmation | Only for what cannot be undone; name the thing and the consequence. |
| Toast / status | Past tense, under six words; it disappears, so nothing in it is the only copy of a fact. |
| Accessible name | Whole words, always (`aria-label`, `title`), even when the screen shows a glyph. |

## Always

- American English: color, center, gray, catalog, canceled. US dollars only. Dates as "Sep 25, 2026", numbers through
  `'en-US'` formatters.
- Second person for the player ("your library"), no jargon the rules don't use, Magic's own terms where they exist
  (Comprehensive Rules wording for zones, steps and actions).
- No exclamation marks in errors, no blame ("invalid input"), no "please" on a refusal.

## Review output

A table: the current text, the problem, the proposed text (or the symbol that replaces it), and the rule. Run
`node tests/feature-wiring.mjs` after the change.
