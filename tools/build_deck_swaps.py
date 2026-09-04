"""The optimiser's recommendations, trimmed to what the viewer shows.

six-optimized.json carries the full hundred at every spend tier, which is most
of its bulk and none of what a reader wants on a phone. The viewer needs the
swaps themselves: what comes out, what goes in, whether it is free, and what it
did. The full lists stay in the scratchpad deliverable for anyone rebuilding.

Deliberately NOT applied to data/master-v2.json. These are changes he has not
made yet -- writing them into the workbook import would have the app claim he
owns a deck he has not built.
"""
import json, os, sys, datetime

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC = ("/tmp/claude-0/-home-user-mtg-deck-matrix/1825fc4a-d31c-5251-901d-fc32772f1ae1"
       "/scratchpad/optimize/six-optimized.json")

KEEP_TERMS = ("objective", "performance", "friendly", "enjoyment", "cost",
              "winRate", "decisionDensity")


def terms(block):
    return {k: block[k] for k in KEEP_TERMS if k in block}


def main():
    src = sys.argv[1] if len(sys.argv) > 1 else SRC
    raw = json.load(open(src, encoding="utf-8"))
    decks = []
    for d in raw["decks"]:
        tiers = {}
        for name, tier in d["tiers"].items():
            tiers[name] = {"swapsTaken": tier["swapsTaken"], "spend": tier["spend"],
                           "terms": terms(tier["terms"]),
                           "lands": tier["terms"].get("metrics", {}).get("lands")}
        swaps = [{
            "order": s["order"], "tier": s["tier"], "out": s["out"], "in": s["in"],
            "source": s["source"], "price": s["price"],
            "free": s["source"] in ("bench", "owned") or not s["price"],
            "deltas": {k: v for k, v in s["deltas"].items()
                       if k in ("objective", "performance", "winRate", "decisionDensity")},
            "reason": s["reason"],
        } for s in d["swaps"]]
        decks.append({"id": d["id"], "label": d["label"], "commander": d["commander"],
                      "before": terms(d["before"]), "tiers": tiers, "swaps": swaps})

    out = {
        "schemaVersion": 1,
        "generatedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "source": os.path.basename(src),
        "measuredAt": raw.get("generatedAt"),
        "objective": raw.get("objective"),
        "confirmation": raw.get("confirmation"),
        "note": ("Recommendations, not applied. Every swap was confirmed at eight seeds "
                 "by twenty-five thousand games, paired against the list it changed, and "
                 "kept only when the difference beat twice the pooled standard error."),
        "engineArtefacts": raw.get("engineArtefacts"),
        "contention": raw.get("contention"),
        "decks": decks,
    }
    dest = os.path.join(ROOT, "data", "deck-swaps.json")
    with open(dest, "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, separators=(",", ":"))
        fh.write("\n")
    total = sum(len(d["swaps"]) for d in decks)
    free = sum(1 for d in decks for s in d["swaps"] if s["free"])
    print("wrote {0}  ({1:.0f} KB, {2} swaps across {3} decks, {4} of them free)".format(
        dest, os.path.getsize(dest) / 1024, total, len(decks), free))
    for d in decks:
        tier = d["tiers"].get("$15") or d["tiers"].get("$0")
        print("  {0} {1:<12} {2:>2} swaps  ${3:<6} performance {4:.2f} -> {5:.2f}  win {6:.1f}% -> {7:.1f}%".format(
            d["id"], d["label"], tier["swapsTaken"], tier["spend"],
            d["before"]["performance"], tier["terms"]["performance"],
            d["before"]["winRate"] * 100, tier["terms"]["winRate"] * 100))


if __name__ == "__main__":
    main()
