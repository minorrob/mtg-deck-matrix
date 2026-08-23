#!/usr/bin/env python3
"""Import the Summary sheet's real per-build simulation results from
MTGDeckDecisionMatrix.xlsx into data/simulation-summary.json.

This is additive to Phase 1's tools/import_budget_plan.py (which reads each deck
sheet's own Base..Alt Max columns): the Summary sheet instead reports, per [deck,
build], whether that specific build was independently simulated at all, and if so
how many games, its win rate, and whether the gain held up on a holdout the
optimizer never tuned against. Base/Enhance/Max are never simulated (they are the
site's own published lists) -- only Tuned, Tuned-2, Enhance-2, Max-2, Fun Tuned,
Fun Max, Alt Tuned, and Alt Max carry real numbers.

Reads data/source/MTGDeckDecisionMatrix.xlsx (python3 stdlib only -- no openpyxl).
Re-run is idempotent: it always rewrites the whole output file from scratch.
"""
import json
import re
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WORKBOOK = ROOT / "data" / "source" / "MTGDeckDecisionMatrix.xlsx"
OUTPUT_PATH = ROOT / "data" / "simulation-summary.json"

NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
      "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships"}

# Which engine generation measured each build -- not derivable from the sheet's own
# "Group" column alone (Tuned and Tuned-2/Enhance-2/Max-2 share the "as published" vs.
# "Monte Carlo" grouping, but Tuned itself is v1 while the -2 rungs it groups with are
# ALSO v1 -- it's Fun/Alt, a different two groups, that moved to v2.1). Hardcoded from
# the Summary sheet's own row-3 methodology note, quoted verbatim in the Notes-sheet-
# derived engine caveat text below -- do not derive this from "Group" or "Verdict".
BUILD_ENGINE = {
    "Tuned": "v1", "Tuned-2": "v1", "Enhance-2": "v1", "Max-2": "v1",
    "Fun Tuned": "v2.1", "Fun Max": "v2.1", "Alt Tuned": "v2.1", "Alt Max": "v2.1",
}

ENGINE_NOTES = {
    "v1": "Measured on the v1 engine: three opponent archetypes, win rate weighted 0.40 of the composite score.",
    "v2.1": "Measured on the v2.1 engine: nine opponent archetypes, win rate weighted 0.30 with 0.10 given to a fun/participation signal, plus three combat-modeling fixes (toughness-as-damage creatures, planeswalker commanders, dual-color lands). v2.1 scores are systematically lower because the opponent field is harder -- that is not the deck getting worse.",
}
ENGINE_BOUNDARY_NOTE = "Tuned/Tuned-2/Enhance-2/Max-2 were measured on the v1 engine; Fun and Alt builds ran on v2.1, a harder opponent field with different scoring weights. Never compare a Score or Win% across that boundary -- only within one engine generation."


def cellval(c):
    if c is None:
        return ""
    if c.get("t") == "inlineStr":
        is_el = c.find("m:is", NS)
        if is_el is not None:
            return "".join(t.text or "" for t in is_el.findall(".//m:t", NS))
        return ""
    v = c.find("m:v", NS)
    return v.text if v is not None else ""


def colidx(col):
    n = 0
    for ch in col:
        n = n * 26 + (ord(ch) - ord("A") + 1)
    return n - 1


class Workbook:
    def __init__(self, path):
        self.z = zipfile.ZipFile(path)
        wb_root = ET.fromstring(self.z.read("xl/workbook.xml"))
        self.name_to_rid = {
            s.get("name"): s.get("{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id")
            for s in wb_root.find("m:sheets", NS)
        }
        rels_root = ET.fromstring(self.z.read("xl/_rels/workbook.xml.rels"))
        self.rid_to_target = {rel.get("Id"): rel.get("Target") for rel in rels_root}

    def _sheet_path(self, name):
        target = self.rid_to_target[self.name_to_rid[name]]
        t = target.lstrip("/")
        return t if t.startswith("xl/") else "xl/" + t

    def read_sheet(self, name):
        raw = self.z.read(self._sheet_path(name))
        root = ET.fromstring(raw)
        sheet_data = root.find("m:sheetData", NS)
        rows = {}
        for row in sheet_data:
            rn = int(row.get("r"))
            cells = {}
            for c in row:
                ref = c.get("r", "")
                col = "".join(ch for ch in ref if ch.isalpha())
                cells[colidx(col)] = cellval(c)
            if cells:
                width = max(cells.keys()) + 1
                r = [""] * width
                for ci, val in cells.items():
                    r[ci] = val
                rows[rn] = r
        return rows


def num(value):
    value = str(value).strip()
    if not value:
        return None
    try:
        f = float(value)
        return int(f) if f.is_integer() else round(f, 4)
    except ValueError:
        return None


def deck_id_from_label(label):
    # "1o · Ancestral Bulwark" -> "1o"
    return label.split(" ")[0].strip()


def main():
    wb = Workbook(WORKBOOK)
    rows = wb.read_sheet("Summary")
    header_rn = next(rn for rn, r in rows.items() if r and str(r[0]).strip() == "Deck")

    builds = {}
    alt_cases = {}
    for rn in sorted(rows):
        if rn <= header_rn:
            continue
        r = rows[rn]
        if not r or not str(r[0]).strip():
            continue
        col0 = str(r[0]).strip()

        if col0 == "Deck":
            # The second sub-table (row 73) re-declares its own header with the same
            # column-0 label as the main table's header -- skip it as a header, not data.
            continue

        if " · " in col0:
            deck_id = deck_id_from_label(col0)
            # Two different tables share the "starts with a deck label" shape: the main
            # per-build metrics table (11 data columns after Build) and the alt-commander
            # comparison table (11 columns, but "Current commander" in column 1 instead of
            # a build name). Distinguish by whether column 1 is a known build name.
            build = str(r[1]).strip() if len(r) > 1 else ""
            if build in BUILD_ENGINE or build in {"Base", "Enhance", "Max"}:
                builds.setdefault(deck_id, {})[build] = {
                    "group": str(r[2]).strip() if len(r) > 2 else "",
                    "games": num(r[3]) if len(r) > 3 else None,
                    "holdoutGames": num(r[4]) if len(r) > 4 else None,
                    "score": num(r[5]) if len(r) > 5 else None,
                    "winPct": num(r[6]) if len(r) > 6 else None,
                    "funPct": num(r[7]) if len(r) > 7 else None,
                    "avgWinTurn": num(r[8]) if len(r) > 8 else None,
                    "cmdrTurn": num(r[9]) if len(r) > 9 else None,
                    "screwPct": num(r[10]) if len(r) > 10 else None,
                    "interaction": num(r[11]) if len(r) > 11 else None,
                    "verdict": str(r[12]).strip() if len(r) > 12 and str(r[12]).strip() else None,
                    "swaps": num(r[13]) if len(r) > 13 else None,
                    "engine": BUILD_ENGINE.get(build),
                    "note": str(r[14]).strip() if len(r) > 14 else "",
                }
            elif len(r) > 10:
                # Alt-commander comparison sub-table: Deck | Current commander | Score |
                # Rank | Alternative | Score | Rank | Candidates measured | Games each |
                # Price | The honest read
                alt_cases[deck_id] = {
                    "currentCommander": str(r[1]).strip(),
                    "currentScore": num(r[2]),
                    "currentRank": num(r[3]),
                    "altCommander": str(r[4]).strip(),
                    "altScore": num(r[5]),
                    "altRank": num(r[6]),
                    "candidatesMeasured": num(r[7]),
                    "gamesEach": num(r[8]),
                    "altPrice": num(r[9]),
                    "honestRead": str(r[10]).strip(),
                }

    if not builds or len(builds) != 6:
        raise SystemExit(f"Expected per-build metrics for 6 decks, got {len(builds)}: {sorted(builds)}")
    if sorted(alt_cases) != ["1o", "3e", "5o"]:
        raise SystemExit(f"Expected alt-commander cases for exactly 1o/3e/5o, got {sorted(alt_cases)}")
    for deck_id, deck_builds in builds.items():
        missing = {"Base", "Tuned", "Enhance", "Max", "Tuned-2", "Enhance-2", "Max-2", "Fun Tuned", "Fun Max"} - set(deck_builds)
        if missing:
            raise SystemExit(f"{deck_id}: missing expected builds in Summary sheet: {sorted(missing)}")

    output = {
        "engineNotes": ENGINE_NOTES,
        "engineBoundaryNote": ENGINE_BOUNDARY_NOTE,
        "builds": builds,
        "altCommanderCases": alt_cases,
    }
    OUTPUT_PATH.write_text(json.dumps(output, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Wrote {OUTPUT_PATH.relative_to(ROOT)}: {sum(len(v) for v in builds.values())} build rows across {len(builds)} decks, {len(alt_cases)} alt-commander cases.")


if __name__ == "__main__":
    main()
