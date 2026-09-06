"""Recompute the `shape` block of every deck guide from the Master.

data/deck-guides.json is hand-written prose -- how a deck plays, what to keep,
what beats it -- but each guide also carries a `shape` block that is pure
arithmetic over the hundred: type counts, the mana curve, the average mana
value, and a tally of the Master's own purpose column.

Those numbers were typed in once and then went stale the moment the workbook
moved. The 2026-09-05 rebuild changed 14 to 30 cards in every one of the six
decks, so all six shape blocks were describing lists that no longer existed.
Prose has to be rewritten by hand; arithmetic does not, and it should never be
the part that drifts.

Type counts come from the card's real type line in data/card-facts.json, so an
Artifact Creature counts once, as a creature, and a Legendary Enchantment
Creature likewise. `lands` is the count the deck actually plays, and differs
from the roles tally's "Land" because a land with a job -- Krosan Verge, Ash
Barrens -- is filed under that job in the Master's purpose column.

    python3 tools/build_guide_shapes.py           # print the diff, write nothing
    python3 tools/build_guide_shapes.py --write   # rewrite data/deck-guides.json
"""
import json, os, re, sys
from collections import Counter

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

# Checked in the order a card's type line should be read: a Land that is also
# an Artifact is a land, and an Artifact Creature is a creature.
TYPES = [
    ("lands", "Land"),
    ("creatures", "Creature"),
    ("planeswalkers", "Planeswalker"),
    ("battles", "Battle"),
    ("instants", "Instant"),
    ("sorceries", "Sorcery"),
    ("artifacts", "Artifact"),
    ("enchantments", "Enchantment"),
]


def key(name):
    return re.sub(r"[^a-z0-9]+", " ", str(name).split(" // ")[0].lower()).strip()


def bucket(card, facts):
    """Which single type column this card counts in."""
    line = facts.get(key(card["name"]), {}).get("typeLine") or card.get("type") or ""
    # A modal double-faced card is the front face; that is the half you cast
    # from hand, and it is what the type line's first half names.
    front = line.split("//")[0]
    for field, word in TYPES:
        if word in front:
            return field
    return None


def shape_of(deck_id, rows, facts):
    counts = Counter()
    roles = Counter()
    curve = Counter()
    spells = 0
    value = 0.0
    for card in rows:
        copies = card["target"].get(deck_id, 0) or 0
        if not copies:
            continue
        field = bucket(card, facts)
        if field:
            counts[field] += copies
        roles[card.get("purpose") or "Unassigned"] += copies
        if field == "lands":
            continue
        spells += copies
        mv = float(card.get("mv") or 0)
        value += mv * copies
        # One column per mana value, 1 through 8+. A zero-cost spell has no
        # column of its own but still counts toward the average.
        slot = min(8, round(mv))
        if slot >= 1:
            curve[slot] += copies
    return {
        **{field: counts[field] for field, _unused in TYPES},
        "avgMv": round(value / spells, 2) if spells else 0,
        "curve": {str(n): curve[n] for n in range(1, 9)},
        "roles": dict(sorted(roles.items(), key=lambda kv: (-kv[1], kv[0]))),
    }


def main():
    write = "--write" in sys.argv[1:]
    master = json.load(open(os.path.join(ROOT, "data", "master-v2.json"), encoding="utf-8"))
    facts = {key(n): f for n, f in json.load(
        open(os.path.join(ROOT, "data", "card-facts.json"), encoding="utf-8"))["cards"].items()}
    guides_path = os.path.join(ROOT, "data", "deck-guides.json")
    guides = json.load(open(guides_path, encoding="utf-8"))

    by_id = {g["id"]: g for g in guides["decks"]}
    changed = 0
    for deck in master["decks"]:
        guide = by_id.get(deck["id"])
        if not guide:
            print("no guide for " + deck["id"])
            continue
        fresh = shape_of(deck["id"], master["cards"], facts)
        total = sum(fresh[field] for field, _unused in TYPES)
        if total != deck["targetCards"]:
            raise SystemExit("{0}: type counts sum to {1}, not {2} -- a card fell "
                             "through the type buckets".format(deck["id"], total, deck["targetCards"]))
        old = guide.get("shape") or {}
        for field, _unused in TYPES:
            if old.get(field) != fresh[field]:
                print("  {0} {1}: {2} -> {3}".format(deck["id"], field, old.get(field), fresh[field]))
        if old.get("avgMv") != fresh["avgMv"]:
            print("  {0} avgMv: {1} -> {2}".format(deck["id"], old.get("avgMv"), fresh["avgMv"]))
        if old != fresh:
            changed += 1
        guide["shape"] = fresh

    print("{0} of {1} shape blocks changed".format(changed, len(master["decks"])))
    if write:
        with open(guides_path, "w", encoding="utf-8") as fh:
            json.dump(guides, fh, ensure_ascii=False, indent=1)
            fh.write("\n")
        print("wrote " + guides_path)
    else:
        print("(nothing written; pass --write)")


if __name__ == "__main__":
    main()
