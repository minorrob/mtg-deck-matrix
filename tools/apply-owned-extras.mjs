import {readFile, writeFile} from "node:fs/promises";

const file = new URL("../data/buy-plans.json", import.meta.url);
const catalog = JSON.parse(await readFile(file, "utf8"));

// The photographed Quintorius cards plus the later additions. Keeping this
// complete list in the catalog lets every browser recognize the user's real
// inventory without depending on whether the one-time importer was opened.
const PHOTO_OWNED_NAMES = [
  "Selfless Spirit", "Serra Paragon", "Remorseful Cleric", "Karmic Guide", "Guardian Scalelord", "Guardian of Faith", "Drumbellower", "Angel of Indemnity", "Moonshaker Cavalry", "Naktamun Lorespinner",
  "Anger", "Kami of Ancient Law", "Venerable Warsinger", "Balefire Liege", "Conspiracy Theorist", "White Orchid Phantom", "Sun Titan", "Skyclave Apparition", "Relic Retriever", "Spirit of Resilience",
  "Patchwork Banner", "Ao, the Dawn Sky", "Claim Jumper", "Containment Construct", "Millikin", "Primary Research", "Tocasia's Welcome", "Monologue Tax", "Quintorius, Field Historian", "Squee, Goblin Nabob", "Teshar, Ancestor's Apostle", "Kirol, History Buff", "Quintorius, Loremaster", "Hofri Ghostforge", "Laelia, the Blade Reforged", "Atsushi, the Blazing Sky", "Excava, the Risen Past", "Bitterthorn, Nissa's Animus",
  "Terramorphic Expanse", "Fields of Strife", "Glittering Massif", "Furycalm Snarl", "Clifftop Retreat", "Battlefield Forge", "Rugged Prairie", "Sunscorched Divide", "Temple of Triumph", "Radiant Summit", "Emeria, the Sky Ruin", "Turbulent Steppe", "Lotus Field", "Command Tower", "Exotic Orchard", "Fabled Passage",
  "Rip Apart", "Faithless Looting", "Secret Rendezvous", "Seize the Spoils", "Tragic Arrogance", "Sevinne's Reclamation", "Wave of Reckoning", "Fellwar Stone", "Arcane Signet", "Sol Ring", "Currency Converter", "Archaeomancer's Map", "Staff of the Storyteller", "Mind Stone", "Perpetual Timepiece", "Swords to Plowshares", "Path to Exile", "Lorehold Charm",
  "Ceaseless Conflict", "Fateful Tempest", "Lorehold Archivist", "Vanguard of the Restless", "Augusta, Order Returned", "Advanced Reconstruction",
  "Gollum, Riddle Master", "Ragged Short Spear", "Lake-town Lookout", "Stony-Voiced Goblins", "Great Fierce Bee", "Mirkwood", "Troll Negotiations", "Giant's Boulder",
  "Bilbo Baggins, Burglar", "Dwarven Mattock", "Dwarven Mauler", "Dwarven Shortsword", "Gundabad Opportunist", "Guardian of the Halls",
  "Lorehold Spirit (Secrets of Strixhaven Commander)"
];

const normalizedName = (value) => String(value || "").split(" // ")[0].toLocaleLowerCase();
const ownedCardNames = new Set(PHOTO_OWNED_NAMES.filter((name) => !name.startsWith("Lorehold Spirit (")).map(normalizedName));

const extras = [
  {
    variantId: "2c", id: "2c-owned-gollum-riddle-master", name: "Gollum, Riddle Master", replaces: "Wall of Omens",
    purpose: "An owned, more interesting value creature: it can add a proliferatable +1/+1 counter, gain life, drain, or draw while keeping the slot useful at several stages of the game.",
    tags: ["Counters / Proliferate", "Card filtering", "Lifegain"]
  },
  {
    variantId: "2c", id: "2c-owned-giants-boulder", name: "Giant's Boulder", replaces: "Chromatic Lantern", temporaryUntil: "Chromatic Lantern",
    purpose: "Temporary four-color fixing you already own. It scries first and can bridge the mana base, but paying one each time makes it weaker than true fixing.",
    tags: ["Counters / Proliferate", "Ramp / Big Mana"]
  },
  {
    variantId: "2c", id: "2c-owned-troll-negotiations", name: "Troll Negotiations", replaces: "Vraska's Contempt", temporaryUntil: "Vraska's Contempt",
    purpose: "Temporary interaction that leaves two permanent +1/+1 counters for Atraxa to proliferate; slower and less reliable than unconditional removal.",
    tags: ["Counters / Proliferate", "Control / Interaction"]
  },
  {
    variantId: "3e", id: "3e-owned-mirkwood", name: "Mirkwood", replaces: "Foul Orchard",
    purpose: "An owned Golgari land that can sacrifice itself when its creature condition is met, strictly improving the modeled Foul Orchard slot by giving Gitrog another way to put a land into the graveyard.",
    tags: ["Lands / Landfall", "Graveyard / Reanimator"]
  },
  {
    variantId: "5o", id: "5o-owned-ragged-short-spear", name: "Ragged Short Spear", replaces: "Monologue Tax",
    purpose: "Discard one, draw two feeds the graveyard plan; with Bag of Holding the discarded card leaves the graveyard and creates a Quintorius Spirit trigger.",
    tags: ["Graveyard / Reanimator", "Card filtering", "Tokens / Go-wide"]
  },
  {
    variantId: "6c", id: "6c-owned-laketown-lookout", name: "Lake-town Lookout", replaces: "Wall of Blossoms",
    purpose: "A one-power body Nethroi reanimates cheaply; dying recruits for card filtering and can leave another useful body behind.",
    tags: ["Graveyard / Reanimator", "Card filtering"]
  },
  {
    variantId: "6c", id: "6c-owned-stony-voiced-goblins", name: "Stony-Voiced Goblins", replaces: "Wall of Blossoms",
    purpose: "A more disruptive alternative for the same low-power Wall of Blossoms slot: Nethroi can repeatedly reanimate its each-opponent discard trigger.",
    tags: ["Graveyard / Reanimator", "Control / Interaction"]
  },
  {
    variantId: "6c", id: "6c-owned-great-fierce-bee", name: "Great Fierce Bee", replaces: "Luminous Broodmoth", temporaryUntil: "Luminous Broodmoth",
    purpose: "Temporary death-value support you already own. Its repeated scrying smooths draws, but it does not return creatures the way Luminous Broodmoth does.",
    tags: ["Graveyard / Reanimator", "Card filtering"]
  }
];

// Correct the earlier image transcription before inserting the audited card.
catalog.plans["5o"].enhance = (catalog.plans["5o"].enhance || []).filter((card) => !["5o-owned-augusta-order-reformed", "5o-owned-augusta-order-returned", "excava-the-risen-past"].includes(card.id) && card.name !== "Augusta, Order Reformed");

for (const extra of extras) {
  const plan = catalog.plans[extra.variantId];
  if (!plan) throw new Error(`Unknown variant: ${extra.variantId}`);
  const item = {
    id: extra.id,
    name: extra.name,
    quantity: 1,
    price: null,
    ceiling: null,
    category: "enhance",
    stage: "Enhance",
    purpose: extra.purpose,
    typeLine: "",
    manaCost: "",
    gameChanger: false,
    why: extra.purpose,
    whyPrimary: extra.purpose,
    whyOptional: "Already owned; choose it only when it improves or temporarily completes this exact slot.",
    alternateReason: "",
    alternateTradeoff: extra.temporaryUntil ? `Temporary until ${extra.temporaryUntil} is found.` : "",
    replaces: extra.replaces,
    temporaryUntil: extra.temporaryUntil || null,
    ownedExtra: true,
    tags: extra.tags,
    whereToBuy: "Already owned",
    tcgplayerUrl: "",
    brief: {power: null, ease: null, fun: null, value: "Already owned", fit: extra.purpose},
    image: "",
    oracleText: "",
    keywords: [],
    colorIdentity: [],
    commanderLegal: true
  };
  const index = plan.enhance.findIndex((candidate) => candidate.id === item.id);
  if (index >= 0) plan.enhance[index] = {...plan.enhance[index], ...item};
  else plan.enhance.push(item);
}

// Farewell is a current Game Changer. Its Max classification is rules/capability-driven,
// even when its market price is below the Enhance dollar limit.
for (const plan of Object.values(catalog.plans)) {
  const farewell = (plan.enhance || []).find((card) => card.name === "Farewell") || (plan.max || []).find((card) => card.name === "Farewell");
  if (farewell) {
    plan.enhance = plan.enhance.filter((card) => card.id !== farewell.id);
    const maxFarewell = {...farewell, category: "max", stage: "Maxxed", gameChanger: true, maxReason: "Current Game Changer: a flexible, near-total exile reset that uses one of the three Bracket 3 slots."};
    const index = plan.max.findIndex((card) => card.id === maxFarewell.id);
    if (index >= 0) plan.max[index] = maxFarewell;
    else plan.max.push(maxFarewell);
  }
}

// Bracket 3 limits the final selection to three Game Changers, not the number of
// alternatives the app may offer. Keep Breach as an on-theme ceiling choice and
// let the checked-card guard enforce the final-deck cap.
const quintorius = catalog.plans["5o"];
if (!quintorius.max.some((card) => card.name === "Underworld Breach")) {
  quintorius.max.unshift({
    id: "underworld-breach",
    name: "Underworld Breach",
    quantity: 1,
    price: 10.41,
    ceiling: 13.5,
    category: "max",
    stage: "Maxxed",
    purpose: "Every fair escape cast is a card leaving your graveyard and another Quintorius Spirit trigger.",
    replaces: "Goblin Bombardment",
    gameChanger: true,
    tags: ["Graveyard / Reanimator", "Game Changer", "Late combo watch"],
    why: "The most on-theme Game Changer available to the deck when used as a fair recursion engine.",
    whyPrimary: "The most on-theme Game Changer available to the deck when used as a fair recursion engine.",
    whyOptional: "Choose it as one of at most three selected Game Changers and avoid compact early-loop packages.",
    alternateReason: "Each escape cast advances both the graveyard and Spirit-token engines.",
    alternateTradeoff: "Swaps in for Goblin Bombardment; do not pair it with an intentional pre-turn-seven loop.",
    whereToBuy: "Singles case",
    tcgplayerUrl: "",
    brief: {power: 5, ease: 4, fun: 4, value: "High strategic value", fit: "Fair escape casts directly trigger Quintorius."},
    image: "",
    oracleText: "",
    keywords: [],
    colorIdentity: [],
    commanderLegal: true,
    maxReason: "The deck's most synergistic recursion Game Changer; it maximizes Spirit production when selected as one of the three legal slots without an early-loop package."
  });
}

function moveToMax(variantId, name, maxReason, comboTag = "") {
  const plan = catalog.plans[variantId];
  const source = plan.enhance.find((card) => card.name === name) || plan.max.find((card) => card.name === name);
  if (!source) throw new Error(`Missing ${name} in ${variantId}`);
  plan.enhance = plan.enhance.filter((card) => card.id !== source.id);
  const moved = {
    ...source,
    category: "max",
    stage: "Maxxed",
    maxReason,
    tags: [...new Set([...(source.tags || []), ...(comboTag ? [comboTag] : [])])]
  };
  const index = plan.max.findIndex((card) => card.id === moved.id);
  if (index >= 0) plan.max[index] = moved;
  else plan.max.push(moved);
}

moveToMax("4a", "Peregrine Drake", "With Deadeye Navigator this becomes a repeatable blink-and-mana engine. It belongs at the capability ceiling and must be played as a turn-seven-or-later line.", "Late two-card infinite combo");
moveToMax("6f", "Peregrine Drake", "With Deadeye Navigator this becomes a repeatable blink-and-mana engine. It belongs at the capability ceiling and must be played as a turn-seven-or-later line.", "Late two-card infinite combo");
moveToMax("6f", "Agent of Treachery", "Yarok and the blink package turn one theft effect into repeatable permanent control, making this a true high-capability ceiling card.");
moveToMax("3c", "Ancient Greenwarden", "Aesi turns the extra landfall trigger into another commander draw while Greenwarden also replays lands from the graveyard, compounding both halves of the deck's engine.");
moveToMax("3o", "Ancient Greenwarden", "Obuun's counter trigger and every other landfall payoff fire twice while Greenwarden replays lands from the graveyard, defining the deck's capability ceiling.");
moveToMax("6d", "Kinnan, Bonder Prodigy", "Doubles the output of the deck's nonland mana sources and turns stored big mana into repeatable creature deployment, directly maximizing Kruphix's central engine.");
moveToMax("2e", "Alhammarret's Archive", "Doubles both Oloro's central life resource and every extra draw, compounding the two engines that define the deck's longevity ceiling.");
moveToMax("5f", "Kinsbaile Cavalier", "One removable tribal body doubles the combat damage of every Knight and Knight token, making it Aryel's direct go-wide finishing ceiling.");
moveToMax("1o", "Branching Evolution", "The cleanest multiplier for Betor and every other +1/+1-counter source, doubling the deck's central resource rather than merely improving one slot.");
moveToMax("1a", "Pitiless Plunderer", "Every expendable Saproling becomes mana for Slimefoot's sacrifice engine, allowing the deck to compound deaths, tokens, and drain triggers in one turn.");
moveToMax("1a", "Skullclamp", "Turns Slimefoot's 1/1 Saprolings into the strongest repeatable draw engine available to the deck.");
moveToMax("2a", "Hullbreaker Horror", "A flash, uncounterable control engine that turns every later noncreature spell into protection or board control and supports late resource loops.", "Late combo watch");
moveToMax("2b", "Deserted Temple", "Untapping Cabal Coffers compounds the mono-black mana engine and lets the deck convert one land package into its true big-mana ceiling.");
moveToMax("4b", "Cyberdrive Awakener", "Converts Shorikai's accumulated artifact board into an evasive one-card finishing attack, giving the engine a direct capability-ceiling payoff.");
moveToMax("4e", "Deadeye Navigator", "Repeatedly rebuying Roon's best enter-the-battlefield creatures is the blink deck's value ceiling; keep future Drake or Palinchron additions out of early-loop packages.", "Combo watch");
moveToMax("5o", "Skullclamp", "The best repeatable draw engine available to a deck built to produce and sacrifice small Spirit tokens.");
moveToMax("5o", "Sunforger", "With Mistveil Plains and the Boros instant suite, this becomes a reusable tutor, interaction, and protection engine rather than a one-shot equipment upgrade.");
moveToMax("5e", "Rhys the Redeemed", "Provides repeatable token doubling from a one-mana body, directly maximizing Trostani's populate, lifegain, and go-wide engines.");
moveToMax("6f", "Woodland Bellower", "Yarok doubles its enter-the-battlefield trigger, tutoring two different green creatures of mana value three or less directly onto the battlefield.");

const priorTier3Exclusions = catalog.tier3Excluded || [];
catalog.tier3Excluded = [
  ["2o", "Blowfly Infestation", "The required -1/-1-counter package can turn this into a repeatable or forced death-and-token loop before turn seven."],
  ["4a", "Strionic Resonator", "Brago plus two mana from blinkable rocks can repeat the combat trigger around turn five, outside strict Bracket 3 intent."]
].map(([variantId, name, reason]) => {
  const plan = catalog.plans[variantId];
  const source = plan.enhance.find((card) => card.name === name) || plan.max.find((card) => card.name === name) || priorTier3Exclusions.find((card) => card.variantId === variantId && card.name === name);
  if (!source) throw new Error(`Missing Tier 3 exclusion ${name} in ${variantId}`);
  plan.enhance = plan.enhance.filter((card) => card.id !== source.id);
  plan.max = plan.max.filter((card) => card.id !== source.id);
  return {...source, variantId, reason, category: "tier3-excluded"};
});

// Exquisite Blood has several redundant two-card drain partners already in the
// Liesa Tuned list and can win before Bracket 3's intended turn window.
catalog.plans["1c"].max = catalog.plans["1c"].max.filter((card) => card.name !== "Exquisite Blood");

// Current Game Changer list after the October 2025 removals and February 2026
// additions. Apply it across every role so shell and Tuned copies consume the
// same slots as Max copies, while formerly listed cards such as Kinnan do not.
const GAME_CHANGERS = new Set([
  "Drannith Magistrate", "Humility", "Serra's Sanctum", "Smothering Tithe", "Enlightened Tutor", "Teferi's Protection",
  "Consecrated Sphinx", "Cyclonic Rift", "Force of Will", "Fierce Guardianship", "Gifts Ungiven", "Intuition", "Mystical Tutor",
  "Narset, Parter of Veils", "Rhystic Study", "Thassa's Oracle", "Ad Nauseam", "Bolas's Citadel", "Braids, Cabal Minion",
  "Demonic Tutor", "Imperial Seal", "Necropotence", "Opposition Agent", "Orcish Bowmasters", "Tergrid, God of Fright",
  "Vampiric Tutor", "Gamble", "Jeska's Will", "Underworld Breach", "Crop Rotation", "Gaea's Cradle", "Natural Order",
  "Seedborn Muse", "Survival of the Fittest", "Worldly Tutor", "Aura Shards", "Coalition Victory", "Grand Arbiter Augustin IV",
  "Notion Thief", "Ancient Tomb", "Chrome Mox", "Field of the Dead", "Glacial Chasm", "Grim Monolith", "Lion's Eye Diamond",
  "Mana Vault", "Mishra's Workshop", "Mox Diamond", "Panoptic Mirror", "The One Ring", "The Tabernacle at Pendrell Vale",
  "Farewell", "Biorhythm"
]);
for (const plan of Object.values(catalog.plans)) {
  for (const collection of [plan.startingShell || [], plan.required || [], plan.enhance || [], plan.max || []]) {
    for (const card of collection) card.gameChanger = GAME_CHANGERS.has(card.name.split(" // ")[0]);
  }
}

const MAX_CAPABILITY = {
  "Grave Pact": "Turns every expendable creature into repeatable, asymmetric creature control across all opponents.",
  "Parallel Lives": "Doubles the deck's central token engine and compounds every later token payoff.",
  "Archangel of Thune": "Converts each lifegain event into team-wide permanent growth, creating a fast scaling finisher.",
  "Earthcraft": "Converts the creature/token board into explosive mana; with Ghave and Cathars' Crusade it creates a late three-card infinite token-and-counter loop that must wait until turn seven or later.",
  "Doubling Season": "Doubles both token production and counter placement, maximizing two central engines at once.",
  "Anointed Procession": "Doubles the primary token plan and compounds every sacrifice, populate, and go-wide payoff.",
  "Cabal Coffers": "Provides the mana ceiling needed to cast and recur the deck's largest threats in the same turn cycle.",
  "Bitterblossom": "Supplies a resilient body every upkeep for sacrifice, equipment, and attrition engines.",
  "Crucible of Worlds": "Turns fetches and sacrificed lands into a repeatable land engine instead of one-shot value.",
  "Exploration": "Raises the land engine's velocity by converting extra land draws into immediate development.",
  "Portal to Phyrexia": "Combines a major sacrifice swing with a repeatable reanimation engine at the deck's top end.",
  "Sword of Feast and Famine": "Adds protection, combat pressure, hand disruption, and a full mana reset from one equipment slot.",
  "Sigarda's Aid": "Makes the equipment plan operate at instant speed and collapses equip costs when pieces enter.",
  "Hammer of Nazahn": "Auto-equips later pieces while granting indestructible, protecting and accelerating the Voltron threat.",
  "Cloudstone Curio": "With Yarok, Peregrine Drake, and five ordinary one-mana lands it creates an infinite cast/ETB loop. That loop is mana-neutral unless another effect amplifies the lands, and it must wait until turn seven or later.",
  "Toxrill, the Corrosive": "Compresses board control, token production, and card draw into one late-game engine."
};
for (const plan of Object.values(catalog.plans)) for (const card of plan.max || []) {
  if (MAX_CAPABILITY[card.name]) card.maxReason = MAX_CAPABILITY[card.name];
  else card.maxReason ||= (card.gameChanger
    ? "Uses one of the deck's three Bracket 3 Game Changer slots to maximize its central strategy."
    : `Tier 3 capability choice: ${card.whyPrimary || card.why || card.purpose || "high-impact synergy at the deck's intended power ceiling."}`);
}
for (const [variantId, name, comboTag] of [
  ["1e", "Earthcraft", "Late three-card infinite combo"],
  ["6f", "Cloudstone Curio", "Late three-card infinite combo"]
]) {
  const card = catalog.plans[variantId].max.find((candidate) => candidate.name === name);
  if (card) card.tags = [...new Set([...(card.tags || []), comboTag])];
}

catalog.salvage = [
  ["Bilbo Baggins, Burglar", "No current build has a slot where this cantrip body preserves an important engine role."],
  ["Dwarven Mattock", "Equipment package is below the efficiency and synergy needed by the selected decks."],
  ["Dwarven Mauler", "Creature does not preserve a needed role in the current six-deck plans."],
  ["Dwarven Shortsword", "Equipment is too low-impact for the current combat and engine plans."],
  ["Gundabad Opportunist", "No selected deck can exploit it enough to justify a final-100 slot."],
  ["Guardian of the Halls", "Defensive body does not outperform the dedicated defender or graveyard pieces already modeled."]
].map(([name, reason], index) => ({id: `salvage-${index + 1}`, name, reason, ownedExtra: true, category: "salvage"}));

// Existing appearances are already legal, role-mapped choices (or starting-shell
// cards). Flag them as owned instead of duplicating a card into a second slot,
// which would make a singleton lineup invalid.
for (const plan of Object.values(catalog.plans)) {
  for (const collection of [plan.startingShell || [], plan.required || [], plan.upgrade || [], plan.enhance || [], plan.max || []]) {
    for (const card of collection) {
      if (!ownedCardNames.has(normalizedName(card.name))) continue;
      card.ownedExtra = true;
      card.whereToBuy = "Already owned";
    }
  }
}

catalog.ownedExtras = [...new Set([
  ...PHOTO_OWNED_NAMES,
  "Bilbo Baggins, Burglar // Take a Glance",
  "Naktamun Lorespinner // Wheel of Fortune",
  "Kirol, History Buff // Pack a Punch",
  "Lorehold Archivist // Restore Relic"
])];
catalog.enhanceDefinition = "Optional, role-preserving improvements or owned substitutions costing no more than $15.";
catalog.maxDefinition = "The strongest configuration that pushes the deck to the legal bounds of Commander Tier 3; classification is based on capability, synergy, and Tier 3 rules rather than card price.";

await writeFile(file, `${JSON.stringify(catalog, null, 2)}\n`);
console.log(`Applied ${extras.length} owned deck options and ${catalog.salvage.length} Salvage cards.`);
