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


def decklist(value: str) -> list[tuple[str, int]]:
    """Parse the small audited decklists below without hiding card quantities."""
    result = []
    for line in value.strip().splitlines():
        match = re.match(r"^(\d+)\s+(.+)$", line.strip())
        result.append((match.group(2), int(match.group(1))) if match else (line.strip(), 1))
    return result


OFFICIAL_STARTING_SHELLS = {
    1: {
        "source": "https://magic.wizards.com/en/news/announcements/tarkir-dragonstorm-commander-decklists",
        "cards": decklist("""
Felothar the Steadfast
Betor, Ancestor's Voice
Protector of the Wastes
Reunion of the House
Jaws of Defeat
Tip the Scales
Will of the Abzan
Arbor Adherent
Canopy Gargantuan
Rampart Architect
Tree of Redemption
Ikra Shidiqi, the Usurper
Baldin, Century Herdmaster
Expel the Interlopers
Indomitable Ancients
Rhox Faithmender
Shalai, Voice of Plenty
Wakestone Gargoyle
Wall of Reverence
Welcoming Vampire
Zetalpa, Primal Dawn
Arasta of the Endless Web
Assault Formation
Hornet Nest
Seedborn Muse
Sylvan Caryatid
Towering Titan
Anguished Unmaking
Dragonlord Dromoka
Faeburrow Elder
Shadrix Silverquill
Sidar Kondo of Jamuraa
Colfenor's Urn
Staff of Compleation
Weathered Sentinels
Canopy Vista
Exotic Orchard
Fortified Village
Isolated Chapel
Overgrown Farmland
Sungrass Prairie
Sunpetal Grove
Temple of Malady
Temple of Plenty
Temple of Silence
Twilight Mire
Woodland Cemetery
Arcane Signet
Sol Ring
Command Tower
Nyx-Fleece Ram
Slaughter the Strong
Swords to Plowshares
Wall of Omens
Wingmantle Chaplain
Behind the Scenes
Blight Pile
Feed the Swarm
Infernal Grasp
Wall of Limbs
Arboreal Grazer
Axebane Guardian
Carven Caryatid
Evolving Wilds
Jaddi Offshoot
Overgrown Battlement
Sandsteppe Citadel
Tower Defense
Wall of Blossoms
Wall of Roots
Despark
Indulging Patrician
Crashing Drawbridge
Orzhov Signet
Selesnya Signet
Swiftfoot Boots
Walking Bulwark
Access Tunnel
Bojuka Bog
Deceptive Landscape
Path of Ancestry
Radiant Grove
6 Plains
5 Swamp
7 Forest
"""),
    },
    5: {
        "source": "https://magic.wizards.com/en/news/announcements/secrets-of-strixhaven-commander-decklists",
        "cards": decklist("""
Quintorius, History Chaser
Excava, the Risen Past
Lorehold Archivist
Augusta, Order Returned
Ceaseless Conflict
Vanguard of the Restless
Advanced Reconstruction
Fateful Tempest
Naktamun Lorespinner
Relic Retriever
Spirit of Resilience
Turbulent Steppe
Moonshaker Cavalry
Staff of the Storyteller
Wave of Reckoning
Fabled Passage
Angel of Indemnity
Ao, the Dawn Sky
Archaeomancer's Map
Claim Jumper
Drumbellower
Guardian of Faith
Guardian Scalelord
Karmic Guide
Monologue Tax
Remorseful Cleric
Selfless Spirit
Serra Paragon
Sevinne's Reclamation
Skyclave Apparition
Sun Titan
Tocasia's Welcome
Tragic Arrogance
White Orchid Phantom
Atsushi, the Blazing Sky
Conspiracy Theorist
Laelia, the Blade Reforged
Balefire Liege
Hofri Ghostforge
Quintorius, Loremaster
Venerable Warsinger
Bitterthorn, Nissa's Animus
Currency Converter
Battlefield Forge
Clifftop Retreat
Emeria, the Sky Ruin
Exotic Orchard
Furycalm Snarl
Glittering Massif
Lotus Field
Radiant Summit
Rugged Prairie
Sunscorched Divide
Temple of Triumph
Arcane Signet
Sol Ring
Command Tower
Primary Research
Seize the Spoils
Kirol, History Buff
Lorehold Charm
Fields of Strife
Terramorphic Expanse
Kami of Ancient Law
Path to Exile
Secret Rendezvous
Swords to Plowshares
Teshar, Ancestor's Apostle
Anger
Faithless Looting
Squee, Goblin Nabob
Quintorius, Field Historian
Rip Apart
Containment Construct
Fellwar Stone
Millikin
Mind Stone
Patchwork Banner
Perpetual Timepiece
Lorehold Campus
Mistveil Plains
Sacred Peaks
Study Hall
11 Plains
6 Mountain
"""),
    },
}

TYPE_LINE_HINTS = {
    "felothar the steadfast": "Legendary Creature — Human Warrior",
    "jaws of defeat": "Enchantment",
    "tip the scales": "Sorcery",
    "ikra shidiqi the usurper": "Legendary Creature — Snake Wizard",
    "arasta of the endless web": "Legendary Enchantment Creature — Spider",
    "hornet nest": "Creature — Insect",
    "shadrix silverquill": "Legendary Creature — Elder Dragon",
    "sidar kondo of jamuraa": "Legendary Creature — Human Knight",
    "slaughter the strong": "Sorcery",
    "blight pile": "Creature — Phyrexian",
    "crashing drawbridge": "Artifact Creature — Wall",
    "access tunnel": "Land",
    "advanced reconstruction": "Sorcery",
    "fateful tempest": "Instant",
    "naktamun lorespinner": "Creature",
    "staff of the storyteller": "Artifact",
    "wave of reckoning": "Sorcery",
    "ao the dawn sky": "Legendary Creature — Dragon Spirit",
    "claim jumper": "Creature — Rabbit Warrior",
    "monologue tax": "Enchantment",
    "remorseful cleric": "Creature — Spirit Cleric",
    "tocasia s welcome": "Enchantment",
    "atsushi the blazing sky": "Legendary Creature — Dragon Spirit",
    "conspiracy theorist": "Creature — Human Shaman",
    "currency converter": "Artifact",
    "primary research": "Sorcery",
    "secret rendezvous": "Sorcery",
    "anger": "Creature — Incarnation",
    "squee goblin nabob": "Legendary Creature — Goblin",
    "millikin": "Artifact Creature — Construct",
    "patchwork banner": "Artifact",
    "perpetual timepiece": "Artifact",
}


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


MECHANIC_RULES = [
    ("Counters / Proliferate", r"\bcounters?\b|proliferat"),
    ("Lifegain", r"lifegain|life gain|gain life"),
    ("Toughness / Defenders", r"toughness|defenders?|\bwalls?\b"),
    ("Sacrifice / Aristocrats", r"sacrific|aristocrat|death triggers?|\bdies\b"),
    ("Graveyard / Reanimator", r"graveyard|reanimat|recursion|self-mill|dredge"),
    ("Tokens / Go-wide", r"\btokens?\b|go-wide|go wide"),
    ("Lands / Landfall", r"landfall|lands? engine|lands? matter|land sacrifice"),
    ("Artifacts", r"artifacts? matter|artifact engine|modular"),
    ("Enchantments / Auras", r"enchantress|enchantments? matter|\bauras?\b"),
    ("Spellslinger", r"spellslinger|instants? and sorceries|cast spells|noncreature spells"),
    ("Combat / Voltron", r"voltron|combat damage|equipment|commander damage|attack triggers?"),
    ("Control / Interaction", r"control deck|counterspells?|removal suite|interaction|edicts?|pillowfort"),
    ("Ramp / Big Mana", r"big[ -]mana|mana engine|\bramp\b"),
    ("Blink / ETB", r"\betb\b|enters the battlefield|blink|doubling triggers"),
    ("Tribal / Typal", r"tribal|typal|dragons?|spirits?|fungus|treefolk|zombies?|elves?|angels?"),
]


def infer_mechanics(name: str, commander: str, summaries: list, notes: list) -> list[str]:
    text = " ".join(
        [name, commander]
        + [item for stage in summaries for item in (stage or [])]
        + [note or "" for note in notes]
    ).lower()
    return [label for label, pattern in MECHANIC_RULES if re.search(pattern, text)]


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
                clean_text(node.xpath(".//text()")).replace("Keith's variant", "Base Variant")
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
                    "mechanics": infer_mechanics(
                        first_text(cell, ".//h3[1]") or clean_text(checkbox.get("data-name", "")),
                        commander_name,
                        summaries,
                        stage_notes,
                    ),
                    "detailHtml": (
                        safe_fragment(detail_nodes[0], remove_images=True)
                        .replace("Keith's variant", "Base Variant")
                        .replace("Keith’s variant", "Base Variant")
                        if detail_nodes else ""
                    ),
                    "image": "https://api.scryfall.com/cards/named?format=image&version=normal&fuzzy="
                    + commander_name.replace(" ", "+"),
                }
            )

    # Felothar is a strictly more complete toughness-matters commander for the
    # existing option 1b shell: the same damage conversion, defender permission,
    # and an in-command-zone card-selection outlet. Keep Betor at #1, but make
    # option 2 a genuine head-to-head challenger rather than a weaker Doran copy.
    contender = next(variant for variant in variants if variant["id"] == "1b")
    contender.update({
        "name": "Abzan Toughness Fortress — Felothar",
        "commander": "Felothar the Steadfast",
        "manaCost": "{1}{W}{B}{G}",
        "typeLine": "Legendary Creature — Human Warrior",
        "image": "https://api.scryfall.com/cards/named?format=image&version=normal&fuzzy=Felothar+the+Steadfast",
        "ranks": [2, 2, 2],
        "costs": ["$45 total", "$50 total", "$318 total"],
        "tags": ["Rebuild option", "Top challenger"],
        "summaries": [[
            "The precon's face commander turns every wall into an attacker",
            "Felothar also turns spare high-toughness creatures into fresh cards",
            "All three colors, the full defender package, and the commander are already in the box",
        ]] * 3,
    })
    contender["mechanics"] = sorted(set(contender["mechanics"] + ["Defenders", "Toughness matters", "Card filtering"]))
    contender["detailHtml"] = contender["detailHtml"].replace(
        "Abzan Toughness Fortress — Doran", "Abzan Toughness Fortress — Felothar"
    ).replace(
        "Doran, the Siege Tower", "Felothar the Steadfast"
    ).replace(
        "{B}{G}{W}", "{1}{W}{B}{G}", 1
    ).replace(
        "Legendary Creature — Treefolk Shaman", "Legendary Creature — Human Warrior", 1
    ).replace(
        "Each creature assigns combat damage equal to its toughness rather than its power.",
        "Your creatures deal combat damage using toughness instead of power, defenders may attack, and Felothar can turn a spare creature into new cards.",
        1,
    ).replace(
        "$8.18", "in box"
    ).replace(
        "$58 total", "$50 total"
    ).replace(
        "Rewrites a rule of the game for everybody, in a deck where only you benefit. Your 0/5 walls hit for five. The board that was pure defence last turn is lethal this turn without adding a single creature.",
        "Felothar puts the whole plan in the command zone: your walls deal damage with toughness, defenders can attack, and a spare high-toughness creature can be exchanged for a new hand. The defensive board becomes an attack without waiting to draw a separate enabler.",
    ).replace(
        "Doran's effect on an enchantment; also lets defenders attack.",
        "A backup copy of Felothar's toughness-damage effect in case the commander is removed.",
    ).replace(
        "the turn Doran or Assault Formation lands", "the turn Felothar lands"
    ).replace(
        "Still a creature-board deck, so a wipe costs more than in 1A. Add the Unbreakable Formation and Sun Titan or it repeats the original's mistake.",
        "Still a creature-board deck, so protect the wall before committing every defender. Felothar's card filtering improves recovery, but Unbreakable Formation and Sun Titan remain important.",
    ).replace(
        "Still the single most literal expression of the wall-that-swings-for-thirty fantasy, and still the cheapest rebuild here. It drops from first to second on one fact: the reworked 1o now does the same defensive job while drawing cards, and Doran's 14-card ladder is the shortest in the row — it gets to great fast and then has nowhere left to grow.",
        "The real challenger to Betor: Felothar supplies the attack conversion, defender permission, and card filtering from the command zone while already sitting in the sealed deck. Betor remains first for the lifegain-and-reanimation ceiling; Felothar is now close enough to overtake it if reliable wall combat and simpler setup matter more than that ceiling.",
    ).replace(
        "Stage ranks — Base <b>#2</b> · Tuned <b>#2</b> · Maxed <b>#4</b>",
        "Stage ranks — Base <b>#2</b> · Tuned <b>#2</b> · Maxed <b>#2</b>",
    )
    contender["detailHtml"] = contender["detailHtml"].replace(
        '<div class="blk"><h4>Room to grow',
        '<div class="blk"><h4>Why this can challenge #1</h4><ul><li><b>One-card setup:</b> Felothar supplies both toughness-based damage and permission for defenders to attack.</li><li><b>Built-in recovery:</b> sacrifice a high-toughness creature that has outlived its job to see more cards.</li><li><b>No commander purchase:</b> Felothar is the face commander already included in Abzan Armor.</li></ul><p class="method"><a href="https://magic.wizards.com/en/news/feature/tarkir-dragonstorm-release-notes" target="_blank" rel="noopener">Official Felothar rules text</a></p></div><div class="blk"><h4>Room to grow',
        1,
    )
    previous_max_runner_up = next(variant for variant in variants if variant["id"] == "1e")
    previous_max_runner_up["ranks"][2] = 4
    previous_max_runner_up["detailHtml"] = previous_max_runner_up["detailHtml"].replace(
        "Maxed <b>#2</b>", "Maxed <b>#4</b>"
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


def normalized_name(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", clean_text(value).lower()).strip()


def shell_card(name: str, quantity: int, cards: dict, commander: str) -> dict:
    raw_key, raw_card = next(
        (
            (key, card)
            for key, card in cards.items()
            if normalized_name(card.get("name", key)) == normalized_name(name)
        ),
        (normalized_name(name).replace(" ", "-"), {}),
    )
    type_line = clean_text(raw_card.get("type_line", "")) or TYPE_LINE_HINTS.get(normalized_name(name), "")
    if normalized_name(name) in {
        "plains", "island", "swamp", "mountain", "forest", "wastes",
        "snow covered plains", "snow covered island", "snow covered swamp",
        "snow covered mountain", "snow covered forest",
    }:
        type_line = type_line or "Basic Land"
    return {
        "id": f"shell-{raw_key}",
        "name": clean_text(name),
        "quantity": quantity,
        "manaCost": clean_text(raw_card.get("mana_cost", "")),
        "typeLine": type_line,
        "tags": [clean_text(tag) for tag in raw_card.get("tags", [])],
        "isCommander": normalized_name(name) == normalized_name(commander),
        "gameChanger": bool(raw_card.get("game_changer")),
        "isFlexibleSlot": False,
        "image": "https://api.scryfall.com/cards/named?format=image&version=small&fuzzy="
        + clean_text(name).replace(" ", "+"),
    }


def make_starting_shell(deck_id: int, raw: dict, cards: dict) -> tuple[list[dict], str, str]:
    commander = clean_text(raw.get("commander_name", ""))
    official = OFFICIAL_STARTING_SHELLS.get(deck_id)
    if official:
        shell = [shell_card(name, quantity, cards, commander) for name, quantity in official["cards"]]
        return shell, "official-precon", official["source"]

    shell = [
        {
            "id": f"shell-{key}",
            "name": clean_text(card.get("name", key)),
            "quantity": card.get("qty", 1),
            "manaCost": clean_text(card.get("mana_cost", "")),
            "typeLine": clean_text(card.get("type_line", "")),
            "tags": [clean_text(tag) for tag in card.get("tags", [])],
            "isCommander": normalized_name(card.get("name", key)) == normalized_name(commander),
            "gameChanger": bool(card.get("game_changer")),
            "isFlexibleSlot": False,
            "image": "https://api.scryfall.com/cards/named?format=image&version=small&fuzzy="
            + clean_text(card.get("name", key)).replace(" ", "+"),
        }
        for key, card in cards.items()
        if not card.get("is_purchase_item")
    ]
    if not any(card["isCommander"] for card in shell):
        shell.append(shell_card(commander, 1, cards, commander))
    modeled_total = sum(card["quantity"] for card in shell)
    if modeled_total > 100:
        raise RuntimeError(f"Deck {deck_id} modeled shell exceeds 100 cards")
    for slot in range(1, 101 - modeled_total):
        shell.append({
            "id": f"flexible-shell-slot-{slot}",
            "name": f"Unspecified shell card {slot}",
            "quantity": 1,
            "manaCost": "",
            "typeLine": "Unspecified card slot",
            "tags": [],
            "isCommander": False,
            "gameChanger": False,
            "isFlexibleSlot": True,
            "image": "",
        })
    return shell, "custom-shell", ""


def assign_replacements(items: list[dict], starting_shell: list[dict], retained_names: set[str]) -> None:
    """Give every purchase a deterministic one-for-one cut from the 100-card shell."""
    def is_land(card: dict) -> bool:
        name = normalized_name(card.get("name", ""))
        return "land" in clean_text(card.get("typeLine", "")).lower() or name in {
            "plains", "island", "swamp", "mountain", "forest", "wastes",
            "snow covered plains", "snow covered island", "snow covered swamp",
            "snow covered mountain", "snow covered forest",
        }

    candidates = [
        card for card in starting_shell
        if not card.get("isCommander") and not is_land(card) and not card.get("isFlexibleSlot")
    ]
    candidates.sort(key=lambda card: (normalized_name(card["name"]) in retained_names, card["name"]))
    used = set()
    for item in items:
        existing = re.sub(r"^(replaces|swaps in for)\s+", "", clean_text(item.get("replaces", "")), flags=re.I)
        if existing:
            item["replaces"] = existing
            used.add(normalized_name(existing))
            continue
        target = next((card for card in candidates if normalized_name(card["name"]) not in used), None)
        if not target:
            target = next((card for card in starting_shell if card.get("isFlexibleSlot") and normalized_name(card["name"]) not in used), None)
        if target:
            item["replaces"] = target["name"]
            used.add(normalized_name(target["name"]))


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
        summary = summary_by_id.get(deck_id, {})
        cards = raw.get("cards", {})
        required = []
        upgrade = []
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
                upgrade.append(card_view(key, card, "upgrade"))
            else:
                required.append(card_view(key, card, "tuned"))

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
        starting_shell, starting_shell_kind, starting_shell_source = make_starting_shell(deck_id, raw, cards)
        retained_names = {
            normalized_name(card.get("name", key))
            for key, card in cards.items()
            if not card.get("is_purchase_item")
        }
        assign_replacements(required + upgrade + enhance + max_options, starting_shell, retained_names)
        precon_name = clean_text(precon.get("name") or raw.get("deck_name") or "Deck shell")
        precon_price = precon.get("price") or precon.get("target_price")
        precon_item = {
            "id": f"precon-{deck_id}",
            "name": precon_name,
            "quantity": 1,
            "price": precon_price,
            "ceiling": precon.get("ceiling") or raw.get("budget_ceiling"),
            "category": "precon",
            "purpose": clean_text(summary.get("buy_why", ""))
            or f"Starting shell for {clean_text(raw.get('deck_name', 'this build'))}",
            "typeLine": "Preconstructed deck / starting shell",
            "manaCost": "",
            "gameChanger": False,
            "why": clean_text(summary.get("buy_why", "")),
            "buyRank": summary.get("buy_rank"),
            "buyStrategy": clean_text(summary.get("buy_strategy", "")),
            "buyFirst": clean_text(summary.get("buy_first", "")),
            "allIn": summary.get("all_in"),
            "outOfPrint": bool(summary.get("oop")),
            "whereToBuy": "Preconstructed deck / sealed product",
            "tcgplayerUrl": clean_text(precon.get("tcgplayer_url", "")),
            "commanderNote": clean_text(
                (cards.get(raw.get("commander_key")) or {}).get("why", "")
            ),
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
            "buyRank": summary.get("buy_rank"),
            "buyStrategy": clean_text(summary.get("buy_strategy", "")),
            "buyWhy": clean_text(summary.get("buy_why", "")),
            "buyFirst": clean_text(summary.get("buy_first", "")),
            "allIn": summary.get("all_in"),
            "startingShell": starting_shell,
            "startingShellKind": starting_shell_kind,
            "startingShellSource": starting_shell_source,
            "baseCards": [
                {
                    "id": key,
                    "name": clean_text(card.get("name", key)),
                    "quantity": card.get("qty", 1),
                    "typeLine": clean_text(card.get("type_line", "")),
                    "tags": [clean_text(tag) for tag in card.get("tags", [])],
                    "isCommander": "commander" in [
                        clean_text(tag).lower() for tag in card.get("tags", [])
                    ],
                    "gameChanger": bool(card.get("game_changer")),
                }
                for key, card in cards.items()
                if not card.get("is_purchase_item")
            ],
            "planHtml": safe_fragment(
                html.fragment_fromstring(
                    summary.get("info_html", "<div></div>"),
                    create_parent="div",
                ),
                remove_images=True,
            ),
            "precon": precon_item,
            "required": required,
            "upgrade": upgrade,
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
