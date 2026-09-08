# CrankMagic design review

The final review package is now versioned with the application. **The production redesign and simulator rewrite await sign-off.** This folder preserves the approved presentation and proposed behavior; it does not replace the three production pages.

- Open [mtg-facelift-mockup.html](mtg-facelift-mockup.html) directly in a browser. Fonts, card images and logo are embedded. The prototype uses sample records and an explicitly labeled simulated progress sequence, not a real optimization run. It can retain its own preview reports locally; it does not manage the production card library.
- Read [improvement-plan.md](improvement-plan.md), [collection-workflow.md](collection-workflow.md), [simulation-fidelity-plan.md](simulation-fidelity-plan.md) and [end-to-end-plan.md](end-to-end-plan.md).
- Read [evaluations.md](evaluations.md) for the simulator, pilot-policy, optimizer, inventory, architecture, data, UX and AI assessments, with links to the detailed evidence and critiques.
- Read [verification.md](verification.md) for this branch's fresh checks and the limits of those checks.

## Editing and reproduction

The optional builder uses Python's standard library. This is a design-artifact tool, not a production build step or dependency. From the repository root:

```sh
python3 design/crankmagic/build.py
node tools/check-glossary.mjs
node design/crankmagic/tests/flows.mjs
node design/crankmagic/tests/overview.mjs
node design/crankmagic/tests/run-roster.mjs
```

The tests require external Playwright and a Chromium browser. Set `UAT_PLAYWRIGHT` to an existing Playwright entry point and `UAT_CHROMIUM` to the browser executable when needed, as for the production journeys. They fail if dependencies are unavailable; they do not silently skip. Generated screenshots and reports go in `qa/generated/`, which is ignored by Git. They run in isolated browser profiles with network requests blocked.

`src/base-v3.html` is the frozen base layout and embedded assets inherited from the earlier approved study. The current editable modules in `src/` supply the final header, commander picker, run pane, glossary, roster, collection and deck actions. `build.py` assembles them with the repository's example card data into `fragment.html` and the standalone mockup. `src/frame-template.html` and `src/export-template.html` preserve the export wrapper and sandbox; `src/crankmagic-export-cache.js` provides its narrowly scoped preview-report storage adapter. No local machine paths or Codex installation are needed to rebuild.

**Glossary definitions have exactly one editable source:** [data/commander-glossary.json](../../data/commander-glossary.json). The fragment's demonstrated tooltip subset is generated; edit the canonical data and rebuild, never fork the definitions. [Glossary documentation](../../docs/glossary.md) describes provenance and the future production integration.

Artwork and fonts are documented in [assets/README.md](assets/README.md) and the `art/*-sources.json` records. Rejected logo variants, earlier mockup exports, temporary scripts and private intake workbooks are not part of this final package.

## Upstream consolidation

The review began at `e5810ed`. Upstream squash commit `8e4225b` has the identical source tree. The later `118fe39` adds pilot policies and the browser's “How you play it” lens. Both histories were merged onto `astra/simulation-fidelity-plan`, preserving the new upstream code and our glossary additions. The plan now identifies that work as already present, including its remaining modeling limits. The original `astra/app-improvement-plan` tip was already an ancestor; no separate work was lost.

Nothing in this package authorizes API spending, a production rollout or a merge to main.
