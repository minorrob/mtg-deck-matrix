---
name: design-reference-and-critique
description: Find references for a CrankMagic screen or flow on Mobbin and critique a design (a wireframe, a screenshot, a running screen) against the approved designs and AGENTS.md's rules. Use before building a UI change that has no approved reference, or when asked to review a design.
---

# Design references and critique

Adapted for CrankMagic from Anthropic's `design:design-critique` plugin skill, with Mobbin for references, in our own
words. `AGENTS.md` ("Design references from Mobbin", the visual acceptance rules) wins where they differ.

## Needs

| Tool | For | If it is missing |
| --- | --- | --- |
| Mobbin (paid) | references from real apps | Ask Rob once: *"This UI change has no approved reference and Mobbin isn't connected here. Connect the Mobbin connector, or point me to a reference you approve."* Never scrape the site. |
| The approved designs | the authority | `docs/design/**`, `design/**`, the wireframes the issue links. |

## 1 · Start from what Rob approved

List the approved references for the screen. If one exists and covers the change, build to it; Mobbin is not needed.
If two disagree, surface the contradiction to Rob before building (`AGENTS.md`, "Before implementation").

## 2 · Find references (only when nothing approved covers it)

Search Mobbin for one screen or one flow at a time, in plain words with the kind of app ("card game lobby",
"multiplayer game invite flow"), on the platform that matters (web, and iOS for the phone layout). Look at the images;
do not judge from the names. Keep three to five that bear on the decision.

Record each as its Mobbin link and the decision it informs, on the issue or in `docs/design/references/`. Never commit
a Mobbin image, and never ship one.

## 3 · Critique

For a design or a running screen, in this order:

1. **Purpose in two seconds:** what draws the eye first, and is that the thing the player came for?
2. **The player's task:** can it be done; how many steps; is every control findable and reachable at 390 and 1400 wide?
3. **CrankMagic's rules:** symbols first, words last (source → action → target clear); every card one press from the
   card; sizes are sliders; the game fits the window; US English, dollars and US dates; a refusal says what is wrong
   and what to do.
4. **Hierarchy and consistency:** reading order, emphasis, spacing, type, the design tokens in `crankmagic-design.css`.
5. **Accessibility:** contrast, target sizes, text never under 10px at its final displayed size, names for symbols.

Output a table: finding, severity (blocks / should fix / minor), the fix, and the reference or rule behind it. Say what
works, too. A finding that departs from an approved design is a question for Rob, not a change.
