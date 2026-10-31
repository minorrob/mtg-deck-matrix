---
name: visual-acceptance
description: Run CrankMagic, look at the changed screen in the states and sizes that matter, check accessibility, and report requirement-to-evidence before calling a visible change done. Use for any change to layout, type, drawers, the board, animation or interaction, before marking its PR ready.
---

# Visual acceptance

The procedure for `AGENTS.md`, "Mandatory visual acceptance and budget checkpoints", with the accessibility checks of
Anthropic's `design:accessibility-review` plugin skill folded in, in our own words. In Claude Code, the built-in `run`
skill launches and drives the app; any other harness does the same steps by hand. `AGENTS.md` wins where they differ.

## Needs

| Tool | For | If it is missing |
| --- | --- | --- |
| A browser (Playwright's Chromium) | screenshots and walks | In a cloud container it is preinstalled; elsewhere ask Rob for a session that has one. |
| The approved reference | the comparison | The wireframe or design the issue links; none → `design-reference-and-critique` first. |
| A real table, Forge | Play under real conditions | Personal-HP only: say what was not proven. |

If the screen cannot be viewed, visual acceptance is **blocked**, and the report says so. Code reading is never a
substitute.

## 1 · Before the change

Extract a short checklist from the approved reference. Screenshot the current state (the "before"), and keep a Git
checkpoint to return to.

## 2 · Run it

```bash
python3 -m http.server 8790        # the workshop, at http://localhost:8790/
```

Play and the cloud need their own harnesses (`tests/uat/play-e2e.mjs`, `wrangler dev`; `docs/release-pages.md`). Walk to
the changed screen with realistic content: long names, a full board, an empty state, four players.

## 3 · Look, at the sizes that matter

At 390 and 1400 wide at least, and in every Play view the change touches (Table, Focus, 3D): open each screenshot and
check drawers and panel edges, type size at its final displayed size (never under 10px), clipping, overlap,
truncation, empty space, reachability of every control, and that the game never scrolls (`tests/board-flat-views.mjs`).
Sliders at both ends.

## 4 · Accessibility (WCAG 2.1 AA, with 2.2's target size)

- Contrast: 4.5:1 for text, 3:1 for large text and for the parts of controls a player must see.
- Keyboard: every control reachable and operable, focus visible, order sensible, no trap.
- Names: every symbol-only control has an accessible name; images that carry meaning have text.
- Targets: at least 24×24 CSS px, 44×44 on the phone layout where the design allows.
- Motion: nothing essential depends on animation; reduced motion is honored.
- The suites: `tests/a11y-app.mjs`, `tests/a11y-board.mjs` when the board changes.

## 5 · Report

A requirement-to-evidence checklist: each item, the screenshot or command that shows it, pass or the named deviation.
Functional verification and visual acceptance are reported separately. A visible divergence from the approved design
blocks completion unless Rob accepts it by name.
