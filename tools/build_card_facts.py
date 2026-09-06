"""Printed card facts for every card the six decks or the bench can show.

The viewer opens a card popup with the real card image on the front and its
printed text on the back, so it needs Scryfall facts. It cannot use
data/cards.json directly for two reasons: that file is 2.7 MB, which is a lot to
push at a phone, and it only covers 358 of the 579 names the Deck Master uses --
the six real decks run plenty of cards the fifty variants never did.

So this writes a trimmed catalog: only the names in master-v2, only the fields
the popup shows. Local catalog first, Scryfall for the rest.

"The names in master-v2" is not only its card rows. Each deck also carries an
Upgrades and a B3 sheet, and the viewer renders both as clickable card links --
a B3 add is usually a card he does not own yet, so it has no row of its own.
Twenty such names had no facts at all and their popups opened empty. They are
collected here alongside the rows.

Scryfall is reachable from this container with curl only -- urllib and requests
both fail on the proxy -- so the fetch shells out.
"""
import json, os, re, subprocess, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
BATCH = 75          # Scryfall's documented cap for /cards/collection


def key(name):
    return re.sub(r"[^a-z0-9]+", " ", str(name).split(" // ")[0].lower()).strip()


def sized(url, size):
    """Scryfall image URLs differ only by the size segment."""
    return re.sub(r"/(small|normal|large|png|art_crop|border_crop)/", "/" + size + "/", url or "")


def from_local(entry):
    img = entry.get("image") or ""
    return {
        "manaCost": entry.get("manaCost") or "",
        "typeLine": entry.get("typeLine") or "",
        "oracleText": entry.get("oracleText") or "",
        "keywords": entry.get("keywords") or [],
        "colorIdentity": entry.get("colorIdentity") or [],
        "rarity": entry.get("rarity") or "",
        "setName": entry.get("setName") or "",
        "setCode": entry.get("setCode") or "",
        "small": img,
        "normal": sized(img, "normal"),
        "price": entry.get("price"),
        "url": entry.get("tcgplayerUrl") or "",
    }


def face_of(card):
    """A double-faced card carries its text and art on card_faces, not the root."""
    faces = card.get("card_faces") or []
    if faces and not card.get("image_uris"):
        return faces[0]
    return card


def from_scryfall(card):
    face = face_of(card)
    imgs = face.get("image_uris") or card.get("image_uris") or {}
    prices = card.get("prices") or {}
    usd = prices.get("usd") or prices.get("usd_foil")
    return {
        "manaCost": face.get("mana_cost") or card.get("mana_cost") or "",
        "typeLine": card.get("type_line") or face.get("type_line") or "",
        "oracleText": "\n//\n".join(
            f.get("oracle_text") or "" for f in (card.get("card_faces") or [card])
        ).strip() or (card.get("oracle_text") or ""),
        "keywords": card.get("keywords") or [],
        "colorIdentity": card.get("color_identity") or [],
        "rarity": card.get("rarity") or "",
        "setName": card.get("set_name") or "",
        "setCode": (card.get("set") or "").upper(),
        "small": imgs.get("small") or "",
        "normal": imgs.get("normal") or imgs.get("large") or "",
        "price": float(usd) if usd else None,
        "url": card.get("scryfall_uri") or "",
        "power": face.get("power"),
        "toughness": face.get("toughness"),
        "loyalty": face.get("loyalty"),
    }


def fetch(names):
    """POST /cards/collection, BATCH identifiers at a time."""
    found, missing = {}, []
    for i in range(0, len(names), BATCH):
        chunk = names[i:i + BATCH]
        body = json.dumps({"identifiers": [{"name": n} for n in chunk]})
        out = subprocess.run(
            ["curl", "-sS", "-X", "POST", "https://api.scryfall.com/cards/collection",
             "-H", "Content-Type: application/json", "--data-binary", "@-"],
            input=body, capture_output=True, text=True, timeout=120)
        if out.returncode:
            print("  curl failed: " + out.stderr.strip()[:200], file=sys.stderr)
            missing += chunk
            continue
        payload = json.loads(out.stdout)
        for card in payload.get("data", []):
            found[key(card["name"])] = card
            for face in card.get("card_faces") or []:
                found.setdefault(key(face.get("name", "")), card)
        for nf in payload.get("not_found", []):
            missing.append(nf.get("name", "?"))
        print("  fetched {0}/{1}".format(min(i + BATCH, len(names)), len(names)))
        time.sleep(0.15)
    return found, missing


def wanted(master):
    """Every name the viewer can turn into a card link, in a stable order."""
    names, seen = [], set()

    def add(name):
        if not name:
            return
        k = key(name)
        if k in seen:
            return
        seen.add(k)
        names.append(name)

    for card in master["cards"]:
        add(card["name"])
    # The swap sheets name cards on both sides. The add is the one that usually
    # has no row -- it is not in the box yet -- but a replaced card can be
    # missing too when the swap predates the row it displaced.
    for deck in master["decks"]:
        for entry in deck.get("upgrades") or []:
            add(entry.get("card"))
            add(entry.get("replaces"))
        for entry in deck.get("b3") or []:
            add(entry.get("add"))
            add(entry.get("replaces"))
    return names


def main():
    master = json.load(open(os.path.join(ROOT, "data", "master-v2.json"), encoding="utf-8"))
    catalog = json.load(open(os.path.join(ROOT, "data", "cards.json"), encoding="utf-8"))["cards"]
    local = {key(v["name"]): v for v in catalog}

    names = wanted(master)
    facts, need = {}, []
    for name in names:
        hit = local.get(key(name))
        if hit:
            facts[name] = from_local(hit)
        else:
            need.append(name)

    print("{0} names ({1} card rows, {2} from the swap sheets): {3} from the "
          "local catalog, {4} to fetch".format(
              len(names), len(master["cards"]), len(names) - len(master["cards"]),
              len(facts), len(need)))
    if need:
        found, missing = fetch(need)
        for name in need:
            card = found.get(key(name))
            if card:
                facts[name] = from_scryfall(card)
        if missing:
            print("  not found on Scryfall ({0}): {1}".format(
                len(missing), ", ".join(sorted(set(missing))[:12])))

    # Every name the viewer can link must resolve, or a popup opens empty. A
    # gap here is a data error, not a cosmetic one, so it stops the run.
    unresolved = [n for n in names if n not in facts]
    if unresolved:
        raise SystemExit("no facts for {0} name(s): {1}".format(
            len(unresolved), ", ".join(sorted(unresolved))))

    # A card with no image is worse than useless in a picture popup, so say how
    # many there are rather than letting them fail silently in the browser.
    blank = sorted(n for n, f in facts.items() if not f.get("normal"))
    dest = os.path.join(ROOT, "data", "card-facts.json")
    with open(dest, "w", encoding="utf-8") as fh:
        json.dump({"generatedAt": __import__("datetime").datetime.now(
            __import__("datetime").timezone.utc).isoformat(timespec="seconds"),
            "cards": facts}, fh, ensure_ascii=False, separators=(",", ":"))
        fh.write("\n")
    size = os.path.getsize(dest) / 1024
    print("wrote {0}  ({1} cards, {2:.0f} KB, {3} without an image)".format(
        dest, len(facts), size, len(blank)))
    if blank:
        print("  no image: " + ", ".join(blank[:10]))


if __name__ == "__main__":
    main()
