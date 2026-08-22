"""Normalize the two legacy single-file apps into small JSON data files.

Run from the repository root. The source HTML files live one directory above
this checkout so the published repository stays free of embedded image data.
"""

from __future__ import annotations

import json
import re
from copy import deepcopy
from pathlib import Path

from lxml import html


ROOT = Path(__file__).resolve().parents[1]
SOURCE_ROOT = ROOT.parent
DATA_DIR = ROOT / "data"
COMPARE_SOURCE = SOURCE_ROOT / "MtG - Side-by-Side.html"
BUY_SOURCE = SOURCE_ROOT / "MtG - Deck Shopping Plan.html"


def clean_text(values) -> str:
    if not isinstance(values, str):
        values = " ".join(values)
    return " ".join(values.replace("\ufffd", "—").split())


def class_xpath(name: str) -> str:
    return f"contains(concat(' ',normalize-space(@class),' '),' {name} ')"


def first_text(node, xpath: str, default: str = "") -> str:
    found = node.xpath(xpath)
    if not found:
        return default
    first = found[0]
    if isinstance(first, str):
        return clean_text(first)
    return clean_text(first.xpath(".//text()"))


def stage_values(cell, class_name: str, extractor) -> list:
    values = []
    for stage in (1, 2, 3):
        nodes = cell.xpath(
            f".//*[{class_xpath(class_name)} and {class_xpath(f's{stage}')}]"
        )
        values.append(extractor(nodes[0]) if nodes else None)
    return values


def score_rows(node) -> list[dict]:
    rows = []
    for row in node.xpath(f".//*[{class_xpath('fr')}]"):
        label = first_text(row, f".//*[{class_xpath('fl')}]")
        if not label:
            continue
        rows.append(
            {
                "label": label,
                "score": len(
                    row.xpath(
                        f".//*[{class_xpath('d')} and {class_xpath('on')}]"
                    )
                ),
                "extra": first_text(
                    row,
                    f".//*[{class_xpath('pct')} or {class_xpath('gx')}]",
                ),
                "description": clean_text(row.get("title", "")),
            }
        )
    return rows


def safe_fragment(node, *, remove_images: bool = False) -> str:
    """Keep authored prose/tables while removing legacy scripts and handlers."""
    fragment = deepcopy(node)
    remove = ".//script | .//button"
    if remove_images:
        remove += " | .//img"
    for child in fragment.xpath(remove):
        parent = child.getparent()
        if parent is not None:
            parent.remove(child)
    for element in fragment.iter():
        for attr in list(element.attrib):
            if attr.lower().startswith("on") or attr.lower() == "id":
                del element.attrib[attr]
    return html.tostring(fragment, encoding="unicode", method="html").replace(
        "\ufffd", "—"
    )


def extract_compare() -> dict:
    document = html.parse(str(COMPARE_SOURCE))
    decks = []
    variants = []

    deck_nodes = document.xpath(f"//details[{class_xpath('deckrow')}]")
    for deck_index, deck in enumerate(deck_nodes, 1):
        title = first_text(deck, "./summary//*[contains(@class,'dt')]")
        if not title:
            title = first_text(deck, "./summary")
            title = re.sub(r"\s*5 variants\s*[▶›]?\s*$", "", title)
        objective = first_text(deck, f".//*[{class_xpath('obj')}]")
        decks.append({"id": deck_index, "title": title, "objective": objective})

        checks = deck.xpath(f".//input[{class_xpath('vsel')}]")
        for order, checkbox in enumerate(checks, 1):
            cell = checkbox.xpath(
                f"ancestor::div[{class_xpath('cell')}][1]"
            )[0]
            commander_block = cell.xpath(f".//*[{class_xpath('cmdtext')}][1]")[0]
            commander_name = first_text(commander_block, ".//b[1]")
            mana_cost = first_text(commander_block, f".//*[{class_xpath('mc')}]")
            type_line = first_text(commander_block, f".//*[{class_xpath('ty')}]")
            tags = [
                clean_text(node.xpath(".//text()"))
                for node in cell.xpath(f".//*[{class_xpath('ctag')}]")
            ]

            summaries = stage_values(
                cell,
                "sum",
                lambda node: [clean_text(li.xpath(".//text()")) for li in node.xpath("./li")],
            )
            stage_notes = stage_values(
                cell, "stagenote", lambda node: clean_text(node.xpath(".//text()"))
            )
            costs = []
            for stage in (1, 2, 3):
                nodes = cell.xpath(
                    f".//*[{class_xpath('cost')} and ancestor::*[{class_xpath(f's{stage}')}]]"
                )
                costs.append(clean_text(nodes[0].xpath(".//text()")) if nodes else None)
            brackets = stage_values(
                cell,
                "bkt",
                lambda node: {
                    "label": first_text(node, f".//*[{class_xpath('bnum')}]") or clean_text(node.xpath(".//text()")),
                    "gameChangers": first_text(node, f".//*[{class_xpath('bgc')}]") or "0 GC",
                    "description": clean_text(node.get("title", "")),
                },
            )
            ranks = []
            facts = []
            rarity = []
            for stage in (1, 2, 3):
                ribbon_text = first_text(
                    cell,
                    f".//*[{class_xpath('picks')}]"
                    f"//*[{class_xpath(f's{stage}')}]")
                rank_match = re.search(r"\b([1-5])\b", ribbon_text)
                ranks.append(int(rank_match.group(1)) if rank_match else order)

                metaline = cell.xpath(
                    f".//*[{class_xpath('metaline')} and {class_xpath(f's{stage}')}]"
                )
                fact = metaline[0] if metaline else None
                facts.append(
                    {
                        "availability": first_text(
                            fact, f".//*[{class_xpath('pill')}]"
                        ) if fact is not None else "",
                        "budget": first_text(
                            fact, f".//*[{class_xpath('bud')}]"
                        ) if fact is not None else "",
                        "costNote": clean_text(
                            (fact.xpath(f".//*[{class_xpath('cost')}]")[0].get("title", "")
                             if fact is not None and fact.xpath(f".//*[{class_xpath('cost')}]")
                             else "")
                        ),
                    }
                )
                rarity_nodes = cell.xpath(
                    f".//*[{class_xpath('rarity')} and {class_xpath(f's{stage}')}]"
                )
                rarity_node = rarity_nodes[0] if rarity_nodes else None
                rarity.append(
                    {
                        "percent": first_text(
                            rarity_node, f".//*[{class_xpath('rpct')}]"
                        ) if rarity_node is not None else "",
                        "label": first_text(
                            rarity_node, f".//*[{class_xpath('rtag')}]"
                        ) if rarity_node is not None else "",
                        "description": clean_text(
                            rarity_node.get("title", "") if rarity_node is not None else ""
                        ),
                    }
                )

            score_blocks = cell.xpath(f".//*[{class_xpath('scoreblk')}]")
            stage_scores = []
            for block in score_blocks[:2]:
                stage_scores.append(
                    [
                        score_rows(
                            (block.xpath(
                                f".//*[{class_xpath(f's{stage}')}]"
                            ) or [block])[0]
                        )
                        for stage in (1, 2, 3)
                    ]
                )
            growth = score_rows(score_blocks[2]) if len(score_blocks) > 2 else []

            variant_id = checkbox.get("data-key")
            detail_nodes = document.xpath(
                f"//*[@id='m-{variant_id}']/*[{class_xpath('mbox')}][1]"
            )

            variants.append(
                {
                    "id": variant_id,
                    "deckId": int(checkbox.get("data-deck", deck_index)),
                    "order": order,
                    "name": first_text(cell, ".//h3[1]") or clean_text(checkbox.get("data-name", "")),
                    "commander": commander_name,
                    "manaCost": mana_cost,
                    "typeLine": type_line,
                    "tags": tags,
                    "summaries": summaries,
                    "stageNotes": stage_notes,
                    "costs": costs,
                    "brackets": brackets,
                    "ranks": ranks,
                    "facts": facts,
                    "rarity": rarity,
                    "scores": {
                        "playstyle": stage_scores[0] if stage_scores else [[], [], []],
                        "engine": stage_scores[1] if len(stage_scores) > 1 else [[], [], []],
                        "growth": growth,
                    },
                    "detailHtml": safe_fragment(detail_nodes[0], remove_images=True)
                    if detail_nodes
                    else "",
                    "image": "https://api.scryfall.com/cards/named?format=image&version=normal&fuzzy="
                    + commander_name.replace(" ", "+"),
                }
            )

    if len(decks) != 6 or len(variants) != 30:
        raise RuntimeError(
            f"Expected 6 decks and 30 variants; found {len(decks)} and {len(variants)}"
        )
    return {"decks": decks, "variants": variants}


def extract_all_data(source: str) -> dict:
    match = re.search(r"<script>window\.ALL_DATA = (.*?);</script>", source, re.S)
    if not match:
        raise RuntimeError("Could not find window.ALL_DATA in the shopping source")
    return json.loads(match.group(1))


def card_view(key: str, card: dict, category: str) -> dict:
    price = card.get("price")
    purpose = card.get("alt_why") or card.get("why") or card.get("why_optional") or ""
    purpose = clean_text(purpose)
    purpose = re.sub(r"^From the .*?\.\s*", "", purpose)
    return {
        "id": key,
        "name": clean_text(card.get("name", key)),
        "quantity": card.get("qty", 1),
        "manaCost": clean_text(card.get("mana_cost", "")),
        "typeLine": clean_text(card.get("type_line", "")),
        "price": price,
        "ceiling": card.get("ceiling"),
        "category": category,
        "purpose": purpose,
        "replaces": clean_text(card.get("replaces_label", "")),
        "gameChanger": bool(card.get("game_changer")),
        "stage": clean_text(card.get("stage", "")),
        "tags": [clean_text(tag) for tag in card.get("tags", [])],
        "why": clean_text(card.get("why", "")),
        "whyPrimary": clean_text(card.get("why_primary", "")),
        "whyOptional": clean_text(card.get("why_optional", "")),
        "alternateReason": clean_text(card.get("alt_why", "")),
        "alternateTradeoff": clean_text(card.get("alt_why_not", "")),
        "whereToBuy": clean_text(card.get("where_to_buy", "")),
        "tcgplayerUrl": clean_text(card.get("tcgplayer_url", "")),
        "brief": {
            "power": (card.get("brief") or {}).get("power"),
            "ease": (card.get("brief") or {}).get("ease"),
            "fun": (card.get("brief") or {}).get("fun"),
            "value": clean_text((card.get("brief") or {}).get("value", "")),
            "fit": clean_text((card.get("brief") or {}).get("fit", "")),
        },
        "image": "https://api.scryfall.com/cards/named?format=image&version=small&fuzzy="
        + clean_text(card.get("name", key)).replace(" ", "+"),
    }


def extract_buy_plans() -> dict:
    source = BUY_SOURCE.read_text(encoding="utf-8", errors="replace")
    all_data = extract_all_data(source)
    variant_map = {1: "1o", 2: "2c", 3: "3e", 4: "4c", 5: "5o", 6: "6c"}
    plans = {}
    summary_by_id = {
        int(deck["id"]): deck for deck in all_data.get("summary", {}).get("decks", [])
    }

    for deck_id in range(1, 7):
        raw = all_data[f"d{deck_id}"]
        cards = raw.get("cards", {})
        required = []
        enhance = []
        max_options = []
        seen = set()

        for key in raw.get("adds_order", []):
            card = cards.get(key)
            if not card or not card.get("is_purchase_item") or key in seen:
                continue
            seen.add(key)
            price = card.get("price") or 0
            if card.get("stage") == "Maxed" or (card.get("optional") and price > 10):
                max_options.append(card_view(key, card, "max"))
            elif card.get("optional"):
                enhance.append(card_view(key, card, "enhance"))
            else:
                required.append(card_view(key, card, "upgrade"))

        for base_key, alt_keys in raw.get("alternates", {}).items():
            for key in alt_keys:
                card = cards.get(key)
                if not card or not card.get("is_purchase_item") or key in seen:
                    continue
                seen.add(key)
                price = card.get("price") or 0
                category = "max" if card.get("game_changer") or price > 10 or card.get("stage") == "Maxed" else "enhance"
                view = card_view(key, card, category)
                if not view["replaces"] and base_key in cards:
                    view["replaces"] = "Replaces " + clean_text(cards[base_key].get("name", base_key))
                (max_options if category == "max" else enhance).append(view)

        precon = raw.get("precon") or {}
        precon_name = clean_text(precon.get("name") or raw.get("deck_name") or "Deck shell")
        precon_price = precon.get("price") or precon.get("target_price")
        precon_item = {
            "id": f"precon-{deck_id}",
            "name": precon_name,
            "quantity": 1,
            "price": precon_price,
            "ceiling": precon.get("ceiling") or raw.get("budget_ceiling"),
            "category": "precon",
            "purpose": f"Starting shell for {clean_text(raw.get('deck_name', 'this build'))}",
            "typeLine": "Preconstructed deck / starting shell",
            "manaCost": "",
            "gameChanger": False,
            "image": "https://api.scryfall.com/cards/named?format=image&version=small&fuzzy="
            + clean_text(raw.get("commander_name", "")).replace(" ", "+"),
        }

        plans[variant_map[deck_id]] = {
            "variantId": variant_map[deck_id],
            "deckId": deck_id,
            "deckName": clean_text(raw.get("deck_name", "")),
            "commander": clean_text(raw.get("commander_name", "")),
            "budgetLabel": clean_text(raw.get("budget_tier_label", "")),
            "bracketLabel": clean_text(raw.get("bracket_label", "")),
            "priorityLabel": clean_text(raw.get("priority_label", "")),
            "planHtml": safe_fragment(
                html.fragment_fromstring(
                    summary_by_id.get(deck_id, {}).get("info_html", "<div></div>"),
                    create_parent="div",
                ),
                remove_images=True,
            ),
            "precon": precon_item,
            "required": required,
            "enhance": enhance,
            "max": max_options,
        }

    return {"profileVariantIds": list(plans), "plans": plans}


def write_json(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )


def main() -> None:
    write_json(DATA_DIR / "variants.json", extract_compare())
    write_json(DATA_DIR / "buy-plans.json", extract_buy_plans())
    print("Wrote data/variants.json and data/buy-plans.json")


if __name__ == "__main__":
    main()
