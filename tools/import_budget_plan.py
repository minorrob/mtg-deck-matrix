#!/usr/bin/env python3
"""Import the Win/Fun/Alt-commander build-variant ladders from MTGDeckDecisionMatrix.xlsx
into data/buy-plans.json, and write tests/fixtures/budget-plan-configs.json for validation.

Reads data/source/MTGDeckDecisionMatrix.xlsx (python3 stdlib only -- no openpyxl).
Patches (wholesale-replaces) seven arrays per plan: tuned2, enhance2, max2, funTuned,
funMax, altTuned, altMax. Never touches startingShell/required/upgrade/enhance/max.

Re-run is idempotent: it always replaces the seven arrays from scratch.
"""
import json
import re
import sys
import zipfile
import xml.etree.ElementTree as ET
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WORKBOOK = ROOT / "data" / "source" / "MTGDeckDecisionMatrix.xlsx"
PLANS_PATH = ROOT / "data" / "buy-plans.json"
CARDS_PATH = ROOT / "data" / "cards.json"
FIXTURE_PATH = ROOT / "tests" / "fixtures" / "budget-plan-configs.json"

NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
      "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships"}

# Official Scryfall `is:gamechanger` list, snapshotted 2026-08-23 (53 cards). Re-fetch via
# `curl -sS "https://api.scryfall.com/cards/search?q=is%3Agamechanger&order=name&unique=cards"`
# before re-running this importer if a meaningful amount of time has passed and the list may
# have been revised -- see the mtg-deck-matrix planning notes for why this must never be
# guessed or inferred from the workbook's own (empty) Game Changer column.
GAME_CHANGERS = {
    "Ad Nauseam", "Ancient Tomb", "Aura Shards", "Biorhythm", "Bolas's Citadel",
    "Braids, Cabal Minion", "Chrome Mox", "Coalition Victory", "Consecrated Sphinx",
    "Crop Rotation", "Cyclonic Rift", "Demonic Tutor", "Drannith Magistrate",
    "Enlightened Tutor", "Farewell", "Field of the Dead", "Fierce Guardianship",
    "Force of Will", "Gaea's Cradle", "Gamble", "Gifts Ungiven", "Glacial Chasm",
    "Grand Arbiter Augustin IV", "Grim Monolith", "Humility", "Imperial Seal", "Intuition",
    "Jeska's Will", "Lion's Eye Diamond", "Mana Vault", "Mishra's Workshop", "Mox Diamond",
    "Mystical Tutor", "Narset, Parter of Veils", "Natural Order", "Necropotence",
    "Notion Thief", "Opposition Agent", "Orcish Bowmasters", "Panoptic Mirror",
    "Rhystic Study", "Seedborn Muse", "Serra's Sanctum", "Smothering Tithe",
    "Survival of the Fittest", "Teferi's Protection", "Tergrid, God of Fright",
    "Thassa's Oracle", "The One Ring", "The Tabernacle at Pendrell Vale",
    "Underworld Breach", "Vampiric Tutor", "Worldly Tutor",
}

DECK_SHEETS = {
    "1o": "1o Ancestral Bulwark",
    "2c": "2c Proliferate Council",
    "3e": "3e Golgari Land Engine",
    "4c": "4c Bant Walls",
    "5o": "5o Lorehold Spirit",
    "6f": "6f Sultai ETB Doubling",
}
ALT_DECKS = {"1o", "3e", "5o"}

# The alternative commander's name per deck -- confirmed structurally from each deck sheet's
# own row-2 context note ("alternative commander tested: X") and cross-checked against Rob's
# own naming. Used to identify the alt-commander item by NAME rather than by row/slot
# position: the workbook's row alignment for the Alt ladder does NOT keep the commander
# pinned to one row (confirmed empirically -- see fix_alt_commander_pairing below), so slot
# position cannot be trusted to find it.
ALT_COMMANDER_NAMES = {
    "1o": "Teneb, the Harvester",
    "3e": "Hazel of the Rootbloom",
    "5o": "Iroas, God of Victory",
}

LADDER_COLS = ["Base", "Tuned", "Enhance", "Max", "Tuned-2", "Enhance-2", "Max-2",
               "Fun Tuned", "Fun Max", "Alt Tuned", "Alt Max"]

# (category key, display stage label, source column, predecessor column)
CHAINS = [
    ("tuned2", "Tuned-2", "Tuned-2", "Base"),
    ("enhance2", "Enhance-2", "Enhance-2", "Tuned-2"),
    ("max2", "Maxxed-2", "Max-2", "Enhance-2"),
    ("funTuned", "Fun Tuned", "Fun Tuned", "Base"),
    ("funMax", "Fun Max", "Fun Max", "Fun Tuned"),
    ("altTuned", "Alt Tuned", "Alt Tuned", "Base"),
    ("altMax", "Alt Max", "Alt Max", "Alt Tuned"),
]
NEW_CATEGORY_KEYS = [c[0] for c in CHAINS]


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
        """Returns {row_number: [cell values, 0-indexed by column]}."""
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


def find_header_row(rows, marker):
    for rn, r in rows.items():
        if len(r) > 0 and str(r[0]).strip() == marker:
            return rn
    raise ValueError(f"Could not locate header row (column A == {marker!r})")


def data_rows(rows, header_rn):
    return sorted(rn for rn in rows if rn > header_rn and str(rows[rn][0]).strip().isdigit())


def slugify(name):
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return slug or "card"


def normalize_name(name):
    return name.strip()


def front_face(name):
    return name.split(" // ")[0].strip()


def is_game_changer(name):
    return front_face(name) in GAME_CHANGERS or normalize_name(name) in GAME_CHANGERS


def load_prices(wb):
    rows = wb.read_sheet("Prices")
    header_rn = find_header_row(rows, "Card")
    prices = {}
    for rn in sorted(rn for rn in rows if rn > header_rn):
        r = rows[rn]
        if len(r) >= 2 and r[0].strip():
            try:
                prices[normalize_name(r[0])] = float(r[1])
            except (ValueError, IndexError):
                pass
    return prices


def price_lookup(prices, name):
    if name in prices:
        return prices[name]
    ff = front_face(name)
    if ff in prices:
        return prices[ff]
    return None


def load_why_grid(wb, variant_id):
    """Returns {(slot_row_index_1based, column_name): why_text}."""
    sheet_name = f"_why_{variant_id}"
    rows = wb.read_sheet(sheet_name)
    header_rn = min(rows.keys())
    header = rows[header_rn]
    col_positions = {h.strip(): i for i, h in enumerate(header) if h.strip()}
    grid = {}
    for rn in sorted(rn for rn in rows if rn > header_rn):
        r = rows[rn]
        if not r or not str(r[0]).strip().isdigit():
            continue
        slot = int(r[0].strip())
        for col_name, ci in col_positions.items():
            if ci < len(r) and r[ci].strip():
                grid[(slot, col_name)] = r[ci].strip()
    return grid


def existing_ids(plan):
    ids = set()
    for key in ["startingShell", "required", "upgrade", "enhance", "max"]:
        for item in plan.get(key, []):
            ids.add(item["id"])
    return ids


def unique_id(base_slug, suffix, used_ids):
    candidate = f"{base_slug}-{suffix}"
    n = 2
    while candidate in used_ids:
        candidate = f"{base_slug}-{suffix}-{n}"
        n += 1
    used_ids.add(candidate)
    return candidate


ID_SUFFIXES = {
    "tuned2": "tuned-2", "enhance2": "enhance-2", "max2": "max-2",
    "funTuned": "fun-tuned", "funMax": "fun-max",
    "altTuned": "alt-tuned", "altMax": "alt-max",
}


def pair_chain_diffs(source_names, pred_names, pinned=None):
    """Pair the cards added going from pred_names to source_names (both 100-length,
    row-aligned lists) against the cards removed. Row adjacency is used only as a HINT for
    which specific why-text explains a pairing -- the only fully trustworthy signal is the
    aggregate name-multiset difference between the two full columns, confirmed this session
    to diverge from row adjacency whenever a configuration differs enough from its
    predecessor (the workbook's row layout does not reliably keep "same functional slot,
    same row" for a large diff -- proven for the three alt-commander swaps, and separately
    for several ordinary cards in the Fun Max / Alt Max rungs of multiple decks, where a
    naive per-row diff either lost a real inclusion or hard-coded a fabricated relationship
    between two cards that were never really connected).

    pinned: optional [(added_name, removed_name), ...] pairs that must be honored regardless
    of row position -- used for the alt-commander swap, a semantic requirement the aggregate
    diff alone has no way to know (see ALT_COMMANDER_NAMES).

    Returns a list of (added_name, replaces_name, source_row_index_or_None) tuples; a None
    row index means the pairing came from resolving a collision, not a trustworthy row, so
    no why-text should be attributed to it.
    """
    removed = Counter(pred_names)
    removed.subtract(Counter(source_names))
    removed = +removed  # drop zero/negative counts
    added = Counter(source_names)
    added.subtract(Counter(pred_names))
    added = +added

    pairs = []
    for added_name, removed_name in pinned or []:
        if added.get(added_name, 0) > 0 and removed.get(removed_name, 0) > 0:
            added[added_name] -= 1
            removed[removed_name] -= 1
            pairs.append((added_name, removed_name, None))

    for idx in range(len(source_names)):
        name, replaces = source_names[idx], pred_names[idx]
        if not name or name == replaces:
            continue
        if added.get(name, 0) > 0 and removed.get(replaces, 0) > 0:
            added[name] -= 1
            removed[replaces] -= 1
            pairs.append((name, replaces, idx))

    leftover_added = sorted(added.elements())
    leftover_removed = sorted(removed.elements())
    assert len(leftover_added) == len(leftover_removed), (
        f"added/removed counts must balance: {leftover_added} vs {leftover_removed}"
    )
    for name, replaces in zip(leftover_added, leftover_removed):
        pairs.append((name, replaces, None))

    return pairs


def build_deck_items(wb, variant_id, sheet_name, prices, plan, used_ids):
    rows = wb.read_sheet(sheet_name)
    header_rn = find_header_row(rows, "Slot")
    header = rows[header_rn]
    col_idx = {name: header.index(name) for name in LADDER_COLS if name in header}
    slots = data_rows(rows, header_rn)
    assert len(slots) == 100, f"{sheet_name}: expected 100 data rows, found {len(slots)}"
    slot_numbers = [int(rows[rn][0].strip()) for rn in slots]

    why_grid = load_why_grid(wb, variant_id)

    items_by_category = {k: [] for k in NEW_CATEGORY_KEYS}
    fixture_columns = {}
    for col_name in LADDER_COLS:
        if col_name not in col_idx:
            continue
        ci = col_idx[col_name]
        names = []
        for rn in slots:
            r = rows[rn]
            names.append(r[ci].strip() if ci < len(r) else "")
        fixture_columns[col_name] = names

    alt_commander_name = ALT_COMMANDER_NAMES.get(variant_id)

    for category, stage, source_col, pred_col in CHAINS:
        if source_col not in col_idx or pred_col not in col_idx:
            continue  # e.g. Alt columns absent on decks without an alt commander
        source_names = fixture_columns[source_col]
        pred_names = fixture_columns[pred_col]
        pinned = [(alt_commander_name, plan["commander"])] if (category == "altTuned" and alt_commander_name) else None
        for name, replaces, row_idx in pair_chain_diffs(source_names, pred_names, pinned):
            price = price_lookup(prices, name)
            if price is None:
                raise ValueError(f"{sheet_name}: no Prices-sheet entry for {name!r} ({category})")
            why = why_grid.get((slot_numbers[row_idx], source_col), "") if row_idx is not None else ""
            item_id = unique_id(slugify(name), ID_SUFFIXES[category], used_ids)
            item = {
                "id": item_id,
                "name": name,
                "quantity": 1,
                "price": price,
                "category": category,
                "stage": stage,
                "replaces": replaces,
                "gameChanger": is_game_changer(name),
                "tags": ["alt"] if category in ("altTuned", "altMax") else [],
                "purpose": why,
                "why": why,
                "whyPrimary": why,
                "whyOptional": "",
                "alternateReason": "",
                "alternateTradeoff": "",
                "whereToBuy": "Singles case",
                "brief": ({"fit": why} if why else {}),
            }
            if category == "altTuned" and name == alt_commander_name:
                item["isCommander"] = True
            items_by_category[category].append(item)

    return items_by_category, fixture_columns


def main():
    if not WORKBOOK.exists():
        print(f"ERROR: workbook not found at {WORKBOOK}", file=sys.stderr)
        sys.exit(1)

    wb = Workbook(WORKBOOK)
    prices = load_prices(wb)
    print(f"Loaded {len(prices)} prices from the Prices sheet.")

    plans_doc = json.loads(PLANS_PATH.read_text())
    fixtures = {}
    report = {}

    for variant_id, sheet_name in DECK_SHEETS.items():
        plan = plans_doc["plans"][variant_id]
        used_ids = existing_ids(plan)
        items_by_category, fixture_columns = build_deck_items(wb, variant_id, sheet_name, prices, plan, used_ids)

        for category in NEW_CATEGORY_KEYS:
            plan[category] = items_by_category[category]

        # Reconciliation fixture: for every ladder column, the exact expected 100-card
        # name multiset (T2), plus each generated item's expected root (T3).
        deck_fixture = {"columns": {}, "items": {}}
        for col_name, names in fixture_columns.items():
            multiset = {}
            for n in names:
                if n:
                    multiset[n] = multiset.get(n, 0) + 1
            deck_fixture["columns"][col_name] = multiset
        for category in NEW_CATEGORY_KEYS:
            deck_fixture["items"][category] = [
                {"id": it["id"], "name": it["name"], "replaces": it["replaces"], "price": it["price"]}
                for it in items_by_category[category]
            ]
        fixtures[variant_id] = deck_fixture

        report[variant_id] = {
            cat: {"count": len(items_by_category[cat]), "priceSum": round(sum(it["price"] for it in items_by_category[cat]), 2)}
            for cat in NEW_CATEGORY_KEYS
        }

    PLANS_PATH.write_text(json.dumps(plans_doc, indent=2) + "\n")
    FIXTURE_PATH.parent.mkdir(parents=True, exist_ok=True)
    FIXTURE_PATH.write_text(json.dumps(fixtures, indent=2) + "\n")

    print(json.dumps(report, indent=2))
    print(f"\nWrote {PLANS_PATH.relative_to(ROOT)}")
    print(f"Wrote {FIXTURE_PATH.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
