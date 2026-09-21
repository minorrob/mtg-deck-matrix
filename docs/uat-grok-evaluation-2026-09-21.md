# Evaluating Grok Bot's UAT of #311

**Source:** `CLAUDE-UAT-HANDOFF-2026-09-21.md` + `CrankMagic-UAT-2026-09-21.xlsx` (76 cases, 42
open remediations). **Asked for by Rob:** evaluate the results, decide what is reasonable, apply
the corrections, test and confirm.

Every row below was **checked against this repository** before being accepted or rejected. The
handoff is a recommendation, not an instruction, and it says so itself: *"Zero code from
Grok/agents. This file + the companion workbook are recommendations only."* Treating it that way
matters, because one of its S2 rows would have undone a change Rob asked for by name.

---

## Applied

### UAT-START-02 (S1) — the one that was blocking a live game

**Grok:** *"Start→Forge fails: `javac.exe` ENOENT under missing
`C:\Users\robmi\CrankMagic\commander-runtime\...`"*

**Verified, and worse than reported.** `commander-runtime` does not exist on this machine; the JDK
is at `CrankMagic/runtime/jdk-17.0.20.1+1`. The cause is two resolutions of one thing that had
drifted apart:

| | resolves the JDK by | result |
|---|---|---|
| `game/tools/doctor.mjs:86` | `process.env.CRANKMAGIC_JDK_ROOT` | **ok** |
| `game/tools/local-game-launcher.mjs:43` | `resolve(root,'../commander-runtime/jdk-17.0.20.1+1')` | **ENOENT** |

So `node game/tools/doctor.mjs` reported *"✓ Ready to host a game"* while Start died — the worst
possible pair, because the check that exists to say the machine is ready was looking somewhere
else from the code that needed it. `check-my-decks.mjs` and `setup-catalog.mjs` already honor the
environment variables; the launcher was the only place that did not.

**Fixed** with an exported `resolveEngineRoots()`: the environment first (what the doctor reads
and the launch scripts set), then `../runtime`, then `../commander-runtime` — which still works if
it ever comes back. A directory without `javac` is rejected, because the launcher compiles the
adapter before it runs anything. When nothing is found it names what it tried, since
`spawnSync javac.exe ENOENT` names nothing.

Held by five tests in `game/tests/engine-roots.test.mjs`, red before the fix. Confirmed live:

```
no env:   {"forge":"C:\\Users\\robmi\\CrankMagic\\forge","jdk":"C:\\Users\\robmi\\CrankMagic\\runtime\\jdk-17.0.20.1+1"}
with env: (the same)
```

**This is the single most valuable thing in the whole UAT.** It is a real repository bug on the
exact path to a live game, and it was invisible to the tool built to catch it.

### CM-DS-005 (S2) — focus ring

**Verified in three places** in the handoff, not one:

- `README.md:28` — `--color-aether` … *"focus ring"*
- `README.md:44` — *"Focus ring 2px `--color-aether`"*
- `design-system/readme.md:20` — *"Focus ring 2px in the aether colour"*

We shipped `outline:3px solid var(--v-accent)` — brass, and a third too thick. Brass is the
primary-action color, so a focus ring in it says *"this is the primary"* about whatever happens
to be focused. Now `2px var(--color-aether)`.

### E-01b (S2, part) — the page called itself Discover

The rail says **Explore**, the designer's screen is `Gallery Explore Entry` headed **Explore**,
and `C.pageHead('Discover')` appeared twice in `crankmagic-discover.js`. Both now read Explore.
The route stays `#discover` — that is a URL someone may have saved — and the help key stays
`discover`, because it is an id rather than a word anyone reads.

---

## Rejected, with evidence

### CM-DS-010 (S2) and D-01b (S3) — "lock the Decks grid to 3 columns"

**Rejected.** This would undo a change Rob asked for by name on 2026-09-21:

> "the Deck images are too big. And when I zoom out, it should make the decks smaller (not just
> their text) and they should re-align to 3, 4, 5 or 6 on a row based on how many can fit given
> the padding and size available."

The designer's README does say `repeat(3, minmax(0,1fr))`, and Grok read it correctly. It has been
**superseded by the person the design is for**. `repeat(auto-fill, minmax(260px,1fr))` stays.

This is the reason a UAT against design documents cannot be applied without reading it: a document
can be right about itself and wrong about the product.

### UAT-DELTA-01 (S3) — "DELTA says no Launch button vs live Start + countdown"

**Already decided, in the direction the row calls the alternative.** Rob asked for the Start button
and the countdown explicitly. The row itself notes *"Rob request per Claude"* and asks for a
product lock — the lock exists. The **DELTA should be updated to match the UI**, not the reverse.

---

## Deferred, with a reason

| Row | Why not now |
|---|---|
| **UAT-GUEST-01/02, UAT-ENV-02 (S1/S2)** | Ops, not repository. `cloudflared` is installed (the doctor confirms) but not running with `-RemoteGuests`. Nothing to change in code until the host is relaunched that way. |
| **DR-P09 (S2)** | The Desktop shortcut's working directory is outside the repo. Changing a `.lnk` on Rob's desktop is his machine, not this branch. |
| **CM-DS-001 / CM-DS-004 (S2)** | Correct, and bigger than it looks: **129** `v-*` selectors in `crankmagic-design.css` are never emitted by the app (audited against every `.js`, `.html` and `crankmagic.css`), including the navy `.v-cover` gradients. Deleting them deserves its own PR with a rendering of every route, because 21 `v-*` classes **are** live (`v-button`, `v-panel`, `v-nav`, `v-brand*`, `v-aether*`, `v-dialog`, `v-field`, `v-term`, `v-eyebrow`, `v-top`) and a careless sweep would take them. |
| **CM-DS-011 (S2)** | Same PR as above. `#matrix-v2 h1{font-size:36px;font-weight:700}` is not dead — it is *winning*, and it is the id-vs-class trap already recorded in `docs/INDEX-where-things-live.md`. It should be dropped to a class when the dead layer goes, so the Gallery layer stops competing with an id. |
| **L-02 (S2)** | Real, and the design calls it *"the highest-priority behaviour on the Library → Sheet view"* (README:95). It is a feature — in-place numeric editors with Enter/Tab/Escape/arrow semantics — not a correction, and it belongs in the Library lane rather than mid-Play. |
| **LIB-06 (S2), LIB-01/LIB-04 (S3), D-03b (S3), W-DECKS-02/03/04/05** | Reasonable and checkable; Decks/Library lane. Recorded here so they are not lost. |
| **DR-P05, DR-P03, DR-P06, DR-P02 (Play)** | The handoff itself says Play is **IN FLUX** and *"Do not fight mid-merge Play commits"*. Agreed. DR-P05's End table / force-advance are levers for a **running** game; the lobby has none. |

---

## What the UAT got right about its own limits

Three of its non-passes are its harness, not the product, and it says so: Playwright missing in the
Cursor helper (UAT-WF-02), no CDP browser (UAT-ENV-04), and the Gallery HTML not painting in box
Chrome (LIB-11). Those are correctly marked infra. The local suite runs Playwright against real
Chrome here — `tools/lobby-permutations.mjs` is 15/0 and `runtests.sh` is 99 green — so the Play
rows it could not drive are covered on this machine.
