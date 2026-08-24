(function (root, factory) {
  "use strict";
  const lineup = (typeof module === "object" && module.exports && typeof require === "function")
    ? require("./lineup-model.js")
    : root && root.MtgLineupModel;
  const api = factory(lineup);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.MtgComplianceModel = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (Lineup) {
  "use strict";

  if (!Lineup) throw new Error("Compliance model requires the lineup model");

  const normalize = Lineup.normalizeName;

  const BASIC_LANDS = new Set(["plains", "island", "swamp", "mountain", "forest", "wastes", "snow covered plains", "snow covered island", "snow covered swamp", "snow covered mountain", "snow covered forest"]);
  const TIER3_EARLY_COMBO_PAIRS = [
    ["Thassa's Oracle", "Demonic Consultation"],
    ["Thassa's Oracle", "Tainted Pact"],
    ["Heliod, Sun-Crowned", "Walking Ballista"],
    ["Isochron Scepter", "Dramatic Reversal"],
    ["Devoted Druid", "Vizier of Remedies"],
    ["Bloodchief Ascension", "Mindcrank"],
    ["Iona, Shield of Emeria", "Painter's Servant"]
  ];

  // Cards sourced outside the curated buy plans (Scryfall lookups, generated decks,
  // simulator swaps) carry no curated rule tags, so the bracket rules that regex on
  // tag text would silently pass them. This derives only the tags that a single
  // card's own text can prove: mass land denial and repeatable extra turns.
  // Combo tags stay curated (plus TIER3_EARLY_COMBO_PAIRS for known pairs) because
  // combo participation is a property of a pair, not one card's oracle text.
  function deriveComplianceTags(card) {
    const text = `${card.oracleText || ""}`.toLowerCase().replace(/[’]/g, "'");
    const tags = [];
    if (/destroy all lands|destroy (?:all|each) [^.]{0,40}lands|each player sacrifices [^.]{0,20}lands|lands (?:don't|do not) untap during/.test(text)) tags.push("mass land denial");
    if (/take (?:an|one|two|x) extra turns?|extra turn after this one/.test(text)) {
      const repeatable = /buyback|shuffle [^.]{0,40}into (?:its owner's|your) library|return [^.]{0,40}from your graveyard to your hand/.test(text);
      if (repeatable) tags.push("extra turn loop risk");
    }
    return tags;
  }

  function mergeByName(literalCards, resolveMeta = () => ({})) {
    const cards = new Map();
    const addCard = (item, source) => {
      const key = normalize(item.name);
      const existing = cards.get(key);
      const quantity = Number(item.quantity || 1);
      if (existing) existing.quantity += quantity;
      else cards.set(key, {
        name: item.name,
        quantity,
        typeLine: item.typeLine || resolveMeta(item)?.typeLine || "Unknown",
        tags: item.tags || [],
        isCommander: Boolean(item.isCommander || (item.tags || []).some((tag) => String(tag).toLowerCase() === "commander")),
        gameChanger: Boolean(item.gameChanger),
        isFlexibleSlot: Boolean(item.isFlexibleSlot),
        colorIdentity: item.colorIdentity || resolveMeta(item)?.colorIdentity || [],
        commanderLegal: item.legalities?.commander || (item.commanderLegal === false ? "not_legal" : "legal"),
        source
      });
    };
    literalCards.forEach((item) => addCard(item, item.lineupKind === "shell" ? "starting shell" : "selected option"));
    return Array.from(cards.values());
  }

  function evaluateCardList(literalCards, options = {}) {
    const baseIssues = options.baseIssues || [];
    const included = mergeByName(literalCards, options.resolveMeta || (() => ({})));
    const total = included.reduce((sum, card) => sum + card.quantity, 0);
    const types = {};
    const typeBucket = (line) => ["Land", "Creature", "Artifact", "Enchantment", "Instant", "Sorcery", "Planeswalker", "Battle"].find((type) => String(line).includes(type)) || "Other";
    included.forEach((card) => {
      const bucket = typeBucket(card.typeLine);
      types[bucket] = (types[bucket] || 0) + card.quantity;
    });
    const common = [...baseIssues];
    if (total !== 100) common.push({card: "Deck list", rule: `Commander requires exactly 100 cards; this selection contains ${total}.`, detail: total < 100 ? `Add or restore ${100 - total} card${100 - total === 1 ? "" : "s"}.` : `Cut ${total - 100} card${total - 100 === 1 ? "" : "s"}.`});
    const commanders = included.reduce((sum, card) => sum + (card.isCommander ? card.quantity : 0), 0);
    if (commanders !== 1) common.push({card: "Commander slot", rule: `Exactly one commander is expected; ${commanders} are identified in the modeled list.`, detail: "Confirm the commander and partner/background configuration."});
    included.filter((card) => card.quantity > 1 && !card.isFlexibleSlot && !/\bBasic Land\b/i.test(card.typeLine) && !BASIC_LANDS.has(normalize(card.name))).forEach((card) => common.push({card: card.name, rule: `Singleton rule: ${card.quantity} copies are modeled.`, detail: "Only basic lands and cards with explicit exceptions may repeat."}));
    const commander = included.find((card) => card.isCommander);
    const commanderIdentity = new Set((commander?.colorIdentity || []).map((color) => String(color).toUpperCase()));
    included.filter((card) => card.commanderLegal !== "legal").forEach((card) => common.push({card: card.name, rule: "This card is not Commander legal.", detail: "Replace it with a Commander-legal card."}));
    included.filter((card) => (card.colorIdentity || []).some((color) => !commanderIdentity.has(String(color).toUpperCase()))).forEach((card) => common.push({card: card.name, rule: "Color identity falls outside the commander's colors.", detail: "Choose a card whose full color identity fits the commander."}));

    const selectedGameChangers = included.filter((card) => card.gameChanger);
    const tagsFor = (card) => (card.tags || []).map((tag) => String(tag).toLowerCase()).join(" ");
    const massLand = included.filter((card) => /mass land|land destruction/.test(tagsFor(card)));
    const extraTurns = included.filter((card) => /extra turn|turn loop/.test(tagsFor(card)));
    const combos = included.filter((card) => /infinite combo|two.card combo/.test(tagsFor(card)));
    const includedNames = new Set(included.map((card) => normalize(card.name)));
    const earlyPairs = TIER3_EARLY_COMBO_PAIRS.filter((pair) => pair.every((name) => includedNames.has(normalize(name))));
    const tier2 = [...common];
    selectedGameChangers.forEach((card) => tier2.push({card: card.name, rule: "Tier 2 permits no Game Changers.", detail: "Remove it or evaluate the deck for Tier 3."}));
    combos.forEach((card) => tier2.push({card: card.name, rule: "Tier 2 permits no intentional two-card infinite combo.", detail: "Remove the combo piece or use a higher tier."}));
    massLand.forEach((card) => tier2.push({card: card.name, rule: "Tier 2 permits no mass land denial.", detail: "Replace this effect."}));
    extraTurns.forEach((card) => tier2.push({card: card.name, rule: "Tier 2 should not chain or loop extra turns.", detail: "Keep extra-turn effects sparse and non-repeatable."}));
    earlyPairs.forEach((pair) => tier2.push({card: pair.join(" + "), rule: "Tier 2 permits no intentional two-card combo package.", detail: "Remove one of these paired pieces."}));
    const tier3 = [...common];
    if (selectedGameChangers.length > 3) selectedGameChangers.forEach((card) => tier3.push({card: card.name, rule: `Tier 3 allows up to three Game Changers; ${selectedGameChangers.length} are selected.`, detail: "Remove Game Changers until no more than three remain."}));
    included.filter((card) => /early combo/.test(tagsFor(card))).forEach((card) => tier3.push({card: card.name, rule: "Tier 3 permits no intentional early-game two-card infinite combo.", detail: "Remove or slow the combo."}));
    earlyPairs.forEach((pair) => tier3.push({card: pair.join(" + "), rule: "Tier 3 permits no intentional early-game two-card combo package.", detail: "Remove one of these paired pieces."}));
    massLand.forEach((card) => tier3.push({card: card.name, rule: "Tier 3 permits no mass land denial.", detail: "Replace this effect."}));
    extraTurns.forEach((card) => tier3.push({card: card.name, rule: "Tier 3 should not chain or loop extra turns.", detail: "Keep extra-turn effects sparse and non-repeatable."}));
    const lands = types.Land || 0;
    const compositionWarnings = [];
    if (lands < 33) compositionWarnings.push(`${lands} lands is below the usual 33–42 starting range; review ramp, curve, and MDFCs before play.`);
    if (lands > 42) compositionWarnings.push(`${lands} lands is above the usual 33–42 starting range; confirm the deck's land-matters plan needs it.`);
    return {cards: included, total, types, tier2, tier3, compositionWarnings, selectedGameChangers};
  }

  return {
    BASIC_LANDS,
    TIER3_EARLY_COMBO_PAIRS,
    deriveComplianceTags,
    mergeByName,
    evaluateCardList
  };
});
