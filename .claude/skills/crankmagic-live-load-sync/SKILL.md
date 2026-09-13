---
name: crankmagic-live-load-sync
description: "Rebuild the CrankMagic Load Live files (data/live-load.json + data/live-state.json) from the latest Treys MtG Master workbook and ship them to minorrob/mtg-deck-matrix. Use when Rob says update CrankMagic, refresh Load Live, push my decks to the app, replace the Live Load, or after any Master vN change."
---

# Sync the Master workbook into CrankMagic's Load Live files

## What this produces
Two files in `minorrob/mtg-deck-matrix`, plus the commit that carries them:
- `data/live-load.json` — Rob's collection in plain form: six deck targets, what is in each
  box, the bench, orders in flight, the buy list with prices, the Upgrade Path rows, and per
  deck the two working lists (`options`: cards in the hundred flagged first to swap out;
  `planned`: cards coming in that are not in the hundred yet). Built by a tool, never
  hand-edited for quantities.
- `data/live-state.json` — a complete CrankMagic backup (`crankmagic-backup` v1, SHA-256
  checksum) built from the file above through the app's own collection model. **User
  Functions → Load Live** (password `treycmload1`) fetches it; **Restore from a backup
  file** accepts it too.

The workbook is the source of truth for cards and counts. Never edit either JSON to make
numbers agree; fix the workbook and rebuild.

## Inputs
- The latest `Treys MtG Master vN.xlsx` (highest N; ask if two candidates share a date).
  In a web session it arrives as an upload; on the desktop it lives in
  `C:\Users\robmi\OneDrive\Desktop\Magic the Gathering\`. Read only.
- Sheets the importer reads, all by header name, so column letters may move:
  - **Master** (header row is the one whose first cell is `Card`): `Card`, `Own` (P),
    `Buy Count` (Q), `Ordered` (S), `$ Each` (T), `D1-T…D6-T` (W–AB, each sums to 100),
    `D1-A…D6-A` (AE–AJ, what is physically in each box). Rows with nothing in any of those
    are ignored. Two rows that are printings of one card (a flavor-name print beside the
    original) are added together.
  - **Deck Lists**: the row per deck whose `Status` is `Commander`.
  - **Upgrade Path**: every row naming a tier, a card and a deck (`Tier, MV, Buy this, $,
    Own?, Deck, Comes in for, Why`).
  - **CrankMagic Plans** (optional): `Deck, Kind, Card, Why`; Kind is `Option` (in the
    hundred, first to swap out) or `Planned` (coming in, not in the hundred). Without it the
    lists are carried over from the committed file; an `--adjust plans.json` file
    (`{"D4":{"options":[{"card","why"}],"planned":[...]}}`) overrides both for the decks it
    names — that is how Rob's pasted Adding / Removing tables go in.
- `data/source/CrankMagic-Load-Live-template.xlsx` is the same layout with nothing on it
  (`Master`, `Decks` with Deck/Commander/Name, `CrankMagic Plans`), for when the
  collection is kept somewhere other than the Master.
- Repo tools: `tools/build-live-load.mjs` (workbook → live-load; needs `python3` with
  openpyxl for `tools/read-sheet-rows.py`), `tools/scryfall-cache.mjs` (rules text, prices
  and images for the ~200 cards the bundled catalog knows only by name), `tools/build-live-
  state.mjs` (live-load → live-state; `--check` writes nothing; `--scryfall cache.json`
  enriches), `tests/live-load.mjs`.

## Procedure
1. Confirm every `Dn-T` column sums to 100 (Master row 2 shows the sums). The importer
   stops on anything else and names the deck; do not work around it.
2. In the repo (`git clone https://github.com/minorrob/mtg-deck-matrix.git`, branch
   `main`, or the working branch Rob names), copy the workbook to
   `data/source/<its name>.xlsx` so the build is reproducible, then:
   ```sh
   node tools/build-live-load.mjs data/source/<workbook>.xlsx --check [--adjust plans.json]
   ```
   Read the report: the notes (received orders dropped from `ordered`, orders kept in flight
   with no deck home, options that are not in the hundred, planned cards already in it or
   already on the Upgrade Path) and the **per-deck delta** against the committed file. Every
   difference must trace to a change Rob made or asked for; an unexpected one (a box that
   changed when he reported no pulls) goes back to him before continuing.
3. Run it again without `--check` to write `data/live-load.json`. Then
   ```sh
   node tools/scryfall-cache.mjs --out /tmp/scryfall-cache.json   # best effort; skip offline
   node tools/build-live-state.mjs --scryfall /tmp/scryfall-cache.json
   ```
   Expect `No issues.` and all six decks `final`. Rules the build enforces: `ordered` is only
   copies still in flight (the Master's Ordered column is a history that includes received
   orders); `buy` equals the model's derived shortfalls; no land is targeted by more decks
   than copies owned; double-faced cards resolve to the full `Front // Back` name.
4. `node tests/live-load.mjs`, `node tests/data-integrity.mjs`, `node tests/asset-versions.mjs`
   (and `bash runtests.sh -q` when anything but data changed).
5. Headless check when anything beyond data changed: serve the repo, open `index.html`,
   User Functions → Load Live, wrong password rejected, `treycmload1` → review → replace;
   six decks on My Decks; the deck page's *Working list* shows the options and planned
   cards; no console errors other than blocked Scryfall calls.
6. Commit `data/live-load.json`, `data/live-state.json`, the workbook under `data/source/`
   and any tool change, with a message that states the workbook version and the card-level
   delta, ending with the session's attribution lines. In a web session with push access:
   push, open a draft PR, merge it when the gates are green (Rob's standing instruction).
   On the desktop without push access: `git bundle create load-live.bundle <base>..HEAD`
   plus `git format-patch`, into `Desktop\Magic the Gathering\CrankMagic Load Live\`, with
   `CLAUDE-CODE-PROMPT.md` updated (pull the bundle, verify, push, PR, merge) unless Rob
   says he will commit himself.
7. Report in one short table: decks · owned copies · in boxes · ordered · to buy ($) ·
   upgrades · options · planned, then the per-deck delta. Remind him a cached browser needs
   one hard refresh before the new state is served, and that the in-box strays (cards
   physically in a box that the target no longer lists) show as *Bench · From the Dn box*
   with a note until he pulls them.

## The manual button, without a session
GitHub → **Actions → Load Live → Run workflow** does steps 2–4 and 6 on the newest
`data/source/*Master*.xlsx` (or the path given) and commits both files to `main`. Nothing
runs on its own; uploading a workbook (GitHub → Add file → Upload files into `data/source/`)
and pressing Run is the whole refresh when no adjustments are needed.

## Standing rules from Rob
- Actual columns (`D1-A..D6-A`, `B-A`) are his; never write them, and prove they are
  unchanged whenever a workbook is rebuilt (compare against the last confirmed version).
- Base mana may be replaced with non-base mana if already present; never buy a land the
  bench already has.
- Purchases: nothing over $30 a card, total remaining under $100; every price is checked
  live before it goes on a sheet.
- Confidence is stated by layer and "final" means until tested in use.
